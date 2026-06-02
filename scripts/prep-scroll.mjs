/**
 * prep-scroll.mjs — turn a giant handscroll TIF into web-ready assets.
 *
 * Produces, under public/scrolls/<slug>/:
 *   <slug>.dzi + <slug>_files/…   DZI tile pyramid for OpenSeadragon (click-to-zoom viewer)
 *   wall.webp                     one downscaled strip for the flat scroll on the 3D wall
 *   manifest.json                 dims/aspect/paths the gallery reads
 *
 * Why this shape: the in-3D wall only needs an ambient strip (detail lives in the
 * zoom viewer), and a 750MP image can only be panned/zoomed in-browser as tiles —
 * OpenSeadragon + DZI is the standard, low-effort way (see project_scroll memory).
 * Source is CMYK with no embedded ICC, so we assign a CMYK profile before sRGB.
 *
 * Usage:
 *   node scripts/prep-scroll.mjs <input.tif> <slug> [wallWidth=8192] [tileSize=256] [dziQ=80] [wallQ=85]
 *
 * public/scrolls is gitignored; heavy DZI assets go to R2 for production.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync, existsSync, statSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import { tmpdir } from "node:os";

const VIPS = process.env.VIPS_BIN || "vips";
const VIPSHEADER = process.env.VIPSHEADER_BIN || "vipsheader";
const CMYK_PROFILE =
  process.env.CMYK_PROFILE || "/System/Library/ColorSync/Profiles/Generic CMYK Profile.icc";

const [, , input, slug, wallWArg, tileArg, dziQArg, wallQArg] = process.argv;
if (!input || !slug) {
  console.error(
    "usage: node scripts/prep-scroll.mjs <input.tif> <slug> [wallWidth=8192] [tileSize=256] [dziQ=80] [wallQ=85]",
  );
  process.exit(1);
}
const WALL_W = parseInt(wallWArg || "8192", 10);
const TILE = parseInt(tileArg || "256", 10);
const DZI_Q = parseInt(dziQArg || "80", 10);
const WALL_Q = parseInt(wallQArg || "85", 10);

if (!existsSync(input)) {
  console.error(`input not found: ${input}`);
  process.exit(1);
}
if (!existsSync(CMYK_PROFILE)) {
  console.warn(`! CMYK profile not found at ${CMYK_PROFILE} — color may be off. Set CMYK_PROFILE env.`);
}

const run = (bin, args) => execFileSync(bin, args, { stdio: ["ignore", "ignore", "inherit"] });
const headerInt = (field) =>
  parseInt(execFileSync(VIPSHEADER, ["-f", field, input]).toString().trim(), 10);

const W = headerInt("width");
const H = headerInt("height");

const outDir = join(process.cwd(), "public", "scrolls", slug);
mkdirSync(outDir, { recursive: true });
const tmpTiff = join(tmpdir(), `${slug}-srgb-${process.pid}.tif`);

console.log(`source ${W}×${H}  (${(W / H).toFixed(1)}:1)`);

// 1) CMYK → sRGB once, into a tiled JPEG TIFF (small + random-access for dzsave/thumbnail).
console.log("color-managing CMYK→sRGB (tiled TIFF temp)…");
const t0 = Date.now();
run(VIPS, [
  "icc_transform",
  input,
  `${tmpTiff}[tile,compression=jpeg,Q=92]`,
  "srgb",
  "--input-profile",
  CMYK_PROFILE,
]);

// 2) DZI tile pyramid for OpenSeadragon.
console.log("dzsave (DZI tile pyramid)…");
run(VIPS, [
  "dzsave",
  tmpTiff,
  join(outDir, slug),
  "--suffix", `.webp[Q=${DZI_Q}]`,
  "--tile-size", String(TILE),
  "--overlap", "1",
]);

// 3) One downscaled wall strip for the flat scroll on the 3D wall.
console.log(`wall strip (${WALL_W}px wide)…`);
run(VIPS, ["thumbnail", tmpTiff, `${join(outDir, "wall.webp")}[Q=${WALL_Q},strip]`, String(WALL_W)]);

rmSync(tmpTiff, { force: true });

// crude size report
const tilesDir = join(outDir, `${slug}_files`);
let tileBytes = 0;
const walk = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) walk(p);
    else tileBytes += statSync(p).size;
  }
};
if (existsSync(tilesDir)) walk(tilesDir);

const manifest = {
  slug,
  source: basename(input),
  total: { w: W, h: H },
  aspect: W / H,
  dzi: `${slug}.dzi`,
  tileSize: TILE,
  overlap: 1,
  wall: { file: "wall.webp", w: WALL_W, h: Math.round((WALL_W * H) / W), q: WALL_Q },
  startEnd: "right", // handscroll reads right→left; OpenSeadragon should open here. Flip if wrong.
  generatedAt: new Date().toISOString(),
};
writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));

console.log(
  `✓ ${outDir}\n  DZI tiles: ${(tileBytes / 1e6).toFixed(1)} MB  ·  ${((Date.now() - t0) / 1000).toFixed(0)}s total`,
);
