import { MODULE_DEFINITIONS } from './balance';
import {
  ModuleType,
  RoomType,
  type CommercialBusinessKind,
  type CommercialFitoutPlacement,
  type CommercialOffer,
  type ModuleRotation
} from './types';

interface OfferContext {
  width: number;
  tiles: number[];
  firstOfferId: number;
}

interface FixtureSpec {
  module: ModuleType;
  count: number;
  placement: 'edge' | 'center' | 'any';
}

interface BusinessTemplate {
  kind: CommercialBusinessKind;
  targetRoom: RoomType;
  minTiles: number;
  fixtures: FixtureSpec[];
  tenants: Array<[tenant: string, brand: string, concept: string]>;
  rentBase: number;
  revenueShare: number;
  customers: number;
  staff: number;
  stockPolicy: string;
}

const TEMPLATES: BusinessTemplate[] = [
  {
    kind: 'market-stall',
    targetRoom: RoomType.Market,
    minTiles: 10,
    fixtures: [
      { module: ModuleType.MarketStall, count: 1, placement: 'edge' },
      { module: ModuleType.Bench, count: 1, placement: 'center' },
      { module: ModuleType.Plant, count: 1, placement: 'any' }
    ],
    tenants: [
      ['Mira Venn', 'Venn Transit Market', 'Fast provisions for crews in a hurry'],
      ['Juno Supply Cooperative', 'Last Stop Kiosk', 'Cheap essentials and travel goods'],
      ['Pax Orlov', 'Dockside Sundries', 'A compact neighborhood stall']
    ],
    rentBase: 34,
    revenueShare: 0.08,
    customers: 14,
    staff: 1,
    stockPolicy: 'Tenant imports ordinary provisions'
  },
  {
    kind: 'cantina',
    targetRoom: RoomType.Cantina,
    minTiles: 12,
    fixtures: [
      { module: ModuleType.BarCounter, count: 1, placement: 'edge' },
      { module: ModuleType.Tap, count: 1, placement: 'edge' },
      { module: ModuleType.Bench, count: 2, placement: 'center' }
    ],
    tenants: [
      ['Rook Hospitality', 'The Loose Coupling', 'A lively bar for short-turn traffic'],
      ['Sana Ko', 'Periapsis', 'Quiet drinks and long conversations'],
      ['Gannet Beverage Union', 'Blue Shift', 'A practical crew-and-traveler cantina']
    ],
    rentBase: 48,
    revenueShare: 0.12,
    customers: 22,
    staff: 2,
    stockPolicy: 'Tenant supplies beverages and bar staff'
  },
  {
    kind: 'restaurant',
    targetRoom: RoomType.Cafeteria,
    minTiles: 18,
    fixtures: [
      { module: ModuleType.ServingStation, count: 1, placement: 'edge' },
      { module: ModuleType.Table, count: 2, placement: 'center' },
      { module: ModuleType.Plant, count: 1, placement: 'any' }
    ],
    tenants: [
      ['Aster Kitchens', 'Aster Noodle House', 'Counter service with communal tables'],
      ['The Hearthline Group', 'Hearthline Galley', 'Reliable meals for long-stay passengers'],
      ['Chef Nadi Kest', 'Kest Table', 'A small premium station restaurant']
    ],
    rentBase: 62,
    revenueShare: 0.1,
    customers: 30,
    staff: 3,
    stockPolicy: 'Tenant supplies prepared meals during the prototype'
  },
  {
    kind: 'gift-shop',
    targetRoom: RoomType.Market,
    minTiles: 14,
    fixtures: [
      { module: ModuleType.MarketStall, count: 2, placement: 'edge' },
      { module: ModuleType.Bench, count: 1, placement: 'center' },
      { module: ModuleType.Plant, count: 2, placement: 'any' }
    ],
    tenants: [
      ['Halo Retail', 'Halo & Home', 'Station keepsakes and premium travel goods'],
      ['Vela Artisans', 'Made Beyond', 'Local craft, curios, and gifts'],
      ['Farpoint Mercantile', 'Farpoint Outfitters', 'High-margin expedition merchandise']
    ],
    rentBase: 54,
    revenueShare: 0.14,
    customers: 18,
    staff: 2,
    stockPolicy: 'Tenant imports curated retail goods'
  }
];

function hashInt(value: number): number {
  let n = value | 0;
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return (n ^ (n >>> 16)) >>> 0;
}

function placementCandidates(
  width: number,
  tiles: number[],
  module: ModuleType,
  preference: FixtureSpec['placement'],
  salt: number
): Array<{ tile: number; rotation: ModuleRotation; score: number }> {
  const tileSet = new Set(tiles);
  const candidates: Array<{ tile: number; rotation: ModuleRotation; score: number }> = [];
  const xs = tiles.map((tile) => tile % width);
  const ys = tiles.map((tile) => Math.floor(tile / width));
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const rotations: ModuleRotation[] = MODULE_DEFINITIONS[module].rotatable ? [0, 90] : [0];

  for (const tile of tiles) {
    const x = tile % width;
    const y = Math.floor(tile / width);
    for (const rotation of rotations) {
      const def = MODULE_DEFINITIONS[module];
      const footprintWidth = rotation === 90 ? def.height : def.width;
      const footprintHeight = rotation === 90 ? def.width : def.height;
      let valid = true;
      for (let dy = 0; dy < footprintHeight && valid; dy++) {
        for (let dx = 0; dx < footprintWidth; dx++) {
          if (x + dx >= width || !tileSet.has((y + dy) * width + x + dx)) {
            valid = false;
            break;
          }
        }
      }
      if (!valid) continue;
      const edgeDistance = Math.min(x - minX, maxX - x, y - minY, maxY - y);
      const centerDistance = Math.abs(x - cx) + Math.abs(y - cy);
      const base = preference === 'edge' ? edgeDistance * 100 : preference === 'center' ? centerDistance * 20 : 0;
      candidates.push({ tile, rotation, score: base + (hashInt(tile + salt + rotation) % 17) });
    }
  }
  return candidates.sort((a, b) => a.score - b.score || a.tile - b.tile || a.rotation - b.rotation);
}

function placementTiles(width: number, placement: CommercialFitoutPlacement): number[] {
  const def = MODULE_DEFINITIONS[placement.module];
  const w = placement.rotation === 90 ? def.height : def.width;
  const h = placement.rotation === 90 ? def.width : def.height;
  const x = placement.originTile % width;
  const y = Math.floor(placement.originTile / width);
  const result: number[] = [];
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) result.push((y + dy) * width + x + dx);
  }
  return result;
}

function buildFitout(
  width: number,
  tiles: number[],
  template: BusinessTemplate,
  salt: number
): CommercialFitoutPlacement[] | null {
  if (tiles.length < template.minTiles) return null;
  const occupied = new Set<number>();
  const placements: CommercialFitoutPlacement[] = [];
  for (const fixture of template.fixtures) {
    for (let count = 0; count < fixture.count; count++) {
      const candidate = placementCandidates(width, tiles, fixture.module, fixture.placement, salt + placements.length * 97)
        .find((entry) => {
          const next: CommercialFitoutPlacement = {
            module: fixture.module,
            originTile: entry.tile,
            rotation: entry.rotation
          };
          return placementTiles(width, next).every((tile) => !occupied.has(tile));
        });
      if (!candidate) return null;
      const placement: CommercialFitoutPlacement = {
        module: fixture.module,
        originTile: candidate.tile,
        rotation: candidate.rotation
      };
      placements.push(placement);
      for (const tile of placementTiles(width, placement)) occupied.add(tile);
    }
  }
  return placements;
}

export function generateCommercialOffers(context: OfferContext): CommercialOffer[] {
  const anchor = Math.min(...context.tiles);
  const start = hashInt(anchor + context.tiles.length * 31) % TEMPLATES.length;
  const ordered = TEMPLATES.map((_, index) => TEMPLATES[(start + index) % TEMPLATES.length]);
  const offers: CommercialOffer[] = [];
  for (const template of ordered) {
    const fixtures = buildFitout(context.width, context.tiles, template, anchor + offers.length * 211);
    if (!fixtures) continue;
    const tenantIndex = hashInt(anchor + template.kind.length * 101) % template.tenants.length;
    const [tenantName, brandName, concept] = template.tenants[tenantIndex];
    const sizeBonus = Math.max(0, context.tiles.length - template.minTiles);
    offers.push({
      id: context.firstOfferId + offers.length,
      kind: template.kind,
      tenantName,
      brandName,
      concept,
      targetRoom: template.targetRoom,
      fixtures,
      baseRentPerCycle: Math.round(template.rentBase + sizeBonus * 1.25),
      revenueShare: template.revenueShare,
      fitoutDurationSec: 7 + fixtures.length * 1.6,
      expectedCustomersPerCycle: template.customers + Math.floor(sizeBonus * 0.5),
      suppliedStaff: template.staff,
      stockPolicy: template.stockPolicy
    });
    if (offers.length >= 3) break;
  }
  return offers;
}

export function commercialBusinessLabel(kind: CommercialBusinessKind): string {
  switch (kind) {
    case 'market-stall': return 'Market Stall';
    case 'cantina': return 'Cantina';
    case 'restaurant': return 'Restaurant';
    case 'gift-shop': return 'Gift Shop';
  }
}
