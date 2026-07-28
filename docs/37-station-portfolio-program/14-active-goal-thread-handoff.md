# Active Goal Thread Handoff

**Date:** 2026-07-28  
**Branch:** `codex/structural-frontage-occupant-loop`  
**Current HEAD:** `a88c0ca` (`docs: hand off facility scale and reception gate`)  
**Goal status:** active, not complete

## Objective

Complete the remaining unchecked requirements in
`docs/39-structural-frontage-execution-checklist.md` through practical,
player-facing integration tranches:

1. reconcile and prioritize the checklist;
2. finish the opening business-choice loop;
3. finish facility and construction usability;
4. prove charter differentiation;
5. support active-scale performance;
6. prove save compatibility;
7. complete a start-to-large-station playthrough;
8. check off only directly evidenced requirements;
9. commit stable checkpoints and produce a final playtest report.

Do not narrow this objective to the easiest passing subset. The user wants a
playable build, not a large pile of isolated tests.

## User Working Preferences

- Give short percentage/checklist progress updates as evidence accumulates.
- Use practical, bounded validation. Do **not** run the full test suite unless
  the user later asks for it; it takes too long.
- Prefer focused runners and direct browser playtesting.
- Keep memory use modest: one dev server, one browser tab where possible, and
  no large swarm of subagents.
- External Claude work is encouraged for large, non-overlapping tranches.
- The user cares about visible player behavior and readable causes, not merely
  data structures or green checks.

## Checklist Baseline

At handoff time:

- checked: **288**;
- open: **263**;
- total: **551**;
- directly evidenced completion: **52.3%**.

Recalculate with:

```sh
rg -c '^\s*- \[[xX]\]' docs/39-structural-frontage-execution-checklist.md
rg -c '^\s*- \[ \]' docs/39-structural-frontage-execution-checklist.md
rg -c '^\s*- \[[ xX]\]' docs/39-structural-frontage-execution-checklist.md
```

No new boxes were checked during the unfinished active-scale tranche. Do not
claim more than 52.3% until evidence is recorded against individual items.

## Repository State

Latest commits:

```text
a88c0ca docs: hand off facility scale and reception gate
dcd4333 docs: hand off save resume durability gate
fd11a53 feat: make charter site choice an operating decision
706d88b fix: build exterior hardware from eva work faces
2ce719c fix: resume staged eva expansion work
be23f23 test: add opening business showcase states
```

Current tracked changes are intentionally **uncommitted**:

```text
M dist/index.html
M src/sim/cold-start-scenarios.ts
M src/sim/sim.ts
M src/sim/utility-underlay.ts
M tsconfig.tsbuildinfo
```

`dist/index.html` and `tsconfig.tsbuildinfo` are generated churn. Restore them
before committing unless a build artifact is deliberately required:

```sh
git restore dist/index.html tsconfig.tsbuildinfo
```

Untracked files that predated or are unrelated to this tranche must not be
deleted, staged, or modified:

```text
system-flow-map.html
tmp/
tools/sprites/archive/atlas-sprite-v1-2026-07-28T02_54_52_713Z/
tools/sprites/out/raw/structural-frontage-imagegen-reference.png
```

## External Claude Work

### Integrated: Gate D Charter Consequences

Claude commit `b96e285` was reviewed and integrated as `fd11a53`.

Focused evidence already passed:

```sh
npm run test:charter-forecast
```

This proved deterministic forecasts, neutral no-charter fallback, distinct
busy-lane/resource-belt consequences, economy-profile-driven percentages, and
real mitigation hooks.

### Assigned: Gate E Save/Resume Durability

Handoff:

`docs/37-station-portfolio-program/12-gate-e-save-resume-durability-handoff.md`

Scope includes:

- procedural charter identity;
- construction and blocker persistence;
- reconstruction of derived state;
- ship and passenger-transfer persistence;
- cargo, EVA, and lodging persistence;
- legacy migration;
- a 50 crew / 50 visitor stress save.

Claude was instructed to return one independently cherry-pickable commit and
not touch broad simulation or rendering code. Completion is not known in this
thread; ask the user or inspect the supplied worktree/commit when available.

### Assigned: Gate F Facility Scale And Reception

Handoff:

`docs/37-station-portfolio-program/13-gate-f-facility-scale-and-reception-handoff.md`

This is deliberately a large implementation tranche:

- shared exclusive physical-use slots and cleanup paths;
- market receiving -> backroom -> shelf -> checkout;
- visible carried bundles and restocking;
- shelf-category and layout tradeoffs;
- connected modular service bars;
- finite bar stock, staffing, guest positions, and dwell positions;
- Booth Bank, Standing Rail, Serving Line, Community Table, Guest Cabin,
  Arrival Desk, and Wash Bank;
- optional Reception and progressive demand discovery;
- low-resolution sprites and operating states;
- seven deterministic bad-layout/improved-layout comparisons;
- focused evidence and save compatibility.

Claude was instructed to complete Gate E first and return Gate F as a second,
independently cherry-pickable commit. Expect overlap in narrow regions of
`src/sim/sim.ts` and `src/sim/cold-start-scenarios.ts`; resolve those conflicts
by behavior, not by mechanically choosing one side.

## Uncommitted Active-Scale Work

### 1. Utility Underlay Performance Fix

File: `src/sim/utility-underlay.ts`

`ensureUtilityUnderlay` previously cloned all eight full-map `Uint8Array`
layers on every utility lookup merely to confirm their lengths. On an 8,000
tile map this dominated simulation time.

The working change now scans lengths and rebuilds only when a layer is absent
or incorrectly sized.

Measured before the fix:

- normal-scale tick average around **65 ms**.

Measured after the fix with the existing target-scale runner:

- tick p50 about **4.2 ms**;
- tick p95 about **9.1-9.9 ms**;
- tick p99 about **13.1-13.4 ms**;
- maximum about **15.3-16.6 ms**;
- exit RSS about **200 MiB**;
- heap about **44.6 MiB**;
- deterministic 50 crew / 50 visitors / 10 interfaces.

Existing command:

```sh
npm run perf:target-scale -- --tier=50
```

Important limitation: that runner begins with zero active jobs, reservations,
or ships. It proves the low-level regression but not a busy operational day.

Recommended focused regression: call `ensureUtilityUnderlay` repeatedly on a
correctly sized state and assert the underlay and layer identities remain
stable; resize the map and assert one deliberate rebuild occurs.

### 2. Player-Visible 50/50 Scenario

File: `src/sim/cold-start-scenarios.ts`

New scenario:

```text
?scenario=normal-scale-50
```

It currently provides:

- 50 crew with hard physical roles;
- 50 synthetic extended visitors with mixed initial needs;
- eight valid Pod Docks;
- two compact Berths;
- a deliberately admitted mixed passenger/cargo shuttle;
- multiple public cafeteria doors;
- two serving stations and six tables;
- 48 prepared meals and 48 clean trays;
- adequate reactor/solar supply for the demonstration station;
- public zoning for guest rooms and restricted zoning for staff rooms.

It starts paused so it can be inspected in the browser.

The helper `installScaleDockInterfaces` uses the real
`validateDockPlacement` contract. Synthetic visitors are placed only on public,
unoccupied, non-Berth room floors so they do not begin by blocking station
entrances.

### 3. Dock Placement Correctness

File: `src/sim/sim.ts`

`validateDockPlacementAt` now rejects a Pod Dock unless the tile opposite its
outward-facing approach has a walkable station-interior access tile. This
prevents a visually legal Dock from being mounted against a double wall with
no usable passenger route.

### 4. Cafeteria Throughput And Crowd Recovery

File: `src/sim/sim.ts`

Working changes:

- meal counters are explicitly self-service;
- `requiredCafeteriaPosts` is now zero;
- food staff no longer park at customer pickup faces;
- a customer with a valid reserved pickup position first tries an
  occupancy-aware path and then retains a geometric path if the crowd
  temporarily blocks A*;
- unreserved milling/queueing visitors may yield movement tiles, while real
  provider and seat reservations remain exclusive;
- the false `visitorExitStalled` alert now waits until an active visitor has
  existed for at least 45 seconds.

Observed outcomes varied with traffic load:

- lower-load run: queue recovered to zero and 21 meals were served;
- later 60-second run: 54 visitors, queue 2, mixed cargo ship docked;
- latest 120-second run: 76 visitors, peak 81, 12 meals served, queue 19,
  peak queue 21.

This is improved but not yet sufficient evidence that the 50/50 cafeteria is
balanced. The next task should record queue trajectory, not merely its final
value. A queue is acceptable if throughput catches up; an ever-growing queue
is not.

### 5. Crew Logistics Route Recovery

File: `src/sim/sim.ts`

Inspection and cargo movement now try an occupancy-aware logistics path and
fall back to the geometric route. A transient blocked movement no longer
throws away the inspection path every frame. This allowed the guaranteed mixed
ship to complete inspection and enter unloading.

### 6. Empty Job-Board Performance Fix

File: `src/sim/sim.ts`

The job producer formerly refreshed every tick whenever no live job existed,
causing more than 120 full path probes per tick in an idle 50-crew station. It
now refreshes on the existing 350 ms cadence, or on explicit zero-delta setup
ticks.

## Exact Current Blocker: Staged Cargo Has No Destination Capacity

The mixed ship now:

1. approaches;
2. docks;
3. receives an inspection job;
4. completes inspection;
5. releases two cargo lots;
6. enters `unloading`;
7. leaves both lots in `staging` without creating cargo haul jobs.

The cause was isolated at handoff time. It is primarily a **scenario setup
error**, not yet proof of a cargo-system defect.

The benchmark sets:

```ts
s.legacyMaterialStock = 1_000;
s.metrics.materials = 1_000;
```

The inventory synchronization fills every LogisticsStock and Storage node with
raw material:

```text
intake 3429: 48/48 rawMaterial
intake 3433: 48/48 rawMaterial
storage 866: 108/108 rawMaterial
storage 869: 108/108 rawMaterial
storage 872: 108/108 rawMaterial
storage 1266: 108/108 rawMaterial
storage 1269: 108/108 rawMaterial
```

The inbound manifest is:

```text
10 rawMaterial, consigned, staging at tile 3272
4 tradeGood, consigned, staging at tile 3272
```

`createPortCargoTransportJobs` correctly finds the seven target nodes but
computes zero `itemNodeUnreservedCapacity` for all of them, so it cannot enqueue
a job.

### Recommended Resolution

Fix the scenario before changing cargo logic:

- reduce starter construction material stock to a realistic amount; or
- seed material into only part of the physical storage; and
- leave at least 14 units, preferably 30-50 units, of explicit cargo capacity.

Then rerun the same 120-second trace. Only change cargo code if staged lots
still fail after free capacity exists.

This is also useful gameplay evidence: a full warehouse should visibly report
`NO STORAGE CAPACITY`, not appear mysteriously stalled. If that diagnosis is
missing, add it as a legibility fix rather than bypassing capacity.

## Reproduction Snippet

Compile only the simulation test target:

```sh
npx tsc -p tsconfig.simtest.json
```

Then create a fresh state, apply `normal-scale-50`, unpause it, and tick at
`1/15`. At approximately 45 seconds the guaranteed ship should be in
`unloading`. Inspect:

- `state.arrivingShips[*].portTurnaround.phase`;
- `state.portOps.cargoLots`;
- jobs with `portCargoLotId !== undefined`;
- `collectServiceTargets` for `LogisticsStock` and `Storage`;
- the item node capacities at those targets.

At current state, targets exist and lots are staged, but all targets are full.

## Recommended Restart Sequence

### Step 1: Stabilize The Current Working Diff

1. Fix only the `normal-scale-50` material/storage setup.
2. Add a focused `tools/normal-scale-operation-tests.ts` runner and package
   script.
3. Assert:
   - initial 50 crew and 50 visitors;
   - eight Pod Docks and two Berths;
   - every Dock has a walkable station-side access tile;
   - adequate power reserve;
   - guaranteed medium mixed call docks;
   - inspection completes;
   - inbound cargo jobs are created and cargo handled is greater than zero;
   - Pod and Berth traffic overlap;
   - meals are served;
   - queue trajectory is bounded or recovering;
   - no physical cafeteria staff post is required;
   - tick p95 remains comfortably below a practical budget, suggested 25 ms.
4. Add the utility-underlay identity regression.
5. Run only the new focused runner, target-scale perf runner, and build.
6. Visually inspect `?scenario=normal-scale-50` in the existing single dev
   server.
7. Restore generated churn and commit the three source files plus focused test.

### Step 2: Record Direct Evidence

Map each proven behavior to exact checklist lines. Check only those boxes.
Recalculate and report the percentage. Include command output or browser
evidence in the commit/report.

### Step 3: Integrate Claude Gate E

When Claude returns:

1. inspect the commit rather than blindly cherry-picking;
2. verify migration, reconstruction, and active-flow save behavior with the
   focused commands in the handoff;
3. cherry-pick only after review;
4. perform one browser save/reload during a mixed active call;
5. check off only directly proven Phase 9 items.

### Step 4: Integrate Claude Gate F

Review market and cantina behavior at actual play zoom. Confirm the bad layouts
fail for physical reasons and the improved layouts measurably improve. Resolve
`sim.ts` and scenario conflicts manually because this thread has active changes
there.

### Step 5: Opening-To-Large Playthrough

The final goal still requires a real playthrough, not just fixtures:

1. start from the charter/new-game flow;
2. choose and operate an opening business;
3. earn and invest rather than use debug credits;
4. expand through Pod Docks into one or more Berths;
5. exercise cargo, fuel, utilities, hospitality, construction, EVA, and
   long-stay visitor needs;
6. reach at least 50 crew and 50 simultaneous/recent visitors;
7. save and reload during active operations;
8. document bugs, balance pressure, readability, and frame pacing;
9. fix severe blockers and repeat the affected section;
10. produce the final checklist and playtest report.

## Focused Commands Already Used

Passed during this tranche:

```sh
npm run test:charter-forecast
npm run perf:target-scale -- --tier=50
npx tsc -p tsconfig.simtest.json
```

Do not infer that the whole game is green from these commands. The full test
suite was deliberately not run.

## Running Browser

A Vite server was running at:

```text
http://127.0.0.1:5184/
```

The useful scenario URL is:

```text
http://127.0.0.1:5184/?scenario=normal-scale-50&diag=1
```

Check whether that process still exists before starting another server. Use a
new port only if it is gone and 5184 is occupied by something unrelated.

## Lead Judgment To Preserve

- The large station is the desired norm, not a stress-test curiosity.
- Rendering should remain smooth while simulation advances at discrete rates.
- Physical congestion is desirable when caused by player layout; pathless
  ownership and invisible blockers are bugs.
- Docks are for tiny craft; Berths are for larger ships.
- Cargo, visitors, and public circulation should visibly compete for space.
- A legal bad layout should fail immediately and legibly.
- Facility depth must create layout choices, not larger room checklists.
- Save/load proof must cover active operations, not only a paused empty state.
- The checklist is an evidence ledger. Do not check aspirational items merely
  because adjacent code exists.

## Immediate Handoff Prompt

```text
Continue the active structural-frontage goal from
docs/37-station-portfolio-program/14-active-goal-thread-handoff.md on branch
codex/structural-frontage-occupant-loop. Treat the current worktree as
authoritative. First stabilize and commit the uncommitted active-scale tranche:
fix the normal-scale fixture's full-storage setup, prove actual mixed cargo and
cafeteria throughput with a focused 50/50 runner, preserve the measured utility
underlay performance gain, and visually inspect the scenario. Do not run the
full test suite. Then record only directly evidenced checklist progress and
integrate/review Claude's Gate E and Gate F commits when supplied. Keep the full
opening-to-large-station playthrough objective active until it is genuinely
proven.
```
