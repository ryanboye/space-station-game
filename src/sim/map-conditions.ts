import {
  clamp,
  fromIndex,
  GRID_HEIGHT,
  GRID_WIDTH,
  type MapConditionKind,
  type MapConditionSample,
  type StationState
} from './types';

export const MAP_CONDITION_VERSION = 1;

function fract(value: number): number {
  return value - Math.floor(value);
}

function hash01(seed: number, x: number, y: number, salt: number): number {
  const n = Math.sin((x * 127.1 + y * 311.7 + seed * 0.013 + salt * 74.7) * 0.017453292519943295) * 43758.5453123;
  return fract(n);
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / Math.max(0.0001, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// How strongly a chartered site pulls its baseline toward the extreme.
// A high factor lifts the value toward 1 (bright sun / heavy debris); a very
// low factor (below the shade threshold) pulls it back toward the calm, dark
// end so outer-system and sheltered charters read distinctly. All pure.
const SITE_LIFT_WEIGHT = 0.55;
const SITE_SHADE_THRESHOLD = 0.35;
const SITE_SHADE_WEIGHT = 0.55;

function blendSiteBaseline(value: number, factor: number): number {
  const f = clamp(factor, 0, 1);
  const lifted = value + (1 - value) * f * SITE_LIFT_WEIGHT;
  if (f >= SITE_SHADE_THRESHOLD) return clamp(lifted, 0, 1);
  const pull = (SITE_SHADE_THRESHOLD - f) / SITE_SHADE_THRESHOLD;
  return clamp(lifted - lifted * pull * SITE_SHADE_WEIGHT, 0, 1);
}

function lowFrequencyNoise(seed: number, x: number, y: number, salt: number): number {
  const sx = x / 18;
  const sy = y / 18;
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const fx = sx - x0;
  const fy = sy - y0;
  const a = hash01(seed, x0, y0, salt);
  const b = hash01(seed, x0 + 1, y0, salt);
  const c = hash01(seed, x0, y0 + 1, salt);
  const d = hash01(seed, x0 + 1, y0 + 1, salt);
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  return a * (1 - ux) * (1 - uy) + b * ux * (1 - uy) + c * (1 - ux) * uy + d * ux * uy;
}

export function mapConditionAt(state: StationState, kind: MapConditionKind, tileIndex: number): number {
  const pos = fromIndex(tileIndex, state.width);
  const seed = state.seedAtCreation;
  const worldX = pos.x + (state.mapWorldOriginX ?? 0);
  const worldY = pos.y + (state.mapWorldOriginY ?? 0);
  const cx = (worldX - GRID_WIDTH / 2) / Math.max(1, GRID_WIDTH);
  const cy = (worldY - GRID_HEIGHT / 2) / Math.max(1, GRID_HEIGHT);
  const angle = hash01(seed, 3, 7, 11) * Math.PI * 2;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const alongSun = cx * dx + cy * dy;
  const crossSun = cx * -dy + cy * dx;
  const waviness = (lowFrequencyNoise(seed, worldX, worldY, 21) - 0.5) * 0.24;
  // Chartered position, if any. Absent → every path below is bit-identical to
  // the legacy behavior (the `value` returned is the exact same expression).
  const site = state.site;

  if (kind === 'sunlight') {
    const band = smoothstep(-0.22, 0.42, alongSun + waviness);
    const occluder = Math.max(0, 1 - Math.abs(crossSun + (hash01(seed, 5, 9, 31) - 0.5) * 0.45) * 5.2);
    const value = clamp(band - occluder * 0.34 + lowFrequencyNoise(seed, worldX, worldY, 41) * 0.12, 0, 1);
    return site ? blendSiteBaseline(value, site.sunFactor) : value;
  }

  if (kind === 'debris-risk') {
    const edgeX = Math.min(worldX, GRID_WIDTH - 1 - worldX) / Math.max(1, GRID_WIDTH / 2);
    const edgeY = Math.min(worldY, GRID_HEIGHT - 1 - worldY) / Math.max(1, GRID_HEIGHT / 2);
    const edge = clamp(1 - Math.min(edgeX, edgeY), 0, 1);
    const debrisAngle = angle + Math.PI * (0.45 + hash01(seed, 11, 13, 51) * 0.5);
    const ddx = Math.cos(debrisAngle);
    const ddy = Math.sin(debrisAngle);
    const lane = cx * ddx + cy * ddy;
    const lobe = smoothstep(-0.15, 0.55, lane + lowFrequencyNoise(seed, worldX, worldY, 61) * 0.28);
    const value = clamp(edge * 0.45 + lobe * 0.55 + lowFrequencyNoise(seed, worldX, worldY, 71) * 0.1, 0, 1);
    return site ? blendSiteBaseline(value, site.debrisFactor) : value;
  }

  const shade = 1 - mapConditionAt(state, 'sunlight', tileIndex);
  const pocket = lowFrequencyNoise(seed, worldX, worldY, 91);
  return clamp(shade * 0.45 + pocket * 0.55, 0, 1);
}

function labelFor(kind: MapConditionKind, value: number): string {
  if (kind === 'sunlight') {
    if (value >= 0.72) return 'bright sun';
    if (value >= 0.42) return 'mixed light';
    return 'deep shade';
  }
  if (kind === 'debris-risk') {
    if (value >= 0.72) return 'heavy debris';
    if (value >= 0.42) return 'debris exposed';
    return 'sheltered space';
  }
  if (value >= 0.72) return 'thermal sink';
  if (value >= 0.42) return 'cool pocket';
  return 'neutral thermal';
}

export function mapConditionSamplesAt(state: StationState, tileIndex: number): MapConditionSample[] {
  const sunlight = mapConditionAt(state, 'sunlight', tileIndex);
  const debris = mapConditionAt(state, 'debris-risk', tileIndex);
  const thermal = mapConditionAt(state, 'thermal-sink', tileIndex);
  return [
    {
      kind: 'sunlight',
      value: sunlight,
      label: labelFor('sunlight', sunlight),
      upside: sunlight >= 0.42 ? 'future solar/tourism/hydroponics appeal' : 'cooler service/residential placement',
      downside: sunlight >= 0.42 ? 'heat and wear pressure' : 'poor solar/public appeal'
    },
    {
      kind: 'debris-risk',
      value: debris,
      label: labelFor('debris-risk', debris),
      upside: debris >= 0.42 ? 'future salvage/resource opportunity' : 'low exterior upkeep',
      downside: debris >= 0.42 ? 'higher hull/dock maintenance' : 'less debris-driven opportunity'
    },
    {
      kind: 'thermal-sink',
      value: thermal,
      label: labelFor('thermal-sink', thermal),
      upside: thermal >= 0.42 ? 'better cooling for high-load rooms' : 'neutral routing',
      downside: thermal >= 0.42 ? 'may be awkward for public frontage' : 'less natural cooling'
    }
  ];
}
