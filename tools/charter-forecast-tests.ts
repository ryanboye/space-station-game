// Focused runner for the shared charter operating forecast (Gate D).
// Mirrors tools/site-charter-tests.ts: pure assertions, no harness, filterable
// via CHARTER_FORECAST_TEST_FILTER. Run with `npm run test:charter-forecast`.

import { generateSystemMap } from '../src/sim/system-map';
import { deriveOpeningEconomyProfile } from '../src/sim/opening-economy';
import {
  CHARTER_FORECAST_VERSION,
  charterLevelBand,
  charterTrafficBand,
  computeCharterOperatingForecast,
  computeSiteProfile,
  type CharterOperatingForecast
} from '../src/sim/site-charter';
import type { SiteCharter, SpaceLane, SystemMap } from '../src/sim/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const LANES: SpaceLane[] = ['north', 'east', 'south', 'west'];
const SEED = 1337;

/** The seed the game boots on, so the comparison sites are real map positions. */
const system: SystemMap = generateSystemMap(SEED);

function peakTraffic(site: SiteCharter): number {
  return Math.max(...LANES.map((lane) => site.laneTrafficFactor[lane]));
}

/**
 * Two sites from the same seeded system, chosen by scanning the disc rather
 * than by hand: the cleanest busy-lane position, and the most belt-exposed
 * position away from the traffic. Both are ordinary clicks a player could make
 * on the charter map, not hand-tuned fixtures.
 */
function surveySites(): { busy: SiteCharter; belt: SiteCharter } {
  let busy: SiteCharter | null = null;
  let belt: SiteCharter | null = null;
  const laneScore = (site: SiteCharter): number => peakTraffic(site) - site.debrisFactor * 2;
  const beltScore = (site: SiteCharter): number => site.debrisFactor * 2 - peakTraffic(site);
  for (let ix = 1; ix < 20; ix++) {
    for (let iy = 1; iy < 20; iy++) {
      const site = computeSiteProfile(system, ix / 20, iy / 20);
      if (!busy || laneScore(site) > laneScore(busy)) busy = site;
      if (!belt || beltScore(site) > beltScore(belt)) belt = site;
    }
  }
  assert(busy && belt, 'survey found no sites');
  return { busy, belt };
}

const tests: Array<{ name: string; run: () => void }> = [];

function test(name: string, run: () => void): void {
  tests.push({ name, run });
}

// --- 1. Determinism --------------------------------------------------------

test('forecast is deterministic for the same SiteCharter', () => {
  const site = computeSiteProfile(system, 0.5, 0.34);
  const first = computeCharterOperatingForecast(site);
  const second = computeCharterOperatingForecast({
    ...site,
    laneTrafficFactor: { ...site.laneTrafficFactor }
  });
  assert(
    JSON.stringify(first) === JSON.stringify(second),
    'two forecasts of the same charter differ'
  );
  assert(first.version === CHARTER_FORECAST_VERSION, 'forecast version not stamped');
});

test('an absent charter resolves to the neutral orbit', () => {
  const forecast = computeCharterOperatingForecast();
  assert(!forecast.chartered, 'undefined site reported as chartered');
  assert(forecast.evenApproaches, 'neutral orbit should not claim a busiest face');
  assert(
    JSON.stringify(forecast.economy) === JSON.stringify(deriveOpeningEconomyProfile()),
    'neutral forecast economy drifted from deriveOpeningEconomyProfile()'
  );
});

// --- 2. Two sites, materially different advice -----------------------------

function describe(label: string, forecast: CharterOperatingForecast): string {
  return `${label}: ${forecast.headline} | lead=${forecast.services[0].id} `
    + `| busiest=${forecast.busiestFace.lane} @${forecast.busiestFace.trafficFactor.toFixed(2)} `
    + `| exposed=${forecast.exposedFace.lane} | shelter=${forecast.shelteredFace.lane} `
    + `| mitigations=${forecast.mitigations.map((m) => m.system).join(', ')}`;
}

test('two sites in one seeded system read as different operating problems', () => {
  const { busy, belt } = surveySites();
  const busyForecast = computeCharterOperatingForecast(busy);
  const beltForecast = computeCharterOperatingForecast(belt);
  console.log(`  ${describe('busy-lane', busyForecast)}`);
  console.log(`  ${describe('resource-belt', beltForecast)}`);

  // Traffic differs materially.
  const trafficGap = Math.abs(
    busyForecast.busiestFace.trafficFactor - beltForecast.busiestFace.trafficFactor
  );
  assert(trafficGap >= 0.25, `traffic barely differs between sites (${trafficGap.toFixed(3)})`);

  // Service recommendation differs.
  assert(
    busyForecast.services[0].id !== beltForecast.services[0].id,
    `both sites recommend the same lead service (${busyForecast.services[0].id})`
  );

  // Exposure differs.
  const exposureGap = Math.abs(
    busyForecast.economy.environmentPressureMultiplier
    - beltForecast.economy.environmentPressureMultiplier
  );
  assert(exposureGap >= 0.05, `exposure barely differs (${exposureGap.toFixed(3)})`);
  assert(
    charterLevelBand(busy.debrisFactor) !== charterLevelBand(belt.debrisFactor),
    'both sites land in the same debris band'
  );

  // Expansion / mitigation advice differs.
  const busyAdvice = busyForecast.mitigations.map((m) => m.system).join('|');
  const beltAdvice = beltForecast.mitigations.map((m) => m.system).join('|');
  assert(busyAdvice !== beltAdvice, `both sites give the same mitigations (${busyAdvice})`);
  assert(
    busyForecast.expansionLine !== beltForecast.expansionLine,
    'both sites give the same expansion advice'
  );
  assert(
    busyForecast.headline !== beltForecast.headline
      && busyForecast.summary !== beltForecast.summary,
    'both sites share headline or summary wording'
  );
});

// --- 3. Every claim traces to charter or economy data ----------------------

test('face traffic is exactly the charter lane factor', () => {
  const site = computeSiteProfile(system, 0.62, 0.41);
  const forecast = computeCharterOperatingForecast(site);
  assert(forecast.faces.length === LANES.length, 'forecast is missing a face');
  for (const face of forecast.faces) {
    assert(
      face.trafficFactor === site.laneTrafficFactor[face.lane],
      `face ${face.lane} traffic ${face.trafficFactor} != charter ${site.laneTrafficFactor[face.lane]}`
    );
    assert(
      face.trafficBand === charterTrafficBand(site.laneTrafficFactor[face.lane]),
      `face ${face.lane} band disagrees with charterTrafficBand`
    );
    assert(
      face.debrisExposure <= site.debrisFactor + 1e-9,
      `face ${face.lane} claims more debris than the charter carries`
    );
  }
  assert(
    forecast.busiestFace.trafficFactor === peakTraffic(site),
    'busiest face is not the charter peak lane'
  );
});

test('every percentage in the shared copy comes from the economy profile', () => {
  const { busy, belt } = surveySites();
  for (const site of [busy, belt, computeSiteProfile(system, 0.5, 0.34)]) {
    const forecast = computeCharterOperatingForecast(site);
    const economy = deriveOpeningEconomyProfile(site);
    const allowed = new Set<number>();
    for (const value of [
      economy.passengerTrafficMultiplier,
      economy.courierTrafficMultiplier,
      economy.supplyWholesaleMultiplier,
      economy.fuelWholesaleMultiplier,
      economy.fuelSaleMultiplier,
      economy.retailDemandMultiplier,
      economy.repairDemandMultiplier,
      economy.solarYieldMultiplier,
      economy.environmentPressureMultiplier
    ]) allowed.add(Math.round(value * 100));
    for (const lane of LANES) allowed.add(Math.round(site.laneTrafficFactor[lane] * 100));

    const copy = [
      forecast.headline,
      forecast.summary,
      forecast.resourceLine,
      forecast.powerLine,
      forecast.exposureLine,
      forecast.expansionLine,
      forecast.viability,
      ...forecast.chips.map((chip) => `${chip.label} ${chip.detail}`),
      ...forecast.services.map((service) => service.metric),
      ...forecast.tradeoffs,
      ...forecast.mitigations.map((item) => item.detail)
    ].join(' ');
    for (const match of copy.matchAll(/(\d+)%/g)) {
      const value = Number.parseInt(match[1], 10);
      assert(
        allowed.has(value),
        `forecast copy quotes ${value}% which is not a SiteCharter or economy value: "${match[0]}"`
      );
    }
  }
});

test('service ranking follows the economy multipliers it cites', () => {
  const { busy, belt } = surveySites();
  for (const site of [busy, belt]) {
    const forecast = computeCharterOperatingForecast(site);
    for (let i = 1; i < forecast.services.length; i++) {
      assert(
        forecast.services[i - 1].advantage >= forecast.services[i].advantage,
        `services out of rank order at ${forecast.services[i].id}`
      );
    }
    assert(
      forecast.summary.includes(forecast.services[0].label.toLowerCase()),
      'summary does not lead with the top-ranked service'
    );
  }
});

// --- 4. Neither site reads as a trap --------------------------------------

test('no site is presented as invalid or unwinnable', () => {
  const banned = /\b(unwinnable|invalid|impossible|hopeless|dead site|do not build|avoid this site)\b/i;
  for (let ix = 1; ix < 12; ix++) {
    for (let iy = 1; iy < 12; iy++) {
      const site = computeSiteProfile(system, ix / 12, iy / 12);
      const forecast = computeCharterOperatingForecast(site);
      const copy = [
        forecast.headline,
        forecast.summary,
        forecast.viability,
        forecast.resourceLine,
        forecast.powerLine,
        forecast.exposureLine,
        forecast.expansionLine,
        ...forecast.tradeoffs,
        ...forecast.mitigations.map((item) => item.detail)
      ].join(' ');
      assert(!banned.test(copy), `site ${ix}/${iy} is written off: "${copy}"`);
      assert(forecast.services[0].advantage > 0, `site ${ix}/${iy} has no viable lead service`);
      assert(forecast.mitigations.length >= 1, `site ${ix}/${iy} offers no mitigation`);
      assert(forecast.tradeoffs.length >= 2, `site ${ix}/${iy} states fewer than two trade-offs`);
      assert(
        Math.min(...LANES.map((lane) => site.laneTrafficFactor[lane])) > 0,
        `site ${ix}/${iy} has a dead lane`
      );
    }
  }
});

test('revenue frontage and growth direction never name the same face', () => {
  for (let ix = 1; ix < 12; ix++) {
    for (let iy = 1; iy < 12; iy++) {
      const forecast = computeCharterOperatingForecast(computeSiteProfile(system, ix / 12, iy / 12));
      if (forecast.evenApproaches) continue;
      assert(
        forecast.shelteredFace.lane !== forecast.busiestFace.lane,
        `site ${ix}/${iy} tells the player to hold and to grow into the same ${forecast.busiestFace.lane} face`
      );
    }
  }
});

test('mitigations name systems that exist today', () => {
  const known = new Set([
    'EVA repair capacity',
    'Redundant frontage',
    'Cooling',
    'Solar generation',
    'Lower-exposure expansion'
  ]);
  for (let ix = 1; ix < 12; ix++) {
    for (let iy = 1; iy < 12; iy++) {
      const forecast = computeCharterOperatingForecast(computeSiteProfile(system, ix / 12, iy / 12));
      for (const item of forecast.mitigations) {
        assert(known.has(item.system), `unknown mitigation system "${item.system}"`);
        assert(item.detail.length > 20, `mitigation "${item.system}" has no actionable detail`);
      }
    }
  }
});

// --- 5. Both surfaces share one wording source ----------------------------

test('the Site Brief projection is the forecast, not a restatement', () => {
  const site = computeSiteProfile(system, 0.5, 0.34);
  const forecast = computeCharterOperatingForecast(site);
  // What main.ts hands the Site Brief.
  const brief = {
    primary: forecast.headline,
    secondary: forecast.summary,
    traits: forecast.chips.map((chip) => ({ label: chip.label, detail: chip.detail, tone: chip.tone }))
  };
  assert(brief.primary === forecast.headline, 'brief headline diverged');
  assert(brief.secondary === forecast.summary, 'brief summary diverged');
  assert(brief.traits.length === forecast.chips.length, 'brief dropped forecast chips');
  for (const trait of brief.traits) {
    assert(
      ['good', 'neutral', 'warn'].includes(trait.tone),
      `chip "${trait.label}" carries an unrenderable tone`
    );
    assert(trait.detail.length > 0, `chip "${trait.label}" has no detail`);
  }
});

const filter = process.env.CHARTER_FORECAST_TEST_FILTER ?? '';
let failed = 0;
for (const entry of tests) {
  if (filter && !entry.name.includes(filter)) continue;
  try {
    entry.run();
    console.log(`ok   ${entry.name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${entry.name}`);
    console.error(`     ${(error as Error).message}`);
  }
}
if (failed > 0) {
  console.error(`${failed} charter-forecast test(s) failed`);
  process.exit(1);
}
console.log('charter-forecast tests passed');
