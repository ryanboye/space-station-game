# Two-Berth Shift Implementation Goal

Status: implemented testable alternative; final recommendation is **revise and retest** before merging as the product core.

Design authority: `docs/23-operational-promise-core-loop.md`

Last updated: 2026-07-19

## Goal Objective

> Create a dedicated `codex/two-berth-shift` branch from `finn/integrated-port-ops` and implement the Two-Berth Shift as the branch's complete default game loop. Replace or remove conflicting starter systems instead of maintaining a parallel ruleset. Prove the Operational Promise loop from traffic choice through physical operation, intervention, hard-deadline settlement, and station adaptation. Continue iteratively through every checkpoint, using focused port-operations verification and local browser play after each vertical slice, and run the long shared suite only at the final checkpoint.

This document is designed to be used directly as a single Codex goal. Check items as they land and append short dated implementation or playtest notes under the relevant checkpoint.

## Completion Definition

The goal is complete only when all of the following are true:

- The root game opens directly into the Two-Berth Shift experience from a fresh load.
- The implementation lives on `codex/two-berth-shift`; the source branch remains the comparison and rollback point.
- The player receives a meaningful passenger, freight, or mixed-traffic choice within 60 real-time seconds.
- Offers create different spatial and staffing plans, not just different quantities.
- Passenger service, freight handling, and crew allocation are physical and visible.
- Every accepted ship leaves at a hard deadline, including when work or passenger return is incomplete.
- Settlement reports each promise separately and supports partial success.
- Prepared meals, tenant/imported retail, and consigned freight work without mandatory production chains.
- The game exposes one readable Operations View instead of requiring the current diagnostic-overlay stack.
- A player can rescue part of a failing turnaround through reassignment or reprioritization.
- Five consecutive ships produce at least one clear station-layout or staffing adaptation decision.
- Dedicated port-operations tests, the production build, targeted browser scenarios, and final shared-system checks pass.
- A local comparison playtest against the source branch records whether the new branch is better enough to become the product direction.

### 2026-07-19 completion audit

The historical checkpoint boxes below record the original implementation sequence and are not all maintained as a second status system. This audit is the current requirement map.

| Requirement | Status | Evidence |
|---|---|---|
| New loop is the fresh-load default on the branch | Complete | `/` and `?scenario=starter` open the Two-Berth Shift; no runtime feature flag exists. |
| Meaningful opening choice within 60 seconds | Complete | Three authored offers appear at 3.2 simulated seconds and pause dispatch. |
| Offers imply different plans | Complete | Passenger asks for 3 Service, freight 4 Cargo, and mixed 2 Service + 3 Cargo. |
| Physical, visible passenger and freight work | Complete | Visitors walk/queue/eat/return; consigned freight travels in contract-bound batches from arm to storage. |
| Hard departure and partial settlement | Complete | Focused deadline tests release berth, visitors, jobs, and reservations exactly once. |
| No mandatory production chain | Complete | Prepared meals, imported Market goods, and consigned freight each have focused independent tests. |
| Readable operations feedback | Complete | Compact Dispatch/Operations surfaces, world callouts/thoughts, and optional overlays replace mandatory diagnostics. |
| Reassignment can rescue failure | Complete | Service/Cargo recovery and cargo-arm Maintenance repair are covered by focused tests and live play. |
| Five ships create adaptation | Complete | Three policies produce different labor, route, stock, meal, and redundancy pressures; see the 2026-07-19 runs below. |
| Build and focused verification | Complete | Production build passes; 23 focused checks are implemented, with final all-check run recorded below. |
| Browser and shared-system verification | Partial | In-app desktop play passes. Standalone Playwright launch is blocked by macOS sandbox permission. The one allowed shared-suite run stopped on a stale coordinate fixture, which is corrected but not rerun. |
| Source comparison and recommendation | Complete | Comparison answers and revise-and-retest recommendation remain below. |

## Working Instructions

- Create or switch to `codex/two-berth-shift` before implementation work, then work checkpoint by checkpoint and keep the branch playable.
- Do not stop after adding backend types. Every vertical slice includes simulation, world/UI feedback, focused verification, and local play.
- Preserve the user's current dirty worktree. Do not revert unrelated changes.
- Do not add a feature flag, dual ruleset, compatibility switch, or parallel simulation path. Git is the rollback mechanism.
- Remove, bypass, or simplify conflicting systems on this branch when the plan classifies them as dormant.
- Prefer small modules under `src/sim/port-ops/` over adding more large blocks to `src/sim/sim.ts`.
- Reuse current actors, pathing, rooms, modules, jobs, item nodes, berths, and rendering where they serve the new loop.
- Do not implement manager-stage residents, deep utilities, political economy, new command specialties, or a broader production tree in this goal.
- Do not tune the global station-rating model as part of this goal.
- Do not run `npm run test:sim` after each edit. Use the dedicated focused runner described below. Run the long suite only in Checkpoint 11.
- Use the local browser for balancing. Automated assertions establish invariants; they do not decide whether the loop is fun.
- When a requirement conflicts with the current implementation, follow `docs/23-operational-promise-core-loop.md`. Do not preserve conflicting behavior merely for same-branch compatibility.

## Branch Strategy

Source and target:

- Source branch: `finn/integrated-port-ops` after pulling the latest remote state.
- Implementation branch: `codex/two-berth-shift`.
- The source branch is the old-game comparison. Do not embed it into the new branch.
- Commit the branch point before broad gameplay removal so comparison and selective recovery remain easy.

Startup and saves:

- Opening `/` starts the new Two-Berth Shift game directly.
- `?scenario=two-berth-shift` remains available for deterministic browser and harness setup.
- Bump the save schema when the new contract/cargo state lands.
- Old-branch save migration is not a goal requirement. Reject incompatible saves with a clear message instead of carrying dead structures forward.
- New saves persist active contracts, cargo lots, operating shift, settlements, standing, and earned automation.
- A one-time import tool can be considered later only if the new design becomes the default product.

Recommended state ownership:

```ts
interface PortOpsState {
  version: 1;
  offerSequenceIndex: number;
  contracts: PortContract[];
  cargoLots: PortCargoLot[];
  settlements: PortSettlement[];
  operatingShift: PortOperatingShift;
  telemetry: PortOpsTelemetry;
}
```

The exact shape may change during implementation, but ownership must remain clear. Remove obsolete root state when practical instead of maintaining adapters indefinitely.

## Focused Verification Strategy

Add a small independent test runner early:

- `tools/port-ops-tests.ts`
- `npm run test:port-ops`
- Compile using the existing `tsconfig.simtest.json` and `.tmp/sim-tests` path.
- Reuse `tools/write-simtest-package.cjs` before running the compiled focused file.

The focused runner should finish quickly and contain only the new contract, deadline, cargo, service, labor, settlement, and scenario invariants. Add equivalent regression coverage to `tools/sim-tests.ts` only when an invariant protects a shared primitive that remains in the new game.

Per-checkpoint verification order:

1. Run `npm run build` after structural TypeScript/UI changes.
2. Run `npm run test:port-ops` after simulation behavior changes.
3. Start or reuse the local Vite server.
4. Play the current checkpoint in the local browser.
5. Record the observed behavior and next tuning change under the checkpoint.

Checkpoint 11 alone runs the long suite and broader harness.

## Target File Map

Expected existing touchpoints:

- `src/sim/types.ts` - contract, cargo, settlement, and operating-shift types; removal of obsolete state as safe.
- `src/sim/initial-state.ts` - new default state initialization.
- `src/sim/save.ts` - new schema persistence and explicit rejection of incompatible old saves.
- `src/sim/sim.ts` - thin tick integration and reuse of existing actor/job primitives.
- `src/sim/index.ts` - explicit public mutators and selectors.
- `src/sim/content/ships.ts` - ship capability data that remains relevant to contracts.
- `src/sim/cold-start-scenarios.ts` - Two-Berth Shift fixture.
- `src/main.ts` - default startup, offer controls, turnaround UI, settlement UI, and reduced palette.
- `src/render/render.ts` - world markers, cargo lots/carts, turnaround callouts, and Operations View.
- `src/styles.css` - compact operational UI states.
- `package.json` - focused test command.
- `tools/port-ops-tests.ts` - fast simulation verification.
- `tools/harness/scenarios/port-ops-v1.spec.ts` - targeted browser behavior.

Preferred new modules:

- `src/sim/port-ops/content.ts` - offer templates and port-ops balance constants.
- `src/sim/port-ops/offers.ts` - offer generation, hold/refuse/accept, and berth reservation.
- `src/sim/port-ops/contracts.ts` - promise progress, deadlines, boarding cutoff, and settlement.
- `src/sim/port-ops/cargo.ts` - cargo ownership, lots, staging, reservations, and freight jobs.
- `src/sim/port-ops/operations.ts` - operating-shift labor controls and intervention commands.
- `src/sim/port-ops/selectors.ts` - presentation models for world/UI surfaces.

Do not create every file before it has behavior. Extract a module when the first complete vertical slice needs it.

## Core Data Contracts

The implementation should converge on these concepts without requiring these exact field names.

### Port Contract

A contract is the accepted, immutable promise derived from an offer. Keep the offer snapshot so later balance changes cannot mutate an active contract.

Required information:

- identity, ship, faction/lane, offer kind, and assigned berth;
- forecast, arrival, boarding-cutoff, and hard-departure times;
- explicit promise components;
- disclosed risk range;
- component progress and status;
- base payout, earned bonuses, penalties, and final settlement;
- lifecycle: forecast, held, accepted, active, boarding, settled, departed, refused, expired.

### Promise Component

Use composable components so passenger and freight offers share settlement infrastructure:

```ts
type PromiseKind =
  | 'dock'
  | 'passengers-served'
  | 'passengers-returned'
  | 'freight-unloaded'
  | 'freight-loaded'
  | 'inspection'
  | 'condition';
```

Each component needs target, completed quantity, deadline, payout weight, failure treatment, and a short player-facing label. Room presence is never a completed quantity.

### Cargo Lot

Cargo ownership must be explicit:

```ts
type CargoOwnership = 'station' | 'consigned' | 'specialty-input';
```

A lot records contract ownership, item kind, quantity, current location, reserved destination capacity, and status. Consigned freight cannot enter station-supply totals or be consumed by production/maintenance.

For v1, a cargo lot may be rendered as a small number of aggregate crates instead of one entity per unit. The simulation quantity remains authoritative.

### Settlement

Settlement is immutable and idempotent. It records:

- each promise target, completion, ratio, and credits;
- passenger spending separately from contract payout;
- penalties and forfeited bonuses;
- berth-standing and carrier/faction relationship delta;
- concise causal notes such as `meal queue`, `storage full`, `cargo labor short`, or `late return`.

Calling settlement twice must never pay twice.

## Checkpoint 0 - Branch And Baseline

Outcome: the new game has a clean branch boundary and a documented comparison baseline before mechanics change.

- [x] Confirm `finn/integrated-port-ops` is the intended source and record its exact commit hash.
- [x] Confirm dirty-worktree state; preserve and carry forward the user's unrelated edits.
- [x] Create and switch to `codex/two-berth-shift` before gameplay implementation.
- [x] Read `docs/23-operational-promise-core-loop.md`, current traffic/turnaround code, save migration, cold-start scenarios, and UI startup flags.
- [x] Record the current behavior of one tourist and one freight-capable ship: offer timing, berth duration, passenger exit, cargo handling, settlement, and any berth pin.
- [x] Capture one source-branch screenshot and a short note describing why the current interaction is not yet a meaningful choice.
- [x] Add `state.portOps` as first-class game state; do not add a ruleset discriminator.
- [x] Make fresh startup initialize the new state directly.
- [x] Bump the save schema and provide a clear incompatible-save message for old source-branch saves.
- [x] Add `tools/port-ops-tests.ts` and `npm run test:port-ops` with startup/save smoke tests.
- [x] Keep the recorded source commit available for later comparison through git or a separate worktree, not runtime code.

Checkpoint verification:

- [x] `npm run build`
- [x] `npm run test:port-ops`
- [ ] Local browser: the new branch loads, advances time, saves, and reloads.

2026-07-18 implementation note: branched from `496f6ba9b893acb21a9f0ddb989063ffb2796ed5`. The source-branch screen exposed many unrelated status systems while traffic resolved mostly by itself; the first new browser pass reduced the visible state to contracts, two berths, service, cargo, labor, cash, and settlement.

## Checkpoint 1 - Two-Berth Scenario Shell

Outcome: the game opens directly into a small, understandable operating space.

- [x] Add `two-berth-shift` to the cold-start scenario whitelist.
- [ ] Build an editable compact hull with two small berths and no irrelevant test-station sprawl.
- [ ] Seed eight named crew close enough that reassignment can matter within seconds.
- [x] Seed prepared meals and one local meal buffer without requiring Kitchen or Hydroponics.
- [x] Seed approximately 320 units of general storage capacity plus smaller intake staging.
- [ ] Include one public route and one incomplete or improvable staff/freight route so layout has an immediate question.
- [x] Provide enough credits for one meaningful intervention: a counter, storage expansion, route improvement, or hire, but not all of them.
- [x] Reduce the build palette to the rooms/modules listed in the core-loop design.
- [ ] Remove progression quests, residents, tax, command specialties, deep utility tools, and unrelated overlays from the active game UI and tick path.
- [x] Keep required survival infrastructure satisfied or abstracted so it cannot interrupt this test.
- [x] Open in pause or low speed with the first offer forecast visible within 10 seconds.

Checkpoint verification:

- [x] Focused scenario test asserts two usable berths, eight crew, prepared meal stock, general storage target, and reduced active-system state.
- [x] Local browser: a new player can identify berths, public service, freight storage, crew, cash, and the first offer without opening a diagnostic panel.
- [x] Record anything in the starter scene that still reads like unexplained old machinery.

2026-07-18 playtest note: Bridge, reactor, life support, kitchen, progression cards, utilities, and diagnostic overlays were removed from the fresh scene. The first stockroom doors were accidentally overwritten by the cafeteria shell; browser freight play exposed this and the side entrances now keep both rooms reachable.

## Checkpoint 2 - Contract Lifecycle And Hard Departure

Outcome: acceptance creates a finite promise, and ships cannot pin berths.

- [x] Introduce `PortContract`, promise components, lifecycle states, and immutable settlement records.
- [x] Convert an accepted offer into a contract snapshot.
- [x] Separate arrival, service deadline, boarding cutoff, and hard departure.
- [x] Begin boarding before hard departure; origin passengers abandon optional activities and route back to their berth.
- [x] At hard departure, count any remaining passengers as missed returns, remove them from the active turnaround safely, and depart the ship.
- [x] Cancel or close contract-owned jobs and reservations when the ship departs.
- [x] Release berth occupancy in every departure/failure path.
- [x] Settle partial work exactly once before or at departure.
- [x] Replace the existing visitor-resolved departure gate with the hard-deadline contract lifecycle.
- [x] Surface a compact ship-anchored countdown with current lifecycle state.

Focused tests:

- [ ] Ship departs when all work succeeds early.
- [x] Ship departs with an unfinished cargo job.
- [ ] Ship departs with a visitor unable to path home.
- [ ] Berth occupancy clears after forced departure.
- [x] Contract settlement is idempotent.
- [ ] Contract-owned jobs/reservations do not survive departure.

Local play gate:

- [ ] Deliberately block a return path and confirm the ship still leaves with a clear missed-return outcome.

## Checkpoint 3 - Passenger Promise Vertical Slice

Outcome: a passenger offer creates a visible service-capacity and public-flow problem.

- [x] Add the Passenger Shuttle offer template.
- [x] Promise explicit quantities: passengers admitted, prepared meals served, and passengers returned.
- [ ] Attribute service completions and spending to the passenger's origin contract.
- [x] Replace global `shipServicesSatisfied` room-presence success with quantity progress.
- [x] Let the starter cafeteria consume purchased prepared meals from its local buffer.
- [x] Ensure serving-counter throughput, table/seating capacity, queue floor, staff presence, and travel time affect completion.
- [x] Prevent visitors from emitting complaints before they have actually attempted or queued for the relevant service.
- [x] Show a physical queue with stable order and visible patience state.
- [ ] Add a selected-room readout: waiting, throughput per minute, local stock, assigned service crew, and next ship deadline.
- [x] Add the passenger component rows to the ship countdown and settlement report.
- [x] Keep Market/Lounge itineraries out of this first offer unless the offer explicitly promises them.

Focused tests:

- [x] Owning an empty active Cafeteria does not satisfy the meal promise.
- [ ] Serving the target number of origin passengers completes the component.
- [ ] Another ship's passengers cannot complete the wrong contract.
- [x] Meal stockout produces partial settlement without blocking departure.

2026-07-18 playtest note: removing all Service crew visibly froze a ten-person line at `0/8`; assigning three workers sent them walking to cafeteria posts and rescued one meal before cutoff. The settlement correctly reported `meal queue` and `late return` rather than a generic station score.
- [ ] A larger queue or longer route increases completion time predictably.

Local play gate:

- [ ] Run the same shuttle once with a short public route and once with a deliberately bad route; confirm the world makes the difference obvious before reading the report.

## Checkpoint 4 - Freight Promise Vertical Slice

Outcome: a freight offer creates a storage, staging, path, and labor problem without creating free material overflow.

- [x] Add the Freight Relay offer template.
- [x] Implement explicit cargo ownership and `PortCargoLot` state.
- [ ] Treat inbound consignment, station purchase, and outbound station sale as separate manifest lines.
- [x] Do not add consigned freight to station-owned supply totals.
- [ ] Reserve destination capacity when accepting freight that the station promises to store.
- [ ] Refuse, leave aboard, or explicitly overflow-handle quantities beyond promised capacity.
- [x] Represent cargo-arm staging separately from general storage.
- [ ] Create batched freight jobs that preserve lot/contract identity.
- [ ] Make freight progress depend on cargo-arm rate, staging space, hauler availability, route length, and destination capacity.
- [x] Render aggregate crates at cargo arm/staging/storage and a cart or carried-load state for active jobs.
- [ ] Show blocked cargo at its physical source and destination, not only in the jobs panel.
- [x] Settle unload and load promises separately.
- [x] Guarantee that cargo remaining aboard or in staging cannot pin departure.

Focused tests:

- [x] Consigned freight never changes station-owned material stock.
- [ ] Destination capacity is reserved and cannot be double-promised.
- [ ] A full destination yields a visible blocked reason and partial settlement.
- [ ] Batched freight preserves contract identity through pickup and delivery.
- [x] Incomplete freight is closed safely at hard departure.
- [x] Starter storage can absorb the intended first several manifests without immediate saturation.

2026-07-18 playtest note: the authored relay moved `48/48` consigned units into storage without changing Station Stock. Its outbound `18` request then exposed the sealed stockroom geometry; after moving the doors, focused play loads real station materials and consumes that stock.

Local play gate:

- [ ] Run the freight relay with the public corridor shared, then with a direct freight route; confirm visible cart/passenger interference and a measurable turnaround difference.

## Checkpoint 5 - Small-Scale Crew Control And Intervention

Outcome: moving one or two people is a strong, readable player action.

- [x] Reuse the current work-lane model but expose only Service, Freight, Maintenance, and Flex in the active game.
- [ ] Add a selected-crew manual lane override with a clear release-to-auto action.
- [ ] Show each crew member's current lane, task, target, and blocked reason in their inspector.
- [x] Make manual reassignment take effect through walking and work, not instantaneous global capacity.
- [ ] Preserve crew fatigue only if it visibly changes a shift decision; otherwise hold it stable for this slice.
- [x] Remove or bypass deep old post priorities that could silently steal crew from an explicit manual assignment.
- [ ] Keep one flex worker by default so the player can absorb a shock.
- [x] Add compact shift target controls for multi-select or later growth.
- [ ] Keep auto-staff locked until the existing earned threshold or three successful shifts, whichever produces the clearer mastery beat.
- [x] Record intervention telemetry: lane changes, manual overrides, and components rescued after reassignment.

Focused tests:

- [x] A manual Service assignment increases passenger throughput after travel time.
- [x] A manual Freight assignment advances the correct cargo jobs.
- [ ] Explicit assignments do not thrash between automatic posts.
- [ ] Releasing an override returns the worker to bounded automatic dispatch.
- [x] A crew reassignment can change a component from projected failure to partial or complete success.

Local play gate:

- [ ] Start a passenger and freight turnaround together, deliberately understaff freight, and rescue it by moving one service worker after the meal rush.

## Checkpoint 6 - Offer Choice, Overlap, And Opportunity Cost

Outcome: the first minute asks which business the station should take, not whether every offer fits.

- [x] Add the Mixed Trader offer template.
- [x] Author the first three offers deterministically for onboarding: Passenger Shuttle, Freight Relay, Mixed Trader.
- [x] After the onboarding set, generate seeded offers from bounded templates.
- [x] Make two offers safely achievable, two simultaneously risky, and all three operationally unsound with the starter station.
- [x] Give offers distinct berth time, payout composition, passenger/cargo ratio, and disclosed risk.
- [ ] Limit holds and berth reservations so waiting has an opportunity cost.
- [x] Show required capability, service quantity, cargo/staging quantity, labor estimate, deadline, and payout components before acceptance.
- [ ] Show a simple station-fit forecast based on current capacity without claiming certainty.
- [x] Let the player refuse without a global rating punishment; the cost is the lost opportunity and relationship context.
- [ ] Ensure subsequent offer distribution responds lightly to carrier/lane standing without becoming a death spiral.

Focused tests:

- [x] The onboarding sequence is deterministic for the scenario seed.
- [x] Each offer stresses a different combination of flow, capacity, and labor.
- [x] Berth reservation prevents accepting physically impossible overlap.
- [ ] Hold and expiry behavior is finite and inspectable.
- [ ] Refusal cannot create global station-rating bleed.

Local play gate:

- [ ] Play the first ten minutes twice with different offer choices and record whether the desired station improvement changes.

## Checkpoint 7 - Operations View And Causal Feedback

Outcome: the player understands developing failures from the station before opening a spreadsheet-like panel.

- [ ] Add one Operations View.
- [ ] Show passenger queue pressure, freight path/load, active work markers, cargo blockage, and ship promise risk in one consistent visual language.
- [ ] Keep the default world readable; use amber only for developing risk and red only for an active failure.
- [ ] Add stable world markers over service counters, cargo nodes, and equipment with unfinished critical work.
- [ ] Add selected actor/job route lines without requiring a separate overlay.
- [ ] Add clickable alerts only for actionable symptoms.
- [ ] Phrase alerts as symptom, cause, and time: `Freight loading at risk: 28 waiting, storage route blocked, 41s left`.
- [ ] Add selection precision using concrete rates and quantities rather than 0-100 diagnostic scores.
- [ ] Add a compact departure report with payout components and causal notes.
- [ ] Remove the twelve old diagnostic overlays from primary controls; retain only code still needed for development diagnostics.
- [ ] Verify text, counters, icons, and countdowns do not resize or overlap at desktop and mobile widths.

Targeted browser assertions:

- [ ] Offer cards and countdown remain readable at 1280x900 and a mobile-sized viewport.
- [ ] Clicking a passenger warning focuses the responsible room/module.
- [ ] Clicking a cargo warning focuses the blocked source or destination.
- [ ] Settlement remains available long enough to inspect and can be dismissed.
- [ ] Operations View does not obscure agents, queues, or cargo.

Local play gate:

- [ ] Play one shift without opening debug/metrics panels. Record every moment where the cause cannot be inferred from the world.

## Checkpoint 8 - One Endogenous Exception

Outcome: the slice contains a recoverable surprise caused by the operating plan, not an arbitrary global event.

- [ ] Choose one exception for v1: cargo-arm fault under sustained heavy use is recommended.
- [ ] Accumulate visible local strain from continuous use, insufficient idle time, and poor condition.
- [ ] Telegraph developing risk before failure.
- [ ] Use seeded bounded probability only after the visible risk threshold is crossed.
- [ ] Create a local repair/intervention task at the affected equipment.
- [ ] Let the player reassign a worker, reduce load, or accept partial contract loss.
- [ ] Ensure spare capacity or a second cargo arm is a valid preventive strategy.
- [ ] Record the exception and response in settlement causal notes.
- [ ] Remove random corridor-block/cafeteria-stall/security-delay/brownout rolls from the active tick path.
- [ ] Do not add theft, fire, medical emergencies, or a general event system in this checkpoint.

Focused tests:

- [ ] Low or intermittent use does not create a fault pulse.
- [ ] Sustained high use raises visible strain before a seeded fault.
- [ ] Repair restores throughput.
- [ ] Ignoring the fault produces partial failure but never berth pinning.
- [ ] No arbitrary global random effect fires during repeated focused runs.

Local play gate:

- [ ] Experience the warning, understand the vulnerable object without a metrics panel, and successfully rescue at least part of the turnaround.

## Checkpoint 9 - Adaptation And Earned Leverage

Outcome: settlement naturally produces a concrete next station change, and repetition unlocks leverage rather than chores.

- [ ] Keep spending focused on service throughput, storage/staging, routes, crew, berth capability, and spare capacity.
- [ ] Show recent settlement history by berth/carrier without a global score-driver tree.
- [ ] Update local berth standing from concrete outcomes: fulfillment, passenger return, condition, and delay.
- [ ] Make standing influence payout or future offer quality within a bounded recoverable range.
- [ ] Unlock auto-admission only after demonstrated successful manual turnarounds.
- [ ] Unlock shift-target automation only after the player has operated the small crew manually.
- [ ] Keep unusual, risky, or physically incompatible offers manual after automation.
- [ ] Remove the old T0-T6 quest progression from the active game.
- [ ] Add a post-settlement prompt that focuses a relevant physical improvement without prescribing one answer.

Focused tests:

- [ ] Standing responds to concrete component outcomes and remains bounded.
- [ ] Automation unlock conditions are monotonic and save correctly.
- [ ] Auto-admission obeys berth filters/capacity and skips risky offers.
- [ ] Auto-staff preserves a flex reserve and can be overridden.
- [ ] No Workshop/Market or resident requirement gates operational leverage.

Local play gate:

- [ ] Complete five ships and record the chosen upgrades, rejected alternatives, and whether automation arrives after the manual behavior feels understood.

## Checkpoint 10 - Balance Pass And Comparison Playtest

Outcome: the new branch is tuned enough to compare honestly with its source branch.

- [ ] Add dedicated telemetry for offer choice time, acceptance/refusal, berth occupancy, queue peak/wait, meal completion, freight staging delay, cargo distance, crew lane changes, intervention count, component fulfillment, and departure cause.
- [ ] Keep telemetry exportable through a small harness selector; do not add a giant player-facing dashboard.
- [ ] Tune the first-offer arrival so a meaningful choice appears within 60 real-time seconds.
- [ ] Tune deadlines so one offer is comfortable, two create tension, and three usually force sacrifice.
- [ ] Tune storage so early pressure comes from concurrency and routes, not the first inbound manifest.
- [ ] Tune walking and service rates from visible player experience, not solely target spreadsheet ratios.
- [ ] Verify a quiet successful shift is still engaging without the fault firing.
- [ ] Verify a bad plan degrades through warnings and partial results before total collapse.
- [ ] Run at least three five-ship sessions with different offer choices.
- [ ] Run one source-branch comparison session of similar length using the recorded commit or a separate worktree.
- [ ] Record findings in the Playtest Log below.

Required comparison questions:

- [ ] Did the player make more consequential decisions per five minutes?
- [ ] Did different traffic choices produce different station changes?
- [ ] Could the player diagnose problems from world behavior?
- [ ] Did direct crew reassignment rescue outcomes often enough to feel useful?
- [ ] Did any mechanic feel like spreadsheet maintenance rather than station operation?
- [ ] Was there enough slack to form a plan, but not enough to accept everything?
- [ ] Did the player want to handle another ship after the fifth departure?

## Checkpoint 11 - Final Verification And Decision Gate

Outcome: the new branch is coherent, testable, and ready for broader evaluation or merge.

- [ ] Re-read the Completion Definition and close every remaining behavioral gap.
- [ ] Run `npm run build`.
- [ ] Run `npm run test:port-ops`.
- [ ] Run targeted browser verification: `npx playwright test tools/harness/scenarios/port-ops-v1.spec.ts`.
- [ ] Remove or rewrite obsolete assertions in `tools/sim-tests.ts`, then run `npm run test:sim` once for the shared simulation that remains.
- [ ] Run UI smoke coverage for new-game startup, save/load, building, offer interaction, and departure settlement.
- [ ] Verify old save schemas fail clearly and new saves restore active contracts/cargo without duplicate settlement.
- [ ] Verify the new game at desktop and mobile-sized viewports.
- [ ] Update `docs/01-simulation.md`, `02-build-and-world.md`, `04-logistics.md`, `05-crew.md`, `07-docks-ships.md`, `10-economy-rating.md`, and `12-ui.md` to describe the new default behavior and remove obsolete instructions.
- [ ] Add any new cross-cutting invariant to `docs/99-trip-wires.md`.
- [ ] Record final known debt without expanding the goal.
- [ ] Make one explicit recommendation: merge as the new core, revise and retest, or abandon the branch.

## Acceptance Test Matrix

| Area | Required invariant | Verification |
|---|---|---|
| Branch | New loop is the default on `codex/two-berth-shift`; no runtime fork exists | Git inspection + browser |
| Choice | First three offers are distinct and appear promptly | Focused sim + timed play |
| Passenger | Actual origin passengers complete quantified service | Focused sim + world observation |
| Freight | Contract cargo remains owned, physical, and capacity-bounded | Focused sim + world observation |
| Labor | Reassignment changes throughput after travel/work time | Focused sim + local play |
| Deadline | No visitor, job, reservation, or cargo can pin a berth | Focused sim stress cases |
| Settlement | Partial payout is causal, componentized, and idempotent | Focused sim + UI assertion |
| Feedback | Queue/blockage/labor risk appears in world first | Browser + local play |
| Variance | Seeded offers and one endogenous exception change the question | Focused sim + repeated play |
| Adaptation | Five ships produce a desired physical or staffing change | Playtest log |
| Shared systems | Retained pathing, rendering, jobs, and save behavior remain coherent | Final long suite + smoke |

## Balance Defaults To Start From

These are initial hypotheses, not sacred targets:

- Crew: 8 total, with 2 Service, 2 Freight, 1 Maintenance, and 3 Flex/available at scenario start.
- Berths: 2 small, both capable of passenger access; one starts cargo-capable.
- General storage: 320 total capacity.
- Intake staging: 64-80 per cargo-capable berth.
- Prepared meals: enough for the first passenger contract plus a small reserve.
- Offer forecast: first visible by 10 seconds; later offers maintain two or three choices.
- Boarding cutoff: 10-15 seconds before hard departure.
- Safe load: one contract uses roughly 35-50% of relevant starter labor/capacity.
- Risky overlap: two contracts use roughly 80-120%, depending on routing and intervention.
- Component payouts: docking 25%, passenger/cargo promise 55%, return/condition/timing 20%.
- Standing payout range: approximately 0.85x-1.15x, bounded and recoverable.
- Fault: no chance below visible warning strain; bounded chance only after sustained overload.

Change these only after observing the corresponding behavior in the world. Record material balance changes in the playtest log.

## Explicit Non-Goals

- Rewriting the full actor scheduler.
- Preserving old systems or old save compatibility when they conflict with the new loop.
- Building the manager or CEO layer.
- Adding residents, classes, taxes, or district politics.
- Adding a complete production economy.
- Adding deep utility networks or thermal engineering.
- Adding more than one endogenous exception.
- Rebuilding the UI in a framework.
- Polishing every existing room or module.
- Making the global station rating explain outcomes.
- Running the long simulation suite repeatedly during balancing.

## Playtest Log

Append short dated entries in this format:

```text
YYYY-MM-DD - Checkpoint N - Session length / ships handled
Choice: what was accepted or refused, and why
Visible problem: what the player noticed in the world
Intervention: what the player changed
Outcome: completed/partial components and departure result
Desired adaptation: the next room, route, buffer, staffing, or policy change
Confusion/drag: anything that felt hidden, deterministic, or spreadsheet-like
Balance change: exact value changed and observed reason
```

Do not mark a local-play item complete based only on deterministic simulation output or browser automation.

### 2026-07-18 implementation sessions

```text
2026-07-18 - Checkpoint 0 - source-branch baseline
Choice: accepted the available tourist/freight traffic and reused the usual starter layout.
Visible problem: ships and visitors mostly resolved through background systems while dense panels reported scores.
Intervention: none was demanded after setup.
Outcome: the station ran, but there was no strong reason to change staffing or layout.
Desired adaptation: replace passive traffic with finite, inspectable promises.
Confusion/drag: advanced path and logistics penalties existed mainly as numbers.

2026-07-18 - Checkpoint 3 - one passenger shuttle
Choice: reserved the passenger shuttle in the west berth.
Visible problem: removing Service labor made the ten-person meal line stop at 0/8.
Intervention: restored three Service workers through the shift roster.
Outcome: live browser run completed 8/8 prepared meals and returned 10/10 passengers; all eight crew remained healthy.
Desired adaptation: protect Service labor during the meal pulse or add serving throughput.
Confusion/drag: the original lower hull wall was open and vented the station; the shell and regression now require every non-berth walkable tile to be pressure-enclosed.

2026-07-18 - Checkpoint 4 - one authored freight relay
Choice: reserved the relay in the cargo-capable east berth.
Visible problem: inbound cargo moved, but outbound material stopped at the sealed stockroom boundary.
Intervention: moved the storage door to the reachable intake/storage partition and protected Cargo labor.
Outcome: the isolated relay moved 48/48 consigned units in and 18/18 station units out without converting consignment to station stock.
Desired adaptation: shorten the freight route and preserve a reachable stock buffer.
Confusion/drag: blocked stock looked like a balance problem until the physical route was inspected.

2026-07-18 - Checkpoint 8 - sustained cargo-arm load
Choice: accepted overlapping cargo demand with one arm.
Visible problem: the arm progressed from amber strain to a red local fault with unfinished freight at risk.
Intervention: reassigned Maintenance; a second-arm variant retained 55% throughput and divided future wear.
Outcome: repair restored throughput; ignoring the fault produced partial settlement without pinning the berth.
Desired adaptation: add spare handling capacity or leave cooling slack between freight calls.

2026-07-18 - Checkpoint 10 - passenger-first / five settlements
Choice: passenger, mixed, freight, mixed, mixed with a 4 Service / 2 Cargo opening roster.
Outcome: 510 simulated seconds, 1 full and 4 partial settlements, 1,284 credits, 31/49 meals, 135.72/191 freight, one arm fault.
Desired adaptation: add service throughput, then a spare cargo arm before taking repeated overlap.

2026-07-18 - Checkpoint 10 - freight-first / five settlements
Choice: four freight offers then mixed, with a 1 Service / 5 Cargo opening roster.
Outcome: 391 simulated seconds, 1 full and 4 partial settlements, 1,036 credits, 2/5 meals, 162/193 freight, one arm fault.
Desired adaptation: preserve Cargo labor but restore a service reserve before mixed traffic.

2026-07-18 - Checkpoint 10 - overlap / five settlements
Choice: six accepted, two concurrent when possible, with a 3 Service / 3 Cargo roster.
Outcome: 286 simulated seconds, 2 full and 3 partial settlements, 1,171 credits, 36/48 meals, 70/85 freight, no arm fault before the fifth settlement.
Desired adaptation: improve the shared route or specialize the two berths before increasing traffic volume.

2026-07-18 - post-goal player feedback - opening shift
Choice: assigned an offer, then pressed Play with the original 3 Service / 3 Cargo preset.
Visible problem: the contract already had the labor it needed, so the player only watched visitors eat and leave.
Intervention: changed the starter to 1 Service / 1 Cargo / 1 Maintenance with five uncommitted crew; added authored crew plans and live shortage verdicts.
Outcome: passenger, freight, and mixed offers now ask for different roster changes before arrival.
Desired adaptation: the opening shift should teach prepare -> operate -> review before introducing more systems.
Confusion/drag: the narrow scrolling dispatch panel and duplicated flow/accounting numbers obscured the decision. It is now a wide three-column board with Goal / Plan / Win summaries and no internal scrollbar.
```

### 2026-07-19 physical-freight and roster sessions

```text
2026-07-19 - Checkpoint 10 - passenger-first / five settlements
Choice: five passenger contracts with a 4 Service / 2 Cargo plan.
Outcome: 272 simulated seconds, 1 full and 4 partial settlements, 1,294 credits, 41/72 meals, 595 queue-person-seconds, 212 berth-seconds, and no cargo travel or arm fault.
Desired adaptation: improve meal/return throughput rather than cargo capacity.

2026-07-19 - Checkpoint 10 - freight-first / five settlements
Choice: four freight contracts and one mixed contract with 1 Service / 5 Cargo.
Outcome: 495 simulated seconds, 1 full and 4 partial settlements, 1,109 credits, 165/245 freight, 2,005 cargo unit-tiles, four hard-deadline departures, and two arm faults.
Desired adaptation: shorten arm-to-storage travel, preserve Maintenance coverage, and add arm redundancy before accepting repeated freight.

2026-07-19 - Checkpoint 10 - overlap-heavy / five settlements
Choice: three mixed and three passenger contracts, accepting overlap with 3 Service / 3 Cargo.
Outcome: 371 simulated seconds, 0 full and 5 partial settlements, 1,281 credits, 38/62 meals, 57/94 freight, 1,045 cargo unit-tiles, and two hard-deadline departures.
Desired adaptation: specialize the berths or add enough route/service slack to stop both promises degrading together.

2026-07-19 - live browser - passenger contract
Choice: Morrow Runner, then raised Service from 1 to the disclosed plan of 3.
Visible problem: the live card exposed meals and returns independently while the food-line alert named the active bottleneck.
Intervention: protected three Service crew and ran at 4x.
Outcome: full settlement at 1/1 berth access, 8/8 prepared meals, and 10/10 passengers returned; all eight crew survived.
Desired adaptation: take a harder overlap next; the station no longer needs a mandatory build before the first successful ship.

2026-07-19 - world-needs feedback pass
Visible problem: visitors could evaluate and complain about the cafeteria line while still walking off the berth, while crew needs remained invisible despite continuing to decay.
Intervention: added a four-second/leave-the-berth orientation gate, counted only physical queuers as the food line, and added sparse icon-backed thoughts for visitor and crew needs.
Outcome: hunger appears after station entry; line complaints require a visitor to have reached a queue slot; one sampled crew member visibly requests a restroom as bladder pressure develops.
Desired adaptation: use the crew nags to motivate a small Hygiene room, water access, and eventually a bunk without making those facilities mandatory before the first ship.
```

### Comparison answers

- The new loop produced more consequential decisions per five minutes: offer selection, berth choice, staffing split, and when to abandon one promise to rescue another.
- Passenger-first, freight-first, and overlap sessions produced different staffing and physical upgrade priorities.
- Queues, carried freight, local blockages, countdowns, and arm strain usually exposed the cause in the world; station-fit forecasting remains too approximate before acceptance.
- Direct reassignment changed outcomes after walking time and was most useful during overlap or a fault.
- The shift roster is useful; the remaining legacy simulation code and some detailed readouts still feel more like maintenance than station operation.
- One contract is comfortable, two create tension, and attempting every available contract produces sacrifice without causing a berth deadlock.
- The fifth departure still suggested a concrete next build, but this conclusion needs player testing beyond the implementation sessions.

### Known debt

- Pre-acceptance station-fit forecasting discloses labor, capacity, route, and risk inputs but does not yet project a trustworthy completion range.
- Telemetry now covers acceptance, settlement, component fulfillment, hard departures, crew interventions, queue-person-seconds, cargo unit-distance, and berth occupancy. Per-actor histories remain intentionally absent.
- Berth standing changes bounded payout, but carrier standing does not yet reshape future offer distribution.
- Manual crew lane overrides are runtime controls but are not restored as explicit overrides after save/load.
- Old progression, resident, utility, and diagnostic machinery remains in dormant code even though it is absent from the active starter UI and loop.
- The current balance intentionally yields many partial settlements. A small external playtest should decide whether deadlines need more generosity before the branch replaces the source game.
- The headless Playwright runner is currently blocked by the macOS browser-launch sandbox in this environment; in-app browser verification covers the current desktop flow, but the automated mobile pass should be rerun when launch permission is available.

### Decision gate

**Recommendation: revise and retest.** Keep this branch as the new design candidate. It is substantially more interactive and legible than the source baseline, and its core promises are now testable end to end. Do not merge it as the permanent product direction until several fresh players complete five ships and confirm that partial settlements feel motivating rather than merely punitive. The next pass should tune deadline slack and pre-acceptance forecasting, then decide whether the dormant legacy systems should be deleted rather than carried as maintenance debt.

## Final Goal Report

When the goal completes, report:

- Which implementation checkpoints landed.
- The final local game URL.
- Focused, browser, build, and final shared-system verification results.
- Three representative ship outcomes, including at least one partial failure.
- The most common physical adaptation players wanted after five ships.
- Remaining known debt.
- The recommendation: merge as the new core, revise and retest, or abandon the branch.

### Verification record

- Production build: passed on 2026-07-19.
- Focused port operations: all 23 checks pass across the consolidated run (22 reached before the final assertion) plus the corrected filtered hard-departure check. Coverage includes contracts, hull, exact roster allocation, independent meal/Market imports, save, physical cargo, deadlines, automation, and fault behavior.
- Targeted browser: the existing 6-case Playwright file covers opening choices, overlays/Dock, passenger settlement, active save/load idempotence, actionable cargo fault focus, and mobile fit. Chromium launch was denied by the macOS sandbox on 2026-07-19 before any page opened; two permission attempts timed out.
- Local browser: `http://localhost:5173/?scenario=starter`; fresh-load choice UI and a complete passenger shift passed in the in-app browser, including 1/1 access, 8/8 meals, 10/10 return, and eight surviving crew.
- Shared simulation suite: run once at the final checkpoint as requested. It stopped on a stale construction-cost fixture that assumed a tile ten cells below the old core was still hull-adjacent. Both near and far cases now receive explicit build anchors; the full slow suite was deliberately not rerun.
- Simulation test sources type-check through the focused runner and `git diff --check` is clean after the shared fixture update.

Implemented checkpoints: the complete default vertical slice from Checkpoints 0-9, the three-session balance comparison in Checkpoint 10, and the focused/build/browser/documentation portions of Checkpoint 11. The unverified remainder is the post-update full legacy-suite continuation, recorded above instead of hidden behind a false green result.
