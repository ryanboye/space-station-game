import { applyColdStartScenario } from '../src/sim/cold-start-scenarios';
import {
  bindVisitorLuggageForTest,
  createInitialState,
  releaseCrewJobsOnDeath,
  requestVisitorLuggageReturnForTest,
  runLuggageAssignmentTestTick,
  tick
} from '../src/sim/sim';
import { hydrateStateFromSave, parseAndMigrateSave, serializeSave } from '../src/sim/save';
import type { CrewMember, StationState, Visitor } from '../src/sim/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`luggage-integration: ${message}`);
}

function staffedReception(seed: number): { state: StationState; visitor: Visitor; crew: CrewMember } {
  const state = createInitialState({ seed, physicalStarterInventory: true });
  assert(applyColdStartScenario(state, 'reception-staffed'), 'Reception scenario must exist.');
  state.controls.paused = false;
  state.controls.shipsPerCycle = 0;
  const visitor = state.visitors[0];
  const crew = state.crewMembers[0];
  assert(visitor && crew, 'Reception scenario must depict a visitor and crew member.');
  visitor.originShipId = 77001;
  visitor.transferPhase = 'station';
  crew.staffRole = 'cargo-handler';
  crew.resting = false;
  crew.activeJobId = null;
  crew.activeLuggageJobId = null;
  crew.carryingItemType = null;
  crew.carryingAmount = 0;
  crew.carryingMeal = false;
  crew.tileIndex = visitor.tileIndex;
  crew.x = visitor.x;
  crew.y = visitor.y;
  crew.path = [];
  state.incidents = [];
  bindVisitorLuggageForTest(state, visitor, 77001, visitor.tileIndex);
  // The focused fixture has no physical ship actor; keep its depicted visitor
  // station-side after the stable ship/passenger identity has been bound.
  visitor.originShipId = null;
  return { state, visitor, crew };
}

function runUntil(
  state: StationState,
  predicate: () => boolean,
  message: string,
  seconds = 120
): void {
  for (let elapsed = 0; elapsed < seconds && !predicate(); elapsed += 0.1) tick(state, 0.1);
  assert(predicate(), message);
}

function testProductionBindingAndAbsentDesk(): string {
  const staffed = staffedReception(78101);
  const bag = staffed.state.luggageCustody.bags.find((candidate) => candidate.id === staffed.visitor.luggageId);
  assert(bag, 'A reachable Arrival Desk must bind one stable bag to the passenger.');
  assert(bag.shipTile === staffed.visitor.tileIndex, 'The station-side handoff tile must remain the physical ship endpoint.');
  assert(bag.claimTile !== null, 'A reachable reception position must become the claim endpoint.');
  assert(staffed.state.luggageCustody.jobs.length === 1, 'A reachable desk must create exactly one inbound job.');
  bindVisitorLuggageForTest(staffed.state, staffed.visitor, 77001, staffed.visitor.tileIndex);
  assert(staffed.state.luggageCustody.bags.length === 1, 'Repeated production binding must not duplicate the bag.');

  const unstaffed = staffedReception(78106);
  const unstaffedId = unstaffed.visitor.luggageId!;
  unstaffed.state.crewMembers = [];
  // Recreate against the same depicted desk after all staffing disappears.
  unstaffed.state.luggageCustody = { bags: [], jobs: [], carriers: [] };
  unstaffed.visitor.luggageId = null;
  bindVisitorLuggageForTest(unstaffed.state, unstaffed.visitor, 77001, unstaffed.visitor.tileIndex);
  assert(
    unstaffed.state.luggageCustody.bags.find((candidate) => candidate.id === unstaffedId)?.claimTile !== null,
    'Arrival Desk claim binding must depend on depicted reachability, not staffing.'
  );

  const noDesk = createInitialState({ seed: 78102, physicalStarterInventory: true });
  const visitor = structuredClone(staffed.visitor);
  visitor.id = 88001;
  visitor.originShipId = 88002;
  visitor.luggageId = null;
  bindVisitorLuggageForTest(noDesk, visitor, 88002, visitor.tileIndex);
  const aboard = noDesk.luggageCustody.bags[0];
  assert(aboard?.claimTile === null && aboard.phase === 'aboard', 'No Arrival Desk must leave the bag aboard.');
  assert(noDesk.luggageCustody.jobs.length === 0, 'No desk must not create phantom cargo work.');
  assert(requestVisitorLuggageReturnForTest(noDesk, visitor), 'No-desk luggage must never block boarding.');
  return 'PASS production binding is stable, physical, and no-desk visits remain inert';
}

function testCarrierInterruptionAndRoundTrip(): string {
  const { state, visitor, crew } = staffedReception(78103);
  const luggageId = visitor.luggageId!;
  const inbound = `${luggageId}:inbound`;
  const ordinaryJobCount = state.jobs.length;
  runLuggageAssignmentTestTick(state);
  assert(
    crew.activeLuggageJobId === inbound,
    `Cargo Handler must receive the independent luggage job (crew=${JSON.stringify({
      role: crew.staffRole,
      active: crew.activeJobId,
      luggage: crew.activeLuggageJobId,
      resting: crew.resting,
      carrying: crew.carryingItemType
    })}, jobs=${JSON.stringify(state.luggageCustody.jobs)}).`
  );
  assert(crew.activeJobId === null && state.jobs.length === ordinaryJobCount, 'Luggage must stay outside the fungible job board.');

  runUntil(
    state,
    () => state.luggageCustody.carriers.some((link) => link.carrierId === crew.id),
    'Cargo Handler must physically pick up the bag.'
  );
  tick(state, 0.4);
  const dropTile = crew.tileIndex;
  releaseCrewJobsOnDeath(state, crew.id);
  const dropped = state.luggageCustody.bags.find((bag) => bag.id === luggageId)!;
  const requeued = state.luggageCustody.jobs.find((job) => job.id === inbound)!;
  assert(dropped.location.kind === 'loose' && dropped.location.tile === dropTile, 'Death interruption must drop the same bag at the exact crew tile.');
  assert(requeued.state === 'pending' && requeued.fromTile === dropTile, 'The same stable leg must requeue from the physical drop.');

  runLuggageAssignmentTestTick(state);
  for (let elapsed = 0; elapsed < 120 && state.luggageCustody.bags.find((bag) => bag.id === luggageId)?.phase !== 'claim'; elapsed += 0.1) {
    tick(state, 0.1);
  }
  assert(
    state.luggageCustody.bags.find((bag) => bag.id === luggageId)?.phase === 'claim',
    `Reassigned inbound luggage must reach claim (bag=${JSON.stringify(state.luggageCustody.bags.find((bag) => bag.id === luggageId))}, job=${JSON.stringify(state.luggageCustody.jobs.find((job) => job.id === inbound))}, crew=${JSON.stringify(state.crewMembers.map((candidate) => ({ id: candidate.id, role: candidate.staffRole, luggage: candidate.activeLuggageJobId, tile: candidate.tileIndex, path: candidate.path.slice(-3) })))}).`
  );
  assert(!requestVisitorLuggageReturnForTest(state, visitor), 'A claimed bag must gate boarding while return is pending.');
  runLuggageAssignmentTestTick(state);
  runUntil(state, () => state.luggageCustody.bags.find((bag) => bag.id === luggageId)?.phase === 'returned', 'Cargo Handler must return the same bag to the ship handoff.');
  assert(requestVisitorLuggageReturnForTest(state, visitor), 'Boarding must open only after physical return.');
  assert(state.luggageCustody.jobs.filter((job) => job.luggageId === luggageId).length === 2, 'Round trip must have exactly two stable legs.');
  return 'PASS real Cargo Handler movement, exact-tile interruption, requeue, and boarding gate complete';
}

function testSaveHydrationAndLegacyDefault(): string {
  const { state, visitor, crew } = staffedReception(78104);
  runLuggageAssignmentTestTick(state);
  runUntil(
    state,
    () => state.luggageCustody.carriers.some((link) => link.carrierId === crew.id),
    'Save fixture must reach carried custody.'
  );
  const luggageId = visitor.luggageId!;
  const parsed = parseAndMigrateSave(serializeSave('luggage-custody', state, 'focused-test'));
  assert(parsed.ok, 'Luggage save must parse.');
  const restored = hydrateStateFromSave(parsed.save, { seed: 78104 }).state;
  const restoredVisitor = restored.visitors.find((candidate) => candidate.id === visitor.id);
  const restoredCrew = restored.crewMembers.find((candidate) => candidate.id === crew.id);
  assert(
    restoredVisitor?.luggageId === luggageId,
    `Passenger luggage identity must survive hydration (wanted visitor=${visitor.id}/${luggageId}; restored=${JSON.stringify(restored.visitors.map((candidate) => ({ id: candidate.id, luggageId: candidate.luggageId, originShipId: candidate.originShipId })))}).`
  );
  assert(restored.luggageCustody.bags.some((bag) => bag.id === luggageId), 'Custody ledger must survive hydration.');
  assert(restoredCrew?.activeLuggageJobId === `${luggageId}:inbound`, 'Valid carrier authority must survive hydration.');
  assert(restored.luggageCustody.carriers.some((link) => link.carrierId === crew.id), 'Physical carrier link must survive hydration.');

  const legacyWire = JSON.parse(serializeSave('luggage-legacy', state, 'focused-test')) as {
    snapshot: Record<string, unknown> & { crewMembers?: Array<Record<string, unknown>>; visitors?: Array<Record<string, unknown>> };
  };
  delete legacyWire.snapshot.luggageCustody;
  for (const savedCrew of legacyWire.snapshot.crewMembers ?? []) delete savedCrew.activeLuggageJobId;
  for (const savedVisitor of legacyWire.snapshot.visitors ?? []) delete savedVisitor.luggageId;
  const legacyParsed = parseAndMigrateSave(JSON.stringify(legacyWire));
  assert(legacyParsed.ok, 'Legacy save without luggage fields must parse.');
  const legacy = hydrateStateFromSave(legacyParsed.save, { seed: 78105 }).state;
  assert(legacy.luggageCustody.bags.length === 0 && legacy.luggageCustody.jobs.length === 0, 'Missing legacy block must hydrate to inert custody.');
  assert(legacy.crewMembers.every((candidate) => !candidate.activeLuggageJobId), 'Legacy crew must not acquire phantom luggage work.');
  return 'PASS carried custody saves durably and missing legacy blocks hydrate inertly';
}

const results = [
  testProductionBindingAndAbsentDesk(),
  testCarrierInterruptionAndRoundTrip(),
  testSaveHydrationAndLegacyDefault()
];

console.log(`Luggage integration: ${results.length}/${results.length} checks passed`);
for (const result of results) console.log(`  ${result}`);
