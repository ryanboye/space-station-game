// construction.ts — extracted from sim.ts.
//
// Owns the construction-site planning + EVA helpers cluster: tile and
// module construction sites, EVA airlock detection, suit-up / oxygen
// updates, build job enqueueing, and applyConstructionSite. Public
// surface (cancelConstructionAtTile, planTileConstruction,
// planModuleConstruction) is re-exported from sim.ts.

import {
  JOB_TTL_SEC,
  adjacentWalkableTiles,
  consumeConstructionMaterials,
  footprintTiles,
  isModuleUnlocked,
  itemStockAtNode,
  materialInventoryTiles,
  materialInventoryTotal,
  moduleFootprint,
  moduleMount,
  removeModuleAtTile,
  setCrewPath,
  tileBuildCost,
  trySetTile,
  tryPlaceModule,
  validateBerthModulePlacement,
  validateDockPlacementWithNeighbors,
  wallMountedModuleServiceTile
} from './sim';
import {
  type ConstructionSite,
  type CrewMember,
  ModuleType,
  type ModuleRotation,
  RoomType,
  type StationState,
  TileType,
  ZoneType,
  fromIndex,
  inBounds,
  isWalkable,
  toIndex
} from './types';
import { MODULE_DEFINITIONS } from './balance';
// setTile, setRoom, setZone live in sim.ts and are NOT exported there yet.
// applyConstructionSite uses them at the end of the file. Import from sim.
import { findPath, setRoom, setTile, setZone } from './sim';

export const CONSTRUCTION_CARRY_AMOUNT = 8;
export const CONSTRUCTION_BUILD_RATE_PER_SEC = 6;
export const EVA_OXYGEN_MAX_SEC = 240;
export const EVA_LOW_OXYGEN_SEC = 18;
const TRUSS_CONSTRUCTION_MATERIAL_COST = 1;
const TRUSS_CONSTRUCTION_WORK_REQUIRED = 0.8;

export function isEvaTraversalTile(state: StationState, tileIndex: number): boolean {
  const tile = state.tiles[tileIndex];
  return tile === TileType.Space || tile === TileType.Truss || tile === TileType.Airlock || (isWalkable(tile) && !state.pressurized[tileIndex]);
}

export function shouldSuitUpFromAirlock(state: StationState, crew: CrewMember): boolean {
  if (state.tiles[crew.tileIndex] !== TileType.Airlock) return false;
  const nextTile = crew.path[0];
  return nextTile !== undefined && nextTile >= 0 && isEvaTraversalTile(state, nextTile) && state.tiles[nextTile] !== TileType.Airlock;
}

export function updateEvaSuitForRoute(state: StationState, crew: CrewMember, dt: number): void {
  if (state.tiles[crew.tileIndex] === TileType.Airlock) {
    if (shouldSuitUpFromAirlock(state, crew)) {
      crew.evaSuit = true;
      crew.evaOxygenSec = EVA_OXYGEN_MAX_SEC;
    } else {
      crew.evaSuit = false;
      crew.evaOxygenSec = 0;
    }
    return;
  }

  if (!isEvaTraversalTile(state, crew.tileIndex)) return;
  if (!crew.evaSuit) {
    crew.evaSuit = true;
    crew.evaOxygenSec = EVA_OXYGEN_MAX_SEC;
  } else {
    crew.evaOxygenSec = Math.max(0, crew.evaOxygenSec - dt);
  }
}

export function moduleConstructionCostForDefinition(module: ModuleType, rotation: ModuleRotation): number {
  const footprint = moduleFootprint(module, rotation);
  const base = module === ModuleType.WallLight ? 2 : footprint.width * footprint.height * 3;
  return Math.max(2, base);
}

function moduleConstructionCost(state: StationState, module: ModuleType, rotation: ModuleRotation): number {
  return moduleConstructionCostForDefinition(module, rotation);
}

function refundConstructionMaterials(state: StationState, amount: number): void {
  if (amount <= 0) return;
  state.legacyMaterialStock += amount;
  state.metrics.materials = Math.max(0, state.legacyMaterialStock + materialInventoryTotal(state));
}

function constructionSiteCoversTile(state: StationState, site: ConstructionSite, tileIndex: number): boolean {
  if (site.tileIndex === tileIndex) return true;
  if (site.kind !== 'module' || site.targetModule === undefined) return false;
  const footprint = moduleFootprint(site.targetModule, site.rotation ?? 0);
  return footprintTiles(state, site.tileIndex, footprint.width, footprint.height).includes(tileIndex);
}

export function removeConstructionAtTile(state: StationState, tileIndex: number, refundMaterials = false): boolean {
  const removedSites = state.constructionSites.filter((site) => constructionSiteCoversTile(state, site, tileIndex));
  const removedIds = new Set(removedSites.map((site) => site.id));
  if (removedIds.size <= 0) return false;
  if (refundMaterials) {
    refundConstructionMaterials(
      state,
      removedSites.reduce((sum, site) => sum + Math.max(0, site.deliveredMaterials), 0)
    );
  }
  state.constructionSites = state.constructionSites.filter((site) => !removedIds.has(site.id));
  for (const job of state.jobs) {
    if (job.constructionSiteId === undefined || !removedIds.has(job.constructionSiteId)) continue;
    if (job.state === 'done' || job.state === 'expired') continue;
    const assignedCrewId = job.assignedCrewId;
    job.expiredFromState = job.state;
    job.state = 'expired';
    job.completedAt = state.now;
    job.assignedCrewId = null;
    job.stallReason = 'none';
    if (assignedCrewId !== null) {
      const crew = state.crewMembers.find((c) => c.id === assignedCrewId);
      if (crew) {
        if (refundMaterials && crew.carryingItemType === 'rawMaterial' && crew.carryingAmount > 0) {
          refundConstructionMaterials(state, crew.carryingAmount);
        }
        crew.activeJobId = null;
        crew.carryingItemType = null;
        crew.carryingAmount = 0;
        setCrewPath(state, crew, []);
        if (state.tiles[crew.tileIndex] === TileType.Airlock || (state.pressurized[crew.tileIndex] && !isEvaTraversalTile(state, crew.tileIndex))) {
          crew.evaSuit = false;
          crew.evaOxygenSec = 0;
        }
      }
    }
  }
  return true;
}

export function cancelConstructionAtTile(state: StationState, tileIndex: number): boolean {
  if (tileIndex < 0 || tileIndex >= state.tiles.length) return false;
  return removeConstructionAtTile(state, tileIndex, true);
}

function hasAdjacentBuildAnchor(state: StationState, tileIndex: number): boolean {
  const p = fromIndex(tileIndex, state.width);
  const deltas: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dx, dy] of deltas) {
    const x = p.x + dx;
    const y = p.y + dy;
    if (!inBounds(x, y, state.width, state.height)) continue;
    const next = toIndex(x, y, state.width);
    if (state.tiles[next] !== TileType.Space) return true;
    if (
      state.constructionSites.some(
        (site) => site.kind === 'tile' && site.tileIndex === next && site.state !== 'done' && site.targetTile !== TileType.Space
      )
    ) {
      return true;
    }
  }
  return false;
}

function createConstructionSite(
  state: StationState,
  site: Omit<ConstructionSite, 'id' | 'assignedCrewId' | 'state' | 'blockedReason' | 'createdAt'>
): ConstructionSite {
  removeConstructionAtTile(state, site.tileIndex);
  const next: ConstructionSite = {
    ...site,
    id: state.constructionSiteSpawnCounter++,
    assignedCrewId: null,
    state: 'planned',
    blockedReason: null,
    createdAt: state.now
  };
  state.constructionSites.push(next);
  return next;
}

export function planTileConstruction(state: StationState, index: number, tile: TileType): { ok: boolean; reason?: string } {
  if (index < 0 || index >= state.tiles.length) return { ok: false, reason: 'out of bounds' };
  if (state.tiles[index] === tile) return { ok: true };
  if (tile === TileType.Truss && state.tiles[index] !== TileType.Space) {
    return { ok: false, reason: 'truss must be built in space' };
  }
  if (tile === TileType.Space) {
    removeConstructionAtTile(state, index);
    const changed = trySetTile(state, index, tile);
    return changed ? { ok: true } : { ok: false, reason: 'cannot erase disconnected hull' };
  }
  if (tile === TileType.Dock) {
    const dockCheck = validateDockPlacementWithNeighbors(state, index);
    if (!dockCheck.valid) return { ok: false, reason: 'invalid dock placement' };
  }
  const requiresEva = state.tiles[index] === TileType.Space || state.tiles[index] === TileType.Truss || tile === TileType.Truss;
  if (requiresEva && !hasAdjacentBuildAnchor(state, index)) {
    return { ok: false, reason: 'must connect to hull or planned construction' };
  }
  if (tile === TileType.Truss) {
    if (!consumeConstructionMaterials(state, TRUSS_CONSTRUCTION_MATERIAL_COST)) {
      return { ok: false, reason: 'no construction materials' };
    }
    createConstructionSite(state, {
      kind: 'tile',
      tileIndex: index,
      targetTile: tile,
      requiredMaterials: TRUSS_CONSTRUCTION_MATERIAL_COST,
      deliveredMaterials: TRUSS_CONSTRUCTION_MATERIAL_COST,
      buildProgress: 0,
      buildWorkRequired: TRUSS_CONSTRUCTION_WORK_REQUIRED,
      requiresEva: true
    });
    return { ok: true };
  }
  const oldCost = tileBuildCost(state.tiles[index]);
  const newCost = tileBuildCost(tile);
  const requiredMaterials = Math.max(1, Math.ceil(Math.max(0, newCost - oldCost)));
  createConstructionSite(state, {
    kind: 'tile',
    tileIndex: index,
    targetTile: tile,
    requiredMaterials,
    deliveredMaterials: 0,
    buildProgress: 0,
    buildWorkRequired: Math.max(5, requiredMaterials * 2.2),
    requiresEva
  });
  return { ok: true };
}

export function planModuleConstruction(
  state: StationState,
  index: number,
  module: ModuleType,
  rotation: ModuleRotation = 0
): { ok: boolean; reason?: string } {
  if (module === ModuleType.None) {
    removeModuleAtTile(state, index);
    removeConstructionAtTile(state, index);
    return { ok: true };
  }
  const preview = validateModulePlacementForConstruction(state, module, index, rotation);
  if (!preview.ok) return preview;
  const appliedRotation = rotation === 90 && MODULE_DEFINITIONS[module]?.rotatable ? 90 : 0;
  const requiredMaterials = Math.ceil(moduleConstructionCost(state, module, appliedRotation));
  createConstructionSite(state, {
    kind: 'module',
    tileIndex: index,
    targetModule: module,
    rotation: appliedRotation,
    requiredMaterials,
    deliveredMaterials: 0,
    buildProgress: 0,
    buildWorkRequired: Math.max(6, requiredMaterials * 2.4),
    requiresEva: false
  });
  return { ok: true };
}

export function validateModulePlacementForConstruction(
  state: StationState,
  module: ModuleType,
  originTile: number,
  rotation: ModuleRotation
): { ok: true } | { ok: false; reason: string } {
  if (!isModuleUnlocked(state, module)) return { ok: false, reason: 'module locked by progression' };
  const def = MODULE_DEFINITIONS[module];
  if (!def) return { ok: false, reason: 'unknown module' };
  const appliedRotation: ModuleRotation = rotation === 90 && def.rotatable ? 90 : 0;
  const footprint = moduleFootprint(module, appliedRotation);
  const tiles = footprintTiles(state, originTile, footprint.width, footprint.height);
  if (tiles.length <= 0) return { ok: false, reason: 'out of bounds' };
  const requiresWallMount = moduleMount(module) === 'wall';
  const serviceTile = requiresWallMount ? wallMountedModuleServiceTile(state, originTile) : originTile;
  if (requiresWallMount && serviceTile === null) {
    return { ok: false, reason: 'wall fixture requires adjacent floor' };
  }
  const roomAtOrigin = state.rooms[serviceTile ?? originTile];
  for (const tile of tiles) {
    if (state.constructionSites.some((site) => site.tileIndex === tile && site.state !== 'done')) {
      return { ok: false, reason: 'construction overlap' };
    }
    if (requiresWallMount) {
      if (state.tiles[tile] !== TileType.Wall) return { ok: false, reason: 'wall fixture requires wall tile' };
    } else if (!isWalkable(state.tiles[tile])) {
      return { ok: false, reason: 'footprint blocked' };
    }
    if (state.moduleOccupancyByTile[tile] !== null) return { ok: false, reason: 'module overlap' };
    const roomForTile = requiresWallMount ? roomAtOrigin : state.rooms[tile];
    if (def.allowedRooms && !def.allowedRooms.includes(roomForTile)) {
      return { ok: false, reason: 'invalid room for module' };
    }
    if (!requiresWallMount && def.allowedRooms && state.rooms[tile] !== roomAtOrigin) {
      return { ok: false, reason: 'footprint crosses room boundary' };
    }
  }
  const berthModuleReason = validateBerthModulePlacement(state, module, tiles);
  if (berthModuleReason) return { ok: false, reason: berthModuleReason };
  return { ok: true };
}

function constructionMaterialSources(state: StationState): Array<{ tile: number; available: number; legacy: boolean }> {
  const sources = materialInventoryTiles(state)
    .map((tile) => ({ tile, available: itemStockAtNode(state, tile, 'rawMaterial'), legacy: false }))
    .filter((source) => source.available > 0.05);
  if (state.legacyMaterialStock > 0.05) {
    const reachableCacheTile =
      state.crewMembers.find((crew) => state.tiles[crew.tileIndex] !== TileType.Space)?.tileIndex ?? state.core.serviceTile;
    sources.push({ tile: reachableCacheTile, available: state.legacyMaterialStock, legacy: true });
  }
  return sources.sort((a, b) => b.available - a.available);
}

function hasOpenConstructionJob(state: StationState, siteId: number): boolean {
  return state.jobs.some(
    (job) =>
      job.constructionSiteId === siteId &&
      job.state !== 'done' &&
      job.state !== 'expired'
  );
}

function constructionWorkTile(state: StationState, site: ConstructionSite): number {
  if (site.kind === 'module' && site.targetModule !== undefined && moduleMount(site.targetModule) === 'wall') {
    return wallMountedModuleServiceTile(state, site.tileIndex) ?? site.tileIndex;
  }
  return site.tileIndex;
}

function enqueueConstructionJob(
  state: StationState,
  site: ConstructionSite,
  mode: 'deliver' | 'build',
  fromTile: number,
  amount: number
): void {
  state.jobs.push({
    id: state.jobSpawnCounter++,
    type: 'construct',
    itemType: 'rawMaterial',
    amount,
    fromTile,
    toTile: constructionWorkTile(state, site),
    assignedCrewId: null,
    createdAt: state.now,
    expiresAt: state.now + JOB_TTL_SEC * 2,
    state: 'pending',
    pickedUpAmount: 0,
    completedAt: null,
    lastProgressAt: state.now,
    stallReason: 'none',
    stalledSince: undefined,
    constructionSiteId: site.id,
    constructionMode: mode,
    repairProgress: 0
  });
  state.metrics.createdJobs += 1;
}

export function createConstructionJobs(state: StationState): void {
  for (const site of state.constructionSites) {
    if (site.state === 'done') continue;
    if (hasOpenConstructionJob(state, site.id)) continue;
    site.assignedCrewId = null;
    if (site.deliveredMaterials + 0.05 < site.requiredMaterials) {
      const remaining = site.requiredMaterials - site.deliveredMaterials;
      const sources = constructionMaterialSources(state);
      if (sources.length <= 0) {
        site.state = 'blocked';
        site.blockedReason = 'no construction materials';
        continue;
      }
      const source = sources[0];
      site.state = 'planned';
      site.blockedReason = null;
      enqueueConstructionJob(state, site, 'deliver', source.tile, Math.min(CONSTRUCTION_CARRY_AMOUNT, remaining, source.available));
    } else {
      site.state = 'building';
      site.blockedReason = null;
      enqueueConstructionJob(state, site, 'build', site.tileIndex, 0);
    }
  }
}

export function cleanupConstructionSites(state: StationState): void {
  state.constructionSites = state.constructionSites.filter((site) => site.state !== 'done');
}

export function activeAirlockTiles(state: StationState): number[] {
  const out: number[] = [];
  for (let i = 0; i < state.tiles.length; i++) {
    if (state.tiles[i] === TileType.Airlock) out.push(i);
  }
  return out;
}

export function findSpacePath(state: StationState, start: number, goal: number): number[] | null {
  if (start === goal) return [];
  const cameFrom = new Int32Array(state.width * state.height);
  cameFrom.fill(-1);
  const queue: number[] = [start];
  const seen = new Set<number>([start]);
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head];
    const p = fromIndex(current, state.width);
    const deltas: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dy] of deltas) {
      const x = p.x + dx;
      const y = p.y + dy;
      if (!inBounds(x, y, state.width, state.height)) continue;
      const next = toIndex(x, y, state.width);
      if (seen.has(next)) continue;
      const allowed = next === goal || isEvaTraversalTile(state, next);
      if (!allowed) continue;
      seen.add(next);
      cameFrom[next] = current;
      if (next === goal) {
        const path: number[] = [];
        let cursor = goal;
        while (cameFrom[cursor] >= 0) {
          path.push(cursor);
          cursor = cameFrom[cursor];
        }
        path.reverse();
        return path;
      }
      queue.push(next);
    }
  }
  return null;
}

export function findConstructionPath(state: StationState, start: number, site: ConstructionSite): number[] | null {
  const workTile = constructionWorkTile(state, site);
  if (site.requiresEva) {
    if (isEvaTraversalTile(state, start) && state.tiles[start] !== TileType.Airlock) {
      return findSpacePath(state, start, workTile);
    }
    let best: number[] | null = null;
    for (const airlock of activeAirlockTiles(state)) {
      const inside = findPath(state, start, airlock, { allowRestricted: true, intent: 'crew' }, state.pathOccupancyByTile);
      if (!inside) continue;
      const outside = findSpacePath(state, airlock, workTile);
      if (!outside) continue;
      const combined = [...inside, ...outside];
      if (!best || combined.length < best.length) best = combined;
    }
    return best;
  }
  if (isWalkable(state.tiles[workTile])) {
    return findPath(state, start, workTile, { allowRestricted: true, intent: 'crew' }, state.pathOccupancyByTile);
  }
  let best: number[] | null = null;
  for (const target of adjacentWalkableTiles(state, workTile)) {
    const path = findPath(state, start, target, { allowRestricted: true, intent: 'crew' }, state.pathOccupancyByTile);
    if (!path) continue;
    if (!best || path.length < best.length) best = path;
  }
  return best;
}

export function crewAtConstructionSite(state: StationState, crew: CrewMember, site: ConstructionSite): boolean {
  const workTile = constructionWorkTile(state, site);
  if (crew.tileIndex === workTile) return true;
  if (site.requiresEva) return false;
  return adjacentWalkableTiles(state, workTile).includes(crew.tileIndex);
}

export function applyConstructionSite(state: StationState, site: ConstructionSite): boolean {
  if (site.kind === 'tile' && site.targetTile !== undefined) {
    setTile(state, site.tileIndex, site.targetTile);
    if (site.targetTile === TileType.Space) {
      setZone(state, site.tileIndex, ZoneType.Public);
      setRoom(state, site.tileIndex, RoomType.None);
    }
    return true;
  }
  if (site.kind === 'module' && site.targetModule !== undefined) {
    const result = tryPlaceModule(state, site.targetModule, site.tileIndex, site.rotation ?? 0);
    if (!result.ok) {
      site.state = 'blocked';
      site.blockedReason = result.reason ?? 'module placement failed';
      return false;
    }
    return true;
  }
  return false;
}
