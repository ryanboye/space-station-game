import { createInitialState } from '../src/sim/sim';
import {
  MAX_TRUSS_SPAN,
  buildStructuralSupportGraph,
  getStructuralSupportCacheStats,
  validateStructuralSupportPlan,
  type ProposedStructuralPiece,
  type StructuralSupportReason
} from '../src/sim/structural-support';
import { TileType, toIndex } from '../src/sim/types';

function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function hasReason(
  result: ReturnType<typeof validateStructuralSupportPlan>,
  reason: StructuralSupportReason,
  tile?: number
): boolean {
  return result.problems.some((problem) => problem.reason === reason && (tile === undefined || problem.tile === tile));
}

function exteriorAnchor(state: ReturnType<typeof createInitialState>): { x: number; y: number } {
  for (let y = 1; y < state.height - 1; y++) {
    for (let x = 1; x < state.width - MAX_TRUSS_SPAN - 2; x++) {
      const root = toIndex(x, y, state.width);
      if (state.tiles[root] === TileType.Space || state.tiles[root] === TileType.Truss) continue;
      let clear = true;
      for (let offset = 1; offset <= MAX_TRUSS_SPAN + 1; offset++) {
        if (state.tiles[toIndex(x + offset, y, state.width)] !== TileType.Space) clear = false;
      }
      if (clear) return { x, y };
    }
  }
  throw new Error('Could not find a clear starter-hull expansion edge.');
}

function run(state: ReturnType<typeof createInitialState>, pieces: readonly ProposedStructuralPiece[]) {
  return validateStructuralSupportPlan(state, pieces);
}

const state = createInitialState({ seed: 73001 });
const before = {
  tiles: [...state.tiles],
  modules: [...state.modules],
  rooms: [...state.rooms],
  tilesRef: state.tiles,
  modulesRef: state.modules,
  roomsRef: state.rooms
};
const { x, y } = exteriorAnchor(state);
const at = (offsetX: number, offsetY = 0) => toIndex(x + offsetX, y + offsetY, state.width);

const starter = run(state, []);
assertCondition(starter.ok, 'Existing starter hull should be grandfathered as supported.');
const starterGraph = buildStructuralSupportGraph(state);
assertCondition(starterGraph.rootTiles.length > 0, 'Starter hull should produce support roots.');
const cacheBeforeRepeat = getStructuralSupportCacheStats(state);
const repeatedStarterGraph = buildStructuralSupportGraph(state);
const cacheAfterRepeat = getStructuralSupportCacheStats(state);
assertCondition(repeatedStarterGraph === starterGraph, 'An unchanged topology must reuse the structural graph object.');
assertCondition(
  cacheAfterRepeat.builds === cacheBeforeRepeat.builds && cacheAfterRepeat.hits === cacheBeforeRepeat.hits + 1,
  'An unchanged topology must be a cache hit without another graph build.'
);

state.now += 10;
state.moduleVersion += 1;
state.roomVersion += 1;
const afterUnrelatedMutations = buildStructuralSupportGraph(state);
assertCondition(
  afterUnrelatedMutations === starterGraph,
  'Time, module, and room mutations must not rebuild the topology-only support graph.'
);

const topologyBuildsBefore = getStructuralSupportCacheStats(state).builds;
state.topologyVersion += 1;
const afterTopologyMutation = buildStructuralSupportGraph(state);
const cacheAfterTopologyMutation = getStructuralSupportCacheStats(state);
assertCondition(afterTopologyMutation !== starterGraph, 'A topology mutation must invalidate the structural graph.');
assertCondition(
  cacheAfterTopologyMutation.builds === 1 && cacheAfterTopologyMutation.topologyVersion === state.topologyVersion,
  `A topology mutation must rebuild exactly once (previous cache had ${topologyBuildsBefore} builds).`
);

const shortRun: ProposedStructuralPiece[] = [
  { tile: at(1), kind: 'truss' },
  { tile: at(2), kind: 'truss' },
  { tile: at(3), kind: 'truss' }
];
assertCondition(run(state, shortRun).ok, 'A short truss extension connected to the hull should be legal.');
const shortGraph = buildStructuralSupportGraph(state, shortRun);
assertCondition(
  buildStructuralSupportGraph(state, shortRun) === shortGraph,
  'An unchanged proposed support plan must reuse its cached graph.'
);
assertCondition(
  validateStructuralSupportPlan(state, shortRun, [{ tile: at(3), kind: 'small' }]).ok,
  'A small load should work on an ordinary supported truss run.'
);

const disconnected = run(state, [{ tile: at(12, 8), kind: 'truss' }]);
assertCondition(hasReason(disconnected, 'disconnected-support', at(12, 8)), 'A disconnected truss should be rejected.');

const longRun = Array.from({ length: MAX_TRUSS_SPAN + 1 }, (_, index) => ({ tile: at(index + 1), kind: 'truss' as const }));
const seventhTile = at(MAX_TRUSS_SPAN + 1);
assertCondition(hasReason(run(state, longRun), 'span-exceeded', seventhTile), 'The seventh unsupported span tile should be rejected.');

const branchTile = at(3);
const branchWithoutJunction: ProposedStructuralPiece[] = [
  { tile: at(1), kind: 'truss' },
  { tile: at(2), kind: 'truss' },
  { tile: branchTile, kind: 'truss' },
  { tile: at(4), kind: 'truss' },
  { tile: at(3, 1), kind: 'truss' }
];
assertCondition(
  hasReason(run(state, branchWithoutJunction), 'branch-requires-junction', branchTile),
  'A branch must originate at a root or junction.'
);
const branchWithJunction = branchWithoutJunction.map((piece) => piece.tile === branchTile ? { ...piece, kind: 'junction' as const } : piece);
assertCondition(run(state, branchWithJunction).ok, 'A proposed junction should legalize a branch.');

const transferBase: ProposedStructuralPiece[] = [
  { tile: at(1), kind: 'truss' },
  { tile: at(2), kind: 'junction' }
];
const medium = validateStructuralSupportPlan(state, transferBase, [{ tile: at(2), kind: 'medium' }]);
assertCondition(medium.ok, 'A medium load should work at a nearby junction.');
const heavyWithoutReinforcement = validateStructuralSupportPlan(state, transferBase, [{ tile: at(2), kind: 'heavy' }]);
assertCondition(
  hasReason(heavyWithoutReinforcement, 'heavy-load-requires-reinforced-transfer', at(2)),
  'A heavy load must not use an ordinary junction-only transfer.'
);
const reinforcedTransfer: ProposedStructuralPiece[] = [
  { tile: at(1), kind: 'reinforced-bulkhead' },
  { tile: at(2), kind: 'junction' }
];
const heavyWithReinforcement = validateStructuralSupportPlan(state, reinforcedTransfer, [{ tile: at(2), kind: 'heavy' }]);
assertCondition(heavyWithReinforcement.ok, 'A heavy load should work only through a reinforced transfer to the rooted hull.');

assertCondition(state.tiles === before.tilesRef && state.modules === before.modulesRef && state.rooms === before.roomsRef, 'Structural planning must not replace StationState arrays.');
assertCondition(
  state.tiles.every((tile, index) => tile === before.tiles[index]) &&
    state.modules.every((module, index) => module === before.modules[index]) &&
    state.rooms.every((room, index) => room === before.rooms[index]),
  'Structural planning must not mutate StationState contents.'
);

console.log('structural-support-tests: PASS');
