import { ModuleType, RoomType, type UnlockDefinition, type UnlockState, type UnlockTier } from '../types';

export const UNLOCK_DEFINITIONS: UnlockDefinition[] = [
  {
    id: 'tier1_stability',
    tier: 1,
    name: 'Stability',
    description: 'Unlock lounge and market after base life support and meal service are stable.'
  },
  {
    id: 'tier2_logistics',
    tier: 2,
    name: 'Logistics',
    description: 'Unlock logistics stock, storage, and workshop once economy and hauling stabilize.'
  },
  {
    id: 'tier3_civic',
    tier: 3,
    name: 'Civic',
    description: 'Unlock advanced civic/security loop and specialized ships.'
  }
];

export const ROOM_UNLOCK_TIER: Record<RoomType, UnlockTier> = {
  [RoomType.None]: 0,
  [RoomType.Cafeteria]: 0,
  [RoomType.Kitchen]: 0,
  [RoomType.Workshop]: 2,
  [RoomType.Clinic]: 3,
  [RoomType.Brig]: 3,
  [RoomType.RecHall]: 3,
  [RoomType.Reactor]: 0,
  [RoomType.Security]: 3,
  [RoomType.Dorm]: 0,
  [RoomType.Hygiene]: 0,
  [RoomType.Hydroponics]: 0,
  [RoomType.LifeSupport]: 0,
  [RoomType.Lounge]: 1,
  [RoomType.Market]: 1,
  [RoomType.LogisticsStock]: 2,
  [RoomType.Storage]: 2
};

export const MODULE_UNLOCK_TIER: Record<ModuleType, UnlockTier> = {
  [ModuleType.None]: 0,
  [ModuleType.Bed]: 0,
  [ModuleType.Table]: 0,
  [ModuleType.ServingStation]: 0,
  [ModuleType.Stove]: 0,
  [ModuleType.Workbench]: 2,
  [ModuleType.MedBed]: 3,
  [ModuleType.CellConsole]: 3,
  [ModuleType.RecUnit]: 3,
  [ModuleType.GrowStation]: 0,
  [ModuleType.Terminal]: 3,
  [ModuleType.Couch]: 1,
  [ModuleType.GameStation]: 1,
  [ModuleType.Shower]: 0,
  [ModuleType.Sink]: 0,
  [ModuleType.MarketStall]: 1,
  [ModuleType.IntakePallet]: 2,
  [ModuleType.StorageRack]: 2
};

export function createInitialUnlockState(): UnlockState {
  return {
    tier: 0,
    unlockedIds: [],
    unlockedAtSec: {}
  };
}

export function isRoomUnlockedAtTier(room: RoomType, tier: UnlockTier): boolean {
  return tier >= ROOM_UNLOCK_TIER[room];
}

export function isModuleUnlockedAtTier(module: ModuleType, tier: UnlockTier): boolean {
  return tier >= MODULE_UNLOCK_TIER[module];
}
