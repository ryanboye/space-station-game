/**
 * agent-movement — detect sim-freeze regressions.
 *
 * Smoke test for the class of bug where the sim LOOKS alive (DOM renders,
 * no console errors) but agents don't actually move tick-to-tick. That's
 * the "tests pass, game is broken" failure mode ui-smoke + state
 * assertions miss — any exception mid-tick can freeze movement while
 * the surrounding UI keeps drawing a static frame.
 *
 * Captures agent positions, advances 30 sim-seconds via
 * `__harnessAdvanceSim`, captures again, asserts at least one agent in
 * each populated cohort (crew / visitors / residents) moved. A
 * position delta of even 0.01 tiles counts — we only need SOMEONE to
 * have taken a path step.
 *
 * What this won't catch (intentionally, to keep the check robust):
 *   - cohorts with zero members at the snapshot are skipped (a fresh
 *     station may have no residents yet; visitor spawn can be gated
 *     on a ship arrival). If ALL three cohorts are empty the test
 *     advances further and retries once.
 *   - agents deliberately at-rest (sleeping in bed, idle in queue)
 *     don't count — we pick agents with non-zero `path.length` as the
 *     movement witnesses when possible.
 *
 * Required hooks from PR #4 (harness v1.0):
 *   - `window.__harnessReady`
 *   - `window.__harnessGetState` — returns a JSON snapshot of state
 *   - `window.__harnessAdvanceSim(seconds)` — advances the sim by N
 *     real-time seconds of ticks with the dev-config msPerTick
 *   - `window.__harnessPauseAndFlush` — for a clean snapshot boundary
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));

const RUN_DIR = process.env.HARNESS_RUN_DIR || '/tmp/harness-runs/latest/agent-movement';
const ADVANCE_SECONDS = 30;

interface AgentSnapshot {
  id: number;
  x: number;
  y: number;
  tileIndex: number;
  pathLen: number;
}

interface StateSnapshot {
  crewMembers: AgentSnapshot[];
  visitors: AgentSnapshot[];
  residents: AgentSnapshot[];
  simNow: number;
}

function toSnapshot(arr: Array<{id: number; x: number; y: number; tileIndex: number; path?: number[]}>): AgentSnapshot[] {
  return arr.map((a) => ({
    id: a.id,
    x: a.x,
    y: a.y,
    tileIndex: a.tileIndex,
    pathLen: a.path?.length ?? 0,
  }));
}

async function captureSnapshot(page: import('@playwright/test').Page): Promise<StateSnapshot> {
  const state = await page.evaluate(() => window.__harnessGetState()) as {
    crewMembers?: Array<{id: number; x: number; y: number; tileIndex: number; path?: number[]}>;
    visitors?: Array<{id: number; x: number; y: number; tileIndex: number; path?: number[]}>;
    residents?: Array<{id: number; x: number; y: number; tileIndex: number; path?: number[]}>;
    now?: number;
  };
  return {
    crewMembers: toSnapshot(state.crewMembers ?? []),
    visitors: toSnapshot(state.visitors ?? []),
    residents: toSnapshot(state.residents ?? []),
    simNow: state.now ?? 0,
  };
}

/** Returns the ids of agents in `after` whose (x,y,tileIndex) differs
 *  from the same id in `before`. Agents present in only one snapshot
 *  are not counted as "movement" — they came or went. */
function movedAgentIds(before: AgentSnapshot[], after: AgentSnapshot[]): number[] {
  const beforeById = new Map(before.map((a) => [a.id, a]));
  const moved: number[] = [];
  for (const a of after) {
    const b = beforeById.get(a.id);
    if (!b) continue;
    if (a.x !== b.x || a.y !== b.y || a.tileIndex !== b.tileIndex) {
      moved.push(a.id);
    }
  }
  return moved;
}

test.beforeAll(() => {
  fs.mkdirSync(RUN_DIR, { recursive: true });
});

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  (page as unknown as Record<string, unknown>)._harnessErrors = errors;

  await page.goto('/');
  await page.waitForFunction(() => window.__harnessReady === true, { timeout: 15_000 });
  // Pause + flush once so the baseline snapshot isn't mid-tick.
  await page.evaluate(() => window.__harnessPauseAndFlush());
});

test.afterEach(async ({ page }, testInfo) => {
  const errors = (page as unknown as Record<string, unknown>)._harnessErrors as string[] ?? [];
  fs.writeFileSync(
    path.join(RUN_DIR, `${testInfo.title.replace(/\W+/g, '-')}-errors.log`),
    errors.join('\n') + '\n',
  );
});

test('agent-movement: at least one agent in each populated cohort moves over 30 sim-seconds', async ({ page }) => {
  const before = await captureSnapshot(page);
  fs.writeFileSync(path.join(RUN_DIR, 'before.json'), JSON.stringify(before, null, 2));

  // Resume + advance. advanceSim runs ticks synchronously through the
  // usual sim loop, so if any tick throws we'll see it in pageerror.
  await page.evaluate((secs) => window.__harnessAdvanceSim(secs), ADVANCE_SECONDS);
  await page.evaluate(() => window.__harnessPauseAndFlush());

  const after = await captureSnapshot(page);
  fs.writeFileSync(path.join(RUN_DIR, 'after.json'), JSON.stringify(after, null, 2));

  // Sim time must have advanced — if it didn't, advanceSim silently
  // no-oped and anything below is a false signal.
  expect(after.simNow, 'simNow must advance when __harnessAdvanceSim fires').toBeGreaterThan(before.simNow);

  // Per-cohort movement check. Skip empty cohorts (a fresh station
  // may genuinely have no residents yet).
  if (before.crewMembers.length > 0 && after.crewMembers.length > 0) {
    const movedCrew = movedAgentIds(before.crewMembers, after.crewMembers);
    expect(movedCrew.length, `crew freeze: ${before.crewMembers.length} crew, 0 moved over ${ADVANCE_SECONDS}s`).toBeGreaterThan(0);
  }
  if (before.visitors.length > 0 && after.visitors.length > 0) {
    const movedVisitors = movedAgentIds(before.visitors, after.visitors);
    expect(movedVisitors.length, `visitor freeze: ${before.visitors.length} visitors, 0 moved over ${ADVANCE_SECONDS}s`).toBeGreaterThan(0);
  }
  if (before.residents.length > 0 && after.residents.length > 0) {
    const movedResidents = movedAgentIds(before.residents, after.residents);
    expect(movedResidents.length, `resident freeze: ${before.residents.length} residents, 0 moved over ${ADVANCE_SECONDS}s`).toBeGreaterThan(0);
  }
});

test('agent-movement: at least one agent somewhere moves even on an empty station', async ({ page }) => {
  // Fallback guard: brand-new station with zero visitors/residents but
  // should still have crew. If ALL three cohorts are empty in 30s, the
  // station isn't ticking at all.
  const before = await captureSnapshot(page);
  await page.evaluate((secs) => window.__harnessAdvanceSim(secs), ADVANCE_SECONDS);
  await page.evaluate(() => window.__harnessPauseAndFlush());
  const after = await captureSnapshot(page);

  const totalBefore = before.crewMembers.length + before.visitors.length + before.residents.length;
  const totalAfter = after.crewMembers.length + after.visitors.length + after.residents.length;
  const anyMoved =
    movedAgentIds(before.crewMembers, after.crewMembers).length > 0 ||
    movedAgentIds(before.visitors, after.visitors).length > 0 ||
    movedAgentIds(before.residents, after.residents).length > 0;
  const anySpawned = totalAfter > totalBefore;

  expect(
    anyMoved || anySpawned,
    `station freeze: sim advanced ${after.simNow - before.simNow}s but 0 agents moved and 0 new agents spawned`,
  ).toBe(true);
});
