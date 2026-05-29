// Shared state for the gallery performance probe. Deliberately framework-free
// (no React, no three) so the DOM overlay and the page can read it without
// pulling the 3D bundle into the initial page chunk.

export interface PerfSnapshot {
  fps: number;      // average over the last publish window (~250ms)
  fpsMin: number;   // worst single frame in that window (1 / maxDelta)
  ms: number;       // average frame time, ms
  calls: number;    // draw calls last frame
  tris: number;     // triangles last frame
  geometries: number;
  textures: number;
  programs: number; // compiled shader programs
  heapMB: number;   // JS heap in MB (Chrome only; 0 elsewhere)
  phase: string;    // roam / entry / cropped — fed by the page
  dpr: number;      // current renderer pixel ratio (quality policy)
  ts: number;
}

// The single live reading the in-canvas probe keeps current and the overlay reads.
export const snapshot: PerfSnapshot = {
  fps: 0, fpsMin: 0, ms: 0, calls: 0, tris: 0,
  geometries: 0, textures: 0, programs: 0, heapMB: 0, phase: "roam", dpr: 0, ts: 0,
};

// The page knows the control phase (roam / entry / cropped); it pushes it here so
// a sample is tagged with the context it was taken in.
let phaseLabel = "roam";
export function setPerfPhase(p: string) { phaseLabel = p; }
export function getPhase() { return phaseLabel; }

// An in-flight window.__perfSample request, if any.
interface Sampler {
  endAt: number;
  deltas: number[];
  resolve: (s: unknown) => void;
}
let sampler: Sampler | null = null;

function summarize(s: Sampler) {
  const d = s.deltas.slice().sort((a, b) => a - b); // ascending frame time (s)
  const n = d.length || 1;
  const sum = d.reduce((a, b) => a + b, 0);
  const avgDt = sum / n;
  const maxDt = d[d.length - 1] ?? 0;
  // 99th-percentile frame time = the worst 1% of frames → the fps you actually
  // feel as jank, not the smoothed average.
  const p99Dt = d[Math.min(d.length - 1, Math.floor(d.length * 0.99))] ?? maxDt;
  return {
    frames: s.deltas.length,
    fps: { avg: avgDt ? 1 / avgDt : 0, min: maxDt ? 1 / maxDt : 0, p1: p99Dt ? 1 / p99Dt : 0 },
    ms: { avg: avgDt * 1000, max: maxDt * 1000 },
    calls: snapshot.calls, tris: snapshot.tris,
    geometries: snapshot.geometries, textures: snapshot.textures,
    programs: snapshot.programs, heapMB: snapshot.heapMB, phase: phaseLabel,
  };
}

// Start collecting per-frame timings for `ms` and resolve with a summary. Exposed
// to the console / automation as window.__perfSample by the probe.
export function beginSample(ms: number): Promise<unknown> {
  return new Promise((resolve) => {
    sampler = { endAt: performance.now() + ms, deltas: [], resolve };
  });
}

// Called once per frame by the probe; closes an in-flight sample when its window ends.
export function feedSample(delta: number, now: number) {
  if (!sampler) return;
  sampler.deltas.push(delta);
  if (now >= sampler.endAt) {
    sampler.resolve(summarize(sampler));
    sampler = null;
  }
}
