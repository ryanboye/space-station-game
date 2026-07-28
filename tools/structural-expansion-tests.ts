import {
  buildStationExpansionOnTruss,
  createInitialState,
  expandMap,
  planStationExpansionOnTruss,
  setTile,
  tick
} from '../src/sim/sim';
import {
  advanceStructuralExpansionProjects,
  applyConstructionSite,
  cancelConstructionAtTile,
  findConstructionPath
} from '../src/sim/construction';
import { captureSnapshot, hydrateStateFromSave } from '../src/sim/save';
import { TileType, fromIndex, inBounds, isWalkable, toIndex, type StationState } from '../src/sim/types';

function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function expansionPatch(state: StationState): number[] {
  for (let y = 1; y < state.height - 2; y++) {
    for (let x = 1; x < state.width - 2; x++) {
      const patch = [
        toIndex(x, y, state.width),
        toIndex(x + 1, y, state.width),
        toIndex(x, y + 1, state.width),
        toIndex(x + 1, y + 1, state.width)
      ];
      if (patch.some((tile) => state.tiles[tile] !== TileType.Space)) continue;
      for (const tile of patch) setTile(state, tile, TileType.Truss);
      if (planStationExpansionOnTruss(state, patch).ok) return patch;
      for (const tile of patch) setTile(state, tile, TileType.Space);
    }
  }
  throw new Error('Could not find a valid truss expansion patch.');
}

function scaffoldPatch(state: StationState): number[] {
  return expansionPatch(state);
}

function createProject(state: StationState) {
  const patch = scaffoldPatch(state);
  const result = buildStationExpansionOnTruss(state, patch);
  assertCondition(result.ok, `Expected scaffold expansion to plan (${result.reason ?? 'no reason'}).`);
  const project = state.structuralExpansionProjects[0];
  assertCondition(project !== undefined, 'Expected one durable structural project.');
  return { patch, project, result };
}

function installBoundaryAirlock(state: StationState): number {
  for (let tile = 0; tile < state.tiles.length; tile++) {
    if (state.tiles[tile] !== TileType.Wall) continue;
    const point = fromIndex(tile, state.width);
    const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .map(([dx, dy]) => ({ x: point.x + dx, y: point.y + dy }))
      .filter((candidate) => inBounds(candidate.x, candidate.y, state.width, state.height))
      .map((candidate) => toIndex(candidate.x, candidate.y, state.width));
    if (!neighbors.some((neighbor) => isWalkable(state.tiles[neighbor]))) continue;
    if (!neighbors.some((neighbor) => state.tiles[neighbor] === TileType.Space)) continue;
    setTile(state, tile, TileType.Airlock);
    return tile;
  }
  throw new Error('Could not find a boundary wall for an active Airlock.');
}

function removeBoundaryAirlocks(state: StationState): void {
  for (let tile = 0; tile < state.tiles.length; tile++) {
    if (state.tiles[tile] === TileType.Airlock) setTile(state, tile, TileType.Wall);
  }
}

// The authored starter exposes one reachable EVA transition and a supported
// truss lesson while preserving the long east/west faces for later Berths.
{
  const state = createInitialState({ seed: 90100 });
  const airlocks = state.tiles
    .map((tile, index) => ({ tile, index }))
    .filter(({ tile }) => tile === TileType.Airlock)
    .map(({ index }) => index);
  assertCondition(airlocks.length === 1, `Starter should author one Airlock, found ${airlocks.length}.`);
  const airlock = airlocks[0]!;
  assertCondition(
    findConstructionPath(state, state.core.serviceTile, {
      id: -1,
      kind: 'tile',
      tileIndex: state.tiles.findIndex((tile, index) => {
        if (tile !== TileType.Truss) return false;
        const point = fromIndex(index, state.width);
        const lock = fromIndex(airlock, state.width);
        return Math.abs(point.x - lock.x) + Math.abs(point.y - lock.y) === 1;
      }),
      targetTile: TileType.Floor,
      requiredMaterials: 1,
      deliveredMaterials: 0,
      buildProgress: 0,
      buildWorkRequired: 1,
      requiresEva: true,
      assignedCrewId: null,
      state: 'planned',
      blockedReason: null,
      createdAt: state.now
    }) !== null,
    'Starter Airlock should provide an EVA route to its exterior truss lesson.'
  );
  const starterTruss = state.tiles.filter((tile) => tile === TileType.Truss).length;
  assertCondition(starterTruss === 3, `Starter should expose one short truss finger, found ${starterTruss} tiles.`);
}

// Deterministic rejection must not touch project state or materials.
{
  const state = createInitialState({ seed: 90101 });
  const patch = expansionPatch(state);
  for (const tile of patch) setTile(state, tile, TileType.Truss);
  const beforeMaterials = state.metrics.materials;
  // Break the support path by selecting a disconnected truss instead.
  const disconnected = toIndex(2, 2, state.width);
  setTile(state, disconnected, TileType.Truss);
  const result = buildStationExpansionOnTruss(state, [disconnected]);
  assertCondition(!result.ok, 'Disconnected scaffold should fail deterministic validation.');
  assertCondition(state.structuralExpansionProjects.length === 0, 'Rejected expansion must not create a project.');
  assertCondition(state.metrics.materials === beforeMaterials, 'Rejected expansion must not consume materials.');
}

// A connected deck still fails when its unsupported run exceeds the support cap.
{
  const state = createInitialState({ seed: 901011 });
  state.tiles.fill(TileType.Space);
  const coreX = state.core.serviceTile % state.width;
  const coreY = Math.floor(state.core.serviceTile / state.width);
  state.tiles[state.core.serviceTile] = TileType.Floor;
  state.tiles[toIndex(coreX + 1, coreY, state.width)] = TileType.Wall;
  const longRun: number[] = [];
  for (let x = coreX + 2; x <= coreX + 10; x++) {
    const tile = toIndex(x, coreY, state.width);
    state.tiles[tile] = TileType.Truss;
    longRun.push(tile);
  }
  const result = buildStationExpansionOnTruss(state, longRun);
  assertCondition(
    !result.ok && result.reason === 'structural support: span-exceeded',
    `An over-span scaffold must be rejected by structural support (${result.reason ?? 'accepted'}).`
  );
  assertCondition(state.structuralExpansionProjects.length === 0, 'Over-span rejection must not create a project.');
}

// Planning creates only staged EVA sites: no instant floor, wall, door, or material charge.
{
  const state = createInitialState({ seed: 90102 });
  const { patch, project, result } = createProject(state);
  assertCondition(project.phase === 'perimeter', 'First stage must build the perimeter before interior flooring.');
  assertCondition(state.constructionSites.length > 0, 'Project should create construction sites.');
  assertCondition(state.constructionSites.every((site) => site.structuralProjectId === project.id && site.requiresEva), 'Structural child sites must be linked EVA work.');
  assertCondition(state.constructionSites.every((site) => site.structuralStage === 'perimeter'), 'Only perimeter work should be opened initially.');
  assertCondition(patch.every((tile) => state.tiles[tile] === TileType.Truss), 'Planning must not immediately mutate truss into floor.');
  assertCondition(state.legacyMaterialStock > 0, 'Planning must not deduct the full material total up front.');
  assertCondition(result.requiredMaterials === project.requiredMaterials, 'Return contract must report parent material total.');
}

// No airlock means construction cannot produce a route or a partial hull.
{
  const state = createInitialState({ seed: 90103 });
  removeBoundaryAirlocks(state);
  const { patch, project } = createProject(state);
  const site = state.constructionSites[0]!;
  assertCondition(findConstructionPath(state, state.core.serviceTile, site) === null, 'Exterior structural site must have no route without an active airlock.');
  state.controls.paused = false;
  tick(state, 1);
  assertCondition(state.constructionSites.some((candidate) => candidate.state === 'blocked'), 'No material/EVA route should visibly block structural work.');
  assertCondition(patch.every((tile) => state.tiles[tile] === TileType.Truss), 'Blocked project must leave the station topology unchanged.');
  assertCondition(!project.commissioned, 'Blocked project must not commission.');
}

// Existing logistics and EVA movement perform real delivery and build work.
{
  const state = createInitialState({ seed: 901031 });
  installBoundaryAirlock(state);
  state.legacyMaterialStock = 500;
  state.metrics.materials = 500;
  const { project } = createProject(state);
  state.controls.paused = false;
  const startingMaterials = state.legacyMaterialStock;
  let sawEvaCrew = false;
  for (let step = 0; step < 1800 && project.deliveredMaterials <= 0; step++) {
    tick(state, 0.1);
    sawEvaCrew ||= state.crewMembers.some((crew) => crew.evaSuit && crew.activeJobId !== null);
  }
  assertCondition(project.deliveredMaterials > 0, 'Existing logistics jobs must deliver structural materials.');
  assertCondition(state.legacyMaterialStock < startingMaterials, 'Real delivery must debit the material source.');
  assertCondition(sawEvaCrew, 'Existing EVA movement must suit a structural construction worker.');

  const snapshot = captureSnapshot(state);
  const resumed = hydrateStateFromSave({ schemaVersion: 3, snapshot, gameVersion: 'test', name: 'structural-progress', createdAt: '2026-01-01T00:00:00.000Z' }).state;
  const resumedProject = resumed.structuralExpansionProjects[0];
  assertCondition(resumedProject?.phase === project.phase, 'Save/resume must preserve the active structural phase.');
  assertCondition(resumedProject.deliveredMaterials === project.deliveredMaterials, 'Save/resume must preserve material accounting.');
  assertCondition(resumed.constructionSites.some((site) => site.structuralProjectId === resumedProject.id), 'Save/resume must retain the active linked work sites.');
}

// Completion visibly advances perimeter -> interior -> seal check and only
// commissions atomically after the real zero-material EVA seal work.
{
  const state = createInitialState({ seed: 90104 });
  const { patch, project } = createProject(state);
  for (const site of [...state.constructionSites]) {
    site.deliveredMaterials = site.requiredMaterials;
    site.buildProgress = site.buildWorkRequired;
    assertCondition(applyConstructionSite(state, site), 'Deferred structural site should complete its work record.');
    site.state = 'done';
  }
  advanceStructuralExpansionProjects(state);
  assertCondition(String(project.phase) === 'interior', 'Finished perimeter should release the interior stage.');
  assertCondition(patch.every((tile) => state.tiles[tile] === TileType.Truss), 'Perimeter completion must still not mutate topology.');
  for (const site of state.constructionSites.filter((candidate) => candidate.structuralStage === 'interior')) {
    site.deliveredMaterials = site.requiredMaterials;
    site.buildProgress = site.buildWorkRequired;
    assertCondition(applyConstructionSite(state, site), 'Interior work record should complete.');
    site.state = 'done';
  }
  advanceStructuralExpansionProjects(state);
  const sealSite = state.constructionSites.find((candidate) => candidate.structuralStage === 'seal-check');
  assertCondition(sealSite !== undefined, `Finished interior must release one visible seal-check site (${project.phase}: ${project.blockedReason ?? 'no blocker'}).`);
  assertCondition(String(project.phase) === 'seal-check', 'Finished interior must advance the parent to seal-check.');
  assertCondition(sealSite.requiresEva, 'Seal check must require an EVA worker.');
  assertCondition(sealSite.requiredMaterials === 0 && sealSite.buildWorkRequired > 0, 'Seal check must be short real zero-material work.');
  assertCondition(patch.every((tile) => state.tiles[tile] === TileType.Truss), 'No topology may mutate before seal completion.');
  const sealSnapshot = captureSnapshot(state);
  const sealResumed = hydrateStateFromSave({ schemaVersion: 3, snapshot: sealSnapshot, gameVersion: 'test', name: 'structural-seal-check', createdAt: '2026-01-01T00:00:00.000Z' }).state;
  assertCondition(
    sealResumed.constructionSites.some((site) => site.structuralProjectId === project.id && site.structuralStage === 'seal-check'),
    'Save/resume must retain an in-progress seal-check site.'
  );
  sealSite.buildProgress = sealSite.buildWorkRequired * 0.5;
  assertCondition(applyConstructionSite(state, sealSite), 'Seal check should use the ordinary construction work record.');
  assertCondition(!project.commissioned, 'Partial seal work must not commission the shell.');
  sealSite.buildProgress = sealSite.buildWorkRequired;
  sealSite.state = 'done';
  for (const tile of patch) state.tiles[tile] = TileType.Space;
  advanceStructuralExpansionProjects(state);
  assertCondition(String(project.phase) === 'blocked' && !project.commissioned, 'Commissioning must revalidate support after seal completion.');
  for (const tile of patch) state.tiles[tile] = TileType.Truss;
  advanceStructuralExpansionProjects(state);
  assertCondition(project.commissioned, 'All completed child work should commission once.');
  assertCondition(patch.every((tile) => state.tiles[tile] === TileType.Floor), 'Atomic commission should produce the planned floor geometry.');
  assertCondition(project.doorTile !== null && state.tiles[project.doorTile] === TileType.Door, 'Atomic commission should apply the planned door.');
}

// The seal gate validates the whole planned shell before issuing its work.
{
  const state = createInitialState({ seed: 901041 });
  const { project } = createProject(state);
  for (const site of [...state.constructionSites]) {
    site.deliveredMaterials = site.requiredMaterials;
    site.buildProgress = site.buildWorkRequired;
    site.state = 'done';
  }
  advanceStructuralExpansionProjects(state);
  for (const site of state.constructionSites.filter((candidate) => candidate.structuralStage === 'interior')) {
    site.deliveredMaterials = site.requiredMaterials;
    site.buildProgress = site.buildWorkRequired;
    site.state = 'done';
  }
  const missingWall = project.targets.find((target) => target.targetTile === TileType.Wall)!;
  project.targets = project.targets.filter((target) => target.tileIndex !== missingWall.tileIndex);
  advanceStructuralExpansionProjects(state);
  assertCondition(
    project.phase === 'blocked' && project.blockedReason === `incomplete seal at ${fromIndex(missingWall.tileIndex, state.width).x},${fromIndex(missingWall.tileIndex, state.width).y}`,
    `Missing perimeter must expose its exact seal blocker (${project.blockedReason ?? 'none'}).`
  );
}

{
  const state = createInitialState({ seed: 901042 });
  const { project } = createProject(state);
  for (const site of [...state.constructionSites]) {
    site.deliveredMaterials = site.requiredMaterials;
    site.buildProgress = site.buildWorkRequired;
    site.state = 'done';
  }
  advanceStructuralExpansionProjects(state);
  for (const site of state.constructionSites.filter((candidate) => candidate.structuralStage === 'interior')) {
    site.deliveredMaterials = site.requiredMaterials;
    site.buildProgress = site.buildWorkRequired;
    site.state = 'done';
  }
  const door = project.doorTile!;
  project.doorTile = null;
  advanceStructuralExpansionProjects(state);
  const point = fromIndex(door, state.width);
  assertCondition(
    project.phase === 'blocked' && project.blockedReason === `missing doorway at ${point.x},${point.y}`,
    `Missing doorway must expose its exact seal blocker (${project.blockedReason ?? 'none'}).`
  );
}

// Cancelling one project removes only its work and returns delivered value once.
{
  const state = createInitialState({ seed: 90105 });
  const { project } = createProject(state);
  const unrelatedTile = toIndex(8, 8, state.width);
  state.constructionSites.push({
    id: 90001,
    kind: 'tile',
    tileIndex: unrelatedTile,
    targetTile: TileType.Floor,
    requiredMaterials: 2,
    deliveredMaterials: 1,
    buildProgress: 0,
    buildWorkRequired: 5,
    requiresEva: false,
    assignedCrewId: null,
    state: 'planned',
    blockedReason: null,
    createdAt: state.now
  });
  const first = state.constructionSites.find((site) => site.structuralProjectId === project.id)!;
  first.deliveredMaterials = 2;
  project.deliveredMaterials = 2;
  const before = state.legacyMaterialStock;
  assertCondition(cancelConstructionAtTile(state, first.tileIndex), 'Cancelling any project child should cancel the parent.');
  assertCondition(project.cancelled && project.refundedMaterials === 2, 'Project should record one exact delivered-material refund.');
  assertCondition(state.legacyMaterialStock === before + 2, 'Cancellation should return delivered materials once.');
  assertCondition(state.constructionSites.some((site) => site.id === 90001), 'Cancelling a project must leave unrelated construction intact.');
  assertCondition(!cancelConstructionAtTile(state, first.tileIndex), 'A cancelled project must not refund twice.');
}

// Parent/linkage survive save and all target references remap with grid growth.
{
  const state = createInitialState({ seed: 90106 });
  const { project } = createProject(state);
  const [partialDelivery, partialBuild] = state.constructionSites;
  assertCondition(partialDelivery !== undefined && partialBuild !== undefined, 'Save coverage needs two structural child sites.');
  partialDelivery.deliveredMaterials = Math.min(1, partialDelivery.requiredMaterials);
  partialBuild.deliveredMaterials = partialBuild.requiredMaterials;
  partialBuild.buildProgress = partialBuild.buildWorkRequired * 0.4;
  partialBuild.state = 'building';
  project.deliveredMaterials = partialDelivery.deliveredMaterials + partialBuild.deliveredMaterials;
  const snapshot = captureSnapshot(state);
  const hydrated = hydrateStateFromSave({ schemaVersion: 3, snapshot, gameVersion: 'test', name: 'structural', createdAt: '2026-01-01T00:00:00.000Z' });
  const restored = hydrated.state;
  const restoredProject = restored.structuralExpansionProjects[0];
  assertCondition(restoredProject?.id === project.id, 'Hydration must preserve parent identity.');
  assertCondition(restored.constructionSites.every((site) => site.structuralProjectId === project.id), 'Hydration must preserve child linkage.');
  const restoredDelivery = restored.constructionSites.find((site) => site.id === partialDelivery.id);
  const restoredBuild = restored.constructionSites.find((site) => site.id === partialBuild.id);
  assertCondition(restoredDelivery?.deliveredMaterials === partialDelivery.deliveredMaterials, 'Hydration must preserve partial delivery.');
  assertCondition(restoredBuild?.buildProgress === partialBuild.buildProgress, 'Hydration must preserve partial build work.');
  restored.metrics.credits = 100000;
  const oldTargets = restoredProject!.targets.map((target) => target.tileIndex);
  const expanded = expandMap(restored, 'north');
  assertCondition(expanded.ok, 'Grid expansion should succeed for structural remap coverage.');
  const shifted = restored.structuralExpansionProjects[0]!;
  const northShift = (expanded.height - state.height) * restored.width;
  assertCondition(shifted.targets.every((target, index) => target.tileIndex === oldTargets[index]! + northShift), 'Grid expansion must remap every structural target.');
  assertCondition(shifted.doorTile !== null, 'Grid expansion must retain the remapped door target.');
}

console.log('Structural expansion tests passed.');
