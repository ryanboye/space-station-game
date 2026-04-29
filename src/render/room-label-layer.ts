import { RoomType, TILE_SIZE, TileType, fromIndex, type StationState } from '../sim/types';

const PX = TILE_SIZE / 18;

const ROOM_LABELS: Record<RoomType, string> = {
  [RoomType.None]: '',
  [RoomType.Cafeteria]: 'MESS HALL',
  [RoomType.Kitchen]: 'KITCHEN',
  [RoomType.Workshop]: 'WORKSHOP',
  [RoomType.Clinic]: 'MED BAY',
  [RoomType.Brig]: 'BRIG',
  [RoomType.RecHall]: 'REC HALL',
  [RoomType.Reactor]: 'ENGINEERING',
  [RoomType.Security]: 'SECURITY',
  [RoomType.Dorm]: 'CREW QUARTERS',
  [RoomType.Hygiene]: 'HYGIENE',
  [RoomType.Hydroponics]: 'HYDROPONICS BAY',
  [RoomType.LifeSupport]: 'LIFE SUPPORT',
  [RoomType.Lounge]: 'LOUNGE',
  [RoomType.Market]: 'MARKET',
  [RoomType.LogisticsStock]: 'LOGISTICS',
  [RoomType.Storage]: 'STORAGE',
  [RoomType.Berth]: 'BERTH',
  [RoomType.Cantina]: 'CANTINA',
  [RoomType.Observatory]: 'OBSERVATORY'
};

type RoomComponent = {
  room: RoomType;
  count: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

function isLabelTile(state: StationState, index: number, room: RoomType): boolean {
  if (state.rooms[index] !== room) return false;
  const tile = state.tiles[index];
  return tile !== TileType.Space && tile !== TileType.Wall && tile !== TileType.Door;
}

function collectRoomComponents(state: StationState): RoomComponent[] {
  const visited = new Uint8Array(state.tiles.length);
  const out: RoomComponent[] = [];
  const queue: number[] = [];

  for (let start = 0; start < state.tiles.length; start++) {
    if (visited[start]) continue;
    const room = state.rooms[start];
    if (room === RoomType.None || !isLabelTile(state, start, room)) {
      visited[start] = 1;
      continue;
    }

    let q = 0;
    queue.length = 0;
    queue.push(start);
    visited[start] = 1;
    const p = fromIndex(start, state.width);
    const component: RoomComponent = {
      room,
      count: 0,
      minX: p.x,
      minY: p.y,
      maxX: p.x,
      maxY: p.y
    };

    while (q < queue.length) {
      const index = queue[q++];
      const { x, y } = fromIndex(index, state.width);
      component.count += 1;
      component.minX = Math.min(component.minX, x);
      component.minY = Math.min(component.minY, y);
      component.maxX = Math.max(component.maxX, x);
      component.maxY = Math.max(component.maxY, y);

      const neighbors = [
        x > 0 ? index - 1 : -1,
        x < state.width - 1 ? index + 1 : -1,
        y > 0 ? index - state.width : -1,
        y < state.height - 1 ? index + state.width : -1
      ];
      for (const next of neighbors) {
        if (next < 0 || visited[next]) continue;
        if (!isLabelTile(state, next, room)) continue;
        visited[next] = 1;
        queue.push(next);
      }
    }

    out.push(component);
  }

  return out;
}

export function renderRoomLabelLayer(ctx: CanvasRenderingContext2D, state: StationState): void {
  const components = collectRoomComponents(state);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${Math.round(8 * PX)}px monospace`;

  for (const component of components) {
    const width = component.maxX - component.minX + 1;
    const height = component.maxY - component.minY + 1;
    if (component.count < 18 || width < 4 || height < 3) continue;
    const label = ROOM_LABELS[component.room];
    if (!label) continue;
    const cx = (component.minX + width * 0.5) * TILE_SIZE;
    const cy = (component.minY + 0.9) * TILE_SIZE;
    const labelWidth = Math.min(TILE_SIZE * (width - 0.75), label.length * Math.round(5 * PX) + TILE_SIZE);
    const labelHeight = Math.round(13 * PX);
    ctx.fillStyle = 'rgba(9, 13, 19, 0.48)';
    ctx.fillRect(cx - labelWidth * 0.5, cy - labelHeight * 0.5, labelWidth, labelHeight);
    ctx.strokeStyle = 'rgba(220, 230, 236, 0.18)';
    ctx.strokeRect(cx - labelWidth * 0.5 + 0.5, cy - labelHeight * 0.5 + 0.5, labelWidth - 1, labelHeight - 1);
    ctx.fillStyle = 'rgba(238, 242, 232, 0.9)';
    ctx.fillText(label, cx, cy + Math.round(0.5 * PX));
  }

  ctx.restore();
}
