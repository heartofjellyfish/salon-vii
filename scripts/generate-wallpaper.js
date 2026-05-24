#!/usr/bin/env node
/**
 * Salon VII Wallpaper Generator v2
 * 
 * Generates three 4096×4096 texture maps for the gallery wallpaper:
 *   1. wallpaper-albedo.png — color map with fabric weave + gold wreaths
 *   2. wallpaper-normal.png  — normal map for bump/relief
 *   3. wallpaper-roughness.png — roughness map (lower on gold)
 * 
 * Usage: node scripts/generate-wallpaper.js
 * Output: public/textures/wallpaper-*.png
 */

const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const SIZE = 4096;
const TILE_METERS = 2.0;
const PX_PER_M = SIZE / TILE_METERS;

// ── Seeded PRNG (mulberry32) ──
function mulberry32(a) {
  return function() {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ── 2D Hash ──
function hash(x, y) {
  let h = x * 374761393 + y * 668265263 + 1013904223;
  h = (h ^ (h >> 13)) * 1274126177;
  return (h ^ (h >> 16)) & 0x7FFFFFFF;
}

function noise2D(x, y) {
  const xi = Math.floor(x) & 255;
  const yi = Math.floor(y) & 255;
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);
  const u = xf * xf * (3.0 - 2.0 * xf);
  const v = yf * yf * (3.0 - 2.0 * yf);
  const a = (hash(xi, yi) % 65536) / 65536.0;
  const b = (hash(xi + 1, yi) % 65536) / 65536.0;
  const c = (hash(xi, yi + 1) % 65536) / 65536.0;
  const d = (hash(xi + 1, yi + 1) % 65536) / 65536.0;
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

function fBm(x, y, octaves = 6, lacunarity = 2.0, gain = 0.5) {
  let value = 0, amplitude = 1.0, frequency = 1.0, maxValue = 0;
  for (let i = 0; i < octaves; i++) {
    value += amplitude * noise2D(x * frequency, y * frequency);
    maxValue += amplitude;
    frequency *= lacunarity;
    amplitude *= gain;
  }
  return value / maxValue;
}

// ── Color helpers ──
function hexToRgb(hex) {
  return [(hex >> 16) & 0xFF, (hex >> 8) & 0xFF, hex & 0xFF];
}
function lerp(a, b, t) { return a + (b - a) * t; }
function lerpColor(c1, c2, t) {
  const [r1, g1, b1] = hexToRgb(c1);
  const [r2, g2, b2] = hexToRgb(c2);
  return ((Math.round(lerp(r1, r2, t)) & 0xFF) << 16) |
         ((Math.round(lerp(g1, g2, t)) & 0xFF) << 8) |
         (Math.round(lerp(b1, b2, t)) & 0xFF);
}

// ── Constants ──
const BASE_COLOR = 0x5C1822;
const GOLD_COLOR = 0xC4963A;
const BRIGHTNESS_VARIATION = 0.08;
const WEAVE_SPACING_PX = 3.5;
const WEAVE_OPACITY = 0.04;

// ── Draw weave pattern ──
function drawWeave(ctx, width, height) {
  ctx.strokeStyle = `rgba(0, 0, 0, ${WEAVE_OPACITY})`;
  ctx.lineWidth = 1.0;
  for (let y = 0; y < height; y += WEAVE_SPACING_PX) {
    const offset = Math.sin(y * 0.5) * 0.5;
    ctx.beginPath();
    ctx.moveTo(0, y + offset);
    ctx.lineTo(width, y + offset);
    ctx.stroke();
  }
  const vSpacing = WEAVE_SPACING_PX * 1.15;
  ctx.strokeStyle = `rgba(0, 0, 0, ${WEAVE_OPACITY * 0.8})`;
  for (let x = 0; x < width; x += vSpacing) {
    const offset = Math.sin(x * 0.4) * 0.5;
    ctx.beginPath();
    ctx.moveTo(x + offset, 0);
    ctx.lineTo(x + offset, height);
    ctx.stroke();
  }
  ctx.strokeStyle = `rgba(255, 255, 255, 0.015)`;
  ctx.lineWidth = 0.5;
  for (let y = WEAVE_SPACING_PX; y < height; y += WEAVE_SPACING_PX * 2) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

// ── Draw a single leaf (improved) ──
function drawLeaf(ctx, x, y, angle, size, seed) {
  const rng = mulberry32(seed);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  
  const w = size * (0.3 + rng() * 0.12);
  const h = size * (0.75 + rng() * 0.2);
  
  // Leaf shape — heart/oval with pointed tip at the top (in local coords, tip is at +h)
  ctx.beginPath();
  ctx.moveTo(0, h * 0.85);
  // Right curve
  ctx.bezierCurveTo(w * 1.05, h * 0.45, w * 0.65, -h * 0.15, 0, -h * 0.25);
  // Left curve
  ctx.bezierCurveTo(-w * 0.65, -h * 0.15, -w * 1.05, h * 0.45, 0, h * 0.85);
  ctx.closePath();
  
  // Fill with antique gold
  ctx.fillStyle = '#C4963A';
  ctx.fill();
  
  // Gradient overlay for depth
  const grad = ctx.createLinearGradient(0, -h * 0.25, 0, h * 0.85);
  grad.addColorStop(0, 'rgba(255,220,160,0.22)');
  grad.addColorStop(0.4, 'rgba(196,150,58,0.0)');
  grad.addColorStop(0.8, 'rgba(140,100,30,0.28)');
  ctx.fillStyle = grad;
  ctx.fill();
  
  // Center vein
  ctx.strokeStyle = 'rgba(100,70,20,0.3)';
  ctx.lineWidth = size * 0.035;
  ctx.beginPath();
  ctx.moveTo(0, h * 0.78);
  ctx.quadraticCurveTo(0, h * 0.15, 0, -h * 0.22);
  ctx.stroke();
  
  // Side veins
  ctx.lineWidth = size * 0.022;
  for (let vy = -0.1; vy < 0.65; vy += 0.16 + rng() * 0.08) {
    const vx = w * (0.25 + vy * 0.55);
    const sign = rng() > 0.5 ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(0, vy * h);
    ctx.quadraticCurveTo(vx * 0.55 * sign, vy * h + h * 0.04, vx * 0.9 * sign, vy * h + h * 0.01);
    ctx.stroke();
  }
  
  // Subtle outline
  ctx.strokeStyle = 'rgba(80,55,15,0.35)';
  ctx.lineWidth = size * 0.025;
  ctx.stroke();
  
  ctx.restore();
}

// ── Draw a single wreath (v2 — proper closed circle with bottom gap) ──
function drawWreath(ctx, cx, cy, radius, seed) {
  const rng = mulberry32(seed);
  
  // 16-22 clusters for dense, continuous look
  const numClusters = 16 + Math.floor(rng() * 7);
  
  // Gap at BOTTOM (PI/2 in canvas where y increases downward)
  // Total gap ~120° centered at bottom, ±20° variation
  const gapCenter = Math.PI / 2;
  const gapHalfAngle = Math.PI * 0.33 + (rng() - 0.5) * 0.18; // ~59° ±10° per side
  const gapStart = gapCenter - gapHalfAngle;
  const gapEnd = gapCenter + gapHalfAngle;
  
  // Total usable arc
  const usableArc = 2 * Math.PI - (gapEnd - gapStart);
  
  // Cluster size varies
  const leafSize = radius * (0.32 + rng() * 0.12);
  
  // Generate random per-cluster perturbations
  const clusterOffsets = [];
  for (let i = 0; i < numClusters; i++) {
    clusterOffsets.push({
      radialJitter: (rng() - 0.5) * radius * 0.08,  // ±4% radius jitter
      angularJitter: (rng() - 0.5) * 0.06,            // small angle jitter
      leafCount: 2 + Math.floor(rng() * 2),           // 2-3 leaves
      seed: Math.floor(rng() * 100000)
    });
  }
  
  // Distribute clusters evenly across the usable arc
  for (let i = 0; i < numClusters; i++) {
    const t = i / (numClusters - 1);
    let angle = gapStart + t * usableArc + clusterOffsets[i].angularJitter;
    
    // Wrap angle to [-PI, PI]
    if (angle > Math.PI) angle -= 2 * Math.PI;
    
    const crng = mulberry32(clusterOffsets[i].seed);
    const numLeaves = clusterOffsets[i].leafCount;
    const radialDist = radius + clusterOffsets[i].radialJitter;
    
    // Leaf spread within cluster
    const clusterSpread = 0.1 + crng() * 0.08;
    
    for (let l = 0; l < numLeaves; l++) {
      const lrng = mulberry32(Math.floor(crng() * 100000));
      
      // Stagger leaves: inner/outer positioning
      const staggerR = l === 0 ? radialDist * 0.92 : (l === 1 ? radialDist : radialDist * 1.06);
      const leafAngle = angle + (l - (numLeaves - 1) / 2) * clusterSpread + (lrng() - 0.5) * 0.06;
      
      const lx = cx + Math.cos(leafAngle) * staggerR;
      const ly = cy + Math.sin(leafAngle) * staggerR;
      
      // Leaf points outward from center (perpendicular to radius)
      const orientAngle = leafAngle + Math.PI / 2 + (lrng() - 0.5) * 0.18;
      
      drawLeaf(ctx, lx, ly, orientAngle, leafSize, Math.floor(lrng() * 100000));
    }
    
    // Berries between clusters
    if (i < numClusters - 1) {
      const nextT = (i + 1) / (numClusters - 1);
      let nextAngle = gapStart + nextT * usableArc + clusterOffsets[Math.min(i + 1, numClusters - 1)].angularJitter;
      if (nextAngle > Math.PI) nextAngle -= 2 * Math.PI;
      
      const midAngle = (angle + nextAngle) / 2;
      // Handle wrap-around
      let midAdjusted = midAngle;
      if (Math.abs(nextAngle - angle) > Math.PI) {
        midAdjusted = midAngle + Math.PI;
        if (midAdjusted > Math.PI) midAdjusted -= 2 * Math.PI;
      }
      
      const numBerries = 1 + Math.floor(crng() * 2);
      for (let b = 0; b < numBerries; b++) {
        const brng = mulberry32(Math.floor(crng() * 300000 + b * 777));
        const bAngle = midAdjusted + (brng() - 0.5) * 0.08;
        const bR = radius * (0.88 + brng() * 0.15);
        const bx = cx + Math.cos(bAngle) * bR;
        const by = cy + Math.sin(bAngle) * bR;
        const bSize = radius * (0.045 + brng() * 0.035);
        
        // Berry circle
        ctx.beginPath();
        ctx.arc(bx, by, bSize, 0, Math.PI * 2);
        ctx.fillStyle = '#C4963A';
        ctx.fill();
        
        // Berry highlight
        const bgrad = ctx.createRadialGradient(
          bx - bSize * 0.2, by - bSize * 0.25, bSize * 0.04,
          bx, by, bSize
        );
        bgrad.addColorStop(0, 'rgba(255,220,160,0.45)');
        bgrad.addColorStop(1, 'rgba(140,100,30,0.25)');
        ctx.fillStyle = bgrad;
        ctx.fill();
        
        ctx.strokeStyle = 'rgba(80,55,15,0.25)';
        ctx.lineWidth = bSize * 0.25;
        ctx.stroke();
      }
    }
  }
  
  // Random small branch extensions from the gap edge (25% chance)
  if (rng() < 0.25) {
    const numExt = 1 + Math.floor(rng() * 2);
    for (let e = 0; e < numExt; e++) {
      const extAngle = gapStart + rng() * (gapEnd - gapStart);
      const baseR = radius * 0.75;
      const extR = radius * 1.2;
      const bx = cx + Math.cos(extAngle) * baseR;
      const by = cy + Math.sin(extAngle) * baseR;
      const ex = cx + Math.cos(extAngle) * extR;
      const ey = cy + Math.sin(extAngle) * extR;
      
      ctx.strokeStyle = 'rgba(80,55,15,0.25)';
      ctx.lineWidth = radius * 0.018;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(
        bx + Math.cos(extAngle + 0.15) * radius * 0.3,
        by + Math.sin(extAngle + 0.15) * radius * 0.3,
        ex, ey
      );
      ctx.stroke();
      
      // Small leaf at tip
      drawLeaf(ctx, ex, ey, extAngle + Math.PI / 2 + (rng() - 0.5) * 0.3,
               leafSize * 0.45, Math.floor(rng() * 400000));
    }
  }
}

// ── Place wreaths in deliberate brick + diamond pattern ──
function placeWreaths(width, height) {
  const wreaths = [];
  const seed = 42;
  const rng = mulberry32(seed);
  
  const largeDiamPx = 450;  // ~22cm
  const smallDiamPx = 184;  // ~9cm
  
  // Brick grid
  const cellW = largeDiamPx * 1.75;
  const cellH = largeDiamPx * 1.55;
  const margin = largeDiamPx / 2 + 40;
  
  const cols = Math.floor(width / cellW);
  const rows = Math.floor(height / cellH);
  const actualCellW = width / cols;
  const actualCellH = height / rows;
  
  let id = 0;
  
  // Place large wreaths in brick pattern
  for (let row = 0; row < rows; row++) {
    const isOffsetRow = row % 2 === 1;
    const nCols = isOffsetRow ? cols - 1 : cols;
    
    for (let col = 0; col < nCols; col++) {
      const offsetX = isOffsetRow ? actualCellW / 2 : 0;
      const cx = col * actualCellW + actualCellW / 2 + offsetX;
      const cy = row * actualCellH + actualCellH / 2;
      
      if (cx < margin || cx > width - margin || cy < margin || cy > height - margin) continue;
      
      const wrng = mulberry32(seed + id * 12345);
      const diam = largeDiamPx * (0.85 + wrng() * 0.3);
      
      wreaths.push({
        cx, cy,
        radius: diam / 2,
        seed: Math.floor(wrng() * 1000000),
        size: 'large',
        id: id++
      });
    }
  }
  
  // Place small wreaths at diamond centers (between 4 large wreaths)
  // Diamond centers are at (col+0.5)*cellW, (row+0.5)*cellH for even rows,
  // and adjusted for odd rows
  const smallRng = mulberry32(seed + 99999);
  
  for (let row = 0; row < rows - 1; row++) {
    const nextIsOdd = (row + 1) % 2 === 1;
    const nCols = row % 2 === 0 ? cols : cols - 1;
    
    for (let col = 0; col < nCols - (row % 2 === 0 ? 0 : 1); col++) {
      const baseOffsetX = row % 2 === 1 ? actualCellW / 2 : 0;
      const sx = col * actualCellW + actualCellW + baseOffsetX;
      const sy = row * actualCellH + actualCellH;
      
      if (sx < margin + 50 || sx > width - margin - 50 ||
          sy < margin + 50 || sy > height - margin - 50) continue;
      
      const sDiam = smallDiamPx * (0.85 + smallRng() * 0.3);
      const sRadius = sDiam / 2;
      
      // Only place small wreath ~60% of the time for organic feel
      if (smallRng() > 0.6) continue;
      
      // Check distance from existing wreaths
      let tooClose = false;
      for (const w of wreaths) {
        const dx = sx - w.cx;
        const dy = sy - w.cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < w.radius + sRadius + 60) {
          tooClose = true;
          break;
        }
      }
      
      if (!tooClose) {
        wreaths.push({
          cx: sx, cy: sy,
          radius: sRadius,
          seed: Math.floor(smallRng() * 1000000),
          size: 'small',
          id: id++
        });
      }
    }
  }
  
  return wreaths;
}

// ── Generate albedo map ──
function generateAlbedo(width, height) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;
  
  const [br, bg, bb] = hexToRgb(BASE_COLOR);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const noiseVal = fBm(x / 150, y / 150, 6, 2.0, 0.5);
      const brightnessFactor = 1.0 + (noiseVal - 0.5) * 2 * BRIGHTNESS_VARIATION;
      
      let r = Math.round(Math.max(0, Math.min(255, br * brightnessFactor)));
      let g = Math.round(Math.max(0, Math.min(255, bg * brightnessFactor)));
      let b = Math.round(Math.max(0, Math.min(255, bb * brightnessFactor)));
      
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
  }
  
  ctx.putImageData(imageData, 0, 0);
  drawWeave(ctx, width, height);
  
  return canvas;
}

// ── Overlay wreaths ──
function overlayWreaths(canvas) {
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  const wreaths = placeWreaths(width, height);
  
  const largeCount = wreaths.filter(w => w.size === 'large').length;
  const smallCount = wreaths.filter(w => w.size === 'small').length;
  console.log(`  Placing ${wreaths.length} wreaths (${largeCount} large, ${smallCount} small)`);
  
  for (const w of wreaths) {
    w.metalness = 0.4 + (mulberry32(w.seed + 555)() * 0.3);
    drawWreath(ctx, w.cx, w.cy, w.radius, w.seed);
  }
  
  return wreaths;
}

// ── Generate normal map ──
function generateNormalMap(albedoCanvas, wreaths) {
  const width = albedoCanvas.width;
  const height = albedoCanvas.height;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  
  ctx.fillStyle = 'rgb(128, 128, 255)';
  ctx.fillRect(0, 0, width, height);
  
  const srcCtx = albedoCanvas.getContext('2d');
  const srcData = srcCtx.getImageData(0, 0, width, height).data;
  const normData = ctx.getImageData(0, 0, width, height);
  const nd = normData.data;
  
  const bumpStrength = 0.15;
  const weavePx = WEAVE_SPACING_PX;
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      
      const hL = getHeight(x - 1, y, srcData, weavePx, width, height);
      const hR = getHeight(x + 1, y, srcData, weavePx, width, height);
      const hD = getHeight(x, y - 1, srcData, weavePx, width, height);
      const hU = getHeight(x, y + 1, srcData, weavePx, width, height);
      
      const dx = (hR - hL) * bumpStrength;
      const dy = (hU - hD) * bumpStrength;
      const dz = 1.0;
      
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const nx = (dx / len) * 0.5 + 0.5;
      const ny = (dy / len) * 0.5 + 0.5;
      const nz = (dz / len) * 0.5 + 0.5;
      
      nd[idx] = Math.round(nx * 255);
      nd[idx + 1] = Math.round(ny * 255);
      nd[idx + 2] = Math.round(nz * 255);
      nd[idx + 3] = 255;
    }
  }
  
  ctx.putImageData(normData, 0, 0);
  return canvas;
}

function getHeight(x, y, srcData, weavePx, width, height) {
  if (x < 0 || x >= width || y < 0 || y >= height) return 0;
  const idx = (y * width + x) * 4;
  const r = srcData[idx];
  const g = srcData[idx + 1];
  const b = srcData[idx + 2];
  
  const isGold = (r > 150 && g > 100 && b < 80 && r > b * 1.5 && g > b * 1.3);
  const hPatternX = Math.sin(x / weavePx * Math.PI * 2) * 0.5 + 0.5;
  const hPatternY = Math.sin(y / weavePx * Math.PI * 2) * 0.5 + 0.5;
  const microNoise = fBm(x / 8, y / 8, 3, 2.0, 0.5);
  
  let heightVal = (hPatternX * hPatternY) * 0.3 + microNoise * 0.15;
  if (isGold) heightVal += 0.08;
  return heightVal;
}

// ── Generate roughness map ──
function generateRoughnessMap(albedoCanvas, wreaths) {
  const width = albedoCanvas.width;
  const height = albedoCanvas.height;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  
  const srcCtx = albedoCanvas.getContext('2d');
  const srcData = srcCtx.getImageData(0, 0, width, height).data;
  const roughData = ctx.createImageData(width, height);
  const rd = roughData.data;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = srcData[idx];
      const g = srcData[idx + 1];
      const b = srcData[idx + 2];
      
      const isGold = (r > 150 && g > 100 && b < 80 && r > b * 1.5 && g > b * 1.3);
      
      let roughness;
      if (isGold) {
        let minDist = Infinity;
        let nearestWreath = null;
        for (const w of wreaths) {
          const dx = x - w.cx;
          const dy = y - w.cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < minDist) { minDist = dist; nearestWreath = w; }
        }
        if (nearestWreath) {
          const edgeFade = Math.min(1, minDist / nearestWreath.radius);
          roughness = (1.0 - nearestWreath.metalness) + edgeFade * 0.25;
        } else {
          roughness = 0.5;
        }
      } else {
        const noiseVal = fBm(x / 100, y / 100, 4, 2.0, 0.5);
        roughness = 0.65 + noiseVal * 0.12;
      }
      
      roughness = Math.max(0, Math.min(1, roughness));
      const val = Math.round(roughness * 255);
      rd[idx] = val;
      rd[idx + 1] = val;
      rd[idx + 2] = val;
      rd[idx + 3] = 255;
    }
  }
  
  ctx.putImageData(roughData, 0, 0);
  return canvas;
}

// ── Save canvas ──
function saveCanvas(canvas, filepath) {
  const outDir = path.dirname(filepath);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(filepath, buffer);
  console.log(`  Saved ${filepath} (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`);
}

// ── Main ──
function main() {
  console.log('Salon VII Wallpaper Generator v2');
  console.log(`  Texture size: ${SIZE}×${SIZE} px`);
  console.log(`  Tile size: ${TILE_METERS}m × ${TILE_METERS}m`);
  console.log('');
  
  const outDir = path.join(__dirname, '..', 'public', 'textures');
  
  console.log('[1/3] Generating albedo map...');
  const albedo = generateAlbedo(SIZE, SIZE);
  const wreaths = overlayWreaths(albedo);
  saveCanvas(albedo, path.join(outDir, 'wallpaper-albedo.png'));
  
  console.log('[2/3] Generating normal map...');
  const normal = generateNormalMap(albedo, wreaths);
  saveCanvas(normal, path.join(outDir, 'wallpaper-normal.png'));
  
  console.log('[3/3] Generating roughness map...');
  const roughness = generateRoughnessMap(albedo, wreaths);
  saveCanvas(roughness, path.join(outDir, 'wallpaper-roughness.png'));
  
  console.log('');
  console.log('Done! All textures generated in public/textures/');
}

main();
