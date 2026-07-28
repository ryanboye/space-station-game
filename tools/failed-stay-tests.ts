import {
  createInitialState,
  getContractVisitorWorkMultiplier,
  runVisitorServiceFailureTestTick,
  tick,
  transferStrandedVisitor
} from '../src/sim/sim';
import { createVisitorNeeds } from '../src/sim/occupant-demand';
import { hydrateStateFromSave, parseAndMigrateSave, serializeSave } from '../src/sim/save';
import {
  VisitorState,
  type ArrivingShip,
  type PortContract,
  type StationState,
  type Visitor
} from '../src/sim/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function advance(state: StationState, seconds: number): void {
  state.controls.paused = false;
  for (let elapsed = 0; elapsed < seconds; elapsed += 0.2) tick(state, 0.2);
}

function contractShip(state: StationState, id: number): ArrivingShip {
  const dock = state.docks[0];
  const dockTile = dock?.accessTile ?? dock?.tiles[0] ?? 0;
  const ship: ArrivingShip = {
    id,
    kind: 'transient',
    size: 'medium',
    bayTiles: [dockTile],
    bayCenterX: (dockTile % state.width) + 0.5,
    bayCenterY: Math.floor(dockTile / state.width) + 0.5,
    shipType: 'industrial',
    hullVariant: 'repair-tender',
    lane: 'north',
    originDockId: dock?.id ?? null,
    assignedDockId: dock?.id ?? null,
    assignedDockSourceKey: dock?.sourceKey ?? null,
    assignedBerthAnchor: null,
    queueState: 'none',
    stage: 'docked',
    stageTime: 0,
    passengersTotal: 1,
    passengersSpawned: 1,
    passengersBoarded: 0,
    minimumBoarding: 1,
    spawnCarry: 0,
    dockedAt: state.now,
    residentIds: [],
    manifestDemand: { cafeteria: 1, market: 0, lounge: 0 },
    manifestMix: { diner: 1, shopper: 0, lounger: 0, rusher: 0 },
    portManifest: {
      id,
      callsign: `STRAND-${id}`,
      shipName: 'Test Hauler',
      lane: 'north',
      shipType: 'industrial',
      hullVariant: 'repair-tender',
      offerKind: 'freight',
      size: 'medium',
      status: 'holding',
      forecastAt: state.now,
      arrivesAt: state.now,
      expiresAt: state.now + 900,
      passengersTotal: 1,
      manifestDemand: { cafeteria: 1, market: 0, lounge: 0 },
      manifestMix: { diner: 1, shopper: 0, lounger: 0, rusher: 0 },
      hospitalityDemand: { meal: 1, drink: 0, leisure: 0, restroom: 0, hygiene: 0, comfort: 0 },
      inboundCargo: { rawMaterial: 0, rawMeal: 0, tradeGood: 0 },
      outboundRequest: { rawMaterial: 0, meal: 0, tradeGood: 0 },
      requestedServices: [],
      berthTimeSec: 190,
      dockingFee: 0,
      projectedSpend: 0,
      riskLabel: 'low'
    },
    portContractId: id,
    stayClass: 'contract',
    visitPhase: 'visit-service',
    earliestDepartureAt: state.now + 20,
    plannedDepartureAt: state.now + 190,
    extensionUntil: null,
    recallAt: null
  };
  state.arrivingShips.push(ship);
  state.portOps.contracts.push({
    id,
    offerId: id,
    shipId: id,
    callsign: ship.portManifest!.callsign,
    offerKind: 'freight',
    assignedBerthAnchor: 0,
    acceptedAt: state.now,
    arrivesAt: state.now,
    boardingStartsAt: state.now + 120,
    hardDepartureAt: state.now + 190,
    status: 'active',
    promises: [
      { kind: 'dock', label: 'Berth access', target: 1, completed: 1, payoutCredits: 0 },
      { kind: 'passengers-returned', label: 'Passengers returned', target: 1, completed: 0, payoutCredits: 0 }
    ],
    passengerSpendingCredits: 0,
    procurementCostCredits: 0,
    settlementId: null,
    stayClass: 'contract',
    earliestDepartureAt: state.now + 20,
    plannedDepartureAt: state.now + 190,
    extensionUntil: null,
    recallAt: null
  } satisfies PortContract);
  return ship;
}

function passenger(state: StationState, ship: ArrivingShip, id: number): Visitor {
  const tileIndex = ship.bayTiles[0];
  const visitor: Visitor = {
    id,
    x: (tileIndex % state.width) + 0.5,
    y: Math.floor(tileIndex / state.width) + 0.5,
    tileIndex,
    state: VisitorState.ToLeisure,
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
    stayClass: 'contract',
    needs: createVisitorNeeds(id),
    recurringNeedActive: null
  };
  state.visitors.push(visitor);
  return visitor;
}

function testBoardingAndStranding(): void {
  const state = createInitialState({ seed: 9101, physicalStarterInventory: true, manualTrafficAdmission: true });
  tick(state, 0);
  const normalShip = contractShip(state, 91011);
  const normal = passenger(state, normalShip, 91012);
  normal.stayClass = 'errand';
  normal.needs = undefined;
  normal.state = VisitorState.ToDock;
  // Boarding now owns a physical transfer slot and crossing animation; allow
  // that visible movement to finish rather than asserting the old instant exit.
  advance(state, 3);
  assert(!state.visitors.some((visitor) => visitor.id === normal.id), 'A normally boarded passenger must leave the visitor list.');

  const strandedShip = contractShip(state, 91021);
  const stranded = passenger(state, strandedShip, 91022);
  const contract = state.portOps.contracts.find((entry) => entry.id === strandedShip.id)!;
  contract.boardingStartsAt = state.now;
  contract.hardDepartureAt = state.now;
  advance(state, 0.4);
  const preserved = state.visitors.find((visitor) => visitor.id === stranded.id);
  assert(preserved, 'A missed long-stay passenger must survive hard departure.');
  assert(preserved.originShipId === null && preserved.strandedFromShipId === strandedShip.id, 'Stranding must preserve provenance while severing the departed ship link.');
  assert(state.residents.length === 0, 'Stranding must not create residents.');
  assert(preserved.state !== VisitorState.ToDock, 'Stranded passengers must not immediately attempt a normal station exit.');
  const settlements = state.portOps.settlements.filter((entry) => entry.contractId === strandedShip.id).length;
  advance(state, 2);
  assert(state.visitors.some((visitor) => visitor.id === stranded.id), 'A stranded passenger must not auto-exit after the ship is gone.');
  assert(state.portOps.settlements.filter((entry) => entry.contractId === strandedShip.id).length === settlements, 'Hard departure must settle a contract exactly once.');
}

function testFailureStagesAndWorkPressure(): void {
  const state = createInitialState({ seed: 9102, physicalStarterInventory: true, manualTrafficAdmission: true });
  tick(state, 0);
  const ship = contractShip(state, 92011);
  const visitor = passenger(state, ship, 92012);
  visitor.needs!.hunger = 17;
  visitor.activeService = 'meal';
  visitor.state = VisitorState.ToCafeteria;
  visitor.serviceBlockedSince = state.now;
  visitor.needs!.unmetSince = state.now;
  runVisitorServiceFailureTestTick(state, visitor);
  assert(visitor.serviceFailureStage === 'unmet', 'Failure should begin as unmet after a blocked severe need.');
  state.now += 30;
  runVisitorServiceFailureTestTick(state, visitor);
  assert(String(visitor.serviceFailureStage) === 'balking', 'Failure should escalate to balking only after grace time.');
  state.now += 50;
  runVisitorServiceFailureTestTick(state, visitor);
  assert(String(visitor.serviceFailureStage) === 'distressed', 'Failure should escalate to distressed only after a larger grace period.');
  assert(getContractVisitorWorkMultiplier(state, ship.id) === 0.92, 'Distressed passengers should reduce only their own ship work to 92%.');
  assert(getContractVisitorWorkMultiplier(state, ship.id + 1) === 1, 'Other ships must retain full work speed.');
  visitor.needs!.hunger = 100;
  visitor.serviceBlockedSince = null;
  runVisitorServiceFailureTestTick(state, visitor);
  assert(String(visitor.serviceFailureStage) === 'none' && getContractVisitorWorkMultiplier(state, ship.id) === 1, 'Need recovery must restore normal work productivity.');
}

function testEarlyRecallAndBoundedExtensionReasons(): void {
  const failed = createInitialState({ seed: 9104, physicalStarterInventory: true, manualTrafficAdmission: true });
  tick(failed, 0);
  const failedShip = contractShip(failed, 94011);
  const failedVisitor = passenger(failed, failedShip, 94012);
  const failedContract = failed.portOps.contracts.find((entry) => entry.id === failedShip.id)!;
  failedShip.earliestDepartureAt = failed.now;
  failedContract.earliestDepartureAt = failed.now;
  failedVisitor.serviceFailureStage = 'distressed';
  failedVisitor.failureSince = failed.now - 90;
  failedVisitor.failureNeed = 'hunger';
  failedVisitor.serviceBlockedSince = failed.now - 90;
  failedVisitor.activeService = 'meal';
  failedVisitor.state = VisitorState.ToCafeteria;
  advance(failed, 0.2);
  assert(failedShip.visitPhase === 'recall' && failedContract.status === 'boarding', 'Sustained cohort failure after the minimum stay must trigger early recall.');
  assert(failedShip.visitScheduleReason === 'service-failure' && failedContract.visitScheduleReason === 'service-failure', 'Early recall must retain its player-facing cause.');

  const working = createInitialState({ seed: 9105, physicalStarterInventory: true, manualTrafficAdmission: true });
  tick(working, 0);
  const workingShip = contractShip(working, 95011);
  const workingContract = working.portOps.contracts.find((entry) => entry.id === workingShip.id)!;
  workingContract.boardingStartsAt = working.now;
  workingShip.portTurnaround = {
    phase: 'loading',
    customsTile: workingShip.bayTiles[0],
    cargoTile: workingShip.bayTiles[0],
    inspectionProgress: 1,
    inspectionRequired: 1,
    clearanceJobId: null,
    cargoReleased: true,
    inboundTotal: 0,
    inboundUnloaded: 0,
    outboundRequired: { rawMaterial: 10, meal: 0, tradeGood: 0 },
    outboundLoaded: { rawMaterial: 0, meal: 0, tradeGood: 0 },
    fuelRequired: 0,
    fuelDelivered: 0,
    loadingDeadlineAt: working.now + 20,
    payoutCredits: 0,
    fulfillmentRatio: 0,
    payoutSettled: false
  };
  advance(working, 0.2);
  assert(workingShip.visitPhase === 'visit-service' && workingContract.status === 'active', 'Useful unfinished work should defer recall once.');
  assert(workingShip.extensionUntil !== null && workingShip.visitScheduleReason === 'remaining-work', 'Extension must be bounded and retain its work reason.');
  assert(workingContract.visitScheduleReason === 'remaining-work', 'Contract and ship must agree on the extension cause.');
  const firstExtension = workingShip.extensionUntil;
  workingContract.boardingStartsAt = working.now;
  advance(working, 0.2);
  assert(workingShip.extensionUntil === firstExtension, 'A ship must never receive repeated free extensions.');

  const parsed = parseAndMigrateSave(serializeSave('visit-reasons', working, 'test'));
  assert(parsed.ok, 'Visit-reason snapshot should parse.');
  const restored = hydrateStateFromSave(parsed.save).state;
  assert(restored.arrivingShips.find((entry) => entry.id === workingShip.id)?.visitScheduleReason === 'remaining-work', 'Ship extension reason must survive save/load.');
  assert(restored.portOps.contracts.find((entry) => entry.id === workingContract.id)?.visitScheduleReason === 'remaining-work', 'Contract extension reason must survive save/load.');
}

function testReliefAndSaveRoundTrip(): void {
  const state = createInitialState({ seed: 9103, physicalStarterInventory: true, manualTrafficAdmission: true });
  tick(state, 0);
  const ship = contractShip(state, 93011);
  const visitor = passenger(state, ship, 93012);
  visitor.originShipId = null;
  visitor.strandedFromShipId = ship.id;
  visitor.strandedAt = state.now;
  visitor.reliefEligibleAt = state.now + 10;
  visitor.serviceFailureStage = 'distressed';
  visitor.temporarySleepTargetTile = visitor.tileIndex;
  const beforeCredits = state.metrics.credits;
  assert(!transferStrandedVisitor(state, visitor.id), 'Relief must wait through its grace period.');

  const parsed = parseAndMigrateSave(serializeSave('failed-stay', state, 'test'));
  assert(parsed.ok, 'Failed-stay snapshot should parse.');
  const restored = hydrateStateFromSave(parsed.save).state;
  const loaded = restored.visitors.find((entry) => entry.id === visitor.id);
  assert(loaded?.strandedFromShipId === ship.id && loaded.serviceFailureStage === 'distressed', 'Save/load must preserve stranding provenance and stage.');
  assert(loaded?.temporarySleepTargetTile === null && loaded?.reservedTargetTile === null, 'Save/load must discard transient fixture claims safely.');
  restored.now = (loaded?.reliefEligibleAt ?? restored.now) + 0.1;
  const restoredCredits = restored.metrics.credits;
  assert(transferStrandedVisitor(restored, visitor.id), 'Eligible stranded passenger should accept paid relief transfer.');
  assert(restored.metrics.credits < restoredCredits && restored.metrics.credits <= beforeCredits, 'Relief transfer must charge station credits.');
  assert(!restored.visitors.some((entry) => entry.id === visitor.id), 'Relief must remove the stranded passenger exactly once.');
  assert(!transferStrandedVisitor(restored, visitor.id), 'Relief transfer cannot run twice for a removed visitor.');
}

function main(): void {
  testBoardingAndStranding();
  testFailureStagesAndWorkPressure();
  testEarlyRecallAndBoundedExtensionReasons();
  testReliefAndSaveRoundTrip();
  console.log('failed-stay-tests: ok');
}

main();
