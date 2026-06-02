# 富春山居图 handscroll exhibition

_Last updated: 2026-05-31_

A Chinese handscroll (28:1, 750 MP) shown as two surfaces:

1. **`/fuchun`** — a dim 3D hall (ambience). The whole scroll hangs flat on the long
   wall as a single low-res strip (`wall.webp`). Components in `src/components/fuchun/`.
2. **`/scroll`** — a full-screen 2D OpenSeadragon deep-zoom viewer (DZI tiles) for
   reading brushwork. `src/app/scroll/page.tsx`.

Click the wall scroll in `/fuchun` → navigates to `/scroll`; the viewer's "Back" → `/fuchun`.

## Why split it this way
A 144862×5197 image can't be one WebGL texture (GPU caps at 8192/16384) nor served
through any CDN on-the-fly transform. The 3D wall only needs *ambience*, so it gets a
single downscaled strip; all *detail* lives in the tiled viewer. (Earlier ideas — a 3D
unrolling scroll with rollers, or a horizontal display case — were dropped in favour of
this flat-wall + click-to-zoom model per the user's design board.)

## Asset pipeline — `scripts/prep-scroll.mjs <input.tif> <slug>`
- Source TIFs are **CMYK with no embedded ICC** → convert to sRGB with the system
  `Generic CMYK Profile.icc` (the profile barely matters for low-chroma ink, validated).
- libvips: `icc_transform` → tiled-JPEG TIFF temp → `dzsave` **DZI tile pyramid** (for
  OpenSeadragon) + one downscaled **`wall.webp`** strip (for the 3D wall) + `manifest.json`.
- Output `public/scrolls/<slug>/` is **gitignored** (heavy); ship to **R2** for prod
  (free tier; keeps it out of every Vercel build). Fuchun = 16,182 tiles / 144 MB;
  the reading level (L16, 36216×1300) is only 852 tiles / 9 MB.

## Viewer design (`/scroll`)
- Opens at the scroll's start (configurable end; handscrolls read right→left, but the
  file's right end is the colophon — flip via the tune panel). Arrow/WASD glide at a
  constant speed; flick to throw; scroll/pinch to zoom.
- **Zoom is capped at the source's 1:1 (`maxZoomPixelRatio = 1`)** — i.e. the deepest
  level, L18 = 144862×5197 = the full native resolution of the source TIF. You can reach
  full detail but never magnify *past* it (that was the apparent "distortion" — empty
  magnification beyond real pixels). Don't raise the cap above 1.
- **Budget-based preload, no network tiers** (deliberately un-fancy): on open we warm the
  HTTP/disk cache for levels from the opening level outward (deeper first, then shallower)
  up to `budgetMB` (~50 MB ⇒ all of L0–L17, ~47 MB). The single heaviest level
  (**L18, ~100 MB**) is left to **stream on demand per-spot** — you only ever fetch the
  screenful you actually examine, so full resolution costs nothing until used.
- **RAM stays flat** via OpenSeadragon's `maxImageCacheCount` (~400) LRU eviction — for a
  one-way scroll this behaves like FIFO (tiles you've passed unload). Prefetch warms the
  disk cache; it is *not* the same as resident decoded tiles.
- (An earlier version had a network-adaptive tier system — glide-speed throttling +
  per-tier sharpness caps + adaptive prefetch depth. Removed in favour of the simpler
  budget model above. The throughput readout in the debug panel is now informational only.)

## 3D hall (`/fuchun`)
- `dims.ts` is the shared contract: 18×5×3.2 m, origin at floor centre, scroll wall at
  z=-2.5, scroll aspect-locked to the texture. Change geometry/palette there.
- `Hall` (shell: wood floor, plaster walls, beamed ceiling, posts, glowing shoji window),
  `ScrollWall` (recessed niche, softly self-lit "silk" scroll via emissiveMap + warm LED
  strips, click→`onOpen`), `HallProps` (low bench, ceramic jar + dry branches, plaque),
  `HallLighting` (low ambient + warm rect-area wall-wash + broad wall fill + cool window
  light + one shadow-casting key). **No lightmap bake yet** — all real-time.
- Camera: constrained `OrbitControls`. The 16.7 m scroll can't fit one straight-on frame
  from a 5 m-deep room, so the default is a central establishing view — orbit to see the
  window / vase / full length; click the scroll to actually read it.
- **Dev overlays (reusable across galleries):** `?perf` (or backtick) = the shared FPS /
  draw-call / memory HUD — `PerfProbe` (in-canvas, in FuchunHall) + `PerfOverlay` (DOM),
  imported straight from `components/gallery/` (they're gallery-agnostic; no duplication).
  `?tune` = live lighting panel — `fuchun/tuningStore.ts` (zustand) + `FuchunTuningPanel`
  (leva, dynamic-imported), with `HallLighting` + an `ExposureSync` reading the store. This
  is the same store + panel + read-store pattern as the Van Gogh gallery; a NEW gallery
  reuses PerfProbe/PerfOverlay as-is and copies the 2-file tuning pattern.

## Debug panel
`/scroll?debug` (or press the backtick `` ` `` key) shows a live panel: current DZI
level (Ln / max), zoom + max-zoom (reflects the `maxZoomPixelRatio` cap), net tier +
MB/s, glide speed, prefetch progress (done/queued + in-flight), resident tile count
(watch FIFO eviction keep it bounded), fully-loaded flag, fps, and viewport-centre
image px. `window.__osd` also exposes the OpenSeadragon instance for console poking.

## Tune panel
`/scroll?tune` mounts a leva panel (dynamically imported, so leva never ships to normal
visitors) wired live into the viewer via a ref. Short bilingual labels; folders grouped
by risk: **手感 Feel** (glide×, start side left/right, flick — safe), **⚠ 缩放 Zoom**
(max zoom; 1 = source 1:1, keep ≤ 1), **⚠ 加载 Load** (budgetMB·on-reload, concurrency),
**⚠⚠ Don't touch** (resident cap). Defaults in `scrollTune.ts` mirror the live code so
toggling `?tune` changes nothing until you drag. The **start side** control is also the
answer to "which end opens" — flip to 左·起首 for the landscape beginning.

## Gotchas
- **Viewport size can read 0–1 in headless/preview contexts** (`window.innerWidth` → 0,
  `getContainerSize()` → 1). The reading-level (prefetch) math falls back to sane
  defaults so it never collapses to L0 and warms only a couple of tiles. Verify the real
  level/prefetch numbers via the debug panel in an actual browser.
- **One `next dev` per directory.** Two servers (e.g. a manual one + the preview tool)
  fight over `.next` and corrupt it → `ENOENT .next/server/app/<route>/page.js` (500).
  Fix: stop one, `rm -rf .next`, restart a single server.
- The **automation preview throttles rAF** (static R3F scenes go black after a reload
  until an HMR/interaction forces a frame) and **does not process synthetic R3F pointer
  events** (hover/click can't be driven via dispatched events) — verify visuals and the
  scroll-click in a real foreground browser.
- `RectAreaLight` requires `RectAreaLightUniformsLib.init()`.
