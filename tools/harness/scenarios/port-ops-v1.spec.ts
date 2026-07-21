import { expect, test, type Page } from '@playwright/test';

async function openStarter(page: Page): Promise<void> {
  await page.goto('/?scenario=starter');
  await page.waitForFunction(() => window.__harnessReady === true, { timeout: 15_000 });
}

async function revealOpeningOffers(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.evaluate(() => window.__harnessAdvanceSim(5, 0.1));
  await expect(page.locator('.traffic-offer')).toHaveCount(3);
}

async function reservePassenger(page: Page): Promise<void> {
  await page.evaluate(() => {
    const button = document.querySelector<HTMLButtonElement>('button[data-traffic-action="assign"][data-offer-id="1"]');
    if (!button) throw new Error('Passenger Reserve button missing.');
    button.click();
  });
}

test('port ops: starter presents three distinct choices and no legacy core marker', async ({ page }) => {
  await openStarter(page);
  await revealOpeningOffers(page);

  await expect(page.getByText('PASSENGER · medium tourist · low risk')).toBeVisible();
  await expect(page.getByText('FREIGHT · medium industrial · guarded risk')).toBeVisible();
  await expect(page.getByText('MIXED · medium trader · guarded risk')).toBeVisible();
  await expect(page.locator('#shift-brief')).toContainText('Reserve one manifest, then staff its promise');
  await expect(page.locator('.crew-plan-verdict')).toHaveCount(3);
  await expect(page.getByLabel('Station status')).toContainText('Prepared Meals');
  await expect(page.locator('.legacy-ui:visible')).toHaveCount(0);

  const dispatchLayout = await page.locator('.port-dispatch-card').evaluate((element) => ({
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
    overflowY: getComputedStyle(element).overflowY
  }));
  expect(dispatchLayout.scrollHeight).toBeLessThanOrEqual(dispatchLayout.clientHeight + 1);
  expect(dispatchLayout.overflowY).not.toBe('auto');

  const snapshot = await page.evaluate(() => window.__harnessGetState() as {
    snapshot: { portOps: { contracts: unknown[] }; activePortShips: unknown[] };
  });
  expect(snapshot.snapshot.portOps.contracts).toHaveLength(0);
  expect(snapshot.snapshot.activePortShips).toHaveLength(0);
});

test('port ops: optional city lenses and Dock pod construction are available', async ({ page }) => {
  await openStarter(page);
  await expect(page.getByRole('button', { name: 'Overlays', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Overlays', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Normal View', exact: true })).toBeVisible();
  const cleanliness = page.getByRole('button', { name: 'Cleanliness: Off', exact: true });
  await cleanliness.click();
  await expect(cleanliness).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Normal View', exact: true }).click();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await expect(page.getByTitle('Dock (3)')).toBeVisible();
});

test('port ops: passenger promise settles and keeps the berth and crew healthy', async ({ page }) => {
  await openStarter(page);
  await revealOpeningOffers(page);
  await reservePassenger(page);
  await expect(page.locator('#shift-brief')).toContainText('SHORT 2 Service');
  await page.getByRole('button', { name: 'Add service crew', exact: true }).click();
  await page.getByRole('button', { name: 'Add service crew', exact: true }).click();
  await expect(page.locator('#shift-brief')).toContainText('Safe plan ready');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.evaluate(() => window.__harnessAdvanceSim(130, 0.1));
  await page.evaluate(() => window.__harnessPauseAndFlush());

  await expect(page.locator('#settlement-summary')).toContainText('Prepared meals');
  await expect(page.locator('#settlement-summary')).toContainText('Passengers returned');
  await expect(page.locator('#settlement-summary')).toContainText('contract');
  await expect(page.getByRole('button', { name: 'Dismiss turnaround report' })).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss turnaround report' }).click();
  await expect(page.locator('#settlement-summary')).toContainText('Turnaround report dismissed');
  await expect(page.locator('#settlement-summary')).toContainText('Recent turnarounds');
  const metrics = await page.evaluate(() => window.__harnessGetMetrics() as { deathsTotal: number });
  expect(metrics.deathsTotal).toBe(0);
  await expect(page.locator('#hud-crew')).toHaveText('8');
});

test('port ops: active contract survives save/load and settles once', async ({ page }) => {
  await openStarter(page);
  await revealOpeningOffers(page);
  await reservePassenger(page);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.evaluate(() => window.__harnessAdvanceSim(32, 0.1));
  const save = await page.evaluate(() => window.__harnessExportSave());

  await page.reload();
  await page.waitForFunction(() => window.__harnessReady === true, { timeout: 15_000 });
  await page.evaluate((json) => window.__harnessLoadSave(json), save);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.evaluate(() => window.__harnessAdvanceSim(130, 0.1));

  const snapshot = await page.evaluate(() => window.__harnessGetState() as {
    snapshot: { portOps: { settlements: unknown[]; contracts: Array<{ status: string }> } };
  });
  expect(snapshot.snapshot.portOps.settlements).toHaveLength(1);
  expect(snapshot.snapshot.portOps.contracts[0]?.status).toBe('departed');
});

test('port ops: cargo fault alert focuses the affected equipment', async ({ page }) => {
  await openStarter(page);
  const save = await page.evaluate(() => JSON.parse(window.__harnessExportSave()) as {
    snapshot: { portOps: { cargoArmStatus: string; cargoArmStrain: number } };
  });
  save.snapshot.portOps.cargoArmStatus = 'fault';
  save.snapshot.portOps.cargoArmStrain = 100;
  await page.evaluate((payload) => window.__harnessLoadSave(JSON.stringify(payload)), save);
  await expect(page.locator('#alert-list button')).toContainText('Cargo arm stopped');
  await page.evaluate(() => document.querySelector<HTMLButtonElement>('#alert-list button')?.click());
  await expect(page.locator('#selection-summary')).not.toContainText('No room');
});

test('port ops: offer and operations surfaces fit a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStarter(page);
  await revealOpeningOffers(page);
  await expect(page.locator('.traffic-offer').first()).toBeVisible();
  await expect(page.locator('.ops-card')).toBeVisible();
  const overflow = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth
  }));
  expect(overflow.scroll).toBeLessThanOrEqual(overflow.viewport + 1);
});
