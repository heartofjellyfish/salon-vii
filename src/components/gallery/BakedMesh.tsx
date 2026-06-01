"use client";

import type * as THREE from "three";
import { useLightmapStore, LIGHTMAP_INTENSITY } from "./lightmapStore";

interface BakedMeshProps {
  id: string;                 // stable surface id (the baker keys lightmaps by this)
  width: number;
  height: number;
  map: THREE.Texture;         // albedo (kept crisp + tiling via its own texture.repeat)
  roughness?: number;         // used only by the un-baked MeshStandard fallback
  position?: [number, number, number];
  rotation?: [number, number, number];
  receiveShadow?: boolean;
}

// A planar surface that is lit for real (MeshStandard) until its lightmap is baked,
// then renders UNLIT (MeshBasic, map × lightMap) — no per-frame light loop. The
// material choice lives in React (reads the lightmap store), so it survives
// re-renders. The plane's own 0..1 UV is the lightmap UV; the albedo keeps tiling
// independently via its texture.repeat (high-freq detail stays crisp at low lightmap res).
export default function BakedMesh({
  id, width, height, map, roughness = 0.85, position, rotation, receiveShadow,
}: BakedMeshProps) {
  const lm = useLightmapStore((s) => s.maps[id]);
  return (
    <mesh position={position} rotation={rotation} receiveShadow={receiveShadow} userData={{ lightbake: id }}>
      <planeGeometry args={[width, height]} />
      {lm ? (
        <meshBasicMaterial map={map} lightMap={lm} lightMapIntensity={LIGHTMAP_INTENSITY} toneMapped />
      ) : (
        <meshStandardMaterial map={map} roughness={roughness} />
      )}
    </mesh>
  );
}
