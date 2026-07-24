import {
  MODULE_RESALE_REFUND_RATE,
  createInitialState,
  itemStockAtNode,
  moduleCreditBuildCost,
  sellModuleAtTile,
  setRoom,
  setTile,
  tryMoveModule,
  tryPlaceModule,
  tryPlaceModuleWithCredits
} from '../src/sim/sim';
import { ModuleType, RoomType, TileType, toIndex } from '../src/sim/types';

function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function createModuleTestState() {
  const state = createInitialState({ seed: 27182 });
  state.controls.paused = true;
  state.crewMembers = [];
  state.visitors = [];
  state.residents = [];
  state.reservations = [];
  state.jobs = [];
  state.metrics.credits = 500;
  for (let y = 6; y <= 13; y++) {
    for (let x = 6; x <= 19; x++) {
      const tile = toIndex(x, y, state.width);
      setTile(state, tile, TileType.Floor);
      setRoom(state, tile, RoomType.Cafeteria);
    }
  }
  return state;
}

function testMoveIsAtomicAndCreditNeutral(): void {
  const state = createModuleTestState();
  const source = toIndex(7, 7, state.width);
  const destination = toIndex(13, 7, state.width);
  const creditsBefore = state.metrics.credits;
  const placed = tryPlaceModuleWithCredits(state, ModuleType.Table, source, 0);
  assertCondition(placed.ok, `Table placement failed: ${placed.ok ? '' : placed.reason}`);
  const module = state.moduleInstances.find((candidate) => candidate.originTile === source);
  assertCondition(module, 'Placed table instance was not found.');
  const moduleId = module.id;
  const creditsAfterPurchase = state.metrics.credits;

  const moved = tryMoveModule(state, moduleId, destination);
  assertCondition(moved.ok, `Table move failed: ${moved.reason ?? 'unknown reason'}`);
  assertCondition(moved.module?.id === moduleId, 'Move should preserve module identity.');
  assertCondition(moved.module?.originTile === destination, 'Move should update module origin.');
  assertCondition(state.metrics.credits === creditsAfterPurchase, 'Move should not charge or refund credits.');

  const failed = tryMoveModule(state, moduleId, toIndex(0, 0, state.width));
  assertCondition(!failed.ok, 'Move into space should fail.');
  assertCondition(moved.module?.originTile === destination, 'Failed move should leave the module at its prior origin.');
  assertCondition(state.metrics.credits === creditsAfterPurchase, 'Failed move should not alter credits.');
  assertCondition(creditsBefore - creditsAfterPurchase === placed.cost, 'Purchase should still charge exactly once.');
}

function testMovePreservesInventory(): void {
  const state = createModuleTestState();
  const source = toIndex(7, 10, state.width);
  const destination = toIndex(14, 10, state.width);
  const placed = tryPlaceModuleWithCredits(state, ModuleType.ServingStation, source, 0);
  assertCondition(placed.ok, `Serving station placement failed: ${placed.ok ? '' : placed.reason}`);
  const module = state.moduleInstances.find((candidate) => candidate.originTile === source);
  assertCondition(module, 'Placed serving station instance was not found.');
  const node = state.itemNodes.find((candidate) => candidate.tileIndex === source);
  assertCondition(node, 'Serving station item node was not created.');
  node.items.meal = 7;
  node.items.cleanTray = 5;

  const moved = tryMoveModule(state, module.id, destination);
  assertCondition(moved.ok, `Stocked serving station move failed: ${moved.reason ?? 'unknown reason'}`);
  assertCondition(itemStockAtNode(state, destination, 'meal') === 7, 'Move should preserve stored meals.');
  assertCondition(itemStockAtNode(state, destination, 'cleanTray') === 5, 'Move should preserve stored trays.');
  assertCondition(itemStockAtNode(state, source, 'meal') === 0, 'Old origin should no longer hold inventory.');

  const blockedSale = sellModuleAtTile(state, destination);
  assertCondition(!blockedSale.ok, 'Selling a stocked module should be blocked.');
}

function testSaleRefundsHalfThePurchasePrice(): void {
  const state = createModuleTestState();
  const source = toIndex(8, 8, state.width);
  const creditsBefore = state.metrics.credits;
  const placed = tryPlaceModuleWithCredits(state, ModuleType.Table, source, 0);
  assertCondition(placed.ok, `Table placement failed: ${placed.ok ? '' : placed.reason}`);
  const expectedRefund = Math.floor(placed.cost * MODULE_RESALE_REFUND_RATE);
  const sold = sellModuleAtTile(state, source);
  assertCondition(sold.ok, `Table sale failed: ${sold.reason ?? 'unknown reason'}`);
  assertCondition(sold.refund === expectedRefund, `Expected ${expectedRefund} refund, got ${sold.refund}.`);
  assertCondition(
    state.metrics.credits === creditsBefore - placed.cost + expectedRefund,
    'Sale should apply only the configured partial refund.'
  );

  const scenarioSource = toIndex(16, 8, state.width);
  const scenarioPlaced = tryPlaceModule(state, ModuleType.Table, scenarioSource, 0);
  assertCondition(scenarioPlaced.ok, `Scenario table placement failed: ${scenarioPlaced.reason ?? 'unknown reason'}`);
  const scenarioSold = sellModuleAtTile(state, scenarioSource);
  const catalogRefund = Math.floor(moduleCreditBuildCost(ModuleType.Table, 0) * MODULE_RESALE_REFUND_RATE);
  assertCondition(scenarioSold.ok && scenarioSold.refund === catalogRefund, 'Legacy fixtures should use catalog resale value.');
}

testMoveIsAtomicAndCreditNeutral();
testMovePreservesInventory();
testSaleRefundsHalfThePurchasePrice();
console.log('module-edit-tests: PASS');
