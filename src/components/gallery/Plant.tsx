"use client";

import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

// A potted plant cut from the archviz collection. Every glb is already
// normalised to metres, XZ-centred and seated at y=0 (base on the floor), so
// placement is just position / yaw / optional scale — no runtime auto-fit.
//
// An optional warm fill light lets the plant read in a dim corner: it sits in
// front of the plant (toward the room, +Z in the group's local frame) and a
// little up, with a short throw (distance/decay) so it only lifts the plant
// itself, not the surrounding walls. fillIntensity = 0 ⇒ no light.
type Props = {
  url: string;
  position?: [number, number, number];
  rotationY?: number; // radians, yaw about the up axis
  scale?: number;
  fillIntensity?: number;
  fillDistance?: number;
  fillHeight?: number;
  fillFront?: number;
  fillColor?: string;
};

export default function Plant({
  url,
  position = [0, 0, 0],
  rotationY = 0,
  scale = 1,
  fillIntensity = 0,
  fillDistance = 4,
  fillHeight = 1.4,
  fillFront = 0.6,
  fillColor = "#ffd9a0",
}: Props) {
  const { scene } = useGLTF(url);
  const obj = useMemo(() => {
    const o = scene.clone(true);
    o.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    return o;
  }, [scene]);
  return (
    <group position={position} rotation={[0, rotationY, 0]} scale={scale}>
      <primitive object={obj} />
      {fillIntensity > 0 && (
        <pointLight
          position={[0, fillHeight, fillFront]}
          intensity={fillIntensity}
          distance={fillDistance}
          decay={2}
          color={fillColor}
        />
      )}
    </group>
  );
}
