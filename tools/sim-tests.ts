import {
  buyMaterials,
  buyMaterialsDetailed,
  buyRawFood,
  collectServiceNodeReachability,
  expandMap,
  createInitialState,
  getNextExpansionCost,
  setDockPurpose,
  getResidentInspectorById,
  setRoomHousingPolicy,
  getVisitorInspectorById,
  getRoomDiagnosticAt,
  getRoomInspectorAt,
  sellMaterials,
  setRoom,
  setTile,
  tick,
  tryPlaceModule
} from '../src/sim/sim';
import {
  captureSnapshot,
  hydrateStateFromSave,
  parseAndMigrateSave,
  serializeSave,
  type StationSaveEnvelopeV1
} from '../src/sim/save';
import {
  ModuleType,
  RoomType,
  ResidentState,
  TileType,
  VisitorState,
  fromIndex,
  toIndex,
  type ModuleRotation,
  type ArrivingShip,
  type StationState,
  type Visitor
} from '../src/sim/types';

function assertCondition(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function runFor(state: StationState, seconds: number, step = 0.25): void {
  const steps = Math.ceil(seconds / step);
  for (let i = 0; i < steps; i++) {
    tick(state, step);
  }
}

function buildHabitat(state: StationState): void {
  state.controls.paused = false;
  state.controls.simSpeed = 1;
  state.controls.shipsPerCycle = 0;
  state.tiles.fill(TileType.Space);
  state.rooms.fill(RoomType.None);
  state.modules.fill(ModuleType.None);
  state.moduleInstances = [];
  state.moduleOccupancyByTile.fill(null);
  state.jobs.length = 0;
  state.itemNodes.length = 0;
  state.visitors.length = 0;
  state.residents.length = 0;
  state.arrivingShips.length = 0;
  state.dockQueue.length = 0;
  state.docks.length = 0;

  const x0 = 4;
  const y0 = 4;
  const x1 = 44;
  const y1 = 30;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      setTile(state, toIndex(x, y, state.width), TileType.Floor);
    }
  }
  for (let x = x0; x <= x1; x++) {
    setTile(state, toIndex(x, y0, state.width), TileType.Wall);
    setTile(state, toIndex(x, y1, state.width), TileType.Wall);
  }
  for (let y = y0; y <= y1; y++) {
    setTile(state, toIndex(x0, y, state.width), TileType.Wall);
    setTile(state, toIndex(x1, y, state.width), TileType.Wall);
  }

  setTile(state, state.core.centerTile, TileType.Floor);
  setTile(state, state.core.serviceTile, TileType.Floor);
}

function dockByIdOrThrow(state: StationState, dockId: number) {
  const dock = state.docks.find((d) => d.id === dockId);
  assertCondition(!!dock, `Expected dock ${dockId} to exist.`);
  return dock!;
}

function placeEastHullDock(state: StationState, y0: number, y1: number): number {
  const x = 44;
  for (let y = y0; y <= y1; y++) {
    setTile(state, toIndex(x, y, state.width), TileType.Dock);
  }
  const anchor = toIndex(x, y0, state.width);
  const dock = state.docks.find((d) => d.tiles.includes(anchor));
  assertCondition(!!dock, `Expected dock cluster at east hull y=${y0}-${y1}.`);
  return dock!.id;
}

function setupPrivateResidentHousing(state: StationState): { cabinTile: number; bedModuleId: number } {
  paintRoom(state, RoomType.Dorm, 10, 22, 13, 25);
  paintRoom(state, RoomType.Hygiene, 15, 22, 17, 24);
  const dormPolicyOk = setRoomHousingPolicy(state, toIndex(10, 22, state.width), 'private_resident');
  const hygienePolicyOk = setRoomHousingPolicy(state, toIndex(15, 22, state.width), 'resident');
  assertCondition(dormPolicyOk, 'Expected to set dorm housing policy to private_resident.');
  assertCondition(hygienePolicyOk, 'Expected to set hygiene housing policy to resident.');
  placeModuleOrThrow(state, ModuleType.Bed, 11, 23);
  const bedOrigin = toIndex(11, 23, state.width);
  const bed = state.moduleInstances.find((m) => m.type === ModuleType.Bed && m.originTile === bedOrigin);
  assertCondition(!!bed, 'Expected private resident bed module to exist.');
  return {
    cabinTile: toIndex(10, 22, state.width),
    bedModuleId: bed!.id
  };
}

function createDockedTransientShip(state: StationState, dockId: number, shipId: number): ArrivingShip {
  const dock = dockByIdOrThrow(state, dockId);
  const center = dock.tiles
    .map((tile) => fromIndex(tile, state.width))
    .reduce(
      (acc, pos) => ({ x: acc.x + pos.x, y: acc.y + pos.y }),
      { x: 0, y: 0 }
    );
  const ship: ArrivingShip = {
    id: shipId,
    kind: 'transient',
    size: 'small',
    bayTiles: [...dock.tiles],
    bayCenterX: center.x / Math.max(1, dock.tiles.length) + 0.5,
    bayCenterY: center.y / Math.max(1, dock.tiles.length) + 0.5,
    shipType: 'tourist',
    lane: dock.lane,
    originDockId: dock.id,
    assignedDockId: dock.id,
    queueState: 'none',
    stage: 'docked',
    stageTime: 0,
    passengersTotal: 1,
    passengersSpawned: 1,
    passengersBoarded: 0,
    minimumBoarding: 1,
    spawnCarry: 0,
    dockedAt: state.now,
    residentIds: [],
    manifestDemand: { cafeteria: 0.5, market: 0.25, lounge: 0.25 },
    manifestMix: { diner: 0.55, shopper: 0.2, lounger: 0.15, rusher: 0.1 }
  };
  dock.occupiedByShipId = ship.id;
  state.arrivingShips.push(ship);
  return ship;
}

function spawnReturningVisitor(state: StationState, dockTile: number, id: number, originShipId: number): void {
  const center = fromIndex(dockTile, state.width);
  const v: Visitor = {
    id,
    x: center.x + 0.5,
    y: center.y + 0.5,
    tileIndex: dockTile,
    state: VisitorState.ToDock,
    path: [],
    speed: 2,
    patience: 0,
    eatTimer: 0,
    trespassed: false,
    servedMeal: true,
    carryingMeal: false,
    reservedServingTile: null,
    reservedTargetTile: null,
    blockedTicks: 0,
    archetype: 'diner',
    taxSensitivity: 1,
    spendMultiplier: 1,
    patienceMultiplier: 1,
    primaryPreference: 'cafeteria',
    spawnedAt: state.now - 80,
    originShipId,
    airExposureSec: 0,
    healthState: 'healthy'
  };
  state.visitors.push(v);
}

function paintRoom(state: StationState, room: RoomType, x0: number, y0: number, x1: number, y1: number): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const idx = toIndex(x, y, state.width);
      setTile(state, idx, TileType.Floor);
      setRoom(state, idx, room);
    }
  }
  // Door tile inside the room guarantees door adjacency readiness checks.
  const doorIdx = toIndex(x0, y0, state.width);
  setTile(state, doorIdx, TileType.Door);
  setRoom(state, doorIdx, room);
}

function placeModuleOrThrow(
  state: StationState,
  module: ModuleType,
  x: number,
  y: number,
  rotation: ModuleRotation = 0
): void {
  const idx = toIndex(x, y, state.width);
  const result = tryPlaceModule(state, module, idx, rotation);
  assertCondition(result.ok, `Module placement failed for ${module} at ${x},${y}: ${result.reason ?? 'unknown'}`);
}

function spawnVisitor(state: StationState, x: number, y: number, id: number): void {
  const tileIndex = toIndex(x, y, state.width);
  const center = fromIndex(tileIndex, state.width);
  const v: Visitor = {
    id,
    x: center.x + 0.5,
    y: center.y + 0.5,
    tileIndex,
    state: VisitorState.ToCafeteria,
    path: [],
    speed: 1.8,
    patience: 8,
    eatTimer: 0,
    trespassed: false,
    servedMeal: false,
    carryingMeal: false,
    reservedServingTile: null,
    reservedTargetTile: null,
    blockedTicks: 0,
    archetype: 'diner',
    taxSensitivity: 1,
    spendMultiplier: 1,
    patienceMultiplier: 1,
    primaryPreference: 'cafeteria',
    spawnedAt: state.now,
    originShipId: null,
    airExposureSec: 0,
    healthState: 'healthy'
  };
  state.visitors.push(v);
}

function setupCoreRooms(state: StationState): void {
  // Critical support rooms so pressure/air remains sane during longer runs.
  paintRoom(state, RoomType.Reactor, 6, 6, 7, 7);
  paintRoom(state, RoomType.LifeSupport, 9, 6, 11, 7);
}

function setupFoodChain(state: StationState): void {
  paintRoom(state, RoomType.Hydroponics, 6, 10, 9, 13);
  paintRoom(state, RoomType.Kitchen, 11, 10, 14, 13);
  paintRoom(state, RoomType.Cafeteria, 16, 10, 21, 13);
  placeModuleOrThrow(state, ModuleType.GrowStation, 6, 11);
  placeModuleOrThrow(state, ModuleType.Stove, 11, 11);
  placeModuleOrThrow(state, ModuleType.ServingStation, 16, 11);
  placeModuleOrThrow(state, ModuleType.Table, 18, 10);
  placeModuleOrThrow(state, ModuleType.Table, 18, 12);
}

function setupTradeChain(state: StationState): void {
  paintRoom(state, RoomType.LogisticsStock, 6, 16, 8, 18);
  paintRoom(state, RoomType.Storage, 10, 16, 13, 18);
  paintRoom(state, RoomType.Workshop, 15, 16, 19, 18);
  paintRoom(state, RoomType.Market, 21, 16, 25, 18);
  placeModuleOrThrow(state, ModuleType.IntakePallet, 6, 17);
  placeModuleOrThrow(state, ModuleType.StorageRack, 10, 17);
  placeModuleOrThrow(state, ModuleType.StorageRack, 12, 17);
  placeModuleOrThrow(state, ModuleType.Workbench, 15, 17);
  placeModuleOrThrow(state, ModuleType.MarketStall, 21, 17);
}

function setupLeisure(state: StationState, withModule: boolean): void {
  paintRoom(state, RoomType.Lounge, 23, 10, 27, 12);
  if (withModule) {
    placeModuleOrThrow(state, ModuleType.Couch, 23, 11);
  }
}

function testAutonomousRoomsNoStaff(): void {
  const state = createInitialState({ seed: 3001 });
  buildHabitat(state);
  setupCoreRooms(state);
  setupFoodChain(state);
  setupLeisure(state, true);
  state.crew.total = 0;
  runFor(state, 2);

  const cafDiag = getRoomDiagnosticAt(state, toIndex(16, 10, state.width));
  const loungeDiag = getRoomDiagnosticAt(state, toIndex(23, 10, state.width));
  assertCondition(!!cafDiag && cafDiag.active, 'Cafeteria should be active with zero crew once ready.');
  assertCondition(!!loungeDiag && loungeDiag.active, 'Lounge should be active with zero crew once ready.');
}

function testCafeteriaMissingServingStation(): void {
  const state = createInitialState({ seed: 3002 });
  buildHabitat(state);
  setupCoreRooms(state);
  paintRoom(state, RoomType.Cafeteria, 16, 10, 21, 13);
  placeModuleOrThrow(state, ModuleType.Table, 18, 10);
  placeModuleOrThrow(state, ModuleType.Table, 18, 12);
  runFor(state, 1);

  const cafDiag = getRoomDiagnosticAt(state, toIndex(16, 10, state.width));
  assertCondition(!!cafDiag, 'Cafeteria diagnostic should exist.');
  assertCondition(!cafDiag!.active, 'Cafeteria without serving station should be inactive.');
  assertCondition(
    cafDiag!.reasons.includes('missing required modules'),
    'Cafeteria without serving station should report missing required modules.'
  );
}

function testBedFootprintRotation(): void {
  const state = createInitialState({ seed: 3003 });
  buildHabitat(state);
  paintRoom(state, RoomType.Dorm, 6, 24, 9, 26);

  const first = tryPlaceModule(state, ModuleType.Bed, toIndex(6, 25, state.width), 0);
  const overlap = tryPlaceModule(state, ModuleType.Bed, toIndex(7, 25, state.width), 0);
  const rotated = tryPlaceModule(state, ModuleType.Bed, toIndex(9, 24, state.width), 90);
  assertCondition(first.ok, 'Initial 2x1 bed should place.');
  assertCondition(!overlap.ok, 'Overlapping bed placement should fail.');
  assertCondition(rotated.ok, 'Rotated bed should place.');

  const rotatedInstance = state.moduleInstances.find((m) => m.originTile === toIndex(9, 24, state.width));
  assertCondition(!!rotatedInstance, 'Rotated bed instance should exist.');
  assertCondition(rotatedInstance!.width === 1 && rotatedInstance!.height === 2, 'Rotated bed should be 1x2 footprint.');
}

function testFoodChainEndToEnd(): void {
  const state = createInitialState({ seed: 3004 });
  buildHabitat(state);
  setupCoreRooms(state);
  setupFoodChain(state);
  state.crew.total = 14;
  state.metrics.credits = 500;

  // Seed optional starter raw meal to accelerate first serving cycle.
  buyRawFood(state, 0, 20);
  spawnVisitor(state, 15, 11, 1);

  runFor(state, 120);
  assertCondition(state.metrics.createdJobs > 0, 'Food chain should create hauling jobs.');
  assertCondition(state.metrics.completedJobs > 0, 'Food chain should complete hauling jobs.');
  assertCondition(state.metrics.mealsServedTotal > 0, 'Visitor should be served through serving station -> table flow.');
}

function testServingStarvationQueue(): void {
  const state = createInitialState({ seed: 3005 });
  buildHabitat(state);
  setupCoreRooms(state);
  paintRoom(state, RoomType.Cafeteria, 16, 10, 21, 13);
  placeModuleOrThrow(state, ModuleType.ServingStation, 16, 11);
  placeModuleOrThrow(state, ModuleType.Table, 18, 10);
  placeModuleOrThrow(state, ModuleType.Table, 18, 12);
  state.crew.total = 6;

  for (let i = 0; i < 6; i++) {
    spawnVisitor(state, 15, 10 + (i % 3), i + 10);
  }

  let peakQueue = 0;
  let minRating = state.metrics.stationRating;
  for (let i = 0; i < 360; i++) {
    tick(state, 0.25);
    peakQueue = Math.max(peakQueue, state.metrics.cafeteriaQueueingCount);
    minRating = Math.min(minRating, state.metrics.stationRating);
  }

  assertCondition(peakQueue >= 3, 'Empty serving inventory should create visible queue pressure.');
  assertCondition(minRating < 70, 'Serving starvation should reduce rating over time.');
}

function testMaterialsChainEndToEnd(): void {
  const state = createInitialState({ seed: 3006 });
  buildHabitat(state);
  setupCoreRooms(state);
  setupTradeChain(state);
  state.crew.total = 12;
  state.metrics.credits = 800;

  const bought = buyMaterials(state, 0, 35);
  assertCondition(bought, 'Buying materials should deposit raw materials into intake pallets.');
  runFor(state, 150);

  assertCondition(state.metrics.createdJobs > 0, 'Materials chain should create transport jobs.');
  assertCondition(state.metrics.completedJobs > 0, 'Materials chain should complete transport jobs.');
  assertCondition(state.metrics.marketTradeGoodStock > 0, 'Trade goods should reach market stalls.');

  const sold = sellMaterials(state, 10, 5);
  assertCondition(sold, 'Selling materials should remove raw materials from logistics/storage inventory.');
}

function testInventoryOverlayToggleState(): void {
  const state = createInitialState({ seed: 3011 });
  assertCondition(state.controls.showInventoryOverlay === false, 'Inventory overlay should default to off.');
  const baselineServiceOverlay = state.controls.showServiceNodes;
  state.controls.showInventoryOverlay = !state.controls.showInventoryOverlay;
  assertCondition(state.controls.showInventoryOverlay === true, 'Inventory overlay should toggle on.');
  assertCondition(
    state.controls.showServiceNodes === baselineServiceOverlay,
    'Inventory overlay toggle should not affect service-node overlay state.'
  );
}

function testRoomInspectorInventoryBreakdown(): void {
  const state = createInitialState({ seed: 3012 });
  buildHabitat(state);
  setupCoreRooms(state);
  setupTradeChain(state);
  const bought = buyMaterials(state, 0, 35);
  assertCondition(bought, 'Should seed raw materials for inventory breakdown test.');

  const inspector = getRoomInspectorAt(state, toIndex(6, 17, state.width));
  assertCondition(!!inspector, 'Inspector should be available for logistics stock room.');
  assertCondition(!!inspector!.inventory, 'Inspector should include inventory summary.');
  assertCondition(inspector!.inventory!.nodeCount >= 1, 'Inventory summary should include at least one node.');
  assertCondition(inspector!.inventory!.capacity > 0, 'Inventory summary should report positive capacity.');
  assertCondition(inspector!.inventory!.used > 0, 'Inventory summary should report non-zero used stock.');
  const computedFill = inspector!.inventory!.capacity > 0
    ? (inspector!.inventory!.used / inspector!.inventory!.capacity) * 100
    : 0;
  assertCondition(
    Math.abs(computedFill - inspector!.inventory!.fillPct) < 0.01,
    'Inventory fill percentage should match used/capacity.'
  );
  assertCondition(
    (inspector!.inventory!.byItem.rawMaterial ?? 0) > 0,
    'Inventory breakdown should include raw material stock.'
  );
}

function testMarketBuyCapacityContext(): void {
  const state = createInitialState({ seed: 3013 });
  buildHabitat(state);
  setupCoreRooms(state);
  setupTradeChain(state);
  const result = buyMaterialsDetailed(state, 0, 80);
  assertCondition(!result.ok, 'Buying 80 materials should fail with a single intake pallet.');
  if (result.ok) {
    throw new Error('Expected capacity failure result payload.');
  }
  assertCondition(result.reason === 'insufficient_storage_capacity', 'Failure reason should report insufficient capacity.');
  assertCondition(result.requiredAmount === 80, 'Failure result should include required amount.');
  assertCondition(result.freeCapacity >= 0 && result.freeCapacity < 80, 'Failure result should include free capacity context.');
  assertCondition(result.targetNodeCount >= 1, 'Failure result should include target node count.');
}

function testMarketBuyMissingIntakeContext(): void {
  const state = createInitialState({ seed: 3014 });
  buildHabitat(state);
  setupCoreRooms(state);
  const result = buyMaterialsDetailed(state, 0, 25);
  assertCondition(!result.ok, 'Buying materials without intake should fail.');
  if (result.ok) {
    throw new Error('Expected missing-intake failure result payload.');
  }
  assertCondition(result.reason === 'no_logistics_stock', 'Failure reason should report missing logistics stock.');
  assertCondition(result.targetNodeCount === 0, 'Missing-intake result should report zero target nodes.');
  assertCondition(result.freeCapacity === 0, 'Missing-intake result should report zero free capacity.');
}

function testFoodChainInspectorClarity(): void {
  const state = createInitialState({ seed: 3015 });
  buildHabitat(state);
  setupCoreRooms(state);
  setupFoodChain(state);
  state.crew.total = 12;
  buyRawFood(state, 0, 20);
  runFor(state, 40);

  const hydro = getRoomInspectorAt(state, toIndex(6, 10, state.width));
  const kitchen = getRoomInspectorAt(state, toIndex(11, 10, state.width));
  const cafeteria = getRoomInspectorAt(state, toIndex(16, 10, state.width));
  assertCondition(!!hydro && !!kitchen && !!cafeteria, 'Inspectors should exist across food-chain rooms.');
  assertCondition(
    (hydro!.flowHints ?? []).some((line) => line.includes('to kitchen jobs')),
    'Hydroponics flow hints should include downstream kitchen job counts.'
  );
  assertCondition(
    (kitchen!.flowHints ?? []).some((line) => line.includes('to cafeteria jobs')),
    'Kitchen flow hints should include downstream cafeteria job counts.'
  );
  assertCondition(
    (cafeteria!.flowHints ?? []).some((line) => line.includes('serving meal')),
    'Cafeteria flow hints should include serving inventory and queue/eating context.'
  );
}

function testServiceNodeUnreachableWarning(): void {
  const state = createInitialState({ seed: 3030 });
  buildHabitat(state);
  setupCoreRooms(state);
  paintRoom(state, RoomType.Cafeteria, 16, 10, 18, 12);
  placeModuleOrThrow(state, ModuleType.ServingStation, 17, 11, 90);
  setTile(state, toIndex(16, 11, state.width), TileType.Wall);
  setTile(state, toIndex(18, 11, state.width), TileType.Wall);
  setTile(state, toIndex(17, 10, state.width), TileType.Wall);
  setTile(state, toIndex(16, 12, state.width), TileType.Wall);
  setTile(state, toIndex(18, 12, state.width), TileType.Wall);
  setTile(state, toIndex(17, 13, state.width), TileType.Wall);

  runFor(state, 1);

  const servingTile = toIndex(17, 11, state.width);
  const reachability = collectServiceNodeReachability(state);
  assertCondition(
    reachability.unreachableNodeTiles.includes(servingTile),
    'Sealed serving node should be marked unreachable.'
  );
  const inspector = getRoomInspectorAt(state, servingTile);
  assertCondition(!!inspector, 'Inspector should exist for sealed serving node room.');
  assertCondition(
    inspector!.unreachableServiceNodeCount === 1 && inspector!.reachableServiceNodeCount === 0,
    'Inspector should report unreachable service-node counts.'
  );
  assertCondition(
    inspector!.warnings.some((warning) => warning.includes('service nodes unreachable 1/1')),
    'Inspector should warn when service nodes are unreachable.'
  );
}

function testLoungeModuleGating(): void {
  const state = createInitialState({ seed: 3007 });
  buildHabitat(state);
  setupCoreRooms(state);
  setupLeisure(state, false);
  runFor(state, 1);

  const diagBefore = getRoomDiagnosticAt(state, toIndex(23, 10, state.width));
  assertCondition(!!diagBefore && !diagBefore.active, 'Lounge without couch/game station should be inactive.');
  assertCondition(
    diagBefore!.reasons.includes('missing required modules'),
    'Lounge without module should report missing required modules.'
  );

  placeModuleOrThrow(state, ModuleType.Couch, 23, 11);
  runFor(state, 1);
  const diagAfter = getRoomDiagnosticAt(state, toIndex(23, 10, state.width));
  assertCondition(!!diagAfter && diagAfter.active, 'Lounge should activate once couch/game station is placed.');
}

function testActivationChecksPreserved(): void {
  const state = createInitialState({ seed: 3008 });
  buildHabitat(state);
  setupCoreRooms(state);

  // Missing door: keep room tiles floor but avoid door placement.
  for (let y = 24; y <= 26; y++) {
    for (let x = 12; x <= 14; x++) {
      const idx = toIndex(x, y, state.width);
      setTile(state, idx, TileType.Floor);
      setRoom(state, idx, RoomType.Dorm);
    }
  }
  placeModuleOrThrow(state, ModuleType.Bed, 12, 25);

  // Missing pressure: carve a room open to vacuum.
  for (let y = 2; y <= 4; y++) {
    for (let x = 48; x <= 50; x++) {
      const idx = toIndex(x, y, state.width);
      setTile(state, idx, TileType.Floor);
      setRoom(state, idx, RoomType.Dorm);
    }
  }
  setTile(state, toIndex(48, 2, state.width), TileType.Door);
  setRoom(state, toIndex(48, 2, state.width), RoomType.Dorm);
  placeModuleOrThrow(state, ModuleType.Bed, 49, 3);

  runFor(state, 2);

  const missingDoorDiag = getRoomDiagnosticAt(state, toIndex(12, 25, state.width));
  const missingPressureDiag = getRoomDiagnosticAt(state, toIndex(49, 3, state.width));
  assertCondition(
    !!missingDoorDiag && missingDoorDiag.reasons.includes('missing door'),
    'Door readiness check should still block activation.'
  );
  assertCondition(
    !!missingPressureDiag && missingPressureDiag.reasons.includes('not pressurized'),
    'Pressurization readiness check should still block activation.'
  );
}

function testLegacyBalanceSanity(): void {
  const state = createInitialState({ seed: 3009 });
  buildHabitat(state);
  setupCoreRooms(state);
  setupFoodChain(state);
  setupTradeChain(state);
  setupLeisure(state, true);
  paintRoom(state, RoomType.Security, 27, 16, 29, 17);
  placeModuleOrThrow(state, ModuleType.Terminal, 27, 17);
  state.crew.total = 16;
  state.metrics.credits = 1000;
  buyMaterials(state, 0, 35);
  buyRawFood(state, 0, 80);
  for (let i = 0; i < 8; i++) spawnVisitor(state, 15 + (i % 2), 10 + (i % 4), i + 100);

  runFor(state, 180);

  assertCondition(Number.isFinite(state.metrics.stationRating), 'Station rating should remain finite.');
  assertCondition(Number.isFinite(state.metrics.morale), 'Crew morale should remain finite.');
  assertCondition(state.metrics.airQuality >= 0, 'Air quality should remain non-negative.');
}

function testJobMetricsConsistency(): void {
  const state = createInitialState({ seed: 3010 });
  buildHabitat(state);
  setupCoreRooms(state);
  setupFoodChain(state);
  setupTradeChain(state);
  state.crew.total = 14;
  state.metrics.credits = 500;
  buyMaterials(state, 0, 35);
  buyRawFood(state, 0, 60);
  spawnVisitor(state, 15, 11, 200);

  runFor(state, 120);

  const pending = state.jobs.filter((j) => j.state === 'pending').length;
  const assigned = state.jobs.filter((j) => j.state === 'assigned' || j.state === 'in_progress').length;
  const expired = state.jobs.filter((j) => j.state === 'expired').length;
  const completed = state.jobs.filter((j) => j.state === 'done').length;

  assertCondition(state.metrics.pendingJobs === pending, 'Pending job metric should match job states.');
  assertCondition(state.metrics.assignedJobs === assigned, 'Assigned job metric should match job states.');
  assertCondition(state.metrics.expiredJobs === expired, 'Expired job metric should match job states.');
  assertCondition(state.metrics.completedJobs === completed, 'Completed job metric should match job states.');
  assertCondition(
    state.metrics.createdJobs >= state.metrics.completedJobs + state.metrics.expiredJobs,
    'Created jobs should be >= completed + expired jobs.'
  );
}

function testVisitorBerthsAcceptTrafficResidentialDoNot(): void {
  const state = createInitialState({ seed: 3016 });
  buildHabitat(state);
  const visitorDockId = placeEastHullDock(state, 8, 9);
  const residentialDockId = placeEastHullDock(state, 18, 19);
  setDockPurpose(state, residentialDockId, 'residential');
  state.controls.shipsPerCycle = 2;
  runFor(state, 70);

  const shipsSpawned =
    state.usageTotals.shipsByType.tourist +
    state.usageTotals.shipsByType.trader +
    state.usageTotals.shipsByType.industrial;
  assertCondition(shipsSpawned > 0, 'Visitor berths should receive scheduled arrivals.');
  for (const ship of state.arrivingShips) {
    assertCondition(
      ship.assignedDockId !== residentialDockId,
      'Scheduled arrivals must not be assigned to residential berths.'
    );
  }
  const residentialDock = dockByIdOrThrow(state, residentialDockId);
  const visitorDock = dockByIdOrThrow(state, visitorDockId);
  assertCondition(residentialDock.occupiedByShipId === null, 'Residential berth should stay unused by scheduled traffic.');
  assertCondition(visitorDock.purpose === 'visitor', 'Visitor berth purpose should remain visitor.');
}

function testConversionBlockedWithoutResidentialBerth(): void {
  const state = createInitialState({ seed: 3017 });
  buildHabitat(state);
  state.crew.total = 0;
  const visitorDockId = placeEastHullDock(state, 8, 9);
  setupPrivateResidentHousing(state);
  state.rng = () => 0;
  const ship = createDockedTransientShip(state, visitorDockId, 9101);
  const dockTile = dockByIdOrThrow(state, visitorDockId).tiles[0];
  spawnReturningVisitor(state, dockTile, 501, ship.id);

  runFor(state, 1);
  assertCondition(state.residents.length === 0, 'Conversion should fail without an eligible residential berth.');
  assertCondition(ship.kind === 'transient', 'Ship should remain transient when conversion prerequisites fail.');
  assertCondition(
    state.usageTotals.residentConversionAttempts === 0,
    'Conversion attempts should not be counted when no residential berth is available.'
  );
}

function testConversionBlockedWithoutPrivateHousing(): void {
  const state = createInitialState({ seed: 3018 });
  buildHabitat(state);
  state.crew.total = 0;
  const visitorDockId = placeEastHullDock(state, 8, 9);
  const residentialDockId = placeEastHullDock(state, 18, 19);
  setDockPurpose(state, residentialDockId, 'residential');
  state.rng = () => 0;
  const ship = createDockedTransientShip(state, visitorDockId, 9102);
  const dockTile = dockByIdOrThrow(state, visitorDockId).tiles[0];
  spawnReturningVisitor(state, dockTile, 502, ship.id);

  runFor(state, 1);
  assertCondition(state.residents.length === 0, 'Conversion should fail when no private resident housing exists.');
  assertCondition(ship.kind === 'transient', 'Ship should remain transient when housing is unavailable.');
  assertCondition(
    ship.assignedDockId === visitorDockId,
    'Ship should stay on its visitor berth when conversion cannot complete.'
  );
  assertCondition(
    state.usageTotals.residentConversionAttempts === 0,
    'Conversion attempts should not be counted when housing prerequisites fail.'
  );
}

function testConversionCreatesResidentHomeShip(): void {
  const state = createInitialState({ seed: 3019 });
  buildHabitat(state);
  state.crew.total = 0;
  const visitorDockId = placeEastHullDock(state, 8, 9);
  const residentialDockId = placeEastHullDock(state, 18, 19);
  setDockPurpose(state, residentialDockId, 'residential');
  const housing = setupPrivateResidentHousing(state);
  state.rng = () => 0;
  const ship = createDockedTransientShip(state, visitorDockId, 9103);
  const dockTile = dockByIdOrThrow(state, visitorDockId).tiles[0];
  spawnReturningVisitor(state, dockTile, 503, ship.id);

  runFor(state, 1);
  assertCondition(state.residents.length === 1, 'Eligible boarding should convert a visitor into a resident.');
  const resident = state.residents[0];
  const visitorDock = dockByIdOrThrow(state, visitorDockId);
  const residentialDock = dockByIdOrThrow(state, residentialDockId);
  assertCondition(ship.kind === 'resident_home', 'Converted ship should switch to resident_home kind.');
  assertCondition(ship.assignedDockId === residentialDockId, 'Resident home ship should relocate to a residential berth.');
  assertCondition(visitorDock.occupiedByShipId === null, 'Visitor berth should free occupancy after relocation.');
  assertCondition(residentialDock.occupiedByShipId === ship.id, 'Residential berth should be occupied by resident home ship.');
  assertCondition(resident.homeShipId === ship.id, 'Resident should track homeShipId.');
  assertCondition(resident.homeDockId === residentialDockId, 'Resident should track homeDockId.');
  assertCondition(resident.housingUnitId === housing.cabinTile, 'Resident should receive assigned housing unit.');
  assertCondition(resident.bedModuleId === housing.bedModuleId, 'Resident should receive assigned bed module.');
  assertCondition(state.usageTotals.residentConversionAttempts === 1, 'Successful conversion should count one attempt.');
  assertCondition(state.usageTotals.residentConversionSuccesses === 1, 'Successful conversion should count one success.');
}

function testResidentDepartureFreesHomeShipBerth(): void {
  const state = createInitialState({ seed: 3020 });
  buildHabitat(state);
  state.crew.total = 0;
  const visitorDockId = placeEastHullDock(state, 8, 9);
  const residentialDockId = placeEastHullDock(state, 18, 19);
  setDockPurpose(state, residentialDockId, 'residential');
  setupPrivateResidentHousing(state);
  state.rng = () => 0;
  const ship = createDockedTransientShip(state, visitorDockId, 9104);
  const visitorDockTile = dockByIdOrThrow(state, visitorDockId).tiles[0];
  spawnReturningVisitor(state, visitorDockTile, 504, ship.id);
  runFor(state, 1);

  assertCondition(state.residents.length === 1, 'Fixture should convert one resident before departure test.');
  const resident = state.residents[0];
  const homeDockTile = dockByIdOrThrow(state, residentialDockId).tiles[0];
  const center = fromIndex(homeDockTile, state.width);
  resident.state = ResidentState.ToHomeShip;
  resident.leaveIntent = 100;
  resident.path = [];
  resident.tileIndex = homeDockTile;
  resident.x = center.x + 0.5;
  resident.y = center.y + 0.5;

  runFor(state, 1);
  assertCondition(state.residents.length === 0, 'Resident should depart once reaching home dock tile.');
  const shipAfterResidentExit = state.arrivingShips.find((s) => s.id === ship.id) ?? null;
  assertCondition(!!shipAfterResidentExit, 'Resident home ship should still exist during departure stage.');
  assertCondition(
    shipAfterResidentExit!.residentIds.length === 0 && shipAfterResidentExit!.stage === 'depart',
    'Resident home ship should enter depart stage when no linked residents remain.'
  );
  runFor(state, 8);
  const shipAfterDepart = state.arrivingShips.find((s) => s.id === ship.id) ?? null;
  assertCondition(shipAfterDepart === null, 'Resident home ship should leave simulation after depart stage completes.');
  assertCondition(
    dockByIdOrThrow(state, residentialDockId).occupiedByShipId === null,
    'Residential berth occupancy should be freed after home ship departure.'
  );
  assertCondition(state.usageTotals.residentDepartures === 1, 'Resident departure counter should increment.');
}

function testMapExpansionCostProgressionAndDirectionLock(): void {
  const state = createInitialState({ seed: 3025 });
  state.metrics.credits = 50000;

  const order = ['north', 'east', 'south', 'west'] as const;
  const expectedCosts = [2000, 4000, 6000, 8000];
  let totalSpent = 0;

  for (let i = 0; i < order.length; i++) {
    assertCondition(
      getNextExpansionCost(state) === expectedCosts[i],
      `Expected next expansion cost ${expectedCosts[i]} before purchase ${i + 1}.`
    );
    const result = expandMap(state, order[i]);
    assertCondition(result.ok, `Expansion ${order[i]} should succeed.`);
    if (!result.ok) continue;
    assertCondition(result.cost === expectedCosts[i], `Expansion ${order[i]} should cost ${expectedCosts[i]}.`);
    totalSpent += expectedCosts[i];
  }

  assertCondition(state.mapExpansion.purchasesMade === 4, 'Expected four total expansion purchases.');
  assertCondition(state.metrics.credits === 50000 - totalSpent, 'Credits should be reduced by total expansion costs.');
  assertCondition(getNextExpansionCost(state) === 8000, 'Expansion cost should remain capped at 8000.');

  const repeat = expandMap(state, 'north');
  assertCondition(!repeat.ok, 'Repeat expansion in same direction should fail.');
  if (repeat.ok) return;
  assertCondition(repeat.reason === 'already_expanded_direction', 'Repeat expansion should report direction lock.');
}

function testMapExpansionCreditGatingNoMutation(): void {
  const state = createInitialState({ seed: 3026 });
  state.metrics.credits = 1999;
  const beforeWidth = state.width;
  const beforeHeight = state.height;
  const beforeCredits = state.metrics.credits;
  const beforeCore = state.core.serviceTile;

  const result = expandMap(state, 'south');
  assertCondition(!result.ok, 'Expansion should fail with insufficient credits.');
  if (result.ok) return;
  assertCondition(result.reason === 'insufficient_credits', 'Expansion failure reason should be insufficient credits.');
  assertCondition(state.width === beforeWidth && state.height === beforeHeight, 'Failed expansion should not resize map.');
  assertCondition(state.metrics.credits === beforeCredits, 'Failed expansion should not consume credits.');
  assertCondition(state.core.serviceTile === beforeCore, 'Failed expansion should not mutate indices.');
}

function testMapExpansionNorthRemapsRuntimeReferences(): void {
  const state = createInitialState({ seed: 3027 });
  state.metrics.credits = 20000;
  buildHabitat(state);
  setupCoreRooms(state);

  const trackedTile = toIndex(8, 8, state.width);
  setTile(state, trackedTile, TileType.Door);
  paintRoom(state, RoomType.Dorm, 18, 10, 20, 11);
  placeModuleOrThrow(state, ModuleType.Bed, 18, 10);
  const module = state.moduleInstances.find((m) => m.type === ModuleType.Bed);
  assertCondition(!!module, 'Fixture should include module before expansion.');
  if (!module) return;

  const dockId = placeEastHullDock(state, 8, 9);
  const dock = dockByIdOrThrow(state, dockId);
  const dockAnchorBefore = dock.anchorTile;
  const ship = createDockedTransientShip(state, dockId, 9300);
  state.pendingSpawns.push({ at: state.now + 1, dockIndex: dock.tiles[0] });

  tick(state, 0.1);
  assertCondition(state.crewMembers.length > 0, 'Fixture should include crew members before expansion.');
  const crewBefore = state.crewMembers[0];
  crewBefore.tileIndex = toIndex(14, 14, state.width);
  crewBefore.path = [toIndex(14, 14, state.width), toIndex(15, 14, state.width)];
  crewBefore.targetTile = toIndex(16, 14, state.width);
  crewBefore.y = 14.5;
  const crewTileBefore = crewBefore.tileIndex;
  const crewYBefore = crewBefore.y;

  const fromTileBefore = toIndex(10, 10, state.width);
  const toTileBefore = toIndex(12, 10, state.width);
  state.jobs.push({
    id: 77,
    type: 'pickup',
    itemType: 'rawMeal',
    amount: 1,
    fromTile: fromTileBefore,
    toTile: toTileBefore,
    assignedCrewId: null,
    createdAt: state.now,
    expiresAt: state.now + 90,
    state: 'pending',
    pickedUpAmount: 0,
    completedAt: null,
    lastProgressAt: state.now
  });

  spawnVisitor(state, 9, 9, 1001);
  const visitorBefore = state.visitors[0];
  const visitorTileBefore = visitorBefore.tileIndex;
  const visitorYBefore = visitorBefore.y;

  state.residents.push({
    id: 2001,
    x: 11.5,
    y: 11.5,
    tileIndex: toIndex(11, 11, state.width),
    path: [toIndex(11, 11, state.width), toIndex(12, 11, state.width)],
    speed: 1.8,
    hunger: 80,
    energy: 80,
    hygiene: 80,
    stress: 10,
    state: ResidentState.Idle,
    actionTimer: 0,
    retargetAt: 0,
    reservedTargetTile: toIndex(13, 11, state.width),
    homeShipId: null,
    homeDockId: null,
    housingUnitId: null,
    bedModuleId: null,
    satisfaction: 70,
    leaveIntent: 0,
    blockedTicks: 0,
    airExposureSec: 0,
    healthState: 'healthy'
  });
  const residentBefore = state.residents[0];

  state.bodyTiles = [toIndex(17, 17, state.width)];
  state.pathOccupancyByTile = new Map([[toIndex(18, 18, state.width), 2]]);
  state.effects.blockedUntilByTile = new Map([[toIndex(19, 19, state.width), state.now + 5]]);

  const result = expandMap(state, 'north');
  assertCondition(result.ok, 'North expansion should succeed.');
  if (!result.ok) return;

  const remapNorth = (index: number): number => index + 40 * state.width;
  assertCondition(state.height === 80, 'North expansion should increase height by 40.');
  assertCondition(state.tiles[remapNorth(trackedTile)] === TileType.Door, 'Tracked tile should remap after north expansion.');
  assertCondition(module.originTile !== state.moduleInstances[0].originTile, 'Module origin should be remapped.');
  assertCondition(
    state.moduleInstances.some((m) => m.id === module.id && m.originTile === remapNorth(module.originTile)),
    'Module origin tile should shift north by 40 rows.'
  );
  assertCondition(state.visitors[0].tileIndex === remapNorth(visitorTileBefore), 'Visitor tile index should be remapped.');
  assertCondition(Math.abs(state.visitors[0].y - (visitorYBefore + 40)) < 0.001, 'Visitor world Y should shift by 40.');
  assertCondition(state.residents[0].tileIndex === remapNorth(residentBefore.tileIndex), 'Resident tile index should remap.');
  assertCondition(
    state.residents[0].reservedTargetTile === remapNorth(residentBefore.reservedTargetTile!),
    'Resident reserved target should remap.'
  );
  assertCondition(state.crewMembers[0].tileIndex === remapNorth(crewTileBefore), 'Crew tile index should remap.');
  assertCondition(state.crewMembers[0].targetTile === remapNorth(toIndex(16, 14, 60)), 'Crew target tile should remap.');
  assertCondition(Math.abs(state.crewMembers[0].y - (crewYBefore + 40)) < 0.001, 'Crew world Y should shift by 40.');
  assertCondition(state.jobs[0].fromTile === remapNorth(fromTileBefore), 'Job source tile should remap.');
  assertCondition(state.jobs[0].toTile === remapNorth(toTileBefore), 'Job target tile should remap.');
  assertCondition(state.pendingSpawns[0].dockIndex === remapNorth(dock.tiles[0]), 'Pending spawn dock index should remap.');
  assertCondition(state.bodyTiles[0] === remapNorth(toIndex(17, 17, 60)), 'Body tile should remap.');

  const pathKeys = [...state.pathOccupancyByTile.keys()];
  const blockedKeys = [...state.effects.blockedUntilByTile.keys()];
  assertCondition(pathKeys.length === 1 && pathKeys[0] === remapNorth(toIndex(18, 18, 60)), 'Path occupancy keys should remap.');
  assertCondition(
    blockedKeys.length === 1 && blockedKeys[0] === remapNorth(toIndex(19, 19, 60)),
    'Blocked tile effect keys should remap.'
  );

  const remappedDock = dockByIdOrThrow(state, dockId);
  assertCondition(remappedDock.anchorTile === remapNorth(dockAnchorBefore), 'Dock anchor should remap north.');
  assertCondition(
    state.arrivingShips.some(
      (arriving) =>
        arriving.id === ship.id &&
        arriving.assignedDockId === dockId &&
        Math.abs(arriving.bayCenterY - (ship.bayCenterY + 40)) < 0.001
    ),
    'Docked ship should keep dock assignment and remapped bay center.'
  );
}

function testMapExpansionWestRemapsCoreAndDockIntegrity(): void {
  const state = createInitialState({ seed: 3028 });
  state.metrics.credits = 20000;
  const coreBefore = state.core.serviceTile;
  const dockId = placeEastHullDock(state, 8, 9);
  const dockBefore = dockByIdOrThrow(state, dockId);
  const oldWidth = state.width;
  const oldHeight = state.height;

  const result = expandMap(state, 'west');
  assertCondition(result.ok, 'West expansion should succeed.');
  if (!result.ok) return;

  assertCondition(state.width === oldWidth + 40, 'West expansion should increase width by 40.');
  assertCondition(state.height === oldHeight, 'West expansion should preserve height.');
  const coreAfter = fromIndex(state.core.serviceTile, state.width);
  const coreBeforePos = fromIndex(coreBefore, oldWidth);
  assertCondition(coreAfter.x === coreBeforePos.x + 40 && coreAfter.y === coreBeforePos.y, 'Core tile should shift 40 west-columns.');

  const dockAfter = dockByIdOrThrow(state, dockId);
  assertCondition(dockAfter.tiles.length === dockBefore.tiles.length, 'Dock cluster size should remain stable after expansion.');
  assertCondition(
    dockAfter.tiles.every((tile) => tile >= 0 && tile < state.width * state.height),
    'Dock tiles should remain in bounds after expansion.'
  );
  const assignedDockIds = new Set(state.docks.map((dock) => dock.id));
  assertCondition(
    state.arrivingShips.every((ship) => ship.assignedDockId === null || assignedDockIds.has(ship.assignedDockId)),
    'All ships should reference valid dock ids after expansion.'
  );
}

function testSaveRoundtripLayoutAndResources(): void {
  const state = createInitialState({ seed: 3021 });
  buildHabitat(state);
  setupCoreRooms(state);
  setupTradeChain(state);
  paintRoom(state, RoomType.Cafeteria, 16, 10, 21, 13);
  placeModuleOrThrow(state, ModuleType.ServingStation, 16, 11);
  placeModuleOrThrow(state, ModuleType.Table, 18, 10);
  const dockId = placeEastHullDock(state, 8, 9);
  setDockPurpose(state, dockId, 'residential');
  state.controls.shipsPerCycle = 2;
  state.controls.taxRate = 0.31;
  state.metrics.credits = 321;
  state.metrics.waterStock = 88;
  state.metrics.airQuality = 67;
  state.legacyMaterialStock = 145;
  buyMaterials(state, 0, 25);

  const payload = serializeSave('roundtrip', state, 'sim-tests');
  const parsed = parseAndMigrateSave(payload);
  assertCondition(parsed.ok, 'Roundtrip payload should parse.');
  if (!parsed.ok) return;
  const hydrated = hydrateStateFromSave(parsed.save);
  const loaded = hydrated.state;

  assertCondition(
    loaded.tiles.every((tile, i) => tile === state.tiles[i]),
    'Loaded tiles should match the saved station layout.'
  );
  assertCondition(
    loaded.rooms.every((room, i) => room === state.rooms[i]),
    'Loaded room paint should match saved room paint.'
  );
  assertCondition(
    loaded.zones.every((zone, i) => zone === state.zones[i]),
    'Loaded zones should match saved zone paint.'
  );
  assertCondition(
    loaded.moduleInstances.some((m) => m.type === ModuleType.ServingStation && m.originTile === toIndex(16, 11, loaded.width)),
    'Saved serving station module should be restored.'
  );
  assertCondition(
    loaded.docks.some((d) => d.anchorTile === toIndex(44, 8, loaded.width) && d.purpose === 'residential'),
    'Saved dock configuration should be restored.'
  );
  assertCondition(Math.round(loaded.metrics.credits) === 321, 'Credits should be restored from save.');
  assertCondition(Math.round(loaded.metrics.waterStock) === 88, 'Water stock should be restored from save.');
  assertCondition(Math.round(loaded.metrics.airQuality) === 67, 'Air quality should be restored from save.');
  assertCondition(Math.round(loaded.legacyMaterialStock) === 145, 'Legacy material stock should be restored from save.');
  assertCondition(loaded.controls.shipsPerCycle === 2, 'Ship-per-cycle control should be restored from save.');
  assertCondition(Math.abs(loaded.controls.taxRate - 0.31) < 0.001, 'Tax rate should be restored from save.');
}

function testSaveLoadRegeneratesRuntimeEntities(): void {
  const state = createInitialState({ seed: 3022 });
  buildHabitat(state);
  setupCoreRooms(state);
  setupFoodChain(state);
  const dockId = placeEastHullDock(state, 8, 9);
  const ship = createDockedTransientShip(state, dockId, 9200);
  spawnReturningVisitor(state, dockByIdOrThrow(state, dockId).tiles[0], 720, ship.id);
  state.jobs.push({
    id: 1,
    type: 'pickup',
    itemType: 'rawMeal',
    amount: 2,
    fromTile: dockByIdOrThrow(state, dockId).tiles[0],
    toTile: dockByIdOrThrow(state, dockId).tiles[0],
    assignedCrewId: null,
    createdAt: 0,
    expiresAt: 120,
    state: 'pending',
    pickedUpAmount: 0,
    completedAt: null,
    lastProgressAt: 0
  });
  state.pendingSpawns.push({ at: 1, dockIndex: 0 });

  const payload = serializeSave('runtime', state, 'sim-tests');
  const parsed = parseAndMigrateSave(payload);
  assertCondition(parsed.ok, 'Runtime payload should parse.');
  if (!parsed.ok) return;
  const hydrated = hydrateStateFromSave(parsed.save);
  const loaded = hydrated.state;

  assertCondition(loaded.visitors.length === 0, 'Visitors should be reset during static-only load.');
  assertCondition(loaded.residents.length === 0, 'Residents should be reset during static-only load.');
  assertCondition(
    loaded.crewMembers.length === loaded.crew.total,
    'Crew members should be regenerated from crew total, not persisted one-to-one.'
  );
  assertCondition(loaded.jobs.length === 0, 'Jobs should be reset during static-only load.');
  assertCondition(loaded.arrivingShips.length === 0, 'Arriving ships should be reset during static-only load.');
  assertCondition(loaded.pendingSpawns.length === 0, 'Pending spawns should be reset during static-only load.');
  assertCondition(loaded.controls.paused, 'Loaded state should force pause.');
  tick(loaded, 0.5);
}

function testSaveLoadBestEffortMigration(): void {
  const baseline = createInitialState({ seed: 3023 });
  const len = baseline.width * baseline.height;
  const legacyPayload = JSON.stringify({
    name: 'legacy-partial',
    width: baseline.width,
    height: baseline.height,
    tiles: new Array<string>(len).fill('floor'),
    modules: [{ type: 'unknown-module', originTile: 5, rotation: 45 }],
    controls: { shipsPerCycle: 99, taxRate: -0.25 },
    resources: { credits: 123 },
    randomFutureField: { hello: 'world' }
  });

  const parsed = parseAndMigrateSave(legacyPayload);
  assertCondition(parsed.ok, 'Legacy payload should parse via best-effort migration.');
  if (!parsed.ok) return;
  assertCondition(parsed.warnings.length > 0, 'Legacy migration should emit warnings.');

  const hydrated = hydrateStateFromSave(parsed.save);
  assertCondition(hydrated.state.controls.shipsPerCycle === 3, 'Ships-per-cycle should be clamped during migration.');
  assertCondition(hydrated.state.controls.taxRate === 0, 'Tax rate should be clamped during migration.');
}

function testSaveLoadFailsOnInvalidCoreShape(): void {
  const invalidPayload = JSON.stringify({
    schemaVersion: 1,
    gameVersion: 'sim-tests',
    name: 'invalid',
    createdAt: new Date().toISOString(),
    snapshot: {
      width: 60,
      height: 40,
      zones: []
    }
  });
  const parsed = parseAndMigrateSave(invalidPayload);
  assertCondition(!parsed.ok, 'Invalid payload missing tiles should fail parse.');
}

function testInventoryReapplyClampsCapacity(): void {
  const state = createInitialState({ seed: 3024 });
  buildHabitat(state);
  setupTradeChain(state);
  tick(state, 0);
  const node = state.itemNodes[0];
  assertCondition(!!node, 'Fixture should expose at least one item node.');
  if (!node) return;

  const snapshot = captureSnapshot(state);
  snapshot.inventoryByTile = [
    {
      tileIndex: node.tileIndex,
      items: {
        rawMaterial: node.capacity * 3
      }
    }
  ];
  const envelope: StationSaveEnvelopeV1 = {
    schemaVersion: 1,
    gameVersion: 'sim-tests',
    createdAt: new Date().toISOString(),
    name: 'clamp-test',
    snapshot
  };
  const hydrated = hydrateStateFromSave(envelope);
  const reloadedNode = hydrated.state.itemNodes.find((n) => n.tileIndex === node.tileIndex);
  assertCondition(!!reloadedNode, 'Reloaded node should still exist.');
  if (!reloadedNode) return;
  assertCondition((reloadedNode.items.rawMaterial ?? 0) <= reloadedNode.capacity + 0.001, 'Reloaded inventory should be clamped to capacity.');
  assertCondition(
    hydrated.warnings.some((warning) => warning.includes('clamped')),
    'Clamped inventory reload should report warnings.'
  );
}

function snapshotActors(state: StationState): string {
  return JSON.stringify({
    visitors: state.visitors,
    residents: state.residents
  });
}

function testVisitorInspectorShapeAndPurity(): void {
  const state = createInitialState({ seed: 3040 });
  spawnVisitor(state, 10, 10, 10001);
  const visitor = state.visitors[0];
  visitor.state = VisitorState.ToCafeteria;
  visitor.archetype = 'shopper';
  visitor.primaryPreference = 'market';
  visitor.patience = 17.5;
  visitor.carryingMeal = false;
  visitor.servedMeal = false;
  visitor.reservedServingTile = toIndex(12, 10, state.width);
  visitor.reservedTargetTile = null;
  visitor.path = [toIndex(11, 10, state.width), toIndex(12, 10, state.width)];

  const before = snapshotActors(state);
  const inspector = getVisitorInspectorById(state, visitor.id);
  const after = snapshotActors(state);

  assertCondition(!!inspector, 'Visitor inspector should resolve by id.');
  if (!inspector) return;
  assertCondition(inspector.kind === 'visitor', 'Visitor inspector kind should be visitor.');
  assertCondition(inspector.desire === 'eat', 'Visitor desire should be eat before a served meal.');
  assertCondition(inspector.currentAction === 'heading to serving station', 'Visitor action should reflect serving-station pathing.');
  assertCondition(inspector.primaryPreference === 'market', 'Visitor inspector should expose primary preference.');
  assertCondition(inspector.targetTile === visitor.reservedServingTile, 'Visitor inspector should expose serving reservation as target.');
  assertCondition(before === after, 'Visitor inspector getter should not mutate actor state.');
}

function testResidentInspectorThresholdsAndPurity(): void {
  const state = createInitialState({ seed: 3041 });
  const residentTile = toIndex(14, 14, state.width);
  state.residents.push({
    id: 5001,
    x: 14.5,
    y: 14.5,
    tileIndex: residentTile,
    path: [],
    speed: 1.8,
    hunger: 70,
    energy: 30,
    hygiene: 76,
    stress: 22,
    state: ResidentState.Idle,
    actionTimer: 0,
    retargetAt: 0,
    reservedTargetTile: null,
    homeShipId: 77,
    homeDockId: 4,
    housingUnitId: 90,
    bedModuleId: 33,
    satisfaction: 63,
    leaveIntent: 0,
    blockedTicks: 1,
    airExposureSec: 0,
    healthState: 'healthy'
  });
  const resident = state.residents[0];

  const beforeSleep = snapshotActors(state);
  const sleepInspector = getResidentInspectorById(state, resident.id);
  const afterSleep = snapshotActors(state);
  assertCondition(!!sleepInspector, 'Resident inspector should resolve by id.');
  if (!sleepInspector) return;
  assertCondition(sleepInspector.desire === 'sleep', 'Resident desire should be sleep when energy is below threshold.');
  assertCondition(sleepInspector.dominantNeed === 'energy', 'Resident dominant need should be energy for low-energy resident.');
  assertCondition(
    sleepInspector.actionReason.includes('sleep'),
    'Resident action reason should explain the next need/desire when idle.'
  );
  assertCondition(beforeSleep === afterSleep, 'Resident inspector getter should not mutate actor state.');

  resident.leaveIntent = 20;
  const beforeReturn = snapshotActors(state);
  const returnInspector = getResidentInspectorById(state, resident.id);
  const afterReturn = snapshotActors(state);
  assertCondition(!!returnInspector, 'Resident inspector should resolve after leaveIntent mutation.');
  if (!returnInspector) return;
  assertCondition(
    returnInspector.desire === 'return_home_ship',
    'Resident desire should switch to return_home_ship when leave intent crosses trigger.'
  );
  assertCondition(beforeReturn === afterReturn, 'Resident inspector getter should remain non-mutating after desire switch.');
}

function testAgentInspectorMissingId(): void {
  const state = createInitialState({ seed: 3042 });
  assertCondition(getVisitorInspectorById(state, 999999) === null, 'Unknown visitor id should return null inspector.');
  assertCondition(getResidentInspectorById(state, 999999) === null, 'Unknown resident id should return null inspector.');
}

function run(): void {
  testAutonomousRoomsNoStaff();
  testCafeteriaMissingServingStation();
  testBedFootprintRotation();
  testFoodChainEndToEnd();
  testServingStarvationQueue();
  testMaterialsChainEndToEnd();
  testInventoryOverlayToggleState();
  testRoomInspectorInventoryBreakdown();
  testMarketBuyCapacityContext();
  testMarketBuyMissingIntakeContext();
  testFoodChainInspectorClarity();
  testServiceNodeUnreachableWarning();
  testLoungeModuleGating();
  testActivationChecksPreserved();
  testLegacyBalanceSanity();
  testJobMetricsConsistency();
  testVisitorBerthsAcceptTrafficResidentialDoNot();
  testConversionBlockedWithoutResidentialBerth();
  testConversionBlockedWithoutPrivateHousing();
  testConversionCreatesResidentHomeShip();
  testResidentDepartureFreesHomeShipBerth();
  testMapExpansionCostProgressionAndDirectionLock();
  testMapExpansionCreditGatingNoMutation();
  testMapExpansionNorthRemapsRuntimeReferences();
  testMapExpansionWestRemapsCoreAndDockIntegrity();
  testSaveRoundtripLayoutAndResources();
  testSaveLoadRegeneratesRuntimeEntities();
  testSaveLoadBestEffortMigration();
  testSaveLoadFailsOnInvalidCoreShape();
  testInventoryReapplyClampsCapacity();
  testVisitorInspectorShapeAndPurity();
  testResidentInspectorThresholdsAndPurity();
  testAgentInspectorMissingId();
  console.log('sim-tests: PASS');
}

run();
