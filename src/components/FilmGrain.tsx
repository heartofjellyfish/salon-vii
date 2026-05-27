"use client";

// Subtle film-grain veil for the loading-black moments. Three warm noise layers
// at different grain sizes cross-fade on smooth, phase-offset opacity loops, so
// the speckle "boils" — its density drifts denser/sparser — without ever sliding
// or stepping. Opacity is GPU-composited, so it stays smooth even on first open
// while the main thread is busy decoding textures (the old stepped position
// jumps stuttered there). `opacity` gates the whole thing in/out and multiplies
// with each layer's animated opacity.
function noise(freq: number) {
  return (
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E" +
    "%3Cfilter id='f'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='" + freq +
    "' numOctaves='2' stitchTiles='stitch'/%3E" +
    "%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 0.95 0 0 0 0 0.86 0.8 0 0 0 -0.33'/%3E" +
    "%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23f)'/%3E%3C/svg%3E\")"
  );
}

export default function FilmGrain({ opacity = 1, zIndex = 401 }: { opacity?: number; zIndex?: number }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex, pointerEvents: "none", opacity, transition: "opacity 0.9s ease" }}>
      <div className="sv-grain sv-grain-1" style={{ backgroundImage: noise(0.68), backgroundSize: "170px 170px" }} />
      <div className="sv-grain sv-grain-2" style={{ backgroundImage: noise(1.05), backgroundSize: "110px 110px" }} />
      <div className="sv-grain sv-grain-3" style={{ backgroundImage: noise(0.42), backgroundSize: "250px 250px", backgroundPosition: "37px 61px" }} />
      <style jsx global>{`
        .sv-grain { position: absolute; inset: 0; will-change: opacity; }
        /* phase-offset smooth pulses → the visible grain drifts denser/sparser */
        .sv-grain-1 { animation: sv-grain-p1 2.3s ease-in-out infinite; }
        .sv-grain-2 { animation: sv-grain-p2 3.1s ease-in-out infinite; }
        .sv-grain-3 { animation: sv-grain-p3 4.3s ease-in-out infinite; }
        @keyframes sv-grain-p1 { 0%, 100% { opacity: 0.14; } 50% { opacity: 0.44; } }
        @keyframes sv-grain-p2 { 0%, 100% { opacity: 0.42; } 50% { opacity: 0.12; } }
        @keyframes sv-grain-p3 { 0%, 100% { opacity: 0.08; } 50% { opacity: 0.26; } }
      `}</style>
    </div>
  );
}
