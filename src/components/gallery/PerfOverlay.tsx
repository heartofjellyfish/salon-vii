"use client";

import { useEffect, useState } from "react";
import type { PerfSnapshot } from "./perf-state";

// On-screen readout for the gallery performance probe. DOM-only (no three /
// r3f imports) so it can sit in the page without pulling the 3D bundle into the
// initial chunk. Reads the live snapshot the in-canvas <PerfProbe/> publishes to
// window.__galleryPerf. Hidden unless opened with ?perf or toggled with `.

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
  const [, force] = useState(0);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("perf")) setOn(true);
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

  if (!on) return null;
  const s = (window as unknown as { __galleryPerf?: PerfSnapshot }).__galleryPerf;

  return (
    <div
      style={{
        position: "fixed", top: 12, left: 12, zIndex: 9999,
        background: "rgba(8,6,12,0.82)", color: "#e8e8e8",
        font: "11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace",
        padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(201,168,76,0.25)",
        minWidth: 168, backdropFilter: "blur(6px)", pointerEvents: "none", userSelect: "none",
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
      <div style={{ marginTop: 8, opacity: 0.4, fontSize: 10 }}>` to hide · __perfSample(ms)</div>
    </div>
  );
}
