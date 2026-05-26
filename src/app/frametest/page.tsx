"use client";

// Isolated harness to verify the 9-slice frame mechanism independent of the
// gallery scene (no data fetch, no intro, no Sanity). Two different aspect
// ratios share one frame texture — corners must stay square, edges stretch.
import { Canvas } from "@react-three/fiber";
import { NineSliceFrame, getPlaceholderFrameTexture } from "@/components/gallery/NineSliceFrame";

function Framed({ pw, ph, x }: { pw: number; ph: number; x: number }) {
  const tex = getPlaceholderFrameTexture();
  return (
    <group position={[x, 0, 0]}>
      <mesh>
        <planeGeometry args={[pw, ph]} />
        <meshBasicMaterial color="#34618e" />
      </mesh>
      <NineSliceFrame texture={tex} pw={pw} ph={ph} frameWidth={0.12} />
    </group>
  );
}

export default function FrameTestPage() {
  return (
    <Canvas
      camera={{ position: [0, 0, 4], fov: 50 }}
      style={{ position: "fixed", inset: 0, background: "#202024" }}
    >
      <ambientLight intensity={1} />
      <Framed pw={1.7} ph={1.0} x={-1.25} />
      <Framed pw={0.8} ph={1.35} x={1.25} />
    </Canvas>
  );
}
