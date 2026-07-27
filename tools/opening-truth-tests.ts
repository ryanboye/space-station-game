/**
 * Focused checks for the Gate 0 "truth before breadth" packages.
 *
 * Deliberately narrow and fast: each case pins one invariant from
 * docs/37-station-portfolio-program/00-shared-contracts.md so the opening
 * packages can iterate without running the full simulation suite.
 */

import {
  acceptOpeningCapitalProject,
  buyPreparedMealsDetailed,
  canPlaceUtilityUnderlay,
  createInitialState,
  getCrewFacilityReachability,
  getCrewSustainabilitySummary,
  getHousingInspectorAt,
  getOpeningCapitalProjects,
  getPodDemandSummary,
  getPreparedMealInventory,
  moduleCreditBuildCost,
  previewPreparedMealPurchase,
  removeModuleAtTile,
  setRoom,
  setUtilityUnderlayTile,
  tick,
  tryPlaceModule
} from '../src/sim';
import { MODULE_DEFINITIONS, OPENING_BALANCE, PORT_SETTLEMENT, ROOM_DEFINITIONS } from '../src/sim/balance';
import { previewModulePlacement } from '../src/sim/construction';
import { computeSettlementPayout, deriveOpeningEconomyProfile } from '../src/sim/opening-economy';
import { summarizePodDemand } from '../src/sim/pod-demand';
import { OPENING_STOCK_COST, evaluateOpeningRecipes, futureFacilities, openingRecipes } from '../src/sim/opening-recipes';
import { hydrateStateFromSave, parseAndMigrateSave, serializeSave } from '../src/sim/save';
import {
  appendServiceCompletion,
  createServiceLog,
  fixtureProvidesService
} from '../src/sim/service-truth';
import { ModuleType, RoomType, TileType, type StationState } from '../src/sim/types';

const GAME_VERSION = 'truth-checks';

let failures = 0;
let checks = 0;

function check(name: string, fn: () => void): void {
  checks += 1;
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`  FAIL ${name}`);
    console.error(`       ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) throw new Error(`${message} (expected ${String(expected)}, got ${String(actual)})`);
}

function roundTrip(state: StationState): StationState {
  const parsed = parseAndMigrateSave(serializeSave('round-trip', state, GAME_VERSION));
  assert(parsed.ok, `save did not parse: ${parsed.ok ? '' : parsed.error}`);
  return hydrateStateFromSave(parsed.save).state;
}

function freshState(): StationState {
  return createInitialState({ physicalStarterInventory: true, manualTrafficAdmission: true });
}

/** First 4x3-style patch of unzoned, unoccupied floor — the build apron. */
function findOpenRectangle(state: StationState, width: number, height: number): number[] {
  for (let y = 0; y < state.height - height; y += 1) {
    for (let x = 0; x < state.width - width; x += 1) {
      const tiles: number[] = [];
      let ok = true;
      for (let dy = 0; dy < height && ok; dy += 1) {
        for (let dx = 0; dx < width && ok; dx += 1) {
          const index = (y + dy) * state.width + (x + dx);
          if (
            state.tiles[index] !== TileType.Floor ||
            state.rooms[index] !== RoomType.None ||
            state.moduleOccupancyByTile[index] !== null
          ) {
            ok = false;
            break;
          }
          tiles.push(index);
        }
      }
      if (ok) return tiles;
    }
  }
  return [];
}

// --- TRUTH-01: fresh game isolation ----------------------------------------

console.log('TRUTH-01 fresh game isolation');

check('a fresh station starts at tier 0 with no unlocks', () => {
  const state = freshState();
  assertEqual(state.unlocks.tier, 0, 'starter unlock tier');
  assertEqual(state.unlocks.unlockedIds.length, 0, 'starter unlocked id count');
});

check('saving and reloading a fresh station does not inflate its tier', () => {
  // Regression for docs/tickets/2026-07-25-opening-playtest/00-*: the
  // authored starter contains catalog entries above tier 0, and the
  // content-derived elevation rule promoted every reload to tier 2.
  const restored = roundTrip(freshState());
  assertEqual(restored.unlocks.tier, 0, 'reloaded starter unlock tier');
  assertEqual(restored.unlocks.unlockedIds.length, 0, 'reloaded starter unlocked id count');
});

check('reloading a fresh station preserves its opening progression counters', () => {
  const restored = roundTrip(freshState());
  assertEqual(restored.metrics.creditsEarnedLifetime, 0, 'lifetime credits earned');
  assertEqual(restored.metrics.archetypesServedLifetime, 0, 'lifetime archetypes served');
  assertEqual(restored.metrics.turnaroundsCompletedLifetime, 0, 'lifetime turnarounds');
  assertEqual(restored.metrics.mealsServedTotal, 0, 'lifetime meals served');
});

check('cumulative station rating and its player-facing factors survive save/load', () => {
  const state = freshState();
  state.metrics.stationRating = 23.5;
  state.usageTotals.ratingDelta = 23.5;
  state.usageTotals.ratingFromVisitorFailure = 1.25;
  state.usageTotals.ratingFromVisitorFailureByReason.patienceBail = 1.25;
  state.usageTotals.ratingFromVisitorSuccessByReason.mealService = 18;
  state.usageTotals.ratingFromVisitorSuccessByReason.successfulExit = 6.75;

  const restored = roundTrip(state);
  assertEqual(restored.metrics.stationRating, 23.5, 'rating visible immediately after load');
  assertEqual(restored.usageTotals.ratingDelta, 23.5, 'cumulative rating delta');
  assertEqual(restored.usageTotals.ratingFromVisitorFailure, 1.25, 'rating failure total');
  assertEqual(
    restored.usageTotals.ratingFromVisitorFailureByReason.patienceBail,
    1.25,
    'rating failure diagnosis'
  );
  assertEqual(restored.usageTotals.ratingFromVisitorSuccessByReason.mealService, 18, 'meal rating bonus');
  assertEqual(restored.usageTotals.ratingFromVisitorSuccessByReason.successfulExit, 6.75, 'exit rating bonus');
});

check('an advanced run round-trips its own tier and metrics intact', () => {
  const advanced = freshState();
  advanced.unlocks.tier = 3;
  advanced.unlocks.unlockedIds = ['tier1_sustenance', 'tier2_commerce', 'tier3_logistics'];
  advanced.metrics.creditsEarnedLifetime = 812;
  advanced.metrics.archetypesServedLifetime = 4;
  advanced.metrics.turnaroundsCompletedLifetime = 5;
  const restored = roundTrip(advanced);
  assertEqual(restored.unlocks.tier, 3, 'restored tier');
  assertEqual(restored.metrics.creditsEarnedLifetime, 812, 'restored lifetime credits');
  assertEqual(restored.metrics.turnaroundsCompletedLifetime, 5, 'restored lifetime turnarounds');
});

check('a new station built after an advanced run shares no progression with it', () => {
  const advanced = freshState();
  advanced.unlocks.tier = 3;
  advanced.metrics.creditsEarnedLifetime = 812;
  advanced.metrics.mealsServedTotal = 44;
  roundTrip(advanced);

  const newGame = roundTrip(freshState());
  assertEqual(newGame.unlocks.tier, 0, 'new game tier');
  assertEqual(newGame.metrics.creditsEarnedLifetime, 0, 'new game lifetime credits');
  assertEqual(newGame.metrics.mealsServedTotal, 0, 'new game meals served');
});

// --- TRUTH-02: service completion integrity --------------------------------

console.log('');
console.log('TRUTH-02 service completion integrity');

check('a missing facility cannot complete its service', () => {
  // The reported defect: a passenger who wanted a drink idled at the Market
  // Stall and the turnaround credited a cantina the station never built.
  assert(
    !fixtureProvidesService(RoomType.Market, ModuleType.MarketStall, 'drink'),
    'a market stall must not provide drinks'
  );
  assert(
    !fixtureProvidesService(RoomType.Market, ModuleType.MarketStall, 'leisure'),
    'a market stall must not provide a lounge visit'
  );
  assert(
    !fixtureProvidesService(RoomType.Cafeteria, ModuleType.Table, 'leisure'),
    'a cafeteria table must not provide a lounge visit'
  );
  assert(
    !fixtureProvidesService(RoomType.None, ModuleType.None, 'meal'),
    'bare floor must not provide a meal'
  );
});

check('a correctly built facility does complete its service', () => {
  assert(fixtureProvidesService(RoomType.Cafeteria, ModuleType.Table, 'meal'), 'cafeteria table serves meals');
  assert(fixtureProvidesService(RoomType.Cantina, ModuleType.BarCounter, 'drink'), 'cantina bar serves drinks');
  assert(fixtureProvidesService(RoomType.Lounge, ModuleType.Couch, 'leisure'), 'lounge couch serves leisure');
  assert(fixtureProvidesService(RoomType.RecHall, ModuleType.RecUnit, 'leisure'), 'rec unit serves leisure');
  assert(fixtureProvidesService(RoomType.Hygiene, ModuleType.Toilet, 'restroom'), 'toilet serves restroom');
  assert(fixtureProvidesService(RoomType.Hygiene, ModuleType.Shower, 'hygiene'), 'shower serves hygiene');
  assert(fixtureProvidesService(RoomType.Observatory, ModuleType.Telescope, 'comfort'), 'telescope serves comfort');
});

check('the service log separates visitor, crew and resident consumption', () => {
  const log = createServiceLog();
  const base = {
    at: 10,
    service: 'meal' as const,
    roomType: RoomType.Cafeteria,
    moduleType: ModuleType.Table,
    tileIndex: 100,
    shipId: null,
    commercialUnitId: null
  };
  appendServiceCompletion(log, { ...base, population: 'visitor', actorId: 1 }, { firstForActor: true });
  appendServiceCompletion(log, { ...base, population: 'crew', actorId: 2 }, { firstForActor: true });
  appendServiceCompletion(log, { ...base, population: 'resident', actorId: 3 }, { firstForActor: true });
  assertEqual(log.lifetimeByService.meal, 3, 'total meals across populations');
  assertEqual(log.visitorLifetimeByService.meal, 1, 'visitor meals');
  assertEqual(log.visitorsServedLifetime, 1, 'visitors served');
});

check('one visitor using several services counts as one visitor served', () => {
  const log = createServiceLog();
  const base = {
    at: 10,
    population: 'visitor' as const,
    actorId: 7,
    roomType: RoomType.Cafeteria,
    moduleType: ModuleType.Table,
    tileIndex: 100,
    shipId: null,
    commercialUnitId: null
  };
  appendServiceCompletion(log, { ...base, service: 'meal' }, { firstForActor: true });
  appendServiceCompletion(log, { ...base, service: 'drink' }, { firstForActor: false });
  appendServiceCompletion(log, { ...base, service: 'leisure' }, { firstForActor: false });
  assertEqual(log.visitorsServedLifetime, 1, 'visitors served');
  assertEqual(log.visitorLifetimeByService.drink, 1, 'visitor drinks');
});

check('the service log survives save and reload', () => {
  const state = freshState();
  appendServiceCompletion(
    state.serviceLog,
    {
      at: 5,
      population: 'visitor',
      actorId: 11,
      service: 'meal',
      roomType: RoomType.Cafeteria,
      moduleType: ModuleType.Table,
      tileIndex: 250,
      shipId: null,
      commercialUnitId: null
    },
    { firstForActor: true }
  );
  const restored = roundTrip(state);
  assertEqual(restored.serviceLog.visitorsServedLifetime, 1, 'restored visitors served');
  assertEqual(restored.serviceLog.visitorLifetimeByService.meal, 1, 'restored visitor meals');
  assertEqual(restored.serviceLog.recent.length, 1, 'restored recent completions');
  assertEqual(restored.serviceLog.recent[0].tileIndex, 250, 'restored facility identity');
});

check('a live opening run only records services its fixtures can deliver', () => {
  const state = freshState();
  state.controls.paused = false;
  state.controls.manualTrafficAdmission = false;
  for (let step = 0; step < 900; step += 1) tick(state, 1);

  assert(state.serviceLog.recent.length > 0, 'the opening run completed no service at all');
  for (const event of state.serviceLog.recent) {
    assert(
      fixtureProvidesService(event.roomType, event.moduleType, event.service),
      `recorded ${event.service} at room ${event.roomType}/module ${event.moduleType}, which cannot provide it`
    );
  }
});

check('a station with no lounge or cantina completes zero lounge and drink services', () => {
  const state = freshState();
  const hasLounge = state.rooms.some((room) => room === RoomType.Lounge || room === RoomType.RecHall);
  const hasCantina = state.rooms.some((room) => room === RoomType.Cantina);
  assert(!hasLounge && !hasCantina, 'starter station unexpectedly ships a lounge or cantina');

  state.controls.paused = false;
  state.controls.manualTrafficAdmission = false;
  for (let step = 0; step < 900; step += 1) tick(state, 1);

  assertEqual(state.serviceLog.lifetimeByService.leisure, 0, 'lounge visits without a lounge');
  assertEqual(state.serviceLog.lifetimeByService.drink, 0, 'drinks without a cantina');
});

check('building the room changes the result the report can show', () => {
  // Acceptance from opening ticket 07: adding a lounge is what makes lounge
  // completions possible. Convert the starter Market into a Lounge with two
  // couches so the station has somewhere real to sit.
  const state = freshState();
  tick(state, 0);
  // Convert the starter crew mess: it is already enclosed, doored and powered,
  // so this isolates "does building the room change the result" from the
  // separate question of whether a freshly painted patch of floor is a room.
  const loungeTiles: number[] = [];
  for (let index = 0; index < state.rooms.length; index += 1) {
    if (state.rooms[index] === RoomType.Cafeteria) loungeTiles.push(index);
  }
  assert(loungeTiles.length >= 12, 'starter station has no crew mess to convert');
  for (const tile of loungeTiles) {
    if (state.modules[tile] !== ModuleType.None) removeModuleAtTile(state, tile);
  }
  // Lounge and Couch are tier-1 catalog entries; this check is about physical
  // truth rather than progression gating.
  state.unlocks.tier = 1;
  for (const tile of loungeTiles) setRoom(state, tile, RoomType.Lounge);
  tick(state, 0);
  const placed = loungeTiles.filter((tile) => tryPlaceModule(state, ModuleType.Couch, tile, 0).ok).length;
  assert(placed >= 1, 'could not place a couch in the converted lounge');

  state.controls.paused = false;
  state.controls.manualTrafficAdmission = false;
  for (let step = 0; step < 1200; step += 1) tick(state, 1);

  assert(
    state.serviceLog.lifetimeByService.leisure > 0,
    'a lounge with couches recorded no lounge visits'
  );
  for (const event of state.serviceLog.recent.filter((entry) => entry.service === 'leisure')) {
    assertEqual(event.roomType, RoomType.Lounge, 'lounge visit room type');
  }
});

// --- TRUTH-03: inventory and meal reconciliation ---------------------------

console.log('');
console.log('TRUTH-03 inventory and meal reconciliation');

function servingStationTiles(state: StationState): number[] {
  return state.moduleInstances
    .filter((module) => module.type === ModuleType.ServingStation)
    .map((module) => module.originTile);
}

/** Empties every serving counter so a purchase has somewhere to land. */
function drainServingCounters(state: StationState): void {
  const tiles = new Set(servingStationTiles(state));
  for (const node of state.itemNodes) {
    if (!tiles.has(node.tileIndex)) continue;
    node.items.meal = 0;
    node.items.cleanTray = 0;
  }
}

function locatedMealTotal(state: StationState): number {
  const tiles = new Set(servingStationTiles(state));
  return state.itemNodes.reduce(
    (sum, node) => sum + (tiles.has(node.tileIndex) ? Math.max(0, node.items.meal ?? 0) : 0),
    0
  );
}

function setModuleStock(
  state: StationState,
  moduleType: ModuleType,
  item: 'meal' | 'tradeGood' | 'fuel',
  amount: number
): void {
  const origin = state.moduleInstances.find((module) => module.type === moduleType)?.originTile;
  assert(origin !== undefined, `no ${moduleType} module to stock`);
  const node = state.itemNodes.find((candidate) => candidate.tileIndex === origin);
  assert(node, `no item node for ${moduleType}`);
  node.items[item] = amount;
}

function recipeStockStep(state: StationState, recipeId: 'feed-travelers' | 'sell-supplies' | 'service-ships') {
  const recipe = evaluateOpeningRecipes(state).find((candidate) => candidate.id === recipeId);
  assert(recipe, `no ${recipeId} recipe`);
  const step = recipe.steps.find((candidate) => candidate.kind === 'stock');
  assert(step, `${recipeId} has no stock step`);
  return step;
}

function placeStockFixture(state: StationState, room: RoomType, module: ModuleType, width: number, height: number): void {
  const tiles = findOpenRectangle(state, width, height);
  assert(tiles.length === width * height, `no ${width}x${height} area for ${module}`);
  for (const tile of tiles) setRoom(state, tile, room);
  const placed = tryPlaceModule(state, module, tiles[0], 0);
  assert(placed.ok, `could not place ${module}: ${placed.reason ?? 'unknown reason'}`);
  tick(state, 0);
}

function placeModuleInRoom(state: StationState, room: RoomType, module: ModuleType): void {
  for (let tile = 0; tile < state.rooms.length; tile += 1) {
    if (state.rooms[tile] !== room) continue;
    const placed = tryPlaceModule(state, module, tile, 0);
    if (placed.ok) return;
  }
  throw new Error(`could not place ${String(module)} in ${String(room)}`);
}

function placeModuleInTiles(state: StationState, tiles: number[], module: ModuleType): void {
  for (const tile of tiles) {
    const placed = tryPlaceModule(state, module, tile, 0);
    if (placed.ok) return;
  }
  throw new Error(`could not place ${String(module)} in the requested room cluster`);
}

function placeFuelCouplerAtStarterDock(state: StationState): number {
  for (let tile = 0; tile < state.tiles.length; tile += 1) {
    const placed = tryPlaceModule(state, ModuleType.FuelCoupler, tile, 0);
    if (placed.ok) return tile;
  }
  throw new Error('could not attach a Fuel Coupler to either starter Pod Dock');
}

function walkableNeighbor(state: StationState, tile: number): number | null {
  const x = tile % state.width;
  const y = Math.floor(tile / state.width);
  const candidates: number[] = [];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) continue;
    const neighbor = ny * state.width + nx;
    if (state.tiles[neighbor] === TileType.Wall) continue;
    if (canPlaceUtilityUnderlay(state, 'fuel-pipe', neighbor)) candidates.push(neighbor);
  }
  return candidates.find((candidate) => state.pressurized[candidate]) ?? candidates[0] ?? null;
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
  if (previous[goal] < 0) return [];
  const path: number[] = [];
  for (let tile = goal; tile !== start; tile = previous[tile]) path.push(tile);
  path.push(start);
  return path.reverse();
}

check('the meal total is derivable from the located counter nodes', () => {
  const state = freshState();
  tick(state, 0);
  drainServingCounters(state);
  const before = locatedMealTotal(state);
  const result = buyPreparedMealsDetailed(state, 36, 12);
  assert(result.ok, `purchase refused: ${result.message}`);
  tick(state, 0);
  assertEqual(
    Math.round(locatedMealTotal(state)),
    Math.round(before + result.added),
    'located counter meals after purchase'
  );
  // Regression: the purchase also incremented metrics.mealStock by hand while
  // the tick derives it from the same nodes, double-counting every order. The
  // shared accessor is what the header, tooltip and alert all read.
  const inventory = getPreparedMealInventory(state);
  assertEqual(
    inventory.stationMeals,
    Math.round(locatedMealTotal(state)),
    'shared prepared-meal total vs located counter stock'
  );
  assertEqual(inventory.readyServings, inventory.stationMeals, 'servings ready with trays');
});

check('a refused purchase says why and changes nothing', () => {
  const broke = freshState();
  tick(broke, 0);
  drainServingCounters(broke);
  broke.metrics.credits = 0;
  const denied = buyPreparedMealsDetailed(broke, 36, 12);
  assert(!denied.ok, 'a station with no credits should not be sold meals');
  assertEqual(denied.reason, 'insufficient_credits', 'refusal reason');
  assert(denied.message.length > 0, 'refusal must carry a player-facing reason');
  assertEqual(denied.added, 0, 'servings landed on a refused order');

  // The preview must agree with the order it is previewing.
  const preview = previewPreparedMealPurchase(broke, 36, 12);
  assertEqual(preview.ok, false, 'preview verdict');
  assertEqual(preview.reason, denied.reason, 'preview reason matches order reason');
});

check('a station with no serving station cannot buy prepared meals', () => {
  const state = freshState();
  tick(state, 0);
  for (const tile of servingStationTiles(state)) removeModuleAtTile(state, tile);
  tick(state, 0);
  const result = buyPreparedMealsDetailed(state, 36, 12);
  assert(!result.ok, 'meals delivered with nowhere to put them');
  assertEqual(result.reason, 'no_serving_station', 'refusal reason');
  assertEqual(result.destinationCount, 0, 'destination count');
});

check('a full counter refuses the order instead of silently doing nothing', () => {
  const state = freshState();
  tick(state, 0);
  // Fill every counter, then ask for more.
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (!buyPreparedMealsDetailed(state, 0, 12).ok) break;
  }
  const result = previewPreparedMealPurchase(state, 0, 12);
  assert(!result.ok, 'a saturated counter still accepted an order');
  assertEqual(result.reason, 'counter_capacity', 'refusal reason');
});

check('two serving stations cannot serve the same meal twice', () => {
  const state = freshState();
  tick(state, 0);
  const tiles = servingStationTiles(state);
  assert(tiles.length >= 1, 'starter station has no serving station');
  drainServingCounters(state);
  buyPreparedMealsDetailed(state, 36, 12);
  tick(state, 0);
  const total = locatedMealTotal(state);
  // Draining one counter must reduce the station total by exactly what left it.
  const node = state.itemNodes.find((entry) => tiles.includes(entry.tileIndex) && (entry.items.meal ?? 0) > 0);
  assert(node, 'no counter holds meals after the purchase');
  const drained = Math.max(0, node.items.meal ?? 0);
  node.items.meal = 0;
  assertEqual(Math.round(locatedMealTotal(state)), Math.round(total - drained), 'station total after draining one counter');
});

// --- TRUTH-04: economy and settlement reconciliation -----------------------

console.log('');
console.log('TRUTH-04 economy and settlement reconciliation');

function ledgerNet(state: StationState): number {
  return Object.values(state.openingEconomy.ledger.lifetime).reduce((sum, entry) => sum + entry.net, 0);
}

check('the ledger reconciles current credits over a live run', () => {
  const state = freshState();
  const openingCredits = state.metrics.credits;
  state.controls.paused = false;
  state.controls.manualTrafficAdmission = false;
  for (let step = 0; step < 900; step += 1) tick(state, 1);
  const reconciled = openingCredits + ledgerNet(state);
  const drift = Math.abs(reconciled - state.metrics.credits);
  assert(
    drift < 1,
    `ledger does not reconcile: opening ${openingCredits} + ledger ${ledgerNet(state).toFixed(2)} = ${reconciled.toFixed(2)}, credits ${state.metrics.credits.toFixed(2)}`
  );
});

check('every credit movement in a live run lands in a category', () => {
  const state = freshState();
  state.controls.paused = false;
  state.controls.manualTrafficAdmission = false;
  for (let step = 0; step < 900; step += 1) tick(state, 1);
  const categories = Object.entries(state.openingEconomy.ledger.lifetime)
    .filter(([, entry]) => entry.count > 0)
    .map(([kind]) => kind);
  assert(categories.length >= 2, `expected several economy categories, saw ${categories.join(', ')}`);
  assert(!categories.includes('grant-award'), 'grant-award is retired; project money must be advance or award');
});

check('project money never counts as traffic revenue', () => {
  const state = freshState();
  tick(state, 0);
  const before = state.metrics.creditsEarnedLifetime;
  const beforeCredits = state.metrics.credits;
  const projects = getOpeningCapitalProjects(state);
  const available = projects.find((project) => project.state === 'available');
  assert(available, 'no capital project is available to accept');
  const accepted = acceptOpeningCapitalProject(state, available.id as never);
  assert(accepted, 'capital project could not be accepted');
  assert(state.metrics.credits > beforeCredits, 'accepting the project paid no advance');
  assertEqual(
    state.metrics.creditsEarnedLifetime,
    before,
    'lifetime traffic revenue moved on a project advance'
  );
  assert(
    state.openingEconomy.ledger.lifetime['project-advance'].count > 0,
    'the advance was not categorized as project money'
  );
});

check('a badly served call earns far less than a well served one', () => {
  // Opening ticket 09's worst observed turnaround: 24 passengers, 2 of 17
  // meals, most drink/lounge/restroom promises missed, yet it paid 343c.
  const promises = [
    { kind: 'dock', target: 1, completed: 1, payoutCredits: 120 },
    { kind: 'passengers-served', target: 17, completed: 2, payoutCredits: 0 },
    { kind: 'drinks-served', target: 13, completed: 6, payoutCredits: 52 },
    { kind: 'leisure-served', target: 13, completed: 6, payoutCredits: 52 },
    { kind: 'restroom-served', target: 11, completed: 4, payoutCredits: 33 },
    { kind: 'hygiene-served', target: 2, completed: 0, payoutCredits: 8 },
    { kind: 'passengers-returned', target: 24, completed: 22, payoutCredits: 80 }
  ];
  const bad = computeSettlementPayout(promises, 1, PORT_SETTLEMENT);
  const good = computeSettlementPayout(
    promises.map((promise) => ({ ...promise, completed: promise.target })),
    1,
    PORT_SETTLEMENT
  );
  assert(good.netCredits > bad.netCredits * 2, `a failing call should not approach a clean one (bad ${bad.netCredits}, good ${good.netCredits})`);
  assertEqual(good.shortfallPenaltyCredits, 0, 'a fully served call carries no deduction');
  assert(bad.shortfallPenaltyCredits > 0, 'a failing call carries no deduction');
  console.log(`       observed: failing call ${bad.netCredits}c, clean call ${good.netCredits}c`);
});

check('a completely unserved call cannot be quietly profitable', () => {
  const promises = [
    { kind: 'dock', target: 1, completed: 1, payoutCredits: 120 },
    { kind: 'passengers-served', target: 20, completed: 0, payoutCredits: 0 },
    { kind: 'passengers-returned', target: 20, completed: 0, payoutCredits: 80 }
  ];
  const result = computeSettlementPayout(promises, 1, PORT_SETTLEMENT);
  assert(result.netCredits <= 20, `an unserved call still paid ${result.netCredits}c`);
  // ...but it must not be able to bankrupt the station in one call either.
  assert(result.netCredits >= -Math.round(result.grossCredits * PORT_SETTLEMENT.maxNetLossShare), 'loss exceeded its floor');
});

// --- TRUTH-05: capacity and diagnosis --------------------------------------

console.log('');
console.log('TRUTH-05 capacity and diagnosis');

check('every crew member can walk to quarters, hygiene and meals', () => {
  // Regression for opening ticket 01. The authored starter shipped as two
  // disconnected halves: all eight crew spawned in the gallery wing and could
  // never reach their bunks, so needs collapsed with idle fixtures nearby.
  const state = freshState();
  tick(state, 0);
  for (const facility of getCrewFacilityReachability(state)) {
    assert(!facility.missing, `starter station has no ${facility.label}`);
    assert(
      !facility.blocked,
      `${facility.crewTotal - facility.crewWithAccess} of ${facility.crewTotal} crew cannot reach ${facility.label}`
    );
  }
});

check('a no-input run lets crew actually use the starter fixtures', () => {
  const state = freshState();
  state.controls.paused = false;
  state.controls.manualTrafficAdmission = false;
  // Keep the counters stocked so this measures fixture access rather than the
  // deliberate opening supply squeeze.
  for (let step = 0; step < 1200; step += 1) {
    tick(state, 1);
    if (step % 30 === 0) buyPreparedMealsDetailed(state, 0, 12);
  }
  assert(
    state.metrics.crewAvgHygiene > 40,
    `crew hygiene collapsed to ${state.metrics.crewAvgHygiene.toFixed(0)} beside reachable fixtures`
  );
  assertEqual(state.metrics.improvisedRestingCrew, 0, 'crew sleeping on the floor beside reachable bunks');
});

check('the crew quarters inspector reports its rendered sleep slots', () => {
  // Opening ticket 11: four starter Bunks render eight slots, but the
  // inspector counted Bed modules only and reported beds 0/0.
  const state = freshState();
  tick(state, 0);
  const dormTile = state.rooms.findIndex((room) => room === RoomType.Dorm);
  assert(dormTile >= 0, 'starter station has no crew quarters');
  const housing = getHousingInspectorAt(state, dormTile);
  assert(housing, 'crew quarters produced no housing inspector');
  assertEqual(housing.bedsTotal, 8, 'reported sleep slots');
  assertEqual(housing.bedModuleCount, 4, 'reported sleeping fixtures');
  assertEqual(
    housing.bedsTotal,
    getCrewSustainabilitySummary(state).sleepSlots,
    'inspector slots vs the capacity the shortage alert uses'
  );
});

check('an invalid placement names its reason', () => {
  const state = freshState();
  tick(state, 0);
  const dormTile = state.rooms.findIndex(
    (room, index) => room === RoomType.Dorm && state.modules[index] === ModuleType.None
  );
  assert(dormTile >= 0, 'no empty crew-quarters tile to test against');
  const spaceTile = state.tiles.findIndex((tile, index) => tile === TileType.Space && index > 0);

  const wrongRoom = previewModulePlacement(state, ModuleType.MarketStall, dormTile, 0);
  assert(!wrongRoom.valid, 'a market stall placed in the crew quarters was accepted');
  assert(wrongRoom.reason.length > 0, 'invalid placement gave no reason');
  assertEqual(wrongRoom.reason, 'Wrong room type for this module', 'wrong-room reason');

  if (spaceTile >= 0) {
    const inSpace = previewModulePlacement(state, ModuleType.Table, spaceTile, 0);
    assert(!inSpace.valid, 'a table placed in open space was accepted');
    assert(inSpace.reason.length > 0, 'placement in space gave no reason');
  }

  const broke = freshState();
  tick(broke, 0);
  broke.metrics.credits = 0;
  const cafeteriaFloor = broke.rooms.findIndex(
    (room, index) =>
      room === RoomType.Cafeteria &&
      broke.moduleOccupancyByTile[index] === null &&
      broke.moduleOccupancyByTile[index + 1] === null &&
      broke.moduleOccupancyByTile[index + broke.width] === null &&
      broke.moduleOccupancyByTile[index + broke.width + 1] === null &&
      broke.rooms[index + 1] === RoomType.Cafeteria &&
      broke.rooms[index + broke.width] === RoomType.Cafeteria &&
      broke.rooms[index + broke.width + 1] === RoomType.Cafeteria
  );
  if (cafeteriaFloor >= 0) {
    const unaffordable = previewModulePlacement(broke, ModuleType.Table, cafeteriaFloor, 0);
    assert(!unaffordable.valid, 'an unaffordable module previewed as placeable');
    assert(unaffordable.reason.includes('Needs'), `affordability reason was "${unaffordable.reason}"`);
  }
});

check('the placement preview agrees with what the build path would do', () => {
  const state = freshState();
  tick(state, 0);
  const dormTile = state.rooms.findIndex(
    (room, index) => room === RoomType.Dorm && state.modules[index] === ModuleType.None
  );
  const preview = previewModulePlacement(state, ModuleType.MarketStall, dormTile, 0);
  const attempted = tryPlaceModule(state, ModuleType.MarketStall, dormTile, 0);
  assertEqual(preview.valid, attempted.ok, 'preview verdict vs build verdict');
});

// --- OPEN-01: commercially empty starter -----------------------------------

console.log('');
console.log('OPEN-01 commercially empty starter');

check('the starter ships no completed portfolio business', () => {
  const state = freshState();
  tick(state, 0);
  for (const room of [RoomType.Market, RoomType.Lounge, RoomType.Cantina, RoomType.Workshop, RoomType.CommercialUnit, RoomType.Storage]) {
    assert(!state.rooms.includes(room), `starter station ships a completed ${String(room)}`);
  }
  for (const module of [ModuleType.MarketStall, ModuleType.FuelTank, ModuleType.FuelCoupler, ModuleType.StorageRack, ModuleType.Workbench]) {
    assert(
      !state.moduleInstances.some((instance) => instance.type === module),
      `starter station ships a ${String(module)}`
    );
  }
});

check('the starter ships the shared infrastructure the opening needs', () => {
  const state = freshState();
  tick(state, 0);
  const count = (module: ModuleType): number =>
    state.moduleInstances.filter((instance) => instance.type === module).length;
  assertEqual(count(ModuleType.PodDock), 2, 'pod docks');
  assertEqual(count(ModuleType.FreightLocker), 1, 'freight lockers');
  assertEqual(count(ModuleType.ReactorCore), 1, 'reactors');
  assert(state.rooms.includes(RoomType.Dorm), 'no crew quarters');
  assert(state.rooms.includes(RoomType.Hygiene), 'no hygiene room');
  assert(!state.rooms.includes(RoomType.Berth), 'starter station ships a passenger berth');
  assert(state.crew.total >= 4 && state.crew.total <= 6, `opening crew ${state.crew.total} is outside 4-6`);
});

check('the starter crew mess feeds crew but does not sell meals before hospitality expansion', () => {
  const state = freshState();
  tick(state, 0);
  const meals = getCrewFacilityReachability(state).find((facility) => facility.facility === 'meals');
  assert(meals && !meals.missing && !meals.blocked, 'starter crew cannot reach the crew mess');

  state.controls.paused = false;
  state.controls.manualTrafficAdmission = false;
  for (let step = 0; step < 900; step += 1) tick(state, 1);
  assertEqual(state.serviceLog.visitorLifetimeByService.meal, 0, 'crew mess sold meals before public expansion');

  placeModuleInRoom(state, RoomType.Cafeteria, ModuleType.ServingStation);
  placeModuleInRoom(state, RoomType.Cafeteria, ModuleType.Table);
  setModuleStock(
    state,
    ModuleType.ServingStation,
    'meal',
    OPENING_BALANCE.preparedMealBatch.units
  );
  tick(state, 0);
  const feedTravelers = evaluateOpeningRecipes(state).find((recipe) => recipe.id === 'feed-travelers');
  assert(feedTravelers?.complete, 'expanded cafeteria did not complete Feed Travelers');

  for (let step = 0; step < 1200; step += 1) tick(state, 1);
  assert(state.serviceLog.visitorLifetimeByService.meal > 0, 'expanded public cafeteria served no visitor meals');
});

check('the starter leaves authored room to build on', () => {
  const state = freshState();
  tick(state, 0);
  // Choice B needs at least ten contiguous Market tiles; the apron has to be
  // able to hold a starter business somewhere.
  assert(findOpenRectangle(state, 4, 3).length === 12, 'no 4x3 patch of open floor to build on');
});

check('doing nothing reveals demand but earns no access income', () => {
  const state = freshState();
  const openingCredits = state.metrics.credits;
  state.controls.paused = false;
  state.controls.manualTrafficAdmission = false;
  for (let step = 0; step < 1800; step += 1) tick(state, 1);

  const lifetime = state.openingEconomy.ledger.lifetime;
  const dockFees = lifetime['dock-fee'].revenue;
  const payroll = lifetime.wages.expenses;
  assertEqual(dockFees, 0, 'bare passenger arrival generated station income');
  assert(payroll > 0, 'the no-input run never charged payroll');
  assert(
    state.metrics.credits < openingCredits * 2,
    `a no-input run doubled its cash (${openingCredits} to ${state.metrics.credits.toFixed(0)})`
  );
  console.log(
    `       observed: access ${dockFees.toFixed(0)}c, payroll ${payroll.toFixed(0)}c, ` +
    `cash ${openingCredits} to ${Math.round(state.metrics.credits)}`
  );
});

// --- OPEN-02: demand and missed opportunity --------------------------------

console.log('');
console.log('OPEN-02 demand and missed opportunity');

check('pod demand is sampled across all three opening families', () => {
  const state = freshState();
  state.controls.paused = false;
  state.controls.manualTrafficAdmission = false;
  for (let step = 0; step < 1500; step += 1) tick(state, 1);
  const summary = getPodDemandSummary(state, null);
  assert(summary.calls > 0, 'no pod call was filed at all');
  for (const row of summary.rows) {
    assert(row.wanted > 0, `no pod ever asked for ${row.label}`);
  }
  console.log(
    `       observed: ${summary.calls} calls, ${summary.travelers} travellers, ` +
    summary.rows.map((row) => `${row.label} ${row.served}/${row.wanted}`).join(', ')
  );
});

check('unbuilt services complete nothing and are priced as missed', () => {
  const state = freshState();
  state.controls.paused = false;
  state.controls.manualTrafficAdmission = false;
  for (let step = 0; step < 1500; step += 1) tick(state, 1);
  const summary = getPodDemandSummary(state, null);

  const supplies = summary.rows.find((row) => row.family === 'supplies');
  assert(supplies, 'no supplies row');
  assertEqual(supplies.served, 0, 'travel supplies sold without a market');
  assert(supplies.missedCredits > 0, 'missed supply demand was priced at zero');
  assert(summary.missedCredits > 0, 'the run reported no missed opportunity at all');
  assert(summary.topOpportunity !== null, 'no opening opportunity was identified');
  console.log(`       observed: est. ${summary.missedCredits}c missed, top opportunity ${summary.topOpportunity}`);
});

check('served counts come from the completion log, never from intent', () => {
  const state = freshState();
  state.controls.paused = false;
  state.controls.manualTrafficAdmission = false;
  for (let step = 0; step < 1500; step += 1) tick(state, 1);
  const summary = getPodDemandSummary(state, null);
  for (const row of summary.rows) {
    assert(row.served <= row.wanted, `${row.label} served ${row.served} of only ${row.wanted} wanted`);
  }
  const food = summary.rows.find((row) => row.family === 'food');
  assert(food, 'no food row');
  assert(
    food.served <= state.serviceLog.lifetimeByService.meal,
    'more pod meals were credited than the service log recorded'
  );
});

check('the demand aggregation is bounded and survives save and reload', () => {
  const state = freshState();
  state.controls.paused = false;
  state.controls.manualTrafficAdmission = false;
  for (let step = 0; step < 2400; step += 1) tick(state, 1);
  assert(
    state.openingEconomy.podDemand.recent.length <= 40,
    `pod demand log grew unbounded to ${state.openingEconomy.podDemand.recent.length}`
  );
  const before = getPodDemandSummary(state, null);
  const restored = roundTrip(state);
  const after = summarizePodDemand(restored.openingEconomy.podDemand, state.now, null);
  assertEqual(after.calls, before.calls, 'restored call count');
  assertEqual(after.missedCredits, before.missedCredits, 'restored missed credits');
});

// --- OPEN-03: recipe-oriented build catalog --------------------------------

console.log('');
console.log('OPEN-03 recipe-oriented build catalog');

check('the catalog offers exactly the three opening groups', () => {
  const recipes = evaluateOpeningRecipes(freshState());
  assertEqual(recipes.length, 3, 'recipe count');
  assertEqual(recipes.map((recipe) => recipe.title).join(' | '), 'Feed Travelers | Sell Supplies | Service Ships', 'group titles');
  for (const recipe of recipes) {
    assert(recipe.steps.length > 0, `${recipe.title} has no steps`);
    assert(recipe.staffing.length > 0, `${recipe.title} does not say who staffs it`);
    assert(recipe.utilities.length > 0, `${recipe.title} does not say what it needs`);
    assert(recipe.economics.length > 0, `${recipe.title} does not say what it earns`);
  }
});

check('no opening business is already built on the starter', () => {
  const state = freshState();
  tick(state, 0);
  for (const recipe of evaluateOpeningRecipes(state)) {
    assert(!recipe.complete, `${recipe.title} is already complete on a fresh station`);
    assert(recipe.remainingCostCredits > 0, `${recipe.title} costs nothing to finish`);
  }
});

check('Feed Travelers is a 130c player commitment with matching build prices', () => {
  const state = freshState();
  tick(state, 0);
  const recipes = evaluateOpeningRecipes(state);
  const feed = recipes.find((recipe) => recipe.id === 'feed-travelers');
  assert(feed, 'no Feed Travelers recipe');
  assertEqual(feed.remainingCostCredits, 130, 'fresh Feed Travelers remaining cost');
  assert(
    feed.remainingCostCredits >= OPENING_BALANCE.startingCredits * 0.55 &&
      feed.remainingCostCredits <= OPENING_BALANCE.startingCredits * 0.7,
    `Feed Travelers cost ${feed.remainingCostCredits}c falls outside the 55-70% opening band`
  );
  const twoCheapest = recipes.map((recipe) => recipe.remainingCostCredits).sort((a, b) => a - b).slice(0, 2);
  assert(twoCheapest[0] + twoCheapest[1] > OPENING_BALANCE.startingCredits, 'two opening businesses fit inside starting cash');

  const serving = feed.steps.find((step) => step.module === ModuleType.ServingStation);
  const table = feed.steps.find((step) => step.module === ModuleType.Table);
  assert(serving && table, 'Feed Travelers has no fixture price steps');
  assertEqual(serving.costCredits / serving.count, moduleCreditBuildCost(ModuleType.ServingStation), 'serving station recipe price');
  assertEqual(table.costCredits / table.count, moduleCreditBuildCost(ModuleType.Table), 'table recipe price');
  const stock = feed.steps.find((step) => step.kind === 'stock');
  assert(stock, 'Feed Travelers has no opening stock step');
  assertEqual(
    stock.count,
    OPENING_BALANCE.preparedMealBatch.units,
    'prepared meal operating-readiness floor'
  );
  assert(stock.satisfied, 'starter crew reserve should satisfy meal operating readiness');
  assertEqual(stock.costCredits, OPENING_BALANCE.preparedMealBatch.costCredits, 'prepared meal restock price');
});

check('recipe steps resolve to real rooms and modules', () => {
  for (const recipe of openingRecipes()) {
    for (const step of recipe.steps) {
      if (step.kind === 'room') {
        assert(step.room !== undefined, `${recipe.title}: room step names no room`);
        assert(step.count >= ROOM_DEFINITIONS[step.room].minTiles, `${recipe.title}: room step under the minimum size`);
      }
      if (step.kind === 'module') {
        assert(step.module !== undefined, `${recipe.title}: module step names no module`);
        assert(MODULE_DEFINITIONS[step.module] !== undefined, `${recipe.title}: unknown module`);
        assert(step.costCredits > 0, `${recipe.title}: module step is free`);
      }
    }
  }
});

check('building a step ticks it off', () => {
  const state = freshState();
  tick(state, 0);
  const before = evaluateOpeningRecipes(state).find((recipe) => recipe.id === 'sell-supplies');
  assert(before, 'no sell-supplies recipe');
  const marketStep = before.steps.find((step) => step.room === RoomType.Market);
  assert(marketStep && !marketStep.satisfied, 'market step already satisfied');

  const tiles = findOpenRectangle(state, 4, 3);
  assert(tiles.length === 12, 'no open floor to paint a market on');
  for (const tile of tiles) setRoom(state, tile, RoomType.Market);
  tick(state, 0);

  const after = evaluateOpeningRecipes(state).find((recipe) => recipe.id === 'sell-supplies');
  const paintedStep = after?.steps.find((step) => step.room === RoomType.Market);
  assert(paintedStep?.satisfied, 'painting the market did not satisfy its recipe step');
  assert(
    (after?.remainingCostCredits ?? 0) <= before.remainingCostCredits,
    'remaining cost went up after completing a step'
  );
});

check('Service Ships requires one continuous tank-to-coupler fuel line', () => {
  const state = freshState();
  tick(state, 0);
  for (let tile = 0; tile < state.tiles.length; tile += 1) {
    setUtilityUnderlayTile(state, 'fuel-pipe', tile, false);
  }
  placeModuleInRoom(state, RoomType.Maintenance, ModuleType.FuelTank);
  const couplerTile = placeFuelCouplerAtStarterDock(state);
  const tank = state.moduleInstances.find((module) => module.type === ModuleType.FuelTank);
  assert(tank, 'Fuel Tank placement was not recorded');
  const couplerServiceTile = walkableNeighbor(state, couplerTile);
  assert(couplerServiceTile !== null, 'Fuel Coupler has no interior service tile');

  setUtilityUnderlayTile(state, 'fuel-pipe', tank.originTile, true);
  setUtilityUnderlayTile(state, 'fuel-pipe', couplerServiceTile, true);
  let utility = evaluateOpeningRecipes(state)
    .find((recipe) => recipe.id === 'service-ships')
    ?.steps.find((step) => step.kind === 'utility');
  assert(utility && !utility.satisfied, 'isolated fuel-pipe tiles satisfied Service Ships');

  const path = fuelPipePath(state, tank.originTile, couplerServiceTile);
  assert(path.length > 1, 'could not find a valid fuel-pipe route from tank to coupler');
  for (const tile of path) setUtilityUnderlayTile(state, 'fuel-pipe', tile, true);
  utility = evaluateOpeningRecipes(state)
    .find((recipe) => recipe.id === 'service-ships')
    ?.steps.find((step) => step.kind === 'utility');
  assertEqual(utility?.have, 1, 'connected fuel line progress');
  assert(utility?.satisfied, 'connected tank-to-coupler line did not satisfy Service Ships');
});

check('Feed Travelers only becomes live when its counters and tables share one active Cafeteria', () => {
  const state = freshState();
  tick(state, 0);
  const detachedTiles = findOpenRectangle(state, 5, 4);
  assertEqual(detachedTiles.length, 20, 'no detached Cafeteria test area');
  for (const tile of detachedTiles) setRoom(state, tile, RoomType.Cafeteria);
  placeModuleInTiles(state, detachedTiles, ModuleType.ServingStation);
  placeModuleInTiles(state, detachedTiles, ModuleType.Table);
  tick(state, 0);

  let recipe = evaluateOpeningRecipes(state).find((candidate) => candidate.id === 'feed-travelers');
  assert(recipe && !recipe.built, 'fixtures split across Cafeterias counted as one public business');
  assert(recipe && !recipe.operational, 'split Cafeterias became operational');

  placeModuleInRoom(state, RoomType.Cafeteria, ModuleType.ServingStation);
  placeModuleInRoom(state, RoomType.Cafeteria, ModuleType.Table);
  tick(state, 0);
  recipe = evaluateOpeningRecipes(state).find((candidate) => candidate.id === 'feed-travelers');
  assert(recipe?.built, 'two fixtures in the starter Cafeteria did not establish the business');
  assert(recipe?.operational, 'a stocked active public Cafeteria did not become operational');
});

check('Feed Travelers uses the meal-and-tray limiting count at active counters', () => {
  const state = freshState();
  tick(state, 0);
  placeModuleInRoom(state, RoomType.Cafeteria, ModuleType.ServingStation);
  placeModuleInRoom(state, RoomType.Cafeteria, ModuleType.Table);
  tick(state, 0);
  for (const node of state.itemNodes) {
    if (state.moduleInstances.some((module) => module.type === ModuleType.ServingStation && module.originTile === node.tileIndex)) {
      node.items.meal = OPENING_BALANCE.preparedMealBatch.units;
      node.items.cleanTray = 0;
    }
  }
  const recipe = evaluateOpeningRecipes(state).find((candidate) => candidate.id === 'feed-travelers');
  const stock = recipe?.steps.find((step) => step.kind === 'stock');
  assert(recipe?.built, 'public Cafeteria should remain a completed capital investment');
  assertEqual(stock?.have, 0, 'meals without trays counted as ready servings');
  assert(!recipe?.operational, 'meal-only counters became operational');
  assert(recipe?.operationalReasons.some((reason) => reason.includes('meal and one clean tray')), 'tray shortage lacked a truthful reason');
});

check('Sell Supplies stays built-but-blocked until its Stall is in an active Market cluster', () => {
  const state = freshState();
  tick(state, 0);
  const tiles = findOpenRectangle(state, 5, 3);
  assertEqual(tiles.length, 15, 'no Market test area');
  for (const tile of tiles) setRoom(state, tile, RoomType.Market);
  placeModuleInTiles(state, tiles, ModuleType.MarketStall);
  tick(state, 0);

  const recipe = evaluateOpeningRecipes(state).find((candidate) => candidate.id === 'sell-supplies');
  assert(recipe?.built, 'Market capital placement was not retained');
  assert(!recipe?.operational, 'an unenclosed Market became operational');
  assert(recipe?.operationalReasons.some((reason) => reason.includes('Market needs enclosure')), 'Market inactivity did not explain enclosure/power requirements');
});

check('Service Ships accepts only an attached Pod Dock with a live tank-to-coupler network', () => {
  const state = freshState();
  tick(state, 0);
  placeStockFixture(state, RoomType.Maintenance, ModuleType.FuelTank, 4, 3);
  const couplerTile = placeFuelCouplerAtStarterDock(state);
  const tank = state.moduleInstances.find((module) => module.type === ModuleType.FuelTank);
  assert(tank, 'Fuel Tank placement was not recorded');
  const serviceTile = walkableNeighbor(state, couplerTile);
  assert(serviceTile !== null, 'Fuel Coupler has no interior service tile');

  setUtilityUnderlayTile(state, 'fuel-pipe', tank.originTile, true);
  setUtilityUnderlayTile(state, 'fuel-pipe', serviceTile, true);
  let recipe = evaluateOpeningRecipes(state).find((candidate) => candidate.id === 'service-ships');
  assert(!recipe?.built, 'two disconnected pipe ends formed a ship-service business');

  for (const tile of fuelPipePath(state, tank.originTile, serviceTile)) setUtilityUnderlayTile(state, 'fuel-pipe', tile, true);
  tick(state, 0);
  recipe = evaluateOpeningRecipes(state).find((candidate) => candidate.id === 'service-ships');
  assert(recipe?.built, 'attached Pod Dock and connected tank did not establish Service Ships');
  assert(!recipe?.operational, 'empty connected tank should need a fuel lot');
  assert(recipe?.operationalReasons.some((reason) => reason.includes('fuel lot')), 'empty fuel network lacked a stock explanation');
});

check('future facilities stay visible with plain prerequisites', () => {
  const facilities = futureFacilities();
  assert(facilities.length >= 4, 'too few future facilities listed');
  for (const facility of facilities) {
    assert(facility.prerequisite.length > 0, `${facility.title} has no prerequisite copy`);
  }
});

// --- OPEN-04: opening balance pass -----------------------------------------

console.log('');
console.log('OPEN-04 opening balance pass');

check('opening cash buys one recipe plus a contingency', () => {
  const state = freshState();
  tick(state, 0);
  const cash = state.metrics.credits;
  const costs = evaluateOpeningRecipes(state).map((recipe) => ({
    title: recipe.title,
    cost: recipe.remainingCostCredits,
    share: recipe.remainingCostCredits / cash
  }));
  for (const entry of costs) {
    assert(
      entry.share >= 0.55 && entry.share <= 0.7,
      `${entry.title} costs ${entry.cost}c, ${Math.round(entry.share * 100)}% of ${cash}c — target is 55-70%`
    );
  }
  console.log(
    `       observed: ${cash}c opening cash, ` +
    costs.map((entry) => `${entry.title} ${entry.cost}c (${Math.round(entry.share * 100)}%)`).join(', ')
  );
});

check('two recipes cannot both be completed immediately', () => {
  const state = freshState();
  tick(state, 0);
  const sorted = evaluateOpeningRecipes(state)
    .map((recipe) => recipe.remainingCostCredits)
    .sort((a, b) => a - b);
  assert(
    sorted[0] + sorted[1] > state.metrics.credits,
    `the two cheapest recipes cost ${sorted[0] + sorted[1]}c against ${state.metrics.credits}c of cash`
  );
});

check('access and handling fees cannot finance growth on their own', () => {
  const state = freshState();
  const openingCredits = state.metrics.credits;
  state.controls.paused = false;
  state.controls.manualTrafficAdmission = false;
  for (let step = 0; step < 1800; step += 1) tick(state, 1);
  const lifetime = state.openingEconomy.ledger.lifetime;
  const passive = lifetime['dock-fee'].revenue + lifetime['courier-fee'].revenue;
  const cheapestRecipe = Math.min(
    ...evaluateOpeningRecipes(state).map((recipe) => recipe.remainingCostCredits)
  );
  assert(
    passive < lifetime.wages.expenses,
    `access and handling alone (${passive.toFixed(0)}c) covered payroll (${lifetime.wages.expenses.toFixed(0)}c)`
  );
  assert(
    state.metrics.credits - openingCredits < cheapestRecipe,
    `doing nothing funded a whole recipe: +${(state.metrics.credits - openingCredits).toFixed(0)}c against ${cheapestRecipe}c`
  );
  console.log(
    `       observed: access+handling ${passive.toFixed(0)}c, payroll ${lifetime.wages.expenses.toFixed(0)}c, ` +
    `cash ${openingCredits} to ${Math.round(state.metrics.credits)}`
  );
});

check('charter site shifts the best opportunity without closing a path', () => {
  // Every site must leave all three recipes buildable; what changes is which
  // one the local economy rewards.
  const profiles = [
    { label: 'busy lane', site: { laneTrafficFactor: { north: 2.4, east: 2.4, south: 2.4, west: 2.4 }, sunFactor: 0.5, debrisFactor: 0 } },
    { label: 'remote', site: { laneTrafficFactor: { north: 0.6, east: 0.6, south: 0.6, west: 0.6 }, sunFactor: 0.5, debrisFactor: 0.6 } },
    { label: 'ice belt', site: { laneTrafficFactor: { north: 1.2, east: 1.2, south: 1.2, west: 1.2 }, sunFactor: 0.5, debrisFactor: 0, resourceType: 'ice' } }
  ];
  const observed = profiles.map((entry) => {
    const profile = deriveOpeningEconomyProfile(entry.site as never);
    const scores: Array<[string, number]> = [
      ['food', profile.passengerTrafficMultiplier],
      ['supplies', profile.retailDemandMultiplier],
      ['ship service', profile.repairDemandMultiplier * (2 - profile.fuelWholesaleMultiplier)]
    ];
    scores.sort((a, b) => b[1] - a[1]);
    for (const [, score] of scores) {
      assert(score > 0.5, `${entry.label} closed off a path with multiplier ${score.toFixed(2)}`);
    }
    return `${entry.label} favours ${scores[0][0]}`;
  });
  assert(new Set(observed).size > 1, `every charter favoured the same path: ${observed.join(', ')}`);
  console.log(`       observed: ${observed.join(' | ')}`);
});

check('the opening economy constants live in one place', () => {
  assertEqual(createInitialState().metrics.credits, OPENING_BALANCE.startingCredits, 'starting credits');
  assertEqual(
    OPENING_STOCK_COST.preparedMeals,
    OPENING_BALANCE.preparedMealBatch.costCredits,
    'prepared meal batch price'
  );
  assertEqual(
    OPENING_STOCK_COST.travelSupplies,
    OPENING_BALANCE.travelSupplyBatch.costCredits,
    'travel supply batch price'
  );
  assertEqual(OPENING_STOCK_COST.fuelLot, OPENING_BALANCE.fuelLot.costCredits, 'fuel lot price');
  // The purchase path must charge what the recipe advertises.
  const state = freshState();
  tick(state, 0);
  drainServingCounters(state);
  const order = buyPreparedMealsDetailed(state);
  assert(order.ok, `meal order refused: ${order.message}`);
  assertEqual(order.creditCost, OPENING_BALANCE.preparedMealBatch.costCredits, 'charged price vs advertised price');
});

console.log('');
console.log(`${checks - failures}/${checks} checks passed`);
if (failures > 0) process.exit(1);
