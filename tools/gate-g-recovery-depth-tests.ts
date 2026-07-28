// Positive evidence for the physical recovery consequences that the core
// commitment runner deliberately leaves open.
//
// Run directly after the simtest compile:
//   node .tmp/sim-tests/tools/gate-g-recovery-depth-tests.js

// Filter with GATE_G_RECOVERY_FILTER=<substring>.

import {
  acceptVisitorAsResident,
  applyRecoveryAction,
  createInitialState,
  getFailureEpisodes,
  removeModuleAtTile,
  setDockPurpose,
  setResidentAcceptance,
  setRoomHousingPolicy,
  tick,
  tryPlaceModule
} from '../src/sim/sim';
import { createVisitorNeeds } from '../src/sim/occupant-demand';
import { INCIDENT_COOLDOWN_SEC, RECOVERY_COSTS } from '../src/sim/failed-stay';
import {
  ModuleType,
  RoomType,
  VisitorState,
  type ArrivingShip,
  type PortContract,
  type StationState,
  type Visitor
} from '../src/sim/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function fixture(seed: number): StationState {
  const state = createInitialState({ seed, physicalStarterInventory: true, manualTrafficAdmission: true });
  tick(state, 0);
  state.controls.paused = false;
  state.controls.shipsPerCycle = 0;
  state.trafficOffers.length = 0;
  state.metrics.credits = 5000;
  return state;
}

function advance(state: StationState, seconds: number, step = 0.2): void {
  const ticks = Math.ceil(seconds / step);
  for (let index = 0; index < ticks; index++) tick(state, step);
}

function contractShip(
  state: StationState,
  id: number,
  promises: PortContract['promises'] = [{
    kind: 'passengers-returned',
    label: 'Return passengers',
    target: 2,
    completed: 0,
    payoutCredits: 80
  }]
): ArrivingShip {
  const dock = state.docks[0];
  assert(dock, 'Starter fixture needs a dock.');
  const tile = dock.accessTile ?? dock.tiles[0];
  const ship = {
    id,
    kind: 'transient',
    size: 'small',
    bayTiles: [tile],
    bayCenterX: (tile % state.width) + 0.5,
    bayCenterY: Math.floor(tile / state.width) + 0.5,
    shipType: 'tourist',
    hullVariant: 'passenger-shuttle',
    lane: dock.lane,
    originDockId: dock.id,
    assignedDockId: dock.id,
    assignedDockSourceKey: dock.sourceKey,
    assignedBerthAnchor: null,
    queueState: 'none',
    stage: 'docked',
    stageTime: 0,
    passengersTotal: 2,
    passengersSpawned: 2,
    passengersBoarded: 0,
    minimumBoarding: 2,
    spawnCarry: 0,
    dockedAt: state.now,
    residentIds: [],
    manifestDemand: { cafeteria: 2, market: 0, lounge: 0 },
    manifestMix: { diner: 2, shopper: 0, lounger: 0, rusher: 0 },
    portContractId: id,
    stayClass: 'contract',
    visitPhase: 'visit-service',
    earliestDepartureAt: state.now + 9000,
    plannedDepartureAt: state.now + 9500,
    extensionUntil: null,
    recallAt: null,
    approachCommitment: null
  } as unknown as ArrivingShip;
  const contract = {
    id,
    offerId: id,
    shipId: id,
    callsign: `RECOVERY-${id}`,
    offerKind: 'passenger',
    assignedBerthAnchor: 0,
    acceptedAt: state.now,
    arrivesAt: state.now,
    boardingStartsAt: state.now + 9000,
    hardDepartureAt: state.now + 10000,
    status: 'active',
    promises,
    passengerSpendingCredits: 0,
    procurementCostCredits: 0,
    settlementId: null,
    stayClass: 'contract',
    earliestDepartureAt: ship.earliestDepartureAt,
    plannedDepartureAt: ship.plannedDepartureAt,
    extensionUntil: null,
    recallAt: null
  } as unknown as PortContract;
  dock.occupiedByShipId = ship.id;
  state.arrivingShips.push(ship);
  state.portOps.contracts.push(contract);
  return ship;
}

function failingVisitor(state: StationState, ship: ArrivingShip, id: number): Visitor {
  const tile = ship.bayTiles[0];
  const visitor = {
    id,
    x: (tile % state.width) + 0.5,
    y: Math.floor(tile / state.width) + 0.5,
    tileIndex: tile,
    state: VisitorState.ToCafeteria,
    path: [],
    speed: 2,
    patience: 0,
    eatTimer: 0,
    trespassed: false,
    servedMeal: false,
    carryingMeal: false,
    reservedServingTile: null,
    reservedTargetTile: null,
    blockedTicks: 0,
    archetype: 'lounger',
    taxSensitivity: 1,
    spendMultiplier: 1,
    patienceMultiplier: 1,
    primaryPreference: 'cafeteria',
    spawnedAt: state.now,
    originShipId: ship.id,
    airExposureSec: 0,
    healthState: 'healthy',
    leisureLegsRemaining: 0,
    leisureLegsPlanned: 0,
    lastLeisureKind: null,
    servicePlan: [],
    completedServices: [],
    activeService: 'meal',
    stayClass: 'contract',
    queueProviderTile: null,
    queueJoinedAt: null,
    temporarySleepTargetTile: null,
    needs: createVisitorNeeds(id),
    recurringNeedActive: 'hunger',
    serviceBlockedSince: state.now - 200,
    failureNeed: 'hunger',
    serviceFailureStage: 'disruptive'
  } as unknown as Visitor;
  visitor.needs!.hunger = 4;
  visitor.needs!.unmetSince = state.now - 200;
  state.visitors.push(visitor);
  return visitor;
}

function clearDormFixtures(state: StationState): void {
  const ids = state.moduleInstances
    .filter((module) => module.tiles.some((tile) => state.rooms[tile] === RoomType.Dorm))
    .map((module) => module.id);
  for (const id of ids) {
    const module = state.moduleInstances.find((entry) => entry.id === id);
    if (module) removeModuleAtTile(state, module.originTile);
  }
}

function testTemporaryBunksAreExactPhysicalFixtures(): string {
  const state = fixture(78001);
  clearDormFixtures(state);
  const ship = contractShip(state, 780011);
  const visitors = [failingVisitor(state, ship, 780012), failingVisitor(state, ship, 780013)];
  tick(state, 0);
  const episodeIds = getFailureEpisodes(state).map((episode) => episode.id);
  assert(episodeIds.length === 2, 'Two failing guests must open two episodes.');
  const beforeIds = new Set(state.moduleInstances.map((module) => module.id));
  const creditsBefore = state.metrics.credits;

  const result = applyRecoveryAction(state, {
    kind: 'temporary-lodging',
    shipId: ship.id,
    amount: 2
  });
  assert(result.ok, `Two emergency bunks should deploy: ${result.reason}`);
  assert(result.affectedEpisodeIds.length === 2, 'Two requested bunks must affect exactly two episodes.');
  assert(result.creditsCost === 2 * RECOVERY_COSTS.temporaryLodgingUnit, 'Cost must be exactly the stated per-bunk rate.');
  assert(state.metrics.credits === creditsBefore - result.creditsCost, 'The stated bunk cost must be spent once.');

  const deployed = state.moduleInstances.filter((module) => !beforeIds.has(module.id));
  assert(deployed.length === 2, `Expected two new fixtures, got ${deployed.length}.`);
  for (const module of deployed) {
    assert(module.type === ModuleType.Bunk, 'Emergency lodging must deploy real Bunk modules.');
    assert(module.width === 1 && module.height === 1 && module.tiles.length === 1, 'Each emergency Bunk must depict exactly one 1x1 position.');
    assert(state.rooms[module.originTile] === RoomType.Dorm, 'Emergency Bunks may only occupy Dorm floor.');
    assert(state.roomHousingPolicies[module.originTile] === 'visitor', 'Emergency Bunk tile must become visitor housing.');
  }
  const targets = visitors.map((visitor) => visitor.temporarySleepTargetTile);
  assert(targets.every((tile): tile is number => tile !== null), 'Every affected guest must receive a concrete bunk target.');
  assert(new Set(targets).size === 2, 'Each depicted bunk must have one distinct routed guest.');
  assert(targets.every((tile) => deployed.some((module) => module.originTile === tile)), 'Guests must route to the newly deployed fixtures.');

  const blocked = fixture(78002);
  clearDormFixtures(blocked);
  for (let tile = 0; tile < blocked.rooms.length; tile++) {
    if (blocked.rooms[tile] === RoomType.Dorm) blocked.rooms[tile] = RoomType.None;
  }
  const blockedShip = contractShip(blocked, 780021);
  failingVisitor(blocked, blockedShip, 780022);
  tick(blocked, 0);
  const refused = applyRecoveryAction(blocked, { kind: 'temporary-lodging', shipId: blockedShip.id, amount: 1 });
  assert(!refused.ok, 'Lodging must refuse when no eligible Dorm floor exists.');
  assert(
    refused.reason === 'only 0 eligible free Dorm tile(s) for 1 temporary bunk(s)',
    `Refusal must state the exact physical shortfall, got "${refused.reason}".`
  );
  assert(blocked.moduleInstances.every((module) => module.type !== ModuleType.Bunk), 'A refused action must add no hidden or depicted capacity.');
  return `2 × 1x1 Bunks, ${result.creditsCost}c, 2 distinct routes; zero-floor refusal exact`;
}

function testCancellationPricesUnfinishedValueAndRecalls(): string {
  const state = fixture(78003);
  const ship = contractShip(state, 780031, [
    { kind: 'dock', label: 'Dock work', target: 4, completed: 1, payoutCredits: 100 },
    { kind: 'passengers-returned', label: 'Return passengers', target: 4, completed: 1, payoutCredits: 80 },
    { kind: 'inspection', label: 'Inspection', target: 1, completed: 1, payoutCredits: 60 }
  ]);
  failingVisitor(state, ship, 780032);
  tick(state, 0);
  const episode = getFailureEpisodes(state)[0];
  assert(episode, 'Cancellation fixture needs one open failure episode.');
  const contract = state.portOps.contracts.find((entry) => entry.id === ship.portContractId);
  assert(contract, 'Cancellation fixture needs its contract.');
  const creditsBefore = state.metrics.credits;
  // 100 * 3/4 + 80 * 3/4 = 135 unfinished; round(135 * .45) = 61.
  const result = applyRecoveryAction(state, { kind: 'cancel-contract', episodeId: episode.id, shipId: ship.id });
  assert(result.ok, `Cancellation should apply: ${result.reason}`);
  assert(result.creditsCost === 61 && result.creditsCost > 0, `Expected 61c positive proportional penalty, got ${result.creditsCost}.`);
  assert(state.metrics.credits === creditsBefore - 61, 'Cancellation penalty must be charged exactly once.');
  assert(ship.visitPhase === 'recall' && ship.recallAt === state.now, 'Cancellation must begin recall immediately.');
  assert(contract.status === 'boarding' && contract.recallAt === state.now, 'The contract must durably record recall.');
  assert(ship.visitScheduleReason === 'service-failure' && contract.visitScheduleReason === 'service-failure', 'The causal service-failure reason must survive on ship and contract.');
  assert(episode.resolution === 'cancelled' && episode.resolvedAt === state.now, 'Cancellation must terminally resolve the targeted episode once.');
  assert(
    state.derived.queueTheater.eventFeed.some((event) => event.text.includes('61c penalty on 135c unfinished value')),
    'The event feed must expose penalty, unfinished value, and recall cause.'
  );
  return `135c unfinished × 45% = 61c; ship + contract recalled with durable cause`;
}

function testSustainedFailureProducesBoundedIncidentLadder(): string {
  const state = fixture(78004);
  const ship = contractShip(state, 780041);
  const visitor = failingVisitor(state, ship, 780042);
  // Isolate the sustained-stay incident behavior from the separate automatic
  // service-failure recall path. The occupant remains a contract-class guest,
  // but no ship deadline can remove them during the cooldown proof.
  visitor.originShipId = null;
  state.arrivingShips = state.arrivingShips.filter((entry) => entry.id !== ship.id);
  state.portOps.contracts = state.portOps.contracts.filter((entry) => entry.shipId !== ship.id);
  const occupiedDock = state.docks.find((entry) => entry.occupiedByShipId === ship.id);
  if (occupiedDock) occupiedDock.occupiedByShipId = null;
  const anchor = visitor.tileIndex;
  const dirtBefore = state.dirtByTile[anchor];
  tick(state, 0);
  const episode = getFailureEpisodes(state)[0];
  assert(episode, 'Incident fixture needs one open episode.');
  assert(episode.incidents.map((entry) => entry.kind).join(',') === 'mess', 'A disruptive episode must begin with a physical mess.');
  assert(state.dirtByTile[anchor] >= dirtBefore + 26, 'The mess must add dirt at the episode anchor tile.');

  const sustain = (): void => {
    visitor.state = VisitorState.ToCafeteria;
    visitor.activeService = 'meal';
    visitor.recurringNeedActive = 'hunger';
    visitor.serviceBlockedSince = state.now - 200;
    visitor.failureNeed = 'hunger';
    visitor.serviceFailureStage = 'disruptive';
    visitor.needs!.hunger = 4;
    visitor.needs!.unmetSince = state.now - 200;
  };
  state.now += INCIDENT_COOLDOWN_SEC - 1;
  sustain();
  tick(state, 0);
  assert(episode.incidents.length === 1, 'Cooldown must suppress an early second incident.');
  state.now += 1;
  sustain();
  tick(state, 0);
  assert(episode.incidents.map((entry) => entry.kind).join(',') === 'mess,complaint', 'The second incident must be a complaint after cooldown.');
  state.now += INCIDENT_COOLDOWN_SEC;
  sustain();
  tick(state, 0);
  assert(
    episode.incidents.map((entry) => entry.kind).join(',') === 'mess,complaint,refusal-to-work',
    `Sustained disruption must reach the deterministic refusal-to-work rung; got ${episode.incidents.map((entry) => entry.kind).join(',')} (stage ${episode.stage}, resolved ${episode.resolution}).`
  );
  state.now += INCIDENT_COOLDOWN_SEC * 2;
  sustain();
  tick(state, 0);
  assert(Number(episode.incidents.length) === 3, 'The incident ladder must cap at three durable incidents.');
  assert(episode.incidents.every((entry) => entry.tileIndex === anchor), 'Every rung must remain spatially attributable.');
  return `mess → complaint → refusal-to-work at tile ${anchor}; ${INCIDENT_COOLDOWN_SEC}s cooldown; cap 3`;
}

function configurePrivateHousing(state: StationState): number {
  clearDormFixtures(state);
  const dormTiles = state.tiles
    .map((_, tile) => tile)
    .filter((tile) => state.rooms[tile] === RoomType.Dorm && state.moduleOccupancyByTile[tile] === null);
  let bedId: number | null = null;
  for (const tile of dormTiles) {
    const horizontal = tile + 1;
    if (Math.floor(horizontal / state.width) === Math.floor(tile / state.width) && dormTiles.includes(horizontal)) {
      const placed = tryPlaceModule(state, ModuleType.Bed, tile, 0);
      if (placed.ok) {
        bedId = state.moduleInstances.find((module) => module.originTile === tile && module.type === ModuleType.Bed)?.id ?? null;
        break;
      }
    }
    const vertical = tile + state.width;
    if (dormTiles.includes(vertical)) {
      const placed = tryPlaceModule(state, ModuleType.Bed, tile, 90);
      if (placed.ok) {
        bedId = state.moduleInstances.find((module) => module.originTile === tile && module.type === ModuleType.Bed)?.id ?? null;
        break;
      }
    }
  }
  assert(bedId !== null, 'Fixture must place a real private Bed through the production placement API.');
  const bed = state.moduleInstances.find((module) => module.id === bedId)!;
  assert(setRoomHousingPolicy(state, bed.originTile, 'private_resident'), 'Dorm must accept private-resident policy.');
  const hygieneTile = state.rooms.findIndex((room) => room === RoomType.Hygiene);
  assert(hygieneTile >= 0, 'Starter fixture needs Hygiene.');
  assert(setRoomHousingPolicy(state, hygieneTile, 'resident'), 'Hygiene must accept resident policy.');
  return bedId;
}

function ordinaryVisitor(state: StationState, ship: ArrivingShip, id: number): Visitor {
  const tile = ship.bayTiles[0];
  const visitor = {
    id,
    x: (tile % state.width) + 0.5,
    y: Math.floor(tile / state.width) + 0.5,
    tileIndex: tile,
    state: VisitorState.Leisure,
    path: [],
    speed: 2,
    patience: 80,
    eatTimer: 0,
    trespassed: false,
    servedMeal: true,
    carryingMeal: false,
    reservedServingTile: null,
    reservedTargetTile: null,
    blockedTicks: 0,
    archetype: 'lounger',
    taxSensitivity: 1,
    spendMultiplier: 1,
    patienceMultiplier: 1,
    primaryPreference: 'lounge',
    spawnedAt: state.now,
    originShipId: ship.id,
    airExposureSec: 0,
    healthState: 'healthy',
    leisureLegsRemaining: 0,
    leisureLegsPlanned: 0,
    lastLeisureKind: null,
    servicePlan: [],
    completedServices: [],
    activeService: null,
    stayClass: 'shore',
    queueProviderTile: null,
    queueJoinedAt: null,
    temporarySleepTargetTile: null,
    needs: createVisitorNeeds(id),
    recurringNeedActive: null,
    serviceBlockedSince: null,
    failureNeed: null,
    serviceFailureStage: 'none'
  } as unknown as Visitor;
  state.visitors.push(visitor);
  return visitor;
}

function testExplicitResidentStaysAfterHomeShipDeparture(): string {
  const state = fixture(78005);
  const bedId = configurePrivateHousing(state);
  const dock = state.docks[0];
  assert(dock, 'Resident fixture needs a dock.');
  setDockPurpose(state, dock.id, 'residential');
  const tile = dock.accessTile ?? dock.tiles[0];
  const ship = {
    id: 780051,
    kind: 'resident_home',
    size: 'small',
    bayTiles: [tile],
    bayCenterX: (tile % state.width) + 0.5,
    bayCenterY: Math.floor(tile / state.width) + 0.5,
    shipType: 'tourist',
    hullVariant: 'crew-launch',
    lane: dock.lane,
    originDockId: dock.id,
    assignedDockId: dock.id,
    assignedDockSourceKey: dock.sourceKey,
    assignedBerthAnchor: null,
    queueState: 'none',
    stage: 'docked',
    stageTime: 0,
    passengersTotal: 1,
    passengersSpawned: 1,
    passengersBoarded: 0,
    minimumBoarding: 0,
    spawnCarry: 0,
    dockedAt: state.now,
    residentIds: [],
    manifestDemand: { cafeteria: 0, market: 0, lounge: 0 },
    manifestMix: { diner: 0, shopper: 0, lounger: 1, rusher: 0 },
    visitPhase: 'visit-service',
    recallAt: null,
    approachCommitment: null
  } as unknown as ArrivingShip;
  dock.occupiedByShipId = ship.id;
  state.arrivingShips.push(ship);
  const visitor = ordinaryVisitor(state, ship, 780052);
  setResidentAcceptance(state, true);
  const accepted = acceptVisitorAsResident(state, visitor.id);
  assert(accepted.ok && accepted.residentId !== null, `Explicit acceptance should succeed: ${accepted.reason}`);
  assert(!state.visitors.some((entry) => entry.id === visitor.id), 'Accepted visitor identity must leave the transient visitor pool.');
  const resident = state.residents.find((entry) => entry.id === accepted.residentId);
  assert(resident, 'Explicit acceptance must create one resident.');
  assert(resident.bedModuleId === bedId, 'Accepted resident must own the depicted private bed.');
  assert(ship.residentIds.includes(resident.id), 'Home ship must durably name the accepted resident before departure.');

  advance(state, 20);
  assert(!state.arrivingShips.some((entry) => entry.id === ship.id), 'Resident-home ship must complete ordinary departure.');
  const currentDock = state.docks.find((entry) => entry.id === dock.id);
  assert(currentDock?.occupiedByShipId === null, `Resident-home departure must free its residential dock, got ${currentDock?.occupiedByShipId}.`);
  const stayed = state.residents.find((entry) => entry.id === resident.id);
  assert(stayed, 'Resident must remain after their home ship departs.');
  assert(stayed.bedModuleId === bedId && state.moduleInstances.some((module) => module.id === bedId), 'Resident must remain housed in the same physical Bed.');
  return `resident ${resident.id} stayed in Bed ${bedId}; home ship departed; dock ${dock.id} free`;
}

const tests: Array<[string, () => string]> = [
  ['temporary bunks are exact physical fixtures', testTemporaryBunksAreExactPhysicalFixtures],
  ['cancellation prices unfinished value and recalls', testCancellationPricesUnfinishedValueAndRecalls],
  ['sustained failure produces bounded incident ladder', testSustainedFailureProducesBoundedIncidentLadder],
  ['explicit resident stays after home ship departure', testExplicitResidentStaysAfterHomeShipDeparture]
];

const filter = (process.env.GATE_G_RECOVERY_FILTER ?? '').toLowerCase();
let passed = 0;
for (const [name, run] of tests) {
  if (filter && !name.toLowerCase().includes(filter)) continue;
  try {
    const evidence = run();
    console.log(`PASS ${name}: ${evidence}`);
    passed += 1;
  } catch (error) {
    console.error(`FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
if (!process.exitCode) console.log(`Gate G recovery depth: ${passed}/${filter ? passed : tests.length} passed`);
