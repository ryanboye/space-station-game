#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const THIS_FILE = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(THIS_FILE), '..', '..');
const CURATED_DIR = path.resolve(ROOT, 'tools', 'sprites', 'curated');

const MODULE_KEYS = [
  'module.bed',
  'module.table',
  'module.serving_station',
  'module.stove',
  'module.workbench',
  'module.med_bed',
  'module.cell_console',
  'module.rec_unit',
  'module.grow_station',
  'module.terminal',
  'module.couch',
  'module.game_station',
  'module.shower',
  'module.sink',
  'module.market_stall',
  'module.intake_pallet',
  'module.storage_rack',
  'module.wall_light'
];

const FORCE_TOLERANCE_BY_KEY = {
  'module.shower': 60,
  'module.sink': 58,
  'module.table': 48,
  'module.rec_unit': 48,
  'module.grow_station': 48,
  'module.game_station': 48,
  'module.intake_pallet': 44
};

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

function applyMask(rgba, width, height, mask) {
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const p = i * 4;
    rgba[p + 3] = 0;

    const x = i % width;
    const y = Math.floor(i / width);
    for (let ny = y - 1; ny <= y + 1; ny++) {
      for (let nx = x - 1; nx <= x + 1; nx++) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const n = ny * width + nx;
        if (mask[n]) continue;
        const np = n * 4;
        if (rgba[np + 3] > 0) rgba[np + 3] = Math.max(160, rgba[np + 3] - 32);
      }
    }
  }
}

async function cleanupOne(key) {
  const filePath = path.resolve(CURATED_DIR, keyToFileName(key));
  if (!(await fileExists(filePath))) return null;
  const image = await sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const rgba = Uint8Array.from(image.data);
  const { width, height } = image.info;
  const color = quantizedBorderMode(rgba, width, height);
  if (!color) return null;
  const tolerance = FORCE_TOLERANCE_BY_KEY[key] ?? 40;
  const mask = floodFillBackground(rgba, width, height, color, tolerance);
  const cleared = mask.reduce((sum, value) => sum + value, 0);
  if (cleared <= 0) return null;
  applyMask(rgba, width, height, mask);
  await sharp(Buffer.from(rgba), { raw: { width, height, channels: 4 } }).png().toFile(filePath);
  return { key, cleared, pixels: width * height };
}

async function main() {
  const results = [];
  for (const key of MODULE_KEYS) {
    const result = await cleanupOne(key);
    if (result) results.push(result);
  }
  for (const result of results) {
    console.log(`${result.key}: cleared ${(result.cleared / result.pixels).toFixed(3)} of pixels`);
  }
  console.log(`cleaned ${results.length} module sprites`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
