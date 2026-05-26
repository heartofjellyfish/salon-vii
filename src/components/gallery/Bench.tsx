"use client";

import { RoundedBox } from "@react-three/drei";

// A backless museum gallery bench: tufted oxblood-leather cushion on a dark
// wood apron, lifted on slim tapered brass legs. Tuned to sit in the warm
// gold/wood palette of the room. Long axis runs along X (parallel to the
// main north wall), so visitors face the back-wall paintings when seated.
const LEN = 1.6;   // length along X
const DEP = 0.5;   // depth along Z
const LEG_H = 0.34;
const APRON_H = 0.07;
const CUSHION_H = 0.16;

const APRON_Y = LEG_H + APRON_H / 2;
const CUSHION_Y = LEG_H + APRON_H + CUSHION_H / 2;

// Inset positions for the four legs.
const LEG_X = LEN / 2 - 0.18;
const LEG_Z = DEP / 2 - 0.12;

function Leg({ x, z }: { x: number; z: number }) {
  return (
    <mesh position={[x, LEG_H / 2, z]} castShadow>
      {/* slim tapered brass leg — wider at the top where it meets the apron */}
      <cylinderGeometry args={[0.018, 0.028, LEG_H, 16]} />
      <meshStandardMaterial color="#c9a84c" metalness={0.9} roughness={0.32} />
    </mesh>
  );
}

// Sunken upholstery buttons (Chesterfield-style tufting) on the cushion top.
function Buttons() {
  const cols = 5;
  const rows = 2;
  const top = CUSHION_Y + CUSHION_H / 2 - 0.015;
  const items: React.ReactNode[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = (c / (cols - 1) - 0.5) * (LEN - 0.36);
      const z = (r / (rows - 1) - 0.5) * (DEP - 0.22);
      items.push(
        <mesh key={`${r}-${c}`} position={[x, top, z]}>
          <sphereGeometry args={[0.022, 16, 12]} />
          <meshStandardMaterial color="#3a1614" roughness={0.5} metalness={0.1} />
        </mesh>
      );
    }
  }
  return <>{items}</>;
}

export default function Bench({ position = [0, 0, -2] as [number, number, number] }) {
  return (
    <group position={position}>
      {/* upholstered leather cushion */}
      <RoundedBox
        args={[LEN, CUSHION_H, DEP]}
        radius={0.05}
        smoothness={4}
        position={[0, CUSHION_Y, 0]}
        castShadow
      >
        <meshStandardMaterial color="#5b2a26" roughness={0.45} metalness={0.08} />
      </RoundedBox>

      <Buttons />

      {/* dark wood apron / frame beneath the cushion */}
      <mesh position={[0, APRON_Y, 0]} castShadow>
        <boxGeometry args={[LEN - 0.04, APRON_H, DEP - 0.04]} />
        <meshStandardMaterial color="#2e2014" roughness={0.6} metalness={0.15} />
      </mesh>

      <Leg x={LEG_X} z={LEG_Z} />
      <Leg x={-LEG_X} z={LEG_Z} />
      <Leg x={LEG_X} z={-LEG_Z} />
      <Leg x={-LEG_X} z={-LEG_Z} />
    </group>
  );
}
