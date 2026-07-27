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

## Program Setup

- [x] Consolidate the structural frontage, approach, visit, crowd, exposure, and
  occupant-loop design into one implementation contract.
  Evidence: `docs/38-structural-frontage-visit-flow-implementation-plan.md`.
- [x] Incorporate Claude's occupant-loop spec from `origin/main`.
  Evidence: `docs/SPEC-OCCUPANT-LOOP.md`, commit `eed5c36`.
- [x] Establish a dedicated implementation branch.
  Evidence: `codex/structural-frontage-occupant-loop`.
- [ ] Add this execution checklist to `docs/README.md`.
- [ ] Record the focused commands and artifacts used for every phase gate.
- [ ] Keep a running playtest findings section at the bottom of this file.

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

- [ ] Add a compact starter with two Pod Docks.
- [ ] Add a four-Pod-Dock docking finger.
- [ ] Add a medium Berth with two Gangways.
- [ ] Add a bad single-door passenger terminal.
- [ ] Add the same terminal with a second entrance or wider concourse.
- [ ] Add a public/cargo crossing scenario.
- [ ] Add a separated service-corridor comparison.
- [ ] Add an overwhelmed one-checkout market.
- [ ] Add a redesigned two-checkout market.
- [ ] Add short errands, shore leave, and a long repair crew in one scenario.
- [ ] Add reception-bypass and reception-assisted variants.
- [ ] Add a debris-facing exterior wing.
- [ ] Add a scale baseline with at least 50 crew, 50 simultaneous visitors, and
  5-10 active interfaces.

### Metrics

- [ ] Record real-time ship visit duration by class.
- [ ] Record concurrent ships and occupants.
- [ ] Record holding-orbit and approach-group wait.
- [ ] Record disembark and boarding duration.
- [ ] Record queue length, spill length, balks, and provider utilization.
- [ ] Record door wait and corridor congestion.
- [ ] Record public/cargo conflicts.
- [ ] Record recurring need demand and fixture utilization.
- [ ] Record reception reveal and redirection time.
- [ ] Record committed future Berth, bed, service, and staff load.
- [ ] Record missed departures and stranded occupants.
- [ ] Record maintenance work, damage, and EVA time.
- [ ] Record average and p95 simulation-step cost.
- [ ] Record render frame time and visible animation smoothness.

### Existing Caps Audit

- [ ] Document current queue-spill and balk limits.
- [ ] Document current occupancy/congestion cost caps.
- [ ] Document route-discomfort and walk-penalty saturation.
- [ ] Document rating-penalty caps that hide severe failure.
- [ ] Demonstrate each cap in a controlled scenario before changing it.
- [ ] Do not remove deadlock safety before movement coordination exists.

### Phase 0 Gate

- [ ] One command produces the deterministic baseline report.
- [ ] Bad and improved layouts show measurable differences.
- [ ] Baseline artifacts are saved for later comparison.
- [ ] No full test suite is required for ordinary Phase 0 iteration.

## Phase 1A: Longer Visits And Shared Occupant Demand

### Shared Occupant Demand

- [ ] Extract or reuse the resident need lifecycle as a shared occupant-demand
  engine rather than writing a second long-visitor engine.
- [ ] Preserve distinct actor identity and tenure contracts.
- [ ] Add `errand` tenure.
- [ ] Add `shore_leave` tenure.
- [ ] Add `contract_crew` tenure.
- [ ] Add `extended_guest` tenure.
- [ ] Preserve `resident` as permanent tenure.
- [ ] Give long-stay occupants regenerating hunger.
- [ ] Give long-stay occupants regenerating energy/sleep demand.
- [ ] Give long-stay occupants regenerating hygiene demand.
- [ ] Give appropriate occupants recurring leisure/social demand.
- [ ] Keep one-shot wants distinct from recurring needs.
- [ ] Derive broad tenure and demand from ship purpose.
- [ ] Add bounded seeded individual variation inside readable ship archetypes.
- [ ] Ensure critical needs override optional wants without target oscillation.

### Visit Lifecycle

- [ ] Add `announced` phase.
- [ ] Add `holding` phase.
- [ ] Add `approach` phase.
- [ ] Add `secure` phase.
- [ ] Add `disembark` phase.
- [ ] Add `visit_service` phase.
- [ ] Add `recall` phase.
- [ ] Add `boarding` phase.
- [ ] Add `depart` phase.
- [ ] Preserve exactly-once `settled` behavior.
- [ ] Store earliest departure, planned departure, boarding start, hard departure,
  and extension window.
- [ ] Support early departure after sustained service failure.
- [ ] Support bounded extension while useful spend or work continues.
- [ ] Give scheduled traffic firm windows.
- [ ] Let freight wait for promised work until its explicit deadline.
- [ ] Let repair traffic remain until work completes, aborts, or is cancelled.
- [ ] Tune Pod visits toward observable minutes rather than 10-30-second churn.
- [ ] Tune traffic generation for useful concurrent occupancy.
- [ ] Prevent any ship or Berth from remaining pinned after terminal resolution.

### World Feedback

- [ ] Show ship purpose and visit phase beside the physical interface.
- [ ] Show likely cohort-size and stay ranges without full itinerary disclosure.
- [ ] Show recall and boarding physically.
- [ ] Show early departure and extension reasons.
- [ ] Keep ship details hideable on small screens.

### Phase 1A Save And Checks

- [ ] Persist tenure, recurring needs, wants, origin ship, and departure contract.
- [ ] Persist durable visit phase and timing.
- [ ] Hydrate legacy visitors and residents with safe defaults.
- [ ] Save/load a repair crew mid-stay.
- [ ] Save/load during recall and boarding.
- [ ] Verify settlement remains exactly once.
- [ ] Focused check: repair crew repeatedly eats, sleeps, washes, and recreates.
- [ ] Focused check: fixed and flexible schedules behave differently.
- [ ] Focused check: concurrent visits overlap without rapid replacement.

## Phase 1B: Physical Slots, Demand Discovery, And Facility Scale

### Universal Slot Contract

- [ ] Generalize provider, fixture, seat, and queue reservations without breaking
  cafeteria behavior.
- [ ] Give every active need/want a physical slot and duration.
- [ ] Prevent two actors from owning one exclusive use slot.
- [ ] Make depicted table seats individually reservable.
- [ ] Make bed positions individually claimable for a sleep session.
- [ ] Support temporary bed claims separately from permanent home assignment.
- [ ] Make hygiene fixtures hold exclusive sessions for visible durations.
- [ ] Make lounge and cantina positions hold meaningful leisure sessions.
- [ ] Release stale slots after cancellation, departure, death, save hydration, or
  provider removal.

### Market Depth

- [ ] Replace unlimited one-tile Market Stall behavior with limited checkout
  throughput.
- [ ] Add stocked shelf or aisle browsing positions.
- [ ] Require physical inventory for positive market feedback and sales.
- [ ] Add stock collection from visible shelf/display inventory.
- [ ] Add a staff-side restock route.
- [ ] Add a real customer queue at checkout.
- [ ] Make a second checkout produce a visible throughput improvement.
- [ ] Make shelf mix or goods category affect demand without creating a checklist.
- [ ] Prevent `Great selection` feedback when no stock exists.

### Demand Discovery And Reception

- [ ] Stop exposing a complete pre-rolled itinerary at spawn.
- [ ] Keep ship-level demand cues strong and learnable.
- [ ] Reveal individual wants progressively through behavior.
- [ ] Add optional Reception/Customs processing slots.
- [ ] Make Reception reveal some demand earlier, never all of it.
- [ ] Allow unprocessed occupants to enter and make a plausible choice.
- [ ] Bound wrong-choice behavior to a readable redirect rather than random
  wandering.
- [ ] Show the need or realization that caused redirection.
- [ ] Make saturated Reception bypassable rather than a hard arrival gate.
- [ ] Demonstrate that Reception improves routing in a mixed-demand crowd.

### Large Functional Modules

- [ ] Implement Checkout Bank, initial target 2x5.
- [ ] Give Checkout Bank two staffed registers and two customer service slots.
- [ ] Implement tileable Shelf Aisle, initial target 1x4.
- [ ] Give Shelf Aisle three visible browsing positions.
- [ ] Implement Display or Cold Case, initial target 1x3.
- [ ] Implement Backroom Stock Bank, initial target 2x3.
- [ ] Implement Service Bar, initial target 2x5.
- [ ] Give Service Bar a staff lane and four guest service positions.
- [ ] Implement Bar Corner and End pieces, initial target 2x2.
- [ ] Group connected bar runs into one provider system.
- [ ] Implement Booth Bank, initial target 2x4.
- [ ] Implement Standing Rail, initial target 1x4.
- [ ] Implement Serving Line, initial target 2x5.
- [ ] Implement Community Table, initial target 3x4 with eight depicted seats.
- [ ] Implement Bunk Bank, initial target 2x4 with four temporary beds.
- [ ] Implement Guest Cabin, initial target 3x4 with two quality beds.
- [ ] Implement Arrival Desk, initial target 2x4 with two processors.
- [ ] Implement Wash Bank, initial target 2x5.
- [ ] Validate every footprint at actual play zoom before locking dimensions.
- [ ] Ensure each fixture has a public use face.
- [ ] Ensure staffed fixtures have a staff work face.
- [ ] Ensure stocked fixtures have a delivery/service route.
- [ ] Give larger fixtures greater absolute capacity and useful staffing
  efficiency.
- [ ] Charge larger fixtures through footprint, staffing, stock, utilities,
  cleaning, maintenance, and queue frontage.
- [ ] Preserve compact alternatives where irregular layouts make them useful.

### Large Fixture Artwork

- [ ] Generate native-footprint low-resolution artwork after footprints stabilize.
- [ ] Use transparent backgrounds and silhouettes readable at gameplay zoom.
- [ ] Match sprite dimensions to simulation footprint exactly.
- [ ] Add idle state.
- [ ] Add occupied/in-service state.
- [ ] Add unstaffed state where applicable.
- [ ] Add low-stock/empty state where applicable.
- [ ] Add dirty state.
- [ ] Add damaged state.
- [ ] Add connected straight/corner/end bar rendering.
- [ ] Verify sprites in the live game rather than only as source images.

### Phase 1B Gate

- [ ] One checkout visibly becomes overwhelmed.
- [ ] A second checkout or redesigned queue improves measured throughput.
- [ ] A larger cantina visibly supports more simultaneous occupants.
- [ ] Large fixtures create meaningful queue, route, stock, staffing, and floor
  tradeoffs.
- [ ] Beds cannot be double-claimed.
- [ ] Reception helps without becoming mandatory.
- [ ] Two seeded runs differ while remaining inferable.
- [ ] Playtest decides whether to proceed with deeper hidden demand.

## Failed Stay And Stranding Contract

- [ ] Errand visitors can balk, abandon a purchase, and leave early.
- [ ] Shore-leave passengers seek an alternative and obey recall.
- [ ] A passenger who physically misses boarding becomes stranded.
- [ ] Contract crews remain while their ship work is incomplete.
- [ ] Poor contract-crew needs reduce cooperation or work productivity.
- [ ] Extended/stranded guests consume temporary food, hygiene, and lodging.
- [ ] Residents accumulate persistent stress and can withdraw from work or leave.
- [ ] Implement visible `unmet` escalation.
- [ ] Implement visible `balking` escalation.
- [ ] Implement visible `distressed` escalation.
- [ ] Implement bounded `disruptive` escalation.
- [ ] Let prolonged failure cause mess, complaints, arguments, theft, vandalism,
  medical demand, or refusal to work as appropriate.
- [ ] Ensure one missed meal cannot immediately trigger a serious incident.
- [ ] Make distressed repair crews extend repair and Berth occupation.
- [ ] Make extended occupation block or delay subsequent accepted traffic.
- [ ] Allow emergency meal purchase.
- [ ] Allow emergency temporary bunk capacity.
- [ ] Allow repair prioritization or expediting.
- [ ] Allow cohort compensation.
- [ ] Allow evacuation or onward-transfer charter.
- [ ] Allow contract cancellation with an explicit penalty.
- [ ] Allow admission closure while recovering.
- [ ] Reserve security intervention for genuinely disruptive occupants.
- [ ] Give stranded occupants temporary accommodation and future departure.
- [ ] Add an expensive relief transfer after a generous maximum disruption window.
- [ ] Never silently convert a failed visitor into a resident.
- [ ] Require housing availability and explicit policy for resident acceptance.
- [ ] Let an accepted resident's origin ship depart normally.
- [ ] Apply rating/faction effects at meaningful milestones or resolution.
- [ ] Verify every rating change traces back to visible behavior.

## Approach Control And Admission Portfolio

### Small-Port Manual Control

- [ ] Present a short list of incoming ship silhouettes tied to physical lanes.
- [ ] Show ship/visit class at a glance.
- [ ] Show likely party-size range.
- [ ] Show likely stay range.
- [ ] Show broad service or demand cues.
- [ ] Show compatible interface and approach side.
- [ ] Show expected revenue range.
- [ ] Show committed capacity if accepted.
- [ ] Provide `Accept`, `Hold`, and `Pass` without opening a large manifest.
- [ ] Never pause automatically when an offer arrives.
- [ ] Bind acceptance to a compatible docking slot or Berth reservation.
- [ ] Project the candidate approach envelope into the world on hover/focus.
- [ ] Project expected Berth, bed, meal, hygiene, and staff load.
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

- [ ] Promote existing Truss as the exterior scaffold and utility support.
- [ ] Add Truss Junction with branch/span function.
- [ ] Add Reinforced Bulkhead with heavy-load transfer function.
- [ ] Keep Pod Dock as the small docking collar.
- [ ] Keep Gangway as the passenger connection and boarding provider.
- [ ] Keep Docking Clamp as vessel mass support.
- [ ] Add no decorative structural checklist pieces.

### Structural Graph

- [ ] Root support in the original station frame/core.
- [ ] Grandfather legacy hull as supported.
- [ ] Derive nodes and edges from Truss, Junctions, Bulkheads, and hull boundaries.
- [ ] Enforce a readable straight-span limit.
- [ ] Require Junctions for unsupported branches or long runs.
- [ ] Define small, medium, and heavy interface loads.
- [ ] Require reinforced load transfer for large Berths where appropriate.
- [ ] Validate support while planning.
- [ ] Validate support again before commissioning.
- [ ] Cache support by structure/topology version.
- [ ] Avoid per-tick structure scans.

### Planning Feedback

- [ ] Add supported overlay state.
- [ ] Add planned-support overlay state.
- [ ] Add overloaded overlay state.
- [ ] Add unsupported overlay state.
- [ ] Explain unsupported span in world.
- [ ] Explain missing Junction in world.
- [ ] Explain excessive interface load in world.

### Phase 2 Gate

- [ ] Unsupported hull planning is rejected.
- [ ] A Junction enables a branch.
- [ ] Reinforcement enables a heavy interface.
- [ ] Legacy saves load as structurally valid.
- [ ] Structural recomputation occurs only after relevant mutations.

## Phase 3: Physical Expansion And EVA Construction

### Planning And Delivery

- [ ] Promote construction blueprints into the normal expansion workflow.
- [ ] Plan Truss in space.
- [ ] Route construction kits to reachable staging.
- [ ] Route EVA workers through an Airlock.
- [ ] Build Truss through visible EVA welding.
- [ ] Plan Pressure Hull over completed or planned support.
- [ ] Derive floor-plate blueprints.
- [ ] Derive perimeter wall/bulkhead blueprints.
- [ ] Derive tie-in and doorway/airlock work.
- [ ] Preserve editable plans before work completes.
- [ ] Preserve cancellation and define material salvage/refund.
- [ ] Preserve module movement and resale.

### Commissioning

- [ ] Remove instant shell conversion from normal expansion.
- [ ] Require structural completion before hull completion.
- [ ] Require complete perimeter before seal check.
- [ ] Keep incomplete shell unpressurized.
- [ ] Perform visible seal check.
- [ ] Commission and pressurize only a supported sealed shell.
- [ ] Require EVA construction for exterior/unpressurized modules.
- [ ] Report missing material.
- [ ] Report missing staging route.
- [ ] Report missing Airlock/EVA route.
- [ ] Report low EVA oxygen.
- [ ] Report incomplete seal.
- [ ] Report obstructed work position.

### Phase 3 Gate

- [ ] Build a complete pressurized wing from a live starter.
- [ ] No Airlock visibly blocks exterior work.
- [ ] Missing material visibly blocks work.
- [ ] Exterior module installation uses EVA.
- [ ] Save/load preserves partially delivered and partially built sites.
- [ ] Topology mutations continue through authoritative invalidation paths.

## Phase 4: Docking Slots, Approach Envelopes, And Frontage

### Shared Docking Slot

- [ ] Define one descriptor for legacy Docks, Pod Docks, and Berths.
- [ ] Preserve stable physical interface identity.
- [ ] Store hull connection, accepted ship class, access tiles, and envelopes.
- [ ] Add binding slot reservations.
- [ ] Add authoritative slot occupancy.
- [ ] Make small-craft reservations bind to a specific dock.
- [ ] Prevent two ships from owning the same slot.
- [ ] Unify holding queues without merging distinct settlement models.

### World-Space Envelopes

- [ ] Derive ingress envelope.
- [ ] Derive mooring/parked-vessel envelope.
- [ ] Derive egress envelope.
- [ ] Size envelopes by interface and ship class.
- [ ] Represent envelope geometry beyond map boundaries.
- [ ] Reject mooring overlap with station structure.
- [ ] Reject incompatible mooring-envelope overlap.
- [ ] Reject impossible fixed approach obstruction.
- [ ] Preserve legal placement when only approach paths overlap.

### Approach Conflict Groups

- [ ] Derive conflict groups from overlapping ingress/egress geometry.
- [ ] Reserve a group during approach.
- [ ] Reserve a group during departure.
- [ ] Permit docked coexistence when mooring envelopes are clear.
- [ ] Serialize conflicting approach/departure operations.
- [ ] Permit independent approaches concurrently.
- [ ] Show `WAITING: APPROACH OCCUPIED` at the physical interface.
- [ ] Keep holding traffic structured and deterministic.

### Placement Preview

- [ ] Render approach direction arrows.
- [ ] Render vessel width and depth.
- [ ] Render hard obstruction in red.
- [ ] Render shared/serialized approach in amber.
- [ ] Show resulting conflict group.
- [ ] Show charter-facing lane traffic.
- [ ] Show obvious interior throat or boarding warning.

### Phase 4 Gate

- [ ] Map-edge placement cannot bypass clearance.
- [ ] Overlapping approaches serialize visibly.
- [ ] Independent sides operate concurrently.
- [ ] Parked ships never overlap hull or one another.
- [ ] Save/load resumes durable slot and approach ownership safely.

## Phase 5: Movement Intent, Doors, And Real Queues

### Movement Coordinator

- [ ] Collect next-tile intents in a batched simulation pass.
- [ ] Resolve by tile capacity and occupant departure intent.
- [ ] Include role/urgency without starving ordinary actors.
- [ ] Accumulate wait age for fairness.
- [ ] Use deterministic tie-breaking.
- [ ] Allow controlled safe head-on swaps.
- [ ] Make one actor yield when a swap is unsafe.
- [ ] Replan after bounded waiting using congestion.
- [ ] Add route hysteresis to prevent oscillation.
- [ ] Add bounded deadlock recovery.
- [ ] Release stale movement and service reservations.
- [ ] Keep interpolation independent from simulation speed.

### Spatial Capacity

- [ ] Give doors one crossing resource and crossing time.
- [ ] Give Airlocks explicit crossing capacity.
- [ ] Give narrow corridors low directional capacity.
- [ ] Give open concourses greater capacity.
- [ ] Make carts/bulky cargo consume more movement capacity.
- [ ] Preserve exclusive service/work/seat reservations.

### Real Queue Spill

- [ ] Back every queue position with a real floor reservation.
- [ ] Grow a queue backward from its provider.
- [ ] Route queue spill through reachable floor.
- [ ] Permit queue spill into circulation.
- [ ] Make a queue covering a door reduce door throughput.
- [ ] Let actors balk after appropriate wait and alternatives.
- [ ] Lift queue and congestion caps only after deadlock safety exists.
- [ ] Show why an actor is waiting.

### Phase 5 Gate

- [ ] A narrow terminal congests without permanently freezing.
- [ ] A queue visibly covers and slows a door.
- [ ] A second entrance measurably improves throughput.
- [ ] Head-on and cyclic traffic recovers.
- [ ] No actor remains indefinitely stuck in a stale reservation.
- [ ] Target-scale movement remains performant.

## Phase 6: Physical Cargo, Boarding, And Interior Support

### Physical Cargo

- [ ] Represent meals, stock, supplies, luggage, and freight as visible carried
  objects or carts backed by real jobs.
- [ ] Show pickup at source.
- [ ] Show carrying through the station.
- [ ] Show drop-off at staging or destination.
- [ ] Make cargo carriers consume route capacity.
- [ ] Make public/cargo conflict slow both flows.
- [ ] Show the conflict where it happens.
- [ ] Preserve resource accounting through interrupted jobs.

### Physical Boarding

- [ ] Give Gangways/collars disembark capacity.
- [ ] Give Gangways/collars boarding capacity.
- [ ] Make additional Gangways improve real throughput.
- [ ] Make recall route people physically back to origin ship.
- [ ] Make boarding contend with doors, queues, and cargo.
- [ ] Make late boarding extend occupation or trigger explicit missed departure.

### Per-Interface Diagnosis

- [ ] Measure disembark throughput.
- [ ] Identify door and Airlock choke points.
- [ ] Identify queue spill across arrival/boarding routes.
- [ ] Measure boarding distance and duration.
- [ ] Measure reachable service and seating capacity.
- [ ] Identify public/cargo route intersections.
- [ ] Measure freight staging/storage distance.
- [ ] Measure staff access to ship hardware.
- [ ] Check utility and maintenance access.
- [ ] Measure approach wait and Berth overstay.
- [ ] Show only the most actionable diagnosis by default.
- [ ] Highlight the physical route, door, queue, or interface when selected.

### Phase 6 Gate

- [ ] Shared public/cargo corridor performs worse than separated routes.
- [ ] Additional Gangway improves boarding.
- [ ] Meal queue across an exit creates late boarding.
- [ ] Diagnosis matches measured actor behavior.
- [ ] No hidden percentage substitutes for physical interference.

## Phase 7: Exposure, Integrity, And Charter Differentiation

### Exterior Integrity

- [ ] Reuse seeded debris exposure and existing maintenance targets.
- [ ] Add stable integrity identity for exterior targets.
- [ ] Add `worn` state.
- [ ] Add `damaged` state.
- [ ] Add explicit thresholded `breached` state.
- [ ] Add `repaired` restoration state.
- [ ] Keep ordinary wear distinct from catastrophic breach.
- [ ] Never silently reuse fire tile-deletion semantics.
- [ ] Route integrity mutations through authoritative topology paths.

### EVA Repair

- [ ] Generate exterior repair work from visible damage.
- [ ] Require Airlock access.
- [ ] Consume EVA oxygen.
- [ ] Consume repair supplies where appropriate.
- [ ] Block and explain unsafe/unreachable repair.
- [ ] Restore pressure boundary correctly after breach repair.
- [ ] Render impact, damage, welding, and patch states.

### Charter Effects

- [ ] Make directional lane traffic affect frontage value and approach pressure.
- [ ] Make dense debris increase directional wear/impact risk.
- [ ] Make sunlight increase generation and thermal load.
- [ ] Make thermal-sink quality affect high-load expansion.
- [ ] Make trade composition affect useful interface/service mix.
- [ ] Keep each effect visible in Charter and station-world feedback.
- [ ] Provide mitigation through shielding, redundancy, cooling, safer expansion,
  or policy.

### Phase 7 Gate

- [ ] Debris-facing wing wears faster than protected comparison.
- [ ] EVA repair visibly restores damage.
- [ ] A true breach changes pressure and restores correctly.
- [ ] Different charters make different expansion geometry attractive.
- [ ] Risk remains forecastable and recoverable.

## Phase 8: Starter, Economy, Progression, UI, And Art

### Starter Contract

- [ ] Begin with a finite unfinished pressure hull.
- [ ] Include basic life safety and crew support.
- [ ] Include Receiving and a construction staging route.
- [ ] Include one usable Airlock.
- [ ] Include two Pod Docks on limited frontage.
- [ ] Include room to author one opening business.
- [ ] Include one short prebuilt truss/hardpoint lesson.
- [ ] Preserve one legible side for the first Berth expansion.
- [ ] Do not start with a completed food and market checklist.

### Opening Choices

- [ ] Let player choose food, supplies/retail, or pod ship service.
- [ ] Let player improve that operation spatially.
- [ ] Let player add another Pod Dock or ship service.
- [ ] Let player build an interior wing or docking finger.
- [ ] Let player save toward a first Berth.
- [ ] Make each investment visibly change traffic or operations.
- [ ] Keep common safety infrastructure orthogonal to portfolio specialization.

### Economy And Progression

- [ ] Price Truss, hull, modules, labor, and maintenance coherently.
- [ ] Make first Berth a major but attainable capital achievement.
- [ ] Keep capabilities visible rather than hidden behind arbitrary unlocks.
- [ ] Use rating to attract more valuable traffic.
- [ ] Use Capital Projects as optional subsidies, not exclusive gates.
- [ ] Reconcile global goal, business path, and legacy tier messaging.
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
- [ ] Add carried resource sprites.
- [ ] Add Gangway and clamp deployment states.
- [ ] Add hull wear/damage/breach/repair states.
- [ ] Add door contention and late-boarding indicators.
- [ ] Verify every asset at actual gameplay size in the live renderer.

### Phase 8 Gate

- [ ] New game requires a meaningful authored opening decision.
- [ ] First business operation visibly serves real demand.
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
- [ ] Persist construction and damage.
- [ ] Persist durable ship visit and slot/queue ownership.
- [ ] Rebuild structural graphs after load.
- [ ] Rebuild approach conflict groups after load.
- [ ] Rebuild congestion and movement intents after load.
- [ ] Rebuild interface diagnoses after load.
- [ ] Never persist stale actor paths or transient movement intents.
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
- [ ] Profile final build at two to three times current station footprint.

### Full Playthrough

- [ ] Start from the revised bare station.
- [ ] Choose and build one opening portfolio operation.
- [ ] Manually compose early traffic through Approach Control.
- [ ] Experience one successful short-stay flow.
- [ ] Experience and recover from one failed long stay.
- [ ] Build temporary guest lodging.
- [ ] Build a physical expansion through EVA construction.
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

- [ ] Add structural support runner.
- [ ] Add phased construction/EVA runner.
- [ ] Add approach geometry/reservation runner.
- [ ] Add ship visit/settlement runner.
- [ ] Add occupant tenure/needs runner.
- [ ] Add fixture-slot/reception runner.
- [ ] Add failed-stay/stranding runner.
- [ ] Add movement/queue/deadlock runner.
- [ ] Add cargo/boarding/support runner.
- [ ] Add integrity/pressure/EVA repair runner.
- [ ] Add target-scale performance runner.
- [ ] Document commands beside each completed phase.

## User Playtest Review

- [ ] Provide a URL that opens the correct scenario/save.
- [ ] Provide a short list of new interactions to try.
- [ ] Provide one deliberately bad layout to observe.
- [ ] Provide the tools to improve that layout in world.
- [ ] Ensure sprites are enabled by default.
- [ ] Ensure panels can be hidden for visual inspection.
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

