import {
  createInitialState,
  getOperatingSchedule,
  getRoomInspectorAt,
  getUtilityUnderlayTileDiagnostic,
  orderFoodSupply,
  setCrewWatchAssignment,
  setRoom,
  setRoomHousingPolicy,
  setTile,
  setUtilityUnderlayTile,
  tick,
  tryPlaceModule
} from '../src/sim/sim';
import {
  hydrateStateFromSave,
  parseAndMigrateSave,
  serializeSave
} from '../src/sim/save';
import {
  ModuleType,
  ResidentState,
  RoomType,
  TileType,
  VisitorState,
  ZoneType,
  fromIndex,
  toIndex,
  type ItemType,
  type ModuleRotation,
  type StaffRole,
  type StaffRoleCounts,
  type StationState,
  type Visitor
} from '../src/sim/types';

function assertCondition(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function runFor(state: StationState, seconds: number, step = 0.25): void {
  const steps = Math.ceil(seconds / step);
  for (let i = 0; i < steps; i++) tick(state, step);
}

function paintRoom(state: StationState, room: RoomType, x0: number, y0: number, x1: number, y1: number): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const idx = toIndex(x, y, state.width);
      setTile(state, idx, TileType.Floor);
      setRoom(state, idx, room);
    }
  }
  const door = toIndex(x0, y0, state.width);
  setTile(state, door, TileType.Door);
  setRoom(state, door, room);
}

function buildHabitat(state: StationState): void {
  state.controls.paused = false;
  state.controls.simSpeed = 1;
  state.controls.shipsPerCycle = 0;
  state.tiles.fill(TileType.Space);
  state.zones.fill(ZoneType.Public);
  state.rooms.fill(RoomType.None);
  state.roomHousingPolicies.fill('visitor');
  state.modules.fill(ModuleType.None);
  state.moduleInstances = [];
  state.moduleOccupancyByTile.fill(null);
  state.jobs.length = 0;
  state.reservations.length = 0;
  state.itemNodes.length = 0;
  state.visitors.length = 0;
  state.residents.length = 0;
  state.arrivingShips.length = 0;
  state.physicalHoldingQueue.length = 0;
  state.docks.length = 0;
  for (const layer of Object.values(state.utilityUnderlay.layers)) layer.fill(0);
  state.plumbing.floodByTile.fill(0);
  state.plumbing.leaks.length = 0;
  state.unlocks.tier = 5;
  state.unlocks.unlockedIds = ['tier1_sustenance', 'tier2_commerce', 'tier3_logistics'];
  state.unlocks.unlockedAtSec = {
    tier1_sustenance: 0,
    tier2_commerce: 0,
    tier3_logistics: 0
  };

  const x0 = 4;
  const y0 = 4;
  const x1 = 44;
  const y1 = 30;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) setTile(state, toIndex(x, y, state.width), TileType.Floor);
  }
  for (let x = x0; x <= x1; x++) {
    setTile(state, toIndex(x, y0, state.width), TileType.Wall);
    setTile(state, toIndex(x, y1, state.width), TileType.Wall);
  }
  for (let y = y0; y <= y1; y++) {
    setTile(state, toIndex(x0, y, state.width), TileType.Wall);
    setTile(state, toIndex(x1, y, state.width), TileType.Wall);
  }
  // The fixture's station core has to live inside the fixture's station. The
  // authored core sits outside this habitat box, so restoring it as floor left
  // a walkable island in space: crew spawn on the floor tile nearest the core
  // service tile (sim.ts `ensureCrewPool`) and were marooned there, and
  // service reachability seeded from outside the hull.
  const coreTile = toIndex(Math.floor((x0 + x1) / 2), Math.floor((y0 + y1) / 2), state.width);
  state.core.centerTile = coreTile;
  state.core.serviceTile = coreTile;
  state.core.frameTiles = [coreTile];
  setTile(state, coreTile, TileType.Floor);
}

function placeModule(state: StationState, module: ModuleType, x: number, y: number, rotation: ModuleRotation = 0): number {
  const tile = toIndex(x, y, state.width);
  const result = tryPlaceModule(state, module, tile, rotation);
  assertCondition(result.ok, `Module placement failed for ${module} at ${x},${y}: ${result.reason ?? 'unknown'}`);
  return tile;
}

function itemAt(state: StationState, tileIndex: number, itemType: ItemType): number {
  return state.itemNodes.find((node) => node.tileIndex === tileIndex)?.items[itemType] ?? 0;
}

function setItemAt(state: StationState, tileIndex: number, itemType: ItemType, amount: number): void {
  let node = state.itemNodes.find((entry) => entry.tileIndex === tileIndex);
  if (!node) {
    node = {
      tileIndex,
      capacity: Math.max(24, amount),
      items: {}
    };
    state.itemNodes.push(node);
  }
  const existing = state.itemNodes.find((entry) => entry.tileIndex === tileIndex);
  assertCondition(!!existing, `Expected item node at ${tileIndex}.`);
  existing!.items[itemType] = amount;
}

const STAFF_ROLES: StaffRole[] = [
  'captain',
  'sanitation-officer',
  'security-officer',
  'mechanic-officer',
  'industrial-officer',
  'navigation-officer',
  'comms-officer',
  'medical-officer',
  'cook',
  'steward',
  'cargo-handler',
  'cleaner',
  'janitor',
  'botanist',
  'technician',
  'engineer',
  'mechanic',
  'welder',
  'doctor',
  'nurse',
  'security-guard',
  'assistant',
  'eva-specialist',
  'eva-engineer',
  'flight-controller',
  'docking-officer'
];

function roleCounts(partial: Partial<Record<StaffRole, number>>): StaffRoleCounts {
  const counts = Object.fromEntries(STAFF_ROLES.map((role) => [role, 0])) as StaffRoleCounts;
  for (const [role, count] of Object.entries(partial) as Array<[StaffRole, number]>) counts[role] = count;
  return counts;
}

function staffStation(state: StationState, partial: Partial<Record<StaffRole, number>>): void {
  state.crew.roleCounts = roleCounts(partial);
  state.crew.total = Object.values(state.crew.roleCounts).reduce((sum, count) => sum + count, 0);
  tick(state, 0);
  const watch = getOperatingSchedule(state).watch;
  for (const crew of state.crewMembers) {
    crew.shiftBucket = watch;
    crew.recalledUntil = state.now + 300;
    crew.energy = 95;
    crew.hunger = 95;
    crew.hygiene = 95;
    crew.bladder = 95;
    crew.thirst = 95;
  }
}

function spawnVisitor(state: StationState, x: number, y: number, id: number): Visitor {
  const tileIndex = toIndex(x, y, state.width);
  const center = fromIndex(tileIndex, state.width);
  const visitor: Visitor = {
    id,
    x: center.x + 0.5,
    y: center.y + 0.5,
    tileIndex,
    state: VisitorState.ToLeisure,
    path: [],
    speed: 1.8,
    patience: 24,
    eatTimer: 0,
    trespassed: false,
    servedMeal: true,
    carryingMeal: false,
    carryingDrink: false,
    reservedServingTile: null,
    reservedTargetTile: null,
    blockedTicks: 0,
    archetype: 'lounger',
    taxSensitivity: 1,
    spendMultiplier: 1,
    patienceMultiplier: 1,
    primaryPreference: 'lounge',
    spawnedAt: state.now,
    originShipId: null,
    airExposureSec: 0,
    healthState: 'healthy',
    leisureLegsRemaining: 1,
    leisureLegsPlanned: 1,
    lastLeisureKind: null,
    servicePlan: ['drink'],
    completedServices: [],
    activeService: 'drink',
    serviceBlockedSince: null
  };
  state.visitors.push(visitor);
  return visitor;
}

function drawUtilityLine(
  state: StationState,
  kind: 'air-duct' | 'water-pipe',
  x1: number,
  y1: number,
  x2: number,
  y2: number
): void {
  const dx = Math.sign(x2 - x1);
  const dy = Math.sign(y2 - y1);
  if (dx !== 0 && dy !== 0) {
    drawUtilityLine(state, kind, x1, y1, x2, y1);
    drawUtilityLine(state, kind, x2, y1, x2, y2);
    return;
  }
  let x = x1;
  let y = y1;
  while (true) {
    setUtilityUnderlayTile(state, kind, toIndex(x, y, state.width), true);
    if (x === x2 && y === y2) break;
    x += dx;
    y += dy;
  }
}

function setupCoreLifeSupport(state: StationState): number {
  paintRoom(state, RoomType.Reactor, 6, 9, 9, 11);
  paintRoom(state, RoomType.LifeSupport, 6, 6, 9, 8);
  const source = placeModule(state, ModuleType.WaterValve, 7, 7);
  drawUtilityLine(state, 'air-duct', 7, 7, 22, 20);
  return source;
}

function setupFoodRooms(state: StationState): {
  intake: number;
  cold: number;
  prep: number;
  stove: number;
  serving: number;
  serving2: number;
  trayReturn: number;
  washer: number;
} {
  paintRoom(state, RoomType.LogisticsStock, 35, 12, 38, 15);
  paintRoom(state, RoomType.Storage, 30, 12, 33, 15);
  paintRoom(state, RoomType.Kitchen, 19, 10, 28, 16);
  paintRoom(state, RoomType.Cafeteria, 19, 18, 31, 24);
  const intake = placeModule(state, ModuleType.IntakePallet, 36, 13);
  placeModule(state, ModuleType.StorageRack, 31, 13);
  const cold = placeModule(state, ModuleType.ColdStore, 20, 11);
  placeModule(state, ModuleType.Fridge, 23, 11);
  const prep = placeModule(state, ModuleType.PrepCounter, 24, 11);
  const stove = placeModule(state, ModuleType.Stove, 24, 13);
  const washer = placeModule(state, ModuleType.Dishwasher, 21, 15);
  placeModule(state, ModuleType.Sink, 24, 15);
  placeModule(state, ModuleType.FloorDrain, 20, 15);
  const serving = placeModule(state, ModuleType.ServingStation, 20, 19);
  // Two counters and two tables is the public-cafeteria bar: a single counter
  // plus a table is only the crew mess, which visitors are not served from.
  const serving2 = placeModule(state, ModuleType.ServingStation, 25, 22);
  placeModule(state, ModuleType.Table, 23, 19);
  placeModule(state, ModuleType.Table, 27, 19);
  const trayReturn = placeModule(state, ModuleType.TrayReturn, 20, 22);
  tick(state, 0);
  return { intake, cold, prep, stove, serving, serving2, trayReturn, washer };
}

function setupCargoBerth(state: StationState): void {
  for (let y = 9; y <= 13; y++) {
    for (let x = 44; x <= 48; x++) {
      const tile = toIndex(x, y, state.width);
      if (x === 44 && y !== 11) {
        setTile(state, tile, TileType.Wall);
        setRoom(state, tile, RoomType.None);
      } else {
        setTile(state, tile, x === 44 ? TileType.Door : TileType.Floor);
        setRoom(state, tile, RoomType.Berth);
      }
    }
  }
  placeModule(state, ModuleType.Gangway, 48, 11);
  placeModule(state, ModuleType.CustomsCounter, 44, 11);
  placeModule(state, ModuleType.CargoArm, 47, 9);
}

function testFoodSupplyChain(): void {
  const state = createInitialState({ seed: 900101 });
  buildHabitat(state);
  setupCoreLifeSupport(state);
  setupCargoBerth(state);
  const rooms = setupFoodRooms(state);
  staffStation(state, { captain: 1, cook: 2, steward: 2, 'cargo-handler': 2, janitor: 1, engineer: 1 });
  state.metrics.credits = 1000;
  state.metrics.rawFoodStock = 0;
  state.metrics.mealStock = 0;

  const order = orderFoodSupply(state, 0, 24);
  assertCondition(order.ok, `Food supply order should reserve a compatible cargo berth (${order.ok ? 'ok' : order.reason}).`);
  tick(state, 0);
  assertCondition(itemAt(state, rooms.intake, 'rawMeal') === 0 && itemAt(state, rooms.cold, 'rawMeal') === 0, 'Ordering food should not teleport raw meals into storage.');

  runFor(state, 180);

  const rawArrived = state.metrics.rawFoodStock + state.metrics.kitchenRawBuffer + state.metrics.preppedMealStock + state.metrics.mealStock;
  const foodJobs = state.jobs
    .filter((job) => job.itemType === 'rawMeal' || job.itemType === 'preppedMeal' || job.itemType === 'meal')
    .map((job) => `${job.type}:${job.itemType}:${job.state}:${job.fromTile}->${job.toTile}:${job.blockedReason ?? 'open'}`)
    .slice(0, 8)
    .join(' | ');
  const ships = state.arrivingShips
    .map((ship) => `${ship.portManifest?.shipName ?? ship.shipType}:${ship.stage}:${ship.portTurnaround?.phase ?? 'no-turn'}`)
    .join(' | ');
  const cargoLots = state.portOps.cargoLots
    .map((lot) => `${lot.itemType}:${lot.quantity}:${lot.handledQuantity}:${lot.location}`)
    .join(' | ');
  assertCondition(rawArrived > 3, `Food supply should arrive physically and enter the food chain (${rawArrived.toFixed(1)} units seen; ships ${ships || 'none'}; cargo ${cargoLots || 'none'}; jobs ${foodJobs || 'none'}).`);
  assertCondition(
    itemAt(state, rooms.prep, 'preppedMeal') > 0 ||
      itemAt(state, rooms.stove, 'preppedMeal') > 0 ||
      itemAt(state, rooms.stove, 'meal') > 0 ||
      itemAt(state, rooms.serving, 'meal') > 0,
    `Prep/stove/serving fixtures should hold processed food (intake raw ${itemAt(state, rooms.intake, 'rawMeal')}, cold raw ${itemAt(state, rooms.cold, 'rawMeal')}, prep raw ${itemAt(state, rooms.prep, 'rawMeal')}, prep prepped ${itemAt(state, rooms.prep, 'preppedMeal')}, stove raw ${itemAt(state, rooms.stove, 'rawMeal')}, stove prepped ${itemAt(state, rooms.stove, 'preppedMeal')}, stove meal ${itemAt(state, rooms.stove, 'meal')}, serving meal ${itemAt(state, rooms.serving, 'meal')}, jobs ${foodJobs || 'none'}).`
  );
  assertCondition(state.jobs.some((job) => job.type === 'prep' || job.type === 'cook' || job.type === 'wash') || state.usageTotals.meals > 0 || state.metrics.mealStock > 0, 'Food fixtures should create real prep/cook/wash work or completed meals.');

  setItemAt(state, rooms.serving, 'meal', 2);
  setItemAt(state, rooms.serving, 'cleanTray', 2);
  const visitor = spawnVisitor(state, 18, 19, 920101);
  visitor.state = VisitorState.ToCafeteria;
  visitor.archetype = 'diner';
  visitor.primaryPreference = 'cafeteria';
  visitor.activeService = 'meal';
  visitor.servicePlan = ['meal'];
  visitor.servedMeal = false;
  runFor(state, 35);
  assertCondition(
    visitor.servedMeal || state.usageTotals.meals > 0 || state.metrics.mealsServedTotal > 0,
    `A diner should consume served meal stock through the cafeteria pickup (state ${visitor.state}, cafOps ${state.ops.cafeteriasActive}/${state.ops.cafeteriasTotal}, tile ${visitor.tileIndex}, reservedServing ${visitor.reservedServingTile}, reservedTarget ${visitor.reservedTargetTile}, path ${visitor.path.length}, serving meal ${itemAt(state, rooms.serving, 'meal')}, trays ${itemAt(state, rooms.serving, 'cleanTray')}, inspector ${getRoomInspectorAt(state, rooms.serving)?.topBlockedReason ?? 'none'}).`
  );
  runFor(state, 50);
  const trayWasReturnedOrWashed =
    itemAt(state, rooms.trayReturn, 'dirtyTray') > 0 ||
    itemAt(state, rooms.washer, 'dirtyTray') > 0 ||
    itemAt(state, rooms.washer, 'cleanTray') > 0 ||
    itemAt(state, rooms.serving, 'cleanTray') >= 2;
  assertCondition(
    trayWasReturnedOrWashed,
    `Eating should return dirty trays for washing instead of deleting them (tray return ${itemAt(state, rooms.trayReturn, 'dirtyTray')}, washer dirty ${itemAt(state, rooms.washer, 'dirtyTray')}, washer clean ${itemAt(state, rooms.washer, 'cleanTray')}, serving trays ${itemAt(state, rooms.serving, 'cleanTray')}, meals ${state.usageTotals.meals}, served ${state.metrics.mealsServedTotal}, trayModules ${state.moduleInstances.filter((module) => module.type === ModuleType.TrayReturn).map((module) => `${module.originTile}:${state.rooms[module.originTile]}`).join('|')}, trayNode ${state.itemNodes.some((node) => node.tileIndex === rooms.trayReturn)}, dirt ${state.dirtByTile[visitor.tileIndex] ?? 0}).`
  );
}

function testCantinaLoungePopulationDifferences(): void {
  const state = createInitialState({ seed: 900102 });
  buildHabitat(state);
  setupCoreLifeSupport(state);
  paintRoom(state, RoomType.Lounge, 12, 18, 17, 23);
  paintRoom(state, RoomType.RecHall, 12, 24, 17, 28);
  paintRoom(state, RoomType.Cantina, 20, 18, 27, 23);
  placeModule(state, ModuleType.Couch, 13, 19);
  placeModule(state, ModuleType.GameStation, 14, 21);
  placeModule(state, ModuleType.RecUnit, 13, 25);
  const bar = placeModule(state, ModuleType.BarCounter, 21, 19);
  placeModule(state, ModuleType.Tap, 23, 19);
  placeModule(state, ModuleType.Bench, 22, 21);
  tick(state, 0);
  setItemAt(state, bar, 'rawMaterial', 8);
  staffStation(state, { captain: 1, steward: 2, assistant: 2 });
  const steward = state.crewMembers.find((crew) => crew.staffRole === 'steward');
  assertCondition(!!steward, 'Cantina scenario should have a steward.');
  if (steward) {
    steward.tileIndex = bar;
    steward.x = fromIndex(bar, state.width).x + 0.5;
    steward.y = fromIndex(bar, state.width).y + 0.5;
    steward.assignedSystem = 'lounge';
    steward.homeWorkplaceTile = bar;
    steward.assignmentStickyUntil = state.now + 300;
  }

  for (let i = 0; i < 5; i++) spawnVisitor(state, 19, 20 + (i % 2), 930100 + i);
  const residentTile = toIndex(12, 18, state.width);
  const residentPos = fromIndex(residentTile, state.width);
  state.residents.push({
    id: 930200,
    x: residentPos.x + 0.5,
    y: residentPos.y + 0.5,
    tileIndex: residentTile,
    path: [],
    speed: 1.8,
    hunger: 95,
    energy: 90,
    hygiene: 90,
    social: 20,
    safety: 70,
    stress: 20,
    routinePhase: 'socialize',
    role: 'none',
    roleAffinity: {},
    state: ResidentState.ToLeisure,
    actionTimer: 0,
    retargetAt: 0,
    reservedTargetTile: null,
    homeShipId: null,
    homeDockId: null,
    housingUnitId: null,
    bedModuleId: null,
    satisfaction: 60,
    leaveIntent: 0,
    blockedTicks: 0,
    airExposureSec: 0,
    healthState: 'healthy',
    agitation: 0,
    activeIncidentId: null,
    confrontationUntil: 0
  });
  const residentInitialSocial = state.residents[0]?.social ?? 20;

  let peakCantinaPressure: 'low' | 'medium' | 'high' = 'low';
  const pressureRank = { low: 0, medium: 1, high: 2 };
  runFor(state, 45);
  const inspector = getRoomInspectorAt(state, bar);
  assertCondition(!!inspector?.cantinaLoad, 'Cantina inspector should expose load/capacity.');
  if (inspector?.cantinaLoad) {
    peakCantinaPressure = inspector.cantinaLoad.pressure;
    assertCondition(inspector.cantinaLoad.pickupSlots >= 2, 'Bar counter should expose multiple pickup slots.');
    assertCondition(inspector.cantinaLoad.seatsCapacity >= 2, 'Cantina seating should be separate from bar pickup.');
    assertCondition(
      inspector.cantinaLoad.stewardCount >= 1,
      `Steward presence should be visible in cantina load (${state.crewMembers.map((crew) => `${crew.id}:${crew.staffRole}:${crew.tileIndex}:${crew.homeWorkplaceTile}:${crew.assignedSystem}:${crew.resting}`).join('|')}; bar ${bar}; load ${JSON.stringify(inspector.cantinaLoad)}).`
    );
  }
  assertCondition(
    state.visitors.some((visitor) => visitor.completedServices.includes('drink')) ||
      state.usageTotals.visitorLeisureEntries.cantina > 0,
    'Visitors should complete real drink service.'
  );
  assertCondition(itemAt(state, bar, 'rawMaterial') < 8, 'Cantina drinks should consume stocked raw materials.');
  assertCondition(
    pressureRank[peakCantinaPressure] >= pressureRank.medium ||
      (inspector?.cantinaLoad?.seatsUsed ?? 0) > 0 ||
      state.usageTotals.visitorLeisureEntries.cantina > 0 ||
      state.visitors.some((visitor) => visitor.completedServices.includes('drink')),
    'Cantina load should expose pressure, occupied seats, or completed service activity for a crowd.'
  );
  assertCondition(
    state.visitors.some((visitor) => visitor.lastLeisureKind === 'cantina' || visitor.completedServices.includes('drink')),
    'Visitor preferences should drive a distinct cantina drink stop.'
  );
  assertCondition(
    state.residents.some((resident) => resident.state === ResidentState.Leisure || resident.reservedTargetTile !== null || resident.social >= residentInitialSocial + 12),
    `Resident social need should use lounge/rec/cantina capacity rather than visitor-only flow (${state.residents.map((resident) => `${resident.id}:${resident.state}:${resident.routinePhase}:${resident.social}:${resident.reservedTargetTile}:${resident.path.length}:${state.rooms[resident.tileIndex]}`).join('|')}).`
  );
}

function testPlumbingHygieneLeaks(): void {
  const state = createInitialState({ seed: 900103 });
  buildHabitat(state);
  const source = setupCoreLifeSupport(state);
  paintRoom(state, RoomType.Hygiene, 19, 18, 24, 23);
  const toilet = placeModule(state, ModuleType.Toilet, 20, 19);
  const shower = placeModule(state, ModuleType.Shower, 21, 19);
  const sink = placeModule(state, ModuleType.Sink, 22, 19);
  const drain = placeModule(state, ModuleType.FloorDrain, 20, 21);
  drawUtilityLine(state, 'water-pipe', 7, 7, 20, 19);
  drawUtilityLine(state, 'water-pipe', 20, 19, 22, 19);
  drawUtilityLine(state, 'water-pipe', 20, 19, 20, 21);
  drawUtilityLine(state, 'water-pipe', 20, 21, 22, 21);
  tick(state, 0);

  const sinkDiagnostic = getUtilityUnderlayTileDiagnostic(state, 22, 19, 'water-pipe');
  assertCondition(!!sinkDiagnostic?.powered, 'Water overlay should show powered potable service at sink.');
  assertCondition(state.metrics.potableNetworkPoweredFixtures >= 4, 'Potable network metrics should count connected fixtures.');
  assertCondition([source, toilet, shower, sink, drain].every((tile) => tile >= 0), 'Plumbing scenario should use real fixture/source tiles.');

  state.plumbing.leaks.push({
    id: state.plumbing.nextLeakId++,
    tileIndex: toilet,
    fixtureTile: toilet,
    severity: 1,
    createdAt: state.now,
    isolated: false,
    repairJobId: null
  });
  staffStation(state, { captain: 1, engineer: 1, mechanic: 1, janitor: 1, cleaner: 1 });
  runFor(state, 2);
  assertCondition(state.metrics.activePlumbingLeaks === 1, 'Leak metrics should show an active plumbing leak.');
  assertCondition(state.metrics.floodedTiles > 0 && state.metrics.wastewaterBacklog > 0, 'Leak should create visible flooding/wastewater.');
  assertCondition(state.maintenanceDebts.some((debt) => debt.domain === 'plumbing'), 'Leak should create plumbing maintenance debt.');
  assertCondition(state.jobs.some((job) => job.type === 'repair' && job.repairTargetKey?.includes('plumbing')), 'Leak should enqueue a local repair job.');
  placeModule(state, ModuleType.WaterValve, 22, 21);
  runFor(state, 0.5);
  assertCondition(state.plumbing.leaks[0]?.isolated === true, 'Nearby water valve should locally isolate the leak.');

  const debt = state.maintenanceDebts.find((entry) => entry.domain === 'plumbing');
  assertCondition(!!debt, 'Plumbing repair debt should exist before completion.');
  if (debt) debt.debt = 0;
  runFor(state, 0.5);
  assertCondition(state.plumbing.leaks.length === 0, 'Cleared plumbing debt should remove the leak.');
}

function testQuartersRecoveryAndWatchRhythm(): void {
  const state = createInitialState({ seed: 900104 });
  buildHabitat(state);
  setupCoreLifeSupport(state);
  paintRoom(state, RoomType.Dorm, 12, 10, 23, 15);
  const firstBed = placeModule(state, ModuleType.Bed, 13, 11);
  placeModule(state, ModuleType.Bed, 16, 11);
  placeModule(state, ModuleType.Bunk, 19, 11);
  placeModule(state, ModuleType.Locker, 13, 13);
  placeModule(state, ModuleType.Locker, 16, 13);
  setRoomHousingPolicy(state, toIndex(12, 10, state.width), 'crew');
  state.zones[firstBed] = ZoneType.Restricted;
  staffStation(state, { captain: 1, cook: 1, steward: 1, engineer: 1, assistant: 1 });
  state.crewMembers.forEach((crew, index) => {
    crew.energy = index === 0 ? 8 : 45;
    crew.shiftBucket = (index % 3) as 0 | 1 | 2;
  });
  tick(state, 0);

  const assigned = state.crewMembers.filter((crew) => crew.assignedSleepTile !== null);
  assertCondition(assigned.length >= 4, `Crew should receive assigned bed/bunk slots (${assigned.length}).`);
  assertCondition(new Set(assigned.map((crew) => crew.assignedSleepTile)).size === assigned.length, 'Assigned sleep slots should be exclusive.');
  const beforeEnergy = state.crewMembers[0]?.energy ?? 0;
  runFor(state, 45);
  assertCondition(state.crewMembers[0]?.resting || (state.crewMembers[0]?.energy ?? 0) > beforeEnergy, 'Low-energy crew should enter a real rest/recovery flow.');
  assertCondition(state.metrics.assignedSleepSlots >= 4, 'Metrics should expose assigned sleep slot count.');
  assertCondition(state.metrics.improvisedRestingCrew === 0, 'Enough quarters should avoid improvised rest.');

  const schedule = getOperatingSchedule(state);
  assertCondition(['ALPHA', 'BETA', 'GAMMA'].includes(schedule.watchName), 'Operating schedule should expose Alpha/Beta/Gamma watch names.');
  const crew = state.crewMembers[0];
  const nextWatch = ((schedule.watch + 1) % 3) as 0 | 1 | 2;
  assertCondition(setCrewWatchAssignment(state, crew.id, nextWatch), 'Crew watch assignment should be adjustable per person.');
  tick(state, 0);
  assertCondition(crew.shiftBucket === nextWatch, 'Per-person watch change should persist through the sim coordinator.');
}

function testLivingStationSaveRoundTrip(): void {
  const state = createInitialState({ seed: 900105 });
  buildHabitat(state);
  setupCoreLifeSupport(state);
  paintRoom(state, RoomType.Dorm, 12, 10, 18, 14);
  placeModule(state, ModuleType.Bed, 13, 11);
  staffStation(state, { captain: 1, assistant: 1 });
  tick(state, 0);
  state.plumbing.leaks.push({
    id: state.plumbing.nextLeakId++,
    tileIndex: toIndex(7, 7, state.width),
    fixtureTile: toIndex(7, 7, state.width),
    severity: 0.4,
    createdAt: state.now,
    isolated: false,
    repairJobId: null
  });
  state.plumbing.floodByTile[toIndex(7, 7, state.width)] = 12;
  const payload = serializeSave('living-station-scenario', state, 'focused-sim');
  const parsed = parseAndMigrateSave(payload);
  assertCondition(parsed.ok, 'Living-station save should parse after migrations.');
  if (!parsed.ok) return;
  const restored = hydrateStateFromSave(parsed.save);
  assertCondition(restored.state.plumbing.leaks.length === 1, 'Plumbing leaks should survive save roundtrip.');
  assertCondition(restored.state.plumbing.floodByTile[toIndex(7, 7, restored.state.width)] > 0, 'Plumbing flood overlay should survive save roundtrip.');
  assertCondition(restored.state.crewMembers.some((crew) => crew.assignedSleepTile !== null), 'Assigned sleep slots should survive save roundtrip.');
}

function buildLivingStationShowcasePayload(): string {
  const state = createInitialState({ seed: 900199 });
  buildHabitat(state);
  setupCoreLifeSupport(state);
  setupCargoBerth(state);
  const food = setupFoodRooms(state);

  paintRoom(state, RoomType.Dorm, 6, 13, 17, 17);
  placeModule(state, ModuleType.Bed, 7, 14);
  placeModule(state, ModuleType.Bed, 10, 14);
  placeModule(state, ModuleType.Bunk, 13, 14);
  placeModule(state, ModuleType.Locker, 7, 16);
  placeModule(state, ModuleType.Locker, 10, 16);
  setRoomHousingPolicy(state, toIndex(6, 13, state.width), 'crew');

  paintRoom(state, RoomType.Lounge, 7, 19, 14, 22);
  paintRoom(state, RoomType.RecHall, 7, 24, 14, 28);
  paintRoom(state, RoomType.Cantina, 33, 18, 40, 23);
  placeModule(state, ModuleType.Couch, 8, 20);
  placeModule(state, ModuleType.GameStation, 11, 20);
  placeModule(state, ModuleType.RecUnit, 8, 25);
  const bar = placeModule(state, ModuleType.BarCounter, 34, 19);
  placeModule(state, ModuleType.Tap, 36, 19);
  placeModule(state, ModuleType.Bench, 35, 21);

  paintRoom(state, RoomType.Hygiene, 33, 25, 39, 28);
  const toilet = placeModule(state, ModuleType.Toilet, 34, 26);
  placeModule(state, ModuleType.Shower, 35, 26);
  placeModule(state, ModuleType.Sink, 36, 26);
  placeModule(state, ModuleType.FloorDrain, 34, 27);
  placeModule(state, ModuleType.WaterValve, 37, 27);
  drawUtilityLine(state, 'water-pipe', 7, 7, 24, 15);
  drawUtilityLine(state, 'water-pipe', 24, 15, 36, 26);
  drawUtilityLine(state, 'water-pipe', 36, 26, 37, 27);
  drawUtilityLine(state, 'air-duct', 7, 7, 36, 26);

  staffStation(state, {
    captain: 1,
    cook: 2,
    steward: 3,
    'cargo-handler': 2,
    engineer: 2,
    mechanic: 1,
    janitor: 1,
    cleaner: 1,
    assistant: 2
  });
  const steward = state.crewMembers.find((crew) => crew.staffRole === 'steward');
  if (steward) {
    steward.tileIndex = bar;
    steward.x = fromIndex(bar, state.width).x + 0.5;
    steward.y = fromIndex(bar, state.width).y + 0.5;
    steward.homeWorkplaceTile = bar;
    steward.assignmentStickyUntil = state.now + 600;
  }

  tick(state, 0);
  setItemAt(state, food.serving, 'meal', 18);
  setItemAt(state, food.serving, 'cleanTray', 24);
  setItemAt(state, food.serving2, 'meal', 18);
  setItemAt(state, food.serving2, 'cleanTray', 24);
  setItemAt(state, food.trayReturn, 'dirtyTray', 4);
  setItemAt(state, food.cold, 'rawMeal', 18);
  setItemAt(state, food.prep, 'rawMeal', 8);
  setItemAt(state, bar, 'rawMaterial', 10);
  state.metrics.credits = 1200;
  orderFoodSupply(state, 0, 24);

  for (let i = 0; i < 6; i++) spawnVisitor(state, 32, 20 + (i % 2), 940000 + i);
  const diner = spawnVisitor(state, 18, 19, 940100);
  diner.state = VisitorState.ToCafeteria;
  diner.archetype = 'diner';
  diner.primaryPreference = 'cafeteria';
  diner.servedMeal = false;
  diner.activeService = 'meal';
  diner.servicePlan = ['meal'];

  const residentTile = toIndex(8, 19, state.width);
  const residentPos = fromIndex(residentTile, state.width);
  state.residents.push({
    id: 940200,
    x: residentPos.x + 0.5,
    y: residentPos.y + 0.5,
    tileIndex: residentTile,
    path: [],
    speed: 1.8,
    hunger: 90,
    energy: 90,
    hygiene: 72,
    social: 18,
    safety: 70,
    stress: 22,
    routinePhase: 'socialize',
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
    satisfaction: 62,
    leaveIntent: 0,
    blockedTicks: 0,
    airExposureSec: 0,
    healthState: 'healthy',
    agitation: 0,
    activeIncidentId: null,
    confrontationUntil: 0
  });

  state.plumbing.leaks.push({
    id: state.plumbing.nextLeakId++,
    tileIndex: toilet,
    fixtureTile: toilet,
    severity: 0.7,
    createdAt: state.now,
    isolated: false,
    repairJobId: null
  });
  runFor(state, 35);
  state.controls.paused = true;
  state.controls.diagnosticOverlay = 'utility-underlay';
  return serializeSave('Living Station Facilities Showcase', state, 'showcase');
}

const tests: Array<[string, () => void]> = [
  ['food-supply-chain', testFoodSupplyChain],
  ['cantina-lounge-population', testCantinaLoungePopulationDifferences],
  ['plumbing-hygiene-leaks', testPlumbingHygieneLeaks],
  ['quarters-watch-recovery', testQuartersRecoveryAndWatchRhythm],
  ['living-station-save-roundtrip', testLivingStationSaveRoundTrip]
];

declare const process: { env: Record<string, string | undefined> } | undefined;
declare const require: ((name: string) => { writeFileSync: (path: string, data: string, encoding: string) => void }) | undefined;

const showcasePath = typeof process !== 'undefined' ? process.env.LIVING_STATION_SHOWCASE_PATH : undefined;
if (showcasePath) {
  const fs = require?.('fs');
  if (!fs) throw new Error('fs unavailable for showcase generation');
  fs.writeFileSync(showcasePath, buildLivingStationShowcasePayload(), 'utf8');
  console.log(`wrote ${showcasePath}`);
} else {
  for (const [name, test] of tests) {
    test();
    console.log(`ok ${name}`);
  }
}
