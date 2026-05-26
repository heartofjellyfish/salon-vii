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

// Find the frame's opening. Tries the transparent centre first (PNG with alpha),
// then falls back to a near-white centre (flat JPG) by expanding outward from the
// image centre until it hits the frame. Same-origin images only (/public assets).
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
  const at = (x: number, y: number) => {
    const i = (y * W + x) * 4;
    return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] };
  };

  // 1) transparent centre → global bbox of alpha<40 pixels
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

  // 2) white centre → expand from the middle while pixels stay near-white
  if (!found) {
    const cx = (W / 2) | 0;
    const cy = (H / 2) | 0;
    const white = (x: number, y: number) => {
      const p = at(x, y);
      return p.a > 200 && p.r > 236 && p.g > 236 && p.b > 236;
    };
    if (!white(cx, cy)) return null;
    let l = cx,
      r = cx,
      t = cy,
      b = cy;
    while (l > 0 && white(l - 1, cy)) l--;
    while (r < W - 1 && white(r + 1, cy)) r++;
    while (t > 0 && white(cx, t - 1)) t--;
    while (b < H - 1 && white(cx, b + 1)) b++;
    minX = l;
    maxX = r;
    minY = t;
    maxY = b;
    found = true;
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
function buildNineSlice(pw: number, ph: number, frameWidth: number, rebate: number, s: Slice, zFront = 0): THREE.BufferGeometry {
  const aX = pw / 2 - rebate;
  const aY = ph / 2 - rebate;
  const bX = aX + frameWidth;
  const bY = aY + frameWidth;

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let vi = 0;
  const quad = (x0: number, x1: number, y0: number, y1: number, u0: number, u1: number, v0: number, v1: number) => {
    positions.push(x0, y0, zFront, x1, y0, zFront, x1, y1, zFront, x0, y1, zFront);
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
  geo.computeVertexNormals(); // flat quads → +Z normals, so the lit material works
  return geo;
}

// The frame's real thickness: vertical walls from the wall (z=0) out to the
// front face (z=depth), both the outer sides and the inner rebate. These catch
// the room light on one side and fall into shadow on the other, so the frame
// reads as a solid object standing off the wall — not a flat sticker.
function buildFrameSides(pw: number, ph: number, frameWidth: number, rebate: number, depth: number): THREE.BufferGeometry {
  const aX = pw / 2 - rebate;
  const aY = ph / 2 - rebate;
  const bX = aX + frameWidth;
  const bY = aY + frameWidth;

  const positions: number[] = [];
  const indices: number[] = [];
  let vi = 0;
  // a wall from (ax,ay,0)-(bx,by,0) rising to z=depth (DoubleSide handles facing)
  const wall = (ax: number, ay: number, bx: number, by: number) => {
    positions.push(ax, ay, 0, bx, by, 0, bx, by, depth, ax, ay, depth);
    indices.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
    vi += 4;
  };
  // outer sides (perimeter at b)
  wall(bX, -bY, bX, bY);
  wall(-bX, bY, -bX, -bY);
  wall(-bX, -bY, bX, -bY);
  wall(bX, bY, -bX, bY);
  // inner rebate walls (opening at a)
  wall(aX, -aY, aX, aY);
  wall(-aX, aY, -aX, -aY);
  wall(-aX, -aY, aX, -aY);
  wall(aX, aY, -aX, aY);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export interface NineSliceFrameProps {
  texture: THREE.Texture;
  pw: number;
  ph: number;
  frameWidth?: number; // world thickness of the border (uniform on all sides)
  rebate?: number; // how much the inner edge overlaps the painting
  insets?: Slice; // override auto-detection (for JPGs with no alpha)
  normal?: THREE.Texture; // tangent-space normal map → relief reacts to scene light
  normalScale?: number;
  roughness?: number;
  metalness?: number;
  depth?: number; // how far the frame stands off the wall (m) — its real thickness
  edgeColor?: number; // colour of the side walls (the frame's depth in shadow)
}

export function NineSliceFrame({
  texture,
  pw,
  ph,
  frameWidth = 0.09,
  rebate = 0.012,
  insets,
  normal,
  normalScale = 0.85,
  roughness = 0.52,
  metalness = 0.15,
  depth = 0.055,
  edgeColor = 0x4a3818,
}: NineSliceFrameProps) {
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
    if (normal) {
      normal.colorSpace = THREE.NoColorSpace; // normal maps must stay linear
      normal.anisotropy = 8;
      normal.needsUpdate = true;
    }
  }, [texture, normal]);

  const frontGeo = useMemo(
    () => (slice ? buildNineSlice(pw, ph, frameWidth, rebate, slice, depth) : null),
    [pw, ph, frameWidth, rebate, slice, depth],
  );
  const sidesGeo = useMemo(() => buildFrameSides(pw, ph, frameWidth, rebate, depth), [pw, ph, frameWidth, rebate, depth]);

  const frontMat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      map: texture,
      normalMap: normal ?? null,
      transparent: true,
      alphaTest: 0.1,
      side: THREE.DoubleSide,
      roughness,
      metalness,
    });
    m.normalScale.set(normalScale, normalScale);
    return m;
  }, [texture, normal, normalScale, roughness, metalness]);

  const sidesMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: edgeColor, roughness: 0.6, metalness: 0.25, side: THREE.DoubleSide }),
    [edgeColor],
  );

  if (!frontGeo) return null;
  // back near the wall; front face stands `depth` proud of it. The painting
  // plane (z≈0.001) ends up recessed inside the frame, like a real hung frame.
  return (
    <group position={[0, 0, 0.002]}>
      <mesh geometry={sidesGeo} material={sidesMat} />
      <mesh geometry={frontGeo} material={frontMat} />
    </group>
  );
}

// URL wrapper: loads the colour map (+ optional normal map), then renders the
// 9-slice frame. Both maps share the geometry UVs, so the relief lines up.
export function NineSliceFrameFromURL({
  url,
  normalUrl,
  pw,
  ph,
  frameWidth,
  rebate,
  insets,
  normalScale,
  roughness,
  metalness,
  depth,
  edgeColor,
}: { url: string; normalUrl?: string } & Omit<NineSliceFrameProps, "texture" | "normal">) {
  const urls = normalUrl ? [url, normalUrl] : [url];
  const textures = useLoader(TextureLoader, urls) as THREE.Texture[];
  return (
    <NineSliceFrame
      texture={textures[0]}
      normal={normalUrl ? textures[1] : undefined}
      pw={pw}
      ph={ph}
      frameWidth={frameWidth}
      rebate={rebate}
      insets={insets}
      normalScale={normalScale}
      roughness={roughness}
      metalness={metalness}
      depth={depth}
      edgeColor={edgeColor}
    />
  );
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
