/**
 * visual-baselines — retain committed screenshots so visual claims have an
 * artifact behind them.
 *
 * The checklist rule "every visual item has an inspected screenshot or
 * live-browser observation" had nothing durable standing behind it. The other
 * scenarios do take screenshots, but they write them to `HARNESS_RUN_DIR`
 * (`/tmp/harness-runs/`, gitignored) and `playwright.config.ts` only keeps a
 * failure screenshot under `test-results/` (also gitignored). Nothing survived
 * the run, so "I looked at it" was the whole evidence trail.
 *
 * These three baselines are committed under `tools/harness/baselines/` and are
 * both the artifact and the regression check: a visual change to any of the
 * three surfaces below has to be re-inspected and re-blessed with
 * `npm run test:harness:update-snapshots` before the suite goes green again.
 *
 * DETERMINISM — what makes these stable enough to commit
 *
 * Two things move a canvas screenshot between runs even on identical state:
 *   1. CSS/DOM animation. Handled by `reducedMotion: 'reduce'` (which also
 *      makes `renderTimeSeconds()` in src/render/render.ts return a constant 0,
 *      killing the periodic shimmer) plus `animations: 'disabled'`.
 *   2. Wall-clock animation inside the renderer. `renderClockSeconds()` and
 *      `nowSec()` (src/render/render.ts) read `performance.now()` directly and
 *      are NOT gated on reduced motion — they drive fixture deployment easing
 *      and mood tinting. Left alone, two screenshots of the same paused
 *      station differ. `performance.now()` is therefore pinned to a constant
 *      before the page loads, which makes every easing step dt=0 and every
 *      time-keyed cache stable.
 *
 * Measured after both fixes: byte-identical PNGs across repeated captures in
 * one session AND across a full reload, on all three fixtures. The remaining
 * tolerance below is for cross-machine rasterisation only.
 *
 * Third hazard, handled by assertion rather than by pinning: the sprite atlas
 * loads asynchronously and retries. A baseline captured mid-load would record
 * the fallback renderer instead of the real art, so every capture asserts
 * "Sprites active" first and fails loudly rather than blessing the wrong art.
 *
 * Pass criteria:
 *   - Sprite atlas is confirmed active before any capture
 *   - The captured region is confirmed to contain real content, not a flat
 *     fill (a stable screenshot of nothing is stable and worthless)
 *   - Each capture matches its committed baseline
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const RUN_DIR = process.env.HARNESS_RUN_DIR || '/tmp/harness-runs/latest/visual-baselines';

/**
 * Kept small on purpose: this is evidence, not a gallery. A 480x320 window on
 * the canvas is ~120KB per PNG and still shows floors, fixtures, walls and
 * agents at full detail.
 */
const CAPTURE_WIDTH = 480;
const CAPTURE_HEIGHT = 320;

/**
 * Cross-machine rasterisation tolerance. Locally the same fixture renders
 * byte-identical, so anything above noise here is a real visual change.
 */
const MAX_DIFF_PIXEL_RATIO = 0.002;

/** Sim seconds advanced before capture — enough for agents to be doing something. */
const ADVANCE_SECONDS = 20;

interface SubjectFacts {
  dirtyTiles: number;
  /** Text of the on-screen diagnostic readout, i.e. proof of which overlay is drawn. */
  diagnosticOverlay: string;
  diagnosticKey: string;
  moduleInstances: number;
  crewMembers: number;
}

interface Baseline {
  /** Baseline file stem; the committed file is `<name>-<platform>.png`. */
  name: string;
  scenario: string;
  /** What a reviewer is supposed to be looking at in this image. */
  shows: string;
  /**
   * The caption above, restated as something the simulation can be asked.
   * A screenshot whose label is only backed by "I looked at it" drifts into a
   * lie the first time a scenario changes underneath it; this keeps the claim
   * and the image failing together.
   */
  subjectIsPresent: (facts: SubjectFacts) => string | null;
}

const BASELINES: Baseline[] = [
  {
    name: 'starter-opening',
    scenario: 'starter',
    shows: 'the opening station a new player sees: hull, floors, the authored fixtures and starting crew',
    subjectIsPresent: (f) =>
      f.moduleInstances > 0 && f.crewMembers > 0
        ? null
        : `starter should render an authored station with crew; got ${f.moduleInstances} modules, ${f.crewMembers} crew`,
  },
  {
    name: 'sanitation-overlay-filthy',
    scenario: 'entropy-sanitation',
    shows:
      'the sanitation diagnostic overlay running live over a dirty station — the overlay legend at the left ' +
      'edge, a filthy-tinted room at the right',
    subjectIsPresent: (f) =>
      f.dirtyTiles > 0 && /filthy|grime|clean/i.test(f.diagnosticKey)
        ? null
        : `expected a dirty station under the sanitation overlay; got dirtyTiles=${f.dirtyTiles}, ` +
          `readout="${f.diagnosticOverlay}", legend="${f.diagnosticKey}"`,
  },
  {
    name: 'facility-scale-buildout',
    scenario: 'facility-scale',
    shows:
      'a fully built-out station at operating scale: named commercial rooms, installed fixtures, and a full crew — ' +
      'the visual comparison point for the opening station above',
    subjectIsPresent: (f) =>
      f.moduleInstances > 40
        ? null
        : `facility-scale should be a dense build-out; only ${f.moduleInstances} module instances placed`,
  },
];

test.use({ reducedMotion: 'reduce', viewport: { width: 1280, height: 900 } });

test.beforeAll(() => {
  fs.mkdirSync(RUN_DIR, { recursive: true });
});

test.beforeEach(async ({ page }) => {
  // Must be installed before any page script runs: the renderer captures
  // easing baselines on its very first draw.
  await page.addInitScript(() => {
    const PINNED_MS = 100_000;
    try {
      Object.defineProperty(performance, 'now', { value: () => PINNED_MS, configurable: true });
    } catch {
      /* if the environment refuses, the capture assertions below will catch the churn */
    }
  });
});

for (const baseline of BASELINES) {
  test(`visual-baselines: ${baseline.name} matches its committed screenshot`, async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto(`/?scenario=${baseline.scenario}`);
    await page.waitForFunction(() => window.__harnessReady === true, { timeout: 15_000 });

    // The atlas load is async with a retry timer. Capturing before it lands
    // would bless the fallback renderer as the baseline.
    await expect(
      page.locator('#sprite-status'),
      'sprite atlas never became active — a baseline captured now would record fallback art',
    ).toHaveText(/^Sprites active/, { timeout: 20_000 });

    await page.evaluate((seconds) => {
      window.__harnessPauseAndFlush();
      window.__harnessAdvanceSim(seconds, 0.25);
      window.__harnessPauseAndFlush();
    }, ADVANCE_SECONDS);

    // The caption has to be true of the station actually on screen.
    const facts = await page.evaluate(() => {
      const envelope = window.__harnessGetState() as {
        snapshot: {
          modules?: unknown[];
          crew?: { total?: number; members?: unknown[] };
          controls?: { diagnosticOverlay?: string };
        };
      };
      const metrics = window.__harnessGetMetrics() as Record<string, number>;
      return {
        dirtyTiles: metrics.dirtyTiles ?? -1,
        // The active overlay is a view preference and is deliberately not in
        // the save, so it is read from the surface that proves it is on
        // screen: the diagnostic legend the overlay itself renders.
        diagnosticOverlay: (document.querySelector('#diagnostic-readout')?.textContent ?? '').trim(),
        diagnosticKey: (document.querySelector('#diagnostic-key')?.textContent ?? '').trim(),
        moduleInstances: envelope.snapshot.modules?.length ?? 0,
        crewMembers: envelope.snapshot.crew?.members?.length ?? envelope.snapshot.crew?.total ?? 0,
      };
    });
    const mismatch = baseline.subjectIsPresent(facts);
    expect(
      mismatch,
      `${baseline.name} is captioned "${baseline.shows}" but the station does not back that: ${mismatch}`,
    ).toBeNull();

    // Anchor the capture to the canvas rather than to absolute page
    // coordinates, so a top-bar layout change moves the window with it instead
    // of silently re-framing every baseline. Centred, because the canvas's
    // top-left corner is where the HUD panels sit — a corner capture is mostly
    // a screenshot of DOM overlay, which is not the visual item under review.
    const box = await page.locator('canvas').first().boundingBox();
    expect(box, 'the world canvas must be on screen to capture a baseline').not.toBeNull();
    const offsetX = Math.max(0, Math.round((box!.width - CAPTURE_WIDTH) / 2));
    const offsetY = Math.max(0, Math.round((box!.height - CAPTURE_HEIGHT) / 2));
    const clip = { x: box!.x + offsetX, y: box!.y + offsetY, width: CAPTURE_WIDTH, height: CAPTURE_HEIGHT };

    // A flat screenshot is perfectly stable and proves nothing. Confirm the
    // captured window actually contains a drawn station before blessing it.
    // Read the same rectangle of the canvas backing store the clip covers.
    const ink = await page.evaluate(
      ({ w, h, ox, oy }) => {
        const canvas = document.querySelector('canvas') as HTMLCanvasElement | null;
        if (!canvas) return null;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        const dpr = canvas.width / Math.max(1, canvas.clientWidth);
        const data = ctx.getImageData(
          Math.round(ox * dpr),
          Math.round(oy * dpr),
          Math.min(Math.round(w * dpr), canvas.width - Math.round(ox * dpr)),
          Math.min(Math.round(h * dpr), canvas.height - Math.round(oy * dpr)),
        ).data;
        const counts = new Map<string, number>();
        for (let i = 0; i < data.length; i += 4) {
          const key = `${data[i] >> 4},${data[i + 1] >> 4},${data[i + 2] >> 4}`;
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        const pixels = data.length / 4;
        return {
          pixels,
          distinctColorBuckets: counts.size,
          dominantFraction: Math.max(...counts.values()) / pixels,
        };
      },
      { w: CAPTURE_WIDTH, h: CAPTURE_HEIGHT, ox: offsetX, oy: offsetY },
    );
    expect(ink, 'could not read the canvas to verify the baseline is not blank').not.toBeNull();
    expect(
      ink!.distinctColorBuckets,
      `${baseline.name} captured a near-flat region (${ink!.distinctColorBuckets} colour buckets) — ` +
        'a stable screenshot of nothing is not evidence',
    ).toBeGreaterThan(20);
    expect(
      ink!.dominantFraction,
      `${baseline.name} is ${(ink!.dominantFraction * 100).toFixed(0)}% one colour — the capture window ` +
        'is probably off the station',
    ).toBeLessThan(0.85);

    fs.writeFileSync(
      path.join(RUN_DIR, `${baseline.name}.json`),
      JSON.stringify(
        { name: baseline.name, scenario: baseline.scenario, shows: baseline.shows, clip, ink, facts },
        null,
        2,
      ),
    );
    console.log(
      `[visual-baselines] ${baseline.name} (${baseline.shows}):`,
      JSON.stringify({ ink, facts }),
    );

    await expect(page).toHaveScreenshot(`${baseline.name}.png`, {
      clip,
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: MAX_DIFF_PIXEL_RATIO,
    });

    expect(pageErrors, `pageerrors while capturing ${baseline.name}:\n${pageErrors.join('\n')}`).toHaveLength(0);
  });
}

test('visual-baselines: the committed baseline set stays small and complete', async () => {
  // Guards the "evidence, not a gallery" rule from the other direction: a
  // future capture that balloons the directory, or a baseline that quietly
  // stops being written, both show up here.
  const dir = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'baselines');
  const pngs = fs.readdirSync(dir).filter((f) => f.endsWith('.png'));

  const sizes = Object.fromEntries(pngs.map((f) => [f, fs.statSync(path.join(dir, f)).size]));
  const totalBytes = Object.values(sizes).reduce((a, b) => a + b, 0);
  console.log('[visual-baselines] committed baselines:', JSON.stringify({ sizes, totalBytes }));

  for (const baseline of BASELINES) {
    expect(
      pngs.some((f) => f.startsWith(`${baseline.name}-`)),
      `no committed baseline for ${baseline.name} — run \`npm run test:harness:update-snapshots\` and inspect it`,
    ).toBe(true);
  }
  expect(
    totalBytes,
    `committed baselines total ${(totalBytes / 1024).toFixed(0)}KB across ${pngs.length} files — ` +
      'this directory is evidence, not a gallery',
  ).toBeLessThan(750_000);
});
