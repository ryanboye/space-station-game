import {
  blockPodFreight,
  completeCourierHandling,
  createCourierHandling,
  createSupplierDelivery,
  expirePodFreight,
  markPodFreightArrived,
  unloadSupplierDelivery,
  validatePodFreightOperation
} from '../src/sim/pod-freight';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function testSupplierOwnershipStartsAfterUnload(): void {
  const order = createSupplierDelivery({
    id: 'supplier-1',
    stockKind: 'travel-supplies',
    units: 12,
    landedUnitCost: 3,
    orderedAt: 10
  });
  assert(order.ownedInventoryDelta === 0, 'Placing an order must not create station inventory.');
  assert(order.economyEvents.length === 1 && order.economyEvents[0].credits === -36, 'Supplier order must charge the player once.');
  const arrived = markPodFreightArrived(order.operation, 7, 30);
  assert(arrived.operation.status === 'arrived' && arrived.operation.arrivedUnits === 12, 'Supplier order did not arrive intact.');
  const partial = unloadSupplierDelivery(arrived.operation, 8, 5, 35);
  assert(partial.ownedInventoryDelta === 5 && partial.operation.unloadedUnits === 5, 'Supplier inventory should only appear after physical unload.');
  assert(partial.operation.status === 'unloading', 'Partial unload should remain active.');
  const blocked = unloadSupplierDelivery(partial.operation, 7, 0, 36);
  assert(blocked.operation.status === 'blocked' && blocked.ownedInventoryDelta === 0, 'Full storage must delay supplier delivery.');
  const completed = unloadSupplierDelivery(blocked.operation, 7, 7, 40);
  assert(completed.operation.status === 'complete' && completed.ownedInventoryDelta === 7, 'Supplier delivery did not complete after capacity freed.');
  assert(validatePodFreightOperation(completed.operation) === null, 'Completed supplier delivery violated invariants.');
}

function testCourierNeverCreatesInventoryOrDoublePays(): void {
  const courier = createCourierHandling({
    id: 'courier-1',
    stockKind: 'raw-materials',
    direction: 'transfer',
    units: 4,
    handlingFeePerUnit: 2.5,
    arrivedAt: 12
  });
  const first = completeCourierHandling(courier, 2, 18);
  assert(first.ownedInventoryDelta === 0, 'Courier cargo must never enter station-owned inventory.');
  assert(first.economyEvents.length === 1 && first.economyEvents[0].credits === 5, 'Courier fee should reflect completed units only.');
  const second = completeCourierHandling(first.operation, 4, 21);
  assert(second.operation.status === 'complete' && second.operation.completedUnits === 4, 'Courier handling did not complete.');
  assert(second.ownedInventoryDelta === 0, 'Completed courier cargo entered station inventory.');
  assert(second.economyEvents.length === 1 && second.economyEvents[0].credits === 5, 'Courier fee should settle only newly completed units.');
  const repeat = completeCourierHandling(second.operation, 1, 22);
  assert(repeat.economyEvents.length === 0 && !repeat.changed, 'Completed courier handling must not pay twice.');
  assert(validatePodFreightOperation(second.operation) === null, 'Completed courier handling violated invariants.');
}

function testTerminalOperationsDoNotMutate(): void {
  const courier = createCourierHandling({
    id: 'courier-terminal',
    stockKind: 'fuel',
    direction: 'outbound',
    units: 3,
    handlingFeePerUnit: 1,
    arrivedAt: 1
  });
  const blocked = blockPodFreight(courier, 'locker occupied');
  assert(blocked.operation.status === 'blocked', 'Block transition was not retained.');
  const expired = expirePodFreight(blocked.operation);
  assert(expired.operation.status === 'expired', 'Expiry transition was not retained.');
  const repeat = expirePodFreight(expired.operation);
  assert(!repeat.changed, 'Terminal operation changed after repeat expiry.');
}

const cases: Array<[string, () => void]> = [
  ['supplier ownership begins at unload', testSupplierOwnershipStartsAfterUnload],
  ['courier is consigned and settles once', testCourierNeverCreatesInventoryOrDoublePays],
  ['terminal freight operations are stable', testTerminalOperationsDoNotMutate]
];

for (const [name, run] of cases) {
  run();
  console.log(`PASS ${name}`);
}
