import {
  admitTrafficOffer,
  clearUtilityUnderlayAt,
  createInitialState,
  getDockByTile,
  getPodDockAttachmentView,
  getPodDockFuelSupplyView,
  getTrafficOfferPreview,
  setRoom,
  setUtilityUnderlayTile,
  tick,
  tryPlaceModule
} from '../src/sim/index';
import { podVisitTargetSeconds } from '../src/sim/approach-control';
import { hydrateStateFromSave, parseAndMigrateSave, serializeSave } from '../src/sim/save';
import { findPath } from '../src/sim/path';
import {
  ModuleType,
  RoomType,
  TileType,
  type DockEntity,
  type SmallCraftServiceKind,
  type StationState,
  type TrafficOffer
} from '../src/sim/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function advance(state: StationState, seconds: number): void {
  state.controls.paused = false;
  for (let elapsed = 0; elapsed + 0.001 < seconds; elapsed += 0.2) tick(state, Math.min(0.2, seconds - elapsed));
}

function fresh(seed: number): StationState {
  const state = createInitialState({ seed, physicalStarterInventory: true, manualTrafficAdmission: true });
  state.controls.shipsPerCycle = 0;
  state.metrics.credits = 5_000;
  state.legacyMaterialStock = Math.max(state.legacyMaterialStock, 200);
  tick(state, 0);
  return state;
}

function podOffer(
  state: StationState,
  dock: DockEntity,
  id: number,
  passengersTotal: number,
  berthTimeSec = 60,
  offerKind: TrafficOffer['offerKind'] = 'passenger'
): TrafficOffer {
  return {
    id,
    callsign: `TIME-${id}`,
    shipName: 'Observable Pod',
    lane: dock.lane,
    shipType: 'trader',
    hullVariant: 'courier-pod',
    offerKind,
    size: 'small',
    status: 'holding',
    forecastAt: state.now,
    arrivesAt: state.now,
    expiresAt: state.now + 240,
    passengersTotal,
    manifestDemand: { cafeteria: 0, market: 0, lounge: 0 },
    manifestMix: { diner: 0, shopper: 0, lounger: 0, rusher: 1 },
    hospitalityDemand: { meal: 0, drink: 0, leisure: 0, restroom: 0, hygiene: 0, comfort: 0 },
    inboundCargo: { rawMaterial: 0, rawMeal: 0, tradeGood: 0 },
    outboundRequest: { rawMaterial: 0, meal: 0, tradeGood: 0 },
    requestedServices: [],
    berthTimeSec,
    dockingFee: 0,
    projectedSpend: 0,
    riskLabel: 'low'
  };
}

function isolateAndAdmit(
  state: StationState,
  dock: DockEntity,
  offer: TrafficOffer
) {
  if (!dock.allowedShipTypes.includes('trader')) dock.allowedShipTypes.push('trader');
  dock.allowedShipSizes = ['small'];
  for (const candidate of state.docks) {
    if (candidate.id !== dock.id) candidate.allowedShipTypes = [];
  }
  state.trafficOffers.push(offer);
  const admitted = admitTrafficOffer(state, offer.id);
  assert(admitted.ok, admitted.reason ?? 'Pod admission failed.');
  const ship = state.arrivingShips.find((candidate) => candidate.id === offer.id);
  assert(ship?.smallCraftVisit, 'Admitted Pod did not create a SmallCraftVisit.');
  return ship;
}

function waitUntilDocked(state: StationState, shipId: number): NonNullable<StationState['arrivingShips'][number]['smallCraftVisit']> {
  advance(state, 1.8);
  assert(state.arrivingShips.find((ship) => ship.id === shipId)?.stage === 'approach', 'Direct Pod approach finished before the authored ~2s movement.');
  advance(state, 0.4);
  const ship = state.arrivingShips.find((candidate) => candidate.id === shipId);
  assert(ship?.stage === 'docked' && ship.smallCraftVisit, 'Direct Pod approach did not finish in about 2s.');
  const visit = ship.smallCraftVisit;
  assert(visit.dockedAt !== null, 'Pod timing did not start at physical docking.');
  assert(
    visit.patienceExpiresAt - visit.dockedAt >= 120,
    'Pod patience did not provide at least 120s from physical docking.'
  );
  return visit;
}

function assertPrimaryProgress(
  state: StationState,
  shipId: number,
  atSec: number,
  expectedKind: SmallCraftServiceKind
): void {
  const ship = state.arrivingShips.find((candidate) => candidate.id === shipId);
  const dockedAt = ship?.smallCraftVisit?.dockedAt;
  assert(dockedAt !== null && dockedAt !== undefined, 'Timed Pod left before progress inspection.');
  const elapsed = state.now - dockedAt;
  if (elapsed + 0.001 < atSec) advance(state, atSec - elapsed);
  const current = state.arrivingShips.find((candidate) => candidate.id === shipId);
  const visit = current?.smallCraftVisit;
  assert(current?.stage === 'docked' && visit, `Pod was not physically docked at ${atSec}s.`);
  assert(visit.primaryServiceKind === expectedKind, `Expected ${expectedKind} to own the visible timing window, got ${visit.primaryServiceKind ?? 'none'}.`);
  const primary = visit.services.find((service) => service.kind === expectedKind);
  assert(primary?.status === 'active', `${expectedKind} was not actively progressing at ${atSec}s (${primary?.status ?? 'missing'}).`);
  assert(primary.progress > 0 && primary.progress < 1, `${expectedKind} progress was not visible at ${atSec}s (${primary.progress}).`);
}

function moduleBackedDockWithCapability(state: StationState, capability: 'freight'): DockEntity {
  tick(state, 0);
  const dock = state.docks.find((candidate) => candidate.sourceKind === 'pod-dock-module' && candidate.podCapabilities?.includes(capability));
  assert(dock, `Starter station has no ${capability}-capable Pod Dock.`);
  return dock;
}

function attachPodHardware(state: StationState, moduleType: ModuleType): { dock: DockEntity; attachmentTile: number } {
  state.unlocks.tier = 6;
  tick(state, 0);
  for (const dock of state.docks.filter((candidate) => candidate.sourceKind === 'pod-dock-module')) {
    const attachmentTile = state.tiles.findIndex((tile, index) => {
      if (tile !== TileType.Wall || state.moduleOccupancyByTile[index] !== null) return false;
      const view = getPodDockAttachmentView(state, moduleType, index);
      return view.valid && view.dockModuleId === dock.moduleId;
    });
    if (attachmentTile < 0) continue;
    const placed = tryPlaceModule(state, moduleType, attachmentTile);
    assert(placed.ok, `Could not place ${moduleType}: ${placed.reason ?? 'unknown reason'}.`);
    tick(state, 0);
    const rebuilt = state.docks.find((candidate) => candidate.sourceKey === dock.sourceKey);
    assert(rebuilt, 'Pod Dock disappeared after attachment placement.');
    return { dock: rebuilt, attachmentTile };
  }
  throw new Error(`No valid ${moduleType} attachment position was available.`);
}

function connectFuelTank(state: StationState, dock: DockEntity): { tileIndex: number; fuelBefore: number } {
  let origin = state.rooms.findIndex((room, index) =>
    room === RoomType.Maintenance &&
    state.rooms[index + 1] === RoomType.Maintenance &&
    state.rooms[index + state.width] === RoomType.Maintenance &&
    state.rooms[index + state.width + 1] === RoomType.Maintenance &&
    state.moduleOccupancyByTile[index] === null &&
    state.moduleOccupancyByTile[index + 1] === null &&
    state.moduleOccupancyByTile[index + state.width] === null &&
    state.moduleOccupancyByTile[index + state.width + 1] === null
  );
  if (origin < 0) {
    origin = state.tiles.findIndex((tile, index) =>
      tile === TileType.Floor &&
      state.tiles[index + 1] === TileType.Floor &&
      state.tiles[index + state.width] === TileType.Floor &&
      state.tiles[index + state.width + 1] === TileType.Floor &&
      state.moduleOccupancyByTile[index] === null &&
      state.moduleOccupancyByTile[index + 1] === null &&
      state.moduleOccupancyByTile[index + state.width] === null &&
      state.moduleOccupancyByTile[index + state.width + 1] === null
    );
    assert(origin >= 0, 'No 2x2 floor remained for the timing Fuel Tank.');
    for (const tile of [origin, origin + 1, origin + state.width, origin + state.width + 1]) setRoom(state, tile, RoomType.Maintenance);
  }
  const placed = tryPlaceModule(state, ModuleType.FuelTank, origin);
  assert(placed.ok, `Fuel Tank placement failed: ${placed.reason ?? 'unknown reason'}.`);
  tick(state, 0);
  const tank = state.itemNodes.find((node) => node.tileIndex === origin);
  assert(tank, 'Fuel Tank did not create an inventory node.');
  tank.items.fuel = 12;
  const couplerId = dock.attachmentModuleIds?.fuel;
  const coupler = couplerId === undefined ? null : state.moduleInstances.find((module) => module.id === couplerId);
  assert(coupler, 'Fuel Pod Dock lost its coupler.');
  const sink = dock.facing === 'north'
    ? coupler.originTile + state.width
    : dock.facing === 'south'
      ? coupler.originTile - state.width
      : dock.facing === 'east'
        ? coupler.originTile - 1
        : coupler.originTile + 1;
  const route = findPath(state, tank.tileIndex, sink, { allowRestricted: true, intent: 'logistics' });
  assert(route, 'Fuel Tank had no walkable pipe route to its coupler.');
  for (const tile of [tank.tileIndex, ...route]) {
    assert(setUtilityUnderlayTile(state, 'fuel-pipe', tile, true), `Fuel pipe rejected tile ${tile}.`);
  }
  assert(getPodDockFuelSupplyView(state, dock.id).connected, 'Authored fuel path did not connect the timing fixture.');
  return { tileIndex: tank.tileIndex, fuelBefore: tank.items.fuel ?? 0 };
}

function finishByPatience(state: StationState, shipId: number, patienceExpiresAt: number): void {
  advance(state, Math.max(0, patienceExpiresAt - state.now) + 3);
  assert(!state.arrivingShips.some((ship) => ship.id === shipId), 'Pod remained pinned after bounded patience expired.');
}

function testTravelerUsesDisclosedPhysicalWindow(): void {
  const state = fresh(7101);
  const dock = state.docks.find((candidate) => candidate.sourceKind === 'pod-dock-module' && (candidate.podCapabilities?.length ?? 0) === 0);
  assert(dock, 'Traveler timing fixture needs a bare Pod Dock.');
  const offer = podOffer(state, dock, 97101, 1, 50);
  state.trafficOffers.push(offer);
  const preview = getTrafficOfferPreview(state, offer.id);
  state.trafficOffers.pop();
  const target = podVisitTargetSeconds(offer.berthTimeSec, offer.passengersTotal);
  assert(target >= 70 && target <= 110, `Derived Pod target escaped 70–110s (${target}).`);
  assert(preview?.staySeconds.min === 70 && preview.staySeconds.max >= target, 'Approach Control did not disclose the shared Pod target range.');
  const ship = isolateAndAdmit(state, dock, offer);
  // Author a traveler-only call; bare walk-in docks may otherwise roll an
  // additional unmet ship-service opportunity independently of this timing.
  ship.smallCraftVisit!.services = ship.smallCraftVisit!.services.filter((service) => service.kind === 'passenger');
  const visit = waitUntilDocked(state, ship.id);
  assert(visit.targetDurationSec === target, `Runtime target ${visit.targetDurationSec}s diverged from preview target ${target}s.`);
  assertPrimaryProgress(state, ship.id, 15, 'passenger');
  assertPrimaryProgress(state, ship.id, 45, 'passenger');
  const beforeFloor = Math.max(0, visit.dockedAt! + 59.5 - state.now);
  advance(state, beforeFloor);
  assert(state.arrivingShips.find((candidate) => candidate.id === ship.id)?.stage === 'docked', 'Traveler Pod left before the 60s physical floor.');
  advance(state, Math.max(0, visit.dockedAt! + target + 5 - state.now));
  const passenger = visit.services.find((service) => service.kind === 'passenger');
  assert(passenger?.status === 'complete', `Passenger timing completed without physical return (${passenger?.status ?? 'missing'}).`);
  advance(state, 10);
  const lingering = state.arrivingShips.find((candidate) => candidate.id === ship.id);
  assert(!lingering, `Traveler Pod did not leave after physical return plus elapsed target (${lingering?.stage}/${lingering?.visitPhase}/${lingering?.portTurnaround?.phase}; visitors=${state.visitors.filter((visitor) => visitor.originShipId === ship.id).length}).`);
  assert(state.dockedTimeTotal + 0.001 >= target, `Recorded dock occupancy was shorter than the disclosed target (${state.dockedTimeTotal.toFixed(1)} < ${target}).`);
}

function testMixedWaitsForPassengerWindowAndFreight(): void {
  const state = fresh(7102);
  const dock = moduleBackedDockWithCapability(state, 'freight');
  const offer = podOffer(state, dock, 97102, 1, 72, 'mixed');
  const ship = isolateAndAdmit(state, dock, offer);
  const visit = waitUntilDocked(state, ship.id);
  assert(visit.services.some((service) => service.kind === 'freight'), 'Mixed Pod did not carry its real freight operation.');
  assertPrimaryProgress(state, ship.id, 15, 'passenger');
  assertPrimaryProgress(state, ship.id, 45, 'passenger');
  const freight = visit.services.find((service) => service.kind === 'freight');
  assert(freight?.status === 'complete' && freight.transferredUnits === 4, 'Natural freight work did not complete exactly once inside the longer mixed visit.');
  assert(state.arrivingShips.some((candidate) => candidate.id === ship.id), 'Mixed Pod departed when only its faster freight side completed.');
  advance(state, Math.max(0, visit.dockedAt! + visit.targetDurationSec + 5 - state.now));
  advance(state, 10);
  assert(!state.arrivingShips.some((candidate) => candidate.id === ship.id), 'Mixed Pod did not depart after both passenger and freight sides resolved.');
}

function testRefuelIsObservableAndConservesFuelReward(): void {
  const state = fresh(7103);
  const { dock } = attachPodHardware(state, ModuleType.FuelCoupler);
  const tankFixture = connectFuelTank(state, dock);
  const offer = podOffer(state, dock, 97103, 0, 60);
  const earnedBefore = state.metrics.creditsEarnedLifetime;
  const ship = isolateAndAdmit(state, dock, offer);
  const visit = waitUntilDocked(state, ship.id);
  assertPrimaryProgress(state, ship.id, 15, 'refuel');
  assertPrimaryProgress(state, ship.id, 45, 'refuel');
  advance(state, Math.max(0, visit.dockedAt! + visit.targetDurationSec + 3 - state.now));
  const refuel = visit.services.find((service) => service.kind === 'refuel');
  const tank = state.itemNodes.find((node) => node.tileIndex === tankFixture.tileIndex);
  assert(refuel?.status === 'complete' && Math.abs(refuel.transferredUnits - 4) < 0.01, 'Refuel did not transfer the exact four promised units.');
  assert(tank && Math.abs((tank.items.fuel ?? 0) - (tankFixture.fuelBefore - 4)) < 0.01, 'Refuel did not conserve Fuel Tank stock.');
  const earnedAfter = state.metrics.creditsEarnedLifetime;
  assert(earnedAfter > earnedBefore, 'Observable refuel did not pay its configured reward.');
  advance(state, 10);
  assert(state.metrics.creditsEarnedLifetime === earnedAfter, 'Completed refuel paid more than once.');
  assert(!state.arrivingShips.some((candidate) => candidate.id === ship.id), 'Completed refuel Pod retained its physical dock past target plus departure grace.');
}

function testFreightPrimaryUsesObservableWindow(): void {
  const state = fresh(7104);
  const dock = moduleBackedDockWithCapability(state, 'freight');
  const offer = podOffer(state, dock, 97104, 0, 60, 'freight');
  const ship = isolateAndAdmit(state, dock, offer);
  const visit = waitUntilDocked(state, ship.id);
  assertPrimaryProgress(state, ship.id, 15, 'freight');
  assertPrimaryProgress(state, ship.id, 45, 'freight');
  advance(state, Math.max(0, visit.dockedAt! + visit.targetDurationSec + 3 - state.now));
  const freight = visit.services.find((service) => service.kind === 'freight');
  assert(freight?.status === 'complete' && freight.transferredUnits === 4, 'Freight Pod lost its exact physical transfer on the longer clock.');
  advance(state, 10);
  assert(!state.arrivingShips.some((candidate) => candidate.id === ship.id), 'Completed freight Pod retained its physical dock past target plus departure grace.');
}

function testRepairPrimaryUsesObservableWindow(): void {
  const state = fresh(7105);
  const { dock } = attachPodHardware(state, ModuleType.MaintenanceSocket);
  const materialsBefore = state.legacyMaterialStock + state.itemNodes.reduce((sum, node) => sum + (node.items.rawMaterial ?? 0), 0);
  const offer = podOffer(state, dock, 97105, 0, 60);
  const ship = isolateAndAdmit(state, dock, offer);
  const visit = waitUntilDocked(state, ship.id);
  assertPrimaryProgress(state, ship.id, 15, 'repair');
  assertPrimaryProgress(state, ship.id, 45, 'repair');
  advance(state, Math.max(0, visit.dockedAt! + visit.targetDurationSec + 3 - state.now));
  const repair = visit.services.find((service) => service.kind === 'repair');
  const materialsAfter = state.legacyMaterialStock + state.itemNodes.reduce((sum, node) => sum + (node.items.rawMaterial ?? 0), 0);
  assert(repair?.status === 'complete' && Math.abs(repair.transferredUnits - 2) < 0.01, 'Repair Pod did not consume its exact two-unit work package.');
  assert(Math.abs(materialsBefore - materialsAfter - 2) < 0.01, 'Repair timing changed physical material conservation.');
  advance(state, 10);
  assert(!state.arrivingShips.some((candidate) => candidate.id === ship.id), 'Completed repair Pod retained its physical dock past target plus departure grace.');
}

function testBlockedPodUsesDockedPatience(): void {
  const state = fresh(7106);
  const { dock } = attachPodHardware(state, ModuleType.FuelCoupler);
  const tankFixture = connectFuelTank(state, dock);
  const tank = state.itemNodes.find((node) => node.tileIndex === tankFixture.tileIndex);
  assert(tank, 'Blocked fixture lost its Fuel Tank.');
  tank.items.fuel = 0;
  const offer = podOffer(state, dock, 97106, 0, 110);
  const ship = isolateAndAdmit(state, dock, offer);
  const visit = waitUntilDocked(state, ship.id);
  advance(state, 45);
  const refuel = visit.services.find((service) => service.kind === 'refuel');
  assert(refuel?.status === 'blocked' && refuel.blockedReason === 'no fuel in Fuel Tank', 'Blocked Pod did not expose its real stock failure.');
  assert(state.arrivingShips.some((candidate) => candidate.id === ship.id), 'Blocked Pod left before the target-sized patience window.');
  finishByPatience(state, ship.id, visit.patienceExpiresAt);
}

function testSaveResumePreservesOneTimingClock(): void {
  const state = fresh(7107);
  const dock = state.docks.find((candidate) => candidate.sourceKind === 'pod-dock-module' && (candidate.podCapabilities?.length ?? 0) === 0);
  assert(dock, 'Save timing fixture needs a bare Pod Dock.');
  const offer = podOffer(state, dock, 97107, 0, 88);
  const ship = isolateAndAdmit(state, dock, offer);
  ship.smallCraftVisit!.services = [ship.smallCraftVisit!.services.find((service) => service.kind === 'passenger')!];
  ship.smallCraftVisit!.primaryServiceKind = 'passenger';
  ship.smallCraftVisit!.services[0].durationSec = ship.smallCraftVisit!.targetDurationSec;
  const visit = waitUntilDocked(state, ship.id);
  advance(state, 15);
  const progressBefore = visit.services[0].progress;
  const parsed = parseAndMigrateSave(serializeSave('Observable Pod timing', state, 'test'));
  assert(parsed.ok, parsed.ok ? '' : parsed.error);
  const loaded = hydrateStateFromSave(parsed.save, { seed: 7107 }).state;
  loaded.controls.shipsPerCycle = 0;
  const restored = loaded.arrivingShips.find((candidate) => candidate.id === ship.id)?.smallCraftVisit;
  assert(restored, 'Save/resume dropped the active Pod timing record.');
  assert(
    restored.targetDurationSec === visit.targetDurationSec &&
    restored.primaryServiceKind === 'passenger' &&
    restored.dockedAt === visit.dockedAt &&
    restored.patienceExpiresAt === visit.patienceExpiresAt,
    'Save/resume changed the disclosed target, primary service, docking epoch, or patience deadline.'
  );
  assert(Math.abs(restored.services[0].progress - progressBefore) < 0.001, 'Save/resume reset visible service progress.');
  advance(loaded, Math.max(0, restored.dockedAt! + restored.targetDurationSec + 4 - loaded.now));
  advance(loaded, 10);
  const lingering = loaded.arrivingShips.find((candidate) => candidate.id === ship.id);
  assert(!lingering, `Resumed Pod did not finish from its original timing clock (${lingering?.stage}; dock=${lingering?.assignedDockId}/${lingering?.assignedDockSourceKey}; docks=${loaded.docks.map((candidate) => `${candidate.id}/${candidate.sourceKey}/${candidate.podCapabilities?.join('+') || 'bare'}`).join('|')}; ${lingering?.smallCraftVisit?.services.map((service) => `${service.kind}:${service.status}:${service.progress.toFixed(2)}:${service.blockedReason ?? 'ok'}`).join(', ') ?? 'no visit'}).`);
  const outcomes = loaded.openingEconomy.podDemand.recent.filter((outcome) => outcome.visitId === ship.id);
  assert(outcomes.length === 1, `Resumed Pod recorded ${outcomes.length} demand settlements instead of exactly one.`);
}

function testLegacySaveKeepsOldTimingInert(): void {
  const state = fresh(7108);
  const dock = state.docks.find((candidate) => candidate.sourceKind === 'pod-dock-module' && (candidate.podCapabilities?.length ?? 0) === 0);
  assert(dock, 'Legacy timing fixture needs a bare Pod Dock.');
  const offer = podOffer(state, dock, 97108, 0, 60);
  const ship = isolateAndAdmit(state, dock, offer);
  const visit = waitUntilDocked(state, ship.id);
  visit.services = [visit.services.find((service) => service.kind === 'passenger')!];
  visit.services[0].durationSec = 28;
  visit.services[0].elapsedSec = 28;
  visit.services[0].progress = 1;
  visit.services[0].status = 'complete';
  const legacyPatience = state.now + 17;
  visit.patienceExpiresAt = legacyPatience;
  const raw = JSON.parse(serializeSave('Legacy Pod timing', state, 'test')) as {
    snapshot?: { activePortShips?: Array<{ id?: number; smallCraftVisit?: Record<string, unknown> }> };
  };
  const rawVisit = raw.snapshot?.activePortShips?.find((candidate) => candidate.id === ship.id)?.smallCraftVisit;
  assert(rawVisit, 'Serialized fixture omitted its active Pod visit.');
  delete rawVisit.targetDurationSec;
  delete rawVisit.primaryServiceKind;
  delete rawVisit.dockedAt;
  const parsed = parseAndMigrateSave(JSON.stringify(raw));
  assert(parsed.ok, parsed.ok ? '' : parsed.error);
  const loaded = hydrateStateFromSave(parsed.save, { seed: 7108 }).state;
  loaded.controls.shipsPerCycle = 0;
  const restoredShip = loaded.arrivingShips.find((candidate) => candidate.id === ship.id);
  const restored = restoredShip?.smallCraftVisit;
  assert(restored?.targetDurationSec === 0 && restored.primaryServiceKind === null && restored.dockedAt === null, 'Legacy save acquired a new Pod floor or primary clock during hydration.');
  assert(restored.services[0].durationSec === 28 && restored.patienceExpiresAt === legacyPatience, 'Legacy service duration or patience was rewritten by migration.');
  advance(loaded, 5);
  assert(!loaded.arrivingShips.some((candidate) => candidate.id === ship.id), 'Legacy completed Pod was forced through the new 60s floor.');
}

const tests: Array<[string, () => void]> = [
  ['traveler disclosed physical window', testTravelerUsesDisclosedPhysicalWindow],
  ['mixed waits for slower physical side', testMixedWaitsForPassengerWindowAndFreight],
  ['refuel timing and conservation', testRefuelIsObservableAndConservesFuelReward],
  ['freight primary timing', testFreightPrimaryUsesObservableWindow],
  ['repair primary timing', testRepairPrimaryUsesObservableWindow],
  ['blocked bounded patience', testBlockedPodUsesDockedPatience],
  ['save/resume timing and settlement', testSaveResumePreservesOneTimingClock],
  ['legacy save timing stays inert', testLegacySaveKeepsOldTimingInert]
];

for (const [name, run] of tests) {
  run();
  console.log(`PASS ${name}`);
}

console.log(`Pod visit timing: ${tests.length}/${tests.length} focused checks passed.`);
