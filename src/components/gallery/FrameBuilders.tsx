"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { NineSliceFrameFromURL } from "./NineSliceFrame";

interface FrameProps {
  pw: number;
  ph: number;
}

// --- Shared reflection environment -----------------------------------------
// A small warm gradient env map (with a couple of soft "ceiling light" blooms)
// baked once and applied ONLY to frame materials. Gives gilt real metallic
// reflection without touching the room's tuned lighting. Cached per renderer.
let _envMap: THREE.Texture | null = null;
let _envTried = false;
function getFrameEnvMap(gl: THREE.WebGLRenderer): THREE.Texture | null {
  if (_envTried) return _envMap;
  _envTried = true;
  try {
    const cnv = document.createElement("canvas");
    cnv.width = 512;
    cnv.height = 256;
    const ctx = cnv.getContext("2d")!;
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, "#fff3df");
    g.addColorStop(0.45, "#7a6347");
    g.addColorStop(1, "#0f0a0c");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 256);
    const bloom = (x: number, y: number, r: number, c: string) => {
      const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, c);
      rg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, 512, 256);
    };
    bloom(130, 55, 95, "rgba(255,242,214,0.95)");
    bloom(370, 70, 80, "rgba(255,232,196,0.7)");
    bloom(260, 30, 60, "rgba(255,255,245,0.6)");
    const tex = new THREE.CanvasTexture(cnv);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    const pmrem = new THREE.PMREMGenerator(gl);
    _envMap = pmrem.fromEquirectangular(tex).texture;
    tex.dispose();
    pmrem.dispose();
  } catch (e) {
    console.warn("Frame env map generation failed, frames will render without reflections", e);
    _envMap = null;
  }
  return _envMap;
}

// --- Molding profile + swept geometry --------------------------------------
type ProfilePoint = { s: number; z: number }; // s = outward offset, z = depth

// Smooth a few key points of the molding cross-section into a fine polyline.
function sampleProfile(points: [number, number][], n: number): ProfilePoint[] {
  const v = points.map((p) => new THREE.Vector2(p[0], p[1]));
  const curve = new THREE.SplineCurve(v);
  return curve.getPoints(n).map((p) => ({ s: p.x, z: p.y }));
}

// Sweep a cross-section around a rectangular opening. Each profile level is a
// sharp rectangle expanded outward by `s`; lofting between levels makes the
// corners meet on the 45° diagonal — i.e. real mitered joints, for free.
function buildMoldingGeometry(innerHW: number, innerHH: number, profile: ProfilePoint[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const n = profile.length;

  const addSide = (pt: (p: ProfilePoint, end: number) => [number, number, number]) => {
    const base = positions.length / 3;
    for (let i = 0; i < n; i++) {
      const a = pt(profile[i], -1);
      const b = pt(profile[i], 1);
      positions.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    }
    for (let i = 0; i < n - 1; i++) {
      const r0 = base + i * 2;
      const r1 = base + (i + 1) * 2;
      indices.push(r0, r0 + 1, r1 + 1, r0, r1 + 1, r1);
    }
  };

  // top (+Y), bottom (-Y): length runs along X; right (+X), left (-X): along Y.
  addSide((p, e) => [e * (innerHW + p.s), innerHH + p.s, p.z]);
  addSide((p, e) => [e * (innerHW + p.s), -(innerHH + p.s), p.z]);
  addSide((p, e) => [innerHW + p.s, e * (innerHH + p.s), p.z]);
  addSide((p, e) => [-(innerHW + p.s), e * (innerHH + p.s), p.z]);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// --- Frame families ---------------------------------------------------------
interface FrameSpec {
  profile: [number, number][];
  samples: number;
  color: number;
  metalness: number;
  roughness: number;
  reflective: boolean; // apply the env map (metals)
  liner?: { band: number; color: number; metalness: number; roughness: number };
  beads?: { radius: number; spacing: number; color: number };
  corners?: { radius: number; color: number };
}

// Plain wood — closest to Van Gogh's own taste. A quiet, slightly rounded face.
const RAW_WOOD: FrameSpec = {
  profile: [
    [0, 0.012],
    [0.008, 0.024],
    [0.03, 0.027],
    [0.052, 0.022],
    [0.06, 0],
  ],
  samples: 16,
  color: 0x6b4a2b,
  metalness: 0.0,
  roughness: 0.82,
  reflective: false,
};

// Warm gilt cassetta: pale-gilt liner, ogee/cove molding, a bead course at the
// sight edge and small corner flourishes. The museum "正装" gold.
const BAROQUE_GOLD: FrameSpec = {
  profile: [
    [0, 0.008],
    [0.006, 0.03], // raised sight lip
    [0.014, 0.018], // dip
    [0.026, 0.013], // cove bottom (concave)
    [0.044, 0.024],
    [0.062, 0.044],
    [0.074, 0.054], // ovolo crest (highest, outer)
    [0.084, 0.036],
    [0.09, 0],
  ],
  samples: 26,
  color: 0xb98a36,
  metalness: 0.85,
  roughness: 0.36,
  reflective: true,
  liner: { band: 0.016, color: 0xdcc58c, metalness: 0.55, roughness: 0.5 },
  beads: { radius: 0.006, spacing: 0.019, color: 0xcaa24a },
  corners: { radius: 0.014, color: 0xcaa24a },
};

// Slim warm-bronze astragal (half-round) — quiet, modern, for in-between pieces.
const COPPER_SLIM: FrameSpec = {
  profile: [
    [0, 0.006],
    [0.004, 0.018],
    [0.015, 0.026],
    [0.026, 0.018],
    [0.032, 0.006],
    [0.036, 0],
  ],
  samples: 16,
  color: 0x8a6a35,
  metalness: 0.7,
  roughness: 0.42,
  reflective: true,
};

export const FRAME_SPECS: Record<string, FrameSpec> = {
  raw_wood: RAW_WOOD,
  baroque_gold: BAROQUE_GOLD,
  copper_slim: COPPER_SLIM,
};

// Bead course: small spheres evenly spaced around the sight-edge perimeter.
function BeadCourse({
  hw,
  hh,
  z,
  radius,
  spacing,
  material,
}: {
  hw: number;
  hh: number;
  z: number;
  radius: number;
  spacing: number;
  material: THREE.Material;
}) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  const positions = useMemo(() => {
    const pts: [number, number][] = [];
    const edge = (x0: number, y0: number, x1: number, y1: number) => {
      const len = Math.hypot(x1 - x0, y1 - y0);
      const count = Math.max(1, Math.round(len / spacing));
      for (let i = 0; i < count; i++) {
        const t = (i + 0.5) / count;
        pts.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]);
      }
    };
    edge(-hw, hh, hw, hh); // top
    edge(hw, -hh, hw, hh); // right
    edge(-hw, -hh, hw, -hh); // bottom
    edge(-hw, -hh, -hw, hh); // left
    return pts;
  }, [hw, hh, spacing]);

  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    positions.forEach((p, i) => {
      m.makeTranslation(p[0], p[1], z);
      ref.current.setMatrixAt(i, m);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  }, [positions, z]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, positions.length]} material={material}>
      <sphereGeometry args={[radius, 10, 8]} />
    </instancedMesh>
  );
}

function MoldingFrame({ pw, ph, spec }: { pw: number; ph: number; spec: FrameSpec }) {
  const gl = useThree((s) => s.gl);

  const { bodyGeo, bodyMat, linerGeo, linerMat, beadMat, sightHW, sightHH, innerHW, innerHH, crestZ } = useMemo(() => {
    const rebate = 0.022;
    const sightHW = pw / 2 - rebate;
    const sightHH = ph / 2 - rebate;
    const linerBand = spec.liner?.band ?? 0;
    const innerHW = sightHW + linerBand;
    const innerHH = sightHH + linerBand;

    const profile = sampleProfile(spec.profile, spec.samples);
    const crestZ = Math.max(...profile.map((p) => p.z));
    const bodyGeo = buildMoldingGeometry(innerHW, innerHH, profile);

    const envMap = spec.reflective ? getFrameEnvMap(gl) : null;
    const bodyMat = new THREE.MeshStandardMaterial({
      color: spec.color,
      metalness: spec.metalness,
      roughness: spec.roughness,
      side: THREE.DoubleSide,
      envMap,
      envMapIntensity: 0.9,
    });

    let linerGeo: THREE.BufferGeometry | null = null;
    let linerMat: THREE.Material | null = null;
    if (spec.liner) {
      linerGeo = buildMoldingGeometry(sightHW, sightHH, [
        { s: 0, z: 0.016 },
        { s: linerBand, z: 0.016 },
        { s: linerBand, z: 0 },
      ]);
      linerMat = new THREE.MeshStandardMaterial({
        color: spec.liner.color,
        metalness: spec.liner.metalness,
        roughness: spec.liner.roughness,
        side: THREE.DoubleSide,
        envMap,
        envMapIntensity: 0.7,
      });
    }

    const beadMat = spec.beads
      ? new THREE.MeshStandardMaterial({
          color: spec.beads.color,
          metalness: 0.85,
          roughness: 0.34,
          envMap,
          envMapIntensity: 1.0,
        })
      : null;

    return { bodyGeo, bodyMat, linerGeo, linerMat, beadMat, sightHW, sightHH, innerHW, innerHH, crestZ };
  }, [pw, ph, spec, gl]);

  return (
    <group>
      <mesh geometry={bodyGeo} material={bodyMat} castShadow receiveShadow />
      {linerGeo && linerMat && <mesh geometry={linerGeo} material={linerMat} />}
      {spec.beads && beadMat && (
        <BeadCourse
          hw={innerHW + 0.004}
          hh={innerHH + 0.004}
          z={0.03}
          radius={spec.beads.radius}
          spacing={spec.beads.spacing}
          material={beadMat}
        />
      )}
      {spec.corners && beadMat && (
        <>
          {([
            [innerHW + 0.07, innerHH + 0.07],
            [-(innerHW + 0.07), innerHH + 0.07],
            [innerHW + 0.07, -(innerHH + 0.07)],
            [-(innerHW + 0.07), -(innerHH + 0.07)],
          ] as [number, number][]).map(([x, y], i) => (
            <mesh key={i} position={[x, y, crestZ]} material={beadMat}>
              <sphereGeometry args={[spec.corners!.radius, 12, 10]} />
            </mesh>
          ))}
        </>
      )}
    </group>
  );
}

export function BaroqueGoldFrame({ pw, ph }: FrameProps) {
  return <MoldingFrame pw={pw} ph={ph} spec={BAROQUE_GOLD} />;
}

export function RawWoodFrame({ pw, ph }: FrameProps) {
  return <MoldingFrame pw={pw} ph={ph} spec={RAW_WOOD} />;
}

export function CopperSlimFrame({ pw, ph }: FrameProps) {
  return <MoldingFrame pw={pw} ph={ph} spec={COPPER_SLIM} />;
}

// Photographic 9-slice frames. Drop a transparent-centre PNG in /public/frames/
// and map a frameStyle to it here; it auto-fits any painting. Empty entries fall
// back to the procedural molding below.
export interface FrameTexture {
  url: string;
  normalUrl?: string;
  frameWidth?: number;
  rebate?: number;
}
export const FRAME_TEXTURES: Record<string, FrameTexture> = {
  baroque_gold: { url: "/frames/f2-avantrend233.jpg", normalUrl: "/frames/f2-normal.png", frameWidth: 0.13 }, // ornate Baroque gilt
  raw_wood: { url: "/frames/f3-anaterate.png", normalUrl: "/frames/f3-normal.png", frameWidth: 0.11 }, // rustic bronze/wood, rope molding
  copper_slim: { url: "/frames/f4-susannp4.png", normalUrl: "/frames/f4-normal.png", frameWidth: 0.075 }, // simple slim gilt
};

// Every painting gets a photographic frame: mapped by frameStyle, else the clean
// simple gilt (which stretches best for unknown aspect ratios). The procedural
// molding (BaroqueGoldFrame etc.) stays as a code-level fallback only.
const DEFAULT_FRAME: FrameTexture = {
  url: "/frames/f4-susannp4.png",
  normalUrl: "/frames/f4-normal.png",
  frameWidth: 0.085,
};

export function FrameGroup({ frameStyle, pw, ph }: { frameStyle: string; pw: number; ph: number }) {
  const tex = FRAME_TEXTURES[frameStyle] ?? DEFAULT_FRAME;
  return (
    <NineSliceFrameFromURL url={tex.url} normalUrl={tex.normalUrl} pw={pw} ph={ph} frameWidth={tex.frameWidth} rebate={tex.rebate} />
  );
}
