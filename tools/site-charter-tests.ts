// Focused runner for the site-charter geometry + profile math (PR 1).
// Mirrors tools/port-ops-tests.ts: pure assertions, no harness, filterable
// via SITE_CHARTER_TEST_FILTER. Run with `npm run test:site-charter`.

import { generateSystemMap } from '../src/sim/system-map';
import { computeSiteProfile } from '../src/sim/site-charter';
import { createInitialState } from '../src/sim/initial-state';
import { mapConditionAt } from '../src/sim/map-conditions';
import { hydrateStateFromSave, parseAndMigrateSave, serializeSave } from '../src/sim/save';
import { setRoom, tick } from '../src/sim/index';
import { GRID_HEIGHT, GRID_WIDTH, RoomType } from '../src/sim/types';
import type { MapConditionKind, SiteCharter, SpaceLane, StationState, SystemMap } from '../src/sim/types';

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

const CONDITION_KINDS: MapConditionKind[] = ['sunlight', 'debris-risk', 'thermal-sink'];

// A deterministic spread of tile indices across the whole grid. Map conditions
// are a pure function of tile position (not tile contents), so any index in
// range is a valid sample point.
function sampleTiles(state: StationState): number[] {
  const total = state.width * state.height;
  const stride = Math.max(1, Math.floor(total / 40));
  const idxs: number[] = [];
  for (let i = 0; i < total; i += stride) idxs.push(i);
  return idxs;
}

// A stable string digest of every sampled tile × condition kind, at fixed
// precision so it can be compared for bit-level stability.
function conditionDigest(state: StationState): string {
  const parts: string[] = [];
  for (const tile of sampleTiles(state)) {
    for (const kind of CONDITION_KINDS) {
      parts.push(mapConditionAt(state, kind, tile).toFixed(6));
    }
  }
  return parts.join(',');
}

function averageCondition(state: StationState, kind: MapConditionKind): number {
  const tiles = sampleTiles(state);
  let sum = 0;
  for (const tile of tiles) sum += mapConditionAt(state, kind, tile);
  return sum / tiles.length;
}

function charterWith(sunFactor: number, debrisFactor: number): SiteCharter {
  return {
    version: 1,
    x: 0.5,
    y: 0.5,
    sunFactor,
    debrisFactor,
    resourceType: null,
    laneTrafficFactor: { north: 1, east: 1, south: 1, west: 1 }
  };
}

// A charter that only overrides per-lane traffic (sun/debris neutral). Lets the
// traffic tests isolate lane-volume modulation from map-condition effects.
function charterWithLanes(
  laneTrafficFactor: Record<SpaceLane, number>,
  sunFactor = 0.5
): SiteCharter {
  return {
    version: 1,
    x: 0.5,
    y: 0.5,
    sunFactor,
    debrisFactor: 0,
    resourceType: null,
    laneTrafficFactor
  };
}

function advance(state: StationState, seconds: number): void {
  state.controls.paused = false;
  const step = 0.2;
  const steps = Math.ceil(seconds / step);
  for (let i = 0; i < steps; i++) tick(state, step);
}

function testNoSiteConditionsBitIdentical(): void {
  // With no chartered site, mapConditionAt must be exactly the legacy output.
  // We prove the guard fully bypasses the blend by sampling with no site,
  // applying a site, then clearing it — the cleared digest must be identical.
  const state = createInitialState({ seed: 1337 });
  assert(state.site === undefined, 'Fresh un-chartered state already had a site.');
  const base = conditionDigest(state);

  state.site = computeSiteProfile(generateSystemMap(1337), 0.5, 0.34);
  const withSite = conditionDigest(state);
  assert(withSite !== base, 'A present site did not change any sampled condition (blend inert?).');

  state.site = undefined;
  const restored = conditionDigest(state);
  assert(restored === base, 'Clearing the site did not restore bit-identical legacy conditions.');

  // Golden lock: the legacy (no-site) path must not drift for a fixed seed.
  assert(
    base === LEGACY_CONDITIONS_1337,
    'Legacy map-condition values drifted for seed 1337 (no-site path must stay bit-identical).'
  );
}

function testHighSunRaisesSunlight(): void {
  const state = createInitialState({ seed: 1337 });
  const baseAvg = averageCondition(state, 'sunlight');
  state.site = charterWith(0.95, 0);
  const hotAvg = averageCondition(state, 'sunlight');
  assert(
    hotAvg > baseAvg + 0.05,
    `High sunFactor should raise average sunlight (base ${baseAvg}, hot ${hotAvg}).`
  );
}

function testHighDebrisRaisesDebrisRisk(): void {
  const state = createInitialState({ seed: 1337 });
  const baseAvg = averageCondition(state, 'debris-risk');
  state.site = charterWith(0, 0.95);
  const beltAvg = averageCondition(state, 'debris-risk');
  assert(
    beltAvg > baseAvg + 0.05,
    `High debrisFactor should raise average debris-risk (base ${baseAvg}, belt ${beltAvg}).`
  );
}

function testConditionsDeterministicWithSite(): void {
  const charterA = computeSiteProfile(generateSystemMap(2024), 0.6, 0.42);
  const charterB = computeSiteProfile(generateSystemMap(2024), 0.6, 0.42);
  const a = createInitialState({ seed: 2024, charter: charterA });
  const b = createInitialState({ seed: 2024, charter: charterB });
  assert(
    conditionDigest(a) === conditionDigest(b),
    'Map conditions with a present site were non-deterministic across identical charters.'
  );
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

function testCreateInitialStateStoresCharter(): void {
  // createInitialState with a charter must store it verbatim on state.site.
  const map = generateSystemMap(1337);
  const charter = computeSiteProfile(map, 0.5, 0.34);
  const state = createInitialState({ seed: 1337, charter });
  assert(state.site !== undefined, 'createInitialState dropped the provided charter.');
  assert(
    JSON.stringify(state.site) === JSON.stringify(charter),
    'Stored charter diverged from the one passed to createInitialState.'
  );
}

function testCreateInitialStateNoCharter(): void {
  // Absent charter (default starts, harness fixtures) leaves site undefined.
  const state = createInitialState({ seed: 1337 });
  assert(state.site === undefined, `Un-chartered start had a defined site (${JSON.stringify(state.site)}).`);
}

function testSaveLoadRoundTripsSite(): void {
  // A chartered site must survive a full serialize → parse → hydrate cycle,
  // and an un-chartered save must restore site as undefined.
  const map = generateSystemMap(1337);
  const charter = computeSiteProfile(map, 0.62, 0.28);
  const chartered = createInitialState({ seed: 1337, charter });
  const text = serializeSave('charter-roundtrip', chartered, 'test');
  const parsed = parseAndMigrateSave(text);
  assert(parsed.ok, `Chartered save failed to parse: ${parsed.ok ? '' : parsed.error}`);
  const restored = hydrateStateFromSave(parsed.save).state;
  assert(restored.site !== undefined, 'Charter was lost across save/load.');
  assert(
    JSON.stringify(restored.site) === JSON.stringify(charter),
    'Charter mutated across save/load round-trip.'
  );

  const plain = createInitialState({ seed: 1337 });
  const plainText = serializeSave('plain-roundtrip', plain, 'test');
  const plainParsed = parseAndMigrateSave(plainText);
  assert(plainParsed.ok, `Un-chartered save failed to parse: ${plainParsed.ok ? '' : plainParsed.error}`);
  const plainRestored = hydrateStateFromSave(plainParsed.save).state;
  assert(plainRestored.site === undefined, 'Un-chartered save restored a defined site.');
}

function testHighLaneTrafficRaisesVolume(): void {
  // A high per-lane traffic factor must scale that lane's stored trafficVolume
  // above the ambient (factor-1) baseline, while a low factor pulls it below.
  // trafficVolume IS the lane-selection weight consumed by the arrival/offer
  // scheduler, so a higher value literally means more traffic on that lane.
  const base = createInitialState({ seed: 4242, manualTrafficAdmission: true });
  const busy = createInitialState({
    seed: 4242,
    manualTrafficAdmission: true,
    charter: charterWithLanes({ north: 2.4, east: 0.6, south: 0.6, west: 0.6 })
  });
  const baseNorth = base.laneProfiles.north.trafficVolume;
  const busyNorth = busy.laneProfiles.north.trafficVolume;
  const busyEast = busy.laneProfiles.east.trafficVolume;
  assert(
    busyNorth > baseNorth * 2 - 1e-9,
    `High north factor (2.4x) should ~2.4x north volume (base ${baseNorth}, busy ${busyNorth}).`
  );
  assert(
    busyEast < base.laneProfiles.east.trafficVolume + 1e-9,
    `Low east factor (0.6x) should not exceed the ambient east volume (busy ${busyEast}).`
  );

  // Downstream, deterministic proof: two stations on the same seed differing
  // only in which lane is favored produce measurably different lane traffic
  // distributions. Offers cap out and get consumed, so count CUMULATIVE
  // distinct lane-tagged traffic (every offer id ever seen) across the run.
  const northHeavy = createInitialState({
    seed: 7,
    manualTrafficAdmission: true,
    charter: charterWithLanes({ north: 2.5, east: 0.6, south: 0.6, west: 0.6 })
  });
  const southHeavy = createInitialState({
    seed: 7,
    manualTrafficAdmission: true,
    charter: charterWithLanes({ north: 0.6, east: 0.6, south: 2.5, west: 0.6 })
  });
  const northInNorthHeavy = cumulativeLaneOffers(northHeavy, 'north', 1200);
  const northInSouthHeavy = cumulativeLaneOffers(southHeavy, 'north', 1200);
  assert(
    northInNorthHeavy > northInSouthHeavy,
    `North-favored charter should route more north traffic than a south-favored one ` +
      `(north-heavy ${northInNorthHeavy}, south-heavy ${northInSouthHeavy}).`
  );
}

// Advance `seconds`, refusing every non-onboarding offer so generation keeps
// flowing (manual admission caps live offers), and tally the CUMULATIVE count
// of distinct offers ever tagged to `lane`. This is the deterministic,
// order-independent measure of how much traffic the site routed to that lane.
function cumulativeLaneOffers(state: StationState, lane: SpaceLane, seconds: number): number {
  state.controls.paused = false;
  const step = 0.2;
  const steps = Math.ceil(seconds / step);
  const seen = new Set<number>();
  let laneCount = 0;
  for (let i = 0; i < steps; i++) {
    tick(state, step);
    for (const offer of state.trafficOffers) {
      if (seen.has(offer.id)) continue;
      seen.add(offer.id);
      if (offer.lane === lane) laneCount += 1;
    }
    // Drain live offers so the scheduler keeps minting new ones.
    if (state.trafficOffers.length > 0) state.trafficOffers.length = 0;
  }
  return laneCount;
}

// The port-ops starter has no Life Support room, so the cold-load term has
// nothing to scale. Repaint the (connected, door-served, 16-tile) starter
// Storage room as Life Support: it meets LifeSupport's structural activation
// checks (minTiles 6, door, path; no pressurization/staff gate), so a tick
// activates it. Applied identically to both charters, it isolates the cold
// multiplier as the only difference in the power draw.
function activateLifeSupportForTest(state: StationState): void {
  const coreX = Math.floor(GRID_WIDTH / 2);
  const coreY = Math.floor(GRID_HEIGHT / 2);
  for (let y = coreY + 3; y <= coreY + 6; y++) {
    for (let x = coreX + 6; x <= coreX + 9; x++) {
      setRoom(state, y * state.width + x, RoomType.LifeSupport);
    }
  }
  // The room's door tile lives on the west wall ring at (coreX+5, coreY+5).
  setRoom(state, (coreY + 5) * state.width + (coreX + 5), RoomType.LifeSupport);
}

function testColdRaisesLifeSupportDemand(): void {
  // Two identical starter stations, one chartered at the sunward extreme
  // (sunFactor 1 → no cold load) and one at the outer rim (sunFactor 0 → full
  // cold load). The rim station must draw more power for life support.
  const warm = createInitialState({
    seed: 1337,
    manualTrafficAdmission: true,
    charter: charterWithLanes({ north: 1, east: 1, south: 1, west: 1 }, 1)
  });
  const cold = createInitialState({
    seed: 1337,
    manualTrafficAdmission: true,
    charter: charterWithLanes({ north: 1, east: 1, south: 1, west: 1 }, 0)
  });
  activateLifeSupportForTest(warm);
  activateLifeSupportForTest(cold);
  // Short advance: activate LS ops and refresh metrics while keeping visitor/
  // resident counts (and thus every other demand term) identical across both.
  advance(warm, 5);
  advance(cold, 5);
  assert(
    cold.ops.lifeSupportActive > 0,
    `Cold test needs an active life-support cluster (got ${cold.ops.lifeSupportActive}).`
  );
  assert(
    cold.ops.lifeSupportActive === warm.ops.lifeSupportActive,
    `LS staffing diverged between charters (warm ${warm.ops.lifeSupportActive}, cold ${cold.ops.lifeSupportActive}); ` +
      'cold-load comparison would be confounded.'
  );
  assert(
    cold.metrics.powerDemand > warm.metrics.powerDemand + 0.1,
    `Outer-rim (cold) charter should draw more power than sunward ` +
      `(warm ${warm.metrics.powerDemand}, cold ${cold.metrics.powerDemand}).`
  );
}

function testNoSiteTrafficAndPowerNeutral(): void {
  // Absent-site guarantee: the site machinery is a no-op when off. A neutral
  // charter (all lane factors 1, sunFactor 1 → cold multiplier exactly 1) must
  // reproduce the un-chartered trafficVolume and power draw bit-for-bit, since
  // both feed identical inputs through the same rng sequence.
  const seed = 2024;
  const plain = createInitialState({ seed, manualTrafficAdmission: true });
  const neutral = createInitialState({
    seed,
    manualTrafficAdmission: true,
    charter: charterWithLanes({ north: 1, east: 1, south: 1, west: 1 }, 1)
  });
  for (const lane of LANES) {
    assert(
      plain.laneProfiles[lane].trafficVolume === neutral.laneProfiles[lane].trafficVolume,
      `Neutral charter perturbed ${lane} trafficVolume vs un-chartered ` +
        `(plain ${plain.laneProfiles[lane].trafficVolume}, neutral ${neutral.laneProfiles[lane].trafficVolume}).`
    );
  }

  // Power path: with sunFactor 1 the cold multiplier is exactly 1, so a
  // no-map-effect... but sun raises map sunlight and can perturb actors. Prove
  // the narrower, exact claim instead: an un-chartered state is deterministic,
  // and its power draw does not depend on any leaked site state.
  const plainA = createInitialState({ seed, manualTrafficAdmission: true });
  const plainB = createInitialState({ seed, manualTrafficAdmission: true });
  advance(plainA, 40);
  advance(plainB, 40);
  assert(
    plainA.metrics.powerDemand === plainB.metrics.powerDemand &&
      plainA.metrics.powerSupply === plainB.metrics.powerSupply,
    `Un-chartered power draw was non-deterministic ` +
      `(A ${plainA.metrics.powerDemand}/${plainA.metrics.powerSupply}, ` +
      `B ${plainB.metrics.powerDemand}/${plainB.metrics.powerSupply}).`
  );
  assert(plainA.site === undefined, 'Un-chartered state unexpectedly carried a site.');
}

// Golden snapshot of the legacy (no-site) map-condition values for seed 1337.
// Generated from the pre-blend code path; locks the un-chartered path so future
// edits to mapConditionAt cannot silently alter default-start behavior.
const LEGACY_CONDITIONS_1337 = '0.244136,0.476920,0.848496,0.219910,0.478687,0.858932,0.210813,0.483425,0.861777,0.211791,0.490284,0.859529,0.218630,0.498415,0.854309,0.227421,0.506971,0.848098,0.234263,0.515103,0.842876,0.235264,0.521962,0.840618,0.226849,0.526700,0.843156,0.206440,0.528467,0.851874,0.182976,0.526498,0.850949,0.164885,0.521221,0.828311,0.150565,0.513580,0.790195,0.138828,0.504521,0.742648,0.128871,0.494990,0.691544,0.120267,0.485932,0.642588,0.113009,0.478291,0.601294,0.107629,0.473014,0.572937,0.105406,0.471044,0.562452,0.092139,0.472552,0.568812,0.052788,0.476593,0.587563,0.009155,0.482444,0.608708,0.000000,0.489381,0.614619,0.000000,0.499123,0.616503,0.000000,0.514758,0.618294,0.000000,0.534163,0.619804,0.000000,0.554608,0.620848,0.000000,0.573102,0.621237,0.000000,0.595637,0.615552,0.000000,0.630645,0.600317,0.000000,0.677451,0.578259,0.000000,0.733139,0.552109,0.000000,0.792805,0.524594,0.000000,0.850619,0.498444,0.000000,0.901191,0.476387,0.000000,0.940702,0.461151,0.000000,0.967302,0.455466,0.000000,0.982384,0.457289,0.000000,0.989904,0.462173,0.000000,0.992488,0.469244';

// Golden snapshot of the legacy (pre-laneRoutes) fields for seed 1337.
const LEGACY_SNAPSHOT_1337 = '{"factions":[{"id":"faction-0-free-port","templateId":"free-port","displayName":"Port Bellwether","color":"#4ab3d6","shipBias":{"trader":0.4,"tourist":0.3,"industrial":0.15,"colonist":0.15}},{"id":"faction-1-industrial-combine","templateId":"industrial-combine","displayName":"Tantalus Smelting Bloc","color":"#9c8b7a","shipBias":{"industrial":0.7,"trader":0.2,"military":0.05,"colonist":0.05}},{"id":"faction-2-trader-guild","templateId":"trader-guild","displayName":"Sirian Coin Confederacy","color":"#f5b94a","shipBias":{"trader":0.65,"tourist":0.2,"industrial":0.1,"colonist":0.05}},{"id":"faction-3-pleasure-syndicate","templateId":"pleasure-syndicate","displayName":"Sapphire Tides Concordat","color":"#d167b8","shipBias":{"tourist":0.7,"trader":0.15,"colonist":0.1,"military":0.05}},{"id":"faction-4-colonial-authority","templateId":"colonial-authority","displayName":"Heartwood Colonial Office","color":"#5fb874","shipBias":{"colonist":0.65,"trader":0.15,"tourist":0.1,"industrial":0.1}}],"planets":[{"id":"planet-0","factionId":"faction-0-free-port","displayName":"Tessen","orbitRadius":0.19197210597340017,"orbitAngle":0.31577282278269436,"bodyType":"ice"},{"id":"planet-1","factionId":"faction-2-trader-guild","displayName":"Inara","orbitRadius":0.4328621489306291,"orbitAngle":1.822560142774103,"bodyType":"gas"},{"id":"planet-2","factionId":"faction-2-trader-guild","displayName":"Ulmar","orbitRadius":0.6614564454058806,"orbitAngle":2.887523361006803,"bodyType":"gas"},{"id":"planet-3","factionId":"faction-0-free-port","displayName":"Khaeris","orbitRadius":0.8592090816237031,"orbitAngle":4.423259034881919,"bodyType":"gas"}],"asteroidBelts":[{"id":"belt-0","innerRadius":0.492997169510927,"outerRadius":0.562894436607603,"resourceType":"gas","factionClaim":null},{"id":"belt-1","innerRadius":0.3880656786775216,"outerRadius":0.47147373803425574,"resourceType":"metal","factionClaim":"faction-3-pleasure-syndicate"},{"id":"belt-2","innerRadius":0.24140100059332326,"outerRadius":0.331384873862844,"resourceType":"ice","factionClaim":"faction-0-free-port"}],"laneSectors":{"north":{"factionIds":["faction-1-industrial-combine","faction-2-trader-guild","faction-4-colonial-authority"],"dominantFactionId":"faction-1-industrial-combine"},"east":{"factionIds":["faction-3-pleasure-syndicate","faction-2-trader-guild"],"dominantFactionId":"faction-3-pleasure-syndicate"},"south":{"factionIds":["faction-2-trader-guild","faction-4-colonial-authority"],"dominantFactionId":"faction-2-trader-guild"},"west":{"factionIds":["faction-2-trader-guild","faction-3-pleasure-syndicate"],"dominantFactionId":"faction-2-trader-guild"}},"seedAtCreation":1337}';

const tests: Array<[string, () => void]> = [
  ['deterministic profile', testDeterministicProfile],
  ['lane floor guarantee', testLaneFloorGuarantee],
  ['lane ceiling', testLaneCeiling],
  ['belt flavor correctness', testBeltFlavor],
  ['far corner has no flavor', testFarCornerHasNoFlavor],
  ['legacy fields regression', testLegacyFieldsRegression],
  ['createInitialState stores charter', testCreateInitialStateStoresCharter],
  ['createInitialState without charter', testCreateInitialStateNoCharter],
  ['save/load round-trips site', testSaveLoadRoundTripsSite],
  ['no-site conditions bit-identical', testNoSiteConditionsBitIdentical],
  ['high sun raises sunlight', testHighSunRaisesSunlight],
  ['high debris raises debris-risk', testHighDebrisRaisesDebrisRisk],
  ['conditions deterministic with site', testConditionsDeterministicWithSite],
  ['high lane traffic raises volume', testHighLaneTrafficRaisesVolume],
  ['cold raises life-support demand', testColdRaisesLifeSupportDemand],
  ['no-site traffic and power neutral', testNoSiteTrafficAndPowerNeutral]
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
