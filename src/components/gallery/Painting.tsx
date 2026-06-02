"use client";

import { useRef, useMemo, useEffect, useState } from "react";
import { useLoader, useFrame, useThree } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import { TextureLoader } from "three";
import { FrameGroup, getFrameDepth, getFrameWidth, FRAME_REBATE } from "./FrameBuilders";
import Nameplate from "./Nameplate";
import PaintingLighting from "./PaintingLighting";
import { useTuningStore } from "./tuningStore";
import { useLightmapStore } from "./lightmapStore";
import { getPaintingTransform, getFacingDir } from "@/lib/gallery-config";
import type { Artwork } from "@/lib/sanity";
import { urlFor } from "@/lib/sanity";

// Opt-in perf experiment: bake the per-painting picture-light into a static wall
// decal + an in-shader frame glint, and drop the real SpotLight. Driven by the
// tuningStore `bakePool` flag (initialised from `?bake`, runtime-toggleable for A/B).

interface PaintingProps {
  artwork: Artwork;
  index: number;
  saturationRefs: React.MutableRefObject<{ [key: number]: { value: number } }>;
  paintingDimsRef: React.MutableRefObject<{ [index: number]: { pw: number; ph: number; frameWidth: number; texWidth?: number; loadedW?: number; loadedH?: number } }>;
  mode: "guided" | "unguided";
  // True for the one painting being inspected — loads an adaptive high-res
  // master and cross-fades it in; released when inspection ends.
  hiRes?: boolean;
  onReveal?: (index: number, artwork: Artwork) => void;
  onClick?: (index: number, artwork: Artwork) => void;
  onPlaqueClick?: (index: number, artwork: Artwork) => void;
}

// Master pixel width encoded in the Sanity asset ref (…-<W>x<H>-<ext>). Sanity
// never upscales, so requesting more than this just wastes bytes.
function masterWidthOf(artwork: Artwork): number | null {
  const ref: string | undefined = artwork.image?.asset?._ref;
  const m = ref?.match(/-(\d+)x(\d+)-/);
  return m ? parseInt(m[1], 10) : null;
}

// The high-res width to request for the canvas you're inspecting, adapted to the
// device so phones and slow links never pull (or try to hold) a huge texture:
//   • up to 8192 ("8K") on the long edge for desktops, so deep zoom stays crisp
//     even on hi-DPI screens (the inspect camera caps zoom at this texture's 1:1),
//   • stepped down by screen size × DPR, device memory and network,
//   • clamped to the GPU's max texture size AND the master's own pixel width —
//     Sanity never upscales, so each painting only ever loads what it actually
//     has (which is also what makes deep-master works zoom deeper than small ones).
// Only the inspected painting loads this and it's freed on exit, so a single
// large texture is resident at a time.
function pickHiResWidth(gl: THREE.WebGLRenderer, artwork: Artwork): number {
  let cap = 8192;
  if (typeof window !== "undefined") {
    const dpr = Math.min(window.devicePixelRatio || 1, 2); // canvas renders at ≤2× anyway
    const longEdge = Math.max(window.screen?.width || 0, window.screen?.height || 0) * dpr;
    if (longEdge && longEdge <= 1900) cap = Math.min(cap, 2048); // phones
    else if (longEdge && longEdge <= 2600) cap = Math.min(cap, 3072); // large phones / small tablets
    const mem = (navigator as { deviceMemory?: number }).deviceMemory;
    if (typeof mem === "number" && mem > 0 && mem <= 4) cap = Math.min(cap, 2560);
    const conn = (navigator as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (conn?.saveData) cap = Math.min(cap, 2048);
    if (typeof conn?.effectiveType === "string" && /2g|3g/.test(conn.effectiveType)) cap = Math.min(cap, 2048);
  }
  cap = Math.min(cap, gl?.capabilities?.maxTextureSize || 4096);
  const master = masterWidthOf(artwork);
  if (master) cap = Math.min(cap, master);
  return Math.round(cap);
}

// The wall-view (roam) texture width. A painting on a phone screen is small, and
// every painting holds its base texture resident at once — so many full 2048²
// textures can exhaust a phone's GPU memory and leave a frame with a blank canvas.
// Phones load a lighter base for the room; the crisp adaptive master still loads
// for the single work being inspected (pickHiResWidth), so close-up quality is
// unchanged.
function pickBaseWidth(): number {
  if (typeof window === "undefined") return 2048;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const longEdge = Math.max(window.screen?.width || 0, window.screen?.height || 0) * dpr;
  if (longEdge && longEdge <= 1900) return 1280; // phones
  if (longEdge && longEdge <= 2600) return 1600; // large phones / small tablets
  return 2048;
}

function SaturationMaterial({
  base,
  hiRes,
  reveal,
  saturationRef,
  mode,
}: {
  base: THREE.Texture;
  hiRes: THREE.Texture | null;
  reveal: boolean;
  saturationRef: React.MutableRefObject<{ value: number }>;
  mode: string;
}) {
  // Own the extra uniforms so they update synchronously (the saturation-reveal and
  // hi-res cross-fade animate these every frame); onBeforeCompile wires these same
  // objects into the material's shader.
  const uniforms = useMemo(() => ({
    hiMap: { value: hiRes ?? base },
    hiMix: { value: 0 },
    saturation: { value: mode === "unguided" ? 1.0 : 0.0 },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- textures swap in place below
  }), [mode]);

  // The canvas always shows its true, unmodified file colour — both roaming and
  // close up — never tinted or dimmed by the room's light (only the wall + frame
  // around it are lit, by the picture spotlight). MeshBasic is unlit; toneMapped
  // =false bypasses exposure/tone-map so the pixels match the source, while three
  // still colour-manages sRGB in/out so it is not washed. Built once and reused.
  const material = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ map: base, toneMapped: false });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.hiMap = uniforms.hiMap;
      shader.uniforms.hiMix = uniforms.hiMix;
      shader.uniforms.saturation = uniforms.saturation;
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          "uniform sampler2D hiMap;\nuniform float hiMix;\nuniform float saturation;\n#include <common>",
        )
        .replace(
          "#include <map_fragment>",
          `#include <map_fragment>
          {
            vec4 sv_hi = texture2D( hiMap, vMapUv );
            vec3 sv_blend = mix( diffuseColor.rgb, sv_hi.rgb, hiMix );
            float sv_gray = dot( sv_blend, vec3( 0.299, 0.587, 0.114 ) );
            diffuseColor.rgb = mix( vec3( sv_gray ), sv_blend, saturation );
          }`,
        );
    };
    return m;
  }, [uniforms, base]);

  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => { material.map = base; }, [base, material]);
  useEffect(() => { uniforms.hiMap.value = hiRes ?? base; }, [hiRes, base, uniforms]);
  useEffect(() => { saturationRef.current = uniforms.saturation; }, [saturationRef, uniforms.saturation]);

  // Cross-fade the hi-res in (~0.2s) once it's loaded and we're inspecting, so
  // the canvas eases into focus instead of popping. hiMap stays pinned to the
  // base when there's no hi-res, so fading back out is a no-op (base→base).
  const target = reveal && hiRes ? 1 : 0;
  useFrame((_, delta) => {
    const u = uniforms.hiMix;
    u.value = THREE.MathUtils.damp(u.value, target, 15, Math.min(delta, 0.1));
    if (Math.abs(target - u.value) < 0.002) u.value = target;
  });

  return <primitive object={material} attach="material" />;
}

// A faked contact/drop shadow under the frame's bottom edge. The picture
// spotlights don't cast real shadows (one shadow map per painting would tank the
// fill-rate-bound scene), so instead we lay a soft dark gradient on the wall just
// below each frame. MultiplyBlending darkens the wallpaper multiplicatively, so
// the damask pattern shows THROUGH the shadow instead of being flattened to grey.
// Darkest right under the frame, fading down and feathered at the sides.
function FrameShadow({ pw, ph, frameWidth }: { pw: number; ph: number; frameWidth: number }) {
  const strength = useTuningStore((s) => s.frameShadow); // live-tunable via ?tune
  const drop = useTuningStore((s) => s.frameShadowDrop); // how far it falls below the frame
  // Widen the dark core a touch past the frame so it doesn't cut off at the corners.
  const W = pw + frameWidth * 2 + 0.04;
  const topY = -(ph / 2 + frameWidth); // frame's bottom edge in local space
  // Build the material once; update strength via its uniform so dragging the panel
  // doesn't recompile the shader.
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        // Multiply (dst * src) without MultiplyBlending's premultiplied-alpha
        // requirement: where the shader outputs white the wall is unchanged, where
        // it outputs <1 the wall (damask and all) is darkened.
        blending: THREE.CustomBlending,
        blendEquation: THREE.AddEquation,
        blendSrc: THREE.ZeroFactor,
        blendDst: THREE.SrcColorFactor,
        uniforms: { uStrength: { value: strength } },
        vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
        fragmentShader: `
          varying vec2 vUv; uniform float uStrength;
          void main(){
            float vert = pow(clamp(vUv.y, 0.0, 1.0), 0.9);                 // darkest just under the frame, fading down (gentle, so the body stays dark)
            float side = smoothstep(0.0, 0.12, vUv.x) * smoothstep(0.0, 0.12, 1.0 - vUv.x);
            float s = uStrength * vert * side;
            gl_FragColor = vec4(vec3(1.0 - s), 1.0);                       // 1.0 = no change; <1 darkens (multiply)
          }`,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- strength updates via the uniform below
    [],
  );
  useEffect(() => { mat.uniforms.uStrength.value = strength; }, [mat, strength]);
  useEffect(() => () => mat.dispose(), [mat]);
  // Sit on the wall (z≈0, a hair in front to avoid z-fighting), top edge against
  // the frame bottom, dropping downward by `drop`.
  return (
    <mesh position={[0, topY - drop / 2, 0.006]} material={mat} renderOrder={1}>
      <planeGeometry args={[W, drop]} />
    </mesh>
  );
}

// ── Faithful bake of the picture-light's WALL POOL ────────────────────────────
// A real per-painting SpotLight is the scene's #1 cost: nine real lights each
// shade every fragment of the fill-rate-bound room, even though all they leave on
// screen is (a) a warm pool on the wall and (b) a glint on the frame. The light and
// the art never move, so the pool is a FIXED blob — we bake it as a static additive
// decal that reproduces the EXACT spotlight maths (cone smoothstep + distance decay
// + N·L), modulated by the live wallpaper albedo so the damask brightens through it
// just as the real light brightened it. (The earlier rejected bake used a flat
// radial glow with no albedo → looked like an airbrushed blob; this one matches.)
// The frame glint can't be baked (view-dependent specular) so it stays a real-time
// in-shader light on the frame only — see Painting's frame patch.

// In each painting's LOCAL frame the picture-light geometry is identical for all
// nine: the lamp sits HEIGHT_ABOVE up and FORWARD out, aimed at the painting centre
// (mirrors PaintingLighting.tsx).
const POOL_LIGHT_LOCAL = new THREE.Vector3(0, 1.5, 0.9); // (FORWARD, HEIGHT_ABOVE)
const POOL_SPOT_DIR = POOL_LIGHT_LOCAL.clone().multiplyScalar(-1).normalize(); // aim at centre
const POOL_DISTANCE = 7, POOL_DECAY = 2; // mirror PaintingLighting

// Reconstruct the SAME wallpaper UV the wall mesh uses (Room.tsx: TILE_W≈1.333,
// TILE_H=1, repeat = wallWidth/TILE), so the baked pool's damask lines up in phase
// with the surrounding wall instead of ghosting. texelU = dot(toU, worldPos)+offU;
// texelV = worldPos.y (TILE_H=1). Derived per wall from the plane UVs + repeat.
const POOL_UV: Record<string, { toU: [number, number, number]; offU: number }> = {
  north: { toU: [0.75, 0, 0], offU: 4.5 },
  south: { toU: [-0.75, 0, 0], offU: 4.5 },
  east: { toU: [0, 0, 0.75], offU: 4.5 },
  west: { toU: [0, 0, -0.75], offU: 1.5 },
};

function PicturePool({ pw, ph, frameWidth, wall }: { pw: number; ph: number; frameWidth: number; wall: string }) {
  const intensity = useTuningStore((s) => s.spotIntensity);
  const angle = useTuningStore((s) => s.spotAngle);
  const penumbra = useTuningStore((s) => s.spotPenumbra);
  const color = useTuningStore((s) => s.spotColor);
  const exposure = useTuningStore((s) => s.exposure); // tone-map the pool like the room does
  const wallpaper = useTexture("/textures/wallpaper.jpg");
  const uv = POOL_UV[wall] ?? POOL_UV.north;

  // Footprint: generously cover the lit arch (above + around the work). The shader's
  // cone falloff carves the actual pool; outside it the fragment discards.
  const W = (pw + frameWidth * 2) * 2.4 + 0.6;
  const H = (ph + frameWidth * 2) * 2.1 + 1.4;

  const mat = useMemo(() => {
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending, // adds warm light onto the lit wall (damask shows through)
      uniforms: {
        uWall: { value: wallpaper },
        uColor: { value: new THREE.Color(color) },
        uStrength: { value: 0 },
        uExposure: { value: exposure },
        // Approx the wall's ambient+hemi shading (linear irradiance) so the decal can
        // tone-map (base + spot) − (base): the spot then compresses exactly like a real
        // light, and outside the cone the delta is 0 (seamless). Tuned in the A/B.
        uBaseColor: { value: new THREE.Color(0.18, 0.089, 0.035) },
        uBaseStrength: { value: 1.0 },
        uLightLocal: { value: POOL_LIGHT_LOCAL },
        uSpotDir: { value: POOL_SPOT_DIR },
        uCosOuter: { value: Math.cos(angle) },
        uCosInner: { value: Math.cos(angle * (1 - penumbra)) },
        uDistance: { value: POOL_DISTANCE },
        uDecay: { value: POOL_DECAY },
        uToU: { value: new THREE.Vector3(...uv.toU) },
        uOffU: { value: uv.offU },
      },
      vertexShader: `
        varying vec2 vLocal; varying vec3 vWorld;
        void main(){
          vLocal = position.xy;                                   // group-local pos on the wall plane
          vWorld = (modelMatrix * vec4(position, 1.0)).xyz;       // world pos → wallpaper UV
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        precision highp float;
        varying vec2 vLocal; varying vec3 vWorld;
        uniform sampler2D uWall; uniform vec3 uColor, uLightLocal, uSpotDir, uToU, uBaseColor;
        uniform float uStrength, uCosOuter, uCosInner, uDistance, uDecay, uOffU, uExposure, uBaseStrength;
        vec3 srgb2lin(vec3 c){ return pow(c, vec3(2.2)); }
        vec3 tonemap(vec3 c){ c *= uExposure; c = c / (1.0 + c); return pow(c, vec3(1.0/2.2)); } // room's exposure+Reinhard+sRGB
        void main(){
          vec3 frag = vec3(vLocal, 0.0);                          // wall surface, local z=0
          vec3 L = uLightLocal - frag;
          float d = length(L);
          vec3 Ldir = L / d;
          float ndl = max(Ldir.z, 0.0);                           // wall normal = +z
          float cosA = dot(uSpotDir, -Ldir);                      // angle to cone axis
          float cone = smoothstep(uCosOuter, uCosInner, cosA);    // three's getSpotAttenuation
          float distF = 1.0 / max(pow(d, uDecay), 0.01);          // three's getDistanceAttenuation
          float win = clamp(1.0 - pow(d / uDistance, 4.0), 0.0, 1.0); distF *= win * win;
          float I = uStrength * cone * distF * ndl;
          if (I <= 0.0001) discard;
          vec2 uv = vec2(dot(uToU, vWorld) + uOffU, vWorld.y);    // match the wall's wallpaper phase
          vec3 albedo = srgb2lin(texture2D(uWall, uv).rgb);
          vec3 base = albedo * uBaseColor * uBaseStrength;        // wall under ambient+hemi only (linear)
          vec3 spot = albedo * srgb2lin(uColor) * I;              // the spotlight's added irradiance
          // The wall already drew tonemap(base); add the delta so the result is
          // tonemap(base + spot) — i.e. exactly what a real light would have produced.
          vec3 delta = tonemap(base + spot) - tonemap(base);
          gl_FragColor = vec4(max(delta, 0.0), 1.0);
        }`,
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- live values pushed via uniforms below
  }, []);

  useEffect(() => { (wallpaper as THREE.Texture).wrapS = (wallpaper as THREE.Texture).wrapT = THREE.RepeatWrapping; wallpaper.needsUpdate = true; }, [wallpaper]);
  useEffect(() => { mat.uniforms.uWall.value = wallpaper; }, [mat, wallpaper]);
  useEffect(() => { mat.uniforms.uColor.value.set(color); }, [mat, color]);
  useEffect(() => { mat.uniforms.uExposure.value = exposure; }, [mat, exposure]);
  useEffect(() => { mat.uniforms.uCosOuter.value = Math.cos(angle); mat.uniforms.uCosInner.value = Math.cos(angle * (1 - penumbra)); }, [mat, angle, penumbra]);
  // Map the real spotlight intensity onto the additive decal. Tuned against the real
  // light in the same-camera A/B (the wall pool is the delta tonemap(base+spot)−tonemap(base)).
  useEffect(() => { mat.uniforms.uStrength.value = intensity * 0.41; }, [mat, intensity]);
  useEffect(() => () => mat.dispose(), [mat]);

  // On the wall (local z≈0), centred on the painting; behind the frame which
  // occludes the centre, leaving the arch. Additive, no depth write.
  return (
    <mesh position={[0, 0, 0.0035]} material={mat} renderOrder={0}>
      <planeGeometry args={[W, H]} />
    </mesh>
  );
}

// A downward warm pool on the FLOOR in front of each work — the look of the picture
// light spilling onto the floor. A wall-aimed picture spot barely touches the floor,
// so this is a dedicated soft down-light. Like PaintingLighting it exists only until
// the bake runs (then it's dropped); the bake captures its pool into the FLOOR
// lightmap, so at runtime it costs nothing. Tunable via ?tune `floorWash` (0 = off).
const FLOOR_WASH_FORWARD = 0.6; // m in front of the wall the pool centres
function FloorWash({ position, facing }: { position: [number, number, number]; facing: [number, number, number] }) {
  const intensity = useTuningStore((s) => s.floorWash);
  const angle = useTuningStore((s) => s.floorWashAngle);
  const color = useTuningStore((s) => s.spotColor);
  const [px, , pz] = position;
  const [fx, , fz] = facing;
  const x = px + fx * FLOOR_WASH_FORWARD;
  const z = pz + fz * FLOOR_WASH_FORWARD;
  if (intensity <= 0) return null;
  return (
    <spotLight
      userData={{ perfGroup: "paintingLight" }}
      color={color}
      intensity={intensity}
      position={[x, 1.5, z]}
      angle={angle}
      penumbra={0.9}
      decay={2}
      distance={4}
      ref={(l: THREE.SpotLight | null) => {
        if (l) { l.target.position.set(x, 0, z); l.target.updateMatrixWorld(); }
      }}
    />
  );
}

export default function Painting({ artwork, index, saturationRefs, paintingDimsRef, mode, hiRes, onReveal, onClick, onPlaqueClick }: PaintingProps) {
  const { position, rotation } = getPaintingTransform(artwork.position);
  const wall = artwork.position?.wall || "north";
  const facing = getFacingDir(wall);
  const bake = useTuningStore((s) => s.bakePool); // ?bake at load; runtime-toggleable for A/B
  const lmBaked = useLightmapStore((s) => s.baked); // lightmaps baked → drop the real spotlights
  const groupRef = useRef<THREE.Group>(null!);
  const gl = useThree((s) => s.gl);
  // Device-adaptive width we'd load on inspect (≤ base ⇒ stay on base). Reported
  // into paintingDimsRef as texWidth — only a fallback for the camera's 1:1 zoom
  // cap before any texture is resident; once loaded it clamps on loadedW (the
  // texture actually bound) so it never lets you zoom past what's really there.
  const hiResWidth = useMemo(() => pickHiResWidth(gl, artwork), [gl, artwork]);
  const inspectTexWidth = Math.max(2048, hiResWidth);

  // Wall texture for the room view. On phones request a lighter width (saves GPU
  // memory across all the resident paintings — see pickBaseWidth); on desktop keep
  // the exhibition API's pre-built 2048px URL. The Wikimedia fallback (no Sanity
  // asset) just uses whatever imageUrl it has.
  const baseW = pickBaseWidth();
  let imageUrl = artwork.imageUrl;
  if (artwork.image?.asset && (baseW < 2048 || !imageUrl)) {
    imageUrl = urlFor(artwork.image).width(baseW).auto("format").url();
  }

  if (!imageUrl) {
    console.warn(`No image URL for artwork: ${artwork.title}`);
    return null;
  }

  const baseTexture = useLoader(TextureLoader, imageUrl);
  // Keep texels crisp at the grazing/close angles of "look closely" inspect mode,
  // and tag the image as sRGB so every material decodes/encodes it correctly (the
  // lit roam material and the colour-managed inspect material both rely on this).
  if (baseTexture && (baseTexture.anisotropy !== 8 || baseTexture.colorSpace !== THREE.SRGBColorSpace)) {
    baseTexture.anisotropy = 8;
    baseTexture.colorSpace = THREE.SRGBColorSpace;
    baseTexture.needsUpdate = true;
  }

  // "Look closely" loads one adaptive high-res master for the inspected painting,
  // holds it resident for the whole inspect session (so panning and zooming never
  // re-load or blur), and frees it on exit. Skipped when the device-appropriate
  // width is no better than the base, or for the Wikimedia fallbacks.
  const [hiResTexture, setHiResTexture] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    if (!hiRes || !artwork.image?.asset) return;
    if (hiResWidth <= 2048) return; // base already covers this screen / master
    let cancelled = false;
    const hiUrl = `/api/img?u=${encodeURIComponent(
      urlFor(artwork.image).width(hiResWidth).quality(90).auto("format").url()
    )}`;
    new THREE.TextureLoader().load(
      hiUrl,
      (tex) => {
        if (cancelled) {
          tex.dispose();
          return;
        }
        tex.colorSpace = baseTexture.colorSpace; // match base so the swap can't shift colour
        tex.anisotropy = baseTexture.anisotropy || 8;
        // Snap to the nearest mip instead of blending two (the default trilinear
        // LinearMipmapLinear). Near 1:1 the GPU's LOD drifts a hair above 0, so
        // trilinear mixes in the half-res mip and the surface reads slightly soft
        // right at the deepest zoom; nearest-mip keeps it on mip0 (crisp) there.
        // Mipmaps stay generated, so the frame-fill entry view still anti-aliases.
        tex.minFilter = THREE.LinearMipmapNearestFilter;
        tex.needsUpdate = true;
        setHiResTexture(tex);
      },
      undefined,
      // On failure stay on the base texture. The camera caps deep zoom at the
      // resident texture's 1:1 (loadedW), so the view simply can't zoom past the
      // base's crisp limit instead of silently upscaling into a blur.
      () => console.warn(`Hi-res load failed for "${artwork.title}" — staying on base`),
    );
    return () => {
      cancelled = true;
    };
  }, [hiRes, artwork, hiResWidth, baseTexture]);

  // On inspect exit, drop the reference (the material's hiMap falls back to base)…
  useEffect(() => {
    if (!hiRes && hiResTexture) setHiResTexture(null);
  }, [hiRes, hiResTexture]);

  // …then free its VRAM. This cleanup runs after the child material's effect has
  // pointed hiMap back at the base, so we never dispose a still-bound texture.
  useEffect(() => {
    if (!hiResTexture) return;
    return () => {
      hiResTexture.dispose();
    };
  }, [hiResTexture]);

  // Calculate painting dimensions from the base texture (same aspect as hi-res),
  // so the camera-fit math never jitters when the hi-res fades in.
  let pw = 1.0, ph = 1.3;
  if (baseTexture?.image) {
    const aspect = baseTexture.image.width / baseTexture.image.height;
    if (aspect > 1) {
      pw = 1.0;
      ph = 1.0 / aspect;
    } else {
      pw = 1.3 * aspect;
      ph = 1.3;
    }
  }

  const satRef = useRef<{ value: number }>({ value: mode === "unguided" ? 1.0 : 0.0 });
  saturationRefs.current[index] = satRef.current;

  // Report real dimensions so inspect mode can frame the whole work (canvas +
  // frame) and clamp panning to the canvas edges.
  const residentImg = (hiResTexture ?? baseTexture).image as { width?: number; height?: number } | undefined;
  paintingDimsRef.current[index] = {
    pw, ph, frameWidth: getFrameWidth(artwork.frameStyle), texWidth: inspectTexWidth,
    loadedW: residentImg?.width, loadedH: residentImg?.height,
  };

  const handleClick = (e: any) => {
    e.stopPropagation();
    if (onClick) onClick(index, artwork);
  };

  // Sit the canvas just behind the frame's front face (small rebate) so it isn't
  // sunk at the bottom of the frame's full depth.
  const canvasZ = getFrameDepth(artwork.frameStyle) - FRAME_REBATE;
  const frameWidth = getFrameWidth(artwork.frameStyle);

  return (
    <>
    <group ref={groupRef} position={position} rotation={rotation as any}>
      {/* Painting canvas */}
      <mesh position={[0, 0, canvasZ]} onClick={handleClick} userData={{ index, artwork }}>
        <planeGeometry args={[pw, ph]} />
        <SaturationMaterial base={baseTexture} hiRes={hiResTexture} reveal={!!hiRes} saturationRef={satRef} mode={mode} />
      </mesh>

      {/* Faked drop shadow on the wall under the frame's bottom edge */}
      <FrameShadow pw={pw} ph={ph} frameWidth={frameWidth} />

      {/* Baked picture-light pool on the wall (?bake) — replaces the real SpotLight's
          wall contribution with a static additive decal of the exact same shape. */}
      {bake && <PicturePool pw={pw} ph={ph} frameWidth={frameWidth} wall={wall} />}

      {/* Frame */}
      <group position={[0, 0, 0]}>
        <FrameGroup frameStyle={artwork.frameStyle} pw={pw} ph={ph} />
      </group>

      {/* Plaque */}
      <Nameplate
        artwork={artwork}
        ph={ph}
        onClick={onPlaqueClick ? () => onPlaqueClick(index, artwork) : undefined}
      />

    </group>

      {/* Picture spotlight — world space. Present until the lightmaps are baked (so the
          bake captures its wall/floor pool), then dropped: the pool now lives in the
          lightmap, so the real light is redundant and its per-frame cost is the win.
          (Also skipped by the older ?bake analytic-decal experiment.) */}
      {!bake && !lmBaked && (
        <>
          <PaintingLighting position={position as [number, number, number]} facing={facing} pw={pw} ph={ph} />
          <FloorWash position={position as [number, number, number]} facing={facing} />
        </>
      )}
    </>
  );
}
