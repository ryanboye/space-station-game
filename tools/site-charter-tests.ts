// Focused runner for the site-charter geometry + profile math (PR 1).
// Mirrors tools/port-ops-tests.ts: pure assertions, no harness, filterable
// via SITE_CHARTER_TEST_FILTER. Run with `npm run test:site-charter`.

import { generateSystemMap } from '../src/sim/system-map';
import { computeSiteProfile } from '../src/sim/site-charter';
import type { SpaceLane, SystemMap } from '../src/sim/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const LANES: SpaceLane[] = ['north', 'east', 'south', 'west'];

// Legacy fields only — laneRoutes is deliberately excluded so this snapshot
// is a pure regression guard on pre-existing generation.
function legacyFields(map: SystemMap): string {
  return JSON.stringify({
    factions: map.factions,
    planets: map.planets,
    asteroidBelts: map.asteroidBelts,
    laneSectors: map.laneSectors,
    seedAtCreation: map.seedAtCreation
  });
}

function testDeterministicProfile(): void {
  const map = generateSystemMap(1337);
  const a = computeSiteProfile(map, 0.62, 0.41);
  const b = computeSiteProfile(map, 0.62, 0.41);
  assert(JSON.stringify(a) === JSON.stringify(b), 'Same seed + click produced diverging profiles.');
  // A second, independent system regeneration from the same seed must also
  // yield an identical profile for the same click.
  const map2 = generateSystemMap(1337);
  const c = computeSiteProfile(map2, 0.62, 0.41);
  assert(JSON.stringify(a) === JSON.stringify(c), 'Regenerated system diverged for the same click.');
}

function testLaneFloorGuarantee(): void {
  // Sweep a grid over the disc; every position must keep every lane above
  // an ambient floor — no dead seed anywhere.
  const map = generateSystemMap(4242);
  for (let ix = 0; ix <= 10; ix++) {
    for (let iy = 0; iy <= 10; iy++) {
      const x = ix / 10;
      const y = iy / 10;
      const profile = computeSiteProfile(map, x, y);
      for (const lane of LANES) {
        assert(
          profile.laneTrafficFactor[lane] > 0,
          `Lane ${lane} at (${x},${y}) yielded non-positive traffic (${profile.laneTrafficFactor[lane]}).`
        );
      }
      const anyPositive = LANES.some((lane) => profile.laneTrafficFactor[lane] > 0);
      assert(anyPositive, `Position (${x},${y}) yielded all-zero lane traffic.`);
    }
  }
}

function testLaneCeiling(): void {
  // The ceiling caps amplification at ~2.5x even directly atop a route.
  const map = generateSystemMap(909);
  const route = (map.laneRoutes ?? [])[0];
  assert(route, 'Expected at least one generated lane route.');
  const mid = route.points[0];
  const profile = computeSiteProfile(map, mid.x, mid.y);
  for (const lane of LANES) {
    assert(
      profile.laneTrafficFactor[lane] <= 2.5 + 1e-9,
      `Lane ${lane} exceeded the 2.5x ceiling (${profile.laneTrafficFactor[lane]}).`
    );
  }
}

function testBeltFlavor(): void {
  // A click inside a belt annulus must return that belt's resourceType and
  // near-maximal debris. Convert belt radius (orbit units) to a disc x on
  // the +x axis from center (0.5): discX = 0.5 + (r/2).
  const map = generateSystemMap(2026);
  assert(map.asteroidBelts.length > 0, 'Expected at least one asteroid belt.');
  for (const belt of map.asteroidBelts) {
    const rMid = (belt.innerRadius + belt.outerRadius) / 2;
    const x = 0.5 + rMid / 2;
    const y = 0.5;
    const profile = computeSiteProfile(map, x, y);
    // Multiple belts can overlap radially; the returned flavor must be one
    // whose annulus actually contains this radius.
    const containing = map.asteroidBelts.filter(
      (b) => rMid >= b.innerRadius && rMid <= b.outerRadius
    );
    assert(
      containing.some((b) => b.resourceType === profile.resourceType),
      `Click inside belt ${belt.id} returned flavor ${profile.resourceType}, not a containing belt's type.`
    );
    assert(profile.debrisFactor > 0.5, `Inside a belt annulus debris should be high, got ${profile.debrisFactor}.`);
  }
}

function testFarCornerHasNoFlavor(): void {
  // The far corner sits beyond every belt; it should carry ambient lanes
  // and no belt flavor (null), proving flavor is genuinely beltward.
  const map = generateSystemMap(555);
  const profile = computeSiteProfile(map, 1, 1);
  assert(profile.resourceType === null, `Far corner claimed a belt flavor (${profile.resourceType}).`);
  assert(profile.sunFactor >= 0 && profile.sunFactor < 0.2, `Far corner sun should be low, got ${profile.sunFactor}.`);
}

function testLegacyFieldsRegression(): void {
  // Additive laneRoutes generation must not perturb any pre-existing field
  // for a fixed seed. Snapshot captured from generation prior to this PR.
  const map = generateSystemMap(1337);
  assert(map.laneRoutes !== undefined, 'generateSystemMap did not emit laneRoutes.');
  assert(Array.isArray(map.laneRoutes) && map.laneRoutes.length > 0, 'laneRoutes was empty.');
  assert(
    legacyFields(map) === LEGACY_SNAPSHOT_1337,
    'Legacy system-map fields drifted for seed 1337 (additive generation must not perturb them).'
  );
}

// Golden snapshot of the legacy (pre-laneRoutes) fields for seed 1337.
const LEGACY_SNAPSHOT_1337 = '{"factions":[{"id":"faction-0-free-port","templateId":"free-port","displayName":"Port Bellwether","color":"#4ab3d6","shipBias":{"trader":0.4,"tourist":0.3,"industrial":0.15,"colonist":0.15}},{"id":"faction-1-industrial-combine","templateId":"industrial-combine","displayName":"Tantalus Smelting Bloc","color":"#9c8b7a","shipBias":{"industrial":0.7,"trader":0.2,"military":0.05,"colonist":0.05}},{"id":"faction-2-trader-guild","templateId":"trader-guild","displayName":"Sirian Coin Confederacy","color":"#f5b94a","shipBias":{"trader":0.65,"tourist":0.2,"industrial":0.1,"colonist":0.05}},{"id":"faction-3-pleasure-syndicate","templateId":"pleasure-syndicate","displayName":"Sapphire Tides Concordat","color":"#d167b8","shipBias":{"tourist":0.7,"trader":0.15,"colonist":0.1,"military":0.05}},{"id":"faction-4-colonial-authority","templateId":"colonial-authority","displayName":"Heartwood Colonial Office","color":"#5fb874","shipBias":{"colonist":0.65,"trader":0.15,"tourist":0.1,"industrial":0.1}}],"planets":[{"id":"planet-0","factionId":"faction-0-free-port","displayName":"Tessen","orbitRadius":0.19197210597340017,"orbitAngle":0.31577282278269436,"bodyType":"ice"},{"id":"planet-1","factionId":"faction-2-trader-guild","displayName":"Inara","orbitRadius":0.4328621489306291,"orbitAngle":1.822560142774103,"bodyType":"gas"},{"id":"planet-2","factionId":"faction-2-trader-guild","displayName":"Ulmar","orbitRadius":0.6614564454058806,"orbitAngle":2.887523361006803,"bodyType":"gas"},{"id":"planet-3","factionId":"faction-0-free-port","displayName":"Khaeris","orbitRadius":0.8592090816237031,"orbitAngle":4.423259034881919,"bodyType":"gas"}],"asteroidBelts":[{"id":"belt-0","innerRadius":0.492997169510927,"outerRadius":0.562894436607603,"resourceType":"gas","factionClaim":null},{"id":"belt-1","innerRadius":0.3880656786775216,"outerRadius":0.47147373803425574,"resourceType":"metal","factionClaim":"faction-3-pleasure-syndicate"},{"id":"belt-2","innerRadius":0.24140100059332326,"outerRadius":0.331384873862844,"resourceType":"ice","factionClaim":"faction-0-free-port"}],"laneSectors":{"north":{"factionIds":["faction-1-industrial-combine","faction-2-trader-guild","faction-4-colonial-authority"],"dominantFactionId":"faction-1-industrial-combine"},"east":{"factionIds":["faction-3-pleasure-syndicate","faction-2-trader-guild"],"dominantFactionId":"faction-3-pleasure-syndicate"},"south":{"factionIds":["faction-2-trader-guild","faction-4-colonial-authority"],"dominantFactionId":"faction-2-trader-guild"},"west":{"factionIds":["faction-2-trader-guild","faction-3-pleasure-syndicate"],"dominantFactionId":"faction-2-trader-guild"}},"seedAtCreation":1337}';

const tests: Array<[string, () => void]> = [
  ['deterministic profile', testDeterministicProfile],
  ['lane floor guarantee', testLaneFloorGuarantee],
  ['lane ceiling', testLaneCeiling],
  ['belt flavor correctness', testBeltFlavor],
  ['far corner has no flavor', testFarCornerHasNoFlavor],
  ['legacy fields regression', testLegacyFieldsRegression]
];

const runtimeProcess = (globalThis as typeof globalThis & {
  process?: { env?: Record<string, string | undefined> };
}).process;
const filter = runtimeProcess?.env?.SITE_CHARTER_TEST_FILTER?.trim().toLowerCase() ?? '';
const selectedTests = filter.length > 0
  ? tests.filter(([name]) => name.toLowerCase().includes(filter))
  : tests;
if (selectedTests.length === 0) throw new Error(`No focused site-charter test matched "${filter}".`);

for (const [name, run] of selectedTests) {
  run();
  console.log(`PASS ${name}`);
}

console.log(`Site charter: ${selectedTests.length} focused tests passed${filter ? ` (filter: ${filter})` : ''}.`);
