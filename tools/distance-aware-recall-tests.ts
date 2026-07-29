import { applyColdStartScenario } from '../src/sim/cold-start-scenarios';
import { createInitialState, tick } from '../src/sim/sim';
import { VisitorState, type PortPromiseKind, type StationState, type Visitor } from '../src/sim/types';

const STEP = 1 / 15;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`distance-aware-recall: ${message}`);
}

function advanceUntil(state: StationState, predicate: () => boolean, timeoutSec: number): void {
  state.controls.paused = false;
  for (let elapsed = 0; elapsed < timeoutSec && !predicate(); elapsed += STEP) tick(state, STEP);
  assert(predicate(), `condition did not resolve within ${timeoutSec}s`);
}

function setVisitorTile(state: StationState, visitor: Visitor, tileIndex: number): void {
  visitor.tileIndex = tileIndex;
  visitor.x = (tileIndex % state.width) + 0.5;
  visitor.y = Math.floor(tileIndex / state.width) + 0.5;
  visitor.path = [];
  visitor.state = VisitorState.Leisure;
  visitor.activeService = null;
  visitor.completedServices = [...visitor.servicePlan];
  visitor.recurringNeedActive = null;
  visitor.blockedTicks = 0;
  visitor.airExposureSec = 0;
  visitor.healthState = 'healthy';
  if (visitor.needs) {
    visitor.needs.hunger = 100;
    visitor.needs.energy = 100;
    visitor.needs.hygiene = 100;
    visitor.needs.leisure = 100;
    visitor.needs.active = null;
    visitor.needs.unmetSince = null;
  }
}

function promiseProgress(state: StationState, contractId: number, kind: PortPromiseKind): number {
  return state.portOps.contracts
    .find((contract) => contract.id === contractId)
    ?.promises.find((promise) => promise.kind === kind)?.completed ?? 0;
}

function testLargeStationFinalCallUsesPhysicalReturnDistance(): void {
  const state = createInitialState({
    seed: 915_502,
    physicalStarterInventory: true,
    manualTrafficAdmission: false
  });
  assert(applyColdStartScenario(state, 'normal-scale-50'), 'normal-scale-50 scenario was not registered');
  const ship = state.arrivingShips.find((candidate) => candidate.portManifest?.callsign.startsWith('MIX-'));
  assert(ship, 'guaranteed mixed shuttle was not admitted');
  const contract = state.portOps.contracts.find((candidate) => candidate.shipId === ship.id);
  assert(contract, 'guaranteed mixed shuttle had no contract');

  // Keep this a focused six-person return proof. The production fixture still
  // supplies its real 100x60 topology, Berth, Gangway, and transfer queue.
  state.controls.shipsPerCycle = 0;
  state.controls.portAutoAdmitEnabled = false;
  state.trafficOffers = state.trafficOffers.filter((offer) => offer.id === ship.id);
  advanceUntil(state, () => ship.passengersSpawned === 6, 45);
  const cohort = state.visitors.filter((visitor) => visitor.originShipId === ship.id);
  assert(cohort.length === 6, `expected six living emerged passengers, got ${cohort.length}`);
  assert(ship.passengersBoarded === 0, `return proof began with ${ship.passengersBoarded} passengers already boarded`);
  assert(promiseProgress(state, contract.id, 'passengers-returned') === 0, 'return promise had pre-test progress');

  // These are ordinary walkable public tiles used by the authored scale deck,
  // clustered more than seventy route steps from the mixed call's Gangway.
  const remoteTiles = [1819, 1820, 1920, 2020, 1721, 1821];
  for (let index = 0; index < cohort.length; index += 1) setVisitorTile(state, cohort[index]!, remoteTiles[index]!);

  if (ship.portTurnaround) {
    ship.portTurnaround.phase = 'open';
    ship.portTurnaround.payoutSettled = true;
  }
  const hardDepartureAt = state.now + 100;
  const fixedCountOnlyRecallAt = hardDepartureAt - 32;
  ship.plannedDepartureAt = hardDepartureAt;
  contract.hardDepartureAt = hardDepartureAt;
  contract.plannedDepartureAt = hardDepartureAt;
  contract.boardingStartsAt = fixedCountOnlyRecallAt;
  contract.status = 'active';
  if (ship.portTurnaround) ship.portTurnaround.loadingDeadlineAt = hardDepartureAt;

  const cohortIds = new Set(cohort.map((visitor) => visitor.id));
  const lastTile = new Map(cohort.map((visitor) => [visitor.id, visitor.tileIndex]));
  const tileTransitions = new Map(cohort.map((visitor) => [visitor.id, 0]));
  const queued = new Set<number>();
  const physicallyCrossed = new Set<number>();
  const boardingEvents: string[] = [];
  const phases = new Map(cohort.map((visitor) => [visitor.id, new Set<string>()]));
  let recallAt: number | null = null;
  let shortestRecallPath = Number.POSITIVE_INFINITY;
  let longestRecallPath = 0;
  let maxBoarded = 0;
  const deathsBefore = state.metrics.deathsTotal;
  let preDeadlineSnapshot = '';

  for (let elapsed = 0; elapsed < 120; elapsed += STEP) {
    const liveBefore = new Map(
      state.visitors
        .filter((visitor) => cohortIds.has(visitor.id))
        .map((visitor) => [visitor.id, visitor.transferPhase ?? 'station'])
    );
    const boardedBefore = ship.passengersBoarded;
    // Atmosphere loss on this authored hull is tracked separately. Hold only
    // this cohort's survival input stable while retaining the real 50/50 crowd.
    state.pressurized.fill(true);
    state.airQualityByTile.fill(100);
    for (const visitor of cohort) {
      visitor.airExposureSec = 0;
      visitor.healthState = 'healthy';
    }
    tick(state, STEP);
    const active = state.arrivingShips.find((candidate) => candidate.id === ship.id);
    if (active) maxBoarded = Math.max(maxBoarded, active.passengersBoarded);
    else maxBoarded = Math.max(maxBoarded, ship.passengersBoarded);
    const liveAfter = new Set(
      state.visitors.filter((visitor) => cohortIds.has(visitor.id)).map((visitor) => visitor.id)
    );
    const boardedDelta = ship.passengersBoarded - boardedBefore;
    if (boardedDelta > 0) {
      const removed = [...liveBefore].filter(([id]) => !liveAfter.has(id));
      boardingEvents.push(`${state.now.toFixed(2)}:+${boardedDelta}/removed=${removed.map(([id, phase]) => `${id}:${phase}`).join('+')}`);
      assert(removed.length === boardedDelta, `boarding advanced ${boardedDelta} but removed ${removed.length} cohort actors`);
      for (const [id, phase] of removed) {
        assert(
          phase === 'boarding-queued' || phase === 'boarding-crossing',
          `passenger ${id} returned from non-physical phase ${phase}`
        );
        physicallyCrossed.add(id);
      }
    }
    for (const visitor of state.visitors) {
      if (!cohortIds.has(visitor.id)) continue;
      const previous = lastTile.get(visitor.id);
      if (previous !== visitor.tileIndex) {
        tileTransitions.set(visitor.id, (tileTransitions.get(visitor.id) ?? 0) + 1);
        lastTile.set(visitor.id, visitor.tileIndex);
      }
      if (visitor.transferPhase === 'boarding-queued') queued.add(visitor.id);
      phases.get(visitor.id)?.add(visitor.transferPhase ?? 'station');
    }
    if (state.now < hardDepartureAt && hardDepartureAt - state.now < 1) {
      preDeadlineSnapshot = state.visitors
        .filter((visitor) => cohortIds.has(visitor.id))
        .map((visitor) => `${visitor.id}:${visitor.transferPhase}@${visitor.tileIndex}` +
          `>q${visitor.transferQueueTile ?? '-'}:a${visitor.transferAccessTile ?? '-'}:s${visitor.transferStationTile ?? '-'}` +
          `:p${visitor.path[0] ?? '-'}..${visitor.path[visitor.path.length - 1] ?? '-'}(${visitor.path.length})` +
          `:b${visitor.blockedTicks}:${visitor.movementWaitReason ?? '-'}`)
        .join(', ');
    }
    if (recallAt === null && active && (active.visitPhase === 'recall' || active.visitPhase === 'boarding')) {
      recallAt = state.now;
      const paths = state.visitors
        .filter((visitor) => cohortIds.has(visitor.id))
        .map((visitor) => visitor.path.length);
      shortestRecallPath = Math.min(...paths);
      longestRecallPath = Math.max(...paths);
    }
    if (maxBoarded === 6) break;
  }

  assert(recallAt !== null, 'the physical final call never began');
  assert(recallAt < fixedCountOnlyRecallAt - 10, `recall ${recallAt.toFixed(1)} was not materially earlier than count-only ${fixedCountOnlyRecallAt.toFixed(1)}`);
  assert(longestRecallPath >= 70, `longest real recall route was only ${longestRecallPath} steps`);
  assert(shortestRecallPath >= 60, `remote cohort was not isolated on a large-station route (${shortestRecallPath} steps)`);
  assert(contract.hardDepartureAt === hardDepartureAt, 'physical recall moved the published hard deadline');
  assert(state.metrics.deathsTotal === deathsBefore, 'a test passenger died instead of completing the return');
  assert(queued.size === 6, `only ${queued.size}/6 passengers joined the physical boarding queue`);
  assert(
    physicallyCrossed.size === 6,
    `only ${physicallyCrossed.size}/6 queued passengers completed the physical crossing (` +
      `${[...phases].map(([id, seen]) => `${id}:${[...seen].join('+')}`).join(', ')}; events ${boardingEvents.join(', ')})`
      + `; pre-deadline ${preDeadlineSnapshot}`
  );
  assert(maxBoarded === 6, `only ${maxBoarded}/6 passengers physically returned`);
  assert(promiseProgress(state, contract.id, 'passengers-returned') === 6, 'return promise did not follow physical crossings');
  assert(!state.visitors.some((visitor) => visitor.strandedFromShipId === ship.id), 'the early final call stranded a passenger');
  assert(
    [...tileTransitions.values()].every((count) => count >= 50),
    `a passenger bypassed the real walk (${[...tileTransitions.values()].join(', ')} tile transitions)`
  );
  assert(state.now <= hardDepartureAt + STEP, `boarding finished after the unchanged deadline (${state.now.toFixed(1)} > ${hardDepartureAt.toFixed(1)})`);

  console.log(
    `PASS distance-aware-final-call: recall ${recallAt.toFixed(1)} < count-only ${fixedCountOnlyRecallAt.toFixed(1)} · ` +
    `routes ${shortestRecallPath}-${longestRecallPath} · walked ${[...tileTransitions.values()].join('/')} · returned 6/6`
  );
}

testLargeStationFinalCallUsesPhysicalReturnDistance();
