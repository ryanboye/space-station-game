import { applyColdStartScenario } from '../src/sim/cold-start-scenarios';
import { resolveFacilitySlots } from '../src/sim/facility-descriptors';
import {
  admitTrafficOffer,
  createInitialState,
  getBerthFacilityAt,
  getCrewSustainabilitySummary,
  getCrewWatchStatus,
  getDockingSlotDescriptors,
  getEligibleBerthsForOffer,
  getTrafficOfferPreview,
  tick,
  validateDockingSlot
} from '../src/sim/sim';
import {
  ModuleType,
  RoomType,
  ZoneType,
  type StationState,
  type TrafficOffer
} from '../src/sim/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`demo-station-viability: ${message}`);
}

const STEP = 0.2;

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
  assert(predicate(), `timed out waiting for ${label} at ${state.now.toFixed(1)}s`);
}

function buildDemo(seed = 1337): StationState {
  const state = createInitialState({
    seed,
    physicalStarterInventory: true,
    manualTrafficAdmission: true
  });
  assert(applyColdStartScenario(state, 'demo-station'), 'demo-station scenario was not registered');
  state.controls.paused = false;
  tick(state, 0);
  return state;
}

function berthDiagnostics(state: StationState, offer: TrafficOffer): string {
  return getDockingSlotDescriptors(state)
    .filter((descriptor) => descriptor.kind === 'berth')
    .map((descriptor) => {
      const validation = validateDockingSlot(state, descriptor, offer.size, offer.hullVariant);
      const envelope = descriptor.envelopesByHull[offer.hullVariant];
      const facility = descriptor.anchorTile === null ? null : getBerthFacilityAt(state, descriptor.anchorTile);
      return `${descriptor.id}/${descriptor.facing} ${JSON.stringify({ hull: envelope.mooring.bounds, ingress: envelope.ingress.bounds, size: facility?.size, geometry: facility?.geometry, clamps: facility?.clampCapacity, capabilities: facility?.capabilities, reasons: facility?.reasons })}: ${validation.valid ? 'valid' : validation.hardReasons.join(', ')}`;
    })
    .join('; ');
}

function testCrewHousingAndWatch(): string {
  const state = buildDemo();
  assert(state.crew.total === 18 && state.crewMembers.length === 18, 'demo must materialize exactly 18 crew');

  const banks = state.moduleInstances.filter((module) => module.type === ModuleType.BunkBank);
  assert(banks.length === 5, `expected five large Bunk Banks, got ${banks.length}`);
  assert(banks.every((module) => !module.legacyForced), 'Bunk Banks must be real multi-tile fixtures, not legacy 1x1 fallbacks');
  const sleepSlots = banks.flatMap((module) =>
    resolveFacilitySlots(module, state.width).filter((slot) => slot.role === 'temporary-sleep')
  );
  assert(sleepSlots.length >= 18, `expected at least 18 depicted sleep positions, got ${sleepSlots.length}`);
  for (const slot of sleepSlots) {
    assert(state.rooms[slot.tileIndex] === RoomType.Dorm, `sleep position ${slot.tileIndex} left the Dorm`);
    assert(state.roomHousingPolicies[slot.tileIndex] === 'crew', `sleep position ${slot.tileIndex} is not crew housing`);
    assert(state.zones[slot.tileIndex] === ZoneType.Restricted, `sleep position ${slot.tileIndex} is not crew-zoned`);
  }

  const summary = getCrewSustainabilitySummary(state);
  assert(summary.sleepSlots >= 18, `crew sustainability sees only ${summary.sleepSlots} sleep slots`);
  assert(summary.assignedSleepSlots === 18, `only ${summary.assignedSleepSlots}/18 crew received a sleep assignment`);

  const cooks = state.crewMembers.filter((crew) => crew.staffRole === 'cook');
  assert(cooks.length === 1, `expected the existing one-Cook roster, got ${cooks.length}`);
  assert(getCrewWatchStatus(state, cooks[0]) === 'on-duty', 'the Cook is not on the opening watch');
  assert(!cooks[0].resting, 'the on-watch Cook began the showcase asleep');
  return `${sleepSlots.length} physical sleep positions · ${summary.assignedSleepSlots}/18 assigned · Cook ${cooks[0].id} on duty`;
}

function stageOnboardingOffers(state: StationState): TrafficOffer[] {
  state.controls.shipsPerCycle = 3;
  advance(state, 5);
  const offers = state.trafficOffers.filter((offer) =>
    offer.status === 'forecast' || offer.status === 'holding'
  );
  assert(
    offers.length === 3,
    `expected three onboarding offers, got ${offers.length} active from ${state.trafficOffers.length} total at ${state.now.toFixed(1)}s (cycle ${state.lastCycleTime.toFixed(1)}, sequence ${state.portOps.offerSequenceIndex}; ${state.trafficOffers.map((offer) => `${offer.offerKind}:${offer.status}`).join(', ') || 'none'})`
  );
  assert(
    offers.map((offer) => offer.offerKind).sort().join(',') === 'freight,mixed,passenger',
    `expected passenger/freight/mixed onboarding set, got ${offers.map((offer) => offer.offerKind).join(',')}`
  );
  return offers;
}

function testEveryOnboardingOfferHasAFreeInterface(): string {
  const state = buildDemo();
  const offers = stageOnboardingOffers(state);
  const evidence: string[] = [];
  for (const offer of offers) {
    const preview = getTrafficOfferPreview(state, offer.id);
    assert(preview, `offer ${offer.id} produced no decision preview`);
    assert(
      preview.compatibleInterface.compatibleCount >= 1,
      `${offer.offerKind} offer has no compatible interface (${berthDiagnostics(state, offer)})`
    );
    assert(
      preview.compatibleInterface.freeCount >= 1 && preview.canAccept,
      `${offer.offerKind} offer has no free acceptable interface: ${preview.acceptReason ?? 'no reason'}`
    );
    const eligibleBerths = getEligibleBerthsForOffer(state, offer.id);
    assert(
      eligibleBerths.length >= 1,
      `${offer.offerKind} offer preview did not correspond to a real eligible Berth`
    );
    if (offer.offerKind === 'freight') {
      const modernFacility = eligibleBerths
        .map((berth) => getBerthFacilityAt(state, berth.anchorTile))
        .find((facility) => facility && !facility.legacyCompatibility);
      assert(modernFacility?.geometryValid, 'freight eligibility did not come from a valid modern Berth facility');
      assert(modernFacility.clampCapacity >= 2, `freight Berth has only ${modernFacility.clampCapacity}/2 clamps`);
      assert(modernFacility.capabilities.includes('cargo'), 'freight Berth is missing its physical cargo capability');
      evidence.push(`freight ${preview.compatibleInterface.freeCount}/${preview.compatibleInterface.compatibleCount} modern`);
    } else {
      evidence.push(`${offer.offerKind} ${preview.compatibleInterface.freeCount}/${preview.compatibleInterface.compatibleCount}`);
    }
  }
  return evidence.join(' · ');
}

function testPassengerSettlementKeepsCrewSafe(): string {
  const state = buildDemo(1338);
  const offers = stageOnboardingOffers(state);
  const passenger = offers.find((offer) => offer.offerKind === 'passenger');
  assert(passenger, 'passenger onboarding offer missing');
  const berth = getEligibleBerthsForOffer(state, passenger.id)[0];
  assert(berth, `passenger offer has no real free Berth (${berthDiagnostics(state, passenger)})`);
  const admission = admitTrafficOffer(state, passenger.id, berth.anchorTile);
  assert(admission.ok, `passenger admission failed: ${admission.reason ?? 'unknown reason'}`);
  const contract = state.portOps.contracts.find((candidate) => candidate.offerId === passenger.id);
  assert(contract, 'passenger admission created no contract');

  state.controls.shipsPerCycle = 0;
  waitFor(
    state,
    'one passenger settlement',
    () => state.portOps.settlements.some((settlement) => settlement.contractId === contract.id),
    180
  );

  const summary = getCrewSustainabilitySummary(state);
  assert(state.metrics.deathsTotal === 0, `passenger call caused ${state.metrics.deathsTotal} deaths`);
  assert(state.crewMembers.length === 18, `crew count collapsed to ${state.crewMembers.length}`);
  assert(summary.sleepSlots >= 18, `sleep capacity collapsed to ${summary.sleepSlots}`);
  assert(summary.assignedSleepSlots === 18, `sleep assignment collapsed to ${summary.assignedSleepSlots}/18`);
  assert(summary.improvisedRestingCrew === 0, `${summary.improvisedRestingCrew} crew had to sleep outside quarters`);
  return `settled at ${state.now.toFixed(1)}s · deaths 0 · sleep ${summary.assignedSleepSlots}/${summary.sleepSlots}`;
}

const checks = [
  ['crew housing and opening watch', testCrewHousingAndWatch],
  ['three onboarding offers have free interfaces', testEveryOnboardingOfferHasAFreeInterface],
  ['passenger call settles without crew collapse', testPassengerSettlementKeepsCrewSafe]
] as const;

let passed = 0;
for (const [name, run] of checks) {
  const evidence = run();
  passed += 1;
  console.log(`PASS ${name}: ${evidence}`);
}
console.log(`demo-station-viability-tests: ${passed}/${checks.length} checks passed`);
