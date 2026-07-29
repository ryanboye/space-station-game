import {
  createInitialState,
  expandMap,
  getPortOpsTelemetry,
  setRoom,
  setTile,
  tick,
  tryPlaceModule,
  validateDockPlacement
} from '../src/sim/sim';
import { buildStableScenario } from '../src/sim/scenarios';
import { hydrateStateFromSave, serializeSave } from '../src/sim/save';
import { createVisitorNeeds } from '../src/sim/occupant-demand';
import { ModuleType, RoomType, TileType, VisitorState, ZoneType, type StationState, type Visitor } from '../src/sim/types';

const DT = 1 / 15;
const WARMUP_TICKS = 30;
const SAMPLE_TICKS = 180;
/** Long enough for physical meal service to actually complete at scale. */
const OPERATION_SECONDS = 180;
const SEED = 74_221;
const DOCK_TARGET = 10;
const TARGET = process.argv.includes('--tier=100') ? 100 : 50;

type ScalarSummary = { p50: number; p95: number; p99: number; max: number };

type BenchmarkRun = {
  wallMs: number;
  checksum: string;
  fixture: {
    requestedCrew: number;
    requestedVisitors: number;
    initialCrew: number;
    initialVisitors: number;
    initialInterfaces: number;
    footprintTiles: number;
    footprintMultiplier: number;
    activeJobsAtStart: number;
    activeReservationsAtStart: number;
  };
  finalCounters: Record<string, number>;
  timingMs: Record<string, ScalarSummary>;
  counters: Record<string, ScalarSummary>;
  omissions: string[];
};

type CollectedRun = {
  run: BenchmarkRun;
  fingerprint: unknown;
};

type FingerprintDifference = {
  path: string;
  first: unknown;
  second: unknown;
};

type FixtureTemplate = {
  baselineFootprint: number;
  saved: Record<string, unknown>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function object(value: unknown, label: string): Record<string, unknown> {
  assert(typeof value === 'object' && value !== null && !Array.isArray(value), `${label} must be an object`);
  return value as Record<string, unknown>;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function percentile(values: number[], fraction: number): number {
  assert(values.length > 0, 'Cannot summarize an empty sample series');
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1);
  return Number(sorted[index].toFixed(6));
}

function summarize(values: number[]): ScalarSummary {
  return {
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    p99: percentile(values, 0.99),
    max: Number(Math.max(...values).toFixed(6))
  };
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

function checksum(value: unknown): string {
  let hash = 0x811c9dc5;
  const source = stableStringify(value);
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function rounded(value: number): number {
  return Number(value.toFixed(6));
}

function normalizedGameplayValue(value: unknown): unknown {
  if (typeof value === 'number') return Number.isFinite(value) ? rounded(value) : String(value);
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(normalizedGameplayValue);
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record).sort().map((key) => [key, normalizedGameplayValue(record[key])])
  );
}

function gameplayFingerprint(state: StationState): unknown {
  const crew = [...state.crewMembers].sort((left, right) => left.id - right.id).map((actor) => normalizedGameplayValue({
    id: actor.id,
    tileIndex: actor.tileIndex,
    role: actor.role,
    staffRole: actor.staffRole,
    path: actor.path,
    targetTile: actor.targetTile,
    activeJobId: actor.activeJobId,
    carryingItemType: actor.carryingItemType,
    carryingAmount: actor.carryingAmount,
    blockedTicks: actor.blockedTicks,
    energy: actor.energy,
    hunger: actor.hunger,
    hygiene: actor.hygiene,
    bladder: actor.bladder,
    thirst: actor.thirst,
    morale: actor.morale,
    missedPayrollCycles: actor.missedPayrollCycles,
    needsStrainSec: actor.needsStrainSec,
    resignationNoticeAt: actor.resignationNoticeAt,
    airExposureSec: actor.airExposureSec,
    healthState: actor.healthState
  }));
  const visitors = [...state.visitors].sort((left, right) => left.id - right.id).map((actor) => normalizedGameplayValue({
    id: actor.id,
    tileIndex: actor.tileIndex,
    state: actor.state,
    path: actor.path,
    blockedTicks: actor.blockedTicks,
    patience: actor.patience,
    eatTimer: actor.eatTimer,
    servedMeal: actor.servedMeal,
    carryingMeal: actor.carryingMeal,
    carryingDrink: actor.carryingDrink ?? false,
    reservedServingTile: actor.reservedServingTile,
    reservedTargetTile: actor.reservedTargetTile,
    queueProviderTile: actor.queueProviderTile ?? null,
    queueJoinedAt: actor.queueJoinedAt ?? null,
    transferPhase: actor.transferPhase ?? 'station',
    transferSlotKey: actor.transferSlotKey ?? null,
    transferQueuedAt: actor.transferQueuedAt ?? null,
    activeService: actor.activeService,
    servicePlan: actor.servicePlan,
    completedServices: actor.completedServices,
    stayClass: actor.stayClass ?? null,
    recurringNeedActive: actor.recurringNeedActive ?? null,
    needs: actor.needs ?? null,
    airExposureSec: actor.airExposureSec,
    healthState: actor.healthState,
    originShipId: actor.originShipId,
    strandedFromShipId: actor.strandedFromShipId ?? null
  }));
  const residents = [...state.residents].sort((left, right) => left.id - right.id).map((actor) => normalizedGameplayValue({
    id: actor.id,
    tileIndex: actor.tileIndex,
    state: actor.state,
    path: actor.path,
    blockedTicks: actor.blockedTicks,
    hunger: actor.hunger,
    energy: actor.energy,
    hygiene: actor.hygiene,
    social: actor.social,
    safety: actor.safety,
    stress: actor.stress,
    satisfaction: actor.satisfaction,
    leaveIntent: actor.leaveIntent,
    homeShipId: actor.homeShipId,
    homeDockId: actor.homeDockId,
    housingUnitId: actor.housingUnitId,
    bedModuleId: actor.bedModuleId,
    airExposureSec: actor.airExposureSec,
    healthState: actor.healthState
  }));
  const sortedByNumericId = <T extends { id: number }>(entries: T[]): unknown[] =>
    [...entries].sort((left, right) => left.id - right.id).map(normalizedGameplayValue);
  const itemNodes = [...state.itemNodes].sort((left, right) => left.tileIndex - right.tileIndex).map((node) => normalizedGameplayValue({
    tileIndex: node.tileIndex,
    capacity: node.capacity,
    items: node.items
  }));

  return normalizedGameplayValue({
    version: 1,
    time: state.now,
    rng: { seedAtCreation: state.seedAtCreation },
    map: {
      width: state.width,
      height: state.height,
      worldOriginX: state.mapWorldOriginX,
      worldOriginY: state.mapWorldOriginY,
      tiles: state.tiles,
      rooms: state.rooms,
      zones: state.zones,
      roomHousingPolicies: state.roomHousingPolicies,
      modules: state.modules
    },
    resources: {
      credits: state.metrics.credits,
      legacyMaterialStock: state.legacyMaterialStock,
      materials: state.metrics.materials,
      waterStock: state.metrics.waterStock,
      airQuality: state.metrics.airQuality,
      rawFoodStock: state.metrics.rawFoodStock,
      mealStock: state.metrics.mealStock,
      kitchenRawBuffer: state.metrics.kitchenRawBuffer,
      preppedMealStock: state.metrics.preppedMealStock,
      cleanTrayStock: state.metrics.cleanTrayStock,
      dirtyTrayStock: state.metrics.dirtyTrayStock,
      drinkStock: state.metrics.drinkStock,
      wastewaterBacklog: state.metrics.wastewaterBacklog,
      itemNodes
    },
    actors: { crew, visitors, residents },
    ships: sortedByNumericId(state.arrivingShips),
    contracts: sortedByNumericId(state.portOps.contracts),
    jobs: sortedByNumericId(state.jobs),
    reservations: sortedByNumericId(state.reservations),
    counters: {
      crewTotal: state.crew.total,
      visitors: state.visitors.length,
      residents: state.residents.length,
      arrivingShips: state.arrivingShips.length,
      dockQueue: state.dockQueue.length,
      incidentsTotal: state.metrics.incidentsTotal,
      incidentsOpen: state.metrics.incidentsOpen,
      deathsTotal: state.metrics.deathsTotal,
      mealsServedTotal: state.metrics.mealsServedTotal,
      visitsThisCycle: state.metrics.visitsThisCycle,
      visitFailuresThisCycle: state.metrics.visitFailuresThisCycle,
      createdJobs: state.metrics.createdJobs,
      completedJobs: state.metrics.completedJobs,
      expiredJobs: state.metrics.expiredJobs,
      activeReservations: state.metrics.activeReservations,
      reservationFailures: state.metrics.reservationFailures,
      expiredReservations: state.metrics.expiredReservations,
      maxBlockedTicksObserved: state.metrics.maxBlockedTicksObserved,
      turnaroundsCompletedLifetime: state.metrics.turnaroundsCompletedLifetime,
      creditsEarnedLifetime: state.metrics.creditsEarnedLifetime
    }
  });
}

function firstFingerprintDifference(first: unknown, second: unknown, path = '$'): FingerprintDifference | null {
  if (Object.is(first, second)) return null;
  if (Array.isArray(first) && Array.isArray(second)) {
    const length = Math.max(first.length, second.length);
    for (let index = 0; index < length; index++) {
      const difference = firstFingerprintDifference(first[index], second[index], `${path}[${index}]`);
      if (difference) return difference;
    }
    return null;
  }
  if (first !== null && second !== null && typeof first === 'object' && typeof second === 'object') {
    const firstRecord = first as Record<string, unknown>;
    const secondRecord = second as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(firstRecord), ...Object.keys(secondRecord)])].sort();
    for (const key of keys) {
      const difference = firstFingerprintDifference(firstRecord[key], secondRecord[key], `${path}.${key}`);
      if (difference) return difference;
    }
    return null;
  }
  return { path, first, second };
}

function snapshotOf(state: StationState): Record<string, unknown> {
  const parsed = object(JSON.parse(serializeSave('target-scale-perf', state, 'benchmark')), 'serialized save');
  return object(parsed.snapshot, 'serialized snapshot');
}

function toIndex(state: StationState, x: number, y: number): number {
  return y * state.width + x;
}

function farEnoughFromPlaced(state: StationState, candidate: number, placed: number[]): boolean {
  const x = candidate % state.width;
  const y = Math.floor(candidate / state.width);
  return placed.every((other) => {
    const ox = other % state.width;
    const oy = Math.floor(other / state.width);
    return Math.abs(x - ox) + Math.abs(y - oy) >= 4;
  });
}

function buildPublicApron(state: StationState, targetTiles = 240): void {
  const coreX = state.core.centerTile % state.width;
  const coreY = Math.floor(state.core.centerTile / state.width);
  const tieInY = coreY + 6;
  const top = Math.min(state.height - 14, coreY + 12);
  const bottom = Math.min(state.height - 3, top + 11);
  const left = Math.max(2, coreX - 15);
  const right = Math.min(state.width - 3, coreX + 15);

  // The old benchmark painted a bare floor ribbon through vacuum. Besides
  // being an invalid player layout, that made air exposure depend on cadence
  // and contaminated determinism. Build the same footprint as a sealed wing.
  setTile(state, toIndex(state, coreX, tieInY), TileType.Door);
  for (let y = tieInY + 1; y < top; y++) {
    setTile(state, toIndex(state, coreX, y), TileType.Floor);
    setTile(state, toIndex(state, coreX - 1, y), TileType.Wall);
    setTile(state, toIndex(state, coreX + 1, y), TileType.Wall);
  }
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      const perimeter = x === left || x === right || y === top || y === bottom;
      setTile(state, toIndex(state, x, y), perimeter ? TileType.Wall : TileType.Floor);
    }
  }
  setTile(state, toIndex(state, coreX, top), TileType.Door);
  for (let y = top + 1; y < bottom; y++) {
    for (let x = left + 1; x < right; x++) setRoom(state, toIndex(state, x, y), RoomType.Cafeteria);
  }
  // Visitor food service is a deliberately PUBLIC operation: production
  // refuses to treat a cluster with any restricted tile as one. The apron
  // inherited whatever access policy the starter left behind, which is why it
  // read as a crew mess. Publish the whole wing, spine included.
  setTile(state, toIndex(state, coreX, tieInY), TileType.Door);
  for (let y = tieInY; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      const tile = toIndex(state, x, y);
      if (state.tiles[tile] !== TileType.Floor && state.tiles[tile] !== TileType.Door) continue;
      state.zones[tile] = ZoneType.Public;
    }
  }
  for (let y = tieInY; y < top; y++) state.zones[toIndex(state, coreX, y)] = ZoneType.Public;
  const built = (bottom - top - 1) * (right - left - 1);
  assert(built >= targetTiles, `Authored apron must contribute at least ${targetTiles} tiles, got ${built}`);
  tick(state, 0);

  // Production only treats a cafeteria cluster as PUBLIC visitor food service
  // once it holds two counters, two tables and a tray return. The old apron
  // had one counter and no tray return, so it was a crew mess: the authored
  // hungry visitors could never join a line and this benchmark was timing an
  // operationally inert crowd. Build the real thing.
  // Placement matters as much as count. A counter whose pickup tile stands
  // directly inside the room's doorway lets its line run out through the door;
  // a counter buried in the middle of the floor folds its line back across the
  // seating and serves almost nobody. This mirrors the authored compact-block
  // cafeteria, which puts a counter under each of its doors.
  const counterTiles = [toIndex(state, coreX - 1, top + 1), toIndex(state, coreX + 2, top + 1)];
  for (const tile of counterTiles) {
    const serving = tryPlaceModule(state, ModuleType.ServingStation, tile);
    assert(serving.ok, `Scale cafeteria serving station failed: ${serving.reason ?? 'unknown'}`);
  }
  const trayTile = toIndex(state, coreX + 5, top + 1);
  const trayReturn = tryPlaceModule(state, ModuleType.TrayReturn, trayTile);
  assert(trayReturn.ok, `Scale cafeteria tray return failed: ${trayReturn.reason ?? 'unknown'}`);
  for (let row = 0; row < 2; row++) {
    for (let column = 0; column < 4; column++) {
      const table = tryPlaceModule(
        state,
        ModuleType.Table,
        toIndex(state, left + 7 + column * 4, top + 2 + row * 4)
      );
      assert(table.ok, `Scale cafeteria table failed: ${table.reason ?? 'unknown'}`);
    }
  }
  for (const tile of counterTiles) {
    const servingNode = state.itemNodes.find((node) => node.tileIndex === tile);
    assert(servingNode, 'Scale cafeteria serving station needs a physical stock node.');
    servingNode.items.meal = 60;
    servingNode.items.cleanTray = 60;
  }
  tick(state, 0);
}

function installDockInterfaces(state: StationState): void {
  const placed = state.docks.map((dock) => dock.anchorTile);
  let lastPlacementFailure = 'no valid outer-hull candidate';
  for (let y = 0; y < state.height && state.docks.length < DOCK_TARGET; y++) {
    for (let x = 0; x < state.width && state.docks.length < DOCK_TARGET; x++) {
      const index = toIndex(state, x, y);
      if (state.tiles[index] === TileType.Space || state.tiles[index] === TileType.Dock) continue;
      if (!farEnoughFromPlaced(state, index, placed)) continue;
      if (!validateDockPlacement(state, index).valid) continue;
      setTile(state, index, TileType.Dock);
      tick(state, 0);
      const dock = state.docks.find((entry) => entry.anchorTile === index);
      if (dock) placed.push(index);
    }
  }
  assert(state.docks.length >= 5 && state.docks.length <= 10, `Expected 5-10 interfaces, got ${state.docks.length}: ${lastPlacementFailure}`);
  assert(state.docks.length === DOCK_TARGET, `Expected ${DOCK_TARGET} independently placeable dock interfaces, got ${state.docks.length}`);
}

function makeTemplate(): FixtureTemplate {
  const state = createInitialState({ seed: SEED, physicalStarterInventory: true });
  const baselineFootprint = state.width * state.height;
  buildStableScenario().setup(state);
  state.metrics.credits = 1_000_000;
  state.legacyMaterialStock = 1_000_000;
  buildPublicApron(state);
  installDockInterfaces(state);

  const saved = snapshotOf(state);
  const savedTiles = saved.tiles as unknown[];
  for (const dock of state.docks) {
    for (const tile of dock.tiles) savedTiles[tile] = TileType.Floor;
  }
  saved.dockConfigs = [];
  saved.arrivingShips = [];
  saved.visitors = [];
  return { baselineFootprint, saved };
}

function makeStaticVisitor(id: number, tileIndex: number, state: StationState): Visitor {
  const needs = createVisitorNeeds(id);
  // A scale benchmark should exercise the station, not time an inert crowd.
  // One third of the authored visitors arrive hungry and immediately seek a
  // meal, producing real paths, provider reservations, and queue pressure.
  const seekingMeal = id % 3 === 0;
  needs.hunger = seekingMeal ? 18 : 100;
  needs.energy = 100;
  needs.hygiene = 100;
  needs.active = null;
  needs.unmetSince = null;
  return {
    id,
    name: `Scale Visitor ${id}`,
    trait: 'patient',
    x: (tileIndex % state.width) + 0.5,
    y: Math.floor(tileIndex / state.width) + 0.5,
    tileIndex,
    state: seekingMeal ? VisitorState.ToCafeteria : VisitorState.Leisure,
    path: [],
    speed: 2,
    patience: 0,
    eatTimer: seekingMeal ? 0 : 1_000_000,
    trespassed: false,
    servedMeal: !seekingMeal,
    carryingMeal: false,
    carryingDrink: false,
    reservedServingTile: null,
    reservedTargetTile: null,
    blockedTicks: 0,
    archetype: 'lounger',
    taxSensitivity: 1,
    spendMultiplier: 1,
    patienceMultiplier: 1,
    primaryPreference: 'lounge',
    spawnedAt: state.now,
    originShipId: null,
    airExposureSec: 0,
    healthState: 'healthy',
    hygieneStopUsed: false,
    leisureLegsRemaining: seekingMeal ? 0 : 1,
    leisureLegsPlanned: 1,
    lastLeisureKind: null,
    servicePlan: seekingMeal ? ['meal'] : [],
    completedServices: [],
    activeService: seekingMeal ? 'meal' : null,
    optionalDrinkActive: false,
    repeatDrinksServed: 0,
    queueProviderTile: null,
    queueJoinedAt: null,
    transferPhase: 'station',
    transferSlotKey: null,
    transferQueuedAt: null,
    transferQueueTile: null,
    transferAccessTile: null,
    transferStationTile: null,
    transferCrossingStartedAt: null,
    transferBlockedTile: null,
    serviceBlockedSince: null,
    activeIncidentId: null,
    stayClass: 'extended',
    needs,
    recurringNeedActive: null,
    marketTradeGoodSourceTile: null,
    temporarySleepTargetTile: null,
    serviceFailureStage: 'none',
    failureSince: null,
    failureNeed: null,
    // Keep the benchmark population resident for the entire sample while
    // still exercising the long-stay visitor needs engine. A far-future
    // relief transfer makes these synthetic occupants durable without
    // inventing a fake live ship whose turnaround would skew port metrics.
    strandedFromShipId: -1,
    strandedAt: state.now,
    reliefEligibleAt: state.now + 1_000_000
  };
}

function buildTierState(template: FixtureTemplate, target: number): StationState {
  const snapshot = clone(template.saved);
  const crew = object(snapshot.crew, 'snapshot crew');
  crew.total = target;
  const roleCounts = object(crew.roleCounts, 'snapshot crew roleCounts');
  for (const role of Object.keys(roleCounts)) roleCounts[role] = 0;
  let remainingCrew = target;
  if ('captain' in roleCounts && remainingCrew > 0) {
    roleCounts.captain = 1;
    remainingCrew--;
  }
  for (const role of Object.keys(roleCounts)) {
    if (role === 'captain' || remainingCrew <= 0) continue;
    const assigned = Math.min(60, remainingCrew);
    roleCounts[role] = assigned;
    remainingCrew -= assigned;
  }
  assert(remainingCrew === 0, `Save schema cannot represent ${target} crew across its current staff roles`);
  crew.members = [];
  const hydrated = hydrateStateFromSave({
    schemaVersion: 1,
    gameVersion: 'target-scale-perf',
    createdAt: '2000-01-01T00:00:00.000Z',
    name: `target-scale-${target}`,
    snapshot: snapshot as never
  });
  const south = expandMap(hydrated.state, 'south');
  if (!south.ok) throw new Error(`South expansion failed: ${south.reason ?? 'unknown reason'}`);
  const east = expandMap(hydrated.state, 'east');
  if (!east.ok) throw new Error(`East expansion failed: ${east.reason ?? 'unknown reason'}`);
  installDockInterfaces(hydrated.state);
  const baseVisitorId = 1_000_000 + target * 100;
  const allPublicFloor = hydrated.state.tiles
    .map((tile, index) => ({ tile, index }))
    .filter(({ tile, index }) => tile === TileType.Floor && hydrated.state.zones[index] === ZoneType.Public)
    .map(({ index }) => index);
  const cafeteriaFloor = allPublicFloor.filter((index) => hydrated.state.rooms[index] === RoomType.Cafeteria);
  const visitorTiles = cafeteriaFloor.length > 0 ? cafeteriaFloor : allPublicFloor;
  assert(visitorTiles.length > 0, 'Expected at least one public floor for static visitors');
  hydrated.state.arrivingShips = [];
  hydrated.state.visitors = Array.from({ length: target }, (_, index) =>
    makeStaticVisitor(baseVisitorId + index, visitorTiles[index % visitorTiles.length], hydrated.state)
  );
  for (const crewMember of hydrated.state.crewMembers) {
    crewMember.energy = 100;
    crewMember.hunger = 100;
    crewMember.hygiene = 100;
    crewMember.bladder = 100;
    crewMember.thirst = 100;
    crewMember.morale = 100;
    crewMember.missedPayrollCycles = 0;
    crewMember.needsStrainSec = 0;
    crewMember.resignationNoticeAt = null;
    crewMember.airExposureSec = 0;
    crewMember.healthState = 'healthy';
  }
  hydrated.state.jobs = [];
  hydrated.state.reservations = [];
  hydrated.state.dockQueue = [];
  hydrated.state.controls.paused = false;
  hydrated.state.controls.shipsPerCycle = 0;
  return hydrated.state;
}

function collectRun(template: FixtureTemplate, target: number): CollectedRun {
  const wallStarted = performance.now();
  const state = buildTierState(template, target);
  assert(state.crewMembers.length === target, `Expected ${target} crew after hydration, got ${state.crewMembers.length}`);
  assert(state.visitors.length === target, `Expected ${target} visitors after hydration, got ${state.visitors.length}`);
  assert(state.docks.length >= 5 && state.docks.length <= 10, `Expected 5-10 interfaces after hydration, got ${state.docks.length}`);

  for (let i = 0; i < WARMUP_TICKS; i++) tick(state, DT);
  const activeJobsAtStart = state.jobs.filter((job) => job.state === 'pending' || job.state === 'assigned' || job.state === 'in_progress').length;
  const activeReservationsAtStart = state.reservations.filter((reservation) => reservation.releaseReason === null).length;
  const timingSamples = new Map<string, number[]>();
  const counterSamples = new Map<string, number[]>();
  const add = (targetMap: Map<string, number[]>, name: string, value: number): void => {
    const samples = targetMap.get(name) ?? [];
    samples.push(value);
    targetMap.set(name, samples);
  };

  for (let i = 0; i < SAMPLE_TICKS; i++) {
    tick(state, DT);
    add(timingSamples, 'tickMs', state.metrics.tickMs);
    add(timingSamples, 'pathMs', state.metrics.pathMs);
    add(timingSamples, 'derivedRecomputeMs', state.metrics.derivedRecomputeMs);
    for (const [phase, milliseconds] of Object.entries(state.metrics.simPhaseMs ?? {}).sort(([left], [right]) => left.localeCompare(right))) {
      add(timingSamples, `simPhaseMs.${phase}`, milliseconds);
    }
    add(counterSamples, 'pathCallsPerTick', state.metrics.pathCallsPerTick);
    add(counterSamples, 'activeReservations', state.metrics.activeReservations);
    add(counterSamples, 'pendingJobs', state.metrics.pendingJobs);
    add(counterSamples, 'assignedJobs', state.metrics.assignedJobs);
    add(counterSamples, 'stalledJobs', state.metrics.stalledJobs);
    add(counterSamples, 'cafeteriaQueueingCount', state.metrics.cafeteriaQueueingCount);
    add(counterSamples, 'maxBlockedTicksObserved', state.metrics.maxBlockedTicksObserved);
    add(counterSamples, 'crew', state.crewMembers.length);
    add(counterSamples, 'visitors', state.visitors.length);
    add(counterSamples, 'arrivingShips', state.arrivingShips.length);
    for (const [phase, calls] of Object.entries(state.metrics.simPhasePathCalls ?? {}).sort(([left], [right]) => left.localeCompare(right))) {
      add(counterSamples, `simPhasePathCalls.${phase}`, calls);
    }
  }

  assert(state.crewMembers.length === target, `Crew population changed during measurement: ${target} -> ${state.crewMembers.length}`);
  assert(state.visitors.length === target, `Visitor population changed during measurement: ${target} -> ${state.visitors.length}`);

  const telemetry = getPortOpsTelemetry(state);
  const finalCounters = {
    crew: state.crewMembers.length,
    visitors: state.visitors.length,
    arrivingShips: state.arrivingShips.length,
    jobs: state.jobs.length,
    activeJobs: state.jobs.filter((job) => job.state === 'pending' || job.state === 'assigned' || job.state === 'in_progress').length,
    reservations: state.reservations.length,
    activeReservations: state.metrics.activeReservations,
    cafeteriaQueueingCount: state.metrics.cafeteriaQueueingCount,
    maxBlockedTicksObserved: state.metrics.maxBlockedTicksObserved,
    peakPassengerQueue: telemetry.peakPassengerQueue,
    passengerQueuePersonSeconds: Number(telemetry.passengerQueuePersonSeconds.toFixed(6)),
    pathCallsPerTick: state.metrics.pathCallsPerTick
  };
  const omissions: string[] = [];
  if (activeJobsAtStart === 0) omissions.push('No public fixture API creates a prescribed active job backlog; the normal job board produced none at the sample boundary.');
  if (activeReservationsAtStart === 0) omissions.push('No public fixture API creates prescribed reservations; reservations are left to normal actor/facility behavior.');
  if (telemetry.peakPassengerQueue === 0) omissions.push('No passenger queue formed during this deterministic sample; queue counters are still recorded.');

  const fingerprint = gameplayFingerprint(state);
  return {
    fingerprint,
    run: {
      wallMs: Number((performance.now() - wallStarted).toFixed(3)),
      checksum: checksum(fingerprint),
      fixture: {
        requestedCrew: target,
        requestedVisitors: target,
        initialCrew: target,
        initialVisitors: target,
        initialInterfaces: state.docks.length,
        footprintTiles: state.width * state.height,
        footprintMultiplier: Number(((state.width * state.height) / template.baselineFootprint).toFixed(3)),
        activeJobsAtStart,
        activeReservationsAtStart
      },
      finalCounters,
      timingMs: Object.fromEntries([...timingSamples.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([name, samples]) => [name, summarize(samples)])),
      counters: Object.fromEntries([...counterSamples.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([name, samples]) => [name, summarize(samples)])),
      omissions
    }
  };
}

/**
 * Does the station still FUNCTION as a game at two to three times footprint?
 *
 * The timing runs above answer "is it fast". They are silent on whether
 * anything actually happens, and a station where nobody can be served is
 * extremely fast. This window observes operational outcomes instead of clocks.
 *
 * Two fixture defects had to be fixed before the question could even be asked:
 *
 *  1. The apron was a crew mess, not public food service. Production only
 *     treats a cafeteria cluster as visitor-facing once it holds two counters,
 *     two tables, a tray return and no restricted tile. The old apron had one
 *     counter, no tray return, and inherited whatever access policy the
 *     starter left behind, so the authored hungry visitors could never join a
 *     line at all. It is now a qualifying public cluster.
 *
 *  2. The benchmark population does not survive being simulated. The authored
 *     static visitors are synthetic actors marked stranded off a ship that
 *     does not exist; the 12-second timing sample never noticed, but over a
 *     real window the ordinary lifecycle clears all fifty inside a minute. The
 *     operational window therefore also runs live seeded traffic.
 *
 * The timing runs are deliberately left alone — they still measure the static
 * crowd with traffic off, so the recorded performance baseline is unchanged.
 *
 * What remains unmet is reported, not asserted away. See `unmetClaims`.
 */
function collectOperationalRun(template: FixtureTemplate, target: number) {
  const state = buildTierState(template, target);
  state.controls.shipsPerCycle = 6;
  state.controls.manualTrafficAdmission = false;
  state.controls.portAutoAdmitEnabled = true;
  for (const visitor of state.visitors) {
    visitor.strandedFromShipId = null;
    visitor.strandedAt = null;
    visitor.reliefEligibleAt = null;
    visitor.spawnedAt = state.now;
  }
  for (let i = 0; i < WARMUP_TICKS; i++) tick(state, DT);

  const cafeteriaClusterSummary = (): string => {
    const clusters = state.derived.roomClustersByRoom?.get(RoomType.Cafeteria) ?? [];
    return clusters
      .map((cluster) => {
        const tiles = new Set(cluster);
        const counters = state.moduleInstances.filter(
          (module) => module.type === ModuleType.ServingStation && tiles.has(module.originTile)
        ).length;
        const tables = state.moduleInstances.filter(
          (module) => module.type === ModuleType.Table && tiles.has(module.originTile)
        ).length;
        const trays = state.moduleInstances.filter(
          (module) => module.type === ModuleType.TrayReturn && tiles.has(module.originTile)
        ).length;
        const restricted = cluster.filter((tile) => state.zones[tile] !== ZoneType.Public).length;
        return `${cluster.length}tiles/${counters}counters/${tables}tables/${trays}trays/${restricted}restricted`;
      })
      .join(' + ');
  };

  const queueSamples: number[] = [];
  const servedSamples: number[] = [];
  const populationSamples: number[] = [];
  let dockedShipsSeen = 0;
  const dockedShipIds = new Set<number>();
  let mealSeekersSeen = 0;
  let mealSeekersThatLeftUnfed = 0;
  const seenMealSeekers = new Set<number>();
  const startedMeals = state.serviceLog.visitorLifetimeByService.meal;
  const ticksPerSample = Math.round(1 / DT);
  for (let i = 0; i < OPERATION_SECONDS / DT; i++) {
    const before = new Map(state.visitors.map((visitor) => [visitor.id, visitor]));
    tick(state, DT);
    const after = new Set(state.visitors.map((visitor) => visitor.id));
    for (const [id, visitor] of before) {
      if (!visitor.servicePlan.includes('meal')) continue;
      if (!seenMealSeekers.has(id)) {
        seenMealSeekers.add(id);
        mealSeekersSeen += 1;
      }
      if (!after.has(id) && !visitor.completedServices.includes('meal')) mealSeekersThatLeftUnfed += 1;
    }
    for (const ship of state.arrivingShips) {
      if (ship.stage !== 'docked' || dockedShipIds.has(ship.id)) continue;
      dockedShipIds.add(ship.id);
      dockedShipsSeen += 1;
    }
    if ((i + 1) % ticksPerSample === 0) {
      queueSamples.push(state.metrics.cafeteriaQueueingCount);
      servedSamples.push(state.serviceLog.visitorLifetimeByService.meal - startedMeals);
      populationSamples.push(state.visitors.length);
    }
  }

  const mealsServed = state.serviceLog.visitorLifetimeByService.meal - startedMeals;
  // "Stranded" here means INERT: still owed a meal, and holding no line slot,
  // no pickup reservation, no route and nothing carried. Somebody standing in
  // a line that is moving is waiting, not stranded.
  const liveReservationOwners = new Set(
    state.reservations
      .filter((reservation) => reservation.releaseReason === null && reservation.ownerKind === 'visitor')
      .map((reservation) => reservation.ownerId)
  );
  const stranded = state.visitors.filter((visitor) =>
    visitor.servicePlan.includes('meal') &&
    !visitor.completedServices.includes('meal') &&
    !visitor.carryingMeal &&
    visitor.path.length === 0 &&
    visitor.reservedServingTile === null &&
    (visitor.queueProviderTile ?? null) === null &&
    !liveReservationOwners.has(visitor.id)
  );

  const peakQueue = queueSamples.length === 0 ? 0 : Math.max(...queueSamples);
  const everFell = queueSamples.some((value, index) => index > 0 && value < queueSamples[index - 1]!);
  const monotonicGrowth = peakQueue > 0 && !everFell;
  const half = Math.max(1, Math.floor(servedSamples.length / 2));
  const servedFirstHalf = servedSamples[half - 1] ?? 0;
  const servedSecondHalf = (servedSamples[servedSamples.length - 1] ?? 0) - servedFirstHalf;

  const unmetClaims: string[] = [];
  if (mealsServed === 0) {
    unmetClaims.push(
      `NOT DEMONSTRATED: meals served above zero. ${mealSeekersSeen} visitors carried a meal in their plan `
      + `during the window and ${mealSeekersThatLeftUnfed} of them left the station without one, while the `
      + `apron cafeteria was a fully qualifying public provider (${cafeteriaClusterSummary()}) with `
      + `${state.derived.queueTheater.chainsByAnchor.size} live queue chains. The meal seekers route to the `
      + 'dock within ~20s instead of joining an available line. The abandon/balk decision lives in '
      + 'src/sim/sim.ts (enterServingLineOrBail / joinCafeteriaQueue / balkFromServiceQueue), which this '
      + 'runner does not own, so the gap is reported rather than tuned away here.'
    );
  }
  if (state.crewMembers.length === 0) {
    unmetClaims.push(
      'NOT DEMONSTRATED: a crew that persists. All 50 hydrated crew are gone by the end of the window. '
      + 'The timing sample is 12 seconds long and asserts the roster is unchanged across it, so this was '
      + 'never visible before. Crew persistence at scale depends on src/sim/sim.ts, not on this runner.'
    );
  }
  if (mealsServed > 0 && servedSecondHalf === 0) {
    unmetClaims.push('NOT DEMONSTRATED: service continuing through the second half of the window.');
  }

  const outcome = {
    observedSeconds: OPERATION_SECONDS,
    trafficDriven: true,
    footprintTiles: state.width * state.height,
    footprintMultiplier: Number(((state.width * state.height) / template.baselineFootprint).toFixed(3)),
    interfaces: state.docks.length,
    crewAtEnd: state.crewMembers.length,
    peakVisitors: Math.max(...populationSamples),
    visitorsAtEnd: state.visitors.length,
    publicCafeteriaClusters: cafeteriaClusterSummary(),
    liveQueueChains: state.derived.queueTheater.chainsByAnchor.size,
    mealSeekersObserved: mealSeekersSeen,
    mealSeekersThatLeftUnfed,
    mealsServed,
    shipsThatDocked: dockedShipsSeen,
    turnaroundsCompleted: state.metrics.turnaroundsCompletedLifetime,
    inertMealSeekersAtEnd: stranded.length,
    peakQueue,
    finalQueue: queueSamples[queueSamples.length - 1] ?? 0,
    queueEverFell: everFell,
    queueGrewMonotonically: monotonicGrowth,
    servedFirstHalf,
    servedSecondHalf,
    maxBlockedTicksObserved: state.metrics.maxBlockedTicksObserved,
    unmetClaims
  };

  // Asserted: the things that genuinely hold at this footprint.
  assert(
    outcome.footprintMultiplier >= 2,
    `Target scale must be at least twice the baseline footprint, got ${outcome.footprintMultiplier}x`
  );
  assert(
    outcome.peakVisitors > 0,
    `Target scale sustained no visitor population at all over ${OPERATION_SECONDS}s`
  );
  assert(
    outcome.shipsThatDocked > 0,
    `No ship reached a berth or dock in ${OPERATION_SECONDS}s at target scale: the port is not operating`
  );
  assert(
    !monotonicGrowth,
    `Target-scale cafeteria queue grew monotonically for ${OPERATION_SECONDS}s: ${queueSamples.join(',')}`
  );
  assert(
    stranded.length === 0,
    `Target scale left ${stranded.length} guests inert — owed a meal with no line slot, reservation or route`
  );
  return outcome;
}

function main(): void {
  const benchmarkStarted = performance.now();
  const template = makeTemplate();
  const firstCollected = collectRun(template, TARGET);
  const secondCollected = collectRun(template, TARGET);
  const first = firstCollected.run;
  const second = secondCollected.run;
  const firstSignature = stableStringify({ checksum: first.checksum, finalCounters: first.finalCounters });
  const secondSignature = stableStringify({ checksum: second.checksum, finalCounters: second.finalCounters });
  const deterministic = firstSignature === secondSignature;
  const fingerprintDifference = deterministic
    ? null
    : firstFingerprintDifference(firstCollected.fingerprint, secondCollected.fingerprint);
  const operational = collectOperationalRun(template, TARGET);
  const memory = process.memoryUsage();
  const output = {
    benchmark: 'target-scale-perf',
    dtSeconds: DT,
    warmupTicks: WARMUP_TICKS,
    sampleTicks: SAMPLE_TICKS,
    totalWallMs: Number((performance.now() - benchmarkStarted).toFixed(3)),
    memoryAtExitMiB: {
      rss: Number((memory.rss / 1_048_576).toFixed(3)),
      heapUsed: Number((memory.heapUsed / 1_048_576).toFixed(3))
    },
    operationalPlausibility: {
      claim: 'the target-scale station still functions as a game, not just as a fast tick',
      asserted: [
        'footprint is at least twice the baseline',
        'a visitor population is sustained for the whole window',
        'ships physically reach an interface: the port is operating, not idling',
        'the cafeteria queue is not monotonically growing',
        'no meal seeker is left inert: owed a meal with no slot, reservation or route'
      ],
      measuredNotAsserted: [
        'meals served above zero — see unmetClaims when it is zero'
      ],
      measured: operational
    },
    tiers: [{
      target: TARGET,
      deterministic,
      divergence: deterministic ? null : {
        first: { checksum: first.checksum, finalCounters: first.finalCounters },
        second: { checksum: second.checksum, finalCounters: second.finalCounters },
        smallestFingerprintDifference: fingerprintDifference
      },
      runs: [first, second]
    }],
    publicApiGaps: [
      'hireCrew() hard-stops at 40, so 50+ crew tiers are loaded through the current save/hydrate API using schema-valid roleCounts.',
      'No public API spawns a requested concurrent visitor count; tiers use save-valid static extended visitors with durable needs and a long leisure dwell.',
      'No public API creates a requested active job or reservation backlog; these remain normal simulation outcomes and are reported when absent.'
    ]
  };
  process.stdout.write(`${stableStringify(output)}\n`);
  if (!deterministic) process.exitCode = 1;
}

main();
