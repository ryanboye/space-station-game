import {
  createInitialState,
  getPowerNetworkDiagnostics,
  roomClusterHasLocalPower,
  setUtilityUnderlayTile,
  tick
} from '../src/sim/sim';
import { ModuleType, RoomType, toIndex } from '../src/sim/types';

function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function roomTiles(state: ReturnType<typeof createInitialState>, room: RoomType): number[] {
  const tiles: number[] = [];
  for (let tile = 0; tile < state.rooms.length; tile++) {
    if (state.rooms[tile] === room) tiles.push(tile);
  }
  return tiles;
}

const fresh = createInitialState({ seed: 36301 });
tick(fresh, 0);

const starterReactor = fresh.moduleInstances.find((module) => module.type === ModuleType.ReactorCore);
assertCondition(!!starterReactor, 'Fresh starts should contain a visible Reactor Core.');
assertCondition(
  starterReactor.width === 2 && starterReactor.height === 2 && starterReactor.tiles.length === 4,
  'The starter Reactor Core should occupy a 2x2 footprint.'
);
assertCondition(roomTiles(fresh, RoomType.Reactor).length === 5, 'The starter reactor should have one accessible door tile beside its 2x2 core.');

const starterPower = getPowerNetworkDiagnostics(fresh);
assertCondition(starterPower.sourceCount === 1, 'Fresh starts should commission exactly one wired power source.');
assertCondition(starterPower.poweredNetworkCount === 1, 'Fresh starter conduits should form one powered network.');
for (const room of [RoomType.Cafeteria, RoomType.Market, RoomType.Hygiene]) {
  const tiles = roomTiles(fresh, room);
  assertCondition(tiles.length > 0, `Fresh starter should contain ${room}.`);
  assertCondition(roomClusterHasLocalPower(fresh, room, tiles), `${room} should be powered at the start of play.`);
}

assertCondition(fresh.metrics.powerSupply > 0, 'The fresh reactor should contribute visible power supply.');
const utilization = fresh.metrics.powerDemand / fresh.metrics.powerSupply;
assertCondition(
  utilization >= 0.65 && utilization <= 0.75,
  `Starter utilization should be 65-75%, got ${(utilization * 100).toFixed(1)}%.`
);
assertCondition(
  (fresh.metrics.powerDemand + 1.3) / fresh.metrics.powerSupply >= 0.75,
  'One additional cafeteria-scale service load should noticeably pressure the starter reserve.'
);

// A legacy state with no source remains on the fallback even if its player
// lays a preliminary cable; only installing a source commissions strict grid
// behavior. This prevents the historical first-cable blackout.
const legacy = createInitialState({ seed: 36302 });
legacy.moduleInstances = legacy.moduleInstances.filter((module) => module.type !== ModuleType.ReactorCore);
for (let tile = 0; tile < legacy.modules.length; tile++) {
  if (legacy.modules[tile] === ModuleType.ReactorCore) legacy.modules[tile] = ModuleType.None;
  legacy.utilityUnderlay.layers['power-conduit'][tile] = 0;
}
const cafeteria = roomTiles(legacy, RoomType.Cafeteria);
assertCondition(roomClusterHasLocalPower(legacy, RoomType.Cafeteria, cafeteria), 'Uncommissioned legacy state should retain fallback power.');
assertCondition(
  setUtilityUnderlayTile(legacy, 'power-conduit', cafeteria[0], true),
  'Expected a preliminary legacy conduit to be placeable.'
);
assertCondition(
  roomClusterHasLocalPower(legacy, RoomType.Cafeteria, cafeteria),
  'A first legacy cable without a generator must not cause a blackout.'
);

// Custom starter templates may already contain a reactor but predate saved
// utility underlays. They stay on fallback power until a conduit reaches the
// source, rather than blacking out merely because the reactor sprite exists.
const customStarter = createInitialState({ seed: 36303 });
for (let tile = 0; tile < customStarter.modules.length; tile++) {
  customStarter.utilityUnderlay.layers['power-conduit'][tile] = 0;
}
customStarter.utilityUnderlay.version += 1;
const customCafeteria = roomTiles(customStarter, RoomType.Cafeteria);
assertCondition(
  roomClusterHasLocalPower(customStarter, RoomType.Cafeteria, customCafeteria),
  'A custom starter with an unwired reactor should retain fallback power.'
);
assertCondition(
  setUtilityUnderlayTile(customStarter, 'power-conduit', customCafeteria[0], true),
  'Expected a loose custom-starter conduit to be placeable.'
);
assertCondition(
  roomClusterHasLocalPower(customStarter, RoomType.Cafeteria, customCafeteria),
  'A loose cable away from the reactor must not commission strict grid behavior.'
);

console.log('opening-power-tests: PASS');
