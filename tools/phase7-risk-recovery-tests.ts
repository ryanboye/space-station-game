// Phase 7 terminal evidence: one predicted environmental risk must become a
// real operating consequence, then respond to a physical player mitigation.

import { mapConditionSamplesAt } from '../src/sim/map-conditions';
import {
  createInitialState,
  getMaintenanceTileDiagnostic,
  getThermalTileDiagnostic,
  mapConditionAt,
  setRoom,
  setTile,
  tick,
  tryPlaceModule
} from '../src/sim/sim';
import { ModuleType, RoomType, TileType, fromIndex, toIndex, type StationState } from '../src/sim/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`phase7-risk-recovery: ${message}`);
}

const SEED = 19731;
const STEP_SECONDS = 0.5;
const LOAD_SECONDS = 120;
const RECOVERY_SECONDS = 120;
const SUNLIGHT_BIN = 0.01;

type Location = {
  tile: number;
  sunlight: number;
  thermalSink: number;
};

function matchedThermalLocations(state: StationState): { risky: Location; safer: Location } {
  const bins = new Map<number, { risky: Location; safer: Location }>();
  for (let y = 4; y <= state.height - 7; y++) {
    for (let x = 4; x <= state.width - 8; x++) {
      const tile = toIndex(x + 1, y + 1, state.width);
      const sunlight = mapConditionAt(state, 'sunlight', tile);
      if (sunlight < 0.48) continue;
      const thermalSink = mapConditionAt(state, 'thermal-sink', tile);
      const candidate = { tile, sunlight, thermalSink };
      const bin = Math.round(sunlight / SUNLIGHT_BIN);
      const entry = bins.get(bin);
      if (!entry) bins.set(bin, { risky: candidate, safer: candidate });
      else {
        if (thermalSink < entry.risky.thermalSink) entry.risky = candidate;
        if (thermalSink > entry.safer.thermalSink) entry.safer = candidate;
      }
    }
  }
  const pair = [...bins.values()]
    .filter(({ risky, safer }) => Math.abs(risky.sunlight - safer.sunlight) <= SUNLIGHT_BIN)
    .sort((a, b) =>
      (b.safer.thermalSink - b.risky.thermalSink) - (a.safer.thermalSink - a.risky.thermalSink)
    )[0];
  assert(pair, 'same-sunlight thermal locations were not available');
  assert(
    pair.safer.thermalSink >= pair.risky.thermalSink + 0.24,
    `map did not expose a meaningful safer sink (${pair.risky.thermalSink.toFixed(3)} vs ${pair.safer.thermalSink.toFixed(3)})`
  );
  return pair;
}

function emptyOperationalDeck(state: StationState): void {
  state.controls.paused = false;
  state.controls.simSpeed = 1;
  state.controls.shipsPerCycle = 0;
  state.tiles.fill(TileType.Floor);
  state.rooms.fill(RoomType.None);
  state.modules.fill(ModuleType.None);
  state.moduleInstances = [];
  state.moduleOccupancyByTile.fill(null);
  state.jobs.length = 0;
  state.reservations.length = 0;
  state.itemNodes.length = 0;
  state.visitors.length = 0;
  state.residents.length = 0;
  state.arrivingShips.length = 0;
  state.physicalHoldingQueue.length = 0;
  state.docks.length = 0;
  state.crewMembers.length = 0;
  state.crew.total = 0;
  state.crew.assigned = 0;
  state.crew.free = 0;
  state.unlocks.tier = 3;
  state.unlocks.unlockedIds = ['tier1_sustenance', 'tier2_commerce', 'tier3_logistics'];
  state.unlocks.unlockedAtSec = { tier1_sustenance: 0, tier2_commerce: 0, tier3_logistics: 0 };
}

function buildKitchen(location: Location): { state: StationState; stoveTile: number; ventTile: number } {
  const state = createInitialState({ seed: SEED, manualTrafficAdmission: true });
  emptyOperationalDeck(state);
  const center = fromIndex(location.tile, state.width);
  const x0 = center.x - 1;
  const y0 = center.y - 1;
  const x1 = x0 + 3;
  const y1 = y0 + 2;

  // A sealed 4x3 loaded room inside a walkable buffer. Its west internal wall
  // is an ordinary physical Vent mount the player can use after the warning.
  for (let y = y0 - 3; y <= y1 + 3; y++) {
    for (let x = x0 - 3; x <= x1 + 3; x++) {
      const boundary = x === x0 - 3 || x === x1 + 3 || y === y0 - 3 || y === y1 + 3;
      setTile(state, toIndex(x, y, state.width), boundary ? TileType.Wall : TileType.Floor);
    }
  }
  setTile(state, toIndex(x1 + 3, y0, state.width), TileType.Door);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) setRoom(state, toIndex(x, y, state.width), RoomType.Kitchen);
  }
  const doorTile = toIndex(x0, y0, state.width);
  setTile(state, doorTile, TileType.Door);
  setRoom(state, doorTile, RoomType.Kitchen);
  const ventTile = toIndex(x0 - 1, y1, state.width);
  setTile(state, ventTile, TileType.Wall);
  const stoveTile = toIndex(x0 + 1, y0 + 1, state.width);
  const stove = tryPlaceModule(state, ModuleType.Stove, stoveTile);
  assert(stove.ok, `Stove placement failed: ${stove.reason ?? 'unknown'}`);
  return { state, stoveTile, ventTile };
}

function runFor(state: StationState, seconds: number): void {
  for (let elapsed = 0; elapsed < seconds; elapsed += STEP_SECONDS) tick(state, STEP_SECONDS);
}

const probe = createInitialState({ seed: SEED, manualTrafficAdmission: true });
const locations = matchedThermalLocations(probe);
const risky = buildKitchen(locations.risky);
const safer = buildKitchen(locations.safer);

// The map and inspector must explain the operating risk before any wear has
// accumulated. This is prediction, not a damage report disguised as one.
const samples = mapConditionSamplesAt(risky.state, risky.stoveTile);
const sunlightWarning = samples.find((sample) => sample.kind === 'sunlight');
const sinkWarning = samples.find((sample) => sample.kind === 'thermal-sink');
const riskyPos = fromIndex(risky.stoveTile, risky.state.width);
const earlyDiagnostic = getThermalTileDiagnostic(risky.state, riskyPos.x, riskyPos.y);
const earlyWear = getMaintenanceTileDiagnostic(risky.state, riskyPos.x, riskyPos.y)?.debt ?? 0;
assert(earlyWear === 0, `warning arrived after Stove wear had already accrued (${earlyWear.toFixed(3)})`);
assert(sunlightWarning?.downside.includes('heat and wear'), 'map did not name sunlight heat/wear pressure');
assert(sinkWarning?.downside.includes('less natural cooling'), 'map did not name the poor thermal-sink downside');
assert(earlyDiagnostic, 'high-load Kitchen had no pre-consequence thermal diagnosis');
assert(earlyDiagnostic.cause.includes('kitchen load'), 'inspector did not identify the high-load Kitchen source');
assert(
  earlyDiagnostic.fix.includes('vents/insulation'),
  `pre-consequence diagnosis did not name physical mitigation (${earlyDiagnostic.fix})`
);

runFor(risky.state, LOAD_SECONDS);
runFor(safer.state, LOAD_SECONDS);
const peakHeat = risky.state.heatByTile[risky.stoveTile];
const peakWear = getMaintenanceTileDiagnostic(risky.state, riskyPos.x, riskyPos.y)?.debt ?? 0;
const saferHeat = safer.state.heatByTile[safer.stoveTile];
assert(peakHeat >= 80, `predicted thermal consequence did not develop (${peakHeat.toFixed(2)})`);
assert(peakWear > 1, `predicted wear consequence did not develop (${peakWear.toFixed(3)})`);
assert(
  saferHeat <= peakHeat - 2.5,
  `the same-seed safer sink was not materially cooler (${saferHeat.toFixed(2)} vs ${peakHeat.toFixed(2)})`
);

// Apply the physical mitigation to the already-hot state, not a fresh clone.
const vent = tryPlaceModule(risky.state, ModuleType.Vent, risky.ventTile);
assert(vent.ok, `physical Vent placement failed: ${vent.reason ?? 'unknown'}`);
runFor(risky.state, RECOVERY_SECONDS);
const recoveredHeat = risky.state.heatByTile[risky.stoveTile];
const recoveredDiagnostic = getThermalTileDiagnostic(risky.state, riskyPos.x, riskyPos.y);
assert(
  recoveredHeat <= peakHeat - 1.25,
  `Vent did not recover the already-hot room (${recoveredHeat.toFixed(2)} from ${peakHeat.toFixed(2)})`
);
assert((recoveredDiagnostic?.ventRelief ?? 0) > 0, 'post-recovery inspector did not attribute physical Vent relief');

console.log(
  `phase7-risk-recovery-tests: ok | pre-wear ${earlyWear.toFixed(3)} | `
  + `sink risky/safer ${locations.risky.thermalSink.toFixed(3)}/${locations.safer.thermalSink.toFixed(3)} | `
  + `heat risky/safer/recovered ${peakHeat.toFixed(2)}/${saferHeat.toFixed(2)}/${recoveredHeat.toFixed(2)} | `
  + `wear ${peakWear.toFixed(3)}`
);
