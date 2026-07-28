import {
  createInitialState,
  queuePositionOf,
  runMovementCoordinatorTestTick,
  runQueueMaintenanceTestTick,
  tick
} from '../src/sim/sim';
import { hydrateStateFromSave, parseAndMigrateSave, serializeSave } from '../src/sim/save';
import {
  ModuleType,
  RoomType,
  TileType,
  VisitorState,
  type CrewMember,
  type StationState,
  type Visitor
} from '../src/sim/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`queue-spill: ${message}`);
}

function at(state: StationState, x: number, y: number): number {
  return y * state.width + x;
}

function center(state: StationState, tile: number): { x: number; y: number } {
  return { x: (tile % state.width) + 0.5, y: Math.floor(tile / state.width) + 0.5 };
}

type QueueFixture = {
  state: StationState;
  anchor: number;
  door: number;
  corridor: number;
  crewTemplate: CrewMember;
};

/** A one-tile-wide cantina exit: the third queue slot is deliberately a Door. */
function queueFixture(secondProvider = false): QueueFixture {
  const state = createInitialState({ seed: secondProvider ? 9072 : 9071, physicalStarterInventory: true });
  tick(state, 0);
  const crewTemplate = structuredClone(state.crewMembers[0]);
  assert(crewTemplate, 'Expected a starter crew template.');
  state.controls.paused = false;
  state.controls.shipsPerCycle = 0;
  state.tiles.fill(TileType.Space);
  state.rooms.fill(RoomType.None);
  state.modules.fill(ModuleType.None);
  state.moduleOccupancyByTile.fill(null);
  state.moduleInstances = [];
  state.visitors = [];
  state.residents = [];
  state.crewMembers = [];
  state.reservations = [];
  state.itemNodes = [];
  // The fixture intentionally uses a cantina module; hydration replays real
  // placement validation, so its unlock tier must be save-valid as well.
  state.unlocks.tier = 6;

  const addLine = (x: number, id: number): { anchor: number; door: number; corridor: number } => {
    const anchor = at(state, x, 10);
    const otherCounterTile = at(state, x + 1, 10);
    const head = at(state, x, 11);
    const roomTail = at(state, x, 12);
    const door = at(state, x, 13);
    const corridor = at(state, x, 14);
    for (const tile of [anchor, otherCounterTile, head, roomTail]) {
      state.tiles[tile] = TileType.Floor;
      state.rooms[tile] = RoomType.Cantina;
      state.pressurized[tile] = true;
    }
    state.tiles[door] = TileType.Door;
    state.tiles[corridor] = TileType.Floor;
    for (let y = 15; y <= 23; y += 1) state.tiles[at(state, x, y)] = TileType.Floor;
    // The second service tile must not create a competing line in this tiny fixture.
    for (const tile of [at(state, x - 1, 10), at(state, x, 9), at(state, x + 1, 9), at(state, x + 2, 10), at(state, x + 1, 11), at(state, x - 1, 11), at(state, x + 1, 12)]) {
      state.tiles[tile] = TileType.Wall;
    }
    state.moduleInstances.push({
      id,
      type: ModuleType.BarCounter,
      originTile: anchor,
      rotation: 0,
      width: 2,
      height: 1,
      tiles: [anchor, otherCounterTile]
    });
    state.modules[anchor] = ModuleType.BarCounter;
    state.modules[otherCounterTile] = ModuleType.BarCounter;
    state.moduleOccupancyByTile[anchor] = id;
    state.moduleOccupancyByTile[otherCounterTile] = id;
    return { anchor, door, corridor };
  };

  const first = addLine(20, 700);
  if (secondProvider) addLine(34, 701);
  // A second valid crossing sits beside the blocked queue door.
  for (const tile of [at(state, 23, 15), at(state, 23, 14), at(state, 23, 13), at(state, 23, 12), at(state, 23, 11)]) {
    state.tiles[tile] = tile === at(state, 23, 13) ? TileType.Door : TileType.Floor;
  }
  state.moduleVersion += 1;
  state.roomVersion += 1;
  state.topologyVersion += 1;
  return { state, anchor: first.anchor, door: first.door, corridor: first.corridor, crewTemplate };
}

function visitor(state: StationState, id: number, anchor: number, joinedAt: number, tile = at(state, 20, 22)): Visitor {
  const position = center(state, tile);
  return {
    id,
    name: `Queue ${id}`,
    x: position.x,
    y: position.y,
    tileIndex: tile,
    state: VisitorState.ToLeisure,
    path: [],
    speed: 5,
    patience: 0,
    eatTimer: 0,
    trespassed: false,
    servedMeal: false,
    carryingMeal: false,
    carryingDrink: false,
    reservedServingTile: null,
    reservedTargetTile: null,
    blockedTicks: 0,
    archetype: 'lounger',
    taxSensitivity: 1,
    spendMultiplier: 1,
    patienceMultiplier: 1,
    primaryPreference: 'lounge',
    spawnedAt: 0,
    originShipId: null,
    airExposureSec: 0,
    healthState: 'healthy',
    leisureLegsRemaining: 0,
    leisureLegsPlanned: 0,
    lastLeisureKind: null,
    servicePlan: [],
    completedServices: [],
    activeService: 'drink',
    optionalDrinkActive: false,
    repeatDrinksServed: 0,
    queueProviderTile: anchor,
    queueJoinedAt: joinedAt,
    serviceBlockedSince: null,
    stayClass: 'errand',
    recurringNeedActive: null
  };
}

function queueSlots(state: StationState, anchor: number): Map<number, number> {
  const slots = new Map<number, number>();
  for (const reservation of state.reservations) {
    if (reservation.releaseReason !== null || reservation.ownerKind !== 'visitor') continue;
    if (reservation.targetId !== `queue-slot:${anchor}` || reservation.targetTile === null) continue;
    slots.set(Number(reservation.ownerId), reservation.targetTile);
  }
  return slots;
}

function putVisitorAtSlot(state: StationState, visitorId: number, slot: number): void {
  const target = state.visitors.find((candidate) => candidate.id === visitorId);
  assert(target, `Missing visitor ${visitorId}.`);
  target.tileIndex = slot;
  target.path = [];
  Object.assign(target, center(state, slot));
}

function crew(template: CrewMember, id: number, tile: number, path: number[], state: StationState): CrewMember {
  const next = structuredClone(template);
  next.id = id;
  next.tileIndex = tile;
  next.path = [...path];
  next.speed = 10;
  next.blockedTicks = 0;
  next.targetTile = null;
  next.carryingItemType = null;
  next.carryingAmount = 0;
  next.movementWaitReason = undefined;
  next.movementReplanCooldownUntil = 0;
  Object.assign(next, center(state, tile));
  return next;
}

function testOrderIndependentPhysicalSlotsAndDoorSpill(): void {
  const run = (reverse: boolean) => {
    const { state, anchor, door } = queueFixture();
    const queued = [visitor(state, 7, anchor, 4), visitor(state, 2, anchor, 1), visitor(state, 5, anchor, 2), visitor(state, 9, anchor, 3)];
    state.visitors = reverse ? [...queued].reverse() : queued;
    runQueueMaintenanceTestTick(state);
    return { state, anchor, door, slots: queueSlots(state, anchor) };
  };
  const first = run(false);
  const second = run(true);
  assert(first.slots.size === 4, 'Every admitted queue member must hold a real slot reservation.');
  assert(new Set(first.slots.values()).size === first.slots.size, 'Queue slots must be exclusive floor tiles.');
  assert([...first.slots.values()].includes(first.door), 'The queue should spill through the reachable Door.');
  assert([...first.slots.entries()].sort().join('|') === [...second.slots.entries()].sort().join('|'), 'Queue order/slots must ignore visitor array order.');
  const members = first.state.derived.queueTheater.membersByAnchor.get(first.anchor) ?? [];
  assert(members.join(',') === '2,5,9,7', 'Queue order must follow durable join time then id.');
}

function testDoorThrottleAndSecondRoute(): void {
  const { state, anchor, door, crewTemplate } = queueFixture();
  state.visitors = [visitor(state, 1, anchor, 1), visitor(state, 2, anchor, 2), visitor(state, 3, anchor, 3)];
  runQueueMaintenanceTestTick(state);
  const slots = queueSlots(state, anchor);
  putVisitorAtSlot(state, 3, door);

  const blockedStart = at(state, 20, 14);
  const blocked = crew(crewTemplate, 41, blockedStart, [door, at(state, 20, 12)], state);
  const alternateStart = at(state, 23, 15);
  const alternate = crew(crewTemplate, 42, alternateStart, [at(state, 23, 14), at(state, 23, 13), at(state, 23, 12), at(state, 23, 11)], state);
  state.crewMembers = [blocked, alternate];
  for (let i = 0; i < 6; i += 1) {
    runMovementCoordinatorTestTick(state, 0.2, i % 2 === 1);
    state.now += 0.2;
  }
  assert(blocked.tileIndex === blockedStart, 'A queue occupant on a Door must throttle unrelated crossing traffic.');
  assert(alternate.path.length === 0 && alternate.tileIndex === at(state, 23, 11), 'A second valid crossing must restore throughput around the blocked line.');
  assert(slots.get(3) === door, 'The throttling body must be a claimed queue slot, not a render-only marker.');
}

function testProviderCapacityAndRecovery(): void {
  const single = queueFixture(false);
  const double = queueFixture(true);
  const makeVisitors = (fixture: QueueFixture) => Array.from({ length: 30 }, (_, index) => {
    const anchor = index % 2 === 0 && fixture.state.moduleInstances.length > 1
      ? fixture.state.moduleInstances[1].originTile
      : fixture.anchor;
    return visitor(fixture.state, index + 1, anchor, index + 1, at(fixture.state, anchor % fixture.state.width, 22));
  });
  single.state.visitors = makeVisitors(single);
  double.state.visitors = makeVisitors(double);
  runQueueMaintenanceTestTick(single.state);
  runQueueMaintenanceTestTick(double.state);
  const singleAdmitted = [...single.state.derived.queueTheater.membersByAnchor.values()].reduce((sum, members) => sum + members.length, 0);
  const doubleAdmitted = [...double.state.derived.queueTheater.membersByAnchor.values()].reduce((sum, members) => sum + members.length, 0);
  assert(doubleAdmitted > singleAdmitted, 'A second valid provider path must admit more concurrent queue throughput.');

  const members = single.state.derived.queueTheater.membersByAnchor.get(single.anchor) ?? [];
  assert(members.length >= 2, 'Expected a recoverable line.');
  const departed = members[0];
  const follower = members[1];
  const oldFollowerSlot = queueSlots(single.state, single.anchor).get(follower);
  const departingVisitor = single.state.visitors.find((candidate) => candidate.id === departed)!;
  departingVisitor.queueProviderTile = null;
  departingVisitor.queueJoinedAt = null;
  runQueueMaintenanceTestTick(single.state);
  const recovered = queueSlots(single.state, single.anchor);
  assert(!recovered.has(departed), 'Stale queue claims must release when a head leaves.');
  assert(recovered.has(follower) && recovered.get(follower) !== oldFollowerSlot, 'The following actor must advance into the released slot.');
}

function testBoundedBalkAndSaveRebuild(): void {
  const { state, anchor } = queueFixture();
  const queued = [visitor(state, 4, anchor, 1), visitor(state, 8, anchor, 2)];
  state.visitors = queued;
  runQueueMaintenanceTestTick(state);
  const parsed = parseAndMigrateSave(serializeSave('queue-spill', state, 'test'));
  assert(parsed.ok, 'Queue save should parse.');
  const hydrated = hydrateStateFromSave(parsed.save);
  const restored = hydrated.state;
  runQueueMaintenanceTestTick(restored);
  const restoredSlots = queueSlots(restored, anchor);
  assert(
    restoredSlots.size === 2 && new Set(restoredSlots.values()).size === 2,
    `Save/resume must rebuild exclusive physical slots from durable queue facts (slots=${restoredSlots.size}; modules=${restored.moduleInstances.map((module) => `${module.type}:${module.originTile}`).join('|')}; queues=${restored.visitors.map((visitor) => `${visitor.id}:${visitor.queueProviderTile}:${visitor.queueJoinedAt}:${visitor.state}`).join('|')}; warnings=${hydrated.warnings.join('|')}).`
  );

  const stranded = visitor(restored, 99, anchor, 0, at(restored, 20, 22));
  stranded.state = VisitorState.Queueing;
  stranded.queueProviderTile = null;
  stranded.queueJoinedAt = null;
  stranded.serviceBlockedSince = 0;
  restored.now = 20;
  restored.visitors.push(stranded);
  runQueueMaintenanceTestTick(restored);
  assert(
    [VisitorState.ToDock, VisitorState.ToLeisure].includes((stranded as Visitor).state),
    'A slotless queue must recover through the existing bounded service-failure exit.'
  );
  assert((stranded.angryUntil ?? 0) > restored.now, 'Bounded queue failure should retain the ordinary visitor failure presentation.');
}

const tests: Array<[string, () => void]> = [
  ['order-independent-physical-door-spill', testOrderIndependentPhysicalSlotsAndDoorSpill],
  ['door-throttle-second-route', testDoorThrottleAndSecondRoute],
  ['provider-capacity-recovery', testProviderCapacityAndRecovery],
  ['bounded-balk-save-rebuild', testBoundedBalkAndSaveRebuild]
];

for (const [name, test] of tests) {
  test();
  console.log(`ok ${name}`);
}
