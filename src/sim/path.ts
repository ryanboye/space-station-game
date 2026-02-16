import { ZoneType, isWalkable, type StationState } from './types';

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

export function findPath(
  state: StationState,
  start: number,
  goal: number,
  allowRestricted: boolean,
  occupancyByTile?: Map<number, number>
): number[] | null {
  if (start === goal) return [];
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
      if (!allowRestricted && state.zones[next] === ZoneType.Restricted && next !== goal) continue;
      if (closed[next]) continue;
      const occupancyPenalty = Math.min(3, (occupancyByTile?.get(next) ?? 0) * 0.45);
      const tentativeG = currentG + 1 + occupancyPenalty;
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
