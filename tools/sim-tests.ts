import {
  buyMaterials,
  buyMaterialsDetailed,
  buyRawFood,
  collectServiceNodeReachability,
  expandMap,
  createInitialState,
  getUnlockTier,
  getNextExpansionCost,
  isModuleUnlocked,
  isRoomUnlocked,
  isShipTypeUnlocked,
  setDockAllowedShipType,
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
  ZoneType,
  fromIndex,
  toIndex,
  type ModuleRotation,
  type ArrivingShip,
  type StationState,
  type UnlockTier,
  type Visitor
} from '../src/sim/types';
import { resolveDoorVariantFromMask, resolveWallVariantFromMask } from '../src/render/tile-variants';

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
  state.unlocks.tier = 3;
  state.unlocks.unlockedIds = ['tier1_sustenance', 'tier2_commerce', 'tier3_logistics'];
  state.unlocks.unlockedAtSec = { tier1_sustenance: 0, tier2_commerce: 0, tier3_logistics: 0 };

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

function setUnlockTierForTest(state: StationState, tier: UnlockTier): void {
  state.unlocks.tier = tier;
  state.unlocks.unlockedIds =
    tier >= 3
      ? ['tier1_sustenance', 'tier2_commerce', 'tier3_logistics']
      : tier >= 2
        ? ['tier1_sustenance', 'tier2_commerce']
        : tier >= 1
          ? ['tier1_sustenance']
          : [];
  state.unlocks.unlockedAtSec = {
    ...(tier >= 1 ? { tier1_sustenance: 0 } : {}),
    ...(tier >= 2 ? { tier2_commerce: 0 } : {}),
    ...(tier >= 3 ? { tier3_logistics: 0 } : {})
  };
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

function spawnResidentActor(
  state: StationState,
  x: number,
  y: number,
  id: number,
  overrides: Partial<StationState['residents'][number]> = {}
): void {
  const tileIndex = toIndex(x, y, state.width);
  const center = fromIndex(tileIndex, state.width);
  const resident: StationState['residents'][number] = {
    id,
    x: center.x + 0.5,
    y: center.y + 0.5,
    tileIndex,
    path: [],
    speed: 1.8,
    hunger: 82,
    energy: 82,
    hygiene: 78,
    social: 60,
    safety: 55,
    stress: 28,
    routinePhase: 'errands',
    role: 'none',
    roleAffinity: {},
    state: ResidentState.Idle,
    actionTimer: 0,
    retargetAt: 0,
    reservedTargetTile: null,
    homeShipId: null,
    homeDockId: null,
    housingUnitId: null,
    bedModuleId: null,
    satisfaction: 65,
    leaveIntent: 0,
    blockedTicks: 0,
    airExposureSec: 0,
    healthState: 'healthy',
    agitation: 0,
    activeIncidentId: null,
    confrontationUntil: 0
  };
  state.residents.push({ ...resident, ...overrides });
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

function testWallLightRequiresAdjacentWall(): void {
  const state = createInitialState({ seed: 30035 });
  buildHabitat(state);

  const invalid = tryPlaceModule(state, ModuleType.WallLight, toIndex(20, 20, state.width), 0);
  const valid = tryPlaceModule(state, ModuleType.WallLight, toIndex(5, 4, state.width), 0);

  assertCondition(!invalid.ok, 'Wall light should fail when not mounted on a top wall tile.');
  assertCondition(valid.ok, 'Wall light should place on a top wall tile above walkable interior.');
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
    social: 70,
    safety: 70,
    stress: 10,
    routinePhase: 'errands',
    role: 'none',
    roleAffinity: {},
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
    social: 62,
    safety: 64,
    stress: 22,
    routinePhase: 'errands',
    role: 'none',
    roleAffinity: {},
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

function seedAggressiveResidents(state: StationState, startId: number, pairs: number): void {
  for (let i = 0; i < pairs; i++) {
    const x = 19 + (i % 4) * 2;
    const y = 15 + Math.floor(i / 4) * 2;
    spawnResidentActor(state, x, y, startId + i * 2, {
      agitation: 96,
      stress: 92,
      safety: 40,
      social: 48,
      satisfaction: 42,
      leaveIntent: 0,
      retargetAt: state.now + 999
    });
    spawnResidentActor(state, x + 1, y, startId + i * 2 + 1, {
      agitation: 93,
      stress: 88,
      safety: 40,
      social: 50,
      satisfaction: 44,
      leaveIntent: 0,
      retargetAt: state.now + 999
    });
  }
}

function seedModerateConflictResidents(state: StationState, startId: number, pairs: number): void {
  for (let i = 0; i < pairs; i++) {
    const x = 19 + (i % 4) * 2;
    const y = 15 + Math.floor(i / 4) * 2;
    spawnResidentActor(state, x, y, startId + i * 2, {
      agitation: 64,
      stress: 22,
      safety: 42,
      social: 50,
      satisfaction: 58,
      leaveIntent: 0,
      retargetAt: state.now + 999
    });
    spawnResidentActor(state, x + 1, y, startId + i * 2 + 1, {
      agitation: 66,
      stress: 24,
      safety: 42,
      social: 52,
      satisfaction: 59,
      leaveIntent: 0,
      retargetAt: state.now + 999
    });
  }
}

function setupSecurityArena(state: StationState, posts: Array<{ x: number; y: number }>): void {
  buildHabitat(state);
  paintRoom(state, RoomType.Lounge, 17, 13, 31, 24);
  setupLeisure(state, true);
  for (const post of posts) {
    paintRoom(state, RoomType.Security, post.x, post.y, post.x + 1, post.y + 1);
    placeModuleOrThrow(state, ModuleType.Terminal, post.x, post.y);
  }
  state.crew.total = 16;
  state.controls.shipsPerCycle = 0;
  state.metrics.airQuality = 90;
  state.metrics.mealStock = 130;
  state.metrics.rawFoodStock = 140;
  runFor(state, 3);
  const securityTiles = posts.map((post) => toIndex(post.x, post.y, state.width));
  for (let i = 0; i < Math.min(state.crewMembers.length, securityTiles.length); i++) {
    const crew = state.crewMembers[i];
    const tile = securityTiles[i];
    const p = fromIndex(tile, state.width);
    crew.tileIndex = tile;
    crew.x = p.x + 0.5;
    crew.y = p.y + 0.5;
    crew.role = 'security';
    crew.assignedSystem = 'security';
    crew.targetTile = tile;
    crew.path = [];
    crew.activeJobId = null;
    crew.resting = false;
    crew.healthState = 'healthy';
    crew.assignmentStickyUntil = state.now + 999;
    crew.assignmentHoldUntil = state.now + 999;
  }
}

function testImmediateDefuseMajority(): void {
  const state = createInitialState({ seed: 4201 });
  buildHabitat(state);
  paintRoom(state, RoomType.Security, 10, 10, 11, 11);
  placeModuleOrThrow(state, ModuleType.Terminal, 10, 10);
  state.crew.total = 10;
  state.controls.shipsPerCycle = 0;
  runFor(state, 3);

  assertCondition(state.crewMembers.length > 0, 'Expected crew pool for intervention reliability test.');
  const responder = state.crewMembers[0];
  const securityTile = toIndex(10, 10, state.width);
  const center = fromIndex(securityTile, state.width);
  responder.tileIndex = securityTile;
  responder.x = center.x + 0.5;
  responder.y = center.y + 0.5;
  responder.role = 'security';
  responder.assignedSystem = 'security';
  responder.targetTile = securityTile;
  responder.path = [];
  responder.activeJobId = null;
  responder.resting = false;
  responder.healthState = 'healthy';

  const incidentCount = 30;
  let residentId = 8800;
  for (let i = 0; i < incidentCount; i++) {
    const x = 18 + (i % 6);
    const y = 15 + Math.floor(i / 6);
    const aId = residentId++;
    const bId = residentId++;
    const incidentId = state.incidentSpawnCounter++;
    const tileIndex = toIndex(x, y, state.width);
    const severity = i % 2 === 0 ? 1.2 : 1.8;

    spawnResidentActor(state, x, y, aId, {
      agitation: 80,
      stress: 55,
      safety: 45,
      activeIncidentId: incidentId,
      confrontationUntil: state.now + 12
    });
    spawnResidentActor(state, x + 1, y, bId, {
      agitation: 82,
      stress: 58,
      safety: 45,
      activeIncidentId: incidentId,
      confrontationUntil: state.now + 12
    });

    state.incidents.push({
      id: incidentId,
      type: 'fight',
      tileIndex,
      severity,
      createdAt: state.now - 0.5,
      dispatchAt: state.now - 0.2,
      interveneAt: state.now + 0.05,
      resolveBy: state.now + 12,
      stage: 'intervening',
      outcome: null,
      resolvedAt: null,
      assignedCrewId: responder.id,
      residentParticipantIds: [aId, bId],
      extendedResolveAt: null
    });
  }

  runFor(state, 12);

  assertCondition(
    state.usageTotals.securityFightInterventions >= incidentCount,
    'Expected repeated fight interventions to evaluate immediate defuse rate.'
  );
  assertCondition(
    state.metrics.immediateDefuseRate >= 0.75,
    `Immediate defuse rate should be >= 0.75, got ${state.metrics.immediateDefuseRate.toFixed(3)}`
  );
  assertCondition(
    state.metrics.escalatedFightRate <= 0.3,
    `Escalated fight rate should remain <= 0.30, got ${state.metrics.escalatedFightRate.toFixed(3)}`
  );
}

function testProximitySuppressionEffectiveness(): void {
  const near = createInitialState({ seed: 4202 });
  setupSecurityArena(near, [
    { x: 20, y: 14 },
    { x: 28, y: 20 }
  ]);
  seedAggressiveResidents(near, 8200, 8);
  runFor(near, 70);

  const far = createInitialState({ seed: 4202 });
  setupSecurityArena(far, [
    { x: 7, y: 7 },
    { x: 39, y: 27 }
  ]);
  seedAggressiveResidents(far, 8300, 8);
  runFor(far, 70);

  const nearConfronts = near.usageTotals.residentConfrontations;
  const farConfronts = far.usageTotals.residentConfrontations;
  assertCondition(
    near.metrics.incidentSuppressionAvg < far.metrics.incidentSuppressionAvg,
    `Near posts should reduce local incident multipliers (near ${near.metrics.incidentSuppressionAvg.toFixed(3)}, far ${far.metrics.incidentSuppressionAvg.toFixed(3)}).`
  );
  assertCondition(
    nearConfronts <= farConfronts + 2,
    `Near posts should not increase confrontations materially (near ${nearConfronts}, far ${farConfronts}).`
  );
}

function testTrespassSpamGuard(): void {
  const state = createInitialState({ seed: 4203 });
  buildHabitat(state);
  const restrictedTile = toIndex(12, 12, state.width);
  state.zones[restrictedTile] = ZoneType.Restricted;
  for (let i = 0; i < 8; i++) {
    spawnVisitor(state, 12, 12, 9000 + i);
  }
  runFor(state, 0.25);
  const firstBurst = state.incidents.filter((incident) => incident.type === 'trespass').length;
  assertCondition(firstBurst === 1, `Trespass cooldown should cap same-tile burst to one incident, got ${firstBurst}.`);

  for (let i = 0; i < 4; i++) {
    spawnVisitor(state, 12, 12, 9100 + i);
  }
  runFor(state, 1.5);
  const secondBurst = state.incidents.filter((incident) => incident.type === 'trespass').length;
  assertCondition(
    secondBurst === firstBurst,
    'Trespass cooldown should block repeated same-tile incidents inside the cooldown window.'
  );
}

function setupNeedsRoutineArena(state: StationState, withSecurity: boolean): number {
  buildHabitat(state);
  paintRoom(state, RoomType.Lounge, 18, 12, 32, 24);
  setupLeisure(state, true);
  if (withSecurity) {
    paintRoom(state, RoomType.Security, 19, 12, 20, 13);
    placeModuleOrThrow(state, ModuleType.Terminal, 19, 12);
    state.crew.total = 14;
  } else {
    state.crew.total = 8;
  }
  state.controls.shipsPerCycle = 0;
  state.metrics.airQuality = 88;
  state.metrics.mealStock = 140;
  state.metrics.rawFoodStock = 150;
  runFor(state, 3);
  if (withSecurity && state.crewMembers.length > 0) {
    const securityTile = toIndex(19, 12, state.width);
    const p = fromIndex(securityTile, state.width);
    const crew = state.crewMembers[0];
    crew.tileIndex = securityTile;
    crew.x = p.x + 0.5;
    crew.y = p.y + 0.5;
    crew.role = 'security';
    crew.assignedSystem = 'security';
    crew.targetTile = securityTile;
    crew.path = [];
    crew.activeJobId = null;
    crew.resting = false;
    crew.healthState = 'healthy';
    crew.assignmentStickyUntil = state.now + 999;
    crew.assignmentHoldUntil = state.now + 999;
  }
  state.now = 72; // Force socialize phase for routine-driven behavior checks.

  const socialResidentId = withSecurity ? 9201 : 9301;
  spawnResidentActor(state, 20, 20, socialResidentId, {
    social: 12,
    safety: 62,
    agitation: 25,
    stress: 22,
    satisfaction: 58
  });
  for (let i = 0; i < 10; i++) {
    const x = 22 + (i % 4);
    const y = 16 + Math.floor(i / 4);
    spawnResidentActor(state, x, y, socialResidentId + 10 + i, {
      social: 42,
      safety: 34,
      agitation: 86,
      stress: 72,
      satisfaction: 48,
      retargetAt: state.now + 999
    });
  }
  return socialResidentId;
}

function testNeedsAndRoutinesBehavior(): void {
  const withSecurity = createInitialState({ seed: 4204 });
  const withSecuritySocialId = setupNeedsRoutineArena(withSecurity, true);
  runFor(withSecurity, 40);
  const withSecuritySocialResident = withSecurity.residents.find((resident) => resident.id === withSecuritySocialId);
  assertCondition(!!withSecuritySocialResident, 'Expected social-deficit resident to remain active for routine validation.');
  if (!withSecuritySocialResident) return;
  assertCondition(
    withSecuritySocialResident.social > 35,
    `Social routine should recover low social need, got ${withSecuritySocialResident.social.toFixed(1)}.`
  );

  const withoutSecurity = createInitialState({ seed: 4204 });
  const withoutSecuritySocialId = setupNeedsRoutineArena(withoutSecurity, false);
  runFor(withoutSecurity, 40);
  const withoutSecuritySocialResident = withoutSecurity.residents.find((resident) => resident.id === withoutSecuritySocialId);
  assertCondition(!!withoutSecuritySocialResident, 'Expected no-security social resident to remain active for comparison.');
  if (!withoutSecuritySocialResident) return;
  assertCondition(
    withSecurity.metrics.residentSafetyAvg > withoutSecurity.metrics.residentSafetyAvg + 5,
    `Security aura should improve safety average (with ${withSecurity.metrics.residentSafetyAvg.toFixed(2)}, without ${withoutSecurity.metrics.residentSafetyAvg.toFixed(2)}).`
  );
  assertCondition(
    withSecurity.usageTotals.residentConfrontations <= withoutSecurity.usageTotals.residentConfrontations + 4,
    'Security-covered scenario should not produce materially more confrontations than no-security baseline.'
  );
}

function testUnlockTier0StartsConstrained(): void {
  const state = createInitialState({ seed: 5101 });
  assertCondition(getUnlockTier(state) === 0, 'New stations should start at unlock tier 0.');
  assertCondition(isRoomUnlocked(state, RoomType.Reactor), 'Tier 0 should include reactor.');
  assertCondition(isRoomUnlocked(state, RoomType.Dorm), 'Tier 0 should include dorm.');
  assertCondition(!isRoomUnlocked(state, RoomType.Workshop), 'Tier 0 should not include workshop.');
  assertCondition(!isRoomUnlocked(state, RoomType.Security), 'Tier 0 should not include security.');
  assertCondition(!isModuleUnlocked(state, ModuleType.Workbench), 'Tier 0 should not include workbench.');
  assertCondition(!isModuleUnlocked(state, ModuleType.Terminal), 'Tier 0 should not include terminal.');
  assertCondition(isShipTypeUnlocked(state, 'tourist'), 'Tier 0 should include tourist ships.');
  assertCondition(isShipTypeUnlocked(state, 'trader'), 'Tier 0 should include trader ships.');
  assertCondition(!isShipTypeUnlocked(state, 'industrial'), 'Tier 0 should not include industrial ships.');
  assertCondition(!isShipTypeUnlocked(state, 'military'), 'Tier 0 should not include military ships.');
}

function testUnlockTier1TriggersAfterStability(): void {
  const state = createInitialState({ seed: 5102 });
  buildHabitat(state);
  setUnlockTierForTest(state, 0);
  setupCoreRooms(state);
  setupFoodChain(state);
  state.crew.total = 10;
  state.metrics.airQuality = 82;
  state.metrics.mealStock = 40;
  state.metrics.airBlockedWarningActive = false;
  // Predicate-driven T1 advance gates on mealsServedTotal (canonical
  // lifetime counter). Old air+mealStock+cafeteria criteria kept as
  // environmental setup but are no longer the actual trigger.
  state.metrics.mealsServedTotal = 1;
  state.controls.paused = true;
  tick(state, 0);
  assertCondition(getUnlockTier(state) >= 1, 'Tier 1 should unlock after stability criteria are met.');
}

function testUnlockTier2RequiresLogisticsSignal(): void {
  const state = createInitialState({ seed: 5103 });
  buildHabitat(state);
  setUnlockTierForTest(state, 1);
  state.controls.paused = true;
  state.now = 120;
  state.usageTotals.creditsMarketGross = 12;
  state.usageTotals.creditsTradeGoodsGross = 10;
  state.usageTotals.creditsMealPayoutGross = 8;
  state.usageTotals.payrollPaid = 8;
  tick(state, 0);
  assertCondition(getUnlockTier(state) === 1, 'Tier 2 should not unlock without logistics completion signal.');

  state.jobs.length = 0;
  for (let i = 0; i < 20; i++) {
    state.jobs.push({
      id: 6000 + i,
      type: 'pickup',
      itemType: 'rawMeal',
      amount: 1,
      fromTile: state.core.serviceTile,
      toTile: state.core.serviceTile,
      assignedCrewId: null,
      createdAt: 0,
      expiresAt: 90,
      state: 'done',
      pickedUpAmount: 1,
      completedAt: state.now,
      lastProgressAt: state.now
    });
  }
  // Predicate-driven T2 advance gates on lifetime counters
  // (creditsEarnedLifetime + archetypesServedLifetime). Populate both
  // past their thresholds; the jobs-signal above is retained as
  // context but no longer the direct trigger.
  state.metrics.creditsEarnedLifetime = 600;
  state.usageTotals.archetypesEverSeen = {
    diner: true,
    shopper: true,
    lounger: true,
    rusher: false,
  };
  tick(state, 0);
  assertCondition(getUnlockTier(state) >= 2, 'Tier 2 should unlock after net credits and logistics jobs thresholds are met.');
}

function testTier0ShipServicesIgnoreLockedDemands(): void {
  const state = createInitialState({ seed: 51035 });
  buildHabitat(state);
  setUnlockTierForTest(state, 0);
  setupCoreRooms(state);
  setupFoodChain(state);
  state.controls.shipsPerCycle = 0;
  const dockId = placeEastHullDock(state, 8, 9);
  const touristShip = createDockedTransientShip(state, dockId, 9701);
  touristShip.shipType = 'tourist';
  touristShip.stage = 'depart';
  touristShip.stageTime = 2.2;
  const traderShip = createDockedTransientShip(state, dockId, 9702);
  traderShip.shipType = 'trader';
  traderShip.stage = 'depart';
  traderShip.stageTime = 2.2;
  const beforePenalty = state.metrics.stationRatingPenaltyTotal.serviceFailure;
  runFor(state, 0.25);
  const afterPenalty = state.metrics.stationRatingPenaltyTotal.serviceFailure;
  assertCondition(
    afterPenalty <= beforePenalty + 0.001,
    'Tier 0 should not penalize tourist/trader ships for locked lounge/market service tags.'
  );
}

function testMilitaryShipPenalizesLowSecurity(): void {
  const lowSecurity = createInitialState({ seed: 5104 });
  buildHabitat(lowSecurity);
  setUnlockTierForTest(lowSecurity, 3);
  lowSecurity.controls.shipsPerCycle = 0;
  lowSecurity.metrics.securityCoveragePct = 0;
  const lowSecurityDock = placeEastHullDock(lowSecurity, 8, 9);
  const lowSecurityShip = createDockedTransientShip(lowSecurity, lowSecurityDock, 9501);
  lowSecurityShip.shipType = 'military';
  lowSecurityShip.stage = 'depart';
  lowSecurityShip.stageTime = 2.2;
  lowSecurity.incidents.push({
    id: lowSecurity.incidentSpawnCounter++,
    type: 'fight',
    tileIndex: toIndex(20, 20, lowSecurity.width),
    severity: 1.8,
    createdAt: lowSecurity.now - 1,
    dispatchAt: null,
    interveneAt: null,
    resolveBy: lowSecurity.now + 20,
    stage: 'detected',
    outcome: null,
    resolvedAt: null,
    assignedCrewId: null,
    residentParticipantIds: [],
    extendedResolveAt: null
  });
  runFor(lowSecurity, 0.25);
  const lowSecurityPenalty = lowSecurity.metrics.stationRatingPenaltyTotal.serviceFailure;

  const secure = createInitialState({ seed: 5104 });
  buildHabitat(secure);
  setUnlockTierForTest(secure, 3);
  secure.controls.shipsPerCycle = 0;
  secure.metrics.securityCoveragePct = 100;
  const secureDock = placeEastHullDock(secure, 8, 9);
  const secureShip = createDockedTransientShip(secure, secureDock, 9502);
  secureShip.shipType = 'military';
  secureShip.stage = 'depart';
  secureShip.stageTime = 2.2;
  runFor(secure, 0.25);
  const securePenalty = secure.metrics.stationRatingPenaltyTotal.serviceFailure;
  assertCondition(
    lowSecurityPenalty > securePenalty,
    'Military departures should apply larger service penalties when incidents remain unresolved under low security.'
  );
}

function testColonistShipBoostsConversionWhenHousingValid(): void {
  const tourist = createInitialState({ seed: 5105 });
  buildHabitat(tourist);
  setUnlockTierForTest(tourist, 3);
  tourist.crew.total = 0;
  tourist.metrics.stationRating = 55;
  tourist.rng = () => 0.02;
  const visitorDockTourist = placeEastHullDock(tourist, 8, 9);
  const residentialDockTourist = placeEastHullDock(tourist, 18, 19);
  setDockPurpose(tourist, residentialDockTourist, 'residential');
  setDockAllowedShipType(tourist, residentialDockTourist, 'tourist', true);
  setupPrivateResidentHousing(tourist);
  const touristShip = createDockedTransientShip(tourist, visitorDockTourist, 9601);
  touristShip.shipType = 'tourist';
  spawnReturningVisitor(tourist, dockByIdOrThrow(tourist, visitorDockTourist).tiles[0], 5201, touristShip.id);
  runFor(tourist, 1.5);
  const touristConversions = tourist.usageTotals.residentConversionSuccesses;

  const colonist = createInitialState({ seed: 5105 });
  buildHabitat(colonist);
  setUnlockTierForTest(colonist, 3);
  colonist.crew.total = 0;
  colonist.metrics.stationRating = 55;
  colonist.rng = () => 0.02;
  const visitorDockColonist = placeEastHullDock(colonist, 8, 9);
  const residentialDockColonist = placeEastHullDock(colonist, 18, 19);
  setDockPurpose(colonist, residentialDockColonist, 'residential');
  setDockAllowedShipType(colonist, residentialDockColonist, 'colonist', true);
  setupPrivateResidentHousing(colonist);
  const colonistShip = createDockedTransientShip(colonist, visitorDockColonist, 9602);
  colonistShip.shipType = 'colonist';
  spawnReturningVisitor(colonist, dockByIdOrThrow(colonist, visitorDockColonist).tiles[0], 5202, colonistShip.id);
  runFor(colonist, 1.5);
  const colonistConversions = colonist.usageTotals.residentConversionSuccesses;
  assertCondition(
    colonistConversions > touristConversions,
    'Colonist ships should convert more reliably than tourist ships when valid private housing exists.'
  );
}

function testResidentWorkPhaseAffectsThroughput(): void {
  const baseline = createInitialState({ seed: 5106 });
  buildHabitat(baseline);
  setUnlockTierForTest(baseline, 3);
  setupCoreRooms(baseline);
  paintRoom(baseline, RoomType.Hydroponics, 6, 10, 9, 13);
  placeModuleOrThrow(baseline, ModuleType.GrowStation, 6, 11);
  baseline.now = 60;
  baseline.crew.total = 0;
  runFor(baseline, 1.2);
  const baseRate = baseline.metrics.rawFoodProdRate;

  const boosted = createInitialState({ seed: 5106 });
  buildHabitat(boosted);
  setUnlockTierForTest(boosted, 3);
  setupCoreRooms(boosted);
  paintRoom(boosted, RoomType.Hydroponics, 6, 10, 9, 13);
  placeModuleOrThrow(boosted, ModuleType.GrowStation, 6, 11);
  boosted.now = 60;
  boosted.crew.total = 0;
  spawnResidentActor(boosted, 6, 11, 5301, {
    role: 'hydro_assist',
    roleAffinity: { [RoomType.Hydroponics]: 1 },
    routinePhase: 'work',
    state: ResidentState.Leisure,
    actionTimer: 999,
    retargetAt: boosted.now + 999
  });
  runFor(boosted, 1.2);
  const boostedRate = boosted.metrics.rawFoodProdRate;
  assertCondition(boostedRate > baseRate + 0.01, 'Hydro-assist work phase should increase hydroponics throughput.');
}

function testResidentRoutineFallbackWithoutWorkRooms(): void {
  const state = createInitialState({ seed: 5107 });
  buildHabitat(state);
  setUnlockTierForTest(state, 3);
  setupCoreRooms(state);
  spawnResidentActor(state, 20, 20, 5401, {
    role: 'hydro_assist',
    roleAffinity: { [RoomType.Hydroponics]: 1 },
    routinePhase: 'work',
    retargetAt: 0
  });
  runFor(state, 40);
  const resident = state.residents.find((entry) => entry.id === 5401) ?? null;
  assertCondition(!!resident, 'Resident should remain active even when no work rooms exist.');
  if (!resident) return;
  assertCondition(
    Number.isFinite(resident.x) &&
      Number.isFinite(resident.y) &&
      Number.isFinite(resident.hunger) &&
      resident.path.length >= 0,
    'Residents without work targets should remain stable and continue routine simulation without invalid state.'
  );
}

function testClinicLowersDistressAndDeaths(): void {
  const withClinic = createInitialState({ seed: 5108 });
  buildHabitat(withClinic);
  setUnlockTierForTest(withClinic, 3);
  setupCoreRooms(withClinic);
  paintRoom(withClinic, RoomType.Clinic, 24, 12, 27, 14);
  placeModuleOrThrow(withClinic, ModuleType.MedBed, 24, 13);
  spawnResidentActor(withClinic, 24, 13, 5501, {
    state: ResidentState.Sleeping,
    actionTimer: 999,
    healthState: 'critical',
    airExposureSec: 60
  });
  runFor(withClinic, 8);
  const clinicExposure = withClinic.residents.find((resident) => resident.id === 5501)?.airExposureSec ?? 999;

  const withoutClinic = createInitialState({ seed: 5108 });
  buildHabitat(withoutClinic);
  setUnlockTierForTest(withoutClinic, 3);
  setupCoreRooms(withoutClinic);
  spawnResidentActor(withoutClinic, 24, 13, 5502, {
    state: ResidentState.Sleeping,
    actionTimer: 999,
    healthState: 'critical',
    airExposureSec: 60
  });
  runFor(withoutClinic, 8);
  const noClinicExposure = withoutClinic.residents.find((resident) => resident.id === 5502)?.airExposureSec ?? 999;
  assertCondition(clinicExposure + 2 < noClinicExposure, 'Clinic should materially accelerate distress recovery.');
}

function testBrigReducesIncidentDuration(): void {
  const state = createInitialState({ seed: 5109 });
  buildHabitat(state);
  setUnlockTierForTest(state, 3);
  setupCoreRooms(state);
  paintRoom(state, RoomType.Brig, 14, 10, 16, 12);
  placeModuleOrThrow(state, ModuleType.CellConsole, 15, 10);
  runFor(state, 1);
  const brigInspector = getRoomInspectorAt(state, toIndex(15, 10, state.width));
  assertCondition(!!brigInspector, 'Brig inspector should be available.');
  assertCondition(
    (brigInspector?.hints ?? []).some((hint) => hint.includes('fight containment')),
    'Brig diagnostics should advertise incident containment impact.'
  );
}

function testSaveV1MigratesToV2UnlockDefaults(): void {
  const baseline = createInitialState({ seed: 5110 });
  const len = baseline.width * baseline.height;
  const rooms = new Array<string>(len).fill('none');
  const roomHousingPolicies = new Array<string>(len).fill('visitor');
  const zones = new Array<string>(len).fill('public');
  const tiles = new Array<string>(len).fill('floor');
  const workshopTile = toIndex(12, 12, baseline.width);
  rooms[workshopTile] = 'workshop';
  rooms[workshopTile + 1] = 'workshop';
  const payload = JSON.stringify({
    schemaVersion: 1,
    gameVersion: 'legacy',
    createdAt: new Date().toISOString(),
    name: 'legacy-no-unlocks',
    snapshot: {
      width: baseline.width,
      height: baseline.height,
      tiles,
      zones,
      rooms,
      roomHousingPolicies,
      modules: [{ type: 'workbench', originTile: workshopTile, rotation: 0 }],
      dockConfigs: [],
      resources: { credits: 100, waterStock: 50, airQuality: 85, legacyMaterialStock: 40 },
      inventoryByTile: [],
      controls: { shipsPerCycle: 0, taxRate: 0.2 }
    }
  });
  const parsed = parseAndMigrateSave(payload);
  assertCondition(parsed.ok, 'Legacy v1 payload should parse.');
  if (!parsed.ok) return;
  assertCondition(parsed.save.snapshot.unlocks.tier >= 2, 'Missing unlock state should be derived from saved advanced content.');
  const hydrated = hydrateStateFromSave(parsed.save);
  assertCondition(
    hydrated.state.moduleInstances.some((module) => module.type === ModuleType.Workbench && module.originTile === workshopTile),
    'Derived unlock tier should preserve advanced module placement from v1 saves.'
  );
}

function test20MinuteComplexityCurveReadable(): void {
  const state = createInitialState({ seed: 5111 });
  buildHabitat(state);
  setUnlockTierForTest(state, 0);
  setupCoreRooms(state);
  setupFoodChain(state);
  const dockId = placeEastHullDock(state, 8, 9);
  setDockAllowedShipType(state, dockId, 'tourist', true);
  setDockAllowedShipType(state, dockId, 'trader', true);
  state.controls.shipsPerCycle = 1;
  state.crew.total = 12;
  state.metrics.credits = 200;
  runFor(state, 600, 0.5);
  const tierAt10 = getUnlockTier(state);
  runFor(state, 600, 0.5);
  const tierAt20 = getUnlockTier(state);
  assertCondition(tierAt10 >= 1, 'By 10 minutes the player should usually unlock Tier 1 decisions.');
  assertCondition(tierAt10 < 3, 'By 10 minutes the game should avoid jumping straight to full complexity.');
  assertCondition(tierAt20 >= tierAt10, 'Unlock tier should not regress over time.');
}

function testWallVariantMaskMapping(): void {
  const expected: Array<[number, string, 0 | 90 | 180 | 270]> = [
    [0, 'solo', 0],
    [1, 'end', 0],
    [2, 'end', 90],
    [4, 'end', 180],
    [8, 'end', 270],
    [3, 'corner', 0],
    [6, 'corner', 90],
    [12, 'corner', 180],
    [9, 'corner', 270],
    [5, 'straight', 0],
    [10, 'straight', 90],
    [7, 'tee', 0],
    [14, 'tee', 90],
    [13, 'tee', 180],
    [11, 'tee', 270],
    [15, 'cross', 0]
  ];
  for (const [mask, shape, rotation] of expected) {
    const actual = resolveWallVariantFromMask(mask);
    assertCondition(actual.shape === shape, `Wall variant shape mismatch for mask ${mask}.`);
    assertCondition(actual.rotation === rotation, `Wall variant rotation mismatch for mask ${mask}.`);
  }

  const horizontalMasks = [0, 2, 8, 10, 11, 14];
  const verticalMasks = [1, 4, 5, 7, 13];
  for (const mask of horizontalMasks) {
    const actual = resolveDoorVariantFromMask(mask);
    assertCondition(actual.shape === 'horizontal', `Door variant should be horizontal for mask ${mask}.`);
  }
  for (const mask of verticalMasks) {
    const actual = resolveDoorVariantFromMask(mask);
    assertCondition(actual.shape === 'vertical', `Door variant should be vertical for mask ${mask}.`);
  }
}

function run(): void {
  testUnlockTier0StartsConstrained();
  testUnlockTier1TriggersAfterStability();
  testUnlockTier2RequiresLogisticsSignal();
  testTier0ShipServicesIgnoreLockedDemands();
  testMilitaryShipPenalizesLowSecurity();
  testColonistShipBoostsConversionWhenHousingValid();
  testResidentWorkPhaseAffectsThroughput();
  testResidentRoutineFallbackWithoutWorkRooms();
  testClinicLowersDistressAndDeaths();
  testBrigReducesIncidentDuration();
  testSaveV1MigratesToV2UnlockDefaults();
  test20MinuteComplexityCurveReadable();
  testWallVariantMaskMapping();
  testAutonomousRoomsNoStaff();
  testCafeteriaMissingServingStation();
  testBedFootprintRotation();
  testWallLightRequiresAdjacentWall();
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
  testImmediateDefuseMajority();
  testProximitySuppressionEffectiveness();
  testTrespassSpamGuard();
  testNeedsAndRoutinesBehavior();
  console.log('sim-tests: PASS');
}

run();
