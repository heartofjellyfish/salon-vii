"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import type { Artwork, Exhibition } from "@/lib/sanity";

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

// "You are here" locator for inspect mode — a small thumbnail of the *framed*
// work (gilt frame drawn around the canvas) with a rectangle tracking the current
// view. Driven by its own rAF reading the shared (framed-normalised) view ref, so
// it never re-renders React per frame.
function InspectMinimap({
  imageUrl,
  dims,
  viewRef,
}: {
  imageUrl: string;
  dims: { pw: number; ph: number; frameWidth: number };
  viewRef: React.MutableRefObject<{ cx: number; cy: number; w: number; h: number } | null>;
}) {
  const rectRef = useRef<HTMLDivElement>(null);
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

  return (
    <div style={{
      position: "fixed", left: 18, bottom: 18, zIndex: 205, pointerEvents: "none",
      padding: 5, borderRadius: 4, background: "rgba(5,3,8,0.5)",
      border: "1px solid rgba(201,168,76,0.28)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
      boxShadow: "0 6px 20px rgba(0,0,0,0.4)",
    }}>
      <div style={{ position: "relative", width: boxW, height: boxH, borderRadius: 2, overflow: "hidden" }}>
        {/* gilt frame */}
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(135deg, #d8b765 0%, #b8923f 45%, #7c5e29 100%)",
          boxShadow: "inset 0 0 3px rgba(0,0,0,0.5)",
        }} />
        {/* canvas, inset by the frame thickness */}
        <img src={imageUrl} alt="" style={{
          position: "absolute", top: insetY + "%", left: insetX + "%",
          width: 100 - 2 * insetX + "%", height: 100 - 2 * insetY + "%",
          objectFit: "fill", opacity: 0.9,
        }} />
        {/* current view, in framed coordinates */}
        <div ref={rectRef} style={{
          position: "absolute", boxSizing: "border-box", border: "1.5px solid rgba(245,222,140,0.97)",
          background: "rgba(201,168,76,0.14)", boxShadow: "0 0 6px rgba(0,0,0,0.7)", transition: "opacity 0.25s ease",
        }} />
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
  const [showHint, setShowHint] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [inspectedIndex, setInspectedIndex] = useState<number | null>(null);
  const [inspectCue, setInspectCue] = useState(false); // brief "look closely" prompt on entry
  const [zoomHover, setZoomHover] = useState(false);
  const inspectApi = useRef<{ zoom: (dir: 1 | -1) => void; exit: () => void } | null>(null);
  const paintingDimsRef = useRef<{ [index: number]: { pw: number; ph: number; frameWidth: number } }>({});
  const viewRef = useRef<{ cx: number; cy: number; w: number; h: number } | null>(null);

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

  // Reveal the navigation hint a beat after the room brightens, then let it
  // dismiss itself — or fade out the moment the visitor takes the wheel.
  useEffect(() => {
    if (!ready) return;
    const appear = setTimeout(() => setShowHint(true), 1400);
    const vanish = setTimeout(() => setShowHint(false), 8000);
    const dismiss = (e: KeyboardEvent) => {
      if (e.key.startsWith("Arrow")) setShowHint(false);
    };
    window.addEventListener("keydown", dismiss);
    return () => {
      clearTimeout(appear);
      clearTimeout(vanish);
      window.removeEventListener("keydown", dismiss);
    };
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

  const handleArtworkClick = useCallback((index: number, artwork: Artwork) => {
    setLightboxOpen(true);
    setActiveArtwork({ index, artwork });
  }, []);

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
          saturationRefs={saturationRefs}
          paintingDimsRef={paintingDimsRef}
          onInspectingChange={(insp, idx) => {
            setInspecting(insp);
            if (insp && idx != null) setInspectedIndex(idx);
          }}
          inspectApi={inspectApi}
          viewRef={viewRef}
        />
      )}

      {/* Scene transition — an "eyes opening" reveal. The black curtain carries a
          soft circular hole at its centre; once everything's ready the hole irises
          open (mask-size grows), so the room becomes visible from the middle
          outward. A warm sliver of light blooms in the centre first, then
          dissolves as sight fills in. */}
      {!overlayGone && (
        <>
          <div
            style={{
              position: "fixed", inset: 0, zIndex: 400, background: "#060309",
              WebkitMaskImage: "radial-gradient(circle at 50% 50%, transparent 0%, transparent 36%, #000 60%)",
              maskImage: "radial-gradient(circle at 50% 50%, transparent 0%, transparent 36%, #000 60%)",
              WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat",
              WebkitMaskPosition: "center", maskPosition: "center",
              WebkitMaskSize: ready ? "320% 320%" : "1.5% 1.5%",
              maskSize: ready ? "320% 320%" : "1.5% 1.5%",
              transition: "-webkit-mask-size 2.8s cubic-bezier(0.4,0,0.2,1), mask-size 2.8s cubic-bezier(0.4,0,0.2,1)",
              pointerEvents: ready ? "none" : "auto",
            }}
          />
          <div style={{
            position: "fixed", inset: 0, zIndex: 401, pointerEvents: "none",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <div style={{
              width: "46vmin", height: "46vmin", borderRadius: "50%",
              background: "radial-gradient(circle, rgba(255,228,184,0.6), rgba(255,198,122,0.16) 46%, transparent 72%)",
              opacity: 0,
              animation: ready ? "sv-bloom 2.8s cubic-bezier(0.4,0,0.2,1) both" : "none",
            }} />
          </div>
        </>
      )}
      <style jsx global>{`
        @keyframes sv-bloom {
          0%   { opacity: 0; transform: scale(0.4); }
          22%  { opacity: 1; transform: scale(0.8); }
          100% { opacity: 0; transform: scale(2.4); }
        }
      `}</style>

      {/* Curator Panel */}
      <div style={{
        position: "fixed", top: 16, right: 16, zIndex: 200, display: "flex", alignItems: "center", gap: 8,
        opacity: 1, transition: "opacity 1s ease 3s",
      }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg, #c9a84c, #8b6914)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "#2a1a08", fontWeight: 600 }}>VII</div>
        <span style={{ fontSize: 11, color: "rgba(201,168,76,0.7)", fontStyle: "italic" }}>策展人的话 · Curator{"'"}s Note</span>
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

      {/* Arrow-key navigation hint */}
      {mode === "unguided" && !inspecting && (
        <div style={{
          position: "fixed", bottom: 34, left: "50%", transform: "translateX(-50%)", zIndex: 200,
          display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
          opacity: showHint ? 1 : 0, transition: "opacity 1.2s ease", pointerEvents: "none",
        }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 30px)", gridTemplateRows: "repeat(2, 30px)", gap: 5, justifyItems: "center" }}>
            {(["", "↑", "", "←", "↓", "→"] as const).map((k, i) => (
              <div key={i} style={{
                visibility: k ? "visible" : "hidden",
                width: 30, height: 30, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center",
                border: "1px solid rgba(201,168,76,0.4)", background: "rgba(5,3,8,0.55)",
                backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
                color: "#c9a84c", fontSize: 15, lineHeight: 1,
              }}>{k}</div>
            ))}
          </div>
          <span style={{
            fontFamily: "'Cormorant Garamond', serif", fontSize: 12.5, fontStyle: "italic",
            letterSpacing: "0.04em", color: "rgba(201,168,76,0.72)", whiteSpace: "nowrap",
          }}>
            方向键漫步展厅 · use the arrow keys to wander
          </span>
        </div>
      )}

      {/* Inspect mode — vignette to focus the eye on the canvas */}
      {mode === "unguided" && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 150, pointerEvents: "none",
          background: "radial-gradient(ellipse at center, transparent 50%, rgba(5,3,8,0.6) 100%)",
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
          }}>
            贴近观看 · look closely
          </span>
          <span style={{
            fontFamily: "'Cormorant Garamond', serif", fontSize: 12.5,
            letterSpacing: "0.03em", color: "rgba(201,168,76,0.62)",
          }}>
            方向键漫游 · +/− 缩放 · Esc 退后
          </span>
        </div>
      )}

      {/* Inspect mode — zoom buttons (revealed on entry, then only on hover) */}
      {mode === "unguided" && inspecting && (
        <div
          onMouseEnter={() => setZoomHover(true)}
          onMouseLeave={() => setZoomHover(false)}
          style={{
            position: "fixed", right: 0, top: "50%", transform: "translateY(-50%)", zIndex: 210,
            display: "flex", flexDirection: "column", gap: 10, padding: "28px 18px 28px 44px",
            opacity: inspectCue || zoomHover ? 1 : 0, transition: "opacity 0.6s ease",
          }}
        >
          {([["+", 1], ["−", -1]] as const).map(([label, dir]) => (
            <button
              key={label}
              onClick={() => inspectApi.current?.zoom(dir as 1 | -1)}
              aria-label={dir === 1 ? "zoom in" : "zoom out"}
              style={{
                width: 42, height: 42, borderRadius: "50%", border: "1px solid rgba(201,168,76,0.4)",
                background: "rgba(5,3,8,0.6)", color: "#c9a84c", cursor: "pointer", fontSize: "1.4rem",
                display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1,
                backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Inspect mode — "you are here" minimap */}
      {mode === "unguided" && inspecting && inspectedIndex != null && artworks[inspectedIndex]?.imageUrl && (
        <InspectMinimap
          imageUrl={artworks[inspectedIndex].imageUrl as string}
          dims={paintingDimsRef.current[inspectedIndex] ?? { pw: 1, ph: 1, frameWidth: 0.09 }}
          viewRef={viewRef}
        />
      )}

      {/* Mode Toggle */}
      <button
        onClick={handleModeToggle}
        style={{
          position: "fixed", bottom: 20, right: 16, zIndex: 210, display: "flex", alignItems: "center", gap: 6,
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
