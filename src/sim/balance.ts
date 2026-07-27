import { ModuleType, RoomType, type FacilityActivityKind, type RoomDefinition, type RoomEnvironmentTraits, type ShipType } from './types';

export type ModuleDefinition = {
  width: number;
  height: number;
  rotatable: boolean;
  allowedRooms: RoomType[] | null;
  mount?: 'floor' | 'wall';
  itemNodeCapacity?: number;
  storageClass?: 'intake' | 'cold' | 'prep' | 'cooking' | 'serving' | 'dish' | 'ambient' | 'fuel' | 'port';
  facilityActivities?: FacilityActivityKind[];
  visitorCapacity?: number;
  residentCapacity?: number;
  reservationCapacity?: number;
  /** Optional capital price. Unspecified modules retain the footprint fallback. */
  capitalCost?: number;
};

const BRIDGE_TERMINAL: ModuleDefinition = {
  width: 2,
  height: 2,
  rotatable: true,
  allowedRooms: [RoomType.Bridge],
  reservationCapacity: 1
};

export const MODULE_DEFINITIONS: Record<ModuleType, ModuleDefinition> = {
  [ModuleType.None]: { width: 1, height: 1, rotatable: false, allowedRooms: null },
  [ModuleType.CaptainConsole]: BRIDGE_TERMINAL,
  [ModuleType.SanitationTerminal]: BRIDGE_TERMINAL,
  [ModuleType.SecurityTerminal]: BRIDGE_TERMINAL,
  [ModuleType.MechanicalTerminal]: BRIDGE_TERMINAL,
  [ModuleType.IndustrialTerminal]: BRIDGE_TERMINAL,
  [ModuleType.NavigationTerminal]: BRIDGE_TERMINAL,
  [ModuleType.CommsTerminal]: BRIDGE_TERMINAL,
  [ModuleType.MedicalTerminal]: BRIDGE_TERMINAL,
  [ModuleType.ResearchTerminal]: BRIDGE_TERMINAL,
  [ModuleType.LogisticsTerminal]: BRIDGE_TERMINAL,
  [ModuleType.FleetCommandTerminal]: BRIDGE_TERMINAL,
  [ModuleType.TrafficControlTerminal]: BRIDGE_TERMINAL,
  [ModuleType.ResourceManagementTerminal]: BRIDGE_TERMINAL,
  [ModuleType.PowerManagementTerminal]: BRIDGE_TERMINAL,
  [ModuleType.LifeSupportTerminal]: BRIDGE_TERMINAL,
  [ModuleType.AtmosphereControlTerminal]: BRIDGE_TERMINAL,
  [ModuleType.AiCoreTerminal]: BRIDGE_TERMINAL,
  [ModuleType.EmergencyControlTerminal]: BRIDGE_TERMINAL,
  [ModuleType.RecordsTerminal]: BRIDGE_TERMINAL,
  [ModuleType.WallLight]: {
    width: 1,
    height: 1,
    rotatable: false,
    allowedRooms: null,
    mount: 'wall'
  },
  [ModuleType.Bed]: {
    width: 2,
    height: 1,
    rotatable: true,
    allowedRooms: [RoomType.Dorm],
    residentCapacity: 1
  },
  [ModuleType.Bunk]: {
    width: 2,
    height: 1,
    rotatable: true,
    allowedRooms: [RoomType.Dorm],
    residentCapacity: 2
  },
  [ModuleType.BunkBank]: {
    width: 2,
    height: 4,
    rotatable: true,
    allowedRooms: [RoomType.Dorm],
    capitalCost: 150
  },
  [ModuleType.Locker]: {
    width: 1,
    height: 1,
    rotatable: false,
    allowedRooms: [RoomType.Dorm]
  },
  [ModuleType.Table]: {
    width: 2,
    height: 2,
    rotatable: false,
    allowedRooms: [RoomType.Cafeteria],
    // The 2x2 artwork contains four visible seats. Each footprint tile is one
    // exclusive usage position, so the rendered and simulated capacity agree.
    visitorCapacity: 4,
    reservationCapacity: 4,
    // OPEN-04: seating and counters are priced explicitly rather than by
    // footprint, so the three opening recipes cost comparable money.
    capitalCost: 80
  },
  [ModuleType.ServingStation]: {
    width: 2,
    height: 1,
    rotatable: true,
    allowedRooms: [RoomType.Cafeteria],
    itemNodeCapacity: 60,
    storageClass: 'serving',
    facilityActivities: ['serve'],
    capitalCost: 50
  },
  [ModuleType.Fridge]: {
    width: 1,
    height: 1,
    rotatable: false,
    allowedRooms: [RoomType.Kitchen, RoomType.Storage],
    itemNodeCapacity: 42,
    storageClass: 'cold'
  },
  [ModuleType.ColdStore]: {
    width: 2,
    height: 2,
    rotatable: false,
    allowedRooms: [RoomType.Kitchen, RoomType.Storage],
    itemNodeCapacity: 132,
    storageClass: 'cold'
  },
  [ModuleType.PrepCounter]: {
    width: 2,
    height: 1,
    rotatable: true,
    allowedRooms: [RoomType.Kitchen],
    itemNodeCapacity: 18,
    storageClass: 'prep',
    facilityActivities: ['prep']
  },
  [ModuleType.Stove]: {
    width: 2,
    height: 1,
    rotatable: true,
    allowedRooms: [RoomType.Kitchen],
    itemNodeCapacity: 20,
    storageClass: 'cooking',
    facilityActivities: ['cook']
  },
  [ModuleType.TrayReturn]: {
    width: 1,
    height: 1,
    rotatable: false,
    allowedRooms: [RoomType.Cafeteria],
    itemNodeCapacity: 30,
    storageClass: 'dish',
    facilityActivities: ['dishwash']
  },
  [ModuleType.Dishwasher]: {
    width: 2,
    height: 1,
    rotatable: true,
    allowedRooms: [RoomType.Kitchen, RoomType.Cafeteria],
    itemNodeCapacity: 36,
    storageClass: 'dish',
    facilityActivities: ['dishwash']
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
  [ModuleType.Toilet]: { width: 1, height: 1, rotatable: false, allowedRooms: [RoomType.Hygiene], facilityActivities: ['toilet'] },
  [ModuleType.Shower]: { width: 1, height: 1, rotatable: false, allowedRooms: [RoomType.Hygiene], facilityActivities: ['shower'] },
  [ModuleType.Sink]: { width: 1, height: 1, rotatable: false, allowedRooms: [RoomType.Hygiene, RoomType.Kitchen], facilityActivities: ['wash'] },
  [ModuleType.FloorDrain]: {
    width: 1,
    height: 1,
    rotatable: false,
    allowedRooms: [RoomType.Hygiene, RoomType.Kitchen, RoomType.Cafeteria]
  },
  [ModuleType.WaterValve]: {
    width: 1,
    height: 1,
    rotatable: false,
    allowedRooms: [RoomType.Hygiene, RoomType.Kitchen, RoomType.LifeSupport]
  },
  [ModuleType.MarketStall]: {
    width: 2,
    height: 1,
    rotatable: true,
    allowedRooms: [RoomType.Market],
    // A starter counter can hold its opening display plus one 12-unit pod
    // delivery, so restocking is a planning choice rather than a capacity trap.
    itemNodeCapacity: 32,
    capitalCost: 50
  },
  [ModuleType.CheckoutBank]: {
    width: 2,
    height: 5,
    rotatable: true,
    allowedRooms: [RoomType.Market],
    capitalCost: 180
  },
  [ModuleType.ShelfAisle]: {
    width: 1,
    height: 4,
    rotatable: true,
    allowedRooms: [RoomType.Market],
    itemNodeCapacity: 72,
    storageClass: 'ambient',
    capitalCost: 90
  },
  [ModuleType.IntakePallet]: {
    width: 2,
    height: 2,
    rotatable: false,
    allowedRooms: [RoomType.LogisticsStock],
    itemNodeCapacity: 48,
    storageClass: 'intake'
  },
  [ModuleType.StorageRack]: {
    width: 2,
    height: 1,
    rotatable: true,
    allowedRooms: [RoomType.Storage],
    itemNodeCapacity: 108,
    storageClass: 'ambient'
  },
  // Berth capability hardware. Room paint stays free; these capital fixtures
  // make a berth operational and define what it can service.
  [ModuleType.Gangway]: {
    width: 1,
    height: 1,
    rotatable: false,
    allowedRooms: [RoomType.Berth],
    capitalCost: 140
  },
  [ModuleType.CustomsCounter]: {
    width: 1,
    height: 1,
    rotatable: false,
    allowedRooms: [RoomType.Berth],
    capitalCost: 90
  },
  [ModuleType.CargoArm]: {
    width: 2,
    height: 2,
    rotatable: false,
    allowedRooms: [RoomType.Berth],
    itemNodeCapacity: 64,
    storageClass: 'port',
    capitalCost: 270
  },
  [ModuleType.FuelTank]: {
    width: 2,
    height: 2,
    rotatable: false,
    allowedRooms: [RoomType.Maintenance],
    itemNodeCapacity: 160,
    storageClass: 'fuel',
    // OPEN-04: opening-business hardware is priced against OPENING_BALANCE so
    // Feed Travelers, Sell Supplies and Service Ships cost comparable money.
    capitalCost: 60
  },
  [ModuleType.FuelPump]: {
    width: 2,
    height: 1,
    rotatable: true,
    allowedRooms: [RoomType.Berth],
    // The small buffer is only a handoff point. Fuel is consumed by the ship
    // as soon as a logistics delivery reaches the pump.
    itemNodeCapacity: 8,
    storageClass: 'fuel',
    capitalCost: 180
  },
  [ModuleType.PodDock]: {
    width: 2,
    height: 1,
    rotatable: true,
    allowedRooms: null,
    mount: 'wall',
    capitalCost: 110
  },
  [ModuleType.FuelCoupler]: {
    width: 1,
    height: 1,
    rotatable: false,
    allowedRooms: null,
    mount: 'wall',
    capitalCost: 35
  },
  [ModuleType.FreightLocker]: {
    width: 2,
    height: 1,
    rotatable: true,
    allowedRooms: null,
    mount: 'wall',
    capitalCost: 85
  },
  [ModuleType.MaintenanceSocket]: {
    width: 2,
    height: 1,
    rotatable: true,
    allowedRooms: null,
    mount: 'wall',
    capitalCost: 110
  },
  [ModuleType.BerthControl]: {
    width: 2,
    height: 2,
    rotatable: false,
    allowedRooms: [RoomType.Berth],
    capitalCost: 210
  },
  [ModuleType.DockingClamp]: {
    width: 1,
    height: 1,
    rotatable: false,
    allowedRooms: [RoomType.Berth],
    capitalCost: 100
  },
  [ModuleType.SecurityCamera]: {
    width: 1,
    height: 1,
    rotatable: false,
    allowedRooms: null,
    mount: 'wall'
  },
  [ModuleType.AccessGate]: {
    width: 1,
    height: 1,
    rotatable: false,
    allowedRooms: null
  },
  // Fire extinguisher: passive sprinkler-style suppression. Reduces fire intensity
  // each tick within FIRE_EXTINGUISHER_RADIUS tiles. Allowed in any room — players
  // sprinkle them around critical areas (reactor, life-support, kitchen).
  [ModuleType.FireExtinguisher]: {
    width: 1,
    height: 1,
    rotatable: false,
    allowedRooms: null,
    mount: 'wall'
  },
  [ModuleType.Vent]: {
    width: 1,
    height: 1,
    rotatable: false,
    allowedRooms: null,
    mount: 'wall'
  },
  [ModuleType.InsulationPanel]: {
    width: 1,
    height: 1,
    rotatable: false,
    allowedRooms: null,
    mount: 'wall'
  },
  [ModuleType.VendingMachine]: {
    width: 1,
    height: 1,
    rotatable: false,
    allowedRooms: [RoomType.Cafeteria, RoomType.Lounge, RoomType.Market, RoomType.RecHall]
  },
  [ModuleType.Bench]: {
    width: 2,
    height: 1,
    rotatable: true,
    allowedRooms: [RoomType.Cafeteria, RoomType.Lounge, RoomType.Market, RoomType.RecHall, RoomType.Cantina, RoomType.Observatory]
  },
  [ModuleType.BarCounter]: {
    width: 2,
    height: 1,
    rotatable: true,
    allowedRooms: [RoomType.Cantina],
    itemNodeCapacity: 12
  },
  [ModuleType.Tap]: {
    width: 1,
    height: 1,
    rotatable: false,
    allowedRooms: [RoomType.Cantina]
  },
  [ModuleType.Telescope]: {
    width: 2,
    height: 2,
    rotatable: false,
    allowedRooms: [RoomType.Observatory],
    visitorCapacity: 2
  },
  [ModuleType.WaterFountain]: {
    width: 1,
    height: 1,
    rotatable: false,
    allowedRooms: null
  },
  [ModuleType.Plant]: {
    width: 1,
    height: 1,
    rotatable: false,
    allowedRooms: null
  },
  [ModuleType.ReactorCore]: {
    width: 2,
    height: 2,
    rotatable: false,
    allowedRooms: [RoomType.Reactor],
    capitalCost: 120
  },
  // Solar panel: 1x1, place-on-floor (no wall mount), allowed in any room so
  // the player can chase bright tiles. Passive power source — see the solar
  // supply term in sim.ts.
  [ModuleType.SolarPanel]: {
    width: 1,
    height: 1,
    rotatable: false,
    allowedRooms: null
  }
};

export const ROOM_ENVIRONMENT_TRAITS: Record<RoomType, RoomEnvironmentTraits> = {
  [RoomType.None]: { visitorStatus: 0, residentialComfort: 0, serviceNoise: 0, publicAppeal: 0 },
  [RoomType.Bridge]: { visitorStatus: -0.4, residentialComfort: -0.05, serviceNoise: 0.45, publicAppeal: 0.25 },
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
  [RoomType.Maintenance]: { visitorStatus: -1.5, residentialComfort: -0.95, serviceNoise: 1.7, publicAppeal: -0.9 },
  [RoomType.Berth]: { visitorStatus: -0.2, residentialComfort: -0.45, serviceNoise: 0.85, publicAppeal: 0.15 },
  [RoomType.Cantina]: { visitorStatus: 1.5, residentialComfort: 0.55, serviceNoise: 0.5, publicAppeal: 1.65 },
  [RoomType.CommercialUnit]: { visitorStatus: 0.1, residentialComfort: 0, serviceNoise: 0, publicAppeal: 0.2 },
  [RoomType.Observatory]: { visitorStatus: 1.7, residentialComfort: 1.1, serviceNoise: 0.05, publicAppeal: 1.6 }
};

export const ROOM_DEFINITIONS: Record<RoomType, RoomDefinition> = {
  [RoomType.None]: {
    minTiles: 0,
    requiredModules: [],
    requiredAnyOf: [],
    activationChecks: { door: false, path: false, pressurization: false },
    staffedPostMode: 'none'
  },
  [RoomType.Bridge]: {
    minTiles: 8,
    requiredModules: [{ module: ModuleType.CaptainConsole, count: 1 }],
    requiredAnyOf: [],
    activationChecks: { door: true, path: true, pressurization: true },
    staffedPostMode: 'none'
  },
  [RoomType.Cafeteria]: {
    minTiles: 12,
    // One table, not two. A counter plus somewhere to sit is a working mess;
    // a second table is throughput, and shared contract C3 asks for capacity
    // to come from fixtures rather than a room-wide on/off switch. This is
    // also what lets OPEN-01 give the starter crew a food buffer without
    // pre-building the Feed Travelers business: the minimum operating room
    // used to be that recipe exactly, so the starter could not have one
    // without having the other.
    requiredModules: [
      { module: ModuleType.ServingStation, count: 1 },
      { module: ModuleType.Table, count: 1 }
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
    requiredModules: [{ module: ModuleType.ReactorCore, count: 1 }],
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
    requiredModules: [],
    requiredAnyOf: [ModuleType.Bed, ModuleType.Bunk, ModuleType.BunkBank],
    activationChecks: { door: true, path: true, pressurization: true },
    staffedPostMode: 'none'
  },
  [RoomType.Hygiene]: {
    minTiles: 8,
    requiredModules: [
      { module: ModuleType.Toilet, count: 1 },
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
    // Life support must be able to commission a sealed, connected expansion.
    // Requiring pressure here creates a circular dependency: the room cannot
    // supply air until the room already has air.
    activationChecks: { door: true, path: true, pressurization: false },
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
    requiredModules: [],
    requiredAnyOf: [ModuleType.MarketStall, ModuleType.CheckoutBank],
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
  [RoomType.Maintenance]: {
    minTiles: 6,
    requiredModules: [{ module: ModuleType.FuelTank, count: 1 }],
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
  },
  [RoomType.Cantina]: {
    minTiles: 8,
    requiredModules: [{ module: ModuleType.BarCounter, count: 1 }],
    requiredAnyOf: [],
    activationChecks: { door: true, path: true, pressurization: true },
    staffedPostMode: 'none'
  },
  [RoomType.CommercialUnit]: {
    minTiles: 10,
    requiredModules: [],
    requiredAnyOf: [],
    activationChecks: { door: true, path: true, pressurization: true },
    staffedPostMode: 'none'
  },
  [RoomType.Observatory]: {
    minTiles: 9,
    requiredModules: [{ module: ModuleType.Telescope, count: 1 }],
    requiredAnyOf: [],
    activationChecks: { door: true, path: true, pressurization: true },
    staffedPostMode: 'none'
  }
};

// Berth size class thresholds (tile counts). Computed on demand from
// cluster length — see `berthSizeClassForArea` in sim.ts.
export const BERTH_SIZE_MIN = {
  // v0: small lowered to 4 to match relaxed minTiles. Production v1
  // restores to 9.
  small: 4,
  // Contract traffic begins at medium size. A canonical 4x3 starter bay
  // must therefore qualify, or the first berth the player can reasonably
  // build is a dead-end that cannot accept any manifest.
  medium: 12,
  large: 42
} as const;

export const SERVICE_CAPACITY = {
  tableMaxDiners: MODULE_DEFINITIONS[ModuleType.Table].visitorCapacity ?? 3,
  tableReservationLimit: MODULE_DEFINITIONS[ModuleType.Table].reservationCapacity ?? 4,
  bedResidentsPerModule: MODULE_DEFINITIONS[ModuleType.Bed].residentCapacity ?? 2
} as const;

/**
 * How a berth call settles (opening ticket 09).
 *
 * A turnaround used to pay its access and handling components in full even
 * when most of its promised services were missed, so a station could compound
 * capital while its hospitality was failing. These constants put that payout
 * at risk in proportion to the promises the station actually kept.
 */
/**
 * OPEN-04. Every number the opening decision depends on, in one place.
 *
 * Targets from `01-player-authored-opening.md`: one starter recipe should cost
 * 55-70% of opening cash, two must not both be affordable at once, and access
 * fees must cover part of payroll without funding growth on their own.
 */
export interface OpeningStockBatch {
  units: number;
  costCredits: number;
}

export const OPENING_BALANCE: {
  startingCredits: number;
  podAccessFeeCredits: number;
  courierHandlingFeePerUnit: number;
  /** Meals reserved for the starter crew mess before public meal service opens. */
  crewMessMealReserve: number;
  preparedMealBatch: OpeningStockBatch;
  travelSupplyBatch: OpeningStockBatch;
  fuelLot: OpeningStockBatch;
} = {
  /** Cash a chartered station opens with. */
  startingCredits: 220,
  /** Basic pod access fee, per call. Recoverable, never a growth engine. */
  podAccessFeeCredits: 3,
  /** Per-unit fee for handling consigned courier freight. */
  courierHandlingFeePerUnit: 1.5,
  /** Five crew can eat before the player chooses a public hospitality business. */
  crewMessMealReserve: 30,
  /** Opening stock batches, priced so each recipe lands in the target band. */
  preparedMealBatch: { units: 12, costCredits: 70 },
  travelSupplyBatch: { units: 12, costCredits: 80 },
  fuelLot: { units: 40, costCredits: 50 }
};

export const PORT_SETTLEMENT = {
  /** Share of the settled payout forfeited by a completely unserved call. */
  shortfallPenaltyShare: 0.85,
  /** A ruined call can cost money, but never more than this share of its value. */
  maxNetLossShare: 0.25
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
  // Crowd-loop v1: meals take long enough to SEE — tables stay visibly
  // occupied and the room reads as inhabited during a pulse.
  visitorEatBaseSec: {
    diner: 6.5,
    shopper: 5.0,
    lounger: 5.0,
    rusher: 3.0
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

/** Visit clocks are centralized so Phase 1A can be tuned without touching port logic. */
export const VISIT_TIMINGS = {
  shoreMinSec: 105,
  contractMinSec: 190,
  extendedMinSec: 300,
  boardingLeadSec: 20,
  recallAssemblySec: 3,
  extensionSec: 75
} as const;
