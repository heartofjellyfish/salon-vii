"use client";

import { create } from "zustand";

// Live, in-memory lighting knobs for the 富春 hall, driven by the ?tune leva
// panel. Defaults mirror the values baked into HallLighting / the page renderer,
// so when the panel is absent (every normal visitor) the store reads identical
// to hardcoded — the scene looks exactly the same and leva is never loaded.
export interface FuchunTuning {
  exposure: number; // renderer toneMappingExposure — overall brightness (page-handled)
  ambient: number; // ambientLight intensity — lifts the darks
  wallWash: number; // warm rect-area wash grazing the scroll
  wallFill: number; // broad dim warm wash over the whole back wall
  windowLight: number; // cool daylight through the left shoji window
  spot: number; // warm key spot from above-front
  // bench placement — the GLB is auto-fit to a 1 m long axis, then transformed by these
  benchLen: number; // long-axis length in metres (uniform scale)
  benchX: number; // left/right
  benchZ: number; // forward/back
  benchRotY: number; // yaw (rad)
}

export const FUCHUN_TUNING_DEFAULTS: FuchunTuning = {
  exposure: 0.78,
  ambient: 0.15,
  wallWash: 1.7,
  wallFill: 0.55,
  windowLight: 1.8,
  spot: 6,
  benchLen: 2.4,
  benchX: 0,
  benchZ: 1.2,
  benchRotY: 0,
};

export const useFuchunTuning = create<FuchunTuning & { set: (patch: Partial<FuchunTuning>) => void }>((set) => ({
  ...FUCHUN_TUNING_DEFAULTS,
  set: (patch) => set(patch),
}));
