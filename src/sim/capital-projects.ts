// Optional capital projects are deliberately a pure layer. The simulation
// supplies facts, while UI/save integration owns presentation and persistence.

export const CAPITAL_PROJECT_STATE_VERSION = 1;

export type CapitalProjectId =
  | 'roadside-rest-stop'
  | 'courier-partner'
  | 'fuel-frontier'
  | 'local-bazaar';

export type CapitalProjectFactKey =
  | 'travelersServed'
  | 'mealsServed'
  | 'retailSales'
  | 'freightLockers'
  | 'courierTransfers'
  | 'courierUnitsHandled'
  | 'poweredFuelCouplers'
  | 'fuelPipeTiles'
  | 'refuelsCompleted'
  | 'marketStalls'
  | 'stationRating';

export interface CapitalProjectFacts {
  travelersServed?: number;
  mealsServed?: number;
  retailSales?: number;
  freightLockers?: number;
  courierTransfers?: number;
  courierUnitsHandled?: number;
  poweredFuelCouplers?: number;
  fuelPipeTiles?: number;
  refuelsCompleted?: number;
  marketStalls?: number;
  stationRating?: number;
}

export interface CapitalProjectCondition {
  key: CapitalProjectFactKey;
  label: string;
  target: number;
}

export interface CapitalProjectReward {
  advanceCredits: number;
  completionCredits: number;
  ratingBonus: number;
}

export interface CapitalProjectDefinition {
  id: CapitalProjectId;
  title: string;
  summary: string;
  conditions: readonly CapitalProjectCondition[];
  reward: CapitalProjectReward;
}

export interface ActiveCapitalProject {
  id: CapitalProjectId;
  acceptedAt: number;
}

/**
 * This shape contains only JSON-safe primitives. `completed` doubles as the
 * idempotency ledger for completion awards, so restoring an old save cannot
 * accidentally issue a grant twice.
 */
export interface CapitalProjectsState {
  version: number;
  active: ActiveCapitalProject[];
  completed: CapitalProjectId[];
  advanceAwarded: CapitalProjectId[];
}

export interface CapitalProjectProgressCondition extends CapitalProjectCondition {
  current: number;
  complete: boolean;
}

export interface CapitalProjectProgress {
  id: CapitalProjectId;
  title: string;
  summary: string;
  conditions: CapitalProjectProgressCondition[];
  complete: boolean;
  reward: CapitalProjectReward;
}

export interface CapitalProjectMutation {
  state: CapitalProjectsState;
  creditsAwarded: number;
  ratingAwarded: number;
  activated?: CapitalProjectId;
  completed: CapitalProjectId[];
}

const DEFINITIONS: Record<CapitalProjectId, CapitalProjectDefinition> = {
  'roadside-rest-stop': {
    id: 'roadside-rest-stop',
    title: 'Roadside Rest Stop',
    summary: 'Make this a dependable first stop for travelers.',
    conditions: [
      { key: 'travelersServed', label: 'Serve travelers', target: 12 },
      { key: 'mealsServed', label: 'Sell meals', target: 8 },
      { key: 'retailSales', label: 'Sell travel supplies', target: 6 }
    ],
    reward: { advanceCredits: 65, completionCredits: 240, ratingBonus: 2 }
  },
  'courier-partner': {
    id: 'courier-partner',
    title: 'Courier Partner',
    summary: 'Prove the station can turn small freight quickly and reliably.',
    conditions: [
      { key: 'freightLockers', label: 'Install a freight locker', target: 1 },
      { key: 'courierTransfers', label: 'Complete courier transfers', target: 4 },
      { key: 'courierUnitsHandled', label: 'Handle courier crates', target: 16 }
    ],
    reward: { advanceCredits: 80, completionCredits: 300, ratingBonus: 3 }
  },
  'fuel-frontier': {
    id: 'fuel-frontier',
    title: 'Fuel Frontier',
    summary: 'Build a compact, dependable refueling service.',
    conditions: [
      { key: 'poweredFuelCouplers', label: 'Power fuel couplers', target: 1 },
      { key: 'fuelPipeTiles', label: 'Lay fuel pipe', target: 6 },
      { key: 'refuelsCompleted', label: 'Complete refuels', target: 6 }
    ],
    reward: { advanceCredits: 100, completionCredits: 360, ratingBonus: 3 }
  },
  'local-bazaar': {
    id: 'local-bazaar',
    title: 'Local Bazaar',
    summary: 'Turn passing traffic into a place people choose to spend time.',
    conditions: [
      { key: 'marketStalls', label: 'Install market stalls', target: 2 },
      { key: 'retailSales', label: 'Sell travel supplies', target: 20 },
      { key: 'stationRating', label: 'Reach station rating', target: 20 }
    ],
    reward: { advanceCredits: 75, completionCredits: 320, ratingBonus: 4 }
  }
};

const PROJECT_IDS = Object.keys(DEFINITIONS) as CapitalProjectId[];

function isProjectId(value: unknown): value is CapitalProjectId {
  return typeof value === 'string' && PROJECT_IDS.includes(value as CapitalProjectId);
}

function nonNegativeNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function uniqueProjectIds(values: unknown): CapitalProjectId[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<CapitalProjectId>();
  for (const value of values) {
    if (isProjectId(value)) seen.add(value);
  }
  return [...seen];
}

function cloneState(state: CapitalProjectsState): CapitalProjectsState {
  return {
    version: CAPITAL_PROJECT_STATE_VERSION,
    active: state.active.map((project) => ({ ...project })),
    completed: [...state.completed],
    advanceAwarded: [...state.advanceAwarded]
  };
}

function factValue(facts: CapitalProjectFacts, key: CapitalProjectFactKey): number {
  return nonNegativeNumber(facts[key]);
}

export function createCapitalProjectsState(): CapitalProjectsState {
  return {
    version: CAPITAL_PROJECT_STATE_VERSION,
    active: [],
    completed: [],
    advanceAwarded: []
  };
}

/** Normalizes missing or malformed persisted data without throwing. */
export function hydrateCapitalProjectsState(value: unknown): CapitalProjectsState {
  if (!value || typeof value !== 'object') return createCapitalProjectsState();
  const raw = value as Partial<CapitalProjectsState>;
  const completed = uniqueProjectIds(raw.completed);
  const advanceAwarded = uniqueProjectIds(raw.advanceAwarded);
  const active: ActiveCapitalProject[] = [];
  const seen = new Set<CapitalProjectId>();
  if (Array.isArray(raw.active)) {
    for (const entry of raw.active) {
      if (!entry || typeof entry !== 'object') continue;
      const candidate = entry as Partial<ActiveCapitalProject>;
      if (!isProjectId(candidate.id) || seen.has(candidate.id) || completed.includes(candidate.id)) continue;
      seen.add(candidate.id);
      active.push({ id: candidate.id, acceptedAt: nonNegativeNumber(candidate.acceptedAt) });
      if (active.length === 2) break;
    }
  }
  return { version: CAPITAL_PROJECT_STATE_VERSION, active, completed, advanceAwarded };
}

export function capitalProjectDefinitions(): readonly CapitalProjectDefinition[] {
  return PROJECT_IDS.map((id) => DEFINITIONS[id]);
}

export function capitalProjectDefinition(id: CapitalProjectId): CapitalProjectDefinition {
  return DEFINITIONS[id];
}

export function projectProgress(
  id: CapitalProjectId,
  facts: CapitalProjectFacts
): CapitalProjectProgress {
  const definition = DEFINITIONS[id];
  const conditions = definition.conditions.map((condition) => {
    const current = factValue(facts, condition.key);
    return { ...condition, current, complete: current >= condition.target };
  });
  return {
    id,
    title: definition.title,
    summary: definition.summary,
    conditions,
    complete: conditions.every((condition) => condition.complete),
    reward: definition.reward
  };
}

/** Starts an optional project. A third active project is rejected. */
export function acceptCapitalProject(
  persisted: unknown,
  id: CapitalProjectId,
  acceptedAt: number
): CapitalProjectMutation {
  const state = hydrateCapitalProjectsState(persisted);
  if (state.completed.includes(id) || state.active.some((entry) => entry.id === id) || state.active.length >= 2) {
    return { state, creditsAwarded: 0, ratingAwarded: 0, completed: [] };
  }
  const next = cloneState(state);
  next.active.push({ id, acceptedAt: nonNegativeNumber(acceptedAt) });
  const advanceAlreadyAwarded = next.advanceAwarded.includes(id);
  if (!advanceAlreadyAwarded) next.advanceAwarded.push(id);
  return {
    state: next,
    creditsAwarded: advanceAlreadyAwarded ? 0 : DEFINITIONS[id].reward.advanceCredits,
    ratingAwarded: 0,
    activated: id,
    completed: []
  };
}

/**
 * Converts completed world conditions into awards exactly once. Call this
 * after a simulation fact update; repeated calls with identical facts are
 * intentionally no-ops after the first award.
 */
export function evaluateCapitalProjects(
  persisted: unknown,
  facts: CapitalProjectFacts
): CapitalProjectMutation {
  const state = hydrateCapitalProjectsState(persisted);
  const next = cloneState(state);
  const completed: CapitalProjectId[] = [];
  let creditsAwarded = 0;
  let ratingAwarded = 0;
  next.active = next.active.filter((active) => {
    if (!projectProgress(active.id, facts).complete) return true;
    completed.push(active.id);
    if (!next.completed.includes(active.id)) {
      next.completed.push(active.id);
      creditsAwarded += DEFINITIONS[active.id].reward.completionCredits;
      ratingAwarded += DEFINITIONS[active.id].reward.ratingBonus;
    }
    return false;
  });
  return { state: next, creditsAwarded, ratingAwarded, completed };
}
