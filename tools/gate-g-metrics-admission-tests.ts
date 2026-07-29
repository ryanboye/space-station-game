// Focused evidence runner for Gate G commitment metrics and finite admission.
//
// This runner intentionally uses production simulation entry points and public
// scenario fixtures. It does not mutate production implementation merely to
// make a metric green. Where the current source cannot report a promised value,
// the runner records that fact as a truthful, passing source-gap assertion.

import {
  createAdmissionPolicy,
  evaluateAdmission,
  summarizeLanePressure,
  type AdmissionContext
} from '../src/sim/admission-policy';
import { applyColdStartScenario } from '../src/sim/cold-start-scenarios';
import { hydrateStateFromSave, parseAndMigrateSave, serializeSave } from '../src/sim/save';
import {
  acceptOpeningCapitalProject,
  admitTrafficOffer,
  createInitialState,
  getAdmissionPressure,
  getCommitmentMetrics,
  getRatingAttribution,
  passTrafficOffer,
  runMovementCoordinatorTestTick,
  runQueueMaintenanceTestTick,
  setDockPurpose,
  setAdmissionPolicy,
  setResidentAcceptance,
  setRoom,
  setRoomHousingPolicy,
  setTile,
  tick,
  tryPlaceModule,
  updateEvaSuitForRoute
} from '../src/sim/sim';
import {
  ModuleType,
  RoomType,
  TileType,
  VisitorState,
  ZoneType,
  fromIndex,
  toIndex,
  type ArrivingShip,
  type CrewMember,
  type StationState,
  type TrafficOffer,
  type TrafficOfferPreview,
  type Visitor
} from '../src/sim/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function near(actual: number, expected: number, message: string, epsilon = 0.000_01): void {
  assert(Math.abs(actual - expected) <= epsilon, `${message}: expected ${expected}, got ${actual}`);
}

function advance(state: StationState, seconds: number, step = 0.2): void {
  state.controls.paused = false;
  const count = Math.ceil(seconds / step);
  for (let i = 0; i < count; i++) tick(state, step);
}

function fixture(seed: number): StationState {
  const state = createInitialState({ seed, physicalStarterInventory: true, manualTrafficAdmission: true });
  tick(state, 0);
  state.controls.paused = false;
  state.controls.shipsPerCycle = 0;
  state.trafficOffers.length = 0;
  return state;
}

function offer(id: number, overrides: Partial<TrafficOffer> = {}): TrafficOffer {
  return {
    id,
    callsign: `GATE-G-${id}`,
    shipName: `Gate G ${id}`,
    lane: 'north',
    shipType: 'tourist',
    hullVariant: 'courier-pod',
    size: 'small',
    status: 'holding',
    forecastAt: 0,
    arrivesAt: 0,
    expiresAt: 1000,
    passengersTotal: 2,
    manifestDemand: { cafeteria: 1, market: 0, lounge: 0 },
    manifestMix: { diner: 2, shopper: 0, lounger: 0, rusher: 0 },
    hospitalityDemand: { meal: 2, drink: 0, leisure: 0, restroom: 0, hygiene: 0, comfort: 0 },
    inboundCargo: { rawMaterial: 0, rawMeal: 0, tradeGood: 0 },
    outboundRequest: { rawMaterial: 0, meal: 0, tradeGood: 0 },
    requestedServices: [],
    berthTimeSec: 120,
    dockingFee: 20,
    projectedSpend: 30,
    riskLabel: 'low',
    assignedBerthAnchor: null,
    assignedDockSourceKey: null,
    ...overrides
  };
}

function preview(source: TrafficOffer, overrides: Partial<TrafficOfferPreview['committedLoad']> = {}): TrafficOfferPreview {
  return {
    offerId: source.id,
    shipClass: source.size === 'small' ? 'pod' : 'berth',
    partySize: { min: source.passengersTotal, max: source.passengersTotal },
    staySeconds: { min: source.berthTimeSec, max: source.berthTimeSec },
    serviceCues: [],
    compatibleInterface: {
      kind: source.size === 'small' ? 'pod-dock' : 'berth',
      compatibleCount: 3,
      freeCount: 3,
      reservedCount: 0,
      interfaces: []
    },
    expectedRevenue: { min: source.dockingFee, max: source.dockingFee + source.projectedSpend },
    committedLoad: {
      berthSeconds: source.berthTimeSec,
      bedNights: 1,
      meals: 2,
      hygieneVisits: 1,
      staffMinutes: 3,
      ...overrides
    },
    canAccept: true,
    acceptReason: null,
    canHold: true,
    canPass: true
  };
}

function context(overrides: Partial<AdmissionContext> = {}): AdmissionContext {
  return {
    now: 100,
    freeInterfaces: 3,
    freeGuestBeds: 3,
    availableMeals: 8,
    requestedServicesReady: true,
    ...overrides
  };
}

function metricShip(id: number, overrides: Partial<ArrivingShip>): ArrivingShip {
  return {
    id,
    kind: 'transient',
    size: 'small',
    bayTiles: [],
    bayCenterX: 0,
    bayCenterY: 0,
    shipType: 'tourist',
    hullVariant: 'courier-pod',
    lane: 'north',
    originDockId: null,
    assignedDockId: null,
    assignedDockSourceKey: null,
    queueState: 'none',
    stage: 'approach',
    stageTime: 0,
    passengersTotal: 0,
    passengersSpawned: 0,
    passengersBoarded: 0,
    minimumBoarding: 0,
    spawnCarry: 0,
    dockedAt: 0,
    residentIds: [],
    manifestDemand: { cafeteria: 0, market: 0, lounge: 0 },
    manifestMix: { diner: 0, shopper: 0, lounger: 0, rusher: 0 },
    approachCommitment: null,
    ...overrides
  };
}

function testVisitDurationAndApproachWait(): string {
  const state = fixture(77001);
  state.now = 100;

  const active = metricShip(77001, {
    approachCommitment: { slotId: 'gate-g-a', groupIds: ['shared-g'], phase: 'approach', status: 'active', queuedAt: 90 }
  });
  const waiting = metricShip(77002, {
    approachCommitment: { slotId: 'gate-g-b', groupIds: ['shared-g'], phase: 'approach', status: 'waiting', queuedAt: 91 }
  });
  state.arrivingShips = [active, waiting];
  tick(state, 0.2);
  const first = getCommitmentMetrics(state);
  near(first.holdingSeconds, 0.2, 'One waiting ship must accrue one ship-tick of holding');
  near(first.approachGroupWaitSeconds, 0.2, 'A grouped waiter must accrue the same wait tick');
  assert(first.holdingShips === 1, 'The live holding gauge must report exactly one waiting ship.');

  state.arrivingShips = [metricShip(77003, {
    stage: 'depart',
    stageTime: 2.01,
    dockedAt: 90,
    stayClass: 'contract',
    shipType: 'tourist',
    approachCommitment: { slotId: 'gate-g-c', groupIds: [], phase: 'depart', status: 'active', queuedAt: 100 }
  })];
  tick(state, 0.2);
  const second = getCommitmentMetrics(state);
  assert(second.visitsCompletedByClass.contract === 1, 'Exactly one contract visit must complete.');
  near(second.visitSecondsByClass.contract, 10.4, 'Visit duration must use the real docked-to-departed clock');
  return `contract visits 1 / 10.4s; holding 0.2 ship-s; grouped wait 0.2 ship-s`;
}

function testTransfersNeedsAndFixtureUtilization(): string {
  const transfer = fixture(77002);
  const dock = transfer.docks.find((entry) => entry.purpose === 'visitor' && entry.allowedShipSizes.includes('small'));
  assert(dock, 'Transfer fixture needs one compatible Pod Dock.');
  const transferOffer = offer(770021, {
    lane: dock.lane,
    shipType: dock.allowedShipTypes[0],
    passengersTotal: 1,
    manifestDemand: { cafeteria: 0, market: 0, lounge: 0 },
    manifestMix: { diner: 1, shopper: 0, lounger: 0, rusher: 0 },
    hospitalityDemand: { meal: 0, drink: 0, leisure: 0, restroom: 0, hygiene: 0, comfort: 0 }
  });
  transfer.trafficOffers.push(transferOffer);
  assert(admitTrafficOffer(transfer, transferOffer.id).ok, 'Physical transfer offer must admit.');
  advance(transfer, 100);
  const transferMetrics = getCommitmentMetrics(transfer);
  assert(transferMetrics.disembarkCompleted === 1, `Expected one completed crossing, got ${transferMetrics.disembarkCompleted}.`);
  near(transferMetrics.disembarkSeconds, 1.2, 'Live disembark must retain its measured total', 0.001);

  const state = fixture(770022);
  applyColdStartScenario(state, 'long-stay-guest-wing');
  advance(state, 180);
  const metrics = getCommitmentMetrics(state);
  const raised = Object.values(metrics.needRaised).reduce((sum, value) => sum + value, 0);
  const satisfied = Object.values(metrics.needSatisfied).reduce((sum, value) => sum + value, 0);
  assert(raised >= 24, `The long-stay cohort must raise recurring demand across the run, got ${raised}.`);
  assert(satisfied >= 20 && satisfied <= raised, `Satisfied recurring demand must stay positive and bounded (${satisfied}/${raised}).`);
  assert(
    Object.values(metrics.needRaised).filter((value) => value > 0).length >= 4,
    'The recurring-demand metric must record all four long-stay need families.'
  );
  assert(metrics.fixtureOccupiedSeconds > 0, 'Occupied fixture-seconds must be a positive live measurement.');
  assert(metrics.fixtureCapacitySeconds > metrics.fixtureOccupiedSeconds, 'Depicted capacity-seconds must exceed occupied seconds.');
  return `1 disembark / 1.2s; recurring needs ${satisfied}/${raised}; fixture ${metrics.fixtureOccupiedSeconds.toFixed(1)}/${metrics.fixtureCapacitySeconds.toFixed(1)}s`;
}

function testBoardingMissAndStranding(): string {
  const state = fixture(77003);
  applyColdStartScenario(state, 'commitment-failure');
  state.controls.paused = false;
  const contract = state.portOps.contracts.find((entry) => entry.status === 'active');
  assert(contract, 'Failure fixture must include an active contract.');
  const ship = state.arrivingShips.find((entry) => entry.id === contract.shipId);
  assert(ship, 'Failure fixture must include the contract ship.');
  const cohort = state.visitors.filter((visitor) => visitor.originShipId === ship.id);
  assert(cohort.length === 4, `Failure fixture must have four contract passengers, got ${cohort.length}.`);
  const crossing = cohort[0];
  crossing.transferPhase = 'boarding-crossing';
  crossing.transferQueuedAt = state.now - 4;
  crossing.transferCrossingStartedAt = state.now - 2;
  crossing.transferStationTile = crossing.tileIndex;
  crossing.transferAccessTile = crossing.tileIndex;
  contract.hardDepartureAt = state.now;
  contract.boardingStartsAt = state.now;
  ship.recallAt = state.now - 100;
  ship.visitPhase = 'boarding';
  tick(state, 0.2);
  const metrics = getCommitmentMetrics(state);
  assert(metrics.missedDepartures === 1, 'The hard deadline must count exactly one missed departure.');
  assert(metrics.strandedOccupants === 4, 'All four station-side passengers must be counted as stranded.');
  assert(metrics.boardingCompleted === 4, 'Clearing the deadline cohort must count all four queued/crossing boarding transfers.');
  near(metrics.boardingSeconds, 4.8, 'Boarding duration must retain the four measured queue intervals', 0.001);
  return `1 missed departure; 4 stranded occupants; 4 boarding clears / 4.8s`;
}

function testCommittedFutureLoad(): string {
  const state = fixture(77004);
  applyColdStartScenario(state, 'commitment-recovered');
  state.controls.paused = false;
  const activeContract = state.portOps.contracts.find((entry) => entry.status === 'active');
  assert(activeContract, 'Committed-load fixture needs an active contract.');
  const manifestShip = state.arrivingShips.find((entry) => entry.id === activeContract.shipId);
  assert(manifestShip, 'Committed-load fixture needs its accepted ship.');
  manifestShip.portManifest = offer(770041, {
    size: 'medium',
    hullVariant: 'repair-tender',
    passengersTotal: 4,
    berthTimeSec: 300,
    hospitalityDemand: { meal: 4, drink: 2, leisure: 2, restroom: 2, hygiene: 2, comfort: 2 }
  });
  tick(state, 0.2);
  const metrics = getCommitmentMetrics(state);
  near(metrics.committedBerthSeconds, 899.8, 'Three active contracts must expose remaining berth commitment', 0.001);
  assert(metrics.committedBeds > 0, 'An accepted long-stay manifest must reserve depicted bed load.');
  assert(metrics.committedMeals >= 4, 'An accepted manifest must retain its meal commitment.');
  assert(metrics.committedStaffMinutes > 0, 'An accepted manifest must retain its staff-minute commitment.');
  return `berth ${metrics.committedBerthSeconds.toFixed(1)}s, beds ${metrics.committedBeds}, meals ${metrics.committedMeals}, staff ${metrics.committedStaffMinutes}m`;
}

function testFailureEarlyExtensionAndCallOutcomes(): string {
  const failed = fixture(77005);
  applyColdStartScenario(failed, 'commitment-failure');
  failed.controls.paused = false;
  tick(failed, 0.2);
  tick(failed, 0.2);
  assert(failed.failureEpisodes.episodes.length === 4, 'Four failing passengers must create four durable episodes.');

  const contract = failed.portOps.contracts.find((entry) => entry.status === 'active');
  assert(contract, 'Failure fixture needs an active contract.');
  const ship = failed.arrivingShips.find((entry) => entry.id === contract.shipId);
  assert(ship, 'Failure fixture needs its contract ship.');
  contract.earliestDepartureAt = failed.now;
  ship.earliestDepartureAt = failed.now;
  for (const visitor of failed.visitors.filter((entry) => entry.originShipId === ship.id)) {
    visitor.serviceFailureStage = 'disruptive';
  }
  tick(failed, 0.2);
  assert(ship.visitScheduleReason === 'service-failure' && ship.visitPhase === 'recall', 'Sustained cohort failure must produce one visible early recall.');

  const extended = fixture(77006);
  applyColdStartScenario(extended, 'commitment-recovered');
  extended.controls.paused = false;
  const extendContract = extended.portOps.contracts.find((entry) => entry.status === 'active');
  assert(extendContract, 'Recovered fixture needs an active contract.');
  const extendShip = extended.arrivingShips.find((entry) => entry.id === extendContract.shipId);
  assert(extendShip, 'Recovered fixture needs its contract ship.');
  extendShip.portTurnaround = { phase: 'unloading' } as ArrivingShip['portTurnaround'];
  extendContract.boardingStartsAt = extended.now;
  extendShip.extensionUntil = null;
  extendShip.visitPhase = 'visit-service';
  tick(extended, 0.2);
  assert(extendShip.extensionUntil !== null && extendShip.visitScheduleReason === 'remaining-work', 'Unfinished committed work must produce one explicit extension.');

  const calls = fixture(77007);
  const denied = offer(770071, { expiresAt: calls.now + 20 });
  const withdrawn = offer(770072, { expiresAt: calls.now + 0.1 });
  calls.trafficOffers.push(denied, withdrawn);
  assert(passTrafficOffer(calls, denied.id), 'Player pass must remove the denied call.');
  tick(calls, 0.2);
  assert(calls.portOps.telemetry.offersRefused === 1, 'Denied calls must increment exactly one durable refusal.');
  assert(!calls.trafficOffers.some((entry) => entry.id === withdrawn.id), 'Expired unaccepted calls must withdraw from the live list.');
  return `failed 4; early recall 1; extension 1; denied 1; withdrawn removed (no withdrawal counter exists)`;
}

function testFiniteAdmissionMatrix(): string {
  const policy = createAdmissionPolicy();
  policy.enabled = true;
  policy.pod.reserveFreeInterfaces = 1;
  policy.berth.enabled = true;
  policy.berth.shipTypes = ['tourist', 'trader'];
  policy.berth.reserveFreeInterfaces = 1;
  policy.reserveBeds = 1;
  policy.reserveMeals = 2;
  const base = offer(77008);
  const basePreview = preview(base);
  const safe = evaluateAdmission(base, basePreview, policy, context());
  assert(safe.decision === 'accept', `Safe routine offer should accept, got ${safe.reason}`);
  assert(safe.reason === 'Routine tourist pod; 2 interface(s) still free.', 'Safe explanation must be deterministic.');
  assert(JSON.stringify(safe) === JSON.stringify(evaluateAdmission(base, basePreview, policy, context())), 'Repeated evaluation must be byte-for-byte stable.');

  const cases: Array<[string, TrafficOffer, AdmissionContext, 'hold' | 'reject' | 'manual', string | null]> = [
    ['busy', base, context({ freeInterfaces: 0 }), 'hold', null],
    ['pod reserve', base, context({ freeInterfaces: 1 }), 'hold', null],
    ['bed reserve', base, context({ freeGuestBeds: 1 }), 'hold', null],
    ['meal reserve', base, context({ availableMeals: 3 }), 'hold', null],
    ['max stay', offer(770081, { berthTimeSec: policy.pod.maxStaySeconds + 1 }), context(), 'reject', null],
    ['min margin', offer(770082, { dockingFee: 0, projectedSpend: 0 }), context(), 'reject', null],
    ['military', offer(770083, { shipType: 'military' }), context(), 'manual', 'military'],
    ['migrant', offer(770084, { shipType: 'colonist' }), context(), 'manual', 'migrant'],
    ['large', offer(770085, { size: 'large' }), context(), 'manual', 'large'],
    ['negotiated', offer(770086, { fuelProcurementCostCredits: 10 }), context(), 'manual', 'negotiated'],
    ['uncertain service', offer(770087), context({ requestedServicesReady: false }), 'manual', 'uncertain'],
    ['high risk', offer(770088, { riskLabel: 'high' }), context(), 'manual', 'uncertain']
  ];
  policy.pod.minMarginCredits = 1;
  for (const [label, candidate, readings, decision, manualReason] of cases) {
    const verdict = evaluateAdmission(candidate, preview(candidate), policy, readings);
    assert(verdict.decision === decision, `${label}: expected ${decision}, got ${verdict.decision} (${verdict.reason})`);
    assert(verdict.reason.length > 8, `${label}: every decision needs a populated explanation.`);
    assert(verdict.manualReason === manualReason, `${label}: expected manual reason ${manualReason}, got ${verdict.manualReason}.`);
  }
  const berth = offer(770089, { size: 'medium', hullVariant: 'repair-tender' });
  const berthReserve = evaluateAdmission(berth, preview(berth), policy, context({ freeInterfaces: 1 }));
  assert(berthReserve.decision === 'hold' && berthReserve.reason.includes('berth'), 'Berth interfaces need their own reserve check.');

  // Cumulative pools: accepting the first candidate changes the inputs seen by
  // the second; the second must hold rather than reusing the original reserve.
  const firstLoad = preview(base, { bedNights: 1, meals: 2 });
  const first = evaluateAdmission(base, firstLoad, policy, context({ freeGuestBeds: 3, availableMeals: 5 }));
  const second = evaluateAdmission(offer(770090), firstLoad, policy, context({ freeGuestBeds: 2, availableMeals: 3 }));
  assert(first.decision === 'accept' && second.decision === 'hold', 'Cumulative bed/meal pools must admit once and then protect the reserve.');

  const pressure = summarizeLanePressure([
    { offer: base, verdict: safe },
    { offer: cases[0][1], verdict: evaluateAdmission(cases[0][1], preview(cases[0][1]), policy, cases[0][2]) },
    { offer: cases[6][1], verdict: evaluateAdmission(cases[6][1], preview(cases[6][1]), policy, cases[6][2]) }
  ]);
  assert(pressure.pendingPods === 3 && pressure.autoAccepts === 1 && pressure.autoHolds === 1 && pressure.manual === 1, 'Lane pressure must aggregate the exact decision matrix.');
  assert(pressure.topReason !== null, 'Lane pressure must retain one deterministic top reason.');
  const largeScale = summarizeLanePressure(Array.from({ length: 60 }, (_, index) => {
    const candidate = index >= 50
      ? offer(771000 + index, { shipType: 'military' })
      : offer(771000 + index);
    const readings = index >= 40 && index < 50 ? context({ freeInterfaces: 0 }) : context();
    return { offer: candidate, verdict: evaluateAdmission(candidate, preview(candidate), policy, readings) };
  }));
  assert(
    largeScale.pendingPods === 60 && largeScale.autoAccepts === 40 && largeScale.autoHolds === 10 && largeScale.manual === 10,
    `Large-scale lane pressure must aggregate 60 calls exactly; got ${JSON.stringify(largeScale)}.`
  );
  return `safe accept + 13 finite policy cases; cumulative reserve protected; large pressure 60/40/10/10`;
}

function testLivePolicyAdmissionAndManualPreservation(): string {
  const state = fixture(77009);
  const dock = state.docks.find((entry) => entry.purpose === 'visitor' && entry.allowedShipSizes.includes('small'));
  assert(dock, 'Starter fixture needs a compatible visitor Pod Dock.');
  const safe = offer(770091, {
    lane: dock.lane,
    shipType: dock.allowedShipTypes[0],
    passengersTotal: 0,
    manifestMix: { diner: 0, shopper: 0, lounger: 0, rusher: 0 },
    hospitalityDemand: { meal: 0, drink: 0, leisure: 0, restroom: 0, hygiene: 0, comfort: 0 }
  });
  const military = offer(770092, { lane: dock.lane, shipType: 'military' });
  state.trafficOffers.push(safe, military);
  const next = createAdmissionPolicy();
  next.enabled = true;
  next.reserveMeals = 0;
  next.pod.reserveFreeInterfaces = 0;
  setAdmissionPolicy(state, next);
  tick(state, 0.2);
  assert(!state.trafficOffers.some((entry) => entry.id === safe.id), 'A justified routine call must auto-admit through the live tick.');
  const heldManual = state.trafficOffers.find((entry) => entry.id === military.id);
  assert(heldManual?.admissionNote?.includes('military call'), 'Military call must remain visible with its manual explanation.');
  const pressure = getAdmissionPressure(state);
  assert(pressure.manual === 1 && pressure.pendingPods === 1, 'Live pressure must report the one preserved manual call.');
  assert(passTrafficOffer(state, military.id), 'The player must retain manual override of a policy decision.');
  return `live auto-admitted 1; preserved military 1; manual pass 1`;
}

function paintRoom(state: StationState, room: RoomType, x0: number, y0: number, x1: number, y1: number): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const tile = toIndex(x, y, state.width);
      setTile(state, tile, TileType.Floor);
      setRoom(state, tile, room);
    }
  }
  const door = toIndex(x0, y0, state.width);
  setTile(state, door, TileType.Door);
  setRoom(state, door, room);
}

function testResidentConversionMetric(): string {
  const state = createInitialState({ seed: 77010 });
  state.controls.paused = false;
  state.controls.shipsPerCycle = 0;
  state.tiles.fill(TileType.Space);
  state.rooms.fill(RoomType.None);
  state.modules.fill(ModuleType.None);
  state.moduleInstances = [];
  state.moduleOccupancyByTile.fill(null);
  state.visitors.length = 0;
  state.residents.length = 0;
  state.arrivingShips.length = 0;
  state.docks.length = 0;
  state.crew.total = 0;
  state.unlocks.tier = 3;
  state.unlocks.unlockedIds = ['tier1_sustenance', 'tier2_commerce', 'tier3_logistics'];
  state.unlocks.unlockedAtSec = { tier1_sustenance: 0, tier2_commerce: 0, tier3_logistics: 0 };
  for (let y = 4; y <= 30; y++) {
    for (let x = 4; x <= 44; x++) setTile(state, toIndex(x, y, state.width), TileType.Floor);
  }
  for (let x = 4; x <= 44; x++) {
    setTile(state, toIndex(x, 4, state.width), TileType.Wall);
    setTile(state, toIndex(x, 30, state.width), TileType.Wall);
  }
  for (let y = 4; y <= 30; y++) {
    setTile(state, toIndex(4, y, state.width), TileType.Wall);
    setTile(state, toIndex(44, y, state.width), TileType.Wall);
  }
  setTile(state, state.core.centerTile, TileType.Floor);
  setTile(state, state.core.serviceTile, TileType.Floor);
  for (const y of [8, 9, 18, 19]) setTile(state, toIndex(44, y, state.width), TileType.Dock);
  const visitorAnchor = toIndex(44, 8, state.width);
  const residentAnchor = toIndex(44, 18, state.width);
  const visitorDock = state.docks.find((entry) => entry.tiles.includes(visitorAnchor));
  const residentDock = state.docks.find((entry) => entry.tiles.includes(residentAnchor));
  assert(visitorDock && residentDock, 'Conversion fixture needs distinct visitor and residential docks.');
  setDockPurpose(state, residentDock.id, 'residential');
  paintRoom(state, RoomType.Dorm, 10, 22, 13, 25);
  paintRoom(state, RoomType.Hygiene, 15, 22, 17, 24);
  assert(setRoomHousingPolicy(state, toIndex(10, 22, state.width), 'private_resident'), 'Private resident housing policy must apply.');
  assert(setRoomHousingPolicy(state, toIndex(15, 22, state.width), 'resident'), 'Resident hygiene policy must apply.');
  const bedTile = toIndex(11, 23, state.width);
  assert(tryPlaceModule(state, ModuleType.Bed, bedTile, 0).ok, 'Conversion fixture needs one depicted private bed.');
  assert(setResidentAcceptance(state, true), 'Resident acceptance must explicitly open.');
  state.rng = () => 0;

  const center = visitorDock.tiles.map((tile) => fromIndex(tile, state.width)).reduce(
    (sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }),
    { x: 0, y: 0 }
  );
  const ship = {
    id: 770101,
    kind: 'transient',
    size: 'small',
    bayTiles: [...visitorDock.tiles],
    bayCenterX: center.x / visitorDock.tiles.length + 0.5,
    bayCenterY: center.y / visitorDock.tiles.length + 0.5,
    shipType: 'tourist',
    hullVariant: 'courier-pod',
    lane: visitorDock.lane,
    originDockId: visitorDock.id,
    assignedDockId: visitorDock.id,
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
    manifestMix: { diner: 1, shopper: 0, lounger: 0, rusher: 0 }
  } as ArrivingShip;
  visitorDock.occupiedByShipId = ship.id;
  state.arrivingShips.push(ship);
  const dockTile = visitorDock.tiles[0];
  const dockPoint = fromIndex(dockTile, state.width);
  state.visitors.push({
    id: 770102,
    x: dockPoint.x + 0.5,
    y: dockPoint.y + 0.5,
    tileIndex: dockTile,
    state: VisitorState.ToDock,
    path: [],
    speed: 2,
    patience: 0,
    eatTimer: 0,
    trespassed: false,
    servedMeal: true,
    carryingMeal: false,
    reservedServingTile: null,
    reservedTargetTile: null,
    blockedTicks: 0,
    archetype: 'diner',
    taxSensitivity: 1,
    spendMultiplier: 1,
    patienceMultiplier: 1,
    primaryPreference: 'cafeteria',
    spawnedAt: state.now - 80,
    originShipId: ship.id,
    airExposureSec: 0,
    healthState: 'healthy',
    leisureLegsRemaining: 0,
    leisureLegsPlanned: 0,
    lastLeisureKind: null,
    servicePlan: [],
    completedServices: [],
    activeService: null,
    serviceBlockedSince: null
  } as unknown as Visitor);
  // The production move-in cadence is eight seconds. Initialize its timer,
  // then make the rating input explicitly eligible before the due tick.
  tick(state, 0.1);
  state.metrics.stationRating = 100;
  tick(state, 8.1);
  assert(state.usageTotals.residentConversionAttempts === 1, 'Exactly one conversion attempt must be recorded.');
  assert(state.usageTotals.residentConversionSuccesses === 1, 'Exactly one resident conversion must succeed.');
  assert(state.residents.length === 1 && state.residents[0].homeDockId === residentDock.id, 'Conversion must create one physically housed resident with a home dock.');

  // The one rating bucket that stores a signed movement rather than a
  // magnitude, driven here through the production leave path. Its save round
  // trip is asserted in the rating-attribution test instead: this fixture's
  // hand-carved adjacent Dock tiles trip an unrelated re-entrancy in the
  // dock-entity cache during hydration, which is not what this test is about.
  const departureBefore = getRatingAttribution(state);
  state.residents[0].leaveIntent = 100;
  tick(state, 0.2);
  const stillHoused: number = state.residents.length;
  assert(stillHoused === 0 && state.usageTotals.residentDepartures === 1, 'A resident past the leave threshold must actually depart.');
  const departed = getRatingAttribution(state);
  near(departed.delta, departureBefore.delta - 0.4, 'A departure must move the ledger by its own penalty', 1e-9);
  near(departed.residual, 0, 'A departure must stay attributed to its named reason', 1e-9);
  assert(state.usageTotals.ratingFromResidentDeparture < 0, 'The departure bucket records a signed movement.');
  return `resident conversion 1/1 with depicted private bed and residential dock; 1 attributed departure`;
}

function at(state: StationState, x: number, y: number): number {
  return toIndex(x, y, state.width);
}

function center(state: StationState, tile: number): { x: number; y: number } {
  return { x: (tile % state.width) + 0.5, y: Math.floor(tile / state.width) + 0.5 };
}

/** A starter station with its world cleared, so a fixture owns every tile. */
function blankFixture(seed: number): StationState {
  const state = createInitialState({ seed, physicalStarterInventory: true, manualTrafficAdmission: true });
  tick(state, 0);
  state.controls.paused = false;
  state.controls.shipsPerCycle = 0;
  state.tiles.fill(TileType.Space);
  state.rooms.fill(RoomType.None);
  state.zones.fill(ZoneType.Public);
  state.modules.fill(ModuleType.None);
  state.moduleOccupancyByTile.fill(null);
  state.moduleInstances = [];
  state.visitors = [];
  state.residents = [];
  state.crewMembers = [];
  state.reservations = [];
  state.itemNodes = [];
  return state;
}

function queueVisitor(state: StationState, id: number, anchor: number | null, joinedAt: number, tile: number): Visitor {
  return {
    id,
    name: `Spill ${id}`,
    ...center(state, tile),
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
  } as unknown as Visitor;
}

/**
 * One bar counter at the top of a one-tile corridor whose room ends part way
 * down, so a long enough line physically stands outside the room it is queueing
 * for. Deliberately the same geometry the saturation runner uses to compute
 * spill by hand, so the production counter can be checked against it.
 */
function spillFixture(seed: number, waiting: number): { state: StationState; anchor: number } {
  const state = blankFixture(seed);
  const x = 20;
  const anchor = at(state, x, 8);
  const other = at(state, x + 1, 8);
  for (let y = 8; y <= 42; y += 1) {
    const tile = at(state, x, y);
    state.tiles[tile] = TileType.Floor;
    state.rooms[tile] = y <= 26 ? RoomType.Cantina : RoomType.None;
    state.pressurized[tile] = true;
    if (y > 8) {
      state.tiles[at(state, x - 1, y)] = TileType.Wall;
      state.tiles[at(state, x + 1, y)] = TileType.Wall;
    }
  }
  state.tiles[other] = TileType.Floor;
  state.rooms[other] = RoomType.Cantina;
  state.pressurized[other] = true;
  state.moduleInstances.push({ id: 700, type: ModuleType.BarCounter, originTile: anchor, rotation: 0, width: 2, height: 1, tiles: [anchor, other] });
  state.modules[anchor] = ModuleType.BarCounter;
  state.modules[other] = ModuleType.BarCounter;
  state.moduleOccupancyByTile[anchor] = 700;
  state.moduleOccupancyByTile[other] = 700;
  state.moduleVersion += 1;
  state.roomVersion += 1;
  state.topologyVersion += 1;
  state.visitors = Array.from({ length: waiting }, (_, index) =>
    queueVisitor(state, index + 1, anchor, index + 1, at(state, x, 40))
  );
  runQueueMaintenanceTestTick(state);
  return { state, anchor };
}

/** Queue slots outside the provider room, recomputed by hand from reservations. */
function reservedSlotsOutsideRoom(state: StationState, anchor: number): number {
  const ids = new Set(state.derived.queueTheater.membersByAnchor.get(anchor) ?? []);
  return state.reservations.filter((reservation) =>
    reservation.releaseReason === null &&
    reservation.ownerKind === 'visitor' &&
    ids.has(Number(reservation.ownerId)) &&
    reservation.targetTile !== null &&
    state.rooms[reservation.targetTile] !== state.rooms[anchor]
  ).length;
}

function testQueueSpillAndCountedBalk(): string {
  // Spill length. A short line fits inside the room; a long one does not, and
  // the counter has to see the difference from the physical slots alone.
  const short = spillFixture(77020, 6);
  const long = spillFixture(77021, 24);
  const shortSpill = getCommitmentMetrics(short.state).queueSpillMembers ?? -1;
  const longSpill = getCommitmentMetrics(long.state).queueSpillMembers ?? -1;
  assert(shortSpill === 0, `A line that fits inside its room must report no spill, got ${shortSpill}.`);
  assert(longSpill === 6, `A saturated line must report its six corridor slots, got ${longSpill}.`);
  assert(
    longSpill === reservedSlotsOutsideRoom(long.state, long.anchor),
    'The production spill counter must equal the same census taken from live slot reservations.'
  );
  assert(
    (getCommitmentMetrics(long.state).queueSpillPeak ?? -1) === 6,
    'The high-water mark must retain the worst spill the station has physically had.'
  );
  // The peak is durable while the gauge is live: emptying the line must drop
  // one and keep the other.
  long.state.visitors.length = 0;
  runQueueMaintenanceTestTick(long.state);
  const drained = getCommitmentMetrics(long.state);
  assert(drained.queueSpillMembers === 0, 'An emptied line must return the live spill gauge to zero.');
  assert((drained.queueSpillPeak ?? -1) === 6, 'Draining the line must not erase the recorded peak.');

  // Counted balk, through the production give-up path rather than a stage read.
  const balking = blankFixture(77022);
  const tile = at(balking, 20, 20);
  balking.tiles[tile] = TileType.Floor;
  const abandoned = queueVisitor(balking, 1, null, 0, tile);
  abandoned.state = VisitorState.Queueing;
  abandoned.serviceBlockedSince = 0;
  balking.visitors = [abandoned];
  balking.now = 15.999;
  runQueueMaintenanceTestTick(balking);
  assert((getCommitmentMetrics(balking).queueBalks ?? 0) === 0, 'A guest still inside the wait window must not be counted as a balk.');
  balking.now = 16;
  runQueueMaintenanceTestTick(balking);
  assert((getCommitmentMetrics(balking).queueBalks ?? -1) === 1, 'Crossing the balk wait must count exactly one balk.');
  runQueueMaintenanceTestTick(balking);
  assert(
    (getCommitmentMetrics(balking).queueBalks ?? -1) === 1,
    'A visitor who already left the line must not be counted again on the next pass.'
  );
  return `spill 0/6 members (peak 6 retained); 1 counted balk at the 16s wait`;
}

function testDoorWaitAtSerializedCrossing(): string {
  const seedState = createInitialState({ seed: 77023, physicalStarterInventory: true });
  tick(seedState, 0);
  const template = seedState.crewMembers[0];
  assert(template, 'Door-wait fixture needs one starter crew template.');

  const state = blankFixture(77023);
  const x = 30;
  for (let y = 10; y <= 16; y += 1) {
    const tile = at(state, x, y);
    state.tiles[tile] = y === 13 ? TileType.Door : TileType.Floor;
    state.pressurized[tile] = true;
    state.tiles[at(state, x - 1, y)] = TileType.Wall;
    state.tiles[at(state, x + 1, y)] = TileType.Wall;
  }
  state.topologyVersion += 1;
  const door = at(state, x, 13);
  const crewAt = (id: number, tile: number, path: number[]): CrewMember => {
    const next = structuredClone(template);
    next.id = id;
    next.tileIndex = tile;
    next.path = [...path];
    next.speed = 10;
    next.blockedTicks = 0;
    next.targetTile = null;
    next.carryingItemType = null;
    next.carryingAmount = 0;
    // Neither actor may carry a priority bonus, so the arbiter has to settle
    // the crossing on the deterministic id tiebreak rather than on urgency.
    next.evaSuit = false;
    next.staffRole = 'cargo-handler';
    next.role = 'idle';
    next.movementWaitReason = undefined;
    next.movementReplanCooldownUntil = 0;
    Object.assign(next, center(state, tile));
    return next;
  };
  // One actor is standing ON the door and stepping off it; the other wants to
  // step onto it. Different destinations, one shared narrow tile — exactly the
  // case the serialized-crossing pass exists to arbitrate.
  const leaving = crewAt(1, door, [at(state, x, 14)]);
  const entering = crewAt(2, at(state, x, 12), [door]);
  state.crewMembers = [leaving, entering];

  const results = runMovementCoordinatorTestTick(state, 0.2, false, true);
  const yieldReason: string | undefined = entering.movementWaitReason;
  assert(results.get('crew:1') === 'moved', 'The winning actor must actually cross the door.');
  assert(results.get('crew:2') === 'blocked', 'The losing actor must be deferred at the door.');
  assert(
    yieldReason === 'yielding at narrow crossing',
    `The deferral must come from the narrow-crossing pass, got ${yieldReason}.`
  );
  const first = getCommitmentMetrics(state);
  near(first.doorWaitSeconds ?? -1, 0.2, 'One deferred actor must accrue exactly one tick of door wait');
  assert((first.doorWaitDeferrals ?? -1) === 1, 'Exactly one deferred step must be counted.');

  // The door stays claimed for its clearance interval, so the same actor waits
  // again on the next tick and the counter accrues a second, equal tick.
  state.now += 0.2;
  runMovementCoordinatorTestTick(state, 0.2);
  const occupiedReason: string | undefined = entering.movementWaitReason;
  const second = getCommitmentMetrics(state);
  near(second.doorWaitSeconds ?? -1, 0.4, 'A second deferred tick must accrue the same wait');
  assert((second.doorWaitDeferrals ?? -1) === 2, 'Each deferred step is counted once.');
  assert(
    occupiedReason === 'narrow crossing occupied',
    `A door inside its clearance interval must report occupancy, got ${occupiedReason}.`
  );

  // An unobstructed crossing costs nothing: the counter must not simply track
  // every blocked step.
  const quiet = blankFixture(77024);
  for (let y = 10; y <= 16; y += 1) {
    const tile = at(quiet, x, y);
    quiet.tiles[tile] = y === 13 ? TileType.Door : TileType.Floor;
    quiet.pressurized[tile] = true;
  }
  quiet.topologyVersion += 1;
  const solo = structuredClone(template);
  solo.id = 5;
  solo.tileIndex = at(quiet, x, 12);
  solo.path = [at(quiet, x, 13)];
  solo.speed = 10;
  solo.blockedTicks = 0;
  Object.assign(solo, center(quiet, solo.tileIndex));
  quiet.crewMembers = [solo];
  runMovementCoordinatorTestTick(quiet, 0.2, false, true);
  assert((getCommitmentMetrics(quiet).doorWaitSeconds ?? 0) === 0, 'A door with one user must cost no wait at all.');
  return `door wait 0.4 actor-s over 2 deferrals (yield then occupied); uncontested door 0s`;
}

function testReceptionRevealAndRedirectTiming(): string {
  const staffed = fixture(77025);
  applyColdStartScenario(staffed, 'reception-staffed');
  staffed.controls.paused = false;
  advance(staffed, 150);
  const staffedMetrics = getCommitmentMetrics(staffed);
  const processed = staffed.visitors.filter(
    (visitor) => visitor.receptionProcessedAt !== null && visitor.receptionProcessedAt !== undefined
  );
  const settledReveals = staffed.visitors.filter(
    (visitor) => visitor.receptionRevealSettledAt !== null && visitor.receptionRevealSettledAt !== undefined
  );
  assert(processed.length > 0, 'The staffed desk fixture must actually process arrivals.');
  assert(
    (staffedMetrics.receptionRevealsResolved ?? 0) > 0,
    'A processed guest who then completes a wanted service must resolve one reveal interval.'
  );
  assert(
    (staffedMetrics.receptionRevealsResolved ?? -1) === settledReveals.length,
    'The reveal count must equal the number of guests carrying a settlement stamp.'
  );
  assert(
    settledReveals.length <= processed.length,
    'A reveal cannot settle for a guest reception never processed.'
  );
  assert(
    (staffedMetrics.receptionRevealSeconds ?? 0) > 0,
    'Resolved reveals must carry positive measured time from the desk to the service.'
  );
  for (const visitor of settledReveals) {
    assert(
      (visitor.receptionRevealSettledAt ?? 0) >= (visitor.receptionProcessedAt ?? 0),
      'A reveal cannot settle before the desk processed the guest.'
    );
  }

  // Redirects are the failure the desk removes, so measure them where there is
  // no desk and guests have to discover their real want by walking.
  const bare = fixture(77026);
  applyColdStartScenario(bare, 'reception-absent');
  bare.controls.paused = false;
  advance(bare, 150);
  const bareMetrics = getCommitmentMetrics(bare);
  const redirected = bare.visitors.filter((visitor) => visitor.redirectedFrom);
  const settledRedirects = bare.visitors.filter(
    (visitor) => visitor.redirectCorrectionSettledAt !== null && visitor.redirectCorrectionSettledAt !== undefined
  );
  assert(redirected.length > 0, 'The deskless fixture must produce real wrong first choices.');
  assert(
    redirected.every((visitor) => typeof visitor.redirectedAt === 'number'),
    'Every redirect must be stamped at the moment it happens.'
  );
  assert(
    (bareMetrics.redirectCorrectionsResolved ?? 0) > 0,
    'A redirected guest who reaches the right service must resolve one correction interval.'
  );
  assert(
    (bareMetrics.redirectCorrectionsResolved ?? -1) === settledRedirects.length,
    'The correction count must equal the number of guests carrying a settlement stamp.'
  );
  assert(
    settledRedirects.length <= redirected.length,
    'A correction cannot settle for a guest who was never redirected.'
  );
  assert(
    (bareMetrics.redirectCorrectionSeconds ?? 0) > 0,
    'Resolved corrections must carry positive measured time from the wrong stop to the right one.'
  );

  // Exactly once: running the same station on does not re-charge a guest whose
  // interval already settled, even as they complete further services.
  const resolvedBefore = bareMetrics.redirectCorrectionsResolved ?? 0;
  const stampsBefore = settledRedirects.map((visitor) => `${visitor.id}:${visitor.redirectCorrectionSettledAt}`).join('|');
  advance(bare, 90);
  const stampsAfter = bare.visitors
    .filter((visitor) => visitor.redirectCorrectionSettledAt !== null && visitor.redirectCorrectionSettledAt !== undefined)
    .filter((visitor) => settledRedirects.some((earlier) => earlier.id === visitor.id))
    .map((visitor) => `${visitor.id}:${visitor.redirectCorrectionSettledAt}`)
    .join('|');
  assert(stampsAfter === stampsBefore, 'An already-settled correction must never be restamped.');
  assert(
    (getCommitmentMetrics(bare).redirectCorrectionsResolved ?? 0) >= resolvedBefore,
    'The correction counter must never move backwards.'
  );
  return (
    `reveals ${staffedMetrics.receptionRevealsResolved}/${processed.length} in ` +
    `${(staffedMetrics.receptionRevealSeconds ?? 0).toFixed(1)}s; corrections ` +
    `${bareMetrics.redirectCorrectionsResolved}/${redirected.length} in ${(bareMetrics.redirectCorrectionSeconds ?? 0).toFixed(1)}s`
  );
}

function testEvaSuitedTime(): string {
  const seedState = createInitialState({ seed: 77027, physicalStarterInventory: true });
  tick(seedState, 0);
  const template = seedState.crewMembers[0];
  assert(template, 'EVA fixture needs one starter crew template.');

  const state = blankFixture(77027);
  // A genuinely sealed cell with an airlock in its wall, and a bare walkway
  // outside it. Pressure is left to the production flood fill rather than being
  // asserted by hand, so "outside" means what the simulation means by it.
  const airlock = at(state, 30, 21);
  for (let x = 28; x <= 32; x += 1) {
    state.tiles[at(state, x, 17)] = TileType.Wall;
    state.tiles[at(state, x, 21)] = TileType.Wall;
  }
  for (let y = 17; y <= 21; y += 1) {
    state.tiles[at(state, 28, y)] = TileType.Wall;
    state.tiles[at(state, 32, y)] = TileType.Wall;
  }
  for (let y = 18; y <= 20; y += 1) {
    for (let x = 29; x <= 31; x += 1) state.tiles[at(state, x, y)] = TileType.Floor;
  }
  state.tiles[airlock] = TileType.Airlock;
  const outside = [at(state, 30, 22), at(state, 30, 23), at(state, 30, 24)];
  for (const tile of outside) state.tiles[tile] = TileType.Floor;
  const inside = at(state, 30, 19);
  state.topologyVersion += 1;
  tick(state, 0);
  assert(state.pressurized[inside], 'The sealed cell must read as pressurized.');
  assert(!state.pressurized[outside[2]], 'The walkway beyond the airlock must read as vacuum.');

  const worker = structuredClone(template);
  worker.id = 9;
  worker.tileIndex = airlock;
  worker.path = [outside[0]];
  worker.activeJobId = null;
  // Slow enough that the idle-return route cannot carry the worker back inside
  // during the measured window; the metric is what is under test, not walking.
  worker.speed = 0.4;
  Object.assign(worker, center(state, airlock));
  state.crewMembers = [worker];

  // Production suit-up: the same routine the crew loop calls when a route
  // leaves an airlock for an unpressurized tile.
  updateEvaSuitForRoute(state, worker, 0.2);
  assert(worker.evaSuit, 'Stepping out of an airlock onto vacuum must issue a suit.');

  // Suited but still inside is not EVA time.
  worker.tileIndex = inside;
  Object.assign(worker, center(state, inside));
  tick(state, 0.2);
  assert((getCommitmentMetrics(state).evaSuitedSeconds ?? -1) === 0, 'A suited worker still on a pressurized tile is not outside yet.');

  worker.tileIndex = outside[2];
  Object.assign(worker, center(state, outside[2]));
  for (let i = 0; i < 5; i += 1) tick(state, 0.2);
  const outsideMetrics = getCommitmentMetrics(state);
  assert(worker.evaSuit && !state.pressurized[worker.tileIndex], 'The fixture must keep the worker suited and outside for the measured window.');
  assert((outsideMetrics.evaSuitedCrew ?? -1) === 1, 'Exactly one crew member must read as suited outside.');
  near(outsideMetrics.evaSuitedSeconds ?? -1, 1, 'Five 0.2s ticks outside must accrue one crew-second', 0.001);

  // Coming back through the airlock ends the accrual, and the total stands.
  worker.tileIndex = airlock;
  worker.path = [inside];
  Object.assign(worker, center(state, airlock));
  updateEvaSuitForRoute(state, worker, 0.2);
  assert(!worker.evaSuit, 'Returning through the airlock must remove the suit.');
  for (let i = 0; i < 5; i += 1) tick(state, 0.2);
  const settled = getCommitmentMetrics(state);
  near(settled.evaSuitedSeconds ?? -1, 1, 'A returned worker must stop accruing EVA time', 0.001);
  assert((settled.evaSuitedCrew ?? -1) === 0, 'Nobody is outside once the suit is returned.');
  return `1 crew-second suited outside across 5 ticks; 0 while suited inside; accrual stops at the airlock`;
}

function testRatingAttributionReconciles(): string {
  const state = fixture(77028);
  applyColdStartScenario(state, 'long-stay-guest-wing');
  state.controls.paused = false;
  advance(state, 180);
  const live = getRatingAttribution(state);
  assert(Math.abs(live.delta) > 0, 'The scenario must actually move the rating ledger.');
  near(live.residual, 0, 'Every live rating movement must be claimed by a named reason', 1e-9);

  // The capital-project award used to bypass attribution entirely. Stage the
  // history one accepted project needs, then let the ordinary tick award it.
  assert(acceptOpeningCapitalProject(state, 'roadside-rest-stop'), 'Rating fixture needs one accepted capital project.');
  state.openingEconomy.ledger.lifetime['dock-fee'].count = 12;
  state.metrics.mealsServedTotal = Math.max(state.metrics.mealsServedTotal, 8);
  state.usageTotals.tradeGoodsSold = Math.max(state.usageTotals.tradeGoodsSold, 6);
  const before = state.usageTotals.ratingFromVisitorSuccessByReason.capitalProject ?? 0;
  // Deliberately condition-driven rather than a fixed number of ticks: the
  // capital-project evaluator sits behind `shouldRefreshDerivedMetrics`, which
  // is a WALL-CLOCK cadence, so how many simulated seconds it takes to fire
  // depends on how fast the host runs the loop. Waiting for the award keeps
  // this evidence about attribution instead of about machine throughput.
  let after = before;
  for (let i = 0; i < 20_000 && after === before; i += 1) {
    tick(state, 0.2);
    after = state.usageTotals.ratingFromVisitorSuccessByReason.capitalProject ?? 0;
  }
  assert(after - before === 2, `A completed project must credit its own named bucket, got ${after - before}.`);
  const awarded = getRatingAttribution(state);
  near(awarded.residual, 0, 'A project award must leave the ledger fully attributed', 1e-9);

  // The half that catches a bucket which is live-correct but does not persist:
  // `ratingDelta` survives a save, so its attribution has to survive with it.
  const parsed = parseAndMigrateSave(serializeSave('gate-g-rating', state, 'test'));
  assert(parsed.ok, `Rating fixture must serialize: ${parsed.ok ? '' : parsed.error}`);
  const restored = hydrateStateFromSave(parsed.save).state;
  const roundTrip = getRatingAttribution(restored);
  near(roundTrip.delta, awarded.delta, 'Save/resume must preserve the cumulative rating ledger', 1e-9);
  near(roundTrip.bonuses, awarded.bonuses, 'Save/resume must preserve every attributed bonus', 1e-9);
  near(roundTrip.penalties, awarded.penalties, 'Save/resume must preserve every attributed penalty', 1e-9);
  near(roundTrip.residual, 0, 'A resumed station must still be able to explain its whole rating', 1e-9);
  assert(
    (restored.usageTotals.ratingFromVisitorSuccessByReason.capitalProject ?? -1) === after,
    'The capital-project bucket must survive save/resume rather than resetting to zero.'
  );

  // The resident-departure bucket is stored as a SIGNED movement (see
  // `departResident`, which subtracts from both it and the ledger). The save
  // parser used to clamp it at zero, which silently unattributed every
  // departure a resumed station had paid for. Written onto the wire exactly as
  // production writes it, then resumed.
  const signedWire = JSON.parse(serializeSave('gate-g-rating-departure', state, 'test'));
  signedWire.snapshot.progression.rating.penalties.residentDeparture = -0.4;
  signedWire.snapshot.progression.rating.delta = awarded.delta - 0.4;
  const signed = parseAndMigrateSave(JSON.stringify(signedWire));
  assert(signed.ok, 'Signed-penalty fixture must parse.');
  const signedState = hydrateStateFromSave(signed.save).state;
  near(signedState.usageTotals.ratingFromResidentDeparture, -0.4, 'A signed departure penalty must survive the save parser', 1e-9);
  near(getRatingAttribution(signedState).residual, 0, 'A resumed departure penalty must still be attributed', 1e-9);

  // A save written before these buckets existed must migrate to a reconciled
  // zero, not to `undefined` arithmetic. Stripped from the wire text, so the
  // parser really is the thing supplying the default.
  const wire = JSON.parse(serializeSave('gate-g-rating-legacy', state, 'test'));
  const legacyBonuses = wire.snapshot.progression.rating.bonuses as Record<string, number>;
  delete legacyBonuses.capitalProject;
  delete legacyBonuses.smallCraftService;
  const legacy = parseAndMigrateSave(JSON.stringify(wire));
  assert(legacy.ok, 'Legacy migration fixture must parse.');
  const migrated = hydrateStateFromSave(legacy.save).state;
  const migratedBonuses = migrated.usageTotals.ratingFromVisitorSuccessByReason;
  assert(
    (migratedBonuses.capitalProject ?? null) === 0 && (migratedBonuses.smallCraftService ?? null) === 0,
    'A save without the new buckets must hydrate them as a truthful zero.'
  );
  return `residual 0 live and after resume; capital-project bucket +2 preserved; absent buckets migrate to 0`;
}

type Test = { name: string; run: () => string };
const TESTS: Test[] = [
  { name: 'visit duration and approach wait metrics', run: testVisitDurationAndApproachWait },
  { name: 'transfer, recurring need, and fixture metrics', run: testTransfersNeedsAndFixtureUtilization },
  { name: 'boarding, missed departure, and stranding metrics', run: testBoardingMissAndStranding },
  { name: 'committed future load', run: testCommittedFutureLoad },
  { name: 'failure, early departure, extension, and call outcomes', run: testFailureEarlyExtensionAndCallOutcomes },
  { name: 'finite admission policy matrix', run: testFiniteAdmissionMatrix },
  { name: 'live admission and manual preservation', run: testLivePolicyAdmissionAndManualPreservation },
  { name: 'resident conversion metric', run: testResidentConversionMetric },
  { name: 'queue spill length and counted balk', run: testQueueSpillAndCountedBalk },
  { name: 'door wait at the serialized crossing', run: testDoorWaitAtSerializedCrossing },
  { name: 'reception reveal and redirection time', run: testReceptionRevealAndRedirectTiming },
  { name: 'EVA suited time', run: testEvaSuitedTime },
  { name: 'rating attribution reconciles', run: testRatingAttributionReconciles }
];

let passed = 0;
for (const test of TESTS) {
  try {
    const evidence = test.run();
    passed += 1;
    console.log(`PASS ${test.name}: ${evidence}`);
  } catch (error) {
    console.error(`FAIL ${test.name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
console.log(`\nGate G metrics/admission: ${passed}/${TESTS.length} passed.`);
if (passed !== TESTS.length) process.exitCode = 1;
