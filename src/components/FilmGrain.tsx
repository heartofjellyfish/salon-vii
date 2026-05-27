"use client";

// Subtle film-grain veil for the loading-black moments. Two warm noise layers
// drift opposite ways so the pattern "boils" in place rather than visibly
// sliding, with a slow exposure flicker — a film leader before the show, not
// TV snow. `opacity` gates the whole thing (fade in/out); the inner layers keep
// their own animated opacities, which multiply with it.
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
      <div style={{
        position: "absolute", inset: 0, backgroundImage: noise(0.7), backgroundSize: "180px 180px",
        animation: "sv-grain-a 0.42s steps(3) infinite, sv-grain-flick 6s ease-in-out infinite",
      }} />
      <div style={{
        position: "absolute", inset: 0, backgroundImage: noise(1.1), backgroundSize: "130px 130px",
        opacity: 0.28,
        animation: "sv-grain-b 0.6s steps(3) infinite",
      }} />
      <style jsx global>{`
        @keyframes sv-grain-a {
          0%   { background-position: 0 0; }
          33%  { background-position: -37px 41px; }
          66%  { background-position: 44px -33px; }
          100% { background-position: -29px -25px; }
        }
        @keyframes sv-grain-b {
          0%   { background-position: 0 0; }
          33%  { background-position: 38px -44px; }
          66%  { background-position: -46px 30px; }
          100% { background-position: 26px 33px; }
        }
        @keyframes sv-grain-flick {
          0%, 100% { opacity: 0.44; }
          25%      { opacity: 0.32; }
          55%      { opacity: 0.54; }
          80%      { opacity: 0.38; }
        }
      `}</style>
    </div>
  );
}
