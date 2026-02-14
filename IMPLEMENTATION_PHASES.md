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

Key gaps against vision/product plan:
- No module/furniture requirements.
- No generalized item/job logistics backbone (food hauling is ad hoc).
- No health/death/morgue chain.
- No detect-dispatch-resolve security pipeline.
- No workshop/market specialization loop.
- Pathing lacks reservation/congestion sophistication and recovery behaviors.

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
- Bed, Stove, Prep, Table, GrowTray, Terminal, MedBed, Workbench, Stall.

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
