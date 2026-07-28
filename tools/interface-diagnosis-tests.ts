import {
  deriveInterfaceDiagnosis,
  getInterfaceDiagnosisCacheStats,
  resetInterfaceDiagnosisCacheForTests
} from '../src/sim/interface-diagnosis';
import { createInitialState, tick } from '../src/sim/sim';
import { RoomType, TileType, type ArrivingShip, type DockEntity, type StationState, type TransportJob, type Visitor } from '../src/sim/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`interface-diagnosis: ${message}`);
}

function dockFixture(withDoorQueue: boolean): StationState {
  const state = createInitialState({ seed: withDoorQueue ? 9311 : 9312, physicalStarterInventory: true });
  state.controls.paused = false;
  tick(state, 0);
  const door = 5 * state.width + 5;
  const access = door + state.width;
  state.tiles[door] = TileType.Door;
  state.tiles[access] = TileType.Floor;
  const dock: DockEntity = {
    id: 77,
    sourceKind: 'pod-dock-module',
    sourceKey: 'interface-diagnosis-fixture',
    purpose: 'visitor',
    tiles: [door],
    anchorTile: door,
    area: 1,
    facing: 'north',
    lane: 'north',
    approachTiles: [],
    allowedShipTypes: ['tourist'],
    allowedShipSizes: ['small'],
    maxSizeByArea: 'small',
    occupiedByShipId: withDoorQueue ? 701 : null,
    moduleId: 701,
    mountTile: door,
    accessTile: access,
    podCapabilities: []
  };
  state.docks = [dock];
  if (!withDoorQueue) return state;
  state.arrivingShips = [{
    id: 701,
    assignedDockId: dock.id,
    stage: 'docked',
    portManifest: { callsign: 'DOOR-701' }
  } as ArrivingShip];
  state.visitors = [{
    id: 9001,
    path: [],
    originShipId: 701,
    transferPhase: 'boarding-queued',
    transferQueueTile: door,
    transferQueuedAt: state.now - 8,
    transferBlockedTile: null
  } as unknown as Visitor];
  return state;
}

function testQueueDoorDiagnosis(): void {
  const state = dockFixture(true);
  const diagnosis = deriveInterfaceDiagnosis(state, { kind: 'dock', dockId: 77 });
  assert(diagnosis.metricCode === 'queue-crosses-door', `Expected door choke, got ${diagnosis.metricCode}.`);
  assert(diagnosis.title.includes('Door at (5,5)'), `Expected physical door coordinate, got ${diagnosis.title}.`);
  assert(diagnosis.remedy.includes('second Pod Dock'), `Expected a concrete dock remedy, got ${diagnosis.remedy}.`);
  assert(diagnosis.implicatedTile === 5 * state.width + 5, 'Expected the implicated Door tile.');
}

function testHealthyComparison(): void {
  const diagnosis = deriveInterfaceDiagnosis(dockFixture(false), { kind: 'dock', dockId: 77 });
  assert(diagnosis.metricCode === 'healthy', `Expected healthy dock, got ${diagnosis.metricCode}.`);
  assert(diagnosis.remedy === 'No interface change needed.', `Expected no-change remedy, got ${diagnosis.remedy}.`);
}

function testCargoPublicCrossingDiagnosis(): void {
  const state = dockFixture(true);
  state.visitors = [];
  const publicTile = 7 * state.width + 7;
  state.tiles[publicTile] = TileType.Floor;
  state.rooms[publicTile] = RoomType.Cafeteria;
  const crew = state.crewMembers[0];
  const job: TransportJob = {
    id: 4401,
    type: 'deliver',
    itemType: 'tradeGood',
    amount: 4,
    fromTile: publicTile - 2,
    toTile: publicTile + 2,
    assignedCrewId: crew.id,
    createdAt: state.now,
    expiresAt: state.now + 90,
    state: 'in_progress',
    pickedUpAmount: 4,
    completedAt: null,
    lastProgressAt: state.now,
    portShipId: 701,
    portCargoDirection: 'outbound'
  };
  state.jobs = [job];
  crew.activeJobId = job.id;
  crew.path = [publicTile, publicTile + 1, publicTile + 2];
  const diagnosis = deriveInterfaceDiagnosis(state, { kind: 'dock', dockId: 77 });
  assert(diagnosis.metricCode === 'cargo-public-crossing', `Expected cargo/public conflict, got ${diagnosis.metricCode}.`);
  assert(diagnosis.implicatedTile === publicTile, 'Expected the actual public-route tile to be implicated.');
  assert(diagnosis.remedy.includes('staff-only cargo route'), `Expected a spatial cargo remedy, got ${diagnosis.remedy}.`);
}

function testCacheReuseAndRelevantInvalidation(): void {
  const state = dockFixture(false);
  resetInterfaceDiagnosisCacheForTests(state);
  const identity = { kind: 'dock' as const, dockId: 77 };
  const first = deriveInterfaceDiagnosis(state, identity);
  const repeated = deriveInterfaceDiagnosis(state, identity);
  assert(first === repeated, 'Repeated diagnosis in one observation window should reuse the result object.');
  state.metrics.credits += 25;
  const irrelevantChurn = deriveInterfaceDiagnosis(state, identity);
  assert(first === irrelevantChurn, 'Unrelated economy churn should not invalidate interface diagnosis.');
  assert(
    getInterfaceDiagnosisCacheStats().hits === 2 && getInterfaceDiagnosisCacheStats().builds === 1,
    'Cache stats should distinguish one build from repeated UI-style reads.'
  );

  state.topologyVersion += 1;
  const geometryChanged = deriveInterfaceDiagnosis(state, identity);
  assert(geometryChanged !== first, 'Topology changes should invalidate the selected interface immediately.');
  assert(geometryChanged.metricCode === 'healthy', 'Geometry invalidation should preserve the correct diagnosis.');

  state.arrivingShips = [{
    id: 702,
    assignedDockId: 77,
    stage: 'docked',
    portManifest: { callsign: 'QUEUE-702' }
  } as ArrivingShip];
  state.visitors = [{
    id: 9002,
    path: [],
    originShipId: 702,
    transferPhase: 'boarding-queued',
    transferQueueTile: 5 * state.width + 5,
    transferQueuedAt: state.now - 4,
    transferBlockedTile: null
  } as unknown as Visitor];
  const queueChanged = deriveInterfaceDiagnosis(state, identity);
  assert(queueChanged !== geometryChanged, 'Passenger queue changes should invalidate immediately.');
  assert(queueChanged.metricCode === 'queue-crosses-door', 'Immediate queue invalidation should expose the new Door choke.');
  state.visitors[0]!.transferBlockedTile = state.visitors[0]!.transferQueueTile;
  state.portOps.contracts.push({
    shipId: 702,
    hardDepartureAt: state.now + 20,
    status: 'boarding'
  } as StationState['portOps']['contracts'][number]);
  const blockageChanged = deriveInterfaceDiagnosis(state, identity);
  assert(blockageChanged.metricCode === 'boarding-late', 'Blocked transfer and departure pressure should invalidate immediately.');
}

function testCargoAndApproachInvalidation(): void {
  const state = dockFixture(true);
  state.visitors = [];
  const identity = { kind: 'dock' as const, dockId: 77 };
  const publicTile = 7 * state.width + 7;
  state.tiles[publicTile] = TileType.Floor;
  state.rooms[publicTile] = RoomType.Cafeteria;
  const crew = state.crewMembers[0]!;
  state.jobs = [{
    id: 4402,
    type: 'deliver',
    itemType: 'tradeGood',
    amount: 2,
    fromTile: publicTile - 1,
    toTile: publicTile + 1,
    assignedCrewId: crew.id,
    createdAt: state.now,
    expiresAt: state.now + 90,
    state: 'in_progress',
    pickedUpAmount: 2,
    completedAt: null,
    lastProgressAt: state.now,
    portShipId: 701,
    portCargoDirection: 'inbound'
  } as TransportJob];
  crew.activeJobId = 4402;
  crew.path = [publicTile, publicTile + 1];
  const crossing = deriveInterfaceDiagnosis(state, identity);
  assert(crossing.metricCode === 'cargo-public-crossing', 'Fixture should begin with a cargo/public crossing.');
  crew.path = [state.docks[0]!.accessTile!];
  const rerouted = deriveInterfaceDiagnosis(state, identity);
  assert(rerouted !== crossing, 'Cargo handler route changes should invalidate immediately.');
  assert(rerouted.metricCode === 'healthy', `Rerouted cargo should clear the crossing, got ${rerouted.metricCode}.`);

  const ship = state.arrivingShips[0]!;
  state.now = 40;
  ship.approachCommitment = {
    slotId: 'diagnosis-slot',
    groupIds: ['diagnosis-group'],
    phase: 'approach',
    status: 'waiting',
    queuedAt: 20
  };
  const waiting = deriveInterfaceDiagnosis(state, identity);
  assert(waiting.metricCode === 'approach-wait', 'Approach commitment changes should invalidate immediately.');
  ship.approachCommitment = null;
  const cleared = deriveInterfaceDiagnosis(state, identity);
  assert(cleared.metricCode === 'healthy', 'Clearing approach pressure should invalidate without waiting for the time bucket.');
}

function testTimedRefreshAndCacheIsolation(): void {
  const state = dockFixture(true);
  const identity = { kind: 'dock' as const, dockId: 77 };
  const visitor = state.visitors[0]!;
  state.tiles[visitor.transferQueueTile!] = TileType.Floor;
  visitor.transferQueueTile = visitor.transferQueueTile! + 3;
  state.tiles[visitor.transferQueueTile] = TileType.Floor;
  state.now = 100.1;
  visitor.transferQueuedAt = 81;
  const belowThreshold = deriveInterfaceDiagnosis(state, identity);
  assert(belowThreshold.metricCode === 'healthy', `Expected sub-threshold wait to remain healthy, got ${belowThreshold.metricCode}.`);
  state.now = 100.9;
  const sameWindow = deriveInterfaceDiagnosis(state, identity);
  assert(sameWindow === belowThreshold, 'Sub-second clock churn should reuse the current observation-window result.');
  state.now = 102.1;
  const refreshed = deriveInterfaceDiagnosis(state, identity);
  assert(refreshed !== belowThreshold, 'A sustained-traffic interval should force a fresh diagnosis.');
  assert(refreshed.metricCode === 'passenger-transfer-slow', 'Timed refresh should observe a transfer crossing its wait threshold.');

  const secondState = dockFixture(false);
  const secondResult = deriveInterfaceDiagnosis(secondState, identity);
  assert(secondResult !== refreshed, 'WeakMap entries must not leak across StationState instances.');
  const secondInterface = deriveInterfaceDiagnosis(secondState, { kind: 'dock', dockId: 999 });
  const repeatedSecondInterface = deriveInterfaceDiagnosis(secondState, { kind: 'dock', dockId: 999 });
  assert(secondInterface !== secondResult, 'Different interface identities must not share cache entries.');
  assert(secondInterface === repeatedSecondInterface, 'Each interface identity should retain its own reusable entry.');
}

testQueueDoorDiagnosis();
testHealthyComparison();
testCargoPublicCrossingDiagnosis();
testCacheReuseAndRelevantInvalidation();
testCargoAndApproachInvalidation();
testTimedRefreshAndCacheIsolation();
console.log('interface-diagnosis-tests: ok');
