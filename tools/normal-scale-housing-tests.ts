import { MODULE_DEFINITIONS } from '../src/sim/balance';
import { applyColdStartScenario } from '../src/sim/cold-start-scenarios';
import { resolveFacilitySlots } from '../src/sim/facility-descriptors';
import {
  createInitialState,
  findPath,
  getCrewSustainabilitySummary,
  tick
} from '../src/sim/sim';
import {
  ModuleType,
  RoomType,
  isWalkable,
  type StationState
} from '../src/sim/types';

const STEP_SECONDS = 1 / 15;
const RUN_SECONDS = 900;
const WARMUP_SECONDS = 180;
const SAMPLE_EVERY_STEPS = 15;
const REQUIRED_CREW = 50;
const REQUIRED_POWER_RATIO = 1.1;
const MIN_SAFE_ENERGY = 18;
const MIN_PRESSURIZED_INTERIOR_SHARE = 0.95;

type ScenarioName = 'normal-scale-50' | 'normal-scale-50-spine';

type AuthoredHousing = {
  scenario: ScenarioName;
  state: StationState;
  depictedSleepSlots: number;
  assignedSleepSlots: number;
  unreachableAssignments: Array<{ crewId: number; from: number; target: number | null }>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`normal-scale-housing: ${message}`);
}

/**
 * Count the positions the fixture art depicts, independently of the
 * sustainability summary. A Bunk Bank's four positions come from its shared
 * facility-slot contract; legacy Bed/Bunk positions come from their declared
 * resident capacity. Only crew-designated Dorm positions count.
 */
function depictedCrewSleepSlots(state: StationState): number {
  let count = 0;
  for (const module of state.moduleInstances) {
    if (state.rooms[module.originTile] !== RoomType.Dorm) continue;
    if (module.type === ModuleType.BunkBank) {
      count += resolveFacilitySlots(module, state.width).filter(
        (slot) =>
          slot.role === 'temporary-sleep' &&
          state.rooms[slot.tileIndex] === RoomType.Dorm &&
          state.roomHousingPolicies[slot.tileIndex] === 'crew'
      ).length;
      continue;
    }
    if (module.type !== ModuleType.Bed && module.type !== ModuleType.Bunk) continue;
    if (state.roomHousingPolicies[module.originTile] !== 'crew') continue;
    count += Math.max(1, MODULE_DEFINITIONS[module.type].residentCapacity ?? 1);
  }
  return count;
}

function inspectAuthoredHousing(scenario: ScenarioName, seed: number): AuthoredHousing {
  const state = createInitialState({
    seed,
    physicalStarterInventory: true,
    manualTrafficAdmission: false
  });
  assert(applyColdStartScenario(state, scenario), `${scenario} is not registered`);
  tick(state, 0);

  assert(
    state.crewMembers.length === REQUIRED_CREW,
    `${scenario} authored ${state.crewMembers.length}/${REQUIRED_CREW} crew`
  );

  const summary = getCrewSustainabilitySummary(state);
  const unreachableAssignments = state.crewMembers.flatMap((crew) => {
    const target = crew.assignedSleepTile;
    if (
      target !== null &&
      findPath(state, crew.tileIndex, target, {
        allowRestricted: true,
        intent: 'crew',
        routeSeed: crew.id
      }) !== null
    ) {
      return [];
    }
    return [{ crewId: crew.id, from: crew.tileIndex, target }];
  });

  return {
    scenario,
    state,
    depictedSleepSlots: depictedCrewSleepSlots(state),
    assignedSleepSlots: summary.assignedSleepSlots,
    unreachableAssignments
  };
}

function assertAuthoredCapacity(inspections: AuthoredHousing[]): void {
  const failures: string[] = [];
  for (const inspection of inspections) {
    if (inspection.depictedSleepSlots < REQUIRED_CREW) {
      failures.push(
        `${inspection.scenario}: only ${inspection.depictedSleepSlots}/${REQUIRED_CREW} depicted crew sleep positions`
      );
    }
    if (inspection.assignedSleepSlots !== REQUIRED_CREW) {
      failures.push(
        `${inspection.scenario}: only ${inspection.assignedSleepSlots}/${REQUIRED_CREW} deterministic crew assignments`
      );
    }
    if (inspection.unreachableAssignments.length > 0) {
      failures.push(
        `${inspection.scenario}: ${inspection.unreachableAssignments.length}/${REQUIRED_CREW} assignments are missing or unreachable `
        + `(${inspection.unreachableAssignments
          .slice(0, 8)
          .map((entry) => `${entry.crewId}@${entry.from}->${entry.target ?? 'none'}`)
          .join(', ')}${inspection.unreachableAssignments.length > 8 ? ', …' : ''})`
      );
    }
  }
  assert(
    failures.length === 0,
    `authored 50-crew housing contract failed before the 900s run:\n- ${failures.join('\n- ')}`
  );
}

function runLongHorizon(inspection: AuthoredHousing): Record<string, unknown> {
  const { scenario, state } = inspection;
  const wallStartedAt = Date.now();
  const deathsAtStart = state.metrics.deathsTotal;
  const crewIdsAtStart = state.crewMembers.map((crew) => crew.id).sort((left, right) => left - right);
  const assignedTargets = new Set(
    state.crewMembers.flatMap((crew) => crew.assignedSleepTile === null ? [] : [crew.assignedSleepTile])
  );

  let sampledPowerRatioMin = Number.POSITIVE_INFINITY;
  let minimumEnergyAfterWarmup = Number.POSITIVE_INFINITY;
  let minimumEnergyObservation: Record<string, unknown> | null = null;
  let peakOccupiedSleepSlots = 0;
  let peakNoFixtureSleepWaiters = 0;
  let peakToiletingCrew = 0;
  let peakResignationNotices = 0;
  let restBucketMismatches = 0;
  let peakCrewOnUnpressurizedInterior = 0;
  let peakBerthVacuumWorkers = 0;
  let minimumPressurizedInteriorShare = 1;
  const occupiedTargetIds = new Set<number>();
  // Direct tile truth deliberately excludes roomless circulation/aprons and
  // Berth mouths, whose exposed interface edge is allowed to face vacuum.
  const authoredInteriorTiles = state.tiles.flatMap((tile, tileIndex) =>
    isWalkable(tile) && state.rooms[tileIndex] !== RoomType.None && state.rooms[tileIndex] !== RoomType.Berth
      ? [tileIndex]
      : []
  );
  assert(authoredInteriorTiles.length > 0, `${scenario} has no authored interior room tiles`);

  state.controls.paused = false;
  const totalSteps = Math.round(RUN_SECONDS / STEP_SECONDS);
  for (let step = 1; step <= totalSteps; step += 1) {
    tick(state, STEP_SECONDS);
    if (step % SAMPLE_EVERY_STEPS !== 0) continue;

    const restingCrew = state.crewMembers.filter((crew) => crew.resting);
    const occupiedNow = restingCrew.filter((crew) => assignedTargets.has(crew.tileIndex));
    for (const crew of occupiedNow) occupiedTargetIds.add(crew.tileIndex);
    peakOccupiedSleepSlots = Math.max(peakOccupiedSleepSlots, occupiedNow.length);

    const noFixtureSleepWaiters = restingCrew.filter(
      (crew) => crew.idleReason === 'idle_waiting_fixture' && !assignedTargets.has(crew.tileIndex)
    ).length;
    peakNoFixtureSleepWaiters = Math.max(peakNoFixtureSleepWaiters, noFixtureSleepWaiters);
    peakToiletingCrew = Math.max(
      peakToiletingCrew,
      state.crewMembers.filter((crew) => crew.toileting).length
    );
    peakResignationNotices = Math.max(
      peakResignationNotices,
      state.crewMembers.filter((crew) => crew.resignationNoticeAt !== null).length
    );
    peakCrewOnUnpressurizedInterior = Math.max(
      peakCrewOnUnpressurizedInterior,
      state.crewMembers.filter(
        (crew) =>
          !state.pressurized[crew.tileIndex] &&
          state.rooms[crew.tileIndex] !== RoomType.None &&
          state.rooms[crew.tileIndex] !== RoomType.Berth
      ).length
    );
    peakBerthVacuumWorkers = Math.max(
      peakBerthVacuumWorkers,
      state.crewMembers.filter(
        (crew) => !state.pressurized[crew.tileIndex] && state.rooms[crew.tileIndex] === RoomType.Berth
      ).length
    );
    const pressurizedInteriorShare = authoredInteriorTiles.filter(
      (tileIndex) => state.pressurized[tileIndex]
    ).length / authoredInteriorTiles.length;
    minimumPressurizedInteriorShare = Math.min(minimumPressurizedInteriorShare, pressurizedInteriorShare);

    const computedResting = restingCrew.length;
    if (
      state.metrics.crewResting !== computedResting ||
      state.metrics.crewRestingNow !== computedResting ||
      state.metrics.idleCrewByReason.idle_resting !== computedResting
    ) {
      restBucketMismatches += 1;
    }

    const powerRatio = state.metrics.powerDemand <= 0
      ? Number.POSITIVE_INFINITY
      : state.metrics.powerSupply / state.metrics.powerDemand;
    sampledPowerRatioMin = Math.min(sampledPowerRatioMin, powerRatio);

    if (state.now >= WARMUP_SECONDS) {
      const lowest = [...state.crewMembers].sort((left, right) => left.energy - right.energy || left.id - right.id)[0]!;
      if (lowest.energy < minimumEnergyAfterWarmup) {
        minimumEnergyAfterWarmup = lowest.energy;
        minimumEnergyObservation = {
          at: Number(state.now.toFixed(1)),
          crewId: lowest.id,
          role: lowest.staffRole,
          energy: Number(lowest.energy.toFixed(2)),
          resting: lowest.resting,
          idleReason: lowest.idleReason,
          toileting: lowest.toileting,
          drinking: lowest.drinking,
          eating: lowest.eating,
          cleaning: lowest.cleaning,
          leisure: lowest.leisure
        };
      }
    }
  }

  const finalSummary = getCrewSustainabilitySummary(state);
  const finalCrewIds = state.crewMembers.map((crew) => crew.id).sort((left, right) => left - right);
  const finalMinimumEnergy = Math.min(...state.crewMembers.map((crew) => crew.energy));
  const deaths = state.metrics.deathsTotal - deathsAtStart;

  assert(
    peakOccupiedSleepSlots > 0 && occupiedTargetIds.size > 0,
    `${scenario} never exercised a real assigned sleep position in ${RUN_SECONDS}s`
  );
  assert(
    minimumEnergyAfterWarmup >= MIN_SAFE_ENERGY,
    `${scenario} let crew energy fall to ${minimumEnergyAfterWarmup.toFixed(1)} after the ${WARMUP_SECONDS}s warmup: `
    + JSON.stringify(minimumEnergyObservation)
  );
  assert(
    finalMinimumEnergy >= MIN_SAFE_ENERGY,
    `${scenario} ended with minimum crew energy ${finalMinimumEnergy.toFixed(1)}`
  );
  assert(
    peakNoFixtureSleepWaiters === 0,
    `${scenario} had ${peakNoFixtureSleepWaiters} resting crew waiting without a reachable fixture`
  );
  assert(
    peakResignationNotices === 0 && finalSummary.resignationNotices === 0,
    `${scenario} produced ${peakResignationNotices} resignation notices`
  );
  assert(
    finalCrewIds.join(',') === crewIdsAtStart.join(','),
    `${scenario} lost or replaced crew during the run (${crewIdsAtStart.length} -> ${finalCrewIds.length})`
  );
  assert(deaths === 0, `${scenario} recorded ${deaths} deaths`);
  assert(
    peakCrewOnUnpressurizedInterior === 0,
    `${scenario} put ${peakCrewOnUnpressurizedInterior} crew on directly observed unpressurized non-Berth interior tiles`
  );
  assert(
    minimumPressurizedInteriorShare >= MIN_PRESSURIZED_INTERIOR_SHARE,
    `${scenario} directly pressurized only ${(minimumPressurizedInteriorShare * 100).toFixed(1)}% of authored interior; required 95%`
  );
  assert(
    sampledPowerRatioMin >= REQUIRED_POWER_RATIO,
    `${scenario} sampled only ${(sampledPowerRatioMin * 100).toFixed(1)}% power supply/demand; required 110%`
  );
  assert(
    restBucketMismatches === 0,
    `${scenario} reported ${restBucketMismatches} dishonest rest-state samples `
    + '(crewResting, crewRestingNow, and idle_resting must equal the actual resting crew)'
  );
  assert(
    finalSummary.assignedSleepSlots === REQUIRED_CREW,
    `${scenario} lost deterministic sleep assignments by the end (${finalSummary.assignedSleepSlots}/${REQUIRED_CREW})`
  );

  return {
    scenario,
    wallTimeSeconds: Number(((Date.now() - wallStartedAt) / 1_000).toFixed(2)),
    durationSeconds: RUN_SECONDS,
    crew: finalCrewIds.length,
    depictedSleepSlots: inspection.depictedSleepSlots,
    assignedSleepSlots: finalSummary.assignedSleepSlots,
    distinctSleepPositionsUsed: occupiedTargetIds.size,
    peakOccupiedSleepSlots,
    hygieneFixtures: {
      toilets: state.moduleInstances.filter((module) => module.type === ModuleType.Toilet).length,
      showers: state.moduleInstances.filter((module) => module.type === ModuleType.Shower).length,
      sinks: state.moduleInstances.filter((module) => module.type === ModuleType.Sink).length,
      washBanks: state.moduleInstances.filter((module) => module.type === ModuleType.WashBank).length
    },
    peakToiletingCrew,
    minimumEnergyAfterWarmup: Number(minimumEnergyAfterWarmup.toFixed(2)),
    minimumEnergyObservation,
    finalMinimumEnergy: Number(finalMinimumEnergy.toFixed(2)),
    minimumSampledPowerMarginPct: Number(((sampledPowerRatioMin - 1) * 100).toFixed(1)),
    peakNoFixtureSleepWaiters,
    peakResignationNotices,
    deaths,
    peakCrewOnUnpressurizedInterior,
    peakBerthVacuumWorkers,
    minimumPressurizedInteriorPct: Number((minimumPressurizedInteriorShare * 100).toFixed(2)),
    restBucketMismatches
  };
}

function main(): void {
  const scenarios: Array<[ScenarioName, number]> = [
    ['normal-scale-50', 915_550],
    ['normal-scale-50-spine', 915_551]
  ];
  const requested = process.argv[2];
  if (requested !== undefined) {
    assert(
      scenarios.some(([scenario]) => scenario === requested),
      `unknown scenario argument ${requested}`
    );
  }
  const inspections = scenarios
    .filter(([scenario]) => requested === undefined || scenario === requested)
    .map(([scenario, seed]) => inspectAuthoredHousing(scenario, seed));

  // Keep the static gate first so a future capacity regression reports in
  // seconds rather than spending minutes simulating an invalid station.
  assertAuthoredCapacity(inspections);

  const reports = inspections.map(runLongHorizon);
  process.stdout.write(`${JSON.stringify({
    claim: 'both authored 50-crew station shapes sustain real, reachable crew sleep for 900 production-cadence seconds',
    reports
  }, null, 2)}\n`);
}

main();
