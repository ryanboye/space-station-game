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
  'module.fridge': { w: 1, h: 1 },
  'module.cold_store': { w: 2, h: 2 },
  'module.prep_counter': { w: 2, h: 1 },
  'module.stove': { w: 2, h: 1 },
  'module.tray_return': { w: 1, h: 1 },
  'module.dishwasher': { w: 2, h: 1 },
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
  'module.toilet': { w: 1, h: 1 },
  'module.floor_drain': { w: 1, h: 1 },
  'module.water_valve': { w: 1, h: 1 },
  'module.market_stall': { w: 2, h: 1 },
  'module.checkout_bank': { w: 2, h: 5 },
  'module.checkout_bank.active': { w: 2, h: 5 },
  'module.checkout_bank.unstaffed': { w: 2, h: 5 },
  'module.checkout_bank.dirty': { w: 2, h: 5 },
  'module.shelf_aisle': { w: 1, h: 4 },
  'module.shelf_aisle.active': { w: 1, h: 4 },
  'module.shelf_aisle.empty': { w: 1, h: 4 },
  'module.shelf_aisle.dirty': { w: 1, h: 4 },
  'module.bunk_bank': { w: 2, h: 4 },
  'module.bunk_bank.active': { w: 2, h: 4 },
  'module.bunk_bank.dirty': { w: 2, h: 4 },
  'module.intake_pallet': { w: 2, h: 2 },
  'module.storage_rack': { w: 2, h: 1 },
  'module.bar_counter': { w: 2, h: 1 },
  // Occupant-loop content fixtures (authored at exactly 64px per tile).
  'module.backroom_stock_bank': { w: 2, h: 3 },
  'module.backroom_stock_bank.empty': { w: 2, h: 3 },
  'module.backroom_stock_bank.dirty': { w: 2, h: 3 },
  'module.backroom_stock_bank.damaged': { w: 2, h: 3 },
  'module.service_bar': { w: 2, h: 5 },
  'module.service_bar.active': { w: 2, h: 5 },
  'module.service_bar.unstaffed': { w: 2, h: 5 },
  'module.service_bar.empty': { w: 2, h: 5 },
  'module.service_bar.dirty': { w: 2, h: 5 },
  'module.service_bar.damaged': { w: 2, h: 5 },
  'module.bar_corner': { w: 2, h: 2 },
  'module.bar_corner.active': { w: 2, h: 2 },
  'module.bar_corner.dirty': { w: 2, h: 2 },
  'module.bar_corner.damaged': { w: 2, h: 2 },
  'module.bar_end': { w: 2, h: 2 },
  'module.bar_end.active': { w: 2, h: 2 },
  'module.bar_end.dirty': { w: 2, h: 2 },
  'module.bar_end.damaged': { w: 2, h: 2 },
  'module.booth_bank': { w: 2, h: 4 },
  'module.booth_bank.active': { w: 2, h: 4 },
  'module.booth_bank.dirty': { w: 2, h: 4 },
  'module.booth_bank.damaged': { w: 2, h: 4 },
  'module.standing_rail': { w: 1, h: 4 },
  'module.standing_rail.active': { w: 1, h: 4 },
  'module.standing_rail.dirty': { w: 1, h: 4 },
  'module.serving_line': { w: 2, h: 5 },
  'module.serving_line.active': { w: 2, h: 5 },
  'module.serving_line.unstaffed': { w: 2, h: 5 },
  'module.serving_line.empty': { w: 2, h: 5 },
  'module.serving_line.dirty': { w: 2, h: 5 },
  'module.serving_line.damaged': { w: 2, h: 5 },
  'module.community_table': { w: 3, h: 4 },
  'module.community_table.active': { w: 3, h: 4 },
  'module.community_table.dirty': { w: 3, h: 4 },
  'module.community_table.damaged': { w: 3, h: 4 },
  'module.guest_cabin': { w: 3, h: 4 },
  'module.guest_cabin.active': { w: 3, h: 4 },
  'module.guest_cabin.dirty': { w: 3, h: 4 },
  'module.arrival_desk': { w: 2, h: 4 },
  'module.arrival_desk.active': { w: 2, h: 4 },
  'module.arrival_desk.unstaffed': { w: 2, h: 4 },
  'module.arrival_desk.dirty': { w: 2, h: 4 },
  'module.wash_bank': { w: 2, h: 5 },
  'module.wash_bank.active': { w: 2, h: 5 },
  'module.wash_bank.dirty': { w: 2, h: 5 },
  'module.wash_bank.damaged': { w: 2, h: 5 }
};

const BASE = 64;
const PADDING_BY_KEY = {
  'module.table': 4,
  'module.rec_unit': 4,
  'module.grow_station': 4,
  'module.intake_pallet': 2,
  'module.market_stall': 3,
  'module.checkout_bank': 3,
  'module.checkout_bank.active': 3,
  'module.checkout_bank.unstaffed': 3,
  'module.checkout_bank.dirty': 3,
  'module.shelf_aisle': 2,
  'module.shelf_aisle.active': 2,
  'module.shelf_aisle.empty': 2,
  'module.shelf_aisle.dirty': 2,
  'module.bunk_bank': 3,
  'module.bunk_bank.active': 3,
  'module.bunk_bank.dirty': 3,
  'module.storage_rack': 3,
  'module.cold_store': 3,
  'module.prep_counter': 3,
  'module.dishwasher': 3,
  'module.bar_counter': 3,
  // Content fixtures keep >= 6px clear so the atlas border checks stay at zero.
  'module.backroom_stock_bank': 6,
  'module.backroom_stock_bank.empty': 6,
  'module.backroom_stock_bank.dirty': 6,
  'module.backroom_stock_bank.damaged': 6,
  'module.service_bar': 6,
  'module.service_bar.active': 6,
  'module.service_bar.unstaffed': 6,
  'module.service_bar.empty': 6,
  'module.service_bar.dirty': 6,
  'module.service_bar.damaged': 6,
  'module.bar_corner': 6,
  'module.bar_corner.active': 6,
  'module.bar_corner.dirty': 6,
  'module.bar_corner.damaged': 6,
  'module.bar_end': 6,
  'module.bar_end.active': 6,
  'module.bar_end.dirty': 6,
  'module.bar_end.damaged': 6,
  'module.booth_bank': 6,
  'module.booth_bank.active': 6,
  'module.booth_bank.dirty': 6,
  'module.booth_bank.damaged': 6,
  'module.standing_rail': 6,
  'module.standing_rail.active': 6,
  'module.standing_rail.dirty': 6,
  'module.serving_line': 6,
  'module.serving_line.active': 6,
  'module.serving_line.unstaffed': 6,
  'module.serving_line.empty': 6,
  'module.serving_line.dirty': 6,
  'module.serving_line.damaged': 6,
  'module.community_table': 6,
  'module.community_table.active': 6,
  'module.community_table.dirty': 6,
  'module.community_table.damaged': 6,
  'module.guest_cabin': 6,
  'module.guest_cabin.active': 6,
  'module.guest_cabin.dirty': 6,
  'module.arrival_desk': 6,
  'module.arrival_desk.active': 6,
  'module.arrival_desk.unstaffed': 6,
  'module.arrival_desk.dirty': 6,
  'module.wash_bank': 6,
  'module.wash_bank.active': 6,
  'module.wash_bank.dirty': 6,
  'module.wash_bank.damaged': 6
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

function selectedKeys(argv) {
  const keysIndex = argv.indexOf('--keys');
  if (keysIndex < 0 || !argv[keysIndex + 1]) return Object.keys(FOOTPRINTS);
  const requested = argv[keysIndex + 1].split(',').map((key) => key.trim()).filter(Boolean);
  const invalid = requested.filter((key) => !FOOTPRINTS[key]);
  if (invalid.length > 0) throw new Error(`Unknown module sprite keys: ${invalid.join(', ')}`);
  return requested;
}

async function main() {
  const results = [];
  for (const key of selectedKeys(process.argv.slice(2))) {
    const footprint = FOOTPRINTS[key];
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
