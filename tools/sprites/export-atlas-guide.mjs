#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

function parseArgs(argv) {
  const args = {
    manifest: path.resolve('public/assets/sprites/atlas.json'),
    image: '',
    outDir: '',
    label: 'key'
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--manifest' && argv[i + 1]) {
      args.manifest = argv[i + 1];
      i += 1;
    } else if (arg === '--image' && argv[i + 1]) {
      args.image = argv[i + 1];
      i += 1;
    } else if (arg === '--outdir' && argv[i + 1]) {
      args.outDir = argv[i + 1];
      i += 1;
    } else if (arg === '--label' && argv[i + 1]) {
      args.label = argv[i + 1];
      i += 1;
    }
  }
  if (!['key', 'index', 'none'].includes(args.label)) {
    throw new Error(`Invalid --label value: ${args.label}`);
  }
  return args;
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function hashColor(seed) {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `hsl(${hash % 360} 75% 62%)`;
}

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'atlas';
}

function inferAtlasSize(frames, padding) {
  let width = 0;
  let height = 0;
  for (const frame of frames) {
    width = Math.max(width, frame.x + frame.w + padding);
    height = Math.max(height, frame.y + frame.h + padding);
  }
  return { width, height };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifestPath = path.resolve(args.manifest);
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  if (!manifest || typeof manifest !== 'object' || !manifest.frames || typeof manifest.frames !== 'object') {
    throw new Error(`Invalid atlas manifest: ${manifestPath}`);
  }

  const manifestDir = path.dirname(manifestPath);
  const atlasImagePath = path.resolve(args.image || path.join(manifestDir, manifest.imagePath || 'atlas.png'));
  const outDir = path.resolve(args.outDir || path.join(manifestDir, 'guides'));
  await fs.mkdir(outDir, { recursive: true });

  const frames = Object.entries(manifest.frames)
    .map(([key, value], index) => ({
      key,
      guideIndex: index + 1,
      x: Number(value.x ?? 0),
      y: Number(value.y ?? 0),
      w: Number(value.w ?? 0),
      h: Number(value.h ?? 0),
      color: hashColor(key)
    }))
    .filter((frame) => Number.isFinite(frame.x) && Number.isFinite(frame.y) && Number.isFinite(frame.w) && Number.isFinite(frame.h));

  if (frames.length <= 0) {
    throw new Error(`No frames found in atlas manifest: ${manifestPath}`);
  }

  const cellSize = Number(manifest.cellSize ?? 64);
  const padding = 2;
  let width = 0;
  let height = 0;
  try {
    const meta = await sharp(atlasImagePath).metadata();
    width = Number(meta.width ?? 0);
    height = Number(meta.height ?? 0);
  } catch {
    const inferred = inferAtlasSize(frames, padding);
    width = inferred.width;
    height = inferred.height;
  }
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error(`Unable to determine atlas image size from ${atlasImagePath}`);
  }

  const labelParts = [];
  for (const frame of frames) {
    const outerX = frame.x - padding;
    const outerY = frame.y - padding;
    const outerW = frame.w + padding * 2;
    const outerH = frame.h + padding * 2;
    const label =
      args.label === 'none' ? '' : args.label === 'index' ? String(frame.guideIndex) : frame.key;
    const labelWidth = Math.max(22, Math.round(label.length * Math.max(7, cellSize * 0.15) + 8));
    const labelHeight = 18;
    labelParts.push(`
      <g>
        <rect x="${outerX + 0.5}" y="${outerY + 0.5}" width="${outerW}" height="${outerH}"
          fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.14)" stroke-width="1" stroke-dasharray="4 3" />
        <rect x="${frame.x + 0.5}" y="${frame.y + 0.5}" width="${frame.w}" height="${frame.h}"
          fill="none" stroke="${frame.color}" stroke-width="2" />
        ${
          label
            ? `<rect x="${frame.x + 1}" y="${frame.y + 1}" width="${labelWidth}" height="${labelHeight}"
                fill="rgba(0,0,0,0.82)" stroke="${frame.color}" stroke-width="1" />
               <text x="${frame.x + 5}" y="${frame.y + 13}" fill="#ffffff"
                font-family="monospace" font-size="11" font-weight="700">${escapeXml(label)}</text>`
            : ''
        }
      </g>
    `);
  }

  const overlaySvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      ${labelParts.join('\n')}
    </svg>
  `);

  const atlasSlug = slugify(path.basename(manifestPath, path.extname(manifestPath)));
  const blankTemplatePath = path.join(outDir, `${atlasSlug}-template.png`);
  const overlayPath = path.join(outDir, `${atlasSlug}-overlay.png`);
  const guidePath = path.join(outDir, `${atlasSlug}-guide.png`);
  const indexPath = path.join(outDir, `${atlasSlug}-index.json`);

  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([{ input: overlaySvg, left: 0, top: 0 }])
    .png()
    .toFile(overlayPath);

  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 11, g: 15, b: 22, alpha: 1 }
    }
  })
    .composite([{ input: overlaySvg, left: 0, top: 0 }])
    .png()
    .toFile(blankTemplatePath);

  await sharp(atlasImagePath)
    .composite([{ input: overlaySvg, left: 0, top: 0 }])
    .png()
    .toFile(guidePath);

  const index = {
    version: 1,
    manifestPath,
    atlasImagePath,
    cellSize,
    padding,
    width,
    height,
    files: {
      blankTemplatePath,
      overlayPath,
      guidePath
    },
    entries: frames.map((frame) => ({
      guideIndex: frame.guideIndex,
      key: frame.key,
      safeRect: { x: frame.x, y: frame.y, w: frame.w, h: frame.h },
      paddedRect: { x: frame.x - padding, y: frame.y - padding, w: frame.w + padding * 2, h: frame.h + padding * 2 }
    }))
  };
  await fs.writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`);

  console.log(`Blank template written to ${blankTemplatePath}`);
  console.log(`Overlay written to ${overlayPath}`);
  console.log(`Guide written to ${guidePath}`);
  console.log(`Index written to ${indexPath}`);
  console.log(`Frames: ${frames.length}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
