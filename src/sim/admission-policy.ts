/**
 * Finite admission policy.
 *
 * The player authors a small, legible rule set for ROUTINE calls so a growing
 * port stops needing a decision per pod, and keeps deciding the exceptional
 * ones by hand. This is deliberately not a rules language: there are two ship
 * classes, four capacity conditions, and a fixed list of call kinds that are
 * never automated. Anything the policy cannot confidently answer stays manual
 * and visible.
 *
 * Pure, like `approach-control.ts`: it takes a plain input struct and returns a
 * verdict with a one-sentence explanation. `sim.ts` supplies the state
 * readings and performs the actual admission, so a verdict can be unit-tested
 * without a live station and the player can always override it.
 */

import {
  type ShipSize,
  type ShipType,
  type TrafficOffer,
  type TrafficOfferPreview
} from './types';

// ---------------------------------------------------------------------------
// Policy shape
// ---------------------------------------------------------------------------

/** Ship classes the policy can speak about. Exactly two, on purpose. */
export type AdmissionClass = 'pod' | 'berth';

export interface AdmissionClassRule {
  /** Off means every call of this class stays manual. */
  enabled: boolean;
  /**
   * Ship types this rule will accept automatically. Empty means none.
   * Military and colonist are rejected from this list at evaluation time even
   * if a save somehow contains them.
   */
  shipTypes: ShipType[];
  /** Interfaces of this class to keep free for walk-in and emergency traffic. */
  reserveFreeInterfaces: number;
  /** Longest visit this rule will commit to, in seconds. */
  maxStaySeconds: number;
  /** Smallest acceptable expected revenue, in credits. */
  minMarginCredits: number;
}

export interface AdmissionPolicy {
  /** Master switch. Everything stays manual when false. */
  enabled: boolean;
  pod: AdmissionClassRule;
  berth: AdmissionClassRule;
  /** Guest beds to keep free. Protects lodging from a committed cohort. */
  reserveBeds: number;
  /** Prepared meals to keep in reserve for the occupants already aboard. */
  reserveMeals: number;
  /**
   * Set by the `close-admissions` recovery lever. New routine traffic is held
   * until this time; accepted commitments are never touched.
   */
  closedUntil: number | null;
}

export const DEFAULT_ADMISSION_POLICY: AdmissionPolicy = {
  enabled: false,
  pod: {
    enabled: true,
    shipTypes: ['tourist', 'trader'],
    reserveFreeInterfaces: 1,
    maxStaySeconds: 240,
    minMarginCredits: 0
  },
  berth: {
    enabled: false,
    shipTypes: ['trader'],
    reserveFreeInterfaces: 1,
    maxStaySeconds: 420,
    minMarginCredits: 40
  },
  reserveBeds: 0,
  reserveMeals: 4,
  closedUntil: null
};

export function createAdmissionPolicy(): AdmissionPolicy {
  return {
    ...DEFAULT_ADMISSION_POLICY,
    pod: { ...DEFAULT_ADMISSION_POLICY.pod, shipTypes: [...DEFAULT_ADMISSION_POLICY.pod.shipTypes] },
    berth: { ...DEFAULT_ADMISSION_POLICY.berth, shipTypes: [...DEFAULT_ADMISSION_POLICY.berth.shipTypes] }
  };
}

const SHIP_TYPES: readonly ShipType[] = ['tourist', 'trader', 'industrial', 'military', 'colonist'];

function normalizeRule(raw: unknown, fallback: AdmissionClassRule): AdmissionClassRule {
  if (!raw || typeof raw !== 'object') return { ...fallback, shipTypes: [...fallback.shipTypes] };
  const entry = raw as Partial<AdmissionClassRule>;
  const shipTypes = Array.isArray(entry.shipTypes)
    ? entry.shipTypes.filter((type): type is ShipType => SHIP_TYPES.includes(type as ShipType))
    : [...fallback.shipTypes];
  const num = (value: unknown, back: number, min: number, max: number): number =>
    Number.isFinite(value) ? Math.min(max, Math.max(min, Number(value))) : back;
  return {
    enabled: entry.enabled === true,
    shipTypes,
    reserveFreeInterfaces: Math.round(num(entry.reserveFreeInterfaces, fallback.reserveFreeInterfaces, 0, 12)),
    maxStaySeconds: Math.round(num(entry.maxStaySeconds, fallback.maxStaySeconds, 0, 3600)),
    minMarginCredits: Math.round(num(entry.minMarginCredits, fallback.minMarginCredits, 0, 100000))
  };
}

/**
 * Accept whatever a save carries. A legacy save has no policy block at all and
 * hydrates to the default, which is disabled — so loading an old station never
 * silently starts admitting traffic on the player's behalf.
 */
export function normalizeAdmissionPolicy(raw: Partial<AdmissionPolicy> | null | undefined): AdmissionPolicy {
  const base = createAdmissionPolicy();
  if (!raw || typeof raw !== 'object') return base;
  return {
    enabled: raw.enabled === true,
    pod: normalizeRule(raw.pod, base.pod),
    berth: normalizeRule(raw.berth, base.berth),
    reserveBeds: Number.isFinite(raw.reserveBeds) ? Math.max(0, Math.round(Number(raw.reserveBeds))) : base.reserveBeds,
    reserveMeals: Number.isFinite(raw.reserveMeals) ? Math.max(0, Math.round(Number(raw.reserveMeals))) : base.reserveMeals,
    closedUntil: Number.isFinite(raw.closedUntil) ? Math.max(0, Number(raw.closedUntil)) : null
  };
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

export type AdmissionDecision = 'accept' | 'hold' | 'reject' | 'manual';

export interface AdmissionVerdict {
  decision: AdmissionDecision;
  /** One short sentence. Always populated, including for `accept`. */
  reason: string;
  /** Why this call is exempt from automation, when it is. */
  manualReason: ManualReason | null;
}

export type ManualReason = 'military' | 'migrant' | 'large' | 'negotiated' | 'uncertain';

export const MANUAL_REASON_LABEL: Record<ManualReason, string> = {
  military: 'military call',
  migrant: 'migrant transport',
  large: 'large commitment',
  negotiated: 'negotiated terms',
  uncertain: 'uncertain readiness'
};

export interface AdmissionContext {
  now: number;
  /** Compatible interfaces of this offer's class that are free right now. */
  freeInterfaces: number;
  /** Free depicted guest beds. Never a hidden capacity number. */
  freeGuestBeds: number;
  /** Prepared meals physically on the station. */
  availableMeals: number;
  /**
   * True when every service this call explicitly requested is actually
   * running. Reused from the existing legible readiness check, not reinvented.
   */
  requestedServicesReady: boolean;
}

export function admissionClassFor(offer: TrafficOffer): AdmissionClass {
  return offer.size === 'small' ? 'pod' : 'berth';
}

/**
 * Calls the policy must never answer.
 *
 * These stay on the offer list with their manual reason shown, so growing a
 * port never quietly hands away the decisions that actually matter.
 */
export function manualReasonFor(offer: TrafficOffer, context: AdmissionContext): ManualReason | null {
  if (offer.shipType === 'military') return 'military';
  if (offer.shipType === 'colonist') return 'migrant';
  if (offer.size === 'large') return 'large';
  // Anything where the station pays money up front is a negotiated commitment,
  // not routine traffic.
  if ((offer.fuelProcurementCostCredits ?? 0) > 0 || (offer.stationProcurementCostCredits ?? 0) > 0) {
    return 'negotiated';
  }
  if (!context.requestedServicesReady) return 'uncertain';
  if (offer.riskLabel === 'high') return 'uncertain';
  return null;
}

function ruleFor(policy: AdmissionPolicy, admissionClass: AdmissionClass): AdmissionClassRule {
  return admissionClass === 'pod' ? policy.pod : policy.berth;
}

/**
 * Decide what to do with one routine call.
 *
 * `manual` means "leave it on the list for the player" and is the answer
 * whenever automation is off, the class rule is off, or the call is exceptional.
 * `hold` means "the policy likes this call but the station cannot take it right
 * now" — a temporary capacity answer, not a refusal.
 */
export function evaluateAdmission(
  offer: TrafficOffer,
  preview: TrafficOfferPreview | null,
  policy: AdmissionPolicy,
  context: AdmissionContext
): AdmissionVerdict {
  const manual = (reason: string, manualReason: ManualReason | null = null): AdmissionVerdict =>
    ({ decision: 'manual', reason, manualReason });

  if (!policy.enabled) return manual('Auto-admission is off; deciding manually.');

  const admissionClass = admissionClassFor(offer);
  const rule = ruleFor(policy, admissionClass);
  if (!rule.enabled) return manual(`No ${admissionClass} rule is enabled; deciding manually.`);

  const exceptional = manualReasonFor(offer, context);
  if (exceptional) {
    return manual(`Held for a decision: ${MANUAL_REASON_LABEL[exceptional]}.`, exceptional);
  }

  // Admission closure affects NEW routine traffic only. Accepted commitments
  // are untouched, which is what makes it a safe recovery lever.
  if (policy.closedUntil !== null && context.now < policy.closedUntil) {
    const seconds = Math.max(1, Math.round(policy.closedUntil - context.now));
    return { decision: 'hold', reason: `Admissions closed while recovering (${seconds}s left).`, manualReason: null };
  }

  if (!rule.shipTypes.includes(offer.shipType)) {
    return { decision: 'reject', reason: `${offer.shipType} calls are not in the ${admissionClass} rule.`, manualReason: null };
  }

  const stay = Math.max(0, offer.berthTimeSec);
  if (stay > rule.maxStaySeconds) {
    return {
      decision: 'reject',
      reason: `Stay ${Math.round(stay)}s exceeds the ${rule.maxStaySeconds}s limit.`,
      manualReason: null
    };
  }

  const revenue = Math.max(0, offer.dockingFee + offer.projectedSpend);
  if (revenue < rule.minMarginCredits) {
    return {
      decision: 'reject',
      reason: `Expected ${Math.round(revenue)}c is under the ${rule.minMarginCredits}c minimum.`,
      manualReason: null
    };
  }

  // Reserves are checked AFTER the rule matches, so a hold reads as "the right
  // kind of call at the wrong moment" rather than a rejection.
  const freeAfter = context.freeInterfaces - 1;
  if (context.freeInterfaces <= 0) {
    return { decision: 'hold', reason: `No free ${admissionClass} interface right now.`, manualReason: null };
  }
  if (freeAfter < rule.reserveFreeInterfaces) {
    return {
      decision: 'hold',
      reason: `Would leave ${freeAfter} free ${admissionClass}s, under the ${rule.reserveFreeInterfaces} reserve.`,
      manualReason: null
    };
  }

  const bedsNeeded = preview?.committedLoad.bedNights ?? 0;
  if (bedsNeeded > 0 && context.freeGuestBeds - bedsNeeded < policy.reserveBeds) {
    return {
      decision: 'hold',
      reason: `Needs ${bedsNeeded} bed(s); reserve of ${policy.reserveBeds} would be broken.`,
      manualReason: null
    };
  }

  const mealsNeeded = preview?.committedLoad.meals ?? 0;
  if (mealsNeeded > 0 && context.availableMeals - mealsNeeded < policy.reserveMeals) {
    return {
      decision: 'hold',
      reason: `Needs ${mealsNeeded} meal(s); reserve of ${policy.reserveMeals} would be broken.`,
      manualReason: null
    };
  }

  return {
    decision: 'accept',
    reason: `Routine ${offer.shipType} ${admissionClass}; ${freeAfter} interface(s) still free.`,
    manualReason: null
  };
}

// ---------------------------------------------------------------------------
// Aggregate pressure
// ---------------------------------------------------------------------------

export interface LanePressure {
  /** Offers currently waiting on a decision, by class. */
  pendingPods: number;
  pendingBerths: number;
  /** How many of those the policy would take right now. */
  autoAccepts: number;
  /** How many are parked awaiting capacity. */
  autoHolds: number;
  /** How many need a human. This is the number a large port actually watches. */
  manual: number;
  /** The single most common reason a call is waiting, for a one-line readout. */
  topReason: string | null;
}

/**
 * A compact readout for a busy port: how much routine traffic the policy is
 * absorbing and how much still wants attention. Deliberately four numbers and
 * one sentence rather than a sortable table.
 */
export function summarizeLanePressure(
  verdicts: Array<{ offer: TrafficOffer; verdict: AdmissionVerdict }>
): LanePressure {
  const pressure: LanePressure = {
    pendingPods: 0,
    pendingBerths: 0,
    autoAccepts: 0,
    autoHolds: 0,
    manual: 0,
    topReason: null
  };
  const reasonCounts = new Map<string, number>();
  for (const { offer, verdict } of verdicts) {
    if (admissionClassFor(offer) === 'pod') pressure.pendingPods += 1;
    else pressure.pendingBerths += 1;
    if (verdict.decision === 'accept') pressure.autoAccepts += 1;
    else if (verdict.decision === 'hold') pressure.autoHolds += 1;
    else if (verdict.decision === 'manual') pressure.manual += 1;
    if (verdict.decision !== 'accept') {
      reasonCounts.set(verdict.reason, (reasonCounts.get(verdict.reason) ?? 0) + 1);
    }
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [reason, count] of [...reasonCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (count > bestCount) {
      best = reason;
      bestCount = count;
    }
  }
  pressure.topReason = best;
  return pressure;
}

/** Sizes the berth rule may commit to. Large always stays manual. */
export const AUTOMATABLE_SIZES: readonly ShipSize[] = ['small', 'medium'];
