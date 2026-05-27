"use client";

import { useMemo, useRef } from "react";
import { useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

// ── Animated painted sky ─────────────────────────────────────────────────────
// A self-contained dome shader: a deep indigo zenith easing into warm, sunset-lit
// clouds at the rim, with the clouds drifting/billowing (domain-warped fBm over
// time) and the stars twinkling on a grid that wheels slowly about the zenith.
// Authored in sRGB and output raw (no tone-map / colour-space chunk) to match the
// other unlit ceiling art.
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
    float rn = length(c) * 2.0;     // 0 at zenith, 1 at the rim

    // Gently billowing clouds: sample the baked cloud roundel through a slow,
    // evolving domain warp so the (high-quality) clouds churn/morph in place.
    float t = uTime;
    vec2 wv = vec2(
      vnoise(vUv * 3.5 + vec2(t * 0.03, 0.0)),
      vnoise(vUv * 3.5 + vec2(0.0, t * 0.027) + 5.3)
    ) - 0.5;
    vec2 uvc = vUv + wv * 0.045;
    vec3 col = texture2D(uClouds, uvc).rgb;

    // Crisp twinkling stars on a slowly wheeling grid, hidden behind bright cloud.
    vec2 su = rot(uTime * 0.004) * c + 0.5;
    vec2 sg = su * 150.0;
    vec2 gi = floor(sg);
    float h = hash(gi);
    float star = 0.0;
    if (h > 0.82) {
      vec2 cc = gi + 0.5 + 0.35 * vec2(hash(gi + 1.3) - 0.5, hash(gi + 2.7) - 0.5);
      float d = length(sg - cc);
      float tw = 0.62 + 0.38 * sin(uTime * 2.2 + h * 60.0);
      float br = (h - 0.82) / 0.18;
      star = smoothstep(0.16, 0.0, d) * tw * br;
    }
    // Hide stars only behind the golden clouds (high red), not the blue sky, and
    // keep them across the dome — fading only in the last sliver near the frame.
    float cloudAmt = smoothstep(0.30, 0.62, col.r);
    float starVis = (1.0 - 0.9 * cloudAmt) * smoothstep(1.02, 0.82, rn);
    col += vec3(1.0, 0.94, 0.76) * star * starVis * 1.6;

    gl_FragColor = vec4(col, 1.0);
  }
`;

function AnimatedDomeSky({
  geometry,
  position,
  clouds,
}: {
  geometry: THREE.BufferGeometry;
  position: [number, number, number];
  clouds: THREE.Texture;
}) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({ uTime: { value: 0 }, uClouds: { value: clouds } }),
    [clouds]
  );
  useFrame((_, dt) => {
    if (matRef.current) matRef.current.uniforms.uTime.value += Math.min(dt, 0.05);
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

// A Baroque "celestial salon" ceiling: the flat ceiling becomes a dark plaster
// field with a large central OVAL opening, ringed by a 3-D gilt frame, that opens
// onto a gently domed painted sky — a deep starry zenith easing into warm,
// sunset-lit clouds at the rim. A warm glow pools around the opening, photographic
// crown moulding finishes the wall/ceiling seam, and a faint cove light spills
// beneath it.
//
// The sky is a SQUARE radial painting mapped PLANAR (top-down) onto a shallow
// sphere cap, so it reads like a painted roundel seen from below — no equirect
// pole pinch, no deep-well distortion.
//
// NB: the gallery room is NOT centred on the origin — its floor/ceiling sit at
// z = centerZ. Everything here is offset by centerZ to match.

const RING_INNER_FRAC = 0.84; // mean radius of the gold band inside the decal
const CROWN_ASPECT = 2048 / 256; // 8:1
const COVE_ASPECT = 2048 / 128; // 16:1

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
  /** Oval opening half-axis along the room width. */
  openingRadiusX?: number;
  /** Oval opening half-axis along the room depth. */
  openingRadiusZ?: number;
  /** How far the painted dome bulges above the ceiling (m). */
  domeRise?: number;
  /** Thickness of the gilt frame bead. */
  frameTube?: number;
  /** Visual height of the crown moulding band (m). */
  crownHeight?: number;
  /** Opacity of the additive cove-light strip under the crown. */
  coveLightOpacity?: number;
  /** Opacity of the warm radial glow around the oculus. */
  glowOpacity?: number;
  /** Decorative L-blocks tucked into the top corners (off by default). */
  showCornerBlocks?: boolean;
}

export default function CelestialSalonCeiling({
  roomWidth,
  roomDepth,
  ceilingY,
  centerZ = 0,
  assetBasePath = "/assets/gallery-ceiling",
  openingRadiusX = 4.7,
  openingRadiusZ = 3.15,
  domeRise = 1.3,
  frameTube = 0.17,
  crownHeight = 0.42,
  coveLightOpacity = 0.35,
  glowOpacity = 0.5,
  showCornerBlocks = false,
}: CelestialSalonCeilingProps) {
  const [cloudsTex, ringTex, crownTex, coveTex, glowTex, cornerTex] = useTexture([
    `${assetBasePath}/celestial_dome_clouds_2048.png`,
    `${assetBasePath}/aged_gold_dome_ring_alpha_2048.png`,
    `${assetBasePath}/old_salon_crown_molding_seamless_2048x256.png`,
    `${assetBasePath}/warm_cove_light_strip_alpha_2048x128.png`,
    `${assetBasePath}/warm_top_glow_alpha_1024.png`,
    `${assetBasePath}/old_salon_crown_corner_alpha_512.png`,
  ]);

  const halfW = roomWidth / 2;
  const halfD = roomDepth / 2;
  const backZ = centerZ - halfD;
  const frontZ = centerZ + halfD;

  useMemo(() => {
    for (const t of [ringTex, glowTex, cornerTex]) t.colorSpace = THREE.SRGBColorSpace;
  }, [ringTex, glowTex, cornerTex]);

  // Cloud roundel is sampled in a raw shader that outputs unmanaged colour, so
  // keep it linear (no sRGB decode) — the authored sRGB texels pass through as-is.
  useMemo(() => {
    cloudsTex.colorSpace = THREE.LinearSRGBColorSpace;
    cloudsTex.wrapS = cloudsTex.wrapT = THREE.ClampToEdgeWrapping;
    cloudsTex.needsUpdate = true;
  }, [cloudsTex]);

  // --- shallow painted-sky cap -----------------------------------------------
  // Circular cap that comfortably covers the oval opening; planar UVs map the
  // square painting's inscribed disc onto it (centre → zenith, edge → rim).
  const capBaseR = Math.max(openingRadiusX, openingRadiusZ) + 0.5;
  const Rs = (capBaseR * capBaseR + domeRise * domeRise) / (2 * domeRise);
  const thetaLength = Math.acos((Rs - domeRise) / Rs);
  const sphereCenterY = ceilingY + domeRise - Rs;

  const domeGeo = useMemo(() => {
    const g = new THREE.SphereGeometry(Rs, 120, 80, 0, Math.PI * 2, 0, thetaLength);
    const pos = g.attributes.position;
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      uv.setXY(i, 0.5 + x / (2 * capBaseR), 0.5 - z / (2 * capBaseR));
    }
    uv.needsUpdate = true;
    return g;
  }, [Rs, thetaLength, capBaseR]);

  // Dark plaster ceiling with the oval opening cut out of the centre.
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
    hole.absellipse(0, 0, openingRadiusX, openingRadiusZ, 0, Math.PI * 2, false, 0);
    shape.holes.push(hole);
    return new THREE.ShapeGeometry(shape, 96);
  }, [halfW, halfD, openingRadiusX, openingRadiusZ]);

  // Per-wall moulding/cove clones so each wall tiles the strip at a constant
  // physical size (texture.repeat is per-texture).
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

  const crownY = ceilingY - crownHeight / 2; // top edge meets the ceiling
  const coveHeight = crownHeight * 0.38;
  const coveY = crownY - crownHeight / 2 - coveHeight / 2; // just below the crown

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

  // Gilt frame: a fat gold bead following the oval edge, plus the ornamental
  // decal laid flat just behind it for the carved diamond detail.
  const frameMajor = (openingRadiusX + openingRadiusZ) / 2;
  const frameScale: [number, number, number] = [
    openingRadiusX / frameMajor,
    openingRadiusZ / frameMajor,
    1,
  ];
  const decalW = (openingRadiusX / RING_INNER_FRAC) * 2;
  const decalD = (openingRadiusZ / RING_INNER_FRAC) * 2;
  const glowW = openingRadiusX * 2.3;
  const glowD = openingRadiusZ * 2.6;

  return (
    <group>
      {/* Plaster ceiling field with the oval opening — a warm deep plum so the
          surround reads as a lit ceiling, not a black void. */}
      <mesh geometry={ceilingGeo} position={[0, ceilingY, centerZ]} rotation={[Math.PI / 2, 0, 0]}>
        <meshStandardMaterial color="#3e3038" emissive="#1a1012" emissiveIntensity={0.35} roughness={0.98} metalness={0} side={THREE.DoubleSide} />
      </mesh>

      {/* Animated painted sky on a shallow dome cap (viewer is below → BackSide) */}
      <AnimatedDomeSky geometry={domeGeo} position={[0, sphereCenterY, centerZ]} clouds={cloudsTex} />

      {/* Ornamental gold band, laid flat just behind the bead */}
      <mesh position={[0, ceilingY - 0.01, centerZ]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
        <planeGeometry args={[decalW, decalD]} />
        <meshBasicMaterial map={ringTex} transparent depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>

      {/* 3-D gilt bead following the oval edge */}
      <mesh position={[0, ceilingY - 0.04, centerZ]} rotation={[Math.PI / 2, 0, 0]} scale={frameScale}>
        <torusGeometry args={[frameMajor, frameTube, 28, 180]} />
        <meshStandardMaterial color="#c79a4e" metalness={0.55} roughness={0.42} emissive="#3a2a0e" emissiveIntensity={0.5} />
      </mesh>
      {/* a slimmer inner bead for a stepped, carved profile */}
      <mesh position={[0, ceilingY - 0.11, centerZ]} rotation={[Math.PI / 2, 0, 0]} scale={frameScale}>
        <torusGeometry args={[frameMajor - 0.06, frameTube * 0.55, 24, 180]} />
        <meshStandardMaterial color="#d8b566" metalness={0.6} roughness={0.38} emissive="#3a2a0e" emissiveIntensity={0.5} />
      </mesh>

      {/* Warm glow pooling around the opening */}
      <mesh position={[0, ceilingY - 0.06, centerZ]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
        <planeGeometry args={[glowW, glowD]} />
        <meshBasicMaterial
          map={glowTex}
          transparent
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          opacity={glowOpacity}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
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

      {/* Faint warm cove light spilling just under the crown */}
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

      {/* Optional decorative corner blocks tucked into the top corners */}
      {showCornerBlocks &&
        ([
          [-halfW, backZ, 0],
          [halfW, backZ, Math.PI / 2],
          [halfW, frontZ, Math.PI],
          [-halfW, frontZ, -Math.PI / 2],
        ] as const).map(([cx, cz, rot], i) => (
          <mesh
            key={`corner-${i}`}
            position={[cx, ceilingY - 0.02, cz]}
            rotation={[-Math.PI / 2, 0, rot]}
            renderOrder={2}
          >
            <planeGeometry args={[0.7, 0.7]} />
            <meshBasicMaterial map={cornerTex} transparent depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
          </mesh>
        ))}

      {/* Warm keys grazing the gilt frame — a soft central wash plus a stronger
          one on the dusk side so the gold reads gilded, not flat. */}
      <pointLight color="#ffc987" intensity={0.8} distance={12} decay={2} position={[0, ceilingY - 0.5, centerZ]} />
      <pointLight color="#ffb066" intensity={0.7} distance={7} decay={2} position={[0, ceilingY - 0.7, centerZ + openingRadiusZ * 0.7]} />
    </group>
  );
}
