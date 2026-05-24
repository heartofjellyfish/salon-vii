"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const [doorOpen, setDoorOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const router = useRouter();

  useEffect(() => {
    // Simulate loading + preload
    let p = 0;
    const interval = setInterval(() => {
      p += Math.random() * 15;
      if (p >= 100) {
        p = 100;
        clearInterval(interval);
        setTimeout(() => setLoading(false), 400);
      }
      setProgress(Math.min(p, 100));
    }, 200);
    return () => clearInterval(interval);
  }, []);

  const handleEnter = useCallback(() => {
    setDoorOpen(true);
    setTimeout(() => {
      router.push("/gallery");
    }, 1600);
  }, [router]);

  return (
    <>
      {/* Loading Screen */}
      {loading && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000, background: "#0a0508",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          transition: "opacity 0.8s ease-out",
        }}>
          <div style={{ fontSize: "clamp(28px,5vw,48px)", fontWeight: 300, letterSpacing: "0.35em", color: "#c9a84c", marginBottom: 8 }}>
            SALON VII
          </div>
          <div style={{ fontSize: "clamp(11px,1.8vw,15px)", fontWeight: 300, fontStyle: "italic", color: "#d4a03c", marginBottom: 40, textAlign: "center", padding: "0 20px" }}>
            Salle I — The Wrong Man at the Right Time
          </div>
          <div style={{ width: "clamp(160px,30vw,260px)", height: 2, background: "rgba(201,168,76,0.15)", borderRadius: 1, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${progress}%`, background: "linear-gradient(90deg, #c9a84c, #d4a03c)", transition: "width 0.3s ease", borderRadius: 1 }} />
          </div>
        </div>
      )}

      {/* Door Scene */}
      <div
        onClick={handleEnter}
        style={{
          position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center",
          background: "radial-gradient(ellipse at center, #2A0A14 0%, #0E0308 70%)",
          cursor: "pointer", transition: "opacity 0.8s ease-out",
          opacity: doorOpen ? 0 : 1, pointerEvents: doorOpen ? "none" : "auto",
        }}
      >
        {/* Corridor background */}
        <div style={{
          position: "absolute", inset: 0,
          background: `repeating-linear-gradient(0deg, transparent, transparent 4px, rgba(0,0,0,0.04) 4px, rgba(0,0,0,0.04) 5px),
            radial-gradient(ellipse at 30% 40%, rgba(60,20,30,0.3) 0%, transparent 50%),
            radial-gradient(ellipse at 70% 60%, rgba(40,15,20,0.2) 0%, transparent 50%),
            linear-gradient(180deg, #1a0810 0%, #220d18 50%, #1a0810 100%)`,
          pointerEvents: "none",
        }} />

        {/* Shoes */}
        <div style={{ position: "absolute", bottom: "14%", right: "28%", width: 60, height: 30 }}>
          <div style={{ position: "absolute", bottom: 0, width: 40, height: 14, background: "linear-gradient(180deg, #3a2010, #2a1508)", borderRadius: "20px 20px 6px 6px", transform: "rotate(-8deg)" }} />
          <div style={{ position: "absolute", bottom: 0, left: 28, width: 36, height: 14, background: "linear-gradient(180deg, #3a2010, #2a1508)", borderRadius: "20px 20px 6px 6px", transform: "rotate(5deg)" }} />
        </div>

        {/* Coat hook */}
        <div style={{ position: "absolute", top: "16%", right: "24%", width: 50, height: 80 }}>
          <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: 14, height: 14, background: "#7a6a4a", borderRadius: "50%", boxShadow: "0 1px 2px rgba(0,0,0,0.4)" }} />
          <div style={{
            position: "absolute", top: 10, left: -6, width: 44, height: 60,
            background: "linear-gradient(180deg, #4a3020, #3a2018)", borderRadius: "14px 14px 8px 8px",
            boxShadow: "2px 2px 4px rgba(0,0,0,0.3)",
          }}>
            <div style={{
              position: "absolute", top: 16, left: 4, width: 16, height: 28,
              background: "linear-gradient(135deg, #5a4030, #4a3020)", borderRadius: 4, transform: "rotate(-12deg)",
            }} />
          </div>
        </div>

        {/* Door card */}
        <div style={{
          position: "absolute", left: "calc(50% + 100px)", top: "38%", transform: "translateY(-50%)",
          background: "rgba(30,15,12,0.85)", border: "1px solid rgba(180,140,100,0.3)", padding: "8px 10px",
          maxWidth: 150, fontSize: 10, fontWeight: 300, lineHeight: 1.5, color: "#b8a080",
          backdropFilter: "blur(4px)", opacity: 0.85, pointerEvents: "none",
        }}>
          <div style={{ position: "absolute", top: -6, left: "50%", transform: "translateX(-50%)", width: 6, height: 6, background: "radial-gradient(circle, #c9a84c, #7a5a2a)", borderRadius: "50%", boxShadow: "0 0 4px rgba(201,168,76,0.3)" }} />
          <div style={{ fontSize: 9, fontWeight: 500, letterSpacing: "0.15em", color: "#c9a84c", marginBottom: 3, textTransform: "uppercase" }}>Salle I</div>
          <div style={{ fontSize: 8, fontStyle: "italic", color: "#9a8a6a", lineHeight: 1.4 }}>The Wrong Man at the Right Time<br />/ 错的时间，对的人</div>
        </div>

        {/* 3D Door */}
        <div style={{ perspective: 1200, width: 280, height: 460, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
          <div style={{
            position: "relative", width: 240, height: 380, transformStyle: "preserve-3d",
            transition: "transform 1.4s cubic-bezier(0.25,0.1,0.25,1)", transformOrigin: "left center", zIndex: 10,
            transform: doorOpen ? "rotateY(-105deg)" : "none",
          }}>
            {/* Door front */}
            <div style={{
              position: "absolute", inset: 0,
              background: "linear-gradient(180deg, #5a3a28 0%, #4a2a18 30%, #3a2010 60%, #2a1808 100%)",
              borderRadius: "6px 6px 0 0", boxShadow: "inset 2px 0 6px rgba(0,0,0,0.3), 4px 4px 16px rgba(0,0,0,0.5)",
            }}>
              <div style={{ position: "absolute", inset: 20, border: "2px solid rgba(0,0,0,0.15)", borderRadius: 4 }} />
              <div style={{ position: "absolute", top: "50%", left: 20, right: 20, height: 2, background: "rgba(0,0,0,0.12)" }} />

              {/* Door panels */}
              <div style={{ position: "absolute", left: 28, right: 28, top: 26, bottom: 26, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <div style={{ border: "1px solid rgba(0,0,0,0.1)", borderRadius: 3, background: "rgba(0,0,0,0.04)", height: "calc(50% - 6px)" }} />
                <div style={{ border: "1px solid rgba(0,0,0,0.1)", borderRadius: 3, background: "rgba(0,0,0,0.04)", height: "calc(50% - 6px)" }} />
              </div>

              {/* Nameplate */}
              <div style={{
                position: "absolute", top: "42%", left: "50%", transform: "translate(-50%,-50%)", width: 130,
                background: "linear-gradient(135deg, #d4a843, #b8860b, #8b6914, #d4a843)", borderRadius: 3,
                padding: "6px 10px", textAlign: "center", boxShadow: "0 0 8px rgba(201,168,76,0.3), inset 0 0 2px rgba(255,255,220,0.3)",
              }}>
                <span style={{ fontSize: 15, fontWeight: 500, letterSpacing: "0.35em", color: "#2a1a08", lineHeight: 1 }}>SALON VII</span>
              </div>

              {/* Doorknob */}
              <div style={{
                position: "absolute", right: 16, top: "53%", width: 18, height: 34, transform: "translateY(-50%)",
                background: "linear-gradient(135deg, #d4b060, #a0802a, #d4b060)", borderRadius: "50%/40%",
                boxShadow: "0 0 8px rgba(201,168,76,0.3), inset -1px -1px 3px rgba(0,0,0,0.3), inset 1px 1px 3px rgba(255,255,200,0.3)",
              }} />
            </div>

            {/* Door back */}
            <div style={{
              position: "absolute", inset: 0, background: "linear-gradient(180deg, #3a2010, #2a1808)",
              borderRadius: "6px 6px 0 0", transform: "rotateY(180deg)", backfaceVisibility: "hidden",
            }} />

            {/* Light leak */}
            <div style={{
              position: "absolute", bottom: -6, left: 12, right: 12, height: 4,
              background: "linear-gradient(90deg, transparent, rgba(255,208,96,0.6), rgba(255,180,40,0.7), rgba(255,208,96,0.6), transparent)",
              borderRadius: 2, boxShadow: "0 -2px 12px rgba(255,180,40,0.4), 0 -1px 24px rgba(255,160,40,0.2)",
              animation: "flicker 3s ease-in-out infinite",
            }} />
          </div>
        </div>

        {/* Hint */}
        <div style={{
          position: "absolute", bottom: "22%", left: "50%", transform: "translateX(-50%)",
          fontSize: 12, fontWeight: 300, fontStyle: "italic", color: "rgba(201,168,76,0.5)",
          animation: "pulse-hint 2.5s ease-in-out infinite", pointerEvents: "none", whiteSpace: "nowrap",
        }}>
          Enter the gallery · 进入展厅
        </div>
      </div>

      <style jsx global>{`
        @keyframes flicker {
          0%, 100% { opacity: 0.8; }
          50% { opacity: 1; }
          30% { opacity: 0.7; }
          70% { opacity: 0.9; }
        }
        @keyframes pulse-hint {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.8; }
        }
        @media (max-width: 768px) {
          .door-stage { width: 180px; height: 320px; }
        }
      `}</style>
    </>
  );
}
