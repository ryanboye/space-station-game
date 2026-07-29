import {
  assignLuggageCarrier,
  canPassengerBoardWithLuggage,
  completeLuggageJob,
  createManifestLuggage,
  ensureManifestLuggage,
  interruptLuggageCarrier,
  luggageIdentity,
  luggageJobIdentity,
  reconcileLuggageCustody,
  requestLuggageReturn,
  strandPassengerLuggage,
  type LuggageCustodyState,
  type PassengerLuggage
} from '../src/sim/luggage';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function manifest(arrivalDeskTile: number | null = 55) {
  return { shipId: 7, shipTile: 10, passengerIds: [106, 101, 104, 102, 105, 103], arrivalDeskTile };
}

function bagId(passengerId = 101): string {
  return luggageIdentity(7, passengerId);
}

function jobId(leg: 'inbound' | 'outbound', passengerId = 101): string {
  return luggageJobIdentity(bagId(passengerId), leg);
}

function roundTripToClaim(state: LuggageCustodyState, passengerId = 101, carrierId = 41): LuggageCustodyState {
  state = assignLuggageCarrier(state, jobId('inbound', passengerId), carrierId);
  return completeLuggageJob(state, jobId('inbound', passengerId));
}

function testSixPassengerIdentityAndExactlyOnceCreation(): string {
  let state = createManifestLuggage(manifest());
  state = ensureManifestLuggage(state, { ...manifest(), passengerIds: [101, 102, 103, 104, 105, 106, 106] });
  assert(state.bags.length === 6, 'Repeated manifest projection must create exactly six stable bags.');
  assert(new Set(state.bags.map((bag) => bag.id)).size === 6, 'Bag identities must be unique.');
  assert(state.jobs.length === 6, 'Repeated projection must create one inbound job per bag, exactly once.');
  assert(state.jobs.every((job) => job.id === luggageJobIdentity(job.luggageId, 'inbound')), 'Job ids must be stable.');
  return 'PASS six manifest passengers own six stable bags and six exactly-once inbound jobs';
}

function testAbsentDeskNeverBlocks(): string {
  let state = createManifestLuggage(manifest(null));
  state = requestLuggageReturn(state, bagId());
  assert(state.jobs.length === 0, 'No Arrival Desk must not create phantom luggage jobs.');
  assert(state.bags.every((bag) => bag.phase === 'aboard' && bag.location.kind === 'ship'), 'All bags must remain aboard.');
  assert(state.bags.every((bag) => canPassengerBoardWithLuggage(state, bag.id)), 'No-desk Pod visits must remain boardable.');
  return 'PASS no Arrival Desk leaves luggage aboard and never blocks boarding';
}

function testFullPhysicalRoundTrip(): string {
  let state = createManifestLuggage(manifest());
  state = assignLuggageCarrier(state, jobId('inbound'), 41);
  assert(state.bags[0].phase === 'inbound-transit' && state.bags[0].location.kind === 'carrier', 'Inbound custody must be physical.');
  state = completeLuggageJob(state, jobId('inbound'));
  assert(state.bags[0].phase === 'claim' && !canPassengerBoardWithLuggage(state, bagId()), 'Claimed bag must block early boarding.');
  state = requestLuggageReturn(state, bagId());
  state = assignLuggageCarrier(state, jobId('outbound'), 42);
  assert(state.bags[0].phase === 'outbound-transit', 'Outbound carrier must own the same bag.');
  state = completeLuggageJob(state, jobId('outbound'));
  state = completeLuggageJob(state, jobId('outbound'));
  assert(state.bags[0].phase === 'returned' && state.bags[0].location.kind === 'ship', 'Return must end aboard the origin ship.');
  assert(canPassengerBoardWithLuggage(state, bagId()), 'Passenger may board only after return.');
  assert(state.jobs.filter((job) => job.luggageId === bagId()).length === 2, 'Idempotent completion must not duplicate leg jobs.');
  return 'PASS ship → claim → ship round trip is physical, gating, and terminal-idempotent';
}

function testInterruptedCarrierRequeuesAtClaim(): string {
  let state = roundTripToClaim(createManifestLuggage(manifest()));
  state = requestLuggageReturn(state, bagId());
  state = assignLuggageCarrier(state, jobId('outbound'), 52);
  state = interruptLuggageCarrier(state, 52, 77);
  const bag = state.bags[0];
  const job = state.jobs.find((candidate) => candidate.id === jobId('outbound'));
  assert(bag.phase === 'outbound-transit' && bag.location.kind === 'loose' && bag.location.tile === 77, 'Interrupted bag must remain at its real drop tile.');
  assert(job?.state === 'pending' && job.carrierId === null && job.fromTile === 77, 'The same outbound job must resume at the drop tile.');
  assert(state.carriers.length === 0, 'Interrupted carrier link must be cleared.');
  assert(state.jobs.filter((candidate) => candidate.id === jobId('outbound')).length === 1, 'Interruption must not duplicate the job.');
  state = assignLuggageCarrier(state, jobId('outbound'), 53);
  state = completeLuggageJob(state, jobId('outbound'));
  assert(state.bags[0].phase === 'returned', 'A requeued dropped bag must still complete normally.');
  return 'PASS interrupted carrier drops physically and requeues the same completable job';
}

function testStrandedPassengerKeepsBagAtClaim(): string {
  let state = roundTripToClaim(createManifestLuggage(manifest()));
  state = strandPassengerLuggage(state, bagId());
  const bag = state.bags[0];
  assert(bag.passengerStranded && bag.phase === 'claim' && bag.location.kind === 'claim', 'Stranded bag must remain physical at claim.');
  assert(state.carriers.length === 0, 'Stranding must detach the carrier.');
  assert(!canPassengerBoardWithLuggage(state, bag.id), 'Stranding cannot falsely satisfy boarding.');

  let carried = createManifestLuggage(manifest());
  carried = assignLuggageCarrier(carried, jobId('inbound'), 61);
  const unchanged = strandPassengerLuggage(carried, bagId());
  assert(!unchanged.bags[0].passengerStranded, 'A carried bag cannot be stranded without a physical drop tile.');
  carried = strandPassengerLuggage(carried, bagId(), 33);
  assert(carried.bags[0].passengerStranded && carried.bags[0].location.kind === 'loose' && carried.bags[0].location.tile === 33, 'Carried stranding must preserve the explicit drop tile.');
  return 'PASS stranding preserves claim custody or an explicit carrier drop tile';
}

function malformedTransitBag(phase: PassengerLuggage['phase']): PassengerLuggage {
  return {
    id: bagId(), shipId: 7, passengerId: 101, shipTile: 10, claimTile: 55,
    phase, location: { kind: 'carrier', carrierId: 70 }, returnRequested: phase === 'outbound-transit', passengerStranded: false
  };
}

function testSaveReconcilePermutations(): string {
  const inbound = luggageJobIdentity(bagId(), 'inbound');
  const outbound = luggageJobIdentity(bagId(), 'outbound');
  const transit = malformedTransitBag('inbound-transit');
  let state = reconcileLuggageCustody({
    bags: [transit, { ...transit }],
    jobs: [
      { id: inbound, luggageId: bagId(), leg: 'inbound', fromTile: 10, toTile: 55, state: 'carried', carrierId: 70 },
      { id: `${inbound}:duplicate`, luggageId: bagId(), leg: 'inbound', fromTile: 10, toTile: 55, state: 'pending', carrierId: null }
    ],
    carriers: [
      { carrierId: 70, luggageId: bagId(), jobId: inbound, leg: 'inbound' },
      { carrierId: 71, luggageId: bagId(), jobId: inbound, leg: 'inbound' }
    ]
  });
  assert(state.bags.length === 1 && state.jobs.length === 1 && state.carriers.length === 1, 'Hydration must dedupe bag/job/carrier permutations.');
  assert(state.carriers[0].carrierId === 70 && state.bags[0].location.kind === 'carrier', 'Lowest valid carrier is deterministic.');

  state = reconcileLuggageCustody({ bags: [malformedTransitBag('inbound-transit')], jobs: [], carriers: [] });
  assert(state.bags[0].phase === 'aboard' && state.bags[0].location.kind === 'ship', 'Missing inbound carrier without a loose tile must restore to ship.');
  assert(state.jobs.find((job) => job.id === inbound)?.state === 'pending', 'Missing inbound carrier must keep the same leg pending.');

  state = reconcileLuggageCustody({ bags: [malformedTransitBag('outbound-transit')], jobs: [], carriers: [] });
  assert(state.bags[0].phase === 'claim' && state.bags[0].location.kind === 'claim', 'Missing outbound carrier must fall back to claim.');
  assert(state.jobs.find((job) => job.id === outbound)?.state === 'pending', 'Missing outbound carrier must requeue the stable job.');

  state = reconcileLuggageCustody({
    bags: [{ ...malformedTransitBag('inbound-transit'), location: { kind: 'loose', tile: 29 } }],
    jobs: [], carriers: []
  });
  assert(state.bags[0].location.kind === 'loose' && state.jobs[0].fromTile === 29, 'Saved loose custody must survive hydration exactly.');

  const returned = { ...malformedTransitBag('returned'), location: { kind: 'ship' as const, tile: 10 } };
  state = reconcileLuggageCustody({ bags: [returned], jobs: [], carriers: [] });
  assert(state.jobs.length === 2 && state.jobs.every((job) => job.state === 'completed'), 'Returned hydration must reconstruct terminal leg history.');
  assert(canPassengerBoardWithLuggage(state, bagId()), 'Returned hydration remains boardable.');
  return 'PASS save reconciliation deterministically repairs duplicate, orphaned, and terminal custody';
}

const results = [
  testSixPassengerIdentityAndExactlyOnceCreation(),
  testAbsentDeskNeverBlocks(),
  testFullPhysicalRoundTrip(),
  testInterruptedCarrierRequeuesAtClaim(),
  testStrandedPassengerKeepsBagAtClaim(),
  testSaveReconcilePermutations()
];

console.log(`Luggage custody model: ${results.length}/${results.length} checks passed`);
for (const result of results) console.log(`  ${result}`);
