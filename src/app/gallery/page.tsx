"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import type { Artwork, Exhibition } from "@/lib/sanity";

const GalleryScene = dynamic(() => import("@/components/gallery/GalleryScene"), {
  ssr: false,
  loading: () => (
    <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0508", color: "#c9a84c", fontFamily: "'Cormorant Garamond', serif", fontSize: "1.1rem" }}>
      Preparing the gallery…
    </div>
  ),
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

export default function GalleryPage() {
  const [mode, setMode] = useState<"guided" | "unguided">("unguided");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [exhibition, setExhibition] = useState<Exhibition | null>(null);
  const [activeArtwork, setActiveArtwork] = useState<{ index: number; artwork: Artwork } | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [narrative, setNarrative] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const saturationRefs = useRef<{ [key: number]: { value: number } }>({});
  const autoAdvanceRef = useRef<number | null>(null);
  const [showHint, setShowHint] = useState(false);

  // Reveal the navigation hint a beat after the room settles, then let it
  // dismiss itself — or fade out the moment the visitor takes the wheel.
  useEffect(() => {
    if (loading) return;
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
  }, [loading]);

  // Load data from Sanity
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/exhibition");
        const data = await res.json();
        if (data.artworks) {
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
    <div style={{ position: "fixed", inset: 0, background: "#0a0508", overflow: "hidden" }}>
      {/* 3D Gallery */}
      <GalleryScene
        artworks={artworks}
        mode={mode}
        onArtworkRevealed={(idx, aw) => {
          setActiveArtwork({ index: idx, artwork: aw });
          setNarrative(aw.narrative || "");
        }}
        onArtworkClick={handleArtworkClick}
        saturationRefs={saturationRefs}
      />

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
      {mode === "unguided" && (
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
