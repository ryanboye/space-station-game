import {
  createInitialState,
  getBerthFacilityAt,
  tick,
  validateDockPlacement
} from '../src/sim/index';
import {
  ensureRoomClustersCache,
  getApproachConflictGroups,
  reconcileExteriorIntegrityTargets,
  runMovementCoordinatorTestTick,
  setExteriorIntegrityTargetState
} from '../src/sim/sim';
import { buildStructuralSupportGraph } from '../src/sim/structural-support';
import { applyColdStartScenario } from '../src/sim/cold-start-scenarios';
import {
  ensureUtilityUnderlay,
  UTILITY_UNDERLAY_KINDS
} from '../src/sim/utility-underlay';
import { ModuleType, RoomType, TileType, VisitorState, isWalkable, type StationState } from '../src/sim/types';

const STEP = 1 / 15;
const DURATION_SECONDS = 240;
const MESS_OBSERVED_SECONDS = 180;
const QUEUE_SETTLING_SECONDS = 16;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`normal-scale-operation: ${message}`);
}

function percentile(values: number[], fraction: number): number {
  assert(values.length > 0, 'cannot summarize an empty timing sample');
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]!;
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

/**
 * Does a service line DRAIN, or does it only ever grow?
 *
 * The previous test compared the mean of the last 30 samples against the mean
 * of the 30 before it. That reads as a drain test but is really a "was anyone
 * standing in line at the end" test, and it failed whenever a fresh shipload
 * happened to land inside the final seconds — a station working correctly.
 * Confirmed as an intermittent failure at HEAD, not a regression.
 *
 * What actually distinguishes a working line from a jammed one is whether the
 * line ever comes down and whether service keeps completing while people are
 * standing in it. Both are checked directly here.
 */
function evaluateQueueDrain(
  queueSamples: number[],
  servedSamples: number[],
  balkSamples: number[],
  peakCeiling: number
): {
  ok: boolean;
  peak: number;
  final: number;
  everFell: boolean;
  fullyDrained: boolean;
  progressedWhileQueued: boolean;
  reason: string | null;
} {
  const peak = queueSamples.length === 0 ? 0 : Math.max(...queueSamples);
  const final = queueSamples[queueSamples.length - 1] ?? 0;
  const everFell = queueSamples.some((value, index) => index > 0 && value < queueSamples[index - 1]!);
  // A real drain: the line got substantial and then came back down to nearly
  // nothing at some later moment.
  let fullyDrained = false;
  let sawSubstantial = false;
  for (const value of queueSamples) {
    if (value >= Math.max(4, peak * 0.5)) sawSubstantial = true;
    else if (sawSubstantial && value <= Math.max(1, peak * 0.15)) fullyDrained = true;
  }
  // And settled pressure kept resolving across every stretch where somebody
  // waited, either through service or the same finite-patience balk the player
  // sees in the world.
  // Halves, not smaller slices: physical meal service here is genuinely bursty
  // — the blessed compact-block baseline serves 3 meals in its first 90s and 8
  // more in the next 30 — so a tighter window would test burst phase rather
  // than whether the line moves at all.
  const half = Math.max(1, Math.floor(queueSamples.length / 2));
  let progressedWhileQueued = true;
  for (let start = 0; start + half <= queueSamples.length; start += half) {
    const window = queueSamples.slice(start, start + half);
    if (!window.some((value) => value > 0)) continue;
    const before = servedSamples[start] ?? 0;
    const after = servedSamples[Math.min(servedSamples.length - 1, start + half - 1)] ?? 0;
    const balkBefore = balkSamples[start] ?? 0;
    const balkAfter = balkSamples[Math.min(balkSamples.length - 1, start + half - 1)] ?? 0;
    if (after <= before && balkAfter <= balkBefore) progressedWhileQueued = false;
  }
  const reason = peak > peakCeiling
    ? `peak queue ${peak} exceeded the ${peakCeiling} ceiling`
    : !everFell
      ? 'queue never decreased: it only grew across the whole window'
      : !progressedWhileQueued
          ? 'a stretch with settled demand completed neither service nor a finite-patience balk'
          : null;
  return { ok: reason === null, peak, final, everFell, fullyDrained, progressedWhileQueued, reason };
}

function liveJob(job: StationState['jobs'][number]): boolean {
  return job.state === 'pending' || job.state === 'assigned' || job.state === 'in_progress';
}

function storageFreeCapacity(state: StationState): number {
  const storageTiles = new Set<number>();
  for (let tile = 0; tile < state.rooms.length; tile += 1) {
    if (state.rooms[tile] === RoomType.LogisticsStock || state.rooms[tile] === RoomType.Storage) {
      storageTiles.add(tile);
    }
  }
  return state.itemNodes.reduce((total, node) => {
    if (!storageTiles.has(node.tileIndex)) return total;
    const used = Object.values(node.items).reduce((sum, amount) => sum + (amount ?? 0), 0);
    return total + Math.max(0, node.capacity - used);
  }, 0);
}

function berthAnchors(state: StationState): number[] {
  const anchors = new Set<number>();
  for (let tile = 0; tile < state.rooms.length; tile += 1) {
    if (state.rooms[tile] !== RoomType.Berth) continue;
    const facility = getBerthFacilityAt(state, tile);
    if (facility) anchors.add(facility.anchorTile);
  }
  return [...anchors].sort((left, right) => left - right);
}

/** Phases that partition one whole tick. `trafficJob*` are nested inside `trafficJobs`. */
const TOP_LEVEL_PHASES = [
  'setup',
  'trafficJobs',
  'roomsResources',
  'crew',
  'residentsSecurity',
  'visitors',
  'worldPost',
  'derived'
] as const;

function measureCacheGuarantees(state: StationState, actorCount: number, pathCallsP95: number) {
  ensureRoomClustersCache(state);
  const clusterMapRef = state.derived.roomClustersByRoom;
  const structureVersion = state.derived.cacheVersions.roomClustersVersion;
  const repeatStart = performance.now();
  for (let attempt = 0; attempt < 2000; attempt += 1) ensureRoomClustersCache(state);
  const cachedHitMs = performance.now() - repeatStart;
  assert(state.derived.cacheVersions.roomClustersVersion === structureVersion, 'structure cache version drifted with an unchanged topology');
  assert(state.derived.roomClustersByRoom === clusterMapRef, 'structure cache was rebuilt with an unchanged topology');
  state.topologyVersion += 1;
  const rebuildStart = performance.now();
  ensureRoomClustersCache(state);
  const rebuildMs = performance.now() - rebuildStart;
  assert(state.derived.cacheVersions.roomClustersVersion !== structureVersion, 'structure cache ignored a topology version bump');

  const firstApproachStart = performance.now();
  const firstGroups = getApproachConflictGroups(state);
  const firstApproachMs = performance.now() - firstApproachStart;
  const secondApproachStart = performance.now();
  const secondGroups = getApproachConflictGroups(state);
  const secondApproachMs = performance.now() - secondApproachStart;
  assert(JSON.stringify(firstGroups) === JSON.stringify(secondGroups), 'approach conflict groups are not deterministic across calls');

  const targetFingerprint = (): string[] =>
    state.exteriorIntegrityTargets
      .map((target) => `${target.id}:${target.wear.toFixed(4)}:${target.state}`)
      .sort();
  const targetsBefore = targetFingerprint();
  reconcileExteriorIntegrityTargets(state);
  const targetsAfter = targetFingerprint();
  assert(targetsBefore.length > 0, 'no exterior maintenance targets are maintained on the state');
  assert(targetsBefore.join('|') === targetsAfter.join('|'), 'exterior maintenance target list did not survive reconciliation');

  // Batched movement arbitration: at baseline scale the outcome of one whole
  // pass must not depend on the order actors are visited in.
  type MovementSnapshotActor = {
    x: number;
    y: number;
    tileIndex: number;
    path: number[];
    blockedTicks: number;
    movementWaitReason?: string;
    movementReplanCooldownUntil?: number;
    movementBlockedTile?: number | null;
    retargetAt?: number;
  };
  const movementActorList = [...state.crewMembers, ...state.residents, ...state.visitors] as MovementSnapshotActor[];
  const snapshot = movementActorList.map((actor) => ({ actor, ...actor, path: [...actor.path] }));
  const conflictSeconds = state.portOps.telemetry.publicCargoConflictSeconds;
  const restoreMovement = (): void => {
    for (const entry of snapshot) {
      Object.assign(entry.actor, {
        x: entry.x,
        y: entry.y,
        tileIndex: entry.tileIndex,
        blockedTicks: entry.blockedTicks,
        movementWaitReason: entry.movementWaitReason,
        movementReplanCooldownUntil: entry.movementReplanCooldownUntil,
        movementBlockedTile: entry.movementBlockedTile
      });
      if (entry.retargetAt !== undefined && 'retargetAt' in entry.actor) entry.actor.retargetAt = entry.retargetAt;
      entry.actor.path = [...entry.path];
    }
    state.portOps.telemetry.publicCargoConflictSeconds = conflictSeconds;
  };
  const forward = runMovementCoordinatorTestTick(state, 1 / 15, false, true);
  restoreMovement();
  const reversed = runMovementCoordinatorTestTick(state, 1 / 15, true, true);
  restoreMovement();
  const fingerprint = (results: Map<string, string>): string =>
    [...results.entries()].map(([key, value]) => `${key}=${value}`).sort().join(',');
  assert(forward.size === reversed.size, 'movement arbitration visited a different actor set in reverse order');
  assert(fingerprint(forward) === fingerprint(reversed), 'movement arbitration outcome depends on actor iteration order');
  const arbitratedActors = forward.size;
  const nonIdleActors = [...forward.values()].filter((result) => result !== 'idle').length;

  // Structural support graph: measure whether a second identical derivation is free.
  const structuralFirstStart = performance.now();
  const structuralFirst = buildStructuralSupportGraph(state);
  const structuralFirstMs = performance.now() - structuralFirstStart;
  const structuralSecondStart = performance.now();
  const structuralSecond = buildStructuralSupportGraph(state);
  const structuralSecondMs = performance.now() - structuralSecondStart;

  assert(actorCount > 0, 'actor count must be positive');
  assert(
    pathCallsP95 < actorCount,
    `p95 path calls ${pathCallsP95} reaches one full A* per actor (${actorCount})`
  );

  return {
    structureCache: {
      versionKey: structureVersion,
      cachedHitsMeasured: 2000,
      cachedHitTotalMs: Number(cachedHitMs.toFixed(3)),
      cachedHitAvgUs: Number(((cachedHitMs / 2000) * 1000).toFixed(4)),
      rebuildAfterTopologyBumpMs: Number(rebuildMs.toFixed(3)),
      speedupVsRebuild: Number((rebuildMs / Math.max(1e-6, cachedHitMs / 2000)).toFixed(1))
    },
    approachGroupCache: {
      cached: firstGroups === secondGroups,
      groups: firstGroups.length,
      dockingSlots: state.docks.length + berthAnchors(state).length,
      firstCallMs: Number(firstApproachMs.toFixed(4)),
      secondCallMs: Number(secondApproachMs.toFixed(4)),
      deterministic: true
    },
    exteriorMaintenanceTargets: {
      maintainedList: true,
      count: targetsBefore.length,
      stableThroughReconcile: true
    },
    pathfindingPerActor: {
      actorCount,
      pathCallsP95,
      callsPerActorP95: Number((pathCallsP95 / actorCount).toFixed(4))
    },
    batchedMovementArbitration: {
      arbitratedActors,
      nonIdleActors,
      orderIndependent: true
    },
    structuralSupportGraph: {
      cached: structuralFirst === structuralSecond,
      nodes: structuralFirst.nodes.length,
      firstCallMs: Number(structuralFirstMs.toFixed(3)),
      secondCallMs: Number(structuralSecondMs.toFixed(3))
    }
  };
}

function assertUtilityUnderlayIdentity(): void {
  const state = createInitialState({ seed: 915_501, physicalStarterInventory: true });
  const initial = ensureUtilityUnderlay(state);
  const initialVersion = initial.version;
  const layerReferences = Object.fromEntries(
    UTILITY_UNDERLAY_KINDS.map((kind) => [kind, initial.layers[kind]])
  ) as Record<(typeof UTILITY_UNDERLAY_KINDS)[number], Uint8Array>;
  initial.layers['power-conduit'][3] = 1;

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const repeated = ensureUtilityUnderlay(state);
    assert(repeated === initial, 'correctly sized underlay object was replaced');
    for (const kind of UTILITY_UNDERLAY_KINDS) {
      assert(repeated.layers[kind] === layerReferences[kind], `${kind} layer was cloned during a read`);
    }
  }

  state.width += 1;
  const resized = ensureUtilityUnderlay(state);
  assert(resized !== initial, 'map resize did not deliberately rebuild the underlay');
  assert(resized.version === initialVersion + 1, 'map resize did not increment underlay version exactly once');
  assert(resized.layers['power-conduit'][3] === 1, 'map resize did not preserve existing utility data');
  for (const kind of UTILITY_UNDERLAY_KINDS) {
    assert(resized.layers[kind].length === state.width * state.height, `${kind} layer has the wrong resized length`);
  }
  assert(ensureUtilityUnderlay(state) === resized, 'underlay rebuilt again after the resize was already reconciled');
}

/**
 * The Phase 9 operational floor, measured on ONE authored 50-crew /
 * 50-visitor station.
 *
 * Called once per geometry. Everything asserted below is a claim about the
 * station operating, not about a particular floor plan, so the compact block
 * and the linear spine are held to exactly the same bar.
 */
function runGeometry(label: string, scenarioName: string, deep: boolean) {
  const state = createInitialState({
    seed: 915_502,
    physicalStarterInventory: true,
    manualTrafficAdmission: false
  });
  assert(applyColdStartScenario(state, scenarioName), `${scenarioName} scenario is not registered`);
  assert(state.crewMembers.length === 50, `${label}: expected 50 crew, got ${state.crewMembers.length}`);
  assert(state.visitors.length === 50, `${label}: expected 50 initial visitors, got ${state.visitors.length}`);
  assert(state.docks.length === 8, `${label}: expected eight Pod Docks, got ${state.docks.length}`);
  assert(berthAnchors(state).length === 2, `${label}: expected two Berths, got ${berthAnchors(state).length}`);
  for (const dock of state.docks) {
    const placement = validateDockPlacement(state, dock.anchorTile);
    assert(placement.valid, `${label}: Dock ${dock.id} lacks a legal station-side access path: ${placement.reason}`);
  }
  const initialFreeCapacity = storageFreeCapacity(state);
  const initialStorageNodes = state.itemNodes
    .filter((node) => state.rooms[node.tileIndex] === RoomType.LogisticsStock || state.rooms[node.tileIndex] === RoomType.Storage)
    .map((node) => ({
      tile: node.tileIndex,
      capacity: node.capacity,
      used: Number(Object.values(node.items).reduce((sum, amount) => sum + (amount ?? 0), 0).toFixed(1))
    }));
  const initialPowerReserve = state.metrics.powerSupply - state.metrics.powerDemand;
  assert(initialFreeCapacity >= 30, `${label}: expected at least 30 units of physical cargo capacity, got ${initialFreeCapacity.toFixed(1)}`);
  assert(
    state.metrics.powerSupply >= state.metrics.powerDemand * 1.1,
    `${label}: expected at least 10% power reserve, got ${state.metrics.powerSupply.toFixed(1)} supply / ${state.metrics.powerDemand.toFixed(1)} demand`
  );
  assert(
    state.metrics.leakingTiles === 0,
    `${label}: authored station starts with ${state.metrics.leakingTiles} leaking tiles`
  );

  const mixedShip = state.arrivingShips.find((ship) => ship.portManifest?.callsign.startsWith('MIX-'));
  assert(mixedShip, `${label}: guaranteed mixed medium call was not admitted`);
  const mixedShipId = mixedShip.id;
  const initialMeals = state.serviceLog.visitorLifetimeByService.meal;
  const initialCargoHandled = state.portOps.cargoHandledLifetime;
  const initialMealPlanIds = new Set(
    state.visitors
      .filter((visitor) => visitor.activeService === 'meal' && visitor.servicePlan.includes('meal'))
      .map((visitor) => visitor.id)
  );
  const mealPlanEvidence = new Map<number, {
    originShipId: number | null;
    spawnedAt: number;
    firstAttemptAt: number | null;
    servedAt: number | null;
    bailedAt: number | null;
  }>();
  const queueBySecond: number[] = [];
  const settledQueueBySecond: number[] = [];
  const mealsBySecond: number[] = [];
  const balksBySecond: number[] = [];
  const tickMs: number[] = [];
  const pathCallsPerTick: number[] = [];
  const phaseSamples = new Map<string, number[]>();
  const phasePathCallSamples = new Map<string, number[]>();
  const inventoryPairScans: number[] = [];
  const phaseCoverage: number[] = [];
  const unprofiledPhaseTicks = new Set<string>();
  const slowTicks: Array<{ now: number; tickMs: number; pathCalls: number; inventoryPairs: number; phases: Record<string, number> }> = [];
  let sawInspection = false;
  let sawUnloading = false;
  let sawInboundCargoJob = false;
  let sawPodAndBerthOverlap = false;
  let peakQueue = 0;
  let peakVisitors = state.visitors.length;
  let peakConcurrentShips = state.arrivingShips.length;
  let peakConcurrentSmallShips = state.arrivingShips.filter((ship) => ship.size === 'small').length;
  let peakConcurrentBerthShips = state.arrivingShips.filter((ship) => ship.size !== 'small').length;
  let minimumPowerReserve = initialPowerReserve;
  let minimumPowerSnapshot = {
    now: state.now,
    supply: state.metrics.powerSupply,
    demand: state.metrics.powerDemand,
    reactorsActive: state.ops.reactorsActive,
    reactorDebt: 0,
    fires: 0
  };
  // Count the same built walkable surface the player-facing leak metric owns.
  // Open Berths are intentional vacuum rooms; everything else must stay
  // sealed throughout this operational window.
  const ventedInterior = (): number => {
    let count = 0;
    for (let tile = 0; tile < state.tiles.length; tile += 1) {
      if (!isWalkable(state.tiles[tile])) continue;
      if (state.rooms[tile] === RoomType.Berth) continue;
      if (state.tiles[tile] === TileType.Dock) continue;
      if (!state.pressurized[tile]) count += 1;
    }
    return count;
  };
  let firstVentAt: number | null = null;
  let peakVentedTiles = ventedInterior();
  const deathsAtStart = state.metrics.deathsTotal;
  assert(peakVentedTiles === 0, `${label}: authored station starts with ${peakVentedTiles} vented interior tiles`);

  state.controls.paused = false;
  for (let step = 0; step < DURATION_SECONDS / STEP; step += 1) {
    tick(state, STEP);
    for (const visitor of state.visitors) {
      if (!visitor.servicePlan.includes('meal')) continue;
      const evidence = mealPlanEvidence.get(visitor.id) ?? {
        originShipId: visitor.originShipId,
        spawnedAt: visitor.spawnedAt,
        firstAttemptAt: null,
        servedAt: null,
        bailedAt: null
      };
      const attempting =
        visitor.state === VisitorState.ToCafeteria ||
        visitor.state === VisitorState.Queueing ||
        visitor.state === VisitorState.Eating ||
        visitor.carryingMeal;
      if (attempting && evidence.firstAttemptAt === null) evidence.firstAttemptAt = state.now;
      if (visitor.servedMeal && evidence.servedAt === null) evidence.servedAt = state.now;
      if (visitor.state === VisitorState.ToDock && !visitor.servedMeal && evidence.bailedAt === null) {
        evidence.bailedAt = state.now;
      }
      mealPlanEvidence.set(visitor.id, evidence);
    }
    tickMs.push(state.metrics.tickMs);
    pathCallsPerTick.push(state.metrics.pathCallsPerTick);
    inventoryPairScans.push(state.metrics.inventoryPairScans);
    for (const [phase, milliseconds] of Object.entries(state.metrics.simPhaseMs ?? {})) {
      const samples = phaseSamples.get(phase) ?? [];
      samples.push(milliseconds);
      phaseSamples.set(phase, samples);
    }
    const measuredPhases = state.metrics.simPhaseMs ?? {};
    let topLevelPhaseMs = 0;
    for (const phase of TOP_LEVEL_PHASES) {
      if (measuredPhases[phase] === undefined) unprofiledPhaseTicks.add(phase);
      topLevelPhaseMs += measuredPhases[phase] ?? 0;
    }
    if (state.metrics.tickMs > 0.5) phaseCoverage.push(topLevelPhaseMs / state.metrics.tickMs);
    for (const [phase, calls] of Object.entries(state.metrics.simPhasePathCalls ?? {})) {
      const samples = phasePathCallSamples.get(phase) ?? [];
      samples.push(calls);
      phasePathCallSamples.set(phase, samples);
    }
    if (state.metrics.tickMs >= 25) {
      slowTicks.push({
        now: Number(state.now.toFixed(3)),
        tickMs: Number(state.metrics.tickMs.toFixed(3)),
        pathCalls: state.metrics.pathCallsPerTick,
        inventoryPairs: state.metrics.inventoryPairScans,
        phases: Object.fromEntries(
          Object.entries(state.metrics.simPhaseMs ?? {}).map(([phase, milliseconds]) => [phase, Number(milliseconds.toFixed(3))])
        )
      });
      slowTicks.sort((left, right) => right.tickMs - left.tickMs);
      if (slowTicks.length > 12) slowTicks.length = 12;
    }
    const currentMixed = state.arrivingShips.find((ship) => ship.id === mixedShipId);
    sawInspection ||= currentMixed?.portTurnaround?.phase === 'inspection';
    sawUnloading ||= currentMixed?.portTurnaround?.phase === 'unloading';
    sawInboundCargoJob ||= state.jobs.some(
      (job) => job.portShipId === mixedShipId && job.portCargoDirection === 'inbound' && liveJob(job)
    );
    sawPodAndBerthOverlap ||= state.arrivingShips.some((ship) => ship.id === mixedShipId) &&
      state.arrivingShips.some((ship) => ship.id !== mixedShipId && ship.size === 'small');
    peakQueue = Math.max(peakQueue, state.metrics.cafeteriaQueueingCount);
    peakVisitors = Math.max(peakVisitors, state.visitors.length);
    peakConcurrentShips = Math.max(peakConcurrentShips, state.arrivingShips.length);
    peakConcurrentSmallShips = Math.max(
      peakConcurrentSmallShips,
      state.arrivingShips.filter((ship) => ship.size === 'small').length
    );
    peakConcurrentBerthShips = Math.max(
      peakConcurrentBerthShips,
      state.arrivingShips.filter((ship) => ship.size !== 'small').length
    );
    const powerReserve = state.metrics.powerSupply - state.metrics.powerDemand;
    if (powerReserve < minimumPowerReserve) {
      minimumPowerReserve = powerReserve;
      minimumPowerSnapshot = {
        now: state.now,
        supply: state.metrics.powerSupply,
        demand: state.metrics.powerDemand,
        reactorsActive: state.ops.reactorsActive,
        reactorDebt: Math.max(
          0,
          ...state.maintenanceDebts
            .filter((debt) => debt.system === 'reactor')
            .map((debt) => debt.debt)
        ),
        fires: state.effects.fires.length
      };
    }
    if ((step + 1) % 15 === 0) {
      const vented = ventedInterior();
      if (vented > 0 && firstVentAt === null) firstVentAt = state.now;
      peakVentedTiles = Math.max(peakVentedTiles, vented);
    }
    if ((step + 1) % 15 === 0) {
      queueBySecond.push(state.metrics.cafeteriaQueueingCount);
      settledQueueBySecond.push(
        state.visitors.filter((visitor) => {
          if (visitor.state !== VisitorState.Queueing || visitor.activeService !== 'meal') return false;
          const waitingSince = visitor.queueJoinedAt ?? visitor.serviceBlockedSince;
          return waitingSince !== null && waitingSince !== undefined && state.now - waitingSince >= QUEUE_SETTLING_SECONDS;
        }).length
      );
      mealsBySecond.push(state.serviceLog.visitorLifetimeByService.meal - initialMeals);
      balksBySecond.push(state.commitment.queueBalks ?? 0);
    }
  }

  const mealsServed = state.serviceLog.visitorLifetimeByService.meal - initialMeals;
  const cargoHandled = state.portOps.cargoHandledLifetime - initialCargoHandled;
  const mixedLots = state.portOps.cargoLots.filter((lot) => lot.contractId === mixedShip.portContractId);
  const inboundHandled = mixedLots.reduce((sum, lot) => sum + lot.handledQuantity, 0);
  const lateWindow = queueBySecond.slice(-30);
  const precedingWindow = queueBySecond.slice(-60, -30);
  const finalQueue = queueBySecond[queueBySecond.length - 1] ?? state.metrics.cafeteriaQueueingCount;
  const lateAverage = average(lateWindow);
  const precedingAverage = average(precedingWindow);
  const queueDrain = evaluateQueueDrain(settledQueueBySecond, mealsBySecond, balksBySecond, 30);
  const initialMealPlan = [...initialMealPlanIds].map((id) => mealPlanEvidence.get(id)).filter((entry) => entry !== undefined);
  const contractedMealPlan = [...mealPlanEvidence.values()].filter((entry) => entry.originShipId === mixedShipId);
  const initialBailAfterAttempt = initialMealPlan
    .filter((entry) => entry.firstAttemptAt !== null && entry.bailedAt !== null)
    .map((entry) => entry.bailedAt! - entry.firstAttemptAt!);
  const oldestLiveMealQueueWait = state.visitors.reduce((oldest, visitor) => {
    if (visitor.state !== VisitorState.Queueing || visitor.activeService !== 'meal') return oldest;
    const waitingSince = visitor.queueJoinedAt ?? visitor.serviceBlockedSince;
    if (waitingSince === null || waitingSince === undefined) return oldest;
    return Math.max(oldest, state.now - waitingSince);
  }, 0);
  const p50 = percentile(tickMs, 0.5);
  const p95 = percentile(tickMs, 0.95);
  const p99 = percentile(tickMs, 0.99);
  const pathCallsP95 = percentile(pathCallsPerTick, 0.95);
  const actorCount = state.crewMembers.length + state.visitors.length;
  const cacheGuarantees = deep ? measureCacheGuarantees(state, actorCount, pathCallsP95) : null;
  const coverageP50 = percentile(phaseCoverage, 0.5);
  const coverageP05 = percentile(phaseCoverage, 0.05);
  const finalVentedInteriorTiles = ventedInterior();
  const reportedLeakingTiles = state.metrics.leakingTiles;
  const deathsDuringWindow = state.metrics.deathsTotal - deathsAtStart;
  const crewRemaining = state.crewMembers.length;
  const debrisImpactedPanels = state.exteriorIntegrityTargets.filter((target) => target.lastImpactAt !== undefined).length;
  const maxExteriorWear = Math.max(0, ...state.exteriorIntegrityTargets.map((target) => target.wear));
  const naturallyBreachedPanels = state.exteriorIntegrityTargets.filter((target) => target.state === 'breached').length;

  const report = {
    geometry: label,
    scenario: scenarioName,
    durationSeconds: DURATION_SECONDS,
    initial: {
      crew: 50,
      visitors: 50,
      podDocks: state.docks.length,
      berths: berthAnchors(state).length,
      storageFreeCapacity: Number(initialFreeCapacity.toFixed(1)),
      storageNodes: initialStorageNodes,
      powerReserve: Number(initialPowerReserve.toFixed(1))
    },
    operation: {
      inspectionCompleted: sawInspection && sawUnloading,
      inboundCargoJobCreated: sawInboundCargoJob,
      cargoHandled: Number(cargoHandled.toFixed(1)),
      inboundLotHandled: Number(inboundHandled.toFixed(1)),
      cargoJobs: state.jobs
        .filter((job) => job.portShipId === mixedShipId && job.portCargoDirection === 'inbound')
        .map((job) => ({
          id: job.id,
          itemType: job.itemType,
          state: job.state,
          assignedCrewId: job.assignedCrewId,
          pickedUpAmount: job.pickedUpAmount,
          amount: job.amount,
          stallReason: job.stallReason,
          blockedReason: job.blockedReason,
          fromTile: job.fromTile,
          toTile: job.toTile
        })),
      podAndBerthOverlap: sawPodAndBerthOverlap,
      peakVisitors,
      peakConcurrentShips,
      peakConcurrentSmallShips,
      peakConcurrentBerthShips,
      mealsServed,
      mealPlanCohorts: {
        initial: {
          planned: initialMealPlan.length,
          attempted: initialMealPlan.filter((entry) => entry.firstAttemptAt !== null).length,
          served: initialMealPlan.filter((entry) => entry.servedAt !== null).length,
          bailed: initialMealPlan.filter((entry) => entry.bailedAt !== null).length,
          earliestBailAfterAttemptSec:
            initialBailAfterAttempt.length > 0 ? Math.min(...initialBailAfterAttempt) : null
        },
        contracted: {
          planned: contractedMealPlan.length,
          attempted: contractedMealPlan.filter((entry) => entry.firstAttemptAt !== null).length,
          served: contractedMealPlan.filter((entry) => entry.servedAt !== null).length,
          bailed: contractedMealPlan.filter((entry) => entry.bailedAt !== null).length
        }
      },
      peakQueue,
      finalQueue,
      peakSettledQueue: Math.max(0, ...settledQueueBySecond),
      oldestLiveMealQueueWaitSec: Number(oldestLiveMealQueueWait.toFixed(1)),
      precedingQueueAverage: Number(precedingAverage.toFixed(2)),
      lateQueueAverage: Number(lateAverage.toFixed(2)),
      queueDrain,
      minimumPowerReserve: Number(minimumPowerReserve.toFixed(1)),
      minimumPowerSnapshot: {
        now: Number(minimumPowerSnapshot.now.toFixed(1)),
        supply: Number(minimumPowerSnapshot.supply.toFixed(1)),
        demand: Number(minimumPowerSnapshot.demand.toFixed(1)),
        reactorsActive: minimumPowerSnapshot.reactorsActive,
        reactorDebt: Number(minimumPowerSnapshot.reactorDebt.toFixed(1)),
        fires: minimumPowerSnapshot.fires
      },
      queueEvery10Seconds: queueBySecond.filter((_, index) => (index + 1) % 10 === 0)
    },
    hullIntegrity: {
      firstVentAtSeconds: firstVentAt === null ? null : Number(firstVentAt.toFixed(1)),
      peakVentedInteriorTiles: peakVentedTiles,
      finalVentedInteriorTiles,
      reportedLeakingTiles,
      deathsDuringWindow,
      crewRemaining,
      debrisImpactedPanels,
      maxExteriorWear: Number(maxExteriorWear.toFixed(2)),
      naturallyBreachedPanels,
      airlockTiles: state.tiles.reduce((total, tile) => total + (tile === TileType.Airlock ? 1 : 0), 0)
    },
    performanceMs: {
      p50: Number(p50.toFixed(3)),
      p95: Number(p95.toFixed(3)),
      p99: Number(p99.toFixed(3)),
      max: Number(Math.max(...tickMs).toFixed(3)),
      pathCallsP50: Number(percentile(pathCallsPerTick, 0.5).toFixed(1)),
      pathCallsP95: Number(pathCallsP95.toFixed(1)),
      inventoryPairScansP95: Number(percentile(inventoryPairScans, 0.95).toFixed(1)),
      phases: Object.fromEntries(
        [...phaseSamples.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([phase, samples]) => [phase, {
            p50: Number(percentile(samples, 0.5).toFixed(3)),
            p95: Number(percentile(samples, 0.95).toFixed(3)),
            max: Number(Math.max(...samples).toFixed(3))
          }])
      ),
      phasePathCalls: Object.fromEntries(
        [...phasePathCallSamples.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([phase, samples]) => [phase, {
            p50: Number(percentile(samples, 0.5).toFixed(1)),
            p95: Number(percentile(samples, 0.95).toFixed(1)),
            max: Math.max(...samples)
          }])
      ),
      phaseCoverage: {
        topLevelPhases: [...TOP_LEVEL_PHASES],
        unprofiledPhases: [...unprofiledPhaseTicks],
        ticksSampled: phaseCoverage.length,
        coveredFractionP50: Number(coverageP50.toFixed(4)),
        coveredFractionP05: Number(coverageP05.toFixed(4))
      },
      slowestTicks: slowTicks
    },
    cacheGuarantees
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

  assert(sawInspection, `${label}: mixed call never entered physical inspection`);
  assert(sawUnloading, `${label}: mixed call never completed inspection and entered unloading`);
  assert(sawInboundCargoJob, `${label}: released mixed cargo never created an inbound haul job`);
  assert(
    cargoHandled >= 10 && inboundHandled >= 10,
    `${label}: mixed cargo did not complete its 10-unit physical unload (${cargoHandled}/${inboundHandled})`
  );
  assert(sawPodAndBerthOverlap, `${label}: Pod and Berth traffic never overlapped`);
  assert(mealsServed > 0, `${label}: cafeteria served no meals`);
  assert(
    initialMealPlan.length === 17 && initialMealPlan.every((entry) => entry.firstAttemptAt !== null),
    `${label}: initial planned-meal cohort did not all make a real service attempt`
  );
  assert(
    initialMealPlan.filter((entry) => entry.servedAt !== null).length >= 9,
    `${label}: fewer than half of the initial planned-meal cohort were physically fed`
  );
  assert(
    contractedMealPlan.length === 5 && contractedMealPlan.every((entry) => entry.firstAttemptAt !== null),
    `${label}: guaranteed mixed-call meal cohort did not all attempt the promised service`
  );
  assert(
    contractedMealPlan.some((entry) => entry.servedAt !== null),
    `${label}: guaranteed mixed-call meal cohort completed no physical meal service`
  );
  assert(
    initialMealPlan.every(
      (entry) => entry.bailedAt === null || entry.firstAttemptAt === null || entry.bailedAt - entry.firstAttemptAt >= QUEUE_SETTLING_SECONDS
    ),
    `${label}: a planned-meal visitor bailed before receiving a reasonable line attempt`
  );
  assert(
    oldestLiveMealQueueWait <= 150 + STEP,
    `${label}: meal queue contains an indefinitely waiting visitor (${oldestLiveMealQueueWait.toFixed(1)}s)`
  );
  assert(minimumPowerReserve > 0, `${label}: station entered a power deficit (${minimumPowerReserve.toFixed(1)})`);
  assert(state.metrics.requiredCriticalStaff.cafeteria === 0, `${label}: self-service cafeteria still requires a physical staff post`);
  assert(p95 < 25, `${label}: tick p95 ${p95.toFixed(2)}ms exceeds the 25ms practical budget`);
  assert(unprofiledPhaseTicks.size === 0, `${label}: phases never profiled at baseline scale: ${[...unprofiledPhaseTicks].join(', ')}`);
  assert(coverageP50 >= 0.75, `${label}: profiled phases only account for ${(coverageP50 * 100).toFixed(1)}% of the median tick`);
  assert(firstVentAt === null && peakVentedTiles === 0 && finalVentedInteriorTiles === 0, `${label}: hull vented during normal operation`);
  assert(reportedLeakingTiles === finalVentedInteriorTiles, `${label}: leak telemetry disagrees with vented built interior`);
  assert(deathsDuringWindow === 0, `${label}: normal operation killed ${deathsDuringWindow} occupants`);
  assert(crewRemaining === 50, `${label}: expected all 50 crew to survive, got ${crewRemaining}`);
  assert(debrisImpactedPanels > 0 && maxExteriorWear >= 12, `${label}: debris hazards produced no meaningful exterior wear`);
  assert(naturallyBreachedPanels === 0, `${label}: normal operation breached ${naturallyBreachedPanels} exterior panels`);

  // Prove the metric is truthful in the failure case too. A zero/zero healthy
  // station comparison alone would not catch the old Airlock flood exemption,
  // which hid hundreds of vacuum-connected built tiles.
  const telemetryProbeTarget = state.exteriorIntegrityTargets.find((target) => target.panel === 'hull');
  assert(telemetryProbeTarget, `${label}: no exterior hull target available for leak telemetry probe`);
  assert(
    setExteriorIntegrityTargetState(state, telemetryProbeTarget.id, 'breached', 90),
    `${label}: could not create the leak telemetry probe`
  );
  tick(state, 0);
  const probeVentedInteriorTiles = ventedInterior();
  assert(probeVentedInteriorTiles > 0, `${label}: breached hull probe did not vent built interior`);
  assert(
    state.metrics.leakingTiles === probeVentedInteriorTiles,
    `${label}: breached hull reports ${state.metrics.leakingTiles} leaks for ${probeVentedInteriorTiles} vented built tiles`
  );
  assert(queueDrain.ok, `${label}: cafeteria queue did not drain (${queueDrain.reason}): ${queueBySecond.join(',')}`);

  return {
    label,
    scenario: scenarioName,
    footprintTiles: state.tiles.reduce(
      (total, tile) => total + (tile === TileType.Floor || tile === TileType.Door ? 1 : 0),
      0
    ),
    mealsServed,
    cargoHandled: Number(cargoHandled.toFixed(1)),
    peakQueue,
    finalQueue,
    minimumPowerReserve: Number(minimumPowerReserve.toFixed(1)),
    p50: Number(p50.toFixed(3)),
    p95: Number(p95.toFixed(3)),
    hull: report.hullIntegrity
  };
}

/**
 * Row: "Bad layouts create visible problems with more than one valid remedy."
 *
 * One bad mess hall, measured, then the SAME measurement taken against two
 * different interventions. The symptom is the only thing all three share: how
 * many of an identical 24-guest cohort get physically fed inside 180 seconds.
 *
 * Deliberately NOT a staffing comparison. A self-service cafeteria requires no
 * staff post, and the crew roster is asserted identical across all three, so
 * neither remedy can be "hire someone" wearing a costume.
 */
function measureMessHall(scenarioName: string) {
  const state = createInitialState({ seed: 771_003, physicalStarterInventory: true, manualTrafficAdmission: true });
  assert(applyColdStartScenario(state, scenarioName), `${scenarioName} scenario is not registered`);
  tick(state, 0);

  const messTiles = new Set<number>();
  for (let tile = 0; tile < state.rooms.length; tile += 1) {
    if (state.rooms[tile] === RoomType.Cafeteria) messTiles.add(tile);
  }
  const counters = state.moduleInstances.filter(
    (module) => module.type === ModuleType.ServingStation && messTiles.has(module.originTile)
  ).length;
  const doorways = [...messTiles].filter((tile) => state.tiles[tile] === TileType.Door).length;
  const tables = state.moduleInstances.filter(
    (module) => module.type === ModuleType.Table && messTiles.has(module.originTile)
  ).length;
  const cohort = state.visitors.filter((visitor) => visitor.id >= 98_200 && visitor.id < 98_224);
  assert(cohort.length === 24, `${scenarioName}: expected the authored 24-guest cohort, got ${cohort.length}`);
  assert(
    state.metrics.requiredCriticalStaff.cafeteria === 0,
    `${scenarioName}: this comparison is only valid while the cafeteria needs no staff post`
  );

  state.controls.paused = false;
  let peakQueue = 0;
  for (let elapsed = 0; elapsed < MESS_OBSERVED_SECONDS; elapsed += 0.2) {
    tick(state, 0.2);
    peakQueue = Math.max(peakQueue, state.metrics.cafeteriaQueueingCount);
  }
  const fed = state.visitors.filter(
    (visitor) => visitor.id >= 98_200 && visitor.id < 98_224 && visitor.completedServices.includes('meal')
  ).length;

  return {
    scenario: scenarioName,
    counters,
    doorways,
    tables,
    crew: state.crewMembers.length,
    requiredCafeteriaStaff: state.metrics.requiredCriticalStaff.cafeteria,
    guestsFed: fed,
    mealServiceEvents: state.serviceLog.visitorLifetimeByService.meal,
    stillWaiting: state.visitors.filter((visitor) => visitor.state === VisitorState.Queueing).length,
    peakQueue
  };
}

function compareMessRemedies(): void {
  const choked = measureMessHall('mess-line-choked');
  const extraCounter = measureMessHall('mess-line-extra-counter');
  const rerouted = measureMessHall('mess-line-rerouted');

  // The bad layout has to actually be bad, or the comparison proves nothing.
  assert(
    choked.guestsFed <= 8,
    `mess-line-choked was supposed to fail its cohort, but fed ${choked.guestsFed}/24`
  );
  assert(
    choked.peakQueue >= 18,
    `mess-line-choked was supposed to produce visible pressure, but only peaked at ${choked.peakQueue}`
  );

  for (const remedy of [extraCounter, rerouted]) {
    assert(
      remedy.guestsFed >= 10,
      `${remedy.scenario} did not clear the symptom: fed ${remedy.guestsFed}/24 in ${MESS_OBSERVED_SECONDS}s`
    );
    assert(
      remedy.guestsFed > choked.guestsFed,
      `${remedy.scenario} is not an improvement (${choked.guestsFed} -> ${remedy.guestsFed})`
    );
    assert(
      remedy.peakQueue < choked.peakQueue,
      `${remedy.scenario} produced as much peak pressure as the bad layout did`
    );
    // No staffing confound, in either direction.
    assert(
      remedy.crew === choked.crew && remedy.requiredCafeteriaStaff === 0,
      `${remedy.scenario} changed the staff situation (${choked.crew} -> ${remedy.crew} crew)`
    );
  }

  // And the two remedies have to be genuinely different world changes.
  assert(
    extraCounter.counters > choked.counters && extraCounter.doorways === choked.doorways,
    'the throughput remedy must add service positions and nothing else'
  );
  assert(
    rerouted.doorways > choked.doorways && rerouted.counters === choked.counters,
    'the circulation remedy must add doorways and no service position'
  );
  assert(
    extraCounter.tables === choked.tables && rerouted.tables === choked.tables,
    'seating must be held constant across the comparison'
  );

  process.stdout.write(`${JSON.stringify({
    badLayoutRemedies: {
      claim: 'one bad mess hall, two different interventions, the same symptom cleared',
      symptom: `guests physically fed out of an identical 24-guest cohort in ${MESS_OBSERVED_SECONDS}s`,
      bad: choked,
      remedies: [extraCounter, rerouted],
      note:
        'The two remedies are not variations of each other. `mess-line-extra-counter` buys throughput: '
        + 'two more counters on the same single doorway. `mess-line-rerouted` buys circulation: the same '
        + 'two counters and no new fixture at all, with a doorway cut under each of them. Crew count and '
        + 'required cafeteria staff are identical in all three, so neither remedy is a staffing change.'
    }
  }, null, 2)}\n`);
}

function main(): void {
  assertUtilityUnderlayIdentity();

  // Row: "Multiple station geometries remain viable."
  //
  // The two fixtures below carry the SAME population, the SAME interface
  // count and the SAME guaranteed mixed call on deliberately different
  // footprints. `normal-scale-50` is a solid block where every room touches
  // its neighbours; `normal-scale-50-spine` is one long corridor with
  // vacuum-separated pods branching off it, so every inter-room trip goes
  // through the spine. Both are put through `runGeometry`, which is the only
  // place the operational floor is defined.
  compareMessRemedies();

  const block = runGeometry('compact-block', 'normal-scale-50', true);
  const spine = runGeometry('linear-spine', 'normal-scale-50-spine', false);

  assert(
    block.footprintTiles !== spine.footprintTiles,
    'the two geometries must not be the same station under two names'
  );
  process.stdout.write(`${JSON.stringify({
    geometryComparison: {
      claim: 'both authored 50-crew / 50-visitor stations clear the same operational floor',
      floor: [
        '50 crew and 50 visitors present at load',
        '8 legally accessible Pod Docks and 2 derived medium Berths',
        'no leaking hull tile at load',
        'at least 30 units of free physical cargo capacity',
        'at least a 10% power reserve at load and no power deficit for 240s',
        'guaranteed mixed medium call reaches inspection, then unloading',
        'that call creates an inbound haul job and physically lands >= 10 units',
        'Pod and Berth traffic overlap',
        'cafeteria serves meals with zero required staff posts',
        'cafeteria queue stays bounded and drains',
        'station remains sealed with all 50 crew alive for 240s',
        'leak telemetry exactly matches vented built interior in healthy and breached-hull probes',
        'tick p95 < 25ms with every top-level phase profiled'
      ],
      geometries: [block, spine]
    }
  }, null, 2)}\n`);
}

main();
