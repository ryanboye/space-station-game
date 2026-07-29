import { applyColdStartScenario } from '../src/sim/cold-start-scenarios';
import { MODULE_DEFINITIONS, facilityOperatingLoad } from '../src/sim/balance';
import {
  facilityDescriptorFor,
  publicFaceOfModule,
  resolveFacilitySlots,
  rotateFacilityFace
} from '../src/sim/facility-descriptors';
import { SHELF_MIXES, marketChainStatus } from '../src/sim/facility-machines';
import { buildSlotReservationRequest, slotsOnModule } from '../src/sim/facility-slots';
import {
  FACILITY_SPRITE_VARIANTS,
  deriveFacilitySpriteTruth,
  facilitySpriteKeyForModule
} from '../src/render/facility-sprite-state';
import { MODULE_SPRITE_KEYS } from '../src/render/sprite-keys';
import {
  createInitialState,
  getMarketFixtureStatus,
  setShelfMix,
  tick,
  tryCreateReservation,
  tryPlaceModule
} from '../src/sim/sim';
import { hydrateStateFromSave, parseAndMigrateSave, serializeSave } from '../src/sim/save';
import { ModuleType, type ModuleInstance, type StationState } from '../src/sim/types';
import { renderTravelSuppliesShop, type TravelSuppliesShopView } from '../src/ui/opening-economy-panels';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`display-cold-case: ${message}`);
}

const STEP = 0.2;

function scenario(seed = 76121): StationState {
  const state = createInitialState({ seed, physicalStarterInventory: true, manualTrafficAdmission: true });
  assert(applyColdStartScenario(state, 'display-cold-case'), 'playable display-cold-case scenario is not registered');
  tick(state, 0);
  state.controls.shipsPerCycle = 0;
  return state;
}

function displayOf(state: StationState): ModuleInstance {
  const display = state.moduleInstances.find((module) => module.type === ModuleType.DisplayColdCase);
  assert(display, 'scenario has no Display Cold Case');
  return display;
}

function stockNode(state: StationState, module: ModuleInstance) {
  const node = state.itemNodes.find((entry) => entry.tileIndex === module.originTile);
  assert(node, `${module.type} has no physical item node`);
  return node;
}

function advance(state: StationState, seconds: number, observe?: () => void): void {
  state.controls.paused = false;
  for (let elapsed = 0; elapsed + 1e-9 < seconds; elapsed += STEP) {
    tick(state, Math.min(STEP, seconds - elapsed));
    observe?.();
  }
}

function waitFor(state: StationState, label: string, predicate: () => boolean, maxSeconds: number): void {
  for (let elapsed = 0; elapsed < maxSeconds; elapsed += STEP) {
    if (predicate()) return;
    tick(state, STEP);
  }
  assert(predicate(), `timed out waiting for ${label} at ${state.now.toFixed(1)}s`);
}

function testFootprintRotationAndExclusiveBays(): string {
  const state = scenario();
  const display = displayOf(state);
  const definition = MODULE_DEFINITIONS[ModuleType.DisplayColdCase];
  const descriptor = facilityDescriptorFor(ModuleType.DisplayColdCase);
  assert(definition.width === 3 && definition.height === 1 && definition.rotatable, 'catalog footprint must be rotatable 3x1');
  assert(display.width === 3 && display.height === 1 && display.rotation === 0, 'scenario case is not native 3x1');
  assert(descriptor?.width === 3 && descriptor.height === 1, 'facility descriptor disagrees with the catalog footprint');
  assert(descriptor.publicUseFace === 'south' && descriptor.stockServiceFace === 'north', 'native public/stock faces must be south/north');

  const slots = slotsOnModule(state, display, 'browse');
  assert(slots.length === 3, `expected exactly three depicted browse bays, got ${slots.length}`);
  assert(new Set(slots.map((slot) => slot.tileIndex)).size === 3, 'browse bays are not three distinct depicted positions');
  for (let index = 0; index < slots.length; index += 1) {
    const request = buildSlotReservationRequest({ ownerKind: 'visitor', ownerId: 88000 + index, slot: slots[index] });
    assert(request && tryCreateReservation(state, request).ok, `browse bay ${index + 1} could not be claimed`);
  }
  const duplicate = buildSlotReservationRequest({ ownerKind: 'visitor', ownerId: 88999, slot: slots[0] });
  assert(duplicate && !tryCreateReservation(state, duplicate).ok, 'a fourth shopper double-claimed an occupied depicted bay');

  const rotatedResult = tryPlaceModule(state, ModuleType.DisplayColdCase, 50 * state.width + 43, 90);
  assert(rotatedResult.ok, `90-degree case placement failed: ${rotatedResult.reason ?? 'unknown'}`);
  const rotated = state.moduleInstances[state.moduleInstances.length - 1];
  assert(rotated.width === 1 && rotated.height === 3, `rotated footprint is ${rotated.width}x${rotated.height}, not 1x3`);
  assert(resolveFacilitySlots(rotated, state.width).length === 3, 'rotation changed depicted browse capacity');
  assert(publicFaceOfModule(rotated) === 'west', 'rotated public face should turn south to west');
  assert(rotateFacilityFace(descriptor.stockServiceFace, 90) === 'east', 'rotated stock face should turn north to east');
  return 'native 3x1 / rotated 1x3 · south/north faces rotate west/east · 3 exclusive bays';
}

function retailStockInChain(state: StationState): number {
  const included = new Set(
    state.moduleInstances
      .filter((module) =>
        module.type === ModuleType.DisplayColdCase ||
        module.type === ModuleType.BackroomStockBank ||
        module.type === ModuleType.IntakePallet
      )
      .map((module) => module.originTile)
  );
  return state.itemNodes.reduce(
    (sum, node) => sum + (included.has(node.tileIndex) ? Math.max(0, node.items.tradeGood ?? 0) : 0),
    0
  );
}

function testPhysicalChainAndCheckout(): string {
  const state = scenario(76122);
  const display = displayOf(state);
  const stagedVisitors = state.visitors.splice(0);
  stockNode(state, display).items.tradeGood = 0;
  const initial = retailStockInChain(state);
  const soldBefore = state.usageTotals.tradeGoodsSold;
  const receivingBefore = marketChainStatus(state).receiving;
  let displayPeak = 0;
  advance(state, 70, () => {
    displayPeak = Math.max(displayPeak, stockNode(state, display).items.tradeGood ?? 0);
  });
  assert(displayPeak >= 0.95, 'the empty Cold Case was never physically restocked');
  state.visitors.push(...stagedVisitors);
  advance(state, 80, () => {
    displayPeak = Math.max(displayPeak, stockNode(state, display).items.tradeGood ?? 0);
  });
  const sold = state.usageTotals.tradeGoodsSold - soldBefore;
  const carried = state.crewMembers.reduce(
    (sum, crew) => sum + (crew.carryingItemType === 'tradeGood' ? crew.carryingAmount : 0),
    0
  );
  const remaining = retailStockInChain(state);
  assert(receivingBefore > marketChainStatus(state).receiving, 'receiving stock never entered the backroom chain');
  assert(sold >= 1, `no shopper browsed the Cold Case and completed checkout; chain=${JSON.stringify(marketChainStatus(state))}; fixtures=${JSON.stringify(state.moduleInstances.filter((module) => module.type === ModuleType.DisplayColdCase || module.type === ModuleType.CheckoutBank).map((module) => getMarketFixtureStatus(state, module.id)))}; visitors=${JSON.stringify(state.visitors.map((visitor) => ({ id: visitor.id, state: visitor.state, tile: visitor.tileIndex, service: visitor.activeService, target: visitor.reservedTargetTile, queue: visitor.queueProviderTile, blocked: visitor.movementWaitReason })))}; jobs=${JSON.stringify(state.jobs.map((job) => ({ type: job.type, state: job.state, from: job.fromTile, to: job.toTile, amount: job.amount, claimed: job.assignedCrewId, blocked: job.blockedReason })))}`);
  assert(
    Math.abs(initial - (remaining + carried + sold)) < 1.5,
    `trade goods were not conserved (${initial.toFixed(1)} -> ${remaining.toFixed(1)} stored + ${carried.toFixed(1)} carried + ${sold.toFixed(1)} sold)`
  );
  assert(state.serviceLog.visitorLifetimeByService.retail >= sold, 'checkout sales lack retail service completions');
  return `${initial.toFixed(0)} goods conserved · case restocked to ${displayPeak.toFixed(0)} · ${sold.toFixed(0)} checkout sales`;
}

function oneSaleGross(mix: keyof typeof SHELF_MIXES): { gross: number; at: number } {
  const state = scenario(76123);
  const display = displayOf(state);
  state.visitors = state.visitors.slice(0, 1);
  state.reservations = [];
  for (const module of state.moduleInstances) {
    if (module.type === ModuleType.BackroomStockBank || module.type === ModuleType.IntakePallet) {
      stockNode(state, module).items.tradeGood = 0;
    }
  }
  stockNode(state, display).items.tradeGood = 4;
  assert(setShelfMix(state, display.originTile, mix), `could not select ${mix} on the Cold Case`);
  const grossBefore = state.usageTotals.creditsTradeGoodsGross;
  const soldBefore = state.usageTotals.tradeGoodsSold;
  state.controls.paused = false;
  waitFor(state, `${mix} checkout`, () => state.usageTotals.tradeGoodsSold > soldBefore, 80);
  return { gross: state.usageTotals.creditsTradeGoodsGross - grossBefore, at: state.now };
}

function testAssortmentEconomics(): string {
  const essentials = oneSaleGross('essentials');
  const technical = oneSaleGross('technical');
  assert(essentials.gross > 0, 'essentials sale earned no gross revenue');
  assert(
    technical.gross > essentials.gross * 1.5,
    `technical mix did not earn its richer margin (${technical.gross.toFixed(2)} vs ${essentials.gross.toFixed(2)})`
  );
  assert(SHELF_MIXES.essentials.demandAppeal > SHELF_MIXES.technical.demandAppeal, 'mixes no longer trade appeal for margin');
  return `essentials ${essentials.gross.toFixed(2)}c vs technical ${technical.gross.toFixed(2)}c · appeal ${SHELF_MIXES.essentials.demandAppeal.toFixed(2)} vs ${SHELF_MIXES.technical.demandAppeal.toFixed(2)}`;
}

function testCuratedArtStates(): string {
  const state = scenario(76124);
  const display = displayOf(state);
  const expectedKeys = new Set([
    'module.display_cold_case',
    'module.display_cold_case.active',
    'module.display_cold_case.empty',
    'module.display_cold_case.dirty',
    'module.display_cold_case.damaged'
  ]);
  const has = (key: string): boolean => expectedKeys.has(key);
  assert(MODULE_SPRITE_KEYS[ModuleType.DisplayColdCase] === 'module.display_cold_case', 'base sprite mapping is missing');
  assert(
    FACILITY_SPRITE_VARIANTS[ModuleType.DisplayColdCase]?.join(',') === 'damaged,dirty,empty,active',
    'authored state manifest does not match the five curated Cold Case frames'
  );
  state.reservations = [];
  state.dirtByTile.fill(0);
  state.maintenanceDebts = state.maintenanceDebts.filter((debt) => debt.moduleId !== display.id);
  stockNode(state, display).items.tradeGood = 4;
  assert(facilitySpriteKeyForModule(state, display, has) === 'module.display_cold_case', 'stocked idle case did not select base art');

  const browse = slotsOnModule(state, display, 'browse')[0];
  const request = buildSlotReservationRequest({ ownerKind: 'visitor', ownerId: 89100, slot: browse });
  assert(request && tryCreateReservation(state, request).ok, 'could not claim a bay for active-art truth');
  assert(deriveFacilitySpriteTruth(state, display).active, 'claimed browse bay did not derive active truth');
  assert(facilitySpriteKeyForModule(state, display, has) === 'module.display_cold_case.active', 'active case did not select active art');

  stockNode(state, display).items.tradeGood = 0;
  assert(facilitySpriteKeyForModule(state, display, has) === 'module.display_cold_case.empty', 'empty case did not select empty art');
  state.dirtByTile[display.tiles[0]] = 40;
  assert(facilitySpriteKeyForModule(state, display, has) === 'module.display_cold_case.dirty', 'dirty case did not override empty art');
  state.maintenanceDebts.push({
    key: `module:${display.id}`,
    domain: 'module',
    anchorTile: display.originTile,
    moduleId: display.id,
    debt: 60,
    lastServicedAt: state.now
  });
  assert(facilitySpriteKeyForModule(state, display, has) === 'module.display_cold_case.damaged', 'damaged case did not override dirty art');
  const load = facilityOperatingLoad(ModuleType.DisplayColdCase);
  assert(load && load.powerDraw > 0 && load.inUseSoilPerPositionPerMin > load.idleSoilPerPositionPerMin, 'refrigeration/cleaning operating load is missing');
  return 'base + active + empty + dirty + damaged selected from live truth';
}

function testSelectionAndSaveRoundTrip(): string {
  const state = scenario(76125);
  const display = displayOf(state);
  stockNode(state, display).items.tradeGood = 7;
  assert(setShelfMix(state, display.tiles[2], 'technical'), 'selection setter did not resolve a non-origin footprint tile');
  assert(display.shelfMix === 'technical', 'fixture-local assortment did not update');
  const parsed = parseAndMigrateSave(serializeSave('Cold Case', state, 'test'));
  assert(parsed.ok, parsed.ok ? '' : parsed.error);
  const loaded = hydrateStateFromSave(parsed.save, { seed: 76125 }).state;
  const restored = displayOf(loaded);
  assert(restored.shelfMix === 'technical', 'assortment choice did not survive save/load');
  assert(restored.width === 3 && restored.height === 1 && restored.tiles.length === 3, 'saved footprint did not rebuild');
  assert((stockNode(loaded, restored).items.tradeGood ?? 0) === 7, 'physical display stock did not survive save/load');
  assert(getMarketFixtureStatus(loaded, restored.id)?.kind === 'shelf', 'hydrated case did not rejoin the market machine');
  return `technical mix + 7 goods durable on rebuilt ${restored.width}x${restored.height} case`;
}

function testAssortmentControlsReachable(): string {
  const view = (mix: 'essentials' | 'gifts' | 'technical'): TravelSuppliesShopView => ({
    stock: 7,
    capacity: 60,
    wholesaleUnitCost: 4,
    saleUnitPrice: 7,
    recentUnitsSold: 1,
    recentMargin: 3,
    demandLabel: 'Steady traffic',
    pricingPolicy: 'standard',
    canOrderStock: true,
    assortment: {
      fixtureLabel: 'Display Cold Case',
      mix,
      options: (Object.keys(SHELF_MIXES) as Array<keyof typeof SHELF_MIXES>).map((candidate) => ({
        mix: candidate,
        label: SHELF_MIXES[candidate].label,
        appealPercent: Math.round(SHELF_MIXES[candidate].demandAppeal * 100),
        marginPercent: Math.round(SHELF_MIXES[candidate].marginMultiplier * 100),
        satisfies: SHELF_MIXES[candidate].satisfies.join(' + ')
      }))
    }
  });
  const gifts = renderTravelSuppliesShop(view('gifts'));
  for (const mix of ['essentials', 'gifts', 'technical'] as const) {
    assert(gifts.includes(`data-oe-shelf-mix="${mix}"`), `${mix} is not reachable in the fixture-anchored Shop panel`);
  }
  assert(gifts.includes('data-oe-shelf-mix="gifts" aria-pressed="true"'), 'selected Gifts mix is not visibly pressed');
  const technical = renderTravelSuppliesShop(view('technical'));
  assert(technical.includes('data-oe-shelf-mix="technical" aria-pressed="true"'), 'pressed state did not move to Technical');
  assert(!renderTravelSuppliesShop({ ...view('essentials'), assortment: undefined }).includes('data-oe-shelf-mix='), 'generic market fixture panel shows a fake assortment control');
  return 'Essentials / Gifts / Technical rendered · pressed state follows fixture · generic chain fixtures omit assortment';
}

const checks = [
  ['footprint, rotation and exclusive bays', testFootprintRotationAndExclusiveBays],
  ['receiving to checkout conservation', testPhysicalChainAndCheckout],
  ['fixture-local assortment economics', testAssortmentEconomics],
  ['curated art state truth', testCuratedArtStates],
  ['selection and save/load', testSelectionAndSaveRoundTrip],
  ['fixture-anchored assortment controls', testAssortmentControlsReachable]
] as const;

let passed = 0;
for (const [name, run] of checks) {
  const evidence = run();
  passed += 1;
  console.log(`PASS ${name}: ${evidence}`);
}
console.log(`display-cold-case-tests: ${passed}/${checks.length} checks passed`);
