import {
  buyImportedTradeGoodsDetailed,
  buyPreparedMealsDetailed,
  canPlaceUtilityUnderlay,
  createInitialState,
  generateLaneProfiles,
  getPodDockAttachmentView,
  getPreparedMealInventory,
  orderFuelDetailed,
  previewPreparedMealPurchase,
  quoteFuelOrder,
  quoteTravelSuppliesOrder,
  setDockPurpose,
  setRoom,
  setUtilityUnderlayTile,
  setZone,
  tick,
  tryPlaceModuleWithCredits
} from '../src/sim';
import { OPENING_BALANCE } from '../src/sim/balance';
import { deriveOpeningEconomyProfile, type EconomyEventKind } from '../src/sim/opening-economy';
import { evaluateOpeningRecipes, type OpeningRecipeId } from '../src/sim/opening-recipes';
import {
  ModuleType,
  RoomType,
  TileType,
  ZoneType,
  type ItemType,
  type SiteCharter,
  type StationState
} from '../src/sim/types';

const MAX_SECONDS = Number(process.env.RUNWAY_MAX_SECONDS ?? 30 * 60);
const STEP_SECONDS = 0.5;
const TRAFFIC_PER_CYCLE = 3; // Exact maximum exposed by the opening HUD slider.
const REVENUE_GATE = 500;
const PAYROLL_RESERVE_CYCLES = 2;

type RouteId = OpeningRecipeId;
type Variant = 'neutral' | 'favorable';

const ROUTES: RouteId[] = ['feed-travelers', 'sell-supplies', 'service-ships'];

const NEUTRAL_CHARTER: SiteCharter = {
  version: 1,
  x: 0.5,
  y: 0.5,
  sunFactor: 0.5,
  debrisFactor: 0.2,
  resourceType: null,
  // 1.3 maps to the profile's middle band ("Mixed traffic"), rather than the
  // low-volume edge that is explicitly labeled Remote.
  laneTrafficFactor: { north: 1.3, east: 1.3, south: 1.3, west: 1.3 }
};

const FAVORABLE_CHARTERS: Record<RouteId, SiteCharter> = {
  'feed-travelers': {
    version: 1,
    x: 0.35,
    y: 0.35,
    sunFactor: 0.55,
    debrisFactor: 0.15,
    resourceType: null,
    laneTrafficFactor: { north: 2.5, east: 2.5, south: 2.5, west: 2.5 }
  },
  'sell-supplies': {
    version: 1,
    x: 0.3,
    y: 0.4,
    sunFactor: 0.5,
    debrisFactor: 0.2,
    resourceType: 'metal',
    laneTrafficFactor: { north: 2.5, east: 2.5, south: 2.5, west: 2.5 }
  },
  'service-ships': {
    version: 1,
    x: 0.4,
    y: 0.3,
    sunFactor: 0.5,
    debrisFactor: 0.15,
    // Busy traffic plus the profile's highest fuel sale multiplier. Gas is
    // cheaper wholesale but discounts the sale price enough that it is not a
    // clearly favorable revenue charter.
    resourceType: null,
    laneTrafficFactor: { north: 2.5, east: 2.5, south: 2.5, west: 2.5 }
  }
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`opening-business-runway: ${message}`);
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

function recipe(state: StationState, id: RouteId) {
  const result = evaluateOpeningRecipes(state).find((candidate) => candidate.id === id);
  assert(result, `missing ${id} recipe`);
  return result;
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
    state.moduleInstances.filter((module) => module.type === ModuleType.FuelTank).map((module) => module.originTile)
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

function publicRoom(state: StationState, room: RoomType, width: number, height: number): number[] {
  for (let y = 1; y <= state.height - height - 1; y += 1) {
    for (let x = 1; x <= state.width - width - 1; x += 1) {
      const tiles: number[] = [];
      let valid = true;
      for (let dy = 0; dy < height && valid; dy += 1) {
        for (let dx = 0; dx < width && valid; dx += 1) {
          const tile = (y + dy) * state.width + x + dx;
          if (
            state.tiles[tile] !== TileType.Floor ||
            state.rooms[tile] !== RoomType.None ||
            state.moduleOccupancyByTile[tile] !== null
          ) valid = false;
          tiles.push(tile);
        }
      }
      if (!valid) continue;
      for (const tile of tiles) {
        setRoom(state, tile, room);
        setZone(state, tile, ZoneType.Public);
      }
      tick(state, 0);
      return tiles;
    }
  }
  throw new Error(`no free ${width}x${height} ${room} footprint in starter hull`);
}

function expandRoomCluster(
  state: StationState,
  roomTiles: number[],
  room: RoomType,
  targetTiles: number
): { tiles: number[]; displacedRooms: Record<string, number> } {
  const cluster = new Set(roomTiles);
  const displacedRooms: Record<string, number> = {};
  while (cluster.size < targetTiles) {
    let added: number | null = null;
    for (const tile of cluster) {
      const x = tile % state.width;
      const y = Math.floor(tile / state.width);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) continue;
        const candidate = ny * state.width + nx;
        if (
          cluster.has(candidate) ||
          state.tiles[candidate] !== TileType.Floor ||
          state.moduleOccupancyByTile[candidate] !== null
        ) continue;
        const displaced = state.rooms[candidate];
        if (displaced !== RoomType.None && displaced !== room) {
          displacedRooms[displaced] = (displacedRooms[displaced] ?? 0) + 1;
        }
        setRoom(state, candidate, room);
        setZone(state, candidate, ZoneType.Public);
        cluster.add(candidate);
        added = candidate;
        break;
      }
      if (added !== null) break;
    }
    assert(added !== null, `could not expand ${room} from ${cluster.size} to ${targetTiles} coherent tiles`);
  }
  tick(state, 0);
  return { tiles: [...cluster], displacedRooms };
}

function placeAt(
  state: StationState,
  origin: number,
  module: ModuleType,
  rotation: 0 | 90 = 0
): number {
  const result = tryPlaceModuleWithCredits(state, module, origin, rotation);
  if (!result.ok) throw new Error(`${module} placement failed at ${origin}: ${result.reason ?? 'unknown'}`);
  return result.cost;
}

function placeIn(state: StationState, tiles: number[], module: ModuleType): number {
  for (const rotation of [0, 90] as const) {
    for (const tile of tiles) {
      const result = tryPlaceModuleWithCredits(state, module, tile, rotation);
      if (result.ok) return result.cost;
      if (result.reason?.startsWith('Need ')) {
        throw new Error(`${module} is required but unaffordable: ${result.reason}`);
      }
    }
  }
  throw new Error(`could not place ${module} in the authored room footprint`);
}

function findOpenMaintenancePocket(state: StationState): number {
  for (let y = 0; y < state.height - 1; y += 1) {
    for (let x = 0; x < state.width - 1; x += 1) {
      const origin = y * state.width + x;
      const tiles = [origin, origin + 1, origin + state.width, origin + state.width + 1];
      if (!tiles.every((tile) =>
        state.tiles[tile] === TileType.Floor &&
        state.rooms[tile] === RoomType.None &&
        state.moduleOccupancyByTile[tile] === null
      )) continue;
      for (const tile of tiles) setRoom(state, tile, RoomType.Maintenance);
      return origin;
    }
  }
  throw new Error('no empty 2x2 Maintenance footprint in starter hull');
}

function attachFuelCoupler(state: StationState): { tile: number; dockModuleId: number; cost: number } {
  for (let tile = 0; tile < state.tiles.length; tile += 1) {
    const preview = getPodDockAttachmentView(state, ModuleType.FuelCoupler, tile);
    if (!preview.valid || preview.dockModuleId === null) continue;
    const cost = placeAt(state, tile, ModuleType.FuelCoupler);
    return { tile, dockModuleId: preview.dockModuleId, cost };
  }
  throw new Error('no valid Fuel Coupler mount beside a starter Pod Dock');
}

function adjacentFuelServiceTile(state: StationState, couplerTile: number): number {
  const x = couplerTile % state.width;
  const y = Math.floor(couplerTile / state.width);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) continue;
    const tile = ny * state.width + nx;
    if (state.tiles[tile] !== TileType.Wall && canPlaceUtilityUnderlay(state, 'fuel-pipe', tile)) return tile;
  }
  throw new Error('Fuel Coupler has no legal interior service tile');
}

function fuelPipePath(state: StationState, start: number, goal: number): number[] {
  const previous = new Int32Array(state.tiles.length).fill(-1);
  const queue = [start];
  previous[start] = start;
  for (let head = 0; head < queue.length; head += 1) {
    const tile = queue[head];
    if (tile === goal) break;
    const x = tile % state.width;
    const y = Math.floor(tile / state.width);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) continue;
      const next = ny * state.width + nx;
      if (previous[next] >= 0 || !canPlaceUtilityUnderlay(state, 'fuel-pipe', next)) continue;
      previous[next] = tile;
      queue.push(next);
    }
  }
  assert(previous[goal] >= 0, 'no legal fuel-pipe route from tank to coupler');
  const path: number[] = [];
  for (let tile = goal; tile !== start; tile = previous[tile]) path.push(tile);
  path.push(start);
  return path.reverse();
}

function setAllPodDocks(state: StationState, purpose: 'visitor' | 'residential'): void {
  for (const dock of state.docks) {
    if (dock.sourceKind === 'pod-dock-module') setDockPurpose(state, dock.id, purpose);
  }
}

type SetupResult = {
  constructionSpend: number;
  initialOrderSpend: number;
  initialOrderUnits: number;
  fuelDockId: number | null;
  caveats: string[];
};

function setupRoute(state: StationState, route: RouteId): SetupResult {
  let constructionSpend = 0;
  let initialOrderSpend = 0;
  let initialOrderUnits = 0;
  let fuelDockId: number | null = null;
  const caveats: string[] = [];

  if (route === 'feed-travelers') {
    const authoredCafeteriaTiles = state.rooms
      .map((room, tile) => room === RoomType.Cafeteria ? tile : -1)
      .filter((tile) => tile >= 0);
    assert(authoredCafeteriaTiles.length > 0, 'starter has no Cafeteria to convert');
    for (const tile of authoredCafeteriaTiles) setZone(state, tile, ZoneType.Public);
    tick(state, 0);
    const expanded = expandRoomCluster(state, authoredCafeteriaTiles, RoomType.Cafeteria, 20);
    const cafeteriaTiles = expanded.tiles;
    const requirements: Array<[ModuleType, number]> = [
      [ModuleType.ServingStation, 2],
      [ModuleType.Table, 2],
      [ModuleType.TrayReturn, 1]
    ];
    for (const [module, required] of requirements) {
      let present = state.moduleInstances.filter(
        (instance) => instance.type === module && cafeteriaTiles.includes(instance.originTile)
      ).length;
      while (present < required) {
        constructionSpend += placeIn(state, cafeteriaTiles, module);
        present += 1;
      }
    }
    tick(state, 0);
    const purchase = buyPreparedMealsDetailed(state);
    if (purchase.ok) {
      initialOrderSpend += purchase.creditCost;
      initialOrderUnits += purchase.added;
    } else {
      assert(purchase.reason === 'counter_capacity', `prepared-meal order failed: ${purchase.message}`);
      caveats.push(`Opening meal order is blocked by the full starter counters (${purchase.message}); the measurable conversion necessarily starts on the authored crew reserve.`);
    }
    caveats.push(`Uses the authored ${authoredCafeteriaTiles.length}-tile crew mess and its fixtures, expands it to 20 tiles, and rezones it Public; these are normal player actions but remove the private mess.`);
    if (Object.keys(expanded.displacedRooms).length > 0) {
      caveats.push(`The nearest legal 20-tile conversion repaints existing room tiles: ${JSON.stringify(expanded.displacedRooms)}.`);
    }
  } else if (route === 'sell-supplies') {
    const tiles = publicRoom(state, RoomType.Market, 3, 8);
    constructionSpend += placeAt(state, tiles[1], ModuleType.CheckoutBank);
    constructionSpend += placeAt(state, tiles[12], ModuleType.ShelfAisle);
    tick(state, 0);
    const order = buyImportedTradeGoodsDetailed(state);
    assert(order.ok, order.message);
    initialOrderSpend += order.creditCost;
    initialOrderUnits += order.requestedAmount;
  } else {
    const tankOrigin = findOpenMaintenancePocket(state);
    const coupler = attachFuelCoupler(state);
    constructionSpend += coupler.cost;
    constructionSpend += placeAt(state, tankOrigin, ModuleType.FuelTank);
    const serviceTile = adjacentFuelServiceTile(state, coupler.tile);
    for (const tile of fuelPipePath(state, tankOrigin, serviceTile)) {
      if (state.utilityUnderlay.layers['fuel-pipe'][tile]) continue;
      assert(setUtilityUnderlayTile(state, 'fuel-pipe', tile, true), `fuel pipe placement failed at ${tile}`);
    }
    tick(state, 0);
    const dock = state.docks.find((candidate) => candidate.moduleId === coupler.dockModuleId);
    assert(dock, 'Fuel Coupler did not attach to a live Pod Dock');
    fuelDockId = dock.id;
    const order = orderFuelDetailed(state);
    assert(order.ok, order.message);
    initialOrderSpend += order.creditCost;
    initialOrderUnits += order.requestedAmount;
  }

  return { constructionSpend, initialOrderSpend, initialOrderUnits, fuelDockId, caveats };
}

function routeFamily(route: RouteId): 'food' | 'supplies' | 'shipService' {
  return route === 'feed-travelers' ? 'food' : route === 'sell-supplies' ? 'supplies' : 'shipService';
}

function routeSaleCount(state: StationState, route: RouteId): number {
  if (route === 'service-ships') return state.openingEconomy.ledger.lifetime['fuel-sale'].count;
  // Only one opening route is built per run, so every retail-sale belongs to
  // that route. Use the lifetime rollup instead of the bounded recent window.
  return state.openingEconomy.ledger.lifetime['retail-sale'].count;
}

function revenueByKind(state: StationState): Partial<Record<EconomyEventKind, number>> {
  const result: Partial<Record<EconomyEventKind, number>> = {};
  for (const [kind, summary] of Object.entries(state.openingEconomy.ledger.lifetime)) {
    if (summary.revenue > 0) result[kind as EconomyEventKind] = Number(summary.revenue.toFixed(2));
  }
  return result;
}

type RunResult = {
  route: RouteId;
  variant: Variant;
  charterProfile: {
    siteTag: string;
    trafficLabel: string;
    passengerTrafficMultiplier: number;
    retailDemandMultiplier: number;
    supplyWholesaleMultiplier: number;
    fuelWholesaleMultiplier: number;
    fuelSaleMultiplier: number;
  };
  recipeAtStart: {
    totalCostCredits: number;
    remainingCostCredits: number;
    paidProgressValueCredits: number;
  };
  setup: Omit<SetupResult, 'fuelDockId' | 'caveats'> & {
    builtAfterActions: boolean;
    operationalAfterActions: boolean;
    reasonsAfterActions: string[];
    completeAtSec: number | null;
    operationalAtSec: number | null;
  };
  outcome: 'gate-reached' | 'timeout' | 'bankrupt';
  simulatedSeconds: number;
  gateAtSec: number | null;
  firstSaleAtSec: number | null;
  lowestCredits: number;
  endingCredits: number;
  earnedRevenue: number;
  revenueByKind: Partial<Record<EconomyEventKind, number>>;
  constructionSpend: number;
  procurementSpend: number;
  payrollSpend: number;
  replenishmentOrders: number;
  replenishmentUnits: number;
  routeSales: number;
  routeStockEnding: number;
  stockoutSeconds: number;
  missedPayrollCycles: number;
  demand: { wanted: number; served: number; missed: number; missedCreditsAllFamilies: number };
  hiddenStarterSupport: { stockUnits: number; paidStepValueCredits: number };
  caveats: string[];
  judgmentFlags: string[];
};

function run(route: RouteId, variant: Variant): RunResult {
  const charter = structuredClone(variant === 'neutral' ? NEUTRAL_CHARTER : FAVORABLE_CHARTERS[route]);
  const state = createInitialState({ seed: 411, physicalStarterInventory: true, manualTrafficAdmission: false });
  state.site = charter;
  state.laneProfiles = generateLaneProfiles(state);
  tick(state, 0);
  assert(state.metrics.credits === OPENING_BALANCE.startingCredits, `starter cash is ${state.metrics.credits}, expected 320`);
  assert(state.metrics.creditsEarnedLifetime === 0, 'fresh state invented opening revenue');

  const startRecipe = recipe(state, route);
  const initialRouteStock = routeStock(state, route);
  const paidProgressValueCredits = startRecipe.steps.reduce((sum, step) => {
    if (step.costCredits <= 0 || step.count <= 0) return sum;
    return sum + Math.min(step.count, step.have) * (step.costCredits / step.count);
  }, 0);
  const setup = setupRoute(state, route);
  const afterSetupRecipe = recipe(state, route);
  const constructionLedgerAfterSetup = state.openingEconomy.ledger.lifetime.construction.expenses;
  assert(
    Math.abs(constructionLedgerAfterSetup - setup.constructionSpend) < 0.001,
    `${route} setup construction accounting drifted: result ${setup.constructionSpend}, ledger ${constructionLedgerAfterSetup}`
  );
  assert(
    Math.abs(state.openingEconomy.ledger.lifetime['supplier-purchase'].expenses - setup.initialOrderSpend) < 0.001,
    `${route} setup procurement accounting drifted`
  );

  state.controls.paused = false;
  state.controls.manualTrafficAdmission = false;
  state.controls.shipsPerCycle = TRAFFIC_PER_CYCLE;
  setAllPodDocks(state, 'visitor');

  let setupCompleteAtSec: number | null = null;
  let operationalAtSec: number | null = null;
  let gateAtSec: number | null = null;
  let firstSaleAtSec: number | null = null;
  let lowestCredits = state.metrics.credits;
  let stockoutSeconds = 0;
  let replenishmentOrders = 0;
  let replenishmentUnits = 0;
  let previousSales = routeSaleCount(state, route);
  let outcome: RunResult['outcome'] = 'timeout';
  const canReplenish = (cost: number): boolean =>
    state.metrics.credits >= cost + state.crew.total * PAYROLL_RESERVE_CYCLES;

  for (let elapsed = 0; elapsed < MAX_SECONDS; elapsed += STEP_SECONDS) {
    if (route === 'service-ships' && setup.fuelDockId !== null) {
      const pendingFuel = state.openingEconomy.podFreightOperations.some(
        (operation) => operation.kind === 'supplier-delivery' && operation.stockKind === 'fuel' && operation.status !== 'complete'
      );
      if (!pendingFuel && fuelStock(state) > 0) {
        for (const dock of state.docks) {
          if (dock.sourceKind === 'pod-dock-module') setDockPurpose(state, dock.id, dock.id === setup.fuelDockId ? 'visitor' : 'residential');
        }
      }
    }

    tick(state, STEP_SECONDS);
    lowestCredits = Math.min(lowestCredits, state.metrics.credits);
    const currentRecipe = recipe(state, route);
    if (currentRecipe.built && setupCompleteAtSec === null) setupCompleteAtSec = state.now;
    if (currentRecipe.operational && operationalAtSec === null) operationalAtSec = state.now;
    if (operationalAtSec !== null && routeStock(state, route) < 0.95) stockoutSeconds += STEP_SECONDS;

    const sales = routeSaleCount(state, route);
    if (sales > previousSales && firstSaleAtSec === null) firstSaleAtSec = state.now;
    previousSales = sales;

    if (state.metrics.creditsEarnedLifetime >= REVENUE_GATE) {
      gateAtSec = state.now;
      outcome = 'gate-reached';
      break;
    }

    const pendingSupplier = state.openingEconomy.podFreightOperations.some(
      (operation) => operation.kind === 'supplier-delivery' && operation.status !== 'complete' && operation.status !== 'cancelled' && operation.status !== 'expired'
    );
    if (route === 'feed-travelers' && routeStock(state, route) <= 3) {
      const preview = previewPreparedMealPurchase(state);
      const order = preview.ok && canReplenish(preview.creditCost) ? buyPreparedMealsDetailed(state) : null;
      if (order?.ok) {
        replenishmentOrders += 1;
        replenishmentUnits += order.added;
      }
    } else if (route === 'sell-supplies' && routeStock(state, route) <= 4 && !pendingSupplier) {
      const quote = quoteTravelSuppliesOrder(state);
      const order = quote.ok && canReplenish(quote.creditCost) ? buyImportedTradeGoodsDetailed(state) : null;
      if (order?.ok) {
        replenishmentOrders += 1;
        replenishmentUnits += order.requestedAmount;
      }
    } else if (route === 'service-ships' && routeStock(state, route) <= 8 && !pendingSupplier) {
      const quote = quoteFuelOrder(state);
      const order = quote.ok && canReplenish(quote.creditCost) ? orderFuelDetailed(state) : null;
      if (order?.ok) {
        setAllPodDocks(state, 'visitor');
        replenishmentOrders += 1;
        replenishmentUnits += order.requestedAmount;
      }
    }

    const missedPayrollCycles = Math.max(0, ...state.crewMembers.map((crew) => crew.missedPayrollCycles));
    if (missedPayrollCycles > 0 && state.metrics.credits <= 0) {
      outcome = 'bankrupt';
      break;
    }
  }

  const family = routeFamily(route);
  const wanted = state.openingEconomy.podDemand.lifetimeWanted[family];
  const served = state.openingEconomy.podDemand.lifetimeServed[family];
  const missedPayrollCycles = Math.max(0, ...state.crewMembers.map((crew) => crew.missedPayrollCycles));
  const judgmentFlags: string[] = [];
  if (gateAtSec === null) judgmentFlags.push('revenue-gate-not-reached');
  if (outcome === 'bankrupt' || missedPayrollCycles > 0) judgmentFlags.push('payroll-failure');
  if (stockoutSeconds > 0) judgmentFlags.push('stockout');
  if (paidProgressValueCredits > 0 || initialRouteStock > 0) judgmentFlags.push('starter-subsidy');
  if (operationalAtSec === null) judgmentFlags.push('never-operational');
  else if (operationalAtSec > 120) judgmentFlags.push('slow-activation');
  if (wanted > 0 && served / wanted < 0.5) judgmentFlags.push('low-demand-conversion');
  if (served <= 0 && wanted > 0) judgmentFlags.push('route-demand-unserved');
  if (routeSaleCount(state, route) <= 0) judgmentFlags.push('no-route-sale');

  assert(state.metrics.creditsEarnedLifetime >= 0, `${route} revenue became negative`);
  assert(routeStock(state, route) >= -0.001, `${route} stock became negative`);
  if (gateAtSec !== null) assert(state.metrics.creditsEarnedLifetime >= REVENUE_GATE, `${route} gate time recorded before gate`);

  const profile = deriveOpeningEconomyProfile(charter);
  return {
    route,
    variant,
    charterProfile: {
      siteTag: profile.siteTag,
      trafficLabel: profile.trafficLabel,
      passengerTrafficMultiplier: round(profile.passengerTrafficMultiplier),
      retailDemandMultiplier: round(profile.retailDemandMultiplier),
      supplyWholesaleMultiplier: round(profile.supplyWholesaleMultiplier),
      fuelWholesaleMultiplier: round(profile.fuelWholesaleMultiplier),
      fuelSaleMultiplier: round(profile.fuelSaleMultiplier)
    },
    recipeAtStart: {
      totalCostCredits: startRecipe.totalCostCredits,
      remainingCostCredits: startRecipe.remainingCostCredits,
      paidProgressValueCredits: Number(paidProgressValueCredits.toFixed(2))
    },
    setup: {
      constructionSpend: setup.constructionSpend,
      initialOrderSpend: setup.initialOrderSpend,
      initialOrderUnits: setup.initialOrderUnits,
      builtAfterActions: afterSetupRecipe.built,
      operationalAfterActions: afterSetupRecipe.operational,
      reasonsAfterActions: afterSetupRecipe.operationalReasons,
      completeAtSec: setupCompleteAtSec,
      operationalAtSec
    },
    outcome,
    simulatedSeconds: Number(state.now.toFixed(1)),
    gateAtSec: gateAtSec === null ? null : Number(gateAtSec.toFixed(1)),
    firstSaleAtSec: firstSaleAtSec === null ? null : Number(firstSaleAtSec.toFixed(1)),
    lowestCredits: Number(lowestCredits.toFixed(2)),
    endingCredits: Number(state.metrics.credits.toFixed(2)),
    earnedRevenue: Number(state.metrics.creditsEarnedLifetime.toFixed(2)),
    revenueByKind: revenueByKind(state),
    constructionSpend: Number(state.openingEconomy.ledger.lifetime.construction.expenses.toFixed(2)),
    procurementSpend: Number(state.openingEconomy.ledger.lifetime['supplier-purchase'].expenses.toFixed(2)),
    payrollSpend: Number(state.openingEconomy.ledger.lifetime.wages.expenses.toFixed(2)),
    replenishmentOrders,
    replenishmentUnits,
    routeSales: routeSaleCount(state, route),
    routeStockEnding: Number(routeStock(state, route).toFixed(2)),
    stockoutSeconds: Number(stockoutSeconds.toFixed(1)),
    missedPayrollCycles,
    demand: {
      wanted,
      served,
      missed: Math.max(0, wanted - served),
      missedCreditsAllFamilies: state.openingEconomy.podDemand.lifetimeMissedCredits
    },
    hiddenStarterSupport: {
      stockUnits: Number(initialRouteStock.toFixed(2)),
      paidStepValueCredits: Number(paidProgressValueCredits.toFixed(2))
    },
    caveats: setup.caveats,
    judgmentFlags
  };
}

const results: RunResult[] = [];
for (const route of ROUTES) {
  if (process.env.RUNWAY_ROUTE && process.env.RUNWAY_ROUTE !== route) continue;
  for (const variant of ['neutral', 'favorable'] as const) {
    if (process.env.RUNWAY_VARIANT && process.env.RUNWAY_VARIANT !== variant) continue;
    results.push(run(route, variant));
  }
}

console.log(JSON.stringify({
  assumptions: {
    seed: 411,
    startingCredits: OPENING_BALANCE.startingCredits,
    trafficPerCycle: TRAFFIC_PER_CYCLE,
    revenueGate: REVENUE_GATE,
    maxSimulatedSeconds: MAX_SECONDS,
    stepSeconds: STEP_SECONDS,
    noCapitalProjects: true,
    noPostPurchaseCreditOrRevenueSeeding: true,
    replenishmentPayrollReserveCycles: PAYROLL_RESERVE_CYCLES
  },
  results
}, null, 2));
