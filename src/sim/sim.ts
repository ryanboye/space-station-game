import { findPath as findPathCore } from './path';
import {
  BERTH_SIZE_MIN,
  MODULE_DEFINITIONS,
  PROCESS_RATES,
  ROOM_ENVIRONMENT_TRAITS,
  ROOM_DEFINITIONS,
  SHIP_SERVICE_WEIGHT_BY_TYPE,
  SERVICE_CAPACITY,
  TASK_TIMINGS
} from './balance';
import { RESIDENT_ROLE_WEIGHTS, RESIDENT_WORK_BONUS } from './content/residents';
import { SHIP_PROFILES } from './content/ships';
import {
  UNLOCK_DEFINITIONS,
  createInitialUnlockState,
  isModuleUnlockedAtTier,
  isRoomUnlockedAtTier
} from './content/unlocks';
import { generateSystemMap, laneWeightsFromSystem } from './system-map';
import {
  type ArrivingShip,
  type BerthSizeClass,
  type CapabilityTag,
  type CardinalDirection,
  type CrewIdleReason,
  type CrewDesire,
  type CrewInspector,
  type CrewPriorityPreset,
  type CrewPrioritySystem,
  type CrewTaskCandidate,
  type CrewPriorityWeights,
  type CriticalCapacityTargets,
  type DockEntity,
  type DockPurpose,
  type DockQueueEntry,
  GRID_HEIGHT,
  GRID_WIDTH,
  type IncidentEntity,
  type HousingInspector,
  type IncidentType,
  type VisitorInspector,
  type LifeSupportCoverageDiagnostic,
  type LifeSupportTileDiagnostic,
  type ResidentInspector,
  type ResidentDesire,
  type ResidentDominantNeed,
  type ResidentRoutinePhase,
  type VisitorDesire,
  type HousingPolicy,
  type LaneProfile,
  type PathIntent,
  type PathOptions,
  type CrewMember,
  type CrewRole,
  type JobStallReason,
  type JobType,
  type JobStatusCounts,
  type JobExpiryContext,
  type ItemType,
  type MaintenanceTileDiagnostic,
  type MaintenanceSystem,
  type ResidentRole,
  type RouteExposure,
  type RoutePressureDiagnostics,
  type RoutePressureDominant,
  type RoutePressureTileDiagnostic,
  type RoomEnvironmentTraits,
  type RoomEnvironmentScore,
  type RoomEnvironmentTileDiagnostic,
  type ShipServiceTag,
  type ShipType,
  type UnlockTier,
  type SpaceLane,
  ModuleType,
  type ModuleInstance,
  type ModuleRotation,
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
  isPressureBarrier,
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
const CREW_PER_WORKSHOP = 1;
const CREW_PER_CLINIC = 1;
const CREW_PER_BRIG = 1;
const CREW_PER_REC_HALL = 1;
const CREW_PER_SECURITY = 1;
const CREW_PER_REACTOR = 1;
const CREW_PER_HYGIENE = 1;
const CREW_PER_HYDROPONICS = 1;
const CREW_PER_LIFE_SUPPORT = 1;
const CREW_PER_LOUNGE = 1;
const CREW_PER_MARKET = 1;

const BASE_POWER_SUPPLY = 14;
const POWER_PER_REACTOR = 22;
const SHIP_APPROACH_TIME = TASK_TIMINGS.shipApproachSec;
const SHIP_DOCKED_TIME = TASK_TIMINGS.shipDockedPassengerSpawnSec;
const SHIP_DEPART_TIME = TASK_TIMINGS.shipDepartSec;
const SHIP_MAX_DOCKED_TIME = TASK_TIMINGS.shipMaxDockedSec;
const MAX_DINERS_PER_CAF_TILE = SERVICE_CAPACITY.tableMaxDiners;
const VISITOR_ROUTE_EXPOSURE_RATING_PENALTY = 0.012;
const RESIDENT_BAD_ROUTE_STRESS = 0.28;
const CREW_PUBLIC_CROWD_DRAIN = 0.018;
const ROOM_ENVIRONMENT_RADIUS = 5;
const VISITOR_ENVIRONMENT_RATING_PENALTY = 0.018;
const RESIDENT_ENVIRONMENT_STRESS = 0.32;
const MAINTENANCE_DEBT_WARNING = 30;
const MAINTENANCE_DEBT_SEVERE = 60;
const MAINTENANCE_IDLE_RISE_PER_MIN = 0.16;
const MAINTENANCE_REACTOR_RISE_PER_MIN = 0.6;
const MAINTENANCE_LIFE_SUPPORT_RISE_PER_MIN = 0.8;
const MAINTENANCE_STAFF_REPAIR_PER_MIN = 4.5;

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

export const SHIP_MIN_DOCK_AREA: Record<ShipSize, number> = {
  small: 1,
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
const VISITOR_BLOCKED_REPATH_TICKS = 8;
const VISITOR_BLOCKED_QUEUE_REROUTE_TICKS = 18;
const VISITOR_BLOCKED_FULL_REASSIGN_TICKS = 34;
const MAX_RESERVATIONS_PER_TABLE = SERVICE_CAPACITY.tableReservationLimit;
const MAX_PENDING_FOOD_JOBS = 10;
const JOB_TTL_SEC = TASK_TIMINGS.jobTtlSec;
const JOB_STALE_SEC = TASK_TIMINGS.jobStaleSec;
const AIR_DISTRESS_THRESHOLD = 15;
const AIR_CRITICAL_THRESHOLD = 8;
const AIR_DISTRESS_EXPOSURE_SEC = 18;
const AIR_CRITICAL_EXPOSURE_SEC = 38;
const AIR_DEATH_EXPOSURE_SEC = 62;
const AIR_BLOCKED_WARNING_DELAY_SEC = 8;
const DORM_SEEK_ENERGY_THRESHOLD = 55;
const BODY_CLEAR_BATCH = 4;
const BODY_CLEAR_MATERIAL_COST = 6;
const RESIDENT_CONVERSION_BASE_CHANCE = 0.03;
const RESIDENT_TAX_PERIOD = 24;
const RESIDENT_TAX_PER_HEAD = 0.42;
const RESIDENT_LEAVE_INTENT_THRESHOLD = 18;
const RESIDENT_LEAVE_INTENT_TRIGGER = 12;
const RESIDENT_RETENTION_RATING_BONUS_PER_SEC = 0.0009;
const RESIDENT_DEPARTURE_RATING_PENALTY = 0.4;
const RESIDENT_AGITATION_CONFRONTATION_THRESHOLD = 60;
const RESIDENT_AGITATION_DECAY_PER_SEC = 1.8;
const RESIDENT_CONFRONTATION_BASE_CHANCE_PER_SEC = 0.05;
const BAD_FIGHT_THRESHOLD = 1.4;
const BAD_FIGHT_ESCALATION_CHANCE = 0.2;
const FIGHT_EXTENDED_MIN_SEC = 2.5;
const FIGHT_EXTENDED_MAX_SEC = 5;
const FIGHT_INCIDENT_RESOLVE_WINDOW_SEC = 12;
const TRESPASS_INCIDENT_RESOLVE_WINDOW_SEC = 8;
const INCIDENT_INTERVENTION_BASE_SEC = 0.8;
const INCIDENT_INTERVENTION_PER_TILE_SEC = 0.3;
const INCIDENT_CONGESTION_WEIGHT_SEC = 0.9;
const INCIDENT_RESOLVED_RETENTION_SEC = 20;
const SECURITY_AURA_RADIUS = 9;
const SECURITY_AURA_MAX_SUPPRESSION_FLOOR = 0.35;
const TRESPASS_TILE_COOLDOWN_SEC = 4;
const RESIDENT_ROUTINE_DAY_SEC = 120;
const RESIDENT_SOCIAL_DECAY_PER_SEC = 0.95;
const RESIDENT_SOCIAL_RECOVERY_PER_SEC = 2.6;
const RESIDENT_SAFETY_DECAY_PER_SEC = 1.1;
const RESIDENT_SAFETY_RECOVERY_PER_SEC = 1.8;
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
// Bladder is a short-cycle need (~3x faster decay than energy). Crew seek a
// Hygiene tile at the threshold; visit is brief (5-7 sec dwell), then they
// return to whatever they were doing. Mirrors the visitor toilet v0 pattern.
const CREW_BLADDER_TOILET_THRESHOLD = 25;
const CREW_BLADDER_DECAY_PER_SEC = 1.25;
const CREW_BLADDER_RELIEF_PER_SEC = 22;
const CREW_BLADDER_EXIT_THRESHOLD = 88;
const CREW_TOILET_MAX_PER_TILE = 1;
// Thirst: short-cycle drink need. Slower decay than bladder so crew typically
// only need a sip a few times per shift. Cantina or WaterFountain refills.
const CREW_THIRST_DRINK_THRESHOLD = 32;
const CREW_THIRST_DECAY_PER_SEC = 0.85;
const CREW_THIRST_RELIEF_CANTINA_PER_SEC = 28;
const CREW_THIRST_RELIEF_FOUNTAIN_PER_SEC = 18;
const CREW_THIRST_EXIT_THRESHOLD = 90;
const KITCHEN_CONVERSION_RATE = PROCESS_RATES.kitchenMealPerSecPerStove;
const WORKSHOP_TRADE_GOOD_RATE = PROCESS_RATES.workshopTradeGoodPerSecPerWorkbench;
const WORKSHOP_MATERIALS_PER_TRADE_GOOD = PROCESS_RATES.workshopRawMaterialPerTradeGood;
const MARKET_TRADE_GOOD_USE_PER_SEC = PROCESS_RATES.marketTradeGoodUsePerVisitorPerSec;
const MAX_PENDING_TRADE_JOBS = 10;
const MARKET_TRADE_GOOD_TARGET_STOCK = 26;
const MARKET_TRADE_GOOD_LOW_STOCK = 8;
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
const DOCK_QUEUE_MAX_TIME_SEC = TASK_TIMINGS.dockQueueMaxSec;
const VISITOR_MIN_STAY_SEC = TASK_TIMINGS.visitorMinStaySec;
const STATION_RATING_START = 70;
const VISITOR_COMFORT_WALK_THRESHOLD = 10;
const VISITOR_WALK_PENALTY_RATE = 0.03;
const LIFE_SUPPORT_AIR_PER_TILE = 1.55 / 6;
const PASSIVE_AIR_PER_SEC_AT_100_PRESSURE = 0.45;
const AIR_SAFETY_BUFFER = 0.24;
const ASSIGNMENT_PREEMPT_MULTIPLIER = 1.25;
const ASSIGNMENT_PREEMPT_DELTA = 2;
const ASSIGNMENT_PATH_COST_WEIGHT = 0.14;
const EXPANSION_STEP_TILES = 40;
const EXPANSION_COST_TIERS = [2000, 4000, 6000, 8000] as const;
const PATH_CACHE_TTL_SEC = 0.45;
const PATH_CACHE_MAX_ENTRIES = 1200;

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
const ITEM_TYPES: ItemType[] = ['rawMeal', 'meal', 'rawMaterial', 'tradeGood', 'body'];

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
  const total = Math.max(
    0.0001,
    weights.tourist + weights.trader + weights.industrial + weights.military + weights.colonist
  );
  return {
    tourist: weights.tourist / total,
    trader: weights.trader / total,
    industrial: weights.industrial / total,
    military: weights.military / total,
    colonist: weights.colonist / total
  };
}

function generateLaneProfiles(state: StationState): Record<SpaceLane, LaneProfile> {
  const profiles = {} as Record<SpaceLane, LaneProfile>;
  // System-map driven path (MVP): derive lane weights from the dominant
  // factions' shipBias tables. Legacy fallback (system null/undefined)
  // keeps the prior pure-RNG behavior so old saves and any path that
  // somehow loses state.system still produces valid weights.
  //
  // PRNG discipline: even when system-driven, we still consume the same
  // number of rng() calls per lane (5: traffic + 4 placeholder draws)
  // so seeded scenarios in tools/sim-tests.ts retain their existing
  // sequence. Without this, replacing the legacy weight roll silently
  // shifted every later random draw and broke deterministic tests.
  const system = state.system ?? null;
  for (const lane of LANES) {
    const trafficVolume = clamp(0.6 + state.rng() * 0.8, 0.4, 1.6);
    const touristBase = 0.25 + state.rng() * 0.45;
    const traderBase = 0.2 + state.rng() * 0.45;
    const industrialBase = 0.15 + state.rng() * 0.35;
    const militaryBase = 0.08 + state.rng() * 0.22;
    const colonistBase = 0.1 + state.rng() * 0.26;
    if (system) {
      profiles[lane] = {
        trafficVolume,
        weights: normalizeTrafficWeights(laneWeightsFromSystem(system, lane))
      };
    } else {
      profiles[lane] = {
        trafficVolume,
        weights: normalizeTrafficWeights({
          tourist: touristBase,
          trader: traderBase,
          industrial: industrialBase,
          military: militaryBase,
          colonist: colonistBase
        })
      };
    }
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
  const roll = state.rng();
  if (roll <= weights.tourist) return 'tourist';
  if (roll <= weights.tourist + weights.trader) return 'trader';
  if (roll <= weights.tourist + weights.trader + weights.industrial) return 'industrial';
  if (roll <= weights.tourist + weights.trader + weights.industrial + weights.military) return 'military';
  return 'colonist';
}

function hasPrivateHousingReady(state: StationState): boolean {
  return privateHousingUnits(state).length > 0 && privateHygieneTargets(state).length > 0;
}

function serviceTagUnlockTier(tag: ShipServiceTag): UnlockTier {
  if (tag === 'market' || tag === 'lounge') return 1;
  if (tag === 'workshop') return 2;
  if (tag === 'security' || tag === 'housing' || tag === 'clinic' || tag === 'recreation') return 3;
  return 0;
}

function isServiceTagUnlocked(state: StationState, tag: ShipServiceTag): boolean {
  return state.unlocks.tier >= serviceTagUnlockTier(tag);
}

function shipServiceTagSatisfied(state: StationState, tag: ShipServiceTag): boolean {
  if (!isServiceTagUnlocked(state, tag)) return true;
  if (tag === 'cafeteria') return state.ops.cafeteriasActive > 0;
  if (tag === 'market') return state.ops.marketActive > 0;
  if (tag === 'lounge') {
    return state.ops.loungeActive > 0 || state.ops.recHallActive > 0 || state.ops.cantinaActive > 0 || state.ops.observatoryActive > 0;
  }
  if (tag === 'workshop') return state.ops.workshopActive > 0;
  if (tag === 'security') return state.ops.securityActive > 0 || state.ops.brigActive > 0;
  if (tag === 'hygiene') return state.ops.hygieneActive > 0 || state.ops.clinicActive > 0;
  if (tag === 'housing') return hasPrivateHousingReady(state);
  if (tag === 'clinic') return state.ops.clinicActive > 0;
  return state.ops.recHallActive > 0 || state.ops.loungeActive > 0 || state.ops.cantinaActive > 0 || state.ops.observatoryActive > 0;
}

function shipServicesSatisfied(state: StationState, shipType: ShipType): boolean {
  const profile = SHIP_PROFILES[shipType];
  if (!profile) return true;
  for (const tag of profile.serviceTags) {
    if (!shipServiceTagSatisfied(state, tag)) return false;
  }
  return true;
}

function shipTypeUnlockTier(shipType: ShipType): UnlockTier {
  if (shipType === 'tourist' || shipType === 'trader') return 0;
  if (shipType === 'industrial') return 2;
  return 3;
}

export function isShipTypeUnlocked(state: StationState, shipType: ShipType): boolean {
  return state.unlocks.tier >= shipTypeUnlockTier(shipType);
}

export function isRoomUnlocked(state: StationState, room: RoomType): boolean {
  return isRoomUnlockedAtTier(room, state.unlocks.tier);
}

export function isModuleUnlocked(state: StationState, module: ModuleType): boolean {
  return isModuleUnlockedAtTier(module, state.unlocks.tier);
}

function updateUnlockProgress(state: StationState): void {
  const unlockIdSet = new Set(state.unlocks.unlockedIds);
  // Predicate-driven advance. Loop up from current tier, evaluate each
  // tier's trigger against live metrics. Monotonic lifetime counters
  // mean predicates never go false once true, so the advance is
  // stable across save/load + safe to re-evaluate each tick. At the
  // first un-met tier, record progress (for the "coming next" UI)
  // and stop — we never advance past a gate that hasn't fired.
  for (let t = state.unlocks.tier + 1; t <= 6; t++) {
    const tier = t as UnlockTier;
    const def = UNLOCK_DEFINITIONS.find((d) => d.tier === tier);
    if (!def) break;
    if (def.trigger.predicate(state.metrics)) {
      state.unlocks.tier = tier;
      unlockIdSet.add(def.id);
      state.unlocks.unlockedAtSec[def.id] = state.now;
      state.unlocks.triggerProgress[tier] = 1;
      continue; // check the next tier in the same tick
    }
    state.unlocks.triggerProgress[tier] = def.trigger.progress(state.metrics);
    break;
  }
  state.unlocks.unlockedIds = [...unlockIdSet];
  state.metrics.unlockTier = state.unlocks.tier;
}

function serviceFailureRatingPenalty(
  state: StationState,
  amount: number,
  bucket:
    | 'ratingFromVisitorFailure'
    | 'ratingFromShipSkip'
    | 'ratingFromShipTimeout'
    | 'ratingFromWalkDissatisfaction'
    | 'ratingFromRouteExposure'
    | 'ratingFromEnvironment'
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
  allowRestricted: boolean,
  intent: PathIntent = 'visitor'
): number[] | null {
  let best: number[] | null = null;
  for (const target of targets) {
    const path = findPath(state, start, target, { allowRestricted, intent }, state.pathOccupancyByTile);
    if (!path) continue;
    if (!best || path.length < best.length) {
      best = path;
    }
  }
  // Fallback: if strict zoning blocks all routes, allow restricted traversal.
  if (!best && !allowRestricted) {
    for (const target of targets) {
      const path = findPath(state, start, target, { allowRestricted: true, intent }, state.pathOccupancyByTile);
      if (!path) continue;
      if (!best || path.length < best.length) {
        best = path;
      }
    }
  }
  return best;
}

function chooseCrewRestPath(
  state: StationState,
  crew: CrewMember,
  targets: number[],
  occupancyByTile: Map<number, number>
): number[] | null {
  let best: { path: number[]; score: number } | null = null;
  for (const target of targets) {
    const occupied = occupancyByTile.get(target) ?? 0;
    if (target !== crew.tileIndex && occupied >= MAX_OCCUPANTS_PER_TILE) continue;
    const restTargetLoad = state.crewMembers.reduce((sum, other) => {
      if (other.id === crew.id || !other.resting) return sum;
      const plannedTarget = other.path.length > 0 ? other.path[other.path.length - 1] : other.tileIndex;
      return plannedTarget === target ? sum + 1 : sum;
    }, 0);
    const path =
      findPath(state, crew.tileIndex, target, { allowRestricted: false, intent: 'crew' }, occupancyByTile) ??
      findPath(state, crew.tileIndex, target, { allowRestricted: true, intent: 'crew' }, occupancyByTile);
    if (!path) continue;
    const nextTile = path[0] ?? target;
    const nextOccupancy = occupancyByTile.get(nextTile) ?? 0;
    const score = path.length + restTargetLoad * 18 + occupied * 10 + nextOccupancy * 5;
    if (!best || score < best.score) best = { path, score };
  }
  return best?.path ?? null;
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

function defaultHousingPolicyForRoom(room: RoomType): HousingPolicy {
  if (room === RoomType.Dorm || room === RoomType.Hygiene) return 'crew';
  return 'visitor';
}

function isHousingPolicyAllowedForRoom(room: RoomType, policy: HousingPolicy): boolean {
  if (room !== RoomType.Dorm && room !== RoomType.Hygiene) return false;
  return policy === 'crew' || policy === 'visitor' || policy === 'resident' || policy === 'private_resident';
}

function collectRoomTilesByPolicy(state: StationState, room: RoomType, policies: HousingPolicy[]): number[] {
  const allowed = new Set(policies);
  const out: number[] = [];
  for (let i = 0; i < state.rooms.length; i++) {
    if (state.rooms[i] !== room || !isWalkable(state.tiles[i])) continue;
    if (!allowed.has(state.roomHousingPolicies[i])) continue;
    out.push(i);
  }
  return out;
}

function moduleFootprint(type: ModuleType, rotation: ModuleRotation): { width: number; height: number } {
  const def = MODULE_DEFINITIONS[type];
  if (!def) return { width: 1, height: 1 };
  if (rotation === 90 && def.rotatable) {
    return { width: def.height, height: def.width };
  }
  return { width: def.width, height: def.height };
}

function footprintTiles(
  state: StationState,
  originTile: number,
  width: number,
  height: number
): number[] {
  const origin = fromIndex(originTile, state.width);
  const out: number[] = [];
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      const x = origin.x + dx;
      const y = origin.y + dy;
      if (!inBounds(x, y, state.width, state.height)) return [];
      out.push(toIndex(x, y, state.width));
    }
  }
  return out;
}

function syncModuleOccupancy(state: StationState): void {
  state.modules.fill(ModuleType.None);
  state.moduleOccupancyByTile.fill(null);
  for (const module of state.moduleInstances) {
    for (const tile of module.tiles) {
      state.modules[tile] = module.type;
      state.moduleOccupancyByTile[tile] = module.id;
    }
  }
  rebuildItemNodes(state);
  bumpModuleVersion(state);
}

function removeModuleById(state: StationState, moduleId: number): boolean {
  const idx = state.moduleInstances.findIndex((m) => m.id === moduleId);
  if (idx < 0) return false;
  state.moduleInstances.splice(idx, 1);
  syncModuleOccupancy(state);
  return true;
}

function collectModuleAnchors(
  state: StationState,
  moduleType: ModuleType,
  room?: RoomType
): number[] {
  const out: number[] = [];
  for (const module of state.moduleInstances) {
    if (module.type !== moduleType) continue;
    if (room !== undefined && state.rooms[module.originTile] !== room) continue;
    out.push(module.originTile);
  }
  return out;
}

function moduleTypesForRoomServices(room: RoomType): ModuleType[] {
  if (room === RoomType.Dorm) return [ModuleType.Bed];
  if (room === RoomType.Cafeteria) return [ModuleType.ServingStation];
  if (room === RoomType.Kitchen) return [ModuleType.Stove];
  if (room === RoomType.Workshop) return [ModuleType.Workbench];
  if (room === RoomType.Clinic) return [ModuleType.MedBed];
  if (room === RoomType.Brig) return [ModuleType.CellConsole];
  if (room === RoomType.RecHall) return [ModuleType.RecUnit];
  if (room === RoomType.Hydroponics) return [ModuleType.GrowStation];
  if (room === RoomType.Security) return [ModuleType.Terminal];
  if (room === RoomType.Lounge) return [ModuleType.Couch, ModuleType.GameStation];
  if (room === RoomType.Market) return [ModuleType.MarketStall];
  if (room === RoomType.Cantina) return [ModuleType.BarCounter];
  if (room === RoomType.Observatory) return [ModuleType.Telescope];
  if (room === RoomType.LogisticsStock) return [ModuleType.IntakePallet];
  if (room === RoomType.Storage) return [ModuleType.StorageRack];
  return [];
}

const SERVICE_NODE_OVERLAY_ROOMS: RoomType[] = [
  RoomType.Cafeteria,
  RoomType.Kitchen,
  RoomType.Workshop,
  RoomType.Clinic,
  RoomType.Brig,
  RoomType.RecHall,
  RoomType.Reactor,
  RoomType.Security,
  RoomType.Dorm,
  RoomType.Hygiene,
  RoomType.Hydroponics,
  RoomType.LifeSupport,
  RoomType.Lounge,
  RoomType.Market,
  RoomType.Cantina,
  RoomType.Observatory,
  RoomType.LogisticsStock,
  RoomType.Storage
];

const CACHED_ROOM_TYPES: RoomType[] = [
  RoomType.None,
  RoomType.Cafeteria,
  RoomType.Kitchen,
  RoomType.Workshop,
  RoomType.Clinic,
  RoomType.Brig,
  RoomType.RecHall,
  RoomType.Reactor,
  RoomType.Security,
  RoomType.Dorm,
  RoomType.Hygiene,
  RoomType.Hydroponics,
  RoomType.LifeSupport,
  RoomType.Lounge,
  RoomType.Market,
  RoomType.LogisticsStock,
  RoomType.Storage,
  // Without this entry, painting Berth tiles bumps roomVersion → cache
  // invalidates → ensureRoomClustersCache rebuilds, but its loop only
  // iterates CACHED_ROOM_TYPES (sim.ts:787), so Berth tiles never get
  // entered into state.derived.clusterByTile. Downstream, getRoomInspectorAt
  // (sim.ts:3185) does:
  //   const clusterMeta = state.derived.clusterByTile.get(tileIndex);
  //   if (!clusterMeta || clusterMeta.room !== room) return null;
  // and returns null for every click on a Berth tile. refreshRoomModal
  // then renders default text ("type=none, cluster=0 tiles, Berth: n/a")
  // because it received a null inspector. The mouseup handler subsequently
  // calls roomModal.classList.remove('hidden'), so the modal opens but its
  // contents are stale — exactly the symptom BMO reported (modal visible,
  // type=none, cluster=0 tiles, all defaults).
  RoomType.Berth,
  RoomType.Cantina,
  RoomType.Observatory
];

function createEmptyDerivedCache(): StationState['derived'] {
  return {
    serviceTargetsByRoom: new Map(),
    queueTargets: [],
    queueTargetSet: new Set(),
    roomClustersByRoom: new Map(),
    clusterByTile: new Map(),
    dockByTile: new Map(),
    itemNodeByTile: new Map(),
    pathCache: new Map(),
    activeRoomTiles: new Set(),
    serviceReachability: {
      nodeTiles: [],
      unreachableNodeTiles: []
    },
    diagnostics: {
      diagnosticsByAnchor: new Map(),
      inspectionsByAnchor: new Map()
    },
    cacheVersions: {
      serviceTargetsVersion: '',
      queueTargetsVersion: '',
      roomClustersVersion: '',
      dockEntitiesTopologyVersion: -1,
      dockByTileDockVersion: -1,
      itemNodeByTileModuleVersion: -1,
      activeRoomTilesVersion: '',
      serviceReachabilityVersion: '',
      diagnosticsVersion: '',
      pressurizationTopologyVersion: -1
    }
  };
}

function perfNowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function pathCacheKey(
  state: StationState,
  start: number,
  goal: number,
  options: PathOptions,
  occupancyByTile?: Map<number, number>
): string {
  // Occupancy-sensitive routes are still cached, but with a short TTL bucket.
  const occupancyBucket = occupancyByTile ? Math.floor(state.now * 4) : -1;
  return `${start}>${goal}|${options.allowRestricted ? 1 : 0}|${options.intent}|${occupancyBucket}`;
}

function cachedPathLookup(
  state: StationState,
  start: number,
  goal: number,
  options: PathOptions,
  occupancyByTile?: Map<number, number>
): number[] | null {
  const key = pathCacheKey(state, start, goal, options, occupancyByTile);
  const cached = state.derived.pathCache.get(key);
  if (
    cached &&
    cached.topologyVersion === state.topologyVersion &&
    cached.roomVersion === state.roomVersion &&
    state.now - cached.createdAt <= PATH_CACHE_TTL_SEC
  ) {
    return [...cached.path];
  }
  const path = findPathCore(state, start, goal, options, occupancyByTile);
  if (path) {
    if (state.derived.pathCache.size >= PATH_CACHE_MAX_ENTRIES) {
      const oldestKey = state.derived.pathCache.keys().next().value as string | undefined;
      if (oldestKey) state.derived.pathCache.delete(oldestKey);
    }
    state.derived.pathCache.set(key, {
      path: [...path],
      createdAt: state.now,
      topologyVersion: state.topologyVersion,
      roomVersion: state.roomVersion
    });
  }
  return path;
}

function normalizePathOptions(optionsOrAllowRestricted: boolean | PathOptions): PathOptions {
  if (typeof optionsOrAllowRestricted === 'boolean') {
    return { allowRestricted: optionsOrAllowRestricted, intent: 'visitor' };
  }
  return optionsOrAllowRestricted;
}

export function findPath(
  state: StationState,
  start: number,
  goal: number,
  optionsOrAllowRestricted: boolean | PathOptions,
  occupancyByTile?: Map<number, number>
): number[] | null {
  const started = perfNowMs();
  const options = normalizePathOptions(optionsOrAllowRestricted);
  const path = cachedPathLookup(state, start, goal, options, occupancyByTile);
  state.metrics.pathCallsPerTick += 1;
  state.metrics.pathMs += perfNowMs() - started;
  return path;
}

function bumpTopologyVersion(state: StationState): void {
  state.topologyVersion += 1;
  state.roomVersion += 1;
  state.moduleVersion += 1;
  state.dockVersion += 1;
  state.derived.cacheVersions.roomClustersVersion = '';
  state.derived.cacheVersions.serviceTargetsVersion = '';
  state.derived.cacheVersions.queueTargetsVersion = '';
  state.derived.cacheVersions.serviceReachabilityVersion = '';
  state.derived.cacheVersions.activeRoomTilesVersion = '';
  state.derived.cacheVersions.diagnosticsVersion = '';
  state.derived.cacheVersions.dockEntitiesTopologyVersion = -1;
  state.derived.cacheVersions.dockByTileDockVersion = -1;
  state.derived.cacheVersions.itemNodeByTileModuleVersion = -1;
  state.derived.cacheVersions.pressurizationTopologyVersion = -1;
  state.derived.pathCache.clear();
}

function bumpRoomVersion(state: StationState): void {
  state.roomVersion += 1;
  state.derived.cacheVersions.roomClustersVersion = '';
  state.derived.cacheVersions.serviceTargetsVersion = '';
  state.derived.cacheVersions.queueTargetsVersion = '';
  state.derived.cacheVersions.serviceReachabilityVersion = '';
  state.derived.cacheVersions.activeRoomTilesVersion = '';
  state.derived.cacheVersions.diagnosticsVersion = '';
  state.derived.cacheVersions.pressurizationTopologyVersion = -1;
  state.derived.pathCache.clear();
}

function bumpModuleVersion(state: StationState): void {
  state.moduleVersion += 1;
  state.derived.cacheVersions.serviceTargetsVersion = '';
  state.derived.cacheVersions.queueTargetsVersion = '';
  state.derived.cacheVersions.serviceReachabilityVersion = '';
  state.derived.cacheVersions.activeRoomTilesVersion = '';
  state.derived.cacheVersions.diagnosticsVersion = '';
  state.derived.cacheVersions.itemNodeByTileModuleVersion = -1;
}

function bumpDockVersion(state: StationState): void {
  state.dockVersion += 1;
  state.derived.cacheVersions.dockByTileDockVersion = -1;
  state.derived.cacheVersions.serviceReachabilityVersion = '';
}

function moduleCountsForCluster(state: StationState, cluster: number[]): Map<ModuleType, number> {
  const clusterSet = new Set(cluster);
  const counts = new Map<ModuleType, number>();
  for (const module of state.moduleInstances) {
    if (!clusterSet.has(module.originTile)) continue;
    counts.set(module.type, (counts.get(module.type) ?? 0) + 1);
  }
  return counts;
}

function roomClusterVersionKey(state: StationState): string {
  return `${state.roomVersion}:${state.topologyVersion}:${state.width}x${state.height}`;
}

function serviceTargetVersionKey(state: StationState): string {
  return `${state.moduleVersion}:${state.roomVersion}:${state.topologyVersion}:${state.width}x${state.height}`;
}

function queueTargetVersionKey(state: StationState): string {
  return serviceTargetVersionKey(state);
}

function reachabilityVersionKey(state: StationState): string {
  return `${serviceTargetVersionKey(state)}:${state.dockVersion}`;
}

function activeRoomsVersionKey(state: StationState): string {
  return `${state.now}:${state.roomVersion}:${state.moduleVersion}:${state.topologyVersion}`;
}

function diagnosticsVersionKey(state: StationState): string {
  return `${state.now}:${state.roomVersion}:${state.moduleVersion}:${state.topologyVersion}`;
}

function ensureRoomClustersCache(state: StationState): void {
  const version = roomClusterVersionKey(state);
  if (state.derived.cacheVersions.roomClustersVersion === version) return;
  state.derived.roomClustersByRoom.clear();
  state.derived.clusterByTile.clear();

  for (const room of CACHED_ROOM_TYPES) {
    const roomTiles: number[] = [];
    for (let i = 0; i < state.rooms.length; i++) {
      if (state.rooms[i] !== room) continue;
      if (!isWalkable(state.tiles[i])) continue;
      roomTiles.push(i);
    }
    const remaining = new Set(roomTiles);
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
      const anchor = cluster.reduce((best, tile) => (tile < best ? tile : best), cluster[0]);
      for (const tile of cluster) {
        state.derived.clusterByTile.set(tile, { room, anchor, cluster });
      }
    }
    state.derived.roomClustersByRoom.set(room, clusters);
  }

  state.derived.cacheVersions.roomClustersVersion = version;
  state.derived.cacheVersions.activeRoomTilesVersion = '';
  state.derived.cacheVersions.diagnosticsVersion = '';
}

function ensureServiceTargetsCache(state: StationState): void {
  const version = serviceTargetVersionKey(state);
  if (state.derived.cacheVersions.serviceTargetsVersion === version) return;
  state.derived.serviceTargetsByRoom.clear();
  state.derived.cacheVersions.serviceTargetsVersion = version;
  state.derived.cacheVersions.queueTargetsVersion = '';
  state.derived.cacheVersions.serviceReachabilityVersion = '';
  state.derived.cacheVersions.activeRoomTilesVersion = '';
  state.derived.cacheVersions.diagnosticsVersion = '';
}

export function collectServiceTargets(state: StationState, room: RoomType): number[] {
  ensureServiceTargetsCache(state);
  const cached = state.derived.serviceTargetsByRoom.get(room);
  if (cached) return cached;
  const serviceModules = moduleTypesForRoomServices(room);
  if (serviceModules.length === 0) {
    const targets = collectRooms(state, room);
    state.derived.serviceTargetsByRoom.set(room, targets);
    return targets;
  }
  const out = new Set<number>();
  for (const moduleType of serviceModules) {
    for (const tile of collectModuleAnchors(state, moduleType, room)) out.add(tile);
  }
  const targets = [...out].sort((a, b) => a - b);
  state.derived.serviceTargetsByRoom.set(room, targets);
  return targets;
}

function collectServingTargets(state: StationState): number[] {
  return collectServiceTargets(state, RoomType.Cafeteria);
}

function collectCafeteriaTableTargets(state: StationState): number[] {
  return collectModuleAnchors(state, ModuleType.Table, RoomType.Cafeteria);
}

export function collectQueueTargets(state: StationState, room: RoomType): number[] {
  if (room !== RoomType.Cafeteria) return [];
  const version = queueTargetVersionKey(state);
  if (state.derived.cacheVersions.queueTargetsVersion === version) {
    return state.derived.queueTargets;
  }
  const serviceTargets = collectServingTargets(state);
  if (serviceTargets.length === 0) {
    state.derived.queueTargets = [];
    state.derived.queueTargetSet.clear();
    state.derived.cacheVersions.queueTargetsVersion = version;
    return [];
  }
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
      if (state.moduleOccupancyByTile[ni] !== null) continue;
      out.add(ni);
    }
  }
  state.derived.queueTargets = [...out].sort((a, b) => a - b);
  state.derived.queueTargetSet = new Set(state.derived.queueTargets);
  state.derived.cacheVersions.queueTargetsVersion = version;
  return state.derived.queueTargets;
}

type ServiceNodeReachabilityContext = {
  hasStarts: boolean;
  reachableWalkTiles: Set<number>;
};

function collectServiceReachabilityStartTiles(state: StationState): number[] {
  const starts = new Set<number>();
  if (isWalkable(state.tiles[state.core.serviceTile])) {
    starts.add(state.core.serviceTile);
  }
  for (const tile of collectTiles(state, TileType.Dock)) {
    if (!isWalkable(state.tiles[tile])) continue;
    starts.add(tile);
  }
  return [...starts];
}

function buildWalkableReachabilityFromStarts(state: StationState, starts: number[]): Set<number> {
  const visited = new Set<number>();
  const queue: number[] = [];
  for (const tile of starts) {
    if (!isWalkable(state.tiles[tile])) continue;
    if (visited.has(tile)) continue;
    visited.add(tile);
    queue.push(tile);
  }
  for (let i = 0; i < queue.length; i++) {
    const idx = queue[i];
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
      if (!isWalkable(state.tiles[ni])) continue;
      if (visited.has(ni)) continue;
      visited.add(ni);
      queue.push(ni);
    }
  }
  return visited;
}

function buildServiceNodeReachabilityContext(state: StationState): ServiceNodeReachabilityContext {
  const starts = collectServiceReachabilityStartTiles(state);
  return {
    hasStarts: starts.length > 0,
    reachableWalkTiles: buildWalkableReachabilityFromStarts(state, starts)
  };
}

function summarizeServiceNodeReachabilityForTargets(
  state: StationState,
  targets: number[],
  context: ServiceNodeReachabilityContext
): { reachableCount: number; unreachableCount: number; unreachableTiles: number[] } {
  const uniqueTargets = [...new Set(targets)];
  if (uniqueTargets.length === 0) {
    return { reachableCount: 0, unreachableCount: 0, unreachableTiles: [] };
  }
  if (!context.hasStarts) {
    return { reachableCount: uniqueTargets.length, unreachableCount: 0, unreachableTiles: [] };
  }
  const unreachableTiles: number[] = [];
  for (const tile of uniqueTargets) {
    if (!isWalkable(state.tiles[tile]) || !context.reachableWalkTiles.has(tile)) {
      unreachableTiles.push(tile);
    }
  }
  return {
    reachableCount: Math.max(0, uniqueTargets.length - unreachableTiles.length),
    unreachableCount: unreachableTiles.length,
    unreachableTiles
  };
}

export function collectServiceNodeReachability(
  state: StationState
): { nodeTiles: number[]; unreachableNodeTiles: number[] } {
  const version = reachabilityVersionKey(state);
  if (state.derived.cacheVersions.serviceReachabilityVersion === version) {
    return state.derived.serviceReachability;
  }
  const nodeTilesSet = new Set<number>();
  for (const room of SERVICE_NODE_OVERLAY_ROOMS) {
    for (const tile of collectServiceTargets(state, room)) nodeTilesSet.add(tile);
  }
  const nodeTiles = [...nodeTilesSet].sort((a, b) => a - b);
  const context = buildServiceNodeReachabilityContext(state);
  const summary = summarizeServiceNodeReachabilityForTargets(state, nodeTiles, context);
  const result = {
    nodeTiles,
    unreachableNodeTiles: summary.unreachableTiles
  };
  state.derived.serviceReachability = result;
  state.derived.cacheVersions.serviceReachabilityVersion = version;
  return result;
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
  collectQueueTargets(state, RoomType.Cafeteria);
  return state.derived.queueTargetSet.has(idx);
}

function roomClusters(state: StationState, room: RoomType): number[][] {
  ensureRoomClustersCache(state);
  return state.derived.roomClustersByRoom.get(room) ?? [];
}

function roomClusterAnchors(state: StationState, room: RoomType): number[] {
  const clusters = roomClusters(state, room);
  return clusters
    .map((cluster) => cluster.reduce((best, tile) => (tile < best ? tile : best), cluster[0]))
    .sort((a, b) => a - b);
}

function ensureDockEntitiesUpToDate(state: StationState): void {
  if (state.derived.cacheVersions.dockEntitiesTopologyVersion === state.topologyVersion) return;
  rebuildDockEntities(state);
  state.derived.cacheVersions.dockEntitiesTopologyVersion = state.topologyVersion;
}

function ensureDockByTileCache(state: StationState): void {
  if (state.derived.cacheVersions.dockByTileDockVersion === state.dockVersion) return;
  state.derived.dockByTile.clear();
  for (const dock of state.docks) {
    for (const tile of dock.tiles) state.derived.dockByTile.set(tile, dock);
  }
  state.derived.cacheVersions.dockByTileDockVersion = state.dockVersion;
}

function ensureItemNodeByTileCache(state: StationState): void {
  if (state.derived.cacheVersions.itemNodeByTileModuleVersion === state.moduleVersion) return;
  state.derived.itemNodeByTile.clear();
  for (const node of state.itemNodes) {
    state.derived.itemNodeByTile.set(node.tileIndex, node);
  }
  state.derived.cacheVersions.itemNodeByTileModuleVersion = state.moduleVersion;
}

function ensureActiveRoomAndDiagnosticCaches(state: StationState): void {
  const version = diagnosticsVersionKey(state);
  if (
    state.derived.cacheVersions.activeRoomTilesVersion === version &&
    state.derived.cacheVersions.diagnosticsVersion === version
  ) {
    return;
  }
  state.derived.activeRoomTiles.clear();
  state.derived.diagnostics.diagnosticsByAnchor.clear();
  state.derived.diagnostics.inspectionsByAnchor.clear();
  const staffByTile = countStaffAtAssignedTiles(state);
  for (const room of CACHED_ROOM_TYPES) {
    if (room === RoomType.None) continue;
    for (const cluster of roomClusters(state, room)) {
      if (cluster.length <= 0) continue;
      const inspection = inspectRoomCluster(state, room, cluster, staffByTile);
      const anchor = cluster.reduce((best, tile) => (tile < best ? tile : best), cluster[0]);
      const diagnostic: RoomDiagnostic = {
        room,
        active: inspection.reasons.length === 0,
        reasons: inspection.reasons,
        clusterSize: cluster.length,
        warnings: inspection.warnings
      };
      state.derived.diagnostics.diagnosticsByAnchor.set(anchor, diagnostic);
      if (diagnostic.active) {
        for (const tile of cluster) state.derived.activeRoomTiles.add(tile);
      }
    }
  }
  state.derived.cacheVersions.activeRoomTilesVersion = version;
  state.derived.cacheVersions.diagnosticsVersion = version;
}

export function collectActiveRoomTiles(state: StationState): Set<number> {
  ensureActiveRoomAndDiagnosticCaches(state);
  return state.derived.activeRoomTiles;
}

function ensurePressurizationUpToDate(state: StationState): void {
  if (state.derived.cacheVersions.pressurizationTopologyVersion === state.topologyVersion) return;
  computePressurization(state);
  state.derived.cacheVersions.pressurizationTopologyVersion = state.topologyVersion;
}

function ensureDerivedUpToDate(state: StationState): void {
  const started = perfNowMs();
  ensureRoomClustersCache(state);
  ensureDockEntitiesUpToDate(state);
  ensureDockByTileCache(state);
  ensureItemNodeByTileCache(state);
  ensureActiveRoomAndDiagnosticCaches(state);
  state.metrics.derivedRecomputeMs += perfNowMs() - started;
}

const CREW_SYSTEMS: CrewPrioritySystem[] = [
  'life-support',
  'reactor',
  'hydroponics',
  'kitchen',
  'workshop',
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
  if (system === 'workshop') return roomClusterAnchors(state, RoomType.Workshop);
  if (system === 'cafeteria') return roomClusterAnchors(state, RoomType.Cafeteria);
  if (system === 'security') {
    return [...roomClusterAnchors(state, RoomType.Security), ...roomClusterAnchors(state, RoomType.Brig)].sort(
      (a, b) => a - b
    );
  }
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
  if (system === 'workshop') return RoomType.Workshop;
  if (system === 'cafeteria') return RoomType.Cafeteria;
  if (system === 'security') return RoomType.Security;
  if (system === 'hygiene') return RoomType.Hygiene;
  if (system === 'lounge') return RoomType.Lounge;
  return RoomType.Market;
}

function roomMatchesCrewSystem(system: CrewPrioritySystem, room: RoomType): boolean {
  if (system === 'security') return room === RoomType.Security || room === RoomType.Brig;
  return room === systemRoomType(system);
}

function maintenanceKey(system: MaintenanceSystem, anchorTile: number): string {
  return `${system}:${anchorTile}`;
}

function maintenanceRoom(system: MaintenanceSystem): RoomType {
  return system === 'reactor' ? RoomType.Reactor : RoomType.LifeSupport;
}

function clusterAnchor(cluster: number[]): number {
  return cluster.reduce((best, tile) => (tile < best ? tile : best), cluster[0]);
}

function maintenanceDebtFor(state: StationState, system: MaintenanceSystem, anchorTile: number): number {
  return state.maintenanceDebts.find((debt) => debt.key === maintenanceKey(system, anchorTile))?.debt ?? 0;
}

function maxMaintenanceDebtForSystem(state: StationState, system: MaintenanceSystem): number {
  let max = 0;
  for (const debt of state.maintenanceDebts) {
    if (debt.system === system) max = Math.max(max, debt.debt);
  }
  return max;
}

function maintenanceOutputMultiplierFromDebt(debt: number): number {
  if (debt <= MAINTENANCE_DEBT_WARNING) return 1;
  if (debt <= MAINTENANCE_DEBT_SEVERE) {
    return 1 - ((debt - MAINTENANCE_DEBT_WARNING) / (MAINTENANCE_DEBT_SEVERE - MAINTENANCE_DEBT_WARNING)) * 0.15;
  }
  if (debt <= 85) return 0.85 - ((debt - MAINTENANCE_DEBT_SEVERE) / 25) * 0.2;
  return clamp(0.65 - ((debt - 85) / 15) * 0.25, 0.4, 0.65);
}

function maintenanceOutputMultiplierForSystem(state: StationState, system: MaintenanceSystem): number {
  let total = 0;
  let count = 0;
  for (const debt of state.maintenanceDebts) {
    if (debt.system !== system) continue;
    total += maintenanceOutputMultiplierFromDebt(debt.debt);
    count += 1;
  }
  return count > 0 ? total / count : 1;
}

function maintenanceDebtAtAnchor(state: StationState, system: MaintenanceSystem, anchorTile: number) {
  return state.maintenanceDebts.find((debt) => debt.key === maintenanceKey(system, anchorTile)) ?? null;
}

type LifeSupportCoverage = {
  distanceByTile: Int16Array;
  sourceCount: number;
  coveredTiles: number;
  walkablePressurizedTiles: number;
  poorTiles: number;
  avgDistance: number;
  coveragePct: number;
};

// Vent module radius — how far a powered Vent projects fresh air. The vent
// itself acts as a 0-distance source within that bubble, so a remote wing
// can be reached from a Vent placed within VENT_REACH_FROM_LS of the main LS.
const VENT_REACH_FROM_LS = 16;
const VENT_PROJECTION_RADIUS = 6;

function computeLifeSupportCoverage(state: StationState): LifeSupportCoverage {
  const distanceByTile = new Int16Array(state.width * state.height);
  distanceByTile.fill(-1);
  const lsTiles = operationalClustersForRoom(state, RoomType.LifeSupport, CREW_PER_LIFE_SUPPORT, false).flat();
  const queue: number[] = [];
  for (const tile of lsTiles) {
    if (!isWalkable(state.tiles[tile]) || !state.pressurized[tile]) continue;
    if (distanceByTile[tile] === 0) continue;
    distanceByTile[tile] = 0;
    queue.push(tile);
  }
  // Vent modules within VENT_REACH_FROM_LS of an active LS source act as
  // secondary 0-distance air sources in their own VENT_PROJECTION_RADIUS.
  // First pass: BFS from LS to find which vents are reachable + within range.
  // Second pass: extend the BFS from each powered vent.
  const ventOriginTiles: number[] = [];
  for (const m of state.moduleInstances) {
    if (m.type === ModuleType.Vent) ventOriginTiles.push(m.originTile);
  }
  const sourceTiles = lsTiles.slice();

  let coveredTiles = queue.length;
  let totalDistance = 0;
  const cardinalDeltas: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  // Phase 1: BFS from LS sources only.
  for (let qi = 0; qi < queue.length; qi++) {
    const tile = queue[qi];
    const p = fromIndex(tile, state.width);
    const nextDistance = distanceByTile[tile] + 1;
    for (const [dx, dy] of cardinalDeltas) {
      const nx = p.x + dx;
      const ny = p.y + dy;
      if (!inBounds(nx, ny, state.width, state.height)) continue;
      const ni = toIndex(nx, ny, state.width);
      if (distanceByTile[ni] >= 0) continue;
      if (!isWalkable(state.tiles[ni]) || !state.pressurized[ni]) continue;
      distanceByTile[ni] = nextDistance;
      coveredTiles += 1;
      totalDistance += nextDistance;
      queue.push(ni);
    }
  }

  // Phase 2: any vent module reached by phase 1 within VENT_REACH_FROM_LS becomes
  // a secondary 0-distance source. We re-seed the BFS from those tiles so they
  // project fresh air into a remote wing the main LS bubble couldn't reach.
  let poweredVents = 0;
  if (lsTiles.length > 0 && ventOriginTiles.length > 0) {
    const ventQueue: number[] = [];
    for (const ventTile of ventOriginTiles) {
      const reach = distanceByTile[ventTile];
      if (reach < 0 || reach > VENT_REACH_FROM_LS) continue;
      if (!isWalkable(state.tiles[ventTile]) || !state.pressurized[ventTile]) continue;
      poweredVents += 1;
      // Vent itself: keep its existing distance (so the LS-side overlay still
      // reads it correctly), but mark its projection radius freshly.
      const vp = fromIndex(ventTile, state.width);
      // Re-initialize tiles within VENT_PROJECTION_RADIUS that are currently
      // worse than the distance they'd get from this vent. Use Manhattan radius
      // for a simple bubble; BFS through walkable tiles for actual reach.
      // Bound: only re-improve tiles whose current distance > 0 (LS sources stay
      // at 0) and is larger than what vent would give.
      const ventBfsQueue: number[] = [ventTile];
      const ventDist = new Map<number, number>();
      ventDist.set(ventTile, 0);
      for (let qi = 0; qi < ventBfsQueue.length; qi++) {
        const t = ventBfsQueue[qi];
        const cur = ventDist.get(t) ?? 0;
        if (cur >= VENT_PROJECTION_RADIUS) continue;
        const tp = fromIndex(t, state.width);
        for (const [dx, dy] of cardinalDeltas) {
          const nx = tp.x + dx;
          const ny = tp.y + dy;
          if (!inBounds(nx, ny, state.width, state.height)) continue;
          const ni = toIndex(nx, ny, state.width);
          if (ventDist.has(ni)) continue;
          if (!isWalkable(state.tiles[ni]) || !state.pressurized[ni]) continue;
          ventDist.set(ni, cur + 1);
          ventBfsQueue.push(ni);
        }
      }
      // Apply: if vent gives a better (smaller) distance, overwrite. Tiles that
      // were unreachable get queued.
      for (const [tile, vd] of ventDist) {
        const existing = distanceByTile[tile];
        if (existing < 0 || existing > vd) {
          if (existing < 0) {
            coveredTiles += 1;
          } else {
            totalDistance -= existing;
          }
          distanceByTile[tile] = vd;
          totalDistance += vd;
          if (!ventQueue.includes(tile)) ventQueue.push(tile);
        }
      }
    }
    // Continue BFS from any newly-improved frontier so coverage propagates
    // beyond the projection bubble through corridors.
    for (let qi = 0; qi < ventQueue.length; qi++) {
      const tile = ventQueue[qi];
      const p = fromIndex(tile, state.width);
      const nextDistance = distanceByTile[tile] + 1;
      for (const [dx, dy] of cardinalDeltas) {
        const nx = p.x + dx;
        const ny = p.y + dy;
        if (!inBounds(nx, ny, state.width, state.height)) continue;
        const ni = toIndex(nx, ny, state.width);
        if (!isWalkable(state.tiles[ni]) || !state.pressurized[ni]) continue;
        const existing = distanceByTile[ni];
        if (existing >= 0 && existing <= nextDistance) continue;
        if (existing < 0) coveredTiles += 1;
        else totalDistance -= existing;
        distanceByTile[ni] = nextDistance;
        totalDistance += nextDistance;
        ventQueue.push(ni);
      }
    }
  }

  let walkablePressurizedTiles = 0;
  let poorTiles = 0;
  for (let tile = 0; tile < state.tiles.length; tile++) {
    if (!isWalkable(state.tiles[tile]) || !state.pressurized[tile]) continue;
    walkablePressurizedTiles += 1;
    const distance = distanceByTile[tile];
    if (sourceTiles.length > 0 && (distance < 0 || distance > 18)) poorTiles += 1;
  }

  return {
    distanceByTile,
    sourceCount: sourceTiles.length + poweredVents,
    coveredTiles,
    walkablePressurizedTiles,
    poorTiles,
    avgDistance: coveredTiles > 0 ? totalDistance / coveredTiles : 0,
    coveragePct: walkablePressurizedTiles > 0 ? (coveredTiles / walkablePressurizedTiles) * 100 : 100
  };
}

export function getLifeSupportCoverageDiagnostics(state: StationState): LifeSupportCoverageDiagnostic {
  const coverage = computeLifeSupportCoverage(state);
  return {
    ...coverage,
    hasLifeSupportSystem: collectRooms(state, RoomType.LifeSupport).length > 0
  };
}

export function getLifeSupportTileDiagnostic(
  state: StationState,
  x: number,
  y: number,
  coverage: LifeSupportCoverageDiagnostic = getLifeSupportCoverageDiagnostics(state)
): LifeSupportTileDiagnostic | null {
  if (!inBounds(x, y, state.width, state.height)) return null;
  const tileIndex = toIndex(x, y, state.width);
  const walkablePressurized = isWalkable(state.tiles[tileIndex]) && state.pressurized[tileIndex];
  const rawDistance = coverage.distanceByTile[tileIndex];
  const reachable = walkablePressurized && rawDistance >= 0;
  const distance = reachable ? rawDistance : null;
  const noActiveSource = coverage.hasLifeSupportSystem && coverage.sourceCount <= 0 && walkablePressurized;
  const poorCoverage =
    walkablePressurized &&
    coverage.hasLifeSupportSystem &&
    (coverage.sourceCount <= 0 || rawDistance < 0 || rawDistance > 18);
  return {
    tileIndex,
    walkablePressurized,
    hasLifeSupportSystem: coverage.hasLifeSupportSystem,
    sourceCount: coverage.sourceCount,
    reachable,
    distance,
    poorCoverage,
    noActiveSource
  };
}

export function getRoomEnvironmentTileDiagnostic(
  state: StationState,
  x: number,
  y: number
): RoomEnvironmentTileDiagnostic | null {
  if (!inBounds(x, y, state.width, state.height)) return null;
  const tileIndex = toIndex(x, y, state.width);
  if (!isWalkable(state.tiles[tileIndex])) return null;
  const environment = roomEnvironmentScoreAt(state, tileIndex);
  return {
    ...environment,
    visitorDiscomfort: visitorEnvironmentDiscomfort(environment),
    residentDiscomfort: residentEnvironmentDiscomfort(environment)
  };
}

export function getMaintenanceTileDiagnostic(
  state: StationState,
  x: number,
  y: number
): MaintenanceTileDiagnostic | null {
  if (!inBounds(x, y, state.width, state.height)) return null;
  const tileIndex = toIndex(x, y, state.width);
  const room = state.rooms[tileIndex];
  if (room !== RoomType.Reactor && room !== RoomType.LifeSupport) return null;
  ensureRoomClustersCache(state);
  const clusterMeta = state.derived.clusterByTile.get(tileIndex);
  if (!clusterMeta || clusterMeta.room !== room) return null;
  const system: MaintenanceSystem = room === RoomType.Reactor ? 'reactor' : 'life-support';
  const debt = maintenanceDebtFor(state, system, clusterMeta.anchor);
  return {
    system,
    anchorTile: clusterMeta.anchor,
    debt,
    outputMultiplier: maintenanceOutputMultiplierFromDebt(debt)
  };
}

function emptyRoutePressureDiagnostics(state: StationState): RoutePressureDiagnostics {
  return {
    visitorByTile: new Uint16Array(state.tiles.length),
    residentByTile: new Uint16Array(state.tiles.length),
    crewByTile: new Uint16Array(state.tiles.length),
    logisticsByTile: new Uint16Array(state.tiles.length),
    activePaths: 0,
    pressuredTiles: 0,
    conflictTiles: 0,
    maxPressure: 0
  };
}

function routePressureRoomConflicts(
  room: RoomType,
  visitorCount: number,
  residentCount: number,
  crewCount: number,
  logisticsCount: number
): { publicConflict: boolean; serviceConflict: boolean } {
  const publicActors = visitorCount + residentCount;
  const backOfHouseActors = crewCount + logisticsCount;
  const publicFacing =
    room === RoomType.Cafeteria ||
    room === RoomType.Lounge ||
    room === RoomType.Market ||
    room === RoomType.RecHall ||
    room === RoomType.Cantina ||
    room === RoomType.Observatory;
  const residential = room === RoomType.Dorm || room === RoomType.Hygiene;
  const service =
    room === RoomType.Reactor ||
    room === RoomType.LifeSupport ||
    room === RoomType.Workshop ||
    room === RoomType.Kitchen ||
    room === RoomType.Hydroponics ||
    room === RoomType.Storage ||
    room === RoomType.LogisticsStock ||
    room === RoomType.Berth ||
    room === RoomType.Security ||
    room === RoomType.Brig;
  return {
    publicConflict: backOfHouseActors > 0 && (publicFacing || residential),
    serviceConflict: publicActors > 0 && service
  };
}

function routePressureReasons(
  room: RoomType,
  visitorCount: number,
  residentCount: number,
  crewCount: number,
  logisticsCount: number,
  totalCount: number,
  publicConflict: boolean,
  serviceConflict: boolean
): string[] {
  const reasons: string[] = [];
  const publicActors = visitorCount + residentCount;
  const backOfHouseActors = crewCount + logisticsCount;
  const publicFacing =
    room === RoomType.Cafeteria ||
    room === RoomType.Lounge ||
    room === RoomType.Market ||
    room === RoomType.RecHall ||
    room === RoomType.Cantina ||
    room === RoomType.Observatory;
  const residential = room === RoomType.Dorm || room === RoomType.Hygiene;
  const service =
    room === RoomType.Reactor ||
    room === RoomType.LifeSupport ||
    room === RoomType.Workshop ||
    room === RoomType.Kitchen ||
    room === RoomType.Hydroponics ||
    room === RoomType.Storage ||
    room === RoomType.LogisticsStock ||
    room === RoomType.Berth ||
    room === RoomType.Security ||
    room === RoomType.Brig;

  if (serviceConflict && service) {
    if (visitorCount > 0) reasons.push('visitors crossing service/back-of-house space');
    if (residentCount > 0) reasons.push('residents crossing service/back-of-house space');
  }
  if (publicConflict && publicFacing) {
    if (logisticsCount > 0) reasons.push('logistics route crossing public/social room');
    if (crewCount > 0) reasons.push('crew work route crossing public/social room');
  }
  if (publicConflict && residential) {
    if (logisticsCount > 0) reasons.push('logistics route crossing housing/support room');
    if (crewCount > 0) reasons.push('crew route crossing housing/support room');
  }
  if (publicActors > 0 && backOfHouseActors > 0) reasons.push('mixed public and back-of-house traffic');
  if (
    logisticsCount > 0 &&
    (room === RoomType.Cafeteria ||
      room === RoomType.Lounge ||
      room === RoomType.Market ||
      room === RoomType.RecHall ||
      room === RoomType.Cantina ||
      room === RoomType.Observatory)
  ) {
    reasons.push('hauling through visitor-facing space hurts station vibe');
  }
  if (visitorCount > 0 && (room === RoomType.Storage || room === RoomType.LogisticsStock || room === RoomType.Workshop)) {
    reasons.push('visitor route exposes cargo/industrial work');
  }
  if (residentCount > 0 && (room === RoomType.Reactor || room === RoomType.LifeSupport || room === RoomType.Security || room === RoomType.Brig)) {
    reasons.push('resident route crosses utility/security space');
  }
  if (crewCount > 0 && publicFacing && totalCount >= 3) reasons.push('crew route slowed by public crowding');
  if (logisticsCount > 0 && totalCount >= 3) reasons.push('logistics pressure on a busy tile');
  if (totalCount >= MAX_OCCUPANTS_PER_TILE) reasons.push('narrow tile at occupancy risk');
  return [...new Set(reasons)];
}

function routePressureDominant(
  visitorCount: number,
  residentCount: number,
  crewCount: number,
  logisticsCount: number
): RoutePressureDominant {
  let dominant: RoutePressureDominant = null;
  let best = 0;
  const candidates: Array<{ key: Exclude<RoutePressureDominant, null>; value: number }> = [
    { key: 'visitor', value: visitorCount },
    { key: 'resident', value: residentCount },
    { key: 'crew', value: crewCount },
    { key: 'logistics', value: logisticsCount }
  ];
  for (const candidate of candidates) {
    if (candidate.value > best) {
      best = candidate.value;
      dominant = candidate.key;
    }
  }
  return dominant;
}

function routePressureTileFromCounts(
  state: StationState,
  tileIndex: number,
  diagnostics: RoutePressureDiagnostics
): RoutePressureTileDiagnostic {
  const visitorCount = diagnostics.visitorByTile[tileIndex] ?? 0;
  const residentCount = diagnostics.residentByTile[tileIndex] ?? 0;
  const crewCount = diagnostics.crewByTile[tileIndex] ?? 0;
  const logisticsCount = diagnostics.logisticsByTile[tileIndex] ?? 0;
  const totalCount = visitorCount + residentCount + crewCount + logisticsCount;
  const mixedUse = Math.min(visitorCount + residentCount, crewCount + logisticsCount);
  const roomConflicts = routePressureRoomConflicts(state.rooms[tileIndex], visitorCount, residentCount, crewCount, logisticsCount);
  const conflictScore = mixedUse + (roomConflicts.publicConflict ? 1 : 0) + (roomConflicts.serviceConflict ? 1 : 0);
  const reasons = routePressureReasons(
    state.rooms[tileIndex],
    visitorCount,
    residentCount,
    crewCount,
    logisticsCount,
    totalCount,
    roomConflicts.publicConflict,
    roomConflicts.serviceConflict
  );
  return {
    tileIndex,
    visitorCount,
    residentCount,
    crewCount,
    logisticsCount,
    totalCount,
    dominant: routePressureDominant(visitorCount, residentCount, crewCount, logisticsCount),
    conflictScore,
    publicConflict: roomConflicts.publicConflict,
    serviceConflict: roomConflicts.serviceConflict,
    reasons
  };
}

export function getRoutePressureDiagnostics(state: StationState): RoutePressureDiagnostics {
  const diagnostics = emptyRoutePressureDiagnostics(state);
  const addPath = (path: readonly number[], bucket: Uint16Array): void => {
    if (path.length <= 0) return;
    diagnostics.activePaths += 1;
    for (const tile of path) {
      if (tile < 0 || tile >= state.tiles.length) continue;
      bucket[tile] += 1;
    }
  };

  for (const visitor of state.visitors) addPath(visitor.path, diagnostics.visitorByTile);
  for (const resident of state.residents) addPath(resident.path, diagnostics.residentByTile);
  for (const crew of state.crewMembers) {
    addPath(crew.path, crew.activeJobId !== null ? diagnostics.logisticsByTile : diagnostics.crewByTile);
  }

  for (let tile = 0; tile < state.tiles.length; tile++) {
    const tileDiagnostic = routePressureTileFromCounts(state, tile, diagnostics);
    if (tileDiagnostic.totalCount <= 0) continue;
    diagnostics.pressuredTiles += 1;
    diagnostics.maxPressure = Math.max(diagnostics.maxPressure, tileDiagnostic.totalCount);
    if (tileDiagnostic.conflictScore > 0) diagnostics.conflictTiles += 1;
  }
  return diagnostics;
}

export function getRoutePressureTileDiagnostic(
  state: StationState,
  x: number,
  y: number,
  diagnostics: RoutePressureDiagnostics = getRoutePressureDiagnostics(state)
): RoutePressureTileDiagnostic | null {
  if (!inBounds(x, y, state.width, state.height)) return null;
  const tileIndex = toIndex(x, y, state.width);
  const tileDiagnostic = routePressureTileFromCounts(state, tileIndex, diagnostics);
  return tileDiagnostic.totalCount > 0 ? tileDiagnostic : null;
}

function summarizeRoutePressureForTiles(
  state: StationState,
  tiles: readonly number[],
  diagnostics: RoutePressureDiagnostics = getRoutePressureDiagnostics(state)
): NonNullable<RoomInspector['routePressure']> {
  let activePaths = 0;
  let pressuredTiles = 0;
  let conflictTiles = 0;
  let maxPressure = 0;
  const reasonCounts = new Map<string, number>();
  for (const tile of tiles) {
    if (tile < 0 || tile >= state.tiles.length) continue;
    const diagnostic = routePressureTileFromCounts(state, tile, diagnostics);
    if (diagnostic.totalCount <= 0) continue;
    activePaths += diagnostic.totalCount;
    pressuredTiles += 1;
    maxPressure = Math.max(maxPressure, diagnostic.totalCount);
    if (diagnostic.conflictScore > 0) conflictTiles += 1;
    for (const reason of diagnostic.reasons) {
      reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
    }
  }
  if (pressuredTiles <= 0) {
    return { activePaths: 0, pressuredTiles: 0, conflictTiles: 0, maxPressure: 0, reasons: [] };
  }
  const reasons = [...reasonCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 4)
    .map(([reason, count]) => `${reason} (${count})`);
  return { activePaths, pressuredTiles, conflictTiles, maxPressure, reasons };
}

function averageLifeSupportDistanceForTiles(coverage: LifeSupportCoverage, tiles: number[]): number | null {
  let total = 0;
  let count = 0;
  for (const tile of tiles) {
    const distance = coverage.distanceByTile[tile];
    if (distance < 0) continue;
    total += distance;
    count += 1;
  }
  return count > 0 ? total / count : null;
}

function computeCriticalCapacityTargets(state: StationState): CriticalCapacityTargets {
  const hasRoom = (room: RoomType): boolean => roomClusterAnchors(state, room).length > 0;
  const hasService = (room: RoomType): boolean => {
    if (!hasRoom(room)) return false;
    return !roomRequiresServiceNode(room) || collectServiceTargets(state, room).length > 0;
  };
  const needsAirStaff = state.metrics.airQuality < 35 || state.metrics.airBlockedWarningActive;
  const needsPowerStaff = state.metrics.powerDemand > state.metrics.powerSupply;
  const needsFoodStaff =
    state.metrics.mealStock < FOOD_CHAIN_LOW_MEAL_STOCK ||
    state.metrics.kitchenRawBuffer < FOOD_CHAIN_LOW_KITCHEN_RAW ||
    (state.metrics.visitorsCount > 0 && state.metrics.mealStock < FOOD_CHAIN_TARGET_MEAL_STOCK);
  const needsReactorMaintenance = maxMaintenanceDebtForSystem(state, 'reactor') >= MAINTENANCE_DEBT_WARNING;
  const needsLifeSupportMaintenance = maxMaintenanceDebtForSystem(state, 'life-support') >= MAINTENANCE_DEBT_WARNING;
  return {
    requiredReactorPosts: (needsPowerStaff || needsReactorMaintenance) && hasRoom(RoomType.Reactor) ? 1 : 0,
    requiredLifeSupportPosts: (needsAirStaff || needsLifeSupportMaintenance) && hasRoom(RoomType.LifeSupport) ? 1 : 0,
    requiredHydroPosts: needsFoodStaff && hasService(RoomType.Hydroponics) ? 1 : 0,
    requiredKitchenPosts: needsFoodStaff && hasService(RoomType.Kitchen) ? 1 : 0,
    requiredCafeteriaPosts: needsFoodStaff && hasService(RoomType.Cafeteria) ? 1 : 0
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
    workshop: 6,
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
    workshop: 4,
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
    workshop: 5,
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
    workshop: 10,
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
    workshop: weights.workshop,
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

function generateShipManifest(state: StationState, shipType: ShipType): {
  demand: ManifestDemand;
  mix: Record<VisitorArchetype, number>;
} {
  const baseProfile = SHIP_PROFILES[shipType]?.manifestBaseline ?? {
    cafeteria: 0.42,
    market: 0.36,
    lounge: 0.22
  };
  const base: ManifestDemand = {
    cafeteria: baseProfile.cafeteria,
    market: baseProfile.market,
    lounge: baseProfile.lounge
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
  if (shipType === 'industrial') {
    adjusted.cafeteria = clamp(adjusted.cafeteria, 0.15, 0.45);
    adjusted.market = clamp(adjusted.market, 0.4, 0.75);
    adjusted.lounge = clamp(adjusted.lounge, 0.08, 0.28);
  } else if (shipType === 'military') {
    adjusted.cafeteria = clamp(adjusted.cafeteria, 0.28, 0.6);
    adjusted.market = clamp(adjusted.market, 0.15, 0.4);
    adjusted.lounge = clamp(adjusted.lounge, 0.15, 0.4);
  } else if (shipType === 'colonist') {
    adjusted.cafeteria = clamp(adjusted.cafeteria, 0.35, 0.62);
    adjusted.market = clamp(adjusted.market, 0.08, 0.28);
    adjusted.lounge = clamp(adjusted.lounge, 0.24, 0.5);
  } else {
    adjusted.cafeteria = clamp(adjusted.cafeteria, 0.3, 0.65);
    adjusted.market = clamp(adjusted.market, 0.2, 0.55);
    adjusted.lounge = clamp(adjusted.lounge, 0.1, 0.35);
  }
  const marketUnlocked = isServiceTagUnlocked(state, 'market');
  const loungeUnlocked = isServiceTagUnlocked(state, 'lounge');
  if (!marketUnlocked) adjusted.market = 0;
  if (!loungeUnlocked) adjusted.lounge = 0;
  if (!marketUnlocked && !loungeUnlocked) {
    adjusted.cafeteria = Math.max(0.7, adjusted.cafeteria);
  }
  const demand = normalizeDemand(adjusted);

  const rusher =
    shipType === 'industrial'
      ? clamp(0.14 + state.rng() * 0.14, 0.14, 0.28)
      : shipType === 'military'
        ? clamp(0.2 + state.rng() * 0.16, 0.2, 0.38)
        : shipType === 'colonist'
          ? clamp(0.05 + state.rng() * 0.08, 0.05, 0.16)
          : clamp(0.08 + state.rng() * 0.1, 0.08, 0.18);
  const remaining = 1 - rusher;
  const weighted = normalizeDemand(demand);
  const mix: Record<VisitorArchetype, number> =
    shipType === 'industrial'
      ? {
          diner: weighted.cafeteria * remaining * 0.75,
          shopper: weighted.market * remaining * 1.2,
          lounger: weighted.lounge * remaining * 0.55,
          rusher
        }
      : shipType === 'military'
        ? {
            diner: weighted.cafeteria * remaining * 0.85,
            shopper: weighted.market * remaining * 0.75,
            lounger: weighted.lounge * remaining * 0.6,
            rusher
          }
        : shipType === 'colonist'
          ? {
              diner: weighted.cafeteria * remaining * 1.08,
              shopper: weighted.market * remaining * 0.62,
              lounger: weighted.lounge * remaining * 1.18,
              rusher
            }
      : {
          diner: weighted.cafeteria * remaining,
          shopper: weighted.market * remaining,
          lounger: weighted.lounge * remaining,
          rusher
        };
  const mixTotal = Math.max(0.0001, mix.diner + mix.shopper + mix.lounger + mix.rusher);
  return {
    demand,
    mix: {
      diner: mix.diner / mixTotal,
      shopper: mix.shopper / mixTotal,
      lounger: mix.lounger / mixTotal,
      rusher: mix.rusher / mixTotal
    }
  };
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
  const marketUnlocked = isServiceTagUnlocked(state, 'market');
  const loungeUnlocked = isServiceTagUnlocked(state, 'lounge');
  if (!marketUnlocked && !loungeUnlocked) return 'cafeteria';
  const profilePreference = ARCHETYPE_PROFILES[archetype].primaryPreference;
  const weighted = {
    cafeteria: base.cafeteria,
    market: marketUnlocked ? base.market : 0,
    lounge: loungeUnlocked ? base.lounge : 0
  };
  if (profilePreference === 'cafeteria') weighted.cafeteria += 0.18;
  if (profilePreference === 'market' && marketUnlocked) weighted.market += 0.18;
  if (profilePreference === 'lounge' && loungeUnlocked) weighted.lounge += 0.18;
  weighted.cafeteria = Math.max(0.05, weighted.cafeteria + (state.rng() - 0.5) * VISITOR_PREFERENCE_JITTER);
  weighted.market = marketUnlocked ? Math.max(0.01, weighted.market + (state.rng() - 0.5) * VISITOR_PREFERENCE_JITTER) : 0;
  weighted.lounge = loungeUnlocked ? Math.max(0.01, weighted.lounge + (state.rng() - 0.5) * VISITOR_PREFERENCE_JITTER) : 0;
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
  const isBarrierAt = (idx: number): boolean => {
    const tile = state.tiles[idx];
    if (isPressureBarrier(tile)) return true;
    return tile === TileType.Dock && isOuterHullTile(state, idx);
  };
  const pushIfOpen = (idx: number): void => {
    if (vacuumReachable[idx]) return;
    if (isBarrierAt(idx)) return;
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
      if (isBarrierAt(ni)) continue;
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
  state.derived.cacheVersions.pressurizationTopologyVersion = state.topologyVersion;
}

function registerIncident(state: StationState, amount = 1): void {
  state.metrics.incidentsTotal += amount;
  state.incidentHeat += amount;
}

function isIncidentActive(incident: IncidentEntity): boolean {
  return incident.stage !== 'resolved' && incident.stage !== 'failed';
}

function residentConfrontationActive(state: StationState, resident: Resident): boolean {
  const incidentId = resident.activeIncidentId ?? null;
  if (incidentId === null) return (resident.confrontationUntil ?? 0) > state.now;
  const incident = state.incidents.find((entry) => entry.id === incidentId);
  return !!incident && isIncidentActive(incident);
}

function createIncident(
  state: StationState,
  type: IncidentType,
  tileIndex: number,
  severity = 1,
  residentParticipantIds: number[] = []
): IncidentEntity {
  const normalizedSeverity = clamp(severity, 0.4, 2.4);
  const resolveWindow =
    type === 'fight'
      ? FIGHT_INCIDENT_RESOLVE_WINDOW_SEC / clamp(0.7 + normalizedSeverity * 0.25, 0.75, 1.45)
      : TRESPASS_INCIDENT_RESOLVE_WINDOW_SEC;
  const incident: IncidentEntity = {
    id: state.incidentSpawnCounter++,
    type,
    tileIndex,
    severity: normalizedSeverity,
    createdAt: state.now,
    dispatchAt: null,
    interveneAt: null,
    resolveBy: state.now + resolveWindow,
    stage: 'detected',
    outcome: null,
    resolvedAt: null,
    assignedCrewId: null,
    residentParticipantIds: [...new Set(residentParticipantIds)],
    extendedResolveAt: null
  };
  state.incidents.push(incident);
  registerIncident(state, 1);
  return incident;
}

function maybeCreateTier3Patient(state: StationState, dt: number): void {
  if (state.unlocks.tier < 3 || state.ops.clinicActive <= 0 || state.visitors.length <= 0) return;
  if (state.visitors.some((visitor) => visitor.healthState !== 'healthy')) return;
  const milestonePush = state.metrics.actorsTreatedLifetime < 1;
  const chancePerSec = milestonePush ? 0.18 : 0.0025;
  if (state.now < 20 || state.rng() > chancePerSec * Math.max(0, dt)) return;

  const candidates = state.visitors.filter(
    (visitor) =>
      visitor.healthState === 'healthy' &&
      visitor.state !== VisitorState.ToDock
  );
  if (candidates.length <= 0) return;
  const visitor = candidates[randomInt(0, candidates.length - 1, state.rng)];
  visitor.airExposureSec = Math.max(visitor.airExposureSec, AIR_DISTRESS_EXPOSURE_SEC + 4);
  updateActorHealthFromExposure(state, visitor);
  visitor.reservedServingTile = null;
  visitor.reservedTargetTile = null;
  visitor.carryingMeal = false;
  setVisitorPath(state, visitor, []);
  assignPathToClinic(state, visitor);
}

function maybeCreateTier3DispatchIncident(state: StationState, dt: number): void {
  if (state.unlocks.tier < 3 || state.ops.securityActive <= 0) return;
  if (state.incidents.some((incident) => isIncidentActive(incident))) return;
  const milestonePush = state.metrics.incidentsResolvedLifetime < 1;
  const chancePerSec = milestonePush ? 0.16 : 0.0035;
  const heatBonus = clamp(state.incidentHeat / 30, 0, 0.02);
  if (state.now < 20 || state.rng() > (chancePerSec + heatBonus) * Math.max(0, dt)) return;

  const publicActors = [
    ...state.visitors.map((visitor) => visitor.tileIndex),
    ...state.residents.map((resident) => resident.tileIndex)
  ].filter((tile) => state.zones[tile] === ZoneType.Public && isWalkable(state.tiles[tile]));
  let tileIndex = publicActors.length > 0 ? publicActors[randomInt(0, publicActors.length - 1, state.rng)] : -1;
  if (tileIndex < 0) {
    const fallback = collectTiles(state, TileType.Floor).filter((tile) => state.zones[tile] === ZoneType.Public);
    if (fallback.length <= 0) return;
    tileIndex = fallback[randomInt(0, fallback.length - 1, state.rng)];
  }
  const localCrowd = nearbyPopulationCount(state, tileIndex, 2);
  createIncident(state, 'trespass', tileIndex, clamp(0.65 + localCrowd * 0.08, 0.65, 1.35));
}

function pathCongestion(path: number[], occupancyByTile: Map<number, number>): number {
  if (path.length <= 0) return 0;
  let total = 0;
  for (const tile of path) {
    total += occupancyByTile.get(tile) ?? 0;
  }
  return total / path.length;
}

function scoreRouteExposure(state: StationState, path: number[]): RouteExposure {
  const exposure: RouteExposure = {
    distance: path.length,
    publicTiles: 0,
    serviceTiles: 0,
    cargoTiles: 0,
    residentialTiles: 0,
    securityTiles: 0,
    socialTiles: 0,
    crowdCost: 0
  };
  for (const tile of path) {
    const room = state.rooms[tile];
    exposure.crowdCost += state.pathOccupancyByTile.get(tile) ?? 0;
    if (state.zones[tile] === ZoneType.Public) exposure.publicTiles += 1;
    if (
      room === RoomType.Cafeteria ||
      room === RoomType.Lounge ||
      room === RoomType.Market ||
      room === RoomType.RecHall ||
      room === RoomType.Cantina ||
      room === RoomType.Observatory
    ) {
      exposure.socialTiles += 1;
      continue;
    }
    if (room === RoomType.LogisticsStock || room === RoomType.Storage || room === RoomType.Berth) {
      exposure.cargoTiles += 1;
      continue;
    }
    if (
      room === RoomType.Reactor ||
      room === RoomType.LifeSupport ||
      room === RoomType.Workshop ||
      room === RoomType.Kitchen ||
      room === RoomType.Hydroponics
    ) {
      exposure.serviceTiles += 1;
      continue;
    }
    if (room === RoomType.Dorm || room === RoomType.Hygiene) {
      exposure.residentialTiles += 1;
      continue;
    }
    if (room === RoomType.Security || room === RoomType.Brig) {
      exposure.securityTiles += 1;
    }
  }
  return exposure;
}

function roomEnvironmentScoreAt(state: StationState, tileIndex: number, radius = ROOM_ENVIRONMENT_RADIUS): RoomEnvironmentScore {
  const origin = fromIndex(tileIndex, state.width);
  const score: RoomEnvironmentScore = {
    visitorStatus: 0,
    residentialComfort: 0,
    serviceNoise: 0,
    publicAppeal: 0,
    sampledTiles: 0
  };
  let weightTotal = 0;
  for (let y = Math.max(0, origin.y - radius); y <= Math.min(state.height - 1, origin.y + radius); y++) {
    for (let x = Math.max(0, origin.x - radius); x <= Math.min(state.width - 1, origin.x + radius); x++) {
      const dist = Math.abs(x - origin.x) + Math.abs(y - origin.y);
      if (dist > radius) continue;
      const sampleTile = toIndex(x, y, state.width);
      const room = state.rooms[sampleTile];
      const traits = room === RoomType.None ? emptyRoomEnvironmentScore() : ROOM_ENVIRONMENT_TRAITS[room];
      const moduleAdjustment = moduleEnvironmentAdjustment(state.modules[sampleTile]);
      if (
        room === RoomType.None &&
        moduleAdjustment.visitorStatus === 0 &&
        moduleAdjustment.residentialComfort === 0 &&
        moduleAdjustment.serviceNoise === 0 &&
        moduleAdjustment.publicAppeal === 0
      ) {
        continue;
      }
      const weight = 1 / (1 + dist);
      score.visitorStatus += traits.visitorStatus * weight;
      score.residentialComfort += traits.residentialComfort * weight;
      score.serviceNoise += traits.serviceNoise * weight;
      score.publicAppeal += traits.publicAppeal * weight;
      score.visitorStatus += moduleAdjustment.visitorStatus * weight;
      score.residentialComfort += moduleAdjustment.residentialComfort * weight;
      score.serviceNoise += moduleAdjustment.serviceNoise * weight;
      score.publicAppeal += moduleAdjustment.publicAppeal * weight;
      score.sampledTiles += 1;
      weightTotal += weight;
    }
  }
  if (weightTotal <= 0) return score;
  score.visitorStatus /= weightTotal;
  score.residentialComfort /= weightTotal;
  score.serviceNoise /= weightTotal;
  score.publicAppeal /= weightTotal;
  return score;
}

function moduleEnvironmentAdjustment(module: ModuleType): RoomEnvironmentTraits {
  switch (module) {
    case ModuleType.Plant:
      return { visitorStatus: 0.12, residentialComfort: 0.18, serviceNoise: -0.04, publicAppeal: 0.16 };
    case ModuleType.Bench:
      return { visitorStatus: 0.06, residentialComfort: 0.1, serviceNoise: 0, publicAppeal: 0.08 };
    case ModuleType.VendingMachine:
      return { visitorStatus: 0.04, residentialComfort: -0.02, serviceNoise: 0.08, publicAppeal: 0.1 };
    case ModuleType.BarCounter:
      return { visitorStatus: 0.08, residentialComfort: 0, serviceNoise: 0.08, publicAppeal: 0.12 };
    case ModuleType.Telescope:
      return { visitorStatus: 0.16, residentialComfort: 0.12, serviceNoise: 0, publicAppeal: 0.18 };
    default:
      return { visitorStatus: 0, residentialComfort: 0, serviceNoise: 0, publicAppeal: 0 };
  }
}

function visitorEnvironmentDiscomfort(environment: RoomEnvironmentScore): number {
  return clamp(
    -environment.visitorStatus + environment.serviceNoise * 0.4 - environment.publicAppeal * 0.2,
    0,
    8
  );
}

function residentEnvironmentDiscomfort(environment: RoomEnvironmentScore): number {
  return clamp(
    -environment.residentialComfort * 0.95 + environment.serviceNoise * 0.55 - environment.publicAppeal * 0.08,
    0,
    8
  );
}

function emptyRoomEnvironmentScore(): RoomEnvironmentScore {
  return { visitorStatus: 0, residentialComfort: 0, serviceNoise: 0, publicAppeal: 0, sampledTiles: 0 };
}

function averageRoomEnvironmentForRooms(
  state: StationState,
  rooms: RoomType[],
  maxSamples = 80
): RoomEnvironmentScore {
  const roomSet = new Set(rooms);
  const candidates: number[] = [];
  for (let tile = 0; tile < state.rooms.length; tile++) {
    if (roomSet.has(state.rooms[tile])) candidates.push(tile);
  }
  if (candidates.length === 0) return emptyRoomEnvironmentScore();
  const total = emptyRoomEnvironmentScore();
  const stride = Math.max(1, Math.ceil(candidates.length / maxSamples));
  let count = 0;
  for (let i = 0; i < candidates.length; i += stride) {
    const score = roomEnvironmentScoreAt(state, candidates[i]);
    total.visitorStatus += score.visitorStatus;
    total.residentialComfort += score.residentialComfort;
    total.serviceNoise += score.serviceNoise;
    total.publicAppeal += score.publicAppeal;
    total.sampledTiles += score.sampledTiles;
    count += 1;
  }
  if (count <= 0) return total;
  total.visitorStatus /= count;
  total.residentialComfort /= count;
  total.serviceNoise /= count;
  total.publicAppeal /= count;
  total.sampledTiles = count;
  return total;
}

function routeExposureDiscomfort(exposure: RouteExposure | undefined): number {
  if (!exposure) return 0;
  return (
    exposure.serviceTiles * 0.45 +
    exposure.cargoTiles * 0.75 +
    exposure.securityTiles * 0.5 +
    exposure.residentialTiles * 0.25 +
    exposure.crowdCost * 0.08
  );
}

function routePublicInterference(exposure: RouteExposure | undefined): number {
  if (!exposure) return 0;
  return exposure.socialTiles * 0.55 + exposure.crowdCost * 0.08;
}

function setVisitorPath(state: StationState, visitor: Visitor, path: number[]): void {
  visitor.path = path;
  visitor.lastRouteExposure = path.length > 0 ? scoreRouteExposure(state, path) : undefined;
}

function setResidentPath(state: StationState, resident: Resident, path: number[]): void {
  resident.path = path;
  resident.lastRouteExposure = path.length > 0 ? scoreRouteExposure(state, path) : undefined;
}

function setCrewPath(state: StationState, crew: CrewMember, path: number[]): void {
  crew.path = path;
  crew.lastRouteExposure = path.length > 0 ? scoreRouteExposure(state, path) : undefined;
}

function isStationedSecurityResponder(state: StationState, crew: CrewMember): boolean {
  const room = state.rooms[crew.tileIndex];
  return (
    !crew.resting &&
    crew.healthState !== 'critical' &&
    crew.activeJobId === null &&
    (crew.assignedSystem === 'security' || crew.role === 'security') &&
    (room === RoomType.Security || room === RoomType.Brig)
  );
}

function isSecurityAuraSource(state: StationState, crew: CrewMember): boolean {
  const room = state.rooms[crew.tileIndex];
  return !crew.resting && crew.healthState !== 'critical' && (room === RoomType.Security || room === RoomType.Brig);
}

function computeSecurityAuraMap(state: StationState): Map<number, number> {
  const auraByTile = new Map<number, number>();
  const stationedSecurity = state.crewMembers.filter((crew) => isSecurityAuraSource(state, crew));
  if (stationedSecurity.length <= 0) return auraByTile;

  for (const crew of stationedSecurity) {
    const source = fromIndex(crew.tileIndex, state.width);
    for (let dy = -SECURITY_AURA_RADIUS; dy <= SECURITY_AURA_RADIUS; dy++) {
      for (let dx = -SECURITY_AURA_RADIUS; dx <= SECURITY_AURA_RADIUS; dx++) {
        const nx = source.x + dx;
        const ny = source.y + dy;
        if (!inBounds(nx, ny, state.width, state.height)) continue;
        const manhattan = Math.abs(dx) + Math.abs(dy);
        if (manhattan > SECURITY_AURA_RADIUS) continue;
        const aura = clamp(1 - manhattan / SECURITY_AURA_RADIUS, 0, 1);
        if (aura <= 0) continue;
        const tile = toIndex(nx, ny, state.width);
        const prev = auraByTile.get(tile) ?? 0;
        if (aura > prev) auraByTile.set(tile, aura);
      }
    }
  }
  return auraByTile;
}

function incidentSuppressionAtTile(auraByTile: Map<number, number>, tileIndex: number): number {
  const aura = clamp(auraByTile.get(tileIndex) ?? 0, 0, 1);
  const multiplier = 1 - aura * (1 - SECURITY_AURA_MAX_SUPPRESSION_FLOOR);
  return clamp(multiplier, SECURITY_AURA_MAX_SUPPRESSION_FLOOR, 1);
}

function noteIncidentSuppressionSample(state: StationState, suppressionMultiplier: number): void {
  state.usageTotals.incidentSuppressionSampleCount += 1;
  state.usageTotals.incidentSuppressionSampleSum += clamp(suppressionMultiplier, 0, 1);
}

function pickSecurityResponder(
  state: StationState,
  incidentTile: number
): { crew: CrewMember; path: number[] } | null {
  const stationedSecurity = state.crewMembers.filter((crew) => isStationedSecurityResponder(state, crew));
  if (stationedSecurity.length <= 0) return null;
  let best: { crew: CrewMember; path: number[]; score: number } | null = null;
  for (const crew of stationedSecurity) {
    const path = findPath(state, crew.tileIndex, incidentTile, { allowRestricted: true, intent: 'security' }, state.pathOccupancyByTile);
    if (!path) continue;
    const score = path.length + pathCongestion(path, state.pathOccupancyByTile) * 0.55;
    if (!best || score < best.score) {
      best = { crew, path, score };
    }
  }
  return best ? { crew: best.crew, path: best.path } : null;
}

function activeFightIncidentForResident(state: StationState, residentId: number): IncidentEntity | null {
  for (const incident of state.incidents) {
    if (!isIncidentActive(incident) || incident.type !== 'fight') continue;
    if (incident.residentParticipantIds.includes(residentId)) return incident;
  }
  return null;
}

// Read the local air quality at a tile. Falls back to the global metric if the
// local map hasn't been computed yet (older saves, freshly expanded tiles).
function airQualityAt(state: StationState, tileIndex: number): number {
  if (tileIndex < 0 || tileIndex >= state.airQualityByTile.length) return state.metrics.airQuality;
  const local = state.airQualityByTile[tileIndex];
  if (Number.isNaN(local) || local <= -1) return state.metrics.airQuality;
  return local;
}

// Recompute per-tile air quality each tick. The map blends three signals:
//   1) Life-support coverage distance — close to a powered LS source = ~100,
//      near the edge of reach = ~50, unreachable but pressurized = drifts down,
//      vacuum/space tiles = 0.
//   2) Pressurization — depressurized tiles drop fast (vacuum).
//   3) Fire proximity — burning tiles and their immediate neighbors lose
//      oxygen rapidly while a fire is active.
// Values smooth toward their target so brief disruptions don't flicker the
// inspector or cause whiplash exposure damage.
function updateLocalAirQuality(state: StationState, dt: number): void {
  const coverage = computeLifeSupportCoverage(state);
  const total = state.tiles.length;
  const fires = state.effects.fires;
  const fireTiles = new Set<number>();
  for (const fire of fires) {
    fireTiles.add(fire.anchorTile);
    const fx = fire.anchorTile % state.width;
    const fy = Math.floor(fire.anchorTile / state.width);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = fx + dx;
      const ny = fy + dy;
      if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) continue;
      fireTiles.add(ny * state.width + nx);
    }
  }
  const hasLS = coverage.sourceCount > 0;
  for (let tile = 0; tile < total; tile++) {
    let target: number;
    if (!isWalkable(state.tiles[tile])) {
      // Walls/space: always treated as 0 so the overlay reads them as bad
      // (won't actually be exposed to since no actor stands there).
      target = 0;
    } else if (!state.pressurized[tile]) {
      target = 5;
    } else if (!hasLS) {
      // No LS at all — fall back to the global metric so the existing macro
      // air loop still drives gameplay until the player builds life support.
      target = state.metrics.airQuality;
    } else {
      const dist = coverage.distanceByTile[tile];
      if (dist < 0) {
        // Pressurized but unreachable from any LS source — slow suffocation.
        target = 18;
      } else if (dist === 0) {
        target = 100;
      } else if (dist <= 6) {
        target = 100 - (dist / 6) * 14; // 100 → 86
      } else if (dist <= 16) {
        target = 86 - ((dist - 6) / 10) * 26; // 86 → 60
      } else if (dist <= 24) {
        target = 60 - ((dist - 16) / 8) * 30; // 60 → 30
      } else {
        target = 28;
      }
      // Fire suppression: burning tile and neighbors lose oxygen rapidly.
      if (fireTiles.has(tile)) target = Math.min(target, 18);
    }
    // Smooth toward target so single-tick disruptions don't whiplash exposure.
    const current = state.airQualityByTile[tile];
    const settle = current < 0 || Number.isNaN(current) ? target : current + (target - current) * Math.min(1, dt * 1.2);
    state.airQualityByTile[tile] = clamp(settle, 0, 100);
  }
}

function applyAirExposure(
  state: StationState,
  actor: { airExposureSec: number; healthState: 'healthy' | 'distressed' | 'critical' },
  airQuality: number,
  dt: number
): { died: boolean } {
  if (airQuality <= AIR_CRITICAL_THRESHOLD) {
    actor.airExposureSec += dt * 1.35;
  } else if (airQuality <= AIR_DISTRESS_THRESHOLD) {
    actor.airExposureSec += dt;
  } else {
    actor.airExposureSec = Math.max(0, actor.airExposureSec - dt * 1.8);
  }

  if (actor.airExposureSec >= AIR_DEATH_EXPOSURE_SEC) {
    return { died: true };
  }

  updateActorHealthFromExposure(state, actor);
  return { died: false };
}

function updateActorHealthFromExposure(
  state: StationState,
  actor: { airExposureSec: number; healthState: 'healthy' | 'distressed' | 'critical' }
): void {
  const priorHealthState = actor.healthState;
  actor.healthState =
    actor.airExposureSec >= AIR_CRITICAL_EXPOSURE_SEC
      ? 'critical'
      : actor.airExposureSec >= AIR_DISTRESS_EXPOSURE_SEC
        ? 'distressed'
        : 'healthy';
  if (priorHealthState !== 'healthy' && actor.healthState === 'healthy') {
    state.metrics.actorsTreatedLifetime += 1;
  }
}

function registerBodyDeathAtTile(state: StationState, tileIndex: number, occupancyByTile: Map<number, number>): void {
  state.metrics.deathsTotal += 1;
  state.metrics.bodyCount += 1;
  state.bodyTiles.push(tileIndex);
  state.recentDeathTimes.push(state.now);
  occupancyByTile.set(tileIndex, Math.max(0, (occupancyByTile.get(tileIndex) ?? 1) - 1));
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
    bladder: 70,
    thirst: 75,
    resting: false,
    cleaning: false,
    toileting: false,
    drinking: false,
    leisure: false,
    activeJobId: null,
    carryingItemType: null,
    carryingAmount: 0,
    blockedTicks: 0,
    idleReason: 'idle_available',
    restSessionActive: false,
    cleanSessionActive: false,
    toiletSessionActive: false,
    drinkSessionActive: false,
    leisureSessionActive: false,
    leisureUntil: 0,
    restLockUntil: 0,
    restCooldownUntil: 0,
    taskLockUntil: 0,
    shiftBucket: id % CREW_SHIFT_BUCKET_COUNT,
    assignmentStickyUntil: 0,
    assignmentHoldUntil: 0,
    lastSystem: null,
    assignedSystem: null,
    retargetCountWindow: 0,
    airExposureSec: 0,
    healthState: 'healthy'
  };
}

function makeResident(
  id: number,
  tileIndex: number,
  width: number,
  rng: () => number,
  homeShipId: number,
  homeDockId: number,
  housingUnitId: number,
  bedModuleId: number
): Resident {
  const role = pickResidentRole(rng);
  const roleAffinity =
    role === 'market_helper'
      ? { [RoomType.Market]: 1, [RoomType.RecHall]: 0.6 }
      : role === 'hydro_assist'
        ? { [RoomType.Hydroponics]: 1, [RoomType.Kitchen]: 0.5 }
        : role === 'civic_watch'
          ? { [RoomType.Security]: 1, [RoomType.Brig]: 0.8 }
          : {};
  return {
    id,
    ...tileCenter(tileIndex, width),
    tileIndex,
    path: [],
    speed: 1.8,
    hunger: 80,
    energy: 85,
    hygiene: 75,
    social: 72,
    safety: 70,
    stress: 10,
    routinePhase: 'rest',
    role,
    roleAffinity,
    state: ResidentState.Idle,
    actionTimer: 0,
    retargetAt: 0,
    reservedTargetTile: null,
    homeShipId,
    homeDockId,
    housingUnitId,
    bedModuleId,
    satisfaction: 72,
    leaveIntent: 0,
    blockedTicks: 0,
    airExposureSec: 0,
    healthState: 'healthy',
    agitation: 8,
    activeIncidentId: null,
    confrontationUntil: 0
  };
}

function pickResidentRole(rng: () => number): ResidentRole {
  const roll = rng();
  let cursor = 0;
  const ordered: ResidentRole[] = ['market_helper', 'hydro_assist', 'civic_watch'];
  for (const role of ordered) {
    cursor += RESIDENT_ROLE_WEIGHTS[role];
    if (roll <= cursor) return role;
  }
  return 'none';
}

function spawnVisitor(state: StationState, dockIndex: number, ship?: ArrivingShip): void {
  const mix = ship?.manifestMix ?? {
    diner: 0.4,
    shopper: 0.3,
    lounger: 0.2,
    rusher: 0.1
  };
  const archetype = pickArchetypeFromMix(state, mix);
  state.usageTotals.archetypesEverSeen[archetype] = true;
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
    carryingMeal: false,
    reservedServingTile: null,
    reservedTargetTile: null,
    blockedTicks: 0,
    archetype,
    taxSensitivity: profile.taxSensitivity,
    spendMultiplier: profile.spendMultiplier,
    patienceMultiplier: profile.patienceMultiplier,
    primaryPreference,
    spawnedAt: state.now,
    originShipId: ship?.id ?? null,
    airExposureSec: 0,
    healthState: 'healthy',
    hygieneStopUsed: false,
    leisureLegsRemaining: 0,
    leisureLegsPlanned: 0,
    lastLeisureKind: null
  };
  // Plan the trip up front. Long-stay archetypes do multi-room loops; rushers
  // mostly eat-and-leave. Roll once at spawn so the inspector can show the
  // visitor's intended itinerary and downstream rooms see a stable plan.
  const plan = planVisitorLeisureLegs(state, archetype);
  visitor.leisureLegsPlanned = plan;
  visitor.leisureLegsRemaining = plan;
  state.visitors.push(visitor);
}

function planVisitorLeisureLegs(state: StationState, archetype: VisitorArchetype): number {
  const roll = state.rng();
  const availableKinds = [
    activeModuleTargets(state, [ModuleType.MarketStall], [RoomType.Market]).length > 0,
    activeModuleTargets(state, [ModuleType.Couch, ModuleType.GameStation, ModuleType.Bench], [RoomType.Lounge]).length > 0 ||
      activeModuleTargets(state, [ModuleType.RecUnit, ModuleType.Bench], [RoomType.RecHall]).length > 0,
    activeModuleTargets(state, [ModuleType.BarCounter], [RoomType.Cantina]).length > 0,
    activeModuleTargets(state, [ModuleType.Telescope], [RoomType.Observatory]).length > 0
  ].filter(Boolean).length;
  const cap = Math.max(0, Math.min(availableKinds, 3));
  if (cap <= 0) return 0;
  const clampLegs = (legs: number) => Math.min(cap, legs);
  switch (archetype) {
    case 'rusher':
      return roll < 0.9 ? 0 : clampLegs(1);
    case 'diner':
      return roll < 0.68 ? 0 : clampLegs(1);
    case 'shopper':
      return roll < 0.28 ? clampLegs(1) : roll < 0.9 ? clampLegs(2) : clampLegs(3);
    case 'lounger':
      return roll < 0.2 ? clampLegs(1) : roll < 0.86 ? clampLegs(2) : clampLegs(3);
    default:
      return clampLegs(1);
  }
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

function ensureResidentPopulation(_state: StationState): void {
  // No-op placeholder: residents join via visitor conversion +
  // residential-ship boarding, populated at those event sites. Kept as
  // a seam for future population-cap enforcement.
}

function rebuildDockEntities(state: StationState): void {
  const byAnyTile = new Map<number, DockEntity>();
  const next: DockEntity[] = [];
  for (const dock of state.docks) {
    for (const tile of dock.tiles) byAnyTile.set(tile, dock);
  }
  let maxId = state.docks.reduce((best, dock) => Math.max(best, dock.id), 0);
  // Track inherited ids that have already been consumed by a new cluster.
  // Fixes the dock-split-on-deletion case: when a middle tile is removed
  // from a ≥3-tile dock, BOTH resulting clusters would otherwise inherit
  // the same parent id via `byAnyTile.get()` → id collision in state.docks.
  // First cluster keeps the original id; subsequent clusters fall through
  // to `++maxId` since their lookup skips consumed ids.
  const consumedIds = new Set<number>();
  const visited = new Set<number>();
  for (let i = 0; i < state.tiles.length; i++) {
    if (state.tiles[i] !== TileType.Dock || visited.has(i)) continue;
    const cluster = adjacentDockTiles(state, i).sort((a, b) => a - b);
    for (const tile of cluster) visited.add(tile);
    if (cluster.length === 0) continue;
    // Inherited metadata (purpose, allowedShipTypes, etc.) copies from
    // ANY tile's parent dock — both halves of a split should remember
    // the parent's settings. But the inherited ID can only be reused
    // once per rebuild; subsequent splits get fresh maxId++.
    const inheritedMeta = cluster.map((tile) => byAnyTile.get(tile)).find((d) => d !== undefined);
    const inheritedId = inheritedMeta && !consumedIds.has(inheritedMeta.id) ? inheritedMeta.id : null;
    const anchorTile = cluster[0];
    const facing = inheritedMeta?.facing ?? chooseDockFacingForPlacement(state, anchorTile) ?? 'north';
    const check = validateDockPlacementAt(state, anchorTile, facing);
    const maxSizeByArea = maxShipSizeForArea(cluster.length);
    const allowedShipSizes = inheritedMeta?.allowedShipSizes?.filter((s) => shipSizesUpTo(maxSizeByArea).includes(s)) ?? shipSizesUpTo(maxSizeByArea);
    const newId = inheritedId ?? ++maxId;
    consumedIds.add(newId);
    next.push({
      id: newId,
      purpose: inheritedMeta?.purpose ?? 'visitor',
      tiles: cluster,
      anchorTile,
      area: cluster.length,
      facing,
      lane: laneFromFacing(facing),
      approachTiles: check.approachTiles,
      allowedShipTypes: inheritedMeta?.allowedShipTypes?.length ? [...inheritedMeta.allowedShipTypes] : ['tourist'],
      allowedShipSizes: allowedShipSizes.length > 0 ? allowedShipSizes : ['small'],
      maxSizeByArea,
      occupiedByShipId: inheritedId !== null ? (inheritedMeta?.occupiedByShipId ?? null) : null
    });
  }
  const existingIds = new Set(next.map((d) => d.id));
  state.arrivingShips = state.arrivingShips.filter((ship) => ship.assignedDockId === null || existingIds.has(ship.assignedDockId));
  state.dockQueue = state.dockQueue.filter((entry) =>
    next.some(
      (d) =>
        d.purpose === 'visitor' &&
        d.lane === entry.lane &&
        d.allowedShipTypes.includes(entry.shipType) &&
        d.allowedShipSizes.includes(entry.size)
    )
  );
  state.docks = next;
  bumpDockVersion(state);
  state.derived.cacheVersions.dockEntitiesTopologyVersion = state.topologyVersion;
}

// ---------------------------------------------------------------------------
// Berth (RoomType.Berth) helpers — dock-migration v0.
//
// A Berth is a regular room paint whose hull-facing edge is open to space.
// Capability tags are derived from modules placed inside the room cluster.
// Ship→berth matching is via `pickBerthForShip` (size + exposure + caps).
//
// v1: U-shape strict validation, airlock primitive, save migration.
// ---------------------------------------------------------------------------

function berthSizeClassForArea(area: number): BerthSizeClass {
  if (area >= BERTH_SIZE_MIN.large) return 'large';
  if (area >= BERTH_SIZE_MIN.medium) return 'medium';
  return 'small';
}

function shipSizeFitsBerth(shipSize: ShipSize, berthSize: BerthSizeClass): boolean {
  // Ships dock at berths of equal-or-greater class. small ⊂ medium ⊂ large.
  if (berthSize === 'large') return true;
  if (berthSize === 'medium') return shipSize !== 'large';
  return shipSize === 'small';
}

const MODULE_CAPABILITY_TAGS: Partial<Record<ModuleType, CapabilityTag>> = {
  [ModuleType.Gangway]: 'gangway',
  [ModuleType.CustomsCounter]: 'customs',
  [ModuleType.CargoArm]: 'cargo'
};

function tileTouchesSpace(state: StationState, tile: number): boolean {
  const { x, y } = fromIndex(tile, state.width);
  const neighbors = [
    { x, y: y - 1 },
    { x: x + 1, y },
    { x, y: y + 1 },
    { x: x - 1, y }
  ];
  for (const n of neighbors) {
    if (!inBounds(n.x, n.y, state.width, state.height)) return true;
    if (state.tiles[toIndex(n.x, n.y, state.width)] === TileType.Space) return true;
  }
  return false;
}

function tileTouchesWallOrSpace(state: StationState, tile: number): boolean {
  const { x, y } = fromIndex(tile, state.width);
  const neighbors = [
    { x, y: y - 1 },
    { x: x + 1, y },
    { x, y: y + 1 },
    { x: x - 1, y }
  ];
  for (const n of neighbors) {
    if (!inBounds(n.x, n.y, state.width, state.height)) return true;
    const neighborTile = state.tiles[toIndex(n.x, n.y, state.width)];
    if (neighborTile === TileType.Space || neighborTile === TileType.Wall) return true;
  }
  return false;
}

export function validateBerthModulePlacement(state: StationState, module: ModuleType, tiles: number[]): string | null {
  if (module === ModuleType.Gangway && !tiles.some((tile) => tileTouchesSpace(state, tile))) {
    return 'gangway must touch the berth edge open to space';
  }
  if (module === ModuleType.CargoArm && !tiles.some((tile) => tileTouchesWallOrSpace(state, tile))) {
    return 'cargo arm must sit on a berth edge';
  }
  return null;
}

function computeBerthCapabilities(state: StationState, clusterTiles: number[]): CapabilityTag[] {
  const tileSet = new Set(clusterTiles);
  const tags = new Set<CapabilityTag>();
  for (const m of state.moduleInstances) {
    const tag = MODULE_CAPABILITY_TAGS[m.type];
    if (!tag) continue;
    // Any module footprint tile inside the berth contributes its tag.
    if (m.tiles.some((t) => tileSet.has(t))) {
      tags.add(tag);
    }
  }
  return [...tags];
}

function berthHasSpaceExposure(state: StationState, clusterTiles: number[]): boolean {
  return clusterTiles.some((tile) => tileTouchesSpace(state, tile));
}

interface BerthCandidate {
  anchorTile: number;
  tiles: number[];
  size: BerthSizeClass;
  spaceExposed: boolean;
  capabilities: CapabilityTag[];
  occupiedByShipId: number | null;
}

function listBerthCandidates(state: StationState): BerthCandidate[] {
  const clusters = roomClusters(state, RoomType.Berth);
  // Map of berth-anchor → ship currently bound there.
  const occupiedByAnchor = new Map<number, number>();
  for (const ship of state.arrivingShips) {
    if (ship.assignedBerthAnchor !== null && ship.assignedBerthAnchor !== undefined) {
      occupiedByAnchor.set(ship.assignedBerthAnchor, ship.id);
    }
  }
  const out: BerthCandidate[] = [];
  for (const cluster of clusters) {
    if (cluster.length === 0) continue;
    const anchor = cluster.reduce((best, t) => (t < best ? t : best), cluster[0]);
    out.push({
      anchorTile: anchor,
      tiles: cluster,
      size: berthSizeClassForArea(cluster.length),
      spaceExposed: berthHasSpaceExposure(state, cluster),
      capabilities: computeBerthCapabilities(state, cluster),
      occupiedByShipId: occupiedByAnchor.get(anchor) ?? null
    });
  }
  return out;
}

function isCapabilitySuperset(have: CapabilityTag[], required: CapabilityTag[]): boolean {
  for (const tag of required) {
    if (!have.includes(tag)) return false;
  }
  return true;
}

/**
 * Find a free Berth room that can accept a ship of the given type+size.
 * Uses ship size class + ship requiredCapabilities (from SHIP_PROFILES).
 * Returns null if no berth matches — caller then falls back to legacy
 * Dock-tile pathing in `pickDockForShip`. v0 doesn't break old saves.
 */
function pickBerthForShip(
  state: StationState,
  shipType: ShipType,
  shipSize: ShipSize
): BerthCandidate | null {
  const required = SHIP_PROFILES[shipType]?.requiredCapabilities ?? [];
  const candidates = listBerthCandidates(state)
    .filter((b) => b.occupiedByShipId === null)
    .filter((b) => shipSizeFitsBerth(shipSize, b.size))
    .filter((b) => b.spaceExposed)
    .filter((b) => isCapabilitySuperset(b.capabilities, required));
  if (candidates.length === 0) return null;
  // Pick the smallest-fit berth (cheapest by area), tiebreak on lower anchor index.
  candidates.sort((a, b) => a.tiles.length - b.tiles.length || a.anchorTile - b.anchorTile);
  return candidates[0];
}

/**
 * Did at least one berth exist that could fit the ship's size class? If
 * yes but `pickBerthForShip` returned null, the failure was capability
 * mismatch — surface a hint in the alert panel.
 */
// Dock-migration v0: UI-facing inspector for berth tiles. Given a tile
// inside a Berth room, returns the berth's size class, installed
// capability tags, accepted/rejected ship types, and current occupancy.
// `null` if the tile is not part of a Berth cluster.
export interface BerthInspector {
  anchorTile: number;
  clusterTiles: number[];
  size: BerthSizeClass;
  spaceExposed: boolean;
  capabilities: CapabilityTag[];
  acceptedShipTypes: ShipType[];
  rejectedShipTypes: Array<{ shipType: ShipType; missing: CapabilityTag[] }>;
  occupiedByShipId: number | null;
}

export function getBerthInspectorAt(state: StationState, tileIndex: number): BerthInspector | null {
  if (tileIndex < 0 || tileIndex >= state.rooms.length) return null;
  if (state.rooms[tileIndex] !== RoomType.Berth) return null;
  ensureRoomClustersCache(state);
  const meta = state.derived.clusterByTile.get(tileIndex);
  if (!meta || meta.room !== RoomType.Berth) return null;
  const cluster = meta.cluster;
  const capabilities = computeBerthCapabilities(state, cluster);
  const size = berthSizeClassForArea(cluster.length);
  const anchorTile = cluster.reduce((best, t) => (t < best ? t : best), cluster[0]);
  const spaceExposed = berthHasSpaceExposure(state, cluster);
  const accepted: ShipType[] = [];
  const rejected: Array<{ shipType: ShipType; missing: CapabilityTag[] }> = [];
  const shipTypes: ShipType[] = ['tourist', 'trader', 'industrial', 'military', 'colonist'];
  for (const t of shipTypes) {
    const required = SHIP_PROFILES[t]?.requiredCapabilities ?? [];
    const missing = required.filter((tag) => !capabilities.includes(tag));
    if (missing.length === 0) accepted.push(t);
    else rejected.push({ shipType: t, missing });
  }
  let occupiedByShipId: number | null = null;
  for (const ship of state.arrivingShips) {
    if (ship.assignedBerthAnchor === anchorTile) {
      occupiedByShipId = ship.id;
      break;
    }
  }
  return {
    anchorTile,
    clusterTiles: cluster,
    size,
    spaceExposed,
    capabilities,
    acceptedShipTypes: accepted,
    rejectedShipTypes: rejected,
    occupiedByShipId
  };
}

function describeMissingCapabilities(
  state: StationState,
  shipType: ShipType,
  shipSize: ShipSize
): string | null {
  const required = SHIP_PROFILES[shipType]?.requiredCapabilities ?? [];
  const sizeFit = listBerthCandidates(state).filter((b) => shipSizeFitsBerth(shipSize, b.size));
  if (sizeFit.length === 0) return null; // no size match, not a berth-readiness issue
  const exposed = sizeFit.filter((b) => b.spaceExposed);
  if (exposed.length === 0) {
    return `${shipType} ship waiting - berth needs one edge open to space`;
  }
  if (required.length === 0) return null;
  // Find the closest-by-capability berth and report missing tags.
  let bestMissing: CapabilityTag[] | null = null;
  for (const cand of exposed) {
    const missing = required.filter((t) => !cand.capabilities.includes(t));
    if (bestMissing === null || missing.length < bestMissing.length) {
      bestMissing = missing;
    }
  }
  if (!bestMissing || bestMissing.length === 0) return null;
  return `${shipType} ship waiting — needs ${bestMissing.join(' + ')}`;
}

type PrivateHousingUnit = {
  id: number;
  cabinTile: number;
  bedModuleId: number;
  bedTile: number;
};

function privateHygieneTargets(state: StationState): number[] {
  return collectRoomTilesByPolicy(state, RoomType.Hygiene, ['resident', 'private_resident']);
}

function privateHousingUnits(state: StationState): PrivateHousingUnit[] {
  const hygieneTargets = privateHygieneTargets(state);
  if (hygieneTargets.length <= 0) return [];
  const dormClusters = roomClusters(state, RoomType.Dorm);
  const units: PrivateHousingUnit[] = [];
  for (const cluster of dormClusters) {
    if (cluster.length <= 0) continue;
    if (cluster.some((tile) => state.roomHousingPolicies[tile] !== 'private_resident')) continue;
    const clusterSet = new Set(cluster);
    const beds = state.moduleInstances
      .filter((m) => m.type === ModuleType.Bed && clusterSet.has(m.originTile))
      .sort((a, b) => a.originTile - b.originTile);
    for (const bed of beds) {
      const hasHygienePath = hygieneTargets.some(
        (target) =>
          findPath(state, bed.originTile, target, { allowRestricted: true, intent: 'resident' }, state.pathOccupancyByTile) !== null
      );
      if (!hasHygienePath) continue;
      units.push({
        id: bed.id,
        cabinTile: cluster[0],
        bedModuleId: bed.id,
        bedTile: bed.originTile
      });
    }
  }
  return units;
}

function assignedHousingBedIds(state: StationState): Set<number> {
  return new Set(state.residents.map((r) => r.bedModuleId).filter((id): id is number => id !== null));
}

function pickPrivateHousingUnitForResident(
  state: StationState,
  startTile: number
): { unit: PrivateHousingUnit; pathToBed: number[] } | null {
  const assignedBeds = assignedHousingBedIds(state);
  const availableUnits = privateHousingUnits(state).filter((unit) => !assignedBeds.has(unit.bedModuleId));
  let best: { unit: PrivateHousingUnit; pathToBed: number[] } | null = null;
  for (const unit of availableUnits) {
    const path = findPath(state, startTile, unit.bedTile, { allowRestricted: true, intent: 'resident' }, state.pathOccupancyByTile);
    if (!path) continue;
    if (!best || path.length < best.pathToBed.length) {
      best = { unit, pathToBed: path };
    }
  }
  return best;
}

function findResidentialDockForShip(state: StationState, ship: ArrivingShip): DockEntity | null {
  const eligible = state.docks
    .filter((dock) => dock.purpose === 'residential')
    .filter((dock) => dock.occupiedByShipId === null)
    .filter((dock) => dock.allowedShipTypes.includes(ship.shipType))
    .filter((dock) => dock.allowedShipSizes.includes(ship.size))
    .filter((dock) => shipSizeForBay(dock.area, ship.size) !== null)
    .sort((a, b) => a.area - b.area);
  return eligible[0] ?? null;
}

function dockCenter(state: StationState, dock: DockEntity): { x: number; y: number } {
  const center = dock.tiles
    .map((tile) => fromIndex(tile, state.width))
    .reduce(
      (acc, pos) => ({ x: acc.x + pos.x, y: acc.y + pos.y }),
      { x: 0, y: 0 }
    );
  return {
    x: center.x / Math.max(1, dock.tiles.length) + 0.5,
    y: center.y / Math.max(1, dock.tiles.length) + 0.5
  };
}

function moveShipToDock(state: StationState, ship: ArrivingShip, dock: DockEntity): void {
  if (ship.assignedDockId !== null) {
    const oldDock = state.docks.find((d) => d.id === ship.assignedDockId);
    if (oldDock && oldDock.occupiedByShipId === ship.id) {
      oldDock.occupiedByShipId = null;
    }
  }
  dock.occupiedByShipId = ship.id;
  const center = dockCenter(state, dock);
  ship.assignedDockId = dock.id;
  ship.bayTiles = [...dock.tiles];
  ship.bayCenterX = center.x;
  ship.bayCenterY = center.y;
  ship.lane = dock.lane;
}

function unlinkResidentFromShip(state: StationState, resident: Resident): void {
  if (resident.homeShipId === null) return;
  const ship = state.arrivingShips.find((s) => s.id === resident.homeShipId);
  if (!ship) return;
  ship.residentIds = ship.residentIds.filter((id) => id !== resident.id);
  if (ship.kind === 'resident_home' && ship.residentIds.length <= 0) {
    ship.stage = 'depart';
    ship.stageTime = 0;
  }
}

function maybeConvertVisitorToResident(state: StationState, visitor: Visitor, ship: ArrivingShip): Resident | null {
  if (ship.stage !== 'docked') return null;
  const housing = pickPrivateHousingUnitForResident(state, visitor.tileIndex);
  if (!housing) return null;
  let residentialDock: DockEntity | null = null;
  if (ship.kind === 'resident_home') {
    residentialDock = state.docks.find((d) => d.id === ship.assignedDockId) ?? null;
  } else {
    residentialDock = findResidentialDockForShip(state, ship);
  }
  if (!residentialDock) return null;
  state.usageTotals.residentConversionAttempts += 1;
  const ratingFactor = clamp((state.metrics.stationRating - 50) / 32, 0.3, 1.6);
  const comfortFactor = visitor.servedMeal ? 1.2 : 0.8;
  const shipProfile = SHIP_PROFILES[ship.shipType];
  const conversionMultiplier = shipProfile?.conversionChanceMultiplier ?? 1;
  const chance = clamp(
    RESIDENT_CONVERSION_BASE_CHANCE * ratingFactor * comfortFactor * conversionMultiplier,
    0.01,
    0.35
  );
  if (state.rng() > chance) return null;

  if (ship.kind === 'transient') {
    if (ship.originDockId === null) ship.originDockId = ship.assignedDockId;
    moveShipToDock(state, ship, residentialDock);
    ship.kind = 'resident_home';
    ship.stage = 'docked';
    ship.stageTime = 0;
  }

  const resident = makeResident(
    state.residentSpawnCounter++,
    visitor.tileIndex,
    state.width,
    state.rng,
    ship.id,
    ship.assignedDockId ?? residentialDock.id,
    housing.unit.cabinTile,
    housing.unit.bedModuleId
  );
  setResidentPath(state, resident, housing.pathToBed);
  state.residents.push(resident);
  ship.residentIds.push(resident.id);
  state.usageTotals.residentConversionSuccesses += 1;
  state.metrics.residentsConvertedLifetime += 1;
  return resident;
}

function assignCrewJobs(state: StationState): void {
  const jobsBySystem = new Map<CrewPrioritySystem, CrewTaskCandidate[]>();
  const targetBySystem = {
    reactor: dutyAnchorsForSystem(state, 'reactor'),
    'life-support': dutyAnchorsForSystem(state, 'life-support'),
    hydroponics: dutyAnchorsForSystem(state, 'hydroponics'),
    kitchen: dutyAnchorsForSystem(state, 'kitchen'),
    workshop: dutyAnchorsForSystem(state, 'workshop'),
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
    workshop: CREW_PER_WORKSHOP,
    cafeteria: CREW_PER_CAFETERIA,
    security: CREW_PER_SECURITY,
    hygiene: CREW_PER_HYGIENE,
    lounge: CREW_PER_LOUNGE,
    market: CREW_PER_MARKET
  };

  const criticalTargets = computeCriticalCapacityTargets(state);
  const requiredSecurityPosts = targetBySystem.security.length;
  const requiredMinimum = new Map<CrewPrioritySystem, number>([
    ['reactor', criticalTargets.requiredReactorPosts],
    ['life-support', criticalTargets.requiredLifeSupportPosts],
    ['hydroponics', criticalTargets.requiredHydroPosts],
    ['kitchen', criticalTargets.requiredKitchenPosts],
    ['cafeteria', criticalTargets.requiredCafeteriaPosts],
    ['security', requiredSecurityPosts]
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
    const room = systemRoomType(system);
    const requiresPost = ROOM_DEFINITIONS[room]?.staffedPostMode === 'required';
    const requiredPosts = requiredMinimum.get(system) ?? 0;
    if (!requiresPost && requiredPosts <= 0) {
      jobsBySystem.set(system, tasks);
      continue;
    }
    for (const anchor of anchors) {
      for (let i = 0; i < slotsPerSystem[system]; i++) {
        tasks.push({
          id: `${system}:${anchor}:${i}`,
          kind: requiredPosts > 0 ? 'critical_post' : 'post',
          system,
          tileIndex: anchor,
          score: 0,
          critical: requiredPosts > 0,
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
        setCrewPath(state, crew, []);
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
    if (!roomMatchesCrewSystem(crew.assignedSystem, state.rooms[crew.targetTile])) return false;
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
        const path = findPath(state, crew.tileIndex, task.tileIndex, { allowRestricted: true, intent: 'crew' }, state.pathOccupancyByTile);
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
        setCrewPath(state, crew, []);
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
    clearCrewLeisure(crew);
    assignedBySystem.set(best.system as CrewPrioritySystem, (assignedBySystem.get(best.system as CrewPrioritySystem) ?? 0) + 1);
    assignedTargetCounts.set(`${best.system}:${best.tileIndex}`, (assignedTargetCounts.get(`${best.system}:${best.tileIndex}`) ?? 0) + 1);
    criticalRemaining.set(best.system as CrewPrioritySystem, Math.max(0, (criticalRemaining.get(best.system as CrewPrioritySystem) ?? 0) - 1));
    if (changed) {
      crew.taskLockUntil = state.now + CREW_TASK_LOCK_SEC;
      crew.assignmentStickyUntil = state.now + CREW_ASSIGNMENT_STICKY_SEC;
      crew.assignmentHoldUntil = state.now + CREW_ASSIGNMENT_HOLD_SEC;
      setCrewPath(state, crew, []);
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
  state.ops.workshopTotal = roomClusters(state, RoomType.Workshop).length;
  state.ops.clinicTotal = roomClusters(state, RoomType.Clinic).length;
  state.ops.brigTotal = roomClusters(state, RoomType.Brig).length;
  state.ops.recHallTotal = roomClusters(state, RoomType.RecHall).length;
  state.ops.securityTotal = roomClusters(state, RoomType.Security).length;
  state.ops.dormsTotal = roomClusters(state, RoomType.Dorm).length;
  state.ops.hygieneTotal = roomClusters(state, RoomType.Hygiene).length;
  state.ops.hydroponicsTotal = roomClusters(state, RoomType.Hydroponics).length;
  state.ops.lifeSupportTotal = roomClusters(state, RoomType.LifeSupport).length;
  state.ops.loungeTotal = roomClusters(state, RoomType.Lounge).length;
  state.ops.marketTotal = roomClusters(state, RoomType.Market).length;
  state.ops.cantinaTotal = roomClusters(state, RoomType.Cantina).length;
  state.ops.observatoryTotal = roomClusters(state, RoomType.Observatory).length;
  state.ops.logisticsStockTotal = roomClusters(state, RoomType.LogisticsStock).length;
  state.ops.storageTotal = roomClusters(state, RoomType.Storage).length;
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

type ClusterInspection = {
  room: RoomType;
  cluster: number[];
  clusterSize: number;
  minTilesRequired: number;
  minTilesMet: boolean;
  doorCount: number;
  hasDoor: boolean;
  pressurizedPct: number;
  pressurizedEnough: boolean;
  staffCount: number;
  requiredStaff: number;
  hasServiceNode: boolean;
  serviceNodeCount: number;
  hasPath: boolean;
  reasons: string[];
  warnings: string[];
  moduleProgress: Array<{ module: ModuleType; have: number; need: number }>;
  anyOfProgress: { modules: ModuleType[]; satisfied: boolean };
};

function inspectRoomCluster(
  state: StationState,
  room: RoomType,
  cluster: number[],
  staffByTile: Map<number, number>
): ClusterInspection {
  const definition = ROOM_DEFINITIONS[room] ?? ROOM_DEFINITIONS[RoomType.None];
  let pressurizedCount = 0;
  let doorCount = 0;
  let staffCount = 0;
  for (const tile of cluster) {
    const hasDoor = hasAdjacentDoor(state, tile);
    if (hasDoor) doorCount += 1;
    if (state.pressurized[tile]) pressurizedCount += 1;
    staffCount += staffByTile.get(tile) ?? 0;
  }
  const minTilesMet = cluster.length >= definition.minTiles;
  const pressurizedPct = cluster.length > 0 ? (pressurizedCount / cluster.length) * 100 : 0;
  const pressurizedEnough = pressurizedPct >= 70;

  const moduleCounts = moduleCountsForCluster(state, cluster);
  const moduleProgress = definition.requiredModules.map((req) => ({
    module: req.module,
    have: moduleCounts.get(req.module) ?? 0,
    need: req.count
  }));
  const modulesMet = moduleProgress.every((p) => p.have >= p.need);
  const anyOfSatisfied =
    definition.requiredAnyOf.length === 0 ||
    definition.requiredAnyOf.some((module) => (moduleCounts.get(module) ?? 0) > 0);
  const hasServiceNode = moduleTypesForRoomServices(room).length === 0 || collectServiceTargets(state, room).some((t) => cluster.includes(t));
  const serviceTargets =
    moduleTypesForRoomServices(room).length > 0
      ? collectServiceTargets(state, room).filter((tile) => cluster.includes(tile))
      : [...cluster];
  const serviceNodeCount = serviceTargets.length;

  const starts = collectTiles(state, TileType.Dock);
  if (starts.length === 0) starts.push(...collectTiles(state, TileType.Floor));
  let hasPath = starts.length === 0;
  if (!hasPath) {
    for (const start of starts) {
      const path = chooseNearestPath(state, start, serviceTargets.length > 0 ? serviceTargets : cluster, true);
      if (path !== null) {
        hasPath = true;
        break;
      }
    }
  }

  const requiredStaff = definition.staffedPostMode === 'required' ? 1 : 0;
  const reasons: string[] = [];
  if (!minTilesMet) reasons.push('below minimum size');
  if (!modulesMet || !anyOfSatisfied) reasons.push('missing required modules');
  if (definition.activationChecks.door && doorCount <= 0) reasons.push('missing door');
  if (definition.activationChecks.pressurization && !pressurizedEnough) reasons.push('not pressurized');
  if (definition.activationChecks.path && !hasPath) reasons.push('no path');
  if (requiredStaff > 0 && staffCount < requiredStaff) reasons.push('no_assigned_staff');

  const warnings: string[] = [];
  if (serviceNodeCount <= 1 && cluster.length >= 10) warnings.push('room too large for service nodes');
  if (doorCount <= 1 && cluster.length >= 6) warnings.push('single-door bottleneck risk');

  return {
    room,
    cluster,
    clusterSize: cluster.length,
    minTilesRequired: definition.minTiles,
    minTilesMet,
    doorCount,
    hasDoor: doorCount > 0,
    pressurizedPct,
    pressurizedEnough,
    staffCount,
    requiredStaff,
    hasServiceNode,
    serviceNodeCount,
    hasPath,
    reasons,
    warnings,
    moduleProgress,
    anyOfProgress: { modules: definition.requiredAnyOf, satisfied: anyOfSatisfied }
  };
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
    const inspection = inspectRoomCluster(state, room, cluster, staffByTile);
    const satisfiesRequirements = inspection.reasons.length === 0;

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
    false,
    dt,
    updateDebounce
  ).length;
  state.ops.cafeteriasActive = operationalClustersForRoom(
    state,
    RoomType.Cafeteria,
    CREW_PER_CAFETERIA,
    false,
    dt,
    updateDebounce
  ).length;
  state.ops.kitchenActive = operationalClustersForRoom(
    state,
    RoomType.Kitchen,
    CREW_PER_KITCHEN,
    false,
    dt,
    updateDebounce
  ).length;
  state.ops.workshopActive = operationalClustersForRoom(
    state,
    RoomType.Workshop,
    CREW_PER_WORKSHOP,
    false,
    dt,
    updateDebounce
  ).length;
  state.ops.clinicActive = operationalClustersForRoom(
    state,
    RoomType.Clinic,
    CREW_PER_CLINIC,
    false,
    dt,
    updateDebounce
  ).length;
  state.ops.brigActive = operationalClustersForRoom(
    state,
    RoomType.Brig,
    CREW_PER_BRIG,
    false,
    dt,
    updateDebounce
  ).length;
  state.ops.recHallActive = operationalClustersForRoom(
    state,
    RoomType.RecHall,
    CREW_PER_REC_HALL,
    false,
    dt,
    updateDebounce
  ).length;
  state.ops.securityActive = operationalClustersForRoom(
    state,
    RoomType.Security,
    CREW_PER_SECURITY,
    false,
    dt,
    updateDebounce
  ).length;
  state.ops.hygieneActive = operationalClustersForRoom(
    state,
    RoomType.Hygiene,
    CREW_PER_HYGIENE,
    false,
    dt,
    updateDebounce
  ).length;
  state.ops.hydroponicsActive = operationalClustersForRoom(
    state,
    RoomType.Hydroponics,
    CREW_PER_HYDROPONICS,
    false,
    dt,
    updateDebounce
  ).length;
  state.ops.lifeSupportActive = operationalClustersForRoom(
    state,
    RoomType.LifeSupport,
    CREW_PER_LIFE_SUPPORT,
    false,
    dt,
    updateDebounce
  ).length;
  state.ops.loungeActive = operationalClustersForRoom(state, RoomType.Lounge, CREW_PER_LOUNGE, false, dt, updateDebounce).length;
  state.ops.marketActive = operationalClustersForRoom(state, RoomType.Market, CREW_PER_MARKET, false, dt, updateDebounce).length;
  state.ops.cantinaActive = operationalClustersForRoom(state, RoomType.Cantina, 0, false, dt, updateDebounce).length;
  state.ops.observatoryActive = operationalClustersForRoom(state, RoomType.Observatory, 0, false, dt, updateDebounce).length;
  state.ops.logisticsStockActive = operationalClustersForRoom(state, RoomType.LogisticsStock, 0, false, dt, updateDebounce).length;
  state.ops.storageActive = operationalClustersForRoom(state, RoomType.Storage, 0, false, dt, updateDebounce).length;
  state.ops.dormsActive = operationalClustersForRoom(state, RoomType.Dorm, 0, false, dt, updateDebounce).length;
}

function updateMaintenanceDebt(state: StationState, dt: number): void {
  const seenKeys = new Set<string>();
  const minutes = dt / 60;
  const processSystem = (system: MaintenanceSystem): void => {
    const room = maintenanceRoom(system);
    const activeAnchors = new Set(
      operationalClustersForRoom(state, room, system === 'reactor' ? CREW_PER_REACTOR : CREW_PER_LIFE_SUPPORT, false).map(
        clusterAnchor
      )
    );
    for (const cluster of roomClusters(state, room)) {
      const anchor = clusterAnchor(cluster);
      const key = maintenanceKey(system, anchor);
      seenKeys.add(key);
      let debt = state.maintenanceDebts.find((entry) => entry.key === key);
      if (!debt) {
        debt = { key, system, anchorTile: anchor, debt: 0, lastServicedAt: state.now };
        state.maintenanceDebts.push(debt);
      }

      const wasOpen = debt.debt >= MAINTENANCE_DEBT_WARNING;
      let risePerMin = activeAnchors.has(anchor)
        ? system === 'reactor'
          ? MAINTENANCE_REACTOR_RISE_PER_MIN
          : MAINTENANCE_LIFE_SUPPORT_RISE_PER_MIN
        : MAINTENANCE_IDLE_RISE_PER_MIN;
      if (system === 'reactor' && state.metrics.powerDemand > state.metrics.powerSupply) risePerMin += 0.45;
      if (system === 'life-support' && state.metrics.airQuality < 35) risePerMin += 0.55;

      const maintainers = state.crewMembers.filter(
        (crew) =>
          !crew.resting &&
          crew.activeJobId === null &&
          crew.assignedSystem === system &&
          cluster.includes(crew.tileIndex)
      ).length;
      debt.debt = clamp(debt.debt + risePerMin * minutes - maintainers * MAINTENANCE_STAFF_REPAIR_PER_MIN * minutes, 0, 100);
      if (maintainers > 0) debt.lastServicedAt = state.now;
      if (wasOpen && debt.debt < MAINTENANCE_DEBT_WARNING) state.usageTotals.maintenanceJobsResolved += 1;
      // When debt crosses the repair-job threshold and no repair job is already
      // outstanding for this anchor, queue one. Generalist crew pick it up via
      // the same dispatcher as transport jobs.
      if (debt.debt >= REPAIR_JOB_DEBT_THRESHOLD && !hasOpenRepairJobAt(state, anchor, system)) {
        enqueueRepairJob(state, system, anchor);
      }
      // Fire ignition: sustained extreme debt without service ignites the cluster.
      // Track the moment debt first crossed the ignition threshold; if it stays
      // there for FIRE_IGNITE_GRACE_SEC and no fire is active, light it.
      if (debt.debt >= FIRE_IGNITE_DEBT_THRESHOLD) {
        if (!debt.ignitionRiskSince) {
          debt.ignitionRiskSince = state.now;
        } else if (
          state.now - debt.ignitionRiskSince >= FIRE_IGNITE_GRACE_SEC &&
          !state.effects.fires.some((f) => f.anchorTile === anchor)
        ) {
          igniteFire(state, system, anchor);
          debt.ignitionRiskSince = state.now;
        }
      } else {
        debt.ignitionRiskSince = 0;
      }
    }
  };

  processSystem('reactor');
  processSystem('life-support');
  state.maintenanceDebts = state.maintenanceDebts.filter((debt) => seenKeys.has(debt.key));
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

function operationalClustersForRoomSelection(state: StationState, room: RoomType): number[][] {
  switch (room) {
    case RoomType.Cafeteria:
      return operationalClustersForRoom(state, room, CREW_PER_CAFETERIA, false);
    case RoomType.Kitchen:
      return operationalClustersForRoom(state, room, CREW_PER_KITCHEN, false);
    case RoomType.Workshop:
      return operationalClustersForRoom(state, room, CREW_PER_WORKSHOP, false);
    case RoomType.Clinic:
      return operationalClustersForRoom(state, room, CREW_PER_CLINIC, false);
    case RoomType.Brig:
      return operationalClustersForRoom(state, room, CREW_PER_BRIG, false);
    case RoomType.RecHall:
      return operationalClustersForRoom(state, room, CREW_PER_REC_HALL, false);
    case RoomType.Reactor:
      return operationalClustersForRoom(state, room, CREW_PER_REACTOR, false);
    case RoomType.Security:
      return operationalClustersForRoom(state, room, CREW_PER_SECURITY, false);
    case RoomType.Hygiene:
      return operationalClustersForRoom(state, room, CREW_PER_HYGIENE, false);
    case RoomType.Hydroponics:
      return operationalClustersForRoom(state, room, CREW_PER_HYDROPONICS, false);
    case RoomType.LifeSupport:
      return operationalClustersForRoom(state, room, CREW_PER_LIFE_SUPPORT, false);
    case RoomType.Lounge:
      return operationalClustersForRoom(state, room, CREW_PER_LOUNGE, false);
    case RoomType.Market:
      return operationalClustersForRoom(state, room, CREW_PER_MARKET, false);
    case RoomType.Cantina:
    case RoomType.Observatory:
      return operationalClustersForRoom(state, room, 0, false);
    case RoomType.LogisticsStock:
    case RoomType.Storage:
    case RoomType.Dorm:
      return operationalClustersForRoom(state, room, 0, false);
    default:
      return [];
  }
}

function activeRoomClusterTiles(state: StationState, room: RoomType): number[] {
  if (room !== RoomType.None && !isRoomUnlocked(state, room)) return [];
  return operationalClustersForRoomSelection(state, room).flat();
}

function activeRoomTargets(state: StationState, room: RoomType): number[] {
  const targets = activeRoomClusterTiles(state, room);
  if (targets.length === 0 || !roomRequiresServiceNode(room)) return targets;
  const serviceTargets = new Set(collectServiceTargets(state, room));
  return targets.filter((t) => serviceTargets.has(t));
}

function activeModuleTargets(state: StationState, modules: ModuleType[], rooms: RoomType[]): number[] {
  const moduleSet = new Set(modules);
  const activeTilesByRoom = new Map<RoomType, Set<number>>();
  for (const room of rooms) activeTilesByRoom.set(room, new Set(activeRoomClusterTiles(state, room)));
  const out: number[] = [];
  for (const module of state.moduleInstances) {
    if (!moduleSet.has(module.type)) continue;
    const room = state.rooms[module.originTile];
    if (!rooms.includes(room)) continue;
    if (!activeTilesByRoom.get(room)?.has(module.originTile)) continue;
    out.push(module.originTile);
  }
  return out.sort((a, b) => a - b);
}

function staffRequiredForRoom(room: RoomType): number {
  const definition = ROOM_DEFINITIONS[room];
  if (!definition || definition.staffedPostMode === 'none') return 0;
  return 1;
}

function roomRequiresServiceNode(room: RoomType): boolean {
  return moduleTypesForRoomServices(room).length > 0;
}

function clusterHasServiceNode(state: StationState, room: RoomType, cluster: number[]): boolean {
  if (!roomRequiresServiceNode(room)) return true;
  const clusterSet = new Set(cluster);
  return collectServiceTargets(state, room).some((t) => clusterSet.has(t));
}

function summarizeInventoryAtTargets(state: StationState, targets: number[]): RoomInspector['inventory'] {
  ensureItemNodeByTileCache(state);
  const byItem: Partial<Record<ItemType, number>> = {};
  let used = 0;
  let capacity = 0;
  let nodeCount = 0;
  for (const tile of targets) {
    const node = state.derived.itemNodeByTile.get(tile);
    if (!node) continue;
    nodeCount += 1;
    capacity += node.capacity;
    used += totalItemsInNode(node);
    for (const itemType of ITEM_TYPES) {
      const amount = node.items[itemType] ?? 0;
      if (amount <= 0) continue;
      byItem[itemType] = (byItem[itemType] ?? 0) + amount;
    }
  }
  const fillPct = capacity > 0 ? clamp((used / capacity) * 100, 0, 100) : 0;
  return {
    used,
    capacity,
    fillPct,
    nodeCount,
    byItem
  };
}

type RouteJobCounts = { pending: number; assigned: number; inProgress: number };

function countRouteJobs(
  state: StationState,
  itemType: ItemType,
  fromTiles: number[],
  toTiles: number[]
): RouteJobCounts {
  const fromSet = new Set(fromTiles);
  const toSet = new Set(toTiles);
  const counts: RouteJobCounts = { pending: 0, assigned: 0, inProgress: 0 };
  for (const job of state.jobs) {
    if (job.itemType !== itemType) continue;
    if (!fromSet.has(job.fromTile) || !toSet.has(job.toTile)) continue;
    if (job.state === 'pending') counts.pending += 1;
    else if (job.state === 'assigned') counts.assigned += 1;
    else if (job.state === 'in_progress') counts.inProgress += 1;
  }
  return counts;
}

function formatRouteJobCounts(counts: RouteJobCounts): string {
  return `${counts.pending}/${counts.assigned}/${counts.inProgress}`;
}

export function getRoomDiagnosticAt(state: StationState, tileIndex: number): RoomDiagnostic | null {
  if (tileIndex < 0 || tileIndex >= state.rooms.length) return null;
  const room = state.rooms[tileIndex];
  if (room === RoomType.None) return null;
  ensureRoomClustersCache(state);
  ensureActiveRoomAndDiagnosticCaches(state);
  const clusterMeta = state.derived.clusterByTile.get(tileIndex);
  if (!clusterMeta || clusterMeta.room !== room) return null;
  return state.derived.diagnostics.diagnosticsByAnchor.get(clusterMeta.anchor) ?? null;
}

export function getRoomInspectorAt(state: StationState, tileIndex: number): RoomInspector | null {
  if (tileIndex < 0 || tileIndex >= state.rooms.length) return null;
  const room = state.rooms[tileIndex];
  if (room === RoomType.None) return null;
  ensureRoomClustersCache(state);
  const clusterMeta = state.derived.clusterByTile.get(tileIndex);
  if (!clusterMeta || clusterMeta.room !== room) return null;
  const cluster = clusterMeta.cluster;
  const inspection = inspectRoomCluster(state, room, cluster, countStaffAtAssignedTiles(state));
  const clusterSet = new Set(cluster);
  const serviceTargetsInCluster = collectServiceTargets(state, room).filter((t) => clusterSet.has(t));
  const globalReachability = collectServiceNodeReachability(state);
  const unreachableSet = new Set(globalReachability.unreachableNodeTiles);
  const unreachableTiles = serviceTargetsInCluster.filter((tile) => unreachableSet.has(tile));
  const serviceNodeReachability = {
    reachableCount: Math.max(0, serviceTargetsInCluster.length - unreachableTiles.length),
    unreachableCount: unreachableTiles.length,
    unreachableTiles
  };
  const inventory = summarizeInventoryAtTargets(state, serviceTargetsInCluster);

  const warnings = [...inspection.warnings];
  if (serviceNodeReachability.unreachableCount > 0) {
    warnings.push(
      `service nodes unreachable ${serviceNodeReachability.unreachableCount}/${serviceTargetsInCluster.length}`
    );
  }
  const hints: string[] = [];
  const flowHints: string[] = [];
  const growTargets = collectServiceTargets(state, RoomType.Hydroponics);
  const stoveTargets = collectServiceTargets(state, RoomType.Kitchen);
  const servingTargets = collectServingTargets(state);
  const intakeTargets = collectServiceTargets(state, RoomType.LogisticsStock);
  const storageTargets = collectServiceTargets(state, RoomType.Storage);
  const workshopTargets = collectServiceTargets(state, RoomType.Workshop);
  const marketTargets = collectServiceTargets(state, RoomType.Market);
  const hydroToKitchenJobs = countRouteJobs(state, 'rawMeal', growTargets, stoveTargets);
  const kitchenToCafeteriaJobs = countRouteJobs(state, 'meal', stoveTargets, servingTargets);
  const intakeToStorageJobs = countRouteJobs(state, 'rawMaterial', intakeTargets, storageTargets);
  const storageToWorkshopJobs = countRouteJobs(state, 'rawMaterial', storageTargets, workshopTargets);
  const workshopToMarketJobs = countRouteJobs(state, 'tradeGood', workshopTargets, marketTargets);
  const rawMealAtHydro = growTargets.reduce((acc, tile) => acc + itemStockAtNode(state, tile, 'rawMeal'), 0);
  const rawMealAtKitchen = stoveTargets.reduce((acc, tile) => acc + itemStockAtNode(state, tile, 'rawMeal'), 0);
  const mealAtKitchen = stoveTargets.reduce((acc, tile) => acc + itemStockAtNode(state, tile, 'meal'), 0);
  const mealAtServing = servingTargets.reduce((acc, tile) => acc + itemStockAtNode(state, tile, 'meal'), 0);
  const rawMaterialAtIntake = intakeTargets.reduce((acc, tile) => acc + itemStockAtNode(state, tile, 'rawMaterial'), 0);
  const rawMaterialAtStorage = storageTargets.reduce((acc, tile) => acc + itemStockAtNode(state, tile, 'rawMaterial'), 0);
  const rawMaterialAtWorkshop = workshopTargets.reduce((acc, tile) => acc + itemStockAtNode(state, tile, 'rawMaterial'), 0);
  const tradeGoodAtWorkshop = workshopTargets.reduce((acc, tile) => acc + itemStockAtNode(state, tile, 'tradeGood'), 0);
  const tradeGoodAtMarket = marketTargets.reduce((acc, tile) => acc + itemStockAtNode(state, tile, 'tradeGood'), 0);
  if (room === RoomType.Kitchen) {
    hints.push('chain: hydroponics -> kitchen -> cafeteria');
    hints.push(`raw buffer ${state.metrics.kitchenRawBuffer.toFixed(1)} | meal +${state.metrics.kitchenMealProdRate.toFixed(1)}/s`);
    if (state.ops.hydroponicsActive <= 0) hints.push('upstream hydroponics inactive');
    flowHints.push(
      `rawMeal ${rawMealAtKitchen.toFixed(1)} | meal ${mealAtKitchen.toFixed(1)} | to cafeteria jobs ${formatRouteJobCounts(kitchenToCafeteriaJobs)}`
    );
  }
  if (room === RoomType.Workshop) {
    hints.push('chain: workshop -> market');
    hints.push(`trade +${state.metrics.workshopTradeGoodProdRate.toFixed(1)}/s | market stock ${state.metrics.marketTradeGoodStock.toFixed(1)}`);
    if (state.metrics.materials < 20) hints.push('low materials for trade-goods');
    flowHints.push(
      `rawMaterial ${rawMaterialAtWorkshop.toFixed(1)} | tradeGood ${tradeGoodAtWorkshop.toFixed(1)} | to market jobs ${formatRouteJobCounts(workshopToMarketJobs)}`
    );
  }
  if (room === RoomType.Hydroponics) {
    hints.push('chain: hydroponics -> kitchen');
    hints.push(`hydro staffed ${state.metrics.hydroponicsStaffed}/${state.metrics.hydroponicsActiveGrowNodes}`);
    if (state.metrics.rawFoodStock < 5) hints.push('low raw-meal stock');
    flowHints.push(`rawMeal here ${rawMealAtHydro.toFixed(1)} | to kitchen jobs ${formatRouteJobCounts(hydroToKitchenJobs)}`);
  }
  if (room === RoomType.Cafeteria) {
    hints.push('chain: kitchen -> cafeteria');
    hints.push(`meal stock ${state.metrics.mealStock.toFixed(1)} | queue ${state.metrics.cafeteriaQueueingCount}`);
    flowHints.push(
      `serving meal ${mealAtServing.toFixed(1)} | waiting ${state.metrics.cafeteriaQueueingCount} | eating ${state.metrics.cafeteriaEatingCount}`
    );
  }
  if (room === RoomType.Market) {
    hints.push('chain: workshop -> market');
    hints.push(`trade stock ${state.metrics.marketTradeGoodStock.toFixed(1)} | use ${state.metrics.marketTradeGoodUseRate.toFixed(1)}/s`);
    if (state.ops.workshopActive <= 0) hints.push('upstream workshop inactive');
    flowHints.push(
      `tradeGood ${tradeGoodAtMarket.toFixed(1)} | use/s ${state.metrics.marketTradeGoodUseRate.toFixed(1)} | stockouts/min ${state.metrics.marketStockoutsPerMin.toFixed(1)}`
    );
  }
  if (room === RoomType.LifeSupport) {
    hints.push(`air +${state.metrics.lifeSupportActiveAirPerSec.toFixed(1)}/s of +${state.metrics.lifeSupportPotentialAirPerSec.toFixed(1)}/s potential`);
  }
  if (room === RoomType.Reactor || room === RoomType.LifeSupport) {
    const system: MaintenanceSystem = room === RoomType.Reactor ? 'reactor' : 'life-support';
    const debt = maintenanceDebtAtAnchor(state, system, clusterMeta.anchor);
    const value = debt?.debt ?? 0;
    hints.push(`maintenance ${value.toFixed(0)}% | output ${(maintenanceOutputMultiplierFromDebt(value) * 100).toFixed(0)}%`);
    if (value >= MAINTENANCE_DEBT_SEVERE) warnings.push('maintenance critical output degraded');
    else if (value >= MAINTENANCE_DEBT_WARNING) warnings.push('maintenance needed');
  }
  if (room === RoomType.Clinic) {
    hints.push('clinic stabilizes distressed actors');
    hints.push(`distressed ${state.metrics.distressedResidents} | critical ${state.metrics.criticalResidents}`);
  }
  if (room === RoomType.Brig) {
    hints.push('brig improves fight containment time');
    hints.push(`open incidents ${state.metrics.incidentsOpen} | response ${state.metrics.securityResponseAvgSec.toFixed(1)}s`);
  }
  if (room === RoomType.RecHall) {
    hints.push('recreation sink for leisure and resident social recovery');
    hints.push(`rating trend ${state.metrics.stationRatingTrendPerMin.toFixed(2)}/min`);
  }
  if (room === RoomType.LogisticsStock) {
    flowHints.push(
      `rawMaterial ${rawMaterialAtIntake.toFixed(1)} | to storage jobs ${formatRouteJobCounts(intakeToStorageJobs)}`
    );
  }
  if (room === RoomType.Storage) {
    flowHints.push(
      `rawMaterial ${rawMaterialAtStorage.toFixed(1)} | to workshop jobs ${formatRouteJobCounts(storageToWorkshopJobs)}`
    );
  }
  if (room === RoomType.Dorm || room === RoomType.Hygiene) {
    const policy = state.roomHousingPolicies[tileIndex];
    hints.push(`housing policy: ${policy}`);
    if (room === RoomType.Dorm && policy === 'private_resident') {
      const housing = getHousingInspectorAt(state, tileIndex);
      if (housing) {
        hints.push(`private beds ${housing.bedsAssigned}/${housing.bedsTotal} assigned`);
        if (!housing.validPrivateHousing) hints.push('private housing missing resident hygiene path');
      }
    }
  }
  const environment = roomEnvironmentScoreAt(state, tileIndex);
  if (
    (room === RoomType.Cafeteria || room === RoomType.Lounge || room === RoomType.Market || room === RoomType.RecHall) &&
    visitorEnvironmentDiscomfort(environment) > 1.2
  ) {
    warnings.push('visitor-facing room feels too industrial');
  }
  if (
    (room === RoomType.Dorm || room === RoomType.Hygiene) &&
    (residentEnvironmentDiscomfort(environment) > 0.8 || environment.serviceNoise > 0.9)
  ) {
    warnings.push('housing room near noisy service space');
  }
  hints.push(
    `environment status ${environment.visitorStatus.toFixed(1)} | comfort ${environment.residentialComfort.toFixed(1)} | noise ${environment.serviceNoise.toFixed(1)}`
  );
  const lifeSupportCoverage = computeLifeSupportCoverage(state);
  if (lifeSupportCoverage.sourceCount > 0) {
    const avgLifeSupportDistance = averageLifeSupportDistanceForTiles(lifeSupportCoverage, cluster);
    if (avgLifeSupportDistance === null) {
      warnings.push('no life-support coverage');
    } else {
      hints.push(`life-support distance ${avgLifeSupportDistance.toFixed(1)}`);
      if (avgLifeSupportDistance > 18) warnings.push('distant from life support');
    }
  }

  let cafeteriaLoad: RoomInspector['cafeteriaLoad'] | undefined;
  if (room === RoomType.Cafeteria) {
    const tableNodes = collectModuleAnchors(state, ModuleType.Table, RoomType.Cafeteria).filter((t) => clusterSet.has(t)).length;
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
        !v.carryingMeal &&
        ((v.reservedTargetTile !== null && clusterSet.has(v.reservedTargetTile)) ||
          (v.reservedServingTile !== null && clusterSet.has(v.reservedServingTile)) ||
          clusterSet.has(v.tileIndex))
    ).length;
    const eatingVisitors = state.visitors.filter(
      (v) => v.state === VisitorState.Eating && clusterSet.has(v.tileIndex)
    ).length;
    const highPatienceWaiting = state.visitors.filter(
      (v) =>
        (v.state === VisitorState.ToCafeteria || v.state === VisitorState.Queueing) &&
        !v.carryingMeal &&
        v.patience > 22 &&
        ((v.reservedTargetTile !== null && clusterSet.has(v.reservedTargetTile)) ||
          (v.reservedServingTile !== null && clusterSet.has(v.reservedServingTile)) ||
          clusterSet.has(v.tileIndex))
    ).length;
    const effectiveCapacity = Math.max(1, tableNodes * MAX_DINERS_PER_CAF_TILE + Math.floor(queueNodes / 2));
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
  const routePressure = summarizeRoutePressureForTiles(state, cluster);
  if (routePressure.conflictTiles > 0) {
    warnings.push(`route conflicts ${routePressure.conflictTiles} tiles`);
  }
  if (routePressure.reasons.length > 0) {
    hints.push(`route: ${routePressure.reasons.join(' | ')}`);
  }

  return {
    room,
    active: inspection.reasons.length === 0,
    clusterSize: cluster.length,
    minTilesRequired: inspection.minTilesRequired,
    minTilesMet: inspection.minTilesMet,
    doorCount: inspection.doorCount,
    pressurizedPct: inspection.pressurizedPct,
    staffCount: inspection.staffCount,
    requiredStaff: inspection.requiredStaff,
    hasServiceNode: inspection.hasServiceNode,
    serviceNodeCount: inspection.serviceNodeCount,
    reachableServiceNodeCount: serviceNodeReachability.reachableCount,
    unreachableServiceNodeCount: serviceNodeReachability.unreachableCount,
    moduleProgress: inspection.moduleProgress,
    anyOfProgress: inspection.anyOfProgress,
    hasPath: inspection.hasPath,
    reasons: inspection.reasons,
    warnings,
    hints,
    housingPolicy: room === RoomType.Dorm || room === RoomType.Hygiene ? state.roomHousingPolicies[tileIndex] : undefined,
    inventory,
    flowHints,
    environment,
    routePressure,
    cafeteriaLoad
  };
}

function countCafeteriaDemandByTile(state: StationState): Map<number, number> {
  const demand = new Map<number, number>();
  for (const v of state.visitors) {
    if (v.state === VisitorState.Eating) {
      const key = v.tileIndex;
      demand.set(key, (demand.get(key) ?? 0) + 1);
      continue;
    }
    if ((v.state === VisitorState.ToCafeteria || v.state === VisitorState.Queueing) && v.carryingMeal) {
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

function leisureTargetCapacity(state: StationState, tile: number): number {
  switch (state.modules[tile]) {
    case ModuleType.Table:
      return MAX_RESERVATIONS_PER_TABLE;
    case ModuleType.GameStation:
    case ModuleType.RecUnit:
      return 3;
    case ModuleType.Couch:
    case ModuleType.Bench:
    case ModuleType.Telescope:
    case ModuleType.BarCounter:
    case ModuleType.MarketStall:
      return 2;
    case ModuleType.VendingMachine:
    case ModuleType.WaterFountain:
    case ModuleType.Shower:
    case ModuleType.Sink:
      return 1;
    default:
      return 2;
  }
}

function chooseLeastLoadedPath(
  state: StationState,
  start: number,
  targets: number[],
  allowRestricted: boolean,
  intent: PathIntent,
  reservedCounts = countReservedServiceTargets(state)
): { path: number[]; target: number } | null {
  const visitTargets = targets.filter((target, index) => targets.indexOf(target) === index);
  const scan = (
    restricted: boolean,
    current: { path: number[]; target: number; score: number } | null
  ): { path: number[]; target: number; score: number } | null => {
    let best = current;
    for (const target of visitTargets) {
      const path = findPath(state, start, target, { allowRestricted: restricted, intent }, state.pathOccupancyByTile);
      if (!path) continue;
      const reserved = reservedCounts.get(target) ?? 0;
      const occupancy = state.pathOccupancyByTile.get(target) ?? 0;
      const overCapacity = Math.max(0, reserved + occupancy - leisureTargetCapacity(state, target));
      const score = path.length + reserved * 5 + occupancy * 3 + overCapacity * 18;
      if (!best || score < best.score) best = { path, target, score };
    }
    return best;
  };
  let best = scan(allowRestricted, null);
  if (!best && !allowRestricted) best = scan(true, best);
  if (best === null) return null;
  return { path: best.path, target: best.target };
}

function countReservedServingTargets(state: StationState): Map<number, number> {
  const counts = new Map<number, number>();
  for (const v of state.visitors) {
    if (v.reservedServingTile === null) continue;
    counts.set(v.reservedServingTile, (counts.get(v.reservedServingTile) ?? 0) + 1);
  }
  return counts;
}

function countQueuePressureByTile(state: StationState): Map<number, number> {
  const pressure = new Map<number, number>();
  for (const v of state.visitors) {
    if (v.state !== VisitorState.ToCafeteria && v.state !== VisitorState.Queueing) continue;
    if (v.carryingMeal) continue;
    const key =
      !v.carryingMeal && v.reservedServingTile !== null
        ? v.reservedServingTile
        : v.path.length > 0
          ? v.path[v.path.length - 1]
          : v.tileIndex;
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
  start: number,
  intent: PathIntent = 'visitor'
): { path: number[]; target: number | null } {
  const cafeterias = collectCafeteriaTableTargets(state);
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
    const path = findPath(state, start, target, { allowRestricted: false, intent }, state.pathOccupancyByTile);
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

function pickServingStationPath(
  state: StationState,
  start: number,
  intent: PathIntent = 'visitor'
): { path: number[]; target: number | null } {
  const servingTargets = collectServingTargets(state);
  const reservedByTile = countReservedServingTargets(state);
  const queuePressureByTile = countQueuePressureByTile(state);
  let bestPath: number[] | null = null;
  let bestTarget: number | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const target of servingTargets) {
    const path = findPath(state, start, target, { allowRestricted: false, intent }, state.pathOccupancyByTile);
    if (!path) continue;
    const reserved = reservedByTile.get(target) ?? 0;
    const queued = queuePressureByTile.get(target) ?? 0;
    const stock = itemStockAtNode(state, target, 'meal');
    const stockPenalty = stock <= 0.05 ? 14 : stock < 1 ? 5 : 0;
    const score = path.length + reserved * 5 + queued * 6 + stockPenalty;
    if (score < bestScore) {
      bestScore = score;
      bestPath = path;
      bestTarget = target;
    }
  }
  return { path: bestPath ?? [], target: bestTarget };
}

function pickQueueSpotPath(state: StationState, start: number, intent: PathIntent = 'visitor'): number[] {
  const spots = collectQueueTargets(state, RoomType.Cafeteria);
  const queuePressure = countQueuePressureByTile(state);
  let bestPath: number[] | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const spot of spots) {
    const path = findPath(state, start, spot, { allowRestricted: false, intent }, state.pathOccupancyByTile);
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
  // Refresh "no-capability" hint each cycle. Stays empty unless we
  // actually queue a ship below for capability reasons.
  state.metrics.shipsQueuedNoCapabilityCount = 0;
  state.metrics.shipsQueuedNoCapabilityHint = '';
  // Berth-only stations are valid in v0: if a Berth exists, we still
  // schedule arrivals even when there are no legacy Docks.
  const hasAnyBerth = roomClusters(state, RoomType.Berth).length > 0;
  for (let s = 0; s < ships; s++) {
    if (state.docks.length === 0 && !hasAnyBerth) continue;
    const lanesWithDocks = LANES.filter((lane) => state.docks.some((d) => d.lane === lane && d.purpose === 'visitor'));
    // If no docks but berths exist: roll a lane purely from traffic so
    // the approach/depart animation still works (lanes are cosmetic
    // for berth-bound ships in v0).
    if (lanesWithDocks.length === 0 && !hasAnyBerth) continue;
    const lanePool = lanesWithDocks.length > 0 ? lanesWithDocks : LANES;
    const weightedLaneTotal = lanePool.reduce((acc, lane) => acc + state.laneProfiles[lane].trafficVolume, 0);
    let laneRoll = state.rng() * Math.max(0.0001, weightedLaneTotal);
    let lane = lanePool[0];
    for (const candidateLane of lanePool) {
      laneRoll -= state.laneProfiles[candidateLane].trafficVolume;
      if (laneRoll <= 0) {
        lane = candidateLane;
        break;
      }
    }

    const laneDocks = state.docks.filter((d) => d.lane === lane && d.purpose === 'visitor');
    const availableTypes = new Set<ShipType>();
    for (const dock of laneDocks) {
      for (const type of dock.allowedShipTypes) {
        if (!isShipTypeUnlocked(state, type)) continue;
        availableTypes.add(type);
      }
    }
    // Berth-only path: if no legacy dock is on this lane but berths
    // exist anywhere, allow all unlocked ship types as candidates so
    // the cycle still spawns. v1 will give berths their own lane bias.
    if (availableTypes.size === 0 && hasAnyBerth) {
      for (const type of ['tourist', 'trader', 'industrial', 'military', 'colonist'] as ShipType[]) {
        if (isShipTypeUnlocked(state, type)) availableTypes.add(type);
      }
    }
    if (availableTypes.size === 0) {
      // No configured types on this lane; skip attempt without rating penalty.
      continue;
    }

    const weights = state.laneProfiles[lane].weights;
    const candidates = [...availableTypes];
    const candidateWeightTotal = Math.max(
      0.0001,
      candidates.reduce((acc, type) => acc + Math.max(0.0001, weights[type]), 0)
    );
    let cursor = state.rng() * candidateWeightTotal;
    let shipType: ShipType = candidates[0];
    for (const type of candidates) {
      cursor -= Math.max(0.0001, weights[type]);
      if (cursor <= 0) {
        shipType = type;
        break;
      }
    }

    const preferred = preferredShipSize(state.rng);
    const sizeOrder: ShipSize[] =
      preferred === 'large' ? ['large', 'medium', 'small'] : preferred === 'medium' ? ['medium', 'small', 'large'] : ['small', 'medium', 'large'];
    const allBerths = listBerthCandidates(state);
    let sizeWanted: ShipSize | null = null;
    for (const size of sizeOrder) {
      const hasCompatibleDock = laneDocks.some(
        (d) =>
          d.allowedShipTypes.includes(shipType) &&
          d.allowedShipSizes.includes(size) &&
          shipSizeForBay(d.area, size) !== null
      );
      // Dock-migration v0: a berth that fits this size class also
      // counts as "compatible" for size selection — capability-check
      // happens later via `pickBerthForShip`.
      const hasCompatibleBerth = allBerths.some((b) => shipSizeFitsBerth(size, b.size));
      if (hasCompatibleDock || hasCompatibleBerth) {
        sizeWanted = size;
        break;
      }
    }
    if (!sizeWanted) continue;

    // Try berth first (dock-migration v0): if a Berth room with the
    // required capabilities is free and big enough, ships dock there.
    const berth = pickBerthForShip(state, shipType, sizeWanted);
    if (berth) {
      spawnShipAtBerth(state, lane, shipType, berth, undefined, sizeWanted);
      continue;
    }

    const eligibleDocks = laneDocks.filter(
      (d) =>
        d.allowedShipTypes.includes(shipType) &&
        d.allowedShipSizes.includes(sizeWanted) &&
        shipSizeForBay(d.area, sizeWanted) !== null
    );
    if (eligibleDocks.length === 0) {
      // No legacy dock match; surface a capability hint if a berth
      // was the closest fit but lacked the right modules.
      const hint = describeMissingCapabilities(state, shipType, sizeWanted);
      if (hint) {
        state.metrics.shipsQueuedNoCapabilityCount += 1;
        state.metrics.shipsQueuedNoCapabilityHint = hint;
      }
      continue;
    }
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
    if (!isShipTypeUnlocked(state, entry.shipType)) {
      state.dockQueue.splice(i, 1);
      i--;
      continue;
    }
    const eligible = state.docks.filter(
      (d) =>
        d.purpose === 'visitor' &&
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

    if (ship.stage === 'docked' && ship.kind === 'transient') {
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

    if (ship.kind === 'resident_home' && ship.stage === 'depart' && ship.residentIds.length > 0) {
      ship.stage = 'docked';
      ship.stageTime = 0;
    }

    if (ship.stage === 'depart' && ship.stageTime >= SHIP_DEPART_TIME) {
      if (ship.kind === 'transient' && !shipServicesSatisfied(state, ship.shipType)) {
        const weightedPenalty = 0.25 * (SHIP_SERVICE_WEIGHT_BY_TYPE[ship.shipType] ?? 1);
        addVisitorFailurePenalty(state, weightedPenalty, 'shipServicesMissing');
      }
      if (ship.kind === 'transient' && ship.shipType === 'military') {
        const unresolvedIncidents = state.incidents.filter((incident) => isIncidentActive(incident)).length;
        const lowCoverage = state.metrics.securityCoveragePct < 28;
        if (unresolvedIncidents > 0 || lowCoverage) {
          const extraPenalty = 0.18 + unresolvedIncidents * 0.03 + (lowCoverage ? 0.1 : 0);
          addVisitorFailurePenalty(state, extraPenalty, 'shipServicesMissing');
        }
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

function tryBoardVisitorOriginShipAtTile(
  state: StationState,
  visitor: Visitor,
  dockTile: number
): { boarded: boolean; ship: ArrivingShip | null } {
  if (visitor.originShipId !== null) {
    const byId = state.arrivingShips.find((ship) => ship.id === visitor.originShipId) ?? null;
    if (byId && byId.stage === 'docked' && byId.bayTiles.includes(dockTile)) {
      if (byId.kind === 'transient') byId.passengersBoarded++;
      return { boarded: true, ship: byId };
    }
  }
  for (const ship of state.arrivingShips) {
    if (ship.stage !== 'docked') continue;
    if (!ship.bayTiles.includes(dockTile)) continue;
    if (ship.kind === 'transient') ship.passengersBoarded++;
    return { boarded: true, ship };
  }
  return { boarded: false, ship: null };
}

function isVisitorExitTile(state: StationState, tileIndex: number): boolean {
  // Dock-migration v0: legacy ships board from Dock tiles; berth ships
  // board from the Berth room tiles bound into ArrivingShip.bayTiles.
  return state.tiles[tileIndex] === TileType.Dock || state.rooms[tileIndex] === RoomType.Berth;
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
  const manifest = generateShipManifest(state, shipType);
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
    kind: 'transient',
    size,
    bayTiles: [...dock.tiles],
    bayCenterX: centerX,
    bayCenterY: centerY,
    shipType,
    lane,
    originDockId: dockId,
    assignedDockId: dockId,
    assignedBerthAnchor: null,
    queueState: forcedShipId ? 'queued' : 'none',
    stage: 'approach',
    stageTime: 0,
    passengersTotal: Math.max(2, passengersTotal),
    passengersSpawned: 0,
    passengersBoarded: 0,
    minimumBoarding: Math.max(2, Math.round(Math.max(2, passengersTotal) * 0.25)),
    spawnCarry: 0,
    dockedAt: 0,
    residentIds: [],
    manifestDemand: manifest.demand,
    manifestMix: manifest.mix
  });
  state.usageTotals.shipsByType[shipType] += 1;
}

/**
 * Dock-migration v0: spawn a ship bound to a Berth room (no legacy
 * Dock tile cluster involved). The ship's bayCenter is the centroid
 * of the berth interior. `assignedDockId` stays null; the renderer
 * detects berth-binding via `assignedBerthAnchor`.
 */
function spawnShipAtBerth(
  state: StationState,
  lane: SpaceLane,
  shipType: ShipType,
  berth: BerthCandidate,
  forcedShipId?: number,
  forcedSize?: ShipSize
): void {
  // Pick the largest size that still fits this berth's class.
  const wanted = forcedSize ?? preferredShipSize(state.rng);
  let size: ShipSize = wanted;
  if (!shipSizeFitsBerth(size, berth.size)) {
    if (shipSizeFitsBerth('medium', berth.size)) size = 'medium';
    else size = 'small';
  }
  const passengersTotal = Math.round(SHIP_BASE_PASSENGERS[size] * (0.78 + state.rng() * 0.7));
  const manifest = generateShipManifest(state, shipType);
  const shipId = forcedShipId ?? state.shipSpawnCounter++;
  const center = berth.tiles
    .map((tile) => fromIndex(tile, state.width))
    .reduce(
      (acc, pos) => ({ x: acc.x + pos.x, y: acc.y + pos.y }),
      { x: 0, y: 0 }
    );
  const centerX = center.x / Math.max(1, berth.tiles.length) + 0.5;
  const centerY = center.y / Math.max(1, berth.tiles.length) + 0.5;
  state.arrivingShips.push({
    id: shipId,
    kind: 'transient',
    size,
    bayTiles: [...berth.tiles],
    bayCenterX: centerX,
    bayCenterY: centerY,
    shipType,
    lane,
    originDockId: null,
    assignedDockId: null,
    assignedBerthAnchor: berth.anchorTile,
    queueState: forcedShipId ? 'queued' : 'none',
    stage: 'approach',
    stageTime: 0,
    passengersTotal: Math.max(2, passengersTotal),
    passengersSpawned: 0,
    passengersBoarded: 0,
    minimumBoarding: Math.max(2, Math.round(Math.max(2, passengersTotal) * 0.25)),
    spawnCarry: 0,
    dockedAt: 0,
    residentIds: [],
    manifestDemand: manifest.demand,
    manifestMix: manifest.mix
  });
  state.usageTotals.shipsByType[shipType] += 1;
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
  const dorms = activeRoomTargets(state, RoomType.Dorm).filter((idx) =>
    state.roomHousingPolicies[idx] === 'crew' || state.roomHousingPolicies[idx] === 'visitor'
  );
  const restricted = dorms.filter((idx) => state.zones[idx] === ZoneType.Restricted);
  return restricted.length > 0 ? restricted : dorms;
}

function preferredHygieneTargets(state: StationState): number[] {
  return activeRoomTargets(state, RoomType.Hygiene).filter((idx) =>
    state.roomHousingPolicies[idx] === 'crew' || state.roomHousingPolicies[idx] === 'visitor'
  );
}

function crewLeisureTargets(state: StationState): number[] {
  return [
    ...activeModuleTargets(state, [ModuleType.Couch, ModuleType.GameStation, ModuleType.Bench], [RoomType.Lounge]),
    ...activeModuleTargets(state, [ModuleType.RecUnit, ModuleType.Bench], [RoomType.RecHall]),
    ...activeModuleTargets(state, [ModuleType.MarketStall, ModuleType.Bench], [RoomType.Market]),
    ...activeModuleTargets(state, [ModuleType.Table, ModuleType.Bench, ModuleType.VendingMachine], [RoomType.Cafeteria]),
    ...activeModuleTargets(state, [ModuleType.BarCounter, ModuleType.Bench], [RoomType.Cantina]),
    ...activeModuleTargets(state, [ModuleType.Telescope, ModuleType.Bench], [RoomType.Observatory])
  ];
}

// Targets for a thirst stop: prefer Cantina (faster relief) but fall back to
// any tile with a WaterFountain module so a station without a bar still works.
function crewDrinkTargets(state: StationState): number[] {
  const cantinas = activeModuleTargets(state, [ModuleType.BarCounter], [RoomType.Cantina]);
  const fountainTiles: number[] = [];
  for (const m of state.moduleInstances) {
    if (m.type !== ModuleType.WaterFountain) continue;
    if (!isWalkable(state.tiles[m.originTile])) continue;
    fountainTiles.push(m.originTile);
  }
  return [...cantinas, ...fountainTiles];
}

function clearCrewLeisure(crew: CrewMember): void {
  crew.leisure = false;
  crew.leisureSessionActive = false;
  crew.leisureUntil = 0;
}

function residentDormTargets(state: StationState): number[] {
  return activeRoomTargets(state, RoomType.Dorm).filter((idx) =>
    state.roomHousingPolicies[idx] === 'resident' || state.roomHousingPolicies[idx] === 'private_resident'
  );
}

function residentHygieneTargets(state: StationState): number[] {
  return activeRoomTargets(state, RoomType.Hygiene).filter((idx) =>
    state.roomHousingPolicies[idx] === 'resident' || state.roomHousingPolicies[idx] === 'private_resident'
  );
}

function rebuildItemNodes(state: StationState): void {
  const previousByTile = new Map<number, (typeof state.itemNodes)[number]>();
  for (const node of state.itemNodes) previousByTile.set(node.tileIndex, node);

  const next: typeof state.itemNodes = [];
  for (const module of state.moduleInstances) {
    const capacity = MODULE_DEFINITIONS[module.type]?.itemNodeCapacity ?? 0;
    if (capacity <= 0) continue;
    const prev = previousByTile.get(module.originTile);
    next.push({
      tileIndex: module.originTile,
      capacity,
      items: prev?.items ?? {}
    });
  }

  state.itemNodes = next.sort((a, b) => a.tileIndex - b.tileIndex);
  state.derived.cacheVersions.itemNodeByTileModuleVersion = -1;
}

function itemNodeAt(state: StationState, tileIndex: number): StationState['itemNodes'][number] | undefined {
  ensureItemNodeByTileCache(state);
  return state.derived.itemNodeByTile.get(tileIndex);
}

function totalItemsInNode(node: StationState['itemNodes'][number]): number {
  return ITEM_TYPES.reduce((acc, itemType) => acc + (node.items[itemType] ?? 0), 0);
}

function itemStockAtNode(
  state: StationState,
  tileIndex: number,
  itemType: 'rawMeal' | 'meal' | 'rawMaterial' | 'tradeGood' | 'body'
): number {
  const node = itemNodeAt(state, tileIndex);
  return node ? node.items[itemType] ?? 0 : 0;
}

function addItemStockAtNode(
  state: StationState,
  tileIndex: number,
  itemType: 'rawMeal' | 'meal' | 'rawMaterial' | 'tradeGood' | 'body',
  amount: number
): number {
  if (amount <= 0) return 0;
  const node = itemNodeAt(state, tileIndex);
  if (!node) return 0;
  const current = node.items[itemType] ?? 0;
  const totalItems = totalItemsInNode(node);
  const freeCapacity = Math.max(0, node.capacity - totalItems);
  const added = Math.min(amount, freeCapacity);
  if (added <= 0) return 0;
  node.items[itemType] = current + added;
  return added;
}

function takeItemStockAtNode(
  state: StationState,
  tileIndex: number,
  itemType: 'rawMeal' | 'meal' | 'rawMaterial' | 'tradeGood' | 'body',
  amount: number
): number {
  if (amount <= 0) return 0;
  const node = itemNodeAt(state, tileIndex);
  if (!node) return 0;
  const current = node.items[itemType] ?? 0;
  const taken = Math.min(current, amount);
  if (taken <= 0) return 0;
  node.items[itemType] = current - taken;
  return taken;
}

function sumItemStockForRoom(
  state: StationState,
  room: RoomType,
  itemType: 'rawMeal' | 'meal' | 'rawMaterial' | 'tradeGood' | 'body'
): number {
  const targets = collectServiceTargets(state, room);
  let total = 0;
  for (const tileIndex of targets) {
    total += itemStockAtNode(state, tileIndex, itemType);
  }
  return total;
}

function consumeTradeGoodsFromMarket(state: StationState, amount: number): number {
  if (amount <= 0) return 0;
  const targets = collectServiceTargets(state, RoomType.Market);
  if (targets.length === 0) return 0;
  let remaining = amount;
  let consumed = 0;
  for (const tileIndex of targets) {
    if (remaining <= 0) break;
    const taken = takeItemStockAtNode(state, tileIndex, 'tradeGood', remaining);
    consumed += taken;
    remaining -= taken;
  }
  return consumed;
}

function isWorkshopToMarketTradeDelivery(state: StationState, job: StationState['jobs'][number]): boolean {
  return (
    job.itemType === 'tradeGood' &&
    state.rooms[job.fromTile] === RoomType.Workshop &&
    state.rooms[job.toTile] === RoomType.Market
  );
}

function logisticsJobPriority(state: StationState, job: StationState['jobs'][number]): number {
  if (isWorkshopToMarketTradeDelivery(state, job)) {
    return state.metrics.tradeCyclesCompletedLifetime < 1 ? 120 : 65;
  }
  if (job.itemType === 'meal') return 55;
  if (job.itemType === 'rawMeal') return 45;
  if (job.itemType === 'rawMaterial') return 35;
  if (job.itemType === 'tradeGood') return 30;
  return 20;
}

function itemNodeFreeCapacity(state: StationState, tileIndex: number): number {
  const node = itemNodeAt(state, tileIndex);
  if (!node) return 0;
  const used = totalItemsInNode(node);
  return Math.max(0, node.capacity - used);
}

function openJobAmountToTile(
  state: StationState,
  tileIndex: number,
  itemType: 'rawMeal' | 'meal' | 'rawMaterial' | 'tradeGood' | 'body'
): number {
  let amount = 0;
  for (const job of state.jobs) {
    if (job.toTile !== tileIndex || job.itemType !== itemType) continue;
    if (job.state !== 'pending' && job.state !== 'assigned' && job.state !== 'in_progress') continue;
    amount += Math.max(0, job.amount - job.pickedUpAmount);
    if (job.state === 'in_progress') amount += job.pickedUpAmount;
  }
  return amount;
}

function openJobAmountFromTile(
  state: StationState,
  tileIndex: number,
  itemType: 'rawMeal' | 'meal' | 'rawMaterial' | 'tradeGood' | 'body'
): number {
  let amount = 0;
  for (const job of state.jobs) {
    if (job.fromTile !== tileIndex || job.itemType !== itemType) continue;
    if (job.state !== 'pending' && job.state !== 'assigned' && job.state !== 'in_progress') continue;
    amount += Math.max(0, job.amount - job.pickedUpAmount);
  }
  return amount;
}

function itemNodeUnreservedCapacity(
  state: StationState,
  tileIndex: number,
  itemType: 'rawMeal' | 'meal' | 'rawMaterial' | 'tradeGood' | 'body'
): number {
  return Math.max(0, itemNodeFreeCapacity(state, tileIndex) - openJobAmountToTile(state, tileIndex, itemType));
}

function totalItemCapacityAtTargets(state: StationState, tileIndices: number[]): number {
  let total = 0;
  for (const tileIndex of tileIndices) {
    total += itemNodeFreeCapacity(state, tileIndex);
  }
  return total;
}

function addItemAcrossTargets(
  state: StationState,
  tileIndices: number[],
  itemType: 'rawMeal' | 'meal' | 'rawMaterial' | 'tradeGood' | 'body',
  amount: number,
  fromTile?: number
): number {
  if (amount <= 0 || tileIndices.length === 0) return 0;
  const source = fromTile ?? state.core.serviceTile;
  const sourcePos = fromIndex(source, state.width);
  const sorted = [...tileIndices].sort((a, b) => {
    const pa = fromIndex(a, state.width);
    const pb = fromIndex(b, state.width);
    const da = Math.abs(pa.x - sourcePos.x) + Math.abs(pa.y - sourcePos.y);
    const db = Math.abs(pb.x - sourcePos.x) + Math.abs(pb.y - sourcePos.y);
    return da - db;
  });
  let remaining = amount;
  let addedTotal = 0;
  for (const tileIndex of sorted) {
    if (remaining <= 0) break;
    const added = addItemStockAtNode(state, tileIndex, itemType, remaining);
    if (added <= 0) continue;
    remaining -= added;
    addedTotal += added;
  }
  return addedTotal;
}

function takeItemAcrossTargets(
  state: StationState,
  tileIndices: number[],
  itemType: 'rawMeal' | 'meal' | 'rawMaterial' | 'tradeGood' | 'body',
  amount: number
): number {
  if (amount <= 0 || tileIndices.length === 0) return 0;
  let remaining = amount;
  let removed = 0;
  for (const tileIndex of tileIndices) {
    if (remaining <= 0) break;
    const taken = takeItemStockAtNode(state, tileIndex, itemType, remaining);
    if (taken <= 0) continue;
    remaining -= taken;
    removed += taken;
  }
  return removed;
}

function materialInventoryTiles(state: StationState): number[] {
  const logisticsTargets = collectServiceTargets(state, RoomType.LogisticsStock);
  const storageTargets = collectServiceTargets(state, RoomType.Storage);
  return [...new Set([...storageTargets, ...logisticsTargets])];
}

function materialInventoryTotal(state: StationState): number {
  return materialInventoryTiles(state).reduce((acc, tile) => acc + itemStockAtNode(state, tile, 'rawMaterial'), 0);
}

function consumeConstructionMaterials(state: StationState, amount: number): boolean {
  if (amount <= 0) return true;
  const inventoryTiles = materialInventoryTiles(state);
  if (inventoryTiles.length === 0) {
    if (state.legacyMaterialStock < amount) return false;
    state.legacyMaterialStock = Math.max(0, state.legacyMaterialStock - amount);
    state.metrics.materials = state.legacyMaterialStock;
    return true;
  }
  const inventoryAvailable = materialInventoryTotal(state);
  const totalAvailable = inventoryAvailable + state.legacyMaterialStock;
  if (totalAvailable < amount) return false;
  const consumeFromInventory = Math.min(amount, inventoryAvailable);
  if (consumeFromInventory > 0) {
    const removed = takeItemAcrossTargets(state, inventoryTiles, 'rawMaterial', consumeFromInventory);
    if (removed < consumeFromInventory) return false;
  }
  const consumeFromLegacy = amount - consumeFromInventory;
  if (consumeFromLegacy > 0) {
    state.legacyMaterialStock = Math.max(0, state.legacyMaterialStock - consumeFromLegacy);
  }
  state.metrics.materials = Math.max(0, state.legacyMaterialStock + materialInventoryTotal(state));
  return true;
}

function enqueueTransportJob(
  state: StationState,
  type: 'pickup' | 'deliver',
  itemType: 'rawMeal' | 'meal' | 'rawMaterial' | 'tradeGood' | 'body',
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

// Repair job: any generalist crew picks it up, walks to the system anchor, and
// stands there ticking down debt. Distinct from the existing "maintainer staffed
// at the post" reduction — that only applies to crew with assignedSystem set.
// This loop lets idle crew help dig out a debt spike without needing a specialty.
const REPAIR_JOB_DEBT_THRESHOLD = 45;
const REPAIR_JOB_DEBT_TARGET = 32;
const REPAIR_JOB_RATE_PER_SEC = 8;

// Fire model: when reactor or life-support debt sustains above the ignition
// threshold, the system ignites. Fires grow in intensity, spread to neighbors,
// damage modules, and block the burning tile. Suppressed by FireExtinguisher
// modules (passive radius decay) and by crew running an 'extinguish' job
// (faster manual decay).
const FIRE_IGNITE_DEBT_THRESHOLD = 92;
const FIRE_IGNITE_GRACE_SEC = 18;
const FIRE_INTENSITY_GROWTH_PER_SEC = 4.5;
const FIRE_INTENSITY_MAX = 100;
const FIRE_SPREAD_THRESHOLD = 55;
const FIRE_SPREAD_CHANCE_PER_SEC = 0.32;
const FIRE_BLOCK_INTENSITY = 30;
const FIRE_BLOCK_DURATION_SEC = 1.5;
const FIRE_MODULE_DESTROY_INTENSITY = 80;
const FIRE_EXTINGUISHER_RADIUS = 6;
const FIRE_EXTINGUISHER_RATE_PER_SEC = 9;
const FIRE_EXTINGUISH_JOB_RATE_PER_SEC = 18;
const FIRE_EXTINGUISH_JOB_TARGET = 100;
function enqueueRepairJob(
  state: StationState,
  system: MaintenanceSystem,
  anchorTile: number
): void {
  state.jobs.push({
    id: state.jobSpawnCounter++,
    type: 'repair',
    itemType: 'rawMaterial',
    amount: REPAIR_JOB_DEBT_TARGET,
    fromTile: anchorTile,
    toTile: anchorTile,
    assignedCrewId: null,
    createdAt: state.now,
    expiresAt: state.now + JOB_TTL_SEC,
    state: 'pending',
    pickedUpAmount: 0,
    completedAt: null,
    lastProgressAt: state.now,
    stallReason: 'none',
    stalledSince: undefined,
    repairSystem: system,
    repairProgress: 0
  });
  state.metrics.createdJobs += 1;
}

function hasOpenRepairJobAt(state: StationState, anchorTile: number, system: MaintenanceSystem): boolean {
  for (const job of state.jobs) {
    if (job.type !== 'repair') continue;
    if (job.state === 'done' || job.state === 'expired') continue;
    if (job.fromTile === anchorTile && job.repairSystem === system) return true;
  }
  return false;
}

function igniteFire(state: StationState, system: MaintenanceSystem, anchorTile: number): void {
  state.effects.fires.push({
    anchorTile,
    system,
    intensity: 35,
    ignitedAt: state.now,
    lastTick: state.now
  });
  // Cancel any open repair job at this anchor — repair through fire isn't safe.
  for (const job of state.jobs) {
    if (job.type !== 'repair') continue;
    if (job.fromTile !== anchorTile) continue;
    if (job.state === 'done' || job.state === 'expired') continue;
    job.expiredFromState = job.state;
    job.state = 'expired';
    if (job.assignedCrewId !== null) {
      const crew = state.crewMembers.find((c) => c.id === job.assignedCrewId);
      if (crew) {
        crew.activeJobId = null;
      }
    }
  }
  // Open an extinguish job for the burning tile so generalist crew respond.
  enqueueExtinguishJob(state, anchorTile);
}

function enqueueExtinguishJob(state: StationState, fireTile: number): void {
  for (const job of state.jobs) {
    if (job.type !== 'extinguish') continue;
    if (job.state === 'done' || job.state === 'expired') continue;
    if (job.fromTile === fireTile) return;
  }
  state.jobs.push({
    id: state.jobSpawnCounter++,
    type: 'extinguish',
    itemType: 'rawMaterial',
    amount: FIRE_EXTINGUISH_JOB_TARGET,
    fromTile: fireTile,
    toTile: fireTile,
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

// Per-tick fire update: extinguisher modules within radius reduce intensity,
// fires grow if unsuppressed, hot fires spread to walkable neighbors, and tiles
// with intensity above the block threshold become impassable. When intensity
// hits zero, the fire is removed and the maintenance debt for that cluster is
// reduced (the fire is what burned away the debt — repair was just deferred).
function updateFires(state: StationState, dt: number): void {
  if (state.effects.fires.length === 0) return;

  // Cache extinguisher tiles for radius check.
  const extinguisherTiles: number[] = [];
  for (const m of state.moduleInstances) {
    if (m.type === ModuleType.FireExtinguisher) extinguisherTiles.push(m.originTile);
  }

  const survivors: typeof state.effects.fires = [];
  for (const fire of state.effects.fires) {
    const fx = fire.anchorTile % state.width;
    const fy = Math.floor(fire.anchorTile / state.width);

    // Passive extinguisher decay.
    let decay = 0;
    for (const tile of extinguisherTiles) {
      const ex = tile % state.width;
      const ey = Math.floor(tile / state.width);
      const d = Math.abs(ex - fx) + Math.abs(ey - fy);
      if (d <= FIRE_EXTINGUISHER_RADIUS) decay += FIRE_EXTINGUISHER_RATE_PER_SEC;
    }

    // Active extinguish-job decay (crew currently at this tile working on it).
    let activeJobDecay = 0;
    for (const job of state.jobs) {
      if (job.type !== 'extinguish') continue;
      if (job.fromTile !== fire.anchorTile) continue;
      if (job.state !== 'in_progress') continue;
      activeJobDecay += FIRE_EXTINGUISH_JOB_RATE_PER_SEC;
    }

    const growth = decay + activeJobDecay > 0 ? 0 : FIRE_INTENSITY_GROWTH_PER_SEC;
    fire.intensity = clamp(fire.intensity + (growth - decay - activeJobDecay) * dt, 0, FIRE_INTENSITY_MAX);
    fire.lastTick = state.now;

    if (fire.intensity <= 0.5) {
      // Fire out — close out the extinguish job and reset the debt entry.
      for (const job of state.jobs) {
        if (job.type !== 'extinguish') continue;
        if (job.fromTile !== fire.anchorTile) continue;
        if (job.state === 'done' || job.state === 'expired') continue;
        job.state = 'done';
        job.completedAt = state.now;
      }
      const debt = state.maintenanceDebts.find(
        (d) => d.key === maintenanceKey(fire.system, fire.anchorTile)
      );
      if (debt) {
        debt.debt = clamp(debt.debt - 50, 0, 100);
        debt.ignitionRiskSince = 0;
      }
      continue;
    }

    // Block tile passage while burning hot.
    if (fire.intensity >= FIRE_BLOCK_INTENSITY) {
      state.effects.blockedUntilByTile.set(fire.anchorTile, state.now + FIRE_BLOCK_DURATION_SEC);
    }

    // Module damage: at high intensity, modules on burning tile take damage and
    // are removed when fully damaged. v0: instant remove at threshold.
    if (fire.intensity >= FIRE_MODULE_DESTROY_INTENSITY) {
      for (let i = state.moduleInstances.length - 1; i >= 0; i--) {
        const m = state.moduleInstances[i];
        if (m.originTile === fire.anchorTile && m.type !== ModuleType.FireExtinguisher) {
          state.moduleInstances.splice(i, 1);
          bumpRoomVersion(state);
        }
      }
    }

    // Spread to walkable neighbors when intensity is high enough.
    if (fire.intensity >= FIRE_SPREAD_THRESHOLD && state.rng() < FIRE_SPREAD_CHANCE_PER_SEC * dt) {
      const deltas: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [dx, dy] of deltas) {
        const nx = fx + dx;
        const ny = fy + dy;
        if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) continue;
        const next = ny * state.width + nx;
        if (!isWalkable(state.tiles[next])) continue;
        if (state.effects.fires.some((f) => f.anchorTile === next)) continue;
        if (survivors.some((f) => f.anchorTile === next)) continue;
        // Only spread once per tick per fire (first valid neighbor).
        survivors.push({
          anchorTile: next,
          system: fire.system,
          intensity: 28,
          ignitedAt: state.now,
          lastTick: state.now
        });
        enqueueExtinguishJob(state, next);
        break;
      }
    }

    survivors.push(fire);
  }
  state.effects.fires = survivors;
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

// Burst-fill transport job dispatch: within a single tick, spawn jobs up to the open-job
// cap, distributing across (source, destination) pairs by tracking in-tick reservations.
// Each iteration picks the source with the most unreserved supply (tiebreak: shortest
// path), so multiple hydroponics tiles drain in parallel instead of one pair monopolizing.
function dispatchTransportJobs(
  state: StationState,
  itemType: 'rawMeal' | 'meal',
  sources: number[],
  destinations: number[],
  config: {
    cap: number;
    openCount: number;
    targetStock: number;
    nearAmount: number;
    farAmount: number;
    nearDistance: number;
  }
): void {
  if (sources.length === 0 || destinations.length === 0) return;
  if (config.openCount >= config.cap) return;

  // Path graph is stable within a single tick; cache findPath results across iterations.
  const pathLenCache = new Map<number, number | null>();
  const getPathLen = (from: number, to: number): number | null => {
    const key = from * state.tiles.length + to;
    if (pathLenCache.has(key)) return pathLenCache.get(key) ?? null;
    const path = findPath(state, from, to, { allowRestricted: false, intent: 'logistics' }, state.pathOccupancyByTile);
    const len = path ? path.length : null;
    pathLenCache.set(key, len);
    return len;
  };

  const tickFromReserved = new Map<number, number>();
  const tickToReserved = new Map<number, number>();
  let openCount = config.openCount;

  while (openCount < config.cap) {
    let best: { from: number; to: number; dist: number; supply: number } | null = null;
    for (const from of sources) {
      const supply =
        itemStockAtNode(state, from, itemType) -
        openJobAmountFromTile(state, from, itemType) -
        (tickFromReserved.get(from) ?? 0);
      if (supply <= 0.3) continue;
      for (const to of destinations) {
        const tickTo = tickToReserved.get(to) ?? 0;
        const projectedStock =
          itemStockAtNode(state, to, itemType) + openJobAmountToTile(state, to, itemType) + tickTo;
        if (projectedStock >= config.targetStock - 0.3) continue;
        if (itemNodeUnreservedCapacity(state, to, itemType) - tickTo <= 0.3) continue;
        const dist = getPathLen(from, to);
        if (dist === null) continue;
        const better =
          !best ||
          supply > best.supply + 0.5 ||
          (Math.abs(supply - best.supply) <= 0.5 && dist < best.dist);
        if (better) best = { from, to, dist, supply };
      }
    }
    if (!best) break;

    const tickFrom = tickFromReserved.get(best.from) ?? 0;
    const tickTo = tickToReserved.get(best.to) ?? 0;
    const available = Math.max(
      0,
      itemStockAtNode(state, best.from, itemType) - openJobAmountFromTile(state, best.from, itemType) - tickFrom
    );
    const targetNeed = Math.max(
      0,
      config.targetStock - itemStockAtNode(state, best.to, itemType) - openJobAmountToTile(state, best.to, itemType) - tickTo
    );
    const targetSpace = Math.max(0, itemNodeUnreservedCapacity(state, best.to, itemType) - tickTo);
    const baseAmount = best.dist <= config.nearDistance ? config.nearAmount : config.farAmount;
    const amount = Math.min(baseAmount, available, targetNeed, targetSpace);
    if (amount <= 0.05) break;

    enqueueTransportJob(state, 'deliver', itemType, amount, best.from, best.to);
    tickFromReserved.set(best.from, tickFrom + amount);
    tickToReserved.set(best.to, tickTo + amount);
    openCount++;
  }
}

function createFoodTransportJobs(state: StationState): void {
  const growTargets = collectServiceTargets(state, RoomType.Hydroponics);
  const stoveTargets = collectServiceTargets(state, RoomType.Kitchen);
  const servingTargets = collectServingTargets(state);
  if (growTargets.length === 0 || stoveTargets.length === 0) return;

  const openJobs = state.jobs.filter((j) => j.state === 'pending' || j.state === 'assigned' || j.state === 'in_progress');
  const openRawMealJobs = openJobs.filter((j) => j.itemType === 'rawMeal');
  const openMealJobs = openJobs.filter((j) => j.itemType === 'meal');

  dispatchTransportJobs(state, 'rawMeal', growTargets, stoveTargets, {
    cap: MAX_PENDING_FOOD_JOBS,
    openCount: openRawMealJobs.length,
    targetStock: 8,
    nearAmount: 1.4,
    farAmount: 1.0,
    nearDistance: 8,
  });

  if (servingTargets.length > 0) {
    dispatchTransportJobs(state, 'meal', stoveTargets, servingTargets, {
      cap: MAX_PENDING_FOOD_JOBS,
      openCount: openMealJobs.length,
      targetStock: 10,
      nearAmount: 1.2,
      farAmount: 0.9,
      nearDistance: 8,
    });
  }
}

function createRawMaterialTransportJobs(state: StationState): void {
  const intakeTargets = collectServiceTargets(state, RoomType.LogisticsStock);
  const storageTargets = collectServiceTargets(state, RoomType.Storage);
  const workshopTargets = collectServiceTargets(state, RoomType.Workshop);

  const openMaterialJobs = state.jobs.filter(
    (j) =>
      (j.state === 'pending' || j.state === 'assigned' || j.state === 'in_progress') &&
      j.itemType === 'rawMaterial'
  );
  if (openMaterialJobs.length >= MAX_PENDING_TRADE_JOBS) return;

  if (intakeTargets.length > 0 && storageTargets.length > 0) {
    const intakeSources = intakeTargets.filter((tile) => itemStockAtNode(state, tile, 'rawMaterial') > 0.3);
    const storageDestinations = storageTargets.filter((tile) => itemNodeUnreservedCapacity(state, tile, 'rawMaterial') > 0.3);
    if (intakeSources.length > 0 && storageDestinations.length > 0) {
      const from = intakeSources[randomInt(0, intakeSources.length - 1, state.rng)];
      const to = storageDestinations[randomInt(0, storageDestinations.length - 1, state.rng)];
      const amount = Math.min(1.2, itemStockAtNode(state, from, 'rawMaterial'), itemNodeUnreservedCapacity(state, to, 'rawMaterial'));
      if (amount > 0.05) enqueueTransportJob(state, 'deliver', 'rawMaterial', amount, from, to);
    }
  }

  if (storageTargets.length > 0 && workshopTargets.length > 0) {
    const storageSources = storageTargets.filter((tile) => itemStockAtNode(state, tile, 'rawMaterial') > 0.3);
    const workshopDestinations = workshopTargets.filter(
      (tile) => itemStockAtNode(state, tile, 'rawMaterial') + openJobAmountToTile(state, tile, 'rawMaterial') < 8
    );
    if (storageSources.length > 0 && workshopDestinations.length > 0) {
      const from = storageSources[randomInt(0, storageSources.length - 1, state.rng)];
      const to = workshopDestinations[randomInt(0, workshopDestinations.length - 1, state.rng)];
      const rawTargetSpace = Math.max(
        0,
        8 - itemStockAtNode(state, to, 'rawMaterial') - openJobAmountToTile(state, to, 'rawMaterial')
      );
      const amount = Math.min(1.0, itemStockAtNode(state, from, 'rawMaterial'), itemNodeUnreservedCapacity(state, to, 'rawMaterial'), rawTargetSpace);
      if (amount > 0.05) enqueueTransportJob(state, 'deliver', 'rawMaterial', amount, from, to);
    }
  }
}

function createTradeGoodTransportJobs(state: StationState): void {
  const workshopTargets = collectServiceTargets(state, RoomType.Workshop);
  const marketTargets = collectServiceTargets(state, RoomType.Market);
  if (workshopTargets.length === 0 || marketTargets.length === 0) return;
  if (state.ops.workshopActive <= 0 || state.ops.marketActive <= 0) return;
  const liveMarketStock = sumItemStockForRoom(state, RoomType.Market, 'tradeGood');
  const incomingMarketStock = marketTargets.reduce((acc, tile) => acc + openJobAmountToTile(state, tile, 'tradeGood'), 0);
  const plannedMarketStock = liveMarketStock + incomingMarketStock;
  if (plannedMarketStock >= MARKET_TRADE_GOOD_TARGET_STOCK) return;
  const openTradeJobs = state.jobs.filter(
    (j) =>
      (j.state === 'pending' || j.state === 'assigned' || j.state === 'in_progress') &&
      j.itemType === 'tradeGood'
  );
  if (openTradeJobs.length >= MAX_PENDING_TRADE_JOBS) return;

  const fromCandidates = workshopTargets
    .map((tile) => ({ tile, stock: itemStockAtNode(state, tile, 'tradeGood') - openJobAmountFromTile(state, tile, 'tradeGood') }))
    .filter((entry) => entry.stock > 0.25)
    .sort((a, b) => b.stock - a.stock);
  if (fromCandidates.length === 0) return;

  const fromTile = fromCandidates[0].tile;
  let bestTo = marketTargets[0];
  let bestDist = Number.POSITIVE_INFINITY;
  for (const to of marketTargets) {
    const path = findPath(state, fromTile, to, { allowRestricted: false, intent: 'logistics' }, state.pathOccupancyByTile);
    if (!path) continue;
    if (path.length < bestDist) {
      bestDist = path.length;
      bestTo = to;
    }
  }
  if (!Number.isFinite(bestDist)) return;
  const targetNeed = Math.max(0, MARKET_TRADE_GOOD_TARGET_STOCK - plannedMarketStock);
  const targetSpace = itemNodeUnreservedCapacity(state, bestTo, 'tradeGood');
  const amount = Math.min(bestDist <= 8 ? 1.2 : 0.9, fromCandidates[0].stock, targetNeed, targetSpace);
  if (amount <= 0.05) return;
  enqueueTransportJob(state, 'deliver', 'tradeGood', amount, fromTile, bestTo);
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
    let bestPath: number[] | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const job of pendingJobs) {
      if (job.state !== 'pending') continue;
      const path = findPath(state, crew.tileIndex, job.fromTile, { allowRestricted: true, intent: 'logistics' }, state.pathOccupancyByTile);
      if (!path) continue;
      const age = Math.max(0, state.now - job.createdAt);
      const score = logisticsJobPriority(state, job) * 100 + Math.min(30, age / 6) - path.length;
      if (score > bestScore) {
        bestScore = score;
        bestJob = job;
        bestPath = path;
      }
    }
    if (!bestJob || !bestPath) continue;

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
    crew.cleaning = false;
    crew.cleanSessionActive = false;
    crew.toileting = false;
    crew.toiletSessionActive = false;
    clearCrewLeisure(crew);
    setCrewPath(state, crew, bestPath);
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
    job.expiredFromState = job.state;
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

function createJobStatusCounts(): JobStatusCounts {
  return { pending: 0, assigned: 0, expired: 0, done: 0 };
}

function createJobCountsByItem(): Record<ItemType, JobStatusCounts> {
  return {
    rawMeal: createJobStatusCounts(),
    meal: createJobStatusCounts(),
    rawMaterial: createJobStatusCounts(),
    tradeGood: createJobStatusCounts(),
    body: createJobStatusCounts()
  };
}

function createJobCountsByType(): Record<JobType, JobStatusCounts> {
  return {
    pickup: createJobStatusCounts(),
    deliver: createJobStatusCounts(),
    repair: createJobStatusCounts(),
    extinguish: createJobStatusCounts()
  };
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
  let expired = 0;
  const ages: number[] = [];
  const backlogByType = new Map<string, number>();
  const countsByItem = createJobCountsByItem();
  const countsByType = createJobCountsByType();
  const expiredByContext: Record<JobExpiryContext, number> = {
    queued: 0,
    assigned: 0,
    carrying: 0,
    unknown: 0
  };
  for (const job of state.jobs) {
    if (job.state === 'pending') {
      pending++;
      countsByItem[job.itemType].pending += 1;
      countsByType[job.type].pending += 1;
      backlogByType.set(job.type, (backlogByType.get(job.type) ?? 0) + 1);
      ages.push(Math.max(0, state.now - job.createdAt));
    } else if (job.state === 'assigned' || job.state === 'in_progress') {
      assigned++;
      countsByItem[job.itemType].assigned += 1;
      countsByType[job.type].assigned += 1;
      ages.push(Math.max(0, state.now - job.createdAt));
    } else if (job.state === 'done') {
      done++;
      countsByItem[job.itemType].done += 1;
      countsByType[job.type].done += 1;
    } else if (job.state === 'expired') {
      expired++;
      countsByItem[job.itemType].expired += 1;
      countsByType[job.type].expired += 1;
      const context: JobExpiryContext =
        job.expiredFromState === 'pending'
          ? 'queued'
          : job.expiredFromState === 'assigned'
            ? 'assigned'
            : job.expiredFromState === 'in_progress'
              ? 'carrying'
              : 'unknown';
      expiredByContext[context] += 1;
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
  const expiredByReason: Record<JobStallReason, number> = {
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
    } else if (job.state === 'expired') {
      expiredByReason[job.stallReason ?? 'none']++;
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
  state.metrics.expiredJobs = expired;
  state.metrics.completedJobs = done;
  state.metrics.avgJobAgeSec = ages.length > 0 ? ages.reduce((a, b) => a + b, 0) / ages.length : 0;
  state.metrics.topBacklogType = topBacklogType;
  state.metrics.oldestPendingJobAgeSec = oldestPendingAgeSec;
  state.metrics.stalledJobs = stalledByReason.stalled_path_blocked +
    stalledByReason.stalled_unreachable_source +
    stalledByReason.stalled_unreachable_dropoff +
    stalledByReason.stalled_no_supply;
  state.metrics.stalledJobsByReason = stalledByReason;
  state.metrics.expiredJobsByReason = expiredByReason;
  state.metrics.expiredJobsByContext = expiredByContext;
  state.metrics.jobCountsByItem = countsByItem;
  state.metrics.jobCountsByType = countsByType;
}

function releaseCrewJobsOnDeath(state: StationState, crewId: number): void {
  for (const job of state.jobs) {
    if (job.assignedCrewId !== crewId) continue;
    if (job.state !== 'assigned' && job.state !== 'in_progress') continue;
    job.assignedCrewId = null;
    job.state = 'pending';
    job.pickedUpAmount = 0;
    job.expiresAt = Math.max(job.expiresAt, state.now + JOB_TTL_SEC);
    job.lastProgressAt = state.now;
    markJobStall(state, job, 'none');
  }
}

function purgeDeadCrewFromAir(state: StationState, dt: number, occupancyByTile: Map<number, number>): void {
  if (state.crewMembers.length <= 0) return;
  const keep: CrewMember[] = [];
  for (const crew of state.crewMembers) {
    const exposure = applyAirExposure(state, crew, airQualityAt(state, crew.tileIndex), dt);
    if (exposure.died) {
      releaseCrewJobsOnDeath(state, crew.id);
      registerBodyDeathAtTile(state, crew.tileIndex, occupancyByTile);
      continue;
    }
    keep.push(crew);
  }
  if (keep.length !== state.crewMembers.length) {
    state.crewMembers = keep;
    state.crew.total = Math.min(state.crew.total, keep.length);
  }
}

function updateCrewLogic(state: StationState, dt: number, occupancyByTile: Map<number, number>): void {
  purgeDeadCrewFromAir(state, dt, occupancyByTile);
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
    const publicInterference = crew.activeJobId !== null ? routePublicInterference(crew.lastRouteExposure) : 0;
    if (publicInterference > 0) state.usageTotals.crewPublicInterference += publicInterference * dt;
    crew.hygiene = clamp(crew.hygiene - dt * (0.2 + publicInterference * CREW_PUBLIC_CROWD_DRAIN * 0.45), 0, 100);
    if (!crew.toileting) {
      crew.bladder = clamp(crew.bladder - dt * CREW_BLADDER_DECAY_PER_SEC, 0, 100);
    }
    if (!crew.drinking) {
      crew.thirst = clamp(crew.thirst - dt * CREW_THIRST_DECAY_PER_SEC, 0, 100);
    }
    if (crew.activeJobId !== null) {
      if (crew.resting) {
        crew.resting = false;
        crew.restSessionActive = false;
        crew.restCooldownUntil = state.now + CREW_REST_COOLDOWN_SEC;
        currentResting = Math.max(0, currentResting - 1);
        state.metrics.crewRestingNow = currentResting;
      }
      if (crew.cleaning) {
        crew.cleaning = false;
        crew.cleanSessionActive = false;
      }
      if (crew.toileting) {
        crew.toileting = false;
        crew.toiletSessionActive = false;
      }
      if (crew.drinking) {
        crew.drinking = false;
        crew.drinkSessionActive = false;
      }
      clearCrewLeisure(crew);
    }
    if (airEmergency) {
      if (crew.cleaning) {
        crew.cleaning = false;
        crew.cleanSessionActive = false;
        setCrewPath(state, crew, []);
      }
      if (crew.toileting) {
        crew.toileting = false;
        crew.toiletSessionActive = false;
        setCrewPath(state, crew, []);
      }
      if (crew.drinking) {
        crew.drinking = false;
        crew.drinkSessionActive = false;
        setCrewPath(state, crew, []);
      }
      if (crew.leisure) {
        clearCrewLeisure(crew);
        setCrewPath(state, crew, []);
      }
      const canInterruptRest = criticalAirEmergency || state.now >= crew.restLockUntil;
      if (crew.resting && crew.energy > 35 && canInterruptRest) {
        crew.resting = false;
        crew.restSessionActive = false;
        crew.taskLockUntil = state.now + CREW_TASK_LOCK_SEC;
        crew.assignmentHoldUntil = 0;
        setCrewPath(state, crew, []);
        currentResting = Math.max(0, currentResting - 1);
        state.metrics.crewRestingNow = currentResting;
      }
    }
    if (!crew.resting) {
      crew.energy = clamp(crew.energy - dt * (0.42 + publicInterference * CREW_PUBLIC_CROWD_DRAIN), 0, 100);
      const needsCriticalRest = crew.energy < CREW_REST_CRITICAL_ENERGY_THRESHOLD;
      const shiftMatches = crew.shiftBucket === shiftBucketNow;
      const belowRestCap = currentResting < state.metrics.crewRestCap;
      const canRestByShift = needsCriticalRest || (belowRestCap && shiftMatches);
      const cooldownReady = state.now >= crew.restCooldownUntil && state.now >= crew.taskLockUntil;
      const shouldRest =
        crew.activeJobId === null &&
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
        setCrewPath(state, crew, []);
        crew.idleReason = 'idle_resting';
        crew.cleaning = false;
        crew.toileting = false;
        crew.toiletSessionActive = false;
        clearCrewLeisure(crew);
        currentResting += 1;
        state.metrics.crewRestingNow = currentResting;
      } else if (crew.activeJobId === null && crew.bladder < CREW_BLADDER_TOILET_THRESHOLD) {
        // Bladder is short-cycle: toilet interrupts cleaning/leisure but not active jobs or rest.
        const hygieneTargets = preferredHygieneTargets(state);
        if (hygieneTargets.length > 0 && !airEmergency) {
          crew.toileting = true;
          crew.toiletSessionActive = false;
          crew.role = 'idle';
          crew.targetTile = null;
          crew.lastSystem = null;
          crew.assignedSystem = null;
          crew.assignmentHoldUntil = 0;
          setCrewPath(state, crew, []);
          clearCrewLeisure(crew);
          if (crew.cleaning) {
            crew.cleaning = false;
            crew.cleanSessionActive = false;
          }
          if (crew.drinking) {
            crew.drinking = false;
            crew.drinkSessionActive = false;
          }
        }
      } else if (crew.activeJobId === null && crew.thirst < CREW_THIRST_DRINK_THRESHOLD) {
        // Thirst: route to Cantina or WaterFountain. Drink is brief and yields
        // to bladder/cleaning if those needs spike during the trip.
        const drinkTargets = crewDrinkTargets(state);
        if (drinkTargets.length > 0 && !airEmergency) {
          crew.drinking = true;
          crew.drinkSessionActive = false;
          crew.role = 'idle';
          crew.targetTile = null;
          crew.lastSystem = null;
          crew.assignedSystem = null;
          crew.assignmentHoldUntil = 0;
          setCrewPath(state, crew, []);
          clearCrewLeisure(crew);
        }
      } else if (crew.activeJobId === null && crew.hygiene < CREW_CLEAN_HYGIENE_THRESHOLD) {
        const hygieneTargets = preferredHygieneTargets(state);
        if (hygieneTargets.length > 0 && !airEmergency) {
          crew.cleaning = true;
          crew.cleanSessionActive = false;
          crew.role = 'idle';
          crew.targetTile = null;
          crew.lastSystem = null;
          crew.assignedSystem = null;
          crew.assignmentHoldUntil = 0;
          setCrewPath(state, crew, []);
          clearCrewLeisure(crew);
        }
      } else if (
        crew.activeJobId === null &&
        crew.role === 'idle' &&
        !crew.cleaning &&
        !crew.leisure &&
        !airEmergency &&
        crew.energy >= 58 &&
        crew.hygiene >= 58 &&
        state.now >= crew.retargetAt
      ) {
        const targets = crewLeisureTargets(state);
        const shouldSeekLeisure =
          targets.length > 0 &&
          (state.metrics.morale < 72 || state.metrics.crewIdleAvailable > 2 || state.rng() < 0.28);
        if (shouldSeekLeisure) {
          crew.leisure = true;
          crew.leisureSessionActive = false;
          crew.role = 'idle';
          crew.targetTile = null;
          crew.lastSystem = null;
          crew.assignedSystem = null;
          crew.assignmentHoldUntil = 0;
          setCrewPath(state, crew, []);
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
          setCrewPath(state, crew, chooseNearestPath(state, crew.tileIndex, hygieneTargets, false, 'crew') ?? []);
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
        setCrewPath(state, crew, []);
      }
      continue;
    }

    // Toilet: short-cycle Hygiene visit driven by bladder. Prefers a Hygiene tile
    // that isn't already occupied by another toileter (capacity guard) so visitors
    // and crew don't all queue at the same stall. Relief is fast (~5-7 sec to top up).
    if (crew.toileting && !crew.resting) {
      const hygieneTargets = preferredHygieneTargets(state);
      if (hygieneTargets.length === 0) {
        crew.toileting = false;
        crew.toiletSessionActive = false;
      } else if (state.rooms[crew.tileIndex] !== RoomType.Hygiene) {
        if (crew.path.length === 0) {
          // Filter targets by current toileter occupancy so multiple crew distribute
          // across stalls. Falls back to any Hygiene tile if all are crowded.
          const uncrowded = hygieneTargets.filter((tile) => {
            const occupants = state.crewMembers.reduce((n, other) => {
              if (other.id === crew.id || !other.toileting) return n;
              const target = other.path.length > 0 ? other.path[other.path.length - 1] : other.tileIndex;
              return target === tile ? n + 1 : n;
            }, 0);
            return occupants < CREW_TOILET_MAX_PER_TILE;
          });
          const choice = uncrowded.length > 0 ? uncrowded : hygieneTargets;
          setCrewPath(state, crew, chooseNearestPath(state, crew.tileIndex, choice, false, 'crew') ?? []);
        }
        const moveResult = moveCrew(crew);
        if (moveResult === 'blocked') {
          crew.blockedTicks = Math.min(crew.blockedTicks + 1, 9999);
          crew.idleReason = 'idle_no_path';
        } else if (moveResult === 'moved') {
          crew.blockedTicks = 0;
        }
      } else {
        if (!crew.toiletSessionActive) {
          crew.toiletSessionActive = true;
          state.usageTotals.hygiene += 0.4;
        }
        crew.bladder = clamp(crew.bladder + dt * CREW_BLADDER_RELIEF_PER_SEC, 0, 100);
      }
      if (crew.bladder >= CREW_BLADDER_EXIT_THRESHOLD) {
        crew.toileting = false;
        crew.toiletSessionActive = false;
        setCrewPath(state, crew, []);
      }
      continue;
    }

    // Drinking: route to a Cantina (BarCounter or any tile in the room) or a
    // WaterFountain. Cantinas refill faster (drinks > tap water).
    if (crew.drinking && !crew.resting) {
      const drinkTargets = crewDrinkTargets(state);
      if (drinkTargets.length === 0) {
        crew.drinking = false;
        crew.drinkSessionActive = false;
      } else {
        const atFountain = state.modules[crew.tileIndex] === ModuleType.WaterFountain;
        const atCantina = state.rooms[crew.tileIndex] === RoomType.Cantina;
        if (!atFountain && !atCantina) {
          if (crew.path.length === 0) {
            setCrewPath(state, crew, chooseLeastLoadedPath(state, crew.tileIndex, drinkTargets, false, 'crew')?.path ?? []);
          }
          const moveResult = moveCrew(crew);
          if (moveResult === 'blocked') {
            crew.blockedTicks = Math.min(crew.blockedTicks + 1, 9999);
            crew.idleReason = 'idle_no_path';
          } else if (moveResult === 'moved') {
            crew.blockedTicks = 0;
          }
        } else {
          if (!crew.drinkSessionActive) {
            crew.drinkSessionActive = true;
          }
          const reliefRate = atCantina ? CREW_THIRST_RELIEF_CANTINA_PER_SEC : CREW_THIRST_RELIEF_FOUNTAIN_PER_SEC;
          crew.thirst = clamp(crew.thirst + dt * reliefRate, 0, 100);
        }
        if (crew.thirst >= CREW_THIRST_EXIT_THRESHOLD) {
          crew.drinking = false;
          crew.drinkSessionActive = false;
          setCrewPath(state, crew, []);
        }
      }
      continue;
    }

    if (crew.resting) {
      crew.idleReason = 'idle_resting';
      const dormTargets = preferredDormTargets(state);
      if (dormTargets.length > 0 && state.rooms[crew.tileIndex] !== RoomType.Dorm) {
        if (crew.path.length === 0) {
          setCrewPath(state, crew, chooseCrewRestPath(state, crew, dormTargets, occupancyByTile) ?? []);
          if (crew.path.length === 0) {
            crew.idleReason = 'idle_no_path';
            crew.blockedTicks = Math.min(crew.blockedTicks + 1, 9999);
          }
        }
        const moveResult = moveCrew(crew);
        if (moveResult === 'blocked') {
          crew.blockedTicks = Math.min(crew.blockedTicks + 1, 9999);
          crew.idleReason = 'idle_no_path';
          if (crew.blockedTicks >= BLOCKED_REPATH_TICKS) {
            setCrewPath(state, crew, []);
          }
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
        setCrewPath(state, crew, []);
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

    if (crew.leisure && !crew.resting && !crew.cleaning && crew.activeJobId === null) {
      const targets = crewLeisureTargets(state);
      if (targets.length === 0) {
        clearCrewLeisure(crew);
      } else if (!targets.includes(crew.tileIndex)) {
        if (crew.path.length === 0) {
          setCrewPath(state, crew, chooseLeastLoadedPath(state, crew.tileIndex, targets, false, 'crew')?.path ?? []);
        }
        const moveResult = moveCrew(crew);
        if (moveResult === 'blocked') {
          crew.blockedTicks = Math.min(crew.blockedTicks + 1, 9999);
          crew.idleReason = 'idle_no_path';
          if (crew.blockedTicks >= BLOCKED_REPATH_TICKS) setCrewPath(state, crew, []);
        } else if (moveResult === 'moved') {
          crew.blockedTicks = 0;
        }
      } else {
        if (!crew.leisureSessionActive) {
          crew.leisureSessionActive = true;
          crew.leisureUntil = state.now + 5 + state.rng() * 5;
        }
        crew.energy = clamp(crew.energy + dt * 3.5, 0, 100);
        crew.hygiene = clamp(crew.hygiene - dt * 0.08, 0, 100);
        crew.idleReason = 'idle_available';
        if (state.now >= crew.leisureUntil || crew.energy >= 96) {
          clearCrewLeisure(crew);
          setCrewPath(state, crew, []);
          crew.retargetAt = state.now + 18 + state.rng() * 18;
        }
      }
      continue;
    }

    if (crew.activeJobId !== null) {
      const job = state.jobs.find((j) => j.id === crew.activeJobId);
      if (!job || job.state === 'done' || job.state === 'expired') {
        crew.activeJobId = null;
        crew.carryingItemType = null;
        crew.carryingAmount = 0;
        setCrewPath(state, crew, []);
      } else if (job.type === 'extinguish') {
        // Extinguish: walk to the burning tile (or an adjacent walkable tile if
        // the burning tile itself is blocked by intensity), stand and reduce
        // intensity. Decay rate handled in updateFires when state==='in_progress'.
        const fireTile = job.fromTile;
        const fire = state.effects.fires.find((f) => f.anchorTile === fireTile);
        if (!fire) {
          // Fire's already out — close the job.
          job.state = 'done';
          job.completedAt = state.now;
          crew.activeJobId = null;
          setCrewPath(state, crew, []);
          continue;
        }
        // Stand on an adjacent walkable tile, since the burning tile is blocked.
        let approachTile = fireTile;
        const fx = fireTile % state.width;
        const fy = Math.floor(fireTile / state.width);
        if (fire.intensity >= FIRE_BLOCK_INTENSITY) {
          const deltas: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
          let bestNeighbor = -1;
          let bestDist = Number.POSITIVE_INFINITY;
          for (const [dx, dy] of deltas) {
            const nx = fx + dx;
            const ny = fy + dy;
            if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) continue;
            const next = ny * state.width + nx;
            if (!isWalkable(state.tiles[next])) continue;
            if (state.effects.fires.some((f) => f.anchorTile === next && f.intensity >= FIRE_BLOCK_INTENSITY)) continue;
            const cx = next % state.width;
            const cy = Math.floor(next / state.width);
            const distFromCrew = Math.abs(cx - (crew.tileIndex % state.width)) + Math.abs(cy - Math.floor(crew.tileIndex / state.width));
            if (distFromCrew < bestDist) {
              bestDist = distFromCrew;
              bestNeighbor = next;
            }
          }
          if (bestNeighbor >= 0) approachTile = bestNeighbor;
        }
        if (crew.tileIndex !== approachTile) {
          if (crew.path.length === 0) {
            setCrewPath(
              state,
              crew,
              findPath(state, crew.tileIndex, approachTile, { allowRestricted: true, intent: 'crew' }, state.pathOccupancyByTile) ?? []
            );
            if (crew.path.length === 0) {
              markJobStall(state, job, 'stalled_unreachable_source');
            }
          }
          const moveResult = moveCrew(crew);
          if (moveResult === 'moved') {
            job.lastProgressAt = state.now;
            markJobStall(state, job, 'none');
            crew.blockedTicks = 0;
          } else if (moveResult === 'blocked') {
            crew.blockedTicks = Math.min(crew.blockedTicks + 1, 9999);
            markJobStall(state, job, 'stalled_path_blocked');
          }
        } else {
          if (job.state !== 'in_progress') job.state = 'in_progress';
          job.lastProgressAt = state.now;
          // updateFires() applies the actual decay this tick because the job is
          // in_progress with this fromTile. Crew just stays put.
        }
        continue;
      } else if (job.type === 'repair') {
        // Repair: walk to the system anchor tile and stand still while ticking
        // down the cluster's debt. No item carry. When the job's repair target
        // amount is reached or debt hits zero, the job completes.
        const anchorTile = job.fromTile;
        if (crew.tileIndex !== anchorTile) {
          if (crew.path.length === 0) {
            setCrewPath(
              state,
              crew,
              findPath(state, crew.tileIndex, anchorTile, { allowRestricted: true, intent: 'crew' }, state.pathOccupancyByTile) ?? []
            );
            if (crew.path.length === 0) {
              markJobStall(state, job, 'stalled_unreachable_source');
            }
          }
          const moveResult = moveCrew(crew);
          if (moveResult === 'moved') {
            job.lastProgressAt = state.now;
            markJobStall(state, job, 'none');
            crew.blockedTicks = 0;
          } else if (moveResult === 'blocked') {
            crew.blockedTicks = Math.min(crew.blockedTicks + 1, 9999);
            markJobStall(state, job, 'stalled_path_blocked');
          }
        } else {
          // At anchor: tick debt down. Job becomes 'in_progress' on first tick.
          if (job.state !== 'in_progress') {
            job.state = 'in_progress';
          }
          const system = job.repairSystem;
          if (system) {
            const debtEntry = state.maintenanceDebts.find(
              (d) => d.key === maintenanceKey(system, anchorTile)
            );
            if (debtEntry) {
              const reduction = Math.min(debtEntry.debt, REPAIR_JOB_RATE_PER_SEC * dt);
              debtEntry.debt = Math.max(0, debtEntry.debt - reduction);
              debtEntry.lastServicedAt = state.now;
              job.repairProgress = (job.repairProgress ?? 0) + reduction;
              job.lastProgressAt = state.now;
              if ((job.repairProgress ?? 0) >= job.amount || debtEntry.debt <= 0.5) {
                job.state = 'done';
                job.completedAt = state.now;
                markJobStall(state, job, 'none');
                crew.activeJobId = null;
                setCrewPath(state, crew, []);
                state.usageTotals.maintenanceJobsResolved += 1;
              }
            } else {
              // Debt cluster vanished (room destroyed?). Cancel.
              job.state = 'done';
              job.completedAt = state.now;
              crew.activeJobId = null;
              setCrewPath(state, crew, []);
            }
          }
        }
        continue;
      } else {
        const targetTile = crew.carryingAmount > 0 ? job.toTile : job.fromTile;
        if (crew.tileIndex === targetTile) {
          if (crew.carryingAmount <= 0) {
            const availableSupply = itemStockAtNode(state, job.fromTile, job.itemType);
            const pickup = Math.min(job.amount, availableSupply);
            if (pickup <= 0) {
              markJobStall(state, job, 'stalled_no_supply');
              job.state = 'pending';
              job.assignedCrewId = null;
              job.expiresAt = state.now + JOB_TTL_SEC;
              job.lastProgressAt = state.now;
              crew.activeJobId = null;
              setCrewPath(state, crew, []);
            } else {
              takeItemStockAtNode(state, job.fromTile, job.itemType, pickup);
              crew.carryingItemType = job.itemType;
              crew.carryingAmount = pickup;
              job.pickedUpAmount = pickup;
              job.state = 'in_progress';
              job.lastProgressAt = state.now;
              markJobStall(state, job, 'none');
              setCrewPath(state, crew, []);
            }
          } else {
            const delivered = addItemStockAtNode(state, job.toTile, job.itemType, crew.carryingAmount);
            if (delivered <= 0) {
              markJobStall(state, job, 'stalled_unreachable_dropoff');
              continue;
            }
            if (isWorkshopToMarketTradeDelivery(state, job)) {
              state.metrics.tradeCyclesCompletedLifetime += delivered;
            }
            crew.carryingAmount = Math.max(0, crew.carryingAmount - delivered);
            if (crew.carryingAmount > 0) {
              markJobStall(state, job, 'stalled_unreachable_dropoff');
              continue;
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
            setCrewPath(state, crew, []);
          }
        } else {
          if (crew.path.length === 0) {
            setCrewPath(
              state,
              crew,
              findPath(state, crew.tileIndex, targetTile, { allowRestricted: true, intent: 'logistics' }, state.pathOccupancyByTile) ?? []
            );
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
              setCrewPath(
                state,
                crew,
                findPath(state, crew.tileIndex, targetTile, { allowRestricted: true, intent: 'logistics' }, state.pathOccupancyByTile) ?? []
              );
            }
          }
        }
        continue;
      }
    }

    if (crew.targetTile !== null && crew.path.length === 0 && crew.tileIndex !== crew.targetTile) {
      const path = findPath(state, crew.tileIndex, crew.targetTile, { allowRestricted: true, intent: 'crew' }, state.pathOccupancyByTile);
      setCrewPath(state, crew, path ?? []);
      if (crew.path.length === 0) {
        crew.idleReason = 'idle_no_path';
        crew.blockedTicks = Math.min(crew.blockedTicks + 1, 9999);
      }
    }

    if (crew.targetTile === crew.tileIndex && crew.role !== 'idle') {
      setCrewPath(state, crew, []);
      continue;
    }

    if (crew.role === 'idle' && crew.path.length === 0 && idleTargets.length > 0 && state.now >= crew.retargetAt) {
      const next = idleTargets[randomInt(0, idleTargets.length - 1, state.rng)];
      setCrewPath(
        state,
        crew,
        findPath(state, crew.tileIndex, next, { allowRestricted: false, intent: 'crew' }, state.pathOccupancyByTile) ?? []
      );
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
  if (visitor.carryingMeal) {
    const nextTable = pickLeastLoadedCafeteriaPath(state, visitor.tileIndex);
    setVisitorPath(state, visitor, nextTable.path);
    visitor.reservedTargetTile = nextTable.target;
    visitor.state = VisitorState.ToCafeteria;
    return;
  }
  visitor.reservedTargetTile = null;
  const nextServing = pickServingStationPath(state, visitor.tileIndex);
  setVisitorPath(state, visitor, nextServing.path);
  visitor.reservedServingTile = nextServing.target;
  visitor.state = VisitorState.ToCafeteria;
  if (visitor.path.length > 0 || (nextServing.target !== null && visitor.tileIndex === nextServing.target)) {
    return;
  }
  const queuePath = pickQueueSpotPath(state, visitor.tileIndex);
  setVisitorPath(state, visitor, queuePath);
  visitor.state = VisitorState.Queueing;
}

function repathVisitorToReservedCafeteriaTarget(state: StationState, visitor: Visitor): boolean {
  if (!visitor.carryingMeal && visitor.reservedServingTile !== null && visitor.tileIndex !== visitor.reservedServingTile) {
    const path = findPath(
      state,
      visitor.tileIndex,
      visitor.reservedServingTile,
      { allowRestricted: false, intent: 'visitor' },
      state.pathOccupancyByTile
    );
    if (path) {
      setVisitorPath(state, visitor, path);
      return true;
    }
  }

  if (visitor.carryingMeal && visitor.reservedTargetTile !== null && visitor.tileIndex !== visitor.reservedTargetTile) {
    const path = findPath(
      state,
      visitor.tileIndex,
      visitor.reservedTargetTile,
      { allowRestricted: false, intent: 'visitor' },
      state.pathOccupancyByTile
    );
    if (path) {
      setVisitorPath(state, visitor, path);
      return true;
    }
  }

  return false;
}

function visitorDockTargets(state: StationState, visitor: Visitor): number[] {
  if (visitor.originShipId !== null) {
    const ship = state.arrivingShips.find((s) => s.id === visitor.originShipId) ?? null;
    if (ship && ship.stage === 'docked' && ship.bayTiles.length > 0) {
      return ship.bayTiles;
    }
  }
  const visitorDockTiles = state.docks
    .filter((dock) => dock.purpose === 'visitor')
    .flatMap((dock) => dock.tiles);
  if (visitorDockTiles.length > 0) return visitorDockTiles;
  const tileDocks = collectTiles(state, TileType.Dock);
  if (tileDocks.length > 0) return tileDocks;
  // Berth-only stations: visitors arrived via a Berth ship and there are
  // no Dock tiles or visitor-purpose docks. Fall back to the Berth-room
  // tiles so visitors have a valid exit path.
  return collectRooms(state, RoomType.Berth);
}

function assignPathToDock(state: StationState, visitor: Visitor): void {
  const docks = visitorDockTargets(state, visitor);
  visitor.reservedTargetTile = null;
  visitor.reservedServingTile = null;
  visitor.carryingMeal = false;
  setVisitorPath(state, visitor, chooseNearestPath(state, visitor.tileIndex, docks, false) ?? []);
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

function applyVisitorWalkDissatisfaction(
  state: StationState,
  tileIndex: number,
  exposure?: RouteExposure
): void {
  const walk = exposure ? exposure.distance : visitorWalkDistanceFromDock(state, tileIndex);
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

function applyVisitorCompletedRouteExperience(state: StationState, visitor: Visitor): void {
  const exposure = visitor.lastRouteExposure;
  applyVisitorWalkDissatisfaction(state, visitor.tileIndex, exposure);
  const discomfort = routeExposureDiscomfort(exposure);
  if (discomfort > 0) {
    const penalty = Math.min(0.28, discomfort * VISITOR_ROUTE_EXPOSURE_RATING_PENALTY);
    serviceFailureRatingPenalty(state, penalty, 'ratingFromRouteExposure');
    state.usageTotals.visitorServiceExposurePenalty += penalty;
    if (discomfort >= 5) addVisitorPatience(state, visitor, discomfort * 0.018, false);
  }
  const environment = roomEnvironmentScoreAt(state, visitor.tileIndex);
  const environmentDiscomfort = visitorEnvironmentDiscomfort(environment);
  if (environmentDiscomfort > 0) {
    const penalty = Math.min(0.24, environmentDiscomfort * VISITOR_ENVIRONMENT_RATING_PENALTY);
    serviceFailureRatingPenalty(state, penalty, 'ratingFromEnvironment');
    state.usageTotals.visitorEnvironmentPenalty += penalty;
    if (environmentDiscomfort >= 2.5) addVisitorPatience(state, visitor, environmentDiscomfort * 0.012, false);
  }
  visitor.lastRouteExposure = undefined;
}

function applyResidentCompletedRouteExperience(state: StationState, resident: Resident): void {
  const exposure = resident.lastRouteExposure;
  const discomfort = routeExposureDiscomfort(exposure);
  if (discomfort > 0) {
    const stress = Math.min(3.2, discomfort * RESIDENT_BAD_ROUTE_STRESS);
    resident.stress = clamp(resident.stress + stress, 0, 120);
    resident.satisfaction = clamp(resident.satisfaction - stress * 0.75, 0, 100);
    resident.safety = clamp(resident.safety - (exposure?.securityTiles ?? 0) * 0.12 - (exposure?.cargoTiles ?? 0) * 0.05, 0, 100);
    state.usageTotals.residentBadRouteStress += stress;
  }
  const environment = roomEnvironmentScoreAt(state, resident.tileIndex);
  const environmentDiscomfort = residentEnvironmentDiscomfort(environment);
  if (environmentDiscomfort > 0) {
    const stress = Math.min(2.8, environmentDiscomfort * RESIDENT_ENVIRONMENT_STRESS);
    resident.stress = clamp(resident.stress + stress, 0, 120);
    resident.satisfaction = clamp(resident.satisfaction - stress * 0.65, 0, 100);
    state.usageTotals.residentEnvironmentStress += stress;
  }
  resident.lastRouteExposure = undefined;
}

function registerVisitorServiceFailure(state: StationState, amount: number): void {
  state.usageTotals.visitorServiceFailures += amount;
  addVisitorFailurePenalty(state, Math.min(0.12, amount * 0.03), 'noLeisurePath');
}

function visitorVisitAge(state: StationState, visitor: Visitor): number {
  return Math.max(0, state.now - visitor.spawnedAt);
}

function shouldSeekVisitorHygiene(state: StationState, visitor: Visitor): boolean {
  if (visitor.archetype === 'rusher') return false;
  if (visitor.hygieneStopUsed) return false;
  if (visitorVisitAge(state, visitor) < 24) return false;
  const chanceByArchetype: Record<VisitorArchetype, number> = {
    diner: 0.08,
    shopper: 0.12,
    lounger: 0.16,
    rusher: 0
  };
  return state.rng() < chanceByArchetype[visitor.archetype];
}

function assignPathToVisitorHygiene(state: StationState, visitor: Visitor): boolean {
  const hygieneTargets = preferredHygieneTargets(state);
  if (hygieneTargets.length === 0) return false;
  const reserved = countReservedServiceTargets(state);
  let best: { path: number[]; target: number; score: number } | null = null;
  for (const target of hygieneTargets) {
    const path = findPath(state, visitor.tileIndex, target, { allowRestricted: false, intent: 'visitor' }, state.pathOccupancyByTile);
    if (!path) continue;
    const occupancy = state.pathOccupancyByTile.get(target) ?? 0;
    const score = path.length + (reserved.get(target) ?? 0) * 5 + occupancy * 4;
    if (!best || score < best.score) best = { path, target, score };
  }
  if (!best) return false;
  setVisitorPath(state, visitor, best.path);
  visitor.reservedTargetTile = best.target;
  visitor.reservedServingTile = null;
  visitor.hygieneStopUsed = true;
  visitor.state = VisitorState.ToLeisure;
  return visitor.path.length > 0 || visitor.tileIndex === best.target;
}

function assignPathToPreferredLeisure(state: StationState, visitor: Visitor): boolean {
  const loungeTargets = activeModuleTargets(
    state,
    [ModuleType.Couch, ModuleType.GameStation, ModuleType.Bench],
    [RoomType.Lounge]
  );
  const recHallTargets = activeModuleTargets(state, [ModuleType.RecUnit, ModuleType.Bench], [RoomType.RecHall]);
  const marketTargets = activeModuleTargets(state, [ModuleType.MarketStall], [RoomType.Market]);
  const cantinaTargets = activeModuleTargets(state, [ModuleType.BarCounter, ModuleType.Bench], [RoomType.Cantina]);
  const observatoryTargets = activeModuleTargets(state, [ModuleType.Telescope, ModuleType.Bench], [RoomType.Observatory]);
  const vendingTargets = activeModuleTargets(
    state,
    [ModuleType.VendingMachine],
    [RoomType.Cafeteria, RoomType.Lounge, RoomType.Market, RoomType.RecHall]
  );
  const allTargets = [
    ...loungeTargets,
    ...recHallTargets,
    ...marketTargets,
    ...cantinaTargets,
    ...observatoryTargets,
    ...vendingTargets
  ];
  if (shouldSeekVisitorHygiene(state, visitor) && assignPathToVisitorHygiene(state, visitor)) return true;
  if (allTargets.length === 0) return false;

  if (visitor.archetype === 'rusher') {
    const choice = chooseLeastLoadedPath(state, visitor.tileIndex, allTargets, false, 'visitor');
    setVisitorPath(state, visitor, choice?.path ?? []);
    visitor.reservedTargetTile = choice?.target ?? null;
    visitor.state = VisitorState.ToLeisure;
    return !!choice && (visitor.path.length > 0 || visitor.tileIndex === choice.target);
  }

  // For multi-leg trips, bias toward a room kind the visitor hasn't already
  // visited this trip — variety reads better in the inspector and exercises
  // the route-pressure overlay across multiple destinations.
  // Order: primary preference first, then variety. Cantina/Observatory are
  // bonus stops that any archetype can pull (loungers get the strongest pull).
  const baseOrder: Array<'market' | 'lounge' | 'cantina' | 'observatory' | 'vending'> = (() => {
    if (visitor.primaryPreference === 'market') return ['market', 'vending', 'cantina', 'lounge', 'observatory'];
    if (visitor.primaryPreference === 'lounge') {
      return visitor.archetype === 'lounger'
        ? ['observatory', 'lounge', 'cantina', 'market', 'vending']
        : ['lounge', 'cantina', 'observatory', 'market', 'vending'];
    }
    return ['cantina', 'lounge', 'market', 'vending', 'observatory'];
  })();
  const skipMap: Record<typeof baseOrder[number], boolean> = {
    market: visitor.lastLeisureKind === 'market',
    lounge: visitor.lastLeisureKind === 'lounge' || visitor.lastLeisureKind === 'recHall',
    cantina: visitor.lastLeisureKind === 'cantina',
    observatory: visitor.lastLeisureKind === 'observatory',
    vending: visitor.lastLeisureKind === 'vending'
  };
  const filtered = baseOrder.filter((p) => !skipMap[p]);
  const tryOrder = filtered.length > 0 ? filtered : baseOrder;
  for (const preference of tryOrder) {
    let targets: number[];
    switch (preference) {
      case 'market': targets = marketTargets; break;
      case 'cantina': targets = cantinaTargets; break;
      case 'observatory': targets = observatoryTargets; break;
      case 'vending': targets = vendingTargets; break;
      default: targets = [...loungeTargets, ...recHallTargets]; break;
    }
    if (targets.length === 0) continue;
    const choice = chooseLeastLoadedPath(state, visitor.tileIndex, targets, false, 'visitor');
    if (!choice || (choice.path.length === 0 && visitor.tileIndex !== choice.target)) continue;
    setVisitorPath(state, visitor, choice.path);
    visitor.reservedTargetTile = choice.target;
    visitor.state = VisitorState.ToLeisure;
    return true;
  }
  return false;
}

function shouldLeisureAfterMeal(state: StationState, visitor: Visitor): boolean {
  const chanceByArchetype: Record<VisitorArchetype, number> = {
    diner: 0.25,
    shopper: 0.45,
    lounger: 0.55,
    rusher: 0.1
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

function marketHelperMultiplier(state: StationState): number {
  let workers = 0;
  for (const resident of state.residents) {
    if (resident.role !== 'market_helper') continue;
    if (resident.state !== ResidentState.Leisure || resident.routinePhase !== 'work') continue;
    if (state.rooms[resident.tileIndex] !== RoomType.Market && state.rooms[resident.tileIndex] !== RoomType.RecHall) continue;
    workers += 1;
  }
  return 1 + Math.min(0.45, workers * (RESIDENT_WORK_BONUS.marketUseMultiplier - 1) * 0.3);
}

function marketSpendPerSec(state: StationState, visitor: Visitor): number {
  const taxPenalty = clamp(1 - state.controls.taxRate * visitor.taxSensitivity, 0.35, 1.05);
  return 0.45 * visitor.spendMultiplier * taxPenalty * marketHelperMultiplier(state);
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

function assignPathToClinic(state: StationState, visitor: Visitor): boolean {
  const targets = activeModuleTargets(state, [ModuleType.MedBed], [RoomType.Clinic]);
  if (targets.length === 0) return false;
  const choice = chooseLeastLoadedPath(state, visitor.tileIndex, targets, false, 'visitor');
  if (!choice || (choice.path.length === 0 && visitor.tileIndex !== choice.target)) return false;
  setVisitorPath(state, visitor, choice.path);
  visitor.reservedTargetTile = choice.target;
  visitor.reservedServingTile = null;
  visitor.state = VisitorState.ToLeisure;
  return true;
}

function assignPathToTable(state: StationState, visitor: Visitor): boolean {
  const next = pickLeastLoadedCafeteriaPath(state, visitor.tileIndex);
  setVisitorPath(state, visitor, next.path);
  visitor.reservedTargetTile = next.target;
  return visitor.path.length > 0 || (next.target !== null && next.target === visitor.tileIndex);
}

function updateVisitorLogic(
  state: StationState,
  dt: number,
  occupancyByTile: Map<number, number>,
  securityAuraByTile: Map<number, number>
): void {
  const keep: Visitor[] = [];
  let marketTradeGoodsUsed = 0;

  for (const visitor of state.visitors) {
    const exposure = applyAirExposure(state, visitor, airQualityAt(state, visitor.tileIndex), dt);
    if (exposure.died) {
      registerBodyDeathAtTile(state, visitor.tileIndex, occupancyByTile);
      continue;
    }

    if (state.ops.clinicActive > 0 && state.rooms[visitor.tileIndex] === RoomType.Clinic) {
      visitor.airExposureSec = Math.max(0, visitor.airExposureSec - PROCESS_RATES.clinicDistressRecoveryPerSec * dt);
      updateActorHealthFromExposure(state, visitor);
    } else if (
      visitor.healthState !== 'healthy' &&
      state.ops.clinicActive > 0 &&
      visitor.state !== VisitorState.ToDock &&
      visitor.path.length === 0
    ) {
      assignPathToClinic(state, visitor);
    }

    if (state.zones[visitor.tileIndex] === ZoneType.Restricted && !visitor.trespassed) {
      visitor.trespassed = true;
      const localSuppression = incidentSuppressionAtTile(securityAuraByTile, visitor.tileIndex);
      const globalSuppression = state.ops.securityActive > 0 ? 0.9 : 1;
      const suppression = clamp(localSuppression * globalSuppression, SECURITY_AURA_MAX_SUPPRESSION_FLOOR, 1);
      noteIncidentSuppressionSample(state, suppression);
      const multiplier = state.now < state.effects.securityDelayUntil ? 2 : 1;
      const cooldownUntil = state.effects.trespassCooldownUntilByTile.get(visitor.tileIndex) ?? 0;
      if (state.now >= cooldownUntil) {
        const spawnChance = clamp(0.92 * suppression, 0.2, 0.98);
        if (state.rng() <= spawnChance) {
          createIncident(state, 'trespass', visitor.tileIndex, 0.8 * multiplier);
          state.effects.trespassCooldownUntilByTile.set(visitor.tileIndex, state.now + TRESPASS_TILE_COOLDOWN_SEC);
        }
      }
      addVisitorFailurePenalty(state, 0.2 * multiplier * (0.5 + suppression * 0.5), 'trespass');
    }

    if (visitor.state === VisitorState.ToCafeteria || visitor.state === VisitorState.Queueing) {
      if (state.ops.cafeteriasActive <= 0) {
        visitor.carryingMeal = false;
        visitor.reservedServingTile = null;
        visitor.reservedTargetTile = null;
        if (!visitor.servedMeal && assignPathToLeisure(state, visitor)) {
          visitor.state = VisitorState.ToLeisure;
        } else {
          visitor.state = VisitorState.ToDock;
          assignPathToDock(state, visitor);
        }
      } else {
        if (!visitor.carryingMeal) {
          const servingTargets = collectServingTargets(state);
          if (
            visitor.reservedServingTile === null ||
            !servingTargets.includes(visitor.reservedServingTile)
          ) {
            assignPathToCafeteria(state, visitor);
          }
        } else if (visitor.reservedTargetTile === null && visitor.path.length === 0) {
          assignPathToTable(state, visitor);
        }

        if (visitor.path.length === 0) {
          repathVisitorToReservedCafeteriaTarget(state, visitor);
        }
        const moveResult = moveAlongPath(state, visitor, dt, occupancyByTile);
        if (moveResult === 'blocked') {
          visitor.blockedTicks++;
          state.metrics.maxBlockedTicksObserved = Math.max(state.metrics.maxBlockedTicksObserved, visitor.blockedTicks);
        } else {
          visitor.blockedTicks = 0;
        }
        if (moveResult !== 'moved') {
          const hasAnyCafeteria = collectServingTargets(state).length > 0;
          addVisitorPatience(state, visitor, hasAnyCafeteria ? dt * 0.35 : dt * 0.08);
        }

        if (visitor.blockedTicks === VISITOR_BLOCKED_REPATH_TICKS) {
          repathVisitorToReservedCafeteriaTarget(state, visitor);
        }
        if (!visitor.carryingMeal && visitor.blockedTicks === VISITOR_BLOCKED_QUEUE_REROUTE_TICKS) {
          setVisitorPath(state, visitor, pickQueueSpotPath(state, visitor.tileIndex));
          visitor.state = VisitorState.Queueing;
        }
        if (visitor.blockedTicks >= VISITOR_BLOCKED_FULL_REASSIGN_TICKS) {
          visitor.blockedTicks = 0;
          assignPathToCafeteria(state, visitor);
        }

        if (!visitor.carryingMeal) {
          const servingTile = visitor.reservedServingTile;
          if (servingTile !== null && visitor.tileIndex === servingTile) {
            const picked = takeItemStockAtNode(state, servingTile, 'meal', 1);
            if (picked > 0.01) {
              visitor.carryingMeal = true;
              visitor.reservedServingTile = null;
              visitor.state = VisitorState.ToCafeteria;
              if (!assignPathToTable(state, visitor)) {
                setVisitorPath(state, visitor, pickQueueSpotPath(state, visitor.tileIndex));
                visitor.state = VisitorState.Queueing;
              }
            } else {
              addVisitorFailurePenalty(state, 0.012 * dt, 'patienceBail');
              if (!isCafeteriaQueueSpot(state, visitor.tileIndex)) {
                setVisitorPath(state, visitor, pickQueueSpotPath(state, visitor.tileIndex));
              }
              visitor.state = VisitorState.Queueing;
            }
          } else if (visitor.state === VisitorState.Queueing && visitor.path.length === 0) {
            const reservedServingHasMeal =
              visitor.reservedServingTile !== null &&
              itemStockAtNode(state, visitor.reservedServingTile, 'meal') > 0.2;
            if (reservedServingHasMeal || sumItemStockForRoom(state, RoomType.Cafeteria, 'meal') > 0.2) {
              assignPathToCafeteria(state, visitor);
            }
          }
        } else if (
          visitor.reservedTargetTile !== null &&
          visitor.tileIndex === visitor.reservedTargetTile &&
          state.rooms[visitor.tileIndex] === RoomType.Cafeteria &&
          state.modules[visitor.tileIndex] === ModuleType.Table &&
          state.now >= state.effects.cafeteriaStallUntil &&
          dinersOnTile(state, visitor.tileIndex) < MAX_DINERS_PER_CAF_TILE
        ) {
          visitor.state = VisitorState.Eating;
          const eatBase = TASK_TIMINGS.visitorEatBaseSec[visitor.archetype];
          visitor.eatTimer = eatBase + state.rng() * TASK_TIMINGS.visitorEatJitterSec;
          applyVisitorCompletedRouteExperience(state, visitor);
          setVisitorPath(state, visitor, []);
          state.usageTotals.meals += 1;
          state.usageTotals.visitorLeisureEntries.cafeteria += 1;
          if (visitor.reservedTargetTile !== null && visitor.reservedTargetTile !== visitor.tileIndex) {
            state.metrics.cafeteriaNonNodeSeatedCount++;
          }
          visitor.reservedTargetTile = null;
        } else if (visitor.carryingMeal && state.rooms[visitor.tileIndex] === RoomType.Cafeteria && visitor.path.length === 0) {
          assignPathToTable(state, visitor);
        }
      }
    } else if (visitor.state === VisitorState.Eating) {
      if (state.now < state.effects.cafeteriaStallUntil) {
        addVisitorPatience(state, visitor, dt * 0.8);
      } else {
        visitor.eatTimer -= dt;
      }

      if (visitor.eatTimer <= 0) {
        visitor.carryingMeal = false;
        visitor.servedMeal = true;
        state.metrics.mealsServedTotal += 1;
        visitorSuccessRatingBonus(state, 0.08, 'mealService');
        // Multi-leg trip: visitors planned >0 legs at spawn cycle through
        // leisure rooms before exiting. Falls back to legacy archetype roll
        // if the plan was 0 (rusher-style quick-bite).
        const wantsLeisure = visitor.leisureLegsRemaining > 0 || shouldLeisureAfterMeal(state, visitor);
        if (wantsLeisure && assignPathToLeisure(state, visitor)) {
          visitor.state = VisitorState.ToLeisure;
        } else {
          visitor.state = VisitorState.ToDock;
          visitor.reservedTargetTile = null;
          assignPathToDock(state, visitor);
        }
      }
    } else if (visitor.state === VisitorState.ToLeisure) {
      const waitingForClinicCare = visitor.healthState !== 'healthy' && state.rooms[visitor.tileIndex] === RoomType.Clinic;
      if (visitor.path.length === 0 && !waitingForClinicCare) {
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
      const atLoungeModule =
        state.modules[visitor.tileIndex] === ModuleType.Couch ||
        state.modules[visitor.tileIndex] === ModuleType.GameStation ||
        state.modules[visitor.tileIndex] === ModuleType.RecUnit ||
        state.modules[visitor.tileIndex] === ModuleType.Bench;
      const atMarketModule = state.modules[visitor.tileIndex] === ModuleType.MarketStall;
      const atVendingModule = state.modules[visitor.tileIndex] === ModuleType.VendingMachine;
      const atCantinaModule =
        state.modules[visitor.tileIndex] === ModuleType.BarCounter ||
        state.modules[visitor.tileIndex] === ModuleType.Tap ||
        (state.rooms[visitor.tileIndex] === RoomType.Cantina &&
          (visitor.reservedTargetTile === null || visitor.reservedTargetTile === visitor.tileIndex));
      const atObservatoryModule =
        state.modules[visitor.tileIndex] === ModuleType.Telescope ||
        (state.rooms[visitor.tileIndex] === RoomType.Observatory &&
          (visitor.reservedTargetTile === null || visitor.reservedTargetTile === visitor.tileIndex));
      const atClinicModule =
        visitor.healthState !== 'healthy' &&
        (state.modules[visitor.tileIndex] === ModuleType.MedBed ||
          (state.rooms[visitor.tileIndex] === RoomType.Clinic &&
            (visitor.reservedTargetTile === null || visitor.reservedTargetTile === visitor.tileIndex)));
      const atHygieneService =
        state.rooms[visitor.tileIndex] === RoomType.Hygiene &&
        (visitor.reservedTargetTile === null || visitor.reservedTargetTile === visitor.tileIndex);
      if (
        atLoungeModule ||
        atMarketModule ||
        atVendingModule ||
        atCantinaModule ||
        atObservatoryModule ||
        atClinicModule ||
        atHygieneService
      ) {
        visitor.state = VisitorState.Leisure;
        // Wonder bonus: Observatory contributes 2x rating boost vs Lounge.
        // Cantina sits between (drinks land mid-way between social and wonder).
        const ratingBonus = atObservatoryModule
          ? 0.07
          : atCantinaModule
            ? 0.05
            : atVendingModule
              ? 0.035
              : atClinicModule
                ? 0.02
                : atHygieneService
                  ? 0.025
                  : 0.04;
        visitorSuccessRatingBonus(state, ratingBonus, 'leisureService');
        if (atVendingModule) {
          state.usageTotals.visitorLeisureEntries.vending += 1;
        } else if (atMarketModule || state.rooms[visitor.tileIndex] === RoomType.Market) {
          state.usageTotals.visitorLeisureEntries.market += 1;
        } else if (atHygieneService) {
          state.usageTotals.hygiene += 1;
          state.usageTotals.visitorLeisureEntries.hygiene += 1;
        } else if (atCantinaModule) {
          state.usageTotals.visitorLeisureEntries.cantina += 1;
        } else if (atObservatoryModule) {
          state.usageTotals.visitorLeisureEntries.observatory += 1;
        } else if (atClinicModule) {
          state.usageTotals.hygiene += 1;
        } else if (state.rooms[visitor.tileIndex] === RoomType.RecHall) {
          state.usageTotals.visitorLeisureEntries.recHall += 1;
        } else {
          state.usageTotals.visitorLeisureEntries.lounge += 1;
        }
        const baseDwell = TASK_TIMINGS.visitorLeisureBaseSec[visitor.archetype];
        // Observatory: longer dwell (wonder). Cantina: shorter (drink + go).
        const dwellMult = atObservatoryModule ? 1.45 : atCantinaModule ? 0.85 : 1;
        visitor.eatTimer =
          (atClinicModule ? 5.5 : atHygieneService ? 2.8 : baseDwell * dwellMult) +
          state.rng() * TASK_TIMINGS.visitorLeisureJitterSec;
        applyVisitorCompletedRouteExperience(state, visitor);
        visitor.reservedTargetTile = null;
        setVisitorPath(state, visitor, []);
      }
    } else if (visitor.state === VisitorState.Leisure) {
      visitor.eatTimer -= dt;
      // VendingMachine bonus: visitors at a vending tile spend a small flat
      // amount per second regardless of room kind. Stacks with the market
      // stall trade-good loop below when both apply.
      if (state.modules[visitor.tileIndex] === ModuleType.VendingMachine) {
        const vendSpend = dt * 0.42 * clamp(visitor.spendMultiplier, 0.7, 1.6);
        state.metrics.credits += vendSpend;
        state.metrics.creditsEarnedLifetime += vendSpend;
        state.usageTotals.creditsMarketGross += vendSpend;
      }
      // Cantina drinks: visitors in a Cantina (at the bar counter or anywhere
      // in the room while in Leisure) generate a steady drinks revenue. Tap
      // modules in the same cluster scale the rate.
      if (state.rooms[visitor.tileIndex] === RoomType.Cantina) {
        // Count taps in the cluster for a small throughput multiplier.
        let tapBonus = 1;
        for (const m of state.moduleInstances) {
          if (m.type !== ModuleType.Tap) continue;
          if (state.rooms[m.originTile] === RoomType.Cantina) {
            // Same cluster check: cheap proximity (Manhattan within 8 tiles).
            const ax = m.originTile % state.width;
            const ay = Math.floor(m.originTile / state.width);
            const vx = visitor.tileIndex % state.width;
            const vy = Math.floor(visitor.tileIndex / state.width);
            if (Math.abs(ax - vx) + Math.abs(ay - vy) <= 8) tapBonus += 0.18;
          }
        }
        const drinkSpend = dt * 0.85 * tapBonus * clamp(visitor.spendMultiplier, 0.6, 1.7);
        state.metrics.credits += drinkSpend;
        state.metrics.creditsEarnedLifetime += drinkSpend;
        state.usageTotals.creditsMarketGross += drinkSpend;
      }
      if (state.rooms[visitor.tileIndex] === RoomType.Clinic) {
        visitor.airExposureSec = Math.max(0, visitor.airExposureSec - PROCESS_RATES.clinicDistressRecoveryPerSec * dt);
        updateActorHealthFromExposure(state, visitor);
      }
      if (state.modules[visitor.tileIndex] === ModuleType.MarketStall) {
        const requestedGoods = MARKET_TRADE_GOOD_USE_PER_SEC * dt * clamp(visitor.spendMultiplier, 0.7, 1.8);
        const consumedGoods = consumeTradeGoodsFromMarket(state, requestedGoods);
        let spendMultiplier = 0.26;
        if (consumedGoods > 0) {
          spendMultiplier = 1 + consumedGoods * 0.9;
          state.usageTotals.tradeGoodsSold += consumedGoods;
          marketTradeGoodsUsed += consumedGoods;
          visitorSuccessRatingBonus(state, consumedGoods * 0.02, 'leisureService');
        } else {
          state.usageTotals.marketStockouts += dt;
          addVisitorPatience(state, visitor, dt * 0.35);
          addVisitorFailurePenalty(state, 0.01 * dt, 'shipServicesMissing');
        }
        const environment = roomEnvironmentScoreAt(state, visitor.tileIndex);
        const marketStatus = clamp(
          environment.visitorStatus + environment.publicAppeal * 0.3 - environment.serviceNoise * 0.2,
          -1.5,
          2.5
        );
        spendMultiplier *= clamp(1 + marketStatus * 0.06, 0.85, 1.15);
        const spend = dt * marketSpendPerSec(state, visitor) * spendMultiplier;
        state.metrics.credits += spend;
        state.metrics.creditsEarnedLifetime += spend;
        state.usageTotals.creditsMarketGross += spend;
        state.usageTotals.creditsTradeGoodsGross += spend * (consumedGoods > 0 ? 1 : 0);
      }
      if (visitor.eatTimer <= 0) {
        // Record this stop's room kind so the next leg picks somewhere new.
        const room = state.rooms[visitor.tileIndex];
        if (state.modules[visitor.tileIndex] === ModuleType.VendingMachine) visitor.lastLeisureKind = 'vending';
        else if (room === RoomType.Market) visitor.lastLeisureKind = 'market';
        else if (room === RoomType.Lounge) visitor.lastLeisureKind = 'lounge';
        else if (room === RoomType.RecHall) visitor.lastLeisureKind = 'recHall';
        else if (room === RoomType.Hygiene) visitor.lastLeisureKind = 'hygiene';
        else if (room === RoomType.Cantina) visitor.lastLeisureKind = 'cantina';
        else if (room === RoomType.Observatory) visitor.lastLeisureKind = 'observatory';
        if (visitor.leisureLegsRemaining > 0) visitor.leisureLegsRemaining -= 1;

        // Hungry visitors prefer to eat first if they haven't yet. Otherwise,
        // if there's still itinerary, do another leisure stop in a different
        // room. Otherwise, exit.
        if (!visitor.servedMeal && state.ops.cafeteriasActive > 0 && shouldTryMealAfterLeisure(state, visitor)) {
          visitor.state = VisitorState.ToCafeteria;
          assignPathToCafeteria(state, visitor);
        } else if (visitor.leisureLegsRemaining > 0 && assignPathToLeisure(state, visitor)) {
          visitor.state = VisitorState.ToLeisure;
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
      if (isVisitorExitTile(state, visitor.tileIndex)) {
        const boardedResult = tryBoardVisitorOriginShipAtTile(state, visitor, visitor.tileIndex);
        if (boardedResult.boarded && boardedResult.ship) {
          const converted = maybeConvertVisitorToResident(state, visitor, boardedResult.ship);
          if (converted) {
            continue;
          }
        }
        const boarded = boardedResult.boarded;
        const canExitNormally =
          state.now - state.lastCycleTime > state.cycleDuration * 0.2 &&
          state.now - visitor.spawnedAt >= VISITOR_MIN_STAY_SEC;
        if (boarded || canExitNormally) {
          visitorSuccessRatingBonus(state, visitor.servedMeal ? 0.03 : 0.015, 'successfulExit');
          if (visitor.servedMeal) {
            const payout = mealExitPayout(state, visitor);
            state.metrics.credits += payout;
            state.metrics.creditsEarnedLifetime += payout;
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
      setVisitorPath(state, visitor, []);
      // Despawn when the visitor has reached an exit tile. Dock tiles are
      // explicit; Berth-room tiles are the equivalent for berth-arrivals
      // (a ship docked at a Berth has no underlying Dock tile type).
      const onExitTile = isVisitorExitTile(state, visitor.tileIndex);
      if (onExitTile) {
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
  state.metrics.marketTradeGoodUseRate = dt > 0 ? marketTradeGoodsUsed / dt : 0;
}

function noteFailedNeedAttempt(state: StationState, need: 'hunger' | 'energy' | 'hygiene' | 'dorm'): void {
  state.failedNeedAttempts[need] += 1;
  if (need === 'hunger') state.metrics.failedNeedAttemptsHunger += 1;
  if (need === 'energy') state.metrics.failedNeedAttemptsEnergy += 1;
  if (need === 'hygiene') state.metrics.failedNeedAttemptsHygiene += 1;
}

function residentHomeDockTargets(state: StationState, resident: Resident): number[] {
  if (resident.homeShipId !== null) {
    const ship = state.arrivingShips.find((s) => s.id === resident.homeShipId) ?? null;
    if (ship && ship.stage === 'docked' && ship.bayTiles.length > 0) return ship.bayTiles;
  }
  if (resident.homeDockId !== null) {
    const dock = state.docks.find((d) => d.id === resident.homeDockId);
    if (dock && dock.tiles.length > 0) return dock.tiles;
  }
  return collectTiles(state, TileType.Dock);
}

function residentBedTarget(state: StationState, resident: Resident): number[] {
  if (resident.bedModuleId === null) return residentDormTargets(state);
  const bed = state.moduleInstances.find((m) => m.id === resident.bedModuleId && m.type === ModuleType.Bed);
  if (!bed) return residentDormTargets(state);
  if (state.rooms[bed.originTile] !== RoomType.Dorm) return residentDormTargets(state);
  return [bed.originTile];
}

function updateResidentRoutinePhase(state: StationState, resident: Resident): ResidentRoutinePhase {
  const t = ((state.now % RESIDENT_ROUTINE_DAY_SEC) + RESIDENT_ROUTINE_DAY_SEC) % RESIDENT_ROUTINE_DAY_SEC;
  const pct = t / RESIDENT_ROUTINE_DAY_SEC;
  const phase: ResidentRoutinePhase =
    pct < 0.2 ? 'rest' : pct < 0.45 ? 'errands' : pct < 0.68 ? 'work' : pct < 0.86 ? 'socialize' : 'winddown';
  resident.routinePhase = phase;
  return phase;
}

function residentLeisureTargets(state: StationState): number[] {
  return [
    ...activeRoomTargets(state, RoomType.Lounge),
    ...activeRoomTargets(state, RoomType.RecHall),
    ...activeRoomTargets(state, RoomType.Market),
    ...activeRoomTargets(state, RoomType.Cafeteria),
    ...activeRoomTargets(state, RoomType.Cantina),
    ...activeRoomTargets(state, RoomType.Observatory)
  ];
}

function residentWorkTargets(state: StationState, resident: Resident): number[] {
  if (resident.role === 'market_helper') {
    return [...activeRoomTargets(state, RoomType.Market), ...activeRoomTargets(state, RoomType.RecHall)];
  }
  if (resident.role === 'hydro_assist') {
    return [...activeRoomTargets(state, RoomType.Hydroponics), ...activeRoomTargets(state, RoomType.Kitchen)];
  }
  if (resident.role === 'civic_watch') {
    return [...activeRoomTargets(state, RoomType.Security), ...activeRoomTargets(state, RoomType.Brig)];
  }
  return [];
}

function residentSecurityAdjacentTargets(state: StationState): number[] {
  const out = new Set<number>();
  const deltas = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ];
  for (let i = 0; i < state.rooms.length; i++) {
    if (state.rooms[i] !== RoomType.Security) continue;
    const p = fromIndex(i, state.width);
    if (isWalkable(state.tiles[i])) out.add(i);
    for (const [dx, dy] of deltas) {
      const nx = p.x + dx;
      const ny = p.y + dy;
      if (!inBounds(nx, ny, state.width, state.height)) continue;
      const ni = toIndex(nx, ny, state.width);
      if (!isWalkable(state.tiles[ni])) continue;
      if (state.zones[ni] !== ZoneType.Public && state.rooms[ni] !== RoomType.Security) continue;
      out.add(ni);
    }
  }
  return [...out];
}

function residentSafeTargets(state: StationState, securityAuraByTile: Map<number, number>): number[] {
  const out = new Set<number>();
  for (const [tile, aura] of securityAuraByTile.entries()) {
    if (aura < 0.45) continue;
    if (!isWalkable(state.tiles[tile])) continue;
    if (state.zones[tile] !== ZoneType.Public && state.rooms[tile] !== RoomType.Security) continue;
    out.add(tile);
  }
  for (const tile of residentSecurityAdjacentTargets(state)) out.add(tile);
  return [...out];
}

function assignResidentTarget(state: StationState, resident: Resident, securityAuraByTile: Map<number, number>): void {
  resident.reservedTargetTile = null;
  updateResidentRoutinePhase(state, resident);
  if (resident.leaveIntent >= RESIDENT_LEAVE_INTENT_TRIGGER) {
    resident.state = ResidentState.ToHomeShip;
    setResidentPath(state, resident, chooseNearestPath(state, resident.tileIndex, residentHomeDockTargets(state, resident), true, 'resident') ?? []);
    return;
  }

  const dormTargets = residentBedTarget(state, resident);
  const hygieneTargets = residentHygieneTargets(state);
  const cafeteriaTargets = activeRoomTargets(state, RoomType.Cafeteria);
  const criticalNeed = resident.energy < 35 || resident.hygiene < 30 || resident.hunger < 30;

  if (criticalNeed && resident.energy < DORM_SEEK_ENERGY_THRESHOLD && dormTargets.length > 0) {
    resident.state = ResidentState.ToDorm;
    setResidentPath(state, resident, chooseNearestPath(state, resident.tileIndex, dormTargets, false, 'resident') ?? []);
    if (resident.path.length > 0) return;
    noteFailedNeedAttempt(state, 'dorm');
    noteFailedNeedAttempt(state, 'energy');
  } else if (criticalNeed && resident.energy < DORM_SEEK_ENERGY_THRESHOLD) {
    noteFailedNeedAttempt(state, 'dorm');
    noteFailedNeedAttempt(state, 'energy');
  }

  if (criticalNeed && resident.hygiene < 45 && hygieneTargets.length > 0) {
    resident.state = ResidentState.ToHygiene;
    setResidentPath(state, resident, chooseNearestPath(state, resident.tileIndex, hygieneTargets, false, 'resident') ?? []);
    if (resident.path.length > 0) return;
    noteFailedNeedAttempt(state, 'hygiene');
  } else if (criticalNeed && resident.hygiene < 45) {
    noteFailedNeedAttempt(state, 'hygiene');
  }

  if (criticalNeed && resident.hunger < 55 && cafeteriaTargets.length > 0 && state.metrics.mealStock > 3) {
    resident.state = ResidentState.ToCafeteria;
    setResidentPath(state, resident, pickQueueSpotPath(state, resident.tileIndex, 'resident'));
    if (resident.path.length === 0) {
      const next = pickLeastLoadedCafeteriaPath(state, resident.tileIndex, 'resident');
      setResidentPath(state, resident, next.path);
      resident.reservedTargetTile = next.target;
    }
    if (resident.path.length > 0) return;
    noteFailedNeedAttempt(state, 'hunger');
  } else if (criticalNeed && resident.hunger < 55) {
    noteFailedNeedAttempt(state, 'hunger');
  }

  if (!criticalNeed && resident.safety < 35) {
    const safeTargets = residentSafeTargets(state, securityAuraByTile);
    if (safeTargets.length > 0) {
      resident.state = ResidentState.ToSecurity;
      setResidentPath(state, resident, chooseNearestPath(state, resident.tileIndex, safeTargets, false, 'resident') ?? []);
      if (resident.path.length > 0) return;
    }
  }

  if (!criticalNeed && resident.social < 35) {
    const leisureTargets = residentLeisureTargets(state);
    if (leisureTargets.length > 0) {
      resident.state = ResidentState.ToLeisure;
      setResidentPath(state, resident, chooseNearestPath(state, resident.tileIndex, leisureTargets, false, 'resident') ?? []);
      if (resident.path.length > 0) return;
    }
  }

  if (!criticalNeed && resident.routinePhase === 'work') {
    const workTargets = residentWorkTargets(state, resident);
    if (workTargets.length > 0) {
      resident.state = ResidentState.ToLeisure;
      setResidentPath(state, resident, chooseNearestPath(state, resident.tileIndex, workTargets, false, 'resident') ?? []);
      if (resident.path.length > 0) return;
    }
  }

  if (!criticalNeed && resident.routinePhase === 'socialize' && resident.social < 65) {
    const leisureTargets = residentLeisureTargets(state);
    if (leisureTargets.length > 0) {
      resident.state = ResidentState.ToLeisure;
      setResidentPath(state, resident, chooseNearestPath(state, resident.tileIndex, leisureTargets, false, 'resident') ?? []);
      if (resident.path.length > 0) return;
    }
  }

  if (resident.energy < DORM_SEEK_ENERGY_THRESHOLD && dormTargets.length > 0) {
    resident.state = ResidentState.ToDorm;
    setResidentPath(state, resident, chooseNearestPath(state, resident.tileIndex, dormTargets, false, 'resident') ?? []);
    if (resident.path.length > 0) return;
    noteFailedNeedAttempt(state, 'dorm');
    noteFailedNeedAttempt(state, 'energy');
  } else if (resident.energy < DORM_SEEK_ENERGY_THRESHOLD) {
    noteFailedNeedAttempt(state, 'dorm');
    noteFailedNeedAttempt(state, 'energy');
  }

  if (resident.hygiene < 45 && hygieneTargets.length > 0) {
    resident.state = ResidentState.ToHygiene;
    setResidentPath(state, resident, chooseNearestPath(state, resident.tileIndex, hygieneTargets, false, 'resident') ?? []);
    if (resident.path.length > 0) return;
    noteFailedNeedAttempt(state, 'hygiene');
  } else if (resident.hygiene < 45) {
    noteFailedNeedAttempt(state, 'hygiene');
  }

  if (resident.hunger < 55 && cafeteriaTargets.length > 0 && state.metrics.mealStock > 3) {
    resident.state = ResidentState.ToCafeteria;
    setResidentPath(state, resident, pickQueueSpotPath(state, resident.tileIndex, 'resident'));
    if (resident.path.length === 0) {
      const next = pickLeastLoadedCafeteriaPath(state, resident.tileIndex, 'resident');
      setResidentPath(state, resident, next.path);
      resident.reservedTargetTile = next.target;
    }
    if (resident.path.length > 0) return;
    noteFailedNeedAttempt(state, 'hunger');
  } else if (resident.hunger < 55) {
    noteFailedNeedAttempt(state, 'hunger');
  }

  resident.state = ResidentState.Idle;
  if (state.now >= resident.retargetAt || resident.path.length === 0) {
    const walkTargets = resident.routinePhase === 'socialize' ? residentLeisureTargets(state) : collectIdleWalkTiles(state);
    if (walkTargets.length > 0) {
      const target = walkTargets[randomInt(0, walkTargets.length - 1, state.rng)];
      setResidentPath(
        state,
        resident,
        findPath(state, resident.tileIndex, target, { allowRestricted: false, intent: 'resident' }, state.pathOccupancyByTile) ?? []
      );
    } else {
      setResidentPath(state, resident, []);
    }
    resident.retargetAt = state.now + 5 + state.rng() * 8;
  }
}

function residentCanConfront(state: StationState, resident: Resident, securityAuraByTile: Map<number, number>): boolean {
  if (resident.healthState === 'critical') return false;
  if ((resident.activeIncidentId ?? null) !== null) return false;
  if ((resident.confrontationUntil ?? 0) > state.now) return false;
  if (resident.state !== ResidentState.Idle) return false;
  if (resident.leaveIntent >= RESIDENT_LEAVE_INTENT_TRIGGER) return false;
  if (resident.safety > 75 && resident.social > 60) return false;
  const suppression = incidentSuppressionAtTile(securityAuraByTile, resident.tileIndex);
  if (suppression <= 0.5 && resident.safety > 40) return false;
  if (state.zones[resident.tileIndex] !== ZoneType.Public) return false;
  const room = state.rooms[resident.tileIndex];
  return (
    room === RoomType.Lounge ||
    room === RoomType.RecHall ||
    room === RoomType.Market ||
    room === RoomType.Cafeteria ||
    room === RoomType.None
  );
}

function tryStartResidentConfrontation(state: StationState, dt: number, securityAuraByTile: Map<number, number>): void {
  if (state.residents.length < 2) return;
  const candidates = state.residents.filter((resident) => residentCanConfront(state, resident, securityAuraByTile));
  if (candidates.length < 2) return;
  const globalSecuritySuppression = state.ops.securityActive > 0 ? 0.9 : 1;

  for (let i = 0; i < candidates.length; i++) {
    const a = candidates[i];
    const aAgitation = a.agitation ?? 0;
    if (aAgitation < RESIDENT_AGITATION_CONFRONTATION_THRESHOLD) continue;
    const ap = fromIndex(a.tileIndex, state.width);
    for (let j = i + 1; j < candidates.length; j++) {
      const b = candidates[j];
      const bAgitation = b.agitation ?? 0;
      const avgAgitation = (aAgitation + bAgitation) * 0.5;
      if (avgAgitation < RESIDENT_AGITATION_CONFRONTATION_THRESHOLD) continue;
      const bp = fromIndex(b.tileIndex, state.width);
      const manhattan = Math.abs(ap.x - bp.x) + Math.abs(ap.y - bp.y);
      if (manhattan > 2) continue;
      const localCrowd = (state.pathOccupancyByTile.get(a.tileIndex) ?? 0) + (state.pathOccupancyByTile.get(b.tileIndex) ?? 0);
      const crowdFactor = clamp(localCrowd / 3.5, 0.6, 1.8);
      const socialDeficit = clamp(((100 - a.social) + (100 - b.social)) / 200, 0, 1.2);
      const safetyDeficit = clamp(((100 - a.safety) + (100 - b.safety)) / 200, 0, 1.2);
      const deficitPressure = 1 + socialDeficit * 0.45 + safetyDeficit * 0.8;
      const localSuppression =
        (incidentSuppressionAtTile(securityAuraByTile, a.tileIndex) + incidentSuppressionAtTile(securityAuraByTile, b.tileIndex)) * 0.5;
      noteIncidentSuppressionSample(state, localSuppression);
      const chance =
        RESIDENT_CONFRONTATION_BASE_CHANCE_PER_SEC *
        (avgAgitation / 80) *
        crowdFactor *
        deficitPressure *
        localSuppression *
        globalSecuritySuppression *
        Math.max(0.1, dt);
      if (state.rng() > chance) continue;

      const severity = clamp(avgAgitation / 55 + (a.stress + b.stress) / 220 + safetyDeficit * 0.25, 0.6, 2.2);
      const incident = createIncident(state, 'fight', a.tileIndex, severity, [a.id, b.id]);
      a.activeIncidentId = incident.id;
      b.activeIncidentId = incident.id;
      a.confrontationUntil = incident.resolveBy;
      b.confrontationUntil = incident.resolveBy;
      a.state = ResidentState.Idle;
      b.state = ResidentState.Idle;
      a.path = [];
      b.path = [];
      a.reservedTargetTile = null;
      b.reservedTargetTile = null;
      a.agitation = clamp(aAgitation + 16, 0, 100);
      b.agitation = clamp(bAgitation + 16, 0, 100);
      state.usageTotals.residentConfrontations += 1;
      return;
    }
  }
}

function resolveFightOnIntervention(
  state: StationState,
  incident: IncidentEntity
): { mode: 'resolved'; outcome: 'deescalated' | 'detained' } | { mode: 'extended'; resolveAt: number } {
  state.usageTotals.securityFightInterventions += 1;
  if (incident.severity < BAD_FIGHT_THRESHOLD) {
    state.usageTotals.securityImmediateDefuses += 1;
    return { mode: 'resolved', outcome: 'deescalated' };
  }

  if (state.rng() > BAD_FIGHT_ESCALATION_CHANCE) {
    state.usageTotals.securityImmediateDefuses += 1;
    return { mode: 'resolved', outcome: incident.severity >= 1.65 ? 'detained' : 'deescalated' };
  }

  state.usageTotals.securityEscalatedFights += 1;
  const severityScale = clamp((incident.severity - BAD_FIGHT_THRESHOLD) / (2.2 - BAD_FIGHT_THRESHOLD), 0, 1);
  const duration =
    FIGHT_EXTENDED_MIN_SEC + (FIGHT_EXTENDED_MAX_SEC - FIGHT_EXTENDED_MIN_SEC) * (0.3 + severityScale * 0.7);
  return { mode: 'extended', resolveAt: state.now + duration };
}

function hasActiveIncidentResponder(state: StationState, incident: IncidentEntity): boolean {
  if (incident.assignedCrewId === null) return false;
  const responder = state.crewMembers.find((crew) => crew.id === incident.assignedCrewId);
  return !!responder && !responder.resting && responder.healthState !== 'critical';
}

function resolveIncident(
  state: StationState,
  incident: IncidentEntity,
  options?: { fightOutcome?: 'deescalated' | 'detained' }
): void {
  incident.stage = 'resolved';
  incident.resolvedAt = state.now;
  incident.extendedResolveAt = null;
  // Lifetime counter — increment at the resolve EVENT (not a scan over
  // `state.incidents`, which prunes resolved incidents after the
  // retention window and would make this field non-monotonic). Failed
  // incidents stay out — `failIncident` below has its own resolvedAt
  // write but is semantically distinct from "resolved".
  state.metrics.incidentsResolvedLifetime += 1;
  if (incident.type === 'fight') {
    incident.outcome = options?.fightOutcome ?? (incident.severity > 1.35 ? 'detained' : 'deescalated');
    for (const residentId of incident.residentParticipantIds) {
      const resident = state.residents.find((entry) => entry.id === residentId);
      if (!resident) continue;
      resident.activeIncidentId = null;
      resident.confrontationUntil = state.now + 1.4;
      resident.stress = clamp(resident.stress - 28, 0, 120);
      resident.agitation = clamp((resident.agitation ?? 0) - 34, 0, 100);
      resident.safety = clamp(resident.safety + 14, 0, 100);
    }
  } else {
    incident.outcome = 'warning';
  }
  if (incident.dispatchAt !== null) {
    state.usageTotals.securityResolved += 1;
    state.usageTotals.securityResponseSecTotal += Math.max(0, state.now - incident.createdAt);
  }
  state.incidentHeat = Math.max(0, state.incidentHeat - incident.severity * 0.35);
}

function failIncident(state: StationState, incident: IncidentEntity, occupancyByTile: Map<number, number>): void {
  incident.stage = 'failed';
  incident.resolvedAt = state.now;
  incident.extendedResolveAt = null;
  state.usageTotals.incidentsFailed += 1;
  state.incidentHeat += 0.9 * incident.severity;

  if (incident.type === 'fight') {
    const participants = state.residents.filter((resident) => incident.residentParticipantIds.includes(resident.id));
    const victim = participants.sort((a, b) => (b.stress + (b.agitation ?? 0)) - (a.stress + (a.agitation ?? 0)))[0];
    if (victim) {
      unlinkResidentFromShip(state, victim);
      registerBodyDeathAtTile(state, victim.tileIndex, occupancyByTile);
      state.residents = state.residents.filter((resident) => resident.id !== victim.id);
      incident.outcome = 'fatality';
    } else {
      incident.outcome = 'escaped';
    }
    for (const residentId of incident.residentParticipantIds) {
      const resident = state.residents.find((entry) => entry.id === residentId);
      if (!resident) continue;
      resident.activeIncidentId = null;
      resident.confrontationUntil = state.now + 2;
      resident.stress = clamp(resident.stress + 16, 0, 120);
      resident.agitation = clamp((resident.agitation ?? 0) + 22, 0, 100);
      resident.safety = clamp(resident.safety - 18, 0, 100);
    }
    serviceFailureRatingPenalty(state, 0.3 * incident.severity, 'ratingFromVisitorFailure');
  } else {
    incident.outcome = 'escaped';
    addVisitorFailurePenalty(state, 0.1 * incident.severity, 'trespass');
  }
}

function updateIncidentPipeline(state: StationState, dt: number, occupancyByTile: Map<number, number>): void {
  if (state.incidents.length <= 0) return;
  for (const incident of state.incidents) {
    if (!isIncidentActive(incident)) continue;

    if (incident.stage === 'detected' && state.now >= incident.createdAt + 0.25) {
      incident.stage = 'dispatching';
    }

    if (incident.stage === 'dispatching') {
      const responder = pickSecurityResponder(state, incident.tileIndex);
      if (responder) {
        incident.assignedCrewId = responder.crew.id;
        incident.dispatchAt = state.now;
        const congestionPenalty = pathCongestion(responder.path, state.pathOccupancyByTile) * INCIDENT_CONGESTION_WEIGHT_SEC;
        const delayedSecurityPenalty = state.now < state.effects.securityDelayUntil ? 1.8 : 0;
        const brigContainmentMultiplier = state.ops.brigActive > 0 ? 0.76 : 1;
        incident.interveneAt =
          state.now +
          (INCIDENT_INTERVENTION_BASE_SEC +
            responder.path.length * INCIDENT_INTERVENTION_PER_TILE_SEC +
            congestionPenalty +
            delayedSecurityPenalty) *
            brigContainmentMultiplier;
        incident.stage = 'intervening';
        setCrewPath(state, responder.crew, responder.path);
        responder.crew.targetTile = incident.tileIndex;
        responder.crew.role = 'security';
        responder.crew.assignedSystem = 'security';
        responder.crew.assignmentStickyUntil = Math.max(
          responder.crew.assignmentStickyUntil,
          state.now + CREW_ASSIGNMENT_STICKY_SEC
        );
        responder.crew.assignmentHoldUntil = Math.max(
          responder.crew.assignmentHoldUntil,
          (incident.interveneAt ?? state.now) + 1.2
        );
        state.usageTotals.securityDispatches += 1;
      } else if (state.now >= incident.resolveBy) {
        failIncident(state, incident, occupancyByTile);
      }
    }

    if (incident.stage === 'intervening') {
      if (state.now >= (incident.interveneAt ?? Number.POSITIVE_INFINITY)) {
        if (incident.type === 'fight') {
          const resolution = resolveFightOnIntervention(state, incident);
          if (resolution.mode === 'resolved') {
            resolveIncident(state, incident, { fightOutcome: resolution.outcome });
          } else {
            incident.stage = 'intervening_extended';
            incident.extendedResolveAt = resolution.resolveAt;
            incident.interveneAt = resolution.resolveAt;
            incident.resolveBy = Math.max(incident.resolveBy, resolution.resolveAt + 1.2);
          }
        } else {
          resolveIncident(state, incident);
        }
      } else if (state.now >= incident.resolveBy) {
        failIncident(state, incident, occupancyByTile);
      }
    }

    if (incident.stage === 'intervening_extended') {
      if (state.ops.brigActive > 0 && incident.extendedResolveAt !== null) {
        incident.extendedResolveAt = Math.min(incident.extendedResolveAt, state.now + 0.55);
      }
      if (state.now >= (incident.extendedResolveAt ?? Number.POSITIVE_INFINITY) && hasActiveIncidentResponder(state, incident)) {
        resolveIncident(state, incident, { fightOutcome: incident.severity >= 1.75 ? 'detained' : 'deescalated' });
      } else if (state.now >= incident.resolveBy) {
        failIncident(state, incident, occupancyByTile);
      }
    }
  }
  state.incidents = state.incidents.filter((incident) => {
    if (incident.resolvedAt === null) return true;
    return state.now - incident.resolvedAt <= INCIDENT_RESOLVED_RETENTION_SEC;
  });
}

function nearbyPopulationCount(state: StationState, tileIndex: number, radius = 2): number {
  const p = fromIndex(tileIndex, state.width);
  let count = 0;
  for (const resident of state.residents) {
    const rp = fromIndex(resident.tileIndex, state.width);
    if (Math.abs(rp.x - p.x) + Math.abs(rp.y - p.y) <= radius) count += 1;
  }
  for (const visitor of state.visitors) {
    const vp = fromIndex(visitor.tileIndex, state.width);
    if (Math.abs(vp.x - p.x) + Math.abs(vp.y - p.y) <= radius) count += 1;
  }
  return count;
}

function nearbyIncidentPressure(state: StationState, tileIndex: number): number {
  const p = fromIndex(tileIndex, state.width);
  let pressure = 0;
  for (const incident of state.incidents) {
    if (!isIncidentActive(incident)) continue;
    const ip = fromIndex(incident.tileIndex, state.width);
    const dist = Math.abs(ip.x - p.x) + Math.abs(ip.y - p.y);
    if (dist > 8) continue;
    const falloff = clamp(1 - dist / 8, 0, 1);
    pressure += incident.severity * falloff;
  }
  return pressure;
}

function updateResidentLogic(
  state: StationState,
  dt: number,
  occupancyByTile: Map<number, number>,
  securityAuraByTile: Map<number, number>
): void {
  const keep: Resident[] = [];
  for (const resident of state.residents) {
    const exposure = applyAirExposure(state, resident, airQualityAt(state, resident.tileIndex), dt);
    if (exposure.died) {
      unlinkResidentFromShip(state, resident);
      registerBodyDeathAtTile(state, resident.tileIndex, occupancyByTile);
      continue;
    }

    if (resident.agitation === undefined) resident.agitation = 0;
    if (resident.activeIncidentId === undefined) resident.activeIncidentId = null;
    if (resident.confrontationUntil === undefined) resident.confrontationUntil = 0;
    if (!Number.isFinite(resident.social)) resident.social = 65;
    if (!Number.isFinite(resident.safety)) resident.safety = 65;
    if (!resident.routinePhase) resident.routinePhase = 'errands';
    updateResidentRoutinePhase(state, resident);
    const activeFight = activeFightIncidentForResident(state, resident.id);
    if (!activeFight && resident.activeIncidentId !== null) {
      resident.activeIncidentId = null;
    }
    if (activeFight) {
      resident.state = ResidentState.Idle;
      setResidentPath(state, resident, []);
      resident.reservedTargetTile = null;
      resident.stress = clamp(resident.stress + dt * 0.6, 0, 120);
      resident.agitation = clamp(Math.max(resident.agitation, RESIDENT_AGITATION_CONFRONTATION_THRESHOLD + 15), 0, 100);
      resident.confrontationUntil = Math.max(resident.confrontationUntil, state.now + dt);
      resident.safety = clamp(resident.safety - dt * 2.4, 0, 100);
      resident.social = clamp(resident.social - dt * 0.5, 0, 100);
      keep.push(resident);
      continue;
    }

    if (state.ops.clinicActive > 0 && state.rooms[resident.tileIndex] === RoomType.Clinic) {
      resident.airExposureSec = Math.max(0, resident.airExposureSec - PROCESS_RATES.clinicDistressRecoveryPerSec * dt);
      updateActorHealthFromExposure(state, resident);
      resident.stress = clamp(resident.stress - dt * 1.4, 0, 120);
      resident.safety = clamp(resident.safety + dt * 1.2, 0, 100);
    }

    const airPenalty = state.metrics.airQuality < 40 ? 0.25 : 0;
    const healthPenalty = resident.healthState === 'critical' ? 0.35 : resident.healthState === 'distressed' ? 0.18 : 0;
    resident.hunger = clamp(resident.hunger - dt * (0.65 + airPenalty), 0, 100);
    resident.energy = clamp(resident.energy - dt * (0.5 + healthPenalty), 0, 100);
    resident.hygiene = clamp(resident.hygiene - dt * (0.4 + healthPenalty * 0.6), 0, 100);
    const localPopulation = nearbyPopulationCount(state, resident.tileIndex, 2);
    const localAura = clamp(securityAuraByTile.get(resident.tileIndex) ?? 0, 0, 1);
    const localSuppression = incidentSuppressionAtTile(securityAuraByTile, resident.tileIndex);
    const crowdStress = clamp((localPopulation - 4) / 8, 0, 1.5);
    const incidentPressure = nearbyIncidentPressure(state, resident.tileIndex);
    const socialRooms = new Set([RoomType.Lounge, RoomType.RecHall, RoomType.Market, RoomType.Cafeteria, RoomType.Cantina, RoomType.Observatory]);
    const inSocialRoom = socialRooms.has(state.rooms[resident.tileIndex]);
    if (inSocialRoom && localPopulation >= 2) {
      resident.social = clamp(resident.social + dt * RESIDENT_SOCIAL_RECOVERY_PER_SEC * clamp(localPopulation / 5, 0.8, 1.6), 0, 100);
    } else if (resident.state === ResidentState.Idle && localPopulation <= 1) {
      resident.social = clamp(resident.social - dt * RESIDENT_SOCIAL_DECAY_PER_SEC * 1.2, 0, 100);
    } else {
      resident.social = clamp(resident.social - dt * RESIDENT_SOCIAL_DECAY_PER_SEC * 0.35, 0, 100);
    }

    const safetyDecay =
      RESIDENT_SAFETY_DECAY_PER_SEC * (0.5 + (1 - localAura) * 0.9) + incidentPressure * 0.28 + crowdStress * 0.45;
    const safetyRecovery =
      RESIDENT_SAFETY_RECOVERY_PER_SEC * (0.4 + localAura * 0.9) * (incidentPressure <= 0.08 ? 1 : 0.25);
    resident.safety = clamp(resident.safety + (safetyRecovery - safetyDecay) * dt, 0, 100);

    const lowNeedCount =
      (resident.hunger < 30 ? 1 : 0) + (resident.energy < 30 ? 1 : 0) + (resident.hygiene < 30 ? 1 : 0);
    const socialDeficit = clamp((58 - resident.social) / 58, 0, 1.5);
    const safetyDeficit = clamp((62 - resident.safety) / 62, 0, 1.5);

    if (lowNeedCount > 0) {
      resident.stress = clamp(resident.stress + dt * (0.75 + lowNeedCount * 0.45), 0, 120);
    } else {
      resident.stress = clamp(resident.stress - dt * 0.45, 0, 120);
    }
    resident.stress = clamp(resident.stress + dt * (socialDeficit * 0.42 + safetyDeficit * 0.8 + crowdStress * 0.28), 0, 120);
    const needsAverage = (resident.hunger + resident.energy + resident.hygiene) / 3;
    const stabilitySignal = (needsAverage - 62) / 38;
    const ratingSignal = (state.metrics.stationRating - 60) / 40;
    const stressPenalty = resident.stress > 85 ? 0.35 : resident.stress > 65 ? 0.18 : 0;
    const satisfactionDelta = clamp(
      stabilitySignal * 0.55 +
        ratingSignal * 0.22 -
        stressPenalty -
        lowNeedCount * 0.14 -
        socialDeficit * 0.16 -
        safetyDeficit * 0.28,
      -1.4,
      0.9
    );
    resident.satisfaction = clamp(resident.satisfaction + satisfactionDelta * dt * 4, 0, 100);
    if (resident.satisfaction < RESIDENT_LEAVE_INTENT_THRESHOLD || resident.stress > 92 || resident.safety < 30) {
      resident.leaveIntent = clamp(resident.leaveIntent + dt * (1.2 + safetyDeficit * 0.7 + socialDeficit * 0.3), 0, 120);
    } else {
      resident.leaveIntent = clamp(resident.leaveIntent - dt * 1.4, 0, 120);
    }
    const agitationTarget = clamp(
      resident.stress * 0.75 +
        (60 - resident.satisfaction) * 0.9 +
        lowNeedCount * 10 +
        (60 - resident.safety) * 0.7 +
        (50 - resident.social) * 0.35 +
        (1 - localSuppression) * 7 +
        (state.metrics.loadPct > 95 ? 8 : 0) +
        (state.zones[resident.tileIndex] === ZoneType.Restricted ? 4 : 0),
      0,
      100
    );
    const agitationBlend = clamp(dt * 0.8, 0, 1);
    resident.agitation = clamp(resident.agitation + (agitationTarget - resident.agitation) * agitationBlend, 0, 100);
    if ((resident.confrontationUntil ?? 0) <= state.now) {
      resident.agitation = clamp(resident.agitation - RESIDENT_AGITATION_DECAY_PER_SEC * dt, 0, 100);
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
    } else if (resident.state === ResidentState.Leisure) {
      resident.actionTimer -= dt;
      resident.social = clamp(resident.social + dt * (RESIDENT_SOCIAL_RECOVERY_PER_SEC * 0.9), 0, 100);
      resident.stress = clamp(resident.stress - dt * 0.8, 0, 120);
      if (resident.actionTimer <= 0) {
        resident.state = ResidentState.Idle;
      }
    } else if (resident.state === ResidentState.ToHomeShip) {
      if (resident.path.length === 0) {
        setResidentPath(state, resident, chooseNearestPath(state, resident.tileIndex, residentHomeDockTargets(state, resident), true, 'resident') ?? []);
      }
      const moveResult = moveAlongPath(state, resident, dt, occupancyByTile);
      if (moveResult === 'blocked') {
        resident.blockedTicks++;
      } else {
        resident.blockedTicks = 0;
      }
      if (state.tiles[resident.tileIndex] === TileType.Dock) {
        unlinkResidentFromShip(state, resident);
        state.usageTotals.residentDepartures += 1;
        state.usageTotals.ratingDelta -= RESIDENT_DEPARTURE_RATING_PENALTY;
        state.usageTotals.ratingFromResidentDeparture += RESIDENT_DEPARTURE_RATING_PENALTY;
        occupancyByTile.set(
          resident.tileIndex,
          Math.max(0, (occupancyByTile.get(resident.tileIndex) ?? 1) - 1)
        );
        continue;
      }
    } else {
      if (resident.state === ResidentState.Idle || resident.path.length === 0) {
        assignResidentTarget(state, resident, securityAuraByTile);
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
        setResidentPath(state, resident, pickQueueSpotPath(state, resident.tileIndex, 'resident'));
      }
      if (resident.blockedTicks >= BLOCKED_LOCAL_REROUTE_TICKS && resident.state === ResidentState.ToCafeteria) {
        const next = pickLeastLoadedCafeteriaPath(state, resident.tileIndex, 'resident');
        setResidentPath(state, resident, next.path);
        resident.reservedTargetTile = next.target;
      }
      if (resident.blockedTicks >= BLOCKED_FULL_REROUTE_TICKS) {
        resident.blockedTicks = 0;
        assignResidentTarget(state, resident, securityAuraByTile);
      }

      if (resident.state === ResidentState.ToCafeteria && state.rooms[resident.tileIndex] === RoomType.Cafeteria) {
        if (
          state.modules[resident.tileIndex] === ModuleType.Table &&
          dinersOnTile(state, resident.tileIndex) < MAX_DINERS_PER_CAF_TILE
        ) {
          resident.state = ResidentState.Eating;
          resident.actionTimer = TASK_TIMINGS.residentEatSec;
          applyResidentCompletedRouteExperience(state, resident);
          setResidentPath(state, resident, []);
          state.usageTotals.meals += 1;
          if (resident.reservedTargetTile !== null && resident.reservedTargetTile !== resident.tileIndex) {
            state.metrics.cafeteriaNonNodeSeatedCount++;
          }
          resident.reservedTargetTile = null;
        } else {
          const next = pickLeastLoadedCafeteriaPath(state, resident.tileIndex, 'resident');
          setResidentPath(state, resident, next.path);
          resident.reservedTargetTile = next.target;
        }
      } else if (resident.state === ResidentState.ToCafeteria && isCafeteriaQueueSpot(state, resident.tileIndex)) {
        const next = pickLeastLoadedCafeteriaPath(state, resident.tileIndex, 'resident');
        setResidentPath(state, resident, next.path);
        resident.reservedTargetTile = next.target;
      } else if (resident.state === ResidentState.ToDorm && state.rooms[resident.tileIndex] === RoomType.Dorm) {
        resident.state = ResidentState.Sleeping;
        resident.actionTimer = TASK_TIMINGS.residentSleepSec;
        applyResidentCompletedRouteExperience(state, resident);
        setResidentPath(state, resident, []);
        state.usageTotals.dorm += 1;
      } else if (resident.state === ResidentState.ToHygiene && state.rooms[resident.tileIndex] === RoomType.Hygiene) {
        resident.state = ResidentState.Cleaning;
        resident.actionTimer = TASK_TIMINGS.residentCleanSec;
        applyResidentCompletedRouteExperience(state, resident);
        setResidentPath(state, resident, []);
        state.usageTotals.hygiene += 1;
      } else if (
        resident.state === ResidentState.ToLeisure &&
        (state.rooms[resident.tileIndex] === RoomType.Lounge ||
          state.rooms[resident.tileIndex] === RoomType.RecHall ||
          state.rooms[resident.tileIndex] === RoomType.Market ||
          state.rooms[resident.tileIndex] === RoomType.Cafeteria)
      ) {
        resident.state = ResidentState.Leisure;
        resident.actionTimer = TASK_TIMINGS.visitorLeisureBaseSec.lounger * (0.55 + state.rng() * 0.35);
        applyResidentCompletedRouteExperience(state, resident);
        setResidentPath(state, resident, []);
      } else if (
        resident.state === ResidentState.ToSecurity &&
        (state.rooms[resident.tileIndex] === RoomType.Security || (securityAuraByTile.get(resident.tileIndex) ?? 0) >= 0.5)
      ) {
        resident.state = ResidentState.Idle;
        setResidentPath(state, resident, []);
        resident.retargetAt = state.now + 2 + state.rng() * 3;
      } else if (
        (resident.state === ResidentState.ToCafeteria ||
          resident.state === ResidentState.ToDorm ||
          resident.state === ResidentState.ToHygiene ||
          resident.state === ResidentState.ToLeisure ||
          resident.state === ResidentState.ToSecurity) &&
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
      resident.agitation = clamp((resident.agitation ?? 0) + 12, 0, 100);
    }
    if (resident.satisfaction >= 72 && resident.leaveIntent < 2) {
      const bonus = RESIDENT_RETENTION_RATING_BONUS_PER_SEC * dt;
      state.usageTotals.ratingDelta += bonus;
      state.usageTotals.ratingFromResidentRetention += bonus;
      state.usageTotals.ratingFromVisitorSuccessByReason.residentRetention += bonus;
    }
    keep.push(resident);
  }
  state.residents = keep;
}

function activeResidentRoleCounts(state: StationState): Record<ResidentRole, number> {
  const counts: Record<ResidentRole, number> = {
    none: 0,
    market_helper: 0,
    hydro_assist: 0,
    civic_watch: 0
  };
  for (const resident of state.residents) {
    if (resident.state !== ResidentState.Leisure || resident.routinePhase !== 'work') continue;
    const room = state.rooms[resident.tileIndex];
    if (resident.role === 'market_helper' && (room === RoomType.Market || room === RoomType.RecHall)) {
      counts.market_helper += 1;
    } else if (resident.role === 'hydro_assist' && (room === RoomType.Hydroponics || room === RoomType.Kitchen)) {
      counts.hydro_assist += 1;
    } else if (resident.role === 'civic_watch' && (room === RoomType.Security || room === RoomType.Brig)) {
      counts.civic_watch += 1;
    } else {
      counts.none += 1;
    }
  }
  return counts;
}

function updateResources(state: StationState, dt: number): void {
  const roleWorkers = activeResidentRoleCounts(state);
  const leakPenalty = state.metrics.leakingTiles * 0.03;
  const powerRatio = clamp(state.metrics.powerSupply / Math.max(1, state.metrics.powerDemand), 0.35, 1);
  const hydroAssistMultiplier =
    1 + Math.min(0.4, roleWorkers.hydro_assist * (RESIDENT_WORK_BONUS.hydroOutputMultiplier - 1) * 0.28);
  const hydroRate = state.ops.hydroponicsActive * 1.25 * powerRatio * hydroAssistMultiplier;
  const growTargets = collectServiceTargets(state, RoomType.Hydroponics);
  const stoveTargets = collectServiceTargets(state, RoomType.Kitchen);
  const workshopTargets = collectServiceTargets(state, RoomType.Workshop);
  const servingTargets = collectServingTargets(state);
  const residentMealUsePerSec = state.residents.length * 0.11;
  const visitorMealUsePerSec = state.visitors.length * 0.04;
  const crewMealUsePerSec = state.crewMembers.length * 0.06;
  const mealUseRate = residentMealUsePerSec + visitorMealUsePerSec + crewMealUsePerSec;

  let hydroProduced = 0;
  if (growTargets.length > 0) {
    let remaining = hydroRate * dt;
    for (const tileIndex of growTargets) {
      if (remaining <= 0) break;
      const added = addItemStockAtNode(state, tileIndex, 'rawMeal', remaining);
      hydroProduced += added;
      remaining -= added;
    }
  }

  let kitchenMealProd = 0;
  const kitchenPerNodeProd = KITCHEN_CONVERSION_RATE * powerRatio * dt;
  for (const tileIndex of stoveTargets) {
    const availableRaw = itemStockAtNode(state, tileIndex, 'rawMeal');
    if (availableRaw <= 0) continue;
    const produced = Math.min(availableRaw, kitchenPerNodeProd);
    if (produced <= 0) continue;
    takeItemStockAtNode(state, tileIndex, 'rawMeal', produced);
    const added = addItemStockAtNode(state, tileIndex, 'meal', produced);
    kitchenMealProd += added;
  }

  const marketTradeGoodStock = sumItemStockForRoom(state, RoomType.Market, 'tradeGood');
  let workshopProduced = 0;
  if (workshopTargets.length > 0 && marketTradeGoodStock < MARKET_TRADE_GOOD_TARGET_STOCK * 1.45) {
    const nodeProdCap = WORKSHOP_TRADE_GOOD_RATE * powerRatio * dt;
    for (const tileIndex of workshopTargets) {
      const rawMaterialAtNode = itemStockAtNode(state, tileIndex, 'rawMaterial');
      if (rawMaterialAtNode <= 0) continue;
      const producibleBySupply = rawMaterialAtNode / WORKSHOP_MATERIALS_PER_TRADE_GOOD;
      const producible = Math.min(nodeProdCap, producibleBySupply);
      if (producible <= 0) continue;
      const rawConsumed = producible * WORKSHOP_MATERIALS_PER_TRADE_GOOD;
      takeItemStockAtNode(state, tileIndex, 'rawMaterial', rawConsumed);
      const added = addItemStockAtNode(state, tileIndex, 'tradeGood', producible);
      workshopProduced += added;
    }
  }

  const rawMealAtGrow = growTargets.reduce((acc, tile) => acc + itemStockAtNode(state, tile, 'rawMeal'), 0);
  const rawMealAtStove = stoveTargets.reduce((acc, tile) => acc + itemStockAtNode(state, tile, 'rawMeal'), 0);
  const mealAtStove = stoveTargets.reduce((acc, tile) => acc + itemStockAtNode(state, tile, 'meal'), 0);
  const mealAtServing = servingTargets.reduce((acc, tile) => acc + itemStockAtNode(state, tile, 'meal'), 0);
  let logisticsRawMaterial = sumItemStockForRoom(state, RoomType.LogisticsStock, 'rawMaterial');
  let storageRawMaterial = sumItemStockForRoom(state, RoomType.Storage, 'rawMaterial');
  state.metrics.rawFoodStock = clamp(rawMealAtGrow + rawMealAtStove, 0, 260);
  state.metrics.kitchenRawBuffer = clamp(rawMealAtStove, 0, 260);
  state.metrics.mealStock = clamp(mealAtStove + mealAtServing, 0, 260);
  const inventoryTiles = materialInventoryTiles(state);
  if (inventoryTiles.length > 0 && state.legacyMaterialStock > 0.01) {
    const migrated = addItemAcrossTargets(
      state,
      inventoryTiles,
      'rawMaterial',
      state.legacyMaterialStock,
      state.core.serviceTile
    );
    if (migrated > 0) {
      state.legacyMaterialStock = Math.max(0, state.legacyMaterialStock - migrated);
      logisticsRawMaterial = sumItemStockForRoom(state, RoomType.LogisticsStock, 'rawMaterial');
      storageRawMaterial = sumItemStockForRoom(state, RoomType.Storage, 'rawMaterial');
    }
  }
  state.metrics.materials = Math.max(0, state.legacyMaterialStock + logisticsRawMaterial + storageRawMaterial);

  const lifeSupportMaintenanceMultiplier = maintenanceOutputMultiplierForSystem(state, 'life-support');
  state.metrics.waterStock = clamp(
    state.metrics.waterStock +
      state.ops.lifeSupportActive * 0.72 * powerRatio * lifeSupportMaintenanceMultiplier * dt -
      (state.residents.length * 0.04 + state.crewMembers.length * 0.03) * dt,
    0,
    260
  );

  const airDemand = state.residents.length * 0.12 + state.visitors.length * 0.05 + state.crewMembers.length * 0.08;
  const lifeSupportPotentialTiles = collectRooms(state, RoomType.LifeSupport).length;
  const lifeSupportActiveClusters = operationalClustersForRoom(state, RoomType.LifeSupport, CREW_PER_LIFE_SUPPORT, false);
  const lifeSupportPotentialAirPerSec = lifeSupportPotentialTiles * LIFE_SUPPORT_AIR_PER_TILE;
  const lifeSupportActiveAirPerSec = lifeSupportActiveClusters.reduce((acc, cluster) => {
    const anchor = clusterAnchor(cluster);
    const multiplier = maintenanceOutputMultiplierFromDebt(maintenanceDebtFor(state, 'life-support', anchor));
    return acc + cluster.length * LIFE_SUPPORT_AIR_PER_TILE * powerRatio * multiplier;
  }, 0);
  const airSupply = lifeSupportActiveAirPerSec + (state.metrics.pressurizationPct / 100) * PASSIVE_AIR_PER_SEC_AT_100_PRESSURE;
  const airDeltaPerSec = (airSupply - airDemand) * 1.7 - leakPenalty * 1.2;
  state.metrics.lifeSupportPotentialAirPerSec = lifeSupportPotentialAirPerSec;
  state.metrics.lifeSupportActiveAirPerSec = lifeSupportActiveAirPerSec;
  state.metrics.airTrendPerSec = airDeltaPerSec;
  state.metrics.airQuality = clamp(state.metrics.airQuality + (airSupply - airDemand) * dt * 1.7, 0, 100);
  if (leakPenalty > 0) {
    state.metrics.airQuality = clamp(state.metrics.airQuality - leakPenalty * dt * 1.2, 0, 100);
  }
  // Local air: each tile's quality is the global average shaped by life-support
  // coverage distance, fire proximity, and pressurization. Read by exposure
  // checks so a sealed wing or burning room becomes locally lethal.
  updateLocalAirQuality(state, dt);

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
  const civicWatchMultiplier =
    1 / (1 + Math.min(0.35, roleWorkers.civic_watch * (RESIDENT_WORK_BONUS.securitySuppressionMultiplier - 1) * 0.35));
  const securityFactor = (state.ops.securityActive > 0 ? 0.35 : 1) * civicWatchMultiplier;
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
  const instantWorkshopRate = dt > 0 ? workshopProduced / dt : 0;
  state.metrics.workshopTradeGoodProdRate =
    state.metrics.workshopTradeGoodProdRate * 0.8 + instantWorkshopRate * 0.2;
  state.metrics.marketTradeGoodStock = sumItemStockForRoom(state, RoomType.Market, 'tradeGood');
  state.metrics.marketTradeGoodUseRate = 0;
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

function applyResidentTaxes(state: StationState): void {
  if (state.now - state.lastResidentTaxAt < RESIDENT_TAX_PERIOD) return;
  state.lastResidentTaxAt = state.now;
  if (state.residents.length <= 0) return;
  const avgSatisfaction = state.residents.reduce((acc, r) => acc + r.satisfaction, 0) / Math.max(1, state.residents.length);
  const taxableResidents = state.residents.filter((r) => r.leaveIntent < RESIDENT_LEAVE_INTENT_TRIGGER).length;
  const multiplier = clamp(avgSatisfaction / 72, 0.45, 1.35);
  const collected = taxableResidents * RESIDENT_TAX_PER_HEAD * multiplier;
  if (collected <= 0) return;
  state.metrics.credits += collected;
  state.metrics.creditsEarnedLifetime += collected;
  state.usageTotals.residentTaxesCollected += collected;
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
    RoomType.Workshop,
    RoomType.Clinic,
    RoomType.Brig,
    RoomType.RecHall,
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
  const residentSocialAvg =
    residentsCount > 0 ? state.residents.reduce((acc, resident) => acc + resident.social, 0) / residentsCount : 0;
  const residentSafetyAvg =
    residentsCount > 0 ? state.residents.reduce((acc, resident) => acc + resident.safety, 0) / residentsCount : 0;
  const residentHungerAvg =
    residentsCount > 0 ? state.residents.reduce((acc, resident) => acc + resident.hunger, 0) / residentsCount : 0;
  const residentEnergyAvg =
    residentsCount > 0 ? state.residents.reduce((acc, resident) => acc + resident.energy, 0) / residentsCount : 0;
  const residentHygieneAvg =
    residentsCount > 0 ? state.residents.reduce((acc, resident) => acc + resident.hygiene, 0) / residentsCount : 0;
  let secureTiles = 0;
  let securableTiles = 0;
  for (let i = 0; i < state.tiles.length; i++) {
    if (!isWalkable(state.tiles[i])) continue;
    if (state.tiles[i] === TileType.Space || state.tiles[i] === TileType.Wall) continue;
    securableTiles += 1;
    if ((state.effects.securityAuraByTile.get(i) ?? 0) >= 0.2) secureTiles += 1;
  }
  const securityCoveragePct = securableTiles > 0 ? (secureTiles / securableTiles) * 100 : 0;

  const reactorMaintenanceMultiplier = maintenanceOutputMultiplierForSystem(state, 'reactor');
  const powerSupply = BASE_POWER_SUPPLY + state.ops.reactorsActive * POWER_PER_REACTOR * reactorMaintenanceMultiplier;
  const powerDemand =
    9 +
    visitorsCount * 0.35 +
    residentsCount * 0.52 +
    state.ops.cafeteriasActive * 1.3 +
    state.ops.kitchenActive * 1.2 +
    state.ops.workshopActive * 1.15 +
    state.ops.clinicActive * 1.1 +
    state.ops.brigActive * 1.05 +
    state.ops.recHallActive * 1.0 +
    state.ops.securityActive * 1.2 +
    state.ops.hygieneActive * 1.0 +
    state.ops.hydroponicsActive * 1.1 +
    state.ops.lifeSupportActive * 1.4 +
    state.ops.loungeActive * 1.0 +
    state.ops.marketActive * 1.1 +
    state.ops.cantinaActive * 1.0 +
    state.ops.observatoryActive * 0.9;

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
    state.ops.workshopActive * 10 +
    state.ops.clinicActive * 7 +
    state.ops.brigActive * 6 +
    state.ops.recHallActive * 8 +
    state.ops.securityActive * 10 +
    state.ops.reactorsActive * 14 +
    state.ops.lifeSupportActive * 10 +
    state.ops.dormsActive * 4 +
    state.ops.loungeActive * 7 +
    state.ops.marketActive * 8 +
    state.ops.cantinaActive * 7 +
    state.ops.observatoryActive * 6;

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
  const visitorBerths = bays.filter((d) => d.purpose === 'visitor');
  const residentialBerths = bays.filter((d) => d.purpose === 'residential');
  const roomBerths = listBerthCandidates(state);
  const residentPrivateBedsTotal = privateHousingUnits(state).length;
  const dockedShips = state.arrivingShips.filter((s) => s.stage === 'docked').length;
  const residentShipsDocked = state.arrivingShips.filter((s) => s.kind === 'resident_home' && s.stage === 'docked').length;
  const bayCapacityTotal = bays.length + roomBerths.length;
  const bayUtilizationPct = bayCapacityTotal > 0 ? (dockedShips / bayCapacityTotal) * 100 : 0;
  const averageDockTime =
    state.dockedShipsCompleted > 0 ? state.dockedTimeTotal / state.dockedShipsCompleted : 0;
  state.recentExitTimes = state.recentExitTimes.filter((t) => state.now - t <= 60);
  const exitsPerMin = state.recentExitTimes.length;
  const openIncidents = state.incidents.filter((incident) => isIncidentActive(incident)).length;
  const resolvedIncidents = state.usageTotals.securityResolved;
  const failedIncidents = state.usageTotals.incidentsFailed;
  const confrontingResidents = state.residents.filter((resident) => residentConfrontationActive(state, resident)).length;
  const avgSecurityResponseSec =
    state.usageTotals.securityResolved > 0
      ? state.usageTotals.securityResponseSecTotal / state.usageTotals.securityResolved
      : 0;
  const immediateDefuseRate =
    state.usageTotals.securityFightInterventions > 0
      ? state.usageTotals.securityImmediateDefuses / state.usageTotals.securityFightInterventions
      : 0;
  const escalatedFightRate =
    state.usageTotals.securityFightInterventions > 0
      ? state.usageTotals.securityEscalatedFights / state.usageTotals.securityFightInterventions
      : 0;
  const incidentSuppressionAvg =
    state.usageTotals.incidentSuppressionSampleCount > 0
      ? state.usageTotals.incidentSuppressionSampleSum / state.usageTotals.incidentSuppressionSampleCount
      : 1;

  state.metrics.visitorsCount = visitorsCount;
  state.metrics.residentsCount = residentsCount;
  state.metrics.incidentsOpen = openIncidents;
  state.metrics.incidentsResolved = resolvedIncidents;
  // Note: incidentsResolvedLifetime is NOT mirrored here — the
  // scan-based `resolvedIncidents` drops as state.incidents prunes old
  // resolved records past INCIDENT_RESOLVED_RETENTION_SEC, breaking
  // monotonicity. It's incremented at the resolve event in
  // resolveIncident() instead.
  state.metrics.incidentsFailed = failedIncidents;
  // Derive lifetime-monotonic archetypes-seen count from the boolean
  // record in usageTotals. O(4) constant — cheap to run every metrics pass.
  state.metrics.archetypesServedLifetime = Object.values(
    state.usageTotals.archetypesEverSeen,
  ).filter(Boolean).length;
  state.metrics.securityDispatches = state.usageTotals.securityDispatches;
  state.metrics.securityResponseAvgSec = avgSecurityResponseSec;
  state.metrics.residentConfrontations = confrontingResidents;
  state.metrics.securityCoveragePct = securityCoveragePct;
  state.metrics.incidentSuppressionAvg = incidentSuppressionAvg;
  state.metrics.immediateDefuseRate = immediateDefuseRate;
  state.metrics.escalatedFightRate = escalatedFightRate;
  state.metrics.residentSocialAvg = residentSocialAvg;
  state.metrics.residentSafetyAvg = residentSafetyAvg;
  state.metrics.residentHungerAvg = residentHungerAvg;
  state.metrics.residentEnergyAvg = residentEnergyAvg;
  state.metrics.residentHygieneAvg = residentHygieneAvg;
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
  state.metrics.visitorBerthsTotal = visitorBerths.length + roomBerths.length;
  state.metrics.visitorBerthsOccupied =
    visitorBerths.filter((d) => d.occupiedByShipId !== null).length +
    roomBerths.filter((b) => b.occupiedByShipId !== null).length;
  state.metrics.residentBerthsTotal = residentialBerths.length;
  state.metrics.residentBerthsOccupied = residentialBerths.filter((d) => d.occupiedByShipId !== null).length;
  state.metrics.residentShipsDocked = residentShipsDocked;
  state.metrics.residentPrivateBedsTotal = residentPrivateBedsTotal;
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
  state.metrics.marketTradeGoodStock = sumItemStockForRoom(state, RoomType.Market, 'tradeGood');
  state.metrics.visitorsByArchetype = visitorsByArchetype;
  state.metrics.distressedResidents = distressedResidents;
  state.metrics.criticalResidents = criticalResidents;
  state.metrics.residentSatisfactionAvg =
    state.residents.length > 0
      ? state.residents.reduce((acc, resident) => acc + resident.satisfaction, 0) / state.residents.length
      : 0;
  const visitorEnvironment = averageRoomEnvironmentForRooms(state, [
    RoomType.Cafeteria,
    RoomType.Lounge,
    RoomType.Market,
    RoomType.RecHall,
    RoomType.Cantina,
    RoomType.Observatory
  ]);
  const residentEnvironment = averageRoomEnvironmentForRooms(state, [
    RoomType.Dorm,
    RoomType.Hygiene,
    RoomType.Cafeteria,
    RoomType.Lounge,
    RoomType.RecHall,
    RoomType.Cantina,
    RoomType.Observatory
  ]);
  const dormEnvironment = averageRoomEnvironmentForRooms(state, [RoomType.Dorm]);
  state.metrics.visitorStatusAvg = visitorEnvironment.visitorStatus;
  state.metrics.residentComfortAvg = residentEnvironment.residentialComfort;
  state.metrics.serviceNoiseNearDorms = dormEnvironment.serviceNoise;
  const maintenanceDebtTotal = state.maintenanceDebts.reduce((acc, debt) => acc + debt.debt, 0);
  state.metrics.maintenanceDebtAvg =
    state.maintenanceDebts.length > 0 ? maintenanceDebtTotal / state.maintenanceDebts.length : 0;
  state.metrics.maintenanceDebtMax = state.maintenanceDebts.reduce((max, debt) => Math.max(max, debt.debt), 0);
  state.metrics.maintenanceJobsOpen = state.maintenanceDebts.filter((debt) => debt.debt >= MAINTENANCE_DEBT_WARNING).length;
  state.recentDeathTimes = state.recentDeathTimes.filter((t) => state.now - t <= 60);
  state.metrics.recentDeaths = state.recentDeathTimes.length;
  const crewRestingInDorm = state.crewMembers.filter((c) => c.resting && state.rooms[c.tileIndex] === RoomType.Dorm).length;
  const crewToDorm = state.crewMembers.filter((c) => c.resting && state.rooms[c.tileIndex] !== RoomType.Dorm).length;
  const crewCleaning = state.crewMembers.filter((c) => c.cleaning).length;
  state.metrics.dormSleepingResidents = state.residents.filter((r) => r.state === ResidentState.Sleeping).length + crewRestingInDorm;
  state.metrics.toDormResidents = state.residents.filter((r) => r.state === ResidentState.ToDorm).length + crewToDorm;
  state.metrics.hygieneCleaningResidents = state.residents.filter((r) => r.state === ResidentState.Cleaning).length + crewCleaning;
  state.metrics.crewCleaning = crewCleaning;
  state.metrics.crewSelfCare = crewRestingInDorm + crewToDorm + crewCleaning;
  state.metrics.crewAvgEnergy = avgCrewEnergy;
  state.metrics.crewAvgHygiene = avgCrewHygiene;
  state.metrics.cafeteriaQueueingCount =
    state.visitors.filter((v) => v.state === VisitorState.Queueing || v.state === VisitorState.ToCafeteria).length +
    state.residents.filter((r) => r.state === ResidentState.ToCafeteria).length;
  state.metrics.cafeteriaEatingCount =
    state.visitors.filter((v) => v.state === VisitorState.Eating).length +
    state.residents.filter((r) => r.state === ResidentState.Eating).length;
  state.metrics.hydroponicsActiveGrowNodes = activeRoomTargets(state, RoomType.Hydroponics).length;
  state.metrics.lifeSupportActiveNodes = activeRoomTargets(state, RoomType.LifeSupport).length;
  const lifeSupportCoverage = computeLifeSupportCoverage(state);
  state.metrics.lifeSupportCoveragePct = lifeSupportCoverage.coveragePct;
  state.metrics.avgLifeSupportDistance = lifeSupportCoverage.avgDistance;
  state.metrics.poorLifeSupportTiles = lifeSupportCoverage.poorTiles;
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
    if (crew.resting) {
      crewResting += 1;
      idleCrewByReason.idle_resting += 1;
      continue;
    }
    if (crew.activeJobId !== null) {
      crewOnLogisticsJobs += 1;
      continue;
    }
    if (crew.role !== 'idle') {
      crewAssignedWorking += 1;
      continue;
    }
    if (crew.idleReason === 'idle_no_path') crewBlockedNoPath += 1;
    if (crew.idleReason === 'idle_available' || crew.idleReason === 'idle_no_jobs') {
      crewIdleAvailable += 1;
    }
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
  const grossCredits = state.usageTotals.creditsMarketGross + state.usageTotals.creditsMealPayoutGross + state.usageTotals.residentTaxesCollected;
  const payrollCredits = state.usageTotals.payrollPaid;
  state.metrics.creditsGrossPerMin = grossCredits / runMinutes;
  state.metrics.creditsPayrollPerMin = payrollCredits / runMinutes;
  state.metrics.creditsNetPerMin = (grossCredits - payrollCredits) / runMinutes;
  state.metrics.tradeGoodsSoldPerMin = state.usageTotals.tradeGoodsSold / runMinutes;
  state.metrics.marketStockoutsPerMin = state.usageTotals.marketStockouts / runMinutes;
  state.metrics.crewRetargetsPerMin = state.usageTotals.crewRetargets / runMinutes;
  state.metrics.criticalStaffDropsPerMin = state.usageTotals.criticalStaffDrops / runMinutes;
  state.metrics.visitorServiceFailuresPerMin = state.usageTotals.visitorServiceFailures / runMinutes;
  const destinationTotal = Math.max(
    1,
    state.usageTotals.visitorLeisureEntries.cafeteria +
      state.usageTotals.visitorLeisureEntries.market +
      state.usageTotals.visitorLeisureEntries.lounge +
      state.usageTotals.visitorLeisureEntries.recHall +
      state.usageTotals.visitorLeisureEntries.cantina +
      state.usageTotals.visitorLeisureEntries.observatory +
      state.usageTotals.visitorLeisureEntries.hygiene +
      state.usageTotals.visitorLeisureEntries.vending
  );
  state.metrics.visitorDestinationShares = {
    cafeteria: state.usageTotals.visitorLeisureEntries.cafeteria / destinationTotal,
    market: state.usageTotals.visitorLeisureEntries.market / destinationTotal,
    lounge: state.usageTotals.visitorLeisureEntries.lounge / destinationTotal,
    recHall: state.usageTotals.visitorLeisureEntries.recHall / destinationTotal,
    cantina: state.usageTotals.visitorLeisureEntries.cantina / destinationTotal,
    observatory: state.usageTotals.visitorLeisureEntries.observatory / destinationTotal,
    hygiene: state.usageTotals.visitorLeisureEntries.hygiene / destinationTotal,
    vending: state.usageTotals.visitorLeisureEntries.vending / destinationTotal
  };
  state.metrics.shipsByTypePerMin = {
    tourist: state.usageTotals.shipsByType.tourist / runMinutes,
    trader: state.usageTotals.shipsByType.trader / runMinutes,
    industrial: state.usageTotals.shipsByType.industrial / runMinutes,
    military: state.usageTotals.shipsByType.military / runMinutes,
    colonist: state.usageTotals.shipsByType.colonist / runMinutes
  };
  state.metrics.residentTaxPerMin = state.usageTotals.residentTaxesCollected / runMinutes;
  state.metrics.residentTaxCollectedTotal = state.usageTotals.residentTaxesCollected;
  state.metrics.residentConversionAttempts = state.usageTotals.residentConversionAttempts;
  state.metrics.residentConversionSuccesses = state.usageTotals.residentConversionSuccesses;
  state.metrics.residentDepartures = state.usageTotals.residentDepartures;
  state.metrics.avgVisitorWalkDistance =
    state.usageTotals.visitorWalkTrips > 0
      ? state.usageTotals.visitorWalkDistance / state.usageTotals.visitorWalkTrips
      : 0;
  state.metrics.visitorServiceExposurePenaltyPerMin = state.usageTotals.visitorServiceExposurePenalty / runMinutes;
  state.metrics.residentBadRouteStressPerMin = state.usageTotals.residentBadRouteStress / runMinutes;
  state.metrics.crewPublicInterferencePerMin = state.usageTotals.crewPublicInterference / runMinutes;
  state.metrics.visitorEnvironmentPenaltyPerMin = state.usageTotals.visitorEnvironmentPenalty / runMinutes;
  state.metrics.residentEnvironmentStressPerMin = state.usageTotals.residentEnvironmentStress / runMinutes;
  state.metrics.maintenanceJobsResolvedPerMin = state.usageTotals.maintenanceJobsResolved / runMinutes;
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
  const serviceReachability = collectServiceNodeReachability(state);
  state.metrics.serviceNodesTotal = serviceReachability.nodeTiles.length;
  state.metrics.serviceNodesUnreachable = serviceReachability.unreachableNodeTiles.length;
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
  if (state.metrics.lifeSupportCoveragePct < 75 && state.ops.lifeSupportActive > 0) {
    roomWarnings.unshift('life-support coverage: disconnected wing');
  } else if (state.metrics.poorLifeSupportTiles > 0 && state.ops.lifeSupportActive > 0) {
    roomWarnings.unshift('life-support coverage: distant rooms');
  }
  if (state.metrics.visitorServiceExposurePenaltyPerMin > 0.02) {
    roomWarnings.unshift('layout friction: visitors see back-of-house routes');
  }
  if (state.metrics.residentBadRouteStressPerMin > 0.2) {
    roomWarnings.unshift('layout friction: residents cross service spaces');
  }
  if (state.metrics.crewPublicInterferencePerMin > 2) {
    roomWarnings.unshift('layout friction: logistics crosses public areas');
  }
  if (state.metrics.visitorStatusAvg < -0.35 || state.metrics.visitorEnvironmentPenaltyPerMin > 0.02) {
    roomWarnings.unshift('layout status: public rooms feel industrial');
  }
  if (state.metrics.residentComfortAvg < -0.15 || state.metrics.residentEnvironmentStressPerMin > 0.15) {
    roomWarnings.unshift('layout comfort: residents near service rooms');
  }
  if (state.metrics.serviceNoiseNearDorms > 0.9) {
    roomWarnings.unshift('layout noise: dorms near loud systems');
  }
  if (state.metrics.maintenanceDebtMax >= MAINTENANCE_DEBT_SEVERE) {
    roomWarnings.unshift('maintenance critical: utility output degraded');
  } else if (state.metrics.maintenanceJobsOpen > 0) {
    roomWarnings.unshift('maintenance needed: reactor/life-support debt rising');
  }
  if (state.ops.marketTotal > 0) {
    if (state.ops.marketActive <= 0) {
      roomWarnings.unshift('trade chain blocked: market inactive');
    } else if (state.ops.workshopTotal > 0 && state.ops.workshopActive <= 0) {
      roomWarnings.unshift('trade chain blocked: workshop inactive');
    } else if (state.metrics.marketStockoutsPerMin > 0.25) {
      roomWarnings.unshift('trade chain strained: market stockouts');
    }
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
  state.metrics.roomWarningsCount = roomWarnings.length;

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
    { label: 'long walks', value: state.usageTotals.ratingFromWalkDissatisfaction },
    { label: 'bad routes', value: state.usageTotals.ratingFromRouteExposure },
    { label: 'bad environment', value: state.usageTotals.ratingFromEnvironment },
    { label: 'resident departures', value: state.usageTotals.ratingFromResidentDeparture }
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
    longWalks: state.usageTotals.ratingFromWalkDissatisfaction,
    routeExposure: state.usageTotals.ratingFromRouteExposure,
    environment: state.usageTotals.ratingFromEnvironment
  };
  state.metrics.stationRatingPenaltyPerMin = {
    queueTimeout: state.usageTotals.ratingFromShipTimeout / runMinutes,
    noEligibleDock: state.usageTotals.ratingFromShipSkip / runMinutes,
    serviceFailure: state.usageTotals.ratingFromVisitorFailure / runMinutes,
    longWalks: state.usageTotals.ratingFromWalkDissatisfaction / runMinutes,
    routeExposure: state.usageTotals.ratingFromRouteExposure / runMinutes,
    environment: state.usageTotals.ratingFromEnvironment / runMinutes
  };
  state.metrics.stationRatingBonusTotal = {
    mealService: state.usageTotals.ratingFromVisitorSuccessByReason.mealService,
    leisureService: state.usageTotals.ratingFromVisitorSuccessByReason.leisureService,
    successfulExit: state.usageTotals.ratingFromVisitorSuccessByReason.successfulExit,
    residentRetention: state.usageTotals.ratingFromVisitorSuccessByReason.residentRetention
  };
  state.metrics.stationRatingBonusPerMin = {
    mealService: state.usageTotals.ratingFromVisitorSuccessByReason.mealService / runMinutes,
    leisureService: state.usageTotals.ratingFromVisitorSuccessByReason.leisureService / runMinutes,
    successfulExit: state.usageTotals.ratingFromVisitorSuccessByReason.successfulExit / runMinutes,
    residentRetention: state.usageTotals.ratingFromVisitorSuccessByReason.residentRetention / runMinutes
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
  for (const [idx, until] of state.effects.trespassCooldownUntilByTile.entries()) {
    if (until <= state.now) {
      state.effects.trespassCooldownUntilByTile.delete(idx);
    }
  }
}

export function createInitialState(options?: { seed?: number }): StationState {
  const seed = options?.seed ?? 1337;
  const rng = makeRng(seed);
  // Roll the system map from a sub-seed so it doesn't deplete the
  // primary rng (which scenario builders + manifest gen rely on).
  const system = generateSystemMap(seed);
  const tiles = new Array<TileType>(GRID_WIDTH * GRID_HEIGHT).fill(TileType.Space);
  const zones = new Array<ZoneType>(GRID_WIDTH * GRID_HEIGHT).fill(ZoneType.Public);
  const rooms = new Array<RoomType>(GRID_WIDTH * GRID_HEIGHT).fill(RoomType.None);
  const roomHousingPolicies = new Array<HousingPolicy>(GRID_WIDTH * GRID_HEIGHT).fill('visitor');
  const modules = new Array<ModuleType>(GRID_WIDTH * GRID_HEIGHT).fill(ModuleType.None);
  const moduleOccupancyByTile = new Array<number | null>(GRID_WIDTH * GRID_HEIGHT).fill(null);
  const coreX = Math.floor(GRID_WIDTH / 2);
  const coreY = Math.floor(GRID_HEIGHT / 2);
  const starterFloorMinX = coreX - 5;
  const starterFloorMaxX = coreX + 4;
  const starterFloorMinY = coreY - 6;
  const starterFloorMaxY = coreY + 3;
  const starterWallMinX = starterFloorMinX - 1;
  const starterWallMaxX = starterFloorMaxX + 1;
  const starterWallMinY = starterFloorMinY - 1;
  const starterWallMaxY = starterFloorMaxY + 1;

  for (let y = starterFloorMinY; y <= starterFloorMaxY; y++) {
    for (let x = starterFloorMinX; x <= starterFloorMaxX; x++) {
      tiles[toIndex(x, y, GRID_WIDTH)] = TileType.Floor;
    }
  }
  for (let y = starterWallMinY; y <= starterWallMaxY; y++) {
    tiles[toIndex(starterWallMinX, y, GRID_WIDTH)] = TileType.Wall;
    tiles[toIndex(starterWallMaxX, y, GRID_WIDTH)] = TileType.Wall;
  }
  for (let x = starterWallMinX; x <= starterWallMaxX; x++) {
    tiles[toIndex(x, starterWallMinY, GRID_WIDTH)] = TileType.Wall;
    tiles[toIndex(x, starterWallMaxY, GRID_WIDTH)] = TileType.Wall;
  }

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
  const laneProfiles = generateLaneProfiles({ rng, system } as StationState);

  return {
    width: GRID_WIDTH,
    height: GRID_HEIGHT,
    tiles,
    zones,
    rooms,
    roomHousingPolicies,
    modules,
    moduleInstances: [],
    moduleOccupancyByTile,
    core: {
      centerTile: toIndex(coreX, coreY, GRID_WIDTH),
      serviceTile: toIndex(coreX, coreY, GRID_WIDTH),
      frameTiles
    },
    docks: [],
    system,
    seedAtCreation: seed,
    laneProfiles,
    dockQueue: [],
    pressurized: new Array<boolean>(GRID_WIDTH * GRID_HEIGHT).fill(false),
    airQualityByTile: new Float32Array(GRID_WIDTH * GRID_HEIGHT).fill(100),
    pathOccupancyByTile: new Map(),
    jobs: [],
    itemNodes: [],
    legacyMaterialStock: 420,
    incidents: [],
    visitors: [],
    residents: [],
    crewMembers: [],
    maintenanceDebts: [],
    arrivingShips: [],
    pendingSpawns: [],
    metrics: {
      tickMs: 0,
      renderMs: 0,
      pathMs: 0,
      pathCallsPerTick: 0,
      derivedRecomputeMs: 0,
      visitorsCount: 0,
      residentsCount: 0,
      incidentsTotal: 0,
      incidentsOpen: 0,
      incidentsResolved: 0,
      incidentsFailed: 0,
      securityDispatches: 0,
      securityResponseAvgSec: 0,
      residentConfrontations: 0,
      securityCoveragePct: 0,
      incidentSuppressionAvg: 1,
      immediateDefuseRate: 0,
      escalatedFightRate: 0,
      residentSocialAvg: 0,
      residentSafetyAvg: 0,
      residentHungerAvg: 0,
      residentEnergyAvg: 0,
      residentHygieneAvg: 0,
      load: 0,
      capacity: 0,
      loadPct: 0,
      powerSupply: 0,
      powerDemand: 0,
      morale: 80,
      stationRating: STATION_RATING_START,
      stationRatingTrendPerMin: 0,
      unlockTier: 0,
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
      workshopTradeGoodProdRate: 0,
      marketTradeGoodUseRate: 0,
      marketTradeGoodStock: 0,
      mealUseRate: 0,
      dockedShips: 0,
      visitorBerthsTotal: 0,
      visitorBerthsOccupied: 0,
      residentBerthsTotal: 0,
      residentBerthsOccupied: 0,
      residentShipsDocked: 0,
      residentPrivateBedsTotal: 0,
      averageDockTime: 0,
      bayUtilizationPct: 0,
      exitsPerMin: 0,
      shipsSkippedNoEligibleDock: 0,
      shipsTimedOutInQueue: 0,
      shipsQueuedNoCapabilityCount: 0,
      shipsQueuedNoCapabilityHint: '',
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
      creditsEarnedLifetime: 0,
      archetypesServedLifetime: 0,
      tradeCyclesCompletedLifetime: 0,
      incidentsResolvedLifetime: 0,
      actorsTreatedLifetime: 0,
      residentsConvertedLifetime: 0,
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
      expiredJobsByReason: {
        none: 0,
        stalled_path_blocked: 0,
        stalled_unreachable_source: 0,
        stalled_unreachable_dropoff: 0,
        stalled_no_supply: 0
      },
      expiredJobsByContext: {
        queued: 0,
        assigned: 0,
        carrying: 0,
        unknown: 0
      },
      jobCountsByItem: createJobCountsByItem(),
      jobCountsByType: createJobCountsByType(),
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
      crewCleaning: 0,
      crewSelfCare: 0,
      crewAvgEnergy: 100,
      crewAvgHygiene: 100,
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
      tradeGoodsSoldPerMin: 0,
      marketStockoutsPerMin: 0,
      crewRetargetsPerMin: 0,
      criticalStaffDropsPerMin: 0,
      visitorServiceFailuresPerMin: 0,
      visitorDestinationShares: {
        cafeteria: 0,
        market: 0,
        lounge: 0,
        recHall: 0,
        cantina: 0,
        observatory: 0,
        hygiene: 0,
        vending: 0
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
        longWalks: 0,
        routeExposure: 0,
        environment: 0
      },
      stationRatingPenaltyTotal: {
        queueTimeout: 0,
        noEligibleDock: 0,
        serviceFailure: 0,
        longWalks: 0,
        routeExposure: 0,
        environment: 0
      },
      stationRatingBonusPerMin: {
        mealService: 0,
        leisureService: 0,
        successfulExit: 0,
        residentRetention: 0
      },
      stationRatingBonusTotal: {
        mealService: 0,
        leisureService: 0,
        successfulExit: 0,
        residentRetention: 0
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
      shipsByTypePerMin: {
        tourist: 0,
        trader: 0,
        industrial: 0,
        military: 0,
        colonist: 0
      },
      residentTaxPerMin: 0,
      residentTaxCollectedTotal: 0,
      residentConversionAttempts: 0,
      residentConversionSuccesses: 0,
      residentDepartures: 0,
      residentSatisfactionAvg: 0,
      topRoomWarnings: [],
      roomWarningsCount: 0,
      visitorServiceExposurePenaltyPerMin: 0,
      residentBadRouteStressPerMin: 0,
      crewPublicInterferencePerMin: 0,
      visitorStatusAvg: 0,
      residentComfortAvg: 0,
      serviceNoiseNearDorms: 0,
      visitorEnvironmentPenaltyPerMin: 0,
      residentEnvironmentStressPerMin: 0,
      maintenanceDebtAvg: 0,
      maintenanceDebtMax: 0,
      maintenanceJobsOpen: 0,
      maintenanceJobsResolvedPerMin: 0,
      lifeSupportCoveragePct: 100,
      avgLifeSupportDistance: 0,
      poorLifeSupportTiles: 0,
      serviceNodesTotal: 0,
      serviceNodesUnreachable: 0,
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
      diagnosticOverlay: 'none',
      showZones: true,
      showServiceNodes: false,
      showInventoryOverlay: false,
      showGlow: true,
      spriteMode: 'sprites',
      wallRenderMode: 'dual-tilemap',
      showSpriteFallback: false,
      spritePipeline: 'nano-banana',
      taxRate: 0.2,
      dockPlacementFacing: 'north',
      moduleRotation: 0,
      crewPriorityPreset: 'balanced',
      crewPriorityWeights: cloneCrewPriorityWeights(CREW_PRIORITY_PRESET_WEIGHTS.balanced)
    },
    mapExpansion: {
      purchased: {
        north: false,
        east: false,
        south: false,
        west: false
      },
      purchasesMade: 0
    },
    unlocks: createInitialUnlockState(),
    effects: {
      cafeteriaStallUntil: 0,
      brownoutUntil: 0,
      securityDelayUntil: 0,
      blockedUntilByTile: new Map(),
      trespassCooldownUntilByTile: new Map(),
      securityAuraByTile: new Map(),
      fires: []
    },
    topologyVersion: 0,
    roomVersion: 0,
    moduleVersion: 0,
    dockVersion: 0,
    derived: createEmptyDerivedCache(),
    rng,
    now: 0,
    lastCycleTime: 0,
    cycleDuration: CYCLE_DURATION,
    spawnCounter: 1,
    shipSpawnCounter: 1,
    crewSpawnCounter: 1,
    residentSpawnCounter: 1,
    lastResidentSpawnAt: -999,
    moduleSpawnCounter: 1,
    jobSpawnCounter: 1,
    incidentSpawnCounter: 1,
    incidentHeat: 0,
    lastPayrollAt: 0,
    lastResidentTaxAt: 0,
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
      creditsTradeGoodsGross: 0,
      creditsMealPayoutGross: 0,
      payrollPaid: 0,
      tradeGoodsSold: 0,
      marketStockouts: 0,
      archetypesEverSeen: { diner: false, shopper: false, lounger: false, rusher: false },
      shipsByType: {
        tourist: 0,
        trader: 0,
        industrial: 0,
        military: 0,
        colonist: 0
      },
      visitorLeisureEntries: {
        cafeteria: 0,
        market: 0,
        lounge: 0,
        recHall: 0,
        cantina: 0,
        observatory: 0,
        hygiene: 0,
        vending: 0
      },
      ratingDelta: 0,
      ratingFromShipTimeout: 0,
      ratingFromShipSkip: 0,
      ratingFromVisitorFailure: 0,
      ratingFromWalkDissatisfaction: 0,
      ratingFromRouteExposure: 0,
      ratingFromEnvironment: 0,
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
        successfulExit: 0,
        residentRetention: 0
      },
      residentTaxesCollected: 0,
      residentConversionAttempts: 0,
      residentConversionSuccesses: 0,
      residentDepartures: 0,
      ratingFromResidentDeparture: 0,
      ratingFromResidentRetention: 0,
      visitorWalkDistance: 0,
      visitorWalkTrips: 0,
      visitorServiceExposurePenalty: 0,
      residentBadRouteStress: 0,
      crewPublicInterference: 0,
      visitorEnvironmentPenalty: 0,
      residentEnvironmentStress: 0,
      maintenanceJobsResolved: 0,
      criticalStaffDrops: 0,
      securityDispatches: 0,
      securityResolved: 0,
      securityResponseSecTotal: 0,
      securityFightInterventions: 0,
      securityImmediateDefuses: 0,
      securityEscalatedFights: 0,
      incidentsFailed: 0,
      residentConfrontations: 0,
      incidentSuppressionSampleCount: 0,
      incidentSuppressionSampleSum: 0,
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
      clinicTotal: 0,
      clinicActive: 0,
      brigTotal: 0,
      brigActive: 0,
      recHallTotal: 0,
      recHallActive: 0,
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
      workshopTotal: 0,
      workshopActive: 0,
      loungeTotal: 0,
      loungeActive: 0,
      marketTotal: 0,
      marketActive: 0,
      cantinaTotal: 0,
      cantinaActive: 0,
      observatoryTotal: 0,
      observatoryActive: 0,
      logisticsStockTotal: 0,
      logisticsStockActive: 0,
      storageTotal: 0,
      storageActive: 0
    }
  };
}

export type ExpandMapFailureReason =
  | 'already_expanded_direction'
  | 'insufficient_credits';

export type ExpandMapResult =
  | { ok: true; direction: CardinalDirection; cost: number; width: number; height: number }
  | { ok: false; direction: CardinalDirection; cost: number; reason: ExpandMapFailureReason };

export function getNextExpansionCost(state: StationState): number {
  const tier = Math.min(state.mapExpansion.purchasesMade, EXPANSION_COST_TIERS.length - 1);
  return EXPANSION_COST_TIERS[tier];
}

export function canExpandDirection(state: StationState, direction: CardinalDirection): boolean {
  return !state.mapExpansion.purchased[direction];
}

export function expandMap(state: StationState, direction: CardinalDirection): ExpandMapResult {
  const cost = getNextExpansionCost(state);
  if (!canExpandDirection(state, direction)) {
    return { ok: false, direction, cost, reason: 'already_expanded_direction' };
  }
  if (state.metrics.credits < cost) {
    return { ok: false, direction, cost, reason: 'insufficient_credits' };
  }

  const oldWidth = state.width;
  const oldHeight = state.height;
  const shiftX = direction === 'west' ? EXPANSION_STEP_TILES : 0;
  const shiftY = direction === 'north' ? EXPANSION_STEP_TILES : 0;
  const newWidth = oldWidth + (direction === 'west' || direction === 'east' ? EXPANSION_STEP_TILES : 0);
  const newHeight = oldHeight + (direction === 'north' || direction === 'south' ? EXPANSION_STEP_TILES : 0);

  const remapIndex = (index: number): number => {
    const p = fromIndex(index, oldWidth);
    return toIndex(p.x + shiftX, p.y + shiftY, newWidth);
  };
  const remapOptionalIndex = (index: number | null): number | null => (index === null ? null : remapIndex(index));
  const remapIndexMap = (source: Map<number, number>): Map<number, number> => {
    const out = new Map<number, number>();
    for (const [idx, value] of source.entries()) {
      out.set(remapIndex(idx), value);
    }
    return out;
  };

  const tiles = new Array<TileType>(newWidth * newHeight).fill(TileType.Space);
  const zones = new Array<ZoneType>(newWidth * newHeight).fill(ZoneType.Public);
  const rooms = new Array<RoomType>(newWidth * newHeight).fill(RoomType.None);
  const roomHousingPolicies = new Array<HousingPolicy>(newWidth * newHeight).fill('visitor');
  const modules = new Array<ModuleType>(newWidth * newHeight).fill(ModuleType.None);
  const moduleOccupancyByTile = new Array<number | null>(newWidth * newHeight).fill(null);
  const pressurized = new Array<boolean>(newWidth * newHeight).fill(false);
  const airQualityByTile = new Float32Array(newWidth * newHeight).fill(100);

  for (let y = 0; y < oldHeight; y++) {
    for (let x = 0; x < oldWidth; x++) {
      const oldIndex = toIndex(x, y, oldWidth);
      const newIndex = toIndex(x + shiftX, y + shiftY, newWidth);
      tiles[newIndex] = state.tiles[oldIndex];
      zones[newIndex] = state.zones[oldIndex];
      rooms[newIndex] = state.rooms[oldIndex];
      roomHousingPolicies[newIndex] = state.roomHousingPolicies[oldIndex];
      modules[newIndex] = state.modules[oldIndex];
      moduleOccupancyByTile[newIndex] = state.moduleOccupancyByTile[oldIndex];
      pressurized[newIndex] = state.pressurized[oldIndex];
      airQualityByTile[newIndex] = state.airQualityByTile[oldIndex];
    }
  }

  state.metrics.credits -= cost;
  state.width = newWidth;
  state.height = newHeight;
  state.tiles = tiles;
  state.zones = zones;
  state.rooms = rooms;
  state.roomHousingPolicies = roomHousingPolicies;
  state.modules = modules;
  state.moduleOccupancyByTile = moduleOccupancyByTile;
  state.pressurized = pressurized;
  state.airQualityByTile = airQualityByTile;

  state.core.centerTile = remapIndex(state.core.centerTile);
  state.core.serviceTile = remapIndex(state.core.serviceTile);
  state.core.frameTiles = state.core.frameTiles.map(remapIndex);

  state.moduleInstances = state.moduleInstances.map((module) => ({
    ...module,
    originTile: remapIndex(module.originTile),
    tiles: module.tiles.map(remapIndex)
  }));
  state.docks = state.docks.map((dock) => ({
    ...dock,
    tiles: dock.tiles.map(remapIndex),
    anchorTile: remapIndex(dock.anchorTile),
    approachTiles: dock.approachTiles.map(remapIndex)
  }));
  state.itemNodes = state.itemNodes.map((node) => ({
    ...node,
    tileIndex: remapIndex(node.tileIndex)
  }));
  state.jobs = state.jobs.map((job) => ({
    ...job,
    fromTile: remapIndex(job.fromTile),
    toTile: remapIndex(job.toTile)
  }));
  state.incidents = state.incidents.map((incident) => ({
    ...incident,
    tileIndex: remapIndex(incident.tileIndex)
  }));
  state.visitors = state.visitors.map((visitor) => ({
    ...visitor,
    x: visitor.x + shiftX,
    y: visitor.y + shiftY,
    tileIndex: remapIndex(visitor.tileIndex),
    path: visitor.path.map(remapIndex),
    reservedServingTile: remapOptionalIndex(visitor.reservedServingTile),
    reservedTargetTile: remapOptionalIndex(visitor.reservedTargetTile)
  }));
  state.residents = state.residents.map((resident) => ({
    ...resident,
    x: resident.x + shiftX,
    y: resident.y + shiftY,
    tileIndex: remapIndex(resident.tileIndex),
    path: resident.path.map(remapIndex),
    reservedTargetTile: remapOptionalIndex(resident.reservedTargetTile)
  }));
  state.crewMembers = state.crewMembers.map((crew) => ({
    ...crew,
    x: crew.x + shiftX,
    y: crew.y + shiftY,
    tileIndex: remapIndex(crew.tileIndex),
    path: crew.path.map(remapIndex),
    targetTile: remapOptionalIndex(crew.targetTile)
  }));
  state.maintenanceDebts = state.maintenanceDebts.map((debt) => {
    const anchorTile = remapIndex(debt.anchorTile);
    return {
      ...debt,
      anchorTile,
      key: maintenanceKey(debt.system, anchorTile)
    };
  });
  state.arrivingShips = state.arrivingShips.map((ship) => ({
    ...ship,
    bayTiles: ship.bayTiles.map(remapIndex),
    bayCenterX: ship.bayCenterX + shiftX,
    bayCenterY: ship.bayCenterY + shiftY
  }));
  state.pendingSpawns = state.pendingSpawns.map((spawn) => ({
    ...spawn,
    dockIndex: remapIndex(spawn.dockIndex)
  }));
  state.bodyTiles = state.bodyTiles.map(remapIndex);
  state.pathOccupancyByTile = remapIndexMap(state.pathOccupancyByTile);
  state.effects.blockedUntilByTile = remapIndexMap(state.effects.blockedUntilByTile);
  state.effects.trespassCooldownUntilByTile = remapIndexMap(state.effects.trespassCooldownUntilByTile);
  state.effects.securityAuraByTile = remapIndexMap(state.effects.securityAuraByTile);
  state.clusterActivationState = new Map();

  state.mapExpansion.purchased[direction] = true;
  state.mapExpansion.purchasesMade += 1;

  bumpTopologyVersion(state);
  rebuildDockEntities(state);

  return {
    ok: true,
    direction,
    cost,
    width: state.width,
    height: state.height
  };
}

export function setTile(state: StationState, index: number, tile: TileType): void {
  const previousTile = state.tiles[index];
  if (previousTile === tile) return;
  state.tiles[index] = tile;
  if (!isWalkable(tile)) {
    const moduleId = state.moduleOccupancyByTile[index];
    if (moduleId !== null) {
      removeModuleById(state, moduleId);
    }
    state.rooms[index] = RoomType.None;
    state.roomHousingPolicies[index] = defaultHousingPolicyForRoom(RoomType.None);
    if (state.bodyTiles.length > 0) {
      state.bodyTiles = state.bodyTiles.filter((t) => t !== index);
      state.metrics.bodyVisibleCount = state.bodyTiles.length;
    }
    if (state.incidents.length > 0) {
      const removedIncidentIds = new Set(
        state.incidents.filter((incident) => incident.tileIndex === index).map((incident) => incident.id)
      );
      if (removedIncidentIds.size > 0) {
        state.incidents = state.incidents.filter((incident) => !removedIncidentIds.has(incident.id));
        for (const resident of state.residents) {
          if ((resident.activeIncidentId ?? null) !== null && removedIncidentIds.has(resident.activeIncidentId!)) {
            resident.activeIncidentId = null;
          }
        }
      }
    }
  }
  bumpTopologyVersion(state);
  if (previousTile === TileType.Dock || tile === TileType.Dock) {
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
  const proposedTiles = state.tiles.slice();
  proposedTiles[index] = tile;
  if (tile === TileType.Space) {
    if (!isConnectedToCore(state, proposedTiles)) return false;
  } else if (!isConnectedToCore(state, proposedTiles)) {
    return false;
  }
  if (!consumeConstructionMaterials(state, delta)) return false;
  setTile(state, index, tile);
  return true;
}

export function setZone(state: StationState, index: number, zone: ZoneType): void {
  if (state.zones[index] === zone) return;
  state.zones[index] = zone;
  bumpTopologyVersion(state);
}

export function setRoom(state: StationState, index: number, room: RoomType): void {
  if (!isWalkable(state.tiles[index])) return;
  if (room !== RoomType.None && !isRoomUnlocked(state, room)) return;
  if (state.rooms[index] === room) return;
  state.rooms[index] = room;
  if (room !== RoomType.Dorm && room !== RoomType.Hygiene) {
    state.roomHousingPolicies[index] = defaultHousingPolicyForRoom(room);
  } else if (!isHousingPolicyAllowedForRoom(room, state.roomHousingPolicies[index])) {
    state.roomHousingPolicies[index] = defaultHousingPolicyForRoom(room);
  } else if (state.roomHousingPolicies[index] === 'visitor') {
    state.roomHousingPolicies[index] = defaultHousingPolicyForRoom(room);
  }
  if (room === RoomType.Dorm) {
    state.zones[index] = ZoneType.Restricted;
  }
  bumpRoomVersion(state);
}

export function getUnlockTier(state: StationState): UnlockTier {
  return state.unlocks.tier;
}

// ─── Food-chain stall diagnostic (BMO T2 hunt 2026-04-27) ────────────────
// Dump everything you'd want to know about why hydroponics→kitchen
// rawMeal isn't moving despite hydro producing. Returns a structured
// diagnostic; intended use from the playtest harness or devtools:
//   const d = (window).__sim.diagnoseFoodChain(state);
//   console.table(d.summary);
//
// Covers the failure modes BMO listed:
//   1. job created? (counts pending/assigned/in-progress rawMeal jobs)
//   2. path exists? (runs findPath between every grow→stove pair)
//   3. crew dispatchable? (logisticsDispatchSlots + idle/non-idle counts)
//   4. cache fresh? (compares cache version keys against current state)
//   5. modules reachable? (collectServiceTargets returns)
export function diagnoseFoodChain(state: StationState): {
  summary: Record<string, number | string>;
  jobs: Array<{
    id: number;
    itemType: string;
    from: number;
    to: number;
    state: string;
    assignedTo: number | null;
    amount: number;
    pickedUpAmount: number;
    ageSec: number;
    sinceProgressSec: number;
    stallReason?: string;
  }>;
  paths: Array<{ from: number; to: number; pathLen: number | null; reason?: string }>;
  crewByRole: Record<string, number>;
  crewDetail: Array<{
    id: number;
    role: string;
    assignedSystem: string | null;
    energy: number;
    resting: boolean;
    activeJobId: number | null;
    blockedTicks: number;
    carrying: string | null;
    tile: number;
    pathLen: number;
    healthState: string;
  }>;
} {
  const growTargets = collectServiceTargets(state, RoomType.Hydroponics);
  const stoveTargets = collectServiceTargets(state, RoomType.Kitchen);
  const rawJobs = state.jobs.filter((j) => j.itemType === 'rawMeal');
  const openRawJobs = rawJobs.filter((j) => j.state === 'pending' || j.state === 'assigned' || j.state === 'in_progress');

  // Path probe — every grow source × every stove dest
  const paths: Array<{ from: number; to: number; pathLen: number | null; reason?: string }> = [];
  for (const from of growTargets) {
    for (const to of stoveTargets) {
      const p = findPath(state, from, to, { allowRestricted: false, intent: 'logistics' });
      if (p === null) {
        paths.push({ from, to, pathLen: null, reason: 'no path (corridor missing or all blocked)' });
      } else {
        paths.push({ from, to, pathLen: p.length });
      }
    }
  }

  // Crew role tally — humans assignedSystem distribution + idle count
  const crewByRole: Record<string, number> = {};
  for (const c of state.crewMembers) {
    const key = c.resting
      ? 'resting'
      : c.activeJobId !== null
        ? 'on-job'
        : c.role === 'idle'
          ? 'idle'
          : `assigned:${c.assignedSystem ?? 'none'}`;
    crewByRole[key] = (crewByRole[key] ?? 0) + 1;
  }

  const summary: Record<string, number | string> = {
    growTargetCount: growTargets.length,
    stoveTargetCount: stoveTargets.length,
    rawMealAtGrowTotal: growTargets.reduce((a, t) => a + itemStockAtNode(state, t, 'rawMeal'), 0),
    rawMealAtStoveTotal: stoveTargets.reduce((a, t) => a + itemStockAtNode(state, t, 'rawMeal'), 0),
    metric_rawFoodStock: state.metrics.rawFoodStock,
    metric_kitchenRawBuffer: state.metrics.kitchenRawBuffer,
    metric_mealStock: state.metrics.mealStock,
    rawJobCount: rawJobs.length,
    openRawJobCount: openRawJobs.length,
    pathProbe_pairs: paths.length,
    pathProbe_unreachable: paths.filter((p) => p.pathLen === null).length,
    pathProbe_minLen: paths.filter((p) => p.pathLen !== null).reduce((m, p) => Math.min(m, p.pathLen as number), Infinity),
    logisticsDispatchSlots: state.metrics.logisticsDispatchSlots,
    logisticsPressure: Number(state.metrics.logisticsPressure?.toFixed(3) ?? 0),
    crewTotal: state.crewMembers.length,
    crewIdleCount: state.crewMembers.filter((c) => !c.resting && c.role === 'idle').length,
    crewOnJobCount: state.crewMembers.filter((c) => !c.resting && c.activeJobId !== null).length,
    crewPriorityPreset: state.controls.crewPriorityPreset,
    powerSupply: state.metrics.powerSupply,
    powerDemand: state.metrics.powerDemand,
  };

  // ── v2 fields (BMO follow-up 2026-04-27): visitor stats + per-crew detail
  // + per-job liveness for diagnosing the secondary stall mode.
  const visitorBuckets = { hungry: 0, queueing: 0, eating: 0, leisure: 0, leaving: 0, other: 0 };
  for (const v of state.visitors) {
    if (v.state === VisitorState.ToCafeteria) visitorBuckets.hungry += 1;
    else if (v.state === VisitorState.Queueing) visitorBuckets.queueing += 1;
    else if (v.state === VisitorState.Eating) visitorBuckets.eating += 1;
    else if (v.state === VisitorState.Leisure || v.state === VisitorState.ToLeisure) visitorBuckets.leisure += 1;
    else if (v.state === VisitorState.ToDock) visitorBuckets.leaving += 1;
    else visitorBuckets.other += 1;
  }
  Object.assign(summary, {
    visitorTotal: state.visitors.length,
    visitorHungry: visitorBuckets.hungry,
    visitorQueueing: visitorBuckets.queueing,
    visitorEating: visitorBuckets.eating,
    visitorLeisure: visitorBuckets.leisure,
    visitorLeaving: visitorBuckets.leaving,
  });

  const crewDetail = state.crewMembers.map((c) => ({
    id: c.id,
    role: c.role,
    assignedSystem: c.assignedSystem,
    energy: Number(c.energy.toFixed(1)),
    resting: c.resting,
    activeJobId: c.activeJobId,
    blockedTicks: c.blockedTicks,
    carrying: c.carryingItemType ? `${c.carryingItemType}(${c.carryingAmount.toFixed(1)})` : null,
    tile: c.tileIndex,
    pathLen: c.path.length,
    healthState: c.healthState,
  }));

  const jobsDetail = openRawJobs.map((j) => ({
    id: j.id,
    itemType: j.itemType,
    from: j.fromTile,
    to: j.toTile,
    state: j.state,
    assignedTo: j.assignedCrewId,
    amount: j.amount,
    pickedUpAmount: j.pickedUpAmount,
    ageSec: Number((state.now - j.createdAt).toFixed(1)),
    sinceProgressSec: Number((state.now - j.lastProgressAt).toFixed(1)),
    stallReason: j.stallReason,
  }));

  return {
    summary,
    jobs: jobsDetail,
    paths,
    crewByRole,
    crewDetail,
  };
}

export function setRoomHousingPolicy(state: StationState, index: number, policy: HousingPolicy): boolean {
  const room = state.rooms[index];
  if (!isHousingPolicyAllowedForRoom(room, policy)) return false;
  const clusters = roomClusters(state, room);
  const targetCluster = clusters.find((cluster) => cluster.includes(index));
  if (!targetCluster) return false;
  for (const tile of targetCluster) {
    state.roomHousingPolicies[tile] = policy;
  }
  bumpRoomVersion(state);
  return true;
}

export function getHousingInspectorAt(state: StationState, tileIndex: number): HousingInspector | null {
  const room = state.rooms[tileIndex];
  if (room !== RoomType.Dorm && room !== RoomType.Hygiene) return null;
  const policy = state.roomHousingPolicies[tileIndex];
  const tiles = collectRooms(state, room).filter((tile) => state.roomHousingPolicies[tile] === policy);
  const bedModules =
    room === RoomType.Dorm
      ? state.moduleInstances.filter((m) => m.type === ModuleType.Bed && tiles.includes(m.originTile))
      : [];
  const assignedBeds = assignedHousingBedIds(state);
  const hygieneTargets = privateHygieneTargets(state);
  const validPrivateHousing =
    room === RoomType.Dorm &&
    policy === 'private_resident' &&
    bedModules.length > 0 &&
    hygieneTargets.length > 0;
  return {
    room,
    policy,
    bedsTotal: bedModules.length,
    bedsAssigned: bedModules.filter((m) => assignedBeds.has(m.id)).length,
    hygieneTargets: hygieneTargets.length,
    validPrivateHousing
  };
}

function visitorInspectorDesire(state: StationState, visitor: Visitor): VisitorDesire {
  if (visitor.state === VisitorState.ToDock) return 'exit_station';
  if (!visitor.servedMeal || visitor.carryingMeal || visitor.state === VisitorState.ToCafeteria || visitor.state === VisitorState.Queueing) {
    return 'eat';
  }
  if (visitor.state === VisitorState.ToLeisure || visitor.state === VisitorState.Leisure) {
    return visitorLeisureNeedLabel(state, visitor);
  }
  return visitor.servedMeal ? 'exit_station' : 'eat';
}

function visitorLeisureNeedLabel(state: StationState, visitor: Visitor): VisitorDesire {
  const target = visitor.reservedTargetTile ?? visitor.tileIndex;
  if (target >= 0 && target < state.rooms.length && state.rooms[target] === RoomType.Hygiene) return 'toilet';
  if (visitor.state === VisitorState.ToLeisure || visitor.state === VisitorState.Leisure) return 'leisure';
  return visitor.servedMeal ? 'exit_station' : 'eat';
}

function visitorInspectorTargetTile(visitor: Visitor): number | null {
  if (!visitor.carryingMeal && visitor.reservedServingTile !== null) return visitor.reservedServingTile;
  if (visitor.reservedTargetTile !== null) return visitor.reservedTargetTile;
  if (visitor.path.length > 0) return visitor.path[visitor.path.length - 1];
  return null;
}

function visitorInspectorAction(state: StationState, visitor: Visitor): { currentAction: string; actionReason: string } {
  if (visitor.state === VisitorState.ToCafeteria) {
    if (!visitor.carryingMeal) {
      return {
        currentAction: 'heading to serving station',
        actionReason:
          visitor.reservedServingTile !== null
            ? `meal pickup reserved at tile ${visitor.reservedServingTile}`
            : 'seeking meal service'
      };
    }
    return {
      currentAction: 'heading to table',
      actionReason:
        visitor.reservedTargetTile !== null
          ? `table reserved at tile ${visitor.reservedTargetTile}`
          : 'carrying a meal and searching for a seat'
    };
  }
  if (visitor.state === VisitorState.Queueing) {
    return {
      currentAction: 'waiting in cafeteria queue',
      actionReason: visitor.reservedServingTile !== null ? 'waiting for stock at reserved serving node' : 'no meal stock available yet'
    };
  }
  if (visitor.state === VisitorState.Eating) {
    return {
      currentAction: 'eating',
      actionReason: `meal timer ${visitor.eatTimer.toFixed(1)}s remaining`
    };
  }
  if (visitor.state === VisitorState.ToLeisure) {
    const need = visitorLeisureNeedLabel(state, visitor);
    const target = visitor.reservedTargetTile ?? -1;
    const targetRoom = target >= 0 && target < state.rooms.length ? state.rooms[target] : RoomType.None;
    const destLabel =
      targetRoom === RoomType.Market ? 'market' :
      targetRoom === RoomType.Lounge ? 'lounge' :
      targetRoom === RoomType.RecHall ? 'rec hall' :
      targetRoom === RoomType.Cantina ? 'cantina' :
      targetRoom === RoomType.Observatory ? 'observatory' :
      targetRoom === RoomType.Hygiene ? 'hygiene' : 'leisure';
    const legSuffix = visitor.leisureLegsPlanned > 1
      ? ` · leg ${visitor.leisureLegsPlanned - visitor.leisureLegsRemaining + 1}/${visitor.leisureLegsPlanned}`
      : '';
    return {
      currentAction: need === 'toilet' ? 'walking to hygiene' : `walking to ${destLabel}`,
      actionReason:
        need === 'toilet'
          ? `comfort stop after ${visitorVisitAge(state, visitor).toFixed(0)}s visit`
          : `${visitor.archetype} on ${visitor.primaryPreference} circuit${legSuffix}`
    };
  }
  if (visitor.state === VisitorState.Leisure) {
    const need = visitorLeisureNeedLabel(state, visitor);
    const room = state.rooms[visitor.tileIndex];
    const verb =
      need === 'toilet' ? 'using hygiene service' :
      room === RoomType.Market ? 'browsing market stalls' :
      room === RoomType.Lounge ? 'relaxing in lounge' :
      room === RoomType.RecHall ? 'using rec hall' :
      room === RoomType.Cantina ? 'enjoying drinks in cantina' :
      room === RoomType.Observatory ? 'taking in the view' :
      'using leisure service';
    return {
      currentAction: verb,
      actionReason: `${need === 'toilet' ? 'comfort' : 'leisure'} timer ${visitor.eatTimer.toFixed(1)}s remaining${visitor.leisureLegsRemaining > 0 ? ` · ${visitor.leisureLegsRemaining} more stop${visitor.leisureLegsRemaining === 1 ? '' : 's'} planned` : ''}`
    };
  }
  return {
    currentAction: 'heading to dock',
    actionReason: visitor.servedMeal ? 'visit complete, exiting station' : `patience pressure ${visitor.patience.toFixed(1)}`
  };
}

export function getVisitorInspectorById(state: StationState, visitorId: number): VisitorInspector | null {
  const visitor = state.visitors.find((v) => v.id === visitorId);
  if (!visitor) return null;
  const targetTile = visitorInspectorTargetTile(visitor);
  const action = visitorInspectorAction(state, visitor);
  return {
    id: visitor.id,
    kind: 'visitor',
    state: visitor.state,
    tileIndex: visitor.tileIndex,
    x: visitor.x,
    y: visitor.y,
    healthState: visitor.healthState,
    blockedTicks: visitor.blockedTicks,
    pathLength: visitor.path.length,
    targetTile,
    currentAction: action.currentAction,
    actionReason: action.actionReason,
    localAir: airQualityAt(state, visitor.tileIndex),
    airExposureSec: visitor.airExposureSec,
    archetype: visitor.archetype,
    primaryPreference: visitor.primaryPreference,
    patience: visitor.patience,
    servedMeal: visitor.servedMeal,
    carryingMeal: visitor.carryingMeal,
    reservedServingTile: visitor.reservedServingTile,
    reservedTargetTile: visitor.reservedTargetTile,
    desire: visitorInspectorDesire(state, visitor)
  };
}

function residentInspectorTargetTile(resident: Resident): number | null {
  if (resident.reservedTargetTile !== null) return resident.reservedTargetTile;
  if (resident.path.length > 0) return resident.path[resident.path.length - 1];
  return null;
}

function residentInspectorDominantNeed(resident: Resident): ResidentDominantNeed {
  const deficits: Array<{ key: ResidentDominantNeed; value: number }> = [
    { key: 'hunger', value: 100 - resident.hunger },
    { key: 'energy', value: 100 - resident.energy },
    { key: 'hygiene', value: 100 - resident.hygiene }
  ];
  deficits.sort((a, b) => b.value - a.value);
  return deficits[0].value < 10 ? 'none' : deficits[0].key;
}

function residentInspectorDesire(resident: Resident): ResidentDesire {
  if (resident.leaveIntent >= RESIDENT_LEAVE_INTENT_TRIGGER) return 'return_home_ship';
  if (resident.safety < 35) return 'seek_safety';
  if (resident.energy < DORM_SEEK_ENERGY_THRESHOLD) return 'sleep';
  if (resident.hygiene < 45) return 'hygiene';
  if (resident.hunger < 55) return 'eat';
  if (resident.routinePhase === 'socialize' && resident.social < 65) return 'socialize';
  return 'wander';
}

function residentInspectorAction(
  resident: Resident,
  desire: ResidentDesire
): { currentAction: string; actionReason: string } {
  if ((resident.activeIncidentId ?? null) !== null) {
    return {
      currentAction: 'in confrontation',
      actionReason: `incident ${resident.activeIncidentId} awaiting security response`
    };
  }
  if (resident.state === ResidentState.ToCafeteria) {
    return {
      currentAction: 'walking to cafeteria',
      actionReason: `hunger ${resident.hunger.toFixed(1)} under eat threshold 55`
    };
  }
  if (resident.state === ResidentState.Eating) {
    return {
      currentAction: 'eating',
      actionReason: `meal timer ${resident.actionTimer.toFixed(1)}s remaining`
    };
  }
  if (resident.state === ResidentState.ToDorm) {
    return {
      currentAction: 'walking to dorm',
      actionReason: `energy ${resident.energy.toFixed(1)} under rest threshold ${DORM_SEEK_ENERGY_THRESHOLD}`
    };
  }
  if (resident.state === ResidentState.Sleeping) {
    return {
      currentAction: 'sleeping',
      actionReason: `rest timer ${resident.actionTimer.toFixed(1)}s remaining`
    };
  }
  if (resident.state === ResidentState.ToHygiene) {
    return {
      currentAction: 'walking to hygiene',
      actionReason: `hygiene ${resident.hygiene.toFixed(1)} under clean threshold 45`
    };
  }
  if (resident.state === ResidentState.Cleaning) {
    return {
      currentAction: 'cleaning',
      actionReason: `clean timer ${resident.actionTimer.toFixed(1)}s remaining`
    };
  }
  if (resident.state === ResidentState.ToLeisure) {
    return {
      currentAction: 'walking to social space',
      actionReason: `routine ${resident.routinePhase} with social ${resident.social.toFixed(1)}`
    };
  }
  if (resident.state === ResidentState.Leisure) {
    return {
      currentAction: 'socializing',
      actionReason: `social timer ${resident.actionTimer.toFixed(1)}s remaining`
    };
  }
  if (resident.state === ResidentState.ToSecurity) {
    return {
      currentAction: 'seeking safer area',
      actionReason: `safety ${resident.safety.toFixed(1)} below comfort threshold`
    };
  }
  if (resident.state === ResidentState.ToHomeShip) {
    return {
      currentAction: 'returning to home ship',
      actionReason: `leave intent ${resident.leaveIntent.toFixed(1)} reached trigger ${RESIDENT_LEAVE_INTENT_TRIGGER}`
    };
  }
  return {
    currentAction: resident.path.length > 0 ? 'wandering' : 'idle',
    actionReason: desire === 'wander' ? 'all immediate needs are above trigger thresholds' : `next desire is ${desire}`
  };
}

export function getResidentInspectorById(state: StationState, residentId: number): ResidentInspector | null {
  const resident = state.residents.find((r) => r.id === residentId);
  if (!resident) return null;
  const desire = residentInspectorDesire(resident);
  const action = residentInspectorAction(resident, desire);
  const agitation = resident.agitation ?? 0;
  const inConfrontation = residentConfrontationActive(state, resident);
  return {
    id: resident.id,
    kind: 'resident',
    state: resident.state,
    tileIndex: resident.tileIndex,
    x: resident.x,
    y: resident.y,
    healthState: resident.healthState,
    blockedTicks: resident.blockedTicks,
    pathLength: resident.path.length,
    targetTile: residentInspectorTargetTile(resident),
    currentAction: action.currentAction,
    actionReason: action.actionReason,
    localAir: airQualityAt(state, resident.tileIndex),
    airExposureSec: resident.airExposureSec,
    hunger: resident.hunger,
    energy: resident.energy,
    hygiene: resident.hygiene,
    stress: resident.stress,
    social: resident.social,
    safety: resident.safety,
    routinePhase: resident.routinePhase,
    role: resident.role,
    agitation,
    inConfrontation,
    satisfaction: resident.satisfaction,
    leaveIntent: resident.leaveIntent,
    homeDockId: resident.homeDockId,
    homeShipId: resident.homeShipId,
    housingUnitId: resident.housingUnitId,
    bedModuleId: resident.bedModuleId,
    dominantNeed: residentInspectorDominantNeed(resident),
    desire
  };
}

function crewInspectorDesire(crew: CrewMember): CrewDesire {
  if (crew.resting) return 'rest';
  if (crew.toileting) return 'toilet';
  if (crew.drinking) return 'drink';
  if (crew.cleaning) return 'clean';
  if (crew.leisure) return 'social';
  if (crew.activeJobId !== null) return 'logistics';
  if (crew.bladder <= CREW_BLADDER_TOILET_THRESHOLD) return 'toilet';
  if (crew.thirst <= CREW_THIRST_DRINK_THRESHOLD) return 'drink';
  if (crew.energy <= CREW_REST_ENERGY_THRESHOLD) return 'rest';
  if (crew.hygiene <= CREW_CLEAN_HYGIENE_THRESHOLD) return 'clean';
  if (crew.assignedSystem !== null) return 'staff_post';
  return 'idle';
}

function crewInspectorTargetTile(state: StationState, crew: CrewMember): number | null {
  if (crew.activeJobId !== null) {
    const job = state.jobs.find((j) => j.id === crew.activeJobId);
    if (job) return crew.carryingItemType !== null || job.state === 'in_progress' ? job.toTile : job.fromTile;
  }
  if (crew.targetTile !== null) return crew.targetTile;
  if (crew.path.length > 0) return crew.path[crew.path.length - 1];
  return null;
}

function crewInspectorAction(
  state: StationState,
  crew: CrewMember,
  desire: CrewDesire
): { currentAction: string; actionReason: string; stateLabel: string } {
  if (crew.activeJobId !== null) {
    const job = state.jobs.find((j) => j.id === crew.activeJobId);
    if (job) {
      if (job.type === 'repair') {
        const at = crew.tileIndex === job.fromTile;
        const sys = job.repairSystem ?? 'system';
        const stall = job.stallReason && job.stallReason !== 'none' ? ` | ${job.stallReason}` : '';
        return {
          currentAction: at ? `repairing ${sys}` : `walking to repair ${sys}`,
          actionReason: `job #${job.id} ${job.state} | progress ${(job.repairProgress ?? 0).toFixed(1)}/${job.amount.toFixed(1)}${stall}`,
          stateLabel: 'repair'
        };
      }
      if (job.type === 'extinguish') {
        const fire = state.effects.fires.find((f) => f.anchorTile === job.fromTile);
        const inProgress = job.state === 'in_progress';
        return {
          currentAction: inProgress ? 'extinguishing fire' : 'rushing to fire',
          actionReason: fire
            ? `fire at ${job.fromTile} | intensity ${fire.intensity.toFixed(0)}`
            : `fire job #${job.id} ${job.state}`,
          stateLabel: 'firefighting'
        };
      }
      const carrying = crew.carryingItemType !== null || job.pickedUpAmount > 0;
      const currentAction = carrying ? `delivering ${job.itemType}` : `walking to ${job.itemType} pickup`;
      const stall = job.stallReason && job.stallReason !== 'none' ? ` | ${job.stallReason}` : '';
      return {
        currentAction,
        actionReason: `job #${job.id} ${job.state} | ${job.fromTile}->${job.toTile} | ${job.pickedUpAmount.toFixed(1)}/${job.amount.toFixed(1)}${stall}`,
        stateLabel: 'logistics'
      };
    }
    return {
      currentAction: 'logistics assignment missing',
      actionReason: `active job #${crew.activeJobId} no longer exists`,
      stateLabel: 'logistics'
    };
  }
  if (crew.resting) {
    return {
      currentAction: 'resting',
      actionReason: `energy ${crew.energy.toFixed(1)} recovering before returning to duty`,
      stateLabel: 'resting'
    };
  }
  if (crew.toileting) {
    return {
      currentAction: crew.path.length > 0 ? 'walking to hygiene' : 'using restroom',
      actionReason: `bladder ${crew.bladder.toFixed(0)} (toilet at <${CREW_BLADDER_TOILET_THRESHOLD})`,
      stateLabel: 'toilet'
    };
  }
  if (crew.drinking) {
    const atCantina = state.rooms[crew.tileIndex] === RoomType.Cantina;
    const atFountain = state.modules[crew.tileIndex] === ModuleType.WaterFountain;
    return {
      currentAction:
        atCantina ? 'drinking at the bar' :
        atFountain ? 'sipping water' :
        crew.path.length > 0 ? 'walking to drink' : 'looking for a drink',
      actionReason: `thirst ${crew.thirst.toFixed(0)} (drink at <${CREW_THIRST_DRINK_THRESHOLD})`,
      stateLabel: 'drink'
    };
  }
  if (crew.cleaning) {
    return {
      currentAction: 'cleaning up',
      actionReason: `hygiene ${crew.hygiene.toFixed(1)} below comfort threshold`,
      stateLabel: 'cleaning'
    };
  }
  if (crew.leisure) {
    return {
      currentAction: crew.path.length > 0 ? 'walking to social space' : 'taking leisure time',
      actionReason: crew.leisureSessionActive
        ? `off-duty recovery ${Math.max(0, crew.leisureUntil - state.now).toFixed(1)}s remaining`
        : 'off-duty social recovery before returning to work',
      stateLabel: 'leisure'
    };
  }
  if (crew.assignedSystem !== null) {
    return {
      currentAction: `staffing ${crew.assignedSystem}`,
      actionReason: crew.targetTile !== null
        ? `priority weight ${state.controls.crewPriorityWeights[crew.assignedSystem]} at tile ${crew.targetTile}`
        : `assigned to ${crew.assignedSystem} without a current post`,
      stateLabel: crew.assignedSystem
    };
  }
  return {
    currentAction: crew.path.length > 0 ? 'walking' : 'idle',
    actionReason: desire === 'idle' ? crew.idleReason : `next desire is ${desire}`,
    stateLabel: 'idle'
  };
}

export function getCrewInspectorById(state: StationState, crewId: number): CrewInspector | null {
  const crew = state.crewMembers.find((c) => c.id === crewId);
  if (!crew) return null;
  const desire = crewInspectorDesire(crew);
  const action = crewInspectorAction(state, crew, desire);
  return {
    id: crew.id,
    kind: 'crew',
    state: action.stateLabel,
    tileIndex: crew.tileIndex,
    x: crew.x,
    y: crew.y,
    healthState: crew.healthState,
    blockedTicks: crew.blockedTicks,
    pathLength: crew.path.length,
    targetTile: crewInspectorTargetTile(state, crew),
    currentAction: action.currentAction,
    actionReason: action.actionReason,
    localAir: airQualityAt(state, crew.tileIndex),
    airExposureSec: crew.airExposureSec,
    role: crew.role,
    assignedSystem: crew.assignedSystem,
    lastSystem: crew.lastSystem,
    energy: crew.energy,
    hygiene: crew.hygiene,
    bladder: crew.bladder,
    thirst: crew.thirst,
    resting: crew.resting,
    cleaning: crew.cleaning,
    toileting: crew.toileting,
    drinking: crew.drinking,
    leisure: crew.leisure,
    activeJobId: crew.activeJobId,
    carryingItemType: crew.carryingItemType,
    carryingAmount: crew.carryingAmount,
    idleReason: crew.idleReason,
    desire
  };
}

export function tryPlaceModule(
  state: StationState,
  moduleType: ModuleType,
  originTile: number,
  rotation: ModuleRotation = 0
): { ok: boolean; reason?: string } {
  const module = moduleType;
  const requiresWallMount = module === ModuleType.WallLight;
  if (requiresWallMount) {
    if (state.tiles[originTile] !== TileType.Wall) return { ok: false, reason: 'wall light requires wall tile' };
  } else if (!isWalkable(state.tiles[originTile])) {
    return { ok: false, reason: 'target not walkable' };
  }
  if (module === ModuleType.None) return { ok: false, reason: 'cannot place none' };
  if (!isModuleUnlocked(state, module)) return { ok: false, reason: 'module locked by progression' };
  const def = MODULE_DEFINITIONS[module];
  if (!def) return { ok: false, reason: 'unknown module' };
  const appliedRotation: ModuleRotation = rotation === 90 && def.rotatable ? 90 : 0;
  const footprint = moduleFootprint(module, appliedRotation);
  const tiles = footprintTiles(state, originTile, footprint.width, footprint.height);
  if (tiles.length <= 0) return { ok: false, reason: 'out of bounds' };
  if (module === ModuleType.WallLight && !resolveWallLightFacing(state, originTile)) {
    return { ok: false, reason: 'wall light requires top wall mount' };
  }

  const roomAtOrigin = state.rooms[originTile];
  for (const tile of tiles) {
    if (requiresWallMount) {
      if (state.tiles[tile] !== TileType.Wall) return { ok: false, reason: 'wall light requires wall tile' };
    } else if (!isWalkable(state.tiles[tile])) {
      return { ok: false, reason: 'footprint blocked' };
    }
    if (state.moduleOccupancyByTile[tile] !== null) return { ok: false, reason: 'module overlap' };
    if (def.allowedRooms && !def.allowedRooms.includes(state.rooms[tile])) {
      return { ok: false, reason: 'invalid room for module' };
    }
    if (def.allowedRooms && state.rooms[tile] !== roomAtOrigin) {
      return { ok: false, reason: 'footprint crosses room boundary' };
    }
  }
  const berthModuleReason = validateBerthModulePlacement(state, module, tiles);
  if (berthModuleReason) return { ok: false, reason: berthModuleReason };

  state.moduleInstances.push({
    id: state.moduleSpawnCounter++,
    type: module,
    originTile,
    rotation: appliedRotation,
    width: footprint.width,
    height: footprint.height,
    tiles
  });
  syncModuleOccupancy(state);
  return { ok: true };
}

export function resolveWallLightFacing(
  state: StationState,
  tileIndex: number
): 'north' | 'east' | 'south' | 'west' | null {
  const p = fromIndex(tileIndex, state.width);
  if (state.tiles[tileIndex] !== TileType.Wall) return null;
  const belowY = p.y + 1;
  const aboveY = p.y - 1;
  if (!inBounds(p.x, belowY, state.width, state.height)) return null;
  const below = toIndex(p.x, belowY, state.width);
  if (!isWalkable(state.tiles[below])) return null;
  if (inBounds(p.x, aboveY, state.width, state.height)) {
    const above = toIndex(p.x, aboveY, state.width);
    if (isWalkable(state.tiles[above])) return null;
  }
  return 'south';
}

export function removeModuleAtTile(state: StationState, tileIndex: number): boolean {
  const moduleId = state.moduleOccupancyByTile[tileIndex];
  if (moduleId === null) return false;
  return removeModuleById(state, moduleId);
}

export function setModule(state: StationState, index: number, module: ModuleType): void {
  if (!isWalkable(state.tiles[index])) return;
  if (module === ModuleType.None) {
    removeModuleAtTile(state, index);
    return;
  }
  const placed = tryPlaceModule(state, module, index, 0);
  if (placed.ok) return;

  const existing = state.moduleOccupancyByTile[index];
  if (existing !== null) {
    removeModuleById(state, existing);
  }
  state.moduleInstances.push({
    id: state.moduleSpawnCounter++,
    type: module,
    originTile: index,
    rotation: 0,
    width: 1,
    height: 1,
    tiles: [index],
    legacyForced: true
  });
  syncModuleOccupancy(state);
}

export function buyMaterials(state: StationState, creditCost: number, materialsGain: number): boolean {
  return buyMaterialsDetailed(state, creditCost, materialsGain).ok;
}

export type BuyMaterialsFailureReason =
  | 'insufficient_credits'
  | 'no_logistics_stock'
  | 'insufficient_storage_capacity';

type BuyMaterialsDetailedFailure = {
  ok: false;
  reason: BuyMaterialsFailureReason;
  requiredAmount: number;
  freeCapacity: number;
  targetNodeCount: number;
};

type BuyMaterialsDetailedSuccess = {
  ok: true;
  added: number;
};

export function buyMaterialsDetailed(
  state: StationState,
  creditCost: number,
  materialsGain: number
): BuyMaterialsDetailedSuccess | BuyMaterialsDetailedFailure {
  rebuildItemNodes(state);
  const intakeTargets = collectServiceTargets(state, RoomType.LogisticsStock);
  const freeCapacity = totalItemCapacityAtTargets(state, intakeTargets);
  if (state.metrics.credits < creditCost) {
    return {
      ok: false,
      reason: 'insufficient_credits',
      requiredAmount: materialsGain,
      freeCapacity,
      targetNodeCount: intakeTargets.length
    };
  }
  if (intakeTargets.length === 0) {
    return {
      ok: false,
      reason: 'no_logistics_stock',
      requiredAmount: materialsGain,
      freeCapacity: 0,
      targetNodeCount: 0
    };
  }
  if (freeCapacity < materialsGain) {
    return {
      ok: false,
      reason: 'insufficient_storage_capacity',
      requiredAmount: materialsGain,
      freeCapacity,
      targetNodeCount: intakeTargets.length
    };
  }
  const added = addItemAcrossTargets(state, intakeTargets, 'rawMaterial', materialsGain, state.core.serviceTile);
  if (added < materialsGain) {
    return {
      ok: false,
      reason: 'insufficient_storage_capacity',
      requiredAmount: materialsGain,
      freeCapacity,
      targetNodeCount: intakeTargets.length
    };
  }
  state.metrics.credits -= creditCost;
  state.metrics.materials += added;
  return { ok: true, added };
}

export function buyRawFood(state: StationState, creditCost: number, rawFoodGain: number): boolean {
  return buyRawFoodDetailed(state, creditCost, rawFoodGain).ok;
}

export type BuyRawFoodFailureReason =
  | 'insufficient_credits'
  | 'no_food_destinations'
  | 'insufficient_food_capacity';

type BuyRawFoodDetailedFailure = {
  ok: false;
  reason: BuyRawFoodFailureReason;
  requiredAmount: number;
  freeCapacity: number;
  targetNodeCount: number;
};

type BuyRawFoodDetailedSuccess = {
  ok: true;
  added: number;
};

export function buyRawFoodDetailed(
  state: StationState,
  creditCost: number,
  rawFoodGain: number
): BuyRawFoodDetailedSuccess | BuyRawFoodDetailedFailure {
  rebuildItemNodes(state);
  const growTargets = collectServiceTargets(state, RoomType.Hydroponics);
  const stoveTargets = collectServiceTargets(state, RoomType.Kitchen);
  const destinations = [...growTargets, ...stoveTargets];
  const freeCapacity = totalItemCapacityAtTargets(state, destinations);
  if (state.metrics.credits < creditCost) {
    return {
      ok: false,
      reason: 'insufficient_credits',
      requiredAmount: rawFoodGain,
      freeCapacity,
      targetNodeCount: destinations.length
    };
  }
  if (destinations.length === 0) {
    return {
      ok: false,
      reason: 'no_food_destinations',
      requiredAmount: rawFoodGain,
      freeCapacity: 0,
      targetNodeCount: 0
    };
  }
  if (freeCapacity < rawFoodGain) {
    return {
      ok: false,
      reason: 'insufficient_food_capacity',
      requiredAmount: rawFoodGain,
      freeCapacity,
      targetNodeCount: destinations.length
    };
  }
  const added = addItemAcrossTargets(state, destinations, 'rawMeal', rawFoodGain, state.core.serviceTile);
  if (added < rawFoodGain) {
    return {
      ok: false,
      reason: 'insufficient_food_capacity',
      requiredAmount: rawFoodGain,
      freeCapacity,
      targetNodeCount: destinations.length
    };
  }
  state.metrics.credits -= creditCost;
  state.metrics.rawFoodStock = clamp(state.metrics.rawFoodStock + added, 0, 260);
  return { ok: true, added };
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
  if (!consumeConstructionMaterials(state, BODY_CLEAR_MATERIAL_COST)) return false;
  const removed = Math.min(BODY_CLEAR_BATCH, state.bodyTiles.length);
  state.bodyTiles.splice(0, removed);
  state.metrics.bodyCount = Math.max(0, state.metrics.bodyCount - removed);
  state.metrics.bodyVisibleCount = state.bodyTiles.length;
  state.metrics.bodiesClearedTotal += removed;
  state.incidentHeat = Math.max(0, state.incidentHeat - removed * 0.8);
  return true;
}

export function sellMaterials(state: StationState, materialsCost: number, creditGain: number): boolean {
  rebuildItemNodes(state);
  const logisticsTargets = collectServiceTargets(state, RoomType.LogisticsStock);
  const storageTargets = collectServiceTargets(state, RoomType.Storage);
  const sources = [...logisticsTargets, ...storageTargets];
  if (sources.length === 0) return false;
  const available = sources.reduce((acc, tile) => acc + itemStockAtNode(state, tile, 'rawMaterial'), 0);
  if (available < materialsCost) return false;
  const removed = takeItemAcrossTargets(state, sources, 'rawMaterial', materialsCost);
  if (removed < materialsCost) return false;
  state.metrics.materials = Math.max(0, state.metrics.materials - removed);
  state.metrics.credits += creditGain;
  state.metrics.creditsEarnedLifetime += creditGain;
  return true;
}

export function sellRawFood(state: StationState, rawFoodCost: number, creditGain: number): boolean {
  rebuildItemNodes(state);
  const growTargets = collectServiceTargets(state, RoomType.Hydroponics);
  const stoveTargets = collectServiceTargets(state, RoomType.Kitchen);
  const sources = [...growTargets, ...stoveTargets];
  if (sources.length === 0) return false;
  const available = sources.reduce((acc, tile) => acc + itemStockAtNode(state, tile, 'rawMeal'), 0);
  if (available < rawFoodCost) return false;
  const removed = takeItemAcrossTargets(state, sources, 'rawMeal', rawFoodCost);
  if (removed < rawFoodCost) return false;
  state.metrics.rawFoodStock = clamp(state.metrics.rawFoodStock - removed, 0, 260);
  state.metrics.credits += creditGain;
  state.metrics.creditsEarnedLifetime += creditGain;
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
  ensureDockByTileCache(state);
  return state.derived.dockByTile.get(tileIndex) ?? null;
}

export function setDockPurpose(state: StationState, dockId: number, purpose: DockPurpose): void {
  const dock = state.docks.find((d) => d.id === dockId);
  if (!dock) return;
  if (dock.purpose === purpose) return;
  dock.purpose = purpose;
  if (purpose === 'residential') {
    state.dockQueue = state.dockQueue.filter((entry) => entry.lane !== dock.lane);
  }
  bumpDockVersion(state);
}

export function setDockFacing(state: StationState, dockId: number, facing: SpaceLane): { ok: boolean; reason?: string } {
  const dock = state.docks.find((d) => d.id === dockId);
  if (!dock) return { ok: false, reason: 'dock not found' };
  const check = validateDockPlacementAt(state, dock.anchorTile, facing);
  if (!check.valid) return { ok: false, reason: check.reason };
  dock.facing = facing;
  dock.lane = laneFromFacing(facing);
  dock.approachTiles = check.approachTiles;
  bumpDockVersion(state);
  return { ok: true };
}

export function setDockAllowedShipType(state: StationState, dockId: number, shipType: ShipType, allowed: boolean): void {
  const dock = state.docks.find((d) => d.id === dockId);
  if (!dock) return;
  if (allowed && !isShipTypeUnlocked(state, shipType)) return;
  const next = new Set(dock.allowedShipTypes);
  if (allowed) next.add(shipType);
  else next.delete(shipType);
  if (next.size === 0) next.add('tourist');
  dock.allowedShipTypes = [...next];
  bumpDockVersion(state);
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
  bumpDockVersion(state);
}

export function validateDockPlacement(
  state: StationState,
  tileIndex: number,
  facing?: SpaceLane
): { valid: boolean; reason: string; approachTiles: number[] } {
  return validateDockPlacementWithNeighbors(state, tileIndex, facing);
}

export function tick(state: StationState, frameDt: number): void {
  const tickStarted = perfNowMs();
  state.metrics.pathMs = 0;
  state.metrics.pathCallsPerTick = 0;
  state.metrics.derivedRecomputeMs = 0;

  ensureCrewPool(state);
  ensureResidentPopulation(state);
  ensureDockEntitiesUpToDate(state);
  ensureDockByTileCache(state);
  ensureItemNodeByTileCache(state);
  ensurePressurizationUpToDate(state);
  refreshRoomOpsFromCrewPresence(state, 0, false);
  state.effects.securityAuraByTile = computeSecurityAuraMap(state);
  state.pathOccupancyByTile = buildOccupancyMap(state);

  if (state.controls.paused) {
    refreshJobMetrics(state);
    computeMetrics(state);
    updateUnlockProgress(state);
    state.metrics.tickMs = perfNowMs() - tickStarted;
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
  applyResidentTaxes(state);
  createFoodTransportJobs(state);
  createRawMaterialTransportJobs(state);
  createTradeGoodTransportJobs(state);
  assignCrewJobs(state);
  assignJobsToIdleCrew(state);
  requeueStalledJobs(state);
  expireJobs(state);
  ensurePressurizationUpToDate(state);
  refreshRoomOpsFromCrewPresence(state, dt, true);
  updateMaintenanceDebt(state, dt);
  updateFires(state, dt);
  updateResources(state, dt);
  maybeCreateTier3Patient(state, dt);

  const occupancyByTile = buildOccupancyMap(state);
  state.pathOccupancyByTile = occupancyByTile;
  updateCrewLogic(state, dt, occupancyByTile);
  state.effects.securityAuraByTile = computeSecurityAuraMap(state);
  const securityAuraByTile = state.effects.securityAuraByTile;
  updateCriticalStaffTracking(state, dt);
  updateResidentLogic(state, dt, occupancyByTile, securityAuraByTile);
  tryStartResidentConfrontation(state, dt, securityAuraByTile);
  updateVisitorLogic(state, dt, occupancyByTile, securityAuraByTile);
  maybeCreateTier3DispatchIncident(state, dt);
  updateIncidentPipeline(state, dt, occupancyByTile);

  refreshJobMetrics(state);
  ensureDerivedUpToDate(state);
  computeMetrics(state);
  updateUnlockProgress(state);
  maybeTriggerFailure(state, dt);
  state.metrics.tickMs = perfNowMs() - tickStarted;
}
