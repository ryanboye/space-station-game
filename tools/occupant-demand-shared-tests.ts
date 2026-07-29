import {
  RESIDENT_DEMAND_PROFILE,
  VISITOR_DEMAND_PROFILE,
  decayOccupantDemand,
  selectCriticalOccupantDemand,
  selectOccupantDemand,
  shouldPreemptOccupantDemand,
  type OccupantDemandValues,
  type RecurringNeedKind
} from '../src/sim/occupant-demand';
import {
  createInitialState,
  reservationsForOwner,
  tick,
  tryCreateReservation
} from '../src/sim/sim';
import { applyColdStartScenario } from '../src/sim/cold-start-scenarios';
import { ModuleType, ResidentState, VisitorState, type Resident, type StationState, type Visitor } from '../src/sim/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function needs(values: Partial<OccupantDemandValues> = {}): OccupantDemandValues {
  return { hunger: 100, energy: 100, hygiene: 100, leisure: 100, ...values };
}

function testSharedDecayPreservesProfiles(): void {
  const visitor = needs();
  const resident = needs();
  decayOccupantDemand(visitor, 10, VISITOR_DEMAND_PROFILE);
  decayOccupantDemand(resident, 10, RESIDENT_DEMAND_PROFILE);
  assert(visitor.hunger === 97 && visitor.energy === 97.8 && visitor.hygiene === 98.4 && visitor.leisure === 98,
    `visitor rates changed: ${JSON.stringify(visitor)}`);
  assert(resident.hunger === 93.5 && resident.energy === 95 && resident.hygiene === 96 && resident.leisure === 100,
    `resident baseline rates changed: ${JSON.stringify(resident)}`);
  const stressedResident = needs();
  decayOccupantDemand(stressedResident, 10, RESIDENT_DEMAND_PROFILE, { hunger: 1.5, energy: 1.7, hygiene: 1.27, leisure: 0 });
  assert(stressedResident.hunger === 90.25 && stressedResident.energy === 91.5 && stressedResident.hygiene === 94.92,
    'caller-owned resident modifiers did not flow through the shared kernel');
}

function testStableCriticalSelectionAndSingleClaim(): void {
  const values = needs({ hunger: 17.9, hygiene: 18.0, leisure: 42 });
  let active: RecurringNeedKind | null = null;
  let reservations = 0;
  for (let retry = 0; retry < 5; retry++) {
    const selected = selectOccupantDemand(values, VISITOR_DEMAND_PROFILE, active);
    assert(selected === 'hunger', `retry ${retry}: nearly tied need changed target to ${selected}`);
    if (active !== selected) reservations += 1;
    active = selected;
  }
  assert(reservations === 1, `sticky demand created ${reservations} reservations instead of one`);
  assert(selectCriticalOccupantDemand(values, VISITOR_DEMAND_PROFILE) === 'hunger', 'critical selection lost the lowest need');
}

function testCriticalPreemptionPolicy(): void {
  const severeHunger = 'hunger' as const;
  assert(
    shouldPreemptOccupantDemand({ criticalNeed: severeHunger, activeNeed: 'leisure', activity: 'optional' }),
    'severe hunger must preempt visitor/resident optional leisure'
  );
  assert(
    !shouldPreemptOccupantDemand({ criticalNeed: severeHunger, activeNeed: 'hunger', activity: 'optional' }),
    'a need already being served must not churn its reservation'
  );
  assert(
    !shouldPreemptOccupantDemand({ criticalNeed: severeHunger, activeNeed: 'leisure', activity: 'committed' }),
    'a planned visitor service must never be preempted'
  );
  assert(
    !shouldPreemptOccupantDemand({ criticalNeed: severeHunger, activeNeed: 'energy', activity: 'critical' }),
    'one critical recovery must not interrupt another critical recovery'
  );
}

function longStayWing(): StationState {
  const state = createInitialState({ seed: 88_100, physicalStarterInventory: true, manualTrafficAdmission: true });
  assert(applyColdStartScenario(state, 'long-stay-guest-wing'), 'long-stay guest-wing fixture must load');
  state.controls.paused = false;
  return state;
}

function fixtureTile(state: StationState, type: ModuleType): number {
  const fixture = state.moduleInstances.find((entry) => entry.type === type);
  assert(fixture, `fixture ${type} is required by the long-stay production setup`);
  return fixture.originTile;
}

function stageVisitor(state: StationState, tile: number): Visitor {
  const visitor = state.visitors[0];
  assert(visitor, 'long-stay fixture must provide a real visitor');
  state.visitors = [visitor];
  visitor.tileIndex = tile;
  visitor.x = (tile % state.width) + 0.5;
  visitor.y = Math.floor(tile / state.width) + 0.5;
  visitor.path = [];
  visitor.patience = 0;
  visitor.needs = needs({ hunger: 10, energy: 76, hygiene: 76, leisure: 76, }) as Visitor['needs'];
  visitor.needs!.active = null;
  visitor.needs!.unmetSince = null;
  visitor.recurringNeedActive = null;
  return visitor;
}

function reserveVisitorProvider(state: StationState, visitor: Visitor, tile: number, targetId: string): number {
  const result = tryCreateReservation(state, {
    ownerKind: 'visitor', ownerId: visitor.id, kind: 'provider-slot', targetTile: tile,
    targetId, amount: 1, capacity: 1, ttlSec: 75
  });
  assert(result.ok, `production visitor provider claim failed: ${result.ok ? '' : result.reason}`);
  visitor.reservedTargetTile = tile;
  return result.reservation.id;
}

function residentAt(state: StationState, tile: number): Resident {
  const resident: Resident = {
    id: 88101,
    x: (tile % state.width) + 0.5,
    y: Math.floor(tile / state.width) + 0.5,
    tileIndex: tile,
    path: [], speed: 1.8,
    hunger: 78, energy: 10, hygiene: 76, social: 76, safety: 70, stress: 8,
    routinePhase: 'errands', role: 'none', roleAffinity: {}, state: ResidentState.Leisure,
    carryingMeal: false, reservedServingTile: null, serveTimer: undefined, actionTimer: 90,
    retargetAt: 0, reservedTargetTile: null, homeShipId: null, homeDockId: null,
    housingUnitId: null, bedModuleId: null, satisfaction: 72, leaveIntent: 0,
    blockedTicks: 0, airExposureSec: 0, healthState: 'healthy', agitation: 0,
    activeIncidentId: null, confrontationUntil: 0
  };
  state.residents = [resident];
  return resident;
}

function testVisitorProductionPreemption(): void {
  const state = longStayWing();
  const couch = fixtureTile(state, ModuleType.Couch);
  const visitor = stageVisitor(state, couch);
  visitor.state = VisitorState.ToLeisure;
  visitor.activeService = 'leisure'; // an optional, non-manifest stop
  const oldReservationId = reserveVisitorProvider(state, visitor, couch, `leisure:${couch}`);

  tick(state, 0.01);
  assert((visitor.state as VisitorState) === VisitorState.ToCafeteria, `severe hunger did not leave optional leisure (${visitor.state})`);
  assert(visitor.needs?.active === 'hunger' && visitor.recurringNeedActive === 'hunger', 'visitor did not retain hunger as its sticky active need');
  const oldReservation = state.reservations.find((entry) => entry.id === oldReservationId);
  assert(oldReservation?.releaseReason === 'replaced', `old leisure claim was not released once (${oldReservation?.releaseReason})`);
  const mealClaims = reservationsForOwner(state, 'visitor', visitor.id)
    .filter((entry) => entry.targetId?.startsWith('meal-pickup:'));
  assert(mealClaims.length === 1 && visitor.reservedServingTile === mealClaims[0].targetTile,
    `visitor did not acquire one real cafeteria claim (${mealClaims.length})`);

  for (let retry = 0; retry < 5; retry++) tick(state, 0.01);
  const stableClaims = reservationsForOwner(state, 'visitor', visitor.id)
    .filter((entry) => entry.targetId?.startsWith('meal-pickup:'));
  assert(visitor.needs?.active === 'hunger' && stableClaims.length === 1,
    `retry ${stableClaims.length}: hunger preemption oscillated or multiplied cafeteria claims`);
}

function testResidentProductionPreemption(): void {
  const state = longStayWing();
  const couch = fixtureTile(state, ModuleType.Couch);
  const bunk = fixtureTile(state, ModuleType.Bunk);
  state.roomHousingPolicies[bunk] = 'resident';
  const resident = residentAt(state, couch);
  const old = tryCreateReservation(state, {
    ownerKind: 'resident', ownerId: resident.id, kind: 'provider-slot', targetTile: couch,
    targetId: `leisure:${couch}`, amount: 1, capacity: 1, ttlSec: 75
  });
  assert(old.ok, 'resident must obtain a real optional leisure claim');
  resident.reservedTargetTile = couch;

  tick(state, 0.01);
  assert((resident.state as ResidentState) === ResidentState.ToDorm, `severe energy did not interrupt resident leisure (${resident.state})`);
  assert(old.reservation.releaseReason === 'replaced', `resident leisure claim was not released exactly once (${old.reservation.releaseReason})`);
  const bedClaims = reservationsForOwner(state, 'resident', resident.id);
  assert(bedClaims.length === 1 && bedClaims[0].targetId?.startsWith('bed:'),
    `resident did not acquire one reachable bed claim (${bedClaims.map((claim) => claim.targetId).join(', ')})`);
}

function testPlannedVisitorServiceIsNotPreempted(): void {
  const state = longStayWing();
  const gameStation = fixtureTile(state, ModuleType.GameStation);
  const visitor = stageVisitor(state, gameStation);
  visitor.state = VisitorState.ToLeisure;
  visitor.activeService = 'comfort';
  visitor.servicePlan = ['comfort'];
  const claimId = reserveVisitorProvider(state, visitor, gameStation, `comfort:${gameStation}`);

  tick(state, 0.01);
  const claim = state.reservations.find((entry) => entry.id === claimId);
  assert(visitor.activeService === 'comfort', `planned comfort service was preempted for ${visitor.activeService}`);
  assert(claim?.releaseReason === null, `planned comfort claim was released (${claim?.releaseReason})`);
}

testSharedDecayPreservesProfiles();
testStableCriticalSelectionAndSingleClaim();
testCriticalPreemptionPolicy();
testVisitorProductionPreemption();
testResidentProductionPreemption();
testPlannedVisitorServiceIsNotPreempted();

console.log('PASS shared occupant demand: profile decay, stable claims, visitor/resident production preemption, planned-service guard');
