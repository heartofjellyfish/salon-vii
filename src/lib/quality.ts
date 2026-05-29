// Quality policy — caps the render resolution (devicePixelRatio) to trade a
// little sharpness for fill-rate. The gallery is fill-rate bound (many lights ×
// many pixels on Retina), so the rendered pixel count is the master perf lever.
//
// We render the ROOM at a capped DPR while roaming, and restore a higher DPR when
// INSPECTING a painting — a static, single-subject view where sharpness matters
// most and the cost is low. Self-lit painting textures keep their own resolution
// regardless; DPR only affects how many screen pixels sample the scene.

export type QualityMode = "performance" | "balanced" | "high";

// roamDpr: cap while moving through the room. inspectDpr: cap when examining a work.
export const QUALITY_MODES: Record<QualityMode, { roamDpr: number; inspectDpr: number }> = {
  performance: { roamDpr: 1.0, inspectDpr: 1.5 },
  balanced: { roamDpr: 1.25, inspectDpr: 1.25 },
  high: { roamDpr: 2.0, inspectDpr: 2.0 },
};

// Default. Roam and inspect both at 1.25: keeping the DPR constant means entering
// inspect no longer reallocates the framebuffer + post-processing targets, which
// was a hitch on every close-up. The painting's own hi-res texture still carries
// the detail for examining a work; DPR only sets how many screen pixels sample it.
export const DEFAULT_QUALITY: QualityMode = "balanced";

export interface ResolvedQuality {
  mode: QualityMode;
  roamDpr: number;
  inspectDpr: number;
}

// ?quality=performance|balanced|high (default balanced).
// ?roamdpr=N overrides the roaming cap for A/B testing (e.g. 1.25).
// Both caps are clamped to the device's own DPR so we never supersample.
export function resolveQuality(): ResolvedQuality {
  let mode = DEFAULT_QUALITY;
  let roamOverride: number | undefined;
  const deviceDpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 2;
  if (typeof window !== "undefined") {
    const q = new URLSearchParams(window.location.search);
    const m = q.get("quality");
    if (m === "performance" || m === "balanced" || m === "high") mode = m;
    const rd = parseFloat(q.get("roamdpr") ?? "");
    if (!Number.isNaN(rd) && rd > 0) roamOverride = rd;
  }
  const cfg = QUALITY_MODES[mode];
  const clamp = (v: number) => Math.min(v, deviceDpr);
  return { mode, roamDpr: clamp(roamOverride ?? cfg.roamDpr), inspectDpr: clamp(cfg.inspectDpr) };
}
