import {
  ModuleType,
  RoomType,
  TILE_SIZE,
  TileType,
  VisitorState,
  ZoneType,
  inBounds,
  fromIndex,
  isWalkable,
  type ItemType,
  type BuildTool,
  type StationState
} from '../sim/types';
import { MODULE_DEFINITIONS, normalizeModuleType } from '../sim/balance';
import { collectQueueTargets, collectServiceTargets, getRoomDiagnosticAt, validateDockPlacement } from '../sim/sim';

const tileColor: Record<TileType, string> = {
  [TileType.Space]: '#071019',
  [TileType.Floor]: '#273240',
  [TileType.Wall]: '#465569',
  [TileType.Dock]: '#3e8ec9',
  [TileType.Cafeteria]: '#4ea66e',
  [TileType.Reactor]: '#b97d39',
  [TileType.Security]: '#bd4f4f',
  [TileType.Door]: '#7d8faa'
};

const roomOverlay: Record<RoomType, string> = {
  [RoomType.None]: 'transparent',
  [RoomType.Cafeteria]: 'rgba(78, 166, 110, 0.28)',
  [RoomType.Kitchen]: 'rgba(245, 164, 92, 0.28)',
  [RoomType.Workshop]: 'rgba(203, 157, 108, 0.28)',
  [RoomType.Reactor]: 'rgba(185, 125, 57, 0.28)',
  [RoomType.Security]: 'rgba(189, 79, 79, 0.28)',
  [RoomType.Dorm]: 'rgba(126, 200, 255, 0.22)',
  [RoomType.Hygiene]: 'rgba(96, 228, 225, 0.24)',
  [RoomType.Hydroponics]: 'rgba(98, 205, 120, 0.2)',
  [RoomType.LifeSupport]: 'rgba(245, 245, 170, 0.2)',
  [RoomType.Lounge]: 'rgba(196, 140, 255, 0.2)',
  [RoomType.Market]: 'rgba(255, 188, 120, 0.2)',
  [RoomType.LogisticsStock]: 'rgba(150, 200, 255, 0.2)',
  [RoomType.Storage]: 'rgba(255, 220, 155, 0.22)'
};

const roomLetter: Record<RoomType, string> = {
  [RoomType.None]: '',
  [RoomType.Cafeteria]: 'C',
  [RoomType.Kitchen]: 'I',
  [RoomType.Workshop]: 'W',
  [RoomType.Reactor]: 'R',
  [RoomType.Security]: 'S',
  [RoomType.Dorm]: 'D',
  [RoomType.Hygiene]: 'H',
  [RoomType.Hydroponics]: 'F',
  [RoomType.LifeSupport]: 'L',
  [RoomType.Lounge]: 'U',
  [RoomType.Market]: 'K',
  [RoomType.LogisticsStock]: 'N',
  [RoomType.Storage]: 'B'
};

const moduleLetter: Record<ModuleType, string> = {
  [ModuleType.None]: '',
  [ModuleType.Bed]: 'B',
  [ModuleType.Table]: 'T',
  [ModuleType.ServingStation]: 'S',
  [ModuleType.Stove]: 'V',
  [ModuleType.Workbench]: 'W',
  [ModuleType.GrowStation]: 'G',
  [ModuleType.Terminal]: 'M',
  [ModuleType.Couch]: 'C',
  [ModuleType.GameStation]: 'J',
  [ModuleType.Shower]: 'H',
  [ModuleType.Sink]: 'I',
  [ModuleType.MarketStall]: '$',
  [ModuleType.IntakePallet]: 'P',
  [ModuleType.StorageRack]: 'R'
};

const ITEM_TYPES: ItemType[] = ['rawMeal', 'meal', 'rawMaterial', 'tradeGood', 'body'];
const itemFillColor: Record<ItemType | 'none', string> = {
  rawMeal: 'rgba(118, 218, 132, 0.55)',
  meal: 'rgba(255, 216, 120, 0.58)',
  rawMaterial: 'rgba(214, 183, 132, 0.55)',
  tradeGood: 'rgba(128, 188, 255, 0.58)',
  body: 'rgba(227, 110, 110, 0.6)',
  none: 'rgba(151, 170, 192, 0.42)'
};
const itemShortCode: Record<ItemType, string> = {
  rawMeal: 'RM',
  meal: 'ME',
  rawMaterial: 'MAT',
  tradeGood: 'TG',
  body: 'BD'
};

type ModuleInventoryVisual = {
  used: number;
  capacity: number;
  fillPct: number;
  dominantItem: ItemType | null;
  mixed: boolean;
  byItem: Partial<Record<ItemType, number>>;
};

function buildModuleInventoryVisualMap(state: StationState): Map<number, ModuleInventoryVisual> {
  const out = new Map<number, ModuleInventoryVisual>();
  for (const node of state.itemNodes) {
    const byItem: Partial<Record<ItemType, number>> = {};
    let used = 0;
    let dominantItem: ItemType | null = null;
    let dominantValue = -1;
    let nonZeroItemKinds = 0;
    for (const itemType of ITEM_TYPES) {
      const amount = node.items[itemType] ?? 0;
      if (amount > 0.01) {
        byItem[itemType] = amount;
        nonZeroItemKinds += 1;
      }
      used += amount;
      if (amount > dominantValue) {
        dominantValue = amount;
        dominantItem = amount > 0.01 ? itemType : dominantItem;
      }
    }
    if (used <= 0.01 && node.capacity <= 0) continue;
    const fillPct = node.capacity > 0 ? clamp01(used / node.capacity) : 0;
    out.set(node.tileIndex, {
      used,
      capacity: node.capacity,
      fillPct,
      dominantItem: used > 0.01 ? dominantItem : null,
      mixed: nonZeroItemKinds > 1,
      byItem
    });
  }
  return out;
}

function clusterTiles(state: StationState, room: RoomType): number[][] {
  const roomTiles: number[] = [];
  for (let i = 0; i < state.rooms.length; i++) {
    if (state.rooms[i] === room && state.tiles[i] !== TileType.Space && state.tiles[i] !== TileType.Wall) {
      roomTiles.push(i);
    }
  }
  const remaining = new Set(roomTiles);
  const clusters: number[][] = [];
  while (remaining.size > 0) {
    const seed = remaining.values().next().value as number;
    remaining.delete(seed);
    const queue = [seed];
    const cluster = [seed];
    for (let qi = 0; qi < queue.length; qi++) {
      const idx = queue[qi];
      const p = fromIndex(idx, state.width);
      const deltas = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1]
      ];
      for (const [dx, dy] of deltas) {
        const nx = p.x + dx;
        const ny = p.y + dy;
        if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) continue;
        const ni = ny * state.width + nx;
        if (!remaining.has(ni)) continue;
        remaining.delete(ni);
        queue.push(ni);
        cluster.push(ni);
      }
    }
    clusters.push(cluster);
  }
  return clusters;
}

const ROOM_TYPES_WITH_DIAGNOSTICS: RoomType[] = [
  RoomType.Cafeteria,
  RoomType.Kitchen,
  RoomType.Workshop,
  RoomType.Reactor,
  RoomType.Security,
  RoomType.Dorm,
  RoomType.Hygiene,
  RoomType.Hydroponics,
  RoomType.LifeSupport,
  RoomType.Lounge,
  RoomType.Market,
  RoomType.LogisticsStock,
  RoomType.Storage
];

function buildActiveRoomTileSet(state: StationState): Set<number> {
  const active = new Set<number>();
  for (const room of ROOM_TYPES_WITH_DIAGNOSTICS) {
    for (const cluster of clusterTiles(state, room)) {
      if (cluster.length <= 0) continue;
      const diag = getRoomDiagnosticAt(state, cluster[0]);
      if (diag?.active) {
        for (const t of cluster) active.add(t);
      }
    }
  }
  return active;
}

function collectServiceNodeTiles(state: StationState): number[] {
  const out = new Set<number>();
  for (const room of ROOM_TYPES_WITH_DIAGNOSTICS) {
    for (const tile of collectServiceTargets(state, room)) out.add(tile);
  }
  return [...out];
}

function collectCafeteriaQueueNodeTiles(state: StationState): number[] {
  return collectQueueTargets(state, RoomType.Cafeteria);
}

function previewFootprint(module: ModuleType, rotation: 0 | 90): { width: number; height: number } {
  const normalized = normalizeModuleType(module);
  const def = MODULE_DEFINITIONS[normalized] ?? MODULE_DEFINITIONS[ModuleType.None];
  if (rotation === 90 && def.rotatable) return { width: def.height, height: def.width };
  return { width: def.width, height: def.height };
}

function previewTiles(
  state: StationState,
  originTile: number,
  width: number,
  height: number
): number[] | null {
  const { x, y } = fromIndex(originTile, state.width);
  const out: number[] = [];
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      const tx = x + dx;
      const ty = y + dy;
      if (!inBounds(tx, ty, state.width, state.height)) return null;
      out.push(ty * state.width + tx);
    }
  }
  return out;
}

function validateModulePreviewPlacement(
  state: StationState,
  moduleType: ModuleType,
  originTile: number,
  rotation: 0 | 90
): { valid: boolean; tiles: number[] } {
  const normalized = normalizeModuleType(moduleType);
  if (normalized === ModuleType.None) return { valid: true, tiles: [originTile] };
  const def = MODULE_DEFINITIONS[normalized];
  if (!def) return { valid: false, tiles: [originTile] };
  const footprint = previewFootprint(normalized, rotation);
  const tiles = previewTiles(state, originTile, footprint.width, footprint.height);
  if (!tiles) return { valid: false, tiles: [originTile] };
  const roomAtOrigin = state.rooms[originTile];
  for (const tile of tiles) {
    if (!isWalkable(state.tiles[tile])) return { valid: false, tiles };
    if (state.moduleOccupancyByTile[tile] !== null) return { valid: false, tiles };
    if (def.allowedRooms && !def.allowedRooms.includes(state.rooms[tile])) return { valid: false, tiles };
    if (def.allowedRooms && state.rooms[tile] !== roomAtOrigin) return { valid: false, tiles };
  }
  return { valid: true, tiles };
}

function agentOffset(id: number): { x: number; y: number } {
  const ox = ((id * 17) % 7) - 3;
  const oy = ((id * 29) % 7) - 3;
  return { x: ox * 0.08, y: oy * 0.08 };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function mixChannel(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function toHex(r: number, g: number, b: number): string {
  const hex = (n: number): string => n.toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

function visitorMoodScore(state: StationState, visitorIndex: number): number {
  const v = state.visitors[visitorIndex];
  const patiencePressure = clamp01(v.patience / 80);
  let score = 0.55 - patiencePressure * 0.6;
  if (v.servedMeal) score += 0.22;
  if (v.state === VisitorState.Eating || v.state === VisitorState.Leisure) score += 0.14;
  if (v.state === VisitorState.ToDock) score -= 0.1;
  if (v.state === VisitorState.Queueing || v.state === VisitorState.ToCafeteria) score -= 0.05;
  return clamp01(score);
}

function visitorMoodColor(state: StationState, visitorIndex: number): string {
  // 0.0 -> red, 0.5 -> yellow, 1.0 -> green.
  const t = visitorMoodScore(state, visitorIndex);
  if (t <= 0.5) {
    const k = clamp01(t / 0.5);
    const r = mixChannel(232, 244, k);
    const g = mixChannel(97, 229, k);
    const b = mixChannel(97, 140, k);
    return toHex(r, g, b);
  }
  const k = clamp01((t - 0.5) / 0.5);
  const r = mixChannel(244, 128, k);
  const g = mixChannel(229, 231, k);
  const b = mixChannel(140, 142, k);
  return toHex(r, g, b);
}

function drawLaneEdgeOverlay(ctx: CanvasRenderingContext2D, state: StationState, widthPx: number, heightPx: number): void {
  const totalTraffic = Math.max(
    0.0001,
    state.laneProfiles.north.trafficVolume +
      state.laneProfiles.east.trafficVolume +
      state.laneProfiles.south.trafficVolume +
      state.laneProfiles.west.trafficVolume
  );
  const laneRows: Array<{
    lane: 'north' | 'east' | 'south' | 'west';
    label: string;
    x: number;
    y: number;
    align: CanvasTextAlign;
  }> = [
    { lane: 'north', label: 'N', x: widthPx * 0.5, y: 8, align: 'center' },
    { lane: 'south', label: 'S', x: widthPx * 0.5, y: heightPx - 22, align: 'center' },
    { lane: 'west', label: 'W', x: 8, y: heightPx * 0.5 - 8, align: 'left' },
    { lane: 'east', label: 'E', x: widthPx - 8, y: heightPx * 0.5 - 8, align: 'right' }
  ];
  ctx.font = '10px monospace';
  ctx.textBaseline = 'top';
  for (const row of laneRows) {
    const profile = state.laneProfiles[row.lane];
    const lanePct = Math.round((profile.trafficVolume / totalTraffic) * 100);
    const touristPct = Math.round(profile.weights.tourist * 100);
    const traderPct = Math.round(profile.weights.trader * 100);
    const industrialPct = Math.max(0, 100 - touristPct - traderPct);
    const line = `${row.label}: ${lanePct}% | Tour ${touristPct}% / Trade ${traderPct}% / Ind ${industrialPct}%`;
    const textW = ctx.measureText(line).width;
    const pad = 3;
    const boxW = textW + pad * 2;
    const boxH = 14;
    let boxX = row.x - boxW / 2;
    if (row.align === 'left') boxX = row.x;
    if (row.align === 'right') boxX = row.x - boxW;
    const boxY = row.y;
    ctx.fillStyle = 'rgba(7, 16, 25, 0.72)';
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeStyle = 'rgba(62, 86, 116, 0.8)';
    ctx.strokeRect(boxX + 0.5, boxY + 0.5, boxW - 1, boxH - 1);
    ctx.fillStyle = '#c7d6ea';
    ctx.textAlign = row.align;
    const tx = row.align === 'left' ? row.x + pad : row.align === 'right' ? row.x - pad : row.x;
    ctx.fillText(line, tx, boxY + 2);
  }
}

function drawQueuedShips(ctx: CanvasRenderingContext2D, state: StationState): void {
  const countsByLane: Record<'north' | 'east' | 'south' | 'west', number> = {
    north: 0,
    east: 0,
    south: 0,
    west: 0
  };
  const laneStep = 16;
  for (const queued of state.dockQueue) {
    const idx = countsByLane[queued.lane]++;
    const dims =
      queued.size === 'small' ? { w: 8, h: 8 } : queued.size === 'medium' ? { w: 11, h: 9 } : { w: 14, h: 11 };
    let cx = 0;
    let cy = 0;
    if (queued.lane === 'north') {
      cx = state.width * TILE_SIZE * 0.5 + (idx - 2) * laneStep;
      cy = 22;
    } else if (queued.lane === 'south') {
      cx = state.width * TILE_SIZE * 0.5 + (idx - 2) * laneStep;
      cy = state.height * TILE_SIZE - 22;
    } else if (queued.lane === 'west') {
      cx = 22;
      cy = state.height * TILE_SIZE * 0.5 + (idx - 2) * laneStep;
    } else {
      cx = state.width * TILE_SIZE - 22;
      cy = state.height * TILE_SIZE * 0.5 + (idx - 2) * laneStep;
    }
    const color =
      queued.shipType === 'tourist' ? '#ffe08a' : queued.shipType === 'trader' ? '#8fe1ff' : '#ffc07d';
    ctx.fillStyle = 'rgba(6, 16, 28, 0.75)';
    ctx.fillRect(cx - dims.w * 0.5 - 2, cy - dims.h * 0.5 - 2, dims.w + 4, dims.h + 4);
    ctx.fillStyle = color;
    ctx.fillRect(cx - dims.w * 0.5, cy - dims.h * 0.5, dims.w, dims.h);
  }
}

export function renderWorld(
  ctx: CanvasRenderingContext2D,
  state: StationState,
  currentTool: BuildTool,
  hoveredTile: number | null = null
): void {
  const widthPx = state.width * TILE_SIZE;
  const heightPx = state.height * TILE_SIZE;

  ctx.fillStyle = '#061018';
  ctx.fillRect(0, 0, widthPx, heightPx);

  const activeRoomTiles = buildActiveRoomTileSet(state);
  const serviceNodeTiles = state.controls.showServiceNodes ? collectServiceNodeTiles(state) : [];
  const queueNodeTiles = state.controls.showServiceNodes ? collectCafeteriaQueueNodeTiles(state) : [];
  const jobPickupTiles = state.controls.showServiceNodes
    ? state.jobs
        .filter((j) => j.state === 'pending' || j.state === 'assigned' || j.state === 'in_progress')
        .map((j) => j.fromTile)
    : [];
  const jobDropTiles = state.controls.showServiceNodes
    ? state.jobs
        .filter((j) => j.state === 'pending' || j.state === 'assigned' || j.state === 'in_progress')
        .map((j) => j.toTile)
    : [];
  const moduleInventoryVisualMap: Map<number, ModuleInventoryVisual> = state.controls.showInventoryOverlay
    ? buildModuleInventoryVisualMap(state)
    : new Map<number, ModuleInventoryVisual>();
  const bodyCountByTile = new Map<number, number>();
  for (const tile of state.bodyTiles) {
    bodyCountByTile.set(tile, (bodyCountByTile.get(tile) ?? 0) + 1);
  }

  for (let i = 0; i < state.tiles.length; i++) {
    const { x, y } = fromIndex(i, state.width);
    const px = x * TILE_SIZE;
    const py = y * TILE_SIZE;

    ctx.fillStyle = tileColor[state.tiles[i]];
    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

    const blockedUntil = state.effects.blockedUntilByTile.get(i) ?? 0;
    if (state.now < blockedUntil) {
      ctx.fillStyle = 'rgba(255,120,120,0.55)';
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
    }

    if (state.controls.showZones && state.tiles[i] !== TileType.Space) {
      if (state.zones[i] === ZoneType.Restricted) {
        ctx.fillStyle = 'rgba(255, 90, 90, 0.25)';
      } else {
        ctx.fillStyle = 'rgba(90, 170, 255, 0.08)';
      }
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
    }

    const roomType = state.rooms[i];
    if (roomType !== RoomType.None) {
      const operational = activeRoomTiles.has(i);
      const alpha = operational ? 1 : 0.35;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = roomOverlay[roomType];
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(230, 240, 250, 0.24)';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(roomLetter[roomType], px + TILE_SIZE * 0.5, py + TILE_SIZE * 0.53);
    }

    if (i === state.core.serviceTile) {
      ctx.fillStyle = 'rgba(255, 221, 87, 0.45)';
      ctx.fillRect(px + 2, py + 2, TILE_SIZE - 4, TILE_SIZE - 4);
    }

    if (state.tiles[i] !== TileType.Space && state.tiles[i] !== TileType.Wall && !state.pressurized[i]) {
      ctx.fillStyle = 'rgba(160, 40, 40, 0.22)';
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
    }

    if (state.controls.showServiceNodes && serviceNodeTiles.includes(i)) {
      ctx.fillStyle = 'rgba(0, 230, 180, 0.28)';
      ctx.fillRect(px + 2, py + 2, TILE_SIZE - 4, TILE_SIZE - 4);
    }
    if (state.controls.showServiceNodes && queueNodeTiles.includes(i)) {
      ctx.fillStyle = 'rgba(255, 205, 80, 0.3)';
      ctx.fillRect(px + 5, py + 5, TILE_SIZE - 10, TILE_SIZE - 10);
    }
    if (state.controls.showServiceNodes && jobPickupTiles.includes(i)) {
      ctx.fillStyle = 'rgba(90, 180, 255, 0.45)';
      ctx.fillRect(px + 1, py + 1, 4, 4);
    }
    if (state.controls.showServiceNodes && jobDropTiles.includes(i)) {
      ctx.fillStyle = 'rgba(255, 140, 90, 0.45)';
      ctx.fillRect(px + TILE_SIZE - 5, py + TILE_SIZE - 5, 4, 4);
    }
    const bodiesHere = bodyCountByTile.get(i) ?? 0;
    if (bodiesHere > 0) {
      ctx.fillStyle = 'rgba(210, 80, 80, 0.9)';
      ctx.fillRect(px + 2, py + TILE_SIZE - 6, TILE_SIZE - 4, 4);
      if (bodiesHere > 1) {
        ctx.fillStyle = '#ffdede';
        ctx.font = 'bold 8px monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(String(bodiesHere), px + TILE_SIZE - 2, py + TILE_SIZE - 8);
      }
    }

    if (state.tiles[i] === TileType.Dock) {
      const dock = state.docks.find((d) => d.tiles.includes(i)) ?? null;
      if (dock) {
        ctx.fillStyle = 'rgba(8, 16, 28, 0.8)';
        ctx.fillRect(px + 1, py + 1, 7, 7);
        ctx.fillStyle = '#d6deeb';
        ctx.font = 'bold 7px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const label = dock.facing === 'north' ? 'N' : dock.facing === 'east' ? 'E' : dock.facing === 'south' ? 'S' : 'W';
        ctx.fillText(label, px + 4.5, py + 4.5);
      }
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.strokeRect(px + 0.5, py + 0.5, TILE_SIZE, TILE_SIZE);
  }

  for (const module of state.moduleInstances) {
    const origin = fromIndex(module.originTile, state.width);
    const px = origin.x * TILE_SIZE;
    const py = origin.y * TILE_SIZE;
    const w = module.width * TILE_SIZE;
    const h = module.height * TILE_SIZE;
    const inventory = moduleInventoryVisualMap.get(module.originTile);
    ctx.fillStyle = 'rgba(10, 14, 22, 0.78)';
    ctx.fillRect(px + 3, py + 3, w - 6, h - 6);
    if (state.controls.showInventoryOverlay && inventory && inventory.capacity > 0) {
      const innerX = px + 3;
      const innerY = py + 3;
      const innerW = w - 6;
      const innerH = h - 6;
      const fillHeight = Math.round(innerH * inventory.fillPct);
      if (fillHeight > 0) {
        const color = itemFillColor[inventory.dominantItem ?? 'none'];
        ctx.fillStyle = color;
        ctx.fillRect(innerX, innerY + (innerH - fillHeight), innerW, fillHeight);
      }
      if (inventory.mixed && inventory.used > 0.01) {
        ctx.fillStyle = 'rgba(230, 240, 255, 0.95)';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText('+', px + w - 4, py + 4);
      }
    }
    ctx.strokeStyle = 'rgba(214, 228, 245, 0.72)';
    ctx.strokeRect(px + 3.5, py + 3.5, w - 7, h - 7);
    ctx.fillStyle = '#e5f0ff';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      moduleLetter[module.type] ?? '?',
      px + w * 0.5,
      py + h * 0.5
    );
    if (state.controls.showInventoryOverlay && inventory && inventory.capacity > 0) {
      const usedLabel = `${Math.round(inventory.used)}/${Math.round(inventory.capacity)}`;
      const itemCode = inventory.dominantItem ? itemShortCode[inventory.dominantItem] : '';
      if (module.width === 1 && module.height === 1) {
        if (itemCode) {
          ctx.fillStyle = 'rgba(8, 12, 18, 0.8)';
          ctx.fillRect(px + 2, py + 2, TILE_SIZE - 4, 8);
          ctx.fillStyle = '#e5f0ff';
          ctx.font = 'bold 7px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(itemCode, px + TILE_SIZE * 0.5, py + 3);
        }
      } else {
        const text = itemCode ? `${usedLabel} ${itemCode}` : usedLabel;
        ctx.fillStyle = 'rgba(8, 12, 18, 0.84)';
        ctx.fillRect(px + 2, py + 2, Math.max(18, text.length * 4.8), 8);
        ctx.fillStyle = '#dce8f9';
        ctx.font = 'bold 7px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(text, px + 3, py + 3);
      }
    }
  }

  if (hoveredTile !== null && hoveredTile >= 0 && hoveredTile < state.tiles.length) {
    const p = fromIndex(hoveredTile, state.width);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(p.x * TILE_SIZE + 1, p.y * TILE_SIZE + 1, TILE_SIZE - 2, TILE_SIZE - 2);
    ctx.lineWidth = 1;
    if ((bodyCountByTile.get(hoveredTile) ?? 0) > 0) {
      ctx.fillStyle = 'rgba(255, 195, 195, 0.95)';
      ctx.font = '11px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('Body remains (temporary system)', 8, 36);
    }
  }

  if (currentTool.kind === 'tile' && currentTool.tile === TileType.Dock && hoveredTile !== null) {
    const preview = validateDockPlacement(state, hoveredTile);
    for (const ti of preview.approachTiles) {
      const p = fromIndex(ti, state.width);
      ctx.fillStyle = preview.valid ? 'rgba(110,219,143,0.22)' : 'rgba(255,118,118,0.22)';
      ctx.fillRect(p.x * TILE_SIZE + 1, p.y * TILE_SIZE + 1, TILE_SIZE - 2, TILE_SIZE - 2);
    }
  }

  if (currentTool.kind === 'module' && hoveredTile !== null && currentTool.module) {
    const preview = validateModulePreviewPlacement(
      state,
      currentTool.module,
      hoveredTile,
      state.controls.moduleRotation
    );
    for (const ti of preview.tiles) {
      const p = fromIndex(ti, state.width);
      ctx.fillStyle = preview.valid ? 'rgba(110,219,143,0.28)' : 'rgba(255,118,118,0.32)';
      ctx.fillRect(p.x * TILE_SIZE + 1, p.y * TILE_SIZE + 1, TILE_SIZE - 2, TILE_SIZE - 2);
      ctx.strokeStyle = preview.valid ? 'rgba(110,219,143,0.95)' : 'rgba(255,118,118,0.95)';
      ctx.strokeRect(p.x * TILE_SIZE + 1.5, p.y * TILE_SIZE + 1.5, TILE_SIZE - 3, TILE_SIZE - 3);
    }
  }

  for (let vi = 0; vi < state.visitors.length; vi++) {
    const v = state.visitors[vi];
    const o = agentOffset(v.id);
    ctx.fillStyle = visitorMoodColor(state, vi);
    ctx.beginPath();
    ctx.arc((v.x + o.x) * TILE_SIZE, (v.y + o.y) * TILE_SIZE, TILE_SIZE * 0.22, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const r of state.residents) {
    const o = agentOffset(r.id);
    ctx.fillStyle =
      r.healthState === 'critical' ? '#ff8f8f' : r.healthState === 'distressed' ? '#ffd07a' : '#c7e3ff';
    ctx.beginPath();
    ctx.arc((r.x + o.x) * TILE_SIZE, (r.y + o.y) * TILE_SIZE, TILE_SIZE * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const c of state.crewMembers) {
    const o = agentOffset(c.id);
    ctx.fillStyle = '#7ec8ff';
    ctx.beginPath();
    ctx.arc((c.x + o.x) * TILE_SIZE, (c.y + o.y) * TILE_SIZE, TILE_SIZE * 0.18, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const ship of state.arrivingShips) {
    const dims =
      ship.size === 'small' ? { w: 2, h: 2 } : ship.size === 'medium' ? { w: 3, h: 2 } : { w: 4, h: 3 };
    const dockX = ship.bayCenterX - dims.w * 0.5;
    const dockY = ship.bayCenterY - dims.h * 0.5;

    let posX = dockX;
    let posY = dockY;
    if (ship.stage === 'approach' || ship.stage === 'depart') {
      const t = Math.min(1, ship.stageTime / 2);
      const lane = ship.lane;
      const off = ship.stage === 'approach' ? 1 - t : t;
      if (lane === 'north') posY = dockY - off * (dims.h + 1.5);
      if (lane === 'south') posY = dockY + off * (dims.h + 1.5);
      if (lane === 'east') posX = dockX + off * (dims.w + 1.5);
      if (lane === 'west') posX = dockX - off * (dims.w + 1.5);
    }

    for (let sy = 0; sy < dims.h; sy++) {
      for (let sx = 0; sx < dims.w; sx++) {
        if ((sx + sy) % 2 === 1 && ship.size !== 'large') continue;
        const px = (posX + sx) * TILE_SIZE + 2;
        const py = (posY + sy) * TILE_SIZE + 2;
        ctx.fillStyle = ship.stage === 'docked' ? '#ffd447' : '#ffea8a';
        ctx.fillRect(px, py, TILE_SIZE - 4, TILE_SIZE - 4);
      }
    }
  }

  drawQueuedShips(ctx, state);
  drawLaneEdgeOverlay(ctx, state, widthPx, heightPx);

  if (state.now < state.effects.brownoutUntil) {
    ctx.fillStyle = 'rgba(90, 90, 130, 0.18)';
    ctx.fillRect(0, 0, widthPx, heightPx);
  }

  const toolText =
    currentTool.kind === 'none'
      ? 'Tool: Inspect'
      : currentTool.kind === 'tile'
      ? `Tool: ${currentTool.tile}`
      : currentTool.kind === 'zone'
        ? `Tool: Zone ${currentTool.zone}`
        : currentTool.kind === 'room'
          ? `Tool: Room ${currentTool.room}`
          : `Tool: Module ${currentTool.module} (${state.controls.moduleRotation}deg)`;

  ctx.fillStyle = '#d3deed';
  ctx.font = '12px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(toolText, 8, 16);
  ctx.fillStyle = 'rgba(8, 16, 28, 0.72)';
  ctx.fillRect(6, 42, 220, 34);
  const legendItems: Array<{ color: string; label: string; y: number }> = [
    { color: '#f4e58c', label: 'Visitor mood (red->yellow->green)', y: 56 },
    { color: '#7ec8ff', label: 'Crew', y: 70 }
  ];
  for (let i = 0; i < legendItems.length; i++) {
    const item = legendItems[i];
    ctx.fillStyle = item.color;
    ctx.beginPath();
    ctx.arc(18, item.y, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d3deed';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.label, 26, item.y);
  }
  if (state.metrics.bodyCount > 0) {
    ctx.fillStyle = 'rgba(255, 180, 180, 0.95)';
    ctx.fillText(`Bodies: ${state.metrics.bodyCount}`, 8, 32);
  }
}

export function loadColor(loadPct: number): string {
  if (loadPct < 75) return '#6edb8f';
  if (loadPct < 95) return '#ffcf6e';
  return '#ff7676';
}
