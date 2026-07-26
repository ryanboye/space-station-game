/**
 * Opening-economy primitives.
 *
 * This module deliberately owns no StationState mutation. The simulation can
 * persist the plain-data ledger alongside its other state, while UI and
 * rendering can derive identical summaries without inventing another
 * accounting model.
 */

import type { SiteCharter, SpaceLane } from './types';

/**
 * Every categorized credit movement (shared contract C6).
 *
 * The list is append-only: `grant-award` is retained so saves written before
 * project money was split into advance and award still load, but nothing
 * emits it any more.
 */
export const ECONOMY_EVENT_KINDS = [
  'dock-fee',
  'passenger-service',
  'fuel-sale',
  'repair-service',
  'retail-sale',
  'supplier-purchase',
  'courier-fee',
  'wages',
  'maintenance',
  'construction',
  'grant-award',
  // Capital in and out.
  'capital-resale',
  'station-expansion',
  'hiring',
  'research',
  // Contract money, kept separate from traffic revenue so a project advance
  // cannot look like the station earning its way (opening ticket 09).
  'project-advance',
  'project-award',
  'contract-settlement',
  'contract-procurement',
  // Tenant income and the cost of failing a promise.
  'tenant-income',
  'penalty',
  'security-recovery',
  'resident-tax'
] as const;

export type EconomyEventKind = typeof ECONOMY_EVENT_KINDS[number];

/** JSON-safe transaction record retained by the opening-economy ledger. */
export interface EconomyEvent {
  id: number;
  at: number;
  kind: EconomyEventKind;
  /** Positive revenue, negative expense. */
  credits: number;
  /** Value of consumed station inventory or resources, never a cash payment. */
  costBasis: number;
  label: string;
  sourceId?: number;
  tileIndex?: number;
  siteTag?: string;
}

export type EconomyEventInput = Omit<EconomyEvent, 'id'> & { id?: number };

export interface EconomyCategorySummary {
  count: number;
  revenue: number;
  expenses: number;
  net: number;
  costBasis: number;
}

export type EconomyCategorySummaries = Record<EconomyEventKind, EconomyCategorySummary>;

export interface EconomyLedger {
  /** The id assigned to the next event when an explicit id is not supplied. */
  nextEventId: number;
  /** Most recent events, ascending by simulation time. Bound this at write time. */
  recent: EconomyEvent[];
  /** Lifetime rollups are compact enough to persist indefinitely. */
  lifetime: EconomyCategorySummaries;
}

export interface EconomyLedgerOptions {
  recentLimit?: number;
}

export const DEFAULT_ECONOMY_RECENT_LIMIT = 96;

const LANES: readonly SpaceLane[] = ['north', 'east', 'south', 'west'];

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function nonNegative(value: number): number {
  return Math.max(0, finite(value));
}

function bounded(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function zeroSummary(): EconomyCategorySummary {
  return { count: 0, revenue: 0, expenses: 0, net: 0, costBasis: 0 };
}

export function createEconomyCategorySummaries(): EconomyCategorySummaries {
  return Object.fromEntries(ECONOMY_EVENT_KINDS.map((kind) => [kind, zeroSummary()])) as EconomyCategorySummaries;
}

export function createEconomyLedger(): EconomyLedger {
  return {
    nextEventId: 1,
    recent: [],
    lifetime: createEconomyCategorySummaries()
  };
}

/**
 * Accept older saves that lack a ledger or contain a partially written one.
 * Callers may assign the returned data directly back into state before a tick.
 */
export function normalizeEconomyLedger(raw: Partial<EconomyLedger> | null | undefined): EconomyLedger {
  const lifetime = createEconomyCategorySummaries();
  for (const kind of ECONOMY_EVENT_KINDS) {
    const summary = raw?.lifetime?.[kind];
    if (!summary) continue;
    lifetime[kind] = {
      count: Math.max(0, Math.floor(finite(summary.count))),
      revenue: nonNegative(summary.revenue),
      expenses: nonNegative(summary.expenses),
      net: finite(summary.net),
      costBasis: nonNegative(summary.costBasis)
    };
  }
  const recent = Array.isArray(raw?.recent)
    ? raw.recent.filter(isEconomyEvent).map(copyEvent).sort((a, b) => a.at - b.at || a.id - b.id)
    : [];
  const maxId = recent.reduce((highest, event) => Math.max(highest, event.id), 0);
  return {
    nextEventId: Math.max(1, Math.floor(finite(raw?.nextEventId ?? maxId + 1, maxId + 1)), maxId + 1),
    recent,
    lifetime
  };
}

export function isEconomyEventKind(value: unknown): value is EconomyEventKind {
  return typeof value === 'string' && (ECONOMY_EVENT_KINDS as readonly string[]).includes(value);
}

export function isEconomyEvent(value: unknown): value is EconomyEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Partial<EconomyEvent>;
  return Number.isFinite(event.id)
    && Number.isFinite(event.at)
    && isEconomyEventKind(event.kind)
    && Number.isFinite(event.credits)
    && Number.isFinite(event.costBasis)
    && typeof event.label === 'string';
}

function copyEvent(event: EconomyEvent): EconomyEvent {
  return {
    id: Math.max(1, Math.floor(finite(event.id, 1))),
    at: finite(event.at),
    kind: event.kind,
    credits: finite(event.credits),
    costBasis: nonNegative(event.costBasis),
    label: event.label.slice(0, 120),
    ...(Number.isFinite(event.sourceId) ? { sourceId: Math.floor(event.sourceId as number) } : {}),
    ...(Number.isFinite(event.tileIndex) ? { tileIndex: Math.floor(event.tileIndex as number) } : {}),
    ...(typeof event.siteTag === 'string' && event.siteTag ? { siteTag: event.siteTag.slice(0, 80) } : {})
  };
}

function applyToSummary(summary: EconomyCategorySummary, event: EconomyEvent): void {
  summary.count += 1;
  summary.revenue += Math.max(0, event.credits);
  summary.expenses += Math.max(0, -event.credits);
  summary.net += event.credits;
  summary.costBasis += event.costBasis;
}

/**
 * Mutates a ledger in place and returns the canonical event. This is intended
 * for the simulation's hot path: one bounded append, one tiny rollup update.
 */
export function recordEconomyEvent(
  ledger: EconomyLedger,
  input: EconomyEventInput,
  options: EconomyLedgerOptions = {}
): EconomyEvent {
  const recentLimit = Math.max(1, Math.floor(options.recentLimit ?? DEFAULT_ECONOMY_RECENT_LIMIT));
  const nextId = Math.max(1, Math.floor(finite(ledger.nextEventId, 1)));
  const event = copyEvent({
    id: input.id ?? nextId,
    at: input.at,
    kind: input.kind,
    credits: input.credits,
    costBasis: input.costBasis,
    label: input.label,
    sourceId: input.sourceId,
    tileIndex: input.tileIndex,
    siteTag: input.siteTag
  });
  ledger.nextEventId = Math.max(nextId, event.id + 1);
  if (!ledger.lifetime || typeof ledger.lifetime !== 'object') ledger.lifetime = createEconomyCategorySummaries();
  if (!ledger.lifetime[event.kind]) ledger.lifetime[event.kind] = zeroSummary();
  applyToSummary(ledger.lifetime[event.kind], event);
  if (!Array.isArray(ledger.recent)) ledger.recent = [];
  ledger.recent.push(event);
  if (ledger.recent.length > recentLimit) ledger.recent.splice(0, ledger.recent.length - recentLimit);
  return event;
}

export interface EconomyWindowSummary {
  revenue: number;
  expenses: number;
  net: number;
  costBasis: number;
  grossMargin: number;
  count: number;
  byKind: EconomyCategorySummaries;
}

export function summarizeEconomyEvents(events: readonly EconomyEvent[]): EconomyWindowSummary {
  const byKind = createEconomyCategorySummaries();
  let revenue = 0;
  let expenses = 0;
  let costBasis = 0;
  let count = 0;
  for (const raw of events) {
    if (!isEconomyEvent(raw)) continue;
    const event = copyEvent(raw);
    count += 1;
    revenue += Math.max(0, event.credits);
    expenses += Math.max(0, -event.credits);
    costBasis += event.costBasis;
    applyToSummary(byKind[event.kind], event);
  }
  return {
    revenue,
    expenses,
    net: revenue - expenses,
    costBasis,
    grossMargin: revenue - costBasis,
    count,
    byKind
  };
}

export type MarketPricingPolicy = 'budget' | 'standard' | 'premium';

export interface MarketPolicyEffect {
  policy: MarketPricingPolicy;
  salePriceMultiplier: number;
  demandMultiplier: number;
  satisfactionDelta: number;
  /** Premium stops being a free win at a young station. */
  ratingRequiredForNeutralSatisfaction: number;
}

const MARKET_POLICY_EFFECTS: Record<MarketPricingPolicy, MarketPolicyEffect> = {
  budget: {
    policy: 'budget', salePriceMultiplier: 0.84, demandMultiplier: 1.2,
    satisfactionDelta: 0.08, ratingRequiredForNeutralSatisfaction: 0
  },
  standard: {
    policy: 'standard', salePriceMultiplier: 1, demandMultiplier: 1,
    satisfactionDelta: 0, ratingRequiredForNeutralSatisfaction: 0
  },
  premium: {
    policy: 'premium', salePriceMultiplier: 1.28, demandMultiplier: 0.72,
    satisfactionDelta: -0.08, ratingRequiredForNeutralSatisfaction: 35
  }
};

export function marketPolicyEffect(policy: MarketPricingPolicy): MarketPolicyEffect {
  return { ...MARKET_POLICY_EFFECTS[policy] };
}

export interface OpeningEconomyProfile {
  siteTag: string;
  trafficLabel: string;
  resourceLabel: string | null;
  passengerTrafficMultiplier: number;
  courierTrafficMultiplier: number;
  supplyWholesaleMultiplier: number;
  fuelWholesaleMultiplier: number;
  fuelSaleMultiplier: number;
  retailDemandMultiplier: number;
  repairDemandMultiplier: number;
  solarYieldMultiplier: number;
  environmentPressureMultiplier: number;
}

function laneAverage(site?: SiteCharter): number {
  if (!site) return 1;
  const sum = LANES.reduce((total, lane) => total + finite(site.laneTrafficFactor?.[lane], 1), 0);
  return bounded(sum / LANES.length, 0.6, 2.5);
}

/**
 * Pure, bounded opening-economy translation of an optional SiteCharter.
 * Missing charter data intentionally resolves to the familiar neutral start.
 */
export function deriveOpeningEconomyProfile(site?: SiteCharter): OpeningEconomyProfile {
  const traffic = laneAverage(site);
  const trafficNormalized = bounded((traffic - 0.6) / 1.9, 0, 1);
  const sun = bounded(finite(site?.sunFactor ?? 0.5, 0.5), 0, 1);
  const debris = bounded(finite(site?.debrisFactor ?? 0, 0), 0, 1);
  const resource = site?.resourceType ?? null;
  const resourceEffects = resource === 'ice'
    ? { supply: 0.9, fuelWholesale: 0.86, fuelSale: 0.93, retail: 0.96, repair: 1.04, label: 'Ice-rich belt · cheap water and fuel feedstock' }
    : resource === 'gas'
      ? { supply: 0.96, fuelWholesale: 0.82, fuelSale: 0.9, retail: 0.92, repair: 1.02, label: 'Gas belt · cheap fuel feedstock' }
      : resource === 'metal'
        ? { supply: 0.88, fuelWholesale: 1.02, fuelSale: 1.03, retail: 1.02, repair: 0.84, label: 'Metal belt · cheap repair stock' }
        : { supply: 1, fuelWholesale: 1, fuelSale: 1, retail: 1, repair: 1, label: null };
  const busy = trafficNormalized >= 0.62;
  const remote = trafficNormalized <= 0.24;
  const trafficLabel = busy
    ? 'Busy trade lane · strong traveler demand'
    : remote
      ? 'Remote orbit · costly deliveries, high repair demand'
      : 'Mixed traffic · balanced local demand';
  const deliveryCost = 1.13 - trafficNormalized * 0.22;
  return {
    siteTag: resource ?? (busy ? 'trade-lane' : remote ? 'remote' : 'neutral'),
    trafficLabel,
    resourceLabel: resourceEffects.label,
    passengerTrafficMultiplier: bounded(0.76 + trafficNormalized * 0.72, 0.75, 1.48),
    courierTrafficMultiplier: bounded(0.68 + trafficNormalized * 0.96, 0.65, 1.62),
    supplyWholesaleMultiplier: bounded(deliveryCost * resourceEffects.supply, 0.78, 1.22),
    fuelWholesaleMultiplier: bounded(deliveryCost * resourceEffects.fuelWholesale, 0.7, 1.24),
    fuelSaleMultiplier: bounded((0.94 + trafficNormalized * 0.13) * resourceEffects.fuelSale, 0.76, 1.2),
    retailDemandMultiplier: bounded((0.82 + trafficNormalized * 0.5) * resourceEffects.retail, 0.72, 1.36),
    repairDemandMultiplier: bounded((0.8 + (1 - trafficNormalized) * 0.28 + debris * 0.25) * resourceEffects.repair, 0.76, 1.38),
    solarYieldMultiplier: bounded(0.55 + sun * 0.9, 0.55, 1.45),
    environmentPressureMultiplier: bounded(0.75 + debris * 0.62 + sun * 0.18, 0.72, 1.48)
  };
}


/**
 * How a berth call's payout is split between work delivered and work promised
 * but not delivered (opening ticket 09).
 *
 * Pure and exported so the settlement path, the report UI, and the focused
 * checks all agree on the arithmetic instead of restating it.
 */
export interface SettlementPromiseInput {
  target: number;
  completed: number;
  payoutCredits: number;
}

export interface SettlementPayout {
  /** What the call is worth when every promise is kept. */
  grossCredits: number;
  /** Share of promised work the station did not deliver, 0..1. */
  shortfallRatio: number;
  shortfallPenaltyCredits: number;
  /** What the station is actually paid. May be negative for a ruined call. */
  netCredits: number;
}

export function computeSettlementPayout(
  promises: readonly SettlementPromiseInput[],
  standingMultiplier: number,
  options: { shortfallPenaltyShare: number; maxNetLossShare: number }
): SettlementPayout {
  const componentValue = promises.reduce((sum, promise) => {
    const ratio = promise.target <= 0 ? 1 : bounded(promise.completed / promise.target, 0, 1);
    return sum + Math.round(Math.max(0, promise.payoutCredits) * ratio);
  }, 0);
  const grossCredits = Math.round(componentValue * standingMultiplier);
  const promisedTotal = promises.reduce((sum, promise) => sum + Math.max(0, promise.target), 0);
  const completedTotal = promises.reduce(
    (sum, promise) => sum + bounded(promise.completed, 0, Math.max(0, promise.target)),
    0
  );
  const shortfallRatio = promisedTotal <= 0 ? 0 : bounded(1 - completedTotal / promisedTotal, 0, 1);
  const shortfallPenaltyCredits = Math.round(grossCredits * shortfallRatio * options.shortfallPenaltyShare);
  const floor = -Math.round(grossCredits * options.maxNetLossShare);
  return {
    grossCredits,
    shortfallRatio,
    shortfallPenaltyCredits,
    netCredits: Math.max(floor, grossCredits - shortfallPenaltyCredits)
  };
}
