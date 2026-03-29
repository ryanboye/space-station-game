import { ModuleType, RoomType, TileType, type ShipType } from '../sim/types';

// Stable sprite-key contract for external atlas pipelines (e.g. Nano Banana).
// Rendering currently falls back to marker/letter visuals when atlas assets are absent.
export const TILE_SPRITE_KEYS: Record<TileType, string> = {
  [TileType.Space]: 'tile.space',
  [TileType.Floor]: 'tile.floor',
  [TileType.Wall]: 'tile.wall',
  [TileType.Dock]: 'tile.dock',
  [TileType.Cafeteria]: 'tile.cafeteria',
  [TileType.Reactor]: 'tile.reactor',
  [TileType.Security]: 'tile.security',
  [TileType.Door]: 'tile.door'
};

export const WALL_SPRITE_VARIANT_KEYS = {
  solo: 'tile.wall.solo',
  end: 'tile.wall.end',
  straight: 'tile.wall.straight',
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
  [RoomType.Storage]: 'room.storage'
};

export const MODULE_SPRITE_KEYS: Record<ModuleType, string> = {
  [ModuleType.None]: 'module.none',
  [ModuleType.WallLight]: 'module.wall_light',
  [ModuleType.Bed]: 'module.bed',
  [ModuleType.Table]: 'module.table',
  [ModuleType.ServingStation]: 'module.serving_station',
  [ModuleType.Stove]: 'module.stove',
  [ModuleType.Workbench]: 'module.workbench',
  [ModuleType.MedBed]: 'module.med_bed',
  [ModuleType.CellConsole]: 'module.cell_console',
  [ModuleType.RecUnit]: 'module.rec_unit',
  [ModuleType.GrowStation]: 'module.grow_station',
  [ModuleType.Terminal]: 'module.terminal',
  [ModuleType.Couch]: 'module.couch',
  [ModuleType.GameStation]: 'module.game_station',
  [ModuleType.Shower]: 'module.shower',
  [ModuleType.Sink]: 'module.sink',
  [ModuleType.MarketStall]: 'module.market_stall',
  [ModuleType.IntakePallet]: 'module.intake_pallet',
  [ModuleType.StorageRack]: 'module.storage_rack'
};

export const SHIP_SPRITE_KEYS: Record<ShipType, string> = {
  tourist: 'ship.tourist',
  trader: 'ship.trader',
  industrial: 'ship.industrial',
  military: 'ship.military',
  colonist: 'ship.colonist'
};
