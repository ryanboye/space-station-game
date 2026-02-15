import { findPath } from './path';
import {
  type ArrivingShip,
  type CrewIdleReason,
  type CrewPriorityPreset,
  type CrewPrioritySystem,
  type CrewTaskCandidate,
  type CrewPriorityWeights,
  type CriticalCapacityTargets,
  type DockEntity,
  type DockQueueEntry,
  GRID_HEIGHT,
  GRID_WIDTH,
  type LaneProfile,
  type CrewMember,
  type CrewRole,
  type JobStallReason,
  type ShipType,
  type SpaceLane,
  ModuleType,
  type Resident,
  ResidentState,
  type RoomDiagnostic,
  type RoomInspector,
  RoomType,
  type ShipSize,
  TileType,
  type VisitorArchetype,
  type VisitorPreference,
  VisitorState,
  ZoneType,
  clamp,
  fromIndex,
  inBounds,
  isWalkable,
  makeRng,
  toIndex,
  type StationState,
  type Visitor
} from './types';

const BASE_CAPACITY = 30;
const CYCLE_DURATION = 15;
const MAX_SHIPS_PER_CYCLE = 3;
const MAX_OCCUPANTS_PER_TILE = 4;

const CREW_PER_CAFETERIA = 1;
const CREW_PER_KITCHEN = 1;
const CREW_PER_SECURITY = 2;
const CREW_PER_REACTOR = 1;
const CREW_PER_HYGIENE = 1;
const CREW_PER_HYDROPONICS = 1;
const CREW_PER_LIFE_SUPPORT = 1;
const CREW_PER_LOUNGE = 1;
const CREW_PER_MARKET = 1;

const BASE_POWER_SUPPLY = 14;
const POWER_PER_REACTOR = 22;
const SHIP_APPROACH_TIME = 2;
const SHIP_DOCKED_TIME = 2;
const SHIP_DEPART_TIME = 2;
const SHIP_MAX_DOCKED_TIME = 28;
const MAX_DINERS_PER_CAF_TILE = 3;

const MATERIAL_COST: Record<TileType, number> = {
  [TileType.Space]: 0,
  [TileType.Floor]: 2,
  [TileType.Wall]: 3,
  [TileType.Dock]: 10,
  [TileType.Cafeteria]: 2,
  [TileType.Reactor]: 4,
  [TileType.Security]: 3,
  [TileType.Door]: 2
};

const SHIP_MIN_DOCK_AREA: Record<ShipSize, number> = {
  small: 2,
  medium: 4,
  large: 7
};

const SHIP_BASE_PASSENGERS: Record<ShipSize, number> = {
  small: 6,
  medium: 11,
  large: 17
};
const PAYROLL_PERIOD = 30;
const PAYROLL_PER_CREW = 0.32;
const HIRE_COST = 14;
const BLOCKED_REPATH_TICKS = 3;
const BLOCKED_LOCAL_REROUTE_TICKS = 6;
const BLOCKED_FULL_REROUTE_TICKS = 10;
const MAX_RESERVATIONS_PER_TABLE = 4;
const MAX_PENDING_FOOD_JOBS = 10;
const JOB_TTL_SEC = 45;
const JOB_STALE_SEC = 12;
const AIR_DISTRESS_THRESHOLD = 15;
const AIR_CRITICAL_THRESHOLD = 8;
const AIR_DISTRESS_EXPOSURE_SEC = 18;
const AIR_CRITICAL_EXPOSURE_SEC = 38;
const AIR_DEATH_EXPOSURE_SEC = 62;
const AIR_BLOCKED_WARNING_DELAY_SEC = 8;
const DORM_SEEK_ENERGY_THRESHOLD = 55;
const BODY_CLEAR_BATCH = 4;
const BODY_CLEAR_MATERIAL_COST = 6;
const ENABLE_RESIDENTS_NOW = false;
const CREW_REST_ENERGY_THRESHOLD = 42;
const CREW_REST_EXIT_ENERGY_THRESHOLD = 86;
const CREW_REST_CRITICAL_ENERGY_THRESHOLD = 18;
const CREW_REST_EMERGENCY_WAKE_MIN_ENERGY = 30;
const CREW_REST_COOLDOWN_SEC = 12;
const CREW_REST_LOCK_SEC = 10;
const CREW_TASK_LOCK_SEC = 8;
const CREW_SHIFT_BUCKET_COUNT = 3;
const CREW_SHIFT_WINDOW_SEC = 10;
const CREW_MAX_RESTING_RATIO = 0.35;
const CREW_EMERGENCY_WAKE_RATIO = 0.15;
const CREW_CLEAN_HYGIENE_THRESHOLD = 38;
const KITCHEN_CONVERSION_RATE = 0.95;
const CREW_ASSIGNMENT_STICKY_SEC = 10;
const CREW_ASSIGNMENT_HOLD_SEC = 12;
const CREW_ASSIGNMENT_FORCE_REPATH_BLOCKED_TICKS = 6;
const FOOD_CHAIN_LOW_MEAL_STOCK = 45;
const FOOD_CHAIN_LOW_KITCHEN_RAW = 14;
const FOOD_CHAIN_TARGET_MEAL_STOCK = 120;
const FOOD_CHAIN_TARGET_KITCHEN_RAW = 40;
const FOOD_CHAIN_MEAL_HORIZON_SEC = 45;
const ROOM_DEACTIVATE_GRACE_SEC = 2.5;
const VISITOR_PREFERENCE_JITTER = 0.22;
const BUILD_DISTANCE_MULTIPLIER = 0.04;
const DOCK_APPROACH_LENGTH = 4;
const DOCK_QUEUE_MAX_TIME_SEC = 18;
const VISITOR_MIN_STAY_SEC = 4;
const STATION_RATING_START = 70;
const VISITOR_COMFORT_WALK_THRESHOLD = 10;
const VISITOR_WALK_PENALTY_RATE = 0.03;
const LIFE_SUPPORT_AIR_PER_CLUSTER = 1.55;
const PASSIVE_AIR_PER_SEC_AT_100_PRESSURE = 0.45;
const AIR_SAFETY_BUFFER = 0.24;
const ASSIGNMENT_PREEMPT_MULTIPLIER = 1.25;
const ASSIGNMENT_PREEMPT_DELTA = 2;
const ASSIGNMENT_PATH_COST_WEIGHT = 0.14;

const ACTIVATION_DEBOUNCE_ROOMS = new Set<RoomType>([
  RoomType.Cafeteria,
  RoomType.Kitchen,
  RoomType.Hydroponics,
  RoomType.LifeSupport
]);

function randomInt(min: number, max: number, rng: () => number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

const LANES: SpaceLane[] = ['north', 'east', 'south', 'west'];

function laneFromFacing(facing: SpaceLane): SpaceLane {
  return facing;
}

function laneStep(lane: SpaceLane): { dx: number; dy: number } {
  if (lane === 'north') return { dx: 0, dy: -1 };
  if (lane === 'south') return { dx: 0, dy: 1 };
  if (lane === 'east') return { dx: 1, dy: 0 };
  return { dx: -1, dy: 0 };
}

function normalizeTrafficWeights(weights: Record<ShipType, number>): Record<ShipType, number> {
  const total = Math.max(0.0001, weights.tourist + weights.trader);
  return {
    tourist: weights.tourist / total,
    trader: weights.trader / total
  };
}

function generateLaneProfiles(state: StationState): Record<SpaceLane, LaneProfile> {
  const profiles = {} as Record<SpaceLane, LaneProfile>;
  for (const lane of LANES) {
    const tourist = clamp(0.35 + state.rng() * 0.45, 0.2, 0.8);
    const trader = clamp(1 - tourist, 0.2, 0.8);
    profiles[lane] = {
      trafficVolume: clamp(0.6 + state.rng() * 0.8, 0.4, 1.6),
      weights: normalizeTrafficWeights({ tourist, trader })
    };
  }
  return profiles;
}

function pickLaneByTraffic(state: StationState): SpaceLane {
  const total = LANES.reduce((acc, lane) => acc + state.laneProfiles[lane].trafficVolume, 0);
  let cursor = 0;
  const roll = state.rng() * Math.max(0.0001, total);
  for (const lane of LANES) {
    cursor += state.laneProfiles[lane].trafficVolume;
    if (roll <= cursor) return lane;
  }
  return 'north';
}

function pickShipTypeForLane(state: StationState, lane: SpaceLane): ShipType {
  const weights = state.laneProfiles[lane].weights;
  return state.rng() <= weights.tourist ? 'tourist' : 'trader';
}

function shipServicesSatisfied(state: StationState, shipType: ShipType): boolean {
  if (shipType === 'tourist') {
    return state.ops.loungeActive > 0 || state.ops.cafeteriasActive > 0;
  }
  return state.ops.marketActive > 0 || state.ops.cafeteriasActive > 0;
}

function serviceFailureRatingPenalty(
  state: StationState,
  amount: number,
  bucket: 'ratingFromVisitorFailure' | 'ratingFromShipSkip' | 'ratingFromShipTimeout' | 'ratingFromWalkDissatisfaction'
): void {
  state.usageTotals.ratingDelta -= amount;
  state.usageTotals[bucket] += amount;
}

function visitorSuccessRatingBonus(
  state: StationState,
  amount: number,
  reason: 'mealService' | 'leisureService' | 'successfulExit'
): void {
  state.usageTotals.ratingDelta += amount;
  state.usageTotals.ratingFromVisitorSuccessByReason[reason] += amount;
}

function addVisitorFailurePenalty(
  state: StationState,
  amount: number,
  reason: 'noLeisurePath' | 'shipServicesMissing' | 'patienceBail' | 'dockTimeout' | 'trespass'
): void {
  serviceFailureRatingPenalty(state, amount, 'ratingFromVisitorFailure');
  state.usageTotals.ratingFromVisitorFailureByReason[reason] += amount;
}

function tileCenter(index: number, width: number): { x: number; y: number } {
  const p = fromIndex(index, width);
  return { x: p.x + 0.5, y: p.y + 0.5 };
}

function chooseNearestPath(
  state: StationState,
  start: number,
  targets: number[],
  allowRestricted: boolean
): number[] | null {
  let best: number[] | null = null;
  for (const target of targets) {
    const path = findPath(state, start, target, allowRestricted, state.pathOccupancyByTile);
    if (!path) continue;
    if (!best || path.length < best.length) {
      best = path;
    }
  }
  // Fallback: if strict zoning blocks all routes, allow restricted traversal.
  if (!best && !allowRestricted) {
    for (const target of targets) {
      const path = findPath(state, start, target, true, state.pathOccupancyByTile);
      if (!path) continue;
      if (!best || path.length < best.length) {
        best = path;
      }
    }
  }
  return best;
}

function collectTiles(state: StationState, tile: TileType): number[] {
  const out: number[] = [];
  for (let i = 0; i < state.tiles.length; i++) {
    if (state.tiles[i] === tile) out.push(i);
  }
  return out;
}

function collectRooms(state: StationState, room: RoomType): number[] {
  const out: number[] = [];
  for (let i = 0; i < state.rooms.length; i++) {
    if (state.rooms[i] === room && isWalkable(state.tiles[i])) out.push(i);
  }
  return out;
}

function moduleTypeForRoomServiceNode(room: RoomType): ModuleType | null {
  if (room === RoomType.Dorm) return ModuleType.Bed;
  if (room === RoomType.Cafeteria) return ModuleType.Table;
  if (room === RoomType.Kitchen) return ModuleType.Stove;
  if (room === RoomType.Hydroponics) return ModuleType.GrowTray;
  if (room === RoomType.Security) return ModuleType.Terminal;
  return null;
}

export function collectServiceTargets(state: StationState, room: RoomType): number[] {
  const roomTiles = collectRooms(state, room);
  const requiredModule = moduleTypeForRoomServiceNode(room);
  if (!requiredModule) return roomTiles;
  const out: number[] = [];
  for (const tile of roomTiles) {
    if (state.modules[tile] === requiredModule) out.push(tile);
  }
  return out;
}

export function collectQueueTargets(state: StationState, room: RoomType): number[] {
  if (room !== RoomType.Cafeteria) return [];
  const serviceTargets = collectServiceTargets(state, RoomType.Cafeteria);
  if (serviceTargets.length === 0) return [];
  const out = new Set<number>();
  for (const target of serviceTargets) {
    const p = fromIndex(target, state.width);
    const deltas = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ];
    for (const [dx, dy] of deltas) {
      const nx = p.x + dx;
      const ny = p.y + dy;
      if (!inBounds(nx, ny, state.width, state.height)) continue;
      const ni = toIndex(nx, ny, state.width);
      if (!isWalkable(state.tiles[ni])) continue;
      if (state.rooms[ni] === RoomType.Cafeteria) continue;
      out.add(ni);
    }
  }
  return [...out].sort((a, b) => a - b);
}

function collectIdleWalkTiles(state: StationState): number[] {
  const out: number[] = [];
  for (let i = 0; i < state.tiles.length; i++) {
    if (state.tiles[i] !== TileType.Floor) continue;
    if (state.rooms[i] !== RoomType.None) continue;
    out.push(i);
  }
  return out;
}

function isCafeteriaQueueSpot(state: StationState, idx: number): boolean {
  return collectQueueTargets(state, RoomType.Cafeteria).includes(idx);
}

function roomClusters(state: StationState, room: RoomType): number[][] {
  const roomTiles = collectRooms(state, room);
  const remaining = new Set<number>(roomTiles);
  const clusters: number[][] = [];
  while (remaining.size > 0) {
    const seed = remaining.values().next().value as number;
    remaining.delete(seed);
    const queue = [seed];
    const cluster = [seed];
    for (let qi = 0; qi < queue.length; qi++) {
      const idx = queue[qi];
      const p = fromIndex(idx, state.width);
      const deltas = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1]
      ];
      for (const [dx, dy] of deltas) {
        const nx = p.x + dx;
        const ny = p.y + dy;
        if (!inBounds(nx, ny, state.width, state.height)) continue;
        const ni = toIndex(nx, ny, state.width);
        if (!remaining.has(ni)) continue;
        remaining.delete(ni);
        queue.push(ni);
        cluster.push(ni);
      }
    }
    clusters.push(cluster);
  }
  return clusters;
}

function roomClusterAnchors(state: StationState, room: RoomType): number[] {
  const clusters = roomClusters(state, room);
  return clusters
    .map((cluster) => cluster.reduce((best, tile) => (tile < best ? tile : best), cluster[0]))
    .sort((a, b) => a - b);
}

const CREW_SYSTEMS: CrewPrioritySystem[] = [
  'life-support',
  'reactor',
  'hydroponics',
  'kitchen',
  'cafeteria',
  'market',
  'lounge',
  'security',
  'hygiene'
];

const CRITICAL_TRACKED_SYSTEMS: Array<'reactor' | 'life-support' | 'hydroponics' | 'kitchen' | 'cafeteria'> = [
  'reactor',
  'life-support',
  'hydroponics',
  'kitchen',
  'cafeteria'
];

function roleForSystem(system: CrewPrioritySystem): CrewRole {
  if (system === 'security') return 'security';
  if (system === 'reactor' || system === 'hydroponics' || system === 'life-support') return 'reactor';
  return 'cafeteria';
}

function dutyAnchorsForSystem(state: StationState, system: CrewPrioritySystem): number[] {
  if (system === 'reactor') return roomClusterAnchors(state, RoomType.Reactor);
  if (system === 'life-support') return roomClusterAnchors(state, RoomType.LifeSupport);
  if (system === 'hydroponics') return roomClusterAnchors(state, RoomType.Hydroponics);
  if (system === 'kitchen') return roomClusterAnchors(state, RoomType.Kitchen);
  if (system === 'cafeteria') return roomClusterAnchors(state, RoomType.Cafeteria);
  if (system === 'security') return roomClusterAnchors(state, RoomType.Security);
  if (system === 'hygiene') return roomClusterAnchors(state, RoomType.Hygiene);
  if (system === 'lounge') return roomClusterAnchors(state, RoomType.Lounge);
  if (system === 'market') return roomClusterAnchors(state, RoomType.Market);
  return [];
}

function systemRoomType(system: CrewPrioritySystem): RoomType {
  if (system === 'reactor') return RoomType.Reactor;
  if (system === 'life-support') return RoomType.LifeSupport;
  if (system === 'hydroponics') return RoomType.Hydroponics;
  if (system === 'kitchen') return RoomType.Kitchen;
  if (system === 'cafeteria') return RoomType.Cafeteria;
  if (system === 'security') return RoomType.Security;
  if (system === 'hygiene') return RoomType.Hygiene;
  if (system === 'lounge') return RoomType.Lounge;
  return RoomType.Market;
}

function computeCriticalCapacityTargets(state: StationState): CriticalCapacityTargets {
  const reactorTotal = roomClusterAnchors(state, RoomType.Reactor).length;
  const lifeSupportTotal = roomClusterAnchors(state, RoomType.LifeSupport).length;
  const hydroTotal = roomClusterAnchors(state, RoomType.Hydroponics).length;
  const kitchenTotal = roomClusterAnchors(state, RoomType.Kitchen).length;
  const cafeteriaTotal = roomClusterAnchors(state, RoomType.Cafeteria).length;
  const expectedPowerRatio = clamp(
    state.metrics.powerSupply > 0 ? state.metrics.powerSupply / Math.max(1, state.metrics.powerDemand) : 1,
    0.35,
    1
  );
  const airDemand =
    state.residents.length * 0.12 +
    state.visitors.length * 0.05 +
    state.crewMembers.length * 0.08;
  const passiveAir = (state.metrics.pressurizationPct / 100) * PASSIVE_AIR_PER_SEC_AT_100_PRESSURE;
  const requiredReactorPosts = clamp(
    Math.ceil(Math.max(0, state.metrics.powerDemand - BASE_POWER_SUPPLY) / POWER_PER_REACTOR),
    0,
    reactorTotal
  );
  const requiredLifeSupportPosts = clamp(
    Math.ceil(
      Math.max(0, airDemand + AIR_SAFETY_BUFFER - passiveAir) /
        Math.max(0.001, LIFE_SUPPORT_AIR_PER_CLUSTER * expectedPowerRatio)
    ),
    0,
    lifeSupportTotal
  );

  const needsFoodSupport =
    state.metrics.mealStock < FOOD_CHAIN_LOW_MEAL_STOCK ||
    state.metrics.kitchenRawBuffer < FOOD_CHAIN_LOW_KITCHEN_RAW;
  return {
    requiredReactorPosts,
    requiredLifeSupportPosts,
    requiredHydroPosts: needsFoodSupport && hydroTotal > 0 ? 1 : 0,
    requiredKitchenPosts: needsFoodSupport && kitchenTotal > 0 ? 1 : 0,
    requiredCafeteriaPosts: needsFoodSupport && cafeteriaTotal > 0 ? 1 : 0
  };
}

function getDockBays(state: StationState): number[][] {
  const docks = collectTiles(state, TileType.Dock);
  const remaining = new Set<number>(docks);
  const bays: number[][] = [];

  while (remaining.size > 0) {
    const seed = remaining.values().next().value as number;
    remaining.delete(seed);
    const queue = [seed];
    const bay: number[] = [seed];

    for (let qi = 0; qi < queue.length; qi++) {
      const idx = queue[qi];
      const p = fromIndex(idx, state.width);
      const deltas = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1]
      ];
      for (const [dx, dy] of deltas) {
        const nx = p.x + dx;
        const ny = p.y + dy;
        if (!inBounds(nx, ny, state.width, state.height)) continue;
        const ni = toIndex(nx, ny, state.width);
        if (!remaining.has(ni)) continue;
        remaining.delete(ni);
        queue.push(ni);
        bay.push(ni);
      }
    }
    bays.push(bay);
  }

  return bays;
}

function bayOverlapsShip(bayTiles: number[], ship: ArrivingShip): boolean {
  const shipTiles = new Set(ship.bayTiles);
  for (const t of bayTiles) {
    if (shipTiles.has(t)) return true;
  }
  return false;
}

function preferredShipSize(rng: () => number): ShipSize {
  const roll = rng();
  if (roll < 0.5) return 'small';
  if (roll < 0.85) return 'medium';
  return 'large';
}

type ManifestDemand = { cafeteria: number; market: number; lounge: number };

type ArchetypeProfile = {
  taxSensitivity: number;
  spendMultiplier: number;
  patienceMultiplier: number;
  primaryPreference: VisitorPreference;
};

const ARCHETYPE_PROFILES: Record<VisitorArchetype, ArchetypeProfile> = {
  diner: {
    taxSensitivity: 0.75,
    spendMultiplier: 1.12,
    patienceMultiplier: 1.05,
    primaryPreference: 'cafeteria'
  },
  shopper: {
    taxSensitivity: 1.45,
    spendMultiplier: 1.32,
    patienceMultiplier: 0.92,
    primaryPreference: 'market'
  },
  lounger: {
    taxSensitivity: 0.9,
    spendMultiplier: 0.78,
    patienceMultiplier: 1.26,
    primaryPreference: 'lounge'
  },
  rusher: {
    taxSensitivity: 1.18,
    spendMultiplier: 0.86,
    patienceMultiplier: 0.64,
    primaryPreference: 'cafeteria'
  }
};

const CREW_PRIORITY_PRESET_WEIGHTS: Record<'balanced' | 'life-support' | 'food-chain' | 'economy', CrewPriorityWeights> = {
  balanced: {
    'life-support': 9,
    reactor: 9,
    hydroponics: 7,
    kitchen: 7,
    cafeteria: 7,
    market: 5,
    lounge: 5,
    security: 4,
    hygiene: 3
  },
  'life-support': {
    'life-support': 10,
    reactor: 9,
    hydroponics: 7,
    kitchen: 6,
    cafeteria: 5,
    market: 2,
    lounge: 2,
    security: 4,
    hygiene: 3
  },
  'food-chain': {
    'life-support': 9,
    reactor: 8,
    hydroponics: 10,
    kitchen: 10,
    cafeteria: 9,
    market: 3,
    lounge: 3,
    security: 3,
    hygiene: 2
  },
  economy: {
    'life-support': 9,
    reactor: 8,
    hydroponics: 6,
    kitchen: 6,
    cafeteria: 6,
    market: 10,
    lounge: 8,
    security: 4,
    hygiene: 2
  }
};

function cloneCrewPriorityWeights(weights: CrewPriorityWeights): CrewPriorityWeights {
  return {
    'life-support': weights['life-support'],
    reactor: weights.reactor,
    hydroponics: weights.hydroponics,
    kitchen: weights.kitchen,
    cafeteria: weights.cafeteria,
    market: weights.market,
    lounge: weights.lounge,
    security: weights.security,
    hygiene: weights.hygiene
  };
}

function applyCrewPriorityPreset(state: StationState, preset: CrewPriorityPreset): void {
  state.controls.crewPriorityPreset = preset;
  state.controls.crewPriorityWeights = cloneCrewPriorityWeights(CREW_PRIORITY_PRESET_WEIGHTS[preset]);
}

export function getCrewPriorityPresetWeights(preset: CrewPriorityPreset): CrewPriorityWeights {
  return cloneCrewPriorityWeights(CREW_PRIORITY_PRESET_WEIGHTS[preset]);
}

function normalizeDemand(demand: ManifestDemand): ManifestDemand {
  const total = Math.max(0.0001, demand.cafeteria + demand.market + demand.lounge);
  return {
    cafeteria: demand.cafeteria / total,
    market: demand.market / total,
    lounge: demand.lounge / total
  };
}

function generateShipManifest(state: StationState): {
  demand: ManifestDemand;
  mix: Record<VisitorArchetype, number>;
} {
  const base: ManifestDemand = {
    cafeteria: 0.42,
    market: 0.36,
    lounge: 0.22
  };
  const dominant: VisitorPreference[] = ['cafeteria', 'market', 'lounge'];
  const dominantAxis = dominant[randomInt(0, dominant.length - 1, state.rng)];
  const dominantBoost = 0.12 + state.rng() * 0.18;
  const adjusted: ManifestDemand = { ...base };
  if (dominantAxis === 'cafeteria') {
    adjusted.cafeteria += dominantBoost;
    adjusted.market -= dominantBoost * 0.55;
    adjusted.lounge -= dominantBoost * 0.45;
  } else if (dominantAxis === 'market') {
    adjusted.market += dominantBoost;
    adjusted.cafeteria -= dominantBoost * 0.55;
    adjusted.lounge -= dominantBoost * 0.45;
  } else {
    adjusted.lounge += dominantBoost * 0.8;
    adjusted.cafeteria -= dominantBoost * 0.4;
    adjusted.market -= dominantBoost * 0.4;
  }
  adjusted.cafeteria = clamp(adjusted.cafeteria, 0.3, 0.65);
  adjusted.market = clamp(adjusted.market, 0.2, 0.55);
  adjusted.lounge = clamp(adjusted.lounge, 0.1, 0.35);
  const demand = normalizeDemand(adjusted);

  const rusher = clamp(0.08 + state.rng() * 0.1, 0.08, 0.18);
  const remaining = 1 - rusher;
  const weighted = normalizeDemand(demand);
  const mix: Record<VisitorArchetype, number> = {
    diner: weighted.cafeteria * remaining,
    shopper: weighted.market * remaining,
    lounger: weighted.lounge * remaining,
    rusher
  };
  return { demand, mix };
}

function pickArchetypeFromMix(state: StationState, mix: Record<VisitorArchetype, number>): VisitorArchetype {
  const roll = state.rng();
  let cursor = 0;
  const ordered: VisitorArchetype[] = ['diner', 'shopper', 'lounger', 'rusher'];
  for (const archetype of ordered) {
    cursor += Math.max(0, mix[archetype]);
    if (roll <= cursor) return archetype;
  }
  return 'diner';
}

function pickVisitorPrimaryPreference(
  state: StationState,
  archetype: VisitorArchetype,
  manifestDemand: ManifestDemand | null
): VisitorPreference {
  const base = manifestDemand
    ? normalizeDemand(manifestDemand)
    : { cafeteria: 0.42, market: 0.36, lounge: 0.22 };
  const profilePreference = ARCHETYPE_PROFILES[archetype].primaryPreference;
  const weighted = {
    cafeteria: base.cafeteria,
    market: base.market,
    lounge: base.lounge
  };
  if (profilePreference === 'cafeteria') weighted.cafeteria += 0.18;
  if (profilePreference === 'market') weighted.market += 0.18;
  if (profilePreference === 'lounge') weighted.lounge += 0.18;
  weighted.cafeteria = Math.max(0.05, weighted.cafeteria + (state.rng() - 0.5) * VISITOR_PREFERENCE_JITTER);
  weighted.market = Math.max(0.05, weighted.market + (state.rng() - 0.5) * VISITOR_PREFERENCE_JITTER);
  weighted.lounge = Math.max(0.05, weighted.lounge + (state.rng() - 0.5) * VISITOR_PREFERENCE_JITTER);
  const demand = normalizeDemand(weighted);
  const roll = state.rng();
  if (roll <= demand.cafeteria) return 'cafeteria';
  if (roll <= demand.cafeteria + demand.market) return 'market';
  return 'lounge';
}

function shipSizeForBay(area: number, wanted: ShipSize): ShipSize | null {
  const order: ShipSize[] =
    wanted === 'large' ? ['large', 'medium', 'small'] : wanted === 'medium' ? ['medium', 'small'] : ['small'];
  for (const size of order) {
    if (area >= SHIP_MIN_DOCK_AREA[size]) return size;
  }
  return null;
}

type DockPlacementValidation = { valid: boolean; reason: string; approachTiles: number[] };

function maxShipSizeForArea(area: number): ShipSize {
  if (area >= SHIP_MIN_DOCK_AREA.large) return 'large';
  if (area >= SHIP_MIN_DOCK_AREA.medium) return 'medium';
  return 'small';
}

function shipSizesUpTo(maxSize: ShipSize): ShipSize[] {
  if (maxSize === 'small') return ['small'];
  if (maxSize === 'medium') return ['small', 'medium'];
  return ['small', 'medium', 'large'];
}

function dockFacingOutward(state: StationState, tileIndex: number, lane: SpaceLane): boolean {
  const p = fromIndex(tileIndex, state.width);
  if (lane === 'north') return p.y > 0 && state.tiles[toIndex(p.x, p.y - 1, state.width)] === TileType.Space;
  if (lane === 'south') return p.y < state.height - 1 && state.tiles[toIndex(p.x, p.y + 1, state.width)] === TileType.Space;
  if (lane === 'east') return p.x < state.width - 1 && state.tiles[toIndex(p.x + 1, p.y, state.width)] === TileType.Space;
  return p.x > 0 && state.tiles[toIndex(p.x - 1, p.y, state.width)] === TileType.Space;
}

function isOuterHullTile(state: StationState, tileIndex: number): boolean {
  const p = fromIndex(tileIndex, state.width);
  const deltas = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ];
  for (const [dx, dy] of deltas) {
    const nx = p.x + dx;
    const ny = p.y + dy;
    if (!inBounds(nx, ny, state.width, state.height)) return true;
    const ni = toIndex(nx, ny, state.width);
    if (state.tiles[ni] === TileType.Space) return true;
  }
  return false;
}

function adjacentDockTiles(state: StationState, seed: number): number[] {
  const remaining = new Set<number>();
  for (let i = 0; i < state.tiles.length; i++) {
    if (state.tiles[i] === TileType.Dock) remaining.add(i);
  }
  if (!remaining.has(seed)) return [];
  const cluster: number[] = [];
  const queue: number[] = [seed];
  remaining.delete(seed);
  while (queue.length > 0) {
    const idx = queue.shift()!;
    cluster.push(idx);
    const p = fromIndex(idx, state.width);
    const deltas = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ];
    for (const [dx, dy] of deltas) {
      const nx = p.x + dx;
      const ny = p.y + dy;
      if (!inBounds(nx, ny, state.width, state.height)) continue;
      const ni = toIndex(nx, ny, state.width);
      if (!remaining.has(ni)) continue;
      remaining.delete(ni);
      queue.push(ni);
    }
  }
  return cluster;
}

function validateDockPlacementAt(state: StationState, tileIndex: number, facing: SpaceLane): DockPlacementValidation {
  if (state.tiles[tileIndex] === TileType.Space) {
    return { valid: false, reason: 'dock requires built hull tile', approachTiles: [] };
  }
  if (!isOuterHullTile(state, tileIndex)) {
    return { valid: false, reason: 'dock must be on outer hull', approachTiles: [] };
  }
  if (!dockFacingOutward(state, tileIndex, facing)) {
    return { valid: false, reason: 'dock facing is not outward', approachTiles: [] };
  }
  const p = fromIndex(tileIndex, state.width);
  const step = laneStep(facing);
  const approachTiles: number[] = [];
  for (let i = 1; i <= DOCK_APPROACH_LENGTH; i++) {
    const x = p.x + step.dx * i;
    const y = p.y + step.dy * i;
    if (!inBounds(x, y, state.width, state.height)) break;
    const ti = toIndex(x, y, state.width);
    approachTiles.push(ti);
    if (state.tiles[ti] !== TileType.Space) {
      return { valid: false, reason: 'approach lane blocked', approachTiles };
    }
  }
  if (approachTiles.length < 2) {
    return { valid: false, reason: 'approach lane too short', approachTiles };
  }
  return { valid: true, reason: 'ok', approachTiles };
}

function chooseDockFacingForPlacement(state: StationState, tileIndex: number): SpaceLane | null {
  const p = fromIndex(tileIndex, state.width);
  const deltas = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ];
  for (const [dx, dy] of deltas) {
    const nx = p.x + dx;
    const ny = p.y + dy;
    if (!inBounds(nx, ny, state.width, state.height)) continue;
    const ni = toIndex(nx, ny, state.width);
    if (state.tiles[ni] !== TileType.Dock) continue;
    const neighborDock = getDockByTile(state, ni);
    if (neighborDock) return neighborDock.facing;
  }
  for (const lane of LANES) {
    const check = validateDockPlacementAt(state, tileIndex, lane);
    if (check.valid) return lane;
  }
  return null;
}

function validateDockPlacementWithNeighbors(state: StationState, tileIndex: number, facing?: SpaceLane): DockPlacementValidation {
  const resolvedFacing = facing ?? chooseDockFacingForPlacement(state, tileIndex);
  if (!resolvedFacing) {
    return { valid: false, reason: 'no outward approach lane', approachTiles: [] };
  }
  const base = validateDockPlacementAt(state, tileIndex, resolvedFacing);
  if (!base.valid) return base;
  const p = fromIndex(tileIndex, state.width);
  const deltas = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ];
  for (const [dx, dy] of deltas) {
    const nx = p.x + dx;
    const ny = p.y + dy;
    if (!inBounds(nx, ny, state.width, state.height)) continue;
    const ni = toIndex(nx, ny, state.width);
    if (state.tiles[ni] !== TileType.Dock) continue;
    const neighborDock = getDockByTile(state, ni);
    if (neighborDock && neighborDock.facing !== resolvedFacing) {
      return { valid: false, reason: 'facing mismatch with existing dock zone', approachTiles: base.approachTiles };
    }
  }
  return base;
}

function isBuiltTile(tile: TileType): boolean {
  return tile !== TileType.Space;
}

function isConnectedToCore(state: StationState, proposedTiles: TileType[]): boolean {
  const core = state.core.serviceTile;
  if (!isWalkable(proposedTiles[core])) return false;
  const visited = new Set<number>();
  const q: number[] = [core];
  visited.add(core);
  for (let qi = 0; qi < q.length; qi++) {
    const idx = q[qi];
    const p = fromIndex(idx, state.width);
    const deltas = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ];
    for (const [dx, dy] of deltas) {
      const nx = p.x + dx;
      const ny = p.y + dy;
      if (!inBounds(nx, ny, state.width, state.height)) continue;
      const ni = toIndex(nx, ny, state.width);
      if (!isBuiltTile(proposedTiles[ni])) continue;
      if (visited.has(ni)) continue;
      visited.add(ni);
      q.push(ni);
    }
  }
  for (let i = 0; i < proposedTiles.length; i++) {
    if (!isBuiltTile(proposedTiles[i])) continue;
    if (!visited.has(i)) return false;
  }
  return true;
}

function tileDistanceBuildCost(state: StationState, index: number, tile: TileType): number {
  if (tile === TileType.Space) return 0;
  const base = MATERIAL_COST[tile];
  const p = fromIndex(index, state.width);
  const c = fromIndex(state.core.serviceTile, state.width);
  const dist = Math.abs(p.x - c.x) + Math.abs(p.y - c.y);
  return base + dist * BUILD_DISTANCE_MULTIPLIER;
}

function hasAdjacentDoor(state: StationState, tile: number): boolean {
  const p = fromIndex(tile, state.width);
  const deltas = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ];
  for (const [dx, dy] of deltas) {
    const nx = p.x + dx;
    const ny = p.y + dy;
    if (!inBounds(nx, ny, state.width, state.height)) continue;
    const ni = toIndex(nx, ny, state.width);
    if (state.tiles[ni] === TileType.Door) return true;
  }
  return false;
}

function doorQualifiedTilesForRoom(state: StationState, room: RoomType): Set<number> {
  const roomTiles = collectRooms(state, room);
  const unvisited = new Set<number>(roomTiles);
  const qualified = new Set<number>();

  while (unvisited.size > 0) {
    const seed = unvisited.values().next().value as number;
    unvisited.delete(seed);
    const queue = [seed];
    const component: number[] = [seed];
    let hasDoor = hasAdjacentDoor(state, seed);

    for (let qi = 0; qi < queue.length; qi++) {
      const idx = queue[qi];
      const p = fromIndex(idx, state.width);
      const deltas = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1]
      ];
      for (const [dx, dy] of deltas) {
        const nx = p.x + dx;
        const ny = p.y + dy;
        if (!inBounds(nx, ny, state.width, state.height)) continue;
        const ni = toIndex(nx, ny, state.width);
        if (!unvisited.has(ni)) continue;
        if (state.rooms[ni] !== room) continue;
        unvisited.delete(ni);
        queue.push(ni);
        component.push(ni);
        if (!hasDoor && hasAdjacentDoor(state, ni)) hasDoor = true;
      }
    }

    if (hasDoor) {
      for (const tile of component) qualified.add(tile);
    }
  }

  return qualified;
}

function computePressurization(state: StationState): void {
  const n = state.tiles.length;
  const vacuumReachable = new Array<boolean>(n).fill(false);
  const queue: number[] = [];
  const isPressureBarrier = (idx: number): boolean => {
    if (state.tiles[idx] === TileType.Wall) return true;
    if (state.tiles[idx] === TileType.Dock && isOuterHullTile(state, idx)) return true;
    return false;
  };
  const pushIfOpen = (idx: number): void => {
    if (vacuumReachable[idx]) return;
    if (isPressureBarrier(idx)) return;
    vacuumReachable[idx] = true;
    queue.push(idx);
  };

  for (let x = 0; x < state.width; x++) {
    pushIfOpen(toIndex(x, 0, state.width));
    pushIfOpen(toIndex(x, state.height - 1, state.width));
  }
  for (let y = 0; y < state.height; y++) {
    pushIfOpen(toIndex(0, y, state.width));
    pushIfOpen(toIndex(state.width - 1, y, state.width));
  }

  for (let qi = 0; qi < queue.length; qi++) {
    const idx = queue[qi];
    const p = fromIndex(idx, state.width);
    const deltas = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ];
    for (const [dx, dy] of deltas) {
      const nx = p.x + dx;
      const ny = p.y + dy;
      if (!inBounds(nx, ny, state.width, state.height)) continue;
      const ni = toIndex(nx, ny, state.width);
      if (vacuumReachable[ni]) continue;
      if (isPressureBarrier(ni)) continue;
      vacuumReachable[ni] = true;
      queue.push(ni);
    }
  }

  let builtWalkable = 0;
  let leakingWalkable = 0;
  for (let i = 0; i < n; i++) {
    const isBuiltWalkable = state.tiles[i] !== TileType.Space && state.tiles[i] !== TileType.Wall;
    const pressurized = isBuiltWalkable && !vacuumReachable[i];
    state.pressurized[i] = pressurized;
    if (isBuiltWalkable) {
      builtWalkable++;
      if (!pressurized) leakingWalkable++;
    }
  }

  state.metrics.leakingTiles = leakingWalkable;
  state.metrics.pressurizationPct =
    builtWalkable > 0 ? ((builtWalkable - leakingWalkable) / builtWalkable) * 100 : 0;
}

function registerIncident(state: StationState, amount = 1): void {
  state.metrics.incidentsTotal += amount;
  state.incidentHeat += amount;
}

function makeCrewMember(id: number, tileIndex: number, width: number): CrewMember {
  return {
    id,
    ...tileCenter(tileIndex, width),
    tileIndex,
    path: [],
    speed: 2.4,
    role: 'idle',
    targetTile: null,
    retargetAt: 0,
    energy: 100,
    hygiene: 88,
    resting: false,
    cleaning: false,
    activeJobId: null,
    carryingItemType: null,
    carryingAmount: 0,
    blockedTicks: 0,
    idleReason: 'idle_available',
    restSessionActive: false,
    cleanSessionActive: false,
    restLockUntil: 0,
    restCooldownUntil: 0,
    taskLockUntil: 0,
    shiftBucket: id % CREW_SHIFT_BUCKET_COUNT,
    assignmentStickyUntil: 0,
    assignmentHoldUntil: 0,
    lastSystem: null,
    assignedSystem: null,
    retargetCountWindow: 0
  };
}

function makeResident(id: number, tileIndex: number, width: number): Resident {
  return {
    id,
    ...tileCenter(tileIndex, width),
    tileIndex,
    path: [],
    speed: 1.8,
    hunger: 80,
    energy: 85,
    hygiene: 75,
    stress: 10,
    state: ResidentState.Idle,
    actionTimer: 0,
    retargetAt: 0,
    reservedTargetTile: null,
    blockedTicks: 0,
    airExposureSec: 0,
    healthState: 'healthy'
  };
}

function spawnVisitor(state: StationState, dockIndex: number, ship?: ArrivingShip): void {
  const mix = ship?.manifestMix ?? {
    diner: 0.4,
    shopper: 0.3,
    lounger: 0.2,
    rusher: 0.1
  };
  const archetype = pickArchetypeFromMix(state, mix);
  const profile = ARCHETYPE_PROFILES[archetype];
  const primaryPreference = pickVisitorPrimaryPreference(state, archetype, ship?.manifestDemand ?? null);
  const visitor: Visitor = {
    id: state.spawnCounter++,
    ...tileCenter(dockIndex, state.width),
    tileIndex: dockIndex,
    state: primaryPreference === 'cafeteria' ? VisitorState.ToCafeteria : VisitorState.ToLeisure,
    path: [],
    speed: 2.1,
    patience: 0,
    eatTimer: 0,
    trespassed: false,
    servedMeal: false,
    reservedTargetTile: null,
    blockedTicks: 0,
    archetype,
    taxSensitivity: profile.taxSensitivity,
    spendMultiplier: profile.spendMultiplier,
    patienceMultiplier: profile.patienceMultiplier,
    primaryPreference,
    spawnedAt: state.now
  };
  state.visitors.push(visitor);
}

function ensureCrewPool(state: StationState): void {
  if (state.crewMembers.length === state.crew.total) return;

  const docks = collectTiles(state, TileType.Dock);
  const fallbackTiles = docks.length > 0 ? docks : collectTiles(state, TileType.Floor);
  const spawnTile = fallbackTiles[0] ?? 0;

  while (state.crewMembers.length < state.crew.total) {
    state.crewMembers.push(makeCrewMember(state.crewSpawnCounter++, spawnTile, state.width));
  }
  if (state.crewMembers.length > state.crew.total) {
    state.crewMembers.length = state.crew.total;
  }
}

function ensureResidentPopulation(state: StationState): void {
  const docks = collectTiles(state, TileType.Dock);
  const fallbackTiles = docks.length > 0 ? docks : collectTiles(state, TileType.Floor);
  const spawnTile = fallbackTiles[0] ?? 0;

  if (!ENABLE_RESIDENTS_NOW) {
    state.residents.length = 0;
    return;
  }
  const baseCapacity = 0;
  const dormCapacity = activeRoomTargets(state, RoomType.Dorm).length * 2;
  const targetResidents = clamp(baseCapacity + dormCapacity, 0, 40);

  while (
    state.residents.length < targetResidents &&
    state.now - state.lastResidentSpawnAt >= 6 &&
    state.metrics.airQuality >= 35
  ) {
    state.residents.push(makeResident(state.residentSpawnCounter++, spawnTile, state.width));
    state.lastResidentSpawnAt = state.now;
  }
  if (state.residents.length > targetResidents) {
    state.residents.length = targetResidents;
  }
}

function rebuildDockEntities(state: StationState): void {
  const byAnyTile = new Map<number, DockEntity>();
  const next: DockEntity[] = [];
  for (const dock of state.docks) {
    for (const tile of dock.tiles) byAnyTile.set(tile, dock);
  }
  let maxId = state.docks.reduce((best, dock) => Math.max(best, dock.id), 0);
  const visited = new Set<number>();
  for (let i = 0; i < state.tiles.length; i++) {
    if (state.tiles[i] !== TileType.Dock || visited.has(i)) continue;
    const cluster = adjacentDockTiles(state, i).sort((a, b) => a - b);
    for (const tile of cluster) visited.add(tile);
    if (cluster.length === 0) continue;
    const inherited = cluster.map((tile) => byAnyTile.get(tile)).find((d) => d !== undefined);
    const anchorTile = cluster[0];
    const facing = inherited?.facing ?? chooseDockFacingForPlacement(state, anchorTile) ?? 'north';
    const check = validateDockPlacementAt(state, anchorTile, facing);
    const maxSizeByArea = maxShipSizeForArea(cluster.length);
    const allowedShipSizes = inherited?.allowedShipSizes?.filter((s) => shipSizesUpTo(maxSizeByArea).includes(s)) ?? shipSizesUpTo(maxSizeByArea);
    next.push({
      id: inherited?.id ?? ++maxId,
      tiles: cluster,
      anchorTile,
      area: cluster.length,
      facing,
      lane: laneFromFacing(facing),
      approachTiles: check.approachTiles,
      allowedShipTypes: inherited?.allowedShipTypes?.length ? [...inherited.allowedShipTypes] : ['tourist'],
      allowedShipSizes: allowedShipSizes.length > 0 ? allowedShipSizes : ['small'],
      maxSizeByArea,
      occupiedByShipId: inherited?.occupiedByShipId ?? null
    });
  }
  const existingIds = new Set(next.map((d) => d.id));
  state.arrivingShips = state.arrivingShips.filter((ship) => ship.assignedDockId === null || existingIds.has(ship.assignedDockId));
  state.dockQueue = state.dockQueue.filter((entry) =>
    next.some(
      (d) =>
        d.lane === entry.lane &&
        d.allowedShipTypes.includes(entry.shipType) &&
        d.allowedShipSizes.includes(entry.size)
    )
  );
  state.docks = next;
}

function assignCrewJobs(state: StationState): void {
  const jobsBySystem = new Map<CrewPrioritySystem, CrewTaskCandidate[]>();
  const targetBySystem = {
    reactor: dutyAnchorsForSystem(state, 'reactor'),
    'life-support': dutyAnchorsForSystem(state, 'life-support'),
    hydroponics: dutyAnchorsForSystem(state, 'hydroponics'),
    kitchen: dutyAnchorsForSystem(state, 'kitchen'),
    cafeteria: dutyAnchorsForSystem(state, 'cafeteria'),
    security: dutyAnchorsForSystem(state, 'security'),
    hygiene: dutyAnchorsForSystem(state, 'hygiene'),
    lounge: dutyAnchorsForSystem(state, 'lounge'),
    market: dutyAnchorsForSystem(state, 'market')
  } satisfies Record<CrewPrioritySystem, number[]>;
  const slotsPerSystem: Record<CrewPrioritySystem, number> = {
    reactor: CREW_PER_REACTOR,
    'life-support': CREW_PER_LIFE_SUPPORT,
    hydroponics: CREW_PER_HYDROPONICS,
    kitchen: CREW_PER_KITCHEN,
    cafeteria: CREW_PER_CAFETERIA,
    security: CREW_PER_SECURITY,
    hygiene: CREW_PER_HYGIENE,
    lounge: CREW_PER_LOUNGE,
    market: CREW_PER_MARKET
  };

  const criticalTargets = computeCriticalCapacityTargets(state);
  const requiredMinimum = new Map<CrewPrioritySystem, number>([
    ['reactor', criticalTargets.requiredReactorPosts],
    ['life-support', criticalTargets.requiredLifeSupportPosts],
    ['hydroponics', criticalTargets.requiredHydroPosts],
    ['kitchen', criticalTargets.requiredKitchenPosts],
    ['cafeteria', criticalTargets.requiredCafeteriaPosts]
  ]);
  state.metrics.requiredCriticalStaff = {
    reactor: criticalTargets.requiredReactorPosts,
    lifeSupport: criticalTargets.requiredLifeSupportPosts,
    hydroponics: criticalTargets.requiredHydroPosts,
    kitchen: criticalTargets.requiredKitchenPosts,
    cafeteria: criticalTargets.requiredCafeteriaPosts
  };

  for (const system of CREW_SYSTEMS) {
    const anchors = targetBySystem[system];
    const tasks: CrewTaskCandidate[] = [];
    for (const anchor of anchors) {
      for (let i = 0; i < slotsPerSystem[system]; i++) {
        tasks.push({
          id: `${system}:${anchor}:${i}`,
          kind: (requiredMinimum.get(system) ?? 0) > 0 ? 'critical_post' : 'post',
          system,
          tileIndex: anchor,
          score: 0,
          critical: (requiredMinimum.get(system) ?? 0) > 0,
          protectedMinimum: false
        });
      }
    }
    jobsBySystem.set(system, tasks);
  }

  const airEmergency = state.metrics.airQuality < 25 || state.metrics.airBlockedWarningActive;
  const criticalAirEmergency = state.metrics.airQuality < AIR_CRITICAL_THRESHOLD;
  const totalCrew = state.crewMembers.length;
  const emergencyWakeBudget = airEmergency ? Math.ceil(totalCrew * CREW_EMERGENCY_WAKE_RATIO) : 0;
  const lockoutCandidates = state.crewMembers.filter((c) => c.resting && state.now < c.restLockUntil);
  state.metrics.crewPingPongPreventions = airEmergency ? lockoutCandidates.length : 0;
  state.metrics.crewEmergencyWakeBudget = emergencyWakeBudget;
  state.metrics.crewWokenForAir = 0;

  const requiredLifeSupportStaff = requiredMinimum.get('life-support') ?? 0;
  if (airEmergency && requiredLifeSupportStaff > 0) {
    const awakeCrew = state.crewMembers.filter((c) => !c.resting);
    const deficit = Math.max(0, requiredLifeSupportStaff - awakeCrew.length);
    if (deficit > 0 && emergencyWakeBudget > 0) {
      const wakingCandidates = state.crewMembers
        .filter((c) => c.resting)
        .filter((c) => criticalAirEmergency || state.now >= c.restLockUntil)
        .filter((c) => criticalAirEmergency || c.energy >= CREW_REST_EMERGENCY_WAKE_MIN_ENERGY)
        .sort((a, b) => b.energy - a.energy);
      const wakeCount = Math.min(deficit, emergencyWakeBudget, wakingCandidates.length);
      for (let i = 0; i < wakeCount; i++) {
        const crew = wakingCandidates[i];
        crew.resting = false;
        crew.restSessionActive = false;
        crew.cleaning = false;
        crew.cleanSessionActive = false;
        crew.taskLockUntil = state.now + CREW_TASK_LOCK_SEC;
        crew.path = [];
      }
      state.metrics.crewWokenForAir = wakeCount;
    }
  }

  const availableCrew = state.crewMembers.filter((c) => !c.resting).sort((a, b) => a.id - b.id);
  const assignedBySystem = new Map<CrewPrioritySystem, number>();
  const assignedTargetCounts = new Map<string, number>();
  const capacityByTarget = new Map<string, number>();
  const taskByKey = new Map<string, CrewTaskCandidate>();
  for (const system of CREW_SYSTEMS) {
    const tasks = jobsBySystem.get(system) ?? [];
    for (const t of tasks) {
      const key = `${system}:${t.tileIndex}`;
      taskByKey.set(key, t);
      if (!assignedTargetCounts.has(key)) assignedTargetCounts.set(key, 0);
      capacityByTarget.set(key, (capacityByTarget.get(key) ?? 0) + 1);
    }
  }

  const availableCountBySystem = new Map<CrewPrioritySystem, number>();
  for (const system of CREW_SYSTEMS) {
    availableCountBySystem.set(system, (jobsBySystem.get(system) ?? []).length);
  }

  const isCurrentAssignmentValid = (crew: CrewMember): boolean => {
    if (crew.assignedSystem === null || crew.targetTile === null) return false;
    const key = `${crew.assignedSystem}:${crew.targetTile}`;
    if (!taskByKey.has(key)) return false;
    if (state.rooms[crew.targetTile] !== systemRoomType(crew.assignedSystem)) return false;
    return true;
  };

  // Pre-seed counts from valid existing assignments so critical shortfall is computed
  // against current staffing, not against an empty map each tick.
  for (const crew of availableCrew) {
    if (crew.activeJobId !== null) continue;
    if (!isCurrentAssignmentValid(crew)) continue;
    const key = `${crew.assignedSystem}:${crew.targetTile}`;
    const cap = capacityByTarget.get(key) ?? 0;
    const used = assignedTargetCounts.get(key) ?? 0;
    if (used >= cap) continue;
    assignedTargetCounts.set(key, used + 1);
    assignedBySystem.set(crew.assignedSystem!, (assignedBySystem.get(crew.assignedSystem!) ?? 0) + 1);
  }

  const criticalRemaining = new Map<CrewPrioritySystem, number>();
  for (const [system, min] of requiredMinimum.entries()) {
    const remaining = Math.max(0, Math.min(min, availableCountBySystem.get(system) ?? 0) - (assignedBySystem.get(system) ?? 0));
    criticalRemaining.set(system, remaining);
  }

  const anyCriticalShortfall = (): boolean => {
    for (const system of CRITICAL_TRACKED_SYSTEMS) {
      if ((criticalRemaining.get(system as CrewPrioritySystem) ?? 0) > 0) return true;
    }
    return false;
  };

  let assignedCount = 0;
  for (const crew of availableCrew) {
    if (crew.activeJobId !== null) continue;
    const currentSystem = crew.assignedSystem;
    const currentKey =
      currentSystem !== null && crew.targetTile !== null ? `${currentSystem}:${crew.targetTile}` : null;
    const currentValid = isCurrentAssignmentValid(crew);
    const hardShortfall = anyCriticalShortfall();

    // Keep valid assignments sticky by default. Only reconsider non-critical assignments
    // when a critical shortfall exists, or when the current assignment can no longer be used.
    if (currentValid && currentSystem && currentKey) {
      const hasHoldLock =
        state.now < crew.assignmentHoldUntil &&
        crew.blockedTicks < CREW_ASSIGNMENT_FORCE_REPATH_BLOCKED_TICKS &&
        !criticalAirEmergency;
      const hasStickyLock =
        state.now < crew.assignmentStickyUntil &&
        crew.blockedTicks < CREW_ASSIGNMENT_FORCE_REPATH_BLOCKED_TICKS &&
        !airEmergency;
      const inCriticalShortfallSet = (criticalRemaining.get(currentSystem) ?? 0) > 0;
      const shouldKeep =
        hasHoldLock ||
        hasStickyLock ||
        !hardShortfall ||
        inCriticalShortfallSet;

      if (shouldKeep) {
        assignedCount += 1;
        continue;
      }

      // Re-evaluate this crew for potential preemption: temporarily release its count.
      assignedBySystem.set(currentSystem, Math.max(0, (assignedBySystem.get(currentSystem) ?? 1) - 1));
      assignedTargetCounts.set(currentKey, Math.max(0, (assignedTargetCounts.get(currentKey) ?? 1) - 1));
    }

    let best: CrewTaskCandidate | null = null;
    for (const system of CREW_SYSTEMS) {
      const tasks = jobsBySystem.get(system) ?? [];
      if (tasks.length === 0) continue;
      const remainingCritical = criticalRemaining.get(system) ?? 0;
      const systemAssigned = assignedBySystem.get(system) ?? 0;
      const totalSlots = availableCountBySystem.get(system) ?? 0;
      if (systemAssigned >= totalSlots) continue;
      const targetCountsByTile = assignedTargetCounts;
      for (const task of tasks) {
        const key = `${system}:${task.tileIndex}`;
        const taskCount = targetCountsByTile.get(key) ?? 0;
        const taskCapacity = capacityByTarget.get(key) ?? 1;
        if (taskCount >= taskCapacity) continue;
        const path = findPath(state, crew.tileIndex, task.tileIndex, true, state.pathOccupancyByTile);
        if (!path) continue;
        const weight = state.controls.crewPriorityWeights[system];
        const criticalUrgency = remainingCritical > 0 ? 4 : 1;
        const baseUrgency = airEmergency && (system === 'life-support' || system === 'reactor') ? 2.4 : 1;
        const diminishing = 1 / (1 + 0.75 * systemAssigned);
        const score = weight * criticalUrgency * baseUrgency * diminishing - path.length * ASSIGNMENT_PATH_COST_WEIGHT;
        if (!best || score > best.score) {
          best = { ...task, score, critical: remainingCritical > 0, protectedMinimum: remainingCritical > 0 };
        }
      }
    }

    if (!best) {
      const changed = crew.role !== 'idle' || crew.targetTile !== null || crew.lastSystem !== null || crew.assignedSystem !== null;
      crew.role = 'idle';
      crew.targetTile = null;
      crew.lastSystem = null;
      crew.assignedSystem = null;
      if (changed) {
        crew.taskLockUntil = state.now + CREW_TASK_LOCK_SEC;
        crew.path = [];
      }
      continue;
    }

    const oldScore =
      currentSystem !== null
        ? (state.controls.crewPriorityWeights[currentSystem] *
            ((criticalRemaining.get(currentSystem) ?? 0) > 0 ? 4 : 1)) -
          (crew.path.length > 0 ? crew.path.length * ASSIGNMENT_PATH_COST_WEIGHT : 0)
        : -999;
    const canPreempt =
      best.score >= oldScore * ASSIGNMENT_PREEMPT_MULTIPLIER + ASSIGNMENT_PREEMPT_DELTA ||
      (best.critical && (criticalRemaining.get(best.system as CrewPrioritySystem) ?? 0) > 0);
    const hasHoldLock =
      state.now < crew.assignmentHoldUntil &&
      !criticalAirEmergency &&
      crew.blockedTicks < CREW_ASSIGNMENT_FORCE_REPATH_BLOCKED_TICKS;
    const hasStickyLock =
      state.now < crew.assignmentStickyUntil &&
      !airEmergency &&
      crew.blockedTicks < CREW_ASSIGNMENT_FORCE_REPATH_BLOCKED_TICKS;
    if ((hasHoldLock || hasStickyLock) && !canPreempt) {
      if (currentSystem && currentKey && currentValid) {
        assignedBySystem.set(currentSystem, (assignedBySystem.get(currentSystem) ?? 0) + 1);
        assignedTargetCounts.set(currentKey, (assignedTargetCounts.get(currentKey) ?? 0) + 1);
        assignedCount += 1;
        continue;
      }
    }

    const changed = crew.role !== roleForSystem(best.system as CrewPrioritySystem) ||
      crew.targetTile !== best.tileIndex ||
      crew.assignedSystem !== best.system;
    const changedSystem = crew.assignedSystem !== null && crew.assignedSystem !== best.system;
    crew.role = roleForSystem(best.system as CrewPrioritySystem);
    crew.targetTile = best.tileIndex;
    crew.lastSystem = best.system as CrewPrioritySystem;
    crew.assignedSystem = best.system as CrewPrioritySystem;
    assignedBySystem.set(best.system as CrewPrioritySystem, (assignedBySystem.get(best.system as CrewPrioritySystem) ?? 0) + 1);
    assignedTargetCounts.set(`${best.system}:${best.tileIndex}`, (assignedTargetCounts.get(`${best.system}:${best.tileIndex}`) ?? 0) + 1);
    criticalRemaining.set(best.system as CrewPrioritySystem, Math.max(0, (criticalRemaining.get(best.system as CrewPrioritySystem) ?? 0) - 1));
    if (changed) {
      crew.taskLockUntil = state.now + CREW_TASK_LOCK_SEC;
      crew.assignmentStickyUntil = state.now + CREW_ASSIGNMENT_STICKY_SEC;
      crew.assignmentHoldUntil = state.now + CREW_ASSIGNMENT_HOLD_SEC;
      crew.path = [];
      if (changedSystem) {
        crew.retargetCountWindow += 1;
        state.usageTotals.crewRetargets += 1;
      }
    }
    assignedCount += 1;
  }

  for (const c of state.crewMembers) {
    if (c.resting) c.role = 'idle';
  }

  state.crew.assigned = assignedCount;
  state.crew.free = Math.max(0, availableCrew.length - assignedCount);

  state.ops.reactorsTotal = roomClusters(state, RoomType.Reactor).length;
  state.ops.cafeteriasTotal = roomClusters(state, RoomType.Cafeteria).length;
  state.ops.kitchenTotal = roomClusters(state, RoomType.Kitchen).length;
  state.ops.securityTotal = roomClusters(state, RoomType.Security).length;
  state.ops.dormsTotal = roomClusters(state, RoomType.Dorm).length;
  state.ops.hygieneTotal = roomClusters(state, RoomType.Hygiene).length;
  state.ops.hydroponicsTotal = roomClusters(state, RoomType.Hydroponics).length;
  state.ops.lifeSupportTotal = roomClusters(state, RoomType.LifeSupport).length;
  state.ops.loungeTotal = roomClusters(state, RoomType.Lounge).length;
  state.ops.marketTotal = roomClusters(state, RoomType.Market).length;
}

function countStaffAtAssignedTiles(state: StationState): Map<number, number> {
  const counts = new Map<number, number>();
  for (const crew of state.crewMembers) {
    if (crew.resting) continue;
    if (crew.targetTile === null) continue;
    if (crew.tileIndex !== crew.targetTile) continue;
    counts.set(crew.tileIndex, (counts.get(crew.tileIndex) ?? 0) + 1);
  }
  return counts;
}

function operationalClustersForRoom(
  state: StationState,
  room: RoomType,
  requiredStaff: number,
  needsStaff: boolean,
  dt = 0,
  updateDebounce = false
): number[][] {
  const clusters = roomClusters(state, room);
  const staffByTile = countStaffAtAssignedTiles(state);
  const out: number[][] = [];
  const seenKeys = new Set<string>();
  for (const cluster of clusters) {
    const clusterAnchor = cluster.reduce((best, t) => Math.min(best, t), Number.POSITIVE_INFINITY);
    const key = `${room}:${clusterAnchor}`;
    seenKeys.add(key);
    let hasDoor = false;
    let pressurizedCount = 0;
    let staffCount = 0;
    for (const tile of cluster) {
      if (!hasDoor && hasAdjacentDoor(state, tile)) hasDoor = true;
      if (state.pressurized[tile] || room === RoomType.Reactor) pressurizedCount++;
      staffCount += staffByTile.get(tile) ?? 0;
    }
    const pressurizedEnough = pressurizedCount / cluster.length >= 0.7 || room === RoomType.Reactor;
    const hasServiceNode = clusterHasServiceNode(state, room, cluster);
    const satisfiesRequirements =
      hasDoor && pressurizedEnough && hasServiceNode && (!needsStaff || staffCount >= requiredStaff);

    const useDebounce = ACTIVATION_DEBOUNCE_ROOMS.has(room);
    if (!useDebounce) {
      if (satisfiesRequirements) out.push(cluster);
      continue;
    }
    const stateEntry = state.clusterActivationState.get(key) ?? { active: false, failedSec: 0 };
    if (satisfiesRequirements) {
      stateEntry.active = true;
      stateEntry.failedSec = 0;
      state.clusterActivationState.set(key, stateEntry);
      out.push(cluster);
      continue;
    }

    if (stateEntry.active) {
      if (updateDebounce && dt > 0) {
        stateEntry.failedSec += dt;
      }
      if (stateEntry.failedSec < ROOM_DEACTIVATE_GRACE_SEC) {
        state.clusterActivationState.set(key, stateEntry);
        out.push(cluster);
      } else {
        stateEntry.active = false;
        stateEntry.failedSec = 0;
        state.clusterActivationState.set(key, stateEntry);
      }
    } else if (updateDebounce) {
      stateEntry.failedSec = 0;
      state.clusterActivationState.set(key, stateEntry);
    }
  }
  if (updateDebounce) {
    for (const key of [...state.clusterActivationState.keys()]) {
      const [roomLabel] = key.split(':');
      if (roomLabel !== room) continue;
      if (!seenKeys.has(key)) state.clusterActivationState.delete(key);
    }
  }
  return out;
}

function refreshRoomOpsFromCrewPresence(state: StationState, dt = 0, updateDebounce = false): void {
  state.ops.reactorsActive = operationalClustersForRoom(
    state,
    RoomType.Reactor,
    CREW_PER_REACTOR,
    true,
    dt,
    updateDebounce
  ).length;
  state.ops.cafeteriasActive = operationalClustersForRoom(
    state,
    RoomType.Cafeteria,
    CREW_PER_CAFETERIA,
    true,
    dt,
    updateDebounce
  ).length;
  state.ops.kitchenActive = operationalClustersForRoom(
    state,
    RoomType.Kitchen,
    CREW_PER_KITCHEN,
    true,
    dt,
    updateDebounce
  ).length;
  state.ops.securityActive = operationalClustersForRoom(
    state,
    RoomType.Security,
    CREW_PER_SECURITY,
    true,
    dt,
    updateDebounce
  ).length;
  state.ops.hygieneActive = operationalClustersForRoom(
    state,
    RoomType.Hygiene,
    CREW_PER_HYGIENE,
    true,
    dt,
    updateDebounce
  ).length;
  state.ops.hydroponicsActive = operationalClustersForRoom(
    state,
    RoomType.Hydroponics,
    CREW_PER_HYDROPONICS,
    true,
    dt,
    updateDebounce
  ).length;
  state.ops.lifeSupportActive = operationalClustersForRoom(
    state,
    RoomType.LifeSupport,
    CREW_PER_LIFE_SUPPORT,
    true,
    dt,
    updateDebounce
  ).length;
  state.ops.loungeActive = operationalClustersForRoom(state, RoomType.Lounge, CREW_PER_LOUNGE, true, dt, updateDebounce).length;
  state.ops.marketActive = operationalClustersForRoom(state, RoomType.Market, CREW_PER_MARKET, true, dt, updateDebounce).length;
  state.ops.dormsActive = operationalClustersForRoom(state, RoomType.Dorm, 0, false, dt, updateDebounce).length;
}

function updateCriticalStaffTracking(state: StationState, dt: number): void {
  const criticalTargets = computeCriticalCapacityTargets(state);
  const needsAirFloor = state.metrics.airQuality < 35 || state.metrics.airBlockedWarningActive;
  const needsFoodFloor =
    state.metrics.mealStock < FOOD_CHAIN_LOW_MEAL_STOCK || state.metrics.kitchenRawBuffer < FOOD_CHAIN_LOW_KITCHEN_RAW;
  const deficits = {
    reactor: criticalTargets.requiredReactorPosts > 0 && state.ops.reactorsActive < criticalTargets.requiredReactorPosts,
    lifeSupport:
      (needsAirFloor && state.ops.lifeSupportTotal > 0 && state.ops.lifeSupportActive <= 0) ||
      state.ops.lifeSupportActive < criticalTargets.requiredLifeSupportPosts,
    hydroponics: needsFoodFloor && state.ops.hydroponicsTotal > 0 && state.ops.hydroponicsActive <= 0,
    kitchen: needsFoodFloor && state.ops.kitchenTotal > 0 && state.ops.kitchenActive <= 0,
    cafeteria: needsFoodFloor && state.ops.cafeteriasTotal > 0 && state.ops.cafeteriasActive <= 0
  };
  if (deficits.reactor) state.metrics.criticalShortfallSec.reactor += dt;
  if (deficits.lifeSupport) state.metrics.criticalShortfallSec.lifeSupport += dt;
  if (deficits.hydroponics) state.metrics.criticalShortfallSec.hydroponics += dt;
  if (deficits.kitchen) state.metrics.criticalShortfallSec.kitchen += dt;
  if (deficits.cafeteria) state.metrics.criticalShortfallSec.cafeteria += dt;
  if (deficits.lifeSupport) state.usageTotals.criticalUnstaffedSec.lifeSupport += dt;
  if (deficits.hydroponics) state.usageTotals.criticalUnstaffedSec.hydroponics += dt;
  if (deficits.kitchen) state.usageTotals.criticalUnstaffedSec.kitchen += dt;
  if (deficits.reactor && !state.metrics.assignedCriticalStaff.reactor) state.usageTotals.criticalStaffDrops += 1;
  if (deficits.lifeSupport && !state.criticalStaffPrevUnmet.lifeSupport) state.usageTotals.criticalStaffDrops += 1;
  if (deficits.hydroponics && !state.criticalStaffPrevUnmet.hydroponics) state.usageTotals.criticalStaffDrops += 1;
  if (deficits.kitchen && !state.criticalStaffPrevUnmet.kitchen) state.usageTotals.criticalStaffDrops += 1;
  state.criticalStaffPrevUnmet = deficits;
}

function activeRoomTargets(state: StationState, room: RoomType): number[] {
  const flatten = (clusters: number[][]): number[] => clusters.flat();
  const filterActiveServiceTargets = (targets: number[]): number[] => {
    if (!roomRequiresServiceNode(room)) return targets;
    const serviceTargets = new Set(collectServiceTargets(state, room));
    return targets.filter((t) => serviceTargets.has(t));
  };
  if (room === RoomType.Cafeteria) {
    return filterActiveServiceTargets(
      flatten(operationalClustersForRoom(state, RoomType.Cafeteria, CREW_PER_CAFETERIA, true))
    );
  }
  if (room === RoomType.Kitchen) {
    return filterActiveServiceTargets(
      flatten(operationalClustersForRoom(state, RoomType.Kitchen, CREW_PER_KITCHEN, true))
    );
  }
  if (room === RoomType.Reactor) {
    return flatten(operationalClustersForRoom(state, RoomType.Reactor, CREW_PER_REACTOR, true));
  }
  if (room === RoomType.Security) {
    return filterActiveServiceTargets(
      flatten(operationalClustersForRoom(state, RoomType.Security, CREW_PER_SECURITY, true))
    );
  }
  if (room === RoomType.Hygiene) {
    return flatten(operationalClustersForRoom(state, RoomType.Hygiene, CREW_PER_HYGIENE, true));
  }
  if (room === RoomType.Hydroponics) {
    return filterActiveServiceTargets(
      flatten(operationalClustersForRoom(state, RoomType.Hydroponics, CREW_PER_HYDROPONICS, true))
    );
  }
  if (room === RoomType.LifeSupport) {
    return flatten(operationalClustersForRoom(state, RoomType.LifeSupport, CREW_PER_LIFE_SUPPORT, true));
  }
  if (room === RoomType.Lounge) {
    return flatten(operationalClustersForRoom(state, RoomType.Lounge, CREW_PER_LOUNGE, true));
  }
  if (room === RoomType.Market) {
    return flatten(operationalClustersForRoom(state, RoomType.Market, CREW_PER_MARKET, true));
  }
  if (room === RoomType.Dorm) {
    return filterActiveServiceTargets(flatten(operationalClustersForRoom(state, RoomType.Dorm, 0, false)));
  }
  return [];
}

function staffRequiredForRoom(room: RoomType): number {
  if (room === RoomType.Cafeteria) return CREW_PER_CAFETERIA;
  if (room === RoomType.Kitchen) return CREW_PER_KITCHEN;
  if (room === RoomType.Reactor) return CREW_PER_REACTOR;
  if (room === RoomType.Security) return CREW_PER_SECURITY;
  if (room === RoomType.Hygiene) return CREW_PER_HYGIENE;
  if (room === RoomType.Hydroponics) return CREW_PER_HYDROPONICS;
  if (room === RoomType.LifeSupport) return CREW_PER_LIFE_SUPPORT;
  if (room === RoomType.Lounge) return CREW_PER_LOUNGE;
  if (room === RoomType.Market) return CREW_PER_MARKET;
  return 0;
}

function roomRequiresServiceNode(room: RoomType): boolean {
  return (
    room === RoomType.Dorm ||
    room === RoomType.Cafeteria ||
    room === RoomType.Kitchen ||
    room === RoomType.Hydroponics ||
    room === RoomType.Security
  );
}

function clusterHasServiceNode(state: StationState, room: RoomType, cluster: number[]): boolean {
  const moduleType = moduleTypeForRoomServiceNode(room);
  if (!moduleType) return true;
  for (const tile of cluster) {
    if (state.modules[tile] === moduleType) return true;
  }
  return false;
}

export function getRoomDiagnosticAt(state: StationState, tileIndex: number): RoomDiagnostic | null {
  if (tileIndex < 0 || tileIndex >= state.rooms.length) return null;
  const room = state.rooms[tileIndex];
  if (room === RoomType.None) return null;

  const clusters = roomClusters(state, room);
  const cluster = clusters.find((c) => c.includes(tileIndex));
  if (!cluster || cluster.length === 0) return null;

  let hasDoor = false;
  let pressurizedCount = 0;
  for (const tile of cluster) {
    if (!hasDoor && hasAdjacentDoor(state, tile)) hasDoor = true;
    if (state.pressurized[tile] || room === RoomType.Reactor) pressurizedCount++;
  }

  const staffByTile = countStaffAtAssignedTiles(state);
  let staffCount = 0;
  for (const tile of cluster) {
    staffCount += staffByTile.get(tile) ?? 0;
  }
  const assignedToCluster = state.crewMembers.filter(
    (c) => !c.resting && c.targetTile !== null && cluster.includes(c.targetTile)
  ).length;

  const requiredStaff = staffRequiredForRoom(room);
  const pressurizedEnough = room === RoomType.Reactor || pressurizedCount / cluster.length >= 0.7;
  const hasServiceNode = clusterHasServiceNode(state, room, cluster);
  const serviceTargetSet = roomRequiresServiceNode(room) ? new Set(collectServiceTargets(state, room)) : null;
  const serviceTargets = serviceTargetSet ? cluster.filter((tile) => serviceTargetSet.has(tile)) : cluster;

  const starts = collectTiles(state, TileType.Dock);
  if (starts.length === 0) {
    starts.push(...collectTiles(state, TileType.Floor));
  }
  let hasPath = starts.length === 0;
  if (!hasPath) {
    for (const start of starts) {
      const path = chooseNearestPath(state, start, serviceTargets, true);
      if (path !== null) {
        hasPath = true;
        break;
      }
    }
  }

  const reasons: string[] = [];
  if (!hasDoor) reasons.push('missing door');
  if (!pressurizedEnough) reasons.push('not pressurized');
  if (!hasServiceNode) reasons.push('no service node');
  if (requiredStaff > 0 && staffCount < requiredStaff) {
    if (assignedToCluster <= 0) reasons.push('no_assigned_staff');
    else if (staffCount <= 0) reasons.push('staff_in_transit');
    else reasons.push('under_capacity');
  }
  if (!hasPath) reasons.push('no path');

  const warnings: string[] = [];
  if (roomRequiresServiceNode(room) && cluster.length >= 10 && serviceTargets.length <= 2) {
    warnings.push('room too large for service nodes');
  }
  const doorCount = cluster.reduce((acc, tile) => acc + (hasAdjacentDoor(state, tile) ? 1 : 0), 0);
  if (doorCount <= 1 && cluster.length >= 6) {
    warnings.push('single-door bottleneck risk');
  }

  return {
    room,
    active: reasons.length === 0,
    reasons,
    clusterSize: cluster.length,
    warnings
  };
}

export function getRoomInspectorAt(state: StationState, tileIndex: number): RoomInspector | null {
  if (tileIndex < 0 || tileIndex >= state.rooms.length) return null;
  const room = state.rooms[tileIndex];
  if (room === RoomType.None) return null;

  const clusters = roomClusters(state, room);
  const cluster = clusters.find((c) => c.includes(tileIndex));
  if (!cluster || cluster.length === 0) return null;

  let hasDoor = false;
  let pressurizedCount = 0;
  let doorCount = 0;
  for (const tile of cluster) {
    const adjacentDoor = hasAdjacentDoor(state, tile);
    if (adjacentDoor) doorCount += 1;
    if (!hasDoor && adjacentDoor) hasDoor = true;
    if (state.pressurized[tile] || room === RoomType.Reactor) pressurizedCount++;
  }

  const staffByTile = countStaffAtAssignedTiles(state);
  let staffCount = 0;
  for (const tile of cluster) {
    staffCount += staffByTile.get(tile) ?? 0;
  }
  const assignedToCluster = state.crewMembers.filter(
    (c) => !c.resting && c.targetTile !== null && cluster.includes(c.targetTile)
  ).length;

  const requiredStaff = staffRequiredForRoom(room);
  const pressurizedPct = cluster.length > 0 ? (pressurizedCount / cluster.length) * 100 : 0;
  const pressurizedEnough = room === RoomType.Reactor || pressurizedPct >= 70;
  const hasServiceNode = clusterHasServiceNode(state, room, cluster);
  const serviceTargetSet = roomRequiresServiceNode(room) ? new Set(collectServiceTargets(state, room)) : null;
  const serviceTargets = serviceTargetSet ? cluster.filter((tile) => serviceTargetSet.has(tile)) : cluster;
  const serviceNodeCount = roomRequiresServiceNode(room) ? serviceTargets.length : cluster.length;

  const starts = collectTiles(state, TileType.Dock);
  if (starts.length === 0) starts.push(...collectTiles(state, TileType.Floor));
  let hasPath = starts.length === 0;
  if (!hasPath) {
    for (const start of starts) {
      const path = chooseNearestPath(state, start, serviceTargets, true);
      if (path !== null) {
        hasPath = true;
        break;
      }
    }
  }

  const reasons: string[] = [];
  if (!hasDoor) reasons.push('missing door');
  if (!pressurizedEnough) reasons.push('not pressurized');
  if (!hasServiceNode) reasons.push('no service node');
  if (requiredStaff > 0 && staffCount < requiredStaff) {
    if (assignedToCluster <= 0) reasons.push('no_assigned_staff');
    else if (staffCount <= 0) reasons.push('staff_in_transit');
    else reasons.push('under_capacity');
  }
  if (!hasPath) reasons.push('no path');

  const warnings: string[] = [];
  if (roomRequiresServiceNode(room) && cluster.length >= 10 && serviceTargets.length <= 2) {
    warnings.push('room too large for service nodes');
  }
  if (doorCount <= 1 && cluster.length >= 6) {
    warnings.push('single-door bottleneck risk');
  }

  const hints: string[] = [];
  if (room === RoomType.Kitchen) {
    hints.push(`raw buffer ${state.metrics.kitchenRawBuffer.toFixed(1)} | meal +${state.metrics.kitchenMealProdRate.toFixed(1)}/s`);
    if (state.ops.hydroponicsActive <= 0) hints.push('upstream hydroponics inactive');
  }
  if (room === RoomType.Hydroponics) {
    hints.push(`hydro staffed ${state.metrics.hydroponicsStaffed}/${state.metrics.hydroponicsActiveGrowNodes}`);
    if (state.metrics.rawFoodStock < 5) hints.push('low raw-food stock');
  }
  if (room === RoomType.Cafeteria) {
    hints.push(`meal stock ${state.metrics.mealStock.toFixed(1)} | queue ${state.metrics.cafeteriaQueueingCount}`);
  }
  if (room === RoomType.LifeSupport) {
    hints.push(`air +${state.metrics.lifeSupportActiveAirPerSec.toFixed(1)}/s of +${state.metrics.lifeSupportPotentialAirPerSec.toFixed(1)}/s potential`);
  }

  let cafeteriaLoad: RoomInspector['cafeteriaLoad'] | undefined;
  if (room === RoomType.Cafeteria) {
    const clusterSet = new Set(cluster);
    const tableNodes = serviceTargets.length;
    const queueNodes = collectQueueTargets(state, RoomType.Cafeteria).filter((q) => {
      const p = fromIndex(q, state.width);
      const deltas = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1]
      ];
      for (const [dx, dy] of deltas) {
        const nx = p.x + dx;
        const ny = p.y + dy;
        if (!inBounds(nx, ny, state.width, state.height)) continue;
        if (clusterSet.has(toIndex(nx, ny, state.width))) return true;
      }
      return false;
    }).length;
    const queueingVisitors = state.visitors.filter(
      (v) =>
        (v.state === VisitorState.ToCafeteria || v.state === VisitorState.Queueing) &&
        ((v.reservedTargetTile !== null && clusterSet.has(v.reservedTargetTile)) || clusterSet.has(v.tileIndex))
    ).length;
    const eatingVisitors = state.visitors.filter(
      (v) => v.state === VisitorState.Eating && clusterSet.has(v.tileIndex)
    ).length;
    const highPatienceWaiting = state.visitors.filter(
      (v) =>
        (v.state === VisitorState.ToCafeteria || v.state === VisitorState.Queueing) &&
        v.patience > 22 &&
        ((v.reservedTargetTile !== null && clusterSet.has(v.reservedTargetTile)) || clusterSet.has(v.tileIndex))
    ).length;
    const effectiveCapacity = Math.max(1, tableNodes + Math.floor(queueNodes / 2));
    const pressureRatio = queueingVisitors / effectiveCapacity;
    const pressure: 'low' | 'medium' | 'high' = pressureRatio > 1.6 || highPatienceWaiting > 3
      ? 'high'
      : pressureRatio > 0.8 || highPatienceWaiting > 0
        ? 'medium'
        : 'low';
    cafeteriaLoad = {
      tableNodes,
      queueNodes,
      queueingVisitors,
      eatingVisitors,
      highPatienceWaiting,
      pressure
    };
    if (pressure === 'high') warnings.push('cafeteria queue overloaded');
    if (tableNodes <= 1 && queueingVisitors >= 3) warnings.push('too few tables for demand');
    if (queueNodes <= 1 && queueingVisitors >= 2) warnings.push('queue access bottleneck');
  }

  return {
    room,
    active: reasons.length === 0,
    clusterSize: cluster.length,
    doorCount,
    pressurizedPct,
    staffCount,
    requiredStaff,
    hasServiceNode,
    serviceNodeCount,
    hasPath,
    reasons,
    warnings,
    hints,
    cafeteriaLoad
  };
}

function countCafeteriaDemandByTile(state: StationState): Map<number, number> {
  const demand = new Map<number, number>();
  for (const v of state.visitors) {
    if (
      v.state === VisitorState.Eating ||
      v.state === VisitorState.ToCafeteria ||
      v.state === VisitorState.Queueing
    ) {
      const key = v.path.length > 0 ? v.path[v.path.length - 1] : v.tileIndex;
      demand.set(key, (demand.get(key) ?? 0) + 1);
    }
  }
  for (const r of state.residents) {
    if (r.state === ResidentState.Eating || r.state === ResidentState.ToCafeteria) {
      const key = r.path.length > 0 ? r.path[r.path.length - 1] : r.tileIndex;
      demand.set(key, (demand.get(key) ?? 0) + 1);
    }
  }
  return demand;
}

function countReservedServiceTargets(state: StationState): Map<number, number> {
  const counts = new Map<number, number>();
  for (const v of state.visitors) {
    if (v.reservedTargetTile === null) continue;
    counts.set(v.reservedTargetTile, (counts.get(v.reservedTargetTile) ?? 0) + 1);
  }
  for (const r of state.residents) {
    if (r.reservedTargetTile === null) continue;
    counts.set(r.reservedTargetTile, (counts.get(r.reservedTargetTile) ?? 0) + 1);
  }
  return counts;
}

function countQueuePressureByTile(state: StationState): Map<number, number> {
  const pressure = new Map<number, number>();
  for (const v of state.visitors) {
    if (v.state !== VisitorState.ToCafeteria && v.state !== VisitorState.Queueing) continue;
    const key = v.path.length > 0 ? v.path[v.path.length - 1] : v.tileIndex;
    pressure.set(key, (pressure.get(key) ?? 0) + 1);
  }
  for (const r of state.residents) {
    if (r.state !== ResidentState.ToCafeteria) continue;
    const key = r.path.length > 0 ? r.path[r.path.length - 1] : r.tileIndex;
    pressure.set(key, (pressure.get(key) ?? 0) + 1);
  }
  return pressure;
}

function pickLeastLoadedCafeteriaPath(
  state: StationState,
  start: number
): { path: number[]; target: number | null } {
  const cafeterias = collectServiceTargets(state, RoomType.Cafeteria);
  const demandByTile = countCafeteriaDemandByTile(state);
  const reservedByTile = countReservedServiceTargets(state);
  let bestPath: number[] | null = null;
  let bestTarget: number | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  const hasCapacityAtAnyTable = cafeterias.some((t) => (reservedByTile.get(t) ?? 0) < MAX_RESERVATIONS_PER_TABLE);
  for (const target of cafeterias) {
    if (hasCapacityAtAnyTable && (reservedByTile.get(target) ?? 0) >= MAX_RESERVATIONS_PER_TABLE) {
      continue;
    }
    const seated = dinersOnTile(state, target);
    const path = findPath(state, start, target, false, state.pathOccupancyByTile);
    if (!path) continue;
    const demand = demandByTile.get(target) ?? 0;
    const reserved = reservedByTile.get(target) ?? 0;
    const occupancy = state.pathOccupancyByTile.get(target) ?? 0;
    // Prefer less crowded cafeteria tiles, and avoid "door table" clumping.
    const doorwayPenalty = hasAdjacentDoor(state, target) ? 8 : 0;
    const seatedPenalty = seated >= MAX_DINERS_PER_CAF_TILE ? 30 : seated * 10;
    const score = demand * 14 + seatedPenalty + doorwayPenalty + reserved * 6 + occupancy * 3 + path.length;
    if (score < bestScore) {
      bestScore = score;
      bestPath = path;
      bestTarget = target;
    }
  }
  return { path: bestPath ?? [], target: bestTarget };
}

function pickQueueSpotPath(state: StationState, start: number): number[] {
  const spots = collectQueueTargets(state, RoomType.Cafeteria);
  const queuePressure = countQueuePressureByTile(state);
  let bestPath: number[] | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const spot of spots) {
    const path = findPath(state, start, spot, false, state.pathOccupancyByTile);
    if (!path) continue;
    const queued = queuePressure.get(spot) ?? 0;
    const occupancy = state.pathOccupancyByTile.get(spot) ?? 0;
    const score = queued * 9 + occupancy * 4 + path.length;
    if (score < bestScore) {
      bestScore = score;
      bestPath = path;
    }
  }
  return bestPath ?? [];
}

function dinersOnTile(state: StationState, tileIndex: number): number {
  let count = 0;
  for (const v of state.visitors) {
    if (v.state === VisitorState.Eating && v.tileIndex === tileIndex) count++;
  }
  for (const r of state.residents) {
    if (r.state === ResidentState.Eating && r.tileIndex === tileIndex) count++;
  }
  return count;
}

function scheduleCycleArrivals(state: StationState): void {
  const ships = clamp(state.controls.shipsPerCycle, 0, MAX_SHIPS_PER_CYCLE);
  for (let s = 0; s < ships; s++) {
    if (state.docks.length === 0) continue;
    const lanesWithDocks = LANES.filter((lane) => state.docks.some((d) => d.lane === lane));
    if (lanesWithDocks.length === 0) continue;
    const weightedLaneTotal = lanesWithDocks.reduce((acc, lane) => acc + state.laneProfiles[lane].trafficVolume, 0);
    let laneRoll = state.rng() * Math.max(0.0001, weightedLaneTotal);
    let lane = lanesWithDocks[0];
    for (const candidateLane of lanesWithDocks) {
      laneRoll -= state.laneProfiles[candidateLane].trafficVolume;
      if (laneRoll <= 0) {
        lane = candidateLane;
        break;
      }
    }

    const laneDocks = state.docks.filter((d) => d.lane === lane);
    const availableTypes = new Set<ShipType>();
    for (const dock of laneDocks) {
      for (const type of dock.allowedShipTypes) availableTypes.add(type);
    }
    if (availableTypes.size === 0) {
      // No configured types on this lane; skip attempt without rating penalty.
      continue;
    }

    const weights = state.laneProfiles[lane].weights;
    const shipType: ShipType =
      availableTypes.has('tourist') && availableTypes.has('trader')
        ? state.rng() <= weights.tourist
          ? 'tourist'
          : 'trader'
        : availableTypes.has('tourist')
          ? 'tourist'
          : 'trader';

    const preferred = preferredShipSize(state.rng);
    const sizeOrder: ShipSize[] =
      preferred === 'large' ? ['large', 'medium', 'small'] : preferred === 'medium' ? ['medium', 'small', 'large'] : ['small', 'medium', 'large'];
    let sizeWanted: ShipSize | null = null;
    for (const size of sizeOrder) {
      const hasCompatible = laneDocks.some(
        (d) =>
          d.allowedShipTypes.includes(shipType) &&
          d.allowedShipSizes.includes(size) &&
          shipSizeForBay(d.area, size) !== null
      );
      if (hasCompatible) {
        sizeWanted = size;
        break;
      }
    }
    if (!sizeWanted) continue;

    const eligibleDocks = laneDocks.filter(
      (d) =>
        d.allowedShipTypes.includes(shipType) &&
        d.allowedShipSizes.includes(sizeWanted) &&
        shipSizeForBay(d.area, sizeWanted) !== null
    );
    if (eligibleDocks.length === 0) continue;
    const freeDock = eligibleDocks.find((d) => d.occupiedByShipId === null);
    if (!freeDock) {
      const queueEntry: DockQueueEntry = {
        shipId: state.shipSpawnCounter++,
        lane,
        shipType,
        size: sizeWanted,
        queuedAt: state.now,
        timeoutAt: state.now + DOCK_QUEUE_MAX_TIME_SEC
      };
      state.dockQueue.push(queueEntry);
      continue;
    }
    spawnShipAtDock(state, lane, shipType, freeDock.id, undefined, sizeWanted);
  }
}

function updateSpawns(state: StationState): void {
  if (state.pendingSpawns.length === 0) return;
  const keep: typeof state.pendingSpawns = [];
  for (const ps of state.pendingSpawns) {
    if (ps.at <= state.now) {
      spawnVisitor(state, ps.dockIndex);
    } else {
      keep.push(ps);
    }
  }
  state.pendingSpawns = keep;
}

function updateArrivingShips(state: StationState, dt: number): void {
  for (let i = 0; i < state.dockQueue.length; i++) {
    const entry = state.dockQueue[i];
    const eligible = state.docks.filter(
      (d) =>
        d.lane === entry.lane &&
        d.allowedShipTypes.includes(entry.shipType) &&
        d.allowedShipSizes.includes(entry.size) &&
        shipSizeForBay(d.area, entry.size) !== null
    );
    if (eligible.length === 0) {
      // Config changed after queueing; drop silently rather than timing out.
      state.dockQueue.splice(i, 1);
      i--;
      continue;
    }
    const freeDock = eligible.find((d) => d.occupiedByShipId === null);
    if (freeDock) {
      spawnShipAtDock(state, entry.lane, entry.shipType, freeDock.id, entry.shipId, entry.size);
      state.dockQueue.splice(i, 1);
      i--;
      continue;
    }
    if (state.now >= entry.timeoutAt) {
      state.metrics.shipsTimedOutInQueue++;
      serviceFailureRatingPenalty(state, 1.4, 'ratingFromShipTimeout');
      state.dockQueue.splice(i, 1);
      i--;
    }
  }
  const keep: ArrivingShip[] = [];
  for (const ship of state.arrivingShips) {
    ship.stageTime += dt;

    if (ship.stage === 'approach' && ship.stageTime >= SHIP_APPROACH_TIME) {
      ship.stage = 'docked';
      ship.stageTime = 0;
      ship.dockedAt = state.now;
    }

    if (ship.stage === 'docked') {
      const spawnRate = ship.passengersTotal / SHIP_DOCKED_TIME;
      ship.spawnCarry += spawnRate * dt;
      while (ship.spawnCarry >= 1 && ship.passengersSpawned < ship.passengersTotal) {
        const dockTile = ship.bayTiles[0] ?? 0;
        spawnVisitor(state, dockTile, ship);
        ship.passengersSpawned++;
        ship.spawnCarry -= 1;
      }
      if (
        ship.passengersSpawned >= ship.passengersTotal &&
        ship.passengersBoarded >= ship.minimumBoarding
      ) {
        ship.stage = 'depart';
        ship.stageTime = 0;
      }
      const noVisitorsLeft = state.visitors.length === 0;
      if (
        ship.stageTime >= SHIP_MAX_DOCKED_TIME &&
        (ship.passengersSpawned >= ship.passengersTotal || noVisitorsLeft)
      ) {
        ship.stage = 'depart';
        ship.stageTime = 0;
      }
    }

    if (ship.stage === 'depart' && ship.stageTime >= SHIP_DEPART_TIME) {
      if (!shipServicesSatisfied(state, ship.shipType)) {
        addVisitorFailurePenalty(state, 0.25, 'shipServicesMissing');
      }
      if (ship.dockedAt > 0) {
        state.dockedTimeTotal += Math.max(0, state.now - ship.dockedAt);
        state.dockedShipsCompleted += 1;
      }
      if (ship.assignedDockId !== null) {
        const dock = state.docks.find((d) => d.id === ship.assignedDockId);
        if (dock && dock.occupiedByShipId === ship.id) {
          dock.occupiedByShipId = null;
        }
      }
      continue;
    }

    keep.push(ship);
  }
  state.arrivingShips = keep;
}

function tryBoardDockedShipAtTile(state: StationState, dockTile: number): boolean {
  for (const ship of state.arrivingShips) {
    if (ship.stage !== 'docked') continue;
    if (!ship.bayTiles.includes(dockTile)) continue;
    ship.passengersBoarded++;
    return true;
  }
  return false;
}

function spawnShipAtDock(
  state: StationState,
  lane: SpaceLane,
  shipType: ShipType,
  dockId: number,
  forcedShipId?: number,
  forcedSize?: ShipSize
): void {
  const dock = state.docks.find((d) => d.id === dockId);
  if (!dock) return;
  const sizeWanted = forcedSize ?? preferredShipSize(state.rng);
  const size = shipSizeForBay(dock.area, sizeWanted) ?? 'small';
  const passengersTotal = Math.round(SHIP_BASE_PASSENGERS[size] * (0.78 + state.rng() * 0.7));
  const manifest = generateShipManifest(state);
  const shipId = forcedShipId ?? state.shipSpawnCounter++;
  dock.occupiedByShipId = shipId;
  const center = dock.tiles
    .map((tile) => fromIndex(tile, state.width))
    .reduce(
      (acc, pos) => ({ x: acc.x + pos.x, y: acc.y + pos.y }),
      { x: 0, y: 0 }
    );
  const centerX = center.x / Math.max(1, dock.tiles.length) + 0.5;
  const centerY = center.y / Math.max(1, dock.tiles.length) + 0.5;
  state.arrivingShips.push({
    id: shipId,
    size,
    bayTiles: [...dock.tiles],
    bayCenterX: centerX,
    bayCenterY: centerY,
    shipType,
    lane,
    assignedDockId: dockId,
    queueState: forcedShipId ? 'queued' : 'none',
    stage: 'approach',
    stageTime: 0,
    passengersTotal: Math.max(2, passengersTotal),
    passengersSpawned: 0,
    passengersBoarded: 0,
    minimumBoarding: Math.max(2, Math.round(Math.max(2, passengersTotal) * 0.25)),
    spawnCarry: 0,
    dockedAt: 0,
    manifestDemand: manifest.demand,
    manifestMix: manifest.mix
  });
}

function buildOccupancyMap(state: StationState): Map<number, number> {
  const map = new Map<number, number>();
  for (const v of state.visitors) {
    map.set(v.tileIndex, (map.get(v.tileIndex) ?? 0) + 1);
  }
  for (const r of state.residents) {
    map.set(r.tileIndex, (map.get(r.tileIndex) ?? 0) + 1);
  }
  for (const c of state.crewMembers) {
    map.set(c.tileIndex, (map.get(c.tileIndex) ?? 0) + 1);
  }
  return map;
}

type MoveResult = 'moved' | 'blocked' | 'idle';

function moveAlongPath(
  state: StationState,
  actor: { x: number; y: number; tileIndex: number; path: number[]; speed: number },
  dt: number,
  occupancyByTile: Map<number, number>
): MoveResult {
  if (actor.path.length === 0) return 'idle';

  const nextTile = actor.path[0];
  const target = tileCenter(nextTile, state.width);
  const dx = target.x - actor.x;
  const dy = target.y - actor.y;
  const dist = Math.hypot(dx, dy);
  const speedFactor = state.now < state.effects.brownoutUntil ? 0.65 : 1;
  const step = actor.speed * speedFactor * dt;

  if (dist <= step || dist < 0.001) {
    const occupied = occupancyByTile.get(nextTile) ?? 0;
    if (occupied >= MAX_OCCUPANTS_PER_TILE) return 'blocked';
    occupancyByTile.set(actor.tileIndex, Math.max(0, (occupancyByTile.get(actor.tileIndex) ?? 1) - 1));
    occupancyByTile.set(nextTile, occupied + 1);
    actor.x = target.x;
    actor.y = target.y;
    actor.tileIndex = nextTile;
    actor.path.shift();
    return 'moved';
  }

  actor.x += (dx / dist) * step;
  actor.y += (dy / dist) * step;
  return 'moved';
}

function preferredDormTargets(state: StationState): number[] {
  const dorms = activeRoomTargets(state, RoomType.Dorm);
  const restricted = dorms.filter((idx) => state.zones[idx] === ZoneType.Restricted);
  return restricted.length > 0 ? restricted : dorms;
}

function preferredHygieneTargets(state: StationState): number[] {
  return activeRoomTargets(state, RoomType.Hygiene);
}

function rebuildItemNodes(state: StationState): void {
  const previousByTile = new Map<number, (typeof state.itemNodes)[number]>();
  for (const node of state.itemNodes) previousByTile.set(node.tileIndex, node);

  const next: typeof state.itemNodes = [];
  const targets = [
    ...collectServiceTargets(state, RoomType.Hydroponics),
    ...collectServiceTargets(state, RoomType.Cafeteria)
  ];

  for (const tileIndex of targets) {
    const prev = previousByTile.get(tileIndex);
    next.push({
      tileIndex,
      capacity: 8,
      items: prev?.items ?? {}
    });
  }

  state.itemNodes = next;
}

function enqueueTransportJob(
  state: StationState,
  type: 'pickup' | 'deliver',
  itemType: 'rawFood' | 'meal' | 'body',
  amount: number,
  fromTile: number,
  toTile: number
): void {
  state.jobs.push({
    id: state.jobSpawnCounter++,
    type,
    itemType,
    amount,
    fromTile,
    toTile,
    assignedCrewId: null,
    createdAt: state.now,
    expiresAt: state.now + JOB_TTL_SEC,
    state: 'pending',
    pickedUpAmount: 0,
    completedAt: null,
    lastProgressAt: state.now,
    stallReason: 'none',
    stalledSince: undefined
  });
  state.metrics.createdJobs += 1;
}

function markJobStall(state: StationState, job: StationState['jobs'][number], reason: JobStallReason): void {
  if (reason === 'none') {
    job.stallReason = 'none';
    job.stalledSince = undefined;
    return;
  }
  if (job.stallReason !== reason) {
    job.stallReason = reason;
    job.stalledSince = state.now;
  }
}

function createFoodTransportJobs(state: StationState): void {
  const hydroTargets = collectServiceTargets(state, RoomType.Hydroponics);
  const kitchenTargets = collectServiceTargets(state, RoomType.Kitchen);
  if (hydroTargets.length === 0 || kitchenTargets.length === 0) return;
  if (state.metrics.rawFoodStock < 1) return;
  if (
    state.metrics.mealStock >= FOOD_CHAIN_TARGET_MEAL_STOCK &&
    state.metrics.kitchenRawBuffer >= FOOD_CHAIN_TARGET_KITCHEN_RAW
  ) {
    return;
  }
  const mealUse = Math.max(0.01, state.metrics.mealUseRate);
  const projectedMealHorizonSec = state.metrics.mealStock / mealUse;
  if (
    projectedMealHorizonSec > FOOD_CHAIN_MEAL_HORIZON_SEC &&
    state.metrics.kitchenRawBuffer >= FOOD_CHAIN_TARGET_KITCHEN_RAW
  ) {
    return;
  }
  if (state.metrics.kitchenRawBuffer > 90 || state.metrics.mealStock > 220) return;

  const openJobs = state.jobs.filter(
    (j) => j.state === 'pending' || j.state === 'assigned' || j.state === 'in_progress'
  );
  const openFoodJobs = openJobs.filter((j) => j.itemType === 'rawFood');
  if (openFoodJobs.length >= MAX_PENDING_FOOD_JOBS) return;

  const fromTile = hydroTargets[randomInt(0, hydroTargets.length - 1, state.rng)];
  let bestTo = kitchenTargets[0];
  let bestDist = Number.POSITIVE_INFINITY;
  for (const to of kitchenTargets) {
    const path = findPath(state, fromTile, to, false, state.pathOccupancyByTile);
    if (!path) continue;
    if (path.length < bestDist) {
      bestDist = path.length;
      bestTo = to;
    }
  }

  if (!Number.isFinite(bestDist)) return;
  const amount = bestDist <= 8 ? 1.2 : 0.9;
  enqueueTransportJob(state, 'deliver', 'rawFood', amount, fromTile, bestTo);
}

function assignJobsToIdleCrew(state: StationState): void {
  const pendingJobs = state.jobs.filter((j) => j.state === 'pending');
  if (pendingJobs.length === 0) {
    state.metrics.logisticsDispatchSlots = 0;
    state.metrics.logisticsPressure = 0;
    return;
  }
  const airEmergency = state.metrics.airQuality < 25 || state.metrics.airBlockedWarningActive;
  const criticalAirEmergency = state.metrics.airQuality < AIR_CRITICAL_THRESHOLD;
  const needsAirFloor = state.metrics.airQuality < 35 || state.metrics.airBlockedWarningActive;
  const needsFoodFloor =
    state.metrics.mealStock < FOOD_CHAIN_LOW_MEAL_STOCK || state.metrics.kitchenRawBuffer < FOOD_CHAIN_LOW_KITCHEN_RAW;
  const protectedMinimumBySystem = new Map<CrewPrioritySystem, number>();
  const setProtectedMinimum = (system: CrewPrioritySystem, min: number): void => {
    if (min <= 0) return;
    protectedMinimumBySystem.set(system, Math.max(protectedMinimumBySystem.get(system) ?? 0, min));
  };
  if (needsAirFloor && roomClusterAnchors(state, RoomType.LifeSupport).length > 0) {
    setProtectedMinimum('life-support', 1);
  }
  if (state.metrics.powerDemand > state.metrics.powerSupply && roomClusterAnchors(state, RoomType.Reactor).length > 0) {
    setProtectedMinimum('reactor', 1);
  }
  if (needsFoodFloor) {
    if (collectServiceTargets(state, RoomType.Hydroponics).length > 0) setProtectedMinimum('hydroponics', 1);
    if (roomClusterAnchors(state, RoomType.Kitchen).length > 0) setProtectedMinimum('kitchen', 1);
    if (collectServiceTargets(state, RoomType.Cafeteria).length > 0) setProtectedMinimum('cafeteria', 1);
  }

  const nonRestingCrew = state.crewMembers.filter((c) => !c.resting);
  const assignedBySystem = new Map<CrewPrioritySystem, number>();
  for (const crew of nonRestingCrew) {
    if (crew.activeJobId !== null) continue;
    if (!crew.assignedSystem) continue;
    assignedBySystem.set(crew.assignedSystem, (assignedBySystem.get(crew.assignedSystem) ?? 0) + 1);
  }
  const activeLogisticsCrew = nonRestingCrew.filter((c) => c.activeJobId !== null).length;
  const pendingPressure = clamp(pendingJobs.length / 6, 0, 1);
  const foodPressure = clamp(
    Math.max(
      (FOOD_CHAIN_LOW_MEAL_STOCK - state.metrics.mealStock) / Math.max(1, FOOD_CHAIN_LOW_MEAL_STOCK),
      (FOOD_CHAIN_LOW_KITCHEN_RAW - state.metrics.kitchenRawBuffer) / Math.max(1, FOOD_CHAIN_LOW_KITCHEN_RAW)
    ),
    0,
    1
  );
  const logisticsPressure = Math.max(pendingPressure, foodPressure);
  let maxLogisticsCrew = Math.ceil(nonRestingCrew.length * (0.12 + logisticsPressure * 0.5));
  if (needsFoodFloor) {
    const foodFloorHaulers = nonRestingCrew.length >= 6 ? 2 : 1;
    maxLogisticsCrew = Math.max(maxLogisticsCrew, foodFloorHaulers);
  }
  if (airEmergency) {
    const emergencyCap = Math.max(1, Math.floor(nonRestingCrew.length * (criticalAirEmergency ? 0.22 : 0.35)));
    maxLogisticsCrew = Math.min(maxLogisticsCrew, emergencyCap);
  }
  const dispatchSlots = Math.max(0, maxLogisticsCrew - activeLogisticsCrew);
  state.metrics.logisticsDispatchSlots = dispatchSlots;
  state.metrics.logisticsPressure = logisticsPressure;
  if (dispatchSlots <= 0) return;

  const candidates = state.crewMembers
    .filter((crew) => !crew.resting && crew.activeJobId === null)
    .filter((crew) => {
      if (crew.role === 'idle') return true;
      if (crew.energy <= CREW_REST_ENERGY_THRESHOLD + 8) return false;
      if (logisticsPressure < 0.55) return false;
      if (crew.assignedSystem === null) return true;
      const requiredMinimum = protectedMinimumBySystem.get(crew.assignedSystem) ?? 0;
      const currentlyAssigned = assignedBySystem.get(crew.assignedSystem) ?? 0;
      if (requiredMinimum > 0 && currentlyAssigned <= requiredMinimum) return false;
      if (
        state.now < crew.assignmentHoldUntil &&
        crew.blockedTicks < CREW_ASSIGNMENT_FORCE_REPATH_BLOCKED_TICKS &&
        logisticsPressure < 0.65 &&
        !criticalAirEmergency
      ) {
        return false;
      }
      if (
        state.now < crew.assignmentStickyUntil &&
        crew.blockedTicks < CREW_ASSIGNMENT_FORCE_REPATH_BLOCKED_TICKS &&
        logisticsPressure < 0.65 &&
        !airEmergency
      ) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      const aIdle = a.role === 'idle' ? 0 : 1;
      const bIdle = b.role === 'idle' ? 0 : 1;
      if (aIdle !== bIdle) return aIdle - bIdle;
      const aw = a.assignedSystem ? state.controls.crewPriorityWeights[a.assignedSystem] : 0;
      const bw = b.assignedSystem ? state.controls.crewPriorityWeights[b.assignedSystem] : 0;
      if (aw !== bw) return aw - bw;
      return a.id - b.id;
    });

  let assignedNow = 0;
  for (const crew of candidates) {
    if (assignedNow >= dispatchSlots) break;
    let bestJob: (typeof pendingJobs)[number] | null = null;
    let bestLen = Number.POSITIVE_INFINITY;
    for (const job of pendingJobs) {
      if (job.state !== 'pending') continue;
      const path = findPath(state, crew.tileIndex, job.fromTile, true, state.pathOccupancyByTile);
      if (!path) continue;
      if (path.length < bestLen) {
        bestLen = path.length;
        bestJob = job;
      }
    }
    if (!bestJob) continue;

    if (crew.role !== 'idle' || crew.targetTile !== null || crew.assignedSystem !== null) {
      if (crew.assignedSystem) {
        assignedBySystem.set(crew.assignedSystem, Math.max(0, (assignedBySystem.get(crew.assignedSystem) ?? 1) - 1));
      }
      crew.role = 'idle';
      crew.targetTile = null;
      crew.lastSystem = null;
      crew.assignedSystem = null;
      crew.assignmentHoldUntil = 0;
      crew.assignmentStickyUntil = 0;
    }

    bestJob.state = 'assigned';
    bestJob.assignedCrewId = crew.id;
    bestJob.lastProgressAt = state.now;
    markJobStall(state, bestJob, 'none');
    crew.activeJobId = bestJob.id;
    crew.path = findPath(state, crew.tileIndex, bestJob.fromTile, true, state.pathOccupancyByTile) ?? [];
    if (crew.path.length === 0 && crew.tileIndex !== bestJob.fromTile) {
      markJobStall(state, bestJob, 'stalled_unreachable_source');
    }
    assignedNow += 1;
  }
}

function expireJobs(state: StationState): void {
  for (const job of state.jobs) {
    if (job.state === 'done' || job.state === 'expired') continue;
    if (state.now <= job.expiresAt) continue;
    job.state = 'expired';
    state.metrics.expiredJobs += 1;
    if (job.assignedCrewId !== null) {
      const crew = state.crewMembers.find((c) => c.id === job.assignedCrewId);
      if (crew) {
        crew.activeJobId = null;
        crew.carryingItemType = null;
        crew.carryingAmount = 0;
      }
    }
  }
}

function requeueStalledJobs(state: StationState): void {
  for (const job of state.jobs) {
    if (job.state !== 'assigned' && job.state !== 'in_progress') continue;
    if (state.now - job.lastProgressAt < JOB_STALE_SEC) continue;
    job.state = 'pending';
    job.assignedCrewId = null;
    job.expiresAt = state.now + JOB_TTL_SEC;
    job.lastProgressAt = state.now;
    markJobStall(state, job, 'none');
  }
}

function refreshJobMetrics(state: StationState): void {
  let pending = 0;
  let assigned = 0;
  let done = 0;
  const ages: number[] = [];
  const backlogByType = new Map<string, number>();
  for (const job of state.jobs) {
    if (job.state === 'pending') {
      pending++;
      backlogByType.set(job.type, (backlogByType.get(job.type) ?? 0) + 1);
      ages.push(Math.max(0, state.now - job.createdAt));
    } else if (job.state === 'assigned' || job.state === 'in_progress') {
      assigned++;
      ages.push(Math.max(0, state.now - job.createdAt));
    } else if (job.state === 'done') {
      done++;
    }
  }
  let oldestPendingAgeSec = 0;
  const stalledByReason: Record<JobStallReason, number> = {
    none: 0,
    stalled_path_blocked: 0,
    stalled_unreachable_source: 0,
    stalled_unreachable_dropoff: 0,
    stalled_no_supply: 0
  };
  for (const job of state.jobs) {
    if (job.state === 'pending') {
      oldestPendingAgeSec = Math.max(oldestPendingAgeSec, Math.max(0, state.now - job.createdAt));
    }
    if (job.state === 'pending' || job.state === 'assigned' || job.state === 'in_progress') {
      stalledByReason[job.stallReason ?? 'none']++;
    }
  }
  let topBacklogType: typeof state.metrics.topBacklogType = 'none';
  let topBacklogCount = 0;
  for (const [type, count] of backlogByType.entries()) {
    if (count > topBacklogCount) {
      topBacklogCount = count;
      topBacklogType = type as typeof state.metrics.topBacklogType;
    }
  }
  state.metrics.pendingJobs = pending;
  state.metrics.assignedJobs = assigned;
  state.metrics.completedJobs = done;
  state.metrics.avgJobAgeSec = ages.length > 0 ? ages.reduce((a, b) => a + b, 0) / ages.length : 0;
  state.metrics.topBacklogType = topBacklogType;
  state.metrics.oldestPendingJobAgeSec = oldestPendingAgeSec;
  state.metrics.stalledJobs = stalledByReason.stalled_path_blocked +
    stalledByReason.stalled_unreachable_source +
    stalledByReason.stalled_unreachable_dropoff +
    stalledByReason.stalled_no_supply;
  state.metrics.stalledJobsByReason = stalledByReason;
}

function updateCrewLogic(state: StationState, dt: number, occupancyByTile: Map<number, number>): void {
  const idleTargets = collectIdleWalkTiles(state);
  const hasPendingJobs = state.jobs.some((j) => j.state === 'pending');
  const airEmergency = state.metrics.airQuality < 25 || state.metrics.airBlockedWarningActive;
  const criticalAirEmergency = state.metrics.airQuality < AIR_CRITICAL_THRESHOLD;
  const totalCrew = Math.max(1, state.crewMembers.length);
  const maxResting = Math.max(1, Math.ceil(totalCrew * CREW_MAX_RESTING_RATIO));
  let currentResting = state.crewMembers.filter((c) => c.resting).length;
  const shiftBucketNow = Math.floor(state.now / CREW_SHIFT_WINDOW_SEC) % CREW_SHIFT_BUCKET_COUNT;
  state.metrics.crewRestCap = maxResting;
  state.metrics.crewRestingNow = currentResting;
  const moveCrew = (crew: CrewMember): MoveResult => {
    const fatiguePenalty =
      crew.energy < 25 || crew.hygiene < 25 ? 0.58 : crew.energy < 50 || crew.hygiene < 50 ? 0.78 : 1;
    const prevSpeed = crew.speed;
    crew.speed = prevSpeed * fatiguePenalty;
    const result = moveAlongPath(state, crew, dt, occupancyByTile);
    crew.speed = prevSpeed;
    return result;
  };
  for (const crew of state.crewMembers) {
    crew.idleReason = 'idle_available';
    crew.hygiene = clamp(crew.hygiene - dt * 0.2, 0, 100);
    if (airEmergency) {
      if (crew.cleaning) {
        crew.cleaning = false;
        crew.cleanSessionActive = false;
        crew.path = [];
      }
      const canInterruptRest = criticalAirEmergency || state.now >= crew.restLockUntil;
      if (crew.resting && crew.energy > 35 && canInterruptRest) {
        crew.resting = false;
        crew.restSessionActive = false;
        crew.taskLockUntil = state.now + CREW_TASK_LOCK_SEC;
        crew.assignmentHoldUntil = 0;
        crew.path = [];
        currentResting = Math.max(0, currentResting - 1);
        state.metrics.crewRestingNow = currentResting;
      }
    }
    if (!crew.resting) {
      crew.energy = clamp(crew.energy - dt * 0.42, 0, 100);
      const needsCriticalRest = crew.energy < CREW_REST_CRITICAL_ENERGY_THRESHOLD;
      const shiftMatches = crew.shiftBucket === shiftBucketNow;
      const belowRestCap = currentResting < state.metrics.crewRestCap;
      const canRestByShift = needsCriticalRest || (belowRestCap && shiftMatches);
      const cooldownReady = state.now >= crew.restCooldownUntil && state.now >= crew.taskLockUntil;
      const shouldRest =
        crew.energy < CREW_REST_ENERGY_THRESHOLD &&
        cooldownReady &&
        canRestByShift &&
        (!airEmergency || needsCriticalRest);
      if (shouldRest) {
        crew.resting = true;
        crew.restSessionActive = false;
        crew.restLockUntil = state.now + CREW_REST_LOCK_SEC;
        crew.role = 'idle';
        crew.targetTile = null;
        crew.lastSystem = null;
        crew.assignedSystem = null;
        crew.assignmentHoldUntil = 0;
        crew.path = [];
        crew.idleReason = 'idle_resting';
        crew.cleaning = false;
        currentResting += 1;
        state.metrics.crewRestingNow = currentResting;
      } else if (crew.hygiene < CREW_CLEAN_HYGIENE_THRESHOLD) {
        const hygieneTargets = preferredHygieneTargets(state);
        if (hygieneTargets.length > 0 && !airEmergency) {
          crew.cleaning = true;
          crew.cleanSessionActive = false;
          crew.role = 'idle';
          crew.targetTile = null;
          crew.lastSystem = null;
          crew.assignedSystem = null;
          crew.assignmentHoldUntil = 0;
          crew.path = [];
        }
      }
    }

    if (crew.cleaning && !crew.resting) {
      const hygieneTargets = preferredHygieneTargets(state);
      if (hygieneTargets.length === 0) {
        crew.cleaning = false;
        crew.cleanSessionActive = false;
      }
    }
    if (crew.cleaning && !crew.resting) {
      const hygieneTargets = preferredHygieneTargets(state);
      if (hygieneTargets.length > 0 && state.rooms[crew.tileIndex] !== RoomType.Hygiene) {
        if (crew.path.length === 0) {
          crew.path = chooseNearestPath(state, crew.tileIndex, hygieneTargets, false) ?? [];
        }
        const moveResult = moveCrew(crew);
        if (moveResult === 'blocked') {
          crew.blockedTicks = Math.min(crew.blockedTicks + 1, 9999);
          crew.idleReason = 'idle_no_path';
        } else if (moveResult === 'moved') {
          crew.blockedTicks = 0;
        }
      } else if (state.rooms[crew.tileIndex] === RoomType.Hygiene) {
        if (!crew.cleanSessionActive) {
          crew.cleanSessionActive = true;
          state.usageTotals.hygiene += 1;
        }
        crew.hygiene = clamp(crew.hygiene + dt * 24, 0, 100);
      } else {
        crew.hygiene = clamp(crew.hygiene + dt * 4, 0, 100);
      }
      if (crew.hygiene >= 90) {
        crew.cleaning = false;
        crew.cleanSessionActive = false;
        crew.path = [];
      }
      continue;
    }

    if (crew.resting) {
      crew.idleReason = 'idle_resting';
      const dormTargets = preferredDormTargets(state);
      if (dormTargets.length > 0 && state.rooms[crew.tileIndex] !== RoomType.Dorm) {
        if (crew.path.length === 0) {
          crew.path = chooseNearestPath(state, crew.tileIndex, dormTargets, false) ?? [];
          if (crew.path.length === 0) {
            crew.idleReason = 'idle_no_path';
            crew.blockedTicks = Math.min(crew.blockedTicks + 1, 9999);
          }
        }
        const moveResult = moveCrew(crew);
        if (moveResult === 'blocked') {
          crew.blockedTicks = Math.min(crew.blockedTicks + 1, 9999);
          crew.idleReason = 'idle_no_path';
        } else if (moveResult === 'moved') {
          crew.blockedTicks = 0;
        }
      } else if (state.rooms[crew.tileIndex] === RoomType.Dorm) {
        if (!crew.restSessionActive) {
          crew.restSessionActive = true;
          state.usageTotals.dorm += 1;
        }
        crew.energy = clamp(crew.energy + dt * 22, 0, 100);
      } else {
        crew.energy = clamp(crew.energy + dt * 1.2, 0, 100);
      }
      if (crew.energy >= CREW_REST_EXIT_ENERGY_THRESHOLD) {
        crew.resting = false;
        crew.restSessionActive = false;
        crew.restCooldownUntil = state.now + CREW_REST_COOLDOWN_SEC;
        crew.path = [];
        crew.targetTile = null;
        crew.lastSystem = null;
        crew.assignedSystem = null;
        crew.assignmentHoldUntil = 0;
        crew.retargetAt = 0;
        currentResting = Math.max(0, currentResting - 1);
        state.metrics.crewRestingNow = currentResting;
      }
      continue;
    }

    if (crew.activeJobId !== null) {
      const job = state.jobs.find((j) => j.id === crew.activeJobId);
      if (!job || job.state === 'done' || job.state === 'expired') {
        crew.activeJobId = null;
        crew.carryingItemType = null;
        crew.carryingAmount = 0;
        crew.path = [];
      } else {
        const targetTile = crew.carryingAmount > 0 ? job.toTile : job.fromTile;
        if (crew.tileIndex === targetTile) {
          if (crew.carryingAmount <= 0) {
            const pickup = Math.min(job.amount, state.metrics.rawFoodStock);
            if (pickup <= 0) {
              markJobStall(state, job, 'stalled_no_supply');
              job.state = 'pending';
              job.assignedCrewId = null;
              job.expiresAt = state.now + JOB_TTL_SEC;
              job.lastProgressAt = state.now;
              crew.activeJobId = null;
              crew.path = [];
            } else {
              state.metrics.rawFoodStock = clamp(state.metrics.rawFoodStock - pickup, 0, 260);
              crew.carryingItemType = job.itemType;
              crew.carryingAmount = pickup;
              job.pickedUpAmount = pickup;
              job.state = 'in_progress';
              job.lastProgressAt = state.now;
               markJobStall(state, job, 'none');
              crew.path = [];
            }
          } else {
            if (job.itemType === 'rawFood') {
              state.metrics.kitchenRawBuffer = clamp(state.metrics.kitchenRawBuffer + crew.carryingAmount, 0, 260);
            }
            job.state = 'done';
            job.completedAt = state.now;
            job.lastProgressAt = state.now;
            markJobStall(state, job, 'none');
            state.metrics.deliveryLatencySec =
              state.metrics.completedJobs > 0
                ? (state.metrics.deliveryLatencySec * state.metrics.completedJobs + (state.now - job.createdAt)) /
                  (state.metrics.completedJobs + 1)
                : state.now - job.createdAt;
            crew.activeJobId = null;
            crew.carryingItemType = null;
            crew.carryingAmount = 0;
            crew.path = [];
          }
        } else {
          if (crew.path.length === 0) {
            crew.path = findPath(state, crew.tileIndex, targetTile, true, state.pathOccupancyByTile) ?? [];
            if (crew.path.length === 0) {
              markJobStall(
                state,
                job,
                crew.carryingAmount > 0 ? 'stalled_unreachable_dropoff' : 'stalled_unreachable_source'
              );
            }
          }
          const moveResult = moveCrew(crew);
          if (moveResult === 'moved') {
            job.lastProgressAt = state.now;
            markJobStall(state, job, 'none');
            crew.blockedTicks = 0;
          }
          if (moveResult === 'blocked') {
            crew.blockedTicks = Math.min(crew.blockedTicks + 1, 9999);
            markJobStall(state, job, 'stalled_path_blocked');
            if (crew.path.length === 0 || state.now - job.lastProgressAt > 2) {
              crew.path = findPath(state, crew.tileIndex, targetTile, true, state.pathOccupancyByTile) ?? [];
            }
          }
        }
        continue;
      }
    }

    if (crew.targetTile !== null && crew.path.length === 0 && crew.tileIndex !== crew.targetTile) {
      const path = findPath(state, crew.tileIndex, crew.targetTile, true, state.pathOccupancyByTile);
      crew.path = path ?? [];
      if (crew.path.length === 0) {
        crew.idleReason = 'idle_no_path';
        crew.blockedTicks = Math.min(crew.blockedTicks + 1, 9999);
      }
    }

    if (crew.targetTile === crew.tileIndex && crew.role !== 'idle') {
      crew.path = [];
      continue;
    }

    if (crew.role === 'idle' && crew.path.length === 0 && idleTargets.length > 0 && state.now >= crew.retargetAt) {
      const next = idleTargets[randomInt(0, idleTargets.length - 1, state.rng)];
      crew.path = findPath(state, crew.tileIndex, next, false, state.pathOccupancyByTile) ?? [];
      crew.retargetAt = state.now + 5 + state.rng() * 8;
      if (crew.path.length === 0) {
        crew.idleReason = 'idle_no_path';
      } else {
        crew.idleReason = hasPendingJobs ? 'idle_waiting_reassign' : 'idle_available';
      }
    }

    const moveResult = moveCrew(crew);
    if (moveResult === 'blocked') {
      crew.blockedTicks = Math.min(crew.blockedTicks + 1, 9999);
      crew.idleReason = 'idle_no_path';
    } else if (moveResult === 'moved') {
      crew.blockedTicks = 0;
      if (crew.role === 'idle') {
        crew.idleReason = hasPendingJobs ? 'idle_waiting_reassign' : 'idle_available';
      }
    } else if (crew.role === 'idle') {
      crew.idleReason = hasPendingJobs ? 'idle_waiting_reassign' : 'idle_no_jobs';
    }
  }
}

function assignPathToCafeteria(state: StationState, visitor: Visitor): void {
  visitor.reservedTargetTile = null;
  if (isCafeteriaQueueSpot(state, visitor.tileIndex)) {
    const next = pickLeastLoadedCafeteriaPath(state, visitor.tileIndex);
    visitor.path = next.path;
    visitor.reservedTargetTile = next.target;
    visitor.state = VisitorState.Queueing;
    return;
  }
  visitor.path = pickQueueSpotPath(state, visitor.tileIndex);
  visitor.state = VisitorState.ToCafeteria;
  if (visitor.path.length === 0) {
    const next = pickLeastLoadedCafeteriaPath(state, visitor.tileIndex);
    visitor.path = next.path;
    visitor.reservedTargetTile = next.target;
    visitor.state = VisitorState.Queueing;
  }
}

function assignPathToDock(state: StationState, visitor: Visitor): void {
  const docks = collectTiles(state, TileType.Dock);
  visitor.reservedTargetTile = null;
  visitor.path = chooseNearestPath(state, visitor.tileIndex, docks, false) ?? [];
}

function visitorWalkDistanceFromDock(state: StationState, tileIndex: number): number {
  const docks = collectTiles(state, TileType.Dock);
  if (docks.length === 0) return 0;
  let best = Number.POSITIVE_INFINITY;
  const p = fromIndex(tileIndex, state.width);
  for (const dock of docks) {
    const d = fromIndex(dock, state.width);
    const dist = Math.abs(p.x - d.x) + Math.abs(p.y - d.y);
    if (dist < best) best = dist;
  }
  return Number.isFinite(best) ? best : 0;
}

function applyVisitorWalkDissatisfaction(state: StationState, tileIndex: number): void {
  const walk = visitorWalkDistanceFromDock(state, tileIndex);
  state.usageTotals.visitorWalkDistance += walk;
  state.usageTotals.visitorWalkTrips += 1;
  if (walk > VISITOR_COMFORT_WALK_THRESHOLD) {
    const penalty = (walk - VISITOR_COMFORT_WALK_THRESHOLD) * VISITOR_WALK_PENALTY_RATE;
    serviceFailureRatingPenalty(state, penalty, 'ratingFromWalkDissatisfaction');
  }
}

function addVisitorPatience(state: StationState, visitor: Visitor, amount: number, taxAware = true): void {
  const taxStress = taxAware ? state.controls.taxRate * visitor.taxSensitivity * 0.5 : 0;
  const modifier = (1 + taxStress) / Math.max(0.45, visitor.patienceMultiplier);
  visitor.patience += amount * modifier;
}

function registerVisitorServiceFailure(state: StationState, amount: number): void {
  state.usageTotals.visitorServiceFailures += amount;
  addVisitorFailurePenalty(state, Math.min(0.12, amount * 0.03), 'noLeisurePath');
}

function assignPathToPreferredLeisure(state: StationState, visitor: Visitor): boolean {
  const loungeTargets = activeRoomTargets(state, RoomType.Lounge);
  const marketTargets = activeRoomTargets(state, RoomType.Market);
  const allTargets = [...loungeTargets, ...marketTargets];
  if (allTargets.length === 0) return false;

  if (visitor.archetype === 'rusher') {
    visitor.path = chooseNearestPath(state, visitor.tileIndex, allTargets, false) ?? [];
    visitor.state = VisitorState.ToLeisure;
    return visitor.path.length > 0;
  }

  const preferenceOrder: VisitorPreference[] =
    visitor.primaryPreference === 'market'
      ? ['market', 'lounge', 'cafeteria']
      : visitor.primaryPreference === 'lounge'
        ? ['lounge', 'market', 'cafeteria']
        : ['lounge', 'market', 'cafeteria'];
  for (const preference of preferenceOrder) {
    const targets = preference === 'market' ? marketTargets : loungeTargets;
    if (targets.length === 0) continue;
    const path = chooseNearestPath(state, visitor.tileIndex, targets, false) ?? [];
    if (path.length === 0) continue;
    visitor.path = path;
    visitor.state = VisitorState.ToLeisure;
    return true;
  }
  return false;
}

function shouldLeisureAfterMeal(state: StationState, visitor: Visitor): boolean {
  const chanceByArchetype: Record<VisitorArchetype, number> = {
    diner: 0.55,
    shopper: 0.82,
    lounger: 0.9,
    rusher: 0.25
  };
  return state.rng() < chanceByArchetype[visitor.archetype];
}

function shouldTryMealAfterLeisure(state: StationState, visitor: Visitor): boolean {
  const chanceByArchetype: Record<VisitorArchetype, number> = {
    diner: 0.85,
    shopper: 0.56,
    lounger: 0.48,
    rusher: 0.28
  };
  return state.rng() < chanceByArchetype[visitor.archetype];
}

function marketSpendPerSec(state: StationState, visitor: Visitor): number {
  const taxPenalty = clamp(1 - state.controls.taxRate * visitor.taxSensitivity, 0.35, 1.05);
  return 0.45 * visitor.spendMultiplier * taxPenalty;
}

function mealExitPayout(state: StationState, visitor: Visitor): number {
  const taxPenalty = clamp(1 - state.controls.taxRate * visitor.taxSensitivity * 0.9, 0.3, 1.1);
  const payout = (3 + state.controls.taxRate * 8) * visitor.spendMultiplier * taxPenalty;
  return Math.max(0.6, payout);
}

function assignPathToLeisure(state: StationState, visitor: Visitor): boolean {
  const ok = assignPathToPreferredLeisure(state, visitor);
  if (!ok) return false;
  visitor.state = VisitorState.ToLeisure;
  return true;
}

function updateVisitorLogic(state: StationState, dt: number, occupancyByTile: Map<number, number>): void {
  const keep: Visitor[] = [];

  for (const visitor of state.visitors) {
    if (state.zones[visitor.tileIndex] === ZoneType.Restricted && !visitor.trespassed) {
      visitor.trespassed = true;
      const multiplier = state.now < state.effects.securityDelayUntil ? 2 : 1;
      registerIncident(state, multiplier);
      addVisitorFailurePenalty(state, 0.2 * multiplier, 'trespass');
    }

    if (visitor.state === VisitorState.ToCafeteria || visitor.state === VisitorState.Queueing) {
      if (state.ops.cafeteriasActive <= 0) {
        if (!visitor.servedMeal && assignPathToLeisure(state, visitor)) {
          visitor.state = VisitorState.ToLeisure;
        } else {
          visitor.state = VisitorState.ToDock;
          assignPathToDock(state, visitor);
        }
      } else {
        if (visitor.path.length === 0) {
          assignPathToCafeteria(state, visitor);
        }
        const moveResult = moveAlongPath(state, visitor, dt, occupancyByTile);
        if (moveResult === 'blocked') {
          visitor.blockedTicks++;
          state.metrics.maxBlockedTicksObserved = Math.max(state.metrics.maxBlockedTicksObserved, visitor.blockedTicks);
        } else {
          visitor.blockedTicks = 0;
        }
        if (moveResult !== 'moved') {
          const hasAnyCafeteria = collectServiceTargets(state, RoomType.Cafeteria).length > 0;
          addVisitorPatience(state, visitor, hasAnyCafeteria ? dt * 0.35 : dt * 0.08);
        }

        if (visitor.blockedTicks >= BLOCKED_REPATH_TICKS) {
          assignPathToCafeteria(state, visitor);
        }
        if (visitor.blockedTicks >= BLOCKED_LOCAL_REROUTE_TICKS) {
          visitor.path = pickQueueSpotPath(state, visitor.tileIndex);
          visitor.state = VisitorState.ToCafeteria;
        }
        if (visitor.blockedTicks >= BLOCKED_FULL_REROUTE_TICKS) {
          visitor.blockedTicks = 0;
          assignPathToCafeteria(state, visitor);
        }

        if (isCafeteriaQueueSpot(state, visitor.tileIndex) && visitor.path.length === 0) {
          const next = pickLeastLoadedCafeteriaPath(state, visitor.tileIndex);
          visitor.path = next.path;
          visitor.reservedTargetTile = next.target;
          visitor.state = VisitorState.Queueing;
        }

        if (
          state.rooms[visitor.tileIndex] === RoomType.Cafeteria &&
          state.modules[visitor.tileIndex] === ModuleType.Table &&
          state.now >= state.effects.cafeteriaStallUntil &&
          dinersOnTile(state, visitor.tileIndex) < MAX_DINERS_PER_CAF_TILE
        ) {
          visitor.state = VisitorState.Eating;
          const eatBase = visitor.archetype === 'rusher' ? 1.4 : visitor.archetype === 'diner' ? 2.8 : 2.2;
          visitor.eatTimer = eatBase + state.rng() * 1.2;
          visitor.path = [];
          state.usageTotals.meals += 1;
          state.usageTotals.visitorLeisureEntries.cafeteria += 1;
          applyVisitorWalkDissatisfaction(state, visitor.tileIndex);
          if (visitor.reservedTargetTile !== null && visitor.reservedTargetTile !== visitor.tileIndex) {
            state.metrics.cafeteriaNonNodeSeatedCount++;
          }
          visitor.reservedTargetTile = null;
        } else if (state.rooms[visitor.tileIndex] === RoomType.Cafeteria) {
          const next = pickLeastLoadedCafeteriaPath(state, visitor.tileIndex);
          visitor.path = next.path;
          visitor.reservedTargetTile = next.target;
        }
      }
    } else if (visitor.state === VisitorState.Eating) {
      if (state.now < state.effects.cafeteriaStallUntil || state.metrics.mealStock <= 0.15) {
        addVisitorPatience(state, visitor, dt * 0.8);
      } else {
        visitor.eatTimer -= dt;
        state.metrics.mealStock = Math.max(0, state.metrics.mealStock - dt * 0.2);
      }

      if (visitor.eatTimer <= 0) {
        visitor.servedMeal = true;
        state.metrics.mealsServedTotal += 1;
        visitorSuccessRatingBonus(state, 0.08, 'mealService');
        if (shouldLeisureAfterMeal(state, visitor) && assignPathToLeisure(state, visitor)) {
          visitor.state = VisitorState.ToLeisure;
        } else {
          visitor.state = VisitorState.ToDock;
          visitor.reservedTargetTile = null;
          assignPathToDock(state, visitor);
        }
      }
    } else if (visitor.state === VisitorState.ToLeisure) {
      if (visitor.path.length === 0) {
        if (!assignPathToLeisure(state, visitor)) {
          if (!visitor.servedMeal && state.ops.cafeteriasActive > 0) {
            visitor.state = VisitorState.ToCafeteria;
            assignPathToCafeteria(state, visitor);
            if (visitor.path.length > 0) {
              keep.push(visitor);
              continue;
            }
          }
          registerVisitorServiceFailure(state, 1);
          if (!visitor.servedMeal && state.ops.cafeteriasActive > 0 && shouldTryMealAfterLeisure(state, visitor)) {
            visitor.state = VisitorState.ToCafeteria;
            assignPathToCafeteria(state, visitor);
          } else {
            visitor.state = VisitorState.ToDock;
            assignPathToDock(state, visitor);
          }
        }
      }
      const moveResult = moveAlongPath(state, visitor, dt, occupancyByTile);
      if (moveResult !== 'moved') addVisitorPatience(state, visitor, dt * 0.4);
      if (state.rooms[visitor.tileIndex] === RoomType.Lounge || state.rooms[visitor.tileIndex] === RoomType.Market) {
        visitor.state = VisitorState.Leisure;
        visitorSuccessRatingBonus(state, 0.04, 'leisureService');
        if (state.rooms[visitor.tileIndex] === RoomType.Market) {
          state.usageTotals.visitorLeisureEntries.market += 1;
        } else {
          state.usageTotals.visitorLeisureEntries.lounge += 1;
        }
        const baseDwell =
          visitor.archetype === 'lounger' ? 3.4 : visitor.archetype === 'shopper' ? 3.0 : visitor.archetype === 'rusher' ? 1.4 : 2.2;
        visitor.eatTimer = baseDwell + state.rng() * 1.5;
        visitor.path = [];
        applyVisitorWalkDissatisfaction(state, visitor.tileIndex);
      }
    } else if (visitor.state === VisitorState.Leisure) {
      visitor.eatTimer -= dt;
      if (state.rooms[visitor.tileIndex] === RoomType.Market) {
        const spend = dt * marketSpendPerSec(state, visitor);
        state.metrics.credits += spend;
        state.usageTotals.creditsMarketGross += spend;
      }
      if (visitor.eatTimer <= 0) {
        if (!visitor.servedMeal && state.ops.cafeteriasActive > 0 && shouldTryMealAfterLeisure(state, visitor)) {
          visitor.state = VisitorState.ToCafeteria;
          assignPathToCafeteria(state, visitor);
        } else {
          visitor.state = VisitorState.ToDock;
          assignPathToDock(state, visitor);
        }
      }
    } else {
      if (visitor.path.length === 0) {
        assignPathToDock(state, visitor);
      }
      const moveResult = moveAlongPath(state, visitor, dt, occupancyByTile);
      if (moveResult !== 'moved') addVisitorPatience(state, visitor, dt);
      if (state.tiles[visitor.tileIndex] === TileType.Dock) {
        const boarded = tryBoardDockedShipAtTile(state, visitor.tileIndex);
        const canExitNormally =
          state.now - state.lastCycleTime > state.cycleDuration * 0.2 &&
          state.now - visitor.spawnedAt >= VISITOR_MIN_STAY_SEC;
        if (boarded || canExitNormally) {
          visitorSuccessRatingBonus(state, visitor.servedMeal ? 0.03 : 0.015, 'successfulExit');
          if (visitor.servedMeal) {
            const payout = mealExitPayout(state, visitor);
            state.metrics.credits += payout;
            state.usageTotals.creditsMealPayoutGross += payout;
          }
          state.recentExitTimes.push(state.now);
          occupancyByTile.set(
            visitor.tileIndex,
            Math.max(0, (occupancyByTile.get(visitor.tileIndex) ?? 1) - 1)
          );
          continue;
        }
        addVisitorPatience(state, visitor, dt * 0.4);
      } else if (visitor.path.length === 0) {
        addVisitorPatience(state, visitor, dt * 1.4);
      }
    }

    if (visitor.patience > 30 && visitor.state !== VisitorState.ToDock) {
      visitor.state = VisitorState.ToDock;
      visitor.reservedTargetTile = null;
      assignPathToDock(state, visitor);
      visitor.patience = 12;
      addVisitorFailurePenalty(state, 0.05, 'patienceBail');
    }
    if (visitor.patience > 80 && visitor.state === VisitorState.ToDock) {
      visitor.path = [];
      if (state.tiles[visitor.tileIndex] === TileType.Dock) {
        state.recentExitTimes.push(state.now);
        occupancyByTile.set(
          visitor.tileIndex,
          Math.max(0, (occupancyByTile.get(visitor.tileIndex) ?? 1) - 1)
        );
        continue;
      }
      addVisitorFailurePenalty(state, 0.12, 'dockTimeout');
      visitor.patience = 20;
    }
    if (visitor.patience > 120 && visitor.state === VisitorState.ToDock) {
      addVisitorFailurePenalty(state, 0.2, 'dockTimeout');
      occupancyByTile.set(
        visitor.tileIndex,
        Math.max(0, (occupancyByTile.get(visitor.tileIndex) ?? 1) - 1)
      );
      continue;
    }

    keep.push(visitor);
  }

  state.visitors = keep;
}

function noteFailedNeedAttempt(state: StationState, need: 'hunger' | 'energy' | 'hygiene' | 'dorm'): void {
  state.failedNeedAttempts[need] += 1;
  if (need === 'hunger') state.metrics.failedNeedAttemptsHunger += 1;
  if (need === 'energy') state.metrics.failedNeedAttemptsEnergy += 1;
  if (need === 'hygiene') state.metrics.failedNeedAttemptsHygiene += 1;
}

function assignResidentTarget(state: StationState, resident: Resident): void {
  resident.reservedTargetTile = null;
  const dormTargets = activeRoomTargets(state, RoomType.Dorm);
  const hygieneTargets = activeRoomTargets(state, RoomType.Hygiene);
  const cafeteriaTargets = activeRoomTargets(state, RoomType.Cafeteria);

  if (resident.energy < DORM_SEEK_ENERGY_THRESHOLD && dormTargets.length > 0) {
    resident.state = ResidentState.ToDorm;
    resident.path = chooseNearestPath(state, resident.tileIndex, dormTargets, false) ?? [];
    if (resident.path.length > 0) return;
    noteFailedNeedAttempt(state, 'dorm');
    noteFailedNeedAttempt(state, 'energy');
  } else if (resident.energy < DORM_SEEK_ENERGY_THRESHOLD) {
    noteFailedNeedAttempt(state, 'dorm');
    noteFailedNeedAttempt(state, 'energy');
  }

  if (resident.hygiene < 45 && hygieneTargets.length > 0) {
    resident.state = ResidentState.ToHygiene;
    resident.path = chooseNearestPath(state, resident.tileIndex, hygieneTargets, false) ?? [];
    if (resident.path.length > 0) return;
    noteFailedNeedAttempt(state, 'hygiene');
  } else if (resident.hygiene < 45) {
    noteFailedNeedAttempt(state, 'hygiene');
  }

  if (resident.hunger < 55 && cafeteriaTargets.length > 0 && state.metrics.mealStock > 3) {
    resident.state = ResidentState.ToCafeteria;
    resident.path = pickQueueSpotPath(state, resident.tileIndex);
    if (resident.path.length === 0) {
      const next = pickLeastLoadedCafeteriaPath(state, resident.tileIndex);
      resident.path = next.path;
      resident.reservedTargetTile = next.target;
    }
    if (resident.path.length > 0) return;
    noteFailedNeedAttempt(state, 'hunger');
  } else if (resident.hunger < 55) {
    noteFailedNeedAttempt(state, 'hunger');
  }

  resident.state = ResidentState.Idle;
  if (state.now >= resident.retargetAt || resident.path.length === 0) {
    const walkTargets = collectIdleWalkTiles(state);
    if (walkTargets.length > 0) {
      const target = walkTargets[randomInt(0, walkTargets.length - 1, state.rng)];
      resident.path = findPath(state, resident.tileIndex, target, false, state.pathOccupancyByTile) ?? [];
    } else {
      resident.path = [];
    }
    resident.retargetAt = state.now + 5 + state.rng() * 8;
  }
}

function updateResidentLogic(state: StationState, dt: number, occupancyByTile: Map<number, number>): void {
  const keep: Resident[] = [];
  for (const resident of state.residents) {
    if (state.metrics.airQuality <= AIR_CRITICAL_THRESHOLD) {
      resident.airExposureSec += dt * 1.35;
    } else if (state.metrics.airQuality <= AIR_DISTRESS_THRESHOLD) {
      resident.airExposureSec += dt;
    } else {
      resident.airExposureSec = Math.max(0, resident.airExposureSec - dt * 1.8);
    }

    if (resident.airExposureSec >= AIR_DEATH_EXPOSURE_SEC) {
      state.metrics.deathsTotal += 1;
      state.metrics.bodyCount += 1;
      state.bodyTiles.push(resident.tileIndex);
      state.recentDeathTimes.push(state.now);
      occupancyByTile.set(
        resident.tileIndex,
        Math.max(0, (occupancyByTile.get(resident.tileIndex) ?? 1) - 1)
      );
      continue;
    }
    resident.healthState =
      resident.airExposureSec >= AIR_CRITICAL_EXPOSURE_SEC
        ? 'critical'
        : resident.airExposureSec >= AIR_DISTRESS_EXPOSURE_SEC
          ? 'distressed'
          : 'healthy';

    const airPenalty = state.metrics.airQuality < 40 ? 0.25 : 0;
    const healthPenalty = resident.healthState === 'critical' ? 0.35 : resident.healthState === 'distressed' ? 0.18 : 0;
    resident.hunger = clamp(resident.hunger - dt * (0.65 + airPenalty), 0, 100);
    resident.energy = clamp(resident.energy - dt * (0.5 + healthPenalty), 0, 100);
    resident.hygiene = clamp(resident.hygiene - dt * (0.4 + healthPenalty * 0.6), 0, 100);

    const lowNeedCount =
      (resident.hunger < 30 ? 1 : 0) + (resident.energy < 30 ? 1 : 0) + (resident.hygiene < 30 ? 1 : 0);

    if (lowNeedCount > 0) {
      resident.stress = clamp(resident.stress + dt * (0.75 + lowNeedCount * 0.45), 0, 120);
    } else {
      resident.stress = clamp(resident.stress - dt * 0.45, 0, 120);
    }

    if (resident.state === ResidentState.Eating) {
      resident.actionTimer -= dt;
      if (state.metrics.mealStock > 0.12) {
        state.metrics.mealStock = Math.max(0, state.metrics.mealStock - dt * 0.55);
        resident.hunger = clamp(resident.hunger + dt * 22, 0, 100);
      } else {
        resident.stress = clamp(resident.stress + dt * 0.6, 0, 120);
      }
      if (resident.actionTimer <= 0 || resident.hunger >= 95) {
        state.metrics.mealsServedTotal += 1;
        resident.state = ResidentState.Idle;
        resident.reservedTargetTile = null;
      }
    } else if (resident.state === ResidentState.Sleeping) {
      resident.actionTimer -= dt;
      resident.energy = clamp(resident.energy + dt * 18, 0, 100);
      if (resident.actionTimer <= 0 || resident.energy >= 95) {
        resident.state = ResidentState.Idle;
      }
    } else if (resident.state === ResidentState.Cleaning) {
      resident.actionTimer -= dt;
      if (state.metrics.waterStock > 0.1) {
        state.metrics.waterStock = Math.max(0, state.metrics.waterStock - dt * 0.42);
        resident.hygiene = clamp(resident.hygiene + dt * 20, 0, 100);
      } else {
        resident.stress = clamp(resident.stress + dt * 0.55, 0, 120);
      }
      if (resident.actionTimer <= 0 || resident.hygiene >= 95) {
        resident.state = ResidentState.Idle;
      }
    } else {
      if (resident.state === ResidentState.Idle || resident.path.length === 0) {
        assignResidentTarget(state, resident);
      }

      const moveResult = moveAlongPath(state, resident, dt, occupancyByTile);
      if (moveResult === 'blocked') {
        resident.blockedTicks++;
        state.metrics.maxBlockedTicksObserved = Math.max(state.metrics.maxBlockedTicksObserved, resident.blockedTicks);
      } else {
        resident.blockedTicks = 0;
      }
      if (moveResult !== 'moved') resident.stress = clamp(resident.stress + dt * 0.2, 0, 120);

      if (resident.blockedTicks >= BLOCKED_REPATH_TICKS && resident.state === ResidentState.ToCafeteria) {
        resident.path = pickQueueSpotPath(state, resident.tileIndex);
      }
      if (resident.blockedTicks >= BLOCKED_LOCAL_REROUTE_TICKS && resident.state === ResidentState.ToCafeteria) {
        const next = pickLeastLoadedCafeteriaPath(state, resident.tileIndex);
        resident.path = next.path;
        resident.reservedTargetTile = next.target;
      }
      if (resident.blockedTicks >= BLOCKED_FULL_REROUTE_TICKS) {
        resident.blockedTicks = 0;
        assignResidentTarget(state, resident);
      }

      if (resident.state === ResidentState.ToCafeteria && state.rooms[resident.tileIndex] === RoomType.Cafeteria) {
        if (
          state.modules[resident.tileIndex] === ModuleType.Table &&
          dinersOnTile(state, resident.tileIndex) < MAX_DINERS_PER_CAF_TILE
        ) {
          resident.state = ResidentState.Eating;
          resident.actionTimer = 2.4;
          resident.path = [];
          state.usageTotals.meals += 1;
          if (resident.reservedTargetTile !== null && resident.reservedTargetTile !== resident.tileIndex) {
            state.metrics.cafeteriaNonNodeSeatedCount++;
          }
          resident.reservedTargetTile = null;
        } else {
          const next = pickLeastLoadedCafeteriaPath(state, resident.tileIndex);
          resident.path = next.path;
          resident.reservedTargetTile = next.target;
        }
      } else if (resident.state === ResidentState.ToCafeteria && isCafeteriaQueueSpot(state, resident.tileIndex)) {
        const next = pickLeastLoadedCafeteriaPath(state, resident.tileIndex);
        resident.path = next.path;
        resident.reservedTargetTile = next.target;
      } else if (resident.state === ResidentState.ToDorm && state.rooms[resident.tileIndex] === RoomType.Dorm) {
        resident.state = ResidentState.Sleeping;
        resident.actionTimer = 3.2;
        resident.path = [];
        state.usageTotals.dorm += 1;
      } else if (resident.state === ResidentState.ToHygiene && state.rooms[resident.tileIndex] === RoomType.Hygiene) {
        resident.state = ResidentState.Cleaning;
        resident.actionTimer = 2.2;
        resident.path = [];
        state.usageTotals.hygiene += 1;
      } else if (
        (resident.state === ResidentState.ToCafeteria ||
          resident.state === ResidentState.ToDorm ||
          resident.state === ResidentState.ToHygiene) &&
        resident.path.length === 0
      ) {
        resident.state = ResidentState.Idle;
        resident.reservedTargetTile = null;
        resident.retargetAt = 0;
      }
    }

    if (resident.stress > 100) {
      registerIncident(state, 1);
      resident.stress = 55;
    }
    keep.push(resident);
  }
  state.residents = keep;
}

function updateResources(state: StationState, dt: number): void {
  const leakPenalty = state.metrics.leakingTiles * 0.03;
  const powerRatio = clamp(state.metrics.powerSupply / Math.max(1, state.metrics.powerDemand), 0.35, 1);
  const hydroRate = state.ops.hydroponicsActive * 1.25 * powerRatio;
  const activeKitchenNodes = activeRoomTargets(state, RoomType.Kitchen).length;
  const residentMealUsePerSec = state.residents.length * 0.11;
  const visitorMealUsePerSec = state.visitors.length * 0.04;
  const crewMealUsePerSec = state.crewMembers.length * 0.06;
  const mealUseRate = residentMealUsePerSec + visitorMealUsePerSec + crewMealUsePerSec;

  state.metrics.rawFoodStock = clamp(
    state.metrics.rawFoodStock + hydroRate * dt,
    0,
    260
  );
  const kitchenMealProd = Math.min(
    state.metrics.kitchenRawBuffer,
    activeKitchenNodes * KITCHEN_CONVERSION_RATE * powerRatio * dt
  );
  state.metrics.kitchenRawBuffer = clamp(state.metrics.kitchenRawBuffer - kitchenMealProd, 0, 260);
  state.metrics.mealStock = clamp(state.metrics.mealStock + kitchenMealProd, 0, 260);
  state.metrics.mealStock = clamp(state.metrics.mealStock - mealUseRate * dt * 0.06, 0, 260);
  state.metrics.rawFoodStock = clamp(
    state.metrics.rawFoodStock - (state.residents.length * 0.01 + state.crewMembers.length * 0.008) * dt,
    0,
    260
  );

  state.metrics.waterStock = clamp(
    state.metrics.waterStock +
      state.ops.lifeSupportActive * 0.72 * powerRatio * dt -
      (state.residents.length * 0.04 + state.crewMembers.length * 0.03) * dt,
    0,
    260
  );

  const airDemand = state.residents.length * 0.12 + state.visitors.length * 0.05 + state.crewMembers.length * 0.08;
  const lifeSupportPotentialAirPerSec = state.ops.lifeSupportTotal * LIFE_SUPPORT_AIR_PER_CLUSTER;
  const lifeSupportActiveAirPerSec = state.ops.lifeSupportActive * LIFE_SUPPORT_AIR_PER_CLUSTER * powerRatio;
  const airSupply = lifeSupportActiveAirPerSec + (state.metrics.pressurizationPct / 100) * PASSIVE_AIR_PER_SEC_AT_100_PRESSURE;
  const airDeltaPerSec = (airSupply - airDemand) * 1.7 - leakPenalty * 1.2;
  state.metrics.lifeSupportPotentialAirPerSec = lifeSupportPotentialAirPerSec;
  state.metrics.lifeSupportActiveAirPerSec = lifeSupportActiveAirPerSec;
  state.metrics.airTrendPerSec = airDeltaPerSec;
  state.metrics.airQuality = clamp(state.metrics.airQuality + (airSupply - airDemand) * dt * 1.7, 0, 100);
  if (leakPenalty > 0) {
    state.metrics.airQuality = clamp(state.metrics.airQuality - leakPenalty * dt * 1.2, 0, 100);
  }

  if (state.metrics.airQuality <= 10 && lifeSupportPotentialAirPerSec > 0 && lifeSupportActiveAirPerSec <= 0) {
    state.metrics.airBlockedLowAirSec += dt;
  } else {
    state.metrics.airBlockedLowAirSec = Math.max(0, state.metrics.airBlockedLowAirSec - dt * 2);
  }
  state.metrics.airBlockedWarningActive = state.metrics.airBlockedLowAirSec >= AIR_BLOCKED_WARNING_DELAY_SEC;

  const bodyPenalty = Math.min(0.24, state.bodyTiles.length * 0.015);
  if (bodyPenalty > 0) {
    state.incidentHeat += bodyPenalty * dt;
  }

  const avgCrewHygiene =
    state.crewMembers.length > 0 ? state.crewMembers.reduce((acc, c) => acc + c.hygiene, 0) / state.crewMembers.length : 100;
  const hygieneStress = clamp((55 - avgCrewHygiene) / 55, 0, 1);
  const crowdPressure = clamp((state.visitors.length + state.crewMembers.length) / 24, 0, 2);
  const securityFactor = state.ops.securityActive > 0 ? 0.35 : 1;
  const ambientIncidentRate = (0.012 + crowdPressure * 0.03 + hygieneStress * 0.05) * securityFactor;
  if (state.rng() < ambientIncidentRate * dt) {
    registerIncident(state, 1);
  }
  if (state.metrics.powerDemand > state.metrics.powerSupply) {
    state.incidentHeat += dt * 0.05;
  }

  if (state.metrics.airQuality < 30) {
    state.incidentHeat += dt * 0.22;
  }

  state.metrics.rawFoodProdRate = hydroRate;
  const instantKitchenRate = dt > 0 ? kitchenMealProd / dt : 0;
  state.metrics.kitchenMealProdRate = state.metrics.kitchenMealProdRate * 0.82 + instantKitchenRate * 0.18;
  state.metrics.mealPrepRate = state.metrics.kitchenMealProdRate;
  state.metrics.mealUseRate = mealUseRate;
}

function applyCrewPayroll(state: StationState): void {
  if (state.now - state.lastPayrollAt < PAYROLL_PERIOD) return;
  state.lastPayrollAt = state.now;

  const payroll = state.crew.total * PAYROLL_PER_CREW;
  if (state.metrics.credits >= payroll) {
    state.metrics.credits -= payroll;
    state.usageTotals.payrollPaid += payroll;
    return;
  }

  const deficit = payroll - state.metrics.credits;
  state.usageTotals.payrollPaid += state.metrics.credits;
  state.metrics.credits = 0;
  state.incidentHeat += 0.5 + deficit * 0.03;
}

function maybeTriggerFailure(state: StationState, dt: number): void {
  const ratio = state.metrics.capacity <= 0 ? 2 : state.metrics.load / state.metrics.capacity;
  if (ratio < 0.9) return;

  const chance = clamp((ratio - 0.88) * 0.65, 0.02, 0.4) * dt;
  if (state.rng() > chance) return;

  const roll = state.rng();
  if (roll < 0.25) {
    state.effects.cafeteriaStallUntil = Math.max(state.effects.cafeteriaStallUntil, state.now + 3);
  } else if (roll < 0.55) {
    const corridors: number[] = [];
    for (let i = 0; i < state.tiles.length; i++) {
      if (state.tiles[i] === TileType.Floor && isWalkable(state.tiles[i])) corridors.push(i);
    }
    if (corridors.length > 0) {
      const idx = corridors[randomInt(0, corridors.length - 1, state.rng)];
      state.effects.blockedUntilByTile.set(idx, state.now + 3);
    }
  } else if (roll < 0.8) {
    const securityPenalty = state.ops.securityActive > 0 ? 1 : 1.6;
    state.effects.securityDelayUntil = Math.max(
      state.effects.securityDelayUntil,
      state.now + 5 * securityPenalty
    );
  } else {
    const brownoutPenalty = state.metrics.powerDemand > state.metrics.powerSupply ? 1.6 : 1;
    state.effects.brownoutUntil = Math.max(
      state.effects.brownoutUntil,
      state.now + 4 * brownoutPenalty
    );
  }
}

function collectTopRoomWarnings(state: StationState): string[] {
  const roomTypes = [
    RoomType.Cafeteria,
    RoomType.Kitchen,
    RoomType.Dorm,
    RoomType.Hygiene,
    RoomType.Hydroponics,
    RoomType.LifeSupport,
    RoomType.Lounge,
    RoomType.Market,
    RoomType.Security,
    RoomType.Reactor
  ];
  const warningCounts = new Map<string, number>();
  for (const room of roomTypes) {
    for (const cluster of roomClusters(state, room)) {
      if (cluster.length === 0) continue;
      const diag = getRoomDiagnosticAt(state, cluster[0]);
      if (!diag) continue;
      for (const reason of diag.reasons) {
        const key = `${room}: ${reason}`;
        warningCounts.set(key, (warningCounts.get(key) ?? 0) + 1);
      }
      for (const warning of diag.warnings) {
        const key = `${room}: ${warning}`;
        warningCounts.set(key, (warningCounts.get(key) ?? 0) + 1);
      }
    }
  }
  return [...warningCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([label, count]) => `${label} (${count})`);
}

function collectLifeSupportInactiveReasons(state: StationState): string[] {
  const counts = new Map<string, number>();
  for (const cluster of roomClusters(state, RoomType.LifeSupport)) {
    if (cluster.length === 0) continue;
    const diag = getRoomDiagnosticAt(state, cluster[0]);
    if (!diag || diag.active) continue;
    for (const reason of diag.reasons) {
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => `${reason} (${count})`);
}

function computeMetrics(state: StationState): void {
  const visitorsCount = state.visitors.length;
  const residentsCount = state.residents.length;
  const visitorsByArchetype: Record<VisitorArchetype, number> = {
    diner: 0,
    shopper: 0,
    lounger: 0,
    rusher: 0
  };
  for (const visitor of state.visitors) {
    visitorsByArchetype[visitor.archetype] += 1;
  }
  let manifestDemand = { cafeteria: 0, market: 0, lounge: 0 };
  let manifestCount = 0;
  for (const ship of state.arrivingShips) {
    manifestDemand.cafeteria += ship.manifestDemand.cafeteria;
    manifestDemand.market += ship.manifestDemand.market;
    manifestDemand.lounge += ship.manifestDemand.lounge;
    manifestCount++;
  }
  if (manifestCount > 0) {
    manifestDemand = normalizeDemand({
      cafeteria: manifestDemand.cafeteria / manifestCount,
      market: manifestDemand.market / manifestCount,
      lounge: manifestDemand.lounge / manifestCount
    });
  } else {
    manifestDemand = { cafeteria: 0.42, market: 0.36, lounge: 0.22 };
  }
  const distressedResidents = state.residents.filter((r) => r.healthState === 'distressed').length;
  const criticalResidents = state.residents.filter((r) => r.healthState === 'critical').length;

  const powerSupply = BASE_POWER_SUPPLY + state.ops.reactorsActive * POWER_PER_REACTOR;
  const powerDemand =
    9 +
    visitorsCount * 0.35 +
    residentsCount * 0.52 +
    state.ops.cafeteriasActive * 1.3 +
    state.ops.kitchenActive * 1.2 +
    state.ops.securityActive * 1.2 +
    state.ops.hygieneActive * 1.0 +
    state.ops.hydroponicsActive * 1.1 +
    state.ops.lifeSupportActive * 1.4 +
    state.ops.loungeActive * 1.0 +
    state.ops.marketActive * 1.1;

  const powerDeficit = Math.max(0, powerDemand - powerSupply);
  const powerPressure = powerDeficit * 1.9;

  let avgDistanceCost = 0;
  const actorCount = visitorsCount + residentsCount;
  if (actorCount > 0) {
    let sum = 0;
    for (const v of state.visitors) sum += v.path.length;
    for (const r of state.residents) sum += r.path.length;
    avgDistanceCost = (sum / actorCount) * 0.16;
  }

  let averageNeedDeficit = 0;
  if (residentsCount > 0) {
    let deficit = 0;
    for (const r of state.residents) {
      deficit += (100 - r.hunger + (100 - r.energy) + (100 - r.hygiene)) / 3;
    }
    averageNeedDeficit = deficit / residentsCount;
  }

  const unmetNeedPressure = averageNeedDeficit * 0.42;
  const healthPressure = distressedResidents * 0.35 + criticalResidents * 0.8;

  state.incidentHeat = Math.max(0, state.incidentHeat - 0.08);

  const load =
    visitorsCount +
    residentsCount +
    powerDemand +
    state.incidentHeat * 5 +
    avgDistanceCost +
    powerPressure +
    unmetNeedPressure +
    healthPressure;

  const capacity =
    BASE_CAPACITY +
    state.ops.cafeteriasActive * 14 +
    state.ops.kitchenActive * 9 +
    state.ops.securityActive * 10 +
    state.ops.reactorsActive * 14 +
    state.ops.lifeSupportActive * 10 +
    state.ops.dormsActive * 4 +
    state.ops.loungeActive * 7 +
    state.ops.marketActive * 8;

  const loadPct = capacity > 0 ? (load / capacity) * 100 : 200;

  const avgCrewEnergy =
    state.crewMembers.length > 0 ? state.crewMembers.reduce((acc, c) => acc + c.energy, 0) / state.crewMembers.length : 100;
  const avgCrewHygiene =
    state.crewMembers.length > 0 ? state.crewMembers.reduce((acc, c) => acc + c.hygiene, 0) / state.crewMembers.length : 100;
  const crewFatiguePenalty = clamp((60 - avgCrewEnergy) * 0.9, 0, 40);
  const crewHygienePenalty = clamp((55 - avgCrewHygiene) * 0.9, 0, 35);
  const airPenalty = clamp((35 - state.metrics.airQuality) * 0.8, 0, 45);
  const powerPenalty = clamp((state.metrics.powerDemand - state.metrics.powerSupply) * 1.4, 0, 40);
  const payrollPenalty = state.metrics.credits <= 0 ? 8 : 0;
  const morale = clamp(100 - crewFatiguePenalty - crewHygienePenalty - airPenalty - powerPenalty - payrollPenalty, 0, 100);
  const bays = state.docks;
  const dockedShips = state.arrivingShips.filter((s) => s.stage === 'docked').length;
  const bayUtilizationPct = bays.length > 0 ? (dockedShips / bays.length) * 100 : 0;
  const averageDockTime =
    state.dockedShipsCompleted > 0 ? state.dockedTimeTotal / state.dockedShipsCompleted : 0;
  state.recentExitTimes = state.recentExitTimes.filter((t) => state.now - t <= 60);
  const exitsPerMin = state.recentExitTimes.length;

  state.metrics.visitorsCount = visitorsCount;
  state.metrics.residentsCount = residentsCount;
  state.metrics.load = load;
  state.metrics.capacity = capacity;
  state.metrics.loadPct = loadPct;
  state.metrics.powerSupply = powerSupply;
  state.metrics.powerDemand = powerDemand;
  state.metrics.morale = morale;
  const runMinutes = Math.max(1 / 60, state.now / 60);
  const ratingDeltaPerMin = state.usageTotals.ratingDelta / runMinutes;
  state.metrics.stationRating = clamp(STATION_RATING_START + state.usageTotals.ratingDelta, 0, 100);
  state.metrics.stationRatingTrendPerMin = ratingDeltaPerMin;
  state.metrics.dockedShips = dockedShips;
  state.metrics.averageDockTime = averageDockTime;
  state.metrics.bayUtilizationPct = bayUtilizationPct;
  state.metrics.dockZonesTotal = bays.length;
  state.metrics.exitsPerMin = exitsPerMin;
  const queueByLane: Record<SpaceLane, number> = { north: 0, east: 0, south: 0, west: 0 };
  for (const q of state.dockQueue) queueByLane[q.lane] += 1;
  state.metrics.dockQueueLengthByLane = queueByLane;
  state.metrics.shipDemandCafeteriaPct = manifestDemand.cafeteria * 100;
  state.metrics.shipDemandMarketPct = manifestDemand.market * 100;
  state.metrics.shipDemandLoungePct = manifestDemand.lounge * 100;
  state.metrics.visitorsByArchetype = visitorsByArchetype;
  state.metrics.distressedResidents = distressedResidents;
  state.metrics.criticalResidents = criticalResidents;
  state.recentDeathTimes = state.recentDeathTimes.filter((t) => state.now - t <= 60);
  state.metrics.recentDeaths = state.recentDeathTimes.length;
  const crewRestingInDorm = state.crewMembers.filter((c) => c.resting && state.rooms[c.tileIndex] === RoomType.Dorm).length;
  const crewToDorm = state.crewMembers.filter((c) => c.resting && state.rooms[c.tileIndex] !== RoomType.Dorm).length;
  const crewCleaning = state.crewMembers.filter((c) => c.cleaning).length;
  state.metrics.dormSleepingResidents = state.residents.filter((r) => r.state === ResidentState.Sleeping).length + crewRestingInDorm;
  state.metrics.toDormResidents = state.residents.filter((r) => r.state === ResidentState.ToDorm).length + crewToDorm;
  state.metrics.hygieneCleaningResidents = state.residents.filter((r) => r.state === ResidentState.Cleaning).length + crewCleaning;
  state.metrics.cafeteriaQueueingCount =
    state.visitors.filter((v) => v.state === VisitorState.Queueing || v.state === VisitorState.ToCafeteria).length +
    state.residents.filter((r) => r.state === ResidentState.ToCafeteria).length;
  state.metrics.cafeteriaEatingCount =
    state.visitors.filter((v) => v.state === VisitorState.Eating).length +
    state.residents.filter((r) => r.state === ResidentState.Eating).length;
  state.metrics.hydroponicsActiveGrowNodes = activeRoomTargets(state, RoomType.Hydroponics).length;
  state.metrics.lifeSupportActiveNodes = activeRoomTargets(state, RoomType.LifeSupport).length;
  state.metrics.hydroponicsStaffed = state.crewMembers.filter(
    (c) =>
      !c.resting &&
      c.targetTile !== null &&
      state.rooms[c.targetTile] === RoomType.Hydroponics &&
      c.tileIndex === c.targetTile
  ).length;
  const criticalTargets = computeCriticalCapacityTargets(state);
  const staffForRoom = (room: RoomType): { assigned: number; active: number; transit: number } => {
    let assigned = 0;
    let active = 0;
    for (const crew of state.crewMembers) {
      if (crew.resting || crew.targetTile === null) continue;
      if (state.rooms[crew.targetTile] !== room) continue;
      assigned += 1;
      if (crew.tileIndex === crew.targetTile) active += 1;
    }
    return { assigned, active, transit: Math.max(0, assigned - active) };
  };
  const reactorStaff = staffForRoom(RoomType.Reactor);
  const lifeSupportStaff = staffForRoom(RoomType.LifeSupport);
  const hydroStaff = staffForRoom(RoomType.Hydroponics);
  const kitchenStaff = staffForRoom(RoomType.Kitchen);
  const cafeteriaStaff = staffForRoom(RoomType.Cafeteria);
  state.metrics.requiredCriticalStaff = {
    reactor: criticalTargets.requiredReactorPosts,
    lifeSupport: criticalTargets.requiredLifeSupportPosts,
    hydroponics: criticalTargets.requiredHydroPosts,
    kitchen: criticalTargets.requiredKitchenPosts,
    cafeteria: criticalTargets.requiredCafeteriaPosts
  };
  state.metrics.assignedCriticalStaff = {
    reactor: reactorStaff.assigned,
    lifeSupport: lifeSupportStaff.assigned,
    hydroponics: hydroStaff.assigned,
    kitchen: kitchenStaff.assigned,
    cafeteria: cafeteriaStaff.assigned
  };
  state.metrics.activeCriticalStaff = {
    reactor: reactorStaff.active,
    lifeSupport: lifeSupportStaff.active,
    hydroponics: hydroStaff.active,
    kitchen: kitchenStaff.active,
    cafeteria: cafeteriaStaff.active
  };
  state.metrics.staffInTransitBySystem = {
    reactor: reactorStaff.transit,
    lifeSupport: lifeSupportStaff.transit,
    hydroponics: hydroStaff.transit,
    kitchen: kitchenStaff.transit,
    cafeteria: cafeteriaStaff.transit
  };

  const idleCrewByReason: Record<CrewIdleReason, number> = {
    idle_available: 0,
    idle_no_jobs: 0,
    idle_resting: 0,
    idle_no_path: 0,
    idle_waiting_reassign: 0
  };
  let crewAssignedWorking = 0;
  let crewIdleAvailable = 0;
  let crewResting = 0;
  let crewOnLogisticsJobs = 0;
  let crewBlockedNoPath = 0;
  for (const crew of state.crewMembers) {
    if (crew.resting) crewResting += 1;
    if (crew.activeJobId !== null) crewOnLogisticsJobs += 1;
    if (!crew.resting && crew.activeJobId === null && crew.role !== 'idle') crewAssignedWorking += 1;
    if (crew.role === 'idle' && !crew.resting && crew.activeJobId === null) crewIdleAvailable += 1;
    if (crew.idleReason === 'idle_no_path') crewBlockedNoPath += 1;
    idleCrewByReason[crew.idleReason] += 1;
  }
  state.metrics.crewAssignedWorking = crewAssignedWorking;
  state.metrics.crewIdleAvailable = crewIdleAvailable;
  state.metrics.crewResting = crewResting;
  state.metrics.crewRestingNow = crewResting;
  state.metrics.crewRestCap = Math.max(1, Math.ceil(Math.max(1, state.crewMembers.length) * CREW_MAX_RESTING_RATIO));
  state.metrics.crewOnLogisticsJobs = crewOnLogisticsJobs;
  state.metrics.crewBlockedNoPath = crewBlockedNoPath;
  state.metrics.idleCrewByReason = idleCrewByReason;
  const grossCredits = state.usageTotals.creditsMarketGross + state.usageTotals.creditsMealPayoutGross;
  const payrollCredits = state.usageTotals.payrollPaid;
  state.metrics.creditsGrossPerMin = grossCredits / runMinutes;
  state.metrics.creditsPayrollPerMin = payrollCredits / runMinutes;
  state.metrics.creditsNetPerMin = (grossCredits - payrollCredits) / runMinutes;
  state.metrics.crewRetargetsPerMin = state.usageTotals.crewRetargets / runMinutes;
  state.metrics.criticalStaffDropsPerMin = state.usageTotals.criticalStaffDrops / runMinutes;
  state.metrics.visitorServiceFailuresPerMin = state.usageTotals.visitorServiceFailures / runMinutes;
  const destinationTotal = Math.max(
    1,
    state.usageTotals.visitorLeisureEntries.cafeteria +
      state.usageTotals.visitorLeisureEntries.market +
      state.usageTotals.visitorLeisureEntries.lounge
  );
  state.metrics.visitorDestinationShares = {
    cafeteria: state.usageTotals.visitorLeisureEntries.cafeteria / destinationTotal,
    market: state.usageTotals.visitorLeisureEntries.market / destinationTotal,
    lounge: state.usageTotals.visitorLeisureEntries.lounge / destinationTotal
  };
  state.metrics.avgVisitorWalkDistance =
    state.usageTotals.visitorWalkTrips > 0
      ? state.usageTotals.visitorWalkDistance / state.usageTotals.visitorWalkTrips
      : 0;
  state.metrics.dormVisitsPerMin = state.usageTotals.dorm / runMinutes;
  state.metrics.dormFailedAttemptsPerMin = state.failedNeedAttempts.dorm / runMinutes;
  state.metrics.hygieneUsesPerMin = state.usageTotals.hygiene / runMinutes;
  state.metrics.mealsConsumedPerMin = state.usageTotals.meals / runMinutes;
  state.metrics.bodyVisibleCount = state.bodyTiles.length;
  state.metrics.criticalUnstaffedSec = {
    lifeSupport: state.usageTotals.criticalUnstaffedSec.lifeSupport,
    hydroponics: state.usageTotals.criticalUnstaffedSec.hydroponics,
    kitchen: state.usageTotals.criticalUnstaffedSec.kitchen
  };
  state.metrics.lifeSupportInactiveReasons = collectLifeSupportInactiveReasons(state);
  const roomWarnings = collectTopRoomWarnings(state);
  const criticalFloorWarnings: string[] = [];
  if (
    state.metrics.requiredCriticalStaff.lifeSupport > 0 &&
    state.metrics.activeCriticalStaff.lifeSupport < state.metrics.requiredCriticalStaff.lifeSupport
  ) {
    if (state.metrics.assignedCriticalStaff.lifeSupport <= 0) criticalFloorWarnings.push('critical staffing: life-support no_assigned_staff');
    else if (state.metrics.staffInTransitBySystem.lifeSupport > 0) criticalFloorWarnings.push('critical staffing: life-support staff_in_transit');
    else criticalFloorWarnings.push('critical staffing: life-support under_capacity');
  }
  if (
    state.metrics.requiredCriticalStaff.reactor > 0 &&
    state.metrics.activeCriticalStaff.reactor < state.metrics.requiredCriticalStaff.reactor
  ) {
    if (state.metrics.assignedCriticalStaff.reactor <= 0) criticalFloorWarnings.push('critical staffing: reactor no_assigned_staff');
    else if (state.metrics.staffInTransitBySystem.reactor > 0) criticalFloorWarnings.push('critical staffing: reactor staff_in_transit');
    else criticalFloorWarnings.push('critical staffing: reactor under_capacity');
  }
  if (
    (state.metrics.mealStock < FOOD_CHAIN_LOW_MEAL_STOCK || state.metrics.kitchenRawBuffer < FOOD_CHAIN_LOW_KITCHEN_RAW) &&
    state.ops.hydroponicsTotal > 0 &&
    state.ops.hydroponicsActive <= 0
  ) {
    if (state.metrics.assignedCriticalStaff.hydroponics <= 0) criticalFloorWarnings.push('critical staffing: hydroponics no_assigned_staff');
    else if (state.metrics.staffInTransitBySystem.hydroponics > 0) criticalFloorWarnings.push('critical staffing: hydroponics staff_in_transit');
    else criticalFloorWarnings.push('critical staffing: hydroponics under_capacity');
  }
  if (
    (state.metrics.mealStock < FOOD_CHAIN_LOW_MEAL_STOCK || state.metrics.kitchenRawBuffer < FOOD_CHAIN_LOW_KITCHEN_RAW) &&
    state.ops.kitchenTotal > 0 &&
    state.ops.kitchenActive <= 0
  ) {
    if (state.metrics.assignedCriticalStaff.kitchen <= 0) criticalFloorWarnings.push('critical staffing: kitchen no_assigned_staff');
    else if (state.metrics.staffInTransitBySystem.kitchen > 0) criticalFloorWarnings.push('critical staffing: kitchen staff_in_transit');
    else criticalFloorWarnings.push('critical staffing: kitchen under_capacity');
  }
  if (state.metrics.mealStock < FOOD_CHAIN_LOW_MEAL_STOCK || state.metrics.kitchenRawBuffer < FOOD_CHAIN_LOW_KITCHEN_RAW) {
    if (state.metrics.hydroponicsActiveGrowNodes > 0 && state.metrics.hydroponicsStaffed <= 0) {
      roomWarnings.unshift('food chain blocked: hydro unstaffed');
    } else if (state.ops.hydroponicsTotal > 0 && state.ops.hydroponicsActive <= 0) {
      roomWarnings.unshift('food chain blocked: hydro inactive');
    }
    if (state.ops.kitchenTotal > 0 && state.ops.kitchenActive <= 0) {
      roomWarnings.unshift('food chain blocked: kitchen inactive');
    }
    if (state.ops.cafeteriasTotal > 0 && state.ops.cafeteriasActive <= 0) {
      roomWarnings.unshift('food chain blocked: cafeteria inactive');
    }
  }
  if (
    state.metrics.pendingJobs > 0 &&
    state.metrics.crewOnLogisticsJobs <= 0 &&
    state.metrics.rawFoodProdRate > 0 &&
    state.metrics.kitchenMealProdRate <= 0.01
  ) {
    roomWarnings.unshift('food chain blocked: no logistics hauler');
  }
  if (state.metrics.airQuality < 20 && state.metrics.lifeSupportInactiveReasons.length > 0) {
    roomWarnings.unshift(`life-support blocked: ${state.metrics.lifeSupportInactiveReasons.join(', ')}`);
  }
  if (
    state.ops.dormsActive > 0 &&
    state.residents.some((r) => r.energy < DORM_SEEK_ENERGY_THRESHOLD) &&
    state.metrics.toDormResidents + state.metrics.dormSleepingResidents <= 0
  ) {
    roomWarnings.unshift('dorm available but underused');
  }
  if (criticalFloorWarnings.length > 0) {
    roomWarnings.unshift(...criticalFloorWarnings.reverse());
  }
  state.metrics.topRoomWarnings = roomWarnings.slice(0, 3);

  const moraleParts = [
    { label: 'fatigue', value: crewFatiguePenalty },
    { label: 'hygiene', value: crewHygienePenalty },
    { label: 'low air', value: airPenalty },
    { label: 'power deficit', value: powerPenalty },
    { label: 'payroll stress', value: payrollPenalty }
  ]
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)
    .map((p) => `${p.label} ${p.value.toFixed(1)}`);
  state.metrics.crewMoraleDrivers = moraleParts;
  const ratingParts = [
    { label: 'queue timeout', value: state.usageTotals.ratingFromShipTimeout },
    { label: 'no eligible dock', value: state.usageTotals.ratingFromShipSkip },
    { label: 'service failure', value: state.usageTotals.ratingFromVisitorFailure },
    { label: 'long walks', value: state.usageTotals.ratingFromWalkDissatisfaction }
  ]
    .filter((p) => p.value > 0.01)
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)
    .map((p) => `${p.label} -${p.value.toFixed(1)}`);
  state.metrics.stationRatingDrivers = ratingParts.length > 0 ? ratingParts : ['none'];
  state.metrics.stationRatingPenaltyTotal = {
    queueTimeout: state.usageTotals.ratingFromShipTimeout,
    noEligibleDock: state.usageTotals.ratingFromShipSkip,
    serviceFailure: state.usageTotals.ratingFromVisitorFailure,
    longWalks: state.usageTotals.ratingFromWalkDissatisfaction
  };
  state.metrics.stationRatingPenaltyPerMin = {
    queueTimeout: state.usageTotals.ratingFromShipTimeout / runMinutes,
    noEligibleDock: state.usageTotals.ratingFromShipSkip / runMinutes,
    serviceFailure: state.usageTotals.ratingFromVisitorFailure / runMinutes,
    longWalks: state.usageTotals.ratingFromWalkDissatisfaction / runMinutes
  };
  state.metrics.stationRatingBonusTotal = {
    mealService: state.usageTotals.ratingFromVisitorSuccessByReason.mealService,
    leisureService: state.usageTotals.ratingFromVisitorSuccessByReason.leisureService,
    successfulExit: state.usageTotals.ratingFromVisitorSuccessByReason.successfulExit
  };
  state.metrics.stationRatingBonusPerMin = {
    mealService: state.usageTotals.ratingFromVisitorSuccessByReason.mealService / runMinutes,
    leisureService: state.usageTotals.ratingFromVisitorSuccessByReason.leisureService / runMinutes,
    successfulExit: state.usageTotals.ratingFromVisitorSuccessByReason.successfulExit / runMinutes
  };
  state.metrics.stationRatingServiceFailureByReasonTotal = {
    noLeisurePath: state.usageTotals.ratingFromVisitorFailureByReason.noLeisurePath,
    shipServicesMissing: state.usageTotals.ratingFromVisitorFailureByReason.shipServicesMissing,
    patienceBail: state.usageTotals.ratingFromVisitorFailureByReason.patienceBail,
    dockTimeout: state.usageTotals.ratingFromVisitorFailureByReason.dockTimeout,
    trespass: state.usageTotals.ratingFromVisitorFailureByReason.trespass
  };
  state.metrics.stationRatingServiceFailureByReasonPerMin = {
    noLeisurePath: state.usageTotals.ratingFromVisitorFailureByReason.noLeisurePath / runMinutes,
    shipServicesMissing: state.usageTotals.ratingFromVisitorFailureByReason.shipServicesMissing / runMinutes,
    patienceBail: state.usageTotals.ratingFromVisitorFailureByReason.patienceBail / runMinutes,
    dockTimeout: state.usageTotals.ratingFromVisitorFailureByReason.dockTimeout / runMinutes,
    trespass: state.usageTotals.ratingFromVisitorFailureByReason.trespass / runMinutes
  };
}

function expireEffects(state: StationState): void {
  for (const [idx, until] of state.effects.blockedUntilByTile.entries()) {
    if (until <= state.now) {
      state.effects.blockedUntilByTile.delete(idx);
    }
  }
}

export function createInitialState(options?: { seed?: number }): StationState {
  const rng = makeRng(options?.seed ?? 1337);
  const tiles = new Array<TileType>(GRID_WIDTH * GRID_HEIGHT).fill(TileType.Space);
  const zones = new Array<ZoneType>(GRID_WIDTH * GRID_HEIGHT).fill(ZoneType.Public);
  const rooms = new Array<RoomType>(GRID_WIDTH * GRID_HEIGHT).fill(RoomType.None);
  const modules = new Array<ModuleType>(GRID_WIDTH * GRID_HEIGHT).fill(ModuleType.None);

  for (let y = 14; y < 24; y++) {
    for (let x = 25; x < 35; x++) {
      tiles[toIndex(x, y, GRID_WIDTH)] = TileType.Floor;
    }
  }
  for (let y = 13; y < 25; y++) {
    tiles[toIndex(24, y, GRID_WIDTH)] = TileType.Wall;
    tiles[toIndex(35, y, GRID_WIDTH)] = TileType.Wall;
  }
  for (let x = 24; x < 36; x++) {
    tiles[toIndex(x, 13, GRID_WIDTH)] = TileType.Wall;
    tiles[toIndex(x, 24, GRID_WIDTH)] = TileType.Wall;
  }

  const coreX = Math.floor(GRID_WIDTH / 2);
  const coreY = Math.floor(GRID_HEIGHT / 2);
  const frameTiles: number[] = [];
  for (let y = coreY - 1; y <= coreY + 1; y++) {
    for (let x = coreX - 1; x <= coreX + 1; x++) {
      const idx = toIndex(x, y, GRID_WIDTH);
      if (x === coreX && y === coreY) {
        tiles[idx] = TileType.Floor;
        rooms[idx] = RoomType.Reactor;
      } else if (x === coreX || y === coreY) {
        tiles[idx] = TileType.Door;
      } else {
        tiles[idx] = TileType.Wall;
      }
      frameTiles.push(idx);
    }
  }
  const laneProfiles = generateLaneProfiles({ rng } as StationState);

  return {
    width: GRID_WIDTH,
    height: GRID_HEIGHT,
    tiles,
    zones,
    rooms,
    modules,
    core: {
      centerTile: toIndex(coreX, coreY, GRID_WIDTH),
      serviceTile: toIndex(coreX, coreY, GRID_WIDTH),
      frameTiles
    },
    docks: [],
    laneProfiles,
    dockQueue: [],
    pressurized: new Array<boolean>(GRID_WIDTH * GRID_HEIGHT).fill(false),
    pathOccupancyByTile: new Map(),
    jobs: [],
    itemNodes: [],
    visitors: [],
    residents: [],
    crewMembers: [],
    arrivingShips: [],
    pendingSpawns: [],
    metrics: {
      visitorsCount: 0,
      residentsCount: 0,
      incidentsTotal: 0,
      load: 0,
      capacity: 0,
      loadPct: 0,
      powerSupply: 0,
      powerDemand: 0,
      morale: 80,
      stationRating: STATION_RATING_START,
      stationRatingTrendPerMin: 0,
      rawFoodStock: 40,
      mealStock: 20,
      kitchenRawBuffer: 0,
      waterStock: 70,
      airQuality: 75,
      pressurizationPct: 0,
      leakingTiles: 0,
      materials: 420,
      credits: 60,
      rawFoodProdRate: 0,
      mealPrepRate: 0,
      kitchenMealProdRate: 0,
      mealUseRate: 0,
      dockedShips: 0,
      averageDockTime: 0,
      bayUtilizationPct: 0,
      exitsPerMin: 0,
      shipsSkippedNoEligibleDock: 0,
      shipsTimedOutInQueue: 0,
      dockQueueLengthByLane: { north: 0, east: 0, south: 0, west: 0 },
      avgVisitorWalkDistance: 0,
      dockZonesTotal: 0,
      shipDemandCafeteriaPct: 42,
      shipDemandMarketPct: 36,
      shipDemandLoungePct: 22,
      visitorsByArchetype: {
        diner: 0,
        shopper: 0,
        lounger: 0,
        rusher: 0
      },
      mealsServedTotal: 0,
      cafeteriaNonNodeSeatedCount: 0,
      maxBlockedTicksObserved: 0,
      pendingJobs: 0,
      assignedJobs: 0,
      expiredJobs: 0,
      completedJobs: 0,
      createdJobs: 0,
      avgJobAgeSec: 0,
      deliveryLatencySec: 0,
      topBacklogType: 'none',
      oldestPendingJobAgeSec: 0,
      stalledJobs: 0,
      deathsTotal: 0,
      recentDeaths: 0,
      distressedResidents: 0,
      criticalResidents: 0,
      bodyCount: 0,
      bodyVisibleCount: 0,
      bodiesClearedTotal: 0,
      lifeSupportPotentialAirPerSec: 0,
      lifeSupportActiveAirPerSec: 0,
      airTrendPerSec: 0,
      airBlockedLowAirSec: 0,
      airBlockedWarningActive: false,
      lifeSupportInactiveReasons: [],
      dormSleepingResidents: 0,
      toDormResidents: 0,
      hygieneCleaningResidents: 0,
      cafeteriaQueueingCount: 0,
      cafeteriaEatingCount: 0,
      hydroponicsStaffed: 0,
      hydroponicsActiveGrowNodes: 0,
      lifeSupportActiveNodes: 0,
      crewAssignedWorking: 0,
      crewIdleAvailable: 0,
      crewResting: 0,
      crewOnLogisticsJobs: 0,
      crewBlockedNoPath: 0,
      crewRestCap: 0,
      crewRestingNow: 0,
      crewEmergencyWakeBudget: 0,
      crewWokenForAir: 0,
      crewPingPongPreventions: 0,
      creditsGrossPerMin: 0,
      creditsPayrollPerMin: 0,
      creditsNetPerMin: 0,
      crewRetargetsPerMin: 0,
      criticalStaffDropsPerMin: 0,
      visitorServiceFailuresPerMin: 0,
      visitorDestinationShares: {
        cafeteria: 0,
        market: 0,
        lounge: 0
      },
      dormVisitsPerMin: 0,
      dormFailedAttemptsPerMin: 0,
      hygieneUsesPerMin: 0,
      mealsConsumedPerMin: 0,
      failedNeedAttemptsHunger: 0,
      failedNeedAttemptsEnergy: 0,
      failedNeedAttemptsHygiene: 0,
      idleCrewByReason: {
        idle_available: 0,
        idle_no_jobs: 0,
        idle_resting: 0,
        idle_no_path: 0,
        idle_waiting_reassign: 0
      },
      stalledJobsByReason: {
        none: 0,
        stalled_path_blocked: 0,
        stalled_unreachable_source: 0,
        stalled_unreachable_dropoff: 0,
        stalled_no_supply: 0
      },
      crewMoraleDrivers: [],
      stationRatingDrivers: ['none'],
      stationRatingPenaltyPerMin: {
        queueTimeout: 0,
        noEligibleDock: 0,
        serviceFailure: 0,
        longWalks: 0
      },
      stationRatingPenaltyTotal: {
        queueTimeout: 0,
        noEligibleDock: 0,
        serviceFailure: 0,
        longWalks: 0
      },
      stationRatingBonusPerMin: {
        mealService: 0,
        leisureService: 0,
        successfulExit: 0
      },
      stationRatingBonusTotal: {
        mealService: 0,
        leisureService: 0,
        successfulExit: 0
      },
      stationRatingServiceFailureByReasonPerMin: {
        noLeisurePath: 0,
        shipServicesMissing: 0,
        patienceBail: 0,
        dockTimeout: 0,
        trespass: 0
      },
      stationRatingServiceFailureByReasonTotal: {
        noLeisurePath: 0,
        shipServicesMissing: 0,
        patienceBail: 0,
        dockTimeout: 0,
        trespass: 0
      },
      topRoomWarnings: [],
      criticalUnstaffedSec: {
        lifeSupport: 0,
        hydroponics: 0,
        kitchen: 0
      },
      requiredCriticalStaff: {
        reactor: 0,
        lifeSupport: 0,
        hydroponics: 0,
        kitchen: 0,
        cafeteria: 0
      },
      assignedCriticalStaff: {
        reactor: 0,
        lifeSupport: 0,
        hydroponics: 0,
        kitchen: 0,
        cafeteria: 0
      },
      activeCriticalStaff: {
        reactor: 0,
        lifeSupport: 0,
        hydroponics: 0,
        kitchen: 0,
        cafeteria: 0
      },
      criticalShortfallSec: {
        reactor: 0,
        lifeSupport: 0,
        hydroponics: 0,
        kitchen: 0,
        cafeteria: 0
      },
      logisticsDispatchSlots: 0,
      logisticsPressure: 0,
      staffInTransitBySystem: {
        reactor: 0,
        lifeSupport: 0,
        hydroponics: 0,
        kitchen: 0,
        cafeteria: 0
      }
    },
    controls: {
      paused: true,
      simSpeed: 1,
      shipsPerCycle: 1,
      showZones: true,
      showServiceNodes: false,
      taxRate: 0.2,
      dockPlacementFacing: 'north',
      crewPriorityPreset: 'balanced',
      crewPriorityWeights: cloneCrewPriorityWeights(CREW_PRIORITY_PRESET_WEIGHTS.balanced)
    },
    effects: {
      cafeteriaStallUntil: 0,
      brownoutUntil: 0,
      securityDelayUntil: 0,
      blockedUntilByTile: new Map()
    },
    rng,
    now: 0,
    lastCycleTime: 0,
    cycleDuration: CYCLE_DURATION,
    spawnCounter: 1,
    shipSpawnCounter: 1,
    crewSpawnCounter: 1,
    residentSpawnCounter: 1,
    lastResidentSpawnAt: -999,
    jobSpawnCounter: 1,
    incidentHeat: 0,
    lastPayrollAt: 0,
    recentExitTimes: [],
    dockedTimeTotal: 0,
    dockedShipsCompleted: 0,
    bodyTiles: [],
    recentDeathTimes: [],
    clusterActivationState: new Map(),
    criticalStaffPrevUnmet: {
      reactor: false,
      lifeSupport: false,
      hydroponics: false,
      kitchen: false,
      cafeteria: false
    },
    usageTotals: {
      dorm: 0,
      hygiene: 0,
      meals: 0,
      crewRetargets: 0,
      visitorServiceFailures: 0,
      creditsMarketGross: 0,
      creditsMealPayoutGross: 0,
      payrollPaid: 0,
      visitorLeisureEntries: {
        cafeteria: 0,
        market: 0,
        lounge: 0
      },
      ratingDelta: 0,
      ratingFromShipTimeout: 0,
      ratingFromShipSkip: 0,
      ratingFromVisitorFailure: 0,
      ratingFromWalkDissatisfaction: 0,
      ratingFromVisitorFailureByReason: {
        noLeisurePath: 0,
        shipServicesMissing: 0,
        patienceBail: 0,
        dockTimeout: 0,
        trespass: 0
      },
      ratingFromVisitorSuccessByReason: {
        mealService: 0,
        leisureService: 0,
        successfulExit: 0
      },
      visitorWalkDistance: 0,
      visitorWalkTrips: 0,
      criticalStaffDrops: 0,
      criticalUnstaffedSec: {
        lifeSupport: 0,
        hydroponics: 0,
        kitchen: 0
      }
    },
    failedNeedAttempts: {
      hunger: 0,
      energy: 0,
      hygiene: 0,
      dorm: 0
    },
    crew: {
      total: 8,
      assigned: 0,
      free: 8
    },
    ops: {
      cafeteriasTotal: 0,
      cafeteriasActive: 0,
      kitchenTotal: 0,
      kitchenActive: 0,
      securityTotal: 0,
      securityActive: 0,
      reactorsTotal: 0,
      reactorsActive: 0,
      dormsTotal: 0,
      dormsActive: 0,
      hygieneTotal: 0,
      hygieneActive: 0,
      hydroponicsTotal: 0,
      hydroponicsActive: 0,
      lifeSupportTotal: 0,
      lifeSupportActive: 0,
      loungeTotal: 0,
      loungeActive: 0,
      marketTotal: 0,
      marketActive: 0
    }
  };
}

export function setTile(state: StationState, index: number, tile: TileType): void {
  state.tiles[index] = tile;
  if (!isWalkable(tile)) {
    state.rooms[index] = RoomType.None;
    state.modules[index] = ModuleType.None;
    if (state.bodyTiles.length > 0) {
      state.bodyTiles = state.bodyTiles.filter((t) => t !== index);
      state.metrics.bodyVisibleCount = state.bodyTiles.length;
    }
  }
  if (tile !== TileType.Dock) {
    state.docks = state.docks.filter((d) => !d.tiles.includes(index));
  } else {
    rebuildDockEntities(state);
  }
}

export function trySetTile(state: StationState, index: number, tile: TileType): boolean {
  const old = state.tiles[index];
  if (old === tile) return true;
  if (tile === TileType.Dock) {
    const dockCheck = validateDockPlacementWithNeighbors(state, index);
    if (!dockCheck.valid) return false;
  }
  const oldCost = tileDistanceBuildCost(state, index, old);
  const newCost = tileDistanceBuildCost(state, index, tile);
  const delta = Math.max(0, newCost - oldCost);
  if (state.metrics.materials < delta) return false;
  const proposedTiles = state.tiles.slice();
  proposedTiles[index] = tile;
  if (tile === TileType.Space) {
    if (!isConnectedToCore(state, proposedTiles)) return false;
  } else if (!isConnectedToCore(state, proposedTiles)) {
    return false;
  }
  state.metrics.materials -= delta;
  setTile(state, index, tile);
  return true;
}

export function setZone(state: StationState, index: number, zone: ZoneType): void {
  state.zones[index] = zone;
}

export function setRoom(state: StationState, index: number, room: RoomType): void {
  if (!isWalkable(state.tiles[index])) return;
  state.rooms[index] = room;
  if (room === RoomType.Dorm) {
    state.zones[index] = ZoneType.Restricted;
  }
}

export function setModule(state: StationState, index: number, module: ModuleType): void {
  if (!isWalkable(state.tiles[index])) return;
  state.modules[index] = module;
}

export function buyMaterials(state: StationState, creditCost: number, materialsGain: number): boolean {
  if (state.metrics.credits < creditCost) return false;
  state.metrics.credits -= creditCost;
  state.metrics.materials += materialsGain;
  return true;
}

export function buyRawFood(state: StationState, creditCost: number, rawFoodGain: number): boolean {
  if (state.metrics.credits < creditCost) return false;
  state.metrics.credits -= creditCost;
  state.metrics.rawFoodStock = clamp(state.metrics.rawFoodStock + rawFoodGain, 0, 260);
  return true;
}

export function hireCrew(state: StationState, creditCost = HIRE_COST): boolean {
  if (state.metrics.credits < creditCost) return false;
  if (state.crew.total >= 40) return false;
  state.metrics.credits -= creditCost;
  state.crew.total += 1;
  return true;
}

export function fireCrew(state: StationState, creditRefund = 0): boolean {
  if (state.crew.total <= 0) return false;
  state.crew.total -= 1;
  if (creditRefund > 0) {
    state.metrics.credits += creditRefund;
  }
  return true;
}

export function clearBodies(state: StationState): boolean {
  if (state.bodyTiles.length <= 0) return false;
  if (state.metrics.materials < BODY_CLEAR_MATERIAL_COST) return false;
  state.metrics.materials -= BODY_CLEAR_MATERIAL_COST;
  const removed = Math.min(BODY_CLEAR_BATCH, state.bodyTiles.length);
  state.bodyTiles.splice(0, removed);
  state.metrics.bodyCount = Math.max(0, state.metrics.bodyCount - removed);
  state.metrics.bodyVisibleCount = state.bodyTiles.length;
  state.metrics.bodiesClearedTotal += removed;
  state.incidentHeat = Math.max(0, state.incidentHeat - removed * 0.8);
  return true;
}

export function sellMaterials(state: StationState, materialsCost: number, creditGain: number): boolean {
  if (state.metrics.materials < materialsCost) return false;
  state.metrics.materials -= materialsCost;
  state.metrics.credits += creditGain;
  return true;
}

export function sellRawFood(state: StationState, rawFoodCost: number, creditGain: number): boolean {
  if (state.metrics.rawFoodStock < rawFoodCost) return false;
  state.metrics.rawFoodStock = clamp(state.metrics.rawFoodStock - rawFoodCost, 0, 260);
  state.metrics.credits += creditGain;
  return true;
}

export function setCrewPriorityPreset(state: StationState, preset: CrewPriorityPreset): void {
  applyCrewPriorityPreset(state, preset);
}

export function setCrewPriorityWeight(state: StationState, system: CrewPrioritySystem, weight: number): void {
  state.controls.crewPriorityWeights[system] = clamp(Math.round(weight), 1, 10);
}

export function setDockPlacementFacing(state: StationState, facing: SpaceLane): void {
  state.controls.dockPlacementFacing = facing;
}

export function getDockByTile(state: StationState, tileIndex: number): DockEntity | null {
  return state.docks.find((d) => d.tiles.includes(tileIndex)) ?? null;
}

export function setDockFacing(state: StationState, dockId: number, facing: SpaceLane): { ok: boolean; reason?: string } {
  const dock = state.docks.find((d) => d.id === dockId);
  if (!dock) return { ok: false, reason: 'dock not found' };
  const check = validateDockPlacementAt(state, dock.anchorTile, facing);
  if (!check.valid) return { ok: false, reason: check.reason };
  dock.facing = facing;
  dock.lane = laneFromFacing(facing);
  dock.approachTiles = check.approachTiles;
  return { ok: true };
}

export function setDockAllowedShipType(state: StationState, dockId: number, shipType: ShipType, allowed: boolean): void {
  const dock = state.docks.find((d) => d.id === dockId);
  if (!dock) return;
  const next = new Set(dock.allowedShipTypes);
  if (allowed) next.add(shipType);
  else next.delete(shipType);
  if (next.size === 0) next.add('tourist');
  dock.allowedShipTypes = [...next];
}

export function setDockAllowedShipSize(state: StationState, dockId: number, size: ShipSize, allowed: boolean): void {
  const dock = state.docks.find((d) => d.id === dockId);
  if (!dock) return;
  if (!shipSizesUpTo(dock.maxSizeByArea).includes(size)) return;
  const next = new Set(dock.allowedShipSizes);
  if (allowed) next.add(size);
  else next.delete(size);
  if (next.size === 0) next.add('small');
  dock.allowedShipSizes = shipSizesUpTo(dock.maxSizeByArea).filter((s) => next.has(s));
}

export function validateDockPlacement(
  state: StationState,
  tileIndex: number,
  facing?: SpaceLane
): { valid: boolean; reason: string; approachTiles: number[] } {
  return validateDockPlacementWithNeighbors(state, tileIndex, facing);
}

export function tick(state: StationState, frameDt: number): void {
  rebuildDockEntities(state);
  ensureCrewPool(state);
  state.pathOccupancyByTile = buildOccupancyMap(state);
  rebuildItemNodes(state);
  assignCrewJobs(state);
  ensureResidentPopulation(state);
  computePressurization(state);
  refreshRoomOpsFromCrewPresence(state, 0, false);

  if (state.controls.paused) {
    refreshJobMetrics(state);
    computeMetrics(state);
    return;
  }

  const dt = frameDt * state.controls.simSpeed;
  state.now += dt;

  while (state.now - state.lastCycleTime >= state.cycleDuration) {
    state.lastCycleTime += state.cycleDuration;
    scheduleCycleArrivals(state);
  }

  updateSpawns(state);
  updateArrivingShips(state, dt);
  expireEffects(state);
  applyCrewPayroll(state);
  createFoodTransportJobs(state);
  assignJobsToIdleCrew(state);
  requeueStalledJobs(state);
  expireJobs(state);
  computePressurization(state);
  updateResources(state, dt);

  const occupancyByTile = buildOccupancyMap(state);
  state.pathOccupancyByTile = occupancyByTile;
  updateCrewLogic(state, dt, occupancyByTile);
  refreshRoomOpsFromCrewPresence(state, dt, true);
  updateCriticalStaffTracking(state, dt);
  if (ENABLE_RESIDENTS_NOW) {
    updateResidentLogic(state, dt, occupancyByTile);
  } else {
    state.residents.length = 0;
  }
  updateVisitorLogic(state, dt, occupancyByTile);

  assignCrewJobs(state);
  assignJobsToIdleCrew(state);
  expireJobs(state);
  refreshJobMetrics(state);
  refreshRoomOpsFromCrewPresence(state, 0, false);
  ensureResidentPopulation(state);
  computeMetrics(state);
  maybeTriggerFailure(state, dt);
}
