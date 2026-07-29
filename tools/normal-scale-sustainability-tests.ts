import { applyColdStartScenario } from '../src/sim/cold-start-scenarios';
import {
  createInitialState,
  getCrewSustainabilitySummary,
  tick
} from '../src/sim/sim';
import { ModuleType, type CrewMember, type StationState } from '../src/sim/types';

const STEP = 1 / 15;
const RUN_SECONDS = 600;
const WARMUP_SECONDS = 180;

type ScenarioName = 'normal-scale-50' | 'normal-scale-50-spine';

type SelfCareSnapshot = Pick<
  CrewMember,
  'resting' | 'eating' | 'toileting' | 'drinking' | 'cleaning'
>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`normal-scale-sustainability: ${message}`);
}

function liveJob(state: StationState, type: string): number {
  return state.jobs.filter(
    (job) => job.type === type && (job.state === 'pending' || job.state === 'assigned' || job.state === 'in_progress')
  ).length;
}

function itemAt(state: StationState, tile: number, item: 'meal' | 'cleanTray' | 'dirtyTray'): number {
  return state.itemNodes.find((node) => node.tileIndex === tile)?.items[item] ?? 0;
}

function moduleOrigins(state: StationState, type: ModuleType): number[] {
  return state.moduleInstances
    .filter((module) => module.type === type)
    .map((module) => module.originTile);
}

function readyServings(state: StationState, servingTiles: number[]): number {
  return servingTiles.reduce(
    (total, tile) => total + Math.min(itemAt(state, tile, 'meal'), itemAt(state, tile, 'cleanTray')),
    0
  );
}

function dirtyReturns(state: StationState, returnTiles: number[]): number {
  return returnTiles.reduce((total, tile) => total + itemAt(state, tile, 'dirtyTray'), 0);
}

function snapshotCrew(crew: CrewMember): SelfCareSnapshot {
  return {
    resting: crew.resting,
    eating: crew.eating,
    toileting: crew.toileting,
    drinking: crew.drinking,
    cleaning: crew.cleaning
  };
}

function runScenario(scenario: ScenarioName, seed: number): {
  report: Record<string, unknown>;
  failures: string[];
} {
  const state = createInitialState({
    seed,
    physicalStarterInventory: true,
    manualTrafficAdmission: false
  });
  assert(applyColdStartScenario(state, scenario), `${scenario} is not registered`);
  assert(state.crewMembers.length === 50, `${scenario} did not author 50 crew`);
  assert(state.visitors.length === 50, `${scenario} did not author 50 visitors`);
  assert(state.residents.length === 0, `${scenario} crew-meal accounting requires no resident cohort`);

  const servingTiles = moduleOrigins(state, ModuleType.ServingStation);
  const returnTiles = moduleOrigins(state, ModuleType.TrayReturn);
  const washerTiles = moduleOrigins(state, ModuleType.Dishwasher);
  assert(servingTiles.length >= 2, `${scenario} needs two physical serving counters`);
  assert(returnTiles.length >= 1, `${scenario} needs a physical tray return`);
  assert(washerTiles.length >= 1, `${scenario} needs a physical dishwasher`);

  const mixedShip = state.arrivingShips.find((ship) => ship.portManifest?.callsign.startsWith('MIX-'));
  assert(mixedShip, `${scenario} did not admit its guaranteed mixed call`);
  const mixedContractId = mixedShip.portContractId;
  assert(mixedContractId !== undefined, `${scenario} mixed call has no contract`);

  const deathsAtStart = state.metrics.deathsTotal;
  const crewMealAtStart = state.serviceLog.lifetimeByService.meal - state.serviceLog.visitorLifetimeByService.meal;
  const initialNeeds = getCrewSustainabilitySummary(state);
  const previous = new Map(state.crewMembers.map((crew) => [crew.id, snapshotCrew(crew)]));
  const completed = {
    rest: new Set<number>(),
    meal: new Set<number>(),
    restroom: new Set<number>(),
    drink: new Set<number>(),
    hygiene: new Set<number>()
  };
  const completedWashJobs = new Set<number>();

  let minimumCrew = state.crewMembers.length;
  let peakCriticalAfterWarmup = 0;
  let peakResignationNotices = 0;
  let minimumReadyWithMeals = Number.POSITIVE_INFINITY;
  let firstReadyStarvationAt: number | null = null;
  let peakDirtyReturn = dirtyReturns(state, returnTiles);
  let dirtyReturnDrained = false;
  let maxPassengersSpawned = mixedShip.passengersSpawned;
  let maxPassengersBoarded = mixedShip.passengersBoarded;
  let maxInboundHandled = 0;
  let maxStranded = 0;

  state.controls.paused = false;
  const totalSteps = Math.round(RUN_SECONDS / STEP);
  for (let step = 1; step <= totalSteps; step += 1) {
    tick(state, STEP);

    for (const crew of state.crewMembers) {
      const before = previous.get(crew.id);
      if (before) {
        if (before.resting && !crew.resting && crew.energy >= 86) completed.rest.add(crew.id);
        if (before.toileting && !crew.toileting && crew.bladder >= 88) completed.restroom.add(crew.id);
        if (before.drinking && !crew.drinking && crew.thirst >= 90) completed.drink.add(crew.id);
        if (before.cleaning && !crew.cleaning && crew.hygiene >= 90) completed.hygiene.add(crew.id);
      }
      previous.set(crew.id, snapshotCrew(crew));
    }

    const crewMealTotal = state.serviceLog.lifetimeByService.meal - state.serviceLog.visitorLifetimeByService.meal;
    if (crewMealTotal > crewMealAtStart) {
      for (const event of state.serviceLog.recent) {
        if (event.population === 'crew' && event.service === 'meal') completed.meal.add(event.actorId);
      }
    }
    for (const job of state.jobs) {
      if (job.type === 'wash' && job.state === 'done') completedWashJobs.add(job.id);
    }

    minimumCrew = Math.min(minimumCrew, state.crewMembers.length);
    peakResignationNotices = Math.max(
      peakResignationNotices,
      state.crewMembers.filter((crew) => crew.resignationNoticeAt !== null).length
    );
    if (state.now >= WARMUP_SECONDS && step % 15 === 0) {
      peakCriticalAfterWarmup = Math.max(
        peakCriticalAfterWarmup,
        getCrewSustainabilitySummary(state).criticalNeedsCrew
      );
    }

    const ready = readyServings(state, servingTiles);
    if (state.metrics.mealStock >= 1) {
      minimumReadyWithMeals = Math.min(minimumReadyWithMeals, ready);
      if (ready < 1 && firstReadyStarvationAt === null) firstReadyStarvationAt = state.now;
    }
    const dirty = dirtyReturns(state, returnTiles);
    if (dirty > peakDirtyReturn + 0.01) {
      peakDirtyReturn = dirty;
      dirtyReturnDrained = false;
    } else if (peakDirtyReturn >= 1 && dirty <= Math.max(1, peakDirtyReturn * 0.35)) {
      dirtyReturnDrained = true;
    }

    maxPassengersSpawned = Math.max(maxPassengersSpawned, mixedShip.passengersSpawned);
    maxPassengersBoarded = Math.max(maxPassengersBoarded, mixedShip.passengersBoarded);
    maxInboundHandled = Math.max(
      maxInboundHandled,
      state.portOps.cargoLots
        .filter((lot) => lot.contractId === mixedContractId)
        .reduce((total, lot) => total + lot.handledQuantity, 0)
    );
    maxStranded = Math.max(
      maxStranded,
      state.visitors.filter((visitor) => visitor.strandedFromShipId === mixedShip.id).length
    );
  }

  const finalNeeds = getCrewSustainabilitySummary(state);
  const finalDirtyReturn = dirtyReturns(state, returnTiles);
  const finalReady = readyServings(state, servingTiles);
  const crewMealsCompleted = state.serviceLog.lifetimeByService.meal -
    state.serviceLog.visitorLifetimeByService.meal - crewMealAtStart;
  const settlement = state.portOps.settlements.find((entry) => entry.contractId === mixedContractId);
  const contract = state.portOps.contracts.find((entry) => entry.id === mixedContractId);
  const failures: string[] = [];
  const require = (condition: unknown, message: string): void => {
    if (!condition) failures.push(message);
  };

  require(minimumCrew === 50, `crew fell to ${minimumCrew}/50`);
  require(state.metrics.deathsTotal === deathsAtStart, `recorded ${state.metrics.deathsTotal - deathsAtStart} deaths`);
  require(peakResignationNotices === 0, `peaked at ${peakResignationNotices} resignation notices`);
  require(initialNeeds.criticalNeedsCrew === 0, `opened with ${initialNeeds.criticalNeedsCrew} critical crew`);
  require(peakCriticalAfterWarmup === 0, `peaked at ${peakCriticalAfterWarmup} critical crew after warmup`);
  require(completed.rest.size > 0, 'no crew member completed physical sleep');
  require(crewMealsCompleted > 0 && completed.meal.size > 0, 'no crew member completed a physical meal');
  require(completed.restroom.size > 0, 'no crew member completed a physical restroom visit');
  require(completed.drink.size > 0, 'no crew member completed a physical drink visit');
  require(completed.hygiene.size > 0, 'no crew member completed a physical hygiene visit');
  require(firstReadyStarvationAt === null, `clean-tray starvation began at ${firstReadyStarvationAt?.toFixed(1)}s while meals remained`);
  require(completedWashJobs.size > 0, 'no physical wash job completed');
  require(peakDirtyReturn > 0, 'no dirty tray reached the physical return');
  require(dirtyReturnDrained, `dirty return never drained after peaking at ${peakDirtyReturn.toFixed(1)}`);
  require(finalDirtyReturn < 29.5, `dirty return remained capacity-pinned at ${finalDirtyReturn.toFixed(1)}/30`);
  require(maxInboundHandled >= 10, `mixed call handled only ${maxInboundHandled.toFixed(1)}/10 inbound units`);
  require(maxPassengersSpawned === mixedShip.passengersTotal, `mixed call spawned ${maxPassengersSpawned}/${mixedShip.passengersTotal} passengers`);
  require(maxPassengersBoarded === mixedShip.passengersTotal, `mixed call returned ${maxPassengersBoarded}/${mixedShip.passengersTotal} passengers`);
  require(maxStranded === 0, `mixed call stranded ${maxStranded} passengers`);
  require(contract?.status === 'departed' && settlement !== undefined, `mixed call did not depart and settle (status ${contract?.status ?? 'missing'})`);

  return {
    report: {
      scenario,
      durationSeconds: RUN_SECONDS,
      authoredProviders: {
        servingStations: servingTiles.length,
        trayReturns: returnTiles.length,
        dishwashers: washerTiles.length,
        toilets: moduleOrigins(state, ModuleType.Toilet).length,
        showers: moduleOrigins(state, ModuleType.Shower).length,
        sinks: moduleOrigins(state, ModuleType.Sink).length,
        waterFountains: moduleOrigins(state, ModuleType.WaterFountain).length
      },
      crew: {
        minimum: minimumCrew,
        final: state.crewMembers.length,
        deaths: state.metrics.deathsTotal - deathsAtStart,
        peakResignationNotices,
        peakCriticalAfterWarmup,
        finalCritical: finalNeeds.criticalNeedsCrew,
        completedNeedSessions: {
          rest: completed.rest.size,
          meal: completed.meal.size,
          restroom: completed.restroom.size,
          drink: completed.drink.size,
          hygiene: completed.hygiene.size
        }
      },
      dishCycle: {
        crewMealsCompleted,
        completedWashJobs: completedWashJobs.size,
        minimumReadyWithMeals: Number(minimumReadyWithMeals.toFixed(1)),
        firstReadyStarvationAt: firstReadyStarvationAt === null ? null : Number(firstReadyStarvationAt.toFixed(1)),
        peakDirtyReturn: Number(peakDirtyReturn.toFixed(1)),
        finalDirtyReturn: Number(finalDirtyReturn.toFixed(1)),
        dirtyReturnDrained,
        finalReadyServings: Number(finalReady.toFixed(1)),
        liveWashJobs: liveJob(state, 'wash')
      },
      mixedCall: {
        inboundHandled: Number(maxInboundHandled.toFixed(1)),
        passengersSpawned: maxPassengersSpawned,
        passengersBoarded: maxPassengersBoarded,
        stranded: maxStranded,
        contractStatus: contract?.status ?? null,
        settled: settlement !== undefined
      },
      failures
    },
    failures
  };
}

function main(): void {
  const runs = [
    runScenario('normal-scale-50', 915_560),
    runScenario('normal-scale-50-spine', 915_561)
  ];
  process.stdout.write(`${JSON.stringify({ runs: runs.map((run) => run.report) }, null, 2)}\n`);
  const failures = runs.flatMap((run) =>
    run.failures.map((failure) => `${String(run.report.scenario)}: ${failure}`)
  );
  assert(failures.length === 0, `600s sustainability contract failed:\n- ${failures.join('\n- ')}`);
  process.stdout.write('normal-scale-sustainability-tests: ok\n');
}

main();
