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
import {
  ModuleType,
  ResidentState,
  VisitorState,
  type CrewMember,
  type Resident,
  type StationState,
  type Visitor
} from '../src/sim/types';

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

function stageCrew(state: StationState, tile: number, energy = 0): CrewMember {
  const crew = state.crewMembers[0];
  assert(crew, 'starter production state must provide a real crew member');
  state.crewMembers = [crew];
  crew.tileIndex = tile;
  crew.x = (tile % state.width) + 0.5;
  crew.y = Math.floor(tile / state.width) + 0.5;
  crew.path = [];
  crew.targetTile = tile;
  crew.activeJobId = null;
  crew.resting = false;
  crew.cleaning = false;
  crew.toileting = false;
  crew.drinking = false;
  crew.leisure = false;
  crew.carryingMeal = false;
  crew.eatSessionActive = false;
  crew.energy = energy;
  crew.idleReason = 'idle_waiting_fixture';
  crew.retargetAt = state.now + 30;
  return crew;
}

function crewProductionState(): StationState {
  const state = createInitialState({ seed: 88_200, physicalStarterInventory: true, manualTrafficAdmission: true });
  // This focused scenario hires real staff while retaining the starter's
  // actual ServingStation, Table, and crew Dorm.
  assert(applyColdStartScenario(state, 'reception-staffed'), 'crew production fixture must load');
  state.controls.paused = false;
  return state;
}

function testCrewStalledSelfCareYieldsToCriticalSleep(): void {
  const state = crewProductionState();
  const serving = fixtureTile(state, ModuleType.ServingStation);
  // At 18.02, a normal 0.2s on-duty drain would otherwise land below the
  // hard 18 floor before the next liveness decision gets a chance to run.
  const crew = stageCrew(state, serving, 18.02);
  crew.eating = true;
  const old = tryCreateReservation(state, {
    ownerKind: 'crew', ownerId: crew.id, kind: 'provider-slot', targetTile: serving,
    targetId: `meal-pickup:${serving}`, amount: 1, capacity: 1, ttlSec: 75
  });
  assert(old.ok, 'crew must obtain a real initial meal-provider claim');

  const sampledEnergy = [crew.energy];
  tick(state, 0.2);
  sampledEnergy.push(crew.energy);
  assert(crew.resting, 'critically fatigued crew stalled at a fixture did not begin assigned sleep');
  assert(sampledEnergy.every((energy) => energy >= 18), `crew crossed the hard energy floor before sleep: ${sampledEnergy.join(', ')}`);
  const actualResting = state.crewMembers.filter((candidate) => candidate.resting).length;
  assert(
    state.metrics.crewRestingNow === actualResting &&
    state.metrics.crewResting === actualResting &&
    state.metrics.idleCrewByReason.idle_resting === actualResting,
    `live rest census lagged actor truth: actual ${actualResting}, now ${state.metrics.crewRestingNow}, ` +
    `derived ${state.metrics.crewResting}, idle ${state.metrics.idleCrewByReason.idle_resting}`
  );
  assert(!crew.eating && !crew.carryingMeal, 'stalled meal intent survived critical-sleep handoff');
  assert(old.reservation.releaseReason === 'replaced', `stale crew claim did not release once (${old.reservation.releaseReason})`);
  assert(crew.assignedSleepTile !== null, 'critical crew did not retain an assigned physical sleep slot');
}

function testCrewOrdinaryIdleRestsBeforeProjectedDutyFloor(): void {
  const state = crewProductionState();
  const serving = fixtureTile(state, ModuleType.ServingStation);
  const crew = stageCrew(state, serving, 18.2);
  crew.idleReason = 'idle_waiting_reassign';
  crew.path = [serving + 1];

  tick(state, 0.2);

  assert(crew.resting, 'ordinary idle crew did not begin rest before its projected duty drain crossed the floor');
  assert(crew.energy >= 18, `ordinary idle crew crossed the hard energy floor before rest: ${crew.energy}`);
  assert(crew.path.length === 0, 'ordinary critical-rest handoff retained a stale route');
}

function testCrewBlockedSelfCarePathYieldsToCriticalSleep(): void {
  const state = crewProductionState();
  const toilet = fixtureTile(state, ModuleType.Toilet);
  const crew = stageCrew(state, toilet, 18.2);
  crew.toileting = true;
  crew.idleReason = 'idle_no_path';
  crew.path = [toilet + 1];
  const old = tryCreateReservation(state, {
    ownerKind: 'crew', ownerId: crew.id, kind: 'provider-slot', targetTile: toilet,
    targetId: `toilet:${toilet}`, amount: 1, capacity: 1, ttlSec: 75
  });
  assert(old.ok, 'crew must obtain a real blocked toilet claim');

  tick(state, 0.2);

  assert(crew.resting, 'critically fatigued crew with a blocked self-care path did not begin sleep');
  assert(crew.energy >= 18, `blocked self-care path crossed the hard energy floor: ${crew.energy}`);
  assert(!crew.toileting && crew.path.length === 0, 'blocked self-care intent survived critical-sleep handoff');
  assert(old.reservation.releaseReason === 'replaced',
    `blocked self-care claim did not release once (${old.reservation.releaseReason})`);
}

function testCrewProgressingSelfCarePathYieldsBeforeCriticalFloor(): void {
  const state = crewProductionState();
  const toilet = fixtureTile(state, ModuleType.Toilet);
  const crew = stageCrew(state, toilet, 18.2);
  crew.toileting = true;
  crew.idleReason = 'idle_available';
  crew.path = [toilet + 1];
  const old = tryCreateReservation(state, {
    ownerKind: 'crew', ownerId: crew.id, kind: 'provider-slot', targetTile: toilet,
    targetId: `toilet:${toilet}`, amount: 1, capacity: 1, ttlSec: 75
  });
  assert(old.ok, 'crew must obtain a real progressing toilet claim');

  tick(state, 0.2);

  assert(crew.resting, 'critical sleep did not preempt a progressing pre-session self-care path');
  assert(crew.energy >= 18, `progressing self-care path crossed the hard energy floor: ${crew.energy}`);
  assert(!crew.toileting && crew.path.length === 0, 'progressing self-care path survived critical-sleep handoff');
  assert(old.reservation.releaseReason === 'replaced',
    `progressing self-care claim did not release once (${old.reservation.releaseReason})`);
}

function testCrewRestExitClearsLiveRestReason(): void {
  const state = crewProductionState();
  const serving = fixtureTile(state, ModuleType.ServingStation);
  const crew = stageCrew(state, serving, 100);
  crew.resting = true;
  crew.restSessionActive = true;
  crew.idleReason = 'idle_resting';

  tick(state, 0.2);

  assert(!crew.resting, 'fully recovered crew did not leave rest');
  assert(crew.idleReason !== 'idle_resting', 'rest exit retained a stale idle_resting diagnostic');
  assert(state.metrics.crewRestingNow === 0 && state.metrics.crewResting === 0,
    `rest-exit census retained a stale actor: now ${state.metrics.crewRestingNow}, derived ${state.metrics.crewResting}`);
  assert(state.metrics.idleCrewByReason.idle_resting === 0,
    `rest-exit idle bucket retained ${state.metrics.idleCrewByReason.idle_resting}`);
}

function testCrewActiveMealIsNeverPreempted(): void {
  const state = crewProductionState();
  const table = fixtureTile(state, ModuleType.Table);
  const crew = stageCrew(state, table);
  crew.eating = true;
  crew.carryingMeal = true;
  crew.eatSessionActive = true;
  crew.eatUntil = state.now + 30;
  const claim = tryCreateReservation(state, {
    ownerKind: 'crew', ownerId: crew.id, kind: 'seat-use-slot', targetTile: table,
    targetId: `meal-seat:${table}`, amount: 1, capacity: 1, ttlSec: 75
  });
  assert(claim.ok, 'crew must obtain a real meal-seat claim');

  tick(state, 0.01);
  assert(!crew.resting && crew.eating && crew.eatSessionActive, 'active physical crew meal was incorrectly preempted');
  assert(claim.reservation.releaseReason === null, `active meal claim was released (${claim.reservation.releaseReason})`);
}

testSharedDecayPreservesProfiles();
testStableCriticalSelectionAndSingleClaim();
testCriticalPreemptionPolicy();
testVisitorProductionPreemption();
testResidentProductionPreemption();
testPlannedVisitorServiceIsNotPreempted();
testCrewStalledSelfCareYieldsToCriticalSleep();
testCrewOrdinaryIdleRestsBeforeProjectedDutyFloor();
testCrewBlockedSelfCarePathYieldsToCriticalSleep();
testCrewProgressingSelfCarePathYieldsBeforeCriticalFloor();
testCrewRestExitClearsLiveRestReason();
testCrewActiveMealIsNeverPreempted();

console.log('PASS shared occupant demand: profile decay, stable claims, visitor/resident/crew production preemption, active-service guards');
