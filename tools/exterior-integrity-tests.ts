import {
  bumpTopologyVersion,
  createInitialState,
  expandMap,
  reconcileExteriorIntegrityTargets,
  setExteriorIntegrityTargetState,
  setExteriorIntegrityTargetWear,
  tick
} from '../src/sim/sim';
import { hydrateStateFromSave, parseAndMigrateSave, serializeSave } from '../src/sim/save';
import { ModuleType, RoomType, TileType, fromIndex, toIndex, type StationState, type TransportJob } from '../src/sim/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const STEP = 0.1;

function advance(state: StationState, seconds: number): void {
  state.controls.paused = false;
  for (let elapsed = 0; elapsed + 1e-9 < seconds; elapsed += STEP) tick(state, Math.min(STEP, seconds - elapsed));
}

function integrityFixture(seed: number, withAirlock = true): { state: StationState; center: number; northWall: number; northWork: number } {
  const state = createInitialState({ seed });
  const cx = 12;
  const cy = 12;
  const center = toIndex(cx, cy, state.width);
  state.tiles.fill(TileType.Space);
  state.rooms.fill(RoomType.None);
  state.modules.fill(ModuleType.None);
  state.moduleInstances = [];
  state.moduleOccupancyByTile.fill(null);
  state.docks = [];
  state.maintenanceDebts = [];
  state.exteriorIntegrityTargets = [];
  state.jobs = [];
  state.visitors = [];
  state.residents = [];
  state.core.centerTile = center;
  state.core.serviceTile = center;
  state.core.frameTiles = [];
  const wall = (x: number, y: number, kind = TileType.Wall) => {
    state.tiles[toIndex(x, y, state.width)] = kind;
  };
  wall(cx, cy - 1);
  wall(cx + 1, cy);
  wall(cx - 1, cy);
  wall(cx, cy + 1, withAirlock ? TileType.Airlock : TileType.Wall);
  state.tiles[center] = TileType.Floor;
  state.legacyMaterialStock = 10;
  bumpTopologyVersion(state);
  state.controls.paused = false;
  tick(state, 0);
  state.crewMembers = state.crewMembers.slice(0, 1);
  state.crew.total = 1;
  const crew = state.crewMembers[0];
  crew.tileIndex = center;
  crew.x = cx + 0.5;
  crew.y = cy + 0.5;
  crew.staffRole = 'mechanic';
  crew.workLane = 'engineering';
  crew.activeJobId = null;
  crew.path = [];
  crew.evaSuit = false;
  crew.evaOxygenSec = 0;
  const northWall = toIndex(cx, cy - 1, state.width);
  const northWork = toIndex(cx, cy - 2, state.width);
  return { state, center, northWall, northWork };
}

function northTarget(state: StationState, northWall: number) {
  reconcileExteriorIntegrityTargets(state);
  const pos = fromIndex(northWall, state.width);
  const target = state.exteriorIntegrityTargets.find(
    (entry) => entry.worldX === pos.x + state.mapWorldOriginX && entry.worldY === pos.y + state.mapWorldOriginY && entry.face === 'north'
  );
  assert(target, 'Expected a north-facing exterior hull panel.');
  return target;
}

function directRepairJob(state: StationState, targetId: string, workTile: number, targetTile: number, id = 8801): TransportJob {
  return {
    id,
    type: 'repair',
    itemType: 'rawMaterial',
    amount: 100,
    fromTile: workTile,
    toTile: targetTile,
    assignedCrewId: state.crewMembers[0].id,
    createdAt: state.now,
    expiresAt: state.now + 180,
    state: 'in_progress',
    pickedUpAmount: 0,
    completedAt: null,
    lastProgressAt: state.now,
    stallReason: 'none',
    repairTargetKey: `integrity:${targetId}`,
    repairTargetLabel: 'exterior hull panel',
    repairDomain: 'hull',
    repairSource: 'debris',
    repairExterior: true,
    repairProgress: 0
  };
}

function prepareDamagedRepair(seed: number, withAirlock = true) {
  const fixture = integrityFixture(seed, withAirlock);
  const target = northTarget(fixture.state, fixture.northWall);
  assert(setExteriorIntegrityTargetWear(fixture.state, target.id, 62), 'Expected damaged integrity target.');
  tick(fixture.state, 0);
  const crew = fixture.state.crewMembers[0];
  const job = directRepairJob(fixture.state, target.id, fixture.northWork, fixture.northWall);
  fixture.state.jobs = [job];
  crew.activeJobId = job.id;
  return { ...fixture, target, crew, job };
}

function testStableIdentityAndStateTransitions(): void {
  const { state, northWall } = integrityFixture(701);
  const first = reconcileExteriorIntegrityTargets(state).map((target) => target.id);
  const second = reconcileExteriorIntegrityTargets(state).map((target) => target.id);
  assert(first.join('|') === second.join('|'), 'Exterior target ordering changed between reconciliations.');
  assert([...first].sort().join('|') === first.join('|'), 'Exterior targets were not deterministically sorted.');
  const target = northTarget(state, northWall);
  assert(setExteriorIntegrityTargetWear(state, target.id, 14), 'Could not apply worn state.');
  assert(state.exteriorIntegrityTargets.find((entry) => entry.id === target.id)?.state === 'worn', 'Wear did not enter worn state.');
  const wornTransitionAt = state.exteriorIntegrityTargets.find((entry) => entry.id === target.id)?.lastTransitionAt;
  state.now += 1;
  assert(setExteriorIntegrityTargetWear(state, target.id, 20), 'Could not increase wear inside worn state.');
  assert(
    state.exteriorIntegrityTargets.find((entry) => entry.id === target.id)?.lastTransitionAt === wornTransitionAt,
    'Wear within one integrity state rewrote the state-transition timestamp.'
  );
  assert(setExteriorIntegrityTargetWear(state, target.id, 52), 'Could not apply damaged state.');
  assert(state.exteriorIntegrityTargets.find((entry) => entry.id === target.id)?.state === 'damaged', 'Wear did not enter damaged state.');
  assert(setExteriorIntegrityTargetWear(state, target.id, 84), 'Could not apply breach state.');
  assert(state.exteriorIntegrityTargets.find((entry) => entry.id === target.id)?.state === 'breached', 'Wear did not enter breached state.');
  assert(setExteriorIntegrityTargetState(state, target.id, 'patched', 0), 'Could not patch breached panel.');
  assert(state.exteriorIntegrityTargets.find((entry) => entry.id === target.id)?.state === 'patched', 'Repair did not enter patched state.');
}

function testPressureAndFireSeparation(): void {
  const { state, center, northWall } = integrityFixture(702);
  const target = northTarget(state, northWall);
  assert(state.pressurized[center], 'Fixture interior should start pressurized.');
  assert(setExteriorIntegrityTargetState(state, target.id, 'breached', 90), 'Could not breach panel.');
  tick(state, 0);
  assert(state.tiles[northWall] === TileType.Wall, 'Integrity breach deleted a hull tile.');
  assert(!state.pressurized[center], 'Breached hull panel did not depressurize the connected interior.');
  const firesBefore = state.effects.fires.length;
  assert(setExteriorIntegrityTargetState(state, target.id, 'patched', 0), 'Could not repair panel.');
  tick(state, 0);
  assert(state.pressurized[center], 'Patched hull panel did not restore pressure sealing.');
  assert(state.effects.fires.length === firesBefore, 'Exterior repair mutated fire state.');
  assert(state.tiles[northWall] === TileType.Wall, 'Patched hull repair changed fire tile semantics.');
}

function testEvaBlocksAndRepair(): void {
  const noAirlock = prepareDamagedRepair(703, false);
  tick(noAirlock.state, 0.5);
  assert((noAirlock.job.repairProgress ?? 0) === 0, 'Exterior repair progressed without an Airlock route.');
  assert(noAirlock.job.blockedReason?.includes('airlock'), 'No-Airlock repair did not report its EVA block.');

  const noOxygen = prepareDamagedRepair(704, true);
  noOxygen.crew.tileIndex = noOxygen.northWork;
  const outside = fromIndex(noOxygen.northWork, noOxygen.state.width);
  noOxygen.crew.x = outside.x + 0.5;
  noOxygen.crew.y = outside.y + 0.5;
  noOxygen.crew.evaSuit = false;
  noOxygen.crew.evaOxygenSec = 0;
  tick(noOxygen.state, 0.5);
  assert((noOxygen.job.repairProgress ?? 0) === 0, 'Exterior repair progressed with no EVA oxygen.');
  assert(noOxygen.job.blockedReason?.includes('suit') || noOxygen.job.blockedReason?.includes('oxygen'), 'No-oxygen repair did not report its EVA block.');

  const noSupplies = prepareDamagedRepair(705, true);
  noSupplies.state.legacyMaterialStock = 0;
  advance(noSupplies.state, 4);
  assert((noSupplies.job.repairProgress ?? 0) === 0, 'Exterior repair progressed without supplies.');
  assert(noSupplies.job.blockedReason === 'no repair supplies', 'No-supplies repair did not report the material block.');

  const repaired = prepareDamagedRepair(706, true);
  repaired.state.legacyMaterialStock = 2;
  const before = repaired.state.legacyMaterialStock;
  advance(repaired.state, 22);
  assert(repaired.job.state === 'done', 'EVA repair did not complete through the Airlock route.');
  assert(before - repaired.state.legacyMaterialStock === 2, 'EVA repair did not consume repair supplies exactly once.');
  const after = repaired.state.legacyMaterialStock;
  advance(repaired.state, 2);
  assert(repaired.state.legacyMaterialStock === after, 'Completed EVA repair consumed supplies again.');
  assert(
    repaired.state.exteriorIntegrityTargets.find((entry) => entry.id === repaired.target.id)?.state === 'patched',
    `Completed EVA repair did not leave a patched panel (${repaired.state.exteriorIntegrityTargets.find((entry) => entry.id === repaired.target.id)?.state ?? 'missing'}).`
  );
}

function testSaveLoadWorldRemapAndMitigation(): void {
  const { state, northWall } = integrityFixture(707);
  const target = northTarget(state, northWall);
  assert(setExteriorIntegrityTargetState(state, target.id, 'breached', 86), 'Could not prepare durable breach.');
  const parsed = parseAndMigrateSave(serializeSave('integrity', state, 'test'));
  assert(parsed.ok, parsed.ok ? '' : parsed.error);
  const hydrated = hydrateStateFromSave(parsed.save, { seed: 707 }).state;
  assert(hydrated.exteriorIntegrityTargets.some((entry) => entry.id === target.id && entry.state === 'breached'), 'Save/load lost a durable breached panel.');
  hydrated.metrics.credits = 99999;
  const expansion = expandMap(hydrated, 'north');
  assert(expansion.ok, 'North expansion failed during integrity world-coordinate test.');
  reconcileExteriorIntegrityTargets(hydrated);
  assert(hydrated.exteriorIntegrityTargets.some((entry) => entry.id === target.id), 'North remap changed the exterior panel world identity.');

  const exposed = integrityFixture(708);
  const trussed = integrityFixture(708);
  const exposedTarget = northTarget(exposed.state, exposed.northWall);
  const trussedTarget = northTarget(trussed.state, trussed.northWall);
  trussed.state.tiles[trussed.northWork] = TileType.Truss;
  bumpTopologyVersion(trussed.state);
  const exposedCandidate = reconcileExteriorIntegrityTargets(exposed.state).find((entry) => entry.id === exposedTarget.id);
  const trussedCandidate = reconcileExteriorIntegrityTargets(trussed.state).find((entry) => entry.id === trussedTarget.id);
  assert(exposedCandidate && trussedCandidate && trussedCandidate.mitigation < exposedCandidate.mitigation, 'Exterior truss baffle did not reduce panel exposure.');

  const sheltered = integrityFixture(709);
  const exposedCharter = integrityFixture(709);
  sheltered.state.site = { version: 1, x: 0.1, y: 0.1, sunFactor: 0.4, debrisFactor: 0, resourceType: null, laneTrafficFactor: { north: 1, east: 1, south: 1, west: 1 } };
  exposedCharter.state.site = { version: 1, x: 0.9, y: 0.9, sunFactor: 0.4, debrisFactor: 1, resourceType: null, laneTrafficFactor: { north: 1, east: 1, south: 1, west: 1 } };
  const shelteredRisk = reconcileExteriorIntegrityTargets(sheltered.state).find((entry) => entry.id === northTarget(sheltered.state, sheltered.northWall).id)?.risk ?? 0;
  const exposedRisk = reconcileExteriorIntegrityTargets(exposedCharter.state).find((entry) => entry.id === northTarget(exposedCharter.state, exposedCharter.northWall).id)?.risk ?? 0;
  assert(exposedRisk > shelteredRisk, 'Charter debris factor did not change exterior risk deterministically.');
}

function run(): void {
  testStableIdentityAndStateTransitions();
  testPressureAndFireSeparation();
  testEvaBlocksAndRepair();
  testSaveLoadWorldRemapAndMitigation();
  console.log('exterior-integrity-tests: ok');
}

run();
