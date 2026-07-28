# Gate E Handoff: Save And Resume Durability

## Starting Point

Create a separate worktree and branch from commit `fd11a53` on
`codex/structural-frontage-occupant-loop`. Return one focused,
cherry-pickable commit. Do not merge it into another branch.

## Player-Facing Goal

A player must be able to save during an active, complicated station shift,
reload, and continue the same station rather than a convincing-looking but
semantically different reconstruction. Charter identity, exterior structure,
ships, passengers, physical cargo, construction, repairs, lodging, and
approach commitments must survive without duplication, lost ownership, or
permanent stalls.

This is the complete Phase 9 save/resume durability tranche, not a narrow seed
patch.

## Design Contract

Persist durable identity and work progress. Rebuild transient execution state.
Never serialize actor paths, tile reservations, queue-theater occupancy, or
other claims that are only valid for one simulation frame.

On load:

- the selected procedural system must remain exactly the same system;
- the chartered site's visual and operating consequences must remain the same;
- unfinished physical work must keep its progress and visible blocked reason;
- structural graphs, approach conflict groups, congestion/movement intents,
  and interface diagnoses must be regenerated from durable geometry;
- ship visits and passenger transfers must continue exactly once;
- held cargo and delivered construction material must not duplicate or vanish;
- EVA construction and repair jobs must regenerate and resume;
- temporary guest bunks must have at most one valid occupant claim;
- the 50-crew/50-visitor station must resume without permanently pathless
  actors, stale reservations, lost commitments, or duplicate jobs.

Prefer explicit reconstruction and focused assertions over merely calling a
zero-time tick and assuming every derived system repaired itself.

## Required Implementation

### Procedural Charter Identity

Persist and restore the durable fields currently present on `StationState` but
missing from `StationSnapshotV1`:

- `system`;
- `seedAtCreation`;
- `laneProfiles`;
- `mapConditionVersion` when it is durable identity rather than a cache token.

Migration must provide safe defaults for legacy saves. A legacy save should
continue using the existing deterministic default behavior; do not invalidate
old saves.

### Construction And Exterior Work

Preserve unfinished construction-site `blockedReason` and `createdAt` where
they affect player-visible state. Preserve existing structural-expansion
project phase, child progress, delivered materials, refunds, and integrity
targets.

After load, regenerate construction/EVA/repair assignments without duplicating
materials or carrying ownership. A worker may resume or another worker may take
over; the durable result must remain exactly once.

### Ships, Passengers, And Interfaces

Exercise and harden the existing recovery paths for:

- an active Pod Dock service;
- an active Berth contract;
- an approach commitment;
- passengers disembarking and boarding;
- mixed Pod and Berth traffic.

Rebuild approach conflicts and interface diagnoses from loaded geometry.
Clear stale paths and transient reservations, then prove that the queue heads
and transfer slots are recreated and continue moving.

### Physical Cargo, Repair, And Lodging

Exercise save/load while:

- a crew member physically holds cargo;
- an EVA repair is active;
- a visitor owns a temporary bunk claim.

After load there must be one owner, one recoverable job, and one lodging claim,
with no duplicated inventory.

## Owned Files

Primary write scope:

- `src/sim/save.ts`
- a new focused recovery helper such as `src/sim/save-recovery.ts`, if useful
- new focused runner(s) under `tools/`
- `package.json` only for focused runner commands
- save-related type declarations when strictly required

You may make narrowly scoped changes in `src/sim/initial-state.ts` only to
support deterministic legacy defaults.

## Do Not Touch

- `src/sim/sim.ts`
- `src/sim/cold-start-scenarios.ts`
- `src/main.ts`
- `src/render/`
- charter forecast/UI files changed by `fd11a53`
- `docs/39-structural-frontage-execution-checklist.md`
- unrelated UI, balance, sprites, or performance code

If an essential reconstruction hook truly requires `sim.ts`, document the
exact missing API and keep that one assertion failing or explicitly pending;
do not collide with the lead's active scale/pathing work.

## Focused Evidence Required

Add one or more targeted runners that cover all of these:

1. Save a non-default chartered system, reload through the real serializer and
   hydrator, and assert identical system identity, site, lane factors,
   sunlight, debris, resource profile, and operating forecast.
2. Save active construction with one partially built site and one
   material-blocked site. Reload and assert project phase, child progress,
   blocked reason, material totals, and no duplicate construction jobs.
3. Save active Pod Dock and Berth visits with an approach commitment and both
   boarding/disembarking passengers. Reload, advance 10-20 simulation seconds,
   and assert no duplicate ship, lost visitor, stale reservation, or missing
   queue head.
4. Save a held cargo delivery, active EVA repair, and temporary bunk claim.
   Reload and prove exactly-once custody, recoverable work, and one valid claim.
5. Save and reload a 50-crew/50-visitor, 8-Dock/2-Berth station. Compare jobs,
   reservation counts, queue lengths, service failures, and pathless actors;
   advance it and prove the station resumes making progress.
6. Parse at least one representative legacy snapshot and prove migration
   supplies safe procedural and occupant defaults.

Do not run the full test suite. Run the new focused runner(s), the existing
Phase 9 save runner where relevant, and `npm run build`.

## Acceptance Criteria

1. A non-default charter does not become default system seed `1337` after
   reload.
2. No durable progress, inventory, ship, visitor, or lodging ownership is
   lost or duplicated across the tested saves.
3. No transient actor path or tile reservation is persisted.
4. Derived structural, approach, congestion, and interface state is rebuilt
   and directly asserted after hydration.
5. Active work resumes within 20 simulated seconds in every recovery fixture.
6. Legacy saves still hydrate with documented deterministic defaults.
7. Focused runners and build pass.

## Return To Lead

Return a concise summary containing:

- commit hash;
- files changed;
- focused checks run and elapsed time;
- before/after evidence for each of the six recovery fixtures;
- any requirement that could not be completed without touching `sim.ts`;
- migration risks and any save-version decision the lead must review.
