import {
  type StationState,
  TileType,
  type UtilityNetworkDiagnostics,
  type UtilityUnderlayKind,
  type UtilityUnderlayState,
  fromIndex,
  inBounds,
  isWalkable,
  toIndex
} from './types';

export const UTILITY_UNDERLAY_KINDS: readonly UtilityUnderlayKind[] = [
  'air-duct',
  'hot-pipe',
  'cold-pipe',
  'power-conduit',
  'coolant-pipe',
  'water-pipe',
  'fuel-pipe',
  'data-conduit'
] as const;

export const IMPLEMENTED_UTILITY_UNDERLAY_KINDS: readonly UtilityUnderlayKind[] = [
  'air-duct',
  'power-conduit',
  'water-pipe',
  'fuel-pipe'
] as const;

export function isUtilityUnderlayKind(value: string | undefined): value is UtilityUnderlayKind {
  return (UTILITY_UNDERLAY_KINDS as readonly string[]).includes(value ?? '');
}

export function createEmptyUtilityUnderlay(tileCount: number): UtilityUnderlayState {
  const layers = {} as Record<UtilityUnderlayKind, Uint8Array>;
  for (const kind of UTILITY_UNDERLAY_KINDS) layers[kind] = new Uint8Array(tileCount);
  return { version: 0, layers };
}

function cloneUtilityUnderlayLayer(source: Uint8Array | number[] | undefined, tileCount: number): Uint8Array {
  const out = new Uint8Array(tileCount);
  if (!source) return out;
  const len = Math.min(tileCount, source.length);
  for (let i = 0; i < len; i++) out[i] = source[i] ? 1 : 0;
  return out;
}

export function createUtilityUnderlayFromLayers(
  tileCount: number,
  layers: Partial<Record<UtilityUnderlayKind, Uint8Array | number[]>> = {},
  version = 0
): UtilityUnderlayState {
  const out = createEmptyUtilityUnderlay(tileCount);
  out.version = Math.max(0, Math.floor(version));
  for (const kind of UTILITY_UNDERLAY_KINDS) {
    out.layers[kind] = cloneUtilityUnderlayLayer(layers[kind], tileCount);
  }
  return out;
}

export function ensureUtilityUnderlay(state: StationState): UtilityUnderlayState {
  const tileCount = state.width * state.height;
  const maybeState = state as StationState & { utilityUnderlay?: UtilityUnderlayState };
  if (!maybeState.utilityUnderlay) {
    maybeState.utilityUnderlay = createEmptyUtilityUnderlay(tileCount);
    return maybeState.utilityUnderlay;
  }
  let resized = false;
  const nextLayers: Partial<Record<UtilityUnderlayKind, Uint8Array>> = {};
  for (const kind of UTILITY_UNDERLAY_KINDS) {
    const layer = maybeState.utilityUnderlay.layers?.[kind];
    if (!layer || layer.length !== tileCount) resized = true;
    nextLayers[kind] = cloneUtilityUnderlayLayer(layer, tileCount);
  }
  if (resized) {
    maybeState.utilityUnderlay = createUtilityUnderlayFromLayers(
      tileCount,
      nextLayers,
      (maybeState.utilityUnderlay.version ?? 0) + 1
    );
  }
  return maybeState.utilityUnderlay;
}

export function utilityUnderlayTileCount(state: StationState, kind: UtilityUnderlayKind): number {
  const layer = ensureUtilityUnderlay(state).layers[kind];
  let count = 0;
  for (let i = 0; i < layer.length; i++) {
    if (layer[i]) count++;
  }
  return count;
}

export function hasUtilityUnderlay(state: StationState, kind: UtilityUnderlayKind, tileIndex: number): boolean {
  if (tileIndex < 0 || tileIndex >= state.tiles.length) return false;
  return ensureUtilityUnderlay(state).layers[kind][tileIndex] > 0;
}

export function canPlaceUtilityUnderlay(state: StationState, kind: UtilityUnderlayKind, tileIndex: number): boolean {
  if (!IMPLEMENTED_UTILITY_UNDERLAY_KINDS.includes(kind)) return false;
  if (tileIndex < 0 || tileIndex >= state.tiles.length) return false;
  const tile = state.tiles[tileIndex];
  if (tile === TileType.Space || tile === TileType.Truss) return false;
  if (tile === TileType.Wall) {
    const pos = fromIndex(tileIndex, state.width);
    const cardinalDeltas: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    let touchesInterior = false;
    for (const [dx, dy] of cardinalDeltas) {
      const nx = pos.x + dx;
      const ny = pos.y + dy;
      if (!inBounds(nx, ny, state.width, state.height)) continue;
      const neighbor = state.tiles[toIndex(nx, ny, state.width)];
      if (neighbor === TileType.Space || neighbor === TileType.Truss) return false;
      if (isWalkable(neighbor)) touchesInterior = true;
    }
    return touchesInterior;
  }
  return isWalkable(tile);
}

function markUtilityVersion(state: StationState): void {
  const utility = ensureUtilityUnderlay(state);
  utility.version += 1;
}

export function setUtilityUnderlayTile(
  state: StationState,
  kind: UtilityUnderlayKind,
  tileIndex: number,
  present: boolean
): boolean {
  const utility = ensureUtilityUnderlay(state);
  if (tileIndex < 0 || tileIndex >= state.tiles.length) return false;
  if (present && !canPlaceUtilityUnderlay(state, kind, tileIndex)) return false;
  const layer = utility.layers[kind];
  const next = present ? 1 : 0;
  if (layer[tileIndex] === next) return false;
  layer[tileIndex] = next;
  markUtilityVersion(state);
  return true;
}

export function clearUtilityUnderlayAt(
  state: StationState,
  tileIndex: number,
  kind?: UtilityUnderlayKind
): boolean {
  const utility = ensureUtilityUnderlay(state);
  if (tileIndex < 0 || tileIndex >= state.tiles.length) return false;
  let changed = false;
  const kinds = kind ? [kind] : UTILITY_UNDERLAY_KINDS;
  for (const layerKind of kinds) {
    if (utility.layers[layerKind][tileIndex] > 0) {
      utility.layers[layerKind][tileIndex] = 0;
      changed = true;
    }
  }
  if (changed) markUtilityVersion(state);
  return changed;
}

export function copyUtilityUnderlayAt(state: StationState, fromTile: number, toTile: number): boolean {
  const utility = ensureUtilityUnderlay(state);
  if (fromTile < 0 || fromTile >= state.tiles.length || toTile < 0 || toTile >= state.tiles.length) return false;
  let changed = false;
  for (const kind of UTILITY_UNDERLAY_KINDS) {
    const present = utility.layers[kind][fromTile] > 0 && canPlaceUtilityUnderlay(state, kind, toTile);
    const next = present ? 1 : 0;
    if (utility.layers[kind][toTile] !== next) {
      utility.layers[kind][toTile] = next;
      changed = true;
    }
  }
  if (changed) markUtilityVersion(state);
  return changed;
}

export function utilityUnderlayNeighborMask(state: StationState, kind: UtilityUnderlayKind, tileIndex: number): number {
  if (!hasUtilityUnderlay(state, kind, tileIndex)) return 0;
  const pos = fromIndex(tileIndex, state.width);
  let mask = 0;
  const checks: Array<readonly [number, number, number]> = [
    [0, -1, 1],
    [1, 0, 2],
    [0, 1, 4],
    [-1, 0, 8]
  ];
  for (const [dx, dy, bit] of checks) {
    const nx = pos.x + dx;
    const ny = pos.y + dy;
    if (!inBounds(nx, ny, state.width, state.height)) continue;
    if (hasUtilityUnderlay(state, kind, toIndex(nx, ny, state.width))) mask |= bit;
  }
  return mask;
}

export function utilityUnderlayShapeForMask(mask: number): 'isolated' | 'end' | 'straight' | 'corner' | 'tee' | 'cross' {
  const count = (mask & 1 ? 1 : 0) + (mask & 2 ? 1 : 0) + (mask & 4 ? 1 : 0) + (mask & 8 ? 1 : 0);
  if (count <= 0) return 'isolated';
  if (count === 1) return 'end';
  if (count === 2) return mask === 5 || mask === 10 ? 'straight' : 'corner';
  if (count === 3) return 'tee';
  return 'cross';
}

export function utilityLayerSignature(state: StationState, kind: UtilityUnderlayKind): string {
  const layer = ensureUtilityUnderlay(state).layers[kind];
  let count = 0;
  let hash = 2166136261;
  for (let i = 0; i < layer.length; i++) {
    if (!layer[i]) continue;
    count++;
    hash ^= i + 1;
    hash = Math.imul(hash, 16777619);
  }
  return `${count}:${hash >>> 0}`;
}

export type UtilityNetworkSourceSinkOptions = {
  sourceTiles?: Iterable<number>;
  sinkTiles?: Iterable<number>;
};

export function discoverUtilityNetworks(
  state: StationState,
  kind: UtilityUnderlayKind,
  options: UtilityNetworkSourceSinkOptions = {}
): UtilityNetworkDiagnostics {
  const layer = ensureUtilityUnderlay(state).layers[kind];
  const tileCount = state.tiles.length;
  const componentIdByTile = new Int16Array(tileCount);
  componentIdByTile.fill(-1);
  const distanceByTile = new Int16Array(tileCount);
  distanceByTile.fill(-1);
  const sourceSet = new Set<number>(options.sourceTiles ?? []);
  const sinkSet = new Set<number>(options.sinkTiles ?? []);
  const components: UtilityNetworkDiagnostics['components'] = [];
  let tileTotal = 0;
  const cardinalDeltas: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  for (let start = 0; start < layer.length; start++) {
    if (!layer[start] || componentIdByTile[start] >= 0) continue;
    const id = components.length;
    const tiles: number[] = [];
    const queue = [start];
    componentIdByTile[start] = id;
    for (let qi = 0; qi < queue.length; qi++) {
      const tile = queue[qi];
      tiles.push(tile);
      const pos = fromIndex(tile, state.width);
      for (const [dx, dy] of cardinalDeltas) {
        const nx = pos.x + dx;
        const ny = pos.y + dy;
        if (!inBounds(nx, ny, state.width, state.height)) continue;
        const ni = toIndex(nx, ny, state.width);
        if (!layer[ni] || componentIdByTile[ni] >= 0) continue;
        componentIdByTile[ni] = id;
        queue.push(ni);
      }
    }
    const sourceTiles = tiles.filter((tile) => sourceSet.has(tile));
    const sinkTiles = tiles.filter((tile) => sinkSet.has(tile));
    const powered = sourceTiles.length > 0;
    tileTotal += tiles.length;
    components.push({
      id,
      kind,
      tiles,
      sourceTiles,
      sinkTiles,
      powered,
      quality: powered ? 1 : 0
    });
  }

  let sourceCount = 0;
  let sinkCount = 0;
  let poweredSinkCount = 0;
  let poweredNetworkCount = 0;
  let disconnectedTileCount = 0;
  let distanceSamples = 0;
  let distanceTotal = 0;
  for (const component of components) {
    sourceCount += component.sourceTiles.length;
    sinkCount += component.sinkTiles.length;
    if (component.powered) {
      poweredNetworkCount++;
      poweredSinkCount += component.sinkTiles.length;
      const queue = component.sourceTiles.slice();
      for (const tile of queue) distanceByTile[tile] = 0;
      for (let qi = 0; qi < queue.length; qi++) {
        const tile = queue[qi];
        const pos = fromIndex(tile, state.width);
        const nextDistance = distanceByTile[tile] + 1;
        for (const [dx, dy] of cardinalDeltas) {
          const nx = pos.x + dx;
          const ny = pos.y + dy;
          if (!inBounds(nx, ny, state.width, state.height)) continue;
          const ni = toIndex(nx, ny, state.width);
          if (!layer[ni] || componentIdByTile[ni] !== component.id || distanceByTile[ni] >= 0) continue;
          distanceByTile[ni] = nextDistance;
          queue.push(ni);
        }
      }
      for (const tile of component.tiles) {
        const distance = distanceByTile[tile];
        if (distance >= 0) {
          distanceSamples++;
          distanceTotal += distance;
        }
      }
    } else {
      disconnectedTileCount += component.tiles.length;
    }
  }

  return {
    kind,
    networkCount: components.length,
    poweredNetworkCount,
    tileCount: tileTotal,
    sourceCount,
    sinkCount,
    poweredSinkCount,
    disconnectedTileCount,
    averageDistance: distanceSamples > 0 ? distanceTotal / distanceSamples : 0,
    components,
    componentIdByTile,
    distanceByTile
  };
}

export function remapUtilityUnderlayState(
  utility: UtilityUnderlayState | undefined,
  oldWidth: number,
  oldHeight: number,
  newWidth: number,
  newHeight: number,
  shiftX: number,
  shiftY: number
): UtilityUnderlayState {
  const source = utility ?? createEmptyUtilityUnderlay(oldWidth * oldHeight);
  const out = createEmptyUtilityUnderlay(newWidth * newHeight);
  out.version = (source.version ?? 0) + 1;
  for (const kind of UTILITY_UNDERLAY_KINDS) {
    const oldLayer = source.layers[kind] ?? new Uint8Array(oldWidth * oldHeight);
    const nextLayer = out.layers[kind];
    for (let y = 0; y < oldHeight; y++) {
      for (let x = 0; x < oldWidth; x++) {
        const oldIndex = toIndex(x, y, oldWidth);
        if (!oldLayer[oldIndex]) continue;
        const newIndex = toIndex(x + shiftX, y + shiftY, newWidth);
        nextLayer[newIndex] = 1;
      }
    }
  }
  return out;
}
