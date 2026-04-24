#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const THIS_FILE = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(THIS_FILE), '..', '..');
const TOOLS_DIR = path.resolve(ROOT, 'tools', 'sprites');
const OUTPUT_DIR = path.resolve(ROOT, 'public', 'assets', 'sprites');
const PROFILE_TO_REQUIRED = {
  test: path.resolve(TOOLS_DIR, 'required-keys-test.json'),
  v1: path.resolve(TOOLS_DIR, 'required-keys-v1.json'),
  'floors-walls': path.resolve(TOOLS_DIR, 'required-keys-floors-walls.json'),
  agents: path.resolve(TOOLS_DIR, 'required-keys-agents.json'),
  'tiles-full': path.resolve(TOOLS_DIR, 'required-keys-tiles-full.json')
};

const MIN_ALPHA = Number(process.env.SPRITE_PROCESS_MIN_ALPHA || 8);
const TILE_BRIGHT_EDGE_MAX = Number(process.env.SPRITE_TILE_BRIGHT_EDGE_MAX || 0.08);
const TILE_TRANSPARENT_EDGE_MAX = Number(process.env.SPRITE_TILE_TRANSPARENT_EDGE_MAX || 0.02);
const TILE_SEAM_SCORE_MAX = Number(process.env.SPRITE_TILE_SEAM_SCORE_MAX || 0.22);
const NON_TILE_BORDER_OPAQUE_MAX = Number(process.env.SPRITE_NON_TILE_BORDER_OPAQUE_MAX || 0.5);
const NON_TILE_BRIGHT_BORDER_MAX = Number(process.env.SPRITE_NON_TILE_BRIGHT_BORDER_MAX || 0.22);

function parseArgs(argv) {
  const args = { profile: 'test' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--profile' && argv[i + 1]) {
      args.profile = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

async function readJson(filePath) {
  const text = await fs.readFile(filePath, 'utf8');
  return JSON.parse(text);
}

async function assertFile(filePath, label) {
  try {
    await fs.access(filePath);
  } catch {
    throw new Error(`${label} missing: ${filePath}`);
  }
}

function isValidFrame(frame) {
  if (!frame || typeof frame !== 'object' || Array.isArray(frame)) return false;
  const record = frame;
  return (
    Number.isFinite(record.x) &&
    Number.isFinite(record.y) &&
    Number.isFinite(record.w) &&
    Number.isFinite(record.h) &&
    record.x >= 0 &&
    record.y >= 0 &&
    record.w > 0 &&
    record.h > 0
  );
}

function isSurfaceKey(key) {
  // `room.*` entries were originally transparent overlay icons, but the
  // sprite pipeline now treats them as full-bleed floor textures. Validate
  // them with the same edge/seam checks as tiles instead of the transparent
  // non-tile border checks.
  return key.startsWith('tile.') || key.startsWith('room.');
}

function isOverlayKey(key) {
  return key.startsWith('overlay.');
}

function isTransparentTileObjectKey(key) {
  return key === 'tile.door' || key === 'tile.door.horizontal' || key === 'tile.door.vertical';
}

const DUAL_WALL_ALPHA_COVERAGE = {
  'tile.wall.dt.empty': 0,
  'tile.wall.dt.single_corner': 0.25,
  'tile.wall.dt.edge': 0.5,
  'tile.wall.dt.saddle': 0.5,
  'tile.wall.dt.inner_corner': 0.75,
  'tile.wall.dt.full': 1
};

function isDualWallKey(key) {
  return Object.hasOwn(DUAL_WALL_ALPHA_COVERAGE, key);
}

function atlasPathsForProfile(profile) {
  const suffix = profile === 'v1' ? '' : `-${profile}`;
  return {
    pngPath: path.resolve(OUTPUT_DIR, `atlas${suffix}.png`),
    jsonPath: path.resolve(OUTPUT_DIR, `atlas${suffix}.json`)
  };
}

function frameEdgeStats(rgba, atlasWidth, frame) {
  let edgePixels = 0;
  let brightOpaque = 0;
  let transparent = 0;
  let opaque = 0;

  const visit = (x, y) => {
    const i = (y * atlasWidth + x) * 4;
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    const a = rgba[i + 3];
    edgePixels += 1;
    if (a < MIN_ALPHA) transparent += 1;
    else opaque += 1;
    if (a >= 220 && r >= 230 && g >= 230 && b >= 230) brightOpaque += 1;
  };

  const x0 = frame.x;
  const y0 = frame.y;
  const x1 = frame.x + frame.w - 1;
  const y1 = frame.y + frame.h - 1;

  for (let x = x0; x <= x1; x++) {
    visit(x, y0);
    if (y1 > y0) visit(x, y1);
  }
  for (let y = y0 + 1; y < y1; y++) {
    visit(x0, y);
    if (x1 > x0) visit(x1, y);
  }

  return {
    edgePixels,
    brightOpaqueRatio: edgePixels > 0 ? brightOpaque / edgePixels : 0,
    transparentRatio: edgePixels > 0 ? transparent / edgePixels : 0,
    opaqueRatio: edgePixels > 0 ? opaque / edgePixels : 0
  };
}

function frameOpaqueCoverage(rgba, atlasWidth, frame) {
  let opaque = 0;
  let pixels = 0;
  for (let y = frame.y; y < frame.y + frame.h; y++) {
    for (let x = frame.x; x < frame.x + frame.w; x++) {
      const i = (y * atlasWidth + x) * 4;
      if (rgba[i + 3] >= MIN_ALPHA) opaque += 1;
      pixels += 1;
    }
  }
  return pixels > 0 ? opaque / pixels : 0;
}

function frameSeamScore(rgba, atlasWidth, frame) {
  let sum = 0;
  let count = 0;

  const x0 = frame.x;
  const y0 = frame.y;
  const x1 = frame.x + frame.w - 1;
  const y1 = frame.y + frame.h - 1;

  for (let y = y0; y <= y1; y++) {
    const left = (y * atlasWidth + x0) * 4;
    const right = (y * atlasWidth + x1) * 4;
    const alphaWeight = ((rgba[left + 3] + rgba[right + 3]) * 0.5) / 255;
    const diff =
      Math.abs(rgba[left] - rgba[right]) +
      Math.abs(rgba[left + 1] - rgba[right + 1]) +
      Math.abs(rgba[left + 2] - rgba[right + 2]);
    sum += (diff / 765) * alphaWeight;
    count += 1;
  }

  for (let x = x0; x <= x1; x++) {
    const top = (y0 * atlasWidth + x) * 4;
    const bottom = (y1 * atlasWidth + x) * 4;
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!Object.hasOwn(PROFILE_TO_REQUIRED, args.profile)) {
    throw new Error(`Unsupported profile: ${args.profile}`);
  }

  const atlasPaths = atlasPathsForProfile(args.profile);
  await assertFile(atlasPaths.pngPath, 'Atlas image');
  await assertFile(atlasPaths.jsonPath, 'Atlas manifest');

  const requiredKeys = await readJson(PROFILE_TO_REQUIRED[args.profile]);
  const manifest = await readJson(atlasPaths.jsonPath);

  if (!Array.isArray(requiredKeys) || requiredKeys.some((k) => typeof k !== 'string')) {
    throw new Error('Required keys file is invalid.');
  }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('Atlas manifest is invalid JSON object.');
  }
  if (!manifest.frames || typeof manifest.frames !== 'object' || Array.isArray(manifest.frames)) {
    throw new Error('Atlas manifest missing frames map.');
  }

  const frames = manifest.frames;
  const missing = [];
  const invalid = [];
  for (const key of requiredKeys) {
    const frame = frames[key];
    if (!frame) {
      missing.push(key);
      continue;
    }
    if (!isValidFrame(frame)) invalid.push(key);
  }

  if (missing.length > 0 || invalid.length > 0) {
    const parts = [];
    if (missing.length > 0) parts.push(`Missing keys (${missing.length}): ${missing.join(', ')}`);
    if (invalid.length > 0) parts.push(`Invalid frame entries (${invalid.length}): ${invalid.join(', ')}`);
    throw new Error(parts.join('\n'));
  }

  const atlas = await sharp(atlasPaths.pngPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const rgba = atlas.data;
  const atlasWidth = atlas.info.width;

  const thresholdFailures = [];
  for (const key of requiredKeys) {
    const frame = frames[key];
    const stats = frameEdgeStats(rgba, atlasWidth, frame);

    if (isOverlayKey(key)) {
      continue;
    }

    if (isDualWallKey(key)) {
      const coverage = frameOpaqueCoverage(rgba, atlasWidth, frame);
      const expected = DUAL_WALL_ALPHA_COVERAGE[key];
      if (Math.abs(coverage - expected) > 0.02) {
        thresholdFailures.push(
          `${key}: opaque coverage ${coverage.toFixed(3)} outside expected ${expected.toFixed(3)} ± 0.020`
        );
      }
      continue;
    }

    if (isSurfaceKey(key) && !isTransparentTileObjectKey(key)) {
      const seam = frameSeamScore(rgba, atlasWidth, frame);
      if (stats.brightOpaqueRatio > TILE_BRIGHT_EDGE_MAX) {
        thresholdFailures.push(
          `${key}: bright edge ratio ${stats.brightOpaqueRatio.toFixed(3)} > ${TILE_BRIGHT_EDGE_MAX.toFixed(3)}`
        );
      }
      if (stats.transparentRatio > TILE_TRANSPARENT_EDGE_MAX) {
        thresholdFailures.push(
          `${key}: transparent edge ratio ${stats.transparentRatio.toFixed(3)} > ${TILE_TRANSPARENT_EDGE_MAX.toFixed(3)}`
        );
      }
      if (seam > TILE_SEAM_SCORE_MAX) {
        thresholdFailures.push(`${key}: seam score ${seam.toFixed(3)} > ${TILE_SEAM_SCORE_MAX.toFixed(3)}`);
      }
      continue;
    }

    if (stats.opaqueRatio > NON_TILE_BORDER_OPAQUE_MAX) {
      thresholdFailures.push(
        `${key}: opaque border ratio ${stats.opaqueRatio.toFixed(3)} > ${NON_TILE_BORDER_OPAQUE_MAX.toFixed(3)}`
      );
    }
    if (stats.brightOpaqueRatio > NON_TILE_BRIGHT_BORDER_MAX) {
      thresholdFailures.push(
        `${key}: bright border ratio ${stats.brightOpaqueRatio.toFixed(3)} > ${NON_TILE_BRIGHT_BORDER_MAX.toFixed(3)}`
      );
    }
  }

  if (thresholdFailures.length > 0) {
    throw new Error(`Sprite threshold validation failed:\n${thresholdFailures.join('\n')}`);
  }

  console.log(`Atlas validation passed for profile=${args.profile}. keys=${requiredKeys.length}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
