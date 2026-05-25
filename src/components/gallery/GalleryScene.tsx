"use client";

import { useRef, useState, useEffect, useCallback, Suspense } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";
import Room from "./Room";
import GalleryLighting from "./GalleryLighting";
import Painting from "./Painting";
import type { Artwork } from "@/lib/sanity";

interface GallerySceneProps {
  artworks: Artwork[];
  mode: "guided" | "unguided";
  onArtworkRevealed?: (index: number, artwork: Artwork) => void;
  onArtworkClick?: (index: number, artwork: Artwork) => void;
  saturationRefs: React.MutableRefObject<{ [key: number]: { value: number } }>;
  enableOrbit: boolean;
}

function SceneContent({ artworks, mode, onArtworkRevealed, onArtworkClick, saturationRefs, enableOrbit }: GallerySceneProps) {
  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 1.7, 5.5]} fov={55} near={0.1} far={100} />
      <OrbitControls
        target={[0, 1.7, -2]}
        enableDamping
        dampingFactor={0.06}
        minPolarAngle={0.4}
        maxPolarAngle={1.35}
        minAzimuthAngle={-1.1}
        maxAzimuthAngle={1.1}
        minDistance={1.5}
        maxDistance={8}
        enabled={enableOrbit || mode === "unguided"}
      />
      <fog attach="fog" args={["#0a0508", 6, 16]} />
      <color attach="background" args={["#0a0508"]} />
      <ambientLight intensity={0.08} color="#1a0f05" />
      <hemisphereLight args={["#3A0A10", "#0A0508", 0.12]} />
      <Suspense fallback={null}>
        <Room />
      </Suspense>
      <Suspense fallback={null}>
        {artworks.map((artwork, index) => (
          <Painting
            key={artwork._id}
            artwork={artwork}
            index={index}
            saturationRefs={saturationRefs}
            mode={mode}
            onReveal={onArtworkRevealed}
            onClick={onArtworkClick}
          />
        ))}
      </Suspense>
    </>
  );
}

export default function GalleryScene({ artworks, mode, onArtworkRevealed, onArtworkClick, saturationRefs }: Omit<GallerySceneProps, 'enableOrbit'>) {
  const [enableOrbit, setEnableOrbit] = useState(false);

  useEffect(() => {
    if (mode === "unguided") setEnableOrbit(true);
  }, [mode]);

  return (
    <Canvas
      gl={{ antialias: true, alpha: true, toneMapping: THREE.ReinhardToneMapping, toneMappingExposure: 1.2 }}
      dpr={[1, 2]}
      shadows
      style={{ position: "fixed", inset: 0 }}
    >
      <SceneContent
        artworks={artworks}
        mode={mode}
        onArtworkRevealed={onArtworkRevealed}
        onArtworkClick={onArtworkClick}
        saturationRefs={saturationRefs}
        enableOrbit={enableOrbit}
      />
    </Canvas>
  );
}
