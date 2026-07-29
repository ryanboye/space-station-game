import {
  commitBerthFootprint,
  setRoom,
  setRoomHousingPolicy,
  setZone
} from './sim';
import { RoomType, type HousingPolicy, type StationState, type ZoneType } from './types';

export type PastedRoomSetting = {
  tileIndex: number;
  room: RoomType;
  zone: ZoneType;
  housingPolicy: HousingPolicy;
};

export type PastedRoomSettingsResult =
  | { ok: true; paintedCells: number; berthCost: number }
  | { ok: false; reason: string; berthCost: number };

/** Clone the data-only station graph while replacing its non-cloneable RNG. */
export function cloneStationStateForLayoutPreview(state: StationState): StationState {
  const cloneable = { ...state, rng: undefined };
  const preview = structuredClone(cloneable) as unknown as StationState;
  // Layout validation is deterministic and must never consume live entropy if
  // a future validation seam happens to consult rng.
  preview.rng = () => 0.5;
  return preview;
}

function applyRoomSettings(
  state: StationState,
  settings: readonly PastedRoomSetting[]
): PastedRoomSettingsResult {
  // Clear or repaint ordinary rooms first. A copied stamp can deliberately
  // split an existing berth before placing its copied bay, and the capital
  // quote must describe that final topology rather than the old connection.
  for (const setting of settings) {
    if (setting.room !== RoomType.Berth) setRoom(state, setting.tileIndex, setting.room);
  }

  const berthTiles = settings
    .filter((setting) => setting.room === RoomType.Berth)
    .map((setting) => setting.tileIndex);
  let berthCost = 0;
  if (berthTiles.length > 0) {
    // One stamp footprint is one capital commitment. commitBerthFootprint
    // prices every connected component touched by this set and paints all of
    // them only after the station can cover the complete charge.
    const committed = commitBerthFootprint(state, berthTiles);
    berthCost = committed.cost;
    if (!committed.ok) return { ok: false, reason: committed.reason, berthCost };
  }

  for (const setting of settings) {
    setZone(state, setting.tileIndex, setting.zone);
    setRoomHousingPolicy(state, setting.tileIndex, setting.housingPolicy);
  }
  return { ok: true, paintedCells: settings.length, berthCost };
}

/**
 * Apply the room portion of a copied station stamp atomically when it contains
 * a Berth. The preview protects both the capital charge and any ordinary room
 * cells that would otherwise be repainted before an unaffordable bay failed.
 */
export function applyPastedRoomSettings(
  state: StationState,
  settings: readonly PastedRoomSetting[]
): PastedRoomSettingsResult {
  if (!settings.some((setting) => setting.room === RoomType.Berth)) {
    return applyRoomSettings(state, settings);
  }

  const preview = cloneStationStateForLayoutPreview(state);
  const planned = applyRoomSettings(preview, settings);
  if (!planned.ok) return planned;

  const committed = applyRoomSettings(state, settings);
  if (!committed.ok) {
    // The live state is unchanged between preview and commit: disagreement is
    // an invariant failure, not a player-facing affordability outcome.
    throw new Error(`Berth stamp preflight diverged: ${committed.reason}`);
  }
  return committed;
}
