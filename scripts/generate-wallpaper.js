#!/usr/bin/env node
/**
 * Salon VII Wallpaper Generator
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
const TILE_METERS = 2.0; // each tile represents 2.0m
const PX_PER_M = SIZE / TILE_METERS; // 2048 px/m

// ── Seeded PRNG (mulberry32) ──
function mulberry32(a) {
  return function() {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ── 2D Hash (for noise) ──
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
  
  // Smoothstep
  const u = xf * xf * (3.0 - 2.0 * xf);
  const v = yf * yf * (3.0 - 2.0 * yf);
  
  const a = (hash(xi, yi) % 65536) / 65536.0;
  const b = (hash(xi + 1, yi) % 65536) / 65536.0;
  const c = (hash(xi, yi + 1) % 65536) / 65536.0;
  const d = (hash(xi + 1, yi + 1) % 65536) / 65536.0;
  
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

// fBm — Fractional Brownian Motion
function fBm(x, y, octaves = 6, lacunarity = 2.0, gain = 0.5) {
  let value = 0;
  let amplitude = 1.0;
  let frequency = 1.0;
  let maxValue = 0;
  
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
  const r = (hex >> 16) & 0xFF;
  const g = (hex >> 8) & 0xFF;
  const b = hex & 0xFF;
  return [r, g, b];
}

function rgbToHex(r, g, b) {
  return ((r & 0xFF) << 16) | ((g & 0xFF) << 8) | (b & 0xFF);
}

function lerp(a, b, t) { return a + (b - a) * t; }

function lerpColor(c1, c2, t) {
  const [r1, g1, b1] = hexToRgb(c1);
  const [r2, g2, b2] = hexToRgb(c2);
  return rgbToHex(
    Math.round(lerp(r1, r2, t)),
    Math.round(lerp(g1, g2, t)),
    Math.round(lerp(b1, b2, t))
  );
}

// ── Constants ──
const BASE_COLOR = 0x5C1822;    // deep wine red
const GOLD_COLOR = 0xC4963A;    // antique gold
const BRIGHTNESS_VARIATION = 0.08;

const WEAVE_SPACING_PX = 3.5;
const WEAVE_OPACITY = 0.04;

// ── Draw weave pattern ──
function drawWeave(ctx, width, height) {
  // Horizontal weave lines
  ctx.strokeStyle = `rgba(0, 0, 0, ${WEAVE_OPACITY})`;
  ctx.lineWidth = 1.0;
  for (let y = 0; y < height; y += WEAVE_SPACING_PX) {
    const offset = Math.sin(y * 0.5) * 0.5; // subtle waviness
    ctx.beginPath();
    ctx.moveTo(0, y + offset);
    ctx.lineTo(width, y + offset);
    ctx.stroke();
  }
  
  // Vertical weave lines (slightly different spacing for realism)
  const vSpacing = WEAVE_SPACING_PX * 1.15;
  ctx.strokeStyle = `rgba(0, 0, 0, ${WEAVE_OPACITY * 0.8})`;
  for (let x = 0; x < width; x += vSpacing) {
    const offset = Math.sin(x * 0.4) * 0.5;
    ctx.beginPath();
    ctx.moveTo(x + offset, 0);
    ctx.lineTo(x + offset, height);
    ctx.stroke();
  }
  
  // Cross-hatch highlights (subtle light threads)
  ctx.strokeStyle = `rgba(255, 255, 255, 0.015)`;
  ctx.lineWidth = 0.5;
  for (let y = WEAVE_SPACING_PX; y < height; y += WEAVE_SPACING_PX * 2) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

// ── Draw a single leaf ──
function drawLeaf(ctx, x, y, angle, size, seed) {
  const rng = mulberry32(seed);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  
  // Leaf shape — heart/oval with pointed tip
  const w = size * (0.35 + rng() * 0.15);
  const h = size * (0.7 + rng() * 0.3);
  
  ctx.beginPath();
  ctx.moveTo(0, h * 0.9); // tip
  // Right side
  ctx.bezierCurveTo(w * 1.1, h * 0.5, w * 0.7, -h * 0.2, 0, -h * 0.3);
  // Left side
  ctx.bezierCurveTo(-w * 0.7, -h * 0.2, -w * 1.1, h * 0.5, 0, h * 0.9);
  ctx.closePath();
  
  // Fill with gold
  ctx.fillStyle = '#C4963A';
  ctx.fill();
  
  // Subtle gradient overlay for depth
  const grad = ctx.createLinearGradient(0, -h * 0.3, 0, h * 0.9);
  grad.addColorStop(0, 'rgba(255,220,160,0.25)');
  grad.addColorStop(0.5, 'rgba(196,150,58,0.0)');
  grad.addColorStop(0.85, 'rgba(140,100,30,0.3)');
  ctx.fillStyle = grad;
  ctx.fill();
  
  // Vein (center)
  ctx.strokeStyle = 'rgba(100,70,20,0.35)';
  ctx.lineWidth = size * 0.04;
  ctx.beginPath();
  ctx.moveTo(0, h * 0.8);
  ctx.quadraticCurveTo(0, h * 0.2, 0, -h * 0.25);
  ctx.stroke();
  
  // Side veins
  ctx.lineWidth = size * 0.025;
  for (let vy = -0.15; vy < 0.7; vy += 0.18 + rng() * 0.08) {
    const vx = w * (0.3 + vy * 0.5);
    ctx.beginPath();
    ctx.moveTo(0, vy * h);
    ctx.quadraticCurveTo(vx * 0.6 * (rng() > 0.5 ? 1 : -1), vy * h + h * 0.05, 
                         vx * (rng() > 0.5 ? 1 : -1), vy * h + h * 0.02);
    ctx.stroke();
  }
  
  // Outline
  ctx.strokeStyle = 'rgba(80,55,15,0.4)';
  ctx.lineWidth = size * 0.03;
  ctx.stroke();
  
  ctx.restore();
}

// ── Draw a single wreath ──
function drawWreath(ctx, cx, cy, radius, seed, style = {}) {
  const rng = mulberry32(seed);
  
  // Variation parameters
  const numClusters = Math.round(8 + rng() * 6); // 8-14 clusters
  const gapStart = -Math.PI * 0.3 + (rng() - 0.5) * 0.35; // bottom gap ~120° ±20°
  const gapEnd = Math.PI * 0.3 + (rng() - 0.5) * 0.35;
  const clusterAngleSpread = 0.15 + rng() * 0.1;
  const leafSize = radius * (0.35 + rng() * 0.15);
  
  // Per-cluster seeds for variation
  const clusterSeeds = [];
  for (let i = 0; i < numClusters; i++) {
    clusterSeeds.push(Math.floor(rng() * 100000));
  }
  
  for (let i = 0; i < numClusters; i++) {
    // Angle for this cluster, skipping the gap
    const t = i / numClusters;
    let angle = -Math.PI + t * (2 * Math.PI);
    
    // Skip the gap region
    if (angle > gapStart && angle < gapEnd) continue;
    
    const clusterRng = mulberry32(clusterSeeds[i]);
    const numLeaves = 2 + Math.floor(clusterRng() * 2); // 2-3 leaves
    
    // Per-leaf angles with organic spread
    const baseLeafAngle = angle + clusterAngleSpread * (clusterRng() - 0.5);
    
    // Draw leaves in this cluster
    for (let l = 0; l < numLeaves; l++) {
      const leafRng = mulberry32(Math.floor(clusterRng() * 100000));
      const leafAngle = baseLeafAngle + (l - (numLeaves - 1) / 2) * 0.2 + (leafRng() - 0.5) * 0.15;
      const leafR = radius + (leafRng() - 0.5) * radius * 0.15;
      const lx = cx + Math.cos(leafAngle) * leafR;
      const ly = cy + Math.sin(leafAngle) * leafR;
      const orientAngle = leafAngle + Math.PI / 2 + (leafRng() - 0.5) * 0.25; // point outward
      
      drawLeaf(ctx, lx, ly, orientAngle, leafSize, Math.floor(leafRng() * 100000));
    }
    
    // Berries between clusters (at halfway point)
    if (i < numClusters - 1) {
      const nextT = (i + 1) / numClusters;
      let nextAngle = -Math.PI + nextT * (2 * Math.PI);
      if (nextAngle > gapStart && nextAngle < gapEnd) continue;
      
      const midAngle = (angle + nextAngle) / 2;
      const numBerries = 1 + Math.floor(clusterRng() * 2); // 1-2
      
      for (let b = 0; b < numBerries; b++) {
        const berryRng = mulberry32(Math.floor(clusterRng() * 200000 + b * 777));
        const berryAngle = midAngle + (berryRng() - 0.5) * 0.1;
        const berryR = radius * (0.85 + berryRng() * 0.2);
        const bx = cx + Math.cos(berryAngle) * berryR;
        const by = cy + Math.sin(berryAngle) * berryR;
        const berrySize = radius * (0.05 + berryRng() * 0.04);
        
        ctx.beginPath();
        ctx.arc(bx, by, berrySize, 0, Math.PI * 2);
        ctx.fillStyle = '#C4963A';
        ctx.fill();
        
        // Berry highlight
        const bgrad = ctx.createRadialGradient(bx - berrySize * 0.25, by - berrySize * 0.3, berrySize * 0.05, bx, by, berrySize);
        bgrad.addColorStop(0, 'rgba(255,220,160,0.5)');
        bgrad.addColorStop(1, 'rgba(140,100,30,0.3)');
        ctx.fillStyle = bgrad;
        ctx.fill();
        
        ctx.strokeStyle = 'rgba(80,55,15,0.3)';
        ctx.lineWidth = berrySize * 0.3;
        ctx.stroke();
      }
    }
  }
  
  // Random small branch extensions (30% chance)
  if (rng() < 0.3) {
    const numExtensions = 1 + Math.floor(rng() * 2);
    for (let e = 0; e < numExtensions; e++) {
      const extAngle = gapStart + rng() * (gapEnd - gapStart);
      const extR = radius * 1.3;
      const extX = cx + Math.cos(extAngle) * radius * 0.8;
      const extY = cy + Math.sin(extAngle) * radius * 0.8;
      
      ctx.strokeStyle = 'rgba(80,55,15,0.3)';
      ctx.lineWidth = radius * 0.02;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(extAngle) * radius * 0.6, cy + Math.sin(extAngle) * radius * 0.6);
      ctx.quadraticCurveTo(extX, extY, extX + Math.cos(extAngle) * radius * 0.3, extY + Math.sin(extAngle) * radius * 0.3);
      ctx.stroke();
      
      // Small leaf at tip
      const tipSeed = Math.floor(rng() * 400000);
      drawLeaf(ctx, extX + Math.cos(extAngle) * radius * 0.3, 
                    extY + Math.sin(extAngle) * radius * 0.3,
                    extAngle + Math.PI / 2, leafSize * 0.5, tipSeed);
    }
  }
}

// ── Place wreaths in brick pattern ──
function placeWreaths(width, height) {
  const wreaths = [];
  const seed = 42;
  const rng = mulberry32(seed);
  
  // Two sizes: large ~22cm (450px), small ~9cm (184px)
  const largeDiamPx = 450;
  const smallDiamPx = 184;
  
  // Brick pattern spacing
  const cellW = largeDiamPx * 1.8; // ~810px horizontal spacing
  const cellH = largeDiamPx * 1.6; // ~720px vertical spacing
  
  const cols = Math.floor(width / cellW);
  const rows = Math.floor(height / cellH);
  
  // Adjust spacing to evenly fill the tile
  const actualCellW = width / cols;
  const actualCellH = height / rows;
  
  let id = 0;
  
  // Margin from edges for seamless tiling
  const margin = largeDiamPx / 2 + 30;
  
  for (let row = 0; row < rows; row++) {
    const isOffsetRow = row % 2 === 1;
    const startCol = isOffsetRow ? 0 : 0;
    const endCol = isOffsetRow ? cols - 1 : cols;
    
    for (let col = startCol; col < endCol; col++) {
      const offsetX = isOffsetRow ? actualCellW / 2 : 0;
      const cx = col * actualCellW + actualCellW / 2 + offsetX;
      const cy = row * actualCellH + actualCellH / 2;
      
      // Skip if too close to edges (leave margin for tiling)
      if (cx < margin || cx > width - margin || cy < margin || cy > height - margin) {
        continue;
      }
      
      const wreathRng = mulberry32(seed + id * 12345);
      const diam = largeDiamPx * (0.85 + wreathRng() * 0.3); // ±15%
      const radius = diam / 2;
      const wreathSeed = Math.floor(wreathRng() * 1000000);
      
      wreaths.push({
        cx, cy, radius,
        seed: wreathSeed,
        size: 'large',
        id: id++
      });
    }
  }
  
  // Add small wreaths in some gaps
  const smallRng = mulberry32(seed + 99999);
  for (let i = 0; i < wreaths.length * 0.6; i++) {
    // Try random positions
    const sx = margin + smallRng() * (width - 2 * margin);
    const sy = margin + smallRng() * (height - 2 * margin);
    const sDiam = smallDiamPx * (0.85 + smallRng() * 0.3);
    const sRadius = sDiam / 2;
    
    // Check distance from existing large wreaths
    let tooClose = false;
    for (const w of wreaths) {
      const dx = sx - w.cx;
      const dy = sy - w.cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < w.radius + sRadius + 50) {
        tooClose = true;
        break;
      }
    }
    
    if (!tooClose) {
      wreaths.push({
        cx: sx, cy: sy, radius: sRadius,
        seed: Math.floor(smallRng() * 1000000),
        size: 'small',
        id: id++
      });
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
  
  // Also pre-fill a full canvas for weave + wreaths
  // Fill base color with noise variation
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      
      // fBm noise for fabric texture
      const noiseVal = fBm(x / 150, y / 150, 6, 2.0, 0.5);
      // Map noise to ±BRIGHTNESS_VARIATION
      const brightnessFactor = 1.0 + (noiseVal - 0.5) * 2 * BRIGHTNESS_VARIATION;
      
      let r = Math.round(br * brightnessFactor);
      let g = Math.round(bg * brightnessFactor);
      let b = Math.round(bb * brightnessFactor);
      
      // Clamp
      r = Math.max(0, Math.min(255, r));
      g = Math.max(0, Math.min(255, g));
      b = Math.max(0, Math.min(255, b));
      
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
  }
  
  ctx.putImageData(imageData, 0, 0);
  
  // Draw weave pattern on top
  drawWeave(ctx, width, height);
  
  return canvas;
}

// ── Overlay wreaths on a canvas ──
function overlayWreaths(canvas) {
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  const wreaths = placeWreaths(width, height);
  
  console.log(`  Placing ${wreaths.length} wreaths (${wreaths.filter(w => w.size === 'large').length} large, ${wreaths.filter(w => w.size === 'small').length} small)`);
  
  for (const w of wreaths) {
    // Random metalness variation per wreath (for roughness map)
    w.metalness = 0.4 + (mulberry32(w.seed + 555)() * 0.3); // 0.4-0.7
    
    // Gold with slight color variation
    const goldRng = mulberry32(w.seed + 777);
    const goldBrightness = 0.9 + goldRng() * 0.2;
    const goldBase = lerpColor(GOLD_COLOR, 0xD4A84A, goldRng() * 0.5);
    
    drawWreath(ctx, w.cx, w.cy, w.radius, w.seed, {});
  }
  
  return wreaths;
}

// ── Generate normal map ──
function generateNormalMap(albedoCanvas, wreaths) {
  const width = albedoCanvas.width;
  const height = albedoCanvas.height;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  
  // Start with flat normal (128, 128, 255) = pointing up
  ctx.fillStyle = 'rgb(128, 128, 255)';
  ctx.fillRect(0, 0, width, height);
  
  const srcCtx = albedoCanvas.getContext('2d');
  const srcData = srcCtx.getImageData(0, 0, width, height).data;
  const normData = ctx.getImageData(0, 0, width, height);
  const nd = normData.data;
  
  // Fabric weave bump — slight elevation along weave lines
  const bumpStrength = 0.15; // from task spec
  const weavePx = WEAVE_SPACING_PX;
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      
      // Compute height from weave pattern
      const hPatternX = Math.sin(x / weavePx * Math.PI * 2) * 0.5 + 0.5;
      const hPatternY = Math.sin(y / weavePx * Math.PI * 2) * 0.5 + 0.5;
      let heightVal = (hPatternX * hPatternY) * 0.3;
      
      // Add fBm micro-texture
      const microNoise = fBm(x / 8, y / 8, 3, 2.0, 0.5);
      heightVal += microNoise * 0.15;
      
      // Check if pixel is on a wreath (gold color area)
      const r = srcData[idx];
      const g = srcData[idx + 1];
      const b = srcData[idx + 2];
      
      // Detect gold pixels — high red/green, lower blue
      const isGold = (r > 150 && g > 100 && b < 80 && r > b * 1.5 && g > b * 1.3);
      
      if (isGold) {
        // Mild relief for wreaths
        heightVal += 0.08;
      }
      
      // Compute gradient for normal
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

// Helper: get pixel "height" for normal computation
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
        // Lower roughness for gold to simulate metallic sheen
        // Use per-wreath metalness for variation
        // Find nearest wreath
        let minDist = Infinity;
        let nearestWreath = null;
        for (const w of wreaths) {
          const dx = x - w.cx;
          const dy = y - w.cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < minDist) {
            minDist = dist;
            nearestWreath = w;
          }
        }
        
        if (nearestWreath) {
          // Rougher toward edges of wreath
          const edgeFade = Math.min(1, minDist / nearestWreath.radius);
          const baseRoughness = 1.0 - nearestWreath.metalness; // 0.3-0.6
          roughness = baseRoughness + edgeFade * 0.25;
        } else {
          roughness = 0.5;
        }
      } else {
        // Fabric roughness
        const noiseVal = fBm(x / 100, y / 100, 4, 2.0, 0.5);
        roughness = 0.65 + noiseVal * 0.12; // ~0.65-0.77
      }
      
      // Clamp
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

// ── Save canvas to PNG ──
function saveCanvas(canvas, filepath) {
  const outDir = path.dirname(filepath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(filepath, buffer);
  console.log(`  Saved ${filepath} (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`);
}

// ── Main ──
function main() {
  console.log('Salon VII Wallpaper Generator');
  console.log(`  Texture size: ${SIZE}×${SIZE} px`);
  console.log(`  Tile size: ${TILE_METERS}m × ${TILE_METERS}m`);
  console.log('');
  
  const outDir = path.join(__dirname, '..', 'public', 'textures');
  
  // 1. Generate albedo map
  console.log('[1/3] Generating albedo map...');
  const albedo = generateAlbedo(SIZE, SIZE);
  const wreaths = overlayWreaths(albedo);
  saveCanvas(albedo, path.join(outDir, 'wallpaper-albedo.png'));
  
  // 2. Generate normal map
  console.log('[2/3] Generating normal map...');
  const normal = generateNormalMap(albedo, wreaths);
  saveCanvas(normal, path.join(outDir, 'wallpaper-normal.png'));
  
  // 3. Generate roughness map
  console.log('[3/3] Generating roughness map...');
  const roughness = generateRoughnessMap(albedo, wreaths);
  saveCanvas(roughness, path.join(outDir, 'wallpaper-roughness.png'));
  
  console.log('');
  console.log('Done! All textures generated in public/textures/');
}

main();
