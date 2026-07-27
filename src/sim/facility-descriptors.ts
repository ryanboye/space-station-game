import { ModuleType, type ModuleInstance, type ModuleRotation, type StationState } from './types';

export type FacilitySlotRole = 'browse' | 'checkout' | 'temporary-sleep';
export type FacilityFace = 'north' | 'east' | 'south' | 'west';

export interface FacilitySlotDescriptor {
  id: string;
  role: FacilitySlotRole;
  x: number;
  y: number;
}

/**
 * Describes the player-facing and service-facing sides of a chunky fixture.
 * Coordinates are local to the unrotated footprint. Runtime slots are derived
 * from this data, never inferred from every occupied footprint tile.
 */
export interface FacilityFixtureDescriptor {
  module: ModuleType;
  width: number;
  height: number;
  publicUseFace: FacilityFace;
  stockServiceFace: FacilityFace | null;
  slots: readonly FacilitySlotDescriptor[];
}

export interface ResolvedFacilitySlot extends FacilitySlotDescriptor {
  tileIndex: number;
}

export const FACILITY_FIXTURE_DESCRIPTORS: Readonly<Partial<Record<ModuleType, FacilityFixtureDescriptor>>> = {
  [ModuleType.CheckoutBank]: {
    module: ModuleType.CheckoutBank,
    width: 2,
    height: 5,
    publicUseFace: 'west',
    stockServiceFace: 'east',
    slots: [
      { id: 'checkout-a', role: 'checkout', x: 0, y: 1 },
      { id: 'checkout-b', role: 'checkout', x: 0, y: 3 }
    ]
  },
  [ModuleType.ShelfAisle]: {
    module: ModuleType.ShelfAisle,
    width: 1,
    height: 4,
    publicUseFace: 'west',
    stockServiceFace: 'east',
    slots: [
      { id: 'browse-a', role: 'browse', x: 0, y: 0 },
      { id: 'browse-b', role: 'browse', x: 0, y: 1 },
      { id: 'browse-c', role: 'browse', x: 0, y: 2 }
    ]
  },
  [ModuleType.BunkBank]: {
    module: ModuleType.BunkBank,
    width: 2,
    height: 4,
    publicUseFace: 'south',
    stockServiceFace: null,
    slots: [
      { id: 'bunk-a', role: 'temporary-sleep', x: 0, y: 0 },
      { id: 'bunk-b', role: 'temporary-sleep', x: 1, y: 0 },
      { id: 'bunk-c', role: 'temporary-sleep', x: 0, y: 2 },
      { id: 'bunk-d', role: 'temporary-sleep', x: 1, y: 2 }
    ]
  }
};

export function facilityDescriptorFor(module: ModuleType): FacilityFixtureDescriptor | null {
  return FACILITY_FIXTURE_DESCRIPTORS[module] ?? null;
}

export function rotateFacilityFace(face: FacilityFace, rotation: ModuleRotation): FacilityFace {
  if (rotation === 0) return face;
  switch (face) {
    case 'north': return 'east';
    case 'east': return 'south';
    case 'south': return 'west';
    case 'west': return 'north';
  }
}

export function resolveFacilitySlots(module: ModuleInstance, stationWidth: number): ResolvedFacilitySlot[] {
  const descriptor = facilityDescriptorFor(module.type);
  if (!descriptor) return [];
  const originX = module.originTile % stationWidth;
  const originY = Math.floor(module.originTile / stationWidth);
  return descriptor.slots.map((slot) => {
    const { x, y } = orientedSlotPosition(descriptor, slot, module.rotation);
    return {
      ...slot,
      x,
      y,
      tileIndex: (originY + y) * stationWidth + originX + x
    };
  });
}

/** The same rotated slot contract expressed through a placed module's tiles. */
export function facilityUsageTilesForModule(module: ModuleInstance): number[] {
  const descriptor = facilityDescriptorFor(module.type);
  if (!descriptor) return [];
  return descriptor.slots
    .map((slot) => orientedSlotPosition(descriptor, slot, module.rotation))
    .map((slot) => module.tiles[slot.y * module.width + slot.x])
    .filter((tile): tile is number => tile !== undefined);
}

function orientedSlotPosition(
  descriptor: FacilityFixtureDescriptor,
  slot: FacilitySlotDescriptor,
  rotation: ModuleRotation
): { x: number; y: number } {
  if (rotation === 0) return { x: slot.x, y: slot.y };
  return { x: descriptor.height - 1 - slot.y, y: slot.x };
}

export function facilitySlotsForRole(
  state: StationState,
  moduleTypes: readonly ModuleType[],
  role: FacilitySlotRole
): ResolvedFacilitySlot[] {
  const wanted = new Set(moduleTypes);
  return state.moduleInstances
    .filter((module) => wanted.has(module.type))
    .flatMap((module) => resolveFacilitySlots(module, state.width).filter((slot) => slot.role === role))
    .sort((a, b) => a.tileIndex - b.tileIndex || a.id.localeCompare(b.id));
}
