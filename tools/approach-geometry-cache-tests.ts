// Focused evidence for world-space docking geometry cache reuse/invalidation.

import { deriveApproachConflictGroups } from '../src/sim/approach-envelopes';
import { applyColdStartScenario } from '../src/sim/cold-start-scenarios';
import { hydrateStateFromSave, parseAndMigrateSave, serializeSave } from '../src/sim/save';
import {
  createInitialState,
  expandMap,
  getApproachConflictGroups,
  getApproachGeometryCacheStats,
  getDockingSlotDescriptors,
  setBerthAllowedShipSize,
  setDockPurpose,
  setTile,
  tick
} from '../src/sim/sim';
import { TileType, type StationState } from '../src/sim/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function fixture(seed: number): StationState {
  const state = createInitialState({ seed, physicalStarterInventory: true, manualTrafficAdmission: true });
  tick(state, 0);
  state.controls.shipsPerCycle = 0;
  state.trafficOffers.length = 0;
  return state;
}

function berthFixture(seed: number): StationState {
  const state = createInitialState({ seed, physicalStarterInventory: true, manualTrafficAdmission: true });
  assert(applyColdStartScenario(state, 'mixed-berth-visit'), 'Fixture requires the mixed-berth scenario.');
  state.controls.shipsPerCycle = 0;
  tick(state, 0);
  return state;
}

function semanticGroups(state: StationState): string {
  return JSON.stringify(getApproachConflictGroups(state));
}

function worldGeometry(state: StationState): string {
  return JSON.stringify(getDockingSlotDescriptors(state).map((descriptor) => ({
    kind: descriptor.kind,
    facing: descriptor.facing,
    acceptedSizes: descriptor.acceptedSizes,
    envelopesBySize: descriptor.envelopesBySize,
    envelopesByHull: descriptor.envelopesByHull
  })));
}

function conflictGeometry(state: StationState): string {
  return JSON.stringify(getApproachConflictGroups(state).map((group) => ({
    slotCount: group.slotIds.length,
    sharedIngress: group.sharedIngress,
    sharedEgress: group.sharedEgress
  })));
}

function testStablePortfolioReusesExactObjects(): string {
  const state = fixture(79001);
  const firstDescriptors = getDockingSlotDescriptors(state);
  const firstGroups = getApproachConflictGroups(state);
  const firstStats = getApproachGeometryCacheStats(state);
  assert(firstStats.misses === 1, `First derivation should miss once, got ${firstStats.misses}.`);

  const secondDescriptors = getDockingSlotDescriptors(state);
  const secondGroups = getApproachConflictGroups(state);
  assert(secondDescriptors === firstDescriptors, 'Unchanged descriptor portfolio must reuse the exact array object.');
  assert(secondGroups === firstGroups, 'Unchanged conflict groups must reuse the exact array object.');
  for (let projection = 0; projection < 128; projection++) {
    assert(getDockingSlotDescriptors(state) === firstDescriptors, 'Repeated UI projection must reuse descriptors.');
    assert(getApproachConflictGroups(state) === firstGroups, 'Repeated UI projection must reuse groups.');
  }

  // Time, actors, credits and an ordinary tick are not geometry inputs.
  state.now += 17;
  state.metrics.credits += 23;
  if (state.crewMembers[0]) state.crewMembers[0].hunger = Math.max(0, state.crewMembers[0].hunger - 1);
  tick(state, 0.2);
  assert(getDockingSlotDescriptors(state) === firstDescriptors, 'Unrelated tick/actor churn must reuse descriptors.');
  assert(getApproachConflictGroups(state) === firstGroups, 'Unrelated tick/actor churn must reuse groups.');
  const stats = getApproachGeometryCacheStats(state);
  assert(stats.misses === 1 && stats.hits >= 261, `Expected one miss and repeated hits, got ${stats.hits}/${stats.misses}.`);
  return `${stats.descriptorCount} descriptors + ${stats.groupCount} groups; ${stats.hits} hits / ${stats.misses} miss`;
}

function testDockEditInvalidatesAndNoOpDoesNot(): string {
  const state = fixture(79002);
  const dock = state.docks[0];
  assert(dock, 'Fixture needs a Dock.');
  const beforeDescriptors = getDockingSlotDescriptors(state);
  const beforeGroups = getApproachConflictGroups(state);
  const beforeSemanticGroups = JSON.stringify(beforeGroups);
  const nextPurpose = dock.purpose === 'visitor' ? 'residential' : 'visitor';
  setDockPurpose(state, dock.id, nextPurpose);
  const editedDescriptors = getDockingSlotDescriptors(state);
  const editedGroups = getApproachConflictGroups(state);
  assert(editedDescriptors !== beforeDescriptors, 'A real Dock config edit must invalidate descriptors immediately.');
  assert(editedGroups !== beforeGroups, 'A real Dock config edit must invalidate cached groups immediately.');
  assert(JSON.stringify(editedGroups) === beforeSemanticGroups, 'Non-geometric Dock purpose edit must preserve group semantics.');
  assert(
    JSON.stringify(editedGroups) === JSON.stringify(deriveApproachConflictGroups(editedDescriptors)),
    'Cached groups must equal a fresh pure derivation.'
  );

  setDockPurpose(state, dock.id, nextPurpose);
  assert(getDockingSlotDescriptors(state) === editedDescriptors, 'Repeating the same Dock edit must not invalidate.');
  assert(getApproachConflictGroups(state) === editedGroups, 'Repeating the same Dock edit must reuse groups.');
  return `real purpose edit invalidated once; no-op reused; ${editedGroups.length} groups unchanged`;
}

function testBerthAcceptedSizeInvalidatesImmediately(): string {
  const state = berthFixture(79003);
  const before = getDockingSlotDescriptors(state);
  const berth = before.find((descriptor) => descriptor.kind === 'berth' && descriptor.acceptedSizes.length > 1);
  assert(berth && berth.anchorTile !== null, 'Mixed-Berth fixture needs a multi-size Berth descriptor.');
  const removedSize = berth.acceptedSizes[berth.acceptedSizes.length - 1];
  const groupsBefore = getApproachConflictGroups(state);
  setBerthAllowedShipSize(state, berth.anchorTile, removedSize, true);
  assert(
    getDockingSlotDescriptors(state) === before && getApproachConflictGroups(state) === groupsBefore,
    'Materializing a default Berth config through a no-op edit must reuse geometry.'
  );
  setBerthAllowedShipSize(state, berth.anchorTile, removedSize, false);
  const after = getDockingSlotDescriptors(state);
  const edited = after.find((descriptor) => descriptor.id === berth.id);
  const groupsAfter = getApproachConflictGroups(state);
  assert(after !== before, 'Real Berth accepted-size edit must invalidate descriptors immediately.');
  assert(groupsAfter !== groupsBefore, 'Real Berth accepted-size edit must invalidate conflict groups.');
  assert(edited && !edited.acceptedSizes.includes(removedSize), 'Re-derived Berth descriptor must expose the size edit.');
  assert(
    JSON.stringify(groupsAfter) === JSON.stringify(deriveApproachConflictGroups(after)),
    'Post-edit cached conflict groups must remain semantically exact.'
  );

  setBerthAllowedShipSize(state, berth.anchorTile, removedSize, false);
  assert(getDockingSlotDescriptors(state) === after, 'Repeating the same Berth size edit must not invalidate.');
  return `Berth ${berth.anchorTile} dropped ${removedSize}; exact invalidation; repeated edit reused`;
}

function testTopologyAndWorldExpansionInvalidate(): string {
  const state = fixture(79004);
  const first = getDockingSlotDescriptors(state);
  const spaceTile = state.tiles.findIndex((tile) => tile === TileType.Space);
  assert(spaceTile >= 0, 'Fixture needs a Space tile for topology invalidation.');
  setTile(state, spaceTile, TileType.Truss);
  const topologyEdited = getDockingSlotDescriptors(state);
  assert(topologyEdited !== first, 'A topology edit must invalidate geometry even away from the port.');

  const beforeExpansionJson = worldGeometry(state);
  const beforeExpansionGroups = conflictGeometry(state);
  state.metrics.credits = 100_000;
  assert(expandMap(state, 'west').ok, 'West expansion should succeed.');
  const expanded = getDockingSlotDescriptors(state);
  const expandedGroups = conflictGeometry(state);
  assert(expanded !== topologyEdited, 'Map dimensions/origin edit must invalidate cached descriptors.');
  assert(worldGeometry(state) === beforeExpansionJson, 'West expansion must preserve exact world-space geometry.');
  assert(expandedGroups === beforeExpansionGroups, 'West expansion must preserve conflict-group semantics.');
  return `topology edit + west expansion invalidated; world-space descriptors/groups remained exact`;
}

function testLegacyLoadOwnsFreshCorrectCache(): string {
  const state = berthFixture(79005);
  const sourceDescriptors = getDockingSlotDescriptors(state);
  const sourceGroups = getApproachConflictGroups(state);
  for (let index = 0; index < 8; index++) {
    getDockingSlotDescriptors(state);
    getApproachConflictGroups(state);
  }
  const sourceStats = getApproachGeometryCacheStats(state);
  const wire = JSON.parse(serializeSave('approach-cache', state, 'test')) as {
    snapshot: Record<string, unknown>;
  };
  delete wire.snapshot.berthConfigs;
  for (const dock of wire.snapshot.dockConfigs as Array<Record<string, unknown>>) delete dock.sourceKey;
  const parsed = parseAndMigrateSave(JSON.stringify(wire));
  assert(parsed.ok, `Legacy save should parse: ${parsed.ok ? '' : parsed.error}`);
  const loaded = hydrateStateFromSave(parsed.save, { seed: 79005 }).state;
  const beforePublicRead = getApproachGeometryCacheStats(loaded);
  assert(
    beforePublicRead.hits < sourceStats.hits,
    'A hydrated StationState must not inherit the source state cache counters/objects.'
  );
  const loadedDescriptors = getDockingSlotDescriptors(loaded);
  const loadedGroups = getApproachConflictGroups(loaded);
  assert(loadedDescriptors !== sourceDescriptors && loadedGroups !== sourceGroups, 'Loaded state must own fresh derived objects.');
  assert(JSON.stringify(loadedDescriptors) === JSON.stringify(sourceDescriptors), 'Legacy load must derive identical descriptors.');
  assert(JSON.stringify(loadedGroups) === JSON.stringify(sourceGroups), 'Legacy load must derive identical conflict groups.');
  assert(getDockingSlotDescriptors(loaded) === loadedDescriptors, 'Loaded state must reuse its newly derived descriptors.');
  assert(getApproachConflictGroups(loaded) === loadedGroups, 'Loaded state must reuse its newly derived groups.');
  const stats = getApproachGeometryCacheStats(loaded);
  return `source ${sourceStats.hits} hits not transferred; load derived ${stats.descriptorCount}/${stats.groupCount} and reused`;
}

const tests: Array<[string, () => string]> = [
  ['stable portfolio reuses exact objects', testStablePortfolioReusesExactObjects],
  ['dock edit invalidates and no-op does not', testDockEditInvalidatesAndNoOpDoesNot],
  ['berth accepted size invalidates immediately', testBerthAcceptedSizeInvalidatesImmediately],
  ['topology and world expansion invalidate', testTopologyAndWorldExpansionInvalidate],
  ['legacy load owns fresh correct cache', testLegacyLoadOwnsFreshCorrectCache]
];

let passed = 0;
for (const [name, test] of tests) {
  try {
    const evidence = test();
    console.log(`PASS ${name}: ${evidence}`);
    passed += 1;
  } catch (error) {
    console.error(`FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
if (!process.exitCode) console.log(`Approach geometry cache: ${passed}/${tests.length} passed`);
