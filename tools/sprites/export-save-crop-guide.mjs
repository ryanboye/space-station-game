#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

function parseArgs(argv) {
  const args = {
    mapPath: '',
    backgroundPath: '',
    scope: 'modules',
    outDir: '',
    label: 'index'
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--map' && argv[i + 1]) {
      args.mapPath = argv[i + 1];
      i += 1;
    } else if (arg === '--background' && argv[i + 1]) {
      args.backgroundPath = argv[i + 1];
      i += 1;
    } else if (arg === '--scope' && argv[i + 1]) {
      args.scope = argv[i + 1];
      i += 1;
    } else if (arg === '--outdir' && argv[i + 1]) {
      args.outDir = argv[i + 1];
      i += 1;
    } else if (arg === '--label' && argv[i + 1]) {
      args.label = argv[i + 1];
      i += 1;
    }
  }
  if (!args.mapPath) {
    throw new Error('Usage: node tools/sprites/export-save-crop-guide.mjs --map /path/to/crop-map.json [--background /path/to/image.png] [--scope modules|tiles|all]');
  }
  if (!['modules', 'tiles', 'all'].includes(args.scope)) {
    throw new Error(`Invalid --scope: ${args.scope}`);
  }
  if (!['index', 'key'].includes(args.label)) {
    throw new Error(`Invalid --label: ${args.label}`);
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

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'save-scene';
}

function hashColor(seed) {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const hue = hash % 360;
  return `hsl(${hue} 78% 62%)`;
}

function filterEntries(entries, scope) {
  if (scope === 'all') return entries;
  if (scope === 'modules') return entries.filter((entry) => entry.kind === 'module');
  return entries.filter((entry) => entry.kind === 'tile');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mapPath = path.resolve(args.mapPath);
  const map = JSON.parse(await fs.readFile(mapPath, 'utf8'));
  if (!map || !Array.isArray(map.entries)) {
    throw new Error(`Invalid crop map: ${mapPath}`);
  }

  const width = Number(map?.bounds?.widthPx ?? 0);
  const height = Number(map?.bounds?.heightPx ?? 0);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error(`Crop map is missing valid pixel bounds: ${mapPath}`);
  }

  const sceneSlug = slugify(map.saveName || path.basename(path.dirname(mapPath)));
  const outDir = path.resolve(args.outDir || path.join(path.dirname(mapPath), 'guides'));
  await fs.mkdir(outDir, { recursive: true });

  const entries = filterEntries(map.entries, args.scope).map((entry, index) => ({
    ...entry,
    guideIndex: index + 1,
    guideColor: hashColor(`${entry.key}|${entry.id}|${entry.kind}`)
  }));

  if (entries.length <= 0) {
    throw new Error(`No entries available for scope=${args.scope}`);
  }

  const fontSize = args.scope === 'tiles' ? 12 : 20;
  const strokeWidth = args.scope === 'tiles' ? 1 : 2;
  const pad = args.scope === 'tiles' ? 2 : 4;
  const labelParts = [];
  for (const entry of entries) {
    const label = args.label === 'key' ? entry.key : String(entry.guideIndex);
    const boxWidth = Math.max(1, entry.w);
    const boxHeight = Math.max(1, entry.h);
    labelParts.push(`
      <g>
        <rect x="${entry.x + 0.5}" y="${entry.y + 0.5}" width="${boxWidth}" height="${boxHeight}"
          fill="none" stroke="${entry.guideColor}" stroke-width="${strokeWidth}" />
        <rect x="${entry.x + 1}" y="${entry.y + 1}" width="${Math.max(20, label.length * (fontSize * 0.7) + pad * 2)}" height="${fontSize + pad * 2}"
          fill="rgba(0,0,0,0.78)" stroke="${entry.guideColor}" stroke-width="${strokeWidth}" />
        <text x="${entry.x + pad + 1}" y="${entry.y + fontSize + 0.5}" fill="#ffffff"
          font-family="monospace" font-size="${fontSize}" font-weight="700">${escapeXml(label)}</text>
      </g>
    `);
  }

  const overlaySvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      ${labelParts.join('\n')}
    </svg>
  `);

  const overlayPath = path.join(outDir, `${sceneSlug}-${args.scope}-overlay.png`);
  const guidePath = path.join(outDir, `${sceneSlug}-${args.scope}-guide.png`);
  const indexPath = path.join(outDir, `${sceneSlug}-${args.scope}-index.json`);

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

  const backgroundPath = args.backgroundPath
    ? path.resolve(args.backgroundPath)
    : typeof map.imagePath === 'string'
      ? path.resolve(map.imagePath)
      : '';

  if (backgroundPath) {
    await sharp(backgroundPath)
      .resize(width, height, { fit: 'fill', kernel: 'nearest' })
      .composite([{ input: overlaySvg, left: 0, top: 0 }])
      .png()
      .toFile(guidePath);
  } else {
    await sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: 12, g: 18, b: 28, alpha: 1 }
      }
    })
      .composite([{ input: overlaySvg, left: 0, top: 0 }])
      .png()
      .toFile(guidePath);
  }

  const index = {
    version: 1,
    saveName: map.saveName,
    scope: args.scope,
    overlayPath,
    guidePath,
    entries: entries.map((entry) => ({
      guideIndex: entry.guideIndex,
      kind: entry.kind,
      key: entry.key,
      id: entry.id,
      x: entry.x,
      y: entry.y,
      w: entry.w,
      h: entry.h,
      tileIndex: entry.tileIndex ?? null,
      moduleIndex: entry.moduleIndex ?? null,
      rotation: entry.rotation ?? entry.variantRotation ?? null,
      tileType: entry.tileType ?? null,
      moduleType: entry.moduleType ?? null,
      variantKey: entry.variantKey ?? null
    }))
  };
  await fs.writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`);

  console.log(`Guide written to ${guidePath}`);
  console.log(`Overlay written to ${overlayPath}`);
  console.log(`Index written to ${indexPath}`);
  console.log(`Entries: ${entries.length}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
