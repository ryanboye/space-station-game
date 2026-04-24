import { TILE_SIZE, TileType, fromIndex, type StationState } from '../sim/types';
import { getDockByTile } from '../sim/sim';

const PX = TILE_SIZE / 18;
const STRIPE = Math.max(1, Math.round(2 * PX));

function drawDockDetail(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  facing: 'north' | 'east' | 'south' | 'west',
  endpoint: boolean
): void {
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = 'rgba(210, 226, 238, 0.24)';
  ctx.lineWidth = Math.max(1, Math.round(1 * PX));
  ctx.strokeRect(px + 2.5, py + 2.5, TILE_SIZE - 5, TILE_SIZE - 5);

  ctx.fillStyle = 'rgba(255, 194, 54, 0.58)';
  if (facing === 'north' || facing === 'south') {
    const y = facing === 'north' ? py + TILE_SIZE - STRIPE * 2 : py + STRIPE;
    for (let x = px + STRIPE; x < px + TILE_SIZE - STRIPE; x += STRIPE * 3) {
      ctx.fillRect(x, y, STRIPE * 2, STRIPE);
    }
  } else {
    const x = facing === 'west' ? px + TILE_SIZE - STRIPE * 2 : px + STRIPE;
    for (let y = py + STRIPE; y < py + TILE_SIZE - STRIPE; y += STRIPE * 3) {
      ctx.fillRect(x, y, STRIPE, STRIPE * 2);
    }
  }

  if (endpoint) {
    ctx.globalCompositeOperation = 'lighter';
    const cx = px + TILE_SIZE * 0.5;
    const cy = py + TILE_SIZE * 0.5;
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, TILE_SIZE * 0.7);
    glow.addColorStop(0, 'rgba(80, 255, 155, 0.14)');
    glow.addColorStop(1, 'rgba(80, 255, 155, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(px - TILE_SIZE * 0.25, py - TILE_SIZE * 0.25, TILE_SIZE * 1.5, TILE_SIZE * 1.5);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(96, 255, 160, 0.78)';
    ctx.fillRect(px + TILE_SIZE * 0.43, py + TILE_SIZE * 0.43, TILE_SIZE * 0.14, TILE_SIZE * 0.14);
  }

  ctx.restore();
}

export function renderDoorDockDetailLayer(ctx: CanvasRenderingContext2D, state: StationState): void {
  for (let i = 0; i < state.tiles.length; i++) {
    const tile = state.tiles[i];
    if (tile !== TileType.Dock) continue;
    const { x, y } = fromIndex(i, state.width);
    const px = x * TILE_SIZE;
    const py = y * TILE_SIZE;

    const dock = getDockByTile(state, i);
    if (!dock) continue;
    const horizontal = dock.facing === 'north' || dock.facing === 'south';
    const prevTile = horizontal ? i - 1 : i - state.width;
    const nextTile = horizontal ? i + 1 : i + state.width;
    const prevDock = prevTile >= 0 ? getDockByTile(state, prevTile) : null;
    const nextDock = nextTile >= 0 ? getDockByTile(state, nextTile) : null;
    drawDockDetail(ctx, px, py, dock.facing, prevDock?.id !== dock.id || nextDock?.id !== dock.id);
  }
}
