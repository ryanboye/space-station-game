import {
  assignPathToTemporarySleep,
  completeMarketCheckout,
  createInitialState,
  getCrewSustainabilitySummary,
  getMarketFixtureStatus,
  getRoomInspectorAt,
  hireStaffRole,
  isCrewHoldingProtectedPost,
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
  setFixtureRoom(state, RoomType.Market, 42, 49, 18, 8);
  setFixtureRoom(state, RoomType.Dorm, 62, 49, 7, 8);
  for (let y = 49; y < 57; y++) {
    for (let x = 62; x < 69; x++) state.roomHousingPolicies[tile(state, x, y)] = 'visitor';
  }
  const place = (type: ModuleType, x: number, y: number): void => {
    const result = tryPlaceModule(state, type, tile(state, x, y));
    assert(result.ok, `place ${type} at ${x},${y}: ${result.reason ?? 'unknown error'}`);
  };
  place(ModuleType.ShelfAisle, 43, 50);
  place(ModuleType.CheckoutBank, 47, 50);
  place(ModuleType.BunkBank, 63, 50);
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
    temporarySleepTargetTile: null,
    queueProviderTile: null,
    queueJoinedAt: null
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

function marketSlots(state: StationState, role: 'checkout' | 'checkout-staff') {
  return resolveFacilitySlots(fixture(state, ModuleType.CheckoutBank), state.width).filter((slot) => slot.role === role);
}

function staffMarketRegisters(state: StationState, count: number): void {
  const staffSlots = state.moduleInstances
    .filter((module) => module.type === ModuleType.CheckoutBank)
    .flatMap((module) => resolveFacilitySlots(module, state.width).filter((slot) => slot.role === 'checkout-staff'))
    .sort((a, b) => a.tileIndex - b.tileIndex);
  assert(staffSlots.length >= count, `need ${count} market staff slots`);
  state.metrics.credits = Math.max(state.metrics.credits, 10_000);
  while (state.crewMembers.length < count) {
    assert(hireStaffRole(state, 'steward'), 'could not hire Steward for market fixture');
  }
  for (let index = 0; index < count; index += 1) {
    const crew = state.crewMembers[index];
    const slot = staffSlots[index];
    crew.staffRole = 'steward';
    crew.assignedSystem = 'market';
    crew.lastSystem = 'market';
    crew.role = 'cafeteria';
    crew.targetTile = slot.tileIndex;
    crew.tileIndex = slot.tileIndex;
    crew.x = (slot.tileIndex % state.width) + 0.5;
    crew.y = Math.floor(slot.tileIndex / state.width) + 0.5;
    crew.path = [];
    crew.resting = false;
    crew.shiftBucket = 0;
    crew.energy = 100;
    crew.hunger = 100;
    crew.hygiene = 100;
    crew.bladder = 100;
    crew.thirst = 100;
    crew.morale = 100;
    crew.retargetAt = state.now + 120;
    crew.taskLockUntil = state.now + 120;
  }
}

function addShoppers(state: StationState, count: number, stockPerShelf = count): Visitor[] {
  for (const shelf of state.moduleInstances.filter((module) => module.type === ModuleType.ShelfAisle)) {
    const node = state.itemNodes.find((candidate) => candidate.tileIndex === shelf.originTile);
    assert(node, 'ShelfAisle needs a stock node.');
    node.items.tradeGood = stockPerShelf;
  }
  const shoppers: Visitor[] = [];
  for (let index = 0; index < count; index += 1) {
    const visitor = makeVisitor(state, 500 + index, tile(state, 44 + (index % 3), 55));
    visitor.stayClass = 'errand';
    visitor.needs = undefined;
    visitor.recurringNeedActive = null;
    visitor.activeService = null;
    visitor.primaryPreference = 'market';
    visitor.leisureLegsRemaining = 1;
    state.visitors.push(visitor);
    shoppers.push(visitor);
  }
  return shoppers;
}

function runFor(state: StationState, seconds: number): void {
  state.controls.paused = false;
  for (let elapsed = 0; elapsed < seconds; elapsed += 0.1) tick(state, 0.1);
}

/** Saturated checkout harness: browsing/reserving is proven separately;
 * this starts a simultaneous crowd carrying a real claimed shelf good. */
function addCheckoutReadyShoppers(state: StationState, count: number): void {
  const shelf = fixture(state, ModuleType.ShelfAisle);
  const node = state.itemNodes.find((candidate) => candidate.tileIndex === shelf.originTile);
  assert(node, 'ShelfAisle needs a stock node.');
  node.items.tradeGood = count;
  for (let index = 0; index < count; index += 1) {
    const visitor = makeVisitor(state, 700 + index, tile(state, 44 + (index % 3), 55));
    visitor.marketTradeGoodSourceTile = shelf.originTile;
    assert(
      tryCreateReservation(state, {
        ownerKind: 'visitor',
        ownerId: visitor.id,
        kind: 'source-item',
        targetTile: shelf.originTile,
        targetId: `market-stock:${shelf.originTile}`,
        itemType: 'tradeGood',
        amount: 1,
        capacity: count,
        ttlSec: 100
      }).ok,
      'Checkout-ready shopper must reserve its physical shelf item.'
    );
    state.visitors.push(visitor);
  }
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
  const customerRegisters = checkout.filter((slot) => slot.role === 'checkout');
  const staffRegisters = checkout.filter((slot) => slot.role === 'checkout-staff');
  assert(customerRegisters.length === 2, 'CheckoutBank must expose exactly two customer registers.');
  assert(staffRegisters.length === 2, 'CheckoutBank must expose a matching staff-side slot for each register.');
  assert(checkoutRotated.filter((slot) => slot.role === 'checkout').map((slot) => `${slot.x},${slot.y}`).join('|') === '3,0|1,0', 'Checkout rotation must rotate customer slots deterministically.');

  const shelf: ModuleInstance = { ...unrotated, type: ModuleType.ShelfAisle, width: 1, height: 4, tiles: [202, 302, 402, 502] };
  const bunks: ModuleInstance = { ...unrotated, type: ModuleType.BunkBank, width: 2, height: 4, tiles: Array.from({ length: 8 }, (_, index) => 202 + index) };
  assert(resolveFacilitySlots(shelf, 100).length === 3, 'ShelfAisle must expose exactly three browse slots.');
  assert(resolveFacilitySlots(bunks, 100).length === 4, 'BunkBank must expose exactly four temporary sleep slots.');
}

function testSlotExclusivityAndCapacity(): void {
  const state = buildFacilityState();
  const shelfSlot = resolveFacilitySlots(fixture(state, ModuleType.ShelfAisle), state.width)[0];
  const checkoutSlots = resolveFacilitySlots(fixture(state, ModuleType.CheckoutBank), state.width).filter((slot) => slot.role === 'checkout');
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
    .flatMap((module) => resolveFacilitySlots(module, state.width).filter((slot) => slot.role === 'checkout'));
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

  staffMarketRegisters(state, 1);
  const [visitor] = addShoppers(state, 1, 1);
  state.controls.paused = false;
  assert(getMarketFixtureStatus(state, fixture(state, ModuleType.CheckoutBank).id)?.kind === 'checkout', 'Expected checkout status.');
  const initialRegister = getMarketFixtureStatus(state, fixture(state, ModuleType.CheckoutBank).id);
  assert(initialRegister?.kind === 'checkout' && initialRegister.activeRegisters === 1, `Steward must physically open one register before simulation (${JSON.stringify(initialRegister)} ${JSON.stringify(state.crewMembers[0])}).`);
  assert(
    initialRegister.capacity === initialRegister.registerCount,
    `Every checkout must report one safe potential customer place while idle (${JSON.stringify(initialRegister)}).`
  );
  assert(
    [...state.derived.queueTheater.chainsByAnchor.values()].every((chain) => chain.length === 0),
    'Idle fixture readiness must not preallocate a phantom live queue chain.'
  );
  const idleReadiness = initialRegister.capacity;
  const registerTiles = resolveFacilitySlots(fixture(state, ModuleType.CheckoutBank), state.width)
    .filter((slot) => slot.role === 'checkout')
    .map((slot) => slot.tileIndex);
  tick(state, 0.1);
  const afterFirstTick = getMarketFixtureStatus(state, fixture(state, ModuleType.CheckoutBank).id);
  assert(afterFirstTick?.kind === 'checkout' && afterFirstTick.activeRegisters === 1, `Steward lost register after first simulation tick (${JSON.stringify(afterFirstTick)} ${JSON.stringify(state.crewMembers[0])}).`);
  const creditsBefore = state.metrics.credits;
  let peakLiveQueueCapacity = 0;

  for (let elapsed = 0; elapsed < 40 && state.usageTotals.tradeGoodsSold < 1; elapsed += 0.1) {
    tick(state, 0.1);
    getMarketFixtureStatus(state, fixture(state, ModuleType.CheckoutBank).id);
    const liveQueueCapacity = registerTiles.reduce(
      (total, registerTile) => total + (state.derived.queueTheater.chainsByAnchor.get(registerTile)?.length ?? 0),
      0
    );
    peakLiveQueueCapacity = Math.max(peakLiveQueueCapacity, liveQueueCapacity);
  }

  assert(
    state.usageTotals.tradeGoodsSold === 1,
    `A shopper must browse stocked shelves and complete checkout (state ${visitor.state}, tile ${visitor.tileIndex}, target ${visitor.reservedTargetTile}, queue ${visitor.queueProviderTile}, wait ${visitor.movementWaitReason}, source ${visitor.marketTradeGoodSourceTile}, market ${JSON.stringify(getMarketFixtureStatus(state, fixture(state, ModuleType.CheckoutBank).id))}).`
  );
  assert(peakLiveQueueCapacity > 0, 'A shopper with a claimed good must create at least one live physical checkout place.');
  const afterDemand = getMarketFixtureStatus(state, fixture(state, ModuleType.CheckoutBank).id);
  assert(
    afterDemand?.kind === 'checkout' && afterDemand.capacity === idleReadiness,
    'Geometry readiness must survive a completed demand cycle.'
  );
  assert(
    registerTiles.every((registerTile) => !state.derived.queueTheater.chainsByAnchor.has(registerTile)),
    'A completed demand cycle must release every live checkout chain.'
  );
  assert(shelfNode.items.tradeGood === 0, 'The integrated checkout must consume the reserved shelf item.');
  assert(state.metrics.credits > creditsBefore, 'The integrated checkout must pay the station.');
  assert(
    !state.reservations.some((reservation) => reservation.ownerId === visitor.id && reservation.releaseReason === null),
    'A completed browse-to-checkout trip must release all visitor reservations.'
  );
}

function testIdleReadinessTracksBlockedFrontage(): void {
  const state = buildFacilityState();
  const checkoutBank = fixture(state, ModuleType.CheckoutBank);
  const registers = resolveFacilitySlots(checkoutBank, state.width).filter((slot) => slot.role === 'checkout');
  const open = getMarketFixtureStatus(state, checkoutBank.id);
  assert(
    open?.kind === 'checkout' && open.capacity === registers.length,
    'Open floor must provide one idle readiness place per checkout.'
  );

  for (const register of registers) {
    for (const offset of [-1, 1, -state.width, state.width]) {
      const neighbor = register.tileIndex + offset;
      if (state.moduleOccupancyByTile[neighbor] !== null) continue;
      state.tiles[neighbor] = TileType.Wall;
      state.rooms[neighbor] = RoomType.None;
    }
  }
  state.topologyVersion += 1;
  state.roomVersion += 1;
  const blocked = getMarketFixtureStatus(state, checkoutBank.id);
  assert(
    blocked?.kind === 'checkout' && blocked.capacity === 0,
    `Fully blocked checkout frontage must report zero readiness (${JSON.stringify(blocked)}).`
  );
  assert(
    [...state.derived.queueTheater.chainsByAnchor.values()].every((chain) => chain.length === 0),
    'A blocked readiness probe must not fabricate live queue slots.'
  );
}

function testMarketCheckoutFifoAndUnstaffedFeedback(): void {
  const staffed = buildFacilityState();
  staffMarketRegisters(staffed, 1);
  const shoppers = addShoppers(staffed, 3, 3);
  staffed.controls.paused = false;
  let sawLine = false;
  let sawTwoQueued = false;
  let fifoSnapshot: number[] = [];
  for (let elapsed = 0; elapsed < 32 && !(sawTwoQueued && staffed.usageTotals.tradeGoodsSold >= 1); elapsed += 0.1) {
    tick(staffed, 0.1);
    const status = getMarketFixtureStatus(staffed, fixture(staffed, ModuleType.CheckoutBank).id);
    if (status?.kind === 'checkout' && status.queued > 0) sawLine = true;
    if (status?.kind === 'checkout' && status.queued >= 2) {
      sawTwoQueued = true;
      fifoSnapshot = shoppers
        .filter((visitor) => visitor.queueProviderTile !== null && visitor.queueProviderTile !== undefined)
        .sort((a, b) => (a.queueJoinedAt ?? Infinity) - (b.queueJoinedAt ?? Infinity) || a.id - b.id)
        .map((visitor) => visitor.id);
    }
  }
  assert(sawLine, 'A large market must form a visible checkout line before sales complete.');
  assert(sawTwoQueued, 'One staffed register must serialize a bounded FIFO line under demand.');
  assert(staffed.usageTotals.tradeGoodsSold >= 1, 'A FIFO checkout line must eventually advance its head into exactly one sale.');
  assert(fifoSnapshot.length >= 2, 'The active register must expose at least two simultaneous physical FIFO members.');
  assert(fifoSnapshot.join('|') === [...fifoSnapshot].sort((a, b) => a - b).join('|'), 'Checkout line order must use joined-at time then visitor id as its deterministic FIFO tie-breaker.');
  const retailEvents = staffed.serviceLog.recent.filter((event) => event.service === 'retail');
  assert(retailEvents.length >= 1, 'Retail service log must record the completed checkout exactly once.');
  assert(
    retailEvents.every((event) => shoppers.some((visitor) => visitor.id === event.actorId)),
    'Retail completion must belong to a shopper who physically entered the market queue.'
  );

  const unstaffed = buildFacilityState();
  const [waiting] = addShoppers(unstaffed, 1, 1);
  runFor(unstaffed, 11);
  const register = getMarketFixtureStatus(unstaffed, fixture(unstaffed, ModuleType.CheckoutBank).id);
  assert(register?.kind === 'checkout' && register.queued > 0 && register.unstaffedRegisters > 0, 'An unstaffed register must show a bounded visible line instead of selling goods.');
  assert(unstaffed.usageTotals.tradeGoodsSold === 0, 'Unstaffed checkout must never complete a positive sale.');
  assert(waiting.movementWaitReason === 'market register unstaffed', 'Unstaffed queue head must name the actual missing role.');
  runFor(unstaffed, 20);
  assert(waiting.marketTradeGoodSourceTile === null, 'Abandoning an unstaffed line must release the reserved shelf item.');
  assert(!unstaffed.reservations.some((reservation) => reservation.ownerId === waiting.id && reservation.releaseReason === null), 'Unstaffed checkout abandonment must not strand claims.');
}

function testStaffedBankCapacityScales(): void {
  const oneBank = buildFacilityState();
  staffMarketRegisters(oneBank, 2);
  addCheckoutReadyShoppers(oneBank, 8);
  runFor(oneBank, 4);
  const oneBankStatus = getMarketFixtureStatus(oneBank, fixture(oneBank, ModuleType.CheckoutBank).id);
  assert(
    oneBankStatus?.kind === 'checkout' && oneBankStatus.activeRegisters === 2,
    'A second physically present Steward must open the second register in a CheckoutBank.'
  );

  const twoBanks = buildFacilityState();
  const placed = tryPlaceModule(twoBanks, ModuleType.CheckoutBank, tile(twoBanks, 54, 50));
  assert(placed.ok, `second checkout placement failed: ${placed.reason ?? 'unknown error'}`);
  staffMarketRegisters(twoBanks, 4);
  addCheckoutReadyShoppers(twoBanks, 8);
  let consumedBankCapacity = false;
  twoBanks.controls.paused = false;
  for (let elapsed = 0; elapsed < 12; elapsed += 0.1) {
    tick(twoBanks, 0.1);
    const occupiedAnchors = new Set(
      twoBanks.visitors
        .filter((visitor) => visitor.queueProviderTile !== null && visitor.queueProviderTile !== undefined)
        .map((visitor) => visitor.queueProviderTile!)
    );
    const activeBanks = twoBanks.moduleInstances
      .filter((module) => module.type === ModuleType.CheckoutBank)
      .filter((module) => {
        const status = getMarketFixtureStatus(twoBanks, module.id);
        return status?.kind === 'checkout' && status.activeRegisters > 0;
      });
    const banksWithDemand = new Set(
      activeBanks.filter((module) => resolveFacilitySlots(module, twoBanks.width)
        .some((slot) => slot.role === 'checkout' && occupiedAnchors.has(slot.tileIndex)))
        .map((module) => module.id)
    );
    if (banksWithDemand.size >= 2) {
      consumedBankCapacity = true;
      break;
    }
  }
  assert(
    consumedBankCapacity,
    'Under simultaneous reserved-goods demand, a second staffed CheckoutBank must receive a distinct physical queue.'
  );
}

function testSecondRegisterImprovesMeasuredThroughput(): void {
  const salesAfter = (stewards: number): { sales: number; detail: string } => {
    const state = buildFacilityState();
    staffMarketRegisters(state, stewards);
    addCheckoutReadyShoppers(state, 8);
    runFor(state, 12);
    return {
      sales: state.usageTotals.tradeGoodsSold,
      detail: JSON.stringify({
        fixture: getMarketFixtureStatus(state, fixture(state, ModuleType.CheckoutBank).id),
        visitors: state.visitors.map((visitor) => ({
          id: visitor.id,
          state: visitor.state,
          tile: visitor.tileIndex,
          queue: visitor.queueProviderTile,
          target: visitor.reservedTargetTile,
          source: visitor.marketTradeGoodSourceTile,
          timer: visitor.eatTimer,
          wait: visitor.movementWaitReason
        }))
      })
    };
  };

  const oneRegister = salesAfter(1);
  const twoRegisters = salesAfter(2);
  assert(oneRegister.sales > 0, 'One staffed register must complete real sales in the comparison window.');
  assert(
    twoRegisters.sales > oneRegister.sales,
    `A second staffed register must improve measured throughput (${oneRegister.sales} ${oneRegister.detail} vs ${twoRegisters.sales} ${twoRegisters.detail}).`
  );
}

function testLiveCheckoutPostsSurviveGeneralDispatch(): void {
  const state = buildFacilityState();
  staffMarketRegisters(state, 2);
  addShoppers(state, 3, 3);
  state.controls.paused = false;
  tick(state, 0.1);

  const stewards = state.crewMembers.filter((crew) => crew.staffRole === 'steward').slice(0, 2);
  const status = getMarketFixtureStatus(state, fixture(state, ModuleType.CheckoutBank).id);
  assert(
    status?.kind === 'checkout' && status.activeRegisters === 2,
    'General work dispatch must not strip Stewards from registers while shoppers need checkout.'
  );
  assert(
    stewards.every((crew) => crew.assignedSystem === 'market' && crew.activeJobId === null),
    'Protected checkout staff must remain physically posted instead of accepting unrelated jobs.'
  );
}

function testUnrelatedQueueDoesNotCreateMarketDemand(): void {
  const state = buildFacilityState();
  staffMarketRegisters(state, 1);
  const steward = state.crewMembers.find((crew) => crew.staffRole === 'steward');
  assert(steward, 'Expected one posted Steward.');

  const visitor = makeVisitor(state, 991, tile(state, 44, 52));
  visitor.primaryPreference = 'cafeteria';
  visitor.state = VisitorState.Queueing;
  visitor.queueProviderTile = tile(state, 44, 53);
  // Legacy saves may omit the market source field entirely. Undefined must
  // not turn every old visitor into hidden demand for a register.
  delete visitor.marketTradeGoodSourceTile;
  state.visitors.push(visitor);

  assert(
    !isCrewHoldingProtectedPost(state, steward),
    'A cafeteria line or missing legacy field must not reserve market staff.'
  );
}

function testTemporarySleepAndHydration(): void {
  const state = buildFacilityState();
  const bunkSlot = resolveFacilitySlots(fixture(state, ModuleType.BunkBank), state.width)[0];
  assert(bunkSlot, 'Expected bunk slot.');
  // Start inside the dorm fixture so this focused test exercises the bunk
  // reservation/dwell lifecycle rather than the starter hull's external route.
  const visitor = makeVisitor(state, 200, tile(state, 64, 55));
  visitor.needs!.energy = 10;
  visitor.needs!.active = null;
  visitor.recurringNeedActive = null;
  visitor.activeService = null;
  visitor.state = VisitorState.ToDock;
  state.visitors.push(visitor);
  state.controls.paused = false;
  tick(state, 0.1);
  const dormInspector = getRoomInspectorAt(state, fixture(state, ModuleType.BunkBank).originTile);
  assert(
    visitor.temporarySleepTargetTile !== null,
    `Long-stay visitor should autonomously reserve a BunkBank slot (${dormInspector?.reasons.join(', ') ?? 'no dorm inspector'}).`
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
    (visitor.state as VisitorState) === VisitorState.Leisure && visitor.eatTimer > 10,
    `Temporary bunk must hold the visitor for a sleep dwell (state ${visitor.state}, module ${state.modules[visitor.tileIndex]}, target ${visitor.temporarySleepTargetTile}, reserved ${visitor.reservedTargetTile}, dwell ${visitor.eatTimer}, reservations ${JSON.stringify(state.reservations.filter((reservation) => reservation.ownerId === visitor.id))}).`
  );
  for (let elapsed = 0; elapsed < 20; elapsed += 0.2) tick(state, 0.2);
  assert(visitor.needs!.energy > 50, 'Energy restores only after the temporary sleep dwell completes.');
  assert(visitor.temporarySleepTargetTile === null, 'Completed sleep must release the temporary bunk claim.');
  assert(!state.reservations.some((reservation) => reservation.ownerId === visitor.id && reservation.releaseReason === null), 'Completed sleep must release all live temporary claims.');

  assert(assignPathToTemporarySleep(state, visitor), 'Visitor should be able to claim a bunk again for save cleanup coverage.');
  const claimedBunk = visitor.temporarySleepTargetTile;
  assert(claimedBunk !== null && claimedBunk !== undefined, 'Re-claim should produce a bunk tile.');
  const serialized = serializeSave('facility-slots', state, 'test');
  const parsed = parseAndMigrateSave(serialized);
  assert(parsed.ok, 'Facility-slot save should parse.');
  const restored = hydrateStateFromSave(parsed.save).state;
  const restoredVisitor = restored.visitors.find((candidate) => candidate.id === visitor.id);
  assert(restoredVisitor, 'Long-stay visitor should persist through save/load.');
  // A guest asleep in a bunk owns that bunk, so the claim itself is durable.
  // What hydration clears is the transient *enforcement* around it: the path,
  // the old reservation, and any second claimant. save-recovery then re-backs
  // the surviving claim with exactly one fresh exclusivity reservation.
  assert(
    restoredVisitor.temporarySleepTargetTile === claimedBunk,
    `Hydration must keep a valid bunk claim (expected ${claimedBunk}, got ${restoredVisitor.temporarySleepTargetTile}).`
  );
  assert(restoredVisitor.path.length === 0, 'Hydration must clear the transient approach path.');
  const liveClaims = restored.reservations.filter(
    (reservation) => reservation.ownerId === visitor.id && reservation.releaseReason === null
  );
  assert(
    liveClaims.length === 1 && liveClaims[0].targetTile === claimedBunk,
    `Hydration must re-back the bunk with exactly one live claim (got ${liveClaims.length}).`
  );
  const rivals = restored.visitors.filter(
    (candidate) => candidate.id !== visitor.id && candidate.temporarySleepTargetTile === claimedBunk
  );
  assert(rivals.length === 0, 'Hydration must never leave two guests holding one bunk.');
}

/**
 * A Market that no 2x5 fixture can fit inside.
 *
 * A 4x4 head with a one-tile-wide arm running off it. The shape is chosen
 * against the geometry, not for looks: a Checkout Bank needs a clear 2x5 or
 * 5x2 rectangle, and nowhere in here are two adjacent rows (or columns) five
 * squares long. Comfortably over the Market's 10-tile minimum either way.
 */
function setLShapedMarket(state: StationState): number[] {
  const cells: number[] = [];
  for (let y = 49; y <= 52; y += 1) {
    for (let x = 42; x <= 45; x += 1) cells.push(tile(state, x, y));
  }
  for (let x = 46; x <= 53; x += 1) cells.push(tile(state, x, 49));
  const room = new Set(cells);
  for (const cell of cells) {
    state.tiles[cell] = TileType.Floor;
    state.rooms[cell] = RoomType.Market;
    state.pressurized[cell] = true;
  }
  for (const cell of cells) {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const neighbour = cell + dy * state.width + dx;
        if (room.has(neighbour)) continue;
        state.tiles[neighbour] = TileType.Wall;
        state.rooms[neighbour] = RoomType.None;
      }
    }
  }
  // One door onto the starter hull's south edge, exactly as the rectangular
  // fixture rooms above attach.
  const door = tile(state, 43, 48);
  state.tiles[door] = TileType.Door;
  state.rooms[door] = RoomType.None;
  state.utilityUnderlay.layers['power-conduit'].fill(1);
  state.utilityUnderlay.version += 1;
  state.topologyVersion += 1;
  state.roomVersion += 1;
  return cells;
}

/**
 * The compact fixture is not legacy clutter — it is the only thing that fits
 * some rooms, and it still has to trade when it is the only thing there.
 */
function testCompactAlternativeSurvivesIrregularRooms(): void {
  const state = createInitialState({ seed: 33108, physicalStarterInventory: true, manualTrafficAdmission: true });
  const cells = setLShapedMarket(state);
  state.metrics.credits = 10_000;
  state.pressurized.fill(true);

  // Nowhere in this room, at either orientation, does the 2x5 fixture fit.
  let attempts = 0;
  for (const cell of cells) {
    for (const rotation of [0, 90] as const) {
      attempts += 1;
      const result = tryPlaceModule(state, ModuleType.CheckoutBank, cell, rotation);
      assert(
        !result.ok,
        `An L-shaped Market must reject a 2x5 Checkout Bank, but one fitted at ${cell} rotated ${rotation}.`
      );
    }
  }
  assert(attempts >= 40, `The rejection sweep must actually cover the room, tried ${attempts} placements.`);
  assert(
    !state.moduleInstances.some((module) => module.type === ModuleType.CheckoutBank),
    'A rejected placement must not leave a Checkout Bank behind.'
  );

  // The 2x1 counter does, which is the whole reason it is still in the catalog.
  const stallOrigin = tile(state, 42, 51);
  const stall = tryPlaceModule(state, ModuleType.MarketStall, stallOrigin);
  assert(stall.ok, `The same room must accept a 2x1 Market Stall: ${stall.reason ?? 'unknown error'}.`);
  tick(state, 0);
  const placed = fixture(state, ModuleType.MarketStall);
  assert(
    placed.tiles.every((cell) => state.rooms[cell] === RoomType.Market),
    'The compact stall must stand entirely inside the irregular Market.'
  );

  // And it still trades. Nothing else on the station sells anything, so the
  // sale that lands can only have come through the compact fixture.
  const node = state.itemNodes.find((candidate) => candidate.tileIndex === placed.originTile);
  assert(node, 'A placed Market Stall must own a stock node.');
  node.items.tradeGood = 8;
  // A small crowd rather than one guest: a stall's counter is one tile wide, so
  // shoppers have to take turns at it, and the check should be about the
  // fixture trading rather than about which square one guest happened to pick.
  const shoppers: Visitor[] = [];
  for (let index = 0; index < 4; index += 1) {
    const shopper = makeVisitor(state, 880 + index, tile(state, 44 + index, 49));
    shopper.stayClass = 'errand';
    shopper.needs = undefined;
    shopper.recurringNeedActive = null;
    shopper.activeService = null;
    shopper.primaryPreference = 'market';
    shopper.leisureLegsRemaining = 1;
    state.visitors.push(shopper);
    shoppers.push(shopper);
  }

  const creditsBefore = state.metrics.credits;
  state.controls.paused = false;
  for (let elapsed = 0; elapsed < 90 && state.usageTotals.tradeGoodsSold < 1; elapsed += 0.1) tick(state, 0.1);
  assert(
    state.usageTotals.tradeGoodsSold >= 1,
    `The compact stall must still complete a sale (shoppers ${shoppers.map((visitor) => `${visitor.state}@${visitor.tileIndex}`).join(' ')}, `
      + `stall origin ${placed.originTile}, stock ${node.items.tradeGood}, market active ${state.ops.marketActive}).`
  );
  assert(node.items.tradeGood < 8, 'The sale must consume physical stall stock.');
  assert(state.metrics.credits > creditsBefore, 'The compact stall must pay the station for the sale.');
}

function testBunkBankHousingPolicyOwnership(): void {
  const state = buildFacilityState();
  const bank = fixture(state, ModuleType.BunkBank);
  const bankSlots = resolveFacilitySlots(bank, state.width);
  assert(bankSlots.length === 4, 'BunkBank fixture must expose four physical sleep positions.');

  const visitor = makeVisitor(state, 201, tile(state, 64, 55));
  assert(assignPathToTemporarySleep(state, visitor), 'Visitor-policy BunkBank must accept a temporary guest.');
  const visitorPolicyCrewSlots = getCrewSustainabilitySummary(state).sleepSlots;

  for (const slot of bankSlots) state.roomHousingPolicies[slot.tileIndex] = 'crew';
  state.reservations.length = 0;
  visitor.temporarySleepTargetTile = null;
  visitor.reservedTargetTile = null;
  assert(!assignPathToTemporarySleep(state, visitor), 'Crew-policy BunkBank must reject temporary guests.');
  assert(
    getCrewSustainabilitySummary(state).sleepSlots === visitorPolicyCrewSlots + 4,
    'Changing a BunkBank from visitor to crew policy must add exactly four assignable crew sleep slots.'
  );
}

function main(): void {
  testDescriptorRotationAndCounts();
  testSlotExclusivityAndCapacity();
  testStockAndCheckoutAccounting();
  testMarketBrowseToCheckoutFlow();
  testIdleReadinessTracksBlockedFrontage();
  testMarketCheckoutFifoAndUnstaffedFeedback();
  testStaffedBankCapacityScales();
  testSecondRegisterImprovesMeasuredThroughput();
  testLiveCheckoutPostsSurviveGeneralDispatch();
  testUnrelatedQueueDoesNotCreateMarketDemand();
  testTemporarySleepAndHydration();
  testBunkBankHousingPolicyOwnership();
  testCompactAlternativeSurvivesIrregularRooms();
  console.log('facility-slots-tests: ok');
}

main();
