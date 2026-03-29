#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const THIS_FILE = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(THIS_FILE), '..', '..');
const TOOLS_DIR = path.resolve(ROOT, 'tools', 'sprites');
const CURATED_DIR = path.resolve(TOOLS_DIR, 'curated');
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
  const args = { profile: 'tiles-full', single: '', scale: 1 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--profile' && argv[i + 1]) {
      args.profile = argv[i + 1];
      i += 1;
    } else if (arg === '--single' && argv[i + 1]) {
      args.single = argv[i + 1];
      i += 1;
    } else if (arg === '--scale' && argv[i + 1]) {
      args.scale = Number(argv[i + 1]);
      i += 1;
    }
  }
  if (!Number.isInteger(args.scale) || args.scale < 1) {
    throw new Error('--scale must be a positive integer');
  }
  return args;
}

function keyToFileName(key) {
  return `${key.replace(/[^a-zA-Z0-9]+/g, '_')}.png`;
}

function isTileKey(key) {
  return key.startsWith('tile.');
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

async function readJson(filePath) {
  const text = await fs.readFile(filePath, 'utf8');
  return JSON.parse(text);
}

async function imageDimensions(filePath) {
  const meta = await sharp(filePath).metadata();
  const width = Number(meta.width ?? 0);
  const height = Number(meta.height ?? 0);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error(`Invalid image dimensions for ${filePath}`);
  }
  return { width, height };
}

function xmlEscape(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function outputPathsForProfile(profile) {
  const profileDir = path.resolve(EDIT_DIR, profile);
  if (profile === 'tiles-full') {
    return {
      profileDir,
      sheetPath: path.resolve(profileDir, 'tiles-full-edit.png'),
      mapPath: path.resolve(profileDir, 'tiles-full-map.json'),
      guidePath: path.resolve(profileDir, 'tiles-full-guide.png')
    };
  }
  return {
    profileDir,
    sheetPath: path.resolve(profileDir, `${profile}-edit.png`),
    mapPath: path.resolve(profileDir, `${profile}-map.json`),
    guidePath: path.resolve(profileDir, `${profile}-guide.png`)
  };
}

async function exportSingle(args, baseCellSize, spaceCellSize) {
  const key = args.single;
  const scale = args.scale;
  const inputPath = path.resolve(CURATED_DIR, keyToFileName(key));
  const { frameWidth, frameHeight } = frameLayoutForKey(key, baseCellSize, spaceCellSize);

  const outputs = outputPathsForProfile(args.profile);
  await fs.mkdir(outputs.profileDir, { recursive: true });

  const outputPath = path.resolve(outputs.profileDir, keyToFileName(key));
  const outW = frameWidth * scale;
  const outH = frameHeight * scale;
  await sharp(inputPath)
    .resize(outW, outH, { kernel: sharp.kernel.nearest })
    .png()
    .toFile(outputPath);

  console.log(
    `Exported single sprite. key=${key}, scale=${scale}, size=${outW}x${outH}, file=${outputPath}`
  );
}

async function exportSheet(args, baseCellSize, spaceCellSize) {
  const scale = args.scale;
  const gap = Number(process.env.SPRITE_EDIT_SHEET_GAP || 8);
  const maxWidth = Number(process.env.SPRITE_EDIT_SHEET_MAX_WIDTH || 1024);
  if (!Number.isFinite(gap) || gap < 0) throw new Error('SPRITE_EDIT_SHEET_GAP must be >= 0');
  if (!Number.isFinite(maxWidth) || maxWidth <= 0) throw new Error('SPRITE_EDIT_SHEET_MAX_WIDTH must be > 0');

  const scaledGap = gap * scale;
  const scaledMaxWidth = maxWidth * scale;

  const requiredKeys = await readJson(PROFILE_TO_REQUIRED[args.profile]);
  if (!Array.isArray(requiredKeys) || requiredKeys.some((k) => typeof k !== 'string')) {
    throw new Error(`Invalid required keys for profile=${args.profile}`);
  }

  const entries = [];
  const missingErrors = [];
  for (const key of requiredKeys) {
    const inputPath = path.resolve(CURATED_DIR, keyToFileName(key));
    const { frameWidth, frameHeight } = frameLayoutForKey(key, baseCellSize, spaceCellSize);
    try {
      await imageDimensions(inputPath);
    } catch (err) {
      missingErrors.push(`${key}: unable to read source image (${inputPath})`);
      continue;
    }
    entries.push({
      key,
      inputPath,
      frameWidth,
      frameHeight,
      w: frameWidth * scale,
      h: frameHeight * scale
    });
  }
  if (missingErrors.length > 0) {
    throw new Error(`Missing curated sprites:\n${missingErrors.join('\n')}`);
  }
  if (entries.length <= 0) {
    throw new Error(`No entries found for profile=${args.profile}`);
  }

  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;
  let sheetWidth = 0;

  for (const entry of entries) {
    if (cursorX > 0 && cursorX + entry.w > scaledMaxWidth) {
      cursorX = 0;
      cursorY += rowHeight + scaledGap;
      rowHeight = 0;
    }
    entry.x = cursorX;
    entry.y = cursorY;
    cursorX += entry.w + scaledGap;
    rowHeight = Math.max(rowHeight, entry.h);
    sheetWidth = Math.max(sheetWidth, entry.x + entry.w);
  }
  const sheetHeight = cursorY + rowHeight;

  const outputs = outputPathsForProfile(args.profile);
  await fs.mkdir(outputs.profileDir, { recursive: true });

  // Build composites, resizing each sprite to target frame size (x scale)
  const composites = [];
  for (const entry of entries) {
    const input = await sharp(entry.inputPath)
      .resize(entry.w, entry.h, { kernel: sharp.kernel.nearest })
      .png()
      .toBuffer();
    composites.push({ input, left: entry.x, top: entry.y });
  }

  await sharp({
    create: {
      width: sheetWidth,
      height: sheetHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite(composites)
    .png()
    .toFile(outputs.sheetPath);

  const map = {
    version: 1,
    profile: args.profile,
    scale,
    sheetPath: path.basename(outputs.sheetPath),
    sheetWidth,
    sheetHeight,
    cellSize: baseCellSize,
    spaceCellSize,
    entries: entries.map((entry) => ({
      key: entry.key,
      x: entry.x,
      y: entry.y,
      w: entry.w,
      h: entry.h
    }))
  };
  await fs.writeFile(outputs.mapPath, `${JSON.stringify(map, null, 2)}\n`, 'utf8');

  const labels = entries
    .map((entry) => {
      const labelHeight = entry.h >= 128 ? 22 : 16;
      const fontSize = entry.h >= 128 ? 13 : 10;
      const labelWidth = Math.min(entry.w, Math.max(48, entry.key.length * Math.ceil(fontSize * 0.62)));
      return [
        `<rect x="${entry.x}" y="${entry.y}" width="${entry.w}" height="${entry.h}" fill="none" stroke="rgba(255,255,255,0.75)" stroke-width="1"/>`,
        `<rect x="${entry.x}" y="${entry.y}" width="${labelWidth}" height="${labelHeight}" fill="rgba(0,0,0,0.72)"/>`,
        `<text x="${entry.x + 4}" y="${entry.y + Math.round(labelHeight * 0.72)}" font-family="monospace" font-size="${fontSize}" fill="rgba(255,255,255,0.95)">${xmlEscape(entry.key)}</text>`
      ].join('');
    })
    .join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${sheetWidth}" height="${sheetHeight}">
    ${labels}
  </svg>`;
  await sharp(outputs.sheetPath).composite([{ input: Buffer.from(svg) }]).png().toFile(outputs.guidePath);

  const tileCount = entries.filter((entry) => isTileKey(entry.key)).length;
  console.log(
    `Exported edit sheet. profile=${args.profile}, scale=${scale}, entries=${entries.length}, tiles=${tileCount}, sheet=${outputs.sheetPath}, map=${outputs.mapPath}, guide=${outputs.guidePath}`
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
    await exportSingle(args, baseCellSize, spaceCellSize);
  } else {
    await exportSheet(args, baseCellSize, spaceCellSize);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
