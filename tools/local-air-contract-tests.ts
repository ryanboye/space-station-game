import { applyColdStartScenario } from '../src/sim/cold-start-scenarios';
import {
  createInitialState,
  getLifeSupportCoverageDiagnostics,
  isOperationalAirUnsafe,
  tick
} from '../src/sim/sim';
import { ModuleType, RoomType, TileType, type CrewMember, type StationState } from '../src/sim/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function normalScaleState(): StationState {
  const state = createInitialState({ seed: 4242 });
  assert(applyColdStartScenario(state, 'normal-scale-50'), 'normal-scale-50 scenario was unavailable');
  state.controls.paused = false;
  state.controls.simSpeed = 1;
  state.controls.shipsPerCycle = 0;
  return state;
}

function pinCrewAt(state: StationState, crew: CrewMember, tileIndex: number): void {
  crew.tileIndex = tileIndex;
  crew.x = tileIndex % state.width + 0.5;
  crew.y = Math.floor(tileIndex / state.width) + 0.5;
  crew.path = [];
  crew.speed = 0;
  crew.targetTile = tileIndex;
  crew.retargetAt = Number.POSITIVE_INFINITY;
  crew.activeJobId = null;
  crew.carryingItemType = null;
  crew.carryingAmount = 0;
  crew.airExposureSec = 0;
  crew.healthState = 'healthy';
  crew.evaSuit = false;
  crew.evaOxygenSec = 0;
  crew.energy = 100;
  crew.hunger = 100;
  crew.hygiene = 100;
  crew.bladder = 100;
  crew.thirst = 100;
}

function tickUntil(
  state: StationState,
  condition: () => boolean,
  maxSeconds: number,
  step = 0.25
): void {
  let elapsed = 0;
  while (!condition() && elapsed < maxSeconds) {
    tick(state, step);
    elapsed += step;
  }
}

function isWalkableTile(tile: TileType): boolean {
  return tile === TileType.Floor || tile === TileType.Door || tile === TileType.Airlock || tile === TileType.Dock;
}

function testDistantReachableAirIsAdvisory(): string {
  const state = normalScaleState();
  const coverage = getLifeSupportCoverageDiagnostics(state);
  const crew = state.crewMembers.find((candidate) => coverage.distanceByTile[candidate.tileIndex] > 24);
  assert(crew, 'authored normal-scale station had no crew in distant reachable coverage');
  const tile = crew.tileIndex;
  assert(state.pressurized[tile], 'distant authored crew tile was not pressurized');
  assert(coverage.distanceByTile[tile] > 24, 'distant authored crew tile was not reachable beyond the advisory distance');

  pinCrewAt(state, crew, tile);
  state.airQualityByTile[tile] = 28;
  tick(state, 0.25);

  const air = state.airQualityByTile[tile];
  assert(air >= 27.5 && air <= 28.5, `distant reachable air did not remain near its 28 target (${air.toFixed(2)})`);
  assert(!isOperationalAirUnsafe(state, tile), `reachable AQ ${air.toFixed(2)} was incorrectly unsafe`);
  assert(crew.airExposureSec === 0, `reachable advisory air accumulated ${crew.airExposureSec.toFixed(2)}s exposure`);
  return `reachable distance ${coverage.distanceByTile[tile]} stayed advisory at AQ ${air.toFixed(1)}`;
}

function testUnreachableAirSettlesToDistress(): string {
  const state = normalScaleState();
  const coverage = getLifeSupportCoverageDiagnostics(state);
  const tile = state.tiles.findIndex((kind, index) =>
    isWalkableTile(kind) &&
    state.pressurized[index] &&
    state.rooms[index] !== RoomType.Berth &&
    coverage.distanceByTile[index] < 0
  );
  assert(tile >= 0, 'authored normal-scale station had no pressurized unreachable tile');
  const crew = state.crewMembers[0];
  assert(crew, 'normal-scale station had no crew');
  pinCrewAt(state, crew, tile);
  state.airQualityByTile[tile] = 100;

  tick(state, 0.25);
  const firstStep = state.airQualityByTile[tile];
  assert(firstStep > 15 && firstStep < 100, `unreachable air did not begin a smoothed descent (${firstStep.toFixed(2)})`);
  tickUntil(state, () => state.airQualityByTile[tile] <= 15 && crew.airExposureSec > 0, 30);

  const air = state.airQualityByTile[tile];
  assert(air <= 15, `unreachable air stopped above the actor distress boundary (${air.toFixed(3)})`);
  assert(isOperationalAirUnsafe(state, tile), `unreachable AQ ${air.toFixed(2)} was not unsafe`);
  assert(crew.airExposureSec > 0, 'unreachable distress air did not accumulate actor exposure');
  return `unreachable air smoothed ${firstStep.toFixed(1)} -> ${air.toFixed(1)} and exposed its occupant`;
}

function testFireAirSettlesToDistress(): string {
  const state = normalScaleState();
  const coverage = getLifeSupportCoverageDiagnostics(state);
  const tile = state.tiles.findIndex((kind, index) =>
    kind === TileType.Floor &&
    state.pressurized[index] &&
    state.rooms[index] !== RoomType.Berth &&
    state.modules[index] === ModuleType.None &&
    coverage.distanceByTile[index] >= 0 &&
    coverage.distanceByTile[index] <= 16
  );
  assert(tile >= 0, 'authored normal-scale station had no suitable reachable fire tile');
  const crew = state.crewMembers[0];
  assert(crew, 'normal-scale station had no crew');
  pinCrewAt(state, crew, tile);
  state.airQualityByTile[tile] = 100;
  state.effects.fires.push({
    anchorTile: tile,
    system: 'life-support',
    intensity: 1,
    ignitedAt: state.now,
    lastTick: state.now
  });

  tick(state, 0.25);
  const firstStep = state.airQualityByTile[tile];
  assert(firstStep > 15 && firstStep < 100, `fire air did not preserve smoothed onset (${firstStep.toFixed(2)})`);
  tickUntil(state, () => state.airQualityByTile[tile] <= 15 && crew.airExposureSec > 0, 30);

  const air = state.airQualityByTile[tile];
  assert(air <= 15, `fire-affected air stopped above the actor distress boundary (${air.toFixed(3)})`);
  assert(isOperationalAirUnsafe(state, tile), `fire-affected AQ ${air.toFixed(2)} was not unsafe`);
  assert(crew.airExposureSec > 0, 'fire-affected distress air did not accumulate actor exposure');
  return `fire air smoothed ${firstStep.toFixed(1)} -> ${air.toFixed(1)} and exposed its occupant`;
}

function testPressureAndBerthAbstraction(): string {
  const state = normalScaleState();
  const ordinaryTile = state.tiles.findIndex((kind, index) =>
    kind === TileType.Floor && state.rooms[index] !== RoomType.Berth
  );
  const berthTile = state.rooms.findIndex((room) => room === RoomType.Berth);
  assert(ordinaryTile >= 0, 'normal-scale station had no ordinary floor tile');
  assert(berthTile >= 0, 'normal-scale station had no Berth tile');

  state.pressurized[ordinaryTile] = false;
  state.airQualityByTile[ordinaryTile] = 100;
  assert(isOperationalAirUnsafe(state, ordinaryTile), 'unpressurized ordinary floor was not unsafe immediately');

  state.pressurized[berthTile] = false;
  state.airQualityByTile[berthTile] = 0;
  assert(!isOperationalAirUnsafe(state, berthTile), 'Berth suit/ship-seal abstraction was lost');
  return 'unpressurized floor is unsafe while vacuum-rated Berth operations remain abstracted safe';
}

const tests: Array<[string, () => string]> = [
  ['distant reachable air is advisory', testDistantReachableAirIsAdvisory],
  ['unreachable air reaches actor distress truth', testUnreachableAirSettlesToDistress],
  ['fire air reaches actor distress truth', testFireAirSettlesToDistress],
  ['pressure and Berth abstraction share one predicate', testPressureAndBerthAbstraction]
];

for (const [name, run] of tests) {
  const evidence = run();
  console.log(`ok   ${name}`);
  console.log(`     ${evidence}`);
}

console.log(`local-air-contract-tests: ok ${tests.length}/${tests.length}`);
