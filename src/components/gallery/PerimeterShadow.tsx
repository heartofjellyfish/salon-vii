"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";

// Static AO vignette around the PERIMETER of a horizontal plane — the soft darkening a
// real room has where the flat ceiling meets the crown decoration, and where the floor
// meets the baseboards/walls. A multiply decal darkest at its outer edge, fading to
// nothing toward the centre (so the rug / sky oculus in the middle stays untouched).
// Strength + fade come from the parent (Room reads them from the tuning store) so one
// component serves both the ceiling and the floor with their own knobs.
export default function PerimeterShadow({
  size,
  position,
  rotation,
  strength,
  fade,
}: {
  size: [number, number]; // [width, depth] of the plane (m)
  position: [number, number, number];
  rotation: [number, number, number];
  strength: number; // 0..1
  fade: number; // how far the darkening reaches in from the edge (m)
}) {
  const [w, d] = size;
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.CustomBlending,
        blendEquation: THREE.AddEquation,
        blendSrc: THREE.ZeroFactor,
        blendDst: THREE.SrcColorFactor,
        uniforms: { uStr: { value: strength }, uFadeX: { value: 0.1 }, uFadeY: { value: 0.1 } },
        vertexShader:
          "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
        fragmentShader: `
          varying vec2 vUv; uniform float uStr, uFadeX, uFadeY;
          void main(){
            float ex = min(vUv.x, 1.0 - vUv.x);          // distance to nearest L/R edge (0 at edge)
            float ey = min(vUv.y, 1.0 - vUv.y);          // distance to nearest T/B edge
            float a = max(1.0 - smoothstep(0.0, uFadeX, ex), 1.0 - smoothstep(0.0, uFadeY, ey));
            float s = uStr * a;                           // darkest at the perimeter, 0 inside
            gl_FragColor = vec4(vec3(1.0 - s), 1.0);       // 1 = no change; <1 darkens
          }`,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- uniforms updated below
    [],
  );
  useEffect(() => {
    mat.uniforms.uStr.value = strength;
    mat.uniforms.uFadeX.value = Math.max(fade / w, 1e-3);
    mat.uniforms.uFadeY.value = Math.max(fade / d, 1e-3);
  }, [mat, strength, fade, w, d]);
  useEffect(() => () => mat.dispose(), [mat]);

  return (
    <mesh position={position} rotation={rotation} material={mat} renderOrder={-1}>
      <planeGeometry args={[w, d]} />
    </mesh>
  );
}
