import {
  deriveInterfaceDiagnosis,
  getInterfaceDiagnosisCacheStats,
  getSelectedInterfaceFocus,
  measureInterfaceBoarding,
  recordInterfaceBoardingCompletion,
  resetInterfaceBoardingMeasuresForTests,
  resetInterfaceDiagnosisCacheForTests,
  setSelectedInterface
} from '../src/sim/interface-diagnosis';
import { createInitialState, tick } from '../src/sim/sim';
import {
  ModuleType,
  RoomType,
  TileType,
  type ArrivingShip,
  type DockEntity,
  type ModuleInstance,
  type StationState,
  type TransportJob,
  type Visitor
} from '../src/sim/types';

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

/** Row 688: an interface whose own hardware nobody can stand at to service. */
function testUnreachableMaintenanceAnchor(): void {
  const state = dockFixture(false);
  const identity = { kind: 'dock' as const, dockId: 77 };
  assert(deriveInterfaceDiagnosis(state, identity).metricCode === 'healthy', 'Fixture should start healthy.');
  const sealed = 3 * state.width + 3;
  state.tiles[sealed] = TileType.Wall;
  for (const neighbor of [sealed - 1, sealed + 1, sealed - state.width, sealed + state.width]) {
    state.tiles[neighbor] = TileType.Wall;
  }
  state.docks[0]!.tiles = [state.docks[0]!.anchorTile, sealed];
  state.maintenanceDebts.push({
    key: 'interface-diagnosis:dock-collar',
    domain: 'dock',
    anchorTile: sealed,
    targetTile: sealed,
    label: 'Dock collar seal',
    debt: 62,
    lastServicedAt: state.now
  });
  const blocked = deriveInterfaceDiagnosis(state, identity);
  assert(blocked.metricCode === 'utility-maintenance-access', `Expected maintenance access, got ${blocked.metricCode}.`);
  assert(blocked.implicatedTile === sealed, 'Expected the unserviceable hardware tile to be implicated.');
  assert(blocked.evidence.includes('walkable'), `Expected a physical access reason, got ${blocked.evidence}.`);

  state.tiles[sealed + 1] = TileType.Floor;
  state.topologyVersion += 1;
  const opened = deriveInterfaceDiagnosis(state, identity);
  assert(opened.metricCode === 'healthy', `Opening a standing tile should clear the finding, got ${opened.metricCode}.`);

  // A debt on unrelated station hardware is not this interface's problem.
  state.maintenanceDebts.push({
    key: 'interface-diagnosis:elsewhere',
    domain: 'module',
    anchorTile: 40 * state.width + 40,
    targetTile: 40 * state.width + 40,
    debt: 90,
    lastServicedAt: state.now
  });
  state.tiles[40 * state.width + 40] = TileType.Wall;
  const unrelated = deriveInterfaceDiagnosis(state, identity);
  assert(unrelated.metricCode === 'healthy', `Debt off this interface must not be blamed on it, got ${unrelated.metricCode}.`);
}

/** Row 688: a fuel coupler on this interface that no live fuel line reaches. */
function testInterfaceUtilityGap(): void {
  const state = dockFixture(false);
  const identity = { kind: 'dock' as const, dockId: 77 };
  const couplerTile = 4 * state.width + 8;
  state.moduleInstances.push({
    id: 800,
    type: ModuleType.FuelCoupler,
    originTile: couplerTile,
    rotation: 0,
    width: 1,
    height: 1,
    tiles: [couplerTile]
  } as ModuleInstance);
  state.docks[0]!.attachmentModuleIds = { fuel: 800 };
  state.moduleVersion += 1;
  const dry = deriveInterfaceDiagnosis(state, identity);
  assert(dry.metricCode === 'utility-maintenance-access', `Expected a utility gap, got ${dry.metricCode}.`);
  assert(dry.implicatedTile === couplerTile, 'Expected the coupler service tile to be implicated.');
  assert(dry.evidence.includes('no Fuel Pipe'), `Expected a missing-pipe reason, got ${dry.evidence}.`);

  state.utilityUnderlay.layers['fuel-pipe'][couplerTile] = 1;
  state.utilityUnderlay.version += 1;
  const orphanPipe = deriveInterfaceDiagnosis(state, identity);
  assert(
    orphanPipe.metricCode === 'utility-maintenance-access' && orphanPipe.evidence.includes('Fuel Tank'),
    `A pipe with no tank behind it should still read as cut, got ${orphanPipe.evidence}.`
  );
}

/** Row 683: boarding distance and duration, keyed to one interface. */
function testBoardingDistanceAndDurationByInterface(): void {
  const state = dockFixture(true);
  resetInterfaceBoardingMeasuresForTests(state);
  const identity = { kind: 'dock' as const, dockId: 77 };
  const door = 5 * state.width + 5;
  const farQueue = 20 * state.width + 5;
  const nearQueue = 9 * state.width + 5;
  state.tiles[farQueue] = TileType.Floor;
  state.tiles[nearQueue] = TileType.Floor;
  state.visitors = [
    {
      id: 9101,
      path: [],
      tileIndex: farQueue,
      originShipId: 701,
      transferPhase: 'boarding-queued',
      transferQueueTile: farQueue,
      transferAccessTile: door,
      transferQueuedAt: state.now - 8,
      transferBlockedTile: null
    } as unknown as Visitor,
    {
      id: 9102,
      path: [],
      tileIndex: nearQueue,
      originShipId: 701,
      transferPhase: 'boarding-queued',
      transferQueueTile: nearQueue,
      transferAccessTile: door,
      transferQueuedAt: state.now - 3,
      transferBlockedTile: null
    } as unknown as Visitor
  ];

  const measure = measureInterfaceBoarding(state, identity);
  assert(measure.identityKey === 'dock:77', `Expected the measure keyed to this interface, got ${measure.identityKey}.`);
  assert(measure.activeBoarders === 2, `Expected two live boarders, got ${measure.activeBoarders}.`);
  assert(measure.longestRouteTiles === 15, `Expected a measured 15-tile boarding walk, got ${measure.longestRouteTiles}.`);
  assert(measure.totalRouteTiles === 19, `Expected 15+4 measured boarding tiles, got ${measure.totalRouteTiles}.`);
  assert(measure.farthestBoarderTile === farQueue, 'Expected the farthest boarder tile to be reported.');
  assert(Math.round(measure.longestWaitSeconds) === 8, `Expected the measured 8s wait, got ${measure.longestWaitSeconds}.`);

  // The same station read through a different interface must not see any of it.
  const otherInterface = measureInterfaceBoarding(state, { kind: 'berth', anchorTile: door });
  assert(otherInterface.identityKey === `berth:${door}`, 'Expected a distinct key for a distinct interface.');
  assert(otherInterface.activeBoarders === 0, 'Boarding at one interface must not be counted at another.');

  const diagnosis = deriveInterfaceDiagnosis(state, identity);
  assert(diagnosis.metricCode === 'boarding-distance', `Expected the distance branch, got ${diagnosis.metricCode}.`);
  assert(diagnosis.implicatedTile === farQueue, 'Expected the farthest boarder to be implicated.');
  assert(diagnosis.evidence.includes('15 tiles'), `Expected the measured distance in evidence, got ${diagnosis.evidence}.`);
  assert(diagnosis.evidence.includes('8s'), `Expected the measured duration in evidence, got ${diagnosis.evidence}.`);
}

/** Row 683: completed crossings accrue against the interface that carried them. */
function testCompletedBoardingIsKeyedByInterface(): void {
  const state = dockFixture(true);
  resetInterfaceBoardingMeasuresForTests(state);
  const door = 5 * state.width + 5;
  const stationTile = door + state.width;
  const boarded = {
    id: 9201,
    path: [],
    tileIndex: stationTile,
    originShipId: 701,
    transferPhase: 'boarding-crossing',
    transferQueueTile: stationTile + state.width * 3,
    transferStationTile: stationTile,
    transferAccessTile: door,
    transferQueuedAt: state.now - 12,
    transferBlockedTile: null
  } as unknown as Visitor;
  recordInterfaceBoardingCompletion(state, boarded, 12);
  recordInterfaceBoardingCompletion(state, boarded, 8);

  const measured = measureInterfaceBoarding(state, { kind: 'dock', dockId: 77 });
  assert(measured.completedBoardings === 2, `Expected two recorded crossings, got ${measured.completedBoardings}.`);
  assert(measured.completedSeconds === 20, `Expected 20 measured seconds, got ${measured.completedSeconds}.`);
  assert(measured.completedRouteTiles === 8, `Expected 2x(3+1) measured tiles, got ${measured.completedRouteTiles}.`);

  const otherDock = measureInterfaceBoarding(state, { kind: 'dock', dockId: 78 });
  assert(otherDock.completedBoardings === 0, 'A different interface must start from zero.');

  const otherStation = dockFixture(true);
  assert(
    measureInterfaceBoarding(otherStation, { kind: 'dock', dockId: 77 }).completedBoardings === 0,
    'Per-interface boarding totals must not leak between StationState instances.'
  );
}

/** Row 691: the world highlight reads the same diagnosis the panel shows. */
function testSelectedInterfaceFocus(): void {
  const state = dockFixture(true);
  const behindTile = 5 * state.width + 5 + state.width * 2;
  state.tiles[behindTile] = TileType.Floor;
  state.visitors.push({
    id: 9301,
    path: [],
    tileIndex: behindTile,
    originShipId: 701,
    transferPhase: 'boarding-queued',
    transferQueueTile: behindTile,
    transferQueuedAt: state.now - 5,
    transferBlockedTile: null
  } as unknown as Visitor);
  setSelectedInterface(null);
  assert(getSelectedInterfaceFocus(state) === null, 'Nothing selected must produce no highlight.');
  setSelectedInterface({ kind: 'dock', dockId: 77 });
  const focus = getSelectedInterfaceFocus(state);
  assert(focus !== null, 'Selecting an interface should produce a highlight.');
  assert(focus!.diagnosis.metricCode === 'queue-crosses-door', 'The highlight must carry the panel diagnosis.');
  assert(focus!.implicatedTile === focus!.diagnosis.implicatedTile, 'The highlight must point at the diagnosed tile.');
  assert(focus!.interfaceTiles.includes(state.docks[0]!.accessTile!), 'The highlight must include the interface footprint.');
  assert(focus!.routeTiles.length > 0, 'A queue diagnosis should hand the renderer its queue tiles.');
  assert(!focus!.routeTiles.includes(focus!.implicatedTile!), 'Route tiles must not restate the blamed tile.');
  assert(focus!.caption.length <= 20, `World captions must stay short, got "${focus!.caption}".`);

  setSelectedInterface({ kind: 'dock', dockId: 4242 });
  assert(getSelectedInterfaceFocus(state) === null, 'A selection that no longer exists must not draw.');
  setSelectedInterface(null);
}

testQueueDoorDiagnosis();
testHealthyComparison();
testCargoPublicCrossingDiagnosis();
testCacheReuseAndRelevantInvalidation();
testCargoAndApproachInvalidation();
testTimedRefreshAndCacheIsolation();
testUnreachableMaintenanceAnchor();
testInterfaceUtilityGap();
testBoardingDistanceAndDurationByInterface();
testCompletedBoardingIsKeyedByInterface();
testSelectedInterfaceFocus();
console.log('interface-diagnosis-tests: ok');
