// Focused Gate F renderer-state runner.
// Run with `npm run test:facility-sprite-state`.

import { applyColdStartScenario } from '../src/sim/cold-start-scenarios';
import {
  FACILITY_SPRITE_VARIANTS,
  PENDING_FACILITY_SPRITE_FRAMES,
  deriveFacilitySpriteTruth,
  facilitySpriteKeyForModule,
  facilitySpriteRenderSignature,
  selectFacilitySpriteKey,
  type FacilitySpriteTruth,
  type FacilitySpriteVariant
} from '../src/render/facility-sprite-state';
import { MODULE_SPRITE_KEYS } from '../src/render/sprite-keys';
import { decorativeLayerCacheKey } from '../src/render/render';
import { barGroupAtTile } from '../src/sim/facility-machines';
import { FACILITY_FIXTURE_DESCRIPTORS } from '../src/sim/facility-descriptors';
import { buildSlotReservationRequest, slotsOnModule, type FacilitySlotTarget } from '../src/sim/facility-slots';
import { createInitialState, tick, tryCreateReservation } from '../src/sim/sim';
import { ModuleType, type ModuleInstance, type StationState } from '../src/sim/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const VARIANTS: readonly FacilitySpriteVariant[] = ['damaged', 'dirty', 'empty', 'unstaffed', 'active'];
const CLEAR: FacilitySpriteTruth = { damaged: false, dirty: false, empty: false, unstaffed: false, active: false };

function truthFor(variant: FacilitySpriteVariant): FacilitySpriteTruth {
  return { ...CLEAR, [variant]: true };
}

function registeredKeys(): Set<string> {
  const keys = new Set<string>();
  for (const [rawType, variants] of Object.entries(FACILITY_SPRITE_VARIANTS)) {
    const moduleType = rawType as ModuleType;
    const base = MODULE_SPRITE_KEYS[moduleType];
    keys.add(base);
    for (const variant of variants ?? []) keys.add(`${base}.${variant}`);
  }
  return keys;
}

function testCuratedMatrix(): string {
  const registered = registeredKeys();
  assert(registered.size === 68, `Expected all 68 curated facility base/state frames, got ${registered.size}.`);
  const has = (key: string): boolean => registered.has(key);
  let checked = 0;
  for (const [rawType, supported] of Object.entries(FACILITY_SPRITE_VARIANTS)) {
    const moduleType = rawType as ModuleType;
    const base = MODULE_SPRITE_KEYS[moduleType];
    assert(selectFacilitySpriteKey(moduleType, CLEAR, has) === base, `${moduleType} idle must use its base frame.`);
    checked += 1;
    for (const variant of supported ?? []) {
      const selected = selectFacilitySpriteKey(moduleType, truthFor(variant), has);
      assert(selected === `${base}.${variant}`, `${moduleType} ${variant} selected ${selected}.`);
      checked += 1;
    }
  }
  assert(checked === 68, `Expected to exercise 68 curated frames, exercised ${checked}.`);
  return `PASS curated fixture matrix (${checked}/68 frames)`;
}

function testPriorityAndFallback(): string {
  const registered = registeredKeys();
  const has = (key: string): boolean => registered.has(key);
  const all: FacilitySpriteTruth = { damaged: true, dirty: true, empty: true, unstaffed: true, active: true };
  assert(
    selectFacilitySpriteKey(ModuleType.ServiceBar, all, has).endsWith('.damaged'),
    'Service Bar priority must be damaged > dirty > empty > unstaffed > active.'
  );
  assert(
    selectFacilitySpriteKey(ModuleType.StandingRail, all, has).endsWith('.damaged'),
    'Standing Rail damage must use the authored damaged state.'
  );
  const missingActive = new Set(registered);
  missingActive.delete('module.booth_bank.active');
  assert(
    selectFacilitySpriteKey(ModuleType.BoothBank, truthFor('active'), (key) => missingActive.has(key)) === 'module.booth_bank',
    'An authored state missing from the loaded atlas must safely fall back to idle.'
  );
  const missingDirty = new Set(registered);
  missingDirty.delete('module.booth_bank.dirty');
  assert(
    selectFacilitySpriteKey(
      ModuleType.BoothBank,
      { ...CLEAR, dirty: true, active: true },
      (key) => missingDirty.has(key)
    ) === 'module.booth_bank.active',
    'A missing higher-priority frame must degrade to the next drawable state, not hide an occupied fixture.'
  );
  assert(
    selectFacilitySpriteKey(ModuleType.Table, all, has) === MODULE_SPRITE_KEYS[ModuleType.Table],
    'A non-Gate-F fixture must retain its ordinary base key.'
  );
  return 'PASS deterministic priority and missing-frame fallback';
}

/** Pending art remains an explicit checked manifest even when the ledger is closed. */
function testPendingArtManifest(): string {
  let pending = 0;
  for (const [rawType, variants] of Object.entries(PENDING_FACILITY_SPRITE_FRAMES)) {
    const moduleType = rawType as ModuleType;
    const descriptor = FACILITY_FIXTURE_DESCRIPTORS[moduleType];
    assert(descriptor, `${moduleType} must be a Gate F fixture to appear in the pending art manifest.`);
    assert(
      descriptor.publicUseFace !== null,
      `${moduleType} is listed as needing occupied art but declares no public use face.`
    );
    assert(
      FACILITY_SPRITE_VARIANTS[moduleType] === undefined,
      `${moduleType} has authored art; move its states out of the pending manifest.`
    );
    assert((variants ?? []).includes('active'), `${moduleType} owns public positions, so it must want occupied art.`);
    pending += (variants ?? []).length;
  }
  assert(pending === 0, `Expected the Gate F art manifest to be closed, but it lists ${pending} frames.`);
  return `PASS pending art manifest (${pending} frames outstanding, 68 authored)`;
}

function cantinaState(): StationState {
  const state = createInitialState({ seed: 91811, physicalStarterInventory: true, manualTrafficAdmission: true });
  assert(applyColdStartScenario(state, 'cantina-expanded'), 'Expected cantina-expanded scenario.');
  tick(state, 0);
  return state;
}

function scenarioState(scenario: string): StationState {
  const state = createInitialState({ seed: 91811, physicalStarterInventory: true, manualTrafficAdmission: true });
  assert(applyColdStartScenario(state, scenario), `Expected ${scenario} scenario.`);
  tick(state, 0);
  return state;
}

function moduleOfType(state: StationState, type: ModuleType): ModuleInstance {
  const module = state.moduleInstances.find((candidate) => candidate.type === type);
  assert(module, `Scenario must include a ${type}.`);
  return module;
}

/**
 * The three frontage fixtures that own real public positions now also own
 * authored state art. Their condition must derive from production truth and
 * select the corresponding curated frame without changing slot geometry.
 */
function testFrontageStateTruth(): string {
  const keys = registeredKeys();
  const has = (key: string): boolean => keys.has(key);
  const market = scenarioState('market-improved-flow');
  const checkout = moduleOfType(market, ModuleType.CheckoutBank);
  const shelf = moduleOfType(market, ModuleType.ShelfAisle);
  clearClaims(market);

  assert(
    deriveFacilitySpriteTruth(market, checkout).unstaffed,
    'A register bank nobody is holding open must derive unstaffed truth.'
  );
  const staffSlots = slotsOnModule(market, checkout, 'checkout-staff');
  assert(staffSlots.length === 2, `Checkout Bank must declare two staff positions, found ${staffSlots.length}.`);
  claim(market, staffSlots[0], 'crew', 75001);
  assert(
    !deriveFacilitySpriteTruth(market, checkout).unstaffed,
    'A Steward physically holding one register must clear unstaffed truth.'
  );
  assert(!deriveFacilitySpriteTruth(market, checkout).active, 'An open but empty register is not in service.');
  claim(market, slotsOnModule(market, checkout, 'checkout')[0], 'visitor', 76001);
  assert(deriveFacilitySpriteTruth(market, checkout).active, 'A shopper at the counter must derive in-service truth.');
  assert(
    facilitySpriteKeyForModule(market, checkout, has) === 'module.checkout_bank.active',
    'An occupied Checkout Bank must select its active frame.'
  );
  market.maintenanceDebts.push({
    key: `module:${checkout.id}`,
    domain: 'module',
    anchorTile: checkout.originTile,
    moduleId: checkout.id,
    debt: 60,
    lastServicedAt: market.now
  });
  assert(
    facilitySpriteKeyForModule(market, checkout, has) === 'module.checkout_bank.damaged',
    'Severe Checkout Bank debt must override occupancy with the damaged frame.'
  );

  const shelfNode = market.itemNodes.find((candidate) => candidate.tileIndex === shelf.originTile);
  assert(shelfNode, 'Shelf Aisle must own a stock node.');
  assert(!deriveFacilitySpriteTruth(market, shelf).empty, 'A stocked shelf must not derive empty truth.');
  shelfNode.items.tradeGood = 0;
  assert(deriveFacilitySpriteTruth(market, shelf).empty, 'A shelf with nothing to buy must derive empty truth.');
  shelfNode.items.tradeGood = 6;
  assert(!deriveFacilitySpriteTruth(market, shelf).empty, 'Restocking the shelf must clear empty truth.');
  claim(market, slotsOnModule(market, shelf, 'browse')[0], 'visitor', 76002);
  assert(deriveFacilitySpriteTruth(market, shelf).active, 'A shopper browsing must derive in-service truth.');
  market.dirtByTile[shelf.tiles[0]] = 40;
  assert(deriveFacilitySpriteTruth(market, shelf).dirty, 'Sanitation dirt on the aisle must derive dirty truth.');
  assert(
    facilitySpriteKeyForModule(market, shelf, has) === 'module.shelf_aisle.dirty',
    'A dirty Shelf Aisle must select its dirty frame.'
  );
  market.maintenanceDebts.push({
    key: `module:${shelf.id}`,
    domain: 'module',
    anchorTile: shelf.originTile,
    moduleId: shelf.id,
    debt: 60,
    lastServicedAt: market.now
  });
  assert(
    facilitySpriteKeyForModule(market, shelf, has) === 'module.shelf_aisle.damaged',
    'Severe Shelf Aisle debt must override dirt and occupancy with the damaged frame.'
  );

  const wing = scenarioState('long-stay-guest-wing');
  const bunks = moduleOfType(wing, ModuleType.BunkBank);
  clearClaims(wing);
  assert(!deriveFacilitySpriteTruth(wing, bunks).active, 'An unclaimed bunk bank is idle.');
  const beds = slotsOnModule(wing, bunks, 'temporary-sleep');
  assert(beds.length === 4, `Bunk Bank must declare four sleeping positions, found ${beds.length}.`);
  claim(wing, beds[0], 'visitor', 77001);
  assert(deriveFacilitySpriteTruth(wing, bunks).active, 'A claimed bunk must derive occupied truth.');
  assert(
    facilitySpriteKeyForModule(wing, bunks, has) === 'module.bunk_bank.active',
    'An occupied Bunk Bank must select its active frame.'
  );
  wing.maintenanceDebts.push({
    key: `module:${bunks.id}`,
    domain: 'module',
    anchorTile: bunks.originTile,
    moduleId: bunks.id,
    debt: 60,
    lastServicedAt: wing.now
  });
  assert(
    facilitySpriteKeyForModule(wing, bunks, has) === 'module.bunk_bank.damaged',
    'Severe Bunk Bank debt must override occupancy with the damaged frame.'
  );
  return 'PASS frontage art derives and selects occupied, unstaffed, empty, and dirty truth';
}

function clearClaims(state: StationState): void {
  for (const reservation of state.reservations) reservation.releaseReason = 'cleared';
}

function claim(
  state: StationState,
  slot: FacilitySlotTarget,
  ownerKind: 'crew' | 'visitor',
  ownerId: number
): void {
  const request = buildSlotReservationRequest({ ownerKind, ownerId, slot });
  assert(request && tryCreateReservation(state, request).ok, `Expected ${ownerKind} to claim ${slot.id}.`);
}

function testProductionTruthClears(): string {
  const state = cantinaState();
  const module = state.moduleInstances.find((candidate) => candidate.type === ModuleType.ServiceBar);
  assert(module, 'Expanded cantina must include a Service Bar.');
  const group = barGroupAtTile(state, module.originTile);
  assert(group, 'Service Bar must belong to a connected run.');
  const keys = registeredKeys();
  const has = (key: string): boolean => keys.has(key);
  const geometryBefore = JSON.stringify({
    originTile: module.originTile,
    rotation: module.rotation,
    width: module.width,
    height: module.height,
    tiles: module.tiles
  });

  clearClaims(state);
  for (const tile of group.stockTiles) {
    const node = state.itemNodes.find((candidate) => candidate.tileIndex === tile);
    assert(node, `Bar stock node ${tile} must exist.`);
    node.items.rawMaterial = 4;
  }
  for (const tile of module.tiles) state.dirtByTile[tile] = 0;
  state.maintenanceDebts = state.maintenanceDebts.filter((debt) => debt.moduleId !== module.id);

  assert(deriveFacilitySpriteTruth(state, module).unstaffed, 'A physically unstaffed bar must derive unstaffed truth.');
  assert(facilitySpriteKeyForModule(state, module, has)?.endsWith('.unstaffed'), 'Unstaffed bar must use unstaffed frame.');

  claim(state, group.staffSlots[0], 'crew', 71001);
  assert(facilitySpriteKeyForModule(state, module, has) === 'module.service_bar', 'Staffing the idle bar must clear unstaffed art.');

  const idleDecorativeKey = decorativeLayerCacheKey(state, true, 'test-atlas');
  const idleOverlaySignature = facilitySpriteRenderSignature(state, has);
  claim(state, group.guestSlots.find((slot) => slot.moduleId === module.id) ?? group.guestSlots[0], 'visitor', 72001);
  const activeSignature = facilitySpriteRenderSignature(state, has);
  assert(facilitySpriteKeyForModule(state, module, has)?.endsWith('.active'), 'A physical guest claim must select active art.');
  assert(activeSignature !== idleOverlaySignature, 'A guest claim must change the live facility overlay selection.');
  assert(
    decorativeLayerCacheKey(state, true, 'test-atlas') === idleDecorativeKey,
    'A guest claim must not invalidate the cached decorative layer.'
  );
  clearClaims(state);
  claim(state, group.staffSlots[0], 'crew', 71002);
  assert(facilitySpriteKeyForModule(state, module, has) === 'module.service_bar', 'Releasing the guest claim must clear active art.');
  assert(facilitySpriteRenderSignature(state, has) !== activeSignature, 'Cache signature must change when active production truth clears.');

  for (const tile of group.stockTiles) state.itemNodes.find((candidate) => candidate.tileIndex === tile)!.items.rawMaterial = 0;
  assert(facilitySpriteKeyForModule(state, module, has)?.endsWith('.empty'), 'Draining pooled bar stock must select empty art.');
  state.itemNodes.find((candidate) => candidate.tileIndex === group.stockTiles[0])!.items.rawMaterial = 4;
  assert(facilitySpriteKeyForModule(state, module, has) === 'module.service_bar', 'Restocking must clear empty art.');

  state.dirtByTile[module.tiles[0]] = 40;
  assert(facilitySpriteKeyForModule(state, module, has)?.endsWith('.dirty'), 'Production sanitation dirt must select dirty art.');
  state.dirtByTile[module.tiles[0]] = 0;
  assert(facilitySpriteKeyForModule(state, module, has) === 'module.service_bar', 'Cleaning the footprint must clear dirty art.');

  state.maintenanceDebts.push({
    key: `module:${module.id}`,
    domain: 'module',
    anchorTile: module.originTile,
    moduleId: module.id,
    debt: 60,
    lastServicedAt: state.now
  });
  assert(facilitySpriteKeyForModule(state, module, has)?.endsWith('.damaged'), 'Severe module debt must select damaged art.');
  state.maintenanceDebts[state.maintenanceDebts.length - 1].debt = 59.9;
  assert(facilitySpriteKeyForModule(state, module, has) === 'module.service_bar', 'Repair below severe debt must clear damaged art.');

  const geometryAfter = JSON.stringify({
    originTile: module.originTile,
    rotation: module.rotation,
    width: module.width,
    height: module.height,
    tiles: module.tiles
  });
  assert(geometryAfter === geometryBefore, 'State selection must not mutate rotation or footprint geometry.');
  return 'PASS production transitions, live-overlay cache isolation, and geometry preservation';
}

const results = [
  testCuratedMatrix(),
  testPendingArtManifest(),
  testPriorityAndFallback(),
  testProductionTruthClears(),
  testFrontageStateTruth()
];
for (const result of results) console.log(result);
console.log(`PASS facility sprite state (${results.length}/${results.length})`);
