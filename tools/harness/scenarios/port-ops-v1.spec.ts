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

type StagedOffer = {
  id: number;
  lane: 'north' | 'east' | 'south' | 'west';
  risk: 'low' | 'guarded' | 'high';
  /** `cleared` is already-accepted work; anything else is still a decision. */
  status?: 'forecast' | 'holding' | 'cleared';
  /** Index into the station's own Pod Docks. Keeps the binding physical. */
  dockIndex?: number;
};

/**
 * Put a known set of approach offers on the board.
 *
 * Natural traffic depends on a Berth existing and on RNG timing, which makes a
 * card assertion a coin flip. Injecting through the save round-trip keeps the
 * offers real (they hydrate through the same path a loaded station uses) while
 * pinning the lane, risk and interface each card has to describe.
 */
async function stageOffers(page: Page, offers: StagedOffer[]): Promise<void> {
  await page.evaluate((staged) => {
    const save = JSON.parse(window.__harnessExportSave()) as {
      snapshot: {
        simTime: number;
        trafficOffers: unknown[];
        dockConfigs: Array<{ sourceKey: string }>;
      };
    };
    const now = save.snapshot.simTime ?? 0;
    const docks = save.snapshot.dockConfigs ?? [];
    save.snapshot.trafficOffers = staged.map((entry, index) => ({
      id: entry.id,
      callsign: `STAGED-${entry.id}`,
      shipName: 'courier pod',
      lane: entry.lane,
      shipType: 'tourist',
      hullVariant: 'courier-pod',
      offerKind: 'passenger',
      size: 'small',
      status: entry.status ?? 'forecast',
      forecastAt: now,
      // Far enough out that nothing docks mid-assertion.
      arrivesAt: now + 300,
      expiresAt: now + 900,
      passengersTotal: 2,
      manifestDemand: { cafeteria: 1, market: 0, lounge: 0 },
      manifestMix: { diner: 1, shopper: 0, lounger: 0, rusher: 0 },
      hospitalityDemand: { meal: 1, drink: 0, leisure: 0, restroom: 1, hygiene: 0, comfort: 0 },
      inboundCargo: { rawMaterial: 0, rawMeal: 0, tradeGood: 0 },
      outboundRequest: { rawMaterial: 0, meal: 0, tradeGood: 0 },
      requestedServices: [],
      berthTimeSec: 120,
      dockingFee: 30,
      projectedSpend: 40,
      riskLabel: entry.risk,
      assignedBerthAnchor: null,
      assignedDockSourceKey: docks[entry.dockIndex ?? index]?.sourceKey ?? null
    }));
    window.__harnessLoadSave(JSON.stringify(save));
    document.querySelector<HTMLButtonElement>('#open-port-dispatch')?.click();
  }, offers);
  await expect(page.locator('.traffic-offer.decision-card')).toHaveCount(offers.length);
}

/**
 * Force one deterministic frame and read what the world actually drew.
 *
 * The approach envelope, its facing arrow and its verdict live on the canvas,
 * so the only honest way to assert them from a browser test is to record the
 * text the renderer emits while it draws. `fillText` is wrapped for exactly one
 * flush and restored immediately; nothing in the app is modified.
 */
async function captureWorld(page: Page): Promise<{ image: string; labels: string[] }> {
  return page.evaluate(() => {
    const proto = CanvasRenderingContext2D.prototype;
    const original = proto.fillText;
    const labels: string[] = [];
    proto.fillText = function patched(this: CanvasRenderingContext2D, text: string | number, ...rest: number[]) {
      labels.push(String(text));
      return (original as (...args: unknown[]) => void).call(this, text, ...rest);
    } as typeof proto.fillText;
    try {
      window.__harnessPauseAndFlush();
    } finally {
      proto.fillText = original;
    }
    const canvas = document.querySelector<HTMLCanvasElement>('#game');
    if (!canvas) throw new Error('World canvas missing.');
    return { image: canvas.toDataURL(), labels };
  });
}

function approachLabels(labels: string[]): string[] {
  return labels.filter((label) => /APPROACH|ACCEPTED WORK CONFLICT/.test(label));
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

// An offer card is a decision surface, so it has to say which physical lane the
// silhouette is on, which interface and side it would take, and how risky the
// call is — the three facts that decide Accept/Hold/Pass.
test('port ops: an offer card names its lane, interface, approach side and risk', async ({ page }) => {
  await openStarter(page);
  await stageOffers(page, [
    { id: 90101, lane: 'north', risk: 'low', dockIndex: 0 },
    { id: 90102, lane: 'east', risk: 'high', dockIndex: 1 }
  ]);

  const first = page.locator('.traffic-offer.decision-card').first();
  await expect(first).toHaveAttribute('data-offer-lane', 'north');
  await expect(first.locator('.traffic-offer-lane')).toHaveText('NORTH LANE');
  await expect(first.locator('.traffic-offer-timer')).toContainText('ETA');

  // Compatible interface plus the side it is approached from.
  const choice = first.locator('.traffic-interface-choice');
  await expect(choice).toHaveCount(1);
  await expect(choice).not.toHaveClass(/is-blocked/);
  await expect(choice.locator('b')).not.toHaveText('');
  await expect(choice.locator('span')).toHaveText(/^(NORTH|EAST|SOUTH|WEST) APPROACH$/i);

  // The risk label that gates finite admission is visible on the card itself.
  await expect(first.locator('.traffic-risk-cue')).toHaveText('LOW RISK');
  const risky = page.locator('.traffic-offer.decision-card[data-traffic-offer-id="90102"]');
  await expect(risky.locator('.traffic-offer-lane')).toHaveText('EAST LANE');
  await expect(risky.locator('.traffic-risk-cue')).toHaveText('HIGH RISK');
  await expect(risky.locator('.traffic-risk-cue')).toHaveClass(/risk-high/);

  // Lane and risk must not cost the card a line: the chip row stays one row.
  const chipRow = await first.locator('.traffic-cues').evaluate((element) => ({
    row: element.getBoundingClientRect().height,
    chip: element.firstElementChild?.getBoundingClientRect().height ?? 0
  }));
  expect(chipRow.chip).toBeGreaterThan(0);
  expect(chipRow.row).toBeLessThanOrEqual(chipRow.chip + 1);

  // Nor may they widen it: the checklist separately forbids overwide panels.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(first.locator('.traffic-offer-lane')).toBeVisible();
  const overflow = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth
  }));
  expect(overflow.scroll).toBeLessThanOrEqual(overflow.viewport + 1);
});

// Hovering or focusing a card has to answer "where does this thing physically
// go?" in the world, not just in the panel.
test('port ops: focusing an offer projects its approach envelope into the world', async ({ page }) => {
  await openStarter(page);
  await stageOffers(page, [{ id: 90201, lane: 'north', risk: 'low', dockIndex: 0 }]);

  const card = page.locator('.traffic-offer.decision-card').first();
  await expect(card).toHaveAttribute('data-offer-slot-id', /^(dock|berth):/);
  await expect(card).toHaveAttribute('data-offer-hull-variant', /\S/);
  await expect(card).toHaveAttribute('data-offer-size', 'small');

  const idle = await captureWorld(page);
  expect(approachLabels(idle.labels)).toHaveLength(0);

  await card.focus();
  const projected = await captureWorld(page);
  expect(approachLabels(projected.labels).join(' | ')).toMatch(/APPROACH/);
  expect(projected.image).not.toBe(idle.image);

  // Leaving the card takes the projection back off the world.
  await card.evaluate((element) => (element as HTMLElement).blur());
  const cleared = await captureWorld(page);
  expect(approachLabels(cleared.labels)).toHaveLength(0);
});

// A candidate that shares its approach with work the player already accepted is
// the conflict that actually costs a turnaround, so it must escalate past the
// ordinary "serializes" wording.
test('port ops: a candidate sharing an approach with accepted work is called out', async ({ page }) => {
  await openStarter(page);
  await stageOffers(page, [
    { id: 90301, lane: 'north', risk: 'low', status: 'cleared', dockIndex: 0 },
    { id: 90302, lane: 'north', risk: 'low', dockIndex: 1 }
  ]);
  await expect(page.locator('.traffic-offer.decision-card.is-cleared')).toHaveCount(1);

  const candidate = page.locator('.traffic-offer.decision-card[data-traffic-offer-id="90302"]');
  await candidate.focus();
  const projected = await captureWorld(page);
  expect(approachLabels(projected.labels).join(' | ')).toMatch(/ACCEPTED WORK CONFLICT: Pod Dock \d+/);
});
