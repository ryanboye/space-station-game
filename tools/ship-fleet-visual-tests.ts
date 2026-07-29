import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import sharp = require('sharp');
import {
  SHIP_HULL_VARIANTS,
  shipHullAssetPath,
  shipHullProfile
} from '../src/sim/ship-hulls';
import { TILE_SIZE, type ShipHullVariant, type SpaceLane } from '../src/sim/types';
import { shipHullLaneRotationDegrees } from '../src/render/ship-hull-visual';

const LANES: readonly SpaceLane[] = ['north', 'east', 'south', 'west'];
const CELL_SIZE = 240;
const LABEL_WIDTH = 184;
const HEADER_HEIGHT = 38;
const OUTPUT_PATH = resolve('.tmp/ship-fleet-visual/ship-fleet-rotations-32px.png');

type AlphaBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  opaquePixels: number;
};

type RotationEvidence = {
  variant: ShipHullVariant;
  lane: SpaceLane;
  degrees: 0 | 90 | 180 | 270;
  png: Buffer;
  width: number;
  height: number;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ship-fleet-visual: ${message}`);
}

function alphaBounds(data: Buffer, width: number, height: number, channels: number): AlphaBounds {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let opaquePixels = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * channels + 3] === 0) continue;
      opaquePixels += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  assert(opaquePixels > 0, 'A hull bitmap is fully transparent.');
  return { minX, minY, maxX, maxY, opaquePixels };
}

function textSvg(width: number, height: number, label: string, fontSize: number): Buffer {
  return Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">` +
    `<text x="${width / 2}" y="${height / 2}" dominant-baseline="middle" text-anchor="middle" ` +
    `font-family="ui-monospace, monospace" font-size="${fontSize}" fill="#cfe5f6">${label}</text></svg>`
  );
}

async function inspectVariant(variant: ShipHullVariant): Promise<RotationEvidence[]> {
  const profile = shipHullProfile(variant);
  const sourcePath = resolve('public', shipHullAssetPath(variant));
  const source = sharp(sourcePath);
  const metadata = await source.metadata();
  assert(metadata.format === 'png', `${variant} must remain a PNG asset.`);
  assert(metadata.width !== undefined && metadata.height !== undefined, `${variant} has no readable dimensions.`);
  assert(metadata.hasAlpha, `${variant} must retain transparent exterior space.`);
  assert(TILE_SIZE === 32, `The evidence sheet assumes actual gameplay scale is 32px/tile, got ${TILE_SIZE}.`);
  assert(
    Math.abs(metadata.width / metadata.height - profile.nativeAspect) < 0.001,
    `${variant} bitmap aspect ${metadata.width}/${metadata.height} disagrees with its ${profile.nativeAspect} profile.`
  );
  assert(metadata.width <= CELL_SIZE && metadata.height <= CELL_SIZE, `${variant} no longer fits a native-scale evidence cell.`);

  const sourceRaw = await sharp(sourcePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const sourceBounds = alphaBounds(sourceRaw.data, sourceRaw.info.width, sourceRaw.info.height, sourceRaw.info.channels);
  assert(
    sourceBounds.minX > 0 && sourceBounds.minY > 0 &&
      sourceBounds.maxX < sourceRaw.info.width - 1 && sourceBounds.maxY < sourceRaw.info.height - 1,
    `${variant} opaque silhouette touches its bitmap edge and can clip in rotation.`
  );
  const coverage = sourceBounds.opaquePixels / (sourceRaw.info.width * sourceRaw.info.height);
  assert(coverage >= 0.18 && coverage <= 0.5, `${variant} alpha coverage ${coverage.toFixed(3)} is outside the readable fleet range.`);
  assert(sourceBounds.maxX - sourceBounds.minX + 1 >= 24, `${variant} is too narrow to read at gameplay scale.`);
  assert(sourceBounds.maxY - sourceBounds.minY + 1 >= 24, `${variant} is too short to read at gameplay scale.`);

  const expected = profile.interfaceKind === 'pod'
    ? { north: 270, east: 0, south: 90, west: 180 } as const
    : { north: 0, east: 90, south: 180, west: 270 } as const;
  assert(
    profile.interfaceKind === 'pod' ? metadata.width > metadata.height : metadata.height > metadata.width,
    `${variant} does not match the ${profile.interfaceKind} native-axis contract.`
  );

  const evidence: RotationEvidence[] = [];
  for (const lane of LANES) {
    const degrees = shipHullLaneRotationDegrees(variant, lane);
    assert(degrees === expected[lane], `${variant} faces ${degrees}deg for ${lane}; expected ${expected[lane]}deg.`);
    const rotated = await sharp(sourcePath)
      .rotate(degrees, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9, adaptiveFiltering: false })
      .toBuffer();
    const raw = await sharp(rotated).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const expectedWidth = degrees === 90 || degrees === 270 ? metadata.height : metadata.width;
    const expectedHeight = degrees === 90 || degrees === 270 ? metadata.width : metadata.height;
    assert(
      raw.info.width === expectedWidth && raw.info.height === expectedHeight,
      `${variant}/${lane} rotated to ${raw.info.width}x${raw.info.height}; expected ${expectedWidth}x${expectedHeight}.`
    );
    const bounds = alphaBounds(raw.data, raw.info.width, raw.info.height, raw.info.channels);
    assert(
      bounds.minX > 0 && bounds.minY > 0 && bounds.maxX < raw.info.width - 1 && bounds.maxY < raw.info.height - 1,
      `${variant}/${lane} clips its opaque silhouette.`
    );
    evidence.push({ variant, lane, degrees, png: rotated, width: raw.info.width, height: raw.info.height });
  }
  return evidence;
}

async function writeContactSheet(evidence: RotationEvidence[]): Promise<void> {
  const width = LABEL_WIDTH + LANES.length * CELL_SIZE;
  const height = HEADER_HEIGHT + SHIP_HULL_VARIANTS.length * CELL_SIZE;
  const composites: sharp.OverlayOptions[] = [];

  for (let column = 0; column < LANES.length; column++) {
    composites.push({
      input: textSvg(CELL_SIZE, HEADER_HEIGHT, LANES[column].toUpperCase(), 15),
      left: LABEL_WIDTH + column * CELL_SIZE,
      top: 0
    });
  }
  for (let row = 0; row < SHIP_HULL_VARIANTS.length; row++) {
    const variant = SHIP_HULL_VARIANTS[row];
    composites.push({
      input: textSvg(LABEL_WIDTH, CELL_SIZE, variant, 13),
      left: 0,
      top: HEADER_HEIGHT + row * CELL_SIZE
    });
    for (let column = 0; column < LANES.length; column++) {
      const lane = LANES[column];
      const item = evidence.find((entry) => entry.variant === variant && entry.lane === lane);
      assert(item, `Missing contact-sheet evidence for ${variant}/${lane}.`);
      composites.push({
        input: item.png,
        left: LABEL_WIDTH + column * CELL_SIZE + Math.floor((CELL_SIZE - item.width) / 2),
        top: HEADER_HEIGHT + row * CELL_SIZE + Math.floor((CELL_SIZE - item.height) / 2)
      });
    }
  }

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  await sharp({
    create: { width, height, channels: 4, background: { r: 8, g: 17, b: 28, alpha: 1 } }
  })
    .composite(composites)
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toFile(OUTPUT_PATH);
}

async function main(): Promise<void> {
  const hashes = new Set<string>();
  const evidence: RotationEvidence[] = [];
  for (const variant of SHIP_HULL_VARIANTS) {
    const sourcePath = resolve('public', shipHullAssetPath(variant));
    const source = await sharp(sourcePath).png().toBuffer();
    const hash = createHash('sha256').update(source).digest('hex');
    assert(!hashes.has(hash), `${variant} duplicates another fleet bitmap rather than carrying a distinct identity.`);
    hashes.add(hash);
    evidence.push(...await inspectVariant(variant));
  }
  assert(evidence.length === 32, `Expected 32 hull/lane renders, got ${evidence.length}.`);
  await writeContactSheet(evidence);
  console.log(`ship-fleet-visual-tests: ok (8 hulls, 4 approaches, native ${TILE_SIZE}px/tile evidence at ${OUTPUT_PATH})`);
}

void main();
