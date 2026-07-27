import { createInitialState, recordServiceCompletion, tick } from '../src/sim/sim';
import { createVisitorNeeds, decayVisitorNeeds, deriveVisitStayClass, restoreRecurringNeed, selectRecurringNeed } from '../src/sim/occupant-demand';
import { hydrateStateFromSave, parseAndMigrateSave, serializeSave } from '../src/sim/save';
import {
  ModuleType,
  RoomType,
  TileType,
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

function serviceTile(state: StationState, module: ModuleType): number {
  const tile = state.modules.findIndex((candidate) => candidate === module);
  assert(tile >= 0, `Expected ${module} in starter state.`);
  return tile;
}

function longStayShip(state: StationState, id = 9001): ArrivingShip {
  const dockTile = state.docks[0]?.accessTile ?? state.docks[0]?.tiles[0] ?? 0;
  const ship: ArrivingShip = {
    id,
    kind: 'transient',
    size: 'medium',
    bayTiles: [dockTile],
    bayCenterX: 0.5,
    bayCenterY: 0.5,
    shipType: 'industrial',
    lane: 'north',
    originDockId: state.docks[0]?.id ?? null,
    assignedDockId: state.docks[0]?.id ?? null,
    assignedDockSourceKey: state.docks[0]?.sourceKey ?? null,
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
      callsign: `TEST-${id}`,
      shipName: 'Test Hauler',
      lane: 'north',
      shipType: 'industrial',
      offerKind: 'freight',
      size: 'medium',
      status: 'holding',
      forecastAt: state.now,
      arrivesAt: state.now,
      expiresAt: state.now + 600,
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
    earliestDepartureAt: state.now + 80,
    plannedDepartureAt: state.now + 190,
    extensionUntil: null,
    recallAt: null
  };
  state.arrivingShips.push(ship);
  return ship;
}

function contractFor(ship: ArrivingShip, now: number): PortContract {
  return {
    id: ship.id,
    offerId: ship.id,
    shipId: ship.id,
    callsign: ship.portManifest?.callsign ?? 'TEST',
    offerKind: 'freight',
    assignedBerthAnchor: 0,
    acceptedAt: now,
    arrivesAt: now,
    boardingStartsAt: now + 120,
    hardDepartureAt: now + 190,
    status: 'active',
    promises: [
      { kind: 'dock', label: 'Berth access', target: 1, completed: 1, payoutCredits: 0 },
      { kind: 'passengers-returned', label: 'Passengers returned', target: 1, completed: 0, payoutCredits: 0 }
    ],
    passengerSpendingCredits: 0,
    procurementCostCredits: 0,
    settlementId: null,
    stayClass: 'contract',
    earliestDepartureAt: now + 80,
    plannedDepartureAt: now + 190,
    extensionUntil: null,
    recallAt: null
  };
}

function longStayVisitor(state: StationState, ship: ArrivingShip, id = 9101): Visitor {
  const tileIndex = ship.bayTiles[0];
  const visitor: Visitor = {
    id,
    name: 'Loop Tester',
    trait: 'patient',
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

function testDerivationAndNeedCycle(): void {
  assert(deriveVisitStayClass({ shipType: 'trader', size: 'small', offerKind: 'passenger', seed: 1 }) === 'errand', 'Small pods must remain errands.');
  assert(deriveVisitStayClass({ shipType: 'colonist', size: 'large', offerKind: 'passenger', seed: 2 }) === 'extended', 'Colonist calls must be extended stays.');
  assert(['contract', 'extended'].includes(deriveVisitStayClass({ shipType: 'industrial', size: 'medium', offerKind: 'freight', seed: 3 })), 'Industrial calls must become long stays.');
  const needs = createVisitorNeeds(33);
  needs.hunger = 20;
  assert(selectRecurringNeed(needs) === 'hunger', 'The lowest critical need should win the next activity.');
  decayVisitorNeeds(needs, 10);
  const beforeRestore = needs.hunger;
  restoreRecurringNeed(needs, 'hunger');
  assert(needs.hunger > beforeRestore && needs.completions === 1, 'A completed recurring activity must restore the matching need.');
}

function testRecurringCompletionDoesNotAdvancePromise(): void {
  const state = createInitialState({ seed: 7001, physicalStarterInventory: true, manualTrafficAdmission: true });
  const ship = longStayShip(state);
  const contract = contractFor(ship, state.now);
  contract.promises.push({ kind: 'hygiene-served', label: 'Wash visits', target: 1, completed: 0, payoutCredits: 0 });
  state.portOps.contracts.push(contract);
  const visitor = longStayVisitor(state, ship);
  const sink = serviceTile(state, ModuleType.Sink);
  visitor.tileIndex = sink;
  visitor.x = (sink % state.width) + 0.5;
  visitor.y = Math.floor(sink / state.width) + 0.5;
  visitor.needs!.active = 'hygiene';
  visitor.recurringNeedActive = 'hygiene';
  visitor.activeService = 'hygiene';
  const recorded = recordServiceCompletion(state, {
    population: 'visitor', actorId: visitor.id, service: 'hygiene', tileIndex: sink, shipId: ship.id, advancePromise: false, firstForActor: true
  });
  assert(recorded !== null, 'Recurring hygiene must use a real physical fixture.');
  assert(contract.promises.find((promise) => promise.kind === 'hygiene-served')?.completed === 0, 'Recurring needs must not advance one-shot promises.');
}

function testRecallHardDepartureAndSaveResume(): void {
  const state = createInitialState({ seed: 7002, physicalStarterInventory: true, manualTrafficAdmission: true });
  const ship = longStayShip(state, 9201);
  const contract = contractFor(ship, state.now);
  state.portOps.contracts.push(contract);
  const visitor = longStayVisitor(state, ship, 9202);
  visitor.needs!.hunger = 18;
  const serialized = serializeSave('occupant-loop', state, 'test');
  const parsed = parseAndMigrateSave(serialized);
  assert(parsed.ok, 'Occupant-loop snapshot should parse.');
  const restored = hydrateStateFromSave(parsed.save);
  assert(restored.state.visitors.length === 1, 'Active long-stay visitors must survive save/load.');
  assert(restored.state.visitors[0].needs?.hunger === 18, 'Recurring need state must survive save/load.');
  assert(restored.state.residents.length === 0, 'Temporary visitors must not become Residents on hydrate.');

  const resumedShip = restored.state.arrivingShips.find((entry) => entry.id === ship.id);
  assert(resumedShip, 'Saved origin ship must survive hydration.');
  const resumedContract = restored.state.portOps.contracts.find((entry) => entry.id === ship.id);
  assert(resumedContract, 'Saved contract must survive hydration.');
  resumedContract.boardingStartsAt = restored.state.now;
  advance(restored.state, 3.4);
  assert(resumedContract.status === 'boarding', 'Recall should place the contract into boarding.');
  assert(resumedShip.visitPhase === 'boarding', 'Recall should remain visible before boarding begins.');
  assert(restored.state.visitors.every((entry) => entry.originShipId !== ship.id || entry.state === VisitorState.ToDock || entry.path.length === 0), 'Recall must clear irrelevant visitor activity.');

  // A fresh cohort makes the hard-departure assertion deterministic even if the
  // recalled visitor reached the access tile during the preceding tick. Missed
  // passengers now remain temporary occupants until a relief transfer rather
  // than disappearing or silently becoming residents.
  const departureVisitor = longStayVisitor(restored.state, resumedShip, 9203);
  resumedContract.hardDepartureAt = restored.state.now;
  resumedContract.boardingStartsAt = restored.state.now;
  resumedShip.extensionUntil = restored.state.now + 1;
  resumedShip.visitPhase = 'boarding';
  advance(restored.state, 0.4);
  const stranded = restored.state.visitors.find((entry) => entry.id === departureVisitor.id);
  assert(stranded?.originShipId === null && stranded.strandedFromShipId === resumedShip.id, 'Hard departure must preserve a missed passenger as a stranded temporary occupant.');
  assert(restored.state.residents.length === 0, 'A stranded visitor must never become a resident implicitly.');
  const settlements = restored.state.portOps.settlements.filter((settlement) => settlement.contractId === resumedContract.id).length;
  advance(restored.state, 1);
  assert(restored.state.portOps.settlements.filter((settlement) => settlement.contractId === resumedContract.id).length === settlements, 'Repeated departure ticks must not settle twice.');
}

function main(): void {
  testDerivationAndNeedCycle();
  testRecurringCompletionDoesNotAdvancePromise();
  testRecallHardDepartureAndSaveResume();
  console.log('occupant-loop-tests: ok');
}

main();
