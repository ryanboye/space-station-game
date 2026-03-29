#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import {
  DEFAULT_SPRITE_SPEC_PATH,
  getSpriteAlpha,
  getSpriteBlendMode,
  getSpriteFrameHeight,
  getSpriteFrameWidth,
  getSpriteOffset,
  getSpriteRotation,
  loadSpriteSpec
} from './sprite-spec.mjs';

const THIS_FILE = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(THIS_FILE), '..', '..');
const TOOLS_DIR = path.resolve(ROOT, 'tools', 'sprites');
const CURATED_DIR = path.resolve(TOOLS_DIR, 'curated');
const PROCESSED_DIR = path.resolve(TOOLS_DIR, 'out', 'processed');
const OUTPUT_DIR = path.resolve(ROOT, 'public', 'assets', 'sprites');

const PROFILE_TO_REQUIRED = {
  v1: path.resolve(TOOLS_DIR, 'required-keys-v1.json'),
  test: path.resolve(TOOLS_DIR, 'required-keys-test.json'),
  'floors-walls': path.resolve(TOOLS_DIR, 'required-keys-floors-walls.json'),
  agents: path.resolve(TOOLS_DIR, 'required-keys-agents.json'),
  'tiles-full': path.resolve(TOOLS_DIR, 'required-keys-tiles-full.json')
};

const MODULE_FOOTPRINT_BY_KEY = {
  'module.none': { w: 1, h: 1 },
  'module.wall_light': { w: 1, h: 1 },
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

const OVERLAY_FOOTPRINT_BY_KEY = {
  'overlay.dock.facade.north.solo': { w: 2, h: 2 },
  'overlay.dock.facade.north.start': { w: 2, h: 2 },
  'overlay.dock.facade.north.middle': { w: 2, h: 2 },
  'overlay.dock.facade.north.end': { w: 2, h: 2 },
  'overlay.dock.facade.east.solo': { w: 2, h: 2 },
  'overlay.dock.facade.east.start': { w: 2, h: 2 },
  'overlay.dock.facade.east.middle': { w: 2, h: 2 },
  'overlay.dock.facade.east.end': { w: 2, h: 2 },
  'overlay.dock.facade.south.solo': { w: 2, h: 2 },
  'overlay.dock.facade.south.start': { w: 2, h: 2 },
  'overlay.dock.facade.south.middle': { w: 2, h: 2 },
  'overlay.dock.facade.south.end': { w: 2, h: 2 },
  'overlay.dock.facade.west.solo': { w: 2, h: 2 },
  'overlay.dock.facade.west.start': { w: 2, h: 2 },
  'overlay.dock.facade.west.middle': { w: 2, h: 2 },
  'overlay.dock.facade.west.end': { w: 2, h: 2 },
  'overlay.floor.grime.1': { w: 1, h: 1 },
  'overlay.floor.grime.2': { w: 1, h: 1 },
  'overlay.floor.grime.3': { w: 1, h: 1 },
  'overlay.floor.grime.4': { w: 1, h: 1 },
  'overlay.floor.grime.5': { w: 1, h: 1 },
  'overlay.floor.grime.6': { w: 1, h: 1 },
  'overlay.floor.wear.1': { w: 1, h: 1 },
  'overlay.floor.wear.2': { w: 1, h: 1 },
  'overlay.floor.wear.3': { w: 1, h: 1 },
  'overlay.floor.wear.4': { w: 1, h: 1 },
  'overlay.wall.exterior.1': { w: 2, h: 2 },
  'overlay.wall.exterior.2': { w: 2, h: 2 },
  'overlay.wall.exterior.3': { w: 2, h: 2 },
  'overlay.wall.exterior.corner.1': { w: 2, h: 2 },
  'overlay.wall.exterior.end.1': { w: 2, h: 2 }
};

function parseArgs(argv) {
  const args = { profile: 'v1', activate: false, spec: '', source: 'auto' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--profile' && argv[i + 1]) {
      args.profile = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--activate') {
      args.activate = true;
    }
    if (arg === '--spec' && argv[i + 1]) {
      args.spec = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--source' && argv[i + 1]) {
      args.source = argv[i + 1];
      i += 1;
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

async function resolveInputPath(key, sourceMode) {
  const fileName = keyToFileName(key);
  const curatedPath = path.resolve(CURATED_DIR, fileName);
  const processedPath = path.resolve(PROCESSED_DIR, fileName);
  if (sourceMode === 'curated') {
    return (await fileExists(curatedPath)) ? curatedPath : null;
  }
  if (sourceMode === 'processed') {
    return (await fileExists(processedPath)) ? processedPath : null;
  }
  if (await fileExists(curatedPath)) return curatedPath;
  if (await fileExists(processedPath)) return processedPath;
  return null;
}

async function readImageDimensions(filePath) {
  const meta = await sharp(filePath).metadata();
  const width = Number(meta.width ?? 0);
  const height = Number(meta.height ?? 0);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error(`Invalid image dimensions for ${filePath}`);
  }
  return { width, height };
}

function isTileKey(key) {
  return key.startsWith('tile.');
}

function atlasPathsForProfile(profile) {
  const suffix = profile === 'v1' ? '' : `-${profile}`;
  return {
    pngPath: path.resolve(OUTPUT_DIR, `atlas${suffix}.png`),
    jsonPath: path.resolve(OUTPUT_DIR, `atlas${suffix}.json`),
    imagePath: `atlas${suffix}.png`
  };
}

function frameLayoutForKey(key, baseCellSize, spaceCellSize) {
  const overlayFootprint = OVERLAY_FOOTPRINT_BY_KEY[key];
  if (overlayFootprint) {
    return {
      frameWidth: baseCellSize * overlayFootprint.w,
      frameHeight: baseCellSize * overlayFootprint.h,
      fit: 'contain'
    };
  }
  if (key === 'tile.space') {
    return {
      frameWidth: spaceCellSize,
      frameHeight: spaceCellSize,
      fit: 'cover'
    };
  }

  const moduleFootprint = MODULE_FOOTPRINT_BY_KEY[key];
  if (moduleFootprint) {
    return {
      frameWidth: baseCellSize * moduleFootprint.w,
      frameHeight: baseCellSize * moduleFootprint.h,
      fit: 'contain'
    };
  }

  return {
    frameWidth: baseCellSize,
    frameHeight: baseCellSize,
    fit: isTileKey(key) ? 'cover' : 'contain'
  };
}

async function buildPaddedSprite(inputPath, frameWidth, frameHeight, padding, fit, sourceWidth, sourceHeight) {
  const useOriginalSize = sourceWidth === frameWidth && sourceHeight === frameHeight;
  const fitted = useOriginalSize
    ? await sharp(inputPath).png().toBuffer()
    : await sharp(inputPath)
        .resize(frameWidth, frameHeight, {
          fit,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
          kernel: 'nearest'
        })
        .png()
        .toBuffer();

  if (padding <= 0) return fitted;

  const spanWidth = frameWidth + padding * 2;
  const spanHeight = frameHeight + padding * 2;
  const center = { input: fitted, left: padding, top: padding };

  const left = await sharp(fitted)
    .extract({ left: 0, top: 0, width: 1, height: frameHeight })
    .resize(padding, frameHeight, { kernel: 'nearest' })
    .png()
    .toBuffer();
  const right = await sharp(fitted)
    .extract({ left: frameWidth - 1, top: 0, width: 1, height: frameHeight })
    .resize(padding, frameHeight, { kernel: 'nearest' })
    .png()
    .toBuffer();
  const top = await sharp(fitted)
    .extract({ left: 0, top: 0, width: frameWidth, height: 1 })
    .resize(frameWidth, padding, { kernel: 'nearest' })
    .png()
    .toBuffer();
  const bottom = await sharp(fitted)
    .extract({ left: 0, top: frameHeight - 1, width: frameWidth, height: 1 })
    .resize(frameWidth, padding, { kernel: 'nearest' })
    .png()
    .toBuffer();

  const topLeft = await sharp(fitted)
    .extract({ left: 0, top: 0, width: 1, height: 1 })
    .resize(padding, padding, { kernel: 'nearest' })
    .png()
    .toBuffer();
  const topRight = await sharp(fitted)
    .extract({ left: frameWidth - 1, top: 0, width: 1, height: 1 })
    .resize(padding, padding, { kernel: 'nearest' })
    .png()
    .toBuffer();
  const bottomLeft = await sharp(fitted)
    .extract({ left: 0, top: frameHeight - 1, width: 1, height: 1 })
    .resize(padding, padding, { kernel: 'nearest' })
    .png()
    .toBuffer();
  const bottomRight = await sharp(fitted)
    .extract({ left: frameWidth - 1, top: frameHeight - 1, width: 1, height: 1 })
    .resize(padding, padding, { kernel: 'nearest' })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: spanWidth,
      height: spanHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([
      center,
      { input: left, left: 0, top: padding },
      { input: right, left: padding + frameWidth, top: padding },
      { input: top, left: padding, top: 0 },
      { input: bottom, left: padding, top: padding + frameHeight },
      { input: topLeft, left: 0, top: 0 },
      { input: topRight, left: padding + frameWidth, top: 0 },
      { input: bottomLeft, left: 0, top: padding + frameHeight },
      { input: bottomRight, left: padding + frameWidth, top: padding + frameHeight }
    ])
    .png()
    .toBuffer();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!Object.hasOwn(PROFILE_TO_REQUIRED, args.profile)) {
    throw new Error(`Unsupported profile: ${args.profile}. Use one of: ${Object.keys(PROFILE_TO_REQUIRED).join(', ')}`);
  }
  if (!['auto', 'curated', 'processed'].includes(args.source)) {
    throw new Error(`Unsupported source: ${args.source}. Use one of: auto, curated, processed`);
  }

  const requiredKeys = await readJson(PROFILE_TO_REQUIRED[args.profile]);
  if (!Array.isArray(requiredKeys) || requiredKeys.some((k) => typeof k !== 'string')) {
    throw new Error(`Invalid required keys file for profile=${args.profile}`);
  }
  const specPathRaw = args.spec || process.env.SPRITE_SPEC_PATH || DEFAULT_SPRITE_SPEC_PATH;
  const specPath = path.isAbsolute(specPathRaw) ? specPathRaw : path.resolve(ROOT, specPathRaw);
  const spriteSpec = await loadSpriteSpec(specPath);

  const baseCellSize = Number(process.env.SPRITE_ATLAS_CELL_SIZE || 64);
  const spaceCellSize = Number(process.env.SPRITE_SPACE_ATLAS_SIZE || 256);
  const padding = Number(process.env.SPRITE_ATLAS_PADDING || 2);
  const maxAtlasWidth = Number(process.env.SPRITE_ATLAS_MAX_WIDTH || 3072);
  if (!Number.isFinite(baseCellSize) || baseCellSize <= 0) {
    throw new Error('SPRITE_ATLAS_CELL_SIZE must be a positive number.');
  }
  if (!Number.isFinite(spaceCellSize) || spaceCellSize <= 0) {
    throw new Error('SPRITE_SPACE_ATLAS_SIZE must be a positive number.');
  }
  if (!Number.isFinite(padding) || padding < 0) {
    throw new Error('SPRITE_ATLAS_PADDING must be >= 0.');
  }
  if (!Number.isFinite(maxAtlasWidth) || maxAtlasWidth <= 0) {
    throw new Error('SPRITE_ATLAS_MAX_WIDTH must be a positive number.');
  }

  const available = [];
  for (const key of requiredKeys) {
    const inputPath = await resolveInputPath(key, args.source);
    if (!inputPath) continue;
    const layout = frameLayoutForKey(key, baseCellSize, spaceCellSize);
    const specFrameWidth = getSpriteFrameWidth(spriteSpec, key);
    const specFrameHeight = getSpriteFrameHeight(spriteSpec, key);
    const source = await readImageDimensions(inputPath);
    available.push({
      key,
      inputPath,
      ...layout,
      frameWidth: specFrameWidth ?? layout.frameWidth,
      frameHeight: specFrameHeight ?? layout.frameHeight,
      sourceWidth: source.width,
      sourceHeight: source.height
    });
  }

  if (available.length <= 0) {
    throw new Error(`No processed sprite PNGs found in ${PROCESSED_DIR}. Run sprites:process first.`);
  }

  const placements = [];
  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;
  let atlasWidth = 0;

  for (const entry of available) {
    const spanWidth = entry.frameWidth + padding * 2;
    const spanHeight = entry.frameHeight + padding * 2;
    const widthLimit = Math.max(maxAtlasWidth, spanWidth);
    if (cursorX > 0 && cursorX + spanWidth > widthLimit) {
      cursorX = 0;
      cursorY += rowHeight;
      rowHeight = 0;
    }

    placements.push({
      ...entry,
      left: cursorX,
      top: cursorY
    });

    cursorX += spanWidth;
    rowHeight = Math.max(rowHeight, spanHeight);
    atlasWidth = Math.max(atlasWidth, cursorX);
  }

  const atlasHeight = cursorY + rowHeight;

  const composites = [];
  const frames = {};
  const rotations = {};
  const offsets = {};
  const blendModes = {};
  const alphas = {};
  for (const placement of placements) {
    const padded = await buildPaddedSprite(
      placement.inputPath,
      placement.frameWidth,
      placement.frameHeight,
      padding,
      placement.fit,
      placement.sourceWidth,
      placement.sourceHeight
    );
    composites.push({
      input: padded,
      left: placement.left,
      top: placement.top
    });
    frames[placement.key] = {
      x: placement.left + padding,
      y: placement.top + padding,
      w: placement.frameWidth,
      h: placement.frameHeight
    };
    const rotation = getSpriteRotation(spriteSpec, placement.key);
    if (rotation !== 0) rotations[placement.key] = rotation;
    const offset = getSpriteOffset(spriteSpec, placement.key);
    if (offset.x !== 0 || offset.y !== 0) offsets[placement.key] = offset;
    const blendMode = getSpriteBlendMode(spriteSpec, placement.key);
    if (blendMode !== 'normal') blendModes[placement.key] = blendMode;
    const alpha = getSpriteAlpha(spriteSpec, placement.key);
    if (alpha !== 1) alphas[placement.key] = alpha;
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const atlasPaths = atlasPathsForProfile(args.profile);

  await sharp({
    create: {
      width: atlasWidth,
      height: atlasHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite(composites)
    .png()
    .toFile(atlasPaths.pngPath);

  const manifest = {
    version: `sprite-${args.profile}-${new Date().toISOString()}`,
    cellSize: baseCellSize,
    imagePath: atlasPaths.imagePath,
    frames,
    ...(Object.keys(rotations).length > 0 ? { rotations } : {}),
    ...(Object.keys(offsets).length > 0 ? { offsets } : {}),
    ...(Object.keys(blendModes).length > 0 ? { blendModes } : {}),
    ...(Object.keys(alphas).length > 0 ? { alphas } : {})
  };
  await fs.writeFile(atlasPaths.jsonPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  if (args.activate) {
    const activeManifest = {
      ...manifest,
      imagePath: 'atlas.png'
    };
    await fs.copyFile(atlasPaths.pngPath, path.resolve(OUTPUT_DIR, 'atlas.png'));
    await fs.writeFile(path.resolve(OUTPUT_DIR, 'atlas.json'), `${JSON.stringify(activeManifest, null, 2)}\n`, 'utf8');
  }

  console.log(
    `Packed atlas: profile=${args.profile}, source=${args.source}, keys=${available.length}, size=${atlasWidth}x${atlasHeight}, baseCell=${baseCellSize}, spaceCell=${spaceCellSize}, padding=${padding}, png=${atlasPaths.pngPath}, json=${atlasPaths.jsonPath}${args.activate ? ', activated=atlas.json' : ''}`
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
