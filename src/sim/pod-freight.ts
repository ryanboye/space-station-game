/**
 * Pure, serializable state for pod-scale freight. This deliberately does not
 * know about StationState, rooms, or item nodes: port simulation supplies the
 * actual capacity and applies the returned inventory delta.
 */

export type PodFreightStockKind = 'travel-supplies' | 'prepared-meals' | 'fuel' | 'raw-materials';
export type PodFreightStatus =
  | 'ordered'
  | 'arrived'
  | 'unloading'
  | 'blocked'
  | 'complete'
  | 'partial'
  | 'cancelled'
  | 'expired';

export type PodFreightDirection = 'inbound' | 'outbound' | 'transfer';

export type PodFreightEventKind = 'supplier-purchase' | 'courier-fee';

/** Shape-compatible with the planned shared EconomyEvent, without coupling this pure module to game state. */
export interface PodFreightEconomyEventIntent {
  kind: PodFreightEventKind;
  /** Positive is station revenue; negative is a station expense. */
  credits: number;
  /** The goods cost represented by this transaction, never an inventory delta. */
  costBasis: number;
  label: string;
  sourceId?: number;
  tileIndex?: number;
}

export interface SupplierDelivery {
  id: string;
  kind: 'supplier-delivery';
  status: PodFreightStatus;
  stockKind: PodFreightStockKind;
  orderedUnits: number;
  arrivedUnits: number;
  unloadedUnits: number;
  landedUnitCost: number;
  orderedAt: number;
  arrivedAt: number | null;
  completedAt: number | null;
  blockedReason: string | null;
  dockId: number | null;
  /** Credits were charged once, at order placement. */
  purchaseRecorded: boolean;
}

export interface CourierHandling {
  id: string;
  kind: 'courier-handling';
  status: PodFreightStatus;
  stockKind: PodFreightStockKind;
  direction: PodFreightDirection;
  consignedUnits: number;
  completedUnits: number;
  settledUnits: number;
  handlingFeePerUnit: number;
  arrivedAt: number;
  completedAt: number | null;
  blockedReason: string | null;
  dockId: number | null;
}

export type PodFreightOperation = SupplierDelivery | CourierHandling;

export interface PodFreightTransition<T extends PodFreightOperation = PodFreightOperation> {
  operation: T;
  /** Apply to station-owned inventory. Courier operations always return zero. */
  ownedInventoryDelta: number;
  /** Append these to the shared economy ledger during integration. */
  economyEvents: PodFreightEconomyEventIntent[];
  changed: boolean;
}

export interface CreateSupplierDeliveryParams {
  id: string;
  stockKind: PodFreightStockKind;
  units: number;
  landedUnitCost: number;
  orderedAt: number;
}

export interface CreateCourierHandlingParams {
  id: string;
  stockKind: PodFreightStockKind;
  direction: PodFreightDirection;
  units: number;
  handlingFeePerUnit: number;
  arrivedAt: number;
}

function nonNegativeFinite(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be a finite non-negative number.`);
  return value;
}

function positiveFinite(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be a finite positive number.`);
  return value;
}

function cloneSupplier(operation: SupplierDelivery): SupplierDelivery {
  return { ...operation };
}

function cloneCourier(operation: CourierHandling): CourierHandling {
  return { ...operation };
}

function unchanged<T extends PodFreightOperation>(operation: T): PodFreightTransition<T> {
  return { operation, ownedInventoryDelta: 0, economyEvents: [], changed: false };
}

function supplierPurchaseIntent(delivery: SupplierDelivery): PodFreightEconomyEventIntent {
  const cost = delivery.orderedUnits * delivery.landedUnitCost;
  return {
    kind: 'supplier-purchase',
    credits: -cost,
    costBasis: cost,
    label: `Ordered ${delivery.orderedUnits} ${delivery.stockKind}`
  };
}

function courierFeeIntent(operation: CourierHandling, units: number): PodFreightEconomyEventIntent {
  const credits = units * operation.handlingFeePerUnit;
  return {
    kind: 'courier-fee',
    credits,
    costBasis: 0,
    label: `Handled ${units}/${operation.consignedUnits} ${operation.stockKind}`
  };
}

/** Supplier goods are paid for up front but remain off-station until unloaded. */
export function createSupplierDelivery(params: CreateSupplierDeliveryParams): PodFreightTransition<SupplierDelivery> {
  positiveFinite(params.units, 'Supplier units');
  nonNegativeFinite(params.landedUnitCost, 'Landed unit cost');
  nonNegativeFinite(params.orderedAt, 'Order time');
  if (!params.id) throw new Error('Supplier delivery id is required.');
  const operation: SupplierDelivery = {
    id: params.id,
    kind: 'supplier-delivery',
    status: 'ordered',
    stockKind: params.stockKind,
    orderedUnits: params.units,
    arrivedUnits: 0,
    unloadedUnits: 0,
    landedUnitCost: params.landedUnitCost,
    orderedAt: params.orderedAt,
    arrivedAt: null,
    completedAt: null,
    blockedReason: null,
    dockId: null,
    purchaseRecorded: true
  };
  return { operation, ownedInventoryDelta: 0, economyEvents: [supplierPurchaseIntent(operation)], changed: true };
}

/** Courier goods are consigned. The station never owns, sells, or stores their value. */
export function createCourierHandling(params: CreateCourierHandlingParams): CourierHandling {
  positiveFinite(params.units, 'Courier units');
  nonNegativeFinite(params.handlingFeePerUnit, 'Courier handling fee');
  nonNegativeFinite(params.arrivedAt, 'Arrival time');
  if (!params.id) throw new Error('Courier handling id is required.');
  return {
    id: params.id,
    kind: 'courier-handling',
    status: 'arrived',
    stockKind: params.stockKind,
    direction: params.direction,
    consignedUnits: params.units,
    completedUnits: 0,
    settledUnits: 0,
    handlingFeePerUnit: params.handlingFeePerUnit,
    arrivedAt: params.arrivedAt,
    completedAt: null,
    blockedReason: null,
    dockId: null
  };
}

export function markPodFreightArrived(delivery: SupplierDelivery, dockId: number, now: number): PodFreightTransition<SupplierDelivery> {
  nonNegativeFinite(now, 'Arrival time');
  if (delivery.status !== 'ordered') return unchanged(delivery);
  const operation = cloneSupplier(delivery);
  operation.status = 'arrived';
  operation.arrivedUnits = operation.orderedUnits;
  operation.arrivedAt = now;
  operation.dockId = dockId;
  return { operation, ownedInventoryDelta: 0, economyEvents: [], changed: true };
}

/**
 * Moves supplier stock into a caller-owned storage node. `availableCapacity`
 * is checked for every call, so a full locker delays an order rather than
 * creating invisible inventory.
 */
export function unloadSupplierDelivery(
  delivery: SupplierDelivery,
  requestedUnits: number,
  availableCapacity: number,
  now: number
): PodFreightTransition<SupplierDelivery> {
  positiveFinite(requestedUnits, 'Requested unload units');
  nonNegativeFinite(availableCapacity, 'Available storage capacity');
  nonNegativeFinite(now, 'Unload time');
  if (delivery.status !== 'arrived' && delivery.status !== 'unloading' && delivery.status !== 'blocked') return unchanged(delivery);
  const remaining = Math.max(0, delivery.arrivedUnits - delivery.unloadedUnits);
  if (remaining <= 0) return unchanged(delivery);
  if (availableCapacity <= 0) {
    const operation = cloneSupplier(delivery);
    operation.status = 'blocked';
    operation.blockedReason = 'station storage is full';
    return { operation, ownedInventoryDelta: 0, economyEvents: [], changed: operation.status !== delivery.status || operation.blockedReason !== delivery.blockedReason };
  }
  const moved = Math.min(requestedUnits, availableCapacity, remaining);
  const operation = cloneSupplier(delivery);
  operation.unloadedUnits += moved;
  operation.blockedReason = null;
  operation.status = operation.unloadedUnits >= operation.orderedUnits ? 'complete' : 'unloading';
  if (operation.status === 'complete') operation.completedAt = now;
  return { operation, ownedInventoryDelta: moved, economyEvents: [], changed: moved > 0 };
}

/**
 * Completes consigned cargo work. The returned inventory delta is permanently
 * zero; only newly completed, not-yet-settled units earn a handling fee.
 */
export function completeCourierHandling(
  handling: CourierHandling,
  requestedUnits: number,
  now: number
): PodFreightTransition<CourierHandling> {
  positiveFinite(requestedUnits, 'Requested courier units');
  nonNegativeFinite(now, 'Completion time');
  if (handling.status === 'cancelled' || handling.status === 'expired' || handling.status === 'complete') return unchanged(handling);
  const remaining = Math.max(0, handling.consignedUnits - handling.completedUnits);
  if (remaining <= 0) return unchanged(handling);
  const moved = Math.min(requestedUnits, remaining);
  const operation = cloneCourier(handling);
  operation.completedUnits += moved;
  operation.status = operation.completedUnits >= operation.consignedUnits ? 'complete' : 'partial';
  operation.blockedReason = null;
  if (operation.status === 'complete') operation.completedAt = now;
  const newlySettled = Math.max(0, operation.completedUnits - operation.settledUnits);
  operation.settledUnits += newlySettled;
  return {
    operation,
    ownedInventoryDelta: 0,
    economyEvents: newlySettled > 0 ? [courierFeeIntent(operation, newlySettled)] : [],
    changed: moved > 0
  };
}

export function blockPodFreight<T extends PodFreightOperation>(operation: T, reason: string): PodFreightTransition<T> {
  if (operation.status === 'complete' || operation.status === 'cancelled' || operation.status === 'expired') return unchanged(operation);
  const next = operation.kind === 'supplier-delivery' ? cloneSupplier(operation) : cloneCourier(operation);
  next.status = 'blocked';
  next.blockedReason = reason || 'freight operation blocked';
  return { operation: next as T, ownedInventoryDelta: 0, economyEvents: [], changed: next.status !== operation.status || next.blockedReason !== operation.blockedReason };
}

export function expirePodFreight<T extends PodFreightOperation>(operation: T): PodFreightTransition<T> {
  if (operation.status === 'complete' || operation.status === 'cancelled' || operation.status === 'expired') return unchanged(operation);
  const next = operation.kind === 'supplier-delivery' ? cloneSupplier(operation) : cloneCourier(operation);
  next.status = 'expired';
  next.blockedReason = 'carrier departed before completion';
  return { operation: next as T, ownedInventoryDelta: 0, economyEvents: [], changed: true };
}

/** Runtime validation for hydrators and focused integration assertions. */
export function validatePodFreightOperation(operation: PodFreightOperation): string | null {
  if (!operation.id) return 'operation id is required';
  if (operation.kind === 'supplier-delivery') {
    if (operation.orderedUnits <= 0) return 'supplier order must contain units';
    if (operation.arrivedUnits < 0 || operation.arrivedUnits > operation.orderedUnits) return 'supplier arrival units are invalid';
    if (operation.unloadedUnits < 0 || operation.unloadedUnits > operation.arrivedUnits) return 'supplier unloaded units are invalid';
    if (operation.status === 'complete' && operation.unloadedUnits !== operation.orderedUnits) return 'completed supplier delivery has missing units';
    return null;
  }
  if (operation.consignedUnits <= 0) return 'courier consignment must contain units';
  if (operation.completedUnits < 0 || operation.completedUnits > operation.consignedUnits) return 'courier completed units are invalid';
  if (operation.settledUnits < 0 || operation.settledUnits > operation.completedUnits) return 'courier settled units are invalid';
  if (operation.status === 'complete' && operation.completedUnits !== operation.consignedUnits) return 'completed courier handling has missing units';
  return null;
}
