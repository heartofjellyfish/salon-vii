"use client";

import { useRef } from "react";
import * as THREE from "three";

interface PaintingLightingProps {
  position: [number, number, number];
  facing: [number, number, number];
}

export default function PaintingLighting({ position, facing }: PaintingLightingProps) {
  const [fx, fy, fz] = facing;
  const [px, py, pz] = position;
  const spotTargetRef = useRef<THREE.Object3D>(null!);

  return (
    <group>
      {/* RectAreaLight for painting — 35cm above, 50cm front */}
      <rectAreaLight
        color="#FFF5E0"
        intensity={2.5}
        width={1.5}
        height={1.8}
        position={[px + fx * 0.5, py + 0.35, pz + fz * 0.5]}
        rotation={[0, Math.atan2(fx, fz), 0]}
      />

      {/* SpotLight for plaque — 40cm above plaque location */}
      <spotLight
        color="#FFD580"
        intensity={1.0}
        distance={6}
        angle={0.25}
        penumbra={0.85}
        position={[px + fx * 0.4, py - 0.3, pz + fz * 0.4]}
        target={spotTargetRef.current}
      />
      <object3D ref={spotTargetRef} position={[px, py - 0.85, pz + fz * 0.02]} />
    </group>
  );
}
