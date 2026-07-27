import {
  createInitialState,
  getContractVisitorWorkMultiplier,
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
  advance(state, 0.4);
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
  visitor.activeService = null;
  visitor.state = VisitorState.Leisure;
  advance(state, 0.4);
  assert((visitor.serviceFailureStage ?? 'none') === 'none', 'A severe need with a reachable route must not immediately become a failure.');

  visitor.activeService = 'meal';
  visitor.state = VisitorState.ToCafeteria;
  visitor.serviceBlockedSince = state.now;
  advance(state, 0.4);
  assert(visitor.serviceFailureStage === 'unmet', 'Failure should begin as unmet after a blocked severe need.');
  advance(state, 30);
  assert(String(visitor.serviceFailureStage) === 'balking', 'Failure should escalate to balking only after grace time.');
  advance(state, 50);
  assert(String(visitor.serviceFailureStage) === 'distressed', 'Failure should escalate to distressed only after a larger grace period.');
  assert(getContractVisitorWorkMultiplier(state, ship.id) === 0.92, 'Distressed passengers should reduce only their own ship work to 92%.');
  assert(getContractVisitorWorkMultiplier(state, ship.id + 1) === 1, 'Other ships must retain full work speed.');
  visitor.needs!.hunger = 100;
  visitor.serviceBlockedSince = null;
  advance(state, 0.4);
  assert(String(visitor.serviceFailureStage) === 'none' && getContractVisitorWorkMultiplier(state, ship.id) === 1, 'Need recovery must restore normal work productivity.');
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
  testReliefAndSaveRoundTrip();
  console.log('failed-stay-tests: ok');
}

main();
