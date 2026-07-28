import {
  admitTrafficOffer,
  createInitialState,
  expandMap,
  getApproachConflictGroups,
  getDockingSlotDescriptors,
  planTileConstruction,
  reconcileExteriorIntegrityTargets,
  setBerthAllowedShipSize,
  setExteriorIntegrityTargetState,
  tick
} from '../src/sim/sim';
import { applyColdStartScenario } from '../src/sim/cold-start-scenarios';
import { auditSaveRecovery } from '../src/sim/save-recovery';
import { buildStructuralSupportGraph } from '../src/sim/structural-support';
import { hydrateStateFromSave, parseAndMigrateSave, serializeSave } from '../src/sim/save';
import {
  ModuleType,
  TileType,
  ResidentState,
  VisitorState,
  type ArrivingShip,
  type PortContract,
  type Resident,
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
  reconciliationWarnings: 0,
  legacyDerivations: 0,
  maintenanceIdentityChecks: 0
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
  const visitor = makeVisitor(state, ship, 90202, buildTile);
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

/**
 * A guest carrying every kind of transient claim the save must drop and every
 * kind of durable identity it must keep.
 */
function makeVisitor(state: StationState, ship: ArrivingShip, id: number, buildTile: number): Visitor {
  return {
    id,
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
}

/**
 * A resident with durable identity/housing but deliberately stale, transient
 * route and interaction state. The legacy-wire test strips the newer fields
 * entirely so hydration, rather than this constructor, supplies the defaults.
 */
function makeLegacyResidentFixture(
  state: StationState,
  ship: ArrivingShip,
  id: number,
  tileIndex: number
): Resident {
  const dock = state.docks.find((entry) => entry.id === ship.originDockId) ?? state.docks[0];
  const bed = state.moduleInstances.find((module) => module.type === ModuleType.Bed || module.type === ModuleType.Bunk);
  return {
    id,
    x: (tileIndex % state.width) + 0.5,
    y: Math.floor(tileIndex / state.width) + 0.5,
    tileIndex,
    path: [Math.min(state.tiles.length - 1, tileIndex + 1)],
    speed: 1.8,
    hunger: 70,
    energy: 72,
    hygiene: 74,
    social: 62,
    safety: 66,
    stress: 18,
    routinePhase: 'errands',
    role: 'none',
    roleAffinity: {},
    state: ResidentState.ToHomeShip,
    carryingMeal: true,
    reservedServingTile: tileIndex,
    serveTimer: 9,
    actionTimer: 0,
    retargetAt: state.now + 90,
    reservedTargetTile: tileIndex,
    homeShipId: ship.id,
    homeDockId: dock?.id ?? null,
    housingUnitId: tileIndex,
    bedModuleId: bed?.id ?? null,
    satisfaction: 64,
    leaveIntent: 0,
    blockedTicks: 8,
    movementWaitReason: 'stale legacy resident claim',
    movementReplanCooldownUntil: state.now + 90,
    airExposureSec: 0,
    healthState: 'healthy',
    agitation: 23,
    activeIncidentId: 90599,
    confrontationUntil: state.now + 90,
    lastRouteExposure: {
      distance: 12,
      publicTiles: 2,
      serviceTiles: 2,
      cargoTiles: 2,
      residentialTiles: 2,
      securityTiles: 2,
      socialTiles: 2,
      crowdCost: 4
    }
  };
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

/**
 * Legacy-save simulation: take a real save and delete the blocks or fields an
 * older build never wrote, so the loader has to supply the defaults itself.
 */
function legacyLoad(
  state: StationState,
  seed: number,
  strip: (snapshot: Record<string, unknown>) => void
): { state: StationState; warnings: string[] } {
  const wire = JSON.parse(serializeSave('phase9-legacy', state, 'legacy')) as { snapshot: Record<string, unknown> };
  strip(wire.snapshot);
  const parsed = parseAndMigrateSave(JSON.stringify(wire));
  assert(parsed.ok, `Legacy save failed to parse: ${parsed.ok ? '' : parsed.error}`);
  return hydrateStateFromSave(parsed.save, { seed });
}

/** A station that actually owns a Berth, which the starter layout does not. */
function berthFixture(seed: number): StationState {
  const state = createInitialState({ seed, physicalStarterInventory: true, manualTrafficAdmission: true });
  assert(applyColdStartScenario(state, 'mixed-berth-visit'), 'Fixture requires the mixed-berth demo station.');
  state.controls.shipsPerCycle = 0;
  tick(state, 0);
  return state;
}

/**
 * A legacy save carries no structural layer, no dock source keys and no berth
 * configs. Everything physical has to be re-derived from the loaded map: the
 * grandfathered hull, each Dock's approach envelopes, and the Berth geometry.
 */
function testLegacyStructureDocksAndBerths(): void {
  const state = berthFixture(9040);
  const beforeGraph = buildStructuralSupportGraph(state);
  const beforeSlots = JSON.stringify(getDockingSlotDescriptors(state));
  const beforeGroups = JSON.stringify(getApproachConflictGroups(state));
  assert(beforeGraph.rootTiles.length > 0, 'Fixture hull produced no grandfathered structural roots.');
  assert(getDockingSlotDescriptors(state).some((slot) => slot.kind === 'berth'), 'Fixture produced no Berth slot.');

  const legacy = legacyLoad(state, 9040, (snapshot) => {
    delete snapshot.structuralExpansionProjects;
    delete snapshot.berthConfigs;
    for (const dock of snapshot.dockConfigs as Array<Record<string, unknown>>) delete dock.sourceKey;
  });

  const graph = buildStructuralSupportGraph(legacy.state);
  assert(
    graph.rootTiles.length === beforeGraph.rootTiles.length &&
      JSON.stringify(graph.rootTiles) === JSON.stringify(beforeGraph.rootTiles),
    'Legacy hull was not grandfathered as supported structure after load.'
  );
  assert(
    graph.nodes.length === beforeGraph.nodes.length && graph.adjacency.size === beforeGraph.adjacency.size,
    'Structural support graph did not rebuild identically after load.'
  );
  assert(
    !legacy.warnings.some((warning) => warning.includes('no matching dock')),
    'A legacy Dock config without a source key lost its dock on load.'
  );

  const slots = getDockingSlotDescriptors(legacy.state);
  assert(JSON.stringify(slots) === beforeSlots, 'Approach envelopes were not re-derived identically after load.');
  assert(
    slots.filter((slot) => slot.kind !== 'berth').every((slot) => {
      const envelopes = slot.envelopesByHull['courier-pod'];
      return envelopes.ingress.bounds.maxX > envelopes.ingress.bounds.minX &&
        envelopes.mooring.bounds.maxY > envelopes.mooring.bounds.minY &&
        envelopes.egress.clearance >= 0;
    }),
    'A legacy Dock did not derive a usable approach envelope after load.'
  );
  assert(
    JSON.stringify(getApproachConflictGroups(legacy.state)) === beforeGroups,
    'Approach conflict groups were not rebuilt from loaded geometry.'
  );

  // Berth geometry is adapted from the map until the player edits it.
  const berth = slots.find((slot) => slot.kind === 'berth');
  assert(berth && berth.anchorTile !== null && berth.acceptedSizes.length > 1, 'Legacy load produced no adapted Berth slot.');
  const droppedSize = berth.acceptedSizes[0];
  setBerthAllowedShipSize(legacy.state, berth.anchorTile, droppedSize, false);
  const edited = getDockingSlotDescriptors(legacy.state).find((slot) => slot.id === berth.id);
  assert(
    edited !== undefined && !edited.acceptedSizes.includes(droppedSize) &&
      edited.acceptedSizes.length === berth.acceptedSizes.length - 1,
    'Adapted Berth geometry did not yield to an explicit edit after load.'
  );
  evidence.legacyDerivations += 1;
}

/**
 * New occupant state and the integrity/damage ledger are both absent from an
 * older save. Neither may be invented, and neither may crash the load.
 */
function testLegacyOccupantAndIntegrityDefaults(): void {
  const state = fixture(9050);
  reconcileExteriorIntegrityTargets(state);
  assert(state.exteriorIntegrityTargets.length > 0, 'Fixture produced no integrity targets to strip.');
  const ship = dockedVisit(state, 90501, 'visit-service');
  const buildTile = state.tiles.findIndex((tile) => tile === TileType.Floor);
  state.visitors.push(makeVisitor(state, ship, 90502, buildTile));
  const resident = makeLegacyResidentFixture(state, ship, 90503, buildTile);
  state.residents.push(resident);
  state.reservations.push({
    id: 90504,
    ownerKind: 'resident',
    ownerId: resident.id,
    kind: 'provider-slot',
    targetTile: buildTile,
    targetId: 'legacy-resident-stale-claim',
    itemType: null,
    amount: 1,
    capacity: 1,
    createdAt: state.now,
    expiresAt: state.now + 999,
    releaseReason: null
  });
  const expectedResidentDurable = {
    id: resident.id,
    homeDockId: resident.homeDockId,
    housingUnitId: resident.housingUnitId,
    bedModuleId: resident.bedModuleId,
    satisfaction: resident.satisfaction
  };

  const legacy = legacyLoad(state, 9050, (snapshot) => {
    delete snapshot.maintenance;
    for (const visitor of snapshot.visitors as Array<Record<string, unknown>>) {
      for (const field of [
        'stayClass', 'needs', 'serviceFailureStage', 'failureNeed', 'failureSince',
        'strandedFromShipId', 'strandedAt', 'transferPhase', 'transferSlotKey',
        'transferQueuedAt', 'transferCrossingStartedAt', 'queueProviderTile',
        'queueJoinedAt', 'temporarySleepTargetTile'
      ]) delete visitor[field];
    }
    for (const savedResident of snapshot.residents as Array<Record<string, unknown>>) {
      // Fractional-but-in-bounds reproduces a permissive old snapshot while
      // still giving hydration one physically walkable canonical tile.
      savedResident.tileIndex = buildTile + 0.75;
      for (const field of [
        'path', 'reservedTargetTile', 'reservedServingTile', 'serveTimer',
        'movementWaitReason', 'movementReplanCooldownUntil', 'carryingMeal',
        'lastRouteExposure', 'activeIncidentId', 'confrontationUntil',
        'agitation', 'homeShipId'
      ]) delete savedResident[field];
    }
  });

  const loaded = legacy.state.visitors.find((entry) => entry.id === 90502);
  assert(loaded, 'A legacy occupant was dropped instead of defaulted.');
  assert(
    loaded.transferPhase === 'station' && loaded.transferSlotKey === null && loaded.transferQueuedAt === null,
    'Legacy occupant did not default to safe station-side transfer state.'
  );
  assert(
    loaded.stayClass === 'errand' && loaded.serviceFailureStage === 'none' && loaded.failureNeed === null &&
      loaded.needs === undefined && loaded.strandedFromShipId === null &&
      loaded.queueProviderTile === null && loaded.queueJoinedAt === null && loaded.temporarySleepTargetTile === null,
    'Legacy occupant did not default the rest of the new occupant state safely.'
  );

  const loadedResident = legacy.state.residents.find((entry) => entry.id === resident.id);
  assert(loadedResident, 'A real legacy Resident was dropped or converted into a visitor.');
  assert(
    !legacy.state.visitors.some((entry) => entry.id === resident.id) &&
      legacy.state.residents.filter((entry) => entry.id === resident.id).length === 1,
    'Legacy Resident identity changed population or duplicated during hydration.'
  );
  assert(
    loadedResident.tileIndex === buildTile && legacy.state.tiles[loadedResident.tileIndex] === TileType.Floor &&
      loadedResident.x === (buildTile % legacy.state.width) + 0.5 &&
      loadedResident.y === Math.floor(buildTile / legacy.state.width) + 0.5,
    'Legacy Resident tile was not clamped onto its physically valid station position.'
  );
  assert(
    loadedResident.path.length === 0 && loadedResident.reservedTargetTile === null &&
      loadedResident.reservedServingTile === null && loadedResident.serveTimer === undefined &&
      loadedResident.movementWaitReason === undefined && loadedResident.movementReplanCooldownUntil === undefined &&
      loadedResident.lastRouteExposure === undefined &&
      !legacy.state.reservations.some((entry) => entry.ownerKind === 'resident' && entry.ownerId === resident.id),
    'Legacy Resident retained a stale route, target, interaction, exposure, or reservation claim.'
  );
  assert(
    loadedResident.carryingMeal === false && loadedResident.activeIncidentId === null &&
      (loadedResident.agitation ?? 0) === 0 && loadedResident.confrontationUntil === undefined,
    'Legacy Resident did not default to neutral carrying and incident state.'
  );
  assert(
    loadedResident.id === expectedResidentDurable.id &&
      loadedResident.homeDockId === expectedResidentDurable.homeDockId &&
      loadedResident.housingUnitId === expectedResidentDurable.housingUnitId &&
      loadedResident.bedModuleId === expectedResidentDurable.bedModuleId &&
      loadedResident.satisfaction === expectedResidentDurable.satisfaction,
    'Legacy Resident lost durable identity, home-dock, housing, bed, or satisfaction state.'
  );
  assert(
    loadedResident.state === ResidentState.Idle && loadedResident.homeShipId === null &&
      !legacy.state.arrivingShips.some((entry) => entry.kind === 'resident_home' && entry.id === loadedResident.homeShipId),
    'Legacy Resident resumed a forced departure toward a departed home ship.'
  );

  const audit = auditSaveRecovery(legacy.state);
  assert(
    legacy.state.exteriorIntegrityTargets.length === 0 && legacy.state.maintenanceDebts.length === 0 &&
      audit.breachedIntegrityTargets === 0 && audit.openRepairJobs === 0,
    'A legacy save without a maintenance block invented integrity or damage state.'
  );
  legacy.state.controls.paused = false;
  for (let step = 0; step < 4; step += 1) tick(legacy.state, 0.5);
  assert(
    legacy.state.exteriorIntegrityTargets.length === state.exteriorIntegrityTargets.length &&
      auditSaveRecovery(legacy.state).breachedIntegrityTargets === 0,
    'Resuming a legacy save did not rebuild an undamaged integrity ledger from geometry.'
  );
  assert(
    legacy.state.residents.some((entry) => entry.id === resident.id) &&
      legacy.state.usageTotals.residentDepartures === state.usageTotals.residentDepartures,
    'Legacy Resident was forced to depart after the first resumed simulation ticks.'
  );
  evidence.legacyDerivations += 1;
}

/**
 * Movement intents and the congestion map are never carried on the wire. A
 * loaded station has to plan its own, which only a running station can prove.
 */
function testCongestionAndMovementIntentsRebuild(): void {
  const state = berthFixture(9060);
  state.controls.paused = false;
  for (let step = 0; step < 60; step += 1) tick(state, 0.5);
  const before = auditSaveRecovery(state);
  assert(before.actorsWithPaths > 0 && state.pathOccupancyByTile.size > 0, 'Fixture never produced live movement to reload.');

  const wire = JSON.parse(serializeSave('phase9-movement', state, 'phase9')) as {
    snapshot: { crew: { members: Array<Record<string, unknown>> }; visitors?: Array<Record<string, unknown>> };
  };
  assert(
    wire.snapshot.crew.members.every((member) => member.path === undefined) &&
      (wire.snapshot.visitors ?? []).every((visitor) => visitor.path === undefined),
    'The save carried actor paths on the wire instead of rebuilding them.'
  );

  const restored = roundTrip(state, 9060).state;
  assert(
    auditSaveRecovery(restored).actorsWithPaths === 0 && restored.pathOccupancyByTile.size === 0,
    'Hydration resumed with movement intents it did not plan.'
  );
  restored.controls.paused = false;
  for (let step = 0; step < 6; step += 1) tick(restored, 0.5);
  const after = auditSaveRecovery(restored);
  assert(after.actorsWithPaths > 0, 'Movement intents were not replanned after load.');
  assert(restored.pathOccupancyByTile.size > 0, 'The congestion map was not rebuilt after load.');
  assert(after.pathlessActors === 0, 'A reloaded actor was left standing on nothing walkable.');
  evidence.rebuiltTransientChecks += 1;
}

/**
 * Maintenance identity is a key, not a slot. It has to name the same physical
 * panel after a reload and after the map grows underneath it.
 */
function testMaintenanceIdentityThroughExpansion(): void {
  const state = fixture(9070);
  state.controls.paused = false;
  for (let step = 0; step < 40; step += 1) tick(state, 30);
  const tracked = state.maintenanceDebts.filter((debt) => debt.debt > 1).slice(0, 8);
  assert(tracked.length > 0, 'Fixture accrued no maintenance debt to track.');

  const restored = roundTrip(state, 9070).state;
  restored.controls.paused = false;
  for (let step = 0; step < 4; step += 1) tick(restored, 0.5);
  for (const debt of tracked) {
    const found = restored.maintenanceDebts.find((entry) => entry.key === debt.key);
    assert(found, `Maintenance debt ${debt.key} lost its identity across a reload.`);
    assert(Math.abs(found.debt - debt.debt) < 2, `Maintenance debt ${debt.key} did not keep its accrued value across a reload.`);
  }

  // Growing north keeps the width, so every surviving tile index shifts by the
  // number of tiles the map gained. Identity has to follow the physical panel
  // across that shift rather than the index it happened to hold when saved.
  restored.metrics.credits = Math.max(restored.metrics.credits, 9000);
  const carriedDebt = new Map(tracked.map((debt) =>
    [debt.key, restored.maintenanceDebts.find((entry) => entry.key === debt.key)?.debt ?? debt.debt]
  ));
  const tilesBefore = restored.tiles.length;
  const expansion = expandMap(restored, 'north');
  assert(expansion.ok, `Map expansion failed: ${expansion.ok ? '' : expansion.reason}`);
  const tileShift = restored.tiles.length - tilesBefore;
  for (let step = 0; step < 2; step += 1) tick(restored, 0.5);
  for (const debt of tracked) {
    const expectedAnchor = debt.anchorTile + tileShift;
    const carried = carriedDebt.get(debt.key) ?? debt.debt;
    // Exterior integrity is keyed in world space, so its key must survive the
    // shift untouched; tile-anchored keys must be re-keyed onto the new index.
    const expectedKey = debt.key.startsWith('integrity:')
      ? debt.key
      : debt.key.replace(/:\d+$/, `:${expectedAnchor}`);
    const found = restored.maintenanceDebts.find((entry) => entry.key === expectedKey);
    assert(found, `Maintenance debt ${debt.key} lost its identity when the map expanded (expected key ${expectedKey}).`);
    assert(found.anchorTile === expectedAnchor, `Maintenance debt ${debt.key} did not follow its panel to the shifted tile index.`);
    assert(Math.abs(found.debt - carried) < 3, `Maintenance debt ${debt.key} was reset by map expansion.`);
  }
  evidence.maintenanceIdentityChecks += tracked.length;
}

function main(): void {
  testApproachCommitmentRoundTrip();
  testDockedVisitPhasesAndSettlement();
  testDurableConstructionIntegrityAndTransientReset();
  testInvalidDockBindingReturnsToHolding();
  testLegacyStructureDocksAndBerths();
  testLegacyOccupantAndIntegrityDefaults();
  testCongestionAndMovementIntentsRebuild();
  testMaintenanceIdentityThroughExpansion();
  console.log(
    `phase9-save-migration-tests: ok phases=${evidence.durablePhaseRecords} transient=${evidence.rebuiltTransientChecks}` +
    ` warnings=${evidence.reconciliationWarnings} legacy=${evidence.legacyDerivations} maintenance=${evidence.maintenanceIdentityChecks}`
  );
}

main();
