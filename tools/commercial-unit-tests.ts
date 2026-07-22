import {
  acceptCommercialOffer,
  closeCommercialUnit,
  createInitialState,
  hireCrew,
  openCommercialUnitForOffers,
  previewCommercialOffer,
  removeModuleAtTile,
  setRoom,
  tick,
  tryPlaceModule
} from '../src/sim/index';
import { getRoomInspectorAt } from '../src/sim/sim';
import { ModuleType, RoomType, TileType, VisitorState, fromIndex, type CommercialBusinessKind, type StationState, type Visitor } from '../src/sim/types';
import { hydrateStateFromSave, parseAndMigrateSave, serializeSave } from '../src/sim/save';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function advance(state: StationState, seconds: number): void {
  state.controls.paused = false;
  for (let elapsed = 0; elapsed < seconds; elapsed += 0.2) tick(state, 0.2);
}

function createCommercialShell(x0 = 2, y0 = 2): { state: StationState; anchor: number } {
  const state = createInitialState({ seed: 7007, physicalStarterInventory: true });
  state.unlocks.tier = 1;
  const tiles: number[] = [];
  for (let y = y0; y < y0 + 4; y++) {
    for (let x = x0; x < x0 + 5; x++) tiles.push(y * state.width + x);
  }
  for (const tile of tiles) {
    removeModuleAtTile(state, tile);
    state.tiles[tile] = TileType.Floor;
    setRoom(state, tile, RoomType.CommercialUnit);
    state.pressurized[tile] = true;
  }
  return { state, anchor: tiles[0] };
}

function createAdditionalCommercialShell(state: StationState, x0: number, y0: number): number {
  const tiles: number[] = [];
  for (let y = y0; y < y0 + 4; y++) {
    for (let x = x0; x < x0 + 5; x++) tiles.push(y * state.width + x);
  }
  for (const tile of tiles) {
    removeModuleAtTile(state, tile);
    state.tiles[tile] = TileType.Floor;
    setRoom(state, tile, RoomType.CommercialUnit);
    state.pressurized[tile] = true;
  }
  return tiles[0];
}

function findOffer(state: StationState, anchor: number, kind: CommercialBusinessKind) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const result = openCommercialUnitForOffers(state, anchor);
    assert(result.ok && result.unit, result.reason ?? 'Commercial proposals failed.');
    const offer = result.unit.offers.find((candidate) => candidate.kind === kind);
    if (offer) return { unit: result.unit, offer };
  }
  throw new Error(`Could not generate a ${kind} offer after multiple proposal sets.`);
}

function visitorAt(state: StationState, tileIndex: number, id: number, overrides: Partial<Visitor> = {}): Visitor {
  const position = fromIndex(tileIndex, state.width);
  return {
    id,
    x: position.x + 0.5,
    y: position.y + 0.5,
    tileIndex,
    state: VisitorState.Leisure,
    path: [],
    speed: 1.8,
    patience: 0,
    eatTimer: 0.01,
    trespassed: false,
    servedMeal: false,
    carryingMeal: false,
    carryingDrink: false,
    reservedServingTile: null,
    reservedTargetTile: null,
    blockedTicks: 0,
    archetype: 'diner',
    taxSensitivity: 1,
    spendMultiplier: 1,
    patienceMultiplier: 1,
    primaryPreference: 'cafeteria',
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
    serviceBlockedSince: null,
    ...overrides
  };
}

function testOfferAndFitoutLoop(): StationState {
  const { state, anchor } = createCommercialShell();
  const firstRound = openCommercialUnitForOffers(state, anchor);
  assert(firstRound.ok && firstRound.unit, firstRound.reason ?? 'Commercial application call failed.');
  assert(firstRound.unit.offers.length === 3, `Expected 3 offers, got ${firstRound.unit.offers.length}.`);
  assert(new Set(firstRound.unit.offers.map((offer) => offer.kind)).size === 3, 'Offers did not present distinct business choices.');
  const { unit: opened, offer: chosen } = findOffer(state, anchor, 'restaurant');
  assert(previewCommercialOffer(state, opened.id, chosen.id), 'Offer preview selection failed.');
  const accepted = acceptCommercialOffer(state, opened.id, chosen.id);
  assert(accepted.ok, accepted.reason ?? 'Tenant acceptance failed.');
  const fittingInspector = getRoomInspectorAt(state, anchor);
  assert(fittingInspector?.workplace?.tenantManaged, 'Fit-out inspector did not recognize tenant-managed labor.');
  assert(fittingInspector?.workplace?.tenantStaffExpected === chosen.suppliedStaff, 'Fit-out inspector did not show incoming tenant staff.');
  assert(!fittingInspector?.warnings.includes('mess service has no home crew'), 'Tenant fit-out incorrectly requested station home crew.');
  advance(state, chosen.fitoutDurationSec + 8);
  const unit = state.commercialUnits[0];
  assert(unit.phase === 'open', `Expected open business, got ${unit.phase}: ${unit.statusReason}.`);
  assert(unit.fittedModuleIds.length === chosen.fixtures.length, 'Not all proposed fixtures were installed.');
  assert(unit.tenantStaffTiles.length === chosen.suppliedStaff, 'Tenant staff markers do not match the offer.');
  assert(unit.tiles.every((tile) => state.rooms[tile] === chosen.targetRoom), 'Shell did not convert to the operating room type.');
  if (chosen.kind === 'restaurant') {
    const serving = state.moduleInstances.find((module) => unit.fittedModuleIds.includes(module.id) && module.type === ModuleType.ServingStation);
    assert(serving, 'Restaurant fit-out did not install a serving station.');
    const stock = state.itemNodes.find((node) => node.tileIndex === serving.originTile)?.items ?? {};
    assert((stock.meal ?? 0) > 0 && (stock.cleanTray ?? 0) > 0, 'Tenant restaurant must stock both meals and clean trays.');
    const inspector = getRoomInspectorAt(state, serving.originTile);
    assert(inspector?.cafeteriaLoad?.tenantStaff === chosen.suppliedStaff, 'Restaurant tenant staff did not contribute to live cafeteria service capacity.');
    assert(inspector?.workplace?.tenantStaff === chosen.suppliedStaff, 'Restaurant inspector did not identify its tenant staff.');
    assert(inspector?.staffCount === chosen.suppliedStaff, 'Restaurant inspector did not count tenant staff as active service labor.');
    assert(!inspector?.warnings.includes('mess service has no home crew'), 'Tenant restaurant incorrectly requested station home crew.');
  }
  return state;
}

function testCompletedTransactionsAndCantinaStaffing(): void {
  const state = testOfferAndFitoutLoop();
  const restaurant = state.commercialUnits[0];
  const restaurantTable = state.moduleInstances.find((module) => restaurant.fittedModuleIds.includes(module.id) && module.type === ModuleType.Table);
  assert(restaurantTable, 'Restaurant fit-out did not install tables.');
  const mealGuest = visitorAt(state, restaurantTable.originTile, 70081, {
    state: VisitorState.Eating,
    eatTimer: 0.01,
    activeService: 'meal',
    servicePlan: ['meal'],
    commercialMealUnitId: restaurant.id
  });
  state.visitors.push(mealGuest);
  const beforeMealShare = restaurant.revenueShareCollected;
  const beforeMealCustomers = restaurant.customersServed;
  advance(state, 0.4);
  assert(restaurant.revenueShareCollected > beforeMealShare, 'Restaurant revenue share must post when a meal is completed.');
  assert(restaurant.customersServed === beforeMealCustomers + 1, 'Restaurant customer count must advance on a completed meal, not room entry.');
  const afterMealShare = restaurant.revenueShareCollected;
  advance(state, 0.4);
  assert(restaurant.revenueShareCollected === afterMealShare, 'A completed meal must not post revenue repeatedly while the visitor leaves.');

  const cantinaAnchor = createAdditionalCommercialShell(state, 10, 2);
  const { unit: cantina, offer } = findOffer(state, cantinaAnchor, 'cantina');
  const accepted = acceptCommercialOffer(state, cantina.id, offer.id);
  assert(accepted.ok, accepted.reason ?? 'Cantina lease acceptance failed.');
  advance(state, offer.fitoutDurationSec + 8);
  const bar = state.moduleInstances.find((module) => cantina.fittedModuleIds.includes(module.id) && module.type === ModuleType.BarCounter);
  const bench = state.moduleInstances.find((module) => cantina.fittedModuleIds.includes(module.id) && module.type === ModuleType.Bench);
  assert(bar && bench, 'Cantina fit-out needs a pickup bar and separate bench seating.');
  const barStock = state.itemNodes.find((node) => node.tileIndex === bar.originTile)?.items.rawMaterial ?? 0;
  assert(barStock > 0, 'Tenant cantina did not stock its real drink input.');
  const inspector = getRoomInspectorAt(state, bar.originTile);
  assert(inspector?.cantinaLoad?.stewardCount === offer.suppliedStaff, 'Tenant cantina staff did not satisfy steward service capacity.');
  assert(inspector?.workplace?.tenantStaff === offer.suppliedStaff, 'Cantina inspector did not identify its tenant staff.');
  assert(inspector?.staffCount === offer.suppliedStaff, 'Cantina inspector did not count tenant staff as active service labor.');
  assert(!inspector?.warnings.includes('cantina has no home crew'), 'Tenant cantina incorrectly requested station home crew.');
  assert((inspector?.cantinaLoad?.pickupSlots ?? 0) > 0 && (inspector?.cantinaLoad?.seatsCapacity ?? 0) > 0, 'Cantina diagnostics must expose separate pickup and seating capacity.');

  const drinkGuest = visitorAt(state, bench.originTile, 70082, {
    state: VisitorState.Leisure,
    eatTimer: 0.01,
    activeService: 'drink',
    carryingDrink: true,
    servicePlan: ['drink']
  });
  state.visitors.push(drinkGuest);
  const beforeDrinkShare = cantina.revenueShareCollected;
  advance(state, 0.4);
  assert(cantina.revenueShareCollected > beforeDrinkShare, 'Cantina revenue share must post after a drink is consumed at a seat.');
  assert(!drinkGuest.carryingDrink, 'A consumed cantina drink must no longer be carried.');
}

function testRentAndSaveRoundTrip(): void {
  const state = testOfferAndFitoutLoop();
  const unit = state.commercialUnits[0];
  const creditsBefore = state.metrics.credits;
  advance(state, 62);
  assert(unit.rentCollected > 0, 'Open tenant did not pay rent.');
  assert(state.metrics.credits > creditsBefore, 'Rent did not reach station credits.');

  assert(hireCrew(state, 0), 'Save test could not add a crew member.');
  tick(state, 0);
  const dormTiles: number[] = [];
  for (let y = 8; y < 11; y++) {
    for (let x = 20; x < 23; x++) {
      const tile = y * state.width + x;
      dormTiles.push(tile);
      removeModuleAtTile(state, tile);
      state.tiles[tile] = TileType.Floor;
      setRoom(state, tile, RoomType.Dorm);
      state.roomHousingPolicies[tile] = 'crew';
      state.pressurized[tile] = true;
    }
  }
  state.tiles[dormTiles[0]!] = TileType.Door;
  const placedBed = tryPlaceModule(state, ModuleType.Bed, 9 * state.width + 20, 0);
  assert(placedBed.ok, placedBed.reason ?? 'Could not build a dorm bed for the save test.');
  tick(state, 0);
  const bed = state.moduleInstances.find((module) => module.type === ModuleType.Bed && dormTiles.includes(module.originTile));
  assert(bed, 'Save test dorm did not retain its physical bed.');
  assert(state.crewMembers[0], 'Hired crew member did not materialize in the simulation.');
  state.crewMembers[0]!.assignedSleepTile = bed.tiles[0]!;
  state.plumbing.floodByTile[unit.anchorTile] = 4;

  const parsed = parseAndMigrateSave(serializeSave('commercial-test', state, 'test'));
  assert(parsed.ok, parsed.ok ? '' : parsed.error);
  assert(parsed.save.snapshot.crew.members?.[0]?.assignedSleepTile === bed.tiles[0], 'Serialized crew sleep assignment was missing before hydration.');
  const hydrated = hydrateStateFromSave(parsed.save, { seed: 7007 }).state;
  const loaded = hydrated.commercialUnits[0];
  assert(loaded?.phase === 'open', 'Commercial phase was not preserved through save/load.');
  assert(loaded.fittedModuleIds.length === loaded.selectedOffer?.fixtures.length, 'Fixture ownership was not rebuilt on load.');
  const loadedCrew = hydrated.crewMembers.find((crew) => crew.id === state.crewMembers[0]!.id);
  assert(
    loadedCrew?.assignedSleepTile === bed.tiles[0],
    `Assigned crew sleep slot was not preserved through save/load (saved crew ${state.crewMembers[0]!.id}, loaded ids ${hydrated.crewMembers.map((crew) => crew.id).join(',') || 'none'}, saved ${bed.tiles[0]}, loaded ${loadedCrew?.assignedSleepTile ?? 'none'}).`
  );
  assert((hydrated.plumbing.floodByTile[unit.anchorTile] ?? 0) === 4, 'Plumbing state was not preserved through save/load.');
  const savedServing = hydrated.moduleInstances.find((module) => loaded.fittedModuleIds.includes(module.id) && module.type === ModuleType.ServingStation);
  if (savedServing) {
    const inventory = hydrated.itemNodes.find((node) => node.tileIndex === savedServing.originTile)?.items ?? {};
    assert((inventory.meal ?? 0) > 0 && (inventory.cleanTray ?? 0) > 0, 'Expanded tenant food inventory was not preserved through save/load.');
  }

  const closed = closeCommercialUnit(hydrated, loaded.id);
  assert(closed.ok, closed.reason ?? 'Closing the lease failed.');
  assert(loaded.tiles.every((tile) => hydrated.rooms[tile] === RoomType.CommercialUnit), 'Closing did not restore the vacant shell.');
  assert(loaded.fittedModuleIds.length === 0, 'Tenant fixtures remained after closure.');
}

testOfferAndFitoutLoop();
testCompletedTransactionsAndCantinaStaffing();
testRentAndSaveRoundTrip();
console.log('commercial-unit-tests: ok');
