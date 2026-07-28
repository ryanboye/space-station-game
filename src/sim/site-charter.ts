// Site Charter — pure, deterministic derivation of a SiteCharter profile
// from a chartered system-map position.
//
// See docs/29-site-charter-v1-implementation-plan.md. The profile turns a
// click on the system map into live inputs for systems that already exist:
//   - sunFactor    → raises the map-condition 'sunlight' baseline (thermal)
//   - debrisFactor → raises the 'debris-risk' baseline (hull wear) and, with
//                    resourceType, the local belt flavor
//   - laneTrafficFactor → per-lane traffic volume multiplier
//
// Everything here is a pure function of (system geometry, x, y): identical
// inputs always yield an identical profile. No rng, no clock, no globals.

import { charterDebrisFlow } from './map-conditions';
import { deriveOpeningEconomyProfile, type OpeningEconomyProfile } from './opening-economy';
import { laneWeightsFromSystem } from './system-map';
import type { LaneRoute, ShipType, SiteCharter, SpaceLane, SystemMap } from './types';

const LANES: SpaceLane[] = ['north', 'east', 'south', 'west'];

// Disc geometry: positions are 0..1 with the system center at (0.5, 0.5).
// A body's orbitRadius/beltRadius (0..1) maps to disc radius 0..0.5, so a
// click's radial distance is doubled to compare in the same 0..1 space.
const CENTER = 0.5;

// Lane traffic bounds. The floor is the viability guarantee — every lane
// keeps ambient traffic so no charter position is a dead seed. The ceiling
// caps how much a hot route can amplify volume (~2.5x default).
const LANE_FLOOR = 0.6;
const LANE_CEIL = 2.5;
// How close (in disc coords) a route must be to lift a lane above ambient.
const LANE_RANGE = 0.35;

// Debris proximity: how far (in orbit-radius units) from a belt annulus the
// abrasion pressure fades, and the minimum debris a site needs before it
// takes on the belt's resource flavor.
const DEBRIS_RANGE = 0.25;
const FLAVOR_THRESHOLD = 0.12;

/** Radial distance from the system center, in orbit-radius units (0..~1.41). */
function radialDistance(x: number, y: number): number {
  const dx = x - CENTER;
  const dy = y - CENTER;
  return Math.hypot(dx, dy) * 2;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Smoothstep easing — gentle S-curve so the sun band isn't a hard cone. */
function smooth(v: number): number {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
}

/** Shortest distance from a point to a line segment, in disc coords. */
function pointToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const lenSq = abx * abx + aby * aby;
  if (lenSq <= 1e-9) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * abx + (py - ay) * aby) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * abx), py - (ay + t * aby));
}

/** Nearest point on a route's polyline to (px, py), with its distance. */
function nearestOnRoute(
  route: LaneRoute,
  px: number,
  py: number
): { dist: number; nx: number; ny: number } {
  let best = { dist: Infinity, nx: px, ny: py };
  const pts = route.points;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const d = pointToSegment(px, py, a.x, a.y, b.x, b.y);
    if (d < best.dist) {
      // Recover the projected point for lane assignment.
      const abx = b.x - a.x;
      const aby = b.y - a.y;
      const lenSq = abx * abx + aby * aby;
      let t = lenSq <= 1e-9 ? 0 : ((px - a.x) * abx + (py - a.y) * aby) / lenSq;
      t = Math.max(0, Math.min(1, t));
      best = { dist: d, nx: a.x + t * abx, ny: a.y + t * aby };
    }
  }
  if (pts.length === 1) {
    best = { dist: Math.hypot(px - pts[0].x, py - pts[0].y), nx: pts[0].x, ny: pts[0].y };
  }
  return best;
}

// Compass outward direction vectors (disc coords, y grows downward).
const LANE_DIRS: Record<SpaceLane, { x: number; y: number }> = {
  north: { x: 0, y: -1 },
  east: { x: 1, y: 0 },
  south: { x: 0, y: 1 },
  west: { x: -1, y: 0 }
};

/** Which compass lane a route serves from the site: the quadrant its
 *  nearest point lies in relative to the click. */
function laneForOffset(dx: number, dy: number): SpaceLane {
  let bestLane: SpaceLane = 'north';
  let bestDot = -Infinity;
  for (const lane of LANES) {
    const dir = LANE_DIRS[lane];
    const dot = dx * dir.x + dy * dir.y;
    if (dot > bestDot) {
      bestDot = dot;
      bestLane = lane;
    }
  }
  return bestLane;
}

/**
 * Derive the environmental profile for a chartered position. Pure and
 * deterministic: same system + (x, y) always yields the same SiteCharter.
 */
export function computeSiteProfile(system: SystemMap, x: number, y: number): SiteCharter {
  const px = clamp01(x);
  const py = clamp01(y);
  const rOrbit = radialDistance(px, py);

  // Sunward = inner system. 1 at center, easing to 0 at the disc edge.
  const sunFactor = smooth(1 - Math.min(1, rOrbit));

  // Debris + flavor from the nearest belt annulus.
  let debrisFactor = 0;
  let resourceType: SiteCharter['resourceType'] = null;
  for (const belt of system.asteroidBelts) {
    let dist: number;
    if (rOrbit < belt.innerRadius) dist = belt.innerRadius - rOrbit;
    else if (rOrbit > belt.outerRadius) dist = rOrbit - belt.outerRadius;
    else dist = 0; // inside the annulus
    const factor = clamp01(1 - dist / DEBRIS_RANGE);
    if (factor > debrisFactor) {
      debrisFactor = factor;
      resourceType = belt.resourceType;
    }
  }
  // Only claim a belt flavor when the site is genuinely beltward.
  if (debrisFactor < FLAVOR_THRESHOLD) resourceType = null;

  // Per-lane traffic. Start every lane at the ambient floor (viability
  // guarantee), then lift it toward the ceiling by the nearest serving
  // route's proximity and volume.
  const laneTrafficFactor: Record<SpaceLane, number> = {
    north: LANE_FLOOR,
    east: LANE_FLOOR,
    south: LANE_FLOOR,
    west: LANE_FLOOR
  };
  const bestByLane: Record<SpaceLane, number> = {
    north: Infinity,
    east: Infinity,
    south: Infinity,
    west: Infinity
  };
  const volByLane: Record<SpaceLane, number> = { north: 0, east: 0, south: 0, west: 0 };
  const routes = system.laneRoutes ?? [];
  for (const route of routes) {
    const near = nearestOnRoute(route, px, py);
    const lane = laneForOffset(near.nx - px, near.ny - py);
    if (near.dist < bestByLane[lane]) {
      bestByLane[lane] = near.dist;
      volByLane[lane] = clamp01(route.volume);
    }
  }
  for (const lane of LANES) {
    if (bestByLane[lane] === Infinity) continue;
    const proximity = clamp01(1 - bestByLane[lane] / LANE_RANGE);
    const boost = (LANE_CEIL - LANE_FLOOR) * proximity * volByLane[lane];
    laneTrafficFactor[lane] = Math.max(LANE_FLOOR, Math.min(LANE_CEIL, LANE_FLOOR + boost));
  }

  return {
    version: 1,
    x: px,
    y: py,
    sunFactor,
    debrisFactor,
    resourceType,
    laneTrafficFactor
  };
}

// --- Charter operating forecast -------------------------------------------
//
// One shared, pure reading of a SiteCharter: what kind of station prospers
// here, which exterior face carries the traffic, which one is safe to expand
// into, and what the site costs to operate. The Charter screen and the
// in-game Site Brief both render this object, so neither surface invents its
// own labels or recommendations.
//
// Every number below traces to either the SiteCharter itself or to
// deriveOpeningEconomyProfile(). Nothing is decorative.

export const CHARTER_FORECAST_VERSION = 1;

export type CharterLevelBand = 'low' | 'medium' | 'high';
export type CharterTrafficBand = 'quiet' | 'steady' | 'heavy';
export type CharterTone = 'good' | 'neutral' | 'warn';

/** Shared 0..1 banding for sunlight and debris. */
export function charterLevelBand(value: number): CharterLevelBand {
  if (value >= 0.72) return 'high';
  if (value >= 0.42) return 'medium';
  return 'low';
}

/** Shared banding for a lane traffic multiplier (1 = default volume). */
export function charterTrafficBand(factor: number): CharterTrafficBand {
  if (factor >= 1.6) return 'heavy';
  if (factor >= 1.05) return 'steady';
  return 'quiet';
}

export const CHARTER_LEVEL_LABEL: Record<CharterLevelBand, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High'
};

export const CHARTER_TRAFFIC_LABEL: Record<CharterTrafficBand, string> = {
  quiet: 'Quiet',
  steady: 'Steady',
  heavy: 'Heavy'
};

export const CHARTER_RESOURCE_LABEL: Record<NonNullable<SiteCharter['resourceType']> | 'none', string> = {
  metal: 'Metal rich',
  ice: 'Ice rich',
  gas: 'Gas rich',
  none: 'Open space'
};

export interface CharterFaceForecast {
  lane: SpaceLane;
  /** Straight from SiteCharter.laneTrafficFactor; 1 = default lane volume. */
  trafficFactor: number;
  trafficBand: CharterTrafficBand;
  /** debrisFactor scaled by how squarely this face meets the charter's
   *  debris flow (the same flow map-conditions uses for 'debris-risk'). */
  debrisExposure: number;
  /** Arrival contention blended with debris exposure. Lower builds easier. */
  buildPressure: number;
}

export type CharterServiceId = 'berths' | 'retail' | 'fuel' | 'repair' | 'freight';

export interface CharterServiceForecast {
  id: CharterServiceId;
  label: string;
  /** Driving multiplier ÷ the same multiplier on an un-chartered orbit. */
  advantage: number;
  /** Where `advantage` comes from, e.g. "retail demand 128%". */
  metric: string;
  /** Present only when system faction composition participates in the forecast. */
  compositionMultiplier?: number;
}

export type CharterExpectedShipMix = Record<ShipType, number>;

export interface CharterMitigation {
  /** An existing station system, named as the player sees it. */
  system: string;
  detail: string;
}

export interface CharterForecastChip {
  label: string;
  detail: string;
  tone: CharterTone;
}

export interface CharterOperatingForecast {
  version: typeof CHARTER_FORECAST_VERSION;
  /** False for legacy saves and un-chartered starts (the neutral orbit). */
  chartered: boolean;
  siteTag: string;
  /** Single-line identity, shared by both surfaces. */
  headline: string;
  /** Supporting line, shared by both surfaces. */
  summary: string;
  /** Compact traits, shared by both surfaces. */
  chips: CharterForecastChip[];
  faces: CharterFaceForecast[];
  busiestFace: CharterFaceForecast;
  exposedFace: CharterFaceForecast;
  shelteredFace: CharterFaceForecast;
  /** True when no face is meaningfully busier than the rest. */
  evenApproaches: boolean;
  /** Ranked best-first. `services[0]` is the opening lead. */
  services: CharterServiceForecast[];
  /** Optional because legacy callers only supplied a SiteCharter. */
  expectedShipMix?: CharterExpectedShipMix;
  compositionLine?: string;
  resourceLine: string;
  powerLine: string;
  exposureLine: string;
  expansionLine: string;
  /** Two-sided consequences, never a single correct build. */
  tradeoffs: string[];
  mitigations: CharterMitigation[];
  /** Why this site is workable, whatever else it costs. */
  viability: string;
  economy: OpeningEconomyProfile;
}

/** The familiar un-chartered start: what deriveOpeningEconomyProfile() and
 *  map-conditions already fall back to when `state.site` is undefined. */
const NEUTRAL_SITE: SiteCharter = {
  version: 1,
  x: CENTER,
  y: CENTER,
  sunFactor: 0.5,
  debrisFactor: 0,
  resourceType: null,
  laneTrafficFactor: { north: 1, east: 1, south: 1, west: 1 }
};

/** Baseline the site is measured against, so every advantage is a real ratio. */
const NEUTRAL_ECONOMY = deriveOpeningEconomyProfile();

/** Below this spread, calling one face "the busy one" would be a lie. */
const EVEN_APPROACH_SPREAD = 0.08;

const LANE_NAME: Record<SpaceLane, string> = {
  north: 'north',
  east: 'east',
  south: 'south',
  west: 'west'
};

function percent(value: number): number {
  return Math.round(value * 100);
}

/** The same 0..1 normalization deriveOpeningEconomyProfile applies to traffic. */
function trafficNormalized(factor: number): number {
  return clamp01((factor - LANE_FLOOR) / (LANE_CEIL - LANE_FLOOR));
}

function fuelMargin(profile: OpeningEconomyProfile): number {
  return profile.fuelSaleMultiplier / profile.fuelWholesaleMultiplier;
}

function faceForecasts(site: SiteCharter): CharterFaceForecast[] {
  const flow = charterDebrisFlow(site);
  const debris = clamp01(site.debrisFactor);
  return LANES.map((lane) => {
    const dir = LANE_DIRS[lane];
    // -1 (fully downstream of the debris flow) .. 1 (facing straight into it).
    const alignment = clamp01((flow.dx * dir.x + flow.dy * dir.y + 1) / 2);
    const trafficFactor = Math.max(0, site.laneTrafficFactor[lane]);
    const debrisExposure = alignment * debris;
    return {
      lane,
      trafficFactor,
      trafficBand: charterTrafficBand(trafficFactor),
      debrisExposure,
      buildPressure: trafficNormalized(trafficFactor) * 0.55 + debrisExposure * 0.45
    };
  });
}

function pickFace(
  faces: CharterFaceForecast[],
  score: (face: CharterFaceForecast) => number,
  prefer: 'max' | 'min'
): CharterFaceForecast {
  let best = faces[0];
  for (const face of faces) {
    const better = prefer === 'max' ? score(face) > score(best) : score(face) < score(best);
    if (better) best = face;
  }
  return best;
}

const SHIP_TYPES: ShipType[] = ['tourist', 'trader', 'industrial', 'military', 'colonist'];
const UNIFORM_SHIP_SHARE = 1 / SHIP_TYPES.length;
const COMPOSITION_INFLUENCE = 0.35;
const COMPOSITION_ADJUSTMENT_MIN = 0.82;
const COMPOSITION_ADJUSTMENT_MAX = 1.18;

function expectedShipMix(site: SiteCharter, system: SystemMap): CharterExpectedShipMix {
  const weighted: CharterExpectedShipMix = {
    tourist: 0,
    trader: 0,
    industrial: 0,
    military: 0,
    colonist: 0
  };
  for (const lane of LANES) {
    const laneVolume = Math.max(0, site.laneTrafficFactor[lane]);
    const weights = laneWeightsFromSystem(system, lane);
    for (const shipType of SHIP_TYPES) weighted[shipType] += laneVolume * weights[shipType];
  }
  const total = SHIP_TYPES.reduce((sum, shipType) => sum + weighted[shipType], 0);
  if (total <= 0) {
    for (const shipType of SHIP_TYPES) weighted[shipType] = UNIFORM_SHIP_SHARE;
    return weighted;
  }
  for (const shipType of SHIP_TYPES) weighted[shipType] /= total;
  return weighted;
}

function compositionAdjustment(mix: CharterExpectedShipMix, affinity: ShipType[]): number {
  const observed = affinity.reduce((sum, shipType) => sum + mix[shipType], 0);
  const uniform = affinity.length * UNIFORM_SHIP_SHARE;
  const normalized = uniform > 0 ? observed / uniform : 1;
  return Math.max(
    COMPOSITION_ADJUSTMENT_MIN,
    Math.min(COMPOSITION_ADJUSTMENT_MAX, 1 + (normalized - 1) * COMPOSITION_INFLUENCE)
  );
}

function compositionLine(mix: CharterExpectedShipMix): string {
  const labels: Record<ShipType, string> = {
    tourist: 'tourist',
    trader: 'trader',
    industrial: 'industrial',
    military: 'military',
    colonist: 'colonist'
  };
  const leading = SHIP_TYPES
    .map((shipType) => ({ shipType, share: mix[shipType] }))
    .sort((a, b) => b.share - a.share || SHIP_TYPES.indexOf(a.shipType) - SHIP_TYPES.indexOf(b.shipType))
    .slice(0, 2);
  return `Expected traffic mix: ${leading.map((entry) => `${labels[entry.shipType]} ${percent(entry.share)}%`).join(' · ')}; all ship types retain ambient traffic.`;
}

function rankedServices(
  economy: OpeningEconomyProfile,
  mix?: CharterExpectedShipMix
): CharterServiceForecast[] {
  const services: CharterServiceForecast[] = [
    {
      id: 'berths',
      label: 'Passenger berths',
      advantage: economy.passengerTrafficMultiplier / NEUTRAL_ECONOMY.passengerTrafficMultiplier,
      metric: `traveler traffic ${percent(economy.passengerTrafficMultiplier)}%`
    },
    {
      id: 'retail',
      label: 'Travel-supplies retail',
      advantage: economy.retailDemandMultiplier / NEUTRAL_ECONOMY.retailDemandMultiplier,
      metric: `retail demand ${percent(economy.retailDemandMultiplier)}%`
    },
    {
      id: 'fuel',
      label: 'Fuel depot',
      advantage: fuelMargin(economy) / fuelMargin(NEUTRAL_ECONOMY),
      metric: `fuel ${percent(economy.fuelSaleMultiplier)}% sale on ${percent(economy.fuelWholesaleMultiplier)}% feedstock`
    },
    {
      id: 'repair',
      label: 'Repair bay',
      advantage: economy.repairDemandMultiplier / NEUTRAL_ECONOMY.repairDemandMultiplier,
      metric: `repair demand ${percent(economy.repairDemandMultiplier)}%`
    },
    {
      id: 'freight',
      label: 'Courier freight',
      advantage: economy.courierTrafficMultiplier / NEUTRAL_ECONOMY.courierTrafficMultiplier,
      metric: `courier traffic ${percent(economy.courierTrafficMultiplier)}%`
    }
  ];
  const affinities: Record<CharterServiceId, ShipType[]> = {
    berths: ['tourist', 'colonist'],
    retail: ['tourist', 'trader', 'colonist'],
    fuel: ['industrial', 'trader', 'military'],
    repair: ['industrial', 'military'],
    freight: ['trader', 'industrial']
  };
  if (mix) {
    for (const service of services) {
      const adjustment = compositionAdjustment(mix, affinities[service.id]);
      service.advantage *= adjustment;
      service.compositionMultiplier = adjustment;
    }
  }
  // Stable: equal advantages keep the declaration order above.
  return services
    .map((service, index) => ({ service, index }))
    .sort((a, b) => b.service.advantage - a.service.advantage || a.index - b.index)
    .map((entry) => entry.service);
}

function toneForRatio(value: number, goodAbove: number, warnBelow: number): CharterTone {
  if (value >= goodAbove) return 'good';
  if (value <= warnBelow) return 'warn';
  return 'neutral';
}

function tradeoffLines(
  site: SiteCharter,
  economy: OpeningEconomyProfile,
  busiest: CharterFaceForecast,
  sheltered: CharterFaceForecast,
  evenApproaches: boolean
): string[] {
  const lines: string[] = [];
  if (!evenApproaches && busiest.trafficBand === 'heavy') {
    lines.push(
      `The ${LANE_NAME[busiest.lane]} face runs ${percent(busiest.trafficFactor)}% of default arrival volume: `
      + `more berth, retail and courier revenue, but every berth, gangway and queue competes for that one frontage.`
    );
  } else if (!evenApproaches && busiest.trafficBand === 'quiet') {
    lines.push(
      `No face gets above ${percent(busiest.trafficFactor)}% of default arrivals: frontage is never contested, `
      + `but deliveries stay expensive at ${percent(economy.supplyWholesaleMultiplier)}% wholesale, so revenue has to come from work done rather than volume.`
    );
  } else {
    lines.push(
      `Arrivals sit near ${percent(busiest.trafficFactor)}% of default on the busiest face and spread across the others: `
      + `no single frontage bottleneck, and no single lane worth over-building either.`
    );
  }
  if (site.resourceType) {
    lines.push(
      `${economy.resourceLabel}: supplies land at ${percent(economy.supplyWholesaleMultiplier)}% and fuel feedstock at `
      + `${percent(economy.fuelWholesaleMultiplier)}% of default, while the same belt pushes debris exposure to `
      + `${CHARTER_LEVEL_LABEL[charterLevelBand(site.debrisFactor)].toLowerCase()} and repair demand to ${percent(economy.repairDemandMultiplier)}%.`
    );
  } else {
    lines.push(
      `No belt nearby: supplies cost ${percent(economy.supplyWholesaleMultiplier)}% of default with no local discount, `
      + `but hull wear stays low and crew time goes into service instead of repair.`
    );
  }
  const sunBand = charterLevelBand(site.sunFactor);
  if (sunBand === 'high') {
    lines.push(
      `Bright orbit: ${percent(economy.solarYieldMultiplier)}% solar yield, and the same sunlight heats the rooms behind it.`
    );
  } else if (sunBand === 'low') {
    lines.push(
      `Deep shade: ${percent(economy.solarYieldMultiplier)}% solar yield means reactor power, and cool rooms that need no help staying cool.`
    );
  } else {
    lines.push(
      `Mixed light: ${percent(economy.solarYieldMultiplier)}% solar yield covers early load without making heat a problem yet.`
    );
  }
  lines.push(
    `Expanding toward the ${LANE_NAME[sheltered.lane]} face is the cheapest ground to hold; expanding toward `
    + `${LANE_NAME[busiest.lane]} buys traffic at the price of upkeep and contention.`
  );
  return lines;
}

function mitigationList(
  site: SiteCharter,
  economy: OpeningEconomyProfile,
  busiest: CharterFaceForecast,
  exposed: CharterFaceForecast,
  sheltered: CharterFaceForecast,
  evenApproaches: boolean
): CharterMitigation[] {
  const candidates: CharterMitigation[] = [];
  if (charterLevelBand(site.debrisFactor) !== 'low') {
    candidates.push({
      system: 'EVA repair capacity',
      detail:
        `Debris runs ${CHARTER_LEVEL_LABEL[charterLevelBand(site.debrisFactor)].toLowerCase()} and hits the `
        + `${LANE_NAME[exposed.lane]} face hardest. Staff maintenance and keep hull stock on hand so EVA repair keeps `
        + `pace with wear instead of chasing it.`
    });
  }
  if (!evenApproaches && busiest.trafficBand === 'heavy') {
    candidates.push({
      system: 'Redundant frontage',
      detail:
        `Run truss out to a second berth face rather than stacking every berth on ${LANE_NAME[busiest.lane]}, so one `
        + `queue cannot hold up ${percent(busiest.trafficFactor)}% of default arrivals.`
    });
  }
  if (charterLevelBand(site.sunFactor) === 'high') {
    candidates.push({
      system: 'Cooling',
      detail:
        `Solar generation pays ${percent(economy.solarYieldMultiplier)}% here, but insulation panels and vents on the `
        + `sunlit rooms are what keep guests and crew comfortable behind the panels.`
    });
  } else if (charterLevelBand(site.sunFactor) === 'low') {
    candidates.push({
      system: 'Solar generation',
      detail:
        `Panels only return ${percent(economy.solarYieldMultiplier)}% here, so budget reactor power early and spend the `
        + `saved panel space on service rooms.`
    });
  }
  candidates.push({
    system: 'Lower-exposure expansion',
    detail:
      `Grow toward the ${LANE_NAME[sheltered.lane]} face first: ${CHARTER_TRAFFIC_LABEL[sheltered.trafficBand].toLowerCase()} `
      + `arrivals and the least debris of the faces left for growth, which keeps new structure cheap to hold.`
  });
  return candidates.slice(0, 2);
}

/**
 * Derive the shared operating forecast for a chartered site. Pure and
 * deterministic: the same SiteCharter always yields the same forecast, and an
 * absent charter resolves to the neutral orbit the rest of the sim assumes.
 */
export function computeCharterOperatingForecast(site?: SiteCharter, system?: SystemMap): CharterOperatingForecast {
  const chartered = site !== undefined;
  const charter = site ?? NEUTRAL_SITE;
  const economy = deriveOpeningEconomyProfile(site);
  const faces = faceForecasts(charter);
  const busiestFace = pickFace(faces, (face) => face.trafficFactor, 'max');
  const quietestFace = pickFace(faces, (face) => face.trafficFactor, 'min');
  const exposedFace = pickFace(faces, (face) => face.debrisExposure, 'max');
  const evenApproaches = busiestFace.trafficFactor - quietestFace.trafficFactor < EVEN_APPROACH_SPREAD;
  // When one face clearly carries the traffic, it is the revenue frontage, so
  // it is never also the recommended growth direction — that would be two
  // contradictory instructions about the same face.
  const shelteredFace = pickFace(
    evenApproaches ? faces : faces.filter((face) => face.lane !== busiestFace.lane),
    (face) => face.buildPressure,
    'min'
  );
  const mix = site && system ? expectedShipMix(site, system) : undefined;
  const services = rankedServices(economy, mix);
  const lead = services[0];
  const support = services[1];
  const defer = services[services.length - 1];

  const resourceName = CHARTER_RESOURCE_LABEL[charter.resourceType ?? 'none'];
  const approachPhrase = evenApproaches
    ? `${CHARTER_TRAFFIC_LABEL[busiestFace.trafficBand]} approaches on every face`
    : `${CHARTER_TRAFFIC_LABEL[busiestFace.trafficBand]} ${LANE_NAME[busiestFace.lane]} approach`;
  const headline = chartered
    ? `${approachPhrase} · ${resourceName}`
    : `${approachPhrase} · standard orbit`;
  const summary =
    `Lead with ${lead.label.toLowerCase()} (${lead.metric}) and back it with ${support.label.toLowerCase()}; `
    + `${defer.label.toLowerCase()} pays least here. Solar yield ${percent(economy.solarYieldMultiplier)}%, `
    + `expand toward the ${LANE_NAME[shelteredFace.lane]} face.`;

  const resourceLine = charter.resourceType
    ? `${economy.resourceLabel}. Supplies ${percent(economy.supplyWholesaleMultiplier)}% wholesale, fuel feedstock ${percent(economy.fuelWholesaleMultiplier)}%.`
    : `No belt flavor within reach. Supplies ${percent(economy.supplyWholesaleMultiplier)}% wholesale, fuel feedstock ${percent(economy.fuelWholesaleMultiplier)}%.`;
  const powerLine =
    `${CHARTER_LEVEL_LABEL[charterLevelBand(charter.sunFactor)]} sunlight · solar yield ${percent(economy.solarYieldMultiplier)}% of default`
    + `${charterLevelBand(charter.sunFactor) === 'high' ? ' · sunlit rooms run hot' : charterLevelBand(charter.sunFactor) === 'low' ? ' · cold, dim public frontage' : ''}.`;
  const exposureLine =
    `${CHARTER_LEVEL_LABEL[charterLevelBand(charter.debrisFactor)]} debris exposure · repair demand `
    + `${percent(economy.repairDemandMultiplier)}%. The ${LANE_NAME[exposedFace.lane]} face takes the debris flow; `
    + `the ${LANE_NAME[shelteredFace.lane]} face is the calmest ground to grow into.`;
  const expansionLine = evenApproaches
    ? `No face is contested, so expansion is free to follow the ${LANE_NAME[shelteredFace.lane]} face, the calmest mix of arrivals and debris.`
    : `Keep the ${LANE_NAME[busiestFace.lane]} face for revenue frontage (${percent(busiestFace.trafficFactor)}% of default arrivals) `
      + `and put growth on the ${LANE_NAME[shelteredFace.lane]} face.`;

  const chips: CharterForecastChip[] = [
    {
      label: 'Traffic',
      detail: evenApproaches
        ? `${CHARTER_TRAFFIC_LABEL[busiestFace.trafficBand].toLowerCase()} on every face`
        : `${CHARTER_TRAFFIC_LABEL[busiestFace.trafficBand].toLowerCase()} on ${LANE_NAME[busiestFace.lane]} (${percent(busiestFace.trafficFactor)}%)`,
      tone: busiestFace.trafficBand === 'heavy' ? 'good' : busiestFace.trafficBand === 'quiet' ? 'warn' : 'neutral'
    },
    {
      label: 'Lead',
      detail: `${lead.label} · ${lead.metric}`,
      tone: 'good'
    },
    {
      label: 'Supplies',
      detail: `${percent(economy.supplyWholesaleMultiplier)}% wholesale`,
      tone: toneForRatio(1 / economy.supplyWholesaleMultiplier, 1 / 0.95, 1 / 1.08)
    },
    {
      label: 'Exposure',
      detail: `${CHARTER_LEVEL_LABEL[charterLevelBand(charter.debrisFactor)].toLowerCase()} debris · repairs ${percent(economy.repairDemandMultiplier)}%`,
      tone: charterLevelBand(charter.debrisFactor) === 'high' ? 'warn' : charterLevelBand(charter.debrisFactor) === 'low' ? 'good' : 'neutral'
    }
  ];

  return {
    version: CHARTER_FORECAST_VERSION,
    chartered,
    siteTag: economy.siteTag,
    headline,
    summary,
    chips,
    faces,
    busiestFace,
    exposedFace,
    shelteredFace,
    evenApproaches,
    services,
    ...(mix ? { expectedShipMix: mix, compositionLine: compositionLine(mix) } : {}),
    resourceLine,
    powerLine,
    exposureLine,
    expansionLine,
    tradeoffs: tradeoffLines(charter, economy, busiestFace, shelteredFace, evenApproaches),
    mitigations: mitigationList(charter, economy, busiestFace, exposedFace, shelteredFace, evenApproaches),
    viability:
      `Every face keeps ambient traffic, so no site starves — this one earns through ${lead.label.toLowerCase()}.`,
    economy
  };
}
