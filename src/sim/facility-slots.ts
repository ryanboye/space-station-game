/**
 * The shared physical-slot contract.
 *
 * Every depicted position on a fixture — a stool, a seat, a bed, a register, a
 * wash stall, a staff work spot — is one exclusive reservation held for a tuned
 * session duration. This module is the single place that decides:
 *
 *   - what a slot of a given role is called on the wire (`slotTargetId`);
 *   - how long a session on it lasts (`FACILITY_SESSIONS`);
 *   - whether a guest or only staff may hold it;
 *   - and, when a facility cannot serve, which single reason to report first.
 *
 * It deliberately owns no simulation loop. `sim.ts` still drives actors; this
 * module gives every facility the same vocabulary so a bar, a shelf, a wash
 * bank and a reception desk cannot each invent their own rules.
 *
 * Exclusivity itself is enforced by `tryCreateReservation`: reservations of
 * kind 'provider-slot' and 'seat-use-slot' are mutually exclusive per tile
 * regardless of their targetId, so two actors can never occupy one depicted
 * position even when they arrive through different systems.
 */

import {
  isStaffFacilitySlotRole,
  resolveFacilitySlots,
  type FacilitySlotRole,
  type ResolvedFacilitySlot
} from './facility-descriptors';
import {
  ModuleType,
  type ModuleInstance,
  type Reservation,
  type ReservationKind,
  type ReservationOwnerKind,
  type StationState
} from './types';

/**
 * This module stays free of any `./sim` import on purpose: `sim.ts` calls into
 * it, so a dependency back the other way would make the two mutually
 * recursive at module-init time. Claiming a slot is therefore expressed as a
 * plain reservation *request* that sim.ts hands to `tryCreateReservation`.
 */

/**
 * The one blocked reason a facility reports. Ordered by how actionable it is:
 * a player can restock faster than they can re-plan a route, and a route is
 * easier to fix than a utility outage.
 */
export type FacilityBlockedReason =
  | 'no-stock'
  | 'no-staff'
  | 'no-free-provider'
  | 'no-free-seat'
  | 'delivery-route-blocked'
  | 'public-route-blocked'
  | 'utility-failure';

/** Player-facing text. Kept here so world chips and inspectors never diverge. */
export const FACILITY_BLOCKED_LABEL: Record<FacilityBlockedReason, string> = {
  'no-stock': 'out of stock',
  'no-staff': 'unstaffed',
  'no-free-provider': 'every service position busy',
  'no-free-seat': 'no free seat',
  'delivery-route-blocked': 'restock route blocked',
  'public-route-blocked': 'customer route blocked',
  'utility-failure': 'no power or water'
};

/**
 * Reported in this order, so the answer is always the most fixable cause that
 * is actually true rather than whichever check happened to run last.
 */
export const FACILITY_BLOCKED_PRIORITY: readonly FacilityBlockedReason[] = [
  'utility-failure',
  'no-stock',
  'no-staff',
  'no-free-provider',
  'no-free-seat',
  'delivery-route-blocked',
  'public-route-blocked'
];

/** Pick the most actionable true reason from a set of observations. */
export function firstBlockedReason(
  observed: Partial<Record<FacilityBlockedReason, boolean>>
): FacilityBlockedReason | null {
  for (const reason of FACILITY_BLOCKED_PRIORITY) {
    if (observed[reason]) return reason;
  }
  return null;
}

export interface FacilitySessionSpec {
  /** How long one use of this position takes, before service-rate modifiers. */
  durationSec: number;
  /** Reservation kind. Seats use 'seat-use-slot' so seat metrics stay separable. */
  kind: ReservationKind;
  /** How long the claim survives without progress before the sweeper reclaims it. */
  ttlSec: number;
}

/**
 * Tuned session lengths per role. These are the durations a player watches:
 * a wash is long, a checkout is short, a bar stool sits between them.
 */
export const FACILITY_SESSIONS: Record<FacilitySlotRole, FacilitySessionSpec> = {
  browse: { durationSec: 4.5, kind: 'provider-slot', ttlSec: 75 },
  checkout: { durationSec: 2.4, kind: 'provider-slot', ttlSec: 75 },
  'checkout-staff': { durationSec: 0, kind: 'provider-slot', ttlSec: 120 },
  'temporary-sleep': { durationSec: 18, kind: 'provider-slot', ttlSec: 90 },
  stock: { durationSec: 2.2, kind: 'provider-slot', ttlSec: 120 },
  'bar-service': { durationSec: 3.6, kind: 'provider-slot', ttlSec: 70 },
  'bar-staff': { durationSec: 0, kind: 'provider-slot', ttlSec: 120 },
  seat: { durationSec: 9.5, kind: 'seat-use-slot', ttlSec: 95 },
  'meal-pickup': { durationSec: 2.8, kind: 'provider-slot', ttlSec: 70 },
  'meal-staff': { durationSec: 0, kind: 'provider-slot', ttlSec: 120 },
  reception: { durationSec: 3.2, kind: 'provider-slot', ttlSec: 60 },
  'reception-staff': { durationSec: 0, kind: 'provider-slot', ttlSec: 120 },
  hygiene: { durationSec: 6.2, kind: 'provider-slot', ttlSec: 85 }
};

/**
 * The wire name for a claim on one depicted position.
 *
 * Namespaced by role and module so two fixtures can expose a slot with the
 * same local id, and so a release pass can find every claim of one role
 * without scanning tiles.
 */
export function slotTargetId(role: FacilitySlotRole, moduleId: number, slotId: string): string {
  return `facility:${role}:${moduleId}:${slotId}`;
}

/** True when the reservation is a live (unreleased, unexpired) facility claim. */
export function isLiveFacilityClaim(state: StationState, reservation: Reservation): boolean {
  return reservation.releaseReason === null && reservation.expiresAt > state.now;
}

export interface FacilitySlotTarget extends ResolvedFacilitySlot {
  moduleId: number;
  moduleType: ModuleType;
  moduleOriginTile: number;
}

/** Every depicted position of a role on one module instance. */
export function slotsOnModule(
  state: StationState,
  module: ModuleInstance,
  role: FacilitySlotRole
): FacilitySlotTarget[] {
  return resolveFacilitySlots(module, state.width)
    .filter((slot) => slot.role === role)
    .map((slot) => ({
      ...slot,
      moduleId: module.id,
      moduleType: module.type,
      moduleOriginTile: module.originTile
    }));
}

/** Every depicted position of a role across a set of module types. */
export function slotsOfRole(
  state: StationState,
  moduleTypes: readonly ModuleType[],
  role: FacilitySlotRole
): FacilitySlotTarget[] {
  const wanted = new Set(moduleTypes);
  const out: FacilitySlotTarget[] = [];
  for (const module of state.moduleInstances) {
    if (!wanted.has(module.type)) continue;
    out.push(...slotsOnModule(state, module, role));
  }
  return out.sort((a, b) => a.tileIndex - b.tileIndex || a.id.localeCompare(b.id));
}

/**
 * Is this exact position already held by somebody else?
 *
 * Checks the tile, not the targetId, because physical exclusivity is about the
 * square an actor stands on: a seat claim and a leisure claim on one tile are
 * the same occupied chair.
 */
export function slotIsOccupied(
  state: StationState,
  tileIndex: number,
  exceptOwnerId?: number | string
): boolean {
  return state.reservations.some(
    (reservation) =>
      isLiveFacilityClaim(state, reservation) &&
      reservation.targetTile === tileIndex &&
      (reservation.kind === 'provider-slot' || reservation.kind === 'seat-use-slot') &&
      reservation.ownerId !== exceptOwnerId
  );
}

/** Free positions of a role, in a stable order. */
export function freeSlotsOfRole(
  state: StationState,
  moduleTypes: readonly ModuleType[],
  role: FacilitySlotRole,
  exceptOwnerId?: number | string
): FacilitySlotTarget[] {
  return slotsOfRole(state, moduleTypes, role).filter(
    (slot) => !slotIsOccupied(state, slot.tileIndex, exceptOwnerId)
  );
}

export interface ClaimSlotRequest {
  ownerKind: ReservationOwnerKind;
  ownerId: number | string;
  slot: FacilitySlotTarget;
  /** Overrides the role's default TTL for an unusually long session. */
  ttlSec?: number;
  /** Release the owner's other claims of the same reservation kind first. */
  replace?: boolean;
}

export interface SlotReservationRequest {
  ownerKind: ReservationOwnerKind;
  ownerId: number | string;
  kind: ReservationKind;
  targetTile: number;
  targetId: string;
  amount: number;
  capacity: number;
  ttlSec: number;
  replaceOwnerReservations: boolean;
}

/**
 * Build the reservation that takes one depicted position for a session.
 *
 * Returns null when the role is a staff work position and the claimant is not
 * staff, which is what stops a guest standing behind the bar just because the
 * tile happened to be free.
 */
export function buildSlotReservationRequest(request: ClaimSlotRequest): SlotReservationRequest | null {
  const { slot } = request;
  const spec = FACILITY_SESSIONS[slot.role];
  if (isStaffFacilitySlotRole(slot.role) && request.ownerKind !== 'crew' && request.ownerKind !== 'system') {
    return null;
  }
  return {
    ownerKind: request.ownerKind,
    ownerId: request.ownerId,
    kind: spec.kind,
    targetTile: slot.tileIndex,
    targetId: slotTargetId(slot.role, slot.moduleId, slot.id),
    amount: 1,
    capacity: 1,
    ttlSec: request.ttlSec ?? spec.ttlSec,
    replaceOwnerReservations: request.replace ?? false
  };
}

/** The live facility claim this owner holds, if any. */
export function facilityClaimFor(
  state: StationState,
  ownerKind: ReservationOwnerKind,
  ownerId: number | string,
  role?: FacilitySlotRole
): Reservation | null {
  const prefix = role ? `facility:${role}:` : 'facility:';
  return (
    state.reservations.find(
      (reservation) =>
        reservation.ownerKind === ownerKind &&
        reservation.ownerId === ownerId &&
        isLiveFacilityClaim(state, reservation) &&
        typeof reservation.targetId === 'string' &&
        reservation.targetId.startsWith(prefix)
    ) ?? null
  );
}

/**
 * Anti-oscillation guard.
 *
 * An actor that already holds a valid claim on a position it can still reach
 * must not be re-routed to an equivalent one. Without this, two equally good
 * fixtures make an actor flip between them forever and never sit down.
 */
export function shouldKeepExistingClaim(
  state: StationState,
  ownerKind: ReservationOwnerKind,
  ownerId: number | string,
  isReachable: (tileIndex: number) => boolean
): Reservation | null {
  const claim = facilityClaimFor(state, ownerKind, ownerId);
  if (!claim || claim.targetTile === null) return null;
  if (!isReachable(claim.targetTile)) return null;
  return claim;
}

/**
 * Does this tile still host the position the claim was made against?
 *
 * A claim survives its fixture being moved, sold or repainted only until this
 * says otherwise — which is how a stale claim on a deleted bar gets collected.
 */
export function claimTargetStillExists(state: StationState, reservation: Reservation): boolean {
  const targetId = reservation.targetId;
  if (typeof targetId !== 'string' || !targetId.startsWith('facility:')) return true;
  const [, , moduleIdRaw, ...slotIdParts] = targetId.split(':');
  const moduleId = Number.parseInt(moduleIdRaw, 10);
  if (!Number.isFinite(moduleId)) return false;
  const module = state.moduleInstances.find((instance) => instance.id === moduleId);
  if (!module) return false;
  const slotId = slotIdParts.join(':');
  return resolveFacilitySlots(module, state.width).some(
    (slot) => slot.id === slotId && slot.tileIndex === reservation.targetTile
  );
}

/**
 * Sweep claims whose fixture no longer exposes that position.
 *
 * Deleting a module already releases claims on its tiles, but moving one and
 * repainting a room do not, so this runs as a cheap safety net and is also the
 * hook save hydration uses after geometry is rebuilt. Returns how many it cleared.
 */
export function releaseOrphanedFacilityClaims(state: StationState): number {
  let cleared = 0;
  for (const reservation of state.reservations) {
    if (!isLiveFacilityClaim(state, reservation)) continue;
    if (typeof reservation.targetId !== 'string' || !reservation.targetId.startsWith('facility:')) continue;
    if (claimTargetStillExists(state, reservation)) continue;
    reservation.releaseReason = 'cleared';
    cleared += 1;
  }
  return cleared;
}

export interface FacilityCapacityReport {
  /** Depicted public positions on this facility. */
  publicSlots: number;
  /** Depicted staff work positions. */
  staffSlots: number;
  /** Public positions currently held. */
  publicInUse: number;
  /** Staff positions currently held by a worker. */
  staffed: number;
}

/** What the world chip and inspector both read. Capacity is never guessed. */
export function facilityCapacity(
  state: StationState,
  module: ModuleInstance,
  publicRoles: readonly FacilitySlotRole[],
  staffRoles: readonly FacilitySlotRole[]
): FacilityCapacityReport {
  const count = (roles: readonly FacilitySlotRole[]): FacilitySlotTarget[] =>
    roles.flatMap((role) => slotsOnModule(state, module, role));
  const publicSlots = count(publicRoles);
  const staffSlots = count(staffRoles);
  return {
    publicSlots: publicSlots.length,
    staffSlots: staffSlots.length,
    publicInUse: publicSlots.filter((slot) => slotIsOccupied(state, slot.tileIndex)).length,
    staffed: staffSlots.filter((slot) => slotIsOccupied(state, slot.tileIndex)).length
  };
}
