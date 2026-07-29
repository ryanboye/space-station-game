import { createInitialState, findPath, runMovementCoordinatorTestTick, tick } from '../src/sim/sim';
import { movementCapacityCacheBuildCount, movementCrossSection } from '../src/sim/movement-capacity';
import { ModuleType, TileType, type CrewMember, type StationState } from '../src/sim/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function at(state: StationState, x: number, y: number): number {
  return y * state.width + x;
}

function placeCrew(state: StationState, id: number, tileIndex: number): CrewMember {
  const template = state.crewMembers[0];
  assert(template, 'Expected a starter crew template.');
  const crew = structuredClone(template) as CrewMember;
  crew.id = id;
  crew.tileIndex = tileIndex;
  crew.x = (tileIndex % state.width) + 0.5;
  crew.y = Math.floor(tileIndex / state.width) + 0.5;
  crew.path = [];
  crew.speed = 10;
  crew.blockedTicks = 0;
  crew.targetTile = null;
  crew.carryingItemType = null;
  crew.carryingAmount = 0;
  crew.movementWaitReason = undefined;
  crew.movementReplanCooldownUntil = 0;
  return crew;
}

function emptyStation(): StationState {
  const state = createInitialState({ seed: 8787, physicalStarterInventory: true });
  tick(state, 0);
  state.tiles.fill(TileType.Wall);
  state.modules.fill(ModuleType.None);
  state.moduleOccupancyByTile.fill(null);
  state.residents = [];
  state.visitors = [];
  state.topologyVersion += 1;
  state.moduleVersion += 1;
  state.derived.pathCache.clear();
  return state;
}

function testCrossSectionDerivationAndInvalidation(): void {
  const state = emptyStation();
  const left = at(state, 10, 10);
  const right = at(state, 11, 10);
  state.tiles[left] = TileType.Floor;
  state.tiles[right] = TileType.Floor;
  state.topologyVersion += 1;
  assert(movementCrossSection(state, left, right).capacity === 1, 'A single walkable row must derive one lane.');
  const firstBuild = movementCapacityCacheBuildCount(state);

  state.tiles[at(state, 10, 11)] = TileType.Floor;
  state.tiles[at(state, 11, 11)] = TileType.Floor;
  assert(
    movementCrossSection(state, left, right).capacity === 1,
    'The cached cross-section must remain stable until the topology version changes.'
  );
  state.topologyVersion += 1;
  assert(movementCrossSection(state, left, right).capacity === 2, 'A topology version change must expose the second physical lane.');
  assert(movementCapacityCacheBuildCount(state) === firstBuild + 1, 'Topology invalidation must rebuild exactly once.');

  state.moduleOccupancyByTile[right] = 77;
  state.moduleVersion += 1;
  const moduleEdge = movementCrossSection(state, left, right);
  assert(moduleEdge.capacity === 1 && moduleEdge.forcedSingle, 'A module edge must serialize even beside open floor.');
  assert(movementCapacityCacheBuildCount(state) === firstBuild + 2, 'Module invalidation must rebuild the capacity cache.');

  state.moduleOccupancyByTile[right] = null;
  state.tiles[right] = TileType.Door;
  state.moduleVersion += 1;
  state.topologyVersion += 1;
  assert(movementCrossSection(state, left, right).forcedSingle, 'Doors must remain explicit single crossings.');
  state.tiles[right] = TileType.Airlock;
  state.topologyVersion += 1;
  assert(movementCrossSection(state, left, right).forcedSingle, 'Airlocks must remain explicit single crossings.');
}

type CorridorRun = {
  completed: number;
  completionTicks: number[];
  capacityWaits: number;
  maxBlockedTicks: number;
  maxOccupancy: number;
  drainedAt: number | null;
};

function paintCorridor(state: StationState, laneCount: 1 | 2): void {
  // Identical seven-tile passage, with matching three-deep staging rooms.
  for (let y = 19; y <= 22; y += 1) {
    for (let x = 17; x <= 19; x += 1) state.tiles[at(state, x, y)] = TileType.Floor;
    for (let x = 27; x <= 29; x += 1) state.tiles[at(state, x, y)] = TileType.Floor;
  }
  for (let x = 20; x <= 26; x += 1) {
    state.tiles[at(state, x, 20)] = TileType.Floor;
    if (laneCount === 2) state.tiles[at(state, x, 21)] = TileType.Floor;
  }
  state.topologyVersion += 1;
}

function occupancyFor(state: StationState): Map<number, number> {
  const occupancy = new Map<number, number>();
  for (const crew of state.crewMembers) occupancy.set(crew.tileIndex, (occupancy.get(crew.tileIndex) ?? 0) + 1);
  return occupancy;
}

function runOpposedCohorts(laneCount: 1 | 2, reverseActors: boolean, horizon = 80): CorridorRun {
  const state = emptyStation();
  paintCorridor(state, laneCount);
  const leftStarts = [at(state, 17, 19), at(state, 17, 20), at(state, 17, 21)];
  const rightStarts = [at(state, 29, 19), at(state, 29, 20), at(state, 29, 21)];
  const goalById = new Map<number, number>();
  const crew: CrewMember[] = [];
  for (let index = 0; index < 3; index += 1) {
    const eastbound = placeCrew(state, index + 1, leftStarts[index]);
    const westbound = placeCrew(state, index + 11, rightStarts[index]);
    crew.push(eastbound, westbound);
    goalById.set(eastbound.id, at(state, 27, 20));
    goalById.set(westbound.id, at(state, 19, 20));
  }
  state.crewMembers = reverseActors ? crew.reverse() : crew;
  const completionTicks: number[] = [];
  let capacityWaits = 0;
  let maxBlockedTicks = 0;
  let maxOccupancy = 0;
  let drainedAt: number | null = null;

  for (let step = 1; step <= horizon && state.crewMembers.length > 0; step += 1) {
    const occupancy = occupancyFor(state);
    for (const actor of state.crewMembers) {
      const goal = goalById.get(actor.id)!;
      if (actor.tileIndex === goal || actor.path.length > 0) continue;
      const path = findPath(
        state,
        actor.tileIndex,
        goal,
        { allowRestricted: true, intent: 'crew', routeSeed: actor.id * 97 },
        occupancy
      );
      actor.path = path ?? [];
    }
    runMovementCoordinatorTestTick(state, 0.2, reverseActors);
    for (const actor of state.crewMembers) {
      if (actor.movementWaitReason === 'opposing traffic in narrow corridor') capacityWaits += 1;
      maxBlockedTicks = Math.max(maxBlockedTicks, actor.blockedTicks);
    }
    const counts = occupancyFor(state);
    maxOccupancy = Math.max(maxOccupancy, ...counts.values());
    assert([...counts.values()].every((count) => count <= 1), `No tile may hold two actors (lane count ${laneCount}, tick ${step}).`);
    const finished = state.crewMembers.filter((actor) => actor.tileIndex === goalById.get(actor.id));
    for (const actor of finished) completionTicks.push(step);
    if (finished.length > 0) {
      const finishedIds = new Set(finished.map((actor) => actor.id));
      state.crewMembers = state.crewMembers.filter((actor) => !finishedIds.has(actor.id));
    }
    state.now += 0.2;
    if (state.crewMembers.length === 0) drainedAt = step;
  }
  return { completed: completionTicks.length, completionTicks, capacityWaits, maxBlockedTicks, maxOccupancy, drainedAt };
}

function median(values: number[]): number {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered.length % 2 === 0
    ? (ordered[ordered.length / 2 - 1] + ordered[ordered.length / 2]) / 2
    : ordered[Math.floor(ordered.length / 2)];
}

function testOpposedCohortCapacityAndDeterminism(): void {
  const narrow = runOpposedCohorts(1, false);
  const narrowReversed = runOpposedCohorts(1, true);
  const wide = runOpposedCohorts(2, false);
  const wideReversed = runOpposedCohorts(2, true);
  assert(narrow.capacityWaits > 0, 'The one-tile corridor must expose opposing-capacity waits.');
  assert(narrow.maxBlockedTicks >= 2, 'The narrow queue must remain visible for multiple ticks.');
  assert(narrow.drainedAt !== null && narrow.drainedAt <= 80, 'The narrow corridor must recover and drain without starvation.');
  assert(wide.drainedAt !== null, 'The two-lane concourse must drain.');
  assert(
    wide.drainedAt! * 1.5 <= narrow.drainedAt! || median(wide.completionTicks) + 3 <= median(narrow.completionTicks),
    `The two-lane concourse must materially outperform the choke (narrow ${narrow.drainedAt}, wide ${wide.drainedAt}).`
  );
  assert(JSON.stringify(narrow) === JSON.stringify(narrowReversed), 'Narrow results must not depend on actor-array order.');
  assert(JSON.stringify(wide) === JSON.stringify(wideReversed), 'Wide results must not depend on actor-array order.');
  console.log(`evidence narrow=${JSON.stringify(narrow)} wide=${JSON.stringify(wide)}`);
}

function testOpenFloorSwapAndServiceSerialization(): void {
  const open = emptyStation();
  for (let x = 40; x <= 41; x += 1) {
    open.tiles[at(open, x, 39)] = TileType.Floor;
    open.tiles[at(open, x, 40)] = TileType.Floor;
  }
  open.topologyVersion += 1;
  const aTile = at(open, 40, 40);
  const bTile = at(open, 41, 40);
  const a = placeCrew(open, 1, aTile);
  const b = placeCrew(open, 2, bTile);
  a.path = [bTile];
  b.path = [aTile];
  open.crewMembers = [a, b];
  runMovementCoordinatorTestTick(open, 0.2);
  assert(a.tileIndex === bTile && b.tileIndex === aTile, 'A width-two ordinary-floor safe swap must remain valid.');

  const service = emptyStation();
  for (let x = 40; x <= 41; x += 1) {
    service.tiles[at(service, x, 39)] = TileType.Floor;
    service.tiles[at(service, x, 40)] = TileType.Floor;
  }
  service.topologyVersion += 1;
  const sa = placeCrew(service, 1, at(service, 40, 40));
  const sb = placeCrew(service, 2, at(service, 41, 40));
  sa.path = [sb.tileIndex];
  sb.path = [sa.tileIndex];
  sa.targetTile = sb.tileIndex;
  service.crewMembers = [sa, sb];
  runMovementCoordinatorTestTick(service, 0.2);
  assert(sa.tileIndex !== sb.tileIndex, 'Service arbitration must never overlap actors.');
  assert(sa.tileIndex === at(service, 40, 40) && sb.tileIndex === at(service, 41, 40), 'A service target must remain capacity one.');
}

const tests: Array<[string, () => void]> = [
  ['cross-section-cache', testCrossSectionDerivationAndInvalidation],
  ['opposed-cohort-capacity', testOpposedCohortCapacityAndDeterminism],
  ['open-swap-service-serialization', testOpenFloorSwapAndServiceSerialization]
];

for (const [name, test] of tests) {
  test();
  console.log(`ok ${name}`);
}
