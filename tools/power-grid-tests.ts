import {
  createInitialState,
  getPowerNetworkDiagnostics,
  roomClusterHasLocalPower,
  setRoom,
  setTile,
  setUtilityUnderlayTile,
  tryPlaceModule
} from '../src/sim/sim';
import { ModuleType, RoomType, TileType, toIndex } from '../src/sim/types';

function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const state = createInitialState({ seed: 9127 });
const roomTiles: number[] = [];
for (let x = 10; x <= 16; x++) {
  const tile = toIndex(x, 10, state.width);
  setTile(state, tile, TileType.Floor);
  if (x >= 14) {
    setRoom(state, tile, RoomType.Cafeteria);
    roomTiles.push(tile);
  }
}

assertCondition(roomClusterHasLocalPower(state, RoomType.Cafeteria, roomTiles), 'Legacy station should work before its grid is commissioned.');
setUtilityUnderlayTile(state, 'power-conduit', roomTiles[0], true);
assertCondition(!roomClusterHasLocalPower(state, RoomType.Cafeteria, roomTiles), 'A disconnected powered room should be inactive.');

const sourceTile = toIndex(10, 10, state.width);
const solar = tryPlaceModule(state, ModuleType.SolarPanel, sourceTile, 0);
assertCondition(solar.ok, `Solar panel placement failed: ${solar.reason ?? 'unknown reason'}`);
for (let x = 10; x <= 14; x++) {
  setUtilityUnderlayTile(state, 'power-conduit', toIndex(x, 10, state.width), true);
}

assertCondition(roomClusterHasLocalPower(state, RoomType.Cafeteria, roomTiles), 'Solar-connected room should receive local power.');
const diagnostics = getPowerNetworkDiagnostics(state);
assertCondition(diagnostics.poweredNetworkCount === 1, 'Expected one powered electrical network.');
assertCondition(diagnostics.poweredSinkCount > 0, 'Expected the cafeteria branch to register powered sinks.');

const reactorState = createInitialState({ seed: 4815 });
const reactorTiles: number[] = [];
for (let y = 20; y <= 21; y++) {
  for (let x = 20; x <= 21; x++) {
    const tile = toIndex(x, y, reactorState.width);
    setTile(reactorState, tile, TileType.Floor);
    setRoom(reactorState, tile, RoomType.Reactor);
    reactorTiles.push(tile);
  }
}
const reactorCore = tryPlaceModule(reactorState, ModuleType.ReactorCore, reactorTiles[0], 0);
assertCondition(reactorCore.ok, `Reactor Core placement failed: ${reactorCore.reason ?? 'unknown reason'}`);
setUtilityUnderlayTile(reactorState, 'power-conduit', reactorTiles[0], true);
const reactorDiagnostics = getPowerNetworkDiagnostics(reactorState);
assertCondition(reactorDiagnostics.sourceCount === 1, 'A wired Reactor Core should register as a power source.');

console.log('power-grid-tests: PASS');
