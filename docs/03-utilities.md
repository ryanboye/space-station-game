# Utilities — Pressurization, Air, Power, Water, Pathing

The "connected" systems that propagate or flow across the grid. Pressurization and local air are spatial; power and water are still mostly global pools modulated by active rooms, maintenance, and topology.

## Pressurization (vacuum / depressurize)

**`computePressurization`** at `src/sim/sim.ts:1793`. Flood-fills *inward* from every outer-edge non-barrier tile, marking every reached tile as "vacuum-reachable" (= depressurized). Built tiles that are not reachable are pressurized.

Invoked through **`ensurePressurizationUpToDate`** (`sim.ts:1104`), which gates on `derived.cacheVersions.pressurizationTopologyVersion !== state.topologyVersion`. The function rebuilds `state.pressurized` from scratch each call — there is no incremental BFS.

### What counts as a pressure barrier

`isPressureBarrier(tile)` (`src/sim/types.ts:1113`) returns true for `Wall` and `Door`. **Doors are barriers.** This is critical — if you remove Door from the barrier set, every door tile creates a leak point and the depressurize overlay misfires across the whole interior.

Outer-hull `Dock` tiles are *also* treated as barriers, but that logic is *inlined* in `computePressurization` via `isOuterHullTile` (`sim.ts:1555`) — a Dock that touches the grid edge or borders Space outside the hull. **Adding outer-hull-Dock-aware logic elsewhere requires duplicating that check.**

### Outputs

- `state.pressurized[i]` — boolean per tile.
- `state.metrics.leakingTiles` — count of unreachable-from-vacuum tiles that should be sealed but aren't.
- `state.metrics.pressurizationPct` — fraction of buildable tiles that are pressurized.

### Render hook

The depressurized tiles get a red wash overlay at `src/render/render.ts:1446`–1449. **Alpha is 0.08, not 0.22.** It was dropped from 0.22 → 0.08 on 2026-04-23 because it was compounding with the inactive-room dim and turning every interior rust-brown when the demo-station's doors-as-barrier sealed. **Don't bump it back up without verifying this case.** See `99-trip-wires.md`.

### Player framing

Build a sealed shell of walls. Doors count as walls for pressure but are still walkable. Punch a hole and air bleeds out — visible as `pressurizationPct` dropping and red-tinted floor. Life-support modules pump air back when active.

## Air (`metrics.airQuality`, 0–100%) and local air

Updated in `updateResources` (`sim.ts:6280`–6296):

- **Demand** — `(residents * 0.12 + visitors * 0.05 + crew * 0.08)` per second.
- **Supply** — `LIFE_SUPPORT_AIR_PER_TILE = 1.55/6` (`sim.ts:212`) per active LifeSupport tile, plus passive `pressurizationPct/100 * PASSIVE_AIR_PER_SEC_AT_100_PRESSURE` where the constant is `0.45` (`sim.ts:213`).
- Net delta multiplied by 1.7. Leak penalty subtracts.

Air quality below thresholds drives:

- Air-distress for visitors/residents (see `06-visitors-residents.md`).
- Air emergencies that wake crew from rest (`CREW_EMERGENCY_WAKE_RATIO = 0.15`, `sim.ts:186`).
- Alerts panel entries.

Life-support output is now multiplied by maintenance health. Each life-support room cluster has a `MaintenanceDebt` entry; debt below 30 is harmless, debt above 30 lowers active air/water output, and severe debt appears in room warnings.

Life-support coverage is measured spatially. Active life-support source tiles run a multi-source BFS through walkable, pressurized tiles. Vent modules act as secondary air sources if their adjacent service tile is reachable from life support.

- `lifeSupportCoveragePct`
- `avgLifeSupportDistance`
- `poorLifeSupportTiles`

Rooms disconnected from active life support show an inspector warning. Actors now use local tile air for exposure, so a sealed but disconnected wing can become dangerous even when the global HUD average looks acceptable.

### Vents

Vent modules are wall-mounted. The module sits on a Wall tile, but the adjacent walkable service tile is what projects air. This keeps vents visually/physically in the wall while still letting air coverage, construction, and future repairs operate from a reachable floor tile.

## Power

`computeMetrics` (`sim.ts:6510`–6526):

- `BASE_POWER_SUPPLY = 14` (`sim.ts:99`)
- `POWER_PER_REACTOR = 22` (`sim.ts:100`)
- Demand summed across active rooms with per-room weights.
- Reactor output is multiplied by reactor maintenance health. Debt above 30 gradually lowers output; severe debt can become the top room warning.
- `powerRatio` = `clamp(supply / demand, 0.35, 1.0)` (`sim.ts:6193`).
- `powerRatio` scales hydroponics, kitchen, workshop, and life-support output — a brownout shrinks throughput proportionally without taking systems fully offline.

A power deficit doesn't kill rooms; it just thins their output.

## Maintenance Debt, Fire, and Wall Fixtures

Reactor and life-support room clusters accumulate `MaintenanceDebt`. The debt key is `system:anchorTile`, where the anchor is the lowest tile index in the cluster. Built but idle clusters rise slowly; active reactor/life-support clusters rise faster, with extra pressure from power deficits or low air.

Crew assigned to the matching utility system and standing in that cluster reduce debt. Once debt reaches 30, it opens a maintenance need and can pull crew back to the utility post through the existing critical-staffing assignment path. Metrics:

- `maintenanceDebtAvg`
- `maintenanceDebtMax`
- `maintenanceJobsOpen`
- `maintenanceJobsResolvedPerMin`

High reactor/life-support debt can ignite fires. Fires grow, spread, block/damage tiles, and create extinguish jobs. FireExtinguisher modules are wall-mounted and suppress fires from their adjacent service tile, which is the same pattern future mechanical/electrical fixtures should use.

## Water (`metrics.waterStock`, 0–260)

`updateResources` (`sim.ts:6272`–6278):

- Generated by active LifeSupport at `*0.72 * powerRatio`.
- Drained by residents and crew.
- Hygiene actions also consume water (`sim.ts:6024`).

Water hits zero → hygiene actions fail → resident hygiene need decays unmitigated → leaveIntent climbs.

## Food chain (related but not strictly a utility)

Food has no global pool — it lives at module item nodes. See `04-logistics.md` for the chain (Hydroponics rawMeal → Kitchen meals → Cafeteria ServingStation → visitors).

## Pathing (A*)

Every NPC navigation goes through **`findPath`** at `src/sim/path.ts:94`. Heap-backed A* (the heap is `MinHeap` at `path.ts:10`).

### Walkability

`isWalkable(tile)` (`types.ts:1080`–1087, 1101) returns true for Floor, Dock, Cafeteria, Reactor, Security, **Door**. (Doors are walkable but pressure barriers — a useful asymmetry.)

### Filters

Inside `findPath`:

- Restricted-zone tiles are filtered unless `allowRestricted=true` or the tile is the goal (`path.ts:133`).
- Tiles with active `effects.blockedUntilByTile` (random-event corridor blocks) are skipped (`path.ts:131`).
- `occupancyByTile` adds a soft penalty `min(3, occupancy * 0.45)` to gScore so paths spread under congestion (`path.ts:135`).

Manhattan heuristic (`path.ts:75`).

### Cache

`cachedPathLookup` (`sim.ts:651`) keys on `(start, goal, allowRestricted, topologyVersion, roomVersion)`. TTL 0.45 s, capacity 1200 entries (`PATH_CACHE_TTL_SEC` / `PATH_CACHE_MAX_ENTRIES` `sim.ts:220`–221). The cache is consulted from sim callers, not from `path.ts` directly — `path.ts` is the raw kernel.

### Outputs

`findPath` returns a `number[]` of *next* tile indices (the start tile is excluded by `rebuildPath` at `path.ts:83`). `null` when unreachable. Most callers do `findPath(...) ?? []`.

### Blocked-tile retry cascade

`BLOCKED_REPATH_TICKS = 3`, `BLOCKED_LOCAL_REROUTE_TICKS = 6`, `BLOCKED_FULL_REROUTE_TICKS = 10` (`sim.ts:132`–134). Visitor rerouting cascade lives at `sim.ts:5144`–5154.

## Trip-wires

- **`computePressurization` is at `sim.ts:1793`.** Earlier docs cited 1773 — that was a moving target during PR #104.
- **Doors must remain pressure barriers** (`isPressureBarrier` `types.ts:1113`). Removing Door breaks the demo-station seal.
- **Outer-hull Docks are barriers via inlined `isOuterHullTile`** (`sim.ts:1555`), not via `isPressureBarrier`. Adding hull-Dock-aware checks elsewhere needs duplication.
- **Pressurization rebuilds from scratch on each call** — no incremental BFS. If you need a finer tick-rate you'll have to write one.
- **Static-render cache key includes `wallRenderMode`** (`render.ts:1027`) — but pressurization is independent of render mode. Don't tie them.
- `findPath` does **not** support diagonals.
- Pressurization re-runs only when topology changes — placing a non-barrier tile won't invalidate the cache. That's fine because non-barriers can't change pressurization.
- Wall-mounted utility modules should route effects and jobs through their adjacent service tile, not their wall tile.
