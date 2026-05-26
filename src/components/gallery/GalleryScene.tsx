"use client";

import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";
import Room from "./Room";
import Painting from "./Painting";
import { ACTIVE_LIGHTING } from "@/lib/lighting";
import { getPaintingTransform, getFacingDir } from "@/lib/gallery-config";
import type { Artwork } from "@/lib/sanity";

interface GallerySceneProps {
  artworks: Artwork[];
  mode: "guided" | "unguided";
  onArtworkRevealed?: (index: number, artwork: Artwork) => void;
  onArtworkClick?: (index: number, artwork: Artwork) => void;
  saturationRefs: React.MutableRefObject<{ [key: number]: { value: number } }>;
}

const VIEW_DIST = 3.2; // metres back from the wall — close, comfortable viewing distance
const EYE_Y = 1.55; // standing eye level = painting centre line (level sightline)

// Forward/back dolly presets (metres from the wall), nearest → farthest.
// Index 2 is the default comfortable viewing distance (= VIEW_DIST).
const DEPTH_PRESETS = [0.7, 1.1, 1.7, 2.4, VIEW_DIST, 4.6, 6.4];
const DEFAULT_DEPTH_INDEX = 4;

interface Anchor {
  camPos: [number, number, number];
  fwd: [number, number]; // horizontal facing toward the wall
}

// One anchor per painting, ordered as a walk around the three walls
// (West south→north, North west→east, East north→south).
function buildAnchors(artworks: Artwork[]): { anchors: Anchor[]; start: number } {
  const items = artworks.map((a) => {
    const { position } = getPaintingTransform(a.position);
    const facing = getFacingDir(a.position?.wall || "north");
    const [px, , pz] = position;
    const wall = a.position?.wall || "north";
    const phase = wall === "west" ? 0 : wall === "north" ? 1 : 2;
    const sub = wall === "west" ? -pz : wall === "north" ? px : pz;
    return {
      sortKey: phase * 1000 + sub,
      isCenterNorth: wall === "north" && Math.abs(px) < 0.1,
      camPos: [px + facing[0] * VIEW_DIST, EYE_Y, pz + facing[2] * VIEW_DIST] as [number, number, number],
      fwd: [facing[0], facing[2]] as [number, number],
    };
  });
  items.sort((a, b) => a.sortKey - b.sortKey);
  let start = items.findIndex((i) => i.isCenterNorth);
  if (start < 0) start = Math.floor(items.length / 2);
  return { anchors: items.map((i) => ({ camPos: i.camPos, fwd: i.fwd })), start };
}

// If one painting's texture fails to load, skip just that painting instead of
// letting the thrown load error crash the whole gallery.
class PaintingBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

// Keep tone-mapping exposure in sync with the active preset (updates on hot reload).
function ExposureSync() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.toneMappingExposure = ACTIVE_LIGHTING.exposure;
  });
  return null;
}

// Apple-style camera: while dragging, the camera follows the pointer freely 1:1
// along a path that wraps the three walls. On release it eases to the nearest
// painting anchor, so it always settles dead-centre in front of a canvas.
// Arrow keys: ←/→ turn to the previous/next painting, ↑/↓ dolly forward/back
// through the DEPTH_PRESETS.
function AnchorControls({ anchors, start, active }: { anchors: Anchor[]; start: number; active: boolean }) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);

  // Cumulative arc-length of the camPos polyline = the draggable path.
  const U = useMemo(() => {
    const arr = [0];
    for (let i = 1; i < anchors.length; i++) {
      const a = anchors[i - 1].camPos;
      const b = anchors[i].camPos;
      arr.push(arr[i - 1] + Math.hypot(b[0] - a[0], b[2] - a[2]));
    }
    return arr;
  }, [anchors]);
  const total = U[U.length - 1] || 0;

  const u = useRef(U[start] ?? 0);
  const targetU = useRef(u.current);
  const dragging = useRef(false);
  const lastX = useRef(0);
  // Eased-turn rate: snappy on mouse release, gentler for arrow-key turns.
  const easeLambda = useRef(11);

  // Forward/back dolly distance from the wall, eased toward depthTarget.
  const depth = useRef(VIEW_DIST);
  const depthTarget = useRef(VIEW_DIST);
  const depthIndex = useRef(DEFAULT_DEPTH_INDEX);

  useEffect(() => {
    u.current = U[start] ?? 0;
    targetU.current = u.current;
  }, [U, start]);

  useEffect(() => {
    const el = gl.domElement;
    el.style.cursor = active ? "grab" : "default";
    const onDown = (e: PointerEvent) => {
      if (!active) return;
      dragging.current = true;
      lastX.current = e.clientX;
      el.style.cursor = "grabbing";
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging.current || !active) return;
      const dx = e.clientX - lastX.current;
      lastX.current = e.clientX;
      u.current = THREE.MathUtils.clamp(u.current + dx * 0.018, 0, total); // free 1:1 follow
      targetU.current = u.current;
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      el.style.cursor = active ? "grab" : "default";
      // snap to the nearest anchor
      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i < U.length; i++) {
        const d = Math.abs(U[i] - u.current);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      }
      easeLambda.current = 11; // crisp settle on release
      targetU.current = U[best];
    };
    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [gl, active, U, total]);

  // Arrow-key navigation: ←/→ step to the adjacent painting anchor, ↑/↓ dolly
  // forward/back through the depth presets.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        // nearest anchor to where we're heading, then step one painting over
        let idx = 0;
        let best = Infinity;
        for (let i = 0; i < U.length; i++) {
          const d = Math.abs(U[i] - targetU.current);
          if (d < best) {
            best = d;
            idx = i;
          }
        }
        idx = THREE.MathUtils.clamp(idx + (e.key === "ArrowRight" ? 1 : -1), 0, U.length - 1);
        easeLambda.current = 4.5; // gentler, more graceful turn for keyboard
        targetU.current = U[idx];
        e.preventDefault();
      } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        // ↑ = walk forward (closer to the wall), ↓ = walk back (see more room)
        depthIndex.current = THREE.MathUtils.clamp(
          depthIndex.current + (e.key === "ArrowUp" ? -1 : 1),
          0,
          DEPTH_PRESETS.length - 1
        );
        depthTarget.current = DEPTH_PRESETS[depthIndex.current];
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, U]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1); // cap after tab-switch so we don't jump
    // Frame-rate-independent ease toward the target anchor, with a snap once
    // we're within a hair so it settles dead-centre instead of crawling forever.
    if (!dragging.current) {
      u.current = THREE.MathUtils.damp(u.current, targetU.current, easeLambda.current, dt);
      if (Math.abs(targetU.current - u.current) < 0.0015) u.current = targetU.current;
    }
    depth.current = THREE.MathUtils.damp(depth.current, depthTarget.current, 9, dt);

    let i = 0;
    while (i < U.length - 2 && u.current > U[i + 1]) i++;
    const segLen = U[i + 1] - U[i] || 1;
    const t = THREE.MathUtils.clamp((u.current - U[i]) / segLen, 0, 1);
    const a = anchors[i];
    const b = anchors[i + 1] || a;
    const px = a.camPos[0] + (b.camPos[0] - a.camPos[0]) * t;
    const pz = a.camPos[2] + (b.camPos[2] - a.camPos[2]) * t;
    let fx = a.fwd[0] + (b.fwd[0] - a.fwd[0]) * t;
    let fz = a.fwd[1] + (b.fwd[1] - a.fwd[1]) * t;
    const l = Math.hypot(fx, fz) || 1;
    fx /= l;
    fz /= l;
    // The anchor camPos sits at VIEW_DIST from the wall; shift along the facing
    // axis to honour the current dolly depth (+ = back into the room).
    const extra = depth.current - VIEW_DIST;
    camera.position.set(px + fx * extra, EYE_Y, pz + fz * extra);
    // fwd points from the wall into the room; the camera stands in front of the
    // painting and must look back AT the wall, i.e. the −fwd direction.
    camera.lookAt(px - fx * VIEW_DIST, EYE_Y, pz - fz * VIEW_DIST);
  });
  return null;
}

function SceneContent({ artworks, mode, onArtworkRevealed, onArtworkClick, saturationRefs }: GallerySceneProps) {
  const { anchors, start } = useMemo(() => buildAnchors(artworks), [artworks]);
  return (
    <>
      <PerspectiveCamera makeDefault position={[0, EYE_Y, -6 + VIEW_DIST]} fov={58} near={0.1} far={100} />
      {anchors.length > 0 && <AnchorControls anchors={anchors} start={start} active={mode === "unguided"} />}
      <ExposureSync />
      <fog attach="fog" args={[ACTIVE_LIGHTING.fog.color, ACTIVE_LIGHTING.fog.near, ACTIVE_LIGHTING.fog.far]} />
      <color attach="background" args={["#0a0508"]} />
      <ambientLight intensity={ACTIVE_LIGHTING.ambient.intensity} color={ACTIVE_LIGHTING.ambient.color} />
      <hemisphereLight args={[ACTIVE_LIGHTING.hemisphere.sky, ACTIVE_LIGHTING.hemisphere.ground, ACTIVE_LIGHTING.hemisphere.intensity]} />
      <Suspense fallback={null}>
        <Room />
      </Suspense>
      <Suspense fallback={null}>
        {artworks.map((artwork, index) => (
          <PaintingBoundary key={artwork._id}>
            <Painting
              artwork={artwork}
              index={index}
              saturationRefs={saturationRefs}
              mode={mode}
              onReveal={onArtworkRevealed}
              onClick={onArtworkClick}
            />
          </PaintingBoundary>
        ))}
      </Suspense>
    </>
  );
}

export default function GalleryScene({ artworks, mode, onArtworkRevealed, onArtworkClick, saturationRefs }: GallerySceneProps) {
  return (
    <Canvas
      gl={{ antialias: true, alpha: true, toneMapping: THREE.ReinhardToneMapping, toneMappingExposure: ACTIVE_LIGHTING.exposure }}
      dpr={[1, 2]}
      shadows
      style={{ position: "fixed", inset: 0 }}
    >
      <SceneContent
        artworks={artworks}
        mode={mode}
        onArtworkRevealed={onArtworkRevealed}
        onArtworkClick={onArtworkClick}
        saturationRefs={saturationRefs}
      />
    </Canvas>
  );
}
