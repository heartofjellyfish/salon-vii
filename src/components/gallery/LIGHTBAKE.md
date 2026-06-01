# Gallery lighting & shadows — the recipe for every room (design, recipe, pits)

> _Last updated: 2026-06-01._
>
> **This is the canonical lighting/shadow recipe — build every new room on it.** A gallery
> room's lighting is **static** (lights and geometry never move), so nothing here is computed
> per frame. Three pillars, each replacing a real-time cost with a baked/painted one:
>   1. **Lightmaps** capture the picture-light pools → walls/floor draw unlit (§1–§2).
>   2. **Static shadow decals** replace real-time screen-space AO (N8AO is gone) (§3).
>   3. **Tone-mapping discipline**: one Reinhard exposure; know what is and isn't tone-mapped (§4).
>
> Read this before touching `LightmapBake.tsx`, `lightmapStore.ts`, `BakedMesh.tsx`, the
> `*Shadow.tsx` decals, the picture-light / frame / nameplate / crown materials, or
> `src/lib/lighting.ts`. It is the distilled result of several long, painful sessions — every
> gotcha below cost real time. New rooms should reuse this system, not re-derive it.

## 1. The lightmap win — bake the static lights, draw unlit

Static lights on static geometry. The nine per-painting **SpotLights were the scene's #1 GPU
cost** — each shaded every fragment of the fill-rate-bound room every frame (~40–50% of the
frame; removing them took roam ~84 → ~141 fps). Their only visible output is a warm **pool on
the wall/floor** and a **glint on the gilt frame**, and they never move. So: bake the diffuse
pool once, draw the surfaces **unlit**, drop the real lights.

The baker runs **in-browser on every load** (always mounted, no longer gated behind
`?lightbake`). It used to be gated → **production never baked** → all 9 spotlights ran → ~10
fps on a mid GPU. Now each load bakes a cheap burst of ortho renders under the reveal overlay,
then drops the spots. (Shipping pre-baked PNGs to skip even that is the remaining endgame, §6.)

## 2. The one idea that made it work: capture, don't reconstruct

We first tried to **reconstruct** the spotlight analytically (cone smoothstep + decay + N·L +
albedo + a tone-mapped base term, as an additive decal). Tar pit: shape/brightness/hue/colour-
space never lined up, plus an sRGB double-decode bug and the fundamental
"tonemap(a+b) ≠ tonemap(a)+tonemap(b)" problem. **Abandon analytic reconstruction.**

What works (industry standard = **lightmaps**): render a **white probe** at each surface, lit
by the **real lights**, into a RenderTarget. That texture *is* the exact lighting — no maths to
match. Use it as `lightMap`; faithful by construction, free at runtime (unlit = no light loop).
Pieces: `LightmapBake.tsx` (ortho cam + white probe + RT), `lightmapStore.ts` (zustand store
keyed by surface id), `BakedMesh.tsx` (a plane that is `MeshStandard` until baked, then unlit
`MeshBasic(map × lightMap)`).

## 3. Static shadow decals — the AO replacement (N8AO is removed)

Real-time **N8AO cost ~13 ms/frame** on a mid GPU (over half the budget; prod 21.5→8.3 ms
when off), doubled draw calls via its normal pass, **bypassed Reinhard so the scene rendered
too bright** (see §4), grained the edges, and **darkened the artwork**. Every shadow it drew is
static, so we paint each one once as a **multiply-blend decal** and deleted the EffectComposer.
(`?ao=on` still mounts it as a live A/B reference; default off.)

**The multiply trick (all decals share it).** A transparent plane with `CustomBlending`
`Zero`/`SrcColor` → output `dst × src`: where the shader writes white the surface is unchanged,
where it writes <1 the surface is darkened **multiplicatively**, so the wallpaper damask / rug
pattern / wood grain shows *through* the shadow instead of flattening to grey. `depthWrite:
false`; nudge the decal a hair off its surface to avoid z-fighting. This is the same technique
as the original per-frame `FrameShadow` drop-shadow.

The decal components (each reads its strength/fade live from the tuning store):
- **`ContactShadow`** — a **rounded-rectangle** floor blob grounding a piece of furniture (the
  daybed). Rounded-box SDF, not a radial gradient: a rectangular object casts a rectangular
  contact shadow. Knobs: strength, width×depth (the footprint), feather, corner radius, x/z.
- **`WallShadow`** — one per wall, an **edge vignette**: darkens near the **top** (ceiling/cove
  seam), the **two vertical sides** (corners), and the **bottom** (baseboard). Fades are given
  in **metres** (converted to the wall's 0..1 UV) so a band is the same thickness on every wall.
- **`PerimeterShadow`** — a horizontal **perimeter vignette** for the ceiling and the floor:
  darkens near the outer edges, fades to nothing toward the centre (so the sky oculus and the
  rug stay untouched). One instance under the ceiling (crown↔ceiling AO), one above the floor
  (floor↔baseboard AO).

Why three concave seams need *both* `WallShadow` (top) **and** `PerimeterShadow` (ceiling): the
proud crown moulding stands in front of the wall, so the wall-top darkening is occluded by it —
the ceiling side of that seam needs its own decal.

## 4. Brightness & tone-mapping (the trap that made the room "too bright/too dark")

The renderer uses **Reinhard** tone-mapping with one `exposure` (`ACTIVE_LIGHTING.exposure`,
live via `?tune` Mood → exposure). Two hard-won facts:

- **An `EffectComposer` with no `ToneMappingEffect` bypasses Reinhard.** While N8AO's composer
  was mounted, the whole scene rendered un-tone-mapped → **~1.3× brighter**. People got used to
  that look. Deleting the composer restored Reinhard (darker); to keep the brightness we **re-
  baked it into exposure (0.4 → 1.05)**, calibrated by matching the **wall mid-tone luminance**
  to the `?ao=on` reference (full-frame mean under-reads, because the bright version clips
  highlights). Lesson: if you add/remove postprocessing, re-check exposure.
- **`toneMapped: false` materials ignore exposure entirely.** The gilt frames, the gold
  ring/crown moulding, and the cove light strip are unlit photo/additive materials output raw.
  So when the walls got brighter (exposure ↑), the crown moulding stayed put and read
  *relatively* dim. Fix: a **`crownBright`** multiplier on its material colour (a `MeshBasic`
  colour >1 brightens the map). Anything `toneMapped:false` needs its own brightness knob — it
  won't follow the exposure.

## 5. Recipe for a NEW room

1. **Surfaces:** build walls/floor with `<BakedMesh id="…" width height map …/>` (planes; their
   own 0..1 UV is the lightmap UV — no unwrap). The albedo keeps its own `texture.repeat` so the
   wallpaper stays crisp while the low-res lightmap holds the smooth lighting.
2. **Bake:** mount `<LightmapBake/>` (always-on). It polls until albedo has loaded **and the
   picture spots are aimed** (pit #5), bakes each surface once, publishes a `lightMap`. The real
   picture lights render until `store.baked`, then drop.
3. **Shadow decals:** place `ContactShadow` under each freestanding object, one `WallShadow` per
   wall (matched size/position, nudged into the room, `renderOrder = -1` so props/plants composite
   over it — see pit #11), and two `PerimeterShadow`s (under the ceiling, above the floor).
4. **Brightness:** set the room's `exposure` in `src/lib/lighting.ts`; add a brightness knob for
   any `toneMapped:false` decoration (crown, etc.) that should track the walls.
5. **Tune by hand:** every shadow/brightness value is a live `?tune` knob (folders: Mood, Sofa
   shadow, Wall shadows). Dial against `?ao=on` (the old AO look) or by eye, then bake the values
   into `TUNING_DEFAULTS`. The store reads identical to those defaults when the panel is absent,
   so normal visitors never load leva.

## 6. The pits (each one cost us)

1. **`lightMapIntensity = π`.** three's lightMap energy convention. With π, unlit
   `MeshBasic(map × lightMap)` matches a `MeshStandard` diffuse surface lit by the same lights;
   without it the pool reads ~3× too dim.
2. **Colour space.** Bake with `NoToneMapping` + RT as `LinearSRGBColorSpace` → you capture
   **linear irradiance**. The unlit wall (`MeshBasic`, `toneMapped: true`) re-applies the room's
   exposure+Reinhard. Don't bake albedo into the lightmap or it goes soft.
3. **three light layers test against the CAMERA only — there is NO per-object light masking.**
   You cannot make a light "illuminate only the frames, not the walls." A whole reverted attempt
   died on this. Verified in three r184 source.
4. **Shadow maps blow the texture-unit budget.** `castShadow` on 9 spots → 9 samplers → exceeds
   `MAX_TEXTURE_IMAGE_UNITS(16)` → shaders fail → **black screen**. Never enable shadows on many
   lights at once.
5. **Bake-timing race ("black walls").** A `SpotLight`'s `.target` is set in a **ref callback**;
   if the bake fires first, the cone points at the origin → walls bake **dark**. Fix: the baker
   waits until a picture spot's `target.position` is off-origin (`lengthSq > 0.25`).
6. **Durable React integration.** Don't mutate `mesh.material` from outside React — a re-render
   clobbers it. Publish to the store; the component chooses `MeshBasic`/`MeshStandard`.
7. **Bake exactly once.** After baking, the spots drop; a second bake captures pool-less (dark)
   walls. `bakeAll` returns early if `store.baked`.
8. **Lightmaps are diffuse-only — no view-dependent specular.** Gilt frames: use the 9-slice
   **photo unlit at true brightness** (`MeshBasic`, `toneMapped:false`) — swapping a frame =
   swapping the photo. Nameplate (brass): keep it a **lit `MeshStandard`** (envMap sheen +
   normalMap relief); baking it unlit made it flat. `nameplateBrightness` is a live knob.
9. **Shadow decals multiply — keep them subtle and tune the FADE in metres.** Overlapping decals
   (corner + cove + base on the same pixel) take the `max`, not the sum, so they don't stack to
   black. A radial gradient looks wrong under a rectangular object — use the rounded-rect SDF.
10. **`PerimeterShadow` centre must reach 0** or it darkens the rug / dims the sky oculus. The
    perimeter vignette fades to fully transparent before the middle.
11. **Corner shadows render OVER the plants** if the decal's `renderOrder` is higher than the
    foliage. The corner plants are transparent (no depth write), so depth alone won't occlude the
    decal. Set `WallShadow renderOrder = -1` → it draws right after the opaque wall but *before*
    the plants, which then composite on top. (It still multiplies the wall correctly.)
12. **`toneMapped:false` decorations don't follow exposure** — give them their own brightness
    multiplier (see §4) or they drift relative to the tone-mapped walls.

## 7. Verification gotchas (for agents)

The Claude Preview harness throttles rAF and stalls fresh R3F loads; the full **unstick + fixed-
pose A/B + luminance-matching recipe** lives in memory `reference_preview_raf_throttling`. Key
points: drive frames with `window.__r3f.advance(t)` in a loop (not just screenshots); pin the
camera with `window.__camFreeze`; live-tune via `window.__tuning.setState` but **await a React
flush** before reading material-rebuild knobs; `window.__perfBench(N)` gives reliable GPU timing
(absolute fps drifts with the GPU clock — only same-session A/B ratios are trustworthy); HMR
duplicates the zustand store, so **restart the dev server** for store-coupled changes and
hard-reload `?tune` (leva won't hot-add knobs). **Verify 3D visuals in a foreground browser.**

## 8. TODO / endgame (not done yet)

- **Bake-once → ship the texture.** We re-bake the lightmaps at every load (cheap, but the 9
  spots must exist + render until it fires). Better: bake in dev, export the lightmap PNGs to
  `/public`, set `store.baked` on load → zero visitor bake cost, spots never exist in prod. Mind
  the 8-bit **linear** colour-space pit when encoding (RTs are `LinearSRGBColorSpace`; load back
  the same, don't let the decoder sRGB them). The shadow decals are already static + free, so no
  export needed for them.
- **Non-planar lightmapping** (curved walls, furniture self-AO) would need a `uv2` unwrap
  (xatlas). Walls/floor are planes, so they don't; furniture relies on the floor `ContactShadow`.
- Package the whole stack (BakedMesh + LightmapBake + the shadow decals + exposure) as a reusable
  `<BakedRoom>` wrapper once a second room exercises it.
