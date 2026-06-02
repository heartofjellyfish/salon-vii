"use client";

import { useEffect } from "react";
import { Leva, useControls, folder } from "leva";
import type { ScrollTune } from "./scrollTune";

/**
 * Live tuning panel for the /scroll viewer (mounted only under ?tune, via dynamic
 * import, so leva never ships to normal visitors). Values flow up through onChange
 * into a ref the viewer reads. Short bilingual labels; ⚠ = affects feel/perf,
 * ⚠⚠ = don't touch.
 */
export function ScrollTuner({ onChange }: { onChange: (v: ScrollTune) => void }) {
  const v = useControls(() => ({
    "手感 Feel": folder({
      glideMul: { value: 1, min: 0.2, max: 3, step: 0.1, label: "横移速度 glide×" },
      startSide: {
        value: "right",
        options: { "右·卷尾 right": "right", "左·起首 left": "left" },
        label: "起始端 start",
      },
      flick: { value: 0.3, min: 0, max: 0.6, step: 0.05, label: "甩动惯性 flick" },
    }),
    "⚠ 缩放 Zoom": folder(
      {
        maxZoomPR: { value: 1, min: 0.5, max: 2, step: 0.05, label: "最大缩放 max·1=原图" },
      },
      { collapsed: false },
    ),
    "⚠ 加载 Load": folder(
      {
        budgetMB: { value: 50, min: 5, max: 150, step: 5, label: "预热预算MB·重载" },
        conc: { value: 6, min: 1, max: 12, step: 1, label: "并发 concurrency" },
      },
      { collapsed: true },
    ),
    "⚠⚠ 勿动 Don't touch": folder(
      {
        cacheCount: { value: 400, min: 100, max: 2000, step: 50, label: "常驻上限 cache" },
      },
      { collapsed: true },
    ),
  }));

  useEffect(() => {
    onChange(v as unknown as ScrollTune);
  }, [v, onChange]);

  return (
    <Leva
      collapsed={false}
      titleBar={{ title: "tune · ?tune" }}
      theme={{ sizes: { rootWidth: "340px", controlWidth: "130px" } }}
    />
  );
}
