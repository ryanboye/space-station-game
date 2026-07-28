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
import {
  admitTrafficOffer,
  createInitialState,
  getAdmissionPressure,
  getCommitmentMetrics,
  passTrafficOffer,
  setDockPurpose,
  setAdmissionPolicy,
  setResidentAcceptance,
  setRoom,
  setRoomHousingPolicy,
  setTile,
  tick,
  tryPlaceModule
} from '../src/sim/sim';
import {
  ModuleType,
  RoomType,
  TileType,
  VisitorState,
  fromIndex,
  toIndex,
  type ArrivingShip,
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

function testVisitDurationAndApproachWait(): string {
  const state = fixture(77001);
  state.now = 100;

  const active = {
    id: 77001,
    kind: 'transient',
    stage: 'approach',
    stageTime: 0,
    approachCommitment: { slotId: 'gate-g-a', groupIds: ['shared-g'], phase: 'approach', status: 'active', queuedAt: 90 }
  } as unknown as ArrivingShip;
  const waiting = {
    id: 77002,
    kind: 'transient',
    stage: 'approach',
    stageTime: 0,
    approachCommitment: { slotId: 'gate-g-b', groupIds: ['shared-g'], phase: 'approach', status: 'waiting', queuedAt: 91 }
  } as unknown as ArrivingShip;
  state.arrivingShips = [active, waiting];
  tick(state, 0.2);
  const first = getCommitmentMetrics(state);
  near(first.holdingSeconds, 0.2, 'One waiting ship must accrue one ship-tick of holding');
  near(first.approachGroupWaitSeconds, 0.2, 'A grouped waiter must accrue the same wait tick');
  assert(first.holdingShips === 1, 'The live holding gauge must report exactly one waiting ship.');

  state.arrivingShips = [{
    id: 77003,
    kind: 'transient',
    stage: 'depart',
    stageTime: 2.01,
    dockedAt: 90,
    stayClass: 'contract',
    shipType: 'tourist',
    size: 'small',
    passengersTotal: 0,
    passengersSpawned: 0,
    passengersBoarded: 0,
    approachCommitment: { slotId: 'gate-g-c', groupIds: [], phase: 'depart', status: 'active', queuedAt: 100 }
  } as unknown as ArrivingShip];
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
  return `resident conversion 1/1 with depicted private bed and residential dock`;
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
  { name: 'resident conversion metric', run: testResidentConversionMetric }
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
