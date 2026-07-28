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
  validatePortModulePlacement,
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
  type StructuralExpansionProject,
  type StructuralExpansionTarget,
  TileType,
  ZoneType,
  fromIndex,
  inBounds,
  isWalkable,
  toIndex
} from './types';
import { MODULE_DEFINITIONS } from './balance';
import { validateStructuralSupportPlan } from './structural-support';
// setTile, setRoom, setZone live in sim.ts and are NOT exported there yet.
// applyConstructionSite uses them at the end of the file. Import from sim.
import { findPath, moduleCreditBuildCost, setRoom, setTile, setZone } from './sim';

export const CONSTRUCTION_CARRY_AMOUNT = 8;
export const CONSTRUCTION_BUILD_RATE_PER_SEC = 6;
export const EVA_OXYGEN_MAX_SEC = 240;
export const EVA_LOW_OXYGEN_SEC = 18;
const TRUSS_CONSTRUCTION_MATERIAL_COST = 1;
const TRUSS_CONSTRUCTION_WORK_REQUIRED = 0.8;
const EXTERIOR_HULL_MODULES = new Set<ModuleType>([
  ModuleType.PodDock,
  ModuleType.FuelCoupler,
  ModuleType.FreightLocker,
  ModuleType.MaintenanceSocket
]);

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
  const explicit = MODULE_DEFINITIONS[module]?.capitalCost;
  if (explicit !== undefined) return Math.max(2, explicit);
  const footprint = moduleFootprint(module, rotation);
  // Solar panels are a modest power investment: priced well above the 1x1
  // default (3) so ~3-4 of them is a real spend, but far below a reactor room.
  const base =
    module === ModuleType.WallLight ? 2 :
    module === ModuleType.SolarPanel ? 18 :
    footprint.width * footprint.height * 3;
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
  const structuralProjectId = removedSites.find((site) => site.structuralProjectId !== undefined)?.structuralProjectId;
  if (structuralProjectId !== undefined) {
    return cancelStructuralExpansionProject(state, structuralProjectId);
  }
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

export interface StructuralExpansionGeometry {
  bounds: StructuralExpansionProject['bounds'];
  doorTile: number | null;
  targets: StructuralExpansionTarget[];
  requiredMaterials: number;
}

function projectSites(state: StationState, projectId: number): ConstructionSite[] {
  return state.constructionSites.filter((site) => site.structuralProjectId === projectId);
}

function projectStageTargets(project: StructuralExpansionProject, stage: 'perimeter' | 'interior'): StructuralExpansionTarget[] {
  return project.targets.filter((target) =>
    stage === 'perimeter'
      ? target.targetTile === TileType.Wall || target.targetTile === TileType.Door
      : target.targetTile === TileType.Floor
  );
}

function structuralWorkRequired(target: StructuralExpansionTarget): number {
  return target.targetTile === TileType.Floor ? 5 : 7;
}

function enqueueStructuralStage(
  state: StationState,
  project: StructuralExpansionProject,
  stage: 'perimeter' | 'interior'
): void {
  const targets = projectStageTargets(project, stage);
  for (const target of targets) {
    const site = createConstructionSite(state, {
      kind: 'tile',
      tileIndex: target.tileIndex,
      targetTile: target.targetTile,
      requiredMaterials: target.requiredMaterials,
      deliveredMaterials: 0,
      buildProgress: 0,
      buildWorkRequired: structuralWorkRequired(target),
      requiresEva: true,
      structuralProjectId: project.id,
      structuralStage: stage
    });
    project.childSiteIds.push(site.id);
  }
}

function isSealCheckSite(site: ConstructionSite): boolean {
  // `targetTile: Truss` makes the site self-describing for saves created
  // during the transition to the explicit seal-check stage.
  return site.structuralStage === 'seal-check' || (
    site.structuralProjectId !== undefined &&
    site.kind === 'tile' &&
    site.targetTile === TileType.Truss &&
    site.requiredMaterials === 0
  );
}

function normaliseSealCheckSite(site: ConstructionSite): boolean {
  if (!isSealCheckSite(site)) return false;
  site.structuralStage = 'seal-check';
  return true;
}

function structuralSealProblem(
  state: StationState,
  project: StructuralExpansionProject
): string | null {
  const targetsByTile = new Map(project.targets.map((target) => [target.tileIndex, target]));
  const interiorTiles = new Set(
    project.targets
      .filter((target) => target.targetTile === TileType.Floor)
      .map((target) => target.tileIndex)
  );
  const doorTargets = project.targets.filter((target) => target.targetTile === TileType.Door);
  const coordinate = (tile: number): string => {
    const point = fromIndex(tile, state.width);
    return `${point.x},${point.y}`;
  };

  if (interiorTiles.size === 0) return `incomplete seal at ${project.bounds.minX},${project.bounds.minY}`;
  if (project.doorTile === null) {
    const plannedDoor = doorTargets[0]?.tileIndex ?? [...interiorTiles].sort((left, right) => left - right)[0]!;
    return `missing doorway at ${coordinate(plannedDoor)}`;
  }
  if (doorTargets.length !== 1 || doorTargets[0]!.tileIndex !== project.doorTile) {
    return `missing doorway at ${coordinate(project.doorTile)}`;
  }

  const door = doorTargets[0]!;
  let doorTouchesInterior = false;
  const requiredPerimeter = new Set<number>();
  for (const interior of interiorTiles) {
    const point = fromIndex(interior, state.width);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const x = point.x + dx;
      const y = point.y + dy;
      if (!inBounds(x, y, state.width, state.height)) continue;
      const neighbor = toIndex(x, y, state.width);
      if (interiorTiles.has(neighbor)) continue;
      requiredPerimeter.add(neighbor);
      if (neighbor === door.tileIndex) doorTouchesInterior = true;
    }
  }
  if (!doorTouchesInterior) return `missing doorway at ${coordinate(door.tileIndex)}`;

  for (const perimeterTile of [...requiredPerimeter].sort((left, right) => left - right)) {
    const target = targetsByTile.get(perimeterTile);
    // An expansion may legitimately tie into an already-commissioned interior
    // floor. That edge has a live station shell already; only newly exposed
    // space/truss edges must appear in this project's perimeter targets.
    const existingTile = state.tiles[perimeterTile];
    if (!target && (isWalkable(existingTile) || existingTile === TileType.Wall || existingTile === TileType.Airlock)) continue;
    if (!target || (target.targetTile !== TileType.Wall && target.targetTile !== TileType.Door)) {
      return `incomplete seal at ${coordinate(perimeterTile)}`;
    }
  }
  for (const target of project.targets) {
    if (target.targetTile === TileType.Floor) continue;
    if (target.targetTile !== TileType.Wall && target.targetTile !== TileType.Door) {
      return `incomplete seal at ${coordinate(target.tileIndex)}`;
    }
  }
  return null;
}

function enqueueStructuralSealCheck(state: StationState, project: StructuralExpansionProject): ConstructionSite {
  const sealTile = project.doorTile ?? project.targets.find((target) => target.targetTile === TileType.Wall)?.tileIndex;
  if (sealTile === undefined) throw new Error(`Structural project ${project.id} has no seal-check tile.`);
  // Do not use createConstructionSite here: the completed perimeter site at
  // this same tile belongs to the same parent, and its generic replacement
  // behavior correctly interprets removal as cancelling a structural plan.
  const site: ConstructionSite = {
    id: state.constructionSiteSpawnCounter++,
    kind: 'tile',
    tileIndex: sealTile,
    // This is only an EVA inspection/weld marker. The parent remains the sole
    // topology writer, and Truss makes the intent survive old save payloads.
    targetTile: TileType.Truss,
    requiredMaterials: 0,
    deliveredMaterials: 0,
    buildProgress: 0,
    buildWorkRequired: 2,
    requiresEva: true,
    structuralProjectId: project.id,
    structuralStage: 'seal-check',
    assignedCrewId: null,
    state: 'planned',
    blockedReason: null,
    createdAt: state.now
  };
  state.constructionSites.push(site);
  project.childSiteIds.push(site.id);
  return site;
}

/** Creates a deferred expansion project. The caller already validated geometry. */
export function createStructuralExpansionProject(
  state: StationState,
  geometry: StructuralExpansionGeometry
): StructuralExpansionProject {
  const project: StructuralExpansionProject = {
    id: state.structuralExpansionProjectSpawnCounter++,
    bounds: { ...geometry.bounds },
    doorTile: geometry.doorTile,
    targets: geometry.targets.map((target) => ({ ...target })),
    phase: 'perimeter',
    childSiteIds: [],
    completedSiteIds: [],
    requiredMaterials: geometry.requiredMaterials,
    deliveredMaterials: 0,
    refundedMaterials: 0,
    blockedReason: null,
    cancelled: false,
    commissioned: false,
    createdAt: state.now,
    finishedAt: null
  };
  state.structuralExpansionProjects.push(project);
  enqueueStructuralStage(state, project, 'perimeter');
  return project;
}

function markProjectBlocked(project: StructuralExpansionProject, sites: readonly ConstructionSite[]): void {
  const blocked = sites.find((site) => site.state === 'blocked' && site.blockedReason);
  if (!blocked) return;
  project.phase = 'blocked';
  project.blockedReason = blocked.blockedReason;
}

function updateProjectMaterialProgress(project: StructuralExpansionProject, sites: readonly ConstructionSite[]): void {
  const delivered = sites.reduce((sum, site) => sum + Math.max(0, site.deliveredMaterials), 0);
  project.deliveredMaterials = Math.min(project.requiredMaterials, Math.max(project.deliveredMaterials, delivered));
}

/**
 * Advances the durable parent after child site work has run. Commissioning is
 * intentionally atomic: construction sites render/progress in space but the
 * station topology stays untouched until the whole shell is finished.
 */
export function advanceStructuralExpansionProjects(state: StationState): void {
  for (const project of state.structuralExpansionProjects) {
    if (project.cancelled || project.commissioned) continue;
    const sites = projectSites(state, project.id);
    for (const site of sites) normaliseSealCheckSite(site);
    updateProjectMaterialProgress(project, sites);
    if (project.phase === 'blocked' && !sites.some((site) => site.state === 'blocked')) {
      project.phase = sites.some((site) => isSealCheckSite(site))
        ? 'seal-check'
        : sites.some((site) => site.structuralStage === 'interior') ? 'interior' : 'perimeter';
      project.blockedReason = null;
    }
    markProjectBlocked(project, sites);
    if (project.phase === 'blocked') continue;

    const sealSite = sites.find((site) => isSealCheckSite(site));
    if (sealSite && project.phase === 'interior') project.phase = 'seal-check';
    if (sealSite) {
      if (sealSite.state !== 'done') continue;
      if (!project.completedSiteIds.includes(sealSite.id)) project.completedSiteIds.push(sealSite.id);
    }

    const currentStage = project.phase;
    const stageSites = sites.filter((site) => site.structuralStage === currentStage);
    if (stageSites.some((site) => site.state !== 'done')) continue;
    for (const site of stageSites) {
      if (!project.completedSiteIds.includes(site.id)) project.completedSiteIds.push(site.id);
    }

    if (currentStage === 'perimeter') {
      project.phase = 'interior';
      enqueueStructuralStage(state, project, 'interior');
      continue;
    }

    if (!sealSite) {
      const sealProblem = structuralSealProblem(state, project);
      if (sealProblem) {
        project.phase = 'blocked';
        project.blockedReason = sealProblem;
        continue;
      }
      project.phase = 'seal-check';
      enqueueStructuralSealCheck(state, project);
      continue;
    }

    const support = validateStructuralSupportPlan(
      state,
      [],
      project.targets
        .filter((target) => target.targetTile === TileType.Floor)
        .map((target) => ({ tile: target.tileIndex, kind: 'small' as const }))
    );
    const supportProblem = support.problems.find((problem) => problem.reason !== 'branch-requires-junction');
    if (supportProblem) {
      project.phase = 'blocked';
      project.blockedReason = `structural support: ${supportProblem.reason}`;
      continue;
    }

    // No topology was changed by the children, so this one write cannot ever
    // leave a pressurizable half-shell behind.
    for (const target of project.targets) {
      setTile(state, target.tileIndex, target.targetTile);
      setZone(state, target.tileIndex, ZoneType.Public);
      setRoom(state, target.tileIndex, RoomType.None);
    }
    project.deliveredMaterials = project.requiredMaterials;
    project.phase = 'commissioned';
    project.commissioned = true;
    project.finishedAt = state.now;
  }
}

/** Cancels only this project's child sites/jobs and refunds delivered value once. */
export function cancelStructuralExpansionProject(state: StationState, projectId: number): boolean {
  const project = state.structuralExpansionProjects.find((candidate) => candidate.id === projectId);
  if (!project || project.cancelled || project.commissioned) return false;
  const sites = projectSites(state, projectId);
  const siteIds = new Set(sites.map((site) => site.id));
  let refund = Math.max(0, project.deliveredMaterials - project.refundedMaterials);

  for (const job of state.jobs) {
    if (job.constructionSiteId === undefined || !siteIds.has(job.constructionSiteId)) continue;
    if (job.state !== 'done' && job.state !== 'expired') {
      job.expiredFromState = job.state;
      job.state = 'expired';
      job.completedAt = state.now;
      job.assignedCrewId = null;
      job.stallReason = 'none';
    }
    const crew = state.crewMembers.find((candidate) => candidate.activeJobId === job.id);
    if (crew) {
      if (crew.carryingItemType === 'rawMaterial' && crew.carryingAmount > 0) refund += crew.carryingAmount;
      crew.activeJobId = null;
      crew.carryingItemType = null;
      crew.carryingAmount = 0;
      setCrewPath(state, crew, []);
    }
  }
  state.constructionSites = state.constructionSites.filter((site) => !siteIds.has(site.id));
  project.refundedMaterials += refund;
  project.cancelled = true;
  project.phase = 'cancelled';
  project.finishedAt = state.now;
  project.blockedReason = null;
  refundConstructionMaterials(state, refund);
  return true;
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
  const definition = MODULE_DEFINITIONS[module];
  const footprint = moduleFootprint(module, appliedRotation);
  const moduleTiles = footprintTiles(state, index, footprint.width, footprint.height);
  const serviceTile = definition?.mount === 'wall' ? wallMountedModuleServiceTile(state, index) : null;
  const workTiles = serviceTile !== null ? [serviceTile] : moduleTiles;
  const requiresEva = EXTERIOR_HULL_MODULES.has(module) || workTiles.some((tile) => !state.pressurized[tile]);
  createConstructionSite(state, {
    kind: 'module',
    tileIndex: index,
    targetModule: module,
    rotation: appliedRotation,
    requiredMaterials,
    deliveredMaterials: 0,
    buildProgress: 0,
    buildWorkRequired: Math.max(6, requiredMaterials * 2.4),
    requiresEva
  });
  return { ok: true };
}

export function validateModulePlacementForConstruction(
  state: StationState,
  module: ModuleType,
  originTile: number,
  rotation: ModuleRotation,
  ignoreModuleId?: number
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
    const occupyingModuleId = state.moduleOccupancyByTile[tile];
    if (occupyingModuleId !== null && occupyingModuleId !== ignoreModuleId) {
      return { ok: false, reason: 'module overlap' };
    }
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
  const portModuleReason = validatePortModulePlacement(state, module, originTile, ignoreModuleId);
  if (portModuleReason) return { ok: false, reason: portModuleReason };
  return { ok: true };
}

/**
 * What the placement ghost should say (opening ticket 11).
 *
 * The renderer used to re-derive validity with its own copy of the rules,
 * which could not see progression locks, port rules or price, so an invalid
 * ghost went red with no explanation. This returns the authoritative verdict
 * plus a short player-facing reason, from the same validator the build path
 * runs, so the two can never disagree.
 */
export interface ModulePlacementPreview {
  valid: boolean;
  tiles: number[];
  /** Short sentence to render beside the cursor. Empty when placement is fine. */
  reason: string;
  cost: number;
  affordable: boolean;
}

const PLACEMENT_REASON_COPY: Record<string, string> = {
  'module locked by progression': 'Locked — not yet available',
  'unknown module': 'Unknown module',
  'out of bounds': 'Outside the station grid',
  'wall fixture requires adjacent floor': 'Wall fixture needs floor in front',
  'wall fixture requires wall tile': 'Wall fixture needs a wall tile',
  'footprint blocked': 'Footprint blocked — not walkable floor',
  'module overlap': 'Another module is already here',
  'construction overlap': 'A construction site is already here',
  'invalid room for module': 'Wrong room type for this module',
  'footprint crosses room boundary': 'Footprint crosses a room boundary'
};

export function previewModulePlacement(
  state: StationState,
  module: ModuleType,
  originTile: number,
  rotation: ModuleRotation
): ModulePlacementPreview {
  const def = MODULE_DEFINITIONS[module];
  const appliedRotation: ModuleRotation = rotation === 90 && def?.rotatable ? 90 : 0;
  const footprint = def ? moduleFootprint(module, appliedRotation) : { width: 1, height: 1 };
  const tiles = footprintTiles(state, originTile, footprint.width, footprint.height);
  const cost = def ? moduleCreditBuildCost(module, appliedRotation) : 0;
  const affordable = state.metrics.credits >= cost;
  const verdict = validateModulePlacementForConstruction(state, module, originTile, rotation);
  if (!verdict.ok) {
    return {
      valid: false,
      tiles: tiles.length > 0 ? tiles : [originTile],
      reason: PLACEMENT_REASON_COPY[verdict.reason] ?? verdict.reason,
      cost,
      affordable
    };
  }
  if (!affordable) {
    return {
      valid: false,
      tiles,
      reason: `Needs ${cost}c — you have ${Math.floor(state.metrics.credits)}c`,
      cost,
      affordable
    };
  }
  return { valid: true, tiles, reason: '', cost, affordable };
}

function constructionMaterialSources(state: StationState): Array<{ tile: number; available: number; legacy: boolean }> {
  const sources = materialInventoryTiles(state)
    .map((tile) => ({ tile, available: itemStockAtNode(state, tile, 'rawMaterial'), legacy: false }))
    .filter((source) => source.available > 0.05);
  if (state.legacyMaterialStock > 0.05) {
    // Legacy stock has no physical ItemNode. Give it a deterministic open
    // interaction position near the core instead of pretending it sits under
    // the first crew member; hard movement occupancy would make that source
    // permanently unreachable.
    const occupied = new Set([
      ...state.crewMembers.map((crew) => crew.tileIndex),
      ...state.residents.map((resident) => resident.tileIndex),
      ...state.visitors.map((visitor) => visitor.tileIndex)
    ]);
    const cacheCandidates = [
      ...adjacentWalkableTiles(state, state.core.serviceTile),
      state.core.serviceTile
    ];
    const reachableCacheTile = cacheCandidates.find(
      (tile) =>
        !occupied.has(tile) &&
        isWalkable(state.tiles[tile]) &&
        state.moduleOccupancyByTile[tile] === null
    ) ?? state.core.serviceTile;
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
    if (site.requiresEva) {
      const workTile = constructionWorkTile(state, site);
      const hasEvaRoute = activeAirlockTiles(state).some((airlock) => findSpacePath(state, airlock, workTile) !== null);
      if (!hasEvaRoute) {
        site.state = 'blocked';
        site.blockedReason = 'no airlock EVA route';
        continue;
      }
    }
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
  if (site.structuralProjectId !== undefined) {
    // The parent performs one atomic topology write after every child site is
    // complete. This site is still rendered and receives normal EVA work.
    return true;
  }
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
