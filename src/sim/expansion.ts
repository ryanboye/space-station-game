// expansion.ts — extracted from sim.ts.
//
// Owns the map-expansion API: cost tiers, direction-availability,
// and the destructive remap that grows the grid in a chosen direction.
// Public surface is re-exported from sim.ts so consumers (main.ts,
// save.ts, scenarios.ts, sim-tests.ts) keep working unchanged.

import {
  EXPANSION_COST_TIERS,
  EXPANSION_STEP_TILES,
  bumpTopologyVersion,
  maintenanceKey,
  rebuildDockEntities
} from './sim';
import {
  type CardinalDirection,
  type HousingPolicy,
  ModuleType,
  RoomType,
  type StationState,
  TileType,
  ZoneType,
  fromIndex,
  toIndex
} from './types';

export type ExpandMapFailureReason =
  | 'already_expanded_direction'
  | 'insufficient_credits';

export type ExpandMapResult =
  | { ok: true; direction: CardinalDirection; cost: number; width: number; height: number }
  | { ok: false; direction: CardinalDirection; cost: number; reason: ExpandMapFailureReason };

export function getNextExpansionCost(state: StationState): number {
  const tier = Math.min(state.mapExpansion.purchasesMade, EXPANSION_COST_TIERS.length - 1);
  return EXPANSION_COST_TIERS[tier];
}

export function canExpandDirection(state: StationState, direction: CardinalDirection): boolean {
  return !state.mapExpansion.purchased[direction];
}

export function expandMap(state: StationState, direction: CardinalDirection): ExpandMapResult {
  const cost = getNextExpansionCost(state);
  if (!canExpandDirection(state, direction)) {
    return { ok: false, direction, cost, reason: 'already_expanded_direction' };
  }
  if (state.metrics.credits < cost) {
    return { ok: false, direction, cost, reason: 'insufficient_credits' };
  }

  const oldWidth = state.width;
  const oldHeight = state.height;
  const shiftX = direction === 'west' ? EXPANSION_STEP_TILES : 0;
  const shiftY = direction === 'north' ? EXPANSION_STEP_TILES : 0;
  const newWidth = oldWidth + (direction === 'west' || direction === 'east' ? EXPANSION_STEP_TILES : 0);
  const newHeight = oldHeight + (direction === 'north' || direction === 'south' ? EXPANSION_STEP_TILES : 0);

  const remapIndex = (index: number): number => {
    const p = fromIndex(index, oldWidth);
    return toIndex(p.x + shiftX, p.y + shiftY, newWidth);
  };
  const remapOptionalIndex = (index: number | null): number | null => (index === null ? null : remapIndex(index));
  const remapIndexMap = (source: Map<number, number>): Map<number, number> => {
    const out = new Map<number, number>();
    for (const [idx, value] of source.entries()) {
      out.set(remapIndex(idx), value);
    }
    return out;
  };

  const tiles = new Array<TileType>(newWidth * newHeight).fill(TileType.Space);
  const zones = new Array<ZoneType>(newWidth * newHeight).fill(ZoneType.Public);
  const rooms = new Array<RoomType>(newWidth * newHeight).fill(RoomType.None);
  const roomHousingPolicies = new Array<HousingPolicy>(newWidth * newHeight).fill('visitor');
  const modules = new Array<ModuleType>(newWidth * newHeight).fill(ModuleType.None);
  const moduleOccupancyByTile = new Array<number | null>(newWidth * newHeight).fill(null);
  const pressurized = new Array<boolean>(newWidth * newHeight).fill(false);
  const airQualityByTile = new Float32Array(newWidth * newHeight).fill(100);
  const dirtByTile = new Float32Array(newWidth * newHeight);
  const dirtSourceByTile = new Uint8Array(newWidth * newHeight);

  for (let y = 0; y < oldHeight; y++) {
    for (let x = 0; x < oldWidth; x++) {
      const oldIndex = toIndex(x, y, oldWidth);
      const newIndex = toIndex(x + shiftX, y + shiftY, newWidth);
      tiles[newIndex] = state.tiles[oldIndex];
      zones[newIndex] = state.zones[oldIndex];
      rooms[newIndex] = state.rooms[oldIndex];
      roomHousingPolicies[newIndex] = state.roomHousingPolicies[oldIndex];
      modules[newIndex] = state.modules[oldIndex];
      moduleOccupancyByTile[newIndex] = state.moduleOccupancyByTile[oldIndex];
      pressurized[newIndex] = state.pressurized[oldIndex];
      airQualityByTile[newIndex] = state.airQualityByTile[oldIndex];
      dirtByTile[newIndex] = state.dirtByTile[oldIndex];
      dirtSourceByTile[newIndex] = state.dirtSourceByTile[oldIndex];
    }
  }

  state.metrics.credits -= cost;
  state.width = newWidth;
  state.height = newHeight;
  state.tiles = tiles;
  state.zones = zones;
  state.rooms = rooms;
  state.roomHousingPolicies = roomHousingPolicies;
  state.modules = modules;
  state.moduleOccupancyByTile = moduleOccupancyByTile;
  state.pressurized = pressurized;
  state.airQualityByTile = airQualityByTile;
  state.dirtByTile = dirtByTile;
  state.dirtSourceByTile = dirtSourceByTile;

  state.core.centerTile = remapIndex(state.core.centerTile);
  state.core.serviceTile = remapIndex(state.core.serviceTile);
  state.core.frameTiles = state.core.frameTiles.map(remapIndex);

  state.moduleInstances = state.moduleInstances.map((module) => ({
    ...module,
    originTile: remapIndex(module.originTile),
    tiles: module.tiles.map(remapIndex)
  }));
  state.docks = state.docks.map((dock) => ({
    ...dock,
    tiles: dock.tiles.map(remapIndex),
    anchorTile: remapIndex(dock.anchorTile),
    approachTiles: dock.approachTiles.map(remapIndex)
  }));
  state.itemNodes = state.itemNodes.map((node) => ({
    ...node,
    tileIndex: remapIndex(node.tileIndex)
  }));
  state.jobs = state.jobs.map((job) => ({
    ...job,
    fromTile: remapIndex(job.fromTile),
    toTile: remapIndex(job.toTile)
  }));
  state.reservations = state.reservations.map((reservation) => ({
    ...reservation,
    targetTile: remapOptionalIndex(reservation.targetTile)
  }));
  state.constructionSites = state.constructionSites.map((site) => ({
    ...site,
    tileIndex: remapIndex(site.tileIndex)
  }));
  state.incidents = state.incidents.map((incident) => ({
    ...incident,
    tileIndex: remapIndex(incident.tileIndex)
  }));
  state.visitors = state.visitors.map((visitor) => ({
    ...visitor,
    x: visitor.x + shiftX,
    y: visitor.y + shiftY,
    tileIndex: remapIndex(visitor.tileIndex),
    path: visitor.path.map(remapIndex),
    reservedServingTile: remapOptionalIndex(visitor.reservedServingTile),
    reservedTargetTile: remapOptionalIndex(visitor.reservedTargetTile)
  }));
  state.residents = state.residents.map((resident) => ({
    ...resident,
    x: resident.x + shiftX,
    y: resident.y + shiftY,
    tileIndex: remapIndex(resident.tileIndex),
    path: resident.path.map(remapIndex),
    reservedTargetTile: remapOptionalIndex(resident.reservedTargetTile)
  }));
  state.crewMembers = state.crewMembers.map((crew) => ({
    ...crew,
    x: crew.x + shiftX,
    y: crew.y + shiftY,
    tileIndex: remapIndex(crew.tileIndex),
    path: crew.path.map(remapIndex),
    targetTile: remapOptionalIndex(crew.targetTile)
  }));
  state.maintenanceDebts = state.maintenanceDebts.map((debt) => {
    const anchorTile = remapIndex(debt.anchorTile);
    const targetTile = debt.targetTile !== undefined ? remapIndex(debt.targetTile) : anchorTile;
    const domain = debt.domain ?? (debt.system ? 'utility' : 'module');
    const key =
      domain === 'utility' && debt.system
        ? maintenanceKey(debt.system, anchorTile)
        : debt.moduleId !== undefined
          ? `${domain}:module:${debt.moduleId}`
          : `${domain}:${anchorTile}`;
    return {
      ...debt,
      anchorTile,
      targetTile,
      domain,
      key
    };
  });
  state.arrivingShips = state.arrivingShips.map((ship) => ({
    ...ship,
    bayTiles: ship.bayTiles.map(remapIndex),
    bayCenterX: ship.bayCenterX + shiftX,
    bayCenterY: ship.bayCenterY + shiftY
  }));
  state.pendingSpawns = state.pendingSpawns.map((spawn) => ({
    ...spawn,
    dockIndex: remapIndex(spawn.dockIndex)
  }));
  state.bodyTiles = state.bodyTiles.map(remapIndex);
  state.pathOccupancyByTile = remapIndexMap(state.pathOccupancyByTile);
  state.effects.blockedUntilByTile = remapIndexMap(state.effects.blockedUntilByTile);
  state.effects.trespassCooldownUntilByTile = remapIndexMap(state.effects.trespassCooldownUntilByTile);
  state.effects.securityAuraByTile = remapIndexMap(state.effects.securityAuraByTile);
  state.clusterActivationState = new Map();

  state.mapExpansion.purchased[direction] = true;
  state.mapExpansion.purchasesMade += 1;

  bumpTopologyVersion(state);
  rebuildDockEntities(state);

  return {
    ok: true,
    direction,
    cost,
    width: state.width,
    height: state.height
  };
}
