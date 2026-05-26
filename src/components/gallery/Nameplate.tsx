"use client";

import { useMemo } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { getFrameEnvMap, getFrameWidth } from "./FrameBuilders";
import type { Artwork } from "@/lib/sanity";

const PLATE_W = 0.34;
const PLATE_H = 0.12;
const CW = 480;
const CH = Math.round((CW * PLATE_H) / PLATE_W); // keep texel aspect square

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

function drawText(ctx: CanvasRenderingContext2D, title: string, sub: string, ink: string) {
  ctx.textAlign = "center";
  ctx.fillStyle = ink;
  ctx.font = `600 ${Math.round(CH * 0.26)}px Georgia, "Times New Roman", serif`;
  ctx.fillText(title, CW / 2, CH * 0.42, CW * 0.86);
  ctx.font = `italic 400 ${Math.round(CH * 0.17)}px Georgia, "Times New Roman", serif`;
  ctx.fillText(sub, CW / 2, CH * 0.74, CW * 0.86);
}

function makeTextures() {
  // --- Base colour: brushed brass with subtle horizontal grain ---
  const base = document.createElement("canvas");
  base.width = CW;
  base.height = CH;
  const b = base.getContext("2d")!;
  const grad = b.createLinearGradient(0, 0, 0, CH);
  grad.addColorStop(0, "#d8b977");
  grad.addColorStop(0.5, "#b58f44");
  grad.addColorStop(1, "#8f6e30");
  b.fillStyle = grad;
  b.fillRect(0, 0, CW, CH);
  // horizontal brushed streaks
  for (let i = 0; i < 1400; i++) {
    const y = Math.random() * CH;
    const x = Math.random() * CW;
    const len = 20 + Math.random() * 80;
    b.strokeStyle = `rgba(255,240,210,${Math.random() * 0.05})`;
    b.lineWidth = Math.random() < 0.5 ? 1 : 2;
    b.beginPath();
    b.moveTo(x, y);
    b.lineTo(x + len, y + (Math.random() - 0.5));
    b.stroke();
  }
  // beveled inner border
  b.strokeStyle = "rgba(60,40,15,0.5)";
  b.lineWidth = 3;
  b.strokeRect(6, 6, CW - 12, CH - 12);
  b.strokeStyle = "rgba(255,245,215,0.4)";
  b.lineWidth = 1;
  b.strokeRect(9, 9, CW - 18, CH - 18);

  // --- Height field: flat plate, recessed (dark) engraved text + border ---
  const height = document.createElement("canvas");
  height.width = CW;
  height.height = CH;
  const h = height.getContext("2d")!;
  h.fillStyle = "#bdbdbd"; // mid plate level
  h.fillRect(0, 0, CW, CH);
  // engraved border channel
  h.strokeStyle = "#3a3a3a";
  h.lineWidth = 4;
  h.strokeRect(7, 7, CW - 14, CH - 14);

  return { base, height, b, h };
}

export default function Nameplate({ artwork, ph }: { artwork: Artwork; ph: number }) {
  const gl = useThree((s) => s.gl);

  const { material } = useMemo(() => {
    const title = artwork.titleCN || artwork.title || "";
    const sub = [artwork.artist || "Vincent van Gogh", artwork.year]
      .filter(Boolean)
      .join(" · ");

    const { base, height, b, h } = makeTextures();
    // colour: darken engraved text into the brass
    drawText(b, title, sub, "rgba(70,48,18,0.85)");
    // height: engrave text as recessed (dark)
    drawText(h, title, sub, "#454545");

    const colorTex = new THREE.CanvasTexture(base);
    colorTex.colorSpace = THREE.SRGBColorSpace;
    colorTex.anisotropy = gl.capabilities.getMaxAnisotropy();
    const normalTex = heightToNormal(height, 2.2);
    normalTex.anisotropy = colorTex.anisotropy;

    const mat = new THREE.MeshStandardMaterial({
      map: colorTex,
      normalMap: normalTex,
      normalScale: new THREE.Vector2(0.6, 0.6),
      metalness: 0.85,
      roughness: 0.42,
      envMap: getFrameEnvMap(gl),
      envMapIntensity: 0.8,
    });
    return { material: mat };
  }, [artwork.title, artwork.titleCN, artwork.artist, artwork.year, gl]);

  // Drop the plaque clear of the frame's outer molding, with a small gap.
  const plateY = -(ph / 2 + getFrameWidth(artwork.frameStyle) + 0.07 + PLATE_H / 2);

  return (
    <mesh position={[0, plateY, 0.018]} material={material}>
      <boxGeometry args={[PLATE_W, PLATE_H, 0.012]} />
    </mesh>
  );
}
