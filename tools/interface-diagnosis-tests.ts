import { deriveInterfaceDiagnosis } from '../src/sim/interface-diagnosis';
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
    originShipId: 701,
    transferPhase: 'boarding-queued',
    transferQueueTile: door,
    transferQueuedAt: state.now - 8,
    transferBlockedTile: null
  } as Visitor];
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

testQueueDoorDiagnosis();
testHealthyComparison();
testCargoPublicCrossingDiagnosis();
console.log('interface-diagnosis-tests: ok');
