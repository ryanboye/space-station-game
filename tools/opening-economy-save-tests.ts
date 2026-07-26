import { createPodDemandLog } from '../src/sim/pod-demand';
import { acceptCapitalProject, createCapitalProjectsState } from '../src/sim/capital-projects';
import { createEconomyLedger, recordEconomyEvent } from '../src/sim/opening-economy';
import { createCourierHandling, createSupplierDelivery } from '../src/sim/pod-freight';
import { createInitialState } from '../src/sim/sim';
import { hydrateStateFromSave, parseAndMigrateSave, serializeSave } from '../src/sim/save';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function parsedSave(state = createInitialState()) {
  const parsed = parseAndMigrateSave(serializeSave('opening-economy-save', state, 'focused-test'));
  assert(parsed.ok, 'Save should parse.');
  return parsed.save;
}

function testRoundTripPreservesOpeningEconomy(): void {
  const state = createInitialState();
  const ledger = createEconomyLedger();
  recordEconomyEvent(ledger, {
    at: 12,
    kind: 'retail-sale',
    credits: 8,
    costBasis: 3,
    label: 'Travel supplies',
    tileIndex: 44,
    siteTag: 'ice'
  });
  recordEconomyEvent(ledger, {
    at: 14,
    kind: 'supplier-purchase',
    credits: -36,
    costBasis: 36,
    label: 'Stocked travel supplies'
  });
  const supplier = createSupplierDelivery({
    id: 'supplier-roundtrip',
    stockKind: 'travel-supplies',
    units: 12,
    landedUnitCost: 3,
    orderedAt: 10
  }).operation;
  const courier = createCourierHandling({
    id: 'courier-roundtrip',
    stockKind: 'fuel',
    direction: 'transfer',
    units: 4,
    handlingFeePerUnit: 2.5,
    arrivedAt: 11
  });
  const projects = acceptCapitalProject(createCapitalProjectsState(), 'roadside-rest-stop', 9).state;
  state.openingEconomy = {
    ledger,
    podDemand: createPodDemandLog(),
    marketPricingPolicy: 'premium',
    podFreightOperations: [supplier, courier],
    capitalProjects: projects
  };

  const save = parsedSave(state);
  assert(save.snapshot.openingEconomy?.ledger.nextEventId === 3, 'Snapshot should retain the next ledger id.');
  const restored = hydrateStateFromSave(save).state.openingEconomy;
  assert(restored, 'Hydrated state should always receive opening economy state.');
  assert(restored.marketPricingPolicy === 'premium', 'Market pricing policy did not round-trip.');
  assert(restored.ledger.recent.length === 2, 'Recent economy events did not round-trip.');
  assert(restored.ledger.recent[0].siteTag === 'ice', 'Optional economy event fields did not round-trip.');
  assert(restored.ledger.lifetime['retail-sale'].revenue === 8, 'Lifetime ledger summary did not round-trip.');
  assert(restored.podFreightOperations.length === 2, 'Pod freight operations did not round-trip.');
  assert(restored.podFreightOperations[0].kind === 'supplier-delivery', 'Supplier delivery was not restored.');
  assert(restored.capitalProjects.active[0]?.id === 'roadside-rest-stop', 'Capital project did not round-trip.');
}

function testLegacySaveGetsNeutralOpeningEconomy(): void {
  const save = parsedSave();
  Reflect.deleteProperty(save.snapshot, 'openingEconomy');
  const restored = hydrateStateFromSave(save).state.openingEconomy;
  assert(restored, 'Legacy saves should hydrate neutral opening economy state.');
  assert(restored.marketPricingPolicy === 'standard', 'Legacy market policy should default to standard.');
  assert(restored.ledger.nextEventId === 1 && restored.ledger.recent.length === 0, 'Legacy ledger should start empty.');
  assert(restored.podFreightOperations.length === 0, 'Legacy save should not invent pod freight operations.');
  assert(restored.capitalProjects.active.length === 0, 'Legacy save should not activate projects.');
}

function testMalformedOpeningEconomyIsTolerantAndBounded(): void {
  const save = parsedSave() as unknown as { snapshot: Record<string, unknown> };
  save.snapshot.openingEconomy = {
    podDemand: createPodDemandLog(),
    ledger: {
      nextEventId: -10,
      recent: [
        { id: 5, at: 12, kind: 'retail-sale', credits: 8, costBasis: 3, label: 'Valid sale' },
        { id: 'bad', at: 13, kind: 'unknown', credits: 5, costBasis: 0, label: 'Invalid sale' }
      ],
      lifetime: {
        'retail-sale': { count: 2, revenue: 16, expenses: -2, net: 18, costBasis: 6 }
      }
    },
    marketPricingPolicy: 'nonsense',
    podFreightOperations: [
      {
        id: 'supplier-corrected',
        kind: 'supplier-delivery',
        status: 'complete',
        stockKind: 'travel-supplies',
        orderedUnits: 8,
        arrivedUnits: 8,
        unloadedUnits: 3,
        landedUnitCost: 2,
        orderedAt: 4,
        arrivedAt: 6,
        completedAt: 7,
        blockedReason: null,
        dockId: 3,
        purchaseRecorded: true
      },
      {
        id: 'supplier-corrected',
        kind: 'supplier-delivery',
        status: 'ordered',
        stockKind: 'fuel',
        orderedUnits: 4,
        arrivedUnits: 0,
        unloadedUnits: 0,
        landedUnitCost: 1,
        orderedAt: 1,
        arrivedAt: null,
        completedAt: null,
        blockedReason: null,
        dockId: null,
        purchaseRecorded: true
      },
      { id: 'broken-courier', kind: 'courier-handling', stockKind: 'fuel', consignedUnits: 0 }
    ],
    capitalProjects: {
      active: [{ id: 'courier-partner', acceptedAt: -5 }, { id: 'not-real', acceptedAt: 2 }],
      completed: ['local-bazaar', 'not-real', 'local-bazaar'],
      advanceAwarded: ['local-bazaar', 'not-real']
    }
  };

  const rawText = JSON.stringify({
    schemaVersion: 3,
    gameVersion: 'focused-test',
    createdAt: new Date().toISOString(),
    name: 'Malformed opening economy',
    snapshot: save.snapshot
  });
  const parsed = parseAndMigrateSave(rawText);
  assert(parsed.ok, 'Malformed optional opening-economy data should not reject a save.');
  const restored = hydrateStateFromSave(parsed.save).state.openingEconomy;
  assert(restored, 'Malformed opening economy should hydrate a safe default envelope.');
  assert(restored.marketPricingPolicy === 'standard', 'Invalid pricing policy should default to standard.');
  assert(restored.ledger.recent.length === 1 && restored.ledger.nextEventId === 6, 'Ledger should retain valid events and repair ids.');
  assert(restored.ledger.lifetime['retail-sale'].expenses === 0, 'Negative lifetime expenses should be normalized.');
  assert(restored.podFreightOperations.length === 1, 'Invalid and duplicate pod freight operations should be removed.');
  assert(restored.podFreightOperations[0].status === 'unloading', 'Incomplete freight marked complete should be corrected.');
  assert(restored.capitalProjects.active[0]?.acceptedAt === 0, 'Capital project timestamps should be normalized.');
  assert(restored.capitalProjects.completed.length === 1, 'Invalid capital project ids should be removed.');
}

const TESTS: Array<[string, () => void]> = [
  ['round-trip', testRoundTripPreservesOpeningEconomy],
  ['legacy-default', testLegacySaveGetsNeutralOpeningEconomy],
  ['malformed-migration', testMalformedOpeningEconomyIsTolerantAndBounded]
];

for (const [name, run] of TESTS) {
  run();
  console.log(`PASS ${name}`);
}
