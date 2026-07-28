import type { CapitalProjectsState } from './capital-projects';
import type { EconomyLedger, MarketPricingPolicy } from './opening-economy';
import type { PodFreightOperation } from './pod-freight';
import type { PodDemandLog } from './pod-demand';
import type { ServiceLog } from './service-truth';

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
  | 'utility-underlay'
  | 'map-conditions'
  | 'thermal'
  | 'visitor-status'
  | 'resident-comfort'
  | 'service-noise'
  | 'sanitation'
  | 'maintenance'
  | 'route-pressure'
  | 'reputation';

export type DriftSeverity = 'none' | 'low' | 'warning' | 'active' | 'severe';
export type MapConditionKind = 'sunlight' | 'debris-risk' | 'thermal-sink';
export type UtilityUnderlayKind =
  | 'air-duct'
  | 'hot-pipe'
  | 'cold-pipe'
  | 'power-conduit'
  | 'coolant-pipe'
  | 'water-pipe'
  | 'fuel-pipe'
  | 'data-conduit';

export interface UtilityUnderlayState {
  version: number;
  layers: Record<UtilityUnderlayKind, Uint8Array>;
}

export interface UtilityNetworkComponent {
  id: number;
  kind: UtilityUnderlayKind;
  tiles: number[];
  sourceTiles: number[];
  sinkTiles: number[];
  powered: boolean;
  quality: number;
}

export interface UtilityNetworkDiagnostics {
  kind: UtilityUnderlayKind;
  networkCount: number;
  poweredNetworkCount: number;
  tileCount: number;
  sourceCount: number;
  sinkCount: number;
  poweredSinkCount: number;
  disconnectedTileCount: number;
  averageDistance: number;
  components: UtilityNetworkComponent[];
  componentIdByTile: Int16Array;
  distanceByTile: Int16Array;
}

export interface UtilityUnderlayTileDiagnostic {
  tileIndex: number;
  kind: UtilityUnderlayKind;
  present: boolean;
  buildable: boolean;
  neighborMask: number;
  componentId: number | null;
  powered: boolean;
  source: boolean;
  sink: boolean;
  disconnected: boolean;
  reason: string;
  effect: string;
  fix: string;
}

export interface MapConditionSample {
  kind: MapConditionKind;
  value: number;
  label: string;
  upside: string;
  downside: string;
}

export type IncidentType = 'fight' | 'trespass' | 'theft';
export type IncidentStage =
  | 'detected'
  | 'dispatching'
  | 'intervening'
  | 'intervening_extended'
  | 'escorting'
  | 'holding'
  | 'ejecting'
  | 'resolved'
  | 'failed';
export type IncidentOutcome = 'warning' | 'deescalated' | 'detained' | 'recovered' | 'ejected' | 'fatality' | 'escaped';
export type IncidentSubjectKind = 'visitor' | 'resident';
export type BerthScreeningLevel = 'open' | 'standard' | 'strict';
export type CustomsPolicy = 'routine' | 'selective' | 'expedited' | 'seizure';
export type SecurityPosture = 'discreet' | 'standard' | 'visible';
export type ReputationZoneLabel =
  | 'premium'
  | 'polished'
  | 'exclusive'
  | 'ordinary'
  | 'rough'
  | 'seedy'
  | 'industrial'
  | 'high-risk';

export interface ReputationZoneScore {
  anchorTile: number;
  room: RoomType;
  tiles: number[];
  prestige: number;
  notoriety: number;
  control: number;
  value: number;
  opacity: number;
  crimePressure: number;
  recentIncidentHeat: number;
  traffic: number;
  visibleForce: number;
  label: ReputationZoneLabel;
  screeningLevel?: BerthScreeningLevel;
  customsPolicy?: CustomsPolicy;
  marketClass?: 'ordinary' | 'boutique' | 'gray';
  topDrivers: string[];
}

export interface ReputationTileDiagnostic {
  tileIndex: number;
  zone: ReputationZoneScore | null;
  summary: string;
  drivers: string[];
}

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
  Maintenance = 'maintenance',
  // Berth: dock-migration v0. A regular rectangular room paint that ships
  // dock *inside*. Capability tags are derived from contained modules
  // (Gangway/CustomsCounter/CargoArm) — see `computeBerthCapabilities`
  // in sim.ts. v1 will add U-shape strict validation.
  Berth = 'berth',
  // Cantina: bar / drinks venue. Distinct from Lounge: faster turnaround,
  // higher per-visitor revenue, social environment. Modules: BarCounter, Tap.
  // Visitors and crew route here for drinks during leisure circuits.
  Cantina = 'cantina',
  // CommercialUnit is a vacant, player-built shell. Accepting a tenant offer
  // converts the shell to the business's real operating room type while the
  // CommercialUnit entity retains ownership of the exact tiles and fixtures.
  CommercialUnit = 'commercial-unit',
  // Observatory: passive wonder room. Visitors gain a "wonder" leisure boost
  // (longer dwell, higher rating contribution). Modules: Telescope.
  Observatory = 'observatory'
}

// Berth capability tags drive ship→berth matching in v0.
// Each tag is contributed by a specific module type placed inside the berth.
// v1: add 'military_bridge' and 'refuel' tags + their modules.
export type CapabilityTag = 'gangway' | 'customs' | 'cargo' | 'refuel';

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
  Bunk = 'bunk',
  Locker = 'locker',
  Table = 'table',
  ServingStation = 'serving-station',
  Fridge = 'fridge',
  ColdStore = 'cold-store',
  PrepCounter = 'prep-counter',
  Stove = 'stove',
  TrayReturn = 'tray-return',
  Dishwasher = 'dishwasher',
  Workbench = 'workbench',
  MedBed = 'med-bed',
  CellConsole = 'cell-console',
  RecUnit = 'rec-unit',
  GrowStation = 'grow-station',
  Terminal = 'terminal',
  Couch = 'couch',
  GameStation = 'game-station',
  // One-user bladder provider. Bathroom room paint only establishes access;
  // actors must route to and occupy this fixture to receive relief.
  Toilet = 'toilet',
  Shower = 'shower',
  Sink = 'sink',
  FloorDrain = 'floor-drain',
  WaterValve = 'water-valve',
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
  FuelTank = 'fuel-tank',
  FuelPump = 'fuel-pump',
  // Port infrastructure. PodDock owns a small-craft position on an exterior
  // hull wall; adjacent wall fixtures add dock-side capability. Berth paint
  // remains free, while BerthControl and DockingClamp make a berth operational.
  PodDock = 'pod-dock',
  FuelCoupler = 'fuel-coupler',
  FreightLocker = 'freight-locker',
  MaintenanceSocket = 'maintenance-socket',
  BerthControl = 'berth-control',
  DockingClamp = 'docking-clamp',
  // SecurityCamera: wall-mounted low-friction surveillance. Adds local
  // control and lowers opacity without the full prestige hit of guards/gates.
  SecurityCamera = 'security-camera',
  // AccessGate: staffed floor checkpoint. Strong local control when enough
  // Security Guards exist; weak/frictional if unstaffed.
  AccessGate = 'access-gate',
  FireExtinguisher = 'fire-extinguisher',
  // Vent module: 1x1 air-distribution node. Acts as a secondary life-support
  // source within VENT_REACH_FROM_LS tiles of an active LS cluster, projecting
  // fresh-air coverage in a radius. Lets the player extend air to a remote
  // wing without putting a second LS room there.
  Vent = 'vent',
  // Wall-mounted thermal insulation panel. Reduces sunlight heat transfer and
  // exterior thermal swings for nearby room tiles.
  InsulationPanel = 'insulation-panel',
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
  Plant = 'plant',
  // Physical 2x2 generator required inside a Reactor room.
  ReactorCore = 'reactor-core',
  // SolarPanel: 1x1 place-on-floor power module. Passive (no crew): each panel
  // supplies power proportional to the local map-condition 'sunlight' at its
  // tile, so a sunward charter and bright-tile placement both matter. Weak in
  // deep shade. See POWER_PER_SOLAR + the powerSupply term in sim.ts.
  SolarPanel = 'solar-panel',
  // Phase 1B facility-scale fixtures. These are additive so existing module
  // footprints and saved stations remain valid.
  CheckoutBank = 'checkout-bank',
  ShelfAisle = 'shelf-aisle',
  BunkBank = 'bunk-bank'
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
  /** Credits originally paid by the station. Older/scenario modules fall back to the current catalog price. */
  purchaseCost?: number;
  legacyForced?: boolean;
}

export type CommercialBusinessKind = 'market-stall' | 'cantina' | 'restaurant' | 'gift-shop';
export type CommercialUnitPhase = 'vacant' | 'offers' | 'fitting-out' | 'open' | 'closed';

export interface CommercialFitoutPlacement {
  module: ModuleType;
  originTile: number;
  rotation: ModuleRotation;
}

export interface CommercialOffer {
  id: number;
  kind: CommercialBusinessKind;
  tenantName: string;
  brandName: string;
  concept: string;
  targetRoom: RoomType;
  fixtures: CommercialFitoutPlacement[];
  baseRentPerCycle: number;
  revenueShare: number;
  fitoutDurationSec: number;
  expectedCustomersPerCycle: number;
  suppliedStaff: number;
  stockPolicy: string;
}

export interface CommercialUnit {
  id: number;
  anchorTile: number;
  tiles: number[];
  phase: CommercialUnitPhase;
  offers: CommercialOffer[];
  previewOfferId: number | null;
  selectedOffer: CommercialOffer | null;
  fittedModuleIds: number[];
  installedFixtureCount: number;
  createdAt: number;
  fitoutStartedAt: number | null;
  fitoutCompleteAt: number | null;
  nextFixtureAt: number | null;
  nextRentAt: number | null;
  nextRestockAt: number | null;
  grossSalesAccrued: number;
  rentCollected: number;
  revenueShareCollected: number;
  customersServed: number;
  currentCustomers: number;
  presentCustomerIds: number[];
  tenantStaffTiles: number[];
  statusReason: string;
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

export type VisitorTrait =
  | 'patient'
  | 'impatient'
  | 'social'
  | 'messy'
  | 'tidy'
  | 'thirsty'
  | 'comfort-seeking';

export type VisitorPreference = 'cafeteria' | 'market' | 'lounge';

/** Tenure controls departure, while the actor remains a Visitor in all cases. */
export type VisitStayClass = 'errand' | 'shore' | 'contract' | 'extended' | 'permanent';
export type ShipVisitPhase = 'announced' | 'approach' | 'secure' | 'visit-service' | 'recall' | 'boarding' | 'depart';
export type RecurringNeedKind = 'hunger' | 'energy' | 'hygiene' | 'leisure';
export type VisitorServiceFailureStage = 'none' | 'unmet' | 'balking' | 'distressed' | 'disruptive';

/** Durable needs for a temporary long-stay occupant. Residents retain their own state. */
export interface VisitorNeeds {
  hunger: number;
  energy: number;
  hygiene: number;
  leisure: number;
  active: RecurringNeedKind | null;
  unmetSince: number | null;
  completions: number;
}

export type HospitalityServiceKind = 'meal' | 'drink' | 'leisure' | 'restroom' | 'hygiene' | 'comfort';

export interface HospitalityDemand {
  meal: number;
  drink: number;
  leisure: number;
  restroom: number;
  hygiene: number;
  comfort: number;
}

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
  name?: string;
  trait?: VisitorTrait;
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
  /** A served drink is carried from the bar to a physical cantina seat. */
  carryingDrink?: boolean;
  reservedServingTile: number | null;
  reservedTargetTile: number | null;
  blockedTicks: number;
  /** Runtime-facing reason for a physical movement wait. Never serialized. */
  movementWaitReason?: string;
  /** Simulation-time hysteresis for congestion-triggered path invalidation. */
  movementReplanCooldownUntil?: number;
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
  /** Ordered, manifest-backed services this passenger expects before returning. */
  servicePlan: HospitalityServiceKind[];
  completedServices: HospitalityServiceKind[];
  activeService: HospitalityServiceKind | null;
  /**
   * Completed physical sessions recorded for this visitor. Owned by the
   * service log so "visitors served" counts each person once regardless of
   * how many services they used. Optional for save compatibility.
   */
  serviceCompletionsRecorded?: number;
  /** Optional non-contract repeat drink in progress. Contract drinks still advance promises once. */
  optionalDrinkActive?: boolean;
  /** Count of optional repeat drinks completed during this visit. */
  repeatDrinksServed?: number;
  serviceBlockedSince?: number | null;
  activeIncidentId?: number | null;
  // Crowd-loop v1 theater: set on storm-off/balk; renderer shows red tint + "!"
  // while state.now < angryUntil. Optional for save compat with older snapshots.
  angryUntil?: number;
  // Crowd-loop v1 (B2): countdown while being served at the counter. The
  // provider slot stays held for its duration — service takes TIME, which is
  // what makes a second serving station a real decision and lines physical.
  serveTimer?: number;
  /** Lease attribution for the restaurant where this visitor last ate. */
  commercialMealUnitId?: number | null;
  /** Lease attribution follows a drink from its tenant bar to a seat. */
  commercialDrinkUnitId?: number | null;
  /** Short retry cooldown after a route auction cannot produce a usable path. */
  nextPathRetryAt?: number;
  /** Optional on legacy visitors. Only contract/extended visitors receive it. */
  stayClass?: VisitStayClass;
  needs?: VisitorNeeds;
  /** A recurring completion never advances a one-shot port promise. */
  recurringNeedActive?: RecurringNeedKind | null;
  /** Shelf node holding the one trade good reserved for this checkout. */
  marketTradeGoodSourceTile?: number | null;
  /** Current temporary lodging slot. This is never resident housing identity. */
  temporarySleepTargetTile?: number | null;
  /** Durable service-failure state for long-stay and stranded occupants. */
  serviceFailureStage?: VisitorServiceFailureStage;
  failureSince?: number | null;
  failureNeed?: RecurringNeedKind | null;
  /** Departure provenance for a passenger left behind by a berth ship. */
  strandedFromShipId?: number | null;
  strandedAt?: number | null;
  reliefEligibleAt?: number | null;
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
  /** Meal service is two physical legs: serving station, then a seat. */
  carryingMeal?: boolean;
  /** Serving fixture held during the pickup leg. */
  reservedServingTile?: number | null;
  /** Timed counter interaction so meal throughput is visible. */
  serveTimer?: number;
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
  movementWaitReason?: string;
  movementReplanCooldownUntil?: number;
  airExposureSec: number;
  healthState: 'healthy' | 'distressed' | 'critical';
  agitation?: number;
  activeIncidentId?: number | null;
  confrontationUntil?: number;
  lastRouteExposure?: RouteExposure;
}

export type CrewRole = 'idle' | 'reactor' | 'cafeteria' | 'security';
export type CrewIdleReason =
  | 'idle_available'
  | 'idle_no_jobs'
  | 'idle_resting'
  | 'idle_no_path'
  | 'idle_waiting_fixture'
  | 'idle_waiting_reassign';
export type CrewWorkLane = 'food' | 'sanitation' | 'engineering' | 'logistics' | 'construction-eva' | 'flex';
export type CrewShiftTargets = Record<CrewWorkLane, number>;
export type CrewWatchIndex = 0 | 1 | 2;
export type CrewWatchStatus = 'on-duty' | 'reserve' | 'off-duty';
export type TrafficBankKind = 'passenger-bank' | 'cargo-bank' | 'maintenance-window';
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
  | 'steward'
  | 'cargo-handler'
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
export type MaintenanceDomain = 'utility' | 'module' | 'hull' | 'dock' | 'berth' | 'door' | 'vent' | 'plumbing';
export type MaintenanceSource =
  | 'idle'
  | 'high-load'
  | 'debris'
  | 'traffic'
  | 'heat'
  | 'fire-aftermath'
  | 'construction'
  | 'plumbing';
export interface MaintenanceDebt {
  key: string;
  system?: MaintenanceSystem;
  domain?: MaintenanceDomain;
  source?: MaintenanceSource;
  anchorTile: number;
  targetTile?: number;
  room?: RoomType;
  moduleId?: number;
  exterior?: boolean;
  label?: string;
  effect?: string;
  debt: number;
  lastServicedAt: number;
  lastImpactAt?: number;
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
  ductMode: boolean;
  poweredVents: number;
  unpoweredVents: number;
  airNetworkCount: number;
  disconnectedAirDuctTiles: number;
  averageAirNetworkDistance: number;
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

export type ThermalSeverity = 'comfortable' | 'warm' | 'hot' | 'overheated' | 'severe';

export interface ThermalTileDiagnostic {
  tileIndex: number;
  heat: number;
  staleAir: number;
  severity: ThermalSeverity;
  sunlight: number;
  shadow: number;
  thermalSink: number;
  cooling: number;
  insulation: number;
  ventRelief: number;
  lifeSupportDistance: number | null;
  cause: string;
  effect: string;
  fix: string;
}

export interface ThermalRoomDiagnostic {
  room: RoomType;
  anchorTile: number;
  averageHeat: number;
  maxHeat: number;
  averageStaleAir: number;
  maxStaleAir: number;
  severity: ThermalSeverity;
  dominantCause: string;
  effect: string;
  fix: string;
}

export interface MaintenanceTileDiagnostic {
  system?: MaintenanceSystem;
  domain: MaintenanceDomain;
  source: MaintenanceSource;
  anchorTile: number;
  targetTile: number;
  exterior: boolean;
  label: string;
  effect: string;
  fix: string;
  debt: number;
  outputMultiplier: number;
  debrisRisk: number;
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
  name: string;
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
  hunger: number;
  hygiene: number;
  // Short-cycle bladder need. Triggers a brief physical Toilet visit at the
  // threshold and remains visible in the agent inspector.
  bladder: number;
  // Thirst: short-cycle drink need, satisfied by a Cantina, WaterFountain, or
  // basic cafeteria water service. Decays slower than bladder, faster than energy.
  thirst: number;
  morale: number;
  missedPayrollCycles: number;
  needsStrainSec: number;
  resignationNoticeAt: number | null;
  resting: boolean;
  eating: boolean;
  carryingMeal: boolean;
  cleaning: boolean;
  toileting: boolean;
  drinking: boolean;
  leisure: boolean;
  activeJobId: number | null;
  carryingItemType: ItemType | null;
  carryingAmount: number;
  blockedTicks: number;
  movementWaitReason?: string;
  movementReplanCooldownUntil?: number;
  idleReason: CrewIdleReason;
  restSessionActive: boolean;
  eatSessionActive: boolean;
  eatUntil: number;
  cleanSessionActive: boolean;
  toiletSessionActive: boolean;
  drinkSessionActive: boolean;
  leisureSessionActive: boolean;
  leisureUntil: number;
  restLockUntil: number;
  restCooldownUntil: number;
  taskLockUntil: number;
  shiftBucket: number;
  recalledUntil: number;
  // Optional physical home post/room anchor. Dispatch prefers work at this
  // workplace but may send the employee elsewhere for emergencies.
  homeWorkplaceTile: number | null;
  assignedSleepTile: number | null;
  assignmentStickyUntil: number;
  assignmentHoldUntil: number;
  lastSystem: CrewPrioritySystem | null;
  assignedSystem: CrewPrioritySystem | null;
  workLane: CrewWorkLane;
  manualWorkLane?: CrewWorkLane | null;
  lastWorkLane: CrewWorkLane | null;
  workLaneAssignedAt: number;
  retargetCountWindow: number;
  airExposureSec: number;
  healthState: 'healthy' | 'distressed' | 'critical';
  evaSuit: boolean;
  evaOxygenSec: number;
  lastRouteExposure?: RouteExposure;
}

export type ItemType =
  | 'rawMeal'
  | 'preppedMeal'
  | 'meal'
  | 'cleanTray'
  | 'dirtyTray'
  | 'drink'
  | 'rawMaterial'
  | 'tradeGood'
  | 'fuel'
  | 'body';
export type JobType =
  | 'pickup'
  | 'deliver'
  | 'repair'
  | 'extinguish'
  | 'construct'
  | 'prep'
  | 'cook'
  | 'wash'
  | 'sanitize'
  | 'inspect';
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
  repairTargetKey?: string;
  repairTargetLabel?: string;
  repairDomain?: MaintenanceDomain;
  repairSource?: MaintenanceSource;
  repairExterior?: boolean;
  repairProgress?: number;
  repairSupplyChecked?: boolean;
  repairSuppliesUsed?: number;
  sanitationSource?: SanitationSource;
  /** Tile the cleaner is scrubbing right now — moves the broom badge through the patch. */
  sanitationWipeTile?: number;
  /** Last tile this job pushed under the clean target, and when, for the finish sparkle. */
  sanitationClearedTile?: number;
  sanitationClearedAt?: number;
  constructionSiteId?: number;
  constructionMode?: 'deliver' | 'build';
  workProgress?: number;
  workRequired?: number;
  blockedReason?: string | null;
  /** Port-operations inspection jobs are bound to one physical ship. */
  portShipId?: number;
  /** Inbound consignment batches retain their authoritative cargo-lot owner. */
  portCargoLotId?: number;
  /** Cargo moved toward a ship is consumed into its manifest, not stored at the arm. */
  portCargoDirection?: 'inbound' | 'outbound';
  /** Logical fuel node when the crew stands on an adjacent pump handoff tile. */
  portFuelNodeTile?: number;
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
  | 'bed'
  | 'seat'
  | 'vending'
  | 'leisure'
  | 'market'
  | 'drink'
  | 'toilet'
  | 'hygiene'
  | 'prep-work'
  | 'wash-work'
  | 'stove-work'
  | 'grow-work'
  | 'workshop-work';
export type ProviderStatus = 'available' | 'reserved' | 'in_use' | 'blocked';

export type FacilityActivityKind =
  | 'meal'
  | 'prep'
  | 'cook'
  | 'serve'
  | 'dishwash'
  | 'comfort'
  | 'recreation'
  | 'social'
  | 'wonder'
  | 'drink'
  | 'exercise'
  | 'toilet'
  | 'shower'
  | 'wash'
  | 'sleep'
  | 'nap'
  | 'repair';

export type FacilityReadinessReason =
  | 'ready'
  | 'closed-hours'
  | 'no-staff'
  | 'no-path'
  | 'no-input'
  | 'output-full'
  | 'fixture-full'
  | 'no-potable-water'
  | 'wastewater-blocked'
  | 'leaking'
  | 'dirty'
  | 'too-noisy'
  | 'too-hot'
  | 'bad-air';

export interface FacilityReadiness {
  ready: boolean;
  reason: FacilityReadinessReason;
  detail: string;
  quality: number;
}

export interface FacilitySession {
  ownerKind: ReservationOwnerKind;
  ownerId: number | string;
  activity: FacilityActivityKind;
  module: ModuleType;
  targetTile: number;
  startedAt: number;
  endsAt: number;
  readiness: FacilityReadiness;
}

export interface ProviderSummary {
  id: string;
  kind: ProviderKind;
  activity?: FacilityActivityKind;
  module: ModuleType;
  room: RoomType;
  tileIndex: number;
  capacity: number;
  reserved: number;
  users: number;
  queued: number;
  status: ProviderStatus;
  blockedReason: string | null;
  readiness?: FacilityReadiness;
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
  /** Structural expansion parent, when this site is one staged piece of a deferred hull commission. */
  structuralProjectId?: number;
  structuralStage?: 'perimeter' | 'interior';
}

export type StructuralExpansionPhase = 'perimeter' | 'interior' | 'blocked' | 'commissioned' | 'cancelled';

export interface StructuralExpansionTarget {
  tileIndex: number;
  targetTile: TileType;
  requiredMaterials: number;
}

/**
 * Durable parent for a truss expansion. Child construction sites do the
 * visible delivery/EVA work; the target hull is only written when every
 * child has completed, so a partial shell can never pressurize.
 */
export interface StructuralExpansionProject {
  id: number;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  doorTile: number | null;
  targets: StructuralExpansionTarget[];
  phase: StructuralExpansionPhase;
  childSiteIds: number[];
  completedSiteIds: number[];
  requiredMaterials: number;
  deliveredMaterials: number;
  refundedMaterials: number;
  blockedReason: string | null;
  cancelled: boolean;
  commissioned: boolean;
  createdAt: number;
  finishedAt: number | null;
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
  | 'recreation'
  | 'fuel';
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

/** Compact dock-side work state for an individual tiny-craft visit. */
export type SmallCraftServiceKind = 'passenger' | 'refuel' | 'freight' | 'repair';
export type SmallCraftServiceStatus = 'pending' | 'active' | 'complete' | 'blocked' | 'skipped';

export interface SmallCraftService {
  kind: SmallCraftServiceKind;
  status: SmallCraftServiceStatus;
  /** Normalized 0..1 work completion for concise dock/UI inspection. */
  progress: number;
  durationSec: number;
  elapsedSec: number;
  blockedReason: string | null;
  /** Credits earned after this specific service finishes. */
  creditsEarned: number;
  /** Station-rating contribution earned after this specific service finishes. */
  ratingDelta: number;
  /** Physical units transferred or consumed, where applicable. */
  transferredUnits: number;
  freightDirection?: 'import' | 'export';
}

export interface SmallCraftVisit {
  dockSourceKey: string;
  startedAt: number;
  patienceExpiresAt: number;
  services: SmallCraftService[];
  /**
   * Durable, visit-local demand accounting. These values are updated at the
   * physical completion and ledger gates, then consumed when this pod leaves.
   * Keeping them here avoids inferring a long call from bounded station logs.
   */
  servedDemand: {
    food: number;
    supplies: number;
    shipService: number;
  };
  /** Positive station revenue attributable to this one pod visit. */
  earnedCredits: number;
}

export type PortTurnaroundPhase = 'inspection' | 'unloading' | 'loading' | 'open' | 'departing';

export interface PortTurnaround {
  phase: PortTurnaroundPhase;
  customsTile: number;
  cargoTile: number;
  inspectionProgress: number;
  inspectionRequired: number;
  clearanceJobId: number | null;
  cargoReleased: boolean;
  inboundTotal: number;
  inboundUnloaded: number;
  outboundRequired: { rawMaterial: number; meal: number; tradeGood: number };
  outboundLoaded: { rawMaterial: number; meal: number; tradeGood: number };
  fuelRequired: number;
  fuelDelivered: number;
  loadingDeadlineAt: number;
  payoutCredits: number;
  fulfillmentRatio: number;
  payoutSettled: boolean;
}

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
  /** Stable dock source for save remapping; runtime dock ids are derived. */
  assignedDockSourceKey?: string | null;
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
  /** Original player-approved visit contract; retained through turnaround. */
  portManifest?: TrafficOffer;
  /** Physical, crew-worked port visit state for player-approved traffic. */
  portTurnaround?: PortTurnaround;
  /** Accepted operational promise tracked in StationState.portOps. */
  portContractId?: number;
  /** Present only for small dock visits; absent on berth traffic and old saves. */
  smallCraftVisit?: SmallCraftVisit;
  /** Optional lifecycle metadata. Legacy ships hydrate to their current stage. */
  stayClass?: VisitStayClass;
  visitPhase?: ShipVisitPhase;
  earliestDepartureAt?: number;
  plannedDepartureAt?: number;
  extensionUntil?: number | null;
  recallAt?: number | null;
  // Dock-migration v0: when set, this ship is bound to a Berth room
  // (not a legacy Dock tile-cluster). The anchor is the lowest tile
  // index in the berth cluster — used by render to fit the ship inside
  // the berth interior, and by sim to look up the cluster on demand.
  // Null for legacy-dock ships.
  assignedBerthAnchor?: number | null;
  /**
   * Durable physical-frontage ownership. Offers reserve a compatible
   * interface; this record serializes the shared space around that interface.
   */
  approachCommitment?: ApproachCommitment | null;
}

export interface ApproachCommitment {
  slotId: string;
  groupIds: string[];
  phase: 'approach' | 'depart';
  status: 'waiting' | 'active';
  queuedAt: number;
}

export interface CoreState {
  centerTile: number;
  serviceTile: number;
  frameTiles: number[];
}

export interface DockEntity {
  id: number;
  /** Legacy tile clusters remain valid while module-backed docks roll out. */
  sourceKind: 'legacy-tile-cluster' | 'pod-dock-module';
  /** Stable reconstruction key. Runtime ids may change after a topology edit. */
  sourceKey: string;
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
  /** Module-backed docks retain their physical wall mount and interior entry. */
  moduleId?: number;
  mountTile?: number;
  accessTile?: number;
  podCapabilities?: PodDockCapability[];
  attachmentModuleIds?: Partial<Record<PodDockCapability, number>>;
}

export type PodDockCapability = 'fuel' | 'freight' | 'maintenance';

export interface PodDockPlacementView {
  originTile: number;
  accessTile: number | null;
  facing: SpaceLane | null;
  approachTiles: number[];
  valid: boolean;
  reason: string | null;
}

export interface PodDockAttachmentView {
  originTile: number;
  attachment: PodDockCapability;
  dockModuleId: number | null;
  dockAnchorTile: number | null;
  valid: boolean;
  reason: string | null;
}

export type BerthGeometryKind = 'u-shaped' | 'legacy-rectangular' | 'invalid';

export interface BerthFacility {
  anchorTile: number;
  clusterTiles: number[];
  size: BerthSizeClass;
  geometry: BerthGeometryKind;
  geometryValid: boolean;
  legacyCompatibility: boolean;
  spaceExposed: boolean;
  accessReady: boolean;
  controlModuleId: number | null;
  clampModuleIds: number[];
  clampCapacity: number;
  capabilities: CapabilityTag[];
  moduleIdsByCapability: Partial<Record<CapabilityTag, number[]>>;
  serviceModuleIds: Partial<Record<ModuleType, number[]>>;
  reasons: string[];
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
  screeningLevel?: BerthScreeningLevel;
  customsPolicy?: CustomsPolicy;
  /** Persistent local service record. Good physical turnaround raises the next contract's yield here. */
  serviceScore?: number;
  serviceVisits?: number;
  serviceLastDelta?: number;
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
  laneRoutes?: LaneRoute[];
}

export interface DockQueueEntry {
  shipId: number;
  lane: SpaceLane;
  shipType: ShipType;
  size: ShipSize;
  queuedAt: number;
  timeoutAt: number;
}

export type TrafficOfferStatus = 'forecast' | 'holding' | 'cleared';
export type ApproachInterfaceKind = 'pod-dock' | 'berth';
export type PortOfferKind = 'passenger' | 'freight' | 'mixed';
export type PortPromiseKind =
  | 'dock'
  | 'passengers-served'
  | 'drinks-served'
  | 'leisure-served'
  | 'restroom-served'
  | 'hygiene-served'
  | 'comfort-served'
  | 'passengers-returned'
  | 'freight-unloaded'
  | 'freight-loaded'
  | 'fuel-received'
  | 'fuel-delivered'
  | 'inspection'
  | 'condition';
export type PortContractStatus = 'accepted' | 'active' | 'boarding' | 'settled' | 'departed';
export type CargoOwnership = 'station' | 'consigned' | 'specialty-input';

export interface PortPromiseComponent {
  kind: PortPromiseKind;
  label: string;
  target: number;
  completed: number;
  payoutCredits: number;
}

export interface PortContract {
  id: number;
  offerId: number;
  shipId: number;
  callsign: string;
  offerKind: PortOfferKind;
  assignedBerthAnchor: number;
  acceptedAt: number;
  arrivesAt: number;
  boardingStartsAt: number;
  hardDepartureAt: number;
  status: PortContractStatus;
  promises: PortPromiseComponent[];
  passengerSpendingCredits: number;
  procurementCostCredits: number;
  settlementId: number | null;
  stayClass?: VisitStayClass;
  earliestDepartureAt?: number;
  plannedDepartureAt?: number;
  extensionUntil?: number | null;
  recallAt?: number | null;
}

export interface PortCargoLot {
  id: number;
  contractId: number;
  ownership: CargoOwnership;
  itemType: ItemType;
  quantity: number;
  reservedCapacity: number;
  handledQuantity: number;
  locationTile: number | null;
  location: 'aboard' | 'staging' | 'storage' | 'delivered' | 'closed';
}

export interface PortSettlement {
  id: number;
  contractId: number;
  shipId: number;
  callsign: string;
  /** Berth that produced the result, retained for short-lived in-world feedback. */
  settledAt: number;
  promises: PortPromiseComponent[];
  payoutCredits: number;
  /** Credits deducted for promised services the station did not deliver. */
  shortfallPenaltyCredits?: number;
  passengerSpendingCredits: number;
  procurementCostCredits: number;
  notes: string[];
}

export interface PortOpsTelemetry {
  offersAccepted: number;
  offersRefused: number;
  settlements: number;
  fullSettlements: number;
  partialSettlements: number;
  hardDeadlineDepartures: number;
  peakPassengerQueue: number;
  passengerQueuePersonSeconds: number;
  berthOccupancySeconds: number;
  cargoUnitTileDistance: number;
  mealTarget: number;
  mealsCompleted: number;
  freightTarget: number;
  freightCompleted: number;
  fuelPurchased: number;
  fuelSold: number;
  fuelTarget: number;
  fuelCompleted: number;
}

export interface PortOpsState {
  version: 1;
  offerSequenceIndex: number;
  nextContractId: number;
  nextCargoLotId: number;
  nextSettlementId: number;
  contracts: PortContract[];
  cargoLots: PortCargoLot[];
  settlements: PortSettlement[];
  selectedSettlementId: number | null;
  firstOfferShownAt: number | null;
  firstChoiceAt: number | null;
  crewReassignments: number;
  cargoHandledLifetime: number;
  cargoArmLastHandled: number;
  cargoArmStrain: number;
  cargoArmStatus: 'ready' | 'warning' | 'fault';
  cargoArmRepairProgress: number;
  cargoArmFaults: number;
  cargoArmLastFaultRollAt: number;
  cargoArmFaultContractIds: number[];
  telemetry: PortOpsTelemetry;
}

/** A finite, inspectable ship visit waiting for a player berth decision. */
export interface TrafficOffer {
  id: number;
  callsign: string;
  shipName: string;
  lane: SpaceLane;
  shipType: ShipType;
  offerKind?: PortOfferKind;
  size: ShipSize;
  status: TrafficOfferStatus;
  forecastAt: number;
  arrivesAt: number;
  expiresAt: number;
  passengersTotal: number;
  manifestDemand: { cafeteria: number; market: number; lounge: number };
  manifestMix: Record<VisitorArchetype, number>;
  hospitalityDemand?: HospitalityDemand;
  inboundCargo: { rawMaterial: number; rawMeal: number; tradeGood: number };
  outboundRequest: { rawMaterial: number; meal: number; tradeGood: number };
  fuelSupply?: number;
  fuelRequest?: number;
  fuelProcurementCostCredits?: number;
  procurementKind?: 'food-supply';
  stationProcurementCostCredits?: number;
  requestedServices: ShipServiceTag[];
  berthTimeSec: number;
  dockingFee: number;
  projectedSpend: number;
  riskLabel: 'low' | 'guarded' | 'high';
  /** Berth reserved by advance player clearance while the ship is still inbound. */
  assignedBerthAnchor?: number | null;
  /** Stable small-craft reservation. Runtime dock ids are rebuilt after topology changes. */
  assignedDockSourceKey?: string | null;
  /** One disclosed schedule extension; repeated holds are not free parking. */
  holdUsed?: boolean;
}

/** A physical station interface summarized for quick approach decisions. */
export interface ApproachInterfaceSummary {
  kind: ApproachInterfaceKind;
  id: string;
  label: string;
  available: boolean;
  compatible: boolean;
}

/**
 * Compact decision data for the Approach Control UI. It deliberately gives a
 * player operational consequences, not a full manifest to read line by line.
 */
export interface TrafficOfferPreview {
  offerId: number;
  shipClass: 'pod' | 'berth';
  partySize: { min: number; max: number };
  staySeconds: { min: number; max: number };
  serviceCues: string[];
  compatibleInterface: {
    kind: ApproachInterfaceKind;
    compatibleCount: number;
    freeCount: number;
    reservedCount: number;
    interfaces: ApproachInterfaceSummary[];
  };
  expectedRevenue: { min: number; max: number };
  committedLoad: {
    berthSeconds: number;
    bedNights: number;
    meals: number;
    hygieneVisits: number;
    staffMinutes: number;
  };
  canAccept: boolean;
  acceptReason: string | null;
  canHold: boolean;
  canPass: boolean;
}

export interface IncidentEntity {
  id: number;
  type: IncidentType;
  tileIndex: number;
  targetTile?: number | null;
  severity: number;
  createdAt: number;
  dispatchAt: number | null;
  interveneAt: number | null;
  resolveBy: number;
  stage: IncidentStage;
  outcome: IncidentOutcome | null;
  resolvedAt: number | null;
  assignedCrewId: number | null;
  subjectKind?: IncidentSubjectKind | null;
  subjectId?: number | null;
  residentParticipantIds: number[];
  extendedResolveAt: number | null;
  brigTile?: number | null;
  holdUntil?: number | null;
  blockedReason?: string | null;
  value?: number;
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
  simPhaseMs?: Record<string, number>;
  simPhasePathCalls?: Record<string, number>;
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
  reputationPrestigeAvg: number;
  reputationNotorietyAvg: number;
  reputationControlAvg: number;
  reputationCrimePressureAvg: number;
  reputationHighRiskZones: number;
  reputationTopZone: string;
  reputationPremiumDemandBonusPct: number;
  reputationRiskyDemandBonusPct: number;
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
  foodSupplyOrdersPlaced: number;
  foodSupplyUnitsOrdered: number;
  preppedMealStock: number;
  cleanTrayStock: number;
  dirtyTrayStock: number;
  drinkStock: number;
  potableNetworkCount: number;
  potableNetworkPoweredFixtures: number;
  waterNetworkDisconnectedTiles: number;
  wastewaterBacklog: number;
  floodedTiles: number;
  activePlumbingLeaks: number;
  assignedSleepSlots: number;
  improvisedRestingCrew: number;
  facilityProviderQueries: number;
  inventoryPairScans: number;
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
  visitsThisCycle: number;
  visitFailuresThisCycle: number;
  visitRevenueThisCycle: number;
  visitorExitStalled: boolean;
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
  turnaroundsCompletedLifetime: number;
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
  thermalAvg: number;
  thermalMax: number;
  hotTiles: number;
  staleAirTiles: number;
  coolingLoad: number;
  airNetworkCount: number;
  airNetworkPoweredVents: number;
  airNetworkUnpoweredVents: number;
  disconnectedAirDuctTiles: number;
  averageAirNetworkDistance: number;
  thermalPenaltyPerMin: number;
  thermalPenaltyTotal: number;
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

// Crowd-loop v1: transient, never-serialized crowd state. Queue chains are
// ordered wall-hugging tile lines per serving station; members are visitor
// ids in arrival order. Floaters/eventFeed are pure theater (lost-sale coins,
// death notices) consumed by the renderer + alert panel.
export interface QueueTheater {
  chainsByAnchor: Map<number, number[]>;
  chainsVersion: string;
  membersByAnchor: Map<number, number[]>;
  floaters: Array<{ x: number; y: number; text: string; color: string; bornAt: number }>;
  eventFeed: Array<{ at: number; tone: 'danger' | 'warn' | 'info'; text: string }>;
}

export interface PlumbingLeak {
  id: number;
  tileIndex: number;
  fixtureTile: number;
  severity: number;
  createdAt: number;
  isolated: boolean;
  repairJobId: number | null;
}

export interface PlumbingState {
  version: number;
  floodByTile: Float32Array;
  leaks: PlumbingLeak[];
  nextLeakId: number;
}

export interface DerivedCache {
  serviceTargetsByRoom: Map<RoomType, number[]>;
  queueTargets: number[];
  queueTargetSet: Set<number>;
  queueTheater: QueueTheater;
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
  workplace?: {
    anchorTile: number;
    label: string;
    positions: number;
    eligibleRoles: StaffRole[];
    assignedCrew: Array<{ id: number; name: string; role: StaffRole }>;
    activeCrew: Array<{ id: number; name: string; role: StaffRole }>;
    tenantManaged: boolean;
    tenantStaff: number;
    tenantStaffExpected: number;
  };
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
  thermal?: ThermalRoomDiagnostic;
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
    serviceStaff: number;
    tenantStaff: number;
    pressure: 'low' | 'medium' | 'high';
  };
  cantinaLoad?: {
    barCounters: number;
    pickupSlots: number;
    lineVisitors: number;
    orderingVisitors: number;
    seatsUsed: number;
    seatsCapacity: number;
    waitingForSeat: number;
    stewardCount: number;
    taps: number;
    unstaffed: boolean;
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
  /** Sleep *slots*, not fixture count: a Bunk sleeps two, a Bed sleeps one. */
  bedsTotal: number;
  bedsAssigned: number;
  /** Sleeping fixtures behind those slots, so the copy can name both. */
  bedModuleCount: number;
  hygieneTargets: number;
  validPrivateHousing: boolean;
}

export type AgentInspectorKind = 'visitor' | 'resident' | 'crew';
export type AgentHealthState = 'healthy' | 'distressed' | 'critical';
export type VisitorDesire = 'eat' | 'toilet' | 'leisure' | 'exit_station';
export type ResidentDominantNeed = 'hunger' | 'energy' | 'hygiene' | 'none';
export type ResidentDesire = 'return_home_ship' | 'sleep' | 'hygiene' | 'eat' | 'socialize' | 'seek_safety' | 'wander';
export type CrewDesire = 'rest' | 'eat' | 'clean' | 'toilet' | 'drink' | 'leisure' | 'social' | 'logistics' | 'staff_post' | 'idle';

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
  name: string;
  trait: VisitorTrait;
  archetype: VisitorArchetype;
  primaryPreference: VisitorPreference;
  patience: number;
  servedMeal: boolean;
  carryingMeal: boolean;
  reservedServingTile: number | null;
  reservedTargetTile: number | null;
  servicePlan: HospitalityServiceKind[];
  completedServices: HospitalityServiceKind[];
  activeService: HospitalityServiceKind | null;
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
  hunger: number;
  hygiene: number;
  bladder: number;
  thirst: number;
  morale: number;
  missedPayrollCycles: number;
  needsStrainSec: number;
  resignationNoticeAt: number | null;
  resting: boolean;
  eating: boolean;
  carryingMeal: boolean;
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
  manualTrafficAdmission: boolean;
  /** Earned dispatch policy: low-risk manifests matching berth filters reserve automatically. */
  portAutoAdmitEnabled: boolean;
  /** How much traffic risk Approach Control may clear without asking the player. */
  portAutoAdmitPolicy: 'cautious' | 'balanced' | 'open';
  /** Earned workforce policy: shift minimums rebalance against live operational pressure. */
  crewAutoStaffEnabled: boolean;
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
  securityPosture: SecurityPosture;
  crewPriorityPreset: CrewPriorityPreset;
  crewPriorityWeights: CrewPriorityWeights;
  /** Player-set minimum headcount by visible work shift. Zero leaves a lane on automatic dispatch. */
  crewShiftTargets: CrewShiftTargets;
  /** Department targets for Alpha, Beta, and Gamma watches. */
  crewWatchTargets: [CrewShiftTargets, CrewShiftTargets, CrewShiftTargets];
  /** Emergency recall temporarily makes every watch dispatchable at a needs cost. */
  emergencyRecallUntil: number;
}

/**
 * Persistent opening-economy data. The pure domain modules own the detailed
 * value contracts; this envelope gives simulation, save, UI, and rendering a
 * single shared home without coupling those layers to one another.
 */
export interface OpeningEconomyState {
  ledger: EconomyLedger;
  /** What recent pod calls wanted, got, and left on the table (OPEN-02). */
  podDemand: PodDemandLog;
  marketPricingPolicy: MarketPricingPolicy;
  podFreightOperations: PodFreightOperation[];
  capitalProjects: CapitalProjectsState;
}

export interface StationState {
  /**
   * Canonical completed-service record (shared contract C1). Promises,
   * settlement reports, progression goals and world feedback all read this
   * log rather than inferring completion from their own local signal.
   */
  serviceLog: ServiceLog;
  width: number;
  height: number;
  tiles: TileType[];
  zones: ZoneType[];
  rooms: RoomType[];
  roomHousingPolicies: HousingPolicy[];
  modules: ModuleType[];
  moduleInstances: ModuleInstance[];
  moduleOccupancyByTile: Array<number | null>;
  commercialUnits: CommercialUnit[];
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
  // Chartered system position + derived environmental baselines. Absent
  // on legacy saves and un-chartered starts; all consumers must treat
  // undefined as current default behavior. See SiteCharter (end of file).
  site?: SiteCharter;
  // The seed used to seed the StationState rng. Stored separately so
  // generateSystemMap can derive a stable sub-seed without depleting
  // state.rng. Mirrored into state.system.seedAtCreation when the
  // system rolls.
  seedAtCreation: number;
  mapWorldOriginX: number;
  mapWorldOriginY: number;
  laneProfiles: Record<SpaceLane, LaneProfile>;
  dockQueue: DockQueueEntry[];
  trafficOffers: TrafficOffer[];
  portOps: PortOpsState;
  openingEconomy: OpeningEconomyState;
  pressurized: boolean[];
  // Per-tile air quality 0..100. Computed each tick from life-support coverage
  // distance + active source count. Local exposure checks (crew, visitor,
  // resident) read this instead of metrics.airQuality so a sealed-off wing
  // becomes locally lethal even when the station-wide average looks fine.
  airQualityByTile: Float32Array;
  // Per-tile comfort heat and stale-air pressure, 0..100. These stay separate
  // from oxygen/survival air quality so Air Coverage remains readable.
  heatByTile: Float32Array;
  staleAirByTile: Float32Array;
  utilityUnderlay: UtilityUnderlayState;
  // Per-tile sanitation drift, 0..100. Dirt sources are stored as compact
  // codes for hover/inspector diagnostics and are reset to none when a tile
  // is cleaned or rebuilt.
  dirtByTile: Float32Array;
  dirtSourceByTile: Uint8Array;
  plumbing: PlumbingState;
  mapConditionVersion: number;
  pathOccupancyByTile: Map<number, number>;
  jobs: TransportJob[];
  reservations: Reservation[];
  constructionSites: ConstructionSite[];
  structuralExpansionProjects: StructuralExpansionProject[];
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
  commercialUnitSpawnCounter: number;
  commercialOfferSpawnCounter: number;
  jobSpawnCounter: number;
  reservationSpawnCounter: number;
  constructionSiteSpawnCounter: number;
  structuralExpansionProjectSpawnCounter: number;
  incidentSpawnCounter: number;
  incidentHeat: number;
  lastPayrollAt: number;
  lastResidentTaxAt: number;
  recentExitTimes: number[];
  // Rolling ledger of visitor economic outcomes for the "this cycle" HUD
  // ticker. `gross`/`fails` are cumulative snapshots sampled once per metrics
  // pass; windowed deltas give per-cycle revenue and failure counts. Transient
  // (rebuilt at runtime), cleared on load like recentExitTimes.
  recentVisitLedger: Array<{ at: number; gross: number; fails: number }>;
  // Persistent-but-decaying "district memory" of incidents, keyed by the room
  // cluster anchor tile where each incident fired. Lets a neighbourhood stay
  // notorious after the specific incident resolves, so theft compounds local
  // reputation pressure (docs/22 §6). Transient (rebuilt in play, cleared on
  // load) like recentExitTimes.
  incidentMemory: Array<{ anchor: number; heat: number; count: number; lastAt: number }>;
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
    residentConversionFailureStreak?: number;
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
    thermalPenalty: number;
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
  kind:
    | 'none'
    | 'tile'
    | 'zone'
    | 'room'
    | 'module'
    | 'move-module'
    | 'utility-underlay'
    | 'copy-room'
    | 'paste-room'
    | 'cancel-construction'
    | 'hire-staff';
  tile?: TileType;
  zone?: ZoneType;
  room?: RoomType;
  module?: ModuleType;
  moveSourceModuleId?: number;
  utilityKind?: UtilityUnderlayKind;
  utilityErase?: boolean;
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

// --- Site Charter (see docs/29-site-charter-v1-implementation-plan.md) ---
// Additive, regenerated-from-seed system geometry + a derived per-site
// environmental profile. Both are optional so legacy saves and every
// existing test/scenario fixture are byte-for-byte unaffected.

/** A traffic lane rendered on the system map: a polyline between two
 *  system bodies (planets or gates). Regenerated from seed, never saved. */
export interface LaneRoute {
  id: string;
  from: string; // planet id or 'gate-N'
  to: string;
  volume: number; // 0..1
  points: Array<{ x: number; y: number }>; // polyline, disc coords
}

/** Chartered system position and its derived environmental baselines.
 *  Absent on legacy saves and un-chartered starts: all systems must
 *  treat undefined as "current default behavior". */
export interface SiteCharter {
  version: 1;
  /** Normalized system-map position, 0..1 disc coordinates. */
  x: number;
  y: number;
  /** Derived once at charter time from system geometry. All 0..1. */
  sunFactor: number;      // raises map-condition 'sunlight' baseline
  debrisFactor: number;   // raises map-condition 'debris-risk' baseline
  resourceType: 'metal' | 'ice' | 'gas' | null; // nearest belt flavor
  /** Per-lane traffic multipliers, 1 = current default volume. */
  laneTrafficFactor: Record<SpaceLane, number>;
}
