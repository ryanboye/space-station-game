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

testSharedDecayPreservesProfiles();
testStableCriticalSelectionAndSingleClaim();
testCriticalPreemptionPolicy();

console.log('PASS shared occupant demand: distinct profile decay, stable reservations, optional-only critical preemption');
