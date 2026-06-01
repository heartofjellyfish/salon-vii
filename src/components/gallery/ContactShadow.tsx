"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";

// A soft, static contact-shadow decal — the "grounding" darkening an object casts
// onto the surface it sits on. Replaces real-time N8AO for the few spots that need
// it (under the daybed, etc.): geometry and lights are static, so the shadow is a
// fixed blob we paint once instead of computing every frame.
//
// Multiply blend (dst × src, via CustomBlending Zero/SrcColor — same trick as the
// frame drop-shadow): where the shader outputs white the surface is unchanged, where
// it outputs <1 the surface (rug pattern and all) is darkened, so the detail shows
// THROUGH the shadow instead of being flattened to grey. Radial elliptical falloff:
// darkest at centre, feathered to nothing at the edge.
export default function ContactShadow({
  position,
  size,
  strength,
  feather = 0.5,
  radius = 0.3,
  rotation = [-Math.PI / 2, 0, 0],
}: {
  position: [number, number, number];
  size: [number, number]; // [width, depth] — the object's footprint, so the shadow is a rounded RECT
  strength: number;
  feather?: number; // soft-edge width (normalised) — how far the darkening fades in from the edge
  radius?: number; // 0 = sharp rectangle corners, ~0.5 = very rounded
  rotation?: [number, number, number];
}) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.CustomBlending,
        blendEquation: THREE.AddEquation,
        blendSrc: THREE.ZeroFactor,
        blendDst: THREE.SrcColorFactor,
        uniforms: { uStrength: { value: strength }, uFeather: { value: feather }, uRadius: { value: radius } },
        vertexShader:
          "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
        fragmentShader: `
          varying vec2 vUv; uniform float uStrength, uFeather, uRadius;
          void main(){
            // Rounded-rectangle signed distance in the plane's own [-1,1] space, so the
            // shadow takes the object's RECTANGULAR footprint (the plane is sized W×depth),
            // not an ellipse. sdf < 0 inside; feather the darkening in from the edge.
            vec2 p = (vUv - 0.5) * 2.0;
            float rad = clamp(uRadius, 0.0, 0.95);
            vec2 d = abs(p) - vec2(1.0 - rad);
            float sdf = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - rad;
            float a = smoothstep(0.0, -max(uFeather, 1e-3), sdf);   // 0 at edge → 1 deep inside
            float s = uStrength * a;
            gl_FragColor = vec4(vec3(1.0 - s), 1.0);                 // 1 = no change; <1 darkens
          }`,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- uniforms updated below
    [],
  );
  useEffect(() => {
    mat.uniforms.uStrength.value = strength;
    mat.uniforms.uFeather.value = feather;
    mat.uniforms.uRadius.value = radius;
  }, [mat, strength, feather, radius]);
  useEffect(() => () => mat.dispose(), [mat]);
  return (
    <mesh position={position} rotation={rotation} material={mat} renderOrder={2}>
      <planeGeometry args={size} />
    </mesh>
  );
}
