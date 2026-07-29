/**
 * Focused proof that the stock starter's Sell Supplies guidance names a
 * footprint the player can actually author with the ordinary room and module
 * tools. This pins the spatial contract independently of the broad opening
 * runner, whose first unrelated failure can otherwise hide this regression.
 */

import {
  buyImportedTradeGoodsDetailed,
  createInitialState,
  quoteTravelSuppliesOrder,
  setDockPurpose,
  setRoom,
  setZone,
  tick,
  tryPlaceModuleWithCredits
} from '../src/sim';
import { OPENING_BALANCE } from '../src/sim/balance';
import { evaluateOpeningRecipes, openingRecipes } from '../src/sim/opening-recipes';
import { findPath } from '../src/sim/path';
import { getMarketFixtureStatus, getRoomClusterOperationalViews } from '../src/sim/sim';
import { computeSiteProfile } from '../src/sim/site-charter';
import { generateSystemMap } from '../src/sim/system-map';
import { ModuleType, RoomType, TileType, ZoneType, type StationState } from '../src/sim/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`opening-market-authorship: ${message}`);
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`opening-market-authorship: ${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function tile(state: StationState, x: number, y: number): number {
  return y * state.width + x;
}

function advanceUntil(
  state: StationState,
  condition: () => boolean,
  maxSeconds: number,
  failure: string
): void {
  state.controls.paused = false;
  for (let elapsed = 0; elapsed < maxSeconds; elapsed += 0.25) {
    tick(state, 0.25);
    if (condition()) return;
  }
  throw new Error(`opening-market-authorship: ${failure} after ${maxSeconds}s`);
}

const system = generateSystemMap(411);
const charter = computeSiteProfile(system, 0.5, 0.34);
const state = createInitialState({
  seed: 411,
  charter,
  physicalStarterInventory: true,
  manualTrafficAdmission: true
});
tick(state, 0);

const recipeDefinition = openingRecipes().find((recipe) => recipe.id === 'sell-supplies');
const roomInstruction = recipeDefinition?.steps.find((step) => step.kind === 'room')?.label ?? '';
assert(roomInstruction.includes('3\u00d78') && roomInstruction.includes('east apron'), 'recipe copy does not name the starter 3\u00d78 east-apron fit');

// The exact strip immediately inside the east hull: north edge beside the
// existing door, south edge on the starter hull. It is one ordinary 3x8 drag.
const marketTiles: number[] = [];
for (let y = 40; y <= 47; y += 1) {
  for (let x = 58; x <= 60; x += 1) {
    const index = tile(state, x, y);
    assertEqual(state.tiles[index], TileType.Floor, `starter apron tile ${x},${y} is not floor`);
    assertEqual(state.rooms[index], RoomType.None, `starter apron tile ${x},${y} is already a room`);
    assertEqual(state.moduleOccupancyByTile[index], null, `starter apron tile ${x},${y} is occupied`);
    setRoom(state, index, RoomType.Market);
    setZone(state, index, ZoneType.Public);
    marketTiles.push(index);
  }
}
assertEqual(marketTiles.length, 24, 'east-apron strip tile count');

// These origins leave the entire west edge of the checkout available for its
// physical queue while keeping both fixtures inside the same coherent room.
const checkoutOrigin = tile(state, 59, 43);
const shelfOrigin = tile(state, 58, 40);
const checkoutPlacement = tryPlaceModuleWithCredits(state, ModuleType.CheckoutBank, checkoutOrigin, 0);
const shelfPlacement = tryPlaceModuleWithCredits(state, ModuleType.ShelfAisle, shelfOrigin, 0);
if (!checkoutPlacement.ok) throw new Error(`opening-market-authorship: Checkout Bank placement failed: ${checkoutPlacement.reason}`);
if (!shelfPlacement.ok) throw new Error(`opening-market-authorship: Shelf Aisle placement failed: ${shelfPlacement.reason}`);
assertEqual(checkoutPlacement.cost, 120, 'Checkout Bank capital cost');
assertEqual(shelfPlacement.cost, 70, 'Shelf Aisle capital cost');
tick(state, 0);

const progress = evaluateOpeningRecipes(state).find((recipe) => recipe.id === 'sell-supplies');
assert(progress, 'Sell Supplies recipe disappeared');
const roomStep = progress.steps.find((step) => step.kind === 'room');
assertEqual(roomStep?.have, 24, 'recipe did not count the exact east-apron strip');
assert(roomStep?.satisfied, '24-tile Market step did not complete');

const entrance = tile(state, 60, 39);
assertEqual(state.tiles[entrance], TileType.Door, 'east-apron Market lost its existing north door');
for (let y = 40; y <= 47; y += 1) {
  assertEqual(
    state.utilityUnderlay.layers['power-conduit'][tile(state, 60, y)],
    1,
    `east-apron power trunk missing at 60,${y}`
  );
}
assert(marketTiles.every((index) => state.pressurized[index]), 'Market strip is not enclosed and pressurized');
const customerFrontage = tile(state, 58, 44);
assert(findPath(state, entrance, customerFrontage, true) !== null, 'door has no path to checkout frontage');
const roomView = getRoomClusterOperationalViews(state, RoomType.Market).find((view) => view.tiles.includes(checkoutOrigin));
assert(roomView?.active, `Market room is inactive: ${roomView?.reasons.join(' | ') ?? 'missing room view'}`);

const checkout = state.moduleInstances.find((module) => module.type === ModuleType.CheckoutBank && module.originTile === checkoutOrigin);
assert(checkout, 'placed Checkout Bank disappeared');
const beforeStaffing = getMarketFixtureStatus(state, checkout.id);
assert(beforeStaffing?.kind === 'checkout', 'Checkout Bank has no physical fixture status');
assertEqual(beforeStaffing.capacity, beforeStaffing.registerCount, 'each east-apron register needs one safe potential customer place');
assert(
  !progress.operationalReasons.some((reason) => reason.includes('open floor')),
  `idle readiness incorrectly blocks the opening recipe: ${progress.operationalReasons.join(' | ')}`
);

const quote = quoteTravelSuppliesOrder(state);
assert(quote.ok, quote.message);
assertEqual(quote.creditCost, 46, 'recommended-site opening stock quote');
const order = buyImportedTradeGoodsDetailed(state);
assert(order.ok, order.message);
assertEqual(order.creditCost, 46, 'charged opening stock price');
assertEqual(state.metrics.credits, OPENING_BALANCE.startingCredits - 120 - 70 - 46, 'cash remaining after complete shop purchase');
assertEqual(state.metrics.credits, 84, '320c opening leaves the advertised working cash');

// Supplier calls own the freight-capable dock while all ambient calls remain
// manual, keeping this proof about the authored shop rather than traffic luck.
const freightDock = state.docks.find((dock) => dock.podCapabilities?.includes('freight'));
assert(freightDock, 'starter has no freight-capable Pod Dock');
for (const dock of state.docks) {
  if (dock.id !== freightDock.id) setDockPurpose(state, dock.id, 'residential');
}
state.controls.manualTrafficAdmission = true;
state.controls.materialAutoImportEnabled = false;

advanceUntil(
  state,
  () => state.openingEconomy.podFreightOperations.some(
    (operation) => operation.kind === 'supplier-delivery' && operation.stockKind === 'travel-supplies' && operation.status === 'complete'
  ),
  120,
  'supplier pod did not deliver opening stock'
);
advanceUntil(
  state,
  () => evaluateOpeningRecipes(state).find((recipe) => recipe.id === 'sell-supplies')?.operational === true,
  120,
  'stocked shop never became operational'
);

const finalProgress = evaluateOpeningRecipes(state).find((recipe) => recipe.id === 'sell-supplies');
assert(finalProgress?.operational, `completed shop is not operational: ${finalProgress?.operationalReasons.join(' | ') ?? 'missing recipe'}`);
const finalCheckout = getMarketFixtureStatus(state, checkout.id);
assert(finalCheckout?.kind === 'checkout', 'staffed Checkout Bank lost its fixture status');
assertEqual(finalCheckout.capacity, beforeStaffing.capacity, 'queue readiness changed after staffing and stock delivery');
assert(finalCheckout.activeRegisters >= 1, 'starting Steward never staffed a register');
assert(
  state.itemNodes.some((node) => node.tileIndex === shelfOrigin && (node.items.tradeGood ?? 0) > 0),
  'delivered travel supplies never reached the Shelf Aisle'
);
assertEqual(finalProgress.totalCostCredits, 236, 'recipe total does not match real construction plus stock');

console.log('OPENING MARKET AUTHORSHIP: PASS');
console.log('  footprint  x58..60, y40..47 (24 PUBLIC Market tiles)');
console.log('  fixtures   Checkout Bank (59,43), Shelf Aisle (58,40), rotation 0');
console.log(`  access     door (60,39), powered x60 trunk, ${beforeStaffing.capacity} ready registers, Steward staffed`);
console.log('  economy    120c + 70c + 46c stock = 236c; 84c remains');
