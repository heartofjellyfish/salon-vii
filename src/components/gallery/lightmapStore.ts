"use client";

import { create } from "zustand";
import type * as THREE from "three";

// Durable home for baked lightmaps. The baker publishes a texture per surface id;
// <BakedMesh> reads it and switches that surface to unlit MeshBasic(map × lightMap).
// Keeping the texture in a store (not on mesh.material) is what makes the swap
// survive React re-renders — mutating mesh.material directly gets clobbered.
interface LightmapState {
  maps: Record<string, THREE.Texture>;
  baked: boolean; // true once the room's lighting is baked (or pre-baked maps loaded)
  setMap: (id: string, tex: THREE.Texture) => void;
  setBaked: (b: boolean) => void;
  clear: () => void;
}

export const useLightmapStore = create<LightmapState>((set) => ({
  maps: {},
  baked: false,
  setMap: (id, tex) =>
    set((s) => (s.maps[id] === tex ? s : { maps: { ...s.maps, [id]: tex } })),
  setBaked: (b) => set({ baked: b }),
  clear: () => set({ maps: {}, baked: false }),
}));

if (typeof window !== "undefined") {
  (window as unknown as { __lightmaps?: typeof useLightmapStore }).__lightmaps = useLightmapStore;
}

// three's lightMap is energy-scaled; π reproduces a MeshStandard diffuse surface lit
// by the same lights exactly (verified in the same-camera A/B). Bake one, set this.
export const LIGHTMAP_INTENSITY = Math.PI;
