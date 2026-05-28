"use client";

import { useMemo } from "react";
import { useGLTF, ContactShadows } from "@react-three/drei";
import * as THREE from "three";

// Leather daybed (Sketchfab "Leather Bench", CC) used as the gallery's
// centrepiece. The source is FBX-derived with non-obvious units / orientation,
// so instead of hard-coding a scale we measure the real bounds at runtime and
// auto-fit: rotate the long axis onto X (parallel to the back wall), uniformly
// scale to a target length, centre it horizontally and seat it on the floor.
const MODEL_URL = "/models/leather_bench.glb";
const TARGET_LEN = 1.95; // metres, long axis

// Tuned-in-scene leather look.
const LEATHER_COLOR = "#eae39a";
const LEATHER_ROUGHNESS = 0.24; // glossy, waxed-leather sheen
const LEATHER_GRAIN = 3; // normalScale — pronounced grain/tufting
const LEATHER_REFLECTION = 1.1; // envMapIntensity

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

    // Warm tan leather: glossy with a pronounced grain so it reads as real,
    // waxed cowhide that catches the lamp + environment.
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

      {/* soft warm fill on the seating; the floor lamp beside it is the key
          light, so this just keeps the daybed from going flat */}
      <pointLight position={[0, 1.7, 0.9]} intensity={7} distance={7} decay={2} color="#ffcf95" />

      {/* Deep, soft grounding shadow — dark enough that it pools under the whole
          daybed and swallows the legs into it, the way the reference render does.
          A tight, very dark core plus the wider soft falloff. */}
      <ContactShadows
        position={[0, 0.01, 0]}
        scale={3}
        far={1.6}
        blur={2.2}
        opacity={0.95}
        resolution={1024}
        color="#000000"
      />
      <ContactShadows
        position={[0, 0.02, 0]}
        scale={4.2}
        far={2}
        blur={3.4}
        opacity={0.55}
        resolution={1024}
        color="#0a0604"
      />
    </group>
  );
}

useGLTF.preload(MODEL_URL);
