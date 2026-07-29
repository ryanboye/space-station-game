import { createInitialState, tick } from '../src/sim/sim';
import { applyColdStartScenario } from '../src/sim/cold-start-scenarios';
import {
  ModuleType,
  type ArrivingShip,
  type PortContract,
  type StationState,
  type TrafficOffer,
  type Visitor
} from '../src/sim/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const STEP = 0.2;
const MAX_SECONDS = 600;
type CycleService = 'meal' | 'comfort' | 'hygiene' | 'leisure';
const CYCLE_SERVICES: readonly CycleService[] = ['meal', 'comfort', 'hygiene', 'leisure'];
type Counts = Record<CycleService, number>;
type ClaimWitness = Record<CycleService, number>;

function zeroCounts(): Counts {
  return { meal: 0, comfort: 0, hygiene: 0, leisure: 0 };
}

function tenderOffer(state: StationState, id: number): TrafficOffer {
  const dock = state.docks[0];
  return {
    id,
    callsign: `CYCLE-${id}`,
    shipName: 'Longwatch Repair Tender',
    lane: dock?.lane ?? 'north',
    shipType: 'industrial',
    hullVariant: 'repair-tender',
    offerKind: 'freight',
    size: 'medium',
    status: 'holding',
    forecastAt: state.now,
    arrivesAt: state.now,
    expiresAt: state.now + 1800,
    passengersTotal: 4,
    manifestDemand: { cafeteria: 1, market: 0, lounge: 1 },
    manifestMix: { diner: 0, shopper: 0, lounger: 1, rusher: 0 },
    hospitalityDemand: { meal: 0, drink: 0, leisure: 0, restroom: 0, hygiene: 0, comfort: 0 },
    inboundCargo: { rawMaterial: 0, rawMeal: 0, tradeGood: 0 },
    outboundRequest: { rawMaterial: 0, meal: 0, tradeGood: 0 },
    requestedServices: ['workshop'],
    berthTimeSec: 1200,
    dockingFee: 0,
    projectedSpend: 0,
    riskLabel: 'guarded',
    assignedBerthAnchor: null,
    assignedDockSourceKey: null
  };
}

function stageRepairTender(state: StationState, id: number): { ship: ArrivingShip; contract: PortContract } {
  const dock = state.docks[0];
  const dockTile = dock?.accessTile ?? dock?.tiles[0] ?? 0;
  const offer = tenderOffer(state, id);
  const ship: ArrivingShip = {
    id,
    kind: 'transient',
    size: 'medium',
    bayTiles: [dockTile],
    bayCenterX: (dockTile % state.width) + 0.5,
    bayCenterY: Math.floor(dockTile / state.width) + 0.5,
    shipType: 'industrial',
    hullVariant: 'repair-tender',
    lane: offer.lane,
    originDockId: dock?.id ?? null,
    assignedDockId: dock?.id ?? null,
    assignedDockSourceKey: dock?.sourceKey ?? null,
    assignedBerthAnchor: null,
    queueState: 'none',
    stage: 'docked',
    stageTime: 0,
    passengersTotal: 4,
    passengersSpawned: 4,
    passengersBoarded: 0,
    minimumBoarding: 4,
    spawnCarry: 0,
    dockedAt: state.now,
    residentIds: [],
    manifestDemand: offer.manifestDemand,
    manifestMix: offer.manifestMix,
    portManifest: offer,
    portContractId: id,
    stayClass: 'contract',
    visitPhase: 'visit-service',
    earliestDepartureAt: state.now + 700,
    plannedDepartureAt: state.now + 1200,
    extensionUntil: null,
    recallAt: null
  };
  const contract: PortContract = {
    id,
    offerId: id,
    shipId: id,
    callsign: offer.callsign,
    offerKind: 'freight',
    assignedBerthAnchor: 0,
    acceptedAt: state.now,
    arrivesAt: state.now,
    boardingStartsAt: state.now + 1100,
    hardDepartureAt: state.now + 1200,
    status: 'active',
    promises: [
      { kind: 'dock', label: 'Berth access', target: 1, completed: 1, payoutCredits: 0 },
      { kind: 'passengers-returned', label: 'Crew returned', target: 4, completed: 0, payoutCredits: 0 }
    ],
    passengerSpendingCredits: 0,
    procurementCostCredits: 0,
    settlementId: null,
    stayClass: 'contract',
    earliestDepartureAt: state.now + 700,
    plannedDepartureAt: state.now + 1200,
    extensionUntil: null,
    recallAt: null
  };
  state.arrivingShips.push(ship);
  state.portOps.contracts.push(contract);
  return { ship, contract };
}

function moduleTypeAt(state: StationState, tileIndex: number): ModuleType {
  const moduleId = state.moduleOccupancyByTile[tileIndex];
  return state.moduleInstances.find((module) => module.id === moduleId)?.type ?? state.modules[tileIndex];
}

function fixtureServiceForClaim(state: StationState, targetId: string | null, tileIndex: number): CycleService | null {
  const module = moduleTypeAt(state, tileIndex);
  if (targetId?.startsWith('temporary-sleep:') &&
    (module === ModuleType.GuestCabin || module === ModuleType.BunkBank)) return 'comfort';
  if (targetId?.startsWith('hygiene:') &&
    (module === ModuleType.WashBank || module === ModuleType.Shower || module === ModuleType.Sink)) return 'hygiene';
  if (targetId?.startsWith('seat:') && module === ModuleType.CommunityTable) return 'meal';
  if (targetId?.startsWith('leisure:') &&
    (module === ModuleType.Couch || module === ModuleType.GameStation || module === ModuleType.Bench || module === ModuleType.RecUnit)) return 'leisure';
  return null;
}

function eventMatchesFixture(service: CycleService, module: ModuleType): boolean {
  if (service === 'meal') return module === ModuleType.CommunityTable;
  if (service === 'comfort') return module === ModuleType.GuestCabin || module === ModuleType.BunkBank;
  if (service === 'hygiene') return module === ModuleType.WashBank || module === ModuleType.Shower || module === ModuleType.Sink;
  return module === ModuleType.Couch || module === ModuleType.GameStation || module === ModuleType.Bench || module === ModuleType.RecUnit;
}

function describe(state: StationState, crewIds: ReadonlySet<number>, counts: Map<number, Counts>, claims: Map<number, ClaimWitness>): string {
  const crew = state.visitors.filter((visitor) => crewIds.has(visitor.id)).map((visitor) => {
    const needs = visitor.needs;
    const count = counts.get(visitor.id) ?? zeroCounts();
    const claim = claims.get(visitor.id) ?? zeroCounts();
    return `${visitor.id}:${visitor.state}/${visitor.activeService ?? '-'} need=${needs ?
      `${needs.hunger.toFixed(0)}/${needs.energy.toFixed(0)}/${needs.hygiene.toFixed(0)}/${needs.leisure.toFixed(0)}` : '-'} ` +
      `active=${visitor.recurringNeedActive ?? '-'} cycles=${JSON.stringify(count)} claims=${JSON.stringify(claim)} ` +
      `tile=${visitor.tileIndex} path=${visitor.path.length}:${visitor.path[visitor.path.length - 1] ?? '-'} ` +
      `target=${visitor.reservedTargetTile ?? '-'} retry=${visitor.nextPathRetryAt?.toFixed(1) ?? '-'} ` +
      `blocked=${visitor.movementBlockedTile ?? '-'}:${visitor.movementWaitReason ?? '-'} ` +
      `failure=${visitor.serviceFailureStage ?? 'none'}`;
  }).join(' | ');
  const reservations = state.reservations.filter((reservation) =>
    reservation.releaseReason === null && typeof reservation.ownerId === 'number' && crewIds.has(reservation.ownerId)
  ).map((reservation) => `${reservation.ownerId}:${reservation.kind}:${reservation.targetId ?? '-'}@${reservation.targetTile}`).join(', ') || 'none';
  const recent = state.serviceLog.recent.filter((event) => crewIds.has(event.actorId)).map((event) =>
    `${event.id}:${event.actorId}:${event.service}/${event.moduleType}@${event.tileIndex}`
  ).join(', ') || 'none';
  const ship = state.arrivingShips.find((candidate) => candidate.id === 96001);
  const missing = [...crewIds].filter((id) => !state.visitors.some((visitor) => visitor.id === id));
  return `now=${state.now.toFixed(1)} ship=${ship?.stage}/${ship?.visitPhase ?? '-'} deaths=${state.metrics.deathsTotal} ` +
    `missing=[${missing.join(',') || 'none'}] crew=[${crew}] reservations=[${reservations}] events=[${recent}]`;
}

function allCyclesComplete(counts: Map<number, Counts>, crewIds: ReadonlySet<number>): boolean {
  return [...crewIds].every((id) => CYCLE_SERVICES.every((service) => (counts.get(id)?.[service] ?? 0) >= 2));
}

function crewSnapshot(visitor: Visitor): string {
  const needs = visitor.needs;
  return `${visitor.state}/${visitor.activeService ?? '-'} transfer=${visitor.transferPhase ?? 'station'} ` +
    `tile=${visitor.tileIndex} path=${visitor.path.length} patience=${visitor.patience.toFixed(1)} ` +
    `needs=${needs ? `${needs.hunger.toFixed(1)}/${needs.energy.toFixed(1)}/${needs.hygiene.toFixed(1)}/${needs.leisure.toFixed(1)}` : '-'} ` +
    `failure=${visitor.serviceFailureStage ?? 'none'}`;
}

function trackRemovedCrew(
  state: StationState,
  crewIds: ReadonlySet<number>,
  lastSeen: Map<number, string>,
  removals: Map<number, string>
): void {
  for (const visitor of state.visitors) {
    if (crewIds.has(visitor.id)) lastSeen.set(visitor.id, crewSnapshot(visitor));
  }
  for (const id of crewIds) {
    if (!state.visitors.some((visitor) => visitor.id === id) && !removals.has(id)) {
      removals.set(id, `removed at ${state.now.toFixed(1)} after ${lastSeen.get(id) ?? 'never observed'}`);
    }
  }
}

function sampleClaims(state: StationState, crewIds: ReadonlySet<number>, claims: Map<number, ClaimWitness>): void {
  for (const reservation of state.reservations) {
    if (reservation.releaseReason !== null || typeof reservation.ownerId !== 'number' || !crewIds.has(reservation.ownerId)) continue;
    if (reservation.targetTile === null) continue;
    const service = fixtureServiceForClaim(state, reservation.targetId, reservation.targetTile);
    if (service === null) continue;
    const witness = claims.get(reservation.ownerId);
    if (witness) witness[service] += 1;
  }
}

function sampleEnergySleepCommitments(state: StationState, crewIds: ReadonlySet<number>, pending: Set<number>): void {
  for (const visitor of state.visitors) {
    if (!crewIds.has(visitor.id)) continue;
    if (visitor.recurringNeedActive === 'energy' && visitor.activeService === 'comfort') pending.add(visitor.id);
  }
}

function observeEvents(
  state: StationState,
  crewIds: ReadonlySet<number>,
  shipId: number,
  counts: Map<number, Counts>,
  claims: Map<number, ClaimWitness>,
  observedEventIds: Set<number>,
  pendingEnergySleep: Set<number>
): void {
  for (const event of state.serviceLog.recent) {
    if (observedEventIds.has(event.id)) continue;
    observedEventIds.add(event.id);
    if (!crewIds.has(event.actorId) || event.shipId !== shipId || event.population !== 'visitor') continue;
    if (!CYCLE_SERVICES.includes(event.service as CycleService)) continue;
    const service = event.service as CycleService;
    // Comfort at a Game Station is a deliberate legacy fallback when no
    // temporary bed can be claimed. It is a real service, but it is not sleep
    // and therefore cannot satisfy this repair-crew proof. Likewise, this
    // runner refuses to credit a cycle from an unrelated valid fixture.
    if (service === 'comfort' && pendingEnergySleep.has(event.actorId)) {
      assert(eventMatchesFixture(service, event.moduleType),
        `Repair crew ${event.actorId} resolved recurring energy on ${event.moduleType}, not GuestCabin/BunkBank lodging. ${describe(state, crewIds, counts, claims)}`);
      pendingEnergySleep.delete(event.actorId);
    }
    if (!eventMatchesFixture(service, event.moduleType)) continue;
    assert((claims.get(event.actorId)?.[service] ?? 0) > 0,
      `Repair crew ${event.actorId} completed ${service} without an observed live physical claim. ${describe(state, crewIds, counts, claims)}`);
    counts.get(event.actorId)![service] += 1;
  }
}

function testRepairCrewCycles(): void {
  const state = createInitialState({ seed: 96001, physicalStarterInventory: true, manualTrafficAdmission: true });
  assert(applyColdStartScenario(state, 'long-stay-guest-wing'), 'Expected the long-stay guest wing fixture.');
  state.controls.shipsPerCycle = 0;
  state.controls.paused = false;
  // Isolate the visiting cohort from unrelated starter-hull foot traffic; the
  // fixture's own guests, facilities, stocks, paths, and reservation rules
  // remain entirely production-owned.
  state.crewMembers = [];
  state.residents = [];
  const { ship, contract } = stageRepairTender(state, 96001);

  // The scenario supplies eight genuine guests. Keep four and turn them into
  // one named repair tender's contract crew; the fixture—not this runner—owns
  // every route, reservation, service dwell, stock consumption, and restore.
  const crew = state.visitors.slice(0, 4);
  assert(crew.length === 4, `Long-stay guest wing must stage four crew candidates, got ${crew.length}.`);
  state.visitors = crew;
  for (const visitor of crew) {
    visitor.originShipId = ship.id;
    visitor.stayClass = 'contract';
    visitor.servicePlan = [];
    visitor.completedServices = [];
    visitor.activeService = null;
    visitor.recurringNeedActive = null;
    visitor.needs!.active = null;
    visitor.needs!.unmetSince = null;
    visitor.needs!.hunger = 48;
    visitor.needs!.energy = 48;
    visitor.needs!.hygiene = 48;
    visitor.needs!.leisure = 48;
    visitor.serviceFailureStage = 'none';
    visitor.failureSince = null;
    visitor.failureNeed = null;
  }

  const crewIds = new Set(crew.map((visitor) => visitor.id));
  const counts = new Map(crew.map((visitor) => [visitor.id, zeroCounts()]));
  const claims = new Map(crew.map((visitor) => [visitor.id, zeroCounts()]));
  const observedEventIds = new Set<number>();
  const pendingEnergySleep = new Set<number>();
  const lastSeen = new Map<number, string>();
  const removals = new Map<number, string>();
  let elapsed = 0;
  for (; elapsed < MAX_SECONDS && !allCyclesComplete(counts, crewIds); elapsed += STEP) {
    trackRemovedCrew(state, crewIds, lastSeen, removals);
    sampleClaims(state, crewIds, claims);
    sampleEnergySleepCommitments(state, crewIds, pendingEnergySleep);
    tick(state, STEP);
    trackRemovedCrew(state, crewIds, lastSeen, removals);
    observeEvents(state, crewIds, ship.id, counts, claims, observedEventIds, pendingEnergySleep);
    assert(ship.visitPhase === 'visit-service' && contract.status === 'active',
      `Repair tender recalled before all crew completed two cycles. ${describe(state, crewIds, counts, claims)}`);
    assert(ship.passengersBoarded === 0 && crew.every((visitor) =>
      visitor.transferPhase !== 'boarding-queued' && visitor.transferPhase !== 'boarding-crossing'
    ), `Repair crew entered boarding before recall. ${describe(state, crewIds, counts, claims)}`);
  }
  assert(allCyclesComplete(counts, crewIds),
    `Timed out after ${MAX_SECONDS}s without two physical cycles for every repair crew member. ` +
    `removals=[${[...removals.entries()].map(([id, detail]) => `${id}:${detail}`).join(' | ') || 'none'}]. ` +
    describe(state, crewIds, counts, claims));
  assert(crew.every((visitor) => visitor.serviceFailureStage === 'none'),
    `A supplied repair crew reached service failure despite all four guest-wing facilities. ${describe(state, crewIds, counts, claims)}`);
  assert(pendingEnergySleep.size === 0,
    `A repair crew energy need never resolved through temporary lodging (${[...pendingEnergySleep].join(', ')}). ${describe(state, crewIds, counts, claims)}`);

  // The production recall releases every active fixture claim. It is started
  // only after the observed cycles, so the proof is explicitly pre-recall.
  contract.boardingStartsAt = state.now;
  contract.hardDepartureAt = state.now + 60;
  tick(state, STEP);
  assert(ship.visitPhase === 'recall', `Expected ordinary contract recall after the cycle proof. ${describe(state, crewIds, counts, claims)}`);
  assert(state.reservations.every((reservation) =>
    reservation.releaseReason !== null ||
    typeof reservation.ownerId !== 'number' ||
    !crewIds.has(reservation.ownerId) ||
    reservation.kind === 'transfer-slot'
  ), `Recall retained a repair-crew fixture claim instead of releasing it for boarding. ${describe(state, crewIds, counts, claims)}`);
  for (let cleanupElapsed = 0; cleanupElapsed < 70; cleanupElapsed += STEP) {
    if (state.reservations.every((reservation) =>
      reservation.releaseReason !== null || typeof reservation.ownerId !== 'number' || !crewIds.has(reservation.ownerId)
    )) break;
    tick(state, STEP);
  }
  assert(state.reservations.every((reservation) =>
    reservation.releaseReason !== null || typeof reservation.ownerId !== 'number' || !crewIds.has(reservation.ownerId)
  ), `Recall retained a live repair-crew fixture claim. ${describe(state, crewIds, counts, claims)}`);

  const line = [...crewIds].map((id) => `${id}:${JSON.stringify(counts.get(id))}`).join(' · ');
  console.log(`repair crew cycles: ${line}; completed in ${elapsed.toFixed(1)} sim seconds`);
}

testRepairCrewCycles();
