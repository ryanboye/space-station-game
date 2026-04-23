#!/usr/bin/env node
/**
 * Unpack an atlas sprite sheet (e.g. a ChatGPT-generated grid of tiles)
 * into individual per-key PNGs under `tools/sprites/curated/`, then the
 * existing `sprites:pack` command assembles them into the live atlas.
 *
 * Workflow owner: awfml generates cohesive atlas sheets in ChatGPT Pro
 * (interactive, verified identity via the consumer product — no OpenAI
 * API org-verification dance), drops the sheet PNG + a per-cell key map
 * into git, then BMO's pipeline slices + packs + deploys.
 *
 * Usage:
 *   node tools/sprites/unpack-atlas-sheet.mjs \
 *     --sheet tools/sprites/sheets/awfml-2026-04-23.png \
 *     --map   tools/sprites/sheets/awfml-2026-04-23.yaml \
 *     [--out-dir tools/sprites/curated] \
 *     [--color-key FFFFFF] [--color-key-tolerance 12] \
 *     [--dry-run]
 *
 * Map YAML shape:
 *   source: "awfml-2026-04-23.png"
 *   grid:
 *     cols: 16
 *     rows: 16
 *     cell_size_px: 64     # each cell is 64×64 on the sheet
 *     gutter_px: 0         # spacing between cells (0 for tight grids)
 *     origin: [0, 0]       # top-left pixel of cell (0,0). Usually [0,0].
 *   keys:
 *     # (col, row): atlas-key
 *     "0,0": tile.floor
 *     "1,0": tile.wall.solo
 *     "2,0": tile.wall.end
 *     ...
 *
 * Each cell is cropped, optionally color-keyed to transparent, and written
 * to `<out-dir>/<filename>.png` where filename is the atlas key with
 * non-alphanumerics → underscores (matches `pack-atlas.mjs`'s expectation).
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import YAML from 'yaml';

const THIS_FILE = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(THIS_FILE), '..', '..');
const DEFAULT_OUT_DIR = path.resolve(ROOT, 'tools/sprites/curated');

function parseArgs(argv) {
  const args = { dryRun: false, outDir: DEFAULT_OUT_DIR };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--sheet') args.sheet = argv[++i];
    else if (a === '--map') args.map = argv[++i];
    else if (a === '--out-dir') args.outDir = argv[++i];
    else if (a === '--color-key') args.colorKey = argv[++i];
    else if (a === '--color-key-tolerance') args.colorKeyTolerance = Number(argv[++i]);
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--help' || a === '-h') {
      console.log('usage: see header comment in unpack-atlas-sheet.mjs');
      process.exit(0);
    } else {
      console.error(`unknown flag: ${a}`);
      process.exit(2);
    }
  }
  if (!args.sheet || !args.map) {
    console.error('required: --sheet <png> --map <yaml>');
    process.exit(2);
  }
  return args;
}

function keyToFilename(key) {
  return `${key.replace(/[^a-zA-Z0-9]+/g, '_')}.png`;
}

function parseHex(hex) {
  const clean = hex.replace(/^#/, '');
  if (clean.length !== 6) throw new Error(`color-key must be 6-hex (got ${hex})`);
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

/** Apply color-key transparency: any pixel within `tolerance` of the
 *  key color (chebyshev distance) becomes alpha=0. Everything else
 *  keeps its rgb + alpha=255. Morphological cleanup is deliberately
 *  absent v1 — if the source sheet has clean edges, we're fine. */
async function applyColorKey(buffer, keyColor, tolerance) {
  const image = sharp(buffer).ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const { r: kr, g: kg, b: kb } = keyColor;
  for (let i = 0; i < data.length; i += info.channels) {
    const dr = Math.abs(data[i] - kr);
    const dg = Math.abs(data[i + 1] - kg);
    const db = Math.abs(data[i + 2] - kb);
    if (Math.max(dr, dg, db) <= tolerance) {
      data[i + 3] = 0;
    }
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .png()
    .toBuffer();
}

async function unpackSheet(args) {
  const sheetPath = path.resolve(args.sheet);
  const mapPath = path.resolve(args.map);
  const sheetBuf = await fs.readFile(sheetPath);
  const mapText = await fs.readFile(mapPath, 'utf8');
  const spec = YAML.parse(mapText);
  const grid = spec.grid || {};
  const cell = Number(grid.cell_size_px ?? grid.cell_size ?? 64);
  const gutter = Number(grid.gutter_px ?? 0);
  const origin = grid.origin || [0, 0];
  const keys = spec.keys || {};
  const colorKey = args.colorKey ? parseHex(args.colorKey) : null;
  const tolerance = args.colorKeyTolerance ?? 12;

  if (args.dryRun) {
    console.log(`[dry-run] would unpack ${Object.keys(keys).length} cells from ${sheetPath}`);
  } else {
    await fs.mkdir(args.outDir, { recursive: true });
  }

  const sheet = sharp(sheetBuf);
  const meta = await sheet.metadata();
  console.log(`sheet: ${meta.width}×${meta.height} px, ${cell}px cells, ${Object.keys(keys).length} keys mapped`);

  let written = 0;
  let skipped = 0;
  for (const [cellKey, atlasKey] of Object.entries(keys)) {
    const [col, row] = cellKey.split(',').map((n) => Number(n.trim()));
    const x = origin[0] + col * (cell + gutter);
    const y = origin[1] + row * (cell + gutter);
    if (x + cell > meta.width || y + cell > meta.height) {
      console.warn(`  [skip] ${atlasKey} at (${col},${row}) → pixel (${x},${y}) out of bounds`);
      skipped++;
      continue;
    }
    const filename = keyToFilename(atlasKey);
    const outPath = path.join(args.outDir, filename);

    let cellBuf = await sharp(sheetBuf).extract({ left: x, top: y, width: cell, height: cell }).png().toBuffer();
    if (colorKey) {
      cellBuf = await applyColorKey(cellBuf, colorKey, tolerance);
    }

    if (!args.dryRun) {
      await fs.writeFile(outPath, cellBuf);
    }
    console.log(`  [${args.dryRun ? 'dry' : 'ok'}] ${atlasKey.padEnd(30)} ← cell(${col},${row}) → ${filename}`);
    written++;
  }

  console.log(`\ndone: ${written} cells ${args.dryRun ? 'would be written' : 'written'} to ${args.outDir}, ${skipped} skipped`);
  console.log(`next: run \`npm run sprites:pack\` to assemble atlas.{png,json}, then review + commit.`);
}

unpackSheet(parseArgs(process.argv)).catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
