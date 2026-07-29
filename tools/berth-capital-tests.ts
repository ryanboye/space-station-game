// Berth capital commissioning tests.
//
// The first Berth is meant to be the station's second-act capital event: berth
// floor paint stays free, and the whole size-class price is charged once when
// the player commits the bay through `commitBerthFootprint`. These checks pin
// that contract through the production APIs only — price, refusal, save/load
// durability, and the migration rule that already-painted berths are never
// billed retroactively.
//
// Run with `npm run test:berth-capital`.

import {
  commitBerthFootprint,
  createInitialState,
  getBerthFacilityAt,
  quoteBerthFootprint,
  setRoom,
  tick
} from '../src/sim/sim';
import { BERTH_CAPITAL_COST } from '../src/sim/balance';
import { hydrateStateFromSave, parseAndMigrateSave, serializeSave } from '../src/sim/save';
import { applyPastedRoomSettings } from '../src/sim/layout-stamp';
import { RoomType, TileType, type StationState } from '../src/sim/types';

let failures = 0;

function check(name: string, run: () => string): void {
  const started = Date.now();
  try {
    const evidence = run();
    console.log(`ok   ${name} (${Date.now() - started}ms)`);
    console.log(`     ${evidence}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${name} (${Date.now() - started}ms)`);
    console.error(`     ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
}

function fresh(credits?: number): StationState {
  const state = createInitialState({ physicalStarterInventory: true, manualTrafficAdmission: true });
  tick(state, 0);
  if (credits !== undefined) state.metrics.credits = credits;
  return state;
}

/** First open rectangle of bare floor, returned in row-major order. */
function openRectangle(state: StationState, width: number, height: number): number[] {
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
      return tiles;
    }
  }
  throw new Error(`no free ${width}x${height} floor patch in the starter apron`);
}

function berthTileCount(state: StationState): number {
  let total = 0;
  for (const room of state.rooms) if (room === RoomType.Berth) total += 1;
  return total;
}

function commissioningEvents(state: StationState) {
  return state.openingEconomy.ledger.recent.filter(
    (event) => event.kind === 'station-expansion' && event.label.includes('berth commissioned')
  );
}

function roundTrip(state: StationState): StationState {
  const parsed = parseAndMigrateSave(serializeSave('berth-capital', state, 'berth-capital'));
  assert(parsed.ok, `save did not parse back: ${parsed.ok ? '' : parsed.error}`);
  return hydrateStateFromSave(parsed.save).state;
}

const MEDIUM = BERTH_CAPITAL_COST.medium;

// ---------------------------------------------------------------------------

check('committing a medium berth debits the stated price exactly once', () => {
  const state = fresh(2000);
  const footprint = openRectangle(state, 4, 3);
  const quote = quoteBerthFootprint(state, footprint);
  assertEqual(quote.size, 'medium', 'quoted size class');
  assertEqual(quote.area, 12, 'quoted berth area');
  assertEqual(quote.cost, MEDIUM, 'quoted commissioning price');
  assertEqual(quote.reason, null, 'quote blocked a payable commit');

  const before = state.metrics.credits;
  const commit = commitBerthFootprint(state, footprint);
  assert(commit.ok, `commit refused: ${commit.ok ? '' : commit.reason}`);
  assertEqual(commit.cost, MEDIUM, 'charged price');
  assertEqual(before - state.metrics.credits, MEDIUM, 'credits debited');
  assertEqual(berthTileCount(state), 12, 'berth tiles painted');

  tick(state, 0);
  const facility = getBerthFacilityAt(state, commit.anchorTile);
  assert(facility, 'committed footprint did not read back as a berth');
  assertEqual(facility.size, 'medium', 'derived berth size class');

  const events = commissioningEvents(state);
  assertEqual(events.length, 1, 'commissioning ledger events');
  assertEqual(events[0].credits, -MEDIUM, 'ledger event amount');
  assertEqual(events[0].costBasis, MEDIUM, 'ledger event cost basis');
  assertEqual(events[0].tileIndex, commit.anchorTile, 'ledger event attribution tile');
  const lifetime = state.openingEconomy.ledger.lifetime['station-expansion'];
  assertEqual(lifetime.count, 1, 'lifetime commissioning count');
  assertEqual(lifetime.expenses, MEDIUM, 'lifetime commissioning expenses');

  // Re-committing the same floor is a no-op, not a second bill.
  const held = state.metrics.credits;
  const again = commitBerthFootprint(state, footprint);
  assert(again.ok, 'recommitting an existing berth was refused');
  assertEqual(again.cost, 0, 'recommit price');
  assertEqual(state.metrics.credits, held, 'recommit moved credits');
  assertEqual(commissioningEvents(state).length, 1, 'recommit wrote a second ledger event');

  return `12-tile medium berth at anchor ${commit.anchorTile} billed ${MEDIUM}c once; ` +
    `credits ${before} -> ${state.metrics.credits}; recommit charged 0c`;
});

check('an unaffordable berth is refused with a reason and paints nothing', () => {
  const state = fresh();
  const footprint = openRectangle(state, 4, 3);
  const opening = state.metrics.credits;
  assert(opening < MEDIUM, `opening cash ${opening} already covers a ${MEDIUM}c berth`);

  const quote = quoteBerthFootprint(state, footprint);
  assertEqual(quote.affordable, false, 'quote called an unaffordable berth affordable');
  assertEqual(quote.reason, `Need ${MEDIUM} credits`, 'quote refusal reason');

  const commit = commitBerthFootprint(state, footprint);
  assert(!commit.ok, 'an unaffordable berth was committed anyway');
  assertEqual(commit.reason, `Need ${MEDIUM} credits`, 'commit refusal reason');
  assertEqual(commit.cost, MEDIUM, 'refusal still reports the price');
  assertEqual(state.metrics.credits, opening, 'refused commit moved credits');
  assertEqual(berthTileCount(state), 0, 'refused commit left berth floor behind');
  assertEqual(commissioningEvents(state).length, 0, 'refused commit wrote a ledger event');

  tick(state, 0);
  assertEqual(getBerthFacilityAt(state, footprint[0]), null, 'refused commit left a partial berth facility');

  return `opening cash ${opening}c refused a ${MEDIUM}c berth with "${commit.reason}"; 0 tiles painted, 0 ledger events`;
});

check('the charge survives a save/load round trip and is not re-applied', () => {
  const state = fresh(2000);
  const footprint = openRectangle(state, 4, 3);
  const commit = commitBerthFootprint(state, footprint);
  assert(commit.ok, 'setup commit failed');
  const paid = state.metrics.credits;

  const restored = roundTrip(state);
  assertEqual(restored.metrics.credits, paid, 'credits after reload');
  assertEqual(berthTileCount(restored), 12, 'berth tiles after reload');
  const lifetime = restored.openingEconomy.ledger.lifetime['station-expansion'];
  assertEqual(lifetime.count, 1, 'lifetime commissioning count after reload');
  assertEqual(lifetime.expenses, MEDIUM, 'lifetime commissioning expenses after reload');

  const facility = getBerthFacilityAt(restored, commit.anchorTile);
  assert(facility, 'reloaded berth lost its facility');
  assertEqual(facility.size, 'medium', 'reloaded berth size class');

  // A reloaded berth is already commissioned: quoting it again is free.
  const quote = quoteBerthFootprint(restored, footprint);
  assertEqual(quote.cost, 0, 'reloaded berth was re-priced');
  const recommit = commitBerthFootprint(restored, footprint);
  assert(recommit.ok, 'recommitting a reloaded berth was refused');
  assertEqual(recommit.cost, 0, 'reloaded berth was re-charged');
  assertEqual(restored.metrics.credits, paid, 'recommitting a reloaded berth moved credits');

  // And running the station forward never bills it a second time either.
  restored.controls.paused = false;
  for (let step = 0; step < 120; step += 1) tick(restored, 1);
  assertEqual(
    restored.openingEconomy.ledger.lifetime['station-expansion'].count,
    1,
    'a running station re-billed a commissioned berth'
  );

  return `credits held at ${paid}c across save/load; recommit and 120s of runtime both charged 0c`;
});

check('a pre-existing authored berth is never charged retroactively', () => {
  // Scenario authors and the save hydrator paint berth floor through setRoom,
  // the uncharged primitive. Such a berth must keep working and must never be
  // billed — before or after a reload.
  const state = fresh(2000);
  const footprint = openRectangle(state, 4, 3);
  for (const tile of footprint) setRoom(state, tile, RoomType.Berth);
  tick(state, 0);
  const authoredCredits = state.metrics.credits;
  assertEqual(commissioningEvents(state).length, 0, 'authored berth paint billed the station');

  state.controls.paused = false;
  for (let step = 0; step < 120; step += 1) tick(state, 1);
  assertEqual(
    state.openingEconomy.ledger.lifetime['station-expansion'].count,
    0,
    'a running station billed an authored berth'
  );

  const restored = roundTrip(state);
  assertEqual(berthTileCount(restored), 12, 'authored berth tiles after reload');
  assertEqual(
    restored.openingEconomy.ledger.lifetime['station-expansion'].count,
    0,
    'reload billed an authored berth'
  );
  const facility = getBerthFacilityAt(restored, footprint[0]);
  assert(facility, 'authored berth lost its facility on reload');
  assertEqual(facility.size, 'medium', 'authored berth size class');
  assertEqual(quoteBerthFootprint(restored, footprint).cost, 0, 'authored berth was priced after the fact');

  return `authored 12-tile berth survived 120s and a reload uncharged ` +
    `(credits ${authoredCredits}c -> ${restored.metrics.credits.toFixed(0)}c, 0 commissioning events)`;
});

check('a berth pays its class price once however it is assembled', () => {
  const state = fresh(2000);
  const bay = openRectangle(state, 5, 3);
  // Three nested footprints of the same bay: a sub-medium stub, the medium
  // bay, then a wider medium bay.
  const stub = [0, 1, 5, 6, 10, 11].map((offset) => bay[offset]);
  const medium = [0, 1, 2, 3, 5, 6, 7, 8, 10, 11, 12, 13].map((offset) => bay[offset]);

  const stubQuote = quoteBerthFootprint(state, stub);
  assertEqual(stubQuote.size, 'small', 'stub size class');
  assertEqual(stubQuote.cost, BERTH_CAPITAL_COST.small, 'stub price');
  const opening = state.metrics.credits;
  const stubCommit = commitBerthFootprint(state, stub);
  assert(stubCommit.ok, 'stub commit failed');
  assertEqual(state.metrics.credits, opening - BERTH_CAPITAL_COST.small, 'stub debit');

  // Widen the same bay into the medium class: the station owes the class
  // difference, never the full medium price a second time.
  const growQuote = quoteBerthFootprint(state, medium);
  assertEqual(growQuote.size, 'medium', 'grown size class');
  assertEqual(growQuote.cost, MEDIUM - BERTH_CAPITAL_COST.small, 'grown price is the class difference');
  const beforeGrowth = state.metrics.credits;
  const growCommit = commitBerthFootprint(state, medium);
  assert(growCommit.ok, `growth commit refused: ${growCommit.ok ? '' : growCommit.reason}`);
  assertEqual(beforeGrowth - state.metrics.credits, MEDIUM - BERTH_CAPITAL_COST.small, 'growth debit');
  assertEqual(growCommit.area, 12, 'grown berth area');

  // Widening further without changing class costs nothing at all.
  const widerQuote = quoteBerthFootprint(state, bay);
  assertEqual(widerQuote.size, 'medium', 'wider bay size class');
  assertEqual(widerQuote.cost, 0, 'widening within a class was billed');
  const widerCommit = commitBerthFootprint(state, bay);
  assert(widerCommit.ok, 'wider commit refused');
  assertEqual(widerCommit.area, 15, 'wider berth area');
  assertEqual(
    opening - state.metrics.credits,
    MEDIUM,
    'total paid for the finished berth differs from its class price'
  );

  return `stub ${BERTH_CAPITAL_COST.small}c -> medium ${MEDIUM - BERTH_CAPITAL_COST.small}c -> ` +
    `15-tile widening 0c; total paid ${MEDIUM}c equals the medium class price`;
});

check('an affordable copied berth footprint is charged once', () => {
  const state = fresh(2000);
  const footprint = openRectangle(state, 4, 3);
  const before = state.metrics.credits;
  const pasted = applyPastedRoomSettings(state, footprint.map((tileIndex) => ({
    tileIndex,
    room: RoomType.Berth,
    zone: state.zones[tileIndex],
    housingPolicy: state.roomHousingPolicies[tileIndex]
  })));

  assert(pasted.ok, `affordable berth stamp failed: ${pasted.ok ? '' : pasted.reason}`);
  assertEqual(pasted.berthCost, MEDIUM, 'stamp berth charge');
  assertEqual(before - state.metrics.credits, MEDIUM, 'stamp credit debit');
  assertEqual(berthTileCount(state), 12, 'stamp berth floor');
  assertEqual(commissioningEvents(state).length, 1, 'stamp commissioning events');

  return `12 copied berth cells painted atomically for one ${MEDIUM}c commitment and one ledger event`;
});

check('an unaffordable copied berth stamp is an atomic no-op', () => {
  const state = fresh();
  const patch = openRectangle(state, 5, 3);
  const footprint = [0, 1, 2, 3, 5, 6, 7, 8, 10, 11, 12, 13].map((offset) => patch[offset]);
  const ordinaryTile = patch[4];
  const originalRoom = state.rooms[ordinaryTile];
  const opening = state.metrics.credits;
  const pasted = applyPastedRoomSettings(state, [
    {
      tileIndex: ordinaryTile,
      room: RoomType.Storage,
      zone: state.zones[ordinaryTile],
      housingPolicy: state.roomHousingPolicies[ordinaryTile]
    },
    ...footprint.map((tileIndex) => ({
      tileIndex,
      room: RoomType.Berth,
      zone: state.zones[tileIndex],
      housingPolicy: state.roomHousingPolicies[tileIndex]
    }))
  ]);

  assert(!pasted.ok, 'unaffordable berth stamp succeeded');
  assertEqual(pasted.reason, `Need ${MEDIUM} credits`, 'stamp refusal reason');
  assertEqual(state.metrics.credits, opening, 'refused stamp moved credits');
  assertEqual(berthTileCount(state), 0, 'refused stamp painted berth cells');
  assertEqual(state.rooms[ordinaryTile], originalRoom, 'refused stamp partially painted an ordinary room');
  assertEqual(commissioningEvents(state).length, 0, 'refused stamp wrote a ledger event');

  return `mixed room/berth stamp refused with "${pasted.reason}"; credits and every room cell stayed unchanged`;
});

check('a copied ordinary room still pastes without a berth charge', () => {
  const state = fresh(2000);
  const footprint = openRectangle(state, 2, 2);
  const before = state.metrics.credits;
  const pasted = applyPastedRoomSettings(state, footprint.map((tileIndex) => ({
    tileIndex,
    room: RoomType.Storage,
    zone: state.zones[tileIndex],
    housingPolicy: state.roomHousingPolicies[tileIndex]
  })));

  assert(pasted.ok, 'ordinary room stamp failed');
  assertEqual(pasted.berthCost, 0, 'ordinary stamp reported a berth charge');
  assertEqual(state.metrics.credits, before, 'ordinary room paint moved credits');
  assert(footprint.every((tile) => state.rooms[tile] === RoomType.Storage), 'ordinary room stamp did not paint all cells');
  assertEqual(commissioningEvents(state).length, 0, 'ordinary room stamp wrote a berth event');

  return '4 copied Storage cells pasted normally for 0c with no berth commissioning event';
});

if (failures > 0) {
  console.error(`berth-capital-tests: ${failures} check(s) failed`);
  process.exit(1);
}
console.log('berth-capital-tests: ok 8/8 checks');
