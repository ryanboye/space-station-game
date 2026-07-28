import {
  canPlaceUtilityUnderlay,
  createInitialState,
  getPodDockAttachmentView,
  getPodDockFuelSupplyView,
  orderFuelDetailed,
  setDockPurpose,
  setRoom,
  setUtilityUnderlayTile,
  tick,
  tryPlaceModuleWithCredits
} from '../src/sim/index';
import { OPENING_BALANCE } from '../src/sim/balance';
import { evaluateOpeningRecipes } from '../src/sim/opening-recipes';
import { ModuleType, RoomType, TileType, type StationState } from '../src/sim/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function advanceUntil(state: StationState, condition: () => boolean, maxSeconds: number, message: string): void {
  for (let elapsed = 0; elapsed < maxSeconds; elapsed += 1) {
    tick(state, 1);
    if (condition()) return;
  }
  throw new Error(`${message} after ${maxSeconds}s`);
}

function findOpenMaintenancePocket(state: StationState): number {
  for (let y = 0; y < state.height - 1; y += 1) {
    for (let x = 0; x < state.width - 1; x += 1) {
      const origin = y * state.width + x;
      const tiles = [origin, origin + 1, origin + state.width, origin + state.width + 1];
      if (!tiles.every((tile) =>
        state.tiles[tile] === TileType.Floor &&
        state.rooms[tile] === RoomType.None &&
        state.moduleOccupancyByTile[tile] === null
      )) continue;
      for (const tile of tiles) setRoom(state, tile, RoomType.Maintenance);
      return origin;
    }
  }
  throw new Error('no empty 2x2 starter-apron footprint for the Fuel Tank');
}

function attachFuelCoupler(state: StationState): number {
  for (let tile = 0; tile < state.tiles.length; tile += 1) {
    if (!getPodDockAttachmentView(state, ModuleType.FuelCoupler, tile).valid) continue;
    const placement = tryPlaceModuleWithCredits(state, ModuleType.FuelCoupler, tile);
    if (!placement.ok) throw new Error(`Fuel Coupler placement failed: ${placement.reason}`);
    return tile;
  }
  throw new Error('no valid Fuel Coupler mount beside a starter Pod Dock');
}

function findCouplerServiceTile(state: StationState, couplerTile: number): number {
  const x = couplerTile % state.width;
  const y = Math.floor(couplerTile / state.width);
  const neighbors = [
    [x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]
  ];
  for (const [nx, ny] of neighbors) {
    if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) continue;
    const tile = ny * state.width + nx;
    if (canPlaceUtilityUnderlay(state, 'fuel-pipe', tile) && state.tiles[tile] !== TileType.Wall) return tile;
  }
  throw new Error('Fuel Coupler has no usable interior fuel-pipe service tile');
}

function fuelPipePath(state: StationState, start: number, goal: number): number[] {
  const previous = new Int32Array(state.tiles.length).fill(-1);
  const queue = [start];
  previous[start] = start;
  for (let head = 0; head < queue.length; head += 1) {
    const tile = queue[head];
    if (tile === goal) break;
    const x = tile % state.width;
    const y = Math.floor(tile / state.width);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) continue;
      const next = ny * state.width + nx;
      if (previous[next] >= 0 || !canPlaceUtilityUnderlay(state, 'fuel-pipe', next)) continue;
      previous[next] = tile;
      queue.push(next);
    }
  }
  if (previous[goal] < 0) throw new Error('no legal fuel-pipe route from Fuel Tank to Fuel Coupler');
  const path: number[] = [];
  for (let tile = goal; tile !== start; tile = previous[tile]) path.push(tile);
  path.push(start);
  return path.reverse();
}

function fuelStock(state: StationState): number {
  const tanks = new Set(
    state.moduleInstances.filter((module) => module.type === ModuleType.FuelTank).map((module) => module.originTile)
  );
  return state.itemNodes.reduce((total, node) => total + (tanks.has(node.tileIndex) ? node.items.fuel ?? 0 : 0), 0);
}

function serviceShipsRecipe(state: StationState) {
  const recipe = evaluateOpeningRecipes(state).find((candidate) => candidate.id === 'service-ships');
  assert(recipe, 'missing Refuel Pods opening recipe');
  return recipe;
}

function testRefuelPodsStartToRevenue(): void {
  const state = createInitialState({ seed: 411, physicalStarterInventory: true, manualTrafficAdmission: true });
  tick(state, 0);

  // Build the missing opening machine on the real starter shell.
  const tankOrigin = findOpenMaintenancePocket(state);
  const couplerTile = attachFuelCoupler(state);
  const couplerAttachment = getPodDockAttachmentView(state, ModuleType.FuelCoupler, couplerTile);
  assert(couplerAttachment.dockModuleId !== null, 'Fuel Coupler did not identify its attached Pod Dock');
  const tank = tryPlaceModuleWithCredits(state, ModuleType.FuelTank, tankOrigin);
  if (!tank.ok) throw new Error(`Fuel Tank placement failed: ${tank.reason}`);
  const serviceTile = findCouplerServiceTile(state, couplerTile);
  const path = fuelPipePath(state, tankOrigin, serviceTile);
  for (const tile of path) {
    if (state.utilityUnderlay.layers['fuel-pipe'][tile]) continue;
    assert(setUtilityUnderlayTile(state, 'fuel-pipe', tile, true), `could not draw Fuel Pipe at tile ${tile}`);
  }
  tick(state, 0);

  const fuelDock = state.docks.find((dock) => dock.moduleId === couplerAttachment.dockModuleId);
  assert(fuelDock, 'Fuel Coupler did not attach to a live Pod Dock');
  const fuelSupply = getPodDockFuelSupplyView(state, fuelDock.id);
  assert(fuelSupply.connected, `Fuel machine is disconnected: ${fuelSupply.reason ?? 'unknown reason'}`);

  // The opening stock arrives through the normal Freight Locker pod service.
  const freightDock = state.docks.find((dock) => dock.podCapabilities?.includes('freight'));
  assert(freightDock, 'starter has no Freight Locker Pod Dock');
  for (const dock of state.docks) setDockPurpose(state, dock.id, dock.id === freightDock.id ? 'visitor' : 'residential');
  state.controls.paused = false;
  const fuelOrder = orderFuelDetailed(state);
  assert(fuelOrder.ok, fuelOrder.message);
  const fuelBeforeDelivery = fuelStock(state);
  advanceUntil(
    state,
    () => fuelStock(state) >= fuelBeforeDelivery + OPENING_BALANCE.fuelLot.units,
    120,
    'fuel supplier pod did not unload into the Fuel Tank'
  );
  const purchaseEvents = state.openingEconomy.ledger.recent.filter((event) => event.kind === 'supplier-purchase');
  assert(purchaseEvents.length === 1, `fuel order charged ${purchaseEvents.length} times`);

  const recipe = serviceShipsRecipe(state);
  assert(recipe.operational, `Refuel Pods recipe is not operational: ${recipe.operationalReasons.join('; ')}`);

  // Now expose only the completed refuel dock to ordinary walk-in traffic.
  for (const dock of state.docks) setDockPurpose(state, dock.id, dock.id === fuelDock.id ? 'visitor' : 'residential');
  const fuelBeforeSale = fuelStock(state);
  advanceUntil(
    state,
    () => state.openingEconomy.ledger.lifetime['fuel-sale'].count > 0,
    180,
    'ordinary Pod Dock traffic did not complete a refuel'
  );
  const fuelSales = state.openingEconomy.ledger.recent.filter((event) => event.kind === 'fuel-sale');
  assert(fuelSales.length === 1, `expected exactly one fuel-sale ledger event, got ${fuelSales.length}`);
  assert(fuelSales[0].credits > 0, `fuel sale did not earn positive revenue (${fuelSales[0].credits})`);
  assert(fuelStock(state) < fuelBeforeSale, `fuel stock did not decrease (${fuelBeforeSale} -> ${fuelStock(state)})`);
}

testRefuelPodsStartToRevenue();
console.log('PASS opening refuel cycle');
