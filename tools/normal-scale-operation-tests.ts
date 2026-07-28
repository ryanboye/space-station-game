import {
  createInitialState,
  getBerthFacilityAt,
  tick,
  validateDockPlacement
} from '../src/sim/index';
import { applyColdStartScenario } from '../src/sim/cold-start-scenarios';
import {
  ensureUtilityUnderlay,
  UTILITY_UNDERLAY_KINDS
} from '../src/sim/utility-underlay';
import { RoomType, type StationState } from '../src/sim/types';

const STEP = 1 / 15;
const DURATION_SECONDS = 240;

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

function main(): void {
  assertUtilityUnderlayIdentity();

  const state = createInitialState({
    seed: 915_502,
    physicalStarterInventory: true,
    manualTrafficAdmission: false
  });
  assert(applyColdStartScenario(state, 'normal-scale-50'), 'normal-scale-50 scenario is not registered');
  assert(state.crewMembers.length === 50, `expected 50 crew, got ${state.crewMembers.length}`);
  assert(state.visitors.length === 50, `expected 50 initial visitors, got ${state.visitors.length}`);
  assert(state.docks.length === 8, `expected eight Pod Docks, got ${state.docks.length}`);
  assert(berthAnchors(state).length === 2, `expected two Berths, got ${berthAnchors(state).length}`);
  for (const dock of state.docks) {
    const placement = validateDockPlacement(state, dock.anchorTile);
    assert(placement.valid, `Dock ${dock.id} lacks a legal station-side access path: ${placement.reason}`);
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
  assert(initialFreeCapacity >= 30, `expected at least 30 units of physical cargo capacity, got ${initialFreeCapacity.toFixed(1)}`);
  assert(
    state.metrics.powerSupply >= state.metrics.powerDemand * 1.1,
    `expected at least 10% power reserve, got ${state.metrics.powerSupply.toFixed(1)} supply / ${state.metrics.powerDemand.toFixed(1)} demand`
  );

  const mixedShip = state.arrivingShips.find((ship) => ship.portManifest?.callsign.startsWith('MIX-'));
  assert(mixedShip, 'guaranteed mixed medium call was not admitted');
  const mixedShipId = mixedShip.id;
  const initialMeals = state.serviceLog.visitorLifetimeByService.meal;
  const initialCargoHandled = state.portOps.cargoHandledLifetime;
  const queueBySecond: number[] = [];
  const tickMs: number[] = [];
  const pathCallsPerTick: number[] = [];
  const phaseSamples = new Map<string, number[]>();
  const phasePathCallSamples = new Map<string, number[]>();
  const inventoryPairScans: number[] = [];
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

  state.controls.paused = false;
  for (let step = 0; step < DURATION_SECONDS / STEP; step += 1) {
    tick(state, STEP);
    tickMs.push(state.metrics.tickMs);
    pathCallsPerTick.push(state.metrics.pathCallsPerTick);
    inventoryPairScans.push(state.metrics.inventoryPairScans);
    for (const [phase, milliseconds] of Object.entries(state.metrics.simPhaseMs ?? {})) {
      const samples = phaseSamples.get(phase) ?? [];
      samples.push(milliseconds);
      phaseSamples.set(phase, samples);
    }
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
    if ((step + 1) % 15 === 0) queueBySecond.push(state.metrics.cafeteriaQueueingCount);
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
  const queueBoundedOrRecovering = peakQueue <= 30 &&
    finalQueue <= peakQueue &&
    lateAverage <= precedingAverage + 2;
  const p50 = percentile(tickMs, 0.5);
  const p95 = percentile(tickMs, 0.95);
  const p99 = percentile(tickMs, 0.99);

  process.stdout.write(`${JSON.stringify({
    scenario: 'normal-scale-50',
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
      peakQueue,
      finalQueue,
      precedingQueueAverage: Number(precedingAverage.toFixed(2)),
      lateQueueAverage: Number(lateAverage.toFixed(2)),
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
    performanceMs: {
      p50: Number(p50.toFixed(3)),
      p95: Number(p95.toFixed(3)),
      p99: Number(p99.toFixed(3)),
      max: Number(Math.max(...tickMs).toFixed(3)),
      pathCallsP50: Number(percentile(pathCallsPerTick, 0.5).toFixed(1)),
      pathCallsP95: Number(percentile(pathCallsPerTick, 0.95).toFixed(1)),
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
      slowestTicks: slowTicks
    },
    utilityUnderlayIdentityRegression: 'passed'
  }, null, 2)}\n`);

  assert(sawInspection, 'mixed call never entered physical inspection');
  assert(sawUnloading, 'mixed call never completed inspection and entered unloading');
  assert(sawInboundCargoJob, 'released mixed cargo never created an inbound haul job');
  assert(
    cargoHandled >= 10 && inboundHandled >= 10,
    `mixed cargo did not complete its 10-unit physical unload (${cargoHandled}/${inboundHandled})`
  );
  assert(sawPodAndBerthOverlap, 'Pod and Berth traffic never overlapped');
  assert(mealsServed > 0, 'cafeteria served no meals');
  assert(minimumPowerReserve > 0, `station entered a power deficit (${minimumPowerReserve.toFixed(1)})`);
  assert(queueBoundedOrRecovering, `cafeteria queue did not stabilize: ${queueBySecond.join(',')}`);
  assert(state.metrics.requiredCriticalStaff.cafeteria === 0, 'self-service cafeteria still requires a physical staff post');
  assert(p95 < 25, `tick p95 ${p95.toFixed(2)}ms exceeds the 25ms practical budget`);
}

main();
