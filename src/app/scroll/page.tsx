"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { SCROLL_TUNE_DEFAULTS, type ScrollTune } from "@/components/fuchun/scrollTune";
import { SCROLL_BASE } from "@/components/fuchun/dims";

const ScrollTuner = dynamic(
  () => import("@/components/fuchun/ScrollTuner").then((m) => m.ScrollTuner),
  { ssr: false },
);

type Dbg = {
  level: number;
  maxLevel: number;
  zoom: number;
  maxZoom: number;
  capPR: number;
  tier: string;
  mbps: number;
  glide: number;
  prefetched: number;
  queued: number;
  active: number;
  resident: number;
  fullyLoaded: boolean;
  fps: number;
  cx: number;
  cy: number;
};

/**
 * Full-screen deep-zoom viewer for the 富春山居图 handscroll (OpenSeadragon + DZI).
 * Drag/flick to pan, arrow keys to glide, scroll/pinch to zoom. Preload + glide speed
 * + max-sharpness are network-adaptive (see src/components/fuchun/README.md).
 * Optional debug panel: `?debug` in the URL, or press the backtick (`) key.
 */
export default function ScrollViewerPage() {
  const ref = useRef<HTMLDivElement>(null);
  const [net, setNet] = useState<{ tier: string; mbps: number } | null>(null);
  const [debug, setDebug] = useState(false);
  const [dbg, setDbg] = useState<Dbg | null>(null);
  const dbgOnRef = useRef(false);
  const [tune, setTune] = useState(false);
  const tuneRef = useRef<ScrollTune>(SCROLL_TUNE_DEFAULTS);
  const viewerRef = useRef<any>(null);
  const osdRef = useRef<any>(null);

  useEffect(() => {
    dbgOnRef.current = debug;
  }, [debug]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search);
    if (q.has("debug")) setDebug(true);
    if (q.has("tune")) setTune(true);
  }, []);

  const fitToSide = useCallback((side: "left" | "right") => {
    const v = viewerRef.current;
    const OSD = osdRef.current;
    if (!v || !OSD) return;
    const it = v.world.getItemAt(0);
    if (!it) return;
    const s = it.getContentSize();
    const hNorm = s.y / s.x;
    const x = side === "left" ? 0 : 1 - hNorm;
    v.viewport.fitBounds(new OSD.Rect(x, 0, hNorm, hNorm), false);
  }, []);

  const handleTune = useCallback(
    (raw: Partial<ScrollTune>) => {
      // Sanitize every value to a finite number (falling back to the default) so a
      // missing/NaN control can never reach the viewer math and blow the viewport to
      // NaN (which black-screens it).
      const D = SCROLL_TUNE_DEFAULTS;
      const num = (x: unknown, d: number) => (typeof x === "number" && isFinite(x) ? x : d);
      const val: ScrollTune = {
        glideMul: num(raw.glideMul, D.glideMul),
        startSide: raw.startSide === "left" ? "left" : "right",
        flick: num(raw.flick, D.flick),
        budgetMB: num(raw.budgetMB, D.budgetMB),
        conc: num(raw.conc, D.conc),
        maxZoomPR: num(raw.maxZoomPR, D.maxZoomPR),
        cacheCount: num(raw.cacheCount, D.cacheCount),
      };
      const prev = tuneRef.current;
      tuneRef.current = val;
      if (val.startSide !== prev.startSide) fitToSide(val.startSide);
      const v = viewerRef.current;
      if (v?.viewport) v.viewport.maxZoomPixelRatio = val.maxZoomPR;
      if (v) v.maxImageCacheCount = val.cacheCount;
      if (v?.gestureSettingsMouse) v.gestureSettingsMouse.flickMomentum = val.flick;
      if (v?.gestureSettingsTouch) v.gestureSettingsTouch.flickMomentum = val.flick;
    },
    [fitToSide],
  );

  useEffect(() => {
    const TILE_PATH = "fuchun_files/"; // substring — matches both local and R2 tile URLs
    let viewer: any;
    let raf = 0;
    let ctl = 0;
    let po: PerformanceObserver | undefined;
    let cancelled = false;
    let glideSpeed = 1.0;
    let resumePump: (() => void) | null = null;
    const held = new Set<string>();

    // live metrics, mutated in place by the loops below; snapshotted into React state
    const m = {
      tier: "—",
      mbps: 0,
      glide: 1,
      capPR: 2,
      prefetched: 0,
      queued: 0,
      active: 0,
      maxLevel: 0,
      minLevel: 0,
      imgW: 1,
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "`" || e.code === "Backquote") {
        setDebug((v) => !v);
        return;
      }
      const k = e.key;
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "a", "d", "w", "s"].includes(k)) {
        held.add(k);
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      held.delete(e.key);
      if (held.size === 0) resumePump?.(); // resume prefetch once gliding stops
    };

    (async () => {
      const OpenSeadragon = (await import("openseadragon")).default;
      if (cancelled || !ref.current) return;

      viewer = OpenSeadragon({
        element: ref.current,
        tileSources: `${SCROLL_BASE}/fuchun.dzi`,
        prefixUrl: "",
        showNavigationControl: false,
        showNavigator: false,
        maxZoomPixelRatio: 1,
        minZoomImageRatio: 0.8,
        imageLoaderLimit: 16,
        maxImageCacheCount: 400,
        minPixelRatio: 0.4,
        visibilityRatio: 1,
        constrainDuringPan: true,
        animationTime: 0.6,
        springStiffness: 7,
        gestureSettingsMouse: {
          clickToZoom: false,
          dblClickToZoom: true,
          flickEnabled: true,
          flickMinSpeed: 120,
          flickMomentum: 0.3,
        },
        gestureSettingsTouch: { flickEnabled: true, flickMomentum: 0.3 },
        background: "#0d0b08",
      } as any);

      if (typeof window !== "undefined") (window as any).__osd = viewer;
      viewerRef.current = viewer;
      osdRef.current = OpenSeadragon;

      viewer.addHandler("open", () => {
        const item = viewer.world.getItemAt(0);
        if (!item) return;
        const size = item.getContentSize();
        const hNorm = size.y / size.x;
        const startX = tuneRef.current.startSide === "left" ? 0 : 1 - hNorm;
        viewer.viewport.fitBounds(new OpenSeadragon.Rect(startX, 0, hNorm, hNorm), true);

        const src = item.source;
        m.maxLevel = src.maxLevel;
        m.minLevel = src.minLevel;
        m.imgW = size.x;
        const clamp = (L: number) => Math.max(src.minLevel, Math.min(src.maxLevel, L));
        const queue: string[] = [];
        const addedLevels = new Set<number>();
        const enqueueLevel = (L: number, limit = Infinity) => {
          if (L < src.minLevel || L > src.maxLevel || addedLevels.has(L)) return 0;
          addedLevels.add(L);
          const n = src.getNumTiles(L);
          let added = 0;
          for (let x = n.x - 1; x >= 0 && added < limit; x--) {
            for (let y = 0; y < n.y && added < limit; y++) {
              queue.push(src.getTileUrl(L, x, y));
              added++;
            }
          }
          m.queued += added;
          return added;
        };

        // Reading level = what the opening (full-height) fit shows. Derived directly
        // from container size + image height, so it's correct synchronously and does
        // NOT depend on the viewport having applied fitBounds yet (rAF can be throttled,
        // which would read stale bounds and target a far-too-coarse level).
        // Viewport short side, with fallbacks: some embedded/headless contexts report
        // window/container size as 0–1, which would otherwise collapse the level to ~0.
        const fitPx = Math.max(320, Math.min(window.innerWidth || 1280, window.innerHeight || 800));
        const openLevel = clamp(Math.round(src.maxLevel + Math.log2(fitPx / size.y)));

        // Budget-based preload: warm levels up front (opening → deeper, then shallower)
        // within ~budgetMB; the heaviest top level (L18 = native 1:1, ~100 MB) is left
        // to stream on demand per-spot, so full resolution is preserved without
        // pre-warming all of it.
        const TILE_BYTES = 11000;
        let budgetTiles = Math.floor(((tuneRef.current.budgetMB || 50) * 1e6) / TILE_BYTES);
        const order: number[] = [];
        for (let L = openLevel; L <= src.maxLevel - 1; L++) order.push(L);
        for (let L = openLevel - 1; L >= src.minLevel; L--) order.push(L);
        for (const L of order) {
          if (budgetTiles <= 0) break;
          budgetTiles -= enqueueLevel(L, budgetTiles);
        }

        let conc = 4;
        // Yield ALL connections to OSD's visible-tile loads while the user is gliding,
        // so panning never starves on the background prefetch (which would blank the
        // newly-revealed tiles). Resumes on key-up / on the next adapt tick.
        const pump = () => {
          const limit = held.size > 0 ? 0 : conc;
          while (m.active < limit && queue.length) {
            m.active++;
            const im = new Image();
            im.src = queue.shift() as string;
            const done = () => {
              m.active--;
              m.prefetched++;
              pump();
            };
            im.decode().then(done, done);
          }
        };
        resumePump = pump;

        const samples: { t: number; bytes: number }[] = [];
        po = new PerformanceObserver((list) => {
          const now = performance.now();
          for (const e of list.getEntries() as PerformanceResourceTiming[]) {
            if (e.name.includes(TILE_PATH) && e.transferSize > 0) {
              samples.push({ t: now, bytes: e.transferSize });
            }
          }
        });
        try {
          po.observe({ type: "resource", buffered: true } as any);
        } catch {
          /* no resource timing → fall back to connection hints / defaults */
        }

        const conn = (navigator as any).connection;
        const adapt = () => {
          const now = performance.now();
          while (samples.length && now - samples[0].t > 3000) samples.shift();
          const bytes = samples.reduce((s, x) => s + x.bytes, 0);
          let mbps = bytes / 3 / 1e6;
          if (!samples.length && conn?.downlink) mbps = conn.downlink / 8;

          // No network tiers anymore — fixed glide + budget preload + 1:1 cap. The
          // measured throughput is kept only as an informational readout.
          const t = tuneRef.current;
          const tier = mbps <= 0 ? "—" : mbps >= 4 ? "fast" : mbps >= 1 ? "medium" : "slow";
          glideSpeed = 1.0;
          conc = t.conc;
          if (viewer?.viewport) viewer.viewport.maxZoomPixelRatio = t.maxZoomPR;
          viewer.maxImageCacheCount = t.cacheCount;
          if (viewer.gestureSettingsMouse) viewer.gestureSettingsMouse.flickMomentum = t.flick;
          if (viewer.gestureSettingsTouch) viewer.gestureSettingsTouch.flickMomentum = t.flick;
          m.tier = tier;
          m.mbps = mbps;
          m.glide = glideSpeed * t.glideMul;
          m.capPR = t.maxZoomPR;
          setNet({ tier, mbps });
          pump();
        };

        window.setTimeout(() => {
          adapt();
          pump();
        }, 300);
        ctl = window.setInterval(adapt, 1500);
      });

      let last = 0;
      let lastPush = 0;
      let fps = 60;
      const clampL = (L: number) => Math.max(m.minLevel, Math.min(m.maxLevel, L));
      const tick = (t: number) => {
        if (!last) last = t;
        const dt = Math.min((t - last) / 1000, 0.1);
        last = t;
        if (dt > 0) fps = fps * 0.9 + (1 / dt) * 0.1;

        let dx = 0;
        let dy = 0;
        if (held.has("ArrowLeft") || held.has("a")) dx -= 1;
        if (held.has("ArrowRight") || held.has("d")) dx += 1;
        if (held.has("ArrowUp") || held.has("w")) dy -= 1;
        if (held.has("ArrowDown") || held.has("s")) dy += 1;
        if ((dx || dy) && viewer?.viewport) {
          const gs = glideSpeed * tuneRef.current.glideMul;
          const b = viewer.viewport.getBounds();
          if (isFinite(gs) && isFinite(b.width) && isFinite(b.height)) {
            viewer.viewport.panBy(
              new OpenSeadragon.Point(dx * gs * b.width * dt, dy * gs * b.height * dt),
              true,
            );
            viewer.viewport.applyConstraints(true);
          }
        }

        // sample metrics into React state (throttled) only while the panel is open
        if (dbgOnRef.current && viewer?.viewport && t - lastPush > 150) {
          lastPush = t;
          const vp = viewer.viewport;
          const bounds = vp.getBounds(true);
          const cw = ref.current?.clientWidth || 0;
          const screenW = cw > 64 ? cw : window.innerWidth || 1280;
          const level = clampL(Math.round(m.maxLevel + Math.log2(screenW / (bounds.width * m.imgW))));
          const item = viewer.world.getItemAt(0);
          let cx = 0;
          let cy = 0;
          let fullyLoaded = false;
          if (item) {
            const p = item.viewportToImageCoordinates(vp.getCenter(true));
            cx = Math.round(p.x);
            cy = Math.round(p.y);
            fullyLoaded = item.getFullyLoaded();
          }
          let resident = -1;
          try {
            if (typeof viewer.tileCache?.numTilesLoaded === "function") {
              resident = viewer.tileCache.numTilesLoaded();
            }
          } catch {
            /* internal API absent */
          }
          setDbg({
            level,
            maxLevel: m.maxLevel,
            zoom: vp.getZoom(true),
            maxZoom: vp.getMaxZoom(),
            capPR: m.capPR,
            tier: m.tier,
            mbps: m.mbps,
            glide: m.glide,
            prefetched: m.prefetched,
            queued: m.queued,
            active: m.active,
            resident,
            fullyLoaded,
            fps,
            cx,
            cy,
          });
        }

        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("keyup", onKeyUp);
    })();

    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      if (ctl) window.clearInterval(ctl);
      if (po) po.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      if (viewer) viewer.destroy();
    };
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#0d0b08", overflow: "hidden" }}>
      <div ref={ref} style={{ position: "absolute", inset: 0 }} />

      <div
        style={{
          position: "absolute",
          top: 18,
          left: 22,
          color: "#e8dcc6",
          pointerEvents: "none",
          textShadow: "0 1px 6px rgba(0,0,0,0.6)",
        }}
      >
        <div style={{ fontSize: 19, letterSpacing: 2 }}>黄公望《富春山居图》</div>
        <div style={{ fontSize: 12, opacity: 0.65, letterSpacing: 1, marginTop: 2 }}>
          Huang Gongwang · Dwelling in the Fuchun Mountains
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 16,
          left: 22,
          color: "#cabfa6",
          fontSize: 12,
          opacity: 0.6,
          letterSpacing: 0.5,
          pointerEvents: "none",
        }}
      >
        拖动 / 甩动平移 · 方向键 ← → 快速横移 · 滚轮 / 双指缩放 · ` 调试面板　Drag / flick · ← → glide · scroll / pinch · ` debug
      </div>

      {net && (
        <div
          style={{
            position: "absolute",
            bottom: 16,
            right: 22,
            display: "flex",
            alignItems: "center",
            gap: 6,
            color: "#b8ab90",
            fontSize: 11,
            opacity: 0.55,
            fontFamily: "monospace",
            letterSpacing: 0.5,
            pointerEvents: "none",
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background:
                net.tier === "fast" ? "#7fd18a" : net.tier === "medium" ? "#e0b24a" : "#d2785a",
            }}
          />
          {net.tier} · {net.mbps.toFixed(1)} MB/s
        </div>
      )}

      {debug && dbg && (
        <div
          style={{
            position: "absolute",
            top: 70,
            left: 22,
            minWidth: 188,
            padding: "10px 12px",
            background: "rgba(12,10,7,0.78)",
            border: "1px solid rgba(232,220,198,0.18)",
            borderRadius: 8,
            color: "#d8ccae",
            fontFamily: "monospace",
            fontSize: 11.5,
            lineHeight: 1.55,
            letterSpacing: 0.3,
            backdropFilter: "blur(4px)",
            pointerEvents: "none",
          }}
        >
          <div style={{ opacity: 0.5, marginBottom: 4 }}>debug · ` to toggle</div>
          <Row k="level" v={`L${dbg.level ?? "—"} / L${dbg.maxLevel ?? "—"}`} />
          <Row k="zoom" v={`${dbg.zoom?.toFixed(2) ?? "—"}  (max ${dbg.maxZoom?.toFixed(2) ?? "—"})`} />
          <Row k="cap PR" v={dbg.capPR?.toFixed(2) ?? "—"} />
          <Row k="net" v={`${dbg.tier ?? "—"}  ${dbg.mbps?.toFixed(1) ?? "—"} MB/s`} />
          <Row k="glide" v={`${dbg.glide?.toFixed(2) ?? "—"} w/s`} />
          <Row k="prefetch" v={`${dbg.prefetched ?? 0}/${dbg.queued ?? 0}  (act ${dbg.active ?? 0})`} />
          <Row k="resident" v={(dbg.resident ?? -1) < 0 ? "n/a" : `${dbg.resident} tiles`} />
          <Row k="loaded" v={dbg.fullyLoaded ? "yes" : "…loading"} />
          <Row k="fps" v={dbg.fps?.toFixed(0) ?? "—"} />
          <Row k="center" v={`${dbg.cx ?? "—"}, ${dbg.cy ?? "—"}px`} />
        </div>
      )}

      {tune && <ScrollTuner onChange={handleTune} />}

      <Link
        href="/fuchun"
        style={{
          position: "absolute",
          top: 18,
          right: 22,
          color: "#e8dcc6",
          fontSize: 13,
          textDecoration: "none",
          border: "1px solid rgba(232,220,198,0.28)",
          padding: "6px 12px",
          borderRadius: 6,
          backdropFilter: "blur(4px)",
        }}
      >
        ← 返回展厅 / Back
      </Link>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 14 }}>
      <span style={{ opacity: 0.55 }}>{k}</span>
      <span>{v}</span>
    </div>
  );
}
