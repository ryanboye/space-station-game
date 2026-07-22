import {
  acceptCommercialOffer,
  closeCommercialUnit,
  createInitialState,
  openCommercialUnitForOffers,
  previewCommercialOffer,
  removeModuleAtTile,
  setRoom,
  tick
} from '../src/sim/index';
import { RoomType, TileType, type StationState } from '../src/sim/types';
import { hydrateStateFromSave, parseAndMigrateSave, serializeSave } from '../src/sim/save';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function advance(state: StationState, seconds: number): void {
  state.controls.paused = false;
  for (let elapsed = 0; elapsed < seconds; elapsed += 0.2) tick(state, 0.2);
}

function createCommercialShell(): { state: StationState; anchor: number } {
  const state = createInitialState({ seed: 7007, physicalStarterInventory: true });
  state.unlocks.tier = 1;
  const tiles: number[] = [];
  for (let y = 2; y < 6; y++) {
    for (let x = 2; x < 7; x++) tiles.push(y * state.width + x);
  }
  for (const tile of tiles) {
    removeModuleAtTile(state, tile);
    state.tiles[tile] = TileType.Floor;
    setRoom(state, tile, RoomType.CommercialUnit);
    state.pressurized[tile] = true;
  }
  return { state, anchor: tiles[0] };
}

function testOfferAndFitoutLoop(): StationState {
  const { state, anchor } = createCommercialShell();
  const opened = openCommercialUnitForOffers(state, anchor);
  assert(opened.ok && opened.unit, opened.reason ?? 'Commercial application call failed.');
  assert(opened.unit.offers.length === 3, `Expected 3 offers, got ${opened.unit.offers.length}.`);
  assert(new Set(opened.unit.offers.map((offer) => offer.kind)).size === 3, 'Offers did not present distinct business choices.');
  const restaurant = opened.unit.offers.find((offer) => offer.kind === 'restaurant');
  const chosen = restaurant ?? opened.unit.offers[0];
  assert(previewCommercialOffer(state, opened.unit.id, chosen.id), 'Offer preview selection failed.');
  const accepted = acceptCommercialOffer(state, opened.unit.id, chosen.id);
  assert(accepted.ok, accepted.reason ?? 'Tenant acceptance failed.');
  advance(state, chosen.fitoutDurationSec + 8);
  const unit = state.commercialUnits[0];
  assert(unit.phase === 'open', `Expected open business, got ${unit.phase}: ${unit.statusReason}.`);
  assert(unit.fittedModuleIds.length === chosen.fixtures.length, 'Not all proposed fixtures were installed.');
  assert(unit.tenantStaffTiles.length === chosen.suppliedStaff, 'Tenant staff markers do not match the offer.');
  assert(unit.tiles.every((tile) => state.rooms[tile] === chosen.targetRoom), 'Shell did not convert to the operating room type.');
  return state;
}

function testRentAndSaveRoundTrip(): void {
  const state = testOfferAndFitoutLoop();
  const unit = state.commercialUnits[0];
  const creditsBefore = state.metrics.credits;
  advance(state, 62);
  assert(unit.rentCollected > 0, 'Open tenant did not pay rent.');
  assert(state.metrics.credits > creditsBefore, 'Rent did not reach station credits.');

  const parsed = parseAndMigrateSave(serializeSave('commercial-test', state, 'test'));
  assert(parsed.ok, parsed.ok ? '' : parsed.error);
  const hydrated = hydrateStateFromSave(parsed.save, { seed: 7007 }).state;
  const loaded = hydrated.commercialUnits[0];
  assert(loaded?.phase === 'open', 'Commercial phase was not preserved through save/load.');
  assert(loaded.fittedModuleIds.length === loaded.selectedOffer?.fixtures.length, 'Fixture ownership was not rebuilt on load.');

  const closed = closeCommercialUnit(hydrated, loaded.id);
  assert(closed.ok, closed.reason ?? 'Closing the lease failed.');
  assert(loaded.tiles.every((tile) => hydrated.rooms[tile] === RoomType.CommercialUnit), 'Closing did not restore the vacant shell.');
  assert(loaded.fittedModuleIds.length === 0, 'Tenant fixtures remained after closure.');
}

testOfferAndFitoutLoop();
testRentAndSaveRoundTrip();
console.log('commercial-unit-tests: ok');
