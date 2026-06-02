"use client";

import { Suspense, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useRouter } from "next/navigation";
import * as THREE from "three";
import { FuchunHall } from "@/components/fuchun/FuchunHall";
import PerfOverlay from "@/components/gallery/PerfOverlay";

// ?tune leva panel — dynamically imported so leva never ships to normal visitors.
const FuchunTuningPanel = dynamic(() => import("@/components/fuchun/FuchunTuningPanel"), {
  ssr: false,
});

/**
 * 富春长廊 — the 3D dim hall. The whole scroll hangs flat on the long wall;
 * clicking it opens the full-resolution deep-zoom viewer at /scroll.
 */
export default function FuchunRoomPage() {
  const router = useRouter();
  const [tune, setTune] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("tune")) {
      setTune(true);
    }
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#0d0b08" }}>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [0, 1.5, 6.0], fov: 58, near: 0.1, far: 120 }}
        gl={{ antialias: true }}
        onCreated={({ gl, scene }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 0.78;
          scene.fog = new THREE.Fog("#0d0b08", 11, 36);
        }}
      >
        <color attach="background" args={["#0d0b08"]} />
        <Suspense fallback={null}>
          <FuchunHall onOpenScroll={() => router.push("/scroll")} />
        </Suspense>
        <OrbitControls
          makeDefault
          target={[0, 1.5, -2.5]}
          enablePan={false}
          minDistance={3}
          maxDistance={9}
          minPolarAngle={Math.PI / 4}
          maxPolarAngle={Math.PI / 2.02}
          minAzimuthAngle={-Math.PI / 4}
          maxAzimuthAngle={Math.PI / 4}
        />
      </Canvas>

      <div
        style={{
          position: "absolute",
          top: 18,
          left: 22,
          color: "#e8dcc6",
          pointerEvents: "none",
          textShadow: "0 1px 6px rgba(0,0,0,0.6)",
        }}
      >
        <div style={{ fontSize: 19, letterSpacing: 2 }}>富春长廊 · 《富春山居图》</div>
        <div style={{ fontSize: 12, opacity: 0.65, letterSpacing: 1, marginTop: 2 }}>
          Fuchun Scroll Hall · Dwelling in the Fuchun Mountains
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 16,
          left: 22,
          color: "#cabfa6",
          fontSize: 12,
          opacity: 0.6,
          letterSpacing: 0.5,
          pointerEvents: "none",
        }}
      >
        拖动环视 · 滚轮缩放 · 点击画卷进入高清长卷　Drag to look · scroll to zoom · click the scroll
      </div>

      {/* ?perf (or backtick) — standing FPS / draw-call / memory readout (shared with the gallery) */}
      <PerfOverlay />
      {/* ?tune — live lighting panel */}
      {tune && <FuchunTuningPanel />}
    </div>
  );
}
