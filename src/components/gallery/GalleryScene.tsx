"use client";

import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";
import Room from "./Room";
import Bench from "./Bench";
import Painting from "./Painting";
import FloorLine from "./FloorLine";
import { ACTIVE_LIGHTING } from "@/lib/lighting";
import { getPaintingTransform, getFacingDir } from "@/lib/gallery-config";
import type { Artwork } from "@/lib/sanity";

export interface InspectApi {
  setZoomDir: (dir: -1 | 0 | 1) => void; // hold-to-zoom: +1 in, -1 out (past fit = exit), 0 stop
  exit: () => void;
}

// Which control set the keys currently drive, so the UI can flash the right hint
// when they change meaning: roaming the room, the inspect entry (whole frame),
// or zoomed onto the cropped surface.
export type ControlPhase = "roam" | "entry" | "cropped";

// Normalised view rectangle over the *framed* painting (canvas + frame), 0..1,
// for the minimap. The whole framed work is the [0,1] box.
export interface InspectView {
  cx: number; // view centre, fraction across the framed width
  cy: number; // view centre, fraction down the framed height
  w: number; // view width as a fraction of the framed width
  h: number; // view height as a fraction of the framed height
}

export interface PaintingDims {
  pw: number; // canvas width (m)
  ph: number; // canvas height (m)
  frameWidth: number; // how far the frame extends beyond the canvas, per side (m)
  texWidth?: number; // px width of the texture resident during inspect (base or hi-res)
  loadedW?: number; // actual px dims of the currently-resident texture (debug HUD)
  loadedH?: number;
}

interface GallerySceneProps {
  artworks: Artwork[];
  mode: "guided" | "unguided";
  onReady?: () => void;
  onArtworkRevealed?: (index: number, artwork: Artwork) => void;
  onArtworkClick?: (index: number, artwork: Artwork) => void;
  saturationRefs: React.MutableRefObject<{ [key: number]: { value: number } }>;
  paintingDimsRef: React.MutableRefObject<{ [index: number]: PaintingDims }>;
  onInspectingChange?: (inspecting: boolean, artworkIndex?: number) => void;
  inspectApi?: React.MutableRefObject<InspectApi | null>;
  viewRef?: React.MutableRefObject<InspectView | null>;
  // Which painting is being inspected, so it alone loads the high-res master.
  inspecting?: boolean;
  inspectedIndex?: number | null;
  // Fired when the active key set changes, so the UI can flash a fresh hint.
  onPhaseChange?: (phase: ControlPhase) => void;
}

const VIEW_DIST = 3.2; // metres back from the wall — close, comfortable viewing distance
const EYE_Y = 1.55; // standing eye level = painting centre line (level sightline)
const VFOV_DEG = 58; // must match the PerspectiveCamera fov below
const TAN_HALF_V = Math.tan(((VFOV_DEG * Math.PI) / 180) / 2);

// Everything is measured as a multiple of each painting's own "fit distance" —
// the distance at which the WHOLE framed work (canvas + frame) just fills the
// screen. This decouples the room↔inspect boundary from absolute metres, so a
// long, wide, big or small painting all switch at the moment they'd start to be
// cropped. ratio 1.0 == whole framed work fills the screen.
const FIT_MARGIN = 1.18; // generous wall margin — the whole frame never touches the screen edges

// Room dolly stops as multiples of the room "base" distance — the composition that
// shows the whole frame AND its nameplate. Closest (0) = base; farther stops pull
// back into the room. "Just fits" (bare frame) is NOT here; it's inspect-only.
const ROOM_OUT = [1.0, 1.45, 2.2, 3.4, 5.0];
const ROOM_CLOSEST_INDEX = 0;
const DEFAULT_ROOM_INDEX = ROOM_OUT.length - 1; // start farthest — room overview

// The nameplate drops this far below the frame's bottom edge (gap + plate height,
// see Nameplate.tsx); the room base includes it so the plate is always shown.
const NAMEPLATE_DROP = 0.19;
// Room base is at least this many × the bare-frame fit, so the room view is always
// a clear step back from the frame-fills inspect entry.
const MIN_ROOM_RATIO = 1.12;

// Inspect zoom is continuous: hold +/- to glide between "frame fills" (ratio 1.0)
// and the painting's own crisp limit. DEEPEST_RATIO is a hard floor on how far in
// we'll ever go (≈10× the frame) even if a texture could stay sharp deeper, so the
// view never becomes a disorienting micro-crop. The per-painting 1:1 clamp
// (minRatio) usually stops the zoom-in well before this.
const DEEPEST_RATIO = 0.1;
// Continuous-zoom speed: the ratio e-folds per second while +/- is held, so a full
// hold runs ≈1.4s from the whole frame to the deepest crisp point.
const ZOOM_RATE = 1.6;
// Tap vs hold: a press starts gliding immediately, but if it's released within
// TAP_MS we treat it as a deliberate tap and snap to a single clean notch
// (×/÷ NOTCH from where the press began). So a tap steps, a hold rides.
const TAP_MS = 200;
const NOTCH = 1.8;
// Where ↑ lands you from the whole-frame entry: zoomed in enough that the frame
// is cropped and you're on the painting surface (clamped to the crisp limit).
// Mirrors the old first zoom step; ↓ from entry exits to the room.
const SURFACE_RATIO = 0.6;

// Held-arrow pan speed in screen-heights per second, so roaming feels the same
// at every zoom. Eased for a soft start/stop.
const PAN_SPEED = 0.95;

// The camera opens the show pulled well back into the room, then dollies in to
// the default standing distance as the black curtain brightens — a slow
// cinematic push that lands on the first wall. Kept just inside the front wall
// so the far frame never clips through it.
const INTRO_DEPTH = 9;

interface Anchor {
  camPos: [number, number, number];
  fwd: [number, number]; // horizontal facing toward the wall
  artworkIndex: number; // index into the artworks array (for per-painting dims/thumbnail)
}

// One anchor per painting, ordered as a walk around the three walls
// (West south→north, North west→east, East north→south).
function buildAnchors(artworks: Artwork[]): { anchors: Anchor[]; start: number } {
  const items = artworks.map((a, artworkIndex) => {
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
      artworkIndex,
    };
  });
  items.sort((a, b) => a.sortKey - b.sortKey);
  let start = items.findIndex((i) => i.isCenterNorth);
  if (start < 0) start = Math.floor(items.length / 2);
  return {
    anchors: items.map((i) => ({ camPos: i.camPos, fwd: i.fwd, artworkIndex: i.artworkIndex })),
    start,
  };
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

// Last child inside the asset Suspense gate: Suspense holds back ALL of its
// children until every suspending sibling (room textures, painting textures)
// has resolved, so this effect fires exactly once — the moment the whole room
// is ready to be shown in a single frame.
function SceneReady({ onReady }: { onReady?: () => void }) {
  useEffect(() => {
    onReady?.();
  }, [onReady]);
  return null;
}

// Keep tone-mapping exposure in sync with the active preset (updates on hot reload).
function ExposureSync() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.toneMappingExposure = ACTIVE_LIGHTING.exposure;
  });
  return null;
}

// Camera controller with two modes that meet at the per-painting "fit" distance:
//  • Room — drag or ←/→ to move between paintings, ↑/↓ to dolly. ↑ cannot go
//    closer than fit (the whole framed work filling the screen); pressing ↑ there
//    crosses into inspect, so the approach is one continuous zoom-in with no jump.
//  • Inspect ("look closely") — entered at fit (vignette fades in) and held there;
//    +/- step the zoom into brushwork, the four arrows roam freely to the frame's
//    outer edges, and Esc / zooming back out past fit returns to the room at fit.
// On entry the camera also plays a slow opening dolly-in from far back, in step
// with the curtain brightening (gated by `revealed`).
function AnchorControls({
  anchors,
  start,
  active,
  revealed,
  paintingDimsRef,
  onInspectingChange,
  onPhaseChange,
  inspectApi,
  viewRef,
}: {
  anchors: Anchor[];
  start: number;
  active: boolean;
  revealed: boolean;
  paintingDimsRef: React.MutableRefObject<{ [index: number]: PaintingDims }>;
  onInspectingChange?: (inspecting: boolean, artworkIndex?: number) => void;
  onPhaseChange?: (phase: ControlPhase) => void;
  inspectApi?: React.MutableRefObject<InspectApi | null>;
  viewRef?: React.MutableRefObject<InspectView | null>;
}) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);

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
  const easeLambda = useRef(11);

  // Eased dolly distance from the wall (metres); eases toward the computed target.
  // Opens pulled back at INTRO_DEPTH and holds there until the curtain lifts.
  const dollyDepth = useRef(INTRO_DEPTH);
  const introDone = useRef(false); // latches once the opening dolly-in has landed
  const easeZoom = useRef(9); // softened on entering inspect for a felt "lean in"
  const inspecting = useRef(false);
  const roomIdx = useRef(DEFAULT_ROOM_INDEX); // index into ROOM_OUT
  // Continuous inspect zoom: current ratio of the bare-frame fit (1.0 = frame
  // fills), glided while +/- is held; zoomDir is -1 (out) / 0 / +1 (in).
  const inspectRatio = useRef(1);
  const zoomDir = useRef<-1 | 0 | 1>(0);
  // Tap-vs-hold bookkeeping: a press glides immediately; a release within TAP_MS
  // snaps to one clean notch from where the press began.
  const pressDir = useRef<-1 | 0 | 1>(0);
  const pressStart = useRef(0);
  const ratioAtPress = useRef(1);
  const justEntered = useRef(false);
  // Deepest zoom ratio the current painting can show without magnifying its
  // resident texture past ~1:1 (recomputed per frame from texWidth + viewport).
  const minRatio = useRef(1);
  // Swallow a held ↑ once it has crossed into inspect / leaned onto the surface,
  // so it stops there until released instead of running on.
  const swallowUp = useRef(false);
  // Last reported control phase, so we only notify the UI on a real change.
  const phaseRef = useRef<ControlPhase>("roam");

  // Pan offsets across the framed work (inspect only), in metres. panTarget moves
  // while an arrow is held; pan eases toward it for a soft start/stop.
  const panX = useRef(0);
  const panY = useRef(0);
  const panXTarget = useRef(0);
  const panYTarget = useRef(0);
  const heldKeys = useRef<Set<string>>(new Set());

  const sizeRef = useRef(size);
  sizeRef.current = size;

  useEffect(() => {
    u.current = U[start] ?? 0;
    targetU.current = u.current;
  }, [U, start]);

  // --- helpers -----------------------------------------------------------
  const nearestAnchorIndex = () => {
    let idx = 0;
    let best = Infinity;
    for (let i = 0; i < U.length; i++) {
      const d = Math.abs(U[i] - targetU.current);
      if (d < best) {
        best = d;
        idx = i;
      }
    }
    return idx;
  };
  const currentArtworkIndex = () => anchors[nearestAnchorIndex()]?.artworkIndex ?? 0;
  const currentDims = (): PaintingDims =>
    paintingDimsRef.current[currentArtworkIndex()] ?? { pw: 1, ph: 1, frameWidth: 0.09, texWidth: 2048 };

  // Distance at which a box of half-extents (halfW, halfH) just fills the screen.
  const fitFor = (halfW: number, halfH: number, aspect: number) =>
    Math.max(halfH / TAN_HALF_V, halfW / aspect / TAN_HALF_V) * FIT_MARGIN;
  // Bare frame fills the screen — the inspect entry ("just fits").
  const framedFit = (dims: PaintingDims, aspect: number) =>
    fitFor(dims.pw / 2 + dims.frameWidth, dims.ph / 2 + dims.frameWidth, aspect);
  // Frame + nameplate both fit — the room base. The composition is taller (plate
  // hangs below), and never closer than MIN_ROOM_RATIO× the bare frame.
  const roomBaseDepth = (dims: PaintingDims, aspect: number) =>
    Math.max(
      fitFor(dims.pw / 2 + dims.frameWidth, dims.ph / 2 + dims.frameWidth + NAMEPLATE_DROP, aspect),
      framedFit(dims, aspect) * MIN_ROOM_RATIO
    );

  const enterInspect = () => {
    if (inspecting.current) return;
    targetU.current = U[nearestAnchorIndex()]; // centre the work before roaming
    easeLambda.current = 6;
    inspecting.current = true;
    inspectRatio.current = 1; // land at "whole framed work" — vignette on, then +/- zoom
    panX.current = panY.current = panXTarget.current = panYTarget.current = 0;
    heldKeys.current.clear();
    swallowUp.current = false;
    easeZoom.current = 6;
    onInspectingChange?.(true, currentArtworkIndex());
  };

  const exitInspect = () => {
    if (!inspecting.current) return;
    inspecting.current = false;
    zoomDir.current = 0;
    pressDir.current = 0;
    swallowUp.current = false;
    roomIdx.current = ROOM_CLOSEST_INDEX; // land at the room-closest stop = just-fits, zoomed out one notch
    panXTarget.current = panYTarget.current = 0;
    heldKeys.current.clear();
    easeZoom.current = 9;
    onInspectingChange?.(false);
  };

  // Press/hold zoom. dir = +1 in, -1 out, 0 = release. A press starts a continuous
  // glide right away; releasing within TAP_MS turns it into a single clean notch
  // (so a quick tap is a deliberate step, a hold is a smooth ride). From the room
  // (at the closest stop) a zoom-in press first crosses into inspect.
  const setZoomDir = (dir: -1 | 0 | 1) => {
    if (dir === 0) {
      const was = pressDir.current;
      pressDir.current = 0;
      zoomDir.current = 0;
      if (was === 0) return;
      const tapped = performance.now() - pressStart.current < TAP_MS;
      if (tapped && !justEntered.current) {
        if (was === -1 && ratioAtPress.current >= 1 - 1e-3) {
          exitInspect(); // a tap "out" at the whole-frame view leaves inspect
        } else {
          const target = ratioAtPress.current * (was === 1 ? 1 / NOTCH : NOTCH);
          inspectRatio.current = target >= 1 ? 1 : THREE.MathUtils.clamp(target, minRatio.current, 1);
        }
      }
      justEntered.current = false;
      return;
    }
    // begin a press
    justEntered.current = false;
    if (dir === 1 && !inspecting.current && roomIdx.current === ROOM_CLOSEST_INDEX) {
      enterInspect();
      justEntered.current = true; // this press only opens inspect — don't also notch
    }
    if (!inspecting.current) return;
    if (pressDir.current === dir) return; // ignore auto-repeat keydowns
    pressDir.current = dir;
    pressStart.current = performance.now();
    ratioAtPress.current = inspectRatio.current;
    zoomDir.current = dir; // glide immediately; a fast release snaps to a notch
  };

  // Expose zoom/exit so the DOM zoom buttons can drive the 3D camera.
  useEffect(() => {
    if (!inspectApi) return;
    inspectApi.current = { setZoomDir, exit: exitInspect };
    return () => {
      inspectApi.current = null;
    };
    // zoom/exit only read refs, so a one-time bind is safe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspectApi]);

  // Leaving free mode (e.g. switching to guided) drops out of inspect cleanly.
  useEffect(() => {
    if (!active && inspecting.current) exitInspect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Pointer drag — room mode only (disabled while inspecting).
  useEffect(() => {
    const el = gl.domElement;
    el.style.cursor = active ? "grab" : "default";
    const onDown = (e: PointerEvent) => {
      if (!active || inspecting.current) return;
      dragging.current = true;
      lastX.current = e.clientX;
      el.style.cursor = "grabbing";
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging.current || !active || inspecting.current) return;
      const dx = e.clientX - lastX.current;
      lastX.current = e.clientX;
      u.current = THREE.MathUtils.clamp(u.current + dx * 0.018, 0, total); // free 1:1 follow
      targetU.current = u.current;
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      el.style.cursor = active ? "grab" : "default";
      easeLambda.current = 11; // crisp settle on release
      targetU.current = U[nearestAnchorIndex()];
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

  // Keyboard.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return; // leave browser shortcuts alone
      const key = e.key;

      if (key === "Escape") {
        if (inspecting.current) {
          exitInspect();
          e.preventDefault();
        }
        return;
      }
      if (key === "+" || key === "=") {
        if (inspecting.current || roomIdx.current === ROOM_CLOSEST_INDEX) {
          setZoomDir(1); // held → continuous zoom-in (auto-repeat keydowns just re-arm)
          e.preventDefault();
        }
        return;
      }
      if (key === "-" || key === "_") {
        if (inspecting.current) {
          setZoomDir(-1); // held → continuous zoom-out; past frame-fills it exits
          e.preventDefault();
        }
        return;
      }

      if (inspecting.current) {
        if (key === "ArrowUp" || key === "ArrowDown" || key === "ArrowLeft" || key === "ArrowRight") {
          if (key === "ArrowUp" && swallowUp.current) { e.preventDefault(); return; }
          // While the whole frame is still visible (not yet cropped), ↑ leans onto
          // the surface and ↓ exits to the room. Once the frame is cropped, ↑/↓
          // pan. Keyed off the immediate target ratio (not the eased camera) so the
          // switch to panning is instant after the first ↑.
          if (inspectRatio.current > 1 / FIT_MARGIN) {
            if (key === "ArrowUp") {
              inspectRatio.current = Math.max(SURFACE_RATIO, minRatio.current);
              swallowUp.current = true; // stop on the surface until ↑ is released
            } else if (key === "ArrowDown") {
              exitInspect();
            }
            // ←/→ at the whole-frame view: nothing to roam
          } else {
            heldKeys.current.add(key); // frame cropped → pan the magnifier
          }
          e.preventDefault();
        }
        return;
      }

      // Room mode.
      if (key === "ArrowLeft" || key === "ArrowRight") {
        const idx = THREE.MathUtils.clamp(
          nearestAnchorIndex() + (key === "ArrowRight" ? 1 : -1),
          0,
          U.length - 1
        );
        easeLambda.current = 4.5; // gentler, more graceful turn for keyboard
        targetU.current = U[idx];
        e.preventDefault();
      } else if (key === "ArrowUp") {
        if (roomIdx.current === ROOM_CLOSEST_INDEX) {
          enterInspect(); // at fit → cross into inspect
          swallowUp.current = true; // a ↑ held from the room stops at this first frame until released
        } else {
          roomIdx.current -= 1; // dolly closer (auto-repeat = hold to glide in)
        }
        e.preventDefault();
      } else if (key === "ArrowDown") {
        roomIdx.current = Math.min(roomIdx.current + 1, ROOM_OUT.length - 1);
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "+" || e.key === "=" || e.key === "-" || e.key === "_") setZoomDir(0);
      if (e.key === "ArrowUp") swallowUp.current = false;
      heldKeys.current.delete(e.key);
    };
    const onBlur = () => {
      heldKeys.current.clear();
      zoomDir.current = 0;
      pressDir.current = 0;
      swallowUp.current = false;
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, U]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1); // cap after tab-switch so we don't jump
    if (!dragging.current) {
      u.current = THREE.MathUtils.damp(u.current, targetU.current, easeLambda.current, dt);
      if (Math.abs(targetU.current - u.current) < 0.0015) u.current = targetU.current;
    }
    const aspect = sizeRef.current.width / Math.max(1, sizeRef.current.height);
    const dims = currentDims();
    const fit = framedFit(dims, aspect);
    // Deepest crisp zoom for THIS painting: the ratio at which the resident
    // texture maps ~1:1 to device pixels. Going deeper would only upscale (soft),
    // so clamp the deepest stop there — high-res masters / larger screens earn a
    // deeper stop, small masters and phones stop shallower. hHalf at fit is the
    // half view-width (m) when the bare frame fills the screen.
    const hHalfAtFit = fit * TAN_HALF_V * aspect;
    const fbW = gl.domElement.width || sizeRef.current.width;
    const texW = dims.texWidth ?? 2048;
    minRatio.current = THREE.MathUtils.clamp(
      (dims.pw * fbW) / (2 * texW * hHalfAtFit),
      DEEPEST_RATIO,
      1
    );
    // Continuous zoom: while +/- is held, glide the ratio geometrically (so the
    // zoom speed feels constant). Zoom-in stops at the per-painting crisp limit;
    // zoom-out past frame-fills (ratio ≥ 1) leaves inspect.
    if (inspecting.current) {
      if (zoomDir.current !== 0) {
        inspectRatio.current *= Math.exp(-zoomDir.current * ZOOM_RATE * dt);
      }
      if (zoomDir.current < 0 && inspectRatio.current >= 1) {
        exitInspect();
      } else {
        inspectRatio.current = THREE.MathUtils.clamp(inspectRatio.current, minRatio.current, 1);
      }
    }
    // Report which control set is active so the UI can flash a fresh key hint the
    // moment the arrows change meaning (roam → entry → cropped).
    const phase: ControlPhase = !inspecting.current
      ? "roam"
      : inspectRatio.current > 1 / FIT_MARGIN
      ? "entry"
      : "cropped";
    if (phase !== phaseRef.current) {
      phaseRef.current = phase;
      onPhaseChange?.(phase);
    }
    // Dolly target: the continuous inspect ratio (frame fills → crisp limit) or the
    // room base that frames frame + nameplate (room).
    const targetDepth = inspecting.current
      ? fit * inspectRatio.current
      : roomBaseDepth(dims, aspect) * ROOM_OUT[roomIdx.current];
    // Opening dolly-in: hold far behind the black curtain, then drift in slowly
    // (eyes-opening) to the room overview before normal responsive dollying.
    let aimDepth = targetDepth;
    let zoomLambda = easeZoom.current;
    if (!revealed) {
      aimDepth = INTRO_DEPTH;
      zoomLambda = 8;
    } else if (!introDone.current) {
      zoomLambda = 1.4;
      if (Math.abs(dollyDepth.current - targetDepth) < 0.06) introDone.current = true;
    }
    dollyDepth.current = THREE.MathUtils.damp(dollyDepth.current, aimDepth, zoomLambda, dt);
    const depth = dollyDepth.current;

    // Pan extents are the FRAMED edges, so you can always roam out to a complete
    // frame on every side.
    const vHalf = depth * TAN_HALF_V;
    const hHalf = vHalf * aspect;
    const framedHalfW = dims.pw / 2 + dims.frameWidth;
    const framedHalfH = dims.ph / 2 + dims.frameWidth;
    let maxX = 0;
    let maxY = 0;
    if (inspecting.current) {
      maxX = Math.max(0, framedHalfW - hHalf);
      maxY = Math.max(0, framedHalfH - vHalf);
      const keys = heldKeys.current;
      const speed = PAN_SPEED * (2 * vHalf); // m/s, scales with zoom (screen-heights/s)
      let dx = 0;
      let dy = 0;
      if (keys.has("ArrowLeft")) dx -= 1;
      if (keys.has("ArrowRight")) dx += 1;
      if (keys.has("ArrowUp")) dy += 1;
      if (keys.has("ArrowDown")) dy -= 1;
      panXTarget.current += dx * speed * dt;
      panYTarget.current += dy * speed * dt;
    } else {
      panXTarget.current = 0;
      panYTarget.current = 0;
    }
    panXTarget.current = THREE.MathUtils.clamp(panXTarget.current, -maxX, maxX);
    panYTarget.current = THREE.MathUtils.clamp(panYTarget.current, -maxY, maxY);
    panX.current = THREE.MathUtils.damp(panX.current, panXTarget.current, 12, dt);
    panY.current = THREE.MathUtils.damp(panY.current, panYTarget.current, 12, dt);

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
    const extra = depth - VIEW_DIST;
    // Pan offset slides the framing across the wall plane: "right" lies in the
    // wall (= facing rotated 90° about up), "up" is world-up. Applied to both the
    // eye and the look-at so the optical axis stays perpendicular — a magnifier
    // gliding over the work, not a swivel.
    const rx = fz;
    const rz = -fx;
    const ox = rx * panX.current;
    const oz = rz * panX.current;
    camera.position.set(px + fx * extra + ox, EYE_Y + panY.current, pz + fz * extra + oz);
    camera.lookAt(px - fx * VIEW_DIST + ox, EYE_Y + panY.current, pz - fz * VIEW_DIST + oz);

    // Publish the current view rectangle (over the framed work) for the minimap.
    if (viewRef) {
      if (inspecting.current) {
        const framedW = framedHalfW * 2;
        const framedH = framedHalfH * 2;
        viewRef.current = {
          cx: 0.5 + panX.current / framedW,
          cy: 0.5 - panY.current / framedH,
          w: Math.min(1, (2 * hHalf) / framedW),
          h: Math.min(1, (2 * vHalf) / framedH),
        };
      } else {
        viewRef.current = null;
      }
    }
  });
  return null;
}

function SceneContent({
  artworks,
  mode,
  onReady,
  revealed,
  onArtworkRevealed,
  onArtworkClick,
  saturationRefs,
  paintingDimsRef,
  onInspectingChange,
  onPhaseChange,
  inspectApi,
  viewRef,
  inspecting,
  inspectedIndex,
}: GallerySceneProps & { revealed: boolean }) {
  const { anchors, start } = useMemo(() => buildAnchors(artworks), [artworks]);
  return (
    <>
      <PerspectiveCamera makeDefault position={[0, EYE_Y, -6 + VIEW_DIST]} fov={VFOV_DEG} near={0.05} far={100} />
      {anchors.length > 0 && (
        <AnchorControls
          anchors={anchors}
          start={start}
          active={mode === "unguided" && revealed}
          revealed={revealed}
          paintingDimsRef={paintingDimsRef}
          onInspectingChange={onInspectingChange}
          onPhaseChange={onPhaseChange}
          inspectApi={inspectApi}
          viewRef={viewRef}
        />
      )}
      <ExposureSync />
      <fog attach="fog" args={[ACTIVE_LIGHTING.fog.color, ACTIVE_LIGHTING.fog.near, ACTIVE_LIGHTING.fog.far]} />
      <color attach="background" args={["#0a0508"]} />
      <ambientLight intensity={ACTIVE_LIGHTING.ambient.intensity} color={ACTIVE_LIGHTING.ambient.color} />
      <hemisphereLight args={[ACTIVE_LIGHTING.hemisphere.sky, ACTIVE_LIGHTING.hemisphere.ground, ACTIVE_LIGHTING.hemisphere.intensity]} />
      {/* One gate for the entire room: wallpaper, bench, every painting + frame +
          picture-light. Nothing renders until all of it resolves, so it appears
          in a single frame rather than popping in piece by piece. */}
      <Suspense fallback={null}>
        <Room />
        <Bench position={[0, 0, -2]} />
        {artworks.map((artwork, index) => (
          <PaintingBoundary key={artwork._id}>
            <FloorLine artwork={artwork} />
            <Painting
              artwork={artwork}
              index={index}
              saturationRefs={saturationRefs}
              paintingDimsRef={paintingDimsRef}
              mode={mode}
              hiRes={!!inspecting && inspectedIndex === index}
              onReveal={onArtworkRevealed}
              onClick={onArtworkClick}
            />
          </PaintingBoundary>
        ))}
        <SceneReady onReady={onReady} />
      </Suspense>
    </>
  );
}

export default function GalleryScene({
  artworks,
  mode,
  onReady,
  onArtworkRevealed,
  onArtworkClick,
  saturationRefs,
  paintingDimsRef,
  onInspectingChange,
  onPhaseChange,
  inspectApi,
  viewRef,
  inspecting,
  inspectedIndex,
}: GallerySceneProps) {
  const [revealed, setRevealed] = useState(false);
  const handleReady = useCallback(() => {
    setRevealed(true);
    onReady?.();
  }, [onReady]);
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
        revealed={revealed}
        onReady={handleReady}
        onArtworkRevealed={onArtworkRevealed}
        onArtworkClick={onArtworkClick}
        saturationRefs={saturationRefs}
        paintingDimsRef={paintingDimsRef}
        onInspectingChange={onInspectingChange}
        onPhaseChange={onPhaseChange}
        inspectApi={inspectApi}
        viewRef={viewRef}
        inspecting={inspecting}
        inspectedIndex={inspectedIndex}
      />
    </Canvas>
  );
}
