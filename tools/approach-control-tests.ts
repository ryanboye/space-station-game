import {
  admitTrafficOffer,
  createInitialState,
  getEligibleBerthsForOffer,
  getTrafficOfferPreview,
  holdTrafficOffer,
  passTrafficOffer,
  tick
} from '../src/sim/sim';
import {
  AUTOMATABLE_SIZES,
  DEFAULT_ADMISSION_POLICY,
  MANUAL_REASON_LABEL,
  createAdmissionPolicy
} from '../src/sim/admission-policy';
import { applyColdStartScenario } from '../src/sim/cold-start-scenarios';
import { hydrateStateFromSave, parseAndMigrateSave, serializeSave } from '../src/sim/save';
import type { DockEntity, StationState, TrafficOffer } from '../src/sim/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function offer(state: StationState, id: number, size: 'small' | 'medium'): TrafficOffer {
  return {
    id,
    callsign: `TEST-${id}`,
    shipName: size === 'small' ? 'Wayfarer Pod' : 'Wayfarer Liner',
    lane: state.docks[0]?.lane ?? 'north',
    shipType: size === 'small' ? 'trader' : 'tourist',
    hullVariant: size === 'small' ? 'courier-pod' : 'passenger-shuttle',
    offerKind: 'passenger',
    size,
    status: 'forecast',
    forecastAt: state.now,
    arrivesAt: state.now + 30,
    expiresAt: state.now + 90,
    passengersTotal: size === 'small' ? 3 : 12,
    manifestDemand: { cafeteria: 1, market: 1, lounge: 0 },
    manifestMix: { diner: 0.5, shopper: 0.25, lounger: 0.1, rusher: 0.15 },
    hospitalityDemand: { meal: size === 'small' ? 2 : 9, drink: 1, leisure: 0, restroom: 2, hygiene: 1, comfort: 0 },
    inboundCargo: { rawMaterial: 0, rawMeal: 0, tradeGood: 0 },
    outboundRequest: { rawMaterial: 0, meal: 0, tradeGood: 0 },
    requestedServices: ['cafeteria', 'market'],
    berthTimeSec: size === 'small' ? 180 : 600,
    dockingFee: size === 'small' ? 24 : 140,
    projectedSpend: size === 'small' ? 45 : 220,
    riskLabel: 'low',
    assignedBerthAnchor: null,
    assignedDockSourceKey: null
  };
}

function permitTraderPods(state: StationState): DockEntity[] {
  const docks = state.docks.filter((dock) => dock.sourceKind === 'pod-dock-module');
  assert(docks.length >= 2, 'Expected two starter Pod Docks.');
  for (const dock of docks) {
    if (!dock.allowedShipTypes.includes('trader')) dock.allowedShipTypes.push('trader');
  }
  return docks;
}

function testPodReservationsAndStatusGuards(): void {
  const state = createInitialState({ seed: 501, physicalStarterInventory: true, manualTrafficAdmission: true });
  tick(state, 0);
  state.controls.paused = false;
  const docks = permitTraderPods(state);
  const first = offer(state, 50101, 'small');
  const second = offer(state, 50102, 'small');
  state.trafficOffers.push(first, second);

  const before = getTrafficOfferPreview(state, first.id);
  assert(before?.shipClass === 'pod', 'Small offer preview must identify a pod visit.');
  assert(before.compatibleInterface.kind === 'pod-dock', 'Small offer preview must not advertise berths.');
  assert(before.compatibleInterface.freeCount === docks.length, 'Pod preview should expose compatible free docks.');
  assert(before.committedLoad.meals === 2 && before.committedLoad.hygieneVisits === 3, 'Preview lost future visitor load.');
  assert(before.expectedRevenue.min < before.expectedRevenue.max, 'Preview needs a revenue range.');
  assert(!state.controls.paused, 'Creating a manual offer must not pause simulation.');

  const admitted = admitTrafficOffer(state, first.id, 0);
  assert(!admitted.ok, 'A pod must never bind a berth anchor.');
  assert(admitTrafficOffer(state, first.id).ok, 'Expected a compatible Pod Dock reservation.');
  assert(first.status === 'cleared' && first.assignedDockSourceKey !== null, 'Accepted pod did not bind a stable dock source.');
  assert(first.assignedBerthAnchor === null, 'Accepted pod incorrectly gained a berth binding.');
  assert(passTrafficOffer(state, first.id) === false, 'Passing a cleared offer must not orphan its reservation.');
  assert(state.trafficOffers.includes(first), 'Passing a cleared offer removed the durable commitment.');
  assert(admitTrafficOffer(state, first.id).ok, 'Repeated early accept must be an idempotent commitment.');
  const after = getTrafficOfferPreview(state, second.id);
  assert(after?.compatibleInterface.freeCount === docks.length - 1, 'Cleared pod did not reserve its physical dock for other offers.');
}

function testHoldAndPassAreBounded(): void {
  const state = createInitialState({ seed: 502, physicalStarterInventory: true, manualTrafficAdmission: true });
  tick(state, 0);
  const waiting = offer(state, 50201, 'small');
  waiting.arrivesAt = state.now;
  waiting.expiresAt = state.now + 12;
  waiting.status = 'holding';
  state.trafficOffers.push(waiting);
  assert(holdTrafficOffer(state, waiting.id), 'A holding offer should receive one extension.');
  assert(!holdTrafficOffer(state, waiting.id), 'Hold must not be repeatable indefinitely.');
  assert(passTrafficOffer(state, waiting.id), 'Pass should clear an uncommitted offer.');
  assert(!passTrafficOffer(state, waiting.id), 'Pass should be idempotent after removal.');
}

function testBerthPreviewAndReservation(): void {
  const state = createInitialState({ seed: 503, physicalStarterInventory: true, manualTrafficAdmission: true });
  assert(applyColdStartScenario(state, 'reputation-slice'), 'Expected berth fixture scenario.');
  tick(state, 0);
  const liner = offer(state, 50301, 'medium');
  state.trafficOffers = [liner];
  const preview = getTrafficOfferPreview(state, liner.id);
  assert(preview?.shipClass === 'berth', 'Medium offer preview must identify berth traffic.');
  assert(preview.compatibleInterface.kind === 'berth', 'Medium offer preview must not advertise Pod Docks.');
  assert(preview.compatibleInterface.compatibleCount > 0, 'Scenario should expose a compatible berth.');
  assert(preview.committedLoad.berthSeconds === liner.berthTimeSec && preview.committedLoad.bedNights > 0, 'Berth preview lost committed occupancy load.');
  const berth = getEligibleBerthsForOffer(state, liner.id)[0];
  assert(berth, 'Expected an eligible berth for the medium liner.');
  assert(admitTrafficOffer(state, liner.id, berth.anchorTile).ok, 'Expected berth reservation.');
  assert(liner.assignedBerthAnchor === berth.anchorTile, 'Accepted berth offer did not bind its selected berth.');
  assert(liner.assignedDockSourceKey === null, 'Berth offer incorrectly bound a Pod Dock.');
}

function testSaveRoundTripKeepsPendingAndCommittedOffers(): void {
  const state = createInitialState({ seed: 504, physicalStarterInventory: true, manualTrafficAdmission: true });
  tick(state, 0);
  state.controls.paused = false;
  permitTraderPods(state);
  const accepted = offer(state, 50401, 'small');
  const pending = offer(state, 50402, 'small');
  pending.status = 'holding';
  pending.arrivesAt = state.now;
  state.trafficOffers.push(accepted, pending);
  assert(admitTrafficOffer(state, accepted.id).ok, 'Expected pod reservation before save.');
  const parsed = parseAndMigrateSave(serializeSave('approach-control', state, 'test'));
  assert(parsed.ok, parsed.ok ? '' : parsed.error);
  const hydrated = hydrateStateFromSave(parsed.save, { seed: 504 });
  const restored = hydrated.state;
  const restoredAccepted = restored.trafficOffers.find((entry) => entry.id === accepted.id);
  const restoredPending = restored.trafficOffers.find((entry) => entry.id === pending.id);
  assert(
    restoredAccepted?.status === 'cleared' && !!restoredAccepted.assignedDockSourceKey,
    `Accepted pod reservation did not survive save/load (${restoredAccepted?.status ?? 'missing'}, ${restoredAccepted?.assignedDockSourceKey ?? 'no dock'}; ${hydrated.warnings.join(' | ')}).`
  );
  assert(restored.docks.some((dock) => dock.sourceKey === restoredAccepted?.assignedDockSourceKey), 'Restored pod commitment points to no physical dock.');
  assert(restoredPending?.status === 'holding', 'Pending offer did not survive save/load.');
}

/**
 * The admission policy must stay a short form, not a priority spreadsheet.
 *
 * Nothing else pins that. The surface is deliberately finite — two ship
 * classes, three numbers each, two station reserves, and a fixed list of call
 * kinds automation may never answer — so this guard fails loudly the moment a
 * change grows it into a rules table with priorities, weights or per-offer
 * ordering.
 */
function testAdmissionPolicyStaysFinite(): void {
  const policy = createAdmissionPolicy();
  const topLevel = Object.keys(policy).sort();
  assert(
    topLevel.join(',') === 'berth,closedUntil,enabled,pod,reserveBeds,reserveMeals',
    `Admission policy grew a new top-level field (${topLevel.join(', ')}). Keep it a short form, not a rules table.`
  );
  assert(topLevel.length === 6, 'Admission policy must stay six fields wide.');

  // Exactly two classes, and each class is a switch, a ship-type list and
  // three numbers. Anything more is a spreadsheet row.
  for (const admissionClass of ['pod', 'berth'] as const) {
    const rule = policy[admissionClass];
    const keys = Object.keys(rule).sort();
    assert(
      keys.join(',') === 'enabled,maxStaySeconds,minMarginCredits,reserveFreeInterfaces,shipTypes',
      `The ${admissionClass} rule grew a new condition (${keys.join(', ')}).`
    );
    const numbers = keys.filter((key) => typeof (rule as unknown as Record<string, unknown>)[key] === 'number');
    assert(numbers.length === 3, `The ${admissionClass} rule must carry exactly three numbers, not ${numbers.length}.`);
  }

  assert(typeof policy.reserveBeds === 'number' && typeof policy.reserveMeals === 'number', 'Station reserves must stay two plain numbers.');
  assert(DEFAULT_ADMISSION_POLICY.enabled === false, 'Automation must stay off until the player authors it.');

  // Large commitments are never automatable, whatever the class rule says.
  assert(!AUTOMATABLE_SIZES.includes('large'), 'AUTOMATABLE_SIZES must never include large commitments.');
  assert(AUTOMATABLE_SIZES.length === 2, 'Only small and medium calls may be automated.');

  const manualReasons = Object.keys(MANUAL_REASON_LABEL).sort();
  assert(
    manualReasons.join(',') === 'large,migrant,military,negotiated,uncertain',
    `The always-manual list changed (${manualReasons.join(', ')}). Large, military, migrant, negotiated and uncertain calls must stay visible.`
  );

  // No priority/weight/order vocabulary anywhere in the authored surface.
  const surface = JSON.stringify(policy).toLowerCase();
  for (const banned of ['priority', 'weight', 'rank', 'order', 'score']) {
    assert(!surface.includes(banned), `Admission policy introduced "${banned}" — that is the priority spreadsheet this row forbids.`);
  }
}

function main(): void {
  testPodReservationsAndStatusGuards();
  testHoldAndPassAreBounded();
  testBerthPreviewAndReservation();
  testSaveRoundTripKeepsPendingAndCommittedOffers();
  testAdmissionPolicyStaysFinite();
  console.log('approach-control-tests: ok');
}

main();
