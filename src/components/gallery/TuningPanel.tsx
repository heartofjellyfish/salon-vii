"use client";

import { useEffect } from "react";
import { Leva, useControls, folder } from "leva";
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
    }),
    "Contact AO / 接触阴影": folder({
      aoIntensity: { value: TUNING_DEFAULTS.aoIntensity, min: 0, max: 12, step: 0.1 },
      aoRadius: { value: TUNING_DEFAULTS.aoRadius, min: 0.2, max: 2.5, step: 0.05 },
    }),
    "Plants / 植物灯": folder({
      plantFill: { value: TUNING_DEFAULTS.plantFill, min: 0, max: 25, step: 0.5 },
    }),
  });

  useEffect(() => {
    set(vals);
  }, [vals, set]);

  return <Leva collapsed={false} />;
}
