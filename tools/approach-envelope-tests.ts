import { buildDockingSlotDescriptor, deriveApproachConflictGroups } from '../src/sim/approach-envelopes';
import { hydrateStateFromSave, parseAndMigrateSave, serializeSave } from '../src/sim/save';
import {
  createInitialState,
  admitTrafficOffer,
  expandMap,
  getDockingSlotDescriptors,
  resolvePhysicalApproachCommitments,
  tick,
  validateDockingSlot
} from '../src/sim/sim';
import { TileType, toIndex, type ArrivingShip, type StationState, type TrafficOffer } from '../src/sim/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function descriptor(id: string, facing: 'north' | 'east' | 'south' | 'west', x: number, y: number) {
  return buildDockingSlotDescriptor({
    id,
    kind: 'pod-dock',
    sourceKey: id,
    anchorTile: 0,
    facing,
    acceptedSizes: ['small'],
    hullTiles: [0],
    accessTiles: [0],
    anchorWorldX: x + 0.5,
    anchorWorldY: y + 0.5,
    hullBounds: { minX: x, minY: y, maxX: x + 1, maxY: y + 1 }
  });
}

function fakeShip(id: number, groupIds: string[], queuedAt: number): ArrivingShip {
  return {
    id,
    approachCommitment: { slotId: `slot-${id}`, groupIds, phase: 'approach', status: 'waiting', queuedAt }
  } as ArrivingShip;
}

function physicalOffer(id: number, dock: StationState['docks'][number]): TrafficOffer {
  return {
    id,
    callsign: `PHYSICAL-${id}`,
    shipName: `Physical Test Pod ${id}`,
    lane: dock.lane,
    shipType: dock.allowedShipTypes[0],
    hullVariant: 'courier-pod',
    size: 'small',
    status: 'holding',
    forecastAt: 0,
    arrivesAt: 0,
    expiresAt: 90,
    passengersTotal: 1,
    manifestDemand: { cafeteria: 0, market: 0, lounge: 0 },
    manifestMix: { diner: 1, shopper: 0, lounger: 0, rusher: 0 },
    hospitalityDemand: { meal: 0, drink: 0, leisure: 0, restroom: 0, hygiene: 0, comfort: 0 },
    inboundCargo: { rawMaterial: 0, rawMeal: 0, tradeGood: 0 },
    outboundRequest: { rawMaterial: 0, meal: 0, tradeGood: 0 },
    requestedServices: [],
    berthTimeSec: 60,
    dockingFee: 1,
    projectedSpend: 1,
    riskLabel: 'low',
    assignedBerthAnchor: null,
    assignedDockSourceKey: null
  };
}

function testWorldSpaceEdgesAndGroups(): void {
  const edge = descriptor('edge', 'west', 0, 0);
  assert(edge.envelopesBySize.small.ingress.bounds.minX < 0, 'Map-edge ingress must continue beyond the array boundary.');

  const west = descriptor('west', 'east', 0, 10);
  const east = descriptor('east', 'west', 6, 10);
  const groups = deriveApproachConflictGroups([west, east]);
  assert(groups.length === 1, 'Clear moorings with crossing approaches need one conflict group.');
  assert(groups[0].slotIds.join(',') === 'east,west', 'Conflict groups must be deterministic by stable slot id.');
}

function testFixedObstructionDoesNotMutateState(): void {
  const state = createInitialState({ seed: 71101 });
  const x = 3;
  const y = 3;
  for (let yy = y - 2; yy <= y + 2; yy++) {
    for (let xx = x; xx <= x + 6; xx++) state.tiles[toIndex(xx, yy, state.width)] = TileType.Space;
  }
  const hull = toIndex(x, y, state.width);
  state.tiles[hull] = TileType.Dock;
  const blocked = toIndex(x + 2, y, state.width);
  state.tiles[blocked] = TileType.Wall;
  const before = [...state.tiles];
  const checked = validateDockingSlot(state, buildDockingSlotDescriptor({
    id: 'test-obstruction',
    kind: 'legacy-dock',
    sourceKey: 'test-obstruction',
    anchorTile: hull,
    facing: 'east',
    acceptedSizes: ['small'],
    hullTiles: [hull],
    accessTiles: [hull],
    anchorWorldX: x + 0.5,
    anchorWorldY: y + 0.5,
    hullBounds: { minX: x, minY: y, maxX: x + 1, maxY: y + 1 }
  }), 'small');
  assert(!checked.valid && checked.hardReasons.some((reason) => reason.includes('obstructed')), 'In-grid fixed obstruction must reject an approach envelope.');
  assert(before.every((tile, index) => tile === state.tiles[index]), 'Validation must not mutate station state.');
}

function testDeterministicCommitmentOwnership(): void {
  const state = createInitialState({ seed: 71102 });
  const later = fakeShip(20, ['shared'], 40);
  const earlier = fakeShip(10, ['shared'], 40);
  state.arrivingShips = [later, earlier];
  resolvePhysicalApproachCommitments(state);
  assert(earlier.approachCommitment?.status === 'active', 'Equal-time queue ownership must use lower ship id.');
  assert(later.approachCommitment?.status === 'waiting', 'Shared approach waiter should remain waiting.');
  state.arrivingShips.reverse();
  resolvePhysicalApproachCommitments(state);
  assert(earlier.approachCommitment?.status === 'active', 'Array order must not change approach ownership.');

  const independentA = fakeShip(31, ['north'], 5);
  const independentB = fakeShip(32, ['south'], 5);
  state.arrivingShips = [independentA, independentB];
  resolvePhysicalApproachCommitments(state);
  assert(independentA.approachCommitment?.status === 'active' && independentB.approachCommitment?.status === 'active', 'Independent approach groups must run concurrently.');
}

function testAcceptedPodRequestsPhysicalApproach(): void {
  const state = createInitialState({ seed: 71104, physicalStarterInventory: true, manualTrafficAdmission: true });
  tick(state, 0);
  state.controls.paused = false;
  const dock = state.docks.find((entry) => entry.sourceKind === 'pod-dock-module' && entry.purpose === 'visitor');
  assert(dock, 'Starter fixture needs a Pod Dock.');
  const shipType = dock.allowedShipTypes[0];
  const offer: TrafficOffer = {
    id: 71104,
    callsign: 'PHYSICAL-APPROACH',
    shipName: 'Physical Test Pod',
    lane: dock.lane,
    shipType,
    hullVariant: 'courier-pod',
    size: 'small',
    status: 'holding',
    forecastAt: state.now,
    arrivesAt: state.now,
    expiresAt: state.now + 90,
    passengersTotal: 1,
    manifestDemand: { cafeteria: 0, market: 0, lounge: 0 },
    manifestMix: { diner: 1, shopper: 0, lounger: 0, rusher: 0 },
    hospitalityDemand: { meal: 0, drink: 0, leisure: 0, restroom: 0, hygiene: 0, comfort: 0 },
    inboundCargo: { rawMaterial: 0, rawMeal: 0, tradeGood: 0 },
    outboundRequest: { rawMaterial: 0, meal: 0, tradeGood: 0 },
    requestedServices: [],
    berthTimeSec: 60,
    dockingFee: 1,
    projectedSpend: 1,
    riskLabel: 'low',
    assignedBerthAnchor: null,
    assignedDockSourceKey: null
  };
  state.trafficOffers.push(offer);
  assert(admitTrafficOffer(state, offer.id).ok, 'Accepted pod should bind its existing Pod Dock.');
  const ship = state.arrivingShips.find((entry) => entry.id === offer.id);
  assert(ship?.assignedDockSourceKey === dock.sourceKey, 'Small craft must preserve Pod Dock binding.');
  assert(ship?.assignedBerthAnchor === null, 'Small craft must never bind a Berth.');
  assert(ship?.approachCommitment?.slotId === `dock:${dock.sourceKey}`, 'Accepted ship must request durable physical approach ownership.');

  const parsed = parseAndMigrateSave(serializeSave('approach-envelope', state, 'test'));
  assert(parsed.ok, parsed.ok ? '' : parsed.error);
  const restored = hydrateStateFromSave(parsed.save, { seed: 71104 }).state;
  const restoredShip = restored.arrivingShips.find((entry) => entry.id === offer.id);
  assert(restoredShip?.approachCommitment?.slotId === `dock:${dock.sourceKey}`, 'Save/load must preserve the physical slot commitment.');
  assert(restoredShip?.approachCommitment?.queuedAt === ship.approachCommitment?.queuedAt, 'Save/load must preserve deterministic queue order.');

  tick(state, 20);
  assert(ship.stage === 'docked', 'Only an active physical approach commitment may complete docking.');
  ship.stage = 'depart';
  ship.stageTime = 0;
  ship.approachCommitment = null;
  tick(state, 0.1);
  tick(state, 0.1);
  const departureCommitment = state.arrivingShips.find((entry) => entry.id === ship.id)?.approachCommitment;
  assert(departureCommitment?.phase === 'depart' && departureCommitment.status === 'active', 'Departure must acquire egress ownership before releasing the parked slot.');
  assert(dock.occupiedByShipId === ship.id, 'Parked slot must remain occupied until departure completes.');
}

function testWaitingDoesNotBankMovementTime(): void {
  const state = createInitialState({ seed: 71105, physicalStarterInventory: true, manualTrafficAdmission: true });
  tick(state, 0);
  state.controls.paused = false;
  const docks = state.docks.filter((entry) => entry.sourceKind === 'pod-dock-module' && entry.purpose === 'visitor');
  assert(docks.length >= 2, 'Starter fixture needs two Pod Docks with a shared corridor.');
  const firstOffer = physicalOffer(711051, docks[0]);
  const secondOffer = physicalOffer(711052, docks[1]);
  state.trafficOffers.push(firstOffer, secondOffer);
  assert(admitTrafficOffer(state, firstOffer.id).ok, 'First pod should enter approach control.');
  assert(admitTrafficOffer(state, secondOffer.id).ok, 'Second pod should enter approach control.');
  resolvePhysicalApproachCommitments(state);
  const waiting = state.arrivingShips.find((ship) => ship.approachCommitment?.status === 'waiting');
  assert(waiting, 'Overlapping Pod Dock corridors must leave one ship waiting.');
  tick(state, 20);
  assert(waiting.stageTime === 0, 'A waiting ship must not bank hidden approach progress.');
  tick(state, 0.1);
  assert(waiting.stage === 'approach' && waiting.stageTime > 0 && waiting.stageTime < 1, 'After acquiring the corridor, the ship must visibly traverse it from the beginning.');
}

function testWorldSpaceSurvivesWestExpansion(): void {
  const state = createInitialState({ seed: 71103, physicalStarterInventory: true });
  tick(state, 0);
  const before = getDockingSlotDescriptors(state)
    .map((slot) => ({ facing: slot.facing, bounds: slot.envelopesBySize.small.ingress.bounds }))
    .sort((a, b) => `${a.facing}${a.bounds.minX}${a.bounds.minY}`.localeCompare(`${b.facing}${b.bounds.minX}${b.bounds.minY}`));
  assert(before.length > 0, 'Starter needs at least one physical docking descriptor.');
  state.metrics.credits = 100_000;
  assert(expandMap(state, 'west').ok, 'West expansion fixture should succeed.');
  const after = getDockingSlotDescriptors(state)
    .map((slot) => ({ facing: slot.facing, bounds: slot.envelopesBySize.small.ingress.bounds }))
    .sort((a, b) => `${a.facing}${a.bounds.minX}${a.bounds.minY}`.localeCompare(`${b.facing}${b.bounds.minX}${b.bounds.minY}`));
  assert(after.length === before.length, 'Expansion should preserve docking descriptors.');
  for (let index = 0; index < before.length; index++) {
    assert(JSON.stringify(after[index]) === JSON.stringify(before[index]), 'North/west expansion must retain world-space envelopes.');
  }
}

function main(): void {
  testWorldSpaceEdgesAndGroups();
  testFixedObstructionDoesNotMutateState();
  testDeterministicCommitmentOwnership();
  testAcceptedPodRequestsPhysicalApproach();
  testWaitingDoesNotBankMovementTime();
  testWorldSpaceSurvivesWestExpansion();
  console.log('approach-envelope-tests: ok');
}

main();
