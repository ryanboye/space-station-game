#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const THIS_FILE = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(THIS_FILE), '..', '..');
const TOOLS_DIR = path.resolve(ROOT, 'tools', 'sprites');
const PROCESSED_DIR = path.resolve(TOOLS_DIR, 'out', 'processed');
const EDIT_DIR = path.resolve(TOOLS_DIR, 'edit');

const PROFILE_TO_REQUIRED = {
  'tiles-full': path.resolve(TOOLS_DIR, 'required-keys-tiles-full.json'),
  'v1': path.resolve(TOOLS_DIR, 'required-keys-v1.json'),
  'floors-walls': path.resolve(TOOLS_DIR, 'required-keys-floors-walls.json'),
  'agents': path.resolve(TOOLS_DIR, 'required-keys-agents.json')
};

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

function parseArgs(argv) {
  const args = { profile: 'tiles-full', map: '', sheet: '', single: '', scale: 0 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--profile' && argv[i + 1]) {
      args.profile = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--map' && argv[i + 1]) {
      args.map = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--sheet' && argv[i + 1]) {
      args.sheet = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--single' && argv[i + 1]) {
      args.single = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--scale' && argv[i + 1]) {
      args.scale = Number(argv[i + 1]);
      i += 1;
    }
  }
  if (args.scale !== 0 && (!Number.isInteger(args.scale) || args.scale < 1)) {
    throw new Error('--scale must be a positive integer');
  }
  return args;
}

function keyToFileName(key) {
  return `${key.replace(/[^a-zA-Z0-9]+/g, '_')}.png`;
}

function frameLayoutForKey(key, baseCellSize, spaceCellSize) {
  if (key === 'tile.space') {
    return {
      frameWidth: spaceCellSize,
      frameHeight: spaceCellSize
    };
  }

  const moduleFootprint = MODULE_FOOTPRINT_BY_KEY[key];
  if (moduleFootprint) {
    return {
      frameWidth: baseCellSize * moduleFootprint.w,
      frameHeight: baseCellSize * moduleFootprint.h
    };
  }

  return {
    frameWidth: baseCellSize,
    frameHeight: baseCellSize
  };
}

function outputPathsForProfile(profile) {
  const profileDir = path.resolve(EDIT_DIR, profile);
  if (profile === 'tiles-full') {
    return {
      profileDir,
      sheetPath: path.resolve(profileDir, 'tiles-full-edit.png'),
      mapPath: path.resolve(profileDir, 'tiles-full-map.json')
    };
  }
  return {
    profileDir,
    sheetPath: path.resolve(profileDir, `${profile}-edit.png`),
    mapPath: path.resolve(profileDir, `${profile}-map.json`)
  };
}

async function readJson(filePath) {
  const text = await fs.readFile(filePath, 'utf8');
  return JSON.parse(text);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteInt(value) {
  return Number.isInteger(value) && Number.isFinite(value);
}

async function importSingle(args, baseCellSize, spaceCellSize) {
  const key = args.single;
  const { frameWidth, frameHeight } = frameLayoutForKey(key, baseCellSize, spaceCellSize);

  const outputs = outputPathsForProfile(args.profile);
  const inputPath = path.resolve(outputs.profileDir, keyToFileName(key));

  const meta = await sharp(inputPath).metadata();
  const imgW = Number(meta.width ?? 0);
  const imgH = Number(meta.height ?? 0);
  if (imgW <= 0 || imgH <= 0) {
    throw new Error(`Invalid image dimensions for ${inputPath}`);
  }

  // Detect scale: if --scale provided, use it; otherwise infer from dimensions
  let scale = args.scale;
  if (scale === 0) {
    // Auto-detect: dimensions should be an integer multiple of expected frame size
    const scaleX = imgW / frameWidth;
    const scaleY = imgH / frameHeight;
    if (!Number.isInteger(scaleX) || !Number.isInteger(scaleY) || scaleX !== scaleY || scaleX < 1) {
      throw new Error(
        `Cannot detect scale for ${key}: image is ${imgW}x${imgH}, expected multiple of ${frameWidth}x${frameHeight}. Pass --scale explicitly.`
      );
    }
    scale = scaleX;
  }

  if (imgW !== frameWidth * scale || imgH !== frameHeight * scale) {
    throw new Error(
      `${key}: expected ${frameWidth * scale}x${frameHeight * scale} (scale=${scale}) but found ${imgW}x${imgH}`
    );
  }

  const outputPath = path.resolve(PROCESSED_DIR, keyToFileName(key));
  if (scale === 1) {
    await sharp(inputPath).png().toFile(outputPath);
  } else {
    await sharp(inputPath)
      .resize(frameWidth, frameHeight, { kernel: sharp.kernel.nearest })
      .png()
      .toFile(outputPath);
  }

  console.log(
    `Imported single sprite. key=${key}, scale=${scale}, output=${outputPath}`
  );
}

async function importSheet(args, baseCellSize, spaceCellSize) {
  const defaults = outputPathsForProfile(args.profile);
  const mapPath = args.map ? path.resolve(ROOT, args.map) : defaults.mapPath;
  const map = await readJson(mapPath);
  if (!isObject(map)) throw new Error(`Invalid map JSON object: ${mapPath}`);

  const mapProfile = typeof map.profile === 'string' ? map.profile : '';
  if (mapProfile !== args.profile) {
    throw new Error(`Map profile mismatch. Expected ${args.profile}, found ${mapProfile || 'unknown'}`);
  }
  const sheetPathFromMap = typeof map.sheetPath === 'string' && map.sheetPath.trim().length > 0 ? map.sheetPath : '';
  const sheetPath = args.sheet
    ? path.resolve(ROOT, args.sheet)
    : sheetPathFromMap
      ? path.resolve(path.dirname(mapPath), sheetPathFromMap)
      : defaults.sheetPath;

  // Read scale from map (default 1 for backwards compat with maps that don't have it)
  const scale = typeof map.scale === 'number' && map.scale >= 1 ? map.scale : 1;

  const requiredKeys = await readJson(PROFILE_TO_REQUIRED[args.profile]);
  if (!Array.isArray(requiredKeys) || requiredKeys.some((k) => typeof k !== 'string')) {
    throw new Error(`Invalid required keys for profile=${args.profile}`);
  }

  const rawEntries = map.entries;
  if (!Array.isArray(rawEntries)) throw new Error(`Map missing entries array: ${mapPath}`);
  const entryByKey = new Map();
  for (const raw of rawEntries) {
    if (!isObject(raw) || typeof raw.key !== 'string') {
      throw new Error(`Invalid entry in map: ${JSON.stringify(raw)}`);
    }
    if (entryByKey.has(raw.key)) {
      throw new Error(`Duplicate key in map entries: ${raw.key}`);
    }
    entryByKey.set(raw.key, raw);
  }

  const mapWidth = Number(map.sheetWidth ?? 0);
  const mapHeight = Number(map.sheetHeight ?? 0);
  if (!isFiniteInt(mapWidth) || !isFiniteInt(mapHeight) || mapWidth <= 0 || mapHeight <= 0) {
    throw new Error(`Invalid sheet dimensions in map: ${mapPath}`);
  }

  const sheetMeta = await sharp(sheetPath).metadata();
  const sheetWidth = Number(sheetMeta.width ?? 0);
  const sheetHeight = Number(sheetMeta.height ?? 0);
  if (sheetWidth !== mapWidth || sheetHeight !== mapHeight) {
    throw new Error(
      `Sheet size mismatch for ${sheetPath}. map=${mapWidth}x${mapHeight}, image=${sheetWidth}x${sheetHeight}`
    );
  }

  const validationErrors = [];
  for (const key of requiredKeys) {
    const entry = entryByKey.get(key);
    if (!entry) {
      validationErrors.push(`${key}: missing in map entries`);
      continue;
    }
    const x = Number(entry.x);
    const y = Number(entry.y);
    const w = Number(entry.w);
    const h = Number(entry.h);
    if (![x, y, w, h].every(isFiniteInt)) {
      validationErrors.push(`${key}: x/y/w/h must be integers`);
      continue;
    }
    if (x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > mapWidth || y + h > mapHeight) {
      validationErrors.push(`${key}: rectangle out of bounds (${x},${y},${w},${h})`);
      continue;
    }
    const expected = frameLayoutForKey(key, baseCellSize, spaceCellSize);
    if (w !== expected.frameWidth * scale || h !== expected.frameHeight * scale) {
      validationErrors.push(
        `${key}: expected ${expected.frameWidth * scale}x${expected.frameHeight * scale} (scale=${scale}), found ${w}x${h} in map`
      );
    }
  }
  if (validationErrors.length > 0) {
    throw new Error(`Edit map validation failed:\n${validationErrors.join('\n')}`);
  }

  const sheet = sharp(sheetPath);
  let written = 0;
  for (const key of requiredKeys) {
    const entry = entryByKey.get(key);
    const x = Number(entry.x);
    const y = Number(entry.y);
    const w = Number(entry.w);
    const h = Number(entry.h);
    const expected = frameLayoutForKey(key, baseCellSize, spaceCellSize);
    const outputPath = path.resolve(PROCESSED_DIR, keyToFileName(key));

    let pipeline = sheet.clone().extract({ left: x, top: y, width: w, height: h });
    if (scale > 1) {
      pipeline = pipeline.resize(expected.frameWidth, expected.frameHeight, { kernel: sharp.kernel.nearest });
    }
    await pipeline.png().toFile(outputPath);
    written += 1;
  }

  console.log(
    `Imported edit sheet. profile=${args.profile}, scale=${scale}, written=${written}, sheet=${sheetPath}, processedDir=${PROCESSED_DIR}`
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!Object.hasOwn(PROFILE_TO_REQUIRED, args.profile)) {
    throw new Error(`Unsupported profile: ${args.profile}. Supported: ${Object.keys(PROFILE_TO_REQUIRED).join(', ')}`);
  }

  const baseCellSize = Number(process.env.SPRITE_ATLAS_CELL_SIZE || 64);
  const spaceCellSize = Number(process.env.SPRITE_SPACE_ATLAS_SIZE || 256);
  if (!Number.isFinite(baseCellSize) || baseCellSize <= 0) throw new Error('SPRITE_ATLAS_CELL_SIZE must be > 0');
  if (!Number.isFinite(spaceCellSize) || spaceCellSize <= 0) throw new Error('SPRITE_SPACE_ATLAS_SIZE must be > 0');

  if (args.single) {
    await importSingle(args, baseCellSize, spaceCellSize);
  } else {
    await importSheet(args, baseCellSize, spaceCellSize);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
