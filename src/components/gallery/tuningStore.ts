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
  floorWash: number; // bake-time downward pool on the floor below each work (0 = none) — BAKED, needs re-bake
  floorWashAngle: number; // floor pool size (spot cone half-angle, rad) — BAKED, needs re-bake
  nameplateBrightness: number; // plaque envMap reflection intensity — LIVE
  plantFill: number; // plant corner fill-light intensity
  frameShadow: number; // faked drop-shadow strength under each frame's bottom edge
  frameShadowDrop: number; // how far that shadow falls below the frame (m)
  // Static contact-shadow decal under the daybed (replaces real-time N8AO grounding).
  sofaShadow: number; // strength 0..1 (0 = off)
  sofaShadowW: number; // footprint width along X (m)
  sofaShadowH: number; // footprint depth along Z (m)
  sofaShadowX: number; // centre X (m)
  sofaShadowZ: number; // centre Z (m)
  sofaShadowSoft: number; // soft-edge feather width (normalised)
  sofaShadowRadius: number; // rounded-rect corner roundness (0 = sharp, 0.5 = very round)
  // Static wall edge-shadows (replace N8AO at the ceiling cove + vertical corners).
  coveShadow: number; // strength of the darkening along the top (ceiling/cove seam) 0..1
  coveFade: number; // how far it reaches down the wall (m)
  cornerShadow: number; // strength of the darkening down the vertical wall corners 0..1
  cornerFade: number; // how far it reaches in from each corner (m)
  baseShadow: number; // strength of the darkening along the bottom (baseboard seam) 0..1
  baseFade: number; // how far it reaches up the wall from the baseboard (m)
  ceilingSeam: number; // strength of the AO between the crown decoration and the ceiling 0..1
  ceilingSeamFade: number; // how far it reaches in from the ceiling perimeter (m)
  floorEdge: number; // strength of the AO on the floor where it meets the baseboard/walls 0..1
  floorEdgeFade: number; // how far it reaches in from the floor perimeter (m)
  coveGlow: number; // brightness/opacity of the warm cove light strip under the crown
  crownBright: number; // overall brightness multiplier on the photographic crown moulding band
  // Floor lamp: a soft warm "patch of light" sits inside the metal dome. The dome
  // opens downward, so tilt the lamp a touch (lampTilt) to angle the opening toward
  // the viewer, then nudge the glow (offset from the shade centre) so it's glimpsed
  // through the opening. Tunable live because the right spot depends on the model.
  lampTilt: number; // pitch the whole lamp toward the viewer (rad)
  lampGlowX: number; // glow offset from shade centre (m)
  lampGlowY: number;
  lampGlowZ: number;
  lampGlowSize: number; // glow sphere radius (m)
  lampGlowIntensity: number; // glow emissive strength
  // --- Sky (celestial dome) -------------------------------------------------
  skyFlowSpeed: number; // how fast the curl flow-field churns the clouds
  skyFlowAmount: number; // how far clouds are dragged along the flow (turbulence)
  skySwirl: number; // residual global Starry-Night spiral on top of the flow
  skyParallax: number; // blend of the deeper 2nd cloud layer (0 = single layer)
  skyLayer2Scale: number; // scale of the deeper cloud layer (>1 = larger/further)
  skyStarThreshold: number; // star cell cutoff; lower = more stars (0.6..0.95)
  skyNightMix: number; // 0 = bright cloud swirl, 1 = dark realistic starfield
  skyIridescence: number; // dreamy indigo↔magenta hue drift in the night clouds
  bakePool: boolean; // bake the picture-light into a wall decal + frame-glint, drop the real SpotLights
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
  floorWash: 2.3,
  floorWashAngle: 0.42,
  nameplateBrightness: 2.6,
  plantFill: 1.5,
  frameShadow: 1.0,
  frameShadowDrop: 0.18,
  sofaShadow: 0.88,
  sofaShadowW: 2.95,
  sofaShadowH: 1.05,
  sofaShadowX: 0,
  sofaShadowZ: -2,
  sofaShadowSoft: 0.49,
  sofaShadowRadius: 0.54,
  coveShadow: 0,
  coveFade: 0.85,
  cornerShadow: 0.86,
  cornerFade: 0.65,
  baseShadow: 0.89,
  baseFade: 0.55,
  ceilingSeam: 1,
  ceilingSeamFade: 0.85,
  floorEdge: 0.79,
  floorEdgeFade: 0.65,
  coveGlow: 0.86,
  crownBright: 0.57,
  lampTilt: -0.02,
  lampGlowX: 0,
  lampGlowY: -0.045,
  lampGlowZ: 0,
  lampGlowSize: 0.055,
  lampGlowIntensity: 2,
  skyFlowSpeed: 0.12,
  skyFlowAmount: 0.07,
  skySwirl: 0.35,
  skyParallax: 0.35,
  skyLayer2Scale: 1.35,
  skyStarThreshold: 0.80,
  skyNightMix: 0.94,
  skyIridescence: 0.27,
  bakePool: false,
};

// `?bake` flips the bake on at load; otherwise default (real lights). Runtime
// toggleable for an A/B: `window.__tuning.setState({ bakePool: true|false })`.
const initialBake =
  typeof window !== "undefined" && new URLSearchParams(window.location.search).has("bake");

export const useTuningStore = create<Tuning & { set: (patch: Partial<Tuning>) => void }>((set) => ({
  ...TUNING_DEFAULTS,
  bakePool: initialBake,
  set: (patch) => set(patch),
}));

if (typeof window !== "undefined") {
  (window as unknown as { __tuning?: typeof useTuningStore }).__tuning = useTuningStore;
}
