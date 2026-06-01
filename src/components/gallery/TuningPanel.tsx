"use client";

import { useEffect } from "react";
import { Leva, useControls, folder, button } from "leva";
import { useTuningStore, TUNING_DEFAULTS } from "./tuningStore";

// Live lighting/AO tuning GUI. Only mounted when the URL has ?tune (gated by the
// caller via a dynamic import), so leva never ships to normal visitors. The
// controls write straight into the zustand store the scene reads from, so every
// drag updates the 3D view in real time. Tune order that works best:
//   1) exposure  2) ambient (darks)  3) picture light  4) AO crevice black.
export default function TuningPanel() {
  const set = useTuningStore((s) => s.set);

  const vals = useControls({
    "Mood / 整体": folder({
      exposure: { value: TUNING_DEFAULTS.exposure, min: 0.4, max: 2.0, step: 0.01 },
      ambient: { value: TUNING_DEFAULTS.ambient, min: 0, max: 0.8, step: 0.01 },
      hemi: { value: TUNING_DEFAULTS.hemi, min: 0, max: 1.5, step: 0.01 },
    }),
    "Picture light / 照画灯": folder({
      spotIntensity: { value: TUNING_DEFAULTS.spotIntensity, min: 0, max: 40, step: 0.5 },
      spotAngle: { value: TUNING_DEFAULTS.spotAngle, min: 0.15, max: 0.9, step: 0.01 },
      spotPenumbra: { value: TUNING_DEFAULTS.spotPenumbra, min: 0, max: 1, step: 0.01 },
      spotColor: { value: TUNING_DEFAULTS.spotColor },
      frameShadow: { value: TUNING_DEFAULTS.frameShadow, min: 0, max: 1, step: 0.01 },
      frameShadowDrop: { value: TUNING_DEFAULTS.frameShadowDrop, min: 0.05, max: 0.8, step: 0.01 },
    }),
    "Contact AO / 接触阴影": folder({
      aoIntensity: { value: TUNING_DEFAULTS.aoIntensity, min: 0, max: 12, step: 0.1 },
      aoRadius: { value: TUNING_DEFAULTS.aoRadius, min: 0.2, max: 2.5, step: 0.05 },
    }),
    // ?lightbake only. floorWash + the picture-light values are BAKED into the lightmaps,
    // so changing them does nothing until you press Re-bake. nameplateBrightness is LIVE.
    "Bake / 烘焙 (改完点重烤)": folder({
      floorWash: { value: TUNING_DEFAULTS.floorWash, min: 0, max: 12, step: 0.1 },
      floorWashAngle: { value: TUNING_DEFAULTS.floorWashAngle, min: 0.15, max: 0.7, step: 0.01 },
      nameplateBrightness: { value: TUNING_DEFAULTS.nameplateBrightness, min: 0, max: 3, step: 0.05 },
      "重新烘焙 / Re-bake": button(() => (window as unknown as { __rebake?: () => void }).__rebake?.()),
    }),
    "Plants / 植物灯": folder({
      plantFill: { value: TUNING_DEFAULTS.plantFill, min: 0, max: 25, step: 0.5 },
    }),
    "Lamp / 落地灯": folder({
      lampTilt: { value: TUNING_DEFAULTS.lampTilt, min: -0.5, max: 0.5, step: 0.01 },
      lampGlowX: { value: TUNING_DEFAULTS.lampGlowX, min: -0.3, max: 0.3, step: 0.005 },
      lampGlowY: { value: TUNING_DEFAULTS.lampGlowY, min: -0.3, max: 0.3, step: 0.005 },
      lampGlowZ: { value: TUNING_DEFAULTS.lampGlowZ, min: -0.3, max: 0.3, step: 0.005 },
      lampGlowSize: { value: TUNING_DEFAULTS.lampGlowSize, min: 0.01, max: 0.2, step: 0.005 },
      lampGlowIntensity: { value: TUNING_DEFAULTS.lampGlowIntensity, min: 0, max: 8, step: 0.1 },
    }),
    "Sky / 天空": folder({
      skyNightMix: { value: TUNING_DEFAULTS.skyNightMix, min: 0, max: 1, step: 0.01 },
      skyIridescence: { value: TUNING_DEFAULTS.skyIridescence, min: 0, max: 1, step: 0.01 },
      skyFlowSpeed: { value: TUNING_DEFAULTS.skyFlowSpeed, min: 0, max: 0.6, step: 0.01 },
      skyFlowAmount: { value: TUNING_DEFAULTS.skyFlowAmount, min: 0, max: 0.2, step: 0.005 },
      skySwirl: { value: TUNING_DEFAULTS.skySwirl, min: 0, max: 1.2, step: 0.01 },
      skyParallax: { value: TUNING_DEFAULTS.skyParallax, min: 0, max: 1, step: 0.01 },
      skyLayer2Scale: { value: TUNING_DEFAULTS.skyLayer2Scale, min: 0.8, max: 2.0, step: 0.01 },
      skyStarThreshold: { value: TUNING_DEFAULTS.skyStarThreshold, min: 0.6, max: 0.95, step: 0.005 },
    }),
  });

  useEffect(() => {
    set(vals);
  }, [vals, set]);

  return <Leva collapsed={false} />;
}
