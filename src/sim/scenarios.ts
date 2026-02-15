import {
  clearBodies,
  createInitialState,
  getDockByTile,
  setDockAllowedShipType,
  setModule,
  setRoom,
  setTile,
  tick,
  trySetTile
} from './sim';
import { ModuleType, RoomType, TileType, toIndex, type StationState } from './types';

export interface ScenarioResult {
  name: string;
    snapshots: Array<{
      t: number;
      morale: number;
      stationRating: number;
    incidentsTotal: number;
    airQuality: number;
    residentsCount: number;
    visitorsCount: number;
      credits: number;
    creditsGrossPerMin: number;
    creditsPayrollPerMin: number;
    creditsNetPerMin: number;
    mealsServedTotal: number;
    maxBlockedTicksObserved: number;
    pendingJobs: number;
    assignedJobs: number;
    expiredJobs: number;
    completedJobs: number;
    avgJobAgeSec: number;
    deliveryLatencySec: number;
    oldestPendingJobAgeSec: number;
    stalledJobs: number;
    distressedResidents: number;
    criticalResidents: number;
    deathsTotal: number;
    dormVisitsPerMin: number;
    hygieneUsesPerMin: number;
    mealsConsumedPerMin: number;
    kitchenRawBuffer: number;
    kitchenMealProdRate: number;
    workshopTradeGoodProdRate: number;
    marketTradeGoodUseRate: number;
    marketTradeGoodStock: number;
    tradeGoodsSoldPerMin: number;
    marketStockoutsPerMin: number;
    lifeSupportPotentialAirPerSec: number;
    lifeSupportActiveAirPerSec: number;
    airTrendPerSec: number;
    shipDemandCafeteriaPct: number;
    shipDemandMarketPct: number;
    shipDemandLoungePct: number;
    dinerVisitors: number;
    shopperVisitors: number;
    loungerVisitors: number;
    rusherVisitors: number;
    bodyVisibleCount: number;
    bodyCount: number;
    bodiesClearedTotal: number;
    crewRestCap: number;
    crewRestingNow: number;
    crewEmergencyWakeBudget: number;
    crewWokenForAir: number;
    crewPingPongPreventions: number;
    hydroponicsStaffed: number;
    crewRetargetsPerMin: number;
    criticalStaffDropsPerMin: number;
    visitorServiceFailuresPerMin: number;
    criticalUnstaffedLifeSupportSec: number;
    criticalUnstaffedHydroponicsSec: number;
    criticalUnstaffedKitchenSec: number;
    requiredCriticalStaff: {
      reactor: number;
      lifeSupport: number;
      hydroponics: number;
      kitchen: number;
      cafeteria: number;
    };
    assignedCriticalStaff: {
      reactor: number;
      lifeSupport: number;
      hydroponics: number;
      kitchen: number;
      cafeteria: number;
    };
    activeCriticalStaff: {
      reactor: number;
      lifeSupport: number;
      hydroponics: number;
      kitchen: number;
      cafeteria: number;
    };
    criticalShortfallSec: {
      reactor: number;
      lifeSupport: number;
      hydroponics: number;
      kitchen: number;
      cafeteria: number;
    };
    logisticsDispatchSlots: number;
    logisticsPressure: number;
    staffInTransitBySystem: {
      reactor: number;
      lifeSupport: number;
      hydroponics: number;
      kitchen: number;
      cafeteria: number;
    };
    visitorDestinationCafeteriaShare: number;
    visitorDestinationMarketShare: number;
    visitorDestinationLoungeShare: number;
    shipsByTypePerMin: {
      tourist: number;
      trader: number;
      industrial: number;
    };
  }>;
    final: {
      morale: number;
      stationRating: number;
    incidentsTotal: number;
    airQuality: number;
    residentsCount: number;
    visitorsCount: number;
      credits: number;
    creditsGrossPerMin: number;
    creditsPayrollPerMin: number;
    creditsNetPerMin: number;
    mealsServedTotal: number;
    maxBlockedTicksObserved: number;
    cafeteriaNonNodeSeatedCount: number;
    pendingJobs: number;
    assignedJobs: number;
    expiredJobs: number;
    createdJobs: number;
    completedJobs: number;
    avgJobAgeSec: number;
    deliveryLatencySec: number;
    oldestPendingJobAgeSec: number;
    stalledJobs: number;
    distressedResidents: number;
    criticalResidents: number;
    deathsTotal: number;
    dormVisitsPerMin: number;
    hygieneUsesPerMin: number;
    mealsConsumedPerMin: number;
    kitchenRawBuffer: number;
    kitchenMealProdRate: number;
    workshopTradeGoodProdRate: number;
    marketTradeGoodUseRate: number;
    marketTradeGoodStock: number;
    tradeGoodsSoldPerMin: number;
    marketStockoutsPerMin: number;
    lifeSupportPotentialAirPerSec: number;
    lifeSupportActiveAirPerSec: number;
    airTrendPerSec: number;
    shipDemandCafeteriaPct: number;
    shipDemandMarketPct: number;
    shipDemandLoungePct: number;
    dinerVisitors: number;
    shopperVisitors: number;
    loungerVisitors: number;
    rusherVisitors: number;
    bodyVisibleCount: number;
    bodyCount: number;
    bodiesClearedTotal: number;
    crewRestCap: number;
    crewRestingNow: number;
    crewEmergencyWakeBudget: number;
    crewWokenForAir: number;
    crewPingPongPreventions: number;
    hydroponicsStaffed: number;
    crewRetargetsPerMin: number;
    criticalStaffDropsPerMin: number;
    visitorServiceFailuresPerMin: number;
    criticalUnstaffedLifeSupportSec: number;
    criticalUnstaffedHydroponicsSec: number;
    criticalUnstaffedKitchenSec: number;
    requiredCriticalStaff: {
      reactor: number;
      lifeSupport: number;
      hydroponics: number;
      kitchen: number;
      cafeteria: number;
    };
    assignedCriticalStaff: {
      reactor: number;
      lifeSupport: number;
      hydroponics: number;
      kitchen: number;
      cafeteria: number;
    };
    activeCriticalStaff: {
      reactor: number;
      lifeSupport: number;
      hydroponics: number;
      kitchen: number;
      cafeteria: number;
    };
    criticalShortfallSec: {
      reactor: number;
      lifeSupport: number;
      hydroponics: number;
      kitchen: number;
      cafeteria: number;
    };
    logisticsDispatchSlots: number;
    logisticsPressure: number;
    staffInTransitBySystem: {
      reactor: number;
      lifeSupport: number;
      hydroponics: number;
      kitchen: number;
      cafeteria: number;
    };
    visitorDestinationCafeteriaShare: number;
    visitorDestinationMarketShare: number;
    visitorDestinationLoungeShare: number;
    shipsByTypePerMin: {
      tourist: number;
      trader: number;
      industrial: number;
    };
  };
}

export interface ScenarioSpec {
  name: string;
  seed: number;
  durationSec: number;
  stepSec: number;
  snapshotEverySec?: number;
  setup: (state: StationState) => void;
  onTick?: (state: StationState) => void;
}

function fillRect(state: StationState, x0: number, y0: number, x1: number, y1: number, tile: TileType): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      setTile(state, toIndex(x, y, state.width), tile);
    }
  }
}

function roomRect(state: StationState, x0: number, y0: number, x1: number, y1: number, room: RoomType): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      setRoom(state, toIndex(x, y, state.width), room);
    }
  }
}

function addDoor(state: StationState, x: number, y: number): void {
  setTile(state, toIndex(x, y, state.width), TileType.Door);
}

function addDock(state: StationState): void {
  setTile(state, toIndex(16, 28, state.width), TileType.Dock);
  setTile(state, toIndex(17, 28, state.width), TileType.Dock);
  setTile(state, toIndex(16, 29, state.width), TileType.Dock);
  setTile(state, toIndex(17, 29, state.width), TileType.Dock);
}

function buildBaseStation(state: StationState): void {
  // Build a compact sealed habitat to keep this scenario deterministic.
  fillRect(state, 20, 10, 39, 29, TileType.Space);
  fillRect(state, 20, 12, 34, 26, TileType.Floor);
  fillRect(state, 20, 12, 34, 12, TileType.Wall);
  fillRect(state, 20, 26, 34, 26, TileType.Wall);
  fillRect(state, 20, 12, 20, 26, TileType.Wall);
  fillRect(state, 34, 12, 34, 26, TileType.Wall);

  addDoor(state, 22, 14);
  addDoor(state, 24, 14);
  addDoor(state, 26, 14);
  addDoor(state, 28, 14);
  addDoor(state, 30, 14);
  addDoor(state, 22, 17);
  addDoor(state, 24, 17);

  setTile(state, toIndex(22, 24, state.width), TileType.Dock);
  setTile(state, toIndex(23, 24, state.width), TileType.Dock);

  setRoom(state, toIndex(22, 13, state.width), RoomType.Reactor);
  setRoom(state, toIndex(24, 13, state.width), RoomType.LifeSupport);
  setRoom(state, toIndex(26, 13, state.width), RoomType.Hydroponics);
  setRoom(state, toIndex(28, 13, state.width), RoomType.Cafeteria);
  setRoom(state, toIndex(30, 13, state.width), RoomType.Security);
  setRoom(state, toIndex(22, 15, state.width), RoomType.Dorm);
  setRoom(state, toIndex(23, 15, state.width), RoomType.Dorm);
  setRoom(state, toIndex(22, 16, state.width), RoomType.Dorm);
  setRoom(state, toIndex(23, 16, state.width), RoomType.Dorm);
  setRoom(state, toIndex(24, 15, state.width), RoomType.Hygiene);
  setRoom(state, toIndex(24, 16, state.width), RoomType.Kitchen);
  setRoom(state, toIndex(29, 16, state.width), RoomType.Lounge);
  setRoom(state, toIndex(30, 16, state.width), RoomType.Market);
  setModule(state, toIndex(28, 13, state.width), ModuleType.Table);
  setModule(state, toIndex(24, 16, state.width), ModuleType.Stove);
  setModule(state, toIndex(26, 13, state.width), ModuleType.GrowTray);
  setModule(state, toIndex(30, 13, state.width), ModuleType.Terminal);
  setModule(state, toIndex(22, 15, state.width), ModuleType.Bed);
  setModule(state, toIndex(23, 15, state.width), ModuleType.Bed);
  setModule(state, toIndex(22, 16, state.width), ModuleType.Bed);
  setModule(state, toIndex(23, 16, state.width), ModuleType.Bed);

  state.controls.paused = false;
  state.controls.simSpeed = 1;
  state.controls.shipsPerCycle = 0;
  state.crew.total = 16;
}

export function runScenario(spec: ScenarioSpec): ScenarioResult {
  const state = createInitialState({ seed: spec.seed });
  spec.setup(state);
  const snapshots: ScenarioResult['snapshots'] = [];
  const sampleInterval = spec.snapshotEverySec ?? 20;
  let nextSnapshotAt = sampleInterval;
  const steps = Math.ceil(spec.durationSec / spec.stepSec);

  for (let i = 0; i < steps; i++) {
    tick(state, spec.stepSec);
    spec.onTick?.(state);
    if (state.now + 1e-9 < nextSnapshotAt) continue;
    snapshots.push({
      t: state.now,
      morale: state.metrics.morale,
      stationRating: state.metrics.stationRating,
      incidentsTotal: state.metrics.incidentsTotal,
      airQuality: state.metrics.airQuality,
      residentsCount: state.metrics.residentsCount,
      visitorsCount: state.metrics.visitorsCount,
      credits: state.metrics.credits,
      creditsGrossPerMin: state.metrics.creditsGrossPerMin,
      creditsPayrollPerMin: state.metrics.creditsPayrollPerMin,
      creditsNetPerMin: state.metrics.creditsNetPerMin,
      mealsServedTotal: state.metrics.mealsServedTotal,
      maxBlockedTicksObserved: state.metrics.maxBlockedTicksObserved,
      pendingJobs: state.metrics.pendingJobs,
      assignedJobs: state.metrics.assignedJobs,
      expiredJobs: state.metrics.expiredJobs,
      completedJobs: state.metrics.completedJobs,
      avgJobAgeSec: state.metrics.avgJobAgeSec,
      deliveryLatencySec: state.metrics.deliveryLatencySec,
      oldestPendingJobAgeSec: state.metrics.oldestPendingJobAgeSec,
      stalledJobs: state.metrics.stalledJobs,
      distressedResidents: state.metrics.distressedResidents,
      criticalResidents: state.metrics.criticalResidents,
      deathsTotal: state.metrics.deathsTotal,
      dormVisitsPerMin: state.metrics.dormVisitsPerMin,
      hygieneUsesPerMin: state.metrics.hygieneUsesPerMin,
      mealsConsumedPerMin: state.metrics.mealsConsumedPerMin,
      kitchenRawBuffer: state.metrics.kitchenRawBuffer,
      kitchenMealProdRate: state.metrics.kitchenMealProdRate,
      workshopTradeGoodProdRate: state.metrics.workshopTradeGoodProdRate,
      marketTradeGoodUseRate: state.metrics.marketTradeGoodUseRate,
      marketTradeGoodStock: state.metrics.marketTradeGoodStock,
      tradeGoodsSoldPerMin: state.metrics.tradeGoodsSoldPerMin,
      marketStockoutsPerMin: state.metrics.marketStockoutsPerMin,
      lifeSupportPotentialAirPerSec: state.metrics.lifeSupportPotentialAirPerSec,
      lifeSupportActiveAirPerSec: state.metrics.lifeSupportActiveAirPerSec,
      airTrendPerSec: state.metrics.airTrendPerSec,
      shipDemandCafeteriaPct: state.metrics.shipDemandCafeteriaPct,
      shipDemandMarketPct: state.metrics.shipDemandMarketPct,
      shipDemandLoungePct: state.metrics.shipDemandLoungePct,
      dinerVisitors: state.metrics.visitorsByArchetype.diner,
      shopperVisitors: state.metrics.visitorsByArchetype.shopper,
      loungerVisitors: state.metrics.visitorsByArchetype.lounger,
      rusherVisitors: state.metrics.visitorsByArchetype.rusher,
      bodyVisibleCount: state.metrics.bodyVisibleCount,
      bodyCount: state.metrics.bodyCount,
      bodiesClearedTotal: state.metrics.bodiesClearedTotal,
      crewRestCap: state.metrics.crewRestCap,
      crewRestingNow: state.metrics.crewRestingNow,
      crewEmergencyWakeBudget: state.metrics.crewEmergencyWakeBudget,
      crewWokenForAir: state.metrics.crewWokenForAir,
      crewPingPongPreventions: state.metrics.crewPingPongPreventions,
      hydroponicsStaffed: state.metrics.hydroponicsStaffed,
      crewRetargetsPerMin: state.metrics.crewRetargetsPerMin,
      criticalStaffDropsPerMin: state.metrics.criticalStaffDropsPerMin,
      visitorServiceFailuresPerMin: state.metrics.visitorServiceFailuresPerMin,
      criticalUnstaffedLifeSupportSec: state.metrics.criticalUnstaffedSec.lifeSupport,
      criticalUnstaffedHydroponicsSec: state.metrics.criticalUnstaffedSec.hydroponics,
      criticalUnstaffedKitchenSec: state.metrics.criticalUnstaffedSec.kitchen,
      requiredCriticalStaff: state.metrics.requiredCriticalStaff,
      assignedCriticalStaff: state.metrics.assignedCriticalStaff,
      activeCriticalStaff: state.metrics.activeCriticalStaff,
      criticalShortfallSec: state.metrics.criticalShortfallSec,
      logisticsDispatchSlots: state.metrics.logisticsDispatchSlots,
      logisticsPressure: state.metrics.logisticsPressure,
      staffInTransitBySystem: state.metrics.staffInTransitBySystem,
      visitorDestinationCafeteriaShare: state.metrics.visitorDestinationShares.cafeteria,
      visitorDestinationMarketShare: state.metrics.visitorDestinationShares.market,
      visitorDestinationLoungeShare: state.metrics.visitorDestinationShares.lounge,
      shipsByTypePerMin: state.metrics.shipsByTypePerMin
    });
    nextSnapshotAt += sampleInterval;
  }

  return {
    name: spec.name,
    snapshots,
    final: {
      morale: state.metrics.morale,
      stationRating: state.metrics.stationRating,
      incidentsTotal: state.metrics.incidentsTotal,
      airQuality: state.metrics.airQuality,
      residentsCount: state.metrics.residentsCount,
      visitorsCount: state.metrics.visitorsCount,
      credits: state.metrics.credits,
      creditsGrossPerMin: state.metrics.creditsGrossPerMin,
      creditsPayrollPerMin: state.metrics.creditsPayrollPerMin,
      creditsNetPerMin: state.metrics.creditsNetPerMin,
      mealsServedTotal: state.metrics.mealsServedTotal,
      maxBlockedTicksObserved: state.metrics.maxBlockedTicksObserved,
      cafeteriaNonNodeSeatedCount: state.metrics.cafeteriaNonNodeSeatedCount,
      pendingJobs: state.metrics.pendingJobs,
      assignedJobs: state.metrics.assignedJobs,
      expiredJobs: state.metrics.expiredJobs,
      createdJobs: state.metrics.createdJobs,
      completedJobs: state.metrics.completedJobs,
      avgJobAgeSec: state.metrics.avgJobAgeSec,
      deliveryLatencySec: state.metrics.deliveryLatencySec,
      oldestPendingJobAgeSec: state.metrics.oldestPendingJobAgeSec,
      stalledJobs: state.metrics.stalledJobs,
      distressedResidents: state.metrics.distressedResidents,
      criticalResidents: state.metrics.criticalResidents,
      deathsTotal: state.metrics.deathsTotal,
      dormVisitsPerMin: state.metrics.dormVisitsPerMin,
      hygieneUsesPerMin: state.metrics.hygieneUsesPerMin,
      mealsConsumedPerMin: state.metrics.mealsConsumedPerMin,
      kitchenRawBuffer: state.metrics.kitchenRawBuffer,
      kitchenMealProdRate: state.metrics.kitchenMealProdRate,
      workshopTradeGoodProdRate: state.metrics.workshopTradeGoodProdRate,
      marketTradeGoodUseRate: state.metrics.marketTradeGoodUseRate,
      marketTradeGoodStock: state.metrics.marketTradeGoodStock,
      tradeGoodsSoldPerMin: state.metrics.tradeGoodsSoldPerMin,
      marketStockoutsPerMin: state.metrics.marketStockoutsPerMin,
      lifeSupportPotentialAirPerSec: state.metrics.lifeSupportPotentialAirPerSec,
      lifeSupportActiveAirPerSec: state.metrics.lifeSupportActiveAirPerSec,
      airTrendPerSec: state.metrics.airTrendPerSec,
      shipDemandCafeteriaPct: state.metrics.shipDemandCafeteriaPct,
      shipDemandMarketPct: state.metrics.shipDemandMarketPct,
      shipDemandLoungePct: state.metrics.shipDemandLoungePct,
      dinerVisitors: state.metrics.visitorsByArchetype.diner,
      shopperVisitors: state.metrics.visitorsByArchetype.shopper,
      loungerVisitors: state.metrics.visitorsByArchetype.lounger,
      rusherVisitors: state.metrics.visitorsByArchetype.rusher,
      bodyVisibleCount: state.metrics.bodyVisibleCount,
      bodyCount: state.metrics.bodyCount,
      bodiesClearedTotal: state.metrics.bodiesClearedTotal,
      crewRestCap: state.metrics.crewRestCap,
      crewRestingNow: state.metrics.crewRestingNow,
      crewEmergencyWakeBudget: state.metrics.crewEmergencyWakeBudget,
      crewWokenForAir: state.metrics.crewWokenForAir,
      crewPingPongPreventions: state.metrics.crewPingPongPreventions,
      hydroponicsStaffed: state.metrics.hydroponicsStaffed,
      crewRetargetsPerMin: state.metrics.crewRetargetsPerMin,
      criticalStaffDropsPerMin: state.metrics.criticalStaffDropsPerMin,
      visitorServiceFailuresPerMin: state.metrics.visitorServiceFailuresPerMin,
      criticalUnstaffedLifeSupportSec: state.metrics.criticalUnstaffedSec.lifeSupport,
      criticalUnstaffedHydroponicsSec: state.metrics.criticalUnstaffedSec.hydroponics,
      criticalUnstaffedKitchenSec: state.metrics.criticalUnstaffedSec.kitchen,
      requiredCriticalStaff: state.metrics.requiredCriticalStaff,
      assignedCriticalStaff: state.metrics.assignedCriticalStaff,
      activeCriticalStaff: state.metrics.activeCriticalStaff,
      criticalShortfallSec: state.metrics.criticalShortfallSec,
      logisticsDispatchSlots: state.metrics.logisticsDispatchSlots,
      logisticsPressure: state.metrics.logisticsPressure,
      staffInTransitBySystem: state.metrics.staffInTransitBySystem,
      visitorDestinationCafeteriaShare: state.metrics.visitorDestinationShares.cafeteria,
      visitorDestinationMarketShare: state.metrics.visitorDestinationShares.market,
      visitorDestinationLoungeShare: state.metrics.visitorDestinationShares.lounge,
      shipsByTypePerMin: state.metrics.shipsByTypePerMin
    }
  };
}

export function buildStableScenario(): ScenarioSpec {
  return {
    name: 'stable',
    seed: 101,
    durationSec: 240,
    stepSec: 0.25,
    snapshotEverySec: 20,
    setup: (state) => {
      buildBaseStation(state);
    }
  };
}

export function buildNoCafeteriaScenario(): ScenarioSpec {
  return {
    name: 'no-cafeteria',
    seed: 101,
    durationSec: 240,
    stepSec: 0.25,
    snapshotEverySec: 20,
    setup: (state) => {
      buildBaseStation(state);
      setRoom(state, toIndex(28, 13, state.width), RoomType.None);
    }
  };
}

export function buildNoLifeSupportScenario(): ScenarioSpec {
  return {
    name: 'no-life-support',
    seed: 101,
    durationSec: 240,
    stepSec: 0.25,
    snapshotEverySec: 20,
    setup: (state) => {
      buildBaseStation(state);
      setRoom(state, toIndex(24, 13, state.width), RoomType.None);
    }
  };
}

export function buildKitchenRequiredFoodChainScenario(): ScenarioSpec {
  return {
    name: 'kitchen-required-food-chain',
    seed: 1201,
    durationSec: 220,
    stepSec: 0.25,
    snapshotEverySec: 20,
    setup: (state) => {
      buildBaseStation(state);
      setRoom(state, toIndex(24, 16, state.width), RoomType.None);
      setModule(state, toIndex(24, 16, state.width), ModuleType.None);
      state.controls.shipsPerCycle = 1;
      state.metrics.mealStock = 22;
      state.metrics.rawFoodStock = 80;
    }
  };
}

export function buildKitchenRestoresThroughputScenario(): ScenarioSpec {
  return {
    name: 'kitchen-restores-throughput',
    seed: 1202,
    durationSec: 220,
    stepSec: 0.25,
    snapshotEverySec: 20,
    setup: (state) => {
      buildBaseStation(state);
      state.controls.shipsPerCycle = 1;
      state.metrics.mealStock = 22;
      state.metrics.rawFoodStock = 80;
    }
  };
}

export function buildManifestProbeScenario(seed: number, taxRate = 0.2): ScenarioSpec {
  return {
    name: `manifest-probe-${seed}-tax-${Math.round(taxRate * 100)}`,
    seed,
    durationSec: 180,
    stepSec: 0.25,
    snapshotEverySec: 15,
    setup: (state) => {
      buildBaseStation(state);
      state.controls.shipsPerCycle = 2;
      state.controls.taxRate = taxRate;
      state.metrics.mealStock = 30;
      state.metrics.rawFoodStock = 90;
    }
  };
}

function configurePrimaryDockTypes(state: StationState, allowIndustrial: boolean): void {
  const primaryDockTile = toIndex(22, 24, state.width);
  const dock = getDockByTile(state, primaryDockTile);
  if (!dock) return;
  setDockAllowedShipType(state, dock.id, 'tourist', !allowIndustrial);
  setDockAllowedShipType(state, dock.id, 'trader', true);
  setDockAllowedShipType(state, dock.id, 'industrial', allowIndustrial);
}

function configureWorkshopMarketChain(state: StationState, withWorkshop: boolean): void {
  const workshopIdx = toIndex(29, 16, state.width);
  const marketIdx = toIndex(30, 16, state.width);
  setTile(state, toIndex(29, 15, state.width), TileType.Door);
  setTile(state, toIndex(30, 15, state.width), TileType.Door);
  setRoom(state, marketIdx, RoomType.Market);
  if (withWorkshop) {
    setRoom(state, workshopIdx, RoomType.Workshop);
    setModule(state, workshopIdx, ModuleType.Workbench);
  } else {
    setRoom(state, workshopIdx, RoomType.None);
    setModule(state, workshopIdx, ModuleType.None);
  }
}

export function buildWorkshopModuleGatingScenario(): ScenarioSpec {
  const workshopTile = { x: 29, y: 16 };
  return {
    name: 'workshop-module-gating',
    seed: 1410,
    durationSec: 200,
    stepSec: 0.25,
    snapshotEverySec: 20,
    setup: (state) => {
      buildBaseStation(state);
      const idx = toIndex(workshopTile.x, workshopTile.y, state.width);
      setTile(state, toIndex(29, 15, state.width), TileType.Door);
      setTile(state, toIndex(30, 15, state.width), TileType.Door);
      setRoom(state, idx, RoomType.Workshop);
      setModule(state, idx, ModuleType.None);
      state.controls.shipsPerCycle = 1;
    },
    onTick: (state) => {
      configurePrimaryDockTypes(state, true);
      if (state.now >= 95) {
        setModule(state, toIndex(workshopTile.x, workshopTile.y, state.width), ModuleType.Workbench);
      }
    }
  };
}

export function buildTradeGoodChainThroughputScenario(): ScenarioSpec {
  return {
    name: 'tradegood-chain-throughput',
    seed: 1411,
    durationSec: 220,
    stepSec: 0.25,
    snapshotEverySec: 20,
    setup: (state) => {
      buildBaseStation(state);
      configureWorkshopMarketChain(state, true);
      state.controls.shipsPerCycle = 2;
      state.crew.total = 18;
    },
    onTick: (state) => {
      configurePrimaryDockTypes(state, true);
    }
  };
}

export function buildMarketStockoutPenaltyScenario(): ScenarioSpec {
  return {
    name: 'market-stockout-penalty',
    seed: 1412,
    durationSec: 220,
    stepSec: 0.25,
    snapshotEverySec: 20,
    setup: (state) => {
      buildBaseStation(state);
      configureWorkshopMarketChain(state, false);
      state.controls.shipsPerCycle = 2;
      state.crew.total = 16;
    },
    onTick: (state) => {
      configurePrimaryDockTypes(state, true);
    }
  };
}

export function buildIndustrialTrafficScenario(seed: number, allowIndustrial: boolean): ScenarioSpec {
  return {
    name: `industrial-traffic-${allowIndustrial ? 'enabled' : 'disabled'}-${seed}`,
    seed,
    durationSec: 200,
    stepSec: 0.25,
    snapshotEverySec: 20,
    setup: (state) => {
      buildBaseStation(state);
      configureWorkshopMarketChain(state, true);
      state.controls.shipsPerCycle = 3;
    },
    onTick: (state) => {
      configurePrimaryDockTypes(state, allowIndustrial);
    }
  };
}

export function buildLargePaintFewTablesScenario(): ScenarioSpec {
  return {
    name: 'large-paint-few-tables',
    seed: 202,
    durationSec: 180,
    stepSec: 0.25,
    snapshotEverySec: 20,
    setup: (state) => {
      buildBaseStation(state);
      roomRect(state, 27, 13, 33, 18, RoomType.Cafeteria);
      setModule(state, toIndex(28, 13, state.width), ModuleType.Table);
      setModule(state, toIndex(30, 13, state.width), ModuleType.None);
    }
  };
}

export function buildSingleDoorQueueStressScenario(): ScenarioSpec {
  return {
    name: 'single-door-queue-stress',
    seed: 303,
    durationSec: 240,
    stepSec: 0.25,
    snapshotEverySec: 20,
    setup: (state) => {
      buildBaseStation(state);
      state.controls.shipsPerCycle = 3;
      setTile(state, toIndex(24, 14, state.width), TileType.Wall);
      setTile(state, toIndex(26, 14, state.width), TileType.Wall);
      setTile(state, toIndex(30, 14, state.width), TileType.Wall);
    }
  };
}

export function buildPaintOnlyNoTableGrowthScenario(): ScenarioSpec {
  return {
    name: 'paint-only-no-table-growth',
    seed: 404,
    durationSec: 180,
    stepSec: 0.25,
    snapshotEverySec: 20,
    setup: (state) => {
      buildBaseStation(state);
      roomRect(state, 26, 13, 33, 20, RoomType.Cafeteria);
      // Keep exactly one table node despite larger painted area.
      for (let i = 0; i < state.modules.length; i++) {
        if (state.modules[i] === ModuleType.Table && i !== toIndex(28, 13, state.width)) {
          setModule(state, i, ModuleType.None);
        }
      }
      state.controls.shipsPerCycle = 2;
    }
  };
}

export function buildHaulerStarvationScenario(): ScenarioSpec {
  return {
    name: 'hauler-starvation',
    seed: 505,
    durationSec: 220,
    stepSec: 0.25,
    snapshotEverySec: 20,
    setup: (state) => {
      buildBaseStation(state);
      state.controls.shipsPerCycle = 2;
      state.crew.total = 1;
      state.metrics.mealStock = 0;
      state.metrics.rawFoodStock = 100;
    }
  };
}

export function buildNearBufferScenario(): ScenarioSpec {
  return {
    name: 'near-buffer',
    seed: 606,
    durationSec: 200,
    stepSec: 0.25,
    snapshotEverySec: 20,
    setup: (state) => {
      buildBaseStation(state);
      setRoom(state, toIndex(27, 13, state.width), RoomType.Hydroponics);
      setModule(state, toIndex(27, 13, state.width), ModuleType.GrowTray);
      state.controls.shipsPerCycle = 2;
    }
  };
}

export function buildFarBufferScenario(): ScenarioSpec {
  return {
    name: 'far-buffer',
    seed: 606,
    durationSec: 200,
    stepSec: 0.25,
    snapshotEverySec: 20,
    setup: (state) => {
      buildBaseStation(state);
      roomRect(state, 31, 20, 33, 22, RoomType.Hydroponics);
      setModule(state, toIndex(26, 13, state.width), ModuleType.None);
      setModule(state, toIndex(33, 22, state.width), ModuleType.GrowTray);
      addDoor(state, 31, 19);
      state.controls.shipsPerCycle = 2;
    }
  };
}

export function buildJobExpirationRecoveryScenario(): ScenarioSpec {
  return {
    name: 'job-expiration-recovery',
    seed: 707,
    durationSec: 220,
    stepSec: 0.25,
    snapshotEverySec: 20,
    setup: (state) => {
      buildBaseStation(state);
      setTile(state, toIndex(27, 14, state.width), TileType.Wall);
      setTile(state, toIndex(28, 14, state.width), TileType.Wall);
      // Leave one narrow route open so some jobs complete while others stale/expire.
      state.controls.shipsPerCycle = 2;
    }
  };
}

export function buildAirCollapseDeathScenario(): ScenarioSpec {
  return {
    name: 'air-collapse-death',
    seed: 808,
    durationSec: 260,
    stepSec: 0.25,
    snapshotEverySec: 20,
    setup: (state) => {
      buildBaseStation(state);
      setRoom(state, toIndex(24, 13, state.width), RoomType.None);
      state.controls.shipsPerCycle = 0;
      state.metrics.airQuality = 12;
    }
  };
}

export function buildAirRecoveryWindowScenario(): ScenarioSpec {
  return {
    name: 'air-recovery-window',
    seed: 909,
    durationSec: 260,
    stepSec: 0.25,
    snapshotEverySec: 20,
    setup: (state) => {
      buildBaseStation(state);
      setRoom(state, toIndex(24, 13, state.width), RoomType.None);
      state.controls.shipsPerCycle = 0;
      state.metrics.airQuality = 14;
    },
    onTick: (state) => {
      if (state.now > 85 && state.rooms[toIndex(24, 13, state.width)] !== RoomType.LifeSupport) {
        setRoom(state, toIndex(24, 13, state.width), RoomType.LifeSupport);
      }
    }
  };
}

export function buildAirInactiveDiagnosisScenario(): ScenarioSpec {
  return {
    name: 'air-inactive-diagnosis',
    seed: 1001,
    durationSec: 160,
    stepSec: 0.25,
    snapshotEverySec: 20,
    setup: (state) => {
      buildBaseStation(state);
      state.controls.shipsPerCycle = 0;
      state.metrics.airQuality = 8;
      setTile(state, toIndex(24, 14, state.width), TileType.Wall);
    }
  };
}

export function buildAirRecoveryAfterFixScenario(): ScenarioSpec {
  return {
    name: 'air-recovery-after-fix',
    seed: 1002,
    durationSec: 180,
    stepSec: 0.25,
    snapshotEverySec: 20,
    setup: (state) => {
      buildBaseStation(state);
      state.controls.shipsPerCycle = 0;
      state.metrics.airQuality = 8;
      setTile(state, toIndex(24, 14, state.width), TileType.Wall);
    },
    onTick: (state) => {
      if (state.now > 70 && state.tiles[toIndex(24, 14, state.width)] === TileType.Wall) {
        setTile(state, toIndex(24, 14, state.width), TileType.Door);
      }
    }
  };
}

export function buildManualBodyClearScenario(): ScenarioSpec {
  let attemptedClear = false;
  return {
    name: 'manual-body-clear',
    seed: 1003,
    durationSec: 220,
    stepSec: 0.25,
    snapshotEverySec: 20,
    setup: (state) => {
      buildBaseStation(state);
      state.controls.shipsPerCycle = 0;
      state.metrics.materials = 200;
      state.legacyMaterialStock = 200;
      const seeded = [toIndex(27, 15, state.width), toIndex(28, 15, state.width), toIndex(29, 15, state.width), toIndex(30, 15, state.width)];
      state.bodyTiles.push(...seeded);
      state.metrics.bodyCount = seeded.length;
      state.metrics.bodyVisibleCount = seeded.length;
    },
    onTick: (state) => {
      if (!attemptedClear && state.metrics.bodyVisibleCount >= 3) {
        attemptedClear = clearBodies(state);
      }
    }
  };
}

export function buildCrewRestPingPongGuardScenario(): ScenarioSpec {
  return {
    name: 'crew-rest-pingpong-guard',
    seed: 1101,
    durationSec: 220,
    stepSec: 0.25,
    snapshotEverySec: 10,
    setup: (state) => {
      buildBaseStation(state);
      state.controls.shipsPerCycle = 0;
      state.metrics.airQuality = 16;
      state.crew.total = 16;
    }
  };
}

export function buildCrewShiftStaggerScenario(): ScenarioSpec {
  let initialized = false;
  return {
    name: 'crew-shift-stagger',
    seed: 1102,
    durationSec: 120,
    stepSec: 0.25,
    snapshotEverySec: 10,
    setup: (state) => {
      buildBaseStation(state);
      state.controls.shipsPerCycle = 0;
      state.metrics.airQuality = 65;
      state.crew.total = 18;
    },
    onTick: (state) => {
      if (initialized || state.crewMembers.length === 0) return;
      initialized = true;
      for (const crew of state.crewMembers) {
        crew.energy = 38;
        crew.hygiene = 72;
      }
    }
  };
}

export function buildAirEmergencyBalancedWakeScenario(): ScenarioSpec {
  let initialized = false;
  return {
    name: 'air-emergency-balanced-wake',
    seed: 1103,
    durationSec: 120,
    stepSec: 0.25,
    snapshotEverySec: 10,
    setup: (state) => {
      buildBaseStation(state);
      state.controls.shipsPerCycle = 0;
      state.metrics.airQuality = 12;
      state.crew.total = 20;
    },
    onTick: (state) => {
      if (initialized || state.crewMembers.length === 0) return;
      initialized = true;
      for (let i = 0; i < state.crewMembers.length; i++) {
        const crew = state.crewMembers[i];
        if (i < 14) {
          crew.resting = true;
          crew.energy = 72;
          crew.restLockUntil = 0;
        } else {
          crew.energy = 68;
        }
      }
    }
  };
}

export function buildLifeSupportRecoveryFromRestingScenario(): ScenarioSpec {
  let initialized = false;
  return {
    name: 'life-support-recovery-from-resting',
    seed: 1104,
    durationSec: 180,
    stepSec: 0.25,
    snapshotEverySec: 10,
    setup: (state) => {
      buildBaseStation(state);
      state.controls.shipsPerCycle = 0;
      state.metrics.airQuality = 9;
      state.crew.total = 14;
    },
    onTick: (state) => {
      if (initialized || state.crewMembers.length === 0) return;
      initialized = true;
      for (let i = 0; i < state.crewMembers.length; i++) {
        const crew = state.crewMembers[i];
        if (i < 8) {
          crew.resting = true;
          crew.energy = 70;
          crew.restLockUntil = 0;
        }
      }
    }
  };
}

export function buildDormNoPermaStallScenario(): ScenarioSpec {
  return {
    name: 'dorm-no-perma-stall',
    seed: 1105,
    durationSec: 260,
    stepSec: 0.25,
    snapshotEverySec: 20,
    setup: (state) => {
      buildBaseStation(state);
      state.controls.shipsPerCycle = 1;
      state.metrics.airQuality = 55;
      state.crew.total = 16;
    }
  };
}

export function buildCoreDistanceCostScalingScenario(): ScenarioSpec {
  return {
    name: 'core-distance-cost-scaling',
    seed: 1401,
    durationSec: 40,
    stepSec: 0.25,
    snapshotEverySec: 10,
    setup: (state) => {
      buildBaseStation(state);
      state.controls.shipsPerCycle = 0;
      // Smoke-run with core/distance rules active.
      const near = toIndex(Math.floor(state.width / 2) + 2, Math.floor(state.height / 2), state.width);
      const far = toIndex(34, 24, state.width);
      trySetTile(state, near, TileType.Floor);
      trySetTile(state, far, TileType.Floor);
    }
  };
}

export function buildVisitorFailureAffectsRatingScenario(): ScenarioSpec {
  return {
    name: 'visitor-failure-affects-rating-not-crew-morale',
    seed: 1402,
    durationSec: 180,
    stepSec: 0.25,
    snapshotEverySec: 20,
    setup: (state) => {
      buildBaseStation(state);
      state.controls.shipsPerCycle = 2;
      setRoom(state, toIndex(29, 16, state.width), RoomType.None);
      setRoom(state, toIndex(30, 16, state.width), RoomType.None);
      setRoom(state, toIndex(28, 13, state.width), RoomType.None);
    }
  };
}

export function buildCrewNoThrashUnderNormalLoadScenario(): ScenarioSpec {
  return {
    name: 'crew-no-thrash-under-normal-load',
    seed: 1301,
    durationSec: 300,
    stepSec: 0.25,
    snapshotEverySec: 20,
    setup: (state) => {
      buildBaseStation(state);
      state.controls.shipsPerCycle = 1;
      state.crew.total = 14;
      state.metrics.airQuality = 68;
    }
  };
}

export function buildFoodChainFloorStaffingScenario(): ScenarioSpec {
  return {
    name: 'food-chain-floor-staffing',
    seed: 1302,
    durationSec: 180,
    stepSec: 0.25,
    snapshotEverySec: 15,
    setup: (state) => {
      buildBaseStation(state);
      state.controls.shipsPerCycle = 2;
      state.metrics.mealStock = 4;
      state.metrics.kitchenRawBuffer = 1;
      state.metrics.rawFoodStock = 95;
      state.crew.total = 8;
    }
  };
}

export function buildHydroKitchenJobAppearsWhenStarvedScenario(): ScenarioSpec {
  return {
    name: 'hydro-kitchen-job-appears-when-starved',
    seed: 1303,
    durationSec: 220,
    stepSec: 0.25,
    snapshotEverySec: 20,
    setup: (state) => {
      buildBaseStation(state);
      state.controls.shipsPerCycle = 2;
      state.metrics.mealStock = 0;
      state.metrics.kitchenRawBuffer = 0;
      state.metrics.rawFoodStock = 110;
      state.crew.total = 10;
    }
  };
}

export function buildVisitorRandomizedChoiceDistributionScenario(seed: number): ScenarioSpec {
  return {
    name: `visitor-randomized-choice-distribution-${seed}`,
    seed,
    durationSec: 220,
    stepSec: 0.25,
    snapshotEverySec: 20,
    setup: (state) => {
      buildBaseStation(state);
      state.controls.shipsPerCycle = 2;
      state.metrics.mealStock = 40;
      state.metrics.rawFoodStock = 110;
    }
  };
}

export function buildCreditsGrossVsNetVisibleConsistencyScenario(): ScenarioSpec {
  return {
    name: 'credits-gross-vs-net-visible-consistency',
    seed: 1304,
    durationSec: 220,
    stepSec: 0.25,
    snapshotEverySec: 20,
    setup: (state) => {
      buildBaseStation(state);
      state.controls.shipsPerCycle = 2;
      state.controls.taxRate = 0.22;
      state.metrics.mealStock = 45;
      state.metrics.rawFoodStock = 105;
      state.crew.total = 12;
    }
  };
}

export function buildCrewThrashRegressionGuardScenario(): ScenarioSpec {
  return {
    name: 'crew-thrash-regression-guard',
    seed: 2307,
    durationSec: 260,
    stepSec: 0.25,
    snapshotEverySec: 20,
    setup: (state) => {
      buildBaseStation(state);
      state.controls.shipsPerCycle = 0;
      state.crew.total = 14;
      state.metrics.airQuality = 72;
      state.metrics.mealStock = 70;
      state.metrics.rawFoodStock = 120;
      state.metrics.kitchenRawBuffer = 24;
    }
  };
}

export function buildLifeSupportFloorHoldsScenario(): ScenarioSpec {
  return {
    name: 'life-support-floor-holds',
    seed: 2308,
    durationSec: 140,
    stepSec: 0.25,
    snapshotEverySec: 10,
    setup: (state) => {
      buildBaseStation(state);
      state.controls.shipsPerCycle = 0;
      state.crew.total = 12;
      state.metrics.airQuality = 12;
      state.metrics.mealStock = 22;
    }
  };
}

export function buildActivationHysteresisPreventsFlickerScenario(): ScenarioSpec {
  return {
    name: 'activation-hysteresis-prevents-flicker',
    seed: 2309,
    durationSec: 150,
    stepSec: 0.25,
    snapshotEverySec: 10,
    setup: (state) => {
      buildBaseStation(state);
      state.controls.shipsPerCycle = 0;
      state.crew.total = 12;
      state.metrics.airQuality = 30;
      state.metrics.mealStock = 6;
      state.metrics.rawFoodStock = 90;
      state.metrics.kitchenRawBuffer = 0;
    },
    onTick: (state) => {
      // Force a brief staffing disturbance below grace window.
      if (state.now > 45 && state.now < 46.5) {
        for (const crew of state.crewMembers) {
          crew.resting = true;
          crew.role = 'idle';
          crew.targetTile = null;
          crew.path = [];
        }
      }
      if (state.now >= 46.5 && state.now < 48) {
        for (const crew of state.crewMembers) {
          if (crew.resting) {
            crew.resting = false;
            crew.restSessionActive = false;
            crew.restCooldownUntil = state.now + 1;
          }
        }
      }
    }
  };
}

export function buildCriticalCapacityTargetsReactorLsScenario(): ScenarioSpec {
  return {
    name: 'critical-capacity-targets-reactor-ls',
    seed: 3001,
    durationSec: 180,
    stepSec: 0.25,
    snapshotEverySec: 15,
    setup: (state) => {
      buildBaseStation(state);
      state.crew.total = 26;
      state.controls.shipsPerCycle = 1;
      state.metrics.airQuality = 34;
      state.metrics.mealStock = 80;
      state.metrics.kitchenRawBuffer = 20;
    }
  };
}

export function buildServiceNodesDoNotForceDutyStaffScenario(): ScenarioSpec {
  return {
    name: 'service-nodes-do-not-force-duty-staff',
    seed: 3002,
    durationSec: 180,
    stepSec: 0.25,
    snapshotEverySec: 15,
    setup: (state) => {
      buildBaseStation(state);
      roomRect(state, 27, 13, 33, 20, RoomType.Cafeteria);
      for (let y = 13; y <= 20; y++) {
        for (let x = 27; x <= 33; x++) {
          setModule(state, toIndex(x, y, state.width), ModuleType.Table);
        }
      }
      state.crew.total = 18;
      state.controls.shipsPerCycle = 1;
    }
  };
}

export function buildHighMealStockHaulingSuppressionScenario(): ScenarioSpec {
  return {
    name: 'high-meal-stock-hauling-suppression',
    seed: 3003,
    durationSec: 180,
    stepSec: 0.25,
    snapshotEverySec: 15,
    setup: (state) => {
      buildBaseStation(state);
      state.controls.shipsPerCycle = 0;
      state.metrics.mealStock = 220;
      state.metrics.kitchenRawBuffer = 80;
      state.metrics.rawFoodStock = 180;
      state.crew.total = 20;
    }
  };
}

export function buildHighCrewStabilityWhenCapacityMetScenario(): ScenarioSpec {
  return {
    name: 'high-crew-stability-when-capacity-met',
    seed: 3004,
    durationSec: 220,
    stepSec: 0.25,
    snapshotEverySec: 20,
    setup: (state) => {
      buildBaseStation(state);
      // Add extra staffed critical clusters with guaranteed door adjacency.
      setRoom(state, toIndex(24, 18, state.width), RoomType.LifeSupport);
      setRoom(state, toIndex(30, 18, state.width), RoomType.LifeSupport);
      setRoom(state, toIndex(32, 18, state.width), RoomType.LifeSupport);
      setRoom(state, toIndex(22, 18, state.width), RoomType.Reactor);
      setRoom(state, toIndex(28, 18, state.width), RoomType.Reactor);
      setRoom(state, toIndex(32, 20, state.width), RoomType.Reactor);
      addDoor(state, 30, 17);
      addDoor(state, 32, 17);
      addDoor(state, 28, 17);
      addDoor(state, 32, 19);
      state.crew.total = 32;
      state.controls.shipsPerCycle = 0;
      state.metrics.airQuality = 60;
      state.metrics.mealStock = 120;
      state.metrics.kitchenRawBuffer = 30;
    }
  };
}

export function buildInTransitVsNoStaffDiagnosticsScenario(): ScenarioSpec {
  return {
    name: 'in-transit-vs-no-staff-diagnostics',
    seed: 3005,
    durationSec: 160,
    stepSec: 0.25,
    snapshotEverySec: 20,
    setup: (state) => {
      buildBaseStation(state);
      state.crew.total = 12;
      state.controls.shipsPerCycle = 0;
      state.metrics.airQuality = 20;
      setTile(state, toIndex(24, 14, state.width), TileType.Door);
      setTile(state, toIndex(24, 15, state.width), TileType.Wall);
    }
  };
}
