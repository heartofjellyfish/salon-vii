"use client";

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useLightmapStore } from "./lightmapStore";

// ─────────────────────────────────────────────────────────────────────────────
// In-browser lightmap baker (proof of concept → reusable tool).
//
// Static lights on static geometry is a solved problem: bake the lighting into a
// texture once, then draw the surface UNLIT (no per-frame light loop). The picture
// spotlights are the scene's #1 cost precisely because they shade every wall/floor
// fragment every frame — so we bake their (diffuse) contribution and stop paying it.
//
// How a surface is baked:
//   • an orthographic camera is placed face-on to the surface,
//   • a WHITE probe plane (same transform) is rendered, lit by the real scene lights,
//     with tone-mapping OFF → the RenderTarget holds the surface's *linear irradiance*
//     (the "lighting", with albedo factored out: white × light = light),
//   • the surface is swapped to MeshBasic(map = its albedo, lightMap = that RT). Final
//     pixel = tonemap(albedo × irradiance) — identical to the lit MeshStandard, but the
//     material is unlit so it costs nothing and ignores the (soon-removed) real lights.
//
// Diffuse only — that's all a lightmap can hold. Matte walls/floor are pure diffuse,
// so the bake is exact. Specular/metallic surfaces (gilt frames) are handled
// separately (pre-lit textures / a little real-time spec), never via lightmap.
//
// Opt-in: tag a planar mesh `userData={{ lightbake: true }}` (see Room.tsx). Runs
// once with `?lightbake`. The plane's own 0..1 UV is the lightmap UV (no unwrap needed
// for planes); the albedo map keeps tiling independently via its texture.repeat.
// ─────────────────────────────────────────────────────────────────────────────

const BAKE_LAYER = 31; // scratch layer the bake camera + probe + lights share

// Smooth lighting needs little resolution; keep the long edge here.
const LM_LONG_EDGE = 512;

type Bakeable = THREE.Mesh & { geometry: THREE.PlaneGeometry };

function bakeSurface(gl: THREE.WebGLRenderer, scene: THREE.Scene, mesh: Bakeable) {
  mesh.updateWorldMatrix(true, false);
  const params = mesh.geometry.parameters as { width: number; height: number };
  const w = params.width, h = params.height;
  if (!w || !h) return;

  const center = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  mesh.getWorldPosition(center);
  mesh.getWorldQuaternion(quat);
  const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(quat).normalize();
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(quat).normalize();

  // Ortho camera face-on to the surface, framing exactly the plane.
  const dist = 3;
  const cam = new THREE.OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, 0.01, dist * 2);
  cam.position.copy(center).addScaledVector(normal, dist);
  cam.up.copy(up);
  cam.lookAt(center);
  cam.layers.set(BAKE_LAYER);

  // White diffuse probe at the surface's pose → renders pure irradiance. receiveShadow
  // so occluders (frames standing proud of the wall, furniture) cast real contact
  // shadows into the lightmap — see the shadow setup in bakeAll.
  const probeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  const probe = new THREE.Mesh(new THREE.PlaneGeometry(w, h), probeMat);
  probe.position.copy(center);
  probe.quaternion.copy(quat);
  probe.receiveShadow = true;
  probe.layers.set(BAKE_LAYER);
  scene.add(probe);

  // RenderTarget sized to the surface aspect; LINEAR so it can be used as a lightMap.
  const aspect = w / h;
  const rtW = aspect >= 1 ? LM_LONG_EDGE : Math.round(LM_LONG_EDGE * aspect);
  const rtH = aspect >= 1 ? Math.round(LM_LONG_EDGE / aspect) : LM_LONG_EDGE;
  const rt = new THREE.WebGLRenderTarget(rtW, rtH, {
    colorSpace: THREE.LinearSRGBColorSpace,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: true,
  });

  const prevTarget = gl.getRenderTarget();
  gl.setRenderTarget(rt);
  gl.clear();
  gl.render(scene, cam);
  gl.setRenderTarget(prevTarget);

  // Publish the lightmap to the store; <BakedMesh id> reads it and switches that
  // surface to unlit MeshBasic(map × lightMap) inside React (so it survives re-render).
  const lm = rt.texture;
  lm.channel = 0; // use the plane's own 0..1 UV (not the albedo's tiled UV)
  const id = (mesh.userData.lightbake as string) || mesh.uuid;
  useLightmapStore.getState().setMap(id, lm);
  mesh.userData.lightbaked = true;

  // tear down scratch objects
  scene.remove(probe);
  probe.geometry.dispose();
  probeMat.dispose();
}

function bakeAll(gl: THREE.WebGLRenderer, scene: THREE.Scene) {
  // Bake exactly once. After the first bake the picture spotlights are dropped
  // (baked=true), so a second bake would capture pool-less (dark) walls — guard against
  // re-entry (StrictMode double-invoke, stray timers) overwriting good lightmaps.
  if (useLightmapStore.getState().baked) return false;

  const surfaces: Bakeable[] = [];
  const lights: THREE.Light[] = [];
  scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && o.userData?.lightbake && !o.userData?.lightbaked) {
      surfaces.push(o as Bakeable);
    }
    if ((o as THREE.Light).isLight) lights.push(o as THREE.Light);
  });
  if (surfaces.length === 0) return false;

  // A light is only collected if it shares a layer with the camera; the bake camera
  // lives on BAKE_LAYER, so let every scene light reach it for the duration.
  lights.forEach((l) => l.layers.enable(BAKE_LAYER));
  const prevToneMapping = gl.toneMapping;
  gl.toneMapping = THREE.NoToneMapping; // capture linear irradiance, not tone-mapped pixels

  for (const mesh of surfaces) bakeSurface(gl, scene, mesh);

  gl.toneMapping = prevToneMapping;
  lights.forEach((l) => l.layers.disable(BAKE_LAYER));
  // Lighting now lives in the lightmaps → the real picture spotlights are redundant.
  // Flag it so they stop rendering (Painting.tsx drops <PaintingLighting>) — that's
  // where the perf win is: the spots no longer shade the whole room every frame.
  useLightmapStore.getState().setBaked(true);
  // eslint-disable-next-line no-console
  console.log(`[lightbake] baked ${surfaces.length} surface(s); picture spotlights dropped`);
  return true;
}

export default function LightmapBake() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let tries = 0;
    // Wait until the tagged surfaces exist and their albedo has loaded, then bake once.
    // Poll via setTimeout (not rAF) so the one-time bake still fires in a backgrounded
    // / headless tab, where rAF is throttled or paused.
    const attempt = () => {
      tries += 1;
      const ready = (() => {
        let found = false, mapped = true, spotsAimed = false;
        scene.traverse((o) => {
          if ((o as THREE.Mesh).isMesh && o.userData?.lightbake && !o.userData?.lightbaked) {
            found = true;
            if (!((o as THREE.Mesh).material as THREE.MeshStandardMaterial).map) mapped = false;
          }
          // The picture spotlights aim at their painting via a ref callback. Until that
          // runs, target.position is the default origin → the cone points at the room
          // centre, not the wall, and the wall lightmap bakes DARK (the floor near origin
          // gets the stray light instead). So only bake once a picture spot is actually
          // aimed (target moved off the origin) — otherwise we capture pool-less walls.
          const sl = o as THREE.SpotLight;
          if (sl.isSpotLight && o.userData?.perfGroup === "paintingLight" && sl.target && sl.target.position.lengthSq() > 0.25) {
            spotsAimed = true;
          }
        });
        return found && mapped && spotsAimed;
      })();
      if (ready) {
        bakeAll(gl, scene);
        return;
      }
      if (tries < 200) timer = setTimeout(attempt, 100);
    };
    const schedule = () => { tries = 0; clearTimeout(timer); timer = setTimeout(attempt, 100); };
    schedule();
    // Re-bake (the ?tune "Re-bake" button / console): clear the baked flag so the real
    // picture/floor lights re-mount with the new ?tune values, then re-run the poll — it
    // waits for them to re-aim before baking, so the new values land in the lightmaps.
    (window as unknown as { __rebake?: () => void }).__rebake = () => {
      useLightmapStore.getState().setBaked(false);
      scene.traverse((o) => { if (o.userData?.lightbake) o.userData.lightbaked = false; });
      schedule();
    };
    return () => clearTimeout(timer);
  }, [gl, scene]);

  return null;
}
