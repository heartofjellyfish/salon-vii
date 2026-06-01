# Lightmap baking — gallery lighting (design, recipe, and the pits we fell into)

> _Last updated: 2026-06-01._
>
> **Prod-critical (2026-06-01):** the in-browser baker is **always mounted** now — it is no
> longer gated behind `?lightbake`. It used to be, which meant **production never baked**:
> every visitor ran all 9 picture spotlights and sat at ~10 fps on a mid GPU (the spots are
> the scene's #1 cost). Now every load bakes once (a cheap burst of ortho renders under the
> reveal overlay), then drops the spots. This is option **A** below; option **B** (ship
> pre-baked PNGs, zero per-load cost) is still the endgame (§6).
> Read this before touching `LightmapBake.tsx`, `lightmapStore.ts`, `BakedMesh.tsx`, or
> the picture-light / frame / nameplate materials. It is the distilled result of a long,
> painful session — every gotcha below cost real time to find. New galleries should reuse
> this system; new sessions should not re-derive it.

## 1. The problem & the win

Static lights on static geometry. The nine per-painting **SpotLights were the scene's #1
GPU cost** — each shaded every fragment of the fill-rate-bound room every frame. Measured:
removing them took roam ~84 → ~141 fps (frame time ~12 → ~7 ms; the spots were ~40–50% of
the frame). Their only visible output is (a) a warm **pool on the wall/floor** and (b) a
**glint on the gilt frame** — and the lights never move. So: bake the (diffuse) pool once,
draw the surfaces **unlit**, and drop the real lights.

## 2. The one idea that made it work: capture, don't reconstruct

We first tried to **reconstruct** the spotlight analytically (cone smoothstep + distance
decay + N·L + albedo + a tone-mapped "base" term, as an additive decal). It was a tar pit:
shape, brightness, hue, and colour-space never lined up; we hit an sRGB double-decode bug
and the fundamental "tonemap(a+b) ≠ tonemap(a)+tonemap(b)" problem. **Abandon that approach.**

What works (industry standard = **lightmaps**): render a **white probe** at each surface,
lit by the **real lights**, into a RenderTarget. That texture *is* the exact lighting — no
maths to match. Use it as `lightMap`. Faithful by construction, and free at runtime (unlit
material = no per-frame light loop).

Pieces:
- `LightmapBake.tsx` — the in-browser baker (ortho cam + white probe + RenderTarget).
- `lightmapStore.ts` — a zustand store the baker publishes lightmaps into (keyed by id).
- `BakedMesh.tsx` — a planar surface that renders `MeshStandard` until baked, then unlit
  `MeshBasic(map × lightMap)`.

## 3. Recipe for a NEW room

1. Build walls/floor with `<BakedMesh id="…" width height map …/>` (planes; their own 0..1
   UV is the lightmap UV — no unwrap needed). Tag = `userData={{ lightbake: id }}`.
2. Mount `<LightmapBake/>` (now **always mounted**, not gated — see the prod note up top).
   It polls until the surfaces' albedo has loaded **and the picture spots are aimed** (see
   pit #5), then bakes each once and publishes a `lightMap` to the store.
3. `BakedMesh` swaps to `MeshBasic(map × lightMap, lightMapIntensity = π)` when its lightmap
   appears. The real picture lights render until `store.baked`, then drop (`Painting` gates
   `<PaintingLighting>`/`<FloorWash>` on `!lmBaked`).
4. `?tune` → **"Bake / 烘焙"** folder: `floorWash`, `floorWashAngle`, `nameplateBrightness`
   + a **Re-bake** button. Baked params (floorWash, spot*) need Re-bake; live params
   (nameplateBrightness, exposure, ambient, AO) update instantly.

## 4. The pits (each one cost us)

1. **`lightMapIntensity = π`.** three's lightMap energy convention. With π, an unlit
   `MeshBasic(map × lightMap)` matches a `MeshStandard` diffuse surface lit by the same
   lights. Without it the pool reads ~3× too dim.
2. **Colour space.** Bake with `renderer.toneMapping = NoToneMapping` and the RT as
   `LinearSRGBColorSpace` → you capture **linear irradiance**. The unlit wall (`MeshBasic`,
   `toneMapped: true`) then re-applies the room's exposure+Reinhard. Keep the crisp tiled
   wallpaper on `map` (its own `texture.repeat`) and the smooth lighting on `lightMap`
   (low-res, the plane's 0..1 UV) — don't bake albedo into the lightmap or it goes soft.
3. **three light layers test against the CAMERA only — there is NO per-object light
   masking** in the forward renderer (`light.layers.test(camera.layers)`). You **cannot**
   make a light "illuminate only the frames, not the walls." A whole reverted attempt died
   on this false assumption. Verified in three r184 source.
4. **Shadow maps blow the texture-unit budget.** Enabling `castShadow` on the 9 spots → 9
   shadow-map samplers → exceeds `MAX_TEXTURE_IMAGE_UNITS(16)` → shaders fail to compile →
   **black screen**. Never enable shadows on many lights at once. To bake AO, accumulate
   **one** shadow light at a time.
5. **Bake-timing race (this caused a "black walls" regression).** A `SpotLight`'s `.target`
   is positioned in a **ref callback**. If the bake fires before that ref runs, the cone
   points at the default **origin** → the wall lightmap bakes **dark**, and the floor near
   the origin catches the stray light. Symptom: floor lit, walls black. Fix: the baker waits
   until a picture spot's `target.position` is off-origin (`lengthSq > 0.25`) before baking.
6. **Durable React integration.** Do **not** mutate `mesh.material` from outside React — a
   re-render clobbers it. Publish the lightmap to the store; the component (`BakedMesh`,
   `Nameplate`) chooses `MeshBasic`/`MeshStandard`. This survives re-renders.
7. **Bake exactly once.** After baking, the spots drop; a *second* bake would capture
   pool-less (dark) walls. `bakeAll` returns early if `store.baked` (guards StrictMode
   double-invoke / stray timers from overwriting good lightmaps).
8. **Lightmaps are diffuse-only — they CANNOT hold view-dependent specular.** Consequences:
   - **Gilt frames**: don't bake them unlit-flat (loses sheen + relief → reads fake). Use
     the 9-slice **photo unlit at true brightness** (`MeshBasic`, `toneMapped: false`) — the
     photo already carries lighting. **Swapping a frame = swapping the photo** (9-slice
     auto-fits any painting size, zero light tuning). This is the "easy frame swap" goal.
   - **Nameplate (brass)**: keep it a **lit `MeshStandard`** (envMap reflection = sheen,
     normalMap = engraving relief) + a soft top-shade painted into the texture. Baking it
     unlit made it flat/pale. `nameplateBrightness` (envMapIntensity) is a live knob.
9. **N8AO is the source of the grain/shimmer.** It's a real-time screen-space AO, and it is
   **expensive**: measured on prod (baked scene) at `quality="high"` + `halfRes={false}` it
   cost ~11 ms/frame (8.3 → 19.5 ms) — over half the frame budget, and its normal-pass
   doubles draw calls + triangles. We tried `halfRes` to reclaim ~half of that, but the
   upsampled AO had **visibly grainy/ragged edges**, so we kept `quality="high"` +
   `halfRes={false}` (full-res). The cost stays — the real win is the endgame: bake AO into
   the lightmaps and **drop N8AO entirely** (smooth, static, free, stops darkening the art).

## 5. Verification gotchas (for agents)

- **Backgrounded automation tabs throttle/▮pause rAF** → the scene never reveals and the
  bake (if rAF-driven) never fires. Poll the bake via `setTimeout` (fires backgrounded).
  Fresh page loads frequently **stall** in an automation tab — verify in a **foreground**
  browser, or drive frames via `window.__r3f.advance()` + hide the reveal overlay.
- **HMR duplicates the zustand store module** → the baker writes lightmaps into one store
  instance while components read another (so meshes don't switch). **Hard-reload** for a
  single clean module graph; don't trust HMR for store-coupled changes.
- **`window.__perfBench(N)`** (in `Perf.tsx`) gives reliable GPU timing — it renders the
  composer N times synchronously and `ctx.finish()`es. Passive fps is meaningless in a
  throttled tab. **Absolute fps drifts with the GPU clock** (downclocks when idle/background);
  only **back-to-back A/B ratios in the same session** are trustworthy. Toggle the 9 spots
  in one call (`perfGroup === "paintingLight"`, `.visible`) to measure their exact cost.

## 6. TODO / endgame (not done yet)

- **Bake AO + contact shadows into the lightmaps** (accumulate a hemisphere of shadow
  lights, one at a time per pit #4) → drop real-time **N8AO** and the faked `FrameShadow`
  decal. Removes the grain, the "N8AO darkens the art" problem, and a per-frame cost.
- **Bake-once → ship the texture (option B, the real endgame).** We currently re-bake at
  every load (option A: cheap, but the 9 spots must exist + render until the bake fires, and
  we redo it every visit). Better: bake in dev, export the lightmap PNGs to `/public`, load
  them in prod (set `store.baked` on load) → zero visitor bake cost, and the picture lights
  never need to exist in prod. Watch the 8-bit **linear** color-space pit when encoding PNGs
  (the RTs are `LinearSRGBColorSpace`; load back with the same, don't let the decoder sRGB it).
- **Non-planar geometry** (curved walls, furniture, plants) needs a `uv2` unwrap (xatlas) to
  be lightmapped. Walls/floor are planes, so they don't.
- Package as a reusable `<BakedRoom>` wrapper once the above settle.
