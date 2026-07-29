import {
  ModuleType,
  ResidentState,
  RoomType,
  TILE_SIZE,
  TileType,
  type DiagnosticOverlay,
  type LifeSupportCoverageDiagnostic,
  type RoutePressureDiagnostics,
  type ReputationZoneScore,
  type ShipSize,
  type ShipHullVariant,
  type ShipType,
  type SpaceLane,
  type UtilityUnderlayKind,
  VisitorState,
  ZoneType,
  inBounds,
  fromIndex,
  toIndex,
  isWalkable,
  type ItemType,
  type PlaceableStructuralPieceKind,
  type BuildTool,
  type StationState
} from '../sim/types';
import { MODULE_DEFINITIONS, VISIT_TIMINGS } from '../sim/balance';
import { previewModulePlacement } from '../sim/construction';
import {
  collectActiveRoomTiles,
  airQualityAt,
  collectQueueTargets,
  collectServiceNodeReachability,
  canPlaceUtilityUnderlay,
  getDockByTile,
  getBerthFacilityAt,
  getLifeSupportCoverageDiagnostics,
  getLifeSupportTileDiagnostic,
  getAirDuctNetworkDiagnostics,
  getFuelPipeNetworkDiagnostics,
  itemStockAtNode,
  getPowerNetworkDiagnostics,
  getUnpoweredPowerRoomAnchors,
  getWaterPipeNetworkDiagnostics,
  getUtilityUnderlayTileDiagnostic,
  getSanitationTileDiagnostic,
  mapConditionSamplesAt,
  getMaintenanceTileDiagnostic,
  getMarketFixtureStatus,
  getModuleMovePreview,
  getRoutePressureDiagnostics,
  getRoutePressureTileDiagnostic,
  getReputationTileDiagnostic,
  getReputationZoneScores,
  getRoomEnvironmentTileDiagnostic,
  getThermalTileDiagnostic,
  isCrewHoldingProtectedPost,
  resolveWallLightFacing,
  hasUtilityUnderlay,
  utilityUnderlayNeighborMask,
  utilityUnderlayShapeForMask,
  wallMountedModuleServiceTile,
  validateBerthModulePlacement,
  validateDockPlacement,
  getApproachConflictGroups,
  getDockingSlotDescriptors,
  getPodDockPlacementView,
  validateDockingSlot,
  validateStructuralPiecePlacement
} from '../sim/sim';
import {
  barGroupStatus,
  barGroups,
  fixtureCapacityReport,
  marketChainStatus,
  type MarketChainStatus,
  barGroupAtTile,
  barGroupStock,
  shelfAppealFor
} from '../sim/facility-machines';
import {
  FACILITY_BLOCKED_LABEL,
  firstBlockedReason,
  type FacilityBlockedReason
} from '../sim/facility-slots';
import {
  approachLaneAlignment,
  buildDockingSlotDescriptor,
  deriveApproachConflictGroups,
  envelopeForHull,
  type DockingSlotDescriptor,
  type WorldRect
} from '../sim/approach-envelopes';
import {
  DOOR_SPRITE_VARIANT_KEYS,
  MODULE_SPRITE_KEYS,
  ROOM_SPRITE_KEYS,
  TILE_SPRITE_KEYS,
  WALL_SPRITE_VARIANT_KEYS,
  STRUCTURAL_SPRITE_KEYS
} from './sprite-keys';
import {
  structuralPieceDimensions,
  overloadedStructuralPieceIds,
  validateLiveStructuralInterfaces
} from '../sim/structural-support';
import { shipHullAssetPath, shipHullProfile } from '../sim/ship-hulls';
import { PORT_INFRASTRUCTURE_SPRITE_KEYS, type SpriteAtlas, type SpriteFrame } from './sprite-atlas';
import { drawEnvironmentAtlasCell, getEnvironmentPiece } from './environment-pieces';
import {
  AGENT_EVA_SUIT_SPRITE_KEY,
  AGENT_SPRITE_VARIANTS,
  DOCK_OVERLAY_SPRITE_KEYS,
  DOCK_FACADE_ROTATION,
  FX_SPRITE_KEYS,
  FLOOR_GRIME_SPRITE_KEYS,
  FLOOR_WEAR_SPRITE_KEYS,
  HULL_WEAR_SPRITE_KEYS,
  IMPACT_DEBRIS_SPRITE_KEYS,
  SPACE_DEBRIS_SPRITE_KEYS,
  STAFF_ROLE_SPRITE_KEYS,
  STRUCTURAL_FRONTAGE_SPRITE_KEYS,
  UTILITY_UNDERLAY_SPRITE_KEYS
} from './sprite-keys-extended';
import { resolveDoorVariantForTile, resolveWallVariantForTile } from './tile-variants';
import { renderDualWallLayer } from './wall-dual-tilemap';
import { renderWallDetailLayer } from './wall-detail-layer';
import { renderRoomLabelLayer } from './room-label-layer';
import { renderDoorDockDetailLayer } from './door-dock-detail-layer';
import { renderGlowPass, type GlowRenderViewport } from './glow-pass';
import { FACILITY_SPRITE_VARIANTS, facilitySpriteKeyForModule } from './facility-sprite-state';

const PX = TILE_SIZE / 18;  // pixel scale factor relative to original 18px tile size

/** A world-only approach overlay is supplied only while building or inspecting. */
export interface ApproachEnvelopePreview {
  inspectedSlotId?: string | null;
  berthPlacementTiles?: number[];
  /** Candidate selected by an Approach Control offer card hover/focus. */
  candidateOfferId?: number | null;
  candidateSlotId?: string | null;
  candidateHullVariant?: ShipHullVariant;
  candidateShipSize?: ShipSize;
}

const tileColor: Record<TileType, string> = {
  [TileType.Space]: '#071019',
  [TileType.Truss]: '#182635',
  [TileType.Floor]: '#273240',
  [TileType.Wall]: '#465569',
  [TileType.Dock]: '#3e8ec9',
  [TileType.Cafeteria]: '#4ea66e',
  [TileType.Reactor]: '#b97d39',
  [TileType.Security]: '#bd4f4f',
  [TileType.Door]: '#7d8faa',
  [TileType.Airlock]: '#6fd8ff'
};

function drawTrussFallback(ctx: CanvasRenderingContext2D, px: number, py: number): boolean {
  const p = PX;
  ctx.fillStyle = tileColor[TileType.Space];
  ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
  ctx.strokeStyle = 'rgba(98, 185, 210, 0.62)';
  ctx.lineWidth = Math.max(1, Math.round(1.25 * p));
  ctx.beginPath();
  ctx.moveTo(px + 3 * p, py + 3 * p);
  ctx.lineTo(px + 15 * p, py + 15 * p);
  ctx.moveTo(px + 15 * p, py + 3 * p);
  ctx.lineTo(px + 3 * p, py + 15 * p);
  ctx.moveTo(px + 2 * p, py + 9 * p);
  ctx.lineTo(px + 16 * p, py + 9 * p);
  ctx.moveTo(px + 9 * p, py + 2 * p);
  ctx.lineTo(px + 9 * p, py + 16 * p);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(189, 228, 234, 0.74)';
  ctx.lineWidth = Math.max(1, Math.round(0.75 * p));
  ctx.strokeRect(px + 3.5 * p, py + 3.5 * p, 11 * p, 11 * p);
  return true;
}

const roomOverlay: Record<RoomType, string> = {
  [RoomType.None]: 'transparent',
  [RoomType.Bridge]: 'rgba(90, 170, 215, 0.24)',
  [RoomType.Cafeteria]: 'rgba(78, 166, 110, 0.28)',
  [RoomType.Kitchen]: 'rgba(245, 164, 92, 0.28)',
  [RoomType.Workshop]: 'rgba(203, 157, 108, 0.28)',
  [RoomType.Clinic]: 'rgba(106, 209, 224, 0.26)',
  [RoomType.Brig]: 'rgba(191, 94, 94, 0.26)',
  [RoomType.RecHall]: 'rgba(209, 166, 98, 0.24)',
  [RoomType.Reactor]: 'rgba(185, 125, 57, 0.28)',
  [RoomType.Security]: 'rgba(189, 79, 79, 0.28)',
  [RoomType.Dorm]: 'rgba(126, 200, 255, 0.22)',
  [RoomType.Hygiene]: 'rgba(96, 228, 225, 0.24)',
  [RoomType.Hydroponics]: 'rgba(98, 205, 120, 0.2)',
  [RoomType.LifeSupport]: 'rgba(245, 245, 170, 0.2)',
  [RoomType.Lounge]: 'rgba(196, 140, 255, 0.2)',
  [RoomType.Market]: 'rgba(255, 188, 120, 0.2)',
  [RoomType.LogisticsStock]: 'rgba(150, 200, 255, 0.2)',
  [RoomType.Storage]: 'rgba(255, 220, 155, 0.22)',
  [RoomType.Maintenance]: 'rgba(116, 190, 162, 0.22)',
  // Berth: cool steel-blue tint, distinct from Dorm's warmer blue and
  // the cyan dock-tile color. v0 placeholder; revisit when atlas
  // Berth floor sprite lands.
  [RoomType.Berth]: 'rgba(120, 170, 220, 0.22)',
  [RoomType.Cantina]: 'rgba(229, 138, 207, 0.24)',
  [RoomType.CommercialUnit]: 'rgba(77, 211, 183, 0.22)',
  [RoomType.Observatory]: 'rgba(140, 184, 255, 0.24)'
};

const roomLetter: Record<RoomType, string> = {
  [RoomType.None]: '',
  [RoomType.Bridge]: 'B',
  [RoomType.Cafeteria]: 'C',
  [RoomType.Kitchen]: 'I',
  [RoomType.Workshop]: 'W',
  [RoomType.Clinic]: '+',
  [RoomType.Brig]: 'G',
  [RoomType.RecHall]: 'A',
  [RoomType.Reactor]: 'R',
  [RoomType.Security]: 'S',
  [RoomType.Dorm]: 'D',
  [RoomType.Hygiene]: 'H',
  [RoomType.Hydroponics]: 'F',
  [RoomType.LifeSupport]: 'L',
  [RoomType.Lounge]: 'U',
  [RoomType.Market]: 'K',
  [RoomType.LogisticsStock]: 'N',
  [RoomType.Storage]: 'B',
  [RoomType.Maintenance]: 'M',
  [RoomType.Berth]: 'E',
  [RoomType.Cantina]: 'X',
  [RoomType.CommercialUnit]: '$',
  [RoomType.Observatory]: 'O'
};

const moduleLetter: Record<ModuleType, string> = {
  [ModuleType.None]: '',
  [ModuleType.CaptainConsole]: 'CP',
  [ModuleType.SanitationTerminal]: 'SN',
  [ModuleType.SecurityTerminal]: 'SC',
  [ModuleType.MechanicalTerminal]: 'MC',
  [ModuleType.IndustrialTerminal]: 'IN',
  [ModuleType.NavigationTerminal]: 'NV',
  [ModuleType.CommsTerminal]: 'CM',
  [ModuleType.MedicalTerminal]: 'MD',
  [ModuleType.ResearchTerminal]: 'RS',
  [ModuleType.LogisticsTerminal]: 'LG',
  [ModuleType.FleetCommandTerminal]: 'FL',
  [ModuleType.TrafficControlTerminal]: 'TR',
  [ModuleType.ResourceManagementTerminal]: 'RM',
  [ModuleType.PowerManagementTerminal]: 'PW',
  [ModuleType.LifeSupportTerminal]: 'LS',
  [ModuleType.AtmosphereControlTerminal]: 'AT',
  [ModuleType.AiCoreTerminal]: 'AI',
  [ModuleType.EmergencyControlTerminal]: 'EM',
  [ModuleType.RecordsTerminal]: 'RC',
  [ModuleType.WallLight]: 'L',
  [ModuleType.Bed]: 'B',
  [ModuleType.Bunk]: 'BK',
  [ModuleType.Locker]: 'LK',
  [ModuleType.Table]: 'T',
  [ModuleType.ServingStation]: 'S',
  [ModuleType.Fridge]: 'FR',
  [ModuleType.ColdStore]: 'CS',
  [ModuleType.PrepCounter]: 'P',
  [ModuleType.Stove]: 'V',
  [ModuleType.TrayReturn]: 'TR',
  [ModuleType.Dishwasher]: 'DW',
  [ModuleType.Workbench]: 'W',
  [ModuleType.MedBed]: '+',
  [ModuleType.CellConsole]: 'G',
  [ModuleType.RecUnit]: 'A',
  [ModuleType.GrowStation]: 'G',
  [ModuleType.Terminal]: 'M',
  [ModuleType.Couch]: 'C',
  [ModuleType.GameStation]: 'J',
  [ModuleType.Toilet]: 'WC',
  [ModuleType.Shower]: 'H',
  [ModuleType.Sink]: 'I',
  [ModuleType.FloorDrain]: 'D',
  [ModuleType.WaterValve]: 'WV',
  [ModuleType.MarketStall]: '$',
  [ModuleType.CheckoutBank]: '$',
  [ModuleType.ShelfAisle]: '=',
  [ModuleType.BunkBank]: 'B',
  [ModuleType.BackroomStockBank]: '#',
  [ModuleType.ServiceBar]: 'Y',
  [ModuleType.BarCorner]: 'L',
  [ModuleType.BarEnd]: 'J',
  [ModuleType.BoothBank]: 'U',
  [ModuleType.StandingRail]: 'I',
  [ModuleType.ServingLine]: 'E',
  [ModuleType.CommunityTable]: 'O',
  [ModuleType.GuestCabin]: 'G',
  [ModuleType.ArrivalDesk]: '?',
  [ModuleType.WashBank]: 'W',
  [ModuleType.IntakePallet]: 'P',
  [ModuleType.StorageRack]: 'R',
  // Dock-migration v0: capability-module letters for vector fallback.
  // No atlas sprites — fallback path is the only render route.
  [ModuleType.Gangway]: 'g',
  [ModuleType.CustomsCounter]: 'c',
  [ModuleType.CargoArm]: 'X',
  [ModuleType.FuelTank]: 'F',
  [ModuleType.FuelPump]: 'P',
  [ModuleType.PodDock]: 'PD',
  [ModuleType.FuelCoupler]: 'FC',
  [ModuleType.FreightLocker]: 'FL',
  [ModuleType.MaintenanceSocket]: 'MS',
  [ModuleType.BerthControl]: 'BC',
  [ModuleType.DockingClamp]: 'DC',
  [ModuleType.SecurityCamera]: 'o',
  [ModuleType.AccessGate]: '|',
  [ModuleType.FireExtinguisher]: 'F',
  [ModuleType.Vent]: 'V',
  [ModuleType.InsulationPanel]: 'I',
  [ModuleType.VendingMachine]: '$',
  [ModuleType.Bench]: 'B',
  [ModuleType.BarCounter]: 'r',
  [ModuleType.Tap]: 't',
  [ModuleType.Telescope]: 'O',
  [ModuleType.WaterFountain]: '~',
  [ModuleType.Plant]: '*',
  [ModuleType.ReactorCore]: 'RX',
  [ModuleType.SolarPanel]: '☀'
};

const ITEM_TYPES: ItemType[] = [
  'rawMeal',
  'preppedMeal',
  'meal',
  'cleanTray',
  'dirtyTray',
  'drink',
  'rawMaterial',
  'tradeGood',
  'fuel',
  'body'
];
const itemFillColor: Record<ItemType | 'none', string> = {
  rawMeal: 'rgba(118, 218, 132, 0.55)',
  preppedMeal: 'rgba(151, 236, 158, 0.58)',
  meal: 'rgba(255, 216, 120, 0.58)',
  cleanTray: 'rgba(224, 235, 245, 0.58)',
  dirtyTray: 'rgba(170, 130, 95, 0.58)',
  drink: 'rgba(98, 206, 255, 0.6)',
  rawMaterial: 'rgba(214, 183, 132, 0.55)',
  tradeGood: 'rgba(128, 188, 255, 0.58)',
  fuel: 'rgba(85, 235, 185, 0.62)',
  body: 'rgba(227, 110, 110, 0.6)',
  none: 'rgba(151, 170, 192, 0.42)'
};
const itemShortCode: Record<ItemType, string> = {
  rawMeal: 'RM',
  preppedMeal: 'PR',
  meal: 'ME',
  cleanTray: 'CT',
  dirtyTray: 'DT',
  drink: 'DR',
  rawMaterial: 'MAT',
  tradeGood: 'TG',
  fuel: 'FL',
  body: 'BD'
};

const itemSpriteCanvasByType = new Map<ItemType, HTMLCanvasElement>();

function buildItemSpriteCanvas(itemType: ItemType): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 12;
  canvas.height = 12;
  const itemCtx = canvas.getContext('2d');
  if (!itemCtx) return canvas;
  itemCtx.imageSmoothingEnabled = false;

  const rect = (color: string, x: number, y: number, w: number, h: number): void => {
    itemCtx.fillStyle = color;
    itemCtx.fillRect(x, y, w, h);
  };
  rect('rgba(3, 7, 11, 0.72)', 1, 2, 10, 9);
  switch (itemType) {
    case 'rawMeal':
      rect('#704a31', 2, 3, 8, 7);
      rect('#69b65b', 3, 3, 2, 3);
      rect('#d96c50', 6, 4, 3, 3);
      rect('#c48b46', 2, 8, 8, 1);
      break;
    case 'preppedMeal':
      rect('#d7e0c2', 2, 4, 8, 6);
      rect('#79b76b', 3, 5, 6, 2);
      rect('#f0d17b', 4, 7, 4, 2);
      break;
    case 'meal':
      rect('#abb8c4', 1, 6, 10, 4);
      rect('#f0d27b', 3, 4, 6, 4);
      rect('#6fc27b', 7, 5, 2, 2);
      break;
    case 'cleanTray':
      rect('#dce8ee', 2, 3, 8, 2);
      rect('#9fb4c2', 2, 6, 8, 2);
      rect('#6f8799', 2, 9, 8, 1);
      break;
    case 'dirtyTray':
      rect('#a28b7b', 2, 3, 8, 2);
      rect('#685349', 2, 6, 8, 2);
      rect('#c66a4b', 4, 8, 3, 2);
      break;
    case 'drink':
      rect('#7ee2ec', 2, 4, 3, 6);
      rect('#d6fbff', 3, 3, 1, 2);
      rect('#4ba8cf', 7, 3, 3, 7);
      rect('#d6fbff', 8, 2, 1, 2);
      break;
    case 'rawMaterial':
      rect('#b87838', 2, 3, 8, 7);
      rect('#e1aa59', 3, 4, 6, 5);
      rect('#495662', 5, 3, 2, 7);
      break;
    case 'tradeGood':
      rect('#4a8eb3', 2, 3, 8, 7);
      rect('#7ed8d1', 3, 4, 6, 5);
      rect('#d87ab7', 6, 5, 2, 2);
      break;
    case 'fuel':
      rect('#cda93b', 3, 2, 6, 8);
      rect('#f3d55e', 4, 3, 4, 6);
      rect('#36434a', 5, 1, 3, 2);
      rect('#4bcaa3', 5, 5, 2, 3);
      break;
    case 'body':
      rect('#8f4b53', 2, 5, 8, 4);
      rect('#d88b8b', 7, 3, 3, 3);
      break;
  }
  return canvas;
}

function itemSpriteCanvas(itemType: ItemType): HTMLCanvasElement {
  const existing = itemSpriteCanvasByType.get(itemType);
  if (existing) return existing;
  const canvas = buildItemSpriteCanvas(itemType);
  itemSpriteCanvasByType.set(itemType, canvas);
  return canvas;
}

function drawItemWorldSprite(
  ctx: CanvasRenderingContext2D,
  itemType: ItemType,
  centerX: number,
  centerY: number,
  size: number
): void {
  const sprite = itemSpriteCanvas(itemType);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sprite, Math.round(centerX - size * 0.5), Math.round(centerY - size * 0.5), Math.round(size), Math.round(size));
  ctx.restore();
}
const RESIDENT_MARK_COLOR = '#35d98a';
const SHIP_TRANSIT_VISUAL_SEC = 2;
const SHIP_ASSET_VERSION = 'generated-ship-sheet-2026-05-02';
const SERVICE_OVERLAY_CACHE_TTL_SEC = 0.2;
// How long a just-cleared floor tile keeps its finish sparkle.
const SANITATION_CLEARED_SPARKLE_SEC = 0.7;

type CachedLayer = {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  key: string;
};

export type RenderViewport = GlowRenderViewport;

type ServiceOverlayCache = {
  key: string;
  builtAt: number;
  nodeTiles: Set<number>;
  unreachableNodeTiles: Set<number>;
  queueNodeTiles: Set<number>;
  jobPickupTiles: Set<number>;
  jobDropTiles: Set<number>;
  reachability: { nodeTiles: number[]; unreachableNodeTiles: number[] } | null;
};

let staticLayerCache: CachedLayer | null = null;
let decorativeLayerCache: CachedLayer | null = null;
let diagnosticOverlayCache: CachedLayer | null = null;
const shipImageCache = new Map<string, HTMLImageElement>();
const serviceOverlayCache: ServiceOverlayCache = {
  key: '',
  builtAt: 0,
  nodeTiles: new Set(),
  unreachableNodeTiles: new Set(),
  queueNodeTiles: new Set(),
  jobPickupTiles: new Set(),
  jobDropTiles: new Set(),
  reachability: null
};

function spritesEnabled(state: StationState, spriteAtlas: SpriteAtlas): boolean {
  return state.controls.spriteMode === 'sprites' && !state.controls.showSpriteFallback && spriteAtlas.ready && !!spriteAtlas.image;
}

function positiveMod(value: number, modulus: number): number {
  const remainder = value % modulus;
  return remainder < 0 ? remainder + modulus : remainder;
}

function renderHash01(seed: number, index: number, salt: number): number {
  const n = Math.sin((seed * 0.013 + index * 91.17 + salt * 37.31) * 12.9898) * 43758.5453;
  return n - Math.floor(n);
}

function clampRender(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function pickSpriteKey<T extends readonly string[]>(keys: T, seed: number, index: number, salt: number): T[number] {
  return keys[Math.floor(renderHash01(seed, index, salt) * keys.length) % keys.length];
}

function seededSunAngle(state: StationState): number {
  return renderHash01(state.seedAtCreation, 3, 11) * Math.PI * 2;
}

const DEBRIS_PARALLAX_LAYERS = [
  { scale: 0.58, alpha: 0.42, amplitude: 7, speed: 0.028, rotation: 0.18 },
  { scale: 0.88, alpha: 0.7, amplitude: 18, speed: 0.052, rotation: 0.34 },
  { scale: 1.22, alpha: 0.92, amplitude: 34, speed: 0.088, rotation: 0.56 }
] as const;

type StationEnvironmentKind = 'ambient' | 'sunward' | 'ice' | 'metal' | 'gas';
type DebrisTone = 'planet' | 'rock' | 'metal' | 'ice' | 'gas' | 'spark';

interface StationEnvironmentProfile {
  kind: StationEnvironmentKind;
  bodyType: 'rocky' | 'gas' | 'ice' | null;
  resourceType: 'metal' | 'ice' | 'gas' | null;
  traffic: number;
  debris: number;
  sun: number;
  siteVisualSeed: number;
  planetDistance: number;
  planetPresentation: 'none' | 'regional' | 'near';
}

interface EnvironmentStarDescriptor {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  phase: number;
  color: string;
}

interface EnvironmentAtmosphereDescriptor {
  x: number;
  y: number;
  radius: number;
  innerColor: string;
  outerColor: string;
  alpha: number;
}

interface EnvironmentDustDescriptor {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  phase: number;
  color: string;
}

interface EnvironmentDebrisDescriptor {
  x: number;
  y: number;
  size: number;
  phase: number;
  layer: 0 | 1 | 2;
  tone: DebrisTone;
  key: (typeof SPACE_DEBRIS_SPRITE_KEYS)[number];
  atlasCell: number;
}

interface EnvironmentTrafficDescriptor {
  startX: number;
  startY: number;
  controlX: number;
  controlY: number;
  endX: number;
  endY: number;
  phase: number;
  speed: number;
  alpha: number;
  scale: number;
}

interface StationEnvironmentCache {
  key: string;
  profile: StationEnvironmentProfile;
  stars: EnvironmentStarDescriptor[];
  atmosphere: EnvironmentAtmosphereDescriptor[];
  dust: EnvironmentDustDescriptor[];
  debris: EnvironmentDebrisDescriptor[];
  traffic: EnvironmentTrafficDescriptor[];
}

let stationEnvironmentCache: StationEnvironmentCache | null = null;
const reducedMotionQuery = typeof window !== 'undefined'
  ? window.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null
  : null;

function renderTimeSeconds(): number {
  return reducedMotionQuery?.matches ? 0 : performance.now() / 1000;
}

function drawDebrisFallback(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  tone: DebrisTone,
  alpha: number,
  rotation = renderHash01(Math.floor(x + y), 3, 4) * Math.PI
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  if (tone === 'spark') {
    ctx.fillStyle = '#ffeaa6';
    ctx.beginPath();
    ctx.arc(x, y, size * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ff8a30';
    ctx.lineWidth = Math.max(1, size * 0.04);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * size * 0.12, y + Math.sin(a) * size * 0.12);
      ctx.lineTo(x + Math.cos(a) * size * 0.38, y + Math.sin(a) * size * 0.38);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }
  const color =
    tone === 'metal'
      ? '#9ba6ae'
      : tone === 'ice'
        ? '#9ee6ff'
        : tone === 'gas'
          ? '#d9a86a'
          : tone === 'planet'
            ? '#9b856f'
            : '#7d7468';
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, 0, size * 0.4, size * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.arc(size * 0.08, size * 0.04, size * 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// A chartered belt flavor maps to a debris draw tone. Null resource (or no
// site) keeps the seeded, sprite-name-derived tone.
function debrisToneForResource(
  resource: 'metal' | 'ice' | 'gas' | null | undefined
): 'metal' | 'ice' | 'gas' | null {
  return resource === 'metal' || resource === 'ice' || resource === 'gas' ? resource : null;
}

function nearestPlanetInfo(
  state: StationState,
  x: number,
  y: number
): { bodyType: 'rocky' | 'gas' | 'ice'; distance: number } | null {
  const planets = state.system?.planets;
  if (!planets || planets.length === 0) return null;
  let best: { bodyType: 'rocky' | 'gas' | 'ice'; distance: number } | null = null;
  let bestDist = Infinity;
  for (const planet of planets) {
    const px = 0.5 + planet.orbitRadius * 0.5 * Math.cos(planet.orbitAngle);
    const py = 0.5 + planet.orbitRadius * 0.5 * Math.sin(planet.orbitAngle);
    const dist = Math.hypot(px - x, py - y);
    if (dist < bestDist) {
      bestDist = dist;
      best = { bodyType: planet.bodyType, distance: dist };
    }
  }
  return best;
}

function siteVisualSeed(state: StationState): number {
  const site = state.site;
  if (!site) return state.seedAtCreation;
  const x = Math.round(site.x * 1000);
  const y = Math.round(site.y * 1000);
  return state.seedAtCreation + x * 4099 + y * 7919;
}

function debrisSpriteKeyForTone(
  tone: DebrisTone,
  seed: number,
  index: number
): (typeof SPACE_DEBRIS_SPRITE_KEYS)[number] {
  if (tone === 'ice') return pickSpriteKey(['space.debris.ice.1', 'space.debris.ice.2', 'space.debris.ice.3'] as const, seed, index, 71);
  if (tone === 'metal') return pickSpriteKey(['space.debris.metal.1', 'space.debris.metal.2', 'space.debris.metal.3', 'space.debris.rust.1', 'space.debris.rust.2'] as const, seed, index, 72);
  if (tone === 'gas' || tone === 'spark') return pickSpriteKey(['space.debris.hot.1', 'space.debris.dark.1'] as const, seed, index, 73);
  return pickSpriteKey(SPACE_DEBRIS_SPRITE_KEYS, seed, index, 74);
}

function stationEnvironmentProfile(state: StationState): StationEnvironmentProfile {
  const site = state.site;
  const nearestPlanet = site ? nearestPlanetInfo(state, site.x, site.y) : null;
  const bodyType = nearestPlanet?.bodyType ?? null;
  const planetDistance = nearestPlanet?.distance ?? Number.POSITIVE_INFINITY;
  const planetPresentation = planetDistance <= 0.08 ? 'near' : planetDistance <= 0.24 ? 'regional' : 'none';
  const traffic = site
    ? Math.max(site.laneTrafficFactor.north, site.laneTrafficFactor.east, site.laneTrafficFactor.south, site.laneTrafficFactor.west)
    : 1;
  const resourceType = site?.resourceType ?? null;
  const debris = site?.debrisFactor ?? 0;
  const sun = site?.sunFactor ?? 0;
  let kind: StationEnvironmentKind = 'ambient';
  if (site) {
    if (sun >= 0.78 && !resourceType && planetDistance > 0.06) kind = 'sunward';
    else if (resourceType === 'metal') kind = 'metal';
    else if (resourceType === 'ice') kind = 'ice';
    else if (planetPresentation === 'near' && bodyType === 'gas') kind = 'gas';
    else if (planetPresentation === 'near' && bodyType === 'ice') kind = 'ice';
    else if (resourceType === 'gas' && planetDistance <= 0.24) kind = 'gas';
    else if (planetPresentation !== 'none' && bodyType === 'rocky' && debris >= 0.42) kind = 'metal';
  }
  return {
    kind,
    bodyType,
    resourceType,
    traffic,
    debris,
    sun,
    siteVisualSeed: siteVisualSeed(state),
    planetDistance,
    planetPresentation
  };
}

function environmentCacheKey(state: StationState): string {
  const site = state.site;
  const siteKey = site
    ? `${site.x.toFixed(3)}:${site.y.toFixed(3)}:${site.sunFactor.toFixed(3)}:${site.debrisFactor.toFixed(3)}:${site.resourceType}:${site.laneTrafficFactor.north.toFixed(2)}:${site.laneTrafficFactor.east.toFixed(2)}:${site.laneTrafficFactor.south.toFixed(2)}:${site.laneTrafficFactor.west.toFixed(2)}`
    : 'legacy';
  const bodyKey = state.system?.planets.map((planet) => `${planet.bodyType}:${planet.orbitRadius.toFixed(2)}:${planet.orbitAngle.toFixed(2)}`).join('|') ?? '';
  return `${state.seedAtCreation}:${state.width}:${state.height}:${siteKey}:${bodyKey}`;
}

function getStationEnvironment(state: StationState): StationEnvironmentCache {
  const key = environmentCacheKey(state);
  if (stationEnvironmentCache?.key === key) return stationEnvironmentCache;
  const profile = stationEnvironmentProfile(state);
  const visualSeed = profile.siteVisualSeed;
  const worldW = state.width * TILE_SIZE;
  const worldH = state.height * TILE_SIZE;
  // Most stars are sub-pixel after the station camera is fitted. A denser
  // cached field keeps open space visibly starry without adding frame-time
  // object churn.
  const starCount = profile.kind === 'gas' ? 304 : profile.kind === 'ice' ? 296 : profile.kind === 'sunward' ? 276 : profile.kind === 'metal' ? 288 : 420;
  const debrisCount = profile.kind === 'metal' ? 82 : profile.kind === 'ice' ? 70 : profile.kind === 'sunward' ? 30 : profile.kind === 'gas' ? 20 : 24;
  const tone: DebrisTone = profile.kind === 'ice' ? 'ice' : profile.kind === 'metal' ? 'metal' : profile.kind === 'gas' ? 'gas' : profile.kind === 'sunward' ? 'spark' : 'rock';
  const starColor = profile.kind === 'ice' ? '#d8f5ff' : profile.kind === 'metal' ? '#ffd1a5' : profile.kind === 'gas' ? '#b9dcff' : profile.kind === 'ambient' ? '#c6b6ff' : '#fff1bd';
  const stars: EnvironmentStarDescriptor[] = [];
  const atmosphere: EnvironmentAtmosphereDescriptor[] = [];
  const dust: EnvironmentDustDescriptor[] = [];
  const debris: EnvironmentDebrisDescriptor[] = [];
  const traffic: EnvironmentTrafficDescriptor[] = [];
  for (let i = 0; i < starCount; i++) {
    const tier = renderHash01(visualSeed, i, 100);
    stars.push({
      x: renderHash01(visualSeed, i, 101) * worldW,
      y: renderHash01(visualSeed, i, 102) * worldH,
      radius: tier > 0.94 ? 1.9 + renderHash01(visualSeed, i, 103) * 1.35 : tier > 0.72 ? 1 + renderHash01(visualSeed, i, 103) : 0.58 + renderHash01(visualSeed, i, 103) * 0.66,
      alpha: tier > 0.94 ? 0.68 + renderHash01(visualSeed, i, 104) * 0.26 : 0.16 + renderHash01(visualSeed, i, 104) * 0.48,
      phase: renderHash01(visualSeed, i, 105) * Math.PI * 2,
      color: i % 9 === 0 ? '#8fd9ff' : i % 13 === 0 ? '#ffd8a6' : starColor
    });
  }
  const palette = profile.kind === 'ice'
    ? [['125, 224, 255', '40, 67, 137'], ['186, 132, 255', '28, 33, 91']]
    : profile.kind === 'metal'
      ? [['255, 177, 93', '66, 42, 31'], ['130, 161, 183', '29, 35, 47']]
      : profile.kind === 'gas'
        ? [['73, 230, 205', '26, 80, 100'], ['255, 193, 96', '60, 41, 77']]
        : profile.kind === 'sunward'
          ? [['255, 205, 104', '80, 42, 28'], ['255, 130, 74', '45, 26, 37']]
          : [['104, 132, 255', '20, 29, 75'], ['218, 100, 214', '37, 20, 58']];
  for (let i = 0; i < 5; i++) {
    const side = i % 2 === 0 ? -0.14 : 1.14;
    atmosphere.push({
      x: worldW * (side + (renderHash01(visualSeed, i, 106) - 0.5) * 0.18),
      y: worldH * (0.12 + renderHash01(visualSeed, i, 107) * 0.76),
      radius: Math.max(worldW, worldH) * (0.28 + renderHash01(visualSeed, i, 108) * 0.2),
      innerColor: palette[i % palette.length][0],
      outerColor: palette[i % palette.length][1],
      alpha: 0.075 + renderHash01(visualSeed, i, 109) * 0.065
    });
  }
  for (let i = 0; i < 26; i++) {
    dust.push({
      x: renderHash01(visualSeed, i, 110) * worldW,
      y: renderHash01(visualSeed, i, 111) * worldH,
      radius: 1 + renderHash01(visualSeed, i, 112) * 2.6,
      alpha: 0.04 + renderHash01(visualSeed, i, 113) * 0.11,
      phase: renderHash01(visualSeed, i, 114) * Math.PI * 2,
      color: i % 2 === 0 ? palette[0][0] : palette[1][0]
    });
  }
  for (let i = 0; i < debrisCount; i++) {
    const layer = Math.min(2, Math.floor(renderHash01(visualSeed, i, 115) * 3)) as 0 | 1 | 2;
    const itemTone = profile.kind === 'sunward' && i % 4 !== 0 ? 'spark' : tone;
    debris.push({
      x: renderHash01(visualSeed, i, 116) * worldW,
      y: renderHash01(visualSeed, i, 117) * worldH,
      size: (20 + renderHash01(visualSeed, i, 118) * 42) * DEBRIS_PARALLAX_LAYERS[layer].scale,
      phase: renderHash01(visualSeed, i, 119) * Math.PI * 2,
      layer,
      tone: itemTone,
      key: debrisSpriteKeyForTone(itemTone, visualSeed, i),
      atlasCell: Math.floor(renderHash01(visualSeed, i, 120) * 12)
    });
  }
  const trafficCount = profile.kind === 'gas'
    ? 10
    : profile.traffic >= 1.45
      ? 7
      : profile.traffic >= 1.05
        ? 5
        : profile.traffic >= 0.82
          ? 3
          : 1;
  if (trafficCount > 0) {
    for (let i = 0; i < trafficCount; i++) {
      const side = renderHash01(visualSeed, i, 121) > 0.5 ? 1 : -1;
      const laneY = (i + 1) / (trafficCount + 1);
      traffic.push({
        startX: worldW * (side > 0 ? -0.08 : 1.08),
        startY: worldH * (laneY + (renderHash01(visualSeed, i, 125) - 0.5) * 0.08),
        controlX: worldW * (0.46 + (renderHash01(visualSeed, i, 122) - 0.5) * 0.16),
        controlY: worldH * (laneY + (renderHash01(visualSeed, i, 126) - 0.5) * 0.22),
        endX: worldW * (side > 0 ? 1.08 : -0.08),
        endY: worldH * (laneY + (renderHash01(visualSeed, i, 127) - 0.5) * 0.1),
        phase: renderHash01(visualSeed, i, 123),
        speed: 0.012 + renderHash01(visualSeed, i, 124) * 0.034,
        alpha: 0.16 + renderHash01(visualSeed, i, 128) * 0.36,
        scale: 0.48 + renderHash01(visualSeed, i, 129) * 0.82
      });
    }
  }
  stationEnvironmentCache = { key, profile, stars, atmosphere, dust, debris, traffic };
  return stationEnvironmentCache;
}

function renderSeededSpaceConditionBackdrop(
  ctx: CanvasRenderingContext2D,
  state: StationState,
  viewport: RenderViewport | null,
  environment: StationEnvironmentCache,
  visualTime: number
): void {
  const worldW = state.width * TILE_SIZE;
  const worldH = state.height * TILE_SIZE;
  const view = viewport ?? { x: 0, y: 0, width: worldW, height: worldH };
  const angle = seededSunAngle(state);
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const cx = view.x + view.width * 0.5;
  const cy = view.y + view.height * 0.5;
  const profile = environment.profile;
  const visualSeed = profile.siteVisualSeed;
  // Chartered sunFactor scales the sun's warmth and spread. Absent site keeps
  // both multipliers at exactly 1 → seeded behavior is bit-identical.
  const sunFactor = state.site?.sunFactor;
  const sunWarmth = sunFactor === undefined ? 1 : 0.7 + sunFactor * 0.85;
  const sunReach = sunFactor === undefined ? 1 : 0.85 + sunFactor * 0.4;
  const reach = Math.max(view.width, view.height) * 0.75 * sunReach;

  ctx.save();
  const light = ctx.createLinearGradient(cx + dx * reach, cy + dy * reach, cx - dx * reach, cy - dy * reach);
  const warm = profile.kind === 'ice' ? '178, 225, 255' : profile.kind === 'metal' ? '220, 137, 77' : profile.kind === 'gas' ? '190, 172, 255' : '255, 203, 105';
  light.addColorStop(0, `rgba(${warm}, ${0.16 * sunWarmth})`);
  light.addColorStop(0.36, `rgba(${warm}, ${0.055 * sunWarmth})`);
  light.addColorStop(0.64, 'rgba(10, 26, 40, 0.03)');
  light.addColorStop(1, 'rgba(24, 45, 82, 0.18)');
  ctx.fillStyle = light;
  ctx.fillRect(view.x, view.y, view.width, view.height);

  // Atmospheric veils live at the edges so the working station remains the
  // crisp visual anchor. Their positions are cached with the environment.
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (const veil of environment.atmosphere) {
    if (veil.x + veil.radius < view.x || veil.x - veil.radius > view.x + view.width || veil.y + veil.radius < view.y || veil.y - veil.radius > view.y + view.height) continue;
    const gradient = ctx.createRadialGradient(veil.x, veil.y, veil.radius * 0.04, veil.x, veil.y, veil.radius);
    gradient.addColorStop(0, `rgba(${veil.innerColor}, ${veil.alpha})`);
    gradient.addColorStop(0.42, `rgba(${veil.outerColor}, ${veil.alpha * 0.5})`);
    gradient.addColorStop(1, `rgba(${veil.outerColor}, 0)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(view.x, view.y, view.width, view.height);
  }

  // A second, very distant haze layer follows the camera at a fraction of
  // its movement. This keeps large maps atmospheric even when the world-
  // anchored veils are outside the current viewport.
  for (let i = 0; i < 3; i++) {
    const side = i % 2 === 0 ? 0.04 : 0.96;
    const x = view.x + view.width * (side + (renderHash01(visualSeed, i, 141) - 0.5) * 0.1);
    const y = view.y + view.height * (0.14 + renderHash01(visualSeed, i, 142) * 0.72);
    const radius = Math.max(view.width, view.height) * (0.34 + renderHash01(visualSeed, i, 143) * 0.2);
    const colors = environment.atmosphere[i % environment.atmosphere.length];
    const gradient = ctx.createRadialGradient(x, y, radius * 0.03, x, y, radius);
    gradient.addColorStop(0, `rgba(${colors.innerColor}, 0.07)`);
    gradient.addColorStop(0.48, `rgba(${colors.outerColor}, 0.035)`);
    gradient.addColorStop(1, `rgba(${colors.outerColor}, 0)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(view.x, view.y, view.width, view.height);
  }
  ctx.restore();

  // Far stars are intentionally cheap and only drift a few pixels. They make
  // the paused station feel alive without moving the world or its hit targets.
  for (const star of environment.stars) {
    const animated = star.radius > 1.7;
    const x = star.x + (animated ? Math.cos(visualTime * 0.014 + star.phase) * 3 : 0);
    const y = star.y + (animated ? Math.sin(visualTime * 0.011 + star.phase) * 2 : 0);
    if (x < view.x - 3 || x > view.x + view.width + 3 || y < view.y - 3 || y > view.y + view.height + 3) continue;
    ctx.globalAlpha = animated
      ? star.alpha * (0.75 + Math.sin(visualTime * 0.45 + star.phase) * 0.25)
      : star.alpha;
    ctx.fillStyle = star.color;
    ctx.fillRect(Math.round(x), Math.round(y), star.radius, star.radius);
  }
  for (const mote of environment.dust) {
    const x = mote.x + Math.cos(visualTime * 0.025 + mote.phase) * 5;
    const y = mote.y + Math.sin(visualTime * 0.017 + mote.phase) * 3;
    if (x < view.x - 4 || x > view.x + view.width + 4 || y < view.y - 4 || y > view.y + view.height + 4) continue;
    ctx.globalAlpha = mote.alpha * (0.72 + Math.sin(visualTime * 0.32 + mote.phase) * 0.28);
    ctx.fillStyle = `rgb(${mote.color})`;
    ctx.beginPath();
    ctx.arc(x, y, mote.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  const bandOffset = (renderHash01(visualSeed, 5, 31) - 0.5) * Math.max(view.width, view.height) * 0.34;
  ctx.translate(cx + -dy * bandOffset, cy + dx * bandOffset);
  ctx.rotate(angle + Math.PI / 2);
  const bandW = Math.max(view.width, view.height) * 2.4;
  const bandH = Math.max(80, Math.min(view.width, view.height) * 0.18);
  const shadow = ctx.createLinearGradient(0, -bandH, 0, bandH);
  shadow.addColorStop(0, 'rgba(3, 8, 16, 0)');
  shadow.addColorStop(0.5, 'rgba(3, 8, 16, 0.2)');
  shadow.addColorStop(1, 'rgba(3, 8, 16, 0)');
  ctx.fillStyle = shadow;
  ctx.fillRect(-bandW * 0.5, -bandH, bandW, bandH * 2);
  ctx.restore();

  const sinkX = worldW * (0.22 + renderHash01(visualSeed, 17, 91) * 0.56);
  const sinkY = worldH * (0.18 + renderHash01(visualSeed, 23, 91) * 0.64);
  const sinkRadius = Math.max(worldW, worldH) * (0.22 + renderHash01(visualSeed, 29, 91) * 0.18);
  if (
    sinkX + sinkRadius >= view.x &&
    sinkX - sinkRadius <= view.x + view.width &&
    sinkY + sinkRadius >= view.y &&
    sinkY - sinkRadius <= view.y + view.height
  ) {
    ctx.save();
    const sink = ctx.createRadialGradient(sinkX, sinkY, sinkRadius * 0.08, sinkX, sinkY, sinkRadius);
    sink.addColorStop(0, 'rgba(83, 214, 255, 0.1)');
    sink.addColorStop(0.54, 'rgba(83, 214, 255, 0.035)');
    sink.addColorStop(1, 'rgba(83, 214, 255, 0)');
    ctx.fillStyle = sink;
    ctx.fillRect(view.x, view.y, view.width, view.height);
    ctx.restore();
  }

  if (profile.kind === 'sunward') {
    const limbX = view.x - view.width * 0.12 + Math.sin(visualTime * 0.018) * 5;
    const limbY = view.y + view.height * 1.02;
    const radius = Math.max(view.width, view.height) * 0.68;
    const flare = ctx.createRadialGradient(limbX, limbY, radius * 0.16, limbX, limbY, radius * 1.08);
    flare.addColorStop(0, 'rgba(255, 219, 137, 0.035)');
    flare.addColorStop(0.58, 'rgba(255, 151, 59, 0.065)');
    flare.addColorStop(0.78, 'rgba(255, 174, 66, 0.15)');
    flare.addColorStop(0.88, 'rgba(255, 218, 124, 0.3)');
    flare.addColorStop(1, 'rgba(255, 234, 159, 0)');
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = flare;
    ctx.fillRect(view.x, view.y, view.width, view.height);
    ctx.strokeStyle = 'rgba(255, 187, 74, 0.5)';
    ctx.lineWidth = Math.max(1, TILE_SIZE * 0.06);
    for (let i = 0; i < 12; i++) {
      const a = -2.72 + i * 0.21 + Math.sin(visualTime * 0.3 + i) * 0.025;
      const start = radius * 0.94;
      const end = radius * (1.01 + (i % 3) * 0.015);
      ctx.beginPath();
      ctx.moveTo(limbX + Math.cos(a) * start, limbY + Math.sin(a) * start);
      ctx.lineTo(limbX + Math.cos(a) * end, limbY + Math.sin(a) * end);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function clipToVisibleSpaceTiles(
  ctx: CanvasRenderingContext2D,
  state: StationState,
  visibleTiles: { minX: number; maxX: number; minY: number; maxY: number }
): void {
  ctx.beginPath();
  for (let y = visibleTiles.minY; y <= visibleTiles.maxY; y++) {
    for (let x = visibleTiles.minX; x <= visibleTiles.maxX; x++) {
      const tile = toIndex(x, y, state.width);
      const kind = state.tiles[tile];
      if (kind !== TileType.Space && kind !== TileType.Truss) continue;
      ctx.rect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
  }
  ctx.clip();
}

function renderSunwardHullRim(
  ctx: CanvasRenderingContext2D,
  state: StationState,
  visibleTiles: { minX: number; maxX: number; minY: number; maxY: number },
  environment: StationEnvironmentCache
): void {
  if (environment.profile.kind !== 'sunward') return;
  const angle = seededSunAngle(state);
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const edge = Math.abs(dx) > Math.abs(dy)
    ? dx >= 0 ? { x: 1, y: 0 } : { x: -1, y: 0 }
    : dy >= 0 ? { x: 0, y: 1 } : { x: 0, y: -1 };
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 183, 78, 0.46)';
  ctx.lineWidth = Math.max(1, TILE_SIZE * 0.065);
  for (let y = visibleTiles.minY; y <= visibleTiles.maxY; y++) {
    for (let x = visibleTiles.minX; x <= visibleTiles.maxX; x++) {
      const tile = toIndex(x, y, state.width);
      if (state.tiles[tile] === TileType.Space || state.tiles[tile] === TileType.Truss) continue;
      const nx = x + edge.x;
      const ny = y + edge.y;
      if (inBounds(nx, ny, state.width, state.height)) {
        const neighbor = state.tiles[toIndex(nx, ny, state.width)];
        if (neighbor !== TileType.Space && neighbor !== TileType.Truss) continue;
      }
      const px = x * TILE_SIZE;
      const py = y * TILE_SIZE;
      ctx.beginPath();
      if (edge.x > 0) {
        ctx.moveTo(px + TILE_SIZE - 1, py + 1);
        ctx.lineTo(px + TILE_SIZE - 1, py + TILE_SIZE - 1);
      } else if (edge.x < 0) {
        ctx.moveTo(px + 1, py + 1);
        ctx.lineTo(px + 1, py + TILE_SIZE - 1);
      } else if (edge.y > 0) {
        ctx.moveTo(px + 1, py + TILE_SIZE - 1);
        ctx.lineTo(px + TILE_SIZE - 1, py + TILE_SIZE - 1);
      } else {
        ctx.moveTo(px + 1, py + 1);
        ctx.lineTo(px + TILE_SIZE - 1, py + 1);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}

function renderCelestialBackdrop(
  ctx: CanvasRenderingContext2D,
  state: StationState,
  viewport: RenderViewport | null,
  environment: StationEnvironmentCache,
  visualTime: number
): void {
  const profile = environment.profile;
  if (profile.planetPresentation === 'none' || !profile.bodyType) return;
  const worldW = state.width * TILE_SIZE;
  const worldH = state.height * TILE_SIZE;
  const view = viewport ?? { x: 0, y: 0, width: worldW, height: worldH };
  const visualSeed = profile.siteVisualSeed;
  const piece = profile.bodyType === 'gas' ? 'gas-giant' : profile.bodyType === 'ice' ? 'ice-moon' : 'rocky-moon';
  const image = getEnvironmentPiece(piece);
  const near = profile.planetPresentation === 'near';
  const extent = Math.max(view.width, view.height);
  const baseScale = profile.bodyType === 'gas' ? 1.02 : 0.76;
  const size = extent * (near ? baseScale : baseScale * 0.32);
  const fromLeft = renderHash01(visualSeed, 211, 1) > 0.5;
  const x = view.x + view.width * (near ? 0.82 : (fromLeft ? 0.06 : 0.94)) + Math.sin(visualTime * 0.008 + visualSeed) * (near ? 5 : 2);
  const y = view.y + view.height * (near ? 0.2 : 0.16 + renderHash01(visualSeed, 212, 1) * 0.58) + Math.cos(visualTime * 0.006 + visualSeed) * (near ? 4 : 2);
  if (viewport && (x + size * 0.56 < viewport.x || x - size * 0.56 > viewport.x + viewport.width || y + size * 0.56 < viewport.y || y - size * 0.56 > viewport.y + viewport.height)) return;
  ctx.save();
  ctx.globalAlpha = near ? (profile.bodyType === 'gas' ? 0.74 : 0.62) : 0.42;
  if (image) ctx.drawImage(image, x - size * 0.5, y - size * 0.5, size, size);
  else drawDebrisFallback(ctx, x, y, size, profile.bodyType === 'gas' ? 'gas' : 'planet', 0.28);
  ctx.restore();
}

function quadraticPoint(
  startX: number,
  startY: number,
  controlX: number,
  controlY: number,
  endX: number,
  endY: number,
  t: number
): { x: number; y: number } {
  const u = 1 - t;
  return {
    x: u * u * startX + 2 * u * t * controlX + t * t * endX,
    y: u * u * startY + 2 * u * t * controlY + t * t * endY
  };
}

function quadraticTangent(
  startX: number,
  startY: number,
  controlX: number,
  controlY: number,
  endX: number,
  endY: number,
  t: number
): { x: number; y: number } {
  const u = 1 - t;
  return {
    x: 2 * u * (controlX - startX) + 2 * t * (endX - controlX),
    y: 2 * u * (controlY - startY) + 2 * t * (endY - controlY)
  };
}

function renderTrafficBackdrop(
  ctx: CanvasRenderingContext2D,
  viewport: RenderViewport | null,
  environment: StationEnvironmentCache,
  visualTime: number
): void {
  if (environment.traffic.length === 0) return;
  const shipSheet = getEnvironmentPiece('traffic-ships');
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (const [laneIndex, lane] of environment.traffic.entries()) {
    if (viewport) {
      const minX = Math.min(lane.startX, lane.controlX, lane.endX);
      const maxX = Math.max(lane.startX, lane.controlX, lane.endX);
      const minY = Math.min(lane.startY, lane.controlY, lane.endY);
      const maxY = Math.max(lane.startY, lane.controlY, lane.endY);
      if (maxX < viewport.x - 40 || minX > viewport.x + viewport.width + 40 || maxY < viewport.y - 40 || minY > viewport.y + viewport.height + 40) continue;
    }
    ctx.strokeStyle = `rgba(132, 202, 255, ${lane.alpha * 0.28})`;
    ctx.lineWidth = Math.max(0.7, TILE_SIZE * 0.022 * lane.scale);
    ctx.beginPath();
    ctx.moveTo(lane.startX, lane.startY);
    ctx.quadraticCurveTo(lane.controlX, lane.controlY, lane.endX, lane.endY);
    ctx.stroke();
    const t = positiveMod(lane.phase + visualTime * lane.speed, 1);
    const ship = quadraticPoint(lane.startX, lane.startY, lane.controlX, lane.controlY, lane.endX, lane.endY, t);
    const previous = quadraticPoint(lane.startX, lane.startY, lane.controlX, lane.controlY, lane.endX, lane.endY, positiveMod(t - 0.035, 1));
    ctx.strokeStyle = `rgba(128, 238, 255, ${lane.alpha})`;
    ctx.lineWidth = Math.max(0.75, TILE_SIZE * 0.04 * lane.scale);
    ctx.beginPath();
    ctx.moveTo(previous.x, previous.y);
    ctx.lineTo(ship.x, ship.y);
    ctx.stroke();
    const tangent = quadraticTangent(lane.startX, lane.startY, lane.controlX, lane.controlY, lane.endX, lane.endY, t);
    const rotation = Math.atan2(tangent.y, tangent.x);
    const shipSize = Math.max(12, TILE_SIZE * 0.52 * lane.scale);
    const cell = Math.floor(renderHash01(environment.profile.siteVisualSeed, laneIndex, 261) * 8);
    if (!drawEnvironmentAtlasCell(ctx, shipSheet, 4, 2, cell, ship.x, ship.y, shipSize, shipSize, rotation, Math.min(0.9, lane.alpha + 0.24))) {
      ctx.fillStyle = `rgba(255, 224, 165, ${Math.min(0.82, lane.alpha + 0.24)})`;
      ctx.beginPath();
      ctx.arc(ship.x, ship.y, Math.max(0.8, TILE_SIZE * 0.05 * lane.scale), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function renderDebrisBackdrop(
  ctx: CanvasRenderingContext2D,
  state: StationState,
  spriteAtlas: SpriteAtlas | null,
  useSprites: boolean,
  viewport: RenderViewport | null,
  environment: StationEnvironmentCache,
  visualTime: number
): void {
  const profile = environment.profile;
  const iceDebrisSheet = profile.kind === 'ice' ? getEnvironmentPiece('ice-debris') : null;
  const metalDebrisSheet = profile.kind === 'metal' ? getEnvironmentPiece('metal-debris') : null;
  for (const item of environment.debris) {
    const layer = DEBRIS_PARALLAX_LAYERS[item.layer];
    const orbit = visualTime * layer.speed + item.phase;
    const x = item.x + Math.cos(orbit) * layer.amplitude;
    const y = item.y + Math.sin(orbit * 0.74 + item.phase) * layer.amplitude * 0.65;
    const size = item.size;
    if (viewport && (x < viewport.x - size || x > viewport.x + viewport.width + size || y < viewport.y - size || y > viewport.y + viewport.height + size)) continue;
    const tileX = clampRender(Math.floor(x / TILE_SIZE), 0, state.width - 1);
    const tileY = clampRender(Math.floor(y / TILE_SIZE), 0, state.height - 1);
    const tile = toIndex(tileX, tileY, state.width);
    if (state.tiles[tile] !== TileType.Space && state.tiles[tile] !== TileType.Truss) continue;
    const alpha = clampRender((0.24 + profile.debris * 0.34) * layer.alpha, 0.12, 0.86);
    const rotation = item.phase + visualTime * layer.rotation * (item.layer % 2 === 0 ? 1 : -1);
    const sheet = item.tone === 'ice' ? iceDebrisSheet : item.tone === 'metal' ? metalDebrisSheet : null;
    if (drawEnvironmentAtlasCell(ctx, sheet, 4, 3, item.atlasCell, x, y, size, size, rotation, alpha)) continue;
    if (useSprites && spriteAtlas && item.tone !== 'spark' && drawSpriteByKey(ctx, spriteAtlas, item.key, x - size * 0.5, y - size * 0.5, size, size, rotation, alpha)) continue;
    drawDebrisFallback(ctx, x, y, size, item.tone, alpha, rotation);
  }

  for (const debt of state.maintenanceDebts) {
    if (!debt.exterior || debt.debt < 25) continue;
    const target = debt.targetTile ?? debt.anchorTile;
    const pos = fromIndex(target, state.width);
    const debris = mapConditionSamplesAt(state, target).find((sample) => sample.kind === 'debris-risk')?.value ?? 0.55;
    for (let j = 0; j < 8; j++) {
      const layer = DEBRIS_PARALLAX_LAYERS[j % DEBRIS_PARALLAX_LAYERS.length];
      const angle = renderHash01(state.seedAtCreation + target, j, 11) * Math.PI * 2;
      const orbit = visualTime * layer.speed * 1.5 + angle;
      const distance = TILE_SIZE * (2.2 + j * 0.72 + renderHash01(state.seedAtCreation + target, j, 12) * 1.6);
      const x =
        (pos.x + 0.5) * TILE_SIZE +
        Math.cos(angle) * distance +
        Math.cos(orbit) * layer.amplitude * 0.5;
      const y =
        (pos.y + 0.5) * TILE_SIZE +
        Math.sin(angle) * distance +
        Math.sin(orbit * 1.37) * layer.amplitude * 0.42;
      if (viewport && (x < viewport.x - 80 || x > viewport.x + viewport.width + 80 || y < viewport.y - 80 || y > viewport.y + viewport.height + 80)) {
        continue;
      }
      const tileX = clampRender(Math.floor(x / TILE_SIZE), 0, state.width - 1);
      const tileY = clampRender(Math.floor(y / TILE_SIZE), 0, state.height - 1);
      const tile = toIndex(tileX, tileY, state.width);
      if (state.tiles[tile] !== TileType.Space && state.tiles[tile] !== TileType.Truss) continue;
      const key = pickSpriteKey(SPACE_DEBRIS_SPRITE_KEYS, state.seedAtCreation + target, j, 31);
      const size = TILE_SIZE * layer.scale * (0.78 + debris * 0.9 + renderHash01(state.seedAtCreation + target, j, 32) * 0.72);
      const alpha = clampRender((0.3 + debris * 0.42) * layer.alpha, 0.22, 0.78);
      const rotation = Math.sin(orbit) * layer.rotation + visualTime * 0.28 * (j % 2 === 0 ? 1 : -1);
      if (useSprites && spriteAtlas && drawSpriteByKey(ctx, spriteAtlas, key, x - size * 0.5, y - size * 0.5, size, size, rotation, alpha)) continue;
      drawDebrisFallback(ctx, x, y, size, debrisToneForResource(profile.resourceType) ?? (j === 1 ? 'metal' : j === 2 ? 'ice' : 'rock'), alpha, rotation);
    }
  }
}

function exteriorImpactPoint(state: StationState, targetTile: number): { x: number; y: number; sx: number; sy: number } {
  const target = fromIndex(targetTile, state.width);
  let bestNeighbor = targetTile;
  let bestRisk = -1;
  for (const delta of [
    { dx: 0, dy: -1 },
    { dx: 1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 }
  ]) {
    const nx = target.x + delta.dx;
    const ny = target.y + delta.dy;
    if (!inBounds(nx, ny, state.width, state.height)) continue;
    const neighbor = toIndex(nx, ny, state.width);
    const kind = state.tiles[neighbor];
    if (kind !== TileType.Space && kind !== TileType.Truss) continue;
    const risk = mapConditionSamplesAt(state, neighbor).find((sample) => sample.kind === 'debris-risk')?.value ?? 0;
    if (risk > bestRisk) {
      bestRisk = risk;
      bestNeighbor = neighbor;
    }
  }
  const space = fromIndex(bestNeighbor, state.width);
  const impactX = (target.x + 0.5) * TILE_SIZE;
  const impactY = (target.y + 0.5) * TILE_SIZE;
  const sourceX = bestNeighbor === targetTile ? impactX - TILE_SIZE * 1.6 : (space.x + 0.5) * TILE_SIZE;
  const sourceY = bestNeighbor === targetTile ? impactY - TILE_SIZE * 1.2 : (space.y + 0.5) * TILE_SIZE;
  return { x: impactX, y: impactY, sx: sourceX, sy: sourceY };
}

function renderMaintenanceImpacts(
  ctx: CanvasRenderingContext2D,
  state: StationState,
  spriteAtlas: SpriteAtlas | null,
  useSprites: boolean,
  viewport: RenderViewport | null
): void {
  for (const debt of state.maintenanceDebts) {
    if (!debt.exterior || debt.debt < 28) continue;
    const target = debt.targetTile ?? debt.anchorTile;
    const risk = mapConditionSamplesAt(state, target).find((sample) => sample.kind === 'debris-risk')?.value ?? 0.55;
    const period = clampRender(2.8 - risk * 1.35 - debt.debt / 180, 1.25, 2.9);
    const phase = renderHash01(state.seedAtCreation + target, 5, 17) * period;
    const periodicAge = positiveMod(state.now + phase, period);
    const recordedAge = debt.lastImpactAt ? state.now - debt.lastImpactAt : Number.POSITIVE_INFINITY;
    const age = recordedAge >= 0 && recordedAge < periodicAge ? recordedAge : periodicAge;
    if (age < 0 || age > 0.72) continue;
    const impact = exteriorImpactPoint(state, target);
    const cx = impact.x;
    const cy = impact.y;
    if (viewport && (cx < viewport.x - 80 || cx > viewport.x + viewport.width + 80 || cy < viewport.y - 80 || cy > viewport.y + viewport.height + 80)) continue;
    const t = age / 0.72;
    const size = TILE_SIZE * (1.75 - t * 0.42);
    const alpha = clampRender((1 - t) * (0.72 + risk * 0.34), 0, 0.96);
    ctx.save();
    ctx.globalAlpha = alpha * 0.82;
    ctx.strokeStyle = '#ffcf62';
    ctx.lineWidth = Math.max(1.5, TILE_SIZE * 0.08 * (1 - t * 0.45));
    ctx.beginPath();
    ctx.moveTo(impact.sx, impact.sy);
    ctx.lineTo(cx, cy);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 105, 72, 0.78)';
    ctx.lineWidth = Math.max(1, TILE_SIZE * 0.045);
    ctx.beginPath();
    ctx.moveTo((impact.sx + cx) * 0.5, (impact.sy + cy) * 0.5);
    ctx.lineTo(cx, cy);
    ctx.stroke();
    ctx.restore();
    const projectileEase = 1 - Math.pow(1 - t, 2.2);
    const projectileX = impact.sx + (cx - impact.sx) * projectileEase;
    const projectileY = impact.sy + (cy - impact.sy) * projectileEase;
    const projectileKey = pickSpriteKey(IMPACT_DEBRIS_SPRITE_KEYS, state.seedAtCreation + target, 7, 43);
    const projectileSize = TILE_SIZE * clampRender(0.62 + risk * 0.45 + debt.debt / 220, 0.6, 1.35);
    const projectileAngle = (Math.atan2(cy - impact.sy, cx - impact.sx) * 180) / Math.PI + 45;
    if (
      useSprites &&
      spriteAtlas &&
      drawSpriteByKey(
        ctx,
        spriteAtlas,
        projectileKey,
        projectileX - projectileSize * 0.5,
        projectileY - projectileSize * 0.5,
        projectileSize,
        projectileSize,
        projectileAngle,
        alpha
      )
    ) {
      // Sprite handled.
    } else {
      drawDebrisFallback(ctx, projectileX, projectileY, projectileSize, projectileKey.includes('ice') ? 'ice' : projectileKey.includes('metal') ? 'metal' : 'rock', alpha);
    }
    if (t < 0.42) continue;
    const sparkT = (t - 0.42) / 0.58;
    const sparkSize = size * (1 - sparkT * 0.36);
    const sparkAlpha = alpha * (1 - sparkT * 0.7);
    if (useSprites && spriteAtlas && drawSpriteByKey(ctx, spriteAtlas, FX_SPRITE_KEYS.repairSpark, cx - sparkSize * 0.5, cy - sparkSize * 0.5, sparkSize, sparkSize, 0, sparkAlpha)) continue;
    drawDebrisFallback(ctx, cx, cy, sparkSize, 'spark', sparkAlpha);
  }
}

function renderHullWearOverlays(
  ctx: CanvasRenderingContext2D,
  state: StationState,
  spriteAtlas: SpriteAtlas,
  useSprites: boolean,
  viewport: RenderViewport | null
): void {
  const stateKey = {
    worn: 'overlay.wall.hull.worn',
    damaged: 'overlay.wall.hull.damaged',
    breached: 'overlay.wall.hull.breached',
    patched: 'overlay.wall.hull.patched'
  } as const;
  const faceRotation: Record<'north' | 'east' | 'south' | 'west', number> = {
    north: 0,
    east: 90,
    south: 180,
    west: 270
  };
  const repairingKeys = new Set(
    state.jobs
      .filter((job) => job.type === 'repair' && job.state === 'in_progress' && job.repairTargetKey?.startsWith('integrity:'))
      .map((job) => job.repairTargetKey!)
  );
  for (const target of state.exteriorIntegrityTargets) {
    if (target.state === 'worn' && target.wear < 12) continue;
    const xTile = target.worldX - state.mapWorldOriginX;
    const yTile = target.worldY - state.mapWorldOriginY;
    if (!inBounds(xTile, yTile, state.width, state.height)) continue;
    const x = xTile * TILE_SIZE;
    const y = yTile * TILE_SIZE;
    if (viewport && (x + TILE_SIZE < viewport.x || x > viewport.x + viewport.width || y + TILE_SIZE < viewport.y || y > viewport.y + viewport.height)) continue;
    const alpha = target.state === 'breached' ? 0.96 : target.state === 'damaged' ? 0.82 : target.state === 'patched' ? 0.7 : 0.56;
    if (!useSprites || !drawSpriteByKey(ctx, spriteAtlas, stateKey[target.state], x, y, TILE_SIZE, TILE_SIZE, faceRotation[target.face], alpha)) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = target.state === 'breached' ? '#ff625f' : target.state === 'damaged' ? '#ffb15b' : target.state === 'patched' ? '#79e6c0' : '#d4a66a';
      ctx.lineWidth = Math.max(1, TILE_SIZE * 0.08);
      ctx.strokeRect(x + TILE_SIZE * 0.16, y + TILE_SIZE * 0.16, TILE_SIZE * 0.68, TILE_SIZE * 0.68);
      if (target.state === 'breached') {
        ctx.beginPath();
        ctx.moveTo(x + TILE_SIZE * 0.24, y + TILE_SIZE * 0.3);
        ctx.lineTo(x + TILE_SIZE * 0.76, y + TILE_SIZE * 0.7);
        ctx.moveTo(x + TILE_SIZE * 0.7, y + TILE_SIZE * 0.22);
        ctx.lineTo(x + TILE_SIZE * 0.34, y + TILE_SIZE * 0.78);
        ctx.stroke();
      }
      ctx.restore();
    }
    if (!repairingKeys.has(`integrity:${target.id}`)) continue;
    const frames = STRUCTURAL_FRONTAGE_SPRITE_KEYS.evaWeldFrames;
    const frame = frames[Math.floor(state.now * 10 + xTile + yTile) % frames.length];
    const sparkSize = TILE_SIZE * 1.2;
    if (useSprites && drawSpriteByKey(ctx, spriteAtlas, frame, x - TILE_SIZE * 0.1, y - TILE_SIZE * 0.1, sparkSize, sparkSize, 0, 0.9)) continue;
    ctx.save();
    ctx.strokeStyle = '#ffe089';
    ctx.lineWidth = Math.max(1, TILE_SIZE * 0.055);
    ctx.beginPath();
    ctx.moveTo(x + TILE_SIZE * 0.25, y + TILE_SIZE * 0.5);
    ctx.lineTo(x + TILE_SIZE * 0.75, y + TILE_SIZE * 0.5);
    ctx.moveTo(x + TILE_SIZE * 0.5, y + TILE_SIZE * 0.25);
    ctx.lineTo(x + TILE_SIZE * 0.5, y + TILE_SIZE * 0.75);
    ctx.stroke();
    ctx.restore();
  }
  for (const debt of state.maintenanceDebts) {
    if (!debt.exterior || debt.debt < 35) continue;
    if (debt.key.startsWith('integrity:')) continue;
    const target = debt.targetTile ?? debt.anchorTile;
    const pos = fromIndex(target, state.width);
    const x = pos.x * TILE_SIZE;
    const y = pos.y * TILE_SIZE;
    if (viewport && (x + TILE_SIZE < viewport.x || x > viewport.x + viewport.width || y + TILE_SIZE < viewport.y || y > viewport.y + viewport.height)) continue;
    const key = HULL_WEAR_SPRITE_KEYS[positiveMod(debt.anchorTile + Math.floor(debt.debt / 20), HULL_WEAR_SPRITE_KEYS.length)];
    const alpha = clampRender((debt.debt - 25) / 75, 0.18, 0.62);
    if (useSprites && drawSpriteByKey(ctx, spriteAtlas, key, x, y, TILE_SIZE, TILE_SIZE, 0, alpha)) continue;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = '#1b171c';
    ctx.lineWidth = Math.max(1, TILE_SIZE * 0.06);
    ctx.beginPath();
    ctx.moveTo(x + TILE_SIZE * 0.22, y + TILE_SIZE * 0.35);
    ctx.lineTo(x + TILE_SIZE * 0.72, y + TILE_SIZE * 0.2);
    ctx.moveTo(x + TILE_SIZE * 0.34, y + TILE_SIZE * 0.68);
    ctx.lineTo(x + TILE_SIZE * 0.76, y + TILE_SIZE * 0.52);
    ctx.stroke();
    ctx.restore();
  }
}

function ensureCachedLayer(existing: CachedLayer | null, widthPx: number, heightPx: number): CachedLayer {
  if (!existing || existing.canvas.width !== widthPx || existing.canvas.height !== heightPx) {
    const canvas = document.createElement('canvas');
    canvas.width = widthPx;
    canvas.height = heightPx;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to create render layer');
    return { canvas, ctx, key: '' };
  }
  return existing;
}

function normalizeViewport(viewport: RenderViewport | null | undefined, widthPx: number, heightPx: number): RenderViewport | null {
  if (!viewport) return null;
  const x = Math.max(0, Math.min(widthPx, Math.floor(viewport.x)));
  const y = Math.max(0, Math.min(heightPx, Math.floor(viewport.y)));
  const maxX = Math.max(x, Math.min(widthPx, Math.ceil(viewport.x + viewport.width)));
  const maxY = Math.max(y, Math.min(heightPx, Math.ceil(viewport.y + viewport.height)));
  const width = maxX - x;
  const height = maxY - y;
  return width > 0 && height > 0 ? { x, y, width, height } : null;
}

function drawCachedLayer(
  ctx: CanvasRenderingContext2D,
  layer: HTMLCanvasElement,
  viewport: RenderViewport | null
): void {
  if (!viewport) {
    ctx.drawImage(layer, 0, 0);
    return;
  }
  ctx.drawImage(
    layer,
    viewport.x,
    viewport.y,
    viewport.width,
    viewport.height,
    viewport.x,
    viewport.y,
    viewport.width,
    viewport.height
  );
}

function tileRangeForViewport(
  viewport: RenderViewport | null,
  state: StationState
): { minX: number; maxX: number; minY: number; maxY: number } {
  if (!viewport) {
    return { minX: 0, maxX: state.width - 1, minY: 0, maxY: state.height - 1 };
  }
  const minX = Math.max(0, Math.floor(viewport.x / TILE_SIZE) - 1);
  const minY = Math.max(0, Math.floor(viewport.y / TILE_SIZE) - 1);
  const maxX = Math.min(state.width - 1, Math.ceil((viewport.x + viewport.width) / TILE_SIZE) + 1);
  const maxY = Math.min(state.height - 1, Math.ceil((viewport.y + viewport.height) / TILE_SIZE) + 1);
  return { minX, maxX, minY, maxY };
}

function tileInRange(tileIndex: number, state: StationState, range: { minX: number; maxX: number; minY: number; maxY: number }): boolean {
  const x = tileIndex % state.width;
  const y = Math.floor(tileIndex / state.width);
  return x >= range.minX && x <= range.maxX && y >= range.minY && y <= range.maxY;
}

function drawRepeatedSpriteFrame(
  ctx: CanvasRenderingContext2D,
  spriteAtlas: SpriteAtlas,
  frame: SpriteFrame,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  patternOffsetX: number,
  patternOffsetY: number
): boolean {
  if (!spriteAtlas.image) return false;
  const image = spriteAtlas.image;
  const prevSmoothing = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;

  let remainingH = dh;
  let destY = dy;
  let srcY = positiveMod(patternOffsetY, frame.h);
  while (remainingH > 0) {
    const sampleH = Math.min(frame.h - srcY, remainingH);
    let remainingW = dw;
    let destX = dx;
    let srcX = positiveMod(patternOffsetX, frame.w);
    while (remainingW > 0) {
      const sampleW = Math.min(frame.w - srcX, remainingW);
      ctx.drawImage(
        image,
        frame.x + srcX,
        frame.y + srcY,
        sampleW,
        sampleH,
        destX,
        destY,
        sampleW,
        sampleH
      );
      remainingW -= sampleW;
      destX += sampleW;
      srcX = 0;
    }
    remainingH -= sampleH;
    destY += sampleH;
    srcY = 0;
  }

  ctx.imageSmoothingEnabled = prevSmoothing;
  return true;
}

function drawAirlockFallback(ctx: CanvasRenderingContext2D, px: number, py: number, rotationDeg = 0): boolean {
  ctx.save();
  ctx.translate(px + TILE_SIZE * 0.5, py + TILE_SIZE * 0.5);
  ctx.rotate((rotationDeg * Math.PI) / 180);
  ctx.translate(-TILE_SIZE * 0.5, -TILE_SIZE * 0.5);

  const p = PX;
  ctx.fillStyle = '#243240';
  ctx.fillRect(0, 1 * p, 18 * p, 16 * p);
  ctx.fillStyle = '#344554';
  ctx.fillRect(0, 3 * p, 18 * p, 12 * p);
  ctx.fillStyle = '#1d2832';
  ctx.fillRect(2 * p, 5 * p, 14 * p, 8 * p);

  ctx.fillStyle = '#62717c';
  ctx.fillRect(0, 6 * p, 3 * p, 7 * p);
  ctx.fillRect(15 * p, 6 * p, 3 * p, 7 * p);
  ctx.fillStyle = '#d59a24';
  ctx.fillRect(0, 7 * p, 3 * p, 1 * p);
  ctx.fillRect(0, 10 * p, 3 * p, 1 * p);
  ctx.fillRect(15 * p, 7 * p, 3 * p, 1 * p);
  ctx.fillRect(15 * p, 10 * p, 3 * p, 1 * p);

  ctx.fillStyle = '#6d7e8a';
  ctx.fillRect(3 * p, 4 * p, 12 * p, 10 * p);
  ctx.fillStyle = '#2d3a45';
  ctx.fillRect(4 * p, 5 * p, 10 * p, 8 * p);
  ctx.fillStyle = '#dbe7ed';
  ctx.fillRect(5 * p, 6 * p, 8 * p, 6 * p);
  ctx.fillStyle = '#f3f8fa';
  ctx.fillRect(5.5 * p, 6.5 * p, 7 * p, 5 * p);
  ctx.fillStyle = '#b5c4ce';
  ctx.fillRect(6 * p, 11 * p, 6 * p, 1 * p);

  ctx.fillStyle = '#2a3a47';
  ctx.fillRect(6 * p, 3 * p, 6 * p, 1 * p);
  ctx.fillRect(6 * p, 14 * p, 6 * p, 1 * p);
  ctx.fillStyle = '#79e0ff';
  ctx.fillRect(7 * p, 3 * p, 4 * p, 1 * p);
  ctx.fillRect(7 * p, 14 * p, 4 * p, 1 * p);
  ctx.fillRect(4 * p, 8 * p, 1 * p, 2 * p);
  ctx.fillRect(13 * p, 8 * p, 1 * p, 2 * p);

  ctx.fillStyle = '#c2d0d8';
  ctx.fillRect(8 * p, 6 * p, 1 * p, 6 * p);
  ctx.fillStyle = '#8da2ae';
  ctx.fillRect(9 * p, 6 * p, 1 * p, 6 * p);
  ctx.strokeStyle = '#18222b';
  ctx.lineWidth = Math.max(1, p);
  ctx.strokeRect(3.5 * p, 4.5 * p, 11 * p, 9 * p);
  ctx.restore();
  return true;
}

function drawTileSprite(
  state: StationState,
  tileIndex: number,
  tileType: TileType,
  ctx: CanvasRenderingContext2D,
  spriteAtlas: SpriteAtlas,
  px: number,
  py: number
): boolean {
  if (tileType === TileType.Space) {
    const frame = spriteAtlas.getFrame(TILE_SPRITE_KEYS[TileType.Space]);
    if (!frame) return false;
    return drawRepeatedSpriteFrame(ctx, spriteAtlas, frame, px, py, TILE_SIZE, TILE_SIZE, px, py);
  }
  if (tileType === TileType.Truss) {
    return drawSpriteByKey(ctx, spriteAtlas, TILE_SPRITE_KEYS[TileType.Truss], px, py, TILE_SIZE, TILE_SIZE) || drawTrussFallback(ctx, px, py);
  }
  if (tileType === TileType.Wall) {
    if (state.controls.wallRenderMode === 'dual-tilemap') {
      // Dual-tilemap: per-cell wall sprite is suppressed so the dual pass
      // composites over a clean floor underlay. Wall geometry is drawn by
      // `renderDualWallLayer` in `ensureStaticLayer`.
      return drawSpriteByKey(ctx, spriteAtlas, TILE_SPRITE_KEYS[TileType.Floor], px, py, TILE_SIZE, TILE_SIZE);
    }
    const wallVariant = resolveWallVariantForTile(state, tileIndex);
    return (
      drawSpriteByKey(
        ctx,
        spriteAtlas,
        WALL_SPRITE_VARIANT_KEYS[wallVariant.shape],
        px,
        py,
        TILE_SIZE,
        TILE_SIZE,
        wallVariant.rotation
      ) || drawSpriteByKey(ctx, spriteAtlas, TILE_SPRITE_KEYS[TileType.Wall], px, py, TILE_SIZE, TILE_SIZE)
    );
  }
  if (tileType === TileType.Door || tileType === TileType.Airlock) {
    if (state.controls.wallRenderMode === 'dual-tilemap' && tileType === TileType.Door) {
      return drawSpriteByKey(ctx, spriteAtlas, TILE_SPRITE_KEYS[TileType.Floor], px, py, TILE_SIZE, TILE_SIZE);
    }
    const doorVariant = resolveDoorVariantForTile(state, tileIndex);
    if (tileType === TileType.Airlock) {
      return (
        drawSpriteByKey(
          ctx,
          spriteAtlas,
          TILE_SPRITE_KEYS[TileType.Airlock],
          px,
          py,
          TILE_SIZE,
          TILE_SIZE,
          doorVariant.rotation
        ) || drawAirlockFallback(ctx, px, py, doorVariant.rotation)
      );
    }
    const drewDoor = (
      drawSpriteByKey(
        ctx,
        spriteAtlas,
        DOOR_SPRITE_VARIANT_KEYS[doorVariant.shape],
        px,
        py,
        TILE_SIZE,
        TILE_SIZE,
        doorVariant.rotation
      ) || drawSpriteByKey(ctx, spriteAtlas, TILE_SPRITE_KEYS[TileType.Door], px, py, TILE_SIZE, TILE_SIZE)
    );
    if (drewDoor) return true;
  }
  if (tileType === TileType.Floor && state.rooms[tileIndex] !== RoomType.None) {
    const roomKey = ROOM_SPRITE_KEYS[state.rooms[tileIndex]];
    if (roomKey && drawSpriteByKey(ctx, spriteAtlas, roomKey, px, py, TILE_SIZE, TILE_SIZE)) {
      return true;
    }
  }
  return drawSpriteByKey(ctx, spriteAtlas, TILE_SPRITE_KEYS[tileType], px, py, TILE_SIZE, TILE_SIZE);
}

function hasSameRoomNeighbor(state: StationState, tileIndex: number, dx: number, dy: number, room: RoomType): boolean {
  const { x, y } = fromIndex(tileIndex, state.width);
  const nx = x + dx;
  const ny = y + dy;
  if (!inBounds(nx, ny, state.width, state.height)) return false;
  return state.rooms[ny * state.width + nx] === room;
}

function hasTileNeighbor(state: StationState, tileIndex: number, dx: number, dy: number, tile: TileType): boolean {
  const { x, y } = fromIndex(tileIndex, state.width);
  const nx = x + dx;
  const ny = y + dy;
  if (!inBounds(nx, ny, state.width, state.height)) return tile === TileType.Space;
  return state.tiles[ny * state.width + nx] === tile;
}

function drawBerthHazardEdge(ctx: CanvasRenderingContext2D, px: number, py: number, edge: 'north' | 'east' | 'south' | 'west'): void {
  const stripe = Math.max(2, Math.round(3 * PX));
  const band = Math.max(2, Math.round(2 * PX));
  ctx.save();
  ctx.beginPath();
  if (edge === 'north') ctx.rect(px, py, TILE_SIZE, band);
  if (edge === 'south') ctx.rect(px, py + TILE_SIZE - band, TILE_SIZE, band);
  if (edge === 'west') ctx.rect(px, py, band, TILE_SIZE);
  if (edge === 'east') ctx.rect(px + TILE_SIZE - band, py, band, TILE_SIZE);
  ctx.clip();
  ctx.fillStyle = 'rgba(255, 198, 66, 0.85)';
  ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
  ctx.strokeStyle = 'rgba(20, 24, 30, 0.8)';
  ctx.lineWidth = Math.max(1, Math.round(PX));
  for (let o = -TILE_SIZE; o < TILE_SIZE * 2; o += stripe) {
    ctx.beginPath();
    if (edge === 'north' || edge === 'south') {
      ctx.moveTo(px + o, py);
      ctx.lineTo(px + o + stripe, py + TILE_SIZE);
    } else {
      ctx.moveTo(px, py + o);
      ctx.lineTo(px + TILE_SIZE, py + o + stripe);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawBerthSupportArm(ctx: CanvasRenderingContext2D, px: number, py: number, edge: 'north' | 'east' | 'south' | 'west'): void {
  const cx = px + TILE_SIZE * 0.5;
  const cy = py + TILE_SIZE * 0.5;
  const pad = Math.max(2, Math.round(3 * PX));
  const len = TILE_SIZE * 0.34;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(33, 43, 55, 0.95)';
  ctx.lineWidth = Math.max(2, Math.round(3 * PX));
  ctx.beginPath();
  if (edge === 'north') {
    ctx.moveTo(cx, py + pad);
    ctx.lineTo(cx, py + pad + len);
    ctx.lineTo(cx + TILE_SIZE * 0.16, py + pad + len + TILE_SIZE * 0.1);
  } else if (edge === 'south') {
    ctx.moveTo(cx, py + TILE_SIZE - pad);
    ctx.lineTo(cx, py + TILE_SIZE - pad - len);
    ctx.lineTo(cx - TILE_SIZE * 0.16, py + TILE_SIZE - pad - len - TILE_SIZE * 0.1);
  } else if (edge === 'west') {
    ctx.moveTo(px + pad, cy);
    ctx.lineTo(px + pad + len, cy);
    ctx.lineTo(px + pad + len + TILE_SIZE * 0.1, cy - TILE_SIZE * 0.16);
  } else {
    ctx.moveTo(px + TILE_SIZE - pad, cy);
    ctx.lineTo(px + TILE_SIZE - pad - len, cy);
    ctx.lineTo(px + TILE_SIZE - pad - len - TILE_SIZE * 0.1, cy + TILE_SIZE * 0.16);
  }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(151, 184, 205, 0.78)';
  ctx.lineWidth = Math.max(1, Math.round(PX));
  ctx.stroke();
  ctx.fillStyle = 'rgba(80, 248, 176, 0.85)';
  ctx.fillRect(cx - PX, cy - PX, Math.max(1, Math.round(2 * PX)), Math.max(1, Math.round(2 * PX)));
  ctx.restore();
}

function drawBerthTileTexture(ctx: CanvasRenderingContext2D, state: StationState, tileIndex: number, px: number, py: number): void {
  const inset = Math.max(1, Math.round(1.5 * PX));
  const grateStep = Math.max(3, Math.round(4 * PX));
  const grad = ctx.createLinearGradient(px, py, px + TILE_SIZE, py + TILE_SIZE);
  grad.addColorStop(0, '#07111b');
  grad.addColorStop(0.55, '#111b27');
  grad.addColorStop(1, '#0a121d');

  ctx.save();
  ctx.fillStyle = grad;
  ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
  ctx.fillStyle = 'rgba(86, 125, 156, 0.14)';
  ctx.fillRect(px + inset, py + inset, TILE_SIZE - inset * 2, TILE_SIZE - inset * 2);

  ctx.strokeStyle = 'rgba(155, 207, 235, 0.16)';
  ctx.lineWidth = Math.max(1, Math.round(PX));
  for (let x = px + grateStep; x < px + TILE_SIZE; x += grateStep) {
    ctx.beginPath();
    ctx.moveTo(x, py + inset);
    ctx.lineTo(x, py + TILE_SIZE - inset);
    ctx.stroke();
  }
  for (let y = py + grateStep; y < py + TILE_SIZE; y += grateStep) {
    ctx.beginPath();
    ctx.moveTo(px + inset, y);
    ctx.lineTo(px + TILE_SIZE - inset, y);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(92, 160, 210, 0.34)';
  ctx.strokeRect(px + inset, py + inset, TILE_SIZE - inset * 2, TILE_SIZE - inset * 2);
  ctx.fillStyle = 'rgba(190, 225, 245, 0.28)';
  const bolt = Math.max(1, Math.round(PX));
  ctx.fillRect(px + inset + bolt, py + inset + bolt, bolt, bolt);
  ctx.fillRect(px + TILE_SIZE - inset - bolt * 2, py + inset + bolt, bolt, bolt);
  ctx.fillRect(px + inset + bolt, py + TILE_SIZE - inset - bolt * 2, bolt, bolt);
  ctx.fillRect(px + TILE_SIZE - inset - bolt * 2, py + TILE_SIZE - inset - bolt * 2, bolt, bolt);

  if (!hasSameRoomNeighbor(state, tileIndex, 0, -1, RoomType.Berth)) drawBerthHazardEdge(ctx, px, py, 'north');
  if (!hasSameRoomNeighbor(state, tileIndex, 1, 0, RoomType.Berth)) drawBerthHazardEdge(ctx, px, py, 'east');
  if (!hasSameRoomNeighbor(state, tileIndex, 0, 1, RoomType.Berth)) drawBerthHazardEdge(ctx, px, py, 'south');
  if (!hasSameRoomNeighbor(state, tileIndex, -1, 0, RoomType.Berth)) drawBerthHazardEdge(ctx, px, py, 'west');
  if (hasTileNeighbor(state, tileIndex, 0, -1, TileType.Wall)) drawBerthSupportArm(ctx, px, py, 'north');
  if (hasTileNeighbor(state, tileIndex, 1, 0, TileType.Wall)) drawBerthSupportArm(ctx, px, py, 'east');
  if (hasTileNeighbor(state, tileIndex, 0, 1, TileType.Wall)) drawBerthSupportArm(ctx, px, py, 'south');
  if (hasTileNeighbor(state, tileIndex, -1, 0, TileType.Wall)) drawBerthSupportArm(ctx, px, py, 'west');
  ctx.restore();
}

function renderDoorLayer(ctx: CanvasRenderingContext2D, state: StationState, spriteAtlas: SpriteAtlas): void {
  for (let i = 0; i < state.tiles.length; i++) {
    if (state.tiles[i] !== TileType.Door && state.tiles[i] !== TileType.Airlock) continue;
    const { x, y } = fromIndex(i, state.width);
    const px = x * TILE_SIZE;
    const py = y * TILE_SIZE;
    const doorVariant = resolveDoorVariantForTile(state, i);
    if (state.tiles[i] === TileType.Airlock) {
      drawSpriteByKey(
        ctx,
        spriteAtlas,
        TILE_SPRITE_KEYS[TileType.Airlock],
        px,
        py,
        TILE_SIZE,
        TILE_SIZE,
        doorVariant.rotation
      ) || drawAirlockFallback(ctx, px, py, doorVariant.rotation);
      continue;
    }
    drawSpriteByKey(
      ctx,
      spriteAtlas,
      DOOR_SPRITE_VARIANT_KEYS[doorVariant.shape],
      px,
      py,
      TILE_SIZE,
      TILE_SIZE,
      doorVariant.rotation
    ) || drawSpriteByKey(ctx, spriteAtlas, TILE_SPRITE_KEYS[TileType.Door], px, py, TILE_SIZE, TILE_SIZE);
  }
}

function drawSpriteFrame(
  ctx: CanvasRenderingContext2D,
  spriteAtlas: SpriteAtlas,
  frame: SpriteFrame,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  rotationDeg = 0,
  alpha = 1,
  blendMode: GlobalCompositeOperation = 'source-over'
): boolean {
  if (!spriteAtlas.image) return false;
  const image = spriteAtlas.image;
  ctx.save();
  const prevSmoothing = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  if (alpha !== 1) ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = blendMode;
  if (rotationDeg === 0) {
    ctx.drawImage(image, frame.x, frame.y, frame.w, frame.h, dx, dy, dw, dh);
  } else {
    ctx.translate(dx + dw * 0.5, dy + dh * 0.5);
    ctx.rotate((rotationDeg * Math.PI) / 180);
    ctx.drawImage(image, frame.x, frame.y, frame.w, frame.h, -dw * 0.5, -dh * 0.5, dw, dh);
  }
  ctx.imageSmoothingEnabled = prevSmoothing;
  ctx.restore();
  return true;
}

function drawSpriteByKey(
  ctx: CanvasRenderingContext2D,
  spriteAtlas: SpriteAtlas,
  spriteKey: string,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  rotationDeg = 0,
  alpha = 1
): boolean {
  const frame = spriteAtlas.getFrame(spriteKey);
  if (!frame) return false;
  const manifestRotation = spriteAtlas.getRotation(spriteKey);
  const offset = spriteAtlas.getOffset(spriteKey);
  const blendMode = spriteAtlas.getBlendMode(spriteKey);
  const manifestAlpha = spriteAtlas.getAlpha(spriteKey);
  const totalRotation = ((rotationDeg + manifestRotation) % 360 + 360) % 360;
  return drawSpriteFrame(
    ctx,
    spriteAtlas,
    frame,
    dx + offset.x,
    dy + offset.y,
    dw,
    dh,
    totalRotation,
    alpha * manifestAlpha,
    blendMode === 'add' ? 'lighter' : 'source-over'
  );
}

const AGENT_SPRITE_SCALE = 0.8;

let agentTintCanvas: HTMLCanvasElement | null = null;
let agentTintCtx: CanvasRenderingContext2D | null = null;

function drawTintedAgentSprite(
  ctx: CanvasRenderingContext2D,
  spriteAtlas: SpriteAtlas,
  spriteKey: string,
  cx: number,
  cy: number,
  size: number,
  tintColor: string,
  tintAlpha: number
): boolean {
  const frame = spriteAtlas.getFrame(spriteKey);
  if (!frame || !spriteAtlas.image) return false;

  if (!agentTintCanvas) {
    agentTintCanvas = document.createElement('canvas');
    agentTintCtx = agentTintCanvas.getContext('2d');
  }
  if (!agentTintCtx) return false;

  const fw = frame.w;
  const fh = frame.h;
  if (agentTintCanvas.width !== fw || agentTintCanvas.height !== fh) {
    agentTintCanvas.width = fw;
    agentTintCanvas.height = fh;
  }

  // Draw sprite to offscreen canvas
  agentTintCtx.clearRect(0, 0, fw, fh);
  agentTintCtx.globalCompositeOperation = 'source-over';
  agentTintCtx.globalAlpha = 1;
  agentTintCtx.drawImage(spriteAtlas.image, frame.x, frame.y, fw, fh, 0, 0, fw, fh);

  // Tint only opaque pixels
  agentTintCtx.globalCompositeOperation = 'source-atop';
  agentTintCtx.globalAlpha = tintAlpha;
  agentTintCtx.fillStyle = tintColor;
  agentTintCtx.fillRect(0, 0, fw, fh);

  // Blit to main canvas
  const half = size * 0.5;
  ctx.drawImage(agentTintCanvas, 0, 0, fw, fh, cx - half, cy - half, size, size);
  return true;
}

function drawEvaSuitAgentFallback(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number): void {
  const half = size * 0.5;
  const x = cx - half;
  const y = cy - half;
  ctx.save();
  ctx.fillStyle = '#dff7ff';
  ctx.strokeStyle = '#5fd4ff';
  ctx.lineWidth = Math.max(1, size * 0.07);
  ctx.beginPath();
  ctx.roundRect(x + size * 0.29, y + size * 0.2, size * 0.42, size * 0.58, size * 0.12);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#182d3f';
  ctx.fillRect(x + size * 0.36, y + size * 0.28, size * 0.28, size * 0.16);
  ctx.fillStyle = '#8be8ff';
  ctx.fillRect(x + size * 0.4, y + size * 0.31, size * 0.2, size * 0.06);
  ctx.fillStyle = '#7894a6';
  ctx.fillRect(x + size * 0.2, y + size * 0.42, size * 0.13, size * 0.25);
  ctx.fillRect(x + size * 0.67, y + size * 0.42, size * 0.13, size * 0.25);
  ctx.fillStyle = '#ffcf62';
  ctx.fillRect(x + size * 0.42, y + size * 0.76, size * 0.06, size * 0.12);
  ctx.fillRect(x + size * 0.52, y + size * 0.76, size * 0.06, size * 0.12);
  ctx.restore();
}

function crewTintForStaffRole(role: StationState['crewMembers'][number]['staffRole']): string {
  if (role === 'captain') return '#f5f2da';
  if (role.includes('officer')) return '#7ec8ff';
  if (role === 'cleaner' || role === 'janitor') return '#5ee0c2';
  if (role === 'cook' || role === 'botanist') return '#9ee36f';
  if (role === 'technician' || role === 'engineer' || role === 'mechanic' || role === 'welder') return '#f2bd62';
  if (role === 'doctor' || role === 'nurse') return '#a7f4ff';
  if (role === 'security-guard') return '#9a9cff';
  if (role.startsWith('eva') || role === 'flight-controller' || role === 'docking-officer') return '#ffffff';
  return '#7ec8ff';
}

function pickAgentVariant(variants: readonly string[], agentId: number): string {
  return variants[agentId % variants.length];
}

function isFloorWeatherEligible(tileType: TileType): boolean {
  return (
    tileType === TileType.Floor ||
    tileType === TileType.Cafeteria ||
    tileType === TileType.Reactor ||
    tileType === TileType.Security
  );
}

function roomWeatherBias(roomType: RoomType): number {
  switch (roomType) {
    case RoomType.Reactor:
    case RoomType.Workshop:
    case RoomType.Kitchen:
    case RoomType.LogisticsStock:
    case RoomType.Storage:
    case RoomType.Market:
      return 15;
    default:
      return 0;
  }
}

function suppressFloorWeather(roomType: RoomType): boolean {
  return roomType === RoomType.Cafeteria || roomType === RoomType.Clinic || roomType === RoomType.RecHall;
}

function hashWeatherSeed(tileIndex: number, roomType: RoomType, topologyVersion: number): number {
  const seed = `${tileIndex}|${roomType}|${topologyVersion}`;
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pickFloorOverlayKey(state: StationState, tileIndex: number): string | null {
  const tileType = state.tiles[tileIndex];
  if (!isFloorWeatherEligible(tileType)) return null;
  const dirt = state.dirtByTile[tileIndex] ?? 0;
  // Sanitation is a live system, so visible grime starts while a space is
  // merely becoming neglected instead of appearing only after it is filthy.
  // Decorative weathering uses the separate wear sprites below; a grime
  // sprite now always means actual dirt the player can clean.
  if (dirt >= 12) {
    const hash = hashWeatherSeed(tileIndex, state.rooms[tileIndex], state.topologyVersion);
    return FLOOR_GRIME_SPRITE_KEYS[(hash >>> (dirt >= 70 ? 2 : 4)) % FLOOR_GRIME_SPRITE_KEYS.length] ?? null;
  }
  const roomType = state.rooms[tileIndex];
  if (suppressFloorWeather(roomType) || roomWeatherBias(roomType) <= 0) return null;
  const hash = hashWeatherSeed(tileIndex, roomType, state.topologyVersion);
  const roll = hash % 100;
  const bias = roomWeatherBias(roomType);
  const noOverlayThreshold = Math.max(15, 45 - bias);
  const wearThreshold = Math.min(95, 85 + Math.round(bias * 0.6));
  if (roll < noOverlayThreshold) return null;
  if (roll >= wearThreshold) return FLOOR_WEAR_SPRITE_KEYS[(hash >>> 8) % FLOOR_WEAR_SPRITE_KEYS.length] ?? null;
  return null;
}

function floorOverlayAlpha(state: StationState, tileIndex: number): number {
  const dirt = state.dirtByTile[tileIndex] ?? 0;
  if (dirt < 12) return 0.38;
  return 0.22 + clamp01((dirt - 12) / 70) * 0.62;
}

function sanitationRenderSignature(state: StationState): string {
  let dirty = 0;
  let filthy = 0;
  let maxBucket = 0;
  let spatialHash = 2166136261;
  for (let i = 0; i < state.dirtByTile.length; i++) {
    const bucket = Math.floor((state.dirtByTile[i] ?? 0) / 5);
    if (bucket > 0) dirty += 1;
    if (bucket >= 14) filthy += 1;
    if (bucket > maxBucket) maxBucket = bucket;
    if (bucket > 0) {
      spatialHash ^= i + 1;
      spatialHash = Math.imul(spatialHash, 16777619);
      spatialHash ^= bucket;
      spatialHash = Math.imul(spatialHash, 16777619);
    }
  }
  return `${dirty}:${filthy}:${maxBucket}:${spatialHash >>> 0}`;
}

function plumbingRenderSignature(state: StationState): string {
  let flooded = 0;
  let maxBucket = 0;
  let spatialHash = 2166136261;
  const floodByTile = state.plumbing?.floodByTile;
  if (!floodByTile) return '0:0:0';
  for (let i = 0; i < floodByTile.length; i++) {
    const bucket = Math.floor((floodByTile[i] ?? 0) / 4);
    if (bucket <= 0) continue;
    flooded += 1;
    maxBucket = Math.max(maxBucket, bucket);
    spatialHash ^= i + 1;
    spatialHash = Math.imul(spatialHash, 16777619);
    spatialHash ^= bucket;
    spatialHash = Math.imul(spatialHash, 16777619);
  }
  return `${flooded}:${maxBucket}:${spatialHash >>> 0}`;
}

// Condition tiers mirror the sim's maintenance thresholds so the world reads
// the same story the panels do: MAINTENANCE_DEBT_WARNING (30) is where output
// actually starts degrading, MAINTENANCE_DEBT_SEVERE (60) is where a module is
// failing. Wear becomes visible well before either, so the player can see a
// machine sliding before it costs them anything.
const MODULE_WEAR_VISIBLE = 12;
const MODULE_WEAR_STRAINED = 30;
const MODULE_WEAR_FAILING = 60;
const MODULE_WEAR_BUCKET = 6;

function moduleConditionRenderSignature(state: StationState): string {
  let worn = 0;
  let strained = 0;
  let worstBucket = 0;
  // A per-module hash is required, not just the aggregate counts: repairing one
  // module while another wears in leaves worn/strained/worst identical, and the
  // decorative layer would keep serving a stale cache where the repair never
  // visibly lifts. Same shape as sanitationRenderSignature's spatial hash.
  let spatialHash = 2166136261;
  for (const debt of state.maintenanceDebts) {
    if (debt.moduleId === undefined || debt.debt < MODULE_WEAR_VISIBLE) continue;
    const bucket = Math.floor(debt.debt / MODULE_WEAR_BUCKET);
    worn += 1;
    if (debt.debt >= MODULE_WEAR_STRAINED) strained += 1;
    worstBucket = Math.max(worstBucket, bucket);
    spatialHash ^= debt.moduleId + 1;
    spatialHash = Math.imul(spatialHash, 16777619);
    spatialHash ^= bucket;
    spatialHash = Math.imul(spatialHash, 16777619);
  }
  return `${worn}:${strained}:${worstBucket}:${spatialHash >>> 0}`;
}

function drawModuleConditionDecal(
  ctx: CanvasRenderingContext2D,
  state: StationState,
  module: StationState['moduleInstances'][number],
  debt: number
): void {
  if (debt < MODULE_WEAR_VISIBLE) return;
  const origin = fromIndex(module.originTile, state.width);
  const x = origin.x * TILE_SIZE;
  const y = origin.y * TILE_SIZE;
  const w = module.width * TILE_SIZE;
  const h = module.height * TILE_SIZE;
  const t = clamp01((debt - MODULE_WEAR_VISIBLE) / (100 - MODULE_WEAR_VISIBLE));
  const failing = debt >= MODULE_WEAR_FAILING;
  const strained = debt >= MODULE_WEAR_STRAINED;
  // Seed on the module alone, never on the debt level: marks must accumulate in
  // place as a machine wears and disappear when it is repaired. Re-seeding per
  // debt bucket made the scratches jump around instead of deepening.
  const seed = hashWeatherSeed(module.id, state.rooms[module.originTile], module.originTile);

  ctx.save();
  ctx.strokeStyle = failing
    ? `rgba(255, 102, 82, ${0.46 + t * 0.32})`
    : `rgba(196, 142, 78, ${0.34 + t * 0.34})`;
  ctx.lineWidth = Math.max(1, Math.round(PX * (0.9 + t)));
  ctx.lineCap = 'round';
  // Marks are added, never replaced, so each tier keeps the previous tier's
  // scratches and layers more on top.
  const marks = failing ? 7 : strained ? 5 : 3;
  for (let i = 0; i < marks; i++) {
    const hx = ((seed >>> ((i * 3) % 21)) & 31) / 31;
    const hy = ((seed >>> ((i * 5 + 7) % 21)) & 31) / 31;
    const sx = x + w * (0.12 + hx * 0.7);
    const sy = y + h * (0.16 + hy * 0.66);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + w * (0.06 + t * 0.07), sy + h * (i % 2 === 0 ? 0.08 : -0.07));
    ctx.stroke();
  }
  if (strained) {
    // Grime/scorch pooling at the base. Widens with debt, so a strained module
    // keeps deepening rather than snapping between two looks.
    ctx.fillStyle = failing ? 'rgba(126, 30, 28, 0.34)' : 'rgba(100, 68, 35, 0.26)';
    ctx.fillRect(x + w * 0.08, y + h * 0.77, w * Math.min(0.78, 0.24 + t * 0.56), Math.max(2, h * 0.07));
  }
  if (failing) {
    // A failing module has to be distinguishable from a merely worn one at a
    // glance and while zoomed out, where individual scratches stop resolving.
    // The inset fault frame survives that zoom-out; the scratches do not.
    const inset = Math.max(1, Math.round(PX * 1.2));
    ctx.strokeStyle = `rgba(255, 118, 96, ${0.5 + t * 0.3})`;
    ctx.lineWidth = Math.max(1, Math.round(PX * 1.1));
    ctx.setLineDash([Math.max(2, Math.round(PX * 2.4)), Math.max(2, Math.round(PX * 2))]);
    ctx.strokeRect(x + inset, y + inset, w - inset * 2, h - inset * 2);
    ctx.setLineDash([]);
  }
  ctx.restore();
}

function drawBerthModuleVisual(ctx: CanvasRenderingContext2D, module: StationState['moduleInstances'][number], px: number, py: number, w: number, h: number): boolean {
  if (
    module.type !== ModuleType.Gangway &&
    module.type !== ModuleType.CustomsCounter &&
    module.type !== ModuleType.CargoArm &&
    module.type !== ModuleType.FuelTank &&
    module.type !== ModuleType.FuelPump &&
    module.type !== ModuleType.PodDock &&
    module.type !== ModuleType.FuelCoupler &&
    module.type !== ModuleType.FreightLocker &&
    module.type !== ModuleType.MaintenanceSocket &&
    module.type !== ModuleType.BerthControl &&
    module.type !== ModuleType.DockingClamp
  ) {
    return false;
  }
  ctx.save();
  ctx.fillStyle = 'rgba(7, 11, 18, 0.82)';
  ctx.strokeStyle = 'rgba(188, 218, 240, 0.72)';
  ctx.lineWidth = Math.max(1, Math.round(PX));
  ctx.fillRect(px + Math.round(2 * PX), py + Math.round(2 * PX), w - Math.round(4 * PX), h - Math.round(4 * PX));
  ctx.strokeRect(px + Math.round(2.5 * PX), py + Math.round(2.5 * PX), w - Math.round(5 * PX), h - Math.round(5 * PX));

  if (module.type === ModuleType.PodDock) {
    ctx.fillStyle = 'rgba(26, 56, 77, 0.98)';
    ctx.fillRect(px + w * 0.08, py + h * 0.19, w * 0.84, h * 0.62);
    ctx.strokeStyle = 'rgba(123, 213, 242, 0.82)';
    ctx.beginPath();
    ctx.moveTo(px + w * 0.18, py + h * 0.36);
    ctx.lineTo(px + w * 0.82, py + h * 0.36);
    ctx.moveTo(px + w * 0.18, py + h * 0.64);
    ctx.lineTo(px + w * 0.82, py + h * 0.64);
    ctx.stroke();
    ctx.fillStyle = '#63f0b2';
    ctx.fillRect(px + w * 0.15, py + h * 0.31, Math.max(2, w * 0.08), Math.max(2, h * 0.14));
  } else if (module.type === ModuleType.FuelCoupler) {
    ctx.fillStyle = 'rgba(28, 72, 72, 0.98)';
    ctx.fillRect(px + w * 0.2, py + h * 0.14, w * 0.48, h * 0.72);
    ctx.strokeStyle = 'rgba(103, 235, 190, 0.85)';
    ctx.beginPath();
    ctx.moveTo(px + w * 0.66, py + h * 0.32);
    ctx.quadraticCurveTo(px + w * 0.9, py + h * 0.4, px + w * 0.78, py + h * 0.7);
    ctx.stroke();
  } else if (module.type === ModuleType.FreightLocker) {
    ctx.fillStyle = 'rgba(75, 57, 39, 0.98)';
    ctx.fillRect(px + w * 0.1, py + h * 0.2, w * 0.8, h * 0.58);
    ctx.strokeStyle = 'rgba(244, 190, 89, 0.84)';
    ctx.strokeRect(px + w * 0.16, py + h * 0.27, w * 0.68, h * 0.42);
  } else if (module.type === ModuleType.MaintenanceSocket) {
    ctx.fillStyle = 'rgba(47, 52, 70, 0.98)';
    ctx.fillRect(px + w * 0.08, py + h * 0.22, w * 0.38, h * 0.56);
    ctx.strokeStyle = 'rgba(244, 186, 74, 0.88)';
    ctx.beginPath();
    ctx.moveTo(px + w * 0.4, py + h * 0.5);
    ctx.lineTo(px + w * 0.72, py + h * 0.32);
    ctx.lineTo(px + w * 0.86, py + h * 0.54);
    ctx.stroke();
  } else if (module.type === ModuleType.BerthControl) {
    ctx.fillStyle = 'rgba(31, 52, 71, 0.98)';
    ctx.fillRect(px + w * 0.19, py + h * 0.1, w * 0.62, h * 0.8);
    ctx.fillStyle = '#72dff2';
    ctx.fillRect(px + w * 0.32, py + h * 0.22, w * 0.36, h * 0.22);
    ctx.strokeStyle = 'rgba(202, 232, 248, 0.8)';
    ctx.strokeRect(px + w * 0.26, py + h * 0.16, w * 0.48, h * 0.66);
  } else if (module.type === ModuleType.DockingClamp) {
    ctx.fillStyle = 'rgba(59, 66, 76, 0.98)';
    ctx.fillRect(px + w * 0.18, py + h * 0.16, w * 0.64, h * 0.68);
    ctx.strokeStyle = 'rgba(218, 234, 244, 0.82)';
    ctx.beginPath();
    ctx.moveTo(px + w * 0.28, py + h * 0.3);
    ctx.lineTo(px + w * 0.64, py + h * 0.3);
    ctx.lineTo(px + w * 0.72, py + h * 0.5);
    ctx.lineTo(px + w * 0.64, py + h * 0.7);
    ctx.lineTo(px + w * 0.28, py + h * 0.7);
    ctx.stroke();
  } else if (module.type === ModuleType.Gangway) {
    const cx = px + w * 0.5;
    ctx.fillStyle = 'rgba(45, 67, 84, 0.95)';
    ctx.fillRect(px + w * 0.28, py + h * 0.12, w * 0.44, h * 0.76);
    ctx.strokeStyle = 'rgba(117, 184, 224, 0.75)';
    ctx.beginPath();
    ctx.moveTo(cx, py + h * 0.18);
    ctx.lineTo(cx, py + h * 0.82);
    ctx.stroke();
    ctx.fillStyle = '#63f0b2';
    ctx.fillRect(px + w * 0.38, py + h * 0.66, Math.max(2, w * 0.24), Math.max(1, h * 0.07));
  } else if (module.type === ModuleType.CustomsCounter) {
    ctx.fillStyle = 'rgba(65, 48, 36, 0.95)';
    ctx.fillRect(px + w * 0.16, py + h * 0.58, w * 0.68, h * 0.2);
    ctx.fillStyle = 'rgba(81, 120, 152, 0.9)';
    ctx.fillRect(px + w * 0.24, py + h * 0.2, w * 0.52, h * 0.28);
    ctx.fillStyle = '#ffd36a';
    ctx.fillRect(px + w * 0.42, py + h * 0.28, w * 0.16, h * 0.08);
    ctx.strokeStyle = 'rgba(227, 239, 255, 0.65)';
    ctx.beginPath();
    ctx.moveTo(px + w * 0.22, py + h * 0.56);
    ctx.lineTo(px + w * 0.78, py + h * 0.56);
    ctx.stroke();
  } else if (module.type === ModuleType.FuelTank) {
    ctx.fillStyle = 'rgba(30, 56, 62, 0.98)';
    ctx.fillRect(px + w * 0.1, py + h * 0.12, w * 0.8, h * 0.76);
    ctx.strokeStyle = 'rgba(86, 226, 190, 0.9)';
    ctx.lineWidth = Math.max(2, Math.round(2 * PX));
    ctx.beginPath();
    ctx.moveTo(px + w * 0.28, py + h * 0.16);
    ctx.lineTo(px + w * 0.28, py + h * 0.84);
    ctx.moveTo(px + w * 0.72, py + h * 0.16);
    ctx.lineTo(px + w * 0.72, py + h * 0.84);
    ctx.stroke();
    ctx.fillStyle = '#63f0b2';
    ctx.fillRect(px + w * 0.4, py + h * 0.36, w * 0.2, h * 0.28);
  } else if (module.type === ModuleType.FuelPump) {
    ctx.fillStyle = 'rgba(38, 48, 56, 0.98)';
    ctx.fillRect(px + w * 0.12, py + h * 0.18, w * 0.44, h * 0.64);
    ctx.strokeStyle = 'rgba(99, 240, 178, 0.9)';
    ctx.lineWidth = Math.max(2, Math.round(2 * PX));
    ctx.beginPath();
    ctx.moveTo(px + w * 0.54, py + h * 0.34);
    ctx.quadraticCurveTo(px + w * 0.78, py + h * 0.28, px + w * 0.84, py + h * 0.68);
    ctx.stroke();
    ctx.fillStyle = '#ffd36a';
    ctx.fillRect(px + w * 0.24, py + h * 0.3, w * 0.18, h * 0.12);
  } else {
    ctx.fillStyle = 'rgba(42, 48, 58, 0.98)';
    ctx.fillRect(px + w * 0.1, py + h * 0.12, w * 0.28, h * 0.24);
    ctx.strokeStyle = 'rgba(244, 186, 74, 0.9)';
    ctx.lineWidth = Math.max(2, Math.round(2 * PX));
    ctx.beginPath();
    ctx.moveTo(px + w * 0.24, py + h * 0.24);
    ctx.lineTo(px + w * 0.58, py + h * 0.42);
    ctx.lineTo(px + w * 0.72, py + h * 0.68);
    ctx.stroke();
    ctx.fillStyle = 'rgba(210, 225, 238, 0.88)';
    ctx.fillRect(px + w * 0.66, py + h * 0.62, w * 0.16, h * 0.16);
    ctx.strokeStyle = 'rgba(109, 169, 209, 0.72)';
    ctx.strokeRect(px + w * 0.08, py + h * 0.48, w * 0.36, h * 0.36);
  }
  ctx.restore();
  return true;
}

function drawModuleVisual(
  ctx: CanvasRenderingContext2D,
  state: StationState,
  module: StationState['moduleInstances'][number],
  spriteAtlas: SpriteAtlas,
  useSprites: boolean
): void {
  const origin = fromIndex(module.originTile, state.width);
  const px = origin.x * TILE_SIZE;
  const py = origin.y * TILE_SIZE;
  const w = module.width * TILE_SIZE;
  const h = module.height * TILE_SIZE;
  if (useSprites) {
    const moduleKey = storageVisualKey(state, module) ?? PORT_INFRASTRUCTURE_SPRITE_KEYS[module.type] ?? MODULE_SPRITE_KEYS[module.type];
    if (module.type === ModuleType.PodDock && drawPodDockAssembly(ctx, state, module, spriteAtlas, moduleKey)) {
      return;
    }
    const exteriorGeometry = portExteriorSpriteGeometry(state, module);
    if (exteriorGeometry && drawSpriteByKey(
      ctx,
      spriteAtlas,
      moduleKey,
      exteriorGeometry.x,
      exteriorGeometry.y,
      exteriorGeometry.width,
      exteriorGeometry.height,
      exteriorGeometry.rotation
    )) {
      return;
    }
    if (module.type === ModuleType.WallLight) {
      const drawX = px - TILE_SIZE * 0.5;
      const drawY = py;
      if (drawSpriteByKey(ctx, spriteAtlas, moduleKey, drawX, drawY, TILE_SIZE * 2, TILE_SIZE, 0)) {
        return;
      }
    }
    const geometry = moduleSpriteDrawGeometry(module, px, py, w, h);
    if (drawSpriteByKey(
      ctx,
      spriteAtlas,
      moduleKey,
      geometry.x,
      geometry.y,
      geometry.width,
      geometry.height,
      geometry.rotation
    )) {
      return;
    }
  }
  if (drawBerthModuleVisual(ctx, module, px, py, w, h)) return;
  ctx.fillStyle = 'rgba(10, 14, 22, 0.78)';
  ctx.fillRect(px + Math.round(3 * PX), py + Math.round(3 * PX), w - Math.round(6 * PX), h - Math.round(6 * PX));
  ctx.strokeStyle = 'rgba(214, 228, 245, 0.72)';
  ctx.strokeRect(px + Math.round(3.5 * PX), py + Math.round(3.5 * PX), w - Math.round(7 * PX), h - Math.round(7 * PX));
  ctx.fillStyle = '#e5f0ff';
  ctx.font = `bold ${Math.round(10 * PX)}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(moduleLetter[module.type] ?? '?', px + w * 0.5, py + h * 0.5);
}

type ModuleSpriteDrawGeometry = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
};

function moduleSpriteDrawGeometry(
  module: StationState['moduleInstances'][number],
  px: number,
  py: number,
  width: number,
  height: number
): ModuleSpriteDrawGeometry {
  const rotation = module.rotation === 90 ? 90 : 0;
  const drawWidth = rotation === 90 ? height : width;
  const drawHeight = rotation === 90 ? width : height;
  return {
    x: px + (width - drawWidth) * 0.5,
    y: py + (height - drawHeight) * 0.5,
    width: drawWidth,
    height: drawHeight,
    rotation
  };
}

/**
 * Dynamic Gate F state sprites live outside the cached decor canvas. The idle
 * fixture remains in that canvas; this pass redraws only a changed full-frame
 * fixture, so a guest taking a stool never repaints the whole station.
 */
function drawFacilitySpriteStateOverlay(
  ctx: CanvasRenderingContext2D,
  state: StationState,
  visibleTiles: { minX: number; maxX: number; minY: number; maxY: number },
  spriteAtlas: SpriteAtlas,
  useSprites: boolean
): void {
  if (!useSprites) return;
  for (const module of state.moduleInstances) {
    if (!FACILITY_SPRITE_VARIANTS[module.type]) continue;
    if (!module.tiles.some((tile) => tileInRange(tile, state, visibleTiles))) continue;
    const baseKey = MODULE_SPRITE_KEYS[module.type];
    const selectedKey = facilitySpriteKeyForModule(state, module, (key) => spriteAtlas.getFrame(key) !== null);
    if (!selectedKey || selectedKey === baseKey) continue;
    const origin = fromIndex(module.originTile, state.width);
    const px = origin.x * TILE_SIZE;
    const py = origin.y * TILE_SIZE;
    const width = module.width * TILE_SIZE;
    const height = module.height * TILE_SIZE;
    const geometry = moduleSpriteDrawGeometry(module, px, py, width, height);
    if (!drawSpriteByKey(
      ctx,
      spriteAtlas,
      selectedKey,
      geometry.x,
      geometry.y,
      geometry.width,
      geometry.height,
      geometry.rotation
    )) continue;
    let debt = 0;
    for (const candidate of state.maintenanceDebts) {
      if (candidate.moduleId === module.id) debt = Math.max(debt, candidate.debt);
    }
    drawModuleConditionDecal(ctx, state, module, debt);
  }
}

export type StructuralPieceVisualState = 'planned' | 'delivered' | 'welding' | 'complete' | 'overloaded' | 'damaged';

/** Purely selects from construction, support validation, and maintenance debt. */
export function structuralPieceVisualState(
  state: StationState,
  piece: StationState['structuralPieces'][number],
  overloadedPieceIds?: ReadonlySet<number>
): StructuralPieceVisualState {
  if (!piece.completed) {
    const site = state.constructionSites.find((candidate) => candidate.structuralPieceId === piece.id);
    if (!site || site.deliveredMaterials + 0.05 < site.requiredMaterials) return 'planned';
    return site.buildProgress > 0 ? 'welding' : 'delivered';
  }
  const damaged = state.maintenanceDebts.some(
    (debt) => debt.key === `structural-piece:${piece.id}` && debt.debt >= MODULE_WEAR_FAILING
  );
  if (damaged && piece.kind === 'reinforced-bulkhead') return 'damaged';
  const overloaded = overloadedPieceIds ?? overloadedStructuralPieceIds(state);
  if (overloaded.has(piece.id)) return 'overloaded';
  return 'complete';
}

export function structuralPieceSpriteKey(
  piece: StationState['structuralPieces'][number],
  visualState: StructuralPieceVisualState
): string {
  const family = piece.kind === 'junction'
    ? STRUCTURAL_SPRITE_KEYS.trussJunction
    : STRUCTURAL_SPRITE_KEYS.reinforcedBulkhead;
  if (visualState === 'damaged' && piece.kind === 'junction') return family.complete;
  return family[visualState as keyof typeof family] ?? family.complete;
}

function drawStructuralPieces(
  ctx: CanvasRenderingContext2D,
  state: StationState,
  spriteAtlas: SpriteAtlas,
  useSprites: boolean,
  visibleTiles: { minX: number; maxX: number; minY: number; maxY: number }
): void {
  if (state.structuralPieces.length === 0) return;
  const liveSupport = validateLiveStructuralInterfaces(state);
  const overloadedPieceIds = overloadedStructuralPieceIds(state, liveSupport);
  for (const piece of state.structuralPieces) {
    if (!piece.tiles.some((tile) => tileInRange(tile, state, visibleTiles))) continue;
    const origin = fromIndex(piece.originTile, state.width);
    const occupied = structuralPieceDimensions(piece.kind, piece.rotation);
    const occupiedWidth = occupied.width * TILE_SIZE;
    const occupiedHeight = occupied.height * TILE_SIZE;
    const drawWidth = piece.rotation === 90 ? occupiedHeight : occupiedWidth;
    const drawHeight = piece.rotation === 90 ? occupiedWidth : occupiedHeight;
    const x = origin.x * TILE_SIZE + (occupiedWidth - drawWidth) * 0.5;
    const y = origin.y * TILE_SIZE + (occupiedHeight - drawHeight) * 0.5;
    const visualState = structuralPieceVisualState(state, piece, overloadedPieceIds);
    const drew = useSprites && drawSpriteByKey(
      ctx,
      spriteAtlas,
      structuralPieceSpriteKey(piece, visualState),
      x,
      y,
      drawWidth,
      drawHeight,
      piece.rotation
    );
    if (!drew) {
      ctx.save();
      ctx.fillStyle = piece.completed ? 'rgba(72, 113, 132, 0.9)' : 'rgba(74, 215, 235, 0.25)';
      ctx.strokeStyle = piece.completed ? '#93d8ed' : '#6fd8ff';
      ctx.setLineDash(piece.completed ? [] : [4 * PX, 3 * PX]);
      ctx.fillRect(origin.x * TILE_SIZE + 2 * PX, origin.y * TILE_SIZE + 2 * PX, occupiedWidth - 4 * PX, occupiedHeight - 4 * PX);
      ctx.strokeRect(origin.x * TILE_SIZE + 2.5 * PX, origin.y * TILE_SIZE + 2.5 * PX, occupiedWidth - 5 * PX, occupiedHeight - 5 * PX);
      ctx.setLineDash([]);
      ctx.restore();
    }
    if (!piece.completed) {
      const site = state.constructionSites.find((candidate) => candidate.structuralPieceId === piece.id);
      if (!site) continue;
      const delivered = site.requiredMaterials > 0 ? site.deliveredMaterials / site.requiredMaterials : 1;
      const built = site.buildWorkRequired > 0 ? site.buildProgress / site.buildWorkRequired : 0;
      const progress = Math.max(0, Math.min(1, site.state === 'building' ? built : delivered));
      ctx.fillStyle = 'rgba(7, 12, 18, 0.88)';
      ctx.fillRect(origin.x * TILE_SIZE + 4 * PX, (origin.y + occupied.height) * TILE_SIZE - 8 * PX, occupiedWidth - 8 * PX, 4 * PX);
      ctx.fillStyle = site.state === 'blocked' ? '#ff7676' : '#6edb8f';
      ctx.fillRect(origin.x * TILE_SIZE + 4 * PX, (origin.y + occupied.height) * TILE_SIZE - 8 * PX, (occupiedWidth - 8 * PX) * progress, 4 * PX);
    }
  }
}

type PortExteriorSpriteGeometry = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
};

function portExteriorSpriteGeometry(
  state: StationState,
  module: StationState['moduleInstances'][number]
): PortExteriorSpriteGeometry | null {
  if (
    module.type !== ModuleType.PodDock &&
    module.type !== ModuleType.FuelCoupler &&
    module.type !== ModuleType.FreightLocker &&
    module.type !== ModuleType.MaintenanceSocket
  ) {
    return null;
  }
  const serviceTile = wallMountedModuleServiceTile(state, module.originTile);
  if (serviceTile === null) return null;
  const origin = fromIndex(module.originTile, state.width);
  const service = fromIndex(serviceTile, state.width);
  const outwardX = Math.sign(origin.x - service.x);
  const outwardY = Math.sign(origin.y - service.y);
  const rotation = outwardY < 0 ? 0 : outwardX > 0 ? 90 : outwardY > 0 ? 180 : 270;
  const definition = MODULE_DEFINITIONS[module.type];
  // Pod Docks are pressure doors mounted in the hull, not appliances hanging
  // outside it. Keep the authored 2x1 airlock flush with the wall; the clamp
  // jaws in the sprite provide the exterior silhouette without shifting the
  // whole module away from its traversable entrance.
  const scale = module.type === ModuleType.PodDock ? 1.02 : 1.12;
  const projection = TILE_SIZE * (module.type === ModuleType.PodDock ? 0.08 : 0.24);
  const sourceWidth = definition.width * TILE_SIZE * scale;
  const sourceHeight = definition.height * TILE_SIZE * scale;
  const centerX = (origin.x + module.width * 0.5) * TILE_SIZE + outwardX * projection;
  const centerY = (origin.y + module.height * 0.5) * TILE_SIZE + outwardY * projection;
  return {
    x: centerX - sourceWidth * 0.5,
    y: centerY - sourceHeight * 0.5,
    width: sourceWidth,
    height: sourceHeight,
    rotation
  };
}

function drawPodDockAssembly(
  ctx: CanvasRenderingContext2D,
  state: StationState,
  module: StationState['moduleInstances'][number],
  spriteAtlas: SpriteAtlas,
  spriteKey: string,
  alpha = 1
): boolean {
  const frame = spriteAtlas.getFrame(spriteKey);
  const serviceTile = wallMountedModuleServiceTile(state, module.originTile);
  if (!frame || !spriteAtlas.image || serviceTile === null) return false;

  const origin = fromIndex(module.originTile, state.width);
  const service = fromIndex(serviceTile, state.width);
  const outwardX = Math.sign(origin.x - service.x);
  const outwardY = Math.sign(origin.y - service.y);
  if (outwardX === 0 && outwardY === 0) return false;

  // The authored 2x1 source contains two independent 1x1 pieces: pressure
  // door on the left, clamp on the right. Keep the door on its traversable
  // hull tile and rotate the clamp into the adjacent exterior tile.
  const halfWidth = frame.w * 0.5;
  const doorFrame: SpriteFrame = { x: frame.x, y: frame.y, w: halfWidth, h: frame.h };
  const clampFrame: SpriteFrame = { x: frame.x + halfWidth, y: frame.y, w: halfWidth, h: frame.h };
  const rotation = outwardX > 0 ? 0 : outwardY > 0 ? 90 : outwardX < 0 ? 180 : 270;
  const doorDrawn = drawSpriteFrame(
    ctx,
    spriteAtlas,
    doorFrame,
    origin.x * TILE_SIZE,
    origin.y * TILE_SIZE,
    TILE_SIZE,
    TILE_SIZE,
    rotation,
    alpha
  );
  const clampDrawn = drawSpriteFrame(
    ctx,
    spriteAtlas,
    clampFrame,
    (origin.x + outwardX) * TILE_SIZE,
    (origin.y + outwardY) * TILE_SIZE,
    TILE_SIZE,
    TILE_SIZE,
    rotation,
    alpha
  );
  return doorDrawn && clampDrawn;
}

function storageVisualKey(
  state: StationState,
  module: StationState['moduleInstances'][number]
): string | null {
  if (module.type !== ModuleType.IntakePallet && module.type !== ModuleType.StorageRack) return null;
  const node = state.itemNodes.find((candidate) => candidate.tileIndex === module.originTile);
  const stored = node
    ? Object.values(node.items).reduce((total, amount) => total + Math.max(0, amount), 0)
    : 0;
  const fillRatio = node && node.capacity > 0 ? stored / node.capacity : 0;
  const fill = fillRatio < 0.05 ? 'empty' : fillRatio < 0.35 ? 'light' : fillRatio < 0.75 ? 'stocked' : 'full';
  return module.type === ModuleType.IntakePallet
    ? `module.intake_pallet.${fill}`
    : `module.storage_rack.${fill}`;
}

function drawDockFacadeOverlay(
  ctx: CanvasRenderingContext2D,
  state: StationState,
  tileIndex: number,
  spriteAtlas: SpriteAtlas
): void {
  const dock = getDockByTile(state, tileIndex);
  if (!dock) return;
  const p = fromIndex(tileIndex, state.width);
  const horizontalRun = dock.facing === 'north' || dock.facing === 'south';
  const hasNeighbor = (x: number, y: number): boolean => {
    if (!inBounds(x, y, state.width, state.height)) return false;
    const neighborDock = getDockByTile(state, y * state.width + x);
    return !!neighborDock && neighborDock.id === dock.id;
  };
  const hasPrev = horizontalRun ? hasNeighbor(p.x - 1, p.y) : hasNeighbor(p.x, p.y - 1);
  const hasNext = horizontalRun ? hasNeighbor(p.x + 1, p.y) : hasNeighbor(p.x, p.y + 1);
  const px = p.x * TILE_SIZE;
  const py = p.y * TILE_SIZE;
  const segment =
    !hasPrev && !hasNext ? 'solo' : !hasPrev ? 'start' : !hasNext ? 'end' : 'middle';
  const spriteKey = DOCK_OVERLAY_SPRITE_KEYS[segment];
  const rotation = DOCK_FACADE_ROTATION[dock.facing];
  drawSpriteByKey(ctx, spriteAtlas, spriteKey, px, py, TILE_SIZE * 2, TILE_SIZE * 2, rotation);
}

type ShipCell = { x: number; y: number };
type ShipSilhouette = {
  hull: ShipCell[];
  cockpit: ShipCell;
  engines: ShipCell[];
};
type ShipCellBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
};
type ShipSilhouetteResolved = {
  hull: ShipCell[];
  cockpit: ShipCell;
  engines: ShipCell[];
  bounds: ShipCellBounds;
};
type ShipPalette = {
  hull: string;
  cockpit: string;
  engine: string;
};

const SHIP_SILHOUETTES: Record<ShipSize, ShipSilhouette[]> = {
  small: [
    {
      hull: [
        { x: 0, y: 0 },
        { x: 1, y: 0 }
      ],
      cockpit: { x: 1, y: 0 },
      engines: [{ x: 0, y: 0 }]
    },
    {
      hull: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 0, y: 1 }
      ],
      cockpit: { x: 1, y: 0 },
      engines: [{ x: 0, y: 1 }]
    },
    {
      hull: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 0, y: -1 }
      ],
      cockpit: { x: 1, y: 0 },
      engines: [{ x: 0, y: -1 }]
    }
  ],
  medium: [
    {
      hull: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
        { x: 0, y: 1 },
        { x: 1, y: 1 },
        { x: 2, y: 1 }
      ],
      cockpit: { x: 2, y: 0 },
      engines: [{ x: 0, y: 0 }, { x: 0, y: 1 }]
    },
    {
      hull: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
        { x: 0, y: 1 },
        { x: 1, y: 1 },
        { x: 2, y: 1 },
        { x: 1, y: -1 }
      ],
      cockpit: { x: 2, y: 0 },
      engines: [{ x: 0, y: 0 }, { x: 0, y: 1 }]
    },
    {
      hull: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
        { x: 0, y: 1 },
        { x: 1, y: 1 },
        { x: 2, y: 1 },
        { x: 1, y: 2 }
      ],
      cockpit: { x: 2, y: 1 },
      engines: [{ x: 0, y: 0 }, { x: 0, y: 1 }]
    }
  ],
  large: [
    {
      hull: [
        { x: 1, y: 1 },
        { x: 2, y: 1 },
        { x: 3, y: 1 },
        { x: 4, y: 1 },
        { x: 5, y: 1 },
        { x: 6, y: 1 },
        { x: 0, y: 2 },
        { x: 1, y: 2 },
        { x: 2, y: 2 },
        { x: 3, y: 2 },
        { x: 4, y: 2 },
        { x: 5, y: 2 },
        { x: 6, y: 2 },
        { x: 1, y: 3 },
        { x: 2, y: 3 },
        { x: 3, y: 3 },
        { x: 4, y: 3 },
        { x: 5, y: 3 },
        { x: 6, y: 3 },
        { x: 3, y: 0 },
        { x: 3, y: 4 }
      ],
      cockpit: { x: 6, y: 2 },
      engines: [{ x: 0, y: 2 }, { x: 1, y: 2 }]
    },
    {
      hull: [
        { x: 1, y: 1 },
        { x: 2, y: 1 },
        { x: 3, y: 1 },
        { x: 4, y: 1 },
        { x: 5, y: 1 },
        { x: 6, y: 1 },
        { x: 0, y: 1 },
        { x: 0, y: 2 },
        { x: 1, y: 2 },
        { x: 2, y: 2 },
        { x: 3, y: 2 },
        { x: 4, y: 2 },
        { x: 5, y: 2 },
        { x: 6, y: 2 },
        { x: 1, y: 3 },
        { x: 2, y: 3 },
        { x: 3, y: 3 },
        { x: 4, y: 3 },
        { x: 5, y: 3 },
        { x: 6, y: 3 },
        { x: 4, y: 0 },
        { x: 3, y: 4 }
      ],
      cockpit: { x: 6, y: 2 },
      engines: [{ x: 0, y: 1 }, { x: 0, y: 2 }]
    },
    {
      hull: [
        { x: 1, y: 1 },
        { x: 2, y: 1 },
        { x: 3, y: 1 },
        { x: 4, y: 1 },
        { x: 5, y: 1 },
        { x: 6, y: 1 },
        { x: 0, y: 2 },
        { x: 1, y: 2 },
        { x: 2, y: 2 },
        { x: 3, y: 2 },
        { x: 4, y: 2 },
        { x: 5, y: 2 },
        { x: 6, y: 2 },
        { x: 0, y: 3 },
        { x: 1, y: 3 },
        { x: 2, y: 3 },
        { x: 3, y: 3 },
        { x: 4, y: 3 },
        { x: 5, y: 3 },
        { x: 6, y: 3 },
        { x: 3, y: 0 },
        { x: 4, y: 4 }
      ],
      cockpit: { x: 6, y: 2 },
      engines: [{ x: 0, y: 2 }, { x: 0, y: 3 }]
    }
  ]
};

function laneRotation(lane: SpaceLane): 0 | 90 | 180 | 270 {
  if (lane === 'east') return 0;
  if (lane === 'south') return 90;
  if (lane === 'west') return 180;
  return 270;
}

function rotateCell(cell: ShipCell, rotation: 0 | 90 | 180 | 270): ShipCell {
  if (rotation === 0) return { x: cell.x, y: cell.y };
  if (rotation === 90) return { x: cell.y, y: -cell.x };
  if (rotation === 180) return { x: -cell.x, y: -cell.y };
  return { x: -cell.y, y: cell.x };
}

function uniqueShipCells(cells: ShipCell[]): ShipCell[] {
  const out: ShipCell[] = [];
  const seen = new Set<string>();
  for (const cell of cells) {
    const key = `${cell.x},${cell.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cell);
  }
  return out;
}

function computeShipCellBounds(cells: ShipCell[]): ShipCellBounds | null {
  if (cells.length <= 0) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const cell of cells) {
    if (cell.x < minX) minX = cell.x;
    if (cell.y < minY) minY = cell.y;
    if (cell.x > maxX) maxX = cell.x;
    if (cell.y > maxY) maxY = cell.y;
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1
  };
}

function hashShipVariant(shipId: number, shipType: ShipType, size: ShipSize): number {
  const seed = `${shipId}|${shipType}|${size}`;
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pickShipVariant(shipId: number, shipType: ShipType, size: ShipSize): ShipSilhouette {
  const variants = SHIP_SILHOUETTES[size];
  return variants[hashShipVariant(shipId, shipType, size) % variants.length];
}

function fallbackSilhouette(size: ShipSize): ShipSilhouette {
  if (size === 'small') {
    return {
      hull: [
        { x: 0, y: 0 },
        { x: 1, y: 0 }
      ],
      cockpit: { x: 1, y: 0 },
      engines: [{ x: 0, y: 0 }]
    };
  }
  if (size === 'medium') {
    return {
      hull: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
        { x: 0, y: 1 },
        { x: 1, y: 1 },
        { x: 2, y: 1 }
      ],
      cockpit: { x: 2, y: 0 },
      engines: [{ x: 0, y: 0 }, { x: 0, y: 1 }]
    };
  }
  return {
    hull: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 4, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 3, y: 1 },
      { x: 4, y: 1 },
      { x: 0, y: 2 },
      { x: 1, y: 2 },
      { x: 2, y: 2 },
      { x: 3, y: 2 },
      { x: 4, y: 2 }
    ],
    cockpit: { x: 4, y: 1 },
    engines: [{ x: 0, y: 1 }]
  };
}

function transformSilhouette(
  silhouette: ShipSilhouette,
  rotation: 0 | 90 | 180 | 270
): ShipSilhouetteResolved | null {
  const rotatedHull = uniqueShipCells(silhouette.hull.map((cell) => rotateCell(cell, rotation)));
  const rotatedCockpit = rotateCell(silhouette.cockpit, rotation);
  const rotatedEngines = uniqueShipCells(silhouette.engines.map((cell) => rotateCell(cell, rotation)));
  const allCells = [...rotatedHull, rotatedCockpit, ...rotatedEngines];
  const allBounds = computeShipCellBounds(allCells);
  if (!allBounds) return null;
  const normalize = (cell: ShipCell): ShipCell => ({ x: cell.x - allBounds.minX, y: cell.y - allBounds.minY });
  const hull = uniqueShipCells(rotatedHull.map(normalize));
  const cockpit = normalize(rotatedCockpit);
  const engines = uniqueShipCells(rotatedEngines.map(normalize));
  const bounds = computeShipCellBounds(hull);
  if (!bounds) return null;
  return { hull, cockpit, engines, bounds };
}

function resolveShipSilhouette(
  shipId: number,
  shipType: ShipType,
  size: ShipSize,
  lane: SpaceLane
): ShipSilhouetteResolved {
  const rotation = laneRotation(lane);
  const variant = pickShipVariant(shipId, shipType, size);
  const resolved = transformSilhouette(variant, rotation);
  if (resolved) return resolved;
  const fallback = transformSilhouette(fallbackSilhouette(size), rotation);
  if (fallback) return fallback;
  return {
    hull: [{ x: 0, y: 0 }],
    cockpit: { x: 0, y: 0 },
    engines: [{ x: 0, y: 0 }],
    bounds: {
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
      width: 1,
      height: 1
    }
  };
}

function isDockPodShip(ship: StationState['arrivingShips'][number]): boolean {
  return ship.assignedDockId !== null && (ship.assignedBerthAnchor ?? null) === null;
}

function shipPalette(shipType: ShipType, docked: boolean): ShipPalette {
  if (shipType === 'trader') {
    return docked
      ? { hull: '#6ecfff', cockpit: '#dff6ff', engine: '#99e6ff' }
      : { hull: '#a6e4ff', cockpit: '#ebf9ff', engine: '#c3f0ff' };
  }
  if (shipType === 'industrial') {
    return docked
      ? { hull: '#ffb482', cockpit: '#ffe7c8', engine: '#ffc997' }
      : { hull: '#ffd2ad', cockpit: '#fff0df', engine: '#ffe2c3' };
  }
  if (shipType === 'military') {
    return docked
      ? { hull: '#8fa0b7', cockpit: '#d7deea', engine: '#b4c2d8' }
      : { hull: '#b8c4d6', cockpit: '#e8edf6', engine: '#cfd8e6' };
  }
  if (shipType === 'colonist') {
    return docked
      ? { hull: '#8ed8ae', cockpit: '#e2f6ea', engine: '#b6e8c9' }
      : { hull: '#b9ead0', cockpit: '#eefaf3', engine: '#cdeedb' };
  }
  return docked
    ? { hull: '#ffd447', cockpit: '#fff3b8', engine: '#ffe57f' }
    : { hull: '#ffea8a', cockpit: '#fff7cd', engine: '#fff1ad' };
}

function projectShipHullImage(hullVariant: ShipHullVariant, shipType: ShipType): HTMLImageElement | null {
  const key = `hull:${hullVariant}`;
  let image = shipImageCache.get(key);
  if (!image) {
    image = new Image();
    image.src = `${shipHullAssetPath(hullVariant)}?v=${SHIP_ASSET_VERSION}`;
    shipImageCache.set(key, image);
  }
  if (!image.complete) return null;
  if (image.naturalWidth > 0 && image.naturalHeight > 0) return image;
  // Older purpose art is intentionally only the failure fallback. A durable
  // hull identity is the normal visual contract for a live traffic call.
  const legacyKind = shipHullProfile(hullVariant).interfaceKind;
  const legacyKey = `legacy:${legacyKind}:${shipType}`;
  let legacy = shipImageCache.get(legacyKey);
  if (!legacy) {
    legacy = new Image();
    legacy.src = `assets/ships/ship-${legacyKind}-${shipType}.png?v=${SHIP_ASSET_VERSION}`;
    shipImageCache.set(legacyKey, legacy);
  }
  return legacy.complete && legacy.naturalWidth > 0 && legacy.naturalHeight > 0 ? legacy : null;
}

function drawRotatedImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  center: { x: number; y: number },
  width: number,
  height: number,
  angle: number
): void {
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.translate(center.x, center.y);
  ctx.rotate(angle);
  ctx.drawImage(image, -width * 0.5, -height * 0.5, width, height);
  ctx.restore();
}

function laneUnitVector(lane: SpaceLane): { x: number; y: number } {
  if (lane === 'north') return { x: 0, y: -1 };
  if (lane === 'south') return { x: 0, y: 1 };
  if (lane === 'west') return { x: -1, y: 0 };
  return { x: 1, y: 0 };
}

function laneAngleRad(lane: SpaceLane): number {
  if (lane === 'north') return -Math.PI * 0.5;
  if (lane === 'south') return Math.PI * 0.5;
  if (lane === 'west') return Math.PI;
  return 0;
}

function shipTransitOffset(ship: StationState['arrivingShips'][number]): number {
  if (ship.stage !== 'approach' && ship.stage !== 'depart') return 0;
  const t = Math.min(1, ship.stageTime / SHIP_TRANSIT_VISUAL_SEC);
  return ship.stage === 'approach' ? 1 - t : t;
}

function bayTileBounds(state: StationState, bayTiles: number[]): { minX: number; maxX: number; minY: number; maxY: number } | null {
  if (bayTiles.length <= 0) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const tile of bayTiles) {
    const { x, y } = fromIndex(tile, state.width);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, maxX, minY, maxY };
}

function neighborInLane(tile: number, state: StationState, lane: SpaceLane): { x: number; y: number } {
  const pos = fromIndex(tile, state.width);
  const v = laneUnitVector(lane);
  return { x: pos.x + v.x, y: pos.y + v.y };
}

function berthOpenTilesForLane(state: StationState, bayTiles: number[], lane: SpaceLane): number[] {
  return bayTiles.filter((tile) => {
    const n = neighborInLane(tile, state, lane);
    if (!inBounds(n.x, n.y, state.width, state.height)) return true;
    return state.tiles[n.y * state.width + n.x] === TileType.Space;
  });
}

function pickBerthVisualLane(state: StationState, ship: StationState['arrivingShips'][number]): SpaceLane {
  const lanes: SpaceLane[] = ['north', 'east', 'south', 'west'];
  let bestLane = ship.lane;
  let bestScore = -1;
  for (const lane of lanes) {
    const score = berthOpenTilesForLane(state, ship.bayTiles, lane).length;
    if (score > bestScore || (score === bestScore && lane === ship.lane)) {
      bestLane = lane;
      bestScore = score;
    }
  }
  return bestLane;
}

function averageTileCenterPx(state: StationState, tiles: number[]): { x: number; y: number } {
  if (tiles.length <= 0) {
    return { x: state.width * TILE_SIZE * 0.5, y: state.height * TILE_SIZE * 0.5 };
  }
  let sx = 0;
  let sy = 0;
  for (const tile of tiles) {
    const p = fromIndex(tile, state.width);
    sx += (p.x + 0.5) * TILE_SIZE;
    sy += (p.y + 0.5) * TILE_SIZE;
  }
  return { x: sx / tiles.length, y: sy / tiles.length };
}

function berthDockingContact(
  state: StationState,
  ship: StationState['arrivingShips'][number]
): { lane: SpaceLane; point: { x: number; y: number }; spanPx: number } {
  const bounds = bayTileBounds(state, ship.bayTiles);
  const lane = pickBerthVisualLane(state, ship);
  const openTiles = berthOpenTilesForLane(state, ship.bayTiles, lane);
  const center = averageTileCenterPx(state, openTiles.length > 0 ? openTiles : ship.bayTiles);
  if (!bounds) return { lane, point: center, spanPx: TILE_SIZE * 3 };

  if (lane === 'east') {
    return {
      lane,
      point: { x: (bounds.maxX + 1) * TILE_SIZE, y: center.y },
      spanPx: (bounds.maxY - bounds.minY + 1) * TILE_SIZE
    };
  }
  if (lane === 'west') {
    return {
      lane,
      point: { x: bounds.minX * TILE_SIZE, y: center.y },
      spanPx: (bounds.maxY - bounds.minY + 1) * TILE_SIZE
    };
  }
  if (lane === 'south') {
    return {
      lane,
      point: { x: center.x, y: (bounds.maxY + 1) * TILE_SIZE },
      spanPx: (bounds.maxX - bounds.minX + 1) * TILE_SIZE
    };
  }
  return {
    lane,
    point: { x: center.x, y: bounds.minY * TILE_SIZE },
    spanPx: (bounds.maxX - bounds.minX + 1) * TILE_SIZE
  };
}

function dockHatchContact(
  state: StationState,
  ship: StationState['arrivingShips'][number]
): { lane: SpaceLane; point: { x: number; y: number } } {
  const dock = ship.assignedDockId === null ? null : state.docks.find((entry) => entry.id === ship.assignedDockId) ?? null;
  if (!dock) {
    return {
      lane: ship.lane,
      point: { x: ship.bayCenterX * TILE_SIZE, y: ship.bayCenterY * TILE_SIZE }
    };
  }
  const bounds = bayTileBounds(state, dock.tiles);
  const center = averageTileCenterPx(state, dock.tiles);
  if (!bounds) return { lane: dock.facing, point: center };
  if (dock.facing === 'east') return { lane: dock.facing, point: { x: (bounds.maxX + 1) * TILE_SIZE, y: center.y } };
  if (dock.facing === 'west') return { lane: dock.facing, point: { x: bounds.minX * TILE_SIZE, y: center.y } };
  if (dock.facing === 'south') return { lane: dock.facing, point: { x: center.x, y: (bounds.maxY + 1) * TILE_SIZE } };
  return { lane: dock.facing, point: { x: center.x, y: bounds.minY * TILE_SIZE } };
}

function drawDockingCollar(ctx: CanvasRenderingContext2D, point: { x: number; y: number }, accent: string, radius: number): void {
  ctx.save();
  ctx.fillStyle = 'rgba(7, 17, 29, 0.96)';
  ctx.strokeStyle = 'rgba(206, 226, 240, 0.95)';
  ctx.lineWidth = Math.max(1, radius * 0.22);
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(1, radius * 0.12);
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius * 0.62, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function capsulePath(ctx: CanvasRenderingContext2D, length: number, width: number): void {
  const halfL = length * 0.5;
  const halfW = width * 0.5;
  const r = Math.min(halfW, halfL);
  ctx.beginPath();
  ctx.moveTo(-halfL + r, -halfW);
  ctx.lineTo(halfL - r, -halfW);
  ctx.quadraticCurveTo(halfL, -halfW, halfL, 0);
  ctx.quadraticCurveTo(halfL, halfW, halfL - r, halfW);
  ctx.lineTo(-halfL + r, halfW);
  ctx.quadraticCurveTo(-halfL, halfW, -halfL, 0);
  ctx.quadraticCurveTo(-halfL, -halfW, -halfL + r, -halfW);
  ctx.closePath();
}

function drawPodHull(
  ctx: CanvasRenderingContext2D,
  center: { x: number; y: number },
  lane: SpaceLane,
  length: number,
  width: number,
  palette: ShipPalette,
  docked: boolean
): void {
  const angle = laneAngleRad(lane);
  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.rotate(angle);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
  capsulePath(ctx, length, width);
  ctx.translate(0, TILE_SIZE * 0.08);
  ctx.fill();
  ctx.translate(0, -TILE_SIZE * 0.08);
  ctx.fillStyle = docked ? palette.hull : 'rgba(185, 213, 235, 0.9)';
  ctx.strokeStyle = 'rgba(232, 245, 255, 0.92)';
  ctx.lineWidth = Math.max(1, TILE_SIZE * 0.055);
  capsulePath(ctx, length, width);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = palette.cockpit;
  ctx.fillRect(length * 0.12, -width * 0.23, length * 0.23, width * 0.46);
  ctx.fillStyle = palette.engine;
  ctx.fillRect(-length * 0.42, -width * 0.18, length * 0.13, width * 0.36);
  ctx.strokeStyle = 'rgba(8, 18, 30, 0.55)';
  ctx.lineWidth = Math.max(1, TILE_SIZE * 0.035);
  for (let x = -length * 0.18; x <= length * 0.18; x += length * 0.18) {
    ctx.beginPath();
    ctx.moveTo(x, -width * 0.36);
    ctx.lineTo(x, width * 0.36);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBerthShipHull(
  ctx: CanvasRenderingContext2D,
  center: { x: number; y: number },
  angle: number,
  length: number,
  width: number,
  palette: ShipPalette,
  shipType: ShipType,
  docked: boolean
): void {
  ctx.save();
  ctx.translate(center.x, center.y + TILE_SIZE * 0.12);
  ctx.rotate(angle);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.26)';
  capsulePath(ctx, length, width);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.rotate(angle);
  const hullFill = docked ? palette.hull : 'rgba(190, 216, 238, 0.92)';
  ctx.fillStyle = hullFill;
  ctx.strokeStyle = 'rgba(235, 248, 255, 0.95)';
  ctx.lineWidth = Math.max(1, TILE_SIZE * 0.07);
  capsulePath(ctx, length, width);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = 'rgba(10, 24, 38, 0.24)';
  ctx.fillRect(-length * 0.38, -width * 0.18, length * 0.76, width * 0.36);
  ctx.fillStyle = palette.cockpit;
  ctx.fillRect(length * 0.24, -width * 0.25, length * 0.18, width * 0.5);
  ctx.fillStyle = palette.engine;
  ctx.fillRect(-length * 0.44, -width * 0.28, length * 0.12, width * 0.2);
  ctx.fillRect(-length * 0.44, width * 0.08, length * 0.12, width * 0.2);

  ctx.strokeStyle = 'rgba(8, 18, 30, 0.42)';
  ctx.lineWidth = Math.max(1, TILE_SIZE * 0.045);
  const stripeCount = shipType === 'industrial' ? 7 : shipType === 'military' ? 5 : 6;
  for (let i = 1; i < stripeCount; i++) {
    const x = -length * 0.36 + (length * 0.72 * i) / stripeCount;
    ctx.beginPath();
    ctx.moveTo(x, -width * 0.34);
    ctx.lineTo(x, width * 0.34);
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(235, 250, 255, 0.8)';
  const windowCount = shipType === 'tourist' || shipType === 'colonist' ? 9 : 5;
  for (let i = 0; i < windowCount; i++) {
    const x = -length * 0.24 + (length * 0.48 * i) / Math.max(1, windowCount - 1);
    ctx.fillRect(x - TILE_SIZE * 0.055, -width * 0.07, TILE_SIZE * 0.11, TILE_SIZE * 0.11);
  }
  ctx.restore();
}

function drawDockedPodShip(ctx: CanvasRenderingContext2D, state: StationState, ship: StationState['arrivingShips'][number]): void {
  const contact = dockHatchContact(state, ship);
  const outward = laneUnitVector(contact.lane);
  const palette = shipPalette(ship.shipType, ship.stage === 'docked');
  const sprite = projectShipHullImage(ship.hullVariant, ship.shipType);
  const length = TILE_SIZE * 2.35;
  const width = sprite ? length / Math.max(1, sprite.naturalWidth / sprite.naturalHeight) : TILE_SIZE * 1.08;
  const transit = shipTransitOffset(ship);
  const center = {
    x: contact.point.x + outward.x * (length * 0.44 + transit * TILE_SIZE * 2.1),
    y: contact.point.y + outward.y * (length * 0.44 + transit * TILE_SIZE * 2.1)
  };

  if (ship.stage === 'docked') {
    drawDockingCollar(ctx, contact.point, palette.engine, Math.max(3, TILE_SIZE * 0.18));
  }
  if (sprite) {
    drawRotatedImage(ctx, sprite, center, length, width, laneAngleRad(contact.lane));
  } else {
    drawPodHull(ctx, center, contact.lane, length, width, palette, ship.stage === 'docked');
  }
}

function drawDockedBerthShip(ctx: CanvasRenderingContext2D, state: StationState, ship: StationState['arrivingShips'][number]): void {
  const bounds = bayTileBounds(state, ship.bayTiles);
  if (!bounds) return;
  const facility = ship.assignedBerthAnchor === null || ship.assignedBerthAnchor === undefined
    ? null
    : getBerthFacilityAt(state, ship.assignedBerthAnchor);
  const useUShapedEnvelope = facility?.geometry === 'u-shaped';
  const bayRect = {
    x: bounds.minX * TILE_SIZE,
    y: bounds.minY * TILE_SIZE,
    w: (bounds.maxX - bounds.minX + 1) * TILE_SIZE,
    h: (bounds.maxY - bounds.minY + 1) * TILE_SIZE
  };
  const palette = shipPalette(ship.shipType, ship.stage === 'docked');
  const sprite = projectShipHullImage(ship.hullVariant, ship.shipType);
  const transit = shipTransitOffset(ship);
  const inset = Math.max(2, TILE_SIZE * 0.08);
  const targetW = Math.max(TILE_SIZE, bayRect.w - inset * 2);
  const targetH = Math.max(TILE_SIZE, bayRect.h - inset * 2);
  const visualLane = pickBerthVisualLane(state, ship);
  // U-shaped bays are a vessel envelope bounded by their service rails, not
  // a rectangular room to clip. Their open face establishes the ship axis.
  // Generated berth hulls are authored nose-to-tail vertically. Align that
  // native axis with the actual open berth face instead of stretching each
  // silhouette into a generic bay rectangle.
  const bayIsWide = visualLane === 'east' || visualLane === 'west';
  const angle = visualLane === 'north'
    ? 0
    : visualLane === 'east'
      ? Math.PI * 0.5
      : visualLane === 'south'
        ? Math.PI
        : -Math.PI * 0.5;
  const imageAspect = sprite
    ? sprite.naturalWidth / Math.max(1, sprite.naturalHeight)
    : ship.size === 'large' ? 0.62 : ship.size === 'medium' ? 0.68 : 0.78;
  const fitAspect = bayIsWide ? 1 / imageAspect : imageAspect;
  let drawW = targetW;
  let drawH = drawW / fitAspect;
  if (drawH > targetH) {
    drawH = targetH;
    drawW = drawH * fitAspect;
  }
  // Make the bay read as occupied, even when the generated sprite has a lot
  // of transparent padding around its docking collar.
  if (!bayIsWide && drawH < targetH * 0.92) {
    const grow = Math.min(targetH / drawH, 1.12);
    drawH *= grow;
    drawW *= grow;
  } else if (bayIsWide && drawW < targetW * 0.92) {
    const grow = Math.min(targetW / drawW, 1.12);
    drawH *= grow;
    drawW *= grow;
  }
  const outward = laneUnitVector(visualLane);
  const center = {
    x: bayRect.x + bayRect.w * 0.5 + outward.x * transit * TILE_SIZE * 1.6,
    y: bayRect.y + bayRect.h * 0.5 + outward.y * transit * TILE_SIZE * 1.6
  };

  ctx.save();
  if (!useUShapedEnvelope) {
    // Compatibility path: old saves used a painted rectangular berth and
    // expect the original clipped vessel placement.
    ctx.beginPath();
    ctx.rect(bayRect.x + inset * 0.4, bayRect.y + inset * 0.4, bayRect.w - inset * 0.8, bayRect.h - inset * 0.8);
    ctx.clip();
  }
  if (sprite) {
    drawRotatedImage(ctx, sprite, center, drawW, drawH, angle);
  } else {
    drawBerthShipHull(
      ctx,
      center,
      angle,
      bayIsWide ? drawW : drawH,
      bayIsWide ? drawH : drawW,
      palette,
      ship.shipType,
      ship.stage === 'docked'
    );
  }
  ctx.restore();

  const contact = berthDockingContact(state, ship);
  if (ship.stage === 'docked') drawDockingCollar(ctx, contact.point, palette.engine, Math.max(3, TILE_SIZE * 0.16));
}

interface BerthChipRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function berthChipOverlaps(a: BerthChipRect, b: BerthChipRect): boolean {
  const gap = Math.max(2, TILE_SIZE * 0.12);
  return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
}

function placeBerthChip(
  state: StationState,
  bayTiles: number[],
  width: number,
  height: number,
  occupied: BerthChipRect[]
): BerthChipRect | null {
  const bounds = bayTileBounds(state, bayTiles);
  if (!bounds) return null;
  const worldW = state.width * TILE_SIZE;
  const worldH = state.height * TILE_SIZE;
  const bayX = bounds.minX * TILE_SIZE;
  const bayY = bounds.minY * TILE_SIZE;
  const bayW = (bounds.maxX - bounds.minX + 1) * TILE_SIZE;
  const bayH = (bounds.maxY - bounds.minY + 1) * TILE_SIZE;
  const gap = Math.max(3, TILE_SIZE * 0.16);
  const centeredX = bayX + (bayW - width) * 0.5;
  const centeredY = bayY + (bayH - height) * 0.5;
  const candidates: BerthChipRect[] = [
    { x: centeredX, y: bayY + bayH + gap, w: width, h: height },
    { x: centeredX, y: bayY - height - gap, w: width, h: height },
    { x: bayX + bayW + gap, y: centeredY, w: width, h: height },
    { x: bayX - width - gap, y: centeredY, w: width, h: height }
  ];
  for (let row = 1; row <= 4; row++) {
    candidates.push({ x: centeredX, y: bayY + bayH + gap + row * (height + gap), w: width, h: height });
    candidates.push({ x: centeredX, y: bayY - height - gap - row * (height + gap), w: width, h: height });
  }
  for (const candidate of candidates) {
    candidate.x = Math.max(gap, Math.min(worldW - candidate.w - gap, candidate.x));
    candidate.y = Math.max(gap, Math.min(worldH - candidate.h - gap, candidate.y));
    if (!occupied.some((entry) => berthChipOverlaps(candidate, entry))) {
      occupied.push(candidate);
      return candidate;
    }
  }
  return null;
}

function portPromiseCompletion(promises: StationState['portOps']['contracts'][number]['promises']): number {
  const target = promises.reduce((sum, promise) => sum + Math.max(0, promise.target), 0);
  if (target <= 0) return 1;
  const completed = promises.reduce(
    (sum, promise) => sum + Math.min(Math.max(0, promise.completed), Math.max(0, promise.target)),
    0
  );
  return Math.max(0, Math.min(1, completed / target));
}

function drawBerthChip(
  ctx: CanvasRenderingContext2D,
  rect: BerthChipRect,
  topLine: string,
  bottomLine: string,
  accent: string,
  alpha: number
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(5, 12, 20, 0.94)';
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(1, TILE_SIZE * 0.045);
  ctx.beginPath();
  ctx.roundRect(rect.x, rect.y, rect.w, rect.h, Math.max(2, TILE_SIZE * 0.12));
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.fillRect(rect.x, rect.y, Math.max(2, TILE_SIZE * 0.13), rect.h);
  const padX = Math.max(5, TILE_SIZE * 0.28);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${Math.max(8, Math.round(TILE_SIZE * 0.38))}px monospace`;
  ctx.fillStyle = '#eff7ff';
  ctx.fillText(topLine, rect.x + padX, rect.y + rect.h * 0.32);
  ctx.font = `${Math.max(7, Math.round(TILE_SIZE * 0.32))}px monospace`;
  ctx.fillStyle = accent;
  ctx.fillText(bottomLine, rect.x + padX, rect.y + rect.h * 0.72);
  ctx.restore();
}

function drawBerthInformationChips(
  ctx: CanvasRenderingContext2D,
  state: StationState,
  occupied: BerthChipRect[] = []
): BerthChipRect[] {
  const fontSize = Math.max(8, Math.round(TILE_SIZE * 0.38));
  const chipHeight = Math.max(24, TILE_SIZE * 1.18);
  const horizontalPadding = Math.max(14, TILE_SIZE * 0.7);

  ctx.save();
  ctx.font = `bold ${fontSize}px monospace`;
  for (const ship of state.arrivingShips) {
    if ((ship.assignedBerthAnchor ?? null) === null || ship.stage !== 'docked') continue;
    const contract = ship.portContractId === undefined
      ? state.portOps.contracts.find((entry) => entry.shipId === ship.id) ?? null
      : state.portOps.contracts.find((entry) => entry.id === ship.portContractId) ?? null;
    const callsign = contract?.callsign ?? ship.portManifest?.callsign ?? `SHIP ${ship.id}`;
    const topLine = `${callsign} | ${ship.shipType.toUpperCase()}`;
    const completion = contract ? portPromiseCompletion(contract.promises) : ship.portTurnaround?.fulfillmentRatio ?? 0;
    const plannedDeparture = ship.plannedDepartureAt ?? contract?.plannedDepartureAt ?? contract?.hardDepartureAt;
    const seconds = plannedDeparture === undefined ? null : Math.max(0, Math.ceil(plannedDeparture - state.now));
    const phase = (ship.visitPhase ?? 'visit-service').replace('-', ' ').toUpperCase();
    const bottomLine = ship.visitScheduleReason === 'service-failure'
      ? 'EARLY RECALL | SERVICES FAILED'
      : ship.visitScheduleReason === 'remaining-work'
        ? `EXTENDED | WORK REMAINS${seconds === null ? '' : ` | ${seconds}S`}`
        : `${phase} | ${ship.passengersTotal} PAX${seconds === null ? '' : ` | ${seconds}S`} | ${Math.round(completion * 100)}%`;
    const accent = ship.visitScheduleReason === 'service-failure'
      ? '#ff7a76'
      : completion >= 0.9
        ? '#71e5a0'
        : completion >= 0.65
          ? '#ffd36a'
          : '#72bff2';
    ctx.font = `bold ${fontSize}px monospace`;
    const width = Math.max(
      TILE_SIZE * 5.2,
      Math.min(TILE_SIZE * 10.5, Math.max(ctx.measureText(topLine).width, ctx.measureText(bottomLine).width) + horizontalPadding)
    );
    const rect = placeBerthChip(state, ship.bayTiles, width, chipHeight, occupied);
    if (rect) drawBerthChip(ctx, rect, topLine, bottomLine, accent, 1);
  }

  const resultLifetime = 8;
  const recentSettlements = state.portOps.settlements
    .filter((settlement) => state.now >= settlement.settledAt && state.now - settlement.settledAt < resultLifetime)
    .sort((a, b) => b.settledAt - a.settledAt);
  for (const settlement of recentSettlements) {
    const contract = state.portOps.contracts.find((entry) => entry.id === settlement.contractId);
    if (!contract) continue;
    const cluster = state.derived.clusterByTile.get(contract.assignedBerthAnchor)?.cluster;
    if (!cluster || cluster.length === 0) continue;
    const completion = portPromiseCompletion(settlement.promises);
    const payout = settlement.payoutCredits + settlement.passengerSpendingCredits;
    const grade = completion >= 0.95 ? 'A' : completion >= 0.8 ? 'B' : completion >= 0.6 ? 'C' : 'D';
    const topLine = `${settlement.callsign} DEPARTED`;
    const bottomLine = `${grade} | ${Math.round(completion * 100)}% | +${payout}c`;
    const accent = completion >= 0.995 ? '#71e5a0' : completion >= 0.75 ? '#ffd36a' : '#ff7a76';
    const age = state.now - settlement.settledAt;
    const alpha = Math.max(0, Math.min(1, (resultLifetime - age) / 2));
    ctx.font = `bold ${fontSize}px monospace`;
    const width = Math.max(
      TILE_SIZE * 5.2,
      Math.min(TILE_SIZE * 10.5, Math.max(ctx.measureText(topLine).width, ctx.measureText(bottomLine).width) + horizontalPadding)
    );
    const rect = placeBerthChip(state, cluster, width, chipHeight, occupied);
    if (rect) drawBerthChip(ctx, rect, topLine, bottomLine, accent, alpha);
  }
  ctx.restore();
  return occupied;
}

function drawApproachWaitingChips(
  ctx: CanvasRenderingContext2D,
  state: StationState,
  occupied: BerthChipRect[]
): void {
  const descriptors = new Map(getDockingSlotDescriptors(state).map((descriptor) => [descriptor.id, descriptor]));
  // The held reservation is a live claim on shared space, so the chip is sized
  // from a fixed template and animated instead of redrawn at a new width every
  // second — a jittering chip would move under the berth it belongs to.
  const widthTemplate = 'WAITING 000S: APPROACH OCCUPIED';
  const fontSize = Math.max(7, Math.round(TILE_SIZE * 0.29));
  const height = Math.max(18, Math.round(TILE_SIZE * 0.78));
  const padding = Math.max(9, Math.round(TILE_SIZE * 0.42));
  const now = renderClockSeconds();
  const dash = Math.max(3, TILE_SIZE * 0.22);
  ctx.save();
  ctx.font = `bold ${fontSize}px monospace`;
  const width = Math.max(TILE_SIZE * 4.6, Math.min(TILE_SIZE * 9.5, ctx.measureText(widthTemplate).width + padding * 2));
  for (const ship of state.arrivingShips) {
    if (ship.approachCommitment?.status !== 'waiting') continue;
    const descriptor = descriptors.get(ship.approachCommitment.slotId);
    if (!descriptor) continue;
    const rect = placeBerthChip(state, descriptor.hullTiles, width, height, occupied);
    if (!rect) continue;
    const heldSec = Math.max(0, Math.floor(state.now - ship.approachCommitment.queuedAt));
    const pulse = 0.72 + Math.sin(now * 2.6 + ship.id) * 0.24;
    ctx.fillStyle = 'rgba(28, 20, 7, 0.94)';
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.w, rect.h, Math.max(2, TILE_SIZE * 0.1));
    ctx.fill();
    // Marching dashes make the hold read as an active claim rather than a
    // frozen box; the phase is render-clock driven so it never stalls with the
    // simulation tick.
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = '#ffd36a';
    ctx.lineWidth = Math.max(1, TILE_SIZE * 0.05);
    ctx.setLineDash([dash, dash * 0.62]);
    ctx.lineDashOffset = -(now * TILE_SIZE * 1.4) % (dash * 1.62);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#ffd36a';
    ctx.fillRect(rect.x, rect.y, Math.max(2, TILE_SIZE * 0.11), rect.h);
    ctx.fillStyle = '#fff0bd';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`WAITING ${Math.min(999, heldSec)}S: APPROACH OCCUPIED`, rect.x + padding, rect.y + rect.h * 0.5);
  }
  ctx.restore();
}

type InfrastructureAnimationState = {
  deployment: number;
  updatedAt: number;
};

const infrastructureAnimationByModuleId = new Map<number, InfrastructureAnimationState>();

const ACTIVE_INFRASTRUCTURE_SPRITE_KEYS: Partial<Record<ModuleType, string>> = {
  [ModuleType.PodDock]: 'module.pod_dock.active',
  [ModuleType.Gangway]: 'module.gangway.active',
  [ModuleType.DockingClamp]: 'module.docking_clamp.active'
};

export type GangwayVisualState = 'closed' | 'deploying' | 'connected' | 'active' | 'blocked' | 'late';

const GANGWAY_SPRITE_KEYS: Record<GangwayVisualState, string> = {
  closed: STRUCTURAL_FRONTAGE_SPRITE_KEYS.gangway.closed,
  deploying: STRUCTURAL_FRONTAGE_SPRITE_KEYS.gangway.deploying,
  connected: STRUCTURAL_FRONTAGE_SPRITE_KEYS.gangway.connected,
  active: STRUCTURAL_FRONTAGE_SPRITE_KEYS.gangway.active,
  blocked: STRUCTURAL_FRONTAGE_SPRITE_KEYS.gangway.blocked,
  late: STRUCTURAL_FRONTAGE_SPRITE_KEYS.gangway.late
};

// Boarding opens one authored lead before the hard departure, so "late" has to
// be a fraction of that window rather than a fixed number of seconds: at half
// the lead a queue that has not cleared will not clear in time.
const GANGWAY_LATE_BOARDING_SEC = VISIT_TIMINGS.boardingLeadSec * 0.5;

function renderClockSeconds(): number {
  return typeof performance === 'undefined' ? Date.now() / 1000 : performance.now() / 1000;
}

function easedInfrastructureDeployment(moduleId: number, target: number, now: number): number {
  const existing = infrastructureAnimationByModuleId.get(moduleId);
  if (!existing) {
    infrastructureAnimationByModuleId.set(moduleId, { deployment: target, updatedAt: now });
    return target;
  }
  const dt = Math.min(0.12, Math.max(0, now - existing.updatedAt));
  const rate = target > existing.deployment ? 3.8 : 2.8;
  const blend = 1 - Math.exp(-rate * dt);
  existing.deployment += (target - existing.deployment) * blend;
  existing.updatedAt = now;
  return existing.deployment;
}

function moduleFacing(module: StationState['moduleInstances'][number]): SpaceLane {
  return module.rotation === 90 ? 'south' : 'east';
}

function shipPortContract(
  state: StationState,
  ship: StationState['arrivingShips'][number]
): StationState['portOps']['contracts'][number] | null {
  return ship.portContractId === undefined
    ? state.portOps.contracts.find((entry) => entry.shipId === ship.id) ?? null
    : state.portOps.contracts.find((entry) => entry.id === ship.portContractId) ?? null;
}

function shipServiceCompletion(state: StationState, ship: StationState['arrivingShips'][number]): number {
  const contract = shipPortContract(state, ship);
  if (contract) return portPromiseCompletion(contract.promises);
  if (ship.portTurnaround) return clamp01(ship.portTurnaround.fulfillmentRatio);
  if (ship.passengersTotal <= 0) return ship.stage === 'docked' ? 0.5 : 0;
  return clamp01(ship.passengersBoarded / ship.passengersTotal);
}

function infrastructureTargetForShip(ship: StationState['arrivingShips'][number] | null): number {
  if (!ship) return 0;
  if (ship.stage === 'approach') return 0.38;
  if (ship.stage === 'depart') return 0.16;
  return 1;
}

/** Passengers the sim has physically bound to one Gangway's crossing tile. */
type GangwayTransferLoad = {
  transferring: number;
  blocked: boolean;
};

function gangwayTransferLoad(
  state: StationState,
  module: StationState['moduleInstances'][number],
  berthAnchor: number | null
): GangwayTransferLoad {
  // The durable transfer slot key names the Gangway module the sim bound this
  // passenger to; `transferAccessTile` is the same interface as a live tile.
  // Matching either attributes a passenger to the collar they actually queue
  // at rather than to the whole berth, and survives save/resume.
  const slotKey = berthAnchor === null ? null : `berth:${berthAnchor}:gangway:${module.id}`;
  let transferring = 0;
  let blocked = false;
  for (const visitor of state.visitors) {
    const phase = visitor.transferPhase ?? 'station';
    if (phase === 'station') continue;
    const mine = slotKey !== null && visitor.transferSlotKey === slotKey;
    if (!mine && visitor.transferAccessTile !== module.originTile) continue;
    transferring += 1;
    if (
      (visitor.transferBlockedTile ?? null) !== null ||
      visitor.movementWaitReason === 'cargo crossing blocking boarding'
    ) blocked = true;
  }
  return { transferring, blocked };
}

/** Passengers a docked ship is still owed before it may leave clean. */
function shipUnboardedPassengers(ship: StationState['arrivingShips'][number]): number {
  return Math.max(0, ship.passengersSpawned - ship.passengersBoarded);
}

/**
 * Purely selects from ship stage, the live passenger transfers bound to this
 * Gangway's crossing tile, and the contract stay clock. The berth ship is
 * resolved once by the caller so the selector stays cheap per module.
 */
export function gangwayVisualState(
  state: StationState,
  module: StationState['moduleInstances'][number],
  ship: StationState['arrivingShips'][number] | null
): GangwayVisualState {
  if (!ship || ship.stage === 'depart') return 'closed';
  if (ship.stage === 'approach') return 'deploying';
  const boarding = ship.visitPhase === 'recall' || ship.visitPhase === 'boarding';
  const deadline = shipPortContract(state, ship)?.hardDepartureAt ?? ship.plannedDepartureAt ?? null;
  const load = gangwayTransferLoad(state, module, ship.assignedBerthAnchor ?? null);
  // A late call is the worst reading available: people are still on the wrong
  // side of the collar with the hard departure inside the boarding lead.
  if (
    boarding &&
    shipUnboardedPassengers(ship) > 0 &&
    deadline !== null &&
    deadline - state.now <= GANGWAY_LATE_BOARDING_SEC
  ) return 'late';
  if (load.blocked) return 'blocked';
  if (load.transferring > 0) return 'active';
  return 'connected';
}

function drawAuthoredInfrastructureState(
  ctx: CanvasRenderingContext2D,
  state: StationState,
  module: StationState['moduleInstances'][number],
  spriteAtlas: SpriteAtlas,
  useSprites: boolean,
  spriteKey: string | undefined,
  deployment: number
): void {
  if (!useSprites || !spriteKey || deployment <= 0.01) return;
  if (module.type === ModuleType.PodDock && drawPodDockAssembly(
    ctx,
    state,
    module,
    spriteAtlas,
    spriteKey,
    deployment
  )) {
    return;
  }
  const exteriorGeometry = portExteriorSpriteGeometry(state, module);
  if (exteriorGeometry) {
    drawSpriteByKey(
      ctx,
      spriteAtlas,
      spriteKey,
      exteriorGeometry.x,
      exteriorGeometry.y,
      exteriorGeometry.width,
      exteriorGeometry.height,
      exteriorGeometry.rotation,
      deployment
    );
    return;
  }
  const origin = fromIndex(module.originTile, state.width);
  const width = module.width * TILE_SIZE;
  const height = module.height * TILE_SIZE;
  const rotation = module.rotation === 90 ? 90 : 0;
  const drawWidth = rotation === 90 ? height : width;
  const drawHeight = rotation === 90 ? width : height;
  drawSpriteByKey(
    ctx,
    spriteAtlas,
    spriteKey,
    origin.x * TILE_SIZE + (width - drawWidth) * 0.5,
    origin.y * TILE_SIZE + (height - drawHeight) * 0.5,
    drawWidth,
    drawHeight,
    rotation,
    deployment
  );
}

function drawMaintenanceSocketAnimation(
  ctx: CanvasRenderingContext2D,
  state: StationState,
  module: StationState['moduleInstances'][number],
  facing: SpaceLane,
  deployment: number,
  active: boolean,
  now: number
): void {
  if (deployment <= 0.02) return;
  const origin = fromIndex(module.originTile, state.width);
  const cx = (origin.x + module.width * 0.5) * TILE_SIZE;
  const cy = (origin.y + module.height * 0.5) * TILE_SIZE;
  const bend = active ? Math.sin(now * 2.3 + module.id) * TILE_SIZE * 0.06 : 0;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(laneAngleRad(facing));
  ctx.strokeStyle = `rgba(244, 188, 82, ${0.2 + deployment * 0.48})`;
  ctx.lineWidth = Math.max(1, TILE_SIZE * 0.05);
  ctx.beginPath();
  ctx.moveTo(-TILE_SIZE * 0.14, 0);
  ctx.lineTo(TILE_SIZE * 0.13, bend);
  ctx.lineTo(TILE_SIZE * (0.2 + deployment * 0.3), 0);
  ctx.stroke();
  ctx.restore();
}

function renderDockInfrastructureAnimationPass(
  ctx: CanvasRenderingContext2D,
  state: StationState,
  visibleTiles: { minX: number; maxX: number; minY: number; maxY: number },
  spriteAtlas: SpriteAtlas,
  useSprites: boolean
): void {
  const now = renderClockSeconds();
  const podShipByModuleId = new Map<number, StationState['arrivingShips'][number]>();
  const berthShipByModuleId = new Map<number, StationState['arrivingShips'][number]>();
  for (const ship of state.arrivingShips) {
    if (ship.assignedDockId !== null) {
      const dock = state.docks.find((entry) => entry.id === ship.assignedDockId);
      if (dock?.moduleId !== undefined) podShipByModuleId.set(dock.moduleId, ship);
    }
    if (ship.assignedBerthAnchor !== null && ship.assignedBerthAnchor !== undefined) {
      const facility = getBerthFacilityAt(state, ship.assignedBerthAnchor);
      if (!facility) continue;
      for (const ids of Object.values(facility.serviceModuleIds)) {
        for (const moduleId of ids ?? []) berthShipByModuleId.set(moduleId, ship);
      }
    }
  }

  for (const module of state.moduleInstances) {
    if (!module.tiles.some((tile) => tileInRange(tile, state, visibleTiles))) continue;
    const podShip = podShipByModuleId.get(module.id) ?? null;
    const berthShip = berthShipByModuleId.get(module.id) ?? null;
    const ship = podShip ?? berthShip;
    const target = infrastructureTargetForShip(ship);
    const deployment = easedInfrastructureDeployment(module.id, target, now);

    if (module.type === ModuleType.PodDock) {
      drawAuthoredInfrastructureState(ctx, state, module, spriteAtlas, useSprites, ACTIVE_INFRASTRUCTURE_SPRITE_KEYS[module.type], deployment);
    } else if (module.type === ModuleType.Gangway) {
      // The authored key now carries the deployment stage, so alpha only
      // softens the extension instead of standing in for it. A closed collar
      // is finished art in its own right and stays opaque.
      const gangwayState = gangwayVisualState(state, module, ship);
      const attention = gangwayState === 'blocked' || gangwayState === 'late'
        ? 0.78 + Math.sin(now * 4.4 + module.id) * 0.22
        : 1;
      const alpha = gangwayState === 'closed' ? 1 : (0.55 + deployment * 0.45) * attention;
      drawAuthoredInfrastructureState(ctx, state, module, spriteAtlas, useSprites, GANGWAY_SPRITE_KEYS[gangwayState], alpha);
    } else if (module.type === ModuleType.DockingClamp) {
      // Clamp art has one authored engaged frame, so its deployment reads
      // through the eased alpha plus a reach flicker while the hull closes in.
      const reaching = ship?.stage === 'approach';
      const clampAlpha = reaching ? deployment * (0.72 + Math.sin(now * 3.1 + module.id) * 0.22) : deployment;
      drawAuthoredInfrastructureState(ctx, state, module, spriteAtlas, useSprites, ACTIVE_INFRASTRUCTURE_SPRITE_KEYS[module.type], clampAlpha);
    } else if (module.type === ModuleType.MaintenanceSocket) {
      const dock = state.docks.find((entry) => entry.attachmentModuleIds?.maintenance === module.id);
      const dockShip = dock ? state.arrivingShips.find((ship) => ship.assignedDockId === dock.id) ?? null : null;
      const dockActive = dockShip?.stage === 'docked' && shipServiceCompletion(state, dockShip) < 0.995;
      drawMaintenanceSocketAnimation(ctx, state, module, dock?.facing ?? moduleFacing(module), easedInfrastructureDeployment(module.id, infrastructureTargetForShip(dockShip), now), dockActive, now);
    }
  }
}

function drawFuelTankFillGauges(
  ctx: CanvasRenderingContext2D,
  state: StationState,
  visibleTiles: { minX: number; maxX: number; minY: number; maxY: number }
): void {
  const nodeByTile = new Map(state.itemNodes.map((node) => [node.tileIndex, node]));
  for (const module of state.moduleInstances) {
    if (module.type !== ModuleType.FuelTank || !module.tiles.some((tile) => tileInRange(tile, state, visibleTiles))) continue;
    const node = nodeByTile.get(module.originTile);
    const fill = node && node.capacity > 0 ? clamp01((node.items.fuel ?? 0) / node.capacity) : 0;
    const origin = fromIndex(module.originTile, state.width);
    const px = origin.x * TILE_SIZE;
    const py = origin.y * TILE_SIZE;
    const w = module.width * TILE_SIZE;
    const h = module.height * TILE_SIZE;
    const gaugeW = Math.max(5, Math.round(w * 0.09));
    const gaugeH = Math.max(16, Math.round(h * 0.52));
    const gaugeX = px + w - Math.round(w * 0.14) - gaugeW;
    const gaugeY = py + Math.round((h - gaugeH) * 0.5);
    const inset = Math.max(1, Math.round(PX));
    const innerH = Math.max(1, gaugeH - inset * 2);
    const fillH = Math.round(innerH * fill);

    ctx.save();
    ctx.fillStyle = 'rgba(5, 10, 14, 0.88)';
    ctx.fillRect(gaugeX, gaugeY, gaugeW, gaugeH);
    ctx.strokeStyle = 'rgba(220, 242, 247, 0.9)';
    ctx.lineWidth = Math.max(1, Math.round(PX));
    ctx.strokeRect(gaugeX + 0.5, gaugeY + 0.5, gaugeW - 1, gaugeH - 1);
    if (fillH > 0) {
      ctx.fillStyle = fill > 0.5 ? '#63f0b2' : fill > 0.2 ? '#ffd36a' : '#ff7676';
      ctx.fillRect(gaugeX + inset, gaugeY + gaugeH - inset - fillH, gaugeW - inset * 2, fillH);
    }
    ctx.strokeStyle = 'rgba(220, 242, 247, 0.35)';
    ctx.lineWidth = 1;
    for (const mark of [0.25, 0.5, 0.75]) {
      const y = gaugeY + inset + innerH * (1 - mark);
      ctx.beginPath();
      ctx.moveTo(gaugeX + inset, y);
      ctx.lineTo(gaugeX + gaugeW - inset, y);
      ctx.stroke();
    }
    ctx.restore();
  }
}

/** Shared compact world label for a module-anchored status line. */
function drawModuleStatusLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  topY: number,
  color: string
): void {
  const fontSize = Math.max(8, Math.round(TILE_SIZE * 0.28));
  ctx.font = `bold ${fontSize}px monospace`;
  const paddingX = Math.max(5, Math.round(TILE_SIZE * 0.18));
  const height = fontSize + Math.max(6, Math.round(TILE_SIZE * 0.18));
  const width = ctx.measureText(text).width + paddingX * 2;
  const left = centerX - width * 0.5;
  ctx.fillStyle = 'rgba(5, 10, 15, 0.92)';
  ctx.fillRect(left, topY, width, height);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, Math.round(PX));
  ctx.strokeRect(left + 0.5, topY + 0.5, width - 1, height - 1);
  ctx.fillStyle = '#f3f7fb';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, centerX, topY + height * 0.5);
}

function drawFuelCouplerConnectionIndicators(
  ctx: CanvasRenderingContext2D,
  state: StationState,
  visibleTiles: { minX: number; maxX: number; minY: number; maxY: number },
  showPlanningDetails: boolean
): void {
  const diagnostics = getFuelPipeNetworkDiagnostics(state);
  const fuelTanks = state.moduleInstances.filter((module) => module.type === ModuleType.FuelTank);

  ctx.save();
  if (showPlanningDetails) {
    for (const tank of fuelTanks) {
      if (!tank.tiles.some((tile) => tileInRange(tile, state, visibleTiles))) continue;
      const connectedTile = tank.tiles.find((tile) => {
        const componentId = diagnostics.componentIdByTile[tile];
        return componentId >= 0 && diagnostics.components[componentId]?.powered;
      });
      const connected = connectedTile !== undefined;
      const origin = fromIndex(tank.originTile, state.width);
      const color = connected ? '#63f0b2' : '#ff7d72';
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(2, Math.round(TILE_SIZE * 0.07));
      ctx.setLineDash(connected ? [] : [Math.max(3, Math.round(TILE_SIZE * 0.16)), Math.max(2, Math.round(TILE_SIZE * 0.1))]);
      ctx.strokeRect(
        origin.x * TILE_SIZE + 2,
        origin.y * TILE_SIZE + 2,
        tank.width * TILE_SIZE - 4,
        tank.height * TILE_SIZE - 4
      );
      ctx.setLineDash([]);
      drawModuleStatusLabel(
        ctx,
        connected ? 'TANK CONNECTED' : 'PIPE TO ANY TANK TILE',
        (origin.x + tank.width * 0.5) * TILE_SIZE,
        origin.y * TILE_SIZE - Math.max(18, TILE_SIZE * 0.62),
        color
      );
    }
  }

  for (const coupler of state.moduleInstances) {
    if (coupler.type !== ModuleType.FuelCoupler || !coupler.tiles.some((tile) => tileInRange(tile, state, visibleTiles))) continue;
    const serviceTile = wallMountedModuleServiceTile(state, coupler.originTile);
    const hasPipe = serviceTile !== null && hasUtilityUnderlay(state, 'fuel-pipe', serviceTile);
    const componentId = serviceTile === null ? -1 : diagnostics.componentIdByTile[serviceTile];
    const component = componentId >= 0 ? diagnostics.components[componentId] : undefined;
    const connected = hasPipe && component?.powered === true;
    const connectedTankOrigins = new Set<number>();
    if (component) {
      const sourceTiles = new Set(component.sourceTiles);
      for (const tank of fuelTanks) {
        if (tank.tiles.some((tile) => sourceTiles.has(tile))) connectedTankOrigins.add(tank.originTile);
      }
    }
    const fuelStock = [...connectedTankOrigins].reduce(
      (sum, tile) => sum + itemStockAtNode(state, tile, 'fuel'),
      0
    );
    const ready = connected && fuelStock > 0.01;
    const color = ready ? '#63f0b2' : connected ? '#ffd36a' : '#ff7d72';
    const geometry = portExteriorSpriteGeometry(state, coupler);
    const origin = fromIndex(coupler.originTile, state.width);
    const couplerX = geometry ? geometry.x + geometry.width * 0.5 : (origin.x + 0.5) * TILE_SIZE;
    const couplerY = geometry ? geometry.y + geometry.height * 0.5 : (origin.y + 0.5) * TILE_SIZE;
    const lampRadius = Math.max(5, TILE_SIZE * 0.16);

    ctx.fillStyle = 'rgba(4, 9, 13, 0.9)';
    ctx.beginPath();
    ctx.arc(couplerX, couplerY, lampRadius + Math.max(2, PX), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(couplerX, couplerY, lampRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#071015';
    ctx.lineWidth = Math.max(2, Math.round(TILE_SIZE * 0.07));
    ctx.beginPath();
    if (connected) {
      ctx.moveTo(couplerX - lampRadius * 0.48, couplerY);
      ctx.lineTo(couplerX - lampRadius * 0.1, couplerY + lampRadius * 0.38);
      ctx.lineTo(couplerX + lampRadius * 0.52, couplerY - lampRadius * 0.42);
    } else {
      ctx.moveTo(couplerX, couplerY - lampRadius * 0.5);
      ctx.lineTo(couplerX, couplerY + lampRadius * 0.18);
      ctx.moveTo(couplerX, couplerY + lampRadius * 0.48);
      ctx.lineTo(couplerX, couplerY + lampRadius * 0.5);
    }
    ctx.stroke();

    if (!showPlanningDetails || serviceTile === null) continue;
    const service = fromIndex(serviceTile, state.width);
    const socketX = (service.x + 0.5) * TILE_SIZE;
    const socketY = (service.y + 0.5) * TILE_SIZE;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, Math.round(TILE_SIZE * 0.07));
    ctx.setLineDash(hasPipe ? [] : [Math.max(3, Math.round(TILE_SIZE * 0.16)), Math.max(2, Math.round(TILE_SIZE * 0.1))]);
    ctx.beginPath();
    ctx.moveTo(socketX, socketY);
    ctx.lineTo(couplerX, couplerY);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(socketX, socketY, TILE_SIZE * 0.25, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    const label = !hasPipe
      ? 'COUPLER: PIPE HERE'
      : !connected
        ? 'COUPLER: NO TANK'
        : fuelStock <= 0.01
          ? 'COUPLER: LINE OK, TANK EMPTY'
          : `COUPLER: READY · ${Math.floor(fuelStock)} FUEL`;
    drawModuleStatusLabel(ctx, label, socketX, socketY + TILE_SIZE * 0.35, color);
  }
  ctx.restore();
}

function drawPodDockInformationChips(
  ctx: CanvasRenderingContext2D,
  state: StationState,
  occupied: BerthChipRect[]
): void {
  const fontSize = Math.max(7, Math.round(TILE_SIZE * 0.31));
  const chipHeight = Math.max(20, TILE_SIZE * 0.92);
  const horizontalPadding = Math.max(10, TILE_SIZE * 0.48);
  ctx.save();
  ctx.font = `bold ${fontSize}px monospace`;
  for (const dock of state.docks) {
    if (dock.sourceKind !== 'pod-dock-module' || dock.occupiedByShipId === null) continue;
    const ship = state.arrivingShips.find((entry) => entry.id === dock.occupiedByShipId);
    if (!ship) continue;
    const callsign = ship.portManifest?.callsign ?? `POD ${ship.id}`;
    const services = [
      'PAX',
      ...(dock.podCapabilities?.includes('fuel') ? ['FUEL'] : []),
      ...(dock.podCapabilities?.includes('freight') ? ['CARGO'] : []),
      ...(dock.podCapabilities?.includes('maintenance') ? ['REPAIR'] : [])
    ].join(' ');
    const status = ship.stage === 'approach'
      ? 'DOCKING'
      : ship.stage === 'depart'
        ? 'DEPARTING'
        : `SERVICE ${Math.round(shipServiceCompletion(state, ship) * 100)}%`;
    const topLine = `${callsign} | ${ship.shipType.toUpperCase()}`;
    const bottomLine = `${status} | ${services}`;
    const width = Math.max(
      TILE_SIZE * 3.6,
      Math.min(TILE_SIZE * 7.2, Math.max(ctx.measureText(topLine).width, ctx.measureText(bottomLine).width) + horizontalPadding)
    );
    const rect = placeBerthChip(state, dock.tiles, width, chipHeight, occupied);
    if (rect) drawBerthChip(ctx, rect, topLine, bottomLine, ship.stage === 'depart' ? '#ffd36a' : '#72dff2', 0.94);
  }
  ctx.restore();
}

function drawPortCargoLots(ctx: CanvasRenderingContext2D, state: StationState): void {
  for (const lot of state.portOps.cargoLots) {
    if (lot.locationTile === null || (lot.location !== 'staging' && lot.location !== 'storage')) continue;
    const tile = fromIndex(lot.locationTile, state.width);
    const crateCount = Math.max(1, Math.min(4, Math.ceil(lot.quantity / 12)));
    const baseX = (tile.x + 0.5) * TILE_SIZE;
    const baseY = (tile.y + 0.5) * TILE_SIZE;
    ctx.save();
    for (let i = 0; i < crateCount; i++) {
      const column = i % 2;
      const row = Math.floor(i / 2);
      const size = TILE_SIZE * 0.28;
      const x = baseX + (column - 0.5) * size * 0.9;
      const y = baseY + (row - 0.5) * size * 0.82;
      ctx.fillStyle = lot.ownership === 'consigned' ? '#d6a247' : '#6fa8d8';
      ctx.strokeStyle = 'rgba(18, 24, 30, 0.9)';
      ctx.lineWidth = Math.max(1, TILE_SIZE * 0.04);
      ctx.fillRect(x - size * 0.5, y - size * 0.5, size, size);
      ctx.strokeRect(x - size * 0.5, y - size * 0.5, size, size);
      ctx.beginPath();
      ctx.moveTo(x - size * 0.38, y);
      ctx.lineTo(x + size * 0.38, y);
      ctx.stroke();
    }
    const label = `${Math.floor(lot.handledQuantity)}/${Math.floor(lot.quantity)}`;
    ctx.font = `bold ${Math.max(8, Math.round(TILE_SIZE * 0.34))}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(3, 8, 12, 0.9)';
    ctx.strokeText(label, baseX, baseY - TILE_SIZE * 0.48);
    ctx.fillStyle = '#ffe1a1';
    ctx.fillText(label, baseX, baseY - TILE_SIZE * 0.48);
    ctx.restore();
  }
}

function drawShipSilhouetteCells(
  ctx: CanvasRenderingContext2D,
  silhouette: ShipSilhouetteResolved,
  originPxX: number,
  originPxY: number,
  cellSize: number,
  palette: ShipPalette,
  cellInset: number
): void {
  for (const cell of silhouette.hull) {
    const px = originPxX + cell.x * cellSize + cellInset;
    const py = originPxY + cell.y * cellSize + cellInset;
    const bodySize = Math.max(1, cellSize - cellInset * 2);
    ctx.fillStyle = palette.hull;
    ctx.fillRect(px, py, bodySize, bodySize);
  }

  const cockpitSize = Math.max(1, cellSize * 0.38);
  {
    const px = originPxX + silhouette.cockpit.x * cellSize + (cellSize - cockpitSize) * 0.5;
    const py = originPxY + silhouette.cockpit.y * cellSize + (cellSize - cockpitSize) * 0.5;
    ctx.fillStyle = palette.cockpit;
    ctx.fillRect(px, py, cockpitSize, cockpitSize);
  }

  const engineSize = Math.max(1, cellSize * 0.3);
  for (const engine of silhouette.engines) {
    const px = originPxX + engine.x * cellSize + (cellSize - engineSize) * 0.5;
    const py = originPxY + engine.y * cellSize + (cellSize - engineSize) * 0.5;
    ctx.fillStyle = palette.engine;
    ctx.fillRect(px, py, engineSize, engineSize);
  }
}

type ModuleInventoryVisual = {
  used: number;
  capacity: number;
  fillPct: number;
  dominantItem: ItemType | null;
  mixed: boolean;
  byItem: Partial<Record<ItemType, number>>;
};

function buildModuleInventoryVisualMap(state: StationState): Map<number, ModuleInventoryVisual> {
  const out = new Map<number, ModuleInventoryVisual>();
  for (const node of state.itemNodes) {
    const byItem: Partial<Record<ItemType, number>> = {};
    let used = 0;
    let dominantItem: ItemType | null = null;
    let dominantValue = -1;
    let nonZeroItemKinds = 0;
    for (const itemType of ITEM_TYPES) {
      const amount = node.items[itemType] ?? 0;
      if (amount > 0.01) {
        byItem[itemType] = amount;
        nonZeroItemKinds += 1;
      }
      used += amount;
      if (amount > dominantValue) {
        dominantValue = amount;
        dominantItem = amount > 0.01 ? itemType : dominantItem;
      }
    }
    if (used <= 0.01 && node.capacity <= 0) continue;
    const fillPct = node.capacity > 0 ? clamp01(used / node.capacity) : 0;
    out.set(node.tileIndex, {
      used,
      capacity: node.capacity,
      fillPct,
      dominantItem: used > 0.01 ? dominantItem : null,
      mixed: nonZeroItemKinds > 1,
      byItem
    });
  }
  return out;
}

function drawLocatedInventorySprites(
  ctx: CanvasRenderingContext2D,
  state: StationState,
  visibleTiles: { minX: number; maxX: number; minY: number; maxY: number }
): void {
  for (const node of state.itemNodes) {
    if (!tileInRange(node.tileIndex, state, visibleTiles)) continue;
    let dominantItem: ItemType | null = null;
    let dominantAmount = 0;
    let totalAmount = 0;
    for (const itemType of ITEM_TYPES) {
      if (itemType === 'body') continue;
      const amount = node.items[itemType] ?? 0;
      totalAmount += amount;
      if (amount > dominantAmount) {
        dominantAmount = amount;
        dominantItem = itemType;
      }
    }
    if (!dominantItem || totalAmount <= 0.01) continue;

    const tileX = node.tileIndex % state.width;
    const tileY = Math.floor(node.tileIndex / state.width);
    const stackCount = node.capacity > 0
      ? 1 + Math.min(2, Math.floor(clamp01(totalAmount / node.capacity) * 3))
      : 1;
    const iconSize = TILE_SIZE * 0.38;
    for (let stack = 0; stack < stackCount; stack += 1) {
      drawItemWorldSprite(
        ctx,
        dominantItem,
        (tileX + 0.73 - stack * 0.12) * TILE_SIZE,
        (tileY + 0.72 - stack * 0.08) * TILE_SIZE,
        iconSize
      );
    }
  }
}

function drawCarriedInventorySprite(
  ctx: CanvasRenderingContext2D,
  itemType: ItemType | null,
  amount: number,
  centerX: number,
  centerY: number
): void {
  if (!itemType || itemType === 'body' || amount <= 0.01) return;
  if (amount >= 4) {
    // A big stack rides on a small cart plate so a player can immediately see
    // why this person is holding up a narrow corridor.
    ctx.save();
    ctx.fillStyle = 'rgba(20, 35, 45, 0.92)';
    ctx.strokeStyle = '#e1b450';
    ctx.lineWidth = Math.max(1, TILE_SIZE * 0.035);
    ctx.fillRect(centerX + TILE_SIZE * 0.08, centerY + TILE_SIZE * 0.12, TILE_SIZE * 0.38, TILE_SIZE * 0.27);
    ctx.strokeRect(centerX + TILE_SIZE * 0.08, centerY + TILE_SIZE * 0.12, TILE_SIZE * 0.38, TILE_SIZE * 0.27);
    ctx.restore();
  }
  drawItemWorldSprite(ctx, itemType, centerX + TILE_SIZE * 0.22, centerY + TILE_SIZE * 0.2, TILE_SIZE * 0.44);
}

function drawTransportJobMarkers(
  ctx: CanvasRenderingContext2D,
  state: StationState,
  visibleTiles: { minX: number; maxX: number; minY: number; maxY: number }
): void {
  for (const job of state.jobs) {
    if (job.type !== 'pickup' && job.type !== 'deliver') continue;
    let tile: number | null = null;
    let color = '';
    let pulse = 0;
    if ((job.state === 'pending' || job.state === 'assigned') && job.pickedUpAmount <= 0.01) {
      tile = job.fromTile;
      color = '#f0bd55';
      pulse = 0.35 + 0.22 * Math.sin(state.now * 5 + job.id);
    } else if (job.state === 'done' && job.completedAt !== null && state.now - job.completedAt < 1.1) {
      tile = job.toTile;
      color = '#72e3ae';
      pulse = Math.max(0, 1 - (state.now - job.completedAt) / 1.1);
    }
    if (tile === null || !tileInRange(tile, state, visibleTiles)) continue;
    const x = (tile % state.width + 0.5) * TILE_SIZE;
    const y = (Math.floor(tile / state.width) + 0.5) * TILE_SIZE;
    ctx.save();
    ctx.globalAlpha = Math.max(0.2, pulse);
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, TILE_SIZE * 0.04);
    ctx.setLineDash([TILE_SIZE * 0.12, TILE_SIZE * 0.1]);
    ctx.beginPath();
    ctx.arc(x, y, TILE_SIZE * (0.28 + pulse * 0.12), 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    drawItemWorldSprite(ctx, job.itemType, x + TILE_SIZE * 0.2, y - TILE_SIZE * 0.17, TILE_SIZE * 0.25);
  }
}

function collectCafeteriaQueueNodeTiles(state: StationState): number[] {
  return collectQueueTargets(state, RoomType.Cafeteria);
}

function ensureStaticLayer(
  state: StationState,
  widthPx: number,
  heightPx: number,
  spriteAtlas: SpriteAtlas,
  useSprites: boolean
): CachedLayer {
  staticLayerCache = ensureCachedLayer(staticLayerCache, widthPx, heightPx);
  const layer = staticLayerCache;
  const key = [
    state.width,
    state.height,
    state.topologyVersion,
    state.roomVersion,
    state.controls.showZones ? 1 : 0,
    useSprites ? 1 : 0,
    state.controls.wallRenderMode,
    spriteAtlas.version
  ].join('|');
  if (layer.key === key) return layer;
  layer.key = key;
  const ctx = layer.ctx;
  ctx.clearRect(0, 0, widthPx, heightPx);
  for (let i = 0; i < state.tiles.length; i++) {
    const { x, y } = fromIndex(i, state.width);
    const px = x * TILE_SIZE;
    const py = y * TILE_SIZE;
    const tileType = state.tiles[i];
    const isOpenSpace = tileType === TileType.Space;
    const drewTileSprite = !isOpenSpace && useSprites && drawTileSprite(state, i, tileType, ctx, spriteAtlas, px, py);
    if (!drewTileSprite) {
      if (!isOpenSpace) {
        ctx.fillStyle = tileColor[tileType];
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      }
    }
    if (state.rooms[i] === RoomType.Berth && state.tiles[i] !== TileType.Space) {
      drawBerthTileTexture(ctx, state, i, px, py);
    }
    if (state.controls.showZones && state.tiles[i] !== TileType.Space && state.tiles[i] !== TileType.Truss) {
      if (state.zones[i] === ZoneType.Restricted) {
        ctx.fillStyle = 'rgba(255, 90, 90, 0.25)';
      } else {
        ctx.fillStyle = 'rgba(90, 170, 255, 0.08)';
      }
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
    }
    const roomType = state.rooms[i];
    // In sprites-ON mode, room identity comes from the tile-type sprite
    // (tile.cafeteria, tile.reactor, tile.security). The room.* overlay layer
    // is deprecated — per awfml 2026-04-23: "strip the room color overlays
    // and let the texture color speak for itself." Fallback overlay+letter
    // still runs in sprites-OFF mode to keep that path recognizable.
    if (roomType !== RoomType.None && !useSprites) {
      ctx.fillStyle = roomOverlay[roomType];
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      ctx.fillStyle = 'rgba(230, 240, 250, 0.24)';
      ctx.font = `bold ${Math.round(10 * PX)}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(roomLetter[roomType], px + TILE_SIZE * 0.5, py + TILE_SIZE * 0.53);
    }
    // Cold-start fallback (sprites-ON only): when a Floor tile carries
    // RoomType.Reactor but its TileType is still plain Floor (the demo
    // /cold-start-prototype path stamps room metadata before tile types
    // resolve to Reactor sprites), paint a subtle reactor wash so the
    // cluster reads even when the glow pass is toggled off. TileType
    // .Reactor tiles already get their own sprite + glow — only the
    // metadata-only case needs the wash. Alpha kept low so we don't
    // re-create the "everything red" complaint awfml flagged in PR #84.
    if (useSprites && tileType === TileType.Floor && roomType === RoomType.Reactor) {
      ctx.fillStyle = 'rgba(185, 125, 57, 0.20)';
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
    }
    if (state.tiles[i] === TileType.Dock) {
      const dock = getDockByTile(state, i);
      if (dock && !useSprites) {
        ctx.fillStyle = 'rgba(8, 16, 28, 0.8)';
        ctx.fillRect(px + PX, py + PX, Math.round(7 * PX), Math.round(7 * PX));
        ctx.fillStyle = '#d6deeb';
        ctx.font = `bold ${Math.round(7 * PX)}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const label = dock.facing === 'north' ? 'N' : dock.facing === 'east' ? 'E' : dock.facing === 'south' ? 'S' : 'W';
        ctx.fillText(label, px + Math.round(4.5 * PX), py + Math.round(4.5 * PX));
      }
    }
    if (!drewTileSprite && !isOpenSpace) {
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.strokeRect(px + 0.5, py + 0.5, TILE_SIZE, TILE_SIZE);
    }
  }
  if (useSprites && state.controls.wallRenderMode === 'dual-tilemap') {
    renderDualWallLayer(ctx, state, spriteAtlas, drawSpriteByKey);
    renderWallDetailLayer(ctx, state);
    renderDoorLayer(ctx, state, spriteAtlas);
    renderDoorDockDetailLayer(ctx, state);
    renderRoomLabelLayer(ctx, state);
  }
  return layer;
}

/** Regression seam: transient facility claims deliberately do not enter this key. */
export function decorativeLayerCacheKey(
  state: StationState,
  useSprites: boolean,
  spriteAtlasVersion: string
): string {
  return [
    state.width,
    state.height,
    state.topologyVersion,
    state.roomVersion,
    state.moduleVersion,
    state.dockVersion,
    state.utilityUnderlay.version,
    sanitationRenderSignature(state),
    plumbingRenderSignature(state),
    moduleConditionRenderSignature(state),
    useSprites ? 1 : 0,
    spriteAtlasVersion
  ].join('|');
}

function ensureDecorativeLayer(
  state: StationState,
  widthPx: number,
  heightPx: number,
  spriteAtlas: SpriteAtlas,
  useSprites: boolean
): CachedLayer {
  decorativeLayerCache = ensureCachedLayer(decorativeLayerCache, widthPx, heightPx);
  const layer = decorativeLayerCache;
  const key = decorativeLayerCacheKey(state, useSprites, spriteAtlas.version);
  if (layer.key === key) return layer;
  layer.key = key;
  const ctx = layer.ctx;
  ctx.clearRect(0, 0, widthPx, heightPx);

  if (useSprites) {
    for (let i = 0; i < state.tiles.length; i++) {
      const overlayKey = pickFloorOverlayKey(state, i);
      if (!overlayKey) continue;
      const { x, y } = fromIndex(i, state.width);
      drawSpriteByKey(
        ctx,
        spriteAtlas,
        overlayKey,
        x * TILE_SIZE,
        y * TILE_SIZE,
        TILE_SIZE,
        TILE_SIZE,
        0,
        floorOverlayAlpha(state, i)
      );
    }
  }

  for (let i = 0; i < state.tiles.length; i++) {
    const flood = state.plumbing?.floodByTile[i] ?? 0;
    if (flood < 1) continue;
    const { x, y } = fromIndex(i, state.width);
    const px = x * TILE_SIZE;
    const py = y * TILE_SIZE;
    const strength = clamp01(flood / 45);
    ctx.fillStyle = `rgba(66, 190, 240, ${0.12 + strength * 0.28})`;
    ctx.beginPath();
    ctx.ellipse(
      px + TILE_SIZE * 0.5,
      py + TILE_SIZE * 0.58,
      TILE_SIZE * (0.28 + strength * 0.2),
      TILE_SIZE * (0.16 + strength * 0.14),
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();
    if (flood >= 12) {
      ctx.strokeStyle = `rgba(203, 246, 255, ${0.2 + strength * 0.35})`;
      ctx.lineWidth = Math.max(1, PX);
      ctx.stroke();
    }
  }

  const moduleDebtById = new Map<number, number>();
  for (const debt of state.maintenanceDebts) {
    if (debt.moduleId === undefined) continue;
    moduleDebtById.set(debt.moduleId, Math.max(moduleDebtById.get(debt.moduleId) ?? 0, debt.debt));
  }
  for (const module of state.moduleInstances) {
    drawModuleVisual(ctx, state, module, spriteAtlas, useSprites);
    drawModuleConditionDecal(ctx, state, module, moduleDebtById.get(module.id) ?? 0);
  }

  for (const tile of getUnpoweredPowerRoomAnchors(state)) {
    const { x, y } = fromIndex(tile, state.width);
    const cx = x * TILE_SIZE + TILE_SIZE * 0.5;
    const cy = y * TILE_SIZE + TILE_SIZE * 0.5;
    ctx.fillStyle = 'rgba(20, 12, 16, 0.92)';
    ctx.strokeStyle = '#ee4f4f';
    ctx.lineWidth = Math.max(2, Math.round(2 * PX));
    ctx.beginPath();
    ctx.arc(cx, cy, TILE_SIZE * 0.34, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffd65c';
    ctx.font = `bold ${Math.round(14 * PX)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⚡', cx, cy + Math.round(PX));
  }

  return layer;
}

function readServiceOverlay(state: StationState): ServiceOverlayCache {
  if (!state.controls.showServiceNodes) {
    serviceOverlayCache.key = '';
    serviceOverlayCache.nodeTiles.clear();
    serviceOverlayCache.unreachableNodeTiles.clear();
    serviceOverlayCache.queueNodeTiles.clear();
    serviceOverlayCache.jobPickupTiles.clear();
    serviceOverlayCache.jobDropTiles.clear();
    serviceOverlayCache.reachability = null;
    return serviceOverlayCache;
  }
  const cacheTime = nowSec();
  const key = [
    state.topologyVersion,
    state.roomVersion,
    state.moduleVersion,
    state.dockVersion,
    state.jobSpawnCounter,
    state.metrics.pendingJobs,
    state.metrics.assignedJobs
  ].join('|');
  if (serviceOverlayCache.key === key && cacheTime - serviceOverlayCache.builtAt <= SERVICE_OVERLAY_CACHE_TTL_SEC) {
    return serviceOverlayCache;
  }
  const reachability = collectServiceNodeReachability(state);
  serviceOverlayCache.key = key;
  serviceOverlayCache.builtAt = cacheTime;
  serviceOverlayCache.reachability = reachability;
  serviceOverlayCache.nodeTiles = new Set(reachability.nodeTiles);
  serviceOverlayCache.unreachableNodeTiles = new Set(reachability.unreachableNodeTiles);
  serviceOverlayCache.queueNodeTiles = new Set(collectCafeteriaQueueNodeTiles(state));
  serviceOverlayCache.jobPickupTiles = new Set(
    state.jobs
      .filter((j) => j.state === 'pending' || j.state === 'assigned' || j.state === 'in_progress')
      .map((j) => j.fromTile)
  );
  serviceOverlayCache.jobDropTiles = new Set(
    state.jobs
      .filter((j) => j.state === 'pending' || j.state === 'assigned' || j.state === 'in_progress')
      .map((j) => j.toTile)
  );
  return serviceOverlayCache;
}

/**
 * One short line beside the placement cursor: the price when the spot works,
 * the specific blocker when it does not. Kept to a single row so it reads as
 * cursor feedback rather than a panel.
 */
function drawPlacementReason(
  ctx: CanvasRenderingContext2D,
  state: StationState,
  hoveredTile: number,
  text: string,
  valid: boolean
): void {
  if (!text) return;
  const p = fromIndex(hoveredTile, state.width);
  const fontPx = Math.max(9, Math.round(11 * PX));
  ctx.font = `${fontPx}px Consolas, Menlo, monospace`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const padding = Math.round(4 * PX);
  const width = ctx.measureText(text).width + padding * 2;
  const height = Math.round(15 * PX);
  const x = p.x * TILE_SIZE;
  const y = p.y * TILE_SIZE - height - Math.round(3 * PX);
  ctx.fillStyle = valid ? 'rgba(12, 32, 22, 0.88)' : 'rgba(44, 14, 14, 0.9)';
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = valid ? 'rgba(110,219,143,0.9)' : 'rgba(255,118,118,0.95)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
  ctx.fillStyle = valid ? '#8fe6b0' : '#ffb0b0';
  ctx.fillText(text, x + padding, y + height - Math.round(4 * PX));
}

function worldBoundsForApproachTiles(state: StationState, tiles: number[]): WorldRect | null {
  if (tiles.length === 0) return null;
  const positions = tiles.map((tile) => fromIndex(tile, state.width));
  return {
    minX: Math.min(...positions.map((position) => position.x)) + state.mapWorldOriginX,
    minY: Math.min(...positions.map((position) => position.y)) + state.mapWorldOriginY,
    maxX: Math.max(...positions.map((position) => position.x)) + state.mapWorldOriginX + 1,
    maxY: Math.max(...positions.map((position) => position.y)) + state.mapWorldOriginY + 1
  };
}

function shiftApproachBoundsOutward(bounds: WorldRect, facing: SpaceLane): WorldRect {
  if (facing === 'north') return { ...bounds, minY: bounds.minY - 1, maxY: bounds.maxY - 1 };
  if (facing === 'south') return { ...bounds, minY: bounds.minY + 1, maxY: bounds.maxY + 1 };
  if (facing === 'east') return { ...bounds, minX: bounds.minX + 1, maxX: bounds.maxX + 1 };
  return { ...bounds, minX: bounds.minX - 1, maxX: bounds.maxX - 1 };
}

function exteriorFacingForPreview(state: StationState, tiles: number[]): SpaceLane {
  const own = new Set(tiles);
  const counts: Record<SpaceLane, number> = { north: 0, east: 0, south: 0, west: 0 };
  for (const tile of tiles) {
    const { x, y } = fromIndex(tile, state.width);
    for (const [facing, dx, dy] of [
      ['north', 0, -1], ['east', 1, 0], ['south', 0, 1], ['west', -1, 0]
    ] as Array<[SpaceLane, number, number]>) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(nx, ny, state.width, state.height) || state.tiles[toIndex(nx, ny, state.width)] === TileType.Space) {
        if (!own.has(inBounds(nx, ny, state.width, state.height) ? toIndex(nx, ny, state.width) : -1)) counts[facing]++;
      }
    }
  }
  return (['north', 'east', 'south', 'west'] as SpaceLane[])
    .reduce((best, facing) => counts[facing] > counts[best] ? facing : best, 'east');
}

function previewSlotDescriptor(
  state: StationState,
  id: string,
  kind: 'pod-dock' | 'berth',
  tiles: number[],
  facing: SpaceLane,
  acceptedSizes: ShipSize[]
): DockingSlotDescriptor | null {
  const bounds = worldBoundsForApproachTiles(state, tiles);
  if (!bounds || tiles.length === 0) return null;
  const anchor = fromIndex(tiles[0], state.width);
  return buildDockingSlotDescriptor({
    id,
    kind,
    sourceKey: null,
    anchorTile: tiles[0],
    facing,
    acceptedSizes,
    hullTiles: tiles,
    accessTiles: tiles,
    anchorWorldX: anchor.x + state.mapWorldOriginX + 0.5,
    anchorWorldY: anchor.y + state.mapWorldOriginY + 0.5,
    hullBounds: kind === 'pod-dock' ? shiftApproachBoundsOutward(bounds, facing) : bounds
  });
}

function approachRectPx(state: StationState, bounds: WorldRect): { x: number; y: number; w: number; h: number } {
  return {
    x: (bounds.minX - state.mapWorldOriginX) * TILE_SIZE,
    y: (bounds.minY - state.mapWorldOriginY) * TILE_SIZE,
    w: (bounds.maxX - bounds.minX) * TILE_SIZE,
    h: (bounds.maxY - bounds.minY) * TILE_SIZE
  };
}

function drawApproachArrow(ctx: CanvasRenderingContext2D, rect: { x: number; y: number; w: number; h: number }, facing: SpaceLane, color: string): void {
  const cx = rect.x + rect.w * 0.5;
  const cy = rect.y + rect.h * 0.5;
  const length = Math.max(TILE_SIZE * 0.7, facing === 'north' || facing === 'south' ? rect.h * 0.36 : rect.w * 0.36);
  const outward = facing === 'north' ? { x: 0, y: -1 } : facing === 'south' ? { x: 0, y: 1 } : facing === 'east' ? { x: 1, y: 0 } : { x: -1, y: 0 };
  const start = { x: cx + outward.x * length * 0.5, y: cy + outward.y * length * 0.5 };
  const end = { x: cx - outward.x * length * 0.5, y: cy - outward.y * length * 0.5 };
  const head = Math.max(3, TILE_SIZE * 0.15);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1, TILE_SIZE * 0.045);
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(end.x + outward.y * head + outward.x * head, end.y - outward.x * head + outward.y * head);
  ctx.lineTo(end.x - outward.y * head + outward.x * head, end.y + outward.x * head + outward.y * head);
  ctx.closePath();
  ctx.fill();
}

const APPROACH_WARNING_COLOR = '#ffbe5c';

function drawApproachLabel(
  ctx: CanvasRenderingContext2D,
  state: StationState,
  descriptor: DockingSlotDescriptor,
  text: string,
  color: string,
  warning: string | null = null
): void {
  const anchor = descriptor.anchorTile === null ? null : fromIndex(descriptor.anchorTile, state.width);
  if (!anchor) return;
  const fontPx = Math.max(8, Math.round(TILE_SIZE * 0.29));
  const pad = Math.max(4, Math.round(TILE_SIZE * 0.18));
  ctx.font = `bold ${fontPx}px monospace`;
  const width = Math.min(
    TILE_SIZE * 18,
    Math.max(ctx.measureText(text).width, warning === null ? 0 : ctx.measureText(warning).width) + pad * 2
  );
  const rowHeight = Math.max(17, Math.round(TILE_SIZE * 0.7));
  const height = warning === null ? rowHeight : rowHeight * 2;
  const gap = Math.max(3, TILE_SIZE * 0.13);
  const anchorX = (anchor.x + 0.5) * TILE_SIZE;
  const anchorY = (anchor.y + 0.5) * TILE_SIZE;
  let x = anchorX - width * 0.5;
  let y = anchorY - height * 0.5;
  if (descriptor.facing === 'east') x = anchorX - width - gap;
  else if (descriptor.facing === 'west') x = anchorX + gap;
  else if (descriptor.facing === 'north') y = anchorY + gap;
  else y = anchorY - height - gap;
  x = Math.max(2, Math.min(state.width * TILE_SIZE - width - 2, x));
  y = Math.max(2, Math.min(state.height * TILE_SIZE - height - 2, y));
  ctx.fillStyle = 'rgba(5, 14, 23, 0.92)';
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, TILE_SIZE * 0.04);
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, Math.max(2, TILE_SIZE * 0.1));
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + pad, y + rowHeight * 0.5);
  if (warning !== null) {
    ctx.fillStyle = APPROACH_WARNING_COLOR;
    ctx.fillText(warning, x + pad, y + rowHeight * 1.5);
  }
}

/** A one-tile opening still warns; two is the point where a line can pass. */
const INTERIOR_THROAT_WARNING_TILES = 2;

/**
 * The station-side width behind an interface. `accessTiles` is the berth
 * cluster or the dock collar, so the walkable tiles that touch it from inside
 * are the throat every passenger and cargo job squeezes through. Purely
 * derived from the same descriptor the approach validator already reads —
 * which checks exterior clearance and says nothing about interior access.
 */
function interiorAccessWarning(state: StationState, descriptor: DockingSlotDescriptor): string | null {
  const access = new Set(descriptor.accessTiles);
  const hull = new Set(descriptor.hullTiles);
  const throat = new Set<number>();
  for (const tile of access) {
    const p = fromIndex(tile, state.width);
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
      const x = p.x + dx;
      const y = p.y + dy;
      if (!inBounds(x, y, state.width, state.height)) continue;
      const neighbor = toIndex(x, y, state.width);
      if (access.has(neighbor) || hull.has(neighbor)) continue;
      if (!isWalkable(state.tiles[neighbor])) continue;
      throat.add(neighbor);
    }
  }
  if (throat.size === 0) return 'NO INTERIOR ACCESS';
  const throatNote = throat.size <= INTERIOR_THROAT_WARNING_TILES
    ? `INTERIOR THROAT: ${throat.size} TILE${throat.size === 1 ? '' : 'S'}`
    : null;
  // A Berth boards through its Gangways, so even a wide corridor behind a
  // single collar still serialises the whole manifest. Both facts fit one line.
  let gangwayNote: string | null = null;
  if (descriptor.kind === 'berth') {
    const gangways = state.moduleInstances.filter(
      (module) => module.type === ModuleType.Gangway && module.tiles.some((tile) => access.has(tile))
    ).length;
    const takesBigCalls = descriptor.acceptedSizes.includes('medium') || descriptor.acceptedSizes.includes('large');
    gangwayNote = gangways === 0 ? 'NO GANGWAY' : gangways < 2 && takesBigCalls ? 'NO SECOND GANGWAY' : null;
  }
  if (throatNote && gangwayNote) return `${throatNote} · ${gangwayNote}`;
  return throatNote ?? gangwayNote;
}

function drawApproachEnvelopePreview(
  ctx: CanvasRenderingContext2D,
  state: StationState,
  currentTool: BuildTool,
  hoveredTile: number | null,
  preview: ApproachEnvelopePreview
): void {
  let descriptor: DockingSlotDescriptor | null = null;
  let planning = false;
  if (currentTool.kind === 'module' && currentTool.module === ModuleType.PodDock && hoveredTile !== null) {
    const modulePreview = previewModulePlacement(state, currentTool.module, hoveredTile, state.controls.moduleRotation);
    const podPlacement = getPodDockPlacementView(state, hoveredTile);
    if (podPlacement.facing && modulePreview.tiles.length > 0) {
      descriptor = previewSlotDescriptor(state, `preview:pod:${hoveredTile}`, 'pod-dock', modulePreview.tiles, podPlacement.facing, ['small']);
      planning = true;
    }
  } else if (currentTool.kind === 'room' && currentTool.room === RoomType.Berth && preview.berthPlacementTiles?.length) {
    const tiles = preview.berthPlacementTiles;
    descriptor = previewSlotDescriptor(state, `preview:berth:${tiles[0]}`, 'berth', tiles, exteriorFacingForPreview(state, tiles), ['small', 'medium', 'large']);
    planning = true;
  } else if (preview.candidateSlotId) {
    descriptor = getDockingSlotDescriptors(state).find((slot) => slot.id === preview.candidateSlotId) ?? null;
  } else if (preview.inspectedSlotId) {
    descriptor = getDockingSlotDescriptors(state).find((slot) => slot.id === preview.inspectedSlotId) ?? null;
  }
  if (!descriptor) return;

  const size = preview.candidateShipSize ?? (descriptor.acceptedSizes.includes('large')
    ? 'large'
    : descriptor.acceptedSizes.includes('medium') ? 'medium' : 'small');
  const liveShip = state.arrivingShips.find((ship) =>
    (ship.assignedDockSourceKey && descriptor!.id === `dock:${ship.assignedDockSourceKey}`) ||
    (ship.assignedBerthAnchor !== null && ship.assignedBerthAnchor !== undefined && descriptor!.id === `berth:${ship.assignedBerthAnchor}`)
  );
  const clearedOffer = liveShip ? null : state.trafficOffers.find((offer) =>
    offer.status === 'cleared' && (
      (offer.assignedDockSourceKey && descriptor!.id === `dock:${offer.assignedDockSourceKey}`) ||
      (offer.assignedBerthAnchor !== null && offer.assignedBerthAnchor !== undefined && descriptor!.id === `berth:${offer.assignedBerthAnchor}`)
    )
  );
  const hullVariant = preview.candidateHullVariant ?? liveShip?.hullVariant ?? clearedOffer?.hullVariant;
  const validation = validateDockingSlot(state, descriptor, size, hullVariant);
  const descriptors = planning ? [...getDockingSlotDescriptors(state), descriptor] : getDockingSlotDescriptors(state);
  const conflictGroups = planning
    ? deriveApproachConflictGroups(descriptors).filter((group) => group.slotIds.includes(descriptor!.id))
    : getApproachConflictGroups(state).filter((group) => group.slotIds.includes(descriptor!.id));
  const acceptedSlotIds = new Set<string>();
  for (const ship of state.arrivingShips) {
    if (ship.stage === 'depart') continue;
    if (ship.assignedDockSourceKey) acceptedSlotIds.add(`dock:${ship.assignedDockSourceKey}`);
    if (ship.assignedBerthAnchor !== null && ship.assignedBerthAnchor !== undefined) {
      acceptedSlotIds.add(`berth:${ship.assignedBerthAnchor}`);
    }
  }
  for (const offer of state.trafficOffers) {
    if (offer.status !== 'cleared') continue;
    if (offer.assignedDockSourceKey) acceptedSlotIds.add(`dock:${offer.assignedDockSourceKey}`);
    if (offer.assignedBerthAnchor !== null && offer.assignedBerthAnchor !== undefined) {
      acceptedSlotIds.add(`berth:${offer.assignedBerthAnchor}`);
    }
  }
  const acceptedConflictSlotIds = [...new Set(
    conflictGroups.flatMap((group) => group.slotIds)
      .filter((slotId) => slotId !== descriptor!.id && acceptedSlotIds.has(slotId))
  )];
  const acceptedConflictLabels = acceptedConflictSlotIds.map((slotId) => {
    if (slotId.startsWith('dock:')) {
      const sourceKey = slotId.slice('dock:'.length);
      const dock = state.docks.find((candidate) => candidate.sourceKey === sourceKey);
      return dock ? `Pod Dock ${dock.id}` : 'Pod Dock';
    }
    if (slotId.startsWith('berth:')) return `Berth ${slotId.slice('berth:'.length)}`;
    return slotId;
  });
  const conflictsWithAcceptedWork = acceptedConflictSlotIds.length > 0;
  const color = conflictsWithAcceptedWork
    ? '#ff9d66'
    : !validation.valid ? '#ff7676' : conflictGroups.length > 0 ? '#ffd36a' : '#72dff2';
  const envelope = hullVariant ? envelopeForHull(descriptor, hullVariant) : descriptor.envelopesBySize[size];
  const ingress = approachRectPx(state, envelope.ingress.bounds);
  const mooring = approachRectPx(state, envelope.mooring.bounds);
  ctx.save();
  ctx.fillStyle = conflictsWithAcceptedWork
    ? 'rgba(255, 126, 72, 0.18)'
    : !validation.valid ? 'rgba(255, 82, 82, 0.15)' : conflictGroups.length > 0 ? 'rgba(255, 194, 76, 0.14)' : 'rgba(88, 222, 201, 0.12)';
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, TILE_SIZE * 0.045);
  ctx.setLineDash([Math.max(3, TILE_SIZE * 0.15), Math.max(2, TILE_SIZE * 0.11)]);
  ctx.fillRect(ingress.x, ingress.y, ingress.w, ingress.h);
  ctx.strokeRect(ingress.x + 0.5, ingress.y + 0.5, ingress.w - 1, ingress.h - 1);
  ctx.setLineDash([]);
  ctx.fillStyle = conflictsWithAcceptedWork
    ? 'rgba(255, 136, 79, 0.3)'
    : !validation.valid ? 'rgba(255, 90, 90, 0.25)' : conflictGroups.length > 0 ? 'rgba(255, 202, 86, 0.24)' : 'rgba(88, 226, 204, 0.2)';
  ctx.fillRect(mooring.x, mooring.y, mooring.w, mooring.h);
  ctx.strokeRect(mooring.x + 0.5, mooring.y + 0.5, mooring.w - 1, mooring.h - 1);
  drawApproachArrow(ctx, ingress, descriptor.facing, color);
  ctx.restore();

  const reason = validation.hardReasons[0];
  const facingTraffic = state.laneProfiles[descriptor.facing]?.trafficVolume ?? 1;
  const anchorTile = descriptor.anchorTile ?? descriptor.hullTiles[0] ?? 0;
  const conditions = mapConditionSamplesAt(state, anchorTile);
  const debris = conditions.find((sample) => sample.kind === 'debris-risk');
  const sunlight = conditions.find((sample) => sample.kind === 'sunlight');
  const thermal = conditions.find((sample) => sample.kind === 'thermal-sink');
  const trafficLabel = facingTraffic >= 1.25 ? 'BUSY' : facingTraffic <= 0.78 ? 'QUIET' : 'STEADY';
  const environmentLabel = debris && debris.value >= 0.68
    ? 'DEBRIS EXPOSED'
    : thermal && thermal.value >= 0.68
      ? 'COOL POCKET'
      : sunlight && sunlight.value >= 0.68 ? 'BRIGHT' : 'SHELTERED';
  const projectedOffer = preview.candidateOfferId === null || preview.candidateOfferId === undefined
    ? null
    : state.trafficOffers.find((offer) => offer.id === preview.candidateOfferId) ?? null;
  const liveAlignment = projectedOffer
    ? approachLaneAlignment(projectedOffer.lane, descriptor.facing)
    : liveShip ? approachLaneAlignment(liveShip.lane, descriptor.facing) : null;
  const geometry = `${descriptor.facing.toUpperCase()} ${trafficLabel} · ${environmentLabel}`;
  // Charter lane weight is exactly what decides a contested face, so it stays
  // on the blocked/serialising/conflicting branches too — those are the ones
  // the player reads while choosing between frontages.
  const label = conflictsWithAcceptedWork
    ? `ACCEPTED WORK CONFLICT: ${acceptedConflictLabels.join(', ')} · ${trafficLabel}`
    : reason
    ? `APPROACH BLOCKED: ${reason} · ${trafficLabel}`
    : conflictGroups.length > 0
      ? `APPROACH SERIALIZES: ${conflictGroups.length} GROUP${conflictGroups.length === 1 ? '' : 'S'} · ${trafficLabel}`
      : liveAlignment && liveAlignment.label !== 'direct'
        ? `${geometry} · ${liveAlignment.label.toUpperCase()} ROUTE`
        : `APPROACH CLEAR · ${geometry}`;
  drawApproachLabel(ctx, state, descriptor, label, color, interiorAccessWarning(state, descriptor));
}

function agentOffset(id: number): { x: number; y: number } {
  const ox = ((id * 17) % 7) - 3;
  const oy = ((id * 29) % 7) - 3;
  return { x: ox * 0.08, y: oy * 0.08 };
}

function seatedAgentOffset(state: StationState, tileIndex: number, id: number): { x: number; y: number } {
  const module = state.moduleInstances.find((candidate) => candidate.tiles.includes(tileIndex));
  if (!module) return agentOffset(id);
  if (module.type === ModuleType.Table) {
    // The table sprite has four rendered chairs around its 2x2 footprint.
    // Place each diner on the matching chair instead of over the tabletop.
    const local = Math.max(0, module.tiles.indexOf(tileIndex));
    const offsets = [
      { x: -0.16, y: 0.24 },
      { x: 0.16, y: 0.24 },
      { x: -0.16, y: -0.05 },
      { x: 0.16, y: -0.05 }
    ];
    return offsets[local] ?? { x: 0, y: 0 };
  }
  if (
    module.type === ModuleType.Bench ||
    module.type === ModuleType.Couch ||
    module.type === ModuleType.GameStation ||
    module.type === ModuleType.RecUnit
  ) return { x: 0, y: 0 };
  return agentOffset(id);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function nowSec(): number {
  return (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
}

function mixChannel(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function toHex(r: number, g: number, b: number): string {
  const hex = (n: number): string => n.toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

function visitorMoodScore(state: StationState, visitorIndex: number): number {
  const v = state.visitors[visitorIndex];
  const patiencePressure = clamp01(v.patience / 80);
  let score = 0.55 - patiencePressure * 0.6;
  if (v.servedMeal) score += 0.22;
  if (v.state === VisitorState.Eating || v.state === VisitorState.Leisure) score += 0.14;
  if (v.state === VisitorState.ToDock) score -= 0.1;
  if (v.state === VisitorState.Queueing || v.state === VisitorState.ToCafeteria) score -= 0.05;
  return clamp01(score);
}

function visitorMoodColor(state: StationState, visitorIndex: number): string {
  // 0.0 -> red, 0.5 -> yellow, 1.0 -> green.
  const t = visitorMoodScore(state, visitorIndex);
  if (t <= 0.5) {
    const k = clamp01(t / 0.5);
    const r = mixChannel(232, 244, k);
    const g = mixChannel(97, 229, k);
    const b = mixChannel(97, 140, k);
    return toHex(r, g, b);
  }
  const k = clamp01((t - 0.5) / 0.5);
  const r = mixChannel(244, 128, k);
  const g = mixChannel(229, 231, k);
  const b = mixChannel(140, 142, k);
  return toHex(r, g, b);
}

type WorldThoughtTone = 'neutral' | 'positive' | 'negative';

interface WorldThought {
  text: string;
  tone: WorldThoughtTone;
}

function visitorThoughtVariant(visitorId: number, lines: readonly string[], salt: number): string {
  return lines[Math.abs(visitorId * 17 + salt * 31) % lines.length];
}

function shouldVoiceRouteComplaint(state: StationState, visitorId: number, salt: number): boolean {
  const window = Math.floor(state.now / 14);
  return Math.abs(visitorId * 19 + window * 11 + salt * 7) % 3 === 0;
}

function visitorRecentlyCompletedRetail(state: StationState, visitorId: number): boolean {
  for (let i = state.serviceLog.recent.length - 1; i >= 0; i -= 1) {
    const event = state.serviceLog.recent[i];
    if (state.now - event.at > 16) break;
    if (event.population === 'visitor' && event.actorId === visitorId && event.service === 'retail') return true;
  }
  return false;
}

function marketStockAtTile(state: StationState, tileIndex: number): number | null {
  const moduleId = state.moduleOccupancyByTile[tileIndex];
  const module = moduleId === null
    ? null
    : state.moduleInstances.find((candidate) => candidate.id === moduleId) ?? null;
  if (!module) return state.modules[tileIndex] === ModuleType.MarketStall ? itemStockAtNode(state, tileIndex, 'tradeGood') : null;
  if (module.type === ModuleType.MarketStall) return itemStockAtNode(state, module.originTile, 'tradeGood');
  if (module.type === ModuleType.ShelfAisle) {
    const status = getMarketFixtureStatus(state, module.id);
    return status?.kind === 'shelf' ? status.available : null;
  }
  return null;
}

function visitorFailureThought(visitor: StationState['visitors'][number]): WorldThought | null {
  const need = visitor.failureNeed;
  const needText = need === 'hunger'
    ? 'food'
    : need === 'energy'
      ? 'a place to rest'
      : need === 'hygiene'
        ? 'somewhere to wash'
        : need === 'leisure'
          ? 'somewhere to relax'
          : null;
  if (!needText) return null;
  if (visitor.serviceFailureStage === 'disruptive') return { text: `I need ${needText} now!`, tone: 'negative' };
  if (visitor.serviceFailureStage === 'distressed') return { text: `I still need ${needText}!`, tone: 'negative' };
  if (visitor.serviceFailureStage === 'balking') return { text: `I cannot find ${needText}`, tone: 'negative' };
  // First rung of the failed-stay ladder. It is deliberately the quiet one: a
  // neutral want, not a complaint, so the three escalations above still read
  // as escalations when they arrive.
  if (visitor.serviceFailureStage === 'unmet') return { text: `Looking for ${needText}`, tone: 'neutral' };
  return null;
}

function visitorWorldThought(state: StationState, visitor: StationState['visitors'][number]): WorldThought | null {
  if (visitor.healthState === 'critical') return { text: 'I need help!', tone: 'negative' };
  if ((visitor.angryUntil ?? 0) > state.now) return { text: "I'm leaving!", tone: 'negative' };
  if (visitor.movementWaitReason === 'cargo crossing blocking boarding') {
    return { text: 'CARGO BLOCKING BOARDING', tone: 'negative' };
  }
  if (visitor.movementWaitReason === 'no public meal service') {
    return { text: 'No public food?', tone: 'negative' };
  }
  if (visitor.strandedFromShipId !== null && visitor.strandedFromShipId !== undefined) {
    return { text: 'My ship left. I need transport.', tone: 'negative' };
  }
  const failureThought = visitorFailureThought(visitor);
  const quietFailureStage =
    visitor.serviceFailureStage === 'balking' || visitor.serviceFailureStage === 'unmet';
  if (failureThought && !quietFailureStage) return failureThought;
  if (failureThought && shouldVoiceRouteComplaint(state, visitor.id, 5)) return failureThought;
  const hasEnteredStation =
    state.now - visitor.spawnedAt >= 4 &&
    state.rooms[visitor.tileIndex] !== RoomType.Berth &&
    state.tiles[visitor.tileIndex] !== TileType.Dock;
  if (!hasEnteredStation) return null;
  const sanitation = getSanitationTileDiagnostic(
    state,
    visitor.tileIndex % state.width,
    Math.floor(visitor.tileIndex / state.width)
  );
  if (sanitation?.severity === 'filthy') {
    return {
      text: visitorThoughtVariant(visitor.id, ['This place is a dump!', 'This place is filthy!', 'Does anyone clean here?'], 1),
      tone: 'negative'
    };
  }
  if (sanitation?.severity === 'dirty') {
    return { text: visitorThoughtVariant(visitor.id, ['This place is a mess', 'The floors are disgusting'], 2), tone: 'negative' };
  }
  if (visitor.state === VisitorState.Queueing && visitor.movementWaitReason) {
    const blocked = visitor.movementWaitReason.includes('blocked') || visitor.movementWaitReason.includes('full');
    return { text: blocked ? 'QUEUE BLOCKED' : 'WAITING FOR SERVICE', tone: blocked ? 'negative' : 'neutral' };
  }
  if (
    visitor.state === VisitorState.Queueing &&
    visitor.path.length === 0 &&
    state.metrics.cafeteriaQueueingCount >= 3
  ) return { text: 'This line is too long', tone: 'negative' };
  if (visitor.state === VisitorState.ToCafeteria && !visitor.servedMeal) return { text: "I'm hungry", tone: 'neutral' };
  if (visitor.state === VisitorState.ToLeisure && visitor.activeService) {
    const blockedFor = visitor.serviceBlockedSince === null || visitor.serviceBlockedSince === undefined
      ? 0
      : state.now - visitor.serviceBlockedSince;
    const requestText: Record<Exclude<typeof visitor.activeService, null>, string> = {
      meal: "I'm hungry",
      drink: visitor.carryingDrink
        ? blockedFor >= 6 ? 'There is nowhere to sit!' : 'Looking for a seat'
        : blockedFor >= 6 ? 'Where can I get a drink?' : "I'd like a drink",
      leisure: blockedFor >= 6 ? 'Is there nowhere to sit?' : 'I need somewhere to relax',
      restroom: blockedFor >= 6 ? 'Where is the restroom?' : 'I need a restroom',
      hygiene: blockedFor >= 6 ? 'Are there no showers?' : 'I need to wash up',
      comfort: blockedFor >= 6 ? 'These facilities are basic' : "I'd like something nicer"
    };
    return { text: requestText[visitor.activeService], tone: blockedFor >= 6 ? 'negative' : 'neutral' };
  }
  if (visitor.healthState === 'distressed' && airQualityAt(state, visitor.tileIndex) <= 15) {
    return { text: 'The air feels wrong', tone: 'negative' };
  }

  const environment = getRoomEnvironmentTileDiagnostic(
    state,
    visitor.tileIndex % state.width,
    Math.floor(visitor.tileIndex / state.width)
  );
  const route = visitor.lastRouteExposure;
  if ((route?.cargoTiles ?? 0) >= 7 && shouldVoiceRouteComplaint(state, visitor.id, 1)) {
    return { text: 'Why am I walking through cargo?', tone: 'negative' };
  }
  if ((route?.distance ?? 0) >= 32 && shouldVoiceRouteComplaint(state, visitor.id, 2)) {
    return { text: 'Everything is so far away', tone: 'negative' };
  }
  if (environment && environment.visitorDiscomfort >= 1.5) {
    return {
      text: environment.serviceNoise >= 1.1 ? "It's too noisy in here" : 'This area feels industrial',
      tone: 'negative'
    };
  }

  const room = state.rooms[visitor.tileIndex];
  if (visitor.state === VisitorState.Eating) {
    return { text: visitorThoughtVariant(visitor.id, ['This food is great!', 'Exactly what I needed'], 3), tone: 'positive' };
  }
  if (visitor.state === VisitorState.Leisure) {
    if (room === RoomType.Observatory) return { text: 'What a view!', tone: 'positive' };
    if (room === RoomType.Cantina) {
      // Only praise the drinks if the bar this guest is standing at can
      // actually pour one. A dry bar gets no compliment.
      const barHere = barGroupAtTile(state, visitor.tileIndex);
      const barStock = barHere ? barGroupStock(state, barHere) : 1;
      if (barStock > 0) return { text: 'Great drinks!', tone: 'positive' };
      return { text: 'The bar is dry', tone: 'negative' };
    }
    if (room === RoomType.Market) {
      // Praise the SELECTION only when a shelf this guest would actually want
      // is stocked. `shelfAppealFor` returns 0 when nothing suitable exists,
      // which is what stops the station complimenting itself on empty shelves.
      const suitable = shelfAppealFor(state, visitor.primaryPreference);
      if (visitorRecentlyCompletedRetail(state, visitor.id) && suitable > 0) {
        return { text: 'Good selection!', tone: 'positive' };
      }
      if (marketStockAtTile(state, visitor.tileIndex) === 0) return { text: 'These shelves are empty', tone: 'negative' };
      if (suitable === 0) return { text: 'Nothing here I want', tone: 'negative' };
    }
    if (room === RoomType.Hygiene && sanitation?.severity === 'clean') {
      return { text: 'These facilities are spotless!', tone: 'positive' };
    }
    if (room === RoomType.Lounge || room === RoomType.RecHall) {
      return {
        text: visitorThoughtVariant(visitor.id, ['This lounge is really nice!', 'I could stay here awhile'], 4),
        tone: 'positive'
      };
    }
  }
  if (visitor.state === VisitorState.ToDock && visitor.servedMeal && visitor.patience < 18) {
    return { text: visitorThoughtVariant(visitor.id, ["I'd come back here", 'That was a good stop'], 5), tone: 'positive' };
  }
  if (
    environment &&
    environment.visitorStatus >= 0.75 &&
    environment.publicAppeal >= 0.75 &&
    sanitation?.severity === 'clean'
  ) {
    return {
      text: visitorThoughtVariant(visitor.id, ['These facilities are really nice!', 'This station is impressive!'], 6),
      tone: 'positive'
    };
  }
  return null;
}

function residentWorldThought(state: StationState, resident: StationState['residents'][number]): string | null {
  if (resident.healthState === 'critical') return 'I need help!';
  const sanitation = getSanitationTileDiagnostic(
    state,
    resident.tileIndex % state.width,
    Math.floor(resident.tileIndex / state.width)
  );
  if (sanitation?.severity === 'filthy') return 'This place is filthy';
  if (resident.state === ResidentState.Eating) return 'Having a meal';
  if (resident.state === ResidentState.ToCafeteria) {
    return resident.carryingMeal ? 'Looking for a seat' : resident.serveTimer !== undefined ? 'Getting a meal' : 'Waiting for a meal';
  }
  if (resident.state === ResidentState.Sleeping) return 'Sleeping';
  if (resident.state === ResidentState.ToDorm) return 'Heading to my bunk';
  if (resident.state === ResidentState.Cleaning) return 'Using the facilities';
  if (resident.state === ResidentState.ToHygiene) return 'Waiting for the facilities';
  if (resident.state === ResidentState.Leisure) return 'Unwinding';
  if (resident.hunger < 35) return "I'm hungry";
  if (resident.hygiene < 30) return 'I need a wash';
  if (resident.safety < 35) return "I don't feel safe";
  if (resident.stress > 75) return 'This place is stressful';
  if (resident.social < 30) return 'I need somewhere to relax';
  if (resident.healthState === 'distressed' && airQualityAt(state, resident.tileIndex) <= 15) return 'The air feels wrong';
  return null;
}

function crewWorldThought(state: StationState, crew: StationState['crewMembers'][number]): string | null {
  if (crew.healthState === 'critical') return 'I need help!';
  if (crew.movementWaitReason === 'passenger flow blocking freight') return 'PASSENGERS BLOCKING FREIGHT';
  if (crew.healthState === 'distressed' && airQualityAt(state, crew.tileIndex) <= 15) return 'The air feels wrong';
  if (crew.resignationNoticeAt !== null) return "I can't keep working like this";
  if (crew.missedPayrollCycles > 0) return "I haven't been paid";
  if (isCrewHoldingProtectedPost(state, crew) && Math.min(crew.energy, crew.hunger, crew.hygiene, crew.bladder, crew.thirst) < 48) {
    return 'Holding post until relief arrives';
  }
  if (crew.morale < 30) return 'Morale is awful';
  if (crew.eating || crew.carryingMeal) {
    return crew.eatSessionActive ? 'Meal break' : crew.carryingMeal ? 'Looking for a seat' : 'Getting a meal';
  }
  if (crew.hunger < 48) return "I'm hungry";
  if (crew.toileting) {
    return crew.toiletSessionActive ? 'Using the restroom' : crew.path.length > 0 ? 'Heading to the restroom' : 'Finding a restroom';
  }
  if (crew.bladder < 40) return 'I need a restroom';
  if (crew.drinking) {
    return crew.drinkSessionActive ? 'Having a drink' : crew.path.length > 0 ? 'Getting a drink' : 'Finding a drink';
  }
  if (crew.thirst < 45) return 'I need a drink';
  if (crew.resting) {
    return crew.restSessionActive ? 'Resting' : crew.path.length > 0 ? 'Heading to a bunk' : 'Finding a bunk';
  }
  if (crew.energy < 55) return 'I need a bunk';
  if (crew.cleaning) {
    return crew.cleanSessionActive ? 'Cleaning up' : crew.path.length > 0 ? 'Going to wash up' : 'Finding somewhere to wash';
  }
  if (crew.hygiene < 48) return 'I need a wash';
  if (crew.leisure) return 'I need a break';
  return null;
}

function drawWorldThought(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  urgent: boolean,
  tone: WorldThoughtTone = 'neutral'
): void {
  ctx.save();
  const thoughtFont = `700 ${Math.max(8, Math.round(TILE_SIZE * 0.48))}px Consolas, Menlo, monospace`;
  ctx.font = thoughtFont;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const iconSpace = Math.max(15, TILE_SIZE * 0.8);
  const width = Math.min(TILE_SIZE * 7.5, Math.max(TILE_SIZE * 2.8, ctx.measureText(text).width + iconSpace + 16));
  const height = Math.max(17, TILE_SIZE * 0.95);
  const top = cy - TILE_SIZE * 1.65 - height;
  ctx.fillStyle = 'rgba(5, 11, 17, 0.94)';
  ctx.strokeStyle = urgent || tone === 'negative' ? '#ff6868' : tone === 'positive' ? '#72dfa2' : '#dbe8f5';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(cx - width / 2, top, width, height, 4);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - 4, top + height);
  ctx.lineTo(cx, top + height + 5);
  ctx.lineTo(cx + 4, top + height);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  const iconX = cx - width / 2 + iconSpace * 0.62;
  const iconY = top + height * 0.5;
  ctx.strokeStyle = urgent || tone === 'negative' ? '#ff8d85' : tone === 'positive' ? '#78e8a8' : '#ffd36a';
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = Math.max(1.2, TILE_SIZE * 0.07);
  if (text.includes('hungry')) {
    ctx.beginPath();
    ctx.arc(iconX + iconSpace * 0.08, iconY, iconSpace * 0.22, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(iconX - iconSpace * 0.3, iconY - iconSpace * 0.28);
    ctx.lineTo(iconX - iconSpace * 0.3, iconY + iconSpace * 0.3);
    ctx.stroke();
    for (const offset of [-0.38, -0.3, -0.22]) {
      ctx.beginPath();
      ctx.moveTo(iconX + iconSpace * offset, iconY - iconSpace * 0.3);
      ctx.lineTo(iconX + iconSpace * offset, iconY - iconSpace * 0.06);
      ctx.stroke();
    }
  } else if (text.includes('line')) {
    for (const offset of [-0.24, 0, 0.24]) {
      ctx.beginPath();
      ctx.arc(iconX + iconSpace * offset, iconY, Math.max(1.6, iconSpace * 0.09), 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (text.includes('filthy') || text.includes('dump') || text.includes('mess') || text.includes('disgusting')) {
    for (const [ox, oy, radius] of [[-0.2, 0.12, 0.09], [0.05, -0.18, 0.07], [0.22, 0.16, 0.11]] as const) {
      ctx.beginPath();
      ctx.arc(iconX + iconSpace * ox, iconY + iconSpace * oy, iconSpace * radius, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (tone === 'positive') {
    for (const [ox, oy, radius] of [[0, 0, 0.09], [-0.24, 0.1, 0.05], [0.2, -0.16, 0.045]] as const) {
      ctx.beginPath();
      ctx.arc(iconX + iconSpace * ox, iconY + iconSpace * oy, iconSpace * radius, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (text.includes('air')) {
    for (const offset of [-0.2, 0, 0.2]) {
      ctx.beginPath();
      ctx.moveTo(iconX - iconSpace * 0.3, iconY + iconSpace * offset);
      ctx.quadraticCurveTo(
        iconX,
        iconY + iconSpace * (offset - 0.18),
        iconX + iconSpace * 0.3,
        iconY + iconSpace * offset
      );
      ctx.stroke();
    }
  } else if (text.includes('help')) {
    ctx.fillRect(iconX - iconSpace * 0.08, iconY - iconSpace * 0.3, iconSpace * 0.16, iconSpace * 0.6);
    ctx.fillRect(iconX - iconSpace * 0.3, iconY - iconSpace * 0.08, iconSpace * 0.6, iconSpace * 0.16);
  } else if (text.includes('restroom')) {
    ctx.font = `700 ${Math.max(7, Math.round(iconSpace * 0.55))}px Consolas, Menlo, monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('WC', iconX, iconY + 0.5);
  } else if (text.includes('drink')) {
    ctx.strokeRect(iconX - iconSpace * 0.22, iconY - iconSpace * 0.22, iconSpace * 0.36, iconSpace * 0.45);
    ctx.beginPath();
    ctx.arc(iconX + iconSpace * 0.16, iconY, iconSpace * 0.16, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
  } else if (text.includes('bunk')) {
    ctx.font = `700 ${Math.max(9, Math.round(iconSpace * 0.7))}px Consolas, Menlo, monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('Z', iconX, iconY + 0.5);
  } else if (text.includes('wash')) {
    ctx.beginPath();
    ctx.moveTo(iconX, iconY - iconSpace * 0.32);
    ctx.quadraticCurveTo(iconX - iconSpace * 0.3, iconY + iconSpace * 0.08, iconX, iconY + iconSpace * 0.3);
    ctx.quadraticCurveTo(iconX + iconSpace * 0.3, iconY + iconSpace * 0.08, iconX, iconY - iconSpace * 0.32);
    ctx.stroke();
  } else if (text.includes('break')) {
    for (const offset of [-0.2, 0, 0.2]) {
      ctx.beginPath();
      ctx.arc(iconX + iconSpace * offset, iconY, Math.max(1.4, iconSpace * 0.07), 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    ctx.beginPath();
    ctx.moveTo(iconX - iconSpace * 0.28, iconY);
    ctx.lineTo(iconX + iconSpace * 0.2, iconY);
    ctx.lineTo(iconX + iconSpace * 0.04, iconY - iconSpace * 0.18);
    ctx.moveTo(iconX + iconSpace * 0.2, iconY);
    ctx.lineTo(iconX + iconSpace * 0.04, iconY + iconSpace * 0.18);
    ctx.stroke();
  }
  ctx.fillStyle = urgent ? '#ffb0aa' : '#f4f8fb';
  ctx.font = thoughtFont;
  ctx.textAlign = 'left';
  const textX = cx - width / 2 + iconSpace + 8;
  ctx.fillText(text, textX, top + height * 0.5 + 0.5, width - iconSpace - 12);
  ctx.restore();
}

function rgba(r: number, g: number, b: number, a: number): string {
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a.toFixed(3)})`;
}

function mixRgba(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
  alpha: number
): string {
  const k = clamp01(t);
  return rgba(mixChannel(a[0], b[0], k), mixChannel(a[1], b[1], k), mixChannel(a[2], b[2], k), alpha);
}

function diagnosticOverlayCacheKey(
  state: StationState,
  overlay: DiagnosticOverlay,
  focusedUtilityKind?: UtilityUnderlayKind
): string {
  const debtKey =
    overlay === 'maintenance'
      ? state.maintenanceDebts
          .map((debt) => `${debt.key}:${Math.round(debt.debt)}`)
          .sort()
          .join(',')
      : '';
  // Fire signature drives cache busting on the air overlay so a flare-up
  // visibly degrades local oxygen mid-frame.
  const fireKey =
    overlay === 'life-support'
      ? state.effects.fires.map((f) => `${f.anchorTile}:${Math.round(f.intensity / 4)}`).sort().join(',')
      : '';
  const routeKey =
    overlay === 'route-pressure'
      ? [
          state.visitors.map((actor) => `${actor.id}:${actor.path.length}:${actor.path[0] ?? -1}:${actor.path[actor.path.length - 1] ?? -1}`).join(','),
          state.residents.map((actor) => `${actor.id}:${actor.path.length}:${actor.path[0] ?? -1}:${actor.path[actor.path.length - 1] ?? -1}`).join(','),
          state.crewMembers
            .map((actor) => `${actor.id}:${actor.activeJobId ?? 'post'}:${actor.path.length}:${actor.path[0] ?? -1}:${actor.path[actor.path.length - 1] ?? -1}`)
            .join(',')
        ].join('|')
      : '';
  const sanitationKey =
    overlay === 'sanitation'
      ? `${state.metrics.dirtyTiles}:${state.metrics.filthyTiles}:${Math.round(state.metrics.sanitationMax)}:${sanitationRenderSignature(state)}`
      : '';
  const mapKey = overlay === 'map-conditions' ? `${state.seedAtCreation}:${state.mapConditionVersion}` : '';
  const thermalKey =
    overlay === 'thermal'
      ? [
          Math.round(state.metrics.thermalAvg),
          Math.round(state.metrics.thermalMax),
          state.metrics.hotTiles,
          state.metrics.staleAirTiles,
          Math.round(state.metrics.coolingLoad)
        ].join(':')
      : '';
  const utilityKey =
    overlay === 'utility-underlay'
      ? [
          focusedUtilityKind ?? 'all',
          state.utilityUnderlay.version,
          state.metrics.airNetworkPoweredVents,
          state.metrics.airNetworkUnpoweredVents,
          state.metrics.disconnectedAirDuctTiles
        ].join(':')
      : '';
  const reputationKey =
    overlay === 'reputation'
      ? [
          Math.round(state.metrics.reputationPrestigeAvg),
          Math.round(state.metrics.reputationNotorietyAvg),
          Math.round(state.metrics.reputationCrimePressureAvg),
          state.metrics.reputationHighRiskZones,
          state.incidents.map((incident) => `${incident.id}:${incident.stage}:${incident.tileIndex}:${Math.round(incident.severity * 10)}`).join(',')
        ].join(':')
      : '';
  return [
    overlay,
    state.width,
    state.height,
    state.topologyVersion,
    state.roomVersion,
    state.moduleVersion,
    state.metrics.lifeSupportCoveragePct.toFixed(1),
    state.metrics.poorLifeSupportTiles,
    state.metrics.lifeSupportActiveNodes,
    state.metrics.activeCriticalStaff.lifeSupport,
    state.ops.lifeSupportActive,
    state.ops.lifeSupportTotal,
    debtKey,
    fireKey,
    routeKey,
    sanitationKey,
    mapKey,
    thermalKey,
    utilityKey,
    reputationKey
  ].join('|');
}

function lifeSupportDiagnosticColor(
  state: StationState,
  tileIndex: number,
  coverage: LifeSupportCoverageDiagnostic
): string | null {
  if (state.tiles[tileIndex] === TileType.Space || state.tiles[tileIndex] === TileType.Wall) return null;
  const pos = fromIndex(tileIndex, state.width);
  const diagnostic = getLifeSupportTileDiagnostic(state, pos.x, pos.y, coverage);
  if (!diagnostic?.walkablePressurized) return null;
  // Prefer the live local air value when available — it folds in coverage
  // distance, fire suppression, and pressurization in one number that the
  // exposure check actually reads. Falls back to the static coverage diagnostic
  // when the local map hasn't been computed yet.
  const local = state.airQualityByTile[tileIndex];
  if (Number.isFinite(local) && local >= 0) {
    if (local <= 25) {
      const t = clamp01((25 - local) / 25);
      return mixRgba([238, 120, 84], [200, 40, 40], t, 0.32 + t * 0.18);
    }
    if (local <= 60) {
      const t = clamp01((60 - local) / 35);
      return mixRgba([255, 213, 94], [238, 120, 84], t, 0.18 + t * 0.16);
    }
    const t = clamp01((100 - local) / 40);
    return mixRgba([55, 211, 230], [255, 213, 94], t, 0.14 + t * 0.08);
  }
  if (!diagnostic.hasLifeSupportSystem) return null;
  if (diagnostic.noActiveSource) return rgba(232, 89, 89, 0.34);
  if (!diagnostic.reachable) return rgba(238, 79, 79, 0.4);
  const distance = diagnostic.distance ?? 0;
  if (!diagnostic.poorCoverage) {
    const t = clamp01(distance / 18);
    return mixRgba([55, 211, 230], [255, 213, 94], t, 0.18 + t * 0.08);
  }
  const t = clamp01((distance - 18) / 14);
  return mixRgba([255, 188, 82], [238, 79, 79], t, 0.3 + t * 0.08);
}

function lifeSupportPlanningColor(
  state: StationState,
  tileIndex: number,
  coverage: LifeSupportCoverageDiagnostic
): string | null {
  if (state.tiles[tileIndex] === TileType.Space || state.tiles[tileIndex] === TileType.Wall) return null;
  const pos = fromIndex(tileIndex, state.width);
  const diagnostic = getLifeSupportTileDiagnostic(state, pos.x, pos.y, coverage);
  if (!diagnostic?.walkablePressurized) return null;
  if (!diagnostic.hasLifeSupportSystem) return null;
  if (diagnostic.noActiveSource) return rgba(232, 89, 89, 0.28);
  if (!diagnostic.reachable) return rgba(238, 79, 79, 0.34);
  const distance = diagnostic.distance ?? 0;
  if (!diagnostic.poorCoverage) {
    const t = clamp01(distance / 18);
    return mixRgba([55, 211, 230], [255, 213, 94], t, 0.13 + t * 0.08);
  }
  const t = clamp01((distance - 18) / 16);
  return mixRgba([255, 188, 82], [238, 79, 79], t, 0.24 + t * 0.12);
}

function signedDiagnosticColor(value: number, positive: [number, number, number], negative: [number, number, number]): string | null {
  if (Math.abs(value) < 0.12) return null;
  const t = clamp01(Math.abs(value) / 2.4);
  const base: [number, number, number] = value >= 0 ? positive : negative;
  const alpha = 0.11 + t * 0.23;
  return rgba(base[0], base[1], base[2], alpha);
}

function environmentDiagnosticColor(state: StationState, tileIndex: number, overlay: DiagnosticOverlay): string | null {
  if (state.tiles[tileIndex] === TileType.Space || state.tiles[tileIndex] === TileType.Wall) return null;
  const pos = fromIndex(tileIndex, state.width);
  const diagnostic = getRoomEnvironmentTileDiagnostic(state, pos.x, pos.y);
  if (!diagnostic || diagnostic.sampledTiles <= 0) return null;
  if (overlay === 'visitor-status') {
    const value = diagnostic.visitorStatus + diagnostic.publicAppeal * 0.35 - diagnostic.serviceNoise * 0.25;
    return signedDiagnosticColor(value, [82, 209, 167], [238, 104, 84]);
  }
  if (overlay === 'resident-comfort') {
    const value = diagnostic.residentialComfort + diagnostic.publicAppeal * 0.12 - diagnostic.serviceNoise * 0.35;
    return signedDiagnosticColor(value, [110, 219, 143], [238, 120, 74]);
  }
  if (overlay === 'service-noise') {
    if (diagnostic.serviceNoise <= 0.15) return null;
    const t = clamp01(diagnostic.serviceNoise / 2.6);
    return mixRgba([255, 214, 92], [238, 79, 79], t, 0.12 + t * 0.28);
  }
  return null;
}

function maintenanceDiagnosticColor(state: StationState, tileIndex: number): string | null {
  const pos = fromIndex(tileIndex, state.width);
  const diagnostic = getMaintenanceTileDiagnostic(state, pos.x, pos.y);
  if (!diagnostic) {
    const tile = state.tiles[tileIndex];
    if (tile === TileType.Space || tile === TileType.Truss) {
      const debris = mapConditionSamplesAt(state, tileIndex).find((s) => s.kind === 'debris-risk')?.value ?? 0;
      if (debris >= 0.58) return mixRgba([176, 124, 255], [238, 79, 79], Math.min(1, (debris - 0.58) / 0.42), 0.08 + debris * 0.08);
    }
    return null;
  }
  if (diagnostic.debt <= 0) return rgba(110, 219, 143, 0.1);
  if (diagnostic.debt < 35) return rgba(110, 219, 143, 0.14);
  if (diagnostic.debt < 65) return rgba(255, 214, 92, 0.26);
  return rgba(238, 79, 79, 0.38);
}

function sanitationDiagnosticColor(state: StationState, tileIndex: number): string | null {
  if (state.tiles[tileIndex] === TileType.Space || state.tiles[tileIndex] === TileType.Wall) return null;
  const dirt = state.dirtByTile[tileIndex] ?? 0;
  if (dirt < 8) return null;
  if (dirt < 25) return rgba(110, 219, 143, 0.1);
  if (dirt < SANITATION_RENDER_DIRTY) return rgba(255, 214, 92, 0.18);
  if (dirt < 78) return rgba(238, 120, 74, 0.3);
  return rgba(126, 74, 45, 0.44);
}

const SANITATION_RENDER_DIRTY = 32;

function thermalDiagnosticColor(state: StationState, tileIndex: number): string | null {
  const tile = state.tiles[tileIndex];
  if (tile === TileType.Wall) return null;
  if (tile === TileType.Space || tile === TileType.Truss) {
    const samples = mapConditionSamplesAt(state, tileIndex);
    const sunlight = samples.find((s) => s.kind === 'sunlight')?.value ?? 0;
    const sink = samples.find((s) => s.kind === 'thermal-sink')?.value ?? 0;
    if (sunlight >= 0.56) return mixRgba([255, 214, 92], [255, 146, 70], Math.min(1, (sunlight - 0.56) / 0.44), 0.08 + sunlight * 0.08);
    if (sink >= 0.58) return rgba(55, 211, 230, 0.09 + sink * 0.07);
    return null;
  }
  const pos = fromIndex(tileIndex, state.width);
  const diagnostic = getThermalTileDiagnostic(state, pos.x, pos.y);
  if (!diagnostic) return null;
  const pressure = Math.max(diagnostic.heat, diagnostic.staleAir + 8);
  if (pressure < 46) {
    const cool = clamp01((50 - pressure) / 20);
    return mixRgba([55, 211, 230], [97, 200, 255], cool, 0.1 + cool * 0.08);
  }
  if (pressure < 62) {
    const t = clamp01((pressure - 46) / 16);
    return mixRgba([97, 200, 255], [255, 214, 92], t, 0.11 + t * 0.09);
  }
  if (pressure < 82) {
    const t = clamp01((pressure - 62) / 20);
    return mixRgba([255, 214, 92], [238, 120, 74], t, 0.18 + t * 0.12);
  }
  const t = clamp01((pressure - 82) / 18);
  return mixRgba([238, 120, 74], [238, 79, 79], t, 0.3 + t * 0.12);
}

function mapConditionsDiagnosticColor(state: StationState, tileIndex: number): string | null {
  const tile = state.tiles[tileIndex];
  if (tile === TileType.Wall) return null;
  const samples = mapConditionSamplesAt(state, tileIndex);
  const sunlight = samples.find((s) => s.kind === 'sunlight')?.value ?? 0;
  const debris = samples.find((s) => s.kind === 'debris-risk')?.value ?? 0;
  const thermal = samples.find((s) => s.kind === 'thermal-sink')?.value ?? 0;
  if (debris > sunlight && debris > thermal && debris >= 0.55) {
    return mixRgba([176, 124, 255], [238, 79, 79], Math.min(1, (debris - 0.55) / 0.45), tile === TileType.Space ? 0.16 : 0.28);
  }
  if (thermal >= 0.62) {
    return rgba(55, 211, 230, tile === TileType.Space ? 0.12 : 0.22);
  }
  if (sunlight >= 0.5) return mixRgba([255, 214, 92], [255, 146, 70], Math.min(1, (sunlight - 0.5) / 0.5), tile === TileType.Space ? 0.13 : 0.24);
  return rgba(64, 88, 140, tile === TileType.Space ? 0.12 : 0.18);
}

function routePressureDiagnosticColor(
  state: StationState,
  tileIndex: number,
  diagnostics: RoutePressureDiagnostics
): string | null {
  const pos = fromIndex(tileIndex, state.width);
  const diagnostic = getRoutePressureTileDiagnostic(state, pos.x, pos.y, diagnostics);
  if (!diagnostic) return null;
  if (diagnostic.conflictScore > 0) {
    const t = clamp01(diagnostic.conflictScore / 5);
    return mixRgba([255, 214, 92], [238, 79, 79], t, 0.2 + t * 0.28);
  }
  const t = clamp01(diagnostic.totalCount / Math.max(2, diagnostics.maxPressure));
  switch (diagnostic.dominant) {
    case 'visitor':
      return rgba(82, 209, 167, 0.13 + t * 0.22);
    case 'resident':
      return rgba(255, 122, 216, 0.12 + t * 0.2);
    case 'logistics':
      return rgba(176, 124, 255, 0.13 + t * 0.22);
    case 'crew':
      return rgba(92, 216, 255, 0.12 + t * 0.2);
    default:
      return null;
  }
}

function reputationDiagnosticColor(zone: ReputationZoneScore): string {
  if (zone.crimePressure >= 65) {
    const t = clamp01((zone.crimePressure - 55) / 45);
    return mixRgba([255, 214, 92], [238, 79, 79], t, 0.24 + t * 0.22);
  }
  if (zone.prestige >= zone.notoriety + 8) {
    const t = clamp01(zone.prestige / 82);
    return mixRgba([82, 209, 167], [110, 219, 143], t, 0.16 + t * 0.18);
  }
  if (zone.notoriety >= zone.prestige + 6) {
    const t = clamp01(zone.notoriety / 80);
    return mixRgba([176, 124, 255], [255, 214, 92], t, 0.14 + t * 0.18);
  }
  const controlTint = clamp01(zone.control / 100);
  return mixRgba([97, 200, 255], [255, 214, 92], clamp01(zone.value / 100), 0.11 + controlTint * 0.12);
}

function drawUtilityUnderlayDuct(
  ctx: CanvasRenderingContext2D,
  state: StationState,
  tileIndex: number,
  kind: UtilityUnderlayKind,
  color: string,
  accentColor: string,
  spriteAtlas: SpriteAtlas | null,
  useSprites: boolean
): void {
  const { x, y } = fromIndex(tileIndex, state.width);
  const px = x * TILE_SIZE;
  const py = y * TILE_SIZE;
  const centerX = px + TILE_SIZE * 0.5;
  const centerY = py + TILE_SIZE * 0.5;
  const mask = utilityUnderlayNeighborMask(state, kind, tileIndex);
  const lineWidth = Math.max(5, Math.round(6 * PX));
  ctx.save();
  if (useSprites && kind === 'air-duct' && spriteAtlas) {
    drawSpriteByKey(ctx, spriteAtlas, UTILITY_UNDERLAY_SPRITE_KEYS.airDuctTile, px, py, TILE_SIZE, TILE_SIZE, 0, 0.56);
  }
  ctx.lineWidth = lineWidth + Math.max(2, Math.round(2 * PX));
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(7, 14, 22, 0.82)';
  ctx.beginPath();
  if (mask & 1) {
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(centerX, py + TILE_SIZE * 0.12);
  }
  if (mask & 2) {
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(px + TILE_SIZE * 0.88, centerY);
  }
  if (mask & 4) {
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(centerX, py + TILE_SIZE * 0.88);
  }
  if (mask & 8) {
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(px + TILE_SIZE * 0.12, centerY);
  }
  if (mask === 0) {
    ctx.arc(centerX, centerY, TILE_SIZE * 0.18, 0, Math.PI * 2);
  }
  ctx.stroke();
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = color;
  ctx.beginPath();
  if (mask & 1) {
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(centerX, py + TILE_SIZE * 0.12);
  }
  if (mask & 2) {
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(px + TILE_SIZE * 0.88, centerY);
  }
  if (mask & 4) {
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(centerX, py + TILE_SIZE * 0.88);
  }
  if (mask & 8) {
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(px + TILE_SIZE * 0.12, centerY);
  }
  if (mask === 0) {
    ctx.arc(centerX, centerY, TILE_SIZE * 0.18, 0, Math.PI * 2);
  }
  ctx.stroke();
  const shape = utilityUnderlayShapeForMask(mask);
  ctx.fillStyle = accentColor;
  if (shape === 'tee' || shape === 'cross' || shape === 'isolated') {
    ctx.beginPath();
    ctx.arc(centerX, centerY, TILE_SIZE * 0.13, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillRect(centerX - TILE_SIZE * 0.08, centerY - TILE_SIZE * 0.08, TILE_SIZE * 0.16, TILE_SIZE * 0.16);
  }
  ctx.restore();
}

function drawWaterPipeOverlayLayer(ctx: CanvasRenderingContext2D, state: StationState): void {
  const diagnostics = getWaterPipeNetworkDiagnostics(state);
  ctx.save();
  for (let i = 0; i < state.tiles.length; i++) {
    if (!hasUtilityUnderlay(state, 'water-pipe', i)) continue;
    const { x, y } = fromIndex(i, state.width);
    const px = x * TILE_SIZE;
    const py = y * TILE_SIZE;
    const flood = clamp01((state.plumbing.floodByTile[i] ?? 0) / 60);
    const componentId = diagnostics.componentIdByTile[i];
    const component = componentId >= 0 ? diagnostics.components[componentId] : undefined;
    const powered = component?.powered ?? false;
    const source = component?.sourceTiles.includes(i) ?? false;
    const sink = component?.sinkTiles.includes(i) ?? false;
    ctx.fillStyle = flood > 0
      ? `rgba(84, 196, 255, ${0.16 + flood * 0.24})`
      : powered
        ? 'rgba(84, 196, 255, 0.16)'
        : 'rgba(238, 79, 79, 0.18)';
    ctx.fillRect(px + Math.round(2 * PX), py + Math.round(2 * PX), TILE_SIZE - Math.round(4 * PX), TILE_SIZE - Math.round(4 * PX));
    drawUtilityUnderlayDuct(
      ctx,
      state,
      i,
      'water-pipe',
      flood > 0 ? '#86ecff' : powered ? '#54c4ff' : '#ee4f4f',
      powered ? '#e6fbff' : '#ffd1d1',
      null,
      false
    );
    if (source || sink) {
      ctx.strokeStyle = source ? '#6edb8f' : powered ? '#e6fbff' : '#ff8b80';
      ctx.lineWidth = Math.max(1, Math.round(1.5 * PX));
      ctx.strokeRect(px + Math.round(4 * PX) + 0.5, py + Math.round(4 * PX) + 0.5, TILE_SIZE - Math.round(8 * PX), TILE_SIZE - Math.round(8 * PX));
    }
  }
  for (const leak of state.plumbing.leaks) {
    const { x, y } = fromIndex(leak.tileIndex, state.width);
    const px = x * TILE_SIZE;
    const py = y * TILE_SIZE;
    ctx.strokeStyle = leak.isolated ? '#ffd65c' : '#ee4f4f';
    ctx.lineWidth = Math.max(2, Math.round(2 * PX));
    ctx.beginPath();
    ctx.arc(px + TILE_SIZE * 0.5, py + TILE_SIZE * 0.5, TILE_SIZE * 0.28, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawFuelPipeOverlayLayer(ctx: CanvasRenderingContext2D, state: StationState): void {
  const diagnostics = getFuelPipeNetworkDiagnostics(state);
  ctx.save();
  for (let i = 0; i < state.tiles.length; i++) {
    if (!hasUtilityUnderlay(state, 'fuel-pipe', i)) continue;
    const { x, y } = fromIndex(i, state.width);
    const px = x * TILE_SIZE;
    const py = y * TILE_SIZE;
    const componentId = diagnostics.componentIdByTile[i];
    const component = componentId >= 0 ? diagnostics.components[componentId] : undefined;
    const powered = component?.powered ?? false;
    const source = component?.sourceTiles.includes(i) ?? false;
    const sink = component?.sinkTiles.includes(i) ?? false;
    ctx.fillStyle = powered ? 'rgba(242, 168, 75, 0.18)' : 'rgba(238, 79, 79, 0.18)';
    ctx.fillRect(px + Math.round(2 * PX), py + Math.round(2 * PX), TILE_SIZE - Math.round(4 * PX), TILE_SIZE - Math.round(4 * PX));
    drawUtilityUnderlayDuct(
      ctx,
      state,
      i,
      'fuel-pipe',
      powered ? '#f2a84b' : '#ee4f4f',
      powered ? '#fff0bd' : '#ffd1d1',
      null,
      false
    );
    if (source || sink) {
      ctx.strokeStyle = source ? '#74dda0' : powered ? '#fff0bd' : '#ff8b80';
      ctx.lineWidth = Math.max(1, Math.round(1.5 * PX));
      ctx.strokeRect(px + Math.round(4 * PX) + 0.5, py + Math.round(4 * PX) + 0.5, TILE_SIZE - Math.round(8 * PX), TILE_SIZE - Math.round(8 * PX));
    }
  }
  ctx.restore();
}

function drawPowerConduitOverlayLayer(ctx: CanvasRenderingContext2D, state: StationState): void {
  const diagnostics = getPowerNetworkDiagnostics(state);
  ctx.save();
  for (let i = 0; i < state.tiles.length; i++) {
    if (!hasUtilityUnderlay(state, 'power-conduit', i)) continue;
    const { x, y } = fromIndex(i, state.width);
    const px = x * TILE_SIZE;
    const py = y * TILE_SIZE;
    const componentId = diagnostics.componentIdByTile[i];
    const component = componentId >= 0 ? diagnostics.components[componentId] : undefined;
    const powered = component?.powered ?? false;
    const source = component?.sourceTiles.includes(i) ?? false;
    const sink = component?.sinkTiles.includes(i) ?? false;
    ctx.fillStyle = source
      ? 'rgba(110, 219, 143, 0.24)'
      : powered ? 'rgba(255, 214, 92, 0.18)' : 'rgba(238, 79, 79, 0.2)';
    ctx.fillRect(px + Math.round(2 * PX), py + Math.round(2 * PX), TILE_SIZE - Math.round(4 * PX), TILE_SIZE - Math.round(4 * PX));
    drawUtilityUnderlayDuct(
      ctx,
      state,
      i,
      'power-conduit',
      source ? '#6edb8f' : powered ? '#ffd65c' : '#ee4f4f',
      powered ? '#fff5bd' : '#ffd1d1',
      null,
      false
    );
    if (source || sink) {
      ctx.strokeStyle = source ? '#6edb8f' : powered ? '#fff5bd' : '#ff8b80';
      ctx.lineWidth = Math.max(1, Math.round(1.5 * PX));
      ctx.strokeRect(px + Math.round(4 * PX) + 0.5, py + Math.round(4 * PX) + 0.5, TILE_SIZE - Math.round(8 * PX), TILE_SIZE - Math.round(8 * PX));
    }
  }
  ctx.restore();
}

function drawAirCoverageUnderlayLayer(ctx: CanvasRenderingContext2D, state: StationState): void {
  const coverage = getLifeSupportCoverageDiagnostics(state);
  ctx.save();
  ctx.globalAlpha = 0.62;
  for (let i = 0; i < state.tiles.length; i++) {
    const color = lifeSupportPlanningColor(state, i, coverage);
    if (!color) continue;
    const { x, y } = fromIndex(i, state.width);
    const px = x * TILE_SIZE;
    const py = y * TILE_SIZE;
    ctx.fillStyle = color;
    ctx.fillRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
  }
  ctx.restore();
}

function drawUtilityUnderlayOverlayLayer(
  ctx: CanvasRenderingContext2D,
  state: StationState,
  spriteAtlas: SpriteAtlas,
  useSprites: boolean,
  focusedKind?: UtilityUnderlayKind
): void {
  if (focusedKind === 'power-conduit') {
    drawPowerConduitOverlayLayer(ctx, state);
    return;
  }
  if (focusedKind === 'water-pipe') {
    drawWaterPipeOverlayLayer(ctx, state);
    return;
  }
  if (focusedKind === 'fuel-pipe') {
    drawFuelPipeOverlayLayer(ctx, state);
    return;
  }
  drawAirCoverageUnderlayLayer(ctx, state);
  if (focusedKind === undefined) {
    drawPowerConduitOverlayLayer(ctx, state);
    drawWaterPipeOverlayLayer(ctx, state);
    drawFuelPipeOverlayLayer(ctx, state);
  }
  const diagnostics = getAirDuctNetworkDiagnostics(state);
  if (diagnostics.tileCount <= 0) return;
  const sourceTiles = new Set<number>();
  const sinkTiles = new Set<number>();
  for (const component of diagnostics.components) {
    for (const tile of component.sourceTiles) sourceTiles.add(tile);
    for (const tile of component.sinkTiles) sinkTiles.add(tile);
  }
  for (const component of diagnostics.components) {
    const powered = component.powered;
    for (const i of component.tiles) {
      const { x, y } = fromIndex(i, state.width);
      const px = x * TILE_SIZE;
      const py = y * TILE_SIZE;
      const source = sourceTiles.has(i);
      const sink = sinkTiles.has(i);
      const disconnected = !powered;
      const fill = source
        ? 'rgba(110, 219, 143, 0.28)'
        : sink && powered
          ? 'rgba(101, 223, 255, 0.28)'
          : disconnected
            ? 'rgba(238, 79, 79, 0.25)'
            : 'rgba(97, 200, 255, 0.18)';
      const stroke = source
        ? '#6edb8f'
        : sink && powered
          ? '#a7f3ff'
          : disconnected
            ? '#ee4f4f'
            : powered
              ? '#61c8ff'
              : '#ffbc52';
      const accent = source ? '#e9ffe9' : sink ? '#e6fbff' : disconnected ? '#ffd0c5' : '#bdeeff';
      ctx.fillStyle = fill;
      ctx.fillRect(px + Math.round(2 * PX), py + Math.round(2 * PX), TILE_SIZE - Math.round(4 * PX), TILE_SIZE - Math.round(4 * PX));
      drawUtilityUnderlayDuct(ctx, state, i, 'air-duct', stroke, accent, spriteAtlas, useSprites);
      if (source || sink) {
        ctx.strokeStyle = source ? '#6edb8f' : powered ? '#a7f3ff' : '#ee4f4f';
        ctx.lineWidth = Math.max(1, Math.round(1.5 * PX));
        ctx.strokeRect(px + Math.round(4 * PX) + 0.5, py + Math.round(4 * PX) + 0.5, TILE_SIZE - Math.round(8 * PX), TILE_SIZE - Math.round(8 * PX));
      }
    }
  }
  for (const module of state.moduleInstances) {
    if (module.type !== ModuleType.Vent) continue;
    const serviceTile = wallMountedModuleServiceTile(state, module.originTile) ?? module.originTile;
    if (hasUtilityUnderlay(state, 'air-duct', serviceTile)) continue;
    const { x, y } = fromIndex(serviceTile, state.width);
    const px = x * TILE_SIZE;
    const py = y * TILE_SIZE;
    ctx.strokeStyle = 'rgba(238, 79, 79, 0.9)';
    ctx.setLineDash([Math.round(4 * PX), Math.round(3 * PX)]);
    ctx.strokeRect(px + Math.round(5 * PX) + 0.5, py + Math.round(5 * PX) + 0.5, TILE_SIZE - Math.round(10 * PX), TILE_SIZE - Math.round(10 * PX));
    ctx.setLineDash([]);
  }
}

function drawDiagnosticOverlayLayer(
  ctx: CanvasRenderingContext2D,
  state: StationState,
  overlay: DiagnosticOverlay,
  spriteAtlas: SpriteAtlas,
  useSprites: boolean,
  focusedUtilityKind?: UtilityUnderlayKind
): void {
  if (overlay === 'none') return;
  if (overlay === 'utility-underlay') {
    drawUtilityUnderlayOverlayLayer(ctx, state, spriteAtlas, useSprites, focusedUtilityKind);
    return;
  }
  const lifeSupportCoverage = overlay === 'life-support' ? getLifeSupportCoverageDiagnostics(state) : null;
  const routePressureDiagnostics = overlay === 'route-pressure' ? getRoutePressureDiagnostics(state) : null;
  const reputationByTile = new Map<number, ReputationZoneScore>();
  if (overlay === 'reputation') {
    for (const zone of getReputationZoneScores(state)) {
      for (const tile of zone.tiles) reputationByTile.set(tile, zone);
    }
  }
  for (let i = 0; i < state.tiles.length; i++) {
    let color: string | null = null;
    if (overlay === 'life-support') {
      if (!lifeSupportCoverage) continue;
      color = lifeSupportDiagnosticColor(state, i, lifeSupportCoverage);
    } else if (overlay === 'map-conditions') {
      color = mapConditionsDiagnosticColor(state, i);
    } else if (overlay === 'sanitation') {
      color = sanitationDiagnosticColor(state, i);
    } else if (overlay === 'thermal') {
      color = thermalDiagnosticColor(state, i);
    } else if (overlay === 'maintenance') {
      color = maintenanceDiagnosticColor(state, i);
    } else if (overlay === 'route-pressure') {
      if (!routePressureDiagnostics) continue;
      color = routePressureDiagnosticColor(state, i, routePressureDiagnostics);
    } else if (overlay === 'reputation') {
      const zone = reputationByTile.get(i);
      color = zone ? reputationDiagnosticColor(zone) : null;
    } else {
      color = environmentDiagnosticColor(state, i, overlay);
    }
    if (!color) continue;
    const { x, y } = fromIndex(i, state.width);
    const px = x * TILE_SIZE;
    const py = y * TILE_SIZE;
    ctx.fillStyle = color;
    ctx.fillRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
    if (overlay === 'maintenance') {
      const diagnostic = getMaintenanceTileDiagnostic(state, x, y);
      if (diagnostic && diagnostic.debt >= 65) {
        ctx.strokeStyle = 'rgba(255, 224, 150, 0.85)';
        ctx.strokeRect(px + Math.round(2 * PX), py + Math.round(2 * PX), TILE_SIZE - Math.round(4 * PX), TILE_SIZE - Math.round(4 * PX));
      }
    }
  }
}

function ensureDiagnosticOverlayLayer(
  state: StationState,
  widthPx: number,
  heightPx: number,
  spriteAtlas: SpriteAtlas,
  useSprites: boolean,
  focusedUtilityKind?: UtilityUnderlayKind
): CachedLayer | null {
  const overlay = state.controls.diagnosticOverlay;
  if (overlay === 'none') {
    if (diagnosticOverlayCache) diagnosticOverlayCache.key = '';
    return null;
  }
  diagnosticOverlayCache = ensureCachedLayer(diagnosticOverlayCache, widthPx, heightPx);
  const layer = diagnosticOverlayCache;
  const key = `${diagnosticOverlayCacheKey(state, overlay, focusedUtilityKind)}|sprites:${useSprites ? 1 : 0}:${spriteAtlas.version}`;
  if (layer.key === key) return layer;
  layer.key = key;
  layer.ctx.clearRect(0, 0, widthPx, heightPx);
  drawDiagnosticOverlayLayer(layer.ctx, state, overlay, spriteAtlas, useSprites, focusedUtilityKind);
  return layer;
}

function diagnosticOverlayLegendLine(state: StationState): { title: string; line: string; scale: string; color: string } | null {
  switch (state.controls.diagnosticOverlay) {
    case 'life-support':
      return {
        title: 'Air Coverage',
        line: `coverage ${state.metrics.lifeSupportCoveragePct.toFixed(0)}% | poor ${state.metrics.poorLifeSupportTiles}`,
        scale: 'cyan close | red poor/disconnected',
        color: '#37d3e6'
      };
    case 'utility-underlay':
      return {
        title: 'Air Network',
        line: `air ${state.metrics.lifeSupportCoveragePct.toFixed(0)}% | poor ${state.metrics.poorLifeSupportTiles} | powered vents ${state.metrics.airNetworkPoweredVents}`,
        scale: 'air reach tint underneath | green source | cyan powered duct | red disconnected',
        color: '#61c8ff'
      };
    case 'map-conditions':
      return {
        title: 'Map Conditions',
        line: `seed ${state.seedAtCreation} | condition v${state.mapConditionVersion}`,
        scale: 'gold sun | purple debris | cyan thermal sink',
        color: '#ffd65c'
      };
    case 'sanitation':
      return {
        title: 'Sanitation',
        line: `avg ${state.metrics.sanitationAvg.toFixed(1)}% | max ${state.metrics.sanitationMax.toFixed(0)}% | dirty ${state.metrics.dirtyTiles} | jobs ${state.metrics.sanitationJobsOpen}`,
        scale: 'clear clean | yellow lived-in | brown filthy',
        color: '#d7a15d'
      };
    case 'thermal':
      return {
        title: 'Thermal',
        line: `avg ${state.metrics.thermalAvg.toFixed(0)}% | max ${state.metrics.thermalMax.toFixed(0)}% | hot ${state.metrics.hotTiles} | stale ${state.metrics.staleAirTiles}`,
        scale: 'cyan cool/sink | gold sun | orange hot | red severe',
        color: '#ffbc52'
      };
    case 'visitor-status':
      return {
        title: 'Visitor Status',
        line: `avg ${state.metrics.visitorStatusAvg.toFixed(1)} | env penalty ${state.metrics.stationRatingPenaltyPerMin.environment.toFixed(1)}/m`,
        scale: 'green appealing | red industrial',
        color: '#52d1a7'
      };
    case 'resident-comfort':
      return {
        title: 'Resident Comfort',
        line: `avg ${state.metrics.residentComfortAvg.toFixed(1)} | stress ${state.metrics.residentEnvironmentStressPerMin.toFixed(1)}/m`,
        scale: 'green comfortable | red stressful',
        color: '#6edb8f'
      };
    case 'service-noise':
      return {
        title: 'Service Noise',
        line: `dorm noise ${state.metrics.serviceNoiseNearDorms.toFixed(1)}`,
        scale: 'yellow noisy | red harsh',
        color: '#ffd65c'
      };
    case 'maintenance':
      return {
        title: 'Maintenance',
        line: `max ${state.metrics.maintenanceDebtMax.toFixed(0)}% | open ${state.metrics.maintenanceJobsOpen}`,
        scale: 'green healthy | yellow worn | red degraded | purple debris lane',
        color: '#ffbc52'
      };
    case 'route-pressure': {
      const pressure = getRoutePressureDiagnostics(state);
      return {
        title: 'Route Pressure',
        line: `paths ${pressure.activePaths} | tiles ${pressure.pressuredTiles} | conflicts ${pressure.conflictTiles}`,
        scale: 'green/pink/blue/purple intent | red conflict',
        color: '#ffd65c'
      };
    }
    case 'reputation':
      return {
        title: 'Reputation',
        line: `prestige ${state.metrics.reputationPrestigeAvg.toFixed(0)} | notoriety ${state.metrics.reputationNotorietyAvg.toFixed(0)} | risk ${state.metrics.reputationCrimePressureAvg.toFixed(0)}`,
        scale: 'green prestige | gold/purple notoriety | red crime pressure',
        color: '#52d1a7'
      };
    case 'none':
      return null;
  }
}

function diagnosticOverlayHoverLine(state: StationState, hoveredTile: number | null): string | null {
  const overlay = state.controls.diagnosticOverlay;
  if (overlay === 'none' || hoveredTile === null || hoveredTile < 0 || hoveredTile >= state.tiles.length) return null;
  const pos = fromIndex(hoveredTile, state.width);
  if (overlay === 'life-support') {
    const diagnostic = getLifeSupportTileDiagnostic(state, pos.x, pos.y);
    if (!diagnostic?.walkablePressurized) return `hover ${pos.x},${pos.y}: not a pressurized walkable tile`;
    const tile = pos.y * state.width + pos.x;
    const local = state.airQualityByTile[tile];
    const localStr = Number.isFinite(local) && local >= 0 ? ` | local air ${local.toFixed(0)}%` : '';
    if (!diagnostic.hasLifeSupportSystem) return `hover ${pos.x},${pos.y}: no life support built yet${localStr}`;
    if (diagnostic.noActiveSource) return `hover ${pos.x},${pos.y}: no active air source -> oxygen risk${localStr}`;
    if (!diagnostic.reachable) return `hover ${pos.x},${pos.y}: disconnected from active air -> oxygen risk${localStr}`;
    return `hover ${pos.x},${pos.y}: air distance ${diagnostic.distance ?? 0} | ${diagnostic.poorCoverage ? 'poor' : 'covered'} room readiness${localStr}`;
  }
  if (overlay === 'utility-underlay') {
    const diagnostic = getUtilityUnderlayTileDiagnostic(state, pos.x, pos.y);
    if (!diagnostic) return `hover ${pos.x},${pos.y}: no utility sample`;
    const network = diagnostic.componentId !== null ? `network ${diagnostic.componentId}` : 'no network';
    return `hover ${pos.x},${pos.y}: ${diagnostic.reason} | ${network} | ${diagnostic.effect} | fix: ${diagnostic.fix}`;
  }
  if (overlay === 'maintenance') {
    const diagnostic = getMaintenanceTileDiagnostic(state, pos.x, pos.y);
    if (!diagnostic) {
      const debris = mapConditionSamplesAt(state, hoveredTile).find((s) => s.kind === 'debris-risk');
      if (debris && debris.value >= 0.42) {
        return `hover ${pos.x},${pos.y}: ${debris.label} ${(debris.value * 100).toFixed(0)}% | future exterior repair pressure`;
      }
      return `hover ${pos.x},${pos.y}: no maintenance wear`;
    }
    const route = diagnostic.exterior ? 'EVA repair' : 'interior repair';
    return `hover ${pos.x},${pos.y}: ${diagnostic.label} ${diagnostic.debt.toFixed(0)}% | ${diagnostic.source} | ${route} | ${diagnostic.effect}`;
  }
  if (overlay === 'map-conditions') {
    const samples = mapConditionSamplesAt(state, hoveredTile);
    const top = [...samples].sort((a, b) => b.value - a.value)[0];
    return `hover ${pos.x},${pos.y}: ${top.label} ${(top.value * 100).toFixed(0)}% | + ${top.upside} | - ${top.downside}`;
  }
  if (overlay === 'sanitation') {
    const diagnostic = getSanitationTileDiagnostic(state, pos.x, pos.y);
    if (!diagnostic) return `hover ${pos.x},${pos.y}: no sanitation sample`;
    return `hover ${pos.x},${pos.y}: dirt ${diagnostic.dirt.toFixed(0)}% ${diagnostic.severity} | ${diagnostic.dominantSource} | ${diagnostic.effectSummary}`;
  }
  if (overlay === 'thermal') {
    const diagnostic = getThermalTileDiagnostic(state, pos.x, pos.y);
    if (!diagnostic) {
      const samples = mapConditionSamplesAt(state, hoveredTile);
      const top = [...samples].sort((a, b) => b.value - a.value)[0];
      return `hover ${pos.x},${pos.y}: ${top.label} ${(top.value * 100).toFixed(0)}% | thermal backdrop pressure`;
    }
    return `hover ${pos.x},${pos.y}: ${diagnostic.severity} | heat ${diagnostic.heat.toFixed(0)}% stale ${diagnostic.staleAir.toFixed(0)}% | ${diagnostic.cause} -> ${diagnostic.effect} | fix: ${diagnostic.fix}`;
  }
  if (overlay === 'route-pressure') {
    const diagnostic = getRoutePressureTileDiagnostic(state, pos.x, pos.y);
    if (!diagnostic) return `hover ${pos.x},${pos.y}: no active planned routes`;
    return `hover ${pos.x},${pos.y}: total ${diagnostic.totalCount} | V${diagnostic.visitorCount} R${diagnostic.residentCount} C${diagnostic.crewCount} L${diagnostic.logisticsCount} | conflicts ${diagnostic.conflictScore}`;
  }
  if (overlay === 'reputation') {
    const diagnostic = getReputationTileDiagnostic(state, pos.x, pos.y);
    if (!diagnostic?.zone) return `hover ${pos.x},${pos.y}: no reputation zone`;
    const zone = diagnostic.zone;
    return `hover ${pos.x},${pos.y}: ${zone.label} ${zone.room} | P${zone.prestige.toFixed(0)} N${zone.notoriety.toFixed(0)} C${zone.control.toFixed(0)} risk ${zone.crimePressure.toFixed(0)} | ${zone.topDrivers.join(' | ')}`;
  }
  const diagnostic = getRoomEnvironmentTileDiagnostic(state, pos.x, pos.y);
  if (!diagnostic || diagnostic.sampledTiles <= 0) return `hover ${pos.x},${pos.y}: no room environment sample`;
  if (overlay === 'visitor-status') {
    return `hover ${pos.x},${pos.y}: visitor ${diagnostic.visitorStatus.toFixed(1)} | discomfort ${diagnostic.visitorDiscomfort.toFixed(1)} -> rating/service appeal`;
  }
  if (overlay === 'resident-comfort') {
    return `hover ${pos.x},${pos.y}: comfort ${diagnostic.residentialComfort.toFixed(1)} | stress ${diagnostic.residentDiscomfort.toFixed(1)} -> satisfaction`;
  }
  if (overlay === 'service-noise') {
    return `hover ${pos.x},${pos.y}: noise ${diagnostic.serviceNoise.toFixed(1)} -> visitor status + resident comfort penalties`;
  }
  return null;
}

function drawDiagnosticOverlayLegend(ctx: CanvasRenderingContext2D, state: StationState, hoveredTile: number | null): void {
  const legend = diagnosticOverlayLegendLine(state);
  if (!legend) return;
  const x = Math.round(150 * PX);
  const y = Math.round(44 * PX);
  const hoverLine = diagnosticOverlayHoverLine(state, hoveredTile);
  const lines = hoverLine ? [legend.title, legend.line, legend.scale, hoverLine] : [legend.title, legend.line, legend.scale];
  ctx.font = `${Math.round(10 * PX)}px monospace`;
  const textW = Math.max(...lines.map((line) => ctx.measureText(line).width));
  const pad = Math.round(5 * PX);
  const lineHeight = Math.round(13 * PX);
  const boxW = Math.max(Math.round(220 * PX), Math.ceil(textW + pad * 2));
  const boxH = Math.round(10 * PX) + lineHeight * lines.length;
  ctx.fillStyle = 'rgba(8, 16, 28, 0.78)';
  ctx.fillRect(x, y, boxW, boxH);
  ctx.strokeStyle = 'rgba(123, 167, 217, 0.5)';
  ctx.strokeRect(x + 0.5, y + 0.5, boxW - 1, boxH - 1);
  ctx.fillStyle = legend.color;
  ctx.font = `bold ${Math.round(10 * PX)}px monospace`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(legend.title, x + pad, y + Math.round(4 * PX));
  ctx.fillStyle = '#d3deed';
  ctx.font = `${Math.round(10 * PX)}px monospace`;
  ctx.fillText(legend.line, x + pad, y + Math.round(17 * PX));
  ctx.fillStyle = '#91a7c1';
  ctx.fillText(legend.scale, x + pad, y + Math.round(30 * PX));
  if (hoverLine) {
    ctx.fillStyle = '#f0d792';
    ctx.fillText(hoverLine, x + pad, y + Math.round(43 * PX));
  }
}

function drawLaneEdgeOverlay(ctx: CanvasRenderingContext2D, state: StationState, widthPx: number, heightPx: number): void {
  const totalTraffic = Math.max(
    0.0001,
    state.laneProfiles.north.trafficVolume +
      state.laneProfiles.east.trafficVolume +
      state.laneProfiles.south.trafficVolume +
      state.laneProfiles.west.trafficVolume
  );
  const laneRows: Array<{
    lane: 'north' | 'east' | 'south' | 'west';
    label: string;
    x: number;
    y: number;
    align: CanvasTextAlign;
  }> = [
    { lane: 'north', label: 'N', x: widthPx * 0.5, y: Math.round(8 * PX), align: 'center' },
    { lane: 'south', label: 'S', x: widthPx * 0.5, y: heightPx - Math.round(22 * PX), align: 'center' },
    { lane: 'west', label: 'W', x: Math.round(8 * PX), y: heightPx * 0.5 - Math.round(8 * PX), align: 'left' },
    { lane: 'east', label: 'E', x: widthPx - Math.round(8 * PX), y: heightPx * 0.5 - Math.round(8 * PX), align: 'right' }
  ];
  ctx.font = `${Math.round(10 * PX)}px monospace`;
  ctx.textBaseline = 'top';
  for (const row of laneRows) {
    const profile = state.laneProfiles[row.lane];
    const lanePct = Math.round((profile.trafficVolume / totalTraffic) * 100);
    const touristPct = Math.round(profile.weights.tourist * 100);
    const traderPct = Math.round(profile.weights.trader * 100);
    const industrialPct = Math.round(profile.weights.industrial * 100);
    const militaryPct = Math.round(profile.weights.military * 100);
    const colonistPct = Math.max(0, 100 - touristPct - traderPct - industrialPct - militaryPct);
    const line =
      `${row.label}: ${lanePct}% | Tour ${touristPct}% / Trade ${traderPct}% / ` +
      `Ind ${industrialPct}% / Mil ${militaryPct}% / Col ${colonistPct}%`;
    const textW = ctx.measureText(line).width;
    const pad = Math.round(3 * PX);
    const boxW = textW + pad * 2;
    const boxH = Math.round(14 * PX);
    let boxX = row.x - boxW / 2;
    if (row.align === 'left') boxX = row.x;
    if (row.align === 'right') boxX = row.x - boxW;
    const boxY = row.y;
    ctx.fillStyle = 'rgba(7, 16, 25, 0.72)';
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeStyle = 'rgba(62, 86, 116, 0.8)';
    ctx.strokeRect(boxX + 0.5, boxY + 0.5, boxW - 1, boxH - 1);
    ctx.fillStyle = '#c7d6ea';
    ctx.textAlign = row.align;
    const tx = row.align === 'left' ? row.x + pad : row.align === 'right' ? row.x - pad : row.x;
    ctx.fillText(line, tx, boxY + 2);
  }
}

function drawQueuedShips(ctx: CanvasRenderingContext2D, state: StationState, _spriteAtlas: SpriteAtlas, _useSprites: boolean): void {
  const countsByLane: Record<'north' | 'east' | 'south' | 'west', number> = {
    north: 0,
    east: 0,
    south: 0,
    west: 0
  };
  const laneStep = Math.round(16 * PX);
  for (const queued of state.dockQueue) {
    const idx = countsByLane[queued.lane]++;
    const silhouette = resolveShipSilhouette(queued.shipId, queued.shipType, queued.size, queued.lane);
    const cellSize = (queued.size === 'small' ? 4 : queued.size === 'medium' ? 3.5 : 2) * PX;
    const chipW = silhouette.bounds.width * cellSize;
    const chipH = silhouette.bounds.height * cellSize;
    let cx = 0;
    let cy = 0;
    if (queued.lane === 'north') {
      cx = state.width * TILE_SIZE * 0.5 + (idx - 2) * laneStep;
      cy = Math.round(22 * PX);
    } else if (queued.lane === 'south') {
      cx = state.width * TILE_SIZE * 0.5 + (idx - 2) * laneStep;
      cy = state.height * TILE_SIZE - Math.round(22 * PX);
    } else if (queued.lane === 'west') {
      cx = Math.round(22 * PX);
      cy = state.height * TILE_SIZE * 0.5 + (idx - 2) * laneStep;
    } else {
      cx = state.width * TILE_SIZE - Math.round(22 * PX);
      cy = state.height * TILE_SIZE * 0.5 + (idx - 2) * laneStep;
    }
    const palette = shipPalette(queued.shipType, false);
    ctx.fillStyle = 'rgba(6, 16, 28, 0.75)';
    ctx.fillRect(cx - chipW * 0.5 - 2, cy - chipH * 0.5 - 2, chipW + 4, chipH + 4);
    const image = projectShipHullImage(queued.hullVariant, queued.shipType);
    if (image) {
      const aspect = shipHullProfile(queued.hullVariant).nativeAspect;
      const maxW = Math.max(chipW, 13 * PX);
      const maxH = Math.max(chipH, 13 * PX);
      let drawW = maxW;
      let drawH = drawW / Math.max(0.1, aspect);
      if (drawH > maxH) {
        drawH = maxH;
        drawW = drawH * aspect;
      }
      drawRotatedImage(ctx, image, { x: cx, y: cy }, drawW, drawH, laneAngleRad(queued.lane));
      continue;
    }
    drawShipSilhouetteCells(ctx, silhouette, cx - chipW * 0.5, cy - chipH * 0.5, cellSize, palette, 0.4);
  }
}

function drawPasteStampGhost(
  ctx: CanvasRenderingContext2D,
  state: StationState,
  currentTool: BuildTool,
  hoveredTile: number | null,
  visibleTiles: { minX: number; maxX: number; minY: number; maxY: number }
): void {
  const stamp = currentTool.kind === 'paste-room' ? currentTool.pasteStamp : null;
  if (!stamp || hoveredTile === null || hoveredTile < 0 || hoveredTile >= state.tiles.length) return;

  const origin = fromIndex(hoveredTile, state.width);
  const targetInBounds = (dx: number, dy: number): boolean =>
    inBounds(origin.x + dx, origin.y + dy, state.width, state.height);
  const targetTile = (dx: number, dy: number): number =>
    toIndex(origin.x + dx, origin.y + dy, state.width);
  const targetVisible = (dx: number, dy: number): boolean => {
    const x = origin.x + dx;
    const y = origin.y + dy;
    return x >= visibleTiles.minX && x <= visibleTiles.maxX && y >= visibleTiles.minY && y <= visibleTiles.maxY;
  };
  let hasInvalidCell = false;

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  for (const cell of stamp.cells) {
    if (cell.tile === TileType.Space) continue;
    if (!targetInBounds(cell.dx, cell.dy)) {
      hasInvalidCell = true;
      continue;
    }
    if (!targetVisible(cell.dx, cell.dy)) continue;
    const px = (origin.x + cell.dx) * TILE_SIZE;
    const py = (origin.y + cell.dy) * TILE_SIZE;
    ctx.globalAlpha = 0.56;
    ctx.fillStyle = tileColor[cell.tile];
    ctx.fillRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
    if (cell.room !== RoomType.None) {
      ctx.globalAlpha = 0.68;
      ctx.fillStyle = roomOverlay[cell.room];
      ctx.fillRect(px + Math.round(3 * PX), py + Math.round(3 * PX), TILE_SIZE - Math.round(6 * PX), TILE_SIZE - Math.round(6 * PX));
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#f0f6ff';
      ctx.font = `bold ${Math.round(8 * PX)}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(roomLetter[cell.room], px + TILE_SIZE * 0.5, py + TILE_SIZE * 0.5);
    }
    ctx.globalAlpha = 1;
    const replacingBuiltTile = state.tiles[targetTile(cell.dx, cell.dy)] !== TileType.Space;
    ctx.strokeStyle = replacingBuiltTile ? 'rgba(255, 207, 110, 0.72)' : 'rgba(110, 219, 143, 0.76)';
    ctx.strokeRect(px + 1.5, py + 1.5, TILE_SIZE - 3, TILE_SIZE - 3);
  }

  ctx.globalAlpha = 1;
  for (const module of stamp.modules) {
    let moduleInvalid = false;
    for (const offset of module.tileOffsets) {
      if (!targetInBounds(offset.dx, offset.dy)) {
        moduleInvalid = true;
        hasInvalidCell = true;
      }
      if (!targetVisible(offset.dx, offset.dy) || !targetInBounds(offset.dx, offset.dy)) continue;
      const px = (origin.x + offset.dx) * TILE_SIZE;
      const py = (origin.y + offset.dy) * TILE_SIZE;
      ctx.fillStyle = moduleInvalid ? 'rgba(255, 118, 118, 0.3)' : 'rgba(210, 228, 250, 0.34)';
      ctx.fillRect(px + Math.round(4 * PX), py + Math.round(4 * PX), TILE_SIZE - Math.round(8 * PX), TILE_SIZE - Math.round(8 * PX));
      ctx.strokeStyle = moduleInvalid ? 'rgba(255, 118, 118, 0.9)' : 'rgba(230, 242, 255, 0.78)';
      ctx.strokeRect(px + Math.round(4.5 * PX), py + Math.round(4.5 * PX), TILE_SIZE - Math.round(9 * PX), TILE_SIZE - Math.round(9 * PX));
    }
    if (targetInBounds(module.dx, module.dy) && targetVisible(module.dx, module.dy)) {
      const px = (origin.x + module.dx) * TILE_SIZE;
      const py = (origin.y + module.dy) * TILE_SIZE;
      ctx.fillStyle = moduleInvalid ? '#ffd1d1' : '#f4fbff';
      ctx.font = `bold ${Math.round(10 * PX)}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(moduleLetter[module.type] ?? '?', px + TILE_SIZE * 0.5, py + TILE_SIZE * 0.5);
    }
  }

  const previewX = origin.x * TILE_SIZE;
  const previewY = origin.y * TILE_SIZE;
  const previewW = stamp.width * TILE_SIZE;
  const previewH = stamp.height * TILE_SIZE;
  ctx.globalAlpha = 1;
  ctx.strokeStyle = hasInvalidCell ? 'rgba(255, 118, 118, 0.95)' : 'rgba(110, 219, 143, 0.95)';
  ctx.lineWidth = Math.max(1, Math.round(1.5 * PX));
  ctx.setLineDash([Math.round(5 * PX), Math.round(3 * PX)]);
  ctx.strokeRect(previewX + 1.5, previewY + 1.5, previewW - 3, previewH - 3);
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(7, 14, 22, 0.84)';
  const label = `${stamp.width}x${stamp.height} stamp`;
  ctx.font = `bold ${Math.round(8 * PX)}px monospace`;
  const labelW = Math.max(Math.round(70 * PX), ctx.measureText(label).width + Math.round(8 * PX));
  ctx.fillRect(previewX, previewY - Math.round(15 * PX), labelW, Math.round(13 * PX));
  ctx.fillStyle = hasInvalidCell ? '#ffbaba' : '#d9ffe6';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, previewX + Math.round(4 * PX), previewY - Math.round(8.5 * PX));
  ctx.restore();
}

function drawCrewHireGhost(
  ctx: CanvasRenderingContext2D,
  state: StationState,
  currentTool: BuildTool,
  hoveredTile: number | null,
  spriteAtlas: SpriteAtlas,
  useSprites: boolean,
  visibleTiles: { minX: number; maxX: number; minY: number; maxY: number }
): void {
  if (currentTool.kind !== 'hire-staff' || !currentTool.staffRole) return;
  if (hoveredTile === null || hoveredTile < 0 || hoveredTile >= state.tiles.length) return;
  if (!tileInRange(hoveredTile, state, visibleTiles)) return;

  const valid = isWalkable(state.tiles[hoveredTile]);
  const p = fromIndex(hoveredTile, state.width);
  const px = p.x * TILE_SIZE;
  const py = p.y * TILE_SIZE;
  const cx = px + TILE_SIZE * 0.5;
  const cy = py + TILE_SIZE * 0.5;
  const color = valid ? '#6edb8f' : '#ff7676';
  const spriteKey = STAFF_ROLE_SPRITE_KEYS[currentTool.staffRole];

  ctx.save();
  ctx.fillStyle = valid ? 'rgba(110, 219, 143, 0.16)' : 'rgba(255, 118, 118, 0.2)';
  ctx.fillRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, Math.round(1.4 * PX));
  ctx.setLineDash([Math.round(4 * PX), Math.round(3 * PX)]);
  ctx.strokeRect(px + 1.5, py + 1.5, TILE_SIZE - 3, TILE_SIZE - 3);
  ctx.setLineDash([]);

  ctx.globalAlpha = valid ? 0.78 : 0.52;
  const drewSprite = useSprites && spriteKey
    ? drawTintedAgentSprite(ctx, spriteAtlas, spriteKey, cx, cy, TILE_SIZE * 0.9, color, valid ? 0.05 : 0.25)
    : false;
  if (!drewSprite) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, TILE_SIZE * 0.22, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, TILE_SIZE * 0.42, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, Math.round(1.2 * PX));
  ctx.stroke();
  ctx.restore();
}

function commercialPreviewModule(
  state: StationState,
  placement: StationState['commercialUnits'][number]['offers'][number]['fixtures'][number],
  id: number
): StationState['moduleInstances'][number] | null {
  const definition = MODULE_DEFINITIONS[placement.module];
  if (!definition) return null;
  const rotation = placement.rotation === 90 && definition.rotatable ? 90 : 0;
  const width = rotation === 90 ? definition.height : definition.width;
  const height = rotation === 90 ? definition.width : definition.height;
  const origin = fromIndex(placement.originTile, state.width);
  const tiles: number[] = [];
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      const x = origin.x + dx;
      const y = origin.y + dy;
      if (inBounds(x, y, state.width, state.height)) tiles.push(toIndex(x, y, state.width));
    }
  }
  return {
    id,
    type: placement.module,
    originTile: placement.originTile,
    rotation,
    width,
    height,
    tiles
  };
}

function drawCommercialOfferPreviews(
  ctx: CanvasRenderingContext2D,
  state: StationState,
  spriteAtlas: SpriteAtlas,
  useSprites: boolean,
  visibleTiles: { minX: number; maxX: number; minY: number; maxY: number }
): void {
  for (const unit of state.commercialUnits) {
    if (unit.phase !== 'offers' || unit.previewOfferId === null) continue;
    const offer = unit.offers.find((candidate) => candidate.id === unit.previewOfferId);
    if (!offer) continue;
    const pulse = 0.46 + Math.sin(state.now * 2.2 + unit.id) * 0.05;
    for (let index = 0; index < offer.fixtures.length; index++) {
      const module = commercialPreviewModule(state, offer.fixtures[index], -(offer.id * 100 + index + 1));
      if (!module || !module.tiles.some((tile) => tileInRange(tile, state, visibleTiles))) continue;
      const origin = fromIndex(module.originTile, state.width);
      const px = origin.x * TILE_SIZE;
      const py = origin.y * TILE_SIZE;
      const width = module.width * TILE_SIZE;
      const height = module.height * TILE_SIZE;

      ctx.save();
      ctx.fillStyle = 'rgba(77, 211, 183, 0.16)';
      ctx.fillRect(px + 1, py + 1, width - 2, height - 2);
      ctx.globalAlpha = pulse;
      drawModuleVisual(ctx, state, module, spriteAtlas, useSprites);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(112, 241, 210, 0.94)';
      ctx.lineWidth = Math.max(1, Math.round(1.25 * PX));
      ctx.setLineDash([Math.max(2, Math.round(4 * PX)), Math.max(2, Math.round(3 * PX))]);
      ctx.strokeRect(px + 1.5, py + 1.5, width - 3, height - 3);
      ctx.setLineDash([]);
      ctx.restore();
    }
  }
}

function fitCommercialChipText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let fitted = text;
  while (fitted.length > 3 && ctx.measureText(`${fitted}...`).width > maxWidth) fitted = fitted.slice(0, -1);
  return `${fitted.trimEnd()}...`;
}

function commercialChipCopy(unit: StationState['commercialUnits'][number]): {
  heading: string;
  detail: string;
  accent: string;
} {
  if (unit.phase === 'vacant') {
    return { heading: 'VACANT', detail: 'READY FOR TENANT', accent: '#9cb4c8' };
  }
  if (unit.phase === 'offers') {
    return {
      heading: 'APPLICANTS',
      detail: `${unit.offers.length} ${unit.offers.length === 1 ? 'OFFER' : 'OFFERS'} TO REVIEW`,
      accent: '#ffd36a'
    };
  }
  if (unit.phase === 'fitting-out') {
    const fixtureTotal = unit.selectedOffer?.fixtures.length ?? 0;
    return {
      heading: 'FITTING OUT',
      detail: `${Math.min(unit.installedFixtureCount, fixtureTotal)}/${fixtureTotal} FIXTURES`,
      accent: '#72bff2'
    };
  }
  if (unit.phase === 'open') {
    const brand = unit.selectedOffer?.brandName?.toUpperCase() ?? 'TENANT';
    return {
      heading: 'OPEN',
      detail: `${brand} | ${unit.currentCustomers} IN`,
      accent: '#71e5a0'
    };
  }
  return {
    heading: 'CLOSED',
    detail: unit.statusReason.toUpperCase() || 'NOT OPERATING',
    accent: '#ff7a76'
  };
}

function drawCommercialUnitStatusChips(
  ctx: CanvasRenderingContext2D,
  state: StationState,
  visibleTiles: { minX: number; maxX: number; minY: number; maxY: number }
): void {
  const occupied: BerthChipRect[] = [];
  const headingFont = Math.max(8, Math.round(TILE_SIZE * 0.34));
  const detailFont = Math.max(7, Math.round(TILE_SIZE * 0.29));
  const chipHeight = Math.max(20, TILE_SIZE * 0.9);
  const maxChipWidth = TILE_SIZE * 7.5;
  const padX = Math.max(7, TILE_SIZE * 0.35);

  for (const unit of state.commercialUnits) {
    if (!unit.tiles.some((tile) => tileInRange(tile, state, visibleTiles))) continue;
    const copy = commercialChipCopy(unit);
    ctx.save();
    ctx.font = `bold ${headingFont}px monospace`;
    const headingWidth = ctx.measureText(copy.heading).width;
    ctx.font = `${detailFont}px monospace`;
    const detailWidth = ctx.measureText(copy.detail).width;
    const width = Math.min(maxChipWidth, Math.max(TILE_SIZE * 3.2, headingWidth, detailWidth) + padX * 2);
    const rect = placeBerthChip(state, unit.tiles, width, chipHeight, occupied);
    if (!rect) {
      ctx.restore();
      continue;
    }

    const anchor = fromIndex(unit.anchorTile, state.width);
    const anchorX = (anchor.x + 0.5) * TILE_SIZE;
    const anchorY = (anchor.y + 0.5) * TILE_SIZE;
    const joinX = Math.max(rect.x, Math.min(rect.x + rect.w, anchorX));
    const joinY = Math.max(rect.y, Math.min(rect.y + rect.h, anchorY));
    ctx.strokeStyle = copy.accent;
    ctx.globalAlpha = 0.62;
    ctx.lineWidth = Math.max(1, TILE_SIZE * 0.04);
    ctx.beginPath();
    ctx.moveTo(anchorX, anchorY);
    ctx.lineTo(joinX, joinY);
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.fillStyle = 'rgba(5, 12, 20, 0.93)';
    ctx.strokeStyle = copy.accent;
    ctx.lineWidth = Math.max(1, TILE_SIZE * 0.045);
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.w, rect.h, Math.max(2, TILE_SIZE * 0.1));
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = copy.accent;
    ctx.fillRect(rect.x, rect.y, Math.max(2, TILE_SIZE * 0.12), rect.h);

    const textX = rect.x + padX;
    const textWidth = rect.w - padX * 1.5;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${headingFont}px monospace`;
    ctx.fillStyle = '#eff7ff';
    ctx.fillText(fitCommercialChipText(ctx, copy.heading, textWidth), textX, rect.y + rect.h * 0.32);
    ctx.font = `${detailFont}px monospace`;
    ctx.fillStyle = copy.accent;
    ctx.fillText(fitCommercialChipText(ctx, copy.detail, textWidth), textX, rect.y + rect.h * 0.72);
    ctx.restore();
  }
}

function drawMarketFixtureFeedback(
  ctx: CanvasRenderingContext2D,
  state: StationState,
  visibleTiles: { minX: number; maxX: number; minY: number; maxY: number }
): void {
  const drawChip = (tileIndex: number, text: string, accent: string, yOffset = 0): void => {
    if (!tileInRange(tileIndex, state, visibleTiles)) return;
    const point = fromIndex(tileIndex, state.width);
    const font = Math.max(7, Math.round(TILE_SIZE * 0.23));
    ctx.save();
    ctx.font = `bold ${font}px monospace`;
    const width = Math.max(TILE_SIZE * 1.45, ctx.measureText(text).width + TILE_SIZE * 0.38);
    const height = Math.max(13, TILE_SIZE * 0.46);
    const x = (point.x + 0.5) * TILE_SIZE - width / 2;
    const y = point.y * TILE_SIZE - height - TILE_SIZE * 0.08 - yOffset;
    ctx.fillStyle = 'rgba(5, 12, 20, 0.9)';
    ctx.strokeStyle = accent;
    ctx.lineWidth = Math.max(1, TILE_SIZE * 0.035);
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, Math.max(2, TILE_SIZE * 0.08));
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + width / 2, y + height * 0.53);
    ctx.restore();
  };

  for (const module of state.moduleInstances) {
    if (module.type !== ModuleType.ShelfAisle && module.type !== ModuleType.CheckoutBank) continue;
    const status = getMarketFixtureStatus(state, module.id);
    if (!status) continue;
    if (status.kind === 'shelf') {
      const stock = Math.floor(status.available + 0.0001);
      drawChip(module.originTile, stock > 0 ? `SHELF ${stock}` : 'SHELVES EMPTY', stock > 0 ? '#72e7ad' : '#ff827a');
      continue;
    }
    const active = `${status.activeRegisters}/${status.registerCount}`;
    const line = status.queued > 0 ? ` · LINE ${status.queued}` : '';
    const copy = status.activeRegisters > 0 ? `REG ${active}${line}` : `REG ${active} UNSTAFFED${line}`;
    drawChip(module.originTile, copy, status.activeRegisters > 0 ? '#72dff2' : '#ffad65');
  }
}

const FACILITY_CHIP_ACCENT = {
  /** Serving somebody right now. */
  busy: '#72e7ad',
  /** Built and free. Nothing wrong, nothing happening. */
  idle: '#72dff2',
  /** Blocked but recoverable: unstaffed, saturated, no seat. */
  warn: '#ffad65',
  /** Blocked on missing stock, the one thing that stops service outright. */
  empty: '#ff827a'
} as const;

const FACILITY_CHIP_MODULES: ReadonlySet<ModuleType> = new Set<ModuleType>([
  ModuleType.BoothBank,
  ModuleType.StandingRail,
  ModuleType.ServingLine,
  ModuleType.CommunityTable,
  ModuleType.GuestCabin,
  ModuleType.ArrivalDesk,
  ModuleType.WashBank,
  ModuleType.BackroomStockBank
]);

/**
 * World chips for the Phase 1B facility fixtures.
 *
 * Same visual idiom as `drawMarketFixtureFeedback`, extended to two rows: the
 * first row is always users over physical capacity, the second is either the
 * one blocked reason — in the shared `FACILITY_BLOCKED_LABEL` wording, so a
 * chip can never disagree with an inspector — or the supporting fact
 * (staffing, stock, dwell seating) that explains why the fixture is fine.
 *
 * Everything shown is read back from the pure facility helpers. Nothing here
 * recomputes capacity, occupancy or blockers, because a chip that derived its
 * own numbers would be the first thing to drift from the simulation.
 */
function drawFacilityFixtureChips(
  ctx: CanvasRenderingContext2D,
  state: StationState,
  visibleTiles: { minX: number; maxX: number; minY: number; maxY: number }
): void {
  const drawChip = (tileIndex: number, lines: readonly string[], accent: string): void => {
    if (!tileInRange(tileIndex, state, visibleTiles)) return;
    const rows = lines.filter((line) => line.length > 0);
    if (rows.length === 0) return;
    const point = fromIndex(tileIndex, state.width);
    const font = Math.max(7, Math.round(TILE_SIZE * 0.23));
    ctx.save();
    ctx.font = `bold ${font}px monospace`;
    let widest = 0;
    for (const row of rows) widest = Math.max(widest, ctx.measureText(row).width);
    const width = Math.max(TILE_SIZE * 1.45, widest + TILE_SIZE * 0.38);
    const rowHeight = Math.max(13, TILE_SIZE * 0.46);
    const height = rowHeight * rows.length;
    const x = (point.x + 0.5) * TILE_SIZE - width / 2;
    const y = point.y * TILE_SIZE - height - TILE_SIZE * 0.08;
    ctx.fillStyle = 'rgba(5, 12, 20, 0.9)';
    ctx.strokeStyle = accent;
    ctx.lineWidth = Math.max(1, TILE_SIZE * 0.035);
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, Math.max(2, TILE_SIZE * 0.08));
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let row = 0; row < rows.length; row++) {
      ctx.fillStyle = row === 0 ? accent : 'rgba(223, 236, 248, 0.86)';
      ctx.fillText(rows[row], x + width / 2, y + rowHeight * (row + 0.53));
    }
    ctx.restore();
  };

  const blockedCopy = (reason: FacilityBlockedReason | null): string =>
    reason === null ? '' : FACILITY_BLOCKED_LABEL[reason].toUpperCase();

  const accentFor = (reason: FacilityBlockedReason | null, inUse: number): string =>
    reason === 'no-stock'
      ? FACILITY_CHIP_ACCENT.empty
      : reason !== null
        ? FACILITY_CHIP_ACCENT.warn
        : inUse > 0
          ? FACILITY_CHIP_ACCENT.busy
          : FACILITY_CHIP_ACCENT.idle;

  // A connected run is one bar: one chip, anchored on the lowest module id in
  // the group, never one chip per segment.
  for (const group of barGroups(state)) {
    const anchor = state.moduleInstances.find((module) => module.id === group.id);
    if (!anchor) continue;
    if (!tileInRange(anchor.originTile, state, visibleTiles)) continue;
    // Staffing is read from the lane positions a worker is physically standing
    // in rather than from a room-wide headcount, which is the same physical
    // reading the fixture itself serves on.
    const status = barGroupStatus(state, group, 0);
    const inUse = group.guestSlots.length - status.freeGuestSlots;
    const head = `BAR ${inUse}/${group.guestSlots.length} · DRINKS ${Math.floor(status.stock + 0.0001)}`;
    const detail = status.blockedReason !== null
      ? blockedCopy(status.blockedReason)
      : `STAFF ${status.staffedPositions}/${group.staffSlots.length} · SEATS ${status.dwellCapacity}`;
    drawChip(anchor.originTile, [head, detail], accentFor(status.blockedReason, inUse));
  }

  let chain: MarketChainStatus | null = null;
  for (const module of state.moduleInstances) {
    if (!FACILITY_CHIP_MODULES.has(module.type)) continue;
    if (!tileInRange(module.originTile, state, visibleTiles)) continue;
    const report = fixtureCapacityReport(state, module);
    if (!report) continue;
    const inUse = report.publicInUse;
    const total = report.publicSlots;
    const full = total > 0 && inUse >= total;

    if (module.type === ModuleType.BackroomStockBank) {
      // Back-of-house: no public positions at all, so the useful facts are what
      // it holds and whether the shelves it feeds are actually being fed.
      chain ??= marketChainStatus(state);
      const held = Math.floor(itemStockAtNode(state, module.originTile, 'tradeGood') + 0.0001);
      const shelves = Math.floor(chain.shelves + 0.0001);
      const reason: FacilityBlockedReason | null = held < 0.95 ? 'no-stock' : null;
      const accent = reason !== null
        ? FACILITY_CHIP_ACCENT.empty
        : shelves < 1
          ? FACILITY_CHIP_ACCENT.warn
          : FACILITY_CHIP_ACCENT.busy;
      drawChip(
        module.originTile,
        [`BACKROOM ${held}`, reason !== null ? blockedCopy(reason) : `SHELVES ${shelves}`],
        accent
      );
      continue;
    }

    // Seating and standing room buy dwell capacity, never throughput, so their
    // chips carry a count and nothing else until every position is taken.
    if (
      module.type === ModuleType.BoothBank ||
      module.type === ModuleType.StandingRail ||
      module.type === ModuleType.CommunityTable
    ) {
      const label = module.type === ModuleType.BoothBank
        ? 'BOOTHS'
        : module.type === ModuleType.StandingRail
          ? 'RAIL'
          : 'TABLE';
      const reason = firstBlockedReason({ 'no-free-seat': full });
      drawChip(
        module.originTile,
        [`${label} ${inUse}/${total}`, blockedCopy(reason)],
        accentFor(reason, inUse)
      );
      continue;
    }

    // Staffed service fixtures: an unstaffed counter is more actionable than a
    // busy one, which is exactly the order `firstBlockedReason` reports.
    if (module.type === ModuleType.ServingLine || module.type === ModuleType.ArrivalDesk) {
      const label = module.type === ModuleType.ServingLine ? 'SERVING' : 'DESK';
      const reason = firstBlockedReason({
        'no-staff': report.staffSlots > 0 && report.staffed <= 0,
        'no-free-provider': full
      });
      const detail = reason !== null
        ? blockedCopy(reason)
        : `STAFF ${report.staffed}/${report.staffSlots}`;
      drawChip(module.originTile, [`${label} ${inUse}/${total}`, detail], accentFor(reason, inUse));
      continue;
    }

    // Beds and wash stalls are unstaffed providers: capacity is the whole story
    // until they saturate.
    const label = module.type === ModuleType.GuestCabin ? 'CABIN' : 'WASH';
    const reason = firstBlockedReason({ 'no-free-provider': full });
    drawChip(
      module.originTile,
      [`${label} ${inUse}/${total}`, blockedCopy(reason)],
      accentFor(reason, inUse)
    );
  }
}

function drawCommercialTenantStaff(
  ctx: CanvasRenderingContext2D,
  state: StationState,
  spriteAtlas: SpriteAtlas,
  useSprites: boolean,
  visibleTiles: { minX: number; maxX: number; minY: number; maxY: number }
): void {
  const accent = '#56e2bd';
  for (const unit of state.commercialUnits) {
    if (unit.phase !== 'open') continue;
    for (let index = 0; index < unit.tenantStaffTiles.length; index++) {
      const tile = unit.tenantStaffTiles[index];
      if (!tileInRange(tile, state, visibleTiles)) continue;
      const p = fromIndex(tile, state.width);
      const offset = agentOffset(unit.id * 101 + index * 17);
      const cx = (p.x + 0.5 + offset.x * 0.55) * TILE_SIZE;
      const cy = (p.y + 0.5 + offset.y * 0.55) * TILE_SIZE;
      const spriteKey = pickAgentVariant(AGENT_SPRITE_VARIANTS.crew, unit.id * 7 + index);
      const drewSprite = useSprites && drawTintedAgentSprite(
        ctx,
        spriteAtlas,
        spriteKey,
        cx,
        cy,
        TILE_SIZE * AGENT_SPRITE_SCALE,
        accent,
        0.38
      );

      ctx.save();
      if (!drewSprite) {
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(cx, cy, TILE_SIZE * 0.19, 0, Math.PI * 2);
        ctx.fill();
      }
      const radius = TILE_SIZE * AGENT_SPRITE_SCALE * 0.5;
      ctx.strokeStyle = 'rgba(5, 12, 20, 0.92)';
      ctx.lineWidth = Math.max(3, TILE_SIZE * 0.11);
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = accent;
      ctx.lineWidth = Math.max(1, TILE_SIZE * 0.052);
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();

      const label = 'TENANT';
      const fontSize = Math.max(7, Math.round(TILE_SIZE * 0.26));
      ctx.font = `bold ${fontSize}px monospace`;
      const labelWidth = ctx.measureText(label).width + Math.max(5, TILE_SIZE * 0.24);
      const labelHeight = Math.max(10, TILE_SIZE * 0.42);
      const labelY = cy + radius * 0.72;
      ctx.fillStyle = 'rgba(5, 12, 20, 0.92)';
      ctx.fillRect(cx - labelWidth * 0.5, labelY, labelWidth, labelHeight);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - labelWidth * 0.5, labelY, labelWidth, labelHeight);
      ctx.fillStyle = accent;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, cx, labelY + labelHeight * 0.52);
      ctx.restore();
    }
  }
}

function drawIncidentMarkers(
  ctx: CanvasRenderingContext2D,
  state: StationState,
  visibleTiles: { minX: number; maxX: number; minY: number; maxY: number }
): void {
  for (const incident of state.incidents) {
    if (!tileInRange(incident.tileIndex, state, visibleTiles)) continue;
    const settled = incident.stage === 'resolved' || incident.stage === 'failed';
    // Closed incidents remain in state briefly for history/metrics, but the
    // live world marker must agree with Alerts and the active incident list.
    if (settled) continue;
    const p = fromIndex(incident.tileIndex, state.width);
    const cx = (p.x + 0.5) * TILE_SIZE;
    const cy = (p.y + 0.5) * TILE_SIZE;
    const pulse = (Math.sin(state.now * 6 + incident.id) + 1) * 0.5;
    const urgency = incident.stage === 'dispatching' || incident.assignedCrewId === null ? 1 : 0.65;
    const color = incident.stage === 'failed'
      ? '#8ea2bd'
      : incident.type === 'fight'
        ? '#ff3f46'
        : incident.type === 'theft'
          ? '#ffe06a'
          : '#ff9d3a';
    const alpha = 0.34 + pulse * 0.2;
    const ringRadius = TILE_SIZE * (0.58 + pulse * 0.22 + incident.severity * 0.04);

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(255, 157, 58, ${alpha * 0.42})`;
    ctx.beginPath();
    ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, TILE_SIZE * 0.08 * urgency);
    ctx.beginPath();
    ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(8, 12, 18, 0.92)';
    ctx.beginPath();
    ctx.arc(cx, cy, TILE_SIZE * 0.24, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, TILE_SIZE * 0.045);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = `bold ${Math.round(13 * PX)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', cx, cy + Math.round(0.5 * PX));

    const label = `${incident.type === 'fight' ? 'FIGHT' : incident.type === 'theft' ? 'THEFT' : 'TRESPASS'} #${incident.id}`;
    const labelW = Math.max(Math.round(48 * PX), ctx.measureText(label).width + Math.round(8 * PX));
    const labelH = Math.round(11 * PX);
    ctx.fillStyle = 'rgba(8, 12, 18, 0.88)';
    ctx.fillRect(cx - labelW * 0.5, cy - TILE_SIZE * 0.82, labelW, labelH);
    ctx.fillStyle = color;
    ctx.font = `bold ${Math.round(7 * PX)}px monospace`;
    ctx.fillText(label, cx, cy - TILE_SIZE * 0.82 + labelH * 0.55);
    ctx.restore();
  }
}

function drawLocalAirWarnings(
  ctx: CanvasRenderingContext2D,
  state: StationState,
  spriteAtlas: SpriteAtlas,
  useSprites: boolean,
  visibleTiles: { minX: number; maxX: number; minY: number; maxY: number }
): void {
  const occupied = new Set<number>();
  for (const actor of state.visitors) occupied.add(actor.tileIndex);
  for (const actor of state.residents) occupied.add(actor.tileIndex);
  for (const actor of state.crewMembers) occupied.add(actor.tileIndex);

  const candidates: Array<{ tile: number; air: number; occupied: boolean }> = [];
  for (let y = visibleTiles.minY; y <= visibleTiles.maxY; y++) {
    for (let x = visibleTiles.minX; x <= visibleTiles.maxX; x++) {
      const tile = y * state.width + x;
      if (!isWalkable(state.tiles[tile])) continue;
      const air = state.airQualityByTile[tile];
      // This is the normal world view, not the dedicated Air Coverage overlay.
      // Reserve the floating O2 badge for an actual local emergency; distant
      // but breathable tiles are explained by the overlay and HUD warning.
      if (!Number.isFinite(air) || air >= 12) continue;
      const hasActor = occupied.has(tile);
      // Even a real emergency needs only a sample in the world view. The
      // overlay carries the full map; these badges point the player toward it.
      const cadence = Math.floor(state.now / 2.5);
      const sampleEvery = hasActor ? 4 : 12;
      if (Math.abs(tile * 19 + cadence) % sampleEvery !== 0) continue;
      candidates.push({ tile, air, occupied: hasActor });
    }
  }
  candidates.sort((a, b) => Number(b.occupied) - Number(a.occupied) || a.air - b.air);

  ctx.save();
  for (const candidate of candidates.slice(0, 12)) {
    const p = fromIndex(candidate.tile, state.width);
    const severity = clamp01((55 - candidate.air) / 55);
    const pulse = 0.72 + Math.sin(state.now * 2.2 + candidate.tile * 0.37) * 0.16;
    const alpha = (candidate.occupied ? 0.34 : 0.18) + severity * 0.26;
    const drew = useSprites && drawSpriteByKey(
      ctx,
      spriteAtlas,
      FX_SPRITE_KEYS.lowOxygen,
      p.x * TILE_SIZE,
      p.y * TILE_SIZE,
      TILE_SIZE,
      TILE_SIZE,
      0,
      alpha * pulse
    );
    if (!drew) {
      const cx = (p.x + 0.5) * TILE_SIZE;
      const cy = (p.y + 0.22) * TILE_SIZE;
      const badgeRadius = TILE_SIZE * (0.22 + severity * 0.04);
      ctx.fillStyle = `rgba(7, 18, 27, ${0.72 + severity * 0.16})`;
      ctx.strokeStyle = `rgba(132, 214, 232, ${alpha * pulse + 0.28})`;
      ctx.lineWidth = Math.max(1, TILE_SIZE * 0.05);
      ctx.beginPath();
      ctx.arc(cx, cy, badgeRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = `rgba(190, 239, 248, ${0.78 + severity * 0.2})`;
      ctx.font = `bold ${Math.max(7, Math.round(TILE_SIZE * 0.28))}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('O2', cx, cy + Math.max(0.5, TILE_SIZE * 0.01));
    }
  }
  ctx.restore();
}

// A door is contended by the people standing in its mouth and by the people
// whose committed route runs through it. A stalled transfer queue has no path
// at all, so bodies packed around the throat count too — that is the pinch the
// player is meant to see and widen. One person walking through is ordinary
// traffic; three converging on the same tile is not.
const DOOR_CONTENTION_MIN_ACTORS = 3;
const DOOR_CONTENTION_LOOKAHEAD = 8;

function drawDoorContentionIndicators(
  ctx: CanvasRenderingContext2D,
  state: StationState,
  visibleTiles: { minX: number; maxX: number; minY: number; maxY: number }
): void {
  const contendersByTile = new Map<number, number>();
  const waitingByTile = new Map<number, number>();
  const counted = new Set<number>();
  const isThroat = (tile: number): boolean =>
    state.tiles[tile] === TileType.Door || state.tiles[tile] === TileType.Airlock;
  const note = (tile: number | null | undefined, waiting: boolean): void => {
    if (tile === null || tile === undefined || counted.has(tile)) return;
    if (tile < 0 || tile >= state.tiles.length || !isThroat(tile)) return;
    if (!tileInRange(tile, state, visibleTiles)) return;
    counted.add(tile);
    contendersByTile.set(tile, (contendersByTile.get(tile) ?? 0) + 1);
    if (waiting) waitingByTile.set(tile, (waitingByTile.get(tile) ?? 0) + 1);
  };
  const noteActor = (actor: { tileIndex: number; path: number[]; movementWaitReason?: string }): void => {
    counted.clear();
    const waiting = actor.movementWaitReason !== undefined || actor.path.length === 0;
    note(actor.tileIndex, waiting);
    for (let step = 0; step < Math.min(DOOR_CONTENTION_LOOKAHEAD, actor.path.length); step++) {
      note(actor.path[step], waiting);
    }
    // A body parked in the mouth of a throat blocks it whether or not it still
    // holds a route, so sample the ring around anyone who has stopped moving.
    if (actor.path.length > 0) return;
    const here = fromIndex(actor.tileIndex, state.width);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const x = here.x + dx;
        const y = here.y + dy;
        if (!inBounds(x, y, state.width, state.height)) continue;
        note(toIndex(x, y, state.width), true);
      }
    }
  };
  for (const actor of state.visitors) noteActor(actor);
  for (const actor of state.residents) noteActor(actor);
  for (const actor of state.crewMembers) noteActor(actor);

  const contended = [...contendersByTile.entries()]
    .filter(([, count]) => count >= DOOR_CONTENTION_MIN_ACTORS)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  if (contended.length === 0) return;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const [tile, count] of contended) {
    const p = fromIndex(tile, state.width);
    const cx = (p.x + 0.5) * TILE_SIZE;
    const cy = (p.y + 0.5) * TILE_SIZE;
    const stalled = (waitingByTile.get(tile) ?? 0) > 0;
    const color = stalled || count >= DOOR_CONTENTION_MIN_ACTORS + 2 ? '#ff8f5c' : '#ffd36a';
    const pulse = 0.62 + Math.sin(state.now * 3.4 + tile * 0.31) * 0.2;
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, TILE_SIZE * 0.07);
    ctx.beginPath();
    ctx.arc(cx, cy, TILE_SIZE * (0.42 + pulse * 0.1), 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    // Clear the bodies standing in the throat: the count is the whole point of
    // the marker, and a queue is exactly what covers the tile it sits on.
    const badgeRadius = Math.max(5, TILE_SIZE * 0.2);
    const badgeY = cy - TILE_SIZE * 0.92;
    ctx.fillStyle = 'rgba(5, 10, 16, 0.9)';
    ctx.beginPath();
    ctx.arc(cx, badgeY, badgeRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, TILE_SIZE * 0.045);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = `bold ${Math.max(7, Math.round(TILE_SIZE * 0.3))}px Consolas, Menlo, monospace`;
    ctx.fillText(String(Math.min(99, count)), cx, badgeY + 0.5);
  }
  ctx.restore();
}

/**
 * The authored `blocked`/`late` Gangway frames say something is wrong at the
 * collar; these lines say what, in the same short world-label form the fuel
 * and maintenance indicators already use.
 */
function drawGangwayStatusLabels(
  ctx: CanvasRenderingContext2D,
  state: StationState,
  visibleTiles: { minX: number; maxX: number; minY: number; maxY: number }
): void {
  ctx.save();
  for (const ship of state.arrivingShips) {
    if (ship.stage !== 'docked') continue;
    const anchor = ship.assignedBerthAnchor;
    if (anchor === null || anchor === undefined) continue;
    const facility = getBerthFacilityAt(state, anchor);
    if (!facility) continue;
    const gangwayIds = new Set(facility.serviceModuleIds[ModuleType.Gangway] ?? []);
    if (gangwayIds.size === 0) continue;
    for (const module of state.moduleInstances) {
      if (module.type !== ModuleType.Gangway || !gangwayIds.has(module.id)) continue;
      if (!module.tiles.some((tile) => tileInRange(tile, state, visibleTiles))) continue;
      const visualState = gangwayVisualState(state, module, ship);
      if (visualState !== 'blocked' && visualState !== 'late') continue;
      const origin = fromIndex(module.originTile, state.width);
      const text = visualState === 'late'
        ? `LATE BOARDING | ${shipUnboardedPassengers(ship)} PAX`
        : `GANGWAY BLOCKED | ${gangwayTransferLoad(state, module, anchor).transferring} PAX`;
      drawModuleStatusLabel(
        ctx,
        text,
        (origin.x + module.width * 0.5) * TILE_SIZE,
        origin.y * TILE_SIZE - Math.max(18, TILE_SIZE * 0.62),
        visualState === 'late' ? '#ff7a76' : '#ffd36a'
      );
    }
  }
  ctx.restore();
}

function drawAgentStatusPip(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  code: string,
  color: string,
  offset: number = 0
): void {
  const radius = Math.max(5, TILE_SIZE * 0.18);
  const x = cx + TILE_SIZE * 0.29 + offset * radius * 1.45;
  const y = cy - TILE_SIZE * 0.35;
  ctx.save();
  ctx.fillStyle = 'rgba(5, 10, 16, 0.9)';
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, TILE_SIZE * 0.045);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = `bold ${Math.max(7, Math.round(TILE_SIZE * 0.3))}px Consolas, Menlo, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(code, x, y + 0.5);
  ctx.restore();
}

// Air coverage is already visible through its overlay and station-level alert.
// Showing an O2 pip over every recovering actor turns a local emergency into
// permanent visual noise, so only sample people who are still in poor air.
function shouldDrawAirDistressPip(state: StationState, actorId: number, tileIndex: number): boolean {
  const localAir = airQualityAt(state, tileIndex);
  if (localAir > 15) return false;
  const cadence = Math.floor(state.now / 2.5);
  const sampleEvery = localAir <= 8 ? 3 : 5;
  return Math.abs(actorId * 17 + cadence) % sampleEvery === 0;
}

export function renderWorld(
  ctx: CanvasRenderingContext2D,
  state: StationState,
  currentTool: BuildTool,
  hoveredTile: number | null = null,
  spriteAtlas: SpriteAtlas,
  viewportInput: RenderViewport | null = null,
  approachPreview: ApproachEnvelopePreview = {}
): void {
  const widthPx = state.width * TILE_SIZE;
  const heightPx = state.height * TILE_SIZE;
  const useSprites = spritesEnabled(state, spriteAtlas);
  const viewport = normalizeViewport(viewportInput, widthPx, heightPx);
  const visibleTiles = tileRangeForViewport(viewport, state);
  const environment = getStationEnvironment(state);
  const visualTime = renderTimeSeconds();

  ctx.save();
  if (viewport) {
    ctx.beginPath();
    ctx.rect(viewport.x, viewport.y, viewport.width, viewport.height);
    ctx.clip();
  }
  ctx.fillStyle = '#061018';
  if (viewport) {
    ctx.fillRect(viewport.x, viewport.y, viewport.width, viewport.height);
  } else {
    ctx.fillRect(0, 0, widthPx, heightPx);
  }
  renderSeededSpaceConditionBackdrop(ctx, state, viewport, environment, visualTime);
  renderCelestialBackdrop(ctx, state, viewport, environment, visualTime);
  renderTrafficBackdrop(ctx, viewport, environment, visualTime);
  const staticLayer = ensureStaticLayer(state, widthPx, heightPx, spriteAtlas, useSprites);
  const decorativeLayer = ensureDecorativeLayer(state, widthPx, heightPx, spriteAtlas, useSprites);
  drawCachedLayer(ctx, staticLayer.canvas, viewport);
  drawCachedLayer(ctx, decorativeLayer.canvas, viewport);
  drawFacilitySpriteStateOverlay(ctx, state, visibleTiles, spriteAtlas, useSprites);
  renderSunwardHullRim(ctx, state, visibleTiles, environment);
  // Glow pass paints after the sprite layers (additive blend). Gated on
  // state.controls.showGlow; cache key includes dynamic signatures (med-bed
  // occupancy, kitchen-active) so frame cost is ~0 when nothing changes.
  renderGlowPass(ctx, state, widthPx, heightPx, useSprites, viewport);
  const focusedUtilityKind =
    currentTool.kind === 'utility-underlay' && !currentTool.utilityErase
      ? currentTool.utilityKind
      : undefined;
  const diagnosticLayer = ensureDiagnosticOverlayLayer(
    state,
    widthPx,
    heightPx,
    spriteAtlas,
    useSprites,
    focusedUtilityKind
  );
  if (diagnosticLayer) drawCachedLayer(ctx, diagnosticLayer.canvas, viewport);
  ctx.save();
  clipToVisibleSpaceTiles(ctx, state, visibleTiles);
  renderDebrisBackdrop(ctx, state, spriteAtlas, useSprites, viewport, environment, visualTime);
  ctx.restore();
  renderHullWearOverlays(ctx, state, spriteAtlas, useSprites, viewport);
  renderMaintenanceImpacts(ctx, state, spriteAtlas, useSprites, viewport);
  renderDockInfrastructureAnimationPass(ctx, state, visibleTiles, spriteAtlas, useSprites);
  drawFuelTankFillGauges(ctx, state, visibleTiles);
  drawFuelCouplerConnectionIndicators(
    ctx,
    state,
    visibleTiles,
    currentTool.kind === 'utility-underlay' && currentTool.utilityKind === 'fuel-pipe' && !currentTool.utilityErase
  );

  const activeRoomTiles = collectActiveRoomTiles(state);
  const serviceOverlay = readServiceOverlay(state);
  const serviceNodeReachability = serviceOverlay.reachability;
  const serviceNodeTiles = serviceOverlay.nodeTiles;
  const unreachableServiceNodeTiles = serviceOverlay.unreachableNodeTiles;
  const queueNodeTiles = serviceOverlay.queueNodeTiles;
  const jobPickupTiles = serviceOverlay.jobPickupTiles;
  const jobDropTiles = serviceOverlay.jobDropTiles;
  const moduleInventoryVisualMap: Map<number, ModuleInventoryVisual> = state.controls.showInventoryOverlay
    ? buildModuleInventoryVisualMap(state)
    : new Map<number, ModuleInventoryVisual>();
  const bodyCountByTile = new Map<number, number>();
  for (const tile of state.bodyTiles) {
    bodyCountByTile.set(tile, (bodyCountByTile.get(tile) ?? 0) + 1);
  }

  for (let y = visibleTiles.minY; y <= visibleTiles.maxY; y++) {
    for (let x = visibleTiles.minX; x <= visibleTiles.maxX; x++) {
    const i = y * state.width + x;
    const px = x * TILE_SIZE;
    const py = y * TILE_SIZE;
    const roomType = state.rooms[i];
    // Inactive-room dim. Dropped from 0.45 -> 0.22 per awfml 2026-04-23:
    // at 0.45 this wiped 45% of the sprite color, which combined with the
    // red-wash below produced aggregate rust. 0.22 still reads as "this
    // room is inactive" without flattening texture variety.
    if (roomType !== RoomType.None && !activeRoomTiles.has(i)) {
      ctx.fillStyle = 'rgba(8, 14, 22, 0.22)';
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
    }

    const blockedUntil = state.effects.blockedUntilByTile.get(i) ?? 0;
    if (state.now < blockedUntil) {
      ctx.fillStyle = 'rgba(255,120,120,0.55)';
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
    }

    // Depressurized-tile red wash. Dropped from 0.22 -> 0.08 per awfml
    // 2026-04-23: at 0.22 this pass composited with the dim-inactive pass
    // (0.45) turned every room rust-brown ("pokemon red") whenever atmos
    // flagged interior tiles as vacuum-reachable (which happens by default
    // on demo-station because doors aren't pressure barriers in the current
    // sim model). 0.08 keeps the diagnostic signal without dominating the
    // aesthetic.
    if (isWalkable(state.tiles[i]) && !state.pressurized[i]) {
      ctx.fillStyle = 'rgba(160, 40, 40, 0.08)';
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
    }

    if (state.controls.showServiceNodes && serviceNodeTiles.has(i)) {
      const unreachable = unreachableServiceNodeTiles.has(i);
      ctx.fillStyle = unreachable ? 'rgba(255, 86, 86, 0.42)' : 'rgba(0, 230, 180, 0.28)';
      ctx.fillRect(px + Math.round(2 * PX), py + Math.round(2 * PX), TILE_SIZE - Math.round(4 * PX), TILE_SIZE - Math.round(4 * PX));
      if (unreachable) {
        ctx.strokeStyle = 'rgba(255, 138, 138, 0.95)';
        ctx.strokeRect(px + Math.round(2.5 * PX), py + Math.round(2.5 * PX), TILE_SIZE - Math.round(5 * PX), TILE_SIZE - Math.round(5 * PX));
      }
    }
    if (state.controls.showServiceNodes && queueNodeTiles.has(i)) {
      ctx.fillStyle = 'rgba(255, 205, 80, 0.3)';
      ctx.fillRect(px + Math.round(5 * PX), py + Math.round(5 * PX), TILE_SIZE - Math.round(10 * PX), TILE_SIZE - Math.round(10 * PX));
    }
    if (state.controls.showServiceNodes && jobPickupTiles.has(i)) {
      ctx.fillStyle = 'rgba(90, 180, 255, 0.45)';
      ctx.fillRect(px + Math.round(1 * PX), py + Math.round(1 * PX), Math.round(4 * PX), Math.round(4 * PX));
    }
    if (state.controls.showServiceNodes && jobDropTiles.has(i)) {
      ctx.fillStyle = 'rgba(255, 140, 90, 0.45)';
      ctx.fillRect(px + TILE_SIZE - Math.round(5 * PX), py + TILE_SIZE - Math.round(5 * PX), Math.round(4 * PX), Math.round(4 * PX));
    }
    const bodiesHere = bodyCountByTile.get(i) ?? 0;
    if (bodiesHere > 0) {
      ctx.fillStyle = 'rgba(210, 80, 80, 0.9)';
      ctx.fillRect(px + Math.round(2 * PX), py + TILE_SIZE - Math.round(6 * PX), TILE_SIZE - Math.round(4 * PX), Math.round(4 * PX));
      if (bodiesHere > 1) {
        ctx.fillStyle = '#ffdede';
        ctx.font = `bold ${Math.round(8 * PX)}px monospace`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(String(bodiesHere), px + TILE_SIZE - Math.round(2 * PX), py + TILE_SIZE - Math.round(8 * PX));
      }
    }
  }
  }

  for (const module of state.moduleInstances) {
    if (!module.tiles.some((tile) => tileInRange(tile, state, visibleTiles))) continue;
    const origin = fromIndex(module.originTile, state.width);
    const px = origin.x * TILE_SIZE;
    const py = origin.y * TILE_SIZE;
    const w = module.width * TILE_SIZE;
    const h = module.height * TILE_SIZE;
    const inventory = moduleInventoryVisualMap.get(module.originTile);
    if (state.controls.showInventoryOverlay && inventory && inventory.capacity > 0) {
      const innerX = px + Math.round(3 * PX);
      const innerY = py + Math.round(3 * PX);
      const innerW = w - Math.round(6 * PX);
      const innerH = h - Math.round(6 * PX);
      const fillHeight = Math.round(innerH * inventory.fillPct);
      if (fillHeight > 0) {
        const color = itemFillColor[inventory.dominantItem ?? 'none'];
        ctx.fillStyle = color;
        ctx.fillRect(innerX, innerY + (innerH - fillHeight), innerW, fillHeight);
      }
      if (inventory.mixed && inventory.used > 0.01) {
        ctx.fillStyle = 'rgba(230, 240, 255, 0.95)';
        ctx.font = `bold ${Math.round(9 * PX)}px monospace`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText('+', px + w - Math.round(4 * PX), py + Math.round(4 * PX));
      }
    }
    if (state.controls.showInventoryOverlay && inventory && inventory.capacity > 0) {
      const usedLabel = `${Math.round(inventory.used)}/${Math.round(inventory.capacity)}`;
      const itemCode = inventory.dominantItem ? itemShortCode[inventory.dominantItem] : '';
      if (module.width === 1 && module.height === 1) {
        if (itemCode) {
          ctx.fillStyle = 'rgba(8, 12, 18, 0.8)';
          ctx.fillRect(px + Math.round(2 * PX), py + Math.round(2 * PX), TILE_SIZE - Math.round(4 * PX), Math.round(8 * PX));
          ctx.fillStyle = '#e5f0ff';
          ctx.font = `bold ${Math.round(7 * PX)}px monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(itemCode, px + TILE_SIZE * 0.5, py + Math.round(3 * PX));
        }
      } else {
        const text = itemCode ? `${usedLabel} ${itemCode}` : usedLabel;
        ctx.fillStyle = 'rgba(8, 12, 18, 0.84)';
        ctx.fillRect(px + Math.round(2 * PX), py + Math.round(2 * PX), Math.max(Math.round(18 * PX), text.length * Math.round(4.8 * PX)), Math.round(8 * PX));
        ctx.fillStyle = '#dce8f9';
        ctx.font = `bold ${Math.round(7 * PX)}px monospace`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(text, px + Math.round(3 * PX), py + Math.round(3 * PX));
      }
    }
  }

  // Inventory already moves through real pickup/carry/drop-off jobs. Keep the
  // goods visible in the normal world view so players can watch that flow
  // without switching to a diagnostic overlay.
  drawLocatedInventorySprites(ctx, state, visibleTiles);
  drawTransportJobMarkers(ctx, state, visibleTiles);

  drawCommercialOfferPreviews(ctx, state, spriteAtlas, useSprites, visibleTiles);

  drawStructuralPieces(ctx, state, spriteAtlas, useSprites, visibleTiles);

  const labeledBlockedConstruction = new Set<number>();
  for (const site of state.constructionSites) {
    if (site.kind === 'structural-piece') continue;
    if (!tileInRange(site.tileIndex, state, visibleTiles)) continue;
    const p = fromIndex(site.tileIndex, state.width);
    const px = p.x * TILE_SIZE;
    const py = p.y * TILE_SIZE;
    const delivered = site.requiredMaterials > 0 ? site.deliveredMaterials / site.requiredMaterials : 1;
    const built = site.buildWorkRequired > 0 ? site.buildProgress / site.buildWorkRequired : 0;
    const progress = Math.max(0, Math.min(1, site.state === 'building' ? built : delivered));
    // A structural child can be finished yet still held by a parent stalled on
    // its own seal/support verdict, so the reason — not the site state — is
    // what marks the whole shell as stalled.
    const stalled = site.state === 'blocked' || !!site.blockedReason;
    ctx.fillStyle = site.requiresEva ? 'rgba(111, 216, 255, 0.28)' : 'rgba(255, 207, 110, 0.24)';
    ctx.fillRect(px + Math.round(2 * PX), py + Math.round(2 * PX), TILE_SIZE - Math.round(4 * PX), TILE_SIZE - Math.round(4 * PX));
    ctx.strokeStyle = stalled ? '#ff7676' : site.requiresEva ? '#6fd8ff' : '#ffcf6e';
    ctx.setLineDash([Math.round(4 * PX), Math.round(3 * PX)]);
    ctx.strokeRect(px + Math.round(2.5 * PX), py + Math.round(2.5 * PX), TILE_SIZE - Math.round(5 * PX), TILE_SIZE - Math.round(5 * PX));
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(7, 12, 18, 0.86)';
    ctx.fillRect(px + Math.round(4 * PX), py + TILE_SIZE - Math.round(8 * PX), TILE_SIZE - Math.round(8 * PX), Math.round(4 * PX));
    ctx.fillStyle = stalled ? '#ff7676' : '#6edb8f';
    ctx.fillRect(
      px + Math.round(4 * PX),
      py + TILE_SIZE - Math.round(8 * PX),
      Math.round((TILE_SIZE - Math.round(8 * PX)) * progress),
      Math.round(4 * PX)
    );
    ctx.fillStyle = '#e5f0ff';
    ctx.font = `bold ${Math.round(8 * PX)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const constructionLabel = site.structuralStage === 'seal-check'
      ? 'SEAL'
      : site.requiresEva ? 'EVA' : site.kind === 'module' ? 'MOD' : 'BLD';
    ctx.fillText(constructionLabel, px + TILE_SIZE * 0.5, py + TILE_SIZE * 0.45);

    if (stalled && site.blockedReason) {
      const labelKey = site.structuralProjectId ?? -site.id;
      if (!labeledBlockedConstruction.has(labelKey)) {
        labeledBlockedConstruction.add(labelKey);
        const reason = `BLOCKED · ${site.blockedReason.toUpperCase()}`;
        ctx.font = `bold ${Math.round(8 * PX)}px monospace`;
        const labelWidth = Math.ceil(ctx.measureText(reason).width + 10 * PX);
        const labelX = px + TILE_SIZE * 0.5;
        const labelY = py - Math.round(12 * PX);
        ctx.fillStyle = 'rgba(21, 8, 12, 0.92)';
        ctx.fillRect(labelX - labelWidth * 0.5, labelY, labelWidth, Math.round(11 * PX));
        ctx.strokeStyle = '#ff7676';
        ctx.strokeRect(labelX - labelWidth * 0.5, labelY, labelWidth, Math.round(11 * PX));
        ctx.fillStyle = '#ffd7d7';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(reason, labelX, labelY + Math.round(5.5 * PX));
      }
    }
  }

  if (currentTool.kind === 'structural-piece' && currentTool.structuralPiece && hoveredTile !== null) {
    const preview = validateStructuralPiecePlacement(
      state,
      hoveredTile,
      currentTool.structuralPiece,
      state.controls.moduleRotation
    );
    for (const tile of preview.tiles) {
      if (!tileInRange(tile, state, visibleTiles)) continue;
      const point = fromIndex(tile, state.width);
      ctx.fillStyle = preview.ok ? 'rgba(88, 220, 236, 0.24)' : 'rgba(255, 92, 92, 0.3)';
      ctx.fillRect(point.x * TILE_SIZE + PX, point.y * TILE_SIZE + PX, TILE_SIZE - 2 * PX, TILE_SIZE - 2 * PX);
      ctx.strokeStyle = preview.ok ? '#6fd8ff' : '#ff7676';
      ctx.strokeRect(point.x * TILE_SIZE + 1.5 * PX, point.y * TILE_SIZE + 1.5 * PX, TILE_SIZE - 3 * PX, TILE_SIZE - 3 * PX);
    }
    if (!preview.ok) {
      ctx.fillStyle = 'rgba(21, 8, 12, 0.92)';
      ctx.fillRect(8 * PX, 20 * PX, Math.max(180 * PX, preview.reason.length * 5.5 * PX), 14 * PX);
      ctx.fillStyle = '#ffd7d7';
      ctx.font = `bold ${Math.round(9 * PX)}px monospace`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(preview.reason, 12 * PX, 27 * PX);
    }
  }

  if (currentTool.kind !== 'hire-staff' && hoveredTile !== null && hoveredTile >= 0 && hoveredTile < state.tiles.length) {
    const p = fromIndex(hoveredTile, state.width);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(p.x * TILE_SIZE + 1, p.y * TILE_SIZE + 1, TILE_SIZE - 2, TILE_SIZE - 2);
    ctx.lineWidth = 1;
    if ((bodyCountByTile.get(hoveredTile) ?? 0) > 0) {
      ctx.fillStyle = 'rgba(255, 195, 195, 0.95)';
      ctx.font = `${Math.round(11 * PX)}px monospace`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('Body remains (temporary system)', Math.round(8 * PX), Math.round(36 * PX));
    }
  }

  drawCrewHireGhost(ctx, state, currentTool, hoveredTile, spriteAtlas, useSprites, visibleTiles);

  if (currentTool.kind === 'tile' && currentTool.tile === TileType.Dock && hoveredTile !== null) {
    const preview = validateDockPlacement(state, hoveredTile);
    for (const ti of preview.approachTiles) {
      if (!tileInRange(ti, state, visibleTiles)) continue;
      const p = fromIndex(ti, state.width);
      ctx.fillStyle = preview.valid ? 'rgba(110,219,143,0.22)' : 'rgba(255,118,118,0.22)';
      ctx.fillRect(p.x * TILE_SIZE + 1, p.y * TILE_SIZE + 1, TILE_SIZE - 2, TILE_SIZE - 2);
    }
  }

  if (
    currentTool.kind === 'tile' &&
    currentTool.tile === TileType.Floor &&
    hoveredTile !== null &&
    state.tiles[hoveredTile] === TileType.Truss
  ) {
    const p = fromIndex(hoveredTile, state.width);
    ctx.fillStyle = 'rgba(110, 219, 143, 0.34)';
    ctx.fillRect(p.x * TILE_SIZE + 1, p.y * TILE_SIZE + 1, TILE_SIZE - 2, TILE_SIZE - 2);
    ctx.strokeStyle = 'rgba(110, 219, 143, 0.95)';
    ctx.lineWidth = Math.max(1, Math.round(1.25 * PX));
    ctx.strokeRect(p.x * TILE_SIZE + 1.5, p.y * TILE_SIZE + 1.5, TILE_SIZE - 3, TILE_SIZE - 3);
    ctx.lineWidth = 1;
  }

  if (currentTool.kind === 'utility-underlay' && hoveredTile !== null) {
    const p = fromIndex(hoveredTile, state.width);
    const valid =
      currentTool.utilityErase ||
      canPlaceUtilityUnderlay(state, currentTool.utilityKind ?? 'air-duct', hoveredTile);
    const isFuelPipe = currentTool.utilityKind === 'fuel-pipe';
    const isPowerCable = currentTool.utilityKind === 'power-conduit';
    ctx.fillStyle = currentTool.utilityErase
      ? 'rgba(255, 188, 82, 0.24)'
      : valid
        ? isFuelPipe ? 'rgba(242, 168, 75, 0.28)' : isPowerCable ? 'rgba(255, 214, 92, 0.28)' : 'rgba(97, 200, 255, 0.26)'
        : 'rgba(238, 79, 79, 0.26)';
    ctx.fillRect(p.x * TILE_SIZE + 1, p.y * TILE_SIZE + 1, TILE_SIZE - 2, TILE_SIZE - 2);
    ctx.strokeStyle = valid
      ? isFuelPipe ? 'rgba(255, 240, 189, 0.95)' : isPowerCable ? 'rgba(255, 245, 189, 0.95)' : 'rgba(167, 243, 255, 0.95)'
      : 'rgba(238, 79, 79, 0.95)';
    ctx.strokeRect(p.x * TILE_SIZE + 1.5, p.y * TILE_SIZE + 1.5, TILE_SIZE - 3, TILE_SIZE - 3);
  }

  if (currentTool.kind === 'module' && hoveredTile !== null && currentTool.module) {
    // Opening ticket 11: the ghost's verdict comes from the same validator the
    // build path runs, and an invalid one names its reason beside the cursor
    // instead of just turning red.
    const preview = previewModulePlacement(
      state,
      currentTool.module,
      hoveredTile,
      state.controls.moduleRotation
    );
    for (const ti of preview.tiles) {
      if (!tileInRange(ti, state, visibleTiles)) continue;
      const p = fromIndex(ti, state.width);
      ctx.fillStyle = preview.valid ? 'rgba(110,219,143,0.28)' : 'rgba(255,118,118,0.32)';
      ctx.fillRect(p.x * TILE_SIZE + 1, p.y * TILE_SIZE + 1, TILE_SIZE - 2, TILE_SIZE - 2);
      ctx.strokeStyle = preview.valid ? 'rgba(110,219,143,0.95)' : 'rgba(255,118,118,0.95)';
      ctx.strokeRect(p.x * TILE_SIZE + 1.5, p.y * TILE_SIZE + 1.5, TILE_SIZE - 3, TILE_SIZE - 3);
    }
    drawPlacementReason(ctx, state, hoveredTile, preview.valid ? `${preview.cost}c` : preview.reason, preview.valid);
  }

  drawApproachEnvelopePreview(ctx, state, currentTool, hoveredTile, approachPreview);

  if (currentTool.kind === 'move-module') {
    const selectedModule = currentTool.moveSourceModuleId === undefined
      ? undefined
      : state.moduleInstances.find((module) => module.id === currentTool.moveSourceModuleId);
    const hoveredModuleId = hoveredTile === null ? null : state.moduleOccupancyByTile[hoveredTile];
    const hoveredModule = hoveredModuleId === null
      ? undefined
      : state.moduleInstances.find((module) => module.id === hoveredModuleId);
    const source = selectedModule ?? hoveredModule;
    if (source) {
      for (const ti of source.tiles) {
        if (!tileInRange(ti, state, visibleTiles)) continue;
        const p = fromIndex(ti, state.width);
        ctx.fillStyle = 'rgba(94, 211, 255, 0.2)';
        ctx.fillRect(p.x * TILE_SIZE + 1, p.y * TILE_SIZE + 1, TILE_SIZE - 2, TILE_SIZE - 2);
        ctx.strokeStyle = 'rgba(138, 231, 255, 0.98)';
        ctx.lineWidth = Math.max(2, Math.round(2 * PX));
        ctx.strokeRect(p.x * TILE_SIZE + 2, p.y * TILE_SIZE + 2, TILE_SIZE - 4, TILE_SIZE - 4);
      }
    }
    if (selectedModule && hoveredTile !== null && !selectedModule.tiles.includes(hoveredTile)) {
      const preview = getModuleMovePreview(state, selectedModule.id, hoveredTile);
      for (const ti of preview.tiles) {
        if (!tileInRange(ti, state, visibleTiles)) continue;
        const p = fromIndex(ti, state.width);
        ctx.fillStyle = preview.ok ? 'rgba(110, 219, 143, 0.3)' : 'rgba(255, 118, 118, 0.34)';
        ctx.fillRect(p.x * TILE_SIZE + 1, p.y * TILE_SIZE + 1, TILE_SIZE - 2, TILE_SIZE - 2);
        ctx.strokeStyle = preview.ok ? 'rgba(110, 219, 143, 0.98)' : 'rgba(255, 118, 118, 0.98)';
        ctx.lineWidth = Math.max(1, Math.round(1.5 * PX));
        ctx.strokeRect(p.x * TILE_SIZE + 1.5, p.y * TILE_SIZE + 1.5, TILE_SIZE - 3, TILE_SIZE - 3);
      }
    }
  }

  drawLocalAirWarnings(ctx, state, spriteAtlas, useSprites, visibleTiles);
  drawPasteStampGhost(ctx, state, currentTool, hoveredTile, visibleTiles);
  drawIncidentMarkers(ctx, state, visibleTiles);
  drawCommercialUnitStatusChips(ctx, state, visibleTiles);
  drawMarketFixtureFeedback(ctx, state, visibleTiles);
  drawFacilityFixtureChips(ctx, state, visibleTiles);

  const actorInVisibleRange = (x: number, y: number, marginTiles = 2): boolean =>
    x >= visibleTiles.minX - marginTiles &&
    x <= visibleTiles.maxX + marginTiles &&
    y >= visibleTiles.minY - marginTiles &&
    y <= visibleTiles.maxY + marginTiles;

  // Crowd-loop v1 (B2): queue guide is HOVER-ONLY — the standing file of
  // bodies is the always-on signal; the dashed line is inspection detail
  // (owner feedback: always-on dashes read as debug clutter).
  const queueTheater = state.derived.queueTheater;
  const hoveredQueueRoom =
    hoveredTile !== null && (state.rooms[hoveredTile] === RoomType.Cafeteria || state.rooms[hoveredTile] === RoomType.Cantina)
      ? state.rooms[hoveredTile]
      : null;
  if (queueTheater && hoveredQueueRoom !== null && queueTheater.membersByAnchor.size > 0) {
    ctx.save();
    for (const [anchor, members] of queueTheater.membersByAnchor) {
      if (state.rooms[anchor] !== hoveredQueueRoom) continue;
      if (members.length < 1) continue;
      const chain = queueTheater.chainsByAnchor.get(anchor);
      if (!chain || chain.length < 2) continue;
      // show the occupied stretch plus two upcoming slots so the line's
      // direction is readable even while it grows
      const len = Math.min(members.length + 2, chain.length);
      ctx.strokeStyle = 'rgba(255, 214, 120, 0.55)';
      ctx.lineWidth = Math.max(2, TILE_SIZE * 0.16);
      ctx.setLineDash([TILE_SIZE * 0.32, TILE_SIZE * 0.22]);
      ctx.beginPath();
      for (let i = 0; i < len; i++) {
        const cp = fromIndex(chain[i], state.width);
        const lx = (cp.x + 0.5) * TILE_SIZE;
        const ly = (cp.y + 0.5) * TILE_SIZE;
        if (i === 0) ctx.moveTo(lx, ly);
        else ctx.lineTo(lx, ly);
      }
      ctx.stroke();
      // slot pips under each occupied position
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255, 214, 120, 0.45)';
      for (let i = 0; i < Math.min(members.length, chain.length); i++) {
        const cp = fromIndex(chain[i], state.width);
        ctx.beginPath();
        ctx.arc((cp.x + 0.5) * TILE_SIZE, (cp.y + 0.5) * TILE_SIZE, Math.max(2, TILE_SIZE * 0.1), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  let visibleThoughts = 0;
  const thoughtAnchors: Array<{ x: number; y: number }> = [];
  const thoughtWindowOpen = (id: number, urgent: boolean): boolean =>
    urgent || (Math.floor(state.now / 3) + id * 3) % 7 === 0;
  const shouldDrawThought = (id: number, cx: number, cy: number, urgent: boolean): boolean => {
    if (!thoughtWindowOpen(id, urgent)) return false;
    if (visibleThoughts >= 5) return false;
    if (thoughtAnchors.some((anchor) => Math.abs(anchor.x - cx) < TILE_SIZE * 5 && Math.abs(anchor.y - cy) < TILE_SIZE * 3)) return false;
    thoughtAnchors.push({ x: cx, y: cy });
    visibleThoughts++;
    return true;
  };

  for (let vi = 0; vi < state.visitors.length; vi++) {
    const v = state.visitors[vi];
    if (!actorInVisibleRange(v.x, v.y)) continue;
    const o = v.state === VisitorState.Eating || v.state === VisitorState.Leisure
      ? seatedAgentOffset(state, v.tileIndex, v.id)
      : agentOffset(v.id);
    const cx = (v.x + o.x) * TILE_SIZE;
    const cy = (v.y + o.y) * TILE_SIZE;
    const angry = (v.angryUntil ?? 0) > state.now;
    const tint = angry ? '#ff3b30' : visitorMoodColor(state, vi);
    const spriteKey = pickAgentVariant(AGENT_SPRITE_VARIANTS.visitor, v.id);
    const spriteDrawn = useSprites && drawTintedAgentSprite(
      ctx, spriteAtlas, spriteKey, cx, cy,
      TILE_SIZE * AGENT_SPRITE_SCALE, tint, angry ? 0.6 : 0.35
    );
    if (!spriteDrawn) {
      ctx.fillStyle = tint;
      ctx.beginPath();
      ctx.arc(cx, cy, TILE_SIZE * 0.22, 0, Math.PI * 2);
      ctx.fill();
    }
    const failureStage = v.serviceFailureStage ?? 'none';
    const stranded = v.strandedFromShipId !== null && v.strandedFromShipId !== undefined;
    let pipOffset = 0;
    if (v.healthState === 'critical') {
      drawAgentStatusPip(ctx, cx, cy, '+', '#ff6b6b', pipOffset);
      pipOffset++;
    } else if (v.healthState === 'distressed' && shouldDrawAirDistressPip(state, v.id, v.tileIndex)) {
      drawAgentStatusPip(ctx, cx, cy, 'O2', '#72dff2', pipOffset);
      pipOffset++;
    }
    if (failureStage === 'unmet') {
      // Quietest rung of the ladder. Colour is already the escalation axis
      // (gold -> orange -> red), so the first rung keeps the same query glyph
      // in a cool hue: visible in world, but never mistaken for a warning.
      drawAgentStatusPip(ctx, cx, cy, '?', '#8fb2c9', pipOffset);
      pipOffset++;
    } else if (failureStage === 'balking') {
      drawAgentStatusPip(ctx, cx, cy, '?', '#f3bd62', pipOffset);
      pipOffset++;
    } else if (failureStage === 'distressed') {
      drawAgentStatusPip(ctx, cx, cy, '!', '#ffb454', pipOffset);
      pipOffset++;
    } else if (failureStage === 'disruptive') {
      drawAgentStatusPip(ctx, cx, cy, '!', '#ff5f5f', pipOffset);
      pipOffset++;
    } else if ((v.serviceBlockedSince ?? state.now) < state.now - 8) {
      drawAgentStatusPip(ctx, cx, cy, '?', '#f3bd62', pipOffset);
      pipOffset++;
    }
    if (stranded) drawAgentStatusPip(ctx, cx, cy, '>', '#7bdcff', pipOffset);
    // Crowd-loop v1 (B3): storm-offs read as angry at a glance...
    if (angry) {
      ctx.save();
      ctx.font = `bold ${Math.max(10, Math.round(TILE_SIZE * 0.62))}px monospace`;
      ctx.textAlign = 'center';
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.lineWidth = 3;
      ctx.strokeText('!', cx, cy - TILE_SIZE * 0.5);
      ctx.fillStyle = '#ff3b30';
      ctx.fillText('!', cx, cy - TILE_SIZE * 0.5);
      ctx.restore();
    } else if (v.state === VisitorState.Queueing) {
      // ...and queuers visibly wait (blinking dots).
      const phase = Math.floor(state.now * 1.6) % 3;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath();
      ctx.arc(cx, cy - TILE_SIZE * 0.52, TILE_SIZE * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      for (let d = 0; d <= phase; d++) {
        ctx.beginPath();
        ctx.arc(cx - TILE_SIZE * 0.12 + d * TILE_SIZE * 0.12, cy - TILE_SIZE * 0.52, Math.max(1.5, TILE_SIZE * 0.05), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    const urgentThought =
      angry ||
      v.healthState === 'critical' ||
      stranded ||
      failureStage === 'distressed' ||
      failureStage === 'disruptive' ||
      v.movementWaitReason === 'cargo crossing blocking boarding';
    const visitorThoughtWindowOpen = urgentThought
      ? (Math.floor(state.now / 2) + v.id * 5) % 3 === 0
      : thoughtWindowOpen(v.id, false);
    if (visitorThoughtWindowOpen) {
      const thought = visitorWorldThought(state, v);
      if (thought && shouldDrawThought(v.id, cx, cy, urgentThought)) {
        drawWorldThought(ctx, thought.text, cx, cy, urgentThought, thought.tone);
      }
    }
  }

  for (const r of state.residents) {
    if (!actorInVisibleRange(r.x, r.y)) continue;
    const o = agentOffset(r.id);
    const cx = (r.x + o.x) * TILE_SIZE;
    const cy = (r.y + o.y) * TILE_SIZE;
    const agitation = r.agitation ?? 0;
    const inConfrontation = (r.activeIncidentId ?? null) !== null || (r.confrontationUntil ?? 0) > state.now;
    const residentFill = inConfrontation
      ? '#ff2f2f'
      : agitation >= 70
        ? '#ff6f4d'
        : r.healthState === 'critical'
          ? '#ff8f8f'
          : r.healthState === 'distressed'
            ? '#ffd07a'
            : '#72f3b2';
    const isWarning = inConfrontation || agitation >= 70 || r.healthState === 'critical' || r.healthState === 'distressed';
    const spriteKey = pickAgentVariant(AGENT_SPRITE_VARIANTS.resident, r.id);
    const tintAlpha = isWarning ? 0.45 : 0.2;
    const spriteDrawn = useSprites && drawTintedAgentSprite(
      ctx, spriteAtlas, spriteKey, cx, cy,
      TILE_SIZE * AGENT_SPRITE_SCALE, residentFill, tintAlpha
    );
    if (spriteDrawn) {
      // Draw green ring around sprite
      const ringRadius = TILE_SIZE * AGENT_SPRITE_SCALE * 0.5;
      ctx.beginPath();
      ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
      ctx.strokeStyle = RESIDENT_MARK_COLOR;
      ctx.lineWidth = Math.max(1, TILE_SIZE * 0.055);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.fillStyle = residentFill;
      ctx.arc(cx, cy, TILE_SIZE * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = RESIDENT_MARK_COLOR;
      ctx.lineWidth = Math.max(1, TILE_SIZE * 0.055);
      ctx.stroke();
    }
    if (r.healthState === 'critical') drawAgentStatusPip(ctx, cx, cy, '+', '#ff6b6b');
    else if (r.healthState === 'distressed' && shouldDrawAirDistressPip(state, r.id, r.tileIndex)) {
      drawAgentStatusPip(ctx, cx, cy, 'O2', '#72dff2');
    }
    else if (r.leaveIntent >= 70 || (r.agitation ?? 0) >= 75) drawAgentStatusPip(ctx, cx, cy, '!', '#ff9d5c');
    const thought = residentWorldThought(state, r);
    const urgent = r.healthState === 'critical' || inConfrontation;
    if (thought && shouldDrawThought(r.id, cx, cy, urgent)) drawWorldThought(ctx, thought, cx, cy, urgent);
  }

  for (const c of state.crewMembers) {
    if (!actorInVisibleRange(c.x, c.y)) continue;
    const o = c.eatSessionActive ? seatedAgentOffset(state, c.tileIndex, c.id) : agentOffset(c.id);
    const cx = (c.x + o.x) * TILE_SIZE;
    const cy = (c.y + o.y) * TILE_SIZE;
    const spriteKey = STAFF_ROLE_SPRITE_KEYS[c.staffRole] ?? pickAgentVariant(AGENT_SPRITE_VARIANTS.crew, c.id);
    const crewTint = c.evaSuit ? '#f1fbff' : crewTintForStaffRole(c.staffRole);
    const crewTintAlpha = c.evaSuit ? 0.5 : 0.2;
    if (c.evaSuit) {
      if (
        useSprites &&
        (drawTintedAgentSprite(
          ctx,
          spriteAtlas,
          AGENT_EVA_SUIT_SPRITE_KEY,
          cx,
          cy,
          TILE_SIZE * AGENT_SPRITE_SCALE,
          '#dff7ff',
          0.08
        ) ||
          drawTintedAgentSprite(
            ctx,
            spriteAtlas,
            spriteKey,
            cx,
            cy,
            TILE_SIZE * AGENT_SPRITE_SCALE,
            crewTint,
            crewTintAlpha
          ))
      ) {
        const ringRadius = TILE_SIZE * AGENT_SPRITE_SCALE * 0.5;
        ctx.beginPath();
        ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
        ctx.strokeStyle = '#6fd8ff';
        ctx.lineWidth = Math.max(1, TILE_SIZE * 0.055);
        ctx.stroke();
        drawCarriedInventorySprite(ctx, c.carryingItemType, c.carryingAmount, cx, cy);
        continue;
      }
      drawEvaSuitAgentFallback(ctx, cx, cy, TILE_SIZE * AGENT_SPRITE_SCALE);
      drawCarriedInventorySprite(ctx, c.carryingItemType, c.carryingAmount, cx, cy);
      continue;
    }
    const crewSpriteDrawn = useSprites && drawTintedAgentSprite(
      ctx, spriteAtlas, spriteKey, cx, cy,
      TILE_SIZE * AGENT_SPRITE_SCALE, crewTint, crewTintAlpha
    );
    if (!crewSpriteDrawn) {
      ctx.fillStyle = crewTint;
      ctx.beginPath();
      ctx.arc(cx, cy, TILE_SIZE * 0.18, 0, Math.PI * 2);
      ctx.fill();
    }
    drawCarriedInventorySprite(ctx, c.carryingItemType, c.carryingAmount, cx, cy);
    if (c.healthState === 'critical') drawAgentStatusPip(ctx, cx, cy, '+', '#ff6b6b');
    else if (c.healthState === 'distressed' && shouldDrawAirDistressPip(state, c.id, c.tileIndex)) {
      drawAgentStatusPip(ctx, cx, cy, 'O2', '#72dff2');
    }
    else if (c.resignationNoticeAt !== null || c.missedPayrollCycles > 0) drawAgentStatusPip(ctx, cx, cy, '$', '#ff9d5c');
    else if (c.energy < 28) drawAgentStatusPip(ctx, cx, cy, 'Z', '#a9b8ff');
    const thought = crewWorldThought(state, c);
    const urgent = c.healthState === 'critical' || c.movementWaitReason === 'passenger flow blocking freight';
    if (thought && shouldDrawThought(c.id + 10000, cx, cy, urgent)) {
      drawWorldThought(ctx, thought, cx, cy, urgent);
    }
  }

  drawCommercialTenantStaff(ctx, state, spriteAtlas, useSprites, visibleTiles);

  // Crowd-loop v1 (B3): floating lost-sale coins / death notices.
  const crowdFloaters = state.derived.queueTheater?.floaters ?? [];
  if (crowdFloaters.length > 0) {
    ctx.save();
    ctx.textAlign = 'center';
    for (const f of crowdFloaters) {
      const age = state.now - f.bornAt;
      if (age < 0 || age > 3.2) continue;
      const alpha = Math.max(0, 1 - age / 3.2);
      const rise = age * TILE_SIZE * 0.85;
      ctx.globalAlpha = alpha;
      ctx.font = `bold ${Math.max(10, Math.round(TILE_SIZE * 0.5))}px monospace`;
      const fx = f.x * TILE_SIZE;
      const fy = f.y * TILE_SIZE - rise - TILE_SIZE * 0.35;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.lineWidth = 3;
      ctx.strokeText(f.text, fx, fy);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, fx, fy);
    }
    ctx.restore();
  }

  for (const ship of state.arrivingShips) {
    if (!actorInVisibleRange(ship.bayCenterX, ship.bayCenterY, 12)) continue;
    const isBerthBound = (ship.assignedBerthAnchor ?? null) !== null;
    if (isBerthBound) {
      drawDockedBerthShip(ctx, state, ship);
      continue;
    }
    if (isDockPodShip(ship)) {
      drawDockedPodShip(ctx, state, ship);
      continue;
    }
    const silhouette = resolveShipSilhouette(ship.id, ship.shipType, ship.size, ship.lane);
    const cellSize = TILE_SIZE * 0.9;
    const spriteW = silhouette.bounds.width * cellSize;
    const spriteH = silhouette.bounds.height * cellSize;
    const posX = ship.bayCenterX * TILE_SIZE - spriteW * 0.5;
    const posY = ship.bayCenterY * TILE_SIZE - spriteH * 0.5;
    const image = projectShipHullImage(ship.hullVariant, ship.shipType);
    if (image) {
      const aspect = shipHullProfile(ship.hullVariant).nativeAspect;
      const maxW = Math.max(TILE_SIZE * 2.5, spriteW);
      const maxH = Math.max(TILE_SIZE * 2.5, spriteH);
      let drawW = maxW;
      let drawH = drawW / Math.max(0.1, aspect);
      if (drawH > maxH) {
        drawH = maxH;
        drawW = drawH * aspect;
      }
      drawRotatedImage(ctx, image, { x: ship.bayCenterX * TILE_SIZE, y: ship.bayCenterY * TILE_SIZE }, drawW, drawH, laneAngleRad(ship.lane));
    } else {
      const palette = shipPalette(ship.shipType, ship.stage === 'docked');
      drawShipSilhouetteCells(ctx, silhouette, posX, posY, cellSize, palette, 2);
    }
  }

  drawDoorContentionIndicators(ctx, state, visibleTiles);
  drawGangwayStatusLabels(ctx, state, visibleTiles);
  const occupiedInfrastructureChips = drawBerthInformationChips(ctx, state);
  drawApproachWaitingChips(ctx, state, occupiedInfrastructureChips);
  // Pod demand and transaction summaries are drawn by the opening-economy
  // layer after renderWorld so one chip owns the complete visit story.
  drawPortCargoLots(ctx, state);

  drawQueuedShips(ctx, state, spriteAtlas, useSprites);
  drawLaneEdgeOverlay(ctx, state, widthPx, heightPx);

  if (state.now < state.effects.brownoutUntil) {
    ctx.fillStyle = 'rgba(90, 90, 130, 0.18)';
    ctx.fillRect(0, 0, widthPx, heightPx);
  }

  const toolText =
    currentTool.kind === 'none'
      ? 'Tool: Inspect'
      : currentTool.kind === 'tile'
      ? `Tool: ${currentTool.tile}`
      : currentTool.kind === 'zone'
        ? `Tool: Zone ${currentTool.zone}`
        : currentTool.kind === 'room'
          ? `Tool: Room ${currentTool.room}`
          : currentTool.kind === 'copy-room'
            ? 'Tool: Copy Station'
            : currentTool.kind === 'paste-room'
              ? 'Tool: Paste Station'
              : currentTool.kind === 'utility-underlay'
                ? currentTool.utilityErase
                  ? `Tool: Erase ${currentTool.utilityKind ?? 'utility'}`
                  : `Tool: ${currentTool.utilityKind ?? 'utility'}`
          : currentTool.kind === 'module'
            ? `Tool: Module ${currentTool.module} (${state.controls.moduleRotation}deg)`
            : currentTool.kind === 'structural-piece'
              ? `Tool: ${currentTool.structuralPiece} (${state.controls.moduleRotation}deg)`
            : currentTool.kind === 'move-module'
              ? currentTool.moveSourceModuleId === undefined
                ? 'Tool: Move Module - select fixture'
                : `Tool: Move ${currentTool.module} - choose destination`
            : currentTool.kind === 'hire-staff'
              ? `Tool: Place ${currentTool.staffRole}`
              : 'Tool: Cancel Build';

  ctx.fillStyle = '#d3deed';
  ctx.font = `${Math.round(12 * PX)}px monospace`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(toolText, Math.round(8 * PX), Math.round(16 * PX));
  ctx.fillStyle = 'rgba(8, 16, 28, 0.72)';
  ctx.fillRect(Math.round(6 * PX), Math.round(42 * PX), Math.round(220 * PX), Math.round(48 * PX));
  const legendItems: Array<{ color: string; label: string; y: number }> = [
    { color: '#f4e58c', label: 'Visitor mood (red->yellow->green)', y: Math.round(56 * PX) },
    { color: RESIDENT_MARK_COLOR, label: 'Resident', y: Math.round(70 * PX) },
    { color: '#7ec8ff', label: 'Crew', y: Math.round(84 * PX) }
  ];
  for (let i = 0; i < legendItems.length; i++) {
    const item = legendItems[i];
    ctx.fillStyle = item.color;
    ctx.beginPath();
    ctx.arc(Math.round(18 * PX), item.y, Math.round(3.2 * PX), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d3deed';
    ctx.font = `${Math.round(10 * PX)}px monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.label, Math.round(26 * PX), item.y);
  }
  if (state.controls.showServiceNodes && serviceNodeReachability) {
    const unreachableCount = serviceNodeReachability.unreachableNodeTiles.length;
    const reachableCount = Math.max(0, serviceNodeReachability.nodeTiles.length - unreachableCount);
    const line = `Service nodes: ok ${reachableCount} | unreachable ${unreachableCount} | queue ${queueNodeTiles.size}`;
    ctx.fillStyle = 'rgba(8, 16, 28, 0.76)';
    ctx.fillRect(Math.round(6 * PX), Math.round(78 * PX), Math.max(Math.round(220 * PX), line.length * Math.round(6 * PX)), Math.round(12 * PX));
    ctx.fillStyle = unreachableCount > 0 ? '#ff9a9a' : '#8fe8cf';
    ctx.font = `${Math.round(10 * PX)}px monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(line, Math.round(8 * PX), Math.round(84 * PX));
  }
  if (state.metrics.bodyCount > 0) {
    ctx.fillStyle = 'rgba(255, 180, 180, 0.95)';
    ctx.fillText(`Bodies: ${state.metrics.bodyCount}`, Math.round(8 * PX), Math.round(32 * PX));
  }
  // Fire overlay: animated red/orange flicker on each burning tile. Always
  // rendered (no toggle) — fires are an emergency state the player must see.
  if (state.effects.fires.length > 0) {
    for (const fire of state.effects.fires) {
      if (!tileInRange(fire.anchorTile, state, visibleTiles)) continue;
      const tx = fire.anchorTile % state.width;
      const ty = Math.floor(fire.anchorTile / state.width);
      const px = tx * TILE_SIZE;
      const py = ty * TILE_SIZE;
      const intensity = fire.intensity / 100;
      const flicker = 0.7 + 0.3 * Math.sin(state.now * 9 + fire.anchorTile * 0.31);
      // Base red wash
      ctx.save();
      ctx.fillStyle = `rgba(${200 + flicker * 30}, ${70 + flicker * 60}, 30, ${0.42 + intensity * 0.42})`;
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      // Inner bright core
      const r = TILE_SIZE * (0.18 + intensity * 0.16);
      ctx.fillStyle = `rgba(255, ${180 + flicker * 60}, ${90 + flicker * 40}, ${0.6 * intensity + 0.2})`;
      ctx.beginPath();
      ctx.arc(px + TILE_SIZE * 0.5, py + TILE_SIZE * 0.5, r, 0, Math.PI * 2);
      ctx.fill();
      // Flame triangles
      ctx.fillStyle = `rgba(255, 230, 130, ${0.7 * flicker})`;
      ctx.beginPath();
      ctx.moveTo(px + TILE_SIZE * 0.5, py + TILE_SIZE * (0.18 + 0.05 * flicker));
      ctx.lineTo(px + TILE_SIZE * 0.34, py + TILE_SIZE * 0.55);
      ctx.lineTo(px + TILE_SIZE * 0.66, py + TILE_SIZE * 0.55);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
  // Workforce-lane job badges for open work beyond sanitation/repair. These
  // keep the map legible now that jobs are scheduled by durable role lanes.
  for (const job of state.jobs) {
    if (job.type === 'repair' || job.type === 'sanitize') continue;
    if (job.state === 'done' || job.state === 'expired') continue;
    if (!tileInRange(job.fromTile, state, visibleTiles)) continue;
    const tx = job.fromTile % state.width;
    const ty = Math.floor(job.fromTile / state.width);
    const cx = (tx + 0.5) * TILE_SIZE;
    const cy = (ty + 0.5) * TILE_SIZE - TILE_SIZE * 0.18;
    const r = TILE_SIZE * 0.19;
    const inProgress = job.state === 'in_progress';
    const pulse = inProgress ? 0.65 + 0.35 * Math.sin(state.now * 4.4) : 1;
    const isFood = job.type === 'cook' || job.itemType === 'meal' || job.itemType === 'rawMeal';
    const isConstruction = job.type === 'construct';
    ctx.save();
    ctx.fillStyle = 'rgba(7, 13, 20, 0.8)';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = isFood
      ? `rgba(126, 220, 150, ${0.9 * pulse})`
      : isConstruction
        ? `rgba(255, 207, 110, ${0.9 * pulse})`
        : `rgba(117, 168, 230, ${0.85 * pulse})`;
    ctx.lineWidth = Math.max(1.4, TILE_SIZE * 0.045);
    ctx.stroke();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (isFood) {
      ctx.strokeStyle = `rgba(224, 255, 214, ${pulse})`;
      ctx.lineWidth = Math.max(1.4, TILE_SIZE * 0.045);
      ctx.beginPath();
      ctx.arc(cx - r * 0.08, cy + r * 0.04, r * 0.38, 0.05, Math.PI - 0.05);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + r * 0.25, cy + r * 0.05);
      ctx.lineTo(cx + r * 0.65, cy - r * 0.12);
      ctx.stroke();
      ctx.fillStyle = `rgba(126, 220, 150, ${0.65 * pulse})`;
      ctx.beginPath();
      ctx.arc(cx - r * 0.18, cy - r * 0.1, r * 0.12, 0, Math.PI * 2);
      ctx.arc(cx + r * 0.08, cy - r * 0.12, r * 0.1, 0, Math.PI * 2);
      ctx.fill();
    } else if (isConstruction) {
      ctx.strokeStyle = `rgba(255, 237, 178, ${pulse})`;
      ctx.lineWidth = Math.max(1.5, TILE_SIZE * 0.055);
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.48, cy - r * 0.28);
      ctx.lineTo(cx + r * 0.1, cy - r * 0.42);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.02, cy - r * 0.18);
      ctx.lineTo(cx + r * 0.42, cy + r * 0.5);
      ctx.stroke();
    } else {
      ctx.strokeStyle = `rgba(209, 229, 255, ${pulse})`;
      ctx.lineWidth = Math.max(1.2, TILE_SIZE * 0.04);
      ctx.strokeRect(cx - r * 0.45, cy - r * 0.35, r * 0.9, r * 0.7);
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.45, cy - r * 0.08);
      ctx.lineTo(cx + r * 0.45, cy - r * 0.08);
      ctx.moveTo(cx, cy - r * 0.35);
      ctx.lineTo(cx, cy + r * 0.35);
      ctx.stroke();
    }
    ctx.restore();
  }
  // Repair-job indicator: a small wrench badge over the anchor tile of any
  // open repair job. Pulses when a crew is actively servicing it. Surfaces the
  // maintenance debt → repair-job → crew loop without needing the diagnostic
  // overlay toggled on.
  for (const job of state.jobs) {
    if (job.type !== 'repair') continue;
    if (job.state === 'done' || job.state === 'expired') continue;
    if (!tileInRange(job.fromTile, state, visibleTiles)) continue;
    const tx = job.fromTile % state.width;
    const ty = Math.floor(job.fromTile / state.width);
    const cx = (tx + 0.5) * TILE_SIZE;
    const cy = (ty + 0.5) * TILE_SIZE - TILE_SIZE * 0.18;
    const r = TILE_SIZE * 0.22;
    const inProgress = job.state === 'in_progress';
    const pulse = inProgress ? 0.6 + 0.4 * Math.sin(state.now * 4) : 1;
    ctx.save();
    ctx.fillStyle = `rgba(8, 14, 22, 0.78)`;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(255, 207, 110, ${0.85 * pulse})`;
    ctx.lineWidth = Math.max(1.5, TILE_SIZE * 0.05);
    ctx.stroke();
    // Stylized wrench: short stem + open jaw
    ctx.strokeStyle = `rgba(255, 230, 160, ${pulse})`;
    ctx.lineWidth = Math.max(1.5, TILE_SIZE * 0.06);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.45, cy + r * 0.45);
    ctx.lineTo(cx + r * 0.15, cy - r * 0.15);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + r * 0.25, cy - r * 0.25, r * 0.32, 0.4, Math.PI * 1.6);
    ctx.stroke();
    ctx.restore();
  }
  // Sanitation-job indicator: a compact broom + sparkle badge over dirty
  // tiles with pending or active cleaning work.
  for (const job of state.jobs) {
    if (job.type !== 'sanitize') continue;
    if (job.state === 'done' || job.state === 'expired') continue;
    const inProgress = job.state === 'in_progress';
    // A working cleaner scrubs the patch one tile at a time, so the badge rides
    // the tile actually being scrubbed. A pending job has no cleaner yet and
    // stays on its anchor.
    const badgeTile = inProgress ? job.sanitationWipeTile ?? job.fromTile : job.fromTile;
    // Each finished tile gets a short sparkle burst where it was cleared, so the
    // player sees the clean area grow square by square rather than noticing a
    // block of grime is quietly gone.
    const clearAge =
      job.sanitationClearedTile !== undefined && job.sanitationClearedAt !== undefined
        ? state.now - job.sanitationClearedAt
        : Number.POSITIVE_INFINITY;
    if (
      clearAge >= 0 &&
      clearAge < SANITATION_CLEARED_SPARKLE_SEC &&
      job.sanitationClearedTile !== undefined &&
      tileInRange(job.sanitationClearedTile, state, visibleTiles)
    ) {
      const fade = 1 - clearAge / SANITATION_CLEARED_SPARKLE_SEC;
      const sx = (job.sanitationClearedTile % state.width + 0.5) * TILE_SIZE;
      const sy = (Math.floor(job.sanitationClearedTile / state.width) + 0.5) * TILE_SIZE;
      const reach = TILE_SIZE * (0.16 + 0.24 * (1 - fade));
      ctx.save();
      ctx.strokeStyle = `rgba(214, 255, 240, ${0.85 * fade})`;
      ctx.lineWidth = Math.max(1, TILE_SIZE * 0.05 * fade);
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let spoke = 0; spoke < 4; spoke++) {
        const angle = (Math.PI / 2) * spoke + Math.PI / 4;
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        ctx.moveTo(sx + dx * reach * 0.35, sy + dy * reach * 0.35);
        ctx.lineTo(sx + dx * reach, sy + dy * reach);
      }
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(sx, sy, reach * 0.42, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if (!tileInRange(badgeTile, state, visibleTiles)) continue;
    const tx = badgeTile % state.width;
    const ty = Math.floor(badgeTile / state.width);
    const cx = (tx + 0.5) * TILE_SIZE;
    const cy = (ty + 0.5) * TILE_SIZE + TILE_SIZE * 0.2;
    const r = TILE_SIZE * 0.2;
    const pulse = inProgress ? 0.62 + 0.38 * Math.sin(state.now * 5.5) : 1;
    ctx.save();
    if (inProgress) {
      // Scrubbing arc under the badge: a short back-and-forth wipe stroke on the
      // tile being worked, so a standing cleaner still reads as doing something.
      const sweep = Math.sin(state.now * 6.2) * TILE_SIZE * 0.22;
      ctx.strokeStyle = `rgba(203, 255, 236, ${0.34 + 0.26 * pulse})`;
      ctx.lineWidth = Math.max(1.2, TILE_SIZE * 0.07);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - TILE_SIZE * 0.26 + sweep, cy - TILE_SIZE * 0.34);
      ctx.lineTo(cx + TILE_SIZE * 0.1 + sweep, cy - TILE_SIZE * 0.34);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(6, 18, 20, 0.82)';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(116, 230, 190, ${0.88 * pulse})`;
    ctx.lineWidth = Math.max(1.6, TILE_SIZE * 0.055);
    ctx.stroke();
    // Handle.
    ctx.strokeStyle = `rgba(223, 248, 229, ${pulse})`;
    ctx.lineWidth = Math.max(1.5, TILE_SIZE * 0.052);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx + r * 0.38, cy - r * 0.52);
    ctx.lineTo(cx - r * 0.18, cy + r * 0.08);
    ctx.stroke();
    // Straw fan.
    ctx.fillStyle = `rgba(210, 150, 78, ${pulse})`;
    ctx.strokeStyle = `rgba(98, 65, 42, ${0.8 * pulse})`;
    ctx.lineWidth = Math.max(1, TILE_SIZE * 0.028);
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.26, cy + r * 0.0);
    ctx.lineTo(cx - r * 0.62, cy + r * 0.38);
    ctx.lineTo(cx - r * 0.18, cy + r * 0.66);
    ctx.lineTo(cx + r * 0.12, cy + r * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = `rgba(247, 210, 126, ${0.9 * pulse})`;
    ctx.lineWidth = Math.max(1, TILE_SIZE * 0.025);
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.46, cy + r * 0.34);
    ctx.lineTo(cx - r * 0.1, cy + r * 0.18);
    ctx.moveTo(cx - r * 0.34, cy + r * 0.48);
    ctx.lineTo(cx - r * 0.02, cy + r * 0.24);
    ctx.stroke();
    // Cleanup sparkle.
    ctx.strokeStyle = `rgba(203, 255, 236, ${0.75 * pulse})`;
    ctx.lineWidth = Math.max(1, TILE_SIZE * 0.025);
    ctx.beginPath();
    ctx.moveTo(cx + r * 0.48, cy + r * 0.08);
    ctx.lineTo(cx + r * 0.48, cy + r * 0.34);
    ctx.moveTo(cx + r * 0.35, cy + r * 0.21);
    ctx.lineTo(cx + r * 0.61, cy + r * 0.21);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}
