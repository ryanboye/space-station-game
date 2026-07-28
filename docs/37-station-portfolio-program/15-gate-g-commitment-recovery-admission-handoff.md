# Gate G Handoff: Commitment Pressure, Recovery, And Admission Policy

Status: ready for a separate Claude implementation branch after the lead Gate E/F integration checkpoint
Date: 2026-07-28

## Start Here

Branch from the current tip of `codex/structural-frontage-occupant-loop` after
the lead commits the Gate E/F integration review. Read, in order:

1. `00-shared-contracts.md`
2. `12-gate-e-save-resume-durability-handoff.md`
3. `13-gate-f-facility-scale-and-reception-handoff.md`
4. `../../38-structural-frontage-visit-flow-implementation-plan.md`
5. `../../39-structural-frontage-execution-checklist.md`
6. this handoff

The current worktree is authoritative. Inspect `git status`, `git diff`, and
the latest commits before editing. Do not copy files out of the old Claude
worktree or re-cherry-pick Gate E/F; those commits are already integrated.

## Player-Facing Goal

An accepted long stay must become visible operating pressure rather than a
timer hidden inside a contract. The player should understand the load before
accepting it, watch an under-supported stay deteriorate gradually and for
specific physical reasons, recover it through costly explicit actions, and
then author compact admission rules for routine calls without surrendering
control of exceptional traffic.

The target experience is one coherent story:

1. Approach Control forecasts a demanding repair cohort and the capacity it
   will commit.
2. The player accepts it into a real Berth.
3. Missing food, sleep, hygiene, or leisure produces attributable queues,
   distress, slower work, one bounded extension, and frontage pressure.
4. A later compatible call holds instead of overlapping occupied frontage.
5. The player uses one or more explicit recovery levers.
6. The cohort recovers or departs, the interface releases, and the causal
   rating/economy result occurs exactly once.
7. The player can encode the lesson as a small, legible admission policy while
   unusual calls remain manual.

## Checklist Scope

Treat the checklist as an evidence ledger. This tranche may close roughly 50
currently unchecked requirements, but check none merely because related code
exists.

### Metrics

- Record real-time ship visit duration by class.
- Record holding-orbit and approach-group wait.
- Record disembark and boarding duration.
- Record recurring-need demand and fixture utilization.
- Record committed future Berth, bed, service, and staff load.
- Record missed departures and stranded occupants.

### Shared Occupant Lifecycle And Focused Checks

- Use one shared need lifecycle for Visitor, contract crew, stranded guest,
  crew, and Resident without collapsing their identities.
- Let critical needs preempt optional wants without oscillation.
- Keep repair traffic until physical work completes or the player explicitly
  expedites or cancels it.
- Keep visit durations and concurrency long enough for layout pressure to
  matter.
- Give legacy saves safe defaults for new failure/policy state.
- Prove a repair cohort repeatedly eats, sleeps, washes, and recreates.
- Prove fixed and flexible schedules behave differently.
- Prove concurrent visits overlap without rapid replacement.

### Physical Visit Feedback

- Show ship purpose and visit phase beside the physical interface.
- Show likely cohort-size and stay ranges without a complete itinerary.
- Keep ship details hideable on small screens.

### Failed Stay And Recovery

- Give shore-leave passengers a valid alternative while preserving recall.
- Keep incomplete repair stays physically and economically consequential.
- Let Residents remain stressed, withdraw, recover, or explicitly leave.
- Escalate unmet needs gradually through readable stages.
- Use bounded, attributable incidents rather than a generic crime simulation.
- Let extended occupation block later work through real interface ownership.
- Provide and prove all recovery levers named by the execution plan:
  emergency prepared meals, physical temporary lodging, repair prioritization,
  compensation, onward transfer, explicit cancellation, admission closure, and
  security intervention only for disruptive actors.
- Require housing plus explicit policy for Resident acceptance.
- Apply rating/faction effects exactly once at meaningful milestones or final
  resolution, retaining the visible cause.

### Manual Approach Control

- Show incoming ship silhouettes.
- Show compatible interface and side.
- Project the proposed physical envelope in world space.
- Show conflicts with already accepted work.

### Admission Automation

- Add explicit Pod and Berth class rules.
- Protect configured free-interface, bed, and core-service reserves.
- Support minimum margin and maximum stay.
- Reuse only already-legible risk conditions.
- Explain every automatic accept/hold/reject decision briefly.
- Preserve manual override.
- Keep negotiated, military, migrant, large, and uncertain calls manual.
- Show aggregate lane pressure without inventing a priority spreadsheet.

## Existing Foundations Are Not Completion Evidence

- `src/sim/occupant-demand.ts` owns recurring visitor needs and deterministic
  need selection.
- `src/sim/sim.ts` already contains gradual visitor failure stages, work
  slowdown, early recall, one bounded extension, stranding, paid relief
  transfer, offer previews, and coarse automatic routing.
- `src/sim/approach-control.ts` already builds a pure preview containing party,
  stay, revenue, service, and committed-load ranges.
- `tools/failed-stay-tests.ts` already exercises stranding, escalation timing,
  work pressure, recall/extension, relief transfer, save/load, and exactly-once
  settlement.

Audit and reuse those seams. Do not check the scoped items until stronger
focused evidence proves their full player-facing contracts.

## Ownership Boundaries

Prefer extracting coherent systems instead of growing `sim.ts` further:

- add `src/sim/failed-stay.ts` for episode escalation, bounded incidents,
  milestone attribution, and recovery actions;
- add `src/sim/admission-policy.ts` for finite policy evaluation and concise
  explanations;
- extend `src/sim/occupant-demand.ts`, `src/sim/approach-control.ts`,
  `src/sim/types.ts`, and `src/sim/save.ts`;
- keep `src/sim/sim.ts` changes to narrow orchestration/export seams;
- use `src/main.ts` and `src/styles.css` for contextual controls and feedback;
- use `src/render/render.ts` only for world projection, silhouettes, and chips;
- add dedicated deterministic scenarios and focused runners.

Do not touch:

- `src/sim/facility-slots.ts` or `src/sim/facility-machines.ts`;
- Reception routing/processing or Gate F facility scenarios;
- drink or Community Table service completion;
- curated sprites, atlas metadata, or sprite pipeline scripts;
- camera/screenshot work;
- utility-underlay or normal-scale runner logic;
- `system-flow-map.html` or unrelated untracked files;
- final organic-playthrough checklist claims.

These exclusions avoid overlap with active lead review work. If a required
behavior genuinely crosses one of them, stop and return the conflict instead
of silently reopening the boundary.

## Design Decisions Not To Reopen

- Visitor, contract crew, stranded guest, crew, and Resident identities remain
  distinct even when they reuse need-selection rules.
- One missed meal never causes a serious incident.
- Escalation is gradual, deterministic, spatially attributable, and reversible.
- Extended occupation blocks later work through real interface/contract
  ownership, never an invisible capacity penalty.
- Emergency actions are explicit, targeted, costly, idempotent, and logged in
  world/economy truth.
- Emergency meals consume or purchase physical prepared-meal inventory.
- Emergency lodging uses depicted physical bed positions; never grant hidden
  bed capacity.
- Compensation can reduce escalation but cannot erase an unresolved physical
  shortage.
- Closing admissions affects new routine traffic only; it does not cancel
  accepted commitments.
- Security intervention is unavailable below `disruptive`.
- Resident acceptance requires housing plus explicit policy and never converts
  a visitor silently.
- Rating/faction effects occur once and retain a durable episode/cause id.
- Auto-admission is a compact finite policy, not a general rules language.
- Large, uncertain, negotiated, military, and migrant calls remain manual.
- Manual override remains available.
- Do not automatically pause simulation or expose complete itineraries.

## Acceptance Criteria

Build a same-seed bad-layout/recovered-layout pair and prove all of the
following through production simulation paths:

1. A repair cohort repeatedly seeks food, sleep, hygiene, and leisure through
   physical facilities.
2. Critical needs preempt optional wants without target oscillation.
3. Fixed and flexible schedules produce meaningfully different use patterns.
4. Shore-leave passengers choose a valid alternative and still obey recall.
5. Repair traffic stays while physical work is incomplete unless explicitly
   expedited or cancelled.
6. Sustained failure progresses through `unmet`, `balking`, `distressed`, and
   eventually bounded `disruptive` behavior using documented grace intervals.
7. Failure slows associated work, extends occupation at most once, and makes a
   later compatible call hold rather than overlap its interface.
8. Appropriate incidents such as mess, complaint, and refusal to work remain
   bounded and visibly attributable.
9. Every recovery lever has focused evidence and an invalid-state check.
10. Removing the shortage or applying a valid intervention recovers the
    episode and releases the Berth/frontage.
11. A Resident can persistently stress, withdraw, recover, or explicitly leave.
12. Resident acceptance fails without housing/policy, succeeds with both, and
    never holds the origin ship.
13. Rating/faction changes happen exactly once and name the visible cause.
14. Save/load during both failure and recovery preserves durable episode and
    policy state while paths and reservations rebuild.
15. Offer hover/focus highlights the proposed physical slot/envelope and any
    accepted-work conflict.
16. Auto-admission evaluates Pods and Berths, protects configured reserves,
    explains decisions, leaves exception traffic visible, and permits manual
    override.
17. The six scoped metrics are recorded and reported concisely.

## Focused Verification

Do not run the full suite. Extend or add only the focused runners needed:

- `npm run test:failed-stay`
- `npm run test:occupant-loop`
- `npm run test:approach-control`
- `npm run test:approach-envelopes`
- `npm run test:mixed-berth-visit`
- new `test:commitment-recovery`
- new `test:admission-policy`
- `npm run test:gate-e-save-resume`
- `npm run test:gate-f-facility` as a preservation check
- `npm run test:normal-scale-operation` as the focused performance guard
- `npm run build`
- `git diff --check`

Use one browser/server for:

- `?scenario=commitment-failure`
- `?scenario=commitment-recovered`
- `?scenario=admission-policy-pressure`

Inspect same-seed failure/recovery, envelope hover, interface conflict,
escalation chips/events, every recovery control, policy explanation/override,
and narrow-screen detail hiding. Save screenshots or a precise visual evidence
entry; a runner is not a substitute for player-facing inspection.

## Return Contract

Return one or more commits on a dedicated Claude branch plus a concise handoff
containing:

- changed files and architectural seams;
- checklist items directly proven, with exact evidence;
- focused command results;
- browser scenarios and observations;
- save migration details;
- performance before/after where relevant;
- unresolved conflicts or product decisions for lead review.

Do not merge or mark broad checklist gates complete. The lead will review,
integrate, run the combined focused checks, and perform the browser judgment.
