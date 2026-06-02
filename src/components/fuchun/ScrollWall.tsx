"use client";

// 黄公望《富春山居图》 mounted as a handscroll on the dim hall's back wall: a dark
// recessed backing frames a LINEN fabric mount (裱件) carrying the painting, with a
// wooden roller (轴) + knob caps (轴头) at each end. The painting reads as softly
// self-lit silk and is the click target → onOpen(). No <Canvas> / scene lights here.

import { useMemo, useState } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import { SCROLL, Z, COLORS, SCROLL_TEXTURE, LINEN_TEXTURE } from "@/components/fuchun/dims";

const EMISSIVE_REST = 0.5;
const EMISSIVE_HOVER = 0.8;

// Fabric mount (裱件): a slim linen border around the painting; rollers hug its ends.
const MOUNT_PAD_X = 0.15; // side border (kept small so the rollers sit close to the painting)
const MOUNT_PAD_Y = 0.12; // top/bottom border
const MOUNT_W = SCROLL.width + MOUNT_PAD_X * 2;
const MOUNT_H = SCROLL.height + MOUNT_PAD_Y * 2;

// Dark recessed backing behind the mount (a thin dark frame around the cloth).
const BACK_PAD = 0.2;
const BACK_W = MOUNT_W + BACK_PAD * 2;
const BACK_H = MOUNT_H + BACK_PAD * 2;
const BACKING_Z = Z.wall + 0.005; // just in front of the wall, behind the mount

const ROLLER_X = MOUNT_W / 2; // ends of the mount (≈ painting edge + the slim border)
const ROLLER_R = 0.045;
const ROLLER_H = MOUNT_H + 0.18; // sticks out a touch beyond top/bottom
const KNOB_R = 0.07;

export function ScrollWall({ onOpen }: { onOpen: () => void }) {
  const [hovered, setHovered] = useState(false);

  const tex = useTexture(SCROLL_TEXTURE);
  useMemo(() => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 16;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.needsUpdate = true;
  }, [tex]);

  const linen = useTexture(LINEN_TEXTURE);
  const linenTex = useMemo(() => {
    linen.colorSpace = THREE.SRGBColorSpace;
    linen.wrapS = THREE.MirroredRepeatWrapping;
    linen.wrapT = THREE.MirroredRepeatWrapping;
    linen.repeat.set(MOUNT_W / 0.35, MOUNT_H / 0.35);
    linen.anisotropy = 8;
    linen.needsUpdate = true;
    return linen;
  }, [linen]);

  const emissiveColor = useMemo(() => new THREE.Color("#ffffff"), []);

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onOpen();
  };
  const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHovered(true);
    document.body.style.cursor = "pointer";
  };
  const handlePointerOut = () => {
    setHovered(false);
    document.body.style.cursor = "";
  };

  return (
    <group>
      {/* DARK RECESSED BACKING — a thin dark frame behind the cloth */}
      <mesh position={[0, SCROLL.centerY, BACKING_Z]}>
        <planeGeometry args={[BACK_W, BACK_H]} />
        <meshStandardMaterial color="#0c0a06" roughness={0.9} metalness={0} />
      </mesh>

      {/* FABRIC MOUNT (裱件) — linen cloth around the painting */}
      <mesh position={[0, SCROLL.centerY, Z.backing]} receiveShadow>
        <planeGeometry args={[MOUNT_W, MOUNT_H]} />
        <meshStandardMaterial map={linenTex} roughness={0.95} metalness={0} />
      </mesh>

      {/* WOODEN ROLLERS (轴) at the two ends, with knob caps (轴头) */}
      {[-ROLLER_X, ROLLER_X].map((x) => (
        <group key={x} position={[x, SCROLL.centerY, Z.scroll + 0.02]}>
          <mesh castShadow>
            <cylinderGeometry args={[ROLLER_R, ROLLER_R, ROLLER_H, 16]} />
            <meshStandardMaterial color={COLORS.woodWarm} roughness={0.5} metalness={0.05} />
          </mesh>
          {[ROLLER_H / 2, -ROLLER_H / 2].map((y) => (
            <mesh key={y} position={[0, y, 0]} castShadow>
              <sphereGeometry args={[KNOB_R, 16, 12]} />
              <meshStandardMaterial color={COLORS.woodBeam} roughness={0.4} metalness={0.05} />
            </mesh>
          ))}
        </group>
      ))}

      {/* THE PAINTING — softly self-lit silk; the clickable / hoverable hit area. */}
      <mesh
        position={[0, SCROLL.centerY, Z.scroll]}
        onClick={handleClick}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
      >
        <planeGeometry args={[SCROLL.width, SCROLL.height]} />
        <meshStandardMaterial
          map={tex}
          emissiveMap={tex}
          emissive={emissiveColor}
          emissiveIntensity={hovered ? EMISSIVE_HOVER : EMISSIVE_REST}
          roughness={0.9}
          toneMapped
        />
      </mesh>
    </group>
  );
}
