#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const THIS_FILE = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(THIS_FILE), '..', '..');
const CURATED_DIR = path.resolve(ROOT, 'tools', 'sprites', 'curated');

const OBJECT_KEYS = [
  'ship.tourist',
  'ship.trader',
  'ship.industrial',
  'ship.military',
  'ship.colonist',
  'agent.visitor.1',
  'agent.visitor.2',
  'agent.visitor.3',
  'agent.visitor.4',
  'agent.visitor.5',
  'agent.visitor.6',
  'agent.resident.1',
  'agent.resident.2',
  'agent.resident.3',
  'agent.resident.4',
  'agent.resident.5',
  'agent.resident.6',
  'agent.crew.1',
  'agent.crew.2',
  'agent.crew.3',
  'agent.crew.4',
  'agent.crew.5',
  'agent.crew.6',
  'icon.tier1_unlock',
  'icon.tier2_unlock',
  'icon.tier3_unlock',
  'icon.tier4_unlock',
  'icon.tier5_unlock',
  'icon.tier6_unlock'
];

const TOLERANCE_BY_PREFIX = [
  [/^ship\./, 58],
  [/^agent\./, 28],
  [/^icon\./, 64]
];

function keyToFileName(key) {
  return `${key.replace(/[^a-zA-Z0-9]+/g, '_')}.png`;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function toleranceForKey(key) {
  for (const [pattern, tolerance] of TOLERANCE_BY_PREFIX) {
    if (pattern.test(key)) return tolerance;
  }
  return 48;
}

function quantizedBorderMode(rgba, width, height) {
  const bins = new Map();
  const add = (x, y) => {
    const i = (y * width + x) * 4;
    const a = rgba[i + 3];
    if (a < 8) return;
    const r = Math.round(rgba[i] / 8) * 8;
    const g = Math.round(rgba[i + 1] / 8) * 8;
    const b = Math.round(rgba[i + 2] / 8) * 8;
    const key = `${r},${g},${b}`;
    bins.set(key, (bins.get(key) ?? 0) + 1);
  };

  for (let x = 0; x < width; x++) {
    add(x, 0);
    add(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    add(0, y);
    add(width - 1, y);
  }

  let best = '';
  let bestCount = 0;
  for (const [key, count] of bins) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  if (!best) return null;
  const [r, g, b] = best.split(',').map(Number);
  return { r, g, b };
}

function colorDistanceSq(rgba, i, color) {
  const dr = rgba[i] - color.r;
  const dg = rgba[i + 1] - color.g;
  const db = rgba[i + 2] - color.b;
  return dr * dr + dg * dg + db * db;
}

function floodFillBackground(rgba, width, height, color, tolerance) {
  const mask = new Uint8Array(width * height);
  const queue = [];
  const toleranceSq = tolerance * tolerance;
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const idx = y * width + x;
    if (mask[idx]) return;
    const i = idx * 4;
    if (rgba[i + 3] < 8 || colorDistanceSq(rgba, i, color) > toleranceSq) return;
    mask[idx] = 1;
    queue.push(idx);
  };

  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    push(0, y);
    push(width - 1, y);
  }

  let q = 0;
  while (q < queue.length) {
    const idx = queue[q++];
    const x = idx % width;
    const y = Math.floor(idx / width);
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
  return mask;
}

function clearGuideMarks(rgba, width, height) {
  let cleared = 0;
  for (let i = 0; i < width * height; i++) {
    const p = i * 4;
    const r = rgba[p];
    const g = rgba[p + 1];
    const b = rgba[p + 2];
    const a = rgba[p + 3];
    if (a < 8) continue;
    const magentaGuide = r > 140 && b > 120 && g < 90;
    const cyanGuide = g > 130 && b > 130 && r < 110;
    if (!magentaGuide && !cyanGuide) continue;
    rgba[p + 3] = 0;
    cleared += 1;
  }
  return cleared;
}

function keepLargestAlphaComponent(rgba, width, height) {
  const visited = new Uint8Array(width * height);
  const components = [];
  for (let start = 0; start < width * height; start++) {
    if (visited[start] || rgba[start * 4 + 3] < 8) continue;
    const queue = [start];
    const pixels = [];
    visited[start] = 1;
    let q = 0;
    while (q < queue.length) {
      const idx = queue[q++];
      pixels.push(idx);
      const x = idx % width;
      const y = Math.floor(idx / width);
      const neighbors = [idx - 1, idx + 1, idx - width, idx + width];
      for (const next of neighbors) {
        if (next < 0 || next >= width * height || visited[next]) continue;
        const nx = next % width;
        const ny = Math.floor(next / width);
        if (Math.abs(nx - x) + Math.abs(ny - y) !== 1) continue;
        if (rgba[next * 4 + 3] < 8) continue;
        visited[next] = 1;
        queue.push(next);
      }
    }
    components.push(pixels);
  }

  if (components.length <= 1) return 0;
  components.sort((a, b) => b.length - a.length);
  const keep = new Set(components[0]);
  let cleared = 0;
  for (let i = 0; i < width * height; i++) {
    if (rgba[i * 4 + 3] < 8 || keep.has(i)) continue;
    rgba[i * 4 + 3] = 0;
    cleared += 1;
  }
  return cleared;
}

async function cleanupOne(key) {
  const filePath = path.resolve(CURATED_DIR, keyToFileName(key));
  if (!(await fileExists(filePath))) return null;
  const image = await sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const rgba = Uint8Array.from(image.data);
  const { width, height } = image.info;
  const color = quantizedBorderMode(rgba, width, height);
  if (!color) return null;
  const mask = floodFillBackground(rgba, width, height, color, toleranceForKey(key));
  const cleared = mask.reduce((sum, value) => sum + value, 0);
  if (cleared <= 0) return null;

  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    rgba[i * 4 + 3] = 0;
  }
  let guideCleared = clearGuideMarks(rgba, width, height);
  if (key.startsWith('agent.')) {
    guideCleared += keepLargestAlphaComponent(rgba, width, height);
  }
  await sharp(Buffer.from(rgba), { raw: { width, height, channels: 4 } }).png().toFile(filePath);
  return { key, cleared: cleared + guideCleared, pixels: width * height };
}

async function main() {
  const results = [];
  for (const key of OBJECT_KEYS) {
    const result = await cleanupOne(key);
    if (result) results.push(result);
  }
  for (const result of results) {
    console.log(`${result.key}: cleared ${(result.cleared / result.pixels).toFixed(3)} of pixels`);
  }
  console.log(`cleaned ${results.length} object sprites`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
