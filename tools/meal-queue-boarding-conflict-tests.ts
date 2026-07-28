import {
  admitTrafficOffer,
  createInitialState,
  getDockingSlotDescriptors,
  getBerthFacilityAt,
  validateDockingSlot,
  tick
} from '../src/sim/index';
import { applyColdStartScenario } from '../src/sim/cold-start-scenarios';
import {
  RoomType,
  TileType,
  VisitorState,
  type ArrivingShip,
  type PortContract,
  type StationState,
  type Visitor
} from '../src/sim/types';

const STEP = 0.1;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`meal-queue-boarding-conflict: ${message}`);
}

function advance(state: StationState, seconds: number): void {
  state.controls.paused = false;
  for (let elapsed = 0; elapsed + 1e-9 < seconds; elapsed += STEP) {
    tick(state, Math.min(STEP, seconds - elapsed));
  }
}

function waitFor(state: StationState, label: string, predicate: () => boolean, maxSeconds: number): void {
  for (let elapsed = 0; elapsed < maxSeconds; elapsed += STEP) {
    if (predicate()) return;
    tick(state, STEP);
  }
  assert(predicate(), `timed out waiting for ${label}. ${diagnostics(state)}`);
}

function diagnostics(state: StationState): string {
  const ships = state.arrivingShips.map((ship) =>
    `${ship.portManifest?.callsign ?? ship.id}:${ship.stage}/${ship.visitPhase ?? '-'} spawn=${ship.passengersSpawned}/${ship.passengersTotal} board=${ship.passengersBoarded}`
  ).join(', ') || 'none';
  const visitors = state.visitors.map((visitor) =>
    `${visitor.id}:${visitor.originShipId ?? 'stranded'}:${visitor.state}/${visitor.transferPhase ?? 'station'} tile=${visitor.tileIndex}` +
    ` q=${visitor.queueProviderTile ?? '-'} reserve=${visitor.reservedServingTile ?? '-'} blocked=${visitor.transferBlockedTile ?? visitor.movementBlockedTile ?? '-'}`
  ).join(', ') || 'none';
  const reservations = state.reservations.filter((reservation) => reservation.releaseReason === null)
    .map((reservation) => `${reservation.ownerId}:${reservation.targetId}@${reservation.targetTile}`).join(', ') || 'none';
  return `now=${state.now.toFixed(1)} ships=[${ships}] visitors=[${visitors}] reservations=[${reservations}] waits=${(state.portOps.telemetry.passengerTransferWaitSeconds ?? 0).toFixed(1)} deadline=${state.portOps.telemetry.hardDeadlineDepartures}`;
}

function buildState(seed: number): StationState {
  const state = createInitialState({ seed, physicalStarterInventory: true, manualTrafficAdmission: true });
  assert(applyColdStartScenario(state, 'meal-queue-boarding-conflict'), 'scenario was not registered');
  state.controls.paused = false;
  return state;
}

function berths(state: StationState): number[] {
  const anchors = new Set<number>();
  for (let tile = 0; tile < state.rooms.length; tile += 1) {
    if (state.rooms[tile] !== RoomType.Berth) continue;
    const facility = getBerthFacilityAt(state, tile);
    if (facility) anchors.add(facility.anchorTile);
  }
  const out = [...anchors].sort((a, b) => a - b);
  const details = out.map((anchor) => {
    const facility = getBerthFacilityAt(state, anchor)!;
    return `${anchor}:${facility.geometry}/${facility.size} valid=${facility.geometryValid} clamps=${facility.clampCapacity} caps=${facility.capabilities.join('+')} reasons=${facility.reasons.join('+') || 'none'}`;
  });
  assert(out.length === 2, `expected exactly two legal berths, got ${out.length} (${details.join('; ')})`);
  return out;
}

function offerId(state: StationState, prefix: string): number {
  const offer = state.trafficOffers.find((candidate) => candidate.callsign.startsWith(prefix));
  assert(offer, `missing ${prefix} traffic offer`);
  return offer.id;
}

function ship(state: StationState, id: number): ArrivingShip {
  const found = state.arrivingShips.find((candidate) => candidate.id === id);
  assert(found, `ship ${id} is not active. ${diagnostics(state)}`);
  return found;
}

function contract(state: StationState, shipId: number): PortContract {
  const found = state.portOps.contracts.find((candidate) => candidate.shipId === shipId);
  assert(found, `missing contract for ship ${shipId}. ${diagnostics(state)}`);
  return found;
}

function visitorsFor(state: StationState, shipId: number): Visitor[] {
  return state.visitors.filter((visitor) => visitor.originShipId === shipId);
}

function queueReservationsFor(state: StationState, shipId: number): Array<{ visitor: Visitor; tile: number }> {
  return state.reservations
    .filter((reservation) =>
      reservation.releaseReason === null &&
      reservation.ownerKind === 'visitor' &&
      reservation.targetId?.startsWith('queue-slot:') &&
      reservation.targetTile !== null &&
      visitorsFor(state, shipId).some((visitor) => visitor.id === reservation.ownerId)
    )
    .map((reservation) => ({
      visitor: state.visitors.find((visitor) => visitor.id === reservation.ownerId)!,
      tile: reservation.targetTile!
    }));
}

function sharedThroat(state: StationState): number {
  const candidates: number[] = [];
  for (let tile = 0; tile < state.tiles.length; tile += 1) {
    if (state.tiles[tile] !== TileType.Door || state.rooms[tile] !== RoomType.Cafeteria) continue;
    const x = tile % state.width;
    const east = tile + 1;
    if (x + 1 < state.width && state.rooms[east] === RoomType.Berth) candidates.push(tile);
  }
  assert(candidates.length === 1, `expected one cafeteria-to-berth throat, got ${candidates.join(',')}`);
  return candidates[0];
}

function admitOffer(state: StationState, offer: number, berthAnchor: number): void {
  const admission = admitTrafficOffer(state, offer, berthAnchor);
  const facility = getBerthFacilityAt(state, berthAnchor);
  const manifest = state.trafficOffers.find((candidate) => candidate.id === offer);
  const descriptor = getDockingSlotDescriptors(state).find((candidate) => candidate.id === `berth:${berthAnchor}`);
  const slotValidation = descriptor && manifest
    ? validateDockingSlot(state, descriptor, manifest.size, manifest.hullVariant)
    : null;
  assert(
    admission.ok,
    `admission failed: ${admission.reason ?? 'unknown'}; berth=${facility?.geometry}/${facility?.size} valid=${facility?.geometryValid} clamps=${facility?.clampCapacity} caps=${facility?.capabilities.join('+')} reasons=${facility?.reasons.join('+')} slot=${slotValidation ? `${slotValidation.valid}:${slotValidation.hardReasons.join('+')}` : 'none'}. ${diagnostics(state)}`
  );
}

function waitForDock(state: StationState, offer: number): ArrivingShip {
  waitFor(state, `ship ${offer} dock`, () => state.arrivingShips.some((candidate) => candidate.id === offer && candidate.stage === 'docked'), 14);
  return ship(state, offer);
}

type RunOutcome = {
  boardedBeforeDeadline: number;
  deadlineDepartures: number;
  stranded: number;
  queueCount: number;
  throatOccupied: boolean;
  transferBlocked: boolean;
  transferWaitSeconds: number;
  mealEvents: number;
};

function runConflict(seed: number, withDiningShip: boolean): RunOutcome {
  const state = buildState(seed);
  const [northBerth, southBerth] = berths(state);
  const dinerOffer = offerId(state, 'DINERS');
  const returnOffer = offerId(state, 'RETURN');
  const throat = sharedThroat(state);
  let queueCountAtThroat = 0;
  let queuedDinerOccupiedThroat = false;

  // Admit every intended call while the authored pressure map is intact, then
  // let normal approach ownership decide their actual docking order. This is
  // the same player-facing control action, not a docked-ship fixture.
  admitOffer(state, returnOffer, southBerth);
  if (withDiningShip) admitOffer(state, dinerOffer, northBerth);
  const returning = waitForDock(state, returnOffer);
  waitFor(state, 'return ship physical disembark', () => returning.passengersSpawned === returning.passengersTotal, 18);

  let diner: ArrivingShip | null = null;
  if (withDiningShip) {
    diner = waitForDock(state, dinerOffer);
    waitFor(
      state,
      'dining ship physical disembark and real queue spilling through shared throat',
      () => {
        const reservations = queueReservationsFor(state, dinerOffer);
        const queuedDinerAtThroat = state.visitors.find((visitor) =>
          visitor.originShipId === dinerOffer &&
          visitor.state === VisitorState.Queueing &&
          visitor.queueProviderTile !== null &&
          visitor.tileIndex === throat
        );
        const ownsLiveQueueSlot = queuedDinerAtThroat !== undefined &&
          reservations.some((entry) => entry.visitor.id === queuedDinerAtThroat.id);
        const ready = diner!.passengersSpawned >= 10 &&
          reservations.length >= 3 &&
          new Set(reservations.map((entry) => entry.tile)).size === reservations.length &&
          ownsLiveQueueSlot;
        if (ready) {
          queueCountAtThroat = reservations.length;
          queuedDinerOccupiedThroat = true;
        }
        return ready;
      },
      42
    );
  }

  const returningContract = contract(state, returnOffer);
  returningContract.boardingStartsAt = state.now + 0.2;
  returningContract.plannedDepartureAt = state.now + 7;
  returningContract.hardDepartureAt = state.now + 7;
  returning.plannedDepartureAt = state.now + 7;

  let transferBlocked = false;
  let sawRecallOrBoarding = false;
  const waitBefore = state.portOps.telemetry.passengerTransferWaitSeconds ?? 0;
  for (let elapsed = 0; elapsed < 12 && state.arrivingShips.some((candidate) => candidate.id === returnOffer); elapsed += STEP) {
    tick(state, STEP);
    const activeReturn = state.arrivingShips.find((candidate) => candidate.id === returnOffer);
    sawRecallOrBoarding ||= activeReturn?.visitPhase === 'recall' || activeReturn?.visitPhase === 'boarding';
    const dinerQueueActors = new Set(queueReservationsFor(state, dinerOffer).map((entry) => entry.visitor.id));
    transferBlocked ||= visitorsFor(state, returnOffer).some((visitor) =>
      visitor.transferBlockedTile === throat &&
      visitor.movementWaitReason !== undefined &&
      state.visitors.some((candidate) =>
        candidate.tileIndex === throat &&
        candidate.state === VisitorState.Queueing &&
        candidate.queueProviderTile !== null &&
        dinerQueueActors.has(candidate.id)
      )
    );
  }

  const stranded = state.visitors.filter((visitor) => visitor.strandedFromShipId === returnOffer);
  const mealEvents = state.serviceLog.recent.filter((event) => event.service === 'meal' && event.shipId === dinerOffer).length;
  const boarded = returning.passengersBoarded;
  const outcome = {
    boardedBeforeDeadline: boarded,
    deadlineDepartures: state.portOps.telemetry.hardDeadlineDepartures,
    stranded: stranded.length,
    queueCount: queueCountAtThroat,
    throatOccupied: queuedDinerOccupiedThroat,
    transferBlocked,
    transferWaitSeconds: (state.portOps.telemetry.passengerTransferWaitSeconds ?? 0) - waitBefore,
    mealEvents
  };

  if (withDiningShip) {
    assert(diner !== null && diner.passengersSpawned >= 10, `diner did not physically disembark a substantial cohort. ${diagnostics(state)}`);
    assert(outcome.queueCount >= 3, `diner queue never established three live queue slots. ${diagnostics(state)}`);
    assert(outcome.throatOccupied, `no queued diner holding a live queue reservation physically occupied the throat. ${diagnostics(state)}`);
    assert(sawRecallOrBoarding, `return ship never entered production recall/boarding. ${diagnostics(state)}`);
    assert(outcome.transferBlocked, `returning passenger never recorded production blockage at the diner throat. ${diagnostics(state)}`);
    assert(outcome.transferWaitSeconds > 0, `passenger transfer wait telemetry did not increase. ${diagnostics(state)}`);
    assert(outcome.deadlineDepartures === 1, `returning ship did not hit exactly one hard departure. ${diagnostics(state)}`);
    assert(outcome.stranded > 0, `hard departure did not strand a returning passenger with provenance. ${diagnostics(state)}`);
    const completedMeals = visitorsFor(state, dinerOffer).filter((visitor) => visitor.completedServices.includes('meal')).length;
    assert(
      completedMeals === outcome.mealEvents,
      `meal completion diverged from canonical meal service events (${completedMeals} vs ${outcome.mealEvents}). ${diagnostics(state)}`
    );
    assert(outcome.mealEvents > 0, `diner queue never produced a real meal service event. ${diagnostics(state)}`);
  }
  return outcome;
}

function outcomeKey(outcome: RunOutcome): string {
  return [
    outcome.boardedBeforeDeadline,
    outcome.deadlineDepartures,
    outcome.stranded,
    outcome.queueCount,
    outcome.throatOccupied,
    outcome.transferBlocked,
    outcome.transferWaitSeconds.toFixed(2),
    outcome.mealEvents
  ].join('|');
}

function main(): void {
  const clear = runConflict(96001, false);
  const first = runConflict(96001, true);
  const second = runConflict(96001, true);
  assert(
    first.boardedBeforeDeadline < clear.boardedBeforeDeadline,
    `shared meal line did not reduce boarding before the same deadline (${first.boardedBeforeDeadline} vs clear ${clear.boardedBeforeDeadline})`
  );
  assert(outcomeKey(first) === outcomeKey(second), `same seeded production run diverged (${outcomeKey(first)} vs ${outcomeKey(second)})`);
  console.log('meal-queue-boarding-conflict-tests: ok');
}

main();
