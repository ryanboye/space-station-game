import {
  admitTrafficOffer,
  createInitialState,
  planTileConstruction,
  reconcileExteriorIntegrityTargets,
  setExteriorIntegrityTargetState,
  tick
} from '../src/sim/sim';
import { hydrateStateFromSave, parseAndMigrateSave, serializeSave } from '../src/sim/save';
import {
  TileType,
  VisitorState,
  type ArrivingShip,
  type PortContract,
  type StationState,
  type TrafficOffer,
  type Visitor
} from '../src/sim/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const evidence = {
  durablePhaseRecords: 0,
  rebuiltTransientChecks: 0,
  reconciliationWarnings: 0
};

function roundTrip(state: StationState, seed: number): { state: StationState; warnings: string[] } {
  const parsed = parseAndMigrateSave(serializeSave('phase9-save-migration', state, 'phase9'));
  assert(parsed.ok, `Save failed to parse: ${parsed.ok ? '' : parsed.error}`);
  return hydrateStateFromSave(parsed.save, { seed });
}

function makeOffer(state: StationState, id: number, dock: StationState['docks'][number]): TrafficOffer {
  return {
    id,
    callsign: `PHASE9-${id}`,
    shipName: 'Phase 9 Test Pod',
    lane: dock.lane,
    shipType: dock.allowedShipTypes[0],
    hullVariant: 'courier-pod',
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
    berthTimeSec: 180,
    dockingFee: 0,
    projectedSpend: 0,
    riskLabel: 'low',
    assignedBerthAnchor: null,
    assignedDockSourceKey: null
  };
}

function dockedVisit(state: StationState, id: number, phase: ArrivingShip['visitPhase']): ArrivingShip {
  const dock = state.docks.find((entry) => entry.sourceKind === 'pod-dock-module' && entry.purpose === 'visitor');
  assert(dock, 'Fixture requires a visitor Pod Dock.');
  const offer = makeOffer(state, id, dock);
  const ship: ArrivingShip = {
    id,
    kind: 'transient',
    size: 'small',
    bayTiles: [dock.accessTile ?? dock.tiles[0]],
    bayCenterX: (dock.anchorTile % state.width) + 0.5,
    bayCenterY: Math.floor(dock.anchorTile / state.width) + 0.5,
    shipType: offer.shipType,
    hullVariant: 'courier-pod',
    lane: dock.lane,
    originDockId: dock.id,
    assignedDockId: dock.id,
    assignedDockSourceKey: dock.sourceKey,
    assignedBerthAnchor: null,
    queueState: 'none',
    stage: 'docked',
    stageTime: 23,
    passengersTotal: 0,
    passengersSpawned: 0,
    passengersBoarded: 0,
    minimumBoarding: 0,
    spawnCarry: 0,
    dockedAt: state.now,
    residentIds: [],
    manifestDemand: { ...offer.manifestDemand },
    manifestMix: { ...offer.manifestMix },
    portManifest: offer,
    portContractId: id,
    stayClass: 'contract',
    visitPhase: phase,
    earliestDepartureAt: state.now + 30,
    plannedDepartureAt: state.now + 180,
    extensionUntil: null,
    recallAt: phase === 'recall' || phase === 'boarding' ? state.now + 20 : null,
    approachCommitment: null
  };
  const contract: PortContract = {
    id,
    offerId: id,
    shipId: id,
    callsign: offer.callsign,
    offerKind: 'passenger',
    assignedBerthAnchor: 0,
    acceptedAt: state.now,
    arrivesAt: state.now,
    boardingStartsAt: state.now + 120,
    hardDepartureAt: state.now + 180,
    status: phase === 'boarding' ? 'boarding' : 'active',
    promises: [{ kind: 'dock', label: 'Dock access', target: 1, completed: 1, payoutCredits: 0 }],
    passengerSpendingCredits: 0,
    procurementCostCredits: 0,
    settlementId: null,
    stayClass: 'contract',
    earliestDepartureAt: ship.earliestDepartureAt,
    plannedDepartureAt: ship.plannedDepartureAt,
    extensionUntil: null,
    recallAt: ship.recallAt
  };
  state.arrivingShips.push(ship);
  state.portOps.contracts.push(contract);
  return ship;
}

function fixture(seed: number): StationState {
  const state = createInitialState({ seed, physicalStarterInventory: true, manualTrafficAdmission: true });
  tick(state, 0);
  return state;
}

function assertContractPreserved(
  state: StationState,
  shipId: number,
  phase: string,
  expected: Pick<PortContract, 'acceptedAt' | 'arrivesAt' | 'boardingStartsAt' | 'hardDepartureAt'>,
  expectedVisit: Pick<ArrivingShip, 'earliestDepartureAt' | 'plannedDepartureAt' | 'recallAt'>
): void {
  const ship = state.arrivingShips.find((entry) => entry.id === shipId);
  const contract = state.portOps.contracts.find((entry) => entry.id === shipId);
  assert(ship?.visitPhase === phase, `${phase} visit phase did not survive hydration.`);
  assert(contract?.shipId === shipId && contract.offerId === shipId, `${phase} contract identity changed during hydration.`);
  assert(
    contract?.acceptedAt === expected.acceptedAt &&
      contract.arrivesAt === expected.arrivesAt &&
      contract.boardingStartsAt === expected.boardingStartsAt &&
      contract.hardDepartureAt === expected.hardDepartureAt,
    `${phase} contract timing changed during hydration.`
  );
  assert(
    ship.earliestDepartureAt === expectedVisit.earliestDepartureAt &&
      ship.plannedDepartureAt === expectedVisit.plannedDepartureAt &&
      ship.recallAt === expectedVisit.recallAt,
    `${phase} durable visit timing changed during hydration.`
  );
  evidence.durablePhaseRecords += 1;
}

function testApproachCommitmentRoundTrip(): void {
  const state = fixture(9001);
  const dock = state.docks.find((entry) => entry.sourceKind === 'pod-dock-module' && entry.purpose === 'visitor');
  assert(dock, 'Fixture requires a visitor Pod Dock.');
  const offer = makeOffer(state, 90011, dock);
  state.trafficOffers.push(offer);
  assert(admitTrafficOffer(state, offer.id).ok, 'Approach offer could not be admitted.');
  const ship = state.arrivingShips.find((entry) => entry.id === offer.id);
  assert(ship?.stage === 'approach' && ship.approachCommitment, 'Accepted ship did not receive an approach commitment.');
  state.portOps.contracts.push({
    id: offer.id,
    offerId: offer.id,
    shipId: offer.id,
    callsign: offer.callsign,
    offerKind: 'passenger',
    assignedBerthAnchor: 0,
    acceptedAt: state.now,
    arrivesAt: state.now,
    boardingStartsAt: state.now + 120,
    hardDepartureAt: state.now + 180,
    status: 'accepted',
    promises: [{ kind: 'dock', label: 'Dock access', target: 1, completed: 0, payoutCredits: 0 }],
    passengerSpendingCredits: 0,
    procurementCostCredits: 0,
    settlementId: null,
    stayClass: 'contract',
    earliestDepartureAt: state.now + 30,
    plannedDepartureAt: state.now + 180,
    extensionUntil: null,
    recallAt: null
  });
  const queuedAt = ship.approachCommitment.queuedAt;
  const expectedContract = state.portOps.contracts.find((entry) => entry.id === offer.id);
  assert(expectedContract, 'Approach fixture did not retain its contract.');
  const restored = roundTrip(state, 9001).state;
  const resumed = restored.arrivingShips.find((entry) => entry.id === offer.id);
  assert(resumed?.approachCommitment?.slotId === `dock:${dock.sourceKey}`, 'Valid approach slot was not preserved through hydration.');
  assert(resumed.approachCommitment.queuedAt === queuedAt, 'Approach queue order changed during hydration.');
  assertContractPreserved(restored, offer.id, 'announced', expectedContract, ship);
}

function testDockedVisitPhasesAndSettlement(): void {
  for (const [offset, phase] of ['secure', 'visit-service', 'recall', 'boarding'].entries()) {
    const state = fixture(9010 + offset);
    const shipId = 90101 + offset;
    dockedVisit(state, shipId, phase as ArrivingShip['visitPhase']);
    const expectedContract = state.portOps.contracts.find((entry) => entry.id === shipId);
    assert(expectedContract, `${phase} fixture did not retain its contract.`);
    const restored = roundTrip(state, 9010 + offset).state;
    const expectedShip = state.arrivingShips.find((entry) => entry.id === shipId);
    assert(expectedShip, `${phase} fixture did not retain its ship.`);
    assertContractPreserved(restored, shipId, phase, expectedContract, expectedShip);

    if (phase !== 'boarding') continue;
    const contract = restored.portOps.contracts.find((entry) => entry.id === shipId);
    const ship = restored.arrivingShips.find((entry) => entry.id === shipId);
    assert(contract && ship, 'Boarding record disappeared after hydration.');
    contract.boardingStartsAt = restored.now;
    contract.hardDepartureAt = restored.now;
    ship.visitPhase = 'boarding';
    restored.controls.paused = false;
    tick(restored, 0.4);
    const settled = restored.portOps.settlements.filter((entry) => entry.contractId === shipId).length;
    tick(restored, 1);
    assert(settled === 1 && restored.portOps.settlements.filter((entry) => entry.contractId === shipId).length === 1, 'Boarding resume settled a contract more than once.');
  }
}

function testDurableConstructionIntegrityAndTransientReset(): void {
  const state = fixture(9020);
  const buildTile = state.tiles.findIndex((tile) => tile === TileType.Floor);
  assert(buildTile >= 0 && planTileConstruction(state, buildTile, TileType.Wall).ok, 'Could not create an in-progress construction site.');
  const site = state.constructionSites.find((entry) => entry.tileIndex === buildTile);
  assert(site, 'Construction planner did not create a site.');
  site.deliveredMaterials = site.requiredMaterials;
  site.buildProgress = site.buildWorkRequired / 2;
  site.state = 'building';

  reconcileExteriorIntegrityTargets(state);
  const damaged = state.exteriorIntegrityTargets[0];
  assert(damaged && setExteriorIntegrityTargetState(state, damaged.id, 'breached', 86), 'Could not create a damaged exterior target.');

  const ship = dockedVisit(state, 90201, 'visit-service');
  const visitor: Visitor = {
    id: 90202,
    x: ship.bayCenterX,
    y: ship.bayCenterY,
    tileIndex: ship.bayTiles[0],
    state: VisitorState.ToLeisure,
    path: [buildTile],
    speed: 2,
    patience: 0,
    eatTimer: 0,
    trespassed: false,
    servedMeal: false,
    carryingMeal: false,
    reservedServingTile: buildTile,
    reservedTargetTile: buildTile,
    blockedTicks: 0,
    movementWaitReason: 'stale Phase 9 intent',
    movementBlockedTile: buildTile,
    archetype: 'lounger',
    taxSensitivity: 1,
    spendMultiplier: 1,
    patienceMultiplier: 1,
    primaryPreference: 'lounge',
    spawnedAt: state.now,
    originShipId: ship.id,
    airExposureSec: 0,
    healthState: 'healthy',
    leisureLegsRemaining: 1,
    leisureLegsPlanned: 1,
    lastLeisureKind: null,
    servicePlan: [],
    completedServices: [],
    activeService: null,
    stayClass: 'contract',
    queueProviderTile: null,
    queueJoinedAt: null,
    temporarySleepTargetTile: buildTile,
    transferPhase: 'boarding-queued',
    transferSlotKey: 'stale-slot',
    transferQueuedAt: state.now
  };
  state.visitors.push(visitor);
  state.crewMembers[0].path = [buildTile];
  state.pathOccupancyByTile.set(999999, 99);
  state.derived.pathCache.set('phase9-stale-path', { path: [buildTile], createdAt: state.now, topologyVersion: state.topologyVersion, roomVersion: state.roomVersion });
  state.derived.queueTheater.membersByAnchor.set(buildTile, [visitor.id, 999999]);
  state.derived.queueTheater.slotByVisitorId.set(999999, buildTile);
  state.reservations.push({
    id: 90203,
    ownerKind: 'visitor',
    ownerId: visitor.id,
    kind: 'transfer-slot',
    targetTile: buildTile,
    targetId: 'phase9-stale-reservation',
    itemType: null,
    amount: 1,
    capacity: 1,
    createdAt: state.now,
    expiresAt: state.now + 999,
    releaseReason: null
  });
  state.dockQueue.push({ shipId: 999999, lane: 'north', shipType: 'tourist', hullVariant: 'courier-pod', size: 'small', queuedAt: state.now, timeoutAt: state.now + 999 });

  const restored = roundTrip(state, 9020).state;
  const loadedSite = restored.constructionSites.find((entry) => entry.id === site.id);
  assert(loadedSite?.state === 'building' && loadedSite.buildProgress === site.buildProgress, 'In-progress construction was not restored durably.');
  assert(restored.exteriorIntegrityTargets.some((entry) => entry.id === damaged.id && entry.state === 'breached' && entry.wear === 86), 'Damaged exterior integrity state was not restored.');
  const loadedVisitor = restored.visitors.find((entry) => entry.id === visitor.id);
  assert(loadedVisitor?.originShipId === ship.id && loadedVisitor.stayClass === 'contract', 'Durable visit identity did not survive hydration.');
  assert(loadedVisitor.path.length === 0 && loadedVisitor.reservedServingTile === null && loadedVisitor.reservedTargetTile === null && loadedVisitor.temporarySleepTargetTile === null, 'Hydration retained stale visitor paths or fixture claims.');
  assert(restored.crewMembers.every((crew) => crew.path.length === 0), 'Hydration retained stale crew movement paths.');
  assert(!restored.pathOccupancyByTile.has(999999) && !restored.derived.pathCache.has('phase9-stale-path'), 'Hydration retained stale occupancy or path cache state.');
  assert(!restored.derived.queueTheater.membersByAnchor.get(buildTile)?.includes(999999) && !restored.derived.queueTheater.slotByVisitorId.has(999999), 'Hydration retained stale queue occupancy.');
  assert(!restored.reservations.some((entry) => entry.targetId === 'phase9-stale-reservation') && !restored.dockQueue.some((entry) => entry.shipId === 999999), 'Hydration retained stale reservations or dock queue entries.');
  evidence.rebuiltTransientChecks += 1;
}

function testInvalidDockBindingReturnsToHolding(): void {
  const state = fixture(9030);
  const dock = state.docks.find((entry) => entry.sourceKind === 'pod-dock-module' && entry.purpose === 'visitor');
  assert(dock, 'Fixture requires a visitor Pod Dock.');
  const offer = makeOffer(state, 90301, dock);
  offer.status = 'cleared';
  offer.assignedDockSourceKey = 'missing-phase9-dock';
  state.trafficOffers.push(offer);
  const ship = dockedVisit(state, 90302, 'visit-service');
  ship.assignedDockSourceKey = 'missing-phase9-dock';
  ship.assignedDockId = 999999;

  const restored = roundTrip(state, 9030);
  const restoredOffer = restored.state.trafficOffers.find((entry) => entry.id === offer.id);
  const restoredShip = restored.state.arrivingShips.find((entry) => entry.id === ship.id);
  assert(restoredOffer?.status === 'holding' && restoredOffer.assignedDockSourceKey === null, 'Invalid cleared offer did not return to holding.');
  assert(restoredShip?.queueState === 'queued' && restoredShip.assignedDockId === null && restoredShip.approachCommitment === null, 'Invalid active ship binding did not release safely.');
  assert(restored.warnings.some((warning) => warning.includes('lost its dock binding')) && restored.warnings.some((warning) => warning.includes('could not remap its dock')), 'Dock reconciliation did not surface both warnings.');
  evidence.reconciliationWarnings += restored.warnings.filter((warning) => warning.includes('dock')).length;
}

function main(): void {
  testApproachCommitmentRoundTrip();
  testDockedVisitPhasesAndSettlement();
  testDurableConstructionIntegrityAndTransientReset();
  testInvalidDockBindingReturnsToHolding();
  console.log(`phase9-save-migration-tests: ok phases=${evidence.durablePhaseRecords} transient=${evidence.rebuiltTransientChecks} warnings=${evidence.reconciliationWarnings}`);
}

main();
