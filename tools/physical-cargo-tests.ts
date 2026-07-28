import {
  createInitialState,
  releaseCrewJobsOnDeath,
  requeueInterruptedTransportJob,
  runMovementCoordinatorTestTick,
  tick
} from '../src/sim/sim';
import { hydrateStateFromSave, parseAndMigrateSave, serializeSave } from '../src/sim/save';
import { ModuleType, TileType, type CrewMember, type StationState, type TransportJob } from '../src/sim/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function at(state: StationState, x: number, y: number): number {
  return y * state.width + x;
}

function placeCrew(state: StationState, id: number, tileIndex: number, path: number[] = []): CrewMember {
  const template = state.crewMembers[0];
  assert(template, 'Expected a crew template.');
  const crew = structuredClone(template) as CrewMember;
  crew.id = id;
  crew.tileIndex = tileIndex;
  crew.x = (tileIndex % state.width) + 0.5;
  crew.y = Math.floor(tileIndex / state.width) + 0.5;
  crew.path = [...path];
  crew.speed = 10;
  crew.activeJobId = null;
  crew.carryingItemType = null;
  crew.carryingAmount = 0;
  crew.blockedTicks = 0;
  crew.targetTile = null;
  crew.movementReplanCooldownUntil = 0;
  return crew;
}

function job(id: number, source: number, destination: number, crewId: number): TransportJob {
  return {
    id,
    type: 'deliver',
    itemType: 'fuel',
    amount: 6,
    fromTile: source,
    toTile: destination,
    assignedCrewId: crewId,
    createdAt: 0,
    expiresAt: 120,
    state: 'assigned',
    pickedUpAmount: 0,
    completedAt: null,
    lastProgressAt: 0,
    stallReason: 'none'
  };
}

function inventoryState(seed: number): { state: StationState; source: number; destination: number; crew: CrewMember } {
  const state = createInitialState({ seed, physicalStarterInventory: true });
  state.controls.shipsPerCycle = 0;
  state.controls.paused = false;
  tick(state, 0);
  assert(state.itemNodes.length >= 2, 'Expected two inventory nodes in the physical starter.');
  for (const node of state.itemNodes) node.items = {};
  const source = state.itemNodes[0]!.tileIndex;
  const destination = state.itemNodes[1]!.tileIndex;
  state.itemNodes[0]!.items.fuel = 6;
  const crew = placeCrew(state, 8100 + seed, source);
  state.crewMembers = [crew];
  state.crew.total = 1;
  state.crew.free = 1;
  return { state, source, destination, crew };
}

function moveCrewTo(state: StationState, crew: CrewMember, tile: number): void {
  crew.tileIndex = tile;
  crew.x = (tile % state.width) + 0.5;
  crew.y = Math.floor(tile / state.width) + 0.5;
  crew.path = [];
}

function testPickupSaveDropoffAndInterruptedReturn(): void {
  const { state, source, destination, crew } = inventoryState(810);
  const active = job(9810, source, destination, crew.id);
  crew.activeJobId = active.id;
  state.jobs = [active];

  tick(state, 0.1);
  assert(state.itemNodes[0]!.items.fuel === 0, 'Pickup did not decrement the source exactly once.');
  assert(crew.carryingItemType === 'fuel' && crew.carryingAmount === 6, 'Pickup did not place the exact stack on the worker.');
  assert(active.state === 'in_progress' && active.pickedUpAmount === 6, 'Pickup did not advance the transport job.');

  const parsed = parseAndMigrateSave(serializeSave('physical-cargo', state, 'test'));
  assert(parsed.ok, 'Physical cargo save did not parse.');
  const restored = hydrateStateFromSave(parsed.save, { seed: 810 }).state;
  const restoredCrew = restored.crewMembers.find((candidate) => candidate.id === crew.id);
  const restoredJob = restored.jobs.find((candidate) => candidate.id === active.id);
  assert(restoredCrew?.carryingItemType === 'fuel' && restoredCrew.carryingAmount === 6, 'Carried cargo did not survive save/load.');
  assert(restoredJob?.state === 'in_progress' && restoredJob.pickedUpAmount === 6, 'In-progress haul did not survive save/load.');
  assert((restored.itemNodes.find((node) => node.tileIndex === source)?.items.fuel ?? 0) === 0, 'Load duplicated the picked-up source stack.');

  restored.controls.paused = false;
  assert(restoredCrew && restoredJob, 'Restored cargo assignment disappeared.');
  const restoredDestination = restored.itemNodes.find((node) => node.tileIndex === destination);
  assert(restoredDestination, 'Restored destination inventory node disappeared.');
  // The normal starter's production refresh may stock this fixture while the
  // save is paused. Clear only the test destination so this assertion measures
  // the restored haul, not unrelated starter production.
  restoredDestination.items = {};
  moveCrewTo(restored, restoredCrew, destination);
  tick(restored, 0.1);
  const destinationStock = restoredDestination.items.fuel ?? 0;
  assert(
    destinationStock === 6,
    `Drop-off did not increment the destination exactly once (stock ${destinationStock}, job ${restoredJob.state}/${restoredJob.pickedUpAmount}, carry ${restoredCrew.carryingAmount}).`
  );
  tick(restored, 0.2);
  assert((restoredDestination.items.fuel ?? 0) === 6, 'Completed drop-off duplicated inventory.');

  const interrupted = inventoryState(811);
  const interruptedJob = job(9811, interrupted.source, interrupted.destination, interrupted.crew.id);
  interrupted.crew.activeJobId = interruptedJob.id;
  interrupted.state.jobs = [interruptedJob];
  tick(interrupted.state, 0.1);
  requeueInterruptedTransportJob(interrupted.state, interruptedJob, interrupted.crew);
  assert(interruptedJob.state === 'pending' && interruptedJob.pickedUpAmount === 0, 'Interrupted work did not requeue authoritatively.');
  assert(interrupted.crew.carryingItemType === null && interrupted.crew.carryingAmount === 0, 'Interrupted worker retained cargo after return.');
  assert(interrupted.state.itemNodes[0]!.items.fuel === 6, 'Interrupted work did not return cargo to its source exactly once.');

  const death = inventoryState(812);
  const deathJob = job(9812, death.source, death.destination, death.crew.id);
  death.crew.activeJobId = deathJob.id;
  death.state.jobs = [deathJob];
  tick(death.state, 0.1);
  releaseCrewJobsOnDeath(death.state, death.crew.id);
  assert(deathJob.state === 'pending' && deathJob.pickedUpAmount === 0, 'Crew death did not requeue a carried haul.');
  assert(death.crew.carryingItemType === null && death.crew.carryingAmount === 0, 'Crew death left cargo attached to the deceased worker.');
  assert(death.state.itemNodes[0]!.items.fuel === 6, 'Crew death did not return cargo to its source exactly once.');
}

function movementState(): StationState {
  const state = createInitialState({ seed: 812, physicalStarterInventory: true });
  tick(state, 0);
  state.tiles.fill(TileType.Floor);
  state.modules.fill(ModuleType.None);
  state.residents = [];
  state.visitors = [];
  return state;
}

function route(state: StationState, x0: number, x1: number, y: number): number[] {
  const tiles: number[] = [];
  for (let x = x0 + 1; x <= x1; x += 1) tiles.push(at(state, x, y));
  return tiles;
}

function runCorridor(separated: boolean): number {
  const state = movementState();
  const cargoStart = at(state, 20, 20);
  const cargoEnd = at(state, 28, 20);
  const publicY = separated ? 21 : 20;
  const publicStart = at(state, 17, publicY);
  const publicEnd = at(state, 27, publicY);
  const cargo = placeCrew(state, 1, cargoStart, route(state, 20, 28, 20));
  cargo.carryingItemType = 'rawMaterial';
  cargo.carryingAmount = 8;
  cargo.activeJobId = 1;
  const publicCrew = placeCrew(state, 2, publicStart, route(state, 17, 27, publicY));
  state.crewMembers = [cargo, publicCrew];
  for (let elapsed = 0; elapsed < 12; elapsed += 0.1) {
    // The coordinator deliberately invalidates a repeatedly blocked route;
    // production actor logic asks the pathfinder again next tick. This focused
    // harness owns straight corridors, so it supplies that equivalent replan.
    if (cargo.path.length === 0 && cargo.tileIndex !== cargoEnd) {
      cargo.path = route(state, cargo.tileIndex % state.width, 28, 20);
    }
    if (publicCrew.path.length === 0 && publicCrew.tileIndex !== publicEnd) {
      publicCrew.path = route(state, publicCrew.tileIndex % state.width, 27, publicY);
    }
    runMovementCoordinatorTestTick(state, 0.1);
    state.now += 0.1;
    if (cargo.tileIndex === cargoEnd && publicCrew.tileIndex === publicEnd) return elapsed + 0.1;
  }
  throw new Error(
    `Corridor run did not complete (${separated ? 'separated' : 'shared'}; cargo ${cargo.tileIndex}, public ${publicCrew.tileIndex}, cargo path ${cargo.path.length}, public path ${publicCrew.path.length}, public wait ${publicCrew.movementWaitReason ?? 'none'}).`
  );
}

function testBulkyCargoPhysicallyConsumesSharedCorridor(): void {
  const shared = runCorridor(false);
  const separated = runCorridor(true);
  assert(shared > separated + 0.45, `Bulky shared freight did not measurably slow the public corridor (${shared.toFixed(1)}s vs ${separated.toFixed(1)}s).`);

  const state = movementState();
  const start = at(state, 35, 35);
  const end = at(state, 38, 35);
  const ordinary = placeCrew(state, 3, start, route(state, 35, 38, 35));
  state.crewMembers = [ordinary];
  for (let elapsed = 0; elapsed < 1.5 && ordinary.tileIndex !== end; elapsed += 0.1) {
    runMovementCoordinatorTestTick(state, 0.1);
    state.now += 0.1;
  }
  assert(ordinary.tileIndex === end, 'Ordinary narrow traffic did not recover after the cart corridor cleared.');
}

const tests: Array<[string, () => void]> = [
  ['pickup-save-dropoff-and-interrupted-return', testPickupSaveDropoffAndInterruptedReturn],
  ['bulky-cargo-physically-consumes-shared-corridor', testBulkyCargoPhysicallyConsumesSharedCorridor]
];

for (const [name, run] of tests) {
  run();
  console.log(`PASS ${name}`);
}
