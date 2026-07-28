import {
  createInitialState,
  setRoom,
  tick,
  tryPlaceModule
} from '../src/sim';
import { OPENING_BALANCE } from '../src/sim/balance';
import { evaluateOpeningRecipes } from '../src/sim/opening-recipes';
import { ModuleType, RoomType, TileType, ZoneType, type StationState } from '../src/sim/types';

let failures = 0;

function check(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`  FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function fresh(): StationState {
  const state = createInitialState({ physicalStarterInventory: true, manualTrafficAdmission: true });
  tick(state, 0);
  return state;
}

function publicRoom(state: StationState, room: RoomType, width: number, height: number): number[] {
  for (let y = 1; y <= state.height - height - 1; y += 1) {
    for (let x = 1; x <= state.width - width - 1; x += 1) {
      const tiles: number[] = [];
      let valid = true;
      for (let dy = 0; dy < height && valid; dy += 1) {
        for (let dx = 0; dx < width && valid; dx += 1) {
          const tile = (y + dy) * state.width + x + dx;
          if (
            state.tiles[tile] !== TileType.Floor ||
            state.rooms[tile] !== RoomType.None ||
            state.moduleOccupancyByTile[tile] !== null
          ) valid = false;
          tiles.push(tile);
        }
      }
      if (!valid) continue;
      for (const tile of tiles) {
        setRoom(state, tile, room);
        state.zones[tile] = ZoneType.Public;
      }
      tick(state, 0);
      return tiles;
    }
  }
  throw new Error(`no free ${width}x${height} ${room} footprint in the starter apron`);
}

function placeIn(state: StationState, tiles: number[], module: ModuleType): number {
  for (const rotation of [0, 90] as const) {
    for (const tile of tiles) {
      const placed = tryPlaceModule(state, module, tile, rotation);
      if (placed.ok) return tile;
    }
  }
  throw new Error(`could not place ${module}`);
}

function stock(state: StationState, origin: number, item: 'meal' | 'cleanTray' | 'tradeGood', amount: number): void {
  const node = state.itemNodes.find((candidate) => candidate.tileIndex === origin);
  assert(node, `no node at ${origin}`);
  node.items[item] = amount;
}

function recipe(state: StationState, id: 'feed-travelers' | 'sell-supplies' | 'service-ships') {
  const found = evaluateOpeningRecipes(state).find((candidate) => candidate.id === id);
  assert(found, `missing ${id}`);
  return found;
}

console.log('OPENING BUSINESS TRUTH');

check('fresh station is life-safe but has no operating public business', () => {
  const state = fresh();
  const recipes = evaluateOpeningRecipes(state);
  assert(recipes.every((entry) => !entry.operational), 'fresh station opened a business');
  assert(
    recipe(state, 'feed-travelers').candidateAccess === 'restricted',
    'starter crew-mess progress was not identified as a restricted conversion candidate'
  );
  const crewMess = state.rooms
    .map((room, tile) => ({ room, tile }))
    .filter((entry) => entry.room === RoomType.Cafeteria);
  assert(crewMess.length > 0 && crewMess.every((entry) => state.zones[entry.tile] === ZoneType.Restricted), 'crew mess is not restricted');
});

check('cash funds one opening operation, not two', () => {
  const state = fresh();
  const costs = evaluateOpeningRecipes(state).map((entry) => entry.remainingCostCredits).sort((a, b) => a - b);
  assert(costs.every((cost) => cost > 0 && cost <= OPENING_BALANCE.startingCredits), 'an opening operation is not immediately fundable');
  assert(costs[0] + costs[1] > OPENING_BALANCE.startingCredits, 'opening cash buys two businesses');
});

check('public cafeteria requires one coherent 20-tile meal machine and public counter stock', () => {
  const state = fresh();
  const tiles = publicRoom(state, RoomType.Cafeteria, 3, 7);
  const counterA = placeIn(state, tiles, ModuleType.ServingStation);
  const counterB = placeIn(state, tiles, ModuleType.ServingStation);
  placeIn(state, tiles, ModuleType.Table);
  placeIn(state, tiles, ModuleType.Table);
  placeIn(state, tiles, ModuleType.TrayReturn);
  tick(state, 0);
  assert(recipe(state, 'feed-travelers').built, 'complete public cafeteria did not register');
  assert(!recipe(state, 'feed-travelers').operational, 'unstocked cafeteria opened');
  stock(state, counterA, 'meal', 6);
  stock(state, counterA, 'cleanTray', 6);
  stock(state, counterB, 'meal', 6);
  stock(state, counterB, 'cleanTray', 6);
  const opened = recipe(state, 'feed-travelers');
  assert(opened.operational, `stocked public cafeteria did not open: ${opened.operationalReasons.join(' | ')}`);
});

check('opening market ignores a stall and needs shelf stock with checkout', () => {
  const state = fresh();
  const tiles = publicRoom(state, RoomType.Market, 3, 8);
  placeIn(state, tiles, ModuleType.MarketStall);
  tick(state, 0);
  assert(!recipe(state, 'sell-supplies').built, 'market stall opened the authored shop');
  placeIn(state, tiles, ModuleType.CheckoutBank);
  const shelf = placeIn(state, tiles, ModuleType.ShelfAisle);
  tick(state, 0);
  assert(recipe(state, 'sell-supplies').built, 'checkout and shelf did not establish market');
  assert(!recipe(state, 'sell-supplies').operational, 'empty shelf opened market');
  stock(state, shelf, 'tradeGood', OPENING_BALANCE.travelSupplyBatch.units);
  const opened = recipe(state, 'sell-supplies');
  assert(opened.operational, `stocked shelf did not open market: ${opened.operationalReasons.join(' | ')}`);
});

check('Refuel Pods names only the service the opening actually delivers', () => {
  const refuel = recipe(fresh(), 'service-ships');
  assert(refuel.title === 'Refuel Pods', `title was ${refuel.title}`);
  assert(refuel.summary.includes('refueling only'), 'refuel card implies unavailable dry-dock work');
});

check('a missing public cafeteria creates visible missed demand, never a fake doorway queue', () => {
  const state = fresh();
  state.controls.paused = false;
  state.controls.manualTrafficAdmission = false;
  state.controls.shipsPerCycle = 4;
  let firstStationVisitorId: number | null = null;
  let firstStationTile: number | null = null;
  let clearedArrivalTile = false;
  for (let elapsed = 0; elapsed < 45; elapsed += 0.1) {
    tick(state, 0.1);
    if (firstStationVisitorId === null) {
      const emerged = state.visitors.find((visitor) => (visitor.transferPhase ?? 'station') === 'station');
      if (emerged) {
        firstStationVisitorId = emerged.id;
        firstStationTile = emerged.tileIndex;
      }
    } else {
      const visitor = state.visitors.find((candidate) => candidate.id === firstStationVisitorId);
      if (!visitor || visitor.tileIndex !== firstStationTile) clearedArrivalTile = true;
    }
  }
  assert(
    !state.visitors.some((visitor) => visitor.state === 'queueing' && visitor.queueProviderTile === null),
    'visitor entered a queue without a physical public provider'
  );
  assert(
    state.derived.queueTheater.eventFeed.some((event) => event.text.includes('could not find public food service')),
    'missing public food produced no visible missed-demand event'
  );
  assert(firstStationVisitorId !== null && clearedArrivalTile, 'unsupported diner waited on the passenger arrival tile');
});

if (failures > 0) process.exit(1);
console.log('6/6 opening business checks passed');
