"use client";

import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";
import Room from "./Room";
import DuskLight from "./DuskLight";
import Bench from "./Bench";
import Carpet from "./Carpet";
import Painting from "./Painting";
import FloorLine from "./FloorLine";
import { ACTIVE_LIGHTING } from "@/lib/lighting";
import { getPaintingTransform, getFacingDir, HALF_W, BACK_Z, FRONT_Z } from "@/lib/gallery-config";
import type { Artwork } from "@/lib/sanity";

export interface InspectApi {
  setZoomDir: (dir: -1 | 0 | 1) => void; // hold-to-zoom: +1 in, -1 out (past fit = exit), 0 stop
  exit: () => void;
  // Click a painting: walk to it at the closest roam frame; click again once it's
  // centred & closest → look closely. (Two-stage; no-op while inspecting.)
  tapPainting: (artworkIndex: number) => void;
  setView: (cx: number, cy: number) => void; // minimap drag → centre the view on framed coords (0..1)
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
  // ?debug only: resident texels per device pixel across the screen at the
  // current zoom. ≥1 ⇒ crisp (1:1 or minified); <1 ⇒ being upscaled (soft).
  samp?: number;
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
  onPlaqueClick?: (index: number, artwork: Artwork) => void; // nameplate tap → description mode
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
// On a portrait phone the room base distance is large (the painting's width drives
// the fit), so the farthest roam stop can dolly the eye clear past the opposite
// wall — landing behind its frames, which then read as empty boxes. Keep the eye
// this far in front of every wall so it always stays inside the room.
const WALL_MARGIN = 0.5;
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

// Mouse wheel / trackpad. In the room the wheel glides the continuous roam depth
// (and crosses into inspect at the closest point); in inspect the wheel glides the
// same continuous zoom as +/-. Scroll up (deltaY < 0) = move closer / zoom in.
const WHEEL_ZOOM_K = 0.0016; // inspect: ratio multiplier per wheel-delta unit
const WHEEL_ROAM_K = 0.0019; // roam: roamFactor multiplier per wheel-delta unit

// Room drag = paging, the way iOS swipes between photos. The view tracks the
// finger with a little resistance (DRAG_SENS, < 1:1), and on release a swipe of
// at least SWIPE_MIN px OR a flick faster than FLICK_MIN (px/ms) advances exactly
// one painting; anything less settles back to where you were.
const DRAG_SENS = 0.012; // metres of path per screen pixel while dragging
const SWIPE_MIN = 46; // px of net travel to page one painting
const FLICK_MIN = 0.45; // px/ms release speed that pages even on a short throw
const SETTLE_LAMBDA = 14; // damp rate the page glides home with (snappy but eased)
const DOUBLE_TAP_MS = 300; // two taps within this (and close together) = double-tap
// Drag stays within ±1 painting of where it began (with a soft rubber-band past
// that), so a fast throw can't fling the camera far down the wall and then crawl
// all the way back on release — the snap target is always adjacent, so it settles
// at once. This is the iOS paging feel: one swipe moves at most one painting.
const DRAG_RUBBER = 0.35; // how far past the ±1 window the drag drifts (0 = hard wall)
// Two-finger horizontal trackpad swipe pages between paintings (mirrors the drag);
// accumulate this much deltaX to step one, then lock until the swipe's inertia ends.
const WHEEL_PAGE_STEP = 50;

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
  const roomIdx = useRef(DEFAULT_ROOM_INDEX); // nearest discrete stop (keyboard ↑/↓)
  // Continuous roam depth as a multiple of the room base — wheel / pinch glide this
  // smoothly between the closest stop (ROOM_OUT[0]) and the overview (last stop);
  // the keyboard snaps it to the discrete ROOM_OUT stops.
  const roamFactor = useRef(ROOM_OUT[DEFAULT_ROOM_INDEX]);
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

  // Published each frame for touch gestures: metres-per-screen-pixel at the
  // current depth (so a one-finger drag moves the work 1:1 under the finger) and
  // the current pan extents (so the drag clamps to the framed edges).
  const panMpp = useRef(0.01);
  const maxXRef = useRef(0);
  const maxYRef = useRef(0);

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
  // At (or essentially at) the closest roam depth — the point a further step in
  // crosses into inspect. Continuous (wheel/pinch) and discrete (keyboard) agree.
  const atClosest = () => roamFactor.current <= ROOM_OUT[ROOM_CLOSEST_INDEX] + 1e-3;
  // Discrete stop nearest a continuous roam factor, so the keyboard stays in sync
  // after a wheel / pinch dolly.
  const nearestRoomStop = (f: number) => {
    let best = 0, bd = Infinity;
    for (let i = 0; i < ROOM_OUT.length; i++) {
      const d = Math.abs(ROOM_OUT[i] - f);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  };

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
    roamFactor.current = ROOM_OUT[ROOM_CLOSEST_INDEX];
    panXTarget.current = panYTarget.current = 0;
    heldKeys.current.clear();
    easeZoom.current = 9;
    onInspectingChange?.(false);
  };

  // Click a painting (two-stage). If it's the one you're already centred on at the
  // closest roam frame → look closely. Otherwise walk to it and pull in to that
  // closest frame (whole frame + nameplate); a second click then looks closely.
  const tapPainting = (artworkIndex: number) => {
    if (inspecting.current) return; // looking closely → clicks do nothing
    const anchorIdx = anchors.findIndex((a) => a.artworkIndex === artworkIndex);
    if (anchorIdx < 0) return;
    if (nearestAnchorIndex() === anchorIdx && atClosest()) {
      enterInspect();
    } else {
      targetU.current = U[anchorIdx];
      roomIdx.current = ROOM_CLOSEST_INDEX;
      roamFactor.current = ROOM_OUT[ROOM_CLOSEST_INDEX];
      easeLambda.current = 5; // graceful glide over to face it
    }
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
    if (dir === 1 && !inspecting.current && atClosest()) {
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

  // Drag the minimap to recentre the view: framed-normalised (cx,cy) → pan target,
  // clamped to the same edges the keyboard / drag honour.
  const setView = (cx: number, cy: number) => {
    if (!inspecting.current) return;
    const dims = currentDims();
    const framedW = dims.pw + 2 * dims.frameWidth;
    const framedH = dims.ph + 2 * dims.frameWidth;
    panXTarget.current = THREE.MathUtils.clamp((cx - 0.5) * framedW, -maxXRef.current, maxXRef.current);
    panYTarget.current = THREE.MathUtils.clamp((0.5 - cy) * framedH, -maxYRef.current, maxYRef.current);
    heldKeys.current.clear();
  };

  // Expose zoom/exit so the DOM zoom buttons can drive the 3D camera.
  useEffect(() => {
    if (!inspectApi) return;
    inspectApi.current = { setZoomDir, exit: exitInspect, tapPainting, setView };
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

  // Pointer / touch gestures. In the room a one-pointer horizontal drag walks
  // along the wall (mouse or finger). In "look closely" one finger pans the
  // magnifier 1:1, two fingers pinch-zoom, and at the whole-frame view a clear
  // pull-down or a hard pinch-in closes inspect. touch-action:none so the browser
  // never steals a gesture to scroll or page-zoom the canvas.
  useEffect(() => {
    const el = gl.domElement;
    el.style.cursor = active ? "grab" : "default";
    el.style.touchAction = "none";

    const pointers = new Map<number, { x: number; y: number }>();
    let gesture: "none" | "drag" | "pan" | "pinch" | "roompinch" = "none";
    let dragId = -1; // the one pointer that owns a room drag (ignore a stray 2nd finger)
    let startY = 0; // finger origin, for pull-down-to-exit at the whole frame
    let panFromX = 0, panFromY = 0; // finger origin of the active pan
    let panBaseX = 0, panBaseY = 0; // pan target when this pan began
    let pinchFromDist = 0, pinchFromRatio = 1;
    let roomPinchFromDist = 0, roomPinchFromFactor = 1; // roam two-finger dolly
    // Drag-as-paging bookkeeping.
    let dragStartX = 0, dragStartU = 0, dragStartIdx = 0, dragVel = 0, lastMoveT = 0;
    // Two-finger horizontal swipe paging (trackpad), with an inertia lock.
    let wheelPageAccum = 0, wheelPageLocked = false, wheelPageTimer = 0;
    // Double-tap (touch, inspect): toggle whole-frame ↔ surface.
    let lastTapAt = 0, lastTapX = 0, lastTapY = 0;

    const live = () => [...pointers.values()];
    const spread = () => { const p = live(); return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); };
    const beginPan = (x: number, y: number) => {
      gesture = "pan";
      panFromX = x; panFromY = y;
      panBaseX = panXTarget.current; panBaseY = panYTarget.current;
      heldKeys.current.clear();
    };
    const beginDrag = (x: number, pid: number) => {
      gesture = "drag";
      dragId = pid;
      dragging.current = true;
      lastX.current = x;
      dragStartX = x;
      dragStartU = u.current;
      dragStartIdx = nearestAnchorIndex();
      dragVel = 0;
      lastMoveT = performance.now();
    };
    // Page one painting from wherever we are now, gliding there snappily.
    const pageStep = (dir: 1 | -1) => {
      const idx = THREE.MathUtils.clamp(nearestAnchorIndex() + dir, 0, U.length - 1);
      targetU.current = U[idx];
      easeLambda.current = SETTLE_LAMBDA;
    };

    const onDown = (e: PointerEvent) => {
      if (!active) return;
      // Inspect-mode pan/pinch/double-tap are touch (or pen) gestures only — a
      // desktop mouse in "look closely" keeps arrows/click; the room drag is for
      // mouse and finger alike.
      const touchy = e.pointerType !== "mouse";
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        startY = e.clientY;
        if (inspecting.current) {
          if (touchy) {
            const now = performance.now();
            if (now - lastTapAt < DOUBLE_TAP_MS && Math.hypot(e.clientX - lastTapX, e.clientY - lastTapY) < 32) {
              // Double-tap: whole frame → lean onto the surface; zoomed → back out
              // to the whole frame (recentred). Eased by the dolly damp.
              if (inspectRatio.current > 0.92) {
                inspectRatio.current = Math.max(SURFACE_RATIO, minRatio.current);
              } else {
                inspectRatio.current = 1;
                panXTarget.current = panYTarget.current = 0;
              }
              lastTapAt = 0;
              gesture = "none";
              return;
            }
            lastTapAt = now; lastTapX = e.clientX; lastTapY = e.clientY;
            beginPan(e.clientX, e.clientY);
          }
        } else {
          beginDrag(e.clientX, e.pointerId);
          el.style.cursor = "grabbing";
        }
      } else if (pointers.size === 2 && touchy) {
        if (inspecting.current) {
          gesture = "pinch";
          dragging.current = false;
          pinchFromDist = spread() || 1;
          pinchFromRatio = inspectRatio.current;
          zoomDir.current = 0;
          pressDir.current = 0;
        } else {
          // Roam: two fingers dolly toward / away from the wall (pinch out = walk
          // closer); pinching past the closest stop crosses into "look closely".
          gesture = "roompinch";
          dragging.current = false;
          roomPinchFromDist = spread() || 1;
          roomPinchFromFactor = roamFactor.current;
        }
      }
    };

    const onMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (gesture === "drag") {
        if (!dragging.current || e.pointerId !== dragId) return;
        const now = performance.now();
        const dt = now - lastMoveT;
        const dx = e.clientX - lastX.current;
        if (dt > 0) dragVel = dx / dt; // px/ms, sign = drag direction
        lastMoveT = now;
        lastX.current = e.clientX;
        // Grab-the-room (iPhone-natural): the wall tracks the finger (drag right
        // brings the painting on your left toward you), mapped from the drag origin
        // and held to a ±1-painting window with a soft rubber-band — so a fast throw
        // can't sling the camera far and force a long crawl back on release.
        const lo = U[Math.max(0, dragStartIdx - 1)];
        const hi = U[Math.min(U.length - 1, dragStartIdx + 1)];
        let next = dragStartU - (e.clientX - dragStartX) * DRAG_SENS;
        if (next < lo) next = lo - (lo - next) * DRAG_RUBBER;
        else if (next > hi) next = hi + (next - hi) * DRAG_RUBBER;
        u.current = THREE.MathUtils.clamp(next, 0, total);
        targetU.current = u.current;
      } else if (gesture === "pan") {
        const mpp = panMpp.current;
        const dx = e.clientX - panFromX;
        const dy = e.clientY - panFromY;
        // Grab the canvas: drag right reveals the left edge, drag down the top.
        panXTarget.current = THREE.MathUtils.clamp(panBaseX - dx * mpp, -maxXRef.current, maxXRef.current);
        panYTarget.current = THREE.MathUtils.clamp(panBaseY + dy * mpp, -maxYRef.current, maxYRef.current);
        panX.current = panXTarget.current; // 1:1 under the finger, no easing lag
        panY.current = panYTarget.current;
        if (inspectRatio.current >= 0.985 && e.clientY - startY > 90) {
          exitInspect(); // whole frame + a clear pull-down = step back to the room
          pointers.clear();
          gesture = "none";
        }
      } else if (gesture === "pinch" && pointers.size >= 2) {
        const raw = pinchFromRatio * (pinchFromDist / (spread() || 1)); // fingers apart → zoom in
        if (raw >= 1.05) {
          exitInspect(); // keep pinching out past the whole frame → leave "look closely"
          pointers.clear();
          gesture = "none";
        } else {
          inspectRatio.current = THREE.MathUtils.clamp(raw, minRatio.current, 1);
        }
      } else if (gesture === "roompinch" && pointers.size >= 2) {
        const f = roomPinchFromFactor * (roomPinchFromDist / (spread() || 1)); // apart → smaller → closer
        if (f <= ROOM_OUT[ROOM_CLOSEST_INDEX] - 0.04) {
          enterInspect(); // pinched in past the closest stop → cross into inspect
          pointers.clear();
          gesture = "none";
        } else {
          roamFactor.current = THREE.MathUtils.clamp(f, ROOM_OUT[ROOM_CLOSEST_INDEX], ROOM_OUT[ROOM_OUT.length - 1]);
          roomIdx.current = nearestRoomStop(roamFactor.current);
        }
      }
    };

    const endPointer = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      if (gesture === "drag") {
        dragging.current = false;
        el.style.cursor = active ? "grab" : "default";
        // Page like iOS: a swipe past SWIPE_MIN, or a quick flick, advances exactly
        // one painting in the drag direction (drag left → next, right → previous);
        // otherwise settle back. Then glide home, snappy but eased.
        const net = lastX.current - dragStartX;
        let step = 0;
        if (net <= -SWIPE_MIN || dragVel <= -FLICK_MIN) step = 1;
        else if (net >= SWIPE_MIN || dragVel >= FLICK_MIN) step = -1;
        const target = THREE.MathUtils.clamp(dragStartIdx + step, 0, U.length - 1);
        targetU.current = U[target];
        easeLambda.current = SETTLE_LAMBDA;
        gesture = "none";
      } else if (gesture === "pinch" || gesture === "roompinch") {
        // Two → one finger continues as the one-finger gesture for that mode.
        if (pointers.size === 1) {
          if (inspecting.current) beginPan(live()[0].x, live()[0].y);
          else beginDrag(live()[0].x, [...pointers.keys()][0]);
        } else gesture = "none";
      } else if (gesture === "pan") {
        if (pointers.size >= 1) beginPan(live()[0].x, live()[0].y);
        else gesture = "none";
      }
    };

    // Mouse wheel / trackpad. Roam: a horizontal two-finger swipe pages between
    // paintings (mirrors the drag); a vertical scroll glides the continuous room
    // depth (and crosses into inspect scrolling in past the closest point). Inspect:
    // a plain two-finger scroll pans the magnifier; a pinch (ctrl+wheel) glides the
    // zoom. preventDefault so the page never scrolls, zooms, or navigates back.
    const onWheel = (e: WheelEvent) => {
      if (!active) return;
      e.preventDefault();
      if (inspecting.current) {
        if (e.ctrlKey) {
          zoomDir.current = 0; // pinch overrides any held-key glide
          pressDir.current = 0;
          const next = inspectRatio.current * Math.exp(e.deltaY * WHEEL_ZOOM_K * 4); // pinch deltas are small
          if (next >= 1) exitInspect();
          else inspectRatio.current = THREE.MathUtils.clamp(next, minRatio.current, 1);
        } else {
          const mpp = panMpp.current;
          panXTarget.current = THREE.MathUtils.clamp(panXTarget.current + e.deltaX * mpp, -maxXRef.current, maxXRef.current);
          panYTarget.current = THREE.MathUtils.clamp(panYTarget.current - e.deltaY * mpp, -maxYRef.current, maxYRef.current);
        }
        return;
      }
      // Clearly-horizontal swipe → page (the trackpad mirror of the mouse drag).
      // One painting per swipe: lock after a step and only release once the swipe's
      // inertia tail goes quiet, so momentum doesn't run through several paintings.
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.2) {
        if (wheelPageTimer) clearTimeout(wheelPageTimer);
        wheelPageTimer = window.setTimeout(() => { wheelPageAccum = 0; wheelPageLocked = false; }, 150);
        wheelPageAccum += e.deltaX;
        if (!wheelPageLocked && Math.abs(wheelPageAccum) >= WHEEL_PAGE_STEP) {
          pageStep(wheelPageAccum > 0 ? 1 : -1); // swipe-left → next, swipe-right → previous (mirrors drag)
          wheelPageLocked = true;
          wheelPageAccum = 0;
        }
        return;
      }
      const f = roamFactor.current * Math.exp(e.deltaY * WHEEL_ROAM_K);
      if (e.deltaY < 0 && f <= ROOM_OUT[ROOM_CLOSEST_INDEX]) {
        enterInspect(); // scrolled in past the closest point → look closely
        return;
      }
      roamFactor.current = THREE.MathUtils.clamp(f, ROOM_OUT[ROOM_CLOSEST_INDEX], ROOM_OUT[ROOM_OUT.length - 1]);
      roomIdx.current = nearestRoomStop(roamFactor.current);
    };

    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", endPointer);
    window.addEventListener("pointercancel", endPointer);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", endPointer);
      window.removeEventListener("pointercancel", endPointer);
      el.removeEventListener("wheel", onWheel);
      if (wheelPageTimer) clearTimeout(wheelPageTimer);
    };
    // exitInspect / nearestAnchorIndex only read refs, so a one-time bind is safe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        } else {
          // Roam: Esc returns to where you entered the scene — the start anchor at
          // the room-overview distance — gliding back gently.
          targetU.current = U[start] ?? 0;
          roomIdx.current = DEFAULT_ROOM_INDEX;
          roamFactor.current = ROOM_OUT[DEFAULT_ROOM_INDEX];
          easeLambda.current = 4.5;
        }
        e.preventDefault();
        return;
      }
      if (key === "+" || key === "=") {
        if (inspecting.current || atClosest()) {
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
        if (atClosest()) {
          enterInspect(); // at fit → cross into inspect
          swallowUp.current = true; // a ↑ held from the room stops at this first frame until released
        } else {
          roomIdx.current = nearestRoomStop(roamFactor.current);
          roomIdx.current = Math.max(ROOM_CLOSEST_INDEX, roomIdx.current - 1); // dolly closer one stop
          roamFactor.current = ROOM_OUT[roomIdx.current];
        }
        e.preventDefault();
      } else if (key === "ArrowDown") {
        roomIdx.current = nearestRoomStop(roamFactor.current);
        roomIdx.current = Math.min(roomIdx.current + 1, ROOM_OUT.length - 1);
        roamFactor.current = ROOM_OUT[roomIdx.current];
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
    // Deepest crisp zoom for THIS painting: the ratio at which the *currently
    // resident* texture maps ~1:1 to device pixels. Going deeper would only
    // upscale (soft), so clamp the deepest stop there. We key off loadedW (the
    // texture actually bound right now) rather than the planned target, so while
    // the hi-res master is still downloading you can only zoom to the base's 1:1
    // (crisp) — the deeper stop unlocks the moment the hi-res becomes resident.
    // High-res masters / larger screens thus earn a deeper stop; small masters
    // and phones stop shallower. hHalf at fit is the half view-width (m) when the
    // bare frame fills the screen.
    const hHalfAtFit = fit * TAN_HALF_V * aspect;
    const fbW = gl.domElement.width || sizeRef.current.width;
    const texW = dims.loadedW ?? dims.texWidth ?? 2048;
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
      : roomBaseDepth(dims, aspect) * roamFactor.current;
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
    // Publish for the touch pan handler (metres per screen pixel + pan extents).
    panMpp.current = (2 * vHalf) / Math.max(1, sizeRef.current.height);
    maxXRef.current = maxX;
    maxYRef.current = maxY;
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
    // axis to honour the current dolly depth (+ = back into the room). Cap the
    // backward travel so the eye never crosses the opposite wall (and ends up
    // behind its frames): clamp to where the facing axis meets the room bounds,
    // less a margin. Walls are axis-aligned, so only the facing axis moves.
    let extra = depth - VIEW_DIST;
    const xMax = HALF_W - WALL_MARGIN;
    const xMin = -HALF_W + WALL_MARGIN;
    const zMax = FRONT_Z - WALL_MARGIN;
    const zMin = BACK_Z + WALL_MARGIN;
    let maxExtra = Infinity;
    if (fx > 1e-6) maxExtra = Math.min(maxExtra, (xMax - px) / fx);
    else if (fx < -1e-6) maxExtra = Math.min(maxExtra, (xMin - px) / fx);
    if (fz > 1e-6) maxExtra = Math.min(maxExtra, (zMax - pz) / fz);
    else if (fz < -1e-6) maxExtra = Math.min(maxExtra, (zMin - pz) / fz);
    if (extra > maxExtra) extra = maxExtra;
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
        // Resident texels mapped across the screen width ÷ device pixels there.
        // dims.pw (m) spans the whole loaded texture (loadedW texels); the screen
        // shows 2*hHalf m of it across fbW device pixels.
        const fbW = gl.domElement.width || sizeRef.current.width;
        const loadedW = dims.loadedW ?? dims.texWidth ?? 0;
        const samp = loadedW > 0 && dims.pw > 0
          ? (loadedW * (2 * hHalf / dims.pw)) / fbW
          : undefined;
        viewRef.current = {
          cx: 0.5 + panX.current / framedW,
          cy: 0.5 - panY.current / framedH,
          w: Math.min(1, (2 * hHalf) / framedW),
          h: Math.min(1, (2 * vHalf) / framedH),
          samp,
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
  onPlaqueClick,
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
        <Room paused={!!inspecting} />
        <DuskLight />
        <Carpet position={[0, 0, -2]} />
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
              onPlaqueClick={onPlaqueClick}
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
  onPlaqueClick,
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
        onPlaqueClick={onPlaqueClick}
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
