"use client";

import { useMemo } from "react";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import CelestialSalonCeiling from "./CelestialSalonCeiling";

const W = 12, H = 4, D = 8;
const HALF_W = W / 2;
const BACK_Z = -HALF_W;  // -6 (north wall)
const FRONT_Z = BACK_Z + D; // 2 (south wall)
const ROOM_CENTER_Z = (BACK_Z + FRONT_Z) / 2;

// Wallpaper motif tile size in meters. Source image is 1600×1200 (4:3),
// so width/height stay in that ratio to keep the pattern undistorted.
// Smaller tile = motif repeats more densely (≈33% smaller than before).
const TILE_H = 1.0;
const TILE_W = TILE_H * (1600 / 1200); // ≈1.33m

// Clone the shared wallpaper so each wall can tile at a constant physical
// size — texture.repeat is per-texture, and the walls have different widths.
function tiledClone(base: THREE.Texture, repeatX: number, repeatY: number) {
  const t = base.clone();
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

export default function Room() {
  const wallpaper = useTexture("/textures/wallpaper.jpg");
  const wood = useTexture("/textures/floor-wood.jpg");

  const wideWall = useMemo(() => tiledClone(wallpaper, W / TILE_W, H / TILE_H), [wallpaper]);
  const sideWall = useMemo(() => tiledClone(wallpaper, D / TILE_W, H / TILE_H), [wallpaper]);

  const floorTex = useMemo(() => {
    wood.wrapS = THREE.RepeatWrapping;
    wood.wrapT = THREE.RepeatWrapping;
    wood.repeat.set(5, 5);
    wood.colorSpace = THREE.SRGBColorSpace;
    wood.anisotropy = 8;
    wood.needsUpdate = true;
    return wood;
  }, [wood]);

  return (
    <group>
      {/* Floor — wood parquet */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, ROOM_CENTER_Z]} receiveShadow>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial map={floorTex} roughness={0.7} metalness={0} />
      </mesh>

      {/* Celestial oculus ceiling: dark plaster border + star dome + gold ring +
          warm glow + photographic crown moulding + cove light (replaces the old
          flat ceiling and procedural cornice). */}
      <CelestialSalonCeiling roomWidth={W} roomDepth={D} ceilingY={H} centerZ={ROOM_CENTER_Z} />

      {/* Back wall (north) */}
      <mesh position={[0, H / 2, BACK_Z]} receiveShadow>
        <planeGeometry args={[W, H]} />
        <meshStandardMaterial map={wideWall} roughness={0.85} />
      </mesh>

      {/* Front wall (south) */}
      <mesh position={[0, H / 2, FRONT_Z]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[W, H]} />
        <meshStandardMaterial map={wideWall} roughness={0.85} />
      </mesh>

      {/* Left wall (west) */}
      <mesh position={[-HALF_W, H / 2, ROOM_CENTER_Z]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[D, H]} />
        <meshStandardMaterial map={sideWall} roughness={0.85} />
      </mesh>

      {/* Right wall (east) */}
      <mesh position={[HALF_W, H / 2, ROOM_CENTER_Z]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[D, H]} />
        <meshStandardMaterial map={sideWall} roughness={0.85} />
      </mesh>

      {/* Baseboards — all four walls */}
      <mesh position={[0, 0.1, BACK_Z + 0.05]} receiveShadow><boxGeometry args={[W, 0.2, 0.1]} /><meshStandardMaterial color="#2e2014" roughness={0.7} /></mesh>
      <mesh position={[0, 0.1, FRONT_Z - 0.05]} receiveShadow><boxGeometry args={[W, 0.2, 0.1]} /><meshStandardMaterial color="#2e2014" roughness={0.7} /></mesh>
      <mesh position={[HALF_W - 0.05, 0.1, ROOM_CENTER_Z]} receiveShadow><boxGeometry args={[0.1, 0.2, D]} /><meshStandardMaterial color="#2e2014" roughness={0.7} /></mesh>
      <mesh position={[-HALF_W + 0.05, 0.1, ROOM_CENTER_Z]} receiveShadow><boxGeometry args={[0.1, 0.2, D]} /><meshStandardMaterial color="#2e2014" roughness={0.7} /></mesh>
    </group>
  );
}

export const ROOM = { W, H, D, BACK_Z, FRONT_Z, HALF_W, PAINTING_Y: 2.0 };
export const NORTH_X = [-3.5, 0, 3.5];
export const EW_Z = [-4, -1.5, 1];
