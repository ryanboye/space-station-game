import {
  acceptCapitalProject,
  capitalProjectDefinitions,
  createCapitalProjectsState,
  evaluateCapitalProjects,
  hydrateCapitalProjectsState,
  projectProgress,
  type CapitalProjectFacts
} from '../src/sim/capital-projects';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function completeRoadsideFacts(): CapitalProjectFacts {
  return { travelersServed: 12, mealsServed: 8, retailSales: 6 };
}

function testDefinitionsAreLegible(): void {
  const definitions = capitalProjectDefinitions();
  assert(definitions.length === 4, 'Expected the four opening capital projects.');
  for (const definition of definitions) {
    assert(definition.conditions.length >= 2 && definition.conditions.length <= 4, `${definition.id} must have 2-4 conditions.`);
    assert(definition.reward.completionCredits > definition.reward.advanceCredits, `${definition.id} completion reward should exceed the advance.`);
  }
}

function testTwoActiveProjectLimit(): void {
  let state = createCapitalProjectsState();
  state = acceptCapitalProject(state, 'roadside-rest-stop', 10).state;
  state = acceptCapitalProject(state, 'courier-partner', 11).state;
  const rejected = acceptCapitalProject(state, 'fuel-frontier', 12);
  assert(rejected.state.active.length === 2, 'A third active project was accepted.');
  assert(rejected.creditsAwarded === 0, 'Rejected project issued an advance.');
}

function testProgressUsesSimulationFacts(): void {
  const partial = projectProgress('roadside-rest-stop', { travelersServed: 12, mealsServed: 7, retailSales: 6 });
  assert(!partial.complete, 'Project completed before all supplied facts met their targets.');
  assert(partial.conditions[1].current === 7, 'Progress did not preserve the observed simulation value.');
  assert(projectProgress('roadside-rest-stop', completeRoadsideFacts()).complete, 'Project did not complete from valid facts.');
}

function testAwardsAreIdempotentAcrossHydration(): void {
  const accepted = acceptCapitalProject(createCapitalProjectsState(), 'roadside-rest-stop', 20);
  assert(accepted.creditsAwarded === 65, 'Roadside Rest Stop advance mismatch.');
  const first = evaluateCapitalProjects(accepted.state, completeRoadsideFacts());
  assert(first.creditsAwarded === 240, 'Completion did not issue the expected capital award.');
  assert(first.ratingAwarded === 2, 'Completion did not issue the expected rating reward.');
  assert(first.completed.length === 1, 'Completion record was not returned.');
  const restored = hydrateCapitalProjectsState(JSON.parse(JSON.stringify(first.state)));
  const replay = evaluateCapitalProjects(restored, completeRoadsideFacts());
  assert(replay.creditsAwarded === 0 && replay.ratingAwarded === 0, 'Hydrated completed project paid out twice.');
  assert(replay.completed.length === 0, 'Completed project was reported again after hydration.');
}

function testInvalidSaveIsSafe(): void {
  const state = hydrateCapitalProjectsState({
    active: [{ id: 'roadside-rest-stop', acceptedAt: 4 }, { id: 'not-real', acceptedAt: 5 }, { id: 'courier-partner', acceptedAt: -2 }],
    completed: ['local-bazaar', 'not-real', 'local-bazaar'],
    advanceAwarded: ['local-bazaar', 'not-real']
  });
  assert(state.completed.length === 1 && state.completed[0] === 'local-bazaar', 'Malformed completed ids survived hydration.');
  assert(state.active.length === 2, 'Valid active entries were not retained.');
  assert(state.active[1].acceptedAt === 0, 'Negative saved timestamps were not normalized.');
}

const TESTS: Array<[string, () => void]> = [
  ['definitions', testDefinitionsAreLegible],
  ['active-limit', testTwoActiveProjectLimit],
  ['progress', testProgressUsesSimulationFacts],
  ['idempotency', testAwardsAreIdempotentAcrossHydration],
  ['save-safety', testInvalidSaveIsSafe]
];

const filter = process.env.CAPITAL_PROJECTS_TEST_FILTER;
let passed = 0;
for (const [name, run] of TESTS) {
  if (filter && !name.includes(filter)) continue;
  run();
  passed++;
}
console.log(`capital-projects: ${passed} focused checks passed`);
