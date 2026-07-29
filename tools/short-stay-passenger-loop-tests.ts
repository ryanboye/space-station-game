import { applyColdStartScenario } from '../src/sim/cold-start-scenarios';
import {
  admitTrafficOffer,
  createInitialState,
  getEligibleBerthsForOffer,
  tick
} from '../src/sim/sim';
import type { PortPromiseKind, StationState, TrafficOffer } from '../src/sim/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`short-stay-passenger-loop: ${message}`);
}

const STEP = 0.1;

function advance(state: StationState, seconds: number): void {
  state.controls.paused = false;
  for (let elapsed = 0; elapsed + 1e-9 < seconds; elapsed += STEP) {
    tick(state, Math.min(STEP, seconds - elapsed));
  }
}

function buildAuthoredCall(seed = 1338): { state: StationState; offer: TrafficOffer } {
  const state = createInitialState({
    seed,
    physicalStarterInventory: true,
    manualTrafficAdmission: true
  });
  assert(applyColdStartScenario(state, 'demo-station'), 'demo-station scenario was not registered');
  state.controls.paused = false;
  tick(state, 0);

  // Let the production onboarding sequence publish its ordinary authored set.
  // Freeze future generation before admission; from the admission call onward
  // this runner only advances time and observes production state.
  advance(state, 5);
  const offer = state.trafficOffers.find(
    (candidate) =>
      candidate.offerKind === 'passenger' &&
      (candidate.status === 'forecast' || candidate.status === 'holding')
  );
  assert(offer, 'the first authored passenger offer was not published');
  state.controls.shipsPerCycle = 0;
  const berth = getEligibleBerthsForOffer(state, offer.id)[0];
  assert(berth, 'the authored passenger offer had no eligible physical Berth');
  const admission = admitTrafficOffer(state, offer.id, berth.anchorTile);
  assert(admission.ok, admission.reason ?? 'the authored passenger offer was rejected');
  return { state, offer };
}

function promiseTarget(offer: TrafficOffer, kind: PortPromiseKind): number {
  if (kind === 'passengers-served') return offer.hospitalityDemand?.meal ?? 0;
  if (kind === 'restroom-served') return offer.hospitalityDemand?.restroom ?? 0;
  if (kind === 'passengers-returned') return offer.passengersTotal;
  return 0;
}

function testFirstAuthoredShortStayCompletesChronologically(): void {
  const { state, offer } = buildAuthoredCall();
  const demand = offer.hospitalityDemand;
  assert(demand, 'the authored passenger offer had no hospitality demand');
  assert(offer.passengersTotal === 10, `expected 10 authored passengers, got ${offer.passengersTotal}`);
  assert(promiseTarget(offer, 'passengers-served') === 8, `expected an 8-meal promise, got ${demand.meal}`);
  assert(promiseTarget(offer, 'restroom-served') === 5, `expected a 5-restroom promise, got ${demand.restroom}`);

  const contract = state.portOps.contracts.find((candidate) => candidate.offerId === offer.id);
  assert(contract, 'admission created no contract');
  const creditsAfterAdmission = state.metrics.credits;
  const cohortIds = new Set<number>();
  let maxEmerged = 0;
  let maxBoarded = 0;
  let dockedAt: number | null = null;
  let allEmergedAt: number | null = null;
  let mealsCompletedAt: number | null = null;
  let restroomsCompletedAt: number | null = null;
  let recallAt: number | null = null;
  let allBoardedAt: number | null = null;
  let departedAt: number | null = null;
  let settlementAt: number | null = null;
  let settlementCreditDelta: number | null = null;
  let creditsAtLastObservation = state.metrics.credits;
  let lastBoardingSnapshot = '';
  let lastInterfaceSnapshot = '';
  let lastServiceSnapshot = '';

  for (let elapsed = 0; elapsed < 240; elapsed += STEP) {
    const ship = state.arrivingShips.find((candidate) => candidate.id === offer.id);
    if (ship) {
      if (ship.stage === 'docked' && dockedAt === null) dockedAt = state.now;
      maxEmerged = Math.max(maxEmerged, ship.passengersSpawned);
      maxBoarded = Math.max(maxBoarded, ship.passengersBoarded);
      if (ship.passengersSpawned === ship.passengersTotal && allEmergedAt === null) allEmergedAt = state.now;
      if ((ship.visitPhase === 'recall' || ship.visitPhase === 'boarding') && recallAt === null) recallAt = state.now;
      if (ship.visitPhase === 'recall' || ship.visitPhase === 'boarding') {
        lastBoardingSnapshot = state.visitors
          .filter((visitor) => visitor.originShipId === offer.id)
          .map((visitor) => `${visitor.id}:${visitor.transferPhase ?? 'station'}@${visitor.tileIndex}` +
            `>q${visitor.transferQueueTile ?? '-'}:a${visitor.transferAccessTile ?? '-'}:s${visitor.transferStationTile ?? '-'}` +
            `:t${visitor.transferQueuedAt?.toFixed(4) ?? '-'}:p${visitor.path.length}` +
            `:xy${visitor.x.toFixed(2)},${visitor.y.toFixed(2)}:b${visitor.blockedTicks}:${visitor.movementWaitReason ?? '-'}`)
          .join(', ');
        const accessTiles = new Set(
          state.visitors
            .filter((visitor) => visitor.originShipId === offer.id && visitor.transferAccessTile != null)
            .map((visitor) => visitor.transferAccessTile!)
        );
        lastInterfaceSnapshot = [
          ...state.visitors.map((actor) => ({ kind: 'visitor', actor })),
          ...state.crewMembers.map((actor) => ({ kind: 'crew', actor })),
          ...state.residents.map((actor) => ({ kind: 'resident', actor }))
        ]
          .filter(({ actor }) => accessTiles.has(actor.tileIndex))
          .map(({ kind, actor }) => `${kind}:${actor.id}@${actor.tileIndex}>${actor.path[0] ?? '-'}:${actor.movementWaitReason ?? '-'}`)
          .join(', ');
      }
      if (ship.passengersBoarded === ship.passengersTotal && allBoardedAt === null) allBoardedAt = state.now;
      if (ship.stage === 'depart' && departedAt === null) departedAt = state.now;
    } else if (dockedAt !== null && departedAt === null) {
      departedAt = state.now;
    }
    for (const visitor of state.visitors) {
      if (visitor.originShipId === offer.id) cohortIds.add(visitor.id);
    }
    const mealCount = state.serviceLog.recent.filter(
      (event) => event.shipId === offer.id && event.service === 'meal'
    ).length;
    const restroomCount = state.serviceLog.recent.filter(
      (event) => event.shipId === offer.id && event.service === 'restroom'
    ).length;
    if (mealCount >= 8 && mealsCompletedAt === null) mealsCompletedAt = state.now;
    if (restroomCount >= 5 && restroomsCompletedAt === null) restroomsCompletedAt = state.now;
    const settlement = state.portOps.settlements.find((candidate) => candidate.contractId === contract.id);
    if (recallAt === null && state.now >= 150) {
      lastServiceSnapshot = state.visitors
        .filter((visitor) => visitor.originShipId === offer.id)
        .map((visitor) => `${visitor.id}:${visitor.activeService ?? '-'}:${visitor.state}@${visitor.tileIndex}` +
          `>r${visitor.reservedTargetTile ?? '-'}:p${visitor.path.length}:b${visitor.serviceBlockedSince ?? '-'}`)
        .join(', ');
    }
    if (settlement && settlementAt === null) {
      settlementAt = state.now;
      settlementCreditDelta = state.metrics.credits - creditsAtLastObservation;
    }
    if (settlement && departedAt !== null && !state.arrivingShips.some((candidate) => candidate.id === offer.id)) break;
    creditsAtLastObservation = state.metrics.credits;
    tick(state, STEP);
  }

  const mealEvents = state.serviceLog.recent.filter((event) => event.shipId === offer.id && event.service === 'meal');
  const restroomEvents = state.serviceLog.recent.filter((event) => event.shipId === offer.id && event.service === 'restroom');
  const settlement = state.portOps.settlements.find((candidate) => candidate.contractId === contract.id);
  const passengerClaims = state.reservations.filter(
    (reservation) =>
      reservation.releaseReason === null &&
      reservation.ownerKind === 'visitor' &&
      cohortIds.has(Number(reservation.ownerId))
  );
  const queueRemainders = [...state.derived.queueTheater.membersByAnchor.values()]
    .flat()
    .filter((id) => cohortIds.has(id));
  const completionSummary = state.serviceLog.recent
    .filter((event) => event.shipId === offer.id)
    .map((event) => `${event.actorId}:${event.service}@${event.at.toFixed(1)}`)
    .join(', ');
  const promiseSummary = contract.promises
    .map((promise) => `${promise.kind}=${promise.completed}/${promise.target}`)
    .join(', ');
  const cohortSummary = state.visitors
    .filter((visitor) => cohortIds.has(visitor.id))
    .map((visitor) => `${visitor.id}:${visitor.servicePlan.join('+')}[${visitor.completedServices.join('+')}]` +
      `/${visitor.activeService ?? '-'}:${visitor.state}@${visitor.tileIndex}:${visitor.strandedFromShipId ?? '-'}`)
    .join(', ');

  assert(maxEmerged === 10, `only ${maxEmerged}/10 passengers physically emerged`);
  assert(mealEvents.length === 8, `recorded ${mealEvents.length}/8 physical meal completions`);
  assert(
    restroomEvents.length === 5,
    `recorded ${restroomEvents.length}/5 physical restroom completions ` +
      `(dock ${dockedAt}, emerged ${allEmergedAt}, meal ${mealsCompletedAt}, restroom ${restroomsCompletedAt}, ` +
      `recall ${recallAt}, boarded ${allBoardedAt}, depart ${departedAt}, settle ${settlementAt}; ` +
      `${promiseSummary}; ${completionSummary}; pre-recall ${lastServiceSnapshot}; cohort ${cohortSummary}; notes ${settlement?.notes.join(' / ') ?? 'none'})`
  );
  assert(
    maxBoarded === 10,
    `only ${maxBoarded}/10 passengers physically returned ` +
      `(dock ${dockedAt}, emerged ${allEmergedAt}, meal ${mealsCompletedAt}, restroom ${restroomsCompletedAt}, ` +
      `recall ${recallAt}, boarded ${allBoardedAt}, depart ${departedAt}, settle ${settlementAt}; ` +
      `${promiseSummary}; boarding ${lastBoardingSnapshot}; interfaces ${lastInterfaceSnapshot}; ` +
      `cohort ${cohortSummary}; notes ${settlement?.notes.join(' / ') ?? 'none'})`
  );
  assert(settlement && settlement.payoutCredits > 0, `expected one positive settlement, got ${settlement?.payoutCredits ?? 'none'}`);
  assert(state.portOps.settlements.filter((candidate) => candidate.contractId === contract.id).length === 1, 'contract did not settle exactly once');
  assert(contract.status === 'departed', `contract stopped at ${contract.status} instead of departed`);
  assert(!state.arrivingShips.some((candidate) => candidate.id === offer.id), 'ship remained active after departure');
  assert(!state.visitors.some((visitor) => visitor.strandedFromShipId === offer.id), 'the call stranded a visitor');
  assert(!state.visitors.some((visitor) => cohortIds.has(visitor.id)), 'a returned passenger remained in the station actor list');
  assert(passengerClaims.length === 0, `left ${passengerClaims.length} live passenger claims`);
  assert(queueRemainders.length === 0, `left ${queueRemainders.length} passenger queue members`);
  assert(
    settlementCreditDelta !== null && settlementCreditDelta > 0,
    `positive settlement did not increase credits on its settlement tick (delta ${settlementCreditDelta ?? 'none'}; ` +
      `admission ${creditsAfterAdmission.toFixed(1)}, final ${state.metrics.credits.toFixed(1)})`
  );
  assert(dockedAt !== null && allEmergedAt !== null && mealsCompletedAt !== null && restroomsCompletedAt !== null &&
    recallAt !== null && allBoardedAt !== null && departedAt !== null && settlementAt !== null, 'chronological milestones were incomplete');

  console.log(
    `PASS first-authored-short-stay: dock ${dockedAt.toFixed(1)}s · emerged ${allEmergedAt.toFixed(1)}s · ` +
    `meals ${mealsCompletedAt.toFixed(1)}s · restrooms ${restroomsCompletedAt.toFixed(1)}s · ` +
    `recall ${recallAt.toFixed(1)}s · boarded ${allBoardedAt.toFixed(1)}s · departed ${departedAt.toFixed(1)}s · ` +
    `settlement +${settlement.payoutCredits.toFixed(1)}c at ${settlementAt.toFixed(1)}s`
  );
}

testFirstAuthoredShortStayCompletesChronologically();
