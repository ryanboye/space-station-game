# Project Map

This map is a current-orientation document for incremental simulation refactors. Line numbers are a snapshot from the current `src/sim/sim.ts`; expect them to drift as extractions land.

## Repository Shape

| Path | Role |
| --- | --- |
| `src/main.ts` | App shell, input handling, UI state, render loop, save/load wiring. Imports the public barrel `src/sim/index.ts`. |
| `src/render/` | Canvas rendering, sprite layers, wall/dock detail layers, preview validation. Some render helpers import directly from `src/sim/sim.ts`. |
| `src/sim/types.ts` | Shared enums, state interfaces, metrics, helpers such as `toIndex`, `fromIndex`, `isWalkable`, `makeRng`. `StationState` starts at `types.ts:1609`. |
| `src/sim/balance.ts` | Static balance tables: module definitions, room definitions, task timings, process rates, service capacity, environment traits. |
| `src/sim/path.ts` | Raw deterministic A* pathfinder. `sim.ts` wraps it with cache keys, route intent, occupancy, and perf counters. |
| `src/sim/system-map.ts` | Deterministic star-system generator and lane weighting helpers. Uses its own sub-seed so it does not consume `state.rng`. |
| `src/sim/save.ts` | Save schema, migration, hydration. Imports mutators from `sim.ts` to rebuild runtime state from snapshots. |
| `src/sim/scenarios.ts` | Deterministic fixture builders for the Node sim tests. Imports public and internal sim helpers from `sim.ts`. |
| `src/sim/cold-start-scenarios.ts` | URL scenario overlays for local demos and visual harnesses. |
| `src/sim/initial-state.ts` | `createInitialState` — deterministic factory for a fresh `StationState`. Re-exported via `sim.ts`. Extracted 2026-05-04. |
| `src/sim/actor-inspectors.ts` | Visitor / resident / crew inspector derivations (`get{Visitor,Resident,Crew}InspectorById`) plus their private helpers. Pure read-only. Re-exported via `sim.ts`. Extracted 2026-05-04. |
| `src/sim/expansion.ts` | `expandMap` + `getNextExpansionCost` + `canExpandDirection` + ExpandMapResult/FailureReason types. Re-exported via `sim.ts`. Extracted 2026-05-04. |
| `src/sim/construction.ts` | Construction-site planning + EVA helpers (suit-up, oxygen, airlock detection, build jobs, applyConstructionSite). Public surface (cancel/plan-tile/plan-module) re-exported via `sim.ts`; internal helpers (createConstructionJobs, applyConstructionSite, etc.) imported back into sim.ts for use in tick + crew logic. Extracted 2026-05-04. |
| `src/sim/dock-controls.ts` | Public dock + berth control APIs (setDockX / setBerthX / getDockByTile / validateDockPlacement / ensureBerthConfig + per-anchor berth-config storage helpers + pruneOrphanedBerthConfigs). Re-exported via `sim.ts`. Extracted 2026-05-04. |
| `src/sim/content/` | Static content for residents, command progression, ships, unlocks, and tooltips. |
| `tools/sim-tests.ts` | Main deterministic simulation test runner. Imports many direct exports from `src/sim/sim.ts`. |
| `tools/sim-perf.ts` | Simulation perf harness. |

## Current `sim.ts` Responsibilities

`src/sim/sim.ts` is 13,646 lines (down from 15,535 after the 2026-05-04 extractions: createInitialState, actor inspectors, expansion, construction + EVA, dock + berth controls — total **−1,889 lines / ~12.2%**) and currently acts as the orchestration layer plus many subsystem implementations.

| Lines | Area | Notes |
| --- | --- | --- |
| `1-126` | Imports | Pulls static content, balance tables, path core, system map, and almost every sim type. |
| `127-344` | Constants and static lists | Economy, timing, maintenance, sanitation, crew, jobs, dock, expansion, route, and activation tuning. |
| `345-572` | Traffic, unlocks, rating helpers | Lane weights, ship unlock gates, tier progression, rating penalty/bonus helpers. Contains `state.rng` consumers for traffic choices. |
| `573-887` | Path choice, room/module helpers, derived cache setup | Nearest-path selection, housing policy helpers, module footprint/mount helpers, wall-mounted service tile resolution, module service lists, cached room types. |
| `888-1445` | Derived caches and path cache wrapper | Derived cache initializer, cadence timers, path cache keys, cache invalidation bumps, room/service/queue/reachability caches. |
| `1446-2291` | Ops diagnostics | Crew system mappings, maintenance and sanitation diagnostics, life-support coverage, route-pressure diagnostics. |
| `2292-2796` | Dock, manifest, and dock placement helpers | Dock bays, ship manifests, archetypes, dock placement validation. Several helpers consume `state.rng`. |
| `2797-3504` | Build connectivity, pressurization, incidents, route/environment scoring, air exposure | Includes `computePressurization`, incident creation, route exposure, room environment scoring, security aura, and air-quality updates. |
| `3505-4526` | Actor creation, command state, crew pool, dock rebuild, berth lookup, resident move-in/conversion | Contains actor factory functions and ship/resident conversion logic. Many functions are RNG-sensitive. |
| `4527-5825` | Crew assignment and room diagnostics | Crew job assignment, room ops refresh, maintenance debt, room inspectors. |
| `5826-6502` | Service targeting, traffic scheduling, ship updates, movement | Cafeteria/queue path selection, sporadic arrivals, ship lifecycle, occupancy map, path movement. |
| `6503-6916` | Item nodes and materials | Inventory storage, item transfer, material stock, operational/construction supply consumption. |
| `6917-7370` | Construction and EVA | Construction site planning, jobs, EVA pathing, build application. |
| `7371-9130` | Jobs, reservations, logistics metrics | Transport/cook/repair/sanitation job creation, fires, reservations, dispatch, job board metrics. |
| `9131-10125` | Crew logic | Crew death, needs, rest, self-care, job execution, construction/repair/sanitation/logistics behavior. |
| `10126-11037` | Visitor logic | Visitor path assignment, cafeteria/leisure/clinic/table logic, route/environment penalties, service outcomes. |
| `11038-11929` | Resident and incident logic | Resident needs/routines, confrontation creation, incident intervention/resolution, resident role counts. |
| `11930-12864` | Resources, economy, metrics, effects | Resource production/consumption, payroll/taxes, random failures, `computeMetrics`, effect expiry. |
| `12865-13569` | `createInitialState` | Creates the mutable `StationState`, starter hull, starter bridge module, metrics object, controls, effects, counters, caches, RNG. |
| `13570-14251` | Expansion, tile/room mutators, food-chain and housing inspectors | Public build/expansion APIs and inspector helpers. |
| `14252-14716` | Actor inspectors | Visitor, resident, and crew inspector derivation. |
| `14717-15283` | Module/resource/command/crew controls | Module placement/removal, material/raw-food buy/sell, command specialty/staff controls, crew hire/fire. |
| `15284-15440` | Dock and berth controls | Dock lookup/config APIs, berth config APIs, public dock placement validation. |
| `15441-15536` | `tick` | Fixed-order simulation pipeline. Mutates `state` in place. |

## Public API Surface

`src/sim/index.ts` intentionally re-exports a smaller app-facing surface for `main.ts`. Direct `sim.ts` consumers still exist:

| Consumer | Direct dependency |
| --- | --- |
| `src/main.ts` | Uses `src/sim/index.ts` barrel. |
| `src/render/render.ts` | Imports render-adjacent helpers from `src/sim/sim.ts`, including queue targets, diagnostics, wall-mounted module service tile, berth/dock validation. |
| `src/render/door-dock-detail-layer.ts` | Imports `getDockByTile`. |
| `src/sim/save.ts` | Imports state creation, tick, dock/berth setters, and module placement from `sim.ts`. |
| `src/sim/scenarios.ts` | Imports sim helpers for deterministic fixture builders. |
| `tools/sim-tests.ts` | Imports broad direct API from `sim.ts`, including internal diagnostics and reservation/path helpers. |
| `tools/sim-perf.ts` | Imports `createInitialState`, `expandMap`, and `tick`. |

Do not rename public exports during extraction unless a compile-visible alias is preserved.

## Determinism Rules

- `StationState` is mutated in place. Do not replace the outer state object.
- Preserve `state.rng()` call count and order. Some code intentionally consumes placeholder RNG draws to keep seeded scenarios stable.
- `generateSystemMap(seed)` uses a sub-seed and must not consume the primary `state.rng`.
- `generateLaneProfiles` currently consumes primary RNG draws during initial state creation even when system-map lane weights are used.
- Path behavior is deterministic for a given state, path intent, occupancy map, and route seed. If path key ingredients move, keep the cache key identical.
- `tick` order is gameplay behavior. Extraction can move function definitions, but should not reorder calls.

## Cache and Version Model

`StationState` has four version counters:

| Counter | Invalidates |
| --- | --- |
| `topologyVersion` | Tile topology, pressurization, path cache, render/static topology dependent caches. |
| `roomVersion` | Room clusters, service targets, queue targets, active room diagnostics, berth-config pruning. |
| `moduleVersion` | Module occupancy, item nodes, service targets, diagnostics. |
| `dockVersion` | Dock entity and dock-by-tile caches. |

Derived caches live under `state.derived` and are refreshed by `ensureDerivedUpToDate`, `ensurePressurizationUpToDate`, `ensureDockEntitiesUpToDate`, `ensureDockByTileCache`, and related helpers. Any extracted module that mutates topology, rooms, modules, or docks must call the same bump helper it used before extraction.

## Tick Pipeline

Current `tick(state, frameDt)` order:

1. Reset tick perf counters.
2. Ensure crew, resident population placeholder, dock caches, item-node cache, pressurization, room ops, security aura, occupancy, legacy crew post cleanup.
3. If paused: clean reservations, refresh reservations/jobs/metrics/unlocks/command progress, record `tickMs`, return.
4. Scale `frameDt` by `state.controls.simSpeed`, advance `state.now`, consume cadences.
5. Update traffic schedule, spawns, arriving ships, resident move-in, effects, reservations, payroll, taxes, material auto-import.
6. When the job board cadence is due: create food/cook/trade/material/construction/sanitation jobs and assign idle crew.
7. Requeue/expire jobs, refresh pressurization and room ops, update maintenance, fires, resources, tier-3 patient creation.
8. Rebuild occupancy, update crew, recompute security aura, update critical staff, residents, confrontations, visitors, sanitation, dispatch incidents, incident pipeline, construction cleanup.
9. Release closed reservations, refresh reservation/job metrics, derived caches, metrics, unlocks, command progress, random failures, `tickMs`.

## First Safe Extraction Candidate

The safest first extraction is the small module geometry cluster currently near `sim.ts:691-760`:

- `moduleFootprint`
- `moduleMount`
- `footprintTiles`
- private `adjacentWalkableTiles`
- exported `wallMountedModuleServiceTile`
- exported `resolveWallMountedModuleFacing`

Why this is safest:

- No `state.rng()` calls.
- No `tick` ordering.
- No cache version bumps.
- Reads only `state.tiles`, `state.pressurized`, dimensions, and `MODULE_DEFINITIONS`.
- Existing public exports can be re-exported from `sim.ts` without changing callers.
- The functions already form a compact dependency cluster used by module placement, construction, air/maintenance helpers, and rendering.

Planned target file: `src/sim/module-geometry.ts`.

