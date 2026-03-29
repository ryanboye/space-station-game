import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

function parseArgs(argv) {
  const args = {
    imagePath: '',
    mapPath: '',
    outDir: ''
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--image') {
      args.imagePath = argv[i + 1] ?? '';
      i += 1;
    } else if (arg === '--map') {
      args.mapPath = argv[i + 1] ?? '';
      i += 1;
    } else if (arg === '--outdir') {
      args.outDir = argv[i + 1] ?? '';
      i += 1;
    }
  }
  if (!args.imagePath || !args.mapPath) {
    throw new Error('Usage: node tools/sprites/crop-save-scene.mjs --image /path/to/stylized.png --map /path/to/crop-map.json [--outdir dir]');
  }
  return args;
}

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'candidate';
}

function entryFilename(entry) {
  const base = [entry.key];
  if (entry.kind === 'tile') {
    base.push(`tile-${entry.tileIndex}`);
    if (entry.roomType && entry.roomType !== 'none') base.push(`room-${entry.roomType}`);
    if (entry.variantShape) base.push(`variant-${entry.variantShape}`);
    if (typeof entry.variantRotation === 'number') base.push(`rot-${entry.variantRotation}`);
  } else if (entry.kind === 'module') {
    base.push(`module-${entry.moduleIndex}`);
    base.push(`rot-${entry.rotation ?? 0}`);
  }
  return `${slugify(base.join('__'))}.png`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const imagePath = path.resolve(args.imagePath);
  const mapPath = path.resolve(args.mapPath);
  const map = JSON.parse(await fs.readFile(mapPath, 'utf8'));
  if (!map || !Array.isArray(map.entries)) {
    throw new Error(`Invalid crop map: ${mapPath}`);
  }
  const outDir = path.resolve(args.outDir || path.join(path.dirname(mapPath), 'candidates'));
  await fs.mkdir(outDir, { recursive: true });

  const image = sharp(imagePath);
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error(`Unable to read image dimensions for ${imagePath}`);
  }
  const expectedWidth = Number(map?.bounds?.widthPx ?? 0);
  const expectedHeight = Number(map?.bounds?.heightPx ?? 0);
  const shouldNormalize =
    Number.isFinite(expectedWidth) &&
    Number.isFinite(expectedHeight) &&
    expectedWidth > 0 &&
    expectedHeight > 0 &&
    (metadata.width !== expectedWidth || metadata.height !== expectedHeight);

  const normalizedImage = shouldNormalize
    ? image.clone().resize({
        width: expectedWidth,
        height: expectedHeight,
        fit: 'fill',
        kernel: 'nearest'
      })
    : image;

  let written = 0;
  for (const entry of map.entries) {
    if (!Number.isFinite(entry.x) || !Number.isFinite(entry.y) || !Number.isFinite(entry.w) || !Number.isFinite(entry.h)) continue;
    const keyDir = path.join(outDir, entry.kind === 'module' ? 'modules' : 'tiles', entry.key);
    await fs.mkdir(keyDir, { recursive: true });
    const targetPath = path.join(keyDir, entryFilename(entry));
    await normalizedImage
      .clone()
      .extract({
        left: Math.max(0, Math.round(entry.x)),
        top: Math.max(0, Math.round(entry.y)),
        width: Math.max(1, Math.round(entry.w)),
        height: Math.max(1, Math.round(entry.h))
      })
      .png()
      .toFile(targetPath);
    written += 1;
  }

  if (shouldNormalize) {
    console.log(`Normalized source image from ${metadata.width}x${metadata.height} to ${expectedWidth}x${expectedHeight} for crop alignment`);
  }
  console.log(`Wrote ${written} crops to ${outDir}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
