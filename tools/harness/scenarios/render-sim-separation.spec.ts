/**
 * render-sim-separation — the renderer must not write to the simulation.
 *
 * `src/render/render.ts` is ~8.5k lines and takes `StationState` by reference.
 * Until now the only assertion guarding that boundary was a narrow one (state
 * selection does not mutate rotation or footprint geometry). Nothing checked
 * the general case: run a render pass, and the sim state must be unchanged.
 *
 * WHAT THIS CHECK ACTUALLY DOES, AND WHY
 *
 * A deep-freeze of the live `StationState` was the first choice and is not
 * available:
 *   1. `StationState` is never exposed on `window` — the only routes into it
 *      are the harness hooks, which hand back serialized copies.
 *   2. Its hot grids are typed arrays (`tiles`, `rooms`, `dirtByTile`,
 *      `dirtSourceByTile`, ...). `Object.freeze` throws outright on a typed
 *      array with elements, so there is no freeze that covers the fields a
 *      renderer is most likely to scribble on.
 *   3. Freezing the live object would break the sim for the rest of the page
 *      session even if it worked.
 *
 * So this is the hash comparison the task offers as the acceptable
 * alternative, run through the harness hooks:
 *
 *   hash(__harnessGetState().snapshot) + hash(__harnessGetMetrics())
 *     -> N render passes via __harnessPauseAndFlush()
 *     -> the same two hashes
 *
 * `__harnessGetState()` returns `serializeSave(...)` parsed, i.e. the entire
 * durable snapshot: tiles, rooms, module instances and their footprints, every
 * agent cohort with positions and paths, jobs, reservations, port ops,
 * contracts, settlements, the dirt grids, economy and unlock state.
 * `__harnessPauseAndFlush()` is the real render path — `renderWorld` plus every
 * overlay draw the live loop performs (src/main.ts).
 *
 * Coverage limits, stated plainly:
 *   - Fields excluded from the save (renderer-owned caches, derived
 *     diagnostics) are outside this comparison. It guards the durable
 *     simulation, which is the part a render-side write would corrupt.
 *   - The envelope's `createdAt` is a fresh timestamp on every call, so only
 *     `.snapshot` is hashed, never the envelope.
 *
 * Pass criteria:
 *   - Repeated render passes leave the durable snapshot byte-identical
 *   - ...and `state.metrics` byte-identical (nothing in the draw path
 *     back-writes a metric)
 *   - Holds with overlays on, with a selection active, and after the sim has
 *     been advanced into a populated mid-scenario state
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const RUN_DIR = process.env.HARNESS_RUN_DIR || '/tmp/harness-runs/latest/render-sim-separation';

/** Render passes to run between the two hashes. */
const RENDER_PASSES = 6;

/**
 * Fixtures chosen to light up different renderer branches: an opening station,
 * a fully built-out one, a grimy one (floor overlay decals), and one with
 * exterior structure and approach geometry.
 */
const FIXTURES = ['starter', 'facility-scale', 'entropy-sanitation', 'structural-truss-active'];

interface Probe {
  snapshotHash: string;
  metricsHash: string;
  /** Per-top-level-key hashes, so a failure names the field the renderer wrote to. */
  keyHashes: Record<string, string>;
}

/**
 * Warm-up pass, probe, N render passes, probe — all inside ONE synchronous
 * `evaluate` block.
 *
 * That single block is load-bearing. `frame()` writes `frameMs`, `renderMs`,
 * `rafJankMs` and `rafDroppedFrames` into `state.metrics` on every animation
 * frame, and the sim keeps ticking on its own interval. Split across two
 * round-trips, an rAF frame lands in the gap and the metrics hash changes for
 * reasons that have nothing to do with the render pass under test. Nothing can
 * interleave inside one synchronous JS block, so every difference this
 * function reports was written by `__harnessPauseAndFlush` itself.
 *
 * The warm-up pass runs before the first probe because the renderer builds
 * lazy caches (station environment, tile variants, wall tilemaps) on its first
 * draw. Those are renderer-owned and legitimately created once; the comparison
 * starts after they exist so it measures writes to the *sim*, not cache warm-up.
 */
async function renderPassProbe(
  page: import('@playwright/test').Page,
  passes: number,
): Promise<{ before: Probe; after: Probe }> {
  return page.evaluate((n) => {
    const hash = (s: string) => {
      let h = 5381;
      for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
      return `${h.toString(16)}:${s.length}`;
    };
    const takeProbe = () => {
      const envelope = window.__harnessGetState() as { snapshot: Record<string, unknown> };
      const snapshot = envelope.snapshot;
      const keyHashes: Record<string, string> = {};
      for (const key of Object.keys(snapshot).sort()) {
        keyHashes[key] = hash(JSON.stringify(snapshot[key] ?? null));
      }
      return {
        snapshotHash: hash(JSON.stringify(snapshot)),
        metricsHash: hash(JSON.stringify(window.__harnessGetMetrics())),
        keyHashes,
      };
    };

    window.__harnessPauseAndFlush(); // warm-up
    const before = takeProbe();
    for (let i = 0; i < n; i++) window.__harnessPauseAndFlush();
    const after = takeProbe();
    return { before, after };
  }, passes);
}

function diffKeys(before: Probe, after: Probe): string[] {
  const keys = new Set([...Object.keys(before.keyHashes), ...Object.keys(after.keyHashes)]);
  return [...keys].filter((k) => before.keyHashes[k] !== after.keyHashes[k]).sort();
}

test.beforeAll(() => {
  fs.mkdirSync(RUN_DIR, { recursive: true });
});

for (const scenario of FIXTURES) {
  test(`render-sim-separation: ${scenario} survives ${RENDER_PASSES} render passes unchanged`, async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto(`/?scenario=${scenario}`);
    await page.waitForFunction(() => window.__harnessReady === true, { timeout: 15_000 });

    // Advance into a populated mid-scenario state: agents on paths, jobs in
    // flight, ships in the approach. An empty station renders almost nothing
    // and would prove almost nothing.
    await page.evaluate(() => {
      window.__harnessPauseAndFlush();
      window.__harnessAdvanceSim(45, 0.25);
    });

    const { before, after } = await renderPassProbe(page, RENDER_PASSES);

    const changed = diffKeys(before, after);
    const report = {
      scenario,
      renderPasses: RENDER_PASSES,
      snapshotHashBefore: before.snapshotHash,
      snapshotHashAfter: after.snapshotHash,
      metricsHashBefore: before.metricsHash,
      metricsHashAfter: after.metricsHash,
      changedSnapshotKeys: changed,
      snapshotKeysCompared: Object.keys(before.keyHashes).length,
    };
    fs.writeFileSync(path.join(RUN_DIR, `${scenario}.json`), JSON.stringify(report, null, 2));
    console.log(`[render-sim-separation] ${scenario}:`, JSON.stringify(report));

    expect(
      Object.keys(before.keyHashes).length,
      'the snapshot should expose a substantial set of top-level sim fields to compare',
    ).toBeGreaterThan(10);
    expect(
      changed,
      `${RENDER_PASSES} render passes mutated simulation state on "${scenario}". ` +
        `Changed top-level snapshot fields: ${changed.join(', ') || '(none named)'}`,
    ).toEqual([]);
    expect(
      after.snapshotHash,
      `durable sim snapshot changed across render passes on "${scenario}"`,
    ).toBe(before.snapshotHash);
    expect(
      after.metricsHash,
      `state.metrics changed across render passes on "${scenario}" — something in the draw path writes a metric`,
    ).toBe(before.metricsHash);
    expect(pageErrors, `pageerrors during render passes:\n${pageErrors.join('\n')}`).toHaveLength(0);
  });
}

test('render-sim-separation: overlays and a live selection do not write back to the sim', async ({ page }) => {
  // The overlay and selection draw paths take extra branches through the
  // renderer — diagnostic tinting, zone fills, service-node markers, inventory
  // badges, the selected agent's route. Those are the branches most likely to
  // "helpfully" recompute something onto state while drawing it.
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  await page.goto('/?scenario=facility-scale');
  await page.waitForFunction(() => window.__harnessReady === true, { timeout: 15_000 });
  await page.evaluate(() => {
    window.__harnessPauseAndFlush();
    window.__harnessAdvanceSim(45, 0.25);
  });

  // The overlay toggles live behind the Overlays palette tab, not on the top
  // bar, so the tab has to be opened before they can be clicked.
  await page.locator('button.palette-tab[data-palette-target="overlays"]').click();
  const toggled: string[] = [];
  for (const toggle of ['#toggle-zones', '#toggle-service-nodes', '#toggle-inventory-overlay']) {
    const el = page.locator(toggle);
    if (await el.isVisible()) {
      await el.click();
      toggled.push(toggle);
    }
  }
  expect(toggled.length, 'expected at least one overlay toggle to be reachable and clickable').toBeGreaterThan(0);

  // Click into the canvas so a tile/agent selection is live while drawing.
  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  if (box) await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.45);

  const { before, after } = await renderPassProbe(page, RENDER_PASSES);

  const changed = diffKeys(before, after);
  const report = {
    scenario: 'facility-scale + overlays + selection',
    renderPasses: RENDER_PASSES,
    changedSnapshotKeys: changed,
    snapshotStable: before.snapshotHash === after.snapshotHash,
    metricsStable: before.metricsHash === after.metricsHash,
  };
  fs.writeFileSync(path.join(RUN_DIR, 'overlays-and-selection.json'), JSON.stringify(report, null, 2));
  console.log('[render-sim-separation] overlays+selection:', JSON.stringify(report));

  expect(
    changed,
    `render passes with overlays and a selection active mutated: ${changed.join(', ') || '(none named)'}`,
  ).toEqual([]);
  expect(after.metricsHash, 'state.metrics changed while drawing overlays').toBe(before.metricsHash);
  expect(pageErrors, `pageerrors during overlay render passes:\n${pageErrors.join('\n')}`).toHaveLength(0);
});

test('render-sim-separation: the comparison can actually see a mutation', async ({ page }) => {
  // A stability check that can never fail is worthless. This deliberately
  // pokes one field of the live sim between two probes — via the sim's own
  // save/load path, the only write route the harness exposes — and asserts the
  // comparison above would have caught a renderer doing the same thing.
  await page.goto('/?scenario=starter');
  await page.waitForFunction(() => window.__harnessReady === true, { timeout: 15_000 });

  const { before, after } = await page.evaluate(() => {
    const hash = (s: string) => {
      let h = 5381;
      for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
      return `${h.toString(16)}:${s.length}`;
    };
    const takeProbe = () => {
      const envelope = window.__harnessGetState() as { snapshot: Record<string, unknown> };
      const snapshot = envelope.snapshot;
      const keyHashes: Record<string, string> = {};
      for (const key of Object.keys(snapshot).sort()) {
        keyHashes[key] = hash(JSON.stringify(snapshot[key] ?? null));
      }
      return {
        snapshotHash: hash(JSON.stringify(snapshot)),
        metricsHash: hash(JSON.stringify(window.__harnessGetMetrics())),
        keyHashes,
      };
    };

    window.__harnessPauseAndFlush();
    const first = takeProbe();
    const save = JSON.parse(window.__harnessExportSave()) as {
      snapshot: { metrics?: { credits?: number }; credits?: number };
    };
    // Nudge whichever credits field this save shape carries.
    if (save.snapshot.metrics && typeof save.snapshot.metrics.credits === 'number') {
      save.snapshot.metrics.credits += 1234;
    } else if (typeof save.snapshot.credits === 'number') {
      save.snapshot.credits += 1234;
    }
    window.__harnessLoadSave(JSON.stringify(save));
    window.__harnessPauseAndFlush();
    return { before: first, after: takeProbe() };
  });

  const changed = diffKeys(before, after);
  console.log('[render-sim-separation] sensitivity check changed keys:', JSON.stringify(changed));
  expect(
    before.snapshotHash === after.snapshotHash,
    'sensitivity check: a deliberate one-field change went undetected, so the stability ' +
      'assertions above prove nothing',
  ).toBe(false);
  expect(changed.length, 'the per-key diff should name at least one changed field').toBeGreaterThan(0);
});
