#!/usr/bin/env node
// Generates 5 deterministic PNGs for the dual-tilemap wall sprite set.
// The inner_corner stub is NOT generated here — it is derived from
// wall_dual_full.png by the pack-atlas step (see promote-stubs.mjs).
//
// Palette (matches walls-dt-template.txt):
//   alpha 0             — transparent quadrant
//   #2a3040 wall body   — cool steel-blue
//   #d8e0ea rim-light   — cool-white edge highlight
//
// Layout: 64x64 canvas, 4 × 32x32 quadrants (TL, TR, BL, BR).
// Authoring is TL-biased (matches pickDualVariant's canonical lookup).

import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const SIZE = 64;
const HALF = 32;
const BODY = { r: 0x2a, g: 0x30, b: 0x40 };
const BODY_DARK = { r: 0x20, g: 0x25, b: 0x33 };
const BODY_LIGHT = { r: 0x37, g: 0x40, b: 0x54 };
const RIM = { r: 0xd8, g: 0xe0, b: 0xea };

function makeBuffer() {
  const buf = Buffer.alloc(SIZE * SIZE * 4);
  for (let i = 0; i < SIZE * SIZE; i++) {
    buf[i * 4 + 0] = 0;
    buf[i * 4 + 1] = 0;
    buf[i * 4 + 2] = 0;
    buf[i * 4 + 3] = 0;
  }
  return buf;
}

function put(buf, x, y, color) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  const i = (y * SIZE + x) * 4;
  buf[i + 0] = color.r;
  buf[i + 1] = color.g;
  buf[i + 2] = color.b;
  buf[i + 3] = 255;
}

function fillRect(buf, x0, y0, x1, y1, color) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      put(buf, x, y, color);
    }
  }
}

function fillQuadrant(buf, col, row) {
  // col, row ∈ {0,1}; 0=left/top quadrant, 1=right/bottom
  const x0 = col * HALF;
  const y0 = row * HALF;
  fillRect(buf, x0, y0, x0 + HALF, y0 + HALF, BODY);
  for (let y = y0; y < y0 + HALF; y++) {
    for (let x = x0; x < x0 + HALF; x++) {
      if ((x + y) % 11 === 0) put(buf, x, y, BODY_LIGHT);
      if (x % 16 === 0 || y % 16 === 0) put(buf, x, y, BODY_DARK);
    }
  }
}

function drawRimOnExternalEdges(buf, filledQuadrants) {
  // filledQuadrants is a set of "col,row" strings for filled quadrants.
  // For each filled quadrant, for each of its 4 edges, rim-light if the
  // NEIGHBOR quadrant across that edge is NOT filled (either empty in this
  // sprite, or outside the 2x2 quadrant grid — but outside = cell boundary,
  // we skip rim there per spec, only interior wall-meets-empty gets rim).
  const isFilled = (c, r) => filledQuadrants.has(`${c},${r}`);
  const RIM_THICKNESS = 2;
  for (const key of filledQuadrants) {
    const [col, row] = key.split(',').map(Number);
    const x0 = col * HALF;
    const y0 = row * HALF;
    const x1 = x0 + HALF;
    const y1 = y0 + HALF;
    // Top edge: neighbor is (col, row-1)
    if (row - 1 >= 0 && !isFilled(col, row - 1)) {
      fillRect(buf, x0, y0, x1, y0 + RIM_THICKNESS, RIM);
    }
    // Bottom edge: neighbor is (col, row+1)
    if (row + 1 <= 1 && !isFilled(col, row + 1)) {
      fillRect(buf, x0, y1 - RIM_THICKNESS, x1, y1, RIM);
    }
    // Left edge: neighbor is (col-1, row)
    if (col - 1 >= 0 && !isFilled(col - 1, row)) {
      fillRect(buf, x0, y0, x0 + RIM_THICKNESS, y1, RIM);
    }
    // Right edge: neighbor is (col+1, row)
    if (col + 1 <= 1 && !isFilled(col + 1, row)) {
      fillRect(buf, x1 - RIM_THICKNESS, y0, x1, y1, RIM);
    }
  }
}

async function writeStub(name, filledQuadrants) {
  const buf = makeBuffer();
  const set = new Set(filledQuadrants.map(([c, r]) => `${c},${r}`));
  for (const [c, r] of filledQuadrants) fillQuadrant(buf, c, r);
  drawRimOnExternalEdges(buf, set);
  const outPath = path.join(HERE, name);
  await sharp(buf, { raw: { width: SIZE, height: SIZE, channels: 4 } })
    .png()
    .toFile(outPath);
  console.log(`wrote ${outPath}`);
}

async function main() {
  // empty: no quadrants filled (all magenta)
  await writeStub('wall_dual_empty.png', []);
  // single_corner: TL only (canonical authoring)
  await writeStub('wall_dual_single_corner.png', [[0, 0]]);
  // two_adjacent = edge: TL + TR (top half)
  await writeStub('wall_dual_two_adjacent.png', [[0, 0], [1, 0]]);
  // two_diagonal = saddle: TL + BR
  await writeStub('wall_dual_two_diagonal.png', [[0, 0], [1, 1]]);
  // full: all 4
  await writeStub('wall_dual_full.png', [[0, 0], [1, 0], [0, 1], [1, 1]]);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
