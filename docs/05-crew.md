# Crew

Crew are the player's hireable workers. They take **posts** (staff a room) or **logistics jobs** (haul items between modules). Every crew member can do both — there is no separate hauler role.

## State shape

`CrewMember` (`src/sim/types.ts:...`) carries:

- `tile`, `targetTile`, `path[]`
- `system` — current `CrewPrioritySystem` (`types.ts:200`)
- `role` — derived from system via `roleForSystem` (`sim.ts:1141`)
- `state` — `OnDuty`, `Resting`, `Hygiene`, `Hauling`, `Idle`
- `assignmentStickyUntil`, `assignmentHoldUntil` — anti-thrash locks
- `fatigue` (0–100, climbs with work), `hygiene` (0–100, drains with work)
- `idleReason` — why this crew has no job (`CrewIdleReason` `types.ts:198`)

Pool sizing: `state.crew.total` is the player-set ceiling, `ensureCrewPool` (`sim.ts:2173`) spawns/trims to match each tick.

## Priority systems

`CrewPrioritySystem` (`types.ts:200`):

| System | Slot count constant |
|---|---|
| reactor | `CREW_PER_REACTOR` |
| life-support | `CREW_PER_LIFE_SUPPORT` |
| hydroponics | `CREW_PER_HYDROPONICS` |
| kitchen | `CREW_PER_KITCHEN` |
| workshop | `CREW_PER_WORKSHOP` |
| cafeteria | `CREW_PER_CAFETERIA` |
| market | `CREW_PER_MARKET` |
| lounge | `CREW_PER_LOUNGE` |
| security | `CREW_PER_SECURITY` |
| hygiene | `CREW_PER_HYGIENE` |

All defined at `sim.ts:85`–97; almost all are 1.

## Post assignment — `assignCrewJobs`

`sim.ts:2418`. Each tick:

1. Build `dutyAnchorsForSystem` for each system — list of valid anchor tiles per active cluster.
2. Compute `criticalTargets` via `computeCriticalCapacityTargets` (`sim.ts:1183`) — minimum required posts in life-support / reactor / hydro / kitchen / cafeteria.
3. Crew with `assignmentStickyUntil` / `assignmentHoldUntil` (10s/12s sticky lock — `CREW_ASSIGNMENT_STICKY_SEC` `sim.ts:195`) keep their post unless an air emergency or critical shortfall overrides.
4. Score each candidate post: `weights[system] * preset` (`CREW_PRIORITY_PRESET_WEIGHTS` `sim.ts:1292`) minus path-cost weight (`ASSIGNMENT_PATH_COST_WEIGHT = 0.14` `sim.ts:217`).
5. **Preempt** the current assignment only if the new score exceeds it by `1.25 × + 2` (`sim.ts:215`–216). This is the anti-thrash gate.
6. **Air emergency override** — if `airQuality < 25` or air-blocked warning is active, up to `CREW_EMERGENCY_WAKE_RATIO = 0.15` of the crew can be woken from rest to re-staff life-support (`sim.ts:186`).

Reactor and life-support maintenance debt also contributes to `criticalTargets`: once a utility cluster reaches 30 debt, the existing post assignment system treats that utility as needing staff. Crew standing in the matching cluster reduce debt over time, so distant utility rooms are harder to keep healthy.

## Rest, fatigue, hygiene — `updateCrewLogic`

`sim.ts:4581`:

- Fatigue gains 0.42/s while working.
- Hygiene drains 0.20/s.
- Below `CREW_REST_ENERGY_THRESHOLD = 42` (`sim.ts:...`), crew may volunteer to rest.
- Below `CREW_REST_CRITICAL_ENERGY_THRESHOLD = 18`, they always rest.
- Total resting count is capped at `CREW_MAX_RESTING_RATIO = 0.35` of the pool.
- **Shift bucketing** (`CREW_SHIFT_BUCKET_COUNT = 3`, `sim.ts:183`–184) staggers volunteer rest across 10 s windows so the station doesn't go to bed all at once.
- Hygiene `< 38` triggers a hygiene-room walk if no air emergency is active.

Air-critical (< 8) bypasses rest locks entirely (`sim.ts:2505`).

## Crew priority presets

`state.controls.crewPriorityPreset` is one of `balanced`, `life-support`, `food-chain`, `economy`. Each maps to a column in `CREW_PRIORITY_PRESET_WEIGHTS` (`sim.ts:1292`) — the per-system weight table multiplied into the post-scoring formula.

Custom weights via `setCrewPriorityWeight` (`sim.ts:8376`), exposed in the Priority modal (`refreshPriorityUi` `main.ts:2154`) as 1–10 sliders per system.

## Hauling — `assignJobsToIdleCrew`

Covered in `04-logistics.md`. An idle crew member (no post need them, fatigue OK) gets handed the cheapest pending job.

Hauling uses the `logistics` path intent. Logistics routes strongly prefer storage, stock, workshop, kitchen, hydroponics, and berth/service space over cafeteria, lounge, market, dorm, or hygiene paths. Posted crew and self-care movement use the `crew` intent instead, while security incident responders use `security` so they can cut through the station quickly.

If a logistics route crosses public/social/crowded spaces, the sim records `crewPublicInterference` and adds a small extra energy/hygiene drain while that route is active. This is the first mechanical reason to build back-of-house service corridors instead of forcing haulers through the public concourse.

## Idle reasons

When a crew can't find work, `idleReason` (`types.ts:198`) tells the UI why. Surfaces in `idleReasonsText` (`main.ts:1501`). Examples: `no-post-available`, `path-blocked`, `tier-locked`, `no-jobs-available`. Crew on hauling jobs are bucketed into `crewOnLogisticsJobs`.

## Player framing

- Hire button (top toolbar) calls `sim.hireCrew` (`sim.ts:8311`). `HIRE_COST = 14` (`sim.ts:...`).
- Each crew costs `PAYROLL_PER_CREW = 0.32` per `PAYROLL_PERIOD = 30 s` (`sim.ts:129`–130).
- Crew render as blue circles or sprite variants (`render.ts:1635`).
- Priority modal lets the player nudge the weights to bias the scoring.
- `staffInTransitBySystem` metric distinguishes crew "walking to post" from "at post" — relevant when a critical room is across the map.
- Utility rooms expose maintenance health in room inspector hints and ops metrics; high maintenance debt reduces reactor power or life-support air/water output.

## Tunables

All `CREW_*` constants at `sim.ts:85`–197. Preset weight table at 1292.

- `CREW_ASSIGNMENT_STICKY_SEC = 10`
- `CREW_ASSIGNMENT_HOLD_SEC = 12`
- `CREW_PREEMPT_SCORE_RATIO = 1.25`, `CREW_PREEMPT_SCORE_OFFSET = 2`
- `ASSIGNMENT_PATH_COST_WEIGHT = 0.14`
- `CREW_EMERGENCY_WAKE_RATIO = 0.15`
- `CREW_REST_ENERGY_THRESHOLD = 42`, `CREW_REST_CRITICAL_ENERGY_THRESHOLD = 18`
- `CREW_MAX_RESTING_RATIO = 0.35`
- `CREW_SHIFT_BUCKET_COUNT = 3`

## Trip-wires

- A staffed post needs the crew **standing in that room** AND the room to be active. Crew "in transit" still count as `assigned` but not `active` — surfaces in `staffInTransitBySystem`.
- The 10–12 s sticky lock means moving a critical room across the map can leave reactor-bound crew walking for 8 s before reconsidering. **Intentional anti-thrash.** Don't shorten without testing the thrash regression scenarios.
- Air emergency wakes 15% of crew. Air-critical (< 8) bypasses everything. If you add a new emergency type, decide if it should follow the same override.
- `CREW_PER_*` constants are *slot counts*, not job counts. A room with 2 staff slots needs 2 crew on tiles inside it to be "fully staffed".
