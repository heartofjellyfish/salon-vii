# Gallery Controls Spec

The current interaction model for the 3D gallery (`/gallery`), written as the
starting point for a dedicated **controls** session covering mouse, keyboard, and
mobile (iPad / iPhone).

_As of 2026-05-27 (main @ `36abae3`). **Mouse, keyboard, and touch are all
implemented**: desktop drives it with keyboard + mouse (drag / click + the bottom
buttons); touch (iPhone / iPad) uses direct-manipulation gestures (drag / pinch /
tap / swipe). Each is detailed below._

---

## Modes & phases

- **Guided (导览)** vs **Free / unguided (自由)** — switched by the toggle button at
  bottom-right. Default is **Free**.
- **Free mode** moves through three *phases*, which determine what the keys do and
  which control hint is shown:
  | phase | meaning |
  |---|---|
  | `roam` | walking the room; whole frames + nameplates visible |
  | `entry` | just crossed into "look closely" — the whole frame fills the screen |
  | `cropped` | zoomed onto the painting surface (frame is cropped off-screen) |
- **Guided mode** is an auto-advancing tour: no keyboard camera control; on-screen
  prev / next buttons + progress dots, auto-advance every 12 s, per-painting
  narrative panel.

The room↔inspect boundary is measured per-painting as a multiple of each work's
"fit distance" (the whole framed work just filling the screen), so it behaves the
same for any size/aspect. `FIT_MARGIN = 1.18`; "frame just cropped" ≈ ratio
`1 / FIT_MARGIN ≈ 0.847`.

---

## Keyboard (Free mode only)

| phase | key | action |
|---|---|---|
| roam | `←` / `→` | move to the previous / next painting (walk around the walls) |
| roam | `↑` | step closer (dolly through room stops); at the closest stop, **cross into inspect** |
| roam | `↓` | step back (dolly out through room stops) |
| roam | `Esc` | **return to the entry view** — the start anchor at room-overview distance |
| entry | `↑` | lean onto the painting **surface** (zoom in until the frame is cropped) |
| entry | `↓` | **exit** inspect, back to the room (frame + nameplate) |
| entry / cropped | `+` / `−` | zoom in / out (see zoom behaviour below) |
| entry / cropped | `Esc` | exit inspect (back to the room) |
| cropped | `↑` `↓` `←` `→` | **pan** the magnifier across the surface |

Key nuances (all in `AnchorControls`):
- **Holding `↑` from the room stops at the inspect entry (first frame)** and stays
  there until released (a `swallowUp` flag swallows the held key). A *fresh* `↑`
  then leans to the surface; once cropped, `↑` pans. The surface-vs-pan switch is
  decided off the **immediate target zoom ratio** (`> 1/FIT_MARGIN` = frame still
  whole), not the eased camera, so panning engages instantly.
- **`+` / `−` zoom**: a **tap** (< `TAP_MS` = 200 ms) snaps one clean notch
  (`×/÷ NOTCH`, NOTCH = 1.8); a **hold** glides continuously (`ZOOM_RATE` e-folds/s,
  ≈1.4 s full hold). Zoom-**in eases to a stop at the painting's 1:1 crisp limit**
  (never magnifies past the resident texture); zoom-**out past the whole frame
  exits** inspect.
- `↑` / `+` from the room only crosses into inspect when at the **closest** room
  stop.

---

## Mouse

| where | action |
|---|---|
| room (roam) | **drag** left/right to move between paintings (pointer drag; disabled while inspecting) |
| any painting | **click** → opens a full-screen 2D **lightbox** (desktop / guided; on **touch** a tap *looks closely* instead — see Touch) |
| lightbox | click the backdrop or the **×** to close |
| control panel (bottom) | **hold** `−` / `+` to zoom (tap = notch); click **▦** to toggle the thumbnail, **♪** to toggle ambient music |
| bottom-right | **mode toggle** button (Free ↔ Guided) |
| guided mode | prev / next buttons + progress dots (bottom-centre) |

---

## Control panel (bottom-centre)

Lives in `ControlBar` (`page.tsx`). **Hidden by default** so nothing sits over the
artwork while viewing.

- **Reveal** when any of: the cursor comes near the bottom edge
  (`clientY > innerHeight − 120`), a brief flash on entering Free mode, or a flash
  whenever the **phase changes** (the keys change meaning). It recedes after the
  ~4.2 s flash or when the cursor leaves the bottom. **(Desktop only — on touch the
  bar stays up so the buttons are always reachable; see Touch.)**
- **Fixed button positions** — the buttons are a constant row (zoom `−`, zoom `+`,
  thumbnail `▦`, music `♪`/`♫`) that occupies the **same slots in every phase**, so muscle memory
  holds (zoom never jumps). Controls that don't apply in the current phase **dim in
  place** rather than disappearing. The per-phase **key hints** sit on a separate
  line *above* the buttons and update without shifting them.
- **Thumbnail (minimap) toggle** — the "you are here" minimap is no longer forced
  on; it defaults **on** during inspect and the `▦` button hides/shows it.
- **Music switch** — a `♪`/`♫` button in the row toggles a looping ambient
  soundtrack (off by default; volume eases in/out, the click being the user gesture
  browsers require to start audio). Unlike the zoom/thumbnail buttons it is **always
  active**, not gated on inspect. One **fixed slot** remains reserved for the
  **curator's note**.

---

## Touch / mobile (iPhone / iPad)

Detected by a **coarse pointer** (`isTouch`; force with `?touch`). The model mirrors
desktop — room → look closely → pan/zoom → exit — expressed with native gestures:

| where | gesture | action |
|---|---|---|
| room | one-finger horizontal drag | walk between paintings |
| room | **tap a painting** | walk to it and look closely (no flat lightbox on touch) |
| inspect | one-finger drag | pan the magnifier across the surface |
| inspect | **two-finger pinch** | zoom in / out (clamped to the 1:1 crisp limit) |
| inspect | **swipe down** or a hard pinch-in | exit back to the room |
| controls | `−` `+` `▦` `♪` `×` buttons | zoom, thumbnail, music, exit — larger tap targets |

- Inspect pan/pinch are gated to **touch + pen**, so a desktop mouse is unaffected.
- The control bar **stays up** on touch (no hover to summon it back), sat a row
  higher so its right button clears the mode toggle, with **gesture-text hints** per
  phase (`TOUCH_HINTS`) instead of key pills. The hint line still only flashes so it
  isn't over the work while you examine it.
- A `viewport` meta blocks browser page-zoom over the canvas (`viewport-fit:cover`);
  the persistent controls respect `env(safe-area-inset-*)`.
- Device-adaptive: the hi-res cap (`pickHiResWidth`, phone → 2048) and the
  deepest-zoom 1:1 clamp mean a phone pinch only zooms as far as stays crisp.

### Touch ideas not yet done (open for the controls session)
- **Double-tap** to zoom in one step (Photos/Maps convention).
- **Swipe left/right** to jump straight to the adjacent painting (today it's a
  one-finger drag-walk).
- Momentum / rubber-band polish on the pinch and swipe.
- iPad-specific affordances (more screen, Pencil) vs the small iPhone layout.

---

## Implementation map (where to edit)

- **`src/components/gallery/GalleryScene.tsx` → `AnchorControls`** — the camera
  controller. Keyboard handler (`onKey` / `onKeyUp` / `onBlur`), the pointer/touch
  **gesture** handler (one-finger drag-walk / pan, two-finger pinch, swipe-down or
  pinch-in to exit — a `gesture` state machine), and the `useFrame` that integrates
  dolly / pan / continuous zoom and reports the **phase** via `onPhaseChange`.
  Exposes `inspectApi = { setZoomDir, exit, inspectIndex }`. Tunables (module consts): `VIEW_DIST`, `ROOM_OUT`, `FIT_MARGIN`,
  `DEEPEST_RATIO`, `ZOOM_RATE`, `TAP_MS`, `NOTCH`, `SURFACE_RATIO`. Refs that hold
  the interaction state: `inspectRatio`, `zoomDir`, `pressDir`, `swallowUp`,
  `minRatio`, `roomIdx`, `heldKeys`.
- **`src/app/gallery/page.tsx`** — all the DOM UI and state: `ControlBar` +
  `CONTROL_HINTS` (desktop key pills) + `TOUCH_HINTS` (gesture text), the
  `controlPhase` / `hintsOn` / `nearBottom` / `showMinimap` / `isTouch` / `musicOn`
  state and the mousemove + flash `useEffect`s, the music toggle
  (`handleToggleMusic`, `fadeAudio`), `InspectMinimap`, the lightbox, the mode
  toggle, the guided-mode prev/next/dots, and the `?debug` HUD (`DebugHUD`,
  `?debug=1`).
- **`src/components/gallery/Painting.tsx`** — `pickHiResWidth` (device-adaptive
  texture width) and the per-painting `texWidth` reported into `paintingDimsRef`,
  which feeds the 1:1 zoom clamp.
- **`src/lib/music.ts`** — the ambient-audio singleton (lazy `getMusic()`, looping)
  and the "armed on entry" flag the `♪` toggle and the entrance use.

---

## Design principles (must preserve)

1. **Fixed control positions** — never move an interactive button between states;
   users build muscle memory. Dim-in-place; update text hints separately.
2. **Minimal distraction** — no control chrome over the artwork by default; reveal
   on demand, then recede.
3. **Smooth, eased, keyboard-first** motion; mode changes should be *perceptible*
   (a felt transition + a brief cue).
4. **No progressive blur during examination** — the inspected work is preloaded and
   cross-faded; quality must not visibly resolve while you're looking. Deepest zoom
   is clamped so it never magnifies past 1:1.
