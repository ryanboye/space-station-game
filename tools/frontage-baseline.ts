/**
 * Phase 0 structural-frontage baseline.
 *
 * This is deliberately a measurement harness, not an assertion suite. It
 * establishes reproducible evidence for the layouts we expect later phases to
 * improve, while naming the metrics that the current simulation does not yet
 * expose. Run with `npm run baseline:frontage`.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { findPath } from '../src/sim/path';
import {
  createInitialState,
  getPortOpsTelemetry,
  getRoomInspectorAt,
  rebuildDockEntities,
  setRoom,
  setTile,
  tick,
  tryPlaceModule
} from '../src/sim/sim';
import {
  ModuleType,
  RoomType,
  TileType,
  type PathIntent,
  type StationState,
  toIndex
} from '../src/sim/types';

const SEED = 39001;
const FLOW_SAMPLES = 12;
const WARMUP_TICKS = 80;
const MEASURED_TICKS = 240;

type PathFlow = {
  paths: number[][];
  maxTileLoad: number;
  sharedTiles: number;
  totalPathTiles: number;
  doorPeakLoad: number;
  doorTilesUsed: number;
};

type TickCost = {
  avgMs: number;
  p95Ms: number;
};

function fail(message: string): never {
  throw new Error(`frontage baseline: ${message}`);
}

function tile(state: StationState, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= state.width || y >= state.height) fail(`tile ${x},${y} is out of bounds`);
  return toIndex(x, y, state.width);
}

function freshState(): StationState {
  const state = createInitialState({ seed: SEED, physicalStarterInventory: true, manualTrafficAdmission: true });
  state.controls.paused = false;
  state.controls.shipsPerCycle = 0;
  rebuildDockEntities(state);
  return state;
}

function place(state: StationState, type: ModuleType, x: number, y: number): void {
  const result = tryPlaceModule(state, type, tile(state, x, y), 0);
  if (!result.ok) fail(`could not place ${type} at ${x},${y}: ${result.reason ?? 'unknown reason'}`);
}

function paintFloor(state: StationState, x: number, y: number, width: number, height: number, room = RoomType.None): void {
  for (let yy = y; yy < y + height; yy++) {
    for (let xx = x; xx < x + width; xx++) {
      const index = tile(state, xx, yy);
      setTile(state, index, TileType.Floor);
      setRoom(state, index, room);
    }
  }
}

function paintWalls(state: StationState, x: number, y: number, width: number, height: number): void {
  for (let xx = x; xx < x + width; xx++) {
    setTile(state, tile(state, xx, y), TileType.Wall);
    setTile(state, tile(state, xx, y + height - 1), TileType.Wall);
  }
  for (let yy = y; yy < y + height; yy++) {
    setTile(state, tile(state, x, yy), TileType.Wall);
    setTile(state, tile(state, x + width - 1, yy), TileType.Wall);
  }
}

function setDoor(state: StationState, x: number, y: number): void {
  setTile(state, tile(state, x, y), TileType.Door);
}

function route(state: StationState, start: number, goal: number, intent: PathIntent): number[] {
  const path = findPath(state, start, goal, {
    allowRestricted: false,
    intent,
    routeSeed: 101 + start + goal
  });
  if (!path) fail(`no ${intent} route from ${start} to ${goal}`);
  return path;
}

function analyzePaths(state: StationState, paths: number[][]): PathFlow {
  const loads = new Map<number, number>();
  for (const path of paths) {
    for (const index of path) loads.set(index, (loads.get(index) ?? 0) + 1);
  }
  const doorLoads = [...loads.entries()]
    .filter(([index]) => state.tiles[index] === TileType.Door)
    .map(([, load]) => load);
  return {
    paths,
    maxTileLoad: Math.max(0, ...loads.values()),
    sharedTiles: [...loads.values()].filter((load) => load > 1).length,
    totalPathTiles: paths.reduce((sum, path) => sum + path.length, 0),
    doorPeakLoad: Math.max(0, ...doorLoads),
    doorTilesUsed: doorLoads.length
  };
}

function measureTickCost(state: StationState): TickCost {
  for (let i = 0; i < WARMUP_TICKS; i++) tick(state, 0.25);
  const samples: number[] = [];
  for (let i = 0; i < MEASURED_TICKS; i++) {
    const started = performance.now();
    tick(state, 0.25);
    samples.push(performance.now() - started);
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const p95Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return {
    avgMs: samples.reduce((sum, value) => sum + value, 0) / samples.length,
    p95Ms: sorted[p95Index]
  };
}

function compactStarter(): Record<string, number> {
  const state = freshState();
  const podDocks = state.moduleInstances.filter((module) => module.type === ModuleType.PodDock).length;
  const freightLockers = state.moduleInstances.filter((module) => module.type === ModuleType.FreightLocker).length;
  const publicWalkableTiles = state.tiles.filter((value) => value === TileType.Floor || value === TileType.Door).length;
  const telemetry = getPortOpsTelemetry(state);
  const performanceCost = measureTickCost(state);
  return {
    pod_docks: podDocks,
    dock_entities: state.docks.length,
    freight_lockers: freightLockers,
    walkable_tiles: publicWalkableTiles,
    port_offers_accepted: telemetry.offersAccepted,
    tick_avg_ms: performanceCost.avgMs,
    tick_p95_ms: performanceCost.p95Ms
  };
}

function terminalFlow(secondDoor: boolean): Record<string, number> {
  const state = freshState();
  // A concourse feeds a passenger terminal through one deliberately narrow
  // throat. The alternative has a second entrance in the same shell.
  paintFloor(state, 4, 4, 20, 13);
  paintWalls(state, 4, 4, 20, 13);
  for (let x = 5; x <= 22; x++) setTile(state, tile(state, x, 9), TileType.Wall);
  setDoor(state, 13, 9);
  if (secondDoor) setDoor(state, 7, 9);
  for (let y = 10; y <= 15; y++) {
    for (let x = 5; x <= 22; x++) setRoom(state, tile(state, x, y), RoomType.Cafeteria);
  }

  const paths: number[][] = [];
  for (let i = 0; i < FLOW_SAMPLES; i++) {
    const x = 5 + i;
    paths.push(route(state, tile(state, x, 7), tile(state, x, 14), 'visitor'));
  }
  const flow = analyzePaths(state, paths);
  const cost = measureTickCost(state);
  return {
    routes: flow.paths.length,
    route_tiles_total: flow.totalPathTiles,
    shared_route_tiles: flow.sharedTiles,
    peak_route_load: flow.maxTileLoad,
    door_tiles_used: flow.doorTilesUsed,
    door_peak_load: flow.doorPeakLoad,
    tick_avg_ms: cost.avgMs,
    tick_p95_ms: cost.p95Ms
  };
}

function crossingFlow(separated: boolean): Record<string, number> {
  const state = freshState();
  // The bad case forces cargo through the public route. The improved case
  // gives cargo a parallel service corridor with no shared walk tiles.
  paintFloor(state, 4, 34, 20, 1, RoomType.Cafeteria);
  paintWalls(state, 3, 33, 22, 3);
  setDoor(state, 3, 34);
  setDoor(state, 24, 34);
  if (separated) {
    paintFloor(state, 13, 37, 1, 10, RoomType.LogisticsStock);
    paintWalls(state, 12, 36, 3, 12);
    setDoor(state, 13, 36);
    setDoor(state, 13, 47);
  } else {
    for (let y = 30; y <= 39; y++) {
      setTile(state, tile(state, 13, y), TileType.Floor);
      setRoom(state, tile(state, 13, y), RoomType.LogisticsStock);
    }
  }

  const visitorPath = route(state, tile(state, 4, 34), tile(state, 23, 34), 'visitor');
  const cargoPath = separated
    ? route(state, tile(state, 13, 37), tile(state, 13, 46), 'logistics')
    : route(state, tile(state, 13, 30), tile(state, 13, 39), 'logistics');
  const visitorTiles = new Set(visitorPath);
  const sharedTiles = cargoPath.filter((index) => visitorTiles.has(index)).length;
  const cost = measureTickCost(state);
  return {
    visitor_route_tiles: visitorPath.length,
    cargo_route_tiles: cargoPath.length,
    public_cargo_shared_tiles: sharedTiles,
    public_cargo_crossing: sharedTiles > 0 ? 1 : 0,
    tick_avg_ms: cost.avgMs,
    tick_p95_ms: cost.p95Ms
  };
}

function marketCapacity(twoStalls: boolean): Record<string, number> {
  const state = freshState();
  const width = twoStalls ? 8 : 5;
  paintFloor(state, 44, 4, width, 4, RoomType.Market);
  paintWalls(state, 43, 3, width + 2, 6);
  setDoor(state, 44, 3);
  place(state, ModuleType.MarketStall, 45, 5);
  if (twoStalls) place(state, ModuleType.MarketStall, 48, 5);
  const inspector = getRoomInspectorAt(state, tile(state, 45, 5));
  if (!inspector) fail('market inspector was unavailable');
  const providers = inspector.providers?.filter((provider) => provider.kind === 'market') ?? [];
  const cost = measureTickCost(state);
  return {
    market_providers: providers.length,
    market_service_slots: providers.reduce((sum, provider) => sum + provider.capacity, 0),
    market_stock_capacity: inspector.inventory?.capacity ?? 0,
    market_cluster_tiles: inspector.clusterSize,
    market_doors: inspector.doorCount,
    tick_avg_ms: cost.avgMs,
    tick_p95_ms: cost.p95Ms
  };
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3);
}

function printScenario(name: string, metrics: Record<string, number>): void {
  const body = Object.entries(metrics)
    .map(([key, value]) => `${key}=${formatNumber(value)}`)
    .join(' ');
  console.log(`${name} | ${body}`);
}

function printDelta(name: string, before: Record<string, number>, after: Record<string, number>, keys: string[]): void {
  const body = keys
    .map((key) => `${key}=${formatNumber(before[key])}->${formatNumber(after[key])}`)
    .join(' ');
  console.log(`compare:${name} | ${body}`);
}

function requireImprovement(condition: boolean, message: string): void {
  if (!condition) fail(message);
}

/**
 * Persist the run so later phases can diff against it rather than against a
 * screenshot of a terminal. Written with sorted keys and no timestamp, so a
 * genuine behavior change shows up as a diff and a re-run of unchanged code
 * shows up as nothing at all.
 */
function writeBaselineArtifact(scenarios: Record<string, Record<string, number>>): void {
  const sortedScenarios: Record<string, Record<string, number>> = {};
  for (const name of Object.keys(scenarios).sort()) {
    const metrics = scenarios[name];
    const sortedMetrics: Record<string, number> = {};
    // Tick timings are host-dependent, so they stay in the console report and
    // out of the committed artifact — otherwise every run on a different
    // machine would look like a regression.
    for (const key of Object.keys(metrics).sort()) {
      if (key.startsWith('tick_')) continue;
      sortedMetrics[key] = metrics[key];
    }
    sortedScenarios[name] = sortedMetrics;
  }
  const payload = { seed: SEED, flowSamples: FLOW_SAMPLES, scenarios: sortedScenarios };
  const dir = path.resolve(__dirname, '..', '..', '..', 'tools', 'harness', 'baselines');
  const target = path.join(dir, 'frontage-baseline.json');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`ARTIFACT | ${path.relative(process.cwd(), target)}`);
}

function main(): void {
  const starter = compactStarter();
  const badTerminal = terminalFlow(false);
  const improvedTerminal = terminalFlow(true);
  const crossing = crossingFlow(false);
  const separated = crossingFlow(true);
  const oneCheckout = marketCapacity(false);
  const twoCheckout = marketCapacity(true);

  requireImprovement(starter.pod_docks === 2, `expected two starter Pod Docks, found ${starter.pod_docks}`);
  requireImprovement(
    improvedTerminal.door_peak_load < badTerminal.door_peak_load,
    'second terminal entrance did not lower peak door route load'
  );
  requireImprovement(
    improvedTerminal.shared_route_tiles < badTerminal.shared_route_tiles,
    'second terminal entrance did not lower shared route tiles'
  );
  requireImprovement(crossing.public_cargo_shared_tiles > 0, 'crossing case has no public/cargo shared route');
  requireImprovement(separated.public_cargo_shared_tiles === 0, 'separated case still shares public/cargo route tiles');
  requireImprovement(
    twoCheckout.market_service_slots > oneCheckout.market_service_slots,
    'second market checkout did not increase service slots'
  );

  console.log(`STRUCTURAL FRONTAGE BASELINE v1 seed=${SEED} flow_samples=${FLOW_SAMPLES}`);
  printScenario('compact-starter-two-pod-docks', starter);
  printScenario('single-door-passenger-terminal', badTerminal);
  printScenario('two-entrance-passenger-terminal', improvedTerminal);
  printDelta('terminal', badTerminal, improvedTerminal, ['door_peak_load', 'shared_route_tiles', 'route_tiles_total']);
  printScenario('public-cargo-crossing', crossing);
  printScenario('separated-service-corridor', separated);
  printDelta('public-cargo', crossing, separated, ['public_cargo_shared_tiles', 'public_cargo_crossing']);
  printScenario('one-checkout-market', oneCheckout);
  printScenario('two-checkout-market', twoCheckout);
  printDelta('market', oneCheckout, twoCheckout, ['market_service_slots', 'market_stock_capacity', 'market_cluster_tiles']);
  // These lines used to claim a far longer list was unavailable, including
  // things that have since been implemented and asserted elsewhere, and a note
  // that "actors still co-occupy tiles today" — which the movement coordinator
  // has since made false. Anyone auditing the Phase 0 metrics rows from this
  // report was being told the wrong thing. What is genuinely missing is now
  // named precisely, and metrics that moved name the runner that owns them.
  console.log('ELSEWHERE | visit duration, approach-group wait, disembark/boarding duration, committed load, stranded occupants -> test:gate-g-metrics-admission');
  console.log('ELSEWHERE | recurring-need fixture use and reception effects -> test:gate-f-facility; live public/cargo conflict -> test:physical-cargo');
  console.log('UNAVAILABLE | physical door wait seconds, corridor contention, queue spill length, and a counted queue balk');
  console.log('UNAVAILABLE | EVA suited-seconds, and render frame time / visual smoothness (nothing reads state.metrics.frameMs yet)');
  console.log('NOTE | route metrics are deterministic path-overlap proxies. Tick cost is host-dependent, so compare tick_* only against runs on the same machine.');

  writeBaselineArtifact({
    'compact-starter-two-pod-docks': starter,
    'single-door-passenger-terminal': badTerminal,
    'two-entrance-passenger-terminal': improvedTerminal,
    'public-cargo-crossing': crossing,
    'separated-service-corridor': separated,
    'one-checkout-market': oneCheckout,
    'two-checkout-market': twoCheckout
  });
}

main();
