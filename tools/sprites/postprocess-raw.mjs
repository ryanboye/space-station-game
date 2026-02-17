#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const THIS_FILE = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(THIS_FILE), '..', '..');
const TOOLS_DIR = path.resolve(ROOT, 'tools', 'sprites');
const RAW_DIR = path.resolve(TOOLS_DIR, 'out', 'raw');
const PROCESSED_DIR = path.resolve(TOOLS_DIR, 'out', 'processed');

const PROFILE_TO_REQUIRED = {
  test: path.resolve(TOOLS_DIR, 'required-keys-test.json'),
  v1: path.resolve(TOOLS_DIR, 'required-keys-v1.json'),
  'floors-walls': path.resolve(TOOLS_DIR, 'required-keys-floors-walls.json'),
  agents: path.resolve(TOOLS_DIR, 'required-keys-agents.json'),
  'tiles-full': path.resolve(TOOLS_DIR, 'required-keys-tiles-full.json')
};

const TARGET_SIZE = Number(process.env.SPRITE_PROCESS_TARGET_SIZE || 1024);
const BASE_CELL_SIZE = Number(process.env.SPRITE_ATLAS_CELL_SIZE || 64);
const SPACE_CELL_SIZE = Number(process.env.SPRITE_SPACE_ATLAS_SIZE || 256);
const TILE_BRIGHT_EDGE_MAX = Number(process.env.SPRITE_TILE_BRIGHT_EDGE_MAX || 0.08);
const TILE_TRANSPARENT_EDGE_MAX = Number(process.env.SPRITE_TILE_TRANSPARENT_EDGE_MAX || 0.02);
const TILE_SEAM_SCORE_MAX = Number(process.env.SPRITE_TILE_SEAM_SCORE_MAX || 0.22);
const NON_TILE_BORDER_OPAQUE_MAX = Number(process.env.SPRITE_NON_TILE_BORDER_OPAQUE_MAX || 0.5);
const NON_TILE_BRIGHT_BORDER_MAX = Number(process.env.SPRITE_NON_TILE_BRIGHT_BORDER_MAX || 0.22);
const MIN_ALPHA = Number(process.env.SPRITE_PROCESS_MIN_ALPHA || 8);

function parseArgs(argv) {
  const args = { profile: 'test', overwrite: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--profile' && argv[i + 1]) {
      args.profile = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--overwrite') {
      args.overwrite = true;
    }
  }
  return args;
}

function keyToFileName(key) {
  return `${key.replace(/[^a-zA-Z0-9]+/g, '_')}.png`;
}

async function readJson(filePath) {
  const text = await fs.readFile(filePath, 'utf8');
  return JSON.parse(text);
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function luminance(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function saturation(r, g, b) {
  return Math.max(r, g, b) - Math.min(r, g, b);
}

function isBrightBackgroundCandidate(r, g, b, a) {
  if (a < MIN_ALPHA) return false;
  const l = luminance(r, g, b);
  const s = saturation(r, g, b);
  return l >= 238 || (l >= 220 && s <= 22);
}

function detectDominantBorderColor(rgba, width, height) {
  const bins = new Map();
  let total = 0;

  const add = (x, y) => {
    const i = (y * width + x) * 4;
    const a = rgba[i + 3];
    if (a < MIN_ALPHA) return;
    const rq = Math.floor(rgba[i] / 16) * 16;
    const gq = Math.floor(rgba[i + 1] / 16) * 16;
    const bq = Math.floor(rgba[i + 2] / 16) * 16;
    const key = `${rq},${gq},${bq}`;
    bins.set(key, (bins.get(key) ?? 0) + 1);
    total += 1;
  };

  for (let x = 0; x < width; x++) {
    add(x, 0);
    add(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    add(0, y);
    add(width - 1, y);
  }

  if (total <= 0) return null;
  let bestKey = '';
  let bestCount = 0;
  for (const [key, count] of bins) {
    if (count > bestCount) {
      bestKey = key;
      bestCount = count;
    }
  }
  if (!bestKey) return null;
  const [r, g, b] = bestKey.split(',').map((value) => Number(value));
  return {
    r,
    g,
    b,
    ratio: bestCount / total
  };
}

function buildNonTileBackgroundPredicate(rgba, width, height) {
  const dominant = detectDominantBorderColor(rgba, width, height);
  if (!dominant || dominant.ratio < 0.42) {
    return isBrightBackgroundCandidate;
  }
  return (r, g, b, a) => {
    if (isBrightBackgroundCandidate(r, g, b, a)) return true;
    if (a < MIN_ALPHA) return false;
    const dr = r - dominant.r;
    const dg = g - dominant.g;
    const db = b - dominant.b;
    const distanceSq = dr * dr + dg * dg + db * db;
    return distanceSq <= 32 * 32;
  };
}

function floodFillBorderMask(rgba, width, height, predicate) {
  const visited = new Uint8Array(width * height);
  const queue = [];

  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const idx = y * width + x;
    if (visited[idx]) return;
    const offset = idx * 4;
    if (!predicate(rgba[offset], rgba[offset + 1], rgba[offset + 2], rgba[offset + 3])) return;
    visited[idx] = 1;
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

  return visited;
}

function clearAlphaByMask(rgba, mask) {
  for (let i = 0; i < mask.length; i++) {
    if (mask[i]) rgba[i * 4 + 3] = 0;
  }
}

function findAlphaBounds(rgba, width, height, minAlpha = MIN_ALPHA) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = rgba[(y * width + x) * 4 + 3];
      if (a < minAlpha) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX || maxY < minY) return null;
  return { left: minX, top: minY, right: maxX, bottom: maxY };
}

function cropRgba(rgba, width, height, bounds) {
  const outWidth = bounds.right - bounds.left + 1;
  const outHeight = bounds.bottom - bounds.top + 1;
  const out = new Uint8Array(outWidth * outHeight * 4);

  for (let y = 0; y < outHeight; y++) {
    const srcY = bounds.top + y;
    for (let x = 0; x < outWidth; x++) {
      const srcX = bounds.left + x;
      const srcI = (srcY * width + srcX) * 4;
      const dstI = (y * outWidth + x) * 4;
      out[dstI] = rgba[srcI];
      out[dstI + 1] = rgba[srcI + 1];
      out[dstI + 2] = rgba[srcI + 2];
      out[dstI + 3] = rgba[srcI + 3];
    }
  }

  return { data: out, width: outWidth, height: outHeight };
}

async function decodeRgba(source) {
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return {
    rgba: Uint8Array.from(data),
    width: info.width,
    height: info.height
  };
}

async function encodeRgba(rgba, width, height) {
  return sharp(Buffer.from(rgba), {
    raw: {
      width,
      height,
      channels: 4
    }
  })
    .png()
    .toBuffer();
}

function blendEdgePair(rgba, aIdx, bIdx, strength) {
  const aa = rgba[aIdx + 3];
  const ba = rgba[bIdx + 3];
  if (aa < MIN_ALPHA && ba < MIN_ALPHA) return;

  if (aa < MIN_ALPHA && ba >= MIN_ALPHA) {
    rgba[aIdx] = rgba[bIdx];
    rgba[aIdx + 1] = rgba[bIdx + 1];
    rgba[aIdx + 2] = rgba[bIdx + 2];
    rgba[aIdx + 3] = rgba[bIdx + 3];
    return;
  }
  if (ba < MIN_ALPHA && aa >= MIN_ALPHA) {
    rgba[bIdx] = rgba[aIdx];
    rgba[bIdx + 1] = rgba[aIdx + 1];
    rgba[bIdx + 2] = rgba[aIdx + 2];
    rgba[bIdx + 3] = rgba[aIdx + 3];
    return;
  }

  for (let ch = 0; ch < 3; ch++) {
    const av = rgba[aIdx + ch];
    const bv = rgba[bIdx + ch];
    const mid = (av + bv) * 0.5;
    rgba[aIdx + ch] = clampByte(av * (1 - strength) + mid * strength);
    rgba[bIdx + ch] = clampByte(bv * (1 - strength) + mid * strength);
  }
}

function harmonizeOppositeEdges(rgba, width, height, strength = 0.4) {
  for (let y = 0; y < height; y++) {
    const left = (y * width) * 4;
    const right = (y * width + (width - 1)) * 4;
    blendEdgePair(rgba, left, right, strength);
  }
  for (let x = 0; x < width; x++) {
    const top = x * 4;
    const bottom = ((height - 1) * width + x) * 4;
    blendEdgePair(rgba, top, bottom, strength);
  }
}

function flattenTransparencyToAverage(rgba) {
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let weight = 0;

  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3];
    if (a < MIN_ALPHA) continue;
    sumR += rgba[i] * a;
    sumG += rgba[i + 1] * a;
    sumB += rgba[i + 2] * a;
    weight += a;
  }

  const avgR = weight > 0 ? sumR / weight : 0;
  const avgG = weight > 0 ? sumG / weight : 0;
  const avgB = weight > 0 ? sumB / weight : 0;

  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3];
    if (a >= 255) continue;
    const alpha = a / 255;
    rgba[i] = clampByte(rgba[i] * alpha + avgR * (1 - alpha));
    rgba[i + 1] = clampByte(rgba[i + 1] * alpha + avgG * (1 - alpha));
    rgba[i + 2] = clampByte(rgba[i + 2] * alpha + avgB * (1 - alpha));
    rgba[i + 3] = 255;
  }
}

function edgeStats(rgba, width, height) {
  let edgePixels = 0;
  let brightOpaque = 0;
  let transparent = 0;
  let opaque = 0;

  const visit = (x, y) => {
    const i = (y * width + x) * 4;
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    const a = rgba[i + 3];
    edgePixels += 1;
    if (a < MIN_ALPHA) transparent += 1;
    else opaque += 1;
    if (a >= 220 && r >= 230 && g >= 230 && b >= 230) brightOpaque += 1;
  };

  for (let x = 0; x < width; x++) {
    visit(x, 0);
    if (height > 1) visit(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    visit(0, y);
    if (width > 1) visit(width - 1, y);
  }

  return {
    edgePixels,
    brightOpaqueRatio: edgePixels > 0 ? brightOpaque / edgePixels : 0,
    transparentRatio: edgePixels > 0 ? transparent / edgePixels : 0,
    opaqueRatio: edgePixels > 0 ? opaque / edgePixels : 0
  };
}

function seamScore(rgba, width, height) {
  let sum = 0;
  let count = 0;

  for (let y = 0; y < height; y++) {
    const left = (y * width) * 4;
    const right = (y * width + (width - 1)) * 4;
    const alphaWeight = ((rgba[left + 3] + rgba[right + 3]) * 0.5) / 255;
    const diff =
      Math.abs(rgba[left] - rgba[right]) +
      Math.abs(rgba[left + 1] - rgba[right + 1]) +
      Math.abs(rgba[left + 2] - rgba[right + 2]);
    sum += (diff / 765) * alphaWeight;
    count += 1;
  }

  for (let x = 0; x < width; x++) {
    const top = x * 4;
    const bottom = ((height - 1) * width + x) * 4;
    const alphaWeight = ((rgba[top + 3] + rgba[bottom + 3]) * 0.5) / 255;
    const diff =
      Math.abs(rgba[top] - rgba[bottom]) +
      Math.abs(rgba[top + 1] - rgba[bottom + 1]) +
      Math.abs(rgba[top + 2] - rgba[bottom + 2]);
    sum += (diff / 765) * alphaWeight;
    count += 1;
  }

  return count > 0 ? sum / count : 0;
}

function isTileKey(key) {
  return key.startsWith('tile.');
}

const MODULE_FOOTPRINT_BY_KEY = {
  'module.none': { w: 1, h: 1 },
  'module.bed': { w: 2, h: 1 },
  'module.table': { w: 2, h: 2 },
  'module.serving_station': { w: 2, h: 1 },
  'module.stove': { w: 2, h: 1 },
  'module.workbench': { w: 2, h: 1 },
  'module.med_bed': { w: 2, h: 1 },
  'module.cell_console': { w: 1, h: 1 },
  'module.rec_unit': { w: 2, h: 2 },
  'module.grow_station': { w: 2, h: 2 },
  'module.terminal': { w: 1, h: 1 },
  'module.couch': { w: 2, h: 1 },
  'module.game_station': { w: 2, h: 2 },
  'module.shower': { w: 1, h: 1 },
  'module.sink': { w: 1, h: 1 },
  'module.market_stall': { w: 2, h: 1 },
  'module.intake_pallet': { w: 2, h: 2 },
  'module.storage_rack': { w: 2, h: 1 }
};

function targetDimensionsForKey(profile, key) {
  if (profile === 'tiles-full' && isTileKey(key)) {
    const size = key === 'tile.space' ? SPACE_CELL_SIZE : BASE_CELL_SIZE;
    return { width: size, height: size };
  }
  const footprint = MODULE_FOOTPRINT_BY_KEY[key];
  if (footprint) {
    return { width: TARGET_SIZE * footprint.w, height: TARGET_SIZE * footprint.h };
  }
  return { width: TARGET_SIZE, height: TARGET_SIZE };
}

function transparentCanvas(width = TARGET_SIZE, height = TARGET_SIZE) {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .png()
    .toBuffer();
}

async function processTileBuffer(rawBuffer, targetSize) {
  let { rgba, width, height } = await decodeRgba(rawBuffer);
  const initialStats = edgeStats(rgba, width, height);
  if (initialStats.brightOpaqueRatio >= 0.25) {
    const borderMask = floodFillBorderMask(rgba, width, height, isBrightBackgroundCandidate);
    clearAlphaByMask(rgba, borderMask);
  }

  const bounds = findAlphaBounds(rgba, width, height);
  if (bounds) {
    const cropped = cropRgba(rgba, width, height, bounds);
    rgba = cropped.data;
    width = cropped.width;
    height = cropped.height;
  }

  const croppedBuffer = await encodeRgba(rgba, width, height);
  const resizedBuffer = await sharp(croppedBuffer)
    .resize(targetSize, targetSize, {
      fit: 'cover',
      position: 'centre',
      kernel: 'nearest'
    })
    .png()
    .toBuffer();

  const resized = await decodeRgba(resizedBuffer);
  harmonizeOppositeEdges(resized.rgba, resized.width, resized.height, 0.4);
  flattenTransparencyToAverage(resized.rgba);

  const finalBuffer = await encodeRgba(resized.rgba, resized.width, resized.height);
  const stats = edgeStats(resized.rgba, resized.width, resized.height);
  const seam = seamScore(resized.rgba, resized.width, resized.height);

  return {
    buffer: finalBuffer,
    stats,
    seam
  };
}

async function processNonTileBuffer(rawBuffer, key, targetWidth, targetHeight) {
  if (key === 'module.none') {
    return {
      buffer: await transparentCanvas(targetWidth, targetHeight),
      stats: { edgePixels: 0, brightOpaqueRatio: 0, transparentRatio: 1, opaqueRatio: 0 }
    };
  }

  let { rgba, width, height } = await decodeRgba(rawBuffer);
  const nonTileBackgroundPredicate = buildNonTileBackgroundPredicate(rgba, width, height);
  const borderMask = floodFillBorderMask(rgba, width, height, nonTileBackgroundPredicate);
  clearAlphaByMask(rgba, borderMask);

  const bounds = findAlphaBounds(rgba, width, height);
  let croppedBuffer;
  if (!bounds) {
    croppedBuffer = await transparentCanvas(targetWidth, targetHeight);
  } else {
    const marginX = Math.max(2, Math.floor((bounds.right - bounds.left + 1) * 0.06));
    const marginY = Math.max(2, Math.floor((bounds.bottom - bounds.top + 1) * 0.06));
    const expanded = {
      left: Math.max(0, bounds.left - marginX),
      top: Math.max(0, bounds.top - marginY),
      right: Math.min(width - 1, bounds.right + marginX),
      bottom: Math.min(height - 1, bounds.bottom + marginY)
    };
    const cropped = cropRgba(rgba, width, height, expanded);
    croppedBuffer = await encodeRgba(cropped.data, cropped.width, cropped.height);
  }

  const containedBuffer = await sharp(croppedBuffer)
    .resize(targetWidth, targetHeight, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: 'nearest'
    })
    .png()
    .toBuffer();

  const final = await decodeRgba(containedBuffer);
  return {
    buffer: containedBuffer,
    stats: edgeStats(final.rgba, final.width, final.height)
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!Object.hasOwn(PROFILE_TO_REQUIRED, args.profile)) {
    throw new Error(`Unsupported profile: ${args.profile}. Use one of: ${Object.keys(PROFILE_TO_REQUIRED).join(', ')}`);
  }

  const requiredKeys = await readJson(PROFILE_TO_REQUIRED[args.profile]);
  if (!Array.isArray(requiredKeys) || requiredKeys.some((key) => typeof key !== 'string')) {
    throw new Error(`Invalid required keys file for profile=${args.profile}`);
  }

  await fs.mkdir(PROCESSED_DIR, { recursive: true });

  const missing = [];
  const failures = [];
  let processed = 0;

  for (const key of requiredKeys) {
    const inputPath = path.resolve(RAW_DIR, keyToFileName(key));
    const outputPath = path.resolve(PROCESSED_DIR, keyToFileName(key));

    if (!(await fileExists(inputPath))) {
      missing.push(key);
      continue;
    }

    if (!args.overwrite && (await fileExists(outputPath))) {
      continue;
    }

    const rawBuffer = await fs.readFile(inputPath);
    const targetDims = targetDimensionsForKey(args.profile, key);

    if (isTileKey(key)) {
      const result = await processTileBuffer(rawBuffer, targetDims.width);
      const brightFail = result.stats.brightOpaqueRatio > TILE_BRIGHT_EDGE_MAX;
      const transparentFail = result.stats.transparentRatio > TILE_TRANSPARENT_EDGE_MAX;
      const seamFail = result.seam > TILE_SEAM_SCORE_MAX;
      if (brightFail || transparentFail || seamFail) {
        failures.push(
          `${key} tile thresholds failed (bright=${result.stats.brightOpaqueRatio.toFixed(3)}, transparent=${result.stats.transparentRatio.toFixed(3)}, seam=${result.seam.toFixed(3)})`
        );
      }
      await fs.writeFile(outputPath, result.buffer);
      processed += 1;
      continue;
    }

    const result = await processNonTileBuffer(rawBuffer, key, targetDims.width, targetDims.height);
    const opaqueFail = result.stats.opaqueRatio > NON_TILE_BORDER_OPAQUE_MAX;
    const brightFail = result.stats.brightOpaqueRatio > NON_TILE_BRIGHT_BORDER_MAX;
    if (opaqueFail || brightFail) {
      failures.push(
        `${key} non-tile border thresholds failed (opaque=${result.stats.opaqueRatio.toFixed(3)}, bright=${result.stats.brightOpaqueRatio.toFixed(3)})`
      );
    }
    await fs.writeFile(outputPath, result.buffer);
    processed += 1;
  }

  if (missing.length > 0 || failures.length > 0) {
    const messages = [];
    if (missing.length > 0) messages.push(`Missing raw keys (${missing.length}): ${missing.join(', ')}`);
    if (failures.length > 0) messages.push(`Post-process threshold failures:\n${failures.join('\n')}`);
    throw new Error(messages.join('\n'));
  }

  console.log(`Sprite post-process complete. profile=${args.profile}, processed=${processed}, outDir=${PROCESSED_DIR}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
