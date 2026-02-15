import { ModuleType, RoomType, type RoomDefinition } from './types';

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
  }
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
    staffedPostMode: 'none'
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
  }
};

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
  marketTradeGoodUsePerVisitorPerSec: 0.32
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

export function normalizeModuleType(module: ModuleType): ModuleType {
  return module === ModuleType.GrowTray ? ModuleType.GrowStation : module;
}
