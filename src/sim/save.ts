import {
  createInitialState,
  setBerthAllowedShipSize,
  setBerthAllowedShipType,
  setDockAllowedShipSize,
  setDockAllowedShipType,
  setDockFacing,
  setDockPurpose,
  tick,
  tryPlaceModule
} from './sim';
import {
  type DockPurpose,
  type HousingPolicy,
  type ItemType,
  type UnlockId,
  type UnlockTier,
  ModuleType,
  type ModuleRotation,
  RoomType,
  type ShipSize,
  type ShipType,
  type SpaceLane,
  TileType,
  type StationState,
  type VisitorArchetype,
  ZoneType
} from './types';
import { MODULE_UNLOCK_TIER, ROOM_UNLOCK_TIER, UNLOCK_DEFINITIONS } from './content/unlocks';

const SAVE_SCHEMA_VERSION = 2 as const;
const ITEM_TYPES: ItemType[] = ['rawMeal', 'meal', 'rawMaterial', 'tradeGood', 'body'];
const VISITOR_ARCHETYPES: readonly VisitorArchetype[] = ['diner', 'shopper', 'lounger', 'rusher'];
const SHIP_TYPES: ShipType[] = ['tourist', 'trader', 'industrial', 'military', 'colonist'];
const SHIP_SIZES: ShipSize[] = ['small', 'medium', 'large'];
const SPACE_LANES: SpaceLane[] = ['north', 'east', 'south', 'west'];
const HOUSING_POLICIES: HousingPolicy[] = ['crew', 'visitor', 'resident', 'private_resident'];
// Derived from UNLOCK_DEFINITIONS so adding a 7th tier doesn't require
// hand-editing two parallel tables. UNLOCK_DEFINITIONS is tier-ordered
// (1..6), so the canonical id list is just .map(d => d.id), and the
// per-tier prefix slice gives the cumulative ids unlocked at that tier.
const UNLOCK_IDS: UnlockId[] = UNLOCK_DEFINITIONS.map((d) => d.id);
const UNLOCK_IDS_BY_TIER: Record<UnlockTier, UnlockId[]> = {
  0: [],
  1: UNLOCK_IDS.slice(0, 1),
  2: UNLOCK_IDS.slice(0, 2),
  3: UNLOCK_IDS.slice(0, 3),
  4: UNLOCK_IDS.slice(0, 4),
  5: UNLOCK_IDS.slice(0, 5),
  6: UNLOCK_IDS.slice(0, 6)
};

export interface StationSnapshotV1 {
  width: number;
  height: number;
  tiles: TileType[];
  zones: ZoneType[];
  rooms: RoomType[];
  roomHousingPolicies: HousingPolicy[];
  modules: Array<{
    type: ModuleType;
    originTile: number;
    rotation: ModuleRotation;
  }>;
  dockConfigs: Array<{
    anchorTile: number;
    purpose: DockPurpose;
    facing: SpaceLane;
    allowedShipTypes: ShipType[];
    allowedShipSizes: ShipSize[];
  }>;
  // Optional on the wire — older saves predate this slot. Empty array
  // on missing → existing berth-cluster picks default-all on load.
  berthConfigs?: Array<{
    anchorTile: number;
    allowedShipTypes: ShipType[];
    allowedShipSizes: ShipSize[];
  }>;
  resources: {
    credits: number;
    waterStock: number;
    airQuality: number;
    legacyMaterialStock: number;
  };
  crew: {
    total: number;
  };
  inventoryByTile: Array<{
    tileIndex: number;
    items: Partial<Record<ItemType, number>>;
  }>;
  controls: {
    shipsPerCycle: number;
    taxRate: number;
  };
  unlocks: {
    tier: UnlockTier;
    unlockedIds: UnlockId[];
    unlockedAtSec: Partial<Record<UnlockId, number>>;
  };
  progression: {
    // Lifetime counters + the archetype-seen set that feed predicate-
    // driven tier advances. Must survive save/load; without them a
    // reload at T1 sees archetypesServedLifetime=0 and the T2 gate is
    // permanently stuck.
    mealsServedTotal: number;
    creditsEarnedLifetime: number;
    tradeCyclesCompletedLifetime: number;
    incidentsResolvedLifetime: number;
    actorsTreatedLifetime: number;
    residentsConvertedLifetime: number;
    archetypesEverSeen: Partial<Record<VisitorArchetype, boolean>>;
  };
}

export interface StationSaveEnvelopeV1 {
  schemaVersion: number;
  gameVersion: string;
  createdAt: string;
  name: string;
  snapshot: StationSnapshotV1;
}

type ParseSuccess = {
  ok: true;
  save: StationSaveEnvelopeV1;
  warnings: string[];
};

type ParseFailure = {
  ok: false;
  error: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && allowed.includes(value as T);
}

function defaultHousingPolicyForRoom(room: RoomType): HousingPolicy {
  return room === RoomType.Dorm || room === RoomType.Hygiene ? 'crew' : 'visitor';
}

function isHousingAllowedForRoom(room: RoomType, policy: HousingPolicy): boolean {
  if (room === RoomType.Dorm || room === RoomType.Hygiene) return true;
  return policy === 'visitor';
}

function normalizeGridEnumArray<T extends string>(
  value: unknown,
  expectedLength: number,
  allowed: readonly T[],
  fallbackValue: T,
  warnings: string[],
  label: string
): T[] {
  const out = new Array<T>(expectedLength).fill(fallbackValue);
  if (!Array.isArray(value)) {
    warnings.push(`${label} missing; defaulted.`);
    return out;
  }
  const len = Math.min(expectedLength, value.length);
  for (let i = 0; i < len; i++) {
    const v = value[i];
    if (isOneOf(v, allowed)) {
      out[i] = v;
    } else {
      warnings.push(`${label}[${i}] invalid; defaulted.`);
    }
  }
  if (value.length !== expectedLength) {
    warnings.push(`${label} length ${value.length} does not match expected ${expectedLength}; adjusted.`);
  }
  return out;
}

function maxUnlockTier(a: UnlockTier, b: UnlockTier): UnlockTier {
  return (a >= b ? a : b) as UnlockTier;
}

function normalizeUnlockTier(value: number): UnlockTier {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(6, Math.floor(value))) as UnlockTier;
}

function requiredUnlockTierForSnapshotContent(
  rooms: RoomType[],
  modules: StationSnapshotV1['modules'],
  dockConfigs: StationSnapshotV1['dockConfigs']
): UnlockTier {
  // Walks saved content to derive the MIN tier that could have produced
  // it, used to elevate a demoted/hand-edited save. Early-outs at tier 6
  // (the ceiling) so content lands at T4-T6 don't silently cap at 3.
  let required: UnlockTier = 0;
  for (const room of rooms) {
    required = maxUnlockTier(required, ROOM_UNLOCK_TIER[room] ?? 0);
    if (required === 6) break;
  }
  if (required < 6) {
    for (const module of modules) {
      required = maxUnlockTier(required, MODULE_UNLOCK_TIER[module.type] ?? 0);
      if (required === 6) break;
    }
  }
  if (required < 6) {
    for (const dock of dockConfigs) {
      for (const shipType of dock.allowedShipTypes) {
        const shipTier: UnlockTier = shipType === 'industrial' ? 2 : shipType === 'military' || shipType === 'colonist' ? 3 : 0;
        required = maxUnlockTier(required, shipTier);
        if (required === 6) break;
      }
      if (required === 6) break;
    }
  }
  return required;
}

export function captureSnapshot(state: StationState): StationSnapshotV1 {
  const inventoryByTile: StationSnapshotV1['inventoryByTile'] = [];
  for (const node of state.itemNodes) {
    const items: Partial<Record<ItemType, number>> = {};
    let hasAny = false;
    for (const itemType of ITEM_TYPES) {
      const amount = node.items[itemType] ?? 0;
      if (amount > 0.0001) {
        items[itemType] = amount;
        hasAny = true;
      }
    }
    if (hasAny) {
      inventoryByTile.push({
        tileIndex: node.tileIndex,
        items
      });
    }
  }

  return {
    width: state.width,
    height: state.height,
    tiles: state.tiles.slice(),
    zones: state.zones.slice(),
    rooms: state.rooms.slice(),
    roomHousingPolicies: state.roomHousingPolicies.slice(),
    modules: state.moduleInstances
      .map((module) => ({
        type: module.type,
        originTile: module.originTile,
        rotation: module.rotation
      }))
      .sort((a, b) => a.originTile - b.originTile || a.type.localeCompare(b.type)),
    dockConfigs: state.docks
      .map((dock) => ({
        anchorTile: dock.anchorTile,
        purpose: dock.purpose,
        facing: dock.facing,
        allowedShipTypes: [...dock.allowedShipTypes],
        allowedShipSizes: [...dock.allowedShipSizes]
      }))
      .sort((a, b) => a.anchorTile - b.anchorTile),
    berthConfigs: state.berthConfigs
      .map((cfg) => ({
        anchorTile: cfg.anchorTile,
        allowedShipTypes: [...cfg.allowedShipTypes],
        allowedShipSizes: [...cfg.allowedShipSizes]
      }))
      .sort((a, b) => a.anchorTile - b.anchorTile),
    resources: {
      credits: state.metrics.credits,
      waterStock: state.metrics.waterStock,
      airQuality: state.metrics.airQuality,
      legacyMaterialStock: state.legacyMaterialStock
    },
    crew: {
      total: state.crew.total
    },
    inventoryByTile,
    controls: {
      shipsPerCycle: state.controls.shipsPerCycle,
      taxRate: state.controls.taxRate
    },
    unlocks: {
      tier: state.unlocks.tier,
      unlockedIds: [...state.unlocks.unlockedIds],
      unlockedAtSec: { ...state.unlocks.unlockedAtSec }
    },
    progression: {
      mealsServedTotal: state.metrics.mealsServedTotal,
      creditsEarnedLifetime: state.metrics.creditsEarnedLifetime,
      tradeCyclesCompletedLifetime: state.metrics.tradeCyclesCompletedLifetime,
      incidentsResolvedLifetime: state.metrics.incidentsResolvedLifetime,
      actorsTreatedLifetime: state.metrics.actorsTreatedLifetime,
      residentsConvertedLifetime: state.metrics.residentsConvertedLifetime,
      archetypesEverSeen: { ...state.usageTotals.archetypesEverSeen }
    }
  };
}

export function serializeSave(name: string, state: StationState, gameVersion: string): string {
  const payload: StationSaveEnvelopeV1 = {
    schemaVersion: SAVE_SCHEMA_VERSION,
    gameVersion,
    createdAt: new Date().toISOString(),
    name,
    snapshot: captureSnapshot(state)
  };
  return JSON.stringify(payload);
}

function normalizeSnapshot(snapshotRaw: Record<string, unknown>, warnings: string[]): StationSnapshotV1 | null {
  const defaultState = createInitialState();
  const width = Math.round(asFiniteNumber(snapshotRaw.width, defaultState.width));
  const height = Math.round(asFiniteNumber(snapshotRaw.height, defaultState.height));
  const expectedLength = width * height;
  if (!Array.isArray(snapshotRaw.tiles)) {
    return null;
  }

  const tiles = normalizeGridEnumArray(
    snapshotRaw.tiles,
    expectedLength,
    Object.values(TileType),
    TileType.Space,
    warnings,
    'tiles'
  );
  const zones = normalizeGridEnumArray(
    snapshotRaw.zones,
    expectedLength,
    Object.values(ZoneType),
    ZoneType.Public,
    warnings,
    'zones'
  );
  const rooms = normalizeGridEnumArray(
    snapshotRaw.rooms,
    expectedLength,
    Object.values(RoomType),
    RoomType.None,
    warnings,
    'rooms'
  );

  const roomHousingPolicies = new Array<HousingPolicy>(expectedLength).fill('visitor');
  if (Array.isArray(snapshotRaw.roomHousingPolicies)) {
    const len = Math.min(expectedLength, snapshotRaw.roomHousingPolicies.length);
    for (let i = 0; i < len; i++) {
      const room = rooms[i];
      const fallback = defaultHousingPolicyForRoom(room);
      const value = snapshotRaw.roomHousingPolicies[i];
      if (isOneOf(value, HOUSING_POLICIES) && isHousingAllowedForRoom(room, value)) {
        roomHousingPolicies[i] = value;
      } else {
        roomHousingPolicies[i] = fallback;
        warnings.push(`roomHousingPolicies[${i}] invalid for room ${room}; defaulted.`);
      }
    }
    if (snapshotRaw.roomHousingPolicies.length !== expectedLength) {
      warnings.push(
        `roomHousingPolicies length ${snapshotRaw.roomHousingPolicies.length} does not match expected ${expectedLength}; adjusted.`
      );
    }
  } else {
    for (let i = 0; i < expectedLength; i++) {
      roomHousingPolicies[i] = defaultHousingPolicyForRoom(rooms[i]);
    }
    warnings.push('roomHousingPolicies missing; defaulted from room types.');
  }

  const modules: StationSnapshotV1['modules'] = [];
  if (Array.isArray(snapshotRaw.modules)) {
    for (let i = 0; i < snapshotRaw.modules.length; i++) {
      const entry = snapshotRaw.modules[i];
      if (!isRecord(entry)) {
        warnings.push(`modules[${i}] invalid; skipped.`);
        continue;
      }
      const type = entry.type;
      const originTile = Math.floor(asFiniteNumber(entry.originTile, -1));
      const rawRotation = Math.round(asFiniteNumber(entry.rotation, 0));
      if (!isOneOf(type, Object.values(ModuleType)) || type === ModuleType.None) {
        warnings.push(`modules[${i}] has invalid type; skipped.`);
        continue;
      }
      if (originTile < 0 || originTile >= expectedLength) {
        warnings.push(`modules[${i}] has out-of-range originTile; skipped.`);
        continue;
      }
      const rotation: ModuleRotation = rawRotation === 90 ? 90 : 0;
      if (rawRotation !== 0 && rawRotation !== 90) {
        warnings.push(`modules[${i}] has unsupported rotation ${rawRotation}; defaulted to ${rotation}.`);
      }
      modules.push({ type, originTile, rotation });
    }
  }

  const dockConfigs: StationSnapshotV1['dockConfigs'] = [];
  if (Array.isArray(snapshotRaw.dockConfigs)) {
    for (let i = 0; i < snapshotRaw.dockConfigs.length; i++) {
      const entry = snapshotRaw.dockConfigs[i];
      if (!isRecord(entry)) {
        warnings.push(`dockConfigs[${i}] invalid; skipped.`);
        continue;
      }
      const anchorTile = Math.floor(asFiniteNumber(entry.anchorTile, -1));
      if (anchorTile < 0 || anchorTile >= expectedLength) {
        warnings.push(`dockConfigs[${i}] has out-of-range anchorTile; skipped.`);
        continue;
      }
      const purpose: DockPurpose = isOneOf(entry.purpose, ['visitor', 'residential']) ? entry.purpose : 'visitor';
      const facing: SpaceLane = isOneOf(entry.facing, SPACE_LANES) ? entry.facing : 'north';
      const allowedShipTypes = Array.isArray(entry.allowedShipTypes)
        ? entry.allowedShipTypes.filter((type): type is ShipType => isOneOf(type, SHIP_TYPES))
        : [];
      const allowedShipSizes = Array.isArray(entry.allowedShipSizes)
        ? entry.allowedShipSizes.filter((size): size is ShipSize => isOneOf(size, SHIP_SIZES))
        : [];
      dockConfigs.push({
        anchorTile,
        purpose,
        facing,
        allowedShipTypes: allowedShipTypes.length > 0 ? [...new Set(allowedShipTypes)] : ['tourist'],
        allowedShipSizes: allowedShipSizes.length > 0 ? [...new Set(allowedShipSizes)] : ['small']
      });
    }
  }

  // Optional in legacy saves — empty/missing array is fine; the runtime
  // defaults the per-berth allowlist to "all allowed" when no row
  // exists for an anchor.
  const berthConfigs: NonNullable<StationSnapshotV1['berthConfigs']> = [];
  if (Array.isArray(snapshotRaw.berthConfigs)) {
    for (let i = 0; i < snapshotRaw.berthConfigs.length; i++) {
      const entry = snapshotRaw.berthConfigs[i];
      if (!isRecord(entry)) {
        warnings.push(`berthConfigs[${i}] invalid; skipped.`);
        continue;
      }
      const anchorTile = Math.floor(asFiniteNumber(entry.anchorTile, -1));
      if (anchorTile < 0 || anchorTile >= expectedLength) {
        warnings.push(`berthConfigs[${i}] has out-of-range anchorTile; skipped.`);
        continue;
      }
      const allowedShipTypes = Array.isArray(entry.allowedShipTypes)
        ? entry.allowedShipTypes.filter((type): type is ShipType => isOneOf(type, SHIP_TYPES))
        : [];
      const allowedShipSizes = Array.isArray(entry.allowedShipSizes)
        ? entry.allowedShipSizes.filter((size): size is ShipSize => isOneOf(size, SHIP_SIZES))
        : [];
      berthConfigs.push({
        anchorTile,
        allowedShipTypes:
          allowedShipTypes.length > 0 ? [...new Set(allowedShipTypes)] : ['tourist'],
        allowedShipSizes:
          allowedShipSizes.length > 0 ? [...new Set(allowedShipSizes)] : ['small']
      });
    }
  }

  let credits = defaultState.metrics.credits;
  let waterStock = defaultState.metrics.waterStock;
  let airQuality = defaultState.metrics.airQuality;
  let legacyMaterialStock = defaultState.legacyMaterialStock;
  if (isRecord(snapshotRaw.resources)) {
    credits = Math.max(0, asFiniteNumber(snapshotRaw.resources.credits, credits));
    waterStock = Math.max(0, asFiniteNumber(snapshotRaw.resources.waterStock, waterStock));
    airQuality = clamp(asFiniteNumber(snapshotRaw.resources.airQuality, airQuality), 0, 100);
    legacyMaterialStock = Math.max(0, asFiniteNumber(snapshotRaw.resources.legacyMaterialStock, legacyMaterialStock));
  } else {
    warnings.push('resources missing; defaulted.');
  }
  let crewTotal = defaultState.crew.total;
  if (isRecord(snapshotRaw.crew)) {
    crewTotal = clamp(Math.round(asFiniteNumber(snapshotRaw.crew.total, crewTotal)), 0, 40);
  } else {
    warnings.push('crew missing; defaulted.');
  }

  const inventoryByTile: StationSnapshotV1['inventoryByTile'] = [];
  if (Array.isArray(snapshotRaw.inventoryByTile)) {
    for (let i = 0; i < snapshotRaw.inventoryByTile.length; i++) {
      const entry = snapshotRaw.inventoryByTile[i];
      if (!isRecord(entry)) {
        warnings.push(`inventoryByTile[${i}] invalid; skipped.`);
        continue;
      }
      const tileIndex = Math.floor(asFiniteNumber(entry.tileIndex, -1));
      if (tileIndex < 0 || tileIndex >= expectedLength) {
        warnings.push(`inventoryByTile[${i}] has out-of-range tileIndex; skipped.`);
        continue;
      }
      if (!isRecord(entry.items)) {
        warnings.push(`inventoryByTile[${i}] missing items; skipped.`);
        continue;
      }
      const items: Partial<Record<ItemType, number>> = {};
      let hasAny = false;
      for (const itemType of ITEM_TYPES) {
        const amount = entry.items[itemType];
        if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) continue;
        items[itemType] = amount;
        hasAny = true;
      }
      if (!hasAny) continue;
      inventoryByTile.push({ tileIndex, items });
    }
  }

  let shipsPerCycle = defaultState.controls.shipsPerCycle;
  let taxRate = defaultState.controls.taxRate;
  if (isRecord(snapshotRaw.controls)) {
    shipsPerCycle = clamp(Math.round(asFiniteNumber(snapshotRaw.controls.shipsPerCycle, shipsPerCycle)), 0, 3);
    taxRate = clamp(asFiniteNumber(snapshotRaw.controls.taxRate, taxRate), 0, 0.5);
  } else {
    warnings.push('controls missing; defaulted.');
  }

  let unlockTier: UnlockTier = defaultState.unlocks.tier;
  const unlockedIds = new Set<UnlockId>(defaultState.unlocks.unlockedIds);
  const unlockedAtSec: Partial<Record<UnlockId, number>> = { ...defaultState.unlocks.unlockedAtSec };
  let hasUnlockState = false;
  if (isRecord(snapshotRaw.unlocks)) {
    hasUnlockState = true;
    unlockTier = normalizeUnlockTier(Math.round(asFiniteNumber(snapshotRaw.unlocks.tier, unlockTier)));
    if (Array.isArray(snapshotRaw.unlocks.unlockedIds)) {
      for (const id of snapshotRaw.unlocks.unlockedIds) {
        if (isOneOf(id, UNLOCK_IDS)) unlockedIds.add(id);
      }
    }
    if (isRecord(snapshotRaw.unlocks.unlockedAtSec)) {
      for (const id of UNLOCK_IDS) {
        const value = snapshotRaw.unlocks.unlockedAtSec[id];
        if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
          unlockedAtSec[id] = value;
        }
      }
    }
  } else {
    warnings.push('unlocks missing; deriving from saved content.');
  }

  const requiredTier = requiredUnlockTierForSnapshotContent(rooms, modules, dockConfigs);
  if (!hasUnlockState) {
    unlockTier = requiredTier;
    for (const id of UNLOCK_IDS_BY_TIER[requiredTier]) unlockedIds.add(id);
    if (requiredTier > 0) {
      warnings.push(`Derived unlock tier ${requiredTier} from saved rooms/modules/ship permissions.`);
    }
  } else if (unlockTier < requiredTier) {
    warnings.push(`Unlock tier ${unlockTier} too low for saved content; elevated to tier ${requiredTier}.`);
    unlockTier = requiredTier;
  }
  for (const id of UNLOCK_IDS_BY_TIER[unlockTier]) {
    unlockedIds.add(id);
  }

  // Progression counters — missing in pre-progression save files, so
  // default all to 0 and an empty archetypesEverSeen set.
  const progRaw = isRecord(snapshotRaw.progression) ? snapshotRaw.progression : null;
  const archetypesEverSeen: Partial<Record<VisitorArchetype, boolean>> = {};
  if (progRaw && isRecord(progRaw.archetypesEverSeen)) {
    for (const archetype of VISITOR_ARCHETYPES) {
      if (progRaw.archetypesEverSeen[archetype] === true) archetypesEverSeen[archetype] = true;
    }
  }
  const progression: StationSnapshotV1['progression'] = {
    mealsServedTotal: Math.max(0, Math.floor(asFiniteNumber(progRaw?.mealsServedTotal, 0))),
    creditsEarnedLifetime: Math.max(0, asFiniteNumber(progRaw?.creditsEarnedLifetime, 0)),
    tradeCyclesCompletedLifetime: Math.max(0, Math.floor(asFiniteNumber(progRaw?.tradeCyclesCompletedLifetime, 0))),
    incidentsResolvedLifetime: Math.max(0, Math.floor(asFiniteNumber(progRaw?.incidentsResolvedLifetime, 0))),
    actorsTreatedLifetime: Math.max(0, Math.floor(asFiniteNumber(progRaw?.actorsTreatedLifetime, 0))),
    residentsConvertedLifetime: Math.max(0, Math.floor(asFiniteNumber(progRaw?.residentsConvertedLifetime, 0))),
    archetypesEverSeen
  };
  if (!progRaw) warnings.push('progression counters missing; defaulted to zero (pre-progression save).');

  return {
    width,
    height,
    tiles,
    zones,
    rooms,
    roomHousingPolicies,
    modules,
    dockConfigs,
    berthConfigs,
    resources: {
      credits,
      waterStock,
      airQuality,
      legacyMaterialStock
    },
    crew: {
      total: crewTotal
    },
    inventoryByTile,
    controls: {
      shipsPerCycle,
      taxRate
    },
    unlocks: {
      tier: unlockTier,
      unlockedIds: UNLOCK_IDS.filter((id) => unlockedIds.has(id)),
      unlockedAtSec
    },
    progression
  };
}

export function parseAndMigrateSave(text: string): ParseSuccess | ParseFailure {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false,
      error: 'Invalid JSON.'
    };
  }
  if (!isRecord(parsed)) {
    return {
      ok: false,
      error: 'Save payload must be a JSON object.'
    };
  }

  const warnings: string[] = [];
  let envelopeRaw: Record<string, unknown>;

  if (isRecord(parsed.snapshot)) {
    envelopeRaw = parsed;
  } else if (Array.isArray(parsed.tiles)) {
    envelopeRaw = {
      schemaVersion: SAVE_SCHEMA_VERSION,
      gameVersion: 'legacy',
      createdAt: new Date().toISOString(),
      name: typeof parsed.name === 'string' && parsed.name.trim().length > 0 ? parsed.name : 'Imported legacy save',
      snapshot: parsed
    };
    warnings.push('Missing schemaVersion; interpreted as legacy snapshot format.');
  } else {
    return {
      ok: false,
      error: 'Save payload must include `snapshot` or top-level `tiles`.'
    };
  }

  const schemaVersionRaw = envelopeRaw.schemaVersion;
  if (typeof schemaVersionRaw !== 'number') {
    warnings.push('schemaVersion missing/invalid; using best-effort migration.');
  } else if (schemaVersionRaw < SAVE_SCHEMA_VERSION) {
    warnings.push(`Older schemaVersion ${schemaVersionRaw} detected; migrated best-effort.`);
  } else if (schemaVersionRaw > SAVE_SCHEMA_VERSION) {
    warnings.push(`Future schemaVersion ${schemaVersionRaw} detected; unknown fields ignored.`);
  }

  const snapshotRaw = envelopeRaw.snapshot;
  if (!isRecord(snapshotRaw)) {
    return {
      ok: false,
      error: 'Save payload snapshot is invalid.'
    };
  }
  const snapshot = normalizeSnapshot(snapshotRaw, warnings);
  if (!snapshot) {
    return {
      ok: false,
      error: 'Save payload missing required `tiles` array.'
    };
  }

  const save: StationSaveEnvelopeV1 = {
    schemaVersion: SAVE_SCHEMA_VERSION,
    gameVersion:
      typeof envelopeRaw.gameVersion === 'string' && envelopeRaw.gameVersion.trim().length > 0
        ? envelopeRaw.gameVersion
        : 'unknown',
    createdAt:
      typeof envelopeRaw.createdAt === 'string' && envelopeRaw.createdAt.trim().length > 0
        ? envelopeRaw.createdAt
        : new Date().toISOString(),
    name: typeof envelopeRaw.name === 'string' && envelopeRaw.name.trim().length > 0 ? envelopeRaw.name : 'Imported save',
    snapshot
  };

  return {
    ok: true,
    save,
    warnings
  };
}

function clearTransientState(state: StationState): void {
  state.visitors.length = 0;
  state.residents.length = 0;
  state.crewMembers.length = 0;
  state.arrivingShips.length = 0;
  state.pendingSpawns.length = 0;
  state.jobs.length = 0;
  state.dockQueue.length = 0;
  state.pathOccupancyByTile = new Map();
  state.bodyTiles.length = 0;
  state.recentDeathTimes.length = 0;
  state.recentExitTimes.length = 0;
  state.clusterActivationState = new Map();
  state.effects.blockedUntilByTile = new Map();
  state.effects.trespassCooldownUntilByTile = new Map();
  state.effects.securityAuraByTile = new Map();
  state.effects.cafeteriaStallUntil = 0;
  state.effects.brownoutUntil = 0;
  state.effects.securityDelayUntil = 0;
  state.metrics.bodyCount = 0;
  state.metrics.bodyVisibleCount = 0;
  state.metrics.recentDeaths = 0;
  state.metrics.pendingJobs = 0;
  state.metrics.assignedJobs = 0;
  state.metrics.expiredJobs = 0;
  state.metrics.completedJobs = 0;
  state.metrics.stalledJobs = 0;
  state.crew.assigned = 0;
  state.crew.free = state.crew.total;
}

function refreshBasicInventoryMetrics(state: StationState): void {
  let rawMeal = 0;
  let meal = 0;
  let rawMaterial = 0;
  let tradeGood = 0;
  for (const node of state.itemNodes) {
    rawMeal += Math.max(0, node.items.rawMeal ?? 0);
    meal += Math.max(0, node.items.meal ?? 0);
    rawMaterial += Math.max(0, node.items.rawMaterial ?? 0);
    tradeGood += Math.max(0, node.items.tradeGood ?? 0);
  }
  state.metrics.rawFoodStock = rawMeal;
  state.metrics.mealStock = meal;
  state.metrics.marketTradeGoodStock = tradeGood;
  state.metrics.materials = Math.max(0, state.legacyMaterialStock + rawMaterial);
}

export function hydrateStateFromSave(
  save: StationSaveEnvelopeV1,
  options?: { seed?: number }
): { state: StationState; warnings: string[] } {
  const next = createInitialState(options);
  const warnings: string[] = [];
  const snapshot = save.snapshot;

  if (snapshot.width !== next.width || snapshot.height !== next.height) {
    throw new Error(
      `Save dimensions ${snapshot.width}x${snapshot.height} do not match current game grid ${next.width}x${next.height}.`
    );
  }
  const expectedLength = next.width * next.height;
  if (
    snapshot.tiles.length !== expectedLength ||
    snapshot.zones.length !== expectedLength ||
    snapshot.rooms.length !== expectedLength ||
    snapshot.roomHousingPolicies.length !== expectedLength
  ) {
    throw new Error('Save grid arrays are malformed for the current game grid.');
  }

  next.tiles = snapshot.tiles.slice();
  next.zones = snapshot.zones.slice();
  next.rooms = snapshot.rooms.slice();
  next.roomHousingPolicies = snapshot.roomHousingPolicies.slice();
  const hydratedTier = normalizeUnlockTier(snapshot.unlocks.tier);
  // v1→v2 migration: pre-v2 saves used the old id strings (tier1_stability,
  // tier2_logistics, tier3_civic). Those won't match the new UNLOCK_IDS,
  // so unlockedIds becomes [] here. That's intentional — `tier` is the
  // source of truth for what's unlocked, and the advance pass will
  // repopulate unlockedIds as the player re-crosses each threshold.
  next.unlocks = {
    tier: hydratedTier,
    unlockedIds: UNLOCK_IDS.filter((id) => snapshot.unlocks.unlockedIds.includes(id)),
    unlockedAtSec: { ...snapshot.unlocks.unlockedAtSec },
    // triggerProgress: mark reached tier as 1.0 so the tier-advance pass
    // doesn't re-check it; future tiers stay at 0 and re-accumulate from
    // the live metrics.
    triggerProgress: { [hydratedTier]: 1 },
  };

  next.moduleInstances = [];
  next.modules = new Array<ModuleType>(expectedLength).fill(ModuleType.None);
  next.moduleOccupancyByTile = new Array<number | null>(expectedLength).fill(null);
  next.moduleSpawnCounter = 1;

  const sortedModules = [...snapshot.modules].sort((a, b) => a.originTile - b.originTile || a.type.localeCompare(b.type));
  for (const [index, module] of sortedModules.entries()) {
    const result = tryPlaceModule(next, module.type, module.originTile, module.rotation);
    if (!result.ok) {
      warnings.push(`Module ${index} (${module.type} @ ${module.originTile}) skipped: ${result.reason ?? 'invalid'}.`);
    }
  }

  next.controls.paused = true;
  tick(next, 0);

  for (const [index, dockConfig] of snapshot.dockConfigs.entries()) {
    const dock = next.docks.find((d) => d.anchorTile === dockConfig.anchorTile || d.tiles.includes(dockConfig.anchorTile));
    if (!dock) {
      warnings.push(`Dock config ${index} (anchor ${dockConfig.anchorTile}) skipped: no matching dock.`);
      continue;
    }
    setDockPurpose(next, dock.id, dockConfig.purpose);
    const facingResult = setDockFacing(next, dock.id, dockConfig.facing);
    if (!facingResult.ok) {
      warnings.push(`Dock ${dock.id} facing ${dockConfig.facing} rejected (${facingResult.reason ?? 'invalid'}).`);
    }
    for (const shipType of SHIP_TYPES) {
      setDockAllowedShipType(next, dock.id, shipType, dockConfig.allowedShipTypes.includes(shipType));
    }
    for (const shipSize of SHIP_SIZES) {
      setDockAllowedShipSize(next, dock.id, shipSize, dockConfig.allowedShipSizes.includes(shipSize));
    }
  }

  // Apply per-berth allowlists. The Berth-room clusters were rebuilt
  // by the tick(next, 0) call above when `next.rooms` got populated;
  // this is the first chance to validate the persisted anchors against
  // a fresh cluster layout. An anchor that's no longer the lowest tile
  // of a Berth cluster gets dropped with a warning so save authors can
  // catch silent geometry drift on hand-edited saves.
  if (snapshot.berthConfigs && snapshot.berthConfigs.length > 0) {
    const validBerthAnchors = new Set<number>();
    for (let i = 0; i < next.rooms.length; i++) {
      if (next.rooms[i] !== RoomType.Berth) continue;
      // First-pass: anchor candidate is the cluster's lowest tile,
      // which we don't have direct access to here without rebuilding
      // clusters. Use the runtime helper instead — ensureBerthConfig
      // accepts any Berth-tile index and resolves to the cluster's
      // anchor at lookup-time on the next pickBerthForShip call.
      validBerthAnchors.add(i);
    }
    for (const [index, berthConfig] of snapshot.berthConfigs.entries()) {
      if (!validBerthAnchors.has(berthConfig.anchorTile)) {
        warnings.push(
          `Berth config ${index} (anchor ${berthConfig.anchorTile}) skipped: no matching berth tile.`
        );
        continue;
      }
      for (const shipType of SHIP_TYPES) {
        setBerthAllowedShipType(
          next,
          berthConfig.anchorTile,
          shipType,
          berthConfig.allowedShipTypes.includes(shipType)
        );
      }
      for (const shipSize of SHIP_SIZES) {
        setBerthAllowedShipSize(
          next,
          berthConfig.anchorTile,
          shipSize,
          berthConfig.allowedShipSizes.includes(shipSize)
        );
      }
    }
  }

  tick(next, 0);

  const nodeByTile = new Map<number, StationState['itemNodes'][number]>();
  for (const node of next.itemNodes) {
    node.items = {};
    nodeByTile.set(node.tileIndex, node);
  }
  for (const [entryIndex, entry] of snapshot.inventoryByTile.entries()) {
    const node = nodeByTile.get(entry.tileIndex);
    if (!node) {
      warnings.push(`Inventory entry ${entryIndex} at tile ${entry.tileIndex} dropped: no matching inventory node.`);
      continue;
    }
    let used = 0;
    for (const itemType of ITEM_TYPES) {
      const requested = Math.max(0, entry.items[itemType] ?? 0);
      if (requested <= 0) continue;
      const remaining = Math.max(0, node.capacity - used);
      const accepted = Math.min(requested, remaining);
      if (accepted > 0) {
        node.items[itemType] = accepted;
        used += accepted;
      }
      if (accepted < requested) {
        warnings.push(
          `Inventory entry ${entryIndex} for ${itemType} at tile ${entry.tileIndex} clamped (${accepted.toFixed(2)}/${requested.toFixed(2)}).`
        );
      }
    }
  }

  next.metrics.credits = Math.max(0, snapshot.resources.credits);
  next.metrics.waterStock = Math.max(0, snapshot.resources.waterStock);
  next.metrics.airQuality = clamp(snapshot.resources.airQuality, 0, 100);
  next.legacyMaterialStock = Math.max(0, snapshot.resources.legacyMaterialStock);
  next.crew.total = clamp(Math.round(snapshot.crew.total), 0, 40);
  next.crew.free = next.crew.total;
  next.crew.assigned = 0;

  // Restore lifetime counters so predicate-driven tier progression
  // (archetypesServedLifetime is derived from archetypesEverSeen in
  // the metrics pass, so persisting the set is enough) survives reload.
  next.metrics.mealsServedTotal = snapshot.progression.mealsServedTotal;
  next.metrics.creditsEarnedLifetime = snapshot.progression.creditsEarnedLifetime;
  next.metrics.tradeCyclesCompletedLifetime = snapshot.progression.tradeCyclesCompletedLifetime;
  next.metrics.incidentsResolvedLifetime = snapshot.progression.incidentsResolvedLifetime;
  next.metrics.actorsTreatedLifetime = snapshot.progression.actorsTreatedLifetime;
  next.metrics.residentsConvertedLifetime = snapshot.progression.residentsConvertedLifetime;
  for (const archetype of VISITOR_ARCHETYPES) {
    next.usageTotals.archetypesEverSeen[archetype] = snapshot.progression.archetypesEverSeen[archetype] === true;
  }

  next.controls.shipsPerCycle = clamp(Math.round(snapshot.controls.shipsPerCycle), 0, 3);
  next.controls.taxRate = clamp(snapshot.controls.taxRate, 0, 0.5);
  refreshBasicInventoryMetrics(next);

  clearTransientState(next);
  next.controls.paused = true;
  tick(next, 0);

  return {
    state: next,
    warnings
  };
}
