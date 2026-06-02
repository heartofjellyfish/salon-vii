"use client";

// Hall — the SHELL of the 富春 dim hall, pared down to a single-painting focus:
// a big wood floor, the plaster BACK wall (where the scroll hangs), a dark
// wood-beamed ceiling, and framing posts. The left/right side walls (and the
// shoji window) are intentionally gone — this exhibition shows one painting and
// the camera only ever faces the back wall.
//
// Geometry only: NO <Canvas>, NO lights, NO camera, NO scroll/furniture.
// Coordinates (see ./dims): origin at floor centre. x along the long wall; y up
// (floor 0 → ceiling 3.2); z depth (scroll/back wall at z = -2.5, camera on +z).

import { useMemo } from "react";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import { ROOM, BACK_Z, COLORS, FLOOR_TEXTURE, PLASTER_TEXTURE } from "./dims";

const { W, H } = ROOM; // 18 wide, 3.2 tall

// Floor: much larger than the room footprint and pushed toward the camera, so the
// foreground is never an empty (black) void — it reads as wood receding into fog.
const FLOOR_W = 30;
const FLOOR_D = 28;
const FLOOR_CZ = 8;

const CEILING_WOOD = "#3a2c1d";
const BASEBOARD = "#241a10";

// Clone the plaster so the wall tiles at a constant ~6 m physical size, mirrored
// so tile edges meet seamlessly. hMetres divisor assumes a ~3:2 source.
function tiledPlaster(base: THREE.Texture, wMetres: number, hMetres: number) {
  const TILE = 6;
  const t = base.clone();
  t.wrapS = THREE.MirroredRepeatWrapping;
  t.wrapT = THREE.MirroredRepeatWrapping;
  t.repeat.set(wMetres / TILE, hMetres / (TILE * 0.667));
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

// Ceiling beams evenly spaced across x, running along the depth (z).
const BEAM_XS = (() => {
  const xs: number[] = [];
  const n = 8;
  const from = -8;
  const to = 8;
  for (let i = 0; i < n; i++) xs.push(from + ((to - from) * i) / (n - 1));
  return xs;
})();

export function Hall() {
  const wood = useTexture(FLOOR_TEXTURE);
  const floorTex = useMemo(() => {
    wood.wrapS = THREE.RepeatWrapping;
    wood.wrapT = THREE.RepeatWrapping;
    wood.repeat.set(FLOOR_W / 2, FLOOR_D / 2); // ~2 m planks
    wood.colorSpace = THREE.SRGBColorSpace;
    wood.anisotropy = 8;
    wood.needsUpdate = true;
    return wood;
  }, [wood]);

  const plaster = useTexture(PLASTER_TEXTURE);
  const backWallTex = useMemo(() => tiledPlaster(plaster, W, H), [plaster]);

  return (
    <group name="fuchun-hall">
      {/* FLOOR — big, extends well past the camera so the foreground is never black. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, FLOOR_CZ]} receiveShadow>
        <planeGeometry args={[FLOOR_W, FLOOR_D]} />
        <meshStandardMaterial map={floorTex} color={COLORS.woodFloor} roughness={0.55} metalness={0} />
      </mesh>

      {/* BACK WALL (scroll wall) at z = -2.5, facing +z. */}
      <mesh position={[0, H / 2, BACK_Z]} receiveShadow>
        <planeGeometry args={[W, H]} />
        <meshStandardMaterial map={backWallTex} roughness={0.95} metalness={0} />
      </mesh>

      {/* (Side walls, front wall, and the shoji window are intentionally omitted —
          single-painting focus; the camera only faces the back wall.) */}

      {/* CEILING at y = 3.2, facing down — dark warm wood. */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, H, 0]}>
        <planeGeometry args={[W, 5]} />
        <meshStandardMaterial color={CEILING_WOOD} roughness={0.9} metalness={0} />
      </mesh>

      {/* EXPOSED CEILING BEAMS — run across the depth (long axis = z). */}
      {BEAM_XS.map((x) => (
        <mesh key={`beam-${x}`} position={[x, H - 0.07, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.16, 0.24, 5]} />
          <meshStandardMaterial color={COLORS.woodBeam} roughness={0.85} metalness={0} />
        </mesh>
      ))}

      {/* Heavier horizontal header beam along x near the top of the back wall. */}
      <mesh position={[0, 2.95, -2.4]} castShadow receiveShadow>
        <boxGeometry args={[W, 0.3, 0.3]} />
        <meshStandardMaterial color={COLORS.woodBeam} roughness={0.85} metalness={0} />
      </mesh>

      {/* VERTICAL POSTS — frame the back-wall scene at the corners. */}
      {[-8.7, 8.7].map((x) => (
        <group key={`posts-${x}`}>
          <mesh position={[x, H / 2, 2.2]} castShadow receiveShadow>
            <boxGeometry args={[0.22, H, 0.22]} />
            <meshStandardMaterial color={COLORS.woodBeam} roughness={0.85} metalness={0} />
          </mesh>
          <mesh position={[x, H / 2, -2.3]} castShadow receiveShadow>
            <boxGeometry args={[0.22, H, 0.22]} />
            <meshStandardMaterial color={COLORS.woodBeam} roughness={0.85} metalness={0} />
          </mesh>
        </group>
      ))}

      {/* BASEBOARD — back wall only. */}
      <mesh position={[0, 0.06, BACK_Z + 0.05]} receiveShadow>
        <boxGeometry args={[W, 0.12, 0.1]} />
        <meshStandardMaterial color={BASEBOARD} roughness={0.8} metalness={0} />
      </mesh>
    </group>
  );
}
