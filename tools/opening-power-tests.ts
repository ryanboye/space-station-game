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
// OPEN-01 made the starter commercially empty, so the wired opening rooms are
// the crew mess and the hygiene block. There is deliberately no Market: the
// player chooses and builds the first business, and the reactor run has to
// reach it afterwards.
for (const room of [RoomType.Cafeteria, RoomType.Hygiene]) {
  const tiles = roomTiles(fresh, room);
  assertCondition(tiles.length > 0, `Fresh starter should contain ${room}.`);
  assertCondition(roomClusterHasLocalPower(fresh, room, tiles), `${room} should be powered at the start of play.`);
}
assertCondition(roomTiles(fresh, RoomType.Market).length === 0, 'The starter should ship no Market to power.');
assertCondition(
  fresh.ops.cafeteriasActive === 1 && fresh.ops.hygieneActive === 1,
  `Starter service load should be exactly the crew mess and hygiene block (cafeteria ${fresh.ops.cafeteriasActive}, hygiene ${fresh.ops.hygieneActive}).`
);
assertCondition(
  fresh.ops.marketActive === 0 && fresh.ops.loungeActive === 0 && fresh.ops.cantinaActive === 0,
  'The starter should carry no commercial power load at all.'
);

assertCondition(fresh.metrics.powerSupply > 0, 'The fresh reactor should contribute visible power supply.');
// Re-baselined after OPEN-01: removing the starter Market dropped the opening
// draw from 12.4 to 11.3 against the same 18-unit reactor, so the authored
// starter now sits near 63% rather than the ~70% dfc9fa7 tuned for.
const utilization = fresh.metrics.powerDemand / fresh.metrics.powerSupply;
assertCondition(
  utilization >= 0.55 && utilization <= 0.70,
  `Starter utilization should be 55-70%, got ${(utilization * 100).toFixed(1)}%.`
);
// The player's first business is a powered public room (Market, Lounge or
// Cantina all draw ~1.1). It fits under the starter reactor, but it visibly
// spends the reserve rather than disappearing into it.
const FIRST_BUSINESS_POWER_DRAW = 1.1;
const withFirstBusiness = (fresh.metrics.powerDemand + FIRST_BUSINESS_POWER_DRAW) / fresh.metrics.powerSupply;
assertCondition(
  withFirstBusiness >= 0.65 && withFirstBusiness < 1,
  `One opening business should pressure but not exceed the starter reserve, got ${(withFirstBusiness * 100).toFixed(1)}%.`
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
