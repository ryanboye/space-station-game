/**
 * Pure custody model for transient-passenger luggage.
 *
 * This module deliberately does not depend on StationState, TransportJob, or
 * ItemType. Luggage belongs to a passenger/ship pair, not to the station's
 * fungible cargo inventory. Integration code may project these jobs onto crew
 * movement, but this ledger remains the authority for identity and custody.
 */

export type LuggageLeg = 'inbound' | 'outbound';
export type LuggagePhase =
  | 'aboard'
  | 'inbound-transit'
  | 'claim'
  | 'outbound-transit'
  | 'returned';

export type LuggageLocation =
  | { kind: 'ship'; tile: number }
  | { kind: 'claim'; tile: number }
  | { kind: 'loose'; tile: number }
  | { kind: 'carrier'; carrierId: number };

export interface PassengerLuggage {
  /** Stable identity: one bag for one passenger on one ship. */
  id: string;
  shipId: number;
  passengerId: number;
  shipTile: number;
  claimTile: number | null;
  phase: LuggagePhase;
  location: LuggageLocation;
  /** Set when boarding begins; survives an inbound transfer still in flight. */
  returnRequested: boolean;
  /** A stranded passenger's bag remains available at claim and stops dispatching. */
  passengerStranded: boolean;
}
export type LuggageJobState = 'pending' | 'carried' | 'completed' | 'cancelled';

export interface LuggageTransferJob {
  /** Stable per bag/leg. Retrying never creates a second logical job. */
  id: string;
  luggageId: string;
  leg: LuggageLeg;
  fromTile: number;
  toTile: number;
  state: LuggageJobState;
  carrierId: number | null;
}

/** Minimal save-facing carrier link. Actor position remains simulation-owned. */
export interface LuggageCarrierLink {
  carrierId: number;
  luggageId: string;
  jobId: string;
  leg: LuggageLeg;
}

export interface LuggageCustodyState {
  bags: PassengerLuggage[];
  jobs: LuggageTransferJob[];
  carriers: LuggageCarrierLink[];
}

export interface ManifestLuggageInput {
  shipId: number;
  shipTile: number;
  passengerIds: readonly number[];
  /** null means this visit has no Arrival Desk and luggage stays aboard. */
  arrivalDeskTile: number | null;
}

export interface LuggageReconcileInput {
  bags: readonly PassengerLuggage[];
  jobs: readonly LuggageTransferJob[];
  carriers: readonly LuggageCarrierLink[];
}

const EMPTY_STATE: LuggageCustodyState = { bags: [], jobs: [], carriers: [] };

export function luggageIdentity(shipId: number, passengerId: number): string {
  return `luggage:${shipId}:${passengerId}`;
}

export function luggageJobIdentity(luggageId: string, leg: LuggageLeg): string {
  return `${luggageId}:${leg}`;
}

function shipLocation(tile: number): LuggageLocation {
  return { kind: 'ship', tile };
}

function claimLocation(tile: number): LuggageLocation {
  return { kind: 'claim', tile };
}

function carrierLocation(carrierId: number): LuggageLocation {
  return { kind: 'carrier', carrierId };
}

function looseLocation(tile: number): LuggageLocation {
  return { kind: 'loose', tile };
}

function cloneBag(bag: PassengerLuggage): PassengerLuggage {
  return { ...bag, location: { ...bag.location } };
}

function cloneState(state: LuggageCustodyState): LuggageCustodyState {
  return {
    bags: state.bags.map(cloneBag),
    jobs: state.jobs.map((job) => ({ ...job })),
    carriers: state.carriers.map((carrier) => ({ ...carrier }))
  };
}

function sortState(state: LuggageCustodyState): LuggageCustodyState {
  state.bags.sort((a, b) => a.shipId - b.shipId || a.passengerId - b.passengerId || a.id.localeCompare(b.id));
  state.jobs.sort((a, b) => a.id.localeCompare(b.id));
  state.carriers.sort((a, b) => a.carrierId - b.carrierId || a.jobId.localeCompare(b.jobId));
  return state;
}

function jobTiles(bag: PassengerLuggage, leg: LuggageLeg): { fromTile: number; toTile: number } {
  if (bag.claimTile === null) return { fromTile: bag.shipTile, toTile: bag.shipTile };
  return leg === 'inbound'
    ? { fromTile: bag.shipTile, toTile: bag.claimTile }
    : { fromTile: bag.claimTile, toTile: bag.shipTile };
}

function upsertJob(
  state: LuggageCustodyState,
  bag: PassengerLuggage,
  leg: LuggageLeg,
  wantedState: LuggageJobState,
  carrierId: number | null = null,
  fromTileOverride?: number
): LuggageTransferJob {
  const id = luggageJobIdentity(bag.id, leg);
  const tiles = jobTiles(bag, leg);
  if (fromTileOverride !== undefined) tiles.fromTile = fromTileOverride;
  let job = state.jobs.find((candidate) => candidate.id === id);
  if (!job) {
    job = { id, luggageId: bag.id, leg, ...tiles, state: wantedState, carrierId };
    state.jobs.push(job);
  } else {
    Object.assign(job, { luggageId: bag.id, leg, ...tiles, state: wantedState, carrierId });
  }
  return job;
}

function removeCarrierLinks(state: LuggageCustodyState, luggageId: string): void {
  state.carriers = state.carriers.filter((carrier) => carrier.luggageId !== luggageId);
}

function cancelLiveJobs(state: LuggageCustodyState, luggageId: string): void {
  for (const job of state.jobs) {
    if (job.luggageId !== luggageId || (job.state !== 'pending' && job.state !== 'carried')) continue;
    job.state = 'cancelled';
    job.carrierId = null;
  }
  removeCarrierLinks(state, luggageId);
}

/** Create a fresh ledger containing exactly one bag per unique passenger. */
export function createManifestLuggage(input: ManifestLuggageInput): LuggageCustodyState {
  return ensureManifestLuggage(EMPTY_STATE, input);
}

/**
 * Idempotently add a manifest to an existing ledger. Safe to call from a tick
 * seam: stable identities prevent duplicate bags and duplicate leg jobs.
 */
export function ensureManifestLuggage(
  existing: LuggageCustodyState,
  input: ManifestLuggageInput
): LuggageCustodyState {
  const state = cloneState(existing);
  const passengerIds = [...new Set(input.passengerIds)].sort((a, b) => a - b);
  for (const passengerId of passengerIds) {
    const id = luggageIdentity(input.shipId, passengerId);
    if (state.bags.some((bag) => bag.id === id)) continue;
    const bag: PassengerLuggage = {
      id,
      shipId: input.shipId,
      passengerId,
      shipTile: input.shipTile,
      claimTile: input.arrivalDeskTile,
      phase: 'aboard',
      location: shipLocation(input.shipTile),
      returnRequested: false,
      passengerStranded: false
    };
    state.bags.push(bag);
    if (input.arrivalDeskTile !== null) upsertJob(state, bag, 'inbound', 'pending');
  }
  return sortState(state);
}
/** Assign one physical carrier. A carrier and a bag may each own only one live link. */
export function assignLuggageCarrier(
  existing: LuggageCustodyState,
  jobId: string,
  carrierId: number
): LuggageCustodyState {
  const state = cloneState(existing);
  const job = state.jobs.find((candidate) => candidate.id === jobId);
  if (!job || (job.state !== 'pending' && job.state !== 'carried')) return sortState(state);
  const bag = state.bags.find((candidate) => candidate.id === job.luggageId);
  if (!bag || bag.passengerStranded || bag.claimTile === null) return sortState(state);

  // Do not steal a carrier or double-carry a bag. Reassignment is idempotent.
  const carrierConflict = state.carriers.some((link) => link.carrierId === carrierId && link.jobId !== job.id);
  const bagConflict = state.carriers.some((link) => link.luggageId === bag.id && link.jobId !== job.id);
  if (carrierConflict || bagConflict) return sortState(state);

  removeCarrierLinks(state, bag.id);
  state.carriers = state.carriers.filter((link) => link.carrierId !== carrierId);
  state.carriers.push({ carrierId, luggageId: bag.id, jobId: job.id, leg: job.leg });
  job.state = 'carried';
  job.carrierId = carrierId;
  bag.phase = job.leg === 'inbound' ? 'inbound-transit' : 'outbound-transit';
  bag.location = carrierLocation(carrierId);
  return sortState(state);
}

/** Complete a leg exactly once. Repeated completion calls are inert. */
export function completeLuggageJob(
  existing: LuggageCustodyState,
  jobId: string
): LuggageCustodyState {
  const state = cloneState(existing);
  const job = state.jobs.find((candidate) => candidate.id === jobId);
  if (!job || job.state === 'completed' || job.state === 'cancelled') return sortState(state);
  const bag = state.bags.find((candidate) => candidate.id === job.luggageId);
  if (!bag || bag.claimTile === null || bag.passengerStranded) return sortState(state);

  job.state = 'completed';
  job.carrierId = null;
  removeCarrierLinks(state, bag.id);
  if (job.leg === 'inbound') {
    bag.phase = 'claim';
    bag.location = claimLocation(bag.claimTile);
    if (bag.returnRequested) upsertJob(state, bag, 'outbound', 'pending');
  } else {
    bag.phase = 'returned';
    bag.location = shipLocation(bag.shipTile);
  }
  return sortState(state);
}

/** Request the same bag back before boarding; no-desk visits remain unblocked. */
export function requestLuggageReturn(
  existing: LuggageCustodyState,
  luggageId: string
): LuggageCustodyState {
  const state = cloneState(existing);
  const bag = state.bags.find((candidate) => candidate.id === luggageId);
  if (!bag || bag.claimTile === null || bag.passengerStranded || bag.phase === 'returned') return sortState(state);
  bag.returnRequested = true;
  if (bag.phase === 'claim') upsertJob(state, bag, 'outbound', 'pending');
  return sortState(state);
}

/**
 * An interrupted handoff drops the bag at the carrier's real current tile and
 * requeues the same stable leg from there. Nothing implicitly reaches claim.
 */
export function interruptLuggageCarrier(
  existing: LuggageCustodyState,
  carrierId: number,
  dropTile: number
): LuggageCustodyState {
  const state = cloneState(existing);
  const link = state.carriers.find((candidate) => candidate.carrierId === carrierId);
  if (!link) return sortState(state);
  const bag = state.bags.find((candidate) => candidate.id === link.luggageId);
  const job = state.jobs.find((candidate) => candidate.id === link.jobId);
  if (!bag || !job || bag.claimTile === null || !Number.isInteger(dropTile) || dropTile < 0) return sortState(state);
  state.carriers = state.carriers.filter((candidate) => candidate.carrierId !== carrierId);
  job.carrierId = null;
  job.state = bag.passengerStranded ? 'cancelled' : 'pending';
  job.fromTile = dropTile;
  bag.location = looseLocation(dropTile);
  bag.phase = job.leg === 'inbound' ? 'inbound-transit' : 'outbound-transit';
  return sortState(state);
}

/** Stop dispatching but preserve the bag at the passenger's physical claim point. */
export function strandPassengerLuggage(
  existing: LuggageCustodyState,
  luggageId: string,
  /** Required to detach a carried bag without teleporting it. */
  carrierDropTile?: number
): LuggageCustodyState {
  const state = cloneState(existing);
  const bag = state.bags.find((candidate) => candidate.id === luggageId);
  if (!bag) return sortState(state);
  if (bag.location.kind === 'carrier') {
    if (carrierDropTile === undefined || !Number.isInteger(carrierDropTile) || carrierDropTile < 0) {
      return sortState(state);
    }
    bag.location = looseLocation(carrierDropTile);
  }
  bag.passengerStranded = true;
  bag.returnRequested = false;
  cancelLiveJobs(state, bag.id);
  if (bag.location.kind === 'claim') {
    bag.phase = 'claim';
  } else if (bag.location.kind === 'ship') {
    bag.phase = 'aboard';
  }
  return sortState(state);
}

/** Boarding is gated only when this visit actually has a physical claim desk. */
export function canPassengerBoardWithLuggage(state: LuggageCustodyState, luggageId: string): boolean {
  const bag = state.bags.find((candidate) => candidate.id === luggageId);
  if (!bag || bag.claimTile === null) return true;
  return bag.phase === 'returned';
}

function carrierFor(
  carriers: readonly LuggageCarrierLink[],
  claimedCarrierIds: Set<number>,
  bag: PassengerLuggage,
  leg: LuggageLeg
): LuggageCarrierLink | null {
  const jobId = luggageJobIdentity(bag.id, leg);
  const candidate = carriers
    .filter((link) => link.luggageId === bag.id && link.jobId === jobId && link.leg === leg)
    .sort((a, b) => a.carrierId - b.carrierId)[0];
  if (!candidate || claimedCarrierIds.has(candidate.carrierId)) return null;
  claimedCarrierIds.add(candidate.carrierId);
  return { ...candidate };
}

/**
 * Rebuild save-time bag/job/carrier relationships from stable identities.
 * Bag phase is the physical truth; invalid or duplicated live links collapse
 * deterministically to claim (or ship when no desk exists), never to inventory.
 */
export function reconcileLuggageCustody(input: LuggageReconcileInput): LuggageCustodyState {
  const uniqueBags = new Map<string, PassengerLuggage>();
  for (const raw of [...input.bags].sort((a, b) => a.id.localeCompare(b.id))) {
    const id = luggageIdentity(raw.shipId, raw.passengerId);
    if (!uniqueBags.has(id)) uniqueBags.set(id, { ...cloneBag(raw), id });
  }

  const state: LuggageCustodyState = { bags: [], jobs: [], carriers: [] };
  const claimedCarrierIds = new Set<number>();
  for (const bag of uniqueBags.values()) {
    state.bags.push(bag);
    if (bag.claimTile === null) {
      bag.phase = 'aboard';
      bag.location = shipLocation(bag.shipTile);
      bag.returnRequested = false;
      continue;
    }
    if (bag.passengerStranded) {
      bag.returnRequested = false;
      let strandedCarrier: LuggageCarrierLink | null = null;
      if (bag.location.kind === 'ship') bag.phase = 'aboard';
      else if (bag.location.kind === 'claim') bag.phase = 'claim';
      else if (bag.location.kind === 'carrier') {
        const leg: LuggageLeg = bag.phase === 'outbound-transit' ? 'outbound' : 'inbound';
        const carrier = carrierFor(input.carriers, claimedCarrierIds, bag, leg);
        if (carrier) {
          state.carriers.push(carrier);
          strandedCarrier = carrier;
        }
        else {
          // No actor owns this claimed carrier after hydration; restore to the
          // conservative physical source for that leg.
          bag.location = leg === 'inbound' ? shipLocation(bag.shipTile) : claimLocation(bag.claimTile);
          bag.phase = leg === 'inbound' ? 'aboard' : 'claim';
        }
      }
      const hadInbound = input.jobs.some((job) => job.luggageId === bag.id && job.leg === 'inbound');
      const hadOutbound = input.jobs.some((job) => job.luggageId === bag.id && job.leg === 'outbound');
      if (strandedCarrier?.leg === 'inbound') {
        upsertJob(state, bag, 'inbound', 'carried', strandedCarrier.carrierId);
      } else if (bag.phase === 'claim' || bag.phase === 'outbound-transit' || bag.phase === 'returned') {
        upsertJob(state, bag, 'inbound', 'completed');
      } else if (hadInbound) {
        const looseTile = bag.location.kind === 'loose' ? bag.location.tile : undefined;
        upsertJob(state, bag, 'inbound', 'cancelled', null, looseTile);
      }
      if (bag.phase === 'returned') {
        upsertJob(state, bag, 'outbound', 'completed');
      } else if (strandedCarrier?.leg === 'outbound') {
        upsertJob(state, bag, 'outbound', 'carried', strandedCarrier.carrierId);
      } else if (hadOutbound) {
        const looseTile = bag.location.kind === 'loose' ? bag.location.tile : undefined;
        upsertJob(state, bag, 'outbound', 'cancelled', null, looseTile);
      }
      continue;
    }

    const persistedOutbound = input.jobs.some((job) =>
      job.luggageId === bag.id && job.leg === 'outbound' && job.state !== 'cancelled'
    );
    if (persistedOutbound) bag.returnRequested = true;

    if (bag.phase === 'returned') {
      bag.location = shipLocation(bag.shipTile);
      upsertJob(state, bag, 'inbound', 'completed');
      upsertJob(state, bag, 'outbound', 'completed');
      continue;
    }

    if (bag.phase === 'outbound-transit') {
      upsertJob(state, bag, 'inbound', 'completed');
      const carrier = carrierFor(input.carriers, claimedCarrierIds, bag, 'outbound');
      if (carrier) {
        state.carriers.push(carrier);
        upsertJob(state, bag, 'outbound', 'carried', carrier.carrierId);
        bag.location = carrierLocation(carrier.carrierId);
      } else if (bag.location.kind === 'loose') {
        upsertJob(state, bag, 'outbound', 'pending', null, bag.location.tile);
      } else {
        bag.phase = 'claim';
        bag.location = claimLocation(bag.claimTile);
        upsertJob(state, bag, 'outbound', 'pending');
      }
      continue;
    }

    if (bag.phase === 'claim') {
      bag.location = claimLocation(bag.claimTile);
      upsertJob(state, bag, 'inbound', 'completed');
      if (bag.returnRequested) upsertJob(state, bag, 'outbound', 'pending');
      continue;
    }

    if (bag.phase === 'inbound-transit') {
      const carrier = carrierFor(input.carriers, claimedCarrierIds, bag, 'inbound');
      if (carrier) {
        state.carriers.push(carrier);
        upsertJob(state, bag, 'inbound', 'carried', carrier.carrierId);
        bag.location = carrierLocation(carrier.carrierId);
      } else if (bag.location.kind === 'loose') {
        upsertJob(state, bag, 'inbound', 'pending', null, bag.location.tile);
      } else {
        // Without a saved loose tile, the only conservative physical truth is
        // that the uncompleted inbound leg still begins aboard the source ship.
        bag.phase = 'aboard';
        bag.location = shipLocation(bag.shipTile);
        upsertJob(state, bag, 'inbound', 'pending');
      }
      continue;
    }

    // Aboard is the only remaining phase.
    bag.phase = 'aboard';
    bag.location = shipLocation(bag.shipTile);
    upsertJob(state, bag, 'inbound', 'pending');
  }
  return sortState(state);
}
