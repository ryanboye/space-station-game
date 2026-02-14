import { findPath } from './path';
import {
  type ArrivingShip,
  GRID_HEIGHT,
  GRID_WIDTH,
  type CrewMember,
  type CrewRole,
  type Resident,
  ResidentState,
  type RoomDiagnostic,
  RoomType,
  type ShipSize,
  TileType,
  VisitorState,
  ZoneType,
  clamp,
  fromIndex,
  inBounds,
  isWalkable,
  makeRng,
  toIndex,
  type StationState,
  type Visitor
} from './types';

const BASE_CAPACITY = 30;
const CYCLE_DURATION = 15;
const MAX_SHIPS_PER_CYCLE = 3;
const MAX_OCCUPANTS_PER_TILE = 4;

const CREW_PER_CAFETERIA = 1;
const CREW_PER_SECURITY = 2;
const CREW_PER_REACTOR = 1;
const CREW_PER_HYGIENE = 1;
const CREW_PER_HYDROPONICS = 1;
const CREW_PER_LIFE_SUPPORT = 1;

const BASE_POWER_SUPPLY = 25;
const POWER_PER_REACTOR = 22;
const SHIP_APPROACH_TIME = 2;
const SHIP_DOCKED_TIME = 2;
const SHIP_DEPART_TIME = 2;
const SHIP_MAX_DOCKED_TIME = 28;
const MAX_DINERS_PER_CAF_TILE = 3;

const MATERIAL_COST: Record<TileType, number> = {
  [TileType.Space]: 0,
  [TileType.Floor]: 2,
  [TileType.Wall]: 3,
  [TileType.Dock]: 10,
  [TileType.Cafeteria]: 2,
  [TileType.Reactor]: 4,
  [TileType.Security]: 3,
  [TileType.Door]: 2
};

const SHIP_MIN_DOCK_AREA: Record<ShipSize, number> = {
  small: 2,
  medium: 4,
  large: 7
};

const SHIP_BASE_PASSENGERS: Record<ShipSize, number> = {
  small: 6,
  medium: 11,
  large: 17
};
const PAYROLL_PERIOD = 30;
const PAYROLL_PER_CREW = 0.32;
const HIRE_COST = 14;
const LOGISTICS_RESERVE_MAX = 2;

function randomInt(min: number, max: number, rng: () => number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function tileCenter(index: number, width: number): { x: number; y: number } {
  const p = fromIndex(index, width);
  return { x: p.x + 0.5, y: p.y + 0.5 };
}

function chooseNearestPath(
  state: StationState,
  start: number,
  targets: number[],
  allowRestricted: boolean
): number[] | null {
  let best: number[] | null = null;
  for (const target of targets) {
    const path = findPath(state, start, target, allowRestricted);
    if (!path) continue;
    if (!best || path.length < best.length) {
      best = path;
    }
  }
  // Fallback: if strict zoning blocks all routes, allow restricted traversal.
  if (!best && !allowRestricted) {
    for (const target of targets) {
      const path = findPath(state, start, target, true);
      if (!path) continue;
      if (!best || path.length < best.length) {
        best = path;
      }
    }
  }
  return best;
}

function collectTiles(state: StationState, tile: TileType): number[] {
  const out: number[] = [];
  for (let i = 0; i < state.tiles.length; i++) {
    if (state.tiles[i] === tile) out.push(i);
  }
  return out;
}

function collectRooms(state: StationState, room: RoomType): number[] {
  const out: number[] = [];
  for (let i = 0; i < state.rooms.length; i++) {
    if (state.rooms[i] === room && isWalkable(state.tiles[i])) out.push(i);
  }
  return out;
}

function collectIdleWalkTiles(state: StationState): number[] {
  const out: number[] = [];
  for (let i = 0; i < state.tiles.length; i++) {
    if (state.tiles[i] !== TileType.Floor) continue;
    if (state.rooms[i] !== RoomType.None) continue;
    out.push(i);
  }
  return out;
}

function isCafeteriaQueueSpot(state: StationState, idx: number): boolean {
  if (!isWalkable(state.tiles[idx])) return false;
  if (state.rooms[idx] === RoomType.Cafeteria) return false;
  const p = fromIndex(idx, state.width);
  const deltas = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ];
  for (const [dx, dy] of deltas) {
    const nx = p.x + dx;
    const ny = p.y + dy;
    if (!inBounds(nx, ny, state.width, state.height)) continue;
    const ni = toIndex(nx, ny, state.width);
    if (state.rooms[ni] === RoomType.Cafeteria && isWalkable(state.tiles[ni])) return true;
  }
  return false;
}

function collectCafeteriaQueueSpots(state: StationState): number[] {
  const out: number[] = [];
  for (let i = 0; i < state.tiles.length; i++) {
    if (isCafeteriaQueueSpot(state, i)) out.push(i);
  }
  return out;
}

function roomClusters(state: StationState, room: RoomType): number[][] {
  const roomTiles = collectRooms(state, room);
  const remaining = new Set<number>(roomTiles);
  const clusters: number[][] = [];
  while (remaining.size > 0) {
    const seed = remaining.values().next().value as number;
    remaining.delete(seed);
    const queue = [seed];
    const cluster = [seed];
    for (let qi = 0; qi < queue.length; qi++) {
      const idx = queue[qi];
      const p = fromIndex(idx, state.width);
      const deltas = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1]
      ];
      for (const [dx, dy] of deltas) {
        const nx = p.x + dx;
        const ny = p.y + dy;
        if (!inBounds(nx, ny, state.width, state.height)) continue;
        const ni = toIndex(nx, ny, state.width);
        if (!remaining.has(ni)) continue;
        remaining.delete(ni);
        queue.push(ni);
        cluster.push(ni);
      }
    }
    clusters.push(cluster);
  }
  return clusters;
}

function getDockBays(state: StationState): number[][] {
  const docks = collectTiles(state, TileType.Dock);
  const remaining = new Set<number>(docks);
  const bays: number[][] = [];

  while (remaining.size > 0) {
    const seed = remaining.values().next().value as number;
    remaining.delete(seed);
    const queue = [seed];
    const bay: number[] = [seed];

    for (let qi = 0; qi < queue.length; qi++) {
      const idx = queue[qi];
      const p = fromIndex(idx, state.width);
      const deltas = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1]
      ];
      for (const [dx, dy] of deltas) {
        const nx = p.x + dx;
        const ny = p.y + dy;
        if (!inBounds(nx, ny, state.width, state.height)) continue;
        const ni = toIndex(nx, ny, state.width);
        if (!remaining.has(ni)) continue;
        remaining.delete(ni);
        queue.push(ni);
        bay.push(ni);
      }
    }
    bays.push(bay);
  }

  return bays;
}

function bayOverlapsShip(bayTiles: number[], ship: ArrivingShip): boolean {
  const shipTiles = new Set(ship.bayTiles);
  for (const t of bayTiles) {
    if (shipTiles.has(t)) return true;
  }
  return false;
}

function preferredShipSize(rng: () => number): ShipSize {
  const roll = rng();
  if (roll < 0.5) return 'small';
  if (roll < 0.85) return 'medium';
  return 'large';
}

function shipSizeForBay(area: number, wanted: ShipSize): ShipSize | null {
  const order: ShipSize[] =
    wanted === 'large' ? ['large', 'medium', 'small'] : wanted === 'medium' ? ['medium', 'small'] : ['small'];
  for (const size of order) {
    if (area >= SHIP_MIN_DOCK_AREA[size]) return size;
  }
  return null;
}

function hasAdjacentDoor(state: StationState, tile: number): boolean {
  const p = fromIndex(tile, state.width);
  const deltas = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ];
  for (const [dx, dy] of deltas) {
    const nx = p.x + dx;
    const ny = p.y + dy;
    if (!inBounds(nx, ny, state.width, state.height)) continue;
    const ni = toIndex(nx, ny, state.width);
    if (state.tiles[ni] === TileType.Door) return true;
  }
  return false;
}

function doorQualifiedTilesForRoom(state: StationState, room: RoomType): Set<number> {
  const roomTiles = collectRooms(state, room);
  const unvisited = new Set<number>(roomTiles);
  const qualified = new Set<number>();

  while (unvisited.size > 0) {
    const seed = unvisited.values().next().value as number;
    unvisited.delete(seed);
    const queue = [seed];
    const component: number[] = [seed];
    let hasDoor = hasAdjacentDoor(state, seed);

    for (let qi = 0; qi < queue.length; qi++) {
      const idx = queue[qi];
      const p = fromIndex(idx, state.width);
      const deltas = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1]
      ];
      for (const [dx, dy] of deltas) {
        const nx = p.x + dx;
        const ny = p.y + dy;
        if (!inBounds(nx, ny, state.width, state.height)) continue;
        const ni = toIndex(nx, ny, state.width);
        if (!unvisited.has(ni)) continue;
        if (state.rooms[ni] !== room) continue;
        unvisited.delete(ni);
        queue.push(ni);
        component.push(ni);
        if (!hasDoor && hasAdjacentDoor(state, ni)) hasDoor = true;
      }
    }

    if (hasDoor) {
      for (const tile of component) qualified.add(tile);
    }
  }

  return qualified;
}

function computePressurization(state: StationState): void {
  const n = state.tiles.length;
  const vacuumReachable = new Array<boolean>(n).fill(false);
  const queue: number[] = [];
  const pushIfOpen = (idx: number): void => {
    if (vacuumReachable[idx]) return;
    if (state.tiles[idx] === TileType.Wall) return;
    vacuumReachable[idx] = true;
    queue.push(idx);
  };

  for (let x = 0; x < state.width; x++) {
    pushIfOpen(toIndex(x, 0, state.width));
    pushIfOpen(toIndex(x, state.height - 1, state.width));
  }
  for (let y = 0; y < state.height; y++) {
    pushIfOpen(toIndex(0, y, state.width));
    pushIfOpen(toIndex(state.width - 1, y, state.width));
  }

  for (let qi = 0; qi < queue.length; qi++) {
    const idx = queue[qi];
    const p = fromIndex(idx, state.width);
    const deltas = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ];
    for (const [dx, dy] of deltas) {
      const nx = p.x + dx;
      const ny = p.y + dy;
      if (!inBounds(nx, ny, state.width, state.height)) continue;
      const ni = toIndex(nx, ny, state.width);
      if (vacuumReachable[ni]) continue;
      if (state.tiles[ni] === TileType.Wall) continue;
      vacuumReachable[ni] = true;
      queue.push(ni);
    }
  }

  let builtWalkable = 0;
  let leakingWalkable = 0;
  for (let i = 0; i < n; i++) {
    const isBuiltWalkable = state.tiles[i] !== TileType.Space && state.tiles[i] !== TileType.Wall;
    const pressurized = isBuiltWalkable && !vacuumReachable[i];
    state.pressurized[i] = pressurized;
    if (isBuiltWalkable) {
      builtWalkable++;
      if (!pressurized) leakingWalkable++;
    }
  }

  state.metrics.leakingTiles = leakingWalkable;
  state.metrics.pressurizationPct =
    builtWalkable > 0 ? ((builtWalkable - leakingWalkable) / builtWalkable) * 100 : 0;
}

function registerIncident(state: StationState, amount = 1): void {
  state.metrics.incidentsTotal += amount;
  state.incidentHeat += amount;
}

function makeCrewMember(id: number, tileIndex: number, width: number): CrewMember {
  return {
    id,
    ...tileCenter(tileIndex, width),
    tileIndex,
    path: [],
    speed: 2.4,
    role: 'idle',
    targetTile: null,
    retargetAt: 0,
    energy: 100,
    resting: false,
    carryingRawFood: 0
  };
}

function makeResident(id: number, tileIndex: number, width: number): Resident {
  return {
    id,
    ...tileCenter(tileIndex, width),
    tileIndex,
    path: [],
    speed: 1.8,
    hunger: 80,
    energy: 85,
    hygiene: 75,
    stress: 10,
    state: ResidentState.Idle,
    actionTimer: 0,
    retargetAt: 0
  };
}

function spawnVisitor(state: StationState, dockIndex: number): void {
  const visitor: Visitor = {
    id: state.spawnCounter++,
    ...tileCenter(dockIndex, state.width),
    tileIndex: dockIndex,
    state: VisitorState.ToCafeteria,
    path: [],
    speed: 2.1,
    patience: 0,
    eatTimer: 0,
    trespassed: false,
    servedMeal: false
  };
  state.visitors.push(visitor);
}

function ensureCrewPool(state: StationState): void {
  if (state.crewMembers.length === state.crew.total) return;

  const docks = collectTiles(state, TileType.Dock);
  const fallbackTiles = docks.length > 0 ? docks : collectTiles(state, TileType.Floor);
  const spawnTile = fallbackTiles[0] ?? 0;

  while (state.crewMembers.length < state.crew.total) {
    state.crewMembers.push(makeCrewMember(state.crewSpawnCounter++, spawnTile, state.width));
  }
  if (state.crewMembers.length > state.crew.total) {
    state.crewMembers.length = state.crew.total;
  }
}

function ensureResidentPopulation(state: StationState): void {
  const docks = collectTiles(state, TileType.Dock);
  const fallbackTiles = docks.length > 0 ? docks : collectTiles(state, TileType.Floor);
  const spawnTile = fallbackTiles[0] ?? 0;

  const baseCapacity = 0;
  const dormCapacity = activeRoomTargets(state, RoomType.Dorm).length * 2;
  const targetResidents = clamp(baseCapacity + dormCapacity, 0, 40);

  while (state.residents.length < targetResidents) {
    state.residents.push(makeResident(state.residentSpawnCounter++, spawnTile, state.width));
  }
  if (state.residents.length > targetResidents) {
    state.residents.length = targetResidents;
  }
}

function assignCrewJobs(state: StationState): void {
  const reactors = collectRooms(state, RoomType.Reactor);
  const cafeterias = collectRooms(state, RoomType.Cafeteria);
  const security = collectRooms(state, RoomType.Security);
  const hygiene = collectRooms(state, RoomType.Hygiene);
  const hydroponics = collectRooms(state, RoomType.Hydroponics);
  const lifeSupport = collectRooms(state, RoomType.LifeSupport);
  const dorms = collectRooms(state, RoomType.Dorm);

  const floors = collectIdleWalkTiles(state);
  const docks = collectTiles(state, TileType.Dock);
  const idleTargets = floors.length > 0 ? floors : docks;

  const jobsBySystem = new Map<string, Array<{ role: CrewRole; tileIndex: number }>>();
  jobsBySystem.set('reactor', []);
  jobsBySystem.set('cafeteria', []);
  jobsBySystem.set('security', []);
  jobsBySystem.set('hygiene', []);
  jobsBySystem.set('hydroponics', []);
  jobsBySystem.set('life-support', []);

  for (const tile of reactors) {
    for (let i = 0; i < CREW_PER_REACTOR; i++) jobsBySystem.get('reactor')!.push({ role: 'reactor', tileIndex: tile });
  }
  for (const tile of cafeterias) {
    for (let i = 0; i < CREW_PER_CAFETERIA; i++) jobsBySystem.get('cafeteria')!.push({ role: 'cafeteria', tileIndex: tile });
  }
  for (const tile of security) {
    for (let i = 0; i < CREW_PER_SECURITY; i++) jobsBySystem.get('security')!.push({ role: 'security', tileIndex: tile });
  }
  for (const tile of hygiene) {
    for (let i = 0; i < CREW_PER_HYGIENE; i++) jobsBySystem.get('hygiene')!.push({ role: 'cafeteria', tileIndex: tile });
  }
  for (const tile of hydroponics) {
    for (let i = 0; i < CREW_PER_HYDROPONICS; i++) jobsBySystem.get('hydroponics')!.push({ role: 'reactor', tileIndex: tile });
  }
  for (const tile of lifeSupport) {
    for (let i = 0; i < CREW_PER_LIFE_SUPPORT; i++) jobsBySystem.get('life-support')!.push({ role: 'reactor', tileIndex: tile });
  }

  const priorityOrderByFocus: Record<StationState['controls']['crewPriority'], string[]> = {
    balanced: ['reactor', 'life-support', 'cafeteria', 'hydroponics', 'security', 'hygiene'],
    cafeteria: ['cafeteria', 'hydroponics', 'reactor', 'life-support', 'security', 'hygiene'],
    hydroponics: ['hydroponics', 'cafeteria', 'reactor', 'life-support', 'security', 'hygiene'],
    security: ['security', 'reactor', 'life-support', 'cafeteria', 'hydroponics', 'hygiene'],
    'life-support': ['life-support', 'reactor', 'cafeteria', 'hydroponics', 'security', 'hygiene'],
    reactor: ['reactor', 'life-support', 'cafeteria', 'hydroponics', 'security', 'hygiene']
  };
  const orderedKeys = priorityOrderByFocus[state.controls.crewPriority];
  const jobs: Array<{ role: CrewRole; tileIndex: number }> = [];
  for (const key of orderedKeys) {
    jobs.push(...(jobsBySystem.get(key) ?? []));
  }

  const availableCrew = state.crewMembers.filter((c) => !c.resting);
  const logisticsNeeded =
    collectRooms(state, RoomType.Hydroponics).length > 0 &&
    collectRooms(state, RoomType.Cafeteria).length > 0 &&
    state.metrics.rawFoodStock > 0.5 &&
    state.metrics.mealStock < 140;
  const logisticsReserve = logisticsNeeded ? Math.min(LOGISTICS_RESERVE_MAX, Math.max(1, Math.floor(availableCrew.length / 4))) : 0;
  const assignedCount = Math.min(jobs.length, Math.max(0, availableCrew.length - logisticsReserve));
  for (let i = 0; i < availableCrew.length; i++) {
    const cm = availableCrew[i];
    if (i < assignedCount) {
      const job = jobs[i];
      cm.role = job.role;
      cm.targetTile = job.tileIndex;
      continue;
    }

    cm.role = 'idle';
    cm.targetTile = null;
  }
  for (const c of state.crewMembers) {
    if (c.resting) c.role = 'idle';
  }

  state.crew.assigned = assignedCount;
  state.crew.free = Math.max(0, availableCrew.length - assignedCount);

  state.ops.reactorsTotal = roomClusters(state, RoomType.Reactor).length;
  state.ops.cafeteriasTotal = roomClusters(state, RoomType.Cafeteria).length;
  state.ops.securityTotal = roomClusters(state, RoomType.Security).length;
  state.ops.dormsTotal = roomClusters(state, RoomType.Dorm).length;
  state.ops.hygieneTotal = roomClusters(state, RoomType.Hygiene).length;
  state.ops.hydroponicsTotal = roomClusters(state, RoomType.Hydroponics).length;
  state.ops.lifeSupportTotal = roomClusters(state, RoomType.LifeSupport).length;
}

function countStaffAtAssignedTiles(state: StationState): Map<number, number> {
  const counts = new Map<number, number>();
  for (const crew of state.crewMembers) {
    if (crew.resting) continue;
    if (crew.targetTile === null) continue;
    if (crew.tileIndex !== crew.targetTile) continue;
    counts.set(crew.tileIndex, (counts.get(crew.tileIndex) ?? 0) + 1);
  }
  return counts;
}

function operationalClustersForRoom(
  state: StationState,
  room: RoomType,
  requiredStaff: number,
  needsStaff: boolean
): number[][] {
  const clusters = roomClusters(state, room);
  const staffByTile = countStaffAtAssignedTiles(state);
  const out: number[][] = [];
  for (const cluster of clusters) {
    let hasDoor = false;
    let pressurizedCount = 0;
    let staffCount = 0;
    for (const tile of cluster) {
      if (!hasDoor && hasAdjacentDoor(state, tile)) hasDoor = true;
      if (state.pressurized[tile] || room === RoomType.Reactor) pressurizedCount++;
      staffCount += staffByTile.get(tile) ?? 0;
    }
    const pressurizedEnough = pressurizedCount / cluster.length >= 0.7 || room === RoomType.Reactor;
    if (!hasDoor || !pressurizedEnough) continue;
    if (needsStaff && staffCount < requiredStaff) continue;
    out.push(cluster);
  }
  return out;
}

function refreshRoomOpsFromCrewPresence(state: StationState): void {
  state.ops.reactorsActive = operationalClustersForRoom(
    state,
    RoomType.Reactor,
    CREW_PER_REACTOR,
    true
  ).length;
  state.ops.cafeteriasActive = operationalClustersForRoom(
    state,
    RoomType.Cafeteria,
    CREW_PER_CAFETERIA,
    true
  ).length;
  state.ops.securityActive = operationalClustersForRoom(
    state,
    RoomType.Security,
    CREW_PER_SECURITY,
    true
  ).length;
  state.ops.hygieneActive = operationalClustersForRoom(
    state,
    RoomType.Hygiene,
    CREW_PER_HYGIENE,
    true
  ).length;
  state.ops.hydroponicsActive = operationalClustersForRoom(
    state,
    RoomType.Hydroponics,
    CREW_PER_HYDROPONICS,
    true
  ).length;
  state.ops.lifeSupportActive = operationalClustersForRoom(
    state,
    RoomType.LifeSupport,
    CREW_PER_LIFE_SUPPORT,
    true
  ).length;
  state.ops.dormsActive = operationalClustersForRoom(state, RoomType.Dorm, 0, false).length;
}

function activeRoomTargets(state: StationState, room: RoomType): number[] {
  const flatten = (clusters: number[][]): number[] => clusters.flat();
  if (room === RoomType.Cafeteria) {
    return flatten(operationalClustersForRoom(state, RoomType.Cafeteria, CREW_PER_CAFETERIA, true));
  }
  if (room === RoomType.Reactor) {
    return flatten(operationalClustersForRoom(state, RoomType.Reactor, CREW_PER_REACTOR, true));
  }
  if (room === RoomType.Security) {
    return flatten(operationalClustersForRoom(state, RoomType.Security, CREW_PER_SECURITY, true));
  }
  if (room === RoomType.Hygiene) {
    return flatten(operationalClustersForRoom(state, RoomType.Hygiene, CREW_PER_HYGIENE, true));
  }
  if (room === RoomType.Hydroponics) {
    return flatten(operationalClustersForRoom(state, RoomType.Hydroponics, CREW_PER_HYDROPONICS, true));
  }
  if (room === RoomType.LifeSupport) {
    return flatten(operationalClustersForRoom(state, RoomType.LifeSupport, CREW_PER_LIFE_SUPPORT, true));
  }
  if (room === RoomType.Dorm) return flatten(operationalClustersForRoom(state, RoomType.Dorm, 0, false));
  return [];
}

function staffRequiredForRoom(room: RoomType): number {
  if (room === RoomType.Cafeteria) return CREW_PER_CAFETERIA;
  if (room === RoomType.Reactor) return CREW_PER_REACTOR;
  if (room === RoomType.Security) return CREW_PER_SECURITY;
  if (room === RoomType.Hygiene) return CREW_PER_HYGIENE;
  if (room === RoomType.Hydroponics) return CREW_PER_HYDROPONICS;
  if (room === RoomType.LifeSupport) return CREW_PER_LIFE_SUPPORT;
  return 0;
}

export function getRoomDiagnosticAt(state: StationState, tileIndex: number): RoomDiagnostic | null {
  if (tileIndex < 0 || tileIndex >= state.rooms.length) return null;
  const room = state.rooms[tileIndex];
  if (room === RoomType.None) return null;

  const clusters = roomClusters(state, room);
  const cluster = clusters.find((c) => c.includes(tileIndex));
  if (!cluster || cluster.length === 0) return null;

  let hasDoor = false;
  let pressurizedCount = 0;
  for (const tile of cluster) {
    if (!hasDoor && hasAdjacentDoor(state, tile)) hasDoor = true;
    if (state.pressurized[tile] || room === RoomType.Reactor) pressurizedCount++;
  }

  const staffByTile = countStaffAtAssignedTiles(state);
  let staffCount = 0;
  for (const tile of cluster) {
    staffCount += staffByTile.get(tile) ?? 0;
  }

  const requiredStaff = staffRequiredForRoom(room);
  const pressurizedEnough = room === RoomType.Reactor || pressurizedCount / cluster.length >= 0.7;

  const starts = collectTiles(state, TileType.Dock);
  if (starts.length === 0) {
    starts.push(...collectTiles(state, TileType.Floor));
  }
  let hasPath = starts.length === 0;
  if (!hasPath) {
    for (const start of starts) {
      const path = chooseNearestPath(state, start, cluster, true);
      if (path !== null) {
        hasPath = true;
        break;
      }
    }
  }

  const reasons: string[] = [];
  if (!hasDoor) reasons.push('missing door');
  if (!pressurizedEnough) reasons.push('not pressurized');
  if (requiredStaff > 0 && staffCount < requiredStaff) reasons.push('no staff');
  if (!hasPath) reasons.push('no path');

  return {
    room,
    active: reasons.length === 0,
    reasons,
    clusterSize: cluster.length
  };
}

function countCafeteriaDemandByTile(state: StationState): Map<number, number> {
  const demand = new Map<number, number>();
  for (const v of state.visitors) {
    if (
      v.state === VisitorState.Eating ||
      v.state === VisitorState.ToCafeteria ||
      v.state === VisitorState.Queueing
    ) {
      const key = v.path.length > 0 ? v.path[v.path.length - 1] : v.tileIndex;
      demand.set(key, (demand.get(key) ?? 0) + 1);
    }
  }
  for (const r of state.residents) {
    if (r.state === ResidentState.Eating || r.state === ResidentState.ToCafeteria) {
      const key = r.path.length > 0 ? r.path[r.path.length - 1] : r.tileIndex;
      demand.set(key, (demand.get(key) ?? 0) + 1);
    }
  }
  return demand;
}

function countQueuePressureByTile(state: StationState): Map<number, number> {
  const pressure = new Map<number, number>();
  for (const v of state.visitors) {
    if (v.state !== VisitorState.ToCafeteria && v.state !== VisitorState.Queueing) continue;
    const key = v.path.length > 0 ? v.path[v.path.length - 1] : v.tileIndex;
    pressure.set(key, (pressure.get(key) ?? 0) + 1);
  }
  for (const r of state.residents) {
    if (r.state !== ResidentState.ToCafeteria) continue;
    const key = r.path.length > 0 ? r.path[r.path.length - 1] : r.tileIndex;
    pressure.set(key, (pressure.get(key) ?? 0) + 1);
  }
  return pressure;
}

function pickLeastLoadedCafeteriaPath(state: StationState, start: number): number[] {
  const cafeterias = collectRooms(state, RoomType.Cafeteria);
  const demandByTile = countCafeteriaDemandByTile(state);
  let bestPath: number[] | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const target of cafeterias) {
    const seated = dinersOnTile(state, target);
    const path = findPath(state, start, target, false);
    if (!path) continue;
    const demand = demandByTile.get(target) ?? 0;
    // Prefer less crowded cafeteria tiles, and avoid "door table" clumping.
    const doorwayPenalty = hasAdjacentDoor(state, target) ? 8 : 0;
    const seatedPenalty = seated >= MAX_DINERS_PER_CAF_TILE ? 30 : seated * 10;
    const score = demand * 14 + seatedPenalty + doorwayPenalty + path.length;
    if (score < bestScore) {
      bestScore = score;
      bestPath = path;
    }
  }
  return bestPath ?? [];
}

function pickQueueSpotPath(state: StationState, start: number): number[] {
  const spots = collectCafeteriaQueueSpots(state);
  const queuePressure = countQueuePressureByTile(state);
  let bestPath: number[] | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const spot of spots) {
    const path = findPath(state, start, spot, false);
    if (!path) continue;
    const queued = queuePressure.get(spot) ?? 0;
    const score = queued * 9 + path.length;
    if (score < bestScore) {
      bestScore = score;
      bestPath = path;
    }
  }
  return bestPath ?? [];
}

function dinersOnTile(state: StationState, tileIndex: number): number {
  let count = 0;
  for (const v of state.visitors) {
    if (v.state === VisitorState.Eating && v.tileIndex === tileIndex) count++;
  }
  for (const r of state.residents) {
    if (r.state === ResidentState.Eating && r.tileIndex === tileIndex) count++;
  }
  return count;
}

function scheduleCycleArrivals(state: StationState): void {
  const bays = getDockBays(state);
  if (bays.length === 0) return;

  const ships = clamp(state.controls.shipsPerCycle, 0, MAX_SHIPS_PER_CYCLE);
  for (let s = 0; s < ships; s++) {
    const availableBays = bays.filter(
      (bay) => !state.arrivingShips.some((ship) => bayOverlapsShip(bay, ship))
    );
    if (availableBays.length === 0) break;
    const bay = availableBays[randomInt(0, availableBays.length - 1, state.rng)];
    const area = bay.length;
    const wanted = preferredShipSize(state.rng);
    const size = shipSizeForBay(area, wanted);
    if (!size) continue;

    let sumX = 0;
    let sumY = 0;
    for (const tile of bay) {
      const p = fromIndex(tile, state.width);
      sumX += p.x + 0.5;
      sumY += p.y + 0.5;
    }
    const centerX = sumX / bay.length;
    const centerY = sumY / bay.length;
    const passengersTotal = Math.round(
      SHIP_BASE_PASSENGERS[size] * (0.78 + state.rng() * 0.7) * (0.7 + Math.min(area, 12) / 20)
    );

    state.arrivingShips.push({
      id: state.shipSpawnCounter++,
      size,
      bayTiles: bay,
      bayCenterX: centerX,
      bayCenterY: centerY,
      stage: 'approach',
      stageTime: 0,
      passengersTotal: Math.max(2, passengersTotal),
      passengersSpawned: 0,
      passengersBoarded: 0,
      minimumBoarding: Math.max(2, Math.round(Math.max(2, passengersTotal) * 0.25)),
      spawnCarry: 0,
      dockedAt: 0
    });
  }
}

function updateSpawns(state: StationState): void {
  if (state.pendingSpawns.length === 0) return;
  const keep: typeof state.pendingSpawns = [];
  for (const ps of state.pendingSpawns) {
    if (ps.at <= state.now) {
      spawnVisitor(state, ps.dockIndex);
    } else {
      keep.push(ps);
    }
  }
  state.pendingSpawns = keep;
}

function updateArrivingShips(state: StationState, dt: number): void {
  const keep: ArrivingShip[] = [];
  for (const ship of state.arrivingShips) {
    ship.stageTime += dt;

    if (ship.stage === 'approach' && ship.stageTime >= SHIP_APPROACH_TIME) {
      ship.stage = 'docked';
      ship.stageTime = 0;
      ship.dockedAt = state.now;
    }

    if (ship.stage === 'docked') {
      const spawnRate = ship.passengersTotal / SHIP_DOCKED_TIME;
      ship.spawnCarry += spawnRate * dt;
      while (ship.spawnCarry >= 1 && ship.passengersSpawned < ship.passengersTotal) {
        const dockTile = ship.bayTiles[randomInt(0, ship.bayTiles.length - 1, state.rng)];
        spawnVisitor(state, dockTile);
        ship.passengersSpawned++;
        ship.spawnCarry -= 1;
      }
      if (
        ship.passengersSpawned >= ship.passengersTotal &&
        ship.passengersBoarded >= ship.minimumBoarding
      ) {
        ship.stage = 'depart';
        ship.stageTime = 0;
      }
      const noVisitorsLeft = state.visitors.length === 0;
      if (
        ship.stageTime >= SHIP_MAX_DOCKED_TIME &&
        (ship.passengersSpawned >= ship.passengersTotal || noVisitorsLeft)
      ) {
        ship.stage = 'depart';
        ship.stageTime = 0;
      }
    }

    if (ship.stage === 'depart' && ship.stageTime >= SHIP_DEPART_TIME) {
      if (ship.dockedAt > 0) {
        state.dockedTimeTotal += Math.max(0, state.now - ship.dockedAt);
        state.dockedShipsCompleted += 1;
      }
      continue;
    }

    keep.push(ship);
  }
  state.arrivingShips = keep;
}

function tryBoardDockedShipAtTile(state: StationState, dockTile: number): boolean {
  for (const ship of state.arrivingShips) {
    if (ship.stage !== 'docked') continue;
    if (!ship.bayTiles.includes(dockTile)) continue;
    ship.passengersBoarded++;
    return true;
  }
  return false;
}

function buildOccupancyMap(state: StationState): Map<number, number> {
  const map = new Map<number, number>();
  for (const v of state.visitors) {
    map.set(v.tileIndex, (map.get(v.tileIndex) ?? 0) + 1);
  }
  for (const r of state.residents) {
    map.set(r.tileIndex, (map.get(r.tileIndex) ?? 0) + 1);
  }
  for (const c of state.crewMembers) {
    map.set(c.tileIndex, (map.get(c.tileIndex) ?? 0) + 1);
  }
  return map;
}

function moveAlongPath(
  state: StationState,
  actor: { x: number; y: number; tileIndex: number; path: number[]; speed: number },
  dt: number,
  occupancyByTile: Map<number, number>
): boolean {
  if (actor.path.length === 0) return false;

  const nextTile = actor.path[0];
  const target = tileCenter(nextTile, state.width);
  const dx = target.x - actor.x;
  const dy = target.y - actor.y;
  const dist = Math.hypot(dx, dy);
  const speedFactor = state.now < state.effects.brownoutUntil ? 0.65 : 1;
  const step = actor.speed * speedFactor * dt;

  if (dist <= step || dist < 0.001) {
    const occupied = occupancyByTile.get(nextTile) ?? 0;
    if (occupied >= MAX_OCCUPANTS_PER_TILE) return false;
    occupancyByTile.set(actor.tileIndex, Math.max(0, (occupancyByTile.get(actor.tileIndex) ?? 1) - 1));
    occupancyByTile.set(nextTile, occupied + 1);
    actor.x = target.x;
    actor.y = target.y;
    actor.tileIndex = nextTile;
    actor.path.shift();
    return true;
  }

  actor.x += (dx / dist) * step;
  actor.y += (dy / dist) * step;
  return true;
}

function preferredDormTargets(state: StationState): number[] {
  const dorms = activeRoomTargets(state, RoomType.Dorm);
  const restricted = dorms.filter((idx) => state.zones[idx] === ZoneType.Restricted);
  return restricted.length > 0 ? restricted : dorms;
}

function resolveCrewHauling(state: StationState, crew: CrewMember): void {
  const hydroTargets = collectRooms(state, RoomType.Hydroponics);
  const cafeteriaTargets = collectRooms(state, RoomType.Cafeteria);
  if (hydroTargets.length === 0 || cafeteriaTargets.length === 0) return;

  if (crew.carryingRawFood <= 0) {
    if (state.metrics.rawFoodStock < 1) return;
    if (state.rooms[crew.tileIndex] === RoomType.Hydroponics) {
      const pickup = Math.min(1, state.metrics.rawFoodStock);
      state.metrics.rawFoodStock -= pickup;
      crew.carryingRawFood = pickup;
      crew.path = chooseNearestPath(state, crew.tileIndex, cafeteriaTargets, false) ?? [];
      return;
    }
    if (crew.path.length === 0) {
      crew.path = chooseNearestPath(state, crew.tileIndex, hydroTargets, false) ?? [];
    }
    return;
  }

  if (state.rooms[crew.tileIndex] === RoomType.Cafeteria) {
    state.metrics.mealStock = clamp(state.metrics.mealStock + crew.carryingRawFood * 1.2, 0, 260);
    crew.carryingRawFood = 0;
    crew.path = [];
    return;
  }
  if (crew.path.length === 0) {
    crew.path = chooseNearestPath(state, crew.tileIndex, cafeteriaTargets, false) ?? [];
  }
}

function updateCrewLogic(state: StationState, dt: number, occupancyByTile: Map<number, number>): void {
  const idleTargets = collectIdleWalkTiles(state);
  for (const crew of state.crewMembers) {
    if (!crew.resting) {
      crew.energy = clamp(crew.energy - dt * 0.32, 0, 100);
      if (crew.energy < 28) {
        crew.resting = true;
        crew.role = 'idle';
        crew.targetTile = null;
        crew.path = [];
      }
    }

    if (crew.resting) {
      const dormTargets = preferredDormTargets(state);
      if (dormTargets.length > 0 && state.rooms[crew.tileIndex] !== RoomType.Dorm) {
        if (crew.path.length === 0) {
          crew.path = chooseNearestPath(state, crew.tileIndex, dormTargets, false) ?? [];
        }
        moveAlongPath(state, crew, dt, occupancyByTile);
      } else if (state.rooms[crew.tileIndex] === RoomType.Dorm) {
        crew.energy = clamp(crew.energy + dt * 22, 0, 100);
      } else {
        crew.energy = clamp(crew.energy + dt * 6, 0, 100);
      }
      if (crew.energy >= 92) {
        crew.resting = false;
        crew.path = [];
        crew.targetTile = null;
        crew.retargetAt = 0;
      }
      continue;
    }

    // Logistics should run continuously for idle crew and for anyone currently carrying cargo.
    if (crew.role === 'idle' || crew.carryingRawFood > 0) resolveCrewHauling(state, crew);

    if (crew.targetTile !== null && crew.path.length === 0 && crew.tileIndex !== crew.targetTile) {
      const path = findPath(state, crew.tileIndex, crew.targetTile, true);
      crew.path = path ?? [];
    }

    if (crew.targetTile === crew.tileIndex && crew.carryingRawFood <= 0 && crew.role !== 'idle') {
      crew.path = [];
      continue;
    }

    if (crew.role === 'idle' && crew.path.length === 0 && idleTargets.length > 0 && state.now >= crew.retargetAt) {
      const next = idleTargets[randomInt(0, idleTargets.length - 1, state.rng)];
      crew.path = findPath(state, crew.tileIndex, next, false) ?? [];
      crew.retargetAt = state.now + 5 + state.rng() * 8;
    }

    moveAlongPath(state, crew, dt, occupancyByTile);
  }
}

function assignPathToCafeteria(state: StationState, visitor: Visitor): void {
  if (isCafeteriaQueueSpot(state, visitor.tileIndex)) {
    visitor.path = pickLeastLoadedCafeteriaPath(state, visitor.tileIndex);
    visitor.state = VisitorState.Queueing;
    return;
  }
  visitor.path = pickQueueSpotPath(state, visitor.tileIndex);
  visitor.state = VisitorState.ToCafeteria;
  if (visitor.path.length === 0) {
    visitor.path = pickLeastLoadedCafeteriaPath(state, visitor.tileIndex);
    visitor.state = VisitorState.Queueing;
  }
}

function assignPathToDock(state: StationState, visitor: Visitor): void {
  const docks = collectTiles(state, TileType.Dock);
  visitor.path = chooseNearestPath(state, visitor.tileIndex, docks, false) ?? [];
}

function updateVisitorLogic(state: StationState, dt: number, occupancyByTile: Map<number, number>): void {
  const keep: Visitor[] = [];

  for (const visitor of state.visitors) {
    if (state.zones[visitor.tileIndex] === ZoneType.Restricted && !visitor.trespassed) {
      visitor.trespassed = true;
      const multiplier = state.now < state.effects.securityDelayUntil ? 2 : 1;
      registerIncident(state, multiplier);
    }

    if (visitor.state === VisitorState.ToCafeteria || visitor.state === VisitorState.Queueing) {
      if (state.ops.cafeteriasActive <= 0) {
        visitor.state = VisitorState.ToDock;
        assignPathToDock(state, visitor);
      } else {
        if (visitor.path.length === 0) {
          assignPathToCafeteria(state, visitor);
        }
        const moved = moveAlongPath(state, visitor, dt, occupancyByTile);
        if (!moved) {
          const hasAnyCafeteria = collectRooms(state, RoomType.Cafeteria).length > 0;
          visitor.patience += hasAnyCafeteria ? dt * 0.35 : dt * 0.08;
        }

        if (isCafeteriaQueueSpot(state, visitor.tileIndex) && visitor.path.length === 0) {
          visitor.path = pickLeastLoadedCafeteriaPath(state, visitor.tileIndex);
          visitor.state = VisitorState.Queueing;
        }

        if (
          state.rooms[visitor.tileIndex] === RoomType.Cafeteria &&
          state.now >= state.effects.cafeteriaStallUntil &&
          dinersOnTile(state, visitor.tileIndex) < MAX_DINERS_PER_CAF_TILE
        ) {
          visitor.state = VisitorState.Eating;
          visitor.eatTimer = 2.5;
          visitor.path = [];
        } else if (state.rooms[visitor.tileIndex] === RoomType.Cafeteria) {
          visitor.path = pickLeastLoadedCafeteriaPath(state, visitor.tileIndex);
        }
      }
    } else if (visitor.state === VisitorState.Eating) {
      if (state.now < state.effects.cafeteriaStallUntil || state.metrics.mealStock <= 0.15) {
        visitor.patience += dt * 0.8;
      } else {
        visitor.eatTimer -= dt;
        state.metrics.mealStock = Math.max(0, state.metrics.mealStock - dt * 0.2);
      }

      if (visitor.eatTimer <= 0) {
        visitor.servedMeal = true;
        visitor.state = VisitorState.ToDock;
        assignPathToDock(state, visitor);
      }
    } else {
      if (visitor.path.length === 0) {
        assignPathToDock(state, visitor);
      }
      const moved = moveAlongPath(state, visitor, dt, occupancyByTile);
      if (!moved) visitor.patience += dt;
      if (state.tiles[visitor.tileIndex] === TileType.Dock) {
        const boarded = tryBoardDockedShipAtTile(state, visitor.tileIndex);
        const canExitNormally = state.now - state.lastCycleTime > state.cycleDuration * 0.2;
        if (boarded || canExitNormally) {
          if (visitor.servedMeal) {
            const payout = 3 + state.controls.taxRate * 8;
            state.metrics.credits += payout;
          }
          state.recentExitTimes.push(state.now);
          occupancyByTile.set(
            visitor.tileIndex,
            Math.max(0, (occupancyByTile.get(visitor.tileIndex) ?? 1) - 1)
          );
          continue;
        }
        visitor.patience += dt * 0.4;
      } else if (visitor.path.length === 0) {
        visitor.patience += dt * 1.4;
      }
    }

    if (visitor.patience > 30 && visitor.state !== VisitorState.ToDock) {
      visitor.state = VisitorState.ToDock;
      assignPathToDock(state, visitor);
      visitor.patience = 12;
    }
    if (visitor.patience > 80 && visitor.state === VisitorState.ToDock) {
      visitor.path = [];
      if (state.tiles[visitor.tileIndex] === TileType.Dock) {
        state.recentExitTimes.push(state.now);
        occupancyByTile.set(
          visitor.tileIndex,
          Math.max(0, (occupancyByTile.get(visitor.tileIndex) ?? 1) - 1)
        );
        continue;
      }
      registerIncident(state, 1);
      visitor.patience = 20;
    }
    if (visitor.patience > 120 && visitor.state === VisitorState.ToDock) {
      registerIncident(state, 1);
      occupancyByTile.set(
        visitor.tileIndex,
        Math.max(0, (occupancyByTile.get(visitor.tileIndex) ?? 1) - 1)
      );
      continue;
    }

    keep.push(visitor);
  }

  state.visitors = keep;
}

function assignResidentTarget(state: StationState, resident: Resident): void {
  const dormTargets = activeRoomTargets(state, RoomType.Dorm);
  const hygieneTargets = activeRoomTargets(state, RoomType.Hygiene);
  const cafeteriaTargets = activeRoomTargets(state, RoomType.Cafeteria);

  if (resident.energy < 45 && dormTargets.length > 0) {
    resident.state = ResidentState.ToDorm;
    resident.path = chooseNearestPath(state, resident.tileIndex, dormTargets, false) ?? [];
    if (resident.path.length > 0) return;
  }

  if (resident.hygiene < 45 && hygieneTargets.length > 0) {
    resident.state = ResidentState.ToHygiene;
    resident.path = chooseNearestPath(state, resident.tileIndex, hygieneTargets, false) ?? [];
    if (resident.path.length > 0) return;
  }

  if (resident.hunger < 55 && cafeteriaTargets.length > 0 && state.metrics.mealStock > 3) {
    resident.state = ResidentState.ToCafeteria;
    resident.path = pickQueueSpotPath(state, resident.tileIndex);
    if (resident.path.length === 0) {
      resident.path = pickLeastLoadedCafeteriaPath(state, resident.tileIndex);
    }
    if (resident.path.length > 0) return;
  }

  resident.state = ResidentState.Idle;
  if (state.now >= resident.retargetAt || resident.path.length === 0) {
    const walkTargets = collectIdleWalkTiles(state);
    if (walkTargets.length > 0) {
      const target = walkTargets[randomInt(0, walkTargets.length - 1, state.rng)];
      resident.path = findPath(state, resident.tileIndex, target, false) ?? [];
    } else {
      resident.path = [];
    }
    resident.retargetAt = state.now + 5 + state.rng() * 8;
  }
}

function updateResidentLogic(state: StationState, dt: number, occupancyByTile: Map<number, number>): void {
  for (const resident of state.residents) {
    const airPenalty = state.metrics.airQuality < 40 ? 0.25 : 0;
    resident.hunger = clamp(resident.hunger - dt * (0.65 + airPenalty), 0, 100);
    resident.energy = clamp(resident.energy - dt * 0.5, 0, 100);
    resident.hygiene = clamp(resident.hygiene - dt * 0.4, 0, 100);

    const lowNeedCount =
      (resident.hunger < 30 ? 1 : 0) + (resident.energy < 30 ? 1 : 0) + (resident.hygiene < 30 ? 1 : 0);

    if (lowNeedCount > 0) {
      resident.stress = clamp(resident.stress + dt * (0.75 + lowNeedCount * 0.45), 0, 120);
    } else {
      resident.stress = clamp(resident.stress - dt * 0.45, 0, 120);
    }

    if (resident.state === ResidentState.Eating) {
      resident.actionTimer -= dt;
      if (state.metrics.mealStock > 0.12) {
        state.metrics.mealStock = Math.max(0, state.metrics.mealStock - dt * 0.55);
        resident.hunger = clamp(resident.hunger + dt * 22, 0, 100);
      } else {
        resident.stress = clamp(resident.stress + dt * 0.6, 0, 120);
      }
      if (resident.actionTimer <= 0 || resident.hunger >= 95) {
        resident.state = ResidentState.Idle;
      }
    } else if (resident.state === ResidentState.Sleeping) {
      resident.actionTimer -= dt;
      resident.energy = clamp(resident.energy + dt * 18, 0, 100);
      if (resident.actionTimer <= 0 || resident.energy >= 95) {
        resident.state = ResidentState.Idle;
      }
    } else if (resident.state === ResidentState.Cleaning) {
      resident.actionTimer -= dt;
      if (state.metrics.waterStock > 0.1) {
        state.metrics.waterStock = Math.max(0, state.metrics.waterStock - dt * 0.42);
        resident.hygiene = clamp(resident.hygiene + dt * 20, 0, 100);
      } else {
        resident.stress = clamp(resident.stress + dt * 0.55, 0, 120);
      }
      if (resident.actionTimer <= 0 || resident.hygiene >= 95) {
        resident.state = ResidentState.Idle;
      }
    } else {
      if (resident.state === ResidentState.Idle || resident.path.length === 0) {
        assignResidentTarget(state, resident);
      }

      const moved = moveAlongPath(state, resident, dt, occupancyByTile);
      if (!moved) resident.stress = clamp(resident.stress + dt * 0.2, 0, 120);

      if (resident.state === ResidentState.ToCafeteria && state.rooms[resident.tileIndex] === RoomType.Cafeteria) {
        if (dinersOnTile(state, resident.tileIndex) < MAX_DINERS_PER_CAF_TILE) {
          resident.state = ResidentState.Eating;
          resident.actionTimer = 2.4;
          resident.path = [];
        } else {
          resident.path = pickLeastLoadedCafeteriaPath(state, resident.tileIndex);
        }
      } else if (resident.state === ResidentState.ToCafeteria && isCafeteriaQueueSpot(state, resident.tileIndex)) {
        resident.path = pickLeastLoadedCafeteriaPath(state, resident.tileIndex);
      } else if (resident.state === ResidentState.ToDorm && state.rooms[resident.tileIndex] === RoomType.Dorm) {
        resident.state = ResidentState.Sleeping;
        resident.actionTimer = 3.2;
        resident.path = [];
      } else if (resident.state === ResidentState.ToHygiene && state.rooms[resident.tileIndex] === RoomType.Hygiene) {
        resident.state = ResidentState.Cleaning;
        resident.actionTimer = 2.2;
        resident.path = [];
      } else if (
        (resident.state === ResidentState.ToCafeteria ||
          resident.state === ResidentState.ToDorm ||
          resident.state === ResidentState.ToHygiene) &&
        resident.path.length === 0
      ) {
        resident.state = ResidentState.Idle;
        resident.retargetAt = 0;
      }
    }

    if (resident.stress > 100) {
      registerIncident(state, 1);
      resident.stress = 55;
    }
  }
}

function updateResources(state: StationState, dt: number): void {
  const leakPenalty = state.metrics.leakingTiles * 0.03;

  const hydroRate = state.ops.hydroponicsActive * 1.25;
  const residentMealUsePerSec = state.residents.length * 0.11;
  const visitorMealUsePerSec = state.visitors.length * 0.04;
  const mealUseRate = residentMealUsePerSec + visitorMealUsePerSec;

  state.metrics.rawFoodStock = clamp(
    state.metrics.rawFoodStock + hydroRate * dt,
    0,
    260
  );
  state.metrics.mealStock = clamp(state.metrics.mealStock - mealUseRate * dt * 0.06, 0, 260);
  state.metrics.rawFoodStock = clamp(state.metrics.rawFoodStock - state.residents.length * 0.01 * dt, 0, 260);

  state.metrics.waterStock = clamp(
    state.metrics.waterStock + state.ops.lifeSupportActive * 0.72 * dt - state.residents.length * 0.04 * dt,
    0,
    260
  );

  const airDemand = state.residents.length * 0.12 + state.visitors.length * 0.05;
  const airSupply = state.ops.lifeSupportActive * 0.9 + (state.metrics.pressurizationPct / 100) * 0.35;
  state.metrics.airQuality = clamp(state.metrics.airQuality + (airSupply - airDemand) * dt * 1.7, 0, 100);
  if (leakPenalty > 0) {
    state.metrics.airQuality = clamp(state.metrics.airQuality - leakPenalty * dt * 1.2, 0, 100);
  }

  if (state.metrics.airQuality < 30) {
    state.incidentHeat += dt * 0.22;
  }

  state.metrics.rawFoodProdRate = hydroRate;
  const haulingCrew = state.crewMembers.filter((c) => !c.resting && c.carryingRawFood > 0).length;
  state.metrics.mealPrepRate = haulingCrew * 0.8;
  state.metrics.mealUseRate = mealUseRate;
}

function applyCrewPayroll(state: StationState): void {
  if (state.now - state.lastPayrollAt < PAYROLL_PERIOD) return;
  state.lastPayrollAt = state.now;

  const payroll = state.crew.total * PAYROLL_PER_CREW;
  if (state.metrics.credits >= payroll) {
    state.metrics.credits -= payroll;
    return;
  }

  const deficit = payroll - state.metrics.credits;
  state.metrics.credits = 0;
  state.incidentHeat += 0.5 + deficit * 0.03;
}

function maybeTriggerFailure(state: StationState, dt: number): void {
  const ratio = state.metrics.capacity <= 0 ? 2 : state.metrics.load / state.metrics.capacity;
  if (ratio < 0.9) return;

  const chance = clamp((ratio - 0.88) * 0.65, 0.02, 0.4) * dt;
  if (state.rng() > chance) return;

  const roll = state.rng();
  if (roll < 0.25) {
    state.effects.cafeteriaStallUntil = Math.max(state.effects.cafeteriaStallUntil, state.now + 3);
  } else if (roll < 0.55) {
    const corridors: number[] = [];
    for (let i = 0; i < state.tiles.length; i++) {
      if (state.tiles[i] === TileType.Floor && isWalkable(state.tiles[i])) corridors.push(i);
    }
    if (corridors.length > 0) {
      const idx = corridors[randomInt(0, corridors.length - 1, state.rng)];
      state.effects.blockedUntilByTile.set(idx, state.now + 3);
    }
  } else if (roll < 0.8) {
    const securityPenalty = state.ops.securityActive > 0 ? 1 : 1.6;
    state.effects.securityDelayUntil = Math.max(
      state.effects.securityDelayUntil,
      state.now + 5 * securityPenalty
    );
  } else {
    const brownoutPenalty = state.metrics.powerDemand > state.metrics.powerSupply ? 1.6 : 1;
    state.effects.brownoutUntil = Math.max(
      state.effects.brownoutUntil,
      state.now + 4 * brownoutPenalty
    );
  }
}

function computeMetrics(state: StationState): void {
  const visitorsCount = state.visitors.length;
  const residentsCount = state.residents.length;

  const powerSupply = BASE_POWER_SUPPLY + state.ops.reactorsActive * POWER_PER_REACTOR;
  const powerDemand =
    9 +
    visitorsCount * 0.35 +
    residentsCount * 0.52 +
    state.ops.cafeteriasActive * 1.3 +
    state.ops.securityActive * 1.2 +
    state.ops.hygieneActive * 1.0 +
    state.ops.hydroponicsActive * 1.1 +
    state.ops.lifeSupportActive * 1.4;

  const powerDeficit = Math.max(0, powerDemand - powerSupply);
  const powerPressure = powerDeficit * 1.9;

  let avgDistanceCost = 0;
  const actorCount = visitorsCount + residentsCount;
  if (actorCount > 0) {
    let sum = 0;
    for (const v of state.visitors) sum += v.path.length;
    for (const r of state.residents) sum += r.path.length;
    avgDistanceCost = (sum / actorCount) * 0.16;
  }

  let averageNeedDeficit = 0;
  if (residentsCount > 0) {
    let deficit = 0;
    for (const r of state.residents) {
      deficit += (100 - r.hunger + (100 - r.energy) + (100 - r.hygiene)) / 3;
    }
    averageNeedDeficit = deficit / residentsCount;
  }

  const unmetNeedPressure = averageNeedDeficit * 0.42;

  state.incidentHeat = Math.max(0, state.incidentHeat - 0.5);

  const load =
    visitorsCount +
    residentsCount +
    powerDemand +
    state.incidentHeat * 5 +
    avgDistanceCost +
    powerPressure +
    unmetNeedPressure;

  const capacity =
    BASE_CAPACITY +
    state.ops.cafeteriasActive * 14 +
    state.ops.securityActive * 10 +
    state.ops.reactorsActive * 14 +
    state.ops.lifeSupportActive * 10 +
    state.ops.dormsActive * 4;

  const loadPct = capacity > 0 ? (load / capacity) * 100 : 200;

  const morale = clamp(
    100 -
      averageNeedDeficit * 0.85 -
      state.incidentHeat * 1.8 -
      (100 - state.metrics.airQuality) * 0.4 -
      state.metrics.leakingTiles * 0.16,
    0,
    100
  );
  const bays = getDockBays(state);
  const dockedShips = state.arrivingShips.filter((s) => s.stage === 'docked').length;
  const bayUtilizationPct = bays.length > 0 ? (dockedShips / bays.length) * 100 : 0;
  const averageDockTime =
    state.dockedShipsCompleted > 0 ? state.dockedTimeTotal / state.dockedShipsCompleted : 0;
  state.recentExitTimes = state.recentExitTimes.filter((t) => state.now - t <= 60);
  const exitsPerMin = state.recentExitTimes.length;

  state.metrics.visitorsCount = visitorsCount;
  state.metrics.residentsCount = residentsCount;
  state.metrics.load = load;
  state.metrics.capacity = capacity;
  state.metrics.loadPct = loadPct;
  state.metrics.powerSupply = powerSupply;
  state.metrics.powerDemand = powerDemand;
  state.metrics.morale = morale;
  state.metrics.dockedShips = dockedShips;
  state.metrics.averageDockTime = averageDockTime;
  state.metrics.bayUtilizationPct = bayUtilizationPct;
  state.metrics.exitsPerMin = exitsPerMin;
}

function expireEffects(state: StationState): void {
  for (const [idx, until] of state.effects.blockedUntilByTile.entries()) {
    if (until <= state.now) {
      state.effects.blockedUntilByTile.delete(idx);
    }
  }
}

export function createInitialState(): StationState {
  const tiles = new Array<TileType>(GRID_WIDTH * GRID_HEIGHT).fill(TileType.Space);
  const zones = new Array<ZoneType>(GRID_WIDTH * GRID_HEIGHT).fill(ZoneType.Public);
  const rooms = new Array<RoomType>(GRID_WIDTH * GRID_HEIGHT).fill(RoomType.None);

  for (let y = 14; y < 24; y++) {
    for (let x = 25; x < 35; x++) {
      tiles[toIndex(x, y, GRID_WIDTH)] = TileType.Floor;
    }
  }
  for (let y = 13; y < 25; y++) {
    tiles[toIndex(24, y, GRID_WIDTH)] = TileType.Wall;
    tiles[toIndex(35, y, GRID_WIDTH)] = TileType.Wall;
  }
  for (let x = 24; x < 36; x++) {
    tiles[toIndex(x, 13, GRID_WIDTH)] = TileType.Wall;
    tiles[toIndex(x, 24, GRID_WIDTH)] = TileType.Wall;
  }

  return {
    width: GRID_WIDTH,
    height: GRID_HEIGHT,
    tiles,
    zones,
    rooms,
    pressurized: new Array<boolean>(GRID_WIDTH * GRID_HEIGHT).fill(false),
    visitors: [],
    residents: [],
    crewMembers: [],
    arrivingShips: [],
    pendingSpawns: [],
    metrics: {
      visitorsCount: 0,
      residentsCount: 0,
      incidentsTotal: 0,
      load: 0,
      capacity: 0,
      loadPct: 0,
      powerSupply: 0,
      powerDemand: 0,
      morale: 80,
      rawFoodStock: 40,
      mealStock: 20,
      waterStock: 70,
      airQuality: 75,
      pressurizationPct: 0,
      leakingTiles: 0,
      materials: 220,
      credits: 60,
      rawFoodProdRate: 0,
      mealPrepRate: 0,
      mealUseRate: 0,
      dockedShips: 0,
      averageDockTime: 0,
      bayUtilizationPct: 0,
      exitsPerMin: 0
    },
    controls: {
      paused: true,
      simSpeed: 1,
      shipsPerCycle: 1,
      showZones: true,
      taxRate: 0.2,
      crewPriority: 'balanced'
    },
    effects: {
      cafeteriaStallUntil: 0,
      brownoutUntil: 0,
      securityDelayUntil: 0,
      blockedUntilByTile: new Map()
    },
    rng: makeRng(1337),
    now: 0,
    lastCycleTime: 0,
    cycleDuration: CYCLE_DURATION,
    spawnCounter: 1,
    shipSpawnCounter: 1,
    crewSpawnCounter: 1,
    residentSpawnCounter: 1,
    incidentHeat: 0,
    lastPayrollAt: 0,
    recentExitTimes: [],
    dockedTimeTotal: 0,
    dockedShipsCompleted: 0,
    crew: {
      total: 8,
      assigned: 0,
      free: 8
    },
    ops: {
      cafeteriasTotal: 0,
      cafeteriasActive: 0,
      securityTotal: 0,
      securityActive: 0,
      reactorsTotal: 0,
      reactorsActive: 0,
      dormsTotal: 0,
      dormsActive: 0,
      hygieneTotal: 0,
      hygieneActive: 0,
      hydroponicsTotal: 0,
      hydroponicsActive: 0,
      lifeSupportTotal: 0,
      lifeSupportActive: 0
    }
  };
}

export function setTile(state: StationState, index: number, tile: TileType): void {
  state.tiles[index] = tile;
  if (!isWalkable(tile)) {
    state.rooms[index] = RoomType.None;
  }
}

export function trySetTile(state: StationState, index: number, tile: TileType): boolean {
  const old = state.tiles[index];
  if (old === tile) return true;
  const oldCost = old === TileType.Space ? 0 : MATERIAL_COST[old];
  const newCost = tile === TileType.Space ? 0 : MATERIAL_COST[tile];
  const delta = Math.max(0, newCost - oldCost);
  if (state.metrics.materials < delta) return false;
  state.metrics.materials -= delta;
  setTile(state, index, tile);
  return true;
}

export function setZone(state: StationState, index: number, zone: ZoneType): void {
  state.zones[index] = zone;
}

export function setRoom(state: StationState, index: number, room: RoomType): void {
  if (!isWalkable(state.tiles[index])) return;
  state.rooms[index] = room;
  if (room === RoomType.Dorm) {
    state.zones[index] = ZoneType.Restricted;
  }
}

export function buyMaterials(state: StationState, creditCost: number, materialsGain: number): boolean {
  if (state.metrics.credits < creditCost) return false;
  state.metrics.credits -= creditCost;
  state.metrics.materials += materialsGain;
  return true;
}

export function buyRawFood(state: StationState, creditCost: number, rawFoodGain: number): boolean {
  if (state.metrics.credits < creditCost) return false;
  state.metrics.credits -= creditCost;
  state.metrics.rawFoodStock = clamp(state.metrics.rawFoodStock + rawFoodGain, 0, 260);
  return true;
}

export function hireCrew(state: StationState, creditCost = HIRE_COST): boolean {
  if (state.metrics.credits < creditCost) return false;
  if (state.crew.total >= 40) return false;
  state.metrics.credits -= creditCost;
  state.crew.total += 1;
  return true;
}

export function fireCrew(state: StationState, creditRefund = 0): boolean {
  if (state.crew.total <= 0) return false;
  state.crew.total -= 1;
  if (creditRefund > 0) {
    state.metrics.credits += creditRefund;
  }
  return true;
}

export function sellMaterials(state: StationState, materialsCost: number, creditGain: number): boolean {
  if (state.metrics.materials < materialsCost) return false;
  state.metrics.materials -= materialsCost;
  state.metrics.credits += creditGain;
  return true;
}

export function sellRawFood(state: StationState, rawFoodCost: number, creditGain: number): boolean {
  if (state.metrics.rawFoodStock < rawFoodCost) return false;
  state.metrics.rawFoodStock = clamp(state.metrics.rawFoodStock - rawFoodCost, 0, 260);
  state.metrics.credits += creditGain;
  return true;
}

export function tick(state: StationState, frameDt: number): void {
  ensureCrewPool(state);
  assignCrewJobs(state);
  ensureResidentPopulation(state);
  computePressurization(state);
  refreshRoomOpsFromCrewPresence(state);

  if (state.controls.paused) {
    computeMetrics(state);
    return;
  }

  const dt = frameDt * state.controls.simSpeed;
  state.now += dt;

  while (state.now - state.lastCycleTime >= state.cycleDuration) {
    state.lastCycleTime += state.cycleDuration;
    scheduleCycleArrivals(state);
  }

  updateSpawns(state);
  updateArrivingShips(state, dt);
  expireEffects(state);
  applyCrewPayroll(state);
  computePressurization(state);
  updateResources(state, dt);

  const occupancyByTile = buildOccupancyMap(state);
  updateCrewLogic(state, dt, occupancyByTile);
  refreshRoomOpsFromCrewPresence(state);
  updateResidentLogic(state, dt, occupancyByTile);
  updateVisitorLogic(state, dt, occupancyByTile);

  assignCrewJobs(state);
  refreshRoomOpsFromCrewPresence(state);
  ensureResidentPopulation(state);
  computeMetrics(state);
  maybeTriggerFailure(state, dt);
}
