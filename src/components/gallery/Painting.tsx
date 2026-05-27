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
  const uniforms = useMemo(() => ({
    map: { value: base },
    hiMap: { value: hiRes ?? base },
    hiMix: { value: 0 },
    saturation: { value: mode === "unguided" ? 1.0 : 0.0 },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- textures swap in place below
  }), [mode]);

  // Keep the sampled textures current without rebuilding the material (which
  // would reset the in-flight saturation reveal).
  useEffect(() => { uniforms.map.value = base; }, [base, uniforms]);
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

  return (
    <shaderMaterial
      uniforms={uniforms}
      vertexShader="varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }"
      fragmentShader="uniform sampler2D map; uniform sampler2D hiMap; uniform float hiMix; uniform float saturation; varying vec2 vUv;
        void main() {
          vec4 lo = texture2D(map, vUv);
          vec4 hi = texture2D(hiMap, vUv);
          vec4 tex = mix(lo, hi, hiMix);
          float gray = dot(tex.rgb, vec3(0.299, 0.587, 0.114));
          gl_FragColor = vec4(mix(vec3(gray), tex.rgb, saturation), tex.a);
        }"
    />
  );
}

export default function Painting({ artwork, index, saturationRefs, paintingDimsRef, mode, hiRes, onReveal, onClick, onPlaqueClick }: PaintingProps) {
  const { position, rotation } = getPaintingTransform(artwork.position);
  const facing = getFacingDir(artwork.position?.wall || "north");
  const groupRef = useRef<THREE.Group>(null!);
  const gl = useThree((s) => s.gl);
  // Device-adaptive width we'd load on inspect (≤ base ⇒ stay on base). Reported
  // into paintingDimsRef so the camera can cap zoom at this texture's 1:1 point.
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
  // Keep texels crisp at the grazing/close angles of "look closely" inspect mode.
  if (baseTexture && baseTexture.anisotropy !== 8) {
    baseTexture.anisotropy = 8;
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
    new THREE.TextureLoader().load(hiUrl, (tex) => {
      if (cancelled) {
        tex.dispose();
        return;
      }
      tex.colorSpace = baseTexture.colorSpace; // match base so the swap can't shift colour
      tex.anisotropy = baseTexture.anisotropy || 8;
      tex.needsUpdate = true;
      setHiResTexture(tex);
    });
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
