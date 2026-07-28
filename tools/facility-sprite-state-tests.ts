// Focused Gate F renderer-state runner.
// Run with `npm run test:facility-sprite-state`.

import { applyColdStartScenario } from '../src/sim/cold-start-scenarios';
import {
  FACILITY_SPRITE_VARIANTS,
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
import { buildSlotReservationRequest, type FacilitySlotTarget } from '../src/sim/facility-slots';
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
  assert(registered.size === 46, `Expected all 46 Gate F base/state frames, got ${registered.size}.`);
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
  assert(checked === 46, `Expected to exercise 46 curated frames, exercised ${checked}.`);
  return `PASS curated fixture matrix (${checked}/46 frames)`;
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
    selectFacilitySpriteKey(ModuleType.StandingRail, all, has).endsWith('.dirty'),
    'Unsupported damaged state must advance to the highest authored Standing Rail state.'
  );
  const missingActive = new Set(registered);
  missingActive.delete('module.booth_bank.active');
  assert(
    selectFacilitySpriteKey(ModuleType.BoothBank, truthFor('active'), (key) => missingActive.has(key)) === 'module.booth_bank',
    'An authored state missing from the loaded atlas must safely fall back to idle.'
  );
  assert(
    selectFacilitySpriteKey(ModuleType.Table, all, has) === MODULE_SPRITE_KEYS[ModuleType.Table],
    'A non-Gate-F fixture must retain its ordinary base key.'
  );
  return 'PASS deterministic priority and missing-frame fallback';
}

function cantinaState(): StationState {
  const state = createInitialState({ seed: 91811, physicalStarterInventory: true, manualTrafficAdmission: true });
  assert(applyColdStartScenario(state, 'cantina-expanded'), 'Expected cantina-expanded scenario.');
  tick(state, 0);
  return state;
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

const results = [testCuratedMatrix(), testPriorityAndFallback(), testProductionTruthClears()];
for (const result of results) console.log(result);
console.log(`PASS facility sprite state (${results.length}/${results.length})`);
