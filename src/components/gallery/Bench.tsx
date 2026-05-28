"use client";

import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

// Leather daybed (Sketchfab "Leather Bench", CC) used as the gallery's
// centrepiece. The source is FBX-derived with non-obvious units / orientation,
// so instead of hard-coding a scale we measure the real bounds at runtime and
// auto-fit: rotate the long axis onto X (parallel to the back wall), uniformly
// scale to a target length, centre it horizontally and seat it on the floor.
// It casts a real shadow from the reading spotlight (see GalleryScene).
const MODEL_URL = "/models/leather_bench.glb";
const TARGET_LEN = 1.95; // metres, long axis

// Tuned-in-scene leather look.
const LEATHER_COLOR = "#eae39a";
const LEATHER_ROUGHNESS = 0.24;
const LEATHER_GRAIN = 3;
const LEATHER_REFLECTION = 1.1;

function useFittedDaybed() {
  const { scene } = useGLTF(MODEL_URL);

  return useMemo(() => {
    const o = scene.clone(true);
    o.position.set(0, 0, 0);
    o.rotation.set(0, 0, 0);
    o.scale.set(1, 1, 1);

    // 1. orient: make the longer horizontal axis run along X
    let box = new THREE.Box3().setFromObject(o);
    let size = box.getSize(new THREE.Vector3());
    if (size.z > size.x) o.rotateY(Math.PI / 2);

    // 2. uniform scale so the long axis hits TARGET_LEN
    box = new THREE.Box3().setFromObject(o);
    size = box.getSize(new THREE.Vector3());
    const s = TARGET_LEN / Math.max(size.x, size.z, 1e-6);
    o.scale.setScalar(s);

    // 3. centre on X/Z and seat the lowest point on the floor (y = 0)
    box = new THREE.Box3().setFromObject(o);
    const center = box.getCenter(new THREE.Vector3());
    o.position.x -= center.x;
    o.position.z -= center.z;
    o.position.y -= box.min.y;

    const leather = new THREE.Color(LEATHER_COLOR);
    o.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const tint = (m: THREE.Material) => {
        if (m && /Bench_(Seat|Side|Pillow)/i.test(m.name)) {
          const c = m.clone() as THREE.MeshStandardMaterial;
          c.color = leather.clone();
          c.roughness = LEATHER_ROUGHNESS;
          c.envMapIntensity = LEATHER_REFLECTION;
          if (c.normalMap && c.normalScale) c.normalScale.set(LEATHER_GRAIN, LEATHER_GRAIN);
          c.needsUpdate = true;
          return c;
        }
        return m;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(tint) : tint(mesh.material);
    });

    return o;
  }, [scene]);
}

export default function Bench() {
  const daybed = useFittedDaybed();

  return (
    <group position={[0, 0, -2]}>
      <primitive object={daybed} />

      {/* soft warm fill so the daybed front doesn't go flat-black; the reading
          spotlight (GalleryScene) is the key light and casts the real shadow */}
      <pointLight position={[0, 1.7, 0.9]} intensity={5} distance={7} decay={2} color="#ffcf95" />
    </group>
  );
}

useGLTF.preload(MODEL_URL);
