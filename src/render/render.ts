import { RoomType, TILE_SIZE, TileType, ZoneType, fromIndex, type BuildTool, type StationState } from '../sim/types';

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
  [RoomType.Reactor]: 'rgba(185, 125, 57, 0.28)',
  [RoomType.Security]: 'rgba(189, 79, 79, 0.28)',
  [RoomType.Dorm]: 'rgba(126, 200, 255, 0.22)',
  [RoomType.Hygiene]: 'rgba(96, 228, 225, 0.24)',
  [RoomType.Hydroponics]: 'rgba(98, 205, 120, 0.2)',
  [RoomType.LifeSupport]: 'rgba(245, 245, 170, 0.2)'
};

const roomLetter: Record<RoomType, string> = {
  [RoomType.None]: '',
  [RoomType.Cafeteria]: 'C',
  [RoomType.Reactor]: 'R',
  [RoomType.Security]: 'S',
  [RoomType.Dorm]: 'D',
  [RoomType.Hygiene]: 'H',
  [RoomType.Hydroponics]: 'F',
  [RoomType.LifeSupport]: 'L'
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

function buildActiveRoomTileSet(state: StationState, staffByTile: Map<number, number>): Set<number> {
  const active = new Set<number>();
  const requirements: Record<RoomType, number> = {
    [RoomType.None]: 0,
    [RoomType.Cafeteria]: 1,
    [RoomType.Reactor]: 1,
    [RoomType.Security]: 2,
    [RoomType.Dorm]: 0,
    [RoomType.Hygiene]: 1,
    [RoomType.Hydroponics]: 1,
    [RoomType.LifeSupport]: 1
  };
  const roomTypes = [
    RoomType.Cafeteria,
    RoomType.Reactor,
    RoomType.Security,
    RoomType.Dorm,
    RoomType.Hygiene,
    RoomType.Hydroponics,
    RoomType.LifeSupport
  ];

  for (const room of roomTypes) {
    for (const cluster of clusterTiles(state, room)) {
      let hasDoor = false;
      let pressurized = 0;
      let staff = 0;
      for (const tile of cluster) {
        if (!hasDoor && hasAdjacentDoor(tile, state.width, state.height, state.tiles)) hasDoor = true;
        if (state.pressurized[tile] || room === RoomType.Reactor) pressurized++;
        staff += staffByTile.get(tile) ?? 0;
      }
      const pressurizedEnough = room === RoomType.Reactor || pressurized / cluster.length >= 0.7;
      const staffEnough = staff >= requirements[room];
      if (hasDoor && pressurizedEnough && staffEnough) {
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
      ctx.fillStyle = 'rgba(230, 240, 250, 0.9)';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(roomLetter[roomType], px + TILE_SIZE * 0.5, py + TILE_SIZE * 0.53);
    }

    if (state.tiles[i] !== TileType.Space && state.tiles[i] !== TileType.Wall && !state.pressurized[i]) {
      ctx.fillStyle = 'rgba(160, 40, 40, 0.22)';
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
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
    ctx.fillStyle = '#c7e3ff';
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
    if (ship.stage === 'approach') {
      const t = Math.min(1, ship.stageTime / 2);
      posX = -dims.w + (dockX + dims.w) * t;
    } else if (ship.stage === 'depart') {
      const t = Math.min(1, ship.stageTime / 2);
      posX = dockX + (state.width + dims.w - dockX) * t;
    }

    for (let sy = 0; sy < dims.h; sy++) {
      for (let sx = 0; sx < dims.w; sx++) {
        if ((sx + sy) % 2 === 1 && ship.size !== 'large') continue;
        const px = (posX + sx) * TILE_SIZE + 2;
        const py = (dockY + sy) * TILE_SIZE + 2;
        ctx.fillStyle = ship.stage === 'docked' ? '#ffd447' : '#ffea8a';
        ctx.fillRect(px, py, TILE_SIZE - 4, TILE_SIZE - 4);
      }
    }
  }

  if (state.now < state.effects.brownoutUntil) {
    ctx.fillStyle = 'rgba(90, 90, 130, 0.18)';
    ctx.fillRect(0, 0, widthPx, heightPx);
  }

  const toolText =
    currentTool.kind === 'tile'
      ? `Tool: ${currentTool.tile}`
      : currentTool.kind === 'zone'
        ? `Tool: Zone ${currentTool.zone}`
        : `Tool: Room ${currentTool.room}`;

  ctx.fillStyle = '#d3deed';
  ctx.font = '12px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(toolText, 8, 16);
}

export function loadColor(loadPct: number): string {
  if (loadPct < 75) return '#6edb8f';
  if (loadPct < 95) return '#ffcf6e';
  return '#ff7676';
}
