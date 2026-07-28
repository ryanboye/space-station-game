import {
  createInitialState,
  setBerthAllowedShipSize,
  setBerthAllowedShipType,
  setBerthScreeningLevel,
  setDockAllowedShipSize,
  setDockAllowedShipType,
  setDockFacing,
  setDockPurpose,
  reconcilePhysicalApproachCommitments,
  rebuildPassengerTransfersAfterHydration,
  restorePersistedTransportJobs,
  tick,
  tryPlaceModule
} from './sim';
import {
  type DockPurpose,
  type CardinalDirection,
  type ExteriorIntegrityPanel,
  type ExteriorIntegrityState,
  type BerthScreeningLevel,
  type CustomsPolicy,
  type CrewShiftTargets,
  type CommercialUnit,
  type CommercialOffer,
  type HousingPolicy,
  type ItemType,
  type TransportJob,
  type ArrivingShip,
  type SmallCraftService,
  type SmallCraftVisit,
  type MaintenanceDomain,
  type MaintenanceSource,
  type PortContractStatus,
  type PortOfferKind,
  type ShipServiceTag,
  type PortOpsState,
  type PortPromiseKind,
  type PassengerTransferPhase,
  type Resident,
  ResidentState,
  type SiteCharter,
  type SpecialtyId,
  type SpecialtyProgress,
  type StaffRole,
  type StaffRoleCounts,
  type UnlockId,
  type UnlockTier,
  type UtilityUnderlayKind,
  ModuleType,
  type ModuleRotation,
  RoomType,
  type ShipSize,
  type ShipType,
  type SecurityPosture,
  type SpaceLane,
  TileType,
  type StationState,
  type TrafficOffer,
  type VisitorArchetype,
  type Visitor,
  type VisitorNeeds,
  type VisitorServiceFailureStage,
  type VisitStayClass,
  VisitorState,
  ZoneType,
  fromIndex,
  isWalkable
} from './types';
import { ensureBerthConfig, setBerthCustomsPolicy } from './dock-controls';
import { isCompatibleShipHullVariant, selectShipHullVariant } from './ship-hulls';
import {
  UTILITY_UNDERLAY_KINDS,
  createUtilityUnderlayFromLayers,
  ensureUtilityUnderlay,
  isUtilityUnderlayKind
} from './utility-underlay';
import { MODULE_UNLOCK_TIER, ROOM_UNLOCK_TIER, UNLOCK_DEFINITIONS } from './content/unlocks';
import {
  SPECIALTY_DEFINITIONS,
  STAFF_ROLES,
  createEmptyStaffRoleCounts,
  createInitialDepartments,
  createInitialSpecialtyProgress,
  totalStaffCount
} from './content/command';
import {
  DEFAULT_ECONOMY_RECENT_LIMIT,
  createEconomyLedger,
  normalizeEconomyLedger,
  type EconomyLedger,
  type MarketPricingPolicy
} from './opening-economy';
import { normalizeServiceLog, type ServiceLog } from './service-truth';
import { createPodDemandLog, normalizePodDemandLog } from './pod-demand';
import { createCapitalProjectsState, hydrateCapitalProjectsState } from './capital-projects';
import {
  validatePodFreightOperation,
  type CourierHandling,
  type PodFreightDirection,
  type PodFreightOperation,
  type PodFreightStatus,
  type PodFreightStockKind,
  type SupplierDelivery
} from './pod-freight';

const SAVE_SCHEMA_VERSION = 3 as const;
const ITEM_TYPES: ItemType[] = [
  'rawMeal',
  'preppedMeal',
  'meal',
  'cleanTray',
  'dirtyTray',
  'drink',
  'rawMaterial',
  'tradeGood',
  'fuel',
  'body'
];
const VISITOR_ARCHETYPES: readonly VisitorArchetype[] = ['diner', 'shopper', 'lounger', 'rusher'];
const SHIP_TYPES: ShipType[] = ['tourist', 'trader', 'industrial', 'military', 'colonist'];
const SHIP_SIZES: ShipSize[] = ['small', 'medium', 'large'];
const SMALL_CRAFT_SERVICE_KINDS = ['passenger', 'refuel', 'freight', 'repair'] as const;
const SMALL_CRAFT_SERVICE_STATUSES = ['pending', 'active', 'complete', 'blocked', 'skipped'] as const;
const VISIT_STAY_CLASSES: VisitStayClass[] = ['errand', 'shore', 'contract', 'extended', 'permanent'];
const VISITOR_FAILURE_STAGES: VisitorServiceFailureStage[] = ['none', 'unmet', 'balking', 'distressed', 'disruptive'];
const PASSENGER_TRANSFER_PHASES: PassengerTransferPhase[] = [
  'station',
  'disembark-queued',
  'disembark-crossing',
  'boarding-queued',
  'boarding-crossing'
];
const SHIP_VISIT_PHASES = ['announced', 'approach', 'secure', 'visit-service', 'recall', 'boarding', 'depart'] as const;
const BERTH_SCREENING_LEVELS: BerthScreeningLevel[] = ['open', 'standard', 'strict'];
const CUSTOMS_POLICIES: CustomsPolicy[] = ['routine', 'selective', 'expedited', 'seizure'];
const SECURITY_POSTURES: SecurityPosture[] = ['discreet', 'standard', 'visible'];
const SPACE_LANES: SpaceLane[] = ['north', 'east', 'south', 'west'];
const HOUSING_POLICIES: HousingPolicy[] = ['crew', 'visitor', 'resident', 'private_resident'];
const COMMERCIAL_KINDS = ['market-stall', 'cantina', 'restaurant', 'gift-shop'] as const;
const COMMERCIAL_PHASES = ['vacant', 'offers', 'fitting-out', 'open', 'closed'] as const;
const MAINTENANCE_DOMAINS: MaintenanceDomain[] = ['utility', 'module', 'hull', 'dock', 'berth', 'door', 'vent', 'plumbing'];
const MAINTENANCE_SOURCES: MaintenanceSource[] = ['idle', 'high-load', 'debris', 'traffic', 'heat', 'fire-aftermath', 'construction', 'plumbing'];
const PORT_OFFER_KINDS: PortOfferKind[] = ['passenger', 'freight', 'mixed'];
const SHIP_SERVICE_TAGS: ShipServiceTag[] = [
  'cafeteria', 'market', 'lounge', 'workshop', 'security', 'hygiene',
  'housing', 'clinic', 'recreation', 'fuel'
];
const PORT_PROMISE_KINDS: PortPromiseKind[] = [
  'dock',
  'passengers-served',
  'drinks-served',
  'leisure-served',
  'restroom-served',
  'hygiene-served',
  'comfort-served',
  'passengers-returned',
  'freight-unloaded',
  'freight-loaded',
  'fuel-received',
  'fuel-delivered',
  'inspection',
  'condition'
];
const PORT_CONTRACT_STATUSES: PortContractStatus[] = ['accepted', 'active', 'boarding', 'settled', 'departed'];
const MARKET_PRICING_POLICIES: MarketPricingPolicy[] = ['budget', 'standard', 'premium'];
const POD_FREIGHT_STOCK_KINDS: PodFreightStockKind[] = ['travel-supplies', 'prepared-meals', 'fuel', 'raw-materials'];
const POD_FREIGHT_STATUSES: PodFreightStatus[] = [
  'ordered',
  'arrived',
  'unloading',
  'blocked',
  'complete',
  'partial',
  'cancelled',
  'expired'
];
const POD_FREIGHT_DIRECTIONS: PodFreightDirection[] = ['inbound', 'outbound', 'transfer'];
const MAX_POD_FREIGHT_OPERATIONS = 64;
const SPECIALTY_IDS = SPECIALTY_DEFINITIONS.map((def) => def.id);
// Derived from UNLOCK_DEFINITIONS so adding a 7th tier doesn't require
// hand-editing two parallel tables. UNLOCK_DEFINITIONS is tier-ordered
// (1..6), so the canonical id list is just .map(d => d.id), and the
// per-tier prefix slice gives the cumulative ids unlocked at that tier.
const UNLOCK_IDS: UnlockId[] = UNLOCK_DEFINITIONS.map((d) => d.id);
const UNLOCK_IDS_BY_TIER: Record<UnlockTier, UnlockId[]> = {
  0: [],
  1: UNLOCK_IDS.slice(0, 1),
  2: UNLOCK_IDS.slice(0, 2),
  3: UNLOCK_IDS.slice(0, 3),
  4: UNLOCK_IDS.slice(0, 4),
  5: UNLOCK_IDS.slice(0, 5),
  6: UNLOCK_IDS.slice(0, 6)
};

export interface StationSnapshotV1 {
  simTime: number;
  width: number;
  height: number;
  mapWorldOriginX?: number;
  mapWorldOriginY?: number;
  tiles: TileType[];
  zones: ZoneType[];
  rooms: RoomType[];
  roomHousingPolicies: HousingPolicy[];
  modules: Array<{
    type: ModuleType;
    originTile: number;
    rotation: ModuleRotation;
    purchaseCost?: number;
  }>;
  commercialUnits?: CommercialUnit[];
  constructionSites: Array<{
    id?: number;
    kind: 'tile' | 'module';
    tileIndex: number;
    targetTile?: TileType;
    targetModule?: ModuleType;
    rotation?: ModuleRotation;
    requiredMaterials: number;
    deliveredMaterials: number;
    buildProgress: number;
    buildWorkRequired: number;
    requiresEva: boolean;
    state?: 'planned' | 'delivering' | 'building' | 'blocked' | 'done';
    structuralProjectId?: number;
    structuralStage?: 'perimeter' | 'interior';
  }>;
  structuralExpansionProjects?: Array<{
    id: number;
    bounds: { minX: number; minY: number; maxX: number; maxY: number };
    doorTile: number | null;
    targets: Array<{ tileIndex: number; targetTile: TileType; requiredMaterials: number }>;
    phase: 'perimeter' | 'interior' | 'blocked' | 'commissioned' | 'cancelled';
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
  }>;
  mapExpansion?: {
    purchased: { north: boolean; east: boolean; south: boolean; west: boolean };
    purchasesMade: number;
  };
  dockConfigs: Array<{
    anchorTile: number;
    sourceKey?: string;
    purpose: DockPurpose;
    facing: SpaceLane;
    allowedShipTypes: ShipType[];
    allowedShipSizes: ShipSize[];
  }>;
  // Optional on the wire — older saves predate this slot. Empty array
  // on missing → existing berth-cluster picks default-all on load.
  berthConfigs?: Array<{
    anchorTile: number;
    allowedShipTypes: ShipType[];
    allowedShipSizes: ShipSize[];
    screeningLevel?: BerthScreeningLevel;
    customsPolicy?: CustomsPolicy;
    serviceScore?: number;
    serviceVisits?: number;
    serviceLastDelta?: number;
  }>;
  resources: {
    credits: number;
    waterStock: number;
    airQuality: number;
    legacyMaterialStock: number;
  };
  crew: {
    total: number;
    roleCounts?: Partial<Record<StaffRole, number>>;
    members?: Array<{
      id: number;
      name: string;
      tileIndex?: number;
      staffRole?: StaffRole;
      shiftBucket?: number;
      recalledUntil?: number;
      homeWorkplaceTile?: number | null;
      assignedSleepTile?: number | null;
      energy: number;
      hunger?: number;
      hygiene: number;
      bladder: number;
      thirst: number;
      morale: number;
      missedPayrollCycles: number;
      needsStrainSec: number;
      resignationNoticeAt: number | null;
      airExposureSec: number;
      healthState: 'healthy' | 'distressed' | 'critical';
      blockedTicks?: number;
      movementReplanCooldownUntil?: number;
      /** An active haul remains physically held by this crew member across save/load. */
      activeJobId?: number | null;
      carryingItemType?: ItemType | null;
      carryingAmount?: number;
    }>;
  };
  residents?: Resident[];
  command?: {
    selectedSpecialty: SpecialtyId | null;
    completedSpecialties: SpecialtyId[];
    specialtyProgress: Partial<Record<SpecialtyId, SpecialtyProgress>>;
    officers: Partial<Record<StaffRole, boolean>>;
  };
  inventoryByTile: Array<{
    tileIndex: number;
    items: Partial<Record<ItemType, number>>;
  }>;
  /**
   * Only ordinary pickup/deliver work persists. Repair, production, and
   * sanitation jobs are regenerated from their authoritative world state.
   */
  transportJobs?: Array<Pick<TransportJob,
    'id' | 'type' | 'itemType' | 'amount' | 'fromTile' | 'toTile' |
    'assignedCrewId' | 'createdAt' | 'expiresAt' | 'state' |
    'pickedUpAmount' | 'completedAt' | 'lastProgressAt' | 'stallReason' |
    'stalledSince' | 'blockedReason' | 'portShipId' | 'portCargoLotId' |
    'portCargoDirection' | 'portFuelNodeTile'
  >>;
  controls: {
    shipsPerCycle: number;
    taxRate: number;
    portAutoAdmitEnabled?: boolean;
    portAutoAdmitPolicy?: 'cautious' | 'balanced' | 'open';
    crewAutoStaffEnabled?: boolean;
    materialAutoImportEnabled?: boolean;
    materialTargetStock?: number;
    materialImportBatchSize?: number;
    securityPosture?: SecurityPosture;
    crewShiftTargets?: Partial<CrewShiftTargets>;
    crewWatchTargets?: [Partial<CrewShiftTargets>, Partial<CrewShiftTargets>, Partial<CrewShiftTargets>];
    emergencyRecallUntil?: number;
  };
  unlocks: {
    tier: UnlockTier;
    unlockedIds: UnlockId[];
    unlockedAtSec: Partial<Record<UnlockId, number>>;
  };
  progression: {
    // Lifetime counters + the archetype-seen set that feed predicate-
    // driven tier advances. Must survive save/load; without them a
    // reload at T1 sees archetypesServedLifetime=0 and the T2 gate is
    // permanently stuck.
    mealsServedTotal: number;
    creditsEarnedLifetime: number;
    turnaroundsCompletedLifetime: number;
    tradeCyclesCompletedLifetime: number;
    incidentsResolvedLifetime: number;
    actorsTreatedLifetime: number;
    residentsConvertedLifetime: number;
    dockedShipsCompleted: number;
    archetypesEverSeen: Partial<Record<VisitorArchetype, boolean>>;
    /** Cumulative rating is progression, not a transient HUD metric. */
    rating?: {
      score: number;
      delta: number;
      penalties: {
        shipTimeout: number;
        shipSkip: number;
        visitorFailure: number;
        walkDissatisfaction: number;
        routeExposure: number;
        environment: number;
        sanitation: number;
        residentDeparture: number;
      };
      failureReasons: {
        noLeisurePath: number;
        shipServicesMissing: number;
        patienceBail: number;
        dockTimeout: number;
        trespass: number;
      };
      bonuses: {
        mealService: number;
        leisureService: number;
        successfulExit: number;
        residentRetention: number;
      };
    };
  };
  sanitation?: {
    dirtByTile: number[];
    dirtSourceByTile: number[];
  };
  thermal?: {
    heatByTile: number[];
    staleAirByTile: number[];
  };
  utilityUnderlay?: {
    version: number;
    layers: Partial<Record<UtilityUnderlayKind, number[]>>;
  };
  plumbing?: {
    version: number;
    floodByTile: number[];
    leaks: Array<{
      id: number;
      tileIndex: number;
      fixtureTile: number;
      severity: number;
      createdAt: number;
      isolated: boolean;
      repairJobId: number | null;
    }>;
    nextLeakId: number;
  };
  maintenance?: {
    debts: Array<{
      key: string;
      system?: 'reactor' | 'life-support';
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
      ignitionRiskSince?: number;
    }>;
    exteriorIntegrityTargets?: Array<{
      id: string;
      panel: ExteriorIntegrityPanel;
      worldX: number;
      worldY: number;
      face: CardinalDirection;
      wear: number;
      state: ExteriorIntegrityState;
      lastTransitionAt: number;
      lastImpactAt?: number;
    }>;
  };
  /** Optional for legacy v3 saves; hydration supplies a neutral default. */
  openingEconomy?: StationState['openingEconomy'];
  /** Canonical completed-service log. Optional for saves written before it. */
  serviceLog?: ServiceLog;
  portOps: PortOpsState;
  /** Pending approach decisions, including physical reservations made before arrival. */
  trafficOffers?: TrafficOffer[];
  activePortShips: ArrivingShip[];
  /** Active temporary occupants are durable from Phase 1A onward. */
  visitors?: Visitor[];
  // Optional on the wire — legacy saves and un-chartered starts predate this
  // slot. Absent → state.site stays undefined → current default behavior.
  site?: SiteCharter;
}

export interface StationSaveEnvelopeV1 {
  schemaVersion: number;
  gameVersion: string;
  createdAt: string;
  name: string;
  snapshot: StationSnapshotV1;
}

type ParseSuccess = {
  ok: true;
  save: StationSaveEnvelopeV1;
  warnings: string[];
};

type ParseFailure = {
  ok: false;
  error: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

// Tolerant restore of an optional chartered site profile. Absent or malformed
// → undefined (legacy / un-chartered start = current default behavior).
function normalizeSite(raw: unknown): SiteCharter | undefined {
  if (!isRecord(raw)) return undefined;
  const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
  const lanes: SpaceLane[] = ['north', 'east', 'south', 'west'];
  const rawLanes = isRecord(raw.laneTrafficFactor) ? raw.laneTrafficFactor : {};
  const laneTrafficFactor = {
    north: asFiniteNumber(rawLanes.north, 1),
    east: asFiniteNumber(rawLanes.east, 1),
    south: asFiniteNumber(rawLanes.south, 1),
    west: asFiniteNumber(rawLanes.west, 1)
  } as Record<SpaceLane, number>;
  for (const lane of lanes) laneTrafficFactor[lane] = Math.max(0, laneTrafficFactor[lane]);
  const resourceType = raw.resourceType === 'metal' || raw.resourceType === 'ice' || raw.resourceType === 'gas'
    ? raw.resourceType
    : null;
  return {
    version: 1,
    x: clamp01(asFiniteNumber(raw.x, 0.5)),
    y: clamp01(asFiniteNumber(raw.y, 0.5)),
    sunFactor: clamp01(asFiniteNumber(raw.sunFactor, 0)),
    debrisFactor: clamp01(asFiniteNumber(raw.debrisFactor, 0)),
    resourceType,
    laneTrafficFactor
  };
}

function normalizePodFreightOperation(raw: unknown): PodFreightOperation | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || raw.id.trim().length === 0) return null;
  const id = raw.id.trim().slice(0, 80);
  const status = isOneOf(raw.status, POD_FREIGHT_STATUSES) ? raw.status : 'ordered';
  const stockKind = isOneOf(raw.stockKind, POD_FREIGHT_STOCK_KINDS) ? raw.stockKind : null;
  if (!stockKind) return null;
  const dockId = typeof raw.dockId === 'number' && Number.isFinite(raw.dockId)
    ? Math.max(1, Math.floor(raw.dockId))
    : null;
  const nullableTime = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : null;
  const positiveUnits = (value: unknown): number => Math.max(0, asFiniteNumber(value, 0));

  if (raw.kind === 'supplier-delivery') {
    const orderedUnits = positiveUnits(raw.orderedUnits);
    if (orderedUnits <= 0) return null;
    const arrivedUnits = clamp(positiveUnits(raw.arrivedUnits), 0, orderedUnits);
    const unloadedUnits = clamp(positiveUnits(raw.unloadedUnits), 0, arrivedUnits);
    const normalizedStatus = status === 'complete' && unloadedUnits < orderedUnits
      ? (unloadedUnits > 0 ? 'unloading' : arrivedUnits > 0 ? 'arrived' : 'ordered')
      : status;
    const operation: SupplierDelivery = {
      id,
      kind: 'supplier-delivery',
      status: normalizedStatus,
      stockKind,
      orderedUnits,
      arrivedUnits,
      unloadedUnits,
      landedUnitCost: Math.max(0, asFiniteNumber(raw.landedUnitCost, 0)),
      orderedAt: Math.max(0, asFiniteNumber(raw.orderedAt, 0)),
      arrivedAt: nullableTime(raw.arrivedAt),
      completedAt: nullableTime(raw.completedAt),
      blockedReason: typeof raw.blockedReason === 'string' ? raw.blockedReason.slice(0, 160) : null,
      dockId,
      purchaseRecorded: raw.purchaseRecorded === true
    };
    return validatePodFreightOperation(operation) === null ? operation : null;
  }

  if (raw.kind !== 'courier-handling') return null;
  const direction = isOneOf(raw.direction, POD_FREIGHT_DIRECTIONS) ? raw.direction : null;
  const consignedUnits = positiveUnits(raw.consignedUnits);
  if (!direction || consignedUnits <= 0) return null;
  const completedUnits = clamp(positiveUnits(raw.completedUnits), 0, consignedUnits);
  const settledUnits = clamp(positiveUnits(raw.settledUnits), 0, completedUnits);
  const normalizedStatus = status === 'complete' && completedUnits < consignedUnits
    ? (completedUnits > 0 ? 'partial' : 'arrived')
    : status;
  const operation: CourierHandling = {
    id,
    kind: 'courier-handling',
    status: normalizedStatus,
    stockKind,
    direction,
    consignedUnits,
    completedUnits,
    settledUnits,
    handlingFeePerUnit: Math.max(0, asFiniteNumber(raw.handlingFeePerUnit, 0)),
    arrivedAt: Math.max(0, asFiniteNumber(raw.arrivedAt, 0)),
    completedAt: nullableTime(raw.completedAt),
    blockedReason: typeof raw.blockedReason === 'string' ? raw.blockedReason.slice(0, 160) : null,
    dockId
  };
  return validatePodFreightOperation(operation) === null ? operation : null;
}

function normalizeOpeningEconomyState(raw: unknown, warnings: string[]): NonNullable<StationState['openingEconomy']> {
  const fallback = {
    ledger: createEconomyLedger(),
    podDemand: createPodDemandLog(),
    marketPricingPolicy: 'standard' as MarketPricingPolicy,
    podFreightOperations: [] as PodFreightOperation[],
    capitalProjects: createCapitalProjectsState()
  };
  if (!isRecord(raw)) return fallback;

  const ledgerRecord = isRecord(raw.ledger) ? raw.ledger : undefined;
  const rawRecent = Array.isArray(ledgerRecord?.recent) ? ledgerRecord.recent : undefined;
  const ledgerRaw = ledgerRecord
    ? {
        ...ledgerRecord,
        recent: rawRecent?.slice(-DEFAULT_ECONOMY_RECENT_LIMIT)
      } as Partial<EconomyLedger>
    : undefined;
  const ledger = normalizeEconomyLedger(ledgerRaw);
  if (rawRecent && rawRecent.length > DEFAULT_ECONOMY_RECENT_LIMIT) {
    warnings.push(`openingEconomy.ledger.recent exceeded ${DEFAULT_ECONOMY_RECENT_LIMIT}; trimmed.`);
  }
  const marketPricingPolicy = isOneOf(raw.marketPricingPolicy, MARKET_PRICING_POLICIES)
    ? raw.marketPricingPolicy
    : 'standard';
  const podFreightOperations: PodFreightOperation[] = [];
  const seenOperationIds = new Set<string>();
  let invalidOperationCount = 0;
  if (Array.isArray(raw.podFreightOperations)) {
    for (const entry of raw.podFreightOperations.slice(0, MAX_POD_FREIGHT_OPERATIONS)) {
      const operation = normalizePodFreightOperation(entry);
      if (!operation || seenOperationIds.has(operation.id)) {
        invalidOperationCount++;
        continue;
      }
      seenOperationIds.add(operation.id);
      podFreightOperations.push(operation);
    }
    if (raw.podFreightOperations.length > MAX_POD_FREIGHT_OPERATIONS) {
      warnings.push(`openingEconomy.podFreightOperations exceeded ${MAX_POD_FREIGHT_OPERATIONS}; trimmed.`);
    }
  }
  if (invalidOperationCount > 0) {
    warnings.push(`openingEconomy.podFreightOperations skipped ${invalidOperationCount} invalid or duplicate operation(s).`);
  }
  return {
    ledger,
    podDemand: normalizePodDemandLog(raw.podDemand as Parameters<typeof normalizePodDemandLog>[0]),
    marketPricingPolicy,
    podFreightOperations,
    capitalProjects: hydrateCapitalProjectsState(raw.capitalProjects)
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && allowed.includes(value as T);
}

function cloneSmallCraftVisit(visit: SmallCraftVisit | undefined): SmallCraftVisit | undefined {
  return visit
    ? {
        ...visit,
        services: visit.services.map((service) => ({ ...service })),
        servedDemand: {
          food: Math.max(0, Math.floor(visit.servedDemand?.food ?? 0)),
          supplies: Math.max(0, Math.floor(visit.servedDemand?.supplies ?? 0)),
          shipService: Math.max(0, Math.floor(visit.servedDemand?.shipService ?? 0))
        },
        earnedCredits: Math.max(0, visit.earnedCredits ?? 0)
      }
    : undefined;
}

function normalizeApproachCommitment(value: unknown): ArrivingShip['approachCommitment'] {
  if (!isRecord(value) || typeof value.slotId !== 'string' || value.slotId.length === 0) return null;
  if ((value.phase !== 'approach' && value.phase !== 'depart') || (value.status !== 'waiting' && value.status !== 'active')) return null;
  const groupIds = Array.isArray(value.groupIds)
    ? [...new Set(value.groupIds.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0).map((entry) => entry.slice(0, 160)))].sort()
    : [];
  return {
    slotId: value.slotId.slice(0, 160),
    groupIds,
    phase: value.phase,
    status: value.status,
    queuedAt: Math.max(0, asFiniteNumber(value.queuedAt, 0))
  };
}

function normalizeSmallCraftVisit(value: unknown): SmallCraftVisit | undefined {
  if (!isRecord(value) || typeof value.dockSourceKey !== 'string' || !Array.isArray(value.services)) return undefined;
  const services: SmallCraftService[] = [];
  for (const raw of value.services.slice(0, 2)) {
    if (!isRecord(raw) || !isOneOf(raw.kind, SMALL_CRAFT_SERVICE_KINDS)) continue;
    const freightDirection = raw.freightDirection === 'import' || raw.freightDirection === 'export'
      ? raw.freightDirection
      : undefined;
    services.push({
      kind: raw.kind,
      status: isOneOf(raw.status, SMALL_CRAFT_SERVICE_STATUSES) ? raw.status : 'pending',
      progress: clamp(asFiniteNumber(raw.progress, 0), 0, 1),
      durationSec: Math.max(1, asFiniteNumber(raw.durationSec, 20)),
      elapsedSec: Math.max(0, asFiniteNumber(raw.elapsedSec, 0)),
      blockedReason: typeof raw.blockedReason === 'string' ? raw.blockedReason : null,
      creditsEarned: Math.max(0, asFiniteNumber(raw.creditsEarned, 0)),
      ratingDelta: Math.max(0, asFiniteNumber(raw.ratingDelta, 0)),
      transferredUnits: Math.max(0, asFiniteNumber(raw.transferredUnits, 0)),
      freightDirection
    });
  }
  if (services.length === 0) return undefined;
  return {
    dockSourceKey: value.dockSourceKey,
    startedAt: Math.max(0, asFiniteNumber(value.startedAt, 0)),
    patienceExpiresAt: Math.max(0, asFiniteNumber(value.patienceExpiresAt, 0)),
    services,
    // Gate 0 saves predate visit-local accounting. A missing record is a
    // truthful zero rather than a reason to discard an otherwise live call.
    servedDemand: {
      food: Math.max(0, Math.floor(asFiniteNumber(isRecord(value.servedDemand) ? value.servedDemand.food : undefined, 0))),
      supplies: Math.max(0, Math.floor(asFiniteNumber(isRecord(value.servedDemand) ? value.servedDemand.supplies : undefined, 0))),
      shipService: Math.max(0, Math.floor(asFiniteNumber(isRecord(value.servedDemand) ? value.servedDemand.shipService : undefined, 0)))
    },
    earnedCredits: Math.max(0, asFiniteNumber(value.earnedCredits, 0))
  };
}

function normalizeTrafficOffer(value: unknown): TrafficOffer | null {
  if (!isRecord(value) || typeof value.id !== 'number' || !Number.isFinite(value.id) || !isOneOf(value.shipType, SHIP_TYPES) || !isOneOf(value.size, SHIP_SIZES)) {
    return null;
  }
  if (!isOneOf(value.status, ['forecast', 'holding', 'cleared'] as const) || !isOneOf(value.lane, SPACE_LANES)) return null;
  const manifestRecord = isRecord(value.manifestDemand) ? value.manifestDemand : {};
  const mixRecord = isRecord(value.manifestMix) ? value.manifestMix : {};
  const hospitalityRecord = isRecord(value.hospitalityDemand) ? value.hospitalityDemand : null;
  const inboundRecord = isRecord(value.inboundCargo) ? value.inboundCargo : {};
  const outboundRecord = isRecord(value.outboundRequest) ? value.outboundRequest : {};
  const nonNegative = (raw: unknown) => Math.max(0, asFiniteNumber(raw, 0));
  const forecastAt = Math.max(0, asFiniteNumber(value.forecastAt, 0));
  const arrivesAt = Math.max(forecastAt, asFiniteNumber(value.arrivesAt, forecastAt));
  const expiresAt = Math.max(arrivesAt, asFiniteNumber(value.expiresAt, arrivesAt + 1));
  const requestedServices = Array.isArray(value.requestedServices)
    ? [...new Set(value.requestedServices.filter((tag): tag is ShipServiceTag => isOneOf(tag, SHIP_SERVICE_TAGS)))]
    : [];
  return {
    id: Math.max(1, Math.floor(asFiniteNumber(value.id, 1))),
    callsign: typeof value.callsign === 'string' ? value.callsign.slice(0, 80) : 'Unknown vessel',
    shipName: typeof value.shipName === 'string' ? value.shipName.slice(0, 80) : 'Unknown ship',
    lane: value.lane,
    shipType: value.shipType,
    hullVariant: isCompatibleShipHullVariant(value.hullVariant, value.shipType, value.size)
      ? value.hullVariant
      : selectShipHullVariant(value.id, value.shipType, value.size),
    offerKind: isOneOf(value.offerKind, PORT_OFFER_KINDS) ? value.offerKind : undefined,
    size: value.size,
    status: value.status,
    forecastAt,
    arrivesAt,
    expiresAt,
    passengersTotal: Math.max(0, Math.floor(nonNegative(value.passengersTotal))),
    manifestDemand: {
      cafeteria: nonNegative(manifestRecord.cafeteria),
      market: nonNegative(manifestRecord.market),
      lounge: nonNegative(manifestRecord.lounge)
    },
    manifestMix: {
      diner: nonNegative(mixRecord.diner),
      shopper: nonNegative(mixRecord.shopper),
      lounger: nonNegative(mixRecord.lounger),
      rusher: nonNegative(mixRecord.rusher)
    },
    hospitalityDemand: hospitalityRecord ? {
      meal: nonNegative(hospitalityRecord.meal),
      drink: nonNegative(hospitalityRecord.drink),
      leisure: nonNegative(hospitalityRecord.leisure),
      restroom: nonNegative(hospitalityRecord.restroom),
      hygiene: nonNegative(hospitalityRecord.hygiene),
      comfort: nonNegative(hospitalityRecord.comfort)
    } : undefined,
    inboundCargo: {
      rawMaterial: nonNegative(inboundRecord.rawMaterial),
      rawMeal: nonNegative(inboundRecord.rawMeal),
      tradeGood: nonNegative(inboundRecord.tradeGood)
    },
    outboundRequest: {
      rawMaterial: nonNegative(outboundRecord.rawMaterial),
      meal: nonNegative(outboundRecord.meal),
      tradeGood: nonNegative(outboundRecord.tradeGood)
    },
    fuelSupply: nonNegative(value.fuelSupply),
    fuelRequest: nonNegative(value.fuelRequest),
    fuelProcurementCostCredits: nonNegative(value.fuelProcurementCostCredits),
    procurementKind: value.procurementKind === 'food-supply' ? 'food-supply' : undefined,
    stationProcurementCostCredits: nonNegative(value.stationProcurementCostCredits),
    requestedServices,
    berthTimeSec: Math.max(1, Math.floor(nonNegative(value.berthTimeSec))),
    dockingFee: Math.round(nonNegative(value.dockingFee)),
    projectedSpend: Math.round(nonNegative(value.projectedSpend)),
    riskLabel: value.riskLabel === 'guarded' || value.riskLabel === 'high' ? value.riskLabel : 'low',
    assignedBerthAnchor: typeof value.assignedBerthAnchor === 'number' && Number.isFinite(value.assignedBerthAnchor)
      ? Math.max(0, Math.floor(value.assignedBerthAnchor))
      : null,
    assignedDockSourceKey: typeof value.assignedDockSourceKey === 'string' && value.assignedDockSourceKey.length > 0
      ? value.assignedDockSourceKey.slice(0, 160)
      : null,
    holdUsed: value.holdUsed === true
  };
}

function normalizeVisitorNeeds(value: unknown): VisitorNeeds | undefined {
  if (!isRecord(value)) return undefined;
  const active = value.active === 'hunger' || value.active === 'energy' || value.active === 'hygiene' || value.active === 'leisure'
    ? value.active
    : null;
  return {
    hunger: clamp(asFiniteNumber(value.hunger, 80), 0, 100),
    energy: clamp(asFiniteNumber(value.energy, 80), 0, 100),
    hygiene: clamp(asFiniteNumber(value.hygiene, 80), 0, 100),
    leisure: clamp(asFiniteNumber(value.leisure, 75), 0, 100),
    active,
    unmetSince: typeof value.unmetSince === 'number' && Number.isFinite(value.unmetSince) ? Math.max(0, value.unmetSince) : null,
    completions: Math.max(0, Math.floor(asFiniteNumber(value.completions, 0)))
  };
}

function normalizeSavedVisitor(value: unknown, tileCount: number): Visitor | null {
  if (!isRecord(value) || !Number.isFinite(value.id) || !Number.isFinite(value.tileIndex) || !isOneOf(value.state, Object.values(VisitorState))) {
    return null;
  }
  const visitor = value as unknown as Visitor;
  const stayClass = isOneOf(value.stayClass, VISIT_STAY_CLASSES) ? value.stayClass : 'errand';
  const needs = normalizeVisitorNeeds(value.needs);
  const serviceFailureStage = isOneOf(value.serviceFailureStage, VISITOR_FAILURE_STAGES)
    ? value.serviceFailureStage
    : 'none';
  const failureNeed = value.failureNeed === 'hunger' || value.failureNeed === 'energy' || value.failureNeed === 'hygiene' || value.failureNeed === 'leisure'
    ? value.failureNeed
    : null;
  const strandedFromShipId = typeof value.strandedFromShipId === 'number' && Number.isFinite(value.strandedFromShipId)
    ? Math.max(1, Math.floor(value.strandedFromShipId))
    : null;
  const transferPhase = isOneOf(value.transferPhase, PASSENGER_TRANSFER_PHASES)
    ? value.transferPhase
    : 'station';
  const transferSlotKey = transferPhase !== 'station' && typeof value.transferSlotKey === 'string' && value.transferSlotKey.length > 0
    ? value.transferSlotKey.slice(0, 200)
    : null;
  const transferQueuedAt = transferPhase !== 'station' && typeof value.transferQueuedAt === 'number' && Number.isFinite(value.transferQueuedAt)
    ? Math.max(0, value.transferQueuedAt)
    : null;
  const transferCrossingStartedAt =
    (transferPhase === 'disembark-crossing' || transferPhase === 'boarding-crossing') &&
    typeof value.transferCrossingStartedAt === 'number' &&
    Number.isFinite(value.transferCrossingStartedAt)
      ? Math.max(0, value.transferCrossingStartedAt)
      : null;
  const hadTransientFacilityClaim =
    (typeof value.marketTradeGoodSourceTile === 'number' && Number.isFinite(value.marketTradeGoodSourceTile)) ||
    (typeof value.temporarySleepTargetTile === 'number' && Number.isFinite(value.temporarySleepTargetTile));
  return {
    ...visitor,
    id: Math.floor(visitor.id),
    tileIndex: clamp(Math.floor(visitor.tileIndex), 0, Math.max(0, tileCount - 1)),
    state: hadTransientFacilityClaim ? VisitorState.ToLeisure : visitor.state,
    path: [],
    movementWaitReason: undefined,
    movementBlockedTile: undefined,
    reservedServingTile: null,
    reservedTargetTile: null,
    serveTimer: undefined,
    nextPathRetryAt: undefined,
    marketTradeGoodSourceTile: null,
    temporarySleepTargetTile: null,
    queueProviderTile: typeof value.queueProviderTile === 'number' && Number.isFinite(value.queueProviderTile)
      ? clamp(Math.floor(value.queueProviderTile), 0, Math.max(0, tileCount - 1))
      : null,
    queueJoinedAt: typeof value.queueJoinedAt === 'number' && Number.isFinite(value.queueJoinedAt)
      ? Math.max(0, value.queueJoinedAt)
      : null,
    transferPhase,
    transferSlotKey,
    transferQueuedAt,
    transferQueueTile: null,
    transferAccessTile: null,
    transferStationTile: null,
    transferCrossingStartedAt,
    transferBlockedTile: null,
    stayClass,
    needs: stayClass === 'contract' || stayClass === 'extended' ? needs : undefined,
    recurringNeedActive: needs?.active ?? null,
    serviceFailureStage,
    failureSince: typeof value.failureSince === 'number' && Number.isFinite(value.failureSince) ? Math.max(0, value.failureSince) : null,
    failureNeed,
    strandedFromShipId,
    strandedAt: strandedFromShipId !== null && typeof value.strandedAt === 'number' && Number.isFinite(value.strandedAt)
      ? Math.max(0, value.strandedAt)
      : null,
    reliefEligibleAt: strandedFromShipId !== null && typeof value.reliefEligibleAt === 'number' && Number.isFinite(value.reliefEligibleAt)
      ? Math.max(0, value.reliefEligibleAt)
      : null
  };
}

function defaultHousingPolicyForRoom(room: RoomType): HousingPolicy {
  return room === RoomType.Dorm || room === RoomType.Hygiene ? 'crew' : 'visitor';
}

function isHousingAllowedForRoom(room: RoomType, policy: HousingPolicy): boolean {
  if (room === RoomType.Dorm || room === RoomType.Hygiene) return true;
  return policy === 'visitor';
}

function normalizeGridEnumArray<T extends string>(
  value: unknown,
  expectedLength: number,
  allowed: readonly T[],
  fallbackValue: T,
  warnings: string[],
  label: string
): T[] {
  const out = new Array<T>(expectedLength).fill(fallbackValue);
  if (!Array.isArray(value)) {
    warnings.push(`${label} missing; defaulted.`);
    return out;
  }
  const len = Math.min(expectedLength, value.length);
  for (let i = 0; i < len; i++) {
    const v = value[i];
    if (isOneOf(v, allowed)) {
      out[i] = v;
    } else {
      warnings.push(`${label}[${i}] invalid; defaulted.`);
    }
  }
  if (value.length !== expectedLength) {
    warnings.push(`${label} length ${value.length} does not match expected ${expectedLength}; adjusted.`);
  }
  return out;
}

function maxUnlockTier(a: UnlockTier, b: UnlockTier): UnlockTier {
  return (a >= b ? a : b) as UnlockTier;
}

function normalizeUnlockTier(value: number): UnlockTier {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(6, Math.floor(value))) as UnlockTier;
}

function requiredUnlockTierForSnapshotContent(
  rooms: RoomType[],
  modules: StationSnapshotV1['modules'],
  dockConfigs: StationSnapshotV1['dockConfigs']
): UnlockTier {
  // Walks saved content to derive the MIN tier that could have produced
  // it, used to elevate a demoted/hand-edited save. Early-outs at tier 6
  // (the ceiling) so content lands at T4-T6 don't silently cap at 3.
  let required: UnlockTier = 0;
  for (const room of rooms) {
    required = maxUnlockTier(required, ROOM_UNLOCK_TIER[room] ?? 0);
    if (required === 6) break;
  }
  if (required < 6) {
    for (const module of modules) {
      required = maxUnlockTier(required, MODULE_UNLOCK_TIER[module.type] ?? 0);
      if (required === 6) break;
    }
  }
  if (required < 6) {
    for (const dock of dockConfigs) {
      for (const shipType of dock.allowedShipTypes) {
        const shipTier: UnlockTier = shipType === 'industrial' ? 2 : shipType === 'military' || shipType === 'colonist' ? 3 : 0;
        required = maxUnlockTier(required, shipTier);
        if (required === 6) break;
      }
      if (required === 6) break;
    }
  }
  return required;
}

export function captureSnapshot(state: StationState): StationSnapshotV1 {
  const roleCounts =
    state.crew.roleCounts && totalStaffCount(state.crew.roleCounts) === state.crew.total
      ? ({ ...state.crew.roleCounts } as Partial<Record<StaffRole, number>>)
      : (() => {
          const counts = createEmptyStaffRoleCounts();
          const total = Math.max(0, Math.floor(state.crew.total));
          if (total > 0) {
            counts.captain = 1;
            counts.assistant = Math.max(0, total - 1);
          }
          return counts as Partial<Record<StaffRole, number>>;
        })();
  const inventoryByTile: StationSnapshotV1['inventoryByTile'] = [];
  for (const node of state.itemNodes) {
    const items: Partial<Record<ItemType, number>> = {};
    let hasAny = false;
    for (const itemType of ITEM_TYPES) {
      const amount = node.items[itemType] ?? 0;
      if (amount > 0.0001) {
        items[itemType] = amount;
        hasAny = true;
      }
    }
    if (hasAny) {
      inventoryByTile.push({
        tileIndex: node.tileIndex,
        items
      });
    }
  }

  return {
    simTime: state.now,
    width: state.width,
    height: state.height,
    mapWorldOriginX: state.mapWorldOriginX,
    mapWorldOriginY: state.mapWorldOriginY,
    tiles: state.tiles.slice(),
    zones: state.zones.slice(),
    rooms: state.rooms.slice(),
    roomHousingPolicies: state.roomHousingPolicies.slice(),
    modules: state.moduleInstances
      .map((module) => ({
        type: module.type,
        originTile: module.originTile,
        rotation: module.rotation,
        purchaseCost: module.purchaseCost
      }))
      .sort((a, b) => a.originTile - b.originTile || a.type.localeCompare(b.type)),
    commercialUnits: state.commercialUnits.map((unit) => ({
      ...unit,
      tiles: [...unit.tiles],
      offers: unit.offers.map((offer) => ({
        ...offer,
        fixtures: offer.fixtures.map((fixture) => ({ ...fixture }))
      })),
      selectedOffer: unit.selectedOffer
        ? {
            ...unit.selectedOffer,
            fixtures: unit.selectedOffer.fixtures.map((fixture) => ({ ...fixture }))
          }
        : null,
      fittedModuleIds: [...unit.fittedModuleIds],
      presentCustomerIds: [...unit.presentCustomerIds],
      tenantStaffTiles: [...unit.tenantStaffTiles]
    })),
    constructionSites: state.constructionSites
      .filter((site) => site.state !== 'done' || site.structuralProjectId !== undefined)
      .map((site) => ({
        id: site.id,
        kind: site.kind,
        tileIndex: site.tileIndex,
        targetTile: site.targetTile,
        targetModule: site.targetModule,
        rotation: site.rotation,
        requiredMaterials: site.requiredMaterials,
        deliveredMaterials: site.deliveredMaterials,
        buildProgress: site.buildProgress,
        buildWorkRequired: site.buildWorkRequired,
        requiresEva: site.requiresEva,
        state: site.state,
        structuralProjectId: site.structuralProjectId,
        structuralStage: site.structuralStage
      }))
      .sort((a, b) => a.tileIndex - b.tileIndex),
    structuralExpansionProjects: state.structuralExpansionProjects.map((project) => ({
      ...project,
      bounds: { ...project.bounds },
      targets: project.targets.map((target) => ({ ...target })),
      childSiteIds: [...project.childSiteIds],
      completedSiteIds: [...project.completedSiteIds]
    })),
    mapExpansion: {
      purchased: { ...state.mapExpansion.purchased },
      purchasesMade: state.mapExpansion.purchasesMade
    },
    dockConfigs: state.docks
      .map((dock) => ({
        anchorTile: dock.anchorTile,
        sourceKey: dock.sourceKey,
        purpose: dock.purpose,
        facing: dock.facing,
        allowedShipTypes: [...dock.allowedShipTypes],
        allowedShipSizes: [...dock.allowedShipSizes]
      }))
      .sort((a, b) => a.anchorTile - b.anchorTile),
    berthConfigs: state.berthConfigs
      .map((cfg) => ({
        anchorTile: cfg.anchorTile,
        allowedShipTypes: [...cfg.allowedShipTypes],
        allowedShipSizes: [...cfg.allowedShipSizes],
        screeningLevel: cfg.screeningLevel ?? 'standard',
        customsPolicy: cfg.customsPolicy ?? 'routine',
        serviceScore: cfg.serviceScore ?? 50,
        serviceVisits: cfg.serviceVisits ?? 0,
        serviceLastDelta: cfg.serviceLastDelta ?? 0
      }))
      .sort((a, b) => a.anchorTile - b.anchorTile),
    resources: {
      credits: state.metrics.credits,
      waterStock: state.metrics.waterStock,
      airQuality: state.metrics.airQuality,
      legacyMaterialStock: state.legacyMaterialStock
    },
    crew: {
      total: state.crew.total,
      roleCounts,
      members: state.crewMembers.map((crew) => ({
        id: crew.id,
        name: crew.name,
        tileIndex: crew.tileIndex,
        staffRole: crew.staffRole,
        shiftBucket: crew.shiftBucket,
        recalledUntil: crew.recalledUntil,
        homeWorkplaceTile: crew.homeWorkplaceTile,
        assignedSleepTile: crew.assignedSleepTile,
        energy: crew.energy,
        hunger: crew.hunger,
        hygiene: crew.hygiene,
        bladder: crew.bladder,
        thirst: crew.thirst,
        morale: crew.morale,
        missedPayrollCycles: crew.missedPayrollCycles,
        needsStrainSec: crew.needsStrainSec,
        resignationNoticeAt: crew.resignationNoticeAt,
        airExposureSec: crew.airExposureSec,
        healthState: crew.healthState,
        blockedTicks: crew.blockedTicks,
        movementReplanCooldownUntil: crew.movementReplanCooldownUntil,
        activeJobId: crew.activeJobId,
        carryingItemType: crew.carryingItemType,
        carryingAmount: crew.carryingAmount
      }))
    },
    residents: state.residents.map(({ movementWaitReason: _movementWaitReason, ...resident }) => ({
      ...resident,
      path: [...resident.path],
      roleAffinity: { ...resident.roleAffinity },
      lastRouteExposure: resident.lastRouteExposure ? { ...resident.lastRouteExposure } : undefined
    })),
    visitors: state.visitors.map(({
      movementWaitReason: _movementWaitReason,
      movementBlockedTile: _movementBlockedTile,
      transferQueueTile: _transferQueueTile,
      transferAccessTile: _transferAccessTile,
      transferStationTile: _transferStationTile,
      transferBlockedTile: _transferBlockedTile,
      ...visitor
    }) => ({
      ...visitor,
      path: [...visitor.path],
      needs: visitor.needs ? { ...visitor.needs } : undefined,
      lastRouteExposure: visitor.lastRouteExposure ? { ...visitor.lastRouteExposure } : undefined
    })),
    command: {
      selectedSpecialty: state.command.selectedSpecialty,
      completedSpecialties: [...state.command.completedSpecialties],
      specialtyProgress: { ...state.command.specialtyProgress },
      officers: { ...state.command.officers }
    },
    inventoryByTile,
    transportJobs: state.jobs
      .filter((job) =>
        (job.type === 'pickup' || job.type === 'deliver') &&
        (job.state === 'pending' || job.state === 'assigned' || job.state === 'in_progress')
      )
      .map((job) => ({
        id: job.id,
        type: job.type,
        itemType: job.itemType,
        amount: job.amount,
        fromTile: job.fromTile,
        toTile: job.toTile,
        assignedCrewId: job.assignedCrewId,
        createdAt: job.createdAt,
        expiresAt: job.expiresAt,
        state: job.state,
        pickedUpAmount: job.pickedUpAmount,
        completedAt: job.completedAt,
        lastProgressAt: job.lastProgressAt,
        stallReason: job.stallReason,
        stalledSince: job.stalledSince,
        blockedReason: job.blockedReason,
        portShipId: job.portShipId,
        portCargoLotId: job.portCargoLotId,
        portCargoDirection: job.portCargoDirection,
        portFuelNodeTile: job.portFuelNodeTile
      }))
      .sort((a, b) => a.id - b.id),
    controls: {
      shipsPerCycle: state.controls.shipsPerCycle,
      taxRate: state.controls.taxRate,
      portAutoAdmitEnabled: state.controls.portAutoAdmitEnabled,
      portAutoAdmitPolicy: state.controls.portAutoAdmitPolicy,
      crewAutoStaffEnabled: state.controls.crewAutoStaffEnabled,
      materialAutoImportEnabled: state.controls.materialAutoImportEnabled,
      materialTargetStock: state.controls.materialTargetStock,
      materialImportBatchSize: state.controls.materialImportBatchSize,
      securityPosture: state.controls.securityPosture,
      crewShiftTargets: { ...state.controls.crewShiftTargets },
      crewWatchTargets: state.controls.crewWatchTargets.map((targets) => ({ ...targets })) as [
        CrewShiftTargets,
        CrewShiftTargets,
        CrewShiftTargets
      ],
      emergencyRecallUntil: state.controls.emergencyRecallUntil
    },
    unlocks: {
      tier: state.unlocks.tier,
      unlockedIds: [...state.unlocks.unlockedIds],
      unlockedAtSec: { ...state.unlocks.unlockedAtSec }
    },
    progression: {
      mealsServedTotal: state.metrics.mealsServedTotal,
      creditsEarnedLifetime: state.metrics.creditsEarnedLifetime,
      turnaroundsCompletedLifetime: state.metrics.turnaroundsCompletedLifetime,
      tradeCyclesCompletedLifetime: state.metrics.tradeCyclesCompletedLifetime,
      incidentsResolvedLifetime: state.metrics.incidentsResolvedLifetime,
      actorsTreatedLifetime: state.metrics.actorsTreatedLifetime,
      residentsConvertedLifetime: state.metrics.residentsConvertedLifetime,
      dockedShipsCompleted: state.dockedShipsCompleted,
      archetypesEverSeen: { ...state.usageTotals.archetypesEverSeen },
      rating: {
        score: state.metrics.stationRating,
        delta: state.usageTotals.ratingDelta,
        penalties: {
          shipTimeout: state.usageTotals.ratingFromShipTimeout,
          shipSkip: state.usageTotals.ratingFromShipSkip,
          visitorFailure: state.usageTotals.ratingFromVisitorFailure,
          walkDissatisfaction: state.usageTotals.ratingFromWalkDissatisfaction,
          routeExposure: state.usageTotals.ratingFromRouteExposure,
          environment: state.usageTotals.ratingFromEnvironment,
          sanitation: state.usageTotals.ratingFromSanitation,
          residentDeparture: state.usageTotals.ratingFromResidentDeparture
        },
        failureReasons: { ...state.usageTotals.ratingFromVisitorFailureByReason },
        bonuses: { ...state.usageTotals.ratingFromVisitorSuccessByReason }
      }
    },
    sanitation: {
      dirtByTile: Array.from(state.dirtByTile, (value) => Math.round(clamp(value, 0, 100) * 10) / 10),
      dirtSourceByTile: Array.from(state.dirtSourceByTile)
    },
    thermal: {
      heatByTile: Array.from(state.heatByTile, (value) => Math.round(clamp(value, 0, 100) * 10) / 10),
      staleAirByTile: Array.from(state.staleAirByTile, (value) => Math.round(clamp(value, 0, 100) * 10) / 10)
    },
    utilityUnderlay: (() => {
      const utility = ensureUtilityUnderlay(state);
      const layers: Partial<Record<UtilityUnderlayKind, number[]>> = {};
      for (const kind of UTILITY_UNDERLAY_KINDS) {
        const layer = utility.layers[kind];
        let hasAny = false;
        for (let i = 0; i < layer.length; i++) {
          if (layer[i] > 0) {
            hasAny = true;
            break;
          }
        }
        if (hasAny) layers[kind] = Array.from(layer);
      }
      return { version: utility.version, layers };
    })(),
    plumbing: {
      version: state.plumbing.version,
      floodByTile: Array.from(state.plumbing.floodByTile, (value) => Math.round(clamp(value, 0, 100) * 10) / 10),
      leaks: state.plumbing.leaks.map((leak) => ({ ...leak })),
      nextLeakId: state.plumbing.nextLeakId
    },
    maintenance: {
      debts: state.maintenanceDebts
        .filter((entry) => entry.debt > 0.05)
        .map((entry) => ({
          key: entry.key,
          system: entry.system,
          domain: entry.domain,
          source: entry.source,
          anchorTile: entry.anchorTile,
          targetTile: entry.targetTile,
          room: entry.room,
          moduleId: entry.moduleId,
          exterior: entry.exterior,
          label: entry.label,
          effect: entry.effect,
          debt: Math.round(clamp(entry.debt, 0, 100) * 10) / 10,
          lastServicedAt: entry.lastServicedAt,
          lastImpactAt: entry.lastImpactAt,
          ignitionRiskSince: entry.ignitionRiskSince
        })),
      exteriorIntegrityTargets: state.exteriorIntegrityTargets.map((target) => ({ ...target }))
    },
    openingEconomy: normalizeOpeningEconomyState(state.openingEconomy, []),
    serviceLog: normalizeServiceLog(state.serviceLog),
    portOps: {
      ...state.portOps,
      contracts: state.portOps.contracts.map((contract) => ({
        ...contract,
        promises: contract.promises.map((promise) => ({ ...promise }))
      })),
      cargoLots: state.portOps.cargoLots.map((lot) => ({ ...lot })),
      settlements: state.portOps.settlements.map((settlement) => ({
        ...settlement,
        promises: settlement.promises.map((promise) => ({ ...promise })),
        notes: [...settlement.notes]
      }))
    },
    trafficOffers: state.trafficOffers.map((offer) => ({
      ...offer,
      manifestDemand: { ...offer.manifestDemand },
      manifestMix: { ...offer.manifestMix },
      hospitalityDemand: offer.hospitalityDemand ? { ...offer.hospitalityDemand } : undefined,
      inboundCargo: { ...offer.inboundCargo },
      outboundRequest: { ...offer.outboundRequest },
      requestedServices: [...offer.requestedServices]
    })),
    activePortShips: state.arrivingShips
      .filter((ship) => ship.kind === 'transient' && (ship.portContractId !== undefined || ship.smallCraftVisit !== undefined))
      .map((ship) => ({
        ...ship,
        bayTiles: [...ship.bayTiles],
        residentIds: [...ship.residentIds],
        manifestDemand: { ...ship.manifestDemand },
        manifestMix: { ...ship.manifestMix },
        portManifest: ship.portManifest ? {
          ...ship.portManifest,
          inboundCargo: { ...ship.portManifest.inboundCargo },
          outboundRequest: { ...ship.portManifest.outboundRequest }
        } : undefined,
        portTurnaround: ship.portTurnaround ? {
          ...ship.portTurnaround,
          outboundRequired: { ...ship.portTurnaround.outboundRequired },
          outboundLoaded: { ...ship.portTurnaround.outboundLoaded }
        } : undefined,
        smallCraftVisit: cloneSmallCraftVisit(ship.smallCraftVisit),
        approachCommitment: ship.approachCommitment
          ? { ...ship.approachCommitment, groupIds: [...ship.approachCommitment.groupIds] }
          : null
      })),
    // Chartered site profile, if any. undefined on un-chartered starts, and
    // JSON.stringify drops it so legacy save shape is unchanged.
    site: state.site ? { ...state.site, laneTrafficFactor: { ...state.site.laneTrafficFactor } } : undefined
  };
}

export function serializeSave(name: string, state: StationState, gameVersion: string): string {
  const payload: StationSaveEnvelopeV1 = {
    schemaVersion: SAVE_SCHEMA_VERSION,
    gameVersion,
    createdAt: new Date().toISOString(),
    name,
    snapshot: captureSnapshot(state)
  };
  return JSON.stringify(payload);
}

function normalizePortOps(raw: unknown, fallback: PortOpsState, warnings: string[]): PortOpsState {
  if (!isRecord(raw) || raw.version !== 1) {
    warnings.push('portOps missing or incompatible; reset to a fresh operating shift.');
    return {
      ...fallback,
      contracts: [],
      cargoLots: [],
      settlements: []
    };
  }

  const promisesFrom = (value: unknown) => {
    if (!Array.isArray(value)) return [];
    return value.flatMap((entry) => {
      if (!isRecord(entry) || !isOneOf(entry.kind, PORT_PROMISE_KINDS)) return [];
      const target = Math.max(0, asFiniteNumber(entry.target, 0));
      return [{
        kind: entry.kind,
        label: typeof entry.label === 'string' ? entry.label : entry.kind,
        target,
        completed: clamp(asFiniteNumber(entry.completed, 0), 0, target),
        payoutCredits: Math.max(0, asFiniteNumber(entry.payoutCredits, 0))
      }];
    });
  };

  const contracts: PortOpsState['contracts'] = [];
  if (Array.isArray(raw.contracts)) {
    for (const entry of raw.contracts) {
      if (
        !isRecord(entry) ||
        !isOneOf(entry.offerKind, PORT_OFFER_KINDS) ||
        !isOneOf(entry.status, PORT_CONTRACT_STATUSES)
      ) continue;
      contracts.push({
        id: Math.max(1, Math.floor(asFiniteNumber(entry.id, 1))),
        offerId: Math.max(1, Math.floor(asFiniteNumber(entry.offerId, 1))),
        shipId: Math.max(1, Math.floor(asFiniteNumber(entry.shipId, 1))),
        callsign: typeof entry.callsign === 'string' ? entry.callsign : 'Unknown vessel',
        offerKind: entry.offerKind,
        assignedBerthAnchor: Math.max(0, Math.floor(asFiniteNumber(entry.assignedBerthAnchor, 0))),
        acceptedAt: Math.max(0, asFiniteNumber(entry.acceptedAt, 0)),
        arrivesAt: Math.max(0, asFiniteNumber(entry.arrivesAt, 0)),
        boardingStartsAt: Math.max(0, asFiniteNumber(entry.boardingStartsAt, 0)),
        hardDepartureAt: Math.max(0, asFiniteNumber(entry.hardDepartureAt, 0)),
        status: entry.status,
        promises: promisesFrom(entry.promises),
        passengerSpendingCredits: Math.max(0, asFiniteNumber(entry.passengerSpendingCredits, 0)),
        procurementCostCredits: Math.max(0, asFiniteNumber(entry.procurementCostCredits, 0)),
        settlementId: typeof entry.settlementId === 'number' ? Math.max(1, Math.floor(entry.settlementId)) : null
      });
    }
  }

  const cargoLots: PortOpsState['cargoLots'] = [];
  if (Array.isArray(raw.cargoLots)) {
    for (const entry of raw.cargoLots) {
      if (
        !isRecord(entry) ||
        !isOneOf(entry.ownership, ['station', 'consigned', 'specialty-input'] as const) ||
        !isOneOf(entry.itemType, ITEM_TYPES) ||
        !isOneOf(entry.location, ['aboard', 'staging', 'storage', 'delivered', 'closed'] as const)
      ) continue;
      cargoLots.push({
        id: Math.max(1, Math.floor(asFiniteNumber(entry.id, 1))),
        contractId: Math.max(1, Math.floor(asFiniteNumber(entry.contractId, 1))),
        ownership: entry.ownership,
        itemType: entry.itemType,
        quantity: Math.max(0, asFiniteNumber(entry.quantity, 0)),
        reservedCapacity: clamp(
          asFiniteNumber(entry.reservedCapacity, asFiniteNumber(entry.quantity, 0)),
          0,
          Math.max(0, asFiniteNumber(entry.quantity, 0))
        ),
        handledQuantity: clamp(asFiniteNumber(entry.handledQuantity, 0), 0, Math.max(0, asFiniteNumber(entry.quantity, 0))),
        locationTile: typeof entry.locationTile === 'number' ? Math.max(0, Math.floor(entry.locationTile)) : null,
        location: entry.location
      });
    }
  }

  const settlements: PortOpsState['settlements'] = [];
  if (Array.isArray(raw.settlements)) {
    for (const entry of raw.settlements) {
      if (!isRecord(entry)) continue;
      settlements.push({
        id: Math.max(1, Math.floor(asFiniteNumber(entry.id, 1))),
        contractId: Math.max(1, Math.floor(asFiniteNumber(entry.contractId, 1))),
        shipId: Math.max(1, Math.floor(asFiniteNumber(entry.shipId, 1))),
        callsign: typeof entry.callsign === 'string' ? entry.callsign : 'Unknown vessel',
        settledAt: Math.max(0, asFiniteNumber(entry.settledAt, 0)),
        promises: promisesFrom(entry.promises),
        payoutCredits: Math.max(0, asFiniteNumber(entry.payoutCredits, 0)),
        passengerSpendingCredits: Math.max(0, asFiniteNumber(entry.passengerSpendingCredits, 0)),
        procurementCostCredits: Math.max(0, asFiniteNumber(entry.procurementCostCredits, 0)),
        notes: Array.isArray(entry.notes) ? entry.notes.filter((note): note is string => typeof note === 'string') : []
      });
    }
  }

  const telemetryRaw = isRecord(raw.telemetry) ? raw.telemetry : {};
  const maxContractId = contracts.reduce((max, entry) => Math.max(max, entry.id), 0);
  const maxCargoLotId = cargoLots.reduce((max, entry) => Math.max(max, entry.id), 0);
  const maxSettlementId = settlements.reduce((max, entry) => Math.max(max, entry.id), 0);
  return {
    version: 1,
    offerSequenceIndex: Math.max(0, Math.floor(asFiniteNumber(raw.offerSequenceIndex, 0))),
    nextContractId: Math.max(maxContractId + 1, Math.floor(asFiniteNumber(raw.nextContractId, 1))),
    nextCargoLotId: Math.max(maxCargoLotId + 1, Math.floor(asFiniteNumber(raw.nextCargoLotId, 1))),
    nextSettlementId: Math.max(maxSettlementId + 1, Math.floor(asFiniteNumber(raw.nextSettlementId, 1))),
    contracts,
    cargoLots,
    settlements,
    selectedSettlementId:
      typeof raw.selectedSettlementId === 'number' ? Math.max(1, Math.floor(raw.selectedSettlementId)) : null,
    firstOfferShownAt: typeof raw.firstOfferShownAt === 'number' ? Math.max(0, raw.firstOfferShownAt) : null,
    firstChoiceAt: typeof raw.firstChoiceAt === 'number' ? Math.max(0, raw.firstChoiceAt) : null,
    crewReassignments: Math.max(0, Math.floor(asFiniteNumber(raw.crewReassignments, 0))),
    cargoHandledLifetime: Math.max(0, asFiniteNumber(raw.cargoHandledLifetime, 0)),
    cargoArmLastHandled: Math.max(0, asFiniteNumber(raw.cargoArmLastHandled, 0)),
    cargoArmStrain: clamp(asFiniteNumber(raw.cargoArmStrain, 0), 0, 100),
    cargoArmStatus: isOneOf(raw.cargoArmStatus, ['ready', 'warning', 'fault'] as const)
      ? raw.cargoArmStatus
      : 'ready',
    cargoArmRepairProgress: clamp(asFiniteNumber(raw.cargoArmRepairProgress, 0), 0, 8),
    cargoArmFaults: Math.max(0, Math.floor(asFiniteNumber(raw.cargoArmFaults, 0))),
    cargoArmLastFaultRollAt: Math.max(0, asFiniteNumber(raw.cargoArmLastFaultRollAt, 0)),
    cargoArmFaultContractIds: Array.isArray(raw.cargoArmFaultContractIds)
      ? raw.cargoArmFaultContractIds
          .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
          .map((value) => Math.max(1, Math.floor(value)))
      : [],
    telemetry: {
      offersAccepted: Math.max(0, Math.floor(asFiniteNumber(telemetryRaw.offersAccepted, 0))),
      offersRefused: Math.max(0, Math.floor(asFiniteNumber(telemetryRaw.offersRefused, 0))),
      settlements: Math.max(0, Math.floor(asFiniteNumber(telemetryRaw.settlements, 0))),
      fullSettlements: Math.max(0, Math.floor(asFiniteNumber(telemetryRaw.fullSettlements, 0))),
      partialSettlements: Math.max(0, Math.floor(asFiniteNumber(telemetryRaw.partialSettlements, 0))),
      hardDeadlineDepartures: Math.max(0, Math.floor(asFiniteNumber(telemetryRaw.hardDeadlineDepartures, 0))),
      peakPassengerQueue: Math.max(0, Math.floor(asFiniteNumber(telemetryRaw.peakPassengerQueue, 0))),
      passengerQueuePersonSeconds: Math.max(0, asFiniteNumber(telemetryRaw.passengerQueuePersonSeconds, 0)),
      berthOccupancySeconds: Math.max(0, asFiniteNumber(telemetryRaw.berthOccupancySeconds, 0)),
      cargoUnitTileDistance: Math.max(0, asFiniteNumber(telemetryRaw.cargoUnitTileDistance, 0)),
      passengerTransferWaitSeconds: Math.max(0, asFiniteNumber(telemetryRaw.passengerTransferWaitSeconds, 0)),
      publicCargoConflictSeconds: Math.max(0, asFiniteNumber(telemetryRaw.publicCargoConflictSeconds, 0)),
      mealTarget: Math.max(0, asFiniteNumber(telemetryRaw.mealTarget, 0)),
      mealsCompleted: Math.max(0, asFiniteNumber(telemetryRaw.mealsCompleted, 0)),
      freightTarget: Math.max(0, asFiniteNumber(telemetryRaw.freightTarget, 0)),
      freightCompleted: Math.max(0, asFiniteNumber(telemetryRaw.freightCompleted, 0)),
      fuelPurchased: Math.max(0, asFiniteNumber(telemetryRaw.fuelPurchased, 0)),
      fuelSold: Math.max(0, asFiniteNumber(telemetryRaw.fuelSold, 0)),
      fuelTarget: Math.max(0, asFiniteNumber(telemetryRaw.fuelTarget, 0)),
      fuelCompleted: Math.max(0, asFiniteNumber(telemetryRaw.fuelCompleted, 0))
    }
  };
}

function normalizeCommercialOffer(raw: unknown, expectedLength: number): CommercialOffer | null {
  if (!isRecord(raw) || !isOneOf(raw.kind, COMMERCIAL_KINDS)) return null;
  const targetRoom = isOneOf(raw.targetRoom, [RoomType.Market, RoomType.Cantina, RoomType.Cafeteria] as const)
    ? raw.targetRoom
    : null;
  if (!targetRoom) return null;
  const fixtures: CommercialOffer['fixtures'] = [];
  if (Array.isArray(raw.fixtures)) {
    for (const entry of raw.fixtures) {
      if (!isRecord(entry) || !isOneOf(entry.module, Object.values(ModuleType)) || entry.module === ModuleType.None) continue;
      const originTile = Math.floor(asFiniteNumber(entry.originTile, -1));
      if (originTile < 0 || originTile >= expectedLength) continue;
      fixtures.push({
        module: entry.module,
        originTile,
        rotation: Math.round(asFiniteNumber(entry.rotation, 0)) === 90 ? 90 : 0
      });
    }
  }
  if (fixtures.length === 0) return null;
  return {
    id: Math.max(1, Math.floor(asFiniteNumber(raw.id, 1))),
    kind: raw.kind,
    tenantName: typeof raw.tenantName === 'string' ? raw.tenantName : 'Independent operator',
    brandName: typeof raw.brandName === 'string' ? raw.brandName : 'Unnamed business',
    concept: typeof raw.concept === 'string' ? raw.concept : 'Commercial tenant',
    targetRoom,
    fixtures,
    baseRentPerCycle: Math.max(0, asFiniteNumber(raw.baseRentPerCycle, 0)),
    revenueShare: clamp(asFiniteNumber(raw.revenueShare, 0.1), 0, 1),
    fitoutDurationSec: Math.max(1, asFiniteNumber(raw.fitoutDurationSec, 8)),
    expectedCustomersPerCycle: Math.max(0, asFiniteNumber(raw.expectedCustomersPerCycle, 0)),
    suppliedStaff: Math.max(0, Math.floor(asFiniteNumber(raw.suppliedStaff, 0))),
    stockPolicy: typeof raw.stockPolicy === 'string' ? raw.stockPolicy : 'Tenant supplied'
  };
}

function normalizeCommercialUnits(raw: unknown, expectedLength: number, warnings: string[]): CommercialUnit[] {
  if (!Array.isArray(raw)) return [];
  const units: CommercialUnit[] = [];
  for (const entry of raw) {
    if (!isRecord(entry) || !isOneOf(entry.phase, COMMERCIAL_PHASES)) continue;
    const tiles = Array.isArray(entry.tiles)
      ? entry.tiles
          .filter((tile): tile is number => typeof tile === 'number' && Number.isFinite(tile))
          .map((tile) => Math.floor(tile))
          .filter((tile) => tile >= 0 && tile < expectedLength)
      : [];
    if (tiles.length === 0) continue;
    const offers = Array.isArray(entry.offers)
      ? entry.offers.map((offer) => normalizeCommercialOffer(offer, expectedLength)).filter((offer): offer is CommercialOffer => !!offer)
      : [];
    const selectedOffer = normalizeCommercialOffer(entry.selectedOffer, expectedLength);
    units.push({
      id: Math.max(1, Math.floor(asFiniteNumber(entry.id, units.length + 1))),
      anchorTile: Math.min(...tiles),
      tiles: [...new Set(tiles)].sort((a, b) => a - b),
      phase: entry.phase,
      offers,
      previewOfferId: typeof entry.previewOfferId === 'number' ? Math.max(1, Math.floor(entry.previewOfferId)) : null,
      selectedOffer,
      fittedModuleIds: [],
      installedFixtureCount: Math.max(0, Math.floor(asFiniteNumber(entry.installedFixtureCount, 0))),
      createdAt: Math.max(0, asFiniteNumber(entry.createdAt, 0)),
      fitoutStartedAt: typeof entry.fitoutStartedAt === 'number' ? Math.max(0, entry.fitoutStartedAt) : null,
      fitoutCompleteAt: typeof entry.fitoutCompleteAt === 'number' ? Math.max(0, entry.fitoutCompleteAt) : null,
      nextFixtureAt: typeof entry.nextFixtureAt === 'number' ? Math.max(0, entry.nextFixtureAt) : null,
      nextRentAt: typeof entry.nextRentAt === 'number' ? Math.max(0, entry.nextRentAt) : null,
      nextRestockAt: typeof entry.nextRestockAt === 'number' ? Math.max(0, entry.nextRestockAt) : null,
      grossSalesAccrued: Math.max(0, asFiniteNumber(entry.grossSalesAccrued, 0)),
      rentCollected: Math.max(0, asFiniteNumber(entry.rentCollected, 0)),
      revenueShareCollected: Math.max(0, asFiniteNumber(entry.revenueShareCollected, 0)),
      customersServed: Math.max(0, Math.floor(asFiniteNumber(entry.customersServed, 0))),
      currentCustomers: 0,
      presentCustomerIds: [],
      tenantStaffTiles: Array.isArray(entry.tenantStaffTiles)
        ? entry.tenantStaffTiles.filter((tile): tile is number => typeof tile === 'number' && tile >= 0 && tile < expectedLength)
        : [],
      statusReason: typeof entry.statusReason === 'string' ? entry.statusReason : 'Loaded from save'
    });
  }
  if (units.length !== raw.length) warnings.push('Some invalid commercial units were skipped.');
  return units;
}

function normalizeSnapshot(snapshotRaw: Record<string, unknown>, warnings: string[]): StationSnapshotV1 | null {
  const defaultState = createInitialState();
  const simTime = Math.max(0, asFiniteNumber(snapshotRaw.simTime, 0));
  const width = Math.round(asFiniteNumber(snapshotRaw.width, defaultState.width));
  const height = Math.round(asFiniteNumber(snapshotRaw.height, defaultState.height));
  const mapWorldOriginX = Math.round(asFiniteNumber(snapshotRaw.mapWorldOriginX, 0));
  const mapWorldOriginY = Math.round(asFiniteNumber(snapshotRaw.mapWorldOriginY, 0));
  const expectedLength = width * height;
  const portOps = normalizePortOps(snapshotRaw.portOps, defaultState.portOps, warnings);
  if (!Array.isArray(snapshotRaw.tiles)) {
    return null;
  }

  const tiles = normalizeGridEnumArray(
    snapshotRaw.tiles,
    expectedLength,
    Object.values(TileType),
    TileType.Space,
    warnings,
    'tiles'
  );
  const zones = normalizeGridEnumArray(
    snapshotRaw.zones,
    expectedLength,
    Object.values(ZoneType),
    ZoneType.Public,
    warnings,
    'zones'
  );
  const rooms = normalizeGridEnumArray(
    snapshotRaw.rooms,
    expectedLength,
    Object.values(RoomType),
    RoomType.None,
    warnings,
    'rooms'
  );

  const roomHousingPolicies = new Array<HousingPolicy>(expectedLength).fill('visitor');
  if (Array.isArray(snapshotRaw.roomHousingPolicies)) {
    const len = Math.min(expectedLength, snapshotRaw.roomHousingPolicies.length);
    for (let i = 0; i < len; i++) {
      const room = rooms[i];
      const fallback = defaultHousingPolicyForRoom(room);
      const value = snapshotRaw.roomHousingPolicies[i];
      if (isOneOf(value, HOUSING_POLICIES) && isHousingAllowedForRoom(room, value)) {
        roomHousingPolicies[i] = value;
      } else {
        roomHousingPolicies[i] = fallback;
        warnings.push(`roomHousingPolicies[${i}] invalid for room ${room}; defaulted.`);
      }
    }
    if (snapshotRaw.roomHousingPolicies.length !== expectedLength) {
      warnings.push(
        `roomHousingPolicies length ${snapshotRaw.roomHousingPolicies.length} does not match expected ${expectedLength}; adjusted.`
      );
    }
  } else {
    for (let i = 0; i < expectedLength; i++) {
      roomHousingPolicies[i] = defaultHousingPolicyForRoom(rooms[i]);
    }
    warnings.push('roomHousingPolicies missing; defaulted from room types.');
  }

  const modules: StationSnapshotV1['modules'] = [];
  if (Array.isArray(snapshotRaw.modules)) {
    for (let i = 0; i < snapshotRaw.modules.length; i++) {
      const entry = snapshotRaw.modules[i];
      if (!isRecord(entry)) {
        warnings.push(`modules[${i}] invalid; skipped.`);
        continue;
      }
      const type = entry.type;
      const originTile = Math.floor(asFiniteNumber(entry.originTile, -1));
      const rawRotation = Math.round(asFiniteNumber(entry.rotation, 0));
      const purchaseCost = Number.isFinite(entry.purchaseCost)
        ? Math.max(0, Math.floor(entry.purchaseCost as number))
        : undefined;
      if (!isOneOf(type, Object.values(ModuleType)) || type === ModuleType.None) {
        warnings.push(`modules[${i}] has invalid type; skipped.`);
        continue;
      }
      if (originTile < 0 || originTile >= expectedLength) {
        warnings.push(`modules[${i}] has out-of-range originTile; skipped.`);
        continue;
      }
      const rotation: ModuleRotation = rawRotation === 90 ? 90 : 0;
      if (rawRotation !== 0 && rawRotation !== 90) {
        warnings.push(`modules[${i}] has unsupported rotation ${rawRotation}; defaulted to ${rotation}.`);
      }
      modules.push({ type, originTile, rotation, purchaseCost });
    }
  }

  const dockConfigs: StationSnapshotV1['dockConfigs'] = [];
  if (Array.isArray(snapshotRaw.dockConfigs)) {
    for (let i = 0; i < snapshotRaw.dockConfigs.length; i++) {
      const entry = snapshotRaw.dockConfigs[i];
      if (!isRecord(entry)) {
        warnings.push(`dockConfigs[${i}] invalid; skipped.`);
        continue;
      }
      const anchorTile = Math.floor(asFiniteNumber(entry.anchorTile, -1));
      if (anchorTile < 0 || anchorTile >= expectedLength) {
        warnings.push(`dockConfigs[${i}] has out-of-range anchorTile; skipped.`);
        continue;
      }
      const purpose: DockPurpose = isOneOf(entry.purpose, ['visitor', 'residential']) ? entry.purpose : 'visitor';
      const sourceKey = typeof entry.sourceKey === 'string' && entry.sourceKey.length > 0 ? entry.sourceKey : undefined;
      const facing: SpaceLane = isOneOf(entry.facing, SPACE_LANES) ? entry.facing : 'north';
      const allowedShipTypes = Array.isArray(entry.allowedShipTypes)
        ? entry.allowedShipTypes.filter((type): type is ShipType => isOneOf(type, SHIP_TYPES))
        : [];
      const allowedShipSizes = Array.isArray(entry.allowedShipSizes)
        ? entry.allowedShipSizes.filter((size): size is ShipSize => isOneOf(size, SHIP_SIZES))
        : [];
      dockConfigs.push({
        anchorTile,
        sourceKey,
        purpose,
        facing,
        allowedShipTypes: allowedShipTypes.length > 0 ? [...new Set(allowedShipTypes)] : ['tourist'],
        allowedShipSizes: allowedShipSizes.length > 0 ? [...new Set(allowedShipSizes)] : ['small']
      });
    }
  }

  const constructionSites: StationSnapshotV1['constructionSites'] = [];
  if (Array.isArray(snapshotRaw.constructionSites)) {
    for (let i = 0; i < snapshotRaw.constructionSites.length; i++) {
      const entry = snapshotRaw.constructionSites[i];
      if (!isRecord(entry)) {
        warnings.push(`constructionSites[${i}] invalid; skipped.`);
        continue;
      }
      const kind = entry.kind === 'module' ? 'module' : entry.kind === 'tile' ? 'tile' : null;
      const tileIndex = Math.floor(asFiniteNumber(entry.tileIndex, -1));
      if (!kind || tileIndex < 0 || tileIndex >= expectedLength) {
        warnings.push(`constructionSites[${i}] has invalid kind/tile; skipped.`);
        continue;
      }
      const targetTile = isOneOf(entry.targetTile, Object.values(TileType)) ? entry.targetTile : undefined;
      const targetModule = isOneOf(entry.targetModule, Object.values(ModuleType)) ? entry.targetModule : undefined;
      if (kind === 'tile' && targetTile === undefined) {
        warnings.push(`constructionSites[${i}] missing target tile; skipped.`);
        continue;
      }
      if (kind === 'module' && (targetModule === undefined || targetModule === ModuleType.None)) {
        warnings.push(`constructionSites[${i}] missing target module; skipped.`);
        continue;
      }
      const rawRotation = Math.round(asFiniteNumber(entry.rotation, 0));
      constructionSites.push({
        id: Math.max(1, Math.floor(asFiniteNumber(entry.id, 0))) || undefined,
        kind,
        tileIndex,
        targetTile,
        targetModule,
        rotation: rawRotation === 90 ? 90 : 0,
        requiredMaterials: Math.max(0, asFiniteNumber(entry.requiredMaterials, 0)),
        deliveredMaterials: Math.max(0, asFiniteNumber(entry.deliveredMaterials, 0)),
        buildProgress: Math.max(0, asFiniteNumber(entry.buildProgress, 0)),
        buildWorkRequired: Math.max(1, asFiniteNumber(entry.buildWorkRequired, 1)),
        requiresEva: entry.requiresEva === true,
        state: ['planned', 'delivering', 'building', 'blocked', 'done'].includes(String(entry.state))
          ? entry.state as NonNullable<StationSnapshotV1['constructionSites']>[number]['state']
          : undefined,
        structuralProjectId: Number.isFinite(entry.structuralProjectId)
          ? Math.max(1, Math.floor(asFiniteNumber(entry.structuralProjectId, 0)))
          : undefined,
        structuralStage: entry.structuralStage === 'perimeter' || entry.structuralStage === 'interior'
          ? entry.structuralStage
          : undefined
      });
    }
  }

  const structuralExpansionProjects: NonNullable<StationSnapshotV1['structuralExpansionProjects']> = [];
  if (Array.isArray(snapshotRaw.structuralExpansionProjects)) {
    for (let i = 0; i < snapshotRaw.structuralExpansionProjects.length; i++) {
      const entry = snapshotRaw.structuralExpansionProjects[i];
      if (!isRecord(entry)) {
        warnings.push(`structuralExpansionProjects[${i}] invalid; skipped.`);
        continue;
      }
      const id = Math.floor(asFiniteNumber(entry.id, 0));
      const bounds = isRecord(entry.bounds) ? entry.bounds : null;
      const phase = entry.phase;
      if (
        id <= 0 || !bounds ||
        !['perimeter', 'interior', 'blocked', 'commissioned', 'cancelled'].includes(String(phase)) ||
        !Array.isArray(entry.targets)
      ) {
        warnings.push(`structuralExpansionProjects[${i}] missing required shape; skipped.`);
        continue;
      }
      const targets = entry.targets.flatMap((target) => {
        if (!isRecord(target)) return [];
        const tileIndex = Math.floor(asFiniteNumber(target.tileIndex, -1));
        const targetTile = isOneOf(target.targetTile, Object.values(TileType)) ? target.targetTile : undefined;
        if (tileIndex < 0 || tileIndex >= expectedLength || targetTile === undefined) return [];
        return [{
          tileIndex,
          targetTile,
          requiredMaterials: Math.max(0, asFiniteNumber(target.requiredMaterials, 0))
        }];
      });
      if (targets.length <= 0) {
        warnings.push(`structuralExpansionProjects[${i}] has no valid targets; skipped.`);
        continue;
      }
      const ids = (value: unknown): number[] => Array.isArray(value)
        ? [...new Set(value.map((item) => Math.floor(asFiniteNumber(item, -1))).filter((item) => item > 0))]
        : [];
      structuralExpansionProjects.push({
        id,
        bounds: {
          minX: Math.floor(asFiniteNumber(bounds.minX, 0)),
          minY: Math.floor(asFiniteNumber(bounds.minY, 0)),
          maxX: Math.floor(asFiniteNumber(bounds.maxX, 0)),
          maxY: Math.floor(asFiniteNumber(bounds.maxY, 0))
        },
        doorTile: Number.isFinite(entry.doorTile) ? Math.floor(asFiniteNumber(entry.doorTile, -1)) : null,
        targets,
        phase: phase as NonNullable<StationSnapshotV1['structuralExpansionProjects']>[number]['phase'],
        childSiteIds: ids(entry.childSiteIds),
        completedSiteIds: ids(entry.completedSiteIds),
        requiredMaterials: Math.max(0, asFiniteNumber(entry.requiredMaterials, 0)),
        deliveredMaterials: Math.max(0, asFiniteNumber(entry.deliveredMaterials, 0)),
        refundedMaterials: Math.max(0, asFiniteNumber(entry.refundedMaterials, 0)),
        blockedReason: typeof entry.blockedReason === 'string' ? entry.blockedReason : null,
        cancelled: entry.cancelled === true,
        commissioned: entry.commissioned === true,
        createdAt: Math.max(0, asFiniteNumber(entry.createdAt, simTime)),
        finishedAt: Number.isFinite(entry.finishedAt) ? Math.max(0, asFiniteNumber(entry.finishedAt, 0)) : null
      });
    }
  }

  const rawMapExpansion = isRecord(snapshotRaw.mapExpansion) ? snapshotRaw.mapExpansion : null;
  const rawPurchased = rawMapExpansion && isRecord(rawMapExpansion.purchased) ? rawMapExpansion.purchased : null;
  const mapExpansion = rawPurchased
    ? {
        purchased: {
          north: rawPurchased.north === true,
          east: rawPurchased.east === true,
          south: rawPurchased.south === true,
          west: rawPurchased.west === true
        },
        purchasesMade: Math.max(0, Math.floor(asFiniteNumber(rawMapExpansion?.purchasesMade, 0)))
      }
    : undefined;

  // Optional in legacy saves — empty/missing array is fine; the runtime
  // defaults the per-berth allowlist to "all allowed" when no row
  // exists for an anchor.
  const berthConfigs: NonNullable<StationSnapshotV1['berthConfigs']> = [];
  if (Array.isArray(snapshotRaw.berthConfigs)) {
    for (let i = 0; i < snapshotRaw.berthConfigs.length; i++) {
      const entry = snapshotRaw.berthConfigs[i];
      if (!isRecord(entry)) {
        warnings.push(`berthConfigs[${i}] invalid; skipped.`);
        continue;
      }
      const anchorTile = Math.floor(asFiniteNumber(entry.anchorTile, -1));
      if (anchorTile < 0 || anchorTile >= expectedLength) {
        warnings.push(`berthConfigs[${i}] has out-of-range anchorTile; skipped.`);
        continue;
      }
      const allowedShipTypes = Array.isArray(entry.allowedShipTypes)
        ? entry.allowedShipTypes.filter((type): type is ShipType => isOneOf(type, SHIP_TYPES))
        : [];
      const allowedShipSizes = Array.isArray(entry.allowedShipSizes)
        ? entry.allowedShipSizes.filter((size): size is ShipSize => isOneOf(size, SHIP_SIZES))
        : [];
      berthConfigs.push({
        anchorTile,
        allowedShipTypes:
          allowedShipTypes.length > 0 ? [...new Set(allowedShipTypes)] : ['tourist'],
        allowedShipSizes:
          allowedShipSizes.length > 0 ? [...new Set(allowedShipSizes)] : ['small'],
        screeningLevel: isOneOf(entry.screeningLevel, BERTH_SCREENING_LEVELS) ? entry.screeningLevel : 'standard',
        customsPolicy: isOneOf(entry.customsPolicy, CUSTOMS_POLICIES) ? entry.customsPolicy : 'routine',
        serviceScore: Math.max(0, Math.min(100, asFiniteNumber(entry.serviceScore, 50))),
        serviceVisits: Math.max(0, Math.floor(asFiniteNumber(entry.serviceVisits, 0))),
        serviceLastDelta: Math.max(-100, Math.min(100, asFiniteNumber(entry.serviceLastDelta, 0)))
      });
    }
  }

  let credits = defaultState.metrics.credits;
  let waterStock = defaultState.metrics.waterStock;
  let airQuality = defaultState.metrics.airQuality;
  let legacyMaterialStock = defaultState.legacyMaterialStock;
  if (isRecord(snapshotRaw.resources)) {
    credits = Math.max(0, asFiniteNumber(snapshotRaw.resources.credits, credits));
    waterStock = Math.max(0, asFiniteNumber(snapshotRaw.resources.waterStock, waterStock));
    airQuality = clamp(asFiniteNumber(snapshotRaw.resources.airQuality, airQuality), 0, 100);
    legacyMaterialStock = Math.max(0, asFiniteNumber(snapshotRaw.resources.legacyMaterialStock, legacyMaterialStock));
  } else {
    warnings.push('resources missing; defaulted.');
  }
  let crewTotal = defaultState.crew.total;
  let roleCounts: StaffRoleCounts = { ...defaultState.crew.roleCounts };
  if (isRecord(snapshotRaw.crew)) {
    crewTotal = clamp(Math.round(asFiniteNumber(snapshotRaw.crew.total, crewTotal)), 0, 40);
    if (isRecord(snapshotRaw.crew.roleCounts)) {
      const next = createEmptyStaffRoleCounts();
      for (const role of STAFF_ROLES) {
        next[role] = clamp(Math.round(asFiniteNumber(snapshotRaw.crew.roleCounts[role], 0)), 0, 60);
      }
      roleCounts = next;
      crewTotal = totalStaffCount(roleCounts);
    } else {
      roleCounts = createEmptyStaffRoleCounts();
      roleCounts.captain = crewTotal > 0 ? 1 : 0;
      roleCounts.assistant = Math.max(0, crewTotal - roleCounts.captain);
    }
  } else {
    warnings.push('crew missing; defaulted.');
  }
  const crewMembers: NonNullable<StationSnapshotV1['crew']['members']> = [];
  if (isRecord(snapshotRaw.crew) && Array.isArray(snapshotRaw.crew.members)) {
    const seenIds = new Set<number>();
    for (const entry of snapshotRaw.crew.members) {
      if (!isRecord(entry)) continue;
      const id = Math.floor(asFiniteNumber(entry.id, -1));
      if (id < 0 || crewMembers.length >= crewTotal || seenIds.has(id)) continue;
      seenIds.add(id);
      crewMembers.push({
        id,
        name: typeof entry.name === 'string' && entry.name.trim().length > 0 ? entry.name.trim().slice(0, 48) : `Crew ${id + 1}`,
        tileIndex: Number.isFinite(entry.tileIndex)
          ? clamp(Math.floor(asFiniteNumber(entry.tileIndex, 0)), 0, expectedLength - 1)
          : undefined,
        staffRole: isOneOf(entry.staffRole, STAFF_ROLES) ? entry.staffRole : undefined,
        shiftBucket: Number.isFinite(entry.shiftBucket)
          ? clamp(Math.floor(asFiniteNumber(entry.shiftBucket, 0)), 0, 2)
          : undefined,
        recalledUntil: Number.isFinite(entry.recalledUntil)
          ? Math.max(0, asFiniteNumber(entry.recalledUntil, 0))
          : undefined,
        homeWorkplaceTile: entry.homeWorkplaceTile === null
          ? null
          : Number.isFinite(entry.homeWorkplaceTile)
            ? clamp(Math.floor(asFiniteNumber(entry.homeWorkplaceTile, 0)), 0, expectedLength - 1)
            : undefined,
        assignedSleepTile: entry.assignedSleepTile === null
          ? null
          : Number.isFinite(entry.assignedSleepTile)
            ? clamp(Math.floor(asFiniteNumber(entry.assignedSleepTile, 0)), 0, expectedLength - 1)
            : undefined,
        energy: clamp(asFiniteNumber(entry.energy, 100), 0, 100),
        hunger: clamp(asFiniteNumber(entry.hunger, 82), 0, 100),
        hygiene: clamp(asFiniteNumber(entry.hygiene, 100), 0, 100),
        bladder: clamp(asFiniteNumber(entry.bladder, 100), 0, 100),
        thirst: clamp(asFiniteNumber(entry.thirst, 100), 0, 100),
        morale: clamp(asFiniteNumber(entry.morale, 100), 0, 100),
        missedPayrollCycles: Math.max(0, Math.floor(asFiniteNumber(entry.missedPayrollCycles, 0))),
        needsStrainSec: Math.max(0, asFiniteNumber(entry.needsStrainSec, 0)),
        resignationNoticeAt: typeof entry.resignationNoticeAt === 'number' && Number.isFinite(entry.resignationNoticeAt)
          ? Math.max(0, entry.resignationNoticeAt)
          : null,
        airExposureSec: Math.max(0, asFiniteNumber(entry.airExposureSec, 0)),
        healthState: isOneOf(entry.healthState, ['healthy', 'distressed', 'critical'] as const)
          ? entry.healthState
          : 'healthy',
        blockedTicks: Math.max(0, Math.floor(asFiniteNumber(entry.blockedTicks, 0))),
        movementReplanCooldownUntil: Math.max(0, asFiniteNumber(entry.movementReplanCooldownUntil, 0)),
        activeJobId: entry.activeJobId === null
          ? null
          : Number.isFinite(entry.activeJobId)
            ? Math.max(0, Math.floor(asFiniteNumber(entry.activeJobId, 0)))
            : undefined,
        carryingItemType: entry.carryingItemType === null
          ? null
          : isOneOf(entry.carryingItemType, ITEM_TYPES)
            ? entry.carryingItemType
            : undefined,
        carryingAmount: Math.max(0, asFiniteNumber(entry.carryingAmount, 0))
      });
    }
  }

  let command: StationSnapshotV1['command'] = undefined;
  if (isRecord(snapshotRaw.command)) {
    const completedSpecialties = Array.isArray(snapshotRaw.command.completedSpecialties)
      ? snapshotRaw.command.completedSpecialties.filter((id): id is SpecialtyId => isOneOf(id, SPECIALTY_IDS))
      : [];
    const selectedSpecialty = isOneOf(snapshotRaw.command.selectedSpecialty, SPECIALTY_IDS)
      ? snapshotRaw.command.selectedSpecialty
      : null;
    const specialtyProgress = createInitialSpecialtyProgress();
    if (isRecord(snapshotRaw.command.specialtyProgress)) {
      for (const id of SPECIALTY_IDS) {
        const raw = snapshotRaw.command.specialtyProgress[id];
        if (!isRecord(raw)) continue;
        specialtyProgress[id] = {
          id,
          state:
            raw.state === 'active' || raw.state === 'available' || raw.state === 'completed' || raw.state === 'locked'
              ? raw.state
              : specialtyProgress[id].state,
          progress: clamp(asFiniteNumber(raw.progress, specialtyProgress[id].progress), 0, 1),
          selectedAt: typeof raw.selectedAt === 'number' ? raw.selectedAt : null,
          completedAt: typeof raw.completedAt === 'number' ? raw.completedAt : null
        };
      }
    }
    const officers: Partial<Record<StaffRole, boolean>> = {};
    if (isRecord(snapshotRaw.command.officers)) {
      for (const role of STAFF_ROLES) {
        if (snapshotRaw.command.officers[role] === true) officers[role] = true;
      }
    }
    officers.captain = true;
    command = { selectedSpecialty, completedSpecialties, specialtyProgress, officers };
  }

  const inventoryByTile: StationSnapshotV1['inventoryByTile'] = [];
  if (Array.isArray(snapshotRaw.inventoryByTile)) {
    for (let i = 0; i < snapshotRaw.inventoryByTile.length; i++) {
      const entry = snapshotRaw.inventoryByTile[i];
      if (!isRecord(entry)) {
        warnings.push(`inventoryByTile[${i}] invalid; skipped.`);
        continue;
      }
      const tileIndex = Math.floor(asFiniteNumber(entry.tileIndex, -1));
      if (tileIndex < 0 || tileIndex >= expectedLength) {
        warnings.push(`inventoryByTile[${i}] has out-of-range tileIndex; skipped.`);
        continue;
      }
      if (!isRecord(entry.items)) {
        warnings.push(`inventoryByTile[${i}] missing items; skipped.`);
        continue;
      }
      const items: Partial<Record<ItemType, number>> = {};
      let hasAny = false;
      for (const itemType of ITEM_TYPES) {
        const amount = entry.items[itemType];
        if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) continue;
        items[itemType] = amount;
        hasAny = true;
      }
      if (!hasAny) continue;
      inventoryByTile.push({ tileIndex, items });
    }
  }

  let shipsPerCycle = defaultState.controls.shipsPerCycle;
  let taxRate = defaultState.controls.taxRate;
  let portAutoAdmitEnabled = defaultState.controls.portAutoAdmitEnabled;
  let portAutoAdmitPolicy = defaultState.controls.portAutoAdmitPolicy;
  let crewAutoStaffEnabled = defaultState.controls.crewAutoStaffEnabled;
  let materialAutoImportEnabled = defaultState.controls.materialAutoImportEnabled;
  let materialTargetStock = defaultState.controls.materialTargetStock;
  let crewShiftTargets = { ...defaultState.controls.crewShiftTargets };
  let crewWatchTargets = defaultState.controls.crewWatchTargets.map((targets) => ({ ...targets })) as [
    CrewShiftTargets,
    CrewShiftTargets,
    CrewShiftTargets
  ];
  let emergencyRecallUntil = defaultState.controls.emergencyRecallUntil;
  let materialImportBatchSize = defaultState.controls.materialImportBatchSize;
  let securityPosture = defaultState.controls.securityPosture;
  if (isRecord(snapshotRaw.controls)) {
    shipsPerCycle = clamp(Math.round(asFiniteNumber(snapshotRaw.controls.shipsPerCycle, shipsPerCycle)), 0, 3);
    taxRate = clamp(asFiniteNumber(snapshotRaw.controls.taxRate, taxRate), 0, 0.5);
    portAutoAdmitEnabled = snapshotRaw.controls.portAutoAdmitEnabled === true;
    if (isOneOf(snapshotRaw.controls.portAutoAdmitPolicy, ['cautious', 'balanced', 'open'] as const)) {
      portAutoAdmitPolicy = snapshotRaw.controls.portAutoAdmitPolicy;
    }
    crewAutoStaffEnabled = snapshotRaw.controls.crewAutoStaffEnabled === true;
    if (typeof snapshotRaw.controls.materialAutoImportEnabled === 'boolean') {
      materialAutoImportEnabled = snapshotRaw.controls.materialAutoImportEnabled;
    }
    materialTargetStock = clamp(asFiniteNumber(snapshotRaw.controls.materialTargetStock, materialTargetStock), 0, 500);
    if (isRecord(snapshotRaw.controls.crewShiftTargets)) {
      for (const lane of ['food', 'sanitation', 'engineering', 'logistics', 'construction-eva', 'flex'] as const) {
        crewShiftTargets[lane] = clamp(Math.round(asFiniteNumber(snapshotRaw.controls.crewShiftTargets[lane], crewShiftTargets[lane])), 0, 99);
      }
    }
    const rawWatchTargets = snapshotRaw.controls.crewWatchTargets;
    if (Array.isArray(rawWatchTargets) && rawWatchTargets.length === 3) {
      crewWatchTargets = crewWatchTargets.map((fallback, watch) => {
        const raw = rawWatchTargets[watch];
        const parsed = { ...fallback };
        if (isRecord(raw)) {
          for (const lane of ['food', 'sanitation', 'engineering', 'logistics', 'construction-eva', 'flex'] as const) {
            parsed[lane] = clamp(Math.round(asFiniteNumber(raw[lane], parsed[lane])), 0, 99);
          }
        }
        return parsed;
      }) as [CrewShiftTargets, CrewShiftTargets, CrewShiftTargets];
    } else {
      crewWatchTargets = [
        { ...crewShiftTargets },
        { ...crewShiftTargets },
        { ...crewShiftTargets }
      ];
    }
    emergencyRecallUntil = Math.max(0, asFiniteNumber(snapshotRaw.controls.emergencyRecallUntil, emergencyRecallUntil));
    materialImportBatchSize = clamp(asFiniteNumber(snapshotRaw.controls.materialImportBatchSize, materialImportBatchSize), 1, 160);
    if (isOneOf(snapshotRaw.controls.securityPosture, SECURITY_POSTURES)) {
      securityPosture = snapshotRaw.controls.securityPosture;
    }
  } else {
    warnings.push('controls missing; defaulted.');
  }

  let unlockTier: UnlockTier = defaultState.unlocks.tier;
  const unlockedIds = new Set<UnlockId>(defaultState.unlocks.unlockedIds);
  const unlockedAtSec: Partial<Record<UnlockId, number>> = { ...defaultState.unlocks.unlockedAtSec };
  let hasUnlockState = false;
  if (isRecord(snapshotRaw.unlocks)) {
    hasUnlockState = true;
    unlockTier = normalizeUnlockTier(Math.round(asFiniteNumber(snapshotRaw.unlocks.tier, unlockTier)));
    if (Array.isArray(snapshotRaw.unlocks.unlockedIds)) {
      for (const id of snapshotRaw.unlocks.unlockedIds) {
        if (isOneOf(id, UNLOCK_IDS)) unlockedIds.add(id);
      }
    }
    if (isRecord(snapshotRaw.unlocks.unlockedAtSec)) {
      for (const id of UNLOCK_IDS) {
        const value = snapshotRaw.unlocks.unlockedAtSec[id];
        if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
          unlockedAtSec[id] = value;
        }
      }
    }
  } else {
    warnings.push('unlocks missing; deriving from saved content.');
  }

  // Content-derived tier is a *fallback for legacy saves only*. Elevating a
  // save that carries explicit unlock state made every save/load inflate the
  // player's tier, because the authored starter station itself contains
  // content whose catalog entries sit above tier 0 (Storage, Storage Rack).
  // A fresh run therefore reloaded as Tier 2 and looked like unlock state was
  // leaking across playthroughs. Saved unlock state is authoritative; content
  // above it stays usable because gating only governs *new* placement.
  const requiredTier = requiredUnlockTierForSnapshotContent(rooms, modules, dockConfigs);
  if (!hasUnlockState) {
    unlockTier = requiredTier;
    for (const id of UNLOCK_IDS_BY_TIER[requiredTier]) unlockedIds.add(id);
    if (requiredTier > 0) {
      warnings.push(`Derived unlock tier ${requiredTier} from saved rooms/modules/ship permissions.`);
    }
  } else if (unlockTier < requiredTier) {
    warnings.push(
      `Save contains tier-${requiredTier} content at tier ${unlockTier}; existing content is preserved and the tier is left as saved.`
    );
  }
  for (const id of UNLOCK_IDS_BY_TIER[unlockTier]) {
    unlockedIds.add(id);
  }

  // Progression counters — missing in pre-progression save files, so
  // default all to 0 and an empty archetypesEverSeen set.
  const progRaw = isRecord(snapshotRaw.progression) ? snapshotRaw.progression : null;
  const ratingRaw = progRaw && isRecord(progRaw.rating) ? progRaw.rating : null;
  const ratingPenaltiesRaw = ratingRaw && isRecord(ratingRaw.penalties) ? ratingRaw.penalties : null;
  const ratingFailuresRaw = ratingRaw && isRecord(ratingRaw.failureReasons) ? ratingRaw.failureReasons : null;
  const ratingBonusesRaw = ratingRaw && isRecord(ratingRaw.bonuses) ? ratingRaw.bonuses : null;
  const nonNegative = (value: unknown): number => Math.max(0, asFiniteNumber(value, 0));
  const archetypesEverSeen: Partial<Record<VisitorArchetype, boolean>> = {};
  if (progRaw && isRecord(progRaw.archetypesEverSeen)) {
    for (const archetype of VISITOR_ARCHETYPES) {
      if (progRaw.archetypesEverSeen[archetype] === true) archetypesEverSeen[archetype] = true;
    }
  }
  const progression: StationSnapshotV1['progression'] = {
    mealsServedTotal: Math.max(0, Math.floor(asFiniteNumber(progRaw?.mealsServedTotal, 0))),
    creditsEarnedLifetime: Math.max(0, asFiniteNumber(progRaw?.creditsEarnedLifetime, 0)),
    turnaroundsCompletedLifetime: Math.max(
      0,
      Math.floor(
        asFiniteNumber(
          progRaw?.turnaroundsCompletedLifetime,
          asFiniteNumber(progRaw?.dockedShipsCompleted, 0)
        )
      )
    ),
    tradeCyclesCompletedLifetime: Math.max(0, Math.floor(asFiniteNumber(progRaw?.tradeCyclesCompletedLifetime, 0))),
    incidentsResolvedLifetime: Math.max(0, Math.floor(asFiniteNumber(progRaw?.incidentsResolvedLifetime, 0))),
    actorsTreatedLifetime: Math.max(0, Math.floor(asFiniteNumber(progRaw?.actorsTreatedLifetime, 0))),
    residentsConvertedLifetime: Math.max(0, Math.floor(asFiniteNumber(progRaw?.residentsConvertedLifetime, 0))),
    dockedShipsCompleted: Math.max(0, Math.floor(asFiniteNumber(progRaw?.dockedShipsCompleted, 0))),
    archetypesEverSeen,
    rating: {
      score: clamp(asFiniteNumber(ratingRaw?.score, 0), 0, 100),
      delta: asFiniteNumber(ratingRaw?.delta, 0),
      penalties: {
        shipTimeout: nonNegative(ratingPenaltiesRaw?.shipTimeout),
        shipSkip: nonNegative(ratingPenaltiesRaw?.shipSkip),
        visitorFailure: nonNegative(ratingPenaltiesRaw?.visitorFailure),
        walkDissatisfaction: nonNegative(ratingPenaltiesRaw?.walkDissatisfaction),
        routeExposure: nonNegative(ratingPenaltiesRaw?.routeExposure),
        environment: nonNegative(ratingPenaltiesRaw?.environment),
        sanitation: nonNegative(ratingPenaltiesRaw?.sanitation),
        residentDeparture: nonNegative(ratingPenaltiesRaw?.residentDeparture)
      },
      failureReasons: {
        noLeisurePath: nonNegative(ratingFailuresRaw?.noLeisurePath),
        shipServicesMissing: nonNegative(ratingFailuresRaw?.shipServicesMissing),
        patienceBail: nonNegative(ratingFailuresRaw?.patienceBail),
        dockTimeout: nonNegative(ratingFailuresRaw?.dockTimeout),
        trespass: nonNegative(ratingFailuresRaw?.trespass)
      },
      bonuses: {
        mealService: nonNegative(ratingBonusesRaw?.mealService),
        leisureService: nonNegative(ratingBonusesRaw?.leisureService),
        successfulExit: nonNegative(ratingBonusesRaw?.successfulExit),
        residentRetention: nonNegative(ratingBonusesRaw?.residentRetention)
      }
    }
  };
  if (!progRaw) warnings.push('progression counters missing; defaulted to zero (pre-progression save).');

  const sanitationRaw = isRecord(snapshotRaw.sanitation) ? snapshotRaw.sanitation : null;
  const dirtByTile = new Array<number>(expectedLength).fill(0);
  const dirtSourceByTile = new Array<number>(expectedLength).fill(0);
  if (sanitationRaw) {
    if (Array.isArray(sanitationRaw.dirtByTile)) {
      const len = Math.min(expectedLength, sanitationRaw.dirtByTile.length);
      for (let i = 0; i < len; i++) {
        dirtByTile[i] = clamp(asFiniteNumber(sanitationRaw.dirtByTile[i], 0), 0, 100);
      }
      if (sanitationRaw.dirtByTile.length !== expectedLength) {
        warnings.push(`sanitation.dirtByTile length ${sanitationRaw.dirtByTile.length} does not match expected ${expectedLength}; adjusted.`);
      }
    }
    if (Array.isArray(sanitationRaw.dirtSourceByTile)) {
      const len = Math.min(expectedLength, sanitationRaw.dirtSourceByTile.length);
      for (let i = 0; i < len; i++) {
        dirtSourceByTile[i] = clamp(Math.floor(asFiniteNumber(sanitationRaw.dirtSourceByTile[i], 0)), 0, 9);
      }
      if (sanitationRaw.dirtSourceByTile.length !== expectedLength) {
        warnings.push(`sanitation.dirtSourceByTile length ${sanitationRaw.dirtSourceByTile.length} does not match expected ${expectedLength}; adjusted.`);
      }
    }
  }

  const thermalRaw = isRecord(snapshotRaw.thermal) ? snapshotRaw.thermal : null;
  const heatByTile = new Array<number>(expectedLength).fill(42);
  const staleAirByTile = new Array<number>(expectedLength).fill(0);
  if (thermalRaw) {
    if (Array.isArray(thermalRaw.heatByTile)) {
      const len = Math.min(expectedLength, thermalRaw.heatByTile.length);
      for (let i = 0; i < len; i++) {
        heatByTile[i] = clamp(asFiniteNumber(thermalRaw.heatByTile[i], 42), 0, 100);
      }
      if (thermalRaw.heatByTile.length !== expectedLength) {
        warnings.push(`thermal.heatByTile length ${thermalRaw.heatByTile.length} does not match expected ${expectedLength}; adjusted.`);
      }
    }
    if (Array.isArray(thermalRaw.staleAirByTile)) {
      const len = Math.min(expectedLength, thermalRaw.staleAirByTile.length);
      for (let i = 0; i < len; i++) {
        staleAirByTile[i] = clamp(asFiniteNumber(thermalRaw.staleAirByTile[i], 0), 0, 100);
      }
      if (thermalRaw.staleAirByTile.length !== expectedLength) {
        warnings.push(`thermal.staleAirByTile length ${thermalRaw.staleAirByTile.length} does not match expected ${expectedLength}; adjusted.`);
      }
    }
  }

  const utilityUnderlayLayers: Partial<Record<UtilityUnderlayKind, number[]>> = {};
  const utilityUnderlayRaw = isRecord(snapshotRaw.utilityUnderlay) ? snapshotRaw.utilityUnderlay : null;
  let utilityUnderlayVersion = 0;
  if (utilityUnderlayRaw) {
    utilityUnderlayVersion = Math.max(0, Math.floor(asFiniteNumber(utilityUnderlayRaw.version, 0)));
    const layersRaw = isRecord(utilityUnderlayRaw.layers) ? utilityUnderlayRaw.layers : null;
    if (layersRaw) {
      for (const kind of UTILITY_UNDERLAY_KINDS) {
        const rawLayer = layersRaw[kind];
        const layer = new Array<number>(expectedLength).fill(0);
        if (!Array.isArray(rawLayer)) continue;
        const len = Math.min(expectedLength, rawLayer.length);
        for (let i = 0; i < len; i++) layer[i] = asFiniteNumber(rawLayer[i], 0) > 0 ? 1 : 0;
        if (rawLayer.length !== expectedLength) {
          warnings.push(`utilityUnderlay.layers.${kind} length ${rawLayer.length} does not match expected ${expectedLength}; adjusted.`);
        }
        utilityUnderlayLayers[kind] = layer;
      }
    }
  } else if (isRecord(snapshotRaw.utilityUnderlay)) {
    warnings.push('utilityUnderlay malformed; defaulted.');
  }

  const plumbingRaw = isRecord(snapshotRaw.plumbing) ? snapshotRaw.plumbing : null;
  let plumbingVersion = 1;
  const plumbingFloodByTile = new Array<number>(expectedLength).fill(0);
  const plumbingLeaks: NonNullable<StationSnapshotV1['plumbing']>['leaks'] = [];
  let plumbingNextLeakId = 1;
  if (plumbingRaw) {
    plumbingVersion = Math.max(1, Math.floor(asFiniteNumber(plumbingRaw.version, 1)));
    if (Array.isArray(plumbingRaw.floodByTile)) {
      const len = Math.min(expectedLength, plumbingRaw.floodByTile.length);
      for (let i = 0; i < len; i++) {
        plumbingFloodByTile[i] = clamp(asFiniteNumber(plumbingRaw.floodByTile[i], 0), 0, 100);
      }
      if (plumbingRaw.floodByTile.length !== expectedLength) {
        warnings.push(`plumbing.floodByTile length ${plumbingRaw.floodByTile.length} does not match expected ${expectedLength}; adjusted.`);
      }
    }
    if (Array.isArray(plumbingRaw.leaks)) {
      const seenLeakIds = new Set<number>();
      for (let i = 0; i < plumbingRaw.leaks.length; i++) {
        const entry = plumbingRaw.leaks[i];
        if (!isRecord(entry)) {
          warnings.push(`plumbing.leaks[${i}] invalid; skipped.`);
          continue;
        }
        const id = Math.max(1, Math.floor(asFiniteNumber(entry.id, i + 1)));
        const tileIndex = Math.floor(asFiniteNumber(entry.tileIndex, -1));
        const fixtureTile = Math.floor(asFiniteNumber(entry.fixtureTile, tileIndex));
        if (seenLeakIds.has(id) || tileIndex < 0 || tileIndex >= expectedLength || fixtureTile < 0 || fixtureTile >= expectedLength) {
          warnings.push(`plumbing.leaks[${i}] has invalid id/tile; skipped.`);
          continue;
        }
        seenLeakIds.add(id);
        plumbingLeaks.push({
          id,
          tileIndex,
          fixtureTile,
          severity: clamp(asFiniteNumber(entry.severity, 20), 0, 100),
          createdAt: Math.max(0, asFiniteNumber(entry.createdAt, simTime)),
          isolated: entry.isolated === true,
          repairJobId: Number.isFinite(entry.repairJobId)
            ? Math.max(1, Math.floor(asFiniteNumber(entry.repairJobId, 1)))
            : null
        });
      }
    }
    const highestLeakId = plumbingLeaks.reduce((max, leak) => Math.max(max, leak.id), 0);
    plumbingNextLeakId = Math.max(highestLeakId + 1, Math.floor(asFiniteNumber(plumbingRaw.nextLeakId, highestLeakId + 1)));
  } else if (isRecord(snapshotRaw.plumbing)) {
    warnings.push('plumbing malformed; defaulted.');
  }

  const maintenanceRaw = isRecord(snapshotRaw.maintenance) ? snapshotRaw.maintenance : null;
  const maintenanceDebts: NonNullable<StationSnapshotV1['maintenance']>['debts'] = [];
  const exteriorIntegrityTargets: NonNullable<StationSnapshotV1['maintenance']>['exteriorIntegrityTargets'] = [];
  if (maintenanceRaw && Array.isArray(maintenanceRaw.debts)) {
    for (let i = 0; i < maintenanceRaw.debts.length; i++) {
      const entry = maintenanceRaw.debts[i];
      if (!isRecord(entry)) {
        warnings.push(`maintenance.debts[${i}] invalid; skipped.`);
        continue;
      }
      const anchorTile = Math.floor(asFiniteNumber(entry.anchorTile, -1));
      const targetTile = Math.floor(asFiniteNumber(entry.targetTile, anchorTile));
      if (anchorTile < 0 || anchorTile >= expectedLength || targetTile < 0 || targetTile >= expectedLength) {
        warnings.push(`maintenance.debts[${i}] has out-of-range tile; skipped.`);
        continue;
      }
      const system = isOneOf(entry.system, ['reactor', 'life-support'] as const) ? entry.system : undefined;
      const domain = isOneOf(entry.domain, MAINTENANCE_DOMAINS) ? entry.domain : system ? 'utility' : 'module';
      const source = isOneOf(entry.source, MAINTENANCE_SOURCES) ? entry.source : system ? 'idle' : 'high-load';
      const key =
        typeof entry.key === 'string' && entry.key.length > 0
          ? entry.key
          : domain === 'utility' && system
            ? `${system}:${anchorTile}`
            : `${domain}:${anchorTile}`;
      const room = isOneOf(entry.room, Object.values(RoomType)) ? entry.room : undefined;
      maintenanceDebts.push({
        key,
        system,
        domain,
        source,
        anchorTile,
        targetTile,
        room,
        moduleId: typeof entry.moduleId === 'number' && Number.isFinite(entry.moduleId) ? Math.floor(entry.moduleId) : undefined,
        exterior: entry.exterior === true,
        label: typeof entry.label === 'string' ? entry.label : undefined,
        effect: typeof entry.effect === 'string' ? entry.effect : undefined,
        debt: clamp(asFiniteNumber(entry.debt, 0), 0, 100),
        lastServicedAt: Math.max(0, asFiniteNumber(entry.lastServicedAt, 0)),
        lastImpactAt: typeof entry.lastImpactAt === 'number' && Number.isFinite(entry.lastImpactAt) ? Math.max(0, entry.lastImpactAt) : undefined,
        ignitionRiskSince:
          typeof entry.ignitionRiskSince === 'number' && Number.isFinite(entry.ignitionRiskSince)
            ? Math.max(0, entry.ignitionRiskSince)
            : undefined
      });
    }
    if (Array.isArray(maintenanceRaw.exteriorIntegrityTargets)) {
      const seenIntegrityIds = new Set<string>();
      for (let i = 0; i < maintenanceRaw.exteriorIntegrityTargets.length; i++) {
        const entry = maintenanceRaw.exteriorIntegrityTargets[i];
        if (!isRecord(entry) || typeof entry.id !== 'string' || entry.id.length <= 0 || seenIntegrityIds.has(entry.id)) {
          warnings.push(`maintenance.exteriorIntegrityTargets[${i}] invalid; skipped.`);
          continue;
        }
        if (
          !isOneOf(entry.panel, ['hull', 'dock', 'berth'] as const) ||
          !isOneOf(entry.face, ['north', 'east', 'south', 'west'] as const) ||
          !isOneOf(entry.state, ['worn', 'damaged', 'breached', 'patched'] as const)
        ) {
          warnings.push(`maintenance.exteriorIntegrityTargets[${i}] has invalid panel state; skipped.`);
          continue;
        }
        seenIntegrityIds.add(entry.id);
        exteriorIntegrityTargets.push({
          id: entry.id,
          panel: entry.panel,
          worldX: Math.round(asFiniteNumber(entry.worldX, 0)),
          worldY: Math.round(asFiniteNumber(entry.worldY, 0)),
          face: entry.face,
          wear: clamp(asFiniteNumber(entry.wear, 0), 0, 100),
          state: entry.state,
          lastTransitionAt: Math.max(0, asFiniteNumber(entry.lastTransitionAt, simTime)),
          lastImpactAt:
            typeof entry.lastImpactAt === 'number' && Number.isFinite(entry.lastImpactAt)
              ? Math.max(0, entry.lastImpactAt)
              : undefined
        });
      }
    }
  }

  const activePortShips: ArrivingShip[] = Array.isArray(snapshotRaw.activePortShips)
    ? snapshotRaw.activePortShips.flatMap((entry) => {
        if (
          !isRecord(entry) ||
          entry.kind !== 'transient' ||
          typeof entry.id !== 'number' ||
          (typeof entry.portContractId !== 'number' && normalizeSmallCraftVisit(entry.smallCraftVisit) === undefined) ||
          !Array.isArray(entry.bayTiles) ||
          !isOneOf(entry.stage, ['approach', 'docked', 'depart'] as const)
        ) return [];
        const shipType = entry.shipType as ShipType;
        const size = entry.size as ShipSize;
        const portManifest = normalizeTrafficOffer(entry.portManifest);
        const hullVariant = isCompatibleShipHullVariant(entry.hullVariant, shipType, size)
          ? entry.hullVariant
          : selectShipHullVariant(entry.id, shipType, size);
        return [{
          ...(entry as unknown as ArrivingShip),
          hullVariant,
          portManifest: portManifest ? { ...portManifest, hullVariant } : undefined,
          smallCraftVisit: normalizeSmallCraftVisit(entry.smallCraftVisit),
          stayClass: isOneOf(entry.stayClass, VISIT_STAY_CLASSES) ? entry.stayClass : 'errand',
          visitPhase: isOneOf(entry.visitPhase, SHIP_VISIT_PHASES)
            ? entry.visitPhase
            : entry.stage === 'approach' ? 'approach' : entry.stage === 'depart' ? 'depart' : 'visit-service',
          earliestDepartureAt: typeof entry.earliestDepartureAt === 'number' && Number.isFinite(entry.earliestDepartureAt)
            ? Math.max(0, entry.earliestDepartureAt)
            : undefined,
          plannedDepartureAt: typeof entry.plannedDepartureAt === 'number' && Number.isFinite(entry.plannedDepartureAt)
            ? Math.max(0, entry.plannedDepartureAt)
            : undefined,
          extensionUntil: typeof entry.extensionUntil === 'number' && Number.isFinite(entry.extensionUntil)
            ? Math.max(0, entry.extensionUntil)
            : null,
          recallAt: typeof entry.recallAt === 'number' && Number.isFinite(entry.recallAt)
            ? Math.max(0, entry.recallAt)
            : null,
          approachCommitment: normalizeApproachCommitment(entry.approachCommitment)
        }];
      })
    : [];
  const trafficOffers: TrafficOffer[] = Array.isArray(snapshotRaw.trafficOffers)
    ? snapshotRaw.trafficOffers
        .map((entry) => normalizeTrafficOffer(entry))
        .filter((offer): offer is TrafficOffer => offer !== null)
    : [];
  const residents: Resident[] = Array.isArray(snapshotRaw.residents)
    ? snapshotRaw.residents.flatMap((entry) => {
        if (!isRecord(entry) || !Number.isFinite(entry.id) || !Number.isFinite(entry.tileIndex)) return [];
        return [entry as unknown as Resident];
      })
    : [];
  const visitors: Visitor[] = Array.isArray(snapshotRaw.visitors)
    ? snapshotRaw.visitors.flatMap((entry) => {
        const visitor = normalizeSavedVisitor(entry, expectedLength);
        return visitor ? [visitor] : [];
      })
    : [];
  const transportJobs: NonNullable<StationSnapshotV1['transportJobs']> = [];
  if (Array.isArray(snapshotRaw.transportJobs)) {
    const seenJobIds = new Set<number>();
    for (const entry of snapshotRaw.transportJobs) {
      if (!isRecord(entry)) continue;
      const id = Math.floor(asFiniteNumber(entry.id, -1));
      const type = isOneOf(entry.type, ['pickup', 'deliver'] as const) ? entry.type : null;
      const itemType = isOneOf(entry.itemType, ITEM_TYPES) ? entry.itemType : null;
      const state = isOneOf(entry.state, ['pending', 'assigned', 'in_progress'] as const) ? entry.state : null;
      if (id < 0 || seenJobIds.has(id) || !type || !itemType || !state) {
        warnings.push('transport job invalid; dropped.');
        continue;
      }
      seenJobIds.add(id);
      const amount = Math.max(0, asFiniteNumber(entry.amount, 0));
      if (amount <= 0) {
        warnings.push(`transport job ${id} has no cargo; dropped.`);
        continue;
      }
      const fromTile = clamp(Math.floor(asFiniteNumber(entry.fromTile, -1)), 0, expectedLength - 1);
      const toTile = clamp(Math.floor(asFiniteNumber(entry.toTile, -1)), 0, expectedLength - 1);
      transportJobs.push({
        id,
        type,
        itemType,
        amount,
        fromTile,
        toTile,
        assignedCrewId: Number.isFinite(entry.assignedCrewId) ? Math.floor(asFiniteNumber(entry.assignedCrewId, 0)) : null,
        createdAt: Math.max(0, asFiniteNumber(entry.createdAt, simTime)),
        expiresAt: Math.max(0, asFiniteNumber(entry.expiresAt, simTime)),
        state,
        pickedUpAmount: clamp(asFiniteNumber(entry.pickedUpAmount, 0), 0, amount),
        completedAt: null,
        lastProgressAt: Math.max(0, asFiniteNumber(entry.lastProgressAt, simTime)),
        stallReason: isOneOf(entry.stallReason, ['none', 'stalled_path_blocked', 'stalled_unreachable_source', 'stalled_unreachable_dropoff', 'stalled_no_supply'] as const)
          ? entry.stallReason
          : 'none',
        stalledSince: Number.isFinite(entry.stalledSince) ? Math.max(0, asFiniteNumber(entry.stalledSince, 0)) : undefined,
        blockedReason: typeof entry.blockedReason === 'string' ? entry.blockedReason.slice(0, 160) : null,
        portShipId: Number.isFinite(entry.portShipId) ? Math.max(0, Math.floor(asFiniteNumber(entry.portShipId, 0))) : undefined,
        portCargoLotId: Number.isFinite(entry.portCargoLotId) ? Math.max(0, Math.floor(asFiniteNumber(entry.portCargoLotId, 0))) : undefined,
        portCargoDirection: isOneOf(entry.portCargoDirection, ['inbound', 'outbound'] as const) ? entry.portCargoDirection : undefined,
        portFuelNodeTile: Number.isFinite(entry.portFuelNodeTile)
          ? clamp(Math.floor(asFiniteNumber(entry.portFuelNodeTile, 0)), 0, expectedLength - 1)
          : undefined
      });
    }
  }
  const commercialUnits = normalizeCommercialUnits(snapshotRaw.commercialUnits, expectedLength, warnings);
  const openingEconomy = normalizeOpeningEconomyState(snapshotRaw.openingEconomy, warnings);
  const serviceLog = normalizeServiceLog(snapshotRaw.serviceLog as Partial<ServiceLog> | undefined);

  return {
    simTime,
    width,
    height,
    mapWorldOriginX,
    mapWorldOriginY,
    tiles,
    zones,
    rooms,
    roomHousingPolicies,
    modules,
    commercialUnits,
    constructionSites,
    structuralExpansionProjects,
    mapExpansion,
    dockConfigs,
    berthConfigs,
    resources: {
      credits,
      waterStock,
      airQuality,
      legacyMaterialStock
    },
    crew: {
      total: crewTotal,
      roleCounts,
      members: crewMembers
    },
    residents,
    command,
    inventoryByTile,
    transportJobs,
    controls: {
      shipsPerCycle,
      taxRate,
      portAutoAdmitEnabled,
      portAutoAdmitPolicy,
      crewAutoStaffEnabled,
      materialAutoImportEnabled,
      materialTargetStock,
      materialImportBatchSize,
      securityPosture,
      crewShiftTargets,
      crewWatchTargets,
      emergencyRecallUntil
    },
    unlocks: {
      tier: unlockTier,
      unlockedIds: UNLOCK_IDS.filter((id) => unlockedIds.has(id)),
      unlockedAtSec
    },
    progression,
    sanitation: {
      dirtByTile,
      dirtSourceByTile
    },
    thermal: {
      heatByTile,
      staleAirByTile
    },
    utilityUnderlay: {
      version: utilityUnderlayVersion,
      layers: utilityUnderlayLayers
    },
    plumbing: {
      version: plumbingVersion,
      floodByTile: plumbingFloodByTile,
      leaks: plumbingLeaks,
      nextLeakId: plumbingNextLeakId
    },
    maintenance: {
      debts: maintenanceDebts,
      exteriorIntegrityTargets
    },
    openingEconomy,
    serviceLog,
    portOps,
    trafficOffers,
    activePortShips,
    visitors,
    site: normalizeSite(snapshotRaw.site)
  };
}

export function parseAndMigrateSave(text: string): ParseSuccess | ParseFailure {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false,
      error: 'Invalid JSON.'
    };
  }
  if (!isRecord(parsed)) {
    return {
      ok: false,
      error: 'Save payload must be a JSON object.'
    };
  }

  const warnings: string[] = [];
  let envelopeRaw: Record<string, unknown>;

  if (isRecord(parsed.snapshot)) {
    envelopeRaw = parsed;
  } else if (Array.isArray(parsed.tiles)) {
    return {
      ok: false,
      error: 'This save is from the previous station design and cannot be loaded into Two-Berth Shift.'
    };
  } else {
    return {
      ok: false,
      error: 'Save payload must include `snapshot` or top-level `tiles`.'
    };
  }

  const schemaVersionRaw = envelopeRaw.schemaVersion;
  if (schemaVersionRaw !== SAVE_SCHEMA_VERSION) {
    return {
      ok: false,
      error:
        typeof schemaVersionRaw === 'number' && schemaVersionRaw > SAVE_SCHEMA_VERSION
          ? `This save uses newer schema ${schemaVersionRaw}; this build supports schema ${SAVE_SCHEMA_VERSION}.`
          : 'This save is from the previous station design and cannot be loaded into Two-Berth Shift.'
    };
  }

  const snapshotRaw = envelopeRaw.snapshot;
  if (!isRecord(snapshotRaw)) {
    return {
      ok: false,
      error: 'Save payload snapshot is invalid.'
    };
  }
  const snapshot = normalizeSnapshot(snapshotRaw, warnings);
  if (!snapshot) {
    return {
      ok: false,
      error: 'Save payload missing required `tiles` array.'
    };
  }

  const save: StationSaveEnvelopeV1 = {
    schemaVersion: SAVE_SCHEMA_VERSION,
    gameVersion:
      typeof envelopeRaw.gameVersion === 'string' && envelopeRaw.gameVersion.trim().length > 0
        ? envelopeRaw.gameVersion
        : 'unknown',
    createdAt:
      typeof envelopeRaw.createdAt === 'string' && envelopeRaw.createdAt.trim().length > 0
        ? envelopeRaw.createdAt
        : new Date().toISOString(),
    name: typeof envelopeRaw.name === 'string' && envelopeRaw.name.trim().length > 0 ? envelopeRaw.name : 'Imported save',
    snapshot
  };

  return {
    ok: true,
    save,
    warnings
  };
}

function clearTransientState(state: StationState): void {
  state.visitors.length = 0;
  state.residents.length = 0;
  state.crewMembers.length = 0;
  state.crewSpawnCounter = 1;
  state.arrivingShips.length = 0;
  state.pendingSpawns.length = 0;
  state.jobs.length = 0;
  state.reservations.length = 0;
  state.dockQueue.length = 0;
  state.pathOccupancyByTile = new Map();
  state.bodyTiles.length = 0;
  state.recentDeathTimes.length = 0;
  state.recentExitTimes.length = 0;
  state.recentVisitLedger = [];
  state.incidentMemory = [];
  state.clusterActivationState = new Map();
  state.effects.blockedUntilByTile = new Map();
  state.effects.trespassCooldownUntilByTile = new Map();
  state.effects.securityAuraByTile = new Map();
  state.effects.cafeteriaStallUntil = 0;
  state.effects.brownoutUntil = 0;
  state.effects.securityDelayUntil = 0;
  state.metrics.bodyCount = 0;
  state.metrics.bodyVisibleCount = 0;
  state.metrics.recentDeaths = 0;
  state.metrics.pendingJobs = 0;
  state.metrics.assignedJobs = 0;
  state.metrics.expiredJobs = 0;
  state.metrics.completedJobs = 0;
  state.metrics.stalledJobs = 0;
  state.metrics.workforceLanes = {
    food: { target: 0, assigned: 0, working: 0, idle: 0, pending: 0, blocked: 0, borrowed: 0, pressure: 0 },
    sanitation: { target: 0, assigned: 0, working: 0, idle: 0, pending: 0, blocked: 0, borrowed: 0, pressure: 0 },
    engineering: { target: 0, assigned: 0, working: 0, idle: 0, pending: 0, blocked: 0, borrowed: 0, pressure: 0 },
    logistics: { target: 0, assigned: 0, working: 0, idle: 0, pending: 0, blocked: 0, borrowed: 0, pressure: 0 },
    'construction-eva': { target: 0, assigned: 0, working: 0, idle: 0, pending: 0, blocked: 0, borrowed: 0, pressure: 0 },
    flex: { target: 0, assigned: 0, working: 0, idle: 0, pending: 0, blocked: 0, borrowed: 0, pressure: 0 }
  };
  state.metrics.workforceBorrowedCrew = 0;
  state.metrics.workforceHighestPressureLane = null;
  state.crew.assigned = 0;
  state.crew.free = state.crew.total;
}

function refreshBasicInventoryMetrics(state: StationState): void {
  let rawMeal = 0;
  let preppedMeal = 0;
  let meal = 0;
  let cleanTray = 0;
  let dirtyTray = 0;
  let drink = 0;
  let rawMaterial = 0;
  let tradeGood = 0;
  for (const node of state.itemNodes) {
    rawMeal += Math.max(0, node.items.rawMeal ?? 0);
    preppedMeal += Math.max(0, node.items.preppedMeal ?? 0);
    meal += Math.max(0, node.items.meal ?? 0);
    cleanTray += Math.max(0, node.items.cleanTray ?? 0);
    dirtyTray += Math.max(0, node.items.dirtyTray ?? 0);
    drink += Math.max(0, node.items.drink ?? 0);
    rawMaterial += Math.max(0, node.items.rawMaterial ?? 0);
    tradeGood += Math.max(0, node.items.tradeGood ?? 0);
  }
  state.metrics.rawFoodStock = rawMeal;
  state.metrics.preppedMealStock = preppedMeal;
  state.metrics.mealStock = meal;
  state.metrics.cleanTrayStock = cleanTray;
  state.metrics.dirtyTrayStock = dirtyTray;
  state.metrics.drinkStock = drink;
  state.metrics.marketTradeGoodStock = tradeGood;
  state.metrics.materials = Math.max(0, state.legacyMaterialStock + rawMaterial);
}

export function hydrateStateFromSave(
  save: StationSaveEnvelopeV1,
  options?: { seed?: number }
): { state: StationState; warnings: string[] } {
  const next = createInitialState(options);
  const warnings: string[] = [];
  const snapshot = save.snapshot;
  next.now = snapshot.simTime;
  // Restore the chartered site profile if present (absent on legacy saves).
  next.site = snapshot.site;

  if (snapshot.width !== next.width || snapshot.height !== next.height) {
    throw new Error(
      `Save dimensions ${snapshot.width}x${snapshot.height} do not match current game grid ${next.width}x${next.height}.`
    );
  }
  const expectedLength = next.width * next.height;
  if (
    snapshot.tiles.length !== expectedLength ||
    snapshot.zones.length !== expectedLength ||
    snapshot.rooms.length !== expectedLength ||
    snapshot.roomHousingPolicies.length !== expectedLength
  ) {
    throw new Error('Save grid arrays are malformed for the current game grid.');
  }

  next.tiles = snapshot.tiles.slice();
  next.zones = snapshot.zones.slice();
  next.rooms = snapshot.rooms.slice();
  next.roomHousingPolicies = snapshot.roomHousingPolicies.slice();
  next.mapWorldOriginX = snapshot.mapWorldOriginX ?? 0;
  next.mapWorldOriginY = snapshot.mapWorldOriginY ?? 0;
  next.heatByTile = new Float32Array(snapshot.thermal?.heatByTile ?? new Array(expectedLength).fill(42));
  next.staleAirByTile = new Float32Array(snapshot.thermal?.staleAirByTile ?? new Array(expectedLength).fill(0));
  next.utilityUnderlay = createUtilityUnderlayFromLayers(
    expectedLength,
    snapshot.utilityUnderlay?.layers ?? {},
    snapshot.utilityUnderlay?.version ?? 0
  );
  next.dirtByTile = new Float32Array(snapshot.sanitation?.dirtByTile ?? new Array(expectedLength).fill(0));
  next.dirtSourceByTile = new Uint8Array(snapshot.sanitation?.dirtSourceByTile ?? new Array(expectedLength).fill(0));
  next.plumbing = {
    version: snapshot.plumbing?.version ?? 1,
    floodByTile: new Float32Array(snapshot.plumbing?.floodByTile ?? new Array(expectedLength).fill(0)),
    leaks: (snapshot.plumbing?.leaks ?? []).map((leak) => ({ ...leak })),
    nextLeakId: snapshot.plumbing?.nextLeakId ?? 1
  };
  next.maintenanceDebts = (snapshot.maintenance?.debts ?? []).map((entry) => ({
    ...entry,
    domain: entry.domain ?? (entry.system ? 'utility' : 'module'),
    source: entry.source ?? (entry.system ? 'idle' : 'high-load'),
    targetTile: entry.targetTile ?? entry.anchorTile,
    exterior: entry.exterior ?? false
  }));
  next.exteriorIntegrityTargets = (snapshot.maintenance?.exteriorIntegrityTargets ?? []).map((target) => ({ ...target }));
  const hydratedTier = normalizeUnlockTier(snapshot.unlocks.tier);
  // v1→v2 migration: pre-v2 saves used the old id strings (tier1_stability,
  // tier2_logistics, tier3_civic). Those won't match the new UNLOCK_IDS,
  // so unlockedIds becomes [] here. That's intentional — `tier` is the
  // source of truth for what's unlocked, and the advance pass will
  // repopulate unlockedIds as the player re-crosses each threshold.
  next.unlocks = {
    tier: hydratedTier,
    unlockedIds: UNLOCK_IDS.filter((id) => snapshot.unlocks.unlockedIds.includes(id)),
    unlockedAtSec: { ...snapshot.unlocks.unlockedAtSec },
    // triggerProgress: mark reached tier as 1.0 so the tier-advance pass
    // doesn't re-check it; future tiers stay at 0 and re-accumulate from
    // the live metrics.
    triggerProgress: { [hydratedTier]: 1 },
  };

  next.moduleInstances = [];
  next.modules = new Array<ModuleType>(expectedLength).fill(ModuleType.None);
  next.moduleOccupancyByTile = new Array<number | null>(expectedLength).fill(null);
  next.moduleSpawnCounter = 1;

  const sortedModules = [...snapshot.modules].sort((a, b) => a.originTile - b.originTile || a.type.localeCompare(b.type));
  for (const [index, module] of sortedModules.entries()) {
    const result = tryPlaceModule(next, module.type, module.originTile, module.rotation);
    if (!result.ok) {
      warnings.push(`Module ${index} (${module.type} @ ${module.originTile}) skipped: ${result.reason ?? 'invalid'}.`);
    } else if (module.purchaseCost !== undefined) {
      next.moduleInstances[next.moduleInstances.length - 1].purchaseCost = module.purchaseCost;
    }
  }
  next.commercialUnits = (snapshot.commercialUnits ?? []).map((unit) => {
    const selectedFixtures = unit.selectedOffer?.fixtures ?? [];
    const fittedModuleIds = next.moduleInstances
      .filter((module) =>
        unit.tiles.includes(module.originTile) &&
        selectedFixtures.some((fixture) => fixture.module === module.type && fixture.originTile === module.originTile)
      )
      .map((module) => module.id);
    return {
      ...unit,
      tiles: [...unit.tiles],
      offers: unit.offers.map((offer) => ({ ...offer, fixtures: offer.fixtures.map((fixture) => ({ ...fixture })) })),
      selectedOffer: unit.selectedOffer
        ? { ...unit.selectedOffer, fixtures: unit.selectedOffer.fixtures.map((fixture) => ({ ...fixture })) }
        : null,
      fittedModuleIds,
      installedFixtureCount: fittedModuleIds.length,
      currentCustomers: 0,
      presentCustomerIds: [],
      tenantStaffTiles: [...unit.tenantStaffTiles]
    };
  });
  next.commercialUnitSpawnCounter = Math.max(
    1,
    next.commercialUnits.reduce((max, unit) => Math.max(max, unit.id + 1), 1)
  );
  next.commercialOfferSpawnCounter = Math.max(
    1,
    next.commercialUnits.reduce((max, unit) => {
      const ids = [...unit.offers, ...(unit.selectedOffer ? [unit.selectedOffer] : [])].map((offer) => offer.id + 1);
      return Math.max(max, ...ids, 1);
    }, 1)
  );
  next.constructionSites = snapshot.constructionSites.map((site) => ({
    id: site.id ?? next.constructionSiteSpawnCounter++,
    kind: site.kind,
    tileIndex: site.tileIndex,
    targetTile: site.targetTile,
    targetModule: site.targetModule,
    rotation: site.rotation,
    requiredMaterials: site.requiredMaterials,
    deliveredMaterials: Math.min(site.requiredMaterials, site.deliveredMaterials),
    buildProgress: Math.min(site.buildWorkRequired, site.buildProgress),
    buildWorkRequired: site.buildWorkRequired,
    requiresEva: site.requiresEva,
    assignedCrewId: null,
    state: site.state === 'done'
      ? 'done'
      : site.deliveredMaterials >= site.requiredMaterials
        ? 'building'
        : 'planned',
    blockedReason: null,
    createdAt: next.now,
    structuralProjectId: site.structuralProjectId,
    structuralStage: site.structuralStage
  }));
  next.constructionSiteSpawnCounter = Math.max(
    next.constructionSiteSpawnCounter,
    ...next.constructionSites.map((site) => site.id + 1)
  );
  next.structuralExpansionProjects = (snapshot.structuralExpansionProjects ?? []).map((project) => ({
    ...project,
    bounds: { ...project.bounds },
    targets: project.targets.map((target) => ({ ...target })),
    childSiteIds: [...project.childSiteIds],
    completedSiteIds: [...project.completedSiteIds]
  }));
  next.structuralExpansionProjectSpawnCounter = Math.max(
    1,
    ...next.structuralExpansionProjects.map((project) => project.id + 1)
  );
  if (snapshot.mapExpansion) {
    next.mapExpansion = {
      purchased: { ...snapshot.mapExpansion.purchased },
      purchasesMade: snapshot.mapExpansion.purchasesMade
    };
  }

  next.controls.paused = true;
  tick(next, 0);

  for (const [index, dockConfig] of snapshot.dockConfigs.entries()) {
    const dock = (dockConfig.sourceKey ? next.docks.find((d) => d.sourceKey === dockConfig.sourceKey) : undefined) ??
      next.docks.find((d) => d.anchorTile === dockConfig.anchorTile || d.tiles.includes(dockConfig.anchorTile));
    if (!dock) {
      warnings.push(`Dock config ${index} (anchor ${dockConfig.anchorTile}) skipped: no matching dock.`);
      continue;
    }
    setDockPurpose(next, dock.id, dockConfig.purpose);
    const facingResult = setDockFacing(next, dock.id, dockConfig.facing);
    if (!facingResult.ok) {
      warnings.push(`Dock ${dock.id} facing ${dockConfig.facing} rejected (${facingResult.reason ?? 'invalid'}).`);
    }
    for (const shipType of SHIP_TYPES) {
      setDockAllowedShipType(next, dock.id, shipType, dockConfig.allowedShipTypes.includes(shipType));
    }
    for (const shipSize of SHIP_SIZES) {
      setDockAllowedShipSize(next, dock.id, shipSize, dockConfig.allowedShipSizes.includes(shipSize));
    }
  }

  // Apply per-berth allowlists. The Berth-room clusters were rebuilt
  // by the tick(next, 0) call above when `next.rooms` got populated;
  // this is the first chance to validate the persisted anchors against
  // a fresh cluster layout. An anchor that's no longer the lowest tile
  // of a Berth cluster gets dropped with a warning so save authors can
  // catch silent geometry drift on hand-edited saves.
  if (snapshot.berthConfigs && snapshot.berthConfigs.length > 0) {
    const validBerthAnchors = new Set<number>();
    for (let i = 0; i < next.rooms.length; i++) {
      if (next.rooms[i] !== RoomType.Berth) continue;
      // First-pass: anchor candidate is the cluster's lowest tile,
      // which we don't have direct access to here without rebuilding
      // clusters. Use the runtime helper instead — ensureBerthConfig
      // accepts any Berth-tile index and resolves to the cluster's
      // anchor at lookup-time on the next pickBerthForShip call.
      validBerthAnchors.add(i);
    }
    for (const [index, berthConfig] of snapshot.berthConfigs.entries()) {
      if (!validBerthAnchors.has(berthConfig.anchorTile)) {
        warnings.push(
          `Berth config ${index} (anchor ${berthConfig.anchorTile}) skipped: no matching berth tile.`
        );
        continue;
      }
      for (const shipType of SHIP_TYPES) {
        setBerthAllowedShipType(
          next,
          berthConfig.anchorTile,
          shipType,
          berthConfig.allowedShipTypes.includes(shipType)
        );
      }
      for (const shipSize of SHIP_SIZES) {
        setBerthAllowedShipSize(
          next,
          berthConfig.anchorTile,
          shipSize,
          berthConfig.allowedShipSizes.includes(shipSize)
        );
      }
      setBerthScreeningLevel(next, berthConfig.anchorTile, berthConfig.screeningLevel ?? 'standard');
      setBerthCustomsPolicy(next, berthConfig.anchorTile, berthConfig.customsPolicy ?? 'routine');
      const runtimeConfig = ensureBerthConfig(next, berthConfig.anchorTile);
      runtimeConfig.serviceScore = berthConfig.serviceScore ?? 50;
      runtimeConfig.serviceVisits = berthConfig.serviceVisits ?? 0;
      runtimeConfig.serviceLastDelta = berthConfig.serviceLastDelta ?? 0;
    }
  }

  tick(next, 0);

  const nodeByTile = new Map<number, StationState['itemNodes'][number]>();
  for (const node of next.itemNodes) {
    node.items = {};
    nodeByTile.set(node.tileIndex, node);
  }
  for (const [entryIndex, entry] of snapshot.inventoryByTile.entries()) {
    const node = nodeByTile.get(entry.tileIndex);
    if (!node) {
      warnings.push(`Inventory entry ${entryIndex} at tile ${entry.tileIndex} dropped: no matching inventory node.`);
      continue;
    }
    let used = 0;
    for (const itemType of ITEM_TYPES) {
      const requested = Math.max(0, entry.items[itemType] ?? 0);
      if (requested <= 0) continue;
      const remaining = Math.max(0, node.capacity - used);
      const accepted = Math.min(requested, remaining);
      if (accepted > 0) {
        node.items[itemType] = accepted;
        used += accepted;
      }
      if (accepted < requested) {
        warnings.push(
          `Inventory entry ${entryIndex} for ${itemType} at tile ${entry.tileIndex} clamped (${accepted.toFixed(2)}/${requested.toFixed(2)}).`
        );
      }
    }
  }

  next.metrics.credits = Math.max(0, snapshot.resources.credits);
  next.metrics.waterStock = Math.max(0, snapshot.resources.waterStock);
  next.metrics.airQuality = clamp(snapshot.resources.airQuality, 0, 100);
  next.legacyMaterialStock = Math.max(0, snapshot.resources.legacyMaterialStock);
  next.openingEconomy = normalizeOpeningEconomyState(snapshot.openingEconomy, warnings);
  next.serviceLog = normalizeServiceLog(snapshot.serviceLog);
  next.crew.roleCounts = snapshot.crew.roleCounts
    ? ({ ...createEmptyStaffRoleCounts(), ...snapshot.crew.roleCounts } as StaffRoleCounts)
    : next.crew.roleCounts;
  next.crew.total = totalStaffCount(next.crew.roleCounts);
  next.crew.free = next.crew.total;
  next.crew.assigned = 0;
  if (snapshot.command) {
    next.command = {
      selectedSpecialty: snapshot.command.selectedSpecialty,
      completedSpecialties: [...snapshot.command.completedSpecialties],
      specialtyProgress: {
        ...createInitialSpecialtyProgress(),
        ...snapshot.command.specialtyProgress
      },
      officers: { ...snapshot.command.officers },
      bridgeStaffing: {
        captainConsoleStaffed: false,
        activeTerminalStaff: 0,
        requiredTerminalStaff: 1
      },
      departments: createInitialDepartments()
    };
  }

  // Restore lifetime counters so predicate-driven tier progression
  // (archetypesServedLifetime is derived from archetypesEverSeen in
  // the metrics pass, so persisting the set is enough) survives reload.
  next.metrics.mealsServedTotal = snapshot.progression.mealsServedTotal;
  next.metrics.creditsEarnedLifetime = snapshot.progression.creditsEarnedLifetime;
  next.metrics.turnaroundsCompletedLifetime = snapshot.progression.turnaroundsCompletedLifetime;
  next.metrics.tradeCyclesCompletedLifetime = snapshot.progression.tradeCyclesCompletedLifetime;
  next.metrics.incidentsResolvedLifetime = snapshot.progression.incidentsResolvedLifetime;
  next.metrics.actorsTreatedLifetime = snapshot.progression.actorsTreatedLifetime;
  next.metrics.residentsConvertedLifetime = snapshot.progression.residentsConvertedLifetime;
  next.dockedShipsCompleted = snapshot.progression.dockedShipsCompleted;
  for (const archetype of VISITOR_ARCHETYPES) {
    next.usageTotals.archetypesEverSeen[archetype] = snapshot.progression.archetypesEverSeen[archetype] === true;
  }
  const savedRating = snapshot.progression.rating;
  if (savedRating) {
    next.metrics.stationRating = savedRating.score;
    next.usageTotals.ratingDelta = savedRating.delta;
    next.usageTotals.ratingFromShipTimeout = savedRating.penalties.shipTimeout;
    next.usageTotals.ratingFromShipSkip = savedRating.penalties.shipSkip;
    next.usageTotals.ratingFromVisitorFailure = savedRating.penalties.visitorFailure;
    next.usageTotals.ratingFromWalkDissatisfaction = savedRating.penalties.walkDissatisfaction;
    next.usageTotals.ratingFromRouteExposure = savedRating.penalties.routeExposure;
    next.usageTotals.ratingFromEnvironment = savedRating.penalties.environment;
    next.usageTotals.ratingFromSanitation = savedRating.penalties.sanitation;
    next.usageTotals.ratingFromResidentDeparture = savedRating.penalties.residentDeparture;
    next.usageTotals.ratingFromVisitorFailureByReason = { ...savedRating.failureReasons };
    next.usageTotals.ratingFromVisitorSuccessByReason = { ...savedRating.bonuses };
  }

  next.controls.shipsPerCycle = clamp(Math.round(snapshot.controls.shipsPerCycle), 0, 3);
  next.controls.taxRate = clamp(snapshot.controls.taxRate, 0, 0.5);
  next.controls.portAutoAdmitEnabled = snapshot.controls.portAutoAdmitEnabled ?? false;
  next.controls.portAutoAdmitPolicy = snapshot.controls.portAutoAdmitPolicy ?? 'cautious';
  next.controls.crewAutoStaffEnabled = snapshot.controls.crewAutoStaffEnabled ?? false;
  next.controls.materialAutoImportEnabled = snapshot.controls.materialAutoImportEnabled ?? next.controls.materialAutoImportEnabled;
  next.controls.materialTargetStock = clamp(snapshot.controls.materialTargetStock ?? next.controls.materialTargetStock, 0, 500);
  if (snapshot.controls.crewShiftTargets) {
    next.controls.crewShiftTargets = { ...next.controls.crewShiftTargets, ...snapshot.controls.crewShiftTargets };
  }
  if (snapshot.controls.crewWatchTargets) {
    next.controls.crewWatchTargets = snapshot.controls.crewWatchTargets.map((targets) => ({
      ...next.controls.crewShiftTargets,
      ...targets
    })) as [CrewShiftTargets, CrewShiftTargets, CrewShiftTargets];
  } else {
    next.controls.crewWatchTargets = [
      { ...next.controls.crewShiftTargets },
      { ...next.controls.crewShiftTargets },
      { ...next.controls.crewShiftTargets }
    ];
  }
  next.controls.emergencyRecallUntil = Math.max(0, snapshot.controls.emergencyRecallUntil ?? 0);
  next.controls.materialImportBatchSize = clamp(snapshot.controls.materialImportBatchSize ?? next.controls.materialImportBatchSize, 1, 160);
  next.controls.securityPosture = snapshot.controls.securityPosture ?? next.controls.securityPosture;
  next.portOps = {
    ...snapshot.portOps,
    contracts: snapshot.portOps.contracts.map((contract) => ({
      ...contract,
      promises: contract.promises.map((promise) => ({ ...promise }))
    })),
    cargoLots: snapshot.portOps.cargoLots.map((lot) => ({ ...lot })),
    settlements: snapshot.portOps.settlements.map((settlement) => ({
      ...settlement,
      promises: settlement.promises.map((promise) => ({ ...promise })),
      notes: [...settlement.notes]
    }))
  };
  next.trafficOffers = (snapshot.trafficOffers ?? []).map((offer) => ({
    ...offer,
    manifestDemand: { ...offer.manifestDemand },
    manifestMix: { ...offer.manifestMix },
    hospitalityDemand: offer.hospitalityDemand ? { ...offer.hospitalityDemand } : undefined,
    inboundCargo: { ...offer.inboundCargo },
    outboundRequest: { ...offer.outboundRequest },
    requestedServices: [...offer.requestedServices]
  }));
  for (const offer of next.trafficOffers) {
    if (offer.status !== 'cleared') continue;
    if (offer.size === 'small') {
      const dock = offer.assignedDockSourceKey
        ? next.docks.find((entry) => entry.sourceKey === offer.assignedDockSourceKey)
        : undefined;
      if (!dock) {
        warnings.push(`Cleared pod offer ${offer.callsign} lost its dock binding; returned to holding.`);
        offer.status = 'holding';
        offer.assignedDockSourceKey = null;
      }
    } else {
      const berthAnchor = offer.assignedBerthAnchor;
      if (berthAnchor === null || berthAnchor === undefined || next.rooms[berthAnchor] !== RoomType.Berth) {
        warnings.push(`Cleared berth offer ${offer.callsign} lost its berth binding; returned to holding.`);
        offer.status = 'holding';
        offer.assignedBerthAnchor = null;
      }
    }
  }
  refreshBasicInventoryMetrics(next);

  clearTransientState(next);
  const savedVisitorCountByShip = new Map<number, { stationSide: number; disembarking: number }>();
  for (const visitor of snapshot.visitors ?? []) {
    if (visitor.originShipId === null) continue;
    const counts = savedVisitorCountByShip.get(visitor.originShipId) ?? { stationSide: 0, disembarking: 0 };
    const phase = visitor.transferPhase ?? 'station';
    if (phase === 'disembark-queued' || phase === 'disembark-crossing') counts.disembarking += 1;
    else counts.stationSide += 1;
    savedVisitorCountByShip.set(visitor.originShipId, counts);
  }
  next.arrivingShips = snapshot.activePortShips.map((savedShip) => {
    const ship: ArrivingShip = {
      ...savedShip,
      bayTiles: [...savedShip.bayTiles],
      residentIds: [...savedShip.residentIds],
      manifestDemand: { ...savedShip.manifestDemand },
      manifestMix: { ...savedShip.manifestMix },
      portManifest: savedShip.portManifest ? {
        ...savedShip.portManifest,
        inboundCargo: { ...savedShip.portManifest.inboundCargo },
        outboundRequest: { ...savedShip.portManifest.outboundRequest }
      } : undefined,
      portTurnaround: savedShip.portTurnaround ? {
        ...savedShip.portTurnaround,
        clearanceJobId: null,
        outboundRequired: { ...savedShip.portTurnaround.outboundRequired },
        outboundLoaded: { ...savedShip.portTurnaround.outboundLoaded },
        fuelRequired: Math.max(0, savedShip.portTurnaround.fuelRequired ?? 0),
        fuelDelivered: Math.max(0, savedShip.portTurnaround.fuelDelivered ?? 0)
      } : undefined,
      smallCraftVisit: cloneSmallCraftVisit(savedShip.smallCraftVisit),
      approachCommitment: savedShip.approachCommitment
        ? { ...savedShip.approachCommitment, groupIds: [...savedShip.approachCommitment.groupIds] }
        : null
    };
    if (ship.assignedDockId !== null) {
      const dock = (ship.assignedDockSourceKey
        ? next.docks.find((entry) => entry.sourceKey === ship.assignedDockSourceKey)
        : undefined) ??
        // Older saves do not carry a stable source key. Their runtime id is
        // accepted only when it still resolves exactly, never substituted by
        // another nearby dock.
        next.docks.find((entry) => entry.id === ship.assignedDockId);
      if (!dock) {
        warnings.push(`Active ship ${ship.id} could not remap its dock; returned to holding.`);
        ship.assignedDockId = null;
        ship.assignedDockSourceKey = null;
        ship.assignedBerthAnchor = null;
        ship.approachCommitment = null;
        ship.queueState = 'queued';
        ship.stage = 'approach';
        ship.stageTime = 0;
      } else {
        const mount = fromIndex(dock.mountTile ?? dock.anchorTile, next.width);
        ship.assignedDockId = dock.id;
        ship.originDockId = dock.id;
        ship.assignedDockSourceKey = dock.sourceKey;
        ship.bayTiles = dock.accessTile === undefined ? [...dock.tiles] : [dock.accessTile];
        ship.bayCenterX = mount.x + 0.5;
        ship.bayCenterY = mount.y + 0.5;
      }
    }
    if (ship.assignedBerthAnchor !== null && ship.assignedBerthAnchor !== undefined && next.rooms[ship.assignedBerthAnchor] !== RoomType.Berth) {
      warnings.push(`Active ship ${ship.id} could not remap its berth; returned to holding.`);
      ship.assignedBerthAnchor = null;
      ship.assignedDockId = null;
      ship.assignedDockSourceKey = null;
      ship.approachCommitment = null;
      ship.queueState = 'queued';
      ship.stage = 'approach';
      ship.stageTime = 0;
    }
    const contract = next.portOps.contracts.find((entry) => entry.id === ship.portContractId);
    if (ship.stage === 'docked') {
      const savedVisitors = savedVisitorCountByShip.get(ship.id) ?? { stationSide: 0, disembarking: 0 };
      const hasSavedCohort = savedVisitors.stationSide > 0 || savedVisitors.disembarking > 0 || ship.passengersBoarded > 0;
      if (hasSavedCohort) {
        // Every completed arrival is either still station-side or has already
        // boarded. Ship-side queues and active inbound crossings are not yet
        // spawned and remain represented by their durable transfer phases.
        ship.passengersSpawned = Math.min(
          ship.passengersTotal,
          Math.max(0, ship.passengersBoarded + savedVisitors.stationSide)
        );
        ship.spawnCarry = 0;
      } else if (contract) {
        // Legacy saves omitted visitors entirely and retain the established
        // reconstruction behavior.
        const returned = contract.promises.find((promise) => promise.kind === 'passengers-returned');
        ship.passengersTotal = Math.max(0, (returned?.target ?? ship.passengersTotal) - (returned?.completed ?? 0));
        ship.passengersSpawned = 0;
        ship.passengersBoarded = 0;
        ship.spawnCarry = 0;
      }
    }
    if (contract && ship.stage === 'docked') {
      if (ship.portTurnaround && !ship.portTurnaround.cargoReleased) {
        ship.portTurnaround.cargoReleased = true;
        ship.portTurnaround.phase = ship.portTurnaround.inboundUnloaded + 0.05 < ship.portTurnaround.inboundTotal
          ? 'unloading'
          : 'loading';
        const inspection = contract.promises.find((promise) => promise.kind === 'inspection');
        if (inspection) inspection.completed = inspection.target;
      }
    }
    return ship;
  });
  next.shipSpawnCounter = Math.max(
    next.shipSpawnCounter,
    next.arrivingShips.reduce((max, ship) => Math.max(max, ship.id + 1), 1),
    next.trafficOffers.reduce((max, offer) => Math.max(max, offer.id + 1), 1)
  );
  reconcilePhysicalApproachCommitments(next);
  const activeShipIds = new Set(next.arrivingShips.map((ship) => ship.id));
  next.visitors = (snapshot.visitors ?? [])
    .filter((visitor) => visitor.originShipId === null || activeShipIds.has(visitor.originShipId))
    .map((visitor) => ({
      ...visitor,
      path: [],
      movementWaitReason: undefined,
      reservedServingTile: null,
      reservedTargetTile: null,
      serveTimer: undefined,
      nextPathRetryAt: undefined,
      needs: visitor.needs ? { ...visitor.needs } : undefined,
      lastRouteExposure: visitor.lastRouteExposure ? { ...visitor.lastRouteExposure } : undefined
    }));
  next.spawnCounter = Math.max(
    next.spawnCounter,
    next.visitors.reduce((max, visitor) => Math.max(max, visitor.id + 1), 1)
  );
  next.residents = (snapshot.residents ?? []).map((resident) => ({
    ...resident,
    tileIndex: clamp(Math.floor(resident.tileIndex), 0, next.tiles.length - 1),
    path: [],
    movementWaitReason: undefined,
    roleAffinity: { ...resident.roleAffinity },
    state: resident.state === ResidentState.ToHomeShip ? ResidentState.Idle : resident.state,
    reservedTargetTile: null,
    carryingMeal: resident.carryingMeal ?? false,
    reservedServingTile: null,
    serveTimer: undefined,
    homeShipId: null,
    activeIncidentId: null,
    lastRouteExposure: resident.lastRouteExposure ? { ...resident.lastRouteExposure } : undefined
  }));
  next.residentSpawnCounter = Math.max(
    next.residentSpawnCounter,
    next.residents.reduce((max, resident) => Math.max(max, resident.id + 1), 1)
  );
  next.controls.paused = true;
  tick(next, 0);

  const savedCrewMembers = snapshot.crew.members ?? [];
  const savedCrewById = new Map(savedCrewMembers.map((member) => [member.id, member]));
  const legacyCrewSpawnTiles = [
    ...next.moduleInstances
      .filter((module) => module.type === ModuleType.Bed || module.type === ModuleType.Bunk)
      .flatMap((module) => module.tiles)
      .filter((tile) => isWalkable(next.tiles[tile])),
    ...next.tiles
      .map((tile, index) => ({ tile, index }))
      .filter(({ tile, index }) =>
        isWalkable(tile) &&
        next.rooms[index] !== RoomType.Berth &&
        next.moduleOccupancyByTile[index] === null
      )
      .map(({ index }) => index)
  ];
  const uniqueLegacyCrewSpawnTiles = [...new Set(legacyCrewSpawnTiles)];
  for (const [crewIndex, crew] of next.crewMembers.entries()) {
    // A hydrated initial state allocates fresh 1..N ids before this point.
    // Saved crews can have gaps after resignations/firings, so roster order is
    // the stable fallback used to put their original identities back.
    const saved = savedCrewById.get(crew.id) ?? savedCrewMembers[crewIndex];
    if (!saved) continue;
    crew.id = saved.id;
    crew.name = saved.name;
    if (saved.staffRole !== undefined) crew.staffRole = saved.staffRole;
    if (saved.shiftBucket !== undefined) crew.shiftBucket = saved.shiftBucket;
    if (saved.recalledUntil !== undefined) crew.recalledUntil = saved.recalledUntil;
    if (saved.homeWorkplaceTile !== undefined) crew.homeWorkplaceTile = saved.homeWorkplaceTile;
    if (saved.assignedSleepTile !== undefined) crew.assignedSleepTile = saved.assignedSleepTile;
    const savedTile = saved.tileIndex;
    const restoredTile = savedTile !== undefined && isWalkable(next.tiles[savedTile])
      ? savedTile
      : uniqueLegacyCrewSpawnTiles[crewIndex % Math.max(1, uniqueLegacyCrewSpawnTiles.length)];
    if (restoredTile !== undefined) {
      const position = fromIndex(restoredTile, next.width);
      crew.tileIndex = restoredTile;
      crew.x = position.x + 0.5;
      crew.y = position.y + 0.5;
      crew.path = [];
      crew.targetTile = null;
    }
    crew.energy = saved.energy;
    crew.hunger = saved.hunger ?? 82;
    crew.hygiene = saved.hygiene;
    crew.bladder = saved.bladder;
    crew.thirst = saved.thirst;
    crew.morale = saved.morale;
    crew.missedPayrollCycles = saved.missedPayrollCycles;
    crew.needsStrainSec = saved.needsStrainSec;
    crew.resignationNoticeAt = saved.resignationNoticeAt;
    crew.airExposureSec = saved.airExposureSec;
    crew.healthState = saved.healthState;
    crew.blockedTicks = Math.max(0, Math.floor(saved.blockedTicks ?? 0));
    crew.movementReplanCooldownUntil = Math.max(0, saved.movementReplanCooldownUntil ?? 0);
    crew.activeJobId = saved.activeJobId ?? null;
    crew.carryingItemType = saved.carryingItemType ?? null;
    crew.carryingAmount = Math.max(0, saved.carryingAmount ?? 0);
  }
  restorePersistedTransportJobs(next, snapshot.transportJobs ?? [], warnings);
  next.crewSpawnCounter = Math.max(
    next.crewSpawnCounter,
    next.crewMembers.reduce((max, crew) => Math.max(max, crew.id + 1), 1)
  );
  rebuildPassengerTransfersAfterHydration(next);
  tick(next, 0);

  // The final reconciliation tick refreshes derived facility state, but it
  // also eagerly reallocates sleep slots before the restored crew records are
  // visible. Put the persisted assignment back afterward; the ordinary next
  // simulation tick remains responsible for repairing a genuinely stale slot.
  for (const crew of next.crewMembers) {
    const saved = savedCrewById.get(crew.id);
    if (saved?.assignedSleepTile !== undefined) crew.assignedSleepTile = saved.assignedSleepTile;
  }

  return {
    state: next,
    warnings
  };
}
