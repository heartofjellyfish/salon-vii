import React, { useEffect, useState } from "react";
import { set, useFormValue, type StringInputProps } from "sanity";

// Visual frame picker for the `frameStyle` field. Shows the current painting
// inside each of the three frames so a curator can choose by eye instead of
// guessing from the value names. The frame photos are served from the studio's
// own /static folder (same-origin, so the opening can be measured on a canvas).

const PROJECT_ID = "7dt4ydmn";
const DATASET = "production";

type FrameOption = {
  value: string;
  label: string;
  sub: string;
  src: string;
  borderWidth: number; // rendered thickness (px) — baroque thicker, slim thinner
};

const FRAMES: FrameOption[] = [
  { value: "baroque_gold", label: "巴洛克金框", sub: "Ornate Baroque gilt", src: "/static/frames/f2-baroque.png", borderWidth: 26 },
  { value: "raw_wood", label: "青铜木框", sub: "Rustic bronze / wood", src: "/static/frames/f3-anaterate.png", borderWidth: 24 },
  { value: "copper_slim", label: "细金框", sub: "Simple slim gilt", src: "/static/frames/f4-susannp4.png", borderWidth: 16 },
  { value: "classic_gold", label: "古典金框", sub: "Smooth classic gilt", src: "/static/frames/f5-classic-gold.png", borderWidth: 20 },
];

// Build a square thumbnail URL for the current painting from its asset ref
// (image-<id>-<WxH>-<ext>).
function paintingThumb(ref?: string): string | null {
  if (!ref) return null;
  const p = ref.split("-");
  if (p.length < 4) return null;
  return `https://cdn.sanity.io/images/${PROJECT_ID}/${DATASET}/${p[1]}-${p[2]}.${p[3]}?w=300&h=300&fit=crop`;
}

// Measure where the frame's opening is, returned as a CSS border-image-slice
// string ("top right bottom left", in %). Ported from the gallery's 9-slice
// detectOpening: transparent centre (PNG) first, else near-white centre (JPG).
function detectSlice(src: string): Promise<string> {
  const FALLBACK = "15%";
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const W = img.naturalWidth;
        const H = img.naturalHeight;
        const cv = document.createElement("canvas");
        cv.width = W;
        cv.height = H;
        const ctx = cv.getContext("2d");
        if (!ctx) return resolve(FALLBACK);
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, W, H).data;
        // centre-out: expand from the middle while transparent (cut-out PNG) or
        // near-white (flat JPG). Finds the OPENING only, ignoring any transparent
        // border / rounded corners outside the frame (which broke the old bbox).
        const open = (x: number, y: number) => {
          const i = (y * W + x) * 4;
          if (data[i + 3] < 40) return true;
          return data[i] > 236 && data[i + 1] > 236 && data[i + 2] > 236;
        };
        const cx = W >> 1, cy = H >> 1;
        if (!open(cx, cy)) return resolve(FALLBACK);
        let l = cx, r = cx, t = cy, b = cy;
        while (l > 0 && open(l - 1, cy)) l--;
        while (r < W - 1 && open(r + 1, cy)) r++;
        while (t > 0 && open(cx, t - 1)) t--;
        while (b < H - 1 && open(cx, b + 1)) b++;
        if (r <= l || b <= t) return resolve(FALLBACK);
        const top = Math.round((t / H) * 100);
        const right = Math.round(((W - r) / W) * 100);
        const bottom = Math.round(((H - b) / H) * 100);
        const left = Math.round((l / W) * 100);
        resolve(`${top}% ${right}% ${bottom}% ${left}%`);
      } catch {
        resolve(FALLBACK);
      }
    };
    img.onerror = () => resolve(FALLBACK);
    img.src = src;
  });
}

export function FrameStylePicker(props: StringInputProps) {
  const { value, onChange } = props;
  const image = useFormValue(["image"]) as { asset?: { _ref?: string } } | undefined;
  const thumb = paintingThumb(image?.asset?._ref);
  const [slices, setSlices] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    Promise.all(
      FRAMES.map((f) => detectSlice(f.src).then((s) => [f.value, s] as const)),
    ).then((pairs) => {
      if (alive) setSlices(Object.fromEntries(pairs));
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, maxWidth: 520 }}>
      {FRAMES.map((f) => {
        const selected = value === f.value;
        return (
          <button
            key={f.value}
            type="button"
            onClick={() => onChange(set(f.value))}
            style={{
              padding: 8,
              borderRadius: 8,
              cursor: "pointer",
              textAlign: "center",
              background: selected ? "rgba(31,111,235,0.12)" : "transparent",
              border: selected ? "2px solid #1f6feb" : "2px solid #e3e4e8",
              transition: "border-color 0.1s, background 0.1s",
            }}
          >
            <div
              style={{
                width: "100%",
                aspectRatio: "1 / 1",
                boxSizing: "border-box",
                borderStyle: "solid",
                borderWidth: f.borderWidth,
                borderImageSource: `url(${f.src})`,
                borderImageSlice: slices[f.value] ?? "15%",
                borderImageRepeat: "stretch",
                backgroundColor: "#d9d2c7",
                backgroundImage: thumb ? `url(${thumb})` : undefined,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            />
            <div style={{ marginTop: 6, fontSize: 12, fontWeight: selected ? 600 : 500 }}>{f.label}</div>
            <div style={{ fontSize: 10, opacity: 0.6 }}>{f.sub}</div>
          </button>
        );
      })}
    </div>
  );
}

export default FrameStylePicker;
