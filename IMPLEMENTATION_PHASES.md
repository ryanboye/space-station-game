# Expanse Station Sim - Phased Implementation Plan

## 1. Planning Constraints
- Keep each phase playable and releasable on its own.
- Keep each implementation packet small enough for one coding context window.
- Require a concrete test gate before moving to the next phase.
- Prefer extending current systems over large rewrites.

## 2. Current Baseline (Observed in Code)
- Core loop exists: build grid, paint rooms/zones, run tick simulation, render metrics.
- Implemented rooms: cafeteria, reactor, security, dorm, hygiene, hydroponics, life support.
- Agents exist: visitors, residents, crew with basic needs and pathfinding.
- Economy exists: credits/materials/raw food trade, payroll, hiring/firing.
- Diagnostics exist: room activation reasons (door/pressure/staff/path).
- Stability hotfix shipped: crew shift staggering + anti-pingpong rest/emergency behavior for life support response.

Key gaps against vision/product plan:
- No module/furniture requirements.
- No generalized item/job logistics backbone (food hauling is ad hoc).
- No health/death/morgue chain.
- No detect-dispatch-resolve security pipeline.
- No workshop/market specialization loop.
- Pathing lacks reservation/congestion sophistication and recovery behaviors.
- Full workforce scheduler/planner is deferred to Phase 3+ (current hotfix is rules-based only).
- Resident labor/jobs and deeper civic behavior layers remain deferred.

## 3. Phase Size Rules (Context-Window Safe)
Each phase is split into 1-3 implementation packets with this hard budget:
- Max files touched per packet: 4.
- Max net diff per packet: ~450 LOC.
- Max new concepts per packet: 2.
- End each packet with a runnable build and a short regression check.

If a phase exceeds these constraints, split it before coding.

## 4. Phase Roadmap

## Phase 0 - Simulation Test Harness + Data Scaffolding
Goal: Make future feature phases testable without manual-only verification.

Scope:
- Add lightweight simulation scenario runner (headless tick stepping).
- Add deterministic snapshot/assert helpers for metrics and key entity counts.
- Add first data schema placeholders for modules, items, and jobs (types only, no behavior).

Suggested files:
- `src/sim/types.ts`
- `src/sim/sim.ts`
- `src/sim/scenarios.ts` (new)
- `package.json` (add test script)

Definition of done:
- `npm run build` succeeds.
- At least 3 scripted scenarios pass (stable station, no cafeteria, no life support).
- Scenarios assert measurable outcomes (morale trend, incident growth, air quality trend).

Why first: every remaining phase needs fast, repeatable validation.

---

## Phase 1 - Module System Foundation (Marker-First)
Goal: Introduce room modules/furniture as first-class data and rendering markers.

Scope:
- Add module entities mapped to tile indices.
- Add module placement/removal build tools and keyboard bindings.
- Render module markers with fallback letters/icons.
- Keep rooms functional as they are (no gating yet).

Initial module set:
- Bed (Dorm), Table (Cafeteria), GrowTray (Hydroponics), Terminal (Security).
- Defer future-room modules until those rooms exist (Kitchen, Medbay, Workshop, Market).

Suggested files:
- `src/sim/types.ts`
- `src/sim/sim.ts`
- `src/render/render.ts`
- `src/main.ts`

Definition of done:
- Player can place/remove module markers on valid walkable tiles.
- Modules persist in state and render correctly.
- Existing gameplay remains unchanged when no module gating is enabled.

---

## Phase 2 - Module-Gated Room Activation + Diagnostics
Goal: Make modules required for room functionality, with clear failure reasons.

Scope:
- Add room->required modules mapping.
- Extend room operational checks to include module requirements.
- Extend room diagnostic text to include missing modules.
- Update panel UX copy to clarify "painted room" vs "active room".
- Apply gating only to currently implemented room types in this phase:
  - Dorm requires Bed
  - Cafeteria requires Table
  - Hydroponics requires GrowTray
  - Security requires Terminal

Deferred module pack (future phase with new rooms):
- Kitchen: Stove + Prep
- Medbay: MedBed
- Workshop: Workbench
- Market: Stall

Suggested files:
- `src/sim/sim.ts`
- `src/sim/types.ts`
- `src/main.ts`
- `src/render/render.ts`

Definition of done:
- Required rooms do not activate without required modules.
- Hover diagnostics identify exact missing requirement in under 5 seconds.
- Existing staffing/door/pressure checks still work with module checks layered in.

---

## Phase 2.5 - Baseline Variety + Kitchen Strict Chain
Goal: make short runs feel different and strategic before deeper system expansion.

Scope:
- Add `Kitchen` room + `Stove` module as a strict bottleneck in the food chain.
- Enforce `Hydroponics -> Kitchen -> Cafeteria` meal flow.
- Add per-ship visible visitor manifests and archetype mixes.
- Add visitor behavior variance (preference, patience, spend, tax sensitivity).
- Surface demand + archetype distribution in compact UI lines.

Definition of done:
- Same layout produces meaningfully different outcomes across seeds due manifest mix.
- No-kitchen layouts lose sustained meal throughput once starter stock drains.
- Tax slider shows visible tradeoff under shopper-heavy demand (not pure upside).
- Build and sim regression tests remain green.

Deferred follow-up:
- `Kitchen Prep` module remains deferred to later content phase.
- Full trade goods/workshop loop remains Phase 7.

---

## Phase 3 - Generic Item + Job Logistics Backbone (Hybrid Model)
Goal: Replace ad hoc hauling with reusable logistics jobs for critical chains.

Scope:
- Add item types (`meal`, `rawFood`, `medSupply`, `tradeGood`, `body`).
- Add job queue (`pickup`, `deliver`, `transportBody`, etc.) with expiration.
- Move food chain hauling onto job system first (hydro -> kitchen/cafeteria).
- Add storage buffer tiles/room rule as simple capacity pools near rooms.

Suggested files:
- `src/sim/types.ts`
- `src/sim/sim.ts`
- `src/render/render.ts`
- `src/main.ts`

Definition of done:
- Food throughput depends on hauler availability and distance.
- Job queue can be inspected in a debug panel line (count by type/state).
- Scenario test: adding nearby storage/haulers improves meal delivery latency.

---

## Phase 4 - Crew Capacity Gate + Quarters Quality Effects
Goal: Tie hiring and productivity to dorm/hygiene infrastructure.

Scope:
- Enforce hiring gate from valid bed capacity.
- Compute per-crew housing access quality (bed + hygiene reachability).
- Apply productivity modifiers from fatigue/hygiene deficit.
- Add explicit UI reason on failed hire action.

Suggested files:
- `src/sim/sim.ts`
- `src/sim/types.ts`
- `src/main.ts`

Definition of done:
- Hire action fails with clear cause when no available bed capacity exists.
- Underprovisioned quarters produce measurable throughput degradation.
- Scenario test covers both valid and invalid hire conditions.

---

## Phase 5 - Health, Injury, Death, and Morgue (Abstract Presentation)
Goal: Add recoverable consequence chain without art-heavy implementation.

Scope:
- Add health state transitions (healthy -> injured/ill -> dead).
- Generate body entities and porter transport jobs to morgue.
- Add morgue capacity and overflow penalties (morale/incident pressure).
- Keep visuals abstract (markers + counters), aligned with locked decisions.

Suggested files:
- `src/sim/types.ts`
- `src/sim/sim.ts`
- `src/render/render.ts`
- `src/main.ts`

Definition of done:
- Oxygen failure or severe incidents can create deaths.
- Bodies are physically represented in simulation and moved via jobs.
- Ignoring morgue overflow produces compounding penalties visible in metrics.

---

## Phase 6 - Security Incident Pipeline v1 (Detect -> Dispatch -> Resolve)
Goal: Replace flat incident accumulation with a causal pipeline.

Scope:
- Add incident objects with type, location, severity, lifecycle state.
- Implement detection and security dispatch tasks.
- Add resolution outcomes (warning, escort, detain placeholder, treat).
- Tie response speed to coverage and path congestion.

Suggested files:
- `src/sim/types.ts`
- `src/sim/sim.ts`
- `src/main.ts`
- `src/render/render.ts`

Definition of done:
- In low security coverage, incident duration and cost are measurably higher.
- Increasing staffed security reduces unresolved incidents.
- Alert feed groups incidents by root cause category.

---

## Phase 7 - Trade Branch: Workshop + Market Hall Loop
Goal: Deliver optional high-upside specialization without making it mandatory.

Scope:
- Add workshop production jobs (materials -> trade goods).
- Add market hall conversion (trade goods + visitors -> credits + morale bump).
- Keep core survival viable without this branch.
- Add minimal balancing knobs in config constants.

Suggested files:
- `src/sim/types.ts`
- `src/sim/sim.ts`
- `src/main.ts`
- `src/render/render.ts`

Definition of done:
- Trade branch produces better upside but requires staffing/logistics.
- Ignoring trade does not break core station survival.
- Scenario test compares baseline vs trade-focused layouts for credits/min.

---

## Phase 8 - Pathing and Movement v2
Goal: Reduce robotic flow and persistent congestion failure modes.

Scope:
- Add dynamic tile costs from congestion and unsafe conditions.
- Add destination reservations for service nodes.
- Add stuck detection with reroute/backoff recovery.
- Add role-aware routing preferences (visitor/public vs crew/staff areas).

Suggested files:
- `src/sim/path.ts`
- `src/sim/sim.ts`
- `src/sim/types.ts`

Definition of done:
- 20-minute 2x soak has no persistent deadlock.
- Equivalent corridors share traffic over time.
- Doorway clumping around cafeteria/service points is materially reduced.

---

## Phase 9 - Explainability, Overlays, and 20-Minute Balance Pass
Goal: Reach first polished milestone loop with clear causality and tuning.

Scope:
- Add root-cause diagnostics panel for top system failures.
- Add overlays: congestion, oxygen risk, security coverage, zone violations.
- Tune constants for forgiving early game and meaningful mid-game bottlenecks.
- Validate 20-minute loop (build -> stress -> recovery) with internal scenario sheet.

Suggested files:
- `src/main.ts`
- `src/render/render.ts`
- `src/sim/sim.ts`
- `PRODUCT_PLAN.md` (mark completion notes)

Definition of done:
- First major failure is understandable without external docs.
- Recovery from first cascade is possible via explicit levers.
- Internal playtest runs consistently hit a 20-minute satisfying arc.

## 5. Execution Order and Dependency Notes
- Hard dependency chain: Phase 0 -> 1 -> 2 -> 3 -> 5 -> 6 -> 8 -> 9.
- Phase 4 can start after Phase 2.
- Phase 7 can start after Phase 3.
- Recommended practical order: 0, 1, 2, 3, 4, 5, 6, 7, 8, 9.

## 6. Per-Phase Validation Template
Use this exact checklist at the end of every phase:
1. Build passes: `npm run build`.
2. Scenario tests for the new behavior pass.
3. No regression in existing baseline scenario.
4. New UI diagnostics explain failure reason.
5. Phase notes recorded (what changed, known issues, tuning constants).

## 7. Suggested Immediate Next Implementation Packet
Start with Phase 0, Packet A:
- Add scenario runner + deterministic seed support export.
- Add one baseline scenario and one failure scenario.
- Add `npm run test:sim` script to execute scenarios.

This gives fast feedback for all upcoming systems and keeps future phase work small and verifiable.

## 8. Stabilization Milestone (Completed)
Applied before new room/layer expansion:
1. Clarity pass:
- Agent legend, room usage section, crew state breakdown, idle/stall reason diagnostics.
- Morale contributor strip and aggregated room warning output.

2. Air consequence pass:
- Deterministic low-air health progression with death and recovery windows.
- Distressed/critical visualization and death/body counters.

3. Utility/balance observability:
- Room throughput metrics and failed need-attempt counters.
- Jobs diagnostics expanded with oldest pending and stalled reason mix.
- Scenario tests extended for air collapse/recovery and room usage visibility.

## 9. Now-Scope Deferral Ledger (Active)
This ledger tracks features intentionally removed/hidden from the current playable build so they are restored in the correct phase.

1. Deferred from current build to **Phase 4 / Phase 5**:
- Resident labor/jobs (residents remain economy/tax + service consumers in current scope).
- Resident-driven advanced health/death treatment chains as a primary loop.

2. Deferred from current build to **Phase 5**:
- Medical/morgue logistics chains and explicit body transport jobs.
- Deep injury/recovery treatment flow.

3. Deferred from current build to **Phase 7**:
- Deep trade branches beyond the current vertical slice (multi-stage crafting/freight specializations).

4. Deferred from current build to **Phase 9**:
- Always-visible deep diagnostics in sidebar.
- Rich explainability overlays as default UI (kept available via collapsible advanced sections only for now).

5. Current enforced now-scope:
- Crew + visitor + resident playable loop.
- Active logistics chain centered on food + trade-good transport.
- Sidebar prioritizes core operational controls/status; diagnostics are collapsed by default.

6. Pulled forward intentionally (lightweight only):
- `Lounge` and `Market` room types introduced early as visitor destinations to improve baseline fun/flow.
- Full trade/production depth for Market remains deferred to **Phase 7**.

## 10. Stability v2 (Implemented)
Current-scope polish pass applied before further feature expansion:

1. Crew coherence:
- Replaced fixed crew-priority enum with weighted priorities and preset profiles.
- Added assignment stickiness to prevent leave/return oscillation.
- Added retarget-rate diagnostics to quantify thrash.

2. Food-chain reliability:
- Added starvation-aware staffing floors to favor Hydroponics/Kitchen/Cafeteria when meals/raw buffers are low.
- Added food-chain blocked warnings in diagnostics.

3. Visitor variety + feedback:
- Added per-visitor seeded preference jitter (manifest + archetype influenced, not hard-quota split).
- Added service-failure pressure to morale/incident channel.
- Added destination-share metrics for scenario validation.

4. Economy explainability:
- Added `credits/min` gross/payroll/net visibility in panel.
- Added backing metrics and scenario assertions for accounting consistency.

5. Deferred to future workforce phase:
- Per-crew specialized roles (maintenance/cook/cleaner splits and role-locked staffing) remains explicitly deferred and tracked.

## 11. Phase 2.6B - Directional Docking + Core Constraints + Rating Split (Implemented)
Scope added after Phase 2.5 baseline variety:

1. Core + build constraints:
- Added structural core anchor and distance-scaled build costs.
- Added soft connectivity enforcement for new build edits.

2. Directional docking:
- Added explicit dock entities with orientation/lane.
- Added hard placement validation (outer hull + outward facing + clear approach lane).
- Added dock approach preview feedback.

3. Lane traffic + typed ships:
- Added seeded lane profiles by edge.
- Added typed ships (`tourist`, `trader`) assigned by lane profile.
- Added dock type filtering controls.

4. Queue + sentiment split:
- Added dock queue timeout handling.
- Added `stationRating` as visitor/public reputation channel.
- Moved visitor dissatisfaction pressure from morale paths to station-rating pressure.
- Re-scoped morale to crew-only operational condition.

5. Deferred:
- `industrial` and `military` ship types remain deferred.
- Their specialized service chains remain deferred with those types.

## 12. Phase 2.6B Hotfix - Dock Zoning + Dock Config Popup + Sealed Edge Docks (Implemented)
Follow-up usability and stability patch on top of 2.6B:

1. Dock zoning restored:
- Dock entities are zone-backed clusters (not single-tile only).
- Zone area now gates ship-size capacity (`small`/`medium`/`large`).
- One ship occupancy enforced per dock zone.

2. Dock configuration UX:
- Added click-open Dock Config modal.
- Modal controls dock facing, allowed ship types, and allowed ship sizes.
- Size toggles are constrained by zone area capacity.

3. Edge dock pressure behavior:
- Edge dock tiles are treated as pressure-sealed barriers in pressurization flood-fill.
- Docks can remain on hull edges without collapsing station oxygen.

4. Deferred unchanged:
- No new ship families beyond `tourist`/`trader`.
- No new logistics branches or room families in this hotfix.

## 13. Phase 2.6C Hotfix - Crew Staffing Stickiness + Critical Service Floors (Implemented)
Stability patch focused on crew assignment coherence for current scope:

1. Crew anti-thrash:
- Added hard assignment hold windows (`assignmentHoldUntil`) layered over sticky locks.
- Added explicit `assignedSystem` tracking to preserve valid held assignments.
- Reduced avoidable retarget churn under normal load.

2. Critical floor staffing:
- Added non-negotiable staffing floors for life support (low-air) and hydro/kitchen/cafeteria (food starvation).
- Disabled logistics reserve while critical floors are unmet to prevent avoidable idle crew.

3. Activation hysteresis:
- Added deactivation grace (`2.5s`) for critical staffed rooms (LifeSupport/Hydroponics/Kitchen/Cafeteria).
- Prevented false active/inactive flicker caused by transient movement gaps.

4. Diagnostics:
- Added critical staffing drop and unstaffed-duration metrics.
- Exposed compact advanced diagnostics for LS/HY/KI staffing and outage seconds.
- Prioritized critical staffing warnings above generic blocked warnings.

5. Validation:
- Added scenarios/tests for thrash regression guard, life-support floor hold, and activation hysteresis behavior.

## 14. Phase 2.6D - Staffing Control Loop Rework (Capacity-SLO + Utility Scheduler) (Implemented)
Principal-level staffing and dispatch stabilization pass:

1. Capacity-SLO critical staffing:
- Added computed critical capacity targets for Reactor + Life Support and food-chain minimums.
- Scheduler now honors hard minima derived from live demand (not static policy toggles).

2. Duty post model refactor:
- Crew duty posts now come from room clusters across systems.
- Service nodes remain throughput/target inputs for visitors and logistics, not mandatory crew post multipliers.

3. Utility scheduler with bounded preemption:
- Added score-based assignment using priority weights, urgency, diminishing returns, and path cost.
- Added preemption threshold gate and lock-aware retention to avoid pathological churn.
- Preserved emergency wake behavior for low-air conditions.

4. Demand-driven logistics dispatch:
- Removed idle-only logistics gating behavior.
- Added backlog/starvation-driven logistics pressure and dispatch slots.
- Added meal-horizon and stock-target suppression so hauling recedes when meal/kitchen buffers are healthy.

5. Diagnostics truth split:
- Added required/assigned/active critical staffing metrics.
- Added per-system in-transit staff metrics and critical shortfall timers.
- Added warning categorization (`under_capacity`, `no_assigned_staff`, `staff_in_transit`, `no_path`) for clearer debugging.

6. Air/power tuning:
- Increased life-support per-cluster air contribution and passive pressure contribution to reduce artificial collapse at realistic staffing.

7. Validation:
- Added scenarios/tests for critical capacity targets, service-node staffing decoupling, hauling suppression at high stock, high-crew stability, and in-transit diagnostics.

## 15. Phase 3A - Trade Chain Vertical Slice on Medium Logistics Backbone (Implemented)
First content-chain expansion after the staffing control-loop stabilization:

1. New room/module/content:
- Added `Workshop` room and `Workbench` module.
- Added `tradeGood` item flow on the existing medium-depth logistics backbone.

2. Trade chain behavior:
- Workshop converts materials into trade goods when active/staffed/powered.
- Logistics jobs deliver trade goods from workshop service nodes to market targets.
- Market consumes stocked trade goods for higher-value leisure transactions.
- Stockouts now surface as explicit trade-chain strain and rating pressure.

3. Vessel mix expansion:
- Added `industrial` ship type with manifest/lane integration.
- Added dock filtering support for industrial type in dock configuration controls.
- Added per-ship-type throughput metrics (`tourist`/`trader`/`industrial`) and UI summary.

4. Discoverability and diagnostics:
- Added trade-chain metrics in advanced diagnostics (production/use/stock/sold/stockouts).
- Extended room inspector hints with explicit chain guidance:
  - `hydroponics -> kitchen -> cafeteria`
  - `workshop -> market`

5. Deferred from this slice:
- Full multi-branch logistics planner rewrite remains deferred.
- Deeper workshop crafting trees and freight-specialized ship/service families remain deferred to later content phases.

## 16. Future Idea - Module Collision + Access-Tile Interaction (Backlog)
Candidate follow-on once current autonomous-room/logistics chain is stable:

1. Goal:
- Make module footprints optionally block movement (Prison Architect style).
- Shift interactions to explicit access tiles adjacent to modules, instead of standing on module tiles.

2. Why:
- Prevent unrealistic routing through furniture/equipment.
- Make room layout and circulation space materially strategic.
- Create readable bottlenecks around service modules (serving stations, stoves, workbenches, etc.).

3. Proposed data model additions:
- Extend module balance definitions with:
  - `blocksMovement: boolean`
  - `accessMode: 'adjacent' | 'on-tile'`
  - `accessTiles` pattern or simple `requiredAccessSides` metadata
  - Optional `minReachableAccessTiles` for placement validation
- Keep per-module configurability so small fixtures (e.g., sink/shower) can remain pass-through if desired.

4. Pathing/runtime changes:
- Update path neighbor filtering to reject tiles occupied by module footprints where `blocksMovement=true`.
- Keep actor occupancy limits unchanged; this is a geometric/pathability rule, not crowding logic.
- Service-target selection should target module access tiles, not module tiles, when `accessMode='adjacent'`.

5. Placement/build validation changes:
- Add optional validation that at least one required access tile is walkable and reachable from the room door/core path graph.
- Preserve current overlap and room-boundary footprint checks.
- Add clear failure reasons: `no access tile`, `access tile unreachable`, `footprint blocks doorway`.

6. Migration and rollout strategy:
- Stage A: Add schema with defaults (`blocksMovement=false`) to avoid breaking existing layouts.
- Stage B: Enable blocking on selected modules (bed/table/stove/workbench/serving/market stall/storage rack).
- Stage C: Enable strict access validation with inspector hints and scenario updates.

7. Test coverage to add when implemented:
- Pathing cannot route through blocked module footprint tiles.
- Service interactions succeed via valid access tiles.
- Fully packed room with no access corridor becomes inactive or fails placement with explicit reason.
- Existing non-blocking module types continue to function as configured.

## 17. Phase 3B - Berth-Based Docking + Visitor/Resident Population Loop (Implemented)
Resident restoration and berth-purpose docking pass applied on top of directional dock zoning:

1. Locked design implementation:
- Added berth purpose split: `visitor` vs `residential`.
- Scheduled ship traffic + dock queue resolution now route only to `visitor` berths.
- Preserved existing dock size/type acceptance logic and area-based ship-size gating.
- Added room-level housing policy controls for Dorm/Hygiene (`crew`/`visitor`/`resident`/`private_resident`).

2. Ship and population lifecycle:
- Visitors are now origin-ship linked and return to board that ship first.
- Conversion gate runs at boarding time only (no waitlist).
- Conversion requires: free compatible residential berth + valid private resident bed/cabin+hygiene path + roll success.
- Successful conversion changes transient ship into persistent `resident_home` ship relocated to residential berth.
- Resident home ships remain docked until linked resident count reaches zero, then depart and free berth.

3. Resident loop economics and rating:
- Residents now track `satisfaction` and `leaveIntent`.
- Low sustained satisfaction drives resident departure behavior to home ship.
- Added periodic resident tax tick and resident-retention rating bonus.
- Resident departures apply explicit station-rating penalty and free housing assignments.

4. UI/inspection updates:
- Dock modal now includes berth purpose control.
- Room inspector/modal now includes Dorm/Hygiene housing policy controls and private-housing validity hints.
- Sidebar metrics now expose visitor/residential berth occupancy, resident ships, conversion counters, resident departures, resident satisfaction, and resident tax flow.

5. Validation coverage:
- Added deterministic `test:sim` scenarios for:
  - visitor-berth traffic routing vs residential exclusion,
  - conversion blocked without residential berth,
  - conversion blocked without private housing,
  - successful conversion to resident-home ship with assigned housing,
  - resident departure unlinking and resident-home ship berth release.

6. Remaining deferrals after 3B:
- No resident labor/jobs in this slice.
- No conversion waitlist/queue (conversion is opportunistic at board time).
- No forced evictions; departure is satisfaction-driven.
