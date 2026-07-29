// Focused runner for the Gate F facility-scale tranche.
//
// Every check works from the deterministic showcase scenarios, so a failure
// names a layout a player can actually load with ?scenario=<name> and look at.
//
// Run with `npm run test:gate-f-facility`. Filter with GATE_F_TEST_FILTER=<substring>.

import { applyColdStartScenario, stageFacilityVisitors } from '../src/sim/cold-start-scenarios';
import {
  createInitialState,
  getCrewSustainabilitySummary,
  hireCrew,
  moduleCreditBuildCost,
  quoteMaterialImportCost,
  runJobAssignmentTestTick,
  setRoom,
  setShelfMix,
  setTile,
  tick,
  tileBuildCost,
  tryCreateReservation,
  tryPlaceModule
} from '../src/sim/sim';
import { planStructuralPieceConstruction } from '../src/sim/construction';
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
  barGroupStatus,
  barGroups,
  dwellSlotsInRoom,
  facilityUtilityDemand,
  fixtureCleaningLoadPerMin,
  freeReceptionSlots,
  marketChainStatus,
  receptionStatus,
  shelfAppealFor,
  SHELF_MIXES
} from '../src/sim/facility-machines';
import {
  FACILITY_FIXTURE_DESCRIPTORS,
  publicApproachTilesForModule,
  publicFaceOfModule,
  publicRouteIsBlocked,
  resolveFacilitySlots
} from '../src/sim/facility-descriptors';
import {
  BERTH_CAPITAL_COST,
  FACILITY_OPERATING_LOAD,
  MAINTENANCE_PRICING,
  facilityOperatingLoad,
  repairServiceCost
} from '../src/sim/balance';
import {
  ModuleType,
  ResidentState,
  RoomType,
  TileType,
  VisitorState,
  type ModuleInstance,
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

function claim(
  state: StationState,
  ownerId: number,
  slot: FacilitySlotTarget,
  ownerKind: 'visitor' | 'crew' | 'resident' = 'visitor'
): boolean {
  const request = buildSlotReservationRequest({ ownerKind, ownerId, slot });
  if (!request) return false;
  return tryCreateReservation(state, request).ok;
}

function stockOf(state: StationState, tileIndex: number, item: 'tradeGood' | 'rawMaterial' | 'meal'): number {
  const node = state.itemNodes.find((entry) => entry.tileIndex === tileIndex);
  return Math.max(0, node?.items[item] ?? 0);
}

function putVisitorAt(state: StationState, visitor: Visitor, tileIndex: number): void {
  visitor.tileIndex = tileIndex;
  visitor.x = (tileIndex % state.width) + 0.5;
  visitor.y = Math.floor(tileIndex / state.width) + 0.5;
  visitor.path = [];
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
      .filter(
        (m) =>
          m.type === ModuleType.ShelfAisle ||
          m.type === ModuleType.BackroomStockBank ||
          m.type === ModuleType.IntakePallet
      )
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

  return `stock conserved across receiving/backroom/shelf (${totalBefore.toFixed(1)} in, ${totalAfter.toFixed(1)} stored + ${carried.toFixed(1)} carried + ${sold.toFixed(1)} sold), ${retailEvents.length} retail events`;
}

// ---------------------------------------------------------------------------
// 2b. One unreachable worker/source pair cannot starve the logistics lane
// ---------------------------------------------------------------------------

function testCargoDispatchPairFairness(): string {
  const prepare = (): {
    state: StationState;
    source: number;
    destination: number;
    cargo: StationState['crewMembers'];
    assistant: StationState['crewMembers'][number];
  } => {
    const state = scenario('market-improved-flow', 8181);
    state.jobs.length = 0;
    const cargo = state.crewMembers
      .filter((crew) => crew.staffRole === 'cargo-handler')
      .sort((a, b) => a.id - b.id);
    const assistant = state.crewMembers.find((crew) => crew.staffRole === 'assistant');
    assert(cargo.length >= 2 && assistant, 'Dispatcher fixture needs two cargo handlers and one assistant.');
    const source = state.moduleInstances.find((module) => module.type === ModuleType.IntakePallet)!.originTile;
    const destination = state.moduleInstances.find((module) => module.type === ModuleType.ShelfAisle)!.originTile;
    for (const crew of state.crewMembers) {
      crew.activeJobId = null;
      crew.path = [];
      crew.targetTile = null;
      crew.resting = crew !== cargo[0] && crew !== cargo[1] && crew !== assistant;
    }
    for (const crew of [...cargo, assistant]) {
      crew.role = 'idle';
      crew.workLane = 'logistics';
      crew.lastWorkLane = 'logistics';
      crew.shiftBucket = 0;
      crew.energy = 100;
      crew.hunger = 100;
      crew.hygiene = 100;
      crew.bladder = 100;
      crew.thirst = 100;
      crew.carryingMeal = false;
      crew.carryingItemType = null;
      crew.carryingAmount = 0;
    }
    for (let index = 0; index < 6; index += 1) {
      state.jobs.push({
        id: state.jobSpawnCounter++,
        type: 'deliver',
        itemType: 'tradeGood',
        amount: 1,
        fromTile: source,
        toTile: destination,
        assignedCrewId: null,
        createdAt: state.now,
        expiresAt: state.now + 90,
        state: 'pending',
        pickedUpAmount: 0,
        completedAt: null,
        lastProgressAt: state.now,
        stallReason: 'none'
      });
    }
    state.metrics.pathCallsPerTick = 0;
    return { state, source, destination, cargo, assistant };
  };

  const roleOrdered = prepare();
  // The assistant has a lower id and is made unreachable. Dedicated cargo
  // labor must be considered first, not lose the whole lane to generic
  // fallback's duplicate source probes.
  const sealedTile = 75 * roleOrdered.state.width + 95;
  roleOrdered.state.tiles[sealedTile] = TileType.Floor;
  roleOrdered.state.pressurized[sealedTile] = true;
  roleOrdered.assistant.tileIndex = sealedTile;
  roleOrdered.assistant.x = 95.5;
  roleOrdered.assistant.y = 75.5;
  roleOrdered.cargo[0].tileIndex = roleOrdered.source + roleOrdered.state.width;
  roleOrdered.cargo[0].x = (roleOrdered.cargo[0].tileIndex % roleOrdered.state.width) + 0.5;
  roleOrdered.cargo[0].y = Math.floor(roleOrdered.cargo[0].tileIndex / roleOrdered.state.width) + 0.5;
  runJobAssignmentTestTick(roleOrdered.state);
  assert(
    roleOrdered.cargo.some((crew) => crew.activeJobId !== null) && roleOrdered.assistant.activeJobId === null,
    'A reachable cargo specialist must outrank an unreachable generic assistant for delivery work.'
  );

  const pairFair = prepare();
  pairFair.cargo[0].tileIndex = sealedTile;
  pairFair.cargo[0].x = 95.5;
  pairFair.cargo[0].y = 75.5;
  pairFair.cargo[1].tileIndex = pairFair.source + pairFair.state.width;
  pairFair.cargo[1].x = (pairFair.cargo[1].tileIndex % pairFair.state.width) + 0.5;
  pairFair.cargo[1].y = Math.floor(pairFair.cargo[1].tileIndex / pairFair.state.width) + 0.5;
  pairFair.assistant.resting = true;
  runJobAssignmentTestTick(pairFair.state);
  const pathCalls = pairFair.state.metrics.pathCallsPerTick;
  assert(
    pairFair.cargo[0].activeJobId === null && pairFair.cargo[1].activeJobId !== null,
    'One unreachable cargo/source pair must leave enough bounded lane budget for the next handler.'
  );
  assert(pathCalls <= 6, `Logistics lane exceeded its six-call path budget (${pathCalls}).`);

  const carrying = prepare();
  carrying.cargo[0].carryingItemType = 'tradeGood';
  carrying.cargo[0].carryingAmount = 2;
  carrying.cargo[1].resting = true;
  carrying.assistant.resting = true;
  runJobAssignmentTestTick(carrying.state);
  assert(
    carrying.cargo[0].activeJobId === null && carrying.cargo[0].carryingAmount === 2,
    'An unowned carried stack must not be overwritten by a fresh assignment.'
  );

  return `cargo role won generic fallback; duplicate source probing stayed bounded and the second handler dispatched in ${pathCalls} path calls; unowned carried stock was not overwritten`;
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
  assert(
    improvedChain.registers >= compactChain.registers * 2,
    'Two Checkout Banks must expose twice the register positions of one.'
  );

  type MarketRun = {
    sold: number;
    soldAfterSecondWave: number;
    shelfLow: number;
    shelfRefill: number;
    backroomPeak: number;
    backroomDrawdown: number;
    receivingDrawdown: number;
    queuePeak: number;
    stockouts: number;
    served: number;
    unserved: number;
    accountingDelta: number;
    carried: number;
    pickedUp: number;
  };
  const runMarket = (state: StationState): MarketRun => {
    // The browser scenarios expose the entire 12-person crowd immediately so
    // the bottleneck is readable on load. For the throughput comparison,
    // preserve the harsher two-wave contract that proves the improved layout
    // can recover and restock before demand returns.
    state.visitors.splice(6);
    const physicalStock = (): number =>
      state.itemNodes.reduce((total, node) => total + Math.max(0, node.items.tradeGood ?? 0), 0);
    const startingPhysicalStock = physicalStock();
    const startingReceiving = marketChainStatus(state).receiving;
    let shelfLow = marketChainStatus(state).shelves;
    let shelfHighAfterLow = shelfLow;
    let backroomPeak = marketChainStatus(state).backroom;
    let queuePeak = 0;
    let salesAtSecondWave = 0;
    const checkoutTiles = new Set(
      slotsOfRole(state, [ModuleType.CheckoutBank], 'checkout').map((slot) => slot.tileIndex)
    );
    state.controls.paused = false;
    for (let step = 0; step < 500; step += 1) {
      if (step === 175) {
        salesAtSecondWave = state.usageTotals.tradeGoodsSold;
        stageFacilityVisitors(state, 6, 51, 55, 'market', [], 99700);
      }
      tick(state, 0.2);
      const chain = marketChainStatus(state);
      if (chain.shelves < shelfLow - 0.01) {
        shelfLow = chain.shelves;
        shelfHighAfterLow = chain.shelves;
      } else {
        shelfHighAfterLow = Math.max(shelfHighAfterLow, chain.shelves);
      }
      backroomPeak = Math.max(backroomPeak, chain.backroom);
      queuePeak = Math.max(
        queuePeak,
        state.visitors.filter(
          (visitor) =>
            visitor.state === VisitorState.Queueing &&
            visitor.queueProviderTile !== null &&
            visitor.queueProviderTile !== undefined &&
            checkoutTiles.has(visitor.queueProviderTile)
        ).length
      );
    }
    const final = marketChainStatus(state);
    const carried = state.crewMembers.reduce(
      (total, crew) => total + (crew.carryingItemType === 'tradeGood' ? crew.carryingAmount : 0),
      0
    );
    const served = state.serviceLog.visitorLifetimeByService.retail;
    return {
      sold: state.usageTotals.tradeGoodsSold,
      soldAfterSecondWave: state.usageTotals.tradeGoodsSold - salesAtSecondWave,
      shelfLow,
      shelfRefill: shelfHighAfterLow - shelfLow,
      backroomPeak,
      backroomDrawdown: backroomPeak - final.backroom,
      receivingDrawdown: startingReceiving - final.receiving,
      queuePeak,
      stockouts: state.usageTotals.marketStockouts,
      served,
      unserved: 12 - served,
      accountingDelta: physicalStock() + carried + state.usageTotals.tradeGoodsSold - startingPhysicalStock,
      carried,
      pickedUp: state.jobs
        .filter((job) => job.itemType === 'tradeGood' && job.state === 'in_progress')
        .reduce((total, job) => total + job.pickedUpAmount, 0)
    };
  };
  const compactRun = runMarket(compact);
  const improvedRun = runMarket(improved);
  const compactRepeat = runMarket(scenario('market-compact-conflict'));
  const improvedRepeat = runMarket(scenario('market-improved-flow'));

  const deterministicSignature = (run: MarketRun): string =>
    [
      run.sold,
      run.soldAfterSecondWave,
      run.shelfLow.toFixed(3),
      run.shelfRefill.toFixed(3),
      run.backroomPeak.toFixed(3),
      run.backroomDrawdown.toFixed(3),
      run.receivingDrawdown.toFixed(3),
      run.queuePeak,
      run.stockouts,
      run.served,
      run.unserved,
      run.accountingDelta.toFixed(3)
    ].join('|');
  assert(
    deterministicSignature(compactRun) === deterministicSignature(compactRepeat) &&
      deterministicSignature(improvedRun) === deterministicSignature(improvedRepeat),
    'Same-seed market throughput must be deterministic across repeated runs.'
  );

  assert(improvedRun.receivingDrawdown > 0, 'The improved market must move goods out of physical receiving.');
  assert(improvedRun.backroomPeak > 0, 'The receiving leg must visibly put stock in the backroom.');
  assert(improvedRun.backroomDrawdown > 0, 'The shelf leg must visibly draw stock back out of the backroom.');
  assert(improvedRun.shelfRefill >= 1, `Shelves must refill after depletion (refill ${improvedRun.shelfRefill.toFixed(1)}).`);
  assert(improvedRun.soldAfterSecondWave > 0, 'A second shopper wave must make additional sales after restocking.');
  assert(
    improvedRun.sold >= compactRun.sold + 4,
    `The separated layout must decisively outperform the compact conflict (${compactRun.sold} vs ${improvedRun.sold} sales).`
  );
  assert(
    compactRun.accountingDelta < 1.5 && improvedRun.accountingDelta < 1.5,
    `Neither market may create stock (net delta ${compactRun.accountingDelta.toFixed(2)}/${improvedRun.accountingDelta.toFixed(2)}; carried ${compactRun.carried}/${improvedRun.carried}; picked up ${compactRun.pickedUp}/${improvedRun.pickedUp}).`
  );

  return `registers ${compactChain.registers} -> ${improvedChain.registers}; restock crosses the checkout frontage in the compact layout and not in the improved one `
    + `(span ${routeLength(compact)} -> ${routeLength(improved)} tiles); staffed ${compactStaffed} -> ${improvedStaffed}; `
    + `two 6-shopper waves over 100s: sold ${compactRun.sold}/${improvedRun.sold}, served ${compactRun.served}/${improvedRun.served}, `
    + `peak checkout queue ${compactRun.queuePeak}/${improvedRun.queuePeak}, unserved by deadline ${compactRun.unserved}/${improvedRun.unserved}, stockouts ${compactRun.stockouts}/${improvedRun.stockouts}; `
    + `receiving drawdown ${compactRun.receivingDrawdown.toFixed(1)}/${improvedRun.receivingDrawdown.toFixed(1)}, backroom peak/drawdown `
    + `${compactRun.backroomPeak.toFixed(1)}/${compactRun.backroomDrawdown.toFixed(1)} vs ${improvedRun.backroomPeak.toFixed(1)}/${improvedRun.backroomDrawdown.toFixed(1)}, `
    + `shelf low/refill ${improvedRun.shelfLow.toFixed(1)}/+${improvedRun.shelfRefill.toFixed(1)}, second-wave sales ${improvedRun.soldAfterSecondWave}; `
    + `net stock delta ${compactRun.accountingDelta.toFixed(1)}/${improvedRun.accountingDelta.toFixed(1)}`;
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
  const carryingAtForty = new Set(
    stocked.visitors.filter((visitor) => visitor.carryingDrink).map((visitor) => visitor.id)
  );
  advance(stocked, 40);
  const connectedDrinkEvents = stocked.serviceLog.recent.filter((event) => event.service === 'drink');
  assert(connectedDrinkEvents.length > 0, 'A connected bar must finish at least one canonical drink service.');
  assert(
    connectedDrinkEvents.some((event) => carryingAtForty.has(event.actorId)),
    'At least one drink carried at 40 seconds must drain into a canonical completion event.'
  );
  assert(
    connectedDrinkEvents.every(
      (event) => event.moduleType === ModuleType.BoothBank || event.moduleType === ModuleType.StandingRail
    ),
    'Connected-bar drinks must name the depicted Booth Bank or Standing Rail seat where they finished.'
  );

  return `service ${undersizedBar.guestSlots.length}->${expandedBar.guestSlots.length}, dwell ${undersizedDwell}->${expandedDwell}; `
    + `drinks poured over 40s: dry ${dryResult.poured} to ${dryResult.carrying} guests vs stocked ${stockedResult.poured.toFixed(1)} to ${stockedResult.carrying}; `
    + `${connectedDrinkEvents.length} connected-seat completions by 80s`;
}

// ---------------------------------------------------------------------------
// 7. Canonical completion for Gate F drink seats and Community Tables
// ---------------------------------------------------------------------------

function testCanonicalFacilityServiceCompletion(): string {
  // Optional repeat drinks use the same canonical event as planned drinks,
  // but never advance a manifest plan or charge twice.
  const optional = scenario('demo-station');
  optional.controls.paused = false;
  const optionalVisitor = scenario('cantina-expanded').visitors[0];
  optional.visitors = [optionalVisitor];
  const legacySeat = optional.moduleInstances.find(
    (module) => module.type === ModuleType.Bench && optional.rooms[module.originTile] === RoomType.Cantina
  );
  assert(legacySeat, 'The demo station needs a legacy Cantina bench.');
  putVisitorAt(optional, optionalVisitor, legacySeat.originTile);
  optionalVisitor.state = VisitorState.Leisure;
  optionalVisitor.eatTimer = 0;
  optionalVisitor.activeService = 'drink';
  optionalVisitor.optionalDrinkActive = true;
  optionalVisitor.repeatDrinksServed = 0;
  optionalVisitor.carryingDrink = true;
  optionalVisitor.servicePlan = [];
  optionalVisitor.completedServices = [];
  optionalVisitor.reservedTargetTile = legacySeat.originTile;

  const optionalEventsBefore = optional.serviceLog.lifetimeByService.drink;
  const optionalSalesBefore = optional.openingEconomy.ledger.recent.filter((event) => event.kind === 'retail-sale').length;
  tick(optional, 0.2);
  assert(
    optional.serviceLog.lifetimeByService.drink === optionalEventsBefore + 1,
    'An optional drink consumed at a legacy Cantina bench must write one canonical drink event.'
  );
  assert(optionalVisitor.repeatDrinksServed === 1, 'The optional repeat counter must advance once.');
  assert(optionalVisitor.completedServices.length === 0, 'An optional drink must not enter the promised-service plan.');
  assert(optionalVisitor.activeService === null && !optionalVisitor.carryingDrink, 'A completed optional drink must clear its transient state.');
  assert(
    optional.openingEconomy.ledger.recent.filter((event) => event.kind === 'retail-sale').length === optionalSalesBefore + 1,
    'A completed optional drink must create exactly one sale.'
  );
  tick(optional, 0.2);
  assert(
    optional.serviceLog.lifetimeByService.drink === optionalEventsBefore + 1,
    'A second tick must not duplicate an optional drink event.'
  );
  assert(
    optional.openingEconomy.ledger.recent.filter((event) => event.kind === 'retail-sale').length === optionalSalesBefore + 1,
    'A second tick must not charge for the optional drink again.'
  );

  // Rejection is also a production-path contract: invalid fixture truth must
  // leave the drink, plan, payment, and route untouched for a later retry.
  const rejected = scenario('cantina-expanded');
  rejected.controls.paused = false;
  const rejectedVisitor = rejected.visitors[0];
  rejected.visitors = [rejectedVisitor];
  const emptyCantinaTile = 59 * rejected.width + 57;
  assert(rejected.rooms[emptyCantinaTile] === RoomType.Cantina, 'The rejection fixture must be inside the Cantina.');
  assert(rejected.modules[emptyCantinaTile] === ModuleType.None, 'The rejection tile must not contain a service fixture.');
  putVisitorAt(rejected, rejectedVisitor, emptyCantinaTile);
  rejectedVisitor.state = VisitorState.Leisure;
  rejectedVisitor.eatTimer = 0;
  rejectedVisitor.activeService = 'drink';
  rejectedVisitor.optionalDrinkActive = false;
  rejectedVisitor.carryingDrink = true;
  rejectedVisitor.servicePlan = ['drink'];
  rejectedVisitor.completedServices = [];
  rejectedVisitor.reservedTargetTile = null;
  const rejectedEventsBefore = rejected.serviceLog.lifetimeByService.drink;
  const rejectedSalesBefore = rejected.openingEconomy.ledger.recent.length;
  tick(rejected, 0.2);
  assert(rejected.serviceLog.lifetimeByService.drink === rejectedEventsBefore, 'An empty Cantina tile must not complete a drink.');
  assert(rejected.openingEconomy.ledger.recent.length === rejectedSalesBefore, 'A rejected drink must not create an economy event.');
  assert(
    rejectedVisitor.activeService === 'drink' && rejectedVisitor.carryingDrink && rejectedVisitor.completedServices.length === 0,
    'A rejected drink must retain its physical carry and outstanding plan state.'
  );
  assert(rejectedVisitor.tileIndex === emptyCantinaTile && rejectedVisitor.path.length === 0, 'A rejected drink must not route away as if served.');

  // Community Table seats must enter and finish the ordinary meal state; the
  // larger fixture is not a decorative capacity bonus.
  const cafeteria = scenario('long-stay-guest-wing');
  cafeteria.controls.paused = false;
  const donor = scenario('cantina-expanded').visitors[0];
  const diner: Visitor = {
    ...donor,
    id: 99880,
    path: [],
    servicePlan: ['meal'],
    completedServices: [],
    state: VisitorState.ToCafeteria,
    activeService: 'meal',
    optionalDrinkActive: false,
    carryingDrink: false,
    carryingMeal: true,
    servedMeal: false,
    eatTimer: 0,
    recurringNeedActive: null,
    needs: undefined
  };
  cafeteria.visitors = [diner];
  const communitySeat = slotsOfRole(cafeteria, [ModuleType.CommunityTable], 'seat')[0];
  assert(communitySeat, 'The guest wing needs a Community Table seat.');
  putVisitorAt(cafeteria, diner, communitySeat.tileIndex);
  diner.reservedTargetTile = communitySeat.tileIndex;
  assert(claim(cafeteria, diner.id, communitySeat), 'The diner must hold its depicted Community Table seat.');
  tick(cafeteria, 0.2);
  assert(diner.state === VisitorState.Eating, 'A meal carried to a Community Table seat must enter the eating state.');
  diner.eatTimer = 0;
  const mealEventsBefore = cafeteria.serviceLog.lifetimeByService.meal;
  const mealsServedBefore = cafeteria.metrics.mealsServedTotal;
  tick(cafeteria, 0.2);
  const mealEvent = cafeteria.serviceLog.recent.find(
    (event) => event.actorId === diner.id && event.service === 'meal'
  );
  assert(mealEvent?.moduleType === ModuleType.CommunityTable, 'The canonical meal event must name the Community Table fixture.');
  assert(cafeteria.serviceLog.lifetimeByService.meal === mealEventsBefore + 1, 'The Community Table meal must complete exactly once.');
  assert(cafeteria.metrics.mealsServedTotal === mealsServedBefore + 1, 'The physical Community Table meal must advance served-meal truth.');
  assert(diner.servedMeal && !diner.carryingMeal && diner.completedServices.includes('meal'), 'The diner must finish and clear its carried meal.');
  tick(cafeteria, 0.2);
  assert(cafeteria.serviceLog.lifetimeByService.meal === mealEventsBefore + 1, 'A later tick must not duplicate the Community Table meal.');

  return 'legacy optional drink: 1 event / 1 sale / 0 promise entries; invalid seat: 0 events / 0 sales; Community Table: 1 meal event';
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

  // The two layouts carry the SAME arrivals with the same ids and hidden wants.
  const arrivals = (target: StationState): Visitor[] =>
    target.visitors.filter((visitor) => visitor.id >= 99500 && visitor.id < 99540);
  assert(arrivals(without).length === arrivals(withDesk).length, 'Both layouts must receive identical arrivals.');
  assert(arrivals(without).length > 0, 'The reception comparison needs arrivals.');
  for (let index = 0; index < arrivals(without).length; index += 1) {
    const left = arrivals(without)[index];
    const right = arrivals(withDesk)[index];
    assert(left.id === right.id, 'Reception variants must preserve arrival identity and order.');
    assert(
      JSON.stringify(left.servicePlan) === JSON.stringify(right.servicePlan),
      `Guest ${left.id} must carry the same hidden demand in both variants.`
    );
    assert(
      left.activeService === null && (left.revealedServices?.length ?? 0) === 0,
      `Guest ${left.id} must begin with demand hidden.`
    );
  }

  // Nobody is gated by the missing desk. On the first live tick every guest
  // commits to a real, preference-led lounge fixture instead.
  advance(without, 0.2);
  const firstChoiceReservations = without.reservations.filter(
    (reservation) =>
      reservation.releaseReason === null &&
      reservation.ownerKind === 'visitor' &&
      arrivals(without).some((visitor) => visitor.id === reservation.ownerId) &&
      reservation.targetId?.startsWith('first-choice:leisure:')
  );
  assert(
    firstChoiceReservations.length === arrivals(without).length,
    `Every deskless guest must select a plausible physical first stop (${firstChoiceReservations.length}/${arrivals(without).length}).`
  );

  advance(without, 59.8);
  advance(withDesk, 60);

  // Reception's measured job is routing correctness, not itinerary exposure.
  const processed = arrivals(withDesk).filter(
    (visitor) => visitor.receptionProcessedAt !== null && visitor.receptionProcessedAt !== undefined
  ).length;
  const redirectsWithout = arrivals(without).filter((visitor) => visitor.redirectedFrom !== null).length;
  const redirectsWith = arrivals(withDesk).filter((visitor) => visitor.redirectedFrom !== null).length;
  const resolvedWithout = arrivals(without).filter((visitor) => (visitor.revealedServices?.length ?? 0) > 0).length;
  const resolvedWith = arrivals(withDesk).filter((visitor) => (visitor.revealedServices?.length ?? 0) > 0).length;
  const correctWithout = arrivals(without).filter(
    (visitor) => (visitor.revealedServices?.length ?? 0) > 0 && visitor.redirectedFrom === null
  ).length;
  const correctWith = arrivals(withDesk).filter(
    (visitor) => (visitor.revealedServices?.length ?? 0) > 0 && visitor.redirectedFrom === null
  ).length;
  assert(
    processed > 0,
    'A staffed desk must physically process at least one of the identical arrivals.'
  );
  assert(
    processed < arrivals(withDesk).length,
    'Finite Reception capacity must leave some traffic on the ordinary bypass path.'
  );
  assert(
    arrivals(withDesk).some(
      (visitor) => visitor.receptionProcessedAt === null && (visitor.revealedServices?.length ?? 0) > 0
    ),
    'Some guests must make an ordinary physical first choice before Reception can process them.'
  );
  assert(
    correctWith / Math.max(1, resolvedWith) > correctWithout / Math.max(1, resolvedWithout),
    `Reception must improve correct first routing (${correctWithout}/${resolvedWithout} vs ${correctWith}/${resolvedWith}).`
  );
  assert(redirectsWithout > 0, 'At least one hidden need must cause a wrong first choice and redirect.');
  assert(redirectsWith < redirectsWithout, `Reception must prevent redirects (${redirectsWithout} vs ${redirectsWith}).`);

  const redirectEvents = without.derived.queueTheater.eventFeed.filter((event) => event.text.includes('redirecting from'));
  assert(
    redirectEvents.length === redirectsWithout,
    `Each redirected guest must emit exactly one causal event (${redirectEvents.length} events for ${redirectsWithout} redirects).`
  );
  assert(
    arrivals(without).filter((visitor) => visitor.redirectedFrom !== null).every(
      (visitor) => visitor.redirectedFrom === 'leisure' && visitor.activeService === 'comfort'
    ),
    'A wrong lounge guess must retain redirectedFrom=leisure and the realized comfort need.'
  );
  const eventCountBefore = redirectEvents.length;
  advance(without, 20);
  assert(
    without.derived.queueTheater.eventFeed.filter((event) => event.text.includes('redirecting from')).length === eventCountBefore,
    'A realized need must not oscillate or emit a second redirect.'
  );

  const floaterProbe = scenario('reception-absent');
  for (let elapsed = 0; elapsed < 20 && floaterProbe.derived.queueTheater.floaters.length === 0; elapsed += 0.2) {
    advance(floaterProbe, 0.2);
  }
  assert(
    floaterProbe.derived.queueTheater.floaters.some((floater) => floater.text.startsWith('Need: comfort')),
    'The need realization must be visible in world space when the redirect happens.'
  );

  // And neither processing nor behavior may publish the whole itinerary.
  for (const visitor of arrivals(withDesk)) {
    assert(
      (visitor.revealedServices?.length ?? 0) < visitor.servicePlan.length,
      'A visitor must retain at least one hidden want.'
    );
  }

  return `same-seed hidden demand: correct first routes ${correctWithout}/${resolvedWithout} without Reception vs `
    + `${correctWith}/${resolvedWith} with it; ${redirectsWithout} redirects fell to ${redirectsWith}; `
    + `${processed} processed while other guests chose physical fixtures, each wrong choice emitted one event + need floater; `
    + `unstaffed '${unstaffedStatus.blockedReason}' still bypasses`;
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

  const cohort = (): Visitor[] => state.visitors.filter((visitor) => visitor.id >= 99700 && visitor.id < 99800);
  assert(cohort().length === 8, `The guest wing must begin with its authored eight-person cohort, found ${cohort().length}.`);
  advance(state, 180);
  assert(cohort().length === 8, 'The complete long-stay cohort must remain present through the three-minute showcase.');
  assert(
    cohort().every((visitor) => (visitor.needs?.completions ?? 0) >= 1),
    'Every long-stay guest must complete at least one recurring physical need.'
  );
  for (const service of ['meal', 'drink', 'hygiene', 'comfort', 'leisure'] as const) {
    assert(state.serviceLog.lifetimeByService[service] > 0, `The connected guest wing must complete ${service} service.`);
  }
  const fixtureTruth = (service: 'meal' | 'drink' | 'hygiene' | 'comfort', module: ModuleType): boolean =>
    state.serviceLog.recent.some((event) => event.service === service && event.moduleType === module);
  assert(fixtureTruth('meal', ModuleType.CommunityTable), 'Recurring meals must finish at the Community Table.');
  assert(fixtureTruth('drink', ModuleType.BoothBank), 'Drinks must finish at the Booth Bank.');
  assert(fixtureTruth('hygiene', ModuleType.WashBank), 'At least one hygiene session must finish at the Wash Bank.');
  assert(
    fixtureTruth('comfort', ModuleType.GuestCabin) || fixtureTruth('comfort', ModuleType.BunkBank),
    'At least one sleep session must finish in depicted guest lodging.'
  );

  return `cohort 8/8 present after 180s with recurring completions ${cohort().map((visitor) => visitor.needs?.completions ?? 0).join('/')}; `
    + `services meal ${state.serviceLog.lifetimeByService.meal}, drink ${state.serviceLog.lifetimeByService.drink}, hygiene ${state.serviceLog.lifetimeByService.hygiene}, `
    + `comfort ${state.serviceLog.lifetimeByService.comfort}, leisure ${state.serviceLog.lifetimeByService.leisure}; `
    + `beds ${beds.length}, wash ${wash.length}, pickups ${pickups.length}, seats ${seats.length}, bar stools ${bars[0].guestSlots.length}`;
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
// 12. A death hands the position back on the tick it happens
// ---------------------------------------------------------------------------

function testDeathFreesItsPositionSameTick(): string {
  // A claim is a live hold on a physical position, not a lease a corpse gets to
  // sit out. Every death path must return the position on the tick the actor
  // dies; riding out the 70-120s claim TTL leaves a stool, a staff lane or a
  // seat blocked long after anyone is using it, and the fixture reads full.
  //
  // Each case drives the real suffocation path: the actor's accumulated air
  // exposure is pushed past any survivable limit, then one ordinary `tick` runs
  // updateCrewLogic / updateVisitorLogic / updateResidentLogic, which call
  // applyAirExposure and take the death branch themselves. Nothing here calls
  // the release directly.
  //
  // Each case is run with a single actor of its kind on the station. A freed
  // position is competitive: with the rest of the roster present a neighbour
  // takes the stool on the very same tick, which is the right behaviour but
  // would hide whether the corpse ever let go of it.
  const LETHAL_EXPOSURE_SEC = 600;
  const evidence: string[] = [];

  const dieAndExpectPositionFreed = (
    label: string,
    state: StationState,
    ownerKind: 'visitor' | 'crew' | 'resident',
    ownerId: number,
    slotTile: number
  ): void => {
    const claimBefore = facilityClaimFor(state, ownerKind, ownerId);
    assert(claimBefore, `${label}: the actor must hold a live claim before it dies.`);
    assert(slotIsOccupied(state, slotTile), `${label}: the claimed position must read as occupied first.`);
    const ttlBefore = claimBefore.expiresAt - state.now;
    assert(ttlBefore > 5, `${label}: the claim must start far from its TTL, had ${ttlBefore.toFixed(1)}s left.`);
    const deathsBefore = state.metrics.deathsTotal;

    state.controls.paused = false;
    tick(state, 0.2);

    assert(
      state.metrics.deathsTotal === deathsBefore + 1,
      `${label}: exactly one death must run through the production suffocation path (got ${state.metrics.deathsTotal - deathsBefore}).`
    );
    assert(!slotIsOccupied(state, slotTile), `${label}: a corpse must not keep occupying its position.`);
    assert(
      facilityClaimFor(state, ownerKind, ownerId) === null,
      `${label}: a dead actor must hold no live claim.`
    );
    assert(
      claimBefore.releaseReason === 'cleared',
      `${label}: the claim must be explicitly released, got ${String(claimBefore.releaseReason)}.`
    );
    // The decisive part. The claim was still well inside its TTL when the
    // position came back, so the death freed it — not the clock.
    const ttlLeft = claimBefore.expiresAt - state.now;
    assert(ttlLeft > 5, `${label}: the position came back only as the TTL lapsed (${ttlLeft.toFixed(1)}s left).`);
    evidence.push(`${label} freed with ${ttlLeft.toFixed(0)}s of claim TTL unspent`);
  };

  // A guest suffocating on a bar stool.
  const guestState = scenario('cantina-expanded');
  const guest = guestState.visitors[0];
  assert(guest, 'The expanded cantina must start with guests.');
  const stool = freeSlotsOfRole(
    guestState,
    [ModuleType.ServiceBar, ModuleType.BarCorner, ModuleType.BarEnd],
    'bar-service'
  )[0];
  assert(stool, 'The expanded bar must offer a free stool.');
  putVisitorAt(guestState, guest, stool.tileIndex);
  assert(claim(guestState, guest.id, stool), 'The guest must be able to take the stool.');
  guest.airExposureSec = LETHAL_EXPOSURE_SEC;
  guestState.visitors = [guest];
  dieAndExpectPositionFreed('guest on a bar stool', guestState, 'visitor', guest.id, stool.tileIndex);
  assert(
    !guestState.visitors.some((entry) => entry.id === guest.id),
    'The dead guest must leave the visitor roster.'
  );

  // A steward suffocating in the staff lane. The scenario staffs the bar
  // itself, so this is a claim production code made, not one the test invented.
  const crewState = scenario('cantina-expanded');
  const steward = crewState.crewMembers.find((member) => facilityClaimFor(crewState, 'crew', member.id) !== null);
  assert(steward, 'The expanded cantina must staff its bar before the check can run.');
  const stewardClaim = facilityClaimFor(crewState, 'crew', steward.id);
  assert(stewardClaim?.targetTile !== null && stewardClaim?.targetTile !== undefined, 'A staff claim must name a tile.');
  steward.evaSuit = false;
  steward.airExposureSec = LETHAL_EXPOSURE_SEC;
  crewState.crewMembers = [steward];
  crewState.visitors = [];
  dieAndExpectPositionFreed('steward in the staff lane', crewState, 'crew', steward.id, stewardClaim.targetTile);
  assert(
    !crewState.crewMembers.some((member) => member.id === steward.id),
    'The dead steward must leave the crew roster.'
  );

  // A resident suffocating in a Community Table seat.
  const residentState = scenario('long-stay-guest-wing');
  const seat = freeSlotsOfRole(residentState, [ModuleType.CommunityTable], 'seat')[0];
  assert(seat, 'The guest wing must offer a free Community Table seat.');
  const residentId = 97010;
  residentState.residents.push({
    id: residentId,
    x: (seat.tileIndex % residentState.width) + 0.5,
    y: Math.floor(seat.tileIndex / residentState.width) + 0.5,
    tileIndex: seat.tileIndex,
    path: [],
    speed: 1.8,
    hunger: 70,
    energy: 70,
    hygiene: 70,
    social: 70,
    safety: 70,
    stress: 10,
    routinePhase: 'errands',
    role: 'none',
    roleAffinity: {},
    state: ResidentState.Idle,
    actionTimer: 0,
    retargetAt: 0,
    reservedTargetTile: seat.tileIndex,
    homeShipId: null,
    homeDockId: null,
    housingUnitId: null,
    bedModuleId: null,
    satisfaction: 70,
    leaveIntent: 0,
    blockedTicks: 0,
    airExposureSec: LETHAL_EXPOSURE_SEC,
    healthState: 'critical'
  });
  assert(claim(residentState, residentId, seat, 'resident'), 'The resident must be able to take the seat.');
  residentState.visitors = [];
  dieAndExpectPositionFreed('resident in a Community Table seat', residentState, 'resident', residentId, seat.tileIndex);
  assert(
    !residentState.residents.some((entry) => entry.id === residentId),
    'The dead resident must leave the resident roster.'
  );

  return evidence.join('; ');
}

// ---------------------------------------------------------------------------
// 13. A bigger cantina holds more people AT ONCE, not just more positions
// ---------------------------------------------------------------------------

/** Floor squares of a room that no fixture stands on, in a stable order. */
function openRoomTiles(state: StationState, room: RoomType): number[] {
  const tiles: number[] = [];
  for (let index = 0; index < state.rooms.length; index += 1) {
    if (state.rooms[index] !== room) continue;
    if (state.modules[index] !== ModuleType.None) continue;
    tiles.push(index);
  }
  return tiles.sort((left, right) => left - right);
}

function testLargerCantinaHoldsMoreOccupantsAtOnce(): string {
  // Case 6+7 already proves the expanded room offers more POSITIONS. Counting
  // positions is a claim about the blueprint; this is the claim about the
  // room. The identical eight-guest cohort is placed on the identical eight
  // floor squares in both layouts — squares that are open in both, so neither
  // room gets a head start — and both are advanced with the same step. What
  // is sampled every tick is how many of those eight guests are physically
  // holding a Cantina position at the same instant.
  const undersizedOpen = openRoomTiles(scenario('cantina-undersized'), RoomType.Cantina);
  const expandedOpen = new Set(openRoomTiles(scenario('cantina-expanded'), RoomType.Cantina));
  const shared = undersizedOpen.filter((tile) => expandedOpen.has(tile));
  const cohortTemplate = scenario('cantina-undersized').visitors.filter(
    (visitor) => visitor.id >= 99600 && visitor.id < 99608
  );
  assert(cohortTemplate.length === 8, `The cantina cohort must be the authored eight guests, found ${cohortTemplate.length}.`);
  assert(
    shared.length >= cohortTemplate.length,
    `Both cantinas must share at least ${cohortTemplate.length} open floor squares, found ${shared.length}.`
  );
  const cohortTiles = shared.slice(0, cohortTemplate.length);
  const cohortIds = new Set(cohortTemplate.map((visitor) => visitor.id));

  const OBSERVED_SEC = 60;
  const measure = (name: string) => {
    const state = scenario(name);
    // The same people, wanting the same thing, standing on the same squares.
    state.visitors = cohortTemplate.map((donor, index) => {
      const clone: Visitor = { ...donor, path: [], completedServices: [], spawnedAt: state.now };
      putVisitorAt(state, clone, cohortTiles[index]);
      return clone;
    });
    const service = slotsOfRole(state, [ModuleType.ServiceBar, ModuleType.BarCorner, ModuleType.BarEnd], 'bar-service');
    const dwell = dwellSlotsInRoom(state, RoomType.Cantina);
    const serviceTiles = new Set(service.map((slot) => slot.tileIndex));
    const occupantTiles = new Set([...serviceTiles, ...dwell.map((slot) => slot.tileIndex)]);
    let peak = 0;
    let peakService = 0;
    let peakDwell = 0;
    let peakAt = 0;
    state.controls.paused = false;
    for (let elapsed = 0; elapsed < OBSERVED_SEC; elapsed += 0.2) {
      tick(state, 0.2);
      // A live physical hold on a depicted Cantina position, by one of OUR
      // eight. Ambient traffic that wanders in is deliberately excluded, so
      // the number is a property of the room and the cohort, nothing else.
      const held = new Map<number, number>();
      for (const reservation of state.reservations) {
        if (reservation.releaseReason !== null || reservation.expiresAt <= state.now) continue;
        if (reservation.ownerKind !== 'visitor') continue;
        if (reservation.kind !== 'provider-slot' && reservation.kind !== 'seat-use-slot') continue;
        const tile = reservation.targetTile;
        if (tile === null || tile === undefined || !occupantTiles.has(tile)) continue;
        if (!cohortIds.has(Number(reservation.ownerId))) continue;
        held.set(Number(reservation.ownerId), tile);
      }
      if (held.size > peak) {
        peak = held.size;
        peakService = [...held.values()].filter((tile) => serviceTiles.has(tile)).length;
        peakDwell = peak - peakService;
        peakAt = state.now;
      }
    }
    return {
      positions: service.length + dwell.length,
      service: service.length,
      dwell: dwell.length,
      peak,
      peakService,
      peakDwell,
      peakAt
    };
  };

  const undersized = measure('cantina-undersized');
  const expanded = measure('cantina-expanded');

  assert(undersized.peak > 0, 'The undersized cantina must hold somebody at all before the comparison means anything.');
  assert(
    undersized.peak === undersized.positions,
    `The undersized cantina must saturate every position it owns, so its ceiling is the room and not the cohort (${undersized.peak}/${undersized.positions}).`
  );
  assert(
    expanded.peak > undersized.peak,
    `A larger cantina must hold more people at the same instant (${undersized.peak} vs ${expanded.peak}).`
  );
  assert(
    expanded.peakDwell > 0,
    'The extra simultaneous occupants must be standing in dwell positions the small room does not have.'
  );
  assert(
    expanded.peak <= cohortTemplate.length,
    `Simultaneous occupancy cannot exceed the cohort (${expanded.peak} of ${cohortTemplate.length}).`
  );

  return `same ${cohortTemplate.length}-guest cohort on the same tiles ${cohortTiles[0]}-${cohortTiles[cohortTiles.length - 1]}, ${OBSERVED_SEC}s each: `
    + `peak SIMULTANEOUS occupants ${undersized.peak} (undersized, saturating all ${undersized.positions} positions = ${undersized.service} service + ${undersized.dwell} dwell, at ${undersized.peakAt.toFixed(1)}s) `
    + `vs ${expanded.peak} (expanded, ${expanded.peakService} service + ${expanded.peakDwell} dwell of ${expanded.positions} positions, at ${expanded.peakAt.toFixed(1)}s)`;
}

// ---------------------------------------------------------------------------
// 14. Two seeds of one layout differ without becoming unlearnable
// ---------------------------------------------------------------------------

function testSeededRunsDifferButStayInferable(): string {
  // Case 9 deliberately runs its Reception pair on the SAME seed, because it
  // is comparing two layouts. This is the opposite question: one layout, two
  // seeds. Both halves have to hold at once. Divergence alone would just be
  // noise, and a run that comes out identical every time is not a seeded run.
  const OBSERVED_SEC = 60;
  const runSeed = (seed: number) => {
    const state = scenario('reception-absent', seed);
    const mix = new Map<string, number>();
    const seen = new Set<number>();
    state.controls.paused = false;
    for (let elapsed = 0; elapsed < OBSERVED_SEC; elapsed += 0.2) {
      tick(state, 0.2);
      // Demand mix of everybody who ARRIVED during the run, counted once on
      // the tick they first exist, so guests who finish and leave still count.
      for (const visitor of state.visitors) {
        if (seen.has(visitor.id)) continue;
        seen.add(visitor.id);
        const label = `${visitor.archetype}/${visitor.primaryPreference}`;
        mix.set(label, (mix.get(label) ?? 0) + 1);
      }
    }
    const arrivals = state.visitors.filter((visitor) => visitor.id >= 99500 && visitor.id < 99540);
    const resolved = arrivals.filter((visitor) => (visitor.revealedServices?.length ?? 0) > 0).length;
    const correct = arrivals.filter(
      (visitor) => (visitor.revealedServices?.length ?? 0) > 0 && visitor.redirectedFrom === null
    ).length;
    const redirected = arrivals.filter((visitor) => visitor.redirectedFrom !== null).length;
    return { seed, mix, arrived: seen.size, resolved, correct, redirected };
  };

  const left = runSeed(4242);
  const right = runSeed(7);

  // (a) The two runs are actually different worlds.
  const labels = new Set([...left.mix.keys(), ...right.mix.keys()]);
  let distance = 0;
  let differingClasses = 0;
  for (const label of labels) {
    const gap = Math.abs((left.mix.get(label) ?? 0) - (right.mix.get(label) ?? 0));
    distance += gap;
    if (gap > 0) differingClasses += 1;
  }
  const describe = (mix: Map<string, number>): string =>
    [...mix].sort(([a], [b]) => a.localeCompare(b)).map(([label, count]) => `${label} x${count}`).join(', ');
  assert(describe(left.mix) !== describe(right.mix), 'Two seeds must not produce the same arrival demand mix.');
  // Each seed is reproducible, but the thresholds are stated as floors rather
  // than the exact measured values: the divergence is a property of the
  // traffic generator, not of these two magic numbers.
  assert(
    differingClasses >= 3,
    `Seeded arrival mixes must differ across at least 3 archetype/preference classes, differed in ${differingClasses}.`
  );
  assert(
    distance >= 5,
    `Seeded arrival mixes must differ by at least 5 arrivals in total, differed by ${distance}.`
  );

  // (b) ...and both worlds stay readable. Once a guest has a cue in hand, its
  // first physical choice is right about as often either way, so a new seed
  // changes WHO shows up and never whether the player can reason about them.
  assert(left.resolved > 0 && right.resolved > 0, 'Both runs need guests whose demand became visible.');
  assert(
    left.redirected > 0 && right.redirected > 0,
    `Both runs must contain a genuinely wrong first guess (${left.redirected} vs ${right.redirected} redirects).`
  );
  const leftShare = left.correct / left.resolved;
  const rightShare = right.correct / right.resolved;
  // A stated band, not an exact value. Half the authored arrivals want a
  // fixture the lounge cannot supply, so a readable deskless run sits near one
  // correct first choice in two; the band allows a full guest either way.
  for (const [seed, share] of [[left.seed, leftShare], [right.seed, rightShare]] as const) {
    assert(
      share >= 0.35 && share <= 0.65,
      `Seed ${seed} left first-choice accuracy outside the stated 0.35-0.65 inferable band at ${share.toFixed(3)}.`
    );
  }
  assert(
    Math.abs(leftShare - rightShare) <= 0.125,
    `A new seed must not change how learnable the station is (${leftShare.toFixed(3)} vs ${rightShare.toFixed(3)}).`
  );

  return `one layout, two seeds, ${OBSERVED_SEC}s each — arrivals by demand class, seed ${left.seed}: ${describe(left.mix)} (${left.arrived} total) `
    + `vs seed ${right.seed}: ${describe(right.mix)} (${right.arrived} total); ${differingClasses} classes differ, total mix distance ${distance}. `
    + `Still inferable: correct first choices once a cue is present ${left.correct}/${left.resolved} = ${leftShare.toFixed(2)} vs `
    + `${right.correct}/${right.resolved} = ${rightShare.toFixed(2)} — both inside the stated 0.35-0.65 band and ${Math.abs(leftShare - rightShare).toFixed(2)} apart; `
    + `${left.redirected} and ${right.redirected} wrong first guesses were still corrected in world`;
}

// ---------------------------------------------------------------------------
// 15. A declared public use face is a physical customer edge
// ---------------------------------------------------------------------------

/** Seal every floor square a guest could stand on to use this fixture. */
function wallInPublicFace(state: StationState, module: ModuleInstance): number[] {
  const approach = publicApproachTilesForModule(module, state.width, state.height);
  for (const tile of approach) setTile(state, tile, TileType.Wall);
  return approach;
}

function testPublicUseFaceIsPhysical(): string {
  // (a) The contract itself. Exactly one fixture is allowed to have no
  // customer edge, and it is the one whose entire design is not having one.
  const declared = Object.values(FACILITY_FIXTURE_DESCRIPTORS).filter((entry) => entry !== undefined);
  const backOfHouse = declared.filter((entry) => entry!.publicUseFace === null);
  assert(declared.length === 15, `Expected 15 authored fixtures, found ${declared.length}.`);
  assert(
    backOfHouse.length === 1 && backOfHouse[0]!.module === ModuleType.BackroomStockBank,
    `Only the Backroom Stock Bank may declare no public face, found ${backOfHouse.map((entry) => entry!.module).join(', ')}.`
  );

  // (b) The face resolves to real tiles that lie OUTSIDE the footprint, on the
  // declared side, and it turns with the fixture.
  const market = scenario('market-improved-flow');
  const bank = market.moduleInstances.find((module) => module.type === ModuleType.CheckoutBank)!;
  const approach = publicApproachTilesForModule(bank, market.width, market.height);
  const footprint = new Set(bank.tiles);
  assert(approach.length > 0, 'A placed Checkout Bank must expose customer-side floor squares.');
  assert(
    approach.every((tile) => !footprint.has(tile)),
    'The public approach must be floor beside the fixture, never the fixture itself.'
  );
  assert(
    publicFaceOfModule(bank) === 'west' && approach.every((tile) => footprint.has(tile + 1)),
    'An unrotated Checkout Bank must present its west column to customers, one square west of each register row.'
  );
  const turned: ModuleInstance = { ...bank, rotation: 90 };
  assert(
    publicFaceOfModule(turned) === 'north',
    `Rotating a fixture must turn its public face too, got ${publicFaceOfModule(turned)}.`
  );

  // (c) An open frontage is not blocked, and the market says so.
  assert(!publicRouteIsBlocked(market, bank), 'A Checkout Bank with open floor in front of it is reachable.');
  const openChain = marketChainStatus(market);
  assert(
    openChain.blockedReason !== 'public-route-blocked',
    `A reachable market must not report a blocked customer route, got ${openChain.blockedReason}.`
  );

  // (d) Seal every register frontage and the SAME reading flips. The market is
  // still stocked and still staffed, so nothing more actionable can outrank it.
  const sealed = scenario('market-improved-flow');
  const sealedBanks = sealed.moduleInstances.filter((module) => module.type === ModuleType.CheckoutBank);
  const sealedTiles = sealedBanks.flatMap((module) => wallInPublicFace(sealed, module));
  assert(sealedTiles.length > 0, 'The sealing step must actually wall something in.');
  assert(
    sealedBanks.every((module) => publicRouteIsBlocked(sealed, module)),
    'A Checkout Bank walled in along its customer edge must read as unreachable.'
  );
  const sealedChain = marketChainStatus(sealed);
  assert(sealedChain.shelves > 0.95, 'The sealed market must still be stocked, or a stock complaint would win.');
  assert(sealedChain.staffedRegisters > 0, 'The sealed market must still be staffed, or a staffing complaint would win.');
  assert(
    sealedChain.blockedReason === 'public-route-blocked',
    `A market with no customer frontage must report 'public-route-blocked', got ${sealedChain.blockedReason}.`
  );

  // (e) Back-of-house is exempt by design: burying a Backroom Stock Bank is a
  // restocking problem, never a customer-route one.
  const backroom = sealed.moduleInstances.find((module) => module.type === ModuleType.BackroomStockBank)!;
  for (const tile of backroom.tiles) {
    for (const step of [-1, 1, -sealed.width, sealed.width]) {
      const neighbour = tile + step;
      if (neighbour >= 0 && neighbour < sealed.tiles.length && !backroom.tiles.includes(neighbour)) {
        setTile(sealed, neighbour, TileType.Wall);
      }
    }
  }
  assert(
    !publicRouteIsBlocked(sealed, backroom),
    'A fixture that deliberately has no public face must never be flagged for lacking one.'
  );

  // (f) The same derivation drives a connected bar run, not just the market.
  const cantina = scenario('cantina-expanded');
  const openBar = barGroupStatus(cantina, barGroups(cantina)[0], 2);
  assert(
    openBar.blockedReason !== 'public-route-blocked',
    `An open bar run must not report a blocked guest side, got ${openBar.blockedReason}.`
  );
  for (const id of barGroups(cantina)[0].moduleIds) {
    wallInPublicFace(cantina, cantina.moduleInstances.find((module) => module.id === id)!);
  }
  const sealedBar = barGroupStatus(cantina, barGroups(cantina)[0], 2);
  assert(
    sealedBar.stock >= 0.16 && sealedBar.freeGuestSlots > 0 && sealedBar.dwellCapacity > 0,
    'The sealed bar must remain stocked, free and seated so the route is the only true complaint.'
  );
  assert(
    sealedBar.blockedReason === 'public-route-blocked',
    `A bar run walled in along every guest side must report 'public-route-blocked', got ${sealedBar.blockedReason}.`
  );

  return `14 fixtures declare a face, 1 (Backroom Stock Bank) deliberately null; Checkout Bank west face resolved to ${approach.length} outside floor squares and rotated to north; `
    + `sealing ${sealedTiles.length} frontage squares flipped a stocked, staffed market from '${openChain.blockedReason ?? 'clear'}' to '${sealedChain.blockedReason}', and a stocked bar run to '${sealedBar.blockedReason}'; buried backroom still exempt`;
}

// ---------------------------------------------------------------------------
// 16. A bigger fixture costs more to RUN, not just more to buy
// ---------------------------------------------------------------------------

const CANTINA_FIXTURES = new Set<ModuleType>([
  ModuleType.ServiceBar,
  ModuleType.BarCorner,
  ModuleType.BarEnd,
  ModuleType.BoothBank,
  ModuleType.StandingRail
]);

function testLargerFixturesAreChargedToRun(): string {
  // Footprint, staffing, stock and queue frontage already charge scale. These
  // are the two levers that were still free, plus the maintenance lever the
  // Gate F fixtures only just started paying.
  const undersized = scenario('cantina-undersized');
  const expanded = scenario('cantina-expanded');

  // (a) Utilities. The complaint being answered is that a 2x5 fixture drew
  // exactly what a 2x1 one drew because only the ROOM was counted.
  const stall = facilityOperatingLoad(ModuleType.MarketStall)!;
  const bank = facilityOperatingLoad(ModuleType.CheckoutBank)!;
  assert(
    bank.powerDraw >= stall.powerDraw * 4,
    `A 2x5 Checkout Bank must draw far more than a 2x1 Market Stall (${bank.powerDraw} vs ${stall.powerDraw}).`
  );
  for (const [module, load] of Object.entries(FACILITY_OPERATING_LOAD)) {
    assert(load!.powerDraw > 0, `${module} must declare a real utility draw.`);
  }
  const utilityUnder = facilityUtilityDemand(undersized);
  const utilityOver = facilityUtilityDemand(expanded);
  assert(
    utilityOver > utilityUnder,
    `The expanded cantina must draw more power than the undersized one (${utilityUnder.toFixed(2)} vs ${utilityOver.toFixed(2)}).`
  );

  // (b) Cleaning, charged against the fixture's own depicted positions rather
  // than against whoever walks past. Eight seats at one Community Table must
  // cost more to keep clean than the same eight at two compact Tables — which
  // is what the Community Table's own definition comment has always claimed.
  const table = facilityOperatingLoad(ModuleType.Table)!;
  const community = facilityOperatingLoad(ModuleType.CommunityTable)!;
  const eightSeatsCompact = 8 * (table.idleSoilPerPositionPerMin + table.inUseSoilPerPositionPerMin);
  const eightSeatsLarge = 8 * (community.idleSoilPerPositionPerMin + community.inUseSoilPerPositionPerMin);
  assert(
    eightSeatsLarge > eightSeatsCompact,
    `Eight seats of Community Table must be a heavier cleaning burden than eight of compact Tables (${eightSeatsLarge.toFixed(2)} vs ${eightSeatsCompact.toFixed(2)}).`
  );
  const soilUnder = fixtureCleaningLoadPerMin(undersized);
  const soilOver = fixtureCleaningLoadPerMin(expanded);
  assert(soilUnder > 0, 'Even one Service Bar must lay down a real cleaning load.');
  assert(
    soilOver > soilUnder,
    `The expanded cantina must be dirtier to keep (${soilUnder.toFixed(2)}/min vs ${soilOver.toFixed(2)}/min).`
  );

  // (c) Maintenance. Every Gate F fixture in the room must actually accrue
  // module wear, and the bigger room must accrue strictly more of it.
  const wearOf = (state: StationState): { targets: number; debt: number } => {
    const ids = new Set(
      state.moduleInstances.filter((module) => CANTINA_FIXTURES.has(module.type)).map((module) => module.id)
    );
    const debts = state.maintenanceDebts.filter(
      (debt) => debt.moduleId !== undefined && ids.has(debt.moduleId)
    );
    return { targets: debts.length, debt: debts.reduce((sum, debt) => sum + debt.debt, 0) };
  };
  advance(undersized, 120);
  advance(expanded, 120);
  const wearUnder = wearOf(undersized);
  const wearOver = wearOf(expanded);
  assert(wearUnder.debt > 0, 'A Service Bar must accrue real module wear over two minutes.');
  assert(
    wearOver.targets > wearUnder.targets,
    `The expanded cantina must put more fixtures on the maintenance books (${wearUnder.targets} vs ${wearOver.targets}).`
  );
  assert(
    wearOver.debt > wearUnder.debt,
    `The expanded cantina must accrue more maintenance debt (${wearUnder.debt.toFixed(2)} vs ${wearOver.debt.toFixed(2)}).`
  );

  return `utilities ${utilityUnder.toFixed(2)} -> ${utilityOver.toFixed(2)} power (Checkout Bank ${bank.powerDraw} vs Market Stall ${stall.powerDraw}); `
    + `cleaning ${soilUnder.toFixed(1)} -> ${soilOver.toFixed(1)} dirt/min (8 seats: Community Table ${eightSeatsLarge.toFixed(1)} vs two Tables ${eightSeatsCompact.toFixed(1)}/min); `
    + `maintenance ${wearUnder.targets} target at ${wearUnder.debt.toFixed(2)} -> ${wearOver.targets} targets at ${wearOver.debt.toFixed(2)} after 120s`;
}

// ---------------------------------------------------------------------------
// 17. The credit ladder: Truss -> hull -> module -> labor -> maintenance
// ---------------------------------------------------------------------------

function testPriceLadderIsCoherent(): string {
  // Every rung is MEASURED through the production pricing API, never restated
  // here, so a change to any catalog price shows up as a failure rather than a
  // quietly stale duplicate.
  const state = createInitialState({ seed: 5150, physicalStarterInventory: true, manualTrafficAdmission: true });
  tick(state, 0);
  state.metrics.credits = 5000;

  // Structure is priced in materials, so it enters the ladder at the rate the
  // player actually buys materials at. Quoted in bulk to skip the 1-credit
  // minimum on a single-unit import.
  const creditsPerMaterial = quoteMaterialImportCost(state, 100) / 100;
  const truss = tileBuildCost(TileType.Truss) * creditsPerMaterial;
  const hull = tileBuildCost(TileType.Wall) * creditsPerMaterial;

  // A structural junction is the cheapest act that costs real credits.
  const beforeJunction = state.metrics.credits;
  const trussTile = state.tiles.findIndex((tile) => tile === TileType.Truss);
  let junction = 0;
  if (trussTile >= 0) {
    const planned = planStructuralPieceConstruction(state, trussTile, 'junction');
    assert(planned.ok, `The ladder needs one placeable junction: ${planned.reason ?? 'unknown'}.`);
    junction = beforeJunction - state.metrics.credits + tileBuildCost(TileType.Wall) * creditsPerMaterial;
  }
  assert(junction > 0, 'A structural junction must cost credits.');

  // The cheapest facility module a player can buy.
  const moduleCost = moduleCreditBuildCost(ModuleType.MarketStall);

  // Labor is the only rung that never stops. Priced as one crew member's first
  // hour: the hiring fee plus a full hour of payroll cycles.
  const beforeHire = state.metrics.credits;
  assert(hireCrew(state), 'The ladder needs one hire.');
  const hireFee = beforeHire - state.metrics.credits;
  const summary = getCrewSustainabilitySummary(state);
  const payrollPeriodSec = summary.secondsToPayroll;
  assert(payrollPeriodSec > 0, 'A payroll period must be measurable from a fresh station.');
  const wagePerCrewPerCycle = summary.payrollPerCycle / Math.max(1, state.crew.total);
  const crewHour = hireFee + wagePerCrewPerCycle * (3600 / payrollPeriodSec);

  // Maintenance: a routine job runs the debt threshold (45) down to the
  // completion floor (8); the worst possible job clears a saturated 100.
  const routineRepair = repairServiceCost(45 - 8);
  const worstRepair = repairServiceCost(100 - 8);
  const berth = BERTH_CAPITAL_COST.medium;

  // THE STATED LADDER. Each one-off rung is at least 2.5x and at most 8x the
  // rung below it: below 2.5x a step is a rounding error the player cannot
  // feel, above 8x it is a cliff that makes the cheaper option strictly
  // correct. The berth is included because it has to extend the same ladder
  // rather than sit outside it.
  const MIN_STEP = 2.5;
  const MAX_STEP = 8;
  const rungs: Array<{ label: string; credits: number }> = [
    { label: 'truss tile', credits: truss },
    { label: 'hull tile', credits: hull },
    { label: 'structural junction', credits: junction },
    { label: 'cheapest facility module', credits: moduleCost },
    { label: "one crew member's first hour", credits: crewHour },
    { label: 'medium berth', credits: berth }
  ];
  const steps: string[] = [];
  for (let index = 1; index < rungs.length; index += 1) {
    const step = rungs[index].credits / rungs[index - 1].credits;
    assert(
      step >= MIN_STEP && step <= MAX_STEP,
      `${rungs[index - 1].label} -> ${rungs[index].label} stepped ${step.toFixed(2)}x, outside the stated ${MIN_STEP}-${MAX_STEP}x ladder `
        + `(${rungs[index - 1].credits.toFixed(2)}c -> ${rungs[index].credits.toFixed(2)}c).`
    );
    steps.push(`${rungs[index].label} ${step.toFixed(1)}x`);
  }

  // Maintenance is bracketed rather than ranked, because a repair that
  // out-prices the fixture it saves turns "let it burn" into the right move.
  assert(
    routineRepair >= junction * 0.5,
    `A routine repair (${routineRepair.toFixed(2)}c) must not be cheaper than half a structural junction (${(junction * 0.5).toFixed(2)}c).`
  );
  const cheapestWearingFixture = moduleCreditBuildCost(ModuleType.BarEnd);
  assert(
    worstRepair < cheapestWearingFixture * 0.5,
    `The worst possible repair (${worstRepair.toFixed(2)}c) must stay under half the cheapest fixture that can wear out `
      + `(${cheapestWearingFixture}c), or replacing beats repairing.`
  );
  assert(
    MAINTENANCE_PRICING.callOutCredits > 0 && MAINTENANCE_PRICING.creditsPerWearPoint > 0,
    'Maintenance must carry both a fixed call-out and a per-wear price, or neglect is free.'
  );

  // And the ladder must not have moved the two recently calibrated numbers.
  assert(berth === 600, `The medium berth capital cost must stay at its calibrated 600c, got ${berth}.`);
  assert(
    moduleCreditBuildCost(ModuleType.MarketStall) === 50 && moduleCreditBuildCost(ModuleType.ServingStation) === 50,
    'The opening-business hardware prices must stay where OPEN-04 calibrated them.'
  );

  return `${rungs.map((rung) => `${rung.label} ${rung.credits.toFixed(2)}c`).join(' -> ')}; steps ${steps.join(', ')} all inside ${MIN_STEP}-${MAX_STEP}x; `
    + `maintenance bracketed: routine ${routineRepair.toFixed(1)}c >= half a junction ${(junction * 0.5).toFixed(1)}c, worst ${worstRepair.toFixed(1)}c < half a Bar End ${(cheapestWearingFixture * 0.5).toFixed(1)}c`;
}

// ---------------------------------------------------------------------------

const TESTS: Array<{ name: string; run: () => string }> = [
  { name: '1 exclusive claims and cleanup', run: testExclusiveClaimsAndCleanup },
  { name: '2 market chain exactly once', run: testMarketChainExactlyOnce },
  { name: '2b cargo dispatch pair fairness', run: testCargoDispatchPairFairness },
  { name: '3+4 market layout comparison', run: testMarketLayoutComparison },
  { name: '5 connected bar geometry', run: testConnectedBarGeometry },
  { name: '6+7 throughput vs dwell, dry vs staffed', run: testThroughputAndDwellAreIndependent },
  { name: '7 canonical facility service completion', run: testCanonicalFacilityServiceCompletion },
  { name: '8 every depicted position reservable', run: testEveryDepictedPositionIsReservable },
  { name: '9 reception reveals without gating', run: testReceptionRevealsAndNeverGates },
  { name: '10 long-stay repeat sessions', run: testLongStayWingSupportsRepeatSessions },
  { name: '11 save/load rebuilds fixtures', run: testSaveLoadRebuildsFixtures },
  { name: '12 death frees its position same tick', run: testDeathFreesItsPositionSameTick },
  { name: '13 larger cantina holds more occupants at once', run: testLargerCantinaHoldsMoreOccupantsAtOnce },
  { name: '14 seeded runs differ but stay inferable', run: testSeededRunsDifferButStayInferable },
  { name: '15 public use face is a physical customer edge', run: testPublicUseFaceIsPhysical },
  { name: '16 larger fixtures are charged to run', run: testLargerFixturesAreChargedToRun },
  { name: '17 price ladder is coherent', run: testPriceLadderIsCoherent }
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
