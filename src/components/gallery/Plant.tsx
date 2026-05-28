"use client";

import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

// A potted plant cut from the archviz collection. Every glb is already
// normalised to metres, XZ-centred and seated at y=0 (base on the floor), so
// placement is just position / yaw / optional scale — no runtime auto-fit.
type Props = {
  url: string;
  position?: [number, number, number];
  rotationY?: number; // radians, yaw about the up axis
  scale?: number;
};

export default function Plant({ url, position = [0, 0, 0], rotationY = 0, scale = 1 }: Props) {
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
  return <primitive object={obj} position={position} rotation={[0, rotationY, 0]} scale={scale} />;
}
