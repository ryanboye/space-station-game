/**
 * Focused Phase 8 opening-expansion evidence.
 *
 * This runner deliberately uses the same production entry points as the player:
 * the authored starter Truss becomes a durable construction project, crews carry
 * materials and weld it, and the resulting hull frontage receives a credit-paid
 * Pod Dock. Rating evidence likewise comes from a canonical meal completion and
 * the real failed-stay escalation ledger rather than assigned metric counters.
 *
 * Compile/run without a package script:
 *   npx tsc -p tsconfig.simtest.json
 *   node tools/write-simtest-package.cjs
 *   node .tmp/sim-tests/tools/phase8-opening-expansion-tests.js
 */

import {
  buildStationExpansionOnTruss,
  createInitialState,
  getPodDockPlacementView,
  planStructuralPieceConstruction,
  setCrewManualWorkLane,
  tick,
  tryPlaceModuleWithCredits
} from '../src/sim/sim';
import {
  advanceStructuralExpansionProjects,
  applyConstructionSite,
  planTileConstruction,
  previewModulePlacement
} from '../src/sim/construction';
import { createVisitorNeeds } from '../src/sim/occupant-demand';
import { hydrateStateFromSave, parseAndMigrateSave, serializeSave } from '../src/sim/save';
import { validateStructuralSupportPlan } from '../src/sim/structural-support';
import {
  ModuleType,
  RoomType,
  TileType,
  VisitorState,
  type ModuleRotation,
  type ArrivingShip,
  type PortContract,
  type StationState,
  type Visitor
} from '../src/sim/types';

const GAME_VERSION = 'phase8-opening-expansion';
const STEP = 0.1;

let checks = 0;
let failures = 0;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function check(name: string, run: () => string): void {
  checks += 1;
  try {
    console.log(`  ok   ${name} — ${run()}`);
  } catch (error) {
    failures += 1;
    console.error(`  FAIL ${name}`);
    console.error(`       ${error instanceof Error ? error.message : String(error)}`);
  }
}

function fixture(seed: number): StationState {
  const state = createInitialState({ seed, physicalStarterInventory: true, manualTrafficAdmission: true });
  state.controls.shipsPerCycle = 0;
  tick(state, 0);
  return state;
}

function advanceUntil(
  state: StationState,
  label: string,
  predicate: () => boolean,
  maxSeconds: number
): void {
  state.controls.paused = false;
  for (let elapsed = 0; elapsed < maxSeconds && !predicate(); elapsed += STEP) tick(state, STEP);
  assert(predicate(), `${label} did not complete within ${maxSeconds}s`);
}

function roundTrip(state: StationState, seed: number): StationState {
  const parsed = parseAndMigrateSave(serializeSave('phase-8-evidence', state, GAME_VERSION));
  assert(parsed.ok, `save did not parse: ${parsed.ok ? '' : parsed.error}`);
  return hydrateStateFromSave(parsed.save, { seed }).state;
}

function testStarterWingAndPaidThirdPodDock(): string {
  const state = fixture(9801);
  const starterTruss = state.tiles
    .map((tile, index) => ({ tile, index }))
    .filter(({ tile }) => tile === TileType.Truss)
    .map(({ index }) => index);
  assert(starterTruss.length === 3, `starter must expose its three-tile Truss lesson, found ${starterTruss.length}`);

  // Funding is harness setup only. The production project still owns every
  // material delivery, stage transition, work timer, and final topology write.
  state.metrics.credits = 100_000;
  state.legacyMaterialStock = 500;
  state.metrics.materials = 500;
  state.controls.materialAutoImportEnabled = false;

  const startingDockModules = state.moduleInstances.filter((module) => module.type === ModuleType.PodDock).length;
  const startingDockEntities = state.docks.length;
  const scaffoldExtension = starterTruss.map((tile) => tile + 1);
  assert(scaffoldExtension.every((tile) => state.tiles[tile] === TileType.Space), 'starter Truss has no clear adjacent row for a useful-width wing');
  for (const tile of scaffoldExtension) {
    const trussPlan = planTileConstruction(state, tile, TileType.Truss);
    assert(trussPlan.ok, `real Truss extension failed: ${trussPlan.reason ?? 'unknown reason'}`);
  }
  let sawEvaWorker = false;
  state.controls.paused = false;
  for (let elapsed = 0; elapsed < 180 && !scaffoldExtension.every((tile) => state.tiles[tile] === TileType.Truss); elapsed += STEP) {
    tick(state, STEP);
    sawEvaWorker ||= state.crewMembers.some((crew) => crew.evaSuit && crew.activeJobId !== null);
  }
  assert(scaffoldExtension.every((tile) => state.tiles[tile] === TileType.Truss), 'crew did not finish the real Truss extension');

  const scaffold = [...starterTruss, ...scaffoldExtension];
  const constructionCrew = state.crewMembers
    // `crewCanPerformJob` authorizes these roles for construct jobs. Ordinary
    // engineers/cargo handlers do not weld, even if their names sound apt.
    .filter((crew) => crew.staffRole === 'assistant' || crew.staffRole === 'welder' || crew.staffRole === 'eva-specialist' || crew.staffRole === 'eva-engineer')
    .slice(0, 2);
  assert(constructionCrew.length > 0, 'starter has no crew eligible for construction control');
  for (const crew of constructionCrew) {
    assert(setCrewManualWorkLane(state, crew.id, 'construction-eva'), `could not assign ${crew.name} to construction/EVA`);
  }

  const branchTiles = validateStructuralSupportPlan(state).problems
    .filter((problem) => problem.reason === 'branch-requires-junction')
    .map((problem) => problem.tile);
  assert(branchTiles.length > 0, 'useful-width scaffold did not expose its required transfer junctions');
  const junctionIds: number[] = [];
  for (const tile of branchTiles) {
    const junction = planStructuralPieceConstruction(state, tile, 'junction');
    assert(
      junction.ok && junction.pieceId !== undefined,
      `real Junction plan failed: ${junction.ok ? 'missing identity' : junction.reason ?? 'unknown reason'}`
    );
    junctionIds.push(junction.pieceId);
  }
  for (let elapsed = 0; elapsed < 300 && !junctionIds.every((id) => state.structuralPieces.find((piece) => piece.id === id)?.completed); elapsed += STEP) {
    tick(state, STEP);
    sawEvaWorker ||= state.crewMembers.some((crew) => crew.evaSuit && crew.activeJobId !== null);
  }
  assert(
    junctionIds.every((id) => state.structuralPieces.find((piece) => piece.id === id)?.completed),
    'crew did not deliver and weld the required Junctions'
  );

  const planned = buildStationExpansionOnTruss(state, scaffold);
  assert(planned.ok, `starter-attached wing was rejected: ${planned.reason ?? 'unknown reason'}`);
  const project = state.structuralExpansionProjects[state.structuralExpansionProjects.length - 1];
  assert(project, 'wing planning did not create a durable structural project');
  assert(project.targets.some((target) => target.targetTile === TileType.Floor), 'wing has no interior floor target');
  assert(project.targets.some((target) => target.targetTile === TileType.Wall), 'wing has no exterior hull target');

  const observedPhases = new Set<string>([project.phase]);
  // The preceding Truss and Junction work already proves real material/EVA job
  // routing. Complete the multi-site shell deterministically through the same
  // apply/advance functions production tick calls; this keeps the fixture fast
  // and isolates phase/commissioning evidence from unrelated crew scheduling.
  for (let guard = 0; guard < 8 && !project.commissioned; guard += 1) {
    for (const site of state.constructionSites.filter((candidate) =>
      candidate.structuralProjectId === project.id && candidate.state !== 'done'
    )) {
      site.deliveredMaterials = site.requiredMaterials;
      site.buildProgress = site.buildWorkRequired;
      assert(applyConstructionSite(state, site), `production apply rejected ${site.structuralStage ?? 'unknown'} site ${site.id}`);
      site.state = 'done';
    }
    advanceStructuralExpansionProjects(state);
    observedPhases.add(project.phase);
  }
  assert(project.commissioned, `starter-attached wing did not commission (${project.phase}: ${project.blockedReason ?? 'no blocker'})`);
  assert(sawEvaWorker, 'starter-attached wing never dispatched a visible EVA worker');
  assert(observedPhases.has('perimeter') && observedPhases.has('interior') && observedPhases.has('seal-check'),
    `wing skipped a durable stage (${[...observedPhases].join(', ')})`);
  assert(project.phase === 'commissioned', `wing stopped in ${project.phase}: ${project.blockedReason ?? 'no blocker'}`);
  assert(project.deliveredMaterials > 0, 'wing completed without production material custody');
  assert(project.completedSiteIds.length > 0, 'wing completed without durable child work records');
  assert(starterTruss.every((tile) => state.tiles[tile] === TileType.Floor), 'commissioning did not turn the scaffold into interior floor');

  // A completed wing is operationally useful only if its new perimeter really
  // exposes valid port frontage. Restrict the search to hull targets belonging
  // to this project so an old starter wall cannot satisfy the assertion.
  const newHullTargets = project.targets
    .filter((target) => target.targetTile === TileType.Wall)
    .map((target) => target.tileIndex);
  const podPlacement = newHullTargets
    .flatMap((tile) => ([0, 90] as ModuleRotation[]).map((rotation) => ({ tile, rotation })))
    .find(({ tile, rotation }) =>
      getPodDockPlacementView(state, tile).valid &&
      previewModulePlacement(state, ModuleType.PodDock, tile, rotation).valid
    );
  assert(podPlacement !== undefined, 'commissioned wing exposes no valid Pod Dock frontage');

  tick(state, 0);
  const capacityBeforePurchase = state.docks.filter((dock) => dock.occupiedByShipId === null).length;
  const creditsBeforePurchase = state.metrics.credits;
  const purchase = tryPlaceModuleWithCredits(state, ModuleType.PodDock, podPlacement.tile, podPlacement.rotation);
  assert(purchase.ok, `paid third Pod Dock placement failed: ${purchase.ok ? 'unknown reason' : purchase.reason}`);
  assert(purchase.cost > 0, 'third Pod Dock did not have a capital cost');
  assert(
    Math.abs(state.metrics.credits - (creditsBeforePurchase - purchase.cost)) < 0.0001,
    'third Pod Dock did not debit its reported cost exactly once'
  );
  tick(state, 0);

  const endingDockModules = state.moduleInstances.filter((module) => module.type === ModuleType.PodDock).length;
  assert(endingDockModules === startingDockModules + 1, `Pod Dock modules ${startingDockModules} -> ${endingDockModules}`);
  assert(state.docks.length === startingDockEntities + 1, `operational docks ${startingDockEntities} -> ${state.docks.length}`);
  assert(
    state.docks.filter((dock) => dock.occupiedByShipId === null).length === capacityBeforePurchase + 1,
    `free small-craft interfaces ${capacityBeforePurchase} -> ${state.docks.filter((dock) => dock.occupiedByShipId === null).length}`
  );
  assert(
    state.docks.some((dock) => dock.sourceKind === 'pod-dock-module' && dock.mountTile === podPlacement.tile),
    'new hull module did not become a real Pod Dock entity'
  );

  return `wing ${scaffold.length} floor tiles, ${project.deliveredMaterials} materials, ` +
    `Pod Docks ${startingDockEntities}->${state.docks.length}, free interfaces ${capacityBeforePurchase}->${state.docks.filter((dock) => dock.occupiedByShipId === null).length}, cost ${purchase.cost}c`;
}

function mealVisitor(state: StationState, tableTile: number, id: number): Visitor {
  return {
    id,
    name: 'Phase 8 diner',
    trait: 'patient',
    x: (tableTile % state.width) + 0.5,
    y: Math.floor(tableTile / state.width) + 0.5,
    tileIndex: tableTile,
    state: VisitorState.Eating,
    path: [],
    speed: 2,
    patience: 0,
    eatTimer: 0,
    trespassed: false,
    servedMeal: false,
    carryingMeal: true,
    reservedServingTile: null,
    reservedTargetTile: tableTile,
    blockedTicks: 0,
    archetype: 'diner',
    taxSensitivity: 1,
    spendMultiplier: 1,
    patienceMultiplier: 1,
    primaryPreference: 'cafeteria',
    spawnedAt: state.now,
    originShipId: null,
    airExposureSec: 0,
    healthState: 'healthy',
    leisureLegsRemaining: 0,
    leisureLegsPlanned: 0,
    lastLeisureKind: null,
    servicePlan: ['meal'],
    completedServices: [],
    activeService: 'meal',
    stayClass: 'errand',
    recurringNeedActive: null
  } as unknown as Visitor;
}

function contractShip(state: StationState, id: number): ArrivingShip {
  const dock = state.docks[0];
  assert(dock, 'failure fixture needs a real starter Pod Dock');
  const bayTile = dock.accessTile ?? dock.tiles[0] ?? 0;
  const ship = {
    id,
    kind: 'transient',
    size: 'medium',
    bayTiles: [bayTile],
    bayCenterX: (bayTile % state.width) + 0.5,
    bayCenterY: Math.floor(bayTile / state.width) + 0.5,
    shipType: 'industrial',
    hullVariant: 'repair-tender',
    lane: dock.lane,
    originDockId: dock.id,
    assignedDockId: dock.id,
    assignedDockSourceKey: dock.sourceKey,
    assignedBerthAnchor: null,
    queueState: 'none',
    stage: 'docked',
    stageTime: 12,
    passengersTotal: 1,
    passengersSpawned: 1,
    passengersBoarded: 0,
    minimumBoarding: 1,
    spawnCarry: 0,
    dockedAt: state.now,
    residentIds: [],
    manifestDemand: { cafeteria: 1, market: 0, lounge: 0 },
    manifestMix: { diner: 1, shopper: 0, lounger: 0, rusher: 0 },
    portContractId: id,
    stayClass: 'contract',
    visitPhase: 'visit-service',
    earliestDepartureAt: state.now + 20,
    plannedDepartureAt: state.now + 190,
    extensionUntil: null,
    recallAt: null,
    approachCommitment: null
  } as unknown as ArrivingShip;
  state.arrivingShips.push(ship);
  state.portOps.contracts.push({
    id,
    offerId: id,
    shipId: id,
    callsign: `PHASE8-${id}`,
    offerKind: 'passenger',
    assignedBerthAnchor: 0,
    acceptedAt: state.now,
    arrivesAt: state.now,
    boardingStartsAt: state.now + 120,
    hardDepartureAt: state.now + 190,
    status: 'active',
    promises: [{ kind: 'dock', label: 'Dock access', target: 1, completed: 1, payoutCredits: 40 }],
    passengerSpendingCredits: 0,
    procurementCostCredits: 0,
    settlementId: null,
    stayClass: 'contract',
    earliestDepartureAt: ship.earliestDepartureAt,
    plannedDepartureAt: ship.plannedDepartureAt,
    extensionUntil: null,
    recallAt: null
  } as unknown as PortContract);
  return ship;
}

function failingPassenger(state: StationState, ship: ArrivingShip, id: number): Visitor {
  const tile = ship.bayTiles[0];
  const visitor = {
    id,
    name: 'Phase 8 failed stay',
    trait: 'patient',
    x: (tile % state.width) + 0.5,
    y: Math.floor(tile / state.width) + 0.5,
    tileIndex: tile,
    state: VisitorState.ToCafeteria,
    path: [],
    speed: 2,
    patience: 0,
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
    primaryPreference: 'cafeteria',
    spawnedAt: state.now,
    originShipId: ship.id,
    airExposureSec: 0,
    healthState: 'healthy',
    leisureLegsRemaining: 0,
    leisureLegsPlanned: 0,
    lastLeisureKind: null,
    servicePlan: [],
    completedServices: [],
    activeService: 'meal',
    stayClass: 'contract',
    queueProviderTile: null,
    queueJoinedAt: null,
    temporarySleepTargetTile: null,
    needs: createVisitorNeeds(id),
    recurringNeedActive: 'hunger',
    serviceBlockedSince: state.now - 200,
    failureNeed: 'hunger',
    failureSince: state.now - 80,
    serviceFailureStage: 'unmet'
  } as unknown as Visitor;
  visitor.needs!.hunger = 8;
  visitor.needs!.unmetSince = state.now - 200;
  state.visitors.push(visitor);
  return visitor;
}

function testRealRatingCausesSurviveSave(): string {
  const state = fixture(9802);
  const tableTile = state.moduleInstances.find((module) =>
    module.type === ModuleType.Table && state.rooms[module.originTile] === RoomType.Cafeteria
  )?.originTile;
  assert(tableTile !== undefined, 'starter needs a physical Cafeteria Table for canonical meal completion');

  const diner = mealVisitor(state, tableTile, 98_201);
  state.visitors.push(diner);
  state.controls.paused = false;
  tick(state, 0.2);
  assert(diner.servedMeal, 'visitor did not complete the physical meal consumption path');
  assert(
    state.serviceLog.recent.some((event) => event.actorId === diner.id && event.service === 'meal' && event.tileIndex === tableTile),
    'meal success did not enter the canonical physical service log'
  );
  const mealBonus = state.usageTotals.ratingFromVisitorSuccessByReason.mealService;
  assert(mealBonus > 0, 'real meal completion did not add its causal rating bonus');

  // Remove the completed walk-in so the following failure has one unambiguous
  // subject. The failure itself is created and escalated only by production tick.
  state.visitors = state.visitors.filter((visitor) => visitor.id !== diner.id);
  const ship = contractShip(state, 98_210);
  ship.passengersTotal = 3;
  ship.passengersSpawned = 3;
  for (const id of [98_211, 98_212, 98_213]) failingPassenger(state, ship, id);
  advanceUntil(
    state,
    'failed-stay episode creation',
    () => state.failureEpisodes.episodes.some((candidate) => candidate.subjectId === 98_211),
    30
  );
  const episode = state.failureEpisodes.episodes.find((candidate) => candidate.subjectId === 98_211);
  assert(episode, 'real unmet need did not create a visible failed-stay episode');
  const failureBeforeEscalation = state.usageTotals.ratingFromVisitorFailureByReason.shipServicesMissing;
  advanceUntil(
    state,
    'visible failed-stay escalation',
    () => state.usageTotals.ratingFromVisitorFailureByReason.shipServicesMissing > Math.max(failureBeforeEscalation, mealBonus),
    30
  );
  assert(episode.cause.toLowerCase().includes('meal') || episode.cause.toLowerCase().includes('hunger'), `failure cause is not physical: ${episode.cause}`);
  assert(
    state.derived.queueTheater.eventFeed.some((event) =>
      event.text.includes(episode.cause) || event.text.includes('could not find public food service')
    ),
    'failed-stay cause never appeared in the player-facing event feed'
  );
  // Derived rating totals update on their bounded cadence after the causal
  // write. Let that normal cadence publish the values the UI actually reads.
  for (let elapsed = 0; elapsed < 2; elapsed += STEP) tick(state, STEP);
  const serviceFailure = state.usageTotals.ratingFromVisitorFailureByReason.shipServicesMissing;
  assert(serviceFailure > mealBonus, `failure ${serviceFailure} did not outweigh meal bonus ${mealBonus}`);
  assert(state.usageTotals.ratingDelta < 0, `natural causal ledger should cross below zero, got ${state.usageTotals.ratingDelta}`);

  const ledgerBefore = state.usageTotals.ratingDelta;
  const restored = roundTrip(state, 9802);
  assert(restored.usageTotals.ratingDelta === ledgerBefore, 'save/load changed the unclamped cumulative rating ledger');
  assert(
    restored.usageTotals.ratingFromVisitorSuccessByReason.mealService === mealBonus,
    'save/load changed the meal success cause'
  );
  assert(
    restored.usageTotals.ratingFromVisitorFailureByReason.shipServicesMissing === serviceFailure,
    'save/load changed the visible service-failure cause'
  );
  assert(
    restored.serviceLog.recent.some((event) => event.actorId === diner.id && event.service === 'meal' && event.tileIndex === tableTile),
    'save/load lost the physical service record behind the meal cause'
  );
  assert(
    restored.failureEpisodes.episodes.some((candidate) => candidate.subjectId === episode.subjectId && candidate.cause === episode.cause),
    'save/load lost the attributable failed-stay record behind the failure cause'
  );

  return `meal +${mealBonus.toFixed(2)}, failed stay -${serviceFailure.toFixed(2)}, ` +
    `ledger ${ledgerBefore.toFixed(2)} behind displayed 0, exact after save/load`;
}

console.log('Phase 8 opening expansion evidence');
check('starter wing supports a paid third Pod Dock', testStarterWingAndPaidThirdPodDock);
check('real service causes produce a durable cumulative rating breakdown', testRealRatingCausesSurviveSave);

if (failures > 0) {
  console.error(`\n${failures}/${checks} Phase 8 opening-expansion checks failed.`);
  process.exitCode = 1;
} else {
  console.log(`\n${checks}/${checks} Phase 8 opening-expansion checks passed.`);
}
