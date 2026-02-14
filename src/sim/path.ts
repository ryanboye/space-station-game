import { fromIndex, inBounds, isWalkable, toIndex, ZoneType, type StationState } from './types';

function neighbors(index: number, state: StationState): number[] {
  const { x, y } = fromIndex(index, state.width);
  const out: number[] = [];
  const deltas = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ];
  for (const [dx, dy] of deltas) {
    const nx = x + dx;
    const ny = y + dy;
    if (!inBounds(nx, ny, state.width, state.height)) continue;
    const ni = toIndex(nx, ny, state.width);
    if (!isWalkable(state.tiles[ni])) continue;
    const blockedUntil = state.effects.blockedUntilByTile.get(ni) ?? 0;
    if (state.now < blockedUntil) continue;
    out.push(ni);
  }
  return out;
}

function heuristic(a: number, b: number, width: number): number {
  const pa = fromIndex(a, width);
  const pb = fromIndex(b, width);
  return Math.abs(pa.x - pb.x) + Math.abs(pa.y - pb.y);
}

export function findPath(
  state: StationState,
  start: number,
  goal: number,
  allowRestricted: boolean
): number[] | null {
  if (start === goal) return [];

  const open = new Set<number>([start]);
  const cameFrom = new Map<number, number>();
  const gScore = new Map<number, number>([[start, 0]]);
  const fScore = new Map<number, number>([[start, heuristic(start, goal, state.width)]]);

  while (open.size > 0) {
    let current = -1;
    let best = Number.POSITIVE_INFINITY;
    for (const idx of open) {
      const f = fScore.get(idx) ?? Number.POSITIVE_INFINITY;
      if (f < best) {
        best = f;
        current = idx;
      }
    }

    if (current === goal) {
      const path: number[] = [];
      let step = goal;
      while (cameFrom.has(step)) {
        path.unshift(step);
        step = cameFrom.get(step)!;
      }
      return path;
    }

    open.delete(current);
    const currentG = gScore.get(current) ?? Number.POSITIVE_INFINITY;

    for (const next of neighbors(current, state)) {
      if (!allowRestricted && state.zones[next] === ZoneType.Restricted && next !== goal) {
        continue;
      }
      const tentativeG = currentG + 1;
      if (tentativeG < (gScore.get(next) ?? Number.POSITIVE_INFINITY)) {
        cameFrom.set(next, current);
        gScore.set(next, tentativeG);
        fScore.set(next, tentativeG + heuristic(next, goal, state.width));
        open.add(next);
      }
    }
  }

  return null;
}
