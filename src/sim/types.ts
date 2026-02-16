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

export type IncidentType = 'fight' | 'trespass';
export type IncidentStage = 'detected' | 'dispatching' | 'intervening' | 'intervening_extended' | 'resolved' | 'failed';
export type IncidentOutcome = 'warning' | 'deescalated' | 'detained' | 'fatality' | 'escaped';

export enum RoomType {
  None = 'none',
  Cafeteria = 'cafeteria',
  Kitchen = 'kitchen',
  Workshop = 'workshop',
  Clinic = 'clinic',
  Brig = 'brig',
  RecHall = 'rec-hall',
  Reactor = 'reactor',
  Security = 'security',
  Dorm = 'dorm',
  Hygiene = 'hygiene',
  Hydroponics = 'hydroponics',
  LifeSupport = 'life-support',
  Lounge = 'lounge',
  Market = 'market',
  LogisticsStock = 'logistics-stock',
  Storage = 'storage'
}

export type HousingPolicy = 'crew' | 'visitor' | 'resident' | 'private_resident';

export enum ModuleType {
  None = 'none',
  Bed = 'bed',
  Table = 'table',
  ServingStation = 'serving-station',
  Stove = 'stove',
  Workbench = 'workbench',
  MedBed = 'med-bed',
  CellConsole = 'cell-console',
  RecUnit = 'rec-unit',
  GrowStation = 'grow-station',
  GrowTray = 'grow-station',
  Terminal = 'terminal',
  Couch = 'couch',
  GameStation = 'game-station',
  Shower = 'shower',
  Sink = 'sink',
  MarketStall = 'market-stall',
  IntakePallet = 'intake-pallet',
  StorageRack = 'storage-rack'
}

export type ModuleRotation = 0 | 90;

export interface ModuleInstance {
  id: number;
  type: ModuleType;
  originTile: number;
  rotation: ModuleRotation;
  width: number;
  height: number;
  tiles: number[];
  legacyForced?: boolean;
}

export interface ModuleRequirement {
  module: ModuleType;
  count: number;
}

export interface RoomDefinition {
  minTiles: number;
  requiredModules: ModuleRequirement[];
  requiredAnyOf: ModuleType[];
  activationChecks: {
    door: boolean;
    path: boolean;
    pressurization: boolean;
  };
  staffedPostMode: 'none' | 'required';
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
  carryingMeal: boolean;
  reservedServingTile: number | null;
  reservedTargetTile: number | null;
  blockedTicks: number;
  archetype: VisitorArchetype;
  taxSensitivity: number;
  spendMultiplier: number;
  patienceMultiplier: number;
  primaryPreference: VisitorPreference;
  spawnedAt: number;
  originShipId: number | null;
  airExposureSec: number;
  healthState: 'healthy' | 'distressed' | 'critical';
}

export enum ResidentState {
  Idle = 'idle',
  ToCafeteria = 'to-cafeteria',
  Eating = 'eating',
  ToDorm = 'to-dorm',
  Sleeping = 'sleeping',
  ToHygiene = 'to-hygiene',
  Cleaning = 'cleaning',
  ToLeisure = 'to-leisure',
  Leisure = 'leisure',
  ToSecurity = 'to-security',
  ToHomeShip = 'to-home-ship'
}

export type ResidentRoutinePhase = 'rest' | 'errands' | 'work' | 'socialize' | 'winddown';
export type ResidentRole = 'none' | 'market_helper' | 'hydro_assist' | 'civic_watch';

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
  social: number;
  safety: number;
  stress: number;
  routinePhase: ResidentRoutinePhase;
  role: ResidentRole;
  roleAffinity: Partial<Record<RoomType, number>>;
  state: ResidentState;
  actionTimer: number;
  retargetAt: number;
  reservedTargetTile: number | null;
  homeShipId: number | null;
  homeDockId: number | null;
  housingUnitId: number | null;
  bedModuleId: number | null;
  satisfaction: number;
  leaveIntent: number;
  blockedTicks: number;
  airExposureSec: number;
  healthState: 'healthy' | 'distressed' | 'critical';
  agitation?: number;
  activeIncidentId?: number | null;
  confrontationUntil?: number;
}

export type CrewRole = 'idle' | 'reactor' | 'cafeteria' | 'security';
export type CrewIdleReason = 'idle_available' | 'idle_no_jobs' | 'idle_resting' | 'idle_no_path' | 'idle_waiting_reassign';
export type CrewPriorityPreset = 'balanced' | 'life-support' | 'food-chain' | 'economy';
export type CrewPrioritySystem =
  | 'life-support'
  | 'reactor'
  | 'hydroponics'
  | 'kitchen'
  | 'workshop'
  | 'cafeteria'
  | 'market'
  | 'lounge'
  | 'security'
  | 'hygiene';
export type CrewPriorityWeights = Record<CrewPrioritySystem, number>;
export type CrewTaskKind = 'critical_post' | 'post' | 'logistics';
export interface CrewTaskCandidate {
  id: string;
  kind: CrewTaskKind;
  system: CrewPrioritySystem | 'logistics';
  tileIndex: number;
  score: number;
  critical: boolean;
  protectedMinimum: boolean;
}
export interface CriticalCapacityTargets {
  requiredReactorPosts: number;
  requiredLifeSupportPosts: number;
  requiredHydroPosts: number;
  requiredKitchenPosts: number;
  requiredCafeteriaPosts: number;
}
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
  airExposureSec: number;
  healthState: 'healthy' | 'distressed' | 'critical';
}

export type ItemType = 'rawMeal' | 'meal' | 'rawMaterial' | 'tradeGood' | 'body';
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
export type CardinalDirection = 'north' | 'east' | 'south' | 'west';
export type ShipType = 'tourist' | 'trader' | 'industrial' | 'military' | 'colonist';
export type DockPurpose = 'visitor' | 'residential';
export type ShipServiceTag =
  | 'cafeteria'
  | 'market'
  | 'lounge'
  | 'workshop'
  | 'security'
  | 'hygiene'
  | 'housing'
  | 'clinic'
  | 'recreation';
export interface ShipProfile {
  type: ShipType;
  serviceTags: ShipServiceTag[];
  manifestBaseline: { cafeteria: number; market: number; lounge: number };
  militaryPenaltyWeight: number;
  conversionChanceMultiplier: number;
}

export type ShipSize = 'small' | 'medium' | 'large';

export type ShipStage = 'approach' | 'docked' | 'depart';

export interface ArrivingShip {
  id: number;
  kind: 'transient' | 'resident_home';
  size: ShipSize;
  bayTiles: number[];
  bayCenterX: number;
  bayCenterY: number;
  shipType: ShipType;
  lane: SpaceLane;
  originDockId: number | null;
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
  residentIds: number[];
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
  purpose: DockPurpose;
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
  purpose: DockPurpose;
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

export interface IncidentEntity {
  id: number;
  type: IncidentType;
  tileIndex: number;
  severity: number;
  createdAt: number;
  dispatchAt: number | null;
  interveneAt: number | null;
  resolveBy: number;
  stage: IncidentStage;
  outcome: IncidentOutcome | null;
  resolvedAt: number | null;
  assignedCrewId: number | null;
  residentParticipantIds: number[];
  extendedResolveAt: number | null;
}

export interface Metrics {
  tickMs: number;
  renderMs: number;
  pathMs: number;
  pathCallsPerTick: number;
  derivedRecomputeMs: number;
  visitorsCount: number;
  residentsCount: number;
  incidentsTotal: number;
  incidentsOpen: number;
  incidentsResolved: number;
  incidentsFailed: number;
  securityDispatches: number;
  securityResponseAvgSec: number;
  residentConfrontations: number;
  securityCoveragePct: number;
  incidentSuppressionAvg: number;
  immediateDefuseRate: number;
  escalatedFightRate: number;
  residentSocialAvg: number;
  residentSafetyAvg: number;
  load: number;
  capacity: number;
  loadPct: number;
  powerSupply: number;
  powerDemand: number;
  morale: number;
  stationRating: number;
  stationRatingTrendPerMin: number;
  unlockTier: UnlockTier;
  unlockProgressText: string;
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
  workshopTradeGoodProdRate: number;
  marketTradeGoodUseRate: number;
  marketTradeGoodStock: number;
  mealUseRate: number;
  dockedShips: number;
  visitorBerthsTotal: number;
  visitorBerthsOccupied: number;
  residentBerthsTotal: number;
  residentBerthsOccupied: number;
  residentShipsDocked: number;
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
  tradeGoodsSoldPerMin: number;
  marketStockoutsPerMin: number;
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
  stationRatingPenaltyPerMin: {
    queueTimeout: number;
    noEligibleDock: number;
    serviceFailure: number;
    longWalks: number;
  };
  stationRatingPenaltyTotal: {
    queueTimeout: number;
    noEligibleDock: number;
    serviceFailure: number;
    longWalks: number;
  };
  stationRatingBonusPerMin: {
    mealService: number;
    leisureService: number;
    successfulExit: number;
    residentRetention: number;
  };
  stationRatingBonusTotal: {
    mealService: number;
    leisureService: number;
    successfulExit: number;
    residentRetention: number;
  };
  stationRatingServiceFailureByReasonPerMin: {
    noLeisurePath: number;
    shipServicesMissing: number;
    patienceBail: number;
    dockTimeout: number;
    trespass: number;
  };
  stationRatingServiceFailureByReasonTotal: {
    noLeisurePath: number;
    shipServicesMissing: number;
    patienceBail: number;
    dockTimeout: number;
    trespass: number;
  };
  shipsByTypePerMin: Record<ShipType, number>;
  residentTaxPerMin: number;
  residentTaxCollectedTotal: number;
  residentConversionAttempts: number;
  residentConversionSuccesses: number;
  residentDepartures: number;
  residentSatisfactionAvg: number;
  topRoomWarnings: string[];
  criticalUnstaffedSec: {
    lifeSupport: number;
    hydroponics: number;
    kitchen: number;
  };
  requiredCriticalStaff: {
    reactor: number;
    lifeSupport: number;
    hydroponics: number;
    kitchen: number;
    cafeteria: number;
  };
  assignedCriticalStaff: {
    reactor: number;
    lifeSupport: number;
    hydroponics: number;
    kitchen: number;
    cafeteria: number;
  };
  activeCriticalStaff: {
    reactor: number;
    lifeSupport: number;
    hydroponics: number;
    kitchen: number;
    cafeteria: number;
  };
  criticalShortfallSec: {
    reactor: number;
    lifeSupport: number;
    hydroponics: number;
    kitchen: number;
    cafeteria: number;
  };
  logisticsDispatchSlots: number;
  logisticsPressure: number;
  staffInTransitBySystem: {
    reactor: number;
    lifeSupport: number;
    hydroponics: number;
    kitchen: number;
    cafeteria: number;
  };
}

export interface DerivedRoomDiagnostics {
  diagnosticsByAnchor: Map<number, RoomDiagnostic>;
  inspectionsByAnchor: Map<number, RoomInspector>;
}

export interface ServiceReachabilityCache {
  nodeTiles: number[];
  unreachableNodeTiles: number[];
}

export interface DerivedCache {
  serviceTargetsByRoom: Map<RoomType, number[]>;
  queueTargets: number[];
  queueTargetSet: Set<number>;
  roomClustersByRoom: Map<RoomType, number[][]>;
  clusterByTile: Map<number, { room: RoomType; anchor: number; cluster: number[] }>;
  dockByTile: Map<number, DockEntity>;
  itemNodeByTile: Map<number, ItemNode>;
  pathCache: Map<string, { path: number[]; createdAt: number; topologyVersion: number; roomVersion: number }>;
  activeRoomTiles: Set<number>;
  serviceReachability: ServiceReachabilityCache;
  diagnostics: DerivedRoomDiagnostics;
  cacheVersions: {
    serviceTargetsVersion: string;
    queueTargetsVersion: string;
    roomClustersVersion: string;
    dockEntitiesTopologyVersion: number;
    dockByTileDockVersion: number;
    itemNodeByTileModuleVersion: number;
    activeRoomTilesVersion: string;
    serviceReachabilityVersion: string;
    diagnosticsVersion: string;
    pressurizationTopologyVersion: number;
  };
}

export interface RoomDiagnostic {
  room: RoomType;
  active: boolean;
  reasons: string[];
  clusterSize: number;
  warnings: string[];
}

export interface RoomInspector {
  room: RoomType;
  active: boolean;
  clusterSize: number;
  minTilesRequired: number;
  minTilesMet: boolean;
  doorCount: number;
  pressurizedPct: number;
  staffCount: number;
  requiredStaff: number;
  hasServiceNode: boolean;
  serviceNodeCount: number;
  reachableServiceNodeCount: number;
  unreachableServiceNodeCount: number;
  moduleProgress: Array<{ module: ModuleType; have: number; need: number }>;
  anyOfProgress: { modules: ModuleType[]; satisfied: boolean };
  hasPath: boolean;
  reasons: string[];
  warnings: string[];
  hints: string[];
  housingPolicy?: HousingPolicy;
  inventory?: {
    used: number;
    capacity: number;
    fillPct: number;
    nodeCount: number;
    byItem: Partial<Record<ItemType, number>>;
  };
  flowHints?: string[];
  cafeteriaLoad?: {
    tableNodes: number;
    queueNodes: number;
    queueingVisitors: number;
    eatingVisitors: number;
    highPatienceWaiting: number;
    pressure: 'low' | 'medium' | 'high';
  };
}

export interface HousingInspector {
  room: RoomType;
  policy: HousingPolicy;
  bedsTotal: number;
  bedsAssigned: number;
  hygieneTargets: number;
  validPrivateHousing: boolean;
}

export type AgentInspectorKind = 'visitor' | 'resident';
export type AgentHealthState = 'healthy' | 'distressed' | 'critical';
export type VisitorDesire = 'eat' | 'leisure' | 'exit_station';
export type ResidentDominantNeed = 'hunger' | 'energy' | 'hygiene' | 'none';
export type ResidentDesire = 'return_home_ship' | 'sleep' | 'hygiene' | 'eat' | 'socialize' | 'seek_safety' | 'wander';

export interface AgentInspectorBase {
  id: number;
  kind: AgentInspectorKind;
  state: string;
  tileIndex: number;
  x: number;
  y: number;
  healthState: AgentHealthState;
  blockedTicks: number;
  pathLength: number;
  targetTile: number | null;
  currentAction: string;
  actionReason: string;
}

export interface VisitorInspector extends AgentInspectorBase {
  kind: 'visitor';
  state: VisitorState;
  archetype: VisitorArchetype;
  primaryPreference: VisitorPreference;
  patience: number;
  servedMeal: boolean;
  carryingMeal: boolean;
  reservedServingTile: number | null;
  reservedTargetTile: number | null;
  desire: VisitorDesire;
}

export interface ResidentInspector extends AgentInspectorBase {
  kind: 'resident';
  state: ResidentState;
  role: ResidentRole;
  hunger: number;
  energy: number;
  hygiene: number;
  social: number;
  safety: number;
  routinePhase: ResidentRoutinePhase;
  stress: number;
  agitation: number;
  inConfrontation: boolean;
  satisfaction: number;
  leaveIntent: number;
  homeDockId: number | null;
  homeShipId: number | null;
  housingUnitId: number | null;
  bedModuleId: number | null;
  dominantNeed: ResidentDominantNeed;
  desire: ResidentDesire;
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
  clinicTotal: number;
  clinicActive: number;
  brigTotal: number;
  brigActive: number;
  recHallTotal: number;
  recHallActive: number;
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
  workshopTotal: number;
  workshopActive: number;
  loungeTotal: number;
  loungeActive: number;
  marketTotal: number;
  marketActive: number;
  logisticsStockTotal: number;
  logisticsStockActive: number;
  storageTotal: number;
  storageActive: number;
}

export interface MapExpansionState {
  purchased: Record<CardinalDirection, boolean>;
  purchasesMade: number;
}

export type UnlockTier = 0 | 1 | 2 | 3;
export type UnlockId = 'tier1_stability' | 'tier2_logistics' | 'tier3_civic';

export interface UnlockDefinition {
  id: UnlockId;
  tier: UnlockTier;
  name: string;
  description: string;
}

export interface UnlockState {
  tier: UnlockTier;
  unlockedIds: UnlockId[];
  unlockedAtSec: Partial<Record<UnlockId, number>>;
}

export interface Effects {
  cafeteriaStallUntil: number;
  brownoutUntil: number;
  securityDelayUntil: number;
  blockedUntilByTile: Map<number, number>;
  trespassCooldownUntilByTile: Map<number, number>;
  securityAuraByTile: Map<number, number>;
}

export interface Controls {
  paused: boolean;
  simSpeed: 1 | 2 | 4;
  shipsPerCycle: number;
  showZones: boolean;
  showServiceNodes: boolean;
  showInventoryOverlay: boolean;
  taxRate: number;
  dockPlacementFacing: SpaceLane;
  moduleRotation: ModuleRotation;
  crewPriorityPreset: CrewPriorityPreset;
  crewPriorityWeights: CrewPriorityWeights;
}

export interface StationState {
  width: number;
  height: number;
  tiles: TileType[];
  zones: ZoneType[];
  rooms: RoomType[];
  roomHousingPolicies: HousingPolicy[];
  modules: ModuleType[];
  moduleInstances: ModuleInstance[];
  moduleOccupancyByTile: Array<number | null>;
  core: CoreState;
  docks: DockEntity[];
  laneProfiles: Record<SpaceLane, LaneProfile>;
  dockQueue: DockQueueEntry[];
  pressurized: boolean[];
  pathOccupancyByTile: Map<number, number>;
  jobs: TransportJob[];
  itemNodes: ItemNode[];
  legacyMaterialStock: number;
  incidents: IncidentEntity[];
  visitors: Visitor[];
  residents: Resident[];
  crewMembers: CrewMember[];
  arrivingShips: ArrivingShip[];
  pendingSpawns: PendingSpawn[];
  metrics: Metrics;
  controls: Controls;
  effects: Effects;
  topologyVersion: number;
  roomVersion: number;
  moduleVersion: number;
  dockVersion: number;
  derived: DerivedCache;
  rng: () => number;
  now: number;
  lastCycleTime: number;
  cycleDuration: number;
  spawnCounter: number;
  shipSpawnCounter: number;
  crewSpawnCounter: number;
  residentSpawnCounter: number;
  lastResidentSpawnAt: number;
  moduleSpawnCounter: number;
  jobSpawnCounter: number;
  incidentSpawnCounter: number;
  incidentHeat: number;
  lastPayrollAt: number;
  lastResidentTaxAt: number;
  recentExitTimes: number[];
  dockedTimeTotal: number;
  dockedShipsCompleted: number;
  bodyTiles: number[];
  recentDeathTimes: number[];
  clusterActivationState: Map<string, { active: boolean; failedSec: number }>;
  criticalStaffPrevUnmet: {
    reactor: boolean;
    lifeSupport: boolean;
    hydroponics: boolean;
    kitchen: boolean;
    cafeteria: boolean;
  };
  usageTotals: {
    dorm: number;
    hygiene: number;
    meals: number;
    crewRetargets: number;
    visitorServiceFailures: number;
    creditsMarketGross: number;
    creditsTradeGoodsGross: number;
    creditsMealPayoutGross: number;
    payrollPaid: number;
    tradeGoodsSold: number;
    marketStockouts: number;
    shipsByType: Record<ShipType, number>;
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
    ratingFromVisitorFailureByReason: {
      noLeisurePath: number;
      shipServicesMissing: number;
      patienceBail: number;
      dockTimeout: number;
      trespass: number;
    };
    ratingFromVisitorSuccessByReason: {
      mealService: number;
      leisureService: number;
      successfulExit: number;
      residentRetention: number;
    };
    residentTaxesCollected: number;
    residentConversionAttempts: number;
    residentConversionSuccesses: number;
    residentDepartures: number;
    ratingFromResidentDeparture: number;
    ratingFromResidentRetention: number;
    visitorWalkDistance: number;
    visitorWalkTrips: number;
    criticalStaffDrops: number;
    securityDispatches: number;
    securityResolved: number;
    securityResponseSecTotal: number;
    securityFightInterventions: number;
    securityImmediateDefuses: number;
    securityEscalatedFights: number;
    incidentsFailed: number;
    residentConfrontations: number;
    incidentSuppressionSampleCount: number;
    incidentSuppressionSampleSum: number;
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
  mapExpansion: MapExpansionState;
  unlocks: UnlockState;
}

export interface BuildTool {
  kind: 'none' | 'tile' | 'zone' | 'room' | 'module';
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
