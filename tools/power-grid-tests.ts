import {
  createInitialState,
  getPowerNetworkDiagnostics,
  removeModuleAtTile,
  roomClusterHasLocalPower,
  setRoom,
  setTile,
  setUtilityUnderlayTile,
  tryPlaceModule
} from '../src/sim/sim';
import { ModuleType, RoomType, TileType, toIndex, type StationState } from '../src/sim/types';

function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// Fresh stations now ship a commissioned reactor grid ("feat: add honest
// starter power grid"), so `createInitialState` is no longer an uncommissioned
// station. This runner is about the commissioning rules themselves, so each
// fixture is explicitly decommissioned first: no wired source, no conduit.
function decommissionStarterGrid(state: StationState): void {
  for (const module of [...state.moduleInstances]) {
    if (module.type !== ModuleType.ReactorCore && module.type !== ModuleType.SolarPanel) continue;
    assertCondition(
      removeModuleAtTile(state, module.originTile),
      `Starter ${module.type} should be removable through the simulation API.`
    );
  }
  for (let tile = 0; tile < state.tiles.length; tile++) {
    setUtilityUnderlayTile(state, 'power-conduit', tile, false);
  }
  assertCondition(
    getPowerNetworkDiagnostics(state).sourceCount === 0,
    'Decommissioned fixture should retain no wired power source.'
  );
}

const state = createInitialState({ seed: 9127 });
decommissionStarterGrid(state);
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

// Grid enforcement begins at the source, not at the wire: the first cable on a
// station that still has no generator must not black the station out.
setUtilityUnderlayTile(state, 'power-conduit', roomTiles[0], true);
assertCondition(
  roomClusterHasLocalPower(state, RoomType.Cafeteria, roomTiles),
  'A first cable without a generator must not cause a blackout.'
);

const sourceTile = toIndex(10, 10, state.width);
const solar = tryPlaceModule(state, ModuleType.SolarPanel, sourceTile, 0);
assertCondition(solar.ok, `Solar panel placement failed: ${solar.reason ?? 'unknown reason'}`);
// Wiring the panel commissions the grid. The cafeteria's own stub of cable
// never reaches it, so the room is now genuinely dark.
setUtilityUnderlayTile(state, 'power-conduit', sourceTile, true);
assertCondition(
  !roomClusterHasLocalPower(state, RoomType.Cafeteria, roomTiles),
  'A disconnected powered room should be inactive once a source is commissioned.'
);

for (let x = 10; x <= 14; x++) {
  setUtilityUnderlayTile(state, 'power-conduit', toIndex(x, 10, state.width), true);
}

assertCondition(roomClusterHasLocalPower(state, RoomType.Cafeteria, roomTiles), 'Solar-connected room should receive local power.');
const diagnostics = getPowerNetworkDiagnostics(state);
assertCondition(diagnostics.poweredNetworkCount === 1, 'Expected one powered electrical network.');
assertCondition(diagnostics.poweredSinkCount > 0, 'Expected the cafeteria branch to register powered sinks.');

const reactorState = createInitialState({ seed: 4815 });
decommissionStarterGrid(reactorState);
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
