import {
  admitTrafficOffer,
  buyImportedTradeGoodsDetailed,
  buyPreparedMealsDetailed,
  createInitialState,
  getBerthFacilityAt,
  getBerthInspectorAt,
  getDockByTile,
  getEligibleBerthsForOffer,
  getPodDockAttachmentView,
  getPodDockFuelSupplyView,
  getPodDockPlacementView,
  getTrafficOfferPreview,
  holdTrafficOffer,
  isCrewAutoStaffUnlocked,
  isModuleUnlocked,
  isPortAutoAdmitUnlocked,
  moduleCreditBuildCost,
  removeModuleAtTile,
  refuseTrafficOffer,
  setBerthAllowedShipSize,
  setCrewManualWorkLane,
  setCrewShiftTarget,
  setDockPurpose,
  setPortAutoAdmit,
  setRoom,
  setTile,
  clearUtilityUnderlayAt,
  setUtilityUnderlayTile,
  tick,
  tryPlaceModule,
  trySetTile
} from '../src/sim/index';
import { isWalkable, ModuleType, RoomType, TileType, type DockEntity, type StationState, type TrafficOffer } from '../src/sim/types';
import { hydrateStateFromSave, parseAndMigrateSave, serializeSave } from '../src/sim/save';
import { findPath } from '../src/sim/path';

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

function smallCraftOffer(state: StationState, dock: DockEntity, id: number): TrafficOffer {
  return {
    id,
    callsign: `POD-${id}`,
    shipName: 'Courier Pod',
    lane: dock.lane,
    shipType: 'trader',
    hullVariant: 'courier-pod',
    offerKind: 'passenger',
    size: 'small',
    status: 'holding',
    forecastAt: state.now,
    arrivesAt: state.now,
    expiresAt: state.now + 120,
    passengersTotal: 1,
    manifestDemand: { cafeteria: 1, market: 0, lounge: 0 },
    manifestMix: { diner: 1, shopper: 0, lounger: 0, rusher: 0 },
    hospitalityDemand: { meal: 1, drink: 0, leisure: 0, restroom: 0, hygiene: 0, comfort: 0 },
    inboundCargo: { rawMaterial: 0, rawMeal: 0, tradeGood: 0 },
    outboundRequest: { rawMaterial: 0, meal: 0, tradeGood: 0 },
    requestedServices: [],
    berthTimeSec: 50,
    dockingFee: 0,
    projectedSpend: 0,
    riskLabel: 'low'
  };
}

function sizedPassengerOffer(
  state: StationState,
  id: number,
  size: 'medium' | 'large'
): TrafficOffer {
  const dock = state.docks.find((entry) => entry.sourceKind === 'pod-dock-module') ?? state.docks[0];
  assert(dock, 'Sized-offer fixture requires a lane source.');
  return {
    ...smallCraftOffer(state, dock, id),
    callsign: `CLAMP-${id}`,
    shipName: `${size} clamp proof vessel`,
    shipType: 'tourist',
    hullVariant: size === 'large' ? 'luxury-liner' : 'passenger-shuttle',
    size,
    arrivesAt: state.now + 60,
    expiresAt: state.now + 600
  };
}

function buildModernBerth(
  state: StationState,
  x: number,
  y: number,
  width: number,
  height: number,
  clampCount: number
): { anchor: number; access: number; freeClampTiles: number[] } {
  for (let yy = y; yy < y + height; yy += 1) {
    for (let xx = x; xx < x + width; xx += 1) {
      const tile = yy * state.width + xx;
      setTile(state, tile, TileType.Floor);
      setRoom(state, tile, RoomType.Berth);
    }
  }
  // A modern berth requires a station-side pressurized neighbor opposite its
  // open vessel face. The bay itself remains exposed to surrounding space.
  const access = (y + height) * state.width + x + Math.floor(width / 2);
  setTile(state, access, TileType.Floor);
  state.pressurized[access] = true;

  const control = (y + height - 2) * state.width + x + 1;
  const controlPlacement = tryPlaceModule(state, ModuleType.BerthControl, control);
  assert(controlPlacement.ok, `Berth Control placement failed: ${controlPlacement.reason ?? 'unknown'}.`);

  const gangwayX = x + Math.floor(width / 2);
  const gangway = y * state.width + gangwayX;
  const gangwayPlacement = tryPlaceModule(state, ModuleType.Gangway, gangway);
  assert(gangwayPlacement.ok, `Gangway placement failed in clamp fixture: ${gangwayPlacement.reason ?? 'unknown'}.`);

  const freeClampTiles = Array.from({ length: width }, (_, offset) => y * state.width + x + offset)
    .filter((tile) => tile !== gangway);
  assert(freeClampTiles.length >= clampCount, 'Berth fixture has too few service-rail clamp positions.');
  for (const tile of freeClampTiles.slice(0, clampCount)) {
    const placed = tryPlaceModule(state, ModuleType.DockingClamp, tile);
    assert(placed.ok, `Docking Clamp placement failed: ${placed.reason ?? 'unknown'}.`);
  }
  tick(state, 0);
  state.pressurized[access] = true;
  const facility = getBerthFacilityAt(state, y * state.width + x);
  assert(
    facility?.geometryValid && !facility.legacyCompatibility,
    `Fixture did not produce a valid modern Berth (${facility ? `${facility.geometry}; exposed=${facility.spaceExposed}; access=${facility.accessReady}; ${facility.reasons.join('; ')}` : 'missing facility'}).`
  );
  return { anchor: facility.anchorTile, access, freeClampTiles: freeClampTiles.slice(clampCount) };
}

function admitSmallCraftAtDock(state: StationState, dock: DockEntity, id: number) {
  if (!dock.allowedShipTypes.includes('trader')) dock.allowedShipTypes.push('trader');
  dock.allowedShipSizes = ['small'];
  for (const candidate of state.docks) {
    if (candidate.id !== dock.id) candidate.allowedShipTypes = [];
  }
  if (!state.trafficOffers.some((offer) => offer.id === id)) state.trafficOffers.push(smallCraftOffer(state, dock, id));
  const admission = admitTrafficOffer(state, id);
  assert(admission.ok, admission.reason ?? 'Expected small craft admission.');
  const ship = state.arrivingShips.find((entry) => entry.id === id);
  assert(ship, 'Expected admitted small craft.');
  return ship;
}

function placeFuelPodDock(state: StationState): { dock: DockEntity; couplerTile: number } {
  tick(state, 0);
  const authored = state.docks.find((dock) => dock.sourceKind === 'pod-dock-module' && dock.podCapabilities?.includes('fuel'));
  if (authored && authored.attachmentModuleIds?.fuel !== undefined) {
    const coupler = state.moduleInstances.find((module) => module.id === authored.attachmentModuleIds?.fuel);
    assert(coupler, 'Expected the starter Fuel Coupler module.');
    return { dock: authored, couplerTile: coupler.originTile };
  }
  const mount = state.tiles.findIndex((tile, index) => tile === TileType.Wall && getPodDockPlacementView(state, index).valid);
  assert(mount >= 0, 'Expected an exterior Pod Dock mount.');
  assert(tryPlaceModule(state, ModuleType.PodDock, mount).ok, 'Expected Pod Dock placement.');
  const couplerTile = state.tiles.findIndex((tile, index) =>
    tile === TileType.Wall && index !== mount && state.moduleOccupancyByTile[index] === null &&
    getPodDockAttachmentView(state, ModuleType.FuelCoupler, index).valid
  );
  assert(couplerTile >= 0, 'Expected adjacent Fuel Coupler mount.');
  assert(tryPlaceModule(state, ModuleType.FuelCoupler, couplerTile).ok, 'Expected Fuel Coupler placement.');
  tick(state, 0);
  const dock = getDockByTile(state, mount);
  assert(dock, 'Expected module-backed Pod Dock after placement.');
  return { dock, couplerTile };
}

function fuelTankNode(state: StationState) {
  const fuelTankTiles = new Set(
    state.moduleInstances.filter((module) => module.type === ModuleType.FuelTank).map((module) => module.originTile)
  );
  let node = state.itemNodes.find((candidate) => fuelTankTiles.has(candidate.tileIndex));
  if (!node) {
    state.unlocks.tier = 6;
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
      if (origin >= 0) {
        setRoom(state, origin, RoomType.Maintenance);
        setRoom(state, origin + 1, RoomType.Maintenance);
        setRoom(state, origin + state.width, RoomType.Maintenance);
        setRoom(state, origin + state.width + 1, RoomType.Maintenance);
      }
    }
    assert(origin >= 0, 'Expected an empty 2x2 Maintenance area for a Fuel Tank.');
    assert(tryPlaceModule(state, ModuleType.FuelTank, origin).ok, 'Expected Fuel Tank placement for fuel-service test.');
    tick(state, 0);
    node = state.itemNodes.find((candidate) => candidate.tileIndex === origin);
  }
  assert(node, 'Expected a Fuel Tank inventory node.');
  for (const dock of state.docks.filter((entry) => entry.podCapabilities?.includes('fuel'))) {
    const couplerId = dock.attachmentModuleIds?.fuel;
    const coupler = couplerId === undefined ? null : state.moduleInstances.find((module) => module.id === couplerId);
    assert(coupler, 'Fuel-capable Pod Dock lost its physical Fuel Coupler.');
    const sink = dock.facing === 'north'
      ? coupler.originTile + state.width
      : dock.facing === 'south'
        ? coupler.originTile - state.width
        : dock.facing === 'east'
          ? coupler.originTile - 1
          : coupler.originTile + 1;
    const route = findPath(state, node.tileIndex, sink, { allowRestricted: true, intent: 'logistics' });
    assert(route, 'Expected a walkable Fuel Pipe route from tank to Coupler service tile.');
    for (const tile of [node.tileIndex, ...route]) {
      assert(setUtilityUnderlayTile(state, 'fuel-pipe', tile, true), `Fuel Pipe fixture rejected tile ${tile}.`);
    }
  }
  return node;
}

function testStarterShellAndDockOnlyTraffic(): void {
  const state = freshPortState();
  const fuelTankVisibleAtStart = isModuleUnlocked(state, ModuleType.FuelTank);
  advance(state, 4);
  assert(state.crewMembers.length === 6, `Expected 6 starter crew, got ${state.crewMembers.length}.`);
  assert(!state.controls.paused, 'Opening manifests should not interrupt play by pausing the simulation.');
  assert(state.controls.crewShiftTargets.food === 1, 'Starter should leave Service capacity uncommitted.');
  assert(state.controls.crewShiftTargets.logistics === 1, 'Starter should leave Cargo capacity uncommitted.');
  assert(state.controls.crewShiftTargets.engineering === 1, 'Starter should retain one Maintenance responder.');
  const starterLaneCounts = state.crewMembers.reduce<Record<string, number>>((counts, crew) => {
    counts[crew.workLane] = (counts[crew.workLane] ?? 0) + 1;
    return counts;
  }, {});
  assert((starterLaneCounts.food ?? 0) >= 1, 'Starter should staff food and market service.');
  assert((starterLaneCounts.logistics ?? 0) >= 1, 'Starter should staff cargo handling.');
  assert((starterLaneCounts.engineering ?? 0) >= 1, 'Starter should retain a maintenance responder.');
  assert(!state.rooms.includes(RoomType.Berth), 'Fresh starter should not begin with a passenger berth.');
  const podDocks = state.docks.filter((dock) => dock.sourceKind === 'pod-dock-module');
  assert(podDocks.length === 2, `Expected two starter Pod Docks, got ${podDocks.length}.`);
  assert(podDocks.every((dock) => dock.allowedShipSizes.join(',') === 'small'), 'Starter Pod Docks accepted a non-pod ship size.');
  assert(podDocks.every((dock) => dock.accessTile !== undefined && state.pressurized[dock.accessTile]), 'Starter Pod Dock lacks pressurized interior access.');
  assert(podDocks.some((dock) => dock.podCapabilities?.includes('freight')), 'Starter is missing a freight-capable Pod Dock.');
  assert(!state.moduleInstances.some((module) =>
    module.type === ModuleType.FuelCoupler || module.type === ModuleType.FuelTank || module.type === ModuleType.MarketStall
  ), 'Minimal starter silently completed optional refuel or market operations.');
  assert(state.ops.marketActive === 0, 'Minimal starter opened a completed public market before the player built one.');
  assert(fuelTankVisibleAtStart, 'Fuel Tank is not build-visible at Tier 0.');
  const ventedStationTiles = state.tiles
    .map((tile, index) => ({ tile, index }))
    .filter(({ tile, index }) => isWalkable(tile) && state.rooms[index] !== RoomType.Berth && !state.pressurized[index]);
  assert(ventedStationTiles.length === 0, `Starter hull has ${ventedStationTiles.length} vented non-berth tiles.`);
  advance(state, 36);
  assert(state.trafficOffers.length === 0, 'Dock-only starter generated berth contracts before a berth existed.');
  assert(state.portOps.offerSequenceIndex === 0, 'Dock-only traffic consumed the berth-contract onboarding sequence.');
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

function testPodDockModulesOwnSmallCraftAccessAndAttachments(): void {
  const state = freshPortState(1443);
  advance(state, 0.2);
  const podModules = state.moduleInstances.filter((module) => module.type === ModuleType.PodDock);
  assert(podModules.length === 2, 'Fresh starter did not author two physical Pod Docks.');
  assert(podModules.every((module) => module.rotation === 0 && module.width === 2 && module.height === 1), 'Starter Pod Dock footprint drifted from horizontal 2x1 hull hardware.');
  assert(podModules.every((module) => getPodDockPlacementView(state, module.originTile).valid), 'Starter Pod Dock has invalid exterior placement.');
  assert(podModules.every((module) => {
    const facing = getPodDockPlacementView(state, module.originTile).facing;
    return facing !== null && module.tiles.every((tile) =>
      state.tiles[tile] === TileType.Wall && getPodDockPlacementView(state, tile).facing === facing
    );
  }), 'Starter Pod Dock footprint does not lie on one straight exterior wall face.');
  const podSources = podModules.map((module) => getDockByTile(state, module.originTile));
  assert(podSources.every((dock) =>
    dock?.sourceKind === 'pod-dock-module' && dock.moduleId !== undefined &&
    dock.sourceKey === `pod-dock:${dock.mountTile}` && dock.mountTile === dock.anchorTile &&
    dock.accessTile !== undefined && state.pressurized[dock.accessTile] &&
    dock.allowedShipSizes.length === 1 && dock.allowedShipSizes[0] === 'small'
  ), 'Pod Dock did not own a stable small-craft source, exterior mount, and pressurized physical access.');
  assert(new Set(podSources.map((dock) => dock?.sourceKey)).size === podSources.length, 'Pod Dock physical source keys are not unique and stable.');
  const freightLocker = state.moduleInstances.find((module) => module.type === ModuleType.FreightLocker);
  assert(!state.moduleInstances.some((module) => module.type === ModuleType.FuelCoupler), 'Minimal starter unexpectedly prebuilt a Fuel Coupler.');
  assert(freightLocker && freightLocker.rotation === 0 && freightLocker.width === 2 && freightLocker.height === 1, 'Starter Freight Locker footprint drifted from horizontal 2x1 hull hardware.');
  assert(freightLocker && freightLocker.tiles.every((tile) =>
    state.tiles[tile] === TileType.Wall &&
    getPodDockPlacementView(state, tile).facing === getPodDockPlacementView(state, freightLocker.originTile).facing
  ), 'Starter Freight Locker footprint does not lie on the Pod Dock hull face.');
  assert(freightLocker && getPodDockAttachmentView(state, ModuleType.FreightLocker, freightLocker.originTile).valid, 'Starter Freight Locker is not attached to a Pod Dock.');

  const medium = sizedPassengerOffer(state, 94430, 'medium');
  state.trafficOffers.push(medium);
  const mediumAdmission = admitTrafficOffer(state, medium.id);
  assert(!mediumAdmission.ok, 'Medium traffic incorrectly bound to the small exterior Pod Dock collar.');
  assert(
    !state.arrivingShips.some((ship) => ship.id === medium.id && ship.assignedDockId !== null) &&
      state.trafficOffers.find((offer) => offer.id === medium.id)?.assignedDockSourceKey == null,
    'Rejected medium traffic retained a Pod Dock binding.'
  );
}

function testDockingClampVesselMassRequirements(): void {
  const mediumState = freshPortState(14431);
  const mediumBerth = buildModernBerth(mediumState, 5, 5, 4, 3, 1);
  const mediumOffer = sizedPassengerOffer(mediumState, 94431, 'medium');
  mediumState.trafficOffers.push(mediumOffer);
  const oneClampFacility = getBerthFacilityAt(mediumState, mediumBerth.anchor);
  assert(oneClampFacility?.size === 'medium' && oneClampFacility.clampCapacity === 1, 'Medium fixture did not expose exactly one physical clamp.');
  assert(getEligibleBerthsForOffer(mediumState, mediumOffer.id).length === 0, 'A one-clamp medium Berth was accepted.');
  const oneClampAdmission = admitTrafficOffer(mediumState, mediumOffer.id, mediumBerth.anchor);
  assert(
    !oneClampAdmission.ok && oneClampAdmission.reason === 'tourist ship waiting - berth needs 2 docking clamps (1 installed)',
    `Medium rejection lost the exact two-clamp requirement (${oneClampAdmission.reason ?? 'no reason'}).`
  );
  const secondClamp = tryPlaceModule(mediumState, ModuleType.DockingClamp, mediumBerth.freeClampTiles[0]);
  assert(secondClamp.ok, `Second medium clamp placement failed: ${secondClamp.reason ?? 'unknown'}.`);
  tick(mediumState, 0);
  mediumState.pressurized[mediumBerth.access] = true;
  const twoClampFacility = getBerthFacilityAt(mediumState, mediumBerth.anchor);
  const mediumEligible = getEligibleBerthsForOffer(mediumState, mediumOffer.id);
  assert(twoClampFacility?.clampCapacity === 2, 'Second physical clamp did not increase medium vessel support.');
  assert(mediumEligible.some((candidate) => candidate.anchorTile === mediumBerth.anchor), 'Adding the second clamp did not permit the otherwise-identical medium candidate.');

  const largeState = freshPortState(14432);
  const largeBerth = buildModernBerth(largeState, 5, 5, 7, 6, 4);
  const largeOffer = sizedPassengerOffer(largeState, 94432, 'large');
  largeState.trafficOffers.push(largeOffer);
  const fourClampFacility = getBerthFacilityAt(largeState, largeBerth.anchor);
  assert(fourClampFacility?.size === 'large' && fourClampFacility.clampCapacity === 4, 'Large fixture did not expose four physical clamps.');
  assert(getEligibleBerthsForOffer(largeState, largeOffer.id).length === 0, 'A four-clamp large Berth was accepted.');
  const largeRejection = admitTrafficOffer(largeState, largeOffer.id, largeBerth.anchor);
  assert(
    !largeRejection.ok && largeRejection.reason === 'tourist ship waiting - berth needs 5 docking clamps (4 installed)',
    `Large rejection lost the exact five-clamp requirement (${largeRejection.reason ?? 'no reason'}).`
  );
  const fifthClamp = tryPlaceModule(largeState, ModuleType.DockingClamp, largeBerth.freeClampTiles[0]);
  assert(fifthClamp.ok, `Fifth large clamp placement failed: ${fifthClamp.reason ?? 'unknown'}.`);
  tick(largeState, 0);
  largeState.pressurized[largeBerth.access] = true;
  assert(getBerthFacilityAt(largeState, largeBerth.anchor)?.clampCapacity === 5, 'Fifth physical clamp did not increase large vessel support.');
  assert(
    getEligibleBerthsForOffer(largeState, largeOffer.id).some((candidate) => candidate.anchorTile === largeBerth.anchor),
    'Adding the fifth clamp did not permit the otherwise-identical large candidate.'
  );
}

function testPortHardwareCostsAndLegacyBerthAdapter(): void {
  assert(moduleCreditBuildCost(ModuleType.PodDock) === 110, 'Pod Dock capital cost drifted.');
  assert(moduleCreditBuildCost(ModuleType.FuelCoupler) === 70, 'Fuel Coupler capital cost drifted.');
  assert(moduleCreditBuildCost(ModuleType.BerthControl) === 210, 'Berth Control capital cost drifted.');
  assert(moduleCreditBuildCost(ModuleType.DockingClamp) === 100, 'Docking Clamp capital cost drifted.');
  assert(moduleCreditBuildCost(ModuleType.Gangway) === 140, 'Gangway should use its explicit berth capital cost.');

  const state = freshPortState(1444);
  assert(!state.rooms.includes(RoomType.Berth), 'Fresh layout retained a legacy berth instead of reserving expansion space.');
}

function testPodDockSaveRoundTripRetainsSourceAndAttachmentOwnership(): void {
  const state = freshPortState(1445);
  const authored = placeFuelPodDock(state);
  const mount = authored.dock.mountTile;
  assert(mount !== undefined, 'Expected authored fuel Pod Dock before save round trip.');

  const parsed = parseAndMigrateSave(serializeSave('Pod dock compatibility', state, 'test'));
  assert(parsed.ok, parsed.ok ? '' : parsed.error);
  const loaded = hydrateStateFromSave(parsed.save, { seed: 1445 }).state;
  const dock = getDockByTile(loaded, mount);
  assert(dock?.sourceKind === 'pod-dock-module', 'Pod Dock source kind changed after save/load.');
  assert(dock?.sourceKey.startsWith('pod-dock:'), 'Pod Dock lost its stable source key after save/load.');
  assert(dock?.podCapabilities?.includes('fuel'), 'Fuel Coupler ownership changed after save/load.');
}

function testSmallCraftRoutingUsesDocksNotBerths(): void {
  const state = freshPortState(1446);
  const placed = state.tiles.some((tile, index) => tile === TileType.Wall && trySetTile(state, index, TileType.Dock));
  assert(placed, 'Expected a legacy Dock tile for the small-craft route test.');
  tick(state, 0);
  const dock = state.docks.find((entry) => entry.sourceKind === 'legacy-tile-cluster');
  assert(dock, 'Expected a legacy DockEntity.');
  const offer = smallCraftOffer(state, dock, 9446);
  state.trafficOffers.push(offer);
  assert(getEligibleBerthsForOffer(state, offer.id).length === 0, 'Small craft was offered a berth.');
  const berthAnchor = state.rooms.findIndex((room) => room === RoomType.Berth);
  assert(!admitTrafficOffer(state, offer.id, berthAnchor).ok, 'Small craft accepted a berth admission.');
  const ship = admitSmallCraftAtDock(state, dock, offer.id);
  assert(ship.assignedDockId === dock.id && ship.assignedBerthAnchor === null, 'Small craft did not bind exclusively to its Dock.');
}

function testSmallCraftMissingAttachmentIsVisible(): void {
  const state = freshPortState(1447);
  const { dock, couplerTile } = placeFuelPodDock(state);
  const ship = admitSmallCraftAtDock(state, dock, 9447);
  assert(removeModuleAtTile(state, couplerTile), 'Expected Fuel Coupler removal during the test visit.');
  advance(state, 3);
  const refuel = ship.smallCraftVisit?.services.find((service) => service.kind === 'refuel');
  assert(refuel?.status === 'blocked', `Expected visible missing attachment block, got ${refuel?.status ?? 'missing'}.`);
  assert(refuel.blockedReason === 'missing Fuel Coupler', `Expected Fuel Coupler block reason, got ${refuel.blockedReason ?? 'none'}.`);
}

function testSmallCraftBlockedServiceCanRecover(): void {
  const state = freshPortState(1452);
  const { dock } = placeFuelPodDock(state);
  const tank = fuelTankNode(state);
  tank.items.fuel = 0;
  const ship = admitSmallCraftAtDock(state, dock, 9452);
  advance(state, 3);
  const refuel = ship.smallCraftVisit?.services.find((service) => service.kind === 'refuel');
  assert(refuel?.status === 'blocked', 'Empty fuel stock did not produce a live blocked service.');
  tank.items.fuel = 12;
  advance(state, 24);
  const recovered = ship.smallCraftVisit?.services.find((service) => service.kind === 'refuel');
  assert(recovered?.status === 'complete', `Restocking fuel did not recover blocked service (${recovered?.status ?? 'missing'}: ${recovered?.blockedReason ?? 'no reason'}).`);
}

function testSmallCraftPassengerAndShipServiceProgressConcurrently(): void {
  const state = freshPortState(1448);
  const { dock } = placeFuelPodDock(state);
  fuelTankNode(state).items.fuel = 12;
  const ship = admitSmallCraftAtDock(state, dock, 9448);
  advance(state, 6);
  const visit = ship.smallCraftVisit;
  const refuel = visit?.services.find((service) => service.kind === 'refuel');
  assert(state.visitors.some((visitor) => visitor.originShipId === ship.id), 'Passenger activity did not begin while docked.');
  assert(refuel?.status === 'active' && refuel.progress > 0, 'Refueling did not progress alongside passenger activity.');
}

function testSmallCraftFuelConsumesStockAndPaysReward(): void {
  const state = freshPortState(1449);
  const { dock } = placeFuelPodDock(state);
  const tank = fuelTankNode(state);
  tank.items.fuel = 12;
  const fuelBefore = tank.items.fuel;
  const localSupply = getPodDockFuelSupplyView(state, dock.id);
  assert(localSupply.connected, `Starter Fuel Tank is not connected to the Fuel Coupler (${localSupply.reason ?? 'no reason'}).`);
  assert(localSupply.tankCount > 0, 'Starter Fuel Pipe network has no connected Fuel Tank.');
  assert(localSupply.pipeTiles > 0, 'Starter Fuel Pipe network has no pipe tiles.');
  const earnedBefore = state.metrics.creditsEarnedLifetime;
  const ship = admitSmallCraftAtDock(state, dock, 9449);
  advance(state, 36);
  const refuel = ship.smallCraftVisit?.services.find((service) => service.kind === 'refuel');
  assert(refuel?.status === 'complete', `Fuel service did not complete (${refuel?.status ?? 'missing'}).`);
  assert((tank.items.fuel ?? 0) <= fuelBefore - 3.9, 'Fuel service did not consume Fuel Tank stock.');
  advance(state, 80);
  assert(state.metrics.creditsEarnedLifetime >= earnedBefore + (refuel?.creditsEarned ?? 0), 'Fuel service did not contribute its earned credits.');
  assert((refuel?.ratingDelta ?? 0) > 0, 'Fuel service did not retain a rating contribution.');
}

function testSmallCraftFuelRequiresConnectedPipe(): void {
  const state = freshPortState(1453);
  const { dock } = placeFuelPodDock(state);
  const tank = fuelTankNode(state);
  tank.items.fuel = 12;
  const pipeTiles = Array.from(state.utilityUnderlay.layers['fuel-pipe'].entries())
    .filter(([tileIndex, present]) => present > 0 && tileIndex !== tank.tileIndex)
    .map(([tileIndex]) => tileIndex);
  assert(pipeTiles.length > 0, 'Expected an authored Fuel Pipe segment between the tank and coupler.');
  const brokenPipeTile = pipeTiles[0];
  assert(clearUtilityUnderlayAt(state, brokenPipeTile, 'fuel-pipe'), 'Expected authored Fuel Pipe segment removal.');
  const disconnected = getPodDockFuelSupplyView(state, dock.id);
  assert(!disconnected.connected, 'Removing the Fuel Pipe did not disconnect the Fuel Coupler.');
  assert(disconnected.reason?.includes('Fuel Pipe') || disconnected.reason?.includes('Maintenance'), `Disconnected fuel network did not provide an actionable reason (${disconnected.reason ?? 'none'}).`);
  const ship = admitSmallCraftAtDock(state, dock, 9453);
  advance(state, 3);
  const refuel = ship.smallCraftVisit?.services.find((service) => service.kind === 'refuel');
  assert(refuel?.status === 'blocked', 'Broken Fuel Pipe did not block Pod Dock refueling.');
  assert(refuel.blockedReason?.includes('Fuel Pipe') || refuel.blockedReason?.includes('Maintenance'), `Unexpected fuel-pipe blocker: ${refuel.blockedReason ?? 'none'}.`);
  assert(setUtilityUnderlayTile(state, 'fuel-pipe', brokenPipeTile, true), 'Expected Fuel Pipe segment restoration.');
  const restored = getPodDockFuelSupplyView(state, dock.id);
  assert(restored.connected, `Restored Fuel Pipe did not reconnect the Fuel Coupler (${restored.reason ?? 'no reason'}).`);
  advance(state, 24);
  const recovered = ship.smallCraftVisit?.services.find((service) => service.kind === 'refuel');
  assert(recovered?.status === 'complete', `Restored Fuel Pipe did not recover refueling (${recovered?.status ?? 'missing'}).`);
}

function testSmallCraftEventuallyDepartsWhenOptionalServiceBlocks(): void {
  const state = freshPortState(1450);
  const { dock } = placeFuelPodDock(state);
  fuelTankNode(state).items.fuel = 0;
  const ship = admitSmallCraftAtDock(state, dock, 9450);
  // Observable Pod timing starts its bounded patience at docking and grants at
  // least 120 seconds. Include approach/departure grace in this terminal check.
  advance(state, 145);
  const refuel = ship.smallCraftVisit?.services.find((service) => service.kind === 'refuel');
  assert(refuel?.status === 'blocked', 'Missing fuel did not leave an inspectable blocked service result.');
  assert(refuel.blockedReason === 'no fuel in Fuel Tank', `Unexpected fuel block reason: ${refuel.blockedReason ?? 'none'}.`);
  assert(!state.arrivingShips.some((entry) => entry.id === ship.id), 'Blocked optional service pinned the small craft indefinitely.');
}

function testSmallCraftVisitSaveRoundTrip(): void {
  const state = freshPortState(1451);
  const { dock } = placeFuelPodDock(state);
  fuelTankNode(state).items.fuel = 12;
  const ship = admitSmallCraftAtDock(state, dock, 9451);
  advance(state, 5);
  const saved = serializeSave('Small craft visit', state, 'test');
  const parsed = parseAndMigrateSave(saved);
  assert(parsed.ok, parsed.ok ? '' : parsed.error);
  const loaded = hydrateStateFromSave(parsed.save, { seed: 1451 }).state;
  const restored = loaded.arrivingShips.find((entry) => entry.id === ship.id);
  assert(restored?.smallCraftVisit?.services.length === 2, 'Small-craft service state was not restored from save.');
  assert(
    restored.smallCraftVisit.services.some((service) => service.kind === 'refuel' && service.progress > 0),
    'Small-craft refuel progress reset on load.'
  );
  assert(
    restored.smallCraftVisit.servedDemand.food === 0 && restored.smallCraftVisit.earnedCredits === 0,
    'Legacy visit accounting did not initialize to zero during save/load.'
  );
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
  const servingNodes = state.itemNodes.filter((node) => state.modules[node.tileIndex] === ModuleType.ServingStation);
  assert(servingNodes.length > 0, 'Starter station has no serving counter for the prepared-meal test.');
  for (const node of servingNodes) {
    node.items.meal = 0;
    node.items.cleanTray = 0;
  }
  state.metrics.mealStock = 0;
  state.metrics.cleanTrayStock = 0;
  const mealsBefore = state.metrics.mealStock;
  const traysBefore = state.metrics.cleanTrayStock;
  const creditsBefore = state.metrics.credits;
  const trafficBefore = state.trafficOffers.length;
  const order = buyPreparedMealsDetailed(state);
  assert(order.ok, `Expected prepared-meal import to fit the starter counter (${order.message}).`);
  // Stock metrics are derived from physical counter nodes during the metrics
  // pass; the purchase operation deliberately does not double-book them.
  tick(state, 0);
  assert(state.metrics.mealStock === mealsBefore + order.added, 'Prepared-meal import did not reach the service buffer.');
  assert(state.metrics.cleanTrayStock === traysBefore + order.added, 'Prepared-meal import did not include clean serving trays.');
  assert(state.metrics.credits === creditsBefore - order.creditCost, 'Prepared-meal import charged the wrong amount.');
  assert(state.trafficOffers.length === trafficBefore, 'Prepared-meal purchase incorrectly spawned a freight contract.');
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
  tick(state, 0);
  const cargoDock = state.docks.find((dock) => dock.podCapabilities?.includes('freight'));
  assert(cargoDock, 'Expected the starter Freight Locker to author a cargo Pod Dock.');
  for (const dock of state.docks) {
    if (dock.id !== cargoDock.id) setDockPurpose(state, dock.id, 'residential');
  }
  state.controls.materialAutoImportEnabled = false;
  for (const node of state.itemNodes) {
    if (state.modules[node.tileIndex] === ModuleType.IntakePallet || state.modules[node.tileIndex] === ModuleType.StorageRack) {
      node.items = {};
    }
  }
  const creditsBefore = state.metrics.credits;
  const goodsBefore = state.itemNodes.reduce((sum, node) => sum + (node.items.tradeGood ?? 0), 0);
  const order = buyImportedTradeGoodsDetailed(state);
  assert(order.ok, `Expected imported Market goods order to fit Receiving (${order.message}).`);
  const delivery = state.openingEconomy.podFreightOperations.find((operation) =>
    operation.kind === 'supplier-delivery' && operation.stockKind === 'travel-supplies'
  );
  assert(delivery?.kind === 'supplier-delivery' && delivery.status === 'ordered', 'Imported goods appeared without a physical supplier delivery.');
  assert(state.itemNodes.reduce((sum, node) => sum + (node.items.tradeGood ?? 0), 0) === goodsBefore, 'Ordering supplies added inventory before the pod unloaded.');
  assert(state.metrics.credits === creditsBefore - order.creditCost, 'Imported Market goods charged the wrong amount.');
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
  tick(state, 0);
  const dock = state.docks.find((entry) => entry.sourceKind === 'pod-dock-module' && entry.purpose === 'visitor');
  assert(dock, 'Standing-order fixture requires a visitor Pod Dock.');
  const holding = smallCraftOffer(state, dock, 145001);
  holding.status = 'holding';
  state.trafficOffers.push(holding);
  assert((getTrafficOfferPreview(state, holding.id)?.compatibleInterface.freeCount ?? 0) > 0, 'Standing-order fixture did not expose a compatible physical interface.');
  state.dockedShipsCompleted = 3;
  assert(setPortAutoAdmit(state, true), 'Expected earned dispatch automation to enable.');
  advance(state, 1);
  assert(
    state.arrivingShips.some((ship) => ship.id === holding.id && ship.smallCraftVisit !== undefined),
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
  assert(state.crewMembers.length === 6, `Baseline hull services lost crew during a quiet shift (${state.crewMembers.length}/6 remain).`);
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
  ['starter shell and dock-only traffic', testStarterShellAndDockOnlyTraffic],
  ['dock remains small walk-in surface', testDockRemainsSmallWalkInSurface],
  ['pod dock module ownership and attachments', testPodDockModulesOwnSmallCraftAccessAndAttachments],
  ['docking clamp vessel mass requirements', testDockingClampVesselMassRequirements],
  ['port hardware costs and legacy berth adapter', testPortHardwareCostsAndLegacyBerthAdapter],
  ['pod dock save round trip', testPodDockSaveRoundTripRetainsSourceAndAttachmentOwnership],
  ['small-craft dock-only routing', testSmallCraftRoutingUsesDocksNotBerths],
  ['small-craft missing attachment', testSmallCraftMissingAttachmentIsVisible],
  ['small-craft blocked service recovery', testSmallCraftBlockedServiceCanRecover],
  ['small-craft concurrent passenger and service progress', testSmallCraftPassengerAndShipServiceProgressConcurrently],
  ['small-craft fuel stock and reward', testSmallCraftFuelConsumesStockAndPaysReward],
  ['small-craft fuel requires connected pipe', testSmallCraftFuelRequiresConnectedPipe],
  ['small-craft eventual departure', testSmallCraftEventuallyDepartsWhenOptionalServiceBlocks],
  ['small-craft save round trip', testSmallCraftVisitSaveRoundTrip],
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
