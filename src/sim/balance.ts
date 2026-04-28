import { ModuleType, RoomType, type RoomDefinition, type RoomEnvironmentTraits, type ShipType } from './types';

export type ModuleDefinition = {
  width: number;
  height: number;
  rotatable: boolean;
  allowedRooms: RoomType[] | null;
  itemNodeCapacity?: number;
  visitorCapacity?: number;
  residentCapacity?: number;
  reservationCapacity?: number;
};

export const MODULE_DEFINITIONS: Record<ModuleType, ModuleDefinition> = {
  [ModuleType.None]: { width: 1, height: 1, rotatable: false, allowedRooms: null },
  [ModuleType.WallLight]: {
    width: 1,
    height: 1,
    rotatable: false,
    allowedRooms: null
  },
  [ModuleType.Bed]: {
    width: 2,
    height: 1,
    rotatable: true,
    allowedRooms: [RoomType.Dorm],
    residentCapacity: 2
  },
  [ModuleType.Table]: {
    width: 2,
    height: 2,
    rotatable: false,
    allowedRooms: [RoomType.Cafeteria],
    visitorCapacity: 3,
    reservationCapacity: 4
  },
  [ModuleType.ServingStation]: {
    width: 2,
    height: 1,
    rotatable: true,
    allowedRooms: [RoomType.Cafeteria],
    itemNodeCapacity: 24
  },
  [ModuleType.Stove]: {
    width: 2,
    height: 1,
    rotatable: true,
    allowedRooms: [RoomType.Kitchen],
    itemNodeCapacity: 16
  },
  [ModuleType.Workbench]: {
    width: 2,
    height: 1,
    rotatable: true,
    allowedRooms: [RoomType.Workshop],
    itemNodeCapacity: 18
  },
  [ModuleType.MedBed]: {
    width: 2,
    height: 1,
    rotatable: true,
    allowedRooms: [RoomType.Clinic]
  },
  [ModuleType.CellConsole]: {
    width: 1,
    height: 1,
    rotatable: false,
    allowedRooms: [RoomType.Brig]
  },
  [ModuleType.RecUnit]: {
    width: 2,
    height: 2,
    rotatable: false,
    allowedRooms: [RoomType.RecHall]
  },
  [ModuleType.GrowStation]: {
    width: 2,
    height: 2,
    rotatable: false,
    allowedRooms: [RoomType.Hydroponics],
    itemNodeCapacity: 18
  },
  [ModuleType.Terminal]: { width: 1, height: 1, rotatable: false, allowedRooms: [RoomType.Security] },
  [ModuleType.Couch]: { width: 2, height: 1, rotatable: true, allowedRooms: [RoomType.Lounge] },
  [ModuleType.GameStation]: { width: 2, height: 2, rotatable: false, allowedRooms: [RoomType.Lounge] },
  [ModuleType.Shower]: { width: 1, height: 1, rotatable: false, allowedRooms: [RoomType.Hygiene] },
  [ModuleType.Sink]: { width: 1, height: 1, rotatable: false, allowedRooms: [RoomType.Hygiene] },
  [ModuleType.MarketStall]: {
    width: 2,
    height: 1,
    rotatable: true,
    allowedRooms: [RoomType.Market],
    itemNodeCapacity: 20
  },
  [ModuleType.IntakePallet]: {
    width: 2,
    height: 2,
    rotatable: false,
    allowedRooms: [RoomType.LogisticsStock],
    itemNodeCapacity: 40
  },
  [ModuleType.StorageRack]: {
    width: 2,
    height: 1,
    rotatable: true,
    allowedRooms: [RoomType.Storage],
    itemNodeCapacity: 28
  },
  // Dock-migration v0: Berth capability modules. Footprints per scope.
  // T0 in v0 for testing — production wants Gangway T0, Customs T1,
  // CargoArm T2 (see MODULE_UNLOCK_TIER in sim/content/unlocks.ts).
  [ModuleType.Gangway]: {
    width: 1,
    height: 1,
    rotatable: false,
    allowedRooms: [RoomType.Berth]
  },
  [ModuleType.CustomsCounter]: {
    width: 1,
    height: 1,
    rotatable: false,
    allowedRooms: [RoomType.Berth]
  },
  [ModuleType.CargoArm]: {
    width: 2,
    height: 2,
    rotatable: false,
    allowedRooms: [RoomType.Berth]
  }
};

export const ROOM_ENVIRONMENT_TRAITS: Record<RoomType, RoomEnvironmentTraits> = {
  [RoomType.None]: { visitorStatus: 0, residentialComfort: 0, serviceNoise: 0, publicAppeal: 0 },
  [RoomType.Cafeteria]: { visitorStatus: 0.8, residentialComfort: 0.25, serviceNoise: 0.2, publicAppeal: 1.0 },
  [RoomType.Kitchen]: { visitorStatus: -0.8, residentialComfort: -0.35, serviceNoise: 1.3, publicAppeal: -0.2 },
  [RoomType.Workshop]: { visitorStatus: -1.35, residentialComfort: -0.9, serviceNoise: 2.0, publicAppeal: -0.6 },
  [RoomType.Clinic]: { visitorStatus: 0.1, residentialComfort: 0.6, serviceNoise: 0.1, publicAppeal: 0.1 },
  [RoomType.Brig]: { visitorStatus: -1.4, residentialComfort: -0.8, serviceNoise: 0.35, publicAppeal: -1.0 },
  [RoomType.RecHall]: { visitorStatus: 0.85, residentialComfort: 0.75, serviceNoise: 0.65, publicAppeal: 0.95 },
  [RoomType.Reactor]: { visitorStatus: -1.8, residentialComfort: -1.2, serviceNoise: 2.6, publicAppeal: -1.3 },
  [RoomType.Security]: { visitorStatus: -0.75, residentialComfort: -0.25, serviceNoise: 0.25, publicAppeal: -0.35 },
  [RoomType.Dorm]: { visitorStatus: -0.25, residentialComfort: 1.45, serviceNoise: 0.05, publicAppeal: -0.2 },
  [RoomType.Hygiene]: { visitorStatus: -0.45, residentialComfort: 0.55, serviceNoise: 0.15, publicAppeal: -0.25 },
  [RoomType.Hydroponics]: { visitorStatus: 0.35, residentialComfort: 0.8, serviceNoise: 0.35, publicAppeal: 0.45 },
  [RoomType.LifeSupport]: { visitorStatus: -1.25, residentialComfort: -0.8, serviceNoise: 1.7, publicAppeal: -0.95 },
  [RoomType.Lounge]: { visitorStatus: 1.35, residentialComfort: 0.8, serviceNoise: 0.15, publicAppeal: 1.5 },
  [RoomType.Market]: { visitorStatus: 1.25, residentialComfort: 0.25, serviceNoise: 0.25, publicAppeal: 1.35 },
  [RoomType.LogisticsStock]: { visitorStatus: -1.45, residentialComfort: -0.8, serviceNoise: 1.55, publicAppeal: -0.9 },
  [RoomType.Storage]: { visitorStatus: -1.15, residentialComfort: -0.6, serviceNoise: 1.1, publicAppeal: -0.65 },
  [RoomType.Berth]: { visitorStatus: -0.2, residentialComfort: -0.45, serviceNoise: 0.85, publicAppeal: 0.15 }
};

export const ROOM_DEFINITIONS: Record<RoomType, RoomDefinition> = {
  [RoomType.None]: {
    minTiles: 0,
    requiredModules: [],
    requiredAnyOf: [],
    activationChecks: { door: false, path: false, pressurization: false },
    staffedPostMode: 'none'
  },
  [RoomType.Cafeteria]: {
    minTiles: 12,
    requiredModules: [
      { module: ModuleType.ServingStation, count: 1 },
      { module: ModuleType.Table, count: 2 }
    ],
    requiredAnyOf: [],
    activationChecks: { door: true, path: true, pressurization: true },
    staffedPostMode: 'none'
  },
  [RoomType.Kitchen]: {
    minTiles: 8,
    requiredModules: [{ module: ModuleType.Stove, count: 1 }],
    requiredAnyOf: [],
    activationChecks: { door: true, path: true, pressurization: true },
    staffedPostMode: 'none'
  },
  [RoomType.Workshop]: {
    minTiles: 10,
    requiredModules: [{ module: ModuleType.Workbench, count: 1 }],
    requiredAnyOf: [],
    activationChecks: { door: true, path: true, pressurization: true },
    staffedPostMode: 'none'
  },
  [RoomType.Clinic]: {
    minTiles: 8,
    requiredModules: [{ module: ModuleType.MedBed, count: 1 }],
    requiredAnyOf: [],
    activationChecks: { door: true, path: true, pressurization: true },
    staffedPostMode: 'none'
  },
  [RoomType.Brig]: {
    minTiles: 8,
    requiredModules: [{ module: ModuleType.CellConsole, count: 1 }],
    requiredAnyOf: [],
    activationChecks: { door: true, path: true, pressurization: true },
    staffedPostMode: 'required'
  },
  [RoomType.RecHall]: {
    minTiles: 10,
    requiredModules: [{ module: ModuleType.RecUnit, count: 1 }],
    requiredAnyOf: [],
    activationChecks: { door: true, path: true, pressurization: true },
    staffedPostMode: 'none'
  },
  [RoomType.Reactor]: {
    minTiles: 4,
    requiredModules: [],
    requiredAnyOf: [],
    activationChecks: { door: true, path: true, pressurization: false },
    staffedPostMode: 'none'
  },
  [RoomType.Security]: {
    minTiles: 6,
    requiredModules: [{ module: ModuleType.Terminal, count: 1 }],
    requiredAnyOf: [],
    activationChecks: { door: true, path: true, pressurization: true },
    staffedPostMode: 'required'
  },
  [RoomType.Dorm]: {
    minTiles: 6,
    requiredModules: [{ module: ModuleType.Bed, count: 1 }],
    requiredAnyOf: [],
    activationChecks: { door: true, path: true, pressurization: true },
    staffedPostMode: 'none'
  },
  [RoomType.Hygiene]: {
    minTiles: 8,
    requiredModules: [
      { module: ModuleType.Shower, count: 1 },
      { module: ModuleType.Sink, count: 1 }
    ],
    requiredAnyOf: [],
    activationChecks: { door: true, path: true, pressurization: true },
    staffedPostMode: 'none'
  },
  [RoomType.Hydroponics]: {
    minTiles: 8,
    requiredModules: [{ module: ModuleType.GrowStation, count: 1 }],
    requiredAnyOf: [],
    activationChecks: { door: true, path: true, pressurization: true },
    staffedPostMode: 'none'
  },
  [RoomType.LifeSupport]: {
    minTiles: 6,
    requiredModules: [],
    requiredAnyOf: [],
    activationChecks: { door: true, path: true, pressurization: true },
    staffedPostMode: 'none'
  },
  [RoomType.Lounge]: {
    minTiles: 10,
    requiredModules: [],
    requiredAnyOf: [ModuleType.Couch, ModuleType.GameStation],
    activationChecks: { door: true, path: true, pressurization: true },
    staffedPostMode: 'none'
  },
  [RoomType.Market]: {
    minTiles: 10,
    requiredModules: [{ module: ModuleType.MarketStall, count: 1 }],
    requiredAnyOf: [],
    activationChecks: { door: true, path: true, pressurization: true },
    staffedPostMode: 'none'
  },
  [RoomType.LogisticsStock]: {
    minTiles: 6,
    requiredModules: [{ module: ModuleType.IntakePallet, count: 1 }],
    requiredAnyOf: [],
    activationChecks: { door: true, path: true, pressurization: true },
    staffedPostMode: 'none'
  },
  [RoomType.Storage]: {
    minTiles: 8,
    requiredModules: [{ module: ModuleType.StorageRack, count: 2 }],
    requiredAnyOf: [],
    activationChecks: { door: true, path: true, pressurization: true },
    staffedPostMode: 'none'
  },
  // Dock-migration v0: Berth is rectangular (no U-shape strict
  // validation in v0). minTiles matches BERTH_SIZE_MIN.small so any
  // valid berth qualifies for at least small ships. Activation gates
  // are loose: berths don't need a sealed pressurized envelope (ships
  // arrive through them). v1 will add U-shape + airlock primitive.
  [RoomType.Berth]: {
    // v0: minTiles lowered to 4 for testing — small berths register as
    // valid Small clusters even at 4 tiles. Production v1 will tighten
    // this back to ≥9 once shape validation lands.
    minTiles: 4,
    requiredModules: [],
    requiredAnyOf: [],
    activationChecks: { door: false, path: false, pressurization: false },
    staffedPostMode: 'none'
  }
};

// Berth size class thresholds (tile counts). Computed on demand from
// cluster length — see `berthSizeClassForArea` in sim.ts.
export const BERTH_SIZE_MIN = {
  // v0: small lowered to 4 to match relaxed minTiles. Production v1
  // restores to 9.
  small: 4,
  medium: 20,
  large: 42
} as const;

export const SERVICE_CAPACITY = {
  tableMaxDiners: MODULE_DEFINITIONS[ModuleType.Table].visitorCapacity ?? 3,
  tableReservationLimit: MODULE_DEFINITIONS[ModuleType.Table].reservationCapacity ?? 4,
  bedResidentsPerModule: MODULE_DEFINITIONS[ModuleType.Bed].residentCapacity ?? 2
} as const;

export const PROCESS_RATES = {
  hydroRawMealPerSecPerGrowStation: 1.25,
  kitchenMealPerSecPerStove: 0.95,
  workshopTradeGoodPerSecPerWorkbench: 0.4,
  workshopRawMaterialPerTradeGood: 0.85,
  marketTradeGoodUsePerVisitorPerSec: 0.32,
  clinicDistressRecoveryPerSec: 2.4
} as const;

export const SHIP_SERVICE_WEIGHT_BY_TYPE: Record<ShipType, number> = {
  tourist: 1,
  trader: 1,
  industrial: 1.15,
  military: 1.35,
  colonist: 1.2
} as const;

export const TASK_TIMINGS = {
  shipApproachSec: 2,
  shipDockedPassengerSpawnSec: 2,
  shipDepartSec: 2,
  shipMaxDockedSec: 28,
  dockQueueMaxSec: 18,
  visitorMinStaySec: 4,
  jobTtlSec: 45,
  jobStaleSec: 12,
  visitorEatBaseSec: {
    diner: 2.8,
    shopper: 2.2,
    lounger: 2.2,
    rusher: 1.4
  },
  visitorEatJitterSec: 1.2,
  visitorLeisureBaseSec: {
    diner: 2.2,
    shopper: 3.0,
    lounger: 3.4,
    rusher: 1.4
  },
  visitorLeisureJitterSec: 1.5,
  residentEatSec: 2.4,
  residentSleepSec: 3.2,
  residentCleanSec: 2.2
} as const;
