// initial-state.ts — extracted from sim.ts.
//
// Owns createInitialState: the deterministic factory for a fresh
// StationState. Pure construction — paints the starter hull, captain
// console module, baseline metrics, controls, effects, counters, and
// caches; consumes state.rng draws via generateLaneProfiles to keep
// seeded scenarios identical to pre-extraction behavior.
//
// Constraints (preserved verbatim from sim.ts):
//   - state.rng() call count and order must match pre-extraction.
//   - generateLaneProfiles still consumes the primary rng even when
//     system-map weights are used (placeholder draws, see sim.ts).
//   - Starter layout, modules, metrics defaults, controls, RNG setup
//     unchanged.
//
// Public API: createInitialState is re-exported from sim.ts so existing
// callers (save.ts, scenarios.ts, sim-tests.ts, sim-perf.ts, etc.) keep
// working without an import-site rewrite.

import { MODULE_DEFINITIONS } from './balance';
import {
  createInitialDepartments,
  createInitialSpecialtyProgress,
  createInitialStaffRoleCounts,
  totalStaffCount
} from './content/command';
import { createInitialUnlockState } from './content/unlocks';
import { MAP_CONDITION_VERSION } from './map-conditions';
import { createEmptyUtilityUnderlay } from './utility-underlay';
import {
  CREW_PRIORITY_PRESET_WEIGHTS,
  CYCLE_DURATION,
  STARTING_CREDITS,
  STARTING_SUPPLIES,
  STATION_RATING_START,
  cloneCrewPriorityWeights,
  createEmptyDerivedCache,
  createJobCountsByItem,
  createJobCountsByType,
  createReservationCounts,
  createWorkforceLaneMetrics,
  generateLaneProfiles
} from './sim';
import { generateSystemMap } from './system-map';
import {
  GRID_HEIGHT,
  GRID_WIDTH,
  type HousingPolicy,
  type ItemType,
  type ModuleInstance,
  type ModuleRotation,
  ModuleType,
  RoomType,
  type StationState,
  TileType,
  ZoneType,
  makeRng,
  toIndex
} from './types';

export function createInitialState(options?: {
  seed?: number;
  physicalStarterInventory?: boolean;
  manualTrafficAdmission?: boolean;
}): StationState {
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
  const moduleInstances: ModuleInstance[] = [];
  let initialModuleSpawnCounter = 1;
  const addStarterModule = (type: ModuleType, x: number, y: number, rotation: ModuleRotation = 0): void => {
    const def = MODULE_DEFINITIONS[type];
    const width = rotation === 90 ? def.height : def.width;
    const height = rotation === 90 ? def.width : def.height;
    const originTile = toIndex(x, y, GRID_WIDTH);
    const instance: ModuleInstance = {
      id: initialModuleSpawnCounter++,
      type,
      originTile,
      rotation,
      width,
      height,
      tiles: []
    };
    for (let yy = y; yy < y + height; yy++) {
      for (let xx = x; xx < x + width; xx++) {
        const idx = toIndex(xx, yy, GRID_WIDTH);
        modules[idx] = type;
        moduleOccupancyByTile[idx] = instance.id;
        instance.tiles.push(idx);
      }
    }
    moduleInstances.push(instance);
  };
  const coreX = Math.floor(GRID_WIDTH / 2);
  const coreY = Math.floor(GRID_HEIGHT / 2);
  const starterFloorMinX = coreX - 11;
  const starterFloorMaxX = coreX + 10;
  const starterFloorMinY = coreY - 9;
  const starterFloorMaxY = coreY + 8;
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

  // Port-operations starter: every functional room is an enclosed pod
  // separated from every other zone by walls and a public circulation deck.
  // This makes doors, travel distance, staffing and cargo movement readable
  // from the first frame instead of presenting one large pre-zoned rectangle.
  const paintEnclosedRoom = (
    room: RoomType,
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    doorX: number,
    doorY: number,
    floor: TileType = TileType.Floor
  ): void => {
    for (let y = minY - 1; y <= maxY + 1; y++) {
      for (let x = minX - 1; x <= maxX + 1; x++) {
        const idx = toIndex(x, y, GRID_WIDTH);
        const boundary = x === minX - 1 || x === maxX + 1 || y === minY - 1 || y === maxY + 1;
        tiles[idx] = boundary ? TileType.Wall : floor;
        rooms[idx] = boundary ? RoomType.None : room;
      }
    }
    const door = toIndex(doorX, doorY, GRID_WIDTH);
    tiles[door] = TileType.Door;
    rooms[door] = room;
  };

  // Command and life support face the north gallery.
  paintEnclosedRoom(RoomType.Bridge, coreX - 8, coreY - 7, coreX - 3, coreY - 4, coreX - 5, coreY - 3);
  for (let y = coreY - 7; y <= coreY - 4; y++) {
    for (let x = coreX - 8; x <= coreX - 3; x++) roomHousingPolicies[toIndex(x, y, GRID_WIDTH)] = 'crew';
  }
  addStarterModule(ModuleType.CaptainConsole, coreX - 7, coreY - 6, 0);

  paintEnclosedRoom(RoomType.LifeSupport, coreX + 2, coreY - 7, coreX + 6, coreY - 4, coreX + 4, coreY - 3);

  // Engineering and cargo intake face the south service gallery. Their
  // opposite placement creates an immediate, visible hauling distance.
  paintEnclosedRoom(RoomType.Reactor, coreX - 8, coreY + 2, coreX - 4, coreY + 5, coreX - 6, coreY + 1, TileType.Reactor);
  paintEnclosedRoom(RoomType.LogisticsStock, coreX + 1, coreY + 3, coreX + 4, coreY + 6, coreX + 2, coreY + 2);
  addStarterModule(ModuleType.IntakePallet, coreX + 1, coreY + 4, 0);
  paintEnclosedRoom(RoomType.Storage, coreX + 6, coreY + 3, coreX + 9, coreY + 6, coreX + 7, coreY + 2);
  addStarterModule(ModuleType.StorageRack, coreX + 6, coreY + 4, 0);
  addStarterModule(ModuleType.StorageRack, coreX + 8, coreY + 4, 0);
  addStarterModule(ModuleType.StorageRack, coreX + 7, coreY + 5, 0);

  // A minimal food loop, not an empty tutorial promise. Both rooms are fully
  // enclosed, open onto the south gallery through a single door, and remain
  // separated by circulation space. Their cramped footprints are intentional:
  // one stove, one serving counter and one table handle the first ship only.
  paintEnclosedRoom(RoomType.Kitchen, coreX - 8, coreY, coreX - 4, coreY, coreX - 3, coreY);
  addStarterModule(ModuleType.Stove, coreX - 7, coreY, 0);
  paintEnclosedRoom(RoomType.Cafeteria, coreX + 3, coreY, coreX + 8, coreY + 1, coreX + 2, coreY);
  addStarterModule(ModuleType.ServingStation, coreX + 3, coreY, 0);
  addStarterModule(ModuleType.Table, coreX + 6, coreY, 0);

  // The berth is a hull-side work deck: walls on three sides, a sealed
  // station door to the west, and an open east edge where ships physically
  // meet the station. It is deliberately separate from the intake room.
  const berthMinX = starterWallMaxX + 1;
  const berthMaxX = berthMinX + 5;
  const berthMinY = coreY - 2;
  const berthMaxY = coreY + 2;
  for (let x = berthMinX - 1; x <= berthMaxX; x++) {
    tiles[toIndex(x, berthMinY - 1, GRID_WIDTH)] = TileType.Wall;
    tiles[toIndex(x, berthMaxY + 1, GRID_WIDTH)] = TileType.Wall;
  }
  for (let y = berthMinY; y <= berthMaxY; y++) {
    for (let x = berthMinX; x <= berthMaxX; x++) {
      const idx = toIndex(x, y, GRID_WIDTH);
      tiles[idx] = TileType.Dock;
      rooms[idx] = RoomType.Berth;
    }
  }
  const berthDoor = toIndex(berthMinX - 1, coreY, GRID_WIDTH);
  tiles[berthDoor] = TileType.Door;
  rooms[berthDoor] = RoomType.Berth;
  addStarterModule(ModuleType.CustomsCounter, berthMinX + 1, berthMinY + 1, 0);
  addStarterModule(ModuleType.CargoArm, berthMaxX - 1, berthMaxY - 1, 0);
  addStarterModule(ModuleType.Gangway, berthMaxX, coreY, 0);

  // Construction stock begins as physical inventory in the authored intake
  // and store rooms. The old invisible global pool remains only as a save
  // migration fallback; a fresh game must preserve and route actual stock.
  let starterMaterialsRemaining = STARTING_SUPPLIES;
  const itemNodes = moduleInstances
    .filter((module) => (MODULE_DEFINITIONS[module.type]?.itemNodeCapacity ?? 0) > 0)
    .sort((a, b) => a.originTile - b.originTile)
    .map((module) => {
      const capacity = MODULE_DEFINITIONS[module.type].itemNodeCapacity ?? 0;
      // Starter construction stock belongs in Intake / Storage. Seeding every
      // item node used to fill the berth cargo arm before the first ship and
      // silently discarded its manifest cargo.
      const starterStockNode = module.type === ModuleType.IntakePallet || module.type === ModuleType.StorageRack;
      const rawMaterial = options?.physicalStarterInventory && starterStockNode
        ? Math.min(capacity, starterMaterialsRemaining)
        : 0;
      starterMaterialsRemaining -= rawMaterial;
      const items: Partial<Record<ItemType, number>> = {};
      if (rawMaterial > 0) items.rawMaterial = rawMaterial;
      // The cafeteria opens with a small visible meal buffer. It prevents the
      // first five passengers from arriving to a dead station while still
      // exhausting quickly enough to expose the production/logistics loop.
      if (module.type === ModuleType.ServingStation) items.meal = 10;
      if (module.type === ModuleType.Stove) items.rawMeal = 6;
      return {
        tileIndex: module.originTile,
        capacity,
        items
      };
    });

  const frameTiles: number[] = [toIndex(coreX, coreY, GRID_WIDTH)];
  const laneProfiles = generateLaneProfiles({ rng, system } as StationState);

  return {
    width: GRID_WIDTH,
    height: GRID_HEIGHT,
    tiles,
    zones,
    rooms,
    roomHousingPolicies,
    modules,
    moduleInstances,
    moduleOccupancyByTile,
    core: {
      centerTile: toIndex(coreX, coreY, GRID_WIDTH),
      serviceTile: toIndex(coreX, coreY, GRID_WIDTH),
      frameTiles
    },
    docks: [],
    berthConfigs: [],
    system,
    seedAtCreation: seed,
    mapWorldOriginX: 0,
    mapWorldOriginY: 0,
    laneProfiles,
    dockQueue: [],
    trafficOffers: [],
    pressurized: new Array<boolean>(GRID_WIDTH * GRID_HEIGHT).fill(false),
    airQualityByTile: new Float32Array(GRID_WIDTH * GRID_HEIGHT).fill(100),
    heatByTile: new Float32Array(GRID_WIDTH * GRID_HEIGHT).fill(42),
    staleAirByTile: new Float32Array(GRID_WIDTH * GRID_HEIGHT),
    utilityUnderlay: createEmptyUtilityUnderlay(GRID_WIDTH * GRID_HEIGHT),
    dirtByTile: new Float32Array(GRID_WIDTH * GRID_HEIGHT),
    dirtSourceByTile: new Uint8Array(GRID_WIDTH * GRID_HEIGHT),
    mapConditionVersion: MAP_CONDITION_VERSION,
    pathOccupancyByTile: new Map(),
    jobs: [],
    reservations: [],
    constructionSites: [],
    itemNodes,
    legacyMaterialStock: options?.physicalStarterInventory ? starterMaterialsRemaining : STARTING_SUPPLIES,
    incidents: [],
    visitors: [],
    residents: [],
    crewMembers: [],
    command: {
      selectedSpecialty: null,
      completedSpecialties: [],
      specialtyProgress: createInitialSpecialtyProgress(),
      officers: {},
      bridgeStaffing: {
        captainConsoleStaffed: false,
        activeTerminalStaff: 0,
        requiredTerminalStaff: 1
      },
      departments: createInitialDepartments()
    },
    maintenanceDebts: [],
    arrivingShips: [],
    pendingSpawns: [],
    metrics: {
      frameMs: 0,
      rafJankMs: 0,
      rafDroppedFrames: 0,
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
      reputationPrestigeAvg: 0,
      reputationNotorietyAvg: 0,
      reputationControlAvg: 0,
      reputationCrimePressureAvg: 0,
      reputationHighRiskZones: 0,
      reputationTopZone: 'none',
      reputationPremiumDemandBonusPct: 0,
      reputationRiskyDemandBonusPct: 0,
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
      materials: STARTING_SUPPLIES,
      materialAutoImportStatus: 'target met',
      materialAutoImportLastAdded: 0,
      materialAutoImportCreditCost: 0,
      credits: STARTING_CREDITS,
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
      visitsThisCycle: 0,
      visitFailuresThisCycle: 0,
      visitRevenueThisCycle: 0,
      visitorExitStalled: false,
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
      activeReservations: 0,
      reservationFailures: 0,
      expiredReservations: 0,
      reservationsByKind: createReservationCounts(),
      logisticsAverageBatchSize: 0,
      logisticsJobMilesPerMin: 0,
      logisticsBlockedReason: 'none',
      jobBoard: {
        open: 0,
        assigned: 0,
        blocked: 0,
        stale: 0,
        averageAgeSec: 0,
        averageBatchSize: 0,
        labels: []
      },
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
      workforceLanes: createWorkforceLaneMetrics(),
      workforceBorrowedCrew: 0,
      workforceHighestPressureLane: null,
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
      residentConversionLastResult: 'waiting for eligible visitor exit',
      residentConversionLastChancePct: 0,
      residentConversionLastShip: 'none',
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
      thermalAvg: 0,
      thermalMax: 0,
      hotTiles: 0,
      staleAirTiles: 0,
      coolingLoad: 0,
      airNetworkCount: 0,
      airNetworkPoweredVents: 0,
      airNetworkUnpoweredVents: 0,
      disconnectedAirDuctTiles: 0,
      averageAirNetworkDistance: 0,
      thermalPenaltyPerMin: 0,
      thermalPenaltyTotal: 0,
      maintenanceDebtAvg: 0,
      maintenanceDebtMax: 0,
      maintenanceJobsOpen: 0,
      maintenanceJobsResolvedPerMin: 0,
      sanitationAvg: 0,
      sanitationMax: 0,
      dirtyTiles: 0,
      filthyTiles: 0,
      sanitationJobsOpen: 0,
      sanitationJobsCompletedPerMin: 0,
      sanitationPenaltyPerMin: 0,
      sanitationPenaltyTotal: 0,
      sanitationTopSource: 'none',
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
      manualTrafficAdmission: options?.manualTrafficAdmission ?? false,
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
      // Port-ops mode acquires materials through admitted physical freighters;
      // invisible periodic imports would bypass the entire berth/logistics loop.
      materialAutoImportEnabled: !(options?.manualTrafficAdmission ?? false),
      materialTargetStock: 120,
      materialImportBatchSize: 25,
      securityPosture: 'standard',
      crewPriorityPreset: 'balanced',
      crewPriorityWeights: cloneCrewPriorityWeights(CREW_PRIORITY_PRESET_WEIGHTS.balanced),
      crewShiftTargets: {
        food: 1,
        sanitation: 0,
        engineering: 1,
        logistics: 1,
        'construction-eva': 0,
        flex: 0
      }
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
    moduleSpawnCounter: initialModuleSpawnCounter,
    jobSpawnCounter: 1,
    reservationSpawnCounter: 1,
    constructionSiteSpawnCounter: 1,
    incidentSpawnCounter: 1,
    incidentHeat: 0,
    lastPayrollAt: 0,
    lastResidentTaxAt: 0,
    recentExitTimes: [],
    recentVisitLedger: [],
    incidentMemory: [],
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
      residentConversionLastResult: 'waiting for eligible visitor exit',
      residentConversionLastChancePct: 0,
      residentConversionLastShip: 'none',
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
      thermalPenalty: 0,
      maintenanceJobsResolved: 0,
      sanitationJobsResolved: 0,
      ratingFromSanitation: 0,
      residentSanitationStress: 0,
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
      total: totalStaffCount(createInitialStaffRoleCounts()),
      assigned: 0,
      free: totalStaffCount(createInitialStaffRoleCounts()),
      roleCounts: createInitialStaffRoleCounts()
    },
    ops: {
      bridgeTotal: 0,
      bridgeActive: 0,
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
