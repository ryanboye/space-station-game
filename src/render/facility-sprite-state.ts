import { ModuleType, fromIndex, type ModuleInstance, type StationState } from '../sim/types';
import { fixtureCapacityReport, barGroupAtTile, barGroupStatus } from '../sim/facility-machines';
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

/** Only variants actually authored for each Gate F fixture. */
export const FACILITY_SPRITE_VARIANTS: Readonly<Partial<Record<ModuleType, readonly FacilitySpriteVariant[]>>> = {
  [ModuleType.BackroomStockBank]: ['damaged', 'dirty', 'empty'],
  [ModuleType.ServiceBar]: ['damaged', 'dirty', 'empty', 'unstaffed', 'active'],
  [ModuleType.BarCorner]: ['damaged', 'dirty', 'active'],
  [ModuleType.BarEnd]: ['damaged', 'dirty', 'active'],
  [ModuleType.BoothBank]: ['damaged', 'dirty', 'active'],
  [ModuleType.StandingRail]: ['dirty', 'active'],
  [ModuleType.ServingLine]: ['damaged', 'dirty', 'empty', 'unstaffed', 'active'],
  [ModuleType.CommunityTable]: ['damaged', 'dirty', 'active'],
  [ModuleType.GuestCabin]: ['dirty', 'active'],
  [ModuleType.ArrivalDesk]: ['dirty', 'unstaffed', 'active'],
  [ModuleType.WashBank]: ['damaged', 'dirty', 'active']
};

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
 * deliberately does not depict every condition on every fixture. Once an
 * authored condition wins, a missing atlas frame safely falls back to idle.
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
    return isRegistered(candidate) ? candidate : baseKey;
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

/** Read the fixture's visual facts from authoritative production state. */
export function deriveFacilitySpriteTruth(
  state: StationState,
  module: ModuleInstance
): FacilitySpriteTruth {
  if (!FACILITY_SPRITE_VARIANTS[module.type]) return EMPTY_TRUTH;
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
  }

  return {
    damaged: isDamagedModule(state, module.id),
    dirty: isDirtyAtModule(state, module),
    empty,
    unstaffed,
    active: (report?.publicInUse ?? 0) > 0
  };
}

export function facilitySpriteKeyForModule(
  state: StationState,
  module: ModuleInstance,
  isRegistered: (key: string) => boolean
): string | null {
  if (!FACILITY_SPRITE_VARIANTS[module.type]) return null;
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
