import {
  planQueueLayout,
  type QueueCirculationRequirement,
  type QueueProviderRequest,
  type QueueTile
} from '../src/sim/queue-layout';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function line(length: number, room = 'service'): QueueTile[] {
  return Array.from({ length }, (_, tile) => ({
    tile,
    room,
    walkable: true,
    neighbors: [tile - 1, tile + 1].filter((next) => next >= 0 && next < length)
  }));
}

function provider(key: string, requestedDemand: number, servingTile = -1, room = 'service'): QueueProviderRequest {
  return { key, requestedDemand, servingTile, room, headCandidates: [0] };
}

function allocation(plan: ReturnType<typeof planQueueLayout>, key: string): readonly number[] {
  return plan.allocationsByProvider.get(key) ?? [];
}

function assertOwnFrontier(tiles: readonly QueueTile[], plan: ReturnType<typeof planQueueLayout>): void {
  const neighbors = new Map(tiles.map((tile) => [tile.tile, new Set(tile.neighbors)]));
  for (const [providerKey, allocated] of plan.allocationsByProvider) {
    const earlier = new Set<number>();
    for (const tile of allocated) {
      if (earlier.size > 0) {
        assert(
          [...earlier].some((candidate) => neighbors.get(tile)?.has(candidate) || neighbors.get(candidate)?.has(tile)),
          `${providerKey} slot ${tile} does not grow from its own earlier frontier (${[...earlier].join(',')}).`
        );
      }
      earlier.add(tile);
    }
  }
}

function testDemandExpandsWithoutMagicCeiling(): string {
  const tiles = line(48);
  const small = planQueueLayout({ tiles, providers: [provider('meal', 6)] });
  const large = planQueueLayout({ tiles, providers: [provider('meal', 40)] });
  assert(allocation(small, 'meal').length === 6, 'Demand six should paint exactly six physical places.');
  assert(allocation(large, 'meal').length === 40, 'Demand forty must expand past the former universal cap of 24.');
  assert(allocation(large, 'meal').slice(0, 6).join(',') === allocation(small, 'meal').join(','), 'Expansion must preserve the stable head of the line.');
  assertOwnFrontier(tiles, large);
  return `demand 6->${allocation(small, 'meal').length}; 40->${allocation(large, 'meal').length}`;
}

function testProvidersFairShare(): string {
  const tiles = line(20, 'market');
  const plan = planQueueLayout({
    tiles,
    providers: [
      { ...provider('checkout-a', 8, -1, 'market'), headCandidates: [0] },
      { ...provider('checkout-b', 8, -2, 'market'), headCandidates: [19] }
    ]
  });
  assert(allocation(plan, 'checkout-a').length === 8 && allocation(plan, 'checkout-b').length === 8, 'Adjacent providers must share enough floor fairly.');
  for (let index = 0; index < 16; index += 2) {
    assert(plan.allocationOrder[index]?.providerKey === 'checkout-a', 'The stable first provider should receive one place per round.');
    assert(plan.allocationOrder[index + 1]?.providerKey === 'checkout-b', 'The neighbour must receive its place in the same round.');
  }
  assertOwnFrontier(tiles, plan);
  return `fair ${allocation(plan, 'checkout-a').length}/${allocation(plan, 'checkout-b').length}, alternating rounds`;
}

function reachable(tiles: readonly QueueTile[], from: number, to: number, blocked: ReadonlySet<number>): boolean {
  const byTile = new Map(tiles.map((tile) => [tile.tile, tile]));
  const pending = [from];
  const visited = new Set(pending);
  for (let cursor = 0; cursor < pending.length; cursor += 1) {
    if (pending[cursor] === to) return true;
    for (const next of byTile.get(pending[cursor])?.neighbors ?? []) {
      if (!visited.has(next) && !blocked.has(next)) {
        visited.add(next);
        pending.push(next);
      }
    }
  }
  return false;
}

function testOneWideDoorKeepsDrainRoute(): string {
  // 0 service head, 1/2 side alcoves, 3 room aisle, 4 door, 5/6 corridor.
  const tiles: QueueTile[] = [
    { tile: 0, room: 'cafe', walkable: true, neighbors: [1, 2, 3] },
    { tile: 1, room: 'cafe', walkable: true, neighbors: [0] },
    { tile: 2, room: 'cafe', walkable: true, neighbors: [0] },
    { tile: 3, room: 'cafe', walkable: true, neighbors: [0, 4] },
    { tile: 4, room: 'hall', walkable: true, door: true, narrowSection: 'cafe-door', neighbors: [3, 5] },
    { tile: 5, room: 'hall', walkable: true, neighbors: [4, 6] },
    { tile: 6, room: 'hall', walkable: true, neighbors: [5] }
  ];
  const circulation: QueueCirculationRequirement[] = [{ key: 'cafe-egress', from: 3, toAny: [6] }];
  const plan = planQueueLayout({ tiles, circulation, providers: [{ ...provider('meal', 6), headCandidates: [0] }] });
  const occupied = new Set(allocation(plan, 'meal'));
  assert(!occupied.has(3) && !occupied.has(4), 'The aisle and one-wide door must remain circulation, not queue slots.');
  assert(reachable(tiles, 3, 6, occupied), 'The room must retain a drain route through the door.');
  assert((plan.unallocatedByProvider.get('meal') ?? 0) > 0, 'Unsafe overflow must be exposed as unallocated demand.');
  return `door open; ${allocation(plan, 'meal').length} safe, ${plan.unallocatedByProvider.get('meal')} unallocated`;
}

function testUnprotectedBadLayoutCanCoverDoor(): string {
  const tiles: QueueTile[] = [
    { tile: 0, room: 'cafe', walkable: true, neighbors: [1, 2, 3] },
    { tile: 1, room: 'cafe', walkable: true, neighbors: [0] },
    { tile: 2, room: 'cafe', walkable: true, neighbors: [0] },
    { tile: 3, room: 'cafe', walkable: true, neighbors: [0, 4] },
    { tile: 4, room: 'hall', walkable: true, door: true, narrowSection: 'cafe-door', neighbors: [3, 5] },
    { tile: 5, room: 'hall', walkable: true, neighbors: [4, 6] },
    { tile: 6, room: 'hall', walkable: true, neighbors: [5] }
  ];
  const plan = planQueueLayout({ tiles, providers: [{ ...provider('meal', 7), headCandidates: [0] }] });
  const allocated = allocation(plan, 'meal');
  assert(allocated.length === 7 && allocated.includes(4), 'Without a promised circulation route, sufficient demand may occupy the door.');
  assert(allocated.indexOf(4) > allocated.indexOf(3), 'The choke must follow ordinary in-room frontier places.');
  assert(allocated.indexOf(4) < allocated.indexOf(5), 'Spill beyond a one-door bridge must physically grow through that door.');
  assertOwnFrontier(tiles, plan);
  return `bad-layout frontier reaches door before outside spill (${allocated.join(',')})`;
}

function grid(width: number, height: number, room: string): QueueTile[] {
  return Array.from({ length: width * height }, (_, tile) => {
    const x = tile % width;
    const y = Math.floor(tile / width);
    const neighbors = [
      x > 0 ? tile - 1 : -1,
      x + 1 < width ? tile + 1 : -1,
      y > 0 ? tile - width : -1,
      y + 1 < height ? tile + width : -1
    ].filter((next) => next >= 0);
    return { tile, room, walkable: true, neighbors };
  });
}

function testConcourseBeatsNarrowRoom(): string {
  const narrowTiles = line(9, 'cafe').map((tile, index) => ({
    ...tile,
    narrowSection: index > 0 && index < 8 ? 'one-wide-room' : null
  }));
  const wideTiles = grid(5, 5, 'concourse');
  const narrow = planQueueLayout({ tiles: narrowTiles, providers: [provider('service', 20)] });
  const wide = planQueueLayout({ tiles: wideTiles, providers: [{ ...provider('service', 20, -1, 'concourse'), headCandidates: [0] }] });
  assert(allocation(wide, 'service').length === 20, 'A broad concourse should accept the requested physical line.');
  assert(allocation(wide, 'service').length > allocation(narrow, 'service').length, 'Physical width must admit more waiting places than a choke.');
  return `narrow ${allocation(narrow, 'service').length}; wide ${allocation(wide, 'service').length}`;
}

function keyed(plan: ReturnType<typeof planQueueLayout>): string {
  return [...plan.allocationsByProvider.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, tiles]) => `${key}:${tiles.join(',')}`)
    .join('|');
}

function testProviderDiscoveryOrderDoesNotMatter(): string {
  const providers = [
    { ...provider('bar-a', 5, -1), headCandidates: [0] },
    { ...provider('bar-b', 5, -2), headCandidates: [11] }
  ];
  const forward = planQueueLayout({ tiles: line(12), providers });
  const reverse = planQueueLayout({ tiles: line(12), providers: [...providers].reverse() });
  assert(keyed(forward) === keyed(reverse), 'Provider discovery order must not change keyed physical allocations.');
  assert(JSON.stringify(forward.allocationOrder) === JSON.stringify(reverse.allocationOrder), 'The full fair allocation order must be deterministic.');
  assertOwnFrontier(line(12), forward);
  return keyed(forward);
}

function testImpossibleDemandIsExplicitAndAcyclic(): string {
  const tiles = line(5);
  const plan = planQueueLayout({ tiles, providers: [provider('meal', 40)] });
  const allocated = allocation(plan, 'meal');
  assert(allocated.length === 5, 'Only five physical tiles exist.');
  assert(plan.unallocatedByProvider.get('meal') === 35, 'All impossible demand must remain explicit.');
  assert(new Set(allocated).size === allocated.length, 'A provider allocation may not contain duplicates or cycles.');
  const globallyAllocated = [...plan.allocationsByProvider.values()].flat();
  assert(new Set(globallyAllocated).size === globallyAllocated.length, 'No physical tile may be claimed twice.');
  return `${allocated.length} placed, ${plan.unallocatedByProvider.get('meal')} unallocated, unique`;
}

const evidence = [
  testDemandExpandsWithoutMagicCeiling(),
  testProvidersFairShare(),
  testOneWideDoorKeepsDrainRoute(),
  testUnprotectedBadLayoutCanCoverDoor(),
  testConcourseBeatsNarrowRoom(),
  testProviderDiscoveryOrderDoesNotMatter(),
  testImpossibleDemandIsExplicitAndAcyclic()
];

console.log(`queue layout planner: ${evidence.length}/${evidence.length}`);
for (const line of evidence) console.log(`  ${line}`);
