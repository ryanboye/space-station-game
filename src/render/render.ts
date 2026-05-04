import {
  ModuleType,
  RoomType,
  TILE_SIZE,
  TileType,
  type DiagnosticOverlay,
  type LifeSupportCoverageDiagnostic,
  type RoutePressureDiagnostics,
  type ShipSize,
  type ShipType,
  type SpaceLane,
  VisitorState,
  ZoneType,
  inBounds,
  fromIndex,
  toIndex,
  isWalkable,
  type ItemType,
  type BuildTool,
  type StationState
} from '../sim/types';
import { MODULE_DEFINITIONS } from '../sim/balance';
import {
  collectActiveRoomTiles,
  collectQueueTargets,
  collectServiceNodeReachability,
  getDockByTile,
  getLifeSupportCoverageDiagnostics,
  getLifeSupportTileDiagnostic,
  getSanitationTileDiagnostic,
  mapConditionSamplesAt,
  getMaintenanceTileDiagnostic,
  getRoutePressureDiagnostics,
  getRoutePressureTileDiagnostic,
  getRoomEnvironmentTileDiagnostic,
  resolveWallLightFacing,
  wallMountedModuleServiceTile,
  validateBerthModulePlacement,
  validateDockPlacement
} from '../sim/sim';
import {
  DOOR_SPRITE_VARIANT_KEYS,
  MODULE_SPRITE_KEYS,
  ROOM_SPRITE_KEYS,
  SHIP_SPRITE_KEYS,
  TILE_SPRITE_KEYS,
  WALL_SPRITE_VARIANT_KEYS
} from './sprite-keys';
import type { SpriteAtlas, SpriteFrame } from './sprite-atlas';
import {
  AGENT_EVA_SUIT_SPRITE_KEY,
  AGENT_SPRITE_VARIANTS,
  DOCK_OVERLAY_SPRITE_KEYS,
  DOCK_FACADE_ROTATION,
  FLOOR_GRIME_SPRITE_KEYS,
  FLOOR_WEAR_SPRITE_KEYS,
  STAFF_ROLE_SPRITE_KEYS
} from './sprite-keys-extended';
import { resolveDoorVariantForTile, resolveWallVariantForTile } from './tile-variants';
import { renderDualWallLayer } from './wall-dual-tilemap';
import { renderWallDetailLayer } from './wall-detail-layer';
import { renderRoomLabelLayer } from './room-label-layer';
import { renderDoorDockDetailLayer } from './door-dock-detail-layer';
import { renderGlowPass, type GlowRenderViewport } from './glow-pass';

const PX = TILE_SIZE / 18;  // pixel scale factor relative to original 18px tile size

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
  // Berth: cool steel-blue tint, distinct from Dorm's warmer blue and
  // the cyan dock-tile color. v0 placeholder; revisit when atlas
  // Berth floor sprite lands.
  [RoomType.Berth]: 'rgba(120, 170, 220, 0.22)',
  [RoomType.Cantina]: 'rgba(229, 138, 207, 0.24)',
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
  [RoomType.Berth]: 'E',
  [RoomType.Cantina]: 'X',
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
  [ModuleType.Table]: 'T',
  [ModuleType.ServingStation]: 'S',
  [ModuleType.Stove]: 'V',
  [ModuleType.Workbench]: 'W',
  [ModuleType.MedBed]: '+',
  [ModuleType.CellConsole]: 'G',
  [ModuleType.RecUnit]: 'A',
  [ModuleType.GrowStation]: 'G',
  [ModuleType.Terminal]: 'M',
  [ModuleType.Couch]: 'C',
  [ModuleType.GameStation]: 'J',
  [ModuleType.Shower]: 'H',
  [ModuleType.Sink]: 'I',
  [ModuleType.MarketStall]: '$',
  [ModuleType.IntakePallet]: 'P',
  [ModuleType.StorageRack]: 'R',
  // Dock-migration v0: capability-module letters for vector fallback.
  // No atlas sprites — fallback path is the only render route.
  [ModuleType.Gangway]: 'g',
  [ModuleType.CustomsCounter]: 'c',
  [ModuleType.CargoArm]: 'X',
  [ModuleType.FireExtinguisher]: 'F',
  [ModuleType.Vent]: 'V',
  [ModuleType.VendingMachine]: '$',
  [ModuleType.Bench]: 'B',
  [ModuleType.BarCounter]: 'r',
  [ModuleType.Tap]: 't',
  [ModuleType.Telescope]: 'O',
  [ModuleType.WaterFountain]: '~',
  [ModuleType.Plant]: '*'
};

const ITEM_TYPES: ItemType[] = ['rawMeal', 'meal', 'rawMaterial', 'tradeGood', 'body'];
const itemFillColor: Record<ItemType | 'none', string> = {
  rawMeal: 'rgba(118, 218, 132, 0.55)',
  meal: 'rgba(255, 216, 120, 0.58)',
  rawMaterial: 'rgba(214, 183, 132, 0.55)',
  tradeGood: 'rgba(128, 188, 255, 0.58)',
  body: 'rgba(227, 110, 110, 0.6)',
  none: 'rgba(151, 170, 192, 0.42)'
};
const itemShortCode: Record<ItemType, string> = {
  rawMeal: 'RM',
  meal: 'ME',
  rawMaterial: 'MAT',
  tradeGood: 'TG',
  body: 'BD'
};
const RESIDENT_MARK_COLOR = '#35d98a';
const SHIP_TRANSIT_VISUAL_SEC = 2;
const SHIP_ASSET_VERSION = 'generated-ship-sheet-2026-05-02';
const SERVICE_OVERLAY_CACHE_TTL_SEC = 0.2;

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
  if (dirt >= 25) {
    const hash = hashWeatherSeed(tileIndex, state.rooms[tileIndex], state.topologyVersion);
    return FLOOR_GRIME_SPRITE_KEYS[(hash >>> (dirt >= 70 ? 2 : 4)) % FLOOR_GRIME_SPRITE_KEYS.length] ?? null;
  }
  const roomType = state.rooms[tileIndex];
  if (suppressFloorWeather(roomType)) return null;
  const hash = hashWeatherSeed(tileIndex, roomType, state.topologyVersion);
  const roll = hash % 100;
  const bias = roomWeatherBias(roomType);
  const noOverlayThreshold = Math.max(15, 45 - bias);
  const wearThreshold = Math.min(95, 85 + Math.round(bias * 0.6));
  if (roll < noOverlayThreshold) return null;
  if (roll >= wearThreshold) {
    return FLOOR_WEAR_SPRITE_KEYS[(hash >>> 8) % FLOOR_WEAR_SPRITE_KEYS.length] ?? null;
  }
  return FLOOR_GRIME_SPRITE_KEYS[(hash >>> 4) % FLOOR_GRIME_SPRITE_KEYS.length] ?? null;
}

function sanitationRenderSignature(state: StationState): string {
  let dirty = 0;
  let filthy = 0;
  let maxBucket = 0;
  for (let i = 0; i < state.dirtByTile.length; i++) {
    const bucket = Math.floor((state.dirtByTile[i] ?? 0) / 10);
    if (bucket > 0) dirty += 1;
    if (bucket >= 7) filthy += 1;
    if (bucket > maxBucket) maxBucket = bucket;
  }
  return `${dirty}:${filthy}:${maxBucket}`;
}

function drawBerthModuleVisual(ctx: CanvasRenderingContext2D, module: StationState['moduleInstances'][number], px: number, py: number, w: number, h: number): boolean {
  if (module.type !== ModuleType.Gangway && module.type !== ModuleType.CustomsCounter && module.type !== ModuleType.CargoArm) {
    return false;
  }
  ctx.save();
  ctx.fillStyle = 'rgba(7, 11, 18, 0.82)';
  ctx.strokeStyle = 'rgba(188, 218, 240, 0.72)';
  ctx.lineWidth = Math.max(1, Math.round(PX));
  ctx.fillRect(px + Math.round(2 * PX), py + Math.round(2 * PX), w - Math.round(4 * PX), h - Math.round(4 * PX));
  ctx.strokeRect(px + Math.round(2.5 * PX), py + Math.round(2.5 * PX), w - Math.round(5 * PX), h - Math.round(5 * PX));

  if (module.type === ModuleType.Gangway) {
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
    const moduleKey = MODULE_SPRITE_KEYS[module.type];
    let rotation = module.rotation === 90 ? 90 : 0;
    if (module.type === ModuleType.WallLight) {
      const drawX = px - TILE_SIZE * 0.5;
      const drawY = py;
      if (drawSpriteByKey(ctx, spriteAtlas, moduleKey, drawX, drawY, TILE_SIZE * 2, TILE_SIZE, 0)) {
        return;
      }
    }
    const drawW = rotation === 90 ? h : w;
    const drawH = rotation === 90 ? w : h;
    const drawX = px + (w - drawW) * 0.5;
    const drawY = py + (h - drawH) * 0.5;
    if (drawSpriteByKey(ctx, spriteAtlas, moduleKey, drawX, drawY, drawW, drawH, rotation)) {
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
type ShipSpriteKind = 'pod' | 'berth';

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

function projectShipSpriteImage(kind: ShipSpriteKind, shipType: ShipType): HTMLImageElement | null {
  const key = `${kind}:${shipType}`;
  let image = shipImageCache.get(key);
  if (!image) {
    image = new Image();
    image.src = `assets/ships/ship-${kind}-${shipType}.png?v=${SHIP_ASSET_VERSION}`;
    shipImageCache.set(key, image);
  }
  return image.complete && image.naturalWidth > 0 && image.naturalHeight > 0 ? image : null;
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
  const sprite = projectShipSpriteImage('pod', ship.shipType);
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
  const bayRect = {
    x: bounds.minX * TILE_SIZE,
    y: bounds.minY * TILE_SIZE,
    w: (bounds.maxX - bounds.minX + 1) * TILE_SIZE,
    h: (bounds.maxY - bounds.minY + 1) * TILE_SIZE
  };
  const palette = shipPalette(ship.shipType, ship.stage === 'docked');
  const sprite = projectShipSpriteImage('berth', ship.shipType);
  const transit = shipTransitOffset(ship);
  const inset = Math.max(2, TILE_SIZE * 0.08);
  const targetW = Math.max(TILE_SIZE, bayRect.w - inset * 2);
  const targetH = Math.max(TILE_SIZE, bayRect.h - inset * 2);
  const bayIsWide = targetW > targetH * 1.18;
  const angle = bayIsWide ? Math.PI * 0.5 : 0;
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
  const visualLane = pickBerthVisualLane(state, ship);
  const outward = laneUnitVector(visualLane);
  const center = {
    x: bayRect.x + bayRect.w * 0.5 + outward.x * transit * TILE_SIZE * 1.6,
    y: bayRect.y + bayRect.h * 0.5 + outward.y * transit * TILE_SIZE * 1.6
  };

  ctx.save();
  ctx.beginPath();
  ctx.rect(bayRect.x + inset * 0.4, bayRect.y + inset * 0.4, bayRect.w - inset * 0.8, bayRect.h - inset * 0.8);
  ctx.clip();
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
    const drewTileSprite = useSprites && drawTileSprite(state, i, tileType, ctx, spriteAtlas, px, py);
    if (!drewTileSprite) {
      ctx.fillStyle = tileColor[tileType];
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
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
    if (i === state.core.serviceTile) {
      ctx.fillStyle = 'rgba(255, 221, 87, 0.45)';
      ctx.fillRect(px + Math.round(2 * PX), py + Math.round(2 * PX), TILE_SIZE - Math.round(4 * PX), TILE_SIZE - Math.round(4 * PX));
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
    if (!drewTileSprite) {
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

function ensureDecorativeLayer(
  state: StationState,
  widthPx: number,
  heightPx: number,
  spriteAtlas: SpriteAtlas,
  useSprites: boolean
): CachedLayer {
  decorativeLayerCache = ensureCachedLayer(decorativeLayerCache, widthPx, heightPx);
  const layer = decorativeLayerCache;
  const key = [
    state.width,
    state.height,
    state.topologyVersion,
    state.roomVersion,
    state.moduleVersion,
    state.dockVersion,
    sanitationRenderSignature(state),
    useSprites ? 1 : 0,
    spriteAtlas.version
  ].join('|');
  if (layer.key === key) return layer;
  layer.key = key;
  const ctx = layer.ctx;
  ctx.clearRect(0, 0, widthPx, heightPx);

  if (useSprites) {
    for (let i = 0; i < state.tiles.length; i++) {
      const overlayKey = pickFloorOverlayKey(state, i);
      if (!overlayKey) continue;
      const { x, y } = fromIndex(i, state.width);
      drawSpriteByKey(ctx, spriteAtlas, overlayKey, x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
  }

  for (const module of state.moduleInstances) {
    drawModuleVisual(ctx, state, module, spriteAtlas, useSprites);
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

function previewFootprint(module: ModuleType, rotation: 0 | 90): { width: number; height: number } {
  const def = MODULE_DEFINITIONS[module] ?? MODULE_DEFINITIONS[ModuleType.None];
  if (rotation === 90 && def.rotatable) return { width: def.height, height: def.width };
  return { width: def.width, height: def.height };
}

function previewTiles(
  state: StationState,
  originTile: number,
  width: number,
  height: number
): number[] | null {
  const { x, y } = fromIndex(originTile, state.width);
  const out: number[] = [];
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      const tx = x + dx;
      const ty = y + dy;
      if (!inBounds(tx, ty, state.width, state.height)) return null;
      out.push(ty * state.width + tx);
    }
  }
  return out;
}

function validateModulePreviewPlacement(
  state: StationState,
  moduleType: ModuleType,
  originTile: number,
  rotation: 0 | 90
): { valid: boolean; tiles: number[] } {
  if (moduleType === ModuleType.None) return { valid: true, tiles: [originTile] };
  const def = MODULE_DEFINITIONS[moduleType];
  if (!def) return { valid: false, tiles: [originTile] };
  const footprint = previewFootprint(moduleType, rotation);
  const tiles = previewTiles(state, originTile, footprint.width, footprint.height);
  if (!tiles) return { valid: false, tiles: [originTile] };
  const requiresWallMount = def.mount === 'wall';
  const serviceTile = requiresWallMount ? wallMountedModuleServiceTile(state, originTile) : originTile;
  if (requiresWallMount && serviceTile === null) return { valid: false, tiles };
  const roomAtOrigin = state.rooms[serviceTile ?? originTile];
  for (const tile of tiles) {
    if (requiresWallMount) {
      if (state.tiles[tile] !== TileType.Wall) return { valid: false, tiles };
    } else if (!isWalkable(state.tiles[tile])) {
      return { valid: false, tiles };
    }
    if (state.moduleOccupancyByTile[tile] !== null) return { valid: false, tiles };
    const roomForTile = requiresWallMount ? roomAtOrigin : state.rooms[tile];
    if (def.allowedRooms && !def.allowedRooms.includes(roomForTile)) return { valid: false, tiles };
    if (!requiresWallMount && def.allowedRooms && state.rooms[tile] !== roomAtOrigin) return { valid: false, tiles };
  }
  if (validateBerthModulePlacement(state, moduleType, tiles)) return { valid: false, tiles };
  if (requiresWallMount && !resolveWallLightFacing(state, originTile)) {
    return { valid: false, tiles };
  }
  return { valid: true, tiles };
}

function agentOffset(id: number): { x: number; y: number } {
  const ox = ((id * 17) % 7) - 3;
  const oy = ((id * 29) % 7) - 3;
  return { x: ox * 0.08, y: oy * 0.08 };
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

function diagnosticOverlayCacheKey(state: StationState, overlay: DiagnosticOverlay): string {
  const debtKey = state.maintenanceDebts
    .map((debt) => `${debt.key}:${Math.round(debt.debt)}`)
    .sort()
    .join(',');
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
    mapKey
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
  if (!diagnostic) return null;
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

function drawDiagnosticOverlayLayer(
  ctx: CanvasRenderingContext2D,
  state: StationState,
  overlay: DiagnosticOverlay
): void {
  if (overlay === 'none') return;
  const lifeSupportCoverage = overlay === 'life-support' ? getLifeSupportCoverageDiagnostics(state) : null;
  const routePressureDiagnostics = overlay === 'route-pressure' ? getRoutePressureDiagnostics(state) : null;
  for (let i = 0; i < state.tiles.length; i++) {
    let color: string | null = null;
    if (overlay === 'life-support') {
      if (!lifeSupportCoverage) continue;
      color = lifeSupportDiagnosticColor(state, i, lifeSupportCoverage);
    } else if (overlay === 'map-conditions') {
      color = mapConditionsDiagnosticColor(state, i);
    } else if (overlay === 'sanitation') {
      color = sanitationDiagnosticColor(state, i);
    } else if (overlay === 'maintenance') {
      color = maintenanceDiagnosticColor(state, i);
    } else if (overlay === 'route-pressure') {
      if (!routePressureDiagnostics) continue;
      color = routePressureDiagnosticColor(state, i, routePressureDiagnostics);
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
  heightPx: number
): CachedLayer | null {
  const overlay = state.controls.diagnosticOverlay;
  if (overlay === 'none') {
    if (diagnosticOverlayCache) diagnosticOverlayCache.key = '';
    return null;
  }
  diagnosticOverlayCache = ensureCachedLayer(diagnosticOverlayCache, widthPx, heightPx);
  const layer = diagnosticOverlayCache;
  const key = diagnosticOverlayCacheKey(state, overlay);
  if (layer.key === key) return layer;
  layer.key = key;
  layer.ctx.clearRect(0, 0, widthPx, heightPx);
  drawDiagnosticOverlayLayer(layer.ctx, state, overlay);
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
        scale: 'green healthy | red output loss',
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
  if (overlay === 'maintenance') {
    const diagnostic = getMaintenanceTileDiagnostic(state, pos.x, pos.y);
    if (!diagnostic) return `hover ${pos.x},${pos.y}: no reactor/life-support maintenance debt`;
    return `hover ${pos.x},${pos.y}: ${diagnostic.system} debt ${diagnostic.debt.toFixed(0)}% | output ${(diagnostic.outputMultiplier * 100).toFixed(0)}%`;
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
  if (overlay === 'route-pressure') {
    const diagnostic = getRoutePressureTileDiagnostic(state, pos.x, pos.y);
    if (!diagnostic) return `hover ${pos.x},${pos.y}: no active planned routes`;
    return `hover ${pos.x},${pos.y}: total ${diagnostic.totalCount} | V${diagnostic.visitorCount} R${diagnostic.residentCount} C${diagnostic.crewCount} L${diagnostic.logisticsCount} | conflicts ${diagnostic.conflictScore}`;
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

function drawQueuedShips(ctx: CanvasRenderingContext2D, state: StationState, spriteAtlas: SpriteAtlas, useSprites: boolean): void {
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
    if (useSprites) {
      const shipKey = SHIP_SPRITE_KEYS[queued.shipType];
      const drewSprite = drawSpriteByKey(ctx, spriteAtlas, shipKey, cx - chipW * 0.5, cy - chipH * 0.5, chipW, chipH);
      if (drewSprite) continue;
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

function drawIncidentMarkers(
  ctx: CanvasRenderingContext2D,
  state: StationState,
  visibleTiles: { minX: number; maxX: number; minY: number; maxY: number }
): void {
  for (const incident of state.incidents) {
    if (incident.stage === 'resolved' || incident.stage === 'failed') continue;
    if (!tileInRange(incident.tileIndex, state, visibleTiles)) continue;
    const p = fromIndex(incident.tileIndex, state.width);
    const cx = (p.x + 0.5) * TILE_SIZE;
    const cy = (p.y + 0.5) * TILE_SIZE;
    const pulse = (Math.sin(state.now * 6 + incident.id) + 1) * 0.5;
    const urgency = incident.stage === 'dispatching' || incident.assignedCrewId === null ? 1 : 0.65;
    const color = incident.type === 'fight' ? '#ff3f46' : '#ff9d3a';
    const alpha = 0.34 + pulse * 0.2;
    const ringRadius = TILE_SIZE * (0.58 + pulse * 0.22 + incident.severity * 0.04);

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = incident.type === 'fight' ? `rgba(255, 63, 70, ${alpha * 0.45})` : `rgba(255, 157, 58, ${alpha * 0.42})`;
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

    const label = `${incident.type === 'fight' ? 'FIGHT' : 'TRESPASS'} #${incident.id}`;
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

export function renderWorld(
  ctx: CanvasRenderingContext2D,
  state: StationState,
  currentTool: BuildTool,
  hoveredTile: number | null = null,
  spriteAtlas: SpriteAtlas,
  viewportInput: RenderViewport | null = null
): void {
  const widthPx = state.width * TILE_SIZE;
  const heightPx = state.height * TILE_SIZE;
  const useSprites = spritesEnabled(state, spriteAtlas);
  const viewport = normalizeViewport(viewportInput, widthPx, heightPx);
  const visibleTiles = tileRangeForViewport(viewport, state);

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
  const staticLayer = ensureStaticLayer(state, widthPx, heightPx, spriteAtlas, useSprites);
  const decorativeLayer = ensureDecorativeLayer(state, widthPx, heightPx, spriteAtlas, useSprites);
  drawCachedLayer(ctx, staticLayer.canvas, viewport);
  drawCachedLayer(ctx, decorativeLayer.canvas, viewport);
  // Glow pass paints after the sprite layers (additive blend). Gated on
  // state.controls.showGlow; cache key includes dynamic signatures (med-bed
  // occupancy, kitchen-active) so frame cost is ~0 when nothing changes.
  renderGlowPass(ctx, state, widthPx, heightPx, useSprites, viewport);
  const diagnosticLayer = ensureDiagnosticOverlayLayer(state, widthPx, heightPx);
  if (diagnosticLayer) drawCachedLayer(ctx, diagnosticLayer.canvas, viewport);

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

  for (const site of state.constructionSites) {
    if (!tileInRange(site.tileIndex, state, visibleTiles)) continue;
    const p = fromIndex(site.tileIndex, state.width);
    const px = p.x * TILE_SIZE;
    const py = p.y * TILE_SIZE;
    const delivered = site.requiredMaterials > 0 ? site.deliveredMaterials / site.requiredMaterials : 1;
    const built = site.buildWorkRequired > 0 ? site.buildProgress / site.buildWorkRequired : 0;
    const progress = Math.max(0, Math.min(1, site.state === 'building' ? built : delivered));
    ctx.fillStyle = site.requiresEva ? 'rgba(111, 216, 255, 0.28)' : 'rgba(255, 207, 110, 0.24)';
    ctx.fillRect(px + Math.round(2 * PX), py + Math.round(2 * PX), TILE_SIZE - Math.round(4 * PX), TILE_SIZE - Math.round(4 * PX));
    ctx.strokeStyle = site.state === 'blocked' ? '#ff7676' : site.requiresEva ? '#6fd8ff' : '#ffcf6e';
    ctx.setLineDash([Math.round(4 * PX), Math.round(3 * PX)]);
    ctx.strokeRect(px + Math.round(2.5 * PX), py + Math.round(2.5 * PX), TILE_SIZE - Math.round(5 * PX), TILE_SIZE - Math.round(5 * PX));
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(7, 12, 18, 0.86)';
    ctx.fillRect(px + Math.round(4 * PX), py + TILE_SIZE - Math.round(8 * PX), TILE_SIZE - Math.round(8 * PX), Math.round(4 * PX));
    ctx.fillStyle = site.state === 'blocked' ? '#ff7676' : '#6edb8f';
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
    ctx.fillText(site.requiresEva ? 'EVA' : site.kind === 'module' ? 'MOD' : 'BLD', px + TILE_SIZE * 0.5, py + TILE_SIZE * 0.45);
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

  if (currentTool.kind === 'module' && hoveredTile !== null && currentTool.module) {
    const preview = validateModulePreviewPlacement(
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
  }

  drawPasteStampGhost(ctx, state, currentTool, hoveredTile, visibleTiles);
  drawIncidentMarkers(ctx, state, visibleTiles);

  const actorInVisibleRange = (x: number, y: number, marginTiles = 2): boolean =>
    x >= visibleTiles.minX - marginTiles &&
    x <= visibleTiles.maxX + marginTiles &&
    y >= visibleTiles.minY - marginTiles &&
    y <= visibleTiles.maxY + marginTiles;

  for (let vi = 0; vi < state.visitors.length; vi++) {
    const v = state.visitors[vi];
    if (!actorInVisibleRange(v.x, v.y)) continue;
    const o = agentOffset(v.id);
    const cx = (v.x + o.x) * TILE_SIZE;
    const cy = (v.y + o.y) * TILE_SIZE;
    const tint = visitorMoodColor(state, vi);
    const spriteKey = pickAgentVariant(AGENT_SPRITE_VARIANTS.visitor, v.id);
    if (useSprites && drawTintedAgentSprite(
      ctx, spriteAtlas, spriteKey, cx, cy,
      TILE_SIZE * AGENT_SPRITE_SCALE, tint, 0.35
    )) continue;
    ctx.fillStyle = tint;
    ctx.beginPath();
    ctx.arc(cx, cy, TILE_SIZE * 0.22, 0, Math.PI * 2);
    ctx.fill();
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
    if (useSprites && drawTintedAgentSprite(
      ctx, spriteAtlas, spriteKey, cx, cy,
      TILE_SIZE * AGENT_SPRITE_SCALE, residentFill, tintAlpha
    )) {
      // Draw green ring around sprite
      const ringRadius = TILE_SIZE * AGENT_SPRITE_SCALE * 0.5;
      ctx.beginPath();
      ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
      ctx.strokeStyle = RESIDENT_MARK_COLOR;
      ctx.lineWidth = Math.max(1, TILE_SIZE * 0.055);
      ctx.stroke();
      continue;
    }
    ctx.beginPath();
    ctx.fillStyle = residentFill;
    ctx.arc(cx, cy, TILE_SIZE * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = RESIDENT_MARK_COLOR;
    ctx.lineWidth = Math.max(1, TILE_SIZE * 0.055);
    ctx.stroke();
  }

  for (const c of state.crewMembers) {
    if (!actorInVisibleRange(c.x, c.y)) continue;
    const o = agentOffset(c.id);
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
        continue;
      }
      drawEvaSuitAgentFallback(ctx, cx, cy, TILE_SIZE * AGENT_SPRITE_SCALE);
      continue;
    }
    if (useSprites && drawTintedAgentSprite(
      ctx, spriteAtlas, spriteKey, cx, cy,
      TILE_SIZE * AGENT_SPRITE_SCALE, crewTint, crewTintAlpha
    )) continue;
    ctx.fillStyle = crewTint;
    ctx.beginPath();
    ctx.arc(cx, cy, TILE_SIZE * 0.18, 0, Math.PI * 2);
    ctx.fill();
    if (c.evaSuit) {
      ctx.strokeStyle = '#6fd8ff';
      ctx.lineWidth = Math.max(1, TILE_SIZE * 0.055);
      ctx.stroke();
    }
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
    const palette = shipPalette(ship.shipType, ship.stage === 'docked');
    drawShipSilhouetteCells(ctx, silhouette, posX, posY, cellSize, palette, 2);
  }

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
          : currentTool.kind === 'module'
            ? `Tool: Module ${currentTool.module} (${state.controls.moduleRotation}deg)`
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
    if (!tileInRange(job.fromTile, state, visibleTiles)) continue;
    const tx = job.fromTile % state.width;
    const ty = Math.floor(job.fromTile / state.width);
    const cx = (tx + 0.5) * TILE_SIZE;
    const cy = (ty + 0.5) * TILE_SIZE + TILE_SIZE * 0.2;
    const r = TILE_SIZE * 0.2;
    const inProgress = job.state === 'in_progress';
    const pulse = inProgress ? 0.62 + 0.38 * Math.sin(state.now * 5.5) : 1;
    ctx.save();
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
