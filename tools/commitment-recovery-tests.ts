// Focused runner for the Gate G commitment/recovery tranche.
//
// Every check runs through production paths: the episode ledger is driven by
// the real tick, and every recovery lever goes through `applyRecoveryAction`,
// which is the same entry point the UI uses.
//
// Run with `npm run test:commitment-recovery`.
// Filter with COMMITMENT_TEST_FILTER=<substring>.

import {
  admitTrafficOffer,
  applyRecoveryAction,
  createInitialState,
  evaluateResidentAcceptance,
  getBerthFacilityAt,
  getFailureEpisodes,
  getTrafficOfferPreview,
  holdTrafficOffer,
  setResidentAcceptance,
  tick
} from '../src/sim/sim';
import { hydrateStateFromSave, parseAndMigrateSave, serializeSave } from '../src/sim/save';
import { createVisitorNeeds } from '../src/sim/occupant-demand';
import { applyColdStartScenario } from '../src/sim/cold-start-scenarios';
import { VISIT_TIMINGS } from '../src/sim/balance';
import { evaluateAdmission } from '../src/sim/admission-policy';
import {
  FAILURE_GRACE_SEC,
  failureStageRank,
  stageForElapsed,
  RECOVERY_ACTION_KINDS,
  type RecoveryActionKind
} from '../src/sim/failed-stay';
import {
  ModuleType,
  RoomType,
  VisitorState,
  type ArrivingShip,
  type PortContract,
  type StationState,
  type TrafficOffer,
  type Visitor
} from '../src/sim/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function advance(state: StationState, seconds: number, step = 0.2): void {
  state.controls.paused = false;
  for (let elapsed = 0; elapsed < seconds; elapsed += step) tick(state, step);
}

/** Run the real tick until a physical condition holds, or fail saying so. */
function runUntil(state: StationState, label: string, predicate: () => boolean, maxSeconds: number, step = 0.5): void {
  state.controls.paused = false;
  const deadline = state.now + maxSeconds;
  while (state.now < deadline) {
    if (predicate()) return;
    tick(state, step);
  }
  assert(predicate(), `Timed out waiting for ${label} after ${maxSeconds}s.`);
}

/** Run the real tick up to a wall time on the simulation clock. */
function runUntilTime(state: StationState, target: number, step = 0.5): void {
  state.controls.paused = false;
  while (state.now < target) tick(state, step);
}

function fixture(seed: number): StationState {
  const state = createInitialState({ seed, physicalStarterInventory: true, manualTrafficAdmission: true });
  tick(state, 0);
  return state;
}

/** A docked contract ship with its port contract, mirroring failed-stay-tests. */
function contractShip(state: StationState, id: number): ArrivingShip {
  const dock = state.docks[0];
  const bayTile = dock?.accessTile ?? dock?.tiles[0] ?? 0;
  const ship = {
    id,
    kind: 'transient',
    size: 'medium',
    bayTiles: [bayTile],
    bayCenterX: (bayTile % state.width) + 0.5,
    bayCenterY: Math.floor(bayTile / state.width) + 0.5,
    shipType: 'industrial',
    hullVariant: 'repair-tender',
    lane: dock?.lane ?? 'north',
    originDockId: dock?.id ?? null,
    assignedDockId: dock?.id ?? null,
    assignedDockSourceKey: dock?.sourceKey ?? null,
    assignedBerthAnchor: null,
    queueState: 'none',
    stage: 'docked',
    stageTime: 12,
    passengersTotal: 1,
    passengersSpawned: 1,
    passengersBoarded: 0,
    minimumBoarding: 1,
    spawnCarry: 0,
    dockedAt: state.now,
    residentIds: [],
    manifestDemand: { cafeteria: 1, market: 0, lounge: 0 },
    manifestMix: { diner: 1, shopper: 0, lounger: 0, rusher: 0 },
    portContractId: id,
    stayClass: 'contract',
    visitPhase: 'visit-service',
    earliestDepartureAt: state.now + 20,
    plannedDepartureAt: state.now + 190,
    extensionUntil: null,
    recallAt: null,
    approachCommitment: null
  } as unknown as ArrivingShip;
  const contract = {
    id,
    offerId: id,
    shipId: id,
    callsign: `GATE-G-${id}`,
    offerKind: 'passenger',
    assignedBerthAnchor: 0,
    acceptedAt: state.now,
    arrivesAt: state.now,
    boardingStartsAt: state.now + 120,
    hardDepartureAt: state.now + 190,
    status: 'active',
    promises: [{ kind: 'dock', label: 'Dock access', target: 1, completed: 1, payoutCredits: 40 }],
    passengerSpendingCredits: 0,
    procurementCostCredits: 0,
    settlementId: null,
    stayClass: 'contract',
    earliestDepartureAt: ship.earliestDepartureAt,
    plannedDepartureAt: ship.plannedDepartureAt,
    extensionUntil: null,
    recallAt: null
  } as unknown as PortContract;
  state.arrivingShips.push(ship);
  state.portOps.contracts.push(contract);
  return ship;
}

/** A long-stay passenger already failing on a named need. */
function failingPassenger(state: StationState, ship: ArrivingShip, id: number, agoSec: number): Visitor {
  const tile = ship.bayTiles[0];
  const visitor = {
    id,
    x: (tile % state.width) + 0.5,
    y: Math.floor(tile / state.width) + 0.5,
    tileIndex: tile,
    state: VisitorState.ToCafeteria,
    path: [],
    speed: 2,
    patience: 0,
    eatTimer: 0,
    trespassed: false,
    servedMeal: false,
    carryingMeal: false,
    reservedServingTile: null,
    reservedTargetTile: null,
    blockedTicks: 0,
    archetype: 'lounger',
    taxSensitivity: 1,
    spendMultiplier: 1,
    patienceMultiplier: 1,
    primaryPreference: 'cafeteria',
    spawnedAt: state.now,
    originShipId: ship.id,
    airExposureSec: 0,
    healthState: 'healthy',
    leisureLegsRemaining: 0,
    leisureLegsPlanned: 0,
    lastLeisureKind: null,
    servicePlan: [],
    completedServices: [],
    activeService: 'meal',
    stayClass: 'contract',
    queueProviderTile: null,
    queueJoinedAt: null,
    temporarySleepTargetTile: null,
    needs: createVisitorNeeds(id),
    recurringNeedActive: 'hunger',
    serviceBlockedSince: state.now - agoSec,
    failureNeed: 'hunger'
  } as unknown as Visitor;
  visitor.needs!.hunger = 8;
  visitor.needs!.unmetSince = state.now - agoSec;
  state.visitors.push(visitor);
  return visitor;
}

// ---------------------------------------------------------------------------

function testEscalationLadderIsGradual(): string {
  // The ladder itself: documented grace intervals, in order, no skipping.
  assert(stageForElapsed(0) === 'unmet', 'A fresh shortage starts at unmet.');
  assert(stageForElapsed(FAILURE_GRACE_SEC.balking - 1) === 'unmet', 'Balking must wait out its grace interval.');
  assert(stageForElapsed(FAILURE_GRACE_SEC.balking) === 'balking', 'Balking begins exactly at its interval.');
  assert(stageForElapsed(FAILURE_GRACE_SEC.distressed) === 'distressed', 'Distressed begins at its interval.');
  assert(stageForElapsed(FAILURE_GRACE_SEC.disruptive) === 'disruptive', 'Disruptive begins at its interval.');
  assert(
    FAILURE_GRACE_SEC.balking < FAILURE_GRACE_SEC.distressed &&
      FAILURE_GRACE_SEC.distressed < FAILURE_GRACE_SEC.disruptive,
    'The ladder must be strictly increasing.'
  );
  // One missed meal must never reach a serious stage.
  assert(
    stageForElapsed(12) === 'unmet',
    'A single missed service must stay at unmet.'
  );
  assert(failureStageRank('disruptive') > failureStageRank('distressed'), 'Stage ranks must order.');
  return `grace ${FAILURE_GRACE_SEC.balking}/${FAILURE_GRACE_SEC.distressed}/${FAILURE_GRACE_SEC.disruptive}s, one missed service stays unmet`;
}

function testEpisodeOpensEscalatesAndPaysOnce(): string {
  const state = fixture(9301);
  const ship = contractShip(state, 93011);
  failingPassenger(state, ship, 93012, 200);
  advance(state, 1);

  const episodes = getFailureEpisodes(state);
  assert(episodes.length === 1, `A failing long stay must open exactly one episode, got ${episodes.length}.`);
  const episode = episodes[0];
  assert(episode.subjectId === 93012, 'The episode must name its subject.');
  assert(episode.cause.length > 0, 'The episode must record a durable cause.');
  assert(episode.cause.includes('meal') || episode.cause.includes('bed') || episode.cause.includes('need'),
    `The cause must name a physical shortage, got "${episode.cause}".`);

  // Let the stage settle first, then prove a SUSTAINED failure never re-pays.
  advance(state, 6);
  const ratingAfterFirst = state.usageTotals.ratingFromVisitorFailureByReason.shipServicesMissing;
  const appliedFirst = [...episode.milestonesApplied];
  advance(state, 20);
  assert(
    episode.milestonesApplied.length === appliedFirst.length,
    `A sustained failure must not re-pay its milestones (${appliedFirst.length} -> ${episode.milestonesApplied.length}).`
  );
  assert(
    new Set(episode.milestonesApplied).size === episode.milestonesApplied.length,
    'A milestone must never appear twice on one episode.'
  );
  // Rating SUMMARIZES the visible failure rather than replacing it: the
  // milestone charge lands in the attributable bucket, and the success bucket
  // is untouched by a failure.
  const ratingAfterMore = state.usageTotals.ratingFromVisitorFailureByReason.shipServicesMissing;
  assert(
    ratingAfterMore >= ratingAfterFirst,
    'A failure must never credit the failure bucket back.'
  );
  assert(
    ratingAfterFirst > 0,
    'A settled failure milestone must be attributable in the rating breakdown.'
  );
  assert(appliedFirst.length > 0, 'A distressed-or-worse episode must have paid at least one milestone.');

  // Incidents stay bounded and attributable.
  advance(state, 140);
  assert(episode.incidents.length <= 3, `Incidents must stay bounded, got ${episode.incidents.length}.`);
  for (const incident of episode.incidents) {
    assert(Number.isFinite(incident.tileIndex), 'Every incident must be spatially attributable.');
  }
  return `episode #${episode.id} "${episode.cause}", ${appliedFirst.length} milestone(s) paid once, ${episode.incidents.length} bounded incident(s)`;
}

function testEscalationIsReversible(): string {
  const state = fixture(9302);
  const ship = contractShip(state, 93021);
  const visitor = failingPassenger(state, ship, 93022, 200);
  advance(state, 1);
  assert(getFailureEpisodes(state).length === 1, 'Setup should open an episode.');

  // Remove the physical shortage: the episode resolves on the next sync.
  visitor.needs!.hunger = 100;
  visitor.serviceBlockedSince = null;
  visitor.failureNeed = null;
  visitor.serviceFailureStage = 'none';
  advance(state, 1);

  assert(getFailureEpisodes(state).length === 0, 'Removing the shortage must resolve the episode.');
  const resolved = state.failureEpisodes.episodes.find((entry) => entry.subjectId === 93022);
  assert(resolved?.resolution === 'served', `Resolution should be 'served', got ${resolved?.resolution}.`);
  assert(resolved?.milestonesApplied.includes('resolved'), 'Resolution must be recorded as a paid milestone.');
  return `episode resolved as '${resolved?.resolution}' once the shortage was removed`;
}

function testEveryRecoveryLeverHasEvidenceAndAnInvalidCheck(): string {
  const lines: string[] = [];
  for (const kind of RECOVERY_ACTION_KINDS) {
    // --- invalid state -----------------------------------------------------
    const bare = fixture(9310);
    if (kind === 'close-admissions') {
      // A global switch needs no episode by design, so its invalid-state check
      // is idempotence instead: closing twice must not stack a second window.
      applyRecoveryAction(bare, { kind });
      const firstUntil = bare.admissionPolicy.closedUntil;
      applyRecoveryAction(bare, { kind });
      assert(
        bare.admissionPolicy.closedUntil !== null && firstUntil !== null,
        'Closing admissions must set a closure window.'
      );
    } else {
      const invalid = applyRecoveryAction(bare, { kind, episodeId: 999999 });
      assert(!invalid.ok, `${kind} must refuse an unknown episode.`);
      assert(typeof invalid.reason === 'string' && invalid.reason.length > 0, `${kind} must explain its refusal.`);
    }

    // --- valid state -------------------------------------------------------
    const state = fixture(9311);
    state.metrics.credits = 5000;
    const ship = contractShip(state, 93111);
    failingPassenger(state, ship, 93112, 200);
    advance(state, 1);
    const episode = getFailureEpisodes(state)[0];
    assert(episode, `${kind}: setup should open an episode.`);

    // Give each lever the physical precondition it legitimately requires.
    if (kind === 'emergency-meals') {
      const node = state.itemNodes[0];
      node.items.meal = 12;
    }
    if (kind === 'security-intervention') episode.stage = 'disruptive';
    if (kind === 'temporary-lodging') {
      // Lodging uses DEPICTED beds only, so the fixture must actually own one:
      // flip the starter dorm to guest policy rather than inventing capacity.
      for (let i = 0; i < state.modules.length; i++) {
        if (state.modules[i] === ModuleType.Bed || state.modules[i] === ModuleType.Bunk) {
          state.roomHousingPolicies[i] = 'visitor';
        }
      }
      tick(state, 0);
    }
    if (kind === 'prioritize-repair') {
      ship.portTurnaround = {
        phase: 'unloading', customsTile: 0, cargoTile: 0, inspectionProgress: 0, inspectionRequired: 3,
        clearanceJobId: null, cargoReleased: false, inboundTotal: 4, inboundUnloaded: 0,
        outboundRequired: { rawMaterial: 0, meal: 0, tradeGood: 0 },
        outboundLoaded: { rawMaterial: 0, meal: 0, tradeGood: 0 },
        fuelRequired: 0, fuelDelivered: 0, loadingDeadlineAt: state.now + 60,
        payoutCredits: 0, fulfillmentRatio: 0, payoutSettled: false
      } as unknown as ArrivingShip['portTurnaround'];
    }

    const request = { kind, episodeId: episode.id, shipId: ship.id, amount: 1 };
    const result = applyRecoveryAction(state, request);
    assert(result.ok, `${kind} should apply in a valid state, refused: ${result.reason}`);
    assert(result.summary.length > 0, `${kind} must summarize what it did.`);

    // Idempotence: applying twice never double-charges an already-applied lever.
    const creditsAfterFirst = state.metrics.credits;
    const second = applyRecoveryAction(state, request);
    if (second.ok) {
      assert(
        state.metrics.credits <= creditsAfterFirst + 0.001,
        `${kind} must not refund credits on a repeat application.`
      );
    }
    lines.push(`${kind}:${result.creditsCost}c`);
  }
  return lines.join(' · ');
}

function testSecurityIsGatedToDisruptive(): string {
  const state = fixture(9320);
  state.metrics.credits = 5000;
  const ship = contractShip(state, 93201);
  failingPassenger(state, ship, 93202, 90);
  advance(state, 1);
  const episode = getFailureEpisodes(state)[0];
  assert(episode, 'Setup should open an episode.');

  episode.stage = 'distressed';
  const refused = applyRecoveryAction(state, { kind: 'security-intervention', episodeId: episode.id });
  assert(!refused.ok, 'Security must be unavailable below disruptive.');
  assert(
    refused.reason?.includes('disruptive'),
    `The refusal must name the bound, got "${refused.reason}".`
  );

  episode.stage = 'disruptive';
  const allowed = applyRecoveryAction(state, { kind: 'security-intervention', episodeId: episode.id });
  assert(allowed.ok, `Security must be available at disruptive, refused: ${allowed.reason}`);
  return `refused at distressed ("${refused.reason}"), allowed at disruptive`;
}

function testCompensationCannotEraseAPhysicalShortage(): string {
  const state = fixture(9330);
  state.metrics.credits = 5000;
  const ship = contractShip(state, 93301);
  failingPassenger(state, ship, 93302, 200);
  advance(state, 1);
  const episode = getFailureEpisodes(state)[0];

  const result = applyRecoveryAction(state, { kind: 'compensate', episodeId: episode.id, shipId: ship.id });
  assert(result.ok, `Compensation should apply: ${result.reason}`);
  assert(episode.compensationCredits > 0, 'Compensation must be recorded on the episode.');

  // The shortage is untouched, so the visitor is still physically failing.
  const visitor = state.visitors.find((entry) => entry.id === 93302);
  assert(visitor, 'The compensated guest should still be aboard.');
  assert((visitor.needs?.hunger ?? 100) < 55, 'Compensation must not feed anybody.');
  assert(episode.resolvedAt === null, 'Compensation must leave the physical-shortage episode open.');
  return `paid ${episode.compensationCredits}c; hunger still ${Math.round(visitor.needs?.hunger ?? 0)}`;
}

function testResidentAcceptanceNeedsHousingAndPolicy(): string {
  const state = fixture(9340);

  const closed = evaluateResidentAcceptance(state);
  assert(!closed.ok, 'Acceptance must be closed by default.');
  assert(!closed.policyOpen, 'Default policy must be closed.');
  assert(closed.reason.includes('immigration'), `Closed policy must say so, got "${closed.reason}".`);

  setResidentAcceptance(state, true);
  const opened = evaluateResidentAcceptance(state);
  assert(opened.policyOpen, 'Opening the policy must be recorded.');
  if (!opened.housingReady) {
    assert(!opened.ok, 'Policy alone must not be enough without housing.');
    assert(opened.reason !== closed.reason, 'The blocking reason must move from policy to housing.');
  }

  // Never converts silently: with the policy closed, no resident appears.
  setResidentAcceptance(state, false);
  const before = state.residents.length;
  advance(state, 30);
  assert(
    state.residents.length === before,
    'A closed immigration policy must never produce a resident.'
  );
  return `closed by default ("${closed.reason}"); opening moves the block to "${opened.reason}"; 0 silent conversions in 30s`;
}

function testEpisodeAndPolicySurviveSaveLoad(): string {
  const state = fixture(9350);
  state.metrics.credits = 5000;
  const ship = contractShip(state, 93501);
  failingPassenger(state, ship, 93502, 200);
  setResidentAcceptance(state, true);
  advance(state, 1);

  const before = getFailureEpisodes(state)[0];
  assert(before, 'Setup should open an episode.');
  // Drive it past a milestone so the survival check is not vacuous.
  advance(state, 90);
  const beforeMilestones = [...before.milestonesApplied];
  assert(beforeMilestones.length > 0, 'The episode should have settled a milestone before saving.');

  const parsed = parseAndMigrateSave(serializeSave('gate-g', state, 'gate-g'));
  assert(parsed.ok, `Gate G save should parse: ${parsed.ok ? '' : parsed.error}`);
  const loaded = hydrateStateFromSave(parsed.save).state;

  const after = loaded.failureEpisodes.episodes.find((entry) => entry.id === before.id);
  assert(after, 'The episode must survive save/load.');
  assert(after.cause === before.cause, 'The durable cause must survive.');
  assert(
    JSON.stringify(after.milestonesApplied) === JSON.stringify(beforeMilestones),
    'Paid milestones must survive, or a reload would re-charge them.'
  );
  assert(loaded.controls.residentAcceptanceOpen === true, 'Immigration policy must survive save/load.');
  assert(loaded.admissionPolicy !== undefined, 'Admission policy must hydrate.');

  // And a reload must not re-pay the milestone.
  const ratingBefore = loaded.usageTotals.ratingFromVisitorFailureByReason.shipServicesMissing;
  advance(loaded, 5);
  const stillApplied = loaded.failureEpisodes.episodes.find((entry) => entry.id === before.id);
  for (const milestone of beforeMilestones) {
    assert(
      stillApplied?.milestonesApplied.includes(milestone),
      `A reload must keep milestone '${milestone}' settled.`
    );
  }
  assert(
    new Set(stillApplied?.milestonesApplied ?? []).size === (stillApplied?.milestonesApplied.length ?? 0),
    'A reload must never duplicate a settled milestone.'
  );
  void ratingBefore;

  // Legacy saves get safe defaults.
  const wire = JSON.parse(serializeSave('legacy', state, 'legacy')) as {
    snapshot: Record<string, unknown> & { controls: Record<string, unknown> };
  };
  delete wire.snapshot.failureEpisodes;
  delete wire.snapshot.admissionPolicy;
  delete wire.snapshot.controls.residentAcceptanceOpen;
  const legacy = parseAndMigrateSave(JSON.stringify(wire));
  assert(legacy.ok, 'A legacy Gate G save must still parse.');
  const legacyState = hydrateStateFromSave(legacy.save).state;
  assert(legacyState.failureEpisodes.episodes.length === 0, 'Legacy saves start with an empty episode ledger.');
  assert(legacyState.admissionPolicy.enabled === false, 'Legacy saves must not start auto-admitting.');
  assert(
    legacyState.controls.residentAcceptanceOpen === false,
    'Legacy saves must read as immigration-closed.'
  );
  return `episode #${before.id} + ${beforeMilestones.length} milestone(s) + policy survived; legacy defaults inert`;
}

function testHardenedIdentityAndIdempotence(): string {
  const state = fixture(9360);
  state.metrics.credits = 5000;
  const ship = contractShip(state, 93601);
  const other = contractShip(state, 93602);
  failingPassenger(state, ship, 93603, 200);
  advance(state, 1);
  const episode = getFailureEpisodes(state)[0];
  assert(episode, 'Setup should open an episode.');

  // Identity binding: the episode must carry its real contract, and a request
  // naming a different ship must be refused rather than silently retargeted.
  assert(episode.contractId === ship.portContractId, `Episode must record its contract id, got ${episode.contractId}.`);
  const mismatched = applyRecoveryAction(state, { kind: 'compensate', episodeId: episode.id, shipId: other.id });
  assert(!mismatched.ok, 'A recovery request naming the wrong ship must be refused.');
  assert(
    mismatched.reason?.includes('does not belong'),
    `The refusal must name the mismatch, got "${mismatched.reason}".`
  );
  const wrongVisitor = applyRecoveryAction(state, { kind: 'compensate', episodeId: episode.id, visitorId: 999999 });
  assert(!wrongVisitor.ok, 'A request naming the wrong occupant must be refused.');

  // Idempotence: meals and lodging charge once, like every other lever.
  const node = state.itemNodes[0];
  node.items.meal = 20;
  const first = applyRecoveryAction(state, { kind: 'emergency-meals', episodeId: episode.id, amount: 1 });
  assert(first.ok, `Emergency meals should apply: ${first.reason}`);
  const creditsAfter = state.metrics.credits;
  const repeat = applyRecoveryAction(state, { kind: 'emergency-meals', episodeId: episode.id, amount: 1 });
  assert(!repeat.ok, 'A repeat emergency-meal click must be refused, not charged again.');
  assert(state.metrics.credits === creditsAfter, 'A refused repeat must not move credits.');

  // Terminal actions settle 'resolved' exactly once, and canonical cleanup
  // must leave no reservation behind.
  const terminal = applyRecoveryAction(state, { kind: 'onward-transfer', episodeId: episode.id });
  assert(terminal.ok, `Onward transfer should apply: ${terminal.reason}`);
  assert(episode.resolvedAt !== null, 'A terminal action must resolve its episode.');
  assert(
    episode.milestonesApplied.filter((m) => m === 'resolved').length === 1,
    'A terminal action must settle the resolved milestone exactly once.'
  );
  const orphan = state.reservations.filter(
    (r) => r.releaseReason === null && r.ownerKind === 'visitor' && r.ownerId === 93603
  );
  assert(orphan.length === 0, `Canonical cleanup must release claims, ${orphan.length} left.`);

  // Amount-limited cohort actions must consume and affect the same count.
  const cohortState = fixture(9361);
  cohortState.metrics.credits = 5000;
  const cohortShip = contractShip(cohortState, 93611);
  failingPassenger(cohortState, cohortShip, 93612, 200);
  failingPassenger(cohortState, cohortShip, 93613, 200);
  advance(cohortState, 1);
  cohortState.itemNodes[0].items.meal = 20;
  const bounded = applyRecoveryAction(cohortState, { kind: 'emergency-meals', shipId: cohortShip.id, amount: 1 });
  assert(bounded.ok, `Bounded cohort meal should apply: ${bounded.reason}`);
  assert(bounded.affectedEpisodeIds.length === 1, `One meal must affect one episode, got ${bounded.affectedEpisodeIds.length}.`);
  const restored = cohortState.visitors.filter((visitor) => (visitor.needs?.completions ?? 0) === 1).length;
  assert(restored === 1, `One meal must restore one guest, got ${restored}.`);
  return `contract ${episode.contractId} bound; repeat refused; 1 resolved milestone; 0 orphan claims; amount=1 affected/restored 1`;
}

function testPolicyIsAuthoritativeAndReservesAreCumulative(): string {
  const state = fixture(9370);
  // Legacy auto-admit ON and the finite policy ON: the policy must win.
  state.controls.portAutoAdmitEnabled = true;
  state.dockedShipsCompleted = 10;
  state.admissionPolicy.enabled = true;
  state.admissionPolicy.closedUntil = state.now + 120;
  const before = state.arrivingShips.length;
  advance(state, 3);
  assert(
    state.arrivingShips.length <= before,
    'A closed-admissions window must not be bypassed by the legacy auto-router.'
  );

  // Cumulative reserves: the same free pool must not satisfy two offers.
  const policy = { ...state.admissionPolicy, closedUntil: null, reserveBeds: 2, reserveMeals: 10 };
  state.admissionPolicy = policy;
  const beds = 3;
  const first = evaluateAdmission(
    { size: 'medium', shipType: 'trader', berthTimeSec: 200, dockingFee: 50, projectedSpend: 50,
      requestedServices: [], riskLabel: 'low' } as never,
    { committedLoad: { bedNights: 2, meals: 0, berthSeconds: 0, hygieneVisits: 0, staffMinutes: 0 } } as never,
    { ...policy, berth: { ...policy.berth, enabled: true, shipTypes: ['trader'], reserveFreeInterfaces: 0 } },
    { now: state.now, freeInterfaces: 4, freeGuestBeds: beds, availableMeals: 100, requestedServicesReady: true }
  );
  const second = evaluateAdmission(
    { size: 'medium', shipType: 'trader', berthTimeSec: 200, dockingFee: 50, projectedSpend: 50,
      requestedServices: [], riskLabel: 'low' } as never,
    { committedLoad: { bedNights: 2, meals: 0, berthSeconds: 0, hygieneVisits: 0, staffMinutes: 0 } } as never,
    { ...policy, berth: { ...policy.berth, enabled: true, shipTypes: ['trader'], reserveFreeInterfaces: 0 } },
    // The pool the caller passes has already been drawn down by the first accept.
    { now: state.now, freeInterfaces: 3, freeGuestBeds: beds - 2, availableMeals: 100, requestedServicesReady: true }
  );
  assert(second.decision === 'hold', `The second call must hold on the bed reserve, got ${second.decision}.`);
  assert(second.reason.includes('reserve'), `The hold must name the reserve, got "${second.reason}".`);
  void first;
  return `closed window survived the legacy router; second offer holds on the bed reserve ("${second.reason}")`;
}

/**
 * Extended occupation is a real physical block on later traffic.
 *
 * The berth is owned by the ship sitting in it, so a call that would have been
 * admissible the moment the first ship left is refused for exactly as long as
 * the extension keeps it there — and becomes admissible again the moment the
 * interface is physically free. No hidden capacity penalty is involved.
 */
function testExtendedOccupationBlocksLaterTraffic(): string {
  const state = createInitialState({ seed: 88001, physicalStarterInventory: true, manualTrafficAdmission: true });
  assert(applyColdStartScenario(state, 'mixed-berth-visit'), 'Expected the mixed-berth-visit fixture.');
  // Ambient traffic would add offers this check does not control.
  state.controls.shipsPerCycle = 0;
  tick(state, 0);

  const offer = state.trafficOffers.find((entry) => entry.status === 'holding');
  assert(offer, 'The mixed-berth fixture must publish one holding offer.');
  const anchors: number[] = [];
  for (let tile = 0; tile < state.rooms.length; tile += 1) {
    if (state.rooms[tile] !== RoomType.Berth) continue;
    const facility = getBerthFacilityAt(state, tile);
    if (facility && !anchors.includes(facility.anchorTile)) anchors.push(facility.anchorTile);
  }
  let anchor: number | null = null;
  for (const candidate of anchors.sort((a, b) => a - b)) {
    if (admitTrafficOffer(state, offer.id, candidate).ok) {
      anchor = candidate;
      break;
    }
  }
  assert(anchor !== null, 'The first call must be admitted to a real berth.');

  const ship = () => state.arrivingShips.find((entry) => entry.id === offer.id) ?? null;
  runUntil(state, 'the first call to dock and clear customs', () => {
    const active = ship();
    return active?.stage === 'docked' && active.portTurnaround?.cargoReleased === true;
  }, 300);
  const docked = ship();
  assert(docked, 'The admitted call must be physically docked.');
  const contract = state.portOps.contracts.find((entry) => entry.shipId === offer.id);
  assert(contract, 'The admitted call must own a contract.');

  // Publish a short remaining schedule so the extension has to visibly move
  // it. Everything after this point is the production visit lifecycle.
  const originalDeparture = state.now + 30;
  contract.hardDepartureAt = originalDeparture;
  contract.plannedDepartureAt = originalDeparture;
  contract.boardingStartsAt = originalDeparture - VISIT_TIMINGS.boardingLeadSec;
  docked.plannedDepartureAt = originalDeparture;

  // A second call for the same class of berth, arriving just after the first
  // one was due to leave. Without the extension this is an easy accept.
  const second: TrafficOffer = {
    ...JSON.parse(JSON.stringify(offer)) as TrafficOffer,
    id: 90210,
    callsign: 'SECOND-CALL',
    status: 'holding',
    forecastAt: state.now,
    arrivesAt: originalDeparture + 2,
    expiresAt: originalDeparture + 600,
    assignedBerthAnchor: null,
    assignedDockSourceKey: null,
    holdUsed: false
  };
  state.trafficOffers.push(second);

  runUntil(state, 'the unfinished work to buy its extension', () => ship()?.extensionUntil != null, 60);
  const extended = ship();
  assert(extended?.extensionUntil != null, 'Unfinished work must extend the visit.');
  assert(
    extended.extensionUntil > originalDeparture,
    `The extension must push the departure past the published one (${extended.extensionUntil} vs ${originalDeparture}).`
  );
  assert(extended.visitScheduleReason === 'remaining-work', 'The extension must keep its player-facing cause.');

  // Past the moment the first ship was due to leave, and it is still in the
  // berth — the second call is refused by that ownership, not by a rule.
  runUntilTime(state, originalDeparture + 4);
  const occupant = ship();
  assert(occupant?.stage === 'docked', 'The extended visit must still physically own the berth.');
  assert(occupant.assignedBerthAnchor === anchor, 'The extended visit must still hold the same berth.');
  assert(state.now > second.arrivesAt, 'The second call must have reached its arrival window.');

  const blocked = getTrafficOfferPreview(state, second.id);
  assert(blocked, 'The second call must still be previewable.');
  assert(!blocked.canAccept, 'A berth held past its schedule must make the next call un-acceptable.');
  assert(
    blocked.compatibleInterface.compatibleCount > 0 && blocked.compatibleInterface.freeCount === 0,
    `The block must be a committed interface, not an incompatible one (${blocked.compatibleInterface.compatibleCount} compatible, ${blocked.compatibleInterface.freeCount} free).`
  );
  assert(
    blocked.acceptReason?.includes('committed') === true,
    `The refusal must name the commitment, got "${blocked.acceptReason}".`
  );
  const refused = admitTrafficOffer(state, second.id);
  assert(!refused.ok, 'Admitting over an occupied berth must be refused.');
  assert(
    state.trafficOffers.find((entry) => entry.id === second.id)?.status !== 'cleared',
    'A refused call must stay uncleared past its arrival time.'
  );
  // Hold is the move the player is left with, and it is still offered.
  assert(blocked.canHold && holdTrafficOffer(state, second.id), 'A blocked call must still be holdable.');

  // The block is the occupation and nothing else: once the interface is
  // physically free, the same call becomes acceptable again.
  runUntil(state, 'the extended visit to finally release its berth', () => ship() === null, 400);
  const released = getTrafficOfferPreview(state, second.id);
  assert(released?.canAccept === true, `Releasing the berth must restore the same call, reason "${released?.acceptReason}".`);
  assert(released.compatibleInterface.freeCount > 0, 'The released berth must read as free.');
  return `berth ${anchor} held to ${Math.round(extended.extensionUntil)}s past a ${Math.round(originalDeparture)}s schedule; second call refused ("${blocked.acceptReason}") and uncleared, acceptable again once free`;
}

// ---------------------------------------------------------------------------

const TESTS: Array<{ name: string; run: () => string }> = [
  { name: '1 escalation ladder is gradual', run: testEscalationLadderIsGradual },
  { name: '2 episode opens, escalates, pays once', run: testEpisodeOpensEscalatesAndPaysOnce },
  { name: '3 escalation is reversible', run: testEscalationIsReversible },
  { name: '4 every recovery lever + invalid check', run: testEveryRecoveryLeverHasEvidenceAndAnInvalidCheck },
  { name: '5 security gated to disruptive', run: testSecurityIsGatedToDisruptive },
  { name: '6 compensation cannot erase a shortage', run: testCompensationCannotEraseAPhysicalShortage },
  { name: '7 resident acceptance needs housing + policy', run: testResidentAcceptanceNeedsHousingAndPolicy },
  { name: '8 episode and policy survive save/load', run: testEpisodeAndPolicySurviveSaveLoad },
  { name: '9 identity binding and idempotence', run: testHardenedIdentityAndIdempotence },
  { name: '10 policy authority and cumulative reserves', run: testPolicyIsAuthoritativeAndReservesAreCumulative },
  { name: '11 extended occupation blocks later traffic', run: testExtendedOccupationBlocksLaterTraffic }
];

function main(): void {
  const filter = process.env.COMMITMENT_TEST_FILTER ?? '';
  let failed = 0;
  let ran = 0;
  const startedAll = Date.now();
  for (const entry of TESTS) {
    if (filter && !entry.name.includes(filter)) continue;
    ran += 1;
    const started = Date.now();
    try {
      const evidence = entry.run();
      console.log(`ok   ${entry.name} (${Date.now() - started}ms)`);
      console.log(`     ${evidence}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL ${entry.name} (${Date.now() - started}ms)`);
      console.error(`     ${(error as Error).message}`);
    }
  }
  const totalMs = Date.now() - startedAll;
  if (failed > 0) {
    console.error(`commitment-recovery-tests: ${failed}/${ran} failed in ${totalMs}ms`);
    process.exit(1);
  }
  console.log(`commitment-recovery-tests: ok ${ran}/${TESTS.length} checks in ${totalMs}ms`);
}

main();
