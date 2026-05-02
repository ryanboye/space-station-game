# Simulation Core

The single mutable `StationState` (`src/sim/types.ts:933`) is the source of truth for everything in the game. Every per-frame call to `tick(state, dt)` (`src/sim/sim.ts:8444`) runs a fixed-order pipeline; there are no sub-steps and no async work.

## Tick pipeline (in order)

`tick()` (`sim.ts:8444`) does this each frame:

1. Reset perf counters (`pathMs`, `derivedRecomputeMs`).
2. `ensureCrewPool` (`sim.ts:2173`) — spawn or trim crew to match `state.crew.total`.
3. `ensureResidentPopulation` (`sim.ts:2188`) — currently a no-op seam; residents spawn only via visitor conversion.
4. Refresh derived caches: `ensureDockEntitiesUpToDate`, `ensureDockByTileCache`, `ensureItemNodeByTileCache`.
5. `ensurePressurizationUpToDate` (`sim.ts:1104`) → `computePressurization` (`sim.ts:1793`) when topology changed.
6. `refreshRoomOpsFromCrewPresence` — recount which rooms are "active" based on crew on duty tiles.
7. `computeSecurityAuraMap` (`sim.ts:1931`) — for incident suppression.
8. `buildOccupancyMap` — actor count per tile, used for path congestion.
9. **If paused:** `refreshJobMetrics` + `computeMetrics` + `updateUnlockProgress`, then return. HUD stays live but no gameplay advances.
10. Otherwise:
    - Cycle-arrivals while-loop, `updateSpawns`, `updateArrivingShips(dt)`.
    - `expireEffects`, `applyCrewPayroll`, `applyResidentTaxes`.
    - Job creation: `createFoodTransportJobs`, `createRawMaterialTransportJobs`, `createTradeGoodTransportJobs`.
    - `assignCrewJobs`, `assignJobsToIdleCrew`, `requeueStalledJobs`, `expireJobs`.
    - `updateResources` (`sim.ts:6280`) — air/power/water/food deltas.
    - `updateCrewLogic`, `updateCriticalStaffTracking`.
    - `updateResidentLogic`, `tryStartResidentConfrontation`.
    - `updateVisitorLogic`.
    - `updateIncidentPipeline`.
    - `refreshJobMetrics`, `ensureDerivedUpToDate`, `computeMetrics`.
    - `updateUnlockProgress` (`sim.ts:360`).
    - `maybeTriggerFailure` — random effects.

`dt` arrives from `main.ts:frame` multiplied by `state.controls.simSpeed` (1/2/4) and capped at 100 ms (`main.ts:3891`).

## State shape — what's in `StationState`

Defined at `types.ts:933`. Major slots:

| Slot | Purpose |
|---|---|
| `tiles[]`, `zones[]`, `rooms[]`, `roomHousingPolicies[]`, `modules[]`, `pressurized[]` | Per-tile flat arrays, length = `width * height` |
| `moduleInstances[]` | Footprint owners (a 2×2 module = 1 instance with 4 tiles) |
| `core`, `docks[]`, `dockQueue[]`, `arrivingShips[]`, `pendingSpawns[]` | Topology + arrival pipeline |
| `visitors[]`, `residents[]`, `crewMembers[]` | Agent arrays |
| `jobs[]`, `itemNodes[]` | Transport job queue + module-attached storage |
| `incidents[]` | Open trespass/fight events |
| `metrics` | Aggregated HUD numbers (fat object — `types.ts:424`) |
| `controls` | UI flags + sliders — paused, simSpeed, taxRate, sprite/wall toggles, crew preset/weights, dockPlacementFacing, moduleRotation (`types.ts:914`) |
| `effects` | Timed buffs/debuffs, blocked tiles, security aura (`types.ts:905`) |
| `derived` | Cache versions + cached lookups (`types.ts:680`) |
| `usageTotals` | Rolling sums for derived rates and rating bonuses |
| `unlocks`, `mapExpansion`, `crew`, `ops` | Progression and meta |
| `topologyVersion`, `roomVersion`, `moduleVersion`, `dockVersion` | Monotonic counters that drive cache invalidation |

## Cache invalidation

The four version counters are bumped by mutator helpers:

- `bumpTopologyVersion` — any tile change.
- `bumpRoomVersion` — any room paint or housing-policy change.
- `bumpModuleVersion` — module placement/removal.
- `bumpDockVersion` — dock topology change.

Downstream caches (pressurization, item-node-by-tile, dock-by-tile, static render layer, decorative render layer, glow render layer, path cache) compare their stored version against the current state version and re-derive on mismatch.

If you fork a wall-rendering path or add a new derived cache, **include the relevant version counter in your cache key** or it won't invalidate. See `11-render.md` for the static-layer cache key and `99-trip-wires.md` for the wallRenderMode trip-wire.

## Pathing and route intent

Raw A* lives in `src/sim/path.ts`. The sim wrapper in `src/sim/sim.ts` caches successful routes and records path perf metrics. Path requests now carry a `PathIntent`: `visitor`, `resident`, `crew`, `logistics`, or `security`.

Intent changes soft tile costs, not the walkable topology. Walls, space, blocked effects, and restricted-zone rules are still the hard blockers. Back-of-house rooms are expensive for visitors, social rooms are expensive for logistics, crew are mildly biased away from crowded public rooms, and security responders mostly take the shortest route. The path cache key includes intent, so do not add a new route mode without extending the key and the tests in `tools/sim-tests.ts`.

Assigned paths also carry a compact route-exposure score. Visitors apply it when they complete service trips, residents apply it when they complete need trips, and logistics crew apply public-interference drain while a hauling route is active. This keeps bad layout feedback bounded to trip outcomes rather than penalizing every walking tick for every actor.

Route-pressure diagnostics aggregate current planned paths by intent (`visitor`, `resident`, posted `crew`, and active-job `logistics`). The overlay is intentionally a live debugging surface, not a saved metric: it shows which tiles are carrying traffic now and marks conflicts where public/residential movement crosses back-of-house flow.

## Room environment

Rooms also carry lightweight environment traits in `ROOM_ENVIRONMENT_TRAITS`: visitor status, residential comfort, service noise, and public appeal. `roomEnvironmentScoreAt` samples nearby room tiles in a small radius and produces a local score used by visitors, residents, metrics, and the room inspector.

Visitor-facing rooms near service/cargo/critical systems create a small `environment` station-rating penalty at service completion and can slightly reduce market spend. Dorm/hygiene/social arrivals near loud service rooms add resident stress and reduce satisfaction. These effects are intentionally smaller than survival needs and route exposure; they are layout feedback, not a hard blocker.

## Initial state

`createInitialState({ seed })` (`sim.ts:7005`) sets up:

- 60×40 grid (default).
- 10×10 floor box at `(25,14)` to `(34,23)` with walls.
- Open central floor at the geometric center `(coreX=30, coreY=20)`, with a small reactor alcove on the west side of the starter hull.
- Starting resources: `credits=60`, `materials=420`, `airQuality=75`, `mealStock=20`, `rawFoodStock=40`.

`main.ts:659` then auto-paints a 2-tile starter dock at `(35,17)`–`(35,18)` so the player has somewhere for first ships to dock.

## Cycles vs Days vs Time

- `CYCLE_DURATION = 15` seconds (`sim.ts:81`).
- `state.now` advances every tick by `dt` (sim seconds).
- Ship traffic is sporadic: `updateTrafficArrivalSchedule` uses `controls.shipsPerCycle` as a 0-3 traffic-rate knob, then jitters the next single arrival check instead of spawning fixed waves.
- The HUD shows "Day N | Cycle X | MM:SS" but **Day = floor(cycleIndex / 8)** is purely cosmetic — there are no day-based rules in the sim. Don't add gameplay that assumes day boundaries (`main.ts:1259`).

## Scenarios

Two unrelated concepts share the word "scenario":

### Cold-start scenarios (`?scenario=NAME`)

`src/sim/cold-start-scenarios.ts:256` — `applyColdStartScenario(state, name)` overlays a starting layout when the URL has `?scenario=NAME`. Whitelist: `starter`, `t1-ready`, `t5-ready`, `t6-trophy`, `demo-station`.

`demo-station` is the big one — `applyDemoStationOverlay` (`cold-start-scenarios.ts:156`) builds a 10-room test station programmatically. Used for screenshots and visual regression.

### Test-fixture scenarios (`src/sim/scenarios.ts`)

40+ deterministic builders (`buildStableScenario`, `buildAirRecoveryWindowScenario`, etc.) consumed by the Node-side sim test runner (`tools/sim-tests.ts`). Each `runScenario` (`scenarios.ts:328`) creates a fresh state, runs `setup`, ticks for `durationSec`, and snapshots metrics every `snapshotEverySec`. See `13-pipelines.md`.

## Player framing

Pause freezes gameplay but not HUD calculation. There is no separate "build phase" — placement is instant, no construction queue, no builder NPC. Materials drain at place-time. `1×/2×/4×` speed multiplies `dt`; pause is `simSpeed=0` plus the early-return at step 9.

## Trip-wires

- `state` is mutated in place. `applyHydratedState` (`main.ts:4154`) does `Object.assign(state, nextState)` — never replace the outer reference.
- `updateUnlockProgress` advances multiple tiers in one tick if multiple predicates flip simultaneously (`sim.ts:368`–377). The tier-flash UI handles back-to-back replacements; tier-skipping is intentional behavior.
- Pause path still calls `computeMetrics` so HUD numbers update — but it skips `updateResources` and the agent-update calls. Don't put cleanup work inside `updateResources` if you want it to run while paused.
