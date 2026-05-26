"use client";

// Isolated harness to verify the 9-slice photographic frames independent of the
// gallery scene (no data fetch, no intro, no Sanity). Each frame wraps a
// landscape plane (like the gallery's reused Irises/Starry Night) so we can judge
// how the ornament stretches.
import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { NineSliceFrameFromURL } from "@/components/gallery/NineSliceFrame";

function Framed({ url, fw, pw, ph, x }: { url: string; fw: number; pw: number; ph: number; x: number }) {
  return (
    <group position={[x, 0, 0]}>
      <mesh>
        <planeGeometry args={[pw, ph]} />
        <meshBasicMaterial color="#2f5d86" />
      </mesh>
      <NineSliceFrameFromURL url={url} pw={pw} ph={ph} frameWidth={fw} />
    </group>
  );
}

export default function FrameTestPage() {
  return (
    <Canvas camera={{ position: [0, 0, 5.2], fov: 50 }} style={{ position: "fixed", inset: 0, background: "#202024" }}>
      <ambientLight intensity={1} />
      <Suspense fallback={null}>
        <Framed url="/frames/f2-avantrend233.jpg" fw={0.13} pw={1.4} ph={1.0} x={-2.0} />
        <Framed url="/frames/f3-anaterate.png" fw={0.11} pw={1.4} ph={1.0} x={0} />
        <Framed url="/frames/f4-susannp4.png" fw={0.075} pw={1.4} ph={1.0} x={2.0} />
      </Suspense>
    </Canvas>
  );
}
