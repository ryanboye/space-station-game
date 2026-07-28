import { ModuleType, type ModuleInstance, type ModuleRotation, type StationState } from './types';

/**
 * What a depicted position on a fixture is *for*.
 *
 * Roles split three ways on purpose:
 *   - public roles ('browse', 'checkout', 'bar-service', 'meal-pickup',
 *     'reception', 'seat', 'hygiene', 'temporary-sleep') are the positions a
 *     guest physically occupies;
 *   - staff roles ('checkout-staff', 'bar-staff', 'meal-staff',
 *     'reception-staff', 'stock') are work positions a guest may never take;
 *   - a queue position is never a role here — queueing is not service, so it
 *     stays owned by the queue system rather than by the fixture.
 */
export type FacilitySlotRole =
  | 'browse'
  | 'checkout'
  | 'checkout-staff'
  | 'temporary-sleep'
  | 'stock'
  | 'bar-service'
  | 'bar-staff'
  | 'seat'
  | 'meal-pickup'
  | 'meal-staff'
  | 'reception'
  | 'reception-staff'
  | 'hygiene';

export type FacilityFace = 'north' | 'east' | 'south' | 'west';

/** Staff-only work positions. A visitor must never reserve one of these. */
export const STAFF_FACILITY_SLOT_ROLES: ReadonlySet<FacilitySlotRole> = new Set<FacilitySlotRole>([
  'checkout-staff',
  'bar-staff',
  'meal-staff',
  'reception-staff',
  'stock'
]);

export function isStaffFacilitySlotRole(role: FacilitySlotRole): boolean {
  return STAFF_FACILITY_SLOT_ROLES.has(role);
}

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
  /** null for back-of-house fixtures that deliberately have no customer edge. */
  publicUseFace: FacilityFace | null;
  stockServiceFace: FacilityFace | null;
  /**
   * Connected pieces of the same group id form ONE provider run rather than a
   * row of independent mini-providers. Only bar pieces use this today.
   */
  connectsAs?: 'bar';
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
      // The west face is the customer counter. The matching east-side slots
      // are distinct duty positions: a Steward has to physically hold one to
      // open that specific register.
      { id: 'checkout-a', role: 'checkout', x: 0, y: 1 },
      { id: 'checkout-b', role: 'checkout', x: 0, y: 3 },
      { id: 'checkout-staff-a', role: 'checkout-staff', x: 1, y: 1 },
      { id: 'checkout-staff-b', role: 'checkout-staff', x: 1, y: 3 }
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
  },

  // --- Market back-of-house -------------------------------------------------

  /**
   * The shelf's supply source. Deliberately has no public face: goods land
   * here from receiving and leave on a staff-side restock route, which is what
   * makes a badly placed backroom cross the customer floor.
   */
  [ModuleType.BackroomStockBank]: {
    module: ModuleType.BackroomStockBank,
    width: 2,
    height: 3,
    publicUseFace: null,
    stockServiceFace: 'west',
    slots: [
      { id: 'stock-a', role: 'stock', x: 0, y: 0 },
      { id: 'stock-b', role: 'stock', x: 0, y: 2 }
    ]
  },

  // --- Cantina: one connected bar run --------------------------------------

  /**
   * The main bar. West face is the guest side (four depicted stools), east
   * column is the staff lane. Corner and End pieces extend the same run.
   */
  [ModuleType.ServiceBar]: {
    module: ModuleType.ServiceBar,
    width: 2,
    height: 5,
    publicUseFace: 'west',
    stockServiceFace: 'east',
    connectsAs: 'bar',
    slots: [
      { id: 'bar-a', role: 'bar-service', x: 0, y: 0 },
      { id: 'bar-b', role: 'bar-service', x: 0, y: 1 },
      { id: 'bar-c', role: 'bar-service', x: 0, y: 2 },
      { id: 'bar-d', role: 'bar-service', x: 0, y: 3 },
      { id: 'bar-staff-a', role: 'bar-staff', x: 1, y: 1 },
      { id: 'bar-staff-b', role: 'bar-staff', x: 1, y: 3 }
    ]
  },
  /** Turns a run through 90°. Carries one guest position and one work step. */
  [ModuleType.BarCorner]: {
    module: ModuleType.BarCorner,
    width: 2,
    height: 2,
    publicUseFace: 'west',
    stockServiceFace: 'east',
    connectsAs: 'bar',
    slots: [
      { id: 'bar-corner-a', role: 'bar-service', x: 0, y: 0 },
      { id: 'bar-corner-staff', role: 'bar-staff', x: 1, y: 1 }
    ]
  },
  /** Caps a run. Adds a guest position but no extra service throughput. */
  [ModuleType.BarEnd]: {
    module: ModuleType.BarEnd,
    width: 2,
    height: 2,
    publicUseFace: 'west',
    stockServiceFace: 'east',
    connectsAs: 'bar',
    slots: [
      { id: 'bar-end-a', role: 'bar-service', x: 0, y: 0 },
      { id: 'bar-end-b', role: 'bar-service', x: 0, y: 1 }
    ]
  },

  // --- Dwell capacity (distinct from service throughput) --------------------

  /** Two booths, three seats each. Comfortable, slow, space-hungry. */
  [ModuleType.BoothBank]: {
    module: ModuleType.BoothBank,
    width: 2,
    height: 4,
    publicUseFace: 'west',
    stockServiceFace: null,
    slots: [
      { id: 'booth-a1', role: 'seat', x: 0, y: 0 },
      { id: 'booth-a2', role: 'seat', x: 1, y: 0 },
      { id: 'booth-a3', role: 'seat', x: 0, y: 1 },
      { id: 'booth-b1', role: 'seat', x: 0, y: 2 },
      { id: 'booth-b2', role: 'seat', x: 1, y: 2 },
      { id: 'booth-b3', role: 'seat', x: 0, y: 3 }
    ]
  },
  /** High density, low comfort: four short standing positions in one tile-wide strip. */
  [ModuleType.StandingRail]: {
    module: ModuleType.StandingRail,
    width: 1,
    height: 4,
    publicUseFace: 'west',
    stockServiceFace: null,
    slots: [
      { id: 'rail-a', role: 'seat', x: 0, y: 0 },
      { id: 'rail-b', role: 'seat', x: 0, y: 1 },
      { id: 'rail-c', role: 'seat', x: 0, y: 2 },
      { id: 'rail-d', role: 'seat', x: 0, y: 3 }
    ]
  },

  // --- Cafeteria at scale ---------------------------------------------------

  /** Three pickup positions against a staff lane: more throughput than two counters. */
  [ModuleType.ServingLine]: {
    module: ModuleType.ServingLine,
    width: 2,
    height: 5,
    publicUseFace: 'west',
    stockServiceFace: 'east',
    slots: [
      { id: 'serve-a', role: 'meal-pickup', x: 0, y: 1 },
      { id: 'serve-b', role: 'meal-pickup', x: 0, y: 2 },
      { id: 'serve-c', role: 'meal-pickup', x: 0, y: 3 },
      { id: 'serve-staff-a', role: 'meal-staff', x: 1, y: 1 },
      { id: 'serve-staff-b', role: 'meal-staff', x: 1, y: 3 }
    ]
  },
  /** Exactly eight depicted seats around a 3x4 table core. */
  [ModuleType.CommunityTable]: {
    module: ModuleType.CommunityTable,
    width: 3,
    height: 4,
    publicUseFace: 'west',
    stockServiceFace: null,
    slots: [
      { id: 'seat-w1', role: 'seat', x: 0, y: 0 },
      { id: 'seat-w2', role: 'seat', x: 0, y: 1 },
      { id: 'seat-w3', role: 'seat', x: 0, y: 2 },
      { id: 'seat-w4', role: 'seat', x: 0, y: 3 },
      { id: 'seat-e1', role: 'seat', x: 2, y: 0 },
      { id: 'seat-e2', role: 'seat', x: 2, y: 1 },
      { id: 'seat-e3', role: 'seat', x: 2, y: 2 },
      { id: 'seat-e4', role: 'seat', x: 2, y: 3 }
    ]
  },

  // --- Lodging, reception, hygiene -----------------------------------------

  /** Two private beds. Same claim machinery as a Bunk Bank, better comfort. */
  [ModuleType.GuestCabin]: {
    module: ModuleType.GuestCabin,
    width: 3,
    height: 4,
    publicUseFace: 'south',
    stockServiceFace: null,
    slots: [
      { id: 'cabin-bed-a', role: 'temporary-sleep', x: 0, y: 1 },
      { id: 'cabin-bed-b', role: 'temporary-sleep', x: 2, y: 1 }
    ]
  },
  /** Two processing positions. Optional infrastructure — never an arrival gate. */
  [ModuleType.ArrivalDesk]: {
    module: ModuleType.ArrivalDesk,
    width: 2,
    height: 4,
    publicUseFace: 'west',
    stockServiceFace: 'east',
    slots: [
      { id: 'reception-a', role: 'reception', x: 0, y: 1 },
      { id: 'reception-b', role: 'reception', x: 0, y: 2 },
      { id: 'reception-staff-a', role: 'reception-staff', x: 1, y: 1 },
      { id: 'reception-staff-b', role: 'reception-staff', x: 1, y: 2 }
    ]
  },
  /** Four exclusive hygiene positions sharing one plumbing spine. */
  [ModuleType.WashBank]: {
    module: ModuleType.WashBank,
    width: 2,
    height: 5,
    publicUseFace: 'west',
    stockServiceFace: 'east',
    slots: [
      { id: 'wash-a', role: 'hygiene', x: 0, y: 0 },
      { id: 'wash-b', role: 'hygiene', x: 0, y: 1 },
      { id: 'wash-c', role: 'hygiene', x: 0, y: 2 },
      { id: 'wash-d', role: 'hygiene', x: 0, y: 3 }
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
