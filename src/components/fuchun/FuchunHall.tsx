"use client";

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { ContactShadows } from "@react-three/drei";
import { HallLighting } from "./HallLighting";
import { Hall } from "./Hall";
import { ScrollWall } from "./ScrollWall";
import { HallProps } from "./HallProps";
import { useFuchunTuning } from "./tuningStore";
import { PerfProbe } from "@/components/gallery/Perf";

// Live-applies the tuned renderer exposure (the rest of the tune knobs are light
// intensities read directly inside HallLighting).
function ExposureSync() {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const exposure = useFuchunTuning((s) => s.exposure);
  useEffect(() => {
    gl.toneMappingExposure = exposure;
    invalidate();
  }, [gl, exposure, invalidate]);
  return null;
}

/** Assembles the full 富春 dim hall: perf probe + lighting + room + wall scroll + props. */
export function FuchunHall({ onOpenScroll }: { onOpenScroll: () => void }) {
  return (
    <group>
      <PerfProbe />
      <ExposureSync />
      <HallLighting />
      <Hall />
      {/* Soft grounded contact shadow under the centre props (bench etc.). */}
      <ContactShadows
        position={[0, 0.012, 1.0]}
        scale={14}
        resolution={1024}
        blur={2.2}
        opacity={0.85}
        far={1.8}
        color="#0a0702"
      />
      <ScrollWall onOpen={onOpenScroll} />
      <HallProps />
    </group>
  );
}
