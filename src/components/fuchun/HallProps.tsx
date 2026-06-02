"use client";

import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

import { COLORS } from "@/components/fuchun/dims";
import { useFuchunTuning } from "./tuningStore";

// Procedural furniture / props for the 富春 dim, warm, minimal hall.
//
// Coordinate system (see dims.ts): origin at floor centre, x along the long
// scroll wall, y up (floor = 0), z depth (scroll/back wall at z = -2.5, open
// camera side at +2.5). The scroll hangs on the back wall, centred at x = 0,
// y ≈ 1.55, so the room reads "facing the painting".
//
// Everything here is geometry only — NO <Canvas>, NO lights, NO camera. The
// scene already enables shadows, so wood / ceramic parts cast + receive.

// ── Dry-branch transforms ─────────────────────────────────────────────────
// Hardcoded so the winter branches look natural but stay stable across renders
// (no Math.random at module scope). Each main branch starts at the jar mouth
// (local y ≈ 0.6) and leans outward; a few carry a shorter sub-branch.
type Branch = {
  // base offset from the jar mouth (local space, mouth ≈ y 0.6)
  pos: [number, number, number];
  // lean: tilt about x and z (radians) — small, varied
  tilt: [number, number, number];
  height: number;
  rTop: number;
  rBot: number;
  // optional sub-branch sprouting partway up
  sub?: {
    along: number; // 0..1 up the parent where it sprouts
    tilt: [number, number, number];
    height: number;
  };
};

const BRANCHES: Branch[] = [
  { pos: [0.0, 0.6, 0.0], tilt: [0.06, 0, -0.04], height: 1.35, rTop: 0.004, rBot: 0.018,
    sub: { along: 0.55, tilt: [0.3, 0, 0.5], height: 0.55 } },
  { pos: [0.03, 0.6, 0.02], tilt: [0.18, 0, 0.22], height: 1.1, rTop: 0.004, rBot: 0.015 },
  { pos: [-0.02, 0.6, 0.03], tilt: [-0.14, 0, 0.16], height: 1.25, rTop: 0.0045, rBot: 0.016,
    sub: { along: 0.6, tilt: [-0.4, 0, -0.35], height: 0.45 } },
  { pos: [0.02, 0.6, -0.03], tilt: [0.1, 0, -0.26], height: 0.95, rTop: 0.004, rBot: 0.014 },
  { pos: [-0.03, 0.6, -0.02], tilt: [-0.22, 0, -0.12], height: 1.15, rTop: 0.004, rBot: 0.015,
    sub: { along: 0.5, tilt: [0.45, 0, 0.3], height: 0.4 } },
  { pos: [0.0, 0.6, 0.0], tilt: [0.24, 0, 0.05], height: 0.8, rTop: 0.0035, rBot: 0.012 },
  { pos: [0.04, 0.6, -0.01], tilt: [0.05, 0, 0.3], height: 1.4, rTop: 0.004, rBot: 0.017 },
];

const BRANCH_COLOR = "#6b5a44";

// A single tapered twig. `length` is its full height; it's positioned so its
// base sits at local origin, then the parent group leans + lifts it.
function Twig({
  length,
  rTop,
  rBot,
}: {
  length: number;
  rTop: number;
  rBot: number;
}) {
  return (
    <mesh position={[0, length / 2, 0]} castShadow>
      <cylinderGeometry args={[rTop, rBot, length, 6]} />
      <meshStandardMaterial color={BRANCH_COLOR} roughness={0.9} metalness={0} />
    </mesh>
  );
}

const BENCH_URL = "/models/fuchun/bench.glb";

// Loads the bench GLB and normalizes it: long horizontal axis → 1 m, centred on
// x/z, seated on the floor (min.y = 0). The caller scales/places it live (?tune).
// Mirrors the gallery Bench.tsx runtime auto-fit.
function FittedBench() {
  const { scene } = useGLTF(BENCH_URL);
  const obj = useMemo(() => {
    const o = scene.clone(true);
    o.position.set(0, 0, 0);
    o.rotation.set(0, 0, 0);
    o.scale.set(1, 1, 1);
    let box = new THREE.Box3().setFromObject(o);
    let size = box.getSize(new THREE.Vector3());
    if (size.z > size.x) o.rotateY(Math.PI / 2); // long axis → X
    box = new THREE.Box3().setFromObject(o);
    size = box.getSize(new THREE.Vector3());
    o.scale.setScalar(1 / Math.max(size.x, size.z, 1e-6)); // long axis → 1 m
    box = new THREE.Box3().setFromObject(o);
    const c = box.getCenter(new THREE.Vector3());
    o.position.x -= c.x;
    o.position.z -= c.z;
    o.position.y -= box.min.y; // seat on the floor
    o.traverse((m) => {
      const mesh = m as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    return o;
  }, [scene]);
  return <primitive object={obj} />;
}
useGLTF.preload(BENCH_URL);

export function HallProps() {
  const benchLen = useFuchunTuning((s) => s.benchLen);
  const benchX = useFuchunTuning((s) => s.benchX);
  const benchZ = useFuchunTuning((s) => s.benchZ);
  const benchRotY = useFuchunTuning((s) => s.benchRotY);

  // Rounded-jar lathe profile: base → belly → narrow mouth (~0.6 m tall).
  const jarPoints = useMemo(
    () =>
      [
        [0.0, 0.0],
        [0.14, 0.0],
        [0.16, 0.04],
        [0.22, 0.18],
        [0.24, 0.3],
        [0.2, 0.46],
        [0.13, 0.55],
        [0.12, 0.6],
      ].map(([x, y]) => new THREE.Vector2(x, y)),
    [],
  );

  return (
    <group>
      {/* ── 1. Bench — real GLB, auto-fit to 1 m then scaled/placed live via ?tune ── */}
      <group position={[benchX, 0, benchZ]} rotation={[0, benchRotY, 0]} scale={benchLen}>
        <FittedBench />
      </group>

      {/* ── 2. Ceramic jar + dry winter branches (back-right corner) ─────── */}
      <group position={[7.0, 0, -1.5]}>
        {/* jar — lathe of revolution, seated on the floor */}
        <mesh castShadow receiveShadow>
          <latheGeometry args={[jarPoints, 24]} />
          <meshStandardMaterial color={COLORS.ceramic} roughness={0.55} metalness={0.05} />
        </mesh>
        {/* sparse, splayed dry branches rising from the mouth */}
        {BRANCHES.map((b, i) => (
          <group key={i} position={b.pos} rotation={b.tilt}>
            <Twig length={b.height} rTop={b.rTop} rBot={b.rBot} />
            {b.sub && (
              <group
                position={[0, b.height * b.sub.along, 0]}
                rotation={b.sub.tilt}
              >
                <Twig length={b.sub.height} rTop={0.003} rBot={0.009} />
              </group>
            )}
          </group>
        ))}
      </group>

      {/* ── 3. Info plaque / 说明牌 (near the left) ──────────────────────── */}
      <group position={[-6.3, 0, 0.7]}>
        {/* small base */}
        <mesh position={[0, 0.02, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.22, 0.04, 0.22]} />
          <meshStandardMaterial color={COLORS.woodBeam} roughness={0.8} metalness={0} />
        </mesh>
        {/* vertical post */}
        <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.05, 0.95, 0.05]} />
          <meshStandardMaterial color={COLORS.woodBeam} roughness={0.8} metalness={0} />
        </mesh>
        {/* angled placard at the top — dark frame + light face, tilted back ~30° */}
        <group position={[0, 0.97, 0.04]} rotation={[-Math.PI / 6, 0, 0]}>
          {/* frame */}
          <mesh castShadow receiveShadow>
            <boxGeometry args={[0.34, 0.24, 0.02]} />
            <meshStandardMaterial color={COLORS.woodBeam} roughness={0.8} metalness={0} />
          </mesh>
          {/* light face, set just proud of the frame */}
          <mesh position={[0, 0, 0.012]} receiveShadow>
            <boxGeometry args={[0.3, 0.2, 0.01]} />
            <meshStandardMaterial color="#e8dcc6" roughness={0.9} metalness={0} />
          </mesh>
        </group>
      </group>
    </group>
  );
}
