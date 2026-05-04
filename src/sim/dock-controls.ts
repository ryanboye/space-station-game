// dock-controls.ts — extracted from sim.ts.
//
// Owns the public dock + berth control APIs (set dock purpose / facing
// / allowed types / sizes; lookup by tile; berth-per-anchor config).
// All call sites in main.ts and save.ts hit these via the sim.ts
// barrel re-export, so the public surface stays unchanged.

import {
  bumpDockVersion,
  ensureDockByTileCache,
  isShipTypeUnlocked,
  laneFromFacing,
  shipSizesUpTo,
  validateDockPlacementAt,
  validateDockPlacementWithNeighbors as _validateDockPlacementWithNeighbors
} from './sim';
import {
  type BerthConfig,
  type DockEntity,
  type DockPurpose,
  RoomType,
  type ShipSize,
  type ShipType,
  type SpaceLane,
  type StationState
} from './types';

export function setDockPlacementFacing(state: StationState, facing: SpaceLane): void {
  state.controls.dockPlacementFacing = facing;
}

export function getDockByTile(state: StationState, tileIndex: number): DockEntity | null {
  ensureDockByTileCache(state);
  return state.derived.dockByTile.get(tileIndex) ?? null;
}

export function setDockPurpose(state: StationState, dockId: number, purpose: DockPurpose): void {
  const dock = state.docks.find((d) => d.id === dockId);
  if (!dock) return;
  if (dock.purpose === purpose) return;
  dock.purpose = purpose;
  if (purpose === 'residential') {
    state.dockQueue = state.dockQueue.filter((entry) => entry.lane !== dock.lane);
  }
  bumpDockVersion(state);
}

export function setDockFacing(state: StationState, dockId: number, facing: SpaceLane): { ok: boolean; reason?: string } {
  const dock = state.docks.find((d) => d.id === dockId);
  if (!dock) return { ok: false, reason: 'dock not found' };
  const check = validateDockPlacementAt(state, dock.anchorTile, facing);
  if (!check.valid) return { ok: false, reason: check.reason };
  dock.facing = facing;
  dock.lane = laneFromFacing(facing);
  dock.approachTiles = check.approachTiles;
  bumpDockVersion(state);
  return { ok: true };
}

export function setDockAllowedShipType(state: StationState, dockId: number, shipType: ShipType, allowed: boolean): void {
  const dock = state.docks.find((d) => d.id === dockId);
  if (!dock) return;
  if (allowed && !isShipTypeUnlocked(state, shipType)) return;
  const next = new Set(dock.allowedShipTypes);
  if (allowed) next.add(shipType);
  else next.delete(shipType);
  if (next.size === 0) next.add('tourist');
  dock.allowedShipTypes = [...next];
  bumpDockVersion(state);
}

export function setDockAllowedShipSize(state: StationState, dockId: number, size: ShipSize, allowed: boolean): void {
  const dock = state.docks.find((d) => d.id === dockId);
  if (!dock) return;
  if (!shipSizesUpTo(dock.maxSizeByArea).includes(size)) return;
  const next = new Set(dock.allowedShipSizes);
  if (allowed) next.add(size);
  else next.delete(size);
  if (next.size === 0) next.add('small');
  dock.allowedShipSizes = shipSizesUpTo(dock.maxSizeByArea).filter((s) => next.has(s));
  bumpDockVersion(state);
}

// ────────────────────────────────────────────────────────────────────
// Dock-migration v0 follow-up: per-berth player-set filters (parity
// with setDockAllowedShipType / setDockAllowedShipSize for the
// berth-room config UI). Capability tags continue to gate which ship
// types CAN dock; these filters let the player further restrict the
// allowlist on a per-berth basis. Storage lives in
// `state.berthConfigs` keyed by berth-cluster anchor tile (lowest
// tile index in the cluster). Orphaned entries — anchor no longer
// leads a Berth cluster — are pruned in ensureRoomClustersCache.
// ────────────────────────────────────────────────────────────────────

export const ALL_SHIP_TYPES_FOR_BERTH: ShipType[] = ['tourist', 'trader', 'industrial', 'military', 'colonist'];
export const ALL_SHIP_SIZES_FOR_BERTH: ShipSize[] = ['small', 'medium', 'large'];

export function findBerthConfigByAnchor(state: StationState, anchorTile: number): BerthConfig | undefined {
  return state.berthConfigs.find((c) => c.anchorTile === anchorTile);
}

function makeDefaultBerthConfig(anchorTile: number): BerthConfig {
  return {
    anchorTile,
    allowedShipTypes: [...ALL_SHIP_TYPES_FOR_BERTH],
    allowedShipSizes: [...ALL_SHIP_SIZES_FOR_BERTH]
  };
}

/**
 * Look up (or create) the BerthConfig for a berth cluster anchor.
 * Caller is responsible for passing a valid anchor (lowest tile index
 * inside an existing Berth cluster) — invalid anchors get a config
 * row that the orphan-prune pass will sweep on the next room-cluster
 * recompute, so the worst case is one wasted entry.
 */
export function ensureBerthConfig(state: StationState, anchorTile: number): BerthConfig {
  let cfg = findBerthConfigByAnchor(state, anchorTile);
  if (!cfg) {
    cfg = makeDefaultBerthConfig(anchorTile);
    state.berthConfigs.push(cfg);
  }
  return cfg;
}

/**
 * Remove BerthConfig entries whose anchor is no longer the lowest
 * tile of a Berth cluster. Called from ensureRoomClustersCache after
 * the cluster cache has been rebuilt — guarantees the room-version
 * key has just rolled, so we know the anchor set is fresh.
 */
export function pruneOrphanedBerthConfigs(state: StationState): void {
  if (state.berthConfigs.length === 0) return;
  const validAnchors = new Set<number>();
  const berthClusters = state.derived.roomClustersByRoom.get(RoomType.Berth) ?? [];
  for (const cluster of berthClusters) {
    if (cluster.length === 0) continue;
    const anchor = cluster.reduce((best, tile) => (tile < best ? tile : best), cluster[0]);
    validAnchors.add(anchor);
  }
  state.berthConfigs = state.berthConfigs.filter((c) => validAnchors.has(c.anchorTile));
}

export function setBerthAllowedShipType(
  state: StationState,
  anchorTile: number,
  shipType: ShipType,
  allowed: boolean
): void {
  // Capability check: if the player toggles a type the berth's modules
  // can't actually accept, we still record the choice — the capability
  // filter in pickBerthForShip is the hard gate, this is the soft one.
  // Tier-locked types still need to be unlocked first (mirrors dock).
  if (allowed && !isShipTypeUnlocked(state, shipType)) return;
  const cfg = ensureBerthConfig(state, anchorTile);
  const next = new Set(cfg.allowedShipTypes);
  if (allowed) next.add(shipType);
  else next.delete(shipType);
  // Mirror dock invariant: never leave the allowlist empty — a berth
  // with zero allowed types is a dead berth that confuses traffic
  // logic. Default fallback is 'tourist' (the always-unlocked type).
  if (next.size === 0) next.add('tourist');
  cfg.allowedShipTypes = ALL_SHIP_TYPES_FOR_BERTH.filter((t) => next.has(t));
}

export function setBerthAllowedShipSize(
  state: StationState,
  anchorTile: number,
  size: ShipSize,
  allowed: boolean
): void {
  const cfg = ensureBerthConfig(state, anchorTile);
  const next = new Set(cfg.allowedShipSizes);
  if (allowed) next.add(size);
  else next.delete(size);
  // Mirror dock invariant: never leave the size-allowlist empty.
  if (next.size === 0) next.add('small');
  cfg.allowedShipSizes = ALL_SHIP_SIZES_FOR_BERTH.filter((s) => next.has(s));
}

export function validateDockPlacement(
  state: StationState,
  tileIndex: number,
  facing?: SpaceLane
): { valid: boolean; reason: string; approachTiles: number[] } {
  // Re-export wraps the with-neighbors variant; sim.ts imports the
  // wider one and re-exports this thin shim for the public API.
  return _validateDockPlacementWithNeighbors(state, tileIndex, facing);
}
