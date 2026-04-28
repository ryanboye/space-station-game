// Glow render pass — soft additive radial glows for light-emitting tiles
// and modules (rimworld-style). Painted on a cached offscreen canvas after
// the static + decorative sprite layers. Cache is keyed on topology, module
// version, and a small dynamic signature (med-bed occupancy, kitchen-active
// and reactors-active flags) so frame cost stays ~0 when nothing changes.
//
// Emitter sources (colors tuned per design):
//  - module.wall-light         warm amber, directional downward cone
//  - module.stove  (active)    orange heat — only while kitchen is active
//  - tile.reactor              red-orange per-tile core glow
//  - module.med-bed (with pt)  cool cyan UI cue, only while occupied
//  - module.grow-station       soft green (kept from prior implementation)
//  - module.terminal           cyan (kept from prior implementation)
//  - module.game-station       violet (kept from prior implementation)

import {
  ModuleType,
  RoomType,
  TILE_SIZE,
  TileType,
  fromIndex,
  type StationState
} from '../sim/types';

type GlowCachedLayer = {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  key: string;
};

let glowLayerCache: GlowCachedLayer | null = null;

export function invalidateGlowCache(): void {
  glowLayerCache = null;
}

function ensureCachedLayer(
  existing: GlowCachedLayer | null,
  widthPx: number,
  heightPx: number
): GlowCachedLayer {
  if (existing && existing.canvas.width === widthPx && existing.canvas.height === heightPx) {
    return existing;
  }
  const canvas = document.createElement('canvas');
  canvas.width = widthPx;
  canvas.height = heightPx;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to acquire 2d context for glow layer');
  }
  return { canvas, ctx, key: '' };
}

// Source-of-truth glow colors. Keep alpha values ≤ 0.25 so additive-blend
// accumulation from neighbors doesn't blow out (per awfml 2026-04-23:
// "Glow On just does that weird orange glow that needs fixing").
const GLOW_COLOR_WALL_LIGHT = 'rgba(255, 220, 140, 0.22)';
const GLOW_COLOR_STOVE = 'rgba(255, 130, 60, 0.18)';
const GLOW_COLOR_REACTOR_TILE = 'rgba(255, 100, 60, 0.18)';
const GLOW_COLOR_MED_BED = 'rgba(140, 200, 255, 0.18)';

function drawGlowCircle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radiusPx: number,
  color: string,
  strength = 1
): void {
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/i);
  if (!match) return;
  const [, r, g, b, a] = match;
  const baseAlpha = Number(a);
  if (!Number.isFinite(baseAlpha) || baseAlpha <= 0) return;
  const rgba = (alpha: number) => `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radiusPx);
  gradient.addColorStop(0, rgba(baseAlpha * strength));
  gradient.addColorStop(0.55, rgba(baseAlpha * 0.4 * strength));
  gradient.addColorStop(1, rgba(0));
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(cx, cy, radiusPx, 0, Math.PI * 2);
  ctx.fill();
}

function drawDirectionalGlow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radiusX: number,
  radiusY: number,
  color: string,
  strength = 1
): void {
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/i);
  if (!match) return;
  const [, r, g, b, a] = match;
  const baseAlpha = Number(a);
  if (!Number.isFinite(baseAlpha) || baseAlpha <= 0) return;
  const rgba = (alpha: number) => `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(radiusX, radiusY));
  gradient.addColorStop(0, rgba(baseAlpha * strength));
  gradient.addColorStop(0.38, rgba(baseAlpha * 0.5 * strength));
  gradient.addColorStop(1, rgba(0));
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, radiusY / Math.max(1, radiusX));
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, radiusX, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Small, O(modules + agents)-ish signature for dynamic emitters that aren't
// captured by moduleVersion/roomVersion. Flipping any of these invalidates
// the cached glow layer; otherwise the layer reuses the previous paint.
function buildDynamicSignature(state: StationState): string {
  const medBedTiles = new Set<number>();
  for (const module of state.moduleInstances) {
    if (module.type !== ModuleType.MedBed) continue;
    for (const tile of module.tiles) medBedTiles.add(tile);
  }
  let medBedOccupied = 0;
  if (medBedTiles.size > 0) {
    for (const r of state.residents) {
      if (medBedTiles.has(r.tileIndex)) medBedOccupied += 1;
    }
    for (const v of state.visitors) {
      if (medBedTiles.has(v.tileIndex)) medBedOccupied += 1;
    }
  }
  const kitchenActive = state.ops.kitchenActive > 0 ? 1 : 0;
  const reactorsActive = state.ops.reactorsActive > 0 ? 1 : 0;
  return `${medBedOccupied}|${kitchenActive}|${reactorsActive}`;
}

/**
 * Paint the glow layer (if dirty) and composite it onto the target ctx.
 * Cheap when cache is warm — just a single drawImage.
 */
export function renderGlowPass(
  ctx: CanvasRenderingContext2D,
  state: StationState,
  widthPx: number,
  heightPx: number,
  useSprites: boolean
): void {
  if (!state.controls.showGlow) return;

  glowLayerCache = ensureCachedLayer(glowLayerCache, widthPx, heightPx);
  const layer = glowLayerCache;
  const dynamicSig = buildDynamicSignature(state);
  const key = [
    state.width,
    state.height,
    state.roomVersion,
    state.moduleVersion,
    useSprites ? 1 : 0,
    dynamicSig
  ].join('|');

  if (layer.key !== key) {
    layer.key = key;
    const lctx = layer.ctx;
    lctx.clearRect(0, 0, widthPx, heightPx);
    paintEmitters(lctx, state, useSprites);
  }

  ctx.drawImage(layer.canvas, 0, 0);
}

function paintEmitters(
  ctx: CanvasRenderingContext2D,
  state: StationState,
  useSprites: boolean
): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // Per-tile reactor glow — picks up every reactor floor cell. Two
  // shapes hit this loop:
  //   1. tile.reactor (TileType.Reactor) — the canonical reactor floor
  //      sprite, painted by the static layer.
  //   2. plain Floor tiles whose room metadata is Reactor (e.g. the
  //      demo/cold-start-prototype path that sets room metadata before
  //      it stamps tile types). Without this branch the glow only
  //      lights up wherever (1) happens to coincide and the rest of
  //      the cluster reads as ordinary floor, which awfml flagged as
  //      visually confusing during the cold-start review.
  // A typical reactor bank has a handful of tiles; total cost is ≪1ms.
  for (let i = 0; i < state.tiles.length; i++) {
    const tileType = state.tiles[i];
    const isReactorTile = tileType === TileType.Reactor;
    const isReactorFloor =
      tileType === TileType.Floor && state.rooms[i] === RoomType.Reactor;
    if (!isReactorTile && !isReactorFloor) continue;
    const { x, y } = fromIndex(i, state.width);
    const cx = (x + 0.5) * TILE_SIZE;
    const cy = (y + 0.5) * TILE_SIZE;
    drawGlowCircle(ctx, cx, cy, TILE_SIZE * 1.5, GLOW_COLOR_REACTOR_TILE, 0.9);
  }

  const kitchenActive = state.ops.kitchenActive > 0;
  for (const module of state.moduleInstances) {
    const origin = fromIndex(module.originTile, state.width);
    const cx = (origin.x + module.width * 0.5) * TILE_SIZE;
    const cy = (origin.y + module.height * 0.5) * TILE_SIZE;

    switch (module.type) {
      case ModuleType.WallLight: {
        // Wall lights are wall-mounted; cone falls onto the floor below.
        const lightCx = cx;
        const lightCy = cy + TILE_SIZE * 0.72;
        if (useSprites) {
          drawDirectionalGlow(ctx, lightCx, lightCy, TILE_SIZE * 0.72, TILE_SIZE * 1.65, GLOW_COLOR_WALL_LIGHT, 0.9);
          drawDirectionalGlow(ctx, lightCx, lightCy + TILE_SIZE * 0.28, TILE_SIZE * 0.42, TILE_SIZE * 0.95, GLOW_COLOR_WALL_LIGHT, 0.7);
        } else {
          drawGlowCircle(ctx, cx, cy, TILE_SIZE * 1.5, GLOW_COLOR_WALL_LIGHT, 0.8);
        }
        break;
      }
      case ModuleType.Stove: {
        // Gate on kitchenActive — a lone stove in an idle kitchen stays dark.
        if (!kitchenActive) break;
        if (state.rooms[module.originTile] !== RoomType.Kitchen) break;
        drawGlowCircle(ctx, cx, cy, TILE_SIZE * 1.4, GLOW_COLOR_STOVE, 1);
        break;
      }
      case ModuleType.MedBed: {
        const occupied =
          state.residents.some((r) => module.tiles.includes(r.tileIndex)) ||
          state.visitors.some((v) => module.tiles.includes(v.tileIndex));
        if (!occupied) break;
        drawGlowCircle(ctx, cx, cy, TILE_SIZE * 1.5, GLOW_COLOR_MED_BED, 1);
        break;
      }
      case ModuleType.GrowStation: {
        drawGlowCircle(ctx, cx, cy, TILE_SIZE * 1.35, 'rgba(115, 255, 140, 0.16)', 0.75);
        break;
      }
      case ModuleType.Terminal: {
        drawGlowCircle(ctx, cx, cy, TILE_SIZE * 0.9, 'rgba(100, 220, 255, 0.15)', 0.55);
        break;
      }
      case ModuleType.GameStation: {
        drawGlowCircle(ctx, cx, cy, TILE_SIZE * 1, 'rgba(160, 120, 255, 0.12)', 0.45);
        break;
      }
      default:
        break;
    }
  }

  ctx.restore();
}
