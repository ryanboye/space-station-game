/**
 * Focused economic gate for the first contract-ready medium Berth.
 *
 * Each arm begins immediately after one of the three advertised opening
 * businesses has been built through its production showcase. We normalize the
 * bank to what the ordinary 320c opening would leave after that route's real
 * construction and first stock order, then run ordinary traffic, payroll and
 * physical replenishment. Capital Projects are deliberately absent: they are
 * accelerators, not a required bridge out of the opening economy.
 *
 * This runner intentionally stays separate from the broader 30-minute
 * opening-business diagnostic. Its one question is whether every meaningful
 * opening choice can safely save 1,250c within 90 simulated minutes:
 *
 *   1,150c contract-ready Berth
 *     = 600 floor + 210 control + 2 * 100 clamps + 140 Gangway
 *   + 100c working-capital cushion for payroll and one stock order.
 */

import {
  buyImportedTradeGoodsDetailed,
  buyPreparedMealsDetailed,
  createInitialState,
  getPreparedMealInventory,
  orderFuelDetailed,
  previewPreparedMealPurchase,
  quoteFuelOrder,
  quoteTravelSuppliesOrder,
  setDockPurpose,
  tick
} from '../src/sim';
import { BERTH_CAPITAL_COST, MODULE_DEFINITIONS, OPENING_BALANCE } from '../src/sim/balance';
import { applyColdStartScenario } from '../src/sim/cold-start-scenarios';
import { createEconomyLedger } from '../src/sim/opening-economy';
import { ModuleType, type ItemType, type StationState } from '../src/sim/types';

type RouteId = 'feed-travelers' | 'sell-supplies' | 'service-ships';

const ROUTES: readonly RouteId[] = ['feed-travelers', 'sell-supplies', 'service-ships'];
const SCENARIO: Record<RouteId, string> = {
  'feed-travelers': 'opening-food-cycle',
  'sell-supplies': 'opening-supplies-cycle',
  'service-ships': 'opening-refuel-cycle'
};

// Measured by the production setup in tools/opening-business-runway.ts on the
// neutral charter. Keep these explicit: price drift should make this gate ask
// for a deliberate recalibration rather than silently subsidize the route.
const SETUP_COST: Record<RouteId, number> = {
  'feed-travelers': 230,
  'sell-supplies': 234,
  'service-ships': 247
};

const BERTH_PACKAGE_COST =
  BERTH_CAPITAL_COST.medium +
  MODULE_DEFINITIONS[ModuleType.BerthControl].capitalCost! +
  2 * MODULE_DEFINITIONS[ModuleType.DockingClamp].capitalCost! +
  MODULE_DEFINITIONS[ModuleType.Gangway].capitalCost!;
const WORKING_CAPITAL_CUSHION = 100;
const SAFE_BUILD_CHECKPOINT = BERTH_PACKAGE_COST + WORKING_CAPITAL_CUSHION;
const MAX_SECONDS = 90 * 60;
const STEP_SECONDS = 0.5;
const PAYROLL_RESERVE_CYCLES = 2;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`first-berth-runway: ${message}`);
}

function stationStock(state: StationState, item: ItemType): number {
  const settled = state.itemNodes.reduce((sum, node) => sum + Math.max(0, node.items[item] ?? 0), 0);
  const carried = state.crewMembers.reduce(
    (sum, crew) => sum + (crew.carryingItemType === item ? Math.max(0, crew.carryingAmount) : 0),
    0
  );
  return settled + carried;
}

function fuelStock(state: StationState): number {
  const tanks = new Set(
    state.moduleInstances
      .filter((module) => module.type === ModuleType.FuelTank)
      .map((module) => module.originTile)
  );
  return state.itemNodes.reduce(
    (sum, node) => sum + (tanks.has(node.tileIndex) ? Math.max(0, node.items.fuel ?? 0) : 0),
    0
  );
}

function routeStock(state: StationState, route: RouteId): number {
  if (route === 'feed-travelers') return getPreparedMealInventory(state).readyServings;
  if (route === 'sell-supplies') return stationStock(state, 'tradeGood');
  return fuelStock(state);
}

function pendingSupplier(state: StationState): boolean {
  return state.openingEconomy.podFreightOperations.some(
    (operation) =>
      operation.kind === 'supplier-delivery' &&
      operation.status !== 'complete' &&
      operation.status !== 'cancelled' &&
      operation.status !== 'expired'
  );
}

function setPodPurposes(state: StationState, purpose: 'visitor' | 'residential'): void {
  for (const dock of state.docks) {
    if (dock.sourceKind === 'pod-dock-module') setDockPurpose(state, dock.id, purpose);
  }
}

function normalizeOpeningStock(state: StationState, route: RouteId): void {
  const clear = (item: ItemType): void => {
    for (const node of state.itemNodes) node.items[item] = 0;
    for (const crew of state.crewMembers) {
      if (crew.carryingItemType !== item) continue;
      crew.carryingItemType = null;
      crew.carryingAmount = 0;
    }
  };
  if (route === 'feed-travelers') {
    clear('meal');
    clear('cleanTray');
    const counter = state.moduleInstances.find(
      (module) =>
        module.type === ModuleType.ServingStation &&
        state.zones[module.originTile] === 'public'
    );
    const node = counter
      ? state.itemNodes.find((candidate) => candidate.tileIndex === counter.originTile)
      : null;
    assert(node, 'food route lost its public Serving Station stock node');
    node.items.meal = OPENING_BALANCE.preparedMealBatch.units;
    node.items.cleanTray = OPENING_BALANCE.preparedMealBatch.units;
  } else if (route === 'sell-supplies') {
    clear('tradeGood');
    const shelf = state.moduleInstances.find((module) => module.type === ModuleType.ShelfAisle);
    const node = shelf
      ? state.itemNodes.find((candidate) => candidate.tileIndex === shelf.originTile)
      : null;
    assert(node, 'supplies route lost its Shelf Aisle stock node');
    node.items.tradeGood = OPENING_BALANCE.travelSupplyBatch.units;
  } else {
    clear('fuel');
    const tank = state.moduleInstances.find((module) => module.type === ModuleType.FuelTank);
    const node = tank
      ? state.itemNodes.find((candidate) => candidate.tileIndex === tank.originTile)
      : null;
    assert(node, 'refuel route lost its Fuel Tank stock node');
    node.items.fuel = OPENING_BALANCE.fuelLot.units;
  }
}

function normalizeAfterSetup(state: StationState, route: RouteId): void {
  state.metrics.credits = OPENING_BALANCE.startingCredits - SETUP_COST[route];
  state.metrics.creditsEarnedLifetime = 0;
  state.openingEconomy.ledger = createEconomyLedger();
  state.openingEconomy.capitalProjects = {
    version: 1,
    active: [],
    completed: [],
    advanceAwarded: []
  };
  for (const crew of state.crewMembers) crew.missedPayrollCycles = 0;
  normalizeOpeningStock(state, route);
  state.controls.paused = false;
  state.controls.manualTrafficAdmission = false;
  state.controls.shipsPerCycle = 3;
  if (route !== 'service-ships') setPodPurposes(state, 'visitor');
}

function replenish(state: StationState, route: RouteId): number {
  const reserve = state.crew.total * PAYROLL_RESERVE_CYCLES;
  if (route === 'feed-travelers' && routeStock(state, route) <= 3) {
    const quote = previewPreparedMealPurchase(state);
    if (quote.ok && state.metrics.credits >= quote.creditCost + reserve) {
      return buyPreparedMealsDetailed(state).ok ? 1 : 0;
    }
  } else if (route === 'sell-supplies' && routeStock(state, route) <= 4 && !pendingSupplier(state)) {
    const quote = quoteTravelSuppliesOrder(state);
    if (quote.ok && state.metrics.credits >= quote.creditCost + reserve) {
      return buyImportedTradeGoodsDetailed(state).ok ? 1 : 0;
    }
  } else if (route === 'service-ships' && routeStock(state, route) <= 8 && !pendingSupplier(state)) {
    const quote = quoteFuelOrder(state);
    if (quote.ok && state.metrics.credits >= quote.creditCost + reserve) {
      setPodPurposes(state, 'visitor');
      return orderFuelDetailed(state).ok ? 1 : 0;
    }
  }
  return 0;
}

function run(route: RouteId) {
  const state = createInitialState({
    seed: 411,
    physicalStarterInventory: true,
    manualTrafficAdmission: false
  });
  assert(applyColdStartScenario(state, SCENARIO[route]), `missing ${SCENARIO[route]} scenario`);
  normalizeAfterSetup(state, route);

  const startedAt = state.now;
  let lowestCredits = state.metrics.credits;
  let replenishmentOrders = 0;
  let reachedAt: number | null = null;
  for (let elapsed = 0; elapsed < MAX_SECONDS; elapsed += STEP_SECONDS) {
    tick(state, STEP_SECONDS);
    lowestCredits = Math.min(lowestCredits, state.metrics.credits);
    replenishmentOrders += replenish(state, route);
    if (state.metrics.credits >= SAFE_BUILD_CHECKPOINT) {
      reachedAt = state.now - startedAt;
      break;
    }
    const missedPayroll = Math.max(0, ...state.crewMembers.map((crew) => crew.missedPayrollCycles));
    if (missedPayroll > 0 && state.metrics.credits <= 0) break;
  }

  const missedPayrollCycles = Math.max(0, ...state.crewMembers.map((crew) => crew.missedPayrollCycles));
  return {
    route,
    setupCost: SETUP_COST[route],
    openingCashAfterSetup: OPENING_BALANCE.startingCredits - SETUP_COST[route],
    checkpoint: SAFE_BUILD_CHECKPOINT,
    reachedAtSec: reachedAt === null ? null : Number(reachedAt.toFixed(1)),
    endingCredits: Number(state.metrics.credits.toFixed(2)),
    lowestCredits: Number(lowestCredits.toFixed(2)),
    earnedRevenue: Number(state.metrics.creditsEarnedLifetime.toFixed(2)),
    payrollSpend: Number(state.openingEconomy.ledger.lifetime.wages.expenses.toFixed(2)),
    procurementSpend: Number(state.openingEconomy.ledger.lifetime['supplier-purchase'].expenses.toFixed(2)),
    replenishmentOrders,
    routeStock: Number(routeStock(state, route).toFixed(2)),
    missedPayrollCycles
  };
}

assert(BERTH_PACKAGE_COST === 1150, `contract-ready Berth drifted to ${BERTH_PACKAGE_COST}c`);
assert(SAFE_BUILD_CHECKPOINT === 1250, `safe build checkpoint drifted to ${SAFE_BUILD_CHECKPOINT}c`);

const results = ROUTES.map(run);
console.log(JSON.stringify({
  assumptions: {
    seed: 411,
    startingCredits: OPENING_BALANCE.startingCredits,
    berthPackageCredits: BERTH_PACKAGE_COST,
    workingCapitalCushion: WORKING_CAPITAL_CUSHION,
    safeBuildCheckpoint: SAFE_BUILD_CHECKPOINT,
    maxSimulatedMinutes: MAX_SECONDS / 60,
    capitalProjects: false,
    trafficPerCycle: 3
  },
  results
}, null, 2));

for (const result of results) {
  assert(
    result.reachedAtSec !== null && result.reachedAtSec <= MAX_SECONDS,
    `${result.route} failed to reach ${SAFE_BUILD_CHECKPOINT}c within ${MAX_SECONDS / 60} sim minutes `
      + `(ending ${result.endingCredits}c, earned ${result.earnedRevenue}c)`
  );
  assert(result.missedPayrollCycles === 0, `${result.route} missed payroll before the Berth checkpoint`);
  assert(result.replenishmentOrders > 0, `${result.route} reached the checkpoint without proving replenishment`);
  assert(result.routeStock > 0, `${result.route} reached the checkpoint with no operating stock`);
}

console.log('first-berth-runway: ok 3/3 routes');
