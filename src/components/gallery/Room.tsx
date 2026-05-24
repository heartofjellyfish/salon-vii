"use client";

import { useRef } from "react";

const W = 12, H = 4, D = 8;
const HALF_W = W / 2;
const BACK_Z = -HALF_W;  // -6 (north wall)
const FRONT_Z = BACK_Z + D; // 2 (south wall)
const ROOM_CENTER_Z = (BACK_Z + FRONT_Z) / 2;

export default function Room() {
  return (
    <group>
      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, ROOM_CENTER_Z]} receiveShadow>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial color="#3a2818" roughness={0.7} />
      </mesh>

      {/* Ceiling */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, H, ROOM_CENTER_Z]}>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial color="#0A0508" roughness={0.9} />
      </mesh>

      {/* Back wall (north) */}
      <mesh position={[0, H / 2, BACK_Z]} receiveShadow>
        <planeGeometry args={[W, H]} />
        <meshStandardMaterial color="#5C1822" roughness={0.8} />
      </mesh>

      {/* Front wall (south) */}
      <mesh position={[0, H / 2, FRONT_Z]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[W, H]} />
        <meshStandardMaterial color="#5C1822" roughness={0.8} />
      </mesh>

      {/* Left wall (west) */}
      <mesh position={[-HALF_W, H / 2, ROOM_CENTER_Z]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[D, H]} />
        <meshStandardMaterial color="#5C1822" roughness={0.8} />
      </mesh>

      {/* Right wall (east) */}
      <mesh position={[HALF_W, H / 2, ROOM_CENTER_Z]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[D, H]} />
        <meshStandardMaterial color="#5C1822" roughness={0.8} />
      </mesh>

      {/* Baseboard */}
      <mesh position={[0, 0.075, BACK_Z + 0.04]} receiveShadow>
        <boxGeometry args={[W + 0.1, 0.15, 0.08]} />
        <meshStandardMaterial color="#3d2b1f" roughness={0.6} />
      </mesh>
    </group>
  );
}

export const ROOM = { W, H, D, BACK_Z, FRONT_Z, HALF_W, PAINTING_Y: 2.0 };
export const NORTH_X = [-3.5, 0, 3.5];
export const EW_Z = [-4, -1.5, 1];
