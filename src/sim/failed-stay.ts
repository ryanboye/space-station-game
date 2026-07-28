/**
 * Failed-stay episodes: escalation, bounded incidents, exactly-once
 * attribution, and the explicit recovery levers a player can pull.
 *
 * Why this is its own module:
 *
 * `sim.ts` already escalates a visitor through `unmet -> balking ->
 * distressed -> disruptive`, but it does so as a per-tick stage recomputation
 * with no memory. Nothing fires once when a cohort crosses a threshold,
 * nothing records WHY, and there is no object a recovery action can target.
 * An episode is that object: it opens when a long stay starts failing, it
 * remembers the cause and the place, it applies its rating consequence exactly
 * once per milestone, and it closes when the shortage is resolved.
 *
 * Import discipline: this module depends only on `types` and
 * `occupant-demand`. It never imports `./sim`, so `sim.ts` can call into it
 * freely. Anything that needs to spend credits returns an economy INTENT which
 * `sim.ts` applies through `applyEconomyTransaction` — the same pattern
 * `pod-freight.ts` uses, and the reason a recovery action can be unit-tested
 * without a live economy.
 */

import { isLongStayClass } from './occupant-demand';
import {
  type EconomyEventInput
} from './opening-economy';
import {
  type RecurringNeedKind,
  type StationState,
  type Visitor,
  type VisitorServiceFailureStage
} from './types';

// ---------------------------------------------------------------------------
// Escalation ladder
// ---------------------------------------------------------------------------

/**
 * Grace intervals, in seconds of continuous unmet need, before a stage.
 *
 * These mirror `FAILED_STAY_TIMINGS` in sim.ts deliberately: this module is
 * the documented home for them, and sim.ts keeps its copy only until the
 * ladder itself moves here. One missed meal must never reach `disruptive`,
 * which is why the first two gaps are long relative to a single service.
 */
export const FAILURE_GRACE_SEC = {
  balking: 28,
  distressed: 75,
  disruptive: 150
} as const;

export const FAILURE_STAGE_ORDER: readonly VisitorServiceFailureStage[] = [
  'none',
  'unmet',
  'balking',
  'distressed',
  'disruptive'
];

export function failureStageRank(stage: VisitorServiceFailureStage | undefined): number {
  return Math.max(0, FAILURE_STAGE_ORDER.indexOf(stage ?? 'none'));
}

/** The stage a continuously-unmet occupant has reached after `elapsedSec`. */
export function stageForElapsed(elapsedSec: number): VisitorServiceFailureStage {
  if (elapsedSec >= FAILURE_GRACE_SEC.disruptive) return 'disruptive';
  if (elapsedSec >= FAILURE_GRACE_SEC.distressed) return 'distressed';
  if (elapsedSec >= FAILURE_GRACE_SEC.balking) return 'balking';
  return 'unmet';
}

// ---------------------------------------------------------------------------
// Episodes
// ---------------------------------------------------------------------------

export type FailureResolution =
  | 'served'
  | 'compensated'
  | 'recalled'
  | 'transferred'
  | 'cancelled'
  | 'removed'
  | 'departed';

/** Milestones carry their rating consequence exactly once each. */
export type FailureMilestone = 'distressed' | 'disruptive' | 'resolved';

export interface FailureIncident {
  id: number;
  kind: 'mess' | 'complaint' | 'refusal-to-work';
  at: number;
  tileIndex: number;
}

export interface FailureEpisode {
  id: number;
  /** Whose stay is failing. Identities stay distinct; only visitors open episodes today. */
  subjectKind: 'visitor';
  subjectId: number;
  /** The commitment this failure belongs to, for attribution and cancellation. */
  shipId: number | null;
  contractId: number | null;
  /** The physical shortage that opened the episode. */
  need: RecurringNeedKind | null;
  /** Durable, player-visible cause. Never regenerated from the current stage. */
  cause: string;
  /** Where it is happening, for spatial attribution. */
  anchorTile: number;
  stage: VisitorServiceFailureStage;
  openedAt: number;
  lastStageAt: number;
  /** Milestones already paid out. This is the exactly-once guard. */
  milestonesApplied: FailureMilestone[];
  /** Bounded: a cohort produces a handful of incidents, never a crime wave. */
  incidents: FailureIncident[];
  /** Credits already paid to this cohort. Compensation is idempotent per step. */
  compensationCredits: number;
  /** Recovery actions already applied, so each lever is idempotent. */
  actionsApplied: RecoveryActionKind[];
  resolvedAt: number | null;
  resolution: FailureResolution | null;
}

export interface FailureEpisodeState {
  nextEpisodeId: number;
  nextIncidentId: number;
  episodes: FailureEpisode[];
}

/** Keep the ledger bounded; resolved episodes age out once nothing reads them. */
export const MAX_RETAINED_EPISODES = 64;
/** A single episode may never spawn more than this many incidents. */
export const MAX_INCIDENTS_PER_EPISODE = 3;
/** Seconds between incidents from one episode. */
export const INCIDENT_COOLDOWN_SEC = 45;

export function createFailureEpisodeState(): FailureEpisodeState {
  return { nextEpisodeId: 1, nextIncidentId: 1, episodes: [] };
}

/**
 * Accept whatever a save carries, including nothing at all.
 *
 * A legacy save has no episode ledger; it hydrates to an empty one and the
 * next tick reopens episodes for anyone still failing, so no occupant is
 * silently rescued by loading.
 */
export function normalizeFailureEpisodeState(
  raw: Partial<FailureEpisodeState> | null | undefined
): FailureEpisodeState {
  const episodes: FailureEpisode[] = [];
  if (Array.isArray(raw?.episodes)) {
    for (const entry of raw.episodes) {
      const episode = normalizeEpisode(entry);
      if (episode) episodes.push(episode);
    }
  }
  const maxId = episodes.reduce((highest, episode) => Math.max(highest, episode.id), 0);
  const maxIncidentId = episodes.reduce(
    (highest, episode) => episode.incidents.reduce((inner, incident) => Math.max(inner, incident.id), highest),
    0
  );
  const open = episodes.filter((episode) => episode.resolvedAt === null);
  const closed = episodes.filter((episode) => episode.resolvedAt !== null);
  const closedRoom = Math.max(0, MAX_RETAINED_EPISODES - open.length);
  return {
    nextEpisodeId: Math.max(1, Math.floor(raw?.nextEpisodeId ?? maxId + 1), maxId + 1),
    nextIncidentId: Math.max(1, Math.floor(raw?.nextIncidentId ?? maxIncidentId + 1), maxIncidentId + 1),
    // Open episodes are live operating state. Never discard their milestone
    // history merely because the bounded closed-history ledger is full.
    episodes: [...(closedRoom === 0 ? [] : closed.slice(-closedRoom)), ...open]
  };
}

function normalizeEpisode(raw: unknown): FailureEpisode | null {
  if (!raw || typeof raw !== 'object') return null;
  const entry = raw as Partial<FailureEpisode>;
  if (!Number.isFinite(entry.id) || !Number.isFinite(entry.subjectId)) return null;
  const stage = FAILURE_STAGE_ORDER.includes(entry.stage as VisitorServiceFailureStage)
    ? (entry.stage as VisitorServiceFailureStage)
    : 'unmet';
  return {
    id: Math.max(1, Math.floor(entry.id as number)),
    subjectKind: 'visitor',
    subjectId: Math.floor(entry.subjectId as number),
    shipId: Number.isFinite(entry.shipId) ? Math.floor(entry.shipId as number) : null,
    contractId: Number.isFinite(entry.contractId) ? Math.floor(entry.contractId as number) : null,
    need: (entry.need ?? null) as RecurringNeedKind | null,
    cause: typeof entry.cause === 'string' ? entry.cause.slice(0, 160) : 'unmet need',
    anchorTile: Number.isFinite(entry.anchorTile) ? Math.floor(entry.anchorTile as number) : 0,
    stage,
    openedAt: Math.max(0, Number(entry.openedAt) || 0),
    lastStageAt: Math.max(0, Number(entry.lastStageAt) || 0),
    milestonesApplied: Array.isArray(entry.milestonesApplied)
      ? entry.milestonesApplied.filter((milestone): milestone is FailureMilestone =>
          milestone === 'distressed' || milestone === 'disruptive' || milestone === 'resolved')
      : [],
    incidents: Array.isArray(entry.incidents)
      ? entry.incidents
          .filter((incident): incident is FailureIncident => !!incident && Number.isFinite((incident as FailureIncident).id))
          .slice(0, MAX_INCIDENTS_PER_EPISODE)
      : [],
    compensationCredits: Math.max(0, Number(entry.compensationCredits) || 0),
    actionsApplied: Array.isArray(entry.actionsApplied)
      ? entry.actionsApplied.filter((action): action is RecoveryActionKind =>
          RECOVERY_ACTION_KINDS.includes(action as RecoveryActionKind))
      : [],
    resolvedAt: Number.isFinite(entry.resolvedAt) ? Number(entry.resolvedAt) : null,
    resolution: (entry.resolution ?? null) as FailureResolution | null
  };
}

export function openEpisodes(ledger: FailureEpisodeState): FailureEpisode[] {
  return ledger.episodes.filter((episode) => episode.resolvedAt === null);
}

export function episodeForSubject(ledger: FailureEpisodeState, subjectId: number): FailureEpisode | null {
  return openEpisodes(ledger).find((episode) => episode.subjectId === subjectId) ?? null;
}

export function episodesForShip(ledger: FailureEpisodeState, shipId: number): FailureEpisode[] {
  return openEpisodes(ledger).filter((episode) => episode.shipId === shipId);
}

/** A short, durable sentence naming the physical shortage. */
export function describeCause(need: RecurringNeedKind | null, stage: VisitorServiceFailureStage): string {
  const shortage =
    need === 'hunger' ? 'no reachable meal'
      : need === 'energy' ? 'no reachable bed'
        : need === 'hygiene' ? 'no reachable hygiene'
          : need === 'leisure' ? 'no reachable leisure'
            : 'an unmet need';
  return `${shortage} (${stage})`;
}

export interface EpisodeSyncResult {
  opened: FailureEpisode[];
  escalated: Array<{ episode: FailureEpisode; from: VisitorServiceFailureStage; to: VisitorServiceFailureStage }>;
  resolved: FailureEpisode[];
  /** Milestones that crossed this tick and have not been paid yet. */
  pendingMilestones: Array<{ episode: FailureEpisode; milestone: FailureMilestone }>;
}

/**
 * Reconcile the episode ledger against the live occupants.
 *
 * Opens an episode for anyone newly failing, advances the stage of anyone
 * still failing, and resolves an episode the moment its subject stops failing
 * or leaves. Escalation is therefore reversible by construction: removing the
 * shortage resolves the episode on the very next sync.
 */
/** The contract that owns this ship, so an episode can name its commitment. */
function contractIdForShip(state: StationState, shipId: number | null): number | null {
  if (shipId === null) return null;
  const ship = state.arrivingShips.find((entry) => entry.id === shipId);
  if (!ship || ship.portContractId === undefined) return null;
  return ship.portContractId;
}

export function syncFailureEpisodes(state: StationState, ledger: FailureEpisodeState): EpisodeSyncResult {
  const result: EpisodeSyncResult = { opened: [], escalated: [], resolved: [], pendingMilestones: [] };
  const liveById = new Map(state.visitors.map((visitor) => [visitor.id, visitor]));

  for (const visitor of state.visitors) {
    const failing = isFailing(visitor);
    const existing = episodeForSubject(ledger, visitor.id);
    if (failing && !existing) {
      const episode: FailureEpisode = {
        id: ledger.nextEpisodeId++,
        subjectKind: 'visitor',
        subjectId: visitor.id,
        shipId: visitor.originShipId ?? visitor.strandedFromShipId ?? null,
        contractId: contractIdForShip(state, visitor.originShipId ?? visitor.strandedFromShipId ?? null),
        need: visitor.failureNeed ?? null,
        cause: describeCause(visitor.failureNeed ?? null, visitor.serviceFailureStage ?? 'unmet'),
        anchorTile: visitor.tileIndex,
        stage: visitor.serviceFailureStage ?? 'unmet',
        openedAt: state.now,
        lastStageAt: state.now,
        milestonesApplied: [],
        incidents: [],
        compensationCredits: 0,
        actionsApplied: [],
        resolvedAt: null,
        resolution: null
      };
      ledger.episodes.push(episode);
      result.opened.push(episode);
      continue;
    }
    if (!existing) continue;
    if (!failing) {
      resolveEpisode(state, ledger, existing, 'served', result);
      continue;
    }
    const nextStage = visitor.serviceFailureStage ?? 'unmet';
    if (failureStageRank(nextStage) > failureStageRank(existing.stage)) {
      result.escalated.push({ episode: existing, from: existing.stage, to: nextStage });
      existing.stage = nextStage;
      existing.lastStageAt = state.now;
      existing.anchorTile = visitor.tileIndex;
      // The cause is written once per stage crossing, so it names the shortage
      // that actually produced this level rather than the latest tick's guess.
      existing.cause = describeCause(existing.need ?? visitor.failureNeed ?? null, nextStage);
      if (nextStage === 'distressed' || nextStage === 'disruptive') {
        queueMilestone(existing, nextStage, result);
      }
    }
  }

  // Anyone whose subject left the station resolves rather than lingering.
  for (const episode of openEpisodes(ledger)) {
    if (!liveById.has(episode.subjectId)) {
      resolveEpisode(state, ledger, episode, 'departed', result);
    }
  }

  if (ledger.episodes.length > MAX_RETAINED_EPISODES) {
    // Open episodes are live operating state and are NEVER dropped, however
    // many there are. Only the closed history is trimmed, and only down to
    // whatever room the open set leaves — which may be none.
    const open = openEpisodes(ledger);
    const closed = ledger.episodes.filter((episode) => episode.resolvedAt !== null);
    const room = Math.max(0, MAX_RETAINED_EPISODES - open.length);
    ledger.episodes = [...closed.slice(closed.length - Math.min(room, closed.length)), ...open];
  }
  return result;
}

function isFailing(visitor: Visitor): boolean {
  const stage = visitor.serviceFailureStage ?? 'none';
  if (stage === 'none') return false;
  // Only tenures that can actually accumulate pressure open an episode. An
  // errand shopper who balks is a lost sale, not a failed stay.
  return isLongStayClass(visitor.stayClass) || visitor.strandedFromShipId != null;
}

function queueMilestone(
  episode: FailureEpisode,
  milestone: FailureMilestone,
  result: EpisodeSyncResult
): void {
  if (episode.milestonesApplied.includes(milestone)) return;
  result.pendingMilestones.push({ episode, milestone });
}

/**
 * Mark a milestone paid.
 *
 * `sim.ts` calls this after it has applied the rating effect, which is what
 * makes the effect exactly-once even across a save/load in the middle of an
 * escalation: the ledger, not the tick, remembers.
 */
export function markMilestoneApplied(episode: FailureEpisode, milestone: FailureMilestone): void {
  if (!episode.milestonesApplied.includes(milestone)) episode.milestonesApplied.push(milestone);
}

export function resolveEpisode(
  state: StationState,
  ledger: FailureEpisodeState,
  episode: FailureEpisode,
  resolution: FailureResolution,
  result?: EpisodeSyncResult
): void {
  if (episode.resolvedAt !== null) return;
  episode.resolvedAt = state.now;
  episode.resolution = resolution;
  if (result) {
    result.resolved.push(episode);
    queueMilestone(episode, 'resolved', result);
  }
  void ledger;
}

/**
 * Should this episode produce an incident right now?
 *
 * Bounded three ways: only at `distressed` or above, at most
 * MAX_INCIDENTS_PER_EPISODE per episode, and never more often than
 * INCIDENT_COOLDOWN_SEC. This is what keeps a bad shift from becoming a crime
 * simulation.
 */
export function nextIncidentFor(
  state: StationState,
  episode: FailureEpisode
): FailureIncident['kind'] | null {
  if (failureStageRank(episode.stage) < failureStageRank('distressed')) return null;
  if (episode.incidents.length >= MAX_INCIDENTS_PER_EPISODE) return null;
  const last = episode.incidents[episode.incidents.length - 1];
  if (last && state.now - last.at < INCIDENT_COOLDOWN_SEC) return null;
  // Deterministic ladder: mess is the first visible sign, then a complaint,
  // and only a sustained disruptive episode refuses to work.
  if (episode.incidents.length === 0) return 'mess';
  if (episode.incidents.length === 1) return 'complaint';
  return episode.stage === 'disruptive' ? 'refusal-to-work' : null;
}

export function recordIncident(
  state: StationState,
  ledger: FailureEpisodeState,
  episode: FailureEpisode,
  kind: FailureIncident['kind'],
  tileIndex: number
): FailureIncident {
  const incident: FailureIncident = { id: ledger.nextIncidentId++, kind, at: state.now, tileIndex };
  episode.incidents.push(incident);
  return incident;
}

// ---------------------------------------------------------------------------
// Recovery levers
// ---------------------------------------------------------------------------

export const RECOVERY_ACTION_KINDS = [
  'emergency-meals',
  'temporary-lodging',
  'prioritize-repair',
  'compensate',
  'onward-transfer',
  'cancel-contract',
  'close-admissions',
  'security-intervention'
] as const;

export type RecoveryActionKind = typeof RECOVERY_ACTION_KINDS[number];

export interface RecoveryActionRequest {
  kind: RecoveryActionKind;
  /** The episode, cohort ship, or occupant the action targets. */
  episodeId?: number;
  shipId?: number;
  visitorId?: number;
  /** Units of meals or beds requested, where the action takes an amount. */
  amount?: number;
}

export interface RecoveryActionResult {
  ok: boolean;
  /** Why an invalid request was refused. Always set when `ok` is false. */
  reason: string | null;
  /** Credits the caller must spend. Never applied by this module. */
  creditsCost: number;
  /** Economy intents for `sim.ts` to apply through applyEconomyTransaction. */
  economyEvents: EconomyEventInput[];
  /** Episodes this action touched. */
  affectedEpisodeIds: number[];
  /** A short sentence for the world/event feed. */
  summary: string;
}

export const RECOVERY_COSTS = {
  /** Per emergency meal, above the ordinary wholesale price. */
  emergencyMealUnit: 9,
  /** Per guest, per temporary bunk arranged. */
  temporaryLodgingUnit: 14,
  prioritizeRepair: 60,
  /** Per guest compensated. */
  compensateUnit: 18,
  onwardTransfer: 95,
  /** Multiplied by the contract's remaining promised value. */
  cancelPenaltyShare: 0.45,
  closeAdmissions: 0,
  securityIntervention: 30
} as const;

function refuse(kind: RecoveryActionKind, reason: string): RecoveryActionResult {
  return {
    ok: false,
    reason,
    creditsCost: 0,
    economyEvents: [],
    affectedEpisodeIds: [],
    summary: `${kind} refused: ${reason}`
  };
}

/**
 * Decide whether a recovery action is valid and what it costs.
 *
 * Pure: it reads state, it never mutates it. `sim.ts` performs the mutation
 * and the economy write, which keeps every lever testable in isolation and
 * makes the invalid-state check a first-class return value rather than a
 * silent no-op.
 */
export function planRecoveryAction(
  state: StationState,
  ledger: FailureEpisodeState,
  request: RecoveryActionRequest,
  context: {
    /** Prepared meals physically available across the station. */
    availableMeals: number;
    /** Free 1x1 Dorm floor positions that can receive a depicted emergency bunk. */
    eligibleTemporaryBunkTiles: number;
    /** Remaining promised value of the targeted contract, for cancellation. */
    contractRemainingValue: number;
    /** True when a repair/turnaround job for the ship still has work left. */
    repairIncomplete: boolean;
  }
): RecoveryActionResult {
  const episode = request.episodeId === undefined
    ? null
    : ledger.episodes.find((entry) => entry.id === request.episodeId) ?? null;
  const cohort = request.shipId === undefined ? [] : episodesForShip(ledger, request.shipId);
  const targets = episode ? [episode] : cohort;

  const needsOpenEpisode = request.kind !== 'close-admissions';
  if (needsOpenEpisode && targets.length === 0) {
    return refuse(request.kind, 'no open failure episode for that target');
  }
  // One consistent identity. Naming both an episode and a ship that do not
  // belong together is a caller bug, not a request to guess which was meant.
  if (episode && request.shipId !== undefined && episode.shipId !== request.shipId) {
    return refuse(request.kind, 'episode does not belong to that ship');
  }
  if (episode && request.visitorId !== undefined && episode.subjectId !== request.visitorId) {
    return refuse(request.kind, 'episode does not belong to that occupant');
  }
  if (targets.some((entry) => entry.resolvedAt !== null)) {
    return refuse(request.kind, 'episode already resolved');
  }

  const ids = targets.map((entry) => entry.id);
  const already = (kind: RecoveryActionKind): boolean =>
    targets.length > 0 && targets.every((entry) => entry.actionsApplied.includes(kind));

  switch (request.kind) {
    case 'emergency-meals': {
      // Bounded by the cohort: you cannot buy meals for more guests than are
      // actually failing, which is what keeps cost and effect identical.
      const wanted = Math.min(targets.length, Math.max(1, Math.floor(request.amount ?? targets.length)));
      if (context.availableMeals < wanted) {
        // Emergency meals consume or purchase PHYSICAL inventory. If there is
        // none to buy or carry, the action fails rather than inventing food.
        return refuse(request.kind, `only ${context.availableMeals} prepared meals available`);
      }
      if (already('emergency-meals')) return refuse(request.kind, 'emergency meals already served to this cohort');
      const selected = targets.slice(0, wanted);
      const cost = wanted * RECOVERY_COSTS.emergencyMealUnit;
      return {
        ok: true,
        reason: null,
        creditsCost: cost,
        economyEvents: [{
          at: state.now,
          kind: 'supplier-purchase',
          credits: -cost,
          costBasis: cost,
          label: `Emergency meals · ${wanted}`,
          tileIndex: selected[0]?.anchorTile
        }],
        affectedEpisodeIds: selected.map((entry) => entry.id),
        summary: `Served ${wanted} emergency meals`
      };
    }
    case 'temporary-lodging': {
      const wanted = Math.min(targets.length, Math.max(1, Math.floor(request.amount ?? targets.length)));
      if (context.eligibleTemporaryBunkTiles < wanted) {
        // Each unit becomes one depicted 1x1 fixture on free Dorm floor. The
        // count is therefore a placement limit, never hidden bed capacity.
        return refuse(
          request.kind,
          `only ${context.eligibleTemporaryBunkTiles} eligible free Dorm tile(s) for ${wanted} temporary bunk(s)`
        );
      }
      if (already('temporary-lodging')) return refuse(request.kind, 'temporary lodging already arranged for this cohort');
      const selected = targets.slice(0, wanted);
      const cost = wanted * RECOVERY_COSTS.temporaryLodgingUnit;
      return {
        ok: true,
        reason: null,
        creditsCost: cost,
        economyEvents: [{
          at: state.now,
          kind: 'maintenance',
          credits: -cost,
          costBasis: 0,
          label: `Temporary lodging · ${wanted} bunks`,
          tileIndex: selected[0]?.anchorTile
        }],
        affectedEpisodeIds: selected.map((entry) => entry.id),
        summary: `Opened ${wanted} temporary bunks`
      };
    }
    case 'prioritize-repair': {
      if (!context.repairIncomplete) return refuse(request.kind, 'no incomplete repair work to expedite');
      if (already('prioritize-repair')) return refuse(request.kind, 'repair already prioritized');
      return {
        ok: true,
        reason: null,
        creditsCost: RECOVERY_COSTS.prioritizeRepair,
        economyEvents: [{
          at: state.now,
          kind: 'maintenance',
          credits: -RECOVERY_COSTS.prioritizeRepair,
          costBasis: 0,
          label: 'Expedited blocking repair',
          sourceId: request.shipId
        }],
        affectedEpisodeIds: ids,
        summary: 'Prioritized the blocking repair'
      };
    }
    case 'compensate': {
      if (already('compensate')) return refuse(request.kind, 'cohort already compensated');
      const cost = targets.length * RECOVERY_COSTS.compensateUnit;
      return {
        ok: true,
        reason: null,
        creditsCost: cost,
        economyEvents: [{
          at: state.now,
          kind: 'penalty',
          credits: -cost,
          costBasis: 0,
          label: `Cohort compensation · ${targets.length}`,
          sourceId: request.shipId
        }],
        affectedEpisodeIds: ids,
        summary: `Compensated ${targets.length} guests`
      };
    }
    case 'onward-transfer': {
      const cost = RECOVERY_COSTS.onwardTransfer;
      return {
        ok: true,
        reason: null,
        creditsCost: cost,
        economyEvents: [{
          at: state.now,
          kind: 'contract-procurement',
          credits: -cost,
          costBasis: 0,
          label: 'Chartered onward transfer',
          sourceId: request.shipId
        }],
        affectedEpisodeIds: ids,
        summary: 'Chartered an onward transfer'
      };
    }
    case 'cancel-contract': {
      if (request.shipId === undefined) return refuse(request.kind, 'cancellation needs a contract');
      if (context.contractRemainingValue <= 0) {
        return refuse(request.kind, 'contract has no incomplete promised value');
      }
      const penalty = Math.max(
        1,
        Math.round(context.contractRemainingValue * RECOVERY_COSTS.cancelPenaltyShare)
      );
      return {
        ok: true,
        reason: null,
        creditsCost: penalty,
        economyEvents: [{
          at: state.now,
          kind: 'penalty',
          credits: -penalty,
          costBasis: 0,
          label: 'Cancelled failing contract',
          sourceId: request.shipId
        }],
        affectedEpisodeIds: ids,
        summary: `Cancelled contract · ${penalty}c penalty on ${Math.round(context.contractRemainingValue)}c unfinished value · recall started`
      };
    }
    case 'close-admissions': {
      // Affects NEW routine traffic only; accepted commitments are untouched.
      return {
        ok: true,
        reason: null,
        creditsCost: 0,
        economyEvents: [],
        affectedEpisodeIds: ids,
        summary: 'Closed admissions to routine traffic'
      };
    }
    case 'security-intervention': {
      const disruptive = targets.filter((entry) => entry.stage === 'disruptive');
      if (disruptive.length === 0) {
        // Never available below `disruptive`. This is a humanitarian bound, not
        // a balance knob.
        return refuse(request.kind, 'security is only available for disruptive occupants');
      }
      const cost = RECOVERY_COSTS.securityIntervention * disruptive.length;
      return {
        ok: true,
        reason: null,
        creditsCost: cost,
        economyEvents: [{
          at: state.now,
          kind: 'security-recovery',
          credits: -cost,
          costBasis: 0,
          label: `Security intervention · ${disruptive.length}`,
          tileIndex: disruptive[0].anchorTile
        }],
        affectedEpisodeIds: disruptive.map((entry) => entry.id),
        summary: `Security removed ${disruptive.length} disruptive occupant(s)`
      };
    }
  }
}

/** Which resolution a successful action produces, if it closes the episode. */
export function resolutionForAction(kind: RecoveryActionKind): FailureResolution | null {
  switch (kind) {
    case 'onward-transfer': return 'transferred';
    case 'cancel-contract': return 'cancelled';
    case 'security-intervention': return 'removed';
    // Meals, lodging and expedited repair remove the SHORTAGE; the episode then
    // resolves itself as 'served' on the next sync once the need is actually
    // met. Compensation deliberately does not erase an unresolved shortage.
    default: return null;
  }
}
