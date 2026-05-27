"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import FilmGrain from "@/components/FilmGrain";

export default function HomePage() {
  const [entering, setEntering] = useState(false);
  const router = useRouter();

  // Proactively warm the gallery while the visitor reads the wall text: prefetch
  // the route's JS, fetch the exhibition data (stashed for the gallery to reuse),
  // and pull every painting + room texture into the browser cache. By the time
  // they step through the door, the heavy images are already decoded, so the
  // black "lights coming up" beat is just a flash rather than a real wait.
  useEffect(() => {
    let cancelled = false;
    const held: HTMLImageElement[] = [];
    const warm = (url: string) => {
      if (!url) return;
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.decoding = "async";
      img.src = url;
      held.push(img); // keep refs alive so the browser doesn't drop the fetch
    };

    warm("/textures/wallpaper.jpg");
    warm("/textures/floor-wood.jpg");
    router.prefetch?.("/gallery");

    fetch("/api/exhibition")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data?.artworks) return;
        try {
          sessionStorage.setItem("sv-exhibition", JSON.stringify(data));
        } catch {}
        for (const a of data.artworks) if (a?.imageUrl) warm(a.imageUrl);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [router]);

  // The doorway sits right-of-centre, but its interior must read as the SAME
  // room as the wood floor — one ground plane — so the passage recedes toward
  // the scene's single vanishing point (screen centre, on the horizon), which
  // lies to the LEFT of the door. We express that VP in door-local % coords and
  // build the recess (soffit / jambs / floor / back wall) by projecting the four
  // door corners toward it by a depth fraction `t`. All edges then converge on
  // one point, exactly like the floorboards outside.
  // Measured: the wood floor's vanishing point sits at screen (50vw, 53vh). The
  // door's bottom is aligned to the wood floor's far edge (~80vh), so the
  // threshold — and the door's bottom corners — sit exactly on the floor join.
  // In this right-hand door's local % coords the VP is ~(-71%, 57%).
  const DVPx = -71;   // vanishing point X in door-local % (negative = left of the door)
  const DVPy = 57;    // vanishing point Y (the horizon) in door-local %
  const Dt = 0.52;    // passage depth (0 = at the wall, 1 = at the VP)
  const fL = +(DVPx * Dt).toFixed(1);
  const fR = +(100 + (DVPx - 100) * Dt).toFixed(1);
  const fT = +(DVPy * Dt).toFixed(1);
  const fB = +(100 + (DVPy - 100) * Dt).toFixed(1);

  const handleEnter = useCallback(() => {
    if (entering) return;
    setEntering(true);
    setTimeout(() => {
      router.push("/gallery");
    }, 1700);
  }, [entering, router]);

  return (
    <>
      {/* Exhibition intro wall */}
      <div
        style={{
          position: "fixed", inset: 0, zIndex: 100, overflow: "hidden",
          background: "#0e0608", perspective: "1400px",
        }}
      >
        {/* The wall — scales into the doorway on enter (push-through). The black
            door sits on the right, so the enter transform both grows it AND
            slides its centre to mid-screen, leading the eye straight into the
            dark. Transform lives in CSS so the mobile layout can override it. */}
        <div className={`sv-room${entering ? " sv-entering" : ""}`} style={{ position: "absolute", inset: 0 }}>
          {/* The maroon wall is ONE continuous plane that runs far past both
              edges, so it reads as a single infinite surface (no seam / fold).
              Its radial light is anchored to ~60vw of screen and settles into a
              flat tone, which simply continues outward. The text + doorway below
              sit on top of this plane. */}
          <div style={{
            position: "absolute", top: "11%", bottom: "13%", left: "-100%", right: "-100%",
            background: "radial-gradient(ellipse 62vw 56vh at 160vw 28%, #6a322e 0%, #592826 45%, #43201e 100%)",
            boxShadow: "inset 0 30px 60px rgba(0,0,0,0.18), inset 0 -20px 50px rgba(0,0,0,0.25)",
            zIndex: 0,
          }} />
          {/* Ceiling */}
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, height: "11%",
            background: "linear-gradient(180deg, #e7e2da 0%, #d6cfc4 100%)",
          }}>
            <div style={{ position: "absolute", top: "30%", left: "22%", width: 90, height: 18, borderRadius: "50%", background: "radial-gradient(ellipse, rgba(255,250,235,0.9), transparent 70%)", filter: "blur(4px)" }} />
            <div style={{ position: "absolute", top: "30%", left: "58%", width: 90, height: 18, borderRadius: "50%", background: "radial-gradient(ellipse, rgba(255,250,235,0.9), transparent 70%)", filter: "blur(4px)" }} />
          </div>

          {/* Oxblood wall frame — transparent now; the continuous plane above
              paints the red. This just positions the text + doorway. */}
          <div style={{
            position: "absolute", top: "11%", left: 0, right: 0, bottom: "13%",
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

            {/* Doorway — a recessed passage, not a flat panel. Perspective jambs,
                soffit and floor recede to a warm-lit far end (the gallery beyond),
                so the space reads as extending inward — you step THROUGH it rather
                than zoom into a wall. The vanishing point sits a little right of
                centre, so the passage opens off to the right. */}
            <div
              className="sv-door"
              onClick={handleEnter}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleEnter(); }}
              style={{
                position: "absolute", right: "9%", top: "9%", bottom: "9.2%", width: "24%", maxWidth: 340,
                cursor: "pointer", overflow: "hidden",
                background: "#0a0506",
                boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.55), inset 0 22px 44px rgba(0,0,0,0.5)",
              }}
            >
              {/* The passage is almost entirely in darkness — depth is read only
                  from faint shifts in tone and a dim ember of light far off. All
                  four surfaces project to the shared scene vanishing point (fL/fT
                  /fR/fB), so the interior floor lies on the same ground plane as
                  the wood floor outside.
                  soffit — ceiling of the passage, deepest shadow */}
              <div style={{ position: "absolute", inset: 0, clipPath: `polygon(0 0, 100% 0, ${fR}% ${fT}%, ${fL}% ${fT}%)`, background: "linear-gradient(180deg, #070405, #040203)" }} />
              {/* floor — the room's wood plane CONTINUED through the doorway.
                  Same perspective as the room floor (matched perspective-origin
                  + rotateX 56°) so the boards recede on the one ground plane,
                  toward the shared vanishing point; darkened toward the back.
                  Clipped to the floor trapezoid. */}
              <div style={{
                position: "absolute", inset: 0,
                clipPath: `polygon(0 100%, 100% 100%, ${fR}% ${fB}%, ${fL}% ${fB}%)`,
                overflow: "hidden",
                perspective: "440px",
                perspectiveOrigin: "-71% 116%",
              }}>
                <div style={{
                  position: "absolute", left: "-120%", right: "-120%", bottom: 0, height: "340%",
                  backgroundImage: "linear-gradient(0deg, rgba(16,10,7,0.40) 0%, rgba(10,6,4,0.74) 13%, rgba(6,4,3,0.93) 30%, rgba(3,2,1,0.99) 52%), url(/textures/floor-wood.jpg)",
                  backgroundSize: "auto, 330px auto",
                  backgroundRepeat: "repeat, repeat",
                  transform: "rotateX(56deg)",
                  transformOrigin: "center bottom",
                }} />
              </div>
              {/* left jamb — narrow (the VP is off to the left), sinking to black */}
              <div style={{ position: "absolute", inset: 0, clipPath: `polygon(0 0, ${fL}% ${fT}%, ${fL}% ${fB}%, 0 100%)`, background: "linear-gradient(90deg, #160d0a 0%, #070403 82%)" }} />
              {/* right jamb — the broad near wall, lit faintly at the opening */}
              <div style={{ position: "absolute", inset: 0, clipPath: `polygon(100% 0, ${fR}% ${fT}%, ${fR}% ${fB}%, 100% 100%)`, background: "linear-gradient(270deg, #1a110c 0%, #0a0605 82%)" }} />
              {/* far wall — a dim ember of gallery light, mostly swallowed by dark */}
              <div style={{
                position: "absolute", left: `${fL}%`, right: `${100 - fR}%`, top: `${fT}%`, bottom: `${100 - fB}%`,
                background: "radial-gradient(ellipse at 50% 74%, rgba(232,176,104,0.20), rgba(96,58,30,0.08) 52%, #0a0604 100%)",
                animation: "sv-flicker 5s ease-in-out infinite",
              }} />

              {/* enter hint — near the far opening, drawing the eye down the passage */}
              <div style={{
                position: "absolute", left: 0, right: 0, bottom: "12%", zIndex: 2, textAlign: "center",
                color: "rgba(228,212,190,0.7)", animation: "sv-pulse 3s ease-in-out infinite",
              }}>
                <div style={{ fontSize: "clamp(12px,1.2vw,16px)", letterSpacing: "0.18em", fontWeight: 400 }}>进入展厅</div>
                <div style={{ fontSize: "clamp(8px,0.9vw,11px)", letterSpacing: "0.34em", textTransform: "uppercase", marginTop: 4, color: "rgba(228,212,190,0.45)" }}>Enter</div>
              </div>
            </div>
          </div>

          {/* Wood floor — real gallery texture, laid back in perspective. Stands
              a little more upright (less flattened) and reaches up to the wall
              base so it meets the doorway threshold on the same plane. */}
          <div style={{
            position: "absolute", left: 0, right: 0, bottom: 0, height: "20%",
            perspective: "440px", overflow: "hidden",
            boxShadow: "inset 0 8px 18px rgba(0,0,0,0.22)",
          }}>
            <div style={{
              position: "absolute", left: "-30%", right: "-30%", top: 0, bottom: "-60%",
              backgroundImage: "url(/textures/floor-wood.jpg)",
              backgroundRepeat: "repeat",
              backgroundSize: "330px auto",
              transform: "rotateX(56deg)",
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

      {/* Film grain fades in the instant we push through the door, so the dark
          already carries texture — and bridges straight into the gallery's grain
          instead of a dead pure-black gap. */}
      <FilmGrain opacity={entering ? 1 : 0} />

      <style jsx global>{`
        /* On enter: slide the right-hand doorway's centre (~80vw) to mid-screen
           and step in with a MODEST scale, so the dark door sits centred with
           symmetric maroon wall on both sides (the backdrop extends the red past
           the edges). Then the whole frame fades to black. */
        .sv-room {
          transform-origin: 80% 54%;
          transform: scale(1);
          opacity: 1;
          transition: transform 1.7s cubic-bezier(0.5,0.02,0.25,1), opacity 1.0s ease-in 0.7s;
        }
        .sv-room.sv-entering {
          transform: translate(-30vw, -4vh) scale(2);
          opacity: 0;
        }
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
          /* Door reflows to a centred block on mobile — push straight in, no sideways slide. */
          .sv-room { transform-origin: 50% 78%; }
          .sv-room.sv-entering { transform: translate(0, -6vh) scale(2); }
        }
      `}</style>
    </>
  );
}
