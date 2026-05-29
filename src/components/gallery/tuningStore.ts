"use client";

import { create } from "zustand";
import { ACTIVE_LIGHTING } from "@/lib/lighting";

// Live, in-memory lighting/AO knobs driven by the ?tune leva panel. Defaults
// mirror the values baked into the components/preset, so when the panel is
// absent (every normal visitor) the store reads identical to hardcoded — the
// scene looks exactly the same and leva is never loaded.
export interface Tuning {
  exposure: number; // Canvas toneMappingExposure — overall brightness
  ambient: number; // ambientLight intensity — fills (greys) the darks
  hemi: number; // hemisphereLight intensity — sky/ground fill
  aoIntensity: number; // N8AO darkening strength in crevices
  aoRadius: number; // N8AO reach (m); >~1.2 starts washing the whole wall
  spotIntensity: number; // picture-light brightness
  spotAngle: number; // picture-light cone half-angle (rad) — pool size
  spotPenumbra: number; // picture-light edge softness 0..1
  spotColor: string;
  plantFill: number; // plant corner fill-light intensity
  frameShadow: number; // faked drop-shadow strength under each frame's bottom edge
  frameShadowDrop: number; // how far that shadow falls below the frame (m)
}

export const TUNING_DEFAULTS: Tuning = {
  exposure: ACTIVE_LIGHTING.exposure,
  ambient: ACTIVE_LIGHTING.ambient.intensity,
  hemi: ACTIVE_LIGHTING.hemisphere.intensity,
  aoIntensity: 12.0,
  aoRadius: 0.85,
  spotIntensity: 11.0,
  spotAngle: 0.61,
  spotPenumbra: 1.0,
  spotColor: ACTIVE_LIGHTING.accent.color,
  plantFill: 1.5,
  frameShadow: 1.0,
  frameShadowDrop: 0.18,
};

export const useTuningStore = create<Tuning & { set: (patch: Partial<Tuning>) => void }>((set) => ({
  ...TUNING_DEFAULTS,
  set: (patch) => set(patch),
}));
