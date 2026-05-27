"use client";

import { useMemo, useRef } from "react";
import { useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

// A Baroque "celestial salon" ceiling. The gallery camera is locked to a level
// sightline (the visitor never looks straight up), so the ceiling is only ever
// seen as a glancing band along the top of the frame — which means the sky has
// to be LARGE to be visible at all. So: a warm ivory ceiling with a big central
// oval opening onto a gently domed, living painted sky (deep plum/violet night,
// golden sunset clouds that billow, crisp twinkling stars), framed by an ornate
// gilt ring. Photographic crown moulding + a faint warm cove finish the seam.
//
// The sky is a baked cloud roundel sampled through a slow evolving domain warp
// (clouds churn in place) with crisp procedural stars on top, on a shallow sphere
// cap with planar (top-down) UVs. Authored in sRGB and output raw so it reads as
// luminous and unlit.
//
// NB: the room is NOT centred on the origin — floor/ceiling sit at z = centerZ.

const CROWN_ASPECT = 2048 / 256; // 8:1
const COVE_ASPECT = 2048 / 128; // 16:1
const RING_INNER_FRAC = 0.84; // mean radius of the gold band in the ring decal

const DOME_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const DOME_FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform sampler2D uClouds;
  varying vec2 vUv;

  float hash(vec2 p){ p = fract(p * vec2(123.34, 345.45)); p += dot(p, p + 34.345); return fract(p.x * p.y); }
  float vnoise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    float a = hash(i), b = hash(i + vec2(1.,0.)), c = hash(i + vec2(0.,1.)), d = hash(i + vec2(1.,1.));
    vec2 u = f * f * (3. - 2. * f);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  mat2 rot(float a){ float s = sin(a), c = cos(a); return mat2(c, -s, s, c); }

  void main(){
    vec2 c = vUv - 0.5;
    float r = length(c);
    float t = uTime;

    // Van Gogh "Starry Night" swirl: twist the sample space by a spiral angle
    // that undulates with radius and time (rings of curl flowing outward), fading
    // toward the edges so the centre eddies rather than the whole sky shearing.
    float swirl = 0.95 * sin(r * 4.6 - t * 0.5) * smoothstep(0.74, 0.04, r);
    vec2 suv = rot(swirl) * c + 0.5;

    // billowing clouds on the swirled coords (clearly drifting/morphing)
    vec2 wv = vec2(
      vnoise(suv * 3.5 + vec2(t * 0.10, 0.0)),
      vnoise(suv * 3.5 + vec2(0.0, t * 0.088) + 5.3)
    ) - 0.5;
    vec2 uvc = suv + wv * 0.06;
    vec3 col = texture2D(uClouds, uvc).rgb;

    // stars: a steady one-way wheel (no swirl term, so they don't rock back and
    // forth — the swirl stays on the clouds only), with radiant pulsing halos
    vec2 su = rot(t * 0.03) * c + 0.5;
    vec2 sg = su * 150.0;
    vec2 gi = floor(sg);
    float h = hash(gi);
    float star = 0.0;
    if (h > 0.82) {
      vec2 cc = gi + 0.5 + 0.35 * vec2(hash(gi + 1.3) - 0.5, hash(gi + 2.7) - 0.5);
      float d = length(sg - cc);
      float tw = 0.6 + 0.4 * sin(t * 2.4 + h * 60.0);
      float br = (h - 0.82) / 0.18;
      float core = smoothstep(0.14, 0.0, d);
      float halo = smoothstep(0.52, 0.0, d) * 0.4;   // Van Gogh radiance
      star = (core + halo) * tw * br;
    }
    float cloudAmt = smoothstep(0.30, 0.62, col.r);
    float starVis = 1.0 - 0.92 * cloudAmt;
    col += vec3(1.0, 0.93, 0.74) * star * starVis * 1.7;

    gl_FragColor = vec4(col, 1.0);
  }
`;

// The painted sky on a shallow dome cap (viewer is below → BackSide).
function AnimatedSky({
  geometry,
  position,
  clouds,
  paused = false,
}: {
  geometry: THREE.BufferGeometry;
  position: [number, number, number];
  clouds: THREE.Texture;
  paused?: boolean;
}) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uClouds: { value: clouds } }), [clouds]);
  // Freeze the swirl while the visitor is up close inspecting a painting — the
  // sky is off-screen then, so this spends the animation budget only on the
  // first-impression room overview where it actually shows.
  useFrame((_, dt) => {
    if (!paused && matRef.current) matRef.current.uniforms.uTime.value += Math.min(dt, 0.05);
  });
  return (
    <mesh geometry={geometry} position={position}>
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        vertexShader={DOME_VERT}
        fragmentShader={DOME_FRAG}
        side={THREE.BackSide}
        toneMapped={false}
      />
    </mesh>
  );
}

interface WallSpec {
  key: string;
  width: number;
  position: [number, number, number];
  rotationY: number;
}

export interface CelestialSalonCeilingProps {
  roomWidth: number;
  roomDepth: number;
  ceilingY: number;
  centerZ?: number;
  assetBasePath?: string;
  /** Big oval opening half-axes (kept large so the sky is visible at eye level). */
  openingRadiusX?: number;
  openingRadiusZ?: number;
  /** How far the domed sky bulges above the ceiling (m). */
  domeRise?: number;
  crownHeight?: number;
  coveLightOpacity?: number;
  /** Freeze the sky animation (e.g. while inspecting a painting). */
  paused?: boolean;
}

export default function CelestialSalonCeiling({
  roomWidth,
  roomDepth,
  ceilingY,
  centerZ = 0,
  assetBasePath = "/assets/gallery-ceiling",
  openingRadiusX = 4.85,
  openingRadiusZ = 3.15,
  domeRise = 1.1,
  crownHeight = 0.42,
  coveLightOpacity = 0.35,
  paused = false,
}: CelestialSalonCeilingProps) {
  const [cloudsTex, ringTex, crownTex, coveTex] = useTexture([
    `${assetBasePath}/celestial_dome_clouds_2048.png`,
    `${assetBasePath}/aged_gold_dome_ring_alpha_2048.png`,
    `${assetBasePath}/old_salon_crown_molding_seamless_2048x256.png`,
    `${assetBasePath}/warm_cove_light_strip_alpha_2048x128.png`,
  ]);

  const halfW = roomWidth / 2;
  const halfD = roomDepth / 2;
  const backZ = centerZ - halfD;
  const frontZ = centerZ + halfD;
  const Rx = openingRadiusX;
  const Rz = openingRadiusZ;
  const ratio = Rx / Rz;
  const ovalScale: [number, number, number] = [ratio, 1, 1];

  useMemo(() => {
    cloudsTex.colorSpace = THREE.LinearSRGBColorSpace;
    cloudsTex.wrapS = cloudsTex.wrapT = THREE.ClampToEdgeWrapping;
    cloudsTex.needsUpdate = true;
  }, [cloudsTex]);
  useMemo(() => {
    ringTex.colorSpace = THREE.SRGBColorSpace;
  }, [ringTex]);

  // Shallow sky cap covering the oval; planar UVs map the square painting on.
  const capBaseR = Rx + 0.35;
  const Rs = (capBaseR * capBaseR + domeRise * domeRise) / (2 * domeRise);
  const thetaLength = Math.acos((Rs - domeRise) / Rs);
  const sphereCenterY = ceilingY + domeRise - Rs;
  const domeGeo = useMemo(() => {
    const g = new THREE.SphereGeometry(Rs, 120, 80, 0, Math.PI * 2, 0, thetaLength);
    const pos = g.attributes.position;
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      uv.setXY(i, 0.5 + pos.getX(i) / (2 * capBaseR), 0.5 - pos.getZ(i) / (2 * capBaseR));
    }
    uv.needsUpdate = true;
    return g;
  }, [Rs, thetaLength, capBaseR]);

  // Warm ivory ceiling with the big oval opening.
  const ceilingGeo = useMemo(() => {
    const shape = new THREE.Shape();
    const ex = halfW + 0.1;
    const ez = halfD + 0.1;
    shape.moveTo(-ex, -ez);
    shape.lineTo(ex, -ez);
    shape.lineTo(ex, ez);
    shape.lineTo(-ex, ez);
    shape.lineTo(-ex, -ez);
    const hole = new THREE.Path();
    hole.absellipse(0, 0, Rx, Rz, 0, Math.PI * 2, false, 0);
    shape.holes.push(hole);
    return new THREE.ShapeGeometry(shape, 96);
  }, [halfW, halfD, Rx, Rz]);

  const tiledStrip = (base: THREE.Texture, width: number, bandHeight: number, aspect: number) => {
    const t = base.clone();
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    t.repeat.set(width / (bandHeight * aspect), 1);
    t.needsUpdate = true;
    return t;
  };

  const walls: WallSpec[] = useMemo(
    () => [
      { key: "north", width: roomWidth, position: [0, 0, backZ], rotationY: 0 },
      { key: "south", width: roomWidth, position: [0, 0, frontZ], rotationY: Math.PI },
      { key: "west", width: roomDepth, position: [-halfW, 0, centerZ], rotationY: Math.PI / 2 },
      { key: "east", width: roomDepth, position: [halfW, 0, centerZ], rotationY: -Math.PI / 2 },
    ],
    [roomWidth, roomDepth, halfW, backZ, frontZ, centerZ]
  );

  const crownY = ceilingY - crownHeight / 2;
  const coveHeight = crownHeight * 0.38;
  const coveY = crownY - crownHeight / 2 - coveHeight / 2;

  const crownMats = useMemo(
    () =>
      walls.map((w) =>
        new THREE.MeshBasicMaterial({
          map: tiledStrip(crownTex, w.width, crownHeight, CROWN_ASPECT),
          transparent: true,
          side: THREE.DoubleSide,
          toneMapped: false,
        })
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [walls, crownTex, crownHeight]
  );
  const coveMats = useMemo(
    () =>
      walls.map((w) =>
        new THREE.MeshBasicMaterial({
          map: tiledStrip(coveTex, w.width, coveHeight, COVE_ASPECT),
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          opacity: coveLightOpacity,
          side: THREE.DoubleSide,
          toneMapped: false,
        })
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [walls, coveTex, coveHeight, coveLightOpacity]
  );

  const decalW = (Rx / RING_INNER_FRAC) * 2;
  const decalD = (Rz / RING_INNER_FRAC) * 2;

  return (
    <group>
      {/* Domed living sky behind the oval (viewer below → BackSide) */}
      <AnimatedSky geometry={domeGeo} position={[0, sphereCenterY, centerZ]} clouds={cloudsTex} paused={paused} />

      {/* Warm ivory ceiling with the big oval opening */}
      <mesh geometry={ceilingGeo} position={[0, ceilingY, centerZ]} rotation={[Math.PI / 2, 0, 0]}>
        <meshStandardMaterial color="#e0cfa6" emissive="#39301d" emissiveIntensity={0.32} roughness={0.9} metalness={0} side={THREE.DoubleSide} />
      </mesh>

      {/* Ornate gilt ring framing the opening (painted texture — less "CG") */}
      <mesh position={[0, ceilingY - 0.01, centerZ]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
        <planeGeometry args={[decalW, decalD]} />
        <meshBasicMaterial map={ringTex} transparent depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      {/* a slim lit gold bead at the very lip for a touch of real depth */}
      <mesh position={[0, ceilingY - 0.03, centerZ]} rotation={[Math.PI / 2, 0, 0]} scale={ovalScale}>
        <torusGeometry args={[Rz, 0.07, 22, 170]} />
        <meshStandardMaterial color="#d6ad58" metalness={0.35} roughness={0.45} emissive="#4a3512" emissiveIntensity={0.7} />
      </mesh>

      {/* Photographic crown moulding, lifted slightly proud of each wall */}
      {walls.map((w, i) => {
        const inward = 0.06;
        const dx = Math.sin(w.rotationY) * inward;
        const dz = Math.cos(w.rotationY) * inward;
        return (
          <mesh
            key={`crown-${w.key}`}
            position={[w.position[0] + dx, crownY, w.position[2] + dz]}
            rotation={[0, w.rotationY, 0]}
            material={crownMats[i]}
          >
            <planeGeometry args={[w.width, crownHeight]} />
          </mesh>
        );
      })}

      {/* Faint warm cove light just under the crown */}
      {walls.map((w, i) => {
        const inward = 0.1;
        const dx = Math.sin(w.rotationY) * inward;
        const dz = Math.cos(w.rotationY) * inward;
        return (
          <mesh
            key={`cove-${w.key}`}
            position={[w.position[0] + dx, coveY, w.position[2] + dz]}
            rotation={[0, w.rotationY, 0]}
            material={coveMats[i]}
            renderOrder={1}
          >
            <planeGeometry args={[w.width, coveHeight]} />
          </mesh>
        );
      })}

      {/* Warm wash so the ivory surround reads as lit plaster, not a flat slab */}
      <pointLight color="#ffd9a0" intensity={0.9} distance={10} decay={2} position={[0, ceilingY - 0.6, centerZ]} />
    </group>
  );
}
