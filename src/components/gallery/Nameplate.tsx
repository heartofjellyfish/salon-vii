"use client";

import { useEffect, useState } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { getFrameEnvMap, getFrameWidth } from "./FrameBuilders";
import type { Artwork } from "@/lib/sanity";

const PLATE_SRC = "/frames/nameplate.png";
const IMG_W = 1260;
const IMG_H = 499;
const PLATE_W = 0.34;
const PLATE_H = (PLATE_W * IMG_H) / IMG_W; // match the photo's aspect

// Derive a tangent-space normal map from a grayscale height canvas (Sobel).
function heightToNormal(height: HTMLCanvasElement, strength: number): THREE.CanvasTexture {
  const w = height.width;
  const h = height.height;
  const src = height.getContext("2d")!.getImageData(0, 0, w, h).data;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const oCtx = out.getContext("2d")!;
  const img = oCtx.createImageData(w, h);
  const at = (x: number, y: number) => {
    const cx = x < 0 ? 0 : x >= w ? w - 1 : x;
    const cy = y < 0 ? 0 : y >= h ? h - 1 : y;
    return src[(cy * w + cx) * 4] / 255;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (at(x - 1, y) - at(x + 1, y)) * strength;
      const dy = (at(x, y - 1) - at(x, y + 1)) * strength;
      const nz = 1.0;
      const len = Math.hypot(dx, dy, nz) || 1;
      const i = (y * w + x) * 4;
      img.data[i] = (dx / len * 0.5 + 0.5) * 255;
      img.data[i + 1] = (dy / len * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz / len * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  oCtx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(out);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

// Two centred lines inside the plate's flat engraving field.
function drawText(ctx: CanvasRenderingContext2D, title: string, sub: string, ink: string) {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = ink;
  ctx.font = `600 ${Math.round(IMG_H * 0.17)}px Georgia, "Times New Roman", serif`;
  ctx.fillText(title, IMG_W / 2, IMG_H * 0.44, IMG_W * 0.66);
  ctx.font = `italic 400 ${Math.round(IMG_H * 0.1)}px Georgia, "Times New Roman", serif`;
  ctx.fillText(sub, IMG_W / 2, IMG_H * 0.62, IMG_W * 0.66);
}

export default function Nameplate({ artwork, ph }: { artwork: Artwork; ph: number }) {
  const gl = useThree((s) => s.gl);
  const [material, setMaterial] = useState<THREE.MeshStandardMaterial | null>(null);

  const title = artwork.titleCN || artwork.title || "";
  const sub = [artwork.artist || "Vincent van Gogh", artwork.year].filter(Boolean).join(" · ");

  useEffect(() => {
    let disposed = false;
    const img = new Image();
    img.onload = () => {
      if (disposed) return;
      // Colour map = photo + engraved text painted into the flat field.
      const base = document.createElement("canvas");
      base.width = IMG_W;
      base.height = IMG_H;
      const b = base.getContext("2d")!;
      b.drawImage(img, 0, 0, IMG_W, IMG_H);
      drawText(b, title, sub, "rgba(70,48,18,0.9)");
      const colorTex = new THREE.CanvasTexture(base);
      colorTex.colorSpace = THREE.SRGBColorSpace;
      colorTex.anisotropy = gl.capabilities.getMaxAnisotropy();

      // Height field = flat plate with recessed (dark) text -> normal map so the
      // lettering catches the painting spotlights.
      const hc = document.createElement("canvas");
      hc.width = IMG_W;
      hc.height = IMG_H;
      const h = hc.getContext("2d")!;
      h.fillStyle = "#bdbdbd";
      h.fillRect(0, 0, IMG_W, IMG_H);
      drawText(h, title, sub, "#4a4a4a");
      const normalTex = heightToNormal(hc, 2.0);
      normalTex.anisotropy = colorTex.anisotropy;

      setMaterial(
        new THREE.MeshStandardMaterial({
          map: colorTex,
          normalMap: normalTex,
          normalScale: new THREE.Vector2(0.5, 0.5),
          transparent: true,
          alphaTest: 0.5,
          metalness: 0.55,
          roughness: 0.45,
          envMap: getFrameEnvMap(gl),
          envMapIntensity: 0.6,
        })
      );
    };
    img.src = PLATE_SRC;
    return () => {
      disposed = true;
    };
  }, [title, sub, gl]);

  if (!material) return null;

  // Sit the plaque just below the frame's outer molding, with a small gap.
  const plateY = -(ph / 2 + getFrameWidth(artwork.frameStyle) + 0.07 + PLATE_H / 2);

  return (
    <mesh position={[0, plateY, 0.02]} material={material}>
      <planeGeometry args={[PLATE_W, PLATE_H]} />
    </mesh>
  );
}
