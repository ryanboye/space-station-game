/**
 * What each pod call wanted, what it got, and what the station left on the
 * table.
 *
 * OPEN-02. The opening asks the player to decide what their station sells, and
 * they can only decide that if the world tells them what is arriving. Departure
 * results carried a bare list of missed service names; this module gives every
 * call a comparable shape — travellers, demand per family, service per family,
 * credits earned and credits missed — so the dock chip can say "wanted food,
 * bought nothing, est. 18c missed" and the build catalog can say which of the
 * three opening opportunities has actually been showing up.
 *
 * Pure data, like `opening-economy.ts`: no StationState mutation lives here.
 */

/** The three opening service families the player chooses between. */
export const POD_DEMAND_FAMILIES = ['food', 'supplies', 'shipService'] as const;
export type PodDemandFamily = typeof POD_DEMAND_FAMILIES[number];

export type PodDemandCounts = Record<PodDemandFamily, number>;

export interface PodVisitOutcome {
  visitId: number;
  at: number;
  dockTileIndex: number;
  travelers: number;
  /** Units of each family this call arrived wanting. */
  wanted: PodDemandCounts;
  /** Units the station physically delivered. */
  served: PodDemandCounts;
  /** Credits actually taken from this call. */
  earnedCredits: number;
  /** Estimated credits the unserved demand was worth. */
  missedCredits: number;
}

export interface PodDemandLog {
  /** Most recent calls, ascending by simulation time. Bounded on write. */
  recent: PodVisitOutcome[];
  lifetimeWanted: PodDemandCounts;
  lifetimeServed: PodDemandCounts;
  lifetimeMissedCredits: number;
}

export const DEFAULT_POD_DEMAND_LIMIT = 40;

/**
 * What one unit of unserved demand was plausibly worth.
 *
 * Deliberately the same numbers the served path pays, so "est. missed" is a
 * forecast of the player's own prices rather than an invented incentive.
 * Balance targets in `01-player-authored-opening.md`: a good completed pod
 * visit is roughly 10-30c gross across all families.
 */
export const POD_DEMAND_UNIT_VALUE: PodDemandCounts = {
  food: 6,
  supplies: 5,
  shipService: 9
};

function zeroCounts(): PodDemandCounts {
  return { food: 0, supplies: 0, shipService: 0 };
}

function finite(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeCounts(raw: unknown): PodDemandCounts {
  const counts = zeroCounts();
  if (raw && typeof raw === 'object') {
    for (const family of POD_DEMAND_FAMILIES) {
      counts[family] = Math.max(0, finite((raw as Record<string, unknown>)[family]));
    }
  }
  return counts;
}

export function createPodDemandLog(): PodDemandLog {
  return {
    recent: [],
    lifetimeWanted: zeroCounts(),
    lifetimeServed: zeroCounts(),
    lifetimeMissedCredits: 0
  };
}

export function normalizePodDemandLog(raw: Partial<PodDemandLog> | null | undefined): PodDemandLog {
  const recent = Array.isArray(raw?.recent)
    ? raw.recent
        .filter((entry): entry is PodVisitOutcome => !!entry && typeof entry === 'object')
        .map((entry) => ({
          visitId: Math.floor(finite(entry.visitId)),
          at: finite(entry.at),
          dockTileIndex: Math.floor(finite(entry.dockTileIndex, -1)),
          travelers: Math.max(0, Math.floor(finite(entry.travelers))),
          wanted: normalizeCounts(entry.wanted),
          served: normalizeCounts(entry.served),
          earnedCredits: Math.max(0, finite(entry.earnedCredits)),
          missedCredits: Math.max(0, finite(entry.missedCredits))
        }))
        .sort((a, b) => a.at - b.at)
        .slice(-DEFAULT_POD_DEMAND_LIMIT)
    : [];
  return {
    recent,
    lifetimeWanted: normalizeCounts(raw?.lifetimeWanted),
    lifetimeServed: normalizeCounts(raw?.lifetimeServed),
    lifetimeMissedCredits: Math.max(0, finite(raw?.lifetimeMissedCredits))
  };
}

/** Estimated value of the demand this call arrived with but did not receive. */
export function estimateMissedCredits(wanted: PodDemandCounts, served: PodDemandCounts): number {
  let missed = 0;
  for (const family of POD_DEMAND_FAMILIES) {
    const shortfall = Math.max(0, wanted[family] - served[family]);
    missed += shortfall * POD_DEMAND_UNIT_VALUE[family];
  }
  return Math.round(missed);
}

export function recordPodVisitOutcome(
  log: PodDemandLog,
  outcome: PodVisitOutcome,
  limit = DEFAULT_POD_DEMAND_LIMIT
): PodVisitOutcome {
  log.recent.push(outcome);
  if (log.recent.length > limit) log.recent.splice(0, log.recent.length - limit);
  for (const family of POD_DEMAND_FAMILIES) {
    log.lifetimeWanted[family] += outcome.wanted[family];
    log.lifetimeServed[family] += outcome.served[family];
  }
  log.lifetimeMissedCredits += outcome.missedCredits;
  return outcome;
}

export interface PodDemandSummaryRow {
  family: PodDemandFamily;
  label: string;
  wanted: number;
  served: number;
  missed: number;
  missedCredits: number;
}

export interface PodDemandSummary {
  calls: number;
  travelers: number;
  earnedCredits: number;
  missedCredits: number;
  rows: PodDemandSummaryRow[];
  /** The family with the most value left on the table, if any demand missed. */
  topOpportunity: PodDemandFamily | null;
}

const FAMILY_LABELS: Record<PodDemandFamily, string> = {
  food: 'Feed Travelers',
  supplies: 'Sell Supplies',
  shipService: 'Refuel Pods'
};

/**
 * Bounded aggregation over the recent calls, for catalog and first-cycle
 * context. `windowSec` of `null` means the whole retained window.
 */
export function summarizePodDemand(
  log: PodDemandLog,
  now: number,
  windowSec: number | null = null
): PodDemandSummary {
  const cutoff = windowSec === null ? -Infinity : now - Math.max(1, windowSec);
  const calls = log.recent.filter((entry) => entry.at >= cutoff);
  const wanted = zeroCounts();
  const served = zeroCounts();
  let travelers = 0;
  let earnedCredits = 0;
  let missedCredits = 0;
  for (const call of calls) {
    travelers += call.travelers;
    earnedCredits += call.earnedCredits;
    missedCredits += call.missedCredits;
    for (const family of POD_DEMAND_FAMILIES) {
      wanted[family] += call.wanted[family];
      served[family] += call.served[family];
    }
  }
  const rows = POD_DEMAND_FAMILIES.map((family) => {
    const missed = Math.max(0, wanted[family] - served[family]);
    return {
      family,
      label: FAMILY_LABELS[family],
      wanted: wanted[family],
      served: served[family],
      missed,
      missedCredits: Math.round(missed * POD_DEMAND_UNIT_VALUE[family])
    };
  });
  const best = rows.reduce<PodDemandSummaryRow | null>(
    (top, row) => (row.missedCredits > (top?.missedCredits ?? 0) ? row : top),
    null
  );
  return {
    calls: calls.length,
    travelers,
    earnedCredits,
    missedCredits,
    rows,
    topOpportunity: best && best.missedCredits > 0 ? best.family : null
  };
}
