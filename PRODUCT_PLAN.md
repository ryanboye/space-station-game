# Expanse Station Sim — Product Plan (Requirements Draft)

## 0) Current Execution Status
*Last updated: 2026-04-22 15:59Z by tinyclaw. Live playtest build: <https://bmo.ryanboye.com/spacegame/> @ main `00d9a35`.*

### Current milestone
**M1 Unlock Progression v1 + Tutorial Onboarding — shipped.** Six-tier predicate advance live end-to-end. T0→T1 now fires on first-visitor-arrives (was blocked by missing food infra in starter state), quest bar pinned at top of sidebar reads the live `PROGRESSION_TOOLTIP_COPY` + `.progress()` each tick, pre-placed east-hull dock on fresh start.

### Lanes (active bots)
- **tinyclaw** — project management, sim data + state transitions, sprite generation via pixellab + nano-banana.
- **seb** — render integration, deploy ops, sprite packing. Full pipeline ownership on the render side.
- **BMO** (awfml's bot) — spec + PR review + deploy coordination + mechanics-reference docs + morning-status writeups.
- **barnacle** (barn's bot) — harness scenarios + per-tier unlock smoke tests + QA diagnostics.

### Shipped — merged overnight 2026-04-21/22
| PR | Commit | What |
|----|--------|------|
| #3 | `046015d` | systemd pull-and-build deploy wiring → `bmo.ryanboye.com/spacegame/` |
| #5 | `93a0cd6` | unlocks v2 scaffold — 6-tier shape + trigger predicate interface + lifetime counter stubs |
| #6 | `3e519bd` | wire `creditsEarnedLifetime` + `incidentsResolvedLifetime` increment sites |
| #7 | `bb49e62` | progression UI render primitives (`data-progression-state` attr, tooltip singleton, tier-flash overlay) |
| #8 | `7607531` | deploy v1.1 — `build.sh` force-on-empty + README ProtectHome + ReadWritePaths notes |
| #9 | `1edd242` | predicate-driven tier advance — loop over `UNLOCK_DEFINITIONS.trigger.predicate` + `archetypesServedLifetime` |
| #10 | `dd7c7ad` | `tradeCyclesCompletedLifetime` increment at workshop→market sale |
| #11 | `323ac8c` | phase-2 wiring — progression UI reads live `UnlockState`, flash fires on advance |
| #12 | `864fb02` | S2 — status line uses `PROGRESSION_TOOLTIP_COPY` not legacy `UNLOCK_CRITERIA` |
| #13 | `b1db92f` | 6 nano-banana tier-unlock icons (`icon.tier1_unlock` … `icon.tier6_unlock`) |
| #14 | `2b72dfe` | S1 — Build & Room Legend auto-expands at tiers 0–2 |
| #15 | `342af5f` | S2.1 — progression modal header uses new copy |
| #16 | `4f21474` | S2.2 — modal tier-cards "Unlock Requirement" copy aligned |
| #17 | `ad0bf7a` | docs — Section 0 current execution status for bot-swarm coordination |
| #18 | `fc6aee7` | hygiene — gitignore `tools/sprites/out/processed/` + untrack 73 intermediates |
| #20 | `d9fa188` | onboarding — pre-place 2-tile visitor dock on fresh start (east hull) |
| #21 | `dbc2272` | render/progression — quest bar pinned sidebar strip ("what do I do now") |
| #22 | `00d9a35` | progression — T0→T1 fires on first-visitor-arrives + 5 stale copy sites swept |

### Open PRs
- **#4** `feat(harness): Harness v1.0 — Playwright runner + window hooks + CI advisory` (barnacle).
  Waiting on awfml's one-click merge. BMO's PAT lacks `workflow` scope to self-merge workflow-touching PRs.
- **#19** `test(harness): agent-movement spec — catches sim-freeze bugs` (tinyclaw).
  Depends on harness window hooks from #4; unblocks when #4 merges.
- **#2** `feat: atlas-preview.html — debug-oriented sprite atlas inspector` (tinyclaw).
  Static debug page, ready for merge when someone picks it up. Non-blocking.

### Backlog (priority-ordered)
1. **Phase 5 counter wiring** (blocked on Phase 5 producer events): `actorsTreatedLifetime` + `residentsConvertedLifetime` — placeholder wiring useless until treatment + conversion sites exist in `sim.ts`.
2. **Dead UNLOCK_CRITERIA cleanup** — `tierRequirementText()` + `tierProgressSnapshot()` in `main.ts:945-1000` are legacy fallbacks unreachable via the `PROGRESSION_TOOLTIP_COPY` chain. Delete as a separate hygiene PR. Review-B on #22 flagged but intentionally deferred.
3. **Phase 5 / Health + Morgue mechanics reference doc** (BMO's lane, parked by the tutorial pivot).
4. **Sprite polish** — regen modules/agents where current nano-banana outputs are weakest; consider pixellab rotate for 4/8-direction agent sprites.
5. **gpt-image-2 / Nano Banana Pro evaluation** — seb has pricing ($0.063/image HD vs $0.015 for Nano Banana Pro vs $0.04 current Imagen-4). Potential atlas rebuild. Sam parked the OpenRouter wire-up for later; revisit when she's ready.
6. **Tutorial first-playable polish (round 2)** — quest bar + T0 predicate + pre-placed dock shipped. Next round depends on live playtest feedback from awfml.

### Risks / open questions
- Phase 5 (health/death/morgue) scoped but not built. Unlocks v2 has placeholder predicates for T5 that won't fire until Phase 5 lands.
- T6 specialization predicate is intentionally a no-op until we decide how "tutorial complete" gates. Ship this decision before ~week 2 of playtesting.
- `tools/sprites/out/processed/` tracked in git produces sprawling diffs on every sprite regen. Hygiene PR will fix, but until then PR diffs look scary.
- No visual regression baseline yet. barnacle's harness v1.0 has the hooks; the baseline screenshot step is v1.1.

### Ritual
Before merging ANY PR touching `src/sim/` or `src/render/`: 4 parallel agents — 2 × `/simplify` + 2 × `/review`. Pure-docs PRs ≤ 50 lines can merge without the ritual. All render-touching PRs attach a Playwright smoke screenshot to the PR body.

---

## 1) Purpose
Translate the Vision Draft into implementable product requirements with explicit system behavior, player-facing outcomes, and measurable success criteria.

This document defines:
- What systems must exist and how they interrelate.
- How those systems produce tension and meaningful decisions.
- What “good” looks like in playtests.
- Open decisions requiring founder direction.

## 2) Product Goals
1. Deliver a true colony simulation loop (not a routing toy).
2. Make every major room type mechanically consequential.
3. Create recoverable failure cascades from design bottlenecks.
4. Preserve readability while adding depth.
5. Maintain web MVP performance and iteration speed.

## 3) Current Baseline (Code Reality)
The current build already includes:
- Grid construction, zones, room painting, pressurization.
- Visitors, residents, crew agents with pathing.
- Docked ship traffic with berth purpose split (`visitor` vs `residential`) and throughput stats.
- Food chain (hydroponics -> meals -> cafeteria consumption).
- Room activation checks (door, pressure, staff).
- Economy loop (credits/materials, market buy/sell, payroll/hiring).
- Crew priority selector and room diagnostic hover.

Primary gaps vs vision:
- No furniture/modules as activation requirements.
- No explicit itemized logistics entities (mostly aggregate stocks).
- No med/death/morgue chain.
- No crime/response pipeline beyond incidents counter.
- No market hall/workshop production loops.
- Pathing still too uniform/robotic under crowd stress.

## 3.1 Gameplay Loop Rebaseline (2026-02)
Roadmap focus is now explicitly aligned to the core loop:
- Ship variety and differentiated service demand.
- Resident daily-life depth with lightweight role effects.
- Staged unlock progression to prevent early overload.

Execution milestones:
1. M0 Interface Freeze + Planning Rebaseline:
- Lock data extension points in `src/sim/content/*`.
- Keep feature work behind flags (`ENABLE_UNLOCKS_V1`, `ENABLE_SHIP_PACK_V1`, `ENABLE_RESIDENT_ROUTINES_V2`).

2. M1 Unlock Progression v1:
- Tier 0 start: Reactor, Life Support, Dorm, Hygiene, Hydroponics, Kitchen, Cafeteria, Dock.
- Tier 1: Lounge + Market.
- Tier 2: Logistics Stock + Storage + Workshop.
- Tier 3: Security tuning + advanced ships + resident role depth.

3. M2 Ship Pack 1:
- Add `military` and `colonist` ship families with data-driven service tags and distinct penalties/conversion behavior.

4. M3 Resident Routine v2:
- Expand routine phases to `rest`, `errands`, `work`, `socialize`, `winddown`.
- Add roles: `market_helper`, `hydro_assist`, `civic_watch`.

5. M4 Room/Building Pack 1:
- Add `Clinic` + `MedBed`, `Brig` + `CellConsole`, `RecHall` + `RecUnit`.
- Wire to ship service tags and resident routine targets.

6. M5 Integration + Balance:
- Tune the first 20-minute complexity curve.
- Ensure lock/unmet-service messaging is legible and actionable.

Parallel art track (Nano Banana):
- Maintain a stable sprite-key contract and marker fallback.
- Integrate final atlas after gameplay-loop balance stabilization.

## 4) Design Constraints
- Platform: browser, canvas, GitHub Pages compatible.
- Visual style: simple tile-based, readability-first.
- Deterministic enough for debugging.
- Must avoid random punishment not tied to system state.

## 5) System Requirements

### 5.1 People Simulation
Actors:
- Crew: hired workers with roles, wages, rest/hygiene/meal needs.
- Residents: persistent population created via visitor conversion, tied to resident home ships and private housing.
- Visitors: transient demand spikes tied to ship traffic and visitor berths.
- Bodies/Patients/Detainees: non-standard entities for consequence loops.

Required behaviors:
- Needs degrade over time.
- Needs restoration requires physically reaching valid service locations.
- Actors have fallback behaviors when services unavailable.
- Extended unmet needs generate predictable consequences.
- Visitors can convert to residents at boarding time only when residential berth + private housing are currently available.
- Residents can later choose to leave when satisfaction remains low, freeing housing and resident berth capacity.

Acceptance criteria:
- In a station with functioning food/rest/hygiene, needs remain stable.
- Removing one service causes measurable degradation in relevant needs.
- Long unmet needs create incidents or mortality with visible warning.

### 5.2 Utilities
Core utilities:
- Power supply vs demand.
- Atmosphere production/distribution/leakage.
- Water supply/recycling.

Rules:
- Utilities are consumed by rooms and people.
- Utility deficits directly reduce room functionality before global collapse.
- Atmosphere must be local-network aware (not just one global value).

Acceptance criteria:
- Utility outage disables dependent systems in readable order.
- Player can restore utility and observe system recovery.

### 5.3 Food & Hospitality Chain
Required chain:
1. Hydroponics produces raw food.
2. Kitchen converts raw food to meals.
3. Cafeteria serves meals.
4. Visitors/residents consume meals physically.

Operational requirements:
- Kitchen and cafeteria require staffing.
- Queue spots and service spots are separate.
- Meal supply bottlenecks should manifest as visible queue pressure.

Acceptance criteria:
- Each link can bottleneck independently and be diagnosed.
- Throughput increases from adding staff/space/layout improvements.

### 5.4 Crew Quarters & Hiring Gate
Crew quarters include:
- Dorm beds (capacity gate).
- Hygiene access.
- Optional rest/recreation quality modifiers.

Rules:
- Cannot hire if no valid bed capacity.
- Crew efficiency scales with rest/hygiene health.
- Private zone violations increase incident risk.

Acceptance criteria:
- Hiring button disabled or fails with clear reason if no capacity.
- Under-provisioned quarters measurably reduce output.

### 5.5 Security & Incident Pipeline
Incident types:
- Theft, fights, trespass, vandalism (later: contraband).

Pipeline:
- Detect -> dispatch -> intervene -> resolve (warn/detain/treat).

System dependencies:
- Security office staffing and coverage radius.
- Response time influenced by distance/path congestion.
- Brig and medbay integrate into resolution outcomes.

Acceptance criteria:
- In low coverage, incidents last longer and cause larger penalties.
- Adding staffed security improves response and lowers unresolved incidents.

### 5.6 Health, Death, Morgue
Health events:
- Injury from fights/system stress.
- Illness from hygiene/sanitation collapse.
- Asphyxiation from oxygen deficit.

Rules:
- Death produces body entity.
- Body requires porter transport to morgue.
- Morgue overflow creates escalating penalties (morale/disease).

Acceptance criteria:
- Death chain is physically represented and recoverable.
- Ignoring bodies has visible compounding consequences.

### 5.7 Logistics & Items
Move from pure aggregate to hybrid model:
- Keep strategic aggregates for simplicity.
- Add explicit item jobs for critical chains (meals, medical, bodies, goods).

Required logistics features:
- Pickup/dropoff tasks with assignment.
- Storage buffers by item type.
- Transport latency affected by distance and congestion.

Acceptance criteria:
- Adding nearer storage reduces service delay.
- Hauler shortage visibly starves downstream rooms.

### 5.8 Economy & Trade
Revenue streams:
- Visitor meal/tax capture.
- Market hall transactions.
- Workshop goods sold to market/contracts.

Costs:
- Payroll, imports, maintenance, utility overhead, incident damages.

Rules:
- Economy must support early stabilization and mid-game specialization.
- Prices can fluctuate, but should remain legible and fair.
- Credit starvation should be recoverable with deliberate sacrifice/tradeoffs.

Acceptance criteria:
- Early game avoids immediate death spiral under normal play.
- Mid-game requires active optimization, not passive surplus.

### 5.9 Rooms & Modules (Furniture)
Room paint defines intent; modules define functionality.

Required module set (first implementation target):
- Dorm: Bed
- Kitchen: Stove + Prep
- Cafeteria: Table
- Hydroponics: Grow Tray
- Security: Terminal
- Medbay: Med Bed
- Workshop: Workbench
- Market: Stall

Rules:
- Room shows “inactive reason” if module requirements unmet.
- Module placement must be readable without high-fidelity art.

Acceptance criteria:
- Player can diagnose inactive room in <5 seconds using UI cues.
- Module placement materially changes throughput.

### 5.10 Pathing & Movement
Target behavior:
- Less robotic flow, fewer deadlocks, readable crowd behavior.

Requirements:
- Dynamic movement costs for congestion and unsafe routes.
- Reservation-aware service entry.
- Stuck detection and recovery.
- Role-aware routing policy (visitor vs crew vs security).
- Slight per-agent speed variance and movement jitter.

Acceptance criteria:
- No persistent clumps in healthy layouts.
- Stuck agents self-recover without manual reset.
- Equivalent routes distribute traffic over time.

### 5.11 UX, Telemetry, and Explainability
Required player-facing diagnostics:
- Per-system health lines: food, water, oxygen, power, security, health, economy.
- Root-cause messaging (“Kitchen inactive: no stove/no staff/no power”).
- Throughput stats (queues, wait times, exits/min, conversion rates).
- Overlay toggles (zones, congestion, oxygen risk, security coverage).

Acceptance criteria:
- Most failures can be traced by a first-time player without external docs.

### 5.12 Zoning and Access Control
Zone types:
- Public, Private, Staff-Only, Secure, Quarantine.

Rules:
- Visitors default to Public-only routing.
- Crew can traverse Staff-Only/Secure.
- Private/secure trespass raises incident chance and security demand.
- Access policies must be enforceable at door/path level.

Acceptance criteria:
- Changing zone policy measurably changes pathing behavior.
- Trespass incidents are traceable to zone/access mistakes.

### 5.13 Station Identity and Specialization
Supported identity tracks:
- Trade Hub, Habitat, Security Outpost, Frontier Survival.

Rules:
- Identities are strategic emphasis, not hard classes.
- Each identity affects contracts, visitors, demand mix, and bonuses.
- Players can pivot identity at cost (time/credits/disruption).

Acceptance criteria:
- Two different identities produce clearly different optimal builds.
- Identity bonuses are meaningful but do not hard-lock viability.

### 5.14 Reputation and Demand
Reputation drivers:
- Service quality, safety, throughput reliability, incident rate, mortality.

Effects:
- Visitor volume and composition.
- Contract quality.
- Market demand multipliers.

Acceptance criteria:
- Improving operations increases demand/revenue over time.
- Operational neglect lowers demand in a legible way.

### 5.15 Failure and Recovery Model
Failure policy:
- Soft-fail only for current product phase.
- No forced game-over screen.

Recovery levers:
- Emergency imports.
- Priority overrides.
- Intake throttling.
- Temporary room shutdowns.
- Zone rerouting.

Acceptance criteria:
- A deeply failing station can recover through player action.
- Recovery is costly and slower than prevention.

### 5.16 Content Unlock and Complexity Curve
Progression goals:
- Early game: stable essentials and simple chains.
- Mid game: logistics and staffing bottlenecks.
- Late game: cascading inter-system tradeoffs.

Rules:
- New systems unlock by station maturity and prerequisite infrastructure.
- Unlock pacing must not overwhelm UI clarity.

Acceptance criteria:
- First 10 minutes are learnable without external docs.
- Complexity growth is felt as new decision types, not only larger numbers.

### 5.17 Art/Furniture Delivery Requirements
Art strategy:
- Marker-first modules (letter/icon plates) are mandatory fallback.
- Placeholder sprite atlas supported via stable module IDs.
- Final art swap requires no simulation logic changes.

Acceptance criteria:
- All critical modules are readable without custom art.
- Placeholder/final sprite swaps do not break save/state compatibility.

### 5.18 AI/Pathing Delivery Requirements
Pathing requirements:
- Queue and service spots separated for all service rooms.
- Dynamic congestion-aware tile costing.
- Stuck detection and self-recovery.
- Role-aware routing policy (visitor/crew/security).
- Slight movement variance to avoid robotic lockstep.

Acceptance criteria:
- No persistent deadlock in 20-minute soak tests at 2x speed.
- Crowd flow uses multiple equivalent corridors when available.
- Service doorway clumping is greatly reduced in healthy layouts.

### 5.19 Berth-Based Docking + Resident Conversion Loop
Dock model:
- Docks are zoned berths that can be open-ended edge pockets.
- Berths are purpose-tagged as `visitor` or `residential`.
- Scheduled arrivals and queue resolution target `visitor` berths only.
- Ship size/type acceptance remains controlled by existing dock filters and berth area.

Population loop:
1. Transient ships dock at visitor berths, unload visitors, and eventually board departures.
2. On boarding, a low-probability conversion check can move eligible visitors into residents.
3. Conversion succeeds only if a compatible free residential berth and valid private resident housing assignment exist.
4. Successful conversion relocates the ship to a residential berth as a persistent resident home ship.
5. Resident home ships remain until all linked residents depart.

Housing and policy:
- Dorm/Hygiene rooms require room-level housing policy support for `crew`/`visitor`/`resident`/`private_resident`.
- Private resident assignments require explicit bed + cabin allocation and reachable resident/private hygiene support.

Economy and reputation:
- Residents pay periodic taxes and consume station services.
- Resident retention adds a small rating bonus.
- Resident departures apply a station-rating penalty and free assigned housing.

## 6) Content Scope (Ideal State)
Target room set in ideal-state design:
- Dock, Cargo Bay, Storage, Hydroponics, Kitchen, Cafeteria, Dormitory, Hygiene, Life Support, Oxygen Plant, Water Recycler, Reactor, Battery Room, Security Office, Brig, Medbay, Morgue, Market Hall, Workshop, Recreation.

## 7) Success Metrics (Playtest KPIs)
Primary:
- Session length median > 20 min in internal playtests.
- First failure understood by player (self-reported) > 80%.
- Recovery success from first major cascade > 60%.
- Distinct viable station layouts observed in test runs.

Balance targets:
- Early game: stable with mild optimization pressure.
- Mid game: regular bottlenecks requiring prioritization.
- Late game: cascading fragility unless systemized expansion.

## 8) Quality Bar (Release Gate for “Phase 2 Foundation”)
Must pass:
1. Core chains functional (food, utility, staffing, economy).
2. At least 8 meaningful room types beyond floor/wall/door/dock.
3. Furniture/module gating operational for critical rooms.
4. No hard deadlock states in 20-minute soak at 2x speed.
5. Diagnostics explain top 5 failure causes clearly.

## 9) Risks and Mitigations
Risk: System complexity outpaces clarity.  
Mitigation: Add explicit root-cause UI and staged unlocks.

Risk: Pathing cost explodes with many agents.  
Mitigation: Hybrid pathing cadence, cache, local avoidance.

Risk: Economy becomes punishing/unrecoverable.  
Mitigation: Emergency levers (imports, policy throttle, temporary closures).

Risk: Furniture creates visual clutter.  
Mitigation: marker-first fallback + clear overlays.

## 10) Post-Decision Deliverables
With decisions locked:
- phased implementation plan with scoped milestones.
- data schema spec (rooms/modules/items/jobs/modules).
- tuning sheet for economy and need decay constants.

## 11) Founder Decisions (Locked v1.0)
Confirmed decisions from founder:
1. First milestone fantasy: Trade Hub + Habitat (hybrid focus).
2. Residents convert from visitors only when a residential berth + private housing are available at boarding time.
3. Oxygen failure pacing: slow emergency window.
4. Furniture depth next phase: minimum viable required modules only.
5. Economy pressure: forgiving.
6. Crime pressure: starts light, scales harder over time.
7. Crew control depth: global priorities for now.
8. Fail-state philosophy: soft fail only (no hard fail screen yet).
9. Named individual character identity can be deferred (aggregate agents for now).
10. Reputation/faction flavor will be generic aggregate metrics for now.
11. Death/morgue presentation will be abstract for current phase.
12. First polished milestone target loop length: 20-minute target loop.

## 12) Additional Decisions (Now Resolved)
1. Logistics simulation depth: Hybrid.
- Keep broad resource pools aggregate for simplicity.
- Make critical chains physical jobs/entities:
  - meals
  - medical supplies
  - bodies
  - trade goods

2. Market Hall role: Optional specialization.
- Core station survival is possible without market hall.
- Market hall is a high-upside economic branch for trade-focused stations.

3. Ship traffic control model: Policy-driven baseline with bounded exogenous variance.
- Player directly controls average intake (`ships per cycle` policy).
- System injects bounded variation in ship size/passenger mix and occasional demand spikes.
- Goal: preserve agency while still stress-testing station robustness.

## 13) Milestone Loop Length Definition
“Milestone loop length” means how long one satisfying run should feel before the player has:
1) built a functional station,
2) hit one meaningful bottleneck/cascade,
3) stabilized or pivoted strategy.

Locked for first polished milestone: 20-minute target loop.
- Short enough for rapid iteration and replay.
- Long enough for at least one full build -> stress -> recovery arc.

## 14) Vision Coverage Checklist (Requirements Completeness)
This checklist maps Vision Draft areas to explicit requirement coverage in this plan.

1. Vision/Pillars -> Sections 2, 4, 5.15, 5.16
2. Core loop -> Sections 2, 3, 5.1–5.9
3. Simulation layers -> Sections 5.1–5.18
4. Population management -> Sections 5.1, 5.4, 5.6
5. Needs/consequences -> Sections 5.1, 5.6, 5.15
6. Room/building network -> Sections 5.2–5.9, 6
7. Furniture/modules -> Sections 5.9, 5.17
8. Logistics economy chains -> Sections 5.3, 5.7, 5.8
9. Crew roles/priorities -> Sections 5.1, 5.10
10. Security pipeline -> Section 5.5
11. Atmosphere/survival -> Sections 5.2, 5.6
12. Zoning/access -> Section 5.12
13. Economy/demand -> Sections 5.8, 5.14
14. Station identities -> Section 5.13
15. Failure cascades/recovery -> Section 5.15
16. Information design -> Section 5.11
17. AI behavior targets -> Section 5.18
18. Win/lose philosophy -> Section 5.15
19. Art/sprite plan -> Section 5.17

## 15) Immediate Next Step
With decisions now locked, next deliverable is:
- phased implementation roadmap with milestone order, dependencies, and DoD per phase.

## 16) Stabilization Milestone Baseline (Implemented)
Before adding new room/layer branches, the project now carries a stabilization baseline focused on clarity + core balance:
1. Panel clarity:
- Agent role legend (visitor/resident/crew).
- Room usage, crew status breakdown, idle reason histogram, stalled job reasons.
- Morale top contributors and room warning aggregation.

2. Air credibility:
- Deterministic low-air progression (`healthy -> distressed -> critical -> death`) with recovery window when air is restored early.
- Deaths are visible in metrics (`deaths`, `recent deaths`, `body count`) and on-map resident state tinting.

3. Utility observability:
- Room usage throughput fields (`dorm/hygiene/meals per min`) and failed need-attempt counters.
- Jobs visibility expanded (`oldest pending age`, `stalled jobs`, `stall reason mix`).

4. Test coverage additions:
- Air collapse deterministic deterioration/death scenario.
- Air recovery window scenario.
- Room usage and diagnostics assertions integrated into `test:sim`.
