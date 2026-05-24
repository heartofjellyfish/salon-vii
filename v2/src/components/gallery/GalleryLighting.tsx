"use client";

export default function GalleryLighting() {
  return (
    <group>
      <ambientLight intensity={0.08} color="#1a0f05" />
      <hemisphereLight args={["#3A0A10", "#0A0508", 0.12]} />
    </group>
  );
}
