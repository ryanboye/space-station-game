export const GRID_WIDTH = 60;
export const GRID_HEIGHT = 40;
export const TILE_SIZE = 18;

export enum TileType {
  Space = 'space',
  Floor = 'floor',
  Wall = 'wall',
  Dock = 'dock',
  Cafeteria = 'cafeteria',
  Reactor = 'reactor',
  Security = 'security',
  Door = 'door'
}

export enum ZoneType {
  Public = 'public',
  Restricted = 'restricted'
}

export enum RoomType {
  None = 'none',
  Cafeteria = 'cafeteria',
  Reactor = 'reactor',
  Security = 'security',
  Dorm = 'dorm',
  Hygiene = 'hygiene',
  Hydroponics = 'hydroponics',
  LifeSupport = 'life-support'
}

export enum VisitorState {
  ToCafeteria = 'to-cafeteria',
  Queueing = 'queueing',
  Eating = 'eating',
  ToDock = 'to-dock'
}

export interface Visitor {
  id: number;
  x: number;
  y: number;
  tileIndex: number;
  state: VisitorState;
  path: number[];
  speed: number;
  patience: number;
  eatTimer: number;
  trespassed: boolean;
  servedMeal: boolean;
}

export enum ResidentState {
  Idle = 'idle',
  ToCafeteria = 'to-cafeteria',
  Eating = 'eating',
  ToDorm = 'to-dorm',
  Sleeping = 'sleeping',
  ToHygiene = 'to-hygiene',
  Cleaning = 'cleaning'
}

export interface Resident {
  id: number;
  x: number;
  y: number;
  tileIndex: number;
  path: number[];
  speed: number;
  hunger: number;
  energy: number;
  hygiene: number;
  stress: number;
  state: ResidentState;
  actionTimer: number;
  retargetAt: number;
}

export type CrewRole = 'idle' | 'reactor' | 'cafeteria' | 'security';

export interface CrewMember {
  id: number;
  x: number;
  y: number;
  tileIndex: number;
  path: number[];
  speed: number;
  role: CrewRole;
  targetTile: number | null;
  retargetAt: number;
  energy: number;
  resting: boolean;
  carryingRawFood: number;
}

export interface PendingSpawn {
  at: number;
  dockIndex: number;
}

export type ShipSize = 'small' | 'medium' | 'large';

export type ShipStage = 'approach' | 'docked' | 'depart';

export interface ArrivingShip {
  id: number;
  size: ShipSize;
  bayTiles: number[];
  bayCenterX: number;
  bayCenterY: number;
  stage: ShipStage;
  stageTime: number;
  passengersTotal: number;
  passengersSpawned: number;
  passengersBoarded: number;
  minimumBoarding: number;
  spawnCarry: number;
  dockedAt: number;
}

export interface Metrics {
  visitorsCount: number;
  residentsCount: number;
  incidentsTotal: number;
  load: number;
  capacity: number;
  loadPct: number;
  powerSupply: number;
  powerDemand: number;
  morale: number;
  rawFoodStock: number;
  mealStock: number;
  waterStock: number;
  airQuality: number;
  pressurizationPct: number;
  leakingTiles: number;
  materials: number;
  credits: number;
  rawFoodProdRate: number;
  mealPrepRate: number;
  mealUseRate: number;
  dockedShips: number;
  averageDockTime: number;
  bayUtilizationPct: number;
  exitsPerMin: number;
}

export interface RoomDiagnostic {
  room: RoomType;
  active: boolean;
  reasons: string[];
  clusterSize: number;
}

export interface CrewState {
  total: number;
  assigned: number;
  free: number;
}

export interface RoomOps {
  cafeteriasTotal: number;
  cafeteriasActive: number;
  securityTotal: number;
  securityActive: number;
  reactorsTotal: number;
  reactorsActive: number;
  dormsTotal: number;
  dormsActive: number;
  hygieneTotal: number;
  hygieneActive: number;
  hydroponicsTotal: number;
  hydroponicsActive: number;
  lifeSupportTotal: number;
  lifeSupportActive: number;
}

export interface Effects {
  cafeteriaStallUntil: number;
  brownoutUntil: number;
  securityDelayUntil: number;
  blockedUntilByTile: Map<number, number>;
}

export interface Controls {
  paused: boolean;
  simSpeed: 1 | 2 | 4;
  shipsPerCycle: number;
  showZones: boolean;
  taxRate: number;
  crewPriority: 'balanced' | 'cafeteria' | 'hydroponics' | 'security' | 'life-support' | 'reactor';
}

export interface StationState {
  width: number;
  height: number;
  tiles: TileType[];
  zones: ZoneType[];
  rooms: RoomType[];
  pressurized: boolean[];
  visitors: Visitor[];
  residents: Resident[];
  crewMembers: CrewMember[];
  arrivingShips: ArrivingShip[];
  pendingSpawns: PendingSpawn[];
  metrics: Metrics;
  controls: Controls;
  effects: Effects;
  rng: () => number;
  now: number;
  lastCycleTime: number;
  cycleDuration: number;
  spawnCounter: number;
  shipSpawnCounter: number;
  crewSpawnCounter: number;
  residentSpawnCounter: number;
  incidentHeat: number;
  lastPayrollAt: number;
  recentExitTimes: number[];
  dockedTimeTotal: number;
  dockedShipsCompleted: number;
  crew: CrewState;
  ops: RoomOps;
}

export interface BuildTool {
  kind: 'tile' | 'zone' | 'room';
  tile?: TileType;
  zone?: ZoneType;
  room?: RoomType;
}

export const WALKABLE_TILES = new Set<TileType>([
  TileType.Floor,
  TileType.Dock,
  TileType.Cafeteria,
  TileType.Reactor,
  TileType.Security,
  TileType.Door
]);

export function toIndex(x: number, y: number, width: number): number {
  return y * width + x;
}

export function inBounds(x: number, y: number, width: number, height: number): boolean {
  return x >= 0 && y >= 0 && x < width && y < height;
}

export function fromIndex(index: number, width: number): { x: number; y: number } {
  return { x: index % width, y: Math.floor(index / width) };
}

export function isWalkable(tile: TileType): boolean {
  return WALKABLE_TILES.has(tile);
}

export function makeRng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
