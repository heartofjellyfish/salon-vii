"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { snapshot, getPhase, beginSample, feedSample, type PerfSnapshot } from "./perf-state";

// ---------------------------------------------------------------------------
// Standing performance probe for the gallery. Mounts inside <Canvas>.
//
// Every frame it reads the renderer's own counters (draw calls, triangles,
// resident geometries/textures, compiled shader programs) plus a rolling frame
// rate — a handful of integer reads, so it stays on even for ordinary visitors.
// It publishes the latest reading to `window.__galleryPerf` and exposes
// `window.__perfSample(ms)` → Promise<summary> so a human or a later automated
// tuning pass can read real numbers instead of OCR-ing an overlay:
//
//     await window.__perfSample(3000)
//
// The on-screen readout lives in <PerfOverlay/> (DOM, r3f-free). Standing tool:
// after adding a model / light / effect, check it didn't cost a frame.
// ---------------------------------------------------------------------------

export function PerfProbe() {
  const gl = useThree((s) => s.gl);
  const advance = useThree((s) => s.advance);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const r3fGet = useThree((s) => s.get);
  const r3fSet = useThree((s) => s.set);
  const acc = useRef({ frames: 0, sum: 0, worst: 0, since: 0, calls: 0, tris: 0 });

  useEffect(() => {
    const w = window as unknown as {
      __perfSample?: (ms?: number) => Promise<unknown>;
      __perfBench?: (frames?: number) => unknown;
      __r3f?: unknown;
    };
    // Live handles for ad-hoc perf experiments from the console (toggle lights,
    // change pixel ratio, traverse the scene) and re-bench without a reload.
    w.__r3f = { gl, scene, camera, advance, invalidate, get: r3fGet, set: r3fSet };
    // Passive sample: aggregate the live frame loop over `ms`. Accurate only where
    // the browser actually keeps rendering (a real machine) — in a headless /
    // backgrounded preview the loop is throttled when idle, so prefer __perfBench.
    w.__perfSample = (ms = 3000) => beginSample(ms);
    // Active benchmark: the real per-frame cost, independent of the rAF throttle
    // that makes the passive panel meaningless in a headless preview. Render the
    // real pipeline (RenderPass scene → N8AO → screen) by calling the post-processing
    // composer directly, `frames` times, flushing the GPU so the number includes GPU
    // work. composer.render() is synchronous and repeatable (like gl.render) — unlike
    // advance() under frameloop="always", which no-ops unpredictably and gave wildly
    // unstable numbers. Falls back to scene-only (no post-fx) if the composer ref
    // isn't up yet. The first render absorbs first-use shader compilation.
    w.__perfBench = (frames = 120) => {
      const ctx = gl.getContext();
      const composer = (window as unknown as { __composer?: { render: (dt: number) => void } }).__composer;
      const render = composer ? () => composer.render(0.0166) : () => gl.render(scene, camera);
      // Warm up hard before timing: the GPU clocks ramp under sustained load, the
      // first renders compile shaders / allocate targets, AND ctx.finish() only
      // reflects true GPU cost once the command queue is saturated (otherwise it
      // returns before the GPU drains, reading fake-low). Drive a burst first.
      for (let i = 0; i < 60; i++) render();
      ctx.finish();
      gl.info.reset();
      render(); ctx.finish();                 // one clean frame for the counters
      const calls = gl.info.render.calls, tris = gl.info.render.triangles;
      const t0 = performance.now();
      for (let i = 0; i < frames; i++) render();
      ctx.finish();                           // block until the GPU drains
      const per = (performance.now() - t0) / frames;
      gl.info.reset();
      invalidate();                           // let the live loop repaint cleanly
      return {
        method: composer ? "composer" : "scene-only",
        frames, msPerFrame: +per.toFixed(2), fps: +(1000 / per).toFixed(1),
        calls, tris,
        geometries: gl.info.memory.geometries, textures: gl.info.memory.textures,
        programs: gl.info.programs?.length ?? 0, phase: getPhase(),
      };
    };
    return () => { delete w.__perfSample; delete w.__perfBench; delete w.__r3f; };
  }, [gl, advance, scene, camera, invalidate, r3fGet, r3fSet]);

  // Restore three's default counter behaviour when the probe unmounts.
  useEffect(() => {
    const info = gl.info;
    return () => { info.autoReset = true; };
  }, [gl]);

  useFrame((_, delta) => {
    const now = performance.now();
    const info = gl.info;
    // The N8AO EffectComposer draws the frame in several passes. With three's
    // default autoReset the counters would zero between passes, leaving us reading
    // only the last (a single full-screen pass → "1 draw call"). Hold autoReset off
    // and clear the counters ourselves once per frame. This callback runs at the
    // default priority 0, i.e. *before* the composer's render, so the counters still
    // hold the frame that just finished (summed across all its passes) — capture
    // that, then reset for the frame the composer is about to draw.
    info.autoReset = false;
    const a = acc.current;
    a.calls = info.render.calls;
    a.tris = info.render.triangles;
    info.reset();

    feedSample(delta, now);

    // Publish a rolling snapshot ~4×/sec (cheap; no allocations on the hot path).
    if (a.since === 0) a.since = now;
    a.frames += 1;
    a.sum += delta;
    if (delta > a.worst) a.worst = delta;
    if (now - a.since >= 250) {
      const avgDt = a.sum / a.frames;
      snapshot.fps = avgDt ? 1 / avgDt : 0;
      snapshot.fpsMin = a.worst ? 1 / a.worst : 0;
      snapshot.ms = avgDt * 1000;
      snapshot.calls = a.calls;
      snapshot.tris = a.tris;
      snapshot.geometries = info.memory.geometries;
      snapshot.textures = info.memory.textures;
      snapshot.programs = info.programs?.length ?? 0;
      const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      snapshot.heapMB = mem ? Math.round(mem.usedJSHeapSize / 1048576) : 0;
      snapshot.phase = getPhase();
      snapshot.ts = now;
      (window as unknown as { __galleryPerf?: PerfSnapshot }).__galleryPerf = snapshot;
      a.frames = 0; a.sum = 0; a.worst = 0; a.since = now;
    }
  });

  return null;
}
