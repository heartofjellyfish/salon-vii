"use client";

import { useRef, useMemo, useEffect, useState } from "react";
import { useLoader, useFrame } from "@react-three/fiber";
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
  paintingDimsRef: React.MutableRefObject<{ [index: number]: { pw: number; ph: number; frameWidth: number } }>;
  mode: "guided" | "unguided";
  onReveal?: (index: number, artwork: Artwork) => void;
  onClick?: (index: number, artwork: Artwork) => void;
}

function SaturationMaterial({ texture, hiRes, saturationRef, mode }: { texture: THREE.Texture; hiRes: THREE.Texture | null; saturationRef: React.MutableRefObject<{ value: number }>; mode: string }) {
  const uniforms = useMemo(() => ({
    map: { value: texture },
    saturation: { value: mode === "unguided" ? 1.0 : 0.0 },
  }), [texture, mode]);

  useEffect(() => {
    saturationRef.current = uniforms.saturation;
  }, [saturationRef, uniforms.saturation]);

  // Swap in the sharper texture the moment it arrives, without rebuilding the
  // uniforms object (which would reset the saturation reveal).
  useEffect(() => {
    uniforms.map.value = hiRes ?? texture;
  }, [hiRes, texture, uniforms]);

  return (
    <shaderMaterial
      uniforms={uniforms}
      vertexShader="varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }"
      fragmentShader="uniform sampler2D map; uniform float saturation; varying vec2 vUv;
        void main() {
          vec4 tex = texture2D(map, vUv);
          float gray = dot(tex.rgb, vec3(0.299, 0.587, 0.114));
          gl_FragColor = vec4(mix(vec3(gray), tex.rgb, saturation), tex.a);
        }"
    />
  );
}

export default function Painting({ artwork, index, saturationRefs, paintingDimsRef, mode, onReveal, onClick }: PaintingProps) {
  const { position, rotation } = getPaintingTransform(artwork.position);
  const facing = getFacingDir(artwork.position?.wall || "north");
  const groupRef = useRef<THREE.Group>(null!);

  // Get image URL from Sanity
  let imageUrl = artwork.imageUrl;
  if (!imageUrl && artwork.image?.asset) {
    imageUrl = urlFor(artwork.image).width(1600).url();
  }

  if (!imageUrl) {
    console.warn(`No image URL for artwork: ${artwork.title}`);
    return null;
  }

  const texture = useLoader(TextureLoader, imageUrl);
  // Keep texels crisp at the grazing/close angles of "look closely" inspect mode.
  if (texture && texture.anisotropy !== 8) {
    texture.anisotropy = 8;
    texture.needsUpdate = true;
  }

  // Progressive resolution: the base texture (≈1600px wide) is what gates the
  // gallery reveal and looks fine from across the room. As the visitor dollies
  // toward this canvas, pull a high-res variant in *ahead* of the closest stops
  // (trigger at 1.7m, while presets reach 0.45m) so the zoom never lands on a
  // soft image waiting to sharpen. Only Sanity-hosted images expose width
  // variants; the Wikimedia fallbacks stay at their single size.
  const HI_RES_TRIGGER = 1.7;
  const hiResUrl = useMemo(() => {
    if (artwork.image?.asset) {
      return `/api/img?u=${encodeURIComponent(urlFor(artwork.image).width(2800).auto("format").url())}`;
    }
    return null;
  }, [artwork]);
  const [hiRes, setHiRes] = useState<THREE.Texture | null>(null);
  const hiReqRef = useRef(false);

  useFrame(({ camera }) => {
    if (!hiResUrl || hiReqRef.current) return;
    const dx = camera.position.x - position[0];
    const dz = camera.position.z - position[2];
    if (Math.hypot(dx, dz) <= HI_RES_TRIGGER) {
      hiReqRef.current = true;
      new TextureLoader().load(
        hiResUrl,
        (t) => {
          // Mirror the base texture's color handling so the swap is invisible
          // apart from the added sharpness.
          t.colorSpace = texture.colorSpace;
          t.anisotropy = Math.max(texture.anisotropy || 1, 8);
          t.needsUpdate = true;
          setHiRes(t);
        },
        undefined,
        () => { hiReqRef.current = false; } // let a later approach retry on failure
      );
    }
  });

  // Calculate painting dimensions based on aspect ratio
  let pw = 1.0, ph = 1.3;
  if (texture?.image) {
    const aspect = texture.image.width / texture.image.height;
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
  paintingDimsRef.current[index] = { pw, ph, frameWidth: getFrameWidth(artwork.frameStyle) };

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
        <SaturationMaterial texture={texture} hiRes={hiRes} saturationRef={satRef} mode={mode} />
      </mesh>

      {/* Frame */}
      <group position={[0, 0, 0]}>
        <FrameGroup frameStyle={artwork.frameStyle} pw={pw} ph={ph} />
      </group>

      {/* Plaque */}
      <Nameplate artwork={artwork} ph={ph} />

    </group>

      {/* Lights — world space, outside the painting's own transform */}
      <PaintingLighting position={position as [number, number, number]} facing={facing} pw={pw} ph={ph} />
    </>
  );
}
