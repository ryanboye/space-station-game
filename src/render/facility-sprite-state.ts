import { ModuleType, fromIndex, type ModuleInstance, type StationState } from '../sim/types';
import { fixtureCapacityReport, barGroupAtTile, barGroupStatus } from '../sim/facility-machines';
import { facilityDescriptorFor } from '../sim/facility-descriptors';
import { getSanitationTileDiagnostic, itemStockAtNode } from '../sim/sim';
import { MODULE_SPRITE_KEYS } from './sprite-keys';

export type FacilitySpriteVariant = 'damaged' | 'dirty' | 'empty' | 'unstaffed' | 'active';

export interface FacilitySpriteTruth {
  damaged: boolean;
  dirty: boolean;
  empty: boolean;
  unstaffed: boolean;
  active: boolean;
}

/**
 * Only variants actually authored for each Gate F fixture, i.e. the frames that
 * exist in `tools/sprites/curated` and are gated by `required-keys-v1.json`.
 *
 * This is deliberately NOT the same thing as the set of conditions the
 * simulation can derive: `deriveFacilitySpriteTruth` reads live truth for every
 * fixture with a facility descriptor, and a fixture whose art has not been
 * drawn yet simply keeps its idle frame. Adding a variant here without shipping
 * the matching frame would make the fixture render idle while claiming the
 * state is depicted, so this list may only grow alongside real art.
 */
export const FACILITY_SPRITE_VARIANTS: Readonly<Partial<Record<ModuleType, readonly FacilitySpriteVariant[]>>> = {
  [ModuleType.BackroomStockBank]: ['damaged', 'dirty', 'empty'],
  [ModuleType.ServiceBar]: ['damaged', 'dirty', 'empty', 'unstaffed', 'active'],
  [ModuleType.BarCorner]: ['damaged', 'dirty', 'active'],
  [ModuleType.BarEnd]: ['damaged', 'dirty', 'active'],
  [ModuleType.BoothBank]: ['damaged', 'dirty', 'active'],
  [ModuleType.StandingRail]: ['damaged', 'dirty', 'active'],
  [ModuleType.ServingLine]: ['damaged', 'dirty', 'empty', 'unstaffed', 'active'],
  [ModuleType.CommunityTable]: ['damaged', 'dirty', 'active'],
  [ModuleType.GuestCabin]: ['damaged', 'dirty', 'active'],
  [ModuleType.ArrivalDesk]: ['damaged', 'dirty', 'unstaffed', 'active'],
  [ModuleType.WashBank]: ['damaged', 'dirty', 'active'],
  [ModuleType.CheckoutBank]: ['damaged', 'dirty', 'unstaffed', 'active'],
  [ModuleType.ShelfAisle]: ['damaged', 'dirty', 'empty', 'active'],
  [ModuleType.DisplayColdCase]: ['damaged', 'dirty', 'empty', 'active'],
  [ModuleType.BunkBank]: ['damaged', 'dirty', 'active']
};

/**
 * Evidence ledger for reachable conditions that still lack authored art.
 * Gate F is currently complete, so this stays empty until a new fixture state
 * is deliberately deferred.
 */
export const PENDING_FACILITY_SPRITE_FRAMES: Readonly<
  Partial<Record<ModuleType, readonly FacilitySpriteVariant[]>>
> = {};

const FACILITY_VARIANT_PRIORITY: readonly FacilitySpriteVariant[] = [
  'damaged',
  'dirty',
  'empty',
  'unstaffed',
  'active'
];

const EMPTY_TRUTH: FacilitySpriteTruth = {
  damaged: false,
  dirty: false,
  empty: false,
  unstaffed: false,
  active: false
};

/**
 * Pure priority selector. Unsupported conditions are skipped because the art
 * deliberately does not depict every condition on every fixture. A condition
 * whose frame is missing from the loaded atlas degrades to the next authored
 * condition that is actually present, and to idle only when nothing else is
 * true — a half-loaded atlas must never hide a state it can still draw.
 */
export function selectFacilitySpriteKey(
  moduleType: ModuleType,
  truth: FacilitySpriteTruth,
  isRegistered: (key: string) => boolean
): string {
  const baseKey = MODULE_SPRITE_KEYS[moduleType];
  const supported = FACILITY_SPRITE_VARIANTS[moduleType];
  if (!supported) return baseKey;
  for (const variant of FACILITY_VARIANT_PRIORITY) {
    if (!truth[variant] || !supported.includes(variant)) continue;
    const candidate = `${baseKey}.${variant}`;
    if (isRegistered(candidate)) return candidate;
  }
  return baseKey;
}

function isDirtyAtModule(state: StationState, module: ModuleInstance): boolean {
  const footprint = module.tiles.length > 0 ? module.tiles : [module.originTile];
  return footprint.some((tileIndex) => {
    const point = fromIndex(tileIndex, state.width);
    const diagnostic = getSanitationTileDiagnostic(state, point.x, point.y);
    return diagnostic?.severity === 'dirty' || diagnostic?.severity === 'filthy';
  });
}

function isDamagedModule(state: StationState, moduleId: number): boolean {
  // The renderer's failing tier mirrors the simulation's severe threshold.
  return state.maintenanceDebts.some((debt) => debt.moduleId === moduleId && debt.debt >= 60);
}

/**
 * Read the fixture's visual facts from authoritative production state.
 *
 * Scoped to fixtures that own a facility descriptor — that is exactly the Gate F
 * set — rather than to fixtures that happen to have art. A fixture is either a
 * real facility with real positions, in which case its condition is knowable, or
 * it is not a facility at all; whether an artist has drawn the condition yet is a
 * separate question answered by `FACILITY_SPRITE_VARIANTS`.
 */
export function deriveFacilitySpriteTruth(
  state: StationState,
  module: ModuleInstance
): FacilitySpriteTruth {
  if (!facilityDescriptorFor(module.type)) return EMPTY_TRUTH;
  const report = fixtureCapacityReport(state, module);
  let empty = false;
  let unstaffed = false;

  if (
    module.type === ModuleType.ServiceBar ||
    module.type === ModuleType.BarCorner ||
    module.type === ModuleType.BarEnd
  ) {
    const group = barGroupAtTile(state, module.originTile);
    if (group) {
      const status = barGroupStatus(state, group, 0);
      empty = status.stock < 0.16;
      unstaffed = group.staffSlots.length > 0 && status.staffedPositions <= 0;
    }
  } else if (module.type === ModuleType.BackroomStockBank) {
    empty = itemStockAtNode(state, module.originTile, 'tradeGood') < 0.95;
  } else if (module.type === ModuleType.ServingLine) {
    const servings = Math.min(
      itemStockAtNode(state, module.originTile, 'meal'),
      itemStockAtNode(state, module.originTile, 'cleanTray')
    );
    empty = servings < 0.95;
    unstaffed = (report?.staffSlots ?? 0) > 0 && (report?.staffed ?? 0) <= 0;
  } else if (module.type === ModuleType.ArrivalDesk) {
    unstaffed = (report?.staffSlots ?? 0) > 0 && (report?.staffed ?? 0) <= 0;
  } else if (module.type === ModuleType.CheckoutBank) {
    // Mirrors `marketChainStatus`'s 'no-staff' block, per register bank: a
    // Steward has to physically hold a checkout-staff position to open it, and
    // a shopper facing an unheld bank waits on 'market register unstaffed'.
    unstaffed = (report?.staffSlots ?? 0) > 0 && (report?.staffed ?? 0) <= 0;
  } else if (module.type === ModuleType.ShelfAisle || module.type === ModuleType.DisplayColdCase) {
    // The shelf is the only stock a shopper can actually buy from, and uses the
    // same threshold as the market chain's 'no-stock' block.
    empty = itemStockAtNode(state, module.originTile, 'tradeGood') < 0.95;
  }

  return {
    damaged: isDamagedModule(state, module.id),
    dirty: isDirtyAtModule(state, module),
    empty,
    unstaffed,
    active: (report?.publicInUse ?? 0) > 0
  };
}

/**
 * Null for anything that is not a Gate F fixture. A fixture whose condition has
 * no authored frame resolves to its own base key, which the overlay pass reads
 * as "nothing to redraw" — the idle art already sits in the cached decor layer.
 */
export function facilitySpriteKeyForModule(
  state: StationState,
  module: ModuleInstance,
  isRegistered: (key: string) => boolean
): string | null {
  if (!facilityDescriptorFor(module.type)) return null;
  return selectFacilitySpriteKey(module.type, deriveFacilitySpriteTruth(state, module), isRegistered);
}

/** Compact live-overlay selection seam; deliberately excluded from static decor caching. */
export function facilitySpriteRenderSignature(
  state: StationState,
  isRegistered: (key: string) => boolean
): string {
  return state.moduleInstances
    .filter((module) => FACILITY_SPRITE_VARIANTS[module.type] !== undefined)
    .map((module) => `${module.id}:${facilitySpriteKeyForModule(state, module, isRegistered) ?? ''}`)
    .join('|');
}
