"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useTuningStore } from "./tuningStore";

// Static edge-shadow ("ambient occlusion") decal for a wall — the soft darkening a
// real room has where surfaces meet: along the TOP (the ceiling/cove seam) and down
// the vertical CORNERS where two walls meet. N8AO used to compute these every frame;
// they never move, so we paint them once as a multiply-blend vignette on the wall.
//
// One decal per wall, sized to the wall, nudged a hair into the room. Multiply blend
// (dst × src, CustomBlending Zero/SrcColor) darkens the wallpaper through itself, so
// the damask shows in the shadow. Fades are given in METRES (converted to the wall's
// 0..1 UV here) so the band is a consistent thickness on every wall regardless of width.
export default function WallShadow({
  size,
  position,
  rotation = [0, 0, 0],
}: {
  size: [number, number]; // [width, height] of the wall (m)
  position: [number, number, number];
  rotation?: [number, number, number];
}) {
  const cove = useTuningStore((s) => s.coveShadow);
  const coveFade = useTuningStore((s) => s.coveFade);
  const corner = useTuningStore((s) => s.cornerShadow);
  const cornerFade = useTuningStore((s) => s.cornerFade);
  const base = useTuningStore((s) => s.baseShadow);
  const baseFade = useTuningStore((s) => s.baseFade);
  const [w, h] = size;

  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.CustomBlending,
        blendEquation: THREE.AddEquation,
        blendSrc: THREE.ZeroFactor,
        blendDst: THREE.SrcColorFactor,
        uniforms: {
          uTop: { value: cove },
          uSide: { value: corner },
          uBot: { value: base },
          uTopUV: { value: 0.15 },
          uSideUV: { value: 0.06 },
          uBotUV: { value: 0.1 },
        },
        vertexShader:
          "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
        fragmentShader: `
          varying vec2 vUv; uniform float uTop, uSide, uBot, uTopUV, uSideUV, uBotUV;
          void main(){
            float top  = (1.0 - smoothstep(0.0, uTopUV,  1.0 - vUv.y)) * uTop;   // near top edge (cove)
            float bot  = (1.0 - smoothstep(0.0, uBotUV,  vUv.y))        * uBot;   // near bottom edge (baseboard)
            float left = (1.0 - smoothstep(0.0, uSideUV, vUv.x))        * uSide;  // near left corner
            float rght = (1.0 - smoothstep(0.0, uSideUV, 1.0 - vUv.x))  * uSide;  // near right corner
            float s = max(max(top, bot), max(left, rght));
            gl_FragColor = vec4(vec3(1.0 - s), 1.0);                              // 1 = no change; <1 darkens
          }`,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- uniforms updated below
    [],
  );

  useEffect(() => {
    mat.uniforms.uTop.value = cove;
    mat.uniforms.uSide.value = corner;
    mat.uniforms.uBot.value = base;
    mat.uniforms.uTopUV.value = Math.max(coveFade / h, 1e-3); // metres → UV (fraction of height)
    mat.uniforms.uSideUV.value = Math.max(cornerFade / w, 1e-3); // metres → UV (fraction of width)
    mat.uniforms.uBotUV.value = Math.max(baseFade / h, 1e-3); // metres → UV (fraction of height)
  }, [mat, cove, corner, base, coveFade, cornerFade, baseFade, w, h]);
  useEffect(() => () => mat.dispose(), [mat]);

  // renderOrder -1: draw the wall vignette BEFORE the props/plants (which stand in the
  // corners) so they composite over it — the corner shadow sits on the wall behind them,
  // never on top of the plants. (It still draws after the opaque wall, so it multiplies it.)
  return (
    <mesh position={position} rotation={rotation} material={mat} renderOrder={-1}>
      <planeGeometry args={[w, h]} />
    </mesh>
  );
}
