#!/usr/bin/env node
/**
 * Regression gate for sprite-pipeline iteration.
 *
 * Runs BEFORE sprites:pack. For each key with a golden in
 * `tools/sprites/golden/{key_underscored}.png`, compares the current
 * `tools/sprites/curated/{key_underscored}.png` against the golden on
 * three axes:
 *   (a) pixel-RMS per channel (structural)
 *   (b) HSV palette histogram distance (color drift)
 *   (c) binarized silhouette IoU (camera-angle regression)
 *
 * If any metric exceeds its threshold AND the key isn't in the
 * `tools/sprites/accepted-diffs.json` allowlist, the script exits with
 * code 1 and a clear summary so pack fails loudly.
 *
 * Locks in awfml/tinyclaw/seb's approved work from golden — future gens
 * can't silently regress past their baseline.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const THIS = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(THIS), '..', '..');
const CURATED = path.join(ROOT, 'tools/sprites/curated');
const GOLDEN = path.join(ROOT, 'tools/sprites/golden');
const ACCEPTED_DIFFS = path.join(ROOT, 'tools/sprites/accepted-diffs.json');

// Thresholds — tuned by tinyclaw's spec
const THRESHOLDS = {
  pixelRmsPerChannel: 42,   // 0-255 scale; ~16% channel drift
  paletteDistance: 0.35,    // 0-1 normalized HSV histogram distance
  silhouetteIouMin: 0.60,   // IoU floor — below this = shape changed a lot
};

async function readRaw(p) {
  const img = sharp(p).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height, channels: info.channels };
}

function pixelRmsPerChannel(a, b) {
  if (a.data.length !== b.data.length) return Infinity;
  let sumR = 0, sumG = 0, sumB = 0, n = 0;
  for (let i = 0; i < a.data.length; i += a.channels) {
    const aa = a.data[i + 3], ba = b.data[i + 3];
    if (aa < 32 && ba < 32) continue; // both transparent — skip
    sumR += (a.data[i] - b.data[i]) ** 2;
    sumG += (a.data[i + 1] - b.data[i + 1]) ** 2;
    sumB += (a.data[i + 2] - b.data[i + 2]) ** 2;
    n++;
  }
  if (n === 0) return 0;
  return Math.sqrt((sumR + sumG + sumB) / (3 * n));
}

function hsvFromRgb(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

function paletteHistogram(raw) {
  // 5-bucket hue × 2-bucket value → 10-bucket weighted hist, counts opaque pixels
  const hist = new Array(10).fill(0);
  let total = 0;
  for (let i = 0; i < raw.data.length; i += raw.channels) {
    if (raw.data[i + 3] < 32) continue;
    const { h, s, v } = hsvFromRgb(raw.data[i], raw.data[i + 1], raw.data[i + 2]);
    // Low saturation = grey bucket, ignore hue
    const hueBucket = s < 0.15 ? 5 : Math.floor(h / 72) % 5;
    const valBucket = v < 0.5 ? 0 : 1;
    const idx = valBucket * 5 + hueBucket;
    hist[idx]++;
    total++;
  }
  if (total === 0) return hist;
  for (let i = 0; i < hist.length; i++) hist[i] /= total;
  return hist;
}

function paletteDistance(ha, hb) {
  // L1 divided by 2 → normalized to [0, 1]
  let sum = 0;
  for (let i = 0; i < ha.length; i++) sum += Math.abs(ha[i] - hb[i]);
  return sum / 2;
}

function binarize(raw) {
  // Alpha > 32 = shape. Returns flat Uint8Array of 0/1.
  const out = new Uint8Array(raw.w * raw.h);
  for (let i = 0; i < raw.w * raw.h; i++) {
    out[i] = raw.data[i * raw.channels + 3] >= 32 ? 1 : 0;
  }
  return out;
}

function silhouetteIou(a, b) {
  if (a.w !== b.w || a.h !== b.h) return 0;
  const ma = binarize(a), mb = binarize(b);
  let inter = 0, uni = 0;
  for (let i = 0; i < ma.length; i++) {
    if (ma[i] || mb[i]) uni++;
    if (ma[i] && mb[i]) inter++;
  }
  return uni === 0 ? 1 : inter / uni;
}

async function loadAllowlist() {
  try {
    const text = await fs.readFile(ACCEPTED_DIFFS, 'utf8');
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function keyToFilename(key) {
  return key.replace(/[^a-zA-Z0-9]+/g, '_') + '.png';
}

async function main() {
  const goldenFiles = (await fs.readdir(GOLDEN).catch(() => [])).filter((f) => f.endsWith('.png'));
  if (goldenFiles.length === 0) {
    console.log('[verify-golden] no goldens yet — skip. run the sprite-review harness to approve baselines.');
    return;
  }
  const allowlist = await loadAllowlist();
  console.log(`[verify-golden] checking ${goldenFiles.length} goldens against curated/ …`);

  const failures = [];
  for (const f of goldenFiles) {
    const key = f.replace(/\.png$/, '');
    const goldenPath = path.join(GOLDEN, f);
    const curatedPath = path.join(CURATED, f);

    let golden, current;
    try { golden = await readRaw(goldenPath); } catch (e) { console.warn(`  [skip] ${key}: golden unreadable (${e.message})`); continue; }
    try { current = await readRaw(curatedPath); } catch (e) {
      failures.push({ key, reason: `curated/${f} missing`, metrics: {} });
      continue;
    }

    // Normalize sizes — downsample both to smaller-of-the-two
    const targetW = Math.min(golden.w, current.w);
    const targetH = Math.min(golden.h, current.h);
    if (golden.w !== targetW || golden.h !== targetH) {
      golden = await readRaw(await sharp(goldenPath).resize(targetW, targetH, { kernel: 'nearest' }).png().toBuffer());
    }
    if (current.w !== targetW || current.h !== targetH) {
      current = await readRaw(await sharp(curatedPath).resize(targetW, targetH, { kernel: 'nearest' }).png().toBuffer());
    }

    const rms = pixelRmsPerChannel(current, golden);
    const palDist = paletteDistance(paletteHistogram(current), paletteHistogram(golden));
    const iou = silhouetteIou(current, golden);

    const metrics = { rms: +rms.toFixed(1), palette: +palDist.toFixed(3), iou: +iou.toFixed(3) };

    const reasons = [];
    if (rms > THRESHOLDS.pixelRmsPerChannel) reasons.push(`pixel-rms ${metrics.rms} > ${THRESHOLDS.pixelRmsPerChannel}`);
    if (palDist > THRESHOLDS.paletteDistance) reasons.push(`palette-drift ${metrics.palette} > ${THRESHOLDS.paletteDistance}`);
    if (iou < THRESHOLDS.silhouetteIouMin) reasons.push(`silhouette-iou ${metrics.iou} < ${THRESHOLDS.silhouetteIouMin}`);

    if (reasons.length > 0) {
      if (allowlist[key]) {
        console.log(`  [allow] ${key} drifted but allowlisted: ${allowlist[key]}`);
        continue;
      }
      failures.push({ key, reason: reasons.join('; '), metrics });
    }
  }

  if (failures.length > 0) {
    console.error('\n[verify-golden] FAIL: sprite(s) drifted past threshold vs approved golden:');
    for (const f of failures) {
      console.error(`  ✗ ${f.key}: ${f.reason}`);
      if (Object.keys(f.metrics).length > 0) console.error(`      metrics: ${JSON.stringify(f.metrics)}`);
    }
    console.error(`\nTo accept a diff intentionally, add an entry to ${path.relative(ROOT, ACCEPTED_DIFFS)}:`);
    console.error('  { "tile.wall.solo": "reroll approved by awfml 2026-04-23 — new walls-v4 palette" }');
    console.error('Or re-approve the new version in the sprite-review harness to update the golden.');
    process.exit(1);
  }
  console.log(`[verify-golden] ✓ all ${goldenFiles.length} goldens within threshold.`);
}

main().catch((err) => { console.error(err.stack || err.message); process.exit(1); });
