import { hydrateStateFromSave, parseAndMigrateSave, serializeSave } from '../src/sim/save';
import {
  admitTrafficOffer,
  createInitialState,
  getBerthFacilityAt,
  resolvePhysicalHoldingQueue,
  setRoom,
  setTile,
  tick,
  tryPlaceModule
} from '../src/sim/sim';
import {
  ModuleType,
  RoomType,
  TileType,
  type ArrivingShip,
  type PhysicalHoldingQueueEntry,
  type StationState,
  type TrafficOffer
} from '../src/sim/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`physical-holding-queue: ${message}`);
}

function advance(state: StationState, seconds: number): void {
  state.controls.paused = false;
  for (let elapsed = 0; elapsed + 1e-9 < seconds; elapsed += 0.2) {
    tick(state, Math.min(0.2, seconds - elapsed));
  }
}

function podOffer(state: StationState, id: number): TrafficOffer {
  const dock = state.docks.find((entry) =>
    entry.sourceKind === 'pod-dock-module' &&
    entry.purpose === 'visitor' &&
    entry.occupiedByShipId === null
  );
  assert(dock, `fixture needs a free visitor Pod Dock; docks=${state.docks.map((entry) => `${entry.sourceKind}:${entry.purpose}:${entry.occupiedByShipId}`).join(',')}`);
  const shipType = dock.allowedShipTypes.includes('trader') ? 'trader' : dock.allowedShipTypes[0]!;
  return {
    id,
    callsign: `HOLD-${id}`,
    shipName: `Holding Queue Pod ${id}`,
    lane: dock.lane,
    shipType,
    hullVariant: 'courier-pod',
    offerKind: 'passenger',
    size: 'small',
    status: 'holding',
    forecastAt: state.now,
    arrivesAt: state.now,
    expiresAt: state.now + 600,
    passengersTotal: 0,
    manifestDemand: { cafeteria: 0, market: 0, lounge: 0 },
    manifestMix: { diner: 1, shopper: 0, lounger: 0, rusher: 0 },
    hospitalityDemand: { meal: 0, drink: 0, leisure: 0, restroom: 0, hygiene: 0, comfort: 0 },
    inboundCargo: { rawMaterial: 0, rawMeal: 0, tradeGood: 0 },
    outboundRequest: { rawMaterial: 0, meal: 0, tradeGood: 0 },
    requestedServices: [],
    berthTimeSec: 40,
    dockingFee: 0,
    projectedSpend: 0,
    riskLabel: 'low',
    assignedBerthAnchor: null,
    assignedDockSourceKey: null
  };
}

function buildMediumBerth(state: StationState): number {
  const x = 5;
  const y = 5;
  const width = 4;
  const height = 3;
  for (let yy = y; yy < y + height; yy += 1) {
    for (let xx = x; xx < x + width; xx += 1) {
      const tile = yy * state.width + xx;
      setTile(state, tile, TileType.Floor);
      setRoom(state, tile, RoomType.Berth);
    }
  }
  const access = (y + height) * state.width + x + Math.floor(width / 2);
  setTile(state, access, TileType.Floor);
  state.pressurized[access] = true;
  assert(tryPlaceModule(state, ModuleType.BerthControl, (y + 1) * state.width + x + 1).ok, 'Berth Control placement failed');
  assert(tryPlaceModule(state, ModuleType.Gangway, y * state.width + x + 2).ok, 'Gangway placement failed');
  assert(tryPlaceModule(state, ModuleType.DockingClamp, y * state.width + x).ok, 'Docking Clamp placement failed');
  assert(tryPlaceModule(state, ModuleType.DockingClamp, y * state.width + x + 1).ok, 'Second Docking Clamp placement failed');
  tick(state, 0);
  state.pressurized[access] = true;
  const facility = getBerthFacilityAt(state, y * state.width + x);
  assert(facility?.geometryValid, `medium Berth invalid: ${facility?.reasons.join('; ') ?? 'missing'}`);
  return facility.anchorTile;
}

function berthOffer(state: StationState, id: number, berthAnchor: number): TrafficOffer {
  return {
    id,
    callsign: `BERTH-${id}`,
    shipName: `Holding Queue Shuttle ${id}`,
    lane: 'north',
    shipType: 'tourist',
    hullVariant: 'passenger-shuttle',
    offerKind: 'passenger',
    size: 'medium',
    status: 'holding',
    forecastAt: state.now,
    arrivesAt: state.now,
    expiresAt: state.now + 600,
    passengersTotal: 0,
    manifestDemand: { cafeteria: 0, market: 0, lounge: 0 },
    manifestMix: { diner: 1, shopper: 0, lounger: 0, rusher: 0 },
    hospitalityDemand: { meal: 0, drink: 0, leisure: 0, restroom: 0, hygiene: 0, comfort: 0 },
    inboundCargo: { rawMaterial: 0, rawMeal: 0, tradeGood: 0 },
    outboundRequest: { rawMaterial: 0, meal: 0, tradeGood: 0 },
    requestedServices: [],
    berthTimeSec: 40,
    dockingFee: 20,
    projectedSpend: 0,
    riskLabel: 'low',
    assignedBerthAnchor: berthAnchor,
    assignedDockSourceKey: null
  };
}

function mixedPhysicalState(seed: number): {
  state: StationState;
  pod: ArrivingShip;
  berth: ArrivingShip;
} {
  const state = createInitialState({ seed, physicalStarterInventory: true, manualTrafficAdmission: true });
  tick(state, 0);
  state.controls.paused = false;
  const berthAnchor = buildMediumBerth(state);
  const scheduled = berthOffer(state, seed * 10 + 3, berthAnchor);
  state.trafficOffers.push(scheduled);
  const admittedBerth = admitTrafficOffer(state, scheduled.id, berthAnchor);
  assert(admittedBerth.ok, `scheduled Berth offer could not be admitted: ${admittedBerth.reason ?? 'unknown'}`);
  const podManifest = podOffer(state, seed * 10 + 7);
  state.trafficOffers.push(podManifest);
  assert(admitTrafficOffer(state, podManifest.id).ok, 'Pod offer could not be admitted');
  const pod = state.arrivingShips.find((ship) => ship.id === podManifest.id);
  const berth = state.arrivingShips.find((ship) => ship.id === scheduled.id);
  assert(pod?.smallCraftVisit && berth?.portContractId !== undefined, 'Pod/Berth settlement owners were not created');
  return { state, pod, berth };
}

function testSharedQueueDistinctSettlementOwners(): string {
  const { state, pod, berth } = mixedPhysicalState(81501);
  const podRow = state.physicalHoldingQueue.find((entry) => entry.shipId === pod.id);
  const berthRow = state.physicalHoldingQueue.find((entry) => entry.shipId === berth.id);
  assert(podRow?.ownerKind === 'active-ship' && berthRow?.ownerKind === 'active-ship', 'Pod and Berth are not in the same canonical queue');
  assert(podRow.slotId?.startsWith('dock:') && berthRow.slotId?.startsWith('berth:'), 'queue lost physical interface class');
  assert(pod.smallCraftVisit !== undefined && pod.portContractId === undefined, 'Pod did not retain SmallCraftVisit ownership');
  assert(berth.portContractId !== undefined && berth.smallCraftVisit === undefined, 'Berth did not retain PortContract ownership');
  const settlementsBefore = state.portOps.settlements.length;
  resolvePhysicalHoldingQueue(state);
  assert(state.portOps.settlements.length === settlementsBefore, 'queue resolution settled a visit');
  return `one queue: ${podRow.slotId} + ${berthRow.slotId}; SmallCraftVisit and PortContract stayed distinct`;
}

function testFifoGroupsAndDepartureRelease(): string {
  const state = createInitialState({ seed: 81502, physicalStarterInventory: true, manualTrafficAdmission: true });
  tick(state, 0);
  state.controls.paused = false;
  const firstOffer = podOffer(state, 815021);
  state.trafficOffers.push(firstOffer);
  assert(admitTrafficOffer(state, firstOffer.id).ok, 'first Pod could not bind');
  const secondOffer = podOffer(state, 815022);
  state.trafficOffers.push(secondOffer);
  assert(admitTrafficOffer(state, secondOffer.id).ok, 'second Pod could not bind');
  const first = state.physicalHoldingQueue.find((entry) => entry.shipId === firstOffer.id)!;
  const second = state.physicalHoldingQueue.find((entry) => entry.shipId === secondOffer.id)!;
  first.queuedAt = 12;
  second.queuedAt = 12;
  state.physicalHoldingQueue.reverse();
  resolvePhysicalHoldingQueue(state);
  assert(first.status === 'active' && second.status === 'waiting', 'equal-time FIFO did not use ship id');
  assert(first.groupIds.length > 0 && second.groupIds.length > 0, 'overlapping Pod corridors did not share arbitration groups');

  // Settlement owns the decision to leave; the queue sees only a fresh egress
  // claim. The older approach must still win until it releases its row.
  second.phase = 'depart';
  second.queuedAt = 20;
  resolvePhysicalHoldingQueue(state);
  assert(first.status === 'active' && second.status === 'waiting', 'fresh departure cut ahead of older approach work');
  state.physicalHoldingQueue = state.physicalHoldingQueue.filter((entry) => entry.shipId !== first.shipId);
  state.arrivingShips = state.arrivingShips.filter((ship) => ship.id !== first.shipId);
  resolvePhysicalHoldingQueue(state);
  const releasedSecond = state.physicalHoldingQueue.find((entry) => entry.shipId === second.shipId);
  assert(releasedSecond?.status === 'active', 'departure did not acquire the corridor after the older row released');
  return 'FIFO stable under array reversal; departure waited, then acquired after release';
}

function walkIn(id: number, lane: PhysicalHoldingQueueEntry['lane'], queuedAt: number, timeoutAt: number): PhysicalHoldingQueueEntry {
  return {
    shipId: id,
    ownerKind: 'walk-in-candidate',
    lane,
    shipType: 'tourist',
    hullVariant: 'courier-pod',
    size: 'small',
    slotId: null,
    groupIds: [],
    phase: 'approach',
    status: 'awaiting-slot',
    queuedAt,
    timeoutAt
  };
}

function testWalkInTimeoutAndOldestClaim(): string {
  const state = createInitialState({ seed: 81503, physicalStarterInventory: true });
  tick(state, 0);
  state.controls.paused = false;
  state.controls.shipsPerCycle = 0;
  const visitorDocks = state.docks.filter((dock) => dock.purpose === 'visitor');
  assert(visitorDocks.length >= 1, 'walk-in fixture needs a visitor dock');
  for (const dock of visitorDocks.slice(1)) dock.purpose = 'residential';
  const lane = visitorDocks[0]!.lane;
  const older = walkIn(815031, lane, 2, state.now + 100);
  const younger = walkIn(815032, lane, 3, state.now + 100);
  state.physicalHoldingQueue.push(younger, older);
  tick(state, 0);
  assert(state.arrivingShips.some((ship) => ship.id === older.shipId), 'oldest candidate did not claim the freed dock');
  const survivor = state.physicalHoldingQueue.find((entry) => entry.shipId === younger.shipId);
  assert(survivor?.ownerKind === 'walk-in-candidate', 'younger candidate was not left awaiting the occupied dock');

  const accepted = state.physicalHoldingQueue.find((entry) => entry.shipId === older.shipId);
  assert(accepted?.ownerKind === 'active-ship', 'claimed walk-in did not mutate the same row into an accepted ship');
  accepted.slotId = null;
  accepted.groupIds = [];
  accepted.status = 'awaiting-slot';
  const holdingSecondsBefore = state.commitment.holdingSeconds;
  tick(state, 0.2);
  assert(state.commitment.holdingShips === 2, 'awaiting walk-in and unbound accepted ship were not both counted in holding orbit');
  assert(state.commitment.holdingSeconds >= holdingSecondsBefore + 0.39, 'awaiting-slot time did not accrue for both holding owners');

  const timedOutBefore = state.metrics.shipsTimedOutInQueue;
  const economyBefore = state.openingEconomy.ledger.recent.length;
  const demandBefore = state.openingEconomy.podDemand.recent.length;
  survivor.timeoutAt = state.now;
  tick(state, 0);
  tick(state, 0);
  assert(state.metrics.shipsTimedOutInQueue === timedOutBefore + 1, 'walk-in timeout was not attributed exactly once');
  assert(!state.physicalHoldingQueue.some((entry) => entry.shipId === younger.shipId), 'timed-out walk-in retained a queue row');
  assert(state.openingEconomy.ledger.recent.length === economyBefore, 'queue timeout invented an economy event');
  assert(state.openingEconomy.podDemand.recent.length === demandBefore, 'queue timeout invented a demand outcome');
  return 'oldest claimed sole dock; younger timed out once with no economy/demand side effect';
}

function testSaveAndLegacyMigration(): string {
  const { state, pod } = mixedPhysicalState(81504);
  const separateOffer = podOffer(state, 815049);
  separateOffer.status = 'holding';
  state.trafficOffers.push(separateOffer);
  const raw = serializeSave('canonical holding', state, 'test');
  const wire = JSON.parse(raw) as { snapshot: { physicalHoldingQueue?: unknown[]; activePortShips: Array<Record<string, unknown>> } };
  assert(Array.isArray(wire.snapshot.physicalHoldingQueue), 'new save omitted canonical physicalHoldingQueue block');
  assert(wire.snapshot.activePortShips.every((ship) => !('approachCommitment' in ship)), 'new save wrote legacy per-ship approachCommitment');
  const parsed = parseAndMigrateSave(raw);
  assert(parsed.ok, parsed.ok ? '' : parsed.error);
  const restored = hydrateStateFromSave(parsed.save, { seed: 81504 }).state;
  assert(restored.physicalHoldingQueue.some((entry) => entry.shipId === pod.id), 'canonical queue did not survive save/load');
  assert(restored.trafficOffers.some((offer) => offer.id === separateOffer.id && offer.status === 'holding'), 'pre-admission holding offer merged into physical queue');

  const legacyWire = JSON.parse(raw) as { snapshot: { physicalHoldingQueue?: unknown[]; activePortShips: Array<Record<string, unknown>> } };
  const legacyRow = state.physicalHoldingQueue.find((entry) => entry.shipId === pod.id)!;
  delete legacyWire.snapshot.physicalHoldingQueue;
  const legacyShip = legacyWire.snapshot.activePortShips.find((ship) => ship.id === pod.id);
  assert(legacyShip, 'legacy fixture could not find active pod');
  legacyShip.approachCommitment = {
    slotId: legacyRow.slotId,
    groupIds: [...legacyRow.groupIds],
    phase: legacyRow.phase,
    status: legacyRow.status === 'active' ? 'active' : 'waiting',
    queuedAt: legacyRow.queuedAt
  };
  const legacyParsed = parseAndMigrateSave(JSON.stringify(legacyWire));
  assert(legacyParsed.ok, legacyParsed.ok ? '' : legacyParsed.error);
  const legacy = hydrateStateFromSave(legacyParsed.save, { seed: 81504 }).state;
  assert(legacy.physicalHoldingQueue.some((entry) => entry.shipId === pod.id && entry.slotId === legacyRow.slotId), 'legacy commitment did not migrate into canonical queue');
  assert(legacy.trafficOffers.some((offer) => offer.id === separateOffer.id), 'legacy migration consumed a pre-admission offer');
  return 'canonical [] block durable; legacy per-ship row migrated; trafficOffers stayed separate';
}

function testExactlyOnceSettlementAfterHeldSave(): string {
  const built = mixedPhysicalState(81505);
  const parsed = parseAndMigrateSave(serializeSave('held settlement', built.state, 'test'));
  assert(parsed.ok, parsed.ok ? '' : parsed.error);
  const state = hydrateStateFromSave(parsed.save, { seed: 81505 }).state;
  state.controls.paused = false;
  const pod = state.arrivingShips.find((ship) => ship.id === built.pod.id);
  const berth = state.arrivingShips.find((ship) => ship.id === built.berth.id);
  assert(pod?.smallCraftVisit && berth?.portContractId !== undefined, 'settlement owners were lost on held save/load');

  // Complete ingress without paying anything. Queue release alone cannot own
  // either settlement record.
  pod.stageTime = 999;
  berth.stageTime = 999;
  tick(state, 0);
  const contract = state.portOps.contracts.find((entry) => entry.id === berth.portContractId);
  assert(contract, 'Berth PortContract missing after load');
  assert(state.portOps.settlements.length === 1 && contract.settlementId !== null, 'Berth did not settle before its departure enqueue');
  assert(state.physicalHoldingQueue.some((entry) => entry.shipId === berth.id && entry.phase === 'depart'), 'Berth settlement did not enqueue fresh egress');
  assert(state.openingEconomy.podDemand.recent.length === 0, 'Pod demand settled before physical egress');

  pod.stage = 'docked';
  pod.visitPhase = 'visit-service';
  pod.passengersTotal = 0;
  pod.passengersSpawned = 0;
  pod.passengersBoarded = 0;
  // Start the new dock-relative clock before forcing this fixture's terminal
  // expiry; otherwise dock initialization correctly replaces a pre-dock
  // patience value.
  tick(state, 0);
  pod.smallCraftVisit.patienceExpiresAt = state.now + 0.01;
  tick(state, 0.2);
  assert(Number(state.portOps.settlements.length) === 1, 'Berth settlement duplicated when Pod entered departure');

  advance(state, 30);
  assert(Number(state.portOps.settlements.length) === 1, 'Berth settlement duplicated during held egress');
  assert(state.openingEconomy.podDemand.recent.filter((entry) => entry.visitId === pod.id).length === 1, 'Pod demand outcome did not settle exactly once');
  return 'held save resumed: one Berth settlement before egress, one Pod demand outcome after egress';
}

const checks = [
  ['shared queue, distinct settlement owners', testSharedQueueDistinctSettlementOwners],
  ['FIFO groups and departure release', testFifoGroupsAndDepartureRelease],
  ['walk-in timeout and oldest claim', testWalkInTimeoutAndOldestClaim],
  ['save/load and legacy migration', testSaveAndLegacyMigration],
  ['exactly-once Pod/Berth settlement', testExactlyOnceSettlementAfterHeldSave]
] as const;

let passed = 0;
for (const [label, run] of checks) {
  const evidence = run();
  passed += 1;
  console.log(`PASS ${label}: ${evidence}`);
}
console.log(`physical-holding-queue-tests: ${passed}/${checks.length} checks passed`);
