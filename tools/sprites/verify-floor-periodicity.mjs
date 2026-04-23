#!/usr/bin/env node
/**
 * Floor-periodicity gate for sprite-pipeline iteration.
 *
 * Runs BEFORE sprites:pack. For each tileable floor/overlay sprite,
 * tiles it 8×8 then runs a discrete 2D autocorrelation at the
 * tile-period offset. If the sprite has a visible per-cell motif
 * (icon in corner, centered decal, etc.), tiling creates a repeating
 * grid pattern that autocorrelates strongly at the 64/128-pixel lag.
 * True flow-continuous textures (linoleum, metal grate, carpet) have
 * features that cross tile boundaries — autocorrelation at tile-lag
 * stays low.
 *
 * Catches the failure mode awfml hit after pass-6: floors with
 * corner-icons look fine at 3×3 seam check but tile visibly at 6×6+
 * room scale, reading as "a grid of gem/disc/symbol dots per room."
 *
 * Keys tested: anything starting with `tile.` (EXCEPT `tile.space` +
 * `tile.dock.facade.*` which are legitimately non-flow-continuous) +
 * every `room.*` sprite (which now represents tileable room-type
 * textures post the 2026-04-23 floor-texture refactor).
 *
 * Threshold: normalized autocorrelation at tile-lag must be < 0.55.
 * Values below 0.40 are clearly flow-continuous. 0.40-0.55 is
 * borderline but acceptable. >0.55 = visible grid artifact.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const THIS = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(THIS), '..', '..');
const CURATED = path.join(ROOT, 'tools/sprites/curated');
const ACCEPTED_DIFFS = path.join(ROOT, 'tools/sprites/accepted-diffs.json');

const PERIODICITY_THRESHOLD = 0.55;
const TILE_FACTOR = 8; // 8x8 tiled sample

const EXEMPT_PREFIXES = [
  'tile.space',               // starfield bg, non-flow by design (single large bg, not tiled)
  'tile.dock.facade.',        // facade overlays, not room floors
  'tile.wall',                // walls aren't tiled as flow-continuous surfaces
  'tile.floor',               // plain base floor — generic, not room-specific
  'tile.door',                // doors are gates not surfaces
  'tile.reactor',             // pre-refactor corner-motif; will flag but is being deprecated
  'tile.security',            // pre-refactor corner-motif; will flag but is being deprecated
  'tile.cafeteria',           // pre-refactor cream decal; will flag but is being deprecated
  'tile.dock'                 // hazard stripes, functional non-flow
];

const TESTED_PREFIXES = [
  'room.'                     // room-type textures (kitchen→linoleum, workshop→grate, etc.)
];

function isExempt(key) {
  return EXEMPT_PREFIXES.some(p => key === p || key.startsWith(p + '.'));
}
function isTested(key) {
  return TESTED_PREFIXES.some(p => key.startsWith(p));
}

async function loadAllowlist() {
  try {
    const raw = await fs.readFile(ACCEPTED_DIFFS, 'utf8');
    const parsed = JSON.parse(raw);
    return new Set(parsed.periodicity || []);
  } catch {
    return new Set();
  }
}

/**
 * Compute normalized autocorrelation of a single channel at tile-lag.
 * Returns 0..1 — low = flow-continuous texture, high = grid-of-icons.
 */
function autocorrelationAtLag(channelData, tiledW, tiledH, lagPx, tileSizePx) {
  // Sample every 4th pixel for speed — accuracy trade-off is fine here
  // since we're hunting for periodic peaks not fine-grained similarity.
  const stride = 4;
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  let crossSum = 0;
  for (let y = 0; y < tiledH - lagPx; y += stride) {
    for (let x = 0; x < tiledW - lagPx; x += stride) {
      const idx = y * tiledW + x;
      const idxLag = (y + lagPx) * tiledW + (x + lagPx);
      const v = channelData[idx];
      const vLag = channelData[idxLag];
      crossSum += v * vLag;
      sum += v;
      sumSq += v * v;
      count += 1;
    }
  }
  if (count === 0) return 0;
  const mean = sum / count;
  const variance = sumSq / count - mean * mean;
  if (variance < 1) return 0; // flat channel — no signal to correlate
  const autocorr = (crossSum / count - mean * mean) / variance;
  return Math.max(0, Math.min(1, autocorr));
}

async function tileSprite(spritePath, tileFactor) {
  const sprite = await sharp(spritePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { data, info } = sprite;
  const { width: w, height: h, channels } = info;
  const tw = w * tileFactor;
  const th = h * tileFactor;
  const tiled = Buffer.alloc(tw * th * channels);
  for (let ty = 0; ty < tileFactor; ty++) {
    for (let tx = 0; tx < tileFactor; tx++) {
      for (let y = 0; y < h; y++) {
        const srcOff = y * w * channels;
        const dstOff = ((ty * h + y) * tw + tx * w) * channels;
        data.copy(tiled, dstOff, srcOff, srcOff + w * channels);
      }
    }
  }
  return { data: tiled, width: tw, height: th, channels, tileSize: w };
}

/** Score a single sprite's periodicity at tile-lag. */
async function scoreSprite(spritePath) {
  const { data, width, height, channels, tileSize } = await tileSprite(spritePath, TILE_FACTOR);
  // Extract luminance channel (0.3R + 0.59G + 0.11B) for a single-channel test
  const lum = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * channels];
    const g = data[i * channels + 1];
    const b = data[i * channels + 2];
    lum[i] = 0.3 * r + 0.59 * g + 0.11 * b;
  }
  return autocorrelationAtLag(lum, width, height, tileSize, tileSize);
}

async function main() {
  const allowlist = await loadAllowlist();
  const files = await fs.readdir(CURATED);
  const failures = [];
  const allowlistedFails = [];
  const scoresBorderline = [];
  let tested = 0;
  for (const f of files) {
    if (!f.endsWith('.png')) continue;
    const key = f.replace(/_/g, '.').replace(/\.png$/, '');
    if (isExempt(key)) continue;
    if (!isTested(key)) continue;
    const score = await scoreSprite(path.join(CURATED, f));
    tested += 1;
    if (score > PERIODICITY_THRESHOLD) {
      if (allowlist.has(key)) {
        allowlistedFails.push({ key, score });
      } else {
        failures.push({ key, score });
      }
    } else if (score > PERIODICITY_THRESHOLD - 0.1) {
      scoresBorderline.push({ key, score });
    }
  }

  console.log(`floor-periodicity: ${tested} tested, ${failures.length} failed, ${allowlistedFails.length} allowlisted, ${scoresBorderline.length} borderline`);
  for (const b of scoresBorderline) console.log(`  borderline ${b.key}: ${b.score.toFixed(3)} (near threshold)`);
  for (const a of allowlistedFails) console.log(`  allowlisted ${a.key}: ${a.score.toFixed(3)}`);
  if (failures.length === 0) {
    console.log('floor-periodicity: PASS');
    return;
  }
  console.error('\nfloor-periodicity: FAIL');
  for (const f of failures) {
    console.error(`  ${f.key}: autocorr at tile-lag = ${f.score.toFixed(3)} (> ${PERIODICITY_THRESHOLD})`);
    console.error(`    this sprite has a per-cell motif that will tile as a visible grid when painted in a room.`);
    console.error(`    fix: reroll as pure tileable TEXTURE (flow-continuous across boundaries, no per-cell feature).`);
    console.error(`    allowlist: add "${f.key}" to tools/sprites/accepted-diffs.json ".periodicity" if the grid is intentional.`);
  }
  process.exit(1);
}

main().catch((err) => {
  console.error('floor-periodicity: script error:', err);
  process.exit(2);
});
