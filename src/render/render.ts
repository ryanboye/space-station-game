import {
  ModuleType,
  RoomType,
  TILE_SIZE,
  TileType,
  ZoneType,
  fromIndex,
  isWalkable,
  type BuildTool,
  type StationState
} from '../sim/types';
import { validateDockPlacement } from '../sim/sim';

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
  [RoomType.Reactor]: 'rgba(185, 125, 57, 0.28)',
  [RoomType.Security]: 'rgba(189, 79, 79, 0.28)',
  [RoomType.Dorm]: 'rgba(126, 200, 255, 0.22)',
  [RoomType.Hygiene]: 'rgba(96, 228, 225, 0.24)',
  [RoomType.Hydroponics]: 'rgba(98, 205, 120, 0.2)',
  [RoomType.LifeSupport]: 'rgba(245, 245, 170, 0.2)',
  [RoomType.Lounge]: 'rgba(196, 140, 255, 0.2)',
  [RoomType.Market]: 'rgba(255, 188, 120, 0.2)'
};

const roomLetter: Record<RoomType, string> = {
  [RoomType.None]: '',
  [RoomType.Cafeteria]: 'C',
  [RoomType.Kitchen]: 'I',
  [RoomType.Reactor]: 'R',
  [RoomType.Security]: 'S',
  [RoomType.Dorm]: 'D',
  [RoomType.Hygiene]: 'H',
  [RoomType.Hydroponics]: 'F',
  [RoomType.LifeSupport]: 'L',
  [RoomType.Lounge]: 'U',
  [RoomType.Market]: 'K'
};

const moduleLetter: Record<ModuleType, string> = {
  [ModuleType.None]: '',
  [ModuleType.Bed]: 'B',
  [ModuleType.Table]: 'T',
  [ModuleType.Stove]: 'V',
  [ModuleType.GrowTray]: 'G',
  [ModuleType.Terminal]: 'M'
};

function hasAdjacentDoor(index: number, width: number, height: number, tiles: TileType[]): boolean {
  const p = fromIndex(index, width);
  const deltas = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ];
  for (const [dx, dy] of deltas) {
    const nx = p.x + dx;
    const ny = p.y + dy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    const ni = ny * width + nx;
    if (tiles[ni] === TileType.Door) return true;
  }
  return false;
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

function requiredModuleForRoom(room: RoomType): ModuleType | null {
  if (room === RoomType.Dorm) return ModuleType.Bed;
  if (room === RoomType.Cafeteria) return ModuleType.Table;
  if (room === RoomType.Kitchen) return ModuleType.Stove;
  if (room === RoomType.Hydroponics) return ModuleType.GrowTray;
  if (room === RoomType.Security) return ModuleType.Terminal;
  return null;
}

function collectServiceNodeTiles(state: StationState, room: RoomType): number[] {
  const out: number[] = [];
  const required = requiredModuleForRoom(room);
  for (let i = 0; i < state.rooms.length; i++) {
    if (state.rooms[i] !== room) continue;
    if (!required || state.modules[i] === required) out.push(i);
  }
  return out;
}

function collectCafeteriaQueueNodeTiles(state: StationState): number[] {
  const service = collectServiceNodeTiles(state, RoomType.Cafeteria);
  const out = new Set<number>();
  for (const tile of service) {
    const p = fromIndex(tile, state.width);
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
      if (!isWalkable(state.tiles[ni])) continue;
      if (state.rooms[ni] === RoomType.Cafeteria) continue;
      out.add(ni);
    }
  }
  return [...out];
}

function buildActiveRoomTileSet(state: StationState, staffByTile: Map<number, number>): Set<number> {
  const active = new Set<number>();
  const requirements: Record<RoomType, number> = {
    [RoomType.None]: 0,
    [RoomType.Cafeteria]: 1,
    [RoomType.Kitchen]: 1,
    [RoomType.Reactor]: 1,
    [RoomType.Security]: 2,
    [RoomType.Dorm]: 0,
    [RoomType.Hygiene]: 1,
    [RoomType.Hydroponics]: 1,
    [RoomType.LifeSupport]: 1,
    [RoomType.Lounge]: 1,
    [RoomType.Market]: 1
  };
  const roomTypes = [
    RoomType.Cafeteria,
    RoomType.Kitchen,
    RoomType.Reactor,
    RoomType.Security,
    RoomType.Dorm,
    RoomType.Hygiene,
    RoomType.Hydroponics,
    RoomType.LifeSupport,
    RoomType.Lounge,
    RoomType.Market
  ];

  for (const room of roomTypes) {
    for (const cluster of clusterTiles(state, room)) {
      let hasDoor = false;
      let pressurized = 0;
      let staff = 0;
      const requiredModule = requiredModuleForRoom(room);
      let hasServiceNode = requiredModule === null;
      for (const tile of cluster) {
        if (!hasDoor && hasAdjacentDoor(tile, state.width, state.height, state.tiles)) hasDoor = true;
        if (state.pressurized[tile] || room === RoomType.Reactor) pressurized++;
        staff += staffByTile.get(tile) ?? 0;
        if (!hasServiceNode && state.modules[tile] === requiredModule) hasServiceNode = true;
      }
      const pressurizedEnough = room === RoomType.Reactor || pressurized / cluster.length >= 0.7;
      const staffEnough = staff >= requirements[room];
      if (hasDoor && pressurizedEnough && staffEnough && hasServiceNode) {
        for (const t of cluster) active.add(t);
      }
    }
  }
  return active;
}

function agentOffset(id: number): { x: number; y: number } {
  const ox = ((id * 17) % 7) - 3;
  const oy = ((id * 29) % 7) - 3;
  return { x: ox * 0.08, y: oy * 0.08 };
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
    const traderPct = Math.max(0, 100 - touristPct);
    const line = `${row.label}: ${lanePct}% | Tour ${touristPct}% / Trade ${traderPct}%`;
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
    const color = queued.shipType === 'tourist' ? '#ffe08a' : '#8fe1ff';
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

  const staffByTile = new Map<number, number>();
  for (const crew of state.crewMembers) {
    if (crew.resting) continue;
    if (crew.targetTile === null) continue;
    if (crew.tileIndex !== crew.targetTile) continue;
    staffByTile.set(crew.tileIndex, (staffByTile.get(crew.tileIndex) ?? 0) + 1);
  }
  const activeRoomTiles = buildActiveRoomTileSet(state, staffByTile);
  const serviceNodeTiles = state.controls.showServiceNodes
    ? [
        ...collectServiceNodeTiles(state, RoomType.Dorm),
        ...collectServiceNodeTiles(state, RoomType.Cafeteria),
        ...collectServiceNodeTiles(state, RoomType.Kitchen),
        ...collectServiceNodeTiles(state, RoomType.Hydroponics),
        ...collectServiceNodeTiles(state, RoomType.Security)
      ]
    : [];
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

    const moduleType = state.modules[i];
    if (moduleType !== ModuleType.None) {
      ctx.fillStyle = 'rgba(10, 14, 22, 0.78)';
      ctx.fillRect(px + 4, py + 4, TILE_SIZE - 8, TILE_SIZE - 8);
      ctx.strokeStyle = 'rgba(214, 228, 245, 0.7)';
      ctx.strokeRect(px + 4.5, py + 4.5, TILE_SIZE - 9, TILE_SIZE - 9);
      ctx.fillStyle = '#e5f0ff';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(moduleLetter[moduleType], px + TILE_SIZE * 0.5, py + TILE_SIZE * 0.53);
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

  for (const v of state.visitors) {
    const o = agentOffset(v.id);
    ctx.fillStyle = '#f4e58c';
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
    currentTool.kind === 'tile'
      ? `Tool: ${currentTool.tile}`
      : currentTool.kind === 'zone'
        ? `Tool: Zone ${currentTool.zone}`
        : currentTool.kind === 'room'
          ? `Tool: Room ${currentTool.room}`
          : `Tool: Module ${currentTool.module}`;

  ctx.fillStyle = '#d3deed';
  ctx.font = '12px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(toolText, 8, 16);
  ctx.fillStyle = 'rgba(8, 16, 28, 0.72)';
  ctx.fillRect(6, 42, 220, 34);
  const legendItems: Array<{ color: string; label: string; y: number }> = [
    { color: '#f4e58c', label: 'Visitor', y: 56 },
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
