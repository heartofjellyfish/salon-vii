"use client";

import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { useTuningStore } from "./tuningStore";

// Floor lamp beside the daybed. The shade interior glows warm and a warm point
// light at the shade throws the cosy pool. A small soft "patch of light" sits
// inside the metal dome; because the dome opens downward, tilt the lamp a touch
// to angle the opening toward the viewer — all live in ?tune ("Lamp / 落地灯").
// Auto-fit like the other props: stand the tallest axis up, scale to a real
// height, seat on the floor.
const MODEL_URL = "/models/brass_lamp.glb";
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

    // The parts tucked inside the metal dome (Material + mirror.001) glow a soft
    // warm, so when the opening faces you the shade interior reads as a patch of
    // light. The dome shell (Latun) is solid metal — left as-is. Emissive only.
    const glow = new THREE.Color("#ff9d4d");
    let shade: THREE.Mesh | null = null; // mirror.001 = the reflector disc inside the dome
    o.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m) => {
        const mat = m as THREE.MeshStandardMaterial;
        if (!mat) return;
        if (mat.name === "Material" || mat.name === "mirror.001") {
          mat.emissive = glow.clone();
          mat.emissiveIntensity = 2;
          mat.metalness = 0;
          mat.needsUpdate = true;
          if (mat.name === "mirror.001") shade = mesh;
        }
      });
    });

    // shade centre in group space — the reflector disc's world bbox centre is the
    // dome's interior, the right anchor for the lamp's light + interior glow.
    o.updateMatrixWorld(true);
    const shadePos = new THREE.Vector3(0, TARGET_H * 0.8, 0);
    if (shade) new THREE.Box3().setFromObject(shade).getCenter(shadePos);

    return { object: o, shadePos: shadePos.toArray() as [number, number, number] };
  }, [scene]);
}

export default function FloorLamp({
  position = [1.5, 0, -1.2] as [number, number, number],
  rotationY = 0,
  pointIntensity = 16,
}: {
  position?: [number, number, number];
  rotationY?: number;
  pointIntensity?: number;
}) {
  const { object, shadePos } = useFittedLamp();
  const tilt = useTuningStore((s) => s.lampTilt);
  const glowX = useTuningStore((s) => s.lampGlowX);
  const glowY = useTuningStore((s) => s.lampGlowY);
  const glowZ = useTuningStore((s) => s.lampGlowZ);
  const glowSize = useTuningStore((s) => s.lampGlowSize);
  const glowIntensity = useTuningStore((s) => s.lampGlowIntensity);
  return (
    <group position={position} rotation={[tilt, rotationY, 0]}>
      <primitive object={object} />
      {/* warm pool thrown from the shade */}
      <pointLight
        position={shadePos}
        intensity={pointIntensity}
        distance={7}
        decay={2}
        color="#ffb866"
        castShadow={false}
      />
      {/* soft patch of light inside the shade — offset/size/brightness live in the
          ?tune panel so it can be nudged to peek through the dome opening */}
      <mesh position={[shadePos[0] + glowX, shadePos[1] + glowY, shadePos[2] + glowZ]}>
        <sphereGeometry args={[glowSize, 20, 20]} />
        <meshStandardMaterial color="#000000" emissive="#ffc070" emissiveIntensity={glowIntensity} />
      </mesh>
    </group>
  );
}

useGLTF.preload(MODEL_URL);
