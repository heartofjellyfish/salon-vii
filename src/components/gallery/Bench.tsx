"use client";

import { useMemo } from "react";
import { useGLTF, ContactShadows } from "@react-three/drei";
import * as THREE from "three";

// Oxblood leather daybed (Sketchfab "Leather Bench", CC) used as the gallery's
// centrepiece. The source is FBX-derived with non-obvious units / orientation,
// so instead of hard-coding a scale we measure the real bounds at runtime and
// auto-fit: rotate the long axis onto X (parallel to the back wall), uniformly
// scale to a target length, centre it horizontally and seat it on the floor.
const MODEL_URL = "/models/leather_bench.glb";
const TARGET_LEN = 1.95; // metres, long axis

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
    if (size.z > size.x) {
      o.rotateY(Math.PI / 2);
    }

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

    // Deepen the leather toward oxblood: the bright museum ambient washes the
    // baked albedo out to a sleepy mid-brown, so multiply the leather (not the
    // wood) by a warm red to bring back the rich wine seen in the studio render.
    const oxblood = new THREE.Color(0.6, 0.16, 0.21);
    o.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const tint = (m: THREE.Material) => {
        if (m && /Bench_(Seat|Side|Pillow)/i.test(m.name)) {
          const c = m.clone() as THREE.MeshStandardMaterial;
          c.color = oxblood.clone();
          return c;
        }
        return m;
      };
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map(tint)
        : tint(mesh.material);
    });

    return o;
  }, [scene]);
}

export default function Bench({ position = [0, 0, -2] as [number, number, number] }) {
  const daybed = useFittedDaybed();

  return (
    <group position={position}>
      <primitive object={daybed} />

      {/* warm lamp pool: in the dim evening room this is the key light on the
          centre seating, like a floor lamp glowing beside it */}
      <pointLight
        position={[0, 1.7, 0.9]}
        intensity={15}
        distance={7}
        decay={2}
        color="#ffcf95"
      />

      {/* soft contact shadow to ground it on the parquet */}
      <ContactShadows
        position={[0, 0.012, 0]}
        scale={4}
        far={2}
        blur={2.6}
        opacity={0.55}
        resolution={1024}
        color="#1a0e08"
      />
    </group>
  );
}

useGLTF.preload(MODEL_URL);
