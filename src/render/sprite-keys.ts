import { ModuleType, RoomType, TileType, type ShipType } from '../sim/types';

// Stable sprite-key contract for external atlas pipelines (e.g. Nano Banana).
// Rendering currently falls back to marker/letter visuals when atlas assets are absent.
export const TILE_SPRITE_KEYS: Record<TileType, string> = {
  [TileType.Space]: 'tile.space',
  [TileType.Truss]: 'tile.truss',
  [TileType.Floor]: 'tile.floor',
  [TileType.Wall]: 'tile.wall',
  [TileType.Dock]: 'tile.dock',
  [TileType.Cafeteria]: 'tile.cafeteria',
  [TileType.Reactor]: 'tile.reactor',
  [TileType.Security]: 'tile.security',
  [TileType.Door]: 'tile.door',
  [TileType.Airlock]: 'tile.airlock'
};

// Wall-variant → atlas-key map. `straight` is the canonical horizontal
// orientation (east-west run); `straight.vertical` is its dedicated
// north-south counterpart — previously we rotated `straight` 90° but the
// semi-3D depth cues (top-face rim light + drop shadow south) don't
// survive rotation, so vertical walls looked broken. Separate sprite
// with rotation=0 fixes it.
export const WALL_SPRITE_VARIANT_KEYS = {
  solo: 'tile.wall.solo',
  end: 'tile.wall.end',
  straight: 'tile.wall.straight',
  'straight.vertical': 'tile.wall.straight.vertical',
  corner: 'tile.wall.corner',
  tee: 'tile.wall.tee',
  cross: 'tile.wall.cross'
} as const;

export const DOOR_SPRITE_VARIANT_KEYS = {
  horizontal: 'tile.door.horizontal',
  vertical: 'tile.door.vertical'
} as const;

export const ROOM_SPRITE_KEYS: Record<RoomType, string> = {
  [RoomType.None]: 'room.none',
  [RoomType.Bridge]: 'room.bridge',
  [RoomType.Cafeteria]: 'room.cafeteria',
  [RoomType.Kitchen]: 'room.kitchen',
  [RoomType.Workshop]: 'room.workshop',
  [RoomType.Clinic]: 'room.clinic',
  [RoomType.Brig]: 'room.brig',
  [RoomType.RecHall]: 'room.rec_hall',
  [RoomType.Reactor]: 'room.reactor',
  [RoomType.Security]: 'room.security',
  [RoomType.Dorm]: 'room.dorm',
  [RoomType.Hygiene]: 'room.hygiene',
  [RoomType.Hydroponics]: 'room.hydroponics',
  [RoomType.LifeSupport]: 'room.life_support',
  [RoomType.Lounge]: 'room.lounge',
  [RoomType.Market]: 'room.market',
  [RoomType.LogisticsStock]: 'room.logistics_stock',
  [RoomType.Storage]: 'room.storage',
  [RoomType.Maintenance]: 'room.storage',
  [RoomType.Berth]: 'room.berth',
  [RoomType.Cantina]: 'room.cantina',
  [RoomType.CommercialUnit]: 'room.commercial_unit',
  [RoomType.Observatory]: 'room.observatory'
};

export const MODULE_SPRITE_KEYS: Record<ModuleType, string> = {
  [ModuleType.None]: 'module.none',
  [ModuleType.CaptainConsole]: 'module.bridge.captain_console',
  [ModuleType.SanitationTerminal]: 'module.bridge.sanitation_terminal',
  [ModuleType.SecurityTerminal]: 'module.bridge.security_terminal',
  [ModuleType.MechanicalTerminal]: 'module.bridge.mechanical_terminal',
  [ModuleType.IndustrialTerminal]: 'module.bridge.industrial_terminal',
  [ModuleType.NavigationTerminal]: 'module.bridge.navigation_terminal',
  [ModuleType.CommsTerminal]: 'module.bridge.comms_terminal',
  [ModuleType.MedicalTerminal]: 'module.bridge.medical_terminal',
  [ModuleType.ResearchTerminal]: 'module.bridge.research_terminal',
  [ModuleType.LogisticsTerminal]: 'module.bridge.logistics_terminal',
  [ModuleType.FleetCommandTerminal]: 'module.bridge.fleet_command_terminal',
  [ModuleType.TrafficControlTerminal]: 'module.bridge.traffic_control_terminal',
  [ModuleType.ResourceManagementTerminal]: 'module.bridge.resource_management_terminal',
  [ModuleType.PowerManagementTerminal]: 'module.bridge.power_management_terminal',
  [ModuleType.LifeSupportTerminal]: 'module.bridge.life_support_terminal',
  [ModuleType.AtmosphereControlTerminal]: 'module.bridge.atmosphere_control_terminal',
  [ModuleType.AiCoreTerminal]: 'module.bridge.ai_core_terminal',
  [ModuleType.EmergencyControlTerminal]: 'module.bridge.emergency_control_terminal',
  [ModuleType.RecordsTerminal]: 'module.bridge.records_terminal',
  [ModuleType.WallLight]: 'module.wall_light',
  [ModuleType.Bed]: 'module.bed',
  [ModuleType.Bunk]: 'module.bunk',
  [ModuleType.Locker]: 'module.locker',
  [ModuleType.Table]: 'module.table',
  [ModuleType.ServingStation]: 'module.serving_station',
  [ModuleType.Fridge]: 'module.fridge',
  [ModuleType.ColdStore]: 'module.cold_store',
  [ModuleType.PrepCounter]: 'module.prep_counter',
  [ModuleType.Stove]: 'module.stove',
  [ModuleType.TrayReturn]: 'module.tray_return',
  [ModuleType.Dishwasher]: 'module.dishwasher',
  [ModuleType.Workbench]: 'module.workbench',
  [ModuleType.MedBed]: 'module.med_bed',
  [ModuleType.CellConsole]: 'module.cell_console',
  [ModuleType.RecUnit]: 'module.rec_unit',
  [ModuleType.GrowStation]: 'module.grow_station',
  [ModuleType.Terminal]: 'module.terminal',
  [ModuleType.Couch]: 'module.couch',
  [ModuleType.GameStation]: 'module.game_station',
  [ModuleType.Toilet]: 'module.toilet',
  [ModuleType.Shower]: 'module.shower',
  [ModuleType.Sink]: 'module.sink',
  [ModuleType.FloorDrain]: 'module.floor_drain',
  [ModuleType.WaterValve]: 'module.water_valve',
  [ModuleType.MarketStall]: 'module.market_stall',
  [ModuleType.IntakePallet]: 'module.intake_pallet',
  [ModuleType.StorageRack]: 'module.storage_rack',
  [ModuleType.Gangway]: 'module.gangway',
  [ModuleType.CustomsCounter]: 'module.customs_counter',
  [ModuleType.CargoArm]: 'module.cargo_arm',
  [ModuleType.FuelTank]: 'module.fuel_tank',
  [ModuleType.FuelPump]: 'module.fuel_pump',
  [ModuleType.PodDock]: 'module.pod_dock',
  [ModuleType.FuelCoupler]: 'module.fuel_coupler',
  [ModuleType.FreightLocker]: 'module.freight_locker',
  [ModuleType.MaintenanceSocket]: 'module.maintenance_socket',
  [ModuleType.BerthControl]: 'module.berth_control',
  [ModuleType.DockingClamp]: 'module.docking_clamp',
  [ModuleType.SecurityCamera]: 'module.security_camera',
  [ModuleType.AccessGate]: 'module.access_gate',
  [ModuleType.FireExtinguisher]: 'module.fire_extinguisher',
  [ModuleType.Vent]: 'module.vent',
  [ModuleType.InsulationPanel]: 'module.insulation_panel',
  [ModuleType.VendingMachine]: 'module.vending_machine',
  [ModuleType.Bench]: 'module.bench',
  [ModuleType.BarCounter]: 'module.bar_counter',
  [ModuleType.Tap]: 'module.tap',
  [ModuleType.Telescope]: 'module.telescope',
  [ModuleType.WaterFountain]: 'module.water_fountain',
  [ModuleType.Plant]: 'module.plant'
};

export const SHIP_SPRITE_KEYS: Record<ShipType, string> = {
  tourist: 'ship.tourist',
  trader: 'ship.trader',
  industrial: 'ship.industrial',
  military: 'ship.military',
  colonist: 'ship.colonist'
};
