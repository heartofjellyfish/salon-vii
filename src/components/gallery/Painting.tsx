"use client";

import { useRef, useMemo, useEffect, useState } from "react";
import { useLoader, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { TextureLoader } from "three";
import { FrameGroup, getFrameDepth, getFrameWidth, FRAME_REBATE } from "./FrameBuilders";
import Nameplate from "./Nameplate";
import PaintingLighting from "./PaintingLighting";
import { getPaintingTransform, getFacingDir } from "@/lib/gallery-config";
import type { Artwork } from "@/lib/sanity";
import { urlFor } from "@/lib/sanity";

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
  // objects into both materials' shaders.
  const uniforms = useMemo(() => ({
    hiMap: { value: hiRes ?? base },
    hiMix: { value: 0 },
    saturation: { value: mode === "unguided" ? 1.0 : 0.0 },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- textures swap in place below
  }), [mode]);

  // Two materials, built once and reused (so entering inspect swaps a pre-compiled
  // program instead of compiling a fresh shader each time — that recompile was the
  // close-up hitch). Both run the SAME injection — blend hi-res over the base and
  // apply the saturation-reveal on diffuseColor — grafted via onBeforeCompile so we
  // keep three's colour management (a hand-rolled raw shader skipped the sRGB output
  // encode and washed the image out).
  const { lit, inspect } = useMemo(() => {
    const inject = (m: THREE.Material) => {
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
    };
    // Roam: physically lit — the room's light decides how each piece reads.
    const lit = new THREE.MeshStandardMaterial({ map: base, roughness: 0.82, metalness: 0.0 });
    inject(lit);
    // Inspect: unlit + tone-map-bypassed → the painting at its true, unmodified
    // file colour, and a cheap full-screen pass. Still colour-managed by three, so
    // it is NOT washed out the way the old raw shader was.
    const inspect = new THREE.MeshBasicMaterial({ map: base, toneMapped: false });
    inject(inspect);
    return { lit, inspect };
  }, [uniforms, base]);

  useEffect(() => () => { lit.dispose(); inspect.dispose(); }, [lit, inspect]);
  useEffect(() => { lit.map = base; inspect.map = base; }, [base, lit, inspect]);
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

  // Inspecting THIS work → unlit true-colour material; roaming → lit material.
  return <primitive object={reveal ? inspect : lit} attach="material" />;
}

export default function Painting({ artwork, index, saturationRefs, paintingDimsRef, mode, hiRes, onReveal, onClick, onPlaqueClick }: PaintingProps) {
  const { position, rotation } = getPaintingTransform(artwork.position);
  const facing = getFacingDir(artwork.position?.wall || "north");
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

  return (
    <>
    <group ref={groupRef} position={position} rotation={rotation as any}>
      {/* Painting canvas */}
      <mesh position={[0, 0, canvasZ]} onClick={handleClick} userData={{ index, artwork }}>
        <planeGeometry args={[pw, ph]} />
        <SaturationMaterial base={baseTexture} hiRes={hiResTexture} reveal={!!hiRes} saturationRef={satRef} mode={mode} />
      </mesh>

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

      {/* Lights — world space, outside the painting's own transform */}
      <PaintingLighting position={position as [number, number, number]} facing={facing} pw={pw} ph={ph} />
    </>
  );
}
