# See, Live, Rhythm, Port

Status: plan of record for the next implementation sequence. Written 2026-07-21 after the Tier 6, 50-crew scale playtest and review of `docs/27-living-station-legibility-and-needs-depth.md`; amended after Fable's appended review.

Authority: subordinate to `docs/23-operational-promise-core-loop.md`. This document does not replace the core-loop direction. It proposes a safer sequence for completing the current simulation before adding new port economies.

## Decision

The next development sequence should be:

1. **See the station:** make existing systems legible in the world.
2. **Complete the living crowd:** consistently physicalize existing needs, providers, queues, dwell, and congestion.
3. **Give the station rhythm:** add real crew rosters, operating periods, traffic windows, and staggered routines.
4. **Expand what the port can do:** add fuel, repairs, suppliers, specialized terminals, and capital-vessel operations.

In shorthand:

> **See -> Live -> Rhythm -> Port**

The order matters. The project already contains many substantive but incomplete systems. Adding scheduling or new industrial services before those systems are visible and physically coherent would make the game broader without making it easier to understand, balance, or enjoy.

## Why This Sequence

The last playtest reached Tier 6, 50 crew, more than 50 concurrent visitors, multiple berth classes, residents, security incidents, physical cargo, and complete crew facilities. It proved three things:

1. World-visible needs, queues, speech, and berth progress immediately make the simulation more engaging.
2. Much of the underlying simulation is richer than the player-facing game suggests.
3. Scale currently amplifies incomplete behavior. At peak load, nearly the entire crew pursued self-care while station work stopped, even though the station had nominal staffing and facility capacity.

The immediate question is therefore not "which major new system should be added?" It is:

> What game is already present once its states, causes, consequences, and actor behavior are consistently visible and physical?

Only after answering that through play should scheduling reshape the crowd or new port industries increase the dependency graph.

## Shared Design Rules

These rules apply to every stage.

### World First

Important information begins at the affected actor, fixture, room, route, or berth. Panels and overlays provide investigation and comparison, but should not be the only place a problem exists.

### Complete Loops, Not More Meters

Every surfaced condition must answer four questions:

| Question | Example |
|---|---|
| What state is this in? | The serving counter is overloaded. |
| What caused it? | A passenger wave arrived while Service staffing was low. |
| What consequence is occurring? | Thirteen passengers are waiting and three have abandoned meals. |
| What can the player change? | Reinforce Service, add another counter, shorten the route, or reduce demand. |

If a system cannot answer all four questions, exposing another number is not sufficient. Complete, simplify, demote, or remove it.

### Physical Capacity

Capacity comes from visible fixtures, staff positions, inventory, access, queues, and travel. Avoid arbitrary room-size bonuses when the same result can be represented by things the player can see and rearrange.

### Soft Crowds

Agents may overlap when necessary to avoid deadlocks. Congestion should create visible shuffling, reduced movement speed, longer queues, and service delay without making doors permanently impassable.

### Bounded Presentation

Do not turn the station into an icon field. Prefer this priority order:

1. Facility- or area-level state
2. A small sample of representative actor states
3. Transient speech for recent changes or acute needs
4. Optional overlays for investigation
5. Detailed panels for exact diagnosis

### Scale-Aware Implementation

No new behavior may perform a global actor-by-provider search every render frame. Use cached provider lists, reservations, local candidate shortlists, cadence gating, and shared per-tick snapshots. The 50-crew station is the minimum performance fixture; the intended future target is two to three times that population.

### Two Validation Fixtures

Every stage must pass two different fixtures:

- **Two-Berth Shift:** the design gate. Repeated small-scale play must be understandable, responsive, and fun.
- **Fifty-Crew Station:** the scale gate. The same behavior must remain legible, stable, and performant under crowd load.

Small-scale fun blocks stage advancement even when the scale fixture is technically stable. The large save is not a substitute for proving the opening loop.

## Stage 1: See The Station

### Goal

A player who never opens a management panel can identify where the station is dirty, worn, unsafe, understaffed, congested, exhausted, or failing.

This stage does not add new simulation needs or industries. It reveals and validates systems that already run.

### 1. System Legibility Audit

Audit each active system against state, cause, consequence, and lever:

- Sanitation
- Maintenance and module condition
- Local oxygen and pressure
- Thermal discomfort and stale air
- Crew energy, hygiene, bladder, thirst, morale, and payroll
- Visitor hunger, drink, restroom, leisure, safety, comfort, and patience
- Resident satisfaction, sleep, hygiene, safety, and social condition
- Queueing and service throughput
- Cargo and construction blockage
- Theft, crime exposure, and security response
- Berth turnaround work
- Reputation and station rating
- Tick-path residue, dormant progression gates, and invisible legacy systems

For each system, record one of four dispositions after browser play:

- **Surface:** the loop works and only needs world presentation.
- **Complete:** the state exists, but cause, consequence, or player lever is missing.
- **Demote:** keep it in simulation or diagnostics, but remove it from prominent player attention.
- **Retire:** it consumes complexity without supporting a meaningful decision.

The audit must be performed through recorded play at both validation fixtures, not code reading alone. Desk analysis can identify candidates, but only observed play assigns the final disposition.

### 2. Tick-Path And Progression Debt

Invisible systems require the same scrutiny as visible ones. In particular:

- Identify legacy T0-T6 progression work still running without a current player-facing role
- Inventory the command-specialty and hardcoded core-loop gates that overlap it
- Remove dormant work from the active tick path where safe
- Consolidate surviving unlock decisions behind one resolver before Stage 3 needs earned scheduling automation
- Record explicit fates for dormant reputation/property and utility systems rather than allowing them to persist because they never appear in a screenshot

### 3. Visible World States

Implement the highest-leverage visual gaps identified in Doc 27:

- Progressive floor dirt beginning at a subtle lived-in threshold before a filthy threshold
- Module wear, grime, strain, fault, and broken-state decals
- Low-oxygen or stale-air treatment in occupied and operationally relevant areas
- Sampled persistent actor markers for critical fatigue, distress, agitation, and acute unmet needs
- Facility-level queue, occupancy, staffing, and blockage indicators
- World-side berth outcomes and service stalls

Air presentation should prioritize occupied rooms and essential service areas. A headline such as "315 poorly supplied tiles" is less useful than "Dormitory B has occupied low-air tiles."

### 4. Visible Work

Actions should alter the world visibly:

- Cleaning clears dirt tile by tile with a short wipe or sparkle
- Repair work visibly reduces module damage states
- Cargo appears to move between ship, pallet, carrier, and rack
- Service workers visibly occupy working positions
- Security response is visible at the incident location
- Queues visibly shorten when capacity or staffing improves

### 5. Optional Investigative Overlays

Restore or retain useful overlays, but treat them as secondary instruments:

- Air and pressure
- Sanitation
- Maintenance
- Crowding and route pressure
- Service reach or catchment
- Security exposure

Consolidation into a smaller Operations View can happen after evidence from this stage. Do not remove an overlay merely because the world state is visible; Cities: Skylines-style overlays remain valuable for planning and comparison.

### Stage 1 Exit Tests

1. At the Two-Berth fixture, pause mid-shift and hide management panels. A new viewer can identify a dirty area, a strained machine, a distressed actor, and an overloaded service.
2. For each visible warning, the player can identify at least one corrective action without opening raw diagnostics.
3. Cleaning, repair, queue relief, and oxygen recovery visibly change the affected world area.
4. The audit assigns every prominently surfaced system a Surface, Complete, Demote, or Retire disposition.
5. The presentation remains readable with at least 50 crew and 50 visitors.
6. Tick-path residue has an explicit disposition and surviving unlock decisions use one resolver.
7. A recorded playtest note exists for both fixtures; every exit test is passed or explicitly waived with a reason.

### Stage 1 Non-Goals

- No new crew or visitor need
- No true shift scheduler
- No fuel, repair-service, or supplier economy
- No new progression layer
- No forced removal of optional overlays

## Stage 2: Complete The Living Crowd

### Goal

Agents should use fixtures, services, and shared space consistently enough that watching the station explains its capacity problems.

This stage extends mechanisms that already exist: provider discovery, reservations, pathing, dwell, relief, release, queueing, and localized thought feedback.

### 1. Shared Provider Behavior

Incrementally extract a common behavior template:

> Need becomes actionable -> choose a reachable provider -> reserve capacity -> walk -> wait if required -> occupy -> receive relief over time -> release -> resume prior intent

The abstraction should support:

- Provider kind and eligible modules
- Per-module capacity
- Relief or service rate
- Dwell time
- Queue behavior
- Access policy
- Population eligibility
- Quality and comfort
- Failure or balking behavior

Do not begin with a big-bang rewrite of the actor simulation. Extract each piece while converting a real behavior.

### 2. Typed Queue Theater

Generalize the cafeteria queue machinery, but do not force every provider into the same line shape.

- Serving counters, bars, customs, and market checkouts use ordered lines
- Toilets and showers use visible waiting positions or loose local waits
- Seats and beds use reservations without ceremonial queues
- High-capacity services may use multiple parallel service slots

Every queue should communicate demand, service rate, staffing, patience, and the consequence of abandonment.

### 3. Resident Physicality

Residents should stop satisfying major needs through room presence and global stock alone. They should:

- Reserve a specific Bed or Bunk
- Use a specific Toilet, Sink, or Shower
- Obtain a located meal and occupy a seat
- Claim a leisure or social position
- Experience fixture quality and travel distance

This makes resident housing policy, private facilities, Bed versus Bunk, and district placement materially observable. It follows the core visitor/crew provider and queue extraction so manager-stage population work does not lead the stage.

### 4. Crew Hunger And Shared Facilities

Add crew hunger only after shared provider behavior is stable. Crew obtain meals through the physical cafeteria and compete with visitors for serving throughput and seats.

This creates useful cross-population pressure, but it must not erase station operation. Until Stage 3 provides real schedules, enforce a narrow safety invariant:

> Non-emergency self-care cannot reduce life support, security response, or player-configured critical service below its protected staffing floor.

This is not a shift scheduler. It is a guard against the verified all-crew self-care collapse.

The guard must be legible in-world. A held worker can say "Holding post until relief arrives," and the affected facility displays a quiet "minimum staffing held" marker. The player should understand why a tired worker has not left and can change the protected department floor.

### 5. Dwell, Milling, And Social Use

Idle and off-duty actors should use available space:

- Claim lounge seats and standing tables
- Dwell in plazas, observation areas, bars, and markets
- Prefer district-local idle anchors
- Form small social clusters
- Wander at a low cadence rather than continuously requesting paths
- Gain leisure or social relief over time instead of immediately on room entry

### 6. Visible Soft Congestion

Local density should:

- Reduce movement speed modestly
- Cause small visual lane or shuffle variation
- Increase travel and service delay
- Create dirt and discomfort where appropriate
- Never create a hard occupancy deadlock

### Stage 2 Exit Tests

1. At the Two-Berth fixture, watch the station for two minutes with management UI hidden. Residents and crew visibly seek, wait for, occupy, and leave physical providers.
2. A cafeteria meal rush forms and drains for understandable reasons.
3. Off-duty or idle actors visibly occupy leisure spaces rather than standing indefinitely.
4. Resident Bed/Bunk and private/shared facility choices create observable differences.
5. No provider tile can serve more actors than its physical capacity.
6. Acute self-care cannot pull the entire crew away from protected critical work.
7. The 50-crew station remains responsive without global provider scans or pathfinding bursts.
8. Protected staffing is visible at the held worker and facility rather than behaving as a hidden exception.
9. A recorded playtest note exists for both fixtures; small-scale fun remains the stage gate.

### Stage 2 Non-Goals

- No player-authored watch schedule
- No station operating-hours UI
- No literal day/night cycle
- No hard tile collision
- No new industrial service economy
- No resident politics or class system

## Stage 3: Give The Station Rhythm

### Goal

Use time to create changing but understandable demand. Capacity should be adequate during one part of the operating cycle and strained during another.

Stage 2 first establishes natural physical behavior. Stage 3 then shapes that behavior deliberately through schedules instead of using schedules to conceal incomplete needs.

### 1. Traffic Timetable

Traffic provides the native rhythm and the reason to schedule labor. Routine small craft remain largely autonomous. Medium and large traffic should be forecast in operating windows:

- Passenger arrival banks
- Supplier deliveries
- Cargo periods
- Industrial or military movements
- Quiet maintenance windows

The player should manage policy, berth capability, staffing, stock, and exceptions rather than approve every manifest.

### 2. Station Operating Clock

Replace the cosmetic day string with a compact operating cycle. It does not require terrestrial sunlight or a 24-hour lighting simulation.

The clock should support three independent rhythms:

- Crew watch handovers
- Traffic or carrier windows
- Offset resident and personal routines

Playtest the period rather than committing to fictional hours first. A complete operating cycle will likely take several real minutes at 1x.

### 3. Crew Watches

Replace the current ten-second `shiftBucket` rest permission with real roster state:

- On duty
- Reserve or available for relief
- Off duty
- Sleeping or performing self-care as an action within off-duty time

Crew retain needs and autonomy. A schedule controls when they are expected to work; it does not teleport them or instantly refill needs.

The minimum v1 model is three watch templates using on-duty, reserve, and off-duty thirds; per-department staffing targets per watch; protected minimums carried forward from Stage 2; and a forecast strip showing the next traffic bank. Do not add per-person schedules or per-facility calendars unless play proves they are required.

### 4. Staffing By Time And Place

Allow the player to configure:

- Department staffing by watch
- Protected minimums
- Facility or district operating hours
- Reserve workers
- Planned meal and rest windows
- Overtime or emergency recall

At small scale, these controls should remain direct and compact. Saved templates and supervisor automation are earned after the player has manually operated repeated handovers.

### 5. Routine Offsets

Residents and crew should have stable per-agent offsets inside broader schedule windows. A meal period creates a pulse, not a command for every actor to enter the same room on the same tick.

### Stage 3 Exit Tests

1. At the Two-Berth fixture, a healthy roster survives a meal rush and shift handover without individual self-care micromanagement.
2. The same station experiences visibly different pressures across one operating cycle.
3. The player can forecast an upcoming staffing or service shortfall and act before it occurs.
4. Overtime or emergency recall solves an immediate problem while producing a visible fatigue or morale cost.
5. Extending operating hours requires additional labor and facilities but can support more traffic and revenue.
6. Routine automation removes repetition without removing exceptions.
7. The 50-crew fixture completes an operating cycle without synchronized actor collapse or unacceptable presentation stalls.
8. A recorded playtest note exists for both fixtures; small-scale fun remains the stage gate.

### Stage 3 Non-Goals

- No mandatory terrestrial day/night lighting
- No per-person timetable editor
- No manual approval of every routine ship
- No abstract roguelike event schedule
- No new fuel or repair industry unless needed by a later port slice

## Stage 4: Expand What The Port Can Do

### Goal

Introduce new services only after the station has a proven visual, behavioral, and temporal grammar.

Later candidate systems include:

- Fuel delivery, storage, pumping, and resale
- Ship repair work consuming physical parts
- Mechanics assigned to docks and workshops
- Supplier vessels that replenish food, fuel, and parts
- Dock-local buffers versus central depots
- Specialized passenger, cargo, industrial, luxury, military, and residential terminals
- Capital vessels with multiple simultaneous service tracks
- District supervisors and operating budgets

Each service must use the grammar proven by Stages 1-3:

1. A visible ship or population creates demand.
2. Physical inventory and fixtures provide capability.
3. Scheduled staff perform visible work.
4. Layout and travel affect completion.
5. Failure appears in the world with a corrective lever.
6. Completed service pays attributable revenue and shapes future traffic.

Stage 4 admits **exactly one new service**. A second service is not designed or implemented until the first passes the complete six-step grammar and both validation fixtures.

### First Candidate Slice: One Port Day With Fuel

A contained test might include:

- 12-16 crew
- Two autonomous small-craft docks
- One medium berth
- A complete operating cycle
- Existing food and hospitality
- One supplier delivery
- One scheduled passenger vessel
- One overlapping industrial vessel
- Fuel as the only new service: supplier delivery, physical storage, hauling, dock-local or central buffer, staffed transfer, sale, and visible failure

The test should compare two viable spatial strategies:

- Central facilities with shared labor and inventory
- Distributed dock districts with shorter routes and duplicated capacity

Neither should universally dominate.

Fuel is first because it reuses supplier ships, cargo lots, item nodes, hauling, storage, and berth turnaround work. Repair remains the likely second service, after fuel proves the port-service grammar; repair additionally requires ship condition, parts, and mechanic work positions.

### Stage 4 Exit Tests

1. Fuel completes the six-step grammar from visible ship demand through attributable payment and future traffic effect.
2. The Two-Berth fixture gains a meaningful spatial and staffing decision rather than another mandatory room recipe.
3. Central fuel storage and dock-local buffering have explainable, viable tradeoffs.
4. The 50-crew fixture handles supplier and customer fuel traffic without simulation or presentation collapse.
5. A recorded playtest note exists for both fixtures and every test is passed or waived with a reason.
6. No second new service has entered implementation.

## Progression Relationship

Progression remains additive to the healthy operating loop.

- Stage 1 does not require progression changes beyond demoting misleading surfaces.
- Stage 2 makes facilities and populations physically complete at any unlock level.
- Stage 3 earns scheduling and automation through demonstrated operational repetition.
- Stage 4 unlocks additional port capabilities, industries, and policies.

The player should be able to enjoy operating a small station indefinitely. Growth introduces broader demand, specialization, and abstraction rather than repairing an uninteresting opening loop.

## Stage Advancement Evidence

Checkbox completion does not advance a stage. Advancement requires:

1. A browser playtest note in the Doc 24 log style for the Two-Berth fixture
2. A browser playtest note for the 50-crew fixture
3. Every exit test passed or explicitly waived with a reason
4. Focused automated checks for changed invariants
5. A production build
6. A clean checkpoint commit

For Stage 1 specifically, the audit table must have no undispositioned system. The implementation may continue refining a stage after its gate passes, but later-stage mechanics must not be used to conceal a failed earlier-stage behavior.

## Risks And Countermeasures

| Risk | Countermeasure |
|---|---|
| Legibility becomes icon soup | Facility-first summaries, sampled actor markers, severity thresholds, and quiet healthy states |
| Surfacing reveals systems with no consequence | Complete, demote, or retire them through the Stage 1 audit |
| More physical needs become repetitive | Shared providers, autonomous behavior, sparse player intervention, and later scheduling |
| Crew hunger collapses staffing | Protected critical floors before full shift scheduling |
| General queues look artificial | Provider-specific waiting styles and multiple service slots |
| Milling creates pathfinding load | District-local anchors, low retarget cadence, cached candidates |
| Schedules become a spreadsheet | Watch templates, facility-level controls, forecast timeline, and earned automation |
| Traffic scheduling becomes manifest paperwork | Autonomous routine craft, policy routing, and exception-only intervention |
| New industries widen the stub problem | Add one complete service at a time after Stages 1-3 pass |
| Large stations lose presentation smoothness | Fixed simulation cadence, render interpolation, culling, batched fields, and scale fixtures |

## Questions For Critique

1. Does legibility-first risk spending too much time presenting systems that should instead be retired?
2. Is the Surface/Complete/Demote/Retire audit sufficient to prevent that?
3. Which Stage 1 state has the highest expected gameplay leverage, and which is visual polish without a decision?
4. Is resident physicality appropriately prioritized in Stage 2, or should visitors and crew be completed first?
5. Does crew hunger produce a worthwhile shared-capacity decision, or only another maintenance obligation?
6. Can protected staffing floors safely bridge Stage 2 without prematurely implementing scheduling?
7. Are station watches the right source of temporal rhythm, or should traffic timetables lead and labor respond?
8. What is the minimum Stage 3 scheduling model that creates meaningful pulses without becoming a roster spreadsheet?
9. Is fuel or repair the better first Stage 4 service for proving the larger port fantasy?
10. What evidence should be required before advancing from each stage rather than continuing to add depth within it?

---

# Fables Review

Reviewed 2026-07-21 by Claude (Fable), after producing `docs/27-living-station-legibility-and-needs-depth.md` and a full design/architecture review of the codebase (agent needs simulation, systems architecture, render pipeline, progression/legibility).

## Verdict

**Adopt this document as the plan of record for the next sequence.** It takes doc 27's material, fixes its two real sequencing mistakes, and adds discipline doc 27 lacked. The amendments below close seams with `docs/23` and `docs/24`; none change the See -> Live -> Rhythm -> Port structure.

## Where this improves on doc 27

1. **Pulling rhythm into its own stage is correct.** The strongest reasoning in the doc: "Stage 2 first establishes natural physical behavior. Stage 3 then shapes that behavior deliberately through schedules instead of using schedules to conceal incomplete needs." Doc 27 had shift rhythm inside the living-crowd stage; scheduling layered onto incomplete needs behavior would have masked bugs as "quiet periods." The 50-crew all-crew self-care collapse is exactly the failure a premature scheduler would have papered over.
2. **The Surface/Complete/Demote/Retire audit** operationalizes doc 23's five-question filter per system. It is the mechanism that answers "prune or deepen?" with play evidence instead of taste.
3. **Typed queue theater** is better design than doc 27's "generalize queues everywhere." Toilets getting loose waiting positions rather than ceremonial single-file lines, and seats using reservations with no line at all, is the difference between a system and a gimmick applied uniformly.
4. **The protected staffing floor** is a smart minimal bridge: it fixes the verified collapse without prematurely building the scheduler, and it is explicitly a guard, not a feature.
5. **Keeping investigative overlays** (rather than doc 27's early fold into one Operations View) is the right correction. Overlays are planning instruments; the world-first hierarchy already satisfies doc 23's concern without deleting useful tools.

## Four amendments required before implementation

### A. Restore the legacy-debt workstream (fifth audit category)

Doc 27's Stage 4 (consolidate the three coexisting unlock-gating mechanisms, remove the T0-T6 tick path, decide the fate of the reputation/property layer and other still-ticking dormant systems) has no home in this document. The Stage 1 audit covers *surfaced* systems, but the tier tree ticks every frame with its UI suppressed (`updateUnlockProgress` in the tick path; three resolvers at `sim.ts` ~600-625) — it will never appear in a legibility audit precisely because it is invisible. This is also doc 24 Checkpoint 1's still-unchecked "remove from tick path" item.

**Amendment:** add "tick-path residue" as an explicit fifth audit scope in Stage 1 so Demote/Retire dispositions apply to invisible systems too, and schedule the single-unlock-resolver consolidation before Stage 3 — the earned-automation progression needs one resolver to hang off.

### B. Make the staffing floor legible, by this document's own rules

A protected floor is an invisible rule: a player watching an exhausted crew member hold a post will read it as the needs system failing. The "complete loops, not more meters" table demands state/cause/consequence/lever for everything prominently surfaced — apply it to the floor itself.

**Amendment:** a crew thought ("Holding post until relief arrives") plus a facility-level "minimum staffing held" marker. Cheap, and without it Stage 2's safety invariant violates Stage 1's design rules.

### C. Pin validation to both fixtures, with small-scale fun as the gate

The 50-crew station is named the *performance* fixture, but most exit tests implicitly reference it, while doc 23's actual design gate is the two-berth slice being fun in repeated small-scale play. These pull in different directions.

**Amendment:** every stage validates at both fixtures — the two-berth station for "is the loop fun," the 50-crew station for "does it survive scale" — and the small-scale fun test remains the gate that blocks stage advancement. Otherwise Stage 1-2 work will silently optimize for the sandbox screenshot instead of the game.

### D. Harden the one-service rule for Stage 4

Fuel, repairs, suppliers, terminals, capital vessels, and district supervisors is a full game's worth of scope in eight bullets. "One Port Day" is the right containment; make it binding rather than suggestive.

**Amendment:** Stage 4 admits exactly one new service, proven end-to-end through the six-step grammar, before a second is discussed.

## Answers to the Questions For Critique

1-2. **Does legibility-first waste effort on doomed systems? / Is the audit sufficient?** The risk is real and the audit answers it — with one condition: run the audit through *play sessions with dispositions recorded in the doc 24 playtest-log format*, not through code reading. An audit done at a desk will rationalize keeping things; an audit done watching the 50-crew station will retire them.

3. **Highest-leverage Stage 1 state:** module condition decals. The per-module `MaintenanceDebt` data exists, the render hook is one function in `drawModuleVisual` following the existing floor-grime decal precedent, and it feeds a real lever (repair jobs, redundancy purchases). **Lowest:** always-on thermal presentation — the render review found it the most expensive item in the pipeline (per-frame dynamic-pass work that bypasses the layer cache, plus the compounding-alpha regression risk) *and* it has the weakest decision attached. Do it last or demote it.

4. **Resident physicality priority:** slightly over-prioritized. Residents are the manager-stage layer per doc 23; visitors and crew are the core loop. Within Stage 2, reorder: shared provider template -> typed queues (serves core-loop populations) -> then resident physicality. Same stage, different order.

5. **Crew hunger — decision or chore?** A chore in Stage 2, a decision in Stage 3. Crew eating during off-peak lulls is maintenance; crew meal windows colliding with a passenger arrival bank is a genuine capacity decision. Implement the plumbing in Stage 2 as written, but expect the payoff to land with rhythm — and do not judge it a failure before Stage 3 exists.

6. **Can floors bridge Stage 2 without scheduling?** Yes, provided amendment B (the floor is legible) and the floor stays coarse: per-department minimums, no per-facility hours. The moment floors need time windows to feel right, that is the signal to start Stage 3, not to grow the floor system.

7. **Watches lead or traffic leads?** Traffic leads. The port fantasy's native rhythm is demand-side — arrival banks and carrier windows — and crew watches are the response the player configures. This matches doc 23's Attract -> Configure ordering. Within Stage 3, build the traffic timetable before the watch system so the player has a visible reason to schedule labor at all.

8. **Minimum Stage 3 scheduling model:** three watch templates (on-duty / reserve / off-duty thirds), per-department staffing targets per watch, protected minimums carried over from Stage 2, and a forecast strip showing the next traffic bank. Nothing per-person, nothing per-facility until playtests demand it.

9. **Fuel or repair first?** Fuel. It reuses the entire existing grammar — item nodes, hauling, supplier ships via the cargo system, dock-local buffer vs. central depot as a spatial decision — with essentially no new simulation state. Repair requires ship-side condition state, parts inventory, and work positions: three new things versus zero. Repair is the better *second* service because it then composes with the maintenance system.

10. **Evidence to advance a stage:** a recorded playtest note in the doc 24 log format at both fixtures (amendment C), every exit test either passed or explicitly waived with a reason, and — for Stage 1 -> 2 — the audit table complete with no system left undispositioned. Checkbox completion without a play recording does not advance a stage; this repo has already learned that lesson once (doc 24's "do not mark local-play items complete from deterministic output" rule).

## Supporting evidence from the 2026-07-21 code review

For the implementing agent — findings this plan depends on, verified against `ad3d267`:

- **Crew fixture use is already Prison-Architect-shaped:** continuous needs, timed occupation of reserved single-user fixtures (`MAX_USERS_PER_USAGE_TILE = 1`, reservation capacity checks). Stage 2 is completion work, not new architecture.
- **Residents bypass it:** sleep/hygiene/leisure resolve by room-presence plus global `mealStock`/`waterStock` scalars (`sim.ts` ~16079-16107); the crew machinery (`ensureCrewUsageTarget`, provider-slot reservations) is directly reusable.
- **Queues exist only for cafeteria serving stations** (`buildQueueChain` ~8152, hard-coded to Cafeteria); generalization is extraction, not invention.
- **Floor grime decals already render** from per-tile `dirtByTile`, but only past dirt >= 25 — "nothing ever looks dirty" is a tuning/threshold problem, not a missing feature.
- **Module condition is the biggest data-to-render gap:** per-module `MaintenanceDebt` exists; `drawModuleVisual` never uses it. The decorative render layer is cached, so decals are nearly free per frame.
- **Contracted-but-dead surfacing assets:** `AGENT_OVERLAY_SPRITE_KEYS` (distressed/critical/agitated) have zero atlas frames and no draw call; `fx.low_oxygen` is packed in the atlas and never drawn.
- **Soft occupancy is deliberate** (hard caps deadlocked doors; comment at `moveAlongPath` ~9738) — the Soft Crowds rule above is consistent with hard-won history.
- **Performance guardrails already exist** (40k findPath calls/tick budget, path cache, cadence gating, viewport culling); Scale-Aware Implementation should route new behavior through them rather than adding parallel mechanisms.
- **The per-agent logic is the refactor risk:** `updateCrewLogic` (~1,770 lines), `updateResidentLogic`, and `updateVisitorLogic` are monolithic branch trees with hardcoded need scalars. Stage 2.1's incremental extraction rule is the correct mitigation; hold to it.
