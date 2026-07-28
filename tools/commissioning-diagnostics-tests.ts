import { createInitialState, setCrewPath, setTile, tick } from '../src/sim/sim';
import {
  createConstructionJobs,
  createStructuralExpansionProject,
  deriveStructuralTieInWork,
  EVA_LOW_OXYGEN_SEC,
  findSpacePath
} from '../src/sim/construction';
import { TileType, fromIndex, inBounds, isWalkable, toIndex, type StationState } from '../src/sim/types';

function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function appendBuildJob(state: StationState, siteId: number, tileIndex: number, crewId: number) {
  const job: StationState['jobs'][number] = {
    id: state.jobSpawnCounter++,
    type: 'construct',
    itemType: 'rawMaterial',
    amount: 0,
    fromTile: tileIndex,
    toTile: tileIndex,
    assignedCrewId: crewId,
    createdAt: state.now,
    expiresAt: state.now + 1000,
    state: 'in_progress',
    pickedUpAmount: 0,
    completedAt: null,
    lastProgressAt: state.now,
    stallReason: 'none',
    stalledSince: undefined,
    constructionSiteId: siteId,
    constructionMode: 'build',
    repairProgress: 0
  };
  state.jobs.push(job);
  return job;
}

function actorFree(state: StationState, tile: number): boolean {
  return state.crewMembers.every((crew) => crew.tileIndex !== tile) &&
    state.visitors.every((visitor) => visitor.tileIndex !== tile) &&
    state.residents.every((resident) => resident.tileIndex !== tile);
}

function placeCrew(state: StationState, crew: StationState['crewMembers'][number], tile: number): void {
  const point = fromIndex(tile, state.width);
  crew.tileIndex = tile;
  crew.x = point.x + 0.5;
  crew.y = point.y + 0.5;
}

// Stock exists, but no route connects it to the work face. Opening one real
// floor gateway clears the diagnosis and creates the real delivery job.
{
  const state = createInitialState({ seed: 903001 });
  state.constructionSites = [];
  state.jobs = [];
  state.legacyMaterialStock = 8;
  for (const node of state.itemNodes) node.items.rawMaterial = 0;
  const workTile = state.tiles.findIndex((tile, index) =>
    index !== state.core.serviceTile && isWalkable(tile) && state.moduleOccupancyByTile[index] === null && actorFree(state, index)
  );
  assertCondition(workTile >= 0, 'Staging-route coverage needs a free interior work tile.');
  const point = fromIndex(workTile, state.width);
  const neighbors = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const)
    .map(([dx, dy]) => ({ x: point.x + dx, y: point.y + dy }))
    .filter((candidate) => inBounds(candidate.x, candidate.y, state.width, state.height))
    .map((candidate) => toIndex(candidate.x, candidate.y, state.width));
  const gateway = neighbors.find((tile) => isWalkable(state.tiles[tile]));
  assertCondition(gateway !== undefined, 'Staging-route coverage needs a closable walkable gateway.');
  const originalGatewayTile = state.tiles[gateway]!;
  for (const neighbor of neighbors) setTile(state, neighbor, TileType.Wall);
  const site: StationState['constructionSites'][number] = {
    id: state.constructionSiteSpawnCounter++, kind: 'tile', tileIndex: workTile,
    targetTile: TileType.Floor, requiredMaterials: 2, deliveredMaterials: 0,
    buildProgress: 0, buildWorkRequired: 2, requiresEva: false,
    assignedCrewId: null, state: 'planned', blockedReason: null, createdAt: state.now
  };
  state.constructionSites.push(site);
  createConstructionJobs(state);
  assertCondition(
    site.state === 'blocked' && site.blockedReason === 'no construction staging route',
    `Isolated stock must report no construction staging route (${site.blockedReason ?? 'none'}).`
  );
  assertCondition(!state.jobs.some((job) => job.constructionSiteId === site.id), 'Pathless staging must not invent a delivery job.');
  setTile(state, gateway, originalGatewayTile);
  createConstructionJobs(state);
  assertCondition(String(site.state) === 'planned' && site.blockedReason === null, 'Opening the gateway must clear the staging blocker.');
  assertCondition(
    state.jobs.some((job) => job.constructionSiteId === site.id && job.constructionMode === 'deliver' && job.state === 'pending'),
    'Opening the gateway must resume work with a real delivery job.'
  );
}

// Reusing a live Airlock derives explicit zero-material perimeter tie-in
// work. A geometry-authored Door remains the authoritative doorway target.
{
  const state = createInitialState({ seed: 903002 });
  const airlock = state.tiles.findIndex((tile) => tile === TileType.Airlock);
  assertCondition(airlock >= 0, 'Tie-in coverage needs the starter Airlock.');
  const lockPoint = fromIndex(airlock, state.width);
  const floorTile = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const)
    .map(([dx, dy]) => ({ x: lockPoint.x + dx, y: lockPoint.y + dy }))
    .filter((point) => inBounds(point.x, point.y, state.width, state.height))
    .map((point) => toIndex(point.x, point.y, state.width))
    .find((tile) => state.tiles[tile] === TileType.Truss);
  assertCondition(floorTile !== undefined, 'Starter Airlock must touch its exterior Truss lesson.');
  const geometry = {
    bounds: {
      minX: floorTile % state.width,
      minY: Math.floor(floorTile / state.width),
      maxX: floorTile % state.width,
      maxY: Math.floor(floorTile / state.width)
    },
    doorTile: null,
    targets: [{ tileIndex: floorTile, targetTile: TileType.Floor, requiredMaterials: 1 }],
    requiredMaterials: 1
  };
  const derived = deriveStructuralTieInWork(state, geometry);
  assertCondition(derived.doorTile === airlock, 'A reused Airlock must become the shell tie-in authority.');
  assertCondition(
    derived.targets.some((target) => target.tileIndex === airlock && target.targetTile === TileType.Airlock && target.requiredMaterials === 0),
    'A reused Airlock must derive zero-material tie-in work.'
  );
  const project = createStructuralExpansionProject(state, geometry);
  assertCondition(
    state.constructionSites.some((site) =>
      site.structuralProjectId === project.id && site.tileIndex === airlock &&
      site.targetTile === TileType.Airlock && site.structuralStage === 'perimeter' && site.requiresEva
    ),
    'Airlock tie-in work must use the ordinary perimeter construction stage.'
  );

  const doorTile = toIndex(6, 6, state.width);
  const doorGeometry = {
    ...geometry,
    doorTile,
    targets: [...geometry.targets, { tileIndex: doorTile, targetTile: TileType.Door, requiredMaterials: 1 }],
    requiredMaterials: 2
  };
  const derivedDoor = deriveStructuralTieInWork(state, doorGeometry);
  assertCondition(
    derivedDoor.doorTile === doorTile && derivedDoor.targets.some((target) => target.tileIndex === doorTile && target.targetTile === TileType.Door),
    'An authored wall opening must remain explicit Door work.'
  );
}

// A low-reserve EVA worker retreats with a precise blocker. Returning through
// the Airlock refreshes oxygen and the same physical build job progresses.
{
  const state = createInitialState({ seed: 903003 });
  tick(state, 0);
  state.jobs = [];
  state.constructionSites = [];
  const airlock = state.tiles.findIndex((tile) => tile === TileType.Airlock);
  assertCondition(airlock >= 0, 'Low-oxygen coverage needs the starter Airlock.');
  const exterior = state.tiles
    .map((tile, index) => ({ tile, index }))
    .filter(({ tile }) => tile === TileType.Truss || tile === TileType.Space)
    .map(({ index }) => index)
    .filter((tile) => findSpacePath(state, airlock, tile) !== null);
  const workTile = exterior.find((tile) => state.tiles[tile] === TileType.Truss);
  assertCondition(workTile !== undefined, 'Low-oxygen coverage needs a reachable Truss work tile.');
  const workerStart = exterior.find((tile) => tile !== workTile && findSpacePath(state, tile, workTile) !== null);
  assertCondition(workerStart !== undefined, 'Low-oxygen coverage needs an exterior retreat position.');
  const worker = state.crewMembers[0]!;
  const site: StationState['constructionSites'][number] = {
    id: state.constructionSiteSpawnCounter++, kind: 'tile', tileIndex: workTile,
    targetTile: TileType.Truss, requiredMaterials: 0, deliveredMaterials: 0,
    buildProgress: 0, buildWorkRequired: 12, requiresEva: true,
    assignedCrewId: worker.id, state: 'building', blockedReason: null, createdAt: state.now
  };
  state.constructionSites.push(site);
  placeCrew(state, worker, workerStart);
  worker.evaSuit = true;
  worker.evaOxygenSec = EVA_LOW_OXYGEN_SEC;
  const job = appendBuildJob(state, site.id, workTile, worker.id);
  worker.activeJobId = job.id;
  setCrewPath(state, worker, findSpacePath(state, workerStart, workTile) ?? []);
  state.controls.paused = false;
  tick(state, 0.1);
  assertCondition(
    site.state === 'blocked' && (site.blockedReason === 'EVA oxygen low' || site.blockedReason === 'EVA oxygen depleted'),
    `Low oxygen must report an actionable EVA blocker (${site.blockedReason ?? 'none'}).`
  );
  const progressAtRetreat = site.buildProgress;
  placeCrew(state, worker, airlock);
  setCrewPath(state, worker, []);
  tick(state, 0.1);
  assertCondition(site.blockedReason === null, 'Returning through the Airlock must clear the oxygen blocker.');
  for (let step = 0; step < 400 && site.buildProgress <= progressAtRetreat; step++) tick(state, 0.1);
  assertCondition(site.buildProgress > progressAtRetreat, 'Refreshed oxygen must resume the interrupted build job.');
}

// One crew member genuinely works on the only work tile, so the waiting crew
// reports sustained obstruction. Removing that actor resumes build progress.
{
  const state = createInitialState({ seed: 903004 });
  tick(state, 0);
  state.jobs = [];
  state.constructionSites = [];
  const airlock = state.tiles.findIndex((tile) => tile === TileType.Airlock);
  assertCondition(airlock >= 0, 'Obstruction coverage needs the starter Airlock.');
  const exterior = state.tiles
    .map((tile, index) => ({ tile, index }))
    .filter(({ tile }) => tile === TileType.Truss || tile === TileType.Space)
    .map(({ index }) => index)
    .filter((tile) => findSpacePath(state, airlock, tile) !== null);
  const workTile = exterior.find((tile) => state.tiles[tile] === TileType.Truss);
  assertCondition(workTile !== undefined, 'Obstruction coverage needs a reachable exterior work tile.');
  const workPoint = fromIndex(workTile, state.width);
  const approachTile = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const)
    .map(([dx, dy]) => ({ x: workPoint.x + dx, y: workPoint.y + dy }))
    .filter((point) => inBounds(point.x, point.y, state.width, state.height))
    .map((point) => toIndex(point.x, point.y, state.width))
    .find((tile) => tile !== airlock && (state.tiles[tile] === TileType.Space || state.tiles[tile] === TileType.Truss));
  assertCondition(approachTile !== undefined, 'Obstruction coverage needs an exterior approach tile.');
  const waitingCrew = state.crewMembers[0]!;
  const occupyingCrew = state.crewMembers[1]!;
  placeCrew(state, waitingCrew, approachTile);
  placeCrew(state, occupyingCrew, workTile);
  const waitingSite: StationState['constructionSites'][number] = {
    id: state.constructionSiteSpawnCounter++, kind: 'tile', tileIndex: workTile,
    targetTile: TileType.Truss, requiredMaterials: 0, deliveredMaterials: 0,
    buildProgress: 0, buildWorkRequired: 12, requiresEva: true,
    assignedCrewId: waitingCrew.id, state: 'building', blockedReason: null, createdAt: state.now
  };
  const occupyingSite: StationState['constructionSites'][number] = {
    id: state.constructionSiteSpawnCounter++, kind: 'tile', tileIndex: workTile,
    targetTile: TileType.Truss, requiredMaterials: 0, deliveredMaterials: 0,
    buildProgress: 0, buildWorkRequired: 10000, requiresEva: true,
    assignedCrewId: occupyingCrew.id, state: 'building', blockedReason: null, createdAt: state.now
  };
  state.constructionSites.push(waitingSite, occupyingSite);
  const waitingJob = appendBuildJob(state, waitingSite.id, workTile, waitingCrew.id);
  const occupyingJob = appendBuildJob(state, occupyingSite.id, workTile, occupyingCrew.id);
  waitingCrew.activeJobId = waitingJob.id;
  occupyingCrew.activeJobId = occupyingJob.id;
  waitingCrew.evaSuit = true;
  waitingCrew.evaOxygenSec = 240;
  occupyingCrew.evaSuit = true;
  occupyingCrew.evaOxygenSec = 240;
  setCrewPath(state, waitingCrew, findSpacePath(state, approachTile, workTile) ?? []);
  setCrewPath(state, occupyingCrew, []);
  state.controls.paused = false;
  for (let step = 0; step < 80 && waitingSite.blockedReason !== 'work position obstructed'; step++) tick(state, 0.1);
  assertCondition(
    waitingSite.state === 'blocked' && waitingSite.blockedReason === 'work position obstructed',
    `Sustained occupancy must report work position obstructed (${waitingSite.blockedReason ?? 'none'}; waiting=${waitingCrew.tileIndex}/${waitingCrew.blockedTicks}/${waitingCrew.path.join('.')}; occupying=${occupyingCrew.tileIndex}; progress=${waitingSite.buildProgress}; job=${waitingJob.state}/${waitingJob.stallReason}).`
  );
  const progressWhileBlocked = waitingSite.buildProgress;
  occupyingJob.state = 'done';
  occupyingJob.completedAt = state.now;
  occupyingCrew.activeJobId = null;
  state.constructionSites = state.constructionSites.filter((site) => site.id !== occupyingSite.id);
  placeCrew(state, occupyingCrew, airlock);
  setCrewPath(state, occupyingCrew, []);
  setCrewPath(state, waitingCrew, findSpacePath(state, waitingCrew.tileIndex, workTile) ?? []);
  for (let step = 0; step < 200 && waitingSite.buildProgress <= progressWhileBlocked; step++) tick(state, 0.1);
  assertCondition(waitingSite.blockedReason === null, 'Clearing the work tile must clear the obstruction diagnosis.');
  assertCondition(waitingSite.buildProgress > progressWhileBlocked, 'Clearing the work tile must resume build progress.');
}

console.log('Commissioning diagnostics tests passed.');
