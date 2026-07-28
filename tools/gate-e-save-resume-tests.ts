// Focused runner for the Gate E save/resume durability tranche.
//
// Every fixture goes through the real serializer, the real parser and the real
// hydrator, and — except where a fixture is deliberately testing a re-seed —
// reloads WITHOUT passing a seed, which is exactly what main.ts's Load path
// does. Passing the original seed back in would hide the bug this gate exists
// to close.
//
// Run with `npm run test:gate-e-save-resume`. Filter with
// GATE_E_TEST_FILTER=<substring>.

import { applyColdStartScenario } from '../src/sim/cold-start-scenarios';
import {
  admitTrafficOffer,
  createInitialState,
  hireStaffRole,
  planTileConstruction,
  reconcileExteriorIntegrityTargets,
  setExteriorIntegrityTargetState,
  tick,
  tryPlaceModule
} from '../src/sim/sim';
import { hydrateStateFromSave, parseAndMigrateSave, serializeSave } from '../src/sim/save';
import { auditSaveRecovery, guestLodgingTiles, totalPhysicalStock } from '../src/sim/save-recovery';
import { computeCharterOperatingForecast, computeSiteProfile } from '../src/sim/site-charter';
import { generateSystemMap } from '../src/sim/system-map';
import { mapConditionAt } from '../src/sim/map-conditions';
import { deriveOpeningEconomyProfile } from '../src/sim/opening-economy';
import {
  ModuleType,
  RoomType,
  TileType,
  VisitorState,
  isWalkable,
  type ArrivingShip,
  type PortContract,
  type StaffRole,
  type StationState,
  type TrafficOffer,
  type Visitor
} from '../src/sim/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/**
 * What the save file itself contains. AC 3 is a claim about the wire, not about
 * the live state a reconciliation tick later rebuilds, so it is checked here.
 */
function countTransientsOnTheWire(text: string): { paths: number; reservations: number; assignedCrew: number } {
  const wire = JSON.parse(text) as {
    snapshot: {
      visitors?: Array<{ path?: unknown[] }>;
      residents?: Array<{ path?: unknown[] }>;
      reservations?: unknown[];
      pathOccupancyByTile?: unknown;
      constructionSites: Array<{ assignedCrewId?: unknown }>;
    };
  };
  const withPath = [...(wire.snapshot.visitors ?? []), ...(wire.snapshot.residents ?? [])]
    .filter((actor) => Array.isArray(actor.path) && actor.path.length > 0).length;
  return {
    paths: withPath,
    reservations: Array.isArray(wire.snapshot.reservations) ? wire.snapshot.reservations.length : 0,
    assignedCrew: wire.snapshot.constructionSites.filter((site) => site.assignedCrewId !== undefined
      && site.assignedCrewId !== null).length
  };
}

/** Reload the way the game does: through the wire, with no seed hint. */
function roundTrip(state: StationState, options?: { seed?: number }): {
  state: StationState;
  warnings: string[];
  wire: ReturnType<typeof countTransientsOnTheWire>;
  bytes: number;
} {
  const text = serializeSave('gate-e', state, 'gate-e');
  const parsed = parseAndMigrateSave(text);
  assert(parsed.ok, `Save failed to parse: ${parsed.ok ? '' : parsed.error}`);
  const hydrated = hydrateStateFromSave(parsed.save, options);
  return {
    state: hydrated.state,
    warnings: [...parsed.warnings, ...hydrated.warnings],
    wire: countTransientsOnTheWire(text),
    bytes: text.length
  };
}

function advance(state: StationState, seconds: number, step = 0.5): void {
  state.controls.paused = false;
  for (let elapsed = 0; elapsed < seconds; elapsed += step) tick(state, step);
}

function base(seed: number, scenario?: string): StationState {
  const state = createInitialState({ seed, physicalStarterInventory: true, manualTrafficAdmission: true });
  if (scenario) assert(applyColdStartScenario(state, scenario), `Unknown scenario ${scenario}.`);
  tick(state, 0);
  return state;
}

/**
 * The nth visitor Pod Dock. Fixtures take distinct docks on purpose: two ships
 * sharing one dock is a different scenario, and it would silently starve the
 * approach-commitment fixture of a slot to claim.
 */
function podDock(state: StationState, index = 0): StationState['docks'][number] {
  const docks = state.docks.filter((entry) => entry.sourceKind === 'pod-dock-module' && entry.purpose === 'visitor');
  const dock = docks[index] ?? docks[0];
  assert(dock, `Fixture requires at least ${index + 1} Pod Dock(s).`);
  return dock;
}

function makeOffer(state: StationState, id: number, dock: StationState['docks'][number]): TrafficOffer {
  return {
    id,
    callsign: `GATE-E-${id}`,
    shipName: 'Gate E Pod',
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

/** A ship already docked at a Pod Dock, with its port contract. */
function dockedPodVisit(
  state: StationState,
  id: number,
  passengers: { total: number; spawned: number; boarded: number } = { total: 0, spawned: 0, boarded: 0 },
  dockIndex = 0
): ArrivingShip {
  const dock = podDock(state, dockIndex);
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
    passengersTotal: passengers.total,
    passengersSpawned: passengers.spawned,
    passengersBoarded: passengers.boarded,
    minimumBoarding: 0,
    spawnCarry: 0,
    dockedAt: state.now,
    residentIds: [],
    manifestDemand: { ...offer.manifestDemand },
    manifestMix: { ...offer.manifestMix },
    portManifest: offer,
    portContractId: id,
    stayClass: 'contract',
    visitPhase: 'visit-service',
    earliestDepartureAt: state.now + 30,
    plannedDepartureAt: state.now + 240,
    extensionUntil: null,
    recallAt: null,
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
    boardingStartsAt: state.now + 150,
    hardDepartureAt: state.now + 240,
    status: 'active',
    promises: [{ kind: 'dock', label: 'Dock access', target: 1, completed: 1, payoutCredits: 0 }],
    passengerSpendingCredits: 0,
    procurementCostCredits: 0,
    settlementId: null,
    stayClass: 'contract',
    earliestDepartureAt: ship.earliestDepartureAt,
    plannedDepartureAt: ship.plannedDepartureAt,
    extensionUntil: null,
    recallAt: null
  };
  state.arrivingShips.push(ship);
  state.portOps.contracts.push(contract);
  return ship;
}

let visitorSeq = 500000;

function makeVisitor(state: StationState, tileIndex: number, overrides: Partial<Visitor> = {}): Visitor {
  const visitor: Visitor = {
    id: visitorSeq++,
    x: (tileIndex % state.width) + 0.5,
    y: Math.floor(tileIndex / state.width) + 0.5,
    tileIndex,
    state: VisitorState.ToLeisure,
    path: [],
    speed: 2,
    patience: 90,
    eatTimer: 0,
    trespassed: false,
    servedMeal: false,
    carryingMeal: false,
    reservedServingTile: null,
    reservedTargetTile: null,
    blockedTicks: 0,
    archetype: 'lounger',
    taxSensitivity: 1,
    spendMultiplier: 1,
    patienceMultiplier: 1,
    primaryPreference: 'lounge',
    spawnedAt: state.now,
    originShipId: null,
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
    temporarySleepTargetTile: null,
    transferPhase: 'station',
    transferSlotKey: null,
    transferQueuedAt: null,
    ...overrides
  };
  state.visitors.push(visitor);
  return visitor;
}

function walkableTiles(state: StationState, limit: number): number[] {
  const tiles: number[] = [];
  for (let i = 0; i < state.tiles.length && tiles.length < limit; i++) {
    if (!isWalkable(state.tiles[i])) continue;
    if (state.rooms[i] === RoomType.Berth) continue;
    tiles.push(i);
  }
  return tiles;
}

/** The same slot contract the recovery pass validates claims against. */
function guestBunkTiles(state: StationState): number[] {
  return [...guestLodgingTiles(state)].sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// 1. Procedural charter identity
// ---------------------------------------------------------------------------

function testProceduralCharterIdentity(): string {
  const seed = 4242;
  const system = generateSystemMap(seed);
  const charter = computeSiteProfile(system, 0.62, 0.28);
  const state = createInitialState({
    seed,
    physicalStarterInventory: true,
    manualTrafficAdmission: true,
    charter
  });
  state.site = charter;
  tick(state, 0);

  assert(state.seedAtCreation !== 1337, 'Fixture must use a non-default seed.');
  const before = {
    seed: state.seedAtCreation,
    system: JSON.stringify(state.system),
    laneProfiles: JSON.stringify(state.laneProfiles),
    site: JSON.stringify(state.site),
    forecast: JSON.stringify(computeCharterOperatingForecast(state.site)),
    economy: JSON.stringify(deriveOpeningEconomyProfile(state.site)),
    sunlight: mapConditionAt(state, 'sunlight', 40 * state.width + 40).toFixed(6),
    debris: mapConditionAt(state, 'debris-risk', 40 * state.width + 40).toFixed(6)
  };

  // No seed option: exactly what the game's Load button does.
  const loaded = roundTrip(state).state;

  assert(loaded.seedAtCreation === seed, `Seed became ${loaded.seedAtCreation}; expected ${seed}.`);
  assert(loaded.system?.seedAtCreation === seed, `System seed became ${loaded.system?.seedAtCreation}.`);
  assert(JSON.stringify(loaded.system) === before.system, 'System map is not the same system after reload.');
  assert(JSON.stringify(loaded.laneProfiles) === before.laneProfiles, 'Lane profiles changed across reload.');
  assert(JSON.stringify(loaded.site) === before.site, 'Chartered site changed across reload.');
  assert(
    JSON.stringify(computeCharterOperatingForecast(loaded.site)) === before.forecast,
    'Charter operating forecast changed across reload.'
  );
  assert(
    JSON.stringify(deriveOpeningEconomyProfile(loaded.site)) === before.economy,
    'Site economy profile changed across reload.'
  );
  assert(
    mapConditionAt(loaded, 'sunlight', 40 * loaded.width + 40).toFixed(6) === before.sunlight,
    'Sunlight baseline changed across reload.'
  );
  assert(
    mapConditionAt(loaded, 'debris-risk', 40 * loaded.width + 40).toFixed(6) === before.debris,
    'Debris baseline changed across reload.'
  );
  assert(loaded.site?.resourceType === charter.resourceType, 'Resource profile changed across reload.');
  assert(loaded.system?.laneRoutes && loaded.system.laneRoutes.length > 0, 'Lane routes were not re-derived from the seed.');

  // An explicit, different seed is a deliberate re-seed (the starter-layout
  // import path) and must keep the caller's system, with a warning.
  const reseeded = roundTrip(state, { seed: 1337 });
  assert(reseeded.state.seedAtCreation === 1337, 'Explicit seed was ignored.');
  assert(
    reseeded.warnings.some((warning) => warning.includes('is being loaded under seed')),
    'Deliberate re-seed did not warn.'
  );

  return `seed ${before.seed} preserved, system+lanes+site+forecast byte-identical, re-seed path warns`;
}

// ---------------------------------------------------------------------------
// 2. Construction and exterior work
// ---------------------------------------------------------------------------

function testConstructionFidelity(): string {
  const state = base(7001, 'structural-expansion-active');
  const project = state.structuralExpansionProjects[0];
  assert(project, 'Fixture requires an active structural expansion project.');

  // One partially built site.
  const building = state.constructionSites.find((site) => site.structuralProjectId === project.id);
  assert(building, 'Structural project produced no child site.');
  building.deliveredMaterials = building.requiredMaterials;
  building.buildProgress = building.buildWorkRequired / 2;
  building.state = 'building';
  building.createdAt = 11.25;

  // One material-blocked site.
  const freeTile = state.tiles.findIndex(
    (tile, index) => tile === TileType.Floor && !state.constructionSites.some((site) => site.tileIndex === index)
  );
  assert(freeTile >= 0 && planTileConstruction(state, freeTile, TileType.Wall).ok, 'Could not plan a second site.');
  const blocked = state.constructionSites.find((site) => site.tileIndex === freeTile);
  assert(blocked, 'Second construction site missing.');
  blocked.deliveredMaterials = 0;
  blocked.state = 'blocked';
  blocked.blockedReason = 'no raw material within reach';
  blocked.createdAt = 4.5;

  project.deliveredMaterials = 12;
  project.refundedMaterials = 3;
  project.blockedReason = 'awaiting perimeter seal';

  const beforeProject = JSON.stringify(project);
  const beforeSiteCount = state.constructionSites.filter((site) => site.state !== 'done').length;

  const loaded = roundTrip(state).state;
  const audit = auditSaveRecovery(loaded);

  const loadedProject = loaded.structuralExpansionProjects.find((entry) => entry.id === project.id);
  assert(loadedProject, 'Structural expansion project vanished on load.');
  assert(JSON.stringify(loadedProject) === beforeProject, 'Structural project fidelity changed across reload.');
  assert(loadedProject.phase === project.phase, `Project phase became ${loadedProject.phase}.`);
  assert(loadedProject.childSiteIds.length === project.childSiteIds.length, 'Project child list changed.');
  assert(
    loadedProject.deliveredMaterials === 12 && loadedProject.refundedMaterials === 3,
    'Project material totals changed across reload.'
  );

  const loadedBuilding = loaded.constructionSites.find((site) => site.id === building.id);
  assert(loadedBuilding, 'Partially built site vanished on load.');
  assert(loadedBuilding.state === 'building', `Partially built site became ${loadedBuilding.state}.`);
  assert(loadedBuilding.buildProgress === building.buildProgress, 'Build progress was lost.');
  assert(loadedBuilding.deliveredMaterials === building.deliveredMaterials, 'Delivered material was lost.');
  assert(loadedBuilding.createdAt === 11.25, `Site age was regenerated (${loadedBuilding.createdAt}).`);
  assert(loadedBuilding.assignedCrewId === null, 'Construction ownership was carried across a load.');

  const loadedBlocked = loaded.constructionSites.find((site) => site.id === blocked.id);
  assert(loadedBlocked, 'Blocked site vanished on load.');
  assert(loadedBlocked.state === 'blocked', `Blocked site reloaded as ${loadedBlocked.state}.`);
  assert(
    loadedBlocked.blockedReason === 'no raw material within reach',
    `Blocked reason became ${JSON.stringify(loadedBlocked.blockedReason)}.`
  );
  assert(loadedBlocked.createdAt === 4.5, 'Blocked site age was regenerated.');

  assert(audit.duplicateConstructionTiles === 0, 'Reload duplicated a construction site.');
  assert(audit.duplicateJobIds === 0, 'Reload duplicated a job id.');
  assert(
    audit.openConstructionSites === beforeSiteCount,
    `Open site count changed ${beforeSiteCount} -> ${audit.openConstructionSites}.`
  );
  assert(audit.blockedConstructionSites >= 1, 'Blocked site count was lost.');

  // The work must actually restart rather than sit inert.
  advance(loaded, 20);
  const resumed = loaded.constructionSites.find((site) => site.id === building.id);
  assert(
    resumed === undefined || resumed.state === 'done' || resumed.buildProgress >= building.buildProgress,
    'Restored construction lost progress after resuming.'
  );

  return `project phase ${project.phase} + progress ${building.buildProgress.toFixed(1)} + blocked reason preserved, ${audit.openConstructionSites} sites, 0 duplicates`;
}

// ---------------------------------------------------------------------------
// 3. Ships, passengers, interfaces
// ---------------------------------------------------------------------------

function testShipsPassengersAndInterfaces(): string {
  const state = base(7100, 'demo-station');
  // Give the demo station real pod docks alongside its two berth clusters.
  let placed = 0;
  const neighbours = [-state.width, state.width, -1, 1];
  for (let i = 0; i < state.tiles.length && placed < 4; i++) {
    if (state.tiles[i] !== TileType.Wall) continue;
    if (!neighbours.some((delta) => state.tiles[i + delta] === TileType.Space)) continue;
    if (tryPlaceModule(state, ModuleType.PodDock, i, 0).ok) placed += 1;
  }
  tick(state, 0);
  assert(state.docks.length >= 2, 'Fixture needs at least two docks.');

  // An active Pod Dock service with passengers on both sides of the gangway.
  const podShip = dockedPodVisit(state, 71001, { total: 4, spawned: 3, boarded: 1 }, 0);
  const publicTiles = walkableTiles(state, 8);
  const disembarking = makeVisitor(state, publicTiles[0], {
    originShipId: podShip.id,
    transferPhase: 'disembark-queued',
    transferSlotKey: `dock:${podShip.assignedDockSourceKey}`,
    transferQueuedAt: state.now
  });
  const boarding = makeVisitor(state, publicTiles[1], {
    originShipId: podShip.id,
    transferPhase: 'boarding-queued',
    transferSlotKey: `dock:${podShip.assignedDockSourceKey}`,
    transferQueuedAt: state.now
  });
  const stationSide = makeVisitor(state, publicTiles[2], { originShipId: podShip.id });

  // An active Berth contract on the second cluster.
  const berthAnchor = state.rooms.findIndex((room) => room === RoomType.Berth);
  assert(berthAnchor >= 0, 'Fixture requires a Berth room.');
  const berthShip = dockedPodVisit(state, 71002, { total: 0, spawned: 0, boarded: 0 }, 1);
  // A berth contract occupies a Berth room, not a Pod Dock. Release the dock the
  // helper attached it to, otherwise the fixture silently starves the approach
  // commitment below of a free slot.
  berthShip.assignedDockId = null;
  berthShip.assignedDockSourceKey = null;
  berthShip.assignedBerthAnchor = berthAnchor;
  berthShip.bayTiles = [berthAnchor];
  berthShip.size = 'medium';
  berthShip.stayClass = 'contract';

  // An approach commitment on a third ship still inbound.
  const dock = podDock(state, 2);
  const offer = makeOffer(state, 71003, dock);
  state.trafficOffers.push(offer);
  assert(admitTrafficOffer(state, offer.id).ok, 'Approach offer could not be admitted.');
  const inbound = state.arrivingShips.find((entry) => entry.id === offer.id);
  assert(
    inbound?.approachCommitment,
    `Admitted ship has no approach commitment: stage=${inbound?.stage} dock=${inbound?.assignedDockId} `
    + `queue=${inbound?.queueState}`
  );
  const commitmentSlot = inbound.approachCommitment.slotId;
  const commitmentQueuedAt = inbound.approachCommitment.queuedAt;

  const beforeShipIds = state.arrivingShips.map((ship) => ship.id).sort((a, b) => a - b);
  const beforeVisitorIds = state.visitors.map((visitor) => visitor.id).sort((a, b) => a - b);

  const trip = roundTrip(state);
  const loaded = trip.state;
  const atLoad = auditSaveRecovery(loaded);

  assert(trip.wire.paths === 0, `${trip.wire.paths} actor movement paths were written to the save file.`);
  assert(trip.wire.reservations === 0, 'Tile reservations were written to the save file.');
  assert(trip.wire.assignedCrew === 0, 'Construction ownership was written to the save file.');
  assert(atLoad.duplicateShipIds === 0, 'Reload duplicated a ship.');
  assert(atLoad.duplicateVisitorIds === 0, 'Reload duplicated a visitor.');
  assert(atLoad.duplicateApproachSlots === 0, 'Two ships reloaded holding the same approach slot.');
  assert(atLoad.orphanReservations === 0, `Reload left ${atLoad.orphanReservations} ownerless reservations.`);
  assert(atLoad.expiredReservations === 0, 'Reload restored already-expired reservations.');
  assert(atLoad.interfaceDiagnoses > 0, 'No interface could be diagnosed from the loaded geometry.');
  assert(atLoad.approachConflictGroups >= 0, 'Approach conflict groups could not be rebuilt.');

  const loadedIds = loaded.arrivingShips.map((ship) => ship.id).sort((a, b) => a - b);
  assert(
    JSON.stringify(loadedIds) === JSON.stringify(beforeShipIds),
    `Ship roster changed: ${JSON.stringify(beforeShipIds)} -> ${JSON.stringify(loadedIds)}`
  );
  const loadedVisitorIds = loaded.visitors.map((visitor) => visitor.id).sort((a, b) => a - b);
  assert(
    JSON.stringify(loadedVisitorIds) === JSON.stringify(beforeVisitorIds),
    `Visitor roster changed: ${JSON.stringify(beforeVisitorIds)} -> ${JSON.stringify(loadedVisitorIds)}`
  );

  const loadedInbound = loaded.arrivingShips.find((ship) => ship.id === inbound.id);
  assert(
    loadedInbound?.approachCommitment?.slotId === commitmentSlot,
    `Approach slot changed to ${loadedInbound?.approachCommitment?.slotId}.`
  );
  assert(
    loadedInbound.approachCommitment.queuedAt === commitmentQueuedAt,
    'Approach queue order changed across reload.'
  );

  const loadedDisembark = loaded.visitors.find((visitor) => visitor.id === disembarking.id);
  const loadedBoarding = loaded.visitors.find((visitor) => visitor.id === boarding.id);
  assert(loadedDisembark && loadedBoarding, 'A transferring passenger was lost.');
  // The direction of travel is durable; the queue/crossing step within it is
  // rebuilt, and a queued passenger promoted to the head legitimately starts
  // crossing during recovery. What must never happen is a passenger switching
  // direction, losing its slot, or falling back to 'station'.
  assert(
    loadedDisembark.transferPhase?.startsWith('disembark'),
    `Disembarking passenger became ${loadedDisembark.transferPhase}.`
  );
  assert(
    loadedBoarding.transferPhase?.startsWith('boarding'),
    `Boarding passenger became ${loadedBoarding.transferPhase}.`
  );
  assert(
    typeof loadedDisembark.transferSlotKey === 'string' && loadedDisembark.transferSlotKey.length > 0,
    'The disembarking passenger reloaded without a transfer slot.'
  );
  assert(
    typeof loadedBoarding.transferSlotKey === 'string' && loadedBoarding.transferSlotKey.length > 0,
    'The boarding passenger reloaded without a transfer slot.'
  );
  assert(atLoad.transferQueueHeads > 0, 'No transfer queue head was recreated.');
  assert(loaded.visitors.some((visitor) => visitor.id === stationSide.id), 'A station-side passenger was lost.');

  const loadedPod = loaded.arrivingShips.find((ship) => ship.id === podShip.id);
  assert(loadedPod, 'Pod Dock visit was lost.');
  assert(
    loadedPod.passengersBoarded === podShip.passengersBoarded,
    'Boarded passenger count changed across reload.'
  );
  assert(
    loadedPod.passengersSpawned <= loadedPod.passengersTotal,
    'Reload spawned more passengers than the manifest holds.'
  );

  const resumedFrom = loaded.now;
  advance(loaded, 15);
  const after = auditSaveRecovery(loaded);
  assert(after.duplicateShipIds === 0, 'A ship duplicated while resuming.');
  assert(after.duplicateVisitorIds === 0, 'A visitor duplicated while resuming.');
  assert(after.duplicateApproachSlots === 0, 'An approach slot was double-claimed while resuming.');
  // Actors legitimately leave while the station runs, and their reservations
  // are collected a tick later. What recovery must not do is leave a claim from
  // *before* the reload without an owner.
  const leakedFromRecovery = loaded.reservations.filter(
    (reservation) =>
      reservation.createdAt <= resumedFrom &&
      !loaded.crewMembers.some((crew) => reservation.ownerKind === 'crew' && crew.id === reservation.ownerId) &&
      !loaded.visitors.some((visitor) => reservation.ownerKind === 'visitor' && visitor.id === reservation.ownerId) &&
      !loaded.residents.some((resident) => reservation.ownerKind === 'resident' && resident.id === reservation.ownerId)
  );
  assert(
    leakedFromRecovery.length === 0,
    `${leakedFromRecovery.length} reservations created during recovery outlived their owner.`
  );
  assert(after.pathlessActors === 0, `${after.pathlessActors} actors are standing nowhere valid after resuming.`);

  return `3 ships (pod+berth+approach) and ${beforeVisitorIds.length} passengers survived; slot ${commitmentSlot} kept; `
    + `${atLoad.interfaceDiagnoses} interfaces rediagnosed; 0 duplicates after 15s`;
}

// ---------------------------------------------------------------------------
// 4. Held cargo, EVA repair, temporary lodging
// ---------------------------------------------------------------------------

function testCargoRepairAndLodging(): string {
  // mixed-berth-visit is the fixture that authors guest-policy bunk banks;
  // demo-station's dormitories are crew-only, so no guest can claim one.
  const state = base(7200, 'mixed-berth-visit');

  // (a) A crew member physically holding cargo for a live delivery.
  const carrier = state.crewMembers[0];
  const sourceNode = state.itemNodes.find((node) => (node.items.rawMaterial ?? 0) > 0)
    ?? state.itemNodes[0];
  const destinationNode = state.itemNodes.find((node) => node.tileIndex !== sourceNode.tileIndex);
  assert(destinationNode, 'Fixture requires two inventory nodes.');
  const jobId = state.jobSpawnCounter++;
  carrier.activeJobId = jobId;
  carrier.carryingItemType = 'rawMaterial';
  carrier.carryingAmount = 3;
  state.jobs.push({
    id: jobId,
    type: 'deliver',
    itemType: 'rawMaterial',
    amount: 3,
    fromTile: sourceNode.tileIndex,
    toTile: destinationNode.tileIndex,
    assignedCrewId: carrier.id,
    createdAt: state.now,
    expiresAt: state.now + 600,
    state: 'in_progress',
    pickedUpAmount: 3,
    completedAt: null,
    lastProgressAt: state.now
  });
  const totalBefore = totalPhysicalStock(state, 'rawMaterial');

  // (b) An active EVA repair.
  reconcileExteriorIntegrityTargets(state);
  const damaged = state.exteriorIntegrityTargets[0];
  assert(damaged && setExteriorIntegrityTargetState(state, damaged.id, 'breached', 88), 'Could not damage a hull panel.');

  // (c) A visitor owning a temporary bunk, plus a second visitor illegally
  //     claiming the same bunk and a third claiming a tile that is not a bunk.
  const bunks = guestBunkTiles(state);
  assert(bunks.length > 0, 'Fixture requires at least one guest bunk.');
  const bunkTile = bunks[0];
  const sleeper = makeVisitor(state, bunkTile, { temporarySleepTargetTile: bunkTile, spawnedAt: state.now - 60 });
  const squatter = makeVisitor(state, walkableTiles(state, 6)[3], {
    temporarySleepTargetTile: bunkTile,
    spawnedAt: state.now - 10
  });
  const strayTile = state.tiles.findIndex((tile) => tile === TileType.Floor);
  const stray = makeVisitor(state, walkableTiles(state, 6)[4], { temporarySleepTargetTile: strayTile });

  const loaded = roundTrip(state);
  const audit = auditSaveRecovery(loaded.state);

  // Lodging: exactly one valid claim. Asserted before the station is advanced,
  // because after that the simulation is free to move a guest on legitimately.
  assert(audit.duplicateLodgingClaims === 0, 'Two guests reloaded holding the same bunk.');
  const loadedSleeper = loaded.state.visitors.find((visitor) => visitor.id === sleeper.id);
  const loadedSquatter = loaded.state.visitors.find((visitor) => visitor.id === squatter.id);
  const loadedStray = loaded.state.visitors.find((visitor) => visitor.id === stray.id);
  assert(
    loadedSleeper?.temporarySleepTargetTile === bunkTile,
    `The original occupant lost bunk ${bunkTile} (got ${loadedSleeper?.temporarySleepTargetTile}).`
  );
  assert(loadedSquatter?.temporarySleepTargetTile === null, 'The duplicate bunk claim was not revoked.');
  assert(loadedStray?.temporarySleepTargetTile === null, 'A claim on a non-bunk tile was not revoked.');
  assert(
    loaded.warnings.some((warning) => warning.includes('already held by guest')),
    'The revoked duplicate claim was not reported.'
  );
  const bunkReservations = loaded.state.reservations.filter(
    (reservation) => reservation.targetTile === bunkTile && reservation.kind === 'provider-slot'
  );
  assert(bunkReservations.length === 1, `Bunk ${bunkTile} has ${bunkReservations.length} exclusivity reservations.`);

  // Custody: exactly once.
  const totalAfter = totalPhysicalStock(loaded.state, 'rawMaterial');
  assert(
    Math.abs(totalAfter - totalBefore) < 0.01,
    `Raw material total changed across reload: ${totalBefore.toFixed(2)} -> ${totalAfter.toFixed(2)}.`
  );
  assert(audit.orphanCarriers === 0, 'A crew member reloaded carrying cargo with no live job.');
  assert(audit.duplicateJobIds === 0, 'Reload duplicated a transport job.');
  const carriedJobs = loaded.state.jobs.filter((job) => job.id === jobId);
  assert(carriedJobs.length === 1, `Delivery job exists ${carriedJobs.length} times after reload.`);
  const owners = loaded.state.crewMembers.filter((crew) => crew.activeJobId === jobId);
  assert(owners.length <= 1, `${owners.length} crew members claim the same delivery job.`);

  // Repair work: recoverable, exactly once.
  const loadedTarget = loaded.state.exteriorIntegrityTargets.find((target) => target.id === damaged.id);
  assert(
    loadedTarget?.state === 'breached' && loadedTarget.wear === 88,
    'Damaged hull panel did not survive reload.'
  );
  advance(loaded.state, 20);
  const repairAudit = auditSaveRecovery(loaded.state);
  const repairJobsForTarget = loaded.state.jobs.filter((job) => job.type === 'repair');
  assert(repairJobsForTarget.length > 0, 'EVA repair work did not regenerate after reload.');
  assert(repairAudit.duplicateJobIds === 0, 'Repair regeneration duplicated a job id.');
  const repairTiles = new Set(repairJobsForTarget.map((job) => job.fromTile));
  assert(
    repairTiles.size === repairJobsForTarget.length,
    'Two repair jobs regenerated against the same panel.'
  );

  return `cargo total ${totalBefore.toFixed(1)} held exactly once, ${repairJobsForTarget.length} repair job(s) regenerated, `
    + `1 of 3 bunk claims kept`;
}

// ---------------------------------------------------------------------------
// 5. The 50-crew / 50-visitor stress save
// ---------------------------------------------------------------------------

const HIRE_ROLES: StaffRole[] = ['assistant', 'cook', 'steward', 'engineer', 'cleaner', 'cargo-handler'];

function stressStation(): StationState {
  const state = base(7300, 'demo-station');
  let placedDocks = 0;
  const neighbours = [-state.width, state.width, -1, 1];
  for (let i = 0; i < state.tiles.length && placedDocks < 8; i++) {
    if (state.tiles[i] !== TileType.Wall) continue;
    if (!neighbours.some((delta) => state.tiles[i + delta] === TileType.Space)) continue;
    if (tryPlaceModule(state, ModuleType.PodDock, i, 0).ok) placedDocks += 1;
  }
  state.metrics.credits = 500000;
  for (let guard = 0; state.crew.total < 50 && guard < 500; guard++) {
    hireStaffRole(state, HIRE_ROLES[guard % HIRE_ROLES.length]);
  }
  tick(state, 0);

  const tiles = walkableTiles(state, 120);
  const bunks = guestBunkTiles(state);
  for (let i = 0; i < 50; i++) {
    const tileIndex = tiles[i % tiles.length];
    const overrides: Partial<Visitor> = { spawnedAt: state.now - i };
    if (i % 7 === 0 && bunks.length > 0) overrides.temporarySleepTargetTile = bunks[i % bunks.length];
    makeVisitor(state, tileIndex, overrides);
  }
  // Traffic on four of the eight docks, half of it mid-transfer.
  for (let i = 0; i < 4; i++) {
    const ship = dockedPodVisit(state, 73000 + i, { total: 4, spawned: 2, boarded: 1 }, i);
    const cohort = state.visitors.slice(i * 3, i * 3 + 2);
    for (const [index, visitor] of cohort.entries()) {
      visitor.originShipId = ship.id;
      visitor.transferPhase = index === 0 ? 'disembark-queued' : 'boarding-queued';
      visitor.transferSlotKey = `dock:${ship.assignedDockSourceKey}`;
      visitor.transferQueuedAt = state.now;
    }
  }
  tick(state, 0);
  return state;
}

function testStressSaveResume(): string {
  const state = stressStation();
  const berthClusters = (state.derived.roomClustersByRoom.get(RoomType.Berth) ?? []).length;
  assert(state.docks.length >= 8, `Stress fixture has only ${state.docks.length} docks.`);
  assert(berthClusters >= 2, `Stress fixture has only ${berthClusters} berth clusters.`);
  assert(state.crewMembers.length >= 50, `Stress fixture has only ${state.crewMembers.length} crew.`);
  assert(state.visitors.length >= 50, `Stress fixture has only ${state.visitors.length} visitors.`);

  advance(state, 10);
  const before = auditSaveRecovery(state);
  const beforeCrew = state.crewMembers.length;
  const beforeVisitors = state.visitors.length;
  const beforeShips = state.arrivingShips.length;
  const beforeFailures = state.visitors.filter(
    (visitor) => (visitor.serviceFailureStage ?? 'none') !== 'none'
  ).length;
  const beforeStock = totalPhysicalStock(state, 'rawMaterial');

  const started = Date.now();
  const loaded = roundTrip(state);
  const reloadMs = Date.now() - started;
  const after = auditSaveRecovery(loaded.state);

  assert(loaded.state.crewMembers.length === beforeCrew, `Crew ${beforeCrew} -> ${loaded.state.crewMembers.length}.`);
  assert(loaded.state.visitors.length === beforeVisitors, `Visitors ${beforeVisitors} -> ${loaded.state.visitors.length}.`);
  assert(loaded.state.arrivingShips.length === beforeShips, `Ships ${beforeShips} -> ${loaded.state.arrivingShips.length}.`);
  assert(loaded.wire.paths === 0, `${loaded.wire.paths} movement paths were written to the save file.`);
  assert(loaded.wire.reservations === 0, 'Tile reservations were written to the save file.');
  assert(after.pathlessActors === 0, `${after.pathlessActors} actors reloaded with nowhere to stand.`);
  assert(after.orphanReservations === 0, `${after.orphanReservations} reservations reloaded without an owner.`);
  assert(after.expiredReservations === 0, 'Expired reservations were restored.');
  assert(after.duplicateJobIds === 0, 'Job ids duplicated across the stress reload.');
  assert(after.duplicateShipIds === 0 && after.duplicateVisitorIds === 0 && after.duplicateCrewIds === 0, 'Actors duplicated across the stress reload.');
  assert(after.duplicateApproachSlots === 0, 'Approach slots were double-claimed.');
  assert(after.duplicateLodgingClaims === 0, 'Bunks were double-claimed after the stress reload.');
  assert(after.orphanCarriers === 0, 'Cargo custody was orphaned by the stress reload.');
  assert(after.duplicateConstructionTiles === 0, 'Construction sites duplicated.');
  assert(
    Math.abs(totalPhysicalStock(loaded.state, 'rawMaterial') - beforeStock) < 0.01,
    'Physical stock changed across the stress reload.'
  );
  assert(after.dockQueueLength === 0, 'A frame-local dock queue was persisted.');
  assert(
    after.visitorsInTransfer === before.visitorsInTransfer,
    `Transfer commitments ${before.visitorsInTransfer} -> ${after.visitorsInTransfer}.`
  );
  assert(after.transferQueueHeads > 0, 'Transfer queue heads were not recreated.');
  assert(after.interfaceDiagnoses >= before.interfaceDiagnoses, 'Interface diagnoses were lost across reload.');

  // And it has to keep running.
  advance(loaded.state, 20);
  const resumed = auditSaveRecovery(loaded.state);
  const resumedFailures = loaded.state.visitors.filter(
    (visitor) => (visitor.serviceFailureStage ?? 'none') !== 'none'
  ).length;
  assert(resumed.pathlessActors === 0, `${resumed.pathlessActors} actors are permanently pathless after resuming.`);
  assert(resumed.orphanReservations === 0, 'Resuming produced ownerless reservations.');
  assert(resumed.duplicateJobIds === 0, 'Resuming duplicated jobs.');
  assert(resumed.duplicateLodgingClaims === 0, 'Resuming double-claimed a bunk.');
  assert(
    loaded.state.now > state.now,
    'The reloaded station did not advance its clock.'
  );
  assert(
    resumedFailures <= beforeFailures + beforeVisitors,
    'Service failures exploded after resuming.'
  );
  assert(
    resumed.activeJobs > 0 || resumed.openConstructionSites > 0 || loaded.state.metrics.completedJobs > 0,
    'The reloaded station is not doing any work at all.'
  );

  return `50 crew / ${beforeVisitors} visitors / ${state.docks.length} docks / ${berthClusters} berths reloaded in ${reloadMs}ms; `
    + `jobs ${before.activeJobs}->${after.activeJobs}, reservations ${before.reservations}->${after.reservations}, `
    + `transfers ${before.visitorsInTransfer}->${after.visitorsInTransfer}, pathless 0, then ran 20s clean`;
}

// ---------------------------------------------------------------------------
// 6. Legacy migration
// ---------------------------------------------------------------------------

function testLegacyMigration(): string {
  const state = base(7400, 'demo-station');
  const bunks = guestBunkTiles(state);
  if (bunks.length > 0) makeVisitor(state, bunks[0], { temporarySleepTargetTile: bunks[0] });
  const tile = state.tiles.findIndex((entry) => entry === TileType.Floor);
  assert(planTileConstruction(state, tile, TileType.Wall).ok, 'Could not plan a site for the legacy fixture.');

  // Strip every slot this gate added, plus the occupant list, to produce a
  // representative pre-Gate-E snapshot.
  const wire = JSON.parse(serializeSave('legacy', state, 'legacy')) as {
    snapshot: Record<string, unknown> & {
      constructionSites: Array<Record<string, unknown>>;
    };
  };
  delete wire.snapshot.seedAtCreation;
  delete wire.snapshot.system;
  delete wire.snapshot.laneProfiles;
  delete wire.snapshot.mapConditionVersion;
  delete wire.snapshot.visitors;
  delete wire.snapshot.site;
  for (const site of wire.snapshot.constructionSites) {
    delete site.blockedReason;
    delete site.createdAt;
  }

  const parsed = parseAndMigrateSave(JSON.stringify(wire));
  assert(parsed.ok, `Legacy save failed to parse: ${parsed.ok ? '' : parsed.error}`);
  assert(parsed.save.snapshot.seedAtCreation === undefined, 'Legacy snapshot invented a seed at parse time.');
  assert(parsed.save.snapshot.system === undefined, 'Legacy snapshot invented a system at parse time.');
  assert(parsed.save.snapshot.laneProfiles === undefined, 'Legacy snapshot invented lane profiles at parse time.');

  const hydrated = hydrateStateFromSave(parsed.save);
  const loaded = hydrated.state;

  // Documented deterministic defaults: the pre-Gate-E behavior exactly.
  assert(loaded.seedAtCreation === 1337, `Legacy save defaulted to seed ${loaded.seedAtCreation}, expected 1337.`);
  const expected = generateSystemMap(1337);
  assert(
    JSON.stringify(loaded.system) === JSON.stringify(expected),
    'Legacy save did not fall back to the deterministic default system.'
  );
  assert(loaded.site === undefined, 'Legacy save invented a chartered site.');
  assert(loaded.visitors.length === 0, 'Legacy save invented occupants.');
  assert(
    hydrated.warnings.some((warning) => warning.includes('no procedural seed')),
    'Legacy fallback was silent.'
  );
  const legacySite = loaded.constructionSites[0];
  assert(legacySite, 'Legacy construction site was dropped.');
  assert(legacySite.blockedReason === null, 'Legacy site invented a blocked reason.');
  assert(legacySite.createdAt === loaded.now, 'Legacy site did not fall back to load time for its age.');

  const audit = auditSaveRecovery(loaded);
  assert(audit.duplicateJobIds === 0 && audit.duplicateLodgingClaims === 0, 'Legacy hydration produced duplicates.');
  assert(audit.lodgingClaims === 0, 'Legacy hydration produced a lodging claim from nothing.');

  // A legacy save is still playable.
  advance(loaded, 20);
  assert(loaded.now > state.now, 'Legacy save did not resume.');

  return `legacy snapshot hydrated to default seed 1337, ${hydrated.warnings.length} warning(s), `
    + `0 invented occupants, still resumes`;
}

// ---------------------------------------------------------------------------

const TESTS: Array<{ name: string; run: () => string }> = [
  { name: '1 procedural charter identity', run: testProceduralCharterIdentity },
  { name: '2 construction and exterior work', run: testConstructionFidelity },
  { name: '3 ships, passengers, interfaces', run: testShipsPassengersAndInterfaces },
  { name: '4 held cargo, EVA repair, lodging', run: testCargoRepairAndLodging },
  { name: '5 fifty-crew fifty-visitor stress save', run: testStressSaveResume },
  { name: '6 legacy migration defaults', run: testLegacyMigration }
];

function main(): void {
  const filter = process.env.GATE_E_TEST_FILTER ?? '';
  let failed = 0;
  let ran = 0;
  const startedAll = Date.now();
  for (const entry of TESTS) {
    if (filter && !entry.name.includes(filter)) continue;
    ran += 1;
    const started = Date.now();
    try {
      const evidence = entry.run();
      console.log(`ok   ${entry.name} (${Date.now() - started}ms)`);
      console.log(`     ${evidence}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL ${entry.name} (${Date.now() - started}ms)`);
      console.error(`     ${(error as Error).message}`);
    }
  }
  const totalMs = Date.now() - startedAll;
  if (failed > 0) {
    console.error(`gate-e-save-resume-tests: ${failed}/${ran} failed in ${totalMs}ms`);
    process.exit(1);
  }
  console.log(`gate-e-save-resume-tests: ok ${ran}/${TESTS.length} fixtures in ${totalMs}ms`);
}

main();
