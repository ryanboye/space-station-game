import { createInitialState, tick } from '../src/sim/index';
import { RoomType, type StationState, type TrafficOffer } from '../src/sim/types';

const SAMPLE_COUNT = 64;
const LOW_RATING = 5;
const HIGH_RATING = 85;
const MIN_VALUE_LIFT = 0.05;
const MIN_PREMIUM_MIX_LIFT = 0.05;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type GeneratedSample = {
  offer: TrafficOffer;
  premiumDemandBonusPct: number;
  riskyDemandBonusPct: number;
};

/**
 * Generate one non-onboarding offer through the production tick.
 *
 * Routine offer creation is intentionally private to sim.ts. The one narrow
 * testability seam here is a Berth room sentinel: manual traffic only asks
 * whether a Berth exists before it schedules an offer, while the contract
 * under test does not need to admit that offer. This keeps the runner focused
 * on the real scheduler and generator without reproducing either one.
 */
function generateRoutineOffer(seed: number, stationRating: number): GeneratedSample {
  const state = createInitialState({
    seed,
    physicalStarterInventory: true,
    manualTrafficAdmission: true
  });

  // Skip the deliberately fixed teaching manifests. Rating should affect the
  // routine market after onboarding, never rewrite authored tutorial calls.
  state.portOps.offerSequenceIndex = 100;
  state.trafficOffers.length = 0;

  // See the seam note above. Both paired states receive identical geometry.
  state.rooms[0] = RoomType.Berth;

  // stationRating is derived from its cumulative ledger during metrics
  // refresh. Seed both representations so the production generator observes
  // the intended value even though traffic scheduling precedes computeMetrics
  // inside a tick.
  state.usageTotals.ratingDelta = stationRating;
  state.usageTotals.ratingFromVisitorSuccessByReason.successfulExit = stationRating;
  state.metrics.stationRating = stationRating;

  state.controls.paused = false;
  state.lastCycleTime = 0.001;
  tick(state, 0.01);

  assert(state.trafficOffers.length === 1, `seed ${seed}: expected one routine offer, got ${state.trafficOffers.length}`);
  return {
    offer: state.trafficOffers[0],
    premiumDemandBonusPct: state.metrics.reputationPremiumDemandBonusPct,
    riskyDemandBonusPct: state.metrics.reputationRiskyDemandBonusPct
  };
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

const low: GeneratedSample[] = [];
const high: GeneratedSample[] = [];
for (let index = 0; index < SAMPLE_COUNT; index++) {
  const seed = 72_000 + index * 997;
  low.push(generateRoutineOffer(seed, LOW_RATING));
  high.push(generateRoutineOffer(seed, HIGH_RATING));
}

for (let index = 0; index < SAMPLE_COUNT; index++) {
  const lowSample = low[index];
  const highSample = high[index];
  assert(
    lowSample.offer.lane === highSample.offer.lane,
    `sample ${index}: rating altered lane/district selection (${lowSample.offer.lane} -> ${highSample.offer.lane})`
  );
  assert(
    lowSample.premiumDemandBonusPct === highSample.premiumDemandBonusPct,
    `sample ${index}: station rating altered district prestige pull (${lowSample.premiumDemandBonusPct} -> ${highSample.premiumDemandBonusPct})`
  );
  assert(
    lowSample.riskyDemandBonusPct === highSample.riskyDemandBonusPct,
    `sample ${index}: station rating altered district notoriety pull (${lowSample.riskyDemandBonusPct} -> ${highSample.riskyDemandBonusPct})`
  );
}

const projectedValue = (sample: GeneratedSample): number =>
  sample.offer.dockingFee + sample.offer.projectedSpend;
const isPremiumTraffic = (sample: GeneratedSample): boolean =>
  sample.offer.shipType === 'tourist' || sample.offer.hullVariant === 'luxury-liner';

const lowMeanValue = mean(low.map(projectedValue));
const highMeanValue = mean(high.map(projectedValue));
const lowPremiumShare = low.filter(isPremiumTraffic).length / SAMPLE_COUNT;
const highPremiumShare = high.filter(isPremiumTraffic).length / SAMPLE_COUNT;
const valueLift = highMeanValue / Math.max(1, lowMeanValue) - 1;
const premiumMixLift = highPremiumShare - lowPremiumShare;

const failures: string[] = [];
if (valueLift < MIN_VALUE_LIFT) {
  failures.push(
    `projected value lift ${pct(valueLift)} is below ${pct(MIN_VALUE_LIFT)} ` +
    `(rating ${LOW_RATING}: ${lowMeanValue.toFixed(1)}c; rating ${HIGH_RATING}: ${highMeanValue.toFixed(1)}c)`
  );
}
if (premiumMixLift < MIN_PREMIUM_MIX_LIFT) {
  failures.push(
    `tourist/premium mix lift ${pct(premiumMixLift)} is below ${pct(MIN_PREMIUM_MIX_LIFT)} ` +
    `(rating ${LOW_RATING}: ${pct(lowPremiumShare)}; rating ${HIGH_RATING}: ${pct(highPremiumShare)})`
  );
}

assert(
  failures.length === 0,
  `Station rating did not improve newly generated routine traffic:\n- ${failures.join('\n- ')}`
);

console.log(
  `PASS rating traffic value: ${SAMPLE_COUNT} paired seeds; ` +
  `mean value ${lowMeanValue.toFixed(1)}c -> ${highMeanValue.toFixed(1)}c; ` +
  `tourist/premium ${pct(lowPremiumShare)} -> ${pct(highPremiumShare)}; ` +
  'district prestige/notoriety pull unchanged'
);
