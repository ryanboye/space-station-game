import { TileType, fromIndex, inBounds, type StationState } from '../sim/types';

export type TileRotation = 0 | 90 | 180 | 270;
export type WallVariantShape = 'solo' | 'end' | 'straight' | 'corner' | 'tee' | 'cross';
export type DoorVariantShape = 'horizontal' | 'vertical';

export type WallVariant = {
  shape: WallVariantShape;
  rotation: TileRotation;
};

export type DoorVariant = {
  shape: DoorVariantShape;
  rotation: TileRotation;
};

function connectedWallLikeTile(tile: TileType): boolean {
  return tile === TileType.Wall || tile === TileType.Door;
}

function hasWallLikeNeighbor(state: StationState, x: number, y: number): boolean {
  if (!inBounds(x, y, state.width, state.height)) return false;
  return connectedWallLikeTile(state.tiles[y * state.width + x]);
}

export function wallNeighborMask(state: StationState, index: number): number {
  const p = fromIndex(index, state.width);
  let mask = 0;
  if (hasWallLikeNeighbor(state, p.x, p.y - 1)) mask |= 1; // N
  if (hasWallLikeNeighbor(state, p.x + 1, p.y)) mask |= 2; // E
  if (hasWallLikeNeighbor(state, p.x, p.y + 1)) mask |= 4; // S
  if (hasWallLikeNeighbor(state, p.x - 1, p.y)) mask |= 8; // W
  return mask;
}

export function resolveWallVariantFromMask(mask: number): WallVariant {
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
      return { shape: 'cross', rotation: 0 };
    default:
      return { shape: 'cross', rotation: 0 };
  }
}

export function resolveDoorVariantFromMask(mask: number): DoorVariant {
  const ewConnections = (mask & 2 ? 1 : 0) + (mask & 8 ? 1 : 0);
  const nsConnections = (mask & 1 ? 1 : 0) + (mask & 4 ? 1 : 0);
  if (ewConnections >= nsConnections) return { shape: 'horizontal', rotation: 0 };
  return { shape: 'vertical', rotation: 0 };
}

export function resolveWallVariantForTile(state: StationState, index: number): WallVariant {
  return resolveWallVariantFromMask(wallNeighborMask(state, index));
}

export function resolveDoorVariantForTile(state: StationState, index: number): DoorVariant {
  return resolveDoorVariantFromMask(wallNeighborMask(state, index));
}
