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
  createInitialState,
  getOpeningCapitalProjects,
  getPreparedMealInventory,
  previewPreparedMealPurchase,
  removeModuleAtTile,
  setRoom,
  tick,
  tryPlaceModule
} from '../src/sim';
import { PORT_SETTLEMENT } from '../src/sim/balance';
import { computeSettlementPayout } from '../src/sim/opening-economy';
import { hydrateStateFromSave, parseAndMigrateSave, serializeSave } from '../src/sim/save';
import {
  appendServiceCompletion,
  createServiceLog,
  fixtureProvidesService
} from '../src/sim/service-truth';
import { ModuleType, RoomType, type StationState } from '../src/sim/types';

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
  const marketTiles: number[] = [];
  for (let index = 0; index < state.rooms.length; index += 1) {
    if (state.rooms[index] === RoomType.Market) marketTiles.push(index);
  }
  assert(marketTiles.length >= 4, 'starter station has no market room to convert');
  for (const tile of marketTiles) {
    if (state.modules[tile] !== ModuleType.None) removeModuleAtTile(state, tile);
  }
  // Lounge and Couch are tier-1 catalog entries; this check is about physical
  // truth rather than progression gating.
  state.unlocks.tier = 1;
  for (const tile of marketTiles) setRoom(state, tile, RoomType.Lounge);
  tick(state, 0);
  const placed = marketTiles.filter((tile) => tryPlaceModule(state, ModuleType.Couch, tile, 0).ok).length;
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

console.log('');
console.log(`${checks - failures}/${checks} checks passed`);
if (failures > 0) process.exit(1);
