"use client";

import { useMemo } from "react";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import { ROOM } from "./Room";

// Warm "dusk" light for the night-sky room: soft warm pools spilled across the
// parquet plus one low warm key slanting in from the celestial opening, as if the
// day's last warm light reaches in — giving the room a lived-in, human warmth
// without contradicting the (twilight) starry ceiling.
export default function DuskLight({
  assetBasePath = "/assets/gallery-ceiling",
}: {
  assetBasePath?: string;
}) {
  const glow = useTexture(`${assetBasePath}/warm_top_glow_alpha_1024.png`);
  useMemo(() => {
    glow.colorSpace = THREE.SRGBColorSpace;
  }, [glow]);

  const cz = (ROOM.BACK_Z + ROOM.FRONT_Z) / 2;

  // Soft warm pools on the floor (additive glow decals). Scattered and varied so
  // they read like sunlight fallen across the boards, not a uniform wash.
  const pools = useMemo(
    () =>
      [
        { pos: [1.0, 0.03, cz + 0.8] as [number, number, number], w: 4.2, d: 3.0, o: 0.55 },
        { pos: [-2.7, 0.03, cz - 1.6] as [number, number, number], w: 3.0, d: 2.1, o: 0.4 },
        { pos: [3.3, 0.03, cz - 2.6] as [number, number, number], w: 2.4, d: 1.7, o: 0.3 },
      ],
    [cz]
  );

  // Explicit target so the spotlight reliably aims at the main pool.
  const target = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.set(1.0, 0, cz + 0.8);
    return o;
  }, [cz]);

  return (
    <group>
      {pools.map((p, i) => (
        <mesh key={i} position={p.pos} rotation={[-Math.PI / 2, 0, 0]} renderOrder={0}>
          <planeGeometry args={[p.w, p.d]} />
          <meshBasicMaterial
            map={glow}
            transparent
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            opacity={p.o}
            color="#ffcb92"
            toneMapped={false}
          />
        </mesh>
      ))}

      {/* Real warm key slanting from the opening side — grounds the pools and
          warms the bench/floor so the light reads as physical, not painted-on. */}
      <primitive object={target} />
      <spotLight
        color="#ffd2a0"
        intensity={2.4}
        angle={0.62}
        penumbra={0.85}
        distance={13}
        decay={2}
        position={[-1.6, 3.7, cz - 1.2]}
        target={target}
      />
    </group>
  );
}
