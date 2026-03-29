import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const DEFAULT_TILE_SIZE = 48;
const DEFAULT_MARGIN_TILES = 3;
const OUTPUT_ROOT = path.resolve('tools/sprites/save-scenes');

const TILE_TYPE_TO_KEY = {
  space: 'tile.space',
  floor: 'tile.floor',
  wall: 'tile.wall',
  dock: 'tile.dock',
  cafeteria: 'tile.cafeteria',
  reactor: 'tile.reactor',
  security: 'tile.security',
  door: 'tile.door'
};

const TILE_COLORS = {
  space: '#071019',
  floor: '#273240',
  wall: '#465569',
  dock: '#3e8ec9',
  cafeteria: '#4ea66e',
  reactor: '#b97d39',
  security: '#bd4f4f',
  door: '#7d8faa'
};

const ROOM_COLORS = {
  none: null,
  cafeteria: '#b78a57',
  kitchen: '#6fa6c9',
  workshop: '#887566',
  clinic: '#89bdb6',
  brig: '#785963',
  'rec-hall': '#7a7fbd',
  reactor: '#b88958',
  security: '#598c9b',
  dorm: '#a28c8f',
  hygiene: '#6e9eb4',
  hydroponics: '#5c8e65',
  'life-support': '#6b9ca8',
  lounge: '#7d6d99',
  market: '#9f8861',
  'logistics-stock': '#8b7a58',
  storage: '#776a5b'
};

const ROOM_OVERLAY = {
  none: 'transparent',
  cafeteria: 'rgba(78, 166, 110, 0.28)',
  kitchen: 'rgba(245, 164, 92, 0.28)',
  workshop: 'rgba(203, 157, 108, 0.28)',
  clinic: 'rgba(106, 209, 224, 0.26)',
  brig: 'rgba(191, 94, 94, 0.26)',
  'rec-hall': 'rgba(209, 166, 98, 0.24)',
  reactor: 'rgba(185, 125, 57, 0.28)',
  security: 'rgba(189, 79, 79, 0.28)',
  dorm: 'rgba(126, 200, 255, 0.22)',
  hygiene: 'rgba(96, 228, 225, 0.24)',
  hydroponics: 'rgba(98, 205, 120, 0.2)',
  'life-support': 'rgba(245, 245, 170, 0.2)',
  lounge: 'rgba(196, 140, 255, 0.2)',
  market: 'rgba(255, 188, 120, 0.2)',
  'logistics-stock': 'rgba(150, 200, 255, 0.2)',
  storage: 'rgba(255, 220, 155, 0.22)'
};

const ROOM_LETTER = {
  none: '',
  cafeteria: 'C',
  kitchen: 'I',
  workshop: 'W',
  clinic: '+',
  brig: 'G',
  'rec-hall': 'A',
  reactor: 'R',
  security: 'S',
  dorm: 'D',
  hygiene: 'H',
  hydroponics: 'F',
  'life-support': 'L',
  lounge: 'U',
  market: 'K',
  'logistics-stock': 'N',
  storage: 'B'
};

const MODULE_COLORS = {
  bed: '#8d7465',
  table: '#7a736c',
  'serving-station': '#4a8cb1',
  stove: '#746b63',
  workbench: '#6b5d4d',
  'med-bed': '#7aa3b0',
  'cell-console': '#55616d',
  'rec-unit': '#6c73b6',
  'grow-station': '#5f925f',
  terminal: '#5e8cb3',
  couch: '#7b6e5a',
  'game-station': '#5c6bb7',
  shower: '#7ca8bb',
  sink: '#97b8ca',
  'market-stall': '#b18454',
  'intake-pallet': '#7e6b53',
  'storage-rack': '#776757'
};

const MODULE_TO_KEY = {
  bed: 'module.bed',
  table: 'module.table',
  'serving-station': 'module.serving_station',
  stove: 'module.stove',
  workbench: 'module.workbench',
  'med-bed': 'module.med_bed',
  'cell-console': 'module.cell_console',
  'rec-unit': 'module.rec_unit',
  'grow-station': 'module.grow_station',
  terminal: 'module.terminal',
  couch: 'module.couch',
  'game-station': 'module.game_station',
  shower: 'module.shower',
  sink: 'module.sink',
  'market-stall': 'module.market_stall',
  'intake-pallet': 'module.intake_pallet',
  'storage-rack': 'module.storage_rack'
};

const MODULE_LETTER = {
  none: '',
  bed: 'B',
  table: 'T',
  'serving-station': 'S',
  stove: 'V',
  workbench: 'W',
  'med-bed': '+',
  'cell-console': 'G',
  'rec-unit': 'A',
  'grow-station': 'G',
  terminal: 'M',
  couch: 'C',
  'game-station': 'J',
  shower: 'H',
  sink: 'I',
  'market-stall': '$',
  'intake-pallet': 'P',
  'storage-rack': 'R'
};

const MODULE_DEFS = {
  bed: { width: 2, height: 1, rotatable: true },
  table: { width: 2, height: 2, rotatable: false },
  'serving-station': { width: 2, height: 1, rotatable: true },
  stove: { width: 2, height: 1, rotatable: true },
  workbench: { width: 2, height: 1, rotatable: true },
  'med-bed': { width: 2, height: 1, rotatable: true },
  'cell-console': { width: 1, height: 1, rotatable: false },
  'rec-unit': { width: 2, height: 2, rotatable: false },
  'grow-station': { width: 2, height: 2, rotatable: false },
  terminal: { width: 1, height: 1, rotatable: false },
  couch: { width: 2, height: 1, rotatable: true },
  'game-station': { width: 2, height: 2, rotatable: false },
  shower: { width: 1, height: 1, rotatable: false },
  sink: { width: 1, height: 1, rotatable: false },
  'market-stall': { width: 2, height: 1, rotatable: true },
  'intake-pallet': { width: 2, height: 2, rotatable: false },
  'storage-rack': { width: 2, height: 1, rotatable: true }
};

function parseArgs(argv) {
  const args = {
    savePath: '',
    outDir: '',
    tileSize: DEFAULT_TILE_SIZE,
    marginTiles: DEFAULT_MARGIN_TILES
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--save') {
      args.savePath = argv[i + 1] ?? '';
      i += 1;
    } else if (arg === '--outdir') {
      args.outDir = argv[i + 1] ?? '';
      i += 1;
    } else if (arg === '--tile-size') {
      args.tileSize = Number(argv[i + 1] ?? DEFAULT_TILE_SIZE);
      i += 1;
    } else if (arg === '--margin') {
      args.marginTiles = Number(argv[i + 1] ?? DEFAULT_MARGIN_TILES);
      i += 1;
    }
  }
  if (!args.savePath) {
    throw new Error('Usage: node tools/sprites/export-save-scene.mjs --save /path/to/save.json [--outdir dir] [--tile-size 48]');
  }
  if (!Number.isFinite(args.tileSize) || args.tileSize <= 0) {
    throw new Error(`Invalid --tile-size: ${args.tileSize}`);
  }
  if (!Number.isFinite(args.marginTiles) || args.marginTiles < 0) {
    throw new Error(`Invalid --margin: ${args.marginTiles}`);
  }
  return args;
}

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'save-scene';
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function indexToXY(index, width) {
  return { x: index % width, y: Math.floor(index / width) };
}

function tileRect(x, y, bounds, tileSize) {
  return {
    x: (x - bounds.minX) * tileSize,
    y: (y - bounds.minY) * tileSize,
    w: tileSize,
    h: tileSize
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function connectedWallLike(tile) {
  return tile === 'wall' || tile === 'door';
}

function wallNeighborMask(snapshot, x, y) {
  const { width, height, tiles } = snapshot;
  const at = (tx, ty) => {
    if (tx < 0 || ty < 0 || tx >= width || ty >= height) return false;
    return connectedWallLike(tiles[ty * width + tx]);
  };
  let mask = 0;
  if (at(x, y - 1)) mask |= 1;
  if (at(x + 1, y)) mask |= 2;
  if (at(x, y + 1)) mask |= 4;
  if (at(x - 1, y)) mask |= 8;
  return mask;
}

function resolveWallVariant(mask) {
  switch (mask & 15) {
    case 0:
      return { shape: 'solo', rotation: 0 };
    case 1:
      return { shape: 'end', rotation: 0 };
    case 2:
      return { shape: 'end', rotation: 90 };
    case 4:
      return { shape: 'end', rotation: 180 };
    case 8:
      return { shape: 'end', rotation: 270 };
    case 3:
      return { shape: 'corner', rotation: 0 };
    case 6:
      return { shape: 'corner', rotation: 90 };
    case 12:
      return { shape: 'corner', rotation: 180 };
    case 9:
      return { shape: 'corner', rotation: 270 };
    case 5:
      return { shape: 'straight', rotation: 0 };
    case 10:
      return { shape: 'straight', rotation: 90 };
    case 7:
      return { shape: 'tee', rotation: 0 };
    case 14:
      return { shape: 'tee', rotation: 90 };
    case 13:
      return { shape: 'tee', rotation: 180 };
    case 11:
      return { shape: 'tee', rotation: 270 };
    case 15:
    default:
      return { shape: 'cross', rotation: 0 };
  }
}

function resolveDoorVariant(mask) {
  const ewConnections = (mask & 2 ? 1 : 0) + (mask & 8 ? 1 : 0);
  const nsConnections = (mask & 1 ? 1 : 0) + (mask & 4 ? 1 : 0);
  return ewConnections >= nsConnections ? 'horizontal' : 'vertical';
}

function occupiedBounds(snapshot, marginTiles) {
  let minX = snapshot.width;
  let minY = snapshot.height;
  let maxX = -1;
  let maxY = -1;
  for (let index = 0; index < snapshot.tiles.length; index += 1) {
    const tile = snapshot.tiles[index];
    if (tile === 'space') continue;
    const { x, y } = indexToXY(index, snapshot.width);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (maxX < 0 || maxY < 0) {
    return { minX: 0, minY: 0, maxX: snapshot.width - 1, maxY: snapshot.height - 1 };
  }
  return {
    minX: clamp(minX - marginTiles, 0, snapshot.width - 1),
    minY: clamp(minY - marginTiles, 0, snapshot.height - 1),
    maxX: clamp(maxX + marginTiles, 0, snapshot.width - 1),
    maxY: clamp(maxY + marginTiles, 0, snapshot.height - 1)
  };
}

function moduleDimensions(module) {
  const def = MODULE_DEFS[module.type];
  if (!def) throw new Error(`Unknown module type in save: ${module.type}`);
  const rotated = def.rotatable && module.rotation === 90;
  return {
    width: rotated ? def.height : def.width,
    height: rotated ? def.width : def.height
  };
}

function buildTileSvg(snapshot, bounds, tileSize) {
  const parts = [];
  const imageWidth = (bounds.maxX - bounds.minX + 1) * tileSize;
  const imageHeight = (bounds.maxY - bounds.minY + 1) * tileSize;
  parts.push(`<rect width="${imageWidth}" height="${imageHeight}" fill="#08111d"/>`);

  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      const index = y * snapshot.width + x;
      const tile = snapshot.tiles[index];
      const room = snapshot.rooms[index] ?? 'none';
      const rect = tileRect(x, y, bounds, tileSize);

      if (tile === 'space') {
        parts.push(`<rect x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" fill="#09131f"/>`);
        continue;
      }

      if (tile === 'floor') {
        parts.push(`<rect x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" fill="#2a333e"/>`);
        parts.push(`<rect x="${rect.x + 4}" y="${rect.y + 4}" width="${rect.w - 8}" height="${rect.h - 8}" fill="#313c49"/>`);
        parts.push(`<line x1="${rect.x}" y1="${rect.y + rect.h}" x2="${rect.x + rect.w}" y2="${rect.y + rect.h}" stroke="#435264" stroke-width="1"/>`);
        parts.push(`<line x1="${rect.x + rect.w}" y1="${rect.y}" x2="${rect.x + rect.w}" y2="${rect.y + rect.h}" stroke="#435264" stroke-width="1"/>`);
      } else if (tile === 'dock') {
        parts.push(`<rect x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" fill="#6da4e2"/>`);
        parts.push(`<rect x="${rect.x + 4}" y="${rect.y + 4}" width="${rect.w - 8}" height="${rect.h - 8}" fill="#7bb6f6"/>`);
      } else if (tile === 'door') {
        const mask = wallNeighborMask(snapshot, x, y);
        const doorShape = resolveDoorVariant(mask);
        parts.push(`<rect x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" fill="#506071"/>`);
        if (doorShape === 'horizontal') {
          parts.push(`<rect x="${rect.x + 2}" y="${rect.y + rect.h * 0.28}" width="${rect.w - 4}" height="${rect.h * 0.44}" rx="4" fill="#9eb5d5"/>`);
        } else {
          parts.push(`<rect x="${rect.x + rect.w * 0.28}" y="${rect.y + 2}" width="${rect.w * 0.44}" height="${rect.h - 4}" rx="4" fill="#9eb5d5"/>`);
        }
      } else if (tile === 'wall') {
        parts.push(`<rect x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" fill="#5b6777"/>`);
        parts.push(`<rect x="${rect.x + 2}" y="${rect.y + 2}" width="${rect.w - 4}" height="${rect.h - 4}" fill="#6c7a8e"/>`);
        const mask = wallNeighborMask(snapshot, x, y);
        const cx = rect.x + rect.w / 2;
        const cy = rect.y + rect.h / 2;
        const thickness = Math.max(8, Math.round(tileSize * 0.22));
        const armColor = '#434d5d';
        parts.push(`<rect x="${cx - thickness / 2}" y="${cy - thickness / 2}" width="${thickness}" height="${thickness}" fill="${armColor}"/>`);
        if (mask & 1) parts.push(`<rect x="${cx - thickness / 2}" y="${rect.y}" width="${thickness}" height="${cy - rect.y}" fill="${armColor}"/>`);
        if (mask & 2) parts.push(`<rect x="${cx}" y="${cy - thickness / 2}" width="${rect.x + rect.w - cx}" height="${thickness}" fill="${armColor}"/>`);
        if (mask & 4) parts.push(`<rect x="${cx - thickness / 2}" y="${cy}" width="${thickness}" height="${rect.y + rect.h - cy}" fill="${armColor}"/>`);
        if (mask & 8) parts.push(`<rect x="${rect.x}" y="${cy - thickness / 2}" width="${cx - rect.x}" height="${thickness}" fill="${armColor}"/>`);
      } else {
        parts.push(`<rect x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" fill="#2a333e"/>`);
      }

      const roomColor = ROOM_COLORS[room] ?? null;
      if (roomColor && tile !== 'wall' && tile !== 'door' && tile !== 'dock') {
        parts.push(`<rect x="${rect.x + 4}" y="${rect.y + 4}" width="${rect.w - 8}" height="${rect.h - 8}" fill="${roomColor}" opacity="0.30"/>`);
      }
    }
  }

  for (let x = 0; x <= imageWidth; x += tileSize) {
    parts.push(`<line x1="${x}" y1="0" x2="${x}" y2="${imageHeight}" stroke="#132334" stroke-width="1"/>`);
  }
  for (let y = 0; y <= imageHeight; y += tileSize) {
    parts.push(`<line x1="0" y1="${y}" x2="${imageWidth}" y2="${y}" stroke="#132334" stroke-width="1"/>`);
  }

  return parts;
}

function buildBrowserLikeSvg(snapshot, bounds, tileSize) {
  const parts = [];
  const imageWidth = (bounds.maxX - bounds.minX + 1) * tileSize;
  const imageHeight = (bounds.maxY - bounds.minY + 1) * tileSize;
  const px = tileSize / 18;
  parts.push(`<rect width="${imageWidth}" height="${imageHeight}" fill="#071019"/>`);

  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      const index = y * snapshot.width + x;
      const tile = snapshot.tiles[index];
      const room = snapshot.rooms[index] ?? 'none';
      const rect = tileRect(x, y, bounds, tileSize);

      parts.push(`<rect x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" fill="${TILE_COLORS[tile] ?? '#273240'}"/>`);

      if (room !== 'none') {
        const overlay = ROOM_OVERLAY[room] ?? 'transparent';
        parts.push(`<rect x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" fill="${overlay}"/>`);
        const letter = ROOM_LETTER[room] ?? '';
        if (letter) {
          parts.push(
            `<text x="${rect.x + rect.w * 0.16}" y="${rect.y + rect.h * 0.28}" fill="rgba(255,255,255,0.20)" font-family="monospace" font-size="${Math.round(10 * px)}" font-weight="700">${escapeXml(letter)}</text>`
          );
        }
      }

      parts.push(
        `<rect x="${rect.x + 0.5}" y="${rect.y + 0.5}" width="${rect.w}" height="${rect.h}" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>`
      );
    }
  }

  for (let i = 0; i < snapshot.modules.length; i += 1) {
    const module = snapshot.modules[i];
    const { x, y } = indexToXY(module.originTile, snapshot.width);
    const dims = moduleDimensions(module);
    const pxX = (x - bounds.minX) * tileSize;
    const pxY = (y - bounds.minY) * tileSize;
    const widthPx = dims.width * tileSize;
    const heightPx = dims.height * tileSize;
    const inset = Math.round(3.5 * px);
    const border = Math.max(1, Math.round(2 * px));
    const fill = 'rgba(8, 15, 23, 0.86)';
    const stroke = MODULE_COLORS[module.type] ?? '#8f98a6';
    parts.push(
      `<rect x="${pxX + inset}" y="${pxY + inset}" width="${Math.max(1, widthPx - inset * 2)}" height="${Math.max(1, heightPx - inset * 2)}" fill="${fill}" stroke="${stroke}" stroke-width="${border}"/>`
    );
    const letter = MODULE_LETTER[module.type] ?? '?';
    parts.push(
      `<text x="${pxX + widthPx * 0.5}" y="${pxY + heightPx * 0.56}" text-anchor="middle" fill="#f4f7fb" stroke="rgba(0,0,0,0.45)" stroke-width="${Math.max(
        0.8,
        0.9 * px
      )}" paint-order="stroke fill" font-family="monospace" font-size="${Math.round(10 * px)}" font-weight="700">${escapeXml(letter)}</text>`
    );
  }

  return parts;
}

function drawModuleGlyph(module, px, py, widthPx, heightPx, fill) {
  const inset = 6;
  const left = px + inset;
  const top = py + inset;
  const right = px + widthPx - inset;
  const bottom = py + heightPx - inset;
  const midX = (left + right) / 2;
  const midY = (top + bottom) / 2;
  const accent = 'rgba(255,255,255,0.22)';
  const dark = 'rgba(0,0,0,0.28)';
  const parts = [
    `<rect x="${left}" y="${top}" width="${Math.max(1, right - left)}" height="${Math.max(1, bottom - top)}" rx="6" fill="${fill}" stroke="${accent}" stroke-width="2"/>`
  ];

  switch (module.type) {
    case 'bed':
      parts.push(`<rect x="${left + 4}" y="${top + 6}" width="${(right - left) / 2 - 6}" height="${bottom - top - 12}" rx="4" fill="${accent}"/>`);
      parts.push(`<rect x="${midX + 2}" y="${top + 6}" width="${(right - left) / 2 - 6}" height="${bottom - top - 12}" rx="4" fill="${accent}"/>`);
      break;
    case 'table':
      parts.push(`<rect x="${left + 10}" y="${top + 10}" width="${right - left - 20}" height="${bottom - top - 20}" rx="4" fill="${dark}"/>`);
      break;
    case 'serving-station':
    case 'stove':
    case 'workbench':
    case 'storage-rack':
      parts.push(`<rect x="${left + 6}" y="${midY - 6}" width="${right - left - 12}" height="12" rx="4" fill="${dark}"/>`);
      parts.push(`<line x1="${left + 10}" y1="${top + 8}" x2="${right - 10}" y2="${top + 8}" stroke="${accent}" stroke-width="2"/>`);
      break;
    case 'grow-station':
    case 'game-station':
    case 'rec-unit':
    case 'intake-pallet':
      parts.push(`<rect x="${left + 8}" y="${top + 8}" width="${midX - left - 10}" height="${midY - top - 10}" fill="${dark}" rx="4"/>`);
      parts.push(`<rect x="${midX + 2}" y="${top + 8}" width="${right - midX - 10}" height="${midY - top - 10}" fill="${accent}" rx="4"/>`);
      parts.push(`<rect x="${left + 8}" y="${midY + 2}" width="${midX - left - 10}" height="${bottom - midY - 10}" fill="${accent}" rx="4"/>`);
      parts.push(`<rect x="${midX + 2}" y="${midY + 2}" width="${right - midX - 10}" height="${bottom - midY - 10}" fill="${dark}" rx="4"/>`);
      break;
    case 'terminal':
    case 'cell-console':
      parts.push(`<rect x="${left + 8}" y="${top + 8}" width="${right - left - 16}" height="${bottom - top - 16}" rx="4" fill="${dark}"/>`);
      parts.push(`<rect x="${left + 12}" y="${top + 12}" width="${right - left - 24}" height="${bottom - top - 24}" rx="3" fill="${accent}"/>`);
      break;
    case 'couch':
      parts.push(`<rect x="${left + 6}" y="${midY - 6}" width="${right - left - 12}" height="16" rx="6" fill="${dark}"/>`);
      parts.push(`<rect x="${left + 6}" y="${top + 8}" width="${right - left - 12}" height="12" rx="5" fill="${accent}"/>`);
      break;
    case 'market-stall':
      parts.push(`<rect x="${left + 6}" y="${midY}" width="${right - left - 12}" height="${bottom - midY - 6}" rx="4" fill="${dark}"/>`);
      parts.push(`<path d="M ${left + 4} ${top + 16} L ${right - 4} ${top + 16} L ${right - 12} ${midY - 2} L ${left + 12} ${midY - 2} Z" fill="${accent}"/>`);
      break;
    case 'shower':
    case 'sink':
      parts.push(`<circle cx="${midX}" cy="${midY}" r="${Math.max(6, Math.min(widthPx, heightPx) * 0.18)}" fill="${dark}"/>`);
      break;
    default:
      parts.push(`<rect x="${left + 10}" y="${top + 10}" width="${right - left - 20}" height="${bottom - top - 20}" rx="4" fill="${dark}"/>`);
      break;
  }
  return parts;
}

function buildModuleSvg(snapshot, bounds, tileSize) {
  const parts = [];
  for (let i = 0; i < snapshot.modules.length; i += 1) {
    const module = snapshot.modules[i];
    const { x, y } = indexToXY(module.originTile, snapshot.width);
    const dims = moduleDimensions(module);
    const px = (x - bounds.minX) * tileSize;
    const py = (y - bounds.minY) * tileSize;
    const widthPx = dims.width * tileSize;
    const heightPx = dims.height * tileSize;
    const fill = MODULE_COLORS[module.type] ?? '#7a7a7a';
    parts.push(...drawModuleGlyph(module, px, py, widthPx, heightPx, fill));
  }
  return parts;
}

function buildCropEntries(snapshot, bounds, tileSize) {
  const entries = [];
  for (let index = 0; index < snapshot.tiles.length; index += 1) {
    const tile = snapshot.tiles[index];
    const { x, y } = indexToXY(index, snapshot.width);
    if (x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY) continue;
    const rect = tileRect(x, y, bounds, tileSize);
    const room = snapshot.rooms[index] ?? 'none';
    const zone = snapshot.zones[index] ?? 'public';
    const entry = {
      kind: 'tile',
      id: `tile-${index}`,
      key: TILE_TYPE_TO_KEY[tile] ?? `tile.${tile}`,
      tileType: tile,
      tileIndex: index,
      tileX: x,
      tileY: y,
      roomType: room,
      zoneType: zone,
      x: rect.x,
      y: rect.y,
      w: rect.w,
      h: rect.h
    };
    if (tile === 'wall' || tile === 'door') {
      const mask = wallNeighborMask(snapshot, x, y);
      entry.neighborMask = mask;
      if (tile === 'wall') {
        const variant = resolveWallVariant(mask);
        entry.variantShape = variant.shape;
        entry.variantRotation = variant.rotation;
        entry.variantKey = `tile.wall.${variant.shape}`;
      } else {
        const shape = resolveDoorVariant(mask);
        entry.variantShape = shape;
        entry.variantRotation = 0;
        entry.variantKey = `tile.door.${shape}`;
      }
    }
    entries.push(entry);
  }

  for (let i = 0; i < snapshot.modules.length; i += 1) {
    const module = snapshot.modules[i];
    const { x, y } = indexToXY(module.originTile, snapshot.width);
    const dims = moduleDimensions(module);
    const px = (x - bounds.minX) * tileSize;
    const py = (y - bounds.minY) * tileSize;
    const tileIndices = [];
    for (let dy = 0; dy < dims.height; dy += 1) {
      for (let dx = 0; dx < dims.width; dx += 1) {
        tileIndices.push((y + dy) * snapshot.width + (x + dx));
      }
    }
    entries.push({
      kind: 'module',
      id: `module-${i}`,
      key: MODULE_TO_KEY[module.type] ?? `module.${module.type}`,
      moduleType: module.type,
      moduleIndex: i,
      originTile: module.originTile,
      originX: x,
      originY: y,
      rotation: module.rotation,
      footprintTilesWide: dims.width,
      footprintTilesHigh: dims.height,
      tileIndices,
      x: px,
      y: py,
      w: dims.width * tileSize,
      h: dims.height * tileSize
    });
  }

  return entries;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const savePath = path.resolve(args.savePath);
  const raw = await fs.readFile(savePath, 'utf8');
  const save = JSON.parse(raw);
  if (!save || typeof save !== 'object' || !save.snapshot) {
    throw new Error(`Invalid save file: ${savePath}`);
  }
  const snapshot = save.snapshot;
  if (!Array.isArray(snapshot.tiles) || !Array.isArray(snapshot.rooms) || !Array.isArray(snapshot.modules)) {
    throw new Error(`Save snapshot is missing required grid arrays: ${savePath}`);
  }

  const sceneSlug = slugify(save.name ?? path.basename(savePath, path.extname(savePath)));
  const outDir = path.resolve(args.outDir || path.join(OUTPUT_ROOT, sceneSlug));
  await fs.mkdir(outDir, { recursive: true });

  const bounds = occupiedBounds(snapshot, args.marginTiles);
  const imageWidth = (bounds.maxX - bounds.minX + 1) * args.tileSize;
  const imageHeight = (bounds.maxY - bounds.minY + 1) * args.tileSize;
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${imageWidth}" height="${imageHeight}" viewBox="0 0 ${imageWidth} ${imageHeight}">`,
    ...buildTileSvg(snapshot, bounds, args.tileSize),
    ...buildModuleSvg(snapshot, bounds, args.tileSize),
    '</svg>'
  ].join('');
  const browserLikeSvg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${imageWidth}" height="${imageHeight}" viewBox="0 0 ${imageWidth} ${imageHeight}">`,
    ...buildBrowserLikeSvg(snapshot, bounds, args.tileSize),
    '</svg>'
  ].join('');

  const referencePath = path.join(outDir, 'reference-clean.png');
  const browserLikePath = path.join(outDir, 'reference-browser-like.png');
  const mapPath = path.join(outDir, 'crop-map.json');
  const summaryPath = path.join(outDir, 'summary.json');

  await sharp(Buffer.from(svg)).png().toFile(referencePath);
  await sharp(Buffer.from(browserLikeSvg)).png().toFile(browserLikePath);

  const entries = buildCropEntries(snapshot, bounds, args.tileSize);
  const map = {
    version: 1,
    sourceSavePath: savePath,
    saveName: save.name ?? sceneSlug,
    imagePath: referencePath,
    tileSize: args.tileSize,
    fullMapSize: {
      widthTiles: snapshot.width,
      heightTiles: snapshot.height
    },
    bounds: {
      ...bounds,
      widthTiles: bounds.maxX - bounds.minX + 1,
      heightTiles: bounds.maxY - bounds.minY + 1,
      widthPx: imageWidth,
      heightPx: imageHeight
    },
    entries
  };
  await fs.writeFile(mapPath, `${JSON.stringify(map, null, 2)}\n`);

  const tileSummary = {};
  for (const tile of snapshot.tiles) {
    tileSummary[tile] = (tileSummary[tile] ?? 0) + 1;
  }
  const moduleSummary = {};
  for (const module of snapshot.modules) {
    moduleSummary[module.type] = (moduleSummary[module.type] ?? 0) + 1;
  }
  const summary = {
    saveName: save.name ?? sceneSlug,
    sourceSavePath: savePath,
    outputDir: outDir,
    referencePath,
    browserLikePath,
    mapPath,
    tileCounts: tileSummary,
    moduleCounts: moduleSummary,
    visibleEntryCount: entries.length
  };
  await fs.writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);

  console.log(`Reference scene written to ${referencePath}`);
  console.log(`Browser-like scene written to ${browserLikePath}`);
  console.log(`Crop map written to ${mapPath}`);
  console.log(`Summary written to ${summaryPath}`);
  console.log(`Entries: ${entries.length}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
