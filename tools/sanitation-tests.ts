// Focused runner for sanitation dirt dynamics (docs/30 PR 1).
// Mirrors tools/port-ops-tests.ts and tools/site-charter-tests.ts: pure
// assertions, no harness, filterable via SANITATION_TEST_FILTER.
// Run with `npm run test:sanitation`.
//
// These tests guard the four properties the slice exists to establish:
//   1. cleaning drops a tile below the renderer's grime threshold,
//   2. ordinary foot traffic can out-run passive decay and become visible,
//   3. scrubbing a filthy tile is watchable labor rather than a snap,
//   4. an isolated speck still fades on its own, but a real patch does not.

import { createInitialState, setRoom, setTile, tick } from '../src/sim/sim';
import { createEmptyStaffRoleCounts } from '../src/sim/content/command';
import {
  ModuleType,
  RoomType,
  TileType,
  toIndex,
  type StaffRole,
  type StationState
} from '../src/sim/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// The renderer draws a grime decal at or above this much dirt
// (`pickFloorOverlayKey`, src/render/render.ts). Anything the sim leaves at or
// above it is visible to the player; anything below it reads as a clean floor.
// This is the number the whole slice is calibrated against.
const RENDER_GRIME_THRESHOLD = 12;

function runFor(state: StationState, seconds: number, step = 0.25): void {
  const steps = Math.ceil(seconds / step);
  for (let i = 0; i < steps; i++) tick(state, step);
}

// A sealed, empty hull with a floor interior. Everything authored by the
// starter station is cleared so sanitation is the only system with anything to
// do — no ships, no visitors, no construction, no imports.
function buildHabitat(state: StationState): { x0: number; y0: number; x1: number; y1: number } {
  state.controls.paused = false;
  state.controls.simSpeed = 1;
  state.controls.shipsPerCycle = 0;
  state.controls.materialAutoImportEnabled = false;
  state.tiles.fill(TileType.Space);
  state.rooms.fill(RoomType.None);
  state.modules.fill(ModuleType.None);
  state.moduleInstances = [];
  state.moduleOccupancyByTile.fill(null);
  state.jobs.length = 0;
  state.reservations.length = 0;
  state.itemNodes.length = 0;
  state.visitors.length = 0;
  state.residents.length = 0;
  state.arrivingShips.length = 0;
  state.dockQueue.length = 0;
  state.docks.length = 0;
  state.dirtByTile.fill(0);
  state.dirtSourceByTile.fill(0);
  state.unlocks.tier = 3;
  state.unlocks.unlockedIds = ['tier1_sustenance', 'tier2_commerce', 'tier3_logistics'];
  state.unlocks.unlockedAtSec = { tier1_sustenance: 0, tier2_commerce: 0, tier3_logistics: 0 };

  const bounds = { x0: 4, y0: 4, x1: 34, y1: 24 };
  for (let y = bounds.y0; y <= bounds.y1; y++) {
    for (let x = bounds.x0; x <= bounds.x1; x++) {
      setTile(state, toIndex(x, y, state.width), TileType.Floor);
    }
  }
  for (let x = bounds.x0; x <= bounds.x1; x++) {
    setTile(state, toIndex(x, bounds.y0, state.width), TileType.Wall);
    setTile(state, toIndex(x, bounds.y1, state.width), TileType.Wall);
  }
  for (let y = bounds.y0; y <= bounds.y1; y++) {
    setTile(state, toIndex(bounds.x0, y, state.width), TileType.Wall);
    setTile(state, toIndex(bounds.x1, y, state.width), TileType.Wall);
  }
  setTile(state, state.core.centerTile, TileType.Floor);
  setTile(state, state.core.serviceTile, TileType.Floor);
  return bounds;
}

function paintRoom(state: StationState, room: RoomType, x0: number, y0: number, x1: number, y1: number): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) setRoom(state, toIndex(x, y, state.width), room);
  }
}

// Replace the whole roster with `count` crew of a single role, then park them
// on a known-walkable tile: the starter crew spawn near the authored station,
// which `buildHabitat` has just turned back into space.
function staffWith(state: StationState, role: StaffRole | null, count: number, homeTile: number): void {
  const counts = createEmptyStaffRoleCounts();
  if (role !== null && count > 0) counts[role] = count;
  state.crew.roleCounts = counts;
  state.crew.total = count;
  state.crew.free = count;
  state.crew.assigned = 0;
  tick(state, 0.01);
  const home = { x: homeTile % state.width, y: Math.floor(homeTile / state.width) };
  for (const crew of state.crewMembers) {
    crew.tileIndex = homeTile;
    crew.x = home.x;
    crew.y = home.y;
    crew.path = [];
    crew.targetTile = null;
  }
}

function freshStation(seed: number): StationState {
  return createInitialState({ seed, manualTrafficAdmission: true });
}

// 1. The satisfaction bug. `SANITATION_JOB_TARGET` used to be 18 — above the
// renderer's threshold of 12 — so a "cleaned" floor still drew grime and the
// player's cleaner appeared to accomplish nothing.
function testCleanedTileEndsBelowRenderThreshold(): void {
  const state = freshStation(4401);
  buildHabitat(state);
  paintRoom(state, RoomType.Cafeteria, 16, 10, 21, 13);
  const home = toIndex(10, 10, state.width);
  staffWith(state, 'cleaner', 1, home);

  const target = toIndex(18, 11, state.width);
  state.dirtByTile[target] = 82;
  state.dirtSourceByTile[target] = 2;

  runFor(state, 120);

  assert(
    state.usageTotals.sanitationJobsResolved > 0,
    'Expected the cleaner to resolve at least one sanitation job.'
  );
  assert(
    state.dirtByTile[target] < RENDER_GRIME_THRESHOLD,
    `A cleaned tile must end below the render threshold of ${RENDER_GRIME_THRESHOLD}, ` +
      `otherwise it still draws grime. Ended at ${state.dirtByTile[target].toFixed(1)}.`
  );
}

// 2. The decay regression guard. Passive decay used to run at 0.006/s below
// dirt 18, which beat foot traffic outright: a corridor needed a crossing every
// 5-9 seconds forever just to break even, so lanes sat at zero permanently and
// never rendered. Traffic on a lane must now be able to become visible.
function testCorridorTrafficBecomesVisible(): void {
  const state = freshStation(4402);
  buildHabitat(state);
  const home = toIndex(10, 20, state.width);
  // Assistants, not cleaners: nobody may clean during the accumulation window.
  staffWith(state, 'assistant', 3, home);

  // A three-tile stretch of corridor, walked in rotation. Re-pinning each step
  // is what makes this a *periodic traffic* test rather than a test of the
  // crew AI's wander pattern.
  const lane = [toIndex(12, 15, state.width), toIndex(13, 15, state.width), toIndex(14, 15, state.width)];
  // Never stood on: only the neighbour footprint can dirty this one.
  const offLane = toIndex(13, 16, state.width);

  const step = 0.25;
  const seconds = 240;
  for (let i = 0; i < Math.ceil(seconds / step); i++) {
    for (let c = 0; c < state.crewMembers.length; c++) {
      const crew = state.crewMembers[c];
      const tile = lane[(c + Math.floor(i / 3)) % lane.length];
      crew.tileIndex = tile;
      crew.x = tile % state.width;
      crew.y = Math.floor(tile / state.width);
      crew.path = [];
    }
    tick(state, step);
  }

  const laneMax = Math.max(...lane.map((tile) => state.dirtByTile[tile] ?? 0));
  assert(
    laneMax >= RENDER_GRIME_THRESHOLD,
    `A corridor under periodic traffic must reach the visible threshold of ` +
      `${RENDER_GRIME_THRESHOLD} within ${seconds}s. Peaked at ${laneMax.toFixed(1)} — ` +
      'passive decay is beating foot traffic again.'
  );
  assert(
    (state.dirtByTile[offLane] ?? 0) > 1,
    `Traffic must smear onto orthogonal neighbours so lanes read as tracks, not specks. ` +
      `The adjacent tile picked up ${(state.dirtByTile[offLane] ?? 0).toFixed(2)}.`
  );
}

// 3. Cleaning has to be watchable labor. At the old rate of 32/sec against a
// target of 18, a filthy tile was 0.56 seconds of work: the cleaner walked
// across the station and the tile snapped clean in a single frame.
function testFilthyTileTakesRealWork(): void {
  const state = freshStation(4403);
  buildHabitat(state);
  paintRoom(state, RoomType.Cafeteria, 16, 10, 21, 13);
  const home = toIndex(10, 10, state.width);
  staffWith(state, 'cleaner', 1, home);

  const target = toIndex(18, 11, state.width);
  state.dirtByTile[target] = 82;
  state.dirtSourceByTile[target] = 2;

  const step = 0.25;
  let scrubbingSeconds = 0;
  for (let i = 0; i < Math.ceil(120 / step); i++) {
    const before = state.dirtByTile[target] ?? 0;
    tick(state, step);
    const after = state.dirtByTile[target] ?? 0;
    // Passive decay also nudges the tile down, so only count steps where the
    // drop is far larger than decay could account for.
    if (before - after > 0.05) scrubbingSeconds += step;
  }

  assert(
    state.dirtByTile[target] < RENDER_GRIME_THRESHOLD,
    `Setup check: the filthy tile should have been cleaned (ended at ${state.dirtByTile[target].toFixed(1)}).`
  );
  assert(
    scrubbingSeconds > 5,
    `Scrubbing a filthy tile must be visible labor of more than 5 seconds; ` +
      `it took ${scrubbingSeconds.toFixed(2)}s of actual work.`
  );
}

// 4. Decay still exists — it just no longer does the janitor's job. An isolated
// speck in an abandoned corner fades to nothing; a real patch does not, because
// dirt is meant to be removed by cleaners rather than by physics.
function testPassiveDecayDrainsSpeckButNotPatch(): void {
  const state = freshStation(4404);
  buildHabitat(state);
  const home = toIndex(10, 10, state.width);
  staffWith(state, null, 0, home);
  assert(state.crewMembers.length === 0, 'Setup check: the decay fixture must have no crew.');

  const speck = toIndex(12, 12, state.width);
  const patch = toIndex(20, 12, state.width);
  state.dirtByTile[speck] = 3;
  state.dirtByTile[patch] = 40;

  runFor(state, 2400, 1);

  assert(
    (state.dirtByTile[speck] ?? 0) < 0.5,
    `An isolated speck must eventually fade on its own; it is still at ${(state.dirtByTile[speck] ?? 0).toFixed(2)}.`
  );
  assert(
    state.visitors.length === 0 && state.crewMembers.length === 0,
    'Setup check: nothing should have walked into the decay fixture.'
  );
  assert(
    (state.dirtByTile[patch] ?? 0) >= 32,
    `Physics must not clean a real patch — that is the cleaner's job. The patch ` +
      `dropped from 40 to ${(state.dirtByTile[patch] ?? 0).toFixed(1)}.`
  );
}

const tests: Array<[string, () => void]> = [
  ['cleaned tile ends below render threshold', testCleanedTileEndsBelowRenderThreshold],
  ['corridor traffic becomes visible', testCorridorTrafficBecomesVisible],
  ['filthy tile takes real work', testFilthyTileTakesRealWork],
  ['passive decay drains speck not patch', testPassiveDecayDrainsSpeckButNotPatch]
];

const runtimeProcess = (globalThis as typeof globalThis & {
  process?: { env?: Record<string, string | undefined> };
}).process;
const filter = runtimeProcess?.env?.SANITATION_TEST_FILTER?.trim().toLowerCase() ?? '';
const selectedTests = filter.length > 0
  ? tests.filter(([name]) => name.toLowerCase().includes(filter))
  : tests;
if (selectedTests.length === 0) throw new Error(`No focused sanitation test matched "${filter}".`);

for (const [name, run] of selectedTests) {
  run();
  console.log(`PASS ${name}`);
}

console.log(`Sanitation: ${selectedTests.length} focused tests passed${filter ? ` (filter: ${filter})` : ''}.`);
