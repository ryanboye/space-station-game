// System Map (MVP) — procedural star system generator.
//
// Pure deterministic function: given a seed, returns a SystemMap.
// Used by createInitialState to populate state.system and consumed by
// generateLaneProfiles to derive per-lane ship-type weights from the
// dominant faction(s) along each lane.
//
// Design notes:
// - Uses an internal xorshift PRNG seeded from a sub-seed of state.seed
//   so it doesn't deplete the StationState's primary rng (which other
//   systems — scenario builder, manifest gen — rely on for stability).
// - 6 hand-authored faction archetypes (Open Q §1c hybrid). Each
//   archetype has fixed shipBias weights and a name pool; the
//   procedural skin picks a name from the pool.
// - Faction count: 3-6 per save.
// - Planet count: 2-6 per save.
// - Asteroid belt count: 1-3 per save.
// - laneSectors keyed by SpaceLane; dominantFactionId is the single
//   primary faction for the lane (or null if unclaimed).

import type {
  AsteroidBelt,
  Faction,
  FactionTemplateId,
  LaneSector,
  Planet,
  ShipType,
  SpaceLane,
  SystemMap
} from './types';

const LANES: SpaceLane[] = ['north', 'east', 'south', 'west'];

// xorshift32 — independent of types.makeRng so we don't double-up the
// PRNG sequence. Seeded from a sub-seed, see deriveSystemSeed().
function makeXorshift(seed: number): () => number {
  let s = (seed | 0) === 0 ? 0x9e3779b1 : seed | 0;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 0x100000000) / 0x100000000;
  };
}

// Derive a stable sub-seed from the parent seed + a tag string. Mixed
// hash so e.g. seed=1337 + 'system' is far from seed=1337 + 'manifest'.
export function deriveSystemSeed(parentSeed: number, tag: string): number {
  let h = parentSeed | 0;
  for (let i = 0; i < tag.length; i++) {
    h = (Math.imul(h ^ tag.charCodeAt(i), 0x01000193) | 0) >>> 0;
  }
  // Final avalanche
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

interface FactionTemplate {
  templateId: FactionTemplateId;
  shipBias: Partial<Record<ShipType, number>>;
  // Color is fixed per archetype (so the legend is consistent).
  color: string;
  // Single-letter sigil token used in the modal labels: [T], [I], etc.
  sigil: string;
  // Procedural skin name pool — 4-5 entries.
  namePool: string[];
}

// Hand-authored archetypes (Open Q §1c hybrid). shipBias values are
// relative weights; they're normalized after averaging across a lane's
// dominant factions.
const FACTION_TEMPLATES: FactionTemplate[] = [
  {
    templateId: 'trader-guild',
    shipBias: { trader: 0.65, tourist: 0.2, industrial: 0.1, colonist: 0.05 },
    color: '#f5b94a',
    sigil: 'T',
    namePool: [
      'Cassiopeia Mercantile League',
      'Vega Trade Concord',
      'Aldebaran Spice Pact',
      'Sirian Coin Confederacy',
      'Helix Brokers Union'
    ]
  },
  {
    templateId: 'industrial-combine',
    shipBias: { industrial: 0.7, trader: 0.2, military: 0.05, colonist: 0.05 },
    color: '#9c8b7a',
    sigil: 'I',
    namePool: [
      'Forgeworks Combine',
      'Ironring Syndicate',
      'Anvil & Slag Cooperative',
      'Tantalus Smelting Bloc',
      'Hephaestus Industrial Trust'
    ]
  },
  {
    templateId: 'colonial-authority',
    shipBias: { colonist: 0.65, trader: 0.15, tourist: 0.1, industrial: 0.1 },
    color: '#5fb874',
    sigil: 'C',
    namePool: [
      'Greenwake Colonial Authority',
      'Verdant Reach Compact',
      'New Ararat Settlers',
      'Pioneers of the Long Drift',
      'Heartwood Colonial Office'
    ]
  },
  {
    templateId: 'military-bloc',
    shipBias: { military: 0.7, industrial: 0.15, trader: 0.1, colonist: 0.05 },
    color: '#b04a4a',
    sigil: 'M',
    namePool: [
      'Vanguard Defensive Bloc',
      'Praetorian Star Legion',
      'Sable Watch Coalition',
      'Iron Coronet Marines',
      'Helion Border Force'
    ]
  },
  {
    templateId: 'free-port',
    shipBias: { trader: 0.4, tourist: 0.3, industrial: 0.15, colonist: 0.15 },
    color: '#4ab3d6',
    sigil: 'F',
    namePool: [
      'Port Bellwether',
      'Argo Free Anchorage',
      'Driftwood Free Port',
      'Lighthouse Free Cities',
      'Pelican Bay Compact'
    ]
  },
  {
    templateId: 'pleasure-syndicate',
    shipBias: { tourist: 0.7, trader: 0.15, colonist: 0.1, military: 0.05 },
    color: '#d167b8',
    sigil: 'P',
    namePool: [
      'Aurora Pleasure Syndicate',
      'Velvet Halo Cartel',
      'Sapphire Tides Concordat',
      'Lucent Drift Resorts',
      'Carnival of the Outer Rim'
    ]
  }
];

const PLANET_NAMES = [
  'Korin', 'Hathos', 'Vesperin', 'Tessen', 'Mira IV', 'Olun',
  'Brel', 'Cerros', 'Yemen Drift', 'Phaesar', 'Wandel', 'Roan',
  'Khaeris', 'Ulmar', 'Sondt', 'Inara', 'Pelis', 'Dor-Vekht',
  'Astra Minor', 'Heliodyne', 'Moriath', 'Ylix', 'Cantor', 'Nimue'
];

const PLANET_BODY_TYPES: Array<'rocky' | 'gas' | 'ice'> = ['rocky', 'gas', 'ice'];
const BELT_RESOURCES: Array<'metal' | 'ice' | 'gas'> = ['metal', 'ice', 'gas'];

function pickIndex(rng: () => number, len: number): number {
  return Math.floor(rng() * len) % len;
}

function pickFromPool<T>(rng: () => number, pool: T[], used: Set<T>): T {
  // Avoid duplicates within the same save when possible.
  if (used.size >= pool.length) {
    return pool[pickIndex(rng, pool.length)];
  }
  for (let i = 0; i < 16; i++) {
    const candidate = pool[pickIndex(rng, pool.length)];
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
  // Fallback — should be rare.
  return pool[pickIndex(rng, pool.length)];
}

export function sigilForFaction(faction: Faction): string {
  const template = FACTION_TEMPLATES.find((t) => t.templateId === faction.templateId);
  return template?.sigil ?? '?';
}

export function generateSystemMap(seed: number): SystemMap {
  const sub = deriveSystemSeed(seed, 'system');
  const rng = makeXorshift(sub);

  // 3-6 factions
  const factionCount = 3 + Math.floor(rng() * 4); // 3..6
  const usedTemplateIds = new Set<FactionTemplateId>();
  const usedNames = new Set<string>();
  const factions: Faction[] = [];
  for (let i = 0; i < factionCount; i++) {
    // Pick a template not yet used (we have exactly 6 templates).
    let template: FactionTemplate;
    let safety = 0;
    do {
      template = FACTION_TEMPLATES[pickIndex(rng, FACTION_TEMPLATES.length)];
      safety++;
    } while (usedTemplateIds.has(template.templateId) && safety < 16);
    usedTemplateIds.add(template.templateId);
    const displayName = pickFromPool(rng, template.namePool, usedNames);
    factions.push({
      id: `faction-${i}-${template.templateId}`,
      templateId: template.templateId,
      displayName,
      color: template.color,
      shipBias: { ...template.shipBias }
    });
  }

  // 2-6 planets
  const planetCount = 2 + Math.floor(rng() * 5); // 2..6
  const usedPlanetNames = new Set<string>();
  const planets: Planet[] = [];
  for (let i = 0; i < planetCount; i++) {
    const factionId = factions[pickIndex(rng, factions.length)].id;
    // Spread planets evenly-ish around the orbit, with jitter.
    const baseAngle = (i / planetCount) * Math.PI * 2;
    const jitter = (rng() - 0.5) * (Math.PI / Math.max(2, planetCount));
    const orbitAngle = (baseAngle + jitter + Math.PI * 2) % (Math.PI * 2);
    // Orbit radius spread between ~0.18 and ~0.92 with mild ordering.
    const orbitRadius = 0.18 + (i / Math.max(1, planetCount - 1)) * 0.7 + (rng() - 0.5) * 0.06;
    const bodyType = PLANET_BODY_TYPES[pickIndex(rng, PLANET_BODY_TYPES.length)];
    const displayName = pickFromPool(rng, PLANET_NAMES, usedPlanetNames);
    planets.push({
      id: `planet-${i}`,
      factionId,
      displayName,
      orbitRadius: Math.max(0.1, Math.min(0.95, orbitRadius)),
      orbitAngle,
      bodyType
    });
  }

  // 1-3 asteroid belts
  const beltCount = 1 + Math.floor(rng() * 3); // 1..3
  const asteroidBelts: AsteroidBelt[] = [];
  for (let i = 0; i < beltCount; i++) {
    const center = 0.25 + rng() * 0.6; // 0.25..0.85
    const halfWidth = 0.03 + rng() * 0.05; // 0.03..0.08
    const innerRadius = Math.max(0.12, center - halfWidth);
    const outerRadius = Math.min(0.96, center + halfWidth);
    const resourceType = BELT_RESOURCES[pickIndex(rng, BELT_RESOURCES.length)];
    const factionClaim = rng() < 0.5 ? factions[pickIndex(rng, factions.length)].id : null;
    asteroidBelts.push({
      id: `belt-${i}`,
      innerRadius,
      outerRadius,
      resourceType,
      factionClaim
    });
  }

  // Lane sectors. Each lane gets 1-3 factions whose territory it
  // crosses; the first one is the dominant faction.
  const laneSectors: Record<SpaceLane, LaneSector> = {
    north: { factionIds: [], dominantFactionId: null },
    east: { factionIds: [], dominantFactionId: null },
    south: { factionIds: [], dominantFactionId: null },
    west: { factionIds: [], dominantFactionId: null }
  };
  for (const lane of LANES) {
    const sectorFactionCount = 1 + Math.floor(rng() * Math.min(3, factions.length)); // 1..3
    const ids: string[] = [];
    const used = new Set<string>();
    for (let i = 0; i < sectorFactionCount; i++) {
      let safety = 0;
      let pick: Faction;
      do {
        pick = factions[pickIndex(rng, factions.length)];
        safety++;
      } while (used.has(pick.id) && safety < 16);
      if (!used.has(pick.id)) {
        used.add(pick.id);
        ids.push(pick.id);
      }
    }
    laneSectors[lane] = {
      factionIds: ids,
      dominantFactionId: ids.length > 0 ? ids[0] : null
    };
  }

  return {
    factions,
    planets,
    asteroidBelts,
    laneSectors,
    seedAtCreation: seed
  };
}

// Compute normalized ship-type weights for a lane from its dominant
// factions' shipBias tables. Falls back to uniform-ish weights if no
// factions are claimed.
export function laneWeightsFromSystem(
  system: SystemMap,
  lane: SpaceLane
): Record<ShipType, number> {
  const sector = system.laneSectors[lane];
  const dominantIds = sector.dominantFactionId
    ? [sector.dominantFactionId]
    : sector.factionIds;
  const factions = dominantIds
    .map((id) => system.factions.find((f) => f.id === id))
    .filter((f): f is Faction => !!f);

  // Sum each ship type across the dominant factions, then normalize.
  const sums: Record<ShipType, number> = {
    tourist: 0,
    trader: 0,
    industrial: 0,
    military: 0,
    colonist: 0
  };
  if (factions.length === 0) {
    // Generic-ish fallback.
    return { tourist: 0.3, trader: 0.3, industrial: 0.15, military: 0.1, colonist: 0.15 };
  }
  for (const f of factions) {
    sums.tourist += f.shipBias.tourist ?? 0;
    sums.trader += f.shipBias.trader ?? 0;
    sums.industrial += f.shipBias.industrial ?? 0;
    sums.military += f.shipBias.military ?? 0;
    sums.colonist += f.shipBias.colonist ?? 0;
  }
  // Add a small floor so no ship type goes truly to zero — keeps lane
  // diversity reasonable in MVP.
  const FLOOR = 0.02;
  sums.tourist += FLOOR;
  sums.trader += FLOOR;
  sums.industrial += FLOOR;
  sums.military += FLOOR;
  sums.colonist += FLOOR;
  const total = sums.tourist + sums.trader + sums.industrial + sums.military + sums.colonist;
  if (total <= 0) {
    return { tourist: 0.2, trader: 0.2, industrial: 0.2, military: 0.2, colonist: 0.2 };
  }
  return {
    tourist: sums.tourist / total,
    trader: sums.trader / total,
    industrial: sums.industrial / total,
    military: sums.military / total,
    colonist: sums.colonist / total
  };
}
