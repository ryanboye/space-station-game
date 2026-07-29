import {
  createInitialState,
  getContractVisitorWorkMultiplier,
  runVisitorServiceFailureTestTick,
  tick,
  transferStrandedVisitor
} from '../src/sim/sim';
import { createVisitorNeeds } from '../src/sim/occupant-demand';
import { applyColdStartScenario } from '../src/sim/cold-start-scenarios';
import { hydrateStateFromSave, parseAndMigrateSave, serializeSave } from '../src/sim/save';
import {
  ResidentState,
  RoomType,
  TileType,
  VisitorState,
  type ArrivingShip,
  type PortContract,
  type Resident,
  type ResidentRole,
  type StationState,
  type VisitStayClass,
  type Visitor
} from '../src/sim/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function advance(state: StationState, seconds: number): void {
  state.controls.paused = false;
  for (let elapsed = 0; elapsed < seconds; elapsed += 0.2) tick(state, 0.2);
}

function contractShip(state: StationState, id: number, stayClass: VisitStayClass = 'contract'): ArrivingShip {
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
    stayClass,
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
    stayClass,
    earliestDepartureAt: state.now + 20,
    plannedDepartureAt: state.now + 190,
    extensionUntil: null,
    recallAt: null
  } satisfies PortContract);
  return ship;
}

function passenger(
  state: StationState,
  ship: ArrivingShip,
  id: number,
  stayClass: VisitStayClass = 'contract'
): Visitor {
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
    stayClass,
    needs: createVisitorNeeds(id),
    recurringNeedActive: null
  };
  state.visitors.push(visitor);
  return visitor;
}

/** A resident built the way `makeResident` builds one, so the tick sees an
 * ordinary occupant and only the named pressure differs between subjects. */
function resident(
  state: StationState,
  id: number,
  tileIndex: number,
  role: ResidentRole,
  overrides: Partial<Resident> = {}
): Resident {
  const entry: Resident = {
    id,
    x: (tileIndex % state.width) + 0.5,
    y: Math.floor(tileIndex / state.width) + 0.5,
    tileIndex,
    path: [],
    speed: 1.8,
    hunger: 80,
    energy: 85,
    hygiene: 75,
    social: 72,
    safety: 70,
    stress: 10,
    routinePhase: 'rest',
    role,
    roleAffinity: {},
    state: ResidentState.Idle,
    carryingMeal: false,
    reservedServingTile: null,
    serveTimer: undefined,
    actionTimer: 0,
    retargetAt: 0,
    reservedTargetTile: null,
    homeShipId: null,
    homeDockId: null,
    housingUnitId: null,
    bedModuleId: null,
    satisfaction: 72,
    leaveIntent: 0,
    blockedTicks: 0,
    airExposureSec: 0,
    healthState: 'healthy',
    agitation: 8,
    activeIncidentId: null,
    confrontationUntil: 0,
    ...overrides
  };
  state.residents.push(entry);
  return entry;
}

/** Where an actor is actually walking, which is the only honest evidence that
 * they took (or skipped) a leg of their routine. */
function destinationTile(path: number[]): number | null {
  return path.length > 0 ? path[path.length - 1] : null;
}

/**
 * Move the routine clock onto the work leg without simulating a whole day.
 *
 * The routine period belongs to the sim, so this asks the production phase
 * clock rather than copying its constant: it steps the clock and lets an
 * ordinary zero-length tick report which leg the resident is now on.
 */
function advanceClockToWorkPhase(state: StationState, probe: Resident): void {
  state.controls.paused = false;
  for (let step = 0; step < 600; step += 1) {
    tick(state, 0);
    if (probe.routinePhase === 'work') return;
    state.now += 1;
  }
  throw new Error('The resident routine clock never reached its work leg.');
}

function testBoardingAndStranding(): void {
  const state = createInitialState({ seed: 9101, physicalStarterInventory: true, manualTrafficAdmission: true });
  tick(state, 0);
  const normalShip = contractShip(state, 91011);
  const normal = passenger(state, normalShip, 91012);
  normal.stayClass = 'errand';
  normal.needs = undefined;
  normal.state = VisitorState.ToDock;
  const normalContract = state.portOps.contracts.find((entry) => entry.id === normalShip.id);
  assert(normalContract, 'Normal boarding fixture needs its active contract.');
  // Open the production recall seam first. A docked origin is not itself an
  // exit: boarding begins only when its contract calls the passenger home.
  normalContract.boardingStartsAt = state.now;
  normalContract.hardDepartureAt = state.now + 30;
  // Boarding owns a physical transfer slot and crossing animation; allow that
  // visible movement to finish rather than asserting the old instant exit.
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

/**
 * Shore leave has to hold in both directions.
 *
 * A passenger whose leisure stop cannot be routed must spend the visit on
 * something else rather than stalling at an empty room, and the same passenger
 * must drop whatever they found the moment their ship calls them back — with
 * the physical claim released, not left pinning a counter.
 */
function testShoreLeaveAlternativeAndRecall(): void {
  const state = createInitialState({ seed: 9107, physicalStarterInventory: true, manualTrafficAdmission: true });
  // A station with a real, working public galley and no Lounge, Rec Hall,
  // Cantina, Observatory or Market at all: the leisure leg is genuinely
  // unroutable here rather than merely busy, which is the shortage the
  // fallback chain exists for, and the alternative it finds is a real service.
  assert(applyColdStartScenario(state, 'opening-food-cycle'), 'Expected the opening-food-cycle fixture.');
  state.controls.shipsPerCycle = 0;
  tick(state, 0);
  const ship = contractShip(state, 97011, 'shore');
  const contract = state.portOps.contracts.find((entry) => entry.id === ship.id)!;
  const visitor = passenger(state, ship, 97012, 'shore');
  visitor.state = VisitorState.ToLeisure;
  visitor.spawnedAt = state.now;
  advance(state, 1);

  const alternative = state.visitors.find((entry) => entry.id === visitor.id);
  assert(alternative, 'A shore passenger must remain aboard the station while it looks for an alternative.');
  assert(
    alternative.state === VisitorState.ToCafeteria,
    `An unroutable leisure stop must send a shore passenger to another service, got ${alternative.state}.`
  );
  assert(alternative.path.length > 0, 'The alternative must be a real walked route, not an intention.');
  assert(alternative.reservedServingTile !== null, 'The alternative must claim a real physical counter.');
  const claimed = state.reservations.filter(
    (reservation) => reservation.releaseReason === null && reservation.ownerKind === 'visitor' && reservation.ownerId === visitor.id
  );
  assert(claimed.length > 0, 'Choosing the alternative must take a real physical claim.');

  // Recall now outranks the alternative: the ship calls, and the passenger
  // turns around with nothing still reserved behind them.
  contract.boardingStartsAt = state.now;
  advance(state, 0.2);
  assert(ship.visitPhase === 'recall' && contract.status === 'boarding', 'A shore ship at its boarding time must begin recall.');
  const recalled = state.visitors.find((entry) => entry.id === visitor.id);
  assert(recalled, 'Recall must not delete a shore passenger.');
  assert(recalled.state === VisitorState.ToDock, `Recall must turn a shore passenger toward the dock, got ${recalled.state}.`);
  assert(recalled.activeService === null, 'Recall must end the service the passenger was pursuing.');
  const heldAfterRecall = state.reservations.filter(
    (reservation) => reservation.releaseReason === null && reservation.ownerKind === 'visitor' && reservation.ownerId === visitor.id
  );
  assert(heldAfterRecall.length === 0, `Recall must release every claim, ${heldAfterRecall.length} left.`);
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
  // A station whose galley actually serves guests, so "did not head for the
  // berth" means the crew are still ashore with somewhere to be — not that
  // they had nothing to do and drifted back to the ship on their own.
  assert(applyColdStartScenario(working, 'opening-food-cycle'), 'Expected the opening-food-cycle fixture.');
  working.controls.shipsPerCycle = 0;
  tick(working, 0);
  const workingShip = contractShip(working, 95011);
  const workingContract = working.portOps.contracts.find((entry) => entry.id === workingShip.id)!;
  // The deferral is only worth anything if the crew are still ashore for it,
  // so the fixture carries the passenger the extension is being bought for.
  const workingCrew = passenger(working, workingShip, 95012);
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
  // The crew half of the same deferral: nobody is called back to the ship
  // while its work is unfinished, and they keep their station-side provenance.
  const stillAshore = working.visitors.find((entry) => entry.id === workingCrew.id);
  assert(stillAshore, 'A deferred recall must leave the contract crew on the station.');
  assert(stillAshore.originShipId === workingShip.id, 'Deferred crew must keep their ship provenance.');
  assert(
    stillAshore.state !== VisitorState.ToDock,
    `Deferred crew must not be walking back to the berth, got ${stillAshore.state}.`
  );
  assert(
    working.visitors.filter((entry) => entry.originShipId === workingShip.id).every((entry) => entry.state !== VisitorState.ToDock),
    'No crew member may be recalled while their ship still has useful work.'
  );
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

/**
 * Residents carry their own pressure.
 *
 * It accumulates from the shortages they physically live with, it survives a
 * reload, it costs the station their shift before it costs the station the
 * resident, and a resident who never recovers leaves exactly once.
 */
function testResidentStressWithdrawalAndDeparture(): void {
  const state = createInitialState({ seed: 9108, physicalStarterInventory: true, manualTrafficAdmission: true });
  assert(applyColdStartScenario(state, 'demo-station'), 'Expected the demo-station fixture.');
  tick(state, 0);
  const homeTile = state.rooms.findIndex((room, tile) => room === RoomType.Dorm && state.tiles[tile] === TileType.Floor);
  assert(homeTile >= 0, 'The demo station must have a walkable Dorm tile to live on.');

  // Two residents of the same role, on the same tile, with the same needs.
  // Stress is the only difference between them, so where they walk next is
  // attributable to stress and nothing else. Hydroponics and the Kitchen are
  // this role's work rooms and are never leisure or idle-wander destinations,
  // which is what makes the skip unambiguous.
  const steady = resident(state, 98011, homeTile, 'hydro_assist');
  const strained = resident(state, 98012, homeTile, 'hydro_assist', { stress: 90 });
  advanceClockToWorkPhase(state, steady);
  assert(strained.routinePhase === 'work', 'Both residents must be on the same routine leg.');

  const workRooms = new Set([RoomType.Hydroponics, RoomType.Kitchen]);
  const steadyTarget = destinationTile(steady.path);
  const strainedTarget = destinationTile(strained.path);
  assert(
    steadyTarget !== null && workRooms.has(state.rooms[steadyTarget]),
    `A settled resident must take the work leg of their routine, went to ${steadyTarget === null ? 'nowhere' : state.rooms[steadyTarget]}.`
  );
  assert(
    strainedTarget === null || !workRooms.has(state.rooms[strainedTarget]),
    `A resident under sustained stress must withdraw from work, went to ${strainedTarget === null ? 'nowhere' : state.rooms[strainedTarget]}.`
  );
  assert(
    strained.state === ResidentState.Idle,
    `A withdrawn resident stays visibly off-shift, got ${strained.state}.`
  );

  // Withdrawal is a stage, not a state change: relieve the pressure and the
  // same off-shift resident takes the same shift on their very next decision.
  strained.stress = 20;
  tick(state, 0);
  const recoveredTarget = destinationTile(strained.path);
  assert(
    recoveredTarget !== null && workRooms.has(state.rooms[recoveredTarget]),
    'Relieving the stress must return the resident to work on the next decision.'
  );

  // --- accumulation, persistence and departure ------------------------------
  const pressured = resident(state, 98013, homeTile, 'none', {
    hunger: 12,
    energy: 22,
    hygiene: 14,
    social: 20,
    safety: 24,
    stress: 30
  });
  const leaving = resident(state, 98014, homeTile, 'none', { satisfaction: 4, leaveIntent: 95.5 });
  const stressBefore = pressured.stress;
  const departuresBefore = state.usageTotals.residentDepartures;
  advance(state, 2);
  assert(pressured.stress > stressBefore, 'Living with real shortages must accumulate resident stress.');
  assert(!state.residents.some((entry) => entry.id === leaving.id), 'A resident past the departure threshold must actually leave.');
  assert(
    state.usageTotals.residentDepartures === departuresBefore + 1,
    `A departure must be counted exactly once, got ${state.usageTotals.residentDepartures - departuresBefore}.`
  );
  const departurePenalty = state.usageTotals.ratingFromResidentDeparture;
  advance(state, 2);
  assert(state.usageTotals.residentDepartures === departuresBefore + 1, 'Later ticks must not re-count a departure.');
  assert(state.usageTotals.ratingFromResidentDeparture === departurePenalty, 'A departure must charge its rating penalty exactly once.');

  const parsed = parseAndMigrateSave(serializeSave('resident-stress', state, 'test'));
  assert(parsed.ok, 'Resident-stress snapshot should parse.');
  const restored = hydrateStateFromSave(parsed.save).state;
  const loaded = restored.residents.find((entry) => entry.id === pressured.id);
  assert(loaded, 'A stressed resident must survive save/load.');
  assert(loaded.stress === pressured.stress, 'Accumulated stress must be durable, or a reload would forgive it.');
  assert(loaded.leaveIntent === pressured.leaveIntent, 'Leave intent must be durable across a reload.');
  assert(
    !restored.residents.some((entry) => entry.id === leaving.id),
    'A departed resident must not reappear on load.'
  );
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
  testShoreLeaveAlternativeAndRecall();
  testEarlyRecallAndBoundedExtensionReasons();
  testResidentStressWithdrawalAndDeparture();
  testReliefAndSaveRoundTrip();
  console.log('failed-stay-tests: ok');
}

main();
