// Named cold-start scenario fixtures. Applied via the `?scenario=<name>`
// URL param in main.ts. Each fixture takes a fresh `createInitialState()`
// result and thin-spec-overrides only the fields needed to land at the
// target test state — it does NOT rebuild station geometry, rooms,
// modules, or crew rosters. The rest of the world remains whatever the
// default starter produces.
//
// Deliberately thin so schema drift doesn't rot the fixtures: if
// `StationState` gains a field, default-starter populates it and the
// fixture stays silent. Only tier-relevant counters + unlock bookkeeping
// are set per scenario.
//
// Whitelist-only: the `?scenario=<name>` loader looks up by name in
// `COLD_START_SCENARIOS` and applies nothing if not found. No freeform
// paths or JSON blobs land through this door.

import { UNLOCK_DEFINITIONS } from './content/unlocks';
import { GRID_WIDTH, TileType, RoomType, ModuleType } from './types';
import type { StationState, UnlockId, UnlockTier } from './types';
import { setTile, setRoom, setModule } from './sim';

type Scenario = (state: StationState) => void;

function unlockThrough(state: StationState, targetTier: UnlockTier): void {
  const ids: UnlockId[] = [];
  for (const def of UNLOCK_DEFINITIONS) {
    if (def.tier <= targetTier) ids.push(def.id);
  }
  state.unlocks.tier = targetTier;
  state.unlocks.unlockedIds = ids;
  state.unlocks.unlockedAtSec = Object.fromEntries(ids.map((id) => [id, 0]));
  for (const id of ids) {
    state.unlocks.triggerProgress[
      UNLOCK_DEFINITIONS.find((d) => d.id === id)!.tier
    ] = 1;
  }
}

export const COLD_START_SCENARIOS: Record<string, Scenario> = {
  // Default starter state — no-op. Keeps the registry pattern symmetric
  // so `?scenario=starter` is a valid URL (and differentiates from a
  // mistyped name which falls through to warning).
  starter: () => {},

  // Tier 1 already fired: first visitor archetype seen, T1 unlocked.
  // Useful for sprite/UX iteration that starts "after the first-visitor
  // flash" without waiting for the spawn cycle.
  't1-ready': (s) => {
    unlockThrough(s, 1);
    s.usageTotals.archetypesEverSeen.diner = true;
    s.metrics.archetypesServedLifetime = 1;
  },

  // Mid-game: Tier 4 unlocked, Tier 5 on-deck with counters poised.
  // Has the variety of archetypes + credits + incidents a playtester
  // would see after ~30 min of real play. Good target for dense-room
  // sprite review.
  't5-ready': (s) => {
    unlockThrough(s, 4);
    s.usageTotals.archetypesEverSeen = {
      diner: true,
      shopper: true,
      lounger: true,
      rusher: true
    };
    s.metrics.archetypesServedLifetime = 4;
    s.metrics.creditsEarnedLifetime = 5000;
    s.metrics.tradeCyclesCompletedLifetime = 5;
    s.metrics.incidentsResolvedLifetime = 3;
    s.metrics.credits = 1000;
    s.metrics.materials = 200;
  },

  // End-state: every tier unlocked, trophy condition satisfied. For
  // reviewing T6+ UX copy, achievement-panel polish, post-game states.
  't6-trophy': (s) => {
    unlockThrough(s, 6);
    s.usageTotals.archetypesEverSeen = {
      diner: true,
      shopper: true,
      lounger: true,
      rusher: true
    };
    s.metrics.archetypesServedLifetime = 4;
    s.metrics.creditsEarnedLifetime = 25000;
    s.metrics.tradeCyclesCompletedLifetime = 20;
    s.metrics.incidentsResolvedLifetime = 10;
    s.metrics.actorsTreatedLifetime = 5;
    s.metrics.residentsConvertedLifetime = 3;
    s.metrics.credits = 5000;
    s.metrics.materials = 500;
  },

  // Demo showcase: T6 unlocked + a PROGRAMMATICALLY BUILT multi-room
  // station so every sprite category renders on load. Departs from the
  // thin-spec norm because the whole point is *dense* visual verification
  // for sprite-pipeline iteration. Use `?scenario=demo-station`.
  'demo-station': (s) => {
    // Start from t6-trophy counters so content is unlocked.
    unlockThrough(s, 6);
    s.usageTotals.archetypesEverSeen = { diner: true, shopper: true, lounger: true, rusher: true };
    s.metrics.archetypesServedLifetime = 4;
    s.metrics.creditsEarnedLifetime = 25000;
    s.metrics.tradeCyclesCompletedLifetime = 20;
    s.metrics.incidentsResolvedLifetime = 10;
    s.metrics.actorsTreatedLifetime = 5;
    s.metrics.residentsConvertedLifetime = 3;
    s.metrics.credits = 5000;
    s.metrics.materials = 500;
    applyDemoStationOverlay(s);
  }
};

// ----------------------------------------------------------------------------
// demo-station layout — programmatic station builder
// ----------------------------------------------------------------------------

function paintRoom(
  state: StationState,
  x1: number, y1: number, x2: number, y2: number,
  roomType: RoomType,
  doorSide: 'north' | 'south' | 'east' | 'west' = 'south'
): void {
  for (let y = y1; y < y2; y++) {
    for (let x = x1; x < x2; x++) {
      const idx = y * GRID_WIDTH + x;
      const isEdge = x === x1 || x === x2 - 1 || y === y1 || y === y2 - 1;
      if (isEdge) {
        setTile(state, idx, TileType.Wall);
      } else {
        setTile(state, idx, TileType.Floor);
        setRoom(state, idx, roomType);
      }
    }
  }
  const midX = Math.floor((x1 + x2) / 2);
  const midY = Math.floor((y1 + y2) / 2);
  let doorX: number, doorY: number;
  if (doorSide === 'north') { doorX = midX; doorY = y1; }
  else if (doorSide === 'south') { doorX = midX; doorY = y2 - 1; }
  else if (doorSide === 'west') { doorX = x1; doorY = midY; }
  else { doorX = x2 - 1; doorY = midY; }
  const doorIdx = doorY * GRID_WIDTH + doorX;
  setTile(state, doorIdx, TileType.Door);
  setRoom(state, doorIdx, roomType);
}

function placeMod(state: StationState, x: number, y: number, m: ModuleType): void {
  setModule(state, y * GRID_WIDTH + x, m);
}

function paintFloorTile(state: StationState, x: number, y: number, t: TileType): void {
  setTile(state, y * GRID_WIDTH + x, t);
}

function applyDemoStationOverlay(state: StationState): void {
  // Wipe a 52×32 canvas so the starter's tiny central room doesn't conflict.
  for (let y = 4; y < 36; y++) {
    for (let x = 4; x < 56; x++) {
      const idx = y * GRID_WIDTH + x;
      setTile(state, idx, TileType.Space);
    }
  }

  // Top row: 5 rooms at y=6-14
  paintRoom(state, 5, 6, 15, 15, RoomType.Dorm, 'south');
  paintRoom(state, 15, 6, 25, 15, RoomType.Cafeteria, 'south');
  paintRoom(state, 25, 6, 35, 15, RoomType.Hydroponics, 'south');
  paintRoom(state, 35, 6, 45, 15, RoomType.Clinic, 'south');
  paintRoom(state, 45, 6, 55, 15, RoomType.Workshop, 'south');

  // Central corridor y=15-18
  for (let y = 15; y < 19; y++) {
    for (let x = 5; x < 55; x++) {
      setTile(state, y * GRID_WIDTH + x, TileType.Floor);
    }
  }

  // Bottom row: 5 rooms at y=19-28
  paintRoom(state, 5, 19, 15, 28, RoomType.Market, 'north');
  paintRoom(state, 15, 19, 25, 28, RoomType.Reactor, 'north');
  paintRoom(state, 25, 19, 35, 28, RoomType.Security, 'north');
  paintRoom(state, 35, 19, 45, 28, RoomType.Hygiene, 'north');
  paintRoom(state, 45, 19, 55, 28, RoomType.RecHall, 'north');

  // Room-specific floor variants
  for (let y = 7; y < 14; y++) for (let x = 16; x < 24; x++) {
    paintFloorTile(state, x, y, TileType.Cafeteria);
    setRoom(state, y * GRID_WIDTH + x, RoomType.Cafeteria);
  }
  for (let y = 20; y < 27; y++) for (let x = 16; x < 24; x++) {
    paintFloorTile(state, x, y, TileType.Reactor);
    setRoom(state, y * GRID_WIDTH + x, RoomType.Reactor);
  }
  for (let y = 20; y < 27; y++) for (let x = 26; x < 34; x++) {
    paintFloorTile(state, x, y, TileType.Security);
    setRoom(state, y * GRID_WIDTH + x, RoomType.Security);
  }

  // Dock pair on east side
  paintFloorTile(state, 55, 20, TileType.Dock);
  paintFloorTile(state, 55, 21, TileType.Dock);

  // ---- modules ----
  // Dorm
  placeMod(state, 7, 8, ModuleType.Bed);
  placeMod(state, 9, 8, ModuleType.Bed);
  placeMod(state, 11, 8, ModuleType.Bed);
  placeMod(state, 13, 8, ModuleType.Bed);
  placeMod(state, 7, 12, ModuleType.WallLight);
  // Cafeteria
  placeMod(state, 17, 8, ModuleType.Table);
  placeMod(state, 19, 8, ModuleType.Table);
  placeMod(state, 21, 8, ModuleType.ServingStation);
  placeMod(state, 17, 12, ModuleType.Stove);
  placeMod(state, 19, 12, ModuleType.WallLight);
  // Hydroponics
  placeMod(state, 27, 9, ModuleType.GrowStation);
  placeMod(state, 30, 9, ModuleType.GrowStation);
  placeMod(state, 27, 12, ModuleType.GrowStation);
  // Clinic
  placeMod(state, 37, 9, ModuleType.MedBed);
  placeMod(state, 40, 9, ModuleType.Terminal);
  placeMod(state, 37, 12, ModuleType.Sink);
  // Workshop
  placeMod(state, 47, 9, ModuleType.Workbench);
  placeMod(state, 49, 9, ModuleType.StorageRack);
  placeMod(state, 47, 12, ModuleType.IntakePallet);
  // Market
  placeMod(state, 7, 21, ModuleType.MarketStall);
  placeMod(state, 9, 21, ModuleType.MarketStall);
  placeMod(state, 11, 21, ModuleType.Terminal);
  // Reactor
  placeMod(state, 17, 21, ModuleType.WallLight);
  placeMod(state, 22, 21, ModuleType.WallLight);
  placeMod(state, 17, 25, ModuleType.WallLight);
  placeMod(state, 22, 25, ModuleType.WallLight);
  // Security
  placeMod(state, 27, 21, ModuleType.CellConsole);
  placeMod(state, 30, 21, ModuleType.Terminal);
  placeMod(state, 27, 25, ModuleType.Couch);
  // Hygiene
  placeMod(state, 37, 21, ModuleType.Shower);
  placeMod(state, 39, 21, ModuleType.Shower);
  placeMod(state, 37, 25, ModuleType.Sink);
  // RecHall
  placeMod(state, 47, 21, ModuleType.Couch);
  placeMod(state, 49, 21, ModuleType.Couch);
  placeMod(state, 47, 25, ModuleType.GameStation);
  placeMod(state, 49, 25, ModuleType.RecUnit);
}

/** Apply a named scenario to a fresh state. Returns true if the name
 *  matched a whitelisted fixture, false otherwise. Caller decides
 *  whether to warn on mismatch. */
export function applyColdStartScenario(
  state: StationState,
  name: string
): boolean {
  const scenario = COLD_START_SCENARIOS[name];
  if (!scenario) return false;
  scenario(state);
  return true;
}

export const COLD_START_SCENARIO_NAMES: readonly string[] = Object.freeze(
  Object.keys(COLD_START_SCENARIOS)
);
