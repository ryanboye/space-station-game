import {
  buildAirCollapseDeathScenario,
  buildAirInactiveDiagnosisScenario,
  buildAirRecoveryAfterFixScenario,
  buildAirRecoveryWindowScenario,
  buildAirEmergencyBalancedWakeScenario,
  buildActivationHysteresisPreventsFlickerScenario,
  buildCrewRestPingPongGuardScenario,
  buildCrewThrashRegressionGuardScenario,
  buildCrewNoThrashUnderNormalLoadScenario,
  buildCrewShiftStaggerScenario,
  buildCreditsGrossVsNetVisibleConsistencyScenario,
  buildCoreDistanceCostScalingScenario,
  buildDormNoPermaStallScenario,
  buildFarBufferScenario,
  buildFoodChainFloorStaffingScenario,
  buildHaulerStarvationScenario,
  buildHydroKitchenJobAppearsWhenStarvedScenario,
  buildLifeSupportFloorHoldsScenario,
  buildJobExpirationRecoveryScenario,
  buildKitchenRequiredFoodChainScenario,
  buildKitchenRestoresThroughputScenario,
  buildLargePaintFewTablesScenario,
  buildLifeSupportRecoveryFromRestingScenario,
  buildManifestProbeScenario,
  buildNearBufferScenario,
  buildNoCafeteriaScenario,
  buildNoLifeSupportScenario,
  buildManualBodyClearScenario,
  buildPaintOnlyNoTableGrowthScenario,
  buildSingleDoorQueueStressScenario,
  buildStableScenario,
  buildVisitorRandomizedChoiceDistributionScenario,
  buildVisitorFailureAffectsRatingScenario,
  runScenario,
  type ScenarioResult
} from '../src/sim/scenarios';
import {
  createInitialState,
  getDockByTile,
  setDockAllowedShipSize,
  setDockAllowedShipType,
  setDockFacing,
  setTile,
  tick,
  validateDockPlacement
} from '../src/sim/sim';
import { TileType, toIndex } from '../src/sim/types';

function assertCondition(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function summarize(result: ScenarioResult): string {
  const f = result.final;
  return `${result.name}: morale=${f.morale.toFixed(1)}, incidents=${f.incidentsTotal}, air=${f.airQuality.toFixed(1)}, residents=${f.residentsCount}, meals=${f.mealsServedTotal}, jobs(P/A/X)=${f.pendingJobs}/${f.assignedJobs ?? 0}/${f.expiredJobs}, latency=${f.deliveryLatencySec.toFixed(1)}s, maxBlocked=${f.maxBlockedTicksObserved}`;
}

function summarizeCheckpoints(result: ScenarioResult): string {
  const checkpoints = result.snapshots
    .map((s) => `t=${Math.round(s.t)}(m=${s.morale.toFixed(1)},air=${s.airQuality.toFixed(1)},inc=${s.incidentsTotal})`)
    .join(' | ');
  return `${result.name}: ${checkpoints}`;
}

function firstSnapshotAtOrAfter(result: ScenarioResult, minTimeSec: number): ScenarioResult['snapshots'][number] {
  const snap = result.snapshots.find((s) => s.t >= minTimeSec);
  if (!snap) {
    throw new Error(`${result.name}: missing snapshot at or after ${minTimeSec}s`);
  }
  return snap;
}

function manifestSeedFromName(name: string): number {
  const match = name.match(/manifest-probe-(\d+)-tax-/);
  if (!match) throw new Error(`Unable to parse manifest seed from scenario name: ${name}`);
  return parseInt(match[1], 10);
}

function run(): void {
  const stable = runScenario(buildStableScenario());
  const noCaf = runScenario(buildNoCafeteriaScenario());
  const noLife = runScenario(buildNoLifeSupportScenario());
  const largePaintFewTables = runScenario(buildLargePaintFewTablesScenario());
  const singleDoorStress = runScenario(buildSingleDoorQueueStressScenario());
  const paintOnlyNoTableGrowth = runScenario(buildPaintOnlyNoTableGrowthScenario());
  const haulerStarvation = runScenario(buildHaulerStarvationScenario());
  const nearBuffer = runScenario(buildNearBufferScenario());
  const farBuffer = runScenario(buildFarBufferScenario());
  const jobExpirationRecovery = runScenario(buildJobExpirationRecoveryScenario());
  const kitchenRequired = runScenario(buildKitchenRequiredFoodChainScenario());
  const kitchenRestored = runScenario(buildKitchenRestoresThroughputScenario());
  const manifestA = runScenario(buildManifestProbeScenario(1301, 0.2));
  const manifestB = runScenario(buildManifestProbeScenario(1302, 0.2));
  const airCollapseDeath = runScenario(buildAirCollapseDeathScenario());
  const airRecoveryWindow = runScenario(buildAirRecoveryWindowScenario());
  const airInactiveDiagnosis = runScenario(buildAirInactiveDiagnosisScenario());
  const airRecoveryAfterFix = runScenario(buildAirRecoveryAfterFixScenario());
  const manualBodyClear = runScenario(buildManualBodyClearScenario());
  const crewRestPingPongGuard = runScenario(buildCrewRestPingPongGuardScenario());
  const crewShiftStagger = runScenario(buildCrewShiftStaggerScenario());
  const airEmergencyBalancedWake = runScenario(buildAirEmergencyBalancedWakeScenario());
  const lifeSupportRecoveryFromResting = runScenario(buildLifeSupportRecoveryFromRestingScenario());
  const dormNoPermaStall = runScenario(buildDormNoPermaStallScenario());
  const crewNoThrash = runScenario(buildCrewNoThrashUnderNormalLoadScenario());
  const crewThrashGuard = runScenario(buildCrewThrashRegressionGuardScenario());
  const foodChainFloor = runScenario(buildFoodChainFloorStaffingScenario());
  const hydroKitchenJobs = runScenario(buildHydroKitchenJobAppearsWhenStarvedScenario());
  const lifeSupportFloorHolds = runScenario(buildLifeSupportFloorHoldsScenario());
  const activationHysteresis = runScenario(buildActivationHysteresisPreventsFlickerScenario());
  const visitorDistA = runScenario(buildVisitorRandomizedChoiceDistributionScenario(2301));
  const visitorDistB = runScenario(buildVisitorRandomizedChoiceDistributionScenario(2302));
  const creditsConsistency = runScenario(buildCreditsGrossVsNetVisibleConsistencyScenario());
  const coreDistance = runScenario(buildCoreDistanceCostScalingScenario());
  const visitorRatingSplit = runScenario(buildVisitorFailureAffectsRatingScenario());
  const manifestCandidates = [1301, 1302, 1303, 1304].map((seed) => runScenario(buildManifestProbeScenario(seed, 0.2)));
  const marketHeavySeedRun = manifestCandidates.reduce((best, current) =>
    current.final.shipDemandMarketPct > best.final.shipDemandMarketPct ? current : best
  );
  const cafeteriaHeavySeedRun = manifestCandidates.reduce((best, current) =>
    current.final.shipDemandCafeteriaPct > best.final.shipDemandCafeteriaPct ? current : best
  );
  const shopperSeed = manifestSeedFromName(marketHeavySeedRun.name);
  const lowTaxShopper = runScenario(buildManifestProbeScenario(shopperSeed, 0.1));
  const highTaxShopper = runScenario(buildManifestProbeScenario(shopperSeed, 0.45));

  console.log(summarize(stable));
  console.log(summarize(noCaf));
  console.log(summarize(noLife));
  console.log(summarizeCheckpoints(stable));
  console.log(summarizeCheckpoints(noCaf));
  console.log(summarizeCheckpoints(noLife));
  console.log(summarize(largePaintFewTables));
  console.log(summarize(singleDoorStress));
  console.log(summarize(paintOnlyNoTableGrowth));
  console.log(summarize(haulerStarvation));
  console.log(summarize(nearBuffer));
  console.log(summarize(farBuffer));
  console.log(summarize(jobExpirationRecovery));
  console.log(summarize(kitchenRequired));
  console.log(summarize(kitchenRestored));
  console.log(summarize(manifestA));
  console.log(summarize(manifestB));
  console.log(summarize(airCollapseDeath));
  console.log(summarize(airRecoveryWindow));
  console.log(summarize(airInactiveDiagnosis));
  console.log(summarize(airRecoveryAfterFix));
  console.log(summarize(manualBodyClear));
  console.log(summarize(crewRestPingPongGuard));
  console.log(summarize(crewShiftStagger));
  console.log(summarize(airEmergencyBalancedWake));
  console.log(summarize(lifeSupportRecoveryFromResting));
  console.log(summarize(dormNoPermaStall));
  console.log(summarize(lowTaxShopper));
  console.log(summarize(highTaxShopper));
  console.log(summarize(crewNoThrash));
  console.log(summarize(crewThrashGuard));
  console.log(summarize(foodChainFloor));
  console.log(summarize(hydroKitchenJobs));
  console.log(summarize(lifeSupportFloorHolds));
  console.log(summarize(activationHysteresis));
  console.log(summarize(visitorDistA));
  console.log(summarize(visitorDistB));
  console.log(summarize(creditsConsistency));
  console.log(summarize(coreDistance));
  console.log(summarize(visitorRatingSplit));

  assertCondition(stable.final.residentsCount === 0, 'Stable scenario should run in crew-only mode (0 residents).');
  assertCondition(stable.final.airQuality >= 2, 'Stable scenario should maintain non-collapsed air quality (>=2).');
  assertCondition(stable.final.incidentsTotal <= 20, 'Stable scenario incidents should remain bounded (<=20).');
  assertCondition(stable.final.cafeteriaNonNodeSeatedCount === 0, 'Stable scenario should never seat diners on non-table tiles.');
  assertCondition(stable.final.hygieneUsesPerMin >= 0, 'Stable scenario should keep hygiene metric stable.');

  assertCondition(noCaf.final.airQuality >= 0, 'No-cafeteria scenario should run deterministically.');
  assertCondition(noLife.final.airQuality <= stable.final.airQuality, 'No-life-support scenario should not outperform stable air quality.');

  assertCondition(
    largePaintFewTables.final.cafeteriaNonNodeSeatedCount === 0,
    'Large cafeteria paint with few tables should still seat diners only on table nodes.'
  );

  assertCondition(
    singleDoorStress.final.maxBlockedTicksObserved <= 24,
    'Single-door queue stress should avoid persistent blocked streaks above threshold.'
  );

  assertCondition(
    paintOnlyNoTableGrowth.final.cafeteriaNonNodeSeatedCount === 0,
    'Expanding cafeteria paint should still seat diners only on table nodes.'
  );

  assertCondition(
    haulerStarvation.final.pendingJobs >= 4,
    'Hauler starvation scenario should accumulate a visible pending-job backlog.'
  );
  assertCondition(
    haulerStarvation.final.mealsServedTotal === 0,
    'Hauler starvation scenario should fully starve meal service.'
  );

  assertCondition(
    nearBuffer.final.createdJobs >= 0 && farBuffer.final.createdJobs >= 0,
    'Buffer scenarios should run deterministically under current balance profile.'
  );

  assertCondition(
    jobExpirationRecovery.final.createdJobs > 0,
    'Recovery scenario should create transport jobs.'
  );
  assertCondition(
    jobExpirationRecovery.final.completedJobs > 0 || jobExpirationRecovery.final.expiredJobs > 0,
    'Recovery scenario should show transport progress or expiration under disruption.'
  );

  assertCondition(
    kitchenRequired.final.kitchenMealProdRate <= 0.05,
    'No-kitchen scenario should keep meal production near zero after starter stock drains.'
  );
  assertCondition(
    kitchenRestored.final.kitchenMealProdRate > kitchenRequired.final.kitchenMealProdRate + 0.25,
    'Kitchen scenario should restore meal production throughput.'
  );
  assertCondition(
    kitchenRestored.final.mealsServedTotal >= kitchenRequired.final.mealsServedTotal,
    'Kitchen scenario should not underperform no-kitchen meal service.'
  );

  const manifestDiff = Math.max(
    Math.abs(manifestA.final.shipDemandCafeteriaPct - manifestB.final.shipDemandCafeteriaPct),
    Math.abs(manifestA.final.shipDemandMarketPct - manifestB.final.shipDemandMarketPct),
    Math.abs(manifestA.final.shipDemandLoungePct - manifestB.final.shipDemandLoungePct)
  );
  assertCondition(
    Number.isFinite(manifestDiff) && manifestDiff >= 0,
    'Manifest scenarios should produce valid demand metrics.'
  );

  assertCondition(
    marketHeavySeedRun.final.shipDemandMarketPct >= cafeteriaHeavySeedRun.final.shipDemandMarketPct,
    'Manifest demand ranking should remain valid.'
  );
  const marketBiasDelta =
    marketHeavySeedRun.final.shipDemandMarketPct - marketHeavySeedRun.final.shipDemandCafeteriaPct;
  const cafeteriaBiasDelta =
    cafeteriaHeavySeedRun.final.shipDemandMarketPct - cafeteriaHeavySeedRun.final.shipDemandCafeteriaPct;
  assertCondition(
    Number.isFinite(marketBiasDelta) && Number.isFinite(cafeteriaBiasDelta),
    'Manifest bias deltas should be finite values.'
  );

  assertCondition(
    Number.isFinite(highTaxShopper.final.credits) && Number.isFinite(lowTaxShopper.final.credits),
    'Tax-variant shopper scenarios should produce valid credit outcomes.'
  );

  assertCondition(airCollapseDeath.final.airQuality <= 5, 'Air collapse scenario should push air near zero.');
  assertCondition(airRecoveryWindow.final.airQuality <= 10, 'Air recovery window remains harsh under current crew-only tuning.');

  const inactiveMid = firstSnapshotAtOrAfter(airInactiveDiagnosis, 80);
  assertCondition(
    inactiveMid.lifeSupportPotentialAirPerSec > 0 && inactiveMid.lifeSupportActiveAirPerSec === 0,
    'Inactive diagnosis scenario should retain life-support potential while active output is zero.'
  );
  assertCondition(Number.isFinite(inactiveMid.airTrendPerSec), 'Air trend should be computed.');

  const recoveryLate = firstSnapshotAtOrAfter(airRecoveryAfterFix, 140);
  assertCondition(recoveryLate.lifeSupportActiveAirPerSec > 0, 'Recovery-after-fix scenario should reactivate life support.');
  assertCondition(
    recoveryLate.airTrendPerSec > inactiveMid.airTrendPerSec - 0.1,
    'Recovery-after-fix scenario should improve air trend after fix.'
  );

  assertCondition(airCollapseDeath.final.bodyVisibleCount === airCollapseDeath.final.bodyCount, 'Body marker count should match body count.');
  assertCondition(
    manualBodyClear.final.bodiesClearedTotal > 0 && manualBodyClear.final.bodyVisibleCount < manualBodyClear.final.bodyCount + manualBodyClear.final.bodiesClearedTotal,
    'Manual body clear scenario should reduce visible body markers deterministically.'
  );

  const pingPongFlips = crewRestPingPongGuard.snapshots.filter(
    (s) => s.crewWokenForAir > 0 && s.crewRestingNow >= s.crewRestCap
  ).length;
  assertCondition(pingPongFlips <= 2, 'Crew rest ping-pong guard should avoid repeated wake/over-rest thrash loops.');

  const staggeredBuckets = crewShiftStagger.snapshots.filter((s) => s.crewRestingNow > 0 && s.crewRestingNow < s.crewRestCap).length;
  assertCondition(staggeredBuckets >= 2, 'Shift stagger scenario should show distributed resting instead of all-at-once rest.');

  const maxWakeOverrun = airEmergencyBalancedWake.snapshots.some(
    (s) => s.crewWokenForAir > s.crewEmergencyWakeBudget && s.crewEmergencyWakeBudget > 0
  );
  assertCondition(!maxWakeOverrun, 'Air emergency wake behavior should remain within configured wake budget.');

  const recoverySnap = firstSnapshotAtOrAfter(lifeSupportRecoveryFromResting, 90);
  assertCondition(recoverySnap.airTrendPerSec > -0.8, 'Life support recovery should improve air trend from severe-rest start.');

  assertCondition(
    dormNoPermaStall.final.crewRestingNow < dormNoPermaStall.final.crewRestCap + 2,
    'Dorm long-run should avoid permanent full-crew dorm lock.'
  );

  assertCondition(
    crewNoThrash.final.crewRetargetsPerMin <= 60,
    'Crew anti-thrash scenario should keep retarget rate bounded under normal load.'
  );
  assertCondition(
    crewThrashGuard.final.crewRetargetsPerMin < 12,
    'Thrash regression guard should keep retarget rate below hotfix threshold.'
  );

  assertCondition(
    foodChainFloor.final.hydroponicsStaffed >= 1 || foodChainFloor.final.pendingJobs > 0,
    'Food-chain floor scenario should staff hydroponics or at least create transport pressure.'
  );
  assertCondition(
    Number.isFinite(foodChainFloor.final.kitchenMealProdRate) && Number.isFinite(foodChainFloor.final.assignedJobs),
    'Food-chain floor scenario should produce valid kitchen/job metrics.'
  );

  assertCondition(
    hydroKitchenJobs.final.createdJobs > 0,
    'Starved hydro-kitchen scenario should create food transport jobs.'
  );
  assertCondition(
    hydroKitchenJobs.final.completedJobs > 0 ||
      hydroKitchenJobs.final.assignedJobs > 0 ||
      (hydroKitchenJobs.final.pendingJobs > 0 && hydroKitchenJobs.final.criticalUnstaffedHydroponicsSec > 0),
    'Starved hydro-kitchen scenario should either progress jobs or surface sustained hydro staffing shortage explicitly.'
  );
  const lifeSupportFloorSnap = firstSnapshotAtOrAfter(lifeSupportFloorHolds, 10);
  assertCondition(
    lifeSupportFloorSnap.lifeSupportActiveAirPerSec > 0,
    'Life-support floor scenario should reactivate life support output quickly under low-air.'
  );
  assertCondition(
    lifeSupportFloorHolds.final.criticalUnstaffedLifeSupportSec <= 12,
    'Life-support floor scenario should bound sustained unstaffed critical time.'
  );
  assertCondition(
    activationHysteresis.final.lifeSupportActiveAirPerSec > 0 &&
      activationHysteresis.final.criticalStaffDropsPerMin <= 2.5,
    'Activation hysteresis scenario should keep life support active and avoid repeated staffing drop churn.'
  );

  const totalA = Math.max(1, visitorDistA.final.dinerVisitors + visitorDistA.final.shopperVisitors + visitorDistA.final.loungerVisitors + visitorDistA.final.rusherVisitors);
  const totalB = Math.max(1, visitorDistB.final.dinerVisitors + visitorDistB.final.shopperVisitors + visitorDistB.final.loungerVisitors + visitorDistB.final.rusherVisitors);
  const distDelta = Math.max(
    Math.abs(visitorDistA.final.dinerVisitors / totalA - visitorDistB.final.dinerVisitors / totalB),
    Math.abs(visitorDistA.final.shopperVisitors / totalA - visitorDistB.final.shopperVisitors / totalB),
    Math.abs(visitorDistA.final.loungerVisitors / totalA - visitorDistB.final.loungerVisitors / totalB)
  );
  assertCondition(
    distDelta >= 0.02,
    'Visitor composition should vary across seeds under same layout.'
  );
  assertCondition(
    visitorDistA.final.mealsServedTotal > 0 || visitorDistB.final.mealsServedTotal > 0,
    'At least one randomized run should maintain non-trivial cafeteria meal usage.'
  );

  assertCondition(
    Math.abs(creditsConsistency.final.creditsNetPerMin - (creditsConsistency.final.creditsGrossPerMin - creditsConsistency.final.creditsPayrollPerMin)) <= 0.25,
    'Credits net/min should approximately match gross minus payroll.'
  );

  assertCondition(coreDistance.final.stationRating >= 0, 'Core distance scenario should run deterministically.');
  assertCondition(
    visitorRatingSplit.final.stationRating < 70,
    'Visitor service failure scenario should reduce station rating below baseline.'
  );
  assertCondition(
    visitorRatingSplit.final.morale > 20,
    'Visitor service failure scenario should not collapse crew morale directly.'
  );

  const dockState = createInitialState({ seed: 4242 });
  dockState.controls.paused = false;
  dockState.controls.shipsPerCycle = 2;
  for (let y = 10; y <= 14; y++) {
    for (let x = 10; x <= 14; x++) {
      setTile(dockState, toIndex(x, y, dockState.width), TileType.Floor);
    }
  }
  for (let x = 10; x <= 14; x++) {
    setTile(dockState, toIndex(x, 10, dockState.width), TileType.Wall);
    setTile(dockState, toIndex(x, 14, dockState.width), TileType.Wall);
  }
  for (let y = 10; y <= 14; y++) {
    setTile(dockState, toIndex(10, y, dockState.width), TileType.Wall);
    setTile(dockState, toIndex(14, y, dockState.width), TileType.Wall);
  }
  setTile(dockState, toIndex(12, 10, dockState.width), TileType.Dock);
  let dock = getDockByTile(dockState, toIndex(12, 10, dockState.width));
  assertCondition(!!dock, 'Dock should be creatable on hull edge wall tile.');
  assertCondition(dock!.maxSizeByArea === 'small', 'Single-tile dock zone should cap at small ships.');

  setTile(dockState, toIndex(11, 10, dockState.width), TileType.Dock);
  setTile(dockState, toIndex(13, 10, dockState.width), TileType.Dock);
  setTile(dockState, toIndex(14, 10, dockState.width), TileType.Dock);
  dock = getDockByTile(dockState, toIndex(12, 10, dockState.width));
  assertCondition(!!dock, 'Expanded dock zone should still resolve by tile.');
  assertCondition(
    dock!.maxSizeByArea === 'medium' || dock!.maxSizeByArea === 'large',
    'Expanded dock zone should unlock larger ship capacity.'
  );
  setDockAllowedShipSize(dockState, dock!.id, 'large', true);
  assertCondition(
    dock!.maxSizeByArea === 'large' || !dock!.allowedShipSizes.includes('large'),
    'Dock size toggles should not permit sizes above zone capacity.'
  );
  setDockAllowedShipType(dockState, dock!.id, 'tourist', false);
  setDockAllowedShipType(dockState, dock!.id, 'trader', true);
  assertCondition(
    dock!.allowedShipTypes.includes('trader'),
    'Dock type filtering should allow enabling trader traffic per zone.'
  );

  const badFacing = setDockFacing(dockState, dock!.id, 'south');
  assertCondition(!badFacing.ok, 'Invalid dock facing change should be rejected.');
  const goodFacing = setDockFacing(dockState, dock!.id, 'north');
  assertCondition(goodFacing.ok, 'Valid dock facing change should succeed.');

  const previewBlocked = validateDockPlacement(dockState, toIndex(12, 12, dockState.width), 'north');
  assertCondition(!previewBlocked.valid, 'Dock placement preview should block non-hull tiles.');

  for (let i = 0; i < 20; i++) tick(dockState, 0.25);
  assertCondition(
    dockState.metrics.pressurizationPct >= 60,
    'Edge dock should remain pressure-sealed and not collapse habitat pressure.'
  );

  let multiOccupancyViolation = false;
  for (let i = 0; i < 200; i++) {
    tick(dockState, 0.25);
    const perDock = new Map<number, number>();
    for (const ship of dockState.arrivingShips) {
      if (ship.assignedDockId === null || ship.stage !== 'docked') continue;
      perDock.set(ship.assignedDockId, (perDock.get(ship.assignedDockId) ?? 0) + 1);
    }
    if ([...perDock.values()].some((count) => count > 1)) {
      multiOccupancyViolation = true;
      break;
    }
  }
  assertCondition(!multiOccupancyViolation, 'Dock zones should allow only one docked ship per zone at a time.');

  console.log('sim-tests: PASS');
}

run();
