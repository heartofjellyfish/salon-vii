"use client";

import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

// Floor lamp beside the daybed. It does double duty: the fabric shade is made
// to glow warm (so the lamp reads as "on"), and a warm point light at the shade
// throws the cosy pool the evening room is built around. Auto-fit like the other
// props: stand the tallest axis up, scale to a real height, seat on the floor.
const MODEL_URL = "/models/floor_lamp.glb";
const TARGET_H = 1.7; // metres tall

function useFittedLamp() {
  const { scene } = useGLTF(MODEL_URL);

  return useMemo(() => {
    const o = scene.clone(true);
    o.position.set(0, 0, 0);
    o.rotation.set(0, 0, 0);
    o.scale.set(1, 1, 1);

    let box = new THREE.Box3().setFromObject(o);
    let size = box.getSize(new THREE.Vector3());
    if (size.z >= size.x && size.z >= size.y) o.rotateX(-Math.PI / 2);
    else if (size.x >= size.y && size.x >= size.z) o.rotateZ(Math.PI / 2);

    box = new THREE.Box3().setFromObject(o);
    size = box.getSize(new THREE.Vector3());
    const s = TARGET_H / Math.max(size.y, 1e-6);
    o.scale.setScalar(s);

    box = new THREE.Box3().setFromObject(o);
    const center = box.getCenter(new THREE.Vector3());
    o.position.x -= center.x;
    o.position.z -= center.z;
    o.position.y -= box.min.y;

    // Glow the fabric shade and remember where it sits, so the lamp's light can
    // be placed at the shade (this is an arc lamp — the shade is offset from the
    // base, so a base-centred light would miss it).
    const glow = new THREE.Color("#ff9d4d");
    let shade: THREE.Mesh | null = null;
    o.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m) => {
        const mat = m as THREE.MeshStandardMaterial;
        if (mat && /fabric|shade/i.test(mat.name)) {
          mat.emissive = glow.clone();
          mat.emissiveIntensity = 1.5;
          mat.needsUpdate = true;
          shade = mesh;
        }
      });
    });

    // shade centre in group space (the object's offsets are already applied)
    const shadePos = new THREE.Vector3(0, TARGET_H * 0.8, 0);
    if (shade) new THREE.Box3().setFromObject(shade).getCenter(shadePos);

    return { object: o, shadePos: shadePos.toArray() as [number, number, number] };
  }, [scene]);
}

export default function FloorLamp({ position = [1.5, 0, -1.2] as [number, number, number] }) {
  const { object, shadePos } = useFittedLamp();
  return (
    <group position={position}>
      <primitive object={object} />
      {/* warm pool thrown from the shade */}
      <pointLight
        position={shadePos}
        intensity={16}
        distance={7}
        decay={2}
        color="#ffb866"
        castShadow={false}
      />
    </group>
  );
}

useGLTF.preload(MODEL_URL);
