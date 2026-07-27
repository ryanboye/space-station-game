import {
  assignPathToTemporarySleep,
  completeMarketCheckout,
  createInitialState,
  getRoomInspectorAt,
  tick,
  tryCreateReservation,
  tryPlaceModule
} from '../src/sim/sim';
import { resolveFacilitySlots } from '../src/sim/facility-descriptors';
import { hydrateStateFromSave, parseAndMigrateSave, serializeSave } from '../src/sim/save';
import {
  ModuleType,
  RoomType,
  TileType,
  VisitorState,
  type ModuleInstance,
  type StationState,
  type Visitor,
  toIndex
} from '../src/sim/types';
import { createVisitorNeeds } from '../src/sim/occupant-demand';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`facility-slots: ${message}`);
}

function tile(state: StationState, x: number, y: number): number {
  return toIndex(x, y, state.width);
}

function setFixtureRoom(state: StationState, room: RoomType, x: number, y: number, width: number, height: number): void {
  for (let yy = y - 1; yy <= y + height; yy++) {
    for (let xx = x - 1; xx <= x + width; xx++) {
      const index = tile(state, xx, yy);
      const boundary = xx === x - 1 || xx === x + width || yy === y - 1 || yy === y + height;
      state.tiles[index] = boundary ? TileType.Wall : TileType.Floor;
      state.rooms[index] = boundary ? RoomType.None : room;
      if (!boundary) state.pressurized[index] = true;
    }
  }
  // The room is attached immediately below the starter hull's south edge.
  const door = tile(state, x + 1, y - 1);
  state.tiles[door] = TileType.Door;
  state.rooms[door] = RoomType.None;
  state.utilityUnderlay.layers['power-conduit'].fill(1);
  state.utilityUnderlay.version += 1;
  state.topologyVersion += 1;
  state.roomVersion += 1;
}

function buildFacilityState(): StationState {
  const state = createInitialState({ seed: 33101, physicalStarterInventory: true, manualTrafficAdmission: true });
  // Starter hull ends at y=48. These rooms share its accessible south edge.
  setFixtureRoom(state, RoomType.Market, 42, 49, 10, 8);
  setFixtureRoom(state, RoomType.Dorm, 54, 49, 7, 8);
  const place = (type: ModuleType, x: number, y: number): void => {
    const result = tryPlaceModule(state, type, tile(state, x, y));
    assert(result.ok, `place ${type} at ${x},${y}: ${result.reason ?? 'unknown error'}`);
  };
  place(ModuleType.ShelfAisle, 43, 50);
  place(ModuleType.CheckoutBank, 47, 50);
  place(ModuleType.BunkBank, 55, 50);
  state.pressurized.fill(true);
  return state;
}

function fixture(state: StationState, type: ModuleType): ModuleInstance {
  const module = state.moduleInstances.find((candidate) => candidate.type === type);
  assert(module, `missing ${type}`);
  return module;
}

function makeVisitor(state: StationState, id: number, tileIndex: number): Visitor {
  return {
    id,
    name: `Fixture ${id}`,
    trait: 'patient',
    x: (tileIndex % state.width) + 0.5,
    y: Math.floor(tileIndex / state.width) + 0.5,
    tileIndex,
    state: VisitorState.ToLeisure,
    path: [],
    speed: 2,
    patience: 0,
    eatTimer: 0,
    trespassed: false,
    servedMeal: false,
    carryingMeal: false,
    reservedServingTile: null,
    reservedTargetTile: null,
    blockedTicks: 0,
    archetype: 'shopper',
    taxSensitivity: 1,
    spendMultiplier: 1,
    patienceMultiplier: 1,
    primaryPreference: 'market',
    spawnedAt: state.now,
    originShipId: null,
    airExposureSec: 0,
    healthState: 'healthy',
    leisureLegsRemaining: 0,
    leisureLegsPlanned: 0,
    lastLeisureKind: null,
    servicePlan: [],
    completedServices: [],
    activeService: null,
    stayClass: 'contract',
    needs: createVisitorNeeds(id),
    recurringNeedActive: null,
    marketTradeGoodSourceTile: null,
    temporarySleepTargetTile: null
  };
}

function reserveSlot(state: StationState, visitorId: number, targetTile: number, targetId: string): boolean {
  return tryCreateReservation(state, {
    ownerKind: 'visitor',
    ownerId: visitorId,
    kind: 'provider-slot',
    targetTile,
    targetId,
    capacity: 1,
    ttlSec: 90
  }).ok;
}

function testDescriptorRotationAndCounts(): void {
  const unrotated: ModuleInstance = {
    id: 1,
    type: ModuleType.CheckoutBank,
    originTile: 202,
    rotation: 0,
    width: 2,
    height: 5,
    tiles: Array.from({ length: 10 }, (_, index) => 202 + index)
  };
  const rotated: ModuleInstance = { ...unrotated, rotation: 90, width: 5, height: 2 };
  const checkout = resolveFacilitySlots(unrotated, 100);
  const checkoutRotated = resolveFacilitySlots(rotated, 100);
  assert(checkout.length === 2, 'CheckoutBank must expose exactly two checkout slots.');
  assert(checkout.every((slot) => slot.role === 'checkout'), 'CheckoutBank slots must all be checkout slots.');
  assert(checkoutRotated.map((slot) => `${slot.x},${slot.y}`).join('|') === '3,0|1,0', 'Checkout rotation must rotate local slot coordinates deterministically.');

  const shelf: ModuleInstance = { ...unrotated, type: ModuleType.ShelfAisle, width: 1, height: 4, tiles: [202, 302, 402, 502] };
  const bunks: ModuleInstance = { ...unrotated, type: ModuleType.BunkBank, width: 2, height: 4, tiles: Array.from({ length: 8 }, (_, index) => 202 + index) };
  assert(resolveFacilitySlots(shelf, 100).length === 3, 'ShelfAisle must expose exactly three browse slots.');
  assert(resolveFacilitySlots(bunks, 100).length === 4, 'BunkBank must expose exactly four temporary sleep slots.');
}

function testSlotExclusivityAndCapacity(): void {
  const state = buildFacilityState();
  const shelfSlot = resolveFacilitySlots(fixture(state, ModuleType.ShelfAisle), state.width)[0];
  const checkoutSlots = resolveFacilitySlots(fixture(state, ModuleType.CheckoutBank), state.width);
  const bunkSlot = resolveFacilitySlots(fixture(state, ModuleType.BunkBank), state.width)[0];
  assert(shelfSlot && bunkSlot, 'Expected fixture slots.');
  assert(reserveSlot(state, 1, shelfSlot.tileIndex, 'browse'), 'First visitor should claim browse slot.');
  assert(!reserveSlot(state, 2, shelfSlot.tileIndex, 'browse'), 'Browse slot must be exclusive.');
  assert(reserveSlot(state, 3, checkoutSlots[0].tileIndex, 'checkout'), 'First visitor should claim checkout slot.');
  assert(!reserveSlot(state, 4, checkoutSlots[0].tileIndex, 'checkout'), 'Checkout slot must be exclusive.');
  assert(reserveSlot(state, 5, bunkSlot.tileIndex, 'sleep'), 'First visitor should claim temporary sleep slot.');
  assert(!reserveSlot(state, 6, bunkSlot.tileIndex, 'sleep'), 'Temporary sleep slot must be exclusive.');

  const secondCheckout = tryPlaceModule(state, ModuleType.CheckoutBank, tile(state, 49, 50));
  assert(secondCheckout.ok, `second checkout placement failed: ${secondCheckout.reason ?? 'unknown error'}`);
  const oneBankSlots = checkoutSlots.length;
  const allCheckoutSlots = state.moduleInstances
    .filter((module) => module.type === ModuleType.CheckoutBank)
    .flatMap((module) => resolveFacilitySlots(module, state.width));
  assert(oneBankSlots === 2 && allCheckoutSlots.length === 4, 'A second CheckoutBank must double physical checkout capacity from 2 to 4.');
}

function testStockAndCheckoutAccounting(): void {
  const state = buildFacilityState();
  const shelf = fixture(state, ModuleType.ShelfAisle);
  const checkout = resolveFacilitySlots(fixture(state, ModuleType.CheckoutBank), state.width)[0];
  assert(checkout, 'Expected checkout slot.');
  const visitor = makeVisitor(state, 100, checkout.tileIndex);
  state.visitors.push(visitor);
  visitor.marketTradeGoodSourceTile = shelf.originTile;
  const creditsBeforeStockout = state.metrics.credits;
  assert(!completeMarketCheckout(state, visitor), 'No-stock market must not complete a positive sale.');
  assert(state.metrics.credits === creditsBeforeStockout, 'No-stock market must not credit the station.');

  const shelfNode = state.itemNodes.find((node) => node.tileIndex === shelf.originTile);
  assert(shelfNode, 'ShelfAisle needs a physical stock node.');
  shelfNode.items.tradeGood = 1;
  visitor.marketTradeGoodSourceTile = shelf.originTile;
  assert(
    tryCreateReservation(state, {
      ownerKind: 'visitor', ownerId: visitor.id, kind: 'source-item', targetTile: shelf.originTile,
      targetId: `market-stock:${shelf.originTile}`, itemType: 'tradeGood', capacity: 1, ttlSec: 90
    }).ok,
    'Visitor should reserve exactly one stocked good before checkout.'
  );
  assert(reserveSlot(state, visitor.id, checkout.tileIndex, 'market-checkout:test'), 'Visitor should reserve one checkout position.');
  const creditsBeforeSale = state.metrics.credits;
  assert(completeMarketCheckout(state, visitor), 'Stocked good should complete at checkout.');
  assert(shelfNode.items.tradeGood === 0, 'Checkout must consume exactly one stocked good.');
  assert(state.metrics.credits > creditsBeforeSale, 'Checkout must credit the station exactly once.');
  const creditsAfterSale = state.metrics.credits;
  assert(!completeMarketCheckout(state, visitor), 'Completed checkout cannot sell the same good twice.');
  assert(state.metrics.credits === creditsAfterSale, 'A repeated checkout must not credit twice.');
}

function testMarketBrowseToCheckoutFlow(): void {
  const state = buildFacilityState();
  const shelf = fixture(state, ModuleType.ShelfAisle);
  const shelfNode = state.itemNodes.find((node) => node.tileIndex === shelf.originTile);
  assert(shelfNode, 'ShelfAisle needs a physical stock node for the integrated flow.');
  shelfNode.items.tradeGood = 1;

  const visitor = makeVisitor(state, 150, tile(state, 44, 55));
  visitor.stayClass = 'errand';
  visitor.needs = undefined;
  visitor.recurringNeedActive = null;
  visitor.activeService = null;
  visitor.primaryPreference = 'market';
  visitor.leisureLegsRemaining = 1;
  state.visitors.push(visitor);
  state.controls.paused = false;
  const creditsBefore = state.metrics.credits;

  for (let elapsed = 0; elapsed < 30 && state.usageTotals.tradeGoodsSold < 1; elapsed += 0.1) {
    tick(state, 0.1);
  }

  assert(state.usageTotals.tradeGoodsSold === 1, 'A shopper must browse stocked shelves and complete checkout.');
  assert(shelfNode.items.tradeGood === 0, 'The integrated checkout must consume the reserved shelf item.');
  assert(state.metrics.credits > creditsBefore, 'The integrated checkout must pay the station.');
  assert(
    !state.reservations.some((reservation) => reservation.ownerId === visitor.id && reservation.releaseReason === null),
    'A completed browse-to-checkout trip must release all visitor reservations.'
  );
}

function testTemporarySleepAndHydration(): void {
  const state = buildFacilityState();
  const bunkSlot = resolveFacilitySlots(fixture(state, ModuleType.BunkBank), state.width)[0];
  assert(bunkSlot, 'Expected bunk slot.');
  // Start inside the dorm fixture so this focused test exercises the bunk
  // reservation/dwell lifecycle rather than the starter hull's external route.
  const visitor = makeVisitor(state, 200, tile(state, 56, 55));
  visitor.needs!.energy = 10;
  visitor.needs!.active = 'energy';
  visitor.recurringNeedActive = 'energy';
  visitor.activeService = 'comfort';
  state.visitors.push(visitor);
  tick(state, 0);
  const dormInspector = getRoomInspectorAt(state, fixture(state, ModuleType.BunkBank).originTile);
  assert(
    assignPathToTemporarySleep(state, visitor),
    `Long-stay visitor should reserve a BunkBank slot (${dormInspector?.reasons.join(', ') ?? 'no dorm inspector'}).`
  );
  assert(visitor.temporarySleepTargetTile !== null, 'Bunk claim must be temporary visitor state, not resident identity.');
  const sleepTile = visitor.temporarySleepTargetTile!;
  visitor.tileIndex = sleepTile;
  visitor.x = (sleepTile % state.width) + 0.5;
  visitor.y = Math.floor(sleepTile / state.width) + 0.5;
  visitor.path = [];
  state.controls.paused = false;
  tick(state, 0.1);
  assert(
    visitor.state === VisitorState.Leisure && visitor.eatTimer > 10,
    `Temporary bunk must hold the visitor for a sleep dwell (state ${visitor.state}, module ${state.modules[visitor.tileIndex]}, target ${visitor.temporarySleepTargetTile}, reserved ${visitor.reservedTargetTile}, dwell ${visitor.eatTimer}, reservations ${JSON.stringify(state.reservations.filter((reservation) => reservation.ownerId === visitor.id))}).`
  );
  for (let elapsed = 0; elapsed < 20; elapsed += 0.2) tick(state, 0.2);
  assert(visitor.needs!.energy > 50, 'Energy restores only after the temporary sleep dwell completes.');
  assert(visitor.temporarySleepTargetTile === null, 'Completed sleep must release the temporary bunk claim.');
  assert(!state.reservations.some((reservation) => reservation.ownerId === visitor.id && reservation.releaseReason === null), 'Completed sleep must release all live temporary claims.');

  assert(assignPathToTemporarySleep(state, visitor), 'Visitor should be able to claim a bunk again for save cleanup coverage.');
  const serialized = serializeSave('facility-slots', state, 'test');
  const parsed = parseAndMigrateSave(serialized);
  assert(parsed.ok, 'Facility-slot save should parse.');
  const restored = hydrateStateFromSave(parsed.save).state;
  const restoredVisitor = restored.visitors.find((candidate) => candidate.id === visitor.id);
  assert(restoredVisitor, 'Long-stay visitor should persist through save/load.');
  assert(restoredVisitor.temporarySleepTargetTile === null, 'Hydration must clear transient bunk claims.');
  assert(!restored.reservations.some((reservation) => reservation.ownerId === visitor.id && reservation.releaseReason === null), 'Hydration must not retain stale reservations.');
}

function main(): void {
  testDescriptorRotationAndCounts();
  testSlotExclusivityAndCapacity();
  testStockAndCheckoutAccounting();
  testMarketBrowseToCheckoutFlow();
  testTemporarySleepAndHydration();
  console.log('facility-slots-tests: ok');
}

main();
