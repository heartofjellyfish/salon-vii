// Lighting presets for the gallery room — built like a real exhibition:
//
//  1. GENERAL illumination — a strong, even, diffuse wash from above
//     (hemisphere + ambient). Decides how bright/visible the whole room is.
//  2. ACCENT illumination — one soft RectAreaLight in front of each painting,
//     sized to the canvas, so the light reads as a rectangular picture-light
//     rather than an elliptical spotlight scallop on the wall.
//
// Paintings use an unlit shader (always full-bright from their texture), so the
// accent mostly lifts the WALL around each piece. `fog` is pushed far back in the
// bright presets so the deep room's far wall isn't crushed to black.

export interface LightingPreset {
  label: string;
  exposure: number; // Canvas toneMappingExposure — overall brightness
  ambient: { color: string; intensity: number };
  hemisphere: { sky: string; ground: string; intensity: number };
  fog: { color: string; near: number; far: number };
  accent: {
    color: string;
    intensity: number;
    frontOffset: number; // metres the soft light sits in front of the painting
    pad: number; // soft light size = painting size + pad (metres)
  };
}

export const LIGHTING_PRESETS = {
  // Bright, even modern museum — soft diffuse fill, true wallpaper colour, each
  // painting gently lifted by a rectangular picture-light.
  brightMuseum: {
    label: "Bright Museum",
    exposure: 1.4,
    ambient: { color: "#c4b8aa", intensity: 0.55 },
    hemisphere: { sky: "#fff4e6", ground: "#38303a", intensity: 1.15 },
    fog: { color: "#2a2430", near: 32, far: 72 },
    accent: { color: "#fff2e0", intensity: 3.2, frontOffset: 0.5, pad: 0.7 },
  },

  // Warm salon — same even base, lower + amber, cosier.
  warmMuseum: {
    label: "Warm Salon",
    exposure: 1.35,
    ambient: { color: "#7a5836", intensity: 0.5 },
    hemisphere: { sky: "#ffcf9a", ground: "#1a0e10", intensity: 0.95 },
    fog: { color: "#1c1016", near: 24, far: 56 },
    accent: { color: "#ffe0ae", intensity: 3.2, frontOffset: 0.5, pad: 0.7 },
  },

  // Dramatic — dim diffuse, stronger accent so paintings clearly pop.
  dramatic: {
    label: "Dramatic",
    exposure: 1.3,
    ambient: { color: "#2a1c24", intensity: 0.3 },
    hemisphere: { sky: "#4a2838", ground: "#0a0608", intensity: 0.45 },
    fog: { color: "#0e0812", near: 16, far: 38 },
    accent: { color: "#ffe6bc", intensity: 5.5, frontOffset: 0.45, pad: 0.5 },
  },

  // Evening salon — the dim, amber, lived-in mood: the room drops into shadow,
  // a warm lamp pool falls on the centre seating, and each painting still pops
  // because it keeps its own picture-light accent.
  eveningSalon: {
    label: "Evening Salon",
    // 1.0 — paired with LinearToneMapping (see GalleryScene Canvas). The old N8AO composer
    // bypassed tone-mapping entirely, so the scene was bright AND fully saturated. Reinhard
    // (per-channel c/(1+c)) desaturated it — matching brightness by raising Reinhard exposure
    // traded away the colour. LinearToneMapping (exposure × colour, then clip) is a uniform
    // scale that preserves saturation, exactly like the old un-tone-mapped composer. At 1.0
    // both wall luma AND chroma match the ao=on reference (wallM L21.4/C38.1). Live via ?tune.
    exposure: 1.0,
    ambient: { color: "#5a3a22", intensity: 0.8 },
    hemisphere: { sky: "#caa06a", ground: "#0a0608", intensity: 0.32 },
    fog: { color: "#140b10", near: 18, far: 44 },
    accent: { color: "#ffe3b4", intensity: 5.0, frontOffset: 0.5, pad: 0.6 },
  },
} satisfies Record<string, LightingPreset>;

// Switch this to preview a different preset.
export const ACTIVE_LIGHTING: LightingPreset = LIGHTING_PRESETS.eveningSalon;
