import {
  acceptOpeningCapitalProject,
  bumpTopologyVersion,
  createInitialState,
  ensureDockByTileCache,
  tick
} from '../src/sim/sim';
import { hydrateStateFromSave, parseAndMigrateSave, serializeSave } from '../src/sim/save';
import { ModuleType, RoomType, TileType, toIndex, type StationState } from '../src/sim/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`infrastructure-determinism: ${message}`);
}

function withControlledWallClock<T>(run: (advanceWall: (milliseconds: number) => void) => T): T {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'performance');
  let wallNow = 0;
  Object.defineProperty(globalThis, 'performance', {
    configurable: true,
    value: { now: () => wallNow }
  });
  try {
    return run((milliseconds) => {
      wallNow += milliseconds;
    });
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'performance', descriptor);
    else delete (globalThis as { performance?: Performance }).performance;
  }
}

function prepareProgressionState(seed: number): StationState {
  const state = createInitialState({ seed, manualTrafficAdmission: true });
  state.controls.paused = false;
  state.controls.shipsPerCycle = 0;
  tick(state, 0.2);
  assert(acceptOpeningCapitalProject(state, 'roadside-rest-stop'), 'could not accept progression fixture project');
  state.openingEconomy.ledger.lifetime['dock-fee'].count = 12;
  state.metrics.mealsServedTotal = 8;
  state.usageTotals.tradeGoodsSold = 6;
  state.usageTotals.archetypesEverSeen.diner = true;
  return state;
}

function progressionResult(wallMillisecondsPerTick: number) {
  return withControlledWallClock((advanceWall) => {
    const state = prepareProgressionState(88_210);
    for (let index = 0; index < 50; index += 1) {
      advanceWall(wallMillisecondsPerTick);
      tick(state, 0.2);
    }
    return {
      now: Number(state.now.toFixed(6)),
      tier: state.unlocks.tier,
      projectCompleted: state.openingEconomy.capitalProjects.completed.includes('roadside-rest-stop'),
      projectStillActive: state.openingEconomy.capitalProjects.active.some((entry) => entry.id === 'roadside-rest-stop'),
      ratingAward: state.usageTotals.ratingFromVisitorSuccessByReason.capitalProject ?? 0,
      credits: state.metrics.credits
    };
  });
}

function testProgressionUsesSimulationTime(): void {
  const frozenWall = progressionResult(0);
  const slowWall = progressionResult(300);
  assert(
    JSON.stringify(frozenWall) === JSON.stringify(slowWall),
    `identical simulation ticks diverged by wall speed: ${JSON.stringify({ frozenWall, slowWall })}`
  );
  assert(frozenWall.now === 10.2, `expected 10.2 simulated seconds, got ${frozenWall.now}`);
  assert(frozenWall.tier >= 1, '50 fast ticks never refreshed metrics/unlock progression');
  assert(frozenWall.projectCompleted && !frozenWall.projectStillActive, '50 fast ticks never completed the eligible capital project');
  assert(frozenWall.ratingAward === 2, `capital project award was not exactly once (${frozenWall.ratingAward})`);
}

function testProgressionSurvivesSaveResume(): void {
  withControlledWallClock((advanceWall) => {
    const state = prepareProgressionState(88_211);
    const parsed = parseAndMigrateSave(serializeSave('infrastructure-cadence', state, 'test'));
    assert(parsed.ok, parsed.ok ? '' : parsed.error);
    // Run the live object forward, then load the older save back into that
    // same object. This mirrors main.ts's Object.assign hydration path and
    // proves its WeakMap cadence notices simulation time moving backwards.
    for (let index = 0; index < 30; index += 1) tick(state, 0.2);
    const resumed = hydrateStateFromSave(parsed.save).state;
    Object.assign(state, resumed);
    // Retail-sale count is not part of the legacy save schema. Re-stage that
    // final condition after hydration; this test owns cadence continuity, not
    // the separate persistence contract for every project fact.
    state.usageTotals.tradeGoodsSold = 6;
    state.controls.paused = false;
    state.controls.shipsPerCycle = 0;
    for (let index = 0; index < 50; index += 1) {
      // The wall clock remains frozen. A resumed world must derive cadence
      // from its restored simulation time/state, not from process uptime.
      advanceWall(0);
      tick(state, 0.2);
    }
    assert(state.unlocks.tier >= 1, 'resumed fast ticks never advanced unlock progression');
    assert(
      state.openingEconomy.capitalProjects.completed.includes('roadside-rest-stop'),
      'resumed fast ticks never completed the eligible capital project'
    );
    assert(
      (state.usageTotals.ratingFromVisitorSuccessByReason.capitalProject ?? 0) === 2,
      'save/resume duplicated or lost the capital-project rating award'
    );
  });
}

function testDockHydrationIsReentrantSafe(): void {
  const state = createInitialState({ seed: 88_212 });
  state.tiles.fill(TileType.Space);
  state.rooms.fill(RoomType.None);
  state.modules.fill(ModuleType.None);
  state.moduleInstances = [];
  state.moduleOccupancyByTile.fill(null);
  state.docks = [];

  const clusters = [
    [toIndex(12, 10, state.width), toIndex(12, 11, state.width)],
    [toIndex(26, 18, state.width), toIndex(26, 19, state.width)]
  ];
  for (const cluster of clusters) {
    for (const tile of cluster) {
      state.tiles[tile] = TileType.Dock;
      state.tiles[tile - 1] = TileType.Floor;
    }
  }
  bumpTopologyVersion(state);

  // Before the fix, facing inference on the first adjacent pair re-entered
  // this hydration path until RangeError: Maximum call stack size exceeded.
  ensureDockByTileCache(state);
  assert(state.docks.length === 2, `expected two hydrated docks, got ${state.docks.length}`);
  assert(state.docks.every((dock) => dock.tiles.length === 2), 'hydration produced the wrong dock clusters');
  for (const cluster of clusters) {
    const first = state.derived.dockByTile.get(cluster[0]);
    const second = state.derived.dockByTile.get(cluster[1]);
    assert(first && second && first.id === second.id, 'adjacent tiles did not map to their shared dock');
  }
  assert(
    state.derived.dockByTile.get(clusters[0][0])?.id !== state.derived.dockByTile.get(clusters[1][0])?.id,
    'separate clusters collapsed onto one dock/cache entry'
  );

  const dockVersion = state.dockVersion;
  ensureDockByTileCache(state);
  assert(state.dockVersion === dockVersion, 'a warm dock-cache lookup rebuilt the registry');
}

function run(): void {
  testDockHydrationIsReentrantSafe();
  testProgressionUsesSimulationTime();
  testProgressionSurvivesSaveResume();
  console.log('infrastructure-determinism-tests: ok');
}

run();
