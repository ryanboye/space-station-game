// expansion.ts — extracted from sim.ts.
//
// Owns the map-expansion API: cost tiers, direction-availability,
// and the destructive remap that grows the grid in a chosen direction.
// Public surface is re-exported from sim.ts so consumers (main.ts,
// save.ts, scenarios.ts, sim-tests.ts) keep working unchanged.

import { recordEconomyEvent } from './opening-economy';
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
import { remapUtilityUnderlayState } from './utility-underlay';

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
  const remapDockSourceKey = (sourceKey: string | null | undefined): string | null | undefined => {
    if (!sourceKey) return sourceKey;
    const match = /^(legacy-dock|pod-dock):(\d+)$/.exec(sourceKey);
    if (!match) return sourceKey;
    return `${match[1]}:${remapIndex(Number(match[2]))}`;
  };
  const remapApproachSlotId = (slotId: string): string => {
    if (slotId.startsWith('berth:')) return `berth:${remapIndex(Number(slotId.slice('berth:'.length)))}`;
    if (slotId.startsWith('dock:')) return `dock:${remapDockSourceKey(slotId.slice('dock:'.length)) ?? slotId.slice('dock:'.length)}`;
    return slotId;
  };
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
  const heatByTile = new Float32Array(newWidth * newHeight).fill(42);
  const staleAirByTile = new Float32Array(newWidth * newHeight);
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
      heatByTile[newIndex] = state.heatByTile[oldIndex] ?? 42;
      staleAirByTile[newIndex] = state.staleAirByTile[oldIndex] ?? 0;
      dirtByTile[newIndex] = state.dirtByTile[oldIndex];
      dirtSourceByTile[newIndex] = state.dirtSourceByTile[oldIndex];
    }
  }

  recordEconomyEvent(state.openingEconomy.ledger, {
    at: state.now,
    kind: 'station-expansion',
    credits: -cost,
    costBasis: cost,
    label: `Station expansion · ${direction}`
  });
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
  state.heatByTile = heatByTile;
  state.staleAirByTile = staleAirByTile;
  state.utilityUnderlay = remapUtilityUnderlayState(
    state.utilityUnderlay,
    oldWidth,
    oldHeight,
    newWidth,
    newHeight,
    shiftX,
    shiftY
  );
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
    sourceKey: remapDockSourceKey(dock.sourceKey) ?? dock.sourceKey,
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
  state.structuralExpansionProjects = state.structuralExpansionProjects.map((project) => {
    const topLeft = fromIndex(toIndex(project.bounds.minX, project.bounds.minY, oldWidth), oldWidth);
    const bottomRight = fromIndex(toIndex(project.bounds.maxX, project.bounds.maxY, oldWidth), oldWidth);
    const remappedTopLeft = fromIndex(remapIndex(toIndex(topLeft.x, topLeft.y, oldWidth)), newWidth);
    const remappedBottomRight = fromIndex(remapIndex(toIndex(bottomRight.x, bottomRight.y, oldWidth)), newWidth);
    return {
      ...project,
      bounds: {
        minX: remappedTopLeft.x,
        minY: remappedTopLeft.y,
        maxX: remappedBottomRight.x,
        maxY: remappedBottomRight.y
      },
      doorTile: remapOptionalIndex(project.doorTile),
      targets: project.targets.map((target) => ({ ...target, tileIndex: remapIndex(target.tileIndex) }))
    };
  });
  state.berthConfigs = state.berthConfigs.map((config) => ({
    ...config,
    anchorTile: remapIndex(config.anchorTile)
  }));
  state.trafficOffers = state.trafficOffers.map((offer) => ({
    ...offer,
    assignedBerthAnchor: offer.assignedBerthAnchor === null || offer.assignedBerthAnchor === undefined
      ? null
      : remapIndex(offer.assignedBerthAnchor),
    assignedDockSourceKey: remapDockSourceKey(offer.assignedDockSourceKey) ?? null
  }));
  state.portOps.contracts = state.portOps.contracts.map((contract) => ({
    ...contract,
    assignedBerthAnchor: remapIndex(contract.assignedBerthAnchor)
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
    const key = debt.key.startsWith('integrity:')
      ? debt.key
      : domain === 'utility' && debt.system
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
    assignedDockSourceKey: remapDockSourceKey(ship.assignedDockSourceKey) ?? null,
    assignedBerthAnchor: ship.assignedBerthAnchor === null || ship.assignedBerthAnchor === undefined
      ? ship.assignedBerthAnchor
      : remapIndex(ship.assignedBerthAnchor),
    approachCommitment: ship.approachCommitment
      ? {
          ...ship.approachCommitment,
          slotId: remapApproachSlotId(ship.approachCommitment.slotId),
          groupIds: ship.approachCommitment.groupIds.map((groupId) => {
            const match = /^approach\|(.+)\|(.+)$/.exec(groupId);
            return match
              ? `approach|${remapApproachSlotId(match[1])}|${remapApproachSlotId(match[2])}`
              : groupId;
          })
        }
      : null,
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
  state.mapWorldOriginX += direction === 'west' ? -EXPANSION_STEP_TILES : 0;
  state.mapWorldOriginY += direction === 'north' ? -EXPANSION_STEP_TILES : 0;

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
