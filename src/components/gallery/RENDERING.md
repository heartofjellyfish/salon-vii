# Gallery rendering — painting material, lighting, AO, resolution

> _Last updated: 2026-05-29._
> The "why" behind how the room is lit and how the art is drawn. These were all
> reverse-engineered from visual bugs; read this before touching `Painting.tsx`,
> `PaintingLighting.tsx`, `lighting.ts`, `quality.ts`, or the N8AO post-process.

## 1. Paintings are unlit, true-colour — always

The painting canvas (`SaturationMaterial` in `Painting.tsx`) is **unlit** in both
roam and inspect. It shows the image at its true, unmodified file colour; the
room's light never tints or dims it. The per-painting **spotlight
(`PaintingLighting.tsx`) lights only the wall pool + the frame**, never the canvas.

- This is a deliberate aesthetic call: the art must read true from across the
  room, like a backlit reproduction. We tried making the canvas a physically-lit
  `MeshStandardMaterial` (room light decides its brightness) — it tinted the art
  warm and dimmed it; **rejected**. Don't reintroduce lit paintings.
- Bonus: unlit is far cheaper (no per-light loop over a full-screen quad on
  inspect), and it removes the roam↔inspect brightness "pop".

### Colour-space gotcha (this one cost the most)
The canvas material **must go through three's built-in colour pipeline**. A
hand-rolled raw `ShaderMaterial` that writes `gl_FragColor` directly **skips the
linear→sRGB output encode**, so the (hardware-decoded, linear) texture is written
raw to the sRGB framebuffer → the image looks **washed out / milky / low-contrast**.

Fix that holds: use a built-in material (`MeshBasicMaterial`) with
`toneMapped = false`. Unlit + tone-map bypassed = exact source pixels, but three
still colour-manages sRGB in/out so it is **not** washed. The base texture must be
tagged `SRGBColorSpace` (hi-res copies the base's colorSpace so the cross-fade
can't shift colour).

### Two effects grafted onto the material
Via `onBeforeCompile` (so we keep three's colour management), the canvas material
carries:
- **hi-res cross-fade** (`hiMix`): eases the inspect hi-res master in over the base.
- **desaturate→colour reveal** (`saturation`): the guided-mode reveal animation.

These uniforms are owned in React and animated every frame; `onBeforeCompile`
just wires the same objects in. **Build the material once and reuse it** — creating
a fresh material when entering inspect recompiles a shader = a visible hitch.

## 2. N8AO contact shadows — a sharp tool

N8AO (screen-space AO, in `GalleryScene.tsx`) is the room's "natural black" under
furniture / in corners. It is easy to make it look like grime:

- **`aoRadius` too large** in this small room darkens whole wall faces → reads as a
  dirty film over everything. Keep it small (~0.85).
- **`halfRes`** computes AO at half resolution → noisy, shimmers as the camera
  moves. Keep it off; keep `enableNormalPass` on (depth-derived normals are noisy).
- It darkens the **canvas/frame depth seam** into a dirty black fringe around a
  painting at the frame-fill inspect view → **set AO intensity to 0 while
  inspecting** (a flat canvas gains nothing from AO). Keep the composer mounted
  (don't unmount) so there's no render-target realloc on inspect entry.
- `?ao=off` disables the whole pass for A/B.

## 3. Resolution policy (DPR) and the inspect hitch

`quality.ts` caps render DPR (the scene is fill-rate bound). **Keep inspect DPR
equal to roam DPR.** Changing DPR on inspect entry forces the renderer to
reallocate the framebuffer **and all post-processing targets** — a one-frame hitch
every time you walk up to a work. Close-up sharpness comes from the painting's own
**hi-res texture**, not from DPR, so holding DPR constant costs nothing visible.

(The remaining inspect-entry cost is the hi-res texture decode + GPU upload, which
is inherent to loading detail on demand.)

## 4. Lighting model & the `?tune` panel

Room brightness is layered (`lighting.ts` presets; active = `eveningSalon`):
- **`exposure`** — global brightness (tone-mapping exposure). Note: unlit paintings
  bypass it (see §1), so it only affects the room, not the art.
- **`ambient` / `hemi`** — directionless fill. Raise → greys/lifts the darks;
  **lower → deeper, moodier shadows.**
- **picture spotlight** (`PaintingLighting`) — `intensity` / `angle` (pool size) /
  `penumbra` (edge softness) / colour of the wall pool around each work.
- **N8AO** — crevice black (see §2).

`?tune` mounts a **code-split leva panel** (`TuningPanel.tsx`, driven by the
`tuningStore` zustand store) that drives all of the above **live**. It is loaded
only with `?tune`, so normal visitors never download leva. Workflow: dial it in
with the panel, then bake the numbers back into `TUNING_DEFAULTS`
(`tuningStore.ts`) and the `eveningSalon` preset — those are the source of truth
for what visitors see.
