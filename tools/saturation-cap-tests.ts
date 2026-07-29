import { TASK_TIMINGS } from '../src/sim/balance';
import {
  INCIDENT_COOLDOWN_SEC,
  MAX_INCIDENTS_PER_EPISODE,
  createFailureEpisodeState,
  nextIncidentFor,
  recordIncident,
  type FailureEpisode
} from '../src/sim/failed-stay';
import { findPath } from '../src/sim/path';
import { createInitialState, queuePositionOf, runQueueMaintenanceTestTick, tick, tryPlaceModule } from '../src/sim/sim';
import {
  ModuleType,
  RoomType,
  ResidentState,
  TileType,
  VisitorState,
  ZoneType,
  type ArrivingShip,
  type PathOptions,
  type Resident,
  type RouteExposure,
  type StationState,
  type Visitor
} from '../src/sim/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`saturation-caps: ${message}`);
}

function close(actual: number, expected: number, message: string): void {
  assert(Math.abs(actual - expected) < 1e-8, `${message}: expected ${expected}, got ${actual}`);
}

function at(state: StationState, x: number, y: number): number {
  return y * state.width + x;
}

function center(state: StationState, tile: number): { x: number; y: number } {
  return { x: (tile % state.width) + 0.5, y: Math.floor(tile / state.width) + 0.5 };
}

function blankState(seed: number): StationState {
  const state = createInitialState({ seed, physicalStarterInventory: true });
  state.controls.paused = false;
  state.controls.shipsPerCycle = 0;
  state.tiles.fill(TileType.Space);
  state.rooms.fill(RoomType.None);
  state.zones.fill(ZoneType.Public);
  state.modules.fill(ModuleType.None);
  state.moduleOccupancyByTile.fill(null);
  state.moduleInstances = [];
  state.visitors = [];
  state.residents = [];
  state.crewMembers = [];
  state.reservations = [];
  state.itemNodes = [];
  return state;
}

function visitor(state: StationState, id: number, anchor: number, joinedAt: number, tile: number): Visitor {
  return {
    id,
    name: `Cap ${id}`,
    ...center(state, tile),
    tileIndex: tile,
    state: VisitorState.ToLeisure,
    path: [],
    speed: 5,
    patience: 0,
    eatTimer: 0,
    trespassed: false,
    servedMeal: false,
    carryingMeal: false,
    carryingDrink: false,
    reservedServingTile: null,
    reservedTargetTile: null,
    blockedTicks: 0,
    archetype: 'lounger',
    taxSensitivity: 1,
    spendMultiplier: 1,
    patienceMultiplier: 1,
    primaryPreference: 'lounge',
    spawnedAt: 0,
    originShipId: null,
    airExposureSec: 0,
    healthState: 'healthy',
    leisureLegsRemaining: 0,
    leisureLegsPlanned: 0,
    lastLeisureKind: null,
    servicePlan: [],
    completedServices: [],
    activeService: 'drink',
    optionalDrinkActive: false,
    repeatDrinksServed: 0,
    queueProviderTile: anchor,
    queueJoinedAt: joinedAt,
    serviceBlockedSince: null,
    stayClass: 'errand',
    recurringNeedActive: null
  };
}

function queueState(count: number): { state: StationState; anchor: number } {
  const state = blankState(8100 + count);
  const x = 20;
  const anchor = at(state, x, 8);
  const other = at(state, x + 1, 8);
  for (let y = 8; y <= 42; y += 1) {
    const tile = at(state, x, y);
    state.tiles[tile] = TileType.Floor;
    state.rooms[tile] = y <= 26 ? RoomType.Cantina : RoomType.None;
    state.pressurized[tile] = true;
    if (y > 8) {
      state.tiles[at(state, x - 1, y)] = TileType.Wall;
      state.tiles[at(state, x + 1, y)] = TileType.Wall;
    }
  }
  state.tiles[other] = TileType.Floor;
  state.rooms[other] = RoomType.Cantina;
  state.pressurized[other] = true;
  state.moduleInstances.push({ id: 700, type: ModuleType.BarCounter, originTile: anchor, rotation: 0, width: 2, height: 1, tiles: [anchor, other] });
  state.modules[anchor] = ModuleType.BarCounter;
  state.modules[other] = ModuleType.BarCounter;
  state.moduleOccupancyByTile[anchor] = 700;
  state.moduleOccupancyByTile[other] = 700;
  state.moduleVersion += 1;
  state.roomVersion += 1;
  state.topologyVersion += 1;
  state.visitors = Array.from({ length: count }, (_, i) => visitor(state, i + 1, anchor, i + 1, at(state, x, 40)));
  runQueueMaintenanceTestTick(state);
  return { state, anchor };
}

function admitted(fixture: { state: StationState; anchor: number }): number {
  return fixture.state.derived.queueTheater.membersByAnchor.get(fixture.anchor)?.length ?? 0;
}

function outsideSlots(fixture: { state: StationState; anchor: number }): number {
  const ids = new Set(fixture.state.derived.queueTheater.membersByAnchor.get(fixture.anchor) ?? []);
  return fixture.state.reservations.filter((reservation) =>
    reservation.releaseReason === null && reservation.ownerKind === 'visitor' &&
    ids.has(Number(reservation.ownerId)) && reservation.targetTile !== null &&
    fixture.state.rooms[reservation.targetTile] !== RoomType.Cantina
  ).length;
}

function testQueueGeometryAndDemandBounds(): string {
  const formerCap = queueState(23);
  const beyondFormerCap = queueState(30);
  const exhausted = queueState(40);
  assert(admitted(formerCap) === 23 && admitted(beyondFormerCap) === 30,
    'A live line must expand beyond the former universal length cap when physical floor exists.');
  assert(admitted(exhausted) === 34,
    `The cramped fixture must stop at its 34 real floor positions, not demand 40 (got ${admitted(exhausted)}).`);
  assert(outsideSlots(formerCap) === 5 && outsideSlots(beyondFormerCap) === 12 && outsideSlots(exhausted) === 16,
    'Outside-room spill must continue through reachable geometry rather than stopping at six.');
  const unallocated = exhausted.state.visitors.filter((visitor) =>
    visitor.queueProviderTile === exhausted.anchor &&
    !queuePositionOf(exhausted.state, visitor.id) &&
    visitor.movementWaitReason === 'queue full: no safe floor slot'
  );
  assert(unallocated.length === 6, `Six excess visitors must expose finite queue-full pressure (got ${unallocated.length}).`);
  return 'geometry admits 23<30<34 of demand 40; spill 5<12<16; 6 explicitly unallocated';
}

function queueBalkAt(age: number): { queued: boolean; angry: boolean } {
  const state = blankState(8200 + Math.floor(age));
  const tile = at(state, 20, 20);
  state.tiles[tile] = TileType.Floor;
  const target = visitor(state, 1, null as unknown as number, 0, tile);
  target.state = VisitorState.Queueing;
  target.queueProviderTile = null;
  target.serviceBlockedSince = 0;
  state.visitors = [target];
  state.now = age;
  runQueueMaintenanceTestTick(state);
  return { queued: target.state === VisitorState.Queueing, angry: (target.angryUntil ?? 0) > state.now };
}

function testOrdinaryQueueBalkTimer(): string {
  const below = queueBalkAt(15.999);
  const atCap = queueBalkAt(16);
  const above = queueBalkAt(17);
  assert(below.queued && !below.angry, 'Ordinary line must remain queued below 16 seconds.');
  assert(!atCap.queued && atCap.angry, 'Ordinary line must balk at 16 seconds.');
  assert(!above.queued && above.angry, 'Ordinary line above 16 seconds must equal the capped outcome.');
  return 'ordinary queue timer 15.999s waits; 16s=17s balk';
}

function marketUnavailableAt(age: number): boolean {
  const state = createInitialState({ seed: 8250 + Math.floor(age), physicalStarterInventory: true, manualTrafficAdmission: true });
  for (let y = 48; y <= 57; y += 1) {
    for (let x = 41; x <= 60; x += 1) {
      const tile = at(state, x, y);
      const boundary = x === 41 || x === 60 || y === 48 || y === 57;
      state.tiles[tile] = boundary ? TileType.Wall : TileType.Floor;
      state.rooms[tile] = boundary ? RoomType.None : RoomType.Market;
      state.pressurized[tile] = !boundary;
    }
  }
  state.tiles[at(state, 43, 48)] = TileType.Door;
  state.utilityUnderlay.layers['power-conduit'].fill(1);
  state.utilityUnderlay.version += 1;
  state.topologyVersion += 1;
  state.roomVersion += 1;
  const shelf = tryPlaceModule(state, ModuleType.ShelfAisle, at(state, 43, 50));
  const checkout = tryPlaceModule(state, ModuleType.CheckoutBank, at(state, 47, 50));
  assert(shelf.ok && checkout.ok, `Market live fixture placement failed: ${shelf.reason ?? checkout.reason}`);
  state.pressurized.fill(true);
  const shelfModule = state.moduleInstances.find((module) => module.type === ModuleType.ShelfAisle);
  assert(shelfModule, 'Market fixture must expose a shelf.');
  const node = state.itemNodes.find((candidate) => candidate.tileIndex === shelfModule.originTile);
  assert(node, 'Market fixture shelf must expose a stock node.');
  node.items.tradeGood = 1;
  const shopper = visitor(state, 501, null as unknown as number, 0, at(state, 44, 55));
  shopper.archetype = 'shopper';
  shopper.primaryPreference = 'market';
  shopper.activeService = null;
  shopper.leisureLegsRemaining = 1;
  shopper.marketTradeGoodSourceTile = null;
  shopper.temporarySleepTargetTile = null;
  state.visitors = [shopper];
  state.controls.paused = false;
  for (let elapsed = 0; elapsed < 15 && shopper.movementWaitReason !== 'market register unstaffed'; elapsed += 0.1) tick(state, 0.1);
  assert(shopper.movementWaitReason === 'market register unstaffed', `Live shopper must reach the unstaffed register before timer injection (state ${shopper.state}, tile ${shopper.tileIndex}, target ${shopper.reservedTargetTile}, source ${shopper.marketTradeGoodSourceTile}, wait ${shopper.movementWaitReason}).`);
  assert(shopper.marketTradeGoodSourceTile !== null, 'Queued shopper must retain the claimed shelf good.');
  shopper.serviceBlockedSince = state.now - age;
  tick(state, 0);
  return shopper.marketTradeGoodSourceTile !== null;
}

function testEnhancedMarketUnavailableTimer(): string {
  assert(marketUnavailableAt(13.999), 'Enhanced market must retain the claim below 14 seconds.');
  assert(!marketUnavailableAt(14), 'Enhanced market must abandon at 14 seconds.');
  assert(!marketUnavailableAt(15), 'Enhanced market above 14 seconds must equal at-threshold abandonment.');
  return 'enhanced market 13.999s retains shelf claim; 14s=15s abandons and releases';
}

function dockQueueAt(age: number): boolean {
  const state = createInitialState({ seed: 8301, physicalStarterInventory: true });
  state.controls.paused = false;
  state.controls.shipsPerCycle = 0;
  tick(state, 0);
  const dock = state.docks[0];
  assert(dock, 'Starter state must expose a dock for the live timeout seam.');
  for (const other of state.docks.slice(1)) other.purpose = 'residential';
  const occupant: ArrivingShip = {
    id: 999_001, kind: 'transient', size: 'small', bayTiles: [...dock.tiles],
    bayCenterX: 0, bayCenterY: 0, shipType: 'tourist', hullVariant: 'courier-pod',
    lane: dock.lane, originDockId: dock.id, assignedDockId: dock.id,
    queueState: 'none', stage: 'docked', stageTime: 0, passengersTotal: 1,
    passengersSpawned: 1, passengersBoarded: 0, minimumBoarding: 1,
    spawnCarry: 0, dockedAt: state.now, residentIds: [],
    manifestDemand: { cafeteria: 0.5, market: 0.25, lounge: 0.25 },
    manifestMix: { diner: 0.55, shopper: 0.2, lounger: 0.15, rusher: 0.1 }
  };
  dock.occupiedByShipId = occupant.id;
  state.arrivingShips.push(occupant);
  const passengerTile = dock.tiles[0];
  const passenger = visitor(state, 999_003, null as unknown as number, 0, passengerTile);
  passenger.originShipId = occupant.id;
  state.visitors.push(passenger);
  state.now = age;
  state.physicalHoldingQueue = [{
    shipId: 999_002,
    ownerKind: 'walk-in-candidate',
    lane: dock.lane,
    shipType: 'tourist',
    hullVariant: 'courier-pod',
    size: 'small',
    slotId: null,
    groupIds: [],
    phase: 'approach',
    status: 'awaiting-slot',
    queuedAt: 0,
    timeoutAt: TASK_TIMINGS.dockQueueMaxSec
  }];
  tick(state, 0);
  return state.physicalHoldingQueue.some((entry) => entry.shipId === 999_002);
}

function testDockQueueTimer(): string {
  assert(dockQueueAt(TASK_TIMINGS.dockQueueMaxSec - 0.001), 'Dock queue must remain below timeout.');
  assert(!dockQueueAt(TASK_TIMINGS.dockQueueMaxSec), 'Dock queue must time out at the production constant.');
  assert(!dockQueueAt(TASK_TIMINGS.dockQueueMaxSec + 1), 'Dock queue above timeout must equal at-cap outcome.');
  return `dock timer ${TASK_TIMINGS.dockQueueMaxSec - 0.001}s waits; ${TASK_TIMINGS.dockQueueMaxSec}s=${TASK_TIMINGS.dockQueueMaxSec + 1}s timeout`;
}

function routeFixture(detourY = 24): { state: StationState; start: number; goal: number; direct: number[] } {
  const state = blankState(8401);
  const direct: number[] = [];
  for (let x = 10; x <= 22; x += 1) {
    const tile = at(state, x, 20);
    state.tiles[tile] = TileType.Floor;
    direct.push(tile);
  }
  for (let y = 20; y <= detourY; y += 1) {
    state.tiles[at(state, 10, y)] = TileType.Floor;
    state.tiles[at(state, 22, y)] = TileType.Floor;
  }
  for (let x = 10; x <= 22; x += 1) state.tiles[at(state, x, detourY)] = TileType.Floor;
  return { state, start: direct[0], goal: direct[direct.length - 1], direct };
}

function pathAt(intent: PathOptions['intent'], occupancy: number): number[] {
  const { state, start, goal, direct } = routeFixture(intent === 'security' ? 24 : 23);
  const occupancyByTile = new Map<number, number>();
  const occupiedTiles = intent === 'security' ? direct.slice(1, -1) : [direct[Math.floor(direct.length / 2)]];
  for (const tile of occupiedTiles) occupancyByTile.set(tile, occupancy);
  const path = findPath(state, start, goal, { allowRestricted: true, intent }, occupancyByTile);
  assert(path, `Expected a path for ${intent}.`);
  return path;
}

function signature(path: number[]): string { return path.join(','); }

function testIntentOccupancySaturation(): string {
  for (const intent of ['visitor', 'resident', 'crew', 'logistics'] as const) {
    const below = pathAt(intent, 1);
    const atCap = pathAt(intent, 2);
    const above = pathAt(intent, 20);
    assert(signature(atCap) === signature(above), `${intent} path must be equal at and above occupancy saturation.`);
    assert(signature(below) !== signature(atCap), `${intent} path must respond monotonically before saturation (below=${signature(below)} at=${signature(atCap)}).`);
  }
  const securityBelow = pathAt('security', 6);
  const securityAt = pathAt('security', 7);
  const securityAbove = pathAt('security', 20);
  assert(signature(securityAt) === signature(securityAbove), 'Security path must be equal at and above occupancy saturation.');
  assert(signature(securityBelow) !== signature(securityAt), 'Security path must respond before its saturation point.');
  return 'live A* paths change below caps and are identical at/above: visitor/resident/crew/logistics 2, security 7';
}

function exposure(distance: number, cargoTiles: number, securityTiles = 0): RouteExposure {
  return {
    distance, publicTiles: 0, serviceTiles: 0, cargoTiles, residentialTiles: 0,
    securityTiles, socialTiles: 0, crowdCost: 0
  };
}

function visitorExperience(route: RouteExposure): StationState {
  const state = blankState(8451);
  const tile = at(state, 20, 20);
  state.tiles[tile] = TileType.Floor;
  state.rooms[tile] = RoomType.Lounge;
  state.modules[tile] = ModuleType.Bench;
  state.pressurized[tile] = true;
  const target = visitor(state, 1, null as unknown as number, 0, tile);
  target.state = VisitorState.ToLeisure;
  target.path = [tile];
  target.activeService = null;
  target.reservedTargetTile = tile;
  target.lastRouteExposure = route;
  state.visitors = [target];
  tick(state, 0);
  assert(state.visitors[0].state === VisitorState.Leisure, 'Live visitor completion seam must consume route exposure.');
  return state;
}

function resident(state: StationState, tile: number, route: RouteExposure, stress = 20): Resident {
  return {
    id: 1, ...center(state, tile), tileIndex: tile, path: [], speed: 1.8,
    hunger: 82, energy: 82, hygiene: 78, social: 60, safety: 55, stress,
    routinePhase: 'errands', role: 'none', roleAffinity: {}, state: ResidentState.ToDorm,
    actionTimer: 0, retargetAt: 0, reservedTargetTile: tile, homeShipId: null,
    homeDockId: null, housingUnitId: null, bedModuleId: null, satisfaction: 65,
    leaveIntent: 0, blockedTicks: 0, airExposureSec: 0, healthState: 'healthy',
    agitation: 0, activeIncidentId: null, confrontationUntil: 0, lastRouteExposure: route
  };
}

function residentExperience(route: RouteExposure, initialStress = 20): { state: StationState; resident: Resident } {
  const state = blankState(8452);
  const tile = at(state, 20, 20);
  state.tiles[tile] = TileType.Floor;
  state.pressurized[tile] = true;
  const target = resident(state, tile, route, initialStress);
  state.residents = [target];
  tick(state, 0);
  assert(state.residents[0].state === ResidentState.Sleeping, 'Live resident completion seam must consume route exposure.');
  return { state, resident: target };
}

function testWalkRouteAndResidentCaps(): string {
  const walkBelow = visitorExperience(exposure(46, 0));
  const walkAt = visitorExperience(exposure(47, 0));
  const walkAbove = visitorExperience(exposure(100, 0));
  close(walkBelow.usageTotals.ratingFromWalkDissatisfaction, 0.096, 'Visitor walk below cap');
  close(walkAt.usageTotals.ratingFromWalkDissatisfaction, 0.1, 'Visitor walk at cap');
  close(walkAbove.usageTotals.ratingFromWalkDissatisfaction, 0.1, 'Visitor walk above cap');

  const routeBelow = visitorExperience(exposure(0, 31));
  const routeAt = visitorExperience(exposure(0, 32));
  const routeAbove = visitorExperience(exposure(0, 100));
  close(routeBelow.usageTotals.ratingFromRouteExposure, 0.279, 'Visitor route below cap');
  close(routeAt.usageTotals.ratingFromRouteExposure, 0.28, 'Visitor route at cap');
  close(routeAbove.usageTotals.ratingFromRouteExposure, 0.28, 'Visitor route above cap');

  const residentBelow = residentExperience(exposure(0, 15));
  const residentAt = residentExperience(exposure(0, 16));
  const residentAbove = residentExperience(exposure(0, 100));
  close(residentBelow.state.usageTotals.residentBadRouteStress, 3.15, 'Resident route below cap');
  close(residentAt.state.usageTotals.residentBadRouteStress, 3.2, 'Resident route at cap');
  close(residentAbove.state.usageTotals.residentBadRouteStress, 3.2, 'Resident route above cap');
  return 'visitor walk .096<.10=.10; route .279<.28=.28; resident route stress 3.15<3.2=3.2';
}

function episode(): FailureEpisode {
  return {
    id: 1, subjectKind: 'visitor', subjectId: 1, shipId: null, contractId: null,
    need: 'hunger', cause: 'test', anchorTile: 0, stage: 'disruptive', openedAt: 0,
    lastStageAt: 0, milestonesApplied: [], incidents: [], compensationCredits: 0,
    actionsApplied: [], resolvedAt: null, resolution: null
  };
}

function testIncidentCountAndCooldownCaps(): string {
  const state = createInitialState({ seed: 8501, physicalStarterInventory: true });
  const ledger = createFailureEpisodeState();
  const target = episode();
  state.now = 0;
  assert(nextIncidentFor(state, target) === 'mess', 'Incident zero must be eligible.');
  recordIncident(state, ledger, target, 'mess', 0);
  state.now = INCIDENT_COOLDOWN_SEC - 0.001;
  assert(nextIncidentFor(state, target) === null, 'Incident must be blocked below cooldown.');
  state.now = INCIDENT_COOLDOWN_SEC;
  assert(nextIncidentFor(state, target) === 'complaint', 'Incident must become eligible at cooldown.');
  state.now = INCIDENT_COOLDOWN_SEC + 1;
  assert(nextIncidentFor(state, target) === 'complaint', 'Above cooldown must equal at-threshold eligibility.');
  recordIncident(state, ledger, target, 'complaint', 0);
  state.now += INCIDENT_COOLDOWN_SEC;
  recordIncident(state, ledger, target, 'refusal-to-work', 0);
  assert(target.incidents.length === MAX_INCIDENTS_PER_EPISODE, 'Fixture must reach the incident cap.');
  assert(nextIncidentFor(state, target) === null, 'At incident cap must reject another incident.');
  target.incidents.push({ id: 99, kind: 'mess', at: 0, tileIndex: 0 });
  assert(nextIncidentFor(state, target) === null, 'Above incident cap must equal at-cap rejection.');
  return `incident cooldown ${INCIDENT_COOLDOWN_SEC - 0.001}s<${INCIDENT_COOLDOWN_SEC}s=${INCIDENT_COOLDOWN_SEC + 1}s; count ${MAX_INCIDENTS_PER_EPISODE}=${MAX_INCIDENTS_PER_EPISODE + 1} blocked`;
}

function ratingAt(delta: number): { headline: number; ledger: number } {
  const state = createInitialState({ seed: 8601, physicalStarterInventory: true });
  state.controls.paused = false;
  state.controls.shipsPerCycle = 0;
  state.usageTotals.ratingDelta = delta;
  tick(state, 0);
  return { headline: state.metrics.stationRating, ledger: state.usageTotals.ratingDelta };
}

function testRatingDisplayClampRetainsLedger(): string {
  const foundation = ratingAt(0).headline;
  const lowBelow = ratingAt(-foundation + 1);
  const lowAt = ratingAt(-foundation);
  const lowAbove = ratingAt(-foundation - 50);
  close(lowBelow.headline, 1, 'Lower display below clamp');
  close(lowAt.headline, 0, 'Lower display at clamp');
  close(lowAbove.headline, 0, 'Lower display above clamp');
  close(lowAbove.ledger, -foundation - 50, 'Lower causal ledger retention');
  const highBelow = ratingAt(99 - foundation);
  const highAt = ratingAt(100 - foundation);
  const highAbove = ratingAt(150 - foundation);
  close(highBelow.headline, 99, 'Upper display below clamp');
  close(highAt.headline, 100, 'Upper display at clamp');
  close(highAbove.headline, 100, 'Upper display above clamp');
  close(highAbove.ledger, 150 - foundation, 'Upper causal ledger retention');
  return `rating display 99<100=100 and 1>0=0; causal ledger retains unclamped ${150 - foundation}`;
}

const tests: Array<[string, () => string]> = [
  ['queue-geometry-and-demand', testQueueGeometryAndDemandBounds],
  ['ordinary-queue-balk', testOrdinaryQueueBalkTimer],
  ['enhanced-market-unavailable', testEnhancedMarketUnavailableTimer],
  ['dock-queue-timeout', testDockQueueTimer],
  ['intent-a-star-occupancy', testIntentOccupancySaturation],
  ['occupant-experience-ceilings', testWalkRouteAndResidentCaps],
  ['failed-stay-incidents', testIncidentCountAndCooldownCaps],
  ['station-rating-display', testRatingDisplayClampRetainsLedger]
];

for (const [name, run] of tests) console.log(`PASS ${name}: ${run()}`);
console.log('GAP visitor environment/sanitation nominal ceilings: private completion applicators can be driven live, but .24 and .18 are unreachable through the upstream 0..8 environment and dirt 0..100 bounds (maximums .144 and .0952); deliberately unclaimed.');
console.log('GAP resident actor stress 120 ceiling: the full live tick immediately converts stress >100 into an incident and resets it to 55, so at/above-120 equality is not externally observable through the production tick seam; deliberately unclaimed.');
console.log(`${tests.length}/${tests.length} saturation/cap evidence tests passed.`);
