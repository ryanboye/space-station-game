import {
  TileType,
  ModuleType,
  RoomType,
  fromIndex,
  inBounds,
  toIndex,
  type PlaceableStructuralPieceKind,
  type StationState
} from './types';
import { BERTH_SIZE_MIN } from './balance';

export const MAX_TRUSS_SPAN = 6;

export type StructuralPieceKind = 'truss' | 'junction' | 'reinforced-bulkhead';
export type StructuralLoadKind = 'small' | 'medium' | 'heavy';

export interface ProposedStructuralPiece {
  tile: number;
  kind: StructuralPieceKind;
}

export function structuralPieceDimensions(
  kind: PlaceableStructuralPieceKind,
  rotation: number
): { width: number; height: number } {
  if (kind === 'junction') return { width: 1, height: 1 };
  return Math.abs(rotation % 180) === 90 ? { width: 1, height: 2 } : { width: 2, height: 1 };
}

export function structuralPieceTiles(
  state: Pick<StationState, 'width' | 'height'>,
  originTile: number,
  kind: PlaceableStructuralPieceKind,
  rotation: number
): number[] {
  if (originTile < 0 || originTile >= state.width * state.height) return [];
  const origin = fromIndex(originTile, state.width);
  const size = structuralPieceDimensions(kind, rotation);
  const tiles: number[] = [];
  for (let dy = 0; dy < size.height; dy++) {
    for (let dx = 0; dx < size.width; dx++) {
      const x = origin.x + dx;
      const y = origin.y + dy;
      if (!inBounds(x, y, state.width, state.height)) return [];
      tiles.push(toIndex(x, y, state.width));
    }
  }
  return tiles;
}

export interface StructuralInterfaceLoad {
  tile: number;
  kind: StructuralLoadKind;
}

/** Actual built frontage interfaces, never forecast/demo load tokens. */
export function deriveStructuralInterfaceLoads(state: StationState): StructuralInterfaceLoad[] {
  const loads: StructuralInterfaceLoad[] = state.moduleInstances
    .filter((module) => module.type === ModuleType.PodDock)
    .map((module) => ({ tile: module.originTile, kind: 'small' as const }));
  const visited = new Set<number>();
  for (let start = 0; start < state.rooms.length; start++) {
    if (visited.has(start) || state.rooms[start] !== RoomType.Berth) continue;
    const cluster: number[] = [];
    const queue = [start];
    visited.add(start);
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const tile = queue[cursor]!;
      cluster.push(tile);
      for (const neighbor of neighboringTiles(tile, state.width, state.height)) {
        if (visited.has(neighbor) || state.rooms[neighbor] !== RoomType.Berth) continue;
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
    const clusterSet = new Set(cluster);
    const clamps = state.moduleInstances
      .filter((module) => module.type === ModuleType.DockingClamp && module.tiles.some((tile) => clusterSet.has(tile)))
      .sort((left, right) => left.originTile - right.originTile);
    if (clamps.length < 2) continue;
    const heavy = cluster.length >= BERTH_SIZE_MIN.large && clamps.length >= 5;
    loads.push({ tile: clamps[0]!.originTile, kind: heavy ? 'heavy' : 'medium' });
  }
  return loads.sort((left, right) => left.tile - right.tile || left.kind.localeCompare(right.kind));
}

export function validateLiveStructuralInterfaces(state: StationState): StructuralSupportValidation {
  return validateStructuralSupportPlan(state, [], deriveStructuralInterfaceLoads(state));
}

/** Attribute real support failures to the nearest relevant completed transfer piece. */
export function overloadedStructuralPieceIds(
  state: StationState,
  validation: StructuralSupportValidation = validateLiveStructuralInterfaces(state)
): Set<number> {
  const overloaded = new Set<number>();
  const completed = state.structuralPieces.filter((piece) => piece.completed);
  const distance = (tile: number, piece: StationState['structuralPieces'][number]): number => {
    const from = fromIndex(tile, state.width);
    return Math.min(...piece.tiles.map((candidate) => {
      const to = fromIndex(candidate, state.width);
      return Math.abs(from.x - to.x) + Math.abs(from.y - to.y);
    }));
  };
  for (const problem of validation.problems) {
    for (const piece of completed) {
      if (piece.tiles.includes(problem.tile)) overloaded.add(piece.id);
    }
    const requiredKind = problem.reason === 'heavy-load-requires-reinforced-transfer'
      ? 'reinforced-bulkhead'
      : problem.reason === 'medium-load-requires-junction'
        ? 'junction'
        : null;
    if (!requiredKind) continue;
    const nearest = completed
      .filter((piece) => piece.kind === requiredKind)
      .sort((left, right) => distance(problem.tile, left) - distance(problem.tile, right) || left.id - right.id)[0];
    if (nearest) overloaded.add(nearest.id);
  }
  return overloaded;
}

export type StructuralSupportReason =
  | 'piece-out-of-bounds'
  | 'piece-overlaps-hull'
  | 'duplicate-piece'
  | 'disconnected-support'
  | 'span-exceeded'
  | 'branch-requires-junction'
  | 'load-has-no-supported-path'
  | 'medium-load-requires-junction'
  | 'heavy-load-requires-reinforced-transfer';

export interface StructuralSupportProblem {
  tile: number;
  reason: StructuralSupportReason;
}

export type StructuralNodeKind = 'root' | 'expansion-hull' | StructuralPieceKind;

export interface StructuralSupportNode {
  tile: number;
  kind: StructuralNodeKind;
  existing: boolean;
}

export interface StructuralSupportGraph {
  nodes: readonly StructuralSupportNode[];
  rootTiles: readonly number[];
  adjacency: ReadonlyMap<number, readonly number[]>;
  width: number;
  height: number;
}

export interface StructuralSupportValidation {
  ok: boolean;
  graph: StructuralSupportGraph;
  problems: readonly StructuralSupportProblem[];
}

interface GraphBuild {
  graph: StructuralSupportGraph;
  problems: StructuralSupportProblem[];
}

export interface StructuralSupportCacheStats {
  topologyVersion: number;
  entries: number;
  hits: number;
  builds: number;
}

interface StructuralSupportCacheEntry extends StructuralSupportCacheStats {
  width: number;
  height: number;
  graphs: Map<string, GraphBuild>;
}

const MAX_CACHED_PLANS_PER_STATE = 32;
const structuralSupportCache = new WeakMap<StationState, StructuralSupportCacheEntry>();

const CARDINAL_OFFSETS = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 }
] as const;

/**
 * Builds a planning-time support graph. Legacy hull is grandfathered as root,
 * while tiles authored by a durable commissioned expansion retain their
 * construction provenance and must transfer load back to that original hull.
 */
export function buildStructuralSupportGraph(
  state: StationState,
  proposedPieces: readonly ProposedStructuralPiece[] = []
): StructuralSupportGraph {
  return cachedGraphBuild(state, proposedPieces, true).graph;
}

export function validateStructuralSupportPlan(
  state: StationState,
  proposedPieces: readonly ProposedStructuralPiece[] = [],
  loads: readonly StructuralInterfaceLoad[] = []
): StructuralSupportValidation {
  // Durable pieces under construction appear in the planning graph, but only
  // completed pieces may satisfy live branch/span/load validation.
  const built = cachedGraphBuild(state, proposedPieces, false);
  const graph = built.graph;
  // Validation appends load/reachability findings. Keep the cached graph-build
  // result immutable so one query can never contaminate a later query.
  const problems = [...built.problems];
  const nodeByTile = new Map(graph.nodes.map((node) => [node.tile, node]));
  const reachable = reachableFromRoots(graph);

  for (const node of graph.nodes) {
    if (node.kind !== 'root' && !reachable.has(node.tile)) {
      problems.push({ tile: node.tile, reason: 'disconnected-support' });
    }
  }

  validateBranches(graph, nodeByTile, problems);
  validateSpans(graph, nodeByTile, problems);
  validateLoads(graph, nodeByTile, reachable, loads, problems);

  const sortedProblems = sortAndDedupeProblems(problems);
  return {
    ok: sortedProblems.length === 0,
    graph,
    problems: sortedProblems
  };
}

/** Focused diagnostic surface for proving cache invalidation behavior. */
export function getStructuralSupportCacheStats(state: StationState): StructuralSupportCacheStats {
  const cached = structuralSupportCache.get(state);
  return cached
    ? {
        topologyVersion: cached.topologyVersion,
        entries: cached.graphs.size,
        hits: cached.hits,
        builds: cached.builds
      }
    : { topologyVersion: state.topologyVersion, entries: 0, hits: 0, builds: 0 };
}

function cachedGraphBuild(
  state: StationState,
  proposedPieces: readonly ProposedStructuralPiece[],
  includePendingStatePieces: boolean
): GraphBuild {
  let cached = structuralSupportCache.get(state);
  if (
    !cached ||
    cached.topologyVersion !== state.topologyVersion ||
    cached.width !== state.width ||
    cached.height !== state.height
  ) {
    cached = {
      topologyVersion: state.topologyVersion,
      width: state.width,
      height: state.height,
      entries: 0,
      hits: 0,
      builds: 0,
      graphs: new Map()
    };
    structuralSupportCache.set(state, cached);
  }

  const key = `${includePendingStatePieces ? 'planning' : 'live'}|` + proposedPieces
    .map((piece) => `${piece.tile}:${piece.kind}`)
    .join('|');
  const hit = cached.graphs.get(key);
  if (hit) {
    cached.hits += 1;
    return hit;
  }

  const built = buildGraphUncached(state, proposedPieces, includePendingStatePieces);
  cached.builds += 1;
  if (cached.graphs.size >= MAX_CACHED_PLANS_PER_STATE) {
    const oldestKey = cached.graphs.keys().next().value as string | undefined;
    if (oldestKey !== undefined) cached.graphs.delete(oldestKey);
  }
  cached.graphs.set(key, built);
  cached.entries = cached.graphs.size;
  return built;
}

function buildGraphUncached(
  state: StationState,
  proposedPieces: readonly ProposedStructuralPiece[],
  includePendingStatePieces: boolean
): GraphBuild {
  const nodeByTile = new Map<number, StructuralSupportNode>();
  const problems: StructuralSupportProblem[] = [];
  const size = state.width * state.height;
  const rootTiles = new Set<number>();
  const commissionedExpansionTiles = new Set(
    state.structuralExpansionProjects
      .filter((project) => project.commissioned && !project.cancelled)
      .flatMap((project) => project.targets
        .filter((target) => target.tileIndex !== project.doorTile)
        .map((target) => target.tileIndex))
  );

  for (let tile = 0; tile < size; tile++) {
    const type = state.tiles[tile];
    if (type !== TileType.Space && type !== TileType.Truss) {
      if (commissionedExpansionTiles.has(tile)) {
        nodeByTile.set(tile, { tile, kind: 'expansion-hull', existing: true });
      } else {
        nodeByTile.set(tile, { tile, kind: 'root', existing: true });
        rootTiles.add(tile);
      }
    } else if (type === TileType.Truss) {
      nodeByTile.set(tile, { tile, kind: 'truss', existing: true });
    }
  }

  for (const piece of state.structuralPieces ?? []) {
    if (!piece.completed && !includePendingStatePieces) continue;
    for (const tile of piece.tiles) {
      if (!isInBounds(tile, size)) {
        problems.push({ tile, reason: 'piece-out-of-bounds' });
        continue;
      }
      nodeByTile.set(tile, {
        tile,
        kind: piece.kind,
        existing: piece.completed
      });
    }
  }

  const proposedByTile = new Map<number, ProposedStructuralPiece>();
  for (const piece of proposedPieces) {
    if (!isInBounds(piece.tile, size)) {
      problems.push({ tile: piece.tile, reason: 'piece-out-of-bounds' });
      continue;
    }
    if (proposedByTile.has(piece.tile)) {
      problems.push({ tile: piece.tile, reason: 'duplicate-piece' });
      continue;
    }
    if (state.tiles[piece.tile] !== TileType.Space && state.tiles[piece.tile] !== TileType.Truss) {
      problems.push({ tile: piece.tile, reason: 'piece-overlaps-hull' });
      continue;
    }
    proposedByTile.set(piece.tile, piece);
    nodeByTile.set(piece.tile, { tile: piece.tile, kind: piece.kind, existing: false });
  }

  const nodes = [...nodeByTile.values()].sort((left, right) => left.tile - right.tile);
  const adjacency = new Map<number, readonly number[]>();
  for (const node of nodes) {
    const neighbors = neighboringTiles(node.tile, state.width, state.height)
      .filter((tile) => nodeByTile.has(tile))
      .sort((left, right) => left - right);
    adjacency.set(node.tile, neighbors);
  }

  return {
    graph: {
      nodes,
      rootTiles: [...rootTiles].sort((left, right) => left - right),
      adjacency,
      width: state.width,
      height: state.height
    },
    problems
  };
}

function validateBranches(
  graph: StructuralSupportGraph,
  nodeByTile: ReadonlyMap<number, StructuralSupportNode>,
  problems: StructuralSupportProblem[]
): void {
  for (const node of graph.nodes) {
    // A reinforced bulkhead is itself the heavy hull transfer face. Its hull
    // half naturally touches several grandfathered root tiles; that is not a
    // scaffold branch and must not make every installed 2x1 transfer invalid.
    if (node.kind !== 'truss') continue;
    const degree = (graph.adjacency.get(node.tile) ?? []).length;
    if (degree > 2) problems.push({ tile: node.tile, reason: 'branch-requires-junction' });
  }
}

function validateSpans(
  graph: StructuralSupportGraph,
  nodeByTile: ReadonlyMap<number, StructuralSupportNode>,
  problems: StructuralSupportProblem[]
): void {
  const queue: Array<{ tile: number; trussCount: number }> = [];
  const bestCount = new Map<number, number>();

  for (const node of graph.nodes) {
    if (node.kind === 'root' || node.kind === 'junction') {
      queue.push({ tile: node.tile, trussCount: 0 });
      bestCount.set(node.tile, 0);
    }
  }

  for (let cursor = 0; cursor < queue.length; cursor++) {
    const current = queue[cursor];
    for (const neighbor of graph.adjacency.get(current.tile) ?? []) {
      const node = nodeByTile.get(neighbor);
      if (!node) continue;
      const nextCount = node.kind === 'truss'
        ? current.trussCount + 1
        : node.kind === 'root' || node.kind === 'junction'
          ? 0
          : current.trussCount;
      const priorCount = bestCount.get(neighbor);
      if (priorCount !== undefined && priorCount <= nextCount) continue;
      bestCount.set(neighbor, nextCount);
      queue.push({ tile: neighbor, trussCount: nextCount });
    }
  }

  for (const node of graph.nodes) {
    if (node.kind !== 'truss') continue;
    const trussCount = bestCount.get(node.tile);
    if (trussCount !== undefined && trussCount > MAX_TRUSS_SPAN) {
      problems.push({ tile: node.tile, reason: 'span-exceeded' });
    }
  }
}

function validateLoads(
  graph: StructuralSupportGraph,
  nodeByTile: ReadonlyMap<number, StructuralSupportNode>,
  reachable: ReadonlySet<number>,
  loads: readonly StructuralInterfaceLoad[],
  problems: StructuralSupportProblem[]
): void {
  for (const load of loads) {
    const anchors = loadAnchors(load.tile, graph, nodeByTile);
    const supportedAnchors = anchors.filter((tile) => reachable.has(tile));
    if (supportedAnchors.length === 0) {
      problems.push({ tile: load.tile, reason: 'load-has-no-supported-path' });
      continue;
    }
    if (load.kind === 'small') continue;
    // Pre-program hull predates explicit structural-piece accounting. Preserve
    // those interfaces as grandfathered; only commissioned frontage carries
    // the new transfer requirements.
    if (nodeByTile.get(load.tile)?.kind === 'root') continue;

    if (load.kind === 'medium') {
      const hasTransferPoint = supportedAnchors.some((tile) => {
        const node = nodeByTile.get(tile);
        return node?.kind === 'root' || node?.kind === 'junction';
      });
      if (!hasTransferPoint) problems.push({ tile: load.tile, reason: 'medium-load-requires-junction' });
      continue;
    }

    const hasReinforcedTransfer = supportedAnchors.some((anchor) => hasReinforcedPathToRoot(anchor, graph, nodeByTile));
    if (!hasReinforcedTransfer) {
      problems.push({ tile: load.tile, reason: 'heavy-load-requires-reinforced-transfer' });
    }
  }
}

function reachableFromRoots(graph: StructuralSupportGraph): Set<number> {
  const reachable = new Set<number>(graph.rootTiles);
  const queue = [...graph.rootTiles];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const tile = queue[cursor];
    for (const neighbor of graph.adjacency.get(tile) ?? []) {
      if (reachable.has(neighbor)) continue;
      reachable.add(neighbor);
      queue.push(neighbor);
    }
  }
  return reachable;
}

function loadAnchors(
  tile: number,
  graph: StructuralSupportGraph,
  nodeByTile: ReadonlyMap<number, StructuralSupportNode>
): number[] {
  return [tile, ...neighboringTiles(tile, graph.width, graph.height)]
    .filter((candidate) => nodeByTile.has(candidate))
    .sort((left, right) => left - right);
}

function hasReinforcedPathToRoot(
  anchor: number,
  graph: StructuralSupportGraph,
  nodeByTile: ReadonlyMap<number, StructuralSupportNode>
): boolean {
  const roots = new Set(graph.rootTiles);
  const queue: Array<{ tile: number; reinforced: boolean }> = [{
    tile: anchor,
    reinforced: nodeByTile.get(anchor)?.kind === 'reinforced-bulkhead'
  }];
  const visited = new Set<string>();

  for (let cursor = 0; cursor < queue.length; cursor++) {
    const current = queue[cursor];
    const key = `${current.tile}:${current.reinforced}`;
    if (visited.has(key)) continue;
    visited.add(key);
    if (roots.has(current.tile)) {
      if (current.reinforced) return true;
      // Never walk through grandfathered hull and discover an unrelated
      // Bulkhead elsewhere. Reinforcement must occur before the root transfer.
      continue;
    }
    for (const neighbor of graph.adjacency.get(current.tile) ?? []) {
      queue.push({
        tile: neighbor,
        reinforced: current.reinforced || nodeByTile.get(neighbor)?.kind === 'reinforced-bulkhead'
      });
    }
  }
  return false;
}

function neighboringTiles(tile: number, width: number, height: number): number[] {
  const x = tile % width;
  const y = Math.floor(tile / width);
  return CARDINAL_OFFSETS
    .map(({ x: offsetX, y: offsetY }) => ({ x: x + offsetX, y: y + offsetY }))
    .filter((point) => point.x >= 0 && point.y >= 0 && point.x < width && point.y < height)
    .map((point) => point.y * width + point.x);
}

function isInBounds(tile: number, size: number): boolean {
  return Number.isInteger(tile) && tile >= 0 && tile < size;
}

function sortAndDedupeProblems(problems: readonly StructuralSupportProblem[]): StructuralSupportProblem[] {
  const seen = new Set<string>();
  return [...problems]
    .sort((left, right) => left.tile - right.tile || left.reason.localeCompare(right.reason))
    .filter((problem) => {
      const key = `${problem.tile}:${problem.reason}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
