"use client";

import { useEffect, useMemo, useState } from "react";
import { useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { TextureLoader } from "three";

// Slice lines in UV space (the four edges of the frame's opening).
interface Slice {
  su0: number; // opening left   (U)
  su1: number; // opening right  (U)
  vBottom: number; // opening bottom (V, origin bottom-left)
  vTop: number; // opening top    (V)
}

// Find the frame's opening by the bounding box of the transparent centre. Works
// only for same-origin images (our /public assets). Returns null if the image
// has no transparent region (e.g. a flat JPG) — caller should pass insets then.
function detectOpening(img: HTMLImageElement): Slice | null {
  const W = img.naturalWidth || img.width;
  const H = img.naturalHeight || img.height;
  if (!W || !H) return null;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, W, H).data;
  } catch {
    return null; // tainted canvas
  }
  let minX = W,
    minY = H,
    maxX = 0,
    maxY = 0,
    found = false;
  const step = Math.max(1, Math.floor(Math.min(W, H) / 320));
  for (let y = 0; y < H; y += step) {
    for (let x = 0; x < W; x += step) {
      if (data[(y * W + x) * 4 + 3] < 40) {
        found = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (!found || maxX <= minX || maxY <= minY) return null;
  return {
    su0: minX / W,
    su1: maxX / W,
    vTop: 1 - minY / H, // image top → high V (flipY textures)
    vBottom: 1 - maxY / H,
  };
}

// Build the 8-quad border (4 fixed corners + 4 stretched edges) around a pw×ph
// opening, mapping each region to the matching slice of the texture. The centre
// is left empty so the painting shows through.
function buildNineSlice(pw: number, ph: number, frameWidth: number, rebate: number, s: Slice): THREE.BufferGeometry {
  const aX = pw / 2 - rebate;
  const aY = ph / 2 - rebate;
  const bX = aX + frameWidth;
  const bY = aY + frameWidth;

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let vi = 0;
  const quad = (x0: number, x1: number, y0: number, y1: number, u0: number, u1: number, v0: number, v1: number) => {
    positions.push(x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y1, 0);
    uvs.push(u0, v0, u1, v0, u1, v1, u0, v1);
    indices.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
    vi += 4;
  };

  const { su0, su1, vBottom, vTop } = s;
  // corners (fixed size, never distort)
  quad(-bX, -aX, aY, bY, 0, su0, vTop, 1); // top-left
  quad(aX, bX, aY, bY, su1, 1, vTop, 1); // top-right
  quad(-bX, -aX, -bY, -aY, 0, su0, 0, vBottom); // bottom-left
  quad(aX, bX, -bY, -aY, su1, 1, 0, vBottom); // bottom-right
  // edges (stretched along their length)
  quad(-aX, aX, aY, bY, su0, su1, vTop, 1); // top
  quad(-aX, aX, -bY, -aY, su0, su1, 0, vBottom); // bottom
  quad(-bX, -aX, -aY, aY, 0, su0, vBottom, vTop); // left
  quad(aX, bX, -aY, aY, su1, 1, vBottom, vTop); // right

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

export interface NineSliceFrameProps {
  texture: THREE.Texture;
  pw: number;
  ph: number;
  frameWidth?: number; // world thickness of the border (uniform on all sides)
  rebate?: number; // how much the inner edge overlaps the painting
  insets?: Slice; // override auto-detection (for JPGs with no alpha)
}

export function NineSliceFrame({ texture, pw, ph, frameWidth = 0.09, rebate = 0.012, insets }: NineSliceFrameProps) {
  const [slice, setSlice] = useState<Slice | null>(insets ?? null);

  useEffect(() => {
    if (insets) {
      setSlice(insets);
      return;
    }
    const img = texture.image as HTMLImageElement | undefined;
    if (img) setSlice(detectOpening(img) ?? { su0: 0.14, su1: 0.86, vBottom: 0.14, vTop: 0.86 });
  }, [texture, insets]);

  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    texture.needsUpdate = true;
  }, [texture]);

  const geo = useMemo(() => (slice ? buildNineSlice(pw, ph, frameWidth, rebate, slice) : null), [pw, ph, frameWidth, rebate, slice]);
  const mat = useMemo(
    () => new THREE.MeshBasicMaterial({ map: texture, transparent: true, alphaTest: 0.1, toneMapped: false, side: THREE.DoubleSide }),
    [texture],
  );

  if (!geo) return null;
  return <mesh geometry={geo} material={mat} position={[0, 0, 0.006]} />;
}

// URL wrapper: loads the texture (suspends) then renders the 9-slice frame.
export function NineSliceFrameFromURL({
  url,
  pw,
  ph,
  frameWidth,
  rebate,
  insets,
}: { url: string } & Omit<NineSliceFrameProps, "texture">) {
  const texture = useLoader(TextureLoader, url);
  return <NineSliceFrame texture={texture} pw={pw} ph={ph} frameWidth={frameWidth} rebate={rebate} insets={insets} />;
}

// A throwaway gold frame with a transparent centre + corner markers, drawn to a
// canvas. Used only to prove the 9-slice mechanism before real photos arrive.
let _placeholder: THREE.Texture | null = null;
export function getPlaceholderFrameTexture(): THREE.Texture {
  if (_placeholder) return _placeholder;
  const S = 512;
  const b = 88; // border px
  const cv = document.createElement("canvas");
  cv.width = S;
  cv.height = S;
  const ctx = cv.getContext("2d")!;
  ctx.clearRect(0, 0, S, S);
  const grad = ctx.createLinearGradient(0, 0, S, S);
  grad.addColorStop(0, "#e9cd7c");
  grad.addColorStop(0.5, "#b8902f");
  grad.addColorStop(1, "#6f561c");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, S, S);
  ctx.clearRect(b, b, S - 2 * b, S - 2 * b); // punch transparent opening
  ctx.strokeStyle = "rgba(255,246,214,0.95)";
  ctx.lineWidth = 5;
  ctx.strokeRect(b - 7, b - 7, S - 2 * (b - 7), S - 2 * (b - 7));
  ctx.strokeStyle = "rgba(70,50,14,0.85)";
  ctx.lineWidth = 4;
  ctx.strokeRect(9, 9, S - 18, S - 18);
  ctx.fillStyle = "#fff4c4";
  ([
    [b / 2, b / 2],
    [S - b / 2, b / 2],
    [b / 2, S - b / 2],
    [S - b / 2, S - b / 2],
  ] as [number, number][]).forEach(([x, y]) => ctx.fillRect(x - 13, y - 13, 26, 26));
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  _placeholder = tex;
  return tex;
}
