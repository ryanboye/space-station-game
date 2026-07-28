import { buildDockingSlotDescriptor } from '../src/sim/approach-envelopes';
import {
  SHIP_HULL_PROFILES,
  hullVariantsFor,
  selectShipHullVariant,
  shipHullProfile
} from '../src/sim/ship-hulls';
import { hydrateStateFromSave, parseAndMigrateSave, serializeSave } from '../src/sim/save';
import { admitTrafficOffer, createInitialState, tick, validateDockingSlot } from '../src/sim/sim';
import { TileType, toIndex, type StationState, type TrafficOffer } from '../src/sim/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function offer(id: number, state: StationState): TrafficOffer {
  const dock = state.docks.find((entry) => entry.purpose === 'visitor' && entry.allowedShipSizes.includes('small'));
  assert(dock, 'Fixture requires a visitor Pod Dock.');
  return {
    id,
    callsign: `FLEET-${id}`,
    shipName: 'Courier Witness',
    lane: dock.lane,
    shipType: 'trader',
    hullVariant: 'courier-pod',
    offerKind: 'mixed',
    size: 'small',
    status: 'holding',
    forecastAt: state.now,
    arrivesAt: state.now,
    expiresAt: state.now + 120,
    passengersTotal: 1,
    manifestDemand: { cafeteria: 0, market: 1, lounge: 0 },
    manifestMix: { diner: 0, shopper: 1, lounger: 0, rusher: 0 },
    hospitalityDemand: { meal: 0, drink: 0, leisure: 0, restroom: 0, hygiene: 0, comfort: 0 },
    inboundCargo: { rawMaterial: 0, rawMeal: 0, tradeGood: 0 },
    outboundRequest: { rawMaterial: 0, meal: 0, tradeGood: 0 },
    requestedServices: [],
    berthTimeSec: 60,
    dockingFee: 5,
    projectedSpend: 5,
    riskLabel: 'low',
    assignedBerthAnchor: null,
    assignedDockSourceKey: null
  };
}

function testDeterministicPurposeMapping(): void {
  assert(selectShipHullVariant(101, 'trader', 'small') === 'courier-pod', 'Small traders should select the courier pod.');
  assert(selectShipHullVariant(101, 'industrial', 'small') === 'crew-launch', 'Small industrial ships should select the crew launch.');
  assert(selectShipHullVariant(101, 'tourist', 'medium') === 'passenger-shuttle', 'Medium tourists should select the passenger shuttle.');
  assert(selectShipHullVariant(101, 'industrial', 'medium') === 'repair-tender', 'Medium industrial ships should select the repair tender.');
  assert(selectShipHullVariant(101, 'trader', 'large') === 'long-freighter', 'Large traders should select the long freighter.');
  assert(selectShipHullVariant(101, 'tourist', 'large') === 'luxury-liner', 'Large tourists should select the luxury liner.');
  assert(selectShipHullVariant(101, 'colonist', 'large') === 'colonist-transport', 'Large colonist ships should select the colonist transport.');
  assert(selectShipHullVariant(101, 'military', 'large') === 'corvette', 'Large military ships should select the corvette.');
  const representativeCalls: Array<[number | string, Parameters<typeof selectShipHullVariant>[1], Parameters<typeof selectShipHullVariant>[2], string]> = [
    [901, 'trader', 'small', 'courier-pod'],
    ['repair-call-22', 'industrial', 'medium', 'repair-tender'],
    [903, 'tourist', 'large', 'luxury-liner'],
    ['convoy-7', 'military', 'large', 'corvette']
  ];
  for (const [identity, type, size, expected] of representativeCalls) {
    assert(
      selectShipHullVariant(identity, type, size) === expected,
      `${String(identity)} did not retain the expected ${expected} hull mapping.`
    );
  }
  assert(
    hullVariantsFor('trader', 'large').includes('long-freighter') && hullVariantsFor('industrial', 'large').includes('long-freighter'),
    'The same long-freighter silhouette must support different economic purposes.'
  );
}

function testProfileScale(): void {
  const shuttle = shipHullProfile('passenger-shuttle');
  const freighter = shipHullProfile('long-freighter');
  const liner = shipHullProfile('luxury-liner');
  const tender = shipHullProfile('repair-tender');
  const colonist = shipHullProfile('colonist-transport');
  assert(freighter.approachDepth > shuttle.approachDepth && liner.approachDepth > shuttle.approachDepth, 'Long hulls must need deeper approach clearance than a shuttle.');
  assert(tender.lateralClearance > shuttle.lateralClearance && colonist.lateralClearance > shuttle.lateralClearance, 'Broad service and colonist hulls must need wider approach clearance.');
  assert(SHIP_HULL_PROFILES['long-freighter'].nativeAspect < 0.5, 'Long freighter bitmap should remain visibly elongated.');
}

function testActualHullObstruction(): void {
  const state = createInitialState({ seed: 70301 });
  const x = 14;
  const y = 18;
  for (let yy = y - 6; yy <= y + 6; yy++) {
    for (let xx = x; xx <= x + 15; xx++) state.tiles[toIndex(xx, yy, state.width)] = TileType.Space;
  }
  const hullTile = toIndex(x, y, state.width);
  state.tiles[hullTile] = TileType.Dock;
  state.tiles[toIndex(x + 9, y, state.width)] = TileType.Wall;
  const slot = buildDockingSlotDescriptor({
    id: 'fleet-obstruction', kind: 'legacy-dock', sourceKey: 'fleet-obstruction', anchorTile: hullTile,
    facing: 'east', acceptedSizes: ['small', 'large'], hullTiles: [hullTile], accessTiles: [hullTile],
    anchorWorldX: x + 0.5, anchorWorldY: y + 0.5,
    hullBounds: { minX: x, minY: y, maxX: x + 1, maxY: y + 1 }
  });
  assert(validateDockingSlot(state, slot, 'small', 'courier-pod').valid, 'A compact courier should clear a distant approach obstruction.');
  assert(!validateDockingSlot(state, slot, 'large', 'long-freighter').valid, 'A long freighter must reject the same obstructed approach.');
}

function testOfferToShipAndSaveIdentity(): void {
  const state = createInitialState({ seed: 70302, physicalStarterInventory: true, manualTrafficAdmission: true });
  tick(state, 0);
  const traffic = offer(70302, state);
  state.trafficOffers.push(traffic);
  assert(admitTrafficOffer(state, traffic.id).ok, 'A compatible fleet offer should be admitted.');
  const ship = state.arrivingShips.find((entry) => entry.id === traffic.id);
  assert(ship?.hullVariant === traffic.hullVariant, 'Accepted ship must carry the offer hull unchanged.');
  state.trafficOffers.push({
    ...offer(70303, state),
    id: 70303,
    callsign: 'FLEET-70303',
    shipName: 'Long Identity Witness',
    shipType: 'trader',
    hullVariant: 'long-freighter',
    size: 'large',
    assignedDockSourceKey: null
  });
  const parsed = parseAndMigrateSave(serializeSave('fleet-test', state, 'test'));
  assert(parsed.ok, parsed.ok ? '' : parsed.error);
  const restored = hydrateStateFromSave(parsed.save, { seed: 70302 }).state;
  const restoredShip = restored.arrivingShips.find((entry) => entry.id === traffic.id);
  assert(restoredShip?.hullVariant === 'courier-pod', 'Save/load must preserve the exact physical hull.');
  const restoredLongOffer = restored.trafficOffers.find((entry) => entry.id === 70303);
  assert(restoredLongOffer?.hullVariant === 'long-freighter', 'Save/load collapsed a non-default long hull into its economic purpose.');
}

function main(): void {
  testDeterministicPurposeMapping();
  testProfileScale();
  testActualHullObstruction();
  testOfferToShipAndSaveIdentity();
  console.log('ship-fleet-tests: ok');
}

main();
