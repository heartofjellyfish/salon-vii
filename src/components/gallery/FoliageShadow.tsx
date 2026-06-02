"use client";

import { useEffect, useState } from "react";
import { useGLTF } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";

// A static, baked DAPPLED leaf-shadow decal on the floor under a tree — the foliage
// version of ContactShadow. The room's floor is baked unlit (LIGHTBAKE.md §1), so it
// can't receive a real-time cast shadow; and per pit #4 we don't want another
// shadow-mapped light. Instead we bake the tree's leaf pattern ONCE and paint it as a
// multiply decal, exactly like the other shadow decals (§3).
//
// Bake: render the foliage straight down (ortho) as a black silhouette on white —
// alpha-card leaves keep their cut-outs (alphaTest), so the result is the true dappled
// breakup of light through the canopy. Multiply blend (dst × src, Zero/SrcColor): the
// gaps stay white (floor unchanged), the leaves write <1 (floor darkened), with a round
// pool falloff so it reads as a soft pool under the tree, not a hard square.
type Props = {
  url: string;
  position: [number, number, number]; // decal centre on the floor
  size: number; // footprint side (m) — match the canopy spread
  strength: number; // 0 = off
  soft?: number; // penumbra: blur radius in texels
};

export default function FoliageShadow({ url, position, size, strength, soft = 1.5 }: Props) {
  const { scene: gltf } = useGLTF(url);
  const gl = useThree((s) => s.gl);
  const [tex, setTex] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    const SIZE = 1024;
    const rt = new THREE.WebGLRenderTarget(SIZE, SIZE, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
      samples: 4,
    });
    const scene = new THREE.Scene();
    const tree = gltf.clone(true);
    const swapped: { mesh: THREE.Mesh; mat: THREE.Material | THREE.Material[] }[] = [];
    tree.traverse((c) => {
      const m = c as THREE.Mesh;
      if (!m.isMesh) return;
      const src = m.material as THREE.MeshStandardMaterial & { alphaMap?: THREE.Texture };
      swapped.push({ mesh: m, mat: m.material });
      m.material = new THREE.MeshBasicMaterial({
        color: 0x000000,
        map: src?.map ?? null,
        alphaMap: src?.alphaMap ?? null,
        alphaTest: src?.map || src?.alphaMap ? 0.3 : 0,
        side: THREE.DoubleSide,
      });
    });
    scene.add(tree);

    const half = size / 2;
    const cam = new THREE.OrthographicCamera(-half, half, half, -half, 0.01, 50);
    cam.position.set(0, 20, 0);
    cam.up.set(0, 0, -1);
    cam.lookAt(0, 0, 0);

    const prevRT = gl.getRenderTarget();
    const prevClear = gl.getClearColor(new THREE.Color());
    const prevAlpha = gl.getClearAlpha();
    gl.setRenderTarget(rt);
    gl.setClearColor(0xffffff, 1); // gap / outside foliage = white = floor unchanged
    gl.clear();
    gl.render(scene, cam);
    gl.setRenderTarget(prevRT);
    gl.setClearColor(prevClear, prevAlpha);

    // restore + free throwaway silhouette materials
    swapped.forEach(({ mesh, mat }) => {
      (mesh.material as THREE.Material).dispose();
      mesh.material = mat;
    });
    setTex(rt.texture);
    return () => rt.dispose();
  }, [gl, gltf, size]);

  if (!tex || strength <= 0) return null;
  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
      <planeGeometry args={[size, size]} />
      <shaderMaterial
        transparent
        depthWrite={false}
        blending={THREE.CustomBlending}
        blendEquation={THREE.AddEquation}
        blendSrc={THREE.ZeroFactor}
        blendDst={THREE.SrcColorFactor}
        uniforms={{
          uMap: { value: tex },
          uStrength: { value: strength },
          uSoft: { value: soft },
          uTexel: { value: new THREE.Vector2(1 / 1024, 1 / 1024) },
        }}
        vertexShader="varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }"
        fragmentShader={`
          varying vec2 vUv;
          uniform sampler2D uMap; uniform float uStrength, uSoft; uniform vec2 uTexel;
          void main(){
            float occ = 0.0;
            for (int x=-1; x<=1; x++) for (int y=-1; y<=1; y++)
              occ += texture2D(uMap, vUv + vec2(float(x),float(y))*uTexel*uSoft).r;
            occ /= 9.0;
            float leaf = 1.0 - occ;                 // black silhouette (0) => leaf => shadow
            float r = length(vUv - 0.5) * 2.0;
            float pool = smoothstep(1.0, 0.55, r);  // round falloff toward the rim
            float s = uStrength * leaf * pool;
            gl_FragColor = vec4(vec3(1.0 - s), 1.0); // 1 = unchanged; <1 darkens (multiply)
          }`}
      />
    </mesh>
  );
}
