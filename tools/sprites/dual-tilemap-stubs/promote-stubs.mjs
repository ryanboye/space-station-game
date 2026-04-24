#!/usr/bin/env node
// Copies the 5 staged dual-tilemap stubs into tools/sprites/curated/ with
// the pack-atlas keyToFileName mapping, and PROGRAMMATICALLY DERIVES a
// placeholder for tile.wall.dt.inner_corner by taking wall_dual_full.png
// and clearing the bottom-right quadrant to alpha 0.
//
// (The real inner_corner stub is not in the staged set — this keeps the
// runtime contract valid until a hand-authored asset replaces it.)

import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CURATED = path.resolve(HERE, '..', 'curated');

const MAP = [
  ['wall_dual_empty.png', 'tile_wall_dt_empty.png'],
  ['wall_dual_single_corner.png', 'tile_wall_dt_single_corner.png'],
  ['wall_dual_two_adjacent.png', 'tile_wall_dt_edge.png'],
  ['wall_dual_two_diagonal.png', 'tile_wall_dt_saddle.png'],
  ['wall_dual_full.png', 'tile_wall_dt_full.png']
];

async function copyOne(src, dst) {
  await fs.copyFile(src, dst);
  console.log(`copied ${path.basename(src)} -> ${path.basename(dst)}`);
}

async function deriveInnerCornerFromFull(fullPath, outPath) {
  const img = sharp(fullPath);
  const { width, height } = await img.metadata();
  if (!width || !height) throw new Error('invalid full.png dims');
  const raw = await sharp(fullPath).ensureAlpha().raw().toBuffer();
  const halfW = Math.floor(width / 2);
  const halfH = Math.floor(height / 2);
  for (let y = halfH; y < height; y++) {
    for (let x = halfW; x < width; x++) {
      const i = (y * width + x) * 4;
      raw[i + 0] = 0x00;
      raw[i + 1] = 0x00;
      raw[i + 2] = 0x00;
      raw[i + 3] = 0x00;
    }
  }
  await sharp(raw, { raw: { width, height, channels: 4 } })
    .png()
    .toFile(outPath);
  console.log(`derived inner_corner placeholder at ${path.basename(outPath)}`);
}

async function main() {
  await fs.mkdir(CURATED, { recursive: true });
  for (const [src, dst] of MAP) {
    await copyOne(path.join(HERE, src), path.join(CURATED, dst));
  }
  await deriveInnerCornerFromFull(
    path.join(HERE, 'wall_dual_full.png'),
    path.join(CURATED, 'tile_wall_dt_inner_corner.png')
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
