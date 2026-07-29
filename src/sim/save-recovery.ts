/**
 * Post-hydration recovery: the checks and repairs that belong to *loading* a
 * station rather than to running one.
 *
 * Two jobs live here.
 *
 * 1. `reconcileTemporaryLodgingClaims` is a real repair. A guest asleep in a
 *    bunk owns that bunk, so the claim is durable and survives the save — but
 *    the `provider-slot` reservation that enforced exclusivity is transient and
 *    is cleared on load. Without this pass two guests can reload holding the
 *    same bunk, or a guest can hold a bunk that no longer exists.
 *
 * 2. `auditSaveRecovery` derives, from the loaded state alone, the facts a
 *    recovery test needs to assert. Reconstruction is only believable if it is
 *    checked directly; calling `tick(state, 0)` and assuming every derived
 *    system healed itself is what this module exists to avoid.
 *
 * Nothing here mutates simulation rules. It reads durable geometry, rebuilds
 * the claims that geometry implies, and reports what it found.
 */

import {
  getApproachConflictGroups,
  tryCreateReservation
} from './sim';
import { resolveFacilitySlots } from './facility-descriptors';
import { deriveInterfaceDiagnosis, type InterfaceDiagnosis, type InterfaceIdentity } from './interface-diagnosis';
import {
  ModuleType,
  RoomType,
  type StationState,
  type Visitor
} from './types';

const ACTIVE_JOB_STATES = new Set(['pending', 'assigned', 'in_progress']);
/** Loose bunks and beds are usable one slot per tile. */
const LOOSE_LODGING_MODULES = new Set<ModuleType>([ModuleType.Bed, ModuleType.Bunk]);

/**
 * Every tile a guest may sleep on, re-derived from durable geometry.
 *
 * Bunk banks publish their real sleep slots through the shared facility
 * descriptors, so this uses the same contract the simulation does rather than
 * guessing that every module tile is a bed. Both sources are then filtered by
 * the 'visitor' housing policy, which is what makes a bed a *guest* bed.
 */
export function guestLodgingTiles(state: StationState): Set<number> {
  const tiles = new Set<number>();
  for (const module of state.moduleInstances) {
    if (module.type === ModuleType.BunkBank) {
      for (const slot of resolveFacilitySlots(module, state.width)) {
        if (slot.role === 'temporary-sleep') tiles.add(slot.tileIndex);
      }
      continue;
    }
    if (!LOOSE_LODGING_MODULES.has(module.type)) continue;
    for (const tile of module.tiles) tiles.add(tile);
  }
  for (const tile of [...tiles]) {
    if (tile < 0 || tile >= state.tiles.length || state.roomHousingPolicies[tile] !== 'visitor') tiles.delete(tile);
  }
  return tiles;
}

export interface LodgingReconciliation {
  /** Claims that survived and were re-backed by a fresh exclusivity reservation. */
  kept: number;
  /** Claims dropped because the tile is no longer a guest bunk. */
  revokedInvalidTile: number;
  /** Claims dropped because another guest already held that bunk. */
  revokedDuplicate: number;
}

/**
 * Give every surviving lodging claim exactly one owner and one live
 * reservation. Ties are broken by spawn time, then id, so the same save always
 * reconciles to the same owner.
 */
export function reconcileTemporaryLodgingClaims(
  state: StationState,
  warnings: string[] = []
): LodgingReconciliation {
  const result: LodgingReconciliation = { kept: 0, revokedInvalidTile: 0, revokedDuplicate: 0 };
  const lodgingTiles = guestLodgingTiles(state);
  const claimants = state.visitors
    .filter((visitor) => visitor.temporarySleepTargetTile !== null && visitor.temporarySleepTargetTile !== undefined)
    .sort((a, b) => (a.spawnedAt - b.spawnedAt) || (a.id - b.id));

  const ownerByTile = new Map<number, Visitor>();
  for (const visitor of claimants) {
    const tileIndex = visitor.temporarySleepTargetTile as number;
    if (!lodgingTiles.has(tileIndex)) {
      visitor.temporarySleepTargetTile = null;
      result.revokedInvalidTile += 1;
      warnings.push(`Guest ${visitor.id} lost a lodging claim on tile ${tileIndex}: no guest bunk there any more.`);
      continue;
    }
    const existing = ownerByTile.get(tileIndex);
    if (existing) {
      visitor.temporarySleepTargetTile = null;
      result.revokedDuplicate += 1;
      warnings.push(`Guest ${visitor.id} released a lodging claim on tile ${tileIndex} already held by guest ${existing.id}.`);
      continue;
    }
    ownerByTile.set(tileIndex, visitor);
  }

  for (const [tileIndex, visitor] of ownerByTile) {
    const moduleId = state.moduleOccupancyByTile[tileIndex] ?? -1;
    const reservation = tryCreateReservation(state, {
      ownerKind: 'visitor',
      ownerId: visitor.id,
      kind: 'provider-slot',
      targetTile: tileIndex,
      targetId: `temporary-sleep:${moduleId}:guest-bed:${tileIndex}`,
      amount: 1,
      capacity: 1,
      ttlSec: 90,
      replaceOwnerReservations: true
    });
    if (!reservation.ok) {
      visitor.temporarySleepTargetTile = null;
      result.revokedInvalidTile += 1;
      warnings.push(`Guest ${visitor.id} could not re-claim bunk tile ${tileIndex} after load.`);
      continue;
    }
    visitor.reservedTargetTile = tileIndex;
    result.kept += 1;
  }
  return result;
}

export interface SaveRecoveryAudit {
  /** Procedural identity, so a test can prove the same system came back. */
  seedAtCreation: number;
  systemSeedAtCreation: number | null;
  laneVolumes: Record<string, number>;
  /**
   * Actors currently holding a movement path. After a load these are paths the
   * reconciliation tick planned fresh, never paths that came off the wire —
   * captureSnapshot does not serialize them at all.
   */
  actorsWithPaths: number;
  /** Actors that cannot currently stand anywhere walkable. */
  pathlessActors: number;
  /** Duplicate ids across the collections a reload could fork. */
  duplicateShipIds: number;
  duplicateVisitorIds: number;
  duplicateCrewIds: number;
  duplicateJobIds: number;
  /** More than one live construction site targeting the same tile. */
  duplicateConstructionTiles: number;
  activeJobs: number;
  reservations: number;
  /** Reservations whose owner no longer exists. */
  orphanReservations: number;
  /** Reservations already past their expiry at load time. */
  expiredReservations: number;
  dockQueueLength: number;
  /** Ships holding an approach slot, and any slot claimed twice. */
  approachCommitments: number;
  duplicateApproachSlots: number;
  approachConflictGroups: number;
  /** Interfaces that could be diagnosed from loaded geometry alone. */
  interfaceDiagnoses: number;
  interfaceDiagnosesBySeverity: Record<string, number>;
  /** Transfer queues that have a head visitor ready to move. */
  transferQueueHeads: number;
  visitorsInTransfer: number;
  /** Lodging ownership. */
  lodgingClaims: number;
  duplicateLodgingClaims: number;
  /** Physical custody of hauled goods. */
  carryingCrew: number;
  carriedUnits: number;
  /** Crew carrying cargo with no matching live job. */
  orphanCarriers: number;
  /** Construction/EVA work still outstanding, and how much is stalled. */
  openConstructionSites: number;
  blockedConstructionSites: number;
  evaConstructionSites: number;
  openRepairJobs: number;
  breachedIntegrityTargets: number;
}

function countDuplicates(ids: readonly number[]): number {
  const seen = new Set<number>();
  let duplicates = 0;
  for (const id of ids) {
    if (seen.has(id)) duplicates += 1;
    else seen.add(id);
  }
  return duplicates;
}

function isWalkableTile(state: StationState, tileIndex: number): boolean {
  if (tileIndex < 0 || tileIndex >= state.tiles.length) return false;
  return state.pressurized[tileIndex] !== undefined && state.tiles[tileIndex] !== undefined;
}

/**
 * Everything a recovery fixture needs to assert, derived from the loaded state
 * rather than trusted from the save.
 */
export function auditSaveRecovery(state: StationState): SaveRecoveryAudit {
  const laneVolumes: Record<string, number> = {};
  for (const lane of ['north', 'east', 'south', 'west'] as const) {
    laneVolumes[lane] = state.laneProfiles[lane].trafficVolume;
  }

  const actorPaths =
    state.crewMembers.filter((crew) => crew.path.length > 0).length +
    state.visitors.filter((visitor) => visitor.path.length > 0).length +
    state.residents.filter((resident) => resident.path.length > 0).length;

  const pathlessActors =
    state.crewMembers.filter((crew) => !isWalkableTile(state, crew.tileIndex)).length +
    state.visitors.filter((visitor) => !isWalkableTile(state, visitor.tileIndex)).length +
    state.residents.filter((resident) => !isWalkableTile(state, resident.tileIndex)).length;

  const liveOwnerIds = new Set<string>([
    ...state.crewMembers.map((crew) => `crew:${crew.id}`),
    ...state.visitors.map((visitor) => `visitor:${visitor.id}`),
    ...state.residents.map((resident) => `resident:${resident.id}`)
  ]);

  const activeJobs = state.jobs.filter((job) => ACTIVE_JOB_STATES.has(job.state));
  const activeJobIds = new Set(activeJobs.map((job) => job.id));

  const approachSlots = state.physicalHoldingQueue
    .map((entry) => entry.slotId)
    .filter((slot): slot is string => typeof slot === 'string');
  const uniqueApproachSlots = new Set(approachSlots);

  const interfaces: InterfaceIdentity[] = [
    ...state.docks.map((dock) => ({ kind: 'dock' as const, dockId: dock.id })),
    ...state.berthConfigs.map((config) => ({ kind: 'berth' as const, anchorTile: config.anchorTile }))
  ];
  const diagnoses: InterfaceDiagnosis[] = [];
  for (const identity of interfaces) {
    const diagnosis = deriveInterfaceDiagnosis(state, identity);
    if (diagnosis) diagnoses.push(diagnosis);
  }
  const interfaceDiagnosesBySeverity: Record<string, number> = {};
  for (const diagnosis of diagnoses) {
    interfaceDiagnosesBySeverity[diagnosis.severity] = (interfaceDiagnosesBySeverity[diagnosis.severity] ?? 0) + 1;
  }

  const constructionTileCounts = new Map<number, number>();
  for (const site of state.constructionSites) {
    if (site.state === 'done') continue;
    constructionTileCounts.set(site.tileIndex, (constructionTileCounts.get(site.tileIndex) ?? 0) + 1);
  }

  const lodgingTiles = state.visitors
    .map((visitor) => visitor.temporarySleepTargetTile)
    .filter((tile): tile is number => tile !== null && tile !== undefined);

  const transferVisitors = state.visitors.filter(
    (visitor) => (visitor.transferPhase ?? 'station') !== 'station'
  );
  const transferSlotKeys = new Set(
    transferVisitors
      .map((visitor) => visitor.transferSlotKey)
      .filter((key): key is string => typeof key === 'string' && key.length > 0)
  );

  return {
    seedAtCreation: state.seedAtCreation,
    systemSeedAtCreation: state.system?.seedAtCreation ?? null,
    laneVolumes,
    actorsWithPaths: actorPaths,
    pathlessActors,
    duplicateShipIds: countDuplicates(state.arrivingShips.map((ship) => ship.id)),
    duplicateVisitorIds: countDuplicates(state.visitors.map((visitor) => visitor.id)),
    duplicateCrewIds: countDuplicates(state.crewMembers.map((crew) => crew.id)),
    duplicateJobIds: countDuplicates(state.jobs.map((job) => job.id)),
    duplicateConstructionTiles: [...constructionTileCounts.values()].filter((count) => count > 1).length,
    activeJobs: activeJobs.length,
    reservations: state.reservations.length,
    orphanReservations: state.reservations.filter(
      (reservation) => !liveOwnerIds.has(`${reservation.ownerKind}:${reservation.ownerId}`)
    ).length,
    expiredReservations: state.reservations.filter((reservation) => reservation.expiresAt <= state.now).length,
    dockQueueLength: state.physicalHoldingQueue.filter((entry) => entry.status === 'awaiting-slot').length,
    approachCommitments: approachSlots.length,
    duplicateApproachSlots: approachSlots.length - uniqueApproachSlots.size,
    approachConflictGroups: getApproachConflictGroups(state).length,
    interfaceDiagnoses: diagnoses.length,
    interfaceDiagnosesBySeverity,
    transferQueueHeads: transferSlotKeys.size,
    visitorsInTransfer: transferVisitors.length,
    lodgingClaims: lodgingTiles.length,
    duplicateLodgingClaims: lodgingTiles.length - new Set(lodgingTiles).size,
    carryingCrew: state.crewMembers.filter((crew) => crew.carryingItemType !== null && crew.carryingAmount > 0.001).length,
    carriedUnits: state.crewMembers.reduce(
      (sum, crew) => sum + (crew.carryingItemType !== null ? Math.max(0, crew.carryingAmount) : 0),
      0
    ),
    orphanCarriers: state.crewMembers.filter(
      (crew) =>
        crew.carryingItemType !== null &&
        crew.carryingAmount > 0.001 &&
        (crew.activeJobId === null || !activeJobIds.has(crew.activeJobId))
    ).length,
    openConstructionSites: state.constructionSites.filter((site) => site.state !== 'done').length,
    blockedConstructionSites: state.constructionSites.filter((site) => site.state === 'blocked').length,
    evaConstructionSites: state.constructionSites.filter((site) => site.state !== 'done' && site.requiresEva).length,
    openRepairJobs: state.jobs.filter((job) => job.type === 'repair' && ACTIVE_JOB_STATES.has(job.state)).length,
    breachedIntegrityTargets: state.exteriorIntegrityTargets.filter(
      (target) => target.state === 'breached' || target.state === 'damaged'
    ).length
  };
}

/**
 * Total physical units of an item held anywhere: inventory nodes plus whatever
 * crew are physically carrying. Custody may move across a load; the total may
 * not change.
 */
export function totalPhysicalStock(state: StationState, itemType: string): number {
  let total = 0;
  for (const node of state.itemNodes) {
    total += Math.max(0, (node.items as Record<string, number>)[itemType] ?? 0);
  }
  for (const crew of state.crewMembers) {
    if (crew.carryingItemType === itemType) total += Math.max(0, crew.carryingAmount);
  }
  return total;
}

/** Rooms that make a station "still working" — used by the 50/50 resume proof. */
export const PROGRESS_ROOMS: readonly RoomType[] = [
  RoomType.Cafeteria,
  RoomType.Market,
  RoomType.Berth
];
