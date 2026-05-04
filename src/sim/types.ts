export const GRID_WIDTH = 100;
export const GRID_HEIGHT = 80;
export const TILE_SIZE = 32;

// Which offline sprite-generator pipeline produced the atlas currently
// loaded at runtime. Single-option for now (curated baseline); designed
// as a union so a future gpt-image-1 alternate can slot in without
// rewiring the runtime toggle. Pixellab option was removed per owner
// feedback: generator output was too low-quality to ship.
export type SpritePipeline = 'nano-banana';

export enum TileType {
  Space = 'space',
  Truss = 'truss',
  Floor = 'floor',
  Wall = 'wall',
  Dock = 'dock',
  Cafeteria = 'cafeteria',
  Reactor = 'reactor',
  Security = 'security',
  Door = 'door',
  Airlock = 'airlock'
}

export enum ZoneType {
  Public = 'public',
  Restricted = 'restricted'
}

export type PathIntent = 'visitor' | 'resident' | 'crew' | 'logistics' | 'security';

export interface PathOptions {
  allowRestricted: boolean;
  intent: PathIntent;
  routeSeed?: number;
}

export interface RouteExposure {
  distance: number;
  publicTiles: number;
  serviceTiles: number;
  cargoTiles: number;
  residentialTiles: number;
  securityTiles: number;
  socialTiles: number;
  crowdCost: number;
}

export interface RoomEnvironmentTraits {
  visitorStatus: number;
  residentialComfort: number;
  serviceNoise: number;
  publicAppeal: number;
}

export interface RoomEnvironmentScore extends RoomEnvironmentTraits {
  sampledTiles: number;
}

export type DiagnosticOverlay =
  | 'none'
  | 'life-support'
  | 'map-conditions'
  | 'visitor-status'
  | 'resident-comfort'
  | 'service-noise'
  | 'sanitation'
  | 'maintenance'
  | 'route-pressure';

export type DriftSeverity = 'none' | 'low' | 'warning' | 'active' | 'severe';
export type MapConditionKind = 'sunlight' | 'debris-risk' | 'thermal-sink';

export interface MapConditionSample {
  kind: MapConditionKind;
  value: number;
  label: string;
  upside: string;
  downside: string;
}

export type IncidentType = 'fight' | 'trespass';
export type IncidentStage = 'detected' | 'dispatching' | 'intervening' | 'intervening_extended' | 'resolved' | 'failed';
export type IncidentOutcome = 'warning' | 'deescalated' | 'detained' | 'fatality' | 'escaped';

export enum RoomType {
  None = 'none',
  Bridge = 'bridge',
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
  Storage = 'storage',
  // Berth: dock-migration v0. A regular rectangular room paint that ships
  // dock *inside*. Capability tags are derived from contained modules
  // (Gangway/CustomsCounter/CargoArm) — see `computeBerthCapabilities`
  // in sim.ts. v1 will add U-shape strict validation.
  Berth = 'berth',
  // Cantina: bar / drinks venue. Distinct from Lounge: faster turnaround,
  // higher per-visitor revenue, social environment. Modules: BarCounter, Tap.
  // Visitors and crew route here for drinks during leisure circuits.
  Cantina = 'cantina',
  // Observatory: passive wonder room. Visitors gain a "wonder" leisure boost
  // (longer dwell, higher rating contribution). Modules: Telescope.
  Observatory = 'observatory'
}

// Berth capability tags drive ship→berth matching in v0.
// Each tag is contributed by a specific module type placed inside the berth.
// v1: add 'military_bridge' and 'refuel' tags + their modules.
export type CapabilityTag = 'gangway' | 'customs' | 'cargo';

// Berth size class derived from tile count when the berth cluster is
// identified. Thresholds: S >= 9, M >= 20, L >= 42 tiles. Stored
// nowhere — computed on demand from a cluster's length.
export type BerthSizeClass = 'small' | 'medium' | 'large';

export type HousingPolicy = 'crew' | 'visitor' | 'resident' | 'private_resident';

export enum ModuleType {
  None = 'none',
  CaptainConsole = 'captain-console',
  SanitationTerminal = 'sanitation-terminal',
  SecurityTerminal = 'security-terminal',
  MechanicalTerminal = 'mechanical-terminal',
  IndustrialTerminal = 'industrial-terminal',
  NavigationTerminal = 'navigation-terminal',
  CommsTerminal = 'comms-terminal',
  MedicalTerminal = 'medical-terminal',
  ResearchTerminal = 'research-terminal',
  LogisticsTerminal = 'logistics-terminal',
  FleetCommandTerminal = 'fleet-command-terminal',
  TrafficControlTerminal = 'traffic-control-terminal',
  ResourceManagementTerminal = 'resource-management-terminal',
  PowerManagementTerminal = 'power-management-terminal',
  LifeSupportTerminal = 'life-support-terminal',
  AtmosphereControlTerminal = 'atmosphere-control-terminal',
  AiCoreTerminal = 'ai-core-terminal',
  EmergencyControlTerminal = 'emergency-control-terminal',
  RecordsTerminal = 'records-terminal',
  WallLight = 'wall-light',
  Bed = 'bed',
  Table = 'table',
  ServingStation = 'serving-station',
  Stove = 'stove',
  Workbench = 'workbench',
  MedBed = 'med-bed',
  CellConsole = 'cell-console',
  RecUnit = 'rec-unit',
  GrowStation = 'grow-station',
  Terminal = 'terminal',
  Couch = 'couch',
  GameStation = 'game-station',
  Shower = 'shower',
  Sink = 'sink',
  MarketStall = 'market-stall',
  IntakePallet = 'intake-pallet',
  StorageRack = 'storage-rack',
  // Dock-migration v0: capability modules for the new Berth room.
  // Footprints: Gangway 1x1, CustomsCounter 1x1, CargoArm 2x2.
  // All three are allowedRooms: [RoomType.Berth] in MODULE_DEFINITIONS.
  // v1: tier-gate (Gangway T0, Customs T1, CargoArm T2) — currently T0
  // for ease of testing.
  Gangway = 'gangway',
  CustomsCounter = 'customs-counter',
  CargoArm = 'cargo-arm',
  FireExtinguisher = 'fire-extinguisher',
  // Vent module: 1x1 air-distribution node. Acts as a secondary life-support
  // source within VENT_REACH_FROM_LS tiles of an active LS cluster, projecting
  // fresh-air coverage in a radius. Lets the player extend air to a remote
  // wing without putting a second LS room there.
  Vent = 'vent',
  // Vending machine: 1x1 leisure module placed in any social room
  // (Cafeteria, Lounge, Market, RecHall). Visitors in Leisure state on this
  // tile spend extra credits per second (small but visible bonus). Gives the
  // player a per-tile knob to boost a busy social room's revenue.
  VendingMachine = 'vending-machine',
  // Bench: 1x1 cosmetic seat. Allowed in social rooms (Cafeteria, Lounge,
  // Market, RecHall). Slight room comfort bump via the existing public-appeal
  // signal — visible decoration that the player can sprinkle around.
  Bench = 'bench',
  // BarCounter: 2x1 anchor of a Cantina. Acts as a serving point — visitors
  // queue at the counter to receive a drink, then sit nearby (Bench/Couch).
  BarCounter = 'bar-counter',
  // Tap: 1x1 in Cantina. Each tap multiplies the cantina's drink throughput,
  // letting the player scale a busy bar without a second room.
  Tap = 'tap',
  // Telescope: 2x2 in Observatory. Visitors using a telescope dwell longer
  // and get a wonder rating bonus. Premium leisure module.
  Telescope = 'telescope',
  // WaterFountain: 1x1 thirst relief allowed in any room. Crew route here
  // when thirsty if no Cantina is available.
  WaterFountain = 'water-fountain',
  // Plant: 1x1 decorative. Allowed anywhere; small public-appeal +
  // residential-comfort bonus to surrounding tiles.
  Plant = 'plant'
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
  lastRouteExposure?: RouteExposure;
  hygieneStopUsed?: boolean;
  // Multi-leg leisure: long-stay archetypes (lounger, shopper) cycle through
  // 2-3 leisure stops (eat → market → lounge → exit, etc). Legs decrement on
  // each completed Leisure dwell; lastLeisureKind biases the next leg toward
  // a different room type so visitors don't loop the same lounge twice.
  leisureLegsRemaining: number;
  leisureLegsPlanned: number;
  lastLeisureKind: 'market' | 'lounge' | 'recHall' | 'hygiene' | 'cantina' | 'observatory' | 'vending' | null;
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
  lastRouteExposure?: RouteExposure;
}

export type CrewRole = 'idle' | 'reactor' | 'cafeteria' | 'security';
export type CrewIdleReason = 'idle_available' | 'idle_no_jobs' | 'idle_resting' | 'idle_no_path' | 'idle_waiting_reassign';
export type CrewWorkLane = 'food' | 'sanitation' | 'engineering' | 'logistics' | 'construction-eva' | 'flex';
export type StaffRole =
  | 'captain'
  | 'sanitation-officer'
  | 'security-officer'
  | 'mechanic-officer'
  | 'industrial-officer'
  | 'navigation-officer'
  | 'comms-officer'
  | 'medical-officer'
  | 'cook'
  | 'cleaner'
  | 'janitor'
  | 'botanist'
  | 'technician'
  | 'engineer'
  | 'mechanic'
  | 'welder'
  | 'doctor'
  | 'nurse'
  | 'security-guard'
  | 'assistant'
  | 'eva-specialist'
  | 'eva-engineer'
  | 'flight-controller'
  | 'docking-officer';
export type StaffDepartment =
  | 'command'
  | 'sanitation'
  | 'security'
  | 'mechanical'
  | 'industrial'
  | 'navigation'
  | 'communications'
  | 'medical'
  | 'logistics'
  | 'food'
  | 'eva'
  | 'general';
export type SpecialtyId =
  | 'sanitation-program'
  | 'security-command'
  | 'industrial-logistics'
  | 'mechanical-maintenance'
  | 'medical-services'
  | 'navigation-traffic'
  | 'communications-comms'
  | 'research-archives';
export type SpecialtyState = 'locked' | 'available' | 'active' | 'completed';
export type StaffRoleCounts = Record<StaffRole, number>;

export interface SpecialtyProgress {
  id: SpecialtyId;
  state: SpecialtyState;
  progress: number;
  selectedAt: number | null;
  completedAt: number | null;
}

export type DepartmentInactiveReason =
  | 'specialty-not-completed'
  | 'no-officer'
  | 'no-bridge'
  | 'no-terminal'
  | 'unreachable';

export interface DepartmentRuntime {
  active: boolean;
  inactiveReason: DepartmentInactiveReason | null;
  officerRole: StaffRole | null;
  terminal: ModuleType | null;
  specialty: SpecialtyId | null;
}

export interface CommandState {
  selectedSpecialty: SpecialtyId | null;
  completedSpecialties: SpecialtyId[];
  specialtyProgress: Record<SpecialtyId, SpecialtyProgress>;
  officers: Partial<Record<StaffRole, boolean>>;
  bridgeStaffing: {
    captainConsoleStaffed: boolean;
    activeTerminalStaff: number;
    requiredTerminalStaff: number;
  };
  departments: Record<StaffDepartment, DepartmentRuntime>;
}
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
export type MaintenanceSystem = 'reactor' | 'life-support';
export interface MaintenanceDebt {
  key: string;
  system: MaintenanceSystem;
  anchorTile: number;
  debt: number;
  lastServicedAt: number;
  // Time when debt first crossed the fire-ignition threshold. Reset to 0 when
  // debt drops back under the threshold. Used to require a grace window before
  // a sustained spike actually catches fire.
  ignitionRiskSince?: number;
}

export interface LifeSupportCoverageDiagnostic {
  distanceByTile: Int16Array;
  sourceCount: number;
  coveredTiles: number;
  walkablePressurizedTiles: number;
  poorTiles: number;
  avgDistance: number;
  coveragePct: number;
  hasLifeSupportSystem: boolean;
}

export interface LifeSupportTileDiagnostic {
  tileIndex: number;
  walkablePressurized: boolean;
  hasLifeSupportSystem: boolean;
  sourceCount: number;
  reachable: boolean;
  distance: number | null;
  poorCoverage: boolean;
  noActiveSource: boolean;
}

export interface RoomEnvironmentTileDiagnostic extends RoomEnvironmentScore {
  visitorDiscomfort: number;
  residentDiscomfort: number;
}

export interface MaintenanceTileDiagnostic {
  system: MaintenanceSystem;
  anchorTile: number;
  debt: number;
  outputMultiplier: number;
}

export type RoutePressureDominant = 'visitor' | 'resident' | 'crew' | 'logistics' | null;

export type SanitationSource =
  | 'none'
  | 'traffic'
  | 'meals'
  | 'hygiene'
  | 'kitchen'
  | 'hydroponics'
  | 'market'
  | 'fire'
  | 'body'
  | 'mixed';

export type SanitationSeverity = 'clean' | 'lived-in' | 'dirty' | 'filthy';

export interface SanitationTileDiagnostic {
  tileIndex: number;
  dirt: number;
  severity: SanitationSeverity;
  driftSeverity: DriftSeverity;
  dominantSource: SanitationSource;
  room: RoomType;
  roomAnchor: number | null;
  roomAverage: number;
  cleaningJobOpen: boolean;
  reachableByCrew: boolean;
  effectSummary: string;
  suggestedFix: string;
}

export interface SanitationRoomDiagnostic {
  room: RoomType;
  anchorTile: number;
  averageDirt: number;
  maxDirt: number;
  dirtyTiles: number;
  filthyTiles: number;
  dominantSource: SanitationSource;
  effectSummary: string;
  suggestedFix: string;
  cleaningJobsOpen: number;
}

export interface RoutePressureDiagnostics {
  visitorByTile: Uint16Array;
  residentByTile: Uint16Array;
  crewByTile: Uint16Array;
  logisticsByTile: Uint16Array;
  activePaths: number;
  pressuredTiles: number;
  conflictTiles: number;
  maxPressure: number;
}

export interface RoutePressureTileDiagnostic {
  tileIndex: number;
  visitorCount: number;
  residentCount: number;
  crewCount: number;
  logisticsCount: number;
  totalCount: number;
  dominant: RoutePressureDominant;
  conflictScore: number;
  publicConflict: boolean;
  serviceConflict: boolean;
  reasons: string[];
}
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
export interface WorkLaneMetrics {
  target: number;
  assigned: number;
  working: number;
  idle: number;
  pending: number;
  blocked: number;
  borrowed: number;
  pressure: number;
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
  staffRole: StaffRole;
  targetTile: number | null;
  retargetAt: number;
  energy: number;
  hygiene: number;
  // Short-cycle bladder need. Decays ~3x faster than energy and triggers a brief
  // Hygiene-room visit (toilet) at the threshold. Visible in the agent inspector
  // alongside energy/hygiene, mirroring the visitor toilet v0.
  bladder: number;
  // Thirst: short-cycle drink need, satisfied by visiting a Cantina (BarCounter)
  // or a WaterFountain anywhere. Decays slower than bladder, faster than energy.
  thirst: number;
  resting: boolean;
  cleaning: boolean;
  toileting: boolean;
  drinking: boolean;
  leisure: boolean;
  activeJobId: number | null;
  carryingItemType: ItemType | null;
  carryingAmount: number;
  blockedTicks: number;
  idleReason: CrewIdleReason;
  restSessionActive: boolean;
  cleanSessionActive: boolean;
  toiletSessionActive: boolean;
  drinkSessionActive: boolean;
  leisureSessionActive: boolean;
  leisureUntil: number;
  restLockUntil: number;
  restCooldownUntil: number;
  taskLockUntil: number;
  shiftBucket: number;
  assignmentStickyUntil: number;
  assignmentHoldUntil: number;
  lastSystem: CrewPrioritySystem | null;
  assignedSystem: CrewPrioritySystem | null;
  workLane: CrewWorkLane;
  lastWorkLane: CrewWorkLane | null;
  workLaneAssignedAt: number;
  retargetCountWindow: number;
  airExposureSec: number;
  healthState: 'healthy' | 'distressed' | 'critical';
  evaSuit: boolean;
  evaOxygenSec: number;
  lastRouteExposure?: RouteExposure;
}

export type ItemType = 'rawMeal' | 'meal' | 'rawMaterial' | 'tradeGood' | 'body';
export type JobType = 'pickup' | 'deliver' | 'repair' | 'extinguish' | 'construct' | 'cook' | 'sanitize';
export type JobState = 'pending' | 'assigned' | 'in_progress' | 'expired' | 'done';
export type JobExpiryContext = 'queued' | 'assigned' | 'carrying' | 'unknown';
export type JobStatusCounts = {
  pending: number;
  assigned: number;
  expired: number;
  done: number;
};

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
  expiredFromState?: Exclude<JobState, 'done' | 'expired'>;
  // Repair job fields. `type === 'repair'` means: walk to fromTile (system
  // anchor), stand and reduce maintenance debt for that cluster. Item fields
  // are unused for repair jobs but kept for shape compatibility.
  repairSystem?: MaintenanceSystem;
  repairProgress?: number;
  repairSupplyChecked?: boolean;
  repairSuppliesUsed?: number;
  sanitationSource?: SanitationSource;
  constructionSiteId?: number;
  constructionMode?: 'deliver' | 'build';
  workProgress?: number;
  workRequired?: number;
  blockedReason?: string | null;
}

export type ReservationOwnerKind = 'visitor' | 'resident' | 'crew' | 'job' | 'room' | 'system';
export type ReservationKind =
  | 'provider-slot'
  | 'service-tile'
  | 'seat-use-slot'
  | 'source-item'
  | 'target-capacity'
  | 'actor-job';
export type ReservationReleaseReason = 'completed' | 'failed' | 'expired' | 'replaced' | 'cleared';

export interface Reservation {
  id: number;
  ownerKind: ReservationOwnerKind;
  ownerId: number | string;
  kind: ReservationKind;
  targetTile: number | null;
  targetId: string | null;
  itemType: ItemType | null;
  amount: number;
  capacity: number;
  createdAt: number;
  expiresAt: number;
  releaseReason: ReservationReleaseReason | null;
}

export type ProviderKind =
  | 'meal-pickup'
  | 'seat'
  | 'vending'
  | 'leisure'
  | 'market'
  | 'drink'
  | 'hygiene'
  | 'stove-work'
  | 'grow-work'
  | 'workshop-work';
export type ProviderStatus = 'available' | 'reserved' | 'in_use' | 'blocked';

export interface ProviderSummary {
  id: string;
  kind: ProviderKind;
  module: ModuleType;
  room: RoomType;
  tileIndex: number;
  capacity: number;
  reserved: number;
  users: number;
  queued: number;
  status: ProviderStatus;
  blockedReason: string | null;
}

export interface StockTargetSummary {
  tileIndex: number;
  itemType: ItemType;
  current: number;
  incoming: number;
  desired: number;
  max: number;
  priority: number;
  blockedReason: string | null;
}

export interface JobBoardSummary {
  open: number;
  assigned: number;
  blocked: number;
  stale: number;
  averageAgeSec: number;
  averageBatchSize: number;
  labels: string[];
}

export type ConstructionKind = 'tile' | 'module';
export type ConstructionState = 'planned' | 'delivering' | 'building' | 'blocked' | 'done';

export interface ConstructionSite {
  id: number;
  kind: ConstructionKind;
  tileIndex: number;
  targetTile?: TileType;
  targetModule?: ModuleType;
  rotation?: ModuleRotation;
  requiredMaterials: number;
  deliveredMaterials: number;
  buildProgress: number;
  buildWorkRequired: number;
  requiresEva: boolean;
  assignedCrewId: number | null;
  state: ConstructionState;
  blockedReason: string | null;
  createdAt: number;
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
  // Dock-migration v0: capability tags a Berth must provide for this
  // ship type to dock there. Used by `pickBerthForShip` / scheduler.
  // Legacy Dock-tile path ignores this and always matches.
  requiredCapabilities: CapabilityTag[];
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
  // Dock-migration v0: when set, this ship is bound to a Berth room
  // (not a legacy Dock tile-cluster). The anchor is the lowest tile
  // index in the berth cluster — used by render to fit the ship inside
  // the berth interior, and by sim to look up the cluster on demand.
  // Null for legacy-dock ships.
  assignedBerthAnchor?: number | null;
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

// Dock-migration v0 follow-up: per-berth player-set filters that ride
// alongside the capability-tag system. Capabilities (gangway / customs
// / cargo) gate whether a ship CAN dock. These filters let the player
// further restrict which ship types and sizes they want to accept at a
// specific berth — semantic parity with `DockEntity.allowedShipTypes`
// / `allowedShipSizes` so the berth-room UI can offer the same knobs.
//
// Keyed by anchorTile (lowest tile index in the cluster). Orphaned
// entries — anchor tile no longer leads a Berth cluster — are pruned
// when room clusters recompute. Missing entries default to "all
// allowed" (matches dock default), so existing berths placed before
// this slot existed keep accepting traffic.
export interface BerthConfig {
  anchorTile: number;
  allowedShipTypes: ShipType[];
  allowedShipSizes: ShipSize[];
}

export interface LaneProfile {
  trafficVolume: number;
  weights: Record<ShipType, number>;
}

// System Map (MVP) — see docs/?? (none) and feat/spacemap-v0 task spec.
// Procedurally generated star system rolled at createInitialState time
// from `state.seedAtCreation`. The `laneSectors` slot is consumed by
// `generateLaneProfiles` to derive per-lane ship-type weights from the
// dominant faction(s) along each lane (replacing the old hardcoded RNG
// roll). The map is regenerated deterministically on save-load by
// reusing the same seed branch (see hydrateStateFromSave).
export type FactionTemplateId =
  | 'trader-guild'
  | 'industrial-combine'
  | 'colonial-authority'
  | 'military-bloc'
  | 'free-port'
  | 'pleasure-syndicate';

export interface Faction {
  id: string;
  templateId: FactionTemplateId;
  displayName: string;
  color: string;
  // Partial weights — averaged across a lane's dominant factions to
  // produce the lane's ship-type pick distribution.
  shipBias: Partial<Record<ShipType, number>>;
}

export interface Planet {
  id: string;
  factionId: string;
  displayName: string;
  orbitRadius: number; // 0..1
  orbitAngle: number;  // 0..2π
  bodyType: 'rocky' | 'gas' | 'ice';
}

export interface AsteroidBelt {
  id: string;
  innerRadius: number; // 0..1
  outerRadius: number; // 0..1
  resourceType: 'metal' | 'ice' | 'gas';
  factionClaim: string | null;
}

export interface LaneSector {
  factionIds: string[];
  dominantFactionId: string | null;
}

export interface SystemMap {
  factions: Faction[];
  planets: Planet[];
  asteroidBelts: AsteroidBelt[];
  laneSectors: Record<SpaceLane, LaneSector>;
  seedAtCreation: number;
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
  frameMs: number;
  rafJankMs: number;
  rafDroppedFrames: number;
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
  residentHungerAvg: number;
  residentEnergyAvg: number;
  residentHygieneAvg: number;
  load: number;
  capacity: number;
  loadPct: number;
  powerSupply: number;
  powerDemand: number;
  morale: number;
  stationRating: number;
  stationRatingTrendPerMin: number;
  unlockTier: UnlockTier;
  rawFoodStock: number;
  mealStock: number;
  kitchenRawBuffer: number;
  waterStock: number;
  airQuality: number;
  pressurizationPct: number;
  leakingTiles: number;
  materials: number;
  materialAutoImportStatus: string;
  materialAutoImportLastAdded: number;
  materialAutoImportCreditCost: number;
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
  residentPrivateBedsTotal: number;
  averageDockTime: number;
  bayUtilizationPct: number;
  exitsPerMin: number;
  shipsSkippedNoEligibleDock: number;
  shipsTimedOutInQueue: number;
  // Dock-migration v0: surfaced in alert panel ("trader ship waiting —
  // needs gangway + customs"). Cleared when a matching berth becomes
  // available. v1: roll into a structured queue-status object.
  shipsQueuedNoCapabilityCount: number;
  shipsQueuedNoCapabilityHint: string;
  dockQueueLengthByLane: Record<SpaceLane, number>;
  avgVisitorWalkDistance: number;
  dockZonesTotal: number;
  shipDemandCafeteriaPct: number;
  shipDemandMarketPct: number;
  shipDemandLoungePct: number;
  visitorsByArchetype: Record<VisitorArchetype, number>;
  mealsServedTotal: number;
  /** Lifetime-monotonic counters used by unlocks.ts tier triggers.
   *  Stable names so harness scenario assertions + render progress UI
   *  can both target them without schema drift. Increment sites land in
   *  a follow-up PR; values are 0 at v2 introduction. */
  creditsEarnedLifetime: number;
  archetypesServedLifetime: number;
  tradeCyclesCompletedLifetime: number;
  incidentsResolvedLifetime: number;
  actorsTreatedLifetime: number;
  residentsConvertedLifetime: number;
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
  expiredJobsByReason: Record<JobStallReason, number>;
  expiredJobsByContext: Record<JobExpiryContext, number>;
  jobCountsByItem: Record<ItemType, JobStatusCounts>;
  jobCountsByType: Record<JobType, JobStatusCounts>;
  activeReservations: number;
  reservationFailures: number;
  expiredReservations: number;
  reservationsByKind: Record<ReservationKind, number>;
  logisticsAverageBatchSize: number;
  logisticsJobMilesPerMin: number;
  logisticsBlockedReason: string;
  jobBoard: JobBoardSummary;
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
  crewCleaning: number;
  crewSelfCare: number;
  crewAvgEnergy: number;
  crewAvgHygiene: number;
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
    recHall: number;
    cantina: number;
    observatory: number;
    hygiene: number;
    vending: number;
  };
  dormVisitsPerMin: number;
  dormFailedAttemptsPerMin: number;
  hygieneUsesPerMin: number;
  mealsConsumedPerMin: number;
  failedNeedAttemptsHunger: number;
  failedNeedAttemptsEnergy: number;
  failedNeedAttemptsHygiene: number;
  idleCrewByReason: Record<CrewIdleReason, number>;
  workforceLanes: Record<CrewWorkLane, WorkLaneMetrics>;
  workforceBorrowedCrew: number;
  workforceHighestPressureLane: CrewWorkLane | null;
  stalledJobsByReason: Record<JobStallReason, number>;
  crewMoraleDrivers: string[];
  stationRatingDrivers: string[];
  stationRatingPenaltyPerMin: {
    queueTimeout: number;
    noEligibleDock: number;
    serviceFailure: number;
    longWalks: number;
    routeExposure: number;
    environment: number;
  };
  stationRatingPenaltyTotal: {
    queueTimeout: number;
    noEligibleDock: number;
    serviceFailure: number;
    longWalks: number;
    routeExposure: number;
    environment: number;
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
  residentConversionLastResult: string;
  residentConversionLastChancePct: number;
  residentConversionLastShip: string;
  residentDepartures: number;
  residentSatisfactionAvg: number;
  topRoomWarnings: string[];
  roomWarningsCount: number;
  visitorServiceExposurePenaltyPerMin: number;
  residentBadRouteStressPerMin: number;
  crewPublicInterferencePerMin: number;
  visitorStatusAvg: number;
  residentComfortAvg: number;
  serviceNoiseNearDorms: number;
  visitorEnvironmentPenaltyPerMin: number;
  residentEnvironmentStressPerMin: number;
  maintenanceDebtAvg: number;
  maintenanceDebtMax: number;
  maintenanceJobsOpen: number;
  maintenanceJobsResolvedPerMin: number;
  sanitationAvg: number;
  sanitationMax: number;
  dirtyTiles: number;
  filthyTiles: number;
  sanitationJobsOpen: number;
  sanitationJobsCompletedPerMin: number;
  sanitationPenaltyPerMin: number;
  sanitationPenaltyTotal: number;
  sanitationTopSource: SanitationSource;
  lifeSupportCoveragePct: number;
  avgLifeSupportDistance: number;
  poorLifeSupportTiles: number;
  serviceNodesTotal: number;
  serviceNodesUnreachable: number;
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
  environment?: RoomEnvironmentScore;
  routePressure?: {
    activePaths: number;
    pressuredTiles: number;
    conflictTiles: number;
    maxPressure: number;
    reasons: string[];
  };
  sanitation?: SanitationRoomDiagnostic;
  cafeteriaLoad?: {
    tableNodes: number;
    queueNodes: number;
    queueingVisitors: number;
    eatingVisitors: number;
    highPatienceWaiting: number;
    pressure: 'low' | 'medium' | 'high';
  };
  providers?: ProviderSummary[];
  stockTargets?: StockTargetSummary[];
  openJobs?: string[];
  topBlockedReason?: string | null;
}

export interface HousingInspector {
  room: RoomType;
  policy: HousingPolicy;
  bedsTotal: number;
  bedsAssigned: number;
  hygieneTargets: number;
  validPrivateHousing: boolean;
}

export type AgentInspectorKind = 'visitor' | 'resident' | 'crew';
export type AgentHealthState = 'healthy' | 'distressed' | 'critical';
export type VisitorDesire = 'eat' | 'toilet' | 'leisure' | 'exit_station';
export type ResidentDominantNeed = 'hunger' | 'energy' | 'hygiene' | 'none';
export type ResidentDesire = 'return_home_ship' | 'sleep' | 'hygiene' | 'eat' | 'socialize' | 'seek_safety' | 'wander';
export type CrewDesire = 'rest' | 'clean' | 'toilet' | 'drink' | 'leisure' | 'social' | 'logistics' | 'staff_post' | 'idle';

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
  /** Local air quality (0..100) at the agent's current tile. */
  localAir: number;
  /** Cumulative low-oxygen exposure in seconds; compared against thresholds for distress/critical/death. */
  airExposureSec: number;
  reservationSummary: string;
  providerTarget: string | null;
  blockedReason: string | null;
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

export interface CrewInspector extends AgentInspectorBase {
  kind: 'crew';
  state: string;
  role: CrewRole;
  staffRole: StaffRole;
  assignedSystem: CrewPrioritySystem | null;
  lastSystem: CrewPrioritySystem | null;
  energy: number;
  hygiene: number;
  bladder: number;
  thirst: number;
  resting: boolean;
  cleaning: boolean;
  toileting: boolean;
  drinking: boolean;
  leisure: boolean;
  activeJobId: number | null;
  carryingItemType: ItemType | null;
  carryingAmount: number;
  idleReason: CrewIdleReason;
  desire: CrewDesire;
}

export interface CrewState {
  total: number;
  assigned: number;
  free: number;
  roleCounts: StaffRoleCounts;
}

export interface RoomOps {
  bridgeTotal: number;
  bridgeActive: number;
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
  cantinaTotal: number;
  cantinaActive: number;
  observatoryTotal: number;
  observatoryActive: number;
  logisticsStockTotal: number;
  logisticsStockActive: number;
  storageTotal: number;
  storageActive: number;
}

export interface MapExpansionState {
  purchased: Record<CardinalDirection, boolean>;
  purchasesMade: number;
}

export type UnlockTier = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type UnlockId =
  | 'tier1_sustenance'
  | 'tier2_commerce'
  | 'tier3_logistics'
  | 'tier4_governance'
  | 'tier5_health'
  | 'tier6_specialization';

/** Trigger for advancing to this tier. Predicates are monotonic over
 *  lifetime counters — they never go false once true — so tier advance
 *  is stable, save/load survives them, and harness assertions can be
 *  simple `counter >= threshold` checks. `progress` returns 0..1 for UI
 *  (triggerProgress map) ahead of full unlock. */
export interface UnlockTrigger {
  predicate: (metrics: Metrics) => boolean;
  progress: (metrics: Metrics) => number;
  /** Player-facing tooltip copy for the locked-state UI. */
  tooltip: string;
}

export interface UnlockDefinition {
  id: UnlockId;
  tier: UnlockTier;
  name: string;
  description: string;
  trigger: UnlockTrigger;
}

export interface UnlockState {
  tier: UnlockTier;
  unlockedIds: UnlockId[];
  unlockedAtSec: Partial<Record<UnlockId, number>>;
  /** 0..1 per tier — reflects progress toward that tier's trigger
   *  threshold. Current tier is 1.0, future tiers update each sim tick,
   *  unreached past tiers stay at whatever they were when their
   *  predicate first returned true (typically 1.0). */
  triggerProgress: Partial<Record<UnlockTier, number>>;
}

// Fire intensity 0-100 stored per anchor tile of a burning room cluster. Drives
// canvas overlay, blocks logistics path through the tile (soft cost), and damages
// hull/maintenance debt over time. Cleared when an extinguish job completes.
export interface FireState {
  anchorTile: number;
  system: MaintenanceSystem;
  intensity: number;
  ignitedAt: number;
  lastTick: number;
}

export interface Effects {
  cafeteriaStallUntil: number;
  brownoutUntil: number;
  securityDelayUntil: number;
  blockedUntilByTile: Map<number, number>;
  trespassCooldownUntilByTile: Map<number, number>;
  securityAuraByTile: Map<number, number>;
  fires: FireState[];
}

export interface Controls {
  paused: boolean;
  simSpeed: 1 | 2 | 4;
  shipsPerCycle: number;
  diagnosticOverlay: DiagnosticOverlay;
  showZones: boolean;
  showServiceNodes: boolean;
  showInventoryOverlay: boolean;
  showGlow: boolean;
  spriteMode: 'fallback' | 'sprites';
  wallRenderMode: 'per-cell' | 'dual-tilemap';
  showSpriteFallback: boolean;
  spritePipeline: SpritePipeline;
  taxRate: number;
  dockPlacementFacing: SpaceLane;
  moduleRotation: ModuleRotation;
  materialAutoImportEnabled: boolean;
  materialTargetStock: number;
  materialImportBatchSize: number;
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
  // Dock-migration v0 follow-up: per-berth player-set filters. See
  // BerthConfig docs above for the keying + orphan-pruning model. Empty
  // on legacy saves and on stations that have never opened the berth
  // config UI — `pickBerthForShip` falls back to "all allowed" in that
  // case.
  berthConfigs: BerthConfig[];
  // Procedurally generated star system (MVP). Null only on legacy saves
  // that pre-date this feature and didn't get re-rolled at hydrate time;
  // generateLaneProfiles falls back to legacy RNG behavior in that case.
  system: SystemMap | null;
  // The seed used to seed the StationState rng. Stored separately so
  // generateSystemMap can derive a stable sub-seed without depleting
  // state.rng. Mirrored into state.system.seedAtCreation when the
  // system rolls.
  seedAtCreation: number;
  laneProfiles: Record<SpaceLane, LaneProfile>;
  dockQueue: DockQueueEntry[];
  pressurized: boolean[];
  // Per-tile air quality 0..100. Computed each tick from life-support coverage
  // distance + active source count. Local exposure checks (crew, visitor,
  // resident) read this instead of metrics.airQuality so a sealed-off wing
  // becomes locally lethal even when the station-wide average looks fine.
  airQualityByTile: Float32Array;
  // Per-tile sanitation drift, 0..100. Dirt sources are stored as compact
  // codes for hover/inspector diagnostics and are reset to none when a tile
  // is cleaned or rebuilt.
  dirtByTile: Float32Array;
  dirtSourceByTile: Uint8Array;
  mapConditionVersion: number;
  pathOccupancyByTile: Map<number, number>;
  jobs: TransportJob[];
  reservations: Reservation[];
  constructionSites: ConstructionSite[];
  itemNodes: ItemNode[];
  legacyMaterialStock: number;
  incidents: IncidentEntity[];
  visitors: Visitor[];
  residents: Resident[];
  crewMembers: CrewMember[];
  command: CommandState;
  maintenanceDebts: MaintenanceDebt[];
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
  // Legacy name: traffic uses this as the next sporadic arrival check time.
  lastCycleTime: number;
  cycleDuration: number;
  spawnCounter: number;
  shipSpawnCounter: number;
  crewSpawnCounter: number;
  residentSpawnCounter: number;
  lastResidentSpawnAt: number;
  moduleSpawnCounter: number;
  jobSpawnCounter: number;
  reservationSpawnCounter: number;
  constructionSiteSpawnCounter: number;
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
    // Lifetime-monotonic set of archetypes the station has ever
    // received, for unlocks.ts T2 trigger. A `Record<_,boolean>` beats
    // a `Set<_>` here because it serializes into the save file without
    // a migration helper.
    archetypesEverSeen: Record<VisitorArchetype, boolean>;
    shipsByType: Record<ShipType, number>;
    visitorLeisureEntries: {
      cafeteria: number;
      market: number;
      lounge: number;
      recHall: number;
      cantina: number;
      observatory: number;
      hygiene: number;
      vending: number;
    };
    ratingDelta: number;
    ratingFromShipTimeout: number;
    ratingFromShipSkip: number;
    ratingFromVisitorFailure: number;
    ratingFromWalkDissatisfaction: number;
    ratingFromRouteExposure: number;
    ratingFromEnvironment: number;
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
    residentConversionLastResult: string;
    residentConversionLastChancePct: number;
    residentConversionLastShip: string;
    residentDepartures: number;
    ratingFromResidentDeparture: number;
    ratingFromResidentRetention: number;
    visitorWalkDistance: number;
    visitorWalkTrips: number;
    visitorServiceExposurePenalty: number;
    residentBadRouteStress: number;
    crewPublicInterference: number;
    visitorEnvironmentPenalty: number;
    residentEnvironmentStress: number;
    maintenanceJobsResolved: number;
    sanitationJobsResolved: number;
    ratingFromSanitation: number;
    residentSanitationStress: number;
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

export interface BuildStampCellPreview {
  dx: number;
  dy: number;
  tile: TileType;
  room: RoomType;
  zone: ZoneType;
}

export interface BuildStampModulePreview {
  dx: number;
  dy: number;
  type: ModuleType;
  rotation: ModuleRotation;
  tileOffsets: Array<{ dx: number; dy: number }>;
}

export interface BuildStampPreview {
  width: number;
  height: number;
  cells: BuildStampCellPreview[];
  modules: BuildStampModulePreview[];
  label: string;
}

export interface BuildTool {
  kind: 'none' | 'tile' | 'zone' | 'room' | 'module' | 'copy-room' | 'paste-room' | 'cancel-construction' | 'hire-staff';
  tile?: TileType;
  zone?: ZoneType;
  room?: RoomType;
  module?: ModuleType;
  pasteStamp?: BuildStampPreview;
  staffRole?: StaffRole;
}

export const WALKABLE_TILES = new Set<TileType>([
  TileType.Floor,
  TileType.Dock,
  TileType.Cafeteria,
  TileType.Reactor,
  TileType.Security,
  TileType.Door,
  TileType.Airlock
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

// Tiles that always block vacuum propagation. Outer-hull Dock tiles also
// barrier but require state context to detect — handled inline in
// computePressurization.
export const PRESSURE_BARRIER_TILES = new Set<TileType>([
  TileType.Wall,
  TileType.Door,
  TileType.Airlock
]);

export function isPressureBarrier(tile: TileType): boolean {
  return PRESSURE_BARRIER_TILES.has(tile);
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
