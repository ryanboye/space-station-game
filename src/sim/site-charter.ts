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

import type { LaneRoute, SiteCharter, SpaceLane, SystemMap } from './types';

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
