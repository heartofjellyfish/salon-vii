"use client";

import { getPaintingTransform, getFacingDir } from "@/lib/gallery-config";
import type { Artwork } from "@/lib/sanity";

// SFMOMA-style "stand back" line: a strip of black tape on the floor, parallel
// to the wall, that visitors must not cross to view the work.
const LINE_DIST = 0.9; // metres out from the wall
const LINE_LENGTH = 2.0; // along the wall
const LINE_WIDTH = 0.05; // strip thickness (toward the room)
const LINE_Y = 0.013; // just above the floor to avoid z-fighting

export default function FloorLine({ artwork }: { artwork: Artwork }) {
  const { position, rotation } = getPaintingTransform(artwork.position);
  const facing = getFacingDir(artwork.position?.wall || "north");
  const [px, , pz] = position;

  return (
    <mesh
      position={[px + facing[0] * LINE_DIST, LINE_Y, pz + facing[2] * LINE_DIST]}
      rotation={[0, rotation[1], 0]}
      receiveShadow
    >
      <boxGeometry args={[LINE_LENGTH, 0.012, LINE_WIDTH]} />
      <meshStandardMaterial color="#0a0a0a" roughness={0.85} metalness={0} />
    </mesh>
  );
}
