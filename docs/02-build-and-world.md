# Build &amp; World

How the player shapes the station: tiles, zones, rooms, modules, expansion, materials. **There is no construction queue and no builder NPC — placement is instant.** Materials drain at place-time.

## Layers

The world is two layers stacked on the same grid:

1. **Physical layer (`tiles[]`)** — what walks where. `TileType` (`src/sim/types.ts:12`): Space, Floor, Wall, Dock, Cafeteria, Reactor, Security, Door. Cafeteria/Reactor/Security are *floor skins* — they only change which tile sprite renders. They do not gate gameplay (rooms do).
2. **Logical layer (`rooms[]`)** — what the tile is *for*. `RoomType` (`types.ts:32`, 16 entries): Cafeteria, Dorm, Hygiene, Kitchen, Workshop, Hydroponics, LifeSupport, Lounge, Market, Reactor, Security, LogisticsStock, Storage, Clinic, Brig, RecHall.

Plus a third independent layer:

3. **Zones (`zones[]`)** — `ZoneType` (`types.ts:23`): Public or Restricted. Restricted tiles refuse visitor pathing unless the goal is itself restricted. Visitors that step into a restricted tile may trigger a trespass incident (`08-incidents-effects.md`).

## Modules

`ModuleType` at `types.ts:54` (19 types). Modules are placeable interactables with footprint 1×1, 2×1, or 2×2. Each is owned by a `ModuleInstance` (`types.ts:...`) — for a 2×2 module, all 4 tiles share one instance.

**Module catalog** is in `src/sim/balance.ts:14` (`MODULE_DEFINITIONS`). Each entry has:

- `footprint` — `[w, h]`
- `rotatable` — boolean
- `allowedRooms` — RoomType[]
- `itemNodeCapacity` — optional; if set, this module gets an `ItemNode` and can store items
- `visitorCapacity` / `reservationCapacity` — Tables seat 3 diners with 4 reservation slots
- `residentCapacity` — Bed = 2

**Notable modules with item nodes:** Stove (rawMeal in, meal out), GrowStation (rawMeal out), ServingStation (meal in, visitors take), MarketStall (tradeGood in, visitors buy), IntakePallet (rawMaterial in), StorageRack (rawMaterial buffer), Workbench (no node — workshop produces from room-pooled rawMaterial).

## Build flow (player-facing)

1. Player clicks a tool from the build palette (toolbar in `main.ts:wireToolbar` `main.ts:2273`) or hits a hotkey (`main.ts:3150`–3354 — see `12-ui.md`).
2. Tool selection is gated by tier. Locked rooms/modules show in the palette but tooltip-only; `selectRoomTool` / `selectModuleTool` (`main.ts:1147`/1156) check `isRoomUnlocked` / `isModuleUnlocked` and stash a `toolLockMessage`.
3. Click-drag paints a rectangle. `applyRectPaint` (`main.ts:2925`) iterates the rect and calls into sim mutators.
4. Hover shows a green/red preview (`render.ts:1562`).
5. Materials are deducted at place-time (no queue, no NPC).

## Sim mutators

All mutators bump version counters and clear caches. **All return false on failure rather than throwing.**

| Function | File:Line | What it does |
|---|---|---|
| `setTile` | `sim.ts:7700` | Direct tile write; clears occupancy/modules/room/body tiles/incidents on the cell. Bumps `topologyVersion`. Rebuilds dock entities if Dock-ness changes. |
| `trySetTile` | `sim.ts:7735` | Gated `setTile`. Validates dock placement, requires path connectivity to core (`isConnectedToCore`), consumes `tileDistanceBuildCost(delta)`. |
| `setRoom` | `sim.ts:7763` | Only on walkable tiles. Gated by `isRoomUnlocked`. Auto-flips zone to Restricted on Dorm. |
| `setRoomHousingPolicy` | `sim.ts:7785` | Per-cluster — affects all tiles of the same connected room. |
| `tryPlaceModule` | `sim.ts:8061` | Tier-gated. Checks `MODULE_DEFINITIONS.allowedRooms`, footprint walkability, room boundary, no module overlap. Special-cases WallLight via `resolveWallLightFacing` (`sim.ts:8115`). |
| `setModule` | `sim.ts:8139` | Fallback for scenarios — places a `legacyForced: true` 1×1 module ignoring footprint rules when `tryPlaceModule` would fail. **Don't tighten this without checking `scenarios.ts`.** |
| `setZone` | `sim.ts:7757` | Public/Restricted paint. |
| `expandMap` | `sim.ts:7553` | Buys 40 tiles in a direction (see Expansion below). |

## Materials &amp; construction cost

There are two material accounting models running side-by-side:

1. **`legacyMaterialStock`** (a flat number on `state`) — the bootstrap stockpile.
2. **Per-room item stocks** (`rawMaterial` items at LogisticsStock + Storage rooms) — once those rooms exist, materials migrate into their item nodes.

The HUD's "Materials" reading is the union of both: `legacyMaterialStock + sumRoomTradeGoods('rawMaterial', LogisticsStock+Storage)` (`sim.ts:6270`). `consumeConstructionMaterials` (`sim.ts:4077`) drains from both buckets.

**Cost per tile.** `MATERIAL_COST` (`sim.ts:107`–116) is the base material per tile-type, scaled by `BUILD_DISTANCE_MULTIPLIER * Manhattan(core, tile)` (`sim.ts:205`, applied in `tileDistanceBuildCost` `sim.ts:1723`). Far-away tiles cost more — this is the directional-docking + structural-expansion MVP from `build-contstrain-feature.md`.

## Map expansion

Players can buy four directional expansions (one-time each) for credits:

- `EXPANSION_STEP_TILES = 40` (`sim.ts:218`)
- `EXPANSION_COST_TIERS = [2000, 4000, 6000, 8000]` (`sim.ts:219`)

`expandMap` (`sim.ts:7553`) rebuilds every tile array, remaps every actor/job/incident/dock/module index, and bumps `topologyVersion`. UI: top-bar icon → modal → `handleExpandDirection` (`main.ts:3356`) which recenters the viewport.

## Player framing

The strategic loop is *layout + flow*. The player decides where rooms go; haulers (crew) decide routing through the layout. A miss-placed Workshop creates job stalls and lights up the alerts panel. Restricted zones are the lever for keeping visitors out of Reactor/Security areas — paint them aggressively or your trespass incidents pile up.

## Tunables

- `MATERIAL_COST`, `BUILD_DISTANCE_MULTIPLIER` (`sim.ts:107`, 205)
- `EXPANSION_COST_TIERS` (`sim.ts:219`)
- `MODULE_DEFINITIONS` and `ROOM_DEFINITIONS` (`balance.ts:14`)
- All `requiredModules` / `requiredAnyOf` / `activationChecks` per room

## Trip-wires

- `setRoom` silently fails on non-walkable tiles. If your scenario is missing a room paint, check whether the underlying tile is Floor.
- `setModule` falls through to `legacyForced: true` 1×1 — scenarios depend on this. Tightening the fallback breaks scenario fixtures.
- The HUD's "Materials" number is *not* `legacyMaterialStock` alone. Use `metrics.materials` (`sim.ts:6270`) when computing UI text.
- WallLight needs the wall above the floor to face open space — `resolveWallLightFacing` (`sim.ts:8115`) is finicky.
- Adding a new module: also update `MODULE_DEFINITIONS` (with `allowedRooms`), the relevant ROOM_DEFINITIONS' `requiredModules`, and the build palette in `main.ts`. Don't forget the unlock-tier mapping in `unlocks.ts:148` if the module is gated.
