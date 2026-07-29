/**
 * render-perf — measure the render side of the frame budget.
 *
 * Every other performance check in this repo measures the simulation:
 * `tools/sim-perf.ts` and `tools/target-scale-perf.ts` time `tick()`, and the
 * gate runners assert on `state.metrics.tickMs`. Nothing read the four numbers
 * the live loop records about the *frame* — `state.metrics.frameMs`,
 * `renderMs`, `rafJankMs`, `rafDroppedFrames` (src/main.ts `frame()`), so
 * render cost and animation smoothness were the one measurement class that was
 * being deferred to cleanup.
 *
 * This scenario loads a known fixture, samples those four values once per
 * animation frame over a fixed wall-clock window, and records the distribution.
 *
 * HONESTY NOTE — what these numbers are and are not:
 *   - They are measured in headless Chromium with a software rasteriser. They
 *     are a valid *relative* signal (light fixture vs heavy fixture, this
 *     commit vs last commit on the same machine) and a valid regression alarm.
 *     They are NOT a claim about frame time on a player's GPU.
 *   - `requestAnimationFrame` is throttled or stopped outright in a background
 *     or hidden tab. If rAF is not actually running, frameMs would sit at a
 *     stale value and reporting it would be a lie. Every measurement below is
 *     therefore gated on a live-rAF probe, and a window that produces no real
 *     frames FAILS with "unmeasurable" rather than recording zero.
 *
 * Pass criteria:
 *   - rAF is confirmed live before any metric is read
 *   - at least MIN_SAMPLES frames land inside the sampling window
 *   - frameMs and renderMs are finite and strictly positive
 *   - rafDroppedFrames agrees with frameMs (the metric is fresh, not stale)
 *   - median renderMs stays under a deliberately loose ceiling
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const RUN_DIR = process.env.HARNESS_RUN_DIR || '/tmp/harness-runs/latest/render-perf';

/** src/main.ts TARGET_FRAME_MS — the budget rafJankMs/rafDroppedFrames are derived against. */
const TARGET_FRAME_MS = 1000 / 60;

/** Wall-clock length of one sampling window. */
const SAMPLE_WINDOW_MS = 3000;

/** Below this many frames in the window, rAF is throttled and nothing is measurable. */
const MIN_SAMPLES = 20;

/**
 * Loose enough that ordinary machine noise and a cold software rasteriser
 * never trip it; tight enough that a renderer that starts doing per-frame
 * O(tiles x modules) work does. Headless software render on the reference
 * machine sits around 40ms.
 */
const RENDER_MS_MEDIAN_CEILING = 400;

interface FrameSample {
  frameMs: number;
  renderMs: number;
  rafJankMs: number;
  rafDroppedFrames: number;
  tickMs: number;
}

interface Stats {
  count: number;
  min: number;
  median: number;
  p95: number;
  max: number;
  mean: number;
}

function stats(values: number[]): Stats {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)))];
  return {
    count: sorted.length,
    min: sorted[0],
    median: at(0.5),
    p95: at(0.95),
    max: sorted[sorted.length - 1],
    mean: sorted.reduce((a, b) => a + b, 0) / sorted.length,
  };
}

/**
 * Confirms rAF is actually delivering frames, then samples the render metrics
 * once per frame for `windowMs`. Returns `rafLive: false` when the browser is
 * not animating — the caller must treat that as unmeasurable, never as zero.
 */
async function sampleFrames(
  page: import('@playwright/test').Page,
  windowMs: number,
): Promise<{ rafLive: boolean; probeFrames: number; elapsedMs: number; samples: FrameSample[] }> {
  return page.evaluate(async (ms) => {
    // The budget is enforced with setTimeout, not with a check inside the rAF
    // callback: when rAF is dead the callback never runs, so a deadline that
    // lives inside it never fires either and the probe would hang forever
    // instead of reporting the stall.
    const waitFrames = (n: number, budgetMs: number) =>
      new Promise<number>((resolve) => {
        let seen = 0;
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          resolve(seen);
        };
        setTimeout(finish, budgetMs);
        const step = () => {
          seen++;
          if (seen >= n) finish();
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });

    // Probe: does rAF fire at all? A hidden/background tab returns ~0 here.
    const probeFrames = await waitFrames(5, 1000);
    if (probeFrames < 3) {
      return { rafLive: false, probeFrames, elapsedMs: 0, samples: [] };
    }

    const samples: Array<{
      frameMs: number;
      renderMs: number;
      rafJankMs: number;
      rafDroppedFrames: number;
      tickMs: number;
    }> = [];
    const start = performance.now();
    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      // Same reasoning as the probe: an rAF that stops mid-window must end the
      // sampling window rather than stall it.
      setTimeout(finish, ms + 2000);
      const step = () => {
        const m = window.__harnessGetMetrics() as Record<string, number>;
        samples.push({
          frameMs: m.frameMs,
          renderMs: m.renderMs,
          rafJankMs: m.rafJankMs,
          rafDroppedFrames: m.rafDroppedFrames,
          tickMs: m.tickMs,
        });
        if (performance.now() - start < ms) requestAnimationFrame(step);
        else finish();
      };
      requestAnimationFrame(step);
    });
    return { rafLive: true, probeFrames, elapsedMs: performance.now() - start, samples };
  }, windowMs);
}

/**
 * Loads the fixture, warms it up, and samples one window.
 *
 * A sampling window is 3+ seconds of `page.evaluate`, and the harness runs
 * against a live Vite dev server. If anything writes to `src/` during that
 * window the page hot-reloads and Playwright kills the evaluate with
 * "Execution context was destroyed". That is a torn measurement, not a slow
 * renderer, so it is retried on a fresh page rather than reported as a number
 * or as a failure.
 */
async function loadAndSample(
  page: import('@playwright/test').Page,
  scenario: string,
  pageErrors: string[],
): Promise<Awaited<ReturnType<typeof sampleFrames>>> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // Errors belonging to a torn-down attempt are not this measurement's.
      pageErrors.length = 0;
      await page.goto(`/?scenario=${scenario}`);
      await page.waitForFunction(() => window.__harnessReady === true, { timeout: 15_000 });
      // Let the sim run: a paused station short-circuits interpolation and part
      // of the per-frame work, which would flatter the measurement.
      await page.evaluate(() => {
        window.__harnessAdvanceSim(30, 0.25);
      });
      return await sampleFrames(page, SAMPLE_WINDOW_MS);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const torn =
        message.includes('Execution context was destroyed') || message.includes('Target closed');
      if (!torn) throw error;
      lastError = error;
      console.log(`[render-perf] ${scenario}: sampling window torn by a page reload, retrying (${attempt + 1}/3)`);
    }
  }
  throw lastError;
}

test.beforeAll(() => {
  fs.mkdirSync(RUN_DIR, { recursive: true });
});

/**
 * Two fixtures on purpose: a light one and a heavy one. A single absolute
 * number says almost nothing, but "the heavy station costs N times the light
 * one" is a shape that survives being run on a different machine.
 */
const FIXTURES = [
  { scenario: 'starter', label: 'light' },
  { scenario: 'facility-scale', label: 'heavy' },
];

for (const fixture of FIXTURES) {
  test(`render-perf: ${fixture.scenario} (${fixture.label}) frame metrics are measurable and recorded`, async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    const run = await loadAndSample(page, fixture.scenario, pageErrors);

    // ---- unmeasurable is a first-class outcome, not a zero -----------------
    if (!run.rafLive) {
      const note = {
        scenario: fixture.scenario,
        status: 'UNMEASURABLE',
        reason:
          `requestAnimationFrame delivered only ${run.probeFrames} frames in a 1000ms probe. ` +
          'The tab is throttled or hidden, so state.metrics.frameMs/renderMs are stale values ' +
          'from whenever the loop last ran. No render frame time is being reported for this run.',
      };
      fs.writeFileSync(
        path.join(RUN_DIR, `${fixture.scenario}-frame-metrics.json`),
        JSON.stringify(note, null, 2),
      );
      console.log(`[render-perf] ${fixture.scenario}: UNMEASURABLE — ${note.reason}`);
      expect(run.rafLive, note.reason).toBe(true);
      return;
    }

    expect(
      run.samples.length,
      `only ${run.samples.length} frames in a ${SAMPLE_WINDOW_MS}ms window — too few to characterise frame time`,
    ).toBeGreaterThanOrEqual(MIN_SAMPLES);

    const frameMs = stats(run.samples.map((s) => s.frameMs));
    const renderMs = stats(run.samples.map((s) => s.renderMs));
    const rafJankMs = stats(run.samples.map((s) => s.rafJankMs));
    const dropped = stats(run.samples.map((s) => s.rafDroppedFrames));
    const tickMs = stats(run.samples.map((s) => s.tickMs));

    // Smoothness, expressed as the shape of the distribution rather than a
    // single average: a station that renders at a steady 40ms is playable, one
    // that averages 40ms by alternating 8ms and 200ms is not.
    const overBudget = run.samples.filter((s) => s.frameMs > TARGET_FRAME_MS).length;
    const overDoubleBudget = run.samples.filter((s) => s.frameMs > TARGET_FRAME_MS * 2).length;
    const record = {
      scenario: fixture.scenario,
      weight: fixture.label,
      status: 'MEASURED',
      environment: 'headless Chromium, software rasteriser — relative signal only, not a GPU frame-time claim',
      windowMs: SAMPLE_WINDOW_MS,
      elapsedMs: Math.round(run.elapsedMs),
      framesSampled: run.samples.length,
      observedFps: Number(((run.samples.length / run.elapsedMs) * 1000).toFixed(2)),
      frameMs,
      renderMs,
      rafJankMs,
      rafDroppedFrames: dropped,
      tickMs,
      smoothness: {
        framesOverTargetBudget: overBudget,
        framesOverDoubleTargetBudget: overDoubleBudget,
        jitterP95OverMedian: Number((frameMs.p95 / Math.max(frameMs.median, 0.001)).toFixed(2)),
      },
    };
    fs.writeFileSync(
      path.join(RUN_DIR, `${fixture.scenario}-frame-metrics.json`),
      JSON.stringify(record, null, 2),
    );
    console.log(`[render-perf] ${fixture.scenario}:`, JSON.stringify(record.frameMs), JSON.stringify(record.renderMs));

    // ---- the metrics are real -------------------------------------------
    for (const key of ['frameMs', 'renderMs', 'rafJankMs', 'rafDroppedFrames'] as const) {
      const values = run.samples.map((s) => s[key]);
      expect(
        values.every((v) => Number.isFinite(v)),
        `${key} produced a non-finite sample: ${values.filter((v) => !Number.isFinite(v)).join(', ')}`,
      ).toBe(true);
    }
    expect(frameMs.min, 'frameMs must be strictly positive on a live rAF loop').toBeGreaterThan(0);
    expect(renderMs.min, 'renderMs must be strictly positive — the renderer did no measurable work').toBeGreaterThan(0);

    // Staleness guard. rafDroppedFrames is derived from frameMs in the same
    // frame; if they disagree the metric is a leftover from an earlier frame
    // and every number above would be describing the past.
    const expectedDrops = Math.max(0, Math.round(frameMs.median / TARGET_FRAME_MS) - 1);
    expect(
      Math.abs(dropped.median - expectedDrops),
      `rafDroppedFrames median ${dropped.median} does not follow from frameMs median ` +
        `${frameMs.median.toFixed(1)}ms (expected ~${expectedDrops}) — the metric is stale`,
    ).toBeLessThanOrEqual(1);

    // rafJankMs is frameMs over budget, clamped at zero.
    const jankDelta = Math.abs(rafJankMs.median - Math.max(0, frameMs.median - TARGET_FRAME_MS));
    expect(jankDelta, 'rafJankMs must be frameMs above the 60fps budget').toBeLessThan(1);

    // ---- regression ceiling ---------------------------------------------
    expect(
      renderMs.median,
      `median render time ${renderMs.median.toFixed(1)}ms on ${fixture.scenario} exceeds the ` +
        `${RENDER_MS_MEDIAN_CEILING}ms ceiling — the render pass has become the frame budget`,
    ).toBeLessThan(RENDER_MS_MEDIAN_CEILING);

    expect(pageErrors, `pageerrors while sampling frames:\n${pageErrors.join('\n')}`).toHaveLength(0);
  });
}

test('render-perf: a dead rAF loop reports unmeasurable instead of a number', async ({ page }) => {
  // The honesty guard, tested directly. `state.metrics.frameMs` is only
  // rewritten inside `frame()`, so when rAF stops the field keeps whatever the
  // last live frame left there — a plausible-looking number that describes the
  // past. A sampler without a liveness probe would record it (or a zero) as
  // this commit's frame time. Here rAF is stubbed out so no frame can ever
  // fire, and the sampler must come back empty rather than confident.
  await page.goto('/?scenario=starter');
  await page.waitForFunction(() => window.__harnessReady === true, { timeout: 15_000 });

  const live = await sampleFrames(page, 600);
  expect(live.rafLive, 'a foregrounded harness page must have a live rAF loop').toBe(true);
  expect(live.samples.length, 'a live loop must produce samples').toBeGreaterThan(0);
  const staleFrameMs = live.samples[live.samples.length - 1].frameMs;

  await page.evaluate(() => {
    // Swallow the callback: no frame ever runs from here on.
    window.requestAnimationFrame = (() => 0) as typeof window.requestAnimationFrame;
  });
  const dead = await sampleFrames(page, 600);

  const stillReadable = await page.evaluate(() => (window.__harnessGetMetrics() as Record<string, number>).frameMs);

  const verdict = {
    liveProbeFrames: live.probeFrames,
    liveFrames: live.samples.length,
    deadProbeFrames: dead.probeFrames,
    deadFrames: dead.samples.length,
    rafLiveWhenDead: dead.rafLive,
    staleFrameMsStillReadable: stillReadable,
    lastLiveFrameMs: staleFrameMs,
    note:
      'state.metrics.frameMs is still readable with rAF dead — that is exactly the trap. ' +
      'The sampler refuses to report it because no frame was observed.',
  };
  fs.writeFileSync(path.join(RUN_DIR, 'raf-liveness-guard.json'), JSON.stringify(verdict, null, 2));
  console.log('[render-perf] rAF liveness guard:', JSON.stringify(verdict));

  expect(dead.rafLive, 'a stalled rAF loop must be reported as not live').toBe(false);
  expect(dead.samples, 'a window with no frames must produce no samples').toHaveLength(0);
  // And the trap is real: the stale metric is still sitting there, readable.
  expect(Number.isFinite(stillReadable)).toBe(true);
});
