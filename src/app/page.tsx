"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const [entering, setEntering] = useState(false);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const router = useRouter();

  useEffect(() => {
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
    if (entering) return;
    setEntering(true);
    setTimeout(() => {
      router.push("/gallery");
    }, 1500);
  }, [entering, router]);

  return (
    <>
      {/* Loading Screen */}
      {loading && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "radial-gradient(ellipse at center, #5a2926 0%, #2e1413 75%)",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          transition: "opacity 0.8s ease-out",
        }}>
          <div style={{ fontSize: "clamp(28px,5vw,48px)", fontWeight: 400, letterSpacing: "0.4em", color: "#f0e6d8", marginBottom: 10 }}>
            SALON VII
          </div>
          <div style={{ fontSize: "clamp(11px,1.8vw,15px)", fontWeight: 300, fontStyle: "italic", color: "rgba(240,230,216,0.6)", marginBottom: 42, textAlign: "center", padding: "0 20px" }}>
            Salle I — The Wrong Man at the Right Time
          </div>
          <div style={{ width: "clamp(160px,30vw,260px)", height: 2, background: "rgba(240,230,216,0.15)", borderRadius: 1, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${progress}%`, background: "linear-gradient(90deg, #d9c4a0, #c9a84c)", transition: "width 0.3s ease", borderRadius: 1 }} />
          </div>
        </div>
      )}

      {/* Exhibition intro wall */}
      <div
        style={{
          position: "fixed", inset: 0, zIndex: 100, overflow: "hidden",
          background: "#0e0608", perspective: "1400px",
        }}
      >
        {/* The wall — scales toward the doorway on enter (push-through) */}
        <div
          className="sv-room"
          style={{
            position: "absolute", inset: 0,
            transformOrigin: "80% 54%",
            transform: entering ? "scale(7)" : "scale(1)",
            opacity: entering ? 0 : 1,
            transition: "transform 1.5s cubic-bezier(0.6,0.02,0.2,1), opacity 1.4s ease-in 0.2s",
          }}
        >
          {/* Ceiling */}
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, height: "11%",
            background: "linear-gradient(180deg, #e7e2da 0%, #d6cfc4 100%)",
          }}>
            <div style={{ position: "absolute", top: "30%", left: "22%", width: 90, height: 18, borderRadius: "50%", background: "radial-gradient(ellipse, rgba(255,250,235,0.9), transparent 70%)", filter: "blur(4px)" }} />
            <div style={{ position: "absolute", top: "30%", left: "58%", width: 90, height: 18, borderRadius: "50%", background: "radial-gradient(ellipse, rgba(255,250,235,0.9), transparent 70%)", filter: "blur(4px)" }} />
          </div>

          {/* Oxblood wall */}
          <div style={{
            position: "absolute", top: "11%", left: 0, right: 0, bottom: "13%",
            background: `radial-gradient(ellipse at 60% 28%, #6a322e 0%, #592826 45%, #43201e 100%)`,
            boxShadow: "inset 0 30px 60px rgba(0,0,0,0.18), inset 0 -20px 50px rgba(0,0,0,0.25)",
          }}>
            {/* soft top wash from the downlights */}
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(255,240,220,0.07) 0%, transparent 22%)", pointerEvents: "none" }} />

            {/* Wall text block */}
            <div className="sv-text" style={{
              position: "absolute", left: "9%", top: "16%", width: "48%", maxWidth: 720, color: "#f0e6d8",
            }}>
              <div style={{ fontSize: "clamp(10px,1.1vw,13px)", fontWeight: 500, letterSpacing: "0.42em", textTransform: "uppercase", color: "rgba(240,230,216,0.62)", marginBottom: "1.1em" }}>
                Salon VII &nbsp;·&nbsp; Salle I
              </div>

              <h1 style={{
                fontSize: "clamp(30px,4.4vw,62px)", fontWeight: 500, lineHeight: 1.04, margin: 0,
                letterSpacing: "0.005em",
              }}>
                The Wrong Man<br />at the Right Time
              </h1>

              <div style={{
                fontSize: "clamp(15px,1.7vw,22px)", fontWeight: 600, fontStyle: "italic", letterSpacing: "0.06em",
                color: "#f4ecdf", marginTop: "0.9em", marginBottom: "1.6em",
              }}>
                「错的时间，对的人。」
              </div>

              <div className="sv-cols" style={{
                columnCount: 2, columnGap: "2.4em",
                fontSize: "clamp(12px,1.05vw,15px)", fontWeight: 300, lineHeight: 1.62,
                color: "rgba(240,230,216,0.82)", textAlign: "justify", maxWidth: 640,
              }}>
                <p style={{ margin: "0 0 1em" }}>
                  Salon VII gathers a single season of looking — pictures made in the narrow gap
                  between arriving too early and leaving too late. Hung close, lit low, they ask to be
                  met the way a stranger is met across a crowded room: all at once, and then slowly.
                </p>
                <p style={{ margin: 0 }}>
                  这一厅收录的，是某个季节里全部的凝视。它们挂得很近，光线压得很低，
                  像在拥挤的房间里与一个陌生人对望——先是一瞬间，然后，是很久很久。
                  穿过门洞，请慢慢看。
                </p>
              </div>

              {/* credit rule */}
              <div style={{ marginTop: "2.4em", maxWidth: 640 }}>
                <div style={{ height: 1, background: "rgba(240,230,216,0.18)", marginBottom: "0.9em" }} />
                <div style={{ fontSize: "clamp(9px,0.9vw,11px)", letterSpacing: "0.12em", color: "rgba(240,230,216,0.45)", textTransform: "uppercase" }}>
                  Curated by Salon VII &nbsp;·&nbsp; Anno MMXXVI
                </div>
              </div>
            </div>

            {/* Doorway opening (click target) */}
            <div
              className="sv-door"
              onClick={handleEnter}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleEnter(); }}
              style={{
                position: "absolute", right: "7%", top: "10%", bottom: 0, width: "26%", maxWidth: 360,
                cursor: "pointer",
                background: "linear-gradient(180deg, #16090d 0%, #0c0508 60%, #1c0f0a 100%)",
                boxShadow: "inset 7px 0 22px rgba(0,0,0,0.6), inset -7px 0 18px rgba(0,0,0,0.55), inset 0 14px 28px rgba(0,0,0,0.6)",
                borderLeft: "1px solid rgba(0,0,0,0.5)", borderRight: "1px solid rgba(0,0,0,0.5)",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end",
                overflow: "hidden",
              }}
            >
              {/* hint of a framed painting deep inside */}
              <div style={{
                position: "absolute", top: "30%", left: "50%", transform: "translateX(-50%)",
                width: "44%", height: "26%",
                background: "linear-gradient(135deg, #3a2d22, #241a12)",
                border: "3px solid rgba(150,118,70,0.35)", borderRadius: 2,
                boxShadow: "0 0 18px rgba(0,0,0,0.6)", filter: "blur(0.6px)", opacity: 0.7,
              }} />

              {/* warm floor light leaking from the next room */}
              <div style={{
                position: "absolute", bottom: 0, left: 0, right: 0, height: "32%",
                background: "linear-gradient(0deg, rgba(255,196,108,0.22), transparent)",
                pointerEvents: "none",
              }} />
              <div style={{
                position: "absolute", bottom: "14%", left: "12%", right: "12%", height: 3,
                background: "linear-gradient(90deg, transparent, rgba(255,200,110,0.7), transparent)",
                boxShadow: "0 0 18px rgba(255,180,90,0.45)",
                animation: "sv-flicker 4s ease-in-out infinite",
              }} />

              {/* enter hint */}
              <div style={{
                position: "relative", zIndex: 2, marginBottom: "16%", textAlign: "center",
                color: "rgba(240,230,216,0.85)", animation: "sv-pulse 2.6s ease-in-out infinite",
              }}>
                <div style={{ fontSize: "clamp(13px,1.3vw,17px)", letterSpacing: "0.18em", fontWeight: 400 }}>进入展厅</div>
                <div style={{ fontSize: "clamp(9px,0.95vw,12px)", letterSpacing: "0.34em", textTransform: "uppercase", marginTop: 4, color: "rgba(240,230,216,0.55)" }}>Enter</div>
              </div>
            </div>
          </div>

          {/* Wood floor — real gallery texture, laid back in perspective */}
          <div style={{
            position: "absolute", left: 0, right: 0, bottom: 0, height: "15%",
            perspective: "320px", overflow: "hidden",
            boxShadow: "inset 0 14px 26px rgba(0,0,0,0.32)",
          }}>
            <div style={{
              position: "absolute", left: "-30%", right: "-30%", top: 0, bottom: "-60%",
              backgroundImage: "url(/textures/floor-wood.jpg)",
              backgroundRepeat: "repeat",
              backgroundSize: "300px auto",
              transform: "rotateX(68deg)",
              transformOrigin: "center top",
            }} />
            {/* depth + warm shading over the boards */}
            <div style={{
              position: "absolute", inset: 0, pointerEvents: "none",
              background: "linear-gradient(180deg, rgba(30,15,12,0.55) 0%, rgba(30,15,12,0.12) 30%, rgba(255,235,200,0.06) 100%)",
            }} />
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes sv-flicker {
          0%, 100% { opacity: 0.7; }
          50% { opacity: 1; }
          30% { opacity: 0.6; }
        }
        @keyframes sv-pulse {
          0%, 100% { opacity: 0.45; }
          50% { opacity: 0.95; }
        }
        @media (max-width: 820px) {
          .sv-text { position: static !important; width: auto !important; padding: 9% 8% 0 !important; }
          .sv-cols { column-count: 1 !important; }
          .sv-door {
            position: static !important; width: auto !important; max-width: none !important;
            height: 30vh !important; margin: 7% 8% 0 !important;
          }
          .sv-room { transform-origin: 50% 78% !important; }
        }
      `}</style>
    </>
  );
}
