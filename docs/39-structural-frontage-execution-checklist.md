# Structural Frontage And Occupant Loop Execution Checklist

Status: active execution ledger.

Design authority:

- `38-structural-frontage-visit-flow-implementation-plan.md`
- `SPEC-OCCUPANT-LOOP.md`
- `37-station-portfolio-program/`
- existing system contracts linked from `docs/README.md`

This file is the auditable definition of done. Check a box only after the
behavior exists in the game and the listed evidence has been recorded. Code that
compiles is not sufficient for player-facing work.

## Checklist Rules

- [ ] Every completed item names a commit or changed files in its evidence note.
- [ ] Every simulation item has a focused deterministic check.
- [ ] Every visual item has an inspected screenshot or live-browser observation.
- [ ] Every gameplay item is tested in a deliberately bad layout and an improved
  layout.
- [ ] Full-suite tests are reserved for integration gates; use focused runners
  during iteration.
- [ ] Save/load is checked at each phase that adds durable state.
- [ ] Performance is measured at each phase rather than deferred to cleanup.
- [ ] Existing exactly-once settlement, topology invalidation, physical fixture
  reservations, and render/simulation separation remain intact.
- [ ] `system-flow-map.html` remains untouched unless separately requested.

## Practical Completion Order

The checklist is a product backlog, not a valid execution schedule. Remaining
items are completed through the following integrated gates. A gate gets one
active implementation owner, one deterministic showcase, one deliberately bad
comparison, one live browser inspection, and one commit. Do not begin the next
gate while the current gate still has a player-blocking defect.

### Gate A: Coherent Opening

Status: **in progress**. Comparison UI, one-path opening economy, and stored
starter attachment compatibility are complete. One integrated operating-cycle
showcase remains before this gate closes.

The player starts from a safe but commercially unfinished shell, chooses Food,
Supplies, or Ship Service, and creates the first working operation through
layout, fixtures, staffing, stock, and policy. Global Goal is the sole
north-star progression surface; business paths are choices beneath it. Legacy
tier and specialization UI must not compete with that model.

Required proof: each path can be selected from the same starter, produces a
visibly different station and revenue stream, exposes unmet demand before the
player commits, and offers at least two viable layout or operating choices.

### Gate B: Spatial Operations

Status: **in progress**. Physical market browsing, staffed checkout positions,
exclusive queues, stock truth, and measured capacity scaling are complete. The
remaining critical work is a live poor/improved layout comparison across the
opening businesses; the broader fixture catalogue is deferred.

Finish only the shared facility behaviors needed by the three opening paths:
depicted capacity, exclusive use, staff positions, physical stock movement,
queues, dirty/damaged/empty states, and local diagnosis. Add further facility
families only after these three paths survive live play.

Required proof: a poor layout fails visibly, an improved layout measurably
raises throughput, and the improvement comes from world changes rather than a
staff-count stepper or hidden modifier.

### Gate C: Player-Built Frontage And Expansion

Expose Truss, structural support, staged EVA construction, sealing, utilities,
and commissioning as one discoverable player workflow. Connect Pod Dock and
Berth frontage to approach clearance and interior throats.

Required proof: begin at the normal starter, build and commission one complete
wing, install a working interface, then observe a bad and improved passenger or
cargo route. Save and resume once during construction.

### Gate D: Charter Operating Consequences

Turn the charter into one causal forecast reused at site selection, interface
placement, and map-condition inspection: likely traffic, valuable services,
busy and sheltered faces, thermal pressure, resource economics, and available
mitigations. The forecast must predict actual simulation outcomes.

Required proof: two sites from the same seeded system produce different useful
service mixes, exterior risks, expansion choices, and measured operating
results without making either site a trap.

### Gate E: Normal-Scale Operation

Build one active benchmark with at least 50 crew, 50 simultaneous visitors,
5-10 mixed interfaces, ships in multiple phases, service queues, cargo jobs,
reservations, and approach conflicts. Profile before optimizing and change only
measured hot paths. Simulation and render budgets remain separate.

Required proof: deterministic repeat, representative workload counters, saved
raw before/after timings, smooth live movement, and no hidden reduction of work
to pass the budget.

### Gate F: Integrated Playthrough And Catalogue

Play from charter selection through a large mixed station, fixing progression,
save migration, balance, and discoverability defects encountered along the
way. After the integrated loop is sound, complete the remaining fixture,
art-state, and content catalogue in bounded families rather than parallel
one-offs.

Required proof: a preserved save, chronological playtest record, completed
global goals, all three opening businesses represented, one commissioned
expansion, one medium/large Berth operation, one damage/EVA recovery, and an
audited checklist with no unsupported checked claims.

### Execution Limits

- At most one implementation subagent may be open for this program at a time.
- A worker receives one bounded gate slice and is closed immediately after lead review.
- No full test suite during iteration; run only focused checks named by the gate.
- Stop and report after each committed gate instead of running indefinitely.
- A test fixture may prove mechanics, but only a normal-start playtest can close a gameplay gate.
- Catalogue breadth cannot delay Gates A-E unless the missing asset or fixture blocks that gate.

## Program Setup

- [x] Consolidate the structural frontage, approach, visit, crowd, exposure, and
  occupant-loop design into one implementation contract.
  Evidence: `docs/38-structural-frontage-visit-flow-implementation-plan.md`.
- [x] Incorporate Claude's occupant-loop spec from `origin/main`.
  Evidence: `docs/SPEC-OCCUPANT-LOOP.md`, commit `eed5c36`.
- [x] Establish a dedicated implementation branch.
  Evidence: `codex/structural-frontage-occupant-loop`.
- [x] Add this execution checklist to `docs/README.md`.
- [ ] Record the focused commands and artifacts used for every phase gate.
- [x] Keep a running playtest findings section at the bottom of this file.

## Non-Negotiable Design Invariants

- [ ] Frontage emerges from hull geometry, structure, construction, approach
  clearance, interior support, and exposure rather than a frontage currency.
- [ ] Poor but physically legal layouts are allowed to open and fail visibly.
- [ ] Physically impossible layouts are rejected with one actionable world-space
  explanation.
- [ ] Routine traffic never becomes a permanent manifest-reading chore.
- [ ] Early manual Approach Control remains a meaningful portfolio decision.
- [ ] Player-authored automation replaces repetitive approvals as scale grows.
- [ ] Longer stays create recurring physical demand rather than passive timers.
- [ ] Immediate consequences are visible in actors, objects, queues, and work.
- [ ] Rating and reputation summarize visible outcomes rather than replacing them.
- [ ] Every service capacity corresponds to depicted physical positions.
- [ ] No naive universal one-actor-per-tile cap is introduced.
- [ ] Congestion is physical, fair, recoverable, and deterministic.
- [ ] Expansion reuses the existing construction, logistics, EVA, utility,
  maintenance, pressure, thermal, and save systems.
- [ ] Catastrophic failure is forecastable, attributable, and mitigable.
- [ ] The intended 50-crew, 50-plus-visitor station is a baseline, not a stress
  test.

## Phase 0: Baselines And Instrumentation

### Deterministic Scenarios

- [x] Add a compact starter with two Pod Docks.
- [ ] Add a four-Pod-Dock docking finger.
- [ ] Add a medium Berth with two Gangways.
- [x] Add a bad single-door passenger terminal.
- [x] Add the same terminal with a second entrance or wider concourse.
- [x] Add a public/cargo crossing scenario.
- [x] Add a separated service-corridor comparison.
- [x] Add an overwhelmed one-checkout market.
- [x] Add a redesigned two-checkout market.
- [ ] Add short errands, shore leave, and a long repair crew in one scenario.
- [x] Add one medium mixed passenger/freight repair-tender call that uses the
  production Approach Control, Berth, transfer, cargo, service, extension,
  recall, stranding, and settlement lifecycle.
  Evidence: `mixed-berth-visit`, `tools/mixed-berth-visit-tests.ts`.
- [ ] Add reception-bypass and reception-assisted variants.
- [ ] Add a debris-facing exterior wing.
- [x] Add a scale baseline with at least 50 crew, 50 simultaneous visitors, and
  5-10 active interfaces.

### Metrics

- [ ] Record real-time ship visit duration by class.
- [x] Record concurrent ships and occupants.
- [ ] Record holding-orbit and approach-group wait.
- [ ] Record disembark and boarding duration.
- [ ] Record queue length, spill length, balks, and provider utilization.
- [ ] Record door wait and corridor congestion.
- [x] Record public/cargo conflicts.
- [ ] Record recurring need demand and fixture utilization.
- [ ] Record reception reveal and redirection time.
- [ ] Record committed future Berth, bed, service, and staff load.
- [ ] Record missed departures and stranded occupants.
- [ ] Record maintenance work, damage, and EVA time.
- [x] Record average and p95 simulation-step cost.
- [ ] Record render frame time and visible animation smoothness.

### Existing Caps Audit

- [ ] Document current queue-spill and balk limits.
- [ ] Document current occupancy/congestion cost caps.
- [ ] Document route-discomfort and walk-penalty saturation.
- [ ] Document rating-penalty caps that hide severe failure.
- [ ] Demonstrate each cap in a controlled scenario before changing it.
- [ ] Do not remove deadlock safety before movement coordination exists.

### Phase 0 Gate

- [x] One command produces the deterministic baseline report.
- [x] Bad and improved layouts show measurable differences.
- [ ] Baseline artifacts are saved for later comparison.
- [x] No full test suite is required for ordinary Phase 0 iteration.

## Phase 1A: Longer Visits And Shared Occupant Demand

### Shared Occupant Demand

- [ ] Extract or reuse the resident need lifecycle as a shared occupant-demand
  engine rather than writing a second long-visitor engine.
- [x] Preserve distinct actor identity and tenure contracts.
- [x] Add `errand` tenure.
- [x] Add `shore` tenure for shore leave.
- [x] Add `contract` tenure for contract crew.
- [x] Add `extended` tenure for extended guests.
- [x] Preserve the separate Resident actor as permanent tenure.
- [x] Give long-stay occupants regenerating hunger.
- [x] Give long-stay occupants regenerating energy/sleep demand.
- [x] Give long-stay occupants regenerating hygiene demand.
- [x] Give appropriate occupants recurring leisure/social demand.
- [x] Keep one-shot wants distinct from recurring needs.
- [x] Derive broad tenure and demand from ship purpose.
- [x] Add bounded seeded individual variation inside readable ship archetypes.
- [ ] Ensure critical needs override optional wants without target oscillation.

### Visit Lifecycle

- [x] Add `announced` phase.
- [x] Add `holding` phase.
- [x] Add `approach` phase.
- [x] Add `secure` phase.
- [x] Add `disembark` phase.
- [x] Add `visit-service` phase.
- [x] Add `recall` phase.
- [x] Add `boarding` phase.
- [x] Add `depart` phase.
- [x] Preserve exactly-once `settled` behavior.
- [x] Store earliest departure, planned departure, boarding start, hard departure,
  and extension window.
- [x] Support early departure after sustained service failure.
- [x] Support bounded extension while useful spend or work continues.
- [x] Give scheduled traffic firm windows.
- [x] Let freight wait for promised work until its explicit deadline.
  Evidence: `tools/mixed-berth-visit-tests.ts`.
- [ ] Let repair traffic remain until work completes, aborts, or is cancelled.
- [ ] Tune Pod visits toward observable minutes rather than 10-30-second churn.
- [ ] Tune traffic generation for useful concurrent occupancy.
- [x] Prevent any ship or Berth from remaining pinned after terminal resolution.

### World Feedback

- [ ] Show ship purpose and visit phase beside the physical interface.
- [ ] Show likely cohort-size and stay ranges without full itinerary disclosure.
- [x] Show recall and boarding physically.
- [x] Show early departure and extension reasons.
- [ ] Keep ship details hideable on small screens.

### Phase 1A Save And Checks

- [x] Persist tenure, recurring needs, wants, origin ship, and departure contract.
- [x] Persist durable visit phase and timing.
- [ ] Hydrate legacy visitors and residents with safe defaults.
- [x] Save/load a contract crew mid-stay.
- [x] Save/load during recall and boarding.
- [x] Verify settlement remains exactly once.
- [x] Focused check: a medium mixed call physically approaches, disembarks,
  serves a planned need, moves consigned freight, extends once, recalls,
  boards, strands missed passengers, cleans up and settles once.
  Evidence: `npm run test:mixed-berth-visit`.
- [ ] Focused check: repair crew repeatedly eats, sleeps, washes, and recreates.
- [ ] Focused check: fixed and flexible schedules behave differently.
- [ ] Focused check: concurrent visits overlap without rapid replacement.

## Phase 1B: Physical Slots, Demand Discovery, And Facility Scale

### Universal Slot Contract

- [ ] Generalize provider, fixture, seat, and queue reservations without breaking
  cafeteria behavior.
- [ ] Give every active need/want a physical slot and duration.
- [x] Prevent two actors from owning one exclusive use slot.
- [x] Make depicted table seats individually reservable.
- [x] Make bed positions individually claimable for a sleep session.
- [x] Support temporary bed claims separately from permanent home assignment.
- [ ] Make hygiene fixtures hold exclusive sessions for visible durations.
- [x] Make lounge and cantina positions hold meaningful leisure sessions.
- [ ] Release stale slots after cancellation, departure, death, save hydration, or
  provider removal.

### Market Depth

- [x] Replace unlimited one-tile Market Stall behavior with limited checkout
  throughput.
- [x] Add stocked shelf or aisle browsing positions.
- [x] Require physical inventory for positive market feedback and sales.
- [x] Add stock collection from visible shelf/display inventory.
- [x] Add a staff-side restock route.
- [x] Add a real customer queue at checkout.
- [ ] Make a second checkout produce a visible throughput improvement.
- [ ] Make shelf mix or goods category affect demand without creating a checklist.
- [x] Prevent `Great selection` feedback when no stock exists.

### Demand Discovery And Reception

- [x] Stop exposing a complete pre-rolled itinerary at spawn.
- [ ] Keep ship-level demand cues strong and learnable.
- [ ] Reveal individual wants progressively through behavior.
- [x] Add optional Reception/Customs processing slots.
- [x] Make Reception reveal some demand earlier, never all of it.
- [ ] Allow unprocessed occupants to enter and make a plausible choice.
- [ ] Bound wrong-choice behavior to a readable redirect rather than random
  wandering.
- [ ] Show the need or realization that caused redirection.
- [x] Make saturated Reception bypassable rather than a hard arrival gate.
- [ ] Demonstrate that Reception improves routing in a mixed-demand crowd.

### Large Functional Modules

- [x] Implement Checkout Bank, initial target 2x5.
- [x] Give Checkout Bank two staffed registers and two customer service slots.
- [x] Implement tileable Shelf Aisle, initial target 1x4.
- [x] Give Shelf Aisle three visible browsing positions.
- [ ] Implement Display or Cold Case, initial target 1x3.
- [x] Implement Backroom Stock Bank, initial target 2x3.
- [x] Implement Service Bar, initial target 2x5.
- [x] Give Service Bar a staff lane and four guest service positions.
- [x] Implement Bar Corner and End pieces, initial target 2x2.
- [x] Group connected bar runs into one provider system.
- [x] Implement Booth Bank, initial target 2x4.
- [x] Implement Standing Rail, initial target 1x4.
- [x] Implement Serving Line, initial target 2x5.
- [x] Implement Community Table, initial target 3x4 with eight depicted seats.
- [x] Implement Bunk Bank, initial target 2x4 with four temporary beds.
- [x] Implement Guest Cabin, initial target 3x4 with two quality beds.
- [x] Implement Arrival Desk, initial target 2x4 with two processors.
- [x] Implement Wash Bank, initial target 2x5.
- [x] Validate every footprint at actual play zoom before locking dimensions.
- [ ] Ensure each fixture has a public use face.
- [x] Ensure staffed fixtures have a staff work face.
- [ ] Ensure stocked fixtures have a delivery/service route.
- [x] Give larger fixtures greater absolute capacity and useful staffing
  efficiency.
- [ ] Charge larger fixtures through footprint, staffing, stock, utilities,
  cleaning, maintenance, and queue frontage.
- [ ] Preserve compact alternatives where irregular layouts make them useful.

### Large Fixture Artwork

- [x] Generate native-footprint low-resolution artwork after footprints stabilize.
- [x] Use transparent backgrounds and silhouettes readable at gameplay zoom.
- [x] Match sprite dimensions to simulation footprint exactly.
- [ ] Add idle state.
- [ ] Add occupied/in-service state.
- [ ] Add unstaffed state where applicable.
- [ ] Add low-stock/empty state where applicable.
- [ ] Add dirty state.
- [ ] Add damaged state.
- [x] Add connected straight/corner/end bar rendering.
- [x] Verify sprites in the live game rather than only as source images.

### Phase 1B Gate

- [ ] One checkout visibly becomes overwhelmed.
- [x] A second checkout or redesigned queue improves measured throughput.
- [ ] A larger cantina visibly supports more simultaneous occupants.
- [x] Large fixtures create meaningful queue, route, stock, staffing, and floor
  tradeoffs.
- [x] Beds cannot be double-claimed.
- [ ] Reception helps without becoming mandatory.
- [ ] Two seeded runs differ while remaining inferable.
- [ ] Playtest decides whether to proceed with deeper hidden demand.

## Failed Stay And Stranding Contract

- [x] Errand visitors can balk, abandon a purchase, and leave early.
- [ ] Shore-leave passengers seek an alternative and obey recall.
- [x] A passenger who physically misses boarding becomes stranded.
- [ ] Contract crews remain while their ship work is incomplete.
- [x] Poor contract-crew needs reduce cooperation or work productivity.
- [x] Extended/stranded guests consume temporary food, hygiene, and lodging.
- [ ] Residents accumulate persistent stress and can withdraw from work or leave.
- [ ] Implement visible `unmet` escalation.
- [x] Implement visible `balking` escalation.
- [x] Implement visible `distressed` escalation.
- [ ] Implement bounded `disruptive` escalation.
- [ ] Let prolonged failure cause mess, complaints, arguments, theft, vandalism,
  medical demand, or refusal to work as appropriate.
- [x] Ensure one missed meal cannot immediately trigger a serious incident.
- [x] Make distressed repair crews extend repair and Berth occupation.
- [ ] Make extended occupation block or delay subsequent accepted traffic.
- [ ] Allow emergency meal purchase.
- [ ] Allow emergency temporary bunk capacity.
- [ ] Allow repair prioritization or expediting.
- [ ] Allow cohort compensation.
- [ ] Allow evacuation or onward-transfer charter.
- [ ] Allow contract cancellation with an explicit penalty.
- [ ] Allow admission closure while recovering.
- [ ] Reserve security intervention for genuinely disruptive occupants.
- [x] Give stranded occupants temporary accommodation and future departure.
- [x] Add an expensive relief transfer after a generous maximum disruption window.
- [x] Never silently convert a failed visitor into a resident.
- [ ] Require housing availability and explicit policy for resident acceptance.
- [ ] Let an accepted resident's origin ship depart normally.
- [ ] Apply rating/faction effects at meaningful milestones or resolution.
- [ ] Verify every rating change traces back to visible behavior.

## Approach Control And Admission Portfolio

### Small-Port Manual Control

- [ ] Present a short list of incoming ship silhouettes tied to physical lanes.
- [x] Show ship/visit class at a glance.
- [x] Show likely party-size range.
- [x] Show likely stay range.
- [x] Show broad service or demand cues.
- [ ] Show compatible interface and approach side.
- [x] Show expected revenue range.
- [x] Show committed capacity if accepted.
- [x] Provide `Accept`, `Hold`, and `Pass` without opening a large manifest.
- [x] Never pause automatically when an offer arrives.
- [x] Bind acceptance to a compatible docking slot or Berth reservation.
- [ ] Project the candidate approach envelope into the world on hover/focus.
- [x] Project expected Berth, bed, meal, hygiene, and staff load.
- [ ] Surface conflicts with already accepted work.

### Scaling Automation

- [ ] Add simple auto-admission by ship class.
- [ ] Add auto-admission conditions based on free compatible interface.
- [ ] Add reserve-capacity conditions for beds or core services.
- [ ] Add minimum-margin and maximum-stay conditions.
- [ ] Add risk/faction conditions only when those systems are legible.
- [ ] Allow manual override of an automation decision.
- [ ] Keep large, uncertain, negotiated, military, and migrant commitments visible.
- [ ] Aggregate routine lane pressure at large scale.
- [ ] Avoid a priority spreadsheet.

## Phase 2: Structural Graph And Planning Overlay

### Structural Pieces

- [x] Promote existing Truss as the exterior scaffold and utility support.
- [ ] Add Truss Junction with branch/span function.
- [ ] Add Reinforced Bulkhead with heavy-load transfer function.
- [ ] Keep Pod Dock as the small docking collar.
- [ ] Keep Gangway as the passenger connection and boarding provider.
- [ ] Keep Docking Clamp as vessel mass support.
- [ ] Add no decorative structural checklist pieces.

### Structural Graph

- [x] Root support in the original station frame/core.
- [x] Grandfather legacy hull as supported.
- [x] Derive nodes and edges from Truss, Junctions, Bulkheads, and hull boundaries.
- [x] Enforce a readable straight-span limit.
- [x] Require Junctions for unsupported branches or long runs.
- [x] Define small, medium, and heavy interface loads.
- [x] Require reinforced load transfer for large Berths where appropriate.
- [x] Validate support while planning.
- [x] Validate support again before commissioning.
- [ ] Cache support by structure/topology version.
- [x] Avoid per-tick structure scans.

### Planning Feedback

- [ ] Add supported overlay state.
- [ ] Add planned-support overlay state.
- [ ] Add overloaded overlay state.
- [ ] Add unsupported overlay state.
- [ ] Explain unsupported span in world.
- [ ] Explain missing Junction in world.
- [ ] Explain excessive interface load in world.

### Phase 2 Gate

- [x] Unsupported hull planning is rejected.
- [x] A Junction enables a branch.
- [x] Reinforcement enables a heavy interface.
- [ ] Legacy saves load as structurally valid.
- [ ] Structural recomputation occurs only after relevant mutations.

## Phase 3: Physical Expansion And EVA Construction

### Planning And Delivery

- [x] Promote construction blueprints into the normal expansion workflow.
- [x] Plan Truss in space.
- [x] Route construction kits to reachable staging.
- [x] Route EVA workers through an Airlock.
- [x] Build Truss through visible EVA welding.
- [x] Plan Pressure Hull over completed or planned support.
- [x] Derive floor-plate blueprints.
- [x] Derive perimeter wall/bulkhead blueprints.
- [ ] Derive tie-in and doorway/airlock work.
- [ ] Preserve editable plans before work completes.
- [x] Preserve cancellation and define material salvage/refund.
- [ ] Preserve module movement and resale.

### Commissioning

- [x] Remove instant shell conversion from normal expansion.
- [x] Require structural completion before hull completion.
- [x] Require complete perimeter before seal check.
- [x] Keep incomplete shell unpressurized.
- [x] Perform visible seal check.
- [x] Commission and pressurize only a supported sealed shell.
- [x] Require EVA construction for exterior/unpressurized modules.
- [x] Report missing material.
- [ ] Report missing staging route.
- [x] Report missing Airlock/EVA route.
- [ ] Report low EVA oxygen.
- [x] Report incomplete seal.
- [ ] Report obstructed work position.

### Phase 3 Gate

- [x] Build a complete pressurized wing from a live starter.
- [x] No Airlock visibly blocks exterior work.
- [x] Missing material visibly blocks work.
- [x] Exterior module installation uses EVA.
- [x] Save/load preserves partially delivered and partially built sites.
- [x] Topology mutations continue through authoritative invalidation paths.

## Phase 4: Docking Slots, Approach Envelopes, And Frontage

### Shared Docking Slot

- [x] Define one descriptor for legacy Docks, Pod Docks, and Berths.
- [ ] Preserve stable physical interface identity.
- [x] Store hull connection, accepted ship class, access tiles, and envelopes.
- [x] Add binding slot reservations.
- [ ] Add authoritative slot occupancy.
- [x] Make small-craft reservations bind to a specific dock.
- [x] Prevent two ships from owning the same slot.
- [ ] Unify holding queues without merging distinct settlement models.

### Fleet Shape And Scale

- [x] Generate a native-resolution fleet with clearly distinct compact, broad,
  and long silhouettes.
- [x] Keep economic purpose (`tourist`, `trader`, `industrial`, `military`,
  `colonist`) separate from physical hull variant.
- [x] Assign hull variants deterministically so save/load preserves vessel identity.
- [x] Support at least two Pod Dock silhouettes and six Berth silhouettes.
- [x] Let ship size and hull shape affect rendered mooring and approach footprints.
- [x] Make long freighters and liners visibly require deeper open approach space.
- [x] Keep compact craft useful where frontage or approach clearance is constrained.
- [x] Show the same silhouette in Approach Control, holding orbit, approach, docking,
  and departure.
- [ ] Verify every fleet sprite at actual gameplay zoom and on every lane rotation.

### World-Space Envelopes

- [x] Derive ingress envelope.
- [x] Derive mooring/parked-vessel envelope.
- [x] Derive egress envelope.
- [x] Size envelopes by interface and ship class.
- [x] Represent envelope geometry beyond map boundaries.
- [x] Reject mooring overlap with station structure.
- [x] Reject incompatible mooring-envelope overlap.
- [x] Reject impossible fixed approach obstruction.
- [x] Preserve legal placement when only approach paths overlap.

### Approach Conflict Groups

- [x] Derive conflict groups from overlapping ingress/egress geometry.
- [x] Reserve a group during approach.
- [x] Reserve a group during departure.
- [x] Permit docked coexistence when mooring envelopes are clear.
- [x] Serialize conflicting approach/departure operations.
- [x] Permit independent approaches concurrently.
- [x] Show `WAITING: APPROACH OCCUPIED` at the physical interface.
- [x] Keep holding traffic structured and deterministic.

### Placement Preview

- [x] Render approach direction arrows.
- [x] Render vessel width and depth.
- [x] Render hard obstruction in red.
- [x] Render shared/serialized approach in amber.
- [x] Show resulting conflict group.
- [ ] Show charter-facing lane traffic.
- [ ] Show obvious interior throat or boarding warning.

### Phase 4 Gate

- [x] Map-edge placement cannot bypass clearance.
- [x] Overlapping approaches serialize visibly.
- [x] Independent sides operate concurrently.
- [x] Parked ships never overlap hull or one another.
- [x] Save/load resumes durable slot and approach ownership safely.

## Phase 5: Movement Intent, Doors, And Real Queues

### Movement Coordinator

- [x] Collect next-tile intents in a batched simulation pass.
- [x] Resolve by tile capacity and occupant departure intent.
- [x] Include role/urgency without starving ordinary actors.
- [x] Accumulate wait age for fairness.
- [x] Use deterministic tie-breaking.
- [x] Allow controlled safe head-on swaps.
- [ ] Make one actor yield when a swap is unsafe.
- [x] Replan after bounded waiting using congestion.
- [x] Add route hysteresis to prevent oscillation.
- [x] Add bounded deadlock recovery.
- [ ] Release stale movement and service reservations.
- [ ] Keep interpolation independent from simulation speed.

### Spatial Capacity

- [x] Give doors one crossing resource and crossing time.
- [x] Give Airlocks explicit crossing capacity.
- [ ] Give narrow corridors low directional capacity.
- [ ] Give open concourses greater capacity.
- [x] Make carts/bulky cargo consume more movement capacity.
- [ ] Preserve exclusive service/work/seat reservations.

### Real Queue Spill

- [x] Back every queue position with a real floor reservation.
- [x] Grow a queue backward from its provider.
- [x] Route queue spill through reachable floor.
- [x] Permit queue spill into circulation.
- [x] Make a queue covering a door reduce door throughput.
- [x] Let actors balk after appropriate wait and alternatives.
- [ ] Lift queue and congestion caps only after deadlock safety exists.
- [x] Show why an actor is waiting.

### Phase 5 Gate

- [x] A narrow terminal congests without permanently freezing.
- [ ] A queue visibly covers and slows a door.
- [x] A second entrance measurably improves throughput.
- [x] Head-on and cyclic traffic recovers.
- [x] No actor remains indefinitely stuck in a stale reservation.
- [x] Target-scale movement remains performant.

## Phase 6: Physical Cargo, Boarding, And Interior Support

### Physical Cargo

- [ ] Represent meals, stock, supplies, luggage, and freight as visible carried
  objects or carts backed by real jobs.
- [x] Show pickup at source.
- [x] Show carrying through the station.
- [x] Show drop-off at staging or destination.
- [x] Make cargo carriers consume route capacity.
- [x] Make public/cargo conflict slow both flows.
- [x] Show the conflict where it happens.
- [x] Preserve resource accounting through interrupted jobs.

### Physical Boarding

- [x] Give Gangways/collars disembark capacity.
- [x] Give Gangways/collars boarding capacity.
- [x] Make additional Gangways improve real throughput.
- [x] Make recall route people physically back to origin ship.
- [ ] Make boarding contend with doors, queues, and cargo.
- [x] Make boarding and bulky cargo contend physically in a shared route.
  Evidence: `npm run test:physical-cargo` case
  `passenger-transfer-and-cargo-block-each-other-visibly`.
- [x] Make late boarding extend occupation or trigger explicit missed departure.
  Evidence: bounded extension plus stranded-passenger branch in
  `npm run test:mixed-berth-visit`.

### Per-Interface Diagnosis

- [ ] Measure disembark throughput.
- [x] Identify door and Airlock choke points.
- [x] Identify queue spill across arrival/boarding routes.
- [ ] Measure boarding distance and duration.
- [ ] Measure reachable service and seating capacity.
- [x] Identify public/cargo route intersections.
- [x] Measure freight staging/storage distance.
- [x] Measure staff access to ship hardware.
- [ ] Check utility and maintenance access.
- [x] Measure approach wait and Berth overstay.
- [x] Show only the most actionable diagnosis by default.
- [ ] Highlight the physical route, door, queue, or interface when selected.

### Phase 6 Gate

- [x] Shared public/cargo corridor performs worse than separated routes.
- [x] Additional Gangway improves boarding.
- [x] Meal queue across an exit creates late boarding.
- [x] Diagnosis matches measured actor behavior.
- [x] No hidden percentage substitutes for physical interference.

## Phase 7: Exposure, Integrity, And Charter Differentiation

### Exterior Integrity

- [x] Reuse seeded debris exposure and existing maintenance targets.
- [x] Add stable integrity identity for exterior targets.
- [x] Add `worn` state.
- [x] Add `damaged` state.
- [x] Add explicit thresholded `breached` state.
- [x] Add `repaired` restoration state.
- [x] Keep ordinary wear distinct from catastrophic breach.
- [x] Never silently reuse fire tile-deletion semantics.
- [x] Route integrity mutations through authoritative topology paths.

### EVA Repair

- [x] Generate exterior repair work from visible damage.
- [x] Require Airlock access.
- [x] Consume EVA oxygen.
- [x] Consume repair supplies where appropriate.
- [x] Block and explain unsafe/unreachable repair.
- [x] Restore pressure boundary correctly after breach repair.
- [x] Render impact, damage, welding, and patch states.

### Charter Effects

- [x] Make directional lane traffic affect frontage value and approach pressure.
- [x] Make dense debris increase directional wear/impact risk.
- [x] Make sunlight increase generation and thermal load.
- [ ] Make thermal-sink quality affect high-load expansion.
- [ ] Make trade composition affect useful interface/service mix.
- [ ] Keep each effect visible in Charter and station-world feedback.
- [ ] Provide mitigation through shielding, redundancy, cooling, safer expansion,
  or policy.

### Phase 7 Gate

- [x] Debris-facing wing wears faster than protected comparison.
- [x] EVA repair visibly restores damage.
- [x] A true breach changes pressure and restores correctly.
- [x] Different charters make different expansion geometry attractive.
- [ ] Risk remains forecastable and recoverable.

## Phase 8: Starter, Economy, Progression, UI, And Art

### Starter Contract

- [x] Begin with a finite unfinished pressure hull.
- [x] Include basic life safety and crew support.
- [x] Include Receiving and a construction staging route.
- [x] Include one usable Airlock.
- [x] Include two Pod Docks on limited frontage.
- [x] Include room to author one opening business.
- [x] Include one short prebuilt truss/hardpoint lesson.
- [x] Preserve one legible side for the first Berth expansion.
- [x] Do not start with a completed food and market checklist.

### Opening Choices

- [x] Let player choose food, supplies/retail, or pod ship service.
- [x] Let player improve that operation spatially.
- [ ] Let player add another Pod Dock or ship service.
- [ ] Let player build an interior wing or docking finger.
- [ ] Let player save toward a first Berth.
- [x] Make each investment visibly change traffic or operations.
- [x] Keep common safety infrastructure orthogonal to portfolio specialization.

### Economy And Progression

- [ ] Price Truss, hull, modules, labor, and maintenance coherently.
- [ ] Make first Berth a major but attainable capital achievement.
- [x] Keep capabilities visible rather than hidden behind arbitrary unlocks.
- [ ] Use rating to attract more valuable traffic.
- [x] Use Capital Projects as optional subsidies, not exclusive gates.
- [x] Reconcile global goal, business path, and legacy tier messaging.
- [ ] Preserve a visible cumulative station rating with causal breakdown.

### Contextual UI

- [ ] Keep Approach Control compact and hideable.
- [ ] Keep alerts contextual/pop-out.
- [ ] Put market operations at the market.
- [ ] Put dock/Berth operations at the physical interface.
- [ ] Keep future-load forecasting contextual to admission.
- [ ] Avoid permanent panels for Alpha Watch, charter details, fuel, cargo arm, and
  work queue when no related context exists.
- [ ] Use world-space chips and overlays before sidebar prose.
- [ ] Never create overwide scheduling or operations panels.

### Structural And Operational Art

- [ ] Generate low-resolution Truss Junction art.
- [ ] Generate low-resolution Reinforced Bulkhead art.
- [ ] Add planned/delivered/welding/complete/overloaded structural states.
- [ ] Add scaffold/floor/wall/seal/pressurizing states.
- [ ] Add approach reservation animation.
- [x] Add carried resource sprites.
- [ ] Add Gangway and clamp deployment states.
- [x] Add hull wear/damage/breach/repair states.
- [ ] Add door contention and late-boarding indicators.
- [ ] Verify every asset at actual gameplay size in the live renderer.

### Phase 8 Gate

- [x] New game requires a meaningful authored opening decision.
- [x] First business operation visibly serves real demand.
- [ ] First expansion feels constructed rather than painted.
- [ ] First Berth changes station scale and operating pressure.
- [ ] UI explains current pressure without becoming a spreadsheet.

## Phase 9: Save Migration, Performance, And Full Playthrough

### Save Compatibility

- [ ] Grandfather legacy hull support.
- [ ] Derive approach envelopes for legacy Docks.
- [ ] Adapt existing Berth geometry until edited/replaced.
- [ ] Add safe defaults for new occupant state.
- [ ] Add safe defaults for integrity/damage.
- [x] Persist construction and damage.
- [x] Persist durable ship visit and slot/queue ownership.
- [ ] Rebuild structural graphs after load.
- [ ] Rebuild approach conflict groups after load.
- [ ] Rebuild congestion and movement intents after load.
- [x] Rebuild interface diagnoses after load.
- [x] Never persist stale actor paths or transient movement intents.
- [ ] Preserve maintenance identity through map expansion and module movement.

### Performance

- [ ] Cache structure by topology/structure version.
- [ ] Cache approach groups by interface geometry version.
- [ ] Recompute interface diagnoses only after relevant change or sustained
  traffic interval.
- [ ] Resolve movement intents in a batch.
- [ ] Update congestion fields at fixed cadence.
- [ ] Avoid per-actor full A* on render frames.
- [ ] Maintain an exterior target list for maintenance.
- [ ] Keep render interpolation independent of simulation speed.
- [ ] Profile every phase at baseline scale.
- [x] Profile final build at two to three times current station footprint.

### Full Playthrough

- [ ] Start from the revised bare station.
- [x] Choose and build one opening portfolio operation.
- [ ] Manually compose early traffic through Approach Control.
- [ ] Experience one successful short-stay flow.
- [ ] Experience and recover from one failed long stay.
- [ ] Build temporary guest lodging.
- [x] Build a physical expansion through EVA construction.
- [ ] Build the first medium Berth.
- [ ] Operate overlapping Pod and Berth traffic.
- [ ] Separate a harmful public/cargo route.
- [ ] Recover from visible hull damage.
- [ ] Introduce routine admission automation.
- [ ] Reach at least 50 crew and 50 simultaneous visitors.
- [ ] Operate at least 5-10 mixed interfaces.
- [ ] Save, reload, and continue without stale reservations or lost commitments.

### Phase 9 Gate

- [ ] Desired baseline station remains smooth and readable.
- [ ] Two- to three-times scale remains operationally plausible.
- [ ] Multiple station geometries remain viable.
- [ ] Bad layouts create visible problems with more than one valid remedy.
- [ ] No phase depends on invisible modifiers as its primary consequence.

## Focused Runner Catalogue

- [x] Add structural support runner.
- [x] Add phased construction/EVA runner.
- [x] Add approach geometry/reservation runner.
- [x] Add ship visit/settlement runner.
  Evidence: `npm run test:mixed-berth-visit`.
- [x] Add occupant tenure/needs runner.
- [x] Add fixture-slot/reception runner.
- [x] Add failed-stay/stranding runner.
- [x] Add movement/queue/deadlock runner.
- [x] Add cargo/boarding/support runner.
- [x] Add integrity/pressure/EVA repair runner.
- [x] Add target-scale performance runner.
- [x] Document commands beside each completed phase.

## User Playtest Review

- [x] Provide a URL that opens the correct scenario/save.
- [x] Provide a short list of new interactions to try.
- [x] Provide one deliberately bad layout to observe.
- [ ] Provide the tools to improve that layout in world.
- [x] Ensure sprites are enabled by default.
- [x] Ensure panels can be hidden for visual inspection.
- [ ] Preserve the user's quicksave separately from deterministic QA saves.
- [ ] Record user feedback against exact checklist items.
- [ ] Reopen any checked item whose live behavior does not meet the requirement.

## Running Evidence And Findings

Add dated entries here as phases complete:

```text
YYYY-MM-DD · Phase / checklist item
Commit or files:
Focused checks:
Visual/playtest evidence:
Remaining uncertainty:
```

2026-07-28 · Production mixed-call lifecycle

- Commit or files: `src/sim/approach-envelopes.ts`, `src/sim/cold-start-scenarios.ts`, `src/sim/sim.ts`, `tools/mixed-berth-visit-tests.ts`, and `package.json` (pending integration commit at evidence capture).
- Focused evidence: `npm run test:mixed-berth-visit` proves a legal medium repair tender, six physical passenger transfers, a planned table meal credited through the canonical service log, contract-owned freight jobs with custody progress and nonzero tile distance, one bounded extension, recall and collar boarding, explicit stranded provenance, cleanup, and exactly-once settlement. `npm run test:approach-envelopes`, `npm run test:passenger-transfer`, `npm run test:physical-cargo`, and `npm run test:failed-stay` remain green.
- Correctness fixes: Berth clearance previously expanded from the whole room footprint and collided with the bay's own U-shaped walls; it now grows from a centered mooring core. A ten-second route timeout also wrote an unmet hospitality stop into `completedServices` without a fixture session; unreachable passengers now remain visibly unmet and retry until service or recall.
- Live evidence: `?scenario=mixed-berth-visit&diag=1` presents one medium `Longwatch Repair Tender` in Approach Control beside the authored east-facing repair bay. Four crew-policy Bunk Banks and two private Beds now give its 18 crew 18 depicted sleep positions.

2026-07-28 · Gangway boarding throughput and bunk ownership

- Commit or files: `tools/passenger-transfer-tests.ts`, `src/sim/sim.ts`, `src/sim/cold-start-scenarios.ts`, and `tools/facility-slots-tests.ts` (pending integration commit at evidence capture).
- Focused evidence: `npm run test:passenger-transfer` resumes one identical fully disembarked cohort into one- and two-Gangway variants, triggers the production recall path, waits for a real boarding crossing, and proves the second Gangway returns more passengers in the same seven-second window. `npm run test:facility-slots` proves a visitor-policy Bunk Bank accepts temporary guests but adds no crew capacity, while changing that same fixture to crew policy rejects guests and adds exactly four assignable crew positions. `npm run test:mixed-berth-visit` remains green.
- Player-facing behavior: room policy now owns the depicted Bunk Bank positions. Crew quarters count and assign four positions per bank; guest lodging uses the same four exclusive positions only when explicitly visitor-zoned.
- Remaining uncertainty: repeated multi-day repair crews still need to complete several organic sleep/meal/wash/leisure cycles, and the compound meal-queue-causes-late-boarding gate remains open.

2026-07-27 · Program setup and implementation authority

- Commit or files: `4c0c637`, `docs/38-structural-frontage-visit-flow-implementation-plan.md`, `docs/39-structural-frontage-execution-checklist.md`, `docs/README.md`.
- Focused checks: Markdown whitespace validation; 539 auditable checklist items recorded.
- Visual/playtest evidence: not applicable to documentation setup.
- Remaining uncertainty: phase implementation and gameplay evidence remain open.

2026-07-27 · Phase 0 frontage baseline v1

- Commit or files: `tools/frontage-baseline.ts`, `package.json`.
- Focused checks: `npm run baseline:frontage` passed. Terminal peak route load improved `12 -> 7`; shared route tiles improved `40 -> 30`; separated cargo route overlap improved `1 -> 0`; two current Market Stall providers increased measured service slots `2 -> 4` and stock capacity `32 -> 64`.
- Visual/playtest evidence: none yet. These are deterministic route and provider proxies, not proof of physical actor blocking.
- Remaining uncertainty: live visit, boarding, queue, recurring-needs, reception, damage/EVA, render, and target-scale metrics remain unavailable until their systems land.

2026-07-27 · Phase 1A occupant-loop foundation

- Commit or files: `src/sim/occupant-demand.ts`, `src/sim/types.ts`, `src/sim/balance.ts`, `src/sim/sim.ts`, `src/sim/save.ts`, `tools/occupant-loop-tests.ts`, `package.json`.
- Focused checks: `npm run test:occupant-loop` passed after lead review. It covers deterministic tenure derivation, need decay/restoration, recurring completion without promise inflation, active-visitor save/resume, visible recall staging, hard-departure cleanup, and settlement idempotence.
- Visual/playtest evidence: not yet. World-space lifecycle feedback and the actual multi-service repair-crew playtest remain open.
- Remaining uncertainty: the new visitor demand component reuses physical visitor service/reservation paths but does not yet share the resident target loop itself; guest beds, holding/disembark phases, early failure departure, stranding, reception, large fixtures, and traffic-concurrency tuning remain unchecked.

2026-07-27 · Phase 1B physical facility slots, first slice

- Commit or files: `8a49e07`, `src/sim/facility-descriptors.ts`, `src/sim/sim.ts`, `src/sim/save.ts`, `src/sim/balance.ts`, `tools/facility-slots-tests.ts`.
- Focused checks: `npm run test:facility-slots` and `npm run test:occupant-loop` passed. The facility runner covers rotated slot geometry, exclusive claims, proportional capacity, no-stock rejection, exactly-once stocked checkout, a complete browse-to-checkout trip, temporary guest sleep, provider arrival without retarget oscillation, and hydration cleanup.
- Visual/playtest evidence: `?scenario=facility-scale` was inspected in the live browser at actual play zoom. The Checkout Bank reads as one long service fixture, each Shelf Aisle exposes three distinct merchandise bays, and both four-bed Bunk Banks fit their enclosed room without occluding the door. Staff lanes, visible checkout queues, and restocking remain open.
- Remaining uncertainty: the legacy Market Stall remains as a compact compatibility path; the new Checkout Bank and Shelf Aisle become a deeper market only when both are present. Bunk Bank is temporary guest capacity and does not grant permanent resident identity.

2026-07-27 · Phase 1B native facility artwork

- Commit or files: `537062c`, `tools/sprites/curated/module_checkout_bank.png`, `tools/sprites/curated/module_shelf_aisle.png`, `tools/sprites/curated/module_bunk_bank.png`, atlas pipeline metadata, and `src/render/sprite-keys.ts`.
- Focused checks: the curated sources were deliberately reduced to the final 18-pixel tile density before nearest-neighbor atlas scaling. Packed atlas frames are exactly `128x320`, `64x256`, and `128x256`, matching 2x5, 1x4, and 2x4 footprints at the 64-pixel atlas cell size.
- Visual/playtest evidence: each transparent curated sprite was inspected directly after chroma removal and low-resolution reduction. The two registers, three shelf bays, and four beds remain distinct.
- Remaining uncertainty: live-render placement, rotation, occupied states, low-stock states, dirt, and damage remain unchecked and must be observed in the game before their checklist items close.

2026-07-27 · Phase 1B live facility showcase

- Commit or files: `src/sim/cold-start-scenarios.ts` (`?scenario=facility-scale`).
- Focused checks: `npm run build` passed. The fixture replaces only the demo station's legacy Market and Dorm furniture and preserves its sealed shell.
- Visual/playtest evidence: inspected with interface panels hidden at both fit-station and actual play zoom. Checkout, shelf, and bunk silhouettes are distinct and their native footprints align to room tiles.
- Remaining uncertainty: this is paused visual evidence, not proof of queue throughput, visitor use, stocking labor, occupied states, or damage states.

2026-07-27 · Approach Control commitment model

- Commit or files: `4d4d707`, `src/sim/approach-control.ts`, `src/sim/sim.ts`, `src/sim/save.ts`, `src/sim/types.ts`, `tools/approach-control-tests.ts`.
- Focused checks: `npm run test:approach-control` passed and `npm run build` passed. The runner proves compact preview ranges/cues/load, no auto-pause, Pod-only and Berth-only physical binding, reservation exclusion, bounded Hold, guarded Pass, and pending/committed save-load recovery.
- Visual/playtest evidence: the model is ready for the compact contextual panel, but no panel or hover envelope has been implemented or checked yet.
- Remaining uncertainty: interface labels and approach-side presentation need UI review; future-load conflicts currently expose committed physical-interface counts but do not forecast time-overlap contention across every service.

2026-07-27 · Compact Approach Control interface

- Commit or files: `f983e50` plus follow-up integration fixes in `src/main.ts` and `src/styles.css`.
- Focused checks: `npm run build` and `git diff --check` passed. `fuel-day` supplied two deterministic medium offers; accepting `F-901` changed its card to `Interface committed` exactly once.
- Visual/playtest evidence: inspected populated cards at `1600x1000` and `700x900`. Both show class silhouette, party/stay ranges, demand cues, free interfaces, revenue, committed load, and `Accept` / `Hold` / `Pass`; the narrow layout becomes one column and remains within the viewport.
- Remaining uncertainty: approach-side world projection, hover envelopes, service-overlap conflicts, and large-station automation remain open.

2026-07-27 · Failed-stay and stranding foundation

- Commit or files: `bd954f3`, `src/sim/types.ts`, `src/sim/sim.ts`, `src/sim/save.ts`, `tools/failed-stay-tests.ts`, `tools/occupant-loop-tests.ts`.
- Focused checks: `npm run test:failed-stay`, `npm run test:occupant-loop`, `npm run test:facility-slots`, and `npm run build` passed. Coverage includes normal boarding, hard-departure stranding, gradual escalation, ship-local productivity pressure, save/load, delayed paid relief, and exactly-once removal/settlement.
- Visual/playtest evidence: none yet. Failure stages, stranded accommodation, and the relief action still need world-space/UI presentation before their visible checklist items can close.
- Remaining uncertainty: `disruptive` is durable state only; it does not yet spawn a bounded incident. Emergency relief exists as a simulation command but is not yet a player-facing control.

2026-07-27 · Structural support read model

- Commit or files: `9b42161`, `src/sim/structural-support.ts`, `tools/structural-support-tests.ts`, `package.json`.
- Focused checks: `npm run test:structural-support` and `git diff --check` passed. Coverage proves legacy rooting, connected/disconnected runs, a six-tile maximum span, junction-required branching, distinct small/medium/heavy loads, reinforced heavy transfer, deterministic reason codes, and zero `StationState` mutation.
- Visual/playtest evidence: none yet. The validator is deliberately planning-time data and is not wired to the build gesture or support overlay.
- Remaining uncertainty: without historical construction provenance, all existing non-space/non-truss tiles are conservatively grandfathered roots. Junction and Reinforced Bulkhead exist as proposed planning kinds but still need real placeable pieces, art, overlays, construction, and commissioning validation.

2026-07-27 · Failed-stay world presentation and relief control

- Commit or files: `src/render/render.ts`, `src/main.ts`, `src/sim/sim.ts`, `src/sim/cold-start-scenarios.ts` (`?scenario=failed-stay-showcase`).
- Focused checks: `npm run test:failed-stay`, `npm run test:occupant-loop`, and `npm run build` passed. The deterministic fixture stages four occupants without relying on elapsed playtest time.
- Visual/playtest evidence: inspected at `1600x1000` with panels both visible and hidden. Balking renders an amber `?`; distressed/disruptive states render escalating `!` markers and need-specific speech; stranding adds a separate transport marker. The Alerts panel identified one stranded passenger, the worst current stage, and a 65-credit relief action. Clicking the unique action removed the stranded passenger exactly once and displayed `Relief transfer arranged for visitor #99104 (-65c)`.
- Remaining uncertainty: `unmet` remains intentionally quiet, `disruptive` does not yet create a bounded physical incident, and this paused showcase does not prove a naturally emerging failed stay during a complete ship visit.

2026-07-27 · Phase 5 movement and queue architecture audit

- Commit or files: read-only audit of `src/sim/sim.ts`, `src/sim/path.ts`, `src/sim/construction.ts`, `src/sim/save.ts`, and existing focused tests. No behavior changed and no Phase 5 item was checked.
- Focused checks: traced visitor, resident, crew, logistics, security, queue, reservation, door, Airlock, path-cache, interpolation, and hydration paths. The shared adapter seam is `moveAlongPath`; provider reservations remain the service-capacity authority.
- Visual/playtest evidence: current occupancy is only a soft path cost. `MAX_OCCUPANTS_PER_TILE` emits diagnostics but does not prevent entry; `MoveResult` declares `blocked` but movement never returns it; queue positions do not claim floor space; Doors/Airlocks have no movement capacity. This explains actors sharing fixtures, queues passing through bodies, and invisible public/cargo conflict.
- Remaining uncertainty: the movement coordinator must preserve post-arrival state transitions, path-call budgets, render-only interpolation, deterministic fairness, safe swaps, and save/resume of wait age. Required focused cases are no-double-occupancy, order-independent fairness, safe/unsafe swaps, queue spill through a door, blocked-door recovery, and deterministic save/resume.

2026-07-27 · Phase 4 approach-envelope architecture audit

- Commit or files: read-only audit of ship lifecycle, dock/Berth geometry, Approach Control, rendering, save/hydration, and expansion paths. No Phase 4 behavior changed and no checklist item was checked.
- Focused checks: traced `spawnShipAtDock`, `spawnShipAtBerth`, `updateArrivingShips`, current `approachTiles`, stable interface bindings, active-ship persistence, and grid remapping. The narrow adapter is between physical slot binding and approach/departure stage advancement.
- Visual/playtest evidence: current Berth approach lanes are cosmetic and current Pod Dock validation truncates at map bounds. The planned model keeps full world-coordinate ingress, mooring, and egress rectangles outside map bounds, hard-rejects structure/mooring overlap, and derives conflict groups when otherwise legal approach paths intersect.
- Remaining uncertainty: implementation must preserve accepted-offer commitments while adding deterministic `(queuedAt, ship.id)` group ownership, rederive geometry after map expansion, return orphaned bindings to holding, and prove map-edge legality, obstruction, parked coexistence, conflict serialization, independent concurrency, save/resume, and deterministic holding.

2026-07-27 · Phase 3 phased structural expansion and EVA commissioning

- Commit or files: `src/sim/types.ts`, `src/sim/initial-state.ts`, `src/sim/save.ts`, `src/sim/expansion.ts`, `src/sim/construction.ts`, `src/sim/sim.ts`, `src/sim/cold-start-scenarios.ts`, `tools/structural-expansion-tests.ts`, `tools/sim-tests.ts`, and `package.json`.
- Focused checks: `npm run test:structural-expansion`, `npm run test:structural-support`, `npm run build`, and `git diff --check` passed. Coverage includes deterministic disconnected/over-span rejection, no instant mutation/upfront charge, missing-Airlock blocking, real material delivery and Airlock/EVA work, perimeter-before-interior staging, commissioning-time support revalidation, atomic topology commit, project-local cancellation/refund, partial delivery/build save-resume, and grid remapping.
- Visual/playtest evidence: compared `?scenario=structural-expansion-blocked` and `?scenario=structural-expansion-active` at `1600x1000` with panels hidden and play zoom. The same exterior blueprint renders red and remains idle without an Airlock; with an Airlock it renders active blue/white EVA markers, shows an EVA worker at the site, reduces station stock, and exposes active construction work in Operations.
- Remaining uncertainty: the red blocked blueprint does not yet state `missing Airlock` in selection/Alerts; seal-check presentation is not visible; the live fixture has not yet been watched through final pressurization; explicit Junction placement remains deferred, so contiguous legacy Truss decks temporarily ignore only `branch-requires-junction` while still enforcing reachability, span, and load support.

2026-07-27 · Phase 7 exterior-integrity and charter-exposure audit

- Commit or files: read-only audit of map conditions, site charter, exterior maintenance debt, debris impacts, heat/stale air, pressure, fire, EVA repair, rendering hooks, save/hydration, and existing tests. No Phase 7 behavior changed and no checklist item was checked.
- Focused checks: confirmed that local debris/sun/thermal conditions, charter lane traffic, exterior debt, EVA repair routing/oxygen/supplies, thermal drift, and authoritative pressure are real. Confirmed that durable hull-panel identity and `worn` / `damaged` / `breached` / `repaired` states do not yet exist; current debris impacts create debt/effects, not physical component damage.
- Visual/playtest evidence: current hull wear is an aggregated `6x6` maintenance-sector pressure rather than an inspectable exterior object. Fire can delete modules and must remain separate from future breach/restoration topology. The planned player-facing model uses persistent panel sprites, local integrity rings, directional exposure, anchored breach warnings, pressure overlays, visible EVA supplies/welding, and a brief `PATCHED` restoration state.
- Remaining uncertainty: implementation needs a durable world-coordinate `ExteriorIntegrityTarget`, repair-job regeneration after hydration, explicit breach thresholds, restoration through authoritative `setTile`, facing-specific charter traffic, and a dedicated runner proving identity, exposure ordering, state transitions, pressure loss/recovery, fire separation, EVA blocks, save/remap, mitigation, and charter-facing tradeoffs.

2026-07-27 · Phase 4 world-space approach simulation

- Commit or files: `src/sim/approach-envelopes.ts`, `src/sim/sim.ts`, `src/sim/types.ts`, `src/sim/save.ts`, `src/sim/expansion.ts`, `src/sim/index.ts`, `tools/approach-envelope-tests.ts`, and `package.json`.
- Focused checks: `npm run test:approach-envelopes`, `npm run test:approach-control`, `npm run build`, and `git diff --check` passed. Coverage proves full map-edge geometry, fixed obstruction rejection without state mutation, deterministic conflict ownership independent of array order, concurrent independent groups, small-craft Pod Dock binding, departure ownership before slot release, save/resume queue order, west-expansion world stability, and no hidden approach progress while waiting.
- Visual/playtest evidence: none yet. This change establishes the simulation authority needed by placement and live-operation presentation but intentionally does not claim the preview or world-label requirements.
- Remaining uncertainty: physical interface IDs are still derived from local anchors and remapped during north/west growth rather than having immutable UUIDs; Berth and dock placement preview does not yet expose red hard obstruction, amber serialization, vessel dimensions, conflict-group identity, lane traffic, throat warnings, or `WAITING: APPROACH OCCUPIED` in the world.

2026-07-27 · Phase 6 cargo, boarding, and diagnosis architecture audit

- Commit or files: read-only audit of `src/sim/sim.ts`, `src/sim/types.ts`, `src/sim/save.ts`, `src/render/render.ts`, `src/sim/balance.ts`, existing logistics/port documentation, and focused cargo/visitor tests. No Phase 6 behavior changed and no checklist item was checked.
- Focused findings: meals, trade goods, materials, fuel, and berth freight already use item nodes, transport jobs, crew-held quantities, and durable `PortCargoLot` ownership. The implementation boundary is therefore physical custody and throughput, not a new inventory system: attach a visible carried-load/cart record to the authoritative job and actor, then consume Phase 5 movement capacity. Gangways currently provide only capability/anchor data; passenger spawn and boarding have no crossing slots or service duration. Existing recall and hard-departure/stranding state can drive a real boarding queue.
- Visual/playtest evidence: current freight renders as static crate stacks and current meal/trade movement has no carried world object. Multiple Gangways do not improve passenger throughput, and route-pressure percentages cannot identify a specific blocking door, queue, or cargo crossing.
- Remaining uncertainty: jobs, reservations, active crew loads, and carried quantities are not fully persisted. A future cargo slice must reconcile interrupted pickup/carry/drop exactly once, preserve consigned ownership, avoid inflating station stock, and rebuild ephemeral paths/claims after hydration. Minimum diagnosis should record actual wait/service times, queue span, blocker tile/reason, public-versus-cargo contention, and per-interface boarding/cargo outcomes.

2026-07-27 · Phase 4 world-space approach presentation

- Commit or files: `src/render/render.ts`, `src/main.ts`, and `src/sim/cold-start-scenarios.ts` (pending integration commit at time of evidence capture).
- Focused checks: `npm run test:approach-envelopes`, `npm run build`, and live `?scenario=approach-conflicts` inspection passed. The fixture now uses physical Dock tiles and durable `legacy-dock:<anchor>` identities, so normal dock rebuilding cannot orphan its ship commitments.
- Visual/playtest evidence: at fit and ordinary play zoom, the waiting craft shows `WAITING: APPROACH OCCUPIED` beside the physical hull interface. Pod Dock placement renders a world-space footprint, mooring area, directional arrow, and `APPROACH CLEAR`, `APPROACH BLOCKED`, or `APPROACH SERIALIZES: N GROUPS` label using cyan, red, and amber states.
- Remaining uncertainty: charter-facing traffic weight and interior throat/boarding warnings are not yet part of the placement label; those requirements remain unchecked.

2026-07-27 · Phase 5 movement coordinator foundation

- Commit or files: `src/sim/sim.ts`, `src/sim/path.ts`, `src/sim/construction.ts`, `src/sim/types.ts`, `src/sim/save.ts`, `src/sim/index.ts`, `tools/movement-coordinator-tests.ts`, `tools/structural-expansion-tests.ts`, and `package.json` (pending integration commit at time of evidence capture).
- Focused checks: `npm run test:movement-coordinator`, `npm run test:structural-expansion`, `npm run test:occupant-loop`, `npm run test:facility-slots`, `npm run test:failed-stay`, `npm run test:approach-envelopes`, and `npm run build` passed. Coverage proves order-independent contested-tile ownership, bounded urgency with wait-age fairness, safe floor swaps, unsafe Door serialization, narrow-crossing cooldown, bounded congestion replanning, hysteresis, an idle-blocker sidestep, a one-tile hand-courier exchange, distinct fresh crew spawn tiles, and save/resume of durable wait age without stale transient claims.
- Visual/playtest evidence: construction regression tracing exposed two real physical cases rather than lost inventory: the legacy starter spawned all crew on one tile, and a pathless worker could occupy the only square in a one-tile corridor. Fresh crew now spawn on distinct nearby walkable tiles; idle blockers step aside or perform a safety-checked exchange. Interrupted construction loads still return to their authoritative source exactly once.
- Remaining uncertainty: real queue floor slots, queue spill through doors, general narrow-corridor directional capacity, rendered actor wait reasons, bulky-cart capacity beyond swap safety, and target-scale performance remain Phase 5/6 work and stay unchecked.

2026-07-27 · Phase 5 physical queue spill

- Commit or files: `src/sim/types.ts`, `src/sim/save.ts`, `src/sim/sim.ts`, `src/render/render.ts`, `tools/queue-spill-tests.ts`, and `package.json` (pending integration commit at time of evidence capture).
- Focused checks: `npm run test:queue-spill`, `npm run test:movement-coordinator`, `npm run test:occupant-loop`, `npm run build`, and `git diff --check` passed. Coverage proves stable FIFO order independent of visitor array order, one exclusive floor reservation per admitted queuer, reachable spill onto a Door, real Door throttling, alternate-crossing recovery, greater capacity from a second provider route, stale-head release and follower advance, bounded service failure, and save/resume reconstruction from durable queue intent.
- Visual/playtest evidence: queue members use their ordinary world actors as the physical line; sampled thought bubbles report `WAITING FOR SERVICE` or `QUEUE BLOCKED` while the existing animated waiting dots remain the at-a-glance marker. A fresh live browser comparison of a blocked-door line remains required before the visual Phase 5 gate closes.
- Remaining uncertainty: queue length/spill caps remain deliberately bounded; open-concourse and narrow-corridor directional capacity, bulky carts, target-scale performance, and live door-spill visual validation remain open.

2026-07-27 · Target-scale performance architecture audit

- Commit or files: read-only audit of `tools/sim-perf.ts`, `src/sim/sim.ts`, `src/sim/path.ts`, `src/main.ts`, renderer caches, harness hooks, and `docs/26-fifty-crew-scale-playtest.md`. No performance box was checked.
- Focused findings: the current runner measures average whole-tick time on mostly empty actor populations and cannot prove smooth rendering. The required fixture is one deterministic saved 100x80 station shared by Node and browser runs, with 50/50, 100/100, and 150/150 crew/visitor tiers, 5-10 mixed interfaces, active ships, approach conflicts, jobs, reservations, and real food/drink queues. It must record p50/p95/p99/max simulation phases, path/cache activity, movement/queue contention, rAF intervals, render/UI time, long frames, and deterministic final-state counters.
- Proposed starting budgets: at 50/50, simulation p95 <= 15 ms and p99 <= 25 ms, render p95 <= 12 ms; at 2-3x footprint, simulation p95 <= 25 ms and p99 <= 40 ms, render p95 <= 14 ms. Calibrate only after the first raw baseline is preserved.
- Remaining uncertainty: no target-scale fixture, raw sample history, live rAF profile, approach-group cache, or save/load repeatability evidence exists yet. `window.__harnessAdvanceSim()` is suitable for deterministic simulation distributions but cannot substitute for a real running browser profile.

2026-07-27 · Phase 3 evidence reconciliation

- Commit or files: read-only comparison of the Phase 3 wording against structural-support, expansion, construction, save/remap, focused runners, and live fixtures. No behavior changed.
- Confirmed evidence: normal expansion creates durable staged projects; Pressure Hull planning validates support; Truss targets derive floor and perimeter work; materials move to construction; EVA workers route through an Airlock; perimeter work precedes interior work; commission is atomic through authoritative topology mutation; cancellation/refund and partial save/load are deterministic.
- Corrected overclaims: tie-in work does not yet install an Airlock; there is no explicit seal-check phase; final pressure restoration has not been directly asserted/observed; and ordinary exterior module construction still sets `requiresEva: false`. Those compound boxes were reopened.
- Remaining uncertainty: normal Truss placement is still hidden, Truss/Junction/Bulkhead are not player-placeable staged pieces, blocked projects do not name the missing Airlock/material/staging/oxygen/obstruction in world, and no live starter expansion has been watched through a complete sealed pressurized wing.

2026-07-27 · Long-stay and facility evidence reconciliation

- Commit or files: read-only comparison of Phase 1A/1B against occupant-demand, facility-slot, failed-stay, save, scenario, and artwork evidence. No behavior changed.
- Confirmed evidence: long-stay hunger/energy/hygiene decay and recovery; tenure derivation; one-shot versus recurring demand; contract-crew save/load; exactly-once cleanup; exclusive facility claims; temporary bunks separate from resident homes; stocked shelf browsing and exactly-once checkout; native Checkout Bank, Shelf Aisle, and Bunk Bank footprints/art.
- Corrected overclaim: `test:facility-slots` does not test Reception, so the compound fixture-slot/Reception runner box was reopened. Resident permanence was clarified as the separate Resident actor contract.
- Remaining uncertainty: normal long-stay energy does not yet choose temporary bunks, repeated repair crews have not completed multiple meal/sleep/wash/leisure cycles, recall/boarding save-load remains open, Reception does not exist, Checkout Bank is not staffed or physically queued, restocking is not physical, and large fixtures lack occupied/unstaffed/low-stock/dirty/damaged render states.

2026-07-27 · Fleet shape and scale artwork

- Commit or files: `3a42acd`, eight new native-resolution sprites under `public/assets/ships/` covering courier pod, crew launch, passenger shuttle, repair tender, long freighter, colonist transport, luxury liner, and corvette.
- Visual evidence: all eight source sprites were inspected at original resolution. Each is one coherent alpha silhouette with transparent corners; the long freighter and luxury liner are materially deeper than the medium hulls, while the repair tender and colonist transport are materially broader.
- Remaining uncertainty: these assets are not yet selected by the simulation or renderer. Deterministic hull identity, approach-envelope dimensions, holding-orbit parity, lane rotations, and live gameplay-scale validation remain unchecked.

2026-07-27 · Fast 50/50 scale diagnostic

- Commit or files: `tools/target-scale-perf.ts` (pending integration commit at time of evidence capture).
- Focused evidence: two 50-crew/50-visitor passes complete in about seven seconds with ten interfaces and a 2.1x starter footprint. Both retain the requested populations and emit p50/p95/p99/max simulation timing plus memory and explicit fixture omissions.
- Observed result: typical tick p95 was about 22 ms; one pass reached a 51.5 ms p99 and 88.9 ms max. Gameplay fingerprints diverged first at crew oxygen exposure (`17.64` versus `17.37`) despite matching final counters, so the diagnostic correctly exits nonzero.
- Remaining uncertainty: this fast fixture has no active jobs, reservations, service queues, or ships and is not the target-scale gate. The repeatability divergence must be diagnosed, and a shared active-workload Node/browser fixture plus real rAF/render measurements remain open.

2026-07-27 · Fleet identity, physical passenger transfer, and directional Pod Dock assembly

- Commit or files: `src/sim/ship-hulls.ts`, `src/sim/approach-envelopes.ts`, `src/sim/sim.ts`, `src/sim/types.ts`, `src/sim/save.ts`, `src/render/render.ts`, the eight fleet assets under `public/assets/ships/`, the Pod Dock atlas sources, `tools/ship-fleet-tests.ts`, and `tools/passenger-transfer-tests.ts` (pending integration commit at evidence capture).
- Focused checks: `npm run test:ship-fleet`, `npm run test:approach-envelopes`, `npm run test:passenger-transfer`, `npm run test:movement-coordinator`, `npm run test:occupant-loop`, `npm run sprites:validate:v1`, `npm run build`, and `git diff --check` passed. Passenger coverage includes nonzero crossing time, single-slot exclusivity, two-Gangway arrival throughput, recall cancellation, mid-disembark and mid-boarding hydration, exactly-once settlement, and FIFO reconstruction.
- Visual/playtest evidence: the durable hull variant is the same authored silhouette in Approach Control, holding orbit, approach, docked, and departure presentation. A live starter inspection showed each north-facing Pod Dock composed from two independent authored halves: its caution-framed pressure door remains on the traversable hull tile while the clamp occupies the exterior tile and rotates from the real wall service direction. Idle and active infrastructure states use the same directional assembly.
- Remaining uncertainty: every ship silhouette and Pod Dock orientation still needs a single all-rotations gameplay-zoom fixture; additional-Gangway evidence currently measures disembark throughput rather than the Phase 6 gate's boarding-specific comparison; passenger transfer does not yet contend with visible cargo; and the broader port-operations runner contains stale assumptions about the current six-crew, no-market, no-fuel starter shell.

2026-07-27 · Exterior integrity, EVA repair, and contextual interface diagnosis

- Commit or files: `src/sim/interface-diagnosis.ts`, exterior-integrity state and simulation paths in `src/sim/types.ts`, `src/sim/sim.ts`, `src/sim/save.ts`, and `src/sim/expansion.ts`, contextual selected-interface UI in `src/main.ts`, render treatment in `src/render/render.ts`, and focused runners `tools/exterior-integrity-tests.ts` and `tools/interface-diagnosis-tests.ts` (pending integration commit at evidence capture).
- Focused evidence: `npm run test:exterior-integrity`, `npm run test:interface-diagnosis`, `npm run test:ship-fleet`, `npm run test:passenger-transfer`, and `npm run test:structural-expansion` passed. Coverage proves world-stable face identity, thresholded worn/damaged/breached states, pressure loss without deleting the wall, patched pressure restoration, Airlock/oxygen/supply repair gates, exactly-once material consumption, save/load and map-expansion remapping, debris exposure with Truss mitigation, and diagnosis derived from real transfer queues and active cargo routes rather than a hidden score.
- Visual/playtest evidence: `?scenario=exterior-integrity-showcase` seeds worn, damaged, breached, and patched targets on one paused starter hull. Damage overlays render in the world and repair workers use the existing external EVA/weld presentation. The interface card is contextual to the selected Pod Dock or Berth and returns one prioritized problem with a concrete physical coordinate and remedy.
- Remaining uncertainty: integrity overlay readability needs tuning at Fit Station zoom; automatic wear rates need a sustained live balance pass; the current charter evidence proves debris-density weighting but not a lane-direction comparison; diagnosis does not yet highlight the implicated route or calculate explicit reachable seat counts; and physical cargo persistence remains Phase 6 work.

2026-07-27 · Phase 8 starter and opening-business audit

- Existing foundation: the starter already supplies two Pod Docks, a finite powered shell, receiving, crew quarters, hygiene, and a crew mess. The three intended opening businesses already exist in `src/sim/opening-recipes.ts`, with real demand, located inventory, procurement, physical service truth, and optional Capital Projects underneath them.
- Player-facing conflict: food begins as an almost-complete Cafeteria, supplies inherit most receiving infrastructure, and `Service Ships` currently means refueling rather than repair/dry-dock work. Global Goal, legacy tiers, specialties, business recipes, and Capital Projects all compete to explain progression.
- Recommended next boundary after physical cargo: retain shared safety infrastructure but begin commercially unfinished; present food, supplies, and pod refueling as build-by-doing choices; make each path expose one meaningful spatial tradeoff; require a real visible service outcome within two traffic waves; then offer throughput expansion, another Pod Dock, or saving toward the first Berth.
- Acceptance emphasis: recipe progress must read actual service outcomes rather than become a placement checklist; missing stock, access, power, or pipe must produce zero service and a specific physical explanation; and one opening business must become modestly profitable before the first Berth without passive arrival revenue or rating growth funding the station.
- Remaining uncertainty: the starter still lacks a visible Airlock/truss lesson; saved starter templates may preserve incompatible interface attachments; and the market's large native fixtures are not yet the opening recipe's required spatial machine.

2026-07-27 · Physical cargo ownership, persistence, and corridor capacity

- Commit or files: transport ownership and movement in `src/sim/sim.ts`, save/hydration in `src/sim/save.ts`, world presentation in `src/render/render.ts`, deterministic visual fixture `?scenario=physical-cargo-showcase`, and `tools/physical-cargo-tests.ts` (pending integration commit at evidence capture).
- Focused evidence: `npm run test:physical-cargo` proves source decrement at pickup exactly once, the same carried stack and job survive save/load, destination increment occurs once, cancellation and crew death return and requeue the stack without duplication, and a shared bulky-cargo corridor completes measurably slower than separated routes. The worker also passed movement-coordinator, passenger-transfer, queue-spill, exterior-integrity, build, and whitespace checks.
- Physical implementation: a bulky load moves on a visible cart plate, reserves the tile it leaves and enters until its tail clears, and cannot use ordinary actor swaps. Pickup and recent drop-off are marked at their real inventory nodes; no abstract cargo throughput score substitutes for those claims.
- Remaining uncertainty: the focused contention case demonstrates lower combined shared-corridor throughput but does not yet prove that both individual streams are delayed in the same run; luggage is not an inventory item; conflict lacks a dedicated world warning; and cargo does not yet contend with boarding in the same fixture. Those compound boxes remain open.

2026-07-27 · Authored opening-business choice

- Commit or files: `42fedb4`, `src/sim/initial-state.ts`, `src/sim/opening-recipes.ts`, `src/sim/sim.ts`, `src/main.ts`, `src/styles.css`, and `tools/opening-business-tests.ts`.
- Focused checks: `npm run test:opening-businesses`, `npm run test:opening-procurement`, `npm run test:pod-demand-accounting`, `npm run build`, and `git diff --check` passed. A fresh station has no operating public business; opening cash funds any one of Food, Supplies, or Refuel Pods but not two; the real starter apron supports a powered public cafeteria or rotated narrow market; and stock at the operation's physical fixtures is required before it opens.
- Visual/playtest evidence: inspected `http://127.0.0.1:5183/?scenario=starter`. The Businesses palette presents three distinct first investments with current machine capacity and one next world action. The legacy tier summary and later progression button remain hidden until an operation is live; the Global Goal remains the opening north star. Public and Crew-only zoning are visible controls. Sprites load by default and the existing interface-hide control remains available.
- Remaining uncertainty: the shared crew mess is a cheap food conversion with a deliberate crew/guest traffic tradeoff rather than a completely empty food shell. The first-business service outcome, profitability, and clarity still require the user's fresh playtest; those Phase 8 gate items remain open.

2026-07-27 · Missing public food and phantom-queue correction

- Commit or files: `222497d`, meal-target selection in `src/sim/sim.ts`, immediate world feedback in `src/render/render.ts`, and `tools/opening-business-tests.ts`.
- Focused evidence: `npm run test:opening-businesses` proves a visitor cannot enter `Queueing` without a physical public provider. A crew-only mess may remain visible but is not treated as public capacity; the visitor receives `no public meal service`, records missed demand, and chooses another service or departure.
- Visual/playtest evidence: a fresh live `?scenario=starter` run showed the first unsupported diner clear the Pod Dock collar, announce `No public food?`, and produce the alert `A diner could not find public food service`; no line formed at the arrival tile.
- Remaining uncertainty: the crew-only status of the starter mess needs stronger world labeling so this deliberate opening constraint does not look like a pathing defect.

2026-07-27 · Passenger boarding and freight contention

- Commit or files: movement attribution and telemetry in `src/sim/sim.ts`, `src/sim/types.ts`, `src/sim/initial-state.ts`, and `src/sim/save.ts`; world feedback in `src/render/render.ts`; deterministic fixture `?scenario=cargo-boarding-conflict`; and `tools/physical-cargo-tests.ts` (pending integration commit at evidence capture).
- Focused evidence: `npm run test:physical-cargo` proves a bulky cart and a boarding passenger cannot exchange through one another, both lose movement time, both receive the correct physical blocker reason, `publicCargoConflictSeconds` records actor-time, and separated lanes allow both actors to move.
- Visual/playtest evidence: inspected `http://127.0.0.1:5183/?scenario=cargo-boarding-conflict&diag=1`. The paused production state renders the cart and passenger at the collision and displays `PASSENGERS BLOCKING FREIGHT` directly above them; the conflict remains readable with the interface hidden at Fit Station zoom.
- Remaining uncertainty: the broader boarding checklist still needs a player-facing route/highlight treatment and a combined three-way door, queue, and cargo presentation.

2026-07-28 · Meal queue blocks a real boarding throat

- Commit or files: `src/sim/cold-start-scenarios.ts` (`?scenario=meal-queue-boarding-conflict`), `tools/meal-queue-boarding-conflict-tests.ts`, and `package.json` (pending integration commit at evidence capture).
- Focused evidence: `npm run test:meal-queue-boarding-conflict` passed twice. The runner admits two ordinary medium passenger manifests through production Approach Control, docks and disembarks both, then proves a stocked diner cohort holds distinct live queue reservations with one diner in the active meal line physically on the Cafeteria Door shared with the second Berth. The return contract enters normal recall/boarding, its passenger records the meal-line actor as its physical blocker and accumulates transfer wait, boards fewer people than the clear-route comparison under the same deadline, increments `hardDeadlineDepartures`, and strands a passenger with origin provenance. Meal completion is accepted only when the canonical `serviceLog` has the matching meal event; the runner also repeats the seeded conflict and requires identical outcomes.
- Remaining uncertainty: this is a deterministic interaction proof rather than a polished live player showcase. The broader boarding checklist still needs a player-facing route/highlight treatment and a combined three-way door, queue, and cargo presentation.

2026-07-28 · Directional charter frontage

- Commit or files: `src/sim/approach-envelopes.ts`, `src/sim/map-conditions.ts`, `src/sim/sim.ts`, `src/render/render.ts`, and `tools/site-charter-tests.ts` (pending integration commit at evidence capture).
- Focused evidence: filtered `npm run test:site-charter` checks prove direct, cross-lane, and opposed approaches have ordered physical approach rates; two identical high-debris charters at different system-map positions rotate the exposed station face; the no-charter golden condition path remains untouched. `npm run build` and `git diff --check` pass.
- Player-facing behavior: automatic interface selection now prefers a ship's arrival-facing Pod Dock or Berth, while legal cross-station routing remains available at a visible time cost. Inspecting or placing a physical interface labels its facing as busy, steady, or quiet and calls out debris exposure, bright space, cool pockets, or shelter directly beside the approach envelope. Existing lane generation makes high-volume directions produce more traffic; existing exterior-integrity sampling consumes the now-directional debris field; existing solar and room-heat simulation consume the shown sunlight field.
- Remaining uncertainty: the station-world label still needs a fresh chartered live visual capture; high-load room placement against a cool pocket and charter-driven trade-composition/service mix remain open; mitigation is already covered by Truss and EVA repair but still needs to be explained alongside the placement forecast.

2026-07-27 · Facility-scale market operation

- Commit or files: `src/sim/facility-descriptors.ts`, market flow and crew dispatch in `src/sim/sim.ts`, market status presentation in `src/render/render.ts`, authored `?scenario=facility-scale`, and `tools/facility-slots-tests.ts` (pending integration commit at evidence capture).
- Focused evidence: `npm run test:facility-slots` proves physical shelf browsing, exclusive stock claims, FIFO checkout, stocked and empty outcomes, abandonment of an unstaffed register, two distinct register/customer pairs, measured one-versus-two-register throughput, temporary-bunk exclusivity, and protection of physically posted Stewards from unrelated general dispatch.
- Visual/playtest evidence: the first wall-adjacent Checkout Bank had no legal customer frontage and therefore zero queue capacity. Moving it inward produced eight physical line positions, two live registers, visible stocked aisles, and completed sales. This is the intended spatial tradeoff: the larger fixture earns throughput only when the player budgets public frontage, staff space, stock access, and floor area.
- Remaining uncertainty: the throughput comparison is deterministic runner evidence rather than a live before/after player capture; restocking is sourced physically but its staff-side route needs a dedicated visual fixture; compact Market Stall compatibility still exists; and the larger cantina, Reception, wash, cabin, and connected-bar fixtures remain open.

2026-07-27 · Visit scheduling, save migration, and deterministic scale cadence

- Commit or files: visit timing and reasons in `src/sim/types.ts`, `src/sim/sim.ts`, and `src/sim/save.ts`; `tools/failed-stay-tests.ts`; new `tools/phase9-save-migration-tests.ts`; and `tools/target-scale-perf.ts` (pending integration commit at evidence capture).
- Focused evidence: `npm run test:failed-stay` proves cohort-level early recall after sustained failure and bounded extension for unfinished work. `npm run test:phase9-save` preserves five visit-phase records, exact contract timings, exactly-once settlement, partial construction, and breached exterior integrity while clearing stale paths, queue slots, reservations, occupancy, and invalid dock bindings. `npm run perf:target-scale` repeats a sealed 16,800-tile fixture with 50 crew, 50 visitors, and ten interfaces deterministically, at roughly 28 ms p95 simulation tick and 258 MiB RSS on this machine.
- Correctness fix: room operations and local atmosphere cadence now use simulation time rather than wall-clock/render throughput. Fast-forward, a slow machine, and a smooth renderer therefore produce the same oxygen and operational results.
- Visual/playtest evidence: `?scenario=visit-schedule-showcase` stages two docked Berths at ordinary play zoom. The red passenger chip reads `EARLY RECALL | SERVICES FAILED`; the blue industrial chip reads `EXTENDED | WORK REMAINS` with its remaining time. The production transitions and save persistence remain covered by `test:failed-stay` and `test:phase9-save` rather than being faked by the presentation fixture.
- Remaining uncertainty: the scale fixture intentionally has little active work at its sample boundary and is not the full 50/50 mixed-operation gate; the broader `test:port-ops` runner retains obsolete assumptions about the pre-choice starter and needs an authored Berth fixture rather than patched expectations.

2026-07-27 · Construction block diagnosis

- Commit or files: blocked structural-project world feedback in `src/render/render.ts` (pending integration commit at evidence capture).
- Focused evidence: `npm run test:structural-expansion` remains green for planning, staging, Airlock/EVA routing, material custody, phased work, cancellation, save/resume, and commissioning.
- Visual/playtest evidence: `?scenario=structural-expansion-blocked` now anchors `BLOCKED · NO AIRLOCK EVA ROUTE` directly over the red exterior blueprint. `?scenario=structural-expansion-active` shows the corresponding active EVA sites and worker, making the missing physical prerequisite diagnosable without opening a data panel.
- Remaining uncertainty: missing material, staging, oxygen, seal, and obstructed-position reasons need equivalent live captures; a complete starter expansion still needs to be watched through sealed pressurization.

2026-07-28 · Explicit structural seal commissioning

- Commit or files: structural stages and save migration in `src/sim/types.ts` and `src/sim/save.ts`; commissioning authority in `src/sim/construction.ts`; recoverable EVA and sustained obstruction reporting in `src/sim/sim.ts`; `SEAL` world marker in `src/render/render.ts`; and focused coverage in `tools/structural-expansion-tests.ts` (pending integration commit at evidence capture).
- Focused evidence: `npm run test:structural-expansion` proves perimeter-before-interior staging, whole-shell validation before inspection, a real zero-material EVA seal job, no topology mutation during partial inspection, save/resume during the seal pass, support revalidation, and atomic commission only after the supported shell passes. Missing perimeter and doorway cases report exact tile coordinates.
- Player-facing behavior: the final exterior worker pass renders as `SEAL`; low oxygen sends the worker back toward an Airlock and exposes `EVA OXYGEN LOW` or `EVA OXYGEN DEPLETED`; incidental crowd contention must persist for the movement replan threshold before it becomes `WORK POSITION OBSTRUCTED`.
- Remaining uncertainty: low-oxygen and obstructed-position blockers still need dedicated deterministic runners and live captures, so those two checklist claims remain open. A complete player-built starter wing still needs a live end-to-end commissioning pass.

2026-07-28 · Practical completion reset and opening comparison

- Commit or files: practical gate order in this checklist; compact opening-business comparison in `src/main.ts` and `src/styles.css` (pending integration commit at evidence capture).
- Focused checks: `npm run build` and `git diff --check` passed. The live starter at `?scenario=starter` presents Food, Supplies, and Refuel together above one selected detail/action area; selecting Supplies changes the detail without losing the three-way comparison.
- Visual/playtest evidence: inspected at the normal in-app browser viewport. All three investments, current remaining capital, and observed demand fit in the first sidebar view while the station remains visible. The starter visibly contains a finite hull, one south Airlock, a three-tile Truss finger, and open east/west expansion faces.
- Remaining uncertainty: this closes stale starter evidence and improves comparison, but Gate A remains open until Supplies and Refuel each complete a normal UI operating cycle and stored starter attachments are validated.

2026-07-28 · Practical Gate A/B checkpoint

- Commits or files: `68df873` (opening comparison), `f571275` (explicit stored-starter Pod Dock attachment rebuild), `4f643cd` (staffed checkout scaling), `src/sim/facility-descriptors.ts`, `src/sim/sim.ts`, `src/render/render.ts`, and this ledger.
- Focused evidence: `npm run test:opening-businesses`, `npm run test:opening-procurement`, `npm run test:facility-slots`, `npm run baseline:frontage`, and `npm run build` passed. A fresh opening funds one of three businesses; markets require shelf stock plus staffed physical checkout; supplier and fuel orders use physical dock hardware; one versus two Checkout Banks exposes two versus four service positions; and the facility runner proves an unstaffed/overloaded line and measured throughput improvement.
- Visual/playtest evidence: after a normal New Game and charter flow, Food, Supplies, and Refuel remain simultaneously visible. Supplies selects a 24-tile public Market as its first world action; Refuel selects a Pod Dock Fuel Coupler. Market fixtures render their live stock, staffed-register count, and queue length over the world objects.
- Remaining uncertainty: Gate A still needs one preserved start-to-revenue operating-cycle capture. Gate B still needs the live bad/improved comparison; its deterministic comparison exists, but the ledger does not treat that as a substitute for player-facing inspection.

2026-07-28 · Normal structural planning controls

- Commit or files: normal structural tools in `src/main.ts` and `src/styles.css`; Truss planning/EVA work in `src/sim/construction.ts`; focused coverage in `tools/sim-tests.ts` and `tools/structural-expansion-tests.ts` (pending checkpoint commit at evidence capture).
- Focused evidence: `npm run test:structural-expansion` and `npm run build` passed. Existing construction truth plans Truss only in open space adjacent to hull or planned construction, charges one scaffold kit, and creates an EVA-required construction site.
- Visual/playtest evidence: the normal `?scenario=starter` Build palette now visibly exposes Truss, Airlock, and Cancel Build together. These were previously functional but hidden behind `?truss` and two CSS suppression rules.
- Remaining uncertainty: this proves planning is discoverable, not a full Gate C build. A normal-start player still needs to weld the scaffold, plan the hull, save/resume, and commission one sealed wing in a preserved live run.

2026-07-28 · Exterior module construction authority

- Commit or files: EVA classification in `src/sim/construction.ts`; focused contrast in `tools/structural-expansion-tests.ts` (pending checkpoint commit at evidence capture).
- Focused evidence: `npm run test:structural-expansion` proves a replacement Pod Dock creates an EVA-required module site while a replacement Table on an initialized pressurized interior remains ordinary construction. `npm run build` passed.
- Remaining uncertainty: the exterior worker animation already exists, but a Pod Dock installation still needs a preserved live capture before the catalogue's visual proof is complete.

2026-07-28 · Restricted crew-mess opening guidance

- Commit or files: `src/sim/opening-recipes.ts`, `src/main.ts`, and `tools/opening-business-tests.ts` (pending checkpoint commit at evidence capture).
- Focused evidence: `npm run test:opening-businesses` passed all six opening truth checks, including the fresh starter's restricted crew mess remaining non-operational for visitors.
- Visual/playtest evidence: a normal live starter at 4x admitted its first pod traffic. Food demand was correctly missed rather than forming a phantom queue, but the Food comparison card reported the private counter and seats without naming their access restriction. The readout now labels those fixtures `CREW MESS CANDIDATE`, preserving the deliberate choice between sharing that room and building a separate public cafeteria without implying it already serves travelers.
- Remaining uncertainty: Gate A still requires the player to complete one public business and observe its first revenue cycle; this checkpoint fixes the guidance discovered before that build, not the gate itself.

2026-07-28 · First public food revenue cycle

- Commit or files: `tools/opening-business-tests.ts`, `src/sim/cold-start-scenarios.ts`, and `src/main.ts` (pending checkpoint commit at evidence capture).
- Focused evidence: `npm run test:opening-businesses` now passes seven checks. Starting from the ordinary life-safe shell, the added operating-cycle contract builds a coherent 21-tile public Cafeteria through production room/module APIs, stocks two physical counters, admits ordinary automatic pod traffic, and requires a real `Prepared meal sold` ledger event, increased credits, and an incremented served-meal total. `npm run build` passed.
- Visual/playtest evidence: inspected `?scenario=opening-food-cycle`. The paused result shows two active pods, two visitors, `+4c` live revenue, one visitor served, 53 remaining servings across three physical counters, and the authored 2-counter/8-seat public Cafeteria marked operational. While the call remains docked, the Food card now reads `1 sale this visit · report pending` rather than incorrectly claiming no demand; final wanted/served/missed accounting still settles at departure.
- Remaining uncertainty: this closes the first visible-demand proof, not all of Gate A. Supplies and Refuel still need equivalent start-to-revenue operating-cycle evidence, and a manual small-viewport construction pass remains desirable when the browser driver supports reliable canvas coordinates.

2026-07-28 · Three opening revenue streams and physical market frontage

- Commit or files: `src/sim/sim.ts`, `src/sim/opening-recipes.ts`, `tools/opening-business-tests.ts`, `tools/opening-refuel-cycle-tests.ts`, and `package.json` (pending checkpoint commit at evidence capture).
- Focused evidence: `npm run test:opening-businesses` passes nine checks and `npm run test:opening-refuel-cycle` passes. Starting from the ordinary physical starter, Food records a paid prepared-meal service, Supplies consumes located Shelf Aisle stock through a physically staffed Checkout Bank and records a paid travel-supplies sale, and Refuel consumes piped Fuel Tank stock at a real Pod Dock and records a positive fuel sale. Market demand is now available at tier 0, matching its role as one of the three opening choices, and a stocked market proactively holds its Steward post instead of dispatching too late for a short shopper visit.
- Bad/improved comparison: a wall-adjacent Checkout Bank retains its built investment but remains non-operational with the actionable reason `Leave open floor in front of the Checkout Bank so shoppers can form a line`; moving the same bank one tile inward supplies physical line capacity and completes ordinary shopper sales.
- Live-browser observation: the normal starter keeps Food, Supplies, and Refuel visible together. Selecting Supplies shows the 24-tile spatial machine and explicitly names Steward checkout duty plus Cargo Handler restocking. The facility-scale showcase reports Supplies operational, while the fuel showcase exposes tank stock, the missing Coupler, and the open pipe requirement on the Refuel card.
- Remaining uncertainty: Gate A still needs a normal-start player construction pass for Supplies and Refuel, plus a second viable operating/layout choice for Refuel. These focused cycles prove the simulation contracts and truthful diagnosis without claiming that broader playtest complete.

2026-07-28 · Opening choice promoted into the Global Goal

- Commit or files: `src/main.ts` and this execution ledger (pending checkpoint commit at evidence capture).
- Player-facing contract: the first Global Goal now explicitly requires `Open Food, Supplies, or Refuel` before revenue and served-traveler progress can establish the port. This preserves one north-star progression surface while leaving the three spatial recipes as genuine choices beneath it; the player still authors the room, fixture placement, staffing, utilities, and stock rather than accepting a prefab or modal specialization.
- Live-browser observation: inspected the ordinary `?scenario=starter` at the normal viewport. The Global Goal reads `Open Food, Supplies, or Refuel · 0/1`, `Earn business revenue · 0/500c`, and `Travelers served · 0/20`; the three comparable business cards remain visible together, and the starter's 320 credits can fund one complete path but not two.
- Focused checks: `npm run build` and `git diff --check` passed.
- Remaining uncertainty: this closes the authored-decision requirement, not the whole coherent-opening gate. The user still needs to perform the normal-start Supplies and Refuel construction passes, and legacy tier messaging after the first operation remains a separate reconciliation item.

2026-07-28 · One player-facing progression spine

- Commit or files: `src/main.ts` and this execution ledger (pending checkpoint commit at evidence capture).
- Design resolution: Global Goals are the player-facing progression spine, while Food, Supplies, and Refuel are authored choices beneath the first goal. The legacy tier ladder remains an internal capability mechanism for now and no longer reappears inside the goal card or normal command UI after the first business opens.
- Live-browser observation: inspected `?scenario=opening-food-cycle` after a paid meal. The first Global Goal shows the business criterion complete and live revenue/traveler progress (`1/1`, `4/500c`, `1/20`) with no Tier summary, roadmap, specialization branch, or second progression instruction visible.
- Remaining uncertainty: future facility prerequisites still need to become more concrete as later content is refined, but they no longer compete with the opening objective as an independent ladder.

2026-07-28 · Paused Supplies and Refuel revenue showcases

- Commit or files: `src/sim/cold-start-scenarios.ts`, `src/sim/opening-recipes.ts`, `src/sim/sim.ts`, `tools/opening-refuel-cycle-tests.ts`, and this execution ledger (pending checkpoint commit at evidence capture).
- Focused evidence: `npm run test:opening-businesses` passes nine checks, `npm run test:opening-refuel-cycle` passes, `npm run build` passes, and the fuel supplier ledger now identifies its cargo as fuel rather than travel supplies.
- Live-browser observation: `?scenario=opening-supplies-cycle` pauses after a staffed Checkout Bank consumes physical Shelf Aisle stock and records a paid sale. `?scenario=opening-refuel-cycle` pauses after a supplier pod fills a piped Fuel Tank and an ordinary pod consumes four units for a paid refuel. The Refuel card remains `operational` after that sale, and the Global Goal reads `Open Food, Supplies, or Refuel · 1/1`.
- Design correction: recipe stock rows remain healthy replenishment targets, while operational status now means the machine can serve its next customer. One normal sale can no longer erase the player's completed opening choice.
- Remaining uncertainty: Gate A still needs a hands-on normal-start construction pass at a small viewport and a second clearly authored Refuel layout choice; the three production cycles themselves are now directly inspectable rather than inferred from tests.

2026-07-28 · Live EVA expansion completion and resumed-worker routing

- Commit or files: `src/sim/sim.ts`, `tools/structural-expansion-tests.ts`, and this execution ledger (pending checkpoint commit at evidence capture).
- Correctness fix: after completing an exterior site, an EVA courier can now route back through an active Airlock to collect the next construction kit instead of asking interior pathfinding to cross open space. Suited workers intentionally outside on an active EVA route are excluded from crew-facility reachability warnings, preventing a false sealed-wing diagnosis while they work.
- Focused evidence: `npm run test:structural-expansion` passes. The runner saves a partially delivered structural project, hydrates it in the intentionally paused load state, resumes play, completes every perimeter/interior/seal job, atomically commissions the wing, and verifies idle EVA workers return through an Airlock.
- Live-browser evidence: `?scenario=structural-expansion-active` was reloaded from the normal starter-derived fixture and run at 4x. Its visible Work Queue fell from seven construction jobs to two and then `No queued work`; the exterior project commissioned without a stranded worker or false crew-quarters alert.
- Remaining uncertainty: the fixture begins with its valid Truss patch already placed, so visible player-built Truss welding remains open. Dedicated live captures are still required for low EVA oxygen, obstructed work position, and the subjective first-expansion presentation claim.

2026-07-28 · Physical EVA frontage work and material diagnosis

- Commit or files: exterior work-face resolution in `src/sim/construction.ts`; focused behavior in `tools/structural-expansion-tests.ts`; live fixtures in `src/sim/cold-start-scenarios.ts`; and this execution ledger (pending checkpoint commit at evidence capture).
- Correctness fix: exterior wall hardware was classified as EVA work but resolved its target to the pressurized interior service face. Pod Docks, Fuel Couplers, Freight Lockers, and Maintenance Sockets now select an actual space-facing work tile, allowing suited workers to deliver and install them from outside.
- Focused evidence: `npm run test:structural-expansion` passes. It plans a new Truss extension through the normal construction API, observes a suited worker, and waits for the real tile commission; it separately rebuilds a starter Pod Dock through physical delivery and exterior work, while retaining the contrast that an interior Table does not require EVA. A zero-stock project asserts `no construction materials` on its blocked site.
- Live-browser evidence: `?scenario=structural-expansion-material-blocked` renders `BLOCKED · NO CONSTRUCTION MATERIALS` over the affected exterior blueprints. `?scenario=structural-truss-active` starts a normal EVA-required Truss extension from the starter scaffold, with its world blueprint and construction progress visible when panels are hidden.
- Remaining uncertainty: the Pod Dock completion contract reduces that test site's material/work totals so the runner proves route and custody without spending minutes on balance-scale hauling. Production costs remain unchanged and need a later construction-economy pass. Low EVA oxygen and sustained work-position obstruction still need dedicated proof.

2026-07-28 · Active 50/50 mixed-operation scale checkpoint

- Commit or files: `src/sim/cold-start-scenarios.ts` (`?scenario=normal-scale-50`), active traffic and path-budget work in `src/sim/sim.ts`, utility-underlay identity reuse in `src/sim/utility-underlay.ts`, `tools/normal-scale-operation-tests.ts`, `tools/meal-queue-boarding-conflict-tests.ts`, `package.json`, and this execution ledger (pending checkpoint commit at evidence capture).
- Focused evidence: `npm run test:normal-scale-operation` starts with exactly 50 crew, 50 visitors, eight Pod Docks, two Berths, and 40 units of free physical storage. During 240 simulated seconds it completes inspection and both physical inbound lots (six raw materials plus four trade goods), serves seven meals, overlaps Pod and Berth traffic, records 61 peak visitors and five simultaneous ships, keeps at least 9.5 power in reserve, and drains a queue that peaks at 15 to zero. Simulation p95 is 8.771 ms, path-call p95 is 27, and the utility-underlay resize/identity regression passes. `npm run perf:target-scale` remains deterministic at roughly 8.3 ms p95 with 50 crew, 50 visitors, and ten interfaces. `npm run test:physical-cargo`, `npm run test:mixed-berth-visit`, `npm run test:movement-coordinator`, `npm run test:meal-queue-boarding-conflict`, `npm run test:queue-spill`, and `npm run build` pass.
- Live-browser evidence: inspected `?scenario=normal-scale-50&diag=1&seed=915502` at Fit Station zoom and 4x. The station remained legible with two reactor cells, the observatory solar field, eight legal Pod Docks, both Berths, and dense crew/visitor traffic. The guaranteed mixed call progressed from zero to four to all ten inbound units unloaded and reached `OPEN`; observed occupancy moved from 73 to 63 to 51 visitors while departures recovered to four per minute, without a persistent exit-backup warning at cargo completion.
- Design and correctness notes: the scenario now seeds near-full physical storage after demo migration instead of relying on the obsolete full legacy stock scalar; the cafeteria is explicitly self-service rather than parking cooks at counters; dock access requires a legal station-interior route; traffic job assignment uses a bounded rotating candidate budget; idle job boards refresh on cadence; and already correctly sized utility-underlay arrays retain identity until a map resize requires rebuilding them.
- Remaining uncertainty: this authored active fixture is not the required organic start-to-large-station playthrough. The browser observation did not archive raw renderer/rAF sample distributions, and the guaranteed mixed call was observed through cargo completion rather than final passenger settlement. Gate E and Gate F integration review and the final opening-to-large-station report remain open.

2026-07-28 · Gate E durable live-shift integration

- Commits or files: integrated Claude commit `9bdbcc2` as `ebba2d7`; durable reconstruction in `src/sim/save.ts` and `src/sim/save-recovery.ts`; focused coverage in `tools/gate-e-save-resume-tests.ts` and the existing facility-slot runner.
- Focused evidence: `npm run test:gate-e-save-resume` passes six fixtures. Seed 4242 restores byte-identical system, lane, site, and forecast identity; a partially blocked structural project retains phase, progress, reason, and age; three ships and their passengers preserve a unique approach commitment while four interfaces are re-diagnosed; held cargo remains exactly once, one valid repair job regenerates, and one of three competing bunk claims survives; the 50-crew/54-visitor stress save restores 8 Docks, 2 Berths, 28 jobs, live transfers, no duplicate ownership, and no pathless actors after 20 seconds; a stripped legacy snapshot falls back deterministically and remains playable. `npm run test:facility-slots`, `npm run test:occupant-loop`, `npm run test:mixed-berth-visit`, and `npm run build` also pass on the integrated branch.
- Review judgment: the ledger checks interface-diagnosis reconstruction because the runner proves it directly. It does not check broad structural-graph, approach-group, congestion, legacy Dock/Berth geometry, or full-playthrough save claims whose present evidence is indirect or too weak.
- Remaining uncertainty: the Gate E runner's approach-group assertion only proves reconstruction returns a valid count, not a nontrivial conflict topology. Legacy occupant-field defaults and edited/replaced legacy Berth geometry still require dedicated fixtures.

2026-07-28 · Gate F physical-facility integration and lead review

- Commits or files: integrated Claude commit `aa532c7` as `6fc92a5`; shared descriptors and exclusivity in `src/sim/facility-descriptors.ts`, `src/sim/facility-slots.ts`, and `src/sim/facility-machines.ts`; market/bar/reception behavior in `src/sim/sim.ts`; seven scenarios in `src/sim/cold-start-scenarios.ts`; `tools/gate-f-facility-scale-tests.ts`; renderer, palette, atlas, and sprite-key integration.
- Focused evidence: `npm run test:gate-f-facility` passes nine grouped checks. It proves exclusive slot claims and cleanup, 102 units of market stock conserved through receiving/backroom/shelf/sale, two versus four registers, compact restock crossing versus separated routing, one connected three-piece bar with seven guest and three staff positions, independent service/dwell limits, dry versus stocked service, every depicted large-fixture position, partial Reception reveal with four processed and four bypassed guests, and save/load reconstruction without stale claims or stock duplication. The strengthened Reception check requires physical processing, exactly one additional revealed want per completed session, finite bypass, and zero fully exposed multi-want itineraries.
- Lead corrections: multi-tile service completion now resolves the placed module through footprint occupancy rather than reading only the origin tile; completed Reception visitors remain in the actor update instead of being dropped; Reception reveals one additional want rather than the whole remaining plan; the comparison uses real Lounge/comfort fixtures and disables unrelated ambient traffic; connected-bar service recognizes every depicted footprint position. `npm run test:normal-scale-operation` remains green at 50 crew/50 visitors with all 10 inbound units handled, seven meals, a queue recovering from 15 to zero, and 8.395 ms simulation p95.
- Live-browser evidence: inspected `market-compact-conflict`, `market-improved-flow`, `cantina-expanded`, `reception-staffed`, and `long-stay-guest-wing` in the integrated build at the normal viewport with panels hidden. Checkout count, backroom separation, connected Service Bar/Corner/End geometry, Booth/Standing capacity, two Arrival Desk processors, Guest Cabins, Serving Line, Community Table, and Wash Bank are legible at gameplay scale. The staffed Reception comparison was run at 4x after the lead fixes without the earlier false `nowhere to sit` diagnosis.
- Remaining uncertainty reopened by review: Reception processing/reveal is proven, but measured routing improvement and readable redirection are not; canonical drink completion remains broken for connected-bar seats and optional legacy drinks; Community Table meal truth likely has the same fixture-identity gap; the long-stay showcase contains no authored cohort and its separate room blocks are not a connected service loop; all 46 Gate F PNGs are correctly sized procedural placeholders rather than final curated art; `Fit Station` does not reliably frame the detached scenario blocks. Those claims remain unchecked and are explicit follow-up work.

2026-07-28 · Gate F canonical drink and Community Table completion

- Commit or files: `src/sim/service-truth.ts`, the visitor completion path in `src/sim/sim.ts`, and strengthened production-path coverage in `tools/gate-f-facility-scale-tests.ts` (checkpoint commit pending at evidence capture).
- Focused evidence: `npm run test:gate-f-facility` passes ten grouped checks. The connected staffed bar draws physical stock, has four visitors carrying drinks at 40 seconds, and records 17 canonical completions at Booth Bank or Standing Rail positions by 80 seconds; at least one actor observed carrying at 40 seconds owns a later completion event. A deterministic legacy optional drink writes exactly one service event and one sale, increments its repeat counter once, adds no promised service, and cannot charge again on the next tick. An invalid Cantina tile writes no service or economy event and retains the carried drink and outstanding plan. A depicted Community Table seat enters ordinary eating, writes exactly one meal event naming `CommunityTable`, advances served-meal truth once, and clears the carried meal. `npm run test:occupant-loop`, `npm run test:mixed-berth-visit`, `npm run test:normal-scale-operation`, and `npm run build` pass; the normal-scale fixture handles all ten inbound cargo units, drains its queue from a peak of 15 to zero, retains utility-underlay identity, and records 9.562 ms simulation p95 in this run.
- Review judgment: the previous Gate F drink and Community Table completion gaps are closed. No additional broad slot or facility checkbox is marked because this checkpoint proves these two service identities, not every active want or every lounge/hygiene lifecycle.
- Remaining uncertainty: a provider removed at the exact service commit boundary is rejected without phantom payment, but the ordinary orphan-claim recovery paths—not this focused fixture—remain the evidence for eventual rerouting. The separate long-stay showcase, camera framing, and curated art work remain open.

2026-07-28 · Connected long-stay guest wing and scenario framing

- Commit or files: `src/sim/cold-start-scenarios.ts` (`?scenario=long-stay-guest-wing`), Gate F fixture truth in `src/sim/service-truth.ts` and `src/sim/sim.ts`, scenario-focused Fit Station bounds in `src/main.ts`, and the strengthened long-stay group in `tools/gate-f-facility-scale-tests.ts` (checkpoint commit pending at evidence capture).
- Focused evidence: `npm run test:gate-f-facility` passes ten grouped checks. Five distinct Dorm, Cafeteria, Cantina, Hygiene, and Lounge rooms are joined by pressurized two-lane passages; the authored cohort remains 8/8 present after 180 simulated seconds, every guest completes at least one recurring physical need, and the run records 7 meals, 8 drinks, 6 hygiene sessions, 23 comfort sessions, and 12 leisure sessions. Canonical events name Community Table, Booth Bank, Wash Bank, Guest Cabin or Bunk Bank, Couch, and Game Station fixtures rather than inferred room capacity. `npm run test:occupant-loop`, `npm run test:facility-slots`, `npm run test:normal-scale-operation`, and `npm run build` pass; normal scale handles all ten inbound cargo units, serves seven meals, drains a 15-person peak queue to zero, retains utility-underlay identity, and records 8.976 ms simulation p95 in this run.
- Live-browser evidence: loaded the long-stay scenario through one local server, hid the interface panels, ran at 4x, and invoked Fit Station. The complete five-room wing remains framed at playable scale; the Dorm-to-Cafeteria-to-Cantina and Dorm/Hygiene/Lounge passages are visibly continuous; eight guests move between the large fixtures; service/need floaters appear at their actual rooms; and the browser console reports no errors. Fit Station now uses whitelisted showcase bounds instead of zooming around unrelated starter-shell geometry.
- Review judgment: the meaningful Lounge/Cantina session item is checked because both production completion events and live occupied positions are now observed. This does not claim the Gate G repair-cohort, fixed/flexible schedule, failed-stay, or admission-policy requirements assigned separately to Claude.
- Remaining uncertainty: the scenario sits near the southern map edge, so some empty map padding can remain at unusual portrait viewport shapes even though the whole wing stays visible. The facility artwork is still procedural placeholder art pending the separate curated-art checkpoint.

2026-07-28 · Curated connected-bar artwork

- Commit or files: the 14 `module_service_bar`, `module_bar_corner`, and `module_bar_end` base/state PNGs in `tools/sprites/curated/`, plus the packed v1 atlas (checkpoint commit pending at evidence capture).
- Art and geometry evidence: every generated source was inspected before acceptance and again after chroma removal and reduction to its final `128x320` or `128x128` canvas. The Service Bar preserves four west guest positions and two east staff positions in base, active, unstaffed, empty, dirty, and damaged states; the Corner preserves one west guest and one east staff position; the End preserves two west guests and no staff position. Three rejected generations were not packed: one dirty Service Bar invented a fifth stool, and two Bar End attempts became reference-sheet collages; a fourth dirty End attempt widened the fixture footprint and was also rejected.
- Focused checks: `node tools/sprites/pack-atlas.mjs --profile v1`, `npm run sprites:validate:v1`, and `git diff --check` pass. The safe direct pack retained all 298 atlas keys and avoided both the placeholder generator that overwrites hand-authored sprites and the wrapper that prunes tracked archive baselines.
- Review judgment: this closes only the connected bar family's curated-art replacement. The remaining eight Gate F facility families and their state variants are still procedural placeholders, and the complete 46-key art handoff remains open.
