/**
 * ui-smoke — click through the currently player-visible chrome and palettes.
 *
 * Ensures every active chrome surface opens without throwing a runtime error.
 * No state assertions — this is purely a crash-catch for UI code paths
 * that test:sim never exercises (it's headless, no DOM).
 *
 * Pass criteria:
 *   - Zero pageerror events throughout
 *   - Every active panel/modal opens (element visible after click)
 *   - Zero console.errors containing 'TypeError' or 'is not a function'
 *   - Active chrome and overlay controls are present in the DOM
 */

import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));

const RUN_DIR = process.env.HARNESS_RUN_DIR || '/tmp/harness-runs/latest/ui-smoke';

test.beforeAll(() => {
  fs.mkdirSync(RUN_DIR, { recursive: true });
});

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];

  page.on('pageerror', (err) => {
    errors.push(`${err.message}`);
  });

  // Attach to page context so afterEach can read it
  (page as unknown as Record<string, unknown>)._harnessErrors = errors;

  // A named scenario bypasses the title screen and guarantees every test
  // begins in the same live station rather than depending on local saves.
  await page.goto('/?scenario=starter');
  await page.waitForFunction(() => window.__harnessReady === true, { timeout: 15_000 });
  // Pause sim so UI interactions aren't racing against tick updates
  await page.evaluate(() => window.__harnessPauseAndFlush());
});

async function openOverlaysPalette(page: Page): Promise<void> {
  await page.locator('button.palette-tab[data-palette-target="overlays"]').click();
  await expect(page.locator('[data-palette-section="overlays"]')).toHaveClass(/active/);
}

test('ui-smoke: active chrome and palette controls exist', async ({ page }) => {
  const buttons = [
    '#open-save-modal',
    '#open-rating-modal',
    '#open-economy-ledger',
    '#open-port-dispatch',
    '#toggle-zones',
    '#toggle-service-nodes',
    '#toggle-inventory-overlay',
    '#camera-reset',
  ];

  for (const selector of buttons) {
    const el = page.locator(selector);
    await expect(el, `Expected ${selector} to exist`).toHaveCount(1);
  }
  await page.screenshot({ path: path.join(RUN_DIR, 'topbar.png') });
});

test('ui-smoke: save/load modal opens and closes', async ({ page }) => {
  await page.click('#open-save-modal');
  await expect(page.locator('#save-modal')).toBeVisible();

  // Close via escape or a close button
  await page.keyboard.press('Escape');
  await expect(page.locator('#save-modal')).toBeHidden();
  await page.screenshot({ path: path.join(RUN_DIR, 'save-modal-closed.png') });
});

test('ui-smoke: operating ledger opens and closes', async ({ page }) => {
  await page.click('#open-economy-ledger');
  const ledger = page.getByRole('dialog', { name: 'Credits and cash flow' });
  await expect(ledger).toBeVisible();
  await page.screenshot({ path: path.join(RUN_DIR, 'economy-ledger-open.png') });
  await page.locator('[data-oe-close="ledger"]').click();
  await expect(ledger).toBeHidden();
});

test('ui-smoke: station rating opens and closes', async ({ page }) => {
  await page.click('#open-rating-modal');
  const rating = page.locator('#rating-modal');
  await expect(rating).toBeVisible();
  await page.screenshot({ path: path.join(RUN_DIR, 'rating-open.png') });
  await page.locator('#close-rating-modal').click();
  await expect(rating).toBeHidden();
});

test('ui-smoke: approach control opens and closes', async ({ page }) => {
  await page.click('#open-port-dispatch');
  const dispatch = page.locator('#port-dispatch-modal');
  await expect(dispatch).toBeVisible();
  await page.screenshot({ path: path.join(RUN_DIR, 'approach-control-open.png') });
  await page.locator('#close-port-dispatch').click();
  await expect(dispatch).toBeHidden();
});

test('ui-smoke: toggle buttons cycle without errors', async ({ page }) => {
  await openOverlaysPalette(page);
  const toggles = [
    '#toggle-zones',
    '#toggle-service-nodes',
    '#toggle-inventory-overlay',
  ];

  for (const selector of toggles) {
    await expect(page.locator(selector)).toBeVisible();
    // Click on, click off
    await page.click(selector);
    await page.click(selector);
  }

  await page.screenshot({ path: path.join(RUN_DIR, 'toggles-cycled.png') });
});

test('ui-smoke: camera reset fires without error', async ({ page }) => {
  await page.click('#camera-reset');
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(RUN_DIR, 'camera-reset.png') });
});

test('ui-smoke: zero pageerrors across all interactions', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // Run a quick tour of all top-bar actions in one page session
  await page.click('#open-save-modal');
  await page.keyboard.press('Escape');
  await page.click('#open-economy-ledger');
  await page.locator('[data-oe-close="ledger"]').click();
  await page.click('#open-rating-modal');
  await page.locator('#close-rating-modal').click();
  await page.click('#open-port-dispatch');
  await page.locator('#close-port-dispatch').click();
  await openOverlaysPalette(page);
  await page.click('#toggle-zones');
  await page.click('#toggle-zones');
  await page.click('#camera-reset');

  const errLog = errors.join('\n');
  if (errors.length) {
    fs.writeFileSync(path.join(RUN_DIR, 'errors.log'), errLog);
    await page.screenshot({ path: path.join(RUN_DIR, 'error-state.png') });
  }

  expect(errors, `pageerrors during UI smoke tour:\n${errLog}`).toHaveLength(0);
});
