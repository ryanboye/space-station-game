import {
  admitTrafficOffer,
  createInitialState,
  tick
} from '../src/sim/index';
import { DEFAULT_ECONOMY_RECENT_LIMIT, recordEconomyEvent } from '../src/sim/opening-economy';
import { DEFAULT_SERVICE_LOG_LIMIT, appendServiceCompletion } from '../src/sim/service-truth';
import {
  allocateWalkInManifestDemand,
  applyEconomyTransaction,
  recordServiceCompletion,
  recordSmallCraftServiceCompletion
} from '../src/sim/sim';
import { ModuleType, RoomType, type DockEntity, type StationState, type TrafficOffer } from '../src/sim/types';
import { hydrateStateFromSave, parseAndMigrateSave, serializeSave } from '../src/sim/save';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function advance(state: StationState, seconds: number): void {
  state.controls.paused = false;
  const step = 0.2;
  for (let elapsed = 0; elapsed < seconds; elapsed += step) tick(state, step);
}

function passengerOffer(state: StationState, dock: DockEntity, id: number): TrafficOffer {
  return {
    id,
    callsign: `POD-${id}`,
    shipName: 'Accounting Probe',
    lane: dock.lane,
    shipType: 'trader',
    hullVariant: 'courier-pod',
    offerKind: 'passenger',
    size: 'small',
    status: 'holding',
    forecastAt: state.now,
    arrivesAt: state.now,
    expiresAt: state.now + 120,
    passengersTotal: 1,
    manifestDemand: { cafeteria: 1, market: 0, lounge: 0 },
    manifestMix: { diner: 1, shopper: 0, lounger: 0, rusher: 0 },
    hospitalityDemand: { meal: 1, drink: 0, leisure: 0, restroom: 0, hygiene: 0, comfort: 0 },
    inboundCargo: { rawMaterial: 0, rawMeal: 0, tradeGood: 0 },
    outboundRequest: { rawMaterial: 0, meal: 0, tradeGood: 0 },
    requestedServices: [],
    berthTimeSec: 50,
    dockingFee: 0,
    projectedSpend: 0,
    riskLabel: 'low'
  };
}

function testPodOutcomeSurvivesBoundedEventHistory(): void {
  const state = createInitialState({ seed: 1454, physicalStarterInventory: true, manualTrafficAdmission: true });
  advance(state, 0.2);
  const dock = state.docks.find((candidate) => candidate.sourceKind === 'pod-dock-module');
  assert(dock, 'Expected a starter Pod Dock.');
  for (const candidate of state.docks) {
    candidate.allowedShipTypes = candidate.id === dock.id ? ['trader'] : [];
    candidate.allowedShipSizes = ['small'];
  }
  const offer = passengerOffer(state, dock, 9454);
  state.trafficOffers.push(offer);
  assert(admitTrafficOffer(state, offer.id).ok, 'Expected starter Pod Dock to admit passenger pod.');
  const ship = state.arrivingShips.find((candidate) => candidate.id === offer.id);
  assert(ship?.smallCraftVisit, 'Expected an active small-craft visit.');
  const visit = ship.smallCraftVisit;

  // These pass through the same physical-service and economy gates used by
  // the simulation. The event stream can then churn independently of what
  // this visit has durably accounted for.
  const tableTile = state.modules.findIndex((module) => module === ModuleType.Table);
  assert(tableTile >= 0, 'Expected a physical starter Cafeteria table.');
  const completion = recordServiceCompletion(state, {
    population: 'visitor',
    actorId: 94_540,
    service: 'meal',
    tileIndex: tableTile,
    shipId: ship.id,
    firstForActor: true
  });
  assert(completion, 'Canonical meal completion was rejected at the real table.');
  applyEconomyTransaction(state, {
    at: state.now,
    kind: 'retail-sale',
    credits: 7,
    costBasis: 3,
    label: 'Test pod meal revenue',
    sourceId: ship.id,
    tileIndex: tableTile
  });
  const revenue = state.openingEconomy.ledger.recent.find((event) => event.sourceId === ship.id && event.credits === 7);
  assert(revenue, 'Canonical pod revenue was not recorded.');
  assert(visit.servedDemand.food >= 1, 'Canonical meal did not update durable visit accounting.');
  assert(visit.earnedCredits >= revenue.credits, 'Attributable revenue did not update durable visit accounting.');

  const serialized = serializeSave('Pod accounting', state, 'test');
  const parsed = parseAndMigrateSave(serialized);
  assert(parsed.ok, parsed.ok ? '' : parsed.error);
  const reloaded = hydrateStateFromSave(parsed.save, { seed: 1454 }).state;
  const reloadedVisit = reloaded.arrivingShips.find((candidate) => candidate.id === ship.id)?.smallCraftVisit;
  assert(reloadedVisit?.servedDemand.food === 1, 'Visit-local service accounting did not round trip through save/load.');
  assert(reloadedVisit.earnedCredits === 7, 'Visit-local revenue accounting did not round trip through save/load.');

  const legacyPayload = JSON.parse(serialized) as {
    snapshot?: { activePortShips?: Array<{ id?: number; smallCraftVisit?: Record<string, unknown> }> };
  };
  const legacyVisit = legacyPayload.snapshot?.activePortShips?.find((candidate) => candidate.id === ship.id)?.smallCraftVisit;
  assert(legacyVisit, 'Expected active pod visit in serialized snapshot.');
  delete legacyVisit.servedDemand;
  delete legacyVisit.earnedCredits;
  const migrated = parseAndMigrateSave(JSON.stringify(legacyPayload));
  assert(migrated.ok, migrated.ok ? '' : migrated.error);
  const legacyReload = hydrateStateFromSave(migrated.save, { seed: 1454 }).state;
  const legacyReloadedVisit = legacyReload.arrivingShips.find((candidate) => candidate.id === ship.id)?.smallCraftVisit;
  assert(
    legacyReloadedVisit?.servedDemand.food === 0 && legacyReloadedVisit.earnedCredits === 0,
    'Older saves without pod accounting did not normalize durable fields to zero.'
  );

  for (let index = 0; index <= DEFAULT_SERVICE_LOG_LIMIT; index++) {
    appendServiceCompletion(state.serviceLog, {
      at: state.now + index,
      population: 'crew',
      actorId: 50_000 + index,
      service: 'comfort',
      roomType: RoomType.Lounge,
      moduleType: ModuleType.Couch,
      tileIndex: 0,
      shipId: null,
      commercialUnitId: null
    });
  }
  for (let index = 0; index <= DEFAULT_ECONOMY_RECENT_LIMIT; index++) {
    recordEconomyEvent(state.openingEconomy.ledger, {
      at: state.now + index,
      kind: 'maintenance',
      credits: -1,
      costBasis: 0,
      label: 'history churn'
    });
  }
  assert(!state.serviceLog.recent.some((event) => event.id === completion.id), 'Service event did not age out of bounded history.');
  assert(!state.openingEconomy.ledger.recent.some((event) => event.id === revenue.id), 'Revenue event did not age out of bounded history.');

  visit.patienceExpiresAt = state.now;
  advance(state, 20);
  const outcome = state.openingEconomy.podDemand.recent.find((entry) => entry.visitId === ship.id);
  assert(outcome, 'Departing pod produced no demand outcome.');
  assert(outcome.served.food >= 1, 'Departing pod lost its earlier meal after history trimming.');
  assert(outcome.earnedCredits >= Math.round(revenue.credits), 'Departing pod lost earlier revenue after history trimming.');
}

function testFreightIsNotEngineeringDemand(): void {
  const state = createInitialState({ seed: 1455, physicalStarterInventory: true, manualTrafficAdmission: true });
  tick(state, 0);
  const dock = state.docks.find((candidate) => candidate.podCapabilities?.includes('freight'));
  assert(dock, 'Expected a freight-capable starter Pod Dock.');
  for (const candidate of state.docks) {
    candidate.allowedShipTypes = candidate.id === dock.id ? ['trader'] : [];
    candidate.allowedShipSizes = ['small'];
  }
  const offer = passengerOffer(state, dock, 9455);
  state.trafficOffers.push(offer);
  assert(admitTrafficOffer(state, offer.id).ok, 'Expected freight Pod Dock admission.');
  const ship = state.arrivingShips.find((candidate) => candidate.id === offer.id);
  assert(ship?.smallCraftVisit, 'Expected freight pod visit.');
  const visit = ship.smallCraftVisit;
  assert(visit.services.some((service) => service.kind === 'freight'), 'Expected freight-only dock to request courier handling.');

  recordSmallCraftServiceCompletion(visit, 'freight');
  assert(visit.servedDemand.shipService === 0, 'Freight completion incorrectly counted as engineering service.');
  recordSmallCraftServiceCompletion(visit, 'refuel');
  recordSmallCraftServiceCompletion(visit, 'repair');
  const engineeringServices = Math.max(0, visit.servedDemand.shipService);
  assert(engineeringServices === 2, 'Refuel and repair did not count as engineering services.');

  // Reset to the actual freight-only outcome before departure: it should not
  // report a Service Ships completion merely because shared logistics ran.
  visit.servedDemand.shipService = 0;
  visit.patienceExpiresAt = state.now;
  advance(state, 20);
  const outcome = state.openingEconomy.podDemand.recent.find((entry) => entry.visitId === ship.id);
  assert(outcome, 'Freight pod produced no demand outcome.');
  assert(outcome.wanted.shipService === 0, 'Freight-only pod created engineering demand.');
  assert(outcome.served.shipService === 0, 'Freight-only pod reported engineering demand served.');
}

function testWalkInManifestAllocatesExactPassengerIntentions(): void {
  const soloShopper = allocateWalkInManifestDemand(1, { cafeteria: 0.24, market: 0.61, lounge: 0.15 });
  assert(
    soloShopper.market === 1 && soloShopper.cafeteria === 0 && soloShopper.lounge === 0,
    'A one-passenger pod reported market demand without assigning its sole passenger to shop.'
  );

  const mixedPod = allocateWalkInManifestDemand(5, { cafeteria: 0.42, market: 0.36, lounge: 0.22 });
  assert(
    mixedPod.cafeteria + mixedPod.market + mixedPod.lounge === 5,
    'Walk-in manifest allocation created or lost passengers.'
  );
  assert(
    mixedPod.cafeteria === 2 && mixedPod.market === 2 && mixedPod.lounge === 1,
    `Largest-remainder allocation drifted: ${JSON.stringify(mixedPod)}`
  );
}

testWalkInManifestAllocatesExactPassengerIntentions();
testPodOutcomeSurvivesBoundedEventHistory();
testFreightIsNotEngineeringDemand();
console.log('pod demand accounting checks passed');
