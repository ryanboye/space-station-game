import { TILE_SIZE, TileType, type StationState } from '../sim/types';
import { isWallLikeTileForDual } from './wall-dual-tilemap';

const PX = TILE_SIZE / 18;
const BAND = Math.max(3, Math.round(4 * PX));
const DEPTH = Math.max(3, Math.round(5 * PX));
const INSET = Math.max(2, Math.round(2 * PX));
const RIM = Math.max(1, Math.round(1 * PX));
const LIGHT_W = Math.max(3, Math.round(5 * PX));
const LIGHT_H = Math.max(1, Math.round(2 * PX));

type Direction = 'north' | 'east' | 'south' | 'west';

function tileAt(state: StationState, x: number, y: number): TileType | null {
  if (x < 0 || y < 0 || x >= state.width || y >= state.height) return null;
  return state.tiles[y * state.width + x];
}

function isWallLike(state: StationState, x: number, y: number): boolean {
  const tile = tileAt(state, x, y);
  return tile !== null && isWallLikeTileForDual(tile);
}

function isSpaceLike(state: StationState, x: number, y: number): boolean {
  const tile = tileAt(state, x, y);
  return tile === null || tile === TileType.Space;
}

function hash2(x: number, y: number): number {
  let n = Math.imul(x + 101, 374761393) ^ Math.imul(y + 37, 668265263);
  n = (n ^ (n >>> 13)) >>> 0;
  return Math.imul(n, 1274126177) >>> 0;
}

function boundaryForDirection(x: number, y: number, direction: Direction): { nx: number; ny: number } {
  switch (direction) {
    case 'north':
      return { nx: x, ny: y - 1 };
    case 'east':
      return { nx: x + 1, ny: y };
    case 'south':
      return { nx: x, ny: y + 1 };
    case 'west':
      return { nx: x - 1, ny: y };
  }
}

function drawHullBand(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  direction: Direction,
  exterior: boolean
): void {
  const dark = exterior ? 'rgba(5, 8, 13, 0.72)' : 'rgba(12, 18, 26, 0.48)';
  const mid = exterior ? 'rgba(35, 46, 62, 0.7)' : 'rgba(42, 53, 70, 0.48)';
  const rim = exterior ? 'rgba(214, 225, 236, 0.46)' : 'rgba(190, 204, 218, 0.28)';
  ctx.fillStyle = dark;

  if (direction === 'north') {
    ctx.fillRect(px, py, TILE_SIZE, BAND);
    ctx.fillStyle = mid;
    ctx.fillRect(px + RIM, py + RIM, TILE_SIZE - RIM * 2, RIM);
    ctx.fillStyle = rim;
    ctx.fillRect(px + RIM, py + BAND - RIM, TILE_SIZE - RIM * 2, RIM);
    return;
  }
  if (direction === 'south') {
    ctx.fillRect(px, py + TILE_SIZE - BAND, TILE_SIZE, BAND);
    ctx.fillStyle = mid;
    ctx.fillRect(px + RIM, py + TILE_SIZE - BAND, TILE_SIZE - RIM * 2, RIM);
    ctx.fillStyle = rim;
    ctx.fillRect(px + RIM, py + TILE_SIZE - RIM, TILE_SIZE - RIM * 2, RIM);
    return;
  }
  if (direction === 'west') {
    ctx.fillRect(px, py, BAND, TILE_SIZE);
    ctx.fillStyle = mid;
    ctx.fillRect(px + RIM, py + RIM, RIM, TILE_SIZE - RIM * 2);
    ctx.fillStyle = rim;
    ctx.fillRect(px + BAND - RIM, py + RIM, RIM, TILE_SIZE - RIM * 2);
    return;
  }
  ctx.fillRect(px + TILE_SIZE - BAND, py, BAND, TILE_SIZE);
  ctx.fillStyle = mid;
  ctx.fillRect(px + TILE_SIZE - BAND, py + RIM, RIM, TILE_SIZE - RIM * 2);
  ctx.fillStyle = rim;
  ctx.fillRect(px + TILE_SIZE - RIM, py + RIM, RIM, TILE_SIZE - RIM * 2);
}

function drawWallTopCap(ctx: CanvasRenderingContext2D, px: number, py: number, x: number, y: number): void {
  const top = ctx.createLinearGradient(px, py, px, py + TILE_SIZE);
  top.addColorStop(0, 'rgba(170, 188, 204, 0.18)');
  top.addColorStop(0.35, 'rgba(78, 94, 112, 0.12)');
  top.addColorStop(1, 'rgba(2, 5, 10, 0.16)');
  ctx.fillStyle = top;
  ctx.fillRect(px + INSET, py + INSET, TILE_SIZE - INSET * 2, TILE_SIZE - INSET * 2);

  ctx.strokeStyle = 'rgba(230, 240, 248, 0.18)';
  ctx.lineWidth = 1;
  ctx.strokeRect(px + INSET + 0.5, py + INSET + 0.5, TILE_SIZE - INSET * 2 - 1, TILE_SIZE - INSET * 2 - 1);

  const hash = hash2(x, y);
  ctx.strokeStyle = 'rgba(7, 12, 20, 0.22)';
  ctx.beginPath();
  if (hash & 1) {
    ctx.moveTo(px + INSET + 2, py + TILE_SIZE * 0.38);
    ctx.lineTo(px + TILE_SIZE - INSET - 2, py + TILE_SIZE * 0.2);
  } else {
    ctx.moveTo(px + TILE_SIZE * 0.3, py + INSET + 2);
    ctx.lineTo(px + TILE_SIZE * 0.78, py + TILE_SIZE - INSET - 2);
  }
  ctx.stroke();
}

function drawContactDepth(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  direction: Direction,
  exterior: boolean
): void {
  const alpha = exterior ? 0.52 : 0.26;
  const highlightAlpha = exterior ? 0.34 : 0.18;
  const shadow = `rgba(0, 4, 10, ${alpha})`;
  const highlight = `rgba(226, 236, 244, ${highlightAlpha})`;

  if (direction === 'north') {
    ctx.fillStyle = shadow;
    ctx.fillRect(px, py - DEPTH, TILE_SIZE, DEPTH);
    ctx.fillStyle = highlight;
    ctx.fillRect(px + INSET, py, TILE_SIZE - INSET * 2, RIM);
    return;
  }
  if (direction === 'south') {
    ctx.fillStyle = shadow;
    ctx.fillRect(px, py + TILE_SIZE, TILE_SIZE, DEPTH);
    ctx.fillStyle = highlight;
    ctx.fillRect(px + INSET, py + TILE_SIZE - RIM, TILE_SIZE - INSET * 2, RIM);
    return;
  }
  if (direction === 'west') {
    ctx.fillStyle = shadow;
    ctx.fillRect(px - DEPTH, py, DEPTH, TILE_SIZE);
    ctx.fillStyle = highlight;
    ctx.fillRect(px, py + INSET, RIM, TILE_SIZE - INSET * 2);
    return;
  }
  ctx.fillStyle = shadow;
  ctx.fillRect(px + TILE_SIZE, py, DEPTH, TILE_SIZE);
  ctx.fillStyle = highlight;
  ctx.fillRect(px + TILE_SIZE - RIM, py + INSET, RIM, TILE_SIZE - INSET * 2);
}

function drawCornerBevel(ctx: CanvasRenderingContext2D, px: number, py: number, north: boolean, east: boolean, south: boolean, west: boolean): void {
  const size = BAND + RIM;
  ctx.fillStyle = 'rgba(232, 240, 247, 0.22)';
  if (north && west) ctx.fillRect(px + INSET, py + INSET, size, RIM);
  if (north && east) ctx.fillRect(px + TILE_SIZE - INSET - size, py + INSET, size, RIM);
  if (south && west) ctx.fillRect(px + INSET, py + TILE_SIZE - INSET - RIM, size, RIM);
  if (south && east) ctx.fillRect(px + TILE_SIZE - INSET - size, py + TILE_SIZE - INSET - RIM, size, RIM);

  ctx.fillStyle = 'rgba(0, 3, 8, 0.28)';
  if (south && west) ctx.fillRect(px + INSET, py + TILE_SIZE - INSET - size, RIM, size);
  if (south && east) ctx.fillRect(px + TILE_SIZE - INSET - RIM, py + TILE_SIZE - INSET - size, RIM, size);
}

function drawWallLight(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  direction: Direction
): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const glow = ctx.createRadialGradient(
    px + TILE_SIZE * 0.5,
    py + TILE_SIZE * 0.5,
    0,
    px + TILE_SIZE * 0.5,
    py + TILE_SIZE * 0.5,
    TILE_SIZE * 0.8
  );
  glow.addColorStop(0, 'rgba(255, 214, 132, 0.2)');
  glow.addColorStop(1, 'rgba(255, 214, 132, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(px - TILE_SIZE * 0.35, py - TILE_SIZE * 0.35, TILE_SIZE * 1.7, TILE_SIZE * 1.7);
  ctx.restore();

  ctx.fillStyle = 'rgba(255, 224, 142, 0.88)';
  if (direction === 'north' || direction === 'south') {
    const y = direction === 'north' ? py + BAND - LIGHT_H : py + TILE_SIZE - BAND;
    ctx.fillRect(px + TILE_SIZE * 0.5 - LIGHT_W * 0.5, y, LIGHT_W, LIGHT_H);
  } else {
    const x = direction === 'west' ? px + BAND - LIGHT_H : px + TILE_SIZE - BAND;
    ctx.fillRect(x, py + TILE_SIZE * 0.5 - LIGHT_W * 0.5, LIGHT_H, LIGHT_W);
  }
}

/**
 * Secondary wall pass: deterministic hull bands, rim highlights, and sparse
 * local wall lights. This gives generated wall sprites a stronger art
 * direction without letting asset generation own connectivity.
 */
export function renderWallDetailLayer(ctx: CanvasRenderingContext2D, state: StationState): void {
  ctx.save();
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      const tile = tileAt(state, x, y);
      if (tile !== TileType.Wall) continue;
      const px = x * TILE_SIZE;
      const py = y * TILE_SIZE;
      drawWallTopCap(ctx, px, py, x, y);

      const exposed = {
        north: !isWallLike(state, x, y - 1),
        east: !isWallLike(state, x + 1, y),
        south: !isWallLike(state, x, y + 1),
        west: !isWallLike(state, x - 1, y)
      };

      for (const direction of ['north', 'east', 'south', 'west'] as const) {
        const { nx, ny } = boundaryForDirection(x, y, direction);
        if (isWallLike(state, nx, ny)) continue;
        const exterior = isSpaceLike(state, nx, ny);
        drawContactDepth(ctx, px, py, direction, exterior);
        drawHullBand(ctx, px, py, direction, exterior);
        if (!exterior && hash2(x, y) % 7 === 0) {
          drawWallLight(ctx, px, py, direction);
        }
      }
      drawCornerBevel(ctx, px, py, exposed.north, exposed.east, exposed.south, exposed.west);
    }
  }
  ctx.restore();
}
