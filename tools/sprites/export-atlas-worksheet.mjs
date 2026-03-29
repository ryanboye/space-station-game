#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

function parseArgs(argv) {
  const args = {
    manifest: path.resolve('public/assets/sprites/atlas.json'),
    image: '',
    outDir: '',
    scale: 1,
    cellPad: 24,
    labelHeight: 18,
    gap: 20,
    maxWidth: 2048
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
    } else if (arg === '--scale' && argv[i + 1]) {
      args.scale = Number(argv[i + 1]);
      i += 1;
    } else if (arg === '--cell-pad' && argv[i + 1]) {
      args.cellPad = Number(argv[i + 1]);
      i += 1;
    } else if (arg === '--label-height' && argv[i + 1]) {
      args.labelHeight = Number(argv[i + 1]);
      i += 1;
    } else if (arg === '--gap' && argv[i + 1]) {
      args.gap = Number(argv[i + 1]);
      i += 1;
    } else if (arg === '--max-width' && argv[i + 1]) {
      args.maxWidth = Number(argv[i + 1]);
      i += 1;
    }
  }
  if (!Number.isFinite(args.scale) || args.scale <= 0) throw new Error('--scale must be > 0');
  if (!Number.isFinite(args.cellPad) || args.cellPad < 0) throw new Error('--cell-pad must be >= 0');
  if (!Number.isFinite(args.labelHeight) || args.labelHeight < 0) throw new Error('--label-height must be >= 0');
  if (!Number.isFinite(args.gap) || args.gap < 0) throw new Error('--gap must be >= 0');
  if (!Number.isFinite(args.maxWidth) || args.maxWidth <= 0) throw new Error('--max-width must be > 0');
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
  return `hsl(${hash % 360} 78% 64%)`;
}

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'atlas';
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifestPath = path.resolve(args.manifest);
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  if (!manifest?.frames || typeof manifest.frames !== 'object') {
    throw new Error(`Invalid atlas manifest: ${manifestPath}`);
  }

  const manifestDir = path.dirname(manifestPath);
  const atlasImagePath = path.resolve(args.image || path.join(manifestDir, manifest.imagePath || 'atlas.png'));
  const atlasMeta = await sharp(atlasImagePath).metadata();
  const atlasWidth = Number(atlasMeta.width ?? 0);
  const atlasHeight = Number(atlasMeta.height ?? 0);
  if (!atlasWidth || !atlasHeight) {
    throw new Error(`Unable to determine atlas image size: ${atlasImagePath}`);
  }

  const outDir = path.resolve(args.outDir || path.join(manifestDir, 'worksheet'));
  await fs.mkdir(outDir, { recursive: true });

  const entries = Object.entries(manifest.frames).map(([key, frame], index) => {
    const safeW = Number(frame.w ?? 0) * args.scale;
    const safeH = Number(frame.h ?? 0) * args.scale;
    const pad = args.cellPad;
    const labelHeight = args.labelHeight;
    return {
      key,
      index: index + 1,
      atlasX: Number(frame.x ?? 0),
      atlasY: Number(frame.y ?? 0),
      atlasW: Number(frame.w ?? 0),
      atlasH: Number(frame.h ?? 0),
      safeW,
      safeH,
      cellW: safeW + pad * 2,
      cellH: safeH + pad * 2 + labelHeight,
      color: hashColor(key)
    };
  });

  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;
  let sheetWidth = 0;
  const maxWidth = args.maxWidth;
  for (const entry of entries) {
    if (cursorX > 0 && cursorX + entry.cellW > maxWidth) {
      cursorX = 0;
      cursorY += rowHeight + args.gap;
      rowHeight = 0;
    }
    entry.cellX = cursorX;
    entry.cellY = cursorY;
    entry.safeX = cursorX + args.cellPad;
    entry.safeY = cursorY + args.labelHeight + args.cellPad;
    cursorX += entry.cellW + args.gap;
    rowHeight = Math.max(rowHeight, entry.cellH);
    sheetWidth = Math.max(sheetWidth, entry.cellX + entry.cellW);
  }
  const sheetHeight = cursorY + rowHeight;

  const composites = [];
  for (const entry of entries) {
    const region = await sharp(atlasImagePath)
      .extract({
        left: entry.atlasX,
        top: entry.atlasY,
        width: entry.atlasW,
        height: entry.atlasH
      })
      .resize(entry.safeW, entry.safeH, { kernel: 'nearest' })
      .png()
      .toBuffer();
    composites.push({
      input: region,
      left: entry.safeX,
      top: entry.safeY
    });
  }

  const overlayParts = [];
  for (const entry of entries) {
    const label = `${entry.index}. ${entry.key}`;
    overlayParts.push(`
      <g>
        <rect x="${entry.cellX + 0.5}" y="${entry.cellY + 0.5}" width="${entry.cellW}" height="${entry.cellH}"
          fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1" />
        <rect x="${entry.safeX + 0.5}" y="${entry.safeY + 0.5}" width="${entry.safeW}" height="${entry.safeH}"
          fill="none" stroke="${entry.color}" stroke-width="2" />
        <text x="${entry.cellX + 4}" y="${entry.cellY + 13}" fill="#ffffff"
          font-family="monospace" font-size="11" font-weight="700">${escapeXml(label)}</text>
      </g>
    `);
  }
  const overlaySvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${sheetWidth}" height="${sheetHeight}" viewBox="0 0 ${sheetWidth} ${sheetHeight}">
      ${overlayParts.join('\n')}
    </svg>
  `);

  const atlasSlug = slugify(path.basename(manifestPath, path.extname(manifestPath)));
  const baseSheetPath = path.join(outDir, `${atlasSlug}-worksheet-base.png`);
  const overlayPath = path.join(outDir, `${atlasSlug}-worksheet-overlay.png`);
  const templatePath = path.join(outDir, `${atlasSlug}-worksheet-template.png`);
  const mapPath = path.join(outDir, `${atlasSlug}-worksheet-map.json`);

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
    .toFile(baseSheetPath);

  await sharp({
    create: {
      width: sheetWidth,
      height: sheetHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([{ input: overlaySvg, left: 0, top: 0 }])
    .png()
    .toFile(overlayPath);

  await sharp(baseSheetPath)
    .composite([{ input: overlaySvg, left: 0, top: 0 }])
    .png()
    .toFile(templatePath);

  const map = {
    version: 1,
    manifestPath,
    atlasImagePath,
    baseSheetPath,
    overlayPath,
    templatePath,
    sheet: {
      width: sheetWidth,
      height: sheetHeight,
      scale: args.scale,
      cellPad: args.cellPad,
      labelHeight: args.labelHeight,
      gap: args.gap
    },
    entries: entries.map((entry) => ({
      index: entry.index,
      key: entry.key,
      atlasRect: { x: entry.atlasX, y: entry.atlasY, w: entry.atlasW, h: entry.atlasH },
      safeRect: { x: entry.safeX, y: entry.safeY, w: entry.safeW, h: entry.safeH },
      cellRect: { x: entry.cellX, y: entry.cellY, w: entry.cellW, h: entry.cellH }
    }))
  };
  await fs.writeFile(mapPath, `${JSON.stringify(map, null, 2)}\n`);

  console.log(`Worksheet base written to ${baseSheetPath}`);
  console.log(`Worksheet overlay written to ${overlayPath}`);
  console.log(`Worksheet template written to ${templatePath}`);
  console.log(`Worksheet map written to ${mapPath}`);
  console.log(`Entries: ${entries.length}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
