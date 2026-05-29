"use client";

import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import type { Artwork, Exhibition } from "@/lib/sanity";
import type { InspectApi } from "@/components/gallery/GalleryScene";
import FilmGrain from "@/components/FilmGrain";
import { getMusic, setMusicSrc, consumeMusicArmed } from "@/lib/music";
import PerfOverlay from "@/components/gallery/PerfOverlay";
import { setPerfPhase } from "@/components/gallery/perf-state";

const GalleryScene = dynamic(() => import("@/components/gallery/GalleryScene"), {
  ssr: false,
  // Plain black while the chunk loads — the page's own "lights coming up" overlay
  // sits on top of this, so it never needs its own copy.
  loading: () => <div style={{ position: "fixed", inset: 0, background: "#060309" }} />,
});

// Animation helper for saturation reveal
function animateSaturation(uniform: { value: number }, target: number, duration: number = 1.5, onComplete?: () => void) {
  const start = uniform.value;
  const startTime = performance.now();

  function step(time: number) {
    const elapsed = (time - startTime) / 1000;
    const t = Math.min(elapsed / duration, 1.0);
    const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
    uniform.value = start + (target - start) * eased;
    if (t < 1.0) {
      requestAnimationFrame(step);
    } else {
      uniform.value = target;
      if (onComplete) onComplete();
    }
  }
  requestAnimationFrame(step);
}

function setAllSaturation(refs: React.MutableRefObject<{ [key: number]: { value: number } }>, value: number) {
  Object.values(refs.current).forEach(u => { u.value = value; });
}

// Ambient soundtrack volume when on, and a gentle linear fade so the music never
// snaps on or cuts off — it eases in/out under the room like a fader. The shared
// rafRef lets a new fade cancel a pending one, so rapid on/off toggles can't leave
// a stale fade-out's pause() firing after we've started playing again.
const MUSIC_VOLUME = 0.4;
function fadeAudio(
  audio: HTMLAudioElement,
  target: number,
  duration: number,
  rafRef: React.MutableRefObject<number>,
  onDone?: () => void,
) {
  cancelAnimationFrame(rafRef.current);
  const start = audio.volume;
  const startTime = performance.now();
  const step = (time: number) => {
    const t = Math.min((time - startTime) / (duration * 1000), 1);
    audio.volume = Math.max(0, Math.min(1, start + (target - start) * t));
    if (t < 1) {
      rafRef.current = requestAnimationFrame(step);
    } else if (onDone) {
      onDone();
    }
  };
  rafRef.current = requestAnimationFrame(step);
}

// ── Inspect-mode vignette ───────────────────────────────────────────────────
// A radial darkening overlaid on the scene to draw the eye to the canvas. Alpha
// follows a power curve t^curve across [start,end] (% of the way to the farthest
// corner). The curve has zero slope at the centre, so darkening eases in
// imperceptibly — no hard knee, hence no visible "bright ellipse" ring.
const VIGNETTE = {
  start: 24,      // % radius of the fully-clear core
  end: 96,        // % radius where it reaches full darkness
  maxAlpha: 0.86, // darkness at the edge (0–1)
  curve: 2.6,     // ramp exponent — higher keeps the centre clear, darkens the rim
  r: 6, g: 4, b: 10, // tint, matched to the room background ≈ rgb(6,3,9)
};

// The ending shape is orientation-aware: an ellipse hugs a landscape screen,
// while a portrait screen uses a circle so a (landscape) canvas keeps its sides
// clear and only the empty wall above/below it darkens.
function buildVignette(shape: "ellipse" | "circle"): string {
  const STOPS = 18;
  const parts: string[] = [];
  for (let i = 0; i <= STOPS; i++) {
    const t = i / STOPS;
    const pos = VIGNETTE.start + (VIGNETTE.end - VIGNETTE.start) * t;
    const a = VIGNETTE.maxAlpha * Math.pow(t, VIGNETTE.curve);
    parts.push(`rgba(${VIGNETTE.r},${VIGNETTE.g},${VIGNETTE.b},${a.toFixed(3)}) ${pos.toFixed(2)}%`);
  }
  return `radial-gradient(${shape} farthest-corner at 50% 50%, ${parts.join(", ")})`;
}

// "You are here" locator for inspect mode — a small thumbnail of the *framed*
// work (gilt frame drawn around the canvas) with a rectangle tracking the current
// view. Driven by its own rAF reading the shared (framed-normalised) view ref, so
// it never re-renders React per frame.
function InspectMinimap({
  imageUrl,
  dims,
  viewRef,
  isTouch,
  api,
}: {
  imageUrl: string;
  dims: { pw: number; ph: number; frameWidth: number };
  viewRef: React.MutableRefObject<{ cx: number; cy: number; w: number; h: number; samp?: number } | null>;
  isTouch: boolean;
  api: React.MutableRefObject<InspectApi | null>;
}) {
  const rectRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  // Click / drag anywhere on the thumbnail to fly the view there (framed-normalised
  // coords). Works with mouse + touch; keyboard arrows still pan in 3D.
  const moveTo = (clientX: number, clientY: number) => {
    const r = boxRef.current?.getBoundingClientRect();
    if (!r) return;
    const cx = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    const cy = Math.min(1, Math.max(0, (clientY - r.top) / r.height));
    api.current?.setView(cx, cy);
  };
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const v = viewRef.current;
      const r = rectRef.current;
      if (r) {
        if (v && (v.w < 0.985 || v.h < 0.985)) {
          const w = Math.max(0.05, Math.min(1, v.w));
          const h = Math.max(0.05, Math.min(1, v.h));
          const cx = Math.min(1 - w / 2, Math.max(w / 2, v.cx));
          const cy = Math.min(1 - h / 2, Math.max(h / 2, v.cy));
          r.style.opacity = "1";
          r.style.left = (cx - w / 2) * 100 + "%";
          r.style.top = (cy - h / 2) * 100 + "%";
          r.style.width = w * 100 + "%";
          r.style.height = h * 100 + "%";
        } else {
          r.style.opacity = "0"; // whole work in view — no rectangle needed
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [viewRef]);

  const fw = dims.frameWidth;
  const framedW = dims.pw + 2 * fw;
  const framedH = dims.ph + 2 * fw;
  const aspect = framedW / framedH;
  const longSide = 112;
  const boxW = aspect >= 1 ? longSide : Math.round(longSide * aspect);
  const boxH = aspect >= 1 ? Math.round(longSide / aspect) : longSide;
  const insetX = (fw / framedW) * 100; // frame thickness as % of the framed box
  const insetY = (fw / framedH) * 100;

  // Desktop: bottom-left. Touch: top-left — the control bar lives bottom-centre on
  // a phone, so a bottom-left minimap would collide with its left button.
  const place: React.CSSProperties = isTouch
    ? { top: "calc(16px + env(safe-area-inset-top))", left: "calc(16px + env(safe-area-inset-left))" }
    : { bottom: 18, left: 18 };
  return (
    <div style={{
      position: "fixed", ...place, zIndex: 205, pointerEvents: "none",
      padding: 5, borderRadius: 4, background: "rgba(5,3,8,0.5)",
      border: "1px solid rgba(201,168,76,0.28)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
      boxShadow: "0 6px 20px rgba(0,0,0,0.4)",
    }}>
      <div
        ref={boxRef}
        onPointerDown={(e) => { e.stopPropagation(); draggingRef.current = true; (e.currentTarget as Element).setPointerCapture?.(e.pointerId); moveTo(e.clientX, e.clientY); }}
        onPointerMove={(e) => { if (draggingRef.current) moveTo(e.clientX, e.clientY); }}
        onPointerUp={() => { draggingRef.current = false; }}
        onPointerCancel={() => { draggingRef.current = false; }}
        style={{ position: "relative", width: boxW, height: boxH, borderRadius: 2, overflow: "hidden", pointerEvents: "auto", cursor: "crosshair", touchAction: "none" }}
      >
        {/* gilt frame */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: "linear-gradient(135deg, #d8b765 0%, #b8923f 45%, #7c5e29 100%)",
          boxShadow: "inset 0 0 3px rgba(0,0,0,0.5)",
        }} />
        {/* canvas, inset by the frame thickness */}
        <img src={imageUrl} alt="" draggable={false} style={{
          position: "absolute", top: insetY + "%", left: insetX + "%",
          width: 100 - 2 * insetX + "%", height: 100 - 2 * insetY + "%",
          objectFit: "fill", opacity: 0.9, pointerEvents: "none",
        }} />
        {/* current view, in framed coordinates */}
        <div ref={rectRef} style={{
          position: "absolute", boxSizing: "border-box", border: "1.5px solid rgba(245,222,140,0.97)", pointerEvents: "none",
          background: "rgba(201,168,76,0.14)", boxShadow: "0 0 6px rgba(0,0,0,0.7)", transition: "opacity 0.25s ease",
        }} />
      </div>
    </div>
  );
}

// ?debug readout — confirms the inspected painting's resident texture resolution
// (loaded vs the requested target vs the source master), polled per frame off the
// shared dims ref so it tracks the hi-res swap live.
function DebugHUD({
  index,
  artwork,
  dimsRef,
  viewRef,
}: {
  index: number;
  artwork: Artwork;
  dimsRef: React.MutableRefObject<{ [index: number]: { texWidth?: number; loadedW?: number; loadedH?: number } }>;
  viewRef: React.MutableRefObject<{ samp?: number } | null>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const master = useMemo(() => {
    const m = (artwork?.image?.asset?._ref || "").match(/-(\d+)x(\d+)-/);
    return m ? `${m[1]}×${m[2]}` : "—";
  }, [artwork]);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const d = dimsRef.current[index];
      if (ref.current) {
        const loaded = d?.loadedW ? `${d.loadedW}×${d.loadedH ?? "?"}` : "…";
        // samp = resident texels per device pixel at the current zoom. ≥1 means
        // every screen pixel is backed by ≥1 real image pixel (crisp); <1 means
        // the texture is being stretched (soft) — which the zoom cap should
        // prevent, so this should never drop below ~1 at max zoom.
        const samp = viewRef.current?.samp;
        let quality = "";
        if (typeof samp === "number") {
          quality = samp >= 0.98
            ? ` · SHARP ${samp.toFixed(2)}×`
            : ` · UPSCALING ${(1 / samp).toFixed(1)}×`;
        }
        ref.current.textContent = `${artwork?.title ?? ""} · loaded ${loaded} · target ${d?.texWidth ?? "?"}px · master ${master}${quality}`;
        ref.current.style.color = typeof samp === "number" && samp < 0.98 ? "#ff7a6b" : "#c9e8a8";
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [index, artwork, master, dimsRef, viewRef]);
  return (
    <div
      ref={ref}
      style={{
        position: "fixed", top: 12, left: 12, zIndex: 300, pointerEvents: "none",
        font: "11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace",
        color: "#c9e8a8", background: "rgba(5,3,8,0.72)", padding: "5px 9px", borderRadius: 5,
        border: "1px solid rgba(201,168,76,0.3)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
        letterSpacing: "0.02em", whiteSpace: "nowrap",
      }}
    />
  );
}

// One consolidated control cluster (bottom-centre): the current key→action hints
// plus the interactive zoom buttons. It flashes when the keys change meaning,
// then recedes to a small handle; hovering the handle (or cluster) brings it back.
const CONTROL_HINTS: Record<"roam" | "entry" | "cropped", { keys: string[]; label: string }[]> = {
  roam: [{ keys: ["←", "→"], label: "切换画作" }, { keys: ["↑"], label: "走近" }, { keys: ["↓"], label: "退后" }],
  entry: [{ keys: ["↑"], label: "贴近端详" }, { keys: ["↓"], label: "退出" }],
  cropped: [{ keys: ["↑", "↓", "←", "→"], label: "移动" }, { keys: ["Esc"], label: "退出" }],
};

// Touch has no keyboard, so the same phases get gesture hints instead of key pills.
const TOUCH_HINTS: Record<"roam" | "entry" | "cropped", string> = {
  roam: "左右滑动漫步 · 轻触画作贴近看",
  entry: "拖动平移 · 双指缩放 · 下滑退出",
  cropped: "拖动漫游 · 双指缩放 · 下滑退出",
};

const HINT_PILL: React.CSSProperties = {
  minWidth: 24, height: 24, padding: "0 5px", borderRadius: 6,
  display: "flex", alignItems: "center", justifyContent: "center",
  border: "1px solid rgba(201,168,76,0.45)", background: "rgba(5,3,8,0.6)",
  backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
  color: "#c9a84c", fontSize: 13, lineHeight: 1, boxShadow: "0 1px 4px rgba(0,0,0,0.5)",
};
const HINT_LABEL: React.CSSProperties = {
  fontFamily: "'Cormorant Garamond', serif", fontSize: 13.5, fontStyle: "italic",
  letterSpacing: "0.03em", color: "rgba(201,168,76,0.92)", whiteSpace: "nowrap",
  textShadow: "0 1px 3px rgba(0,0,0,0.92), 0 0 10px rgba(0,0,0,0.6)",
};
const ZOOM_BTN: React.CSSProperties = {
  width: 30, height: 30, borderRadius: "50%", border: "1px solid rgba(201,168,76,0.5)",
  background: "rgba(5,3,8,0.6)", color: "#c9a84c", cursor: "pointer", fontSize: "1.1rem",
  display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1,
  backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", touchAction: "none",
  boxShadow: "0 1px 4px rgba(0,0,0,0.5)",
};

// A small "locator" glyph for the minimap toggle — a framed work with a bright
// viewport rectangle inside, far clearer than the old ▦ square.
function MinimapIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden style={{ display: "block" }}>
      <rect x="2.3" y="3.6" width="15.4" height="12.8" rx="1.6" stroke="currentColor" strokeWidth="1.6" />
      <rect x="4.4" y="5.7" width="7" height="5" rx="0.9" fill="currentColor" />
    </svg>
  );
}

function ControlBar({
  phase,
  show,
  inspecting,
  api,
  minimapOn,
  onToggleMinimap,
  musicOn,
  onToggleMusic,
  musicAvailable,
  isTouch,
  isLandscape,
}: {
  phase: "roam" | "entry" | "cropped";
  show: boolean;
  inspecting: boolean;
  api: React.MutableRefObject<InspectApi | null>;
  minimapOn: boolean;
  onToggleMinimap: () => void;
  musicOn: boolean;
  onToggleMusic: () => void;
  musicAvailable: boolean;
  isTouch: boolean;
  isLandscape: boolean;
}) {
  // Touch has no hover to summon the bar back, so the buttons stay reachable (the
  // bar sits up); the hint line still only flashes (show) so it doesn't sit over
  // the work while you examine it.
  const barUp = show || isTouch;
  const tBtnSize: React.CSSProperties = isTouch ? { width: 42, height: 42 } : {};
  return (
    <div style={{
      // On a narrow portrait phone the bar sits a row higher so its right-hand
      // button clears the bottom-right mode toggle; in landscape (wide) there's no
      // such collision so it hugs the bottom, and on desktop likewise.
      position: "fixed", bottom: isTouch && !isLandscape ? "calc(84px + env(safe-area-inset-bottom))" : "calc(22px + env(safe-area-inset-bottom))", left: 0, right: 0, zIndex: 210,
      display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
      opacity: barUp ? 1 : 0, transition: "opacity 0.45s ease", pointerEvents: "none",
    }}>
      {/* Contextual hints — keyboard key pills on desktop, gesture text on touch.
          They sit ABOVE the buttons so the buttons never shift when hints change,
          and only show on the flash (show) so they don't linger over the art. */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, opacity: show ? 1 : 0, transition: "opacity 0.45s ease" }}>
        {isTouch ? (
          <span style={HINT_LABEL}>{TOUCH_HINTS[phase]}</span>
        ) : (
          CONTROL_HINTS[phase].map((item, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div style={{ display: "flex", gap: 4 }}>
                {item.keys.map((k) => <span key={k} style={HINT_PILL}>{k}</span>)}
              </div>
              <span style={HINT_LABEL}>{item.label}</span>
            </div>
          ))
        )}
      </div>
      {/* Fixed control buttons — the SAME buttons in the SAME place every phase, so
          muscle memory holds (zoom never jumps). Inactive controls dim in place
          instead of disappearing. */}
      <div style={{ display: "flex", alignItems: "center", gap: isTouch ? 14 : 10, pointerEvents: barUp ? "auto" : "none" }}>
        {([["−", -1], ["+", 1]] as const).map(([label, dir]) => (
          <button
            key={label}
            disabled={!inspecting}
            onPointerDown={(e) => { e.preventDefault(); api.current?.setZoomDir(dir); }}
            onPointerUp={() => api.current?.setZoomDir(0)}
            onPointerLeave={() => api.current?.setZoomDir(0)}
            onPointerCancel={() => api.current?.setZoomDir(0)}
            aria-label={dir === 1 ? "zoom in" : "zoom out"}
            style={{ ...ZOOM_BTN, ...tBtnSize, fontSize: isTouch ? "1.45rem" : ZOOM_BTN.fontSize, opacity: inspecting ? 1 : 0.3, cursor: inspecting ? "pointer" : "default" }}
          >{label}</button>
        ))}
        <button
          disabled={!inspecting}
          onClick={onToggleMinimap}
          aria-label="toggle locator thumbnail"
          title="位置缩略图 · Locator"
          style={{
            ...ZOOM_BTN, ...tBtnSize,
            opacity: inspecting ? 1 : 0.3, cursor: inspecting ? "pointer" : "default",
            borderColor: minimapOn && inspecting ? "rgba(245,222,140,0.95)" : "rgba(201,168,76,0.4)",
            background: minimapOn && inspecting ? "rgba(201,168,76,0.22)" : "rgba(5,3,8,0.6)",
          }}
        ><MinimapIcon size={isTouch ? 20 : 17} /></button>
        {/* Ambient music — shown only when the exhibition has a soundtrack in the
            CMS (no bundled fallback). Always active (not gated on inspect) and
            highlights when playing; the click is the gesture browsers require. */}
        {musicAvailable && (
          <button
            onClick={onToggleMusic}
            aria-label="toggle music"
            title={musicOn ? "音乐 · 关" : "音乐 · 开"}
            style={{
              ...ZOOM_BTN, ...tBtnSize, fontSize: isTouch ? 19 : 15,
              borderColor: musicOn ? "rgba(245,222,140,0.95)" : "rgba(201,168,76,0.5)",
              background: musicOn ? "rgba(201,168,76,0.22)" : "rgba(5,3,8,0.6)",
            }}
          >{musicOn ? "♫" : "♪"}</button>
        )}
        {/* Touch has no Esc key — a clear exit button while looking closely (dimmed
            in place otherwise, so the row never shifts). */}
        {isTouch && (
          <button
            disabled={!inspecting}
            onClick={() => api.current?.exit()}
            aria-label="exit look closely"
            title="退出 · Exit"
            style={{
              ...ZOOM_BTN, ...tBtnSize, fontSize: 22,
              opacity: inspecting ? 1 : 0.3, cursor: inspecting ? "pointer" : "default",
            }}
          >×</button>
        )}
      </div>
    </div>
  );
}

export default function GalleryPage() {
  const [mode, setMode] = useState<"guided" | "unguided">("unguided");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [exhibition, setExhibition] = useState<Exhibition | null>(null);
  const [activeArtwork, setActiveArtwork] = useState<{ index: number; artwork: Artwork } | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [narrative, setNarrative] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [sceneReady, setSceneReady] = useState(false);
  const [overlayGone, setOverlayGone] = useState(false);
  const saturationRefs = useRef<{ [key: number]: { value: number } }>({});
  const autoAdvanceRef = useRef<number | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [inspectedIndex, setInspectedIndex] = useState<number | null>(null);
  const [inspectCue, setInspectCue] = useState(false); // brief "look closely" prompt on entry
  const [nearBottom, setNearBottom] = useState(false); // mouse near the bottom → reveal controls
  const [showMinimap, setShowMinimap] = useState(true); // thumbnail visible during inspect (toggle)
  const [musicOn, setMusicOn] = useState(false); // ambient soundtrack on/off
  const musicFadeRaf = useRef(0);
  const inspectApi = useRef<InspectApi | null>(null);
  const paintingDimsRef = useRef<{ [index: number]: { pw: number; ph: number; frameWidth: number; texWidth?: number; loadedW?: number; loadedH?: number } }>({});
  const viewRef = useRef<{ cx: number; cy: number; w: number; h: number; samp?: number } | null>(null);
  // ?debug — show a small resolution readout for the inspected painting (hidden
  // for normal visitors).
  const debug = useMemo(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("debug"), []);
  // Which control set the keys drive now (roam / inspect entry / cropped surface).
  // Flash a fresh hint whenever it changes so the visitor always knows the keys.
  const [controlPhase, setControlPhase] = useState<"roam" | "entry" | "cropped">("roam");
  const [hintsOn, setHintsOn] = useState(false);
  const [isTouch, setIsTouch] = useState(false); // coarse pointer → touch model & always-reachable controls
  const [showOnboard, setShowOnboard] = useState(false); // first-visit gesture primer, fades after a beat
  // English-primary by default; flips to Chinese-primary when the browser/device
  // prefers a Chinese locale. The bilingual UI shows both either way.
  const [zhFirst, setZhFirst] = useState(false);

  // Coarse pointer (phone / tablet): no hover to summon the control bar back, so
  // keep it reachable; and swap the keyboard hints for gesture hints. ?touch forces
  // it on for testing where a desktop reports a fine pointer.
  useEffect(() => {
    const forced = new URLSearchParams(window.location.search).has("touch");
    const mq = window.matchMedia("(pointer: coarse)");
    const apply = () => setIsTouch(forced || mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);

  // Prefer the visitor's own language for the bilingual copy. ?lang=zh|en forces it.
  useEffect(() => {
    const forced = new URLSearchParams(window.location.search).get("lang");
    if (forced === "zh") { setZhFirst(true); return; }
    if (forced === "en") { setZhFirst(false); return; }
    const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
    setZhFirst(langs.some((l) => /^zh/i.test(l)));
  }, []);

  // Inspect-mode vignette — ellipse on a landscape screen, circle on portrait
  // (so a landscape canvas keeps its sides clear instead of being pinched).
  const [vigPortrait, setVigPortrait] = useState(false);
  useEffect(() => {
    const apply = () => setVigPortrait(window.innerHeight > window.innerWidth);
    apply();
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);
    return () => {
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
    };
  }, []);
  const vignetteBg = useMemo(() => buildVignette(vigPortrait ? "circle" : "ellipse"), [vigPortrait]);

  // The whole room — wallpaper, lighting, every painting + frame — is held behind
  // one Suspense gate and revealed in a single frame once all of it is decoded.
  // `ready` flips the black overlay to brightening. The degenerate case (data
  // failed, no artworks) still lifts the curtain so we don't trap the visitor.
  const ready = sceneReady || (!loading && artworks.length === 0);

  // Drop the overlay from the tree once it has finished fading, so it stops
  // intercepting nothing-events and is gone for good.
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => setOverlayGone(true), 3000);
    return () => clearTimeout(t);
  }, [ready]);

  // Bring the soundtrack up in step with the room opening — but only if the
  // visitor entered through the door, which armed + unlocked the audio on that
  // click. Reset to 0:00 so the audible music starts at the top, synced to the
  // reveal, even though it has been playing silently since the door.
  useEffect(() => {
    if (!ready || !consumeMusicArmed()) return;
    const audio = getMusic();
    if (!audio) return;
    audio.currentTime = 0;
    audio.play()
      .then(() => { setMusicOn(true); fadeAudio(audio, MUSIC_VOLUME, 2.6, musicFadeRaf); })
      .catch(() => {});
  }, [ready]);

  // When inspect mode begins, flash the "look closely" prompt and zoom buttons,
  // then let them recede — the buttons come back on hover.
  useEffect(() => {
    if (!inspecting) {
      setInspectCue(false);
      return;
    }
    setInspectCue(true);
    const t = setTimeout(() => setInspectCue(false), 2600);
    return () => clearTimeout(t);
  }, [inspecting]);

  // Flash the control hint whenever the active key set changes (and on first
  // entry to free mode), then let it recede.
  useEffect(() => {
    if (mode !== "unguided" || !ready) { setHintsOn(false); return; }
    setHintsOn(true);
    const t = setTimeout(() => setHintsOn(false), 4200);
    return () => clearTimeout(t);
  }, [controlPhase, mode, ready]);

  // First visit only: once the room has opened, fade in a brief primer of the
  // core gestures (desktop vs touch), then let it recede. Any deliberate input
  // dismisses it early. Marked seen in localStorage so it shows just once.
  useEffect(() => {
    if (!ready || mode !== "unguided") return;
    let seen = true;
    try { seen = localStorage.getItem("sv-onboarded") === "1"; } catch {}
    if (seen) return;
    try { localStorage.setItem("sv-onboarded", "1"); } catch {}
    const showT = setTimeout(() => setShowOnboard(true), 2800);
    const hideT = setTimeout(() => setShowOnboard(false), 9200);
    const dismiss = () => setShowOnboard(false);
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("keydown", dismiss);
    window.addEventListener("wheel", dismiss, { passive: true });
    return () => {
      clearTimeout(showT);
      clearTimeout(hideT);
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("keydown", dismiss);
      window.removeEventListener("wheel", dismiss);
    };
  }, [ready, mode]);

  // Reveal the control panel when the mouse comes down to the bottom of the
  // screen; otherwise it stays out of the way while you look at the work.
  useEffect(() => {
    if (mode !== "unguided") { setNearBottom(false); return; }
    const onMove = (e: MouseEvent) => setNearBottom(e.clientY > window.innerHeight - 120);
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [mode]);

  // Load data — reuse what the entrance already fetched (sessionStorage) so the
  // gallery doesn't pay a second round trip behind the black screen.
  useEffect(() => {
    async function load() {
      try {
        let data: any = null;
        try {
          const cached = sessionStorage.getItem("sv-exhibition");
          if (cached) data = JSON.parse(cached);
        } catch {}
        if (!data) {
          const res = await fetch("/api/exhibition");
          data = await res.json();
        }
        if (data?.artworks) {
          // Camera faces the north wall; the south (camera) wall stays empty —
          // drop its artwork so no painting or frame renders there.
          setArtworks(data.artworks.filter((a: Artwork) => a.position?.wall !== "south"));
          setExhibition(data);
          // Honour the CMS soundtrack for the deep-link case (no door gesture
          // armed it) and the manual ♪ button; a no-op if the door already armed
          // the same track.
          setMusicSrc(data.backgroundMusicUrl);
        }
      } catch (e) {
        console.error("Failed to load exhibition data", e);
      }
      setLoading(false);
    }
    load();
  }, []);

  // Reveal first artwork in guided mode
  useEffect(() => {
    if (mode === "guided" && artworks.length > 0 && currentIndex === 0) {
      const timer = setTimeout(() => revealNext(), 600);
      return () => clearTimeout(timer);
    }
  }, [artworks, mode]);

  const revealNext = useCallback(() => {
    if (currentIndex >= artworks.length) return;
    const uniform = saturationRefs.current[currentIndex];
    if (!uniform) return;

    animateSaturation(uniform, 1.0, 1.5, () => {
      const artwork = artworks[currentIndex];
      if (artwork) {
        setActiveArtwork({ index: currentIndex, artwork });
        setNarrative(artwork.narrative || "");
      }
    });

    setCurrentIndex(prev => prev + 1);

    // Auto-advance after 12s
    if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current);
    autoAdvanceRef.current = window.setTimeout(() => {
      if (currentIndex + 1 < artworks.length) revealNext();
    }, 12000);
  }, [currentIndex, artworks]);

  const handlePrev = useCallback(() => {
    if (currentIndex <= 1) return;
    const prevIdx = currentIndex - 2;
    const uniform = saturationRefs.current[prevIdx];
    if (uniform) uniform.value = 0.0;
    setCurrentIndex(prevIdx);
    if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current);
    setTimeout(() => revealNext(), 400);
  }, [currentIndex, revealNext]);

  const handleModeToggle = useCallback(() => {
    if (mode === "guided") {
      setMode("unguided");
      setAllSaturation(saturationRefs, 1.0);
      setActiveArtwork(null);
      setNarrative("");
      if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current);
    } else {
      setMode("guided");
      setAllSaturation(saturationRefs, 0.0);
      setCurrentIndex(0);
      if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current);
      setTimeout(() => revealNext(), 500);
    }
  }, [mode, revealNext]);

  // Click a painting (all devices): two-stage — walk to it at the closest roam
  // frame, then a second click looks closely. Guided mode is an auto-tour, so
  // clicks don't respond there.
  const handleArtworkClick = useCallback((index: number, _artwork: Artwork) => {
    if (mode !== "unguided") return;
    inspectApi.current?.tapPainting(index);
  }, [mode]);

  // Tap a nameplate → description mode (the black-backdrop view: work above,
  // title / artist / year / narrative below). Free mode only.
  const handlePlaqueClick = useCallback((index: number, artwork: Artwork) => {
    if (mode !== "unguided") return;
    setActiveArtwork({ index, artwork });
    setNarrative(artwork.narrative || "");
    setLightboxOpen(true);
  }, [mode]);

  // Toggle the ambient soundtrack. The click itself is the user gesture browsers
  // require before audio may start, so play() succeeds the first time. Volume eases
  // in/out; on stop we pause only after the fade so it doesn't cut off.
  const handleToggleMusic = useCallback(() => {
    const audio = getMusic();
    if (!audio) return;
    if (musicOn) {
      setMusicOn(false);
      fadeAudio(audio, 0, 1.2, musicFadeRaf, () => audio.pause());
    } else {
      audio.play()
        .then(() => {
          setMusicOn(true);
          fadeAudio(audio, MUSIC_VOLUME, 1.8, musicFadeRaf);
        })
        .catch((e) => console.warn("Music playback was blocked", e));
    }
  }, [musicOn]);

  const currentArtwork = activeArtwork?.artwork;

  return (
    <div style={{ position: "fixed", inset: 0, background: "#060309", overflow: "hidden" }}>
      {/* 3D Gallery — only mounted once we have artworks, so the Suspense gate
          (and its scene-ready signal) is never tripped by an empty room. */}
      {artworks.length > 0 && (
        <GalleryScene
          artworks={artworks}
          mode={mode}
          onReady={() => setSceneReady(true)}
          onArtworkRevealed={(idx, aw) => {
            setActiveArtwork({ index: idx, artwork: aw });
            setNarrative(aw.narrative || "");
          }}
          onArtworkClick={handleArtworkClick}
          onPlaqueClick={handlePlaqueClick}
          saturationRefs={saturationRefs}
          paintingDimsRef={paintingDimsRef}
          onInspectingChange={(insp, idx) => {
            setInspecting(insp);
            if (insp && idx != null) setInspectedIndex(idx);
          }}
          inspectApi={inspectApi}
          viewRef={viewRef}
          inspecting={inspecting}
          inspectedIndex={inspectedIndex}
          onPhaseChange={(p) => { setControlPhase(p); setPerfPhase(p); }}
        />
      )}

      {/* ?perf (or backtick toggle) — standing FPS / draw-call / memory readout */}
      <PerfOverlay />

      {/* Scene transition — an eyelid "eyes opening": two black lids meet at the
          centre and, once ready, retract up and down to reveal the room through a
          widening horizontal slit. The gallery seen through the gap starts blurred
          and sharpens in step with the opening, like vision focusing. */}
      {!overlayGone && (
        <>
          {/* blur-to-focus over whatever the lids reveal */}
          <div style={{
            position: "fixed", inset: 0, zIndex: 399, pointerEvents: "none",
            backdropFilter: ready ? "blur(0px)" : "blur(20px)",
            WebkitBackdropFilter: ready ? "blur(0px)" : "blur(20px)",
            transition: "backdrop-filter 2.6s cubic-bezier(0.4,0,0.2,1), -webkit-backdrop-filter 2.6s cubic-bezier(0.4,0,0.2,1)",
          }} />
          {/* upper lid — retracts off the top. Its leading (lower) edge fades to
              transparent so the reveal is a soft gradient, not a hard line. Tall &
              overlapping at the centre so the screen still holds solid black when
              closed (the feathers sit over the other lid's solid body). */}
          <div style={{
            position: "fixed", left: 0, right: 0, top: 0, height: "72%", zIndex: 400,
            background: "linear-gradient(to bottom, #060309 0%, #060309 86%, rgba(6,3,9,0) 100%)",
            transform: ready ? "translateY(-100%)" : "translateY(0)",
            transition: "transform 2.6s cubic-bezier(0.5,0,0.2,1)",
            pointerEvents: ready ? "none" : "auto",
          }} />
          {/* lower lid — retracts off the bottom, leading (upper) edge feathered */}
          <div style={{
            position: "fixed", left: 0, right: 0, bottom: 0, height: "72%", zIndex: 400,
            background: "linear-gradient(to top, #060309 0%, #060309 86%, rgba(6,3,9,0) 100%)",
            transform: ready ? "translateY(100%)" : "translateY(0)",
            transition: "transform 2.6s cubic-bezier(0.5,0,0.2,1)",
            pointerEvents: ready ? "none" : "auto",
          }} />
          {/* Film grain over the black — alive, "the show is loading up," not a
              frozen screen. Fades out as the lids open. */}
          <FilmGrain opacity={ready ? 0 : 1} zIndex={401} />
        </>
      )}

      {/* Curator Panel */}
      <div style={{
        position: "fixed", top: "calc(16px + env(safe-area-inset-top))", right: "calc(16px + env(safe-area-inset-right))", zIndex: 200, display: "flex", alignItems: "center", gap: 8,
        opacity: 1, transition: "opacity 1s ease 3s",
      }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg, #c9a84c, #8b6914)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "#2a1a08", fontWeight: 600 }}>VII</div>
        <span style={{ fontSize: 11, color: "rgba(201,168,76,0.9)", fontStyle: "italic", textShadow: "0 1px 3px rgba(0,0,0,0.92), 0 0 10px rgba(0,0,0,0.6)" }}>策展人的话 · Curator{"'"}s Note</span>
      </div>

      {/* Narrative Panel */}
      {mode === "guided" && narrative && (
        <div style={{
          position: "fixed", bottom: 80, left: 16, zIndex: 200, maxWidth: 300,
          background: "rgba(5,3,8,0.82)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
          borderLeft: "3px solid #c9a84c", padding: "14px 16px", opacity: 1,
          transform: "translateY(0)", transition: "opacity 0.5s ease, transform 0.5s ease",
          pointerEvents: "none",
        }}>
          <p style={{ fontSize: 13, fontWeight: 300, lineHeight: 1.6, color: "#c9a98d", fontStyle: "italic", margin: 0 }}>
            {narrative}
          </p>
        </div>
      )}

      {/* Progress dots + Nav buttons */}
      {mode === "guided" && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 200,
          display: "flex", alignItems: "center", gap: 14,
        }}>
          <button
            onClick={handlePrev}
            disabled={currentIndex <= 1}
            style={{
              width: 36, height: 36, borderRadius: "50%", border: "1px solid rgba(201,168,76,0.4)",
              background: "rgba(5,3,8,0.6)", color: currentIndex <= 1 ? "rgba(201,168,76,0.25)" : "#c9a84c",
              cursor: currentIndex <= 1 ? "default" : "pointer", fontSize: "1.2rem", display: "flex",
              alignItems: "center", justifyContent: "center", backdropFilter: "blur(8px)",
            }}
          >
            ←
          </button>
          {artworks.map((_, i) => (
            <div key={i} style={{
              width: 8, height: 8, borderRadius: "50%",
              background: i < currentIndex ? "#c9a84c" : "rgba(201,168,76,0.25)",
              transition: "background 0.3s ease",
            }} />
          ))}
          <button
            onClick={() => { if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current); revealNext(); }}
            disabled={currentIndex >= artworks.length}
            style={{
              width: 36, height: 36, borderRadius: "50%", border: "1px solid rgba(201,168,76,0.4)",
              background: "rgba(5,3,8,0.6)", color: currentIndex >= artworks.length ? "rgba(201,168,76,0.25)" : "#c9a84c",
              cursor: currentIndex >= artworks.length ? "default" : "pointer", fontSize: "1.2rem", display: "flex",
              alignItems: "center", justifyContent: "center", backdropFilter: "blur(8px)",
            }}
          >
            →
          </button>
        </div>
      )}

      {/* Consolidated control cluster — key hints + zoom buttons; flashes on a
          control change, then recedes to a handle that reveals it on hover */}
      {mode === "unguided" && (
        <ControlBar
          phase={controlPhase}
          show={hintsOn || nearBottom}
          inspecting={inspecting}
          api={inspectApi}
          minimapOn={showMinimap}
          onToggleMinimap={() => setShowMinimap((v) => !v)}
          musicOn={musicOn}
          onToggleMusic={handleToggleMusic}
          musicAvailable={!!exhibition?.backgroundMusicUrl}
          isTouch={isTouch}
          isLandscape={!vigPortrait}
        />
      )}

      {/* Inspect mode — vignette to focus the eye on the canvas */}
      {mode === "unguided" && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 150, pointerEvents: "none",
          background: vignetteBg,
          opacity: inspecting ? 1 : 0, transition: "opacity 1s ease",
        }} />
      )}

      {/* Inspect mode — "look closely" entry prompt (flashes, then recedes) */}
      {mode === "unguided" && (
        <div style={{
          position: "fixed", top: "13%", left: "50%", transform: "translateX(-50%)", zIndex: 200,
          display: "flex", flexDirection: "column", alignItems: "center", gap: 6, pointerEvents: "none",
          opacity: inspecting && inspectCue ? 1 : 0, transition: "opacity 0.8s ease",
        }}>
          <span style={{
            fontFamily: "'Cormorant Garamond', serif", fontSize: 19, fontStyle: "italic",
            letterSpacing: "0.06em", color: "#c9a84c",
            textShadow: "0 1px 3px rgba(0,0,0,0.95), 0 0 14px rgba(0,0,0,0.7)",
          }}>
            贴近观看 · look closely
          </span>
        </div>
      )}


      {/* First-visit gesture primer — fades in once the room has opened, then
          recedes (or on the first deliberate input). Adapts to touch vs desktop. */}
      {mode === "unguided" && !inspecting && (
        <div style={{
          position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 200,
          display: "flex", flexDirection: "column", alignItems: "center", gap: 8, pointerEvents: "none",
          opacity: showOnboard ? 1 : 0, transition: "opacity 1.1s ease",
        }}>
          {(() => {
            const en = isTouch ? "Swipe to explore · Tap a painting to look closely" : "Drag to explore · Click to look closely · Scroll to approach";
            const zh = isTouch ? "左右滑动漫步 · 轻触画作贴近看" : "拖动浏览 · 点击细看 · 滚轮靠近";
            const primary = zhFirst ? zh : en;
            const secondary = zhFirst ? en : zh;
            return (
              <>
                <span style={{
                  fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(17px, 4.4vw, 22px)", fontStyle: "italic",
                  letterSpacing: "0.04em", color: "#c9a84c", textAlign: "center",
                  textShadow: "0 1px 3px rgba(0,0,0,0.95), 0 0 16px rgba(0,0,0,0.75)",
                }}>
                  {primary}
                </span>
                <span style={{
                  fontFamily: "'Cormorant Garamond', serif", fontSize: 13, letterSpacing: "0.04em",
                  color: "rgba(201,168,76,0.6)", textAlign: "center",
                  textShadow: "0 1px 3px rgba(0,0,0,0.9)",
                }}>
                  {secondary}
                </span>
              </>
            );
          })()}
        </div>
      )}

      {/* Inspect mode — "you are here" minimap (toggle from the control panel) */}
      {mode === "unguided" && inspecting && showMinimap && inspectedIndex != null && artworks[inspectedIndex]?.imageUrl && (
        <InspectMinimap
          imageUrl={artworks[inspectedIndex].imageUrl as string}
          dims={paintingDimsRef.current[inspectedIndex] ?? { pw: 1, ph: 1, frameWidth: 0.09 }}
          viewRef={viewRef}
          isTouch={isTouch}
          api={inspectApi}
        />
      )}

      {/* ?debug — resident texture resolution readout for the inspected work */}
      {debug && mode === "unguided" && inspecting && inspectedIndex != null && artworks[inspectedIndex] && (
        <DebugHUD index={inspectedIndex} artwork={artworks[inspectedIndex]} dimsRef={paintingDimsRef} viewRef={viewRef} />
      )}

      {/* Mode Toggle */}
      <button
        onClick={handleModeToggle}
        style={{
          position: "fixed", bottom: "calc(20px + env(safe-area-inset-bottom))", right: "calc(16px + env(safe-area-inset-right))", zIndex: 210, display: "flex", alignItems: "center", gap: 6,
          padding: "8px 14px", borderRadius: 20, background: "rgba(5,3,8,0.6)", backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)", border: "1px solid rgba(201,168,76,0.3)", cursor: "pointer",
          color: "#c9a84c", fontFamily: "'Cormorant Garamond', serif", fontSize: 13, fontWeight: 400,
          transition: "all 0.2s ease",
        }}
      >
        {mode === "guided" ? "Guided · 导览" : "Free · 自由"}
      </button>

      {/* Lightbox */}
      {lightboxOpen && currentArtwork && (
        <div
          onClick={() => setLightboxOpen(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 500, background: "rgba(0,0,0,0.92)",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            opacity: 1, transition: "opacity 0.4s ease",
          }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setLightboxOpen(false); }}
            style={{
              position: "absolute", top: 20, right: 20, width: 44, height: 44, borderRadius: "50%",
              border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.08)", color: "#f5f0eb",
              fontSize: "1.4rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              zIndex: 10, lineHeight: 1,
            }}
          >
            ×
          </button>
          <div style={{ maxWidth: "85vw", maxHeight: "65vh", boxShadow: "0 0 60px rgba(0,0,0,0.5)" }}>
            <img
              src={currentArtwork.imageUrl || (currentArtwork.image?.asset ? `https://cdn.sanity.io/images/${process.env.NEXT_PUBLIC_SANITY_PROJECT_ID}/${process.env.NEXT_PUBLIC_SANITY_DATASET}/${currentArtwork.image.asset._ref.replace('image-', '').replace('-jpg', '.jpg')}` : "")}
              alt={currentArtwork.title}
              style={{ width: "100%", height: "auto", maxHeight: "65vh", objectFit: "contain", display: "block" }}
            />
          </div>
          <div style={{ marginTop: 20, textAlign: "center", maxWidth: 500, padding: "0 20px" }}>
            <div style={{ fontSize: "clamp(1.1rem,2.5vw,1.5rem)", fontWeight: 500, color: "#c9a84c", marginBottom: 4 }}>
              {currentArtwork.title} / {currentArtwork.titleCN}
            </div>
            <div style={{ fontSize: "0.9rem", fontStyle: "italic", color: "rgba(245,240,235,0.6)", marginBottom: 12 }}>
              {currentArtwork.artist}, {currentArtwork.year}
            </div>
            <div style={{ fontSize: "0.85rem", fontWeight: 300, lineHeight: 1.6, color: "rgba(245,240,235,0.75)" }}>
              {currentArtwork.narrative}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
