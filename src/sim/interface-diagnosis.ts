import { getBerthFacilityAt, getRoutePressureDiagnostics } from './sim';
import { fromIndex, ModuleType, RoomType, TileType, type ArrivingShip, type StationState, type TransportJob, type Visitor } from './types';

export type InterfaceDiagnosisSeverity = 'critical' | 'warning' | 'notice' | 'healthy';

export type InterfaceDiagnosisMetricCode =
  | 'boarding-late'
  | 'queue-crosses-door'
  | 'queue-blocks-access'
  | 'cargo-public-crossing'
  | 'passenger-transfer-slow'
  | 'service-capacity-reached'
  | 'service-access-blocked'
  | 'freight-staging-distance'
  | 'staff-access-stalled'
  | 'approach-wait'
  | 'berth-overstay'
  | 'healthy';

export type InterfaceIdentity =
  | { kind: 'dock'; dockId: number }
  | { kind: 'berth'; anchorTile: number };

export interface InterfaceDiagnosis {
  severity: InterfaceDiagnosisSeverity;
  title: string;
  evidence: string;
  remedy: string;
  implicatedTile?: number;
  metricCode: InterfaceDiagnosisMetricCode;
}

type InterfaceContext = {
  identity: InterfaceIdentity;
  label: string;
  anchorTile: number;
  accessTiles: number[];
  gangwayCount: number;
  cargoTiles: number[];
  ship: ArrivingShip | null;
};

const PUBLIC_ROOMS = new Set<RoomType>([
  RoomType.Cafeteria,
  RoomType.Cantina,
  RoomType.Lounge,
  RoomType.Market,
  RoomType.RecHall,
  RoomType.Observatory
]);

const ACTIVE_JOB_STATES = new Set<TransportJob['state']>(['pending', 'assigned', 'in_progress']);

function tileLabel(state: StationState, tile: number): string {
  const { x, y } = fromIndex(tile, state.width);
  return `(${x},${y})`;
}

function contextFor(state: StationState, identity: InterfaceIdentity): InterfaceContext | null {
  if (identity.kind === 'dock') {
    const dock = state.docks.find((candidate) => candidate.id === identity.dockId);
    if (!dock) return null;
    const ship = state.arrivingShips.find((candidate) => candidate.assignedDockId === dock.id && candidate.stage !== 'depart') ?? null;
    const attachmentIds = new Set(Object.values(dock.attachmentModuleIds ?? {}).filter((id): id is number => id !== undefined));
    const cargoTiles = state.moduleInstances
      .filter((module) => attachmentIds.has(module.id) && module.type === ModuleType.FreightLocker)
      .map((module) => module.originTile);
    return {
      identity,
      label: dock.sourceKind === 'pod-dock-module' ? 'Pod Dock' : `Dock #${dock.id}`,
      anchorTile: dock.anchorTile,
      accessTiles: [dock.accessTile, ...dock.tiles].filter((tile): tile is number => tile !== undefined),
      gangwayCount: 0,
      cargoTiles,
      ship
    };
  }

  const facility = getBerthFacilityAt(state, identity.anchorTile);
  if (!facility) return null;
  const serviceTiles = (type: ModuleType): number[] => {
    const ids = new Set(facility.serviceModuleIds[type] ?? []);
    return state.moduleInstances.filter((module) => ids.has(module.id)).map((module) => module.originTile);
  };
  const ship = state.arrivingShips.find(
    (candidate) => candidate.assignedBerthAnchor === facility.anchorTile && candidate.stage !== 'depart'
  ) ?? null;
  return {
    identity: { kind: 'berth', anchorTile: facility.anchorTile },
    label: 'Berth',
    anchorTile: facility.anchorTile,
    accessTiles: [...facility.clusterTiles, ...serviceTiles(ModuleType.Gangway)],
    gangwayCount: (facility.serviceModuleIds[ModuleType.Gangway] ?? []).length,
    cargoTiles: serviceTiles(ModuleType.CargoArm),
    ship
  };
}

function passengersFor(state: StationState, ship: ArrivingShip | null): Visitor[] {
  if (!ship) return [];
  return state.visitors.filter((visitor) => visitor.originShipId === ship.id);
}

function contractFor(state: StationState, ship: ArrivingShip | null) {
  if (!ship) return null;
  return state.portOps.contracts.find((contract) => contract.shipId === ship.id) ?? null;
}

function queueWaitSeconds(state: StationState, visitor: Visitor): number {
  return visitor.transferQueuedAt === null || visitor.transferQueuedAt === undefined
    ? 0
    : Math.max(0, state.now - visitor.transferQueuedAt);
}

function boardingVisitors(passengers: Visitor[]): Visitor[] {
  return passengers.filter((visitor) =>
    visitor.transferPhase === 'boarding-queued' || visitor.transferPhase === 'boarding-crossing'
  );
}

function transferVisitors(passengers: Visitor[]): Visitor[] {
  return passengers.filter((visitor) =>
    visitor.transferPhase === 'boarding-queued' ||
    visitor.transferPhase === 'boarding-crossing' ||
    visitor.transferPhase === 'disembark-queued' ||
    visitor.transferPhase === 'disembark-crossing'
  );
}

function cargoJobsFor(state: StationState, ship: ArrivingShip | null): TransportJob[] {
  if (!ship) return [];
  return state.jobs.filter((job) =>
    ACTIVE_JOB_STATES.has(job.state) && job.portShipId === ship.id && job.portCargoDirection !== undefined
  );
}

function manhattan(state: StationState, first: number, second: number): number {
  const a = fromIndex(first, state.width);
  const b = fromIndex(second, state.width);
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function unavailableDiagnosis(context: InterfaceContext | null): InterfaceDiagnosis {
  return {
    severity: 'notice',
    title: 'Interface is no longer available',
    evidence: context ? `${context.label} changed while it was selected.` : 'Its physical interface no longer exists.',
    remedy: 'Select an existing Pod Dock or Berth.',
    metricCode: 'healthy'
  };
}

/**
 * Derives one player-actionable operating diagnosis for a selected physical
 * interface. It deliberately reads current actors, jobs, queues and routes;
 * it does not store a score or create a second operations dashboard.
 */
export function deriveInterfaceDiagnosis(state: StationState, identity: InterfaceIdentity): InterfaceDiagnosis {
  const context = contextFor(state, identity);
  if (!context) return unavailableDiagnosis(context);
  const passengers = passengersFor(state, context.ship);
  const boarding = boardingVisitors(passengers);
  const contract = contractFor(state, context.ship);
  const deadlineSeconds = contract ? contract.hardDepartureAt - state.now : Number.POSITIVE_INFINITY;
  const blockedBoarding = boarding.filter((visitor) => visitor.transferBlockedTile !== null && visitor.transferBlockedTile !== undefined);

  // 1. Hard blocked/late boarding.
  if (blockedBoarding.length > 0 && deadlineSeconds <= 30) {
    const blocked = [...blockedBoarding].sort((a, b) => queueWaitSeconds(state, b) - queueWaitSeconds(state, a) || a.id - b.id)[0]!;
    const tile = blocked.transferBlockedTile!;
    return {
      severity: 'critical',
      title: `Boarding is late at ${context.label}`,
      evidence: `${blockedBoarding.length} passenger${blockedBoarding.length === 1 ? '' : 's'} blocked at ${tileLabel(state, tile)} with ${Math.max(0, Math.ceil(deadlineSeconds))}s before departure.`,
      remedy: context.identity.kind === 'berth'
        ? 'Clear the Gangway throat now; add a second Gangway before the next call.'
        : 'Clear the Pod Dock access throat now; add a second Pod Dock before the next call.',
      implicatedTile: tile,
      metricCode: 'boarding-late'
    };
  }

  // 2. Door/queue choke. Queue tiles are durable physical reservations, so a
  // door hit is more useful than a theoretical route-pressure percentage.
  const doorQueue = transferVisitors(passengers)
    .filter((visitor) => visitor.transferQueueTile !== null && visitor.transferQueueTile !== undefined)
    .filter((visitor) => state.tiles[visitor.transferQueueTile!] === TileType.Door)
    .sort((a, b) => a.transferQueueTile! - b.transferQueueTile! || a.id - b.id)[0];
  if (doorQueue?.transferQueueTile !== null && doorQueue?.transferQueueTile !== undefined) {
    const tile = doorQueue.transferQueueTile;
    const phase = doorQueue.transferPhase?.startsWith('boarding') ? 'boarding' : 'arrival';
    return {
      severity: 'warning',
      title: `${phase[0]!.toUpperCase()}${phase.slice(1)} queue crosses Door at ${tileLabel(state, tile)}`,
      evidence: `${transferVisitors(passengers).length} passenger${transferVisitors(passengers).length === 1 ? '' : 's'} currently use this interface queue.`,
      remedy: context.identity.kind === 'berth'
        ? `Add ${context.gangwayCount < 2 ? 'a second Gangway' : 'another Gangway'} or clear the throat.`
        : 'Add a second Pod Dock or clear the throat.',
      implicatedTile: tile,
      metricCode: 'queue-crosses-door'
    };
  }
  const accessQueue = transferVisitors(passengers)
    .filter((visitor) => visitor.transferQueueTile !== null && visitor.transferQueueTile !== undefined)
    .filter((visitor) => context.accessTiles.includes(visitor.transferQueueTile!))
    .sort((a, b) => a.transferQueueTile! - b.transferQueueTile! || a.id - b.id)[0];
  if (accessQueue?.transferQueueTile !== null && accessQueue?.transferQueueTile !== undefined) {
    const tile = accessQueue.transferQueueTile;
    return {
      severity: 'warning',
      title: `Passenger queue blocks interface access at ${tileLabel(state, tile)}`,
      evidence: `${transferVisitors(passengers).length} passenger${transferVisitors(passengers).length === 1 ? '' : 's'} currently share this interface throat.`,
      remedy: context.identity.kind === 'berth'
        ? `Add ${context.gangwayCount < 2 ? 'a second Gangway' : 'another Gangway'} or clear the throat.`
        : 'Add a second Pod Dock or clear the throat.',
      implicatedTile: tile,
      metricCode: 'queue-blocks-access'
    };
  }

  // 3. Cargo/public conflict. This inspects an active cargo handler's actual
  // route, rather than inferring trouble from room layout alone.
  const routePressure = getRoutePressureDiagnostics(state);
  const cargoRouteHit = cargoJobsFor(state, context.ship)
    .flatMap((job) => state.crewMembers.filter((crew) => crew.activeJobId === job.id).map((crew) => ({ job, crew })))
    .flatMap(({ job, crew }) => crew.path
      .filter((tile) => PUBLIC_ROOMS.has(state.rooms[tile]))
      .map((tile) => ({ job, crew, tile })))
    .sort((a, b) => b.crew.path.length - a.crew.path.length || a.tile - b.tile || a.job.id - b.job.id)[0];
  if (cargoRouteHit) {
    const pressure = routePressure.logisticsByTile[cargoRouteHit.tile] ?? 0;
    return {
      severity: 'warning',
      title: `Cargo crosses public space at ${tileLabel(state, cargoRouteHit.tile)}`,
      evidence: `Cargo handler #${cargoRouteHit.crew.id} is routing through ${state.rooms[cargoRouteHit.tile]}; ${pressure} active logistics route${pressure === 1 ? '' : 's'} use that tile.`,
      remedy: 'Move freight staging beside the cargo arm or open a staff-only cargo route.',
      implicatedTile: cargoRouteHit.tile,
      metricCode: 'cargo-public-crossing'
    };
  }

  // 4. Long measured passenger transfer waits.
  const transfers = transferVisitors(passengers);
  const longestTransfer = [...transfers].sort((a, b) => queueWaitSeconds(state, b) - queueWaitSeconds(state, a) || a.id - b.id)[0];
  if (longestTransfer && queueWaitSeconds(state, longestTransfer) >= 20) {
    const tile = longestTransfer.transferQueueTile ?? longestTransfer.transferBlockedTile ?? context.anchorTile;
    return {
      severity: 'warning',
      title: `Passenger transfer is slow at ${context.label}`,
      evidence: `Passenger #${longestTransfer.id} has waited ${Math.ceil(queueWaitSeconds(state, longestTransfer))}s at ${tileLabel(state, tile)}.`,
      remedy: context.identity.kind === 'berth'
        ? 'Add a second Gangway or shorten the station-side route from the berth.'
        : 'Clear the access route or add a second Pod Dock.',
      implicatedTile: tile,
      metricCode: 'passenger-transfer-slow'
    };
  }

  // 5. A live service queue is a concrete capacity signal. It is separate
  // from transfer waiting so the player can tell a Gangway problem from a
  // station-side service/seating shortfall.
  const queuedForService = passengers
    .filter((visitor) => visitor.transferPhase === 'station' && visitor.queueProviderTile !== null && visitor.queueProviderTile !== undefined)
    .filter((visitor) => visitor.queueJoinedAt !== null && visitor.queueJoinedAt !== undefined)
    .sort((a, b) => (a.queueJoinedAt ?? state.now) - (b.queueJoinedAt ?? state.now) || a.id - b.id)[0];
  if (queuedForService && state.now - (queuedForService.queueJoinedAt ?? state.now) >= 20) {
    const tile = queuedForService.queueProviderTile!;
    return {
      severity: 'warning',
      title: 'Reachable passenger service capacity is full',
      evidence: `Passenger #${queuedForService.id} has waited ${Math.ceil(state.now - (queuedForService.queueJoinedAt ?? state.now))}s at service tile ${tileLabel(state, tile)}.`,
      remedy: 'Add reachable serving or seating capacity on the public route from this interface.',
      implicatedTile: tile,
      metricCode: 'service-capacity-reached'
    };
  }

  // 6. Passengers who have visibly been unable to continue to their service.
  const serviceBlocked = passengers
    .filter((visitor) => visitor.transferPhase === 'station' && visitor.serviceBlockedSince !== null && visitor.serviceBlockedSince !== undefined)
    .sort((a, b) => (a.serviceBlockedSince ?? 0) - (b.serviceBlockedSince ?? 0) || a.id - b.id)[0];
  if (serviceBlocked && state.now - (serviceBlocked.serviceBlockedSince ?? state.now) >= 15) {
    return {
      severity: 'warning',
      title: 'Passenger services are unreachable from this interface',
      evidence: `Passenger #${serviceBlocked.id} has been blocked for ${Math.ceil(state.now - (serviceBlocked.serviceBlockedSince ?? state.now))}s near ${tileLabel(state, serviceBlocked.tileIndex)}.`,
      remedy: 'Open a walkable public route from the interface to the needed service or add capacity on this side of the station.',
      implicatedTile: serviceBlocked.tileIndex,
      metricCode: 'service-access-blocked'
    };
  }

  // 7. Long staging runs and currently stalled cargo staff access.
  const cargoJobs = cargoJobsFor(state, context.ship);
  const longStaging = cargoJobs
    .map((job) => ({ job, distance: manhattan(state, job.fromTile, job.toTile) }))
    .filter((candidate) => candidate.distance >= 14)
    .sort((a, b) => b.distance - a.distance || a.job.id - b.job.id)[0];
  if (longStaging) {
    const cargoTile = context.cargoTiles[0] ?? longStaging.job.toTile;
    return {
      severity: 'notice',
      title: `Freight staging is far from ${context.label}`,
      evidence: `Cargo job #${longStaging.job.id} is carrying ${longStaging.distance} tiles to ${tileLabel(state, cargoTile)}.`,
      remedy: 'Move staging closer to the cargo arm and keep a direct staff route open.',
      implicatedTile: cargoTile,
      metricCode: 'freight-staging-distance'
    };
  }
  const stalledCargo = cargoJobs
    .filter((job) => job.stallReason && job.stallReason !== 'none')
    .sort((a, b) => a.id - b.id)[0];
  const stalledReason = stalledCargo?.stallReason;
  if (stalledCargo && stalledReason && stalledReason !== 'none') {
    return {
      severity: 'notice',
      title: `Cargo staff cannot reach ${context.label}`,
      evidence: `Cargo job #${stalledCargo.id} is stalled: ${stalledReason.replace(/_/g, ' ')} at ${tileLabel(state, stalledCargo.toTile)}.`,
      remedy: 'Restore a walkable staff route between staging and the cargo handoff.',
      implicatedTile: stalledCargo.toTile,
      metricCode: 'staff-access-stalled'
    };
  }

  // 8. Approach wait/overstay.
  if (context.ship?.approachCommitment?.status === 'waiting') {
    const wait = Math.max(0, state.now - context.ship.approachCommitment.queuedAt);
    if (wait >= 15) {
      return {
        severity: 'notice',
        title: `${context.label} is waiting for approach clearance`,
        evidence: `${context.ship.portManifest?.callsign ?? `Ship #${context.ship.id}`} has held for ${Math.ceil(wait)}s on this interface approach.`,
        remedy: 'Clear the shared approach lane or wait for the occupying ship to depart.',
        implicatedTile: context.anchorTile,
        metricCode: 'approach-wait'
      };
    }
  }
  if (contract && state.now > contract.hardDepartureAt && context.ship?.stage === 'docked') {
    return {
      severity: 'notice',
      title: `${context.label} is overdue for departure`,
      evidence: `${context.ship.portManifest?.callsign ?? `Ship #${context.ship.id}`} is ${Math.ceil(state.now - contract.hardDepartureAt)}s beyond its hard departure time.`,
      remedy: 'Finish the outstanding turnaround work or clear the departure path.',
      implicatedTile: context.anchorTile,
      metricCode: 'berth-overstay'
    };
  }

  return {
    severity: 'healthy',
    title: `${context.label} is operating normally`,
    evidence: context.ship ? `${context.ship.portManifest?.callsign ?? `Ship #${context.ship.id}`} has no active interface blockage.` : 'No active ship, queue, cargo route, or approach wait is blocking this interface.',
    remedy: 'No interface change needed.',
    implicatedTile: context.accessTiles[0] ?? context.anchorTile,
    metricCode: 'healthy'
  };
}
