import {
  buyMaterials,
  buyMaterialsDetailed,
  buyRawFood,
  createInitialState,
  getRoomDiagnosticAt,
  getRoomInspectorAt,
  sellMaterials,
  setRoom,
  setTile,
  tick,
  tryPlaceModule
} from '../src/sim/sim';
import {
  ModuleType,
  RoomType,
  TileType,
  VisitorState,
  fromIndex,
  toIndex,
  type ModuleRotation,
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
  testLoungeModuleGating();
  testActivationChecksPreserved();
  testLegacyBalanceSanity();
  testJobMetricsConsistency();
  console.log('sim-tests: PASS');
}

run();
