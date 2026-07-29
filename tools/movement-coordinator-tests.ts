import { createInitialState, runMovementCoordinatorTestTick, tick } from '../src/sim/sim';
import { hydrateStateFromSave, parseAndMigrateSave, serializeSave } from '../src/sim/save';
import { ModuleType, TileType, type CrewMember, type StationState } from '../src/sim/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function at(state: StationState, x: number, y: number): number {
  return y * state.width + x;
}

function placeCrew(state: StationState, id: number, tileIndex: number, path: number[], options?: Partial<CrewMember>): CrewMember {
  const template = state.crewMembers[0];
  assert(template, 'Expected a starter crew template.');
  const crew = structuredClone(template) as CrewMember;
  crew.id = id;
  crew.tileIndex = tileIndex;
  crew.x = (tileIndex % state.width) + 0.5;
  crew.y = Math.floor(tileIndex / state.width) + 0.5;
  crew.path = [...path];
  crew.speed = 10;
  crew.blockedTicks = 0;
  crew.targetTile = null;
  crew.carryingItemType = null;
  crew.carryingAmount = 0;
  crew.movementWaitReason = undefined;
  crew.movementReplanCooldownUntil = 0;
  Object.assign(crew, options);
  return crew;
}

function station(): StationState {
  const state = createInitialState({ seed: 5050, physicalStarterInventory: true });
  tick(state, 0);
  state.tiles.fill(TileType.Floor);
  state.modules.fill(ModuleType.None);
  state.residents = [];
  state.visitors = [];
  return state;
}

function testContentionIsStableAndExclusive(): void {
  const run = (reversed: boolean) => {
    const state = station();
    const target = at(state, 10, 10);
    const left = placeCrew(state, 9, at(state, 9, 10), [target]);
    const above = placeCrew(state, 4, at(state, 10, 9), [target]);
    state.crewMembers = reversed ? [left, above] : [above, left];
    const results = runMovementCoordinatorTestTick(state, 0.2, reversed);
    return { state, results };
  };
  const first = run(false);
  const second = run(true);
  assert(first.results.get('crew:4') === 'moved' && first.results.get('crew:9') === 'blocked', 'Exactly one actor should enter a contested ordinary tile.');
  assert(second.results.get('crew:4') === 'moved' && second.results.get('crew:9') === 'blocked', 'Winner must not depend on actor-array order.');
  assert(first.state.crewMembers.filter((crew) => crew.tileIndex === at(first.state, 10, 10)).length === 1, 'No two actors may commit into one tile.');
}

function testWaitAgeAndCargoFairness(): void {
  const state = station();
  const target = at(state, 12, 12);
  const ordinary = placeCrew(state, 1, at(state, 11, 12), [target]);
  const security = placeCrew(state, 2, at(state, 12, 11), [target], { staffRole: 'security-guard', role: 'security' });
  state.crewMembers = [ordinary, security];
  runMovementCoordinatorTestTick(state, 0.2);
  assert(security.tileIndex === target && ordinary.blockedTicks === 1, 'Urgent work should receive only a bounded initial preference.');
  security.tileIndex = at(state, 12, 11);
  security.x = 12.5;
  security.y = 11.5;
  security.path = [target];
  ordinary.path = [target];
  runMovementCoordinatorTestTick(state, 0.2);
  assert(ordinary.tileIndex === target, 'Accumulated wait age should overcome the bounded preference.');

  const cargoState = station();
  const cargoTarget = at(cargoState, 14, 14);
  const cargo = placeCrew(cargoState, 1, at(cargoState, 13, 14), [cargoTarget], { carryingItemType: 'rawMaterial', carryingAmount: 2 });
  const publicCrew = placeCrew(cargoState, 2, at(cargoState, 14, 13), [cargoTarget]);
  cargoState.crewMembers = [cargo, publicCrew];
  runMovementCoordinatorTestTick(cargoState, 0.2);
  assert(cargo.tileIndex === cargoTarget && publicCrew.blockedTicks === 1, 'Cargo must consume the same ordinary-tile capacity as public traffic.');
}

function testSwapsAndNarrowDoorRecovery(): void {
  const state = station();
  const aTile = at(state, 16, 16);
  const bTile = at(state, 17, 16);
  const a = placeCrew(state, 1, aTile, [bTile]);
  const b = placeCrew(state, 2, bTile, [aTile]);
  state.crewMembers = [a, b];
  runMovementCoordinatorTestTick(state, 0.2);
  assert(a.tileIndex === bTile && b.tileIndex === aTile, 'A safe two-actor ordinary-tile swap should commit.');

  const unsafe = station();
  const u0 = at(unsafe, 16, 16);
  const u1 = at(unsafe, 17, 16);
  unsafe.tiles[u1] = TileType.Door;
  const ua = placeCrew(unsafe, 1, u0, [u1]);
  const ub = placeCrew(unsafe, 2, u1, [u0]);
  unsafe.crewMembers = [ua, ub];
  runMovementCoordinatorTestTick(unsafe, 0.2);
  assert(ua.tileIndex === u0 && ub.tileIndex === u1, 'Door swaps must yield instead of passing through each other.');

  const cycle = station();
  const c0 = at(cycle, 20, 20);
  const c1 = at(cycle, 21, 20);
  const c2 = at(cycle, 21, 21);
  cycle.crewMembers = [placeCrew(cycle, 1, c0, [c1]), placeCrew(cycle, 2, c1, [c2]), placeCrew(cycle, 3, c2, [c0])];
  runMovementCoordinatorTestTick(cycle, 0.2);
  assert(cycle.crewMembers.every((crew, index) => crew.tileIndex === [c0, c1, c2][index]), 'Larger movement cycles must yield.');

  const door = station();
  const from = at(door, 25, 25);
  const gate = at(door, 26, 25);
  const through = at(door, 27, 25);
  door.tiles[gate] = TileType.Door;
  const lead = placeCrew(door, 1, from, [gate, through]);
  const follower = placeCrew(door, 2, at(door, 24, 25), [from, gate, through]);
  door.crewMembers = [lead, follower];
  runMovementCoordinatorTestTick(door, 0.2);
  assert(lead.tileIndex === gate && follower.tileIndex === from, 'The lead should take the narrow crossing first while the line closes up behind it.');
  door.now += 0.2;
  runMovementCoordinatorTestTick(door, 0.2);
  assert(lead.tileIndex === gate && follower.tileIndex !== gate, 'Door cooldown should visibly throttle the line.');
  door.now += 0.2;
  runMovementCoordinatorTestTick(door, 0.2);
  assert(lead.tileIndex === through && follower.tileIndex !== gate, 'The line should resume one crossing at a time after cooldown.');
}

function testOccupiedDoorVacatesBeforeOlderEntrant(): void {
  const state = station();
  const before = at(state, 28, 25);
  const door = at(state, 29, 25);
  const after = at(state, 30, 25);
  state.tiles[door] = TileType.Door;
  const leaving = placeCrew(state, 9, door, [after]);
  const olderEntrant = placeCrew(state, 1, before, [door], { blockedTicks: 5 });
  state.crewMembers = [olderEntrant, leaving];

  const results = runMovementCoordinatorTestTick(state, 0.2);
  assert(
    results.get('crew:9') === 'moved' && leaving.tileIndex === after,
    'The actor occupying a door must vacate before a higher-wait entrant can claim it.'
  );
  assert(
    results.get('crew:1') === 'blocked' && olderEntrant.tileIndex === before,
    'The older entrant must wait while the occupied door clears.'
  );
}

function testIdleCleanerSidestepsHeadOnDoorTraffic(): void {
  const state = station();
  const before = at(state, 32, 25);
  const door = at(state, 33, 25);
  const fixturePost = at(state, 34, 25);
  const escape = at(state, 35, 25);
  const leisureTarget = at(state, 31, 25);
  state.tiles[door] = TileType.Door;
  state.tiles[at(state, 33, 24)] = TileType.Wall;
  state.tiles[at(state, 33, 26)] = TileType.Wall;
  state.modules[fixturePost] = ModuleType.IntakePallet;
  const shopper = placeCrew(state, 1, before, [door, fixturePost], { blockedTicks: 8 });
  const cleaner = placeCrew(state, 5, door, [before, leisureTarget], {
    staffRole: 'cleaner',
    role: 'idle',
    leisure: true,
    leisureSessionActive: false,
    targetTile: leisureTarget
  });
  const postWorker = placeCrew(state, 6, fixturePost, []);
  state.crewMembers = [shopper, cleaner, postWorker];

  const results = runMovementCoordinatorTestTick(state, 0.2);
  assert(
    results.get('crew:5') === 'moved' && cleaner.tileIndex === fixturePost,
    'An idle Cleaner walking head-on through an occupied door must step clear instead of pinning the entrant.'
  );
  assert(
    results.get('crew:6') === 'moved' && postWorker.tileIndex === escape,
    'The idle fixture worker must make one physical tile of room for the Cleaner to clear the throat.'
  );
  assert(
    results.get('crew:1') === 'blocked' && shopper.tileIndex === before,
    'The active entrant must retain its side of the narrow crossing while the Cleaner clears it.'
  );
  assert(cleaner.targetTile === leisureTarget && cleaner.leisure, 'Yielding must preserve the Cleaner\'s active leisure claim.');
  assert(
    (cleaner.movementReplanCooldownUntil ?? 0) > state.now,
    'The Cleaner needs replan hysteresis so it does not immediately oscillate back into the door.'
  );
}

function testCongestionReplanAndSave(): void {
  const state = station();
  const origin = at(state, 30, 30);
  const actor = placeCrew(state, 1, origin, [at(state, 31, 30)], { blockedTicks: 8 });
  state.crewMembers = [actor];
  runMovementCoordinatorTestTick(state, 0.2);
  assert(actor.path.length === 0 && (actor.movementReplanCooldownUntil ?? 0) > state.now, 'Bounded waiting should invalidate the route for congestion-aware replanning.');
  actor.path = [at(state, 31, 30)];
  state.now += 0.2;
  runMovementCoordinatorTestTick(state, 0.2);
  assert(actor.path.length === 0 || actor.movementReplanCooldownUntil! > state.now, 'Replan hysteresis should prevent tick-to-tick path oscillation.');

  actor.blockedTicks = 6;
  actor.movementWaitReason = 'destination occupied';
  const parsed = parseAndMigrateSave(serializeSave('movement-coordinator', state, 'test'));
  assert(parsed.ok, 'Movement wait state save should parse.');
  const restored = hydrateStateFromSave(parsed.save).state;
  const restoredCrew = restored.crewMembers.find((crew) => crew.id === actor.id);
  assert(restoredCrew?.blockedTicks === 6, 'Save/load must preserve deterministic wait age.');
  assert(restoredCrew?.movementWaitReason === undefined, 'Save/load must clear ephemeral movement claims and reasons.');
}

function testIdleBlockerMakesRoom(): void {
  const state = station();
  const origin = at(state, 35, 35);
  const blockedTile = at(state, 36, 35);
  const mover = placeCrew(state, 1, origin, [blockedTile, at(state, 37, 35)], { blockedTicks: 8 });
  const idle = placeCrew(state, 2, blockedTile, []);
  state.crewMembers = [mover, idle];
  runMovementCoordinatorTestTick(state, 0.2);
  assert(mover.tileIndex === blockedTile, 'A long-waiting actor should advance when an idle blocker has room to yield.');
  assert(idle.tileIndex !== blockedTile && idle.tileIndex !== origin, 'The idle blocker should sidestep to a distinct free tile.');
}

function testInitialCrewAndCorridorNoGhost(): void {
  const initial = createInitialState({ seed: 5051, physicalStarterInventory: true });
  assert(
    new Set(initial.crewMembers.map((crew) => crew.tileIndex)).size === initial.crewMembers.length,
    'Fresh crew must spawn on distinct walkable tiles.'
  );

  const state = station();
  const origin = at(state, 40, 40);
  const blockedTile = at(state, 41, 40);
  for (const tile of [at(state, 40, 39), at(state, 40, 41), at(state, 41, 39), at(state, 41, 41), at(state, 42, 40)]) {
    state.tiles[tile] = TileType.Wall;
  }
  state.topologyVersion += 1;
  const courier = placeCrew(state, 1, origin, [blockedTile], {
    carryingItemType: 'rawMaterial',
    carryingAmount: 1,
    blockedTicks: 8
  });
  const idle = placeCrew(state, 2, blockedTile, []);
  state.crewMembers = [courier, idle];
  runMovementCoordinatorTestTick(state, 0.2);
  assert(
    courier.tileIndex !== blockedTile && courier.tileIndex !== idle.tileIndex,
    'A terminal one-tile corridor must not resolve a physical impasse by ghosting actors through each other.'
  );
}

const tests: Array<[string, () => void]> = [
  ['contention-stable-exclusive', testContentionIsStableAndExclusive],
  ['wait-age-cargo-fairness', testWaitAgeAndCargoFairness],
  ['swaps-door-recovery', testSwapsAndNarrowDoorRecovery],
  ['occupied-door-vacates-first', testOccupiedDoorVacatesBeforeOlderEntrant],
  ['idle-cleaner-door-sidestep', testIdleCleanerSidestepsHeadOnDoorTraffic],
  ['congestion-replan-save', testCongestionReplanAndSave],
  ['idle-blocker-yields', testIdleBlockerMakesRoom],
  ['initial-spawn-corridor-no-ghost', testInitialCrewAndCorridorNoGhost]
];

for (const [name, test] of tests) {
  test();
  console.log(`ok ${name}`);
}
