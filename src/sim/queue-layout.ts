/**
 * Pure physical queue-space planner.
 *
 * The simulation owns demand and topology. This module only answers which
 * floor tiles may safely become visible waiting places. Queue occupancy is
 * treated as solid while checking circulation. A bad layout may visibly spill
 * across a door or choke and hurt throughput; only an explicit circulation
 * requirement prevents it from consuming the last required escape route.
 */

export type QueueTile = {
  tile: number;
  neighbors: readonly number[];
  room: string;
  walkable: boolean;
  moduleBlocked?: boolean;
  /** Doors are late/high-risk waiting places, but remain physically usable. */
  door?: boolean;
  /** Stable choke identity derived from the movement-capacity layer. */
  narrowSection?: string | null;
  /** Larger values win ties at the same room/distance tier (for wall hugging). */
  queuePreference?: number;
};

export type QueueProviderRequest = {
  key: string;
  servingTile: number;
  room: string;
  requestedDemand: number;
  /** Optional prefiltered access tiles beside a fixture or service slot. */
  headCandidates?: readonly number[];
};

export type QueueCirculationRequirement = {
  key: string;
  from: number;
  /** At least one destination must remain reachable while every slot is full. */
  toAny: readonly number[];
};

export type QueueLayoutInput = {
  tiles: readonly QueueTile[];
  providers: readonly QueueProviderRequest[];
  circulation?: readonly QueueCirculationRequirement[];
};

export type QueueAllocationStep = {
  providerKey: string;
  tile: number;
};

export type QueueLayoutPlan = {
  allocationsByProvider: ReadonlyMap<string, readonly number[]>;
  unallocatedByProvider: ReadonlyMap<string, number>;
  /** Fair-allocation order; useful for diagnostics and deterministic evidence. */
  allocationOrder: readonly QueueAllocationStep[];
  /** Explicit route endpoints plus dynamically rejected last-route tiles. */
  protectedCirculationTiles: ReadonlySet<number>;
};

type Candidate = {
  tile: number;
  distance: number;
  inProviderRoom: boolean;
  preference: number;
  circulationRisk: boolean;
};

function demandOf(provider: QueueProviderRequest): number {
  return Math.max(0, Math.floor(Number.isFinite(provider.requestedDemand) ? provider.requestedDemand : 0));
}

function normalizedGraph(tiles: readonly QueueTile[]): {
  byTile: Map<number, QueueTile>;
  neighbors: Map<number, number[]>;
} {
  const byTile = new Map<number, QueueTile>();
  for (const tile of [...tiles].sort((a, b) => a.tile - b.tile)) {
    if (!byTile.has(tile.tile)) byTile.set(tile.tile, tile);
  }
  const linkedByTile = new Map<number, Set<number>>();
  for (const tile of byTile.keys()) linkedByTile.set(tile, new Set());
  for (const tile of byTile.values()) {
    for (const candidate of tile.neighbors) {
      if (candidate === tile.tile || !byTile.has(candidate)) continue;
      // Treat the input as an undirected floor graph even when a caller emits
      // each grid edge from only one endpoint.
      linkedByTile.get(tile.tile)!.add(candidate);
      linkedByTile.get(candidate)!.add(tile.tile);
    }
  }
  const neighbors = new Map<number, number[]>();
  for (const [tile, linked] of linkedByTile) neighbors.set(tile, [...linked].sort((a, b) => a - b));
  return { byTile, neighbors };
}

function traversable(tile: QueueTile | undefined): boolean {
  return tile?.walkable === true && tile.moduleBlocked !== true;
}

function candidatesFor(
  provider: QueueProviderRequest,
  byTile: ReadonlyMap<number, QueueTile>,
  neighbors: ReadonlyMap<number, readonly number[]>,
  servingTiles: ReadonlySet<number>
): Candidate[] {
  const explicitHeads = provider.headCandidates?.filter((tile) => traversable(byTile.get(tile)));
  const starts = [...new Set(explicitHeads?.length
    ? explicitHeads
    : (neighbors.get(provider.servingTile) ?? []).filter((tile) => traversable(byTile.get(tile))))]
    .sort((a, b) => a - b);
  const distance = new Map<number, number>();
  const pending: number[] = [];
  for (const start of starts) {
    distance.set(start, 0);
    pending.push(start);
  }
  for (let cursor = 0; cursor < pending.length; cursor += 1) {
    const current = pending[cursor];
    const nextDistance = (distance.get(current) ?? 0) + 1;
    for (const next of neighbors.get(current) ?? []) {
      if (distance.has(next) || !traversable(byTile.get(next))) continue;
      distance.set(next, nextDistance);
      pending.push(next);
    }
  }
  return [...distance.entries()]
    .filter(([tile]) => !servingTiles.has(tile))
    .map(([tile, tileDistance]) => {
      const metadata = byTile.get(tile)!;
      return {
        tile,
        distance: tileDistance,
        inProviderRoom: metadata.room === provider.room,
        preference: metadata.queuePreference ?? 0,
        circulationRisk: metadata.door === true || !!metadata.narrowSection
      };
    })
    .sort((a, b) =>
      Number(b.inProviderRoom) - Number(a.inProviderRoom) ||
      (a.distance + (a.circulationRisk ? 4 : 0)) - (b.distance + (b.circulationRisk ? 4 : 0)) ||
      Number(a.circulationRisk) - Number(b.circulationRisk) ||
      b.preference - a.preference ||
      a.tile - b.tile
    );
}

function requirementStillOpen(
  requirement: QueueCirculationRequirement,
  blocked: ReadonlySet<number>,
  byTile: ReadonlyMap<number, QueueTile>,
  neighbors: ReadonlyMap<number, readonly number[]>
): boolean {
  if (blocked.has(requirement.from) || !traversable(byTile.get(requirement.from))) return false;
  const destinations = new Set(requirement.toAny.filter((tile) => !blocked.has(tile) && traversable(byTile.get(tile))));
  if (destinations.size === 0) return false;
  if (destinations.has(requirement.from)) return true;
  const visited = new Set<number>([requirement.from]);
  const pending = [requirement.from];
  for (let cursor = 0; cursor < pending.length; cursor += 1) {
    for (const next of neighbors.get(pending[cursor]) ?? []) {
      if (visited.has(next) || blocked.has(next) || !traversable(byTile.get(next))) continue;
      if (destinations.has(next)) return true;
      visited.add(next);
      pending.push(next);
    }
  }
  return false;
}

/**
 * Allocate one place per provider per round. Providers are keyed and sorted,
 * so reversing discovery order cannot change their result. Geometry and live
 * demand are the only bounds; excess demand is reported, never hidden behind
 * a universal line-length cap.
 */
export function planQueueLayout(input: QueueLayoutInput): QueueLayoutPlan {
  const { byTile, neighbors } = normalizedGraph(input.tiles);
  const providers = [...input.providers]
    .filter((provider, index, all) => all.findIndex((candidate) => candidate.key === provider.key) === index)
    .sort((a, b) => a.key.localeCompare(b.key));
  const requirements = [...(input.circulation ?? [])].sort((a, b) => a.key.localeCompare(b.key));
  const servingTiles = new Set(providers.map((provider) => provider.servingTile));
  const fixedProtected = new Set<number>();
  for (const requirement of requirements) {
    fixedProtected.add(requirement.from);
  }

  const allocations = new Map<string, number[]>();
  const requested = new Map<string, number>();
  const candidates = new Map<string, Candidate[]>();
  for (const provider of providers) {
    allocations.set(provider.key, []);
    requested.set(provider.key, demandOf(provider));
    candidates.set(provider.key, candidatesFor(provider, byTile, neighbors, servingTiles));
  }

  const claimed = new Set<number>();
  const dynamicallyProtected = new Set<number>();
  const allocationOrder: QueueAllocationStep[] = [];
  let madeProgress = true;
  while (madeProgress) {
    madeProgress = false;
    for (const provider of providers) {
      const result = allocations.get(provider.key)!;
      if (result.length >= (requested.get(provider.key) ?? 0)) continue;
      let selected: number | null = null;
      for (const candidate of candidates.get(provider.key) ?? []) {
        const tile = byTile.get(candidate.tile);
        if (!traversable(tile) || claimed.has(candidate.tile) || fixedProtected.has(candidate.tile)) continue;
        const growsFromOwnFrontier = result.length === 0
          ? candidate.distance === 0
          : (neighbors.get(candidate.tile) ?? []).some((neighbor) => result.includes(neighbor));
        if (!growsFromOwnFrontier) continue;
        const withCandidate = new Set(claimed);
        withCandidate.add(candidate.tile);
        if (!requirements.every((requirement) => requirementStillOpen(requirement, withCandidate, byTile, neighbors))) {
          dynamicallyProtected.add(candidate.tile);
          continue;
        }
        selected = candidate.tile;
        break;
      }
      if (selected === null) continue;
      claimed.add(selected);
      result.push(selected);
      allocationOrder.push({ providerKey: provider.key, tile: selected });
      madeProgress = true;
    }
  }

  const unallocated = new Map<string, number>();
  for (const provider of providers) {
    unallocated.set(provider.key, Math.max(0, (requested.get(provider.key) ?? 0) - allocations.get(provider.key)!.length));
  }
  return {
    allocationsByProvider: allocations,
    unallocatedByProvider: unallocated,
    allocationOrder,
    protectedCirculationTiles: new Set([...fixedProtected, ...dynamicallyProtected])
  };
}
