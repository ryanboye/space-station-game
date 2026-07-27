import { TileType, type StationState } from './types';

export const MAX_TRUSS_SPAN = 6;

export type StructuralPieceKind = 'truss' | 'junction' | 'reinforced-bulkhead';
export type StructuralLoadKind = 'small' | 'medium' | 'heavy';

export interface ProposedStructuralPiece {
  tile: number;
  kind: StructuralPieceKind;
}

export interface StructuralInterfaceLoad {
  tile: number;
  kind: StructuralLoadKind;
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

export type StructuralNodeKind = 'root' | StructuralPieceKind;

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

const CARDINAL_OFFSETS = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 }
] as const;

/**
 * Builds a planning-time support graph. Every pre-existing pressurized/hull
 * tile is grandfathered as a root because StationState does not yet record a
 * construction-era structural layer. New construction is represented only by
 * the supplied pieces and is never written back to StationState.
 */
export function buildStructuralSupportGraph(
  state: StationState,
  proposedPieces: readonly ProposedStructuralPiece[] = []
): StructuralSupportGraph {
  return buildGraph(state, proposedPieces).graph;
}

export function validateStructuralSupportPlan(
  state: StationState,
  proposedPieces: readonly ProposedStructuralPiece[] = [],
  loads: readonly StructuralInterfaceLoad[] = []
): StructuralSupportValidation {
  const built = buildGraph(state, proposedPieces);
  const { graph, problems } = built;
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

function buildGraph(state: StationState, proposedPieces: readonly ProposedStructuralPiece[]): GraphBuild {
  const nodeByTile = new Map<number, StructuralSupportNode>();
  const problems: StructuralSupportProblem[] = [];
  const size = state.width * state.height;

  for (let tile = 0; tile < size; tile++) {
    const type = state.tiles[tile];
    if (type !== TileType.Space && type !== TileType.Truss) {
      nodeByTile.set(tile, { tile, kind: 'root', existing: true });
    } else if (type === TileType.Truss) {
      nodeByTile.set(tile, { tile, kind: 'truss', existing: true });
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
      rootTiles: nodes.filter((node) => node.kind === 'root').map((node) => node.tile),
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
    if (node.kind !== 'truss' && node.kind !== 'reinforced-bulkhead') continue;
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
    if (current.reinforced && nodeByTile.get(current.tile)?.kind === 'root') return true;
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
