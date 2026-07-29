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
  if (!condition) throw new Error(`thermal-sink-expansion: ${message}`);
}

const SEED = 19731;
const SUNLIGHT_BIN_SIZE = 0.01;
// Long enough for thermal drift to settle and heat-linked wear to separate,
// but shorter than an unattended debris strike can breach the comparison hull.
const SETTLE_SECONDS = 120;
const STEP_SECONDS = 0.5;

type Candidate = {
  originTile: number;
  sunlight: number;
  thermalSink: number;
};

type CandidatePair = {
  high: Candidate;
  low: Candidate;
};

function findMatchedSinkPair(state: StationState): CandidatePair {
  const bins = new Map<number, { high: Candidate; low: Candidate }>();
  // A fixture occupies a 6x5 shell around a 4x3 Kitchen. Leave enough margin
  // that both matched sites receive exactly the same local construction.
  for (let y = 3; y <= state.height - 6; y++) {
    for (let x = 3; x <= state.width - 7; x++) {
      const originTile = toIndex(x + 1, y + 1, state.width);
      const sunlight = mapConditionAt(state, 'sunlight', originTile);
      const thermalSink = mapConditionAt(state, 'thermal-sink', originTile);
      const candidate = { originTile, sunlight, thermalSink };
      const bin = Math.round(sunlight / SUNLIGHT_BIN_SIZE);
      const current = bins.get(bin);
      if (!current) bins.set(bin, { high: candidate, low: candidate });
      else {
        if (candidate.thermalSink > current.high.thermalSink) current.high = candidate;
        if (candidate.thermalSink < current.low.thermalSink) current.low = candidate;
      }
    }
  }

  const pair = [...bins.values()]
    .filter((entry) =>
      Math.abs(entry.high.sunlight - entry.low.sunlight) <= SUNLIGHT_BIN_SIZE &&
      entry.high.sunlight >= 0.48
    )
    .sort((a, b) =>
      (b.high.thermalSink - b.low.thermalSink) - (a.high.thermalSink - a.low.thermalSink)
    )[0];
  assert(pair, 'no sunlight-matched thermal-sink pair was found');
  assert(
    pair.high.thermalSink >= pair.low.thermalSink + 0.24,
    `matched sink contrast is too small (${pair.high.thermalSink.toFixed(3)} vs ${pair.low.thermalSink.toFixed(3)})`
  );
  return pair;
}

function clearToTestDeck(state: StationState): void {
  state.controls.paused = false;
  state.controls.simSpeed = 1;
  state.controls.shipsPerCycle = 0;
  // Vacuum-rated test deck surrounding the sealed comparison chamber. Keeping
  // it walkable avoids creating debris-facing exterior panels whose long-run
  // impacts would confound the thermal maintenance comparison.
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

function buildLoadedKitchen(candidate: Candidate, withVent: boolean): {
  state: StationState;
  stoveTile: number;
} {
  const state = createInitialState({ seed: SEED, manualTrafficAdmission: true });
  clearToTestDeck(state);
  const center = fromIndex(candidate.originTile, state.width);
  const x0 = center.x - 1;
  const y0 = center.y - 1;
  const x1 = x0 + 3;
  const y1 = y0 + 2;

  // Identical sealed habitats around each 4x3 expansion room. The Kitchen's
  // Door opens onto pressurized interior floor; an internal wall provides the
  // physical Vent mount without turning the Door into a vacuum boundary.
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
  assert(stove.ok, `failed to place Stove: ${stove.reason ?? 'unknown'}`);
  if (withVent) {
    const vent = tryPlaceModule(state, ModuleType.Vent, ventTile);
    assert(vent.ok, `failed to place physical Vent: ${vent.reason ?? 'unknown'}`);
  }

  tick(state, 0.5);
  assert(state.ops.kitchenActive === 1, `loaded Kitchen did not activate (${state.ops.kitchenActive})`);
  return { state, stoveTile };
}

function runFor(state: StationState, seconds: number, observedTile: number): void {
  for (let elapsed = 0; elapsed < seconds; elapsed += STEP_SECONDS) {
    tick(state, STEP_SECONDS);
    assert(
      state.pressurized[observedTile],
      `comparison chamber lost pressure at ${state.now.toFixed(1)}s ` +
      `(integrity targets ${state.exteriorIntegrityTargets.length}, breaches ${state.exteriorIntegrityTargets.filter((target) => target.state === 'breached').length})`
    );
  }
}

function stoveDebt(state: StationState, stoveTile: number): number {
  const position = fromIndex(stoveTile, state.width);
  const diagnostic = getMaintenanceTileDiagnostic(state, position.x, position.y);
  assert(diagnostic, 'Stove did not create a production maintenance target');
  assert(
    diagnostic.source === 'high-load',
    `Stove maintenance source was ${diagnostic.source}, not high-load (active ${state.ops.kitchenActive}/${state.ops.kitchenTotal}, ` +
    `pressurized ${state.pressurized[stoveTile]})`
  );
  return diagnostic.debt;
}

const probe = createInitialState({ seed: SEED, manualTrafficAdmission: true });
const pair = findMatchedSinkPair(probe);
assert(
  Math.abs(pair.high.sunlight - pair.low.sunlight) <= SUNLIGHT_BIN_SIZE,
  `sunlight was not held constant (${pair.high.sunlight.toFixed(3)} vs ${pair.low.sunlight.toFixed(3)})`
);

const highSink = buildLoadedKitchen(pair.high, false);
const lowSink = buildLoadedKitchen(pair.low, false);
const mitigatedLowSink = buildLoadedKitchen(pair.low, true);
runFor(highSink.state, SETTLE_SECONDS, highSink.stoveTile);
runFor(lowSink.state, SETTLE_SECONDS, lowSink.stoveTile);
runFor(mitigatedLowSink.state, SETTLE_SECONDS, mitigatedLowSink.stoveTile);

const highHeat = highSink.state.heatByTile[highSink.stoveTile];
const lowHeat = lowSink.state.heatByTile[lowSink.stoveTile];
const mitigatedHeat = mitigatedLowSink.state.heatByTile[mitigatedLowSink.stoveTile];
const highDebt = stoveDebt(highSink.state, highSink.stoveTile);
const lowDebt = stoveDebt(lowSink.state, lowSink.stoveTile);
const mitigatedDebt = stoveDebt(mitigatedLowSink.state, mitigatedLowSink.stoveTile);

assert(
  highHeat <= lowHeat - 2.5,
  `high sink did not materially lower steady heat (${highHeat.toFixed(2)} vs ${lowHeat.toFixed(2)})`
);
assert(
  highDebt <= lowDebt - 0.08,
  `high sink did not lower loaded Stove maintenance debt (${highDebt.toFixed(3)} vs ${lowDebt.toFixed(3)})`
);
assert(
  mitigatedHeat <= lowHeat - 1.25,
  `physical Vent did not recover poor-sink heat (${mitigatedHeat.toFixed(2)} vs ${lowHeat.toFixed(2)})`
);
assert(
  mitigatedDebt <= lowDebt - 0.03,
  `physical Vent did not recover poor-sink maintenance debt (${mitigatedDebt.toFixed(3)} vs ${lowDebt.toFixed(3)})`
);
assert(
  mitigatedHeat >= highHeat - 0.5,
  `one Vent implausibly over-recovered beyond the natural sink comparison (${mitigatedHeat.toFixed(2)} vs ${highHeat.toFixed(2)})`
);

const lowPosition = fromIndex(lowSink.stoveTile, lowSink.state.width);
const lowDiagnostic = getThermalTileDiagnostic(lowSink.state, lowPosition.x, lowPosition.y);
assert(lowDiagnostic, 'poor-sink Kitchen lacked a thermal diagnosis');
assert(
  lowDiagnostic.thermalSink < pair.high.thermalSink,
  'thermal diagnosis did not preserve the deliberately poorer sink condition'
);

console.log(
  `thermal-sink-expansion-tests: ok | sun ${pair.high.sunlight.toFixed(3)}/${pair.low.sunlight.toFixed(3)} ` +
  `| sink ${pair.high.thermalSink.toFixed(3)}/${pair.low.thermalSink.toFixed(3)} ` +
  `| heat high/low/vent ${highHeat.toFixed(2)}/${lowHeat.toFixed(2)}/${mitigatedHeat.toFixed(2)} ` +
  `| debt ${highDebt.toFixed(3)}/${lowDebt.toFixed(3)}/${mitigatedDebt.toFixed(3)}`
);
