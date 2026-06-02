"use client";

import { useEffect } from "react";
import { Leva, useControls, folder } from "leva";
import { useFuchunTuning } from "./tuningStore";

// Live lighting tuning GUI for the 富春 hall. Only mounted when the URL has
// ?tune (gated by the caller via a dynamic import), so leva never ships to
// normal visitors. The controls write straight into the zustand store the
// scene reads from, so every drag updates the 3D view in real time.
export default function FuchunTuningPanel() {
  const set = useFuchunTuning((s) => s.set);

  const vals = useControls({
    "灯光 Lighting": folder({
      exposure: { value: 0.78, min: 0.3, max: 1.6, step: 0.01, label: "曝光 exposure" },
      ambient: { value: 0.15, min: 0, max: 0.6, step: 0.01, label: "环境光 ambient" },
      wallWash: { value: 1.7, min: 0, max: 6, step: 0.05, label: "画卷洗墙 wash" },
      wallFill: { value: 0.55, min: 0, max: 3, step: 0.05, label: "整墙补光 fill" },
      windowLight: { value: 1.8, min: 0, max: 5, step: 0.05, label: "窗光 window" },
      spot: { value: 6, min: 0, max: 20, step: 0.5, label: "主光 key" },
    }),
    "凳子 Bench": folder(
      {
        benchLen: { value: 2.4, min: 0.4, max: 3.5, step: 0.05, label: "长度 size·m" },
        benchX: { value: 0, min: -4, max: 4, step: 0.05, label: "左右 x" },
        benchZ: { value: 1.2, min: -2, max: 4, step: 0.05, label: "前后 z" },
        benchRotY: { value: 0, min: -Math.PI, max: Math.PI, step: 0.02, label: "旋转 rotY" },
      },
      { collapsed: true },
    ),
  });

  useEffect(() => {
    set(vals);
  }, [vals, set]);

  return (
    <Leva
      collapsed={false}
      titleBar={{ title: "tune · ?tune" }}
      theme={{ sizes: { rootWidth: "320px", controlWidth: "120px" } }}
    />
  );
}
