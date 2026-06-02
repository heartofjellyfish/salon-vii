// Shared geometry + palette for the 富春 dim-hall scene (src/components/fuchun/*).
//
// Coordinate system: origin at floor centre. x ∈ [-9, 9] runs along the scroll
// wall; y is up (floor 0 → ceiling 3.2); z is depth — the back/scroll wall is at
// z = -2.5, the open camera side is +2.5. The +z (camera-side) wall is
// intentionally OMITTED so the camera can frame the scene. Camera looks toward -z.

export const ROOM = { W: 18, H: 3.2, D: 5 } as const;
export const BACK_Z = -ROOM.D / 2; // -2.5  → the scroll wall
export const HALF_W = ROOM.W / 2; // 9

// The scroll keeps the source aspect (wall.webp is 8192 × 294 ≈ 27.87 : 1).
const SCROLL_ASPECT = 8192 / 294;
export const SCROLL = {
  height: 0.6,
  width: 0.6 * SCROLL_ASPECT, // ≈ 16.7 m (near-full wall width, like the reference)
  centerY: 1.55,
  aspect: SCROLL_ASPECT,
} as const;

// z-layers on the back wall (small offsets avoid z-fighting; camera is on +z):
export const Z = {
  wall: BACK_Z, // Hall draws the flat back wall here
  backing: BACK_Z + 0.01, // ScrollWall's dark recess panel
  scroll: BACK_Z + 0.03, // the painting plane
  led: BACK_Z + 0.04, // emissive LED strips above / below the scroll
} as const;

export const COLORS = {
  plaster: "#c9bca0", // warm beige plaster wall
  woodFloor: "#4a3622", // dark wood floor tint (multiplies /textures/floor-wood.jpg)
  woodBeam: "#2c1f14", // dark ceiling beams / vertical posts
  woodWarm: "#6b4f33", // mid wood (bench)
  warmLight: "#ffd9a0", // 2700–3000K LED wall-wash
  ceramic: "#5c5249", // ceramic vase
} as const;

// Heavy /scrolls/ tiles live in /public for local dev; in production set
// NEXT_PUBLIC_ASSET_BASE to the R2 (or CDN) origin so they don't bloat the Vercel
// build. Empty string → same-origin /public (dev default).
export const ASSET_BASE = process.env.NEXT_PUBLIC_ASSET_BASE ?? "";
// Dev serves tiles from local /public/scrolls/fuchun; prod from R2 when
// NEXT_PUBLIC_ASSET_BASE = the bucket's public base URL (bucket layout: salon/fuchun/…).
export const SCROLL_BASE = ASSET_BASE ? `${ASSET_BASE}/fuchun` : "/scrolls/fuchun";
export const SCROLL_TEXTURE = `${SCROLL_BASE}/wall.webp`;
export const FLOOR_TEXTURE = "/textures/floor-wood.jpg";
export const PLASTER_TEXTURE = "/textures/wallpaper-fuchun.png"; // warm beige plaster wall (1536×1024)
export const LINEN_TEXTURE = "/textures/gray-linen.png"; // hi-res cloth for the scroll's fabric mount
