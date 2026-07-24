import {
  DEFAULT_ECONOMY_RECENT_LIMIT,
  createEconomyLedger,
  deriveOpeningEconomyProfile,
  marketPolicyEffect,
  recordEconomyEvent,
  summarizeEconomyEvents
} from '../src/sim/opening-economy';
import type { SiteCharter } from '../src/sim/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function nearly(actual: number, expected: number, message: string): void {
  assert(Math.abs(actual - expected) < 0.0001, `${message}: expected ${expected}, got ${actual}`);
}

const ledger = createEconomyLedger();
recordEconomyEvent(ledger, { at: 1, kind: 'retail-sale', credits: 8, costBasis: 3, label: 'Travel supplies' }, { recentLimit: 2 });
recordEconomyEvent(ledger, { at: 2, kind: 'supplier-purchase', credits: -30, costBasis: 0, label: 'Stock order' }, { recentLimit: 2 });
recordEconomyEvent(ledger, { at: 3, kind: 'courier-fee', credits: 10, costBasis: 0, label: 'Courier transfer' }, { recentLimit: 2 });
assert(ledger.recent.length === 2, 'Recent event history should be bounded.');
assert(ledger.recent[0].kind === 'supplier-purchase', 'Bounded history should retain the newest events.');
assert(ledger.lifetime['retail-sale'].count === 1, 'Lifetime summary should retain evicted events.');
assert(ledger.nextEventId === 4, 'Event ids should advance predictably.');
const window = summarizeEconomyEvents(ledger.recent);
nearly(window.revenue, 10, 'Window revenue');
nearly(window.expenses, 30, 'Window expense');
nearly(window.net, -20, 'Window net');

const budget = marketPolicyEffect('budget');
const standard = marketPolicyEffect('standard');
const premium = marketPolicyEffect('premium');
assert(budget.demandMultiplier > standard.demandMultiplier, 'Budget should increase demand.');
assert(premium.salePriceMultiplier > standard.salePriceMultiplier, 'Premium should increase sale price.');
assert(premium.demandMultiplier < standard.demandMultiplier, 'Premium should reduce demand.');

const busyIce: SiteCharter = {
  version: 1, x: 0.3, y: 0.3, sunFactor: 0.4, debrisFactor: 0.7, resourceType: 'ice',
  laneTrafficFactor: { north: 2.4, east: 2.2, south: 2.3, west: 2.1 }
};
const remoteMetal: SiteCharter = {
  version: 1, x: 0.8, y: 0.8, sunFactor: 0.1, debrisFactor: 0.8, resourceType: 'metal',
  laneTrafficFactor: { north: 0.6, east: 0.7, south: 0.6, west: 0.7 }
};
const busyA = deriveOpeningEconomyProfile(busyIce);
const busyB = deriveOpeningEconomyProfile(busyIce);
const remote = deriveOpeningEconomyProfile(remoteMetal);
assert(JSON.stringify(busyA) === JSON.stringify(busyB), 'Profiles should be deterministic.');
assert(busyA.passengerTrafficMultiplier > remote.passengerTrafficMultiplier, 'Busy lanes should increase passenger traffic.');
assert(busyA.fuelWholesaleMultiplier < remote.fuelWholesaleMultiplier, 'Ice sites should improve fuel wholesale economics.');
assert(remote.repairDemandMultiplier > busyA.repairDemandMultiplier, 'Remote debris-heavy sites should increase repair demand.');
for (const profile of [busyA, remote, deriveOpeningEconomyProfile()]) {
  for (const value of Object.values(profile)) {
    if (typeof value === 'number') assert(Number.isFinite(value) && value > 0 && value < 2, 'Profile multiplier escaped its viability bounds.');
  }
}
assert(DEFAULT_ECONOMY_RECENT_LIMIT >= 32, 'Default history should support a useful compact ledger.');

console.log('opening-economy tests passed');
