/**
 * Focused production-API proof for the stock starter's exact first Medium
 * Berth. The authored shell stays sealed, the advertised 100c reserve is real,
 * and the first passenger call can physically dock and disembark.
 */

import {
  admitTrafficOffer,
  commitBerthFootprint,
  createInitialState,
  getBerthFacilityAt,
  getBerthInspectorAt,
  getEligibleBerthsForOffer,
  tick,
  tryPlaceModuleWithCredits,
  trySetTileWithCredits
} from '../src/sim/index';
import { validateLiveStructuralInterfaces } from '../src/sim/structural-support';
import {
  ModuleType,
  TileType,
  fromIndex,
  toIndex,
  type StationState
} from '../src/sim/types';

const STARTING_SAVINGS = 1_254;
const STEP_SECONDS = 0.25;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`first-berth-authorship: ${message}`);
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(
      `first-berth-authorship: ${message}: expected ${String(expected)}, got ${String(actual)}`
    );
  }
}

function tile(state: StationState, x: number, y: number): number {
  return toIndex(x, y, state.width);
}

function advanceUntil(
  state: StationState,
  condition: () => boolean,
  maxSeconds: number,
  failure: string
): void {
  state.controls.paused = false;
  for (let elapsed = 0; elapsed < maxSeconds; elapsed += STEP_SECONDS) {
    tick(state, STEP_SECONDS);
    if (condition()) return;
  }
  throw new Error(`first-berth-authorship: ${failure} after ${maxSeconds}s`);
}

const state = createInitialState({
  seed: 1337,
  physicalStarterInventory: true,
  manualTrafficAdmission: true
});
state.controls.paused = true;
state.metrics.credits = STARTING_SAVINGS;
tick(state, 0);

const core = fromIndex(state.core.centerTile, state.width);
assertEqual(core.x, Math.floor(state.width / 2), 'starter core x-coordinate');
assertEqual(core.y, Math.floor(state.height / 2), 'starter core y-coordinate');

// Seal the north and south boundaries before opening the east hull. Each
// conversion is the ordinary 1c Floor -> Wall credit-aware build action.
const sealingWalls = [
  tile(state, core.x + 9, core.y - 1),
  tile(state, core.x + 8, core.y + 4),
  tile(state, core.x + 9, core.y + 4),
  tile(state, core.x + 10, core.y + 4)
];
for (const index of sealingWalls) {
  assertEqual(state.tiles[index], TileType.Floor, `sealing origin ${index} is not starter Floor`);
  const result = trySetTileWithCredits(state, index, TileType.Wall);
  assert(result.ok, `sealing wall ${index} failed: ${result.ok ? '' : result.reason}`);
  assertEqual(result.cost, 1, `sealing wall ${index} cost`);
}
assertEqual(state.metrics.credits, STARTING_SAVINGS - 4, 'cash after mandatory sealing');
assert(sealingWalls.every((index) => state.tiles[index] === TileType.Wall), 'sealing walls were not all completed');

const exteriorWalls = [0, 1, 2, 3].map((dy) => tile(state, core.x + 11, core.y + dy));
for (const index of exteriorWalls) {
  assertEqual(state.tiles[index], TileType.Wall, `east hull origin ${index} is not starter Wall`);
  const result = trySetTileWithCredits(state, index, TileType.Space);
  assert(result.ok, `east hull erasure ${index} failed: ${result.ok ? '' : result.reason}`);
  assertEqual(result.cost, 0, `east hull erasure ${index} cost`);
}

const berthTiles: number[] = [];
for (let y = core.y; y <= core.y + 3; y += 1) {
  for (let x = core.x + 8; x <= core.x + 10; x += 1) {
    const index = tile(state, x, y);
    assertEqual(state.tiles[index], TileType.Floor, `Berth footprint ${x},${y} is not starter Floor`);
    berthTiles.push(index);
  }
}
assertEqual(berthTiles.length, 12, '3x4 Berth footprint area');
const berthCommit = commitBerthFootprint(state, berthTiles);
assert(berthCommit.ok, `Berth commission failed: ${berthCommit.ok ? '' : berthCommit.reason}`);
assertEqual(berthCommit.cost, 600, 'Medium Berth floor cost');

const berthAnchor = tile(state, core.x + 8, core.y);
assertEqual(berthCommit.anchorTile, berthAnchor, 'Medium Berth anchor');

const hardware = [
  { type: ModuleType.BerthControl, origin: tile(state, core.x + 9, core.y + 1), cost: 210 },
  { type: ModuleType.Gangway, origin: tile(state, core.x + 10, core.y), cost: 140 },
  { type: ModuleType.DockingClamp, origin: tile(state, core.x + 8, core.y), cost: 100 },
  { type: ModuleType.DockingClamp, origin: tile(state, core.x + 8, core.y + 3), cost: 100 }
] as const;
for (const fixture of hardware) {
  const result = tryPlaceModuleWithCredits(state, fixture.type, fixture.origin, 0);
  assert(result.ok, `${fixture.type} at ${fixture.origin} failed: ${result.ok ? '' : result.reason}`);
  assertEqual(result.cost, fixture.cost, `${fixture.type} cost`);
}

tick(state, 0);
assertEqual(state.metrics.credits, 100, 'true working-capital reserve after the complete build');
assertEqual(state.metrics.pressurizationPct, 100, 'sealed route pressurization');
assertEqual(state.metrics.leakingTiles, 0, 'sealed route leak count');

const facility = getBerthFacilityAt(state, berthAnchor);
assert(facility, 'authored footprint did not derive a Berth facility');
assertEqual(facility.size, 'medium', 'derived Berth size');
assert(facility.geometryValid, `Berth geometry is invalid: ${facility.reasons.join(' | ')}`);
assert(facility.spaceExposed, 'Berth is not exposed to east-side Space');
assert(facility.accessReady, 'Berth lost pressurized station-side access');
assert(facility.controlModuleId !== null, 'Berth Control was not attached to the facility');
assertEqual(facility.clampCapacity, 2, 'Medium clamp capacity');
assert(facility.capabilities.includes('gangway'), 'Berth did not derive Gangway capability');

const inspector = getBerthInspectorAt(state, berthAnchor);
assert(inspector, 'Berth inspector did not resolve the authored facility');
assertEqual(inspector.derivedFacing, 'east', 'derived Berth facing');
const structural = validateLiveStructuralInterfaces(state);
assert(structural.ok, `starter-root structural support failed: ${structural.problems.map((problem) => problem.reason).join(' | ')}`);

advanceUntil(
  state,
  () => state.trafficOffers.some(
    (offer) => offer.offerKind === 'passenger' && offer.shipType === 'tourist' && offer.size === 'medium'
  ),
  10,
  'onboarding passenger offer did not appear'
);
const passengerOffer = state.trafficOffers.find(
  (offer) => offer.offerKind === 'passenger' && offer.shipType === 'tourist' && offer.size === 'medium'
);
assert(passengerOffer, 'onboarding passenger offer disappeared');
const eligible = getEligibleBerthsForOffer(state, passengerOffer.id);
assert(eligible.some((candidate) => candidate.anchorTile === berthAnchor), 'authored Berth is not eligible for the onboarding passenger offer');

const admission = admitTrafficOffer(state, passengerOffer.id, berthAnchor);
assert(admission.ok, `onboarding passenger admission failed: ${admission.reason ?? 'unknown reason'}`);
assertEqual(admission.berthAnchor, berthAnchor, 'admitted Berth anchor');
tick(state, STEP_SECONDS);
assert(state.commitment.committedBerthSeconds > 0, 'accepted call did not create positive committed Berth pressure');
assert(
  state.portOps.contracts.some((contract) => contract.offerId === passengerOffer.id),
  'accepted call did not create a durable port contract'
);

advanceUntil(
  state,
  () => state.arrivingShips.some(
    (ship) => ship.portManifest?.id === passengerOffer.id && ship.stage === 'docked'
  ),
  60,
  'accepted Medium passenger ship did not dock'
);
const passengerShip = state.arrivingShips.find((ship) => ship.portManifest?.id === passengerOffer.id);
assert(passengerShip, 'docked passenger ship disappeared');
assertEqual(passengerShip.size, 'medium', 'docked passenger ship size');
assertEqual(passengerShip.assignedBerthAnchor, berthAnchor, 'docked passenger ship Berth');

for (let elapsed = 0; elapsed < 90 && passengerShip.passengersSpawned < 10; elapsed += STEP_SECONDS) {
  tick(state, STEP_SECONDS);
}
assert(
  passengerShip.passengersSpawned === 10,
  `ten passengers did not complete station-side spawning: ship ${passengerShip.stage}/${passengerShip.visitPhase ?? '-'} ` +
    `spawned ${passengerShip.passengersSpawned}/${passengerShip.passengersTotal}, ` +
    `visitors ${state.visitors.filter((visitor) => visitor.originShipId === passengerShip.id).map((visitor) =>
      `${visitor.id}:${visitor.transferPhase ?? 'station'}@${visitor.tileIndex}->${visitor.transferStationTile ?? '-'} ` +
      `q${visitor.transferQueueTile ?? '-'} path${visitor.path.join(',')} wait=${visitor.movementWaitReason ?? '-'}`
    ).join(' | ')}`
);
assertEqual(passengerShip.passengersTotal, 10, 'onboarding passenger manifest size');
assertEqual(passengerShip.passengersSpawned, 10, 'spawned passenger count');
assertEqual(
  state.visitors.filter((visitor) => visitor.originShipId === passengerShip.id).length,
  10,
  'physical visitors attributable to the accepted ship'
);
assertEqual(state.metrics.pressurizationPct, 100, 'operating station pressurization');
assertEqual(state.metrics.leakingTiles, 0, 'operating station leak count');
assert(state.commitment.committedBerthSeconds > 0, 'docked call lost committed Berth pressure');
assert(state.commitment.committedMeals > 0, 'docked call lost committed meal pressure');
assert(state.commitment.committedStaffMinutes > 0, 'docked call lost committed staff pressure');

console.log('FIRST BERTH AUTHORSHIP: PASS');
console.log('  shell      +4c sealing before east-wall erasure; pressure 100%, leaks 0');
console.log('  berth      x=coreX+8..10, y=coreY+0..3; Medium/east; structural support valid');
console.log('  hardware   Control (coreX+9,coreY+1), Gangway (coreX+10,coreY), clamps west corners');
console.log('  economy    1,254c - 4c sealing - 600c floor - 550c hardware = 100c reserve');
console.log('  operation  onboarding passenger call admitted, docked, 10 visitors spawned');
