import {
  admitTrafficOffer,
  buyPreparedMeals,
  createInitialState,
  getEligibleBerthsForOffer,
  getPortOpsTelemetry,
  setCrewShiftTarget,
  tick
} from '../src/sim/index';
import type { PortOfferKind, StationState } from '../src/sim/types';

type Policy = {
  name: string;
  preference: PortOfferKind[];
  maxConcurrent: number;
  serviceCrew: number;
  cargoCrew: number;
};

const policies: Policy[] = [
  { name: 'passenger-first', preference: ['passenger', 'mixed', 'freight'], maxConcurrent: 1, serviceCrew: 4, cargoCrew: 2 },
  { name: 'freight-first', preference: ['freight', 'mixed', 'passenger'], maxConcurrent: 1, serviceCrew: 1, cargoCrew: 5 },
  { name: 'overlap-heavy', preference: ['mixed', 'passenger', 'freight'], maxConcurrent: 2, serviceCrew: 3, cargoCrew: 3 }
];

function rankOffer(policy: Policy, kind: PortOfferKind | undefined): number {
  const rank = policy.preference.indexOf(kind ?? 'mixed');
  return rank < 0 ? policy.preference.length : rank;
}

function activeContracts(state: StationState): number {
  return state.portOps.contracts.filter((contract) => contract.status !== 'departed').length;
}

function runPolicy(policy: Policy, seed: number) {
  const state = createInitialState({ seed, physicalStarterInventory: true, manualTrafficAdmission: true });
  const acceptedKinds: PortOfferKind[] = [];
  const adaptations: string[] = [];
  let observedSettlements = 0;
  let nextDecisionAt = 0;

  state.controls.paused = false;
  tick(state, 0.1);
  setCrewShiftTarget(state, 'food', 0);
  setCrewShiftTarget(state, 'logistics', 0);
  setCrewShiftTarget(state, 'food', policy.serviceCrew);
  setCrewShiftTarget(state, 'logistics', policy.cargoCrew);
  adaptations.push(`opened ${policy.serviceCrew} Service / ${policy.cargoCrew} Cargo`);

  for (let step = 0; step < 18_000 && state.portOps.settlements.length < 5; step++) {
    state.controls.paused = false;
    if (state.metrics.mealStock < 12 && state.metrics.credits >= 36) {
      if (buyPreparedMeals(state)) adaptations.push('imported prepared meals');
    }
    if (state.portOps.cargoArmStatus === 'fault' && state.controls.crewShiftTargets.engineering < 1) {
      if (setCrewShiftTarget(state, 'engineering', 1)) adaptations.push('assigned Maintenance for cargo-arm fault');
    }
    if (state.now >= nextDecisionAt && activeContracts(state) < policy.maxConcurrent) {
      const offers = [...state.trafficOffers].sort(
        (a, b) => rankOffer(policy, a.offerKind) - rankOffer(policy, b.offerKind) || a.expiresAt - b.expiresAt
      );
      for (const offer of offers) {
        if (state.portOps.contracts.some((contract) => contract.offerId === offer.id)) continue;
        const berth = getEligibleBerthsForOffer(state, offer.id)[0];
        if (!berth) continue;
        const result = admitTrafficOffer(state, offer.id, berth.anchorTile);
        if (!result.ok) continue;
        acceptedKinds.push(offer.offerKind ?? 'mixed');
        nextDecisionAt = state.now + 3;
        break;
      }
    }
    tick(state, 0.1);
    while (observedSettlements < state.portOps.settlements.length) {
      const settlement = state.portOps.settlements[observedSettlements++];
      if (settlement.notes.some((note) => note.includes('meal queue'))) adaptations.push('service throughput or public route');
      if (settlement.notes.some((note) => note.includes('storage or cargo labor'))) adaptations.push('cargo labor or storage route');
      if (settlement.notes.some((note) => note.includes('station stock'))) adaptations.push('station stock reserve');
    }
  }

  const telemetry = getPortOpsTelemetry(state);
  return {
    policy: policy.name,
    ships: state.portOps.settlements.length,
    simSeconds: Math.round(state.now),
    acceptedKinds,
    credits: Math.round(state.metrics.credits),
    storageStock: Math.round(state.metrics.materials),
    cargoStrain: Math.round(state.portOps.cargoArmStrain),
    adaptations: [...new Set(adaptations)],
    telemetry
  };
}

for (const [index, policy] of policies.entries()) {
  console.log(JSON.stringify(runPolicy(policy, 4100 + index * 101), null, 2));
}
