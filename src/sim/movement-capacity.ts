import { TileType, isWalkable, type StationState } from './types';

export type MovementCrossSection = {
  /** Stable for both directions across the same physical cut. */
  key: string;
  /** Number of adjacent walkable, fixture-free lanes across this cut. */
  capacity: number;
  /** Zero-based position within the cross-section. */
  lane: number;
  axis: 'horizontal' | 'vertical';
  /** Doors, airlocks, and fixture/service edges are deliberately serialized. */
  forcedSingle: boolean;
};

type CapacityCache = {
  version: string;
  buildCount: number;
  byEdge: Map<string, MovementCrossSection>;
};

const capacityCacheByState = new WeakMap<StationState, CapacityCache>();

function versionFor(state: StationState): string {
  return `${state.width}x${state.height}:${state.topologyVersion}:${state.moduleVersion}`;
}

function edgeKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function isForcedSingleTile(state: StationState, tileIndex: number): boolean {
  return (
    state.tiles[tileIndex] === TileType.Door ||
    state.tiles[tileIndex] === TileType.Airlock ||
    state.moduleOccupancyByTile[tileIndex] !== null
  );
}

function isOrdinaryCapacityTile(state: StationState, tileIndex: number): boolean {
  return isWalkable(state.tiles[tileIndex]) && !isForcedSingleTile(state, tileIndex);
}

function buildCapacityCache(state: StationState, buildCount: number): CapacityCache {
  const byEdge = new Map<string, MovementCrossSection>();
  const { width, height } = state;

  // Horizontal travel crosses a vertical cut. Consecutive usable rows are
  // real parallel lanes across that cut, independent of travel direction.
  for (let x = 0; x < width - 1; x += 1) {
    let y = 0;
    while (y < height) {
      const usable = (row: number): boolean => {
        const left = row * width + x;
        return isOrdinaryCapacityTile(state, left) && isOrdinaryCapacityTile(state, left + 1);
      };
      if (!usable(y)) {
        y += 1;
        continue;
      }
      const start = y;
      while (y + 1 < height && usable(y + 1)) y += 1;
      const end = y;
      const capacity = end - start + 1;
      const key = `horizontal:${x}:${start}-${end}`;
      for (let row = start; row <= end; row += 1) {
        const left = row * width + x;
        byEdge.set(edgeKey(left, left + 1), {
          key,
          capacity,
          lane: row - start,
          axis: 'horizontal',
          forcedSingle: false
        });
      }
      y += 1;
    }
  }

  // Vertical travel crosses a horizontal cut. Consecutive usable columns are
  // the corresponding parallel lanes.
  for (let y = 0; y < height - 1; y += 1) {
    let x = 0;
    while (x < width) {
      const usable = (column: number): boolean => {
        const above = y * width + column;
        return isOrdinaryCapacityTile(state, above) && isOrdinaryCapacityTile(state, above + width);
      };
      if (!usable(x)) {
        x += 1;
        continue;
      }
      const start = x;
      while (x + 1 < width && usable(x + 1)) x += 1;
      const end = x;
      const capacity = end - start + 1;
      const key = `vertical:${y}:${start}-${end}`;
      for (let column = start; column <= end; column += 1) {
        const above = y * width + column;
        byEdge.set(edgeKey(above, above + width), {
          key,
          capacity,
          lane: column - start,
          axis: 'vertical',
          forcedSingle: false
        });
      }
      x += 1;
    }
  }

  // Give consecutive one-lane edges one shared physical choke identity. The
  // coordinator uses it only while opposed traffic is present, so a cohort
  // that has won the corridor does not alternate direction at every edge.
  for (let y = 0; y < height; y += 1) {
    let x = 0;
    while (x < width - 1) {
      const profile = byEdge.get(edgeKey(y * width + x, y * width + x + 1));
      if (!profile || profile.capacity !== 1 || profile.forcedSingle) {
        x += 1;
        continue;
      }
      const start = x;
      while (x + 1 < width - 1) {
        const next = byEdge.get(edgeKey(y * width + x + 1, y * width + x + 2));
        if (!next || next.capacity !== 1 || next.forcedSingle) break;
        x += 1;
      }
      const chokeKey = `choke-horizontal:${y}:${start}-${x + 1}`;
      for (let edgeX = start; edgeX <= x; edgeX += 1) {
        const edge = byEdge.get(edgeKey(y * width + edgeX, y * width + edgeX + 1));
        if (edge) edge.key = chokeKey;
      }
      x += 1;
    }
  }
  for (let x = 0; x < width; x += 1) {
    let y = 0;
    while (y < height - 1) {
      const profile = byEdge.get(edgeKey(y * width + x, (y + 1) * width + x));
      if (!profile || profile.capacity !== 1 || profile.forcedSingle) {
        y += 1;
        continue;
      }
      const start = y;
      while (y + 1 < height - 1) {
        const next = byEdge.get(edgeKey((y + 1) * width + x, (y + 2) * width + x));
        if (!next || next.capacity !== 1 || next.forcedSingle) break;
        y += 1;
      }
      const chokeKey = `choke-vertical:${x}:${start}-${y + 1}`;
      for (let edgeY = start; edgeY <= y; edgeY += 1) {
        const edge = byEdge.get(edgeKey(edgeY * width + x, (edgeY + 1) * width + x));
        if (edge) edge.key = chokeKey;
      }
      y += 1;
    }
  }

  return { version: versionFor(state), buildCount, byEdge };
}

function capacityCache(state: StationState): CapacityCache {
  const version = versionFor(state);
  const cached = capacityCacheByState.get(state);
  if (cached?.version === version) return cached;
  const rebuilt = buildCapacityCache(state, (cached?.buildCount ?? 0) + 1);
  capacityCacheByState.set(state, rebuilt);
  return rebuilt;
}

export function movementCrossSection(state: StationState, origin: number, target: number): MovementCrossSection {
  const delta = target - origin;
  const axis = Math.abs(delta) === 1 ? 'horizontal' : 'vertical';
  const forcedSingle =
    Math.abs(delta) !== 1 && Math.abs(delta) !== state.width ||
    isForcedSingleTile(state, origin) ||
    isForcedSingleTile(state, target);
  if (forcedSingle) {
    return {
      key: `single:${edgeKey(origin, target)}`,
      capacity: 1,
      lane: 0,
      axis,
      forcedSingle: true
    };
  }
  return capacityCache(state).byEdge.get(edgeKey(origin, target)) ?? {
    key: `single:${edgeKey(origin, target)}`,
    capacity: 1,
    lane: 0,
    axis,
    forcedSingle: false
  };
}

/** A modest preference only; occupancy and topology remain the actual rules. */
export function movementCapacityRoutePenalty(state: StationState, origin: number, target: number): number {
  const section = movementCrossSection(state, origin, target);
  if (section.forcedSingle) return 0;
  if (section.capacity <= 1) return 0.35;
  if (section.capacity === 2) return 0.05;
  return 0;
}

/** Focused evidence hook: lets tests prove versioned invalidation without durable state. */
export function movementCapacityCacheBuildCount(state: StationState): number {
  return capacityCache(state).buildCount;
}
