#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const THIS_FILE = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(THIS_FILE), '..', '..');
const CURATED_DIR = path.resolve(ROOT, 'tools', 'sprites', 'curated');

const FOOTPRINTS = {
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

const BASE = 64;
const PADDING_BY_KEY = {
  'module.table': 4,
  'module.rec_unit': 4,
  'module.grow_station': 4,
  'module.intake_pallet': 2,
  'module.market_stall': 3,
  'module.storage_rack': 3
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

function alphaBounds(rgba, width, height) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = rgba[(y * width + x) * 4 + 3];
      if (a < 8) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

async function normalizeOne(key, footprint) {
  const filePath = path.resolve(CURATED_DIR, keyToFileName(key));
  if (!(await fileExists(filePath))) return null;
  const meta = await sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const bounds = alphaBounds(meta.data, meta.info.width, meta.info.height);
  if (!bounds) return null;

  const frameWidth = footprint.w * BASE;
  const frameHeight = footprint.h * BASE;
  const padding = PADDING_BY_KEY[key] ?? 5;
  const targetWidth = frameWidth - padding * 2;
  const targetHeight = frameHeight - padding * 2;

  const cropped = await sharp(filePath).extract(bounds).png().toBuffer();
  const fitted = await sharp(cropped)
    .resize(targetWidth, targetHeight, {
      fit: 'inside',
      withoutEnlargement: false,
      kernel: 'nearest'
    })
    .png()
    .toBuffer();
  const fittedMeta = await sharp(fitted).metadata();
  const fittedWidth = fittedMeta.width ?? targetWidth;
  const fittedHeight = fittedMeta.height ?? targetHeight;
  const left = Math.round((frameWidth - fittedWidth) * 0.5);
  const top = Math.round((frameHeight - fittedHeight) * 0.5);

  await sharp({
    create: {
      width: frameWidth,
      height: frameHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([{ input: fitted, left, top }])
    .png()
    .toFile(filePath);

  return `${key}: ${meta.info.width}x${meta.info.height} -> ${frameWidth}x${frameHeight}`;
}

async function main() {
  const results = [];
  for (const [key, footprint] of Object.entries(FOOTPRINTS)) {
    const result = await normalizeOne(key, footprint);
    if (result) results.push(result);
  }
  for (const result of results) console.log(result);
  console.log(`normalized ${results.length} module sprites`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
