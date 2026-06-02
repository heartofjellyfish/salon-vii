// Tunable knobs for the /scroll deep-zoom viewer. Kept leva-free so the page can
// import the defaults without pulling leva into the normal bundle (the leva panel
// in ScrollTuner.tsx is dynamically imported only under ?tune).

export type ScrollTune = {
  glideMul: number; // arrow-glide speed multiplier
  startSide: "left" | "right"; // which end the viewer opens on
  flick: number; // drag-flick momentum
  budgetMB: number; // preload budget — levels that fit are fully warmed on entry,
  //                    heavier (deepest) levels stream on demand. Applies on (re)load.
  conc: number; // prefetch concurrency
  maxZoomPR: number; // max zoom: 1 = original 1:1 (full native detail). >1 = empty
  //                    magnification past the source resolution → blur. Keep ≤ 1.
  cacheCount: number; // resident-tile cap (RAM / FIFO window)
};

export const SCROLL_TUNE_DEFAULTS: ScrollTune = {
  glideMul: 1,
  startSide: "right",
  flick: 0.3,
  budgetMB: 50,
  conc: 6,
  maxZoomPR: 1,
  cacheCount: 400,
};
