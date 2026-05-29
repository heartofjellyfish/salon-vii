"use client";

import * as THREE from "three";
import { useTuningStore } from "./tuningStore";

interface PaintingLightingProps {
  position: [number, number, number];
  facing: [number, number, number];
  pw: number;
  ph: number;
}

// A gallery picture-light: a warm spotlight mounted above-and-in-front of the
// work — like a ceiling track light — angled down onto it. The canvas is self-lit
// by its own unlit shader, so this lights the FRAME and the WALL around the piece:
// a soft warm pool that fades into the dim room, the way a real museum lights art.
//
// This replaces a per-painting RectAreaLight, which is the single most expensive
// light type in three.js and was charging every fragment in the whole room for all
// nine of them (~29ms/frame, ~77% of the GPU cost). A spotlight is ~an order of
// magnitude cheaper, and the overhead-cone look is the one the salon wants.
const HEIGHT_ABOVE = 1.5; // m above painting centre, toward the ceiling
const FORWARD = 0.9;      // m out from the wall into the room
const DECAY = 2;
const DISTANCE = 7;

export default function PaintingLighting({ position, facing }: PaintingLightingProps) {
  const [fx, , fz] = facing;
  const [px, py, pz] = position;
  const intensity = useTuningStore((s) => s.spotIntensity);
  const angle = useTuningStore((s) => s.spotAngle);
  const penumbra = useTuningStore((s) => s.spotPenumbra);
  const color = useTuningStore((s) => s.spotColor);

  return (
    <spotLight
      userData={{ perfGroup: "paintingLight" }}
      color={color}
      intensity={intensity}
      position={[px + fx * FORWARD, py + HEIGHT_ABOVE, pz + fz * FORWARD]}
      angle={angle}
      penumbra={penumbra}
      decay={DECAY}
      distance={DISTANCE}
      // Aim the cone at the painting centre. The default target never moves, so set
      // its world position once (mirrors the reading-lamp spotlight).
      ref={(l: THREE.SpotLight | null) => {
        if (l) {
          // Layer 1 = "lit by picture spotlights" — only the walls (Room.tsx) and the
          // painting-group meshes opt in. The wall pool stays pixel-identical, but
          // these 9 lights stop shading the floor / sofa / ceiling / plants (the big
          // fill-rate saving). set(1) makes the light affect ONLY layer-1 objects.
          l.layers.set(1);
          l.target.position.set(px, py, pz);
          l.target.updateMatrixWorld();
        }
      }}
    />
  );
}
