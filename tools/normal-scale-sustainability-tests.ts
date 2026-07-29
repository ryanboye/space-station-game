import { applyColdStartScenario } from '../src/sim/cold-start-scenarios';
import {
  createInitialState,
  getCrewSustainabilitySummary,
  runCriticalNeedJobYieldTestTick,
  runJobAssignmentTestTick,
  tick
} from '../src/sim/sim';
import {
  ModuleType,
  TileType,
  type CrewMember,
  type StationState,
  type TransportJob
} from '../src/sim/types';

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

function testCriticalNeedJobYieldBoundary(): string {
  const state = createInitialState({
    seed: 915_559,
    physicalStarterInventory: true,
    manualTrafficAdmission: false
  });
  assert(applyColdStartScenario(state, 'normal-scale-50'), 'critical-yield fixture scenario is not registered');
  const crew = state.crewMembers[0];
  assert(crew, 'critical-yield fixture has no crew');
  for (const other of state.crewMembers) other.resting = other !== crew;
  state.jobs = [];
  state.constructionSites = [];

  const clearActor = (): void => {
    crew.activeJobId = null;
    crew.path = [];
    crew.resting = false;
    crew.eating = false;
    crew.carryingMeal = false;
    crew.eatSessionActive = false;
    crew.cleaning = false;
    crew.cleanSessionActive = false;
    crew.toileting = false;
    crew.toiletSessionActive = false;
    crew.drinking = false;
    crew.drinkSessionActive = false;
    crew.evaSuit = false;
    crew.carryingItemType = null;
    crew.carryingAmount = 0;
    crew.energy = 17;
    crew.hunger = 90;
    crew.hygiene = 90;
    crew.bladder = 90;
    crew.thirst = 90;
    crew.needsStrainSec = 8;
    crew.taskLockUntil = 0;
  };
  const assignJob = (job: TransportJob): void => {
    state.jobs = [job];
    crew.activeJobId = job.id;
    crew.path = [job.fromTile, job.toTile];
  };
  const basicJob = (id: number, type: TransportJob['type'] = 'deliver'): TransportJob => ({
    id,
    type,
    itemType: type === 'construct' ? 'rawMaterial' : 'tradeGood',
    amount: 1,
    fromTile: crew.tileIndex,
    toTile: crew.tileIndex,
    assignedCrewId: crew.id,
    createdAt: state.now,
    expiresAt: state.now + 90,
    state: 'assigned',
    pickedUpAmount: 0,
    completedAt: null,
    lastProgressAt: state.now,
    stallReason: 'none'
  });

  clearActor();
  const siteId = 915_559;
  state.constructionSites.push({
    id: siteId,
    kind: 'tile',
    tileIndex: crew.tileIndex,
    targetTile: TileType.Floor,
    requiredMaterials: 2,
    deliveredMaterials: 2,
    buildProgress: 3.5,
    buildWorkRequired: 10,
    requiresEva: false,
    assignedCrewId: crew.id,
    state: 'building',
    blockedReason: null,
    createdAt: state.now
  });
  const ordinary = {
    ...basicJob(915_559, 'construct'),
    constructionSiteId: siteId,
    constructionMode: 'build' as const,
    workProgress: 3.5,
    workRequired: 10
  };
  assignJob(ordinary);
  assert(runCriticalNeedJobYieldTestTick(state, crew.id), 'sustained true-critical crew did not yield ordinary work');
  assert(!runCriticalNeedJobYieldTestTick(state, crew.id), 'one critical episode yielded the same job more than once');
  assert(ordinary.state === 'pending' && ordinary.assignedCrewId === null, 'yield did not requeue the same job');
  assert(ordinary.workProgress === 3.5, 'yield discarded partial job progress');
  const site = state.constructionSites[0];
  assert(
    site.buildProgress === 3.5 && site.state === 'planned' && site.assignedCrewId === null,
    'yield discarded or stranded construction-site state'
  );
  assert(crew.activeJobId === null && crew.path.length === 0, 'yield retained actor job ownership or path');
  assert(crew.taskLockUntil > state.now, 'yield did not arm a bounded reassignment lock');
  runJobAssignmentTestTick(state);
  assert(crew.activeJobId === null, 'critical crew was immediately reassigned its yielded job');

  const protectedCases: Array<{
    label: string;
    prepare?: () => void;
    locks?: Parameters<typeof runCriticalNeedJobYieldTestTick>[2];
  }> = [
    {
      label: 'carrying transport',
      prepare: () => {
        crew.carryingItemType = 'tradeGood';
        crew.carryingAmount = 1;
      }
    },
    {
      label: 'active physical self-care session',
      prepare: () => {
        crew.drinking = true;
        crew.drinkSessionActive = true;
      }
    },
    { label: 'incident duty', locks: { incidentDutyLocked: true } },
    { label: 'command duty', locks: { commandDutyLocked: true } },
    { label: 'protected post', locks: { protectedDutyLocked: true } },
    {
      label: 'EVA',
      prepare: () => {
        crew.evaSuit = true;
      }
    }
  ];
  for (const [index, protectedCase] of protectedCases.entries()) {
    clearActor();
    const protectedJob = basicJob(915_560 + index);
    assignJob(protectedJob);
    protectedCase.prepare?.();
    assert(
      !runCriticalNeedJobYieldTestTick(state, crew.id, protectedCase.locks),
      `${protectedCase.label} was preempted by critical self-care`
    );
    assert(
      crew.activeJobId === protectedJob.id &&
        protectedJob.state === 'assigned' &&
        protectedJob.assignedCrewId === crew.id,
      `${protectedCase.label} lost job custody`
    );
  }

  return 'ordinary construction yielded once with progress intact; reassignment lock held; carrying, active-session, incident, command, protected-post, and EVA work retained custody';
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
  const finalCriticalCrew = state.crewMembers
    .filter(
      (crew) =>
        crew.energy < 18 ||
        crew.hunger < 18 ||
        crew.hygiene < 18 ||
        crew.bladder < 8 ||
        crew.thirst < 8
    )
    .map((crew) => {
      const job = crew.activeJobId === null
        ? null
        : state.jobs.find((candidate) => candidate.id === crew.activeJobId) ?? null;
      return {
        id: crew.id,
        role: crew.staffRole,
        watch: crew.shiftBucket,
        needs: {
          energy: Number(crew.energy.toFixed(1)),
          hunger: Number(crew.hunger.toFixed(1)),
          hygiene: Number(crew.hygiene.toFixed(1)),
          bladder: Number(crew.bladder.toFixed(1)),
          thirst: Number(crew.thirst.toFixed(1))
        },
        strainSec: Number(crew.needsStrainSec.toFixed(1)),
        activeJob: job ? `${job.type}:${job.state}` : null,
        selfCare: {
          resting: crew.resting,
          eating: crew.eating,
          toileting: crew.toileting,
          drinking: crew.drinking,
          cleaning: crew.cleaning,
          carryingMeal: crew.carryingMeal
        },
        idleReason: crew.idleReason,
        pathLength: crew.path.length
      };
    });
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
        finalCriticalCrew,
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
  const criticalYieldEvidence = testCriticalNeedJobYieldBoundary();
  if (process.env.NORMAL_SCALE_YIELD_ONLY === '1') {
    process.stdout.write(`${JSON.stringify({ criticalYieldEvidence }, null, 2)}\n`);
    process.stdout.write('normal-scale-critical-yield-tests: ok\n');
    return;
  }
  const requestedScenario = process.env.NORMAL_SCALE_SCENARIO as ScenarioName | undefined;
  const scenarios: Array<[ScenarioName, number]> = requestedScenario
    ? [[requestedScenario, requestedScenario === 'normal-scale-50' ? 915_560 : 915_561]]
    : [
        ['normal-scale-50', 915_560],
        ['normal-scale-50-spine', 915_561]
      ];
  const runs = scenarios.map(([scenario, seed]) => runScenario(scenario, seed));
  process.stdout.write(`${JSON.stringify({ criticalYieldEvidence, runs: runs.map((run) => run.report) }, null, 2)}\n`);
  const failures = runs.flatMap((run) =>
    run.failures.map((failure) => `${String(run.report.scenario)}: ${failure}`)
  );
  assert(failures.length === 0, `600s sustainability contract failed:\n- ${failures.join('\n- ')}`);
  process.stdout.write('normal-scale-sustainability-tests: ok\n');
}

main();
