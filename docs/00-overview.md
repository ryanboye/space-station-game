# Overview

A browser-based station-management sim, TypeScript + Vite, no UI framework. The game runs entirely client-side; the only server-side bits are the build pipeline and a static deploy.

## Repo map

```
src/
  main.ts              ← single DOM driver (4349 lines, no React/Vue)
  sim/
    sim.ts             ← the tick loop and all gameplay rules (8509 lines)
    types.ts           ← StationState shape + every enum (1129 lines)
    save.ts            ← schema v2 + migration
    scenarios.ts       ← deterministic test fixtures (40+ scenarios)
    cold-start-scenarios.ts ← ?scenario=NAME URL overlay
    path.ts            ← A* over the tile grid
    balance.ts         ← MODULE_DEFINITIONS, ROOM_DEFINITIONS, rates
    content/
      unlocks.ts       ← tier definitions and predicates
      progression-tooltips.ts
      ships.ts
      residents.ts
  render/
    render.ts          ← orchestrator (1738 lines)
    sprite-atlas.ts    ← atlas loader
    sprite-keys.ts     ← gameplay-stable sprite-key contracts
    sprite-keys-extended.ts ← agent variants, FX, dock overlays
    tile-variants.ts   ← per-cell wall variant picker
    wall-dual-tilemap.ts  ← 6-shape dual-tilemap autotiler (PR #98)
    wall-detail-layer.ts  ← rim/bevel/wall-light overlay (PR #98)
    glow-pass.ts       ← additive emitters (lights, stoves, reactor)
    room-label-layer.ts
    door-dock-detail-layer.ts
    progression/       ← quest-bar, flash, tooltip, wire, button-state
tools/                 ← sprite pipeline, harness, sim-tests, deploy
  sprites/             ← gen → postprocess → pack → validate (see 13)
  harness/             ← Playwright visual regression
  deploy/              ← systemd timer + build.sh for the BMO mirror
public/assets/sprites/ ← atlas.png + atlas.json (runtime art)
docs/                  ← you are here
```

Product strategy now lives in `docs/` with the rest of the knowledge base:

- `docs/15-current-roadmap.md` — roadmap index and shared product direction.
- `docs/16-roadmap-part-1-living-actors-jobs.md` — Part 1: reservations, providers, logistics, job board, roles, residents.
- `docs/17-roadmap-part-2-utilities-hazards-sanitation.md` — Part 2: access, districts, utilities, hazards, maintenance, sanitation.
- `docs/18-roadmap-part-3-command-map-contracts.md` — Part 3: command center, system map, contracts, station identity, incidents.
- `VISION_DRAFT.md` — short vision statement, intentionally not an implementation checklist.
- `PRODUCT_PLAN.md` and `IMPLEMENTATION_PHASES.md` — retired pointers kept so old links do not mislead agents.
- `README.md` — quickstart, GH Pages setup, save sharing.

When working on a feature, read `docs/15-current-roadmap.md` first, then the relevant system doc and `99-trip-wires.md`.

## Core concepts

**Tile.** The grid cell. `(x,y)` flattens to `index = y * width + x`. Tile size is 32 px (`types.ts:1`). Default grid 60×40.

**`TileType`** (`types.ts:12`) — Space, Floor, Wall, Dock, Cafeteria, Reactor, Security, Door. The Cafeteria/Reactor/Security tile values are *floor skins* that only affect rendering — they do not gate gameplay (rooms do that).

**Zone** (`types.ts:23`) — Public or Restricted. Restricted tiles refuse visitor pathing unless the goal is restricted. Painted independently of tiles.

**Room** (`types.ts:32`, 16 types) — a logical zone painted on top of walkable tiles. Rooms gate behavior: a Cafeteria with no Tables won't activate; a Hydroponics with no GrowStation produces nothing. Room activation rules live in `balance.ts:14` (`MODULE_DEFINITIONS`) and the matching ROOM_DEFINITIONS block.

**Module** (`types.ts:54`, 19 types) — placeable interactable. Footprint is 1×1, 2×1, or 2×2. Modules belong to rooms and produce/consume per-tick at rates from `balance.ts`. Items live at `ItemNode`s attached to specific modules (Stove, GrowStation, MarketStall, IntakePallet, StorageRack, ServingStation).

**Agent** — visitor, resident, or crew. All move via A* (`path.ts:94`) on the tile grid. Visitors arrive on ships and depart; residents are converted visitors who live on the station; crew are hired posts/haulers.

**Cycle** — 15 seconds (`CYCLE_DURATION` `sim.ts:81`). Each cycle, ship arrivals are rolled. **There is no day/night cycle as a gameplay rule.** The HUD shows "Cycle N | Day M" but Day is `floor(cycle / 8)` and the sim does nothing differently per day (`main.ts:1259`).

**Tier** — progression gate (T0 → T6). Lifetime monotonic counters trigger advances; locked rooms/modules tooltip-only at the build palette. See `09-progression.md`.

## State shape (one-paragraph version)

The whole game lives in one mutable `StationState` (`types.ts:933`). It owns flat per-tile arrays (`tiles`, `zones`, `rooms`, `modules`, `pressurized`), agent arrays (`visitors`, `residents`, `crewMembers`), `jobs` (transport queue), `incidents`, `metrics` (a fat HUD aggregate, `types.ts:424`), `controls` (UI flags + sliders), `effects` (timed buffs/debuffs/blocked tiles), `derived` (caches keyed by version counters), and `usageTotals` (rolling sums for rating bonuses). Topology mutations bump `topologyVersion` / `roomVersion` / `moduleVersion` / `dockVersion`; downstream caches re-derive when their key version drifts.

## How a tick flows

`main.ts:frame()` (`main.ts:3890`) per-rAF:

1. `tick(state, dt)` — runs the sim pipeline (`sim.ts:8444`).
2. `renderWorld(...)` — paints the canvas (`render.ts:1381`).
3. UI refresh — at most every 125 ms, re-write right-sidebar HTML (`UI_REFRESH_INTERVAL_MS` `main.ts:3862`).

The tick itself is a fixed-order pipeline (see `01-simulation.md`). It does not sub-step.

## How the renderer pulls from sim

Renderer **never mutates** state. It reads `state.tiles`, `state.modules`, agent arrays, `state.metrics`, and `state.controls.*`. Three caches (`staticLayer`, `decorativeLayer`, `glowLayer`) repaint only when their key versions change. Dynamic overlays (depressurized wash, blocked tiles, agents, ships, hover) repaint every frame.

See `11-render.md`.

## Where to go next

- New gameplay system → `01-simulation.md`, then the relevant subsystem doc.
- Adding a tile/room/module → `02-build-and-world.md` + `09-progression.md`.
- Touching air/power/water/path → `03-utilities.md`.
- Adding a sprite → `11-render.md` + `13-pipelines.md`.
- Modifying UI → `12-ui.md`.
- Saving / loading / migration → `12-ui.md` (save section).
- Anything that fights with caches → `99-trip-wires.md`.
