import {
  adjacentWalkableTiles,
  getBerthFacilityAt,
  getFuelPipeNetworkDiagnostics,
  getRoutePressureDiagnostics,
  getUtilityUnderlayTileDiagnostic,
  wallMountedModuleServiceTile
} from './sim';
import { hasUtilityUnderlay } from './utility-underlay';
import {
  fromIndex,
  inBounds,
  isWalkable,
  ModuleType,
  RoomType,
  TileType,
  toIndex,
  type ArrivingShip,
  type InterfaceBoardingTally,
  type MaintenanceDebt,
  type StationState,
  type TransportJob,
  type Visitor
} from './types';

export type InterfaceDiagnosisSeverity = 'critical' | 'warning' | 'notice' | 'healthy';

export type InterfaceDiagnosisMetricCode =
  | 'boarding-late'
  | 'queue-crosses-door'
  | 'queue-blocks-access'
  | 'cargo-public-crossing'
  | 'passenger-transfer-slow'
  | 'service-capacity-reached'
  | 'service-access-blocked'
  | 'utility-maintenance-access'
  | 'freight-staging-distance'
  | 'staff-access-stalled'
  | 'boarding-distance'
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
  /**
   * Every tile this interface's own hardware occupies: its collar or berth
   * floor plus the tiles of the modules bolted to it. Utility and maintenance
   * questions are asked against this set, so a debt on an unrelated corridor
   * never gets blamed on the selected interface.
   */
  hardwareTiles: number[];
  hardwareModuleIds: number[];
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
const DIAGNOSIS_TRAFFIC_REFRESH_SECONDS = 2;

type CachedInterfaceDiagnosis = {
  relevantSignature: string;
  trafficBucket: number;
  diagnosis: InterfaceDiagnosis;
};

const diagnosisCache = new WeakMap<StationState, Map<string, CachedInterfaceDiagnosis>>();
const diagnosisCacheStats = {
  hits: 0,
  builds: 0
};

export interface InterfaceDiagnosisCacheStats {
  hits: number;
  builds: number;
}

export function getInterfaceDiagnosisCacheStats(): InterfaceDiagnosisCacheStats {
  return { ...diagnosisCacheStats };
}

export function resetInterfaceDiagnosisCacheForTests(state: StationState): void {
  diagnosisCacheStats.hits = 0;
  diagnosisCacheStats.builds = 0;
  diagnosisCache.delete(state);
}

function identityKey(identity: InterfaceIdentity): string {
  return identity.kind === 'dock' ? `dock:${identity.dockId}` : `berth:${identity.anchorTile}`;
}

function interfaceShip(state: StationState, identity: InterfaceIdentity): ArrivingShip | null {
  return state.arrivingShips.find((ship) =>
    ship.stage !== 'depart' &&
    (identity.kind === 'dock'
      ? ship.assignedDockId === identity.dockId
      : ship.assignedBerthAnchor === identity.anchorTile)
  ) ?? null;
}

/**
 * This deliberately fingerprints only data capable of changing the selected
 * interface diagnosis. In particular it does not walk every actor route; only
 * cargo handlers assigned to this interface's live ship contribute paths.
 */
function relevantChangeSignature(
  state: StationState,
  identity: InterfaceIdentity
): { value: string; sustainedTraffic: boolean } {
  const ship = interfaceShip(state, identity);
  const shipId = ship?.id;
  const contract = shipId === undefined
    ? null
    : state.portOps.contracts.find((candidate) => candidate.shipId === shipId) ?? null;
  const passengers = shipId === undefined
    ? []
    : state.visitors
      .filter((visitor) => visitor.originShipId === shipId)
      .sort((a, b) => a.id - b.id)
      .map((visitor) => [
        visitor.id,
        visitor.transferPhase ?? '',
        visitor.transferQueueTile ?? '',
        visitor.transferBlockedTile ?? '',
        visitor.transferQueuedAt ?? '',
        visitor.queueProviderTile ?? '',
        visitor.queueJoinedAt ?? '',
        visitor.serviceBlockedSince ?? '',
        visitor.tileIndex
      ].join(','))
      .join(';');
  const cargoJobs = shipId === undefined
    ? []
    : state.jobs
      .filter((job) =>
        job.portShipId === shipId &&
        job.portCargoDirection !== undefined &&
        ACTIVE_JOB_STATES.has(job.state)
      )
      .sort((a, b) => a.id - b.id)
      .map((job) => {
        const handler = state.crewMembers.find((crew) => crew.activeJobId === job.id);
        return [
          job.id,
          job.state,
          job.fromTile,
          job.toTile,
          job.stallReason ?? '',
          handler?.id ?? '',
          handler?.path.join('.') ?? ''
        ].join(',');
      })
      .join(';');

  return {
    value: [
      state.topologyVersion,
      state.roomVersion,
      state.moduleVersion,
      state.dockVersion,
      state.width,
      state.height,
      ship?.id ?? '',
      ship?.stage ?? '',
      ship?.assignedDockId ?? '',
      ship?.assignedBerthAnchor ?? '',
      ship?.approachCommitment?.status ?? '',
      ship?.approachCommitment?.queuedAt ?? '',
      contract?.status ?? '',
      contract?.hardDepartureAt ?? '',
      // Utility/maintenance access only changes answer when the underlay is
      // repainted or a debt crosses the repair threshold, so the fingerprint
      // records those two facts instead of every debt's live value.
      state.utilityUnderlay?.version ?? 0,
      state.maintenanceDebts
        .filter((debt) => debt.debt >= INTERFACE_MAINTENANCE_DEBT_THRESHOLD)
        .map((debt) => debt.key)
        .join('~'),
      passengers,
      cargoJobs
    ].join('|'),
    sustainedTraffic: ship !== null
  };
}

function tileLabel(state: StationState, tile: number): string {
  const { x, y } = fromIndex(tile, state.width);
  return `(${x},${y})`;
}

/** Footprint tiles for a set of module ids, falling back to the origin tile. */
function moduleFootprint(state: StationState, moduleIds: Set<number>): number[] {
  return state.moduleInstances
    .filter((module) => moduleIds.has(module.id))
    .flatMap((module) => (module.tiles.length > 0 ? module.tiles : [module.originTile]));
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
    const hardwareModuleIds = [...attachmentIds];
    if (dock.moduleId !== undefined && dock.moduleId !== null) hardwareModuleIds.push(dock.moduleId);
    const accessTiles = [dock.accessTile, ...dock.tiles].filter((tile): tile is number => tile !== undefined);
    return {
      identity,
      label: dock.sourceKind === 'pod-dock-module' ? 'Pod Dock' : `Dock #${dock.id}`,
      anchorTile: dock.anchorTile,
      accessTiles,
      gangwayCount: 0,
      cargoTiles,
      hardwareTiles: [...new Set([dock.anchorTile, ...accessTiles, ...moduleFootprint(state, new Set(hardwareModuleIds))])],
      hardwareModuleIds,
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
  const hardwareModuleIds = Object.values(facility.serviceModuleIds).flatMap((ids) => ids ?? []);
  return {
    identity: { kind: 'berth', anchorTile: facility.anchorTile },
    label: 'Berth',
    anchorTile: facility.anchorTile,
    accessTiles: [...facility.clusterTiles, ...serviceTiles(ModuleType.Gangway)],
    gangwayCount: (facility.serviceModuleIds[ModuleType.Gangway] ?? []).length,
    cargoTiles: serviceTiles(ModuleType.CargoArm),
    hardwareTiles: [...new Set([...facility.clusterTiles, ...moduleFootprint(state, new Set(hardwareModuleIds))])],
    hardwareModuleIds,
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

function orthogonalNeighbors(state: StationState, tile: number): number[] {
  const { x, y } = fromIndex(tile, state.width);
  const out: number[] = [];
  for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
    if (inBounds(x + dx, y + dy, state.width, state.height)) out.push(toIndex(x + dx, y + dy, state.width));
  }
  return out;
}

/**
 * How far a boarding passenger still has to physically travel. A live crossing
 * already owns a walked route, so its remaining path is the honest number; a
 * queued passenger has not been handed one yet, so the span between where they
 * stand and the collar they are waiting for is the best measure available.
 */
function boardingRouteTiles(state: StationState, visitor: Visitor, context: InterfaceContext): number {
  if (visitor.path.length > 0) return visitor.path.length;
  const from = visitor.transferQueueTile ?? visitor.tileIndex;
  const to = visitor.transferAccessTile ?? visitor.transferStationTile ?? context.anchorTile;
  if (from === null || from === undefined || to === null || to === undefined) return 0;
  return manhattan(state, from, to);
}

/**
 * Boarding distance and duration for one interface. `state.commitment` counts
 * both station-wide, which cannot answer "is boarding slow *here*"; this keys
 * the same two quantities to the selected interface instead.
 *
 * Live figures are derived from the passengers currently boarding. Completed
 * figures come from `recordInterfaceBoardingCompletion`, which the transfer
 * completion path calls once per finished crossing.
 */
export interface InterfaceBoardingMeasure {
  identityKey: string;
  /** Passengers queued or crossing toward this interface right now. */
  activeBoarders: number;
  /** Measured wait of the longest-held live boarder, in seconds. */
  longestWaitSeconds: number;
  totalWaitSeconds: number;
  /** Remaining physical boarding route for the same cohort, in tiles. */
  longestRouteTiles: number;
  totalRouteTiles: number;
  /** Where the longest live boarding route currently starts. */
  farthestBoarderTile: number | null;
  /** Crossings this interface has actually finished. */
  completedBoardings: number;
  completedSeconds: number;
  completedRouteTiles: number;
}

const EMPTY_BOARDING_TALLY: Readonly<InterfaceBoardingTally> = {
  completedBoardings: 0,
  completedSeconds: 0,
  completedRouteTiles: 0
};

function writableBoardingTallyFor(state: StationState, key: string): InterfaceBoardingTally {
  const tallies = state.interfaceBoardingTallies ?? (state.interfaceBoardingTallies = {});
  return tallies[key] ?? (tallies[key] = { ...EMPTY_BOARDING_TALLY });
}

/** The interface a passenger was transferring across, from their origin ship. */
function identityForVisitor(state: StationState, visitor: Visitor): InterfaceIdentity | null {
  if (visitor.originShipId === null) return null;
  const ship = state.arrivingShips.find((candidate) => candidate.id === visitor.originShipId);
  if (!ship) return null;
  if (ship.assignedDockId !== null && ship.assignedDockId !== undefined) return { kind: 'dock', dockId: ship.assignedDockId };
  if (ship.assignedBerthAnchor !== null && ship.assignedBerthAnchor !== undefined) {
    return { kind: 'berth', anchorTile: ship.assignedBerthAnchor };
  }
  return null;
}

/**
 * Record one finished boarding crossing against the interface it used. Called
 * from the transfer completion path with the same elapsed time the station-wide
 * `commitment.boardingSeconds` total receives; the distance is re-derived here
 * from the passenger's own queue/station/access tiles, which are still set.
 */
export function recordInterfaceBoardingCompletion(state: StationState, visitor: Visitor, elapsedSeconds: number): void {
  const identity = identityForVisitor(state, visitor);
  if (!identity) return;
  const queueTile = visitor.transferQueueTile ?? visitor.transferStationTile ?? null;
  const stationTile = visitor.transferStationTile ?? queueTile;
  const accessTile = visitor.transferAccessTile ?? stationTile;
  const routeTiles = queueTile === null || stationTile === null || accessTile === null
    ? 0
    : manhattan(state, queueTile, stationTile) + manhattan(state, stationTile, accessTile);
  const tally = writableBoardingTallyFor(state, identityKey(identity));
  tally.completedBoardings += 1;
  tally.completedSeconds += Math.max(0, elapsedSeconds);
  tally.completedRouteTiles += routeTiles;
}

/** Test seam: drop the durable per-interface boarding totals for one station. */
export function resetInterfaceBoardingMeasuresForTests(state: StationState): void {
  state.interfaceBoardingTallies = {};
}

export function measureInterfaceBoarding(state: StationState, identity: InterfaceIdentity): InterfaceBoardingMeasure {
  const key = identityKey(identity);
  const tally = state.interfaceBoardingTallies?.[key] ?? EMPTY_BOARDING_TALLY;
  const context = contextFor(state, identity);
  const boarding = context ? boardingVisitors(passengersFor(state, context.ship)) : [];
  let longestWaitSeconds = 0;
  let totalWaitSeconds = 0;
  let longestRouteTiles = 0;
  let totalRouteTiles = 0;
  let farthestBoarderTile: number | null = null;
  for (const visitor of boarding) {
    if (!context) break;
    const wait = queueWaitSeconds(state, visitor);
    totalWaitSeconds += wait;
    longestWaitSeconds = Math.max(longestWaitSeconds, wait);
    const route = boardingRouteTiles(state, visitor, context);
    totalRouteTiles += route;
    if (route > longestRouteTiles) {
      longestRouteTiles = route;
      farthestBoarderTile = visitor.transferQueueTile ?? visitor.tileIndex;
    }
  }
  return {
    identityKey: key,
    activeBoarders: boarding.length,
    longestWaitSeconds,
    totalWaitSeconds,
    longestRouteTiles,
    totalRouteTiles,
    farthestBoarderTile,
    completedBoardings: tally.completedBoardings,
    completedSeconds: tally.completedSeconds,
    completedRouteTiles: tally.completedRouteTiles
  };
}

const INTERFACE_MAINTENANCE_DEBT_THRESHOLD = 45;

function maintenanceWorkTile(debt: MaintenanceDebt): number {
  return debt.targetTile ?? debt.anchorTile;
}

/** Debts sitting on this interface's own collar, berth floor, or modules. */
function interfaceMaintenanceDebts(state: StationState, context: InterfaceContext): MaintenanceDebt[] {
  const tiles = new Set(context.hardwareTiles);
  const modules = new Set(context.hardwareModuleIds);
  return state.maintenanceDebts.filter((debt) =>
    (debt.moduleId !== undefined && modules.has(debt.moduleId)) ||
    tiles.has(debt.anchorTile) ||
    (debt.targetTile !== undefined && tiles.has(debt.targetTile))
  );
}

/**
 * Whether a repairer can physically stand at a debt. Interior work needs a
 * walkable tile on or beside the target; exterior panels are serviced by EVA,
 * so the equivalent question is whether open space or truss touches them.
 */
function repairAccessOpen(state: StationState, debt: MaintenanceDebt): boolean {
  const tile = maintenanceWorkTile(debt);
  if (tile < 0 || tile >= state.tiles.length) return false;
  if (debt.exterior === true) {
    return orthogonalNeighbors(state, tile).some(
      (neighbor) => state.tiles[neighbor] === TileType.Space || state.tiles[neighbor] === TileType.Truss
    );
  }
  return isWalkable(state.tiles[tile]) || adjacentWalkableTiles(state, tile).length > 0;
}

type InterfaceUtilityGap = { tile: number; evidence: string; remedy: string };

/**
 * Utility service this interface's hardware declares and is not getting. Both
 * checks are physical contracts the simulation already enforces: a Fuel Coupler
 * that no Fuel Pipe reaches cannot pump, and a conduit whose network has no
 * live source powers nothing. Absent underlay on hardware that never asked for
 * it is not reported, so this stays a fact rather than a preference.
 */
function interfaceUtilityGap(state: StationState, context: InterfaceContext): InterfaceUtilityGap | null {
  const couplers = state.moduleInstances.filter(
    (module) => context.hardwareModuleIds.includes(module.id) && module.type === ModuleType.FuelCoupler
  );
  for (const coupler of couplers) {
    const serviceTile = wallMountedModuleServiceTile(state, coupler.originTile) ?? coupler.originTile;
    if (!hasUtilityUnderlay(state, 'fuel-pipe', serviceTile)) {
      return {
        tile: serviceTile,
        evidence: `Fuel Coupler at ${tileLabel(state, serviceTile)} has no Fuel Pipe on its service tile.`,
        remedy: 'Run Fuel Pipe from a Maintenance Fuel Tank to the coupler service tile.'
      };
    }
    const fuelNetwork = getFuelPipeNetworkDiagnostics(state);
    const componentId = fuelNetwork.componentIdByTile[serviceTile];
    const component = componentId >= 0 ? fuelNetwork.components[componentId] : undefined;
    if (!component?.powered) {
      return {
        tile: serviceTile,
        evidence: `The Fuel Pipe at ${tileLabel(state, serviceTile)} has no Maintenance Fuel Tank behind it.`,
        remedy: 'Join this fuel line to a Fuel Tank in a Maintenance room.'
      };
    }
  }
  for (const tile of context.hardwareTiles) {
    if (!hasUtilityUnderlay(state, 'power-conduit', tile)) continue;
    const { x, y } = fromIndex(tile, state.width);
    const diagnostic = getUtilityUnderlayTileDiagnostic(state, x, y, 'power-conduit');
    if (diagnostic && diagnostic.present && !diagnostic.powered) {
      return {
        tile,
        evidence: `The power conduit under ${tileLabel(state, tile)} is dead; ${diagnostic.effect}.`,
        remedy: `${diagnostic.fix[0]!.toUpperCase()}${diagnostic.fix.slice(1)}.`
      };
    }
  }
  return null;
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
function computeInterfaceDiagnosis(state: StationState, identity: InterfaceIdentity): InterfaceDiagnosis {
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

  // 7. Utility and maintenance access to this interface's own hardware. A
  // Gangway nobody can reach to service, or a coupler no pipe feeds, degrades
  // every later call at this berth even while the current visit looks fine.
  const strandedDebt = interfaceMaintenanceDebts(state, context)
    .filter((debt) => debt.debt >= INTERFACE_MAINTENANCE_DEBT_THRESHOLD && !repairAccessOpen(state, debt))
    .sort((a, b) => b.debt - a.debt || a.anchorTile - b.anchorTile)[0];
  if (strandedDebt) {
    const tile = maintenanceWorkTile(strandedDebt);
    return {
      severity: 'warning',
      title: `Maintenance cannot reach ${context.label} hardware`,
      evidence: `${strandedDebt.label ?? 'Interface hardware'} at ${tileLabel(state, tile)} holds ${Math.round(strandedDebt.debt)} debt with no ${strandedDebt.exterior === true ? 'EVA' : 'walkable'} standing tile.`,
      remedy: strandedDebt.exterior === true
        ? 'Open an exterior face or Truss run beside this panel so an EVA repair can reach it.'
        : 'Open a walkable tile beside this hardware so a repair crew can stand at it.',
      implicatedTile: tile,
      metricCode: 'utility-maintenance-access'
    };
  }
  const utilityGap = interfaceUtilityGap(state, context);
  if (utilityGap) {
    return {
      severity: 'warning',
      title: `Utility service is cut at ${context.label}`,
      evidence: utilityGap.evidence,
      remedy: utilityGap.remedy,
      implicatedTile: utilityGap.tile,
      metricCode: 'utility-maintenance-access'
    };
  }

  // 8. Long staging runs and currently stalled cargo staff access.
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

  // 9. Boarding distance. Duration alone cannot tell a jammed throat from a
  // collar that simply sits a long walk from where the passengers were, so
  // this reports the measured route once nothing is actually blocking it.
  const boardingMeasure = measureInterfaceBoarding(state, context.identity);
  if (boardingMeasure.activeBoarders > 0 && boardingMeasure.longestRouteTiles >= 12) {
    const tile = boardingMeasure.farthestBoarderTile ?? context.anchorTile;
    const averageCompleted = boardingMeasure.completedBoardings > 0
      ? ` Last ${boardingMeasure.completedBoardings} boarding${boardingMeasure.completedBoardings === 1 ? '' : 's'} here averaged ${Math.round(boardingMeasure.completedSeconds / boardingMeasure.completedBoardings)}s over ${Math.round(boardingMeasure.completedRouteTiles / boardingMeasure.completedBoardings)} tiles.`
      : '';
    return {
      severity: 'notice',
      title: `Boarding walk is long at ${context.label}`,
      evidence: `${boardingMeasure.activeBoarders} boarding passenger${boardingMeasure.activeBoarders === 1 ? '' : 's'}; the farthest still owes ${boardingMeasure.longestRouteTiles} tiles from ${tileLabel(state, tile)} after ${Math.ceil(boardingMeasure.longestWaitSeconds)}s.${averageCompleted}`,
      remedy: context.identity.kind === 'berth'
        ? 'Move the boarding lounge nearer the Gangway or add a Gangway on the occupied side.'
        : 'Move the boarding lounge nearer the Pod Dock or add a dock closer to it.',
      implicatedTile: tile,
      metricCode: 'boarding-distance'
    };
  }

  // 10. Approach wait/overstay.
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

export function deriveInterfaceDiagnosis(state: StationState, identity: InterfaceIdentity): InterfaceDiagnosis {
  let stateCache = diagnosisCache.get(state);
  if (!stateCache) {
    stateCache = new Map();
    diagnosisCache.set(state, stateCache);
  }
  const key = identityKey(identity);
  const relevant = relevantChangeSignature(state, identity);
  const trafficBucket = relevant.sustainedTraffic
    ? Math.floor(state.now / DIAGNOSIS_TRAFFIC_REFRESH_SECONDS)
    : 0;
  const cached = stateCache.get(key);
  if (
    cached &&
    cached.relevantSignature === relevant.value &&
    cached.trafficBucket === trafficBucket
  ) {
    diagnosisCacheStats.hits += 1;
    return cached.diagnosis;
  }
  const diagnosis = computeInterfaceDiagnosis(state, identity);
  diagnosisCacheStats.builds += 1;
  stateCache.set(key, { relevantSignature: relevant.value, trafficBucket, diagnosis });
  return diagnosis;
}

/**
 * World labels are read over a 32px tile, so each metric gets a caption short
 * enough to sit on one chip rather than reusing the panel title.
 */
const INTERFACE_FOCUS_CAPTIONS: Record<InterfaceDiagnosisMetricCode, string> = {
  'boarding-late': 'Boarding late',
  'queue-crosses-door': 'Queue on door',
  'queue-blocks-access': 'Queue blocks access',
  'cargo-public-crossing': 'Cargo in public',
  'passenger-transfer-slow': 'Transfer slow',
  'service-capacity-reached': 'Service full',
  'service-access-blocked': 'Service cut off',
  'utility-maintenance-access': 'Service access cut',
  'freight-staging-distance': 'Staging far',
  'staff-access-stalled': 'Staff blocked',
  'boarding-distance': 'Long boarding walk',
  'approach-wait': 'Waiting to approach',
  'berth-overstay': 'Overdue',
  healthy: 'Interface OK'
};

/**
 * Everything a world highlight needs for the currently selected interface. The
 * panel already answers "what is wrong"; this answers "where", so the two never
 * disagree — both read the same diagnosis.
 */
export interface InterfaceDiagnosisFocus {
  identity: InterfaceIdentity;
  diagnosis: InterfaceDiagnosis;
  /** Short caption, sized for a one-tile chip at gameplay zoom. */
  caption: string;
  /** The tile the diagnosis blames, if it named one. */
  implicatedTile: number | null;
  /** The interface footprint itself, so the highlight always has an anchor. */
  interfaceTiles: number[];
  /** The offending route, queue, or door run behind the diagnosis. */
  routeTiles: number[];
}

let selectedInterface: InterfaceIdentity | null = null;

/**
 * Contextual UI owns which interface is open; rendering only needs to know
 * that one is. Kept beside the diagnosis rather than on `StationState` so the
 * renderer never has a reason to write into simulation state.
 */
export function setSelectedInterface(identity: InterfaceIdentity | null): void {
  selectedInterface = identity;
}

export function getSelectedInterface(): InterfaceIdentity | null {
  return selectedInterface;
}

/** Route, queue, or door tiles the current diagnosis is actually about. */
function focusRouteTiles(state: StationState, context: InterfaceContext, diagnosis: InterfaceDiagnosis): number[] {
  const passengers = passengersFor(state, context.ship);
  switch (diagnosis.metricCode) {
    case 'boarding-late':
    case 'queue-crosses-door':
    case 'queue-blocks-access':
    case 'passenger-transfer-slow':
    case 'boarding-distance':
      return transferVisitors(passengers).flatMap((visitor) => [
        visitor.transferQueueTile,
        visitor.transferStationTile,
        visitor.transferBlockedTile,
        visitor.tileIndex
      ].filter((tile): tile is number => tile !== null && tile !== undefined));
    case 'cargo-public-crossing':
    case 'staff-access-stalled':
    case 'freight-staging-distance':
      return cargoJobsFor(state, context.ship)
        .flatMap((job) => state.crewMembers.filter((crew) => crew.activeJobId === job.id))
        .flatMap((crew) => crew.path);
    case 'service-capacity-reached':
    case 'service-access-blocked':
      return passengers
        .filter((visitor) => visitor.transferPhase === 'station')
        .flatMap((visitor) => [visitor.queueProviderTile, visitor.tileIndex])
        .filter((tile): tile is number => tile !== null && tile !== undefined);
    default:
      return [];
  }
}

/**
 * Resolve the selected interface into a drawable highlight. Returns null when
 * nothing is selected or the selection has been built over, which is the same
 * condition the panel reports as "no longer available".
 */
export function getSelectedInterfaceFocus(state: StationState): InterfaceDiagnosisFocus | null {
  if (!selectedInterface) return null;
  const context = contextFor(state, selectedInterface);
  if (!context) return null;
  const diagnosis = deriveInterfaceDiagnosis(state, selectedInterface);
  const interfaceTiles = [...new Set([context.anchorTile, ...context.accessTiles])].filter(
    (tile) => tile >= 0 && tile < state.tiles.length
  );
  const implicatedTile = diagnosis.implicatedTile ?? null;
  const routeTiles = [...new Set(focusRouteTiles(state, context, diagnosis))].filter(
    (tile) => tile >= 0 && tile < state.tiles.length && tile !== implicatedTile
  );
  return {
    identity: context.identity,
    diagnosis,
    caption: INTERFACE_FOCUS_CAPTIONS[diagnosis.metricCode],
    implicatedTile,
    interfaceTiles,
    routeTiles
  };
}
