import {
  acceptOpeningCapitalProject,
  buyImportedTradeGoods,
  createInitialState,
  getOpeningCapitalProjects,
  getOpeningEconomySummary,
  removeModuleAtTile,
  setDockPurpose,
  setMarketPricingPolicy,
  tick
} from '../src/sim';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function stockAt(state: ReturnType<typeof createInitialState>, item: 'tradeGood' | 'rawMaterial'): number {
  return state.itemNodes.reduce((total, node) => total + (node.items[item] ?? 0), 0);
}

function marketPolicy(state: ReturnType<typeof createInitialState>) {
  return state.openingEconomy.marketPricingPolicy;
}

function readyState() {
  const state = createInitialState({ manualTrafficAdmission: true });
  tick(state, 0);
  return state;
}

function freightDock(state: ReturnType<typeof createInitialState>) {
  const dock = state.docks.find((candidate) => candidate.podCapabilities?.includes('freight'));
  assert(dock, 'Starter station should expose a freight-capable Pod Dock.');
  return dock;
}

function routeWalkInsToFreightDock(state: ReturnType<typeof createInitialState>): void {
  const cargoDock = freightDock(state);
  for (const dock of state.docks) {
    if (dock.id !== cargoDock.id) setDockPurpose(state, dock.id, 'residential');
  }
  state.controls.paused = false;
  state.controls.manualTrafficAdmission = true;
  state.controls.materialAutoImportEnabled = false;
}

function advanceUntil(
  state: ReturnType<typeof createInitialState>,
  condition: () => boolean,
  limitSeconds: number,
  message: string
): void {
  for (let elapsed = 0; elapsed < limitSeconds; elapsed++) {
    tick(state, 1);
    if (condition()) return;
  }
  assert(false, `${message} after ${limitSeconds}s of simulated time.`);
}

function testFreshOpeningDefaults(): void {
  const state = readyState();
  assert(marketPolicy(state) === 'standard', 'Fresh starts should use standard market pricing.');
  assert(state.openingEconomy.ledger.recent.length === 0, 'Fresh starts should have no economy history.');
  assert(state.openingEconomy.podFreightOperations.length === 0, 'Fresh starts should have no active pod freight.');
  assert(stockAt(state, 'tradeGood') === 16, 'Fresh market should retain its starter Travel Supplies buffer.');
  assert(freightDock(state).sourceKind === 'pod-dock-module', 'Starter freight service should be attached to a Pod Dock.');
  assert(getOpeningCapitalProjects(state).every((project) => project.state === 'available'), 'Capital projects should begin optional and available.');
}

function testSupplierOrderRequiresFreightDock(): void {
  const state = readyState();
  const locker = state.moduleInstances.find((module) => module.type === 'freight-locker');
  assert(locker, 'Starter fixture requires a Freight Locker.');
  assert(removeModuleAtTile(state, locker.originTile), 'Fixture Freight Locker should be removable through the simulation API.');
  tick(state, 0);
  assert(!state.docks.some((dock) => dock.podCapabilities?.includes('freight')), 'Removing the locker should remove freight capability.');

  const creditsBefore = state.metrics.credits;
  assert(!buyImportedTradeGoods(state), 'Travel Supplies order should require a freight-capable Pod Dock.');
  assert(state.metrics.credits === creditsBefore, 'Rejected Travel Supplies order should not charge credits.');
  assert(state.openingEconomy.podFreightOperations.length === 0, 'Rejected order should not create freight work.');
}

function testSupplierDeliveryAndCourierConsignment(): void {
  const state = readyState();
  routeWalkInsToFreightDock(state);
  const suppliesBefore = stockAt(state, 'tradeGood');
  const creditsBefore = state.metrics.credits;

  assert(buyImportedTradeGoods(state), 'Travel Supplies order should be accepted with a freight-capable Pod Dock.');
  const supplier = state.openingEconomy.podFreightOperations.find((operation) => operation.kind === 'supplier-delivery');
  assert(supplier, 'Accepted Travel Supplies order should create a supplier delivery.');
  assert(supplier.status === 'ordered', 'Supplier delivery should wait for its freight pod.');
  assert(stockAt(state, 'tradeGood') === suppliesBefore, 'Ordering supplies must not immediately add station inventory.');
  assert(state.metrics.credits < creditsBefore, 'Supplier order should charge credits when placed.');
  assert(getOpeningEconomySummary(state).byKind['supplier-purchase'].count === 1, 'Supplier order should enter the economy ledger.');

  tick(state, 2);
  assert(supplier.status === 'ordered', 'Supplier delivery should remain delayed before a pod arrives.');
  assert(stockAt(state, 'tradeGood') === suppliesBefore, 'Delayed supplier delivery must still leave inventory unchanged.');

  advanceUntil(
    state,
    () => state.openingEconomy.podFreightOperations.some((operation) => operation.id === supplier.id && operation.status === 'complete'),
    120,
    'Supplier delivery did not complete'
  );
  assert(stockAt(state, 'tradeGood') === suppliesBefore + supplier.orderedUnits, 'Supplier delivery should add inventory only after unloading.');

  advanceUntil(
    state,
    () => state.openingEconomy.podFreightOperations.some((operation) => operation.kind === 'courier-handling'),
    240,
    'A courier freight visit did not arrive'
  );
  const courier = state.openingEconomy.podFreightOperations.find((operation) => operation.kind === 'courier-handling');
  assert(courier, 'Expected a courier freight operation.');
  const rawMaterialsBefore = stockAt(state, 'rawMaterial');

  advanceUntil(
    state,
    () => state.openingEconomy.podFreightOperations.some((operation) => operation.id === courier.id && operation.status === 'complete'),
    120,
    'Courier freight operation did not complete'
  );
  assert(stockAt(state, 'rawMaterial') === rawMaterialsBefore, 'Courier freight must remain consigned and never enter station inventory.');
  assert(getOpeningEconomySummary(state, 600).byKind['courier-fee'].count === 1, 'Completed courier handling should earn one handling fee.');
}

function testMarketPolicyAndOptionalProjects(): void {
  const state = readyState();
  setMarketPricingPolicy(state, 'premium');
  assert(marketPolicy(state) === 'premium', 'Pricing policy should be stored on the integrated economy state.');
  setMarketPricingPolicy(state, 'budget');
  assert(marketPolicy(state) === 'budget', 'Pricing policy should support an active policy change.');

  const creditsBefore = state.metrics.credits;
  assert(acceptOpeningCapitalProject(state, 'courier-partner'), 'Optional capital project should be acceptible from a fresh start.');
  const courierProject = getOpeningCapitalProjects(state).find((project) => project.id === 'courier-partner');
  assert(courierProject?.state === 'active', 'Accepted capital project should become active.');
  assert(courierProject.conditions[0].complete, 'Starter Freight Locker should count toward the optional courier project.');
  assert(state.metrics.credits === creditsBefore + courierProject.advanceCredits, 'Project acceptance should issue its advance through the economy.');
  assert(getOpeningEconomySummary(state).byKind['grant-award'].count === 1, 'Capital advance should be visible in the economy ledger.');
}

const TESTS: Array<[string, () => void]> = [
  ['fresh defaults', testFreshOpeningDefaults],
  ['freight capability gate', testSupplierOrderRequiresFreightDock],
  ['delayed supplier and consigned courier', testSupplierDeliveryAndCourierConsignment],
  ['pricing and capital projects', testMarketPolicyAndOptionalProjects]
];

let passed = 0;
for (const [name, run] of TESTS) {
  run();
  passed++;
  console.log(`PASS ${name}`);
}
console.log(`opening-economy integration: ${passed} focused checks passed`);
