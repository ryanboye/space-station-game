import { RoomType, ZoneType, isWalkable, type PathOptions, type StationState } from './types';

const CARDINAL_DELTAS: Array<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1]
];

class MinHeap {
  private priorities: number[] = [];
  private values: number[] = [];

  push(priority: number, value: number): void {
    this.priorities.push(priority);
    this.values.push(value);
    this.bubbleUp(this.priorities.length - 1);
  }

  pop(): number | null {
    if (this.values.length <= 0) return null;
    const out = this.values[0];
    const lastPriority = this.priorities.pop()!;
    const lastValue = this.values.pop()!;
    if (this.values.length > 0) {
      this.priorities[0] = lastPriority;
      this.values[0] = lastValue;
      this.bubbleDown(0);
    }
    return out;
  }

  size(): number {
    return this.values.length;
  }

  private bubbleUp(index: number): void {
    let i = index;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.priorities[parent] <= this.priorities[i]) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  private bubbleDown(index: number): void {
    let i = index;
    for (;;) {
      const left = i * 2 + 1;
      const right = left + 1;
      let smallest = i;
      if (left < this.priorities.length && this.priorities[left] < this.priorities[smallest]) {
        smallest = left;
      }
      if (right < this.priorities.length && this.priorities[right] < this.priorities[smallest]) {
        smallest = right;
      }
      if (smallest === i) break;
      this.swap(i, smallest);
      i = smallest;
    }
  }

  private swap(a: number, b: number): void {
    const p = this.priorities[a];
    this.priorities[a] = this.priorities[b];
    this.priorities[b] = p;
    const v = this.values[a];
    this.values[a] = this.values[b];
    this.values[b] = v;
  }
}

function heuristic(a: number, b: number, width: number): number {
  const ax = a % width;
  const ay = Math.floor(a / width);
  const bx = b % width;
  const by = Math.floor(b / width);
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

function rebuildPath(cameFrom: Int32Array, goal: number): number[] {
  const out: number[] = [];
  let current = goal;
  while (cameFrom[current] >= 0) {
    out.push(current);
    current = cameFrom[current];
  }
  out.reverse();
  return out;
}

function normalizePathOptions(optionsOrAllowRestricted: boolean | PathOptions): PathOptions {
  if (typeof optionsOrAllowRestricted === 'boolean') {
    return { allowRestricted: optionsOrAllowRestricted, intent: 'visitor' };
  }
  return optionsOrAllowRestricted;
}

function routeIntentTileCost(state: StationState, tile: number, goal: number, options: PathOptions): number {
  if (tile === goal) return 0;
  const room = state.rooms[tile];
  const restrictedCost = state.zones[tile] === ZoneType.Restricted ? restrictedSoftCost(options.intent) : 0;
  switch (options.intent) {
    case 'visitor':
      return restrictedCost + visitorRoomCost(room);
    case 'resident':
      return restrictedCost + residentRoomCost(room);
    case 'crew':
      return crewRoomCost(room);
    case 'logistics':
      return logisticsRoomCost(room);
    case 'security':
      return 0;
  }
}

function restrictedSoftCost(intent: PathOptions['intent']): number {
  switch (intent) {
    case 'visitor':
      return 7;
    case 'resident':
      return 3;
    case 'crew':
    case 'logistics':
    case 'security':
      return 0;
  }
}

function visitorRoomCost(room: RoomType): number {
  switch (room) {
    case RoomType.Reactor:
    case RoomType.LifeSupport:
      return 10;
    case RoomType.Security:
    case RoomType.Brig:
      return 8;
    case RoomType.LogisticsStock:
    case RoomType.Storage:
    case RoomType.Workshop:
      return 7;
    case RoomType.Berth:
    case RoomType.Dorm:
    case RoomType.Hygiene:
      return 5;
    case RoomType.Kitchen:
    case RoomType.Hydroponics:
      return 4;
    case RoomType.Clinic:
      return 2;
    default:
      return 0;
  }
}

function residentRoomCost(room: RoomType): number {
  switch (room) {
    case RoomType.LogisticsStock:
    case RoomType.Storage:
    case RoomType.Workshop:
    case RoomType.Berth:
      return 4;
    case RoomType.Reactor:
    case RoomType.LifeSupport:
    case RoomType.Security:
    case RoomType.Brig:
      return 2;
    case RoomType.Kitchen:
    case RoomType.Hydroponics:
      return 1.5;
    case RoomType.Clinic:
      return 1;
    default:
      return 0;
  }
}

function crewRoomCost(room: RoomType): number {
  switch (room) {
    case RoomType.Cafeteria:
    case RoomType.Lounge:
    case RoomType.Market:
    case RoomType.RecHall:
    case RoomType.Cantina:
    case RoomType.Observatory:
      return 1.5;
    case RoomType.Dorm:
    case RoomType.Hygiene:
      return 0.75;
    default:
      return 0;
  }
}

function logisticsRoomCost(room: RoomType): number {
  switch (room) {
    case RoomType.Dorm:
    case RoomType.Hygiene:
      return 8;
    case RoomType.Cafeteria:
    case RoomType.Lounge:
    case RoomType.Market:
    case RoomType.RecHall:
    case RoomType.Cantina:
    case RoomType.Observatory:
      return 7;
    case RoomType.Clinic:
      return 5;
    case RoomType.Security:
    case RoomType.Brig:
      return 3;
    default:
      return 0;
  }
}

function occupancyPenaltyForIntent(options: PathOptions, occupancy: number): number {
  switch (options.intent) {
    case 'security':
      return Math.min(1, occupancy * 0.15);
    case 'crew':
    case 'logistics':
      return Math.min(2.5, occupancy * 0.35);
    case 'visitor':
    case 'resident':
      return Math.min(3, occupancy * 0.45);
  }
}

export function findPath(
  state: StationState,
  start: number,
  goal: number,
  optionsOrAllowRestricted: boolean | PathOptions,
  occupancyByTile?: Map<number, number>
): number[] | null {
  if (start === goal) return [];
  const options = normalizePathOptions(optionsOrAllowRestricted);
  const { width, height } = state;
  const mapSize = width * height;
  const cameFrom = new Int32Array(mapSize);
  cameFrom.fill(-1);
  const gScore = new Float64Array(mapSize);
  gScore.fill(Number.POSITIVE_INFINITY);
  const fScore = new Float64Array(mapSize);
  fScore.fill(Number.POSITIVE_INFINITY);
  const closed = new Uint8Array(mapSize);
  const open = new MinHeap();
  gScore[start] = 0;
  fScore[start] = heuristic(start, goal, width);
  open.push(fScore[start], start);

  while (open.size() > 0) {
    const current = open.pop();
    if (current === null) break;
    if (closed[current]) continue;
    if (current === goal) return rebuildPath(cameFrom, goal);
    closed[current] = 1;
    const cx = current % width;
    const cy = Math.floor(current / width);
    const currentG = gScore[current];
    for (const [dx, dy] of CARDINAL_DELTAS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const next = ny * width + nx;
      if (!isWalkable(state.tiles[next])) continue;
      const blockedUntil = state.effects.blockedUntilByTile.get(next) ?? 0;
      if (state.now < blockedUntil) continue;
      if (!options.allowRestricted && state.zones[next] === ZoneType.Restricted && next !== goal) continue;
      if (closed[next]) continue;
      const occupancyPenalty = occupancyPenaltyForIntent(options, occupancyByTile?.get(next) ?? 0);
      const routeCost = routeIntentTileCost(state, next, goal, options);
      const tentativeG = currentG + 1 + occupancyPenalty + routeCost;
      if (tentativeG >= gScore[next]) continue;
      cameFrom[next] = current;
      gScore[next] = tentativeG;
      const nextF = tentativeG + heuristic(next, goal, width);
      fScore[next] = nextF;
      open.push(nextF, next);
    }
  }
  return null;
}
