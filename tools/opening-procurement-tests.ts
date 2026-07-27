import {
  buyImportedTradeGoodsDetailed,
  createInitialState,
  orderFuelDetailed,
  quoteFuelOrder,
  quoteTravelSuppliesOrder,
  setDockPurpose,
  setRoom,
  tick,
  tryPlaceModule
} from '../src/sim';
import { MODULE_DEFINITIONS, OPENING_BALANCE } from '../src/sim/balance';
import { deriveOpeningEconomyProfile } from '../src/sim/opening-economy';
import { evaluateOpeningRecipes, openingRecipes } from '../src/sim/opening-recipes';
import { ModuleType, RoomType, TileType, type SiteCharter, type StationState } from '../src/sim/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
}

function charteredOpening() {
  const state = createInitialState({ physicalStarterInventory: true, manualTrafficAdmission: true });
  state.site = {
    version: 1,
    x: 0.2,
    y: 0.7,
    sunFactor: 0.35,
    debrisFactor: 0.2,
    resourceType: 'gas',
    laneTrafficFactor: { north: 0.65, east: 0.65, south: 0.65, west: 0.65 }
  } satisfies SiteCharter;
  tick(state, 0);
  return state;
}

function emptyFixtureStock(state: ReturnType<typeof charteredOpening>, moduleType: ModuleType, item: 'tradeGood' | 'fuel'): void {
  const origins = new Set(
    state.moduleInstances.filter((module) => module.type === moduleType).map((module) => module.originTile)
  );
  for (const node of state.itemNodes) {
    if (origins.has(node.tileIndex)) node.items[item] = 0;
  }
}

function ensureFixture(
  state: ReturnType<typeof charteredOpening>,
  room: RoomType,
  module: ModuleType
): void {
  if (state.moduleInstances.some((instance) => instance.type === module)) return;
  const definition = MODULE_DEFINITIONS[module];
  for (let y = 0; y <= state.height - definition.height; y += 1) {
    for (let x = 0; x <= state.width - definition.width; x += 1) {
      const origin = y * state.width + x;
      const tiles: number[] = [];
      for (let dy = 0; dy < definition.height; dy += 1) {
        for (let dx = 0; dx < definition.width; dx += 1) tiles.push((y + dy) * state.width + x + dx);
      }
      if (!tiles.every((tile) => state.tiles[tile] === TileType.Floor && state.moduleOccupancyByTile[tile] === null)) continue;
      for (const tile of tiles) setRoom(state, tile, room);
      const placed = tryPlaceModule(state, module, origin, 0);
      if (placed.ok) {
        tick(state, 0);
        return;
      }
    }
  }
  throw new Error(`could not place ${module} for procurement test`);
}

function stockStep(state: ReturnType<typeof charteredOpening>, recipeId: 'sell-supplies' | 'service-ships') {
  const recipe = evaluateOpeningRecipes(state).find((entry) => entry.id === recipeId);
  assert(recipe, `missing ${recipeId} recipe`);
  const step = recipe.steps.find((entry) => entry.kind === 'stock');
  assert(step, `missing ${recipeId} stock step`);
  return step;
}

function fuelStock(state: StationState): number {
  const tanks = new Set(
    state.moduleInstances.filter((module) => module.type === ModuleType.FuelTank).map((module) => module.originTile)
  );
  return state.itemNodes.reduce((sum, node) => sum + (tanks.has(node.tileIndex) ? node.items.fuel ?? 0 : 0), 0);
}

function routeSupplierTrafficToFreightDock(state: StationState): void {
  const freightDock = state.docks.find((dock) => dock.podCapabilities?.includes('freight'));
  assert(freightDock, 'starter needs a freight-capable Pod Dock');
  for (const dock of state.docks) {
    if (dock.id !== freightDock.id) setDockPurpose(state, dock.id, 'residential');
  }
  state.controls.paused = false;
  state.controls.manualTrafficAdmission = true;
  state.controls.materialAutoImportEnabled = false;
}

function advanceUntil(state: StationState, condition: () => boolean, seconds: number, message: string): void {
  for (let elapsed = 0; elapsed < seconds; elapsed += 1) {
    tick(state, 1);
    if (condition()) return;
  }
  throw new Error(`${message} after ${seconds}s`);
}

function testSiteAdjustedQuotesMatchRecipesAndCharges(): void {
  const state = charteredOpening();
  ensureFixture(state, RoomType.Market, ModuleType.MarketStall);
  ensureFixture(state, RoomType.Maintenance, ModuleType.FuelTank);
  emptyFixtureStock(state, ModuleType.MarketStall, 'tradeGood');
  emptyFixtureStock(state, ModuleType.FuelTank, 'fuel');

  const profile = deriveOpeningEconomyProfile(state.site);
  const suppliesQuote = quoteTravelSuppliesOrder(state);
  const fuelQuote = quoteFuelOrder(state);
  assertEqual(
    suppliesQuote.creditCost,
    Math.round(OPENING_BALANCE.travelSupplyBatch.costCredits * profile.supplyWholesaleMultiplier),
    'travel-supplies quote uses the charter wholesale multiplier'
  );
  assertEqual(
    fuelQuote.creditCost,
    Math.round(OPENING_BALANCE.fuelLot.costCredits * profile.fuelWholesaleMultiplier),
    'fuel quote uses the charter wholesale multiplier'
  );
  assertEqual(stockStep(state, 'sell-supplies').costCredits, suppliesQuote.creditCost, 'supply recipe price matches quote');
  assertEqual(stockStep(state, 'service-ships').costCredits, fuelQuote.creditCost, 'fuel recipe price matches quote');

  const creditsBeforeSupplies = state.metrics.credits;
  const suppliesOrder = buyImportedTradeGoodsDetailed(state);
  assert(suppliesOrder.ok, suppliesOrder.message);
  assertEqual(suppliesOrder.creditCost, suppliesQuote.creditCost, 'supply order price matches quote');
  assertEqual(state.metrics.credits, creditsBeforeSupplies - suppliesQuote.creditCost, 'supply order charges quoted price');
  assert(
    state.openingEconomy.podFreightOperations.some((operation) =>
      operation.kind === 'supplier-delivery' && operation.stockKind === 'travel-supplies' && operation.status === 'ordered'
    ),
    'supply order creates an ordered supplier delivery'
  );
  const duplicateSupplies = buyImportedTradeGoodsDetailed(state);
  assert(!duplicateSupplies.ok && duplicateSupplies.reason === 'delivery_pending', 'duplicate supply orders are rejected');

  const creditsBeforeFuel = state.metrics.credits;
  const fuelOrder = orderFuelDetailed(state);
  assert(fuelOrder.ok, fuelOrder.message);
  assertEqual(fuelOrder.creditCost, fuelQuote.creditCost, 'fuel order price matches quote');
  assertEqual(state.metrics.credits, creditsBeforeFuel - fuelQuote.creditCost, 'fuel order charges quoted price');
  assert(
    state.openingEconomy.podFreightOperations.some((operation) =>
      operation.kind === 'supplier-delivery' && operation.stockKind === 'fuel' && operation.status === 'ordered'
    ),
    'fuel order creates an ordered fuel supplier delivery'
  );
  const duplicateFuel = orderFuelDetailed(state);
  assert(!duplicateFuel.ok && duplicateFuel.reason === 'delivery_pending', 'duplicate fuel orders are rejected');
  const purchases = state.openingEconomy.ledger.recent.filter((event) => event.kind === 'supplier-purchase');
  assertEqual(purchases.length, 2, 'one ledger charge per procurement order');
}

function testFuelOrderRefusalsAndArrival(): void {
  const noTank = charteredOpening();
  assertEqual(orderFuelDetailed(noTank).reason, 'no_fuel_tank', 'fuel requires a Fuel Tank');

  const noFreightDock = charteredOpening();
  ensureFixture(noFreightDock, RoomType.Maintenance, ModuleType.FuelTank);
  noFreightDock.docks = noFreightDock.docks.filter((dock) => !dock.podCapabilities?.includes('freight'));
  assertEqual(orderFuelDetailed(noFreightDock).reason, 'no_freight_dock', 'fuel requires freight delivery access');

  const fullTank = charteredOpening();
  ensureFixture(fullTank, RoomType.Maintenance, ModuleType.FuelTank);
  const tankNode = fullTank.itemNodes.find((node) => fullTank.modules[node.tileIndex] === ModuleType.FuelTank);
  assert(tankNode, 'starter Fuel Tank has no item node');
  tankNode.items.fuel = tankNode.capacity;
  assertEqual(orderFuelDetailed(fullTank).reason, 'insufficient_capacity', 'fuel requires tank capacity');

  const poor = charteredOpening();
  ensureFixture(poor, RoomType.Maintenance, ModuleType.FuelTank);
  poor.metrics.credits = 0;
  assertEqual(orderFuelDetailed(poor).reason, 'insufficient_credits', 'fuel quotes before charging');

  const state = charteredOpening();
  ensureFixture(state, RoomType.Maintenance, ModuleType.FuelTank);
  routeSupplierTrafficToFreightDock(state);
  emptyFixtureStock(state, ModuleType.FuelTank, 'fuel');
  const quote = quoteFuelOrder(state);
  const creditsBefore = state.metrics.credits;
  const fuelBefore = fuelStock(state);
  const order = orderFuelDetailed(state);
  assert(order.ok, order.message);
  assertEqual(state.metrics.credits, creditsBefore - quote.creditCost, 'fuel charged once on order');
  const delivery = state.openingEconomy.podFreightOperations.find(
    (operation) => operation.kind === 'supplier-delivery' && operation.stockKind === 'fuel'
  );
  assert(delivery, 'fuel order did not create a supplier delivery');
  advanceUntil(
    state,
    () => state.openingEconomy.podFreightOperations.some((operation) => operation.id === delivery.id && operation.status === 'complete'),
    120,
    'fuel supplier delivery did not complete'
  );
  assertEqual(fuelStock(state), fuelBefore + OPENING_BALANCE.fuelLot.units, 'fuel unloaded into Fuel Tanks');
  const purchases = state.openingEconomy.ledger.recent.filter((event) => event.kind === 'supplier-purchase');
  assertEqual(purchases.length, 1, 'fuel arrival did not charge a second time');
  assertEqual(-purchases[0].credits, quote.creditCost, 'fuel ledger charge matches quote');
}

function testRecipeStockActionsAreDistinct(): void {
  const expected = {
    'feed-travelers': 'prepared-meals',
    'sell-supplies': 'travel-supplies',
    'service-ships': 'fuel'
  } as const;
  for (const recipe of openingRecipes()) {
    const stock = recipe.steps.find((step) => step.kind === 'stock');
    assert(stock, `${recipe.id} has no stock step`);
    assertEqual(stock.stockKind, expected[recipe.id], `${recipe.id} stock action metadata`);
  }
  const mealRecipe = openingRecipes().find((recipe) => recipe.id === 'feed-travelers');
  const mealStep = mealRecipe?.steps.find((step) => step.kind === 'stock');
  assertEqual(mealStep?.costCredits, OPENING_BALANCE.preparedMealBatch.costCredits, 'prepared meal price remains fixed');

  const state = charteredOpening();
  const remaining = evaluateOpeningRecipes(state).map((recipe) => recipe.remainingCostCredits);
  assert(remaining.every((cost) => cost <= state.metrics.credits), 'a chartered opening must leave every route individually viable');
  for (let left = 0; left < remaining.length; left += 1) {
    for (let right = left + 1; right < remaining.length; right += 1) {
      assert(
        remaining[left] + remaining[right] > state.metrics.credits,
        'opening cash should support one capital route at a time, not two complete routes'
      );
    }
  }
}

testSiteAdjustedQuotesMatchRecipesAndCharges();
testFuelOrderRefusalsAndArrival();
testRecipeStockActionsAreDistinct();
console.log('PASS opening procurement truth');
