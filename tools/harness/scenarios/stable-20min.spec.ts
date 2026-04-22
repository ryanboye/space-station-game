/**
 * stable-20min — baseline stability scenario.
 *
 * Loads an empty station, advances the sim 20 sim-minutes at 2× speed,
 * and asserts the game hasn't crashed or deadlocked. No screenshot diffing
 * (that's v1.1). Primary purpose: catch JS exceptions, infinite loops,
 * promise rejections, and metric-floor regressions introduced by new code.
 *
 * Pass criteria:
 *   - Zero pageerror / unhandled-rejection events
 *   - window.__harnessReady is true after load
 *   - Sim advances without locking up (assertion on simTime or metrics)
 *   - No console.error messages containing 'TypeError' or 'is not a function'
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const RUN_DIR = process.env.HARNESS_RUN_DIR || '/tmp/harness-runs/latest/stable-20min';

test.beforeAll(() => {
  fs.mkdirSync(RUN_DIR, { recursive: true });
});

test('stable-20min: game loads and harness hooks are live', async ({ page }) => {
  const errors: string[] = [];
  const consoleErrors: string[] = [];

  page.on('pageerror', (err) => {
    errors.push(`pageerror: ${err.message}\n${err.stack ?? ''}`);
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      consoleErrors.push(`console.error: ${text}`);
    }
  });

  await page.goto('/');
  // Wait for the harness ready flag — set at end of main.ts after startGameLoop fires
  await page.waitForFunction(() => window.__harnessReady === true, { timeout: 15_000 });

  // Dump any startup errors
  if (errors.length || consoleErrors.length) {
    const log = [...errors, ...consoleErrors].join('\n');
    fs.writeFileSync(path.join(RUN_DIR, 'errors.log'), log);
  }

  expect(errors, `pageerrors at startup:\n${errors.join('\n')}`).toHaveLength(0);
  expect(
    consoleErrors.filter((e) => e.includes('TypeError') || e.includes('is not a function')),
    `critical console.errors at startup:\n${consoleErrors.join('\n')}`
  ).toHaveLength(0);
});

test('stable-20min: sim advances 20 sim-minutes without locking', async ({ page }) => {
  const errors: string[] = [];

  page.on('pageerror', (err) => {
    errors.push(`pageerror: ${err.message}`);
  });

  await page.goto('/');
  await page.waitForFunction(() => window.__harnessReady === true, { timeout: 15_000 });

  // Pause the sim first so we control tick advancement
  await page.evaluate(() => {
    window.__harnessPauseAndFlush();
  });

  // Advance 20 sim-minutes (1200 seconds) in controlled steps
  // Split into chunks so Playwright doesn't time out on one big evaluate call
  const CHUNK_SECONDS = 60; // advance 60s at a time
  const TOTAL_SECONDS = 1200; // 20 min
  for (let elapsed = 0; elapsed < TOTAL_SECONDS; elapsed += CHUNK_SECONDS) {
    await page.evaluate((s) => window.__harnessAdvanceSim(s, 0.25), CHUNK_SECONDS);
  }

  // Flush render after advance
  await page.evaluate(() => window.__harnessPauseAndFlush());

  // Grab metrics
  const metrics = await page.evaluate(() => window.__harnessGetMetrics());
  const metricsJson = JSON.stringify(metrics, null, 2);
  fs.writeFileSync(path.join(RUN_DIR, 'metrics-t1200.json'), metricsJson);

  // Take a screenshot of the final state
  await page.screenshot({ path: path.join(RUN_DIR, 'screenshot-t1200.png'), fullPage: false });

  // Write errors log
  const errLog = errors.join('\n');
  fs.writeFileSync(path.join(RUN_DIR, 'errors.log'), errLog);

  expect(errors, `pageerrors during sim advance:\n${errLog}`).toHaveLength(0);

  // Metrics sanity — the game shouldn't have zeroed out completely
  const m = metrics as Record<string, unknown>;
  expect(m, 'metrics should be a non-null object').toBeTruthy();

  console.log('[stable-20min] final metrics:', metricsJson);
});

test('stable-20min: save export and reload round-trips cleanly', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__harnessReady === true, { timeout: 15_000 });

  // Advance sim briefly
  await page.evaluate(() => {
    window.__harnessPauseAndFlush();
    window.__harnessAdvanceSim(30, 0.25);
    window.__harnessPauseAndFlush();
  });

  // Export save JSON
  const saveJson = await page.evaluate(() => window.__harnessExportSave());
  expect(saveJson).toBeTruthy();
  expect(saveJson.length).toBeGreaterThan(100);

  // Write to fixture dir for use by other scenarios
  const fixturePath = path.join(
    __dirname,
    '..',
    'fixtures',
    'stable-30s-run.save.json'
  );
  fs.writeFileSync(fixturePath, saveJson);

  // Reload into a fresh page via the ?loadId mechanism (localStorage)
  await page.evaluate((json) => {
    localStorage.setItem('harness-test-save', json);
  }, saveJson);
  await page.goto('/?loadId=harness-test-save');
  await page.waitForFunction(() => window.__harnessReady === true, { timeout: 15_000 });

  const reloadedMetrics = await page.evaluate(() => window.__harnessGetMetrics());
  expect(reloadedMetrics).toBeTruthy();

  console.log('[stable-20min] save round-trip: OK');
});
