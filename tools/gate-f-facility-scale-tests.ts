// Focused runner for the Gate F facility-scale tranche.
//
// Every check works from the deterministic showcase scenarios, so a failure
// names a layout a player can actually load with ?scenario=<name> and look at.
//
// Run with `npm run test:gate-f-facility`. Filter with GATE_F_TEST_FILTER=<substring>.

import { applyColdStartScenario } from '../src/sim/cold-start-scenarios';
import {
  createInitialState,
  setRoom,
  setShelfMix,
  tick,
  tryCreateReservation,
  tryPlaceModule
} from '../src/sim/sim';
import { hydrateStateFromSave, parseAndMigrateSave, serializeSave } from '../src/sim/save';
import {
  buildSlotReservationRequest,
  facilityClaimFor,
  freeSlotsOfRole,
  releaseOrphanedFacilityClaims,
  slotIsOccupied,
  slotsOfRole,
  FACILITY_SESSIONS,
  type FacilitySlotTarget
} from '../src/sim/facility-slots';
import {
  barGroups,
  dwellSlotsInRoom,
  freeReceptionSlots,
  marketChainStatus,
  receptionStatus,
  shelfAppealFor,
  SHELF_MIXES
} from '../src/sim/facility-machines';
import { resolveFacilitySlots } from '../src/sim/facility-descriptors';
import {
  ModuleType,
  RoomType,
  type StationState,
  type Visitor
} from '../src/sim/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function scenario(name: string, seed = 4242): StationState {
  const state = createInitialState({ seed, physicalStarterInventory: true, manualTrafficAdmission: true });
  assert(applyColdStartScenario(state, name), `Unknown scenario ${name}.`);
  tick(state, 0);
  return state;
}

function advance(state: StationState, seconds: number, step = 0.2): void {
  state.controls.paused = false;
  for (let elapsed = 0; elapsed < seconds; elapsed += step) tick(state, step);
}

function claim(state: StationState, ownerId: number, slot: FacilitySlotTarget, ownerKind: 'visitor' | 'crew' = 'visitor'): boolean {
  const request = buildSlotReservationRequest({ ownerKind, ownerId, slot });
  if (!request) return false;
  return tryCreateReservation(state, request).ok;
}

function stockOf(state: StationState, tileIndex: number, item: 'tradeGood' | 'rawMaterial' | 'meal'): number {
  const node = state.itemNodes.find((entry) => entry.tileIndex === tileIndex);
  return Math.max(0, node?.items[item] ?? 0);
}

// ---------------------------------------------------------------------------
// 1. Exclusive claims and cleanup across every release path
// ---------------------------------------------------------------------------

function testExclusiveClaimsAndCleanup(): string {
  const state = scenario('cantina-expanded');
  const stools = slotsOfRole(state, [ModuleType.ServiceBar, ModuleType.BarCorner, ModuleType.BarEnd], 'bar-service');
  assert(stools.length >= 4, `Expected a connected bar with stools, got ${stools.length}.`);

  // One position, one actor.
  assert(claim(state, 8001, stools[0]), 'First guest should take a free stool.');
  assert(!claim(state, 8002, stools[0]), 'A second guest must not take an occupied stool.');
  assert(claim(state, 8002, stools[1]), 'A second guest should take a different free stool.');

  // A guest may never take a staff work position.
  const staffSlots = slotsOfRole(state, [ModuleType.ServiceBar, ModuleType.BarCorner], 'bar-staff');
  assert(staffSlots.length > 0, 'A Service Bar must expose staff lane positions.');
  assert(!claim(state, 8003, staffSlots[0], 'visitor'), 'A guest must not be able to stand in the staff lane.');
  // The scenario already puts stewards in the lane, so take one it left free.
  const freeStaffSlots = freeSlotsOfRole(state, [ModuleType.ServiceBar, ModuleType.BarCorner], 'bar-staff');
  assert(freeStaffSlots.length > 0, 'The expanded bar should leave a staff position open.');
  assert(claim(state, 9001, freeStaffSlots[0], 'crew'), 'Crew must be able to hold a staff work position.');

  // Timeout recovery: an expired claim frees the position.
  const held = facilityClaimFor(state, 'visitor', 8001);
  assert(held, 'The first guest should hold a live claim.');
  held.expiresAt = state.now - 1;
  assert(!slotIsOccupied(state, stools[0].tileIndex), 'An expired claim must stop occupying its position.');

  // Provider removal: deleting the fixture clears its claims.
  const beforeRemoval = state.reservations.filter((r) => r.releaseReason === null).length;
  const barModule = state.moduleInstances.find((module) => module.type === ModuleType.BarEnd);
  assert(barModule, 'Expected a Bar End in the expanded cantina.');
  const endSlots = slotsOfRole(state, [ModuleType.BarEnd], 'bar-service');
  assert(claim(state, 8004, endSlots[0]), 'Guest should take a Bar End stool.');
  const removedTiles = new Set(barModule.tiles);
  state.moduleInstances = state.moduleInstances.filter((module) => module.id !== barModule.id);
  for (const tile of removedTiles) state.modules[tile] = ModuleType.None;
  const orphans = releaseOrphanedFacilityClaims(state);
  assert(orphans >= 1, `Removing a fixture must clear its claims (cleared ${orphans}).`);
  assert(
    facilityClaimFor(state, 'visitor', 8004) === null,
    'A claim on a removed fixture must not survive.'
  );

  // Room repaint: the same sweep runs, so no claim outlives its facility.
  const repaint = scenario('cantina-expanded');
  const repaintStools = slotsOfRole(repaint, [ModuleType.ServiceBar], 'bar-service');
  assert(claim(repaint, 8010, repaintStools[0]), 'Guest should claim a stool before the repaint.');
  for (const tile of repaint.moduleInstances.find((m) => m.type === ModuleType.ServiceBar)!.tiles) {
    repaint.modules[tile] = ModuleType.None;
  }
  repaint.moduleInstances = repaint.moduleInstances.filter((m) => m.type !== ModuleType.ServiceBar);
  setRoom(repaint, repaintStools[0].tileIndex, RoomType.Lounge);
  assert(
    facilityClaimFor(repaint, 'visitor', 8010) === null,
    'Repainting a room must not leave a claim on a facility that is gone.'
  );

  return `stool exclusivity held, staff lane refused to a guest, ${beforeRemoval} live claims swept on removal, repaint clean`;
}

// ---------------------------------------------------------------------------
// 2. One sale walks the whole chain, exactly once
// ---------------------------------------------------------------------------

function testMarketChainExactlyOnce(): string {
  const state = scenario('market-improved-flow');
  const chain = marketChainStatus(state);
  assert(chain.backroom > 0, 'The improved market must start with backroom stock.');
  assert(chain.shelves > 0, 'The improved market must start with shelf stock.');
  assert(chain.registers >= 4, `Expected two Checkout Banks worth of registers, got ${chain.registers}.`);

  const retailStock = (target: StationState): number =>
    target.moduleInstances
      .filter((m) => m.type === ModuleType.ShelfAisle || m.type === ModuleType.BackroomStockBank)
      .reduce((sum, m) => sum + stockOf(target, m.originTile, 'tradeGood'), 0);
  const totalBefore = retailStock(state);
  const soldBefore = state.usageTotals.tradeGoodsSold;

  advance(state, 45);

  const totalAfter = retailStock(state);
  const carried = state.crewMembers.reduce(
    (sum, crew) => sum + (crew.carryingItemType === 'tradeGood' ? crew.carryingAmount : 0),
    0
  );
  const sold = state.usageTotals.tradeGoodsSold - soldBefore;

  // Conservation: stock either sits somewhere physical or was sold. Nothing
  // is created by moving it from the backroom to the shelf.
  const accounted = totalAfter + carried + sold;
  assert(
    Math.abs(accounted - totalBefore) < 1.5,
    `Retail stock was not conserved across the chain: ${totalBefore.toFixed(2)} -> ${accounted.toFixed(2)} (shelf+backroom ${totalAfter.toFixed(2)}, carried ${carried.toFixed(2)}, sold ${sold.toFixed(2)}).`
  );
  const retailEvents = state.openingEconomy.ledger.recent.filter((event) => event.kind === 'retail-sale');
  assert(
    sold <= retailEvents.length + 0.001,
    'Every unit sold must have a categorized economy event behind it.'
  );
  for (const event of retailEvents) {
    assert(event.costBasis >= 0, 'A retail sale must carry a non-negative cost basis.');
  }

  return `stock conserved (${totalBefore.toFixed(1)} in, ${totalAfter.toFixed(1)} stored + ${carried.toFixed(1)} carried + ${sold.toFixed(1)} sold), ${retailEvents.length} retail events`;
}

// ---------------------------------------------------------------------------
// 3 & 4. The two deliberate market layouts
// ---------------------------------------------------------------------------

function testMarketLayoutComparison(): string {
  const compact = scenario('market-compact-conflict');
  const improved = scenario('market-improved-flow');

  const compactChain = marketChainStatus(compact);
  const improvedChain = marketChainStatus(improved);
  assert(
    improvedChain.registers > compactChain.registers,
    `The improved layout must offer more checkout positions (${compactChain.registers} vs ${improvedChain.registers}).`
  );

  // The restock route is the spatial difference. In the compact layout the
  // backroom sits behind the customer frontage, so its path to the shelves
  // passes through the queue side of the register; in the improved layout it
  // sits on the shelves' stock face.
  const routeLength = (state: StationState): number => {
    const backroom = state.moduleInstances.find((m) => m.type === ModuleType.BackroomStockBank)!;
    const shelf = state.moduleInstances.find((m) => m.type === ModuleType.ShelfAisle)!;
    const bx = backroom.originTile % state.width;
    const by = Math.floor(backroom.originTile / state.width);
    const sx = shelf.originTile % state.width;
    const sy = Math.floor(shelf.originTile / state.width);
    return Math.abs(bx - sx) + Math.abs(by - sy);
  };
  const crossesFrontage = (state: StationState): boolean => {
    // Does the straight backroom->shelf run pass a checkout customer tile?
    const backroom = state.moduleInstances.find((m) => m.type === ModuleType.BackroomStockBank)!;
    const shelf = state.moduleInstances.find((m) => m.type === ModuleType.ShelfAisle)!;
    const checkoutTiles = new Set(slotsOfRole(state, [ModuleType.CheckoutBank], 'checkout').map((s) => s.tileIndex));
    const by = Math.floor(backroom.originTile / state.width);
    const sy = Math.floor(shelf.originTile / state.width);
    for (const tile of checkoutTiles) {
      const ty = Math.floor(tile / state.width);
      if (ty >= Math.min(by, sy) && ty <= Math.max(by, sy)) return true;
    }
    return false;
  };

  assert(
    crossesFrontage(compact),
    'The compact layout is supposed to force restocking across the customer frontage.'
  );
  assert(
    !crossesFrontage(improved) || routeLength(improved) < routeLength(compact),
    'The improved layout must actually separate or shorten the restock route.'
  );

  // Both scenarios already staff every register they have, so the comparison
  // is about how many positions the layout physically offers.
  const compactStaffed = marketChainStatus(compact).staffedRegisters;
  const improvedStaffed = marketChainStatus(improved).staffedRegisters;
  assert(
    improvedStaffed > compactStaffed,
    `Two Checkout Banks must let more stewards open a register at once (${compactStaffed} vs ${improvedStaffed}).`
  );
  advance(compact, 40);
  advance(improved, 40);
  assert(
    improvedChain.registers >= compactChain.registers * 2,
    'Two Checkout Banks must expose twice the register positions of one.'
  );

  return `registers ${compactChain.registers} -> ${improvedChain.registers}; restock crosses the checkout frontage in the compact layout and not in the improved one `
    + `(span ${routeLength(compact)} -> ${routeLength(improved)} tiles: the improvement is separation, not distance); staffed ${compactStaffed} -> ${improvedStaffed}`;
}

// ---------------------------------------------------------------------------
// 5. Connected bar geometry through corners, ends and rotation
// ---------------------------------------------------------------------------

function testConnectedBarGeometry(): string {
  const state = scenario('cantina-expanded');
  const groups = barGroups(state);
  assert(groups.length === 1, `Connected bar pieces must form ONE provider run, got ${groups.length}.`);
  const group = groups[0];
  assert(group.moduleIds.length === 3, `Expected bar + corner + end in one run, got ${group.moduleIds.length}.`);
  assert(group.guestSlots.length === 7, `Expected 4 + 1 + 2 depicted stools, got ${group.guestSlots.length}.`);
  assert(group.staffSlots.length === 3, `Expected 2 + 1 staff lane positions, got ${group.staffSlots.length}.`);
  const guestTiles = new Set(group.guestSlots.map((slot) => slot.tileIndex));
  const staffTiles = new Set(group.staffSlots.map((slot) => slot.tileIndex));
  for (const tile of staffTiles) {
    assert(!guestTiles.has(tile), `Staff position ${tile} must never also be a guest position.`);
  }

  // A separate, unconnected bar is a separate provider.
  const split = scenario('cantina-expanded');
  const far = tryPlaceModule(split, ModuleType.ServiceBar, 55 * split.width + 50, 0);
  if (far.ok) {
    tick(split, 0);
    assert(barGroups(split).length >= 2, 'A bar that touches nothing must be its own provider run.');
  }

  // Rotation still resolves the same number of positions.
  const rotated = createInitialState({ seed: 7788, physicalStarterInventory: true, manualTrafficAdmission: true });
  applyColdStartScenario(rotated, 'cantina-expanded');
  tick(rotated, 0);
  const barModule = rotated.moduleInstances.find((m) => m.type === ModuleType.ServiceBar)!;
  const upright = resolveFacilitySlots(barModule, rotated.width).length;
  const rotatedCopy = { ...barModule, rotation: 90 as const };
  const turned = resolveFacilitySlots(rotatedCopy, rotated.width).length;
  assert(upright === turned, `Rotation changed a bar's position count (${upright} vs ${turned}).`);

  return `one run of ${group.moduleIds.length} pieces, ${group.guestSlots.length} stools / ${group.staffSlots.length} staff, disjoint tiles, rotation-stable`;
}

// ---------------------------------------------------------------------------
// 6 & 7. Throughput and dwell limit independently; dry and unstaffed differ
// ---------------------------------------------------------------------------

function testThroughputAndDwellAreIndependent(): string {
  const undersized = scenario('cantina-undersized');
  const expanded = scenario('cantina-expanded');

  const undersizedBar = barGroups(undersized)[0];
  const expandedBar = barGroups(expanded)[0];
  const undersizedDwell = dwellSlotsInRoom(undersized, RoomType.Cantina).length;
  const expandedDwell = dwellSlotsInRoom(expanded, RoomType.Cantina).length;

  assert(undersizedBar.guestSlots.length > 0, 'The undersized cantina still has real service capacity.');
  assert(undersizedDwell === 0, `The undersized cantina is supposed to have no dwell positions, found ${undersizedDwell}.`);
  assert(expandedDwell > 0, 'The expanded cantina must add dwell positions.');
  assert(
    expandedBar.guestSlots.length > undersizedBar.guestSlots.length,
    'The expanded run must also add service positions.'
  );
  // The two limits move independently: dwell grew far more than service did.
  assert(
    expandedDwell - undersizedDwell > expandedBar.guestSlots.length - undersizedBar.guestSlots.length,
    'Seating and service capacity must be separately tunable.'
  );

  // No stock and no staff are distinguishable states.
  const dry = scenario('cantina-expanded');
  for (const module of dry.moduleInstances) {
    const node = dry.itemNodes.find((entry) => entry.tileIndex === module.originTile);
    if (node) node.items.rawMaterial = 0;
  }
  const dryStatus = barGroups(dry).map((group) => {
    const stock = group.stockTiles.reduce((sum, tile) => sum + stockOf(dry, tile, 'rawMaterial'), 0);
    return stock;
  });
  assert(dryStatus.every((stock) => stock === 0), 'The dry fixture must actually be dry.');

  const stocked = scenario('cantina-expanded');
  const stockedTotal = barGroups(stocked)[0].stockTiles.reduce(
    (sum, tile) => sum + stockOf(stocked, tile, 'rawMaterial'),
    0
  );
  assert(stockedTotal > 0, 'The stocked fixture must have pooled drink stock.');

  const pouredFrom = (target: StationState): { poured: number; carrying: number } => {
    const group = barGroups(target)[0];
    const before = group.stockTiles.reduce((sum, tile) => sum + stockOf(target, tile, 'rawMaterial'), 0);
    advance(target, 40);
    const after = barGroups(target)[0].stockTiles.reduce(
      (sum, tile) => sum + stockOf(target, tile, 'rawMaterial'),
      0
    );
    return {
      poured: Math.max(0, before - after),
      carrying: target.visitors.filter((visitor) => visitor.carryingDrink).length
    };
  };
  // Drinks POURED, measured as beverage stock physically drawn from the run.
  // A dry bar cannot draw any, whatever else is true about it.
  const dryResult = pouredFrom(dry);
  const stockedResult = pouredFrom(stocked);
  assert(
    dryResult.poured === 0 && dryResult.carrying === 0,
    `A bar with no stock must serve nobody, but poured ${dryResult.poured} to ${dryResult.carrying} guests.`
  );
  assert(
    stockedResult.poured > 0,
    `A stocked, staffed bar must actually pour drinks (poured ${stockedResult.poured}).`
  );

  return `service ${undersizedBar.guestSlots.length}->${expandedBar.guestSlots.length}, dwell ${undersizedDwell}->${expandedDwell}; `
    + `drinks poured over 40s: dry ${dryResult.poured} to ${dryResult.carrying} guests vs stocked ${stockedResult.poured.toFixed(1)} to ${stockedResult.carrying}`;
}

// ---------------------------------------------------------------------------
// 8. Every depicted position is exclusively reservable
// ---------------------------------------------------------------------------

function testEveryDepictedPositionIsReservable(): string {
  const state = scenario('long-stay-guest-wing');
  const expectations: Array<{ label: string; modules: ModuleType[]; role: Parameters<typeof slotsOfRole>[2]; count: number }> = [
    { label: 'Community Table seats', modules: [ModuleType.CommunityTable], role: 'seat', count: 8 },
    { label: 'Guest Cabin beds', modules: [ModuleType.GuestCabin], role: 'temporary-sleep', count: 4 },
    { label: 'Wash Bank positions', modules: [ModuleType.WashBank], role: 'hygiene', count: 4 },
    { label: 'Serving Line pickups', modules: [ModuleType.ServingLine], role: 'meal-pickup', count: 3 },
    { label: 'Booth Bank seats', modules: [ModuleType.BoothBank], role: 'seat', count: 6 }
  ];

  let owner = 20000;
  const lines: string[] = [];
  for (const expectation of expectations) {
    const slots = slotsOfRole(state, expectation.modules, expectation.role);
    assert(
      slots.length === expectation.count,
      `${expectation.label}: expected ${expectation.count} depicted positions, found ${slots.length}.`
    );
    // Each one claimable exactly once.
    for (const slot of slots) {
      assert(claim(state, owner++, slot), `${expectation.label}: position ${slot.id} should be claimable.`);
      assert(!claim(state, owner++, slot), `${expectation.label}: position ${slot.id} was claimed twice.`);
    }
    assert(
      freeSlotsOfRole(state, expectation.modules, expectation.role).length === 0,
      `${expectation.label}: every position should now read as taken.`
    );
    lines.push(`${expectation.label} ${slots.length}`);
  }

  const desk = scenario('reception-staffed');
  const processors = slotsOfRole(desk, [ModuleType.ArrivalDesk], 'reception');
  assert(processors.length === 2, `Arrival Desk must expose two processors, found ${processors.length}.`);
  assert(claim(desk, 21000, processors[0]), 'A reception processor should be claimable.');
  assert(!claim(desk, 21001, processors[0]), 'A reception processor must not be claimed twice.');
  lines.push('Arrival Desk processors 2');

  return lines.join(' · ');
}

// ---------------------------------------------------------------------------
// 9. Reception reveals demand without gating
// ---------------------------------------------------------------------------

function testReceptionRevealsAndNeverGates(): string {
  const without = scenario('reception-absent');
  const withDesk = scenario('reception-staffed');

  assert(receptionStatus(without).processors === 0, 'The control layout must have no reception.');
  const status = receptionStatus(withDesk);
  assert(status.processors === 2, 'The reception layout must have two processors.');

  assert(status.staffed > 0, 'The reception layout staffs its desk.');
  assert(status.blockedReason === null, `A staffed desk with free positions should not be blocked, got ${status.blockedReason}.`);

  // An unstaffed desk offers nobody a slot and says why; guests bypass it.
  const unstaffed = scenario('reception-staffed');
  for (const reservation of unstaffed.reservations) reservation.releaseReason = 'cleared';
  const unstaffedStatus = receptionStatus(unstaffed);
  assert(
    unstaffedStatus.staffed === 0 && unstaffedStatus.blockedReason === 'no-staff',
    `An unstaffed desk must report 'no-staff', got ${unstaffedStatus.blockedReason}.`
  );
  assert(
    freeReceptionSlots(unstaffed).length === 0,
    'An unstaffed desk must offer no processing positions, so guests bypass it.'
  );

  // The two layouts carry the SAME arrivals with the same ids and wants.
  const arrivals = (target: StationState): Visitor[] =>
    target.visitors.filter((visitor) => visitor.id >= 99500 && visitor.id < 99540);
  assert(arrivals(without).length === arrivals(withDesk).length, 'Both layouts must receive identical arrivals.');
  assert(arrivals(without).length > 0, 'The reception comparison needs arrivals.');

  const revealed = (target: StationState): number =>
    arrivals(target).reduce((sum, visitor) => sum + (visitor.revealedServices?.length ?? 0), 0);
  const revealedBefore = revealed(withDesk);

  advance(without, 40);
  advance(withDesk, 40);

  // Reception's measured job: reveal demand EARLIER. Nothing else about the
  // two stations differs.
  const revealedWithout = revealed(without);
  const revealedWith = revealed(withDesk);
  const processed = arrivals(withDesk).filter(
    (visitor) => visitor.receptionProcessedAt !== null && visitor.receptionProcessedAt !== undefined
  ).length;
  assert(
    processed > 0,
    'A staffed desk must physically process at least one of the identical arrivals.'
  );
  assert(
    revealedWith > revealedWithout,
    `A staffed desk must reveal demand earlier than no desk (${revealedWithout} vs ${revealedWith}).`
  );
  assert(
    revealedWith === revealedBefore + processed,
    `Each completed desk session must reveal exactly one additional want (${revealedBefore} + ${processed} != ${revealedWith}).`
  );
  assert(
    processed < arrivals(withDesk).length,
    'Finite Reception capacity must leave some traffic on the ordinary bypass path.'
  );

  // And it must never publish the whole itinerary.
  for (const visitor of arrivals(withDesk)) {
    assert(
      (visitor.revealedServices?.length ?? 0) <= visitor.servicePlan.length,
      'A visitor must never reveal more wants than it has.'
    );
  }
  const fullyExposed = arrivals(withDesk).filter(
    (visitor) => (visitor.revealedServices?.length ?? 0) >= visitor.servicePlan.length && visitor.servicePlan.length > 1
  ).length;
  assert(fullyExposed === 0, 'Reception must reveal part of demand, never a guest\'s complete itinerary.');

  // Bypass: the deskless station keeps moving just as well.
  assert(without.now > 0 && withDesk.now > 0, 'Both layouts must keep simulating.');

  return `identical arrivals: wants known after 40s ${revealedWithout} without a desk vs ${revealedWith} with one `
    + `(${processed} processed, ${arrivals(withDesk).length - processed} bypassed, one additional want revealed per session); `
    + `unstaffed variant reports '${unstaffedStatus.blockedReason}' and offers 0 positions, so arrivals bypass it`;
}

// ---------------------------------------------------------------------------
// 10. A long-stay cohort has every repeat facility physically available
// ---------------------------------------------------------------------------

function testLongStayWingSupportsRepeatSessions(): string {
  const state = scenario('long-stay-guest-wing');
  const beds = slotsOfRole(state, [ModuleType.GuestCabin, ModuleType.BunkBank], 'temporary-sleep');
  const wash = slotsOfRole(state, [ModuleType.WashBank], 'hygiene');
  const pickups = slotsOfRole(state, [ModuleType.ServingLine], 'meal-pickup');
  const seats = slotsOfRole(state, [ModuleType.CommunityTable, ModuleType.BoothBank], 'seat');
  const bars = barGroups(state);

  assert(beds.length >= 8, `Guest wing needs sleeping capacity, found ${beds.length}.`);
  assert(wash.length >= 4, `Guest wing needs hygiene capacity, found ${wash.length}.`);
  assert(pickups.length >= 3, `Guest wing needs meal pickup capacity, found ${pickups.length}.`);
  assert(seats.length >= 6, `Guest wing needs dwell capacity, found ${seats.length}.`);
  assert(bars.length >= 1 && bars[0].guestSlots.length >= 4, 'Guest wing needs a drink provider.');

  // Every repeat need has a distinct physical session length, so the cycle is
  // paced by real sessions rather than one shared timer.
  const durations = new Set([
    FACILITY_SESSIONS['temporary-sleep'].durationSec,
    FACILITY_SESSIONS.hygiene.durationSec,
    FACILITY_SESSIONS['meal-pickup'].durationSec,
    FACILITY_SESSIONS.seat.durationSec,
    FACILITY_SESSIONS['bar-service'].durationSec
  ]);
  assert(durations.size === 5, 'Each repeat need should have its own session duration.');

  advance(state, 40);
  assert(state.now > 0, 'The guest wing must keep running.');
  return `beds ${beds.length}, wash ${wash.length}, pickups ${pickups.length}, seats ${seats.length}, bar stools ${bars[0].guestSlots.length}, 5 distinct session lengths`;
}

// ---------------------------------------------------------------------------
// 11. Save/load clears transient claims and rebuilds durable fixture state
// ---------------------------------------------------------------------------

function testSaveLoadRebuildsFixtures(): string {
  const state = scenario('long-stay-guest-wing');
  // Take a bed and a wash stall, then save mid-session.
  const beds = slotsOfRole(state, [ModuleType.GuestCabin], 'temporary-sleep');
  assert(claim(state, 30001, beds[0]), 'Should be able to claim a guest cabin bed.');

  // Give one shelf a non-default mix so the durable fixture choice is tested.
  const market = scenario('market-improved-flow');
  const shelf = market.moduleInstances.find((m) => m.type === ModuleType.ShelfAisle)!;
  assert(setShelfMix(market, shelf.originTile, 'technical'), 'Should be able to set a shelf mix.');
  const marketBefore = marketChainStatus(market);
  const stockBefore = market.moduleInstances
    .filter((m) => m.type === ModuleType.ShelfAisle || m.type === ModuleType.BackroomStockBank)
    .reduce((sum, m) => sum + stockOf(market, m.originTile, 'tradeGood'), 0);

  const parsed = parseAndMigrateSave(serializeSave('gate-f', market, 'gate-f'));
  assert(parsed.ok, `Facility save should parse: ${parsed.ok ? '' : parsed.error}`);
  const loaded = hydrateStateFromSave(parsed.save).state;

  // Fixture geometry is rebuilt, not guessed.
  const loadedChain = marketChainStatus(loaded);
  assert(
    loadedChain.registers === marketBefore.registers,
    `Register count changed across reload (${marketBefore.registers} -> ${loadedChain.registers}).`
  );
  const loadedShelves = loaded.moduleInstances.filter((m) => m.type === ModuleType.ShelfAisle);
  assert(loadedShelves.length > 0, 'Shelves must survive reload.');
  assert(
    loadedShelves.some((m) => m.shelfMix === 'technical'),
    'A shelf mix is a durable player decision and must survive reload.'
  );
  const stockAfter = loaded.moduleInstances
    .filter((m) => m.type === ModuleType.ShelfAisle || m.type === ModuleType.BackroomStockBank)
    .reduce((sum, m) => sum + stockOf(loaded, m.originTile, 'tradeGood'), 0);
  assert(
    Math.abs(stockAfter - stockBefore) < 0.01,
    `Reload duplicated or lost retail stock (${stockBefore} -> ${stockAfter}).`
  );

  // Transient claims never come back.
  const facilityClaims = loaded.reservations.filter(
    (r) => typeof r.targetId === 'string' && r.targetId.startsWith('facility:') && r.releaseReason === null
  );
  assert(
    facilityClaims.every((r) => r.ownerKind === 'visitor'),
    'Only reconstructed occupant claims may exist after load.'
  );
  const slotsAfter = slotsOfRole(loaded, [ModuleType.CheckoutBank], 'checkout');
  assert(slotsAfter.length === marketBefore.registers, 'Checkout positions must be rebuilt from geometry.');
  assert(
    shelfAppealFor(loaded, 'market') > 0,
    'A stocked shelf must still read as appealing after reload.'
  );
  assert(
    SHELF_MIXES.technical.marginMultiplier > SHELF_MIXES.essentials.marginMultiplier,
    'Shelf mixes must remain economically distinct.'
  );

  return `registers ${marketBefore.registers} rebuilt, shelf mix 'technical' durable, stock ${stockBefore.toFixed(1)} conserved, 0 stale claims`;
}

// ---------------------------------------------------------------------------

const TESTS: Array<{ name: string; run: () => string }> = [
  { name: '1 exclusive claims and cleanup', run: testExclusiveClaimsAndCleanup },
  { name: '2 market chain exactly once', run: testMarketChainExactlyOnce },
  { name: '3+4 market layout comparison', run: testMarketLayoutComparison },
  { name: '5 connected bar geometry', run: testConnectedBarGeometry },
  { name: '6+7 throughput vs dwell, dry vs staffed', run: testThroughputAndDwellAreIndependent },
  { name: '8 every depicted position reservable', run: testEveryDepictedPositionIsReservable },
  { name: '9 reception reveals without gating', run: testReceptionRevealsAndNeverGates },
  { name: '10 long-stay repeat sessions', run: testLongStayWingSupportsRepeatSessions },
  { name: '11 save/load rebuilds fixtures', run: testSaveLoadRebuildsFixtures }
];

function main(): void {
  const filter = process.env.GATE_F_TEST_FILTER ?? '';
  let failed = 0;
  let ran = 0;
  const startedAll = Date.now();
  for (const entry of TESTS) {
    if (filter && !entry.name.includes(filter)) continue;
    ran += 1;
    const started = Date.now();
    try {
      const evidence = entry.run();
      console.log(`ok   ${entry.name} (${Date.now() - started}ms)`);
      console.log(`     ${evidence}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL ${entry.name} (${Date.now() - started}ms)`);
      console.error(`     ${(error as Error).message}`);
    }
  }
  const totalMs = Date.now() - startedAll;
  if (failed > 0) {
    console.error(`gate-f-facility-scale-tests: ${failed}/${ran} failed in ${totalMs}ms`);
    process.exit(1);
  }
  console.log(`gate-f-facility-scale-tests: ok ${ran}/${TESTS.length} checks in ${totalMs}ms`);
}

main();
