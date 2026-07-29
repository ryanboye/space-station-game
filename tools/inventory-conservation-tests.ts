import { applyColdStartScenario, stageFacilityVisitors } from '../src/sim/cold-start-scenarios';
import {
  createInitialState,
  requeueInterruptedTransportJob,
  runStalledJobRequeueTestTick,
  tick
} from '../src/sim/sim';
import { ModuleType, VisitorState, type StationState } from '../src/sim/types';

const EPSILON = 1e-6;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function scenario(name: string): StationState {
  const state = createInitialState({ seed: 4242, physicalStarterInventory: true, manualTrafficAdmission: true });
  assert(applyColdStartScenario(state, name), `Unknown scenario ${name}.`);
  tick(state, 0);
  return state;
}

/**
 * Trade-good custody equation:
 *
 * located item-node stock + actor-carried stock + detached in-progress stock
 * + completed sales = opening stock.
 *
 * Assigned/pending job amounts are reservations over located stock and are
 * deliberately not added. An in-progress job carried by its assigned actor is
 * likewise counted once on the actor, never a second time on the job.
 */
function tradeGoodCustody(state: StationState): {
  nodes: number;
  carried: number;
  detachedInProgress: number;
  sold: number;
  total: number;
} {
  const nodes = state.itemNodes.reduce(
    (total, node) => total + Math.max(0, node.items.tradeGood ?? 0),
    0
  );
  const carried = state.crewMembers.reduce(
    (total, crew) => total + (crew.carryingItemType === 'tradeGood' ? Math.max(0, crew.carryingAmount) : 0),
    0
  );
  let detachedInProgress = 0;
  for (const job of state.jobs) {
    if (job.itemType !== 'tradeGood' || job.state !== 'in_progress' || job.pickedUpAmount <= EPSILON) continue;
    const carrier = job.assignedCrewId === null
      ? null
      : state.crewMembers.find((crew) => crew.id === job.assignedCrewId) ?? null;
    const actorOwnsStack =
      carrier !== null &&
      carrier.activeJobId === job.id &&
      carrier.carryingItemType === job.itemType &&
      carrier.carryingAmount > EPSILON;
    if (actorOwnsStack) {
      assert(
        Math.abs(carrier.carryingAmount - job.pickedUpAmount) < EPSILON,
        `Job ${job.id} and carrier ${carrier.id} disagree on custody (${job.pickedUpAmount} vs ${carrier.carryingAmount}).`
      );
    } else {
      detachedInProgress += job.pickedUpAmount;
    }
  }
  const sold = state.usageTotals.tradeGoodsSold;
  return { nodes, carried, detachedInProgress, sold, total: nodes + carried + detachedInProgress + sold };
}

function assertConserved(state: StationState, opening: number, context: string): void {
  const custody = tradeGoodCustody(state);
  assert(
    Math.abs(custody.total - opening) < EPSILON,
    `${context}: tradeGood custody ${custody.total.toFixed(6)} != opening ${opening.toFixed(6)} ` +
      `(nodes ${custody.nodes.toFixed(3)} + carried ${custody.carried.toFixed(3)} + detached ${custody.detachedInProgress.toFixed(3)} + sold ${custody.sold.toFixed(3)}).`
  );
}

function testMarketScenariosConserveThroughCongestion(): string {
  const summaries: string[] = [];
  for (const name of ['market-compact-conflict', 'market-improved-flow'] as const) {
    const state = scenario(name);
    const opening = tradeGoodCustody(state).total;
    const priorStates = new Map<number, string>();
    let staleRequeues = 0;
    let unservedToDock = 0;
    const servedIds = new Set<number>();
    state.controls.paused = false;
    for (let step = 0; step < 700; step += 1) {
      if (step === 175) stageFacilityVisitors(state, 6, 51, 55, 'market', [], 99700);
      for (const job of state.jobs) priorStates.set(job.id, `${job.state}:${job.pickedUpAmount}:${job.assignedCrewId}`);
      tick(state, 0.2);
      for (const event of state.serviceLog.recent) {
        if (event.service === 'retail') servedIds.add(event.actorId);
      }
      for (const job of state.jobs) {
        const before = priorStates.get(job.id);
        if (before?.startsWith('in_progress:') && job.state === 'pending' && job.assignedCrewId === null) {
          staleRequeues += 1;
        }
      }
      unservedToDock = Math.max(
        unservedToDock,
        state.visitors.filter(
          (visitor) =>
            visitor.primaryPreference === 'market' &&
            visitor.state === VisitorState.ToDock &&
            !servedIds.has(visitor.id)
        ).length
      );
      assertConserved(state, opening, `${name} at ${state.now.toFixed(1)}s`);
    }
    if (name === 'market-compact-conflict') {
      assert(staleRequeues > 0, 'Compact congestion must exercise at least one in-progress stale requeue.');
      assert(unservedToDock > 0, 'Compact congestion must exercise an unserved shopper departure path.');
    }
    summaries.push(
      `${name}: ${opening.toFixed(1)} conserved for ${state.now.toFixed(0)}s, ` +
      `${state.usageTotals.tradeGoodsSold} sold, ${staleRequeues} stale requeues, ${unservedToDock} unserved-to-dock peak`
    );
  }
  return summaries.join('; ');
}

function installInterruptedJob(
  state: StationState,
  options: { sourceFull: boolean; destinationFull: boolean; detached: boolean }
): {
  job: StationState['jobs'][number];
  carrier: StationState['crewMembers'][number];
  sourceNode: StationState['itemNodes'][number];
  destinationNode: StationState['itemNodes'][number];
} {
  state.jobs.length = 0;
  const source = state.moduleInstances.find((module) => module.type === ModuleType.IntakePallet);
  const destination = state.moduleInstances.find((module) => module.type === ModuleType.BackroomStockBank);
  const carrier = state.crewMembers.find((crew) => crew.staffRole === 'cargo-handler');
  assert(source && destination && carrier, 'Interrupted-custody fixture needs receiving, backroom, and cargo labor.');
  const sourceNode = state.itemNodes.find((node) => node.tileIndex === source.originTile);
  const destinationNode = state.itemNodes.find((node) => node.tileIndex === destination.originTile);
  assert(sourceNode && destinationNode, 'Interrupted-custody fixture inventory nodes are missing.');
  sourceNode.items = options.sourceFull ? { rawMaterial: sourceNode.capacity } : {};
  destinationNode.items = options.destinationFull ? { rawMaterial: destinationNode.capacity } : {};
  carrier.activeJobId = 88001;
  carrier.carryingItemType = 'tradeGood';
  carrier.carryingAmount = 4;
  carrier.path = [];
  const job: StationState['jobs'][number] = {
    id: 88001,
    type: 'deliver',
    itemType: 'tradeGood',
    amount: 4,
    fromTile: source.originTile,
    toTile: destination.originTile,
    assignedCrewId: options.detached ? null : carrier.id,
    createdAt: 0,
    expiresAt: 300,
    state: 'in_progress',
    pickedUpAmount: 4,
    completedAt: null,
    lastProgressAt: 0,
    stallReason: 'stalled_path_blocked'
  };
  if (options.detached) {
    carrier.activeJobId = null;
    carrier.carryingItemType = null;
    carrier.carryingAmount = 0;
  }
  state.jobs.push(job);
  state.now = 100;
  return { job, carrier, sourceNode, destinationNode };
}

function testInterruptedCustodyFallbacks(): string {
  const destinationFallback = scenario('market-compact-conflict');
  const first = installInterruptedJob(destinationFallback, {
    sourceFull: true,
    destinationFull: false,
    detached: false
  });
  const openingFirst = tradeGoodCustody(destinationFallback).total;
  runStalledJobRequeueTestTick(destinationFallback);
  assert(first.job.state === 'pending' && first.job.pickedUpAmount === 0, 'Restored job must requeue empty.');
  assert(first.carrier.carryingAmount === 0 && first.carrier.activeJobId === null, 'Restored carrier must release custody.');
  assert((first.destinationNode.items.tradeGood ?? 0) === 4, 'A full source must fall back to the destination node.');
  assertConserved(destinationFallback, openingFirst, 'destination fallback');

  const carrierHold = scenario('market-compact-conflict');
  const second = installInterruptedJob(carrierHold, {
    sourceFull: true,
    destinationFull: true,
    detached: false
  });
  const openingSecond = tradeGoodCustody(carrierHold).total;
  const warnings: string[] = [];
  requeueInterruptedTransportJob(carrierHold, second.job, second.carrier, warnings);
  assert(second.job.state === 'in_progress' && second.job.pickedUpAmount === 4, 'Blocked return must retain job custody.');
  assert(second.carrier.carryingAmount === 4 && second.carrier.activeJobId === second.job.id, 'Blocked return must stay on its carrier.');
  assert(second.job.stallReason === 'stalled_unreachable_dropoff', 'Blocked return must expose a drop-off capacity stall.');
  assert(warnings.length === 1, 'Blocked return must emit one explicit custody warning.');
  assertConserved(carrierHold, openingSecond, 'carrier-held fallback');

  const detachedHold = scenario('market-compact-conflict');
  const third = installInterruptedJob(detachedHold, {
    sourceFull: true,
    destinationFull: true,
    detached: true
  });
  const openingThird = tradeGoodCustody(detachedHold).total;
  requeueInterruptedTransportJob(detachedHold, third.job, null);
  assert(
    third.job.state === 'in_progress' && third.job.assignedCrewId === null && third.job.pickedUpAmount === 4,
    'Detached cargo with no capacity must remain explicit on its in-progress job.'
  );
  assertConserved(detachedHold, openingThird, 'detached job custody');
  third.destinationNode.items.rawMaterial = third.destinationNode.capacity - 4;
  runStalledJobRequeueTestTick(detachedHold);
  const recoveredJob = detachedHold.jobs.find((job) => job.id === third.job.id)!;
  assert(recoveredJob.state === 'pending' && recoveredJob.pickedUpAmount === 0, 'Detached custody must requeue once capacity opens.');
  assert((third.destinationNode.items.tradeGood ?? 0) === 4, 'Detached custody must land in the reopened destination.');
  assertConserved(detachedHold, openingThird, 'detached custody recovery');

  return 'full source returned 4 to destination; full endpoints retained 4 on carrier; detached 4 stayed on job then recovered';
}

const TESTS: Array<{ name: string; run: () => string }> = [
  { name: 'market scenarios conserve through congestion', run: testMarketScenariosConserveThroughCongestion },
  { name: 'interrupted custody fallbacks', run: testInterruptedCustodyFallbacks }
];

let failures = 0;
for (const test of TESTS) {
  const started = Date.now();
  try {
    const evidence = test.run();
    console.log(`ok   ${test.name} (${Date.now() - started}ms)`);
    console.log(`     ${evidence}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${test.name} (${Date.now() - started}ms)`);
    console.error(`     ${(error as Error).message}`);
  }
}

if (failures > 0) process.exitCode = 1;
else console.log(`inventory-conservation-tests: ok ${TESTS.length}/${TESTS.length}`);
