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
      crownBright: { value: TUNING_DEFAULTS.crownBright, min: 0, max: 2, step: 0.01, label: "天花线亮度 crown" },
      coveGlow: { value: TUNING_DEFAULTS.coveGlow, min: 0, max: 1.2, step: 0.01, label: "cove辉光 glow" },
    }),
    "Picture light / 照画灯": folder({
      spotIntensity: { value: TUNING_DEFAULTS.spotIntensity, min: 0, max: 40, step: 0.5 },
      spotAngle: { value: TUNING_DEFAULTS.spotAngle, min: 0.15, max: 0.9, step: 0.01 },
      spotPenumbra: { value: TUNING_DEFAULTS.spotPenumbra, min: 0, max: 1, step: 0.01 },
      spotColor: { value: TUNING_DEFAULTS.spotColor },
      frameShadow: { value: TUNING_DEFAULTS.frameShadow, min: 0, max: 1, step: 0.01 },
      frameShadowDrop: { value: TUNING_DEFAULTS.frameShadowDrop, min: 0.05, max: 0.8, step: 0.01 },
    }),
    // The old real-time N8AO (only on with ?ao=on now — kept as a live reference).
    "Contact AO / 接触阴影": folder({
      aoIntensity: { value: TUNING_DEFAULTS.aoIntensity, min: 0, max: 12, step: 0.1 },
      aoRadius: { value: TUNING_DEFAULTS.aoRadius, min: 0.2, max: 2.5, step: 0.05 },
    }),
    "Sofa shadow / 沙发阴影": folder({
      sofaShadow: { value: TUNING_DEFAULTS.sofaShadow, min: 0, max: 1, step: 0.01, label: "强度 strength" },
      sofaShadowW: { value: TUNING_DEFAULTS.sofaShadowW, min: 0.5, max: 4, step: 0.05, label: "宽 width" },
      sofaShadowH: { value: TUNING_DEFAULTS.sofaShadowH, min: 0.3, max: 2.5, step: 0.05, label: "深 depth" },
      sofaShadowSoft: { value: TUNING_DEFAULTS.sofaShadowSoft, min: 0.02, max: 1, step: 0.01, label: "羽化 feather" },
      sofaShadowRadius: { value: TUNING_DEFAULTS.sofaShadowRadius, min: 0, max: 0.9, step: 0.01, label: "圆角 round" },
      sofaShadowX: { value: TUNING_DEFAULTS.sofaShadowX, min: -3, max: 3, step: 0.05, label: "左右 x" },
      sofaShadowZ: { value: TUNING_DEFAULTS.sofaShadowZ, min: -5, max: 1, step: 0.05, label: "前后 z" },
    }),
    "Wall shadows / 墙面阴影": folder({
      coveShadow: { value: TUNING_DEFAULTS.coveShadow, min: 0, max: 1, step: 0.01, label: "墙顶强度 cove" },
      coveFade: { value: TUNING_DEFAULTS.coveFade, min: 0.1, max: 2, step: 0.05, label: "墙顶范围 coveM" },
      cornerShadow: { value: TUNING_DEFAULTS.cornerShadow, min: 0, max: 1, step: 0.01, label: "墙角强度 corner" },
      cornerFade: { value: TUNING_DEFAULTS.cornerFade, min: 0.1, max: 2, step: 0.05, label: "墙角范围 cornerM" },
      baseShadow: { value: TUNING_DEFAULTS.baseShadow, min: 0, max: 1, step: 0.01, label: "踢脚强度 base" },
      baseFade: { value: TUNING_DEFAULTS.baseFade, min: 0.05, max: 1.5, step: 0.05, label: "踢脚范围 baseM" },
      ceilingSeam: { value: TUNING_DEFAULTS.ceilingSeam, min: 0, max: 1, step: 0.01, label: "天花缝强度 seam" },
      ceilingSeamFade: { value: TUNING_DEFAULTS.ceilingSeamFade, min: 0.1, max: 2, step: 0.05, label: "天花缝范围 seamM" },
      floorEdge: { value: TUNING_DEFAULTS.floorEdge, min: 0, max: 1, step: 0.01, label: "地面边强度 floor" },
      floorEdgeFade: { value: TUNING_DEFAULTS.floorEdgeFade, min: 0.05, max: 1.5, step: 0.05, label: "地面边范围 floorM" },
    }),
    // ?lightbake only. floorWash + the picture-light values are BAKED into the lightmaps,
    // so changing them does nothing until you press Re-bake. nameplateBrightness is LIVE.
    "Bake / 烘焙 (改完点重烤)": folder({
      floorWash: { value: TUNING_DEFAULTS.floorWash, min: 0, max: 12, step: 0.1, label: "地面光 floor" },
      floorWashAngle: { value: TUNING_DEFAULTS.floorWashAngle, min: 0.15, max: 0.7, step: 0.01, label: "地面光大小 size" },
      nameplateBrightness: { value: TUNING_DEFAULTS.nameplateBrightness, min: 0, max: 3, step: 0.05, label: "铭牌亮度 plate" },
      "重新烘焙 / Re-bake": button(() => (window as unknown as { __rebake?: () => void }).__rebake?.()),
    }),
    "Plants / 植物灯": folder({
      plantFill: { value: TUNING_DEFAULTS.plantFill, min: 0, max: 25, step: 0.5, label: "补光 fill" },
      treeShadow: { value: TUNING_DEFAULTS.treeShadow, min: 0, max: 1, step: 0.01, label: "叶影 strength" },
      treeShadowScale: { value: TUNING_DEFAULTS.treeShadowScale, min: 1, max: 6, step: 0.1, label: "范围 size" },
      treeShadowSoft: { value: TUNING_DEFAULTS.treeShadowSoft, min: 0, max: 5, step: 0.1, label: "虚化 soft" },
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

  return <Leva collapsed={false} theme={{ sizes: { rootWidth: "320px" } }} />;
}
