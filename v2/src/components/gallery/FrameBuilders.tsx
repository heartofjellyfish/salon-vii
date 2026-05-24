"use client";

import { useMemo } from "react";
import * as THREE from "three";

interface FrameProps {
  pw: number;
  ph: number;
}

export function BaroqueGoldFrame({ pw, ph }: FrameProps) {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: 0xC4963A, roughness: 0.4, metalness: 0.7 }), []);
  const hw = pw / 2, hh = ph / 2, ft = 0.05, fd = 0.06;

  return (
    <group>
      {/* Outer bars */}
      <mesh position={[0, hh + ft / 2, fd / 2]} material={mat}>
        <boxGeometry args={[pw + ft * 2, ft, fd]} />
      </mesh>
      <mesh position={[0, -hh - ft / 2, fd / 2]} material={mat}>
        <boxGeometry args={[pw + ft * 2, ft, fd]} />
      </mesh>
      <mesh position={[-hw - ft / 2, 0, fd / 2]} material={mat}>
        <boxGeometry args={[ft, ph, fd]} />
      </mesh>
      <mesh position={[hw + ft / 2, 0, fd / 2]} material={mat}>
        <boxGeometry args={[ft, ph, fd]} />
      </mesh>
      {/* Inner strips */}
      <mesh position={[0, hh - 0.0125, fd / 2 + 0.005]} material={mat}>
        <boxGeometry args={[pw - ft, 0.025, fd]} />
      </mesh>
      <mesh position={[0, -hh + 0.0125, fd / 2 + 0.005]} material={mat}>
        <boxGeometry args={[pw - ft, 0.025, fd]} />
      </mesh>
      <mesh position={[-hw + 0.0125, 0, fd / 2 + 0.005]} material={mat}>
        <boxGeometry args={[0.025, ph - ft * 2, fd]} />
      </mesh>
      <mesh position={[hw - 0.0125, 0, fd / 2 + 0.005]} material={mat}>
        <boxGeometry args={[0.025, ph - ft * 2, fd]} />
      </mesh>
    </group>
  );
}

export function RawWoodFrame({ pw, ph }: FrameProps) {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x5C3A1E, roughness: 0.9, metalness: 0.0 }), []);
  const hw = pw / 2, hh = ph / 2, ft = 0.06, fd = 0.04;

  return (
    <group>
      <mesh position={[0, hh + ft / 2, fd / 2]} material={mat}>
        <boxGeometry args={[pw + ft * 2, ft, fd]} />
      </mesh>
      <mesh position={[0, -hh - ft / 2, fd / 2]} material={mat}>
        <boxGeometry args={[pw + ft * 2, ft, fd]} />
      </mesh>
      <mesh position={[-hw - ft / 2, 0, fd / 2]} material={mat}>
        <boxGeometry args={[ft, ph, fd]} />
      </mesh>
      <mesh position={[hw + ft / 2, 0, fd / 2]} material={mat}>
        <boxGeometry args={[ft, ph, fd]} />
      </mesh>
    </group>
  );
}

export function CopperSlimFrame({ pw, ph }: FrameProps) {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x7A5A2A, roughness: 0.35, metalness: 0.8 }), []);
  const hw = pw / 2, hh = ph / 2, ft = 0.03, fd = 0.04;

  return (
    <group>
      <mesh position={[0, hh + ft / 2, fd / 2]} material={mat}>
        <boxGeometry args={[pw + ft * 2, ft, fd]} />
      </mesh>
      <mesh position={[0, -hh - ft / 2, fd / 2]} material={mat}>
        <boxGeometry args={[pw + ft * 2, ft, fd]} />
      </mesh>
      <mesh position={[-hw - ft / 2, 0, fd / 2]} material={mat}>
        <boxGeometry args={[ft, ph, fd]} />
      </mesh>
      <mesh position={[hw + ft / 2, 0, fd / 2]} material={mat}>
        <boxGeometry args={[ft, ph, fd]} />
      </mesh>
    </group>
  );
}

export function FrameGroup({ frameStyle, pw, ph }: { frameStyle: string; pw: number; ph: number }) {
  switch (frameStyle) {
    case 'baroque_gold': return <BaroqueGoldFrame pw={pw} ph={ph} />;
    case 'raw_wood': return <RawWoodFrame pw={pw} ph={ph} />;
    case 'copper_slim': return <CopperSlimFrame pw={pw} ph={ph} />;
    default: return <BaroqueGoldFrame pw={pw} ph={ph} />;
  }
}
