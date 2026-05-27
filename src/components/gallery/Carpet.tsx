"use client";

import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

// Faded Persian (Esfahan) carpet laid under the centre daybed to ground the
// seating and warm the floor. Source is already modelled flat in the XZ plane
// in metres, so we just scale it to a sensible footprint, sit it on the floor
// and centre it — long axis along X to match the daybed.
const MODEL_URL = "/models/persian_carpet.glb";
const TARGET_LEN = 3.3; // metres, long axis (extends well beyond the ~1.95m daybed)

function useFittedCarpet() {
  const { scene } = useGLTF(MODEL_URL);

  return useMemo(() => {
    const o = scene.clone(true);
    o.position.set(0, 0, 0);
    o.rotation.set(0, 0, 0);
    o.scale.set(1, 1, 1);

    // orient long horizontal axis onto X
    let box = new THREE.Box3().setFromObject(o);
    let size = box.getSize(new THREE.Vector3());
    if (size.z > size.x) o.rotateY(Math.PI / 2);

    box = new THREE.Box3().setFromObject(o);
    size = box.getSize(new THREE.Vector3());
    const s = TARGET_LEN / Math.max(size.x, size.z, 1e-6);
    o.scale.setScalar(s);

    box = new THREE.Box3().setFromObject(o);
    const center = box.getCenter(new THREE.Vector3());
    o.position.x -= center.x;
    o.position.z -= center.z;
    o.position.y -= box.min.y - 0.005; // rest just above the floor, no z-fighting

    o.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) mesh.receiveShadow = true;
    });

    return o;
  }, [scene]);
}

export default function Carpet({ position = [0, 0, -2] as [number, number, number] }) {
  const carpet = useFittedCarpet();
  return (
    <group position={position}>
      <primitive object={carpet} />
    </group>
  );
}

useGLTF.preload(MODEL_URL);
