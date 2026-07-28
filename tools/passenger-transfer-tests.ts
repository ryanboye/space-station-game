import {
  admitTrafficOffer,
  createInitialState,
  getBerthFacilityAt,
  removeModuleAtTile,
  setCrewShiftTarget,
  tick,
  tryPlaceModule
} from '../src/sim/index';
import { applyColdStartScenario } from '../src/sim/cold-start-scenarios';
import { hydrateStateFromSave, parseAndMigrateSave, serializeSave } from '../src/sim/save';
import { ModuleType, RoomType, ZoneType, type ArrivingShip, type StationState, type TrafficOffer, type Visitor } from '../src/sim/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const STEP = 0.1;

function advance(state: StationState, seconds: number): void {
  state.controls.paused = false;
  for (let elapsed = 0; elapsed + 1e-9 < seconds; elapsed += STEP) tick(state, Math.min(STEP, seconds - elapsed));
}

function hydrateRunning(save: Parameters<typeof hydrateStateFromSave>[0], seed: number): StationState {
  const state = hydrateStateFromSave(save, { seed }).state;
  // Loading intentionally returns to the player paused. These checks exercise
  // resumed simulation behavior, so make that user action explicit.
  state.controls.paused = false;
  return state;
}

function demoState(seed: number): StationState {
  const state = createInitialState({ seed, physicalStarterInventory: true, manualTrafficAdmission: true });
  assert(applyColdStartScenario(state, 'demo-station'), 'Expected the demo-station fixture.');
  // Transfer throughput is the variable under test. Keep the demo cafeteria
  // publicly usable so opening-business access policy cannot turn passengers
  // around into the same Gangway before their cohort has emerged.
  for (let tile = 0; tile < state.rooms.length; tile += 1) {
    if (state.rooms[tile] === RoomType.Cafeteria) state.zones[tile] = ZoneType.Public;
  }
  state.controls.shipsPerCycle = 0;
  state.controls.paused = false;
  tick(state, 0);
  // The normal zero-time fixture refresh may surface an unrelated forecast.
  // This harness owns the next admitted manifest so each berth starts free.
  state.trafficOffers.length = 0;
  return state;
}

function passengerOffer(state: StationState, id: number, passengers: number): TrafficOffer {
  return {
    id,
    callsign: `TRANSFER-${id}`,
    shipName: 'Transfer Test Shuttle',
    // demo-station's two berth mouths open to the east. Keep the manifest on
    // that physical lane so this harness measures Gangway transfer rather than
    // deliberately failing approach compatibility.
    lane: 'east',
    shipType: 'tourist',
    hullVariant: 'passenger-shuttle',
    offerKind: 'passenger',
    size: 'medium',
    status: 'holding',
    forecastAt: state.now,
    arrivesAt: state.now,
    expiresAt: state.now + 600,
    passengersTotal: passengers,
    manifestDemand: { cafeteria: 1, market: 0, lounge: 0 },
    manifestMix: { diner: 1, shopper: 0, lounger: 0, rusher: 0 },
    // Keeping the party at the meal stage gives the test a stable station-side
    // cohort before the real recall clock starts boarding them.
    hospitalityDemand: { meal: passengers, drink: 0, leisure: 0, restroom: 0, hygiene: 0, comfort: 0 },
    inboundCargo: { rawMaterial: 0, rawMeal: 0, tradeGood: 0 },
    outboundRequest: { rawMaterial: 0, meal: 0, tradeGood: 0 },
    requestedServices: [],
    berthTimeSec: 190,
    dockingFee: 0,
    projectedSpend: 0,
    riskLabel: 'low'
  };
}

function berth(state: StationState) {
  const anchor = state.rooms.findIndex((room) => room === 'berth');
  assert(anchor >= 0, 'Demo fixture has no berth.');
  const facility = getBerthFacilityAt(state, anchor);
  assert(facility, 'Demo berth facility was not derived.');
  return facility;
}

function gangwayOrigins(state: StationState, anchor: number): number[] {
  const facility = getBerthFacilityAt(state, anchor);
  assert(facility, 'Expected a berth facility while counting Gangways.');
  const ids = new Set(facility.serviceModuleIds[ModuleType.Gangway] ?? []);
  return state.moduleInstances
    .filter((module) => module.type === ModuleType.Gangway && ids.has(module.id))
    .map((module) => module.originTile)
    .sort((a, b) => a - b);
}

function setGangwayCount(state: StationState, anchor: number, wanted: number): void {
  let origins = gangwayOrigins(state, anchor);
  while (origins.length > wanted) {
    assert(removeModuleAtTile(state, origins.pop()!), 'Expected Gangway removal to succeed.');
    tick(state, 0);
    origins = gangwayOrigins(state, anchor);
  }
  while (origins.length < wanted) {
    const facility = getBerthFacilityAt(state, anchor);
    assert(facility, 'Expected a berth while adding a Gangway.');
    const candidate = facility.clusterTiles
      .filter((tile) => state.moduleOccupancyByTile[tile] === null)
      .sort((a, b) => a - b)
      .find((tile) => tryPlaceModule(state, ModuleType.Gangway, tile).ok);
    assert(candidate !== undefined, `Could not place Gangway ${origins.length + 1} in the demo berth.`);
    tick(state, 0);
    origins = gangwayOrigins(state, anchor);
  }
  assert(origins.length === wanted, `Expected ${wanted} Gangway(s), got ${origins.length}.`);
}

function admitPassengerShip(state: StationState, id: number, passengers: number): ArrivingShip {
  const facility = berth(state);
  const offer = passengerOffer(state, id, passengers);
  state.trafficOffers.push(offer);
  const result = admitTrafficOffer(state, offer.id, facility.anchorTile);
  assert(result.ok, result.reason ?? 'Passenger offer admission failed.');
  for (let elapsed = 0; elapsed < 8; elapsed += STEP) {
    tick(state, STEP);
    const ship = state.arrivingShips.find((candidate) => candidate.id === id);
    if (ship?.stage === 'docked') return ship;
  }
  throw new Error('Passenger ship did not dock through normal approach ticks.');
}

function shipById(state: StationState, id: number): ArrivingShip {
  const ship = state.arrivingShips.find((candidate) => candidate.id === id);
  assert(ship, `Expected ship ${id} to remain active.`);
  return ship;
}

function visitorPhase(visitor: Visitor): string {
  return visitor.transferPhase ?? 'station';
}

function visitorsFor(state: StationState, shipId: number): Visitor[] {
  return state.visitors.filter((visitor) => visitor.originShipId === shipId);
}

function waitFor(state: StationState, label: string, predicate: () => boolean, maxSeconds: number): void {
  for (let elapsed = 0; elapsed < maxSeconds; elapsed += STEP) {
    if (predicate()) return;
    tick(state, STEP);
  }
  assert(predicate(), `Timed out waiting for ${label}.`);
}

function recordEmergenceOrder(state: StationState, shipId: number, maxSeconds: number): number[] {
  const order: number[] = [];
  const seen = new Set<number>();
  for (let elapsed = 0; elapsed < maxSeconds; elapsed += STEP) {
    for (const visitor of visitorsFor(state, shipId)) {
      if (visitorPhase(visitor) === 'station' && !seen.has(visitor.id)) {
        seen.add(visitor.id);
        order.push(visitor.id);
      }
    }
    if (shipById(state, shipId).passengersSpawned === shipById(state, shipId).passengersTotal) return order;
    tick(state, STEP);
  }
  throw new Error('Timed out collecting station-side emergence order.');
}

function testSingleGangwayCrossingAndEmergence(): void {
  const state = demoState(101);
  const facility = berth(state);
  setGangwayCount(state, facility.anchorTile, 1);
  const ship = admitPassengerShip(state, 10101, 3);
  assert(setCrewShiftTarget(state, 'food', 0), 'Expected to reserve the station-side cohort from food service.');

  waitFor(state, 'a disembark crossing', () => visitorsFor(state, ship.id).some((visitor) => visitorPhase(visitor) === 'disembark-crossing'), 3);
  const first = visitorsFor(state, ship.id).find((visitor) => visitorPhase(visitor) === 'disembark-crossing');
  assert(first, 'Expected a visible disembark crossing.');
  const crossingStartedAt = first.transferCrossingStartedAt;
  assert(crossingStartedAt !== null && crossingStartedAt !== undefined, 'Crossing did not retain its start time.');
  assert(ship.passengersSpawned === 0, 'passengersSpawned advanced before station-side emergence.');
  assert(visitorsFor(state, ship.id).filter((visitor) => visitorPhase(visitor) === 'disembark-crossing').length === 1, 'One Gangway permitted concurrent crossings.');
  advance(state, 0.7);
  assert(ship.passengersSpawned === 0, 'Crossing duration collapsed below the visible minimum.');
  waitFor(state, 'first station-side emergence', () => ship.passengersSpawned === 1, 2);
  assert(state.now - crossingStartedAt >= 0.8, 'Disembark crossing completed without a nonzero duration.');
  assert(visitorsFor(state, ship.id).some((visitor) => visitorPhase(visitor) === 'station'), 'Passenger counter advanced without a station-side visitor.');
}

function timeToAllEmergences(gangways: number, seed: number): number {
  const state = demoState(seed);
  const facility = berth(state);
  setGangwayCount(state, facility.anchorTile, gangways);
  const ship = admitPassengerShip(state, 10200 + gangways, 8);
  assert(setCrewShiftTarget(state, 'food', 0), 'Expected food lane reduction for throughput measurement.');
  const startedAt = state.now;
  for (let elapsed = 0; elapsed < 20 && ship.passengersSpawned < ship.passengersTotal; elapsed += STEP) tick(state, STEP);
  const phaseSummary = visitorsFor(state, ship.id)
    .map((visitor) => `${visitor.id}:${visitor.state}/${visitorPhase(visitor)}@${visitor.tileIndex}->${visitor.transferStationTile ?? '-'}:path${visitor.path.length}:target${visitor.reservedTargetTile ?? '-'}:provider${visitor.queueProviderTile ?? '-'}:${visitor.movementWaitReason ?? 'moving'}`)
    .join(', ');
  const stalledTarget = visitorsFor(state, ship.id).find((visitor) => visitorPhase(visitor) === 'disembark-crossing')?.transferStationTile;
  const blockers = stalledTarget === null || stalledTarget === undefined
    ? 'none'
    : [
        ...state.crewMembers.filter((actor) => actor.tileIndex === stalledTarget).map((actor) => `crew-${actor.id}/${actor.activeJobId ?? 'idle'}`),
        ...state.residents.filter((actor) => actor.tileIndex === stalledTarget).map((actor) => `resident-${actor.id}`),
        ...state.visitors.filter((actor) => actor.tileIndex === stalledTarget).map((actor) => `visitor-${actor.id}/${visitorPhase(actor)}`)
      ].join(', ') || 'none';
  assert(
    ship.passengersSpawned === ship.passengersTotal,
    `Timed out waiting for ${gangways} Gangway arrival completion (${ship.passengersSpawned}/${ship.passengersTotal}; ${phaseSummary}; target blockers ${blockers}).`
  );
  return state.now - startedAt;
}

function testTwoGangwaysIncreaseArrivalThroughput(): void {
  const oneGangway = timeToAllEmergences(1, 102);
  const twoGangways = timeToAllEmergences(2, 103);
  assert(twoGangways + 0.5 < oneGangway, `Two Gangways did not materially beat one (${twoGangways.toFixed(1)}s vs ${oneGangway.toFixed(1)}s).`);
}

function prepareRecallState(seed: number, id: number, passengers: number): { state: StationState; ship: ArrivingShip } {
  const state = demoState(seed);
  const facility = berth(state);
  setGangwayCount(state, facility.anchorTile, 1);
  const ship = admitPassengerShip(state, id, passengers);
  assert(setCrewShiftTarget(state, 'food', 0), 'Expected food lane reduction before recall.');
  waitFor(state, 'active passenger transfer', () => visitorsFor(state, ship.id).some((visitor) => visitorPhase(visitor) !== 'station'), 3);
  return { state, ship };
}

function testRecallCancelsShipSideQueue(): void {
  const { state, ship } = prepareRecallState(104, 10401, 12);
  waitFor(state, 'ship-side queued passengers', () => visitorsFor(state, ship.id).some((visitor) => visitorPhase(visitor) === 'disembark-queued'), 3);
  const contract = state.portOps.contracts.find((entry) => entry.shipId === ship.id);
  assert(contract, 'Expected an admitted passenger contract.');
  // Pull the public contract clock forward while passengers are demonstrably
  // still queued ship-side. Waiting for the natural long-stay deadline would
  // no longer exercise cancellation once Gangway throughput improves.
  contract.boardingStartsAt = state.now + 0.1;
  advance(state, Math.max(0, contract.boardingStartsAt - state.now) + 0.2);
  assert(ship.visitPhase === 'recall' || ship.visitPhase === 'boarding', 'Contract clock did not start recall.');
  assert(!visitorsFor(state, ship.id).some((visitor) => visitorPhase(visitor) === 'disembark-queued'), 'Recall left ship-side queued passengers behind.');
  assert(!state.visitors.some((visitor) => visitor.strandedFromShipId === ship.id), 'Recall stranded a passenger who never reached station-side access.');
  assert(ship.passengersSpawned < ship.passengersTotal, 'Recall did not retain an unspawned ship-side remainder.');
}

function testSaveResumeForDisembarkAndBoarding(): void {
  const arrival = prepareRecallState(105, 10501, 4);
  waitFor(arrival.state, 'mid-disembark crossing', () => visitorsFor(arrival.state, arrival.ship.id).some((visitor) => visitorPhase(visitor) === 'disembark-crossing'), 2);
  const arrivalBefore = arrival.ship.passengersSpawned;
  const arrivalSave = parseAndMigrateSave(serializeSave('mid-disembark', arrival.state, 'test'));
  assert(arrivalSave.ok, arrivalSave.ok ? '' : arrivalSave.error);
  const resumedArrival = hydrateRunning(arrivalSave.save, 105);
  waitFor(resumedArrival, 'resumed disembark completion', () => shipById(resumedArrival, 10501).passengersSpawned >= arrivalBefore + 1, 4);
  const resumedArrivalShip = shipById(resumedArrival, 10501);
  assert(resumedArrivalShip.passengersSpawned <= resumedArrivalShip.passengersTotal, 'Disembark resume duplicated passenger emergence.');

  const boarding = prepareRecallState(106, 10601, 1);
  waitFor(boarding.state, 'station-side passenger', () => boarding.ship.passengersSpawned === 1, 4);
  const boardingContract = boarding.state.portOps.contracts.find((entry) => entry.shipId === boarding.ship.id);
  assert(boardingContract, 'Expected boarding contract.');
  boardingContract.boardingStartsAt = boarding.state.now + 0.1;
  waitFor(boarding.state, 'mid-boarding crossing', () => visitorsFor(boarding.state, boarding.ship.id).some((visitor) => visitorPhase(visitor) === 'boarding-crossing'), 6);
  const boardingSave = parseAndMigrateSave(serializeSave('mid-boarding', boarding.state, 'test'));
  assert(boardingSave.ok, boardingSave.ok ? '' : boardingSave.error);
  const resumedBoarding = hydrateRunning(boardingSave.save, 106);
  waitFor(resumedBoarding, 'resumed boarding settlement', () => shipById(resumedBoarding, 10601).passengersBoarded === 1, 4);
  const resumedBoardingShip = shipById(resumedBoarding, 10601);
  const resumedContract = resumedBoarding.portOps.contracts.find((entry) => entry.shipId === resumedBoardingShip.id);
  assert(resumedBoardingShip.passengersBoarded === 1, `Boarding resume settled ${resumedBoardingShip.passengersBoarded} passengers instead of one.`);
  assert(resumedContract?.promises.find((promise) => promise.kind === 'passengers-returned')?.completed === 1, 'Boarding resume omitted or double-counted the return promise.');
  advance(resumedBoarding, 1.5);
  assert(resumedBoardingShip.passengersBoarded === 1, 'Repeated post-resume ticks double-settled boarding.');
}

function testFifoSurvivesVisitorArrayReversal(): void {
  const original = prepareRecallState(107, 10701, 5);
  waitFor(original.state, 'queued transfer cohort', () => visitorsFor(original.state, original.ship.id).length === 5, 3);
  const snapshot = parseAndMigrateSave(serializeSave('fifo-base', original.state, 'test'));
  assert(snapshot.ok, snapshot.ok ? '' : snapshot.error);
  const normal = hydrateRunning(snapshot.save, 107);
  const reversed = hydrateRunning(snapshot.save, 107);
  reversed.visitors.reverse();
  const normalOrder = recordEmergenceOrder(normal, 10701, 12);
  const reversedOrder = recordEmergenceOrder(reversed, 10701, 12);
  assert(normalOrder.length === 5 && reversedOrder.length === 5, 'FIFO scenario did not complete its full cohort.');
  assert(normalOrder.join(',') === reversedOrder.join(','), `Visitor-array reversal changed FIFO emergence (${normalOrder.join(',')} vs ${reversedOrder.join(',')}).`);
}

function main(): void {
  testSingleGangwayCrossingAndEmergence();
  testTwoGangwaysIncreaseArrivalThroughput();
  testRecallCancelsShipSideQueue();
  testSaveResumeForDisembarkAndBoarding();
  testFifoSurvivesVisitorArrayReversal();
  console.log('passenger-transfer-tests: ok');
}

main();
