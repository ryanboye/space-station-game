export const GRID_WIDTH = 60;
export const GRID_HEIGHT = 40;
export const TILE_SIZE = 18;

export enum TileType {
  Space = 'space',
  Floor = 'floor',
  Wall = 'wall',
  Dock = 'dock',
  Cafeteria = 'cafeteria',
  Reactor = 'reactor',
  Security = 'security',
  Door = 'door'
}

export enum ZoneType {
  Public = 'public',
  Restricted = 'restricted'
}

export enum RoomType {
  None = 'none',
  Cafeteria = 'cafeteria',
  Kitchen = 'kitchen',
  Reactor = 'reactor',
  Security = 'security',
  Dorm = 'dorm',
  Hygiene = 'hygiene',
  Hydroponics = 'hydroponics',
  LifeSupport = 'life-support',
  Lounge = 'lounge',
  Market = 'market'
}

export enum ModuleType {
  None = 'none',
  Bed = 'bed',
  Table = 'table',
  Stove = 'stove',
  GrowTray = 'grow-tray',
  Terminal = 'terminal'
}

export type VisitorArchetype = 'diner' | 'shopper' | 'lounger' | 'rusher';

export type VisitorPreference = 'cafeteria' | 'market' | 'lounge';

export enum VisitorState {
  ToCafeteria = 'to-cafeteria',
  Queueing = 'queueing',
  Eating = 'eating',
  ToLeisure = 'to-leisure',
  Leisure = 'leisure',
  ToDock = 'to-dock'
}

export interface Visitor {
  id: number;
  x: number;
  y: number;
  tileIndex: number;
  state: VisitorState;
  path: number[];
  speed: number;
  patience: number;
  eatTimer: number;
  trespassed: boolean;
  servedMeal: boolean;
  reservedTargetTile: number | null;
  blockedTicks: number;
  archetype: VisitorArchetype;
  taxSensitivity: number;
  spendMultiplier: number;
  patienceMultiplier: number;
  primaryPreference: VisitorPreference;
  spawnedAt: number;
}

export enum ResidentState {
  Idle = 'idle',
  ToCafeteria = 'to-cafeteria',
  Eating = 'eating',
  ToDorm = 'to-dorm',
  Sleeping = 'sleeping',
  ToHygiene = 'to-hygiene',
  Cleaning = 'cleaning'
}

export interface Resident {
  id: number;
  x: number;
  y: number;
  tileIndex: number;
  path: number[];
  speed: number;
  hunger: number;
  energy: number;
  hygiene: number;
  stress: number;
  state: ResidentState;
  actionTimer: number;
  retargetAt: number;
  reservedTargetTile: number | null;
  blockedTicks: number;
  airExposureSec: number;
  healthState: 'healthy' | 'distressed' | 'critical';
}

export type CrewRole = 'idle' | 'reactor' | 'cafeteria' | 'security';
export type CrewIdleReason = 'idle_available' | 'idle_no_jobs' | 'idle_resting' | 'idle_no_path' | 'idle_waiting_reassign';
export type CrewPriorityPreset = 'balanced' | 'life-support' | 'food-chain' | 'economy';
export type CrewPrioritySystem =
  | 'life-support'
  | 'reactor'
  | 'hydroponics'
  | 'kitchen'
  | 'cafeteria'
  | 'market'
  | 'lounge'
  | 'security'
  | 'hygiene';
export type CrewPriorityWeights = Record<CrewPrioritySystem, number>;
export type JobStallReason =
  | 'none'
  | 'stalled_path_blocked'
  | 'stalled_unreachable_source'
  | 'stalled_unreachable_dropoff'
  | 'stalled_no_supply';

export interface CrewMember {
  id: number;
  x: number;
  y: number;
  tileIndex: number;
  path: number[];
  speed: number;
  role: CrewRole;
  targetTile: number | null;
  retargetAt: number;
  energy: number;
  hygiene: number;
  resting: boolean;
  cleaning: boolean;
  activeJobId: number | null;
  carryingItemType: ItemType | null;
  carryingAmount: number;
  blockedTicks: number;
  idleReason: CrewIdleReason;
  restSessionActive: boolean;
  cleanSessionActive: boolean;
  restLockUntil: number;
  restCooldownUntil: number;
  taskLockUntil: number;
  shiftBucket: number;
  assignmentStickyUntil: number;
  assignmentHoldUntil: number;
  lastSystem: CrewPrioritySystem | null;
  assignedSystem: CrewPrioritySystem | null;
  retargetCountWindow: number;
}

export type ItemType = 'rawFood' | 'meal' | 'body';
export type JobType = 'pickup' | 'deliver';
export type JobState = 'pending' | 'assigned' | 'in_progress' | 'expired' | 'done';

export interface TransportJob {
  id: number;
  type: JobType;
  itemType: ItemType;
  amount: number;
  fromTile: number;
  toTile: number;
  assignedCrewId: number | null;
  createdAt: number;
  expiresAt: number;
  state: JobState;
  pickedUpAmount: number;
  completedAt: number | null;
  lastProgressAt: number;
  stallReason?: JobStallReason;
  stalledSince?: number;
}

export interface ItemNode {
  tileIndex: number;
  capacity: number;
  items: Partial<Record<ItemType, number>>;
}

export interface PendingSpawn {
  at: number;
  dockIndex: number;
}

export type SpaceLane = 'north' | 'east' | 'south' | 'west';
export type ShipType = 'tourist' | 'trader';

export type ShipSize = 'small' | 'medium' | 'large';

export type ShipStage = 'approach' | 'docked' | 'depart';

export interface ArrivingShip {
  id: number;
  size: ShipSize;
  bayTiles: number[];
  bayCenterX: number;
  bayCenterY: number;
  shipType: ShipType;
  lane: SpaceLane;
  assignedDockId: number | null;
  queueState: 'none' | 'queued';
  stage: ShipStage;
  stageTime: number;
  passengersTotal: number;
  passengersSpawned: number;
  passengersBoarded: number;
  minimumBoarding: number;
  spawnCarry: number;
  dockedAt: number;
  manifestDemand: { cafeteria: number; market: number; lounge: number };
  manifestMix: Record<VisitorArchetype, number>;
}

export interface CoreState {
  centerTile: number;
  serviceTile: number;
  frameTiles: number[];
}

export interface DockEntity {
  id: number;
  tiles: number[];
  anchorTile: number;
  area: number;
  facing: SpaceLane;
  lane: SpaceLane;
  approachTiles: number[];
  allowedShipTypes: ShipType[];
  allowedShipSizes: ShipSize[];
  maxSizeByArea: ShipSize;
  occupiedByShipId: number | null;
}

export interface DockConfigView {
  id: number;
  area: number;
  facing: SpaceLane;
  allowedShipTypes: ShipType[];
  allowedShipSizes: ShipSize[];
  maxSizeByArea: ShipSize;
}

export interface LaneProfile {
  trafficVolume: number;
  weights: Record<ShipType, number>;
}

export interface DockQueueEntry {
  shipId: number;
  lane: SpaceLane;
  shipType: ShipType;
  size: ShipSize;
  queuedAt: number;
  timeoutAt: number;
}

export interface Metrics {
  visitorsCount: number;
  residentsCount: number;
  incidentsTotal: number;
  load: number;
  capacity: number;
  loadPct: number;
  powerSupply: number;
  powerDemand: number;
  morale: number;
  stationRating: number;
  stationRatingTrendPerMin: number;
  rawFoodStock: number;
  mealStock: number;
  kitchenRawBuffer: number;
  waterStock: number;
  airQuality: number;
  pressurizationPct: number;
  leakingTiles: number;
  materials: number;
  credits: number;
  rawFoodProdRate: number;
  mealPrepRate: number;
  kitchenMealProdRate: number;
  mealUseRate: number;
  dockedShips: number;
  averageDockTime: number;
  bayUtilizationPct: number;
  exitsPerMin: number;
  shipsSkippedNoEligibleDock: number;
  shipsTimedOutInQueue: number;
  dockQueueLengthByLane: Record<SpaceLane, number>;
  avgVisitorWalkDistance: number;
  dockZonesTotal: number;
  shipDemandCafeteriaPct: number;
  shipDemandMarketPct: number;
  shipDemandLoungePct: number;
  visitorsByArchetype: Record<VisitorArchetype, number>;
  mealsServedTotal: number;
  cafeteriaNonNodeSeatedCount: number;
  maxBlockedTicksObserved: number;
  pendingJobs: number;
  assignedJobs: number;
  expiredJobs: number;
  completedJobs: number;
  createdJobs: number;
  avgJobAgeSec: number;
  deliveryLatencySec: number;
  topBacklogType: JobType | 'none';
  oldestPendingJobAgeSec: number;
  stalledJobs: number;
  deathsTotal: number;
  recentDeaths: number;
  distressedResidents: number;
  criticalResidents: number;
  bodyCount: number;
  bodyVisibleCount: number;
  bodiesClearedTotal: number;
  lifeSupportPotentialAirPerSec: number;
  lifeSupportActiveAirPerSec: number;
  airTrendPerSec: number;
  airBlockedLowAirSec: number;
  airBlockedWarningActive: boolean;
  lifeSupportInactiveReasons: string[];
  dormSleepingResidents: number;
  toDormResidents: number;
  hygieneCleaningResidents: number;
  cafeteriaQueueingCount: number;
  cafeteriaEatingCount: number;
  hydroponicsStaffed: number;
  hydroponicsActiveGrowNodes: number;
  lifeSupportActiveNodes: number;
  crewAssignedWorking: number;
  crewIdleAvailable: number;
  crewResting: number;
  crewOnLogisticsJobs: number;
  crewBlockedNoPath: number;
  crewRestCap: number;
  crewRestingNow: number;
  crewEmergencyWakeBudget: number;
  crewWokenForAir: number;
  crewPingPongPreventions: number;
  creditsGrossPerMin: number;
  creditsPayrollPerMin: number;
  creditsNetPerMin: number;
  crewRetargetsPerMin: number;
  criticalStaffDropsPerMin: number;
  visitorServiceFailuresPerMin: number;
  visitorDestinationShares: {
    cafeteria: number;
    market: number;
    lounge: number;
  };
  dormVisitsPerMin: number;
  dormFailedAttemptsPerMin: number;
  hygieneUsesPerMin: number;
  mealsConsumedPerMin: number;
  failedNeedAttemptsHunger: number;
  failedNeedAttemptsEnergy: number;
  failedNeedAttemptsHygiene: number;
  idleCrewByReason: Record<CrewIdleReason, number>;
  stalledJobsByReason: Record<JobStallReason, number>;
  crewMoraleDrivers: string[];
  stationRatingDrivers: string[];
  topRoomWarnings: string[];
  criticalUnstaffedSec: {
    lifeSupport: number;
    hydroponics: number;
    kitchen: number;
  };
}

export interface RoomDiagnostic {
  room: RoomType;
  active: boolean;
  reasons: string[];
  clusterSize: number;
  warnings: string[];
}

export interface CrewState {
  total: number;
  assigned: number;
  free: number;
}

export interface RoomOps {
  cafeteriasTotal: number;
  cafeteriasActive: number;
  kitchenTotal: number;
  kitchenActive: number;
  securityTotal: number;
  securityActive: number;
  reactorsTotal: number;
  reactorsActive: number;
  dormsTotal: number;
  dormsActive: number;
  hygieneTotal: number;
  hygieneActive: number;
  hydroponicsTotal: number;
  hydroponicsActive: number;
  lifeSupportTotal: number;
  lifeSupportActive: number;
  loungeTotal: number;
  loungeActive: number;
  marketTotal: number;
  marketActive: number;
}

export interface Effects {
  cafeteriaStallUntil: number;
  brownoutUntil: number;
  securityDelayUntil: number;
  blockedUntilByTile: Map<number, number>;
}

export interface Controls {
  paused: boolean;
  simSpeed: 1 | 2 | 4;
  shipsPerCycle: number;
  showZones: boolean;
  showServiceNodes: boolean;
  taxRate: number;
  dockPlacementFacing: SpaceLane;
  crewPriorityPreset: CrewPriorityPreset;
  crewPriorityWeights: CrewPriorityWeights;
}

export interface StationState {
  width: number;
  height: number;
  tiles: TileType[];
  zones: ZoneType[];
  rooms: RoomType[];
  modules: ModuleType[];
  core: CoreState;
  docks: DockEntity[];
  laneProfiles: Record<SpaceLane, LaneProfile>;
  dockQueue: DockQueueEntry[];
  pressurized: boolean[];
  pathOccupancyByTile: Map<number, number>;
  jobs: TransportJob[];
  itemNodes: ItemNode[];
  visitors: Visitor[];
  residents: Resident[];
  crewMembers: CrewMember[];
  arrivingShips: ArrivingShip[];
  pendingSpawns: PendingSpawn[];
  metrics: Metrics;
  controls: Controls;
  effects: Effects;
  rng: () => number;
  now: number;
  lastCycleTime: number;
  cycleDuration: number;
  spawnCounter: number;
  shipSpawnCounter: number;
  crewSpawnCounter: number;
  residentSpawnCounter: number;
  lastResidentSpawnAt: number;
  jobSpawnCounter: number;
  incidentHeat: number;
  lastPayrollAt: number;
  recentExitTimes: number[];
  dockedTimeTotal: number;
  dockedShipsCompleted: number;
  bodyTiles: number[];
  recentDeathTimes: number[];
  clusterActivationState: Map<string, { active: boolean; failedSec: number }>;
  criticalStaffPrevUnmet: {
    lifeSupport: boolean;
    hydroponics: boolean;
    kitchen: boolean;
  };
  usageTotals: {
    dorm: number;
    hygiene: number;
    meals: number;
    crewRetargets: number;
    visitorServiceFailures: number;
    creditsMarketGross: number;
    creditsMealPayoutGross: number;
    payrollPaid: number;
    visitorLeisureEntries: {
      cafeteria: number;
      market: number;
      lounge: number;
    };
    ratingDelta: number;
    ratingFromShipTimeout: number;
    ratingFromShipSkip: number;
    ratingFromVisitorFailure: number;
    ratingFromWalkDissatisfaction: number;
    visitorWalkDistance: number;
    visitorWalkTrips: number;
    criticalStaffDrops: number;
    criticalUnstaffedSec: {
      lifeSupport: number;
      hydroponics: number;
      kitchen: number;
    };
  };
  failedNeedAttempts: {
    hunger: number;
    energy: number;
    hygiene: number;
    dorm: number;
  };
  crew: CrewState;
  ops: RoomOps;
}

export interface BuildTool {
  kind: 'tile' | 'zone' | 'room' | 'module';
  tile?: TileType;
  zone?: ZoneType;
  room?: RoomType;
  module?: ModuleType;
}

export const WALKABLE_TILES = new Set<TileType>([
  TileType.Floor,
  TileType.Dock,
  TileType.Cafeteria,
  TileType.Reactor,
  TileType.Security,
  TileType.Door
]);

export function toIndex(x: number, y: number, width: number): number {
  return y * width + x;
}

export function inBounds(x: number, y: number, width: number, height: number): boolean {
  return x >= 0 && y >= 0 && x < width && y < height;
}

export function fromIndex(index: number, width: number): { x: number; y: number } {
  return { x: index % width, y: Math.floor(index / width) };
}

export function isWalkable(tile: TileType): boolean {
  return WALKABLE_TILES.has(tile);
}

export function makeRng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
