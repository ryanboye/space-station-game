# 21 Job System And Command Progression Cleanup Plan

Last updated: 2026-05-03

Status: proposed cleanup roadmap. Use this as an implementation checklist: check off items as they land, add dated notes under each checkpoint, and keep testing notes honest. This plan is about reconciling systems that already exist, not adding a large new fantasy layer.

## Goal

Finish the migration from the old crew room-post model to the new role/lane/job-board model, and reconcile the old tier progression with the newer Command/Specialty/Officer system.

The target outcome:

- Jobs are the single source of truth for work.
- Staff roles have visible, concrete gameplay effects.
- Old room staffing/post concepts stop leaking into UI and diagnostics.
- Tiers become internal pacing/save scaffolding, or a clearly subordinate maturity layer.
- Specialties, departments, officers, and bridge terminals become the player-facing progression model.
- The player can understand why work is or is not happening.

## Source Plans Reconciled

This plan is a cleanup and integration pass across the existing roadmap/spec docs. It does not replace them.

Primary source plans:

- `docs/16-roadmap-part-1-living-actors-jobs.md`
  - establishes object interactions, reservations, provider models, batched logistics, and living actors as the foundation.
- `docs/19-entropy-drift-seeded-build-pressure.md`
  - frames the broader thesis: stations should drift from use, map seeds should create build pressure, and every penalty needs a visible cause and fix.
- `docs/19-1-sanitation-cleaning-loop.md`
  - defines dirt, sanitation jobs, grime visuals, cleaning overlays, and "use creates mess" as the first entropy slice.
- `docs/19-2-maintenance-debris-and-eva-repair.md`
  - extends utility repair into station-wide wear, debris-risk conditions, exterior hull/dock/berth repair, and EVA work.
- `docs/19-3-sunlight-shade-thermal-air.md`
  - adds deterministic sunlight/shadow, thermal/stale-air pressure, life-support/vent implications, and map-condition readability.
- `docs/19-4-shared-drift-spine-and-rollout.md`
  - defines the shared vocabulary: Condition, Drift, Source, Effect, Fix; also calls out job-volume controls and consistent overlay/inspector language.
- `docs/20-command-staff-tech-tree.md`
  - defines the player-facing command model: specialties, departments, officers, terminals, and staff roles.
- `docs/20-1-specialty-progression-reconciliation.md`
  - tracks the first correction pass where the specialty UI replaced the old tier roadmap in player-facing surfaces.

The key synthesis:

- The job-board/lane system should be the work spine for Part 1 and for all `19-*` entropy systems.
- The shared drift vocabulary should become the diagnostic language for job blockers too: condition, drift, source, effect, fix.
- Departments/officers should not be bolted onto jobs as a second dispatcher. They should gate advanced policies, specialist hiring, diagnostics, and automation.
- Sanitation, maintenance, and thermal work should publish normal jobs with volume caps and blocked reasons, not special invisible room-state logic.
- The old tier system should not compete with Specialties, but old tier state can remain for save compatibility and broad station maturity gates.

## Current Diagnosis

The new job system is partially real:

- Jobs are queued for food, cooking, trade goods, supplies, construction, repair, incidents, and sanitation.
- Jobs map to work lanes: food, sanitation, engineering, logistics, construction/EVA, and flex.
- Staff roles map to home lanes and fallback rules.
- The dispatcher assigns idle crew by lane pressure, suitability, pathing, age, and job priority.

But the old system is not fully gone:

- `assignCrewJobs()` still contains the old room/system post allocator.
- `clearLegacyCrewPostAssignments()` runs every tick to wipe old non-security room posts.
- `CrewRole`, `assignedSystem`, `lastSystem`, and critical-staff metrics still describe the old mental model.
- `computeCriticalCapacityTargets()` returns zeroes, leaving several "critical staffing" surfaces as dead scaffolding.
- Room activity mostly no longer requires staff, but diagnostics still imply staffing can be the primary issue.

The progression system is similarly split:

- `UNLOCK_DEFINITIONS`, `ROOM_UNLOCK_TIER`, and `MODULE_UNLOCK_TIER` still gate actual build content.
- `SPECIALTY_DEFINITIONS`, officers, branch progress, and `StaffRole.requiresSpecialty` gate staff hiring and the specialty UI.
- `SpecialtyDefinition.unlockTier` and `unlocksModules` are mostly descriptive rather than authoritative.
- Specialty completion does not consistently control room/module availability.
- The player can see a department/specialty model while build locks still come from the old tier model.

The `19-*` entropy specs reveal one more risk:

- New drift systems can easily flood the job board if each slice creates its own job/alert pattern.
- The cleanup pass must provide shared producer contracts, volume caps, and diagnostics before sanitation, maintenance, and thermal pressure all scale up together.

## Design Decision

Keep the job-board/lane dispatcher. Remove the old post system as gameplay.

Keep tiers only as station maturity/save-compatibility scaffolding unless we deliberately preserve them as a secondary internal pacing signal. The player-facing progression should be:

1. Station maturity gates broad eras of play.
2. Specialties are the player choice layer.
3. Departments own related systems.
4. Officers and terminals make departments physically present.
5. Staff roles execute work through the job board.

For entropy/drift features, use the shared language from `19-4`:

`Condition -> Drift -> Source -> Effect -> Fix`

Examples:

- `Dirty cafeteria -> sanitation 72 -> meals + queue traffic -> visitor status penalty -> clean, add tables, widen route`
- `Debris-exposed berth -> wear 68 -> debris lane + ship traffic -> slower docking -> EVA repair, add airlock, move berth`
- `Bright sun -> heat 61 -> sunlight + kitchen load -> comfort/work-speed pressure -> insulation, vent, shade-side expansion`

## Phase 1 - Job System Ownership Cleanup

Purpose: make jobs the clear authority for work and remove old room-post confusion.

- [ ] Confirm `assignCrewJobs()` is unused in runtime and tests.
- [ ] Delete or quarantine `assignCrewJobs()` behind a legacy-only comment/test fixture if removal is risky.
- [ ] Remove non-security room-post concepts from normal crew diagnostics.
- [ ] Rename or retire old metrics that imply passive staffing:
  - `assignedCriticalStaff`
  - `activeCriticalStaff`
  - `staffInTransitBySystem`
  - `criticalShortfallSec` for hydro/kitchen/cafeteria
- [ ] Keep room active/inactive diagnostics focused on actual room requirements:
  - layout
  - modules
  - pressure/air
  - pathing
  - stock/input/output
  - department/power/utility dependencies later
- [ ] Keep security responder positioning only if it is a real patrol/incident system, not generic "staff room" behavior.
- [ ] Update crew inspector copy:
  - show `staffRole`
  - show `workLane`
  - show `activeJobId`
  - show job type/item/target
  - show why idle: no jobs, no path, needs, reserved for command, resting
- [ ] Update Station Ops job copy so it no longer talks about room staffing unless the system genuinely requires it.
- [ ] Align inspector/job language with the shared drift vocabulary where applicable:
  - condition
  - drift
  - source
  - effect
  - fix

### Checkpoint 1 Tests

- [ ] `npm run test:sim`
- [ ] `npm run build`
- [ ] Browser: hire cooks, botanists, assistants, janitors; verify selected actors show role, lane, job, and idle reason.
- [ ] Browser: low food should create food jobs, not "staff kitchen" states.
- [ ] Browser: no confusing "critical staffing" warning for kitchen/hydro/cafeteria when the issue is stock, pathing, or no jobs.

## Phase 2 - Job Producers And Blocked-Reason Contracts

Purpose: every system that needs work should publish explicit jobs with clear blocked reasons.

- [ ] Document job producer responsibilities:
  - producer decides whether work is needed
  - producer creates one or more jobs
  - producer sets source/target/item/work requirements
  - producer records blocked reason if no job can be created
- [ ] Split job creation helpers conceptually by domain, even if they remain in `sim.ts` initially:
  - food transport
  - cooking
  - raw supplies
  - workshop/market trade goods
  - repair
  - sanitation
  - construction/EVA
  - incidents/security
- [ ] Add a compact sim-side diagnostics structure for each chain:
  - needed
  - job open
  - blocked because no source
  - blocked because no target capacity
  - blocked because no path
  - blocked because no eligible worker
  - blocked because department inactive
- [ ] Add shared job-volume controls from `19-4`:
  - coalesce jobs by patch, room anchor, module, hull sector, or dock/berth anchor
  - cap open jobs by domain
  - use spawn/complete hysteresis so jobs do not flicker
  - suppress duplicates for the same target
  - expose top backlog reason in Jobs/Ops
- [ ] Remove duplicate producer calls or duplicate target logic where present.
- [ ] Ensure intake/storage/workshop/hydroponics can all source supplies using one consistent source-selection helper.
- [ ] Ensure food jobs do not disappear silently when kitchen/cafeteria demand exists.
- [ ] Ensure stale jobs return to pending with useful stall reasons and do not strand workers.
- [ ] Ensure drift systems use the same producer contract:
  - sanitation dirt creates sanitize jobs
  - maintenance wear creates repair jobs
  - exterior wear creates EVA repair jobs
  - thermal/stale-air creates warnings or maintenance/cooling jobs only when the player has a response

### Checkpoint 2 Tests

- [ ] Sim test: food chain creates rawMeal, cook, and meal delivery jobs with blocked reasons when each leg is impossible.
- [ ] Sim test: workshop-to-market chain diagnoses no source, no market capacity, no worker, and no path.
- [ ] Sim test: supplies can source from intake and storage consistently.
- [ ] Sim test: sanitation/maintenance job caps prevent a medium station from flooding the job queue.
- [ ] Browser: diagnostics panel can tell whether a chain has no job, blocked job, assigned job, or completed throughput.

## Phase 3 - Staff Roles Become Real Gameplay

Purpose: roles should not be cosmetic lane labels.

- [ ] Define a small, concrete role-effect table.
- [ ] Cook:
  - prefers cook jobs and meal delivery
  - cooks faster than assistants
  - improves kitchen throughput diagnostics
- [ ] Botanist:
  - prefers hydroponics supply/rawMeal work
  - improves hydroponics output or supply efficiency
- [ ] Assistant:
  - broad fallback
  - lower specialist speed
  - good for generic logistics and overflow
- [ ] Janitor:
  - prefers sanitation jobs
  - cleans faster and/or larger dirt patches
  - remains an unlocked specialization; the base sanitation loop should still work with assistants as described in `19-1`
- [ ] Technician/Engineer:
  - prefer repair/maintenance jobs
  - consume/benefit from repair supplies more effectively
  - become the natural bridge into the broader maintenance/EVA spec in `19-2`
- [ ] Security Guard:
  - responds to incidents and patrol jobs
  - does not masquerade as generic engineering unless needed
- [ ] Doctor:
  - handles clinic/patient jobs once medical loops are active
- [ ] Captain/officers:
  - command/department work, not ordinary hauling unless emergency/fallback rules explicitly allow it
- [ ] Surface role effects in the Crew panel and inspector with short, concrete text.
- [ ] Keep hidden/deferred roles hidden until they have distinct effects.
- [ ] Preserve `19-*` v1 principle: core systems should be operable by generalists before a specialist is required, but specialists should make the solution better and more legible.

### Checkpoint 3 Tests

- [ ] Sim test: cook completes a stove job faster than assistant under the same conditions.
- [ ] Sim test: janitor cleans faster than assistant.
- [ ] Sim test: technician/engineer improves repair completion.
- [ ] Sim test: officers are not assigned ordinary logistics unless explicitly allowed.
- [ ] Browser: hiring a specialist creates visible behavior difference within one or two sim minutes.

## Phase 4 - Department State As The Integration Layer

Purpose: replace loose specialty/officer checks with a single department-state model.

- [ ] Add derived department state:
  - department id
  - specialty id
  - officer role
  - required terminal
  - officer hired
  - terminal built
  - bridge active
  - officer can reach terminal
  - active/inactive
  - inactive reason
- [ ] Make department state read-only derived data at first.
- [ ] Add department state to save migration only if necessary; prefer deriving it from existing state.
- [ ] Use department state in UI:
  - Specialties panel
  - Crew panel
  - build lock text
  - relevant overlays/panels
- [ ] Use department state in sim only where it already has a game manifestation:
  - advanced hiring
  - advanced diagnostics
  - automation/policies
  - later advanced job producers
- [ ] Do not hard-disable basic survival loops when a department is inactive.
- [ ] Map departments to the planned drift systems:
  - Sanitation department: sanitation policies, janitor hiring, sanitation overlay depth, cleaning diagnostics
  - Mechanical/Engineering department: maintenance policy, repair diagnostics, engineer/technician hiring, future EVA repair support
  - Navigation department: traffic/docking policy, later berth/debris routing context
  - Industrial department: workshop/market production policy and supply planning
  - Medical/Security departments: patient and incident response depth
- [ ] Department inactive should degrade advanced policies/automation first, not erase accumulated drift, existing rooms, or basic jobs.

### Checkpoint 4 Tests

- [ ] Sim test: department active only when specialty/officer/terminal/bridge/reachability requirements are met.
- [ ] Sim test: inactive department reports the correct reason.
- [ ] Browser: Specialties/Crew/Build surfaces all describe the same requirement.
- [ ] Browser: removing or blocking a terminal changes department status without crashing jobs.

## Phase 5 - Progression Authority Reconciliation

Purpose: stop old tiers and specialties from competing.

- [ ] Decide final authority model:
  - recommended: station maturity gates broad eras; specialties gate department depth.
- [ ] Make `SpecialtyDefinition.unlockTier` meaningful or remove it.
- [ ] Make `SpecialtyDefinition.unlocksStaff` the source of truth for staff availability.
- [ ] Remove duplicated staff gating from `StaffRole.requiresSpecialty`, or generate it from specialties.
- [ ] Make `SpecialtyDefinition.unlocksModules` meaningful or remove it.
- [ ] Move module/room availability into one explicit resolver:
  - always available
  - maturity tier required
  - specialty required
  - department active required
  - future/hidden
- [ ] Keep old `unlockTier` in saves for compatibility.
- [ ] Rename old tier UI/copy to "station maturity" if it remains visible anywhere.
- [ ] Ensure the entropy roadmap still lands in the intended order:
  - sanitation first
  - maintenance/debris/EVA second
  - sunlight/thermal/air third
  - shared drift spine kept consistent across all three
- [ ] Update docs:
  - `docs/09-progression.md`
  - `docs/19-4-shared-drift-spine-and-rollout.md`
  - `docs/20-command-staff-tech-tree.md`
  - `docs/20-1-specialty-progression-reconciliation.md`
  - this checklist

### Checkpoint 5 Tests

- [ ] Sim test: room/module availability comes from the unified resolver.
- [ ] Sim test: old saves hydrate into equivalent maturity/specialty state.
- [ ] Browser: build palette lock text references the same requirement model as the Specialties panel.
- [ ] Browser: completing a specialty unlocks exactly the intended roles/modules/policies.

## Phase 6 - UX And Diagnostics Polish

Purpose: make the system understandable while playing.

- [ ] Add or refine a Jobs/Workforce panel:
  - open jobs by lane/type
  - assigned jobs
  - blocked jobs by reason
  - oldest job age
  - idle workers by reason
  - borrowed fallback workers
- [ ] Add chain diagnostics:
  - food: hydroponics -> kitchen -> cafeteria/cantina
  - supplies: intake/storage -> hydroponics/workshop/repair
  - trade: workshop -> market
- [ ] Add drift diagnostics using `19-4` language:
  - sanitation: dirt, source, effect, fix
  - maintenance: wear, source, repair type, effect, fix
  - map conditions: sunlight/debris/thermal value, upside, downside
  - thermal/stale-air: source, room effect, fix
- [ ] Add role/department diagnostics:
  - department active/inactive
  - officer/terminal status
  - role shortages
  - tasks specialists are currently doing
- [ ] Add in-world job markers for selected or blocked jobs.
- [ ] Update incident and alert copy to point to the right debug surface.
- [ ] Keep alert volume low:
  - alert when actionable
  - summarize backlogs
  - avoid one alert per dirty tile, worn wall, or hot tile

### Checkpoint 6 Tests

- [ ] Browser: player can click a worker and understand why they chose a job.
- [ ] Browser: player can click a room/module and understand why it is not producing.
- [ ] Browser: player can open one panel and see top blocked jobs/chains without reading the event log.
- [ ] Browser: large demo station remains smooth enough at 4x for at least a short diagnostic run.

## Implementation Order Recommendation

1. Clean old room-post leftovers from UI/metrics and make jobs the only visible work model.
2. Make job producers report why jobs do or do not exist.
3. Add shared job-volume controls and drift diagnostic vocabulary.
4. Make specialists materially different.
5. Add department derived state.
6. Reconcile module/room/staff unlock authority.
7. Polish diagnostics and in-world job feedback.

This order keeps behavior stable while removing confusion. It avoids rebuilding progression first while the job model still has old scaffolding, and avoids deep role balance before the player can see what workers are actually doing.

After this cleanup, continue the `19-*` feature order:

1. Sanitation and cleaning loop.
2. Maintenance, debris, and EVA repair.
3. Sunlight, shade, thermal, and air.

## Known Risks

- `src/sim/sim.ts` is large and many systems still share global metrics. Prefer small helper modules only when the boundary is obvious.
- Removing old metrics too aggressively may break tests or existing diagnostics; deprecate in stages.
- Department activation can become too punitive if it hard-disables basic loops. Start with advanced policies/diagnostics/hiring gates.
- Specialists can make assistants feel useless if role bonuses are too strong. Keep assistants useful as overflow and early-game glue.
- Build palette lock copy must not become a riddle. One requirement model, one sentence per lock.
- Entropy/drift systems can create job spam. Coalesce by patch/room/target and cap open jobs per domain.
- Overlay proliferation can make diagnostics harder, not easier. Reuse shared legends and hover language.
- Sanitation, maintenance, and thermal penalties must stay mild until their fixes are obvious and available.

## Definition Of Done

- No normal actor displays "staffing kitchen/cafeteria/hydroponics" as a passive job.
- Every visible work item is a job, a command duty, self-care, leisure, or an incident response.
- Specialists visibly outperform assistants in their domain.
- Old tier state no longer competes with Specialties in player-facing UI.
- Room/module/staff availability is resolved by one clear function/model.
- Diagnostics can answer:
  - why no job exists,
  - why a job is blocked,
  - why no worker took it,
  - why a department is inactive,
  - what condition/drift/source/effect is causing pressure,
  - what the player can build/hire/change to fix it.
