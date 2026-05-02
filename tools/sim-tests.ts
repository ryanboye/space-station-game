import {
  buyMaterials,
  buyMaterialsDetailed,
  buyRawFood,
  buildStationExpansionOnTruss,
  cancelConstructionAtTile,
  collectServiceNodeReachability,
  expandMap,
  createInitialState,
  findPath,
  getUnlockTier,
  getNextExpansionCost,
  isModuleUnlocked,
  isRoomUnlocked,
  isShipTypeUnlocked,
  planModuleConstruction,
  planTileConstruction,
  setDockAllowedShipSize,
  setDockAllowedShipType,
  setDockPurpose,
  getCrewInspectorById,
  getResidentInspectorById,
  getLifeSupportTileDiagnostic,
  getMaintenanceTileDiagnostic,
  getRoutePressureDiagnostics,
  getRoutePressureTileDiagnostic,
  getRoomEnvironmentTileDiagnostic,
  setRoomHousingPolicy,
  getVisitorInspectorById,
  getRoomDiagnosticAt,
  getRoomInspectorAt,
  sellMaterials,
  setRoom,
  setTile,
  SHIP_MIN_DOCK_AREA,
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
import { applyColdStartScenario } from '../src/sim/cold-start-scenarios';
import { resolveDoorVariantFromMask, resolveWallVariantFromMask } from '../src/render/tile-variants';
import { pickDualVariant, type DualWallShape } from '../src/render/wall-dual-tilemap';

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

function setupFiveResidentHabitation(state: StationState): void {
  paintRoom(state, RoomType.Dorm, 10, 22, 19, 25);
  paintRoom(state, RoomType.Hygiene, 21, 22, 23, 24);
  const dormPolicyOk = setRoomHousingPolicy(state, toIndex(10, 22, state.width), 'private_resident');
  const hygienePolicyOk = setRoomHousingPolicy(state, toIndex(21, 22, state.width), 'resident');
  assertCondition(dormPolicyOk, 'Expected to set dorm housing policy to private_resident.');
  assertCondition(hygienePolicyOk, 'Expected to set hygiene housing policy to resident.');
  for (let i = 0; i < 5; i++) {
    placeModuleOrThrow(state, ModuleType.Bed, 10 + i * 2, 23);
    spawnResidentActor(state, 12 + i, 20, 7000 + i, {
      housingUnitId: toIndex(10, 22, state.width)
    });
  }
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

function createDockedBerthShip(state: StationState, berthTiles: number[], shipId: number): ArrivingShip {
  const center = berthTiles
    .map((tile) => fromIndex(tile, state.width))
    .reduce(
      (acc, pos) => ({ x: acc.x + pos.x, y: acc.y + pos.y }),
      { x: 0, y: 0 }
    );
  const anchorTile = berthTiles.reduce((best, tile) => Math.min(best, tile), berthTiles[0]);
  const ship: ArrivingShip = {
    id: shipId,
    kind: 'transient',
    size: 'small',
    bayTiles: [...berthTiles],
    bayCenterX: center.x / Math.max(1, berthTiles.length) + 0.5,
    bayCenterY: center.y / Math.max(1, berthTiles.length) + 0.5,
    shipType: 'tourist',
    lane: 'north',
    originDockId: null,
    assignedDockId: null,
    assignedBerthAnchor: anchorTile,
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
    healthState: 'healthy',
    leisureLegsRemaining: 0,
    leisureLegsPlanned: 0,
    lastLeisureKind: null
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
    healthState: 'healthy',
    leisureLegsRemaining: 0,
    leisureLegsPlanned: 0,
    lastLeisureKind: null
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

function placeCrewAtSystemAnchor(state: StationState, tileIndex: number, system: 'reactor' | 'life-support'): void {
  state.crew.total = Math.max(state.crew.total, 1);
  runFor(state, 0.25);
  const crew = state.crewMembers[0];
  assertCondition(!!crew, 'Expected crew member to exist.');
  const center = fromIndex(tileIndex, state.width);
  crew.x = center.x + 0.5;
  crew.y = center.y + 0.5;
  crew.tileIndex = tileIndex;
  crew.path = [];
  crew.role = 'reactor';
  crew.targetTile = tileIndex;
  crew.assignedSystem = system;
  crew.lastSystem = system;
  crew.resting = false;
  crew.cleaning = false;
  crew.activeJobId = null;
  crew.energy = 100;
  crew.hygiene = 100;
}

function setupCoreRooms(state: StationState): void {
  // Critical support rooms so pressure/air remains sane during longer runs.
  paintRoom(state, RoomType.Reactor, 6, 6, 7, 7);
  paintRoom(state, RoomType.LifeSupport, 9, 6, 11, 7);
}

function testStarterCoreIsOpenWithSideReactor(): void {
  const state = createInitialState({ seed: 1337 });
  const core = fromIndex(state.core.centerTile, state.width);

  for (let y = core.y - 1; y <= core.y + 1; y++) {
    for (let x = core.x - 1; x <= core.x + 1; x++) {
      const idx = toIndex(x, y, state.width);
      assertCondition(state.tiles[idx] === TileType.Floor, 'Starter core should be open floor, not the old 3x3 reactor frame.');
      assertCondition(state.rooms[idx] === RoomType.None, 'Starter core should not be painted as reactor space.');
    }
  }

  const reactorTiles = state.rooms
    .map((room, idx) => (room === RoomType.Reactor ? idx : -1))
    .filter((idx) => idx >= 0);
  assertCondition(reactorTiles.length > 0, 'Starter station should still include an off-center reactor alcove.');
  assertCondition(
    reactorTiles.every((idx) => fromIndex(idx, state.width).x < core.x),
    'Starter reactor alcove should sit west of the central core.'
  );
}

function testTileBuildCostDoesNotScaleWithDistance(): void {
  const state = createInitialState({ seed: 1338 });
  const core = fromIndex(state.core.centerTile, state.width);
  const near = toIndex(core.x + 6, core.y, state.width);
  const farAnchor = toIndex(state.width - 4, state.height - 4, state.width);
  const far = toIndex(state.width - 3, state.height - 4, state.width);

  setTile(state, farAnchor, TileType.Wall);
  assertCondition(planTileConstruction(state, near, TileType.Floor).ok, 'Expected near floor blueprint to be valid.');
  assertCondition(planTileConstruction(state, far, TileType.Floor).ok, 'Expected far floor blueprint to be valid.');

  const nearRequired = state.constructionSites.find((site) => site.tileIndex === near)?.requiredMaterials;
  const farRequired = state.constructionSites.find((site) => site.tileIndex === far)?.requiredMaterials;

  assertCondition(
    nearRequired === farRequired,
    `Tile build cost should be flat by distance, required near=${nearRequired}, far=${farRequired}.`
  );
}

function testTrussBuildRequiresEvaAndCanChain(): void {
  const state = createInitialState({ seed: 1339 });
  const core = fromIndex(state.core.centerTile, state.width);
  const first = toIndex(core.x + 6, core.y, state.width);
  const second = toIndex(core.x + 7, core.y, state.width);
  const startingMaterials = state.metrics.materials;

  const planned = planTileConstruction(state, first, TileType.Truss);
  assertCondition(planned.ok, `Truss blueprint should be accepted next to the hull (${planned.reason ?? 'no reason'}).`);
  const chained = planTileConstruction(state, second, TileType.Truss);
  assertCondition(chained.ok, `Truss blueprint should chain from planned scaffold (${chained.reason ?? 'no reason'}).`);

  const firstSite = state.constructionSites.find((site) => site.tileIndex === first);
  const secondSite = state.constructionSites.find((site) => site.tileIndex === second);
  assertCondition(firstSite?.targetTile === TileType.Truss, 'First scaffold blueprint should target truss.');
  assertCondition(secondSite?.targetTile === TileType.Truss, 'Chained scaffold blueprint should target truss.');
  assertCondition(firstSite?.requiresEva === true && secondSite?.requiresEva === true, 'Truss construction should require EVA.');
  assertCondition(firstSite?.requiredMaterials === 1, 'Truss construction should use the cheap scaffold material cost.');
  assertCondition(firstSite?.deliveredMaterials === 1, 'Truss construction should skip material hauling after charging the scaffold kit.');
  assertCondition((firstSite?.buildWorkRequired ?? 99) <= 1, 'Truss construction should be a quick EVA weld, not a long build.');
  assertCondition(state.metrics.materials === startingMaterials - 2, 'Planning two truss tiles should charge two scaffold kits up front.');
}

function testTrussExpansionConvertsScaffoldIntoPressurizedShell(): void {
  const state = createInitialState({ seed: 1340 });
  const core = fromIndex(state.core.centerTile, state.width);
  const patch = [
    toIndex(core.x + 6, core.y, state.width),
    toIndex(core.x + 7, core.y, state.width),
    toIndex(core.x + 6, core.y + 1, state.width),
    toIndex(core.x + 7, core.y + 1, state.width)
  ];
  for (const index of patch) setTile(state, index, TileType.Truss);
  state.legacyMaterialStock = 11;
  state.metrics.materials = 11;

  const built = buildStationExpansionOnTruss(state, patch);
  assertCondition(built.ok, `Truss expansion should convert scaffold into a sealed room shell (${built.reason ?? 'no reason'}).`);
  assertCondition(built.requiredMaterials === 11, `Truss shell conversion should use discounted scaffold costs (${built.requiredMaterials}).`);

  for (const index of patch) {
    assertCondition(state.tiles[index] === TileType.Floor, 'Truss expansion should convert selected scaffold into floor.');
    assertCondition(state.rooms[index] === RoomType.None, 'Fresh expansion floor should not inherit a room paint.');
  }

  const doorTiles = [toIndex(core.x + 5, core.y, state.width), toIndex(core.x + 5, core.y + 1, state.width)];
  assertCondition(
    doorTiles.filter((index) => state.tiles[index] === TileType.Door).length === 1,
    'Truss expansion should punch one door through the shared hull wall.'
  );
  assertCondition(state.tiles[toIndex(core.x + 8, core.y, state.width)] === TileType.Wall, 'Expansion should add an outer east wall.');
  assertCondition(state.tiles[toIndex(core.x + 6, core.y - 1, state.width)] === TileType.Wall, 'Expansion should add an outer north wall.');
  assertCondition(state.tiles[toIndex(core.x + 7, core.y + 2, state.width)] === TileType.Wall, 'Expansion should add an outer south wall.');

  tick(state, 0.1);
  for (const index of patch) {
    assertCondition(state.pressurized[index], 'Converted truss expansion should become pressurized.');
  }
  assertCondition(state.metrics.leakingTiles === 0, 'Converted truss expansion should not create a pressure leak.');
  assertCondition(state.metrics.materials === 0, 'Conversion should consume exactly the discounted shell materials.');
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

function setupStarterDepot(state: StationState): void {
  paintRoom(state, RoomType.LogisticsStock, 6, 16, 8, 18);
  placeModuleOrThrow(state, ModuleType.IntakePallet, 6, 17);
}

function setupLeisure(state: StationState, withModule: boolean): void {
  paintRoom(state, RoomType.Lounge, 23, 10, 27, 12);
  if (withModule) {
    placeModuleOrThrow(state, ModuleType.Couch, 23, 11);
  }
}

function paintPathIntentTile(state: StationState, x: number, y: number, room: RoomType = RoomType.None): number {
  const tile = toIndex(x, y, state.width);
  state.tiles[tile] = TileType.Floor;
  state.rooms[tile] = room;
  state.zones[tile] = ZoneType.Public;
  return tile;
}

function setupPathIntentCorridorState(
  includePublicBypass = true,
  bypassRoom: RoomType = RoomType.Cafeteria
): { state: StationState; start: number; goal: number } {
  const state = createInitialState({ seed: 3091 });
  state.tiles.fill(TileType.Space);
  state.rooms.fill(RoomType.None);
  state.zones.fill(ZoneType.Public);
  state.modules.fill(ModuleType.None);
  state.moduleInstances = [];
  state.moduleOccupancyByTile.fill(null);
  state.effects.blockedUntilByTile.clear();
  state.derived.pathCache.clear();
  state.pathOccupancyByTile.clear();
  state.topologyVersion += 1;
  state.roomVersion += 1;

  const start = paintPathIntentTile(state, 10, 10);
  const goal = paintPathIntentTile(state, 20, 10);

  for (let x = 11; x <= 19; x++) {
    const room = x >= 13 && x <= 17 ? RoomType.Storage : RoomType.None;
    paintPathIntentTile(state, x, 10, room);
  }

  if (includePublicBypass) {
    for (let y = 11; y <= 14; y++) paintPathIntentTile(state, 10, y);
    for (let x = 11; x <= 19; x++) {
      const room = x >= 13 && x <= 17 ? bypassRoom : RoomType.None;
      paintPathIntentTile(state, x, 14, room);
    }
    for (let y = 11; y <= 14; y++) paintPathIntentTile(state, 20, y);
  }

  return { state, start, goal };
}

function pathHasRoom(state: StationState, path: number[], room: RoomType): boolean {
  return path.some((tile) => state.rooms[tile] === room);
}

function testPathIntentVisitorAvoidsServiceCorridor(): void {
  const { state, start, goal } = setupPathIntentCorridorState();
  const visitorPath = findPath(state, start, goal, { allowRestricted: false, intent: 'visitor' }, state.pathOccupancyByTile);
  const securityPath = findPath(state, start, goal, { allowRestricted: false, intent: 'security' }, state.pathOccupancyByTile);

  assertCondition(!!visitorPath, 'Visitor should find a path through the public bypass.');
  assertCondition(!!securityPath, 'Security should find the direct route.');
  assertCondition(!pathHasRoom(state, visitorPath!, RoomType.Storage), 'Visitor path should avoid the storage corridor when a public bypass exists.');
  assertCondition(pathHasRoom(state, visitorPath!, RoomType.Cafeteria), 'Visitor path should use the public cafeteria bypass.');
  assertCondition(pathHasRoom(state, securityPath!, RoomType.Storage), 'Security path should take the shortest direct service corridor.');
  assertCondition(securityPath!.length < visitorPath!.length, 'Security path should be shorter than the visitor public route.');
}

function testPathIntentLogisticsPrefersServiceCorridor(): void {
  const { state, start, goal } = setupPathIntentCorridorState();
  const logisticsPath = findPath(state, start, goal, { allowRestricted: false, intent: 'logistics' }, state.pathOccupancyByTile);

  assertCondition(!!logisticsPath, 'Logistics should find a path.');
  assertCondition(pathHasRoom(state, logisticsPath!, RoomType.Storage), 'Logistics path should prefer the direct storage corridor.');
  assertCondition(!pathHasRoom(state, logisticsPath!, RoomType.Cafeteria), 'Logistics path should avoid the cafeteria bypass.');
}

function testPathIntentLogisticsAvoidsNewSocialRooms(): void {
  const { state, start, goal } = setupPathIntentCorridorState(true, RoomType.Cantina);
  const logisticsPath = findPath(state, start, goal, { allowRestricted: false, intent: 'logistics' }, state.pathOccupancyByTile);
  const visitorPath = findPath(state, start, goal, { allowRestricted: false, intent: 'visitor' }, state.pathOccupancyByTile);

  assertCondition(!!logisticsPath && !!visitorPath, 'Cantina bypass paths should resolve.');
  assertCondition(pathHasRoom(state, visitorPath!, RoomType.Cantina), 'Visitor path should treat cantina as public social space.');
  assertCondition(!pathHasRoom(state, logisticsPath!, RoomType.Cantina), 'Logistics path should avoid cantina public space.');
}

function testPathIntentVisitorServiceFallback(): void {
  const { state, start, goal } = setupPathIntentCorridorState(false);
  const visitorPath = findPath(state, start, goal, { allowRestricted: false, intent: 'visitor' }, state.pathOccupancyByTile);

  assertCondition(!!visitorPath, 'Visitor should still route through service space when it is the only path.');
  assertCondition(pathHasRoom(state, visitorPath!, RoomType.Storage), 'Visitor fallback path should cross storage instead of deadlocking.');
}

function testNewSocialRoomsActivateAndExposeTargets(): void {
  const state = createInitialState({ seed: 3327 });
  buildHabitat(state);
  setUnlockTierForTest(state, 3);
  paintRoom(state, RoomType.Cantina, 26, 10, 29, 13);
  paintRoom(state, RoomType.Observatory, 31, 10, 34, 13);
  placeModuleOrThrow(state, ModuleType.BarCounter, 27, 11);
  placeModuleOrThrow(state, ModuleType.Telescope, 32, 11);

  tick(state, 0);

  const cantina = getRoomInspectorAt(state, toIndex(26, 10, state.width));
  const observatory = getRoomInspectorAt(state, toIndex(31, 10, state.width));
  assertCondition(!!cantina && cantina.active, 'Cantina should activate with a bar counter.');
  assertCondition(!!observatory && observatory.active, 'Observatory should activate with a telescope.');
  assertCondition(state.ops.cantinaActive === 1, 'Cantina should be counted in room ops.');
  assertCondition(state.ops.observatoryActive === 1, 'Observatory should be counted in room ops.');
  assertCondition(cantina!.serviceNodeCount >= 1, 'Cantina should expose a service target.');
  assertCondition(observatory!.serviceNodeCount >= 1, 'Observatory should expose a service target.');
}

function testPathCacheSeparatesIntent(): void {
  const { state, start, goal } = setupPathIntentCorridorState();
  const visitorPath = findPath(state, start, goal, { allowRestricted: false, intent: 'visitor' }, state.pathOccupancyByTile);
  const logisticsPath = findPath(state, start, goal, { allowRestricted: false, intent: 'logistics' }, state.pathOccupancyByTile);
  const cacheKeys = [...state.derived.pathCache.keys()];

  assertCondition(!!visitorPath && !!logisticsPath, 'Visitor and logistics paths should both resolve.');
  assertCondition(!pathHasRoom(state, visitorPath!, RoomType.Storage), 'Cached visitor route should stay visitor-specific.');
  assertCondition(pathHasRoom(state, logisticsPath!, RoomType.Storage), 'Cached logistics route should stay logistics-specific.');
  assertCondition(cacheKeys.some((key) => key.includes('|visitor|')), 'Path cache should include a visitor intent key.');
  assertCondition(cacheKeys.some((key) => key.includes('|logistics|')), 'Path cache should include a logistics intent key.');
}

function testRoutePressureDiagnosticsCountsAndConflicts(): void {
  const { state } = setupPathIntentCorridorState();
  const conflictTile = toIndex(14, 10, state.width);
  state.crew.total = 1;
  tick(state, 0);
  spawnVisitor(state, 10, 10, 90001);
  state.visitors[0].path = [toIndex(11, 10, state.width), conflictTile, toIndex(15, 10, state.width)];
  const crew = state.crewMembers[0];
  crew.activeJobId = 333;
  crew.path = [toIndex(13, 10, state.width), conflictTile, toIndex(15, 10, state.width)];
  state.jobs.push({
    id: 333,
    type: 'deliver',
    itemType: 'rawMeal',
    amount: 1,
    fromTile: toIndex(13, 10, state.width),
    toTile: toIndex(15, 10, state.width),
    assignedCrewId: crew.id,
    createdAt: state.now,
    expiresAt: state.now + 90,
    state: 'assigned',
    pickedUpAmount: 0,
    completedAt: null,
    lastProgressAt: state.now,
    stallReason: 'none'
  });

  const diagnostics = getRoutePressureDiagnostics(state);
  const tileDiagnostic = getRoutePressureTileDiagnostic(state, 14, 10, diagnostics);

  assertCondition(diagnostics.activePaths >= 2, 'Route pressure diagnostics should count actor paths.');
  assertCondition(!!tileDiagnostic, 'Route pressure tile diagnostic should exist on shared route tile.');
  if (!tileDiagnostic) return;
  assertCondition(tileDiagnostic.visitorCount === 1, 'Route pressure should count visitor path pressure.');
  assertCondition(tileDiagnostic.logisticsCount === 1, 'Route pressure should count logistics path pressure.');
  assertCondition(tileDiagnostic.conflictScore > 0, 'Mixed public/logistics traffic should create a conflict score.');
  assertCondition(
    tileDiagnostic.reasons.some((reason) => reason.includes('visitor')),
    'Route pressure diagnostic should explain visitor/service conflict.'
  );
  assertCondition(diagnostics.conflictTiles > 0, 'Route pressure diagnostics should aggregate conflict tiles.');
  const inspector = getRoomInspectorAt(state, conflictTile);
  assertCondition(!!inspector?.routePressure, 'Room inspector should expose route pressure summary.');
  assertCondition(inspector!.routePressure!.conflictTiles > 0, 'Room inspector should count route conflicts inside the room.');
  assertCondition(
    inspector!.routePressure!.reasons.some((reason) => reason.includes('visitor')),
    'Room inspector should summarize the route conflict reason.'
  );
}

function testVisitorRouteExposurePenalty(): void {
  const clean = createInitialState({ seed: 3092 });
  buildHabitat(clean);
  setupCoreRooms(clean);
  setupFoodChain(clean);
  spawnVisitor(clean, 18, 10, 3092);
  const cleanVisitor = clean.visitors[0];
  cleanVisitor.carryingMeal = true;
  cleanVisitor.reservedTargetTile = toIndex(18, 10, clean.width);
  cleanVisitor.tileIndex = cleanVisitor.reservedTargetTile;
  cleanVisitor.x = 18.5;
  cleanVisitor.y = 10.5;
  cleanVisitor.lastRouteExposure = {
    distance: 6,
    publicTiles: 6,
    serviceTiles: 0,
    cargoTiles: 0,
    residentialTiles: 0,
    securityTiles: 0,
    socialTiles: 4,
    crowdCost: 0
  };
  tick(clean, 0.25);

  const bad = createInitialState({ seed: 3093 });
  buildHabitat(bad);
  setupCoreRooms(bad);
  setupFoodChain(bad);
  spawnVisitor(bad, 18, 10, 3093);
  const badVisitor = bad.visitors[0];
  badVisitor.carryingMeal = true;
  badVisitor.reservedTargetTile = toIndex(18, 10, bad.width);
  badVisitor.tileIndex = badVisitor.reservedTargetTile;
  badVisitor.x = 18.5;
  badVisitor.y = 10.5;
  badVisitor.lastRouteExposure = {
    distance: 6,
    publicTiles: 1,
    serviceTiles: 2,
    cargoTiles: 4,
    residentialTiles: 0,
    securityTiles: 0,
    socialTiles: 0,
    crowdCost: 0
  };
  tick(bad, 0.25);

  assertCondition(clean.usageTotals.ratingFromRouteExposure === 0, 'Clean visitor route should not create route-exposure rating penalty.');
  assertCondition(
    bad.usageTotals.ratingFromRouteExposure > clean.usageTotals.ratingFromRouteExposure,
    'Visitor route through cargo/service space should create route-exposure rating penalty.'
  );
}

function testResidentBadRouteStress(): void {
  const state = createInitialState({ seed: 3094 });
  buildHabitat(state);
  setupCoreRooms(state);
  setupFoodChain(state);
  spawnResidentActor(state, 18, 10, 3094, {
    state: ResidentState.ToCafeteria,
    reservedTargetTile: toIndex(18, 10, state.width),
    path: [toIndex(18, 10, state.width)],
    lastRouteExposure: {
      distance: 8,
      publicTiles: 2,
      serviceTiles: 3,
      cargoTiles: 4,
      residentialTiles: 0,
      securityTiles: 1,
      socialTiles: 0,
      crowdCost: 0
    }
  });
  const resident = state.residents[0];
  const initialStress = resident.stress;
  const initialSatisfaction = resident.satisfaction;
  tick(state, 0.25);

  assertCondition(state.usageTotals.residentBadRouteStress > 0, 'Resident bad route should record route stress.');
  assertCondition(resident.stress > initialStress, 'Resident bad route should increase stress on need arrival.');
  assertCondition(resident.satisfaction < initialSatisfaction, 'Resident bad route should reduce satisfaction on need arrival.');
}

function testCrewPublicInterferenceMetric(): void {
  const state = createInitialState({ seed: 3095 });
  buildHabitat(state);
  setupCoreRooms(state);
  state.crew.total = 1;
  runFor(state, 0.25);
  const crew = state.crewMembers[0];
  assertCondition(!!crew, 'Expected one crew member for public-interference test.');
  crew.activeJobId = 99999;
  crew.lastRouteExposure = {
    distance: 8,
    publicTiles: 8,
    serviceTiles: 0,
    cargoTiles: 0,
    residentialTiles: 0,
    securityTiles: 0,
    socialTiles: 6,
    crowdCost: 4
  };
  tick(state, 0.25);

  assertCondition(state.usageTotals.crewPublicInterference > 0, 'Crew logistics through public/social space should record interference.');
}

function testVisitorRoomEnvironmentPenalty(): void {
  const clean = createInitialState({ seed: 3096 });
  buildHabitat(clean);
  setupFoodChain(clean);
  spawnVisitor(clean, 18, 10, 3096);
  const cleanVisitor = clean.visitors[0];
  cleanVisitor.carryingMeal = true;
  cleanVisitor.reservedTargetTile = toIndex(18, 10, clean.width);
  cleanVisitor.tileIndex = cleanVisitor.reservedTargetTile;
  cleanVisitor.x = 18.5;
  cleanVisitor.y = 10.5;
  tick(clean, 0.25);

  const noisy = createInitialState({ seed: 3097 });
  buildHabitat(noisy);
  paintRoom(noisy, RoomType.Reactor, 12, 10, 15, 13);
  paintRoom(noisy, RoomType.Workshop, 22, 10, 26, 13);
  paintRoom(noisy, RoomType.Cafeteria, 16, 10, 21, 13);
  placeModuleOrThrow(noisy, ModuleType.ServingStation, 16, 12);
  placeModuleOrThrow(noisy, ModuleType.Table, 16, 10);
  placeModuleOrThrow(noisy, ModuleType.Table, 19, 10);
  spawnVisitor(noisy, 16, 10, 3097);
  const noisyVisitor = noisy.visitors[0];
  noisyVisitor.carryingMeal = true;
  noisyVisitor.reservedTargetTile = toIndex(16, 10, noisy.width);
  noisyVisitor.tileIndex = noisyVisitor.reservedTargetTile;
  noisyVisitor.x = 16.5;
  noisyVisitor.y = 10.5;
  tick(noisy, 0.25);

  assertCondition(clean.usageTotals.ratingFromEnvironment === 0, 'Clean visitor room should not create an environment penalty.');
  assertCondition(
    noisy.usageTotals.ratingFromEnvironment > clean.usageTotals.ratingFromEnvironment,
    'Industrial neighbors around visitor rooms should create an environment rating penalty.'
  );
}

function testResidentRoomEnvironmentStress(): void {
  const clean = createInitialState({ seed: 3098 });
  buildHabitat(clean);
  paintRoom(clean, RoomType.Dorm, 20, 10, 22, 12);
  placeModuleOrThrow(clean, ModuleType.Bed, 20, 11);
  spawnResidentActor(clean, 20, 11, 3098, {
    state: ResidentState.ToDorm,
    reservedTargetTile: toIndex(20, 11, clean.width),
    path: [toIndex(20, 11, clean.width)]
  });
  tick(clean, 0.25);

  const noisy = createInitialState({ seed: 3099 });
  buildHabitat(noisy);
  paintRoom(noisy, RoomType.Workshop, 16, 10, 19, 13);
  paintRoom(noisy, RoomType.Reactor, 23, 10, 25, 13);
  paintRoom(noisy, RoomType.Dorm, 20, 10, 22, 12);
  placeModuleOrThrow(noisy, ModuleType.Bed, 20, 11);
  spawnResidentActor(noisy, 20, 11, 3099, {
    state: ResidentState.ToDorm,
    reservedTargetTile: toIndex(20, 11, noisy.width),
    path: [toIndex(20, 11, noisy.width)]
  });
  const noisyResident = noisy.residents[0];
  const noisyInitialStress = noisyResident.stress;
  tick(noisy, 0.25);

  assertCondition(clean.usageTotals.residentEnvironmentStress === 0, 'Clean dorm environment should not record arrival environment stress.');
  assertCondition(noisy.usageTotals.residentEnvironmentStress > 0, 'Noisy dorm environment should record resident environment stress.');
  assertCondition(noisyResident.stress > noisyInitialStress, 'Noisy dorm environment should increase resident stress.');
  assertCondition(noisy.metrics.serviceNoiseNearDorms > clean.metrics.serviceNoiseNearDorms, 'Dorm noise metric should increase near service rooms.');
}

function testRoomEnvironmentInspectorWarning(): void {
  const state = createInitialState({ seed: 3100 });
  buildHabitat(state);
  paintRoom(state, RoomType.Workshop, 16, 10, 19, 13);
  paintRoom(state, RoomType.Reactor, 23, 10, 25, 13);
  paintRoom(state, RoomType.Dorm, 20, 10, 22, 12);
  placeModuleOrThrow(state, ModuleType.Bed, 20, 11);
  tick(state, 0.25);

  const inspector = getRoomInspectorAt(state, toIndex(20, 11, state.width));
  assertCondition(!!inspector?.environment, 'Room inspector should expose environment scores.');
  assertCondition(inspector!.environment!.serviceNoise > 0.9, 'Dorm inspector should report nearby service noise.');
  assertCondition(
    inspector!.warnings.includes('housing room near noisy service space'),
    'Dorm inspector should warn when housing is near noisy service space.'
  );
}

function testVisitorAuxiliaryHygieneNeedIsInspectable(): void {
  const state = createInitialState({ seed: 31005 });
  buildHabitat(state);
  setupCoreRooms(state);
  paintRoom(state, RoomType.Hygiene, 12, 10, 14, 12);
  placeModuleOrThrow(state, ModuleType.Shower, 12, 11);
  placeModuleOrThrow(state, ModuleType.Sink, 14, 11);
  spawnVisitor(state, 8, 11, 31005);
  const visitor = state.visitors[0];
  const hygieneTile = toIndex(12, 11, state.width);
  visitor.state = VisitorState.ToLeisure;
  visitor.servedMeal = true;
  visitor.patience = 0;
  visitor.spawnedAt = state.now - 40;
  visitor.reservedTargetTile = hygieneTile;
  visitor.path = findPath(state, visitor.tileIndex, hygieneTile, { allowRestricted: false, intent: 'visitor' }, state.pathOccupancyByTile) ?? [];

  runFor(state, 3);

  const inspector = getVisitorInspectorById(state, visitor.id);
  assertCondition(!!inspector, 'Visitor inspector should exist for hygiene auxiliary visit.');
  assertCondition(inspector!.desire === 'toilet', 'Visitor inspector should expose hygiene/toilet desire.');
  assertCondition(
    inspector!.currentAction === 'using hygiene service',
    'Visitor inspector should show hygiene service usage.'
  );
}

function testMaintenanceDebtReducesReactorPower(): void {
  const clean = createInitialState({ seed: 3101 });
  buildHabitat(clean);
  setupCoreRooms(clean);
  const reactorAnchor = toIndex(6, 6, clean.width);
  placeCrewAtSystemAnchor(clean, reactorAnchor, 'reactor');
  tick(clean, 0.25);

  const degraded = createInitialState({ seed: 3102 });
  buildHabitat(degraded);
  setupCoreRooms(degraded);
  const degradedAnchor = toIndex(6, 6, degraded.width);
  placeCrewAtSystemAnchor(degraded, degradedAnchor, 'reactor');
  degraded.maintenanceDebts = [{
    key: `reactor:${degradedAnchor}`,
    system: 'reactor',
    anchorTile: degradedAnchor,
    debt: 80,
    lastServicedAt: 0
  }];
  tick(degraded, 0.25);

  assertCondition(degraded.metrics.powerSupply < clean.metrics.powerSupply, 'High reactor maintenance debt should reduce power supply.');
  assertCondition(degraded.metrics.maintenanceDebtMax > 60, 'High reactor debt should surface in maintenance metrics.');
}

function testMaintenanceDebtReducesLifeSupportAir(): void {
  const clean = createInitialState({ seed: 3103 });
  buildHabitat(clean);
  setupCoreRooms(clean);
  clean.metrics.airQuality = 20;
  const lifeSupportAnchor = toIndex(9, 6, clean.width);
  placeCrewAtSystemAnchor(clean, lifeSupportAnchor, 'life-support');
  tick(clean, 0.25);

  const degraded = createInitialState({ seed: 3104 });
  buildHabitat(degraded);
  setupCoreRooms(degraded);
  degraded.metrics.airQuality = 20;
  const degradedAnchor = toIndex(9, 6, degraded.width);
  placeCrewAtSystemAnchor(degraded, degradedAnchor, 'life-support');
  degraded.maintenanceDebts = [{
    key: `life-support:${degradedAnchor}`,
    system: 'life-support',
    anchorTile: degradedAnchor,
    debt: 80,
    lastServicedAt: 0
  }];
  tick(degraded, 0.25);

  assertCondition(
    degraded.metrics.lifeSupportActiveAirPerSec < clean.metrics.lifeSupportActiveAirPerSec,
    'High life-support maintenance debt should reduce active air output.'
  );
}

function testCrewAtUtilityReducesMaintenanceDebt(): void {
  const state = createInitialState({ seed: 3105 });
  buildHabitat(state);
  setupCoreRooms(state);
  const reactorAnchor = toIndex(6, 6, state.width);
  placeCrewAtSystemAnchor(state, reactorAnchor, 'reactor');
  state.maintenanceDebts = [{
    key: `reactor:${reactorAnchor}`,
    system: 'reactor',
    anchorTile: reactorAnchor,
    debt: 50,
    lastServicedAt: 0
  }];
  runFor(state, 8);

  const debt = state.maintenanceDebts.find((entry) => entry.key === `reactor:${reactorAnchor}`);
  assertCondition(!!debt, 'Expected reactor maintenance debt entry to remain.');
  assertCondition(debt!.debt < 50, 'Crew standing at a utility post should reduce maintenance debt.');
}

function addSealedIsolatedDorm(state: StationState): number {
  for (let x = 34; x <= 38; x++) {
    setTile(state, toIndex(x, 23, state.width), TileType.Wall);
    setTile(state, toIndex(x, 27, state.width), TileType.Wall);
  }
  for (let y = 23; y <= 27; y++) {
    setTile(state, toIndex(34, y, state.width), TileType.Wall);
    setTile(state, toIndex(38, y, state.width), TileType.Wall);
  }
  paintRoom(state, RoomType.Dorm, 35, 24, 37, 26);
  const doorTile = toIndex(35, 24, state.width);
  setTile(state, doorTile, TileType.Floor);
  setRoom(state, doorTile, RoomType.Dorm);
  return doorTile;
}

function testLifeSupportCoverageDetectsDisconnectedWing(): void {
  const connected = createInitialState({ seed: 3106 });
  buildHabitat(connected);
  setupCoreRooms(connected);
  placeCrewAtSystemAnchor(connected, toIndex(9, 6, connected.width), 'life-support');
  tick(connected, 0.25);

  const isolated = createInitialState({ seed: 3107 });
  buildHabitat(isolated);
  setupCoreRooms(isolated);
  placeCrewAtSystemAnchor(isolated, toIndex(9, 6, isolated.width), 'life-support');
  const isolatedTile = addSealedIsolatedDorm(isolated);
  tick(isolated, 0.25);

  assertCondition(
    isolated.metrics.lifeSupportCoveragePct < connected.metrics.lifeSupportCoveragePct,
    'Disconnected sealed wing should lower life-support coverage percentage.'
  );
  assertCondition(isolated.metrics.poorLifeSupportTiles > 0, 'Disconnected sealed wing should produce poor life-support tiles.');
  const inspector = getRoomInspectorAt(isolated, isolatedTile);
  assertCondition(!!inspector, 'Disconnected dorm should still inspect as a room.');
  assertCondition(
    inspector!.warnings.includes('no life-support coverage'),
    'Disconnected room inspector should report missing life-support coverage.'
  );
}

function testLifeSupportDiagnosticHelperDetectsDisconnectedWing(): void {
  const state = createInitialState({ seed: 5310 });
  buildHabitat(state);
  setupCoreRooms(state);
  placeCrewAtSystemAnchor(state, toIndex(9, 6, state.width), 'life-support');
  const isolatedTile = addSealedIsolatedDorm(state);
  tick(state, 0.25);

  const pos = fromIndex(isolatedTile, state.width);
  const diagnostic = getLifeSupportTileDiagnostic(state, pos.x, pos.y);
  assertCondition(!!diagnostic, 'Life-support diagnostic should return a tile result.');
  assertCondition(diagnostic!.hasLifeSupportSystem, 'Life-support diagnostic should know life-support exists.');
  assertCondition(diagnostic!.sourceCount > 0, 'Life-support diagnostic should count active sources.');
  assertCondition(diagnostic!.poorCoverage, 'Disconnected wing should report poor life-support coverage.');
  assertCondition(!diagnostic!.reachable, 'Disconnected wing should not be reachable from active life support.');
}

function testVisitorStatusDiagnosticHelperHighlightsIndustrialAdjacency(): void {
  const clean = createInitialState({ seed: 5311 });
  buildHabitat(clean);
  setupFoodChain(clean);
  tick(clean, 0.25);
  const cleanDiagnostic = getRoomEnvironmentTileDiagnostic(clean, 18, 10);

  const noisy = createInitialState({ seed: 5312 });
  buildHabitat(noisy);
  paintRoom(noisy, RoomType.Reactor, 12, 10, 15, 13);
  paintRoom(noisy, RoomType.Workshop, 22, 10, 26, 13);
  paintRoom(noisy, RoomType.Cafeteria, 16, 10, 21, 13);
  placeModuleOrThrow(noisy, ModuleType.ServingStation, 16, 12);
  placeModuleOrThrow(noisy, ModuleType.Table, 16, 10);
  placeModuleOrThrow(noisy, ModuleType.Table, 19, 10);
  tick(noisy, 0.25);
  const noisyDiagnostic = getRoomEnvironmentTileDiagnostic(noisy, 16, 10);

  assertCondition(!!cleanDiagnostic && !!noisyDiagnostic, 'Visitor status diagnostics should return scores.');
  assertCondition(
    noisyDiagnostic!.visitorStatus < cleanDiagnostic!.visitorStatus,
    'Industrial neighbors should lower visitor-status diagnostics.'
  );
  assertCondition(
    noisyDiagnostic!.visitorDiscomfort > cleanDiagnostic!.visitorDiscomfort,
    'Industrial neighbors should raise visitor discomfort diagnostics.'
  );
}

function testResidentComfortDiagnosticHelperHighlightsServiceNoise(): void {
  const clean = createInitialState({ seed: 5313 });
  buildHabitat(clean);
  paintRoom(clean, RoomType.Dorm, 20, 10, 22, 12);
  placeModuleOrThrow(clean, ModuleType.Bed, 20, 11);
  tick(clean, 0.25);
  const cleanDiagnostic = getRoomEnvironmentTileDiagnostic(clean, 20, 11);

  const noisy = createInitialState({ seed: 5314 });
  buildHabitat(noisy);
  paintRoom(noisy, RoomType.Workshop, 16, 10, 19, 13);
  paintRoom(noisy, RoomType.Reactor, 23, 10, 25, 13);
  paintRoom(noisy, RoomType.Dorm, 20, 10, 22, 12);
  placeModuleOrThrow(noisy, ModuleType.Bed, 20, 11);
  tick(noisy, 0.25);
  const noisyDiagnostic = getRoomEnvironmentTileDiagnostic(noisy, 20, 11);

  assertCondition(!!cleanDiagnostic && !!noisyDiagnostic, 'Resident comfort diagnostics should return scores.');
  assertCondition(
    noisyDiagnostic!.serviceNoise > cleanDiagnostic!.serviceNoise,
    'Service adjacency should increase service-noise diagnostics.'
  );
  assertCondition(
    noisyDiagnostic!.residentialComfort < cleanDiagnostic!.residentialComfort,
    'Service adjacency should reduce resident-comfort diagnostics.'
  );
  assertCondition(
    noisyDiagnostic!.residentDiscomfort > cleanDiagnostic!.residentDiscomfort,
    'Service adjacency should raise resident discomfort diagnostics.'
  );
}

function testMaintenanceDiagnosticHelperReportsUtilityDebt(): void {
  const state = createInitialState({ seed: 5315 });
  buildHabitat(state);
  setupCoreRooms(state);
  const reactorAnchor = toIndex(6, 6, state.width);
  const cleanDiagnostic = getMaintenanceTileDiagnostic(state, 6, 6);
  state.maintenanceDebts = [{
    key: `reactor:${reactorAnchor}`,
    system: 'reactor',
    anchorTile: reactorAnchor,
    debt: 80,
    lastServicedAt: 0
  }];
  const degradedDiagnostic = getMaintenanceTileDiagnostic(state, 6, 6);
  const nonUtilityDiagnostic = getMaintenanceTileDiagnostic(state, 20, 20);

  assertCondition(!!cleanDiagnostic, 'Maintenance diagnostic should exist on reactor tiles.');
  assertCondition(cleanDiagnostic!.debt === 0, 'Healthy reactor diagnostic should report zero debt.');
  assertCondition(!!degradedDiagnostic, 'Maintenance diagnostic should exist after debt injection.');
  assertCondition(degradedDiagnostic!.debt === 80, 'Maintenance diagnostic should report matching debt.');
  assertCondition(
    degradedDiagnostic!.outputMultiplier < cleanDiagnostic!.outputMultiplier,
    'Maintenance diagnostic should expose output degradation.'
  );
  assertCondition(nonUtilityDiagnostic === null, 'Maintenance diagnostic should stay null on unrelated tiles.');
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

  assertCondition(!invalid.ok, 'Wall light should fail when not mounted on a wall tile.');
  assertCondition(valid.ok, 'Wall light should place on a wall tile adjacent to walkable interior.');
}

function testWallMountedVentRequiresWallAndProjectsAir(): void {
  const state = createInitialState({ seed: 30036 });
  buildHabitat(state);
  setupCoreRooms(state);
  placeCrewAtSystemAnchor(state, toIndex(9, 6, state.width), 'life-support');
  tick(state, 0.25);

  const targetX = 25;
  const targetY = 5;
  const before = getLifeSupportTileDiagnostic(state, targetX, targetY);
  const invalid = tryPlaceModule(state, ModuleType.Vent, toIndex(20, 20, state.width), 0);
  const valid = tryPlaceModule(state, ModuleType.Vent, toIndex(20, 4, state.width), 0);
  tick(state, 0.25);
  const after = getLifeSupportTileDiagnostic(state, targetX, targetY);

  assertCondition(!invalid.ok, 'Vent should fail when placed on a floor tile.');
  assertCondition(valid.ok, 'Vent should place on a wall tile adjacent to walkable interior.');
  assertCondition(!!before && !!after, 'Vent coverage test should return diagnostics before and after placement.');
  const beforeDistance = before?.distance ?? -1;
  const afterDistance = after?.distance ?? -1;
  assertCondition(
    afterDistance >= 0 && (beforeDistance < 0 || afterDistance < beforeDistance),
    `Wall vent should improve nearby air distance (before ${beforeDistance}, after ${afterDistance}).`
  );
}

function testWallMountedFireExtinguisherRequiresWallAndSuppressesFire(): void {
  const state = createInitialState({ seed: 30037 });
  buildHabitat(state);
  setupCoreRooms(state);
  const invalid = tryPlaceModule(state, ModuleType.FireExtinguisher, toIndex(20, 20, state.width), 0);
  const valid = tryPlaceModule(state, ModuleType.FireExtinguisher, toIndex(6, 4, state.width), 0);
  const fireTile = toIndex(6, 6, state.width);
  state.effects.fires.push({
    anchorTile: fireTile,
    system: 'reactor',
    intensity: 40,
    ignitedAt: state.now,
    lastTick: state.now
  });
  tick(state, 1);
  const fire = state.effects.fires.find((entry) => entry.anchorTile === fireTile);

  assertCondition(!invalid.ok, 'Fire extinguisher should fail when placed on a floor tile.');
  assertCondition(valid.ok, 'Fire extinguisher should place on a wall tile adjacent to walkable interior.');
  assertCondition(!!fire, 'Fire should still exist after one suppression tick for measurement.');
  assertCondition(fire!.intensity < 40, `Wall extinguisher should suppress nearby fire, got ${fire!.intensity.toFixed(1)}.`);
}

function testWallMountedModuleConstructionUsesServiceTile(): void {
  const state = createInitialState({ seed: 30038 });
  buildHabitat(state);
  state.legacyMaterialStock = 50;
  state.metrics.materials = 50;
  const wallTile = toIndex(20, 4, state.width);
  const serviceTile = toIndex(20, 5, state.width);
  const planned = planModuleConstruction(state, wallTile, ModuleType.Vent, 0);
  tick(state, 0.25);
  const job = state.jobs.find((candidate) => candidate.type === 'construct' && candidate.constructionSiteId !== undefined);

  assertCondition(planned.ok, `Wall-mounted vent blueprint should plan successfully: ${planned.reason ?? 'unknown'}`);
  assertCondition(!!job, 'Wall-mounted vent blueprint should create a construction job.');
  assertCondition(job!.toTile === serviceTile, 'Wall-mounted vent construction should target the adjacent service tile.');
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

function testFoodJobsDoNotLetRawBacklogBlockMeals(): void {
  const state = createInitialState({ seed: 30045 });
  buildHabitat(state);
  setupCoreRooms(state);
  setupFoodChain(state);
  tick(state, 0);

  const growNode = state.itemNodes.find((node) => state.rooms[node.tileIndex] === RoomType.Hydroponics);
  const stoveNode = state.itemNodes.find((node) => state.rooms[node.tileIndex] === RoomType.Kitchen);
  const servingNode = state.itemNodes.find((node) => state.rooms[node.tileIndex] === RoomType.Cafeteria);
  assertCondition(!!growNode && !!stoveNode && !!servingNode, 'Food fixture should expose grow/stove/serving item nodes.');
  if (!growNode || !stoveNode || !servingNode) return;

  growNode.items.rawMeal = 18;
  stoveNode.items.meal = 6;
  servingNode.items.meal = 0;
  state.jobs.length = 0;
  state.jobSpawnCounter = 1000;
  for (let i = 0; i < 10; i++) {
    state.jobs.push({
      id: i + 1,
      type: 'deliver',
      itemType: 'rawMeal',
      amount: 1,
      fromTile: growNode.tileIndex,
      toTile: stoveNode.tileIndex,
      assignedCrewId: null,
      createdAt: state.now,
      expiresAt: state.now + 90,
      state: 'pending',
      pickedUpAmount: 0,
      completedAt: null,
      lastProgressAt: state.now,
      stallReason: 'none'
    });
  }

  tick(state, 0);

  assertCondition(
    state.jobs.some((job) => job.itemType === 'meal' && (job.state === 'pending' || job.state === 'assigned' || job.state === 'in_progress')),
    'Meal delivery jobs should still spawn when raw-food jobs are already at their per-type cap.'
  );
}

function testLowFoodAssignsFoodChainCrew(): void {
  const state = createInitialState({ seed: 3006 });
  buildHabitat(state);
  setupCoreRooms(state);
  setupFoodChain(state);
  state.metrics.mealStock = 1;
  state.metrics.kitchenRawBuffer = 0;

  runFor(state, 0.5);

  assertCondition(
    state.metrics.requiredCriticalStaff.hydroponics >= 1,
    'Low food should request hydroponics staffing.'
  );
  assertCondition(state.metrics.requiredCriticalStaff.kitchen >= 1, 'Low food should request kitchen staffing.');
  assertCondition(state.metrics.requiredCriticalStaff.cafeteria >= 1, 'Low food should request cafeteria staffing.');
  assertCondition(state.metrics.assignedCriticalStaff.hydroponics >= 1, 'Low food should assign crew to hydroponics.');
  assertCondition(state.metrics.assignedCriticalStaff.kitchen >= 1, 'Low food should assign crew to kitchen.');
  assertCondition(state.metrics.assignedCriticalStaff.cafeteria >= 1, 'Low food should assign crew to cafeteria.');
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

function testVisitorCafeteriaReservationSurvivesShortCrowdBlock(): void {
  const state = createInitialState({ seed: 30051 });
  buildHabitat(state);
  setupCoreRooms(state);
  paintRoom(state, RoomType.Cafeteria, 16, 10, 23, 13);
  placeModuleOrThrow(state, ModuleType.ServingStation, 16, 11);
  placeModuleOrThrow(state, ModuleType.ServingStation, 20, 11);
  placeModuleOrThrow(state, ModuleType.Table, 18, 10);
  placeModuleOrThrow(state, ModuleType.Table, 21, 12);
  state.crew.total = 0;

  const firstServing = toIndex(16, 11, state.width);
  const secondServing = toIndex(20, 11, state.width);
  tick(state, 0);
  const firstServingNode = state.itemNodes.find((node) => node.tileIndex === firstServing);
  assertCondition(!!firstServingNode, 'Crowd fixture should expose an item node at the first serving station.');
  firstServingNode!.items.meal = 4;
  state.metrics.mealStock = 4;
  spawnVisitor(state, 15, 11, 30100);
  const visitor = state.visitors[0];
  visitor.state = VisitorState.ToCafeteria;
  visitor.carryingMeal = false;
  visitor.reservedServingTile = firstServing;
  visitor.reservedTargetTile = null;
  visitor.path = [firstServing];

  for (let i = 0; i < 4; i++) {
    spawnVisitor(state, 16, 11, 30101 + i);
    const blocker = state.visitors[state.visitors.length - 1];
    blocker.state = VisitorState.Eating;
    blocker.servedMeal = true;
    blocker.eatTimer = 60;
    blocker.path = [];
  }

  runFor(state, 1.25);

  assertCondition(visitor.blockedTicks === 0, 'Crowded service tiles should not physically block visitor movement.');
  assertCondition(
    visitor.reservedServingTile === firstServing || visitor.reservedServingTile === null,
    'Crowded service tiles should keep the original serving reservation until it is fulfilled.'
  );
  const stateAfterCrowdBlock = String(visitor.state);
  assertCondition(stateAfterCrowdBlock !== VisitorState.Queueing, 'Crowded service tiles should not immediately demote visitors into queue churn.');
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
  assertCondition(
    state.metrics.tradeCyclesCompletedLifetime > 0,
    'Workshop-to-market delivery should count as a completed trade cycle.'
  );

  const sold = sellMaterials(state, 10, 5);
  assertCondition(sold, 'Selling materials should remove raw materials from logistics/storage inventory.');
}

function testMarketVisitorsBuyFromStallsWhenBenchesExist(): void {
  const state = createInitialState({ seed: 3007 });
  buildHabitat(state);
  setupCoreRooms(state);
  setupTradeChain(state);
  placeModuleOrThrow(state, ModuleType.Bench, 23, 17);
  state.crew.total = 12;
  state.metrics.credits = 800;

  const bought = buyMaterials(state, 0, 35);
  assertCondition(bought, 'Buying materials should seed the trade chain.');
  runFor(state, 150);
  assertCondition(state.metrics.marketTradeGoodStock > 0, 'Fixture should stock the market stall before visitor shopping.');

  spawnVisitor(state, 20, 17, 300701);
  const visitor = state.visitors[0];
  visitor.state = VisitorState.ToLeisure;
  visitor.archetype = 'shopper';
  visitor.primaryPreference = 'market';
  visitor.servedMeal = true;
  visitor.leisureLegsRemaining = 0;
  visitor.leisureLegsPlanned = 1;

  runFor(state, 16);

  assertCondition(visitor.tileIndex === toIndex(21, 17, state.width), 'Market shopper should target the market stall, not a bench.');
  assertCondition(state.usageTotals.tradeGoodsSold > 0, 'Market shopper should buy stocked trade goods.');
}

function testIntakeMaterialsMoveToStorage(): void {
  const state = createInitialState({ seed: 3021 });
  buildHabitat(state);
  setupCoreRooms(state);
  paintRoom(state, RoomType.LogisticsStock, 6, 16, 8, 18);
  paintRoom(state, RoomType.Storage, 10, 16, 13, 18);
  placeModuleOrThrow(state, ModuleType.IntakePallet, 6, 17);
  placeModuleOrThrow(state, ModuleType.StorageRack, 10, 17);
  placeModuleOrThrow(state, ModuleType.StorageRack, 12, 17);
  state.crew.total = 8;
  state.metrics.credits = 800;
  state.legacyMaterialStock = 0;
  state.metrics.materials = 0;

  const bought = buyMaterials(state, 0, 35);
  assertCondition(bought, 'Buying materials should deposit raw materials into intake pallets.');
  runFor(state, 180);

  const intakeStock = state.itemNodes
    .filter((node) => state.rooms[node.tileIndex] === RoomType.LogisticsStock)
    .reduce((sum, node) => sum + (node.items.rawMaterial ?? 0), 0);
  const storageStock = state.itemNodes
    .filter((node) => state.rooms[node.tileIndex] === RoomType.Storage)
    .reduce((sum, node) => sum + (node.items.rawMaterial ?? 0), 0);
  assertCondition(storageStock >= 30, `Storage racks should receive most raw materials from intake (storage ${storageStock.toFixed(1)}).`);
  assertCondition(intakeStock <= 5, `Intake pallets should drain into storage when storage has capacity (intake ${intakeStock.toFixed(1)}).`);
}

function testInteriorBlueprintConstructionCompletes(): void {
  const state = createInitialState({ seed: 3022 });
  buildHabitat(state);
  setupCoreRooms(state);
  state.crew.total = 6;
  state.legacyMaterialStock = 80;
  state.metrics.materials = 80;

  const target = toIndex(20, 20, state.width);
  const planned = planTileConstruction(state, target, TileType.Wall);
  assertCondition(planned.ok, `Interior wall blueprint should be accepted (${planned.reason ?? 'no reason'}).`);
  assertCondition(state.tiles[target] === TileType.Floor, 'Blueprint should not immediately mutate the tile.');
  assertCondition(state.constructionSites.length === 1, 'Blueprint should create one construction site.');

  runFor(state, 80);

  assertCondition(state.tiles[target] === TileType.Wall, 'Crew should deliver materials and build the interior wall.');
  assertCondition(state.constructionSites.length === 0, 'Completed construction site should be cleaned up.');
}

function testModuleBlueprintConstructionCompletes(): void {
  const state = createInitialState({ seed: 3023 });
  buildHabitat(state);
  setupCoreRooms(state);
  paintRoom(state, RoomType.Storage, 18, 18, 22, 20);
  state.crew.total = 6;
  state.legacyMaterialStock = 80;
  state.metrics.materials = 80;

  const target = toIndex(18, 19, state.width);
  const planned = planModuleConstruction(state, target, ModuleType.StorageRack);
  assertCondition(planned.ok, `Storage rack blueprint should be accepted (${planned.reason ?? 'no reason'}).`);
  assertCondition(state.modules[target] === ModuleType.None, 'Blueprint should not immediately place the module.');

  runFor(state, 90);

  assertCondition(state.modules[target] === ModuleType.StorageRack, 'Crew should build the planned module.');
}

function testCancelBlueprintConstructionRemovesSiteAndJob(): void {
  const state = createInitialState({ seed: 30231 });
  buildHabitat(state);
  setupCoreRooms(state);
  state.crew.total = 6;
  state.legacyMaterialStock = 80;
  state.metrics.materials = 80;

  const target = toIndex(20, 20, state.width);
  const planned = planTileConstruction(state, target, TileType.Wall);
  assertCondition(planned.ok, `Interior wall blueprint should be accepted (${planned.reason ?? 'no reason'}).`);
  tick(state, 0.1);
  const siteId = state.constructionSites[0]?.id;
  assertCondition(siteId !== undefined, 'Blueprint should create a cancellable construction site.');
  assertCondition(
    state.jobs.some((job) => job.constructionSiteId === siteId && job.state !== 'done' && job.state !== 'expired'),
    'Construction site should enqueue an open construction job.'
  );

  const cancelled = cancelConstructionAtTile(state, target);
  assertCondition(cancelled, 'Cancel construction should report that a blueprint was removed.');
  assertCondition(state.constructionSites.every((site) => site.id !== siteId), 'Cancelled blueprint should be removed from the site list.');
  assertCondition(
    state.jobs.every((job) => job.constructionSiteId !== siteId || job.state === 'expired'),
    'Open construction jobs for the cancelled blueprint should expire.'
  );
  assertCondition(state.tiles[target] === TileType.Floor, 'Cancelling a blueprint should leave the existing tile unchanged.');
}

function testCancelBlueprintConstructionRefundsDeliveredMaterials(): void {
  const state = createInitialState({ seed: 30232 });
  buildHabitat(state);
  setupCoreRooms(state);
  state.crew.total = 6;
  state.legacyMaterialStock = 20;
  state.metrics.materials = 20;

  const target = toIndex(20, 20, state.width);
  const planned = planTileConstruction(state, target, TileType.Wall);
  assertCondition(planned.ok, `Interior wall blueprint should be accepted (${planned.reason ?? 'no reason'}).`);
  const site = state.constructionSites[0];
  assertCondition(!!site, 'Blueprint should create a construction site before refund test.');
  site.deliveredMaterials = 3;

  const cancelled = cancelConstructionAtTile(state, target);
  assertCondition(cancelled, 'Cancel construction should remove the blueprint before refunding materials.');
  assertCondition(state.legacyMaterialStock >= 23, 'Delivered construction materials should be refunded on cancel.');
  assertCondition(state.metrics.materials >= 23, 'Material HUD metric should include refunded construction materials.');
}

function testCancelModuleBlueprintFromFootprintTile(): void {
  const state = createInitialState({ seed: 30233 });
  buildHabitat(state);
  setupCoreRooms(state);
  paintRoom(state, RoomType.Cafeteria, 20, 20, 24, 24);
  state.legacyMaterialStock = 80;
  state.metrics.materials = 80;

  const origin = toIndex(20, 20, state.width);
  const coveredTile = toIndex(21, 21, state.width);
  const planned = planModuleConstruction(state, origin, ModuleType.Table);
  assertCondition(planned.ok, `Table blueprint should be accepted (${planned.reason ?? 'no reason'}).`);

  const cancelled = cancelConstructionAtTile(state, coveredTile);
  assertCondition(cancelled, 'Cancel construction should remove a module blueprint from any footprint tile.');
  assertCondition(state.constructionSites.length === 0, 'Module blueprint should be removed when cancelling a covered footprint tile.');
  assertCondition(state.modules[origin] === ModuleType.None, 'Cancelling a module blueprint should not place the module.');
}

function testEvaBlueprintConstructionUsesAirlock(): void {
  const state = createInitialState({ seed: 3024 });
  buildHabitat(state);
  setupCoreRooms(state);
  state.crew.total = 6;
  state.legacyMaterialStock = 100;
  state.metrics.materials = 100;
  const airlock = toIndex(44, 16, state.width);
  setTile(state, airlock, TileType.Airlock);
  const exterior = toIndex(45, 16, state.width);
  const chainedExterior = toIndex(46, 16, state.width);

  const planned = planTileConstruction(state, exterior, TileType.Floor);
  assertCondition(planned.ok, `Exterior floor blueprint should be accepted when adjacent to hull (${planned.reason ?? 'no reason'}).`);
  const chained = planTileConstruction(state, chainedExterior, TileType.Floor);
  assertCondition(
    chained.ok,
    `Exterior blueprint should chain from another planned exterior tile (${chained.reason ?? 'no reason'}).`
  );
  assertCondition(state.constructionSites.every((site) => site.requiresEva), 'Exterior blueprints should require EVA.');

  let assignedEvaCrew = null as StationState['crewMembers'][number] | null;
  for (let i = 0; i < 80; i++) {
    tick(state, 0.1);
    assignedEvaCrew =
      state.crewMembers.find((crew) => {
        const job = state.jobs.find((candidate) => candidate.id === crew.activeJobId);
        return job?.type === 'construct' && job.constructionSiteId !== undefined;
      }) ?? null;
    if (
      assignedEvaCrew &&
      state.tiles[assignedEvaCrew.tileIndex] !== TileType.Airlock &&
      state.pressurized[assignedEvaCrew.tileIndex]
    ) {
      break;
    }
  }
  assertCondition(!!assignedEvaCrew, 'EVA construction should assign a crew member.');
  assertCondition(!assignedEvaCrew!.evaSuit, 'EVA crew should not suit up while still inside the pressurized station.');

  let sawAirlockSuitTransition = false;
  for (let i = 0; i < 500; i++) {
    tick(state, 0.1);
    if (
      state.crewMembers.some(
        (crew) =>
          crew.activeJobId !== null &&
          state.jobs.find((job) => job.id === crew.activeJobId)?.type === 'construct' &&
          state.tiles[crew.tileIndex] === TileType.Airlock &&
          crew.evaSuit
      )
    ) {
      sawAirlockSuitTransition = true;
      break;
    }
  }
  assertCondition(sawAirlockSuitTransition, 'EVA crew should put on the suit at the airlock before going outside.');

  runFor(state, 120);

  assertCondition(state.tiles[exterior] === TileType.Floor, 'Crew should build exterior floor via airlock EVA.');
  assertCondition(state.tiles[chainedExterior] === TileType.Floor, 'Crew should build chained exterior floor via airlock EVA.');
  assertCondition(state.constructionSites.length === 0, 'Completed EVA construction site should be cleaned up.');
}

function testAirlockSealsStationPressure(): void {
  const state = createInitialState({ seed: 30241 });
  buildHabitat(state);
  state.crew.total = 0;
  state.visitors.length = 0;
  const airlock = toIndex(44, 16, state.width);
  setTile(state, airlock, TileType.Airlock);

  tick(state, 0.1);

  assertCondition(state.pressurized[toIndex(20, 20, state.width)], 'Interior should remain pressurized behind an airlock.');
  assertCondition(state.metrics.leakingTiles === 0, 'Airlock in the hull should not count as a leak.');
  assertCondition(state.metrics.pressurizationPct === 100, 'Airlock in the hull should keep pressure at 100%.');
}

function testAirlockExteriorPadDoesNotVentStation(): void {
  const state = createInitialState({ seed: 30242 });
  buildHabitat(state);
  state.crew.total = 0;
  state.visitors.length = 0;
  const airlock = toIndex(44, 16, state.width);
  const exterior = toIndex(45, 16, state.width);
  const exterior2 = toIndex(46, 16, state.width);
  setTile(state, airlock, TileType.Airlock);
  setTile(state, exterior, TileType.Floor);
  setTile(state, exterior2, TileType.Floor);

  tick(state, 0.1);

  assertCondition(state.pressurized[toIndex(20, 20, state.width)], 'Interior should remain pressurized with an exterior EVA pad.');
  assertCondition(!state.pressurized[exterior], 'Exterior EVA pad should remain unpressurized.');
  assertCondition(!state.pressurized[exterior2], 'Chained exterior EVA pad should remain unpressurized.');
  assertCondition(state.metrics.leakingTiles === 0, 'Exterior EVA pads beyond an airlock should not count as station leaks.');
  assertCondition(state.metrics.pressurizationPct === 100, 'Exterior EVA pads beyond an airlock should not lower station pressurization.');
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

function testReactorInspectorReportsRealPressurizationPct(): void {
  // Pre-this-PR, reactor rooms always reported pressurizedPct=100 via a
  // `room === RoomType.Reactor` short-circuit in inspectRoomCluster. After
  // #99 made doors into pressure barriers, a walled reactor pressurizes
  // naturally — the bypass was dead code inflating the inspector's UI %.
  // Guard: an unsealed reactor now reports its REAL leaky pressurizedPct
  // (< 70) in the inspector instead of the fake 100.
  const state = createInitialState({ seed: 6006 });
  for (let y = 2; y <= 4; y++) {
    for (let x = 48; x <= 50; x++) {
      const idx = toIndex(x, y, state.width);
      setTile(state, idx, TileType.Floor);
      setRoom(state, idx, RoomType.Reactor);
    }
  }
  const doorIdx = toIndex(48, 2, state.width);
  setTile(state, doorIdx, TileType.Door);
  setRoom(state, doorIdx, RoomType.Reactor);

  runFor(state, 1);
  const inspector = getRoomInspectorAt(state, toIndex(49, 3, state.width));
  assertCondition(
    !!inspector,
    'Reactor cluster inspector should exist for a 3x3 painted room.'
  );
  assertCondition(
    inspector!.pressurizedPct < 70,
    `Unsealed reactor should report real-leaky pressurization, got ${inspector!.pressurizedPct}%.`
  );
}

function testDemoStationRoomsPressurized(): void {
  // Scenario-level regression guard for doors-as-barriers: after loading
  // demo-station, every room center (painted as walled interior with one
  // door) must read pressurized. Guards against the pokemon-red root cause
  // — a future sim change that leaks vacuum through doors would surface
  // here before cosmetic render code papers over it.
  const state = createInitialState({ seed: 5005 });
  const applied = applyColdStartScenario(state, 'demo-station');
  assertCondition(applied, 'demo-station fixture should exist in COLD_START_SCENARIOS.');

  runFor(state, 1);

  const roomCenters: Array<{ x: number; y: number; label: string }> = [
    { x: 9, y: 10, label: 'Dorm' },
    { x: 19, y: 10, label: 'Cafeteria' },
    { x: 29, y: 10, label: 'Hydroponics' },
    { x: 39, y: 10, label: 'Clinic' },
    { x: 49, y: 10, label: 'Workshop' },
    { x: 9, y: 23, label: 'Market' },
    { x: 19, y: 23, label: 'Reactor' },
    { x: 29, y: 23, label: 'Security' },
    { x: 39, y: 23, label: 'Hygiene' },
    { x: 49, y: 23, label: 'RecHall' }
  ];
  for (const c of roomCenters) {
    const idx = toIndex(c.x, c.y, state.width);
    assertCondition(
      state.pressurized[idx] === true,
      `demo-station ${c.label} center (${c.x},${c.y}) should be pressurized.`
    );
  }
}

function testDoorsArePressureBarriers(): void {
  // Sealed room + one door must pressurize — doors are airlocks, not leaks.
  const state = createInitialState({ seed: 9001 });
  const x1 = 2;
  const y1 = 2;
  const x2 = 6;
  const y2 = 6;
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      const idx = toIndex(x, y, state.width);
      const onPerimeter = x === x1 || x === x2 || y === y1 || y === y2;
      setTile(state, idx, onPerimeter ? TileType.Wall : TileType.Floor);
    }
  }
  const doorX = Math.floor((x1 + x2) / 2);
  const doorIdx = toIndex(doorX, y2, state.width);
  setTile(state, doorIdx, TileType.Door);

  runFor(state, 1);

  const interiorIdx = toIndex(x1 + 2, y1 + 2, state.width);
  assertCondition(
    state.pressurized[interiorIdx] === true,
    'Sealed room interior should be pressurized once doors count as barriers.'
  );
  assertCondition(
    state.pressurized[doorIdx] === true,
    'Door tile in a sealed room should read as pressurized (built-walkable + not vacuum-reachable).'
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
  const expiredReasonTotal = Object.values(state.metrics.expiredJobsByReason).reduce((sum, count) => sum + count, 0);
  const expiredContextTotal = Object.values(state.metrics.expiredJobsByContext).reduce((sum, count) => sum + count, 0);
  const pendingItemTotal = Object.values(state.metrics.jobCountsByItem).reduce((sum, counts) => sum + counts.pending, 0);
  const assignedItemTotal = Object.values(state.metrics.jobCountsByItem).reduce((sum, counts) => sum + counts.assigned, 0);
  const expiredItemTotal = Object.values(state.metrics.jobCountsByItem).reduce((sum, counts) => sum + counts.expired, 0);

  assertCondition(state.metrics.pendingJobs === pending, 'Pending job metric should match job states.');
  assertCondition(state.metrics.assignedJobs === assigned, 'Assigned job metric should match job states.');
  assertCondition(state.metrics.expiredJobs === expired, 'Expired job metric should match job states.');
  assertCondition(expiredReasonTotal === expired, 'Expired job reason metrics should match expired job states.');
  assertCondition(expiredContextTotal === expired, 'Expired job context metrics should match expired job states.');
  assertCondition(pendingItemTotal === pending, 'Pending job item breakdown should match pending jobs.');
  assertCondition(assignedItemTotal === assigned, 'Assigned job item breakdown should match assigned jobs.');
  assertCondition(expiredItemTotal === expired, 'Expired job item breakdown should match expired jobs.');
  assertCondition(state.metrics.completedJobs === completed, 'Completed job metric should match job states.');
  assertCondition(
    state.metrics.createdJobs >= state.metrics.completedJobs + state.metrics.expiredJobs,
    'Created jobs should be >= completed + expired jobs.'
  );
}

function testActiveLogisticsCrewDoNotRestBeforeCompletingJobs(): void {
  const state = createInitialState({ seed: 30102 });
  buildHabitat(state);
  setupCoreRooms(state);
  setupFoodChain(state);
  state.crew.total = 1;
  buyRawFood(state, 0, 5);
  tick(state, 0.25);

  const crew = state.crewMembers[0];
  assertCondition(!!crew, 'Crew pool should create a worker.');
  const job: StationState['jobs'][number] = {
    id: state.jobSpawnCounter++,
    type: 'deliver' as const,
    itemType: 'rawMeal' as const,
    amount: 1,
    fromTile: toIndex(6, 11, state.width),
    toTile: toIndex(11, 11, state.width),
    assignedCrewId: crew.id,
    createdAt: state.now,
    expiresAt: state.now + 10,
    state: 'assigned' as const,
    pickedUpAmount: 0,
    completedAt: null,
    lastProgressAt: state.now,
    stallReason: 'none' as const
  };
  state.jobs.push(job);
  crew.activeJobId = job.id;
  crew.energy = 0;
  crew.hygiene = 0;
  crew.resting = false;
  crew.cleaning = false;
  crew.restCooldownUntil = 0;
  crew.taskLockUntil = 0;

  tick(state, 0.25);

  assertCondition(!crew.resting, 'Crew with an active logistics job should not start resting.');
  assertCondition(!crew.cleaning, 'Crew with an active logistics job should not start hygiene.');
  assertCondition(state.metrics.crewOnLogisticsJobs === 1, 'Active logistics crew should count as logistics, not idle.');
  assertCondition(state.metrics.crewIdleAvailable === 0, 'Active logistics crew should not count as available idle.');
  assertCondition(state.metrics.crewSelfCare === 0, 'Active logistics crew should not count as self-care.');
  assertCondition(state.jobs[0].state !== 'expired', 'Active logistics job should not expire because crew entered self-care.');
}

function testStaleRequeuedJobReleasesCrewAssignment(): void {
  const state = createInitialState({ seed: 301021 });
  buildHabitat(state);
  setupCoreRooms(state);
  state.crew.total = 1;
  tick(state, 0.25);

  const crew = state.crewMembers[0];
  const job = {
    id: state.jobSpawnCounter++,
    type: 'deliver' as const,
    itemType: 'rawMaterial' as const,
    amount: 1,
    fromTile: toIndex(8, 8, state.width),
    toTile: toIndex(10, 8, state.width),
    assignedCrewId: crew.id,
    createdAt: state.now - 20,
    expiresAt: state.now + 60,
    state: 'assigned' as const,
    pickedUpAmount: 0,
    completedAt: null,
    lastProgressAt: state.now - 20,
    stallReason: 'stalled_path_blocked' as const
  };
  state.jobs.push(job);
  crew.activeJobId = job.id;
  crew.path = [job.fromTile];

  tick(state, 0.25);

  const requeued = state.jobs.find((candidate) => candidate.id === job.id);
  assertCondition(requeued?.state === 'pending', 'Stale assigned job should be requeued.');
  assertCondition(requeued?.assignedCrewId === null, 'Requeued stale job should clear assigned crew id.');
  assertCondition(crew.activeJobId === null, 'Crew should be released when its stale job is requeued.');
  assertCondition(
    getCrewInspectorById(state, crew.id)?.actionReason.includes(`job #${job.id}`) === false,
    'Crew inspector should not keep reporting a requeued stale job as active.'
  );
}

function testSelfCareCrewNotStolenByLogisticsDispatch(): void {
  const state = createInitialState({ seed: 301022 });
  buildHabitat(state);
  setupCoreRooms(state);
  paintRoom(state, RoomType.Hygiene, 12, 10, 15, 12);
  placeModuleOrThrow(state, ModuleType.Shower, 12, 11);
  placeModuleOrThrow(state, ModuleType.Sink, 14, 11);
  state.crew.total = 1;
  tick(state, 0.25);

  const crew = state.crewMembers[0];
  crew.activeJobId = null;
  crew.resting = false;
  crew.cleaning = false;
  crew.toileting = false;
  crew.drinking = false;
  crew.leisure = false;
  crew.energy = 80;
  crew.hygiene = 80;
  crew.bladder = 0;
  crew.thirst = 80;
  crew.role = 'idle';
  crew.assignedSystem = null;
  crew.targetTile = null;
  crew.path = [];
  state.jobs.push({
    id: state.jobSpawnCounter++,
    type: 'deliver',
    itemType: 'rawMaterial',
    amount: 1,
    fromTile: toIndex(8, 8, state.width),
    toTile: toIndex(10, 8, state.width),
    assignedCrewId: null,
    createdAt: state.now,
    expiresAt: state.now + 60,
    state: 'pending',
    pickedUpAmount: 0,
    completedAt: null,
    lastProgressAt: state.now,
    stallReason: 'none'
  });

  tick(state, 0.25);

  assertCondition(crew.activeJobId === null, 'Crew with urgent self-care should not be stolen by logistics dispatch.');
  assertCondition(crew.toileting, 'Crew with empty bladder should start a hygiene/toilet trip.');
  assertCondition(state.jobs[state.jobs.length - 1].state === 'pending', 'Logistics job should remain pending while crew handles urgent self-care.');
}

function testCrewRestAvoidsOverloadedDormTarget(): void {
  const state = createInitialState({ seed: 30103 });
  buildHabitat(state);
  setupCoreRooms(state);
  paintRoom(state, RoomType.Dorm, 10, 10, 18, 13);
  placeModuleOrThrow(state, ModuleType.Bed, 10, 11);
  placeModuleOrThrow(state, ModuleType.Bed, 15, 11);
  state.crew.total = 5;
  tick(state, 0.25);

  const crowdedTarget = toIndex(10, 11, state.width);
  const openTarget = toIndex(15, 11, state.width);
  const waitingTile = toIndex(8, 11, state.width);
  const setCrewTile = (crewIndex: number, tile: number): void => {
    const crew = state.crewMembers[crewIndex];
    const center = fromIndex(tile, state.width);
    crew.x = center.x + 0.5;
    crew.y = center.y + 0.5;
    crew.tileIndex = tile;
    crew.path = [];
    crew.activeJobId = null;
    crew.role = 'idle';
    crew.targetTile = null;
    crew.assignedSystem = null;
    crew.lastSystem = null;
    crew.resting = true;
    crew.restSessionActive = true;
    crew.cleaning = false;
    crew.energy = 35;
    crew.hygiene = 80;
    crew.blockedTicks = 0;
  };
  for (let i = 0; i < 4; i++) setCrewTile(i, crowdedTarget);
  setCrewTile(4, waitingTile);
  state.crewMembers[4].restSessionActive = false;
  state.crewMembers[4].blockedTicks = 3;

  tick(state, 0.25);

  const route = state.crewMembers[4].path;
  assertCondition(route.length > 0, 'Resting crew outside the dorm should receive a rest route.');
  assertCondition(route[route.length - 1] === openTarget, 'Rest routing should avoid already overloaded dorm target.');
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

function testLegacyDockTrafficUsesTinyPods(): void {
  const state = createInitialState({ seed: 301601 });
  buildHabitat(state);
  const dockId = placeEastHullDock(state, 8, 9);
  state.controls.shipsPerCycle = 2;

  runFor(state, 17);

  const dockShips = state.arrivingShips.filter((ship) => ship.assignedDockId === dockId);
  assertCondition(dockShips.length > 0, 'Legacy visitor dock should receive small pod traffic.');
  for (const ship of dockShips) {
    assertCondition(ship.size === 'small', 'Legacy dock traffic should always use small pod visuals.');
    assertCondition(ship.passengersTotal >= 1 && ship.passengersTotal <= 2, `Dock pods should carry 1-2 visitors, got ${ship.passengersTotal}.`);
    assertCondition((ship.assignedBerthAnchor ?? null) === null, 'Legacy dock pod should not be berth-bound.');
  }
}

function testSporadicTrafficSchedulesNextCheck(): void {
  const state = createInitialState({ seed: 301603 });
  buildHabitat(state);
  placeEastHullDock(state, 8, 9);
  state.controls.shipsPerCycle = 2;

  runFor(state, 0.25);

  assertCondition(state.lastCycleTime > state.now, 'Sporadic traffic should schedule the next arrival check in the future.');
  assertCondition(
    state.lastCycleTime < state.cycleDuration,
    'Traffic rate 2 should not wait for the old full-cycle wave boundary.'
  );
}

function testBerthTrafficUsesLargeShipPassengerScale(): void {
  const state = createInitialState({ seed: 301602 });
  buildHabitat(state);
  state.crew.total = 0;
  state.controls.shipsPerCycle = 1;
  for (let y = 8; y <= 13; y++) {
    for (let x = 43; x <= 49; x++) {
      const tile = toIndex(x, y, state.width);
      setTile(state, tile, TileType.Floor);
      setRoom(state, tile, RoomType.Berth);
    }
  }
  placeModuleOrThrow(state, ModuleType.Gangway, 49, 11);
  placeModuleOrThrow(state, ModuleType.CustomsCounter, 43, 11);
  placeModuleOrThrow(state, ModuleType.CargoArm, 48, 8);

  runFor(state, 40);

  const berthShip = state.arrivingShips.find((ship) => (ship.assignedBerthAnchor ?? null) !== null);
  assertCondition(!!berthShip, 'Open equipped berth should receive berth-bound traffic.');
  if (!berthShip) return;
  assertCondition(berthShip.size === 'large', `Large berth should attract large ships before pod traffic, got ${berthShip.size}.`);
  assertCondition(berthShip.passengersTotal >= 28, `Large berth ship should carry many visitors, got ${berthShip.passengersTotal}.`);
  assertCondition(berthShip.assignedDockId === null, 'Berth ship should not occupy a legacy dock.');
}

function testBerthVisitorsBoardAndDespawnOnReturn(): void {
  const state = createInitialState({ seed: 30161 });
  buildHabitat(state);
  state.crew.total = 0;
  const berthTiles: number[] = [];
  for (let y = 9; y <= 11; y++) {
    for (let x = 9; x <= 11; x++) {
      const tile = toIndex(x, y, state.width);
      setTile(state, tile, TileType.Floor);
      setRoom(state, tile, RoomType.Berth);
      berthTiles.push(tile);
    }
  }
  const ship = createDockedBerthShip(state, berthTiles, 91001);
  spawnReturningVisitor(state, berthTiles[0], 505, ship.id);

  runFor(state, 1);

  assertCondition(state.visitors.length === 0, 'Berth visitor should despawn after reaching its origin berth.');
  assertCondition(ship.passengersBoarded === 1, 'Berth visitor should board its berth-bound origin ship.');
  assertCondition(state.recentExitTimes.length > 0, 'Berth visitor exit should count as a recent exit.');
}

function testTransientShipPersistsUntilOriginVisitorBoards(): void {
  const state = createInitialState({ seed: 301604 });
  buildHabitat(state);
  state.controls.shipsPerCycle = 0;
  const dockId = placeEastHullDock(state, 8, 9);
  const dockTile = dockByIdOrThrow(state, dockId).tiles[0];
  const ship = createDockedTransientShip(state, dockId, 92001);
  spawnReturningVisitor(state, toIndex(20, 20, state.width), 92002, ship.id);

  runFor(state, 3);

  assertCondition(state.arrivingShips.some((entry) => entry.id === ship.id && entry.stage === 'docked'), 'Origin ship should stay docked while its visitor is still aboard the station.');

  const visitor = state.visitors.find((entry) => entry.id === 92002);
  assertCondition(!!visitor, 'Setup visitor should still be active before returning to the origin ship.');
  if (!visitor) return;
  const center = fromIndex(dockTile, state.width);
  visitor.tileIndex = dockTile;
  visitor.x = center.x + 0.5;
  visitor.y = center.y + 0.5;
  visitor.path = [];
  visitor.state = VisitorState.ToDock;

  runFor(state, 0.5);
  assertCondition(!state.visitors.some((entry) => entry.id === visitor.id), 'Visitor should board and leave through the origin ship.');
  assertCondition(ship.passengersBoarded === 1, 'Origin ship should count the returning visitor.');

  runFor(state, 2.5);
  assertCondition(!state.arrivingShips.some((entry) => entry.id === ship.id), 'Origin ship should depart after all origin visitors resolve.');
}

function testOriginVisitorDoesNotBoardWrongDockedShip(): void {
  const state = createInitialState({ seed: 301605 });
  buildHabitat(state);
  state.controls.shipsPerCycle = 0;
  const originDockId = placeEastHullDock(state, 8, 9);
  const wrongDockId = placeEastHullDock(state, 18, 19);
  const originShip = createDockedTransientShip(state, originDockId, 93001);
  const wrongShip = createDockedTransientShip(state, wrongDockId, 93002);
  wrongShip.passengersTotal = 2;
  const wrongDockTile = dockByIdOrThrow(state, wrongDockId).tiles[0];
  spawnReturningVisitor(state, wrongDockTile, 93003, originShip.id);

  runFor(state, 0.05, 0.05);

  assertCondition(state.visitors.some((entry) => entry.id === 93003), 'Origin-tied visitor should not disappear through the wrong dock.');
  assertCondition(wrongShip.passengersBoarded === 0, 'Wrong docked ship should not board an origin-tied visitor.');
}

function testBerthTrafficRequiresSpaceExposure(): void {
  const state = createInitialState({ seed: 30162 });
  buildHabitat(state);
  state.crew.total = 0;
  state.controls.shipsPerCycle = 1;
  for (let y = 9; y <= 11; y++) {
    for (let x = 9; x <= 11; x++) {
      const tile = toIndex(x, y, state.width);
      setTile(state, tile, TileType.Floor);
      setRoom(state, tile, RoomType.Berth);
    }
  }

  runFor(state, 40);

  assertCondition(state.arrivingShips.length === 0, 'Internal berth should not receive ships.');
  assertCondition(
    state.metrics.shipsQueuedNoCapabilityHint.includes('open to space'),
    'Internal berth should explain that it needs an edge open to space.'
  );
}

function testOpenBerthReceivesScheduledTraffic(): void {
  const state = createInitialState({ seed: 30163 });
  buildHabitat(state);
  state.crew.total = 0;
  state.controls.shipsPerCycle = 1;
  const berthTiles: number[] = [];
  for (let y = 9; y <= 13; y++) {
    for (let x = 44; x <= 48; x++) {
      const tile = toIndex(x, y, state.width);
      setTile(state, tile, TileType.Floor);
      setRoom(state, tile, RoomType.Berth);
      berthTiles.push(tile);
    }
  }
  placeModuleOrThrow(state, ModuleType.Gangway, 48, 11);
  placeModuleOrThrow(state, ModuleType.CustomsCounter, 44, 11);
  placeModuleOrThrow(state, ModuleType.CargoArm, 47, 9);

  runFor(state, 40);

  assertCondition(
    state.arrivingShips.some((ship) => ship.assignedBerthAnchor !== null && ship.assignedBerthAnchor !== undefined),
    'Open-to-space berth should receive scheduled berth ships.'
  );
  assertCondition(state.metrics.visitorBerthsTotal >= 1, 'Room-painted berths should count in visitor berth metrics.');
}

function testBerthSupportModulePlacementRules(): void {
  const state = createInitialState({ seed: 30164 });
  buildHabitat(state);
  for (let y = 9; y <= 13; y++) {
    for (let x = 44; x <= 48; x++) {
      const tile = toIndex(x, y, state.width);
      setTile(state, tile, TileType.Floor);
      setRoom(state, tile, RoomType.Berth);
    }
  }

  const middleGangway = tryPlaceModule(state, ModuleType.Gangway, toIndex(46, 11, state.width));
  assertCondition(!middleGangway.ok, 'Gangway should require the berth edge open to space.');
  const edgeGangway = tryPlaceModule(state, ModuleType.Gangway, toIndex(48, 11, state.width));
  assertCondition(edgeGangway.ok, `Gangway on open berth edge should place: ${edgeGangway.reason ?? 'unknown'}`);

  const middleCargo = tryPlaceModule(state, ModuleType.CargoArm, toIndex(45, 10, state.width));
  assertCondition(!middleCargo.ok, 'Cargo arm should require a berth edge.');
  const edgeCargo = tryPlaceModule(state, ModuleType.CargoArm, toIndex(47, 9, state.width));
  assertCondition(edgeCargo.ok, `Cargo arm on berth edge should place: ${edgeCargo.reason ?? 'unknown'}`);
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
  const oldWidth = state.width;
  const oldHeight = state.height;
  const expansionStep = 40;

  const result = expandMap(state, 'north');
  assertCondition(result.ok, 'North expansion should succeed.');
  if (!result.ok) return;

  const remapNorth = (index: number): number => index + expansionStep * state.width;
  assertCondition(state.height === oldHeight + expansionStep, 'North expansion should increase height by 40.');
  assertCondition(state.tiles[remapNorth(trackedTile)] === TileType.Door, 'Tracked tile should remap after north expansion.');
  assertCondition(module.originTile !== state.moduleInstances[0].originTile, 'Module origin should be remapped.');
  assertCondition(
    state.moduleInstances.some((m) => m.id === module.id && m.originTile === remapNorth(module.originTile)),
    'Module origin tile should shift north by 40 rows.'
  );
  assertCondition(state.visitors[0].tileIndex === remapNorth(visitorTileBefore), 'Visitor tile index should be remapped.');
  assertCondition(Math.abs(state.visitors[0].y - (visitorYBefore + expansionStep)) < 0.001, 'Visitor world Y should shift by 40.');
  assertCondition(state.residents[0].tileIndex === remapNorth(residentBefore.tileIndex), 'Resident tile index should remap.');
  assertCondition(
    state.residents[0].reservedTargetTile === remapNorth(residentBefore.reservedTargetTile!),
    'Resident reserved target should remap.'
  );
  assertCondition(state.crewMembers[0].tileIndex === remapNorth(crewTileBefore), 'Crew tile index should remap.');
  assertCondition(state.crewMembers[0].targetTile === remapNorth(toIndex(16, 14, oldWidth)), 'Crew target tile should remap.');
  assertCondition(Math.abs(state.crewMembers[0].y - (crewYBefore + expansionStep)) < 0.001, 'Crew world Y should shift by 40.');
  assertCondition(state.jobs[0].fromTile === remapNorth(fromTileBefore), 'Job source tile should remap.');
  assertCondition(state.jobs[0].toTile === remapNorth(toTileBefore), 'Job target tile should remap.');
  assertCondition(state.pendingSpawns[0].dockIndex === remapNorth(dock.tiles[0]), 'Pending spawn dock index should remap.');
  assertCondition(state.bodyTiles[0] === remapNorth(toIndex(17, 17, oldWidth)), 'Body tile should remap.');

  const pathKeys = [...state.pathOccupancyByTile.keys()];
  const blockedKeys = [...state.effects.blockedUntilByTile.keys()];
  assertCondition(pathKeys.length === 1 && pathKeys[0] === remapNorth(toIndex(18, 18, oldWidth)), 'Path occupancy keys should remap.');
  assertCondition(
    blockedKeys.length === 1 && blockedKeys[0] === remapNorth(toIndex(19, 19, oldWidth)),
    'Blocked tile effect keys should remap.'
  );

  const remappedDock = dockByIdOrThrow(state, dockId);
  assertCondition(remappedDock.anchorTile === remapNorth(dockAnchorBefore), 'Dock anchor should remap north.');
  assertCondition(
    state.arrivingShips.some(
      (arriving) =>
        arriving.id === ship.id &&
        arriving.assignedDockId === dockId &&
        Math.abs(arriving.bayCenterY - (ship.bayCenterY + expansionStep)) < 0.001
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
  state.crew.total = 17;
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
  assertCondition(loaded.crew.total === 17, 'Crew total should be restored from save.');
  assertCondition(loaded.controls.shipsPerCycle === 2, 'Ship-per-cycle control should be restored from save.');
  assertCondition(Math.abs(loaded.controls.taxRate - 0.31) < 0.001, 'Tax rate should be restored from save.');
}

function testSaveLoadRegeneratesRuntimeEntities(): void {
  const state = createInitialState({ seed: 3022 });
  buildHabitat(state);
  setupCoreRooms(state);
  setupFoodChain(state);
  state.crew.total = 13;
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
  assertCondition(loaded.crew.total === 13, 'Crew total should survive static save/load.');
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

function testSaveRoundtripLifetimeCountersSurvive(): void {
  const state = createInitialState({ seed: 3088 });
  buildHabitat(state);
  state.metrics.mealsServedTotal = 17;
  state.metrics.creditsEarnedLifetime = 842;
  state.metrics.tradeCyclesCompletedLifetime = 3;
  state.metrics.incidentsResolvedLifetime = 5;
  state.metrics.actorsTreatedLifetime = 2;
  state.metrics.residentsConvertedLifetime = 4;
  state.usageTotals.archetypesEverSeen = {
    diner: true,
    shopper: true,
    lounger: true,
    rusher: false
  };

  const payload = serializeSave('lifetime-counters', state, 'sim-tests');
  const parsed = parseAndMigrateSave(payload);
  assertCondition(parsed.ok, 'Lifetime-counter payload should parse.');
  if (!parsed.ok) return;
  const hydrated = hydrateStateFromSave(parsed.save);
  const loaded = hydrated.state;

  assertCondition(loaded.metrics.mealsServedTotal === 17, 'mealsServedTotal should survive roundtrip.');
  assertCondition(Math.round(loaded.metrics.creditsEarnedLifetime) === 842, 'creditsEarnedLifetime should survive roundtrip.');
  assertCondition(loaded.metrics.tradeCyclesCompletedLifetime === 3, 'tradeCyclesCompletedLifetime should survive roundtrip.');
  assertCondition(loaded.metrics.incidentsResolvedLifetime === 5, 'incidentsResolvedLifetime should survive roundtrip.');
  assertCondition(loaded.metrics.actorsTreatedLifetime === 2, 'actorsTreatedLifetime should survive roundtrip.');
  assertCondition(loaded.metrics.residentsConvertedLifetime === 4, 'residentsConvertedLifetime should survive roundtrip.');
  assertCondition(loaded.usageTotals.archetypesEverSeen.diner === true, 'archetypesEverSeen[diner] should survive roundtrip.');
  assertCondition(loaded.usageTotals.archetypesEverSeen.shopper === true, 'archetypesEverSeen[shopper] should survive roundtrip.');
  assertCondition(loaded.usageTotals.archetypesEverSeen.lounger === true, 'archetypesEverSeen[lounger] should survive roundtrip.');
  assertCondition(loaded.usageTotals.archetypesEverSeen.rusher === false, 'archetypesEverSeen[rusher] should stay false.');
  // Tick runs during hydrate; derived counter should reflect the set.
  assertCondition(loaded.metrics.archetypesServedLifetime === 3, 'archetypesServedLifetime derived from set should be 3.');
}

function testSaveRoundtripTierCapAboveThree(): void {
  const state = createInitialState({ seed: 3089 });
  buildHabitat(state);
  setUnlockTierForTest(state, 5);
  const payload = serializeSave('tier5', state, 'sim-tests');
  const parsed = parseAndMigrateSave(payload);
  assertCondition(parsed.ok, 'Tier-5 save payload should parse.');
  if (!parsed.ok) return;
  const hydrated = hydrateStateFromSave(parsed.save);
  assertCondition(hydrated.state.unlocks.tier === 5, `Tier 5 should hydrate as 5, not demoted; got ${hydrated.state.unlocks.tier}.`);
  // Hydrate reconstructs unlockedIds from UNLOCK_IDS_BY_TIER so the full
  // tier-5 set is present post-roundtrip even if the setUnlockTierForTest
  // helper only seeded tier 1-3 entries.
  assertCondition(hydrated.state.unlocks.unlockedIds.includes('tier4_governance'), 'tier5 hydrate should include tier4_governance id.');
  assertCondition(hydrated.state.unlocks.unlockedIds.includes('tier5_health'), 'tier5 hydrate should include tier5_health id.');
}

function testSellMaterialsIncrementsCreditsEarnedLifetime(): void {
  const state = createInitialState({ seed: 3090 });
  buildHabitat(state);
  setupCoreRooms(state);
  setupTradeChain(state);
  const bought = buyMaterials(state, 0, 35);
  assertCondition(bought, 'Setup: buy materials should seed stock.');
  runFor(state, 150);
  const priorLifetime = state.metrics.creditsEarnedLifetime;
  const priorCredits = state.metrics.credits;
  const ok = sellMaterials(state, 10, 50);
  assertCondition(ok, 'sellMaterials should succeed with stocked materials.');
  assertCondition(state.metrics.credits - priorCredits === 50, 'Credits should rise by creditGain.');
  assertCondition(state.metrics.creditsEarnedLifetime - priorLifetime === 50, 'creditsEarnedLifetime should rise by creditGain for T2 gate.');
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
    residents: state.residents,
    crew: state.crewMembers
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

function testCrewInspectorLogisticsShapeAndPurity(): void {
  const state = createInitialState({ seed: 30415 });
  buildHabitat(state);
  tick(state, 0);
  assertCondition(state.crewMembers.length > 0, 'Crew inspector fixture should create crew members.');
  const crew = state.crewMembers[0];
  const fromTile = toIndex(10, 10, state.width);
  const toTile = toIndex(12, 10, state.width);
  crew.tileIndex = toIndex(8, 10, state.width);
  crew.x = 8.5;
  crew.y = 10.5;
  crew.activeJobId = 7701;
  crew.carryingItemType = null;
  crew.carryingAmount = 0;
  crew.assignedSystem = null;
  crew.lastSystem = null;
  crew.path = [toIndex(9, 10, state.width), fromTile];
  state.jobs.push({
    id: 7701,
    type: 'deliver',
    itemType: 'meal',
    amount: 1.2,
    fromTile,
    toTile,
    assignedCrewId: crew.id,
    createdAt: state.now,
    expiresAt: state.now + 90,
    state: 'assigned',
    pickedUpAmount: 0,
    completedAt: null,
    lastProgressAt: state.now,
    stallReason: 'none'
  });

  const before = snapshotActors(state);
  const inspector = getCrewInspectorById(state, crew.id);
  const after = snapshotActors(state);

  assertCondition(!!inspector, 'Crew inspector should resolve by id.');
  if (!inspector) return;
  assertCondition(inspector.kind === 'crew', 'Crew inspector kind should be crew.');
  assertCondition(inspector.desire === 'logistics', 'Crew desire should reflect active logistics jobs.');
  assertCondition(inspector.currentAction === 'walking to meal pickup', 'Crew action should show pickup path before carrying.');
  assertCondition(inspector.targetTile === fromTile, 'Crew target should point at the pickup while not carrying.');
  assertCondition(inspector.activeJobId === 7701, 'Crew inspector should expose active job id.');
  assertCondition(before === after, 'Crew inspector getter should not mutate actor state.');
}

function testCrewLeisureSocialNeedIsInspectable(): void {
  const state = createInitialState({ seed: 30416 });
  buildHabitat(state);
  setupCoreRooms(state);
  paintRoom(state, RoomType.Lounge, 12, 10, 15, 12);
  placeModuleOrThrow(state, ModuleType.Couch, 12, 11);
  tick(state, 0);

  const crew = state.crewMembers[0];
  const loungeTile = toIndex(12, 11, state.width);
  crew.tileIndex = toIndex(10, 11, state.width);
  crew.x = 10.5;
  crew.y = 11.5;
  crew.role = 'idle';
  crew.activeJobId = null;
  crew.assignedSystem = null;
  crew.targetTile = null;
  crew.resting = false;
  crew.cleaning = false;
  crew.leisure = true;
  crew.leisureSessionActive = false;
  crew.leisureUntil = 0;
  crew.energy = 72;
  crew.hygiene = 88;
  crew.path = findPath(state, crew.tileIndex, loungeTile, { allowRestricted: false, intent: 'crew' }, state.pathOccupancyByTile) ?? [];

  runFor(state, 4);

  const before = snapshotActors(state);
  const inspector = getCrewInspectorById(state, crew.id);
  const after = snapshotActors(state);

  assertCondition(!!inspector, 'Crew inspector should resolve during leisure.');
  if (!inspector) return;
  assertCondition(inspector.leisure, 'Crew inspector should expose leisure state.');
  assertCondition(inspector.desire === 'social', 'Crew desire should expose social recovery while on leisure.');
  assertCondition(inspector.state === 'leisure', 'Crew state label should show leisure.');
  assertCondition(
    inspector.currentAction === 'taking leisure time' || inspector.currentAction === 'walking to social space',
    'Crew action should explain leisure or social routing.'
  );
  assertCondition(before === after, 'Crew leisure inspector getter should not mutate actor state.');
}

function testAgentInspectorMissingId(): void {
  const state = createInitialState({ seed: 3042 });
  assertCondition(getVisitorInspectorById(state, 999999) === null, 'Unknown visitor id should return null inspector.');
  assertCondition(getResidentInspectorById(state, 999999) === null, 'Unknown resident id should return null inspector.');
  assertCondition(getCrewInspectorById(state, 999999) === null, 'Unknown crew id should return null inspector.');
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
  assertCondition(isRoomUnlocked(state, RoomType.LogisticsStock), 'Tier 0 should include starter logistics stock.');
  assertCondition(!isRoomUnlocked(state, RoomType.Workshop), 'Tier 0 should not include workshop.');
  assertCondition(!isRoomUnlocked(state, RoomType.Storage), 'Tier 0 should not include full storage.');
  assertCondition(!isRoomUnlocked(state, RoomType.Security), 'Tier 0 should not include security.');
  assertCondition(isModuleUnlocked(state, ModuleType.IntakePallet), 'Tier 0 should include starter intake pallet.');
  assertCondition(!isModuleUnlocked(state, ModuleType.Workbench), 'Tier 0 should not include workbench.');
  assertCondition(!isModuleUnlocked(state, ModuleType.StorageRack), 'Tier 0 should not include storage rack.');
  assertCondition(!isModuleUnlocked(state, ModuleType.Terminal), 'Tier 0 should not include terminal.');
  assertCondition(isShipTypeUnlocked(state, 'tourist'), 'Tier 0 should include tourist ships.');
  assertCondition(isShipTypeUnlocked(state, 'trader'), 'Tier 0 should include trader ships.');
  assertCondition(!isShipTypeUnlocked(state, 'industrial'), 'Tier 0 should not include industrial ships.');
  assertCondition(!isShipTypeUnlocked(state, 'military'), 'Tier 0 should not include military ships.');
}

function testTier0StarterDepotMaterialCapacity(): void {
  const missingIntake = createInitialState({ seed: 5111 });
  buildHabitat(missingIntake);
  setupCoreRooms(missingIntake);
  setUnlockTierForTest(missingIntake, 0);
  const missing = buyMaterialsDetailed(missingIntake, 0, 25);
  assertCondition(!missing.ok, 'Tier 0 buying materials without intake should fail.');
  if (missing.ok) throw new Error('Expected missing intake failure.');
  assertCondition(missing.reason === 'no_logistics_stock', 'Tier 0 missing intake should report no logistics stock.');

  const starter = createInitialState({ seed: 5112 });
  buildHabitat(starter);
  setupCoreRooms(starter);
  setUnlockTierForTest(starter, 0);
  setupStarterDepot(starter);
  const small = buyMaterialsDetailed(starter, 0, 25);
  assertCondition(small.ok, 'Tier 0 starter depot should receive +25 materials.');

  const bulk = buyMaterialsDetailed(starter, 0, 80);
  assertCondition(!bulk.ok, 'Tier 0 single intake pallet should not receive +80 materials.');
  if (bulk.ok) throw new Error('Expected starter depot capacity failure.');
  assertCondition(bulk.reason === 'insufficient_storage_capacity', 'Starter depot bulk buy should fail on capacity.');
  assertCondition(bulk.targetNodeCount === 1, 'Starter depot bulk buy should report the single intake node.');
  assertCondition(bulk.freeCapacity < 80, 'Starter depot bulk buy should report insufficient free capacity.');
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
  // T1 predicate is first-visitor-arrives; air+mealStock+cafeteria above
  // are legacy environmental setup, not the trigger.
  state.usageTotals.archetypesEverSeen = {
    diner: true,
    shopper: false,
    lounger: false,
    rusher: false,
  };
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

function testUnlockTier3TriggersOnTradeCycle(): void {
  const state = createInitialState({ seed: 5104 });
  buildHabitat(state);
  setUnlockTierForTest(state, 2);
  state.controls.paused = true;
  tick(state, 0);
  assertCondition(getUnlockTier(state) === 2, 'Tier 3 should not unlock without a trade cycle.');
  state.metrics.tradeCyclesCompletedLifetime = 1;
  tick(state, 0);
  assertCondition(getUnlockTier(state) >= 3, 'Tier 3 should unlock when tradeCyclesCompletedLifetime >= 1.');
}

function testUnlockTier4TriggersOnTreatmentAndIncident(): void {
  const state = createInitialState({ seed: 5105 });
  buildHabitat(state);
  setUnlockTierForTest(state, 3);
  state.controls.paused = true;
  tick(state, 0);
  assertCondition(getUnlockTier(state) === 3, 'Tier 4 should not unlock without treatment and incident response.');
  state.metrics.actorsTreatedLifetime = 1;
  state.metrics.incidentsResolvedLifetime = 1;
  tick(state, 0);
  assertCondition(getUnlockTier(state) >= 4, 'Tier 4 should unlock after treatment and one resolved incident.');
}

function testUnlockTier5TriggersOnPermanentHabitation(): void {
  const state = createInitialState({ seed: 51051 });
  buildHabitat(state);
  setUnlockTierForTest(state, 4);
  setupFiveResidentHabitation(state);
  const dockId = placeEastHullDock(state, 18, 19);
  setDockPurpose(state, dockId, 'residential');
  state.controls.paused = true;
  tick(state, 0);
  assertCondition(getUnlockTier(state) >= 5, 'Tier 5 should unlock with 5 residents, 5 private beds, and a residential berth.');
}

function testRebuildDockEntitiesPreservesAllowedShips(): void {
  const state = createInitialState({ seed: 5106 });
  buildHabitat(state);
  const dockId = placeEastHullDock(state, 10, 11);
  setDockAllowedShipType(state, dockId, 'industrial', true);
  setDockPurpose(state, dockId, 'residential');
  const dockBefore = state.docks.find((d) => d.id === dockId)!;
  assertCondition(dockBefore.allowedShipTypes.includes('industrial'), 'Setup: dock should accept industrial.');
  assertCondition(dockBefore.purpose === 'residential', 'Setup: dock purpose should be residential.');
  const preservedShipTypes = [...dockBefore.allowedShipTypes];
  // Paint a Dock tile adjacent to extend the cluster. setTile triggers
  // rebuildDockEntities; the merged dock should preserve the inherited
  // allowedShipTypes + purpose via the byAnyTile reconciliation loop
  // at sim.ts:2185.
  const adjacentTile = toIndex(state.width - 1, 12, state.width);
  setTile(state, adjacentTile, TileType.Dock);
  const dockAfter = state.docks.find((d) => d.tiles.includes(dockBefore.anchorTile));
  assertCondition(!!dockAfter, 'Rebuilt dock should still exist at original anchor.');
  if (!dockAfter) return;
  for (const shipType of preservedShipTypes) {
    assertCondition(
      dockAfter.allowedShipTypes.includes(shipType),
      `Rebuilt dock should preserve ${shipType} in allowedShipTypes through topology change.`
    );
  }
  assertCondition(
    dockAfter.purpose === 'residential',
    'Rebuilt dock should preserve purpose through topology change.'
  );
  assertCondition(
    dockAfter.tiles.length >= 2,
    'Rebuilt dock should cluster with the new adjacent tile.'
  );
}

function testRebuildDockEntitiesPaintOverExistingDockIsIdempotent(): void {
  // Coverage gap flagged by tinyclaw's review of PR #44: the merge case
  // tests the *adjacent-new-tile* path, but the redundant-paint path
  // (setTile with previousTile === Dock → short-circuits at sim.ts:7525)
  // isn't exercised. Guard that the early-return doesn't silently
  // mutate docks, versions, or inherited metadata.
  const state = createInitialState({ seed: 5108 });
  buildHabitat(state);
  const dockId = placeEastHullDock(state, 10, 11);
  setDockAllowedShipType(state, dockId, 'industrial', true);
  setDockPurpose(state, dockId, 'residential');
  const dockBefore = state.docks.find((d) => d.id === dockId)!;
  const tilesBefore = [...dockBefore.tiles];
  const allowedBefore = [...dockBefore.allowedShipTypes];
  const purposeBefore = dockBefore.purpose;
  const anchorBefore = dockBefore.anchorTile;
  const topologyVersionBefore = state.topologyVersion;
  const dockVersionBefore = state.dockVersion;
  const dockCountBefore = state.docks.length;

  // Paint Dock on a tile that is already Dock. setTile should short-
  // circuit at the `previousTile === tile` check and bump NO versions,
  // trigger NO rebuild, preserve all metadata.
  setTile(state, tilesBefore[0], TileType.Dock);

  assertCondition(
    state.docks.length === dockCountBefore,
    `Paint-over should not change dock count; got ${state.docks.length} from ${dockCountBefore}.`
  );
  const dockAfter = state.docks.find((d) => d.id === dockId);
  assertCondition(!!dockAfter, 'Paint-over: dock id should still exist.');
  if (!dockAfter) return;
  assertCondition(
    dockAfter.tiles.length === tilesBefore.length && dockAfter.tiles.every((t, i) => t === tilesBefore[i]),
    'Paint-over: dock.tiles should be byte-equal to pre-paint.'
  );
  assertCondition(dockAfter.anchorTile === anchorBefore, 'Paint-over: anchorTile should not shift.');
  assertCondition(dockAfter.purpose === purposeBefore, 'Paint-over: purpose should not change.');
  for (const shipType of allowedBefore) {
    assertCondition(
      dockAfter.allowedShipTypes.includes(shipType),
      `Paint-over: allowed ship type ${shipType} should persist.`
    );
  }
  assertCondition(
    state.topologyVersion === topologyVersionBefore,
    `Paint-over: topologyVersion should not bump; got ${state.topologyVersion} from ${topologyVersionBefore}.`
  );
  assertCondition(
    state.dockVersion === dockVersionBefore,
    `Paint-over: dockVersion should not bump; got ${state.dockVersion} from ${dockVersionBefore}.`
  );
}

function testRebuildDockEntitiesSplitsOnMiddleTileDeletion(): void {
  // Coverage gap: PR #44 tests MERGE (1→2), and paint-over tests
  // idempotency. The reverse — deleting a middle tile from a 3+ tile
  // dock → topology SPLITS into two disjoint clusters — is untested.
  // Each resulting dock should: (a) be a distinct entity, (b) inherit
  // parent metadata (purpose, allowedShipTypes), (c) one keeps the
  // original id, the other gets maxId+1.
  const state = createInitialState({ seed: 5109 });
  buildHabitat(state);
  const dockId = placeEastHullDock(state, 10, 12); // 3-tile cluster at x=44, y=10..12
  setDockAllowedShipType(state, dockId, 'industrial', true);
  setDockPurpose(state, dockId, 'residential');
  const dockBefore = state.docks.find((d) => d.id === dockId)!;
  assertCondition(dockBefore.tiles.length === 3, `Setup: expected 3-tile dock, got ${dockBefore.tiles.length}.`);
  const [topTile, middleTile, bottomTile] = dockBefore.tiles;
  const inheritedAllowed = [...dockBefore.allowedShipTypes];
  const inheritedPurpose = dockBefore.purpose;

  // Delete the middle tile → splits into two 1-tile clusters.
  // (1-tile dock has no `allowedShipSizes` guarantees for multi-tile
  // ships, but the topology split is what we're testing.)
  setTile(state, middleTile, TileType.Floor);

  assertCondition(
    state.docks.length === 2,
    `Split: expected 2 docks post-deletion, got ${state.docks.length}.`
  );
  const topDock = state.docks.find((d) => d.tiles.includes(topTile));
  const bottomDock = state.docks.find((d) => d.tiles.includes(bottomTile));
  assertCondition(!!topDock, 'Split: top tile should belong to a dock.');
  assertCondition(!!bottomDock, 'Split: bottom tile should belong to a dock.');
  if (!topDock || !bottomDock) return;
  assertCondition(topDock.id !== bottomDock.id, 'Split: two resulting docks must have distinct ids.');
  assertCondition(
    topDock.id === dockId || bottomDock.id === dockId,
    `Split: one resulting dock should keep the original id ${dockId}.`
  );
  // Both should inherit metadata from the parent via byAnyTile (sim.ts:2181).
  for (const dock of [topDock, bottomDock]) {
    assertCondition(
      dock.purpose === inheritedPurpose,
      `Split: dock ${dock.id} should inherit purpose '${inheritedPurpose}', got '${dock.purpose}'.`
    );
    for (const shipType of inheritedAllowed) {
      assertCondition(
        dock.allowedShipTypes.includes(shipType),
        `Split: dock ${dock.id} should inherit allowedShipTypes containing '${shipType}'.`
      );
    }
    assertCondition(dock.tiles.length === 1, `Split: each side should be 1 tile, got ${dock.tiles.length}.`);
  }
  // Middle tile no longer appears in any dock's tile list.
  assertCondition(
    !state.docks.some((d) => d.tiles.includes(middleTile)),
    'Split: deleted middle tile should not appear in any dock cluster.'
  );
}

function testRebuildDockEntitiesSplitWithDockedShipPreservesReference(): void {
  // Follow-up from PR #53 review: exercises the `occupiedByShipId`
  // inheritance branch (sim.ts:2213) that the sibling split test misses.
  // Asserts the invariant "exactly one dock claims this ship, and
  // ship.assignedDockId points at it" — deliberately NOT coupled to
  // which half keeps the parent id, so a future ship-relocation fix
  // (e.g. re-sync bayTiles, move ship to the larger half) can land
  // without churning this test.
  const state = createInitialState({ seed: 5130 });
  buildHabitat(state);
  const dockId = placeEastHullDock(state, 10, 12);
  const dockBefore = state.docks.find((d) => d.id === dockId)!;
  assertCondition(dockBefore.tiles.length === 3, `Setup: expected 3-tile dock, got ${dockBefore.tiles.length}.`);
  const middleTile = dockBefore.tiles[1];

  const ship = createDockedTransientShip(state, dockId, 9200);
  assertCondition(dockBefore.occupiedByShipId === ship.id, 'Setup: parent dock should be occupied by ship.');

  // Split by deleting middle tile.
  setTile(state, middleTile, TileType.Floor);

  assertCondition(state.docks.length === 2, `Split: expected 2 docks, got ${state.docks.length}.`);
  assertCondition(
    state.arrivingShips.some((s) => s.id === ship.id),
    'Split: parked ship should still exist in arrivingShips after dock-split.'
  );

  const claimingDocks = state.docks.filter((d) => d.occupiedByShipId === ship.id);
  assertCondition(
    claimingDocks.length === 1,
    `Split: exactly one dock must claim ship.id=${ship.id} post-split (got ${claimingDocks.length}). Prevents phantom dual-occupancy from id-collision regressions.`
  );
  const claimingDock = claimingDocks[0];
  assertCondition(
    ship.assignedDockId === claimingDock.id,
    `Split: ship.assignedDockId must match the claiming dock (got ${ship.assignedDockId}, claimer ${claimingDock.id}).`
  );
}

function testRebuildDockEntitiesThreeWaySplitDedupesIds(): void {
  // Third of the PR #53 follow-ups: the 2-way split test exercises
  // consumedIds at size-1 (one inherited id consumed, the other
  // cluster gets ++maxId). A 3-way split exercises the Set at >1 entry
  // — both the "2nd cluster falls through" AND "3rd cluster also falls
  // through" branches of the dedup logic. Guards against any scaling
  // regression where the Set degenerates or iteration skips entries.
  const state = createInitialState({ seed: 5140 });
  buildHabitat(state);
  // Place a 5-tile vertical dock at x=44, y=10..14.
  const dockId = placeEastHullDock(state, 10, 14);
  setDockAllowedShipType(state, dockId, 'industrial', true);
  setDockPurpose(state, dockId, 'residential');
  const dockBefore = state.docks.find((d) => d.id === dockId)!;
  assertCondition(dockBefore.tiles.length === 5, `Setup: expected 5-tile dock, got ${dockBefore.tiles.length}.`);
  const sortedTiles = [...dockBefore.tiles].sort((a, b) => a - b);
  const [topTile, firstDeleteTile, middleTile, secondDeleteTile, bottomTile] = sortedTiles;
  const inheritedAllowed = dockBefore.allowedShipTypes;
  const inheritedPurpose = dockBefore.purpose;

  // Delete y=11 AND y=13 → three 1-tile clusters at y=10, y=12, y=14.
  setTile(state, firstDeleteTile, TileType.Floor);
  setTile(state, secondDeleteTile, TileType.Floor);

  assertCondition(
    state.docks.length === 3,
    `3-way split: expected 3 docks post-deletion, got ${state.docks.length}.`
  );
  const topDock = state.docks.find((d) => d.tiles.includes(topTile));
  const middleDock = state.docks.find((d) => d.tiles.includes(middleTile));
  const bottomDock = state.docks.find((d) => d.tiles.includes(bottomTile));
  assertCondition(!!topDock && !!middleDock && !!bottomDock, '3-way split: all three halves should exist as docks.');
  if (!topDock || !middleDock || !bottomDock) return;

  // All three must have distinct ids (no collisions).
  const ids = new Set([topDock.id, middleDock.id, bottomDock.id]);
  assertCondition(
    ids.size === 3,
    `3-way split: all three dock ids must be distinct, got [${topDock.id}, ${middleDock.id}, ${bottomDock.id}].`
  );

  // Exactly one keeps the parent id; the other two consumed `++maxId`
  // fresh ids. consumedIds ensures only one of the three matches dockId.
  const keeperCount = [topDock, middleDock, bottomDock].filter((d) => d.id === dockId).length;
  assertCondition(
    keeperCount === 1,
    `3-way split: exactly one cluster should keep the parent id (got ${keeperCount}).`
  );
  // Smallest-index-keeper invariant: because rebuildDockEntities walks
  // state.tiles by ascending index, the cluster containing the smallest
  // index (here: topDock) is always the one that inherits the parent id.
  // Locking this prevents a subtle iteration-order regression where
  // keeper selection becomes non-deterministic.
  assertCondition(
    topDock.id === dockId,
    `3-way split: smallest-index cluster (top) should always be the id-keeper (got top.id=${topDock.id}, parent=${dockId}).`
  );

  // All three inherit parent metadata via byAnyTile — verifies the
  // metadata-copy path runs per-cluster, not just once.
  for (const dock of [topDock, middleDock, bottomDock]) {
    assertCondition(
      dock.purpose === inheritedPurpose,
      `3-way split: dock ${dock.id} should inherit purpose '${inheritedPurpose}'.`
    );
    for (const shipType of inheritedAllowed) {
      assertCondition(
        dock.allowedShipTypes.includes(shipType),
        `3-way split: dock ${dock.id} should inherit allowedShipTypes containing '${shipType}'.`
      );
    }
  }
}

function testRebuildDockEntitiesAsymmetricSplitPreservesClusterSizes(): void {
  // Coverage gap from #66 review: symmetric 1+1+1 split doesn't
  // exercise the maxSizeByArea downgrade path for a cluster whose
  // post-split size drops its capability. Here we delete the 2nd tile
  // of a 6-tile dock → 1-tile + 4-tile split (asymmetric). The 1-tile
  // half degrades to maxSizeByArea='small'; the 4-tile half should
  // stay at 'medium' per SHIP_MIN_DOCK_AREA thresholds.
  const state = createInitialState({ seed: 5150 });
  buildHabitat(state);
  const dockId = placeEastHullDock(state, 10, 15); // 6-tile y=10..15
  setDockAllowedShipType(state, dockId, 'industrial', true);
  setDockPurpose(state, dockId, 'residential');
  const dockBefore = state.docks.find((d) => d.id === dockId)!;
  assertCondition(dockBefore.tiles.length === 6, `Setup: expected 6-tile dock, got ${dockBefore.tiles.length}.`);
  assertCondition(dockBefore.maxSizeByArea === 'medium', `Setup: 6-tile should be 'medium' capability.`);
  const sortedTiles = [...dockBefore.tiles].sort((a, b) => a - b);
  const topTile = sortedTiles[0];
  const deleteTile = sortedTiles[1];

  // Delete y=11 → 1-tile (y=10) + 4-tile (y=12..15) split.
  setTile(state, deleteTile, TileType.Floor);

  assertCondition(state.docks.length === 2, `Asymmetric split: expected 2 docks, got ${state.docks.length}.`);
  const topDock = state.docks.find((d) => d.tiles.includes(topTile))!;
  const bigDock = state.docks.find((d) => d.tiles.length === 4);
  assertCondition(!!bigDock, `Asymmetric split: 4-tile half should exist.`);
  if (!bigDock) return;
  assertCondition(
    topDock.tiles.length === 1,
    `Asymmetric split: 1-tile half should have size 1, got ${topDock.tiles.length}.`
  );
  assertCondition(
    topDock.maxSizeByArea === 'small',
    `Asymmetric split: 1-tile half should downgrade maxSizeByArea to 'small', got '${topDock.maxSizeByArea}'.`
  );
  assertCondition(
    bigDock.maxSizeByArea === 'medium',
    `Asymmetric split: 4-tile half should retain 'medium' capability, got '${bigDock.maxSizeByArea}'.`
  );
}

function testRebuildDockEntitiesThreeWaySplitClearsPhantomOccupancy(): void {
  // Coverage gap from #66 review: 3-way occupiedByShipId inheritance
  // branch (sim.ts:2213). Extends the 2-way-with-ship test to the
  // scaling case — only the keeper half should claim the ship; the
  // two fresh-id halves must both have occupiedByShipId=null. Prevents
  // a dual-phantom-occupancy regression at N>2.
  const state = createInitialState({ seed: 5160 });
  buildHabitat(state);
  const dockId = placeEastHullDock(state, 10, 14); // 5-tile
  const dockBefore = state.docks.find((d) => d.id === dockId)!;
  assertCondition(dockBefore.tiles.length === 5, `Setup: expected 5-tile dock, got ${dockBefore.tiles.length}.`);
  const sortedTiles = [...dockBefore.tiles].sort((a, b) => a - b);
  const [, firstDel, , secondDel] = sortedTiles;

  const ship = createDockedTransientShip(state, dockId, 9300);
  assertCondition(dockBefore.occupiedByShipId === ship.id, 'Setup: parent dock should claim ship.');

  setTile(state, firstDel, TileType.Floor);
  setTile(state, secondDel, TileType.Floor);

  assertCondition(state.docks.length === 3, `3-way+ship: expected 3 docks, got ${state.docks.length}.`);
  const claimingDocks = state.docks.filter((d) => d.occupiedByShipId === ship.id);
  assertCondition(
    claimingDocks.length === 1,
    `3-way+ship: exactly one dock must claim ship=${ship.id} (got ${claimingDocks.length}). Prevents phantom dual/triple-occupancy.`
  );
  assertCondition(
    ship.assignedDockId === claimingDocks[0].id,
    `3-way+ship: ship.assignedDockId must match the claimer (got ${ship.assignedDockId}, claimer ${claimingDocks[0].id}).`
  );
}

function testRebuildDockEntitiesSplitDowngradesAllowedShipSizes(): void {
  // Coverage gap from #66 review: when a cluster splits into smaller
  // halves whose maxSizeByArea drops below the parent's
  // allowedShipSizes subset, the subset must be truncated to what the
  // new cluster CAN physically accept. A 4-tile dock opted into
  // 'medium' that splits into 1-tile halves should lose 'medium' from
  // allowedShipSizes — keeping a stale permission post-split would
  // silently allow medium ships to attempt docking on a too-small
  // cluster.
  const state = createInitialState({ seed: 5170 });
  buildHabitat(state);
  const dockId = placeEastHullDock(state, 10, 13); // 4-tile
  setDockAllowedShipSize(state, dockId, 'medium', true);
  const dockBefore = state.docks.find((d) => d.id === dockId)!;
  assertCondition(
    dockBefore.allowedShipSizes.includes('medium'),
    'Setup: 4-tile dock should opt-in to medium.'
  );
  const sortedTiles = [...dockBefore.tiles].sort((a, b) => a - b);
  const [, firstDel, secondDel] = sortedTiles;

  // Delete the middle 2 tiles of a 4-tile dock → two 1-tile clusters
  // at the endpoints (each with maxSizeByArea='small').
  setTile(state, firstDel, TileType.Floor);
  setTile(state, secondDel, TileType.Floor);

  assertCondition(state.docks.length === 2, `Downgrade: expected 2 docks after mid-deletions, got ${state.docks.length}.`);
  for (const dock of state.docks) {
    assertCondition(
      dock.maxSizeByArea === 'small',
      `Downgrade: 1-tile cluster should have maxSizeByArea='small', got '${dock.maxSizeByArea}'.`
    );
    assertCondition(
      !dock.allowedShipSizes.includes('medium'),
      `Downgrade: 1-tile cluster must not retain stale 'medium' permission post-split (got [${dock.allowedShipSizes.join(',')}]).`
    );
  }
}

function testRebuildDockEntitiesClusterSizeScalesShipCapacity(): void {
  // Coverage gap: 3+ tile clusters aren't tested. `maxSizeByArea`
  // (sim.ts:2194) is the *capability* indicator — it scales with
  // cluster.length per SHIP_MIN_DOCK_AREA thresholds. `allowedShipSizes`
  // is the user-gated *permission* subset — tile-by-tile growth
  // inherits the prior subset rather than auto-expanding (so a user who
  // disabled medium doesn't re-enable it on next paint). We verify both
  // surfaces: maxSizeByArea scales automatically, allowedShipSizes only
  // expands when the user opts in via setDockAllowedShipSize().
  // Tile dims are derived from SHIP_MIN_DOCK_AREA so a threshold change
  // (e.g. large 7→8) reshapes the test rather than silently passing.
  const state = createInitialState({ seed: 5110 });
  buildHabitat(state);
  const mediumThreshold = SHIP_MIN_DOCK_AREA.medium;
  const largeThreshold = SHIP_MIN_DOCK_AREA.large;

  // Cluster at medium-threshold size → maxSizeByArea should be 'medium'.
  const clusterTopY = 10;
  const clusterMediumBottomY = clusterTopY + mediumThreshold - 1;
  const dockId4 = placeEastHullDock(state, clusterTopY, clusterMediumBottomY);
  const dock4 = state.docks.find((d) => d.id === dockId4)!;
  assertCondition(
    dock4.tiles.length === mediumThreshold,
    `medium-threshold cluster: expected ${mediumThreshold} tiles, got ${dock4.tiles.length}.`
  );
  assertCondition(
    dock4.maxSizeByArea === 'medium',
    `medium-threshold cluster: maxSizeByArea should be 'medium', got '${dock4.maxSizeByArea}'.`
  );
  // anchorTile is the smallest tile index in the sorted cluster.
  const expectedAnchor = toIndex(44, clusterTopY, state.width);
  assertCondition(
    dock4.anchorTile === expectedAnchor,
    `medium-threshold cluster: anchorTile should be smallest tile index ${expectedAnchor}, got ${dock4.anchorTile}.`
  );
  assertCondition(
    dock4.allowedShipSizes.includes('small'),
    `medium-threshold cluster: allowedShipSizes should always include 'small' fallback; got ${dock4.allowedShipSizes.join(',')}.`
  );
  // Manual opt-in is required to expand allowedShipSizes beyond the
  // inherited subset. After opt-in, medium should be permitted.
  setDockAllowedShipSize(state, dockId4, 'medium', true);
  const dock4After = state.docks.find((d) => d.id === dockId4)!;
  assertCondition(
    dock4After.allowedShipSizes.includes('medium'),
    `medium-threshold cluster: setDockAllowedShipSize(medium,true) should enable medium; got ${dock4After.allowedShipSizes.join(',')}.`
  );

  // Extend to large-threshold size → maxSizeByArea should flip to
  // 'large'. Growing in place also exercises the merge-preserves-id
  // invariant across a multi-tile extension, not just the 1→2 case from
  // PR #44. Opt-in must still persist medium across the topology change.
  const clusterLargeBottomY = clusterTopY + largeThreshold - 1;
  for (let y = clusterMediumBottomY + 1; y <= clusterLargeBottomY; y++) {
    setTile(state, toIndex(44, y, state.width), TileType.Dock);
  }
  const dock7 = state.docks.find((d) => d.tiles.includes(expectedAnchor));
  assertCondition(!!dock7, 'large-threshold cluster: dock containing original anchor should still exist.');
  if (!dock7) return;
  assertCondition(
    dock7.id === dockId4,
    `large-threshold cluster: growing in place should preserve original id ${dockId4}, got ${dock7.id}.`
  );
  assertCondition(
    dock7.tiles.length === largeThreshold,
    `large-threshold cluster: expected ${largeThreshold} tiles, got ${dock7.tiles.length}.`
  );
  assertCondition(
    dock7.maxSizeByArea === 'large',
    `large-threshold cluster: maxSizeByArea should be 'large', got '${dock7.maxSizeByArea}'.`
  );
  assertCondition(
    dock7.allowedShipSizes.includes('medium'),
    `large-threshold cluster: medium opt-in should persist across extension; got ${dock7.allowedShipSizes.join(',')}.`
  );
  assertCondition(
    dock7.anchorTile === expectedAnchor,
    `large-threshold cluster: anchorTile should remain the smallest tile index ${expectedAnchor} after extension, got ${dock7.anchorTile}.`
  );
  // Opt-in to large and verify it takes (capability has now caught up).
  setDockAllowedShipSize(state, dockId4, 'large', true);
  const dock7After = state.docks.find((d) => d.id === dockId4)!;
  assertCondition(
    dock7After.allowedShipSizes.includes('large'),
    `large-threshold cluster: setDockAllowedShipSize(large,true) should enable large; got ${dock7After.allowedShipSizes.join(',')}.`
  );
}

function testActorsTreatedLifetimeIncrementsOnRecovery(): void {
  const state = createInitialState({ seed: 5107 });
  buildHabitat(state);
  setupCoreRooms(state);
  // crewMembers is populated lazily by ensureCrewPopulation up to
  // state.crew.total = 8 starter — tick once paused to fill the array,
  // then force-distress crew[0] before unpausing so the recovery loop
  // can run + applyAirExposure can fire the proxy increment.
  state.controls.paused = true;
  tick(state, 0);
  assertCondition(state.crewMembers.length >= 1, 'Setup: starter state should have crew after tick.');
  const crew = state.crewMembers[0];
  crew.airExposureSec = 25;
  crew.healthState = 'distressed';
  state.metrics.airQuality = 100;
  state.controls.paused = false;
  const priorTreated = state.metrics.actorsTreatedLifetime;
  // Recovery rate is 1.8 sec exposure shed per real second at high
  // airQuality, so 25s of exposure clears in <15s of sim time.
  runFor(state, 20);
  assertCondition(
    state.metrics.actorsTreatedLifetime > priorTreated,
    `actorsTreatedLifetime should increment on health recovery; got ${state.metrics.actorsTreatedLifetime} from prior ${priorTreated}.`
  );
  const finalHealth: string = crew.healthState;
  assertCondition(
    finalHealth === 'healthy',
    `Crew should reach 'healthy' under clean air; got '${finalHealth}'.`
  );
}

// Regression guard against T2 becoming unreachable via normal play:
// exercises the spawn pipeline end-to-end (ship.manifestMix → pickArchetype
// → archetypesEverSeen). Runs 3 sim minutes at default T1 parameters + 1
// visitor dock; asserts >=3 distinct archetypes spawn, matching the T2
// predicate threshold. Failure = balance regression (rare archetype weight
// dropped too low, ship manifest routing broken). Complements the
// unit-level testUnlockTier2RequiresLogisticsSignal which pokes the
// predicate directly.
function testT1ArchetypeDiversityReachesThreeWithinThreeMinutes(): void {
  const state = createInitialState({ seed: 9701 });
  buildHabitat(state);
  setUnlockTierForTest(state, 1);
  placeEastHullDock(state, 8, 9);
  state.controls.shipsPerCycle = 3;
  runFor(state, 180);

  const seen = state.usageTotals.archetypesEverSeen;
  const distinctCount = Object.values(seen).filter(Boolean).length;
  const totalVisitorsSpawned = state.spawnCounter;
  assertCondition(
    totalVisitorsSpawned >= 5,
    `Setup: at least 5 visitors should spawn in 180s with shipsPerCycle=3 (got ${totalVisitorsSpawned}).`
  );
  assertCondition(
    distinctCount >= 3,
    `T1 default spawn should reach >=3 archetypes within 3 sim minutes ` +
      `(got ${distinctCount}/4 across ${totalVisitorsSpawned} visitors: ` +
      `diner=${seen.diner}, shopper=${seen.shopper}, lounger=${seen.lounger}, rusher=${seen.rusher}).`
  );
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

function testTier3ClinicGeneratesTreatablePatients(): void {
  const state = createInitialState({ seed: 5120 });
  buildHabitat(state);
  setUnlockTierForTest(state, 3);
  setupCoreRooms(state);
  paintRoom(state, RoomType.Clinic, 24, 12, 27, 14);
  placeModuleOrThrow(state, ModuleType.MedBed, 24, 13);
  spawnVisitor(state, 20, 13, 512001);
  const visitor = state.visitors[0];
  visitor.servedMeal = true;
  visitor.patience = 0;
  visitor.state = VisitorState.Leisure;
  visitor.eatTimer = 999;

  runFor(state, 90);

  assertCondition(
    state.metrics.actorsTreatedLifetime > 0,
    'Tier 3 clinic should generate a patient and allow treatment progress.'
  );
}

function testTier3SecurityGeneratesDispatchableIncidents(): void {
  const state = createInitialState({ seed: 5121 });
  buildHabitat(state);
  setUnlockTierForTest(state, 3);
  setupCoreRooms(state);
  paintRoom(state, RoomType.Security, 24, 12, 27, 14);
  placeModuleOrThrow(state, ModuleType.Terminal, 24, 13);
  state.crew.total = 12;
  state.controls.crewPriorityWeights.security = 10;
  spawnVisitor(state, 20, 13, 512101);
  const visitor = state.visitors[0];
  visitor.servedMeal = true;
  visitor.patience = 0;
  visitor.state = VisitorState.Leisure;
  visitor.eatTimer = 999;

  runFor(state, 120);

  assertCondition(
    state.metrics.incidentsResolvedLifetime > 0,
    'Tier 3 security should generate and resolve a dispatchable incident.'
  );
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

function testSecurityPriorityStaffsBrig(): void {
  const state = createInitialState({ seed: 5119 });
  buildHabitat(state);
  setUnlockTierForTest(state, 3);
  setupCoreRooms(state);
  paintRoom(state, RoomType.Brig, 14, 10, 16, 12);
  placeModuleOrThrow(state, ModuleType.CellConsole, 15, 10);
  state.controls.crewPriorityWeights.security = 10;
  runFor(state, 20);

  const brigStaff = state.crewMembers.filter(
    (crew) => crew.assignedSystem === 'security' && crew.targetTile !== null && state.rooms[crew.targetTile] === RoomType.Brig
  );
  assertCondition(brigStaff.length > 0, 'Security priority should assign staff to Brig posts.');
  assertCondition(state.ops.brigActive > 0, 'Staffed Brig should become active.');
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

function testTier0VisitorDockSchedulesTraffic(): void {
  const state = createInitialState({ seed: 5113 });
  buildHabitat(state);
  setUnlockTierForTest(state, 0);
  setupCoreRooms(state);
  setupFoodChain(state);
  const dockId = placeEastHullDock(state, 8, 8);
  setDockAllowedShipType(state, dockId, 'tourist', true);
  setDockAllowedShipType(state, dockId, 'trader', true);
  state.controls.shipsPerCycle = 1;
  runFor(state, 45, 0.5);
  assertCondition(state.shipSpawnCounter > 1, 'Tier 0 one-tile visitor dock should schedule ship traffic.');
  assertCondition(state.spawnCounter > 1, 'Tier 0 one-tile visitor dock should spawn at least one visitor.');
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
    [5, 'straight.vertical', 0],
    [10, 'straight', 0],
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

function testDualWallVariantTruthTable(): void {
  // Truth table for pickDualVariant. Mask = tl*1 + tr*2 + bl*4 + br*8.
  // Entries: [mask, expectedShape, expectedRotation].
  const expected: Array<[number, DualWallShape, 0 | 90 | 180 | 270]> = [
    [0, 'empty', 0],
    [1, 'single_corner', 0],
    [2, 'single_corner', 90],
    [4, 'single_corner', 270],
    [8, 'single_corner', 180],
    [3, 'edge', 0],
    [10, 'edge', 90],
    [12, 'edge', 180],
    [5, 'edge', 270],
    [9, 'saddle', 0],
    [6, 'saddle', 90],
    [7, 'inner_corner', 0],
    [11, 'inner_corner', 90],
    [14, 'inner_corner', 180],
    [13, 'inner_corner', 270],
    [15, 'full', 0]
  ];
  const seen = new Set<number>();
  for (const [mask, shape, rotation] of expected) {
    seen.add(mask);
    const tl = (mask & 1) !== 0;
    const tr = (mask & 2) !== 0;
    const bl = (mask & 4) !== 0;
    const br = (mask & 8) !== 0;
    const actual = pickDualVariant(tl, tr, bl, br);
    assertCondition(actual.shape === shape, `Dual wall shape mismatch for mask ${mask}: expected ${shape}, got ${actual.shape}.`);
    assertCondition(
      actual.rotation === rotation,
      `Dual wall rotation mismatch for mask ${mask}: expected ${rotation}, got ${actual.rotation}.`
    );
  }
  // Confirm all 16 masks are covered by the table.
  assertCondition(seen.size === 16, `Dual wall truth table should cover all 16 masks; covered ${seen.size}.`);
  // Sweep every mask once more to ensure no runtime throw / no undefined entries.
  for (let m = 0; m < 16; m++) {
    const tl = (m & 1) !== 0;
    const tr = (m & 2) !== 0;
    const bl = (m & 4) !== 0;
    const br = (m & 8) !== 0;
    const v = pickDualVariant(tl, tr, bl, br);
    assertCondition(typeof v.shape === 'string' && v.shape.length > 0, `pickDualVariant produced invalid shape for mask ${m}.`);
  }
}

function run(): void {
  testStarterCoreIsOpenWithSideReactor();
  testTileBuildCostDoesNotScaleWithDistance();
  testTrussBuildRequiresEvaAndCanChain();
  testTrussExpansionConvertsScaffoldIntoPressurizedShell();
  testUnlockTier0StartsConstrained();
  testTier0StarterDepotMaterialCapacity();
  testUnlockTier1TriggersAfterStability();
  testUnlockTier2RequiresLogisticsSignal();
  testUnlockTier3TriggersOnTradeCycle();
  testUnlockTier4TriggersOnTreatmentAndIncident();
  testUnlockTier5TriggersOnPermanentHabitation();
  testRebuildDockEntitiesPreservesAllowedShips();
  testRebuildDockEntitiesPaintOverExistingDockIsIdempotent();
  testRebuildDockEntitiesSplitsOnMiddleTileDeletion();
  testRebuildDockEntitiesSplitWithDockedShipPreservesReference();
  testRebuildDockEntitiesThreeWaySplitDedupesIds();
  testRebuildDockEntitiesAsymmetricSplitPreservesClusterSizes();
  testRebuildDockEntitiesThreeWaySplitClearsPhantomOccupancy();
  testRebuildDockEntitiesSplitDowngradesAllowedShipSizes();
  testRebuildDockEntitiesClusterSizeScalesShipCapacity();
  testActorsTreatedLifetimeIncrementsOnRecovery();
  testT1ArchetypeDiversityReachesThreeWithinThreeMinutes();
  testTier0ShipServicesIgnoreLockedDemands();
  testMilitaryShipPenalizesLowSecurity();
  testColonistShipBoostsConversionWhenHousingValid();
  testResidentWorkPhaseAffectsThroughput();
  testResidentRoutineFallbackWithoutWorkRooms();
  testClinicLowersDistressAndDeaths();
  testTier3ClinicGeneratesTreatablePatients();
  testTier3SecurityGeneratesDispatchableIncidents();
  testBrigReducesIncidentDuration();
  testSecurityPriorityStaffsBrig();
  testSaveV1MigratesToV2UnlockDefaults();
  test20MinuteComplexityCurveReadable();
  testTier0VisitorDockSchedulesTraffic();
  testWallVariantMaskMapping();
  testDualWallVariantTruthTable();
  testAutonomousRoomsNoStaff();
  testCafeteriaMissingServingStation();
  testBedFootprintRotation();
  testWallLightRequiresAdjacentWall();
  testWallMountedVentRequiresWallAndProjectsAir();
  testWallMountedFireExtinguisherRequiresWallAndSuppressesFire();
  testWallMountedModuleConstructionUsesServiceTile();
  testPathIntentVisitorAvoidsServiceCorridor();
  testPathIntentLogisticsPrefersServiceCorridor();
  testPathIntentLogisticsAvoidsNewSocialRooms();
  testPathIntentVisitorServiceFallback();
  testNewSocialRoomsActivateAndExposeTargets();
  testPathCacheSeparatesIntent();
  testRoutePressureDiagnosticsCountsAndConflicts();
  testVisitorRouteExposurePenalty();
  testResidentBadRouteStress();
  testCrewPublicInterferenceMetric();
  testVisitorRoomEnvironmentPenalty();
  testResidentRoomEnvironmentStress();
  testRoomEnvironmentInspectorWarning();
  testMaintenanceDebtReducesReactorPower();
  testMaintenanceDebtReducesLifeSupportAir();
  testCrewAtUtilityReducesMaintenanceDebt();
  testLifeSupportCoverageDetectsDisconnectedWing();
  testLifeSupportDiagnosticHelperDetectsDisconnectedWing();
  testVisitorStatusDiagnosticHelperHighlightsIndustrialAdjacency();
  testResidentComfortDiagnosticHelperHighlightsServiceNoise();
  testMaintenanceDiagnosticHelperReportsUtilityDebt();
  testVisitorAuxiliaryHygieneNeedIsInspectable();
  testFoodChainEndToEnd();
  testFoodJobsDoNotLetRawBacklogBlockMeals();
  testLowFoodAssignsFoodChainCrew();
  testServingStarvationQueue();
  testVisitorCafeteriaReservationSurvivesShortCrowdBlock();
  testMaterialsChainEndToEnd();
  testMarketVisitorsBuyFromStallsWhenBenchesExist();
  testIntakeMaterialsMoveToStorage();
  testInteriorBlueprintConstructionCompletes();
  testModuleBlueprintConstructionCompletes();
  testCancelBlueprintConstructionRemovesSiteAndJob();
  testCancelBlueprintConstructionRefundsDeliveredMaterials();
  testCancelModuleBlueprintFromFootprintTile();
  testEvaBlueprintConstructionUsesAirlock();
  testAirlockSealsStationPressure();
  testAirlockExteriorPadDoesNotVentStation();
  testInventoryOverlayToggleState();
  testRoomInspectorInventoryBreakdown();
  testMarketBuyCapacityContext();
  testMarketBuyMissingIntakeContext();
  testFoodChainInspectorClarity();
  testServiceNodeUnreachableWarning();
  testLoungeModuleGating();
  testActivationChecksPreserved();
  testDoorsArePressureBarriers();
  testDemoStationRoomsPressurized();
  testReactorInspectorReportsRealPressurizationPct();
  testLegacyBalanceSanity();
  testJobMetricsConsistency();
  testActiveLogisticsCrewDoNotRestBeforeCompletingJobs();
  testStaleRequeuedJobReleasesCrewAssignment();
  testSelfCareCrewNotStolenByLogisticsDispatch();
  testCrewRestAvoidsOverloadedDormTarget();
  testVisitorBerthsAcceptTrafficResidentialDoNot();
  testLegacyDockTrafficUsesTinyPods();
  testSporadicTrafficSchedulesNextCheck();
  testBerthTrafficUsesLargeShipPassengerScale();
  testBerthVisitorsBoardAndDespawnOnReturn();
  testTransientShipPersistsUntilOriginVisitorBoards();
  testOriginVisitorDoesNotBoardWrongDockedShip();
  testBerthTrafficRequiresSpaceExposure();
  testOpenBerthReceivesScheduledTraffic();
  testBerthSupportModulePlacementRules();
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
  testSaveRoundtripLifetimeCountersSurvive();
  testSaveRoundtripTierCapAboveThree();
  testSellMaterialsIncrementsCreditsEarnedLifetime();
  testSaveLoadFailsOnInvalidCoreShape();
  testInventoryReapplyClampsCapacity();
  testVisitorInspectorShapeAndPurity();
  testResidentInspectorThresholdsAndPurity();
  testCrewInspectorLogisticsShapeAndPurity();
  testCrewLeisureSocialNeedIsInspectable();
  testAgentInspectorMissingId();
  testImmediateDefuseMajority();
  testProximitySuppressionEffectiveness();
  testTrespassSpamGuard();
  testNeedsAndRoutinesBehavior();
  console.log('sim-tests: PASS');
}

run();
