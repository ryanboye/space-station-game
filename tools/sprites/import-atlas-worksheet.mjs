#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

function parseArgs(argv) {
  const args = {
    map: '',
    sheet: '',
    out: ''
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--map' && argv[i + 1]) {
      args.map = argv[i + 1];
      i += 1;
    } else if (arg === '--sheet' && argv[i + 1]) {
      args.sheet = argv[i + 1];
      i += 1;
    } else if (arg === '--out' && argv[i + 1]) {
      args.out = argv[i + 1];
      i += 1;
    }
  }
  if (!args.map || !args.sheet) {
    throw new Error('Usage: node tools/sprites/import-atlas-worksheet.mjs --map /path/to/atlas-worksheet-map.json --sheet /path/to/edited-sheet.png [--out /path/to/atlas.png]');
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mapPath = path.resolve(args.map);
  const worksheetPath = path.resolve(args.sheet);
  const map = JSON.parse(await fs.readFile(mapPath, 'utf8'));
  if (!map?.entries || !Array.isArray(map.entries)) {
    throw new Error(`Invalid worksheet map: ${mapPath}`);
  }
  const atlasImagePath = path.resolve(args.out || map.atlasImagePath);
  const sheet = sharp(worksheetPath);
  const sheetMeta = await sheet.metadata();
  if (!sheetMeta.width || !sheetMeta.height) {
    throw new Error(`Unable to read worksheet image: ${worksheetPath}`);
  }

  const atlasWidth = Math.max(...map.entries.map((entry) => entry.atlasRect.x + entry.atlasRect.w));
  const atlasHeight = Math.max(...map.entries.map((entry) => entry.atlasRect.y + entry.atlasRect.h));
  const composites = [];
  for (const entry of map.entries) {
    const safe = entry.safeRect;
    const atlas = entry.atlasRect;
    const buffer = await sheet
      .clone()
      .extract({
        left: Math.round(safe.x),
        top: Math.round(safe.y),
        width: Math.round(safe.w),
        height: Math.round(safe.h)
      })
      .resize(atlas.w, atlas.h, { kernel: 'nearest' })
      .png()
      .toBuffer();
    composites.push({
      input: buffer,
      left: atlas.x,
      top: atlas.y
    });
  }

  await fs.mkdir(path.dirname(atlasImagePath), { recursive: true });
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
    .toFile(atlasImagePath);

  console.log(`Updated atlas image written to ${atlasImagePath}`);
  console.log(`Entries imported: ${map.entries.length}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
