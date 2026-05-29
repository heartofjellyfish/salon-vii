"use client";

import { useEffect, useState, useCallback } from "react";
import type { PerfSnapshot } from "./perf-state";

// On-screen readout for the gallery performance probe. DOM-only (no three /
// r3f imports) so it can sit in the page without pulling the 3D bundle into the
// initial chunk. Reads the live snapshot the in-canvas <PerfProbe/> publishes to
// window.__galleryPerf. Hidden unless opened with ?perf, ?diag, or toggled with `.
//
// ?diag adds a one-click isolation pass: it toggles each heavy feature on the
// LIVE loop and records the resulting fps into an on-screen table — so a real
// machine (where the rAF loop runs at true speed) can find the bottleneck without
// the console. (The headless preview throttles the loop, so its numbers are junk;
// run ?diag on the real deployed site.)

type R3F = {
  gl: { shadowMap: { enabled: boolean }; getPixelRatio: () => number; setPixelRatio: (r: number) => void; setSize: (w: number, h: number, u: boolean) => void };
  scene: { traverse: (cb: (o: SceneObj) => void) => void };
};
type SceneObj = { isSpotLight?: boolean; castShadow?: boolean; visible: boolean; userData?: { perfGroup?: string } };
type Composer = { passes: { enabled: boolean }[]; setSize?: (w: number, h: number) => void };
type Win = Window & {
  __galleryPerf?: PerfSnapshot;
  __r3f?: R3F;
  __composer?: Composer;
};

interface DiagRow { label: string; fps: number; low: number; }

function fpsColor(fps: number) {
  if (fps >= 55) return "#7CFC9A";
  if (fps >= 30) return "#F5C451";
  return "#FF6B6B";
}

function Row({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
      <span style={{ opacity: 0.6 }}>{label}</span>
      <span style={{ color: accent || "#e8e8e8", fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

export default function PerfOverlay() {
  const [on, setOn] = useState(false);
  const [diag, setDiag] = useState(false);
  const [, force] = useState(0);
  const [rows, setRows] = useState<DiagRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.has("perf")) setOn(true);
    if (q.has("diag")) { setOn(true); setDiag(true); }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "`") { e.preventDefault(); setOn((v) => !v); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => force((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [on]);

  const runDiag = useCallback(async () => {
    const w = window as unknown as Win;
    const r3f = w.__r3f;
    if (!r3f) { setStatus("harness not ready — wait for the room to appear, then retry"); return; }
    const { gl, scene } = r3f;
    const composer = w.__composer;
    setBusy(true);
    const acc: DiagRow[] = [];
    setRows([]);
    const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));
    const find = (pred: (o: SceneObj) => boolean) => { const a: SceneObj[] = []; scene.traverse((o) => { if (pred(o)) a.push(o); }); return a; };
    const hide = (a: SceneObj[]) => a.forEach((o) => (o.visible = false));
    const show = (a: SceneObj[]) => a.forEach((o) => (o.visible = true));
    const measure = async (label: string) => {
      setStatus("measuring: " + label + " …  (keep still)");
      await wait(1400);
      let s = 0, n = 0, low = 999;
      for (let i = 0; i < 6; i++) {
        const p = w.__galleryPerf;
        if (p && p.fps) { s += p.fps; n++; low = Math.min(low, p.fpsMin || p.fps); }
        await wait(180);
      }
      acc.push({ label, fps: n ? +(s / n).toFixed(1) : 0, low: low === 999 ? 0 : Math.round(low) });
      setRows([...acc]);
    };

    const aoPass = composer?.passes?.[1];
    const dprWas = gl.getPixelRatio();
    const W = window.innerWidth, H = window.innerHeight;
    const setDpr = (r: number) => { gl.setPixelRatio(r); gl.setSize(W, H, false); composer?.setSize?.(Math.round(W * r), Math.round(H * r)); };

    await measure("baseline (all on)");

    const pls = find((o) => o.userData?.perfGroup === "paintingLight"); // the 9 painting spotlights
    hide(pls); await measure("− painting lights"); show(pls);

    if (aoPass) { aoPass.enabled = false; await measure("− N8AO (post-fx)"); aoPass.enabled = true; }

    const shadowWas = gl.shadowMap.enabled;
    gl.shadowMap.enabled = false; await measure("− shadows"); gl.shadowMap.enabled = shadowWas;

    const plants = find((o) => o.userData?.perfGroup === "plants");
    hide(plants); await measure("− plants (the 2 trees)"); show(plants);

    const props = find((o) => o.userData?.perfGroup === "props");
    hide(props); await measure("− props (sofa/rug/lamp)"); show(props);

    setDpr(1); await measure("dpr → 1 (¼ the pixels)"); setDpr(dprWas);

    // everything off at once — the floor
    hide(pls); if (aoPass) aoPass.enabled = false; gl.shadowMap.enabled = false; hide(plants); hide(props); setDpr(1);
    await measure("MINIMAL (all off)");
    show(pls); if (aoPass) aoPass.enabled = true; gl.shadowMap.enabled = shadowWas; show(plants); show(props); setDpr(dprWas);

    setStatus("done — screenshot the table ↓");
    setBusy(false);
  }, []);

  if (!on) return null;
  const s = (window as unknown as Win).__galleryPerf;
  const base = rows[0]?.fps ?? 0;

  return (
    <div
      style={{
        position: "fixed", top: 12, left: 12, zIndex: 9999,
        background: "rgba(8,6,12,0.86)", color: "#e8e8e8",
        font: "11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace",
        padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(201,168,76,0.25)",
        minWidth: 178, maxWidth: 320, backdropFilter: "blur(6px)", userSelect: "none",
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 600, lineHeight: 1, color: fpsColor(s?.fps ?? 0), fontVariantNumeric: "tabular-nums" }}>
        {(s?.fps ?? 0).toFixed(0)} <span style={{ fontSize: 11, opacity: 0.6, fontWeight: 400 }}>fps</span>
      </div>
      <div style={{ marginTop: 8, display: "grid", gap: 2 }}>
        <Row label="frame" value={`${(s?.ms ?? 0).toFixed(1)} ms`} />
        <Row label="low" value={`${(s?.fpsMin ?? 0).toFixed(0)} fps`} accent={fpsColor(s?.fpsMin ?? 0)} />
        <Row label="draw calls" value={`${s?.calls ?? 0}`} />
        <Row label="triangles" value={`${((s?.tris ?? 0) / 1000).toFixed(0)}k`} />
        <Row label="geometries" value={`${s?.geometries ?? 0}`} />
        <Row label="textures" value={`${s?.textures ?? 0}`} />
        <Row label="shaders" value={`${s?.programs ?? 0}`} />
        {!!s?.heapMB && <Row label="JS heap" value={`${s.heapMB} MB`} />}
        <Row label="phase" value={s?.phase ?? "—"} />
      </div>

      {diag && (
        <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.12)" }}>
          <button
            onClick={runDiag}
            disabled={busy}
            style={{
              width: "100%", padding: "6px 8px", borderRadius: 6, cursor: busy ? "default" : "pointer",
              background: busy ? "rgba(201,168,76,0.15)" : "rgba(201,168,76,0.35)",
              color: "#fff", border: "1px solid rgba(201,168,76,0.4)", font: "inherit", fontWeight: 600,
            }}
          >
            {busy ? "running…" : "▶ Run isolation pass"}
          </button>
          {!!status && <div style={{ marginTop: 6, opacity: 0.7, fontSize: 10 }}>{status}</div>}
          {rows.length > 0 && (
            <div style={{ marginTop: 8, display: "grid", gap: 2 }}>
              {rows.map((r, i) => {
                const delta = i === 0 ? 0 : +(r.fps - base).toFixed(1);
                return (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <span style={{ opacity: 0.8 }}>{r.label}</span>
                    <span style={{ fontVariantNumeric: "tabular-nums", color: fpsColor(r.fps), whiteSpace: "nowrap" }}>
                      {r.fps}fps{i > 0 ? `  ${delta >= 0 ? "+" : ""}${delta}` : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {!diag && <div style={{ marginTop: 8, opacity: 0.4, fontSize: 10 }}>` to hide · __perfSample(ms)</div>}
    </div>
  );
}
