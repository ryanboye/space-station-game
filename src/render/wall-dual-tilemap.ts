import { TILE_SIZE, TileType, type StationState } from '../sim/types';
import type { SpriteAtlas } from './sprite-atlas';

export type DualWallShape = 'empty' | 'single_corner' | 'edge' | 'saddle' | 'inner_corner' | 'full';
export type DualWallRotation = 0 | 90 | 180 | 270;
export type DualWallVariant = { shape: DualWallShape; rotation: DualWallRotation };

export const WALL_DUAL_SPRITE_VARIANT_KEYS: Record<DualWallShape, string> = {
  empty: 'tile.wall.dt.empty',
  single_corner: 'tile.wall.dt.single_corner',
  edge: 'tile.wall.dt.edge',
  saddle: 'tile.wall.dt.saddle',
  inner_corner: 'tile.wall.dt.inner_corner',
  full: 'tile.wall.dt.full'
};

/**
 * Which tiles terminate a dual-tilemap wall? Walls ONLY — doors are excluded
 * (RimWorld-style: walls meet flush against doors, not merged). This differs
 * from the per-cell wall renderer in `tile-variants.ts` where Door counts as
 * a connected neighbor.
 */
export function isWallLikeTileForDual(tile: TileType): boolean {
  return tile === TileType.Wall;
}

/**
 * Sample whether world-cell (cx, cy) is wall-like for the dual pass.
 * Out-of-bounds reads as non-wall (false) so that the station edges terminate
 * the wall with a finished corner rather than bleeding into space.
 */
export function sampleWallCorner(state: StationState, cx: number, cy: number): boolean {
  if (cx < 0 || cy < 0 || cx >= state.width || cy >= state.height) return false;
  const tile = state.tiles[cy * state.width + cx];
  return isWallLikeTileForDual(tile);
}

/**
 * 16-entry lookup keyed by mask = tl*1 + tr*2 + bl*4 + br*8.
 * Each entry is the canonical authoring variant (TL-quadrant biased) + the
 * clockwise rotation needed to map it onto the sampled quadrants.
 *
 * See the truth table in the implementation plan / PR body for the full
 * derivation. Canonical authoring:
 *   - single_corner : TL filled only
 *   - edge          : TL+TR filled (top half solid)
 *   - saddle        : TL+BR filled
 *   - inner_corner  : TL+TR+BL filled (BR empty)
 */
const DUAL_VARIANT_LOOKUP: readonly DualWallVariant[] = [
  /*  0: 0000 */ { shape: 'empty', rotation: 0 },
  /*  1: 1000 */ { shape: 'single_corner', rotation: 0 },
  /*  2: 0100 */ { shape: 'single_corner', rotation: 90 },
  /*  3: 1100 */ { shape: 'edge', rotation: 0 },
  /*  4: 0010 */ { shape: 'single_corner', rotation: 270 },
  /*  5: 1010 */ { shape: 'edge', rotation: 270 },
  /*  6: 0110 */ { shape: 'saddle', rotation: 90 },
  /*  7: 1110 */ { shape: 'inner_corner', rotation: 0 },
  /*  8: 0001 */ { shape: 'single_corner', rotation: 180 },
  /*  9: 1001 */ { shape: 'saddle', rotation: 0 },
  /* 10: 0101 */ { shape: 'edge', rotation: 90 },
  /* 11: 1101 */ { shape: 'inner_corner', rotation: 90 },
  /* 12: 0011 */ { shape: 'edge', rotation: 180 },
  /* 13: 1011 */ { shape: 'inner_corner', rotation: 270 },
  /* 14: 0111 */ { shape: 'inner_corner', rotation: 180 },
  /* 15: 1111 */ { shape: 'full', rotation: 0 }
];

export function pickDualVariant(tl: boolean, tr: boolean, bl: boolean, br: boolean): DualWallVariant {
  const mask = (tl ? 1 : 0) | (tr ? 2 : 0) | (bl ? 4 : 0) | (br ? 8 : 0);
  return DUAL_VARIANT_LOOKUP[mask];
}

/**
 * Iterate over the (width+1) x (height+1) render-grid NODES. Each node sits at
 * a world-corner shared by up to 4 world cells; we blit the wall sprite
 * centered on the node (so it straddles the 4 cells it touches).
 */
export function renderDualWallLayer(
  ctx: CanvasRenderingContext2D,
  state: StationState,
  spriteAtlas: SpriteAtlas,
  drawSpriteByKey: (
    ctx: CanvasRenderingContext2D,
    atlas: SpriteAtlas,
    key: string,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
    rotationDeg?: number
  ) => boolean
): void {
  const { width, height } = state;
  for (let ry = 0; ry <= height; ry++) {
    for (let rx = 0; rx <= width; rx++) {
      const tl = sampleWallCorner(state, rx - 1, ry - 1);
      const tr = sampleWallCorner(state, rx, ry - 1);
      const bl = sampleWallCorner(state, rx - 1, ry);
      const br = sampleWallCorner(state, rx, ry);
      const variant = pickDualVariant(tl, tr, bl, br);
      if (variant.shape === 'empty') continue;
      const dx = (rx - 0.5) * TILE_SIZE;
      const dy = (ry - 0.5) * TILE_SIZE;
      drawSpriteByKey(
        ctx,
        spriteAtlas,
        WALL_DUAL_SPRITE_VARIANT_KEYS[variant.shape],
        dx,
        dy,
        TILE_SIZE,
        TILE_SIZE,
        variant.rotation
      );
    }
  }
}
