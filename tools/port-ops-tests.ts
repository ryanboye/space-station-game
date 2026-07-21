import {
  admitTrafficOffer,
  buyImportedTradeGoods,
  buyPreparedMeals,
  createInitialState,
  getBerthInspectorAt,
  getEligibleBerthsForOffer,
  holdTrafficOffer,
  isCrewAutoStaffUnlocked,
  isPortAutoAdmitUnlocked,
  refuseTrafficOffer,
  setBerthAllowedShipSize,
  setCrewManualWorkLane,
  setCrewShiftTarget,
  setPortAutoAdmit,
  setRoom,
  setTile,
  tick,
  tryPlaceModule,
  trySetTile
} from '../src/sim/index';
import { isWalkable, ModuleType, RoomType, TileType, type StationState } from '../src/sim/types';
import { hydrateStateFromSave, parseAndMigrateSave, serializeSave } from '../src/sim/save';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function advance(state: StationState, seconds: number): void {
  state.controls.paused = false;
  const step = 0.2;
  const steps = Math.ceil(seconds / step);
  for (let i = 0; i < steps; i++) tick(state, step);
}

function freshPortState(seed = 1337): StationState {
  return createInitialState({ seed, physicalStarterInventory: true, manualTrafficAdmission: true });
}

function testStarterShellAndOpeningOffer(): void {
  const state = freshPortState();
  advance(state, 4);
  assert(state.crewMembers.length === 8, `Expected 8 starter crew, got ${state.crewMembers.length}.`);
  assert(state.controls.paused, 'Expected the opening manifest choice to pause once.');
  assert(state.controls.crewShiftTargets.food === 1, 'Starter should leave Service capacity uncommitted.');
  assert(state.controls.crewShiftTargets.logistics === 1, 'Starter should leave Cargo capacity uncommitted.');
  assert(state.controls.crewShiftTargets.engineering === 1, 'Starter should retain one Maintenance responder.');
  const starterLaneCounts = state.crewMembers.reduce<Record<string, number>>((counts, crew) => {
    counts[crew.workLane] = (counts[crew.workLane] ?? 0) + 1;
    return counts;
  }, {});
  assert(starterLaneCounts.food === 1, `Starter Service target assigned ${starterLaneCounts.food ?? 0} crew instead of 1.`);
  assert(starterLaneCounts.logistics === 1, `Starter Cargo target assigned ${starterLaneCounts.logistics ?? 0} crew instead of 1.`);
  assert(starterLaneCounts.engineering === 1, `Starter Maintenance target assigned ${starterLaneCounts.engineering ?? 0} crew instead of 1.`);
  assert(starterLaneCounts.flex === 5, `Starter should leave five crew unrostered, got ${starterLaneCounts.flex ?? 0}.`);
  assert(state.trafficOffers.length === 3, `Expected three opening choices within four sim seconds, got ${state.trafficOffers.length}.`);
  assert(state.trafficOffers.map((offer) => offer.offerKind).join(',') === 'passenger,freight,mixed', 'Expected authored passenger, freight, and mixed choices.');
  assert(state.trafficOffers.every((offer) => offer.size !== 'small'), 'Small walk-in pods leaked into Berth contracts.');
  assert(
    state.docks.every((dock) => dock.tiles.every((tile) => state.rooms[tile] !== RoomType.Berth)),
    'Berth floor art leaked into the standalone Dock registry.'
  );
  const berths = getEligibleBerthsForOffer(state, state.trafficOffers[0].id);
  assert(berths.length === 2, `Expected two passenger-capable berths, got ${berths.length}.`);
  const storageCapacity = state.itemNodes
    .filter((node) => state.rooms[node.tileIndex] === 'storage')
    .reduce((sum, node) => sum + node.capacity, 0);
  assert(storageCapacity >= 320, `Expected at least 320 general storage, got ${storageCapacity}.`);
  const ventedStationTiles = state.tiles
    .map((tile, index) => ({ tile, index }))
    .filter(({ tile, index }) => isWalkable(tile) && state.rooms[index] !== RoomType.Berth && !state.pressurized[index]);
  assert(ventedStationTiles.length === 0, `Starter hull has ${ventedStationTiles.length} vented non-berth tiles.`);
}

function testDockRemainsSmallWalkInSurface(): void {
  const state = freshPortState(1441);
  const candidateWalls = state.tiles
    .map((tile, index) => ({ tile, index }))
    .filter(({ tile }) => tile === TileType.Wall);
  const placed = candidateWalls.some(({ index }) => trySetTile(state, index, TileType.Dock));
  assert(placed, 'Starter hull exposes no valid place for a Dock pod port.');
  assert(state.docks.some((dock) => dock.allowedShipSizes.includes('small')), 'Built Dock did not accept small pods.');
}

function testBerthPolicyRejectsSmallPods(): void {
  const state = freshPortState(1442);
  const berth = getBerthInspectorAt(state, state.rooms.findIndex((room) => room === RoomType.Berth));
  assert(berth, 'Starter station exposes no Berth inspector.');
  assert(!berth.allowedShipSizes.includes('small'), 'Berth policy advertised support for small Dock pods.');
  setBerthAllowedShipSize(state, berth.anchorTile, 'small', true);
  const updated = getBerthInspectorAt(state, berth.anchorTile);
  assert(updated && !updated.allowedShipSizes.includes('small'), 'Berth policy allowed a small Dock pod override.');
}

function testLegacyCoreTileIsBuildable(): void {
  const state = freshPortState();
  const oldCore = state.core.serviceTile;
  assert(trySetTile(state, oldCore, TileType.Wall), 'Legacy center marker still blocks building.');
  assert(state.tiles[oldCore] === TileType.Wall, 'Legacy center tile did not accept a normal wall.');
  assert(state.core.serviceTile !== oldCore, 'Internal connectivity anchor did not move off the edited tile.');
}

function testPreparedMealImport(): void {
  const state = freshPortState();
  const mealsBefore = state.metrics.mealStock;
  const creditsBefore = state.metrics.credits;
  assert(buyPreparedMeals(state), 'Expected prepared-meal import to fit the starter counter.');
  assert(state.metrics.mealStock === mealsBefore + 12, 'Prepared-meal import did not reach the service buffer.');
  assert(state.metrics.credits === creditsBefore - 36, 'Prepared-meal import charged the wrong amount.');
}

function testImportedMarketGoodsNeedNoWorkshop(): void {
  const state = freshPortState();
  state.unlocks.tier = 1;
  const origin = state.tiles.findIndex((tile, index) =>
    tile === TileType.Floor &&
    state.rooms[index] === RoomType.None &&
    state.moduleOccupancyByTile[index] === null &&
    state.tiles[index + 1] === TileType.Floor &&
    state.rooms[index + 1] === RoomType.None &&
    state.moduleOccupancyByTile[index + 1] === null
  );
  assert(origin >= 0, 'Expected an empty two-tile floor span for a Market stall.');
  setRoom(state, origin, RoomType.Market);
  setRoom(state, origin + 1, RoomType.Market);
  assert(tryPlaceModule(state, ModuleType.MarketStall, origin).ok, 'Expected Market stall placement.');
  assert(!state.rooms.includes(RoomType.Workshop), 'Test station unexpectedly contains a Workshop.');
  const creditsBefore = state.metrics.credits;
  assert(buyImportedTradeGoods(state), 'Expected imported Market goods to fit the stall.');
  const goods = state.itemNodes.reduce((sum, node) => sum + (node.items.tradeGood ?? 0), 0);
  assert(goods === 12, `Expected 12 imported Market goods, got ${goods}.`);
  assert(state.metrics.credits === creditsBefore - 30, 'Imported Market goods charged the wrong amount.');
}

function testAutomationIsEarnedByOperation(): void {
  const state = freshPortState();
  state.dockedShipsCompleted = 2;
  assert(!isPortAutoAdmitUnlocked(state), 'Dispatch automation unlocked before operational mastery.');
  assert(!isCrewAutoStaffUnlocked(state), 'Shift automation unlocked before operational mastery.');
  state.dockedShipsCompleted = 3;
  assert(isPortAutoAdmitUnlocked(state), 'Dispatch automation did not unlock after three turnarounds.');
  assert(isCrewAutoStaffUnlocked(state), 'Shift automation did not unlock after three turnarounds.');
}

function testAutomationClaimsHoldingOffer(): void {
  const state = freshPortState(1450);
  advance(state, 4);
  advance(state, 60);
  const holding = state.trafficOffers.find(
    (offer) => offer.status === 'holding' && getEligibleBerthsForOffer(state, offer.id).length > 0
  );
  assert(holding, 'Expected an eligible ship waiting in holding orbit.');
  state.dockedShipsCompleted = 3;
  assert(setPortAutoAdmit(state, true), 'Expected earned dispatch automation to enable.');
  advance(state, 1);
  assert(
    state.portOps.contracts.some((contract) => contract.offerId === holding.id),
    'Standing orders ignored a compatible ship already in holding orbit.'
  );
}

function testCrewFixtureWaitIsNotPathFailure(): void {
  const state = freshPortState(1451);
  state.controls.paused = false;
  tick(state, 0);
  for (const crew of state.crewMembers) crew.bladder = 0;
  advance(state, 1);
  assert(
    state.metrics.idleCrewByReason.idle_waiting_fixture > 0,
    'Crew waiting for occupied toilets were not classified as fixture contention.'
  );
}

function testPortOpsSaveRoundTrip(): void {
  const state = freshPortState(17);
  advance(state, 4);
  const offer = state.trafficOffers[0];
  const berth = getEligibleBerthsForOffer(state, offer.id)[0];
  assert(admitTrafficOffer(state, offer.id, berth.anchorTile).ok, 'Expected opening offer admission.');
  advance(state, Math.max(0, offer.arrivesAt - state.now) + 20);
  assert(state.arrivingShips.some((ship) => ship.id === offer.id), 'Expected an active ship before save.');
  const strainedCrew = state.crewMembers[0];
  assert(strainedCrew, 'Expected crew state before save.');
  strainedCrew.energy = 19;
  strainedCrew.thirst = 23;
  strainedCrew.morale = 41;
  strainedCrew.needsStrainSec = 37;
  const savedCrewTile = strainedCrew.tileIndex;
  const text = serializeSave('Port Ops smoke', state, 'test');
  const parsed = parseAndMigrateSave(text);
  assert(parsed.ok, parsed.ok ? '' : parsed.error);
  const loaded = hydrateStateFromSave(parsed.save, { seed: 17 }).state;
  assert(loaded.portOps.contracts.length === 1, 'Expected accepted contract to survive save/load.');
  assert(loaded.portOps.contracts[0].callsign === offer.callsign, 'Loaded contract snapshot changed identity.');
  assert(loaded.arrivingShips.some((ship) => ship.id === offer.id), 'Active port ship did not resume after load.');
  assert(Math.abs(loaded.now - state.now) < 0.01, 'Save/load changed the contract clock.');
  const loadedCrew = loaded.crewMembers.find((crew) => crew.id === strainedCrew.id);
  assert(loadedCrew?.energy === 19, `Crew fatigue reset on load (${loadedCrew?.energy ?? 'missing'}).`);
  assert(loadedCrew.thirst === 23 && loadedCrew.morale === 41, 'Crew needs reset on load.');
  assert(loadedCrew.needsStrainSec === 37, 'Crew need consequences reset on load.');
  assert(loadedCrew.tileIndex === savedCrewTile, 'Crew position reset to the shared fallback tile on load.');
  const loadedContract = loaded.portOps.contracts[0];
  advance(loaded, Math.max(0, loadedContract.hardDepartureAt - loaded.now) + 12);
  assert(loaded.portOps.settlements.length === 1, 'Resumed contract did not settle exactly once.');
  const legacy = JSON.parse(text) as { schemaVersion: number };
  legacy.schemaVersion = 2;
  const rejected = parseAndMigrateSave(JSON.stringify(legacy));
  assert(!rejected.ok && rejected.error.includes('previous station design'), 'Expected clear old-save rejection.');
}

function testServiceCrewControlsThroughput(): void {
  const state = freshPortState(91);
  advance(state, 4);
  const passenger = state.trafficOffers.find((offer) => offer.offerKind === 'passenger');
  assert(passenger, 'Expected passenger offer.');
  assert(setCrewShiftTarget(state, 'food', 0), 'Expected service shift to accept zero crew.');
  const berth = getEligibleBerthsForOffer(state, passenger.id)[0];
  assert(admitTrafficOffer(state, passenger.id, berth.anchorTile).ok, 'Expected passenger admission.');
  advance(state, Math.max(0, passenger.arrivesAt - state.now) + 28);
  const contract = state.portOps.contracts.find((entry) => entry.offerId === passenger.id);
  const mealPromise = contract?.promises.find((promise) => promise.kind === 'passengers-served');
  assert(mealPromise?.completed === 0, `Meals advanced without service crew (${mealPromise?.completed ?? 'missing'}).`);
  assert(setCrewShiftTarget(state, 'food', 3), 'Expected three service crew to fit the shift.');
  advance(state, 25);
  assert((mealPromise?.completed ?? 0) > 0, 'Service crew failed to advance the meal promise.');
}

function testCrewManualLaneOverrideIsStickyAndReleasable(): void {
  const state = freshPortState(101);
  advance(state, 4);
  const crew = state.crewMembers[0];
  assert(crew, 'Expected a named starter crew member.');
  assert(setCrewManualWorkLane(state, crew.id, 'engineering'), 'Expected manual Maintenance assignment.');
  advance(state, 12);
  assert(crew.workLane === 'engineering', `Automatic dispatch stole a manual assignment (${crew.workLane}).`);
  assert(crew.manualWorkLane === 'engineering', 'Manual assignment marker was lost.');
  assert(setCrewManualWorkLane(state, crew.id, null), 'Expected release to shift control.');
  advance(state, 2);
  assert(crew.manualWorkLane === null, 'Crew did not return to shift control.');
}

function testConsignedFreightUsesCargoCrewWithoutInflatingStock(): void {
  const state = freshPortState(121);
  advance(state, 4);
  const freight = state.trafficOffers.find((offer) => offer.offerKind === 'freight');
  assert(freight, 'Expected freight offer.');
  const stockBefore = state.metrics.materials;
  assert(setCrewShiftTarget(state, 'logistics', 0), 'Expected cargo shift to accept zero crew.');
  const berth = getEligibleBerthsForOffer(state, freight.id)[0];
  assert(admitTrafficOffer(state, freight.id, berth.anchorTile).ok, 'Expected freight admission.');
  advance(state, Math.max(0, freight.arrivesAt - state.now) + 24);
  const contract = state.portOps.contracts.find((entry) => entry.offerId === freight.id);
  const inbound = contract?.promises.find((promise) => promise.kind === 'freight-unloaded');
  assert(inbound?.completed === 0, `Consigned freight moved without cargo crew (${inbound?.completed ?? 'missing'}).`);
  assert(state.metrics.materials === stockBefore, 'Consigned freight entered station supply totals.');
  assert(setCrewShiftTarget(state, 'logistics', 3), 'Expected three cargo crew to fit the shift.');
  advance(state, 90);
  assert((inbound?.completed ?? 0) > 8, 'Cargo crew failed to physically haul consigned freight beyond arm staging.');
  assert(state.metrics.materials <= stockBefore, 'Consigned freight inflated station material stock.');
  assert(state.portOps.telemetry.cargoUnitTileDistance > 0, 'Physical cargo travel was not recorded.');
  const inboundJobs = state.jobs.filter((job) => job.portShipId === freight.id && job.portCargoDirection === 'inbound');
  assert(inboundJobs.length > 0, 'Inbound consignment never created physical haul jobs.');
  assert(
    inboundJobs.every((job) => job.portCargoLotId !== undefined),
    'An inbound haul batch lost its contract cargo-lot identity.'
  );
}

function testAuthoredFreightPlanCanCompleteBothDirections(): void {
  const state = freshPortState(131);
  advance(state, 4);
  const freight = state.trafficOffers.find((offer) => offer.offerKind === 'freight');
  assert(freight, 'Expected freight offer.');
  assert(setCrewShiftTarget(state, 'logistics', 4), 'Expected the disclosed four-Cargo plan to fit.');
  const berth = getEligibleBerthsForOffer(state, freight.id)[0];
  assert(admitTrafficOffer(state, freight.id, berth.anchorTile).ok, 'Expected freight admission.');
  advance(state, Math.max(0, freight.arrivesAt - state.now) + freight.berthTimeSec + 8);
  const contract = state.portOps.contracts.find((entry) => entry.offerId === freight.id);
  const inbound = contract?.promises.find((promise) => promise.kind === 'freight-unloaded');
  const outbound = contract?.promises.find((promise) => promise.kind === 'freight-loaded');
  assert(
    inbound?.completed === inbound?.target,
    `Disclosed Cargo plan missed inbound freight (${inbound?.completed ?? 0}/${inbound?.target ?? 'missing'}).`
  );
  assert(
    outbound?.completed === outbound?.target,
    `Disclosed Cargo plan missed outbound freight (${outbound?.completed ?? 0}/${outbound?.target ?? 'missing'}).`
  );
  assert(state.portOps.telemetry.cargoUnitTileDistance > 0, 'Completed freight did not record physical route distance.');
}

function testFreightAcceptanceReservesCapacity(): void {
  const state = freshPortState(222);
  advance(state, 4);
  const storageNodes = state.itemNodes.filter((node) => state.rooms[node.tileIndex] === 'storage');
  let fill = storageNodes.reduce((sum, node) => sum + node.capacity, 0) - 40;
  for (const node of storageNodes) {
    const amount = Math.min(fill, node.capacity);
    node.items = amount > 0 ? { rawMaterial: amount } : {};
    fill -= amount;
  }
  const freight = state.trafficOffers.find((offer) => offer.offerKind === 'freight');
  assert(freight, 'Expected freight offer.');
  const berth = getEligibleBerthsForOffer(state, freight.id)[0];
  const admission = admitTrafficOffer(state, freight.id, berth.anchorTile);
  assert(!admission.ok, 'Accepted freight beyond unreserved storage capacity.');
  assert(admission.reason?.includes('needs 48 storage'), `Expected concrete storage refusal, got ${admission.reason ?? 'none'}.`);
}

function testPassengerEarlySuccess(): void {
  const state = freshPortState(404);
  advance(state, 4);
  const passenger = state.trafficOffers.find((offer) => offer.offerKind === 'passenger');
  assert(passenger, 'Expected passenger offer.');
  const berth = getEligibleBerthsForOffer(state, passenger.id)[0];
  assert(admitTrafficOffer(state, passenger.id, berth.anchorTile).ok, 'Expected passenger admission.');
  advance(state, Math.max(0, passenger.arrivesAt - state.now) + passenger.berthTimeSec + 8);
  const contract = state.portOps.contracts.find((entry) => entry.offerId === passenger.id);
  assert(contract?.status === 'departed', `Expected passenger departure, got ${contract?.status ?? 'missing'}.`);
  const returned = contract.promises.find((promise) => promise.kind === 'passengers-returned');
  assert(returned?.completed === returned?.target, `Expected all passengers returned, got ${returned?.completed ?? 0}/${returned?.target ?? 0}.`);
  const meals = contract.promises.find((promise) => promise.kind === 'passengers-served');
  const restrooms = contract.promises.find((promise) => promise.kind === 'restroom-served');
  assert(meals?.completed === meals?.target, `Expected the starter meal plan to complete, got ${meals?.completed ?? 0}/${meals?.target ?? 0}.`);
  assert(restrooms?.completed === restrooms?.target, `Expected the starter restroom plan to complete, got ${restrooms?.completed ?? 0}/${restrooms?.target ?? 0}.`);
  assert(contract.settlementId !== null, 'Expected successful passenger settlement.');
  const settlement = state.portOps.settlements.find((entry) => entry.id === contract.settlementId);
  assert((settlement?.passengerSpendingCredits ?? 0) > 0, 'Passenger spending was not attributed to its origin contract.');
}

function testBlockedPassengerReturnCannotPinBerth(): void {
  const state = freshPortState(505);
  advance(state, 4);
  const passenger = state.trafficOffers.find((offer) => offer.offerKind === 'passenger');
  assert(passenger, 'Expected passenger offer.');
  const berth = getEligibleBerthsForOffer(state, passenger.id)[0];
  assert(admitTrafficOffer(state, passenger.id, berth.anchorTile).ok, 'Expected passenger admission.');
  advance(state, Math.max(0, passenger.arrivesAt - state.now) + 18);
  const ship = state.arrivingShips.find((entry) => entry.id === passenger.id);
  assert(ship, 'Expected passenger ship to be docked.');
  const bayDoor = ship.bayTiles.find((tile) => state.tiles[tile] === TileType.Door);
  assert(bayDoor !== undefined, 'Expected a berth door that can be blocked.');
  setTile(state, bayDoor, TileType.Wall);
  advance(state, passenger.berthTimeSec + 18);
  const contract = state.portOps.contracts.find((entry) => entry.offerId === passenger.id);
  assert(contract?.status === 'departed', `Blocked return pinned the berth (${contract?.status ?? 'missing'}).`);
  const returned = contract.promises.find((promise) => promise.kind === 'passengers-returned');
  assert((returned?.completed ?? 0) < (returned?.target ?? 0), 'Blocked return unexpectedly completed in full.');
  assert(!state.visitors.some((visitor) => visitor.originShipId === passenger.id), 'Stranded origin passengers survived hard departure cleanup.');
  const releasedBerth = getBerthInspectorAt(state, berth.anchorTile);
  assert(releasedBerth?.occupiedByShipId === null, 'Forced passenger departure retained berth occupancy.');
}

function testAuthoredOfferSequence(): void {
  const state = freshPortState(2026);
  advance(state, 4);
  const kinds = state.trafficOffers.map((offer) => offer.offerKind);
  assert(kinds.includes('passenger'), `Missing passenger offer: ${kinds.join(', ')}`);
  assert(kinds.includes('freight'), `Missing freight offer: ${kinds.join(', ')}`);
  assert(kinds.includes('mixed'), `Missing mixed offer: ${kinds.join(', ')}`);
}

function testOfferHoldIsFinite(): void {
  const state = freshPortState(515);
  advance(state, 4);
  const offer = state.trafficOffers[0];
  assert(offer, 'Expected an offer to hold.');
  offer.arrivesAt = state.now;
  offer.status = 'holding';
  const previousExpiry = offer.expiresAt;
  assert(holdTrafficOffer(state, offer.id), 'Expected one schedule hold.');
  assert(offer.expiresAt > previousExpiry, 'Hold did not extend the inspectable expiry.');
  assert(!holdTrafficOffer(state, offer.id), 'The same offer accepted unlimited schedule holds.');
}

function testRefusalHasNoGlobalRatingBleed(): void {
  const state = freshPortState(525);
  advance(state, 4);
  const offer = state.trafficOffers[0];
  const ratingBefore = state.usageTotals.ratingDelta;
  assert(refuseTrafficOffer(state, offer.id), 'Expected a live offer to be refused.');
  advance(state, 2);
  assert(state.usageTotals.ratingDelta === ratingBefore, 'Refusing optional work changed global station rating.');
  assert(state.portOps.telemetry.offersRefused === 1, 'Refusal was not recorded in port telemetry.');
}

function testCargoArmQuietUseStaysSafe(): void {
  const state = freshPortState(606);
  advance(state, 4);
  state.portOps.cargoHandledLifetime = 24;
  advance(state, 45);
  assert(state.portOps.cargoArmStatus !== 'fault', 'A small intermittent load faulted the cargo arm.');
  assert(state.portOps.cargoArmStrain < 24, `Cargo arm failed to cool while idle (${state.portOps.cargoArmStrain}).`);
}

function testCargoArmSustainedLoadTelegraphsFault(): void {
  const state = freshPortState(707);
  advance(state, 4);
  assert(setCrewShiftTarget(state, 'engineering', 0), 'Expected Maintenance to be removable for the unrescued fault case.');
  state.portOps.cargoHandledLifetime = 100;
  advance(state, 20);
  assert(state.portOps.cargoArmStrain >= 60, 'Sustained handling did not produce visible strain.');
  assert(state.portOps.cargoArmStatus === 'fault', `Expected seeded cargo-arm fault, got ${state.portOps.cargoArmStatus}.`);
  assert(state.portOps.cargoArmFaults === 1, `Expected one bounded fault, got ${state.portOps.cargoArmFaults}.`);
}

function testSecondCargoArmProvidesWearRedundancy(): void {
  const state = freshPortState(717);
  advance(state, 4);
  const arm = state.moduleInstances.find((module) => module.type === ModuleType.CargoArm);
  assert(arm, 'Expected a starter cargo arm.');
  state.moduleInstances.push({ ...arm, id: Math.max(...state.moduleInstances.map((module) => module.id)) + 1, tiles: [...arm.tiles] });
  state.portOps.cargoHandledLifetime = 60;
  advance(state, 0.1);
  assert(state.portOps.cargoArmStrain < 40, `A redundant cargo arm did not divide handling strain (${state.portOps.cargoArmStrain}).`);
}

function testCargoArmRepairRestoresThroughput(): void {
  const state = freshPortState(808);
  advance(state, 4);
  state.portOps.cargoArmStatus = 'fault';
  state.portOps.cargoArmStrain = 100;
  assert(setCrewShiftTarget(state, 'engineering', 1), 'Expected a Maintenance reassignment.');
  advance(state, 35);
  const engineers = state.crewMembers
    .filter((crew) => crew.workLane === 'engineering')
    .map((crew) => `${crew.id}@${crew.tileIndex}->${crew.targetTile ?? 'none'}${crew.resting ? ':rest' : ''}`)
    .join(',');
  assert(
    String(state.portOps.cargoArmStatus) === 'ready',
    `Maintenance crew failed to restore the cargo arm (progress ${state.portOps.cargoArmRepairProgress.toFixed(1)}/8; ${engineers || 'no engineer'}).`
  );
  assert(state.portOps.cargoArmStrain <= 28, `Repair did not reset cargo-arm strain (${state.portOps.cargoArmStrain}).`);
}

function testLegacyRandomFailuresStayDormant(): void {
  const state = freshPortState(909);
  advance(state, 180);
  assert(state.crewMembers.length === 8, `Baseline hull services lost crew during a quiet shift (${state.crewMembers.length}/8 remain).`);
  assert(state.metrics.deathsTotal === 0, `Baseline hull services caused ${state.metrics.deathsTotal} deaths.`);
  assert(state.effects.cafeteriaStallUntil <= 0, 'Arbitrary cafeteria stall fired in port operations.');
  assert(state.effects.securityDelayUntil <= 0, 'Arbitrary security delay fired in port operations.');
  assert(state.effects.brownoutUntil <= 0, 'Arbitrary brownout fired in port operations.');
  assert(state.effects.blockedUntilByTile.size === 0, 'Arbitrary corridor blockage fired in port operations.');
}

function testHardDepartureWithUnfinishedWork(): void {
  const state = freshPortState(2026);
  advance(state, 70);
  const freight = state.trafficOffers.find((offer) => offer.offerKind === 'freight');
  assert(freight, 'Expected authored freight offer.');
  const berth = getEligibleBerthsForOffer(state, freight.id)[0];
  assert(berth, 'Expected cargo-capable berth for freight offer.');
  const admission = admitTrafficOffer(state, freight.id, berth.anchorTile);
  assert(admission.ok, admission.reason ?? 'Freight admission failed.');
  state.crew.total = 0;
  advance(state, Math.max(0, freight.arrivesAt - state.now) + freight.berthTimeSec + 12);
  assert(!state.arrivingShips.some((ship) => ship.id === freight.id), 'Freight ship pinned its berth past hard departure.');
  const contract = state.portOps.contracts.find((entry) => entry.offerId === freight.id);
  assert(contract?.status === 'departed', `Expected departed contract, got ${contract?.status ?? 'missing'}.`);
  assert(contract.settlementId !== null, 'Expected partial settlement for unfinished freight work.');
  assert(
    state.jobs.filter((job) => job.portShipId === freight.id).every((job) => job.state === 'done' || job.state === 'expired'),
    'Departed ship retained active cargo jobs.'
  );
  assert(
    state.reservations
      .filter((reservation) => reservation.ownerKind === 'job')
      .filter((reservation) => state.jobs.some((job) => job.id === reservation.ownerId && job.portShipId === freight.id))
      .every((reservation) => reservation.releaseReason !== null),
    'Departed ship retained active job reservations.'
  );
  const earnedAfterSettlement = state.metrics.creditsEarnedLifetime;
  const settlementCount = state.portOps.settlements.length;
  const settlementId = contract.settlementId;
  advance(state, 20);
  assert(state.portOps.settlements.length === settlementCount, 'Contract settled more than once.');
  assert(contract.settlementId === settlementId, 'Repeated departure ticks replaced the original settlement.');
  assert(state.metrics.creditsEarnedLifetime === earnedAfterSettlement, 'Repeated departure ticks paid the contract twice.');
}

const tests: Array<[string, () => void]> = [
  ['starter shell and opening offer', testStarterShellAndOpeningOffer],
  ['dock remains small walk-in surface', testDockRemainsSmallWalkInSurface],
  ['berth policy rejects small pods', testBerthPolicyRejectsSmallPods],
  ['legacy core tile is buildable', testLegacyCoreTileIsBuildable],
  ['prepared meal import', testPreparedMealImport],
  ['imported market goods need no workshop', testImportedMarketGoodsNeedNoWorkshop],
  ['automation earned by operation', testAutomationIsEarnedByOperation],
  ['automation claims holding offer', testAutomationClaimsHoldingOffer],
  ['crew fixture wait is not path failure', testCrewFixtureWaitIsNotPathFailure],
  ['port operations save round trip', testPortOpsSaveRoundTrip],
  ['service crew controls throughput', testServiceCrewControlsThroughput],
  ['manual crew lane override', testCrewManualLaneOverrideIsStickyAndReleasable],
  ['consigned freight cargo labor', testConsignedFreightUsesCargoCrewWithoutInflatingStock],
  ['authored freight plan completes both directions', testAuthoredFreightPlanCanCompleteBothDirections],
  ['freight capacity reservation', testFreightAcceptanceReservesCapacity],
  ['passenger early success', testPassengerEarlySuccess],
  ['blocked passenger hard departure', testBlockedPassengerReturnCannotPinBerth],
  ['authored offer sequence', testAuthoredOfferSequence],
  ['finite offer hold', testOfferHoldIsFinite],
  ['refusal has no rating bleed', testRefusalHasNoGlobalRatingBleed],
  ['cargo arm quiet use', testCargoArmQuietUseStaysSafe],
  ['cargo arm sustained fault', testCargoArmSustainedLoadTelegraphsFault],
  ['cargo arm redundancy', testSecondCargoArmProvidesWearRedundancy],
  ['cargo arm repair', testCargoArmRepairRestoresThroughput],
  ['legacy random failures dormant', testLegacyRandomFailuresStayDormant],
  ['hard departure with unfinished work', testHardDepartureWithUnfinishedWork]
];

const runtimeProcess = (globalThis as typeof globalThis & {
  process?: { env?: Record<string, string | undefined> };
}).process;
const filter = runtimeProcess?.env?.PORT_OPS_TEST_FILTER?.trim().toLowerCase() ?? '';
const selectedTests = filter.length > 0
  ? tests.filter(([name]) => name.toLowerCase().includes(filter))
  : tests;
if (selectedTests.length === 0) throw new Error(`No focused port test matched "${filter}".`);

for (const [name, run] of selectedTests) {
  run();
  console.log(`PASS ${name}`);
}

console.log(`Port operations: ${selectedTests.length} focused tests passed${filter ? ` (filter: ${filter})` : ''}.`);
