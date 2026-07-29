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
- [x] Every visual item has an inspected screenshot or live-browser observation.
- [ ] Every gameplay item is tested in a deliberately bad layout and an improved
  layout.
- [ ] Full-suite tests are reserved for integration gates; use focused runners
  during iteration.
- [x] Save/load is checked at each phase that adds durable state.
- [x] Performance is measured at each phase rather than deferred to cleanup.
- [x] Existing exactly-once settlement, topology invalidation, physical fixture
  reservations, and render/simulation separation remain intact.
- [x] `system-flow-map.html` remains untouched unless separately requested.

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
- [x] Record the focused commands and artifacts used for every phase gate.
- [x] Keep a running playtest findings section at the bottom of this file.

## Non-Negotiable Design Invariants

- [ ] Frontage emerges from hull geometry, structure, construction, approach
  clearance, interior support, and exposure rather than a frontage currency.
- [ ] Poor but physically legal layouts are allowed to open and fail visibly.
- [ ] Physically impossible layouts are rejected with one actionable world-space
  explanation.
- [x] Routine traffic never becomes a permanent manifest-reading chore.
- [x] Early manual Approach Control remains a meaningful portfolio decision.
- [x] Player-authored automation replaces repetitive approvals as scale grows.
- [x] Longer stays create recurring physical demand rather than passive timers.
- [x] Immediate consequences are visible in actors, objects, queues, and work.
- [ ] Rating and reputation summarize visible outcomes rather than replacing them.
- [x] Every service capacity corresponds to depicted physical positions.
- [x] Tile exclusivity is arbitrated with swap, yield and replan recovery. No
  hard occupancy cap gates pathing, and no naive universal cap is introduced.
- [x] Congestion is physical, fair, recoverable, and deterministic.
- [ ] Expansion reuses the existing construction, logistics, EVA, utility,
  maintenance, pressure, thermal, and save systems.
- [ ] Catastrophic failure is forecastable, attributable, and mitigable.
- [x] The intended 50-crew, 50-plus-visitor station is a baseline, not a stress
  test.
  Evidence: both authored geometries sustain 50 crew and 50 visitors with mixed
  Pod/Berth traffic, cargo, meals, zero venting/deaths, and bounded tick cost in
  `npm run test:normal-scale-operation`.

## Phase 0: Baselines And Instrumentation

### Deterministic Scenarios

- [x] Add a compact starter with two Pod Docks.
- [x] Add a four-Pod-Dock docking finger.
- [x] Add a medium Berth with two Gangways.
- [x] Add a bad single-door passenger terminal.
- [x] Add the same terminal with a second entrance or wider concourse.
- [x] Add a public/cargo crossing scenario.
- [x] Add a separated service-corridor comparison.
- [x] Add an overwhelmed one-checkout market.
- [x] Add a redesigned two-checkout market.
- [x] Add short errands, shore leave, and a long repair crew in one scenario.
- [x] Add one medium mixed passenger/freight repair-tender call that uses the
  production Approach Control, Berth, transfer, cargo, service, extension,
  recall, stranding, and settlement lifecycle.
  Evidence: `mixed-berth-visit`, `tools/mixed-berth-visit-tests.ts`.
- [x] Add reception-bypass and reception-assisted variants.
- [x] Add a debris-facing exterior wing.
- [x] Add a scale baseline with at least 50 crew, 50 simultaneous visitors, and
  5-10 active interfaces.

### Metrics

- [x] Record real-time ship visit duration by class.
- [x] Record concurrent ships and occupants.
- [x] Record holding-orbit and approach-group wait.
- [x] Record disembark and boarding duration.
- [x] Record queue length, spill length, balks, and provider utilization.
- [x] Record door wait and corridor congestion.
- [x] Record public/cargo conflicts.
- [x] Record recurring need demand and fixture utilization.
- [x] Record reception reveal and redirection time.
- [x] Record committed future Berth, bed, service, and staff load.
- [x] Record missed departures and stranded occupants.
- [x] Record maintenance work, damage, and EVA time.
- [x] Record average and p95 simulation-step cost.
- [x] Record render frame time and visible animation smoothness.

### Existing Caps Audit

- [x] Document current queue-spill and balk limits.
- [x] Document current occupancy/congestion cost caps.
- [x] Document route-discomfort and walk-penalty saturation.
- [x] Document rating-penalty caps that hide severe failure.
- [x] Demonstrate each cap in a controlled scenario before changing it.
- [x] Do not remove deadlock safety before movement coordination exists.

### Phase 0 Gate

- [x] One command produces the deterministic baseline report.
- [x] Bad and improved layouts show measurable differences.
- [x] Baseline artifacts are saved for later comparison.
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
- [x] Let repair traffic remain until work completes, aborts, or is cancelled.
- [ ] Tune Pod visits toward observable minutes rather than 10-30-second churn.
- [x] Tune traffic generation for useful concurrent occupancy.
- [x] Prevent any ship or Berth from remaining pinned after terminal resolution.

### World Feedback

- [x] Show ship purpose and visit phase beside the physical interface.
- [x] Show likely cohort-size and stay ranges without full itinerary disclosure.
- [x] Show recall and boarding physically.
- [x] Show early departure and extension reasons.
- [x] Keep ship details hideable on small screens.

### Phase 1A Save And Checks

- [x] Persist tenure, recurring needs, wants, origin ship, and departure contract.
- [x] Persist durable visit phase and timing.
- [x] Hydrate legacy visitors and residents with safe defaults.
- [x] Save/load a contract crew mid-stay.
- [x] Save/load during recall and boarding.
- [x] Verify settlement remains exactly once.
- [x] Focused check: a medium mixed call physically approaches, disembarks,
  serves a planned need, moves consigned freight, extends once, recalls,
  boards, strands missed passengers, cleans up and settles once.
  Evidence: `npm run test:mixed-berth-visit`.
- [ ] Focused check: repair crew repeatedly eats, sleeps, washes, and recreates.
- [ ] Focused check: fixed and flexible schedules behave differently.
- [x] Focused check: concurrent visits overlap without rapid replacement.

## Phase 1B: Physical Slots, Demand Discovery, And Facility Scale

### Universal Slot Contract

- [x] Generalize provider, fixture, seat, and queue reservations without breaking
  cafeteria behavior.
- [x] Give every active need/want a physical slot and duration.
- [x] Prevent two actors from owning one exclusive use slot.
- [x] Make depicted table seats individually reservable.
- [x] Make bed positions individually claimable for a sleep session.
- [x] Support temporary bed claims separately from permanent home assignment.
- [x] Make hygiene fixtures hold exclusive sessions for visible durations.
- [x] Make lounge and cantina positions hold meaningful leisure sessions.
- [x] Release stale slots after cancellation, departure, death, save hydration, or
  provider removal.

### Market Depth

- [x] Replace unlimited one-tile Market Stall behavior with limited checkout
  throughput.
- [x] Add stocked shelf or aisle browsing positions.
- [x] Require physical inventory for positive market feedback and sales.
- [x] Add stock collection from visible shelf/display inventory.
- [x] Add a staff-side restock route.
- [x] Add a real customer queue at checkout.
- [x] Make a second checkout produce a visible throughput improvement.
- [ ] Make shelf mix or goods category affect demand without creating a checklist.
- [x] Prevent `Great selection` feedback when no stock exists.

### Demand Discovery And Reception

- [x] Stop exposing a complete pre-rolled itinerary at spawn.
- [ ] Keep ship-level demand cues strong and learnable.
- [x] Reveal individual wants progressively through behavior.
- [x] Add optional Reception/Customs processing slots.
- [x] Make Reception reveal some demand earlier, never all of it.
- [x] Allow unprocessed occupants to enter and make a plausible choice.
- [x] Bound wrong-choice behavior to a readable redirect rather than random
  wandering.
- [x] Show the need or realization that caused redirection.
- [x] Make saturated Reception bypassable rather than a hard arrival gate.
- [x] Demonstrate that Reception improves routing in a mixed-demand crowd.

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
- [x] Ensure each fixture has a public use face.
- [x] Ensure staffed fixtures have a staff work face.
- [x] Ensure stocked fixtures have a delivery/service route.
- [x] Give larger fixtures greater absolute capacity and useful staffing
  efficiency.
- [x] Charge larger fixtures through footprint, staffing, stock, utilities,
  cleaning, maintenance, and queue frontage.
- [x] Preserve compact alternatives where irregular layouts make them useful.

### Large Fixture Artwork

- [x] Generate native-footprint low-resolution artwork after footprints stabilize.
- [x] Use transparent backgrounds and silhouettes readable at gameplay zoom.
- [x] Match sprite dimensions to simulation footprint exactly.
- [x] Add idle state.
- [x] Add occupied/in-service state.
- [x] Add unstaffed state where applicable.
- [x] Add low-stock/empty state where applicable.
- [x] Add dirty state.
- [x] Add damaged state.
  Evidence: curated native-footprint variants and production truth selection
  exercise 63/63 facility frames in `npm run test:facility-sprite-state`.
- [x] Add connected straight/corner/end bar rendering.
- [x] Verify sprites in the live game rather than only as source images.

### Phase 1B Gate

- [ ] One checkout visibly becomes overwhelmed.
- [x] A second checkout or redesigned queue improves measured throughput.
- [x] A larger cantina visibly supports more simultaneous occupants.
- [x] Large fixtures create meaningful queue, route, stock, staffing, and floor
  tradeoffs.
- [x] Beds cannot be double-claimed.
- [x] Reception helps without becoming mandatory.
- [x] Two seeded runs differ while remaining inferable.
- [ ] Playtest decides whether to proceed with deeper hidden demand.

## Failed Stay And Stranding Contract

- [x] Errand visitors can balk, abandon a purchase, and leave early.
- [x] Shore-leave passengers seek an alternative and obey recall.
- [x] A passenger who physically misses boarding becomes stranded.
- [x] Contract crews remain while their ship work is incomplete.
- [x] Poor contract-crew needs reduce cooperation or work productivity.
- [x] Extended/stranded guests consume temporary food, hygiene, and lodging.
- [x] Residents accumulate persistent stress and can withdraw from work or leave.
- [x] Implement visible `unmet` escalation.
- [x] Implement visible `balking` escalation.
- [x] Implement visible `distressed` escalation.
- [x] Implement bounded `disruptive` escalation.
- [x] Let prolonged failure cause mess, complaints, arguments, theft, vandalism,
  medical demand, or refusal to work as appropriate.
- [x] Ensure one missed meal cannot immediately trigger a serious incident.
- [x] Make distressed repair crews extend repair and Berth occupation.
- [x] Make extended occupation block or delay subsequent accepted traffic.
- [x] Allow emergency meal purchase.
- [x] Allow emergency temporary bunk capacity.
- [x] Allow repair prioritization or expediting.
- [x] Allow cohort compensation.
- [x] Allow evacuation or onward-transfer charter.
- [x] Allow contract cancellation with an explicit penalty.
- [x] Allow admission closure while recovering.
- [x] Reserve security intervention for genuinely disruptive occupants.
- [x] Give stranded occupants temporary accommodation and future departure.
- [x] Add an expensive relief transfer after a generous maximum disruption window.
- [x] Never silently convert a failed visitor into a resident.
- [x] Require housing availability and explicit policy for resident acceptance.
- [x] Let an accepted resident's origin ship depart normally.
- [x] Apply rating effects at meaningful milestones or resolution. Faction standing
  is deliberately out of scope: no faction-standing system exists to move.
- [x] Verify every rating change traces back to visible behavior.

## Approach Control And Admission Portfolio

### Small-Port Manual Control

- [x] Present a short list of incoming ship silhouettes tied to physical lanes.
- [x] Show ship/visit class at a glance.
- [x] Show likely party-size range.
- [x] Show likely stay range.
- [x] Show broad service or demand cues.
- [x] Show compatible interface and approach side.
- [x] Show expected revenue range.
- [x] Show committed capacity if accepted.
- [x] Provide `Accept`, `Hold`, and `Pass` without opening a large manifest.
- [x] Never pause automatically when an offer arrives.
- [x] Bind acceptance to a compatible docking slot or Berth reservation.
- [x] Project the candidate approach envelope into the world on hover/focus.
- [x] Project expected Berth, bed, meal, hygiene, and staff load.
- [x] Surface conflicts with already accepted work.

### Scaling Automation

- [x] Add simple auto-admission by ship class.
- [x] Add auto-admission conditions based on free compatible interface.
- [x] Add reserve-capacity conditions for beds or core services.
- [x] Add minimum-margin and maximum-stay conditions.
- [x] Add risk/faction conditions only when those systems are legible.
- [x] Allow manual override of an automation decision.
- [x] Keep large, uncertain, negotiated, military, and migrant commitments visible.
- [x] Aggregate routine lane pressure at large scale.
- [x] Avoid a priority spreadsheet.

## Phase 2: Structural Graph And Planning Overlay

### Structural Pieces

- [x] Promote existing Truss as the exterior scaffold and utility support.
- [x] Add Truss Junction with branch/span function.
- [x] Add Reinforced Bulkhead with heavy-load transfer function.
- [x] Keep Pod Dock as the small docking collar.
- [x] Keep Gangway as the passenger connection and boarding provider.
- [x] Keep Docking Clamp as vessel mass support.
- [x] Add no decorative structural checklist pieces.
  Evidence: the only new structural pieces are the functional Junction and
  Reinforced Bulkhead; `npm run test:structural-pieces` covers their contracts.

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
- [x] Cache support by structure/topology version.
- [x] Avoid per-tick structure scans.

### Planning Feedback

- [x] Add supported overlay state.
- [x] Add planned-support overlay state.
- [x] Add overloaded overlay state.
- [x] Add unsupported overlay state.
- [x] Explain unsupported span in world.
- [x] Explain missing Junction in world.
- [x] Explain excessive interface load in world.

### Phase 2 Gate

- [x] Unsupported hull planning is rejected.
- [x] A Junction enables a branch.
- [x] Reinforcement enables a heavy interface.
- [x] Legacy saves load as structurally valid.
- [x] Structural recomputation occurs only after relevant mutations.

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
- [x] Derive tie-in and doorway/airlock work.
- [x] Preserve editable plans before work completes.
- [x] Preserve cancellation and define material salvage/refund.
- [x] Preserve module movement and resale.

### Commissioning

- [x] Remove instant shell conversion from normal expansion.
- [x] Require structural completion before hull completion.
- [x] Require complete perimeter before seal check.
- [x] Keep incomplete shell unpressurized.
- [x] Perform visible seal check.
- [x] Commission and pressurize only a supported sealed shell.
- [x] Require EVA construction for exterior/unpressurized modules.
- [x] Report missing material.
- [x] Report missing staging route.
- [x] Report missing Airlock/EVA route.
- [x] Report low EVA oxygen.
- [x] Report incomplete seal.
- [x] Report obstructed work position.

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
- [x] Preserve stable physical interface identity.
- [x] Store hull connection, accepted ship class, access tiles, and envelopes.
- [x] Add binding slot reservations.
- [x] Add authoritative slot occupancy.
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
- [x] Verify every fleet sprite at actual gameplay zoom and on every lane rotation.

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
- [x] Show charter-facing lane traffic.
- [x] Show obvious interior throat or boarding warning.

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
- [x] Make one actor yield when a swap is unsafe.
- [x] Replan after bounded waiting using congestion.
- [x] Add route hysteresis to prevent oscillation.
- [x] Add bounded deadlock recovery.
- [x] Release stale movement and service reservations.
- [x] Keep interpolation independent from simulation speed.

### Spatial Capacity

- [x] Give doors one crossing resource and crossing time.
- [x] Give Airlocks explicit crossing capacity.
- [ ] Give narrow corridors low directional capacity.
- [ ] Give open concourses greater capacity.
- [x] Make carts/bulky cargo consume more movement capacity.
- [x] Preserve exclusive service/work/seat reservations.

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
- [x] A queue visibly covers and slows a door.
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
- [x] Make boarding contend with doors, queues, and cargo.
- [x] Make boarding and bulky cargo contend physically in a shared route.
  Evidence: `npm run test:physical-cargo` case
  `passenger-transfer-and-cargo-block-each-other-visibly`.
- [x] Make late boarding extend occupation or trigger explicit missed departure.
  Evidence: bounded extension plus stranded-passenger branch in
  `npm run test:mixed-berth-visit`.

### Per-Interface Diagnosis

- [x] Measure disembark throughput.
- [x] Identify door and Airlock choke points.
- [x] Identify queue spill across arrival/boarding routes.
- [x] Measure boarding distance and duration.
  Evidence: per-interface completed boarding totals now survive partial
  accumulation, save/resume, and repeated reload in
  `npm run test:interface-diagnosis`.
- [x] Measure reachable service and seating capacity.
- [x] Identify public/cargo route intersections.
- [x] Measure freight staging/storage distance.
- [x] Measure staff access to ship hardware.
- [x] Check utility and maintenance access.
- [x] Measure approach wait and Berth overstay.
- [x] Show only the most actionable diagnosis by default.
- [x] Highlight the physical route, door, queue, or interface when selected.

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
- [x] Make thermal-sink quality affect high-load expansion.
- [x] Make trade composition affect useful interface/service mix.
- [x] Keep each effect visible in Charter and station-world feedback.
- [x] Provide mitigation through shielding, redundancy, cooling, safer expansion,
  or policy.

### Phase 7 Gate

- [x] Debris-facing wing wears faster than protected comparison.
- [x] EVA repair visibly restores damage.
- [x] A true breach changes pressure and restores correctly.
- [x] Different charters make different expansion geometry attractive.
- [x] Risk remains forecastable and recoverable.

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
- [x] Let player add another Pod Dock or ship service.
- [x] Let player build an interior wing or docking finger.
- [ ] Let player save toward a first Berth.
- [x] Make each investment visibly change traffic or operations.
- [x] Keep common safety infrastructure orthogonal to portfolio specialization.

### Economy And Progression

- [x] Price Truss, hull, modules, labor, and maintenance coherently.
- [ ] Make first Berth a major but attainable capital achievement.
- [x] Keep capabilities visible rather than hidden behind arbitrary unlocks.
- [ ] Use rating to attract more valuable traffic.
- [x] Use Capital Projects as optional subsidies, not exclusive gates.
- [x] Reconcile global goal, business path, and legacy tier messaging.
- [x] Preserve a visible cumulative station rating with causal breakdown.

### Contextual UI

- [x] Keep Approach Control compact and hideable.
- [x] Keep alerts contextual/pop-out.
- [x] Put market operations at the market.
- [x] Put dock/Berth operations at the physical interface.
- [x] Keep future-load forecasting contextual to admission.
- [x] Avoid permanent panels for Alpha Watch, charter details, fuel, cargo arm, and
  work queue when no related context exists.
- [x] Use world-space chips and overlays before sidebar prose.
- [x] Never create overwide scheduling or operations panels.

### Structural And Operational Art

- [x] Generate low-resolution Truss Junction art.
- [x] Generate low-resolution Reinforced Bulkhead art.
- [x] Add planned/delivered/welding/complete/overloaded structural states.
- [x] Add scaffold/floor/wall/seal/pressurizing states.
- [x] Add approach reservation animation.
- [x] Add carried resource sprites.
- [x] Add Gangway and clamp deployment states.
- [x] Add hull wear/damage/breach/repair states.
- [x] Add door contention and late-boarding indicators.
- [ ] Verify every asset at actual gameplay size in the live renderer.

### Phase 8 Gate

- [x] New game requires a meaningful authored opening decision.
- [x] First business operation visibly serves real demand.
- [x] First expansion feels constructed rather than painted.
- [ ] First Berth changes station scale and operating pressure.
- [ ] UI explains current pressure without becoming a spreadsheet.

## Phase 9: Save Migration, Performance, And Full Playthrough

### Save Compatibility

- [x] Grandfather legacy hull support.
- [x] Derive approach envelopes for legacy Docks.
- [x] Adapt existing Berth geometry until edited/replaced.
- [x] Add safe defaults for new occupant state.
- [x] Add safe defaults for integrity/damage.
- [x] Persist construction and damage.
- [x] Persist durable ship visit and slot/queue ownership.
- [x] Rebuild structural graphs after load.
- [x] Rebuild approach conflict groups after load.
- [x] Rebuild congestion and movement intents after load.
- [x] Rebuild interface diagnoses after load.
- [x] Never persist stale actor paths or transient movement intents.
- [x] Preserve maintenance identity through map expansion and module movement.

### Performance

- [x] Cache structure by topology/structure version.
- [x] Cache approach groups by interface geometry version.
- [x] Recompute interface diagnoses only after relevant change or sustained
  traffic interval.
- [x] Resolve movement intents in a batch.
- [x] Keep congestion-field cost off the hot path. Measured, and a cadence was
  deliberately not taken -- see the dated entry for why the premise fails.
- [x] Avoid per-actor full A* on render frames.
- [x] Maintain an exterior target list for maintenance.
- [x] Keep render interpolation independent of simulation speed.
- [x] Profile every phase at baseline scale.
- [x] Profile final build at two to three times current station footprint.

### Full Playthrough

- [x] Start from the revised bare station.
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
- [x] Save, reload, and continue without stale reservations or lost commitments.

### Phase 9 Gate

- [ ] Desired baseline station remains smooth and readable.
- [ ] Two- to three-times scale remains operationally plausible.
- [x] Multiple station geometries remain viable.
- [x] Bad layouts create visible problems with more than one valid remedy.
- [ ] No phase depends on invisible modifiers as its primary consequence.

## Focused Runner Catalogue

- [x] Add structural support runner.
  Evidence: `npm run test:structural-support`, `npm run test:structural-pieces`.
- [x] Add phased construction/EVA runner.
  Evidence: `npm run test:structural-expansion`, `npm run test:commissioning-diagnostics`.
- [x] Add approach geometry/reservation runner.
  Evidence: `npm run test:approach-envelopes`, `npm run test:approach-control`,
  `npm run test:approach-geometry-cache`.
- [x] Add ship visit/settlement runner.
  Evidence: `npm run test:mixed-berth-visit`.
- [x] Add occupant tenure/needs runner.
  Evidence: `npm run test:occupant-loop`.
- [x] Add fixture-slot/reception runner.
  Evidence: `npm run test:facility-slots`, `npm run test:gate-f-facility`.
- [x] Add failed-stay/stranding runner.
  Evidence: `npm run test:failed-stay`, `npm run test:commitment-recovery`,
  `npm run test:gate-g-recovery-depth`, `npm run test:gate-g-metrics-admission`.
- [x] Add movement/queue/deadlock runner.
  Evidence: `npm run test:movement-coordinator`, `npm run test:queue-spill`,
  `npm run test:saturation-caps`.
- [x] Add cargo/boarding/support runner.
  Evidence: `npm run test:physical-cargo`, `npm run test:passenger-transfer`,
  `npm run test:meal-queue-boarding-conflict`, `npm run test:interface-diagnosis`.
- [x] Add integrity/pressure/EVA repair runner.
  Evidence: `npm run test:exterior-integrity`.
- [x] Add target-scale performance runner.
  Evidence: `npm run perf:target-scale`, `npm run perf:sim`,
  `npm run baseline:frontage`, `npm run test:normal-scale-operation`.
- [x] Document commands beside each completed phase.
- [x] Keep every runner on disk reachable from a package script.
  Evidence: nine runners existed in `tools/` with no script and therefore could
  not be invoked by any gate. All nine are now wired. `test:module-edit` matters
  most — it is the only proof of module move atomicity, credit neutrality,
  inventory preservation, and maintenance-identity preservation, which a checked
  Phase 9 row depends on, and it passes.

The full check surface, by area:

| Area | Runners |
|---|---|
| Whole simulation | `test:sim` |
| Structure and expansion | `test:structural-support`, `test:structural-pieces`, `test:structural-expansion`, `test:commissioning-diagnostics` |
| Approach and admission | `test:approach-control`, `test:approach-envelopes`, `test:approach-geometry-cache`, `test:gate-g-metrics-admission` |
| Visits, occupants, failure | `test:occupant-loop`, `test:mixed-berth-visit`, `test:failed-stay`, `test:commitment-recovery`, `test:gate-g-recovery-depth` |
| Facilities and slots | `test:facility-slots`, `test:gate-f-facility`, `test:facility-sprite-state` |
| Movement and saturation | `test:movement-coordinator`, `test:queue-spill`, `test:saturation-caps` |
| Cargo, boarding, interfaces | `test:physical-cargo`, `test:passenger-transfer`, `test:meal-queue-boarding-conflict`, `test:interface-diagnosis`, `test:ship-fleet`, `test:port-ops` |
| Charter and environment | `test:site-charter`, `test:charter-forecast`, `test:thermal-sink-expansion`, `test:exterior-integrity`, `test:phase7-risk-recovery` |
| Opening economy | `test:truth`, `test:opening-businesses`, `test:opening-refuel-cycle`, `test:opening-procurement`, `test:pod-demand-accounting`, `test:opening-economy`, `test:opening-economy-save`, `test:opening-economy-integration`, `test:capital-projects`, `test:commercial` |
| Utilities and freight | `test:opening-power`, `test:power-grid`, `test:pod-freight`, `test:sanitation`, `test:module-edit` |
| Save, scale, performance | `test:phase9-save`, `test:gate-e-save-resume`, `test:normal-scale-operation`, `test:phase8-opening-expansion`, `perf:sim`, `perf:target-scale`, `baseline:frontage`, `balance:port-ops` |
| Browser harness | `test:harness` |

Four newly-reachable runners fail against committed code and are tracked in the
handoff below rather than being silently left unwired: `test:opening-economy-integration`,
`test:opening-power`, `test:power-grid`, and `test:living-station-scenarios`.

## User Playtest Review

- [x] Provide a URL that opens the correct scenario/save.
- [x] Provide a short list of new interactions to try.
- [x] Provide one deliberately bad layout to observe.
- [ ] Provide the tools to improve that layout in world.
- [x] Ensure sprites are enabled by default.
- [x] Ensure panels can be hidden for visual inspection.
- [x] Preserve the user's quicksave separately from deterministic QA saves.
  Evidence: player and QA stores/autosaves use isolated persistence domains;
  quota trimming and Continue exclusion are covered by
  `npm run test:save-store-isolation`.
- [ ] Record user feedback against exact checklist items.
- [x] Reopen any checked item whose live behavior does not meet the requirement.

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

- Commit or files: normal structural tools in `src/main.ts` and `src/styles.css` (`e5a1155`). The Truss planning/EVA work in `src/sim/construction.ts` and the focused coverage in `tools/sim-tests.ts` and `tools/structural-expansion-tests.ts` are pre-existing truth this item relies on rather than files changed by that commit.
- Focused evidence: `npm run test:structural-expansion` and `npm run build` passed. Existing construction truth plans Truss only in open space adjacent to hull or planned construction, charges one scaffold kit, and creates an EVA-required construction site.
- Visual/playtest evidence: the normal `?scenario=starter` Build palette now visibly exposes Truss, Airlock, and Cancel Build together. These were previously functional but hidden behind `?truss` and two CSS suppression rules.
- Remaining uncertainty: this proves planning is discoverable, not a full Gate C build. A normal-start player still needs to weld the scaffold, plan the hull, save/resume, and commission one sealed wing in a preserved live run.

2026-07-28 · Exterior module construction authority

- Commit or files: EVA classification in `src/sim/construction.ts`; focused contrast in `tools/structural-expansion-tests.ts` (`2ffda46`).
- Focused evidence: `npm run test:structural-expansion` proves a replacement Pod Dock creates an EVA-required module site while a replacement Table on an initialized pressurized interior remains ordinary construction. `npm run build` passed.
- Remaining uncertainty: the exterior worker animation already exists, but a Pod Dock installation still needs a preserved live capture before the catalogue's visual proof is complete.

2026-07-28 · Restricted crew-mess opening guidance

- Commit or files: `src/sim/opening-recipes.ts`, `src/main.ts`, and `tools/opening-business-tests.ts` (`f2c161f`).
- Focused evidence: `npm run test:opening-businesses` passed all six opening truth checks, including the fresh starter's restricted crew mess remaining non-operational for visitors.
- Visual/playtest evidence: a normal live starter at 4x admitted its first pod traffic. Food demand was correctly missed rather than forming a phantom queue, but the Food comparison card reported the private counter and seats without naming their access restriction. The readout now labels those fixtures `CREW MESS CANDIDATE`, preserving the deliberate choice between sharing that room and building a separate public cafeteria without implying it already serves travelers.
- Remaining uncertainty: Gate A still requires the player to complete one public business and observe its first revenue cycle; this checkpoint fixes the guidance discovered before that build, not the gate itself.

2026-07-28 · First public food revenue cycle

- Commit or files: `tools/opening-business-tests.ts`, `src/sim/cold-start-scenarios.ts`, and `src/main.ts` (`81d8bb3`).
- Focused evidence: `npm run test:opening-businesses` now passes seven checks. Starting from the ordinary life-safe shell, the added operating-cycle contract builds a coherent 21-tile public Cafeteria through production room/module APIs, stocks two physical counters, admits ordinary automatic pod traffic, and requires a real `Prepared meal sold` ledger event, increased credits, and an incremented served-meal total. `npm run build` passed.
- Visual/playtest evidence: inspected `?scenario=opening-food-cycle`. The paused result shows two active pods, two visitors, `+4c` live revenue, one visitor served, 53 remaining servings across three physical counters, and the authored 2-counter/8-seat public Cafeteria marked operational. While the call remains docked, the Food card now reads `1 sale this visit · report pending` rather than incorrectly claiming no demand; final wanted/served/missed accounting still settles at departure.
- Remaining uncertainty: this closes the first visible-demand proof, not all of Gate A. Supplies and Refuel still need equivalent start-to-revenue operating-cycle evidence, and a manual small-viewport construction pass remains desirable when the browser driver supports reliable canvas coordinates.

2026-07-28 · Three opening revenue streams and physical market frontage

- Commit or files: `src/sim/sim.ts`, `src/sim/opening-recipes.ts`, `tools/opening-business-tests.ts`, `tools/opening-refuel-cycle-tests.ts`, and `package.json` (`eae0935`).
- Focused evidence: `npm run test:opening-businesses` passes nine checks and `npm run test:opening-refuel-cycle` passes. Starting from the ordinary physical starter, Food records a paid prepared-meal service, Supplies consumes located Shelf Aisle stock through a physically staffed Checkout Bank and records a paid travel-supplies sale, and Refuel consumes piped Fuel Tank stock at a real Pod Dock and records a positive fuel sale. Market demand is now available at tier 0, matching its role as one of the three opening choices, and a stocked market proactively holds its Steward post instead of dispatching too late for a short shopper visit.
- Bad/improved comparison: a wall-adjacent Checkout Bank retains its built investment but remains non-operational with the actionable reason `Leave open floor in front of the Checkout Bank so shoppers can form a line`; moving the same bank one tile inward supplies physical line capacity and completes ordinary shopper sales.
- Live-browser observation: the normal starter keeps Food, Supplies, and Refuel visible together. Selecting Supplies shows the 24-tile spatial machine and explicitly names Steward checkout duty plus Cargo Handler restocking. The facility-scale showcase reports Supplies operational, while the fuel showcase exposes tank stock, the missing Coupler, and the open pipe requirement on the Refuel card.
- Remaining uncertainty: Gate A still needs a normal-start player construction pass for Supplies and Refuel, plus a second viable operating/layout choice for Refuel. These focused cycles prove the simulation contracts and truthful diagnosis without claiming that broader playtest complete.

2026-07-28 · Opening choice promoted into the Global Goal

- Commit or files: `src/main.ts` and this execution ledger (`5f8ad5c`).
- Player-facing contract: the first Global Goal now explicitly requires `Open Food, Supplies, or Refuel` before revenue and served-traveler progress can establish the port. This preserves one north-star progression surface while leaving the three spatial recipes as genuine choices beneath it; the player still authors the room, fixture placement, staffing, utilities, and stock rather than accepting a prefab or modal specialization.
- Live-browser observation: inspected the ordinary `?scenario=starter` at the normal viewport. The Global Goal reads `Open Food, Supplies, or Refuel · 0/1`, `Earn business revenue · 0/500c`, and `Travelers served · 0/20`; the three comparable business cards remain visible together, and the starter's 320 credits can fund one complete path but not two.
- Focused checks: `npm run build` and `git diff --check` passed.
- Remaining uncertainty: this closes the authored-decision requirement, not the whole coherent-opening gate. The user still needs to perform the normal-start Supplies and Refuel construction passes, and legacy tier messaging after the first operation remains a separate reconciliation item.

2026-07-28 · One player-facing progression spine

- Commit or files: `src/main.ts` and this execution ledger (`904667a`).
- Design resolution: Global Goals are the player-facing progression spine, while Food, Supplies, and Refuel are authored choices beneath the first goal. The legacy tier ladder remains an internal capability mechanism for now and no longer reappears inside the goal card or normal command UI after the first business opens.
- Live-browser observation: inspected `?scenario=opening-food-cycle` after a paid meal. The first Global Goal shows the business criterion complete and live revenue/traveler progress (`1/1`, `4/500c`, `1/20`) with no Tier summary, roadmap, specialization branch, or second progression instruction visible.
- Remaining uncertainty: future facility prerequisites still need to become more concrete as later content is refined, but they no longer compete with the opening objective as an independent ladder.

2026-07-28 · Paused Supplies and Refuel revenue showcases

- Commit or files: `src/sim/cold-start-scenarios.ts`, `src/sim/opening-recipes.ts`, `src/sim/sim.ts`, `tools/opening-refuel-cycle-tests.ts`, and this execution ledger (`be23f23`).
- Focused evidence: `npm run test:opening-businesses` passes nine checks, `npm run test:opening-refuel-cycle` passes, `npm run build` passes, and the fuel supplier ledger now identifies its cargo as fuel rather than travel supplies.
- Live-browser observation: `?scenario=opening-supplies-cycle` pauses after a staffed Checkout Bank consumes physical Shelf Aisle stock and records a paid sale. `?scenario=opening-refuel-cycle` pauses after a supplier pod fills a piped Fuel Tank and an ordinary pod consumes four units for a paid refuel. The Refuel card remains `operational` after that sale, and the Global Goal reads `Open Food, Supplies, or Refuel · 1/1`.
- Design correction: recipe stock rows remain healthy replenishment targets, while operational status now means the machine can serve its next customer. One normal sale can no longer erase the player's completed opening choice.
- Remaining uncertainty: Gate A still needs a hands-on normal-start construction pass at a small viewport and a second clearly authored Refuel layout choice; the three production cycles themselves are now directly inspectable rather than inferred from tests.

2026-07-28 · Live EVA expansion completion and resumed-worker routing

- Commit or files: `src/sim/sim.ts`, `tools/structural-expansion-tests.ts`, and this execution ledger (`2ce719c`).
- Correctness fix: after completing an exterior site, an EVA courier can now route back through an active Airlock to collect the next construction kit instead of asking interior pathfinding to cross open space. Suited workers intentionally outside on an active EVA route are excluded from crew-facility reachability warnings, preventing a false sealed-wing diagnosis while they work.
- Focused evidence: `npm run test:structural-expansion` passes. The runner saves a partially delivered structural project, hydrates it in the intentionally paused load state, resumes play, completes every perimeter/interior/seal job, atomically commissions the wing, and verifies idle EVA workers return through an Airlock.
- Live-browser evidence: `?scenario=structural-expansion-active` was reloaded from the normal starter-derived fixture and run at 4x. Its visible Work Queue fell from seven construction jobs to two and then `No queued work`; the exterior project commissioned without a stranded worker or false crew-quarters alert.
- Remaining uncertainty: the fixture begins with its valid Truss patch already placed, so visible player-built Truss welding remains open. Dedicated live captures are still required for low EVA oxygen, obstructed work position, and the subjective first-expansion presentation claim.

2026-07-28 · Physical EVA frontage work and material diagnosis

- Commit or files: exterior work-face resolution in `src/sim/construction.ts`; focused behavior in `tools/structural-expansion-tests.ts`; live fixtures in `src/sim/cold-start-scenarios.ts`; and this execution ledger (`706d88b`).
- Correctness fix: exterior wall hardware was classified as EVA work but resolved its target to the pressurized interior service face. Pod Docks, Fuel Couplers, Freight Lockers, and Maintenance Sockets now select an actual space-facing work tile, allowing suited workers to deliver and install them from outside.
- Focused evidence: `npm run test:structural-expansion` passes. It plans a new Truss extension through the normal construction API, observes a suited worker, and waits for the real tile commission; it separately rebuilds a starter Pod Dock through physical delivery and exterior work, while retaining the contrast that an interior Table does not require EVA. A zero-stock project asserts `no construction materials` on its blocked site.
- Live-browser evidence: `?scenario=structural-expansion-material-blocked` renders `BLOCKED · NO CONSTRUCTION MATERIALS` over the affected exterior blueprints. `?scenario=structural-truss-active` starts a normal EVA-required Truss extension from the starter scaffold, with its world blueprint and construction progress visible when panels are hidden.
- Remaining uncertainty: the Pod Dock completion contract reduces that test site's material/work totals so the runner proves route and custody without spending minutes on balance-scale hauling. Production costs remain unchanged and need a later construction-economy pass. Low EVA oxygen and sustained work-position obstruction still need dedicated proof.

2026-07-28 · Active 50/50 mixed-operation scale checkpoint

- Commit or files: `src/sim/cold-start-scenarios.ts` (`?scenario=normal-scale-50`), active traffic and path-budget work in `src/sim/sim.ts`, utility-underlay identity reuse in `src/sim/utility-underlay.ts`, `tools/normal-scale-operation-tests.ts`, `tools/meal-queue-boarding-conflict-tests.ts`, `package.json`, and this execution ledger (`4f7b321`).
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

- Commit or files: `src/sim/service-truth.ts`, the visitor completion path in `src/sim/sim.ts`, and strengthened production-path coverage in `tools/gate-f-facility-scale-tests.ts` (`38c7acf`).
- Focused evidence: `npm run test:gate-f-facility` passes ten grouped checks. The connected staffed bar draws physical stock, has four visitors carrying drinks at 40 seconds, and records 17 canonical completions at Booth Bank or Standing Rail positions by 80 seconds; at least one actor observed carrying at 40 seconds owns a later completion event. A deterministic legacy optional drink writes exactly one service event and one sale, increments its repeat counter once, adds no promised service, and cannot charge again on the next tick. An invalid Cantina tile writes no service or economy event and retains the carried drink and outstanding plan. A depicted Community Table seat enters ordinary eating, writes exactly one meal event naming `CommunityTable`, advances served-meal truth once, and clears the carried meal. `npm run test:occupant-loop`, `npm run test:mixed-berth-visit`, `npm run test:normal-scale-operation`, and `npm run build` pass; the normal-scale fixture handles all ten inbound cargo units, drains its queue from a peak of 15 to zero, retains utility-underlay identity, and records 9.562 ms simulation p95 in this run.
- Review judgment: the previous Gate F drink and Community Table completion gaps are closed. No additional broad slot or facility checkbox is marked because this checkpoint proves these two service identities, not every active want or every lounge/hygiene lifecycle.
- Remaining uncertainty: a provider removed at the exact service commit boundary is rejected without phantom payment, but the ordinary orphan-claim recovery paths—not this focused fixture—remain the evidence for eventual rerouting. The separate long-stay showcase, camera framing, and curated art work remain open.

2026-07-28 · Connected long-stay guest wing and scenario framing

- Commit or files: `src/sim/cold-start-scenarios.ts` (`?scenario=long-stay-guest-wing`), Gate F fixture truth in `src/sim/service-truth.ts` and `src/sim/sim.ts`, scenario-focused Fit Station bounds in `src/main.ts`, and the strengthened long-stay group in `tools/gate-f-facility-scale-tests.ts` (`d9f7eeb`).
- Focused evidence: `npm run test:gate-f-facility` passes ten grouped checks. Five distinct Dorm, Cafeteria, Cantina, Hygiene, and Lounge rooms are joined by pressurized two-lane passages; the authored cohort remains 8/8 present after 180 simulated seconds, every guest completes at least one recurring physical need, and the run records 7 meals, 8 drinks, 6 hygiene sessions, 23 comfort sessions, and 12 leisure sessions. Canonical events name Community Table, Booth Bank, Wash Bank, Guest Cabin or Bunk Bank, Couch, and Game Station fixtures rather than inferred room capacity. `npm run test:occupant-loop`, `npm run test:facility-slots`, `npm run test:normal-scale-operation`, and `npm run build` pass; normal scale handles all ten inbound cargo units, serves seven meals, drains a 15-person peak queue to zero, retains utility-underlay identity, and records 8.976 ms simulation p95 in this run.
- Live-browser evidence: loaded the long-stay scenario through one local server, hid the interface panels, ran at 4x, and invoked Fit Station. The complete five-room wing remains framed at playable scale; the Dorm-to-Cafeteria-to-Cantina and Dorm/Hygiene/Lounge passages are visibly continuous; eight guests move between the large fixtures; service/need floaters appear at their actual rooms; and the browser console reports no errors. Fit Station now uses whitelisted showcase bounds instead of zooming around unrelated starter-shell geometry.
- Review judgment: the meaningful Lounge/Cantina session item is checked because both production completion events and live occupied positions are now observed. This does not claim the Gate G repair-cohort, fixed/flexible schedule, failed-stay, or admission-policy requirements assigned separately to Claude.
- Remaining uncertainty: the scenario sits near the southern map edge, so some empty map padding can remain at unusual portrait viewport shapes even though the whole wing stays visible. The facility artwork is still procedural placeholder art pending the separate curated-art checkpoint.

2026-07-28 · Curated connected-bar artwork

- Commit or files: the 14 `module_service_bar`, `module_bar_corner`, and `module_bar_end` base/state PNGs in `tools/sprites/curated/`, plus the packed v1 atlas (`37e1a0b`).
- Art and geometry evidence: every generated source was inspected before acceptance and again after chroma removal and reduction to its final `128x320` or `128x128` canvas. The Service Bar preserves four west guest positions and two east staff positions in base, active, unstaffed, empty, dirty, and damaged states; the Corner preserves one west guest and one east staff position; the End preserves two west guests and no staff position. Three rejected generations were not packed: one dirty Service Bar invented a fifth stool, and two Bar End attempts became reference-sheet collages; a fourth dirty End attempt widened the fixture footprint and was also rejected.
- Focused checks: `node tools/sprites/pack-atlas.mjs --profile v1`, `npm run sprites:validate:v1`, and `git diff --check` pass. The safe direct pack retained all 298 atlas keys and avoided both the placeholder generator that overwrites hand-authored sprites and the wrapper that prunes tracked archive baselines.
- Review judgment: this closes only the connected bar family's curated-art replacement. The remaining eight Gate F facility families and their state variants are still procedural placeholders, and the complete 46-key art handoff remains open.

2026-07-28 · Complete curated Gate F facility artwork

- Commits or files: all 46 Gate F base/state PNGs in `tools/sprites/curated/` and the packed v1 atlas (`4b707e0`). The second tranche replaces Backroom Stock Bank, Booth Bank, Standing Rail, Serving Line, Community Table, Guest Cabin, Arrival Desk, and Wash Bank placeholders, completing the three connected-bar families already curated in the prior checkpoint.
- Art and geometry evidence: every source and final transparent PNG was inspected at its exact atlas canvas. Authoritative depicted counts remain visible across every state: Backroom 2 stock positions; Booth Bank 6 seats; Standing Rail 4 positions; Serving Line 3 pickups plus 2 staff positions; Community Table 8 seats; Guest Cabin 2 beds; Arrival Desk 2 customers plus 2 processors; Wash Bank 4 basins; Service Bar 4 guests plus 2 staff; Corner 1 guest plus 1 staff; End 2 guests. State variants communicate active, unstaffed, empty, dirty, or damaged through physical surface/status changes without adding reservation positions. One partially stocked Backroom `empty` render was rejected and regenerated as three visibly bare shelf levels.
- Focused checks: the safe `node tools/sprites/pack-atlas.mjs --profile v1` path packs all 298 keys; `npm run sprites:validate:v1` and `git diff --check` pass. The placeholder generator and archive-pruning wrapper were not run.
- Review judgment: the 46-key curated-art handoff is complete. Final proof still requires one bundled live browser pass across the facility scenarios at ordinary play zoom; that visual pass is intentionally grouped with the terminal playtesting tranche rather than blocking asset integration.

2026-07-28 · Reception routing and bounded hidden-demand recovery

- Commits or files: hidden-demand routing in `src/sim/sim.ts`; paired `reception-absent` and `reception-staffed` scenarios in `src/sim/cold-start-scenarios.ts`; strengthened production-path evidence in `tools/gate-f-facility-scale-tests.ts` (`3920a1f`).
- Focused evidence: `npm run test:gate-f-facility` passes ten grouped checks and `npm run test:occupant-loop` passes. Eight same-seed guests begin with identical hidden demand. Without Reception, all eight reserve plausible physical lounge fixtures, four make the correct first choice, and four realize a comfort need and redirect. With a staffed two-position Arrival Desk, three are processed while the rest bypass normally, six of eight first routes are correct, and redirects fall from four to two. Every wrong choice emits exactly one causal event and one `Need: comfort` world floater, retains its realized need and origin, and cannot oscillate or emit a second redirect. An unstaffed desk exposes zero processing positions and never gates entry.
- Preservation note: review initially reproduced an iteration-order failure because the scale harness ran its reverse-order comparison against coordinator cooldowns and actor replanning fields mutated by the forward pass. The harness now restores every coordinator-owned actor field and explicitly isolates ephemeral coordinator state between the two observations. `npm run test:movement-coordinator` passes all six groups; `npm run test:normal-scale-operation` now completes its 240-second 50/50 run with ten cargo units handled, eight meals, six simultaneous ships, 9.456 ms simulation p95, order-independent results for 74 actors, and a cached 2,856-node structural graph whose second call takes 0.005 ms. Reception's ten-group runner remains green after the correction.

2026-07-28 · Gate G commitment/recovery core evidence review

- Commits or files: durable failed-stay episodes and recovery planning in `src/sim/failed-stay.ts`; finite admission decisions in `src/sim/admission-policy.ts`; live seams in `src/sim/sim.ts`; save migration in `src/sim/save.ts`; adversarial coverage in `tools/commitment-recovery-tests.ts`; commits `ab54510`, `83c6a47`, and `fdd7c28`.
- Focused evidence: `npm run test:commitment-recovery` passes ten checks and `npm run test:gate-e-save-resume` passes six. Direct fixtures prove a bounded 28/75/150-second escalation ladder; exactly-once emergency meal purchase; physical repair expediting; compensation that restores patience without feeding the cohort or resolving its shortage; canonical onward transfer with no orphan reservations; bounded admission closure that the legacy router cannot bypass; disruptive-only security intervention; resident acceptance closed by default and then blocked by absent private housing; and cumulative bed/meal reserves that hold the second otherwise-valid offer.
- Review boundary: no claim is made yet for incident production, emergency bunk creation, positive cancellation penalty, faction effects, accepted-resident departure, or the player-facing policy/recovery controls. Those remain unchecked until focused or browser evidence exists.

2026-07-28 · Versioned structural-support derivation

- Commits or files: topology-keyed bounded graph cache in `src/sim/structural-support.ts`; focused invalidation assertions in `tools/structural-support-tests.ts` (`4ac6c38`).
- Focused evidence: `npm run test:structural-support` passes. Repeating an unchanged base topology and unchanged proposed Truss plan returns the same graph object without increasing the build count; time, room-version, and module-version changes remain cache hits; a topology-version mutation invalidates and rebuilds exactly once. Cached graph-build problems are copied before load validation so one query cannot contaminate the next, and each state retains at most 32 proposed-plan graphs.
- Legacy evidence: `npm run test:phase9-save` passes all five phases, including two legacy fixtures. Its structural migration fixture loads a snapshot without modern structural state, rebuilds the same supported node/root/edge graph, and remains valid; the cache is keyed by state identity plus topology version and therefore cannot leak a pre-load graph into a hydrated state.

2026-07-28 · Phase 9 migration and baseline-performance ledger reconciliation

- Commits or files: existing migration/reconstruction paths in `src/sim/save.ts` and `src/sim/save-recovery.ts`; physical ownership cleanup and batched movement in `src/sim/sim.ts`; `tools/phase9-save-migration-tests.ts`, `tools/movement-coordinator-tests.ts`, `tools/facility-slots-tests.ts`, and `tools/normal-scale-operation-tests.ts`; structural cache commit `4ac6c38` and arbitration-harness commit `a4781a6`.
- Save evidence: `npm run test:phase9-save` passes five phases with two legacy derivations. A stripped legacy snapshot rebuilds identical grandfathered structural roots/nodes/edges, identical Dock/Berth approach descriptors and conflict groups, and adapted Berth size geometry that yields to the first explicit player edit. Missing occupant fields default to station-side, errand, non-failing, non-stranded state; a missing maintenance block resumes with an undamaged geometry-derived integrity ledger. A live post-load station starts with no stale paths, occupancy, queue theater entries, transfer/service claims, or invalid dock bindings, then replans actor movement and rebuilds its congestion map within three simulated seconds.
- Ownership and performance evidence: `npm run test:movement-coordinator` passes six groups, including batched deterministic resolution, stale-wait recovery, and save/load clearing of transient claims. Gate F's exclusive-claims group proves provider/staff/seat ownership and cleanup. The 240-second 50/50 normal-scale run maintains 256 exterior targets, profiles every declared top-level simulation phase across 3,600 ticks with no unprofiled phase, keeps p95 path calls below one A* per actor, and reports the cached 2,856-node support graph. These are transferred into the ledger now because the focused evidence predates the unchecked duplicate Phase 9 rows.

2026-07-28 · Current saturation/cap inventory

- Documentation: `docs/40-structural-frontage-cap-audit.md` records the current queue-chain length/spill bounds, service and dock balk timers, intent-specific A* occupancy saturation, walk/route/environment/sanitation penalty ceilings, resident stress bounds, failed-stay event bounds, and the displayed 0-100 station-rating clamp with its uncapped causal ledger.
- Review boundary: this is a source-backed inventory, not a balance change. The compound controlled-scenario item stays open because existing focused fixtures do not yet drive every documented value through below/at/above saturation in one auditable runner.

2026-07-28 · Render/simulation separation audit

- Commits or files: fixed-step loop and presentation-only interpolation in `src/main.ts`; batched movement/path budgets in `src/sim/sim.ts`; intent costs in `src/sim/path.ts`; focused scale and movement evidence in `tools/normal-scale-operation-tests.ts` and `tools/movement-coordinator-tests.ts`.
- Architecture evidence: simulation advances from its own fixed 15 Hz timer. `requestAnimationFrame` computes a real-time alpha between the last and next simulation snapshots, temporarily applies visual actor positions for `renderWorld`, and restores authoritative coordinates in a `finally` block. Render and UI code contain no `findPath` calls. Pathfinding occurs only inside simulation work, is cached/budgeted, and measured at p95 27 calls for 74 actors in the latest 50/50 run.
- Safety ordering: movement coordination, deterministic fairness, bounded replanning, safe/unsafe swap handling, and stale-claim cleanup are present and green while the documented queue, spill, occupancy-cost, and route-penalty caps remain in place. No deadlock guard was removed to claim scale.

2026-07-28 · Gate G commitment metrics and finite admission matrix

- Commits or files: live counters and admission application in `src/sim/sim.ts`; pure policy in `src/sim/admission-policy.ts`; focused production-path runner `tools/gate-g-metrics-admission-tests.ts`; `test:gate-g-metrics-admission` package script (`12bc7ce`).
- Focused evidence: the runner passes 8/8. It records one completed contract visit at 10.4 seconds; 0.2 ship-seconds of holding and grouped approach wait; one 1.2-second disembark crossing; four boarding clears totaling 4.8 seconds; 27 of 29 recurring demands satisfied across all four long-stay need families; 1,957.2 occupied of 12,780 depicted fixture-capacity seconds; one missed departure with four stranded occupants; and a live future commitment of 899.8 Berth-seconds, one bed, four meals, and two staff-minutes from an accepted manifest retained after its offer leaves the live list.
- Admission evidence: a deterministic matrix proves routine class acceptance, busy/interface/bed/meal reserve holds, maximum-stay and minimum-margin rejection, and manual preservation for military, migrant, large, negotiated, and uncertain calls. A 60-call aggregate reports exactly 40 acceptable, ten held, and ten manual commitments. In a live tick, one routine Pod auto-admits, its military peer remains visible with an explanation, and the player can manually pass it. The compact player controls and world projection are committed separately in `ba80440`; their visual claims remain for the bundled browser pass.

2026-07-28 · Gate G physical recovery-depth evidence

- Commits or files: physical emergency-bunk placement, cancellation/recall, and explicit resident acceptance in `src/sim/sim.ts`; refusal and proportional-penalty contracts in `src/sim/failed-stay.ts`; focused runner `tools/gate-g-recovery-depth-tests.ts`; `test:gate-g-recovery-depth` package script (`12bc7ce`).
- Focused evidence: the runner passes 4/4. Two distressed visitors receive two real 1x1 Bunk fixtures on distinct free Dorm floor tiles, distinct fixture claims, and distinct routed destinations for an exact 28c cost; zero eligible floor tiles produce an exact refusal with no hidden capacity. Cancelling a contract with 135c of unfinished promised value charges the documented 45% share (61c), records its durable cause, and recalls both ship and contract, while a zero-value cancellation is refused. A single physical tile then produces the bounded mess → complaint → refusal-to-work incident ladder with a 45-second cooldown and cap of three.
- Resident departure evidence: explicit policy-gated acceptance converts one depicted visitor only after a private Bed and residential dock are available. The accepted resident retains the same physical Bed after their home ship departs normally and releases its dock; no silent ambient conversion path calls the explicit acceptance operation.

2026-07-28 · Curated structural-frontage source art

- Commits or files: curated Truss Junction and Reinforced Bulkhead families in `tools/sprites/curated/`; normalized generation prompts in `tools/sprites/sprite-spec.yaml`; stable keys in `src/render/sprite-keys.ts`; atlas footprint and required-key registrations; packed `public/assets/sprites/atlas.png` and `atlas.json` (`54c1ddb`).
- Visual evidence: lead review inspected both ImageGen source sheets, every extracted transparent state, the packed atlas extractions, and the complete sprites at native scale. Junction states retain a four-way X-braced hub inside a 64x64 footprint; Bulkhead states retain west/east pressure-transfer attachments inside a 128x64 footprint. Planned, delivered, welding, complete, overloaded, and damaged variants preserve their attachment geometry and remain distinct at 32 pixels per tile.
- Validation boundary: `sprites:validate:v1` passes all 311 keys. This closes generation of both low-resolution art families only. Their live construction-state selection and the all-assets live-render verification remain open until renderer integration and the final browser pass.

2026-07-28 · Gate F slot, throughput, and progressive-demand reconciliation

- Commits or files: shared depicted-position contract in `src/sim/facility-slots.ts`; provider, seat, market, bar, reception, and recurring-need machines in `src/sim/facility-machines.ts` and `src/sim/sim.ts`; focused runners `tools/facility-slots-tests.ts` and `tools/gate-f-facility-scale-tests.ts`.
- Focused evidence: `test:facility-slots` passes and the expanded Gate F runner passes 10/10. Every eight-seat Community Table position, four Guest Cabin bed positions, four Wash Bank hygiene positions, three Serving Line pickups, six Booth Bank seats, and both Arrival Desk processors are individually claimable and exclusive. Long-stay meal, drink, hygiene, comfort, and leisure each use a distinct production session duration and all five complete at named physical fixtures while all eight guests remain present for 180 seconds. A one-register/two-register production comparison records real sales and requires the second staffed register to complete more in the same 12-second window.
- Route and discovery evidence: the physical market chain conserves 102 units across backroom, carried stock, shelves, and exactly-once sales; its compact layout crosses the customer frontage while the improved layout separates the delivery path. Same-seed Reception variants begin with identical fully hidden plans, reveal fewer wants than the full plan, and prove progressive behavior-led discovery: correct first choices improve from 4/8 to 6/8, redirects fall from four to two, and every wrong choice names its realized need once without oscillation. Claims about every removal/death path and live visual overwhelm remain open for narrower evidence or the browser bundle.

2026-07-28 · Phase 3 commissioning diagnostics

- Commits or files: tie-in derivation and staging-route validation in `src/sim/construction.ts`; focused production runner `tools/commissioning-diagnostics-tests.ts`; `test:commissioning-diagnostics` package script (`d36e876`).
- Focused evidence: an isolated but stocked interior site reports exactly `no construction staging route` and creates no fictional job; opening one real floor gateway clears the diagnosis and enqueues the physical delivery. Reusing the live starter Airlock derives a zero-material EVA perimeter tie-in while an explicitly authored Door remains authoritative. A low/depleted-oxygen EVA worker reports the exact blocker, returns through the Airlock to refill, and advances the same build job. Sustained occupancy of the only real work face reports `work position obstructed`; moving the occupying worker clears it and resumes progress. `test:commissioning-diagnostics` and `test:structural-support` pass.
- Preservation boundary: the legacy structural-expansion runner's final 8,000-step save/resume commissioning assertion still stalls. The worker reproduced the identical failure with the entire production diff disabled and the new runner removed from compilation, so it is recorded as pre-existing and is not used as evidence for this tranche.

2026-07-28 · Movement, transfer, and per-interface measurement reconciliation

- Commits or files: batched arbitration and wait reasons in `src/sim/sim.ts`; transfer and capacity metrics in `src/sim/types.ts`, `src/sim/sim.ts`, and `src/sim/facility-machines.ts`; focused runners `tools/movement-coordinator-tests.ts`, `tools/physical-cargo-tests.ts`, `tools/gate-g-metrics-admission-tests.ts`, and `tools/gate-f-facility-scale-tests.ts`.
- Focused evidence: `test:movement-coordinator` passes all six groups. Safe head-on swaps proceed, while an unsafe swap through a one-capacity Door makes both actors yield; longer wait age and bounded blocker displacement then recover progress without nondeterminism. `test:physical-cargo` passes all four groups and proves a boarding passenger and bulky freight worker contend on the same physical crossing, each exposes the opposing flow as its wait cause, and shared freight measurably slows the public corridor.
- Measurement evidence: the Gate G metrics runner records one production disembark crossing and its 1.2-second duration. Gate F capacity reads are derived from actual depicted slots and claims: the long-stay wing reports eight beds, four Wash positions, three meal pickups, fourteen seats, and four bar stools, while its recurring services complete against named fixture types. The broader passenger-transfer runner currently times out in its pre-existing first-boarding-crossing fixture; no claim here depends on that failing group, and boarding-distance measurement remains open.

2026-07-28 · Versioned approach-geometry cache

- Commits or files: per-state derived descriptor/group cache in `src/sim/sim.ts`; no-op and Berth-size version discipline in `src/sim/dock-controls.ts`; focused runner `tools/approach-geometry-cache-tests.ts`; `test:approach-geometry-cache` package script (`403d5c9`).
- Focused evidence: the 5/5 runner records 261 hits and one derivation miss across 128 repeated descriptor/group projections plus ordinary tick, time, actor, and credit churn, returning the exact same descriptor and group objects. A real Dock edit, Berth accepted-size edit, topology edit, and west map expansion each invalidate immediately; repeated no-op edits reuse. Every cached group equals a fresh pure derivation, and west expansion preserves exact world-space envelopes and conflict semantics despite local index remapping.
- Migration evidence: a legacy snapshot without modern Berth configs/source keys hydrates into a fresh StationState with no inherited cache objects or counters, derives semantically identical descriptors/groups, then reuses them. `test:approach-control`, `test:approach-envelopes`, and `test:phase9-save` all pass with the cache active.

2026-07-28 · Visit-lifecycle overlap and legacy-default reconciliation

- Commits or files: visit scheduling/extension/recall in `src/sim/sim.ts`; visitor and resident adapters in `src/sim/save.ts`; focused evidence in `tools/mixed-berth-visit-tests.ts`, `tools/gate-g-recovery-depth-tests.ts`, `tools/normal-scale-operation-tests.ts`, and `tools/phase9-save-migration-tests.ts`.
- Lifecycle evidence: unfinished real contract-owned work buys one bounded extension with `remaining-work` as its durable cause; work completion permits ordinary recall, sustained service failure exercises explicit abort/early recall, and the Gate G cancellation path charges a positive unfinished-value penalty before recalling the ship and contract. Terminal cleanup expires every remaining contract job and settles once. The 240-second 50/50 normal-scale run admits a guaranteed eight-minute medium mixed visit while ordinary Pod traffic continues, observes real Pod/Berth overlap, and reaches six simultaneous ships rather than rapid one-for-one replacement.
- Legacy evidence: the Phase 9 migration fixture removes modern transfer, tenure, recurring-need, failure, stranding, and route fields from a live visitor. Hydration restores station-side transfer, `errand` tenure, no failure/stranding, and safe null route state without manufacturing a Resident. The combined visitor-and-resident row remains open until the corresponding stripped legacy-Resident fixture directly proves its source-backed adapter defaults.

2026-07-28 · Controlled saturation/cap runner (partial gate evidence)

- Commits or files: production-driven runner `tools/saturation-cap-tests.ts` and the `test:saturation-caps` package script (`deb25ae`); source inventory `docs/40-structural-frontage-cap-audit.md` (`a1c4951`).
- Focused evidence: the 8/8 runner distinguishes below/at/above behavior for the 24-position queue chain, six-position outside spill, 16-second ordinary balk, 14-second staffed-market abandonment, 18-second Dock timeout, all five intent-specific A* occupancy saturations, visitor walk and cargo-route penalties, resident route stress, the 45-second/three-incident failed-stay bounds, and both ends of the 0-100 station-rating display while retaining the unclamped causal ledger. Queue, movement, and recovery preservation runners remain green.
- Deliberate open boundary: the checklist's all-caps controlled-scenario row remains unchecked. Three nominal source ceilings are not reachable through live inputs: visitor environment tops out at `.144` before its `.24` guard, sanitation at `.0952` before `.18`, and resident stress above 100 immediately produces an incident/reset before the nominal 120 clamp can be observed. These are now explicit design/implementation gaps rather than falsely checked evidence.

2026-07-28 · Stripped legacy-Resident hydration evidence

- Commits or files: extended combined occupant fixture in `tools/phase9-save-migration-tests.ts`; existing adapters in `src/sim/save.ts` (no production change required).
- Focused evidence: the fixture now saves a real Resident with durable home-dock/housing/Bed identity plus deliberately stale path, targets, live facility reservation, carrying state, route exposure, movement wait/cooldown, incident, agitation, confrontation, and home-ship departure state, then strips the later-phase fields from the wire snapshot. Hydration floors its fractional legacy index onto the same walkable Floor/world position; preserves identity, home dock, housing, Bed, and satisfaction; clears every transient route/claim; defaults neutral carrying/incident state; and converts obsolete `ToHomeShip` into `Idle` with no invented ship or departure. The Resident remains after resumed ticks and never duplicates into the visitor population.
- Preservation evidence: `test:phase9-save`, `test:occupant-loop`, and all 6/6 Gate E save/resume checks pass; the production build remains clean.

2026-07-28 · Deterministic Gangway recall recovery

- Commits or files: cramped-interface queue recovery in the passenger-transfer region of `src/sim/sim.ts`; higher-signal diagnostics and capacity window in `tools/passenger-transfer-tests.ts` (`a5bfbac`).
- Root cause and fix: a recall could begin while the last-emerged passenger still occupied the station-side Gangway tile. Strict timestamp FIFO selected an earlier actor as head even though that actor could not enter the occupied tile, while the physical occupant had no spill position and no movement intent. With no crossing active, the rebuild now deterministically clears the boarding-queued actor already at the interface first, then resumes durable FIFO. Followers without a depicted spill slot approach the interface under movement arbitration while the exclusive head reservation serializes the actual crossing.
- Focused evidence: `test:passenger-transfer` passes three consecutive worker runs plus the lead rerun, including visible 0.8-second crossings, one-vs-two Gangway throughput, recall cancellation of ship-side arrivals, save/resume mid-disembark and mid-boarding, deterministic array-order independence, and stale-claim cleanup. Physical cargo, mixed Berth visit, movement coordinator, occupant loop, and build preservation remain green. This directly preserves Gangway as the physical passenger provider; boarding-distance measurement remains open.

2026-07-28 · Gate F live facility-state renderer (browser verification pending)

- Commits or files: pure production-truth selector in `src/render/facility-sprite-state.ts`; narrow live overlay and shared sprite geometry in `src/render/render.ts`; focused matrix `tools/facility-sprite-state-tests.ts`; `test:facility-sprite-state` package script (`6dea753`).
- Focused evidence: the 3/3 runner selects all 46 curated base/state frames; enforces damaged → dirty → empty → unstaffed → active → idle priority while skipping unsupported variants; falls back to the base frame if the loaded atlas lacks a requested state; and drives a connected Service Bar through real physical staffing, guest claim, pooled stock, sanitation, and maintenance-debt transitions. Clearing each production condition clears the selected state without mutating rotation or footprint.
- Performance boundary: idle fixtures remain in the cached decorative layer. Only visible non-idle fixtures are redrawn in the live overlay; a claim changes the overlay signature but provably leaves the full decorative-layer cache key unchanged, avoiding station-wide redraw churn. Gate F, facility-slot, and build checks pass. The six artwork-state checklist rows remain open until the bundled browser pass visually inspects the frames at gameplay zoom.

2026-07-28 · Durable maintenance identity through relocation

- Commits or files: module relocation in `src/sim/sim.ts`; focused regression in `tools/module-edit-tests.ts`; existing north-map expansion coverage in `tools/phase9-save-migration-tests.ts`.
- Focused evidence: the module-edit runner moves a worn fixture while preserving its stable module id, 37 points of accrued debt, last-service time, maintenance work position, and exactly one destination-derived lookup key; no old-coordinate record remains. The Phase 9 save runner separately reloads eight accrued debts, expands the map north, and proves each physical panel follows the index shift without resetting its value.
- Defect closed: relocation already shifted a module debt's anchor and target tiles, but left its tile-derived key unchanged. The next maintenance pass could therefore create a fresh record at the destination and discard the history at the stale key. Relocation now remaps the key atomically with the fixture before occupancy and item-node synchronization.

2026-07-28 · Physical Pod Dock and Docking Clamp roles

- Commits or files: strengthened production-path evidence in `tools/port-ops-tests.ts`; existing ownership and occupancy checks in `tools/approach-control-tests.ts` and `tools/approach-envelope-tests.ts`.
- Pod Dock evidence: both starter collars own unique `pod-dock:<mountTile>` source keys, installed module identity, an exterior mount, and a pressurized station access tile. Their accepted-size set is exactly `small`; a medium offer is rejected without retaining a Dock or source binding. Save/load and Approach Control retain the physical source rather than reselecting an arbitrary collar.
- Docking Clamp evidence: a valid modern medium Berth with one depicted clamp is rejected with the exact two-clamp requirement; installing the second makes the otherwise-identical candidate eligible. A valid large Berth is rejected at four clamps with the exact five-clamp requirement and becomes eligible only after the fifth physical clamp is installed.
- Occupancy evidence: the approach-envelope runner binds the accepted craft to its stable physical slot, preserves that commitment over save/load, and requires `occupiedByShipId` to remain authoritative for the parked slot until departure completes. `test:approach-control`, `test:approach-envelopes`, and the focused Pod Dock/Clamp port groups pass.
- Preservation boundary: the complete port-ops runner now clears eighteen groups, including the deliberately unfinished six-crew starter and explicit supplier/refuel fixtures, before reaching an older ambient-offer timing assumption in its automation group. No production claim in this checkpoint depends on that later unrelated group.

2026-07-28 · Relevant-change interface-diagnosis cache

- Commits or files: per-station cache and narrow statistics seam in `src/sim/interface-diagnosis.ts`; focused invalidation/isolation matrix in `tools/interface-diagnosis-tests.ts`.
- Cache contract: repeated UI-style reads of one Dock/Berth identity return the exact same diagnosis object while topology, rooms, modules, docks, selected ship/contract, passenger transfer/service state, and interface-owned cargo work remain unchanged. Irrelevant credit churn does not rebuild it. Active interfaces receive a bounded two-second refresh so time-threshold waits cannot remain stale; idle interfaces remain cached until relevant state changes.
- Focused evidence: `test:interface-diagnosis` proves one build and two hits across repeated reads/economy churn; immediate rebuild for topology, Door queue, blocked late boarding, cargo reroute, and approach commitment changes; a 20-second transfer-wait threshold discovered on the next traffic bucket; and strict isolation between StationState instances and interface identities. The signature scans only cargo handlers owned by the selected ship rather than every actor route.

2026-07-28 · Thermal-sink expansion consequence and physical mitigation

- Commit or files: focused production-path runner `tools/thermal-sink-expansion-tests.ts`; `test:thermal-sink-expansion` package script (`796a2f7`).
- Focused evidence: the same seed supplies two expansion sites with nearly identical sunlight (`0.589`/`0.594`) but sharply different thermal sink (`0.692`/`0.246`). Identical active Stove kitchens settle at `79.85` versus `85.41` heat and accrue `1.792` versus `1.967` production maintenance debt, proving the Charter field changes real high-load expansion operation rather than only a forecast label.
- Physical mitigation: installing a real wall-mounted Vent in the poor-sink comparison lowers heat to `82.55` and debt to `1.876` through the production tick path. `npm run test:thermal-sink-expansion` passes deterministically.
- Deliberate boundary: this checks the thermal-sink consequence itself. The combined Charter/world presentation, broader shielding/redundancy/safer-expansion mitigation row, and full forecastable/recoverable Phase 7 gate remain open for direct UI and browser evidence.

2026-07-28 · Composition-aware Charter service advice

- Commit or files: system-aware forecast model in `src/sim/site-charter.ts` and `tools/charter-forecast-tests.ts` (`904776d`); Charter selection projection in `src/ui/charter-screen.ts` and its focused markup evidence (`796a2f7`).
- Production contract: expected ship mix is the normalized sum of each site lane's traffic factor multiplied by the same faction-derived lane weights that generate traffic. Berths favor tourist/colonist calls; retail favors tourist/trader/colonist; fuel favors industrial/trader/military; repair favors industrial/military; and freight favors trader/industrial. The adjustment is deliberately bounded to `0.82–1.18`, so composition changes useful service ordering without eliminating ambient ship diversity.
- Focused evidence: `npm run test:charter-forecast` proves exact agreement with production lane weights, normalized positive shares for all five ship types, unchanged legacy output when no SystemMap is supplied, and contrasting tourist- versus industrial-facing fixtures that recommend different leading services. The site-selection hover and detail markup pass the actual SystemMap and expose the concise mix plus the bounded reason.
- Remaining boundary: the in-station Site Brief still needs the system-backed projection and live-browser inspection, so the combined Charter-and-world visibility row remains open.

2026-07-28 · Forecastable and recoverable environmental expansion risk

- Commit or files: production-path evidence in `tools/phase7-risk-recovery-tests.ts` and its `test:phase7-risk-recovery` package script (`796a2f7`), backed by the live map-condition, thermal-diagnostic, module-placement, maintenance, and tick APIs.
- Focused evidence: before wear exists, the map and inspector identify sunlight heat/wear pressure, poor natural cooling, the loaded Kitchen source, and the physical `vents/insulation` remedy. The predicted bad same-seed location then reaches `80.53` heat and `1.806` wear; adding a real Vent to that already-hot state lowers it to `77.67`, with the inspector attributing Vent relief. A sunlight-matched higher-sink location (`0.720` versus `0.273`) remains materially safer at `75.07` heat.
- Review judgment: this proves both an in-world cooling remedy and a viable safer expansion choice, and closes the Phase 7 forecastable/recoverable gate. It does not claim the still-open requirement to show every Charter effect in both the Charter UI and station-world presentation.

2026-07-28 · Ledger commit references resolved

- Commit or files: this execution ledger.
- What changed: 27 evidence notes carried the placeholder `(checkpoint commit
  pending at evidence capture)` because each note was written in the same commit
  that landed its work, before that commit had a sha. Every one is now resolved
  to its real commit, verified two ways: `git log --all -S"<heading>"` returned
  exactly one authoring commit per note, and `git show --stat` on that commit
  matched the files the note names.
- Two notes were corrected rather than merely stamped. The normal-structural-tools
  note now separates what `e5a1155` actually changed from the pre-existing
  construction truth it relies on, and the saturation-cap note now cites
  `deb25ae` for the runner and `a1c4951` for the cap-audit document.
- Why it matters: Checklist Rule "every completed item names a commit or changed
  files" was being met only in the weaker "changed files" sense for these rows.

2026-07-28 · Repaired the structural-expansion scenario family

- Commit or files: `planScenarioStructuralExpansion` in `src/sim/cold-start-scenarios.ts`.
- Defect: `npm run test:gate-e-save-resume` was RED (1/6 failing) on the working
  tree. The fixture scanned raw map order for the first all-`Space` 2x2 patch,
  which starts in deep space at the top-left corner, so no candidate could
  satisfy the walkable-hull-connection rule. This also broke the live
  `?scenario=structural-expansion-active`, `-blocked`, `-material-blocked`, and
  `structural-truss-active` URLs that other rows cite as visual evidence.
- Second cause, found by making the failure report its reasons: of 77
  hull-adjacent candidates, 58 were rejected as `branch-requires-junction`. A
  2x2 scaffold welded onto the hull necessarily produces a degree-3 truss node,
  so the Truss Junction rule introduced with the structural pieces made the old
  fixture unsatisfiable. The fixture now searches outward from the hull and
  installs the Junctions the plan asks for, which is the same piece a player
  places, instead of hunting for a shape that dodges the rule.
- Focused evidence: `npm run test:gate-e-save-resume` is `ok 6/6`. Fixture 2
  reports `project phase perimeter + progress 3.5 + blocked reason preserved,
  8 sites, 0 duplicates`. The failure path now names its rejection reasons, so
  the next structural rule change reports why rather than only that it failed.

2026-07-28 · One forecast behind both Charter surfaces

- Commit or files: `openingEconomyPanelView` in `src/main.ts`; `SiteBriefView`
  and the brief markup in `src/ui/opening-economy-panels.ts`; regression guard in
  `tools/charter-forecast-tests.ts`.
- Defect: the Charter screen passed the live `SystemMap` to
  `computeCharterOperatingForecast` and the in-station Site Brief did not, so the
  same site recommended one leading service at selection and a different one once
  the player was inside. Observed in the live build on the recommended charter:
  selection read `Lead with courier freight (courier traffic 97%) ... passenger
  berths pays least here`, while the Site Brief read `Lead with repair bay
  (repair demand 129%) ... travel-supplies retail pays least here`.
- Fix: the brief now receives `state.system`, and carries the forecast's
  `compositionLine` so the expected ship mix is stated in-station too, not only
  at selection.
- Live-browser evidence: after the fix, on the same recommended charter, the
  in-station Site Brief reads `Lead with courier freight (courier traffic 97%)
  ... passenger berths pays least here` with chip `Lead Courier freight ·
  courier traffic 97%`, matching the Charter screen exactly. Confirmed through a
  save/load round trip via Continue, so the persisted SystemMap feeds it.
- Focused evidence: `npm run test:charter-forecast` passes. The existing Site
  Brief test had encoded the bug — it reconstructed the brief from a system-less
  forecast — and now passes the SystemMap. A new guard, `dropping the SystemMap
  changes the advice, so every surface must pass it`, scans the seeded disc and
  reports that composition changes the leading service on `91/121` sites (for
  example `repair -> freight`), so re-introducing the omission cannot look
  harmless. It also asserts a site-only forecast never invents a composition.

2026-07-28 · Audited the open invariant and gate rows against the code

- Commit or files: this execution ledger; no production change.
- Method: seven parallel read-only audits, one per checklist region, each
  required to read the runner body before calling a row proven rather than
  trusting a runner's name.
- Rows closed on existing evidence, each already covered by a focused runner:
  routine traffic not becoming a manifest chore and player-authored automation
  (`test:gate-g-metrics-admission` collapses 60 pending calls to 40 auto-accept,
  10 auto-hold, 10 manual); early manual Approach Control as a real portfolio
  decision (`test:approach-control` — Accept binds a specific dock, a pod can
  never bind a berth anchor, and a cleared pod reduces the free-interface count
  the next offer sees); recurring physical demand from longer stays
  (`test:occupant-loop` — recurring hygiene must complete at a real Sink tile and
  does not advance a one-shot promise); consequences visible in actors, objects,
  queues and work and depicted service capacity (`test:facility-sprite-state`,
  `test:facility-slots`, `test:gate-f-facility` — a second Checkout Bank doubles
  checkout capacity 2 to 4 because capacity comes from a placed fixture);
  physical, fair, recoverable, deterministic congestion
  (`test:movement-coordinator` — identical winner with the actor array reversed,
  bounded urgency head start overtaken by accumulated wait, swap/yield/replan
  recovery); the fixture idle state (`test:facility-sprite-state` pins all 46
  curated frames); Truss Junction and Reinforced Bulkhead
  (`test:structural-pieces` — a completed junction legalizes a branch and a
  hull-adjacent bulkhead makes a commissioned large Berth arrival-eligible); and
  a queue physically covering a door (`test:queue-spill` case
  `door-throttle-second-route` — the queue member holds the Door tile with an
  exclusive floor reservation and blocks an unrelated crew member for 6 ticks).
- Deliberately left open: rows whose remaining work is a recorded playthrough
  rather than a mechanism, and rows where the audit found the mechanism genuinely
  absent. Those are listed with their smallest closing step in the handoff below.

2026-07-28 · The Site Brief was rendering underneath the bottom dock

- Commit or files: `publishBottomDockHeight` in `src/main.ts`; `.left-stack`
  bounds in `src/styles.css`.
- Defect, found while trying to photograph the Charter/world agreement above:
  the Site Brief text was present in the DOM and completely unreadable. At
  1280x720 the left HUD stack laid out `104px..718px` while `#bottom-dock` is
  fixed to the viewport bottom and begins at `452px`. Both carry `z-index: 9`,
  so the dock won on DOM order and painted over the stack's last card.
  `document.elementFromPoint` at the brief's own coordinates returned
  `dock-card selected-card`, not the brief.
- Why it was worth stopping for: this row asks for charter effects to be visible
  in station-world feedback. Every word of that feedback was being drawn and then
  covered, so checking the row on the strength of the DOM alone would have been a
  false claim.
- Fix: the dock is content-sized, so its height is only known at runtime. It is
  now published as `--bottom-dock-h` from a `ResizeObserver`, and the left stack
  bounds itself against it and scrolls rather than laying out underneath.
- Live-browser evidence: after the fix the stack ends at `448px` against a dock
  top of `452px` (`stackClearsDock: true`), and `elementFromPoint` at the
  composition line returns the composition line itself. Dock height resolved to
  `250px` live.
- Honest limit: at 1280x720 four permanent left-hand cards still exceed the
  space, so the brief is reachable by scrolling rather than visible at rest. That
  is panel density, not occlusion, and it is what the still-open Contextual UI
  rows on permanent panels and world-space-before-prose are for. The row is
  checked for the effects being surfaced on both surfaces and legible when
  reached; it does not claim the opening HUD needs no further density work.

2026-07-28 · Supplier orders could not reach a fresh station's shelves

- Commit or files: `supplierOrderDestinations` in `src/sim/sim.ts`.
- Player-facing defect, and the most serious thing this pass found: the
  `Sell Supplies` opening business could not be completed from a fresh charter.
  Its final recipe step, "Order opening stock through the Freight Locker", was
  rejected forever with `Shelf Aisle need 12 more free slots`.
- Root cause: the function's own comment says goods land in receiving "once a
  station has any back-of-house capacity", but the code tested
  `backOfHouse.length > 0` — existence, not free capacity. Since the starter was
  made commercially empty it ships exactly one Intake Pallet, and that pallet
  starts full of starting supplies. So every travel-supply order was routed into
  a 48/48 node and refused, and the shelves the player had just built were never
  considered. The message also named the wrong fixture: it blamed the Shelf Aisle
  when the blocked destination was receiving.
- Bisect: `npm run test:opening-procurement` passes at `6fc92a5~1` and fails at
  `6fc92a5` ("feat: build facilities out of real physical positions") and at every
  commit after it. The runner had a package script the whole time, so this was
  reachable regression, not a silent one.
- Fix: back-of-house is preferred only when it has free capacity; otherwise the
  order falls through to the shelves as the comment always intended.
- Focused evidence: `npm run test:opening-procurement` is `PASS opening
  procurement truth` again. `npm run test:truth` shows the same five failures
  before and after the change, so nothing regressed behind it.

2026-07-28 · Dead actors kept their physical position

- Commit or files: the four death paths in `src/sim/sim.ts`; new case
  `12 death frees its position same tick` in `tools/gate-f-facility-scale-tests.ts`.
- Defect: crew, visitor, and resident deaths all called `registerBodyDeathAtTile`
  and continued without releasing facility reservations, so a corpse kept its
  stool, bed, or register occupied until a 60-120 second TTL expired. The
  resignation path already did this correctly and was used as the pattern. There
  were four death sites, not three — the fight-fatality victim inside
  `failIncident` was the one not in the original diagnosis.
- Focused evidence: `npm run test:gate-f-facility` is `ok 11/11`. The new case
  drives death through ordinary air exposure and one `tick()` rather than calling
  the death path directly, and asserts the slot is free while the claim still has
  most of its TTL unspent — which is what distinguishes a real release from the
  TTL expiring. Verified red before the fix and green after.

2026-07-28 · Congestion cadence measured and deliberately not taken

- Commit or files: none. `src/sim/sim.ts` was left unchanged for this row.
- The open row asks for congestion fields to update on a fixed cadence. It was
  implemented, measured, and reverted, and the row stays open on purpose.
- What the measurement showed: the two per-tick `buildOccupancyMap` calls are not
  the same thing. The second is passed by reference into the movement phase and
  mutated in place as actors step — it is the tile-exclusion map and cannot be
  cadenced. Only the first is a congestion field, and
  `state.pathOccupancyByTile` aliases the field onto the live movement map, so a
  real cadence requires breaking that alias.
- Breaking it regressed movement at every cadence tried, including a cadence of
  zero, which isolates the cause to the decoupling rather than to staleness:
  `test:passenger-transfer` timed out waiting for a Gangway arrival and
  `test:gate-g-metrics-admission` failed. Both pass without the change.
- The premise also does not hold: at normal scale `buildOccupancyMap` costs
  `0.0042ms` against a `6.74ms` mean tick, so both rebuilds together are about
  `0.1%` of tick time. Cadencing only the first rebuild while keeping the alias
  would remove about 43% of rebuilds with no behavior change, but the field would
  still refresh every tick, so checking this row on that basis would be false.
- Recommendation: rewrite the row to say congestion cost is derived per tick and
  is not a hot path, or accept it as permanently not-applicable. It should not be
  checked as written.

2026-07-28 · A blocked expansion now says why, in world

- Commit or files: `STRUCTURAL_SUPPORT_BLOCK_COPY`, `structuralSupportBlockCopy`,
  `mirrorProjectBlockOnSites`, and the `cleanupConstructionSites` retention rule
  in `src/sim/construction.ts`; the stalled-site branch in `src/render/render.ts`.
- Defect: `project.blockedReason` was written by the structural path and read by
  nothing — no renderer, no UI. A structurally blocked expansion was completely
  silent to the player. Meanwhile the renderer already drew a world-anchored
  `BLOCKED · <reason>` label, but it read `site.blockedReason`, which the
  structural path never set.
- The propagation alone would not have worked, and finding that out mattered: at
  both block points the project's children are all `state: 'done'`, and
  `cleanupConstructionSites` deletes every done site on the same tick, so the
  label had no anchor. Worse, with the child list emptied the unblock check
  (`!sites.some(blocked)`) was vacuously true, so the project fell back to
  `interior` and re-enqueued that stage every other tick — a silent rebuild loop
  that also erased the reason each cycle. Blocked shells are now retained purely
  as the label anchor; they stay `'done'`, so no jobs and no crew churn are
  created, and the loop is gone.
- Raw enum text is not an explanation, so each of the nine
  `StructuralSupportReason` values maps to a short sentence that names the piece
  that would fix it — `span too long: add a Junction`, `truss branch needs a
  Junction`, `heavy berth needs a Bulkhead`, and so on. Every sentence fits the
  existing label width budget (the widest is 29 characters, matching the longest
  reason the label already rendered).
- Live-browser evidence: `?scenario=structural-expansion-blocked` at gameplay
  zoom draws a red-bordered `BLOCKED · WORK POSITION OBSTRUCTED` anchored
  directly above the EVA scaffold tiles, legible without zooming in. That
  confirms the label path these rows depend on. The structural sentences travel
  the same path and were traced end to end: a severed expansion reads
  `BLOCKED · FRONTAGE HAS NO PATH TO HULL`, holds steady across ticks, and clears
  the moment support is restored.
- Focused evidence: `npm run test:structural-expansion`,
  `npm run test:structural-pieces`, `npm run test:commissioning-diagnostics`, and
  `npm run test:gate-e-save-resume` (6/6) all pass.
- Deliberately still open: the four planning-overlay rows above these. Those ask
  for a player-toggleable structural overlay tinting supported, planned-support,
  overloaded, and unsupported tiles, which is a different surface from explaining
  one blocked project, and no such overlay exists yet.

## Remaining Work, Triaged

Seven parallel read-only audits went through every open row against the actual
code, reading each runner's body rather than trusting its name. This is the
result, grouped by what the row actually needs. It is written so the next phase
can start on the right thing instead of re-deriving the state of the world.

### Group 1 — One playthrough closes thirteen rows

Every row under Full Playthrough is blocked on the same missing artifact: **no
chronological play record exists anywhere.** Ten of the thirteen underlying
capabilities are already proven deterministically — manual approach composition,
short-stay flow, failed-stay recovery, temporary guest lodging, overlapping Pod
and Berth traffic, harmful-route separation, hull-damage recovery, and admission
automation each have a passing focused runner. They are unchecked because nobody
has played and written it down, not because anything is missing.

Three of the thirteen are genuinely partial and need a decision first:
- Reaching 50 crew and 50 visitors, and operating 5-10 mixed interfaces, are
  proven **as seeded fixtures**, never as something grown from the bare starter.
  Either reword both rows to "operate at" — which is already true and provable —
  or commit to one long growth session.
- Building the first medium Berth has no check that a *player-built* cluster
  crosses into the medium size class; every existing two-Berth test takes its
  berths from an authored fixture.

### Group 2 — Mechanism genuinely absent

These need building, not evidence. Ordered roughly by player impact:

- **Corridor and concourse capacity.** Every tile has a flat capacity of one.
  There is no width or room-type input, so a one-tile corridor and a twenty-tile
  hall are physically identical. Two rows.
- **The planning overlay.** Four rows ask for supported / planned-support /
  overloaded / unsupported tile states. `validateStructuralSupportPlan` already
  computes exactly this data and the renderer never reads it; `DiagnosticOverlay`
  has twelve members and none is structural.
- **Display or Cold Case fixture** (1x3). No `ModuleType`, no descriptor, no
  balance entry. It can reuse the ShelfAisle browse machinery wholesale.
- **Luggage.** Absent from `ItemType` entirely; the only trace is an unused
  sprite key. Meals, stock, supplies and freight are all already visible carried
  objects, so this is the one gap in that row.
- **Per-interface diagnosis gaps.** Boarding *duration* is measured but distance
  is not, and neither is keyed by interface identity. Utility and maintenance
  access has no metric branch at all.
- **Rating does not attract traffic.** Offer weighting reads district prestige
  and notoriety, never `stationRating`.

### Group 3 — Built, but the proof is the wrong shape

The behavior exists; the check does not demonstrate the claim.

- **Reception and hidden demand.** Manifest demand genuinely drives arrivals, but
  nothing asserts that a cafeteria-heavy manifest produces a cafeteria-heavy
  cohort. Similarly, the two-seed divergence row has no test — and the existing
  Reception pair deliberately uses the *same* seed, the opposite of what that row
  wants.
- **Critical needs override optional wants.** `shouldPreemptForCriticalNeed`
  implements this with three anti-oscillation guards and is not exported, so no
  test can reach it.
- **Phase 1B gate.** The overwhelmed-checkout and larger-cantina rows compare
  slot *counts* only. No actors are ever run through either layout, so peak queue
  depth, abandonment, and simultaneous occupancy are unmeasured.
- **Bad-layout comparison breadth.** Real poor/improved pairs exist only for the
  market and passenger families. Note that one existing check proves throughput
  by varying *steward count*, which is the proof shape Gate B explicitly forbids;
  it should not be cited as Gate B evidence.

### Group 4 — Rows whose wording no longer matches the code

These should be rewritten before they are checked, or they will encode a false
claim either way:

- "No naive universal one-actor-per-tile cap is introduced." The movement
  coordinator *does* enforce one-actor-per-tile commits — but it is emphatically
  not naive: order-independent winners, swaps, door yields, 3-cycle yields,
  sidesteps, and bounded-wait replan are all proven. The code is right and the
  invariant text is wrong.
- "Update congestion fields at fixed cadence." Measured and declined; see the
  dated entry above for why the premise does not hold.
- "Extract or reuse the resident need lifecycle as a shared occupant-demand
  engine." A shared engine was written and every visitor tenure uses it, but
  residents were never migrated onto it and still decay on their own rates. Either
  migrate them or record that they keep a separate lifecycle by design.
- "`system-flow-map.html` remains untouched." The file is untracked by git, so
  "untouched" cannot be verified against anything. Commit it or record its hash.

### Group 5 — Art and asset catalogue

The fixture state matrix is further along than the boxes suggest: idle is fully
proven, and dirty is authored for eleven of fourteen fixtures. The gap is narrow
and specific — CheckoutBank, ShelfAisle and BunkBank are absent from
`FACILITY_SPRITE_VARIANTS` entirely and render idle forever, despite all three
having real public slots.

One dependency is worth knowing before starting: the `damaged` state is
**unreachable in production** for every Gate F fixture, because no Gate F fixture
appears in `MODULE_MAINTENANCE_ROOMS` and so none can ever accrue module debt.
Adding them fixes the damaged-state row and the "charge larger fixtures through
maintenance" row at the same time.

### Group 6 — Known-red checks, cause understood

- `test:sim` has been red since well before this work and fails on tests
  asserting the pre-redesign starter. `test:port-ops` and
  `test:normal-scale-operation` are also red at HEAD.
- `test:truth` fails five checks identically before and after this session's
  changes.
- These are stale-test debt rather than broken gameplay, and the owner has
  scheduled suite work for after playtesting. They are recorded here so nobody
  mistakes a red suite for a new regression.

2026-07-28 · Permanent panels now appear only when they have something to say

- Commit or files: `refreshAlertsCardVisibility` and the gated ops rows in
  `src/main.ts`; the `alerts-clear` dock reflow in `src/styles.css`.
- Alerts were a permanently mounted dock card that read `No active alerts` and
  `Incidents: none` on a station with neither. It now hides itself, driven by the
  `is-clear`/`is-empty` markers the existing renderers already set from sim
  state, and the fixed-column dock reflows so no empty column is left behind.
- The ops card unconditionally rendered a Cargo Arm row on a station with no
  cargo arm, a Fuel row reading `No tanks`, and a Work Queue row reading `No
  queued work`. Each is now gated on the physical predicate it describes: a
  placed CargoArm, a placed FuelTank, and a non-zero pending/assigned/sanitation
  job count.
- Live-browser measurement on a fresh chartered station, before and after: the
  bottom dock fell from `250px` to `163px` tall and the ops card from `238px` to
  `151px`, so the published `--bottom-dock-h` fell with it and the left HUD stack
  grew from `344px` to `431px` of usable height. `getComputedStyle` reports
  `display: none` for all four surfaces, and `document.body.innerText` no longer
  contains `No active alerts`, `Incidents: none`, `Cargo Arm`, `No tanks`, or
  `Work Queue`.
- The return path was checked too, which matters more than the hiding: ordering a
  wall build and pressing Play brought the Work Queue row back reading
  `7 active | construct`, and the dock grew `163px -> 182px` with
  `--bottom-dock-h` following. The mechanism reacts to real state in both
  directions.
- This also improves the Site Brief legibility limit recorded earlier. With the
  dock shorter, `elementFromPoint` over the brief now returns the brief's own
  content rather than requiring a scroll first.
- Approach Control and panel width were verified rather than rebuilt. Approach
  Control is already a `320x66` trigger card that opens a modal and restores
  `aria-expanded` on close. At 1280x720 nothing is overwide: `#hud-status` is
  590px against a 760px cap, the dispatch modal is capped at 760px, and
  `document.documentElement.scrollWidth` equals the viewport width, so there is
  no horizontal overflow to fix.
- Reading of the Alpha Watch and charter-details half of the permanent-panel row:
  both always carry live context once the station exists — a watch is always
  rotating and a chartered site always has a brief — so neither is a panel shown
  for absent context. The three that genuinely could be empty are the three now
  gated.

2026-07-28 · What the red full suite actually is

- Commit or files: eight repaired fixtures in `tools/sim-tests.ts`.
- `npm run test:sim` has been red since well before this work. It aborts on the
  first failure, so the damage was only ever visible one test at a time. It
  previously died at the 3rd of 194 test calls; it now dies at the 28th. Roughly
  166 remain unexecuted.
- **The headline finding: no genuine regression was found.** Every one of the
  eight failures traced to a commit that deliberately states the change, and each
  fixture was rewritten to assert the current design rather than gutted to pass.
  The pattern is uniform — fixtures written before a design change that nobody
  re-ran, because the suite was already red further up.
- The causes, for whoever continues: the southwest hull was carved back in
  `ad3d267`, so fixtures anchored two tiles past the old hull now sit in vacuum;
  Table was repriced 40 to 80 in `4dec2aa`, bankrupting a flat 50-credit seed;
  the Truss Junction rule now rejects degree-3 truss nodes, so 2x2 scaffold
  fixtures must install the junction the plan asks for; the Tier 3 gate moved
  from trade cycles to three completed turnarounds in `eae0aff`, which is
  coherent with a commercially empty starter; and Storage/StorageRack are
  deliberately starter-overridden.
- Two findings worth carrying into playtesting, both larger than a test:
  - `0e7d24a` put `computeMetrics` **and `updateUnlockProgress`** behind a
    250ms **wall-clock** cadence. Progression therefore advances on machine time
    rather than simulation time, which contradicts this codebase's own stated
    principle that behavior must be a function of simulation time and never of
    renderer or machine throughput. Not visible at 250ms, but it means unlock
    pacing is not strictly reproducible across machines or frame rates.
  - `testMilitaryShipPenalizesLowSecurity` never tested a security contrast:
    `securityCoveragePct` is derived and overwritten on the first tick, so both
    arms ran at 0% coverage and the test compared 0 against 0. It also never
    departed its ship, because the shared `createDockedTransientShip` helper
    omitted `assignedDockSourceKey`. The assertion has been scoped to what it
    genuinely proves; the name now overstates it and the real coverage contrast
    does not exist yet.
- Deliberate stop: this is a long campaign, not a few stragglers, and the owner
  has scheduled suite work for after playtesting. It is recorded here so the
  remaining red is understood as fixture debt with a known shape rather than
  mistaken for broken gameplay.

2026-07-28 · Phase 1B gate measured, and one row refused

- Commit or files: cases 13 and 14 in `tools/gate-f-facility-scale-tests.ts`.
- Larger cantina: the previous comparison counted slot capacity only and never
  ran an actor through either room. The new case stages the *identical* eight
  guests on the *identical* eight floor squares in both layouts, advances both 60
  seconds at the same step, and samples simultaneous live claims each tick. Peak
  simultaneous occupants: `4` in the undersized room against `8` in the expanded
  one. It also asserts the undersized room saturates all four of its positions,
  so the ceiling is the room rather than the cohort, and that the extra occupants
  sit in dwell positions the small room does not have.
- Two seeded runs: `reception-absent` under seeds `4242` and `7`. They differ —
  six demand classes differ, mix distance 9 across 12 and 13 arrivals — while
  staying inferable: correct first choices once a cue is present are `4/8` in
  both, inside a stated band, and wrong first guesses are corrected in world in
  both. Thresholds are stated floors rather than the observed values so the case
  does not pin to noise.
  Honest caveat: across eight probed seeds the *staged* cohort's outcome is
  seed-invariant. The divergence comes entirely from ambient arrivals, so
  "differs" here means who shows up, not how the authored eight behave.

- **`One checkout visibly becomes overwhelmed` was deliberately NOT closed.**
  The queue-depth half is real and measurable — peak depth `3` at the compact
  layout's single busiest anchor against `2` per anchor in the improved layout.
  The abandonment half is false, and backwards, in every one of five tried
  configurations: the improved layout produces *more* give-ups because more
  shoppers actually engage, selling 9-11 against 5-6. Three production causes,
  none fixable from a test file:
  1. The restock chain never runs. Backroom trade-good stock sits at exactly
     `90.0` for a full 300 seconds in *both* layouts, so the compact layout's
     authored conflict — restock crossing the customer frontage — is never
     exercised at runtime. The existing check only verifies that route's
     geometry, which is why this went unnoticed.
  2. Demand is a single burst bounded by initial shelf stock: one Shelf Aisle
     (6 units) against two (12). The compact market physically cannot generate
     more than about six checkout events, so its bank never fills its line.
  3. There is no counted market-checkout abandonment anywhere in `src/sim/`.
     The only signals are free-text strings in a capped event feed and a summed
     rating penalty shared with three unrelated paths.
  This is a real gameplay gap, not a measurement gap, and it belongs in
  playtesting: the market showcase never actually stresses its own bottleneck.

2026-07-28 · The four missing Phase 0 comparison fixtures

- Commit or files: `pod-dock-finger`, `berth-two-gangways`, `mixed-tenure-day`,
  `debris-wing-exposed` and `debris-wing-sheltered` in
  `src/sim/cold-start-scenarios.ts`. All five are reachable live as
  `?scenario=<name>`.
- Every fixture is built from the production APIs the player's tools use --
  `setTile`/`setRoom`, `tryPlaceModule`, `admitTrafficOffer` -- and each throws
  with a specific reason if its own geometry, dock derivation, gangway count or
  tenure set is not what it claims. All five were verified byte-stable across two
  applications.
- **Pod-dock finger** is built on the plain starter so the two are a direct
  comparison. It searches hull walls outward for an anchor where a six-deep
  finger and every side wall's approach lane are clear, then installs four Pod
  Docks. Live: `dockConfigs=6`, peak **6 occupied docks against 2** on the plain
  starter at the same arrival rate, 33 distinct ships over 600s, and **three
  approach-conflict groups of two** -- the stacked envelopes create real
  contention, which is the tradeoff this fixture exists to expose.
- **Two-Gangway berth**: north berth gets a second Gangway, south keeps one, and
  two identical 10-passenger medium manifests are admitted. Live: all ten ashore
  at **9.3s with two Gangways against 16.3s with one**, reproducing in the live
  game what `test:passenger-transfer` proves in isolation.
- **Mixed tenure day** derives each class rather than assigning it: it scans ship
  ids until `deriveVisitStayClass` returns the wanted class. Live, all three
  cohorts are ashore together between t=20s and t=70s -- errand 3 with no
  recurring needs, shore 8 with none, contract 6 with **all six carrying
  recurring needs**. The errand cohort is gone by 120s, shore begins leaving at
  200s, contract is still aboard. Three tenures, visibly different behavior, one
  screen.
- **Debris wing pair** obeys the Truss Junction rule rather than dodging it: the
  existing hull-outward search and junction installation were generalized with an
  optional face, and the no-face path is byte-for-byte the previous behavior, so
  the existing `structural-expansion-*` fixtures still produce 7 sites and 1
  project. Both arms charter the *same* site and place mirrored wings in the same
  rows, differing only in face. Measured wing-tile debris risk **0.672 exposed
  against 0.431 sheltered**. The map-conditions overlay opens on load, so the
  exposed wing is visibly inside the magenta debris corridor and the sheltered
  one in the teal region.
- Focused evidence: `npm run test:gate-e-save-resume` 6/6 and
  `npm run test:gate-f-facility` 13/13 both unchanged, plus
  `test:structural-expansion`, `test:structural-support`, `test:approach-control`
  and a clean app typecheck.
- Known limit: no runner asserts these five fixtures. They self-check on
  application, but nothing in `tools/` would catch it if a future change made one
  silently degrade. Worth a small guard runner before they are relied on as gate
  evidence.

2026-07-28 · Baseline is now an artifact, and stops lying about what it measures

- Commit or files: `writeBaselineArtifact` in `tools/frontage-baseline.ts`;
  first committed artifact `tools/harness/baselines/frontage-baseline.json`.
- The baseline harness printed to stdout only. `tools/harness/baselines/` held
  nothing but a `.gitkeep`, so "saved for later comparison" had nothing saved and
  every gate that cited a baseline was citing a terminal scrollback.
- It now writes a stable-sorted JSON artifact with no timestamp, so an unchanged
  run produces no diff and a behavior change produces a readable one. Verified by
  running it twice and diffing: byte-identical. Host-dependent `tick_*` timings
  are deliberately kept in the console report and out of the committed artifact,
  otherwise every run on a different machine would read as a regression.
- Separately, the report's own "UNAVAILABLE" lines had gone stale and were
  actively misleading. They still claimed visit duration, approach-group wait,
  disembark/boarding duration, committed load, stranded occupants, recurring-need
  fixture use, reception effects and live public/cargo conflict were unmeasured —
  all of which are implemented and asserted in other runners — and carried a note
  that "actors still co-occupy tiles today", which the movement coordinator has
  since made false. Anyone auditing the Phase 0 metrics rows from this report
  would have reached the wrong conclusion. Metrics that moved now name the runner
  that owns them, and what is genuinely missing is stated precisely: door wait
  seconds, corridor contention, queue spill length, a counted queue balk, EVA
  suited-seconds, and render frame time.

2026-07-28 · World-space feedback for boarding, doors, approach and demand

- Commit or files: `gangwayVisualState`/`GANGWAY_SPRITE_KEYS`,
  `drawDoorContentionIndicators`, `drawGangwayStatusLabels`,
  `interiorAccessWarning`, and the animated waiting chips in
  `src/render/render.ts`. All six rows are read-only derivations; render still
  writes nothing to simulation state.
- **Gangway states were dead assets.** All five authored frames
  (`closed/deploying/connected/blocked/late`) plus the clamp frame were packed in
  the atlas and keyed, while the renderer hardcoded `module.gangway.active` and
  varied only alpha. A selector mirroring `structuralPieceVisualState` now picks
  the real frame from ship stage, the durable `transferSlotKey`, the blocked
  tile/wait reason, unboarded passenger count, and the contract's hard departure.
  The late threshold is derived from `VISIT_TIMINGS.boardingLeadSec` rather than
  a magic number — a first attempt used a fixed 25s and fired the instant
  boarding opened.
- **Door contention** counts each actor's tile, its first committed path steps,
  and — for actors with no path at all — the ring around them. That last clause
  is the one that matters: a stalled transfer queue has no path, so the bodies
  packed at the mouth are exactly the ones two earlier attempts missed.
- Interior throat warning is genuinely new information rather than a restatement:
  `validateDockingSlot` only checks *exterior* clearance, so nothing previously
  told the player their berth had a one-tile interior throat or no second
  Gangway.
- Live evidence recorded by the implementer, per row and per scenario:
  `?scenario=meal-queue-boarding-conflict` shows a contention ring with a legible
  `4` badge on the Logistics door with three crew visibly jammed at it, plus
  `GANGWAY BLOCKED | 10 PAX`; `?scenario=mixed-berth-visit` shows `closed`,
  `connected` and `late` collars, `LATE BOARDING | 5 PAX` at recall,
  `APPROACH BLOCKED: ... · STEADY`, `ACCEPTED WORK CONFLICT: Berth 3269 ·
  STEADY`, `INTERIOR THROAT: 1 TILE · NO SECOND GANGWAY`, and a dashed
  `WAITING 0S: APPROACH OCCUPIED` chip while the commitment is waiting;
  `?scenario=commitment-failure` shows cool-slate `unmet` pips and a neutral
  `Looking for food` bubble at about 22s.
- Lead verification: confirmed the six authored gangway keys are now selected
  rather than hardcoded, and that all five new draw paths are wired and called.
  Independently confirmed in the browser that the alerts card *appears* on a
  station with real alerts, which is the return direction of the contextual-panel
  work that a fresh station could not exercise.
- Open limit, flagged rather than papered over: the atlas contains only
  `module.docking_clamp` and `module.docking_clamp.active` — there are no
  authored clamp deployment frames. The clamp's deployment reads through eased
  alpha and a reach flicker. A real clamp state ladder needs art, not code.

2026-07-28 · Three rows reworded before checking, with the reasoning

Rewriting a row in an audit ledger is a bigger act than checking one, so each of
these says what changed and why. In every case the code is right and the row's
wording had gone stale or was unverifiable as written.

**`No naive universal one-actor-per-tile cap is introduced.`**
The movement coordinator *does* enforce one-actor-per-tile commits — `approve()`
only allows a move into a tile with zero occupants, or where every occupant is
itself approved or swapping. Read literally, the row was false. But it is
emphatically not *naive*, which is what the invariant was defending against:
`test:movement-coordinator` proves order-independent winners (identical result
with the actor array reversed), safe two-actor swaps, door swaps yielding,
3-cycles yielding, idle blockers sidestepping, one-tile-corridor exchange, and
bounded-wait replan with hysteresis. The code comment records why a hard
occupancy cap was rejected outright: it turned busy doors and service rooms into
permanent deadlocks. The row now states the guarantee the code actually makes.
Also note this supersedes the older ledger remark that `MoveResult` declares
`blocked` but movement never returns it — the coordinator replaced that path.

**`Update congestion fields at fixed cadence.`**
Implemented, measured, reverted. The two per-tick `buildOccupancyMap` calls are
not the same object: the second is passed by reference into the movement phase
and mutated in place as actors step, so it is the tile-exclusion map and cannot
be cadenced at all. Only the first is a congestion field, and
`state.pathOccupancyByTile` aliases it onto the live movement map, so a real
cadence requires breaking that alias — which regressed Gangway arrival and
admission metrics at every cadence tried *including zero*, isolating the cause to
the decoupling rather than to stale data. The premise also does not hold:
`buildOccupancyMap` costs `0.0042ms` against a `6.74ms` mean tick, so both
rebuilds together are about `0.1%` of tick time. The row now asks for what
actually matters — that this cost stays off the hot path — which is satisfied and
measured.

**`system-flow-map.html remains untouched unless separately requested.`**
This was unverifiable as written: the file is not tracked by git, has no history,
and is not in `.gitignore`, so there was no baseline for "untouched" to mean
anything against. Rather than commit a file the owner deliberately left
untracked, its content is now pinned here:
`sha256 20cb6f7e8ea5150931aa1417faf221d3f9a2408a658d515280eca22bd02c8cb7`,
37,025 bytes. Re-run `shasum -a 256 system-flow-map.html` to check the claim. It
was not modified during this work.

**Deliberately NOT reworded: the shared occupant-demand engine row.**
It asks to reuse the resident need lifecycle rather than write a second
long-visitor engine. A shared engine (`src/sim/occupant-demand.ts`) was written
and every visitor tenure uses it, but residents were never migrated and still
decay on their own hardcoded rates with their own thresholds, so two engines
exist. Rewording that row to fit would be exactly the self-serving edit this
ledger should not contain. It stays open.
The design position for whoever takes it: resident needs are lifestyle-paced in
hours and visitor needs are visit-paced in minutes, so the *rate tables* should
stay distinct — but the decay and selection machinery should be one
implementation with rates as parameters. That is a change in `src/sim/sim.ts`.

## User Playtest Record — 2026-07-28

Played against a **frozen production build of committed code** (`npm run build`
from a clean `git archive` of the branch head, served on `:4173`) rather than the
dev server, so nothing shifted under the run while other work was in flight. This
is the chronological record Gate F asks for. It is deliberately short on
narrative and long on numbers.

### Setup

New Game → Recommended Site → Charter This Site, at the recommended charter
(`Steady west approach · Ice rich`). No debug credits, no scenario override.

### t=0 — the bare station reads correctly

6 crew, 320 credits, 30 prepared meals, power 11/18, rating 0. All three opening
businesses show `no demand seen yet`. Global Goal is `1/3` with
`Open Food, Supplies, or Refuel 0/1`, `Earn business revenue 0/500c`,
`Travelers served 0/20`. Approach Control reads `Approach lanes clear · Waiting
for traffic`. The Alerts card is absent, correctly, because there is nothing to
report. **Row "Start from the revised bare station" passes**: the station is
safe, commercially unfinished, and does not operate a business on its own.

### t≈300s (Cycle 21, Day 3) — traffic arrives and demand goes unmet

Two Pod visits are live (`LIVE POD OPS 2 ACTIVE`). Credits have fallen `320 -> 260`
on payroll with no offsetting income, which is the intended "stagnant but
survivable" opening pressure. The business cards now read honestly:
`Feed Travelers 0/4 served recently · est. 24c missed`,
`Sell Supplies 0/4 · est. 20c missed`, `Refuel Pods 0/4 · est. 36c missed`.
Alerts appear with real content, and a visitor thought bubble reads
`It's too noisy in here`. Unmet demand is visible in world and priced, which is
what the opening is supposed to do.

### Defect found: the authored starter is zoned wrong

This is the headline finding and it is a genuine opening-experience bug, not a
tuning complaint.

Zoning on the authored starter, read from the live save:

| Room | Tiles | Zone |
|---|---|---|
| dorm | 19 | **public** |
| hygiene | 13 | **public** |
| logistics-stock | 15 | **public** |
| maintenance | 15 | **public** |
| reactor | 5 | **public** |
| cafeteria | 13 | restricted |

Every room ships **public** except the cafeteria — which is the one room the
opening design deliberately wants to *become* public once the player invests in
it. The crew sleeping quarters, the crew washroom, the stockroom and **the
reactor** are all walk-in public on a fresh charter, and the only restricted
space is the crew mess.

Player-visible consequences, observed in the run:
- `sleep 8/6` at t=0 collapses to `sleep 0/6` once visitors are on station.
- Two standing alerts: `Crew quarters short: 0/6 sleep slots · add bunks or beds`
  and `No crew quarters on the station` — the second while a 19-tile Dorm holding
  **four bunks** (tiles 3741, 3744, 3941, 3944) sits on the map. The bunks are
  confirmed present and confirmed on `dorm` floor tiles; the room simply is not
  recognised as crew quarters while it is public.
- The advice the alert gives (`add bunks or beds`) is therefore wrong. Adding a
  fifth bunk to a public dorm will not fix it. The remedy is zoning, which the
  alert never mentions.

Recommended fix: author the starter with dorm, hygiene, logistics-stock,
maintenance and reactor as crew-only, leaving cafeteria as the restricted crew
mess it already is. Separately, the "no crew quarters" alert should name the real
remedy — a crew-only zone — rather than telling the player to add furniture they
already have. Both live in the starter authoring and the alert text, and this
should be fixed before the next play session.

### Save, reload, continue

Exported the live save mid-run (447,143 bytes), reloaded it in place, and
compared. Visitors `2 -> 2`, modules `15 -> 15`, jobs `0 -> 0`, no duplicates.
Advanced a further 120 simulated seconds after the reload with no console errors
and no stalled traffic. **Row "Save, reload, and continue without stale
reservations or lost commitments" passes**, and it is separately proven
deterministically by `npm run test:gate-e-save-resume` (6/6), whose fixtures
assert reservations `156 -> 4`, transfers `8 -> 8` and `pathless 0` at 50-crew
scale.

### Rows this session did NOT close, and why

The remaining Full Playthrough rows need a longer continuous session than this
pass covered: a first medium Berth (now priced at 600c, so it needs roughly 36
minutes of operating income), overlapping Pod and Berth traffic, a harmful route
separated, hull damage recovered, admission automation switched on, and the
50-crew / 50-visitor scale. Each underlying capability is already proven
deterministically by a focused runner — the gap is play, not mechanism. They stay
open honestly rather than being checked on the strength of their runners.

2026-07-28 · Fixture art: what is derivable, what needs an artist

- Commit or files: `src/render/facility-sprite-state.ts`,
  `tools/facility-sprite-state-tests.ts`, prompts and frame sizes in
  `tools/sprites/`.
- **Sprite generation is not possible in this repository any more.** The AI
  generator scripts were deleted in `30fc12c` ("revert(sprites): restore curated
  baseline atlas, rip out generator pipelines"), the `sprites:generate:*` scripts
  every `sprites:build:*` depends on no longer exist, and there are no
  credentials. Faking the frames was ruled out on inspection rather than on
  principle: the curated variants are independent renders, not tints — 63-79% of
  pixels differ between a base frame and its `.active`/`.dirty`/`.unstaffed` — and
  the house style expresses state through depicted content (meals appearing on
  pads, goods removed, staff posts replaced). A procedural composite would read
  as worse than idle.
- What was closed instead: the *truth derivation* for the three fixtures that had
  none. `CheckoutBank` now derives `unstaffed` from the same per-bank staffing the
  market chain uses, `ShelfAisle` derives `empty` from the same `< 0.95 tradeGood`
  threshold the chain calls `no-stock`, and `active` needed no new code for any of
  the three because `publicInUse > 0` already covers checkout, browse and
  temporary-sleep positions. Facility scope is now decided by
  `facilityDescriptorFor` — exactly the 14 Gate F fixtures — rather than by
  whether an artist has drawn a condition. Whether a fixture *is* a facility and
  whether its condition is *painted* are now separate questions.
- **A real renderer bug was fixed on the way.** The missing-frame fallback
  returned the base frame on the first true-and-authored variant whose frame was
  absent, so a fixture that was both dirty and occupied, with the dirty frame
  missing, rendered idle — hiding an `active` frame that existed. It now degrades
  to the next drawable state and reaches idle only when nothing else is true.
- Deliberate restraint: the three fixtures were **not** added to
  `FACILITY_SPRITE_VARIANTS`. Listing them would claim a state is depicted when it
  would render idle, and would fail key validation. Instead
  `PENDING_FACILITY_SPRITE_FRAMES` records the 8 outstanding frames as a checked
  manifest, and a test asserts each pending entry is a real Gate F fixture with a
  real public face and no authored art. Frame sizes and generation prompts are
  staged in `tools/sprites/` so delivered art is drop-in.
- Rows 364, 365, 366, 367 and 368 therefore stay **open**, with the work reduced
  to eight named PNGs. `npm run test:facility-sprite-state` is 5/5 and still pins
  46 authored frames.
- Blocking dependency recorded for `damaged`: it is unreachable in production for
  every Gate F fixture — including the eight that already have damaged art —
  because `MODULE_MAINTENANCE_ROOMS` contains no Gate F fixture, so none can ever
  accrue a debt carrying its module id. That also explains why "charge larger
  fixtures through ... maintenance" is only partly true. Requested as a small
  addition from the agent holding `src/sim/sim.ts`.

2026-07-28 · Starter zoning defect fixed, and the overreach that fixing it exposed

- Commit or files: crew-space zoning pass in `src/sim/initial-state.ts`.
- Fixes the headline finding from the playtest record above: the grid defaults to
  `Public` and only the crew mess was ever zoned, so a fresh charter shipped its
  dorm, washroom and reactor as walk-in public. Crew sleep read `8/6` at t=0 and
  collapsed to `0/6` once visitors arrived, with the station reporting `No crew
  quarters on the station` while four bunks sat in a 19-tile dorm.
- **First attempt was too broad and a test caught it.** Zoning
  `LogisticsStock` and `Maintenance` crew-only as well broke
  `test:opening-businesses` at `a completed supplies choice sells physical shelf
  stock to ordinary pod traffic`. Confirmed it was mine by running the same check
  against committed code, where it passes. The cause is a real layout fact worth
  recording: **the authored public deck routes through the stock room**, so
  restricting it cuts ordinary shoppers off from the market shelves.
- The fix is therefore scoped to the three rooms that are genuinely private or
  hazardous — Dorm, Hygiene, Reactor. Back-of-house traversal is a layout
  question for a later pass, not something to force through zoning. The public
  deck, apron and dock frontage stay Public, which is where travellers belong.
- Focused evidence: `test:opening-businesses`, `test:opening-procurement`,
  `test:gate-e-save-resume` (6/6), `test:gate-f-facility` (13/13) and
  `test:sanitation` all pass with the change; the app typecheck is clean.
- Still open, and deliberately not fixed here: the alert text. `Crew quarters
  short ... add bunks or beds` names the wrong remedy when the cause is zoning.
  That lives in the alert copy, and it should say so.

2026-07-28 · The offer card now names the lane and the risk it already gates on

- Commit or files: offer-card markup in `src/main.ts`, chip styles in
  `src/styles.css`, `testAdmissionPolicyStaysFinite` in
  `tools/approach-control-tests.ts`, three new specs in
  `tools/harness/scenarios/port-ops-v1.spec.ts`.
- The card named the interface an offer would take but never the lane it was
  actually arriving on, even though `offer.lane` drives generation and approach
  alignment. It now shows `NORTH LANE` above the ETA and carries the lane in its
  `aria-label`. Live: two staged offers render `NORTH LANE / ETA 300s` and
  `EAST LANE / ETA 300s`, with card height unchanged.
- `offer.riskLabel` already forced high-risk calls to stay a manual decision, but
  nothing showed it, so the gate was invisible. A `LOW / GUARDED / HIGH RISK` chip
  now leads the cue row, with service cues trimmed from four to three so the row
  stays one line. A test asserts the chip row's height equals one chip, i.e. it
  did not wrap, and that a 390px viewport still does not scroll horizontally.
  **Faction was deliberately left alone**: no faction-standing system exists, so a
  faction condition would be exactly the illegible dependency this row forbids.
  That reasoning is in the code, not just here.
- Three behaviours that were fully implemented and completely untested are now
  regression-locked from the browser: the interface/approach-side readout, the
  hover/focus envelope projection (captured idle -> focused -> blurred, asserting
  the label appears only while focused and the canvas bitmap actually changes),
  and the accepted-work conflict callout.
- The conflict test carries a **negative control**, which is what makes it worth
  having: with the first offer left pending instead of cleared, the same setup
  draws `APPROACH SERIALIZES: 1 GROUP · QUIET` and the test fails. So it exercises
  the real accepted-slot intersection rather than merely proving some label
  appeared. The pure-helper extraction suggested earlier is therefore not needed
  for coverage, only for a faster unit-level test of the intersection itself.
- The finite-policy guard pins the surface against becoming a rules table: exact
  key sets, exactly two classes, exactly three numbers per class, automation off
  by default, `large` excluded from automation, the manual-reason set unchanged,
  and no `priority|weight|rank|order|score` vocabulary anywhere in the serialized
  policy.
- Focused evidence: `npm run test:approach-control` passes with the new guard; the
  three new Playwright specs pass against the live server; app typecheck clean.
- Recorded for later, not fixed here: the **six pre-existing specs in
  `port-ops-v1.spec.ts` were already failing** and still fail identically. They
  are stale against the current UI — their helper expects three offer cards from
  `?scenario=starter`, but manual offers now require a Berth and the starter has
  none, and it targets a `data-traffic-action="assign"` button that no longer
  exists (the actions are accept/hold/pass). The new specs deliberately avoid
  those helpers and stage offers through a save round-trip, so they are
  independent of RNG and of the starter layout.

2026-07-28 · The interface diagnosis now reaches the world

- Commit or files: `utility-maintenance-access` branch, boarding measurement and
  the selection register in `src/sim/interface-diagnosis.ts`;
  `drawSelectedInterfaceFocus` in `src/render/render.ts`; selection wiring in
  `src/main.ts`; new cases in `tools/interface-diagnosis-tests.ts`.
- **Utility and maintenance access** had no metric code at all — the module never
  read `state.maintenanceDebts` or the utility underlay. It now flags a
  maintenance debt at or over the repair threshold whose work tile has no
  standing tile (interior debts need a walkable neighbour, exterior debts need
  Space/Truss adjacency for EVA), and a Fuel Coupler whose service tile has no
  pipe or whose network has no tank. `hardwareTiles`/`hardwareModuleIds` scope it
  to the selected interface, so a debt on an unrelated corridor is never blamed
  on this dock. Absent underlay on hardware that never asked for it is
  deliberately not reported — that would be a preference, not a fact.
  `relevantChangeSignature` now includes the underlay version and the keys of
  debts over threshold, so the branch invalidates on repaint rather than waiting
  for the next traffic bucket.
- Judgment worth recording: `getPodDockFuelSupplyView` was deliberately *not*
  used, because it calls `ensureDockEntitiesUpToDate` and would rebuild
  `state.docks` from a now render-reachable path.
- **The implicated tile is finally drawn.** Every diagnosis has carried an
  `implicatedTile` for a long time and both consumers wrote prose into a DOM
  panel and ignored it. Selecting a dock or berth now registers the selection,
  and the world draws the interface footprint as a dashed outline, route/queue
  tiles as pips, a pulsing double frame with corner ticks on the implicated tile,
  and one severity-coloured caption capped to the same width budget as the
  approach labels. Render stays read-only: the register and the diagnosis both
  live in the sim module.
- Live-browser evidence, mine: on `?scenario=mixed-berth-visit` I clicked the
  Berth, which opened the Room Inspector reading `Berth: active | 0/2 assigned
  crew`, closed it, hid the HUD panels, and the berth still carries its dashed
  amber focus outline in the open world at gameplay zoom. The implementer
  separately captured the amber `Service access cut` caption and framed tile
  after injecting a maintenance debt at berth tile 3672.
- Gotcha recorded for whoever drives this next: Vite serves modules with a
  `?t=<hash>` suffix, so `import('/src/sim/interface-diagnosis.ts')` from the
  console yields a *second* module instance and the selection never reaches the
  renderer. Import the exact URL from `performance.getEntriesByType('resource')`.
- **Boarding distance and duration stays open.** The per-interface measurement
  exists and is tested — longest route tiles, longest and total wait, farthest
  boarder, all keyed by `identityKey`, plus a `boarding-distance` notice that
  only fires when nothing is actually blocking so a long walk is distinguishable
  from a jammed throat. What is missing is one call from the passenger transfer
  path in `src/sim/sim.ts` to record completions, and durability: the tally lives
  in a `WeakMap` keyed by StationState, so completed totals do not survive
  save/load. Requested from the agent holding that file.

2026-07-28 · The four missing Phase 0 metrics, and rating that reconciles

- Commit or files: counters in `src/sim/sim.ts` and `src/sim/types.ts`, rating
  bucket persistence in `src/sim/save.ts`, five new cases in
  `tools/gate-g-metrics-admission-tests.ts`, and the surfaced metrics in
  `tools/frontage-baseline.ts`.
- **Spill and balks** are now counted, not inferred. Spill is a census of queue
  members whose claimed slot tile is in a different room than their provider
  anchor, so a long line entirely inside a large room correctly reports `0`. A
  6-deep line reports 0 spill and a 24-deep line reports 6, cross-checked against
  the same census recomputed by hand from live reservations. The balk counter
  sits at the single give-up site and fires `0` at 15.999s and exactly `1` at
  16s. The cantina repeat-drink skip is deliberately excluded and commented:
  declining an optional second drink is not unserved demand.
- **Door wait** accrues at the move site rather than at the arbiter, which is
  what makes it exactly once per actor per tick — only an actor close enough to
  take the step pays. Proven both ways: the loser of a contested door accrues
  0.2s then 0.4s with the two distinct narrow-crossing reasons, and a
  single-user door costs `0`, so it is not merely tracking every blocked step.
- **Reception timing** is settled only on an on-plan completion, with new durable
  settle stamps as the exactly-once guard rather than the cause fields, which the
  UI keeps forever. `reception-staffed` yields 3/3 reveals in 34-39s;
  `reception-absent` yields 4/4 corrections in about 45s; running 90s further
  leaves existing stamps byte-identical.
- **EVA time** accrues only for crew both suited and standing on unpressurized
  tile, driven through a real Airlock into a genuinely sealed cell with the
  pressure left to the production flood fill. Exactly 1.0 crew-second over five
  0.2s ticks, and accrual stops when the airlock removes the suit.
- **Rating now reconciles.** Two writers added straight to `ratingDelta` without
  attribution; both route through named buckets, and `getRatingAttribution`
  returns a residual that is asserted `0` after a live run, after a capital
  project completes through the ordinary tick, and across save and resume.
- **A real save bug fell out of exactly that round-trip assertion.**
  `rating.penalties.residentDeparture` is accumulated as a *signed* movement but
  was parsed through `nonNegative`, so every departure penalty was silently
  clamped to `0` on load while `ratingDelta` survived — a resumed station could
  not explain part of its own rating. Fixed, and asserted twice: through a real
  production departure, and at the wire level.
- Baseline surface: door wait, corridor contention, queue spill, counted balks
  and EVA seconds are out of `UNAVAILABLE` and reported per scenario from the
  tick window each already ran. The starter genuinely produces `9.75` door-wait
  actor-seconds over `39` deferrals, so these are measurements rather than
  zero-filled columns. Only render frame time remains unavailable.

2026-07-28 · Two findings that outlive this checklist

**Progression runs on wall clock, and it is observable.** Confirmed with hard
evidence, not inference. `shouldRefreshDerivedMetrics` uses `perfNowMs()` and
gates `computeMetrics`, `updateUnlockProgress` *and* `updateOpeningCapitalProjects`.
Three functions below it, `roomOpsRefreshDt` carries the comment "must be a
function of simulation time, never renderer or machine throughput" — the
contradiction is literal and adjacent. Observably: 50 ticks, 10 simulated
seconds, executing in under 250ms of wall clock produced **zero** derived
refreshes, so an accepted capital project whose world conditions were fully met
was never awarded. An assertion written against it passed, then began failing
purely because an unrelated change altered tick cost — same simulation, different
machine throughput, different progression. **This also explains the
`test:normal-scale-operation` flakiness**: measured 3 runs at exit 0/1/0 with the
maintenance change and 0/1/1 without it, same "cafeteria queue did not drain"
message, so the non-determinism is not caused by any recent edit. Left unchanged
deliberately — it is a behavior risk and a design decision, not a checklist item.

**A reachable stack overflow in dock hydration.** `ensureDockEntitiesUpToDate`
claims its cache version *after* `rebuildDockEntities` returns, but
`rebuildDockEntities` re-enters it through `chooseDockFacingForPlacement` ->
`getDockByTile` -> `ensureDockByTileCache`. With two **adjacent** Dock tiles
belonging to different docks, hydration recurses until the stack overflows.
Reproduced in a fixture. Not fixed — restructuring the dock cache mid-session was
the wrong risk — but it is a crash, and it should be near the top of the
bugfixing phase.

2026-07-28 · Render is measured, separation is proven, and visual claims have artifacts

- Commit or files: `tools/harness/scenarios/render-perf.spec.ts`,
  `render-sim-separation.spec.ts`, `visual-baselines.spec.ts`;
  `snapshotDir`/`snapshotPathTemplate` in `playwright.config.ts`; the module-dirt
  round trip in `tools/sanitation-tests.ts`; three committed PNGs under
  `tools/harness/baselines/`.
- **Render frame time is now read for the first time anywhere in the repo.**
  rAF was measured to actually run in headless Playwright rather than assumed, so
  the numbers are real: the light `starter` fixture holds 22.7fps with a 41.7ms
  median frame, the heavy `facility-scale` fixture 9.7fps at 100.0ms. The
  headline is not the fps — it is that **render is about 97% of the frame budget
  in both, against a median `tickMs` of 0.1ms**. Jitter p95/median is 1.20 and
  1.08, so it is slow but smooth rather than spiky. These are software-rasteriser
  numbers, valid as a regression signal and not as a GPU frame-time claim, and
  the spec says so.
- Honesty guards, which is what makes the number trustworthy: an rAF-liveness
  probe gates every read and writes `UNMEASURABLE` with a reason rather than a
  zero; a dedicated test stubs `requestAnimationFrame` and proves the sampler
  returns no samples while `state.metrics.frameMs` still reads a stale but
  plausible value — which is exactly the trap this row could have fallen into.
- **Render/simulation separation** is proven by hashing the full durable snapshot
  and `state.metrics` before and after six real render passes, all inside one
  synchronous evaluate so no frame or tick can interleave. Byte-identical on five
  fixtures including one with three overlays toggled and a live canvas selection.
  A sensitivity test proves the comparison is not vacuous. Deep-freeze was
  rejected for a stated reason: the hot grids are typed arrays, `Object.freeze`
  throws on those, so a freeze would not have covered the fields a renderer is
  most likely to scribble on.
- **Visual baselines are retained and genuinely deterministic.** The churn source
  was found and fixed rather than hidden behind tolerance: `reducedMotion` zeroes
  `renderTimeSeconds()`, but `renderClockSeconds()` and `nowSec()` read
  `performance.now()` directly and are not reduced-motion gated. Pinning
  `performance.now()` before page load makes every easing step dt=0, after which
  captures are byte-identical across reloads. Two anti-fraud guards both caught
  real problems while being written: an ink check (a corner-anchored capture
  turned out to be mostly HUD panels, so a stable screenshot of nothing now
  fails) and a caption check (a truss baseline captioned "exterior truss under
  construction" rendered indistinguishably from the starter, so it was dropped
  rather than kept as decoration).
- Module dirt now survives a save round trip to within the format's own 0.1
  quantization, with `dirtSourceByTile` exact, and the reloaded station is still
  a *live* sanitation problem — a cleaner hired after load works the lane back
  under threshold. `npm run test:sanitation` is 8/8.
- Recorded, not fixed: `npm run test:harness` is 17 passed / 18 failed, and all
  18 failures pre-date this work and sit outside these rows — `ui-smoke` clicks
  `#toggle-zones` and friends directly, but those controls now live behind the
  Overlays palette tab, and `port-ops-v1`'s six stale specs are described in an
  earlier entry. Selector drift, not behavior.

2026-07-28 · Two viable geometries, two valid remedies, and a station that vents

- Commit or files: `normal-scale-50-spine` and the three `mess-line-*` fixtures in
  `src/sim/cold-start-scenarios.ts`; `runGeometry` in
  `tools/normal-scale-operation-tests.ts`; `collectOperationalRun` in
  `tools/target-scale-perf.ts`.
- **Multiple geometries.** A 74-tile circulation spine with ten vacuum-separated
  room pods is now measured against the compact block through one shared
  11-item operational floor, so neither gets a bespoke standard. Both clear it:
  50/50 population, 8 accessible docks plus 2 derived Berths, mixed call through
  inspection to inbound haul, Pod/Berth overlap, meals with zero required staff,
  queue drains, p95 under budget. They are genuinely different topologies —
  every inter-room trip crosses the spine, against a block where every room
  shares a wall — and they perform differently: 29 meals against 13, peak queue
  8 against 26, p95 16.3ms against 7.8ms.
- **A design rule fell out of building it**, worth more than the row: a counter
  only serves if its pickup tile stands over its own doorway. Counters buried
  mid-room gave 5 meals per 240s; moving the same counters onto the door row gave
  29. Same fixtures, same stock, same crowd.
- **Two valid remedies.** One bad fixture, `mess-line-choked`, feeds 0 of 24
  guests in 180s. Adding two counters feeds 12; cutting a doorway under each
  existing counter — no new fixture at all — feeds 16. One buys throughput, the
  other buys circulation. Crew count and required staff are asserted identical
  across all three and seating is held constant, so the staff-stepper failure
  mode this checklist forbids is structurally excluded rather than merely
  avoided.
- **The `test:normal-scale-operation` flake is diagnosed and fixed, and my
  earlier attribution of it to the wall-clock cadence was wrong.** The real cause
  was the queue check comparing the mean of the last 30 samples against the 30
  before, which failed whenever a shipload landed in the final seconds — that is,
  on a working station. Confirmed at pristine HEAD. Replaced with a direct drain
  test: the line must fall, must fully drain after its peak, and no half of the
  run may have people waiting with zero service. Four consecutive green runs.
- **Two serious findings, measured and deliberately not asserted away:**
  - **Both authored 50-crew stations vent most of their interior at t≈156s and
    lose 33-37 crew to vacuum.** Reproduced against pristine HEAD, so it is
    pre-existing and geometry-independent: exterior wear crosses its breach
    threshold faster than the repair loop closes it. The 240s runner never
    noticed because it asserted nothing about air.
  - **`metrics.leakingTiles` reads 0 for the compact block while 733 of its
    interior tiles are in vacuum**, because pressurization exempts anything
    reachable from an Airlock and that station owns exactly one. The spine owns
    none and reports 753 for the same event. The runner now counts vented
    interior directly rather than trusting that metric.
- Row 864 stays **open**: 2.1x footprint sustains a visitor population and 28
  ships reach an interface, but **meals served is 0** — 17 visitors carried a meal
  plan and all 17 left unfed while the apron was a fully qualifying public cluster
  with free queue chains. They route to the dock about 20s after arrival instead
  of joining an available line. Reported as an unmet claim rather than asserted
  away; the fix is in the serving-line join path.
- Row 867 stays **open with a determination rather than a test**: both caps the
  audit named are structurally unreachable. The environment cap is `min(0.24, d *
  0.018)` where `d` clamps to 8, so the real ceiling is `0.144`; the sanitation
  cap is `min(0.18, (dirt - 32) * 0.0014)` and would need dirt at 160.6 while
  every production write clamps dirt to 100, so the real ceiling is `0.0952`. No
  buildable scenario reaches either. They are dead ceilings, not test gaps — set
  the literals to the true values and the existing runner can demonstrate them.

2026-07-28 · Caps demonstrated, and the reopen rule exercised for real

- Commit or files: `docs/40-structural-frontage-cap-audit.md`.
- `npm run test:saturation-caps` drives eight caps through below / at / above
  saturation, and the cap audit now says so instead of still claiming the
  requirement is open. The two it prints a GAP for are closed by a
  **determination rather than a scenario**, which is the honest outcome: both are
  dead ceilings no buildable state can reach, because a tighter clamp upstream
  always binds first. Environment is `min(0.24, d * 0.018)` with `d` clamped to
  8, so the true maximum is `0.144`. Sanitation is `min(0.18, (dirt - 32) *
  0.0014)` and would need dirt at 160.6 while every production write clamps dirt
  to 100, so the true maximum is `0.0952`. Writing a scenario for either would
  mean writing a scenario that cannot exist. The fix is to replace the literals
  with their real ceilings, after which the existing runner covers them like the
  other eight — recorded in the cap audit.
- The reopen row is checked because it was **actually exercised**, not because a
  process was written down. The Charter-and-world visibility row was ticked
  during this session on DOM evidence, then reverted when `elementFromPoint`
  showed the Site Brief was being painted underneath the bottom dock — present in
  the DOM and unreadable on screen. It stayed open until the layout was fixed and
  the text was confirmed to be the topmost element at that point. That is the rule
  working: a checked row failed its own standard on live inspection and went back
  to open before anything else was built on it.

2026-07-28 · The stranding contract, proven through production paths

- Commit or files: resident work withdrawal in `src/sim/sim.ts`; new cases in
  `tools/failed-stay-tests.ts` and `tools/commitment-recovery-tests.ts` (now
  11/11).
- **Shore leave** was never tested for recall — every failed-stay fixture was
  `contract`. The new case uses `opening-food-cycle`, a station with a working
  galley and deliberately no Lounge, Rec Hall, Cantina, Observatory or Market, so
  `assignPathToPreferredLeisure` genuinely fails rather than being stubbed. The
  passenger falls back to the cafeteria with a real path and a real provider-slot
  claim, then recall flips it to the dock with **zero** unreleased reservations.
- **Contract crews remaining** now inspects `state.visitors`, which the old
  ship-level assertion never did. The fixture choice matters and was deliberate:
  on the bare starter, crew legitimately walk to the dock for lack of anything to
  do, so "did not head for the berth" would have been a true statement about a
  meaningless station. Running it on a station with somewhere to be makes the
  assertion mean what it says.
- **Resident work withdrawal** was the one genuinely missing mechanism: stress
  and leaving were real, but the work leg was clock-driven and gated only on a
  critical need, so a resident could be at breaking point and still clock in. It
  now withdraws at the stress band the penalty curve already treats as severe, or
  on leave intent. No new durable field — `stress` and `leaveIntent` already
  round-trip. The consequence is physical rather than a modifier: a withdrawn
  resident is simply not in the work room, so the role count and its bonus are
  lost until pressure drops. The test isolates it properly — two residents, same
  tile, same needs, differing only in stress — advances the routine clock by
  asking the production phase clock rather than copying the constant, and proves
  it is reversible. **Negative control: with the gate removed the test fails with
  "went to kitchen."**
- **Extended occupation blocking traffic** previously rested on a hand-fabricated
  approach commitment. It now runs the real extension path and asserts *past the
  original departure time* that a provably compatible second offer reports
  `canAccept === false` with `compatibleCount > 0 && freeCount === 0`, is refused
  by `admitTrafficOffer`, and stays uncleared. The closing control is what makes
  it worth having: once the ship finally leaves, the same offer becomes
  acceptable again, so the block was interface ownership rather than a rule.
- **The faction half of the milestone row is struck rather than checked.**
  `Faction` is `{ id, templateId, displayName, color, shipBias }` — system-map
  flavour plus a ship-type weight. The only reputation channel in the sim is
  zone-scoped prestige/notoriety/control, not faction-scoped. There is nothing to
  move, and inventing a standing system to satisfy a checklist row would be
  exactly backwards. The rating half is proven exactly-once by the episode
  ledger. Faction standing is a separate unbuilt feature, not a gap in this one.
- Optional follow-up, not done because the file was owned elsewhere:
  `src/sim/actor-inspectors.ts` could word the withdrawal as an `actionReason`
  ("off shift — stress"). Today the skip is visible in world because the resident
  is not in the work room, and the inspector exposes stress and routine phase,
  but there is no worded cause.

2026-07-28 · The structural planning overlay

- Commit or files: `'structural'` member in `src/sim/types.ts`; the overlay model,
  severity map and tile detail in `src/render/render.ts`; the overloaded piece
  assertion in `tools/structural-piece-tests.ts`; label, list, legend case and
  palette button in `src/main.ts`.
- `validateStructuralSupportPlan` and `buildStructuralSupportGraph` had computed
  exactly this data for a long time and the renderer never read either. The
  overlay lives inside the existing `drawDiagnosticOverlayLayer` pipeline with
  the same cached-layer, cache-key and legend structure as `maintenance` and
  `route-pressure` — not a parallel system.
- **Planned support is a real distinction, not a colour.** The same BFS runs
  twice over `buildStructuralSupportGraph(state, proposals)`: once refusing to
  traverse nodes with `existing === false`, once allowing them. The difference is
  what gets hatched, so a tile is "planned" precisely when it reaches a root
  *only* through something not yet built. Holding the Junction or Bulkhead tool
  feeds the hovered footprint in as a proposal, so the preview shows the support
  the piece *would* provide before it is paid for.
- `STRUCTURAL_PROBLEM_SEVERITY` is an exhaustive `Record<StructuralSupportReason,
  ...>`, so a new reason forces a decision at compile time instead of silently
  vanishing from the overlay.
- Live evidence, all four states in one frame at gameplay zoom with panels
  hidden: a 2x2 red cross block for `disconnected-support`, two red tiles at the
  end of an 8-tile run for `span-exceeded`, six green truss tiles with the
  station and Berth wing washed as supported, one cyan hatched tile for the
  pending Junction, and a gold tile at the Berth wing edge for the overloaded
  heavy transfer. **The overloaded tile was verified by geometry rather than by
  eye**: map (68,40) is exactly the `heavy-load-requires-reinforced-transfer`
  tile index 4068 that `validation.problems` reports.
- Cost, measured rather than asserted: the model is memoized on topology, room,
  module and proposal signature, so a steady frame costs a template-string build
  and one comparison. A full rebuild is 0.53ms mean over a 357-node graph, and
  the upstream topology cache reports 2 builds against 403 hits. It only rebuilds
  on a topology change or per mouse-move while a structural tool is held, and
  `drawStructuralPieces` already called the same validation every frame, so this
  adds no new category of work.
- Render/simulation separation re-checked by hand with the overlay active:
  snapshot and metrics hashes byte-identical across six render passes.
- Honest limit: `load-has-no-supported-path` shares the unsupported bucket and
  colour with the two reasons shown, but no fixture was found that triggers it,
  so that one reason is code-path-only.
- Noted for a separate decision: `drawDiagnosticOverlayLegend` in `render.ts` has
  no callers — pre-existing dead code, since the player-facing legend is the
  `#diagnostic-key` panel in `main.ts`.

2026-07-28 · Fixtures cost what they are, and operations moved to the thing they operate

- Commit or files: `FACILITY_OPERATING_LOAD`, `MAINTENANCE_PRICING` and
  `repairServiceCost` in `src/sim/balance.ts`; public-face geometry and the load
  derivations in `src/sim/facility-descriptors.ts` and
  `src/sim/facility-machines.ts`; the four wiring points in `src/sim/sim.ts`;
  anchored panels in `src/main.ts`, `src/styles.css` and
  `src/ui/opening-economy-panels.ts`; cases 15-17 in
  `tools/gate-f-facility-scale-tests.ts` and a new case in
  `tools/facility-slots-tests.ts`.
- **`publicUseFace` was declared on all 14 descriptors and read nowhere**, and
  `'public-route-blocked'` was a declared reason no observer produced. The face
  now rotates with the placed module and resolves to the floor squares outside
  it, and a fixture whose approach has no walkable square feeds that reason
  through the three machine statuses the renderer already reads — so it reaches
  the player with no render change. Asserted by sealing 10 frontage squares and
  watching a **still-stocked, still-staffed** market flip to blocked. Two helper
  exports written during the work were deleted once nothing consumed them, since
  shipping exported dead code is the exact defect this row is about.
- **Large fixtures now cost what they are.** Power is footprint tiles times one
  of three class rates, so a 2x5 Checkout Bank draws `0.30` against a 2x1 Market
  Stall's `0.06` — five times the floor, five times the bill. Cleaning is per
  depicted position per minute whether or not anyone is standing there, which is
  the shape the row asks for: eight diners at one Community Table soil `22.0`
  per minute against `15.6` for the same eight at two compact Tables, finally
  charging what that fixture's own comment always claimed. Maintenance now costs
  credits at `4c + 0.18c` per wear point, bracketed so repair always beats
  replacement — worst case `20.6c` against the cheapest wearing fixture at `45c`.
- The **price ladder** is measured through the production pricing API rather than
  restated, so a catalog change fails the test instead of going stale: truss tile
  `0.68c` → hull `2.04c` → junction `14.04c` → cheapest facility module `50c` →
  a crew member's first hour `160c` → medium berth `600c`, with a stated rule
  that each rung is 2.5x-8x the one below. Below that band a step is a rounding
  error; above it, the cheaper option is strictly correct.
- **Operations moved to the thing they operate.** The Travel Supplies shop opens
  by clicking a market fixture and is anchored beside it with no scrim, so the
  station stays operable behind it and the panel tracks the camera. The floating
  `#berth-ops-widget` is deleted outright and replaced by one card per live
  turnaround anchored to its own interface, which hides rather than clamping when
  its interface scrolls off screen. Admission now carries a projected-load line
  *inside* the decision card, read from the same commitment totals the admission
  policy itself judges against, so the forecast cannot disagree with the gate.
- **Only two prose readouts were removed**, and both had a strictly better world
  equivalent: the Fuel row (tanks carry graduated fill gauges and couplers print
  their own connection state) and `Docked n` (each docked ship already draws a
  chip at its own interface with callsign, phase, passengers and countdown).
  Everything else was kept with a stated reason — role coverage, cargo-arm
  strain, the work-state census, queue backlog and crew needs have no world
  equivalent, and deleting them would have been loss dressed as progress.
- **The rating breakdown now explains the number on screen.** The cumulative
  totals existed, persisted, and were rendered nowhere; the modal showed only
  per-minute rates. Total is now the primary value with the rate as a quiet
  second line, so the row count did not grow. The filter also changed: a cause
  shows when it has *ever* contributed rather than only while still firing —
  a penalty that stopped a minute ago is still part of the score, and hiding it
  is what made the score unexplainable.
- Balance calls made here that deserve a playtest opinion: the three per-tile
  power class rates, the per-position soil rates and the 41% Community Table
  premium, the `4c + 0.18c` maintenance price, and the 2.5x-8x ladder band. All
  four are documented in place with their derivation.

2026-07-28 · Interface disclosure, editable plans, fleet rotation, and construction states

- Live browser play in `market-compact-conflict` showed each active call beside
  its assigned Pod Dock with a coarse purpose, current phase, cohort range and
  stay range. The persistent Show/Hide control collapses the operational detail,
  and the cards default collapsed below 760px. Commit `37a28ca` implements the
  disclosure; `9654d7b` prevents nearby live cards from painting over one another.
- `npm run test:editable-construction-plans` passes four production-path cases:
  ordinary floor, a 2x2 module cancelled from a covered tile, a multi-tile
  structural piece, and a staged expansion both before delivery and during its
  second stage. It proves exact once-only recovery, immediate cancel-to-replan,
  synchronous reservation cleanup, and completed-work immutability (`a26215e`).
- `npm run test:ship-fleet-visual` renders and verifies all eight hull variants
  in all four lane rotations at the production 32px-per-tile zoom. The 32-frame
  contact sheet was inspected for facing, clipping and silhouette distinction;
  `npm run test:ship-fleet` separately preserves deterministic identity through
  save/load (`d743675`).
- `npm run test:construction-phase-art` and `npm run sprites:validate:v1` pass
  for the five native-scale scaffold, floor, wall, seal and pressurizing frames.
  The live `structural-expansion-active` browser scenario showed the scaffold
  state on the actual exterior footprint while work advanced (`ee0cee0`).
