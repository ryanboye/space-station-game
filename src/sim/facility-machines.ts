/**
 * The three physical machines a player assembles out of chunky fixtures:
 * a connected bar run, a market stock chain, and an optional reception desk.
 *
 * Everything here is derived from durable geometry and inventory. Nothing in
 * this module holds state of its own, so a save/load reconstructs all of it
 * for free — which is also why every function takes `state` and returns a
 * fresh reading rather than caching one.
 */

import {
  facilityCapacity,
  firstBlockedReason,
  freeSlotsOfRole,
  slotsOfRole,
  slotsOnModule,
  slotIsOccupied,
  type FacilityBlockedReason,
  type FacilitySlotTarget
} from './facility-slots';
import { facilityDescriptorFor } from './facility-descriptors';
import {
  ModuleType,
  RoomType,
  type ModuleInstance,
  type ShelfMix,
  type StationState
} from './types';

// ---------------------------------------------------------------------------
// Connected bar runs
// ---------------------------------------------------------------------------

export const BAR_MODULE_TYPES: readonly ModuleType[] = [
  ModuleType.ServiceBar,
  ModuleType.BarCorner,
  ModuleType.BarEnd
];

export interface BarGroup {
  /** Lowest module id in the run. Stable across ticks for chip and inspector keys. */
  id: number;
  moduleIds: number[];
  /** Depicted guest stools across the whole run. */
  guestSlots: FacilitySlotTarget[];
  /** Staff lane positions. Only ServiceBar and BarCorner contribute these. */
  staffSlots: FacilitySlotTarget[];
  /** Tiles that belong to the run, for chip placement and stock pooling. */
  tiles: number[];
  /** Origin tiles that carry drink stock. */
  stockTiles: number[];
}

/** Do two placed modules share at least one footprint edge? */
function modulesTouch(a: ModuleInstance, b: ModuleInstance, width: number): boolean {
  const aTiles = new Set(a.tiles);
  for (const tile of b.tiles) {
    const x = tile % width;
    if (aTiles.has(tile - width) || aTiles.has(tile + width)) return true;
    if (x > 0 && aTiles.has(tile - 1)) return true;
    if (x < width - 1 && aTiles.has(tile + 1)) return true;
  }
  return false;
}

/**
 * Group touching bar pieces into single providers.
 *
 * This is the whole point of Corner and End pieces: five connected segments
 * are one bar with one queue and one pooled stock, not five mini-bars each
 * pretending to be a venue.
 */
export function barGroups(state: StationState): BarGroup[] {
  const pieces = state.moduleInstances.filter(
    (module) => facilityDescriptorFor(module.type)?.connectsAs === 'bar'
  );
  if (pieces.length === 0) return [];

  // Union-find over edge adjacency.
  const parent = new Map<number, number>();
  const find = (id: number): number => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let cursor = id;
    while (parent.get(cursor) !== root) {
      const next = parent.get(cursor)!;
      parent.set(cursor, root);
      cursor = next;
    }
    return root;
  };
  for (const piece of pieces) parent.set(piece.id, piece.id);
  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      if (!modulesTouch(pieces[i], pieces[j], state.width)) continue;
      const rootA = find(pieces[i].id);
      const rootB = find(pieces[j].id);
      if (rootA === rootB) continue;
      // Always merge toward the lowest id so a run's group id is stable
      // whatever order the player placed its segments in.
      const merged = Math.min(rootA, rootB);
      parent.set(rootA, merged);
      parent.set(rootB, merged);
    }
  }

  const byRoot = new Map<number, ModuleInstance[]>();
  for (const piece of pieces) {
    const root = find(piece.id);
    const list = byRoot.get(root) ?? [];
    list.push(piece);
    byRoot.set(root, list);
  }

  const groups: BarGroup[] = [];
  for (const [root, modules] of byRoot) {
    modules.sort((a, b) => a.id - b.id);
    groups.push({
      id: root,
      moduleIds: modules.map((module) => module.id),
      guestSlots: modules.flatMap((module) => slotsOnModule(state, module, 'bar-service')),
      staffSlots: modules.flatMap((module) => slotsOnModule(state, module, 'bar-staff')),
      tiles: modules.flatMap((module) => module.tiles),
      stockTiles: modules.map((module) => module.originTile)
    });
  }
  return groups.sort((a, b) => a.id - b.id);
}

/** The run that owns this tile, if any. */
export function barGroupAtTile(state: StationState, tileIndex: number): BarGroup | null {
  return barGroups(state).find((group) => group.tiles.includes(tileIndex)) ?? null;
}

export interface BarGroupStatus {
  group: BarGroup;
  /** Guest stools not currently held. */
  freeGuestSlots: number;
  /** Staff lane positions a steward is physically standing on. */
  staffedPositions: number;
  /** Pooled drink stock across every segment of the run. */
  stock: number;
  /** Service sessions per unit time this run can sustain. */
  serviceCapacity: number;
  /** Dwell positions in the same room: booths, rails and legacy seating. */
  dwellCapacity: number;
  blockedReason: FacilityBlockedReason | null;
}

/** Drink stock pooled across a whole run rather than per segment. */
export function barGroupStock(state: StationState, group: BarGroup): number {
  let total = 0;
  for (const tile of group.stockTiles) {
    const node = state.itemNodes.find((entry) => entry.tileIndex === tile);
    total += Math.max(0, node?.items.rawMaterial ?? 0);
  }
  return total;
}

/**
 * Seats and standing positions that can hold a drinker for a leisure dwell.
 *
 * Counted separately from service capacity on purpose: more seating lets more
 * people stay, it never makes the bar pour faster.
 */
export function dwellSlotsInRoom(state: StationState, room: RoomType): FacilitySlotTarget[] {
  return slotsOfRole(state, [ModuleType.BoothBank, ModuleType.StandingRail, ModuleType.CommunityTable], 'seat')
    .filter((slot) => state.rooms[slot.tileIndex] === room);
}

export function barGroupStatus(state: StationState, group: BarGroup, stewards: number): BarGroupStatus {
  const stock = barGroupStock(state, group);
  const freeGuestSlots = group.guestSlots.filter((slot) => !slotIsOccupied(state, slot.tileIndex)).length;
  const staffedPositions = group.staffSlots.filter((slot) => slotIsOccupied(state, slot.tileIndex)).length;
  const room = state.rooms[group.tiles[0]] ?? RoomType.Cantina;
  const dwellCapacity = dwellSlotsInRoom(state, room).length;
  // A longer bar only serves more people when the extra length brought both a
  // guest position and a staff position that somebody is standing in.
  const serviceCapacity = Math.min(group.guestSlots.length, Math.max(stewards, staffedPositions) * 2);
  return {
    group,
    freeGuestSlots,
    staffedPositions,
    stock,
    serviceCapacity,
    dwellCapacity,
    blockedReason: firstBlockedReason({
      'no-stock': stock < 0.16,
      'no-staff': stewards <= 0 && staffedPositions <= 0,
      'no-free-provider': freeGuestSlots <= 0,
      'no-free-seat': dwellCapacity <= 0
    })
  };
}

// ---------------------------------------------------------------------------
// Shelf mixes
// ---------------------------------------------------------------------------

export interface ShelfMixProfile {
  mix: ShelfMix;
  label: string;
  /** Multiplies how attractive this shelf is to a shopper looking for it. */
  demandAppeal: number;
  /** Multiplies sale price. Gifts carry, technical stock sells slowly but rich. */
  marginMultiplier: number;
  /** Which visitor preferences this category actually satisfies. */
  satisfies: readonly string[];
}

/**
 * Three broad mixes with genuinely different economics. None is dominant: the
 * essentials shelf sells to everyone at a thin margin, gifts sell to fewer
 * people for more, technical supplies sell rarely but carry the best margin.
 */
export const SHELF_MIXES: Record<ShelfMix, ShelfMixProfile> = {
  essentials: { mix: 'essentials', label: 'Essentials', demandAppeal: 1, marginMultiplier: 1, satisfies: ['market', 'cafeteria'] },
  gifts: { mix: 'gifts', label: 'Gifts', demandAppeal: 0.82, marginMultiplier: 1.34, satisfies: ['market', 'lounge'] },
  technical: { mix: 'technical', label: 'Technical', demandAppeal: 0.6, marginMultiplier: 1.62, satisfies: ['market'] }
};

export function shelfMixOf(module: ModuleInstance): ShelfMixProfile {
  return SHELF_MIXES[module.shelfMix ?? 'essentials'];
}

/**
 * How well the station's stocked shelves cover what a shopper wants.
 *
 * Returns 0 when nothing suitable is stocked, which is what stops the game
 * praising a selection that does not exist.
 */
export function shelfAppealFor(state: StationState, preference: string): number {
  let best = 0;
  for (const module of state.moduleInstances) {
    if (module.type !== ModuleType.ShelfAisle) continue;
    const node = state.itemNodes.find((entry) => entry.tileIndex === module.originTile);
    if ((node?.items.tradeGood ?? 0) < 0.95) continue;
    const profile = shelfMixOf(module);
    if (!profile.satisfies.includes(preference)) continue;
    best = Math.max(best, profile.demandAppeal);
  }
  return best;
}

/** Every stocked shelf, best appeal first, for routing a shopper. */
export function stockedShelfSlots(state: StationState, preference?: string): FacilitySlotTarget[] {
  const stocked = new Set<number>();
  const appealByOrigin = new Map<number, number>();
  for (const module of state.moduleInstances) {
    if (module.type !== ModuleType.ShelfAisle) continue;
    const node = state.itemNodes.find((entry) => entry.tileIndex === module.originTile);
    if ((node?.items.tradeGood ?? 0) < 0.95) continue;
    const profile = shelfMixOf(module);
    if (preference && !profile.satisfies.includes(preference)) continue;
    stocked.add(module.originTile);
    appealByOrigin.set(module.originTile, profile.demandAppeal);
  }
  return freeSlotsOfRole(state, [ModuleType.ShelfAisle], 'browse')
    .filter((slot) => stocked.has(slot.moduleOriginTile))
    .sort(
      (a, b) =>
        (appealByOrigin.get(b.moduleOriginTile) ?? 0) - (appealByOrigin.get(a.moduleOriginTile) ?? 0) ||
        a.tileIndex - b.tileIndex
    );
}

// ---------------------------------------------------------------------------
// The market stock chain
// ---------------------------------------------------------------------------

export interface MarketChainStatus {
  /** Units waiting at receiving (freight lockers and intake pallets). */
  receiving: number;
  /** Units held in Backroom Stock Banks. */
  backroom: number;
  /** Units on shelves, the only stock a shopper can actually buy. */
  shelves: number;
  backroomCapacity: number;
  shelfCapacity: number;
  /** Registers that a worker is physically holding open. */
  staffedRegisters: number;
  registers: number;
  blockedReason: FacilityBlockedReason | null;
}

function stockAt(state: StationState, tiles: readonly number[]): number {
  let total = 0;
  for (const tile of tiles) {
    const node = state.itemNodes.find((entry) => entry.tileIndex === tile);
    total += Math.max(0, node?.items.tradeGood ?? 0);
  }
  return total;
}

function capacityAt(state: StationState, tiles: readonly number[]): number {
  let total = 0;
  for (const tile of tiles) {
    const node = state.itemNodes.find((entry) => entry.tileIndex === tile);
    total += Math.max(0, node?.capacity ?? 0);
  }
  return total;
}

export function backroomOrigins(state: StationState): number[] {
  return state.moduleInstances
    .filter((module) => module.type === ModuleType.BackroomStockBank)
    .map((module) => module.originTile);
}

export function shelfOrigins(state: StationState): number[] {
  return state.moduleInstances
    .filter((module) => module.type === ModuleType.ShelfAisle)
    .map((module) => module.originTile);
}

export function receivingOrigins(state: StationState): number[] {
  return state.moduleInstances
    .filter((module) => module.type === ModuleType.IntakePallet || module.type === ModuleType.StorageRack)
    .map((module) => module.originTile);
}

export function marketChainStatus(state: StationState): MarketChainStatus {
  const backroom = backroomOrigins(state);
  const shelves = shelfOrigins(state);
  const receiving = receivingOrigins(state);
  const registerSlots = slotsOfRole(state, [ModuleType.CheckoutBank], 'checkout');
  const staffSlots = slotsOfRole(state, [ModuleType.CheckoutBank], 'checkout-staff');
  const shelfStock = stockAt(state, shelves);
  const staffedRegisters = staffSlots.filter((slot) => slotIsOccupied(state, slot.tileIndex)).length;
  return {
    receiving: stockAt(state, receiving),
    backroom: stockAt(state, backroom),
    shelves: shelfStock,
    backroomCapacity: capacityAt(state, backroom),
    shelfCapacity: capacityAt(state, shelves),
    staffedRegisters,
    registers: registerSlots.length,
    blockedReason: firstBlockedReason({
      'no-stock': shelfStock < 0.95,
      'no-staff': registerSlots.length > 0 && staffedRegisters <= 0,
      'no-free-provider':
        registerSlots.length > 0 && registerSlots.every((slot) => slotIsOccupied(state, slot.tileIndex))
    })
  };
}

// ---------------------------------------------------------------------------
// Reception
// ---------------------------------------------------------------------------

export interface ReceptionStatus {
  /** Customer-facing processing positions across every Arrival Desk. */
  processors: number;
  freeProcessors: number;
  /** Staff positions a worker is physically holding. */
  staffed: number;
  blockedReason: FacilityBlockedReason | null;
}

export function receptionStatus(state: StationState): ReceptionStatus {
  const processors = slotsOfRole(state, [ModuleType.ArrivalDesk], 'reception');
  const staffSlots = slotsOfRole(state, [ModuleType.ArrivalDesk], 'reception-staff');
  const staffed = staffSlots.filter((slot) => slotIsOccupied(state, slot.tileIndex)).length;
  const freeProcessors = processors.filter((slot) => !slotIsOccupied(state, slot.tileIndex)).length;
  return {
    processors: processors.length,
    freeProcessors,
    staffed,
    // A full or unstaffed desk is never a hard block: arrivals simply bypass it.
    blockedReason: firstBlockedReason({
      'no-staff': processors.length > 0 && staffed <= 0,
      'no-free-provider': processors.length > 0 && freeProcessors <= 0
    })
  };
}

/** Free reception positions a newly arrived guest could walk up to. */
export function freeReceptionSlots(state: StationState): FacilitySlotTarget[] {
  const staffSlots = slotsOfRole(state, [ModuleType.ArrivalDesk], 'reception-staff');
  const staffedModules = new Set(
    staffSlots.filter((slot) => slotIsOccupied(state, slot.tileIndex)).map((slot) => slot.moduleId)
  );
  // An unstaffed desk processes nobody, so it is not offered as a destination.
  return freeSlotsOfRole(state, [ModuleType.ArrivalDesk], 'reception').filter((slot) =>
    staffedModules.has(slot.moduleId)
  );
}

/** Capacity readout for one facility, shared by chips and the inspector. */
export function fixtureCapacityReport(state: StationState, module: ModuleInstance): ReturnType<typeof facilityCapacity> | null {
  const descriptor = facilityDescriptorFor(module.type);
  if (!descriptor) return null;
  const publicRoles = [...new Set(descriptor.slots.map((slot) => slot.role))].filter(
    (role) => role !== 'checkout-staff' && role !== 'bar-staff' && role !== 'meal-staff' && role !== 'reception-staff' && role !== 'stock'
  );
  const staffRoles = [...new Set(descriptor.slots.map((slot) => slot.role))].filter(
    (role) => role === 'checkout-staff' || role === 'bar-staff' || role === 'meal-staff' || role === 'reception-staff' || role === 'stock'
  );
  return facilityCapacity(state, module, publicRoles, staffRoles);
}
