import type { HospitalityServiceKind, ShipSize, ShipType, VisitStayClass, VisitorNeeds } from './types';

export const LONG_STAY_CLASSES: readonly VisitStayClass[] = ['contract', 'extended'];

export const VISITOR_NEED_RATES = {
  hungerPerSec: 0.3,
  energyPerSec: 0.22,
  hygienePerSec: 0.16,
  leisurePerSec: 0.2,
  seekAt: 55,
  severeAt: 18,
  restoreAmount: 68
} as const;

export type RecurringNeedKind = 'hunger' | 'energy' | 'hygiene' | 'leisure';

export function isLongStayClass(stayClass: VisitStayClass | undefined): boolean {
  return stayClass === 'contract' || stayClass === 'extended';
}

/**
 * Stable, bounded variation makes an industrial repair call recognizably a
 * long commitment without making every such call identical.
 */
export function deriveVisitStayClass(input: {
  shipType: ShipType;
  size: ShipSize;
  offerKind?: 'passenger' | 'freight' | 'mixed';
  seed: number;
}): VisitStayClass {
  if (input.size === 'small') return 'errand';
  const roll = stableUnit(input.seed, input.shipType, input.offerKind ?? 'mixed', input.size);
  if (input.shipType === 'colonist') return 'extended';
  if (input.shipType === 'industrial') return roll < 0.35 ? 'extended' : 'contract';
  if (input.shipType === 'military') return roll < 0.7 ? 'contract' : 'shore';
  if (input.offerKind === 'freight') return roll < 0.24 ? 'contract' : 'shore';
  if (input.shipType === 'tourist' || input.shipType === 'trader') return 'shore';
  return 'shore';
}

export function createVisitorNeeds(seed: number): VisitorNeeds {
  const variation = (salt: number) => Math.floor(stableUnit(seed, salt) * 10);
  return {
    hunger: 82 + variation(11),
    energy: 80 + variation(23),
    hygiene: 83 + variation(37),
    leisure: 76 + variation(53),
    active: null,
    unmetSince: null,
    completions: 0
  };
}

export function decayVisitorNeeds(needs: VisitorNeeds, dt: number): void {
  needs.hunger = clampNeed(needs.hunger - dt * VISITOR_NEED_RATES.hungerPerSec);
  needs.energy = clampNeed(needs.energy - dt * VISITOR_NEED_RATES.energyPerSec);
  needs.hygiene = clampNeed(needs.hygiene - dt * VISITOR_NEED_RATES.hygienePerSec);
  needs.leisure = clampNeed(needs.leisure - dt * VISITOR_NEED_RATES.leisurePerSec);
}

export function selectRecurringNeed(needs: VisitorNeeds): RecurringNeedKind | null {
  const candidates: Array<[RecurringNeedKind, number]> = [
    ['hunger', needs.hunger],
    ['energy', needs.energy],
    ['hygiene', needs.hygiene],
    ['leisure', needs.leisure]
  ];
  candidates.sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
  const [kind, value] = candidates[0];
  return value <= VISITOR_NEED_RATES.seekAt ? kind : null;
}

export function serviceForRecurringNeed(need: RecurringNeedKind): HospitalityServiceKind {
  switch (need) {
    case 'hunger': return 'meal';
    case 'hygiene': return 'hygiene';
    case 'leisure': return 'leisure';
    // Phase 1A uses the existing comfort fixtures. Guest beds become a
    // dedicated service slot in Phase 1B rather than a second reservation path.
    case 'energy': return 'comfort';
  }
}

export function restoreRecurringNeed(needs: VisitorNeeds, need: RecurringNeedKind): void {
  needs[need] = clampNeed(needs[need] + VISITOR_NEED_RATES.restoreAmount);
  needs.active = null;
  needs.unmetSince = null;
  needs.completions += 1;
}

export function hasSevereUnmetNeed(needs: VisitorNeeds): boolean {
  return Math.min(needs.hunger, needs.energy, needs.hygiene, needs.leisure) <= VISITOR_NEED_RATES.severeAt;
}

function clampNeed(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function stableUnit(...parts: Array<string | number>): number {
  let hash = 2166136261;
  for (const part of parts) {
    const text = String(part);
    for (let index = 0; index < text.length; index++) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
  }
  return (hash >>> 0) / 0x1_0000_0000;
}
