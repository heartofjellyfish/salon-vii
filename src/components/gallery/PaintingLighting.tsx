"use client";

import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import { ACTIVE_LIGHTING } from "@/lib/lighting";

// RectAreaLight needs its lookup textures initialised once before use.
RectAreaLightUniformsLib.init();

interface PaintingLightingProps {
  position: [number, number, number];
  facing: [number, number, number];
  pw: number;
  ph: number;
}

export default function PaintingLighting({ position, facing, pw, ph }: PaintingLightingProps) {
  const [fx, , fz] = facing;
  const [px, py, pz] = position;
  const { accent } = ACTIVE_LIGHTING;

  // A soft area light in front of the canvas, facing the wall — a rectangular
  // picture-light. Sized a little larger than the painting so the wash is gentle
  // and rectangular (no elliptical spotlight scallop).
  return (
    <rectAreaLight
      color={accent.color}
      intensity={accent.intensity}
      width={pw + accent.pad}
      height={ph + accent.pad}
      position={[px + fx * accent.frontOffset, py, pz + fz * accent.frontOffset]}
      rotation={[0, Math.atan2(fx, fz), 0]}
    />
  );
}
