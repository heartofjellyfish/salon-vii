"use client";

// Isolated harness to verify the photographic 9-slice frames + normal-map relief
// respond to light. A single directional light rakes across the frames so the
// molding profile should show clear lit/shaded sides (not a flat sticker).
import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { NineSliceFrameFromURL } from "@/components/gallery/NineSliceFrame";

function Framed({ url, normalUrl, fw, pw, ph, x }: { url: string; normalUrl: string; fw: number; pw: number; ph: number; x: number }) {
  return (
    <group position={[x, 0, 0]}>
      <mesh>
        <planeGeometry args={[pw, ph]} />
        <meshBasicMaterial color="#2f5d86" />
      </mesh>
      <NineSliceFrameFromURL url={url} normalUrl={normalUrl} pw={pw} ph={ph} frameWidth={fw} />
    </group>
  );
}

export default function FrameTestPage() {
  return (
    <Canvas camera={{ position: [0, 0, 4.6], fov: 50 }} style={{ position: "fixed", inset: 0, background: "#15131a" }}>
      <ambientLight intensity={0.4} color="#c4b8aa" />
      <hemisphereLight args={["#fff4e6", "#2a2030", 0.5]} />
      <directionalLight position={[-3, 2.5, 3]} intensity={2.2} color="#fff2e0" />
      <Suspense fallback={null}>
        <Framed url="/frames/f2-avantrend233.jpg" normalUrl="/frames/f2-normal.png" fw={0.13} pw={1.4} ph={1.0} x={-2.0} />
        <Framed url="/frames/f3-anaterate.png" normalUrl="/frames/f3-normal.png" fw={0.11} pw={1.4} ph={1.0} x={0} />
        <Framed url="/frames/f4-susannp4.png" normalUrl="/frames/f4-normal.png" fw={0.075} pw={1.4} ph={1.0} x={2.0} />
      </Suspense>
    </Canvas>
  );
}
