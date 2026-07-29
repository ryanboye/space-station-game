import {
  buildStationExpansionOnTruss,
  consumeConstructionMaterials,
  createInitialState,
  materialInventoryTotal,
  moduleFootprint,
  planStationExpansionOnTruss,
  planStructuralPieceConstruction,
  setRoom,
  setTile,
  setZone,
  tick,
  validateModulePlacementForConstruction,
  validateStructuralPiecePlacement
} from '../src/sim/sim';
import {
  advanceStructuralExpansionProjects,
  applyConstructionSite,
  cancelConstructionAtTile,
  cleanupConstructionSites,
  createConstructionJobs,
  planModuleConstruction,
  planTileConstruction
} from '../src/sim/construction';
import {
  ModuleType,
  RoomType,
  TileType,
  ZoneType,
  toIndex,
  type ConstructionSite,
  type StationState
} from '../src/sim/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`editable-construction-plans: ${message}`);
}

function freshState(seed: number): StationState {
  const state = createInitialState({ seed, physicalStarterInventory: false });
  state.metrics.credits = 2_000;
  state.legacyMaterialStock = 2_000;
  state.metrics.materials = state.legacyMaterialStock + materialInventoryTotal(state);
  state.controls.materialAutoImportEnabled = false;
  return state;
}

/** Material in stores, at sites, or physically in a construction worker's hands. */
function constructionValue(state: StationState): number {
  return state.legacyMaterialStock +
    materialInventoryTotal(state) +
    state.constructionSites.reduce((sum, site) => sum + Math.max(0, site.deliveredMaterials), 0) +
    state.crewMembers.reduce(
      (sum, crew) => sum + (crew.carryingItemType === 'rawMaterial' ? Math.max(0, crew.carryingAmount) : 0),
      0
    );
}

function constructionLedgerNet(state: StationState): number {
  return state.openingEconomy.ledger.lifetime.construction.net;
}

function siteJobs(state: StationState, siteIds: ReadonlySet<number>) {
  return state.jobs.filter((job) => job.constructionSiteId !== undefined && siteIds.has(job.constructionSiteId));
}

function activeReservationForJobs(state: StationState, jobIds: ReadonlySet<number>): boolean {
  return state.reservations.some((reservation) =>
    reservation.releaseReason === null &&
    reservation.expiresAt > state.now &&
    (
      (reservation.ownerKind === 'job' && typeof reservation.ownerId === 'number' && jobIds.has(reservation.ownerId)) ||
      (reservation.kind === 'actor-job' && reservation.targetId !== null && jobIds.has(Number(reservation.targetId)))
    )
  );
}

function assertCancelledCleanly(
  state: StationState,
  siteIds: ReadonlySet<number>,
  jobIds: ReadonlySet<number>,
  expectedCredits: number,
  expectedMaterialValue: number,
  label: string
): void {
  assert(
    state.constructionSites.every((site) => !siteIds.has(site.id)),
    `${label} left a construction site behind`
  );
  assert(
    siteJobs(state, siteIds).every((job) => job.state === 'expired' || job.state === 'done'),
    `${label} left a live construction job behind`
  );
  assert(!activeReservationForJobs(state, jobIds), `${label} left an active job/crew reservation behind`);
  assert(state.metrics.credits === expectedCredits, `${label} did not restore its exact credit value`);
  assert(
    Math.abs(constructionValue(state) - expectedMaterialValue) < 0.001,
    `${label} lost or duplicated construction materials (${constructionValue(state)} vs ${expectedMaterialValue})`
  );
}

function queueAndAssignConstruction(state: StationState, site: ConstructionSite): Set<number> {
  createConstructionJobs(state);
  state.controls.paused = false;
  for (let step = 0; step < 400; step += 1) {
    tick(state, 0.025);
    const jobs = siteJobs(state, new Set([site.id])).filter((job) => job.state !== 'done' && job.state !== 'expired');
    if (jobs.some((job) => job.assignedCrewId !== null)) return new Set(jobs.map((job) => job.id));
  }
  throw new Error(`construction site ${site.id} never received a worker`);
}

function stagePartialBuild(state: StationState, site: ConstructionSite): void {
  const needed = Math.max(0, site.requiredMaterials - site.deliveredMaterials);
  assert(consumeConstructionMaterials(state, needed), `could not stage ${needed} delivered materials`);
  site.deliveredMaterials = site.requiredMaterials;
  site.buildProgress = Math.max(0.1, site.buildWorkRequired * 0.4);
  site.state = 'building';
}

function planFirstTile(state: StationState, excluded = new Set<number>()): { tile: number; site: ConstructionSite } {
  for (let tile = 0; tile < state.tiles.length; tile += 1) {
    if (
      excluded.has(tile) ||
      state.tiles[tile] !== TileType.Floor ||
      state.moduleOccupancyByTile[tile] !== null ||
      tile === state.core.serviceTile
    ) continue;
    const result = planTileConstruction(state, tile, TileType.Wall);
    if (!result.ok) continue;
    const site = state.constructionSites.find((candidate) => candidate.tileIndex === tile);
    assert(site, 'ordinary tile planning created no site');
    return { tile, site };
  }
  throw new Error('no ordinary tile plan target found');
}

function findClearRectangle(state: StationState, width: number, height: number): number[] {
  for (let y = 1; y < state.height - height; y += 1) {
    for (let x = 1; x < state.width - width; x += 1) {
      const tiles: number[] = [];
      for (let dy = 0; dy < height; dy += 1) {
        for (let dx = 0; dx < width; dx += 1) tiles.push(toIndex(x + dx, y + dy, state.width));
      }
      if (tiles.every((tile) => state.tiles[tile] === TileType.Floor && state.moduleOccupancyByTile[tile] === null)) {
        return tiles;
      }
    }
  }
  throw new Error(`no clear ${width}x${height} interior rectangle found`);
}

function prepareTablePad(state: StationState): { first: number; second: number; covered: (origin: number) => number } {
  const width = 5;
  const tiles = findClearRectangle(state, width, 2);
  for (const tile of tiles) {
    setRoom(state, tile, RoomType.Cafeteria);
    setZone(state, tile, ZoneType.Public);
  }
  tick(state, 0);
  const first = tiles[0]!;
  const second = tiles[3]!;
  assert(validateModulePlacementForConstruction(state, ModuleType.Table, first, 0).ok, 'first Table pad is invalid');
  assert(validateModulePlacementForConstruction(state, ModuleType.Table, second, 0).ok, 'second Table pad is invalid');
  return { first, second, covered: (origin) => origin + state.width + 1 };
}

function bulkheadTarget(
  state: StationState,
  excludedPieceTiles = new Set<number>()
): { origin: number; rotation: 0 | 90; tiles: number[]; covered: number } {
  for (const rotation of [0, 90] as const) {
    for (let origin = 0; origin < state.tiles.length; origin += 1) {
      const preview = validateStructuralPiecePlacement(state, origin, 'reinforced-bulkhead', rotation);
      if (!preview.ok || preview.tiles.length < 2 || preview.tiles.some((tile) => excludedPieceTiles.has(tile))) continue;
      const covered = preview.tiles.find((tile) => tile !== origin);
      if (covered !== undefined) return { origin, rotation, tiles: preview.tiles, covered };
    }
  }
  throw new Error('no multi-tile reinforced Bulkhead placement found');
}

function scaffoldPatch(state: StationState): number[] {
  for (let y = 1; y < state.height - 2; y += 1) {
    for (let x = 1; x < state.width - 2; x += 1) {
      const patch = [toIndex(x, y, state.width), toIndex(x + 1, y, state.width)];
      if (patch.some((tile) => state.tiles[tile] !== TileType.Space)) continue;
      for (const tile of patch) setTile(state, tile, TileType.Truss);
      const preview = planStationExpansionOnTruss(state, patch);
      if (preview.ok) return patch;
      for (const tile of patch) setTile(state, tile, TileType.Space);
    }
  }
  throw new Error('no supported two-tile expansion scaffold found');
}

function createExpansion(state: StationState) {
  const patch = scaffoldPatch(state);
  const beforeTiles = state.tiles.slice();
  const result = buildStationExpansionOnTruss(state, patch);
  assert(result.ok, `expansion plan failed (${result.reason ?? 'no reason'})`);
  const project = state.structuralExpansionProjects[state.structuralExpansionProjects.length - 1];
  assert(project && !project.cancelled, 'expansion plan created no active parent');
  return { patch, beforeTiles, project };
}

function finishCurrentExpansionStage(state: StationState, projectId: number): void {
  const sites = state.constructionSites.filter((site) => site.structuralProjectId === projectId && site.state !== 'done');
  assert(sites.length > 0, `project ${projectId} has no unfinished stage`);
  for (const site of sites) {
    const needed = Math.max(0, site.requiredMaterials - site.deliveredMaterials);
    assert(consumeConstructionMaterials(state, needed), `could not deliver expansion stage materials`);
    site.deliveredMaterials = site.requiredMaterials;
    site.buildProgress = site.buildWorkRequired;
    assert(applyConstructionSite(state, site), `could not finish expansion child ${site.id}`);
    site.state = 'done';
  }
  advanceStructuralExpansionProjects(state);
  cleanupConstructionSites(state);
}

function finishExpansion(state: StationState, projectId: number): void {
  const project = state.structuralExpansionProjects.find((candidate) => candidate.id === projectId);
  assert(project, `missing expansion ${projectId}`);
  for (let stage = 0; stage < 5 && !project.commissioned; stage += 1) {
    finishCurrentExpansionStage(state, projectId);
    assert(project.phase !== 'blocked', `expansion blocked during deterministic completion (${project.blockedReason ?? 'none'})`);
  }
  assert(project.commissioned, 'expansion did not commission after all staged work');
}

let checks = 0;

// Ordinary tile: queued/assigned plans cancel cleanly, can move elsewhere,
// refund partial work, and stop being editable after completion.
{
  const state = freshState(51501);
  const baselineCredits = state.metrics.credits;
  const baselineMaterials = constructionValue(state);
  const first = planFirstTile(state);
  const firstTileValue = state.tiles[first.tile];
  const firstSiteIds = new Set([first.site.id]);
  const firstJobIds = queueAndAssignConstruction(state, first.site);
  assert(first.site.deliveredMaterials === 0, 'ordinary tile assignment delivered material before the pre-delivery cancellation check');
  assert(cancelConstructionAtTile(state, first.tile), 'ordinary tile would not cancel before completion');
  assertCancelledCleanly(state, firstSiteIds, firstJobIds, baselineCredits, baselineMaterials, 'ordinary tile');
  assert(state.tiles[first.tile] === firstTileValue, 'ordinary tile cancellation changed topology');
  assert(!cancelConstructionAtTile(state, first.tile), 'ordinary tile double-cancel succeeded');

  const second = planFirstTile(state, new Set([first.tile]));
  stagePartialBuild(state, second.site);
  const secondSiteIds = new Set([second.site.id]);
  createConstructionJobs(state);
  const secondJobIds = new Set(siteJobs(state, secondSiteIds).map((job) => job.id));
  assert(cancelConstructionAtTile(state, second.tile), 'part-built ordinary tile would not cancel');
  assertCancelledCleanly(state, secondSiteIds, secondJobIds, baselineCredits, baselineMaterials, 'part-built ordinary tile');

  const completed = planFirstTile(state, new Set([first.tile, second.tile]));
  stagePartialBuild(state, completed.site);
  completed.site.buildProgress = completed.site.buildWorkRequired;
  assert(applyConstructionSite(state, completed.site), 'ordinary tile did not commission');
  completed.site.state = 'done';
  cleanupConstructionSites(state);
  assert(!cancelConstructionAtTile(state, completed.tile), 'commissioned tile remained silently editable');
  assert(state.tiles[completed.tile] === TileType.Wall, 'commissioned tile disappeared');
  checks += 1;
}

// Multi-tile module: any covered tile can cancel, replanning works elsewhere,
// partial delivered/build value returns once, and commissioned hardware stays.
{
  const state = freshState(51502);
  const pad = prepareTablePad(state);
  const baselineCredits = state.metrics.credits;
  const baselineMaterials = constructionValue(state);
  const firstPlan = planModuleConstruction(state, pad.first, ModuleType.Table);
  assert(firstPlan.ok, `Table plan failed (${firstPlan.reason ?? 'no reason'})`);
  const firstSite = state.constructionSites.find((site) => site.tileIndex === pad.first);
  assert(firstSite, 'Table plan created no site');
  const firstIds = new Set([firstSite.id]);
  createConstructionJobs(state);
  const firstJobs = new Set(siteJobs(state, firstIds).map((job) => job.id));
  assert(cancelConstructionAtTile(state, pad.covered(pad.first)), 'Table would not cancel from a covered footprint tile');
  assertCancelledCleanly(state, firstIds, firstJobs, baselineCredits, baselineMaterials, 'multi-tile module');
  assert(!cancelConstructionAtTile(state, pad.covered(pad.first)), 'Table double-cancel succeeded');

  const secondPlan = planModuleConstruction(state, pad.second, ModuleType.Table);
  assert(secondPlan.ok, `Table replan elsewhere failed (${secondPlan.reason ?? 'no reason'})`);
  const secondSite = state.constructionSites.find((site) => site.tileIndex === pad.second);
  assert(secondSite, 'replanned Table created no site');
  stagePartialBuild(state, secondSite);
  const secondIds = new Set([secondSite.id]);
  createConstructionJobs(state);
  const secondJobs = new Set(siteJobs(state, secondIds).map((job) => job.id));
  assert(cancelConstructionAtTile(state, pad.covered(pad.second)), 'part-built Table would not cancel');
  assertCancelledCleanly(state, secondIds, secondJobs, baselineCredits, baselineMaterials, 'part-built multi-tile module');

  assert(planModuleConstruction(state, pad.second, ModuleType.Table).ok, 'Table could not be planned for completion');
  const completed = state.constructionSites.find((site) => site.tileIndex === pad.second);
  assert(completed, 'completion Table site missing');
  stagePartialBuild(state, completed);
  completed.buildProgress = completed.buildWorkRequired;
  assert(applyConstructionSite(state, completed), 'Table did not commission');
  completed.state = 'done';
  cleanupConstructionSites(state);
  assert(!cancelConstructionAtTile(state, pad.covered(pad.second)), 'commissioned Table remained silently editable');
  assert(state.modules[pad.second] === ModuleType.Table, 'commissioned Table disappeared');
  checks += 1;
}

// A multi-tile structural piece refunds its atomic credit charge and materials
// from a non-origin covered tile, then becomes real structure at completion.
{
  const state = freshState(51503);
  const baselineCredits = state.metrics.credits;
  const baselineLedger = constructionLedgerNet(state);
  const baselineMaterials = constructionValue(state);
  const first = bulkheadTarget(state);
  const firstPlan = planStructuralPieceConstruction(state, first.origin, 'reinforced-bulkhead', first.rotation);
  assert(firstPlan.ok && firstPlan.pieceId !== undefined, `Bulkhead plan failed (${firstPlan.reason ?? 'no reason'})`);
  const firstSite = state.constructionSites.find((site) => site.structuralPieceId === firstPlan.pieceId);
  assert(firstSite, 'Bulkhead plan created no site');
  const firstIds = new Set([firstSite.id]);
  createConstructionJobs(state);
  const firstJobs = new Set(siteJobs(state, firstIds).map((job) => job.id));
  assert(firstSite.deliveredMaterials === 0, 'fresh Bulkhead already had delivered value');
  assert(cancelConstructionAtTile(state, first.covered), 'Bulkhead would not cancel from its non-origin tile');
  assertCancelledCleanly(state, firstIds, firstJobs, baselineCredits, baselineMaterials, 'structural piece');
  assert(constructionLedgerNet(state) === baselineLedger, 'Bulkhead cancellation left a net construction charge');
  assert(!state.structuralPieces.some((piece) => piece.id === firstPlan.pieceId), 'cancelled Bulkhead shell remained');
  assert(!cancelConstructionAtTile(state, first.covered), 'Bulkhead double-cancel succeeded');

  const second = bulkheadTarget(state, new Set(first.tiles));
  const secondPlan = planStructuralPieceConstruction(state, second.origin, 'reinforced-bulkhead', second.rotation);
  assert(secondPlan.ok && secondPlan.pieceId !== undefined, `Bulkhead replan elsewhere failed (${secondPlan.reason ?? 'no reason'})`);
  const partial = state.constructionSites.find((site) => site.structuralPieceId === secondPlan.pieceId);
  assert(partial, 'replanned Bulkhead site missing');
  stagePartialBuild(state, partial);
  const partialIds = new Set([partial.id]);
  createConstructionJobs(state);
  const partialJobs = new Set(siteJobs(state, partialIds).map((job) => job.id));
  assert(cancelConstructionAtTile(state, second.covered), 'part-built Bulkhead would not cancel from its non-origin tile');
  assertCancelledCleanly(state, partialIds, partialJobs, baselineCredits, baselineMaterials, 'part-built structural piece');
  assert(constructionLedgerNet(state) === baselineLedger, 'part-built Bulkhead cancellation left a net construction charge');
  assert(!cancelConstructionAtTile(state, second.covered), 'part-built Bulkhead double-cancel succeeded');

  const completionPlan = planStructuralPieceConstruction(state, second.origin, 'reinforced-bulkhead', second.rotation);
  assert(completionPlan.ok && completionPlan.pieceId !== undefined, `Bulkhead completion plan failed (${completionPlan.reason ?? 'no reason'})`);
  const completed = state.constructionSites.find((site) => site.structuralPieceId === completionPlan.pieceId);
  assert(completed, 'completion Bulkhead site missing');
  stagePartialBuild(state, completed);
  completed.buildProgress = completed.buildWorkRequired;
  assert(applyConstructionSite(state, completed), 'Bulkhead did not commission');
  completed.state = 'done';
  cleanupConstructionSites(state);
  assert(!cancelConstructionAtTile(state, second.covered), 'commissioned Bulkhead remained silently editable');
  assert(state.structuralPieces.some((piece) => piece.id === completionPlan.pieceId && piece.completed), 'commissioned Bulkhead disappeared');
  checks += 1;
}

// Multi-stage expansion: cancellation works before delivery, can be replanned,
// and returns completed perimeter plus partial interior value exactly once.
{
  const state = freshState(51504);
  const early = createExpansion(state);
  const baselineCredits = state.metrics.credits;
  const baselineMaterials = constructionValue(state);
  const earlySites = state.constructionSites.filter((site) => site.structuralProjectId === early.project.id);
  const earlyIds = new Set(earlySites.map((site) => site.id));
  createConstructionJobs(state);
  const earlyJobs = new Set(siteJobs(state, earlyIds).map((job) => job.id));
  assert(cancelConstructionAtTile(state, earlySites[0]!.tileIndex), 'fresh expansion would not cancel');
  assertCancelledCleanly(state, earlyIds, earlyJobs, baselineCredits, baselineMaterials, 'fresh structural expansion');
  assert(early.project.cancelled, 'cancelled expansion parent was not closed');
  assert(early.beforeTiles.every((tile, index) => state.tiles[index] === tile), 'fresh expansion cancellation changed topology');
  assert(!cancelConstructionAtTile(state, earlySites[0]!.tileIndex), 'fresh expansion double-cancel succeeded');

  const replanned = buildStationExpansionOnTruss(state, early.patch);
  assert(replanned.ok, `cancelled expansion could not be replanned (${replanned.reason ?? 'no reason'})`);
  const project = state.structuralExpansionProjects[state.structuralExpansionProjects.length - 1]!;
  finishCurrentExpansionStage(state, project.id);
  assert(project.phase === 'interior', `expansion did not reach its second stage (${project.phase})`);
  const interior = state.constructionSites.filter((site) => site.structuralProjectId === project.id);
  assert(interior.length > 0 && interior.every((site) => site.structuralStage === 'interior'), 'interior stage sites missing');
  stagePartialBuild(state, interior[0]!);
  if (interior[1]) {
    assert(consumeConstructionMaterials(state, 1), 'could not stage a partial interior delivery');
    interior[1].deliveredMaterials = 1;
    interior[1].state = 'delivering';
  }
  advanceStructuralExpansionProjects(state);
  const partialIds = new Set(interior.map((site) => site.id));
  createConstructionJobs(state);
  const partialJobs = new Set(siteJobs(state, partialIds).map((job) => job.id));
  assert(cancelConstructionAtTile(state, interior[0]!.tileIndex), 'part-built second-stage expansion would not cancel');
  assertCancelledCleanly(state, partialIds, partialJobs, baselineCredits, baselineMaterials, 'part-built structural expansion');
  assert(project.cancelled, 'part-built expansion parent was not closed');
  assert(early.beforeTiles.every((tile, index) => state.tiles[index] === tile), 'part-built expansion cancellation left a shell');
  assert(!cancelConstructionAtTile(state, interior[0]!.tileIndex), 'part-built expansion double-cancel succeeded');

  const finalPlan = buildStationExpansionOnTruss(state, early.patch);
  assert(finalPlan.ok, `expansion could not be planned for completion (${finalPlan.reason ?? 'no reason'})`);
  const commissioned = state.structuralExpansionProjects[state.structuralExpansionProjects.length - 1]!;
  finishExpansion(state, commissioned.id);
  assert(!cancelConstructionAtTile(state, commissioned.targets[0]!.tileIndex), 'commissioned expansion remained silently editable');
  assert(commissioned.targets.every((target) => state.tiles[target.tileIndex] === target.targetTile), 'commissioned expansion topology disappeared');
  checks += 1;
}

console.log(JSON.stringify({
  status: 'PASS',
  checks,
  contract: 'cancel from any covered tile; exact once-only recovery; immediate replan; no active site/job/reservation/shell/charge; commissioned work is immutable'
}));
