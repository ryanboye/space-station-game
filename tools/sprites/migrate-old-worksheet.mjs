#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const OLD_REQUIRED_KEYS = [
  'tile.space',
  'tile.floor',
  'tile.wall',
  'tile.wall.solo',
  'tile.wall.end',
  'tile.wall.straight',
  'tile.wall.corner',
  'tile.wall.tee',
  'tile.wall.cross',
  'tile.dock',
  'tile.cafeteria',
  'tile.reactor',
  'tile.security',
  'tile.door',
  'tile.door.horizontal',
  'tile.door.vertical',
  'room.cafeteria',
  'room.kitchen',
  'room.workshop',
  'room.clinic',
  'room.brig',
  'room.rec_hall',
  'room.reactor',
  'room.security',
  'room.dorm',
  'room.hygiene',
  'room.hydroponics',
  'room.life_support',
  'room.lounge',
  'room.market',
  'room.logistics_stock',
  'room.storage',
  'module.none',
  'module.bed',
  'module.table',
  'module.serving_station',
  'module.stove',
  'module.workbench',
  'module.med_bed',
  'module.cell_console',
  'module.rec_unit',
  'module.grow_station',
  'module.terminal',
  'module.couch',
  'module.game_station',
  'module.shower',
  'module.sink',
  'module.market_stall',
  'module.intake_pallet',
  'module.storage_rack',
  'ship.tourist',
  'ship.trader',
  'ship.industrial',
  'ship.military',
  'ship.colonist',
  'overlay.dock.facade.north',
  'overlay.dock.facade.east',
  'overlay.dock.facade.south',
  'overlay.dock.facade.west',
  'overlay.floor.grime.1',
  'overlay.floor.grime.2',
  'overlay.floor.grime.3',
  'overlay.floor.grime.4',
  'overlay.floor.grime.5',
  'overlay.floor.grime.6',
  'overlay.floor.wear.1',
  'overlay.floor.wear.2',
  'overlay.floor.wear.3',
  'overlay.floor.wear.4',
  'overlay.wall.exterior.1',
  'overlay.wall.exterior.2',
  'overlay.wall.exterior.3',
  'overlay.wall.exterior.corner.1',
  'overlay.wall.exterior.end.1',
  'agent.visitor.1',
  'agent.visitor.2',
  'agent.visitor.3',
  'agent.visitor.4',
  'agent.visitor.5',
  'agent.visitor.6',
  'agent.resident.1',
  'agent.resident.2',
  'agent.resident.3',
  'agent.resident.4',
  'agent.resident.5',
  'agent.resident.6',
  'agent.crew.1',
  'agent.crew.2',
  'agent.crew.3',
  'agent.crew.4',
  'agent.crew.5',
  'agent.crew.6'
];

const OLD_TO_NEW_KEY_ALIASES = {
  'overlay.dock.facade.north': [
    'overlay.dock.facade.north.solo',
    'overlay.dock.facade.north.start',
    'overlay.dock.facade.north.middle',
    'overlay.dock.facade.north.end'
  ],
  'overlay.dock.facade.east': [
    'overlay.dock.facade.east.solo',
    'overlay.dock.facade.east.start',
    'overlay.dock.facade.east.middle',
    'overlay.dock.facade.east.end'
  ],
  'overlay.dock.facade.south': [
    'overlay.dock.facade.south.solo',
    'overlay.dock.facade.south.start',
    'overlay.dock.facade.south.middle',
    'overlay.dock.facade.south.end'
  ],
  'overlay.dock.facade.west': [
    'overlay.dock.facade.west.solo',
    'overlay.dock.facade.west.start',
    'overlay.dock.facade.west.middle',
    'overlay.dock.facade.west.end'
  ]
};

function parseArgs(argv) {
  const args = {
    oldSheet: '',
    oldTemplate: path.resolve('public/atlas-worksheet-ryan-template.png'),
    newMap: path.resolve('public/assets/sprites/worksheet/atlas-worksheet-map.json'),
    out: ''
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--old-sheet' && argv[i + 1]) {
      args.oldSheet = argv[i + 1];
      i += 1;
    } else if (arg === '--old-template' && argv[i + 1]) {
      args.oldTemplate = argv[i + 1];
      i += 1;
    } else if (arg === '--new-map' && argv[i + 1]) {
      args.newMap = argv[i + 1];
      i += 1;
    } else if (arg === '--out' && argv[i + 1]) {
      args.out = argv[i + 1];
      i += 1;
    }
  }
  if (!args.oldSheet) {
    throw new Error('Usage: node tools/sprites/migrate-old-worksheet.mjs --old-sheet /path/to/old-sheet.png [--old-template /path/to/old-template.png] [--new-map /path/to/new-map.json] [--out /path/to/out.png]');
  }
  return args;
}

function pixelActive(data, index) {
  const r = data[index];
  const g = data[index + 1];
  const b = data[index + 2];
  return r > 8 || g > 8 || b > 8;
}

const OLD_FRAME_OVERRIDES = {
  'tile.space': { w: 256, h: 256 },
  'module.bed': { w: 128, h: 64 },
  'module.table': { w: 128, h: 128 },
  'module.serving_station': { w: 128, h: 64 },
  'module.stove': { w: 128, h: 64 },
  'module.workbench': { w: 128, h: 64 },
  'module.med_bed': { w: 128, h: 64 },
  'module.rec_unit': { w: 128, h: 128 },
  'module.grow_station': { w: 128, h: 128 },
  'module.couch': { w: 128, h: 64 },
  'module.game_station': { w: 128, h: 128 },
  'module.market_stall': { w: 128, h: 64 },
  'module.intake_pallet': { w: 128, h: 128 },
  'module.storage_rack': { w: 128, h: 64 },
  'overlay.dock.facade.north': { w: 128, h: 128 },
  'overlay.dock.facade.east': { w: 128, h: 128 },
  'overlay.dock.facade.south': { w: 128, h: 128 },
  'overlay.dock.facade.west': { w: 128, h: 128 },
  'overlay.wall.exterior.1': { w: 128, h: 128 },
  'overlay.wall.exterior.2': { w: 128, h: 128 },
  'overlay.wall.exterior.3': { w: 128, h: 128 },
  'overlay.wall.exterior.corner.1': { w: 128, h: 128 },
  'overlay.wall.exterior.end.1': { w: 128, h: 128 }
};

function oldExpectedFrame(key) {
  return OLD_FRAME_OVERRIDES[key] ?? { w: 64, h: 64 };
}

function buildRunsFromCounts(counts, threshold, mergeGap) {
  const raw = [];
  let start = -1;
  for (let i = 0; i < counts.length; i += 1) {
    const active = counts[i] > threshold;
    if (active && start < 0) start = i;
    if ((!active || i === counts.length - 1) && start >= 0) {
      raw.push([start, active ? i : i - 1]);
      start = -1;
    }
  }
  const merged = [];
  for (const run of raw) {
    const last = merged[merged.length - 1];
    if (last && run[0] - last[1] - 1 <= mergeGap) {
      last[1] = run[1];
    } else {
      merged.push([...run]);
    }
  }
  return merged;
}

function detectTemplateRects(data, width, height, channels) {
  const visited = new Uint8Array(width * height);
  const rects = [];
  const at = (x, y) => y * width + x;
  const isColor = (x, y) => {
    const i = (y * width + x) * channels;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a === 0) return false;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sum = r + g + b;
    return max - min > 40 && sum > 120 && !(r > 220 && g > 220 && b > 220);
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const id = at(x, y);
      if (visited[id] || !isColor(x, y)) continue;
      const queue = [[x, y]];
      visited[id] = 1;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      while (queue.length > 0) {
        const [cx, cy] = queue.pop();
        minX = Math.min(minX, cx);
        maxX = Math.max(maxX, cx);
        minY = Math.min(minY, cy);
        maxY = Math.max(maxY, cy);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const nid = at(nx, ny);
          if (visited[nid] || !isColor(nx, ny)) continue;
          visited[nid] = 1;
          queue.push([nx, ny]);
        }
      }
      const rectW = maxX - minX + 1;
      const rectH = maxY - minY + 1;
      if (rectW >= 30 && rectH >= 30 && rectW <= 260 && rectH <= 260) {
        rects.push({ x: minX, y: minY, w: rectW, h: rectH });
      }
    }
  }
  rects.sort((a, b) => a.y - b.y || a.x - b.x);
  return rects;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const oldSheetPath = path.resolve(args.oldSheet);
  const oldTemplatePath = path.resolve(args.oldTemplate);
  const newMapPath = path.resolve(args.newMap);
  const outPath = path.resolve(args.out || path.join(path.dirname(newMapPath), 'atlas-worksheet-base.migrated.png'));

  const newMap = JSON.parse(await fs.readFile(newMapPath, 'utf8'));
  if (!Array.isArray(newMap?.entries)) {
    throw new Error(`Invalid worksheet map: ${newMapPath}`);
  }
  const newByKey = new Map(newMap.entries.map((entry) => [entry.key, entry]));

  const oldImage = sharp(oldSheetPath).ensureAlpha();
  const { data, info } = await sharp(oldTemplatePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const templateRects = detectTemplateRects(data, info.width, info.height, info.channels);
  if (templateRects.length !== OLD_REQUIRED_KEYS.length) {
    throw new Error(`Expected ${OLD_REQUIRED_KEYS.length} safe rectangles in old template, detected ${templateRects.length}`);
  }

  const sourceRects = new Map();
  for (let i = 0; i < OLD_REQUIRED_KEYS.length; i += 1) {
    const key = OLD_REQUIRED_KEYS[i];
    const templateRect = templateRects[i];
    const expected = oldExpectedFrame(key);
    const cropX = templateRect.x + Math.max(0, Math.round((templateRect.w - expected.w) * 0.5));
    const cropY = templateRect.y + Math.max(0, Math.round((templateRect.h - expected.h) * 0.5));
    sourceRects.set(key, { x: cropX, y: cropY, w: expected.w, h: expected.h });
  }

  const composites = [];
  let migrated = 0;
  let expanded = 0;
  for (const key of OLD_REQUIRED_KEYS) {
    const source = sourceRects.get(key);
    if (!source) continue;
    const crop = await oldImage
      .clone()
      .extract({
        left: source.x,
        top: source.y,
        width: source.w,
        height: source.h
      })
      .png()
      .toBuffer();
    const targets = OLD_TO_NEW_KEY_ALIASES[key] ?? [key];
    for (const targetKey of targets) {
      const target = newByKey.get(targetKey);
      if (!target) continue;
      const safe = target.safeRect;
      const fitted = await sharp(crop)
        .resize(Math.round(safe.w), Math.round(safe.h), { fit: 'fill', kernel: 'nearest' })
        .png()
        .toBuffer();
      composites.push({
        input: fitted,
        left: Math.round(safe.x),
        top: Math.round(safe.y)
      });
      if (targets.length > 1) expanded += 1;
      else migrated += 1;
    }
  }

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await sharp({
    create: {
      width: Math.round(newMap.sheet.width),
      height: Math.round(newMap.sheet.height),
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite(composites)
    .png()
    .toFile(outPath);

  console.log(`Migrated worksheet written to ${outPath}`);
  console.log(`Detected old template safe rectangles: ${templateRects.length}`);
  console.log(`Direct key migrations: ${migrated}`);
  console.log(`Expanded dock segment copies: ${expanded}`);
  console.log(`Total composites: ${composites.length}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
