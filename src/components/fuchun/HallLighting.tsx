"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import { ROOM, SCROLL, BACK_Z, COLORS } from "@/components/fuchun/dims";
import { useFuchunTuning } from "./tuningStore";

/**
 * Lighting for the dim hall. No baked lightmaps (yet): a low warm ambient, a
 * warm rect-area wall-wash grazing the scroll, a cool soft daylight through the
 * left shoji window, and one shadow-casting key so the furniture isn't flat.
 */
export function HallLighting() {
  const wash = useRef<THREE.RectAreaLight>(null);
  const wallFill = useRef<THREE.RectAreaLight>(null);
  const win = useRef<THREE.RectAreaLight>(null);
  const t = useFuchunTuning();

  useEffect(() => {
    RectAreaLightUniformsLib.init();
  }, []);

  useEffect(() => {
    // rect-area lights emit toward their local -z; aim them after mount.
    wash.current?.lookAt(0, SCROLL.centerY, BACK_Z);
    wallFill.current?.lookAt(0, 1.6, BACK_Z);
    win.current?.lookAt(2, 1.6, 0);
  });

  return (
    <group>
      <ambientLight intensity={t.ambient} color={"#ffe6c4"} />
      <hemisphereLight args={["#3a2f22", "#0c0a07", 0.25]} />

      {/* warm concealed-LED wall-wash over the scroll */}
      <rectAreaLight
        ref={wash}
        position={[0, SCROLL.centerY, BACK_Z + 0.35]}
        width={SCROLL.width + 1}
        height={1.0}
        intensity={t.wallWash}
        color={COLORS.warmLight}
      />

      {/* broad, dim warm wash so the whole back wall reads as lit plaster */}
      <rectAreaLight
        ref={wallFill}
        position={[0, 1.6, BACK_Z + 0.5]}
        width={ROOM.W}
        height={ROOM.H}
        intensity={t.wallFill}
        color={"#ffdca8"}
      />

      {/* soft warm fill low-front: lifts the wood floor and the bench face */}
      <pointLight position={[0, 1.1, 1.2]} intensity={5} distance={10} decay={2} color={"#ffce93"} />

      {/* soft cool daylight through the left shoji window */}
      <rectAreaLight
        ref={win}
        position={[-8.7, 1.7, 0]}
        width={3}
        height={1.8}
        intensity={t.windowLight}
        color={"#bcd3e0"}
      />

      {/* gentle warm key from above-front: lifts bench/vase and casts the only shadow */}
      <spotLight
        position={[0, 3.0, 2.4]}
        angle={0.7}
        penumbra={1}
        intensity={t.spot}
        distance={16}
        decay={2}
        color={"#ffd9a8"}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0004}
      />
    </group>
  );
}
