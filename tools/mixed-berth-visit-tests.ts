import {
  admitTrafficOffer,
  createInitialState,
  getBerthFacilityAt,
  getDockingSlotDescriptors,
  validateDockingSlot,
  tick
} from '../src/sim/index';
import { applyColdStartScenario } from '../src/sim/cold-start-scenarios';
import {
  RoomType,
  ZoneType,
  type ArrivingShip,
  type PortContract,
  type StationState,
  type Visitor
} from '../src/sim/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const STEP = 0.5;

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
  assert(predicate(), `Timed out waiting for ${label}. ${diagnostics(state)}`);
}

function diagnostics(state: StationState): string {
  const ships = state.arrivingShips.map((ship) =>
    `${ship.id}:${ship.stage}/${ship.visitPhase ?? '-'} spawn ${ship.passengersSpawned}/${ship.passengersTotal} board ${ship.passengersBoarded}`
  ).join(', ') || 'none';
  const contracts = state.portOps.contracts.map((contract) =>
    `${contract.id}:ship ${contract.shipId}/${contract.status} ${contract.promises.map((promise) => `${promise.kind} ${promise.completed}/${promise.target}`).join(' | ')}`
  ).join(', ') || 'none';
  const cargo = state.portOps.cargoLots.map((lot) =>
    `${lot.id}:${lot.itemType}/${lot.ownership} ${lot.handledQuantity}/${lot.quantity} ${lot.location}`
  ).join(', ') || 'none';
  const visitors = state.visitors.map((visitor) =>
    `${visitor.id}:${visitor.originShipId ?? 'stranded'} ${visitor.state}/${visitor.transferPhase ?? 'station'} ${visitor.activeService ?? '-'} done=${visitor.completedServices.join('+') || '-'}` +
    ` tile=${visitor.tileIndex} q=${visitor.transferQueueTile ?? '-'} access=${visitor.transferAccessTile ?? '-'} path=${visitor.path.length}:${visitor.path[visitor.path.length - 1] ?? '-'} blocked=${visitor.transferBlockedTile ?? visitor.movementBlockedTile ?? '-'}`
  ).join(', ') || 'none';
  const jobs = state.jobs.filter((job) => job.portShipId !== undefined).map((job) =>
    `${job.id}:${job.portCargoDirection ?? '-'} ${job.itemType} ${job.state} ${job.pickedUpAmount}/${job.amount} ${job.blockedReason ?? '-'}`
  ).join(', ') || 'none';
  const services = state.serviceLog.recent.slice(-12).map((event) =>
    `${event.actorId}:${event.service}@${event.tileIndex} ship=${event.shipId ?? '-'}`
  ).join(', ') || 'none';
  const transfers = state.reservations.filter((reservation) =>
    reservation.releaseReason === null && reservation.kind === 'transfer-slot'
  ).map((reservation) => `${reservation.ownerId}->${reservation.targetTile} ${reservation.targetId}`).join(', ') || 'none';
  return `now=${state.now.toFixed(1)} ships=[${ships}] contracts=[${contracts}] cargo=[${cargo}] visitors=[${visitors}] jobs=[${jobs}] services=[${services}] transfers=[${transfers}]`;
}

function buildState(): StationState {
  const state = createInitialState({
    seed: 88001,
    physicalStarterInventory: true,
    manualTrafficAdmission: true
  });
  assert(applyColdStartScenario(state, 'mixed-berth-visit'), 'Expected mixed-berth-visit fixture.');
  for (let tile = 0; tile < state.rooms.length; tile += 1) {
    const room = state.rooms[tile];
    if (room === RoomType.Cafeteria || room === RoomType.Hygiene || room === RoomType.Market || room === RoomType.Lounge) {
      state.zones[tile] = ZoneType.Public;
    }
  }
  state.controls.shipsPerCycle = 0;
  state.controls.paused = false;
  tick(state, 0);

  // This is station-owned stock for the outbound half of the approved call.
  // The inbound consignment remains contract-owned, so the test can prove the
  // two custodial paths do not collapse into a counter mutation.
  const stock = state.itemNodes.find((node) => state.rooms[node.tileIndex] === RoomType.Storage);
  assert(stock, 'Demo station needs a physical Storage node for outbound freight.');
  stock.items.rawMaterial = Math.max(stock.items.rawMaterial ?? 0, 96);
  return state;
}

function findEastBerth(state: StationState) {
  const anchors: number[] = [];
  const failures: string[] = [];
  for (let tile = 0; tile < state.rooms.length; tile += 1) {
    if (state.rooms[tile] !== RoomType.Berth) continue;
    const facility = getBerthFacilityAt(state, tile);
    if (facility && !anchors.includes(facility.anchorTile)) anchors.push(facility.anchorTile);
  }
  assert(anchors.length > 0, 'Demo station has no derived Berth facility.');
  const offer = state.trafficOffers.find((candidate) => candidate.status === 'holding');
  assert(offer, 'Mixed-berth fixture needs one holding offer.');
  for (const anchor of anchors.sort((a, b) => a - b)) {
    const descriptor = getDockingSlotDescriptors(state).find((candidate) => candidate.id === `berth:${anchor}`);
    const physical = descriptor ? validateDockingSlot(state, descriptor, offer.size, offer.hullVariant) : null;
    const admission = admitTrafficOffer(state, offer.id, anchor);
    if (admission.ok) {
      const facility = getBerthFacilityAt(state, anchor);
      assert(facility, 'Admission succeeded without a derived Berth.');
      return { facility, offer };
    }
    failures.push(
      `${anchor}:${admission.reason ?? 'no reason'} physical=${physical?.hardReasons.join(',') || 'none'}` +
      ` facing=${descriptor?.facing ?? '-'} envelopes=${descriptor ? JSON.stringify(descriptor.envelopesByHull[offer.hullVariant]) : '-'}`
    );
  }
  throw new Error(`Could not admit east-lane mixed offer to demo Berths ${anchors.join(', ')} (${failures.join('; ')}). ${diagnostics(state)}`);
}

function shipFor(state: StationState, id: number): ArrivingShip {
  const ship = state.arrivingShips.find((candidate) => candidate.id === id);
  assert(ship, `Missing active ship ${id}. ${diagnostics(state)}`);
  return ship;
}

function contractFor(state: StationState, shipId: number): PortContract {
  const contract = state.portOps.contracts.find((candidate) => candidate.shipId === shipId);
  assert(contract, `Missing contract for ship ${shipId}. ${diagnostics(state)}`);
  return contract;
}

function visitorsFor(state: StationState, shipId: number): Visitor[] {
  return state.visitors.filter((visitor) => visitor.originShipId === shipId);
}

function portJobsFor(state: StationState, shipId: number) {
  return state.jobs.filter((job) => job.portShipId === shipId);
}

function testMediumMixedBerthVisit(): void {
  const state = buildState();
  const { facility, offer } = findEastBerth(state);
  assert(facility.anchorTile >= 0, 'Expected a real derived Berth anchor.');
  assert(state.portOps.contracts.length === 1, 'Admission did not create one port contract.');
  assert(state.portOps.cargoLots.length === 2, 'Mixed call did not create separate inbound cargo lots.');
  assert(state.portOps.cargoLots.every((lot) => lot.location === 'aboard'), 'Cargo was not held aboard after admission.');

  let observedApproach = false;
  let observedDocked = false;
  let observedSecure = false;
  let observedDisembark = false;
  let observedVisitService = false;
  let observedPhysicalHospitality = false;
  let observedCargoJob = false;
  let observedCargoProgress = false;
  const initialDistance = state.portOps.telemetry.cargoUnitTileDistance;

  for (let elapsed = 0; elapsed < 190; elapsed += STEP) {
    const ship = state.arrivingShips.find((candidate) => candidate.id === offer.id);
    if (ship) {
      observedApproach ||= ship.stage === 'approach';
      observedDocked ||= ship.stage === 'docked' || ship.dockedAt > 0;
      observedSecure ||= ship.visitPhase === 'secure' || ship.visitPhase === 'visit-service' ||
        ship.visitPhase === 'recall' || ship.visitPhase === 'boarding';
      observedVisitService ||= ship.visitPhase === 'visit-service';
    }
    const cohort = visitorsFor(state, offer.id);
    observedDisembark ||= cohort.some((visitor) =>
      visitor.transferPhase === 'disembark-queued' || visitor.transferPhase === 'disembark-crossing' || visitor.transferPhase === 'station'
    );
    observedPhysicalHospitality ||= state.serviceLog.recent.some((event) =>
      event.population === 'visitor' && event.shipId === offer.id && event.service !== 'retail'
    );
    const jobs = portJobsFor(state, offer.id);
    observedCargoJob ||= jobs.some((job) => job.portCargoLotId !== undefined);
    observedCargoProgress ||= state.portOps.cargoLots.some((lot) => lot.handledQuantity > 0);
    if (
      observedApproach && observedDocked && observedSecure && observedDisembark && observedVisitService &&
      observedPhysicalHospitality && observedCargoJob && observedCargoProgress &&
      state.portOps.telemetry.cargoUnitTileDistance > initialDistance
    ) break;
    tick(state, STEP);
  }

  const ship = shipFor(state, offer.id);
  const contract = contractFor(state, offer.id);
  const cohort = visitorsFor(state, offer.id);
  const lots = state.portOps.cargoLots.filter((lot) => lot.contractId === contract.id);
  const jobs = portJobsFor(state, offer.id);
  assert(observedApproach, `Ship skipped physical approach. ${diagnostics(state)}`);
  assert(observedDocked && observedSecure, `Ship did not reach docked/secure. ${diagnostics(state)}`);
  assert(observedDisembark && ship.passengersSpawned > 0, `Passengers did not emerge through the berth. ${diagnostics(state)}`);
  assert(observedVisitService, `Ship never reached visit-service. ${diagnostics(state)}`);
  assert(cohort.every((visitor) => visitor.originShipId === offer.id), `Visitor cohort did not retain ship provenance. ${diagnostics(state)}`);
  assert(observedPhysicalHospitality, `No ship visitor completed a physical hospitality service. ${diagnostics(state)}`);
  assert(
    contract.promises.some((promise) =>
      (promise.kind === 'passengers-served' || promise.kind === 'drinks-served' ||
        promise.kind === 'leisure-served' || promise.kind === 'restroom-served' ||
        promise.kind === 'hygiene-served' || promise.kind === 'comfort-served') && promise.completed > 0
    ),
    `Physical hospitality did not advance its admitted promise. ${diagnostics(state)}`
  );
  assert(observedCargoJob && jobs.some((job) => job.portCargoLotId !== undefined), `No real contract-owned cargo job was created. ${diagnostics(state)}`);
  assert(lots.some((lot) => lot.handledQuantity > 0), `Cargo custody never advanced. ${diagnostics(state)}`);
  assert(state.portOps.telemetry.cargoUnitTileDistance > initialDistance, `Cargo completed without physical tile distance. ${diagnostics(state)}`);
  assert(lots.every((lot) => lot.ownership === 'consigned'), `Inbound cargo ownership leaked into station stock. ${diagnostics(state)}`);

  // The public schedule clock is deliberately moved only after real passenger
  // and freight activity. Unfinished contract-owned work should buy exactly
  // one bounded extension, through the same lifecycle used in play.
  assert(ship.stayClass === 'contract' || ship.stayClass === 'extended', `Industrial medium offer did not derive a long stay (${ship.stayClass ?? 'missing'}).`);
  assert(ship.portTurnaround && ship.portTurnaround.phase !== 'open', `Cargo completed before the extension branch could be exercised. ${diagnostics(state)}`);
  contract.boardingStartsAt = state.now;
  tick(state, STEP);
  assert(ship.extensionUntil !== null && ship.visitScheduleReason === 'remaining-work', `Unfinished real work did not create a bounded extension. ${diagnostics(state)}`);
  assert(contract.extensionUntil === ship.extensionUntil && contract.visitScheduleReason === 'remaining-work', 'Ship and contract diverged on extension reason.');
  const firstExtension = ship.extensionUntil;
  contract.boardingStartsAt = state.now;
  tick(state, STEP);
  assert(ship.extensionUntil === firstExtension, 'A second free long-stay extension was granted.');

  // Now make the same contract recall. We observe the real boarding crossing
  // before advancing its hard deadline, then let production cleanup settle it.
  contract.boardingStartsAt = state.now;
  contract.hardDepartureAt = state.now + 60;
  let observedBoardingCrossing = false;
  waitFor(
    state,
    'recall, physical boarding crossing and first boarded passenger',
    () => {
      const active = state.arrivingShips.find((candidate) => candidate.id === offer.id);
      if (active?.visitPhase !== 'recall' && active?.visitPhase !== 'boarding') return false;
      observedBoardingCrossing ||= visitorsFor(state, offer.id).some(
        (visitor) => visitor.transferPhase === 'boarding-crossing'
      );
      return observedBoardingCrossing && active.passengersBoarded > 0;
    },
    50
  );
  assert(ship.recallAt !== null && contract.status === 'boarding', `Recall did not take ownership of passenger return. ${diagnostics(state)}`);
  assert(observedBoardingCrossing, `Passenger return skipped the physical berth crossing. ${diagnostics(state)}`);
  assert(ship.passengersBoarded > 0, `Physical boarding did not return any passenger before departure. ${diagnostics(state)}`);

  contract.hardDepartureAt = state.now + 6;
  waitFor(state, 'ship departure and settlement', () => !state.arrivingShips.some((candidate) => candidate.id === offer.id), 30);
  assert(String(contract.status) === 'departed' && contract.settlementId !== null, `Departed mixed call did not settle. ${diagnostics(state)}`);
  assert(state.portOps.settlements.filter((settlement) => settlement.contractId === contract.id).length === 1, 'Mixed call did not settle exactly once.');
  assert(
    portJobsFor(state, offer.id).every((job) => job.state === 'done' || job.state === 'expired'),
    `Departure retained live contract jobs. ${diagnostics(state)}`
  );
  assert(
    state.reservations.every((reservation) =>
      reservation.releaseReason !== null ||
      reservation.ownerKind !== 'visitor' ||
      !cohort.some((visitor) => visitor.id === reservation.ownerId) ||
      reservation.kind !== 'transfer-slot'
    ),
    `Departure retained a stale passenger-transfer reservation. ${diagnostics(state)}`
  );
  const stranded = state.visitors.filter((visitor) => visitor.strandedFromShipId === offer.id);
  assert(
    stranded.length === offer.passengersTotal - ship.passengersBoarded &&
      stranded.every((visitor) => visitor.originShipId === null),
    `Unboarded passengers lost their stranded provenance. ${diagnostics(state)}`
  );

  const settlementCount = state.portOps.settlements.length;
  const settlementId = contract.settlementId;
  advance(state, 8);
  assert(state.portOps.settlements.length === settlementCount, 'Post-departure ticks settled the mixed call twice.');
  assert(contract.settlementId === settlementId, 'Post-departure ticks replaced the mixed call settlement.');
}

function main(): void {
  testMediumMixedBerthVisit();
  console.log('mixed-berth-visit-tests: ok');
}

main();
