# Build &amp; World

How the player shapes the station: tiles, zones, rooms, modules, expansion, materials, construction jobs, and EVA work. Build orders create blueprints; crew haul materials and finish the work site.

## Layers

The world is two layers stacked on the same grid:

1. **Physical layer (`tiles[]`)** — what walks where. `TileType` (`src/sim/types.ts:12`): Space, Truss, Floor, Wall, Dock, Cafeteria, Reactor, Security, Door, Airlock. Cafeteria/Reactor/Security are *floor skins* — they only change which tile sprite renders. They do not gate gameplay (rooms do). Truss is exterior scaffold: not walkable for normal pathing, not pressurized, and not room-paintable.
2. **Logical layer (`rooms[]`)** — what the tile is *for*. `RoomType` (`types.ts:32`, 16 entries): Cafeteria, Dorm, Hygiene, Kitchen, Workshop, Hydroponics, LifeSupport, Lounge, Market, Reactor, Security, LogisticsStock, Storage, Clinic, Brig, RecHall.

Plus a third independent layer:

3. **Zones (`zones[]`)** — `ZoneType` (`types.ts:23`): Public or Restricted. Restricted tiles refuse visitor pathing unless the goal is itself restricted. Visitors that step into a restricted tile may trigger a trespass incident (`08-incidents-effects.md`).

## Modules

`ModuleType` at `types.ts:54` (19 types). Modules are placeable interactables with footprint 1×1, 2×1, or 2×2. Each is owned by a `ModuleInstance` (`types.ts:...`) — for a 2×2 module, all 4 tiles share one instance.

**Module catalog** is in `src/sim/balance.ts:14` (`MODULE_DEFINITIONS`). Each entry has:

- `footprint` — `[w, h]`
- `rotatable` — boolean
- `allowedRooms` — RoomType[]
- `mount` — optional; `wall` modules sit on Wall tiles and are serviced from an adjacent walkable tile
- `itemNodeCapacity` — optional; if set, this module gets an `ItemNode` and can store items
- `visitorCapacity` / `reservationCapacity` — Tables seat 3 diners with 4 reservation slots
- `residentCapacity` — Bed = 2

**Notable modules with item nodes:** Stove (rawMeal in, meal out), GrowStation (rawMeal out), ServingStation (meal in, visitors take), MarketStall (tradeGood in, visitors buy), IntakePallet (rawMaterial in), StorageRack (rawMaterial buffer), Workbench (no node — workshop produces from room-pooled rawMaterial).

**Wall-mounted utility modules:** WallLight, Vent, and FireExtinguisher live on Wall tiles. They require an adjacent walkable service tile. The wall tile owns the module, but air projection, fire suppression, construction, and future repairs use the service side so crew do not try to stand inside the wall.

## Build flow (player-facing)

1. Player clicks a tool from the build palette (toolbar in `main.ts:wireToolbar` `main.ts:2273`) or hits a hotkey (`main.ts:3150`–3354 — see `12-ui.md`).
2. Tool selection is gated by tier. Locked rooms/modules show in the palette but tooltip-only; `selectRoomTool` / `selectModuleTool` (`main.ts:1147`/1156) check `isRoomUnlocked` / `isModuleUnlocked` and stash a `toolLockMessage`.
3. Click-drag paints a rectangle. `applyRectPaint` (`main.ts:2925`) iterates the rect and calls into sim mutators.
4. Hover shows a green/red preview (`render.ts:1562`).
5. Tile/module placement creates a `ConstructionSite`. Crew haul raw materials from storage/logistics or the bootstrap stockpile, then build at the site.
6. Exterior tile builds require an airlock/EVA route. Crew suit up through the airlock and work outside.
7. The Cancel Build tool removes blueprints by drag and refunds delivered materials.

### Truss expansion prototype

The truss expansion loop is hidden behind the `?truss` URL flag while it is being playtested. With the flag enabled, the Structure palette adds a Truss tool:

- Truss costs 1 material, charges that scaffold kit when the blueprint is placed, and skips the normal material-hauling phase. Crew still go outside for a quick EVA weld.
- Truss counts as a structural build anchor, so scaffold can chain outward from the hull or from another planned truss.
- Truss stays outside the pressure/room model. It is scaffold, not usable station floor.
- Painting Floor over existing truss calls `buildStationExpansionOnTruss`, converting the selected scaffold into Floor and automatically adding a perimeter Wall shell plus one Door through the shared hull when needed.
- The conversion uses discounted shell costs (`TRUSS_EXPANSION_FLOOR_COST` and `TRUSS_EXPANSION_PERIMETER_COST`) so the prototype tests whether expansion pressure can move from "can I afford every wall/floor tile up front?" to "can I stage scaffold, then fit out the shell?"

## Sim mutators

All mutators bump version counters and clear caches. **All return false on failure rather than throwing.**

| Function | File:Line | What it does |
|---|---|---|
| `setTile` | `sim.ts:7700` | Direct tile write; clears occupancy/modules/room/body tiles/incidents on the cell. Bumps `topologyVersion`. Rebuilds dock entities if Dock-ness changes. |
| `trySetTile` | `sim.ts:7735` | Gated `setTile`. Validates dock placement, requires path connectivity to core (`isConnectedToCore`), consumes the flat material-cost delta for the target tile type. |
| `planTileConstruction` | `sim.ts` | Creates a tile construction blueprint instead of directly mutating the tile. Exterior tiles require hull/planned adjacency. |
| `buildStationExpansionOnTruss` | `sim.ts` | Flagged prototype helper: turns selected Truss scaffold into Floor, auto-generates perimeter Wall/Door tiles, validates structural and walkable core connection, and consumes discounted shell materials. |
| `planModuleConstruction` | `sim.ts` | Creates a module construction blueprint after validating footprint/mount/room rules. |
| `cancelConstructionAtTile` | `sim.ts` | Removes a matching blueprint or module footprint blueprint and refunds delivered materials. |
| `setRoom` | `sim.ts:7763` | Only on walkable tiles. Gated by `isRoomUnlocked`. Auto-flips zone to Restricted on Dorm. |
| `setRoomHousingPolicy` | `sim.ts:7785` | Per-cluster — affects all tiles of the same connected room. |
| `tryPlaceModule` | `sim.ts:8061` | Tier-gated. Checks `MODULE_DEFINITIONS.allowedRooms`, footprint walkability or wall mount, service tile, room boundary, no module overlap. |
| `setModule` | `sim.ts:8139` | Fallback for scenarios — places a `legacyForced: true` 1×1 module ignoring footprint rules when `tryPlaceModule` would fail. **Don't tighten this without checking `scenarios.ts`.** |
| `setZone` | `sim.ts:7757` | Public/Restricted paint. |
| `expandMap` | `sim.ts:7553` | Buys 40 tiles in a direction (see Expansion below). |

## Room activation — *why a painted room is "inactive"*

**Painting a room is not enough — the cluster has to *activate* to do anything.** Activation is the moment a room transitions from "tiles painted but doing nothing" to "modules running, visitors using it, contributing to metrics." If you paint a Cafeteria but visitors never eat there, it almost certainly hasn't activated.

A room activates when ALL the following are true:

1. **Cluster size ≥ `minTiles`.** The contiguous painted area must hit the minimum.
2. **All `requiredModules` are placed inside the cluster** at the required counts.
3. **`activationChecks` pass** (per-room; see table below):
   - **`door: true`** — at least one Door tile must be on the cluster's perimeter (the wall-tile border of the room). Open-plan rooms (no internal walls between them) won't activate — the room needs its own walled enclosure with a door.
   - **`path: true`** — a path must exist from the room to the station's core / dock for visitors and crew to actually reach it.
   - **`pressurization: true`** — the room's tiles must be pressurized (sealed by walls + door, no leaks).

If ANY check fails, the room is **inactive**: no production, no visitor service, no incident detection, no contribution to metrics. There is **no on-screen alert** explaining the failure — you have to **click the room and read the inspector's `Inactive reasons:` line.** (The alerts panel surfaces some warnings but not the per-room inactive reasons — see `docs/12-ui.md` trip-wires.)

### Per-room activation requirements

Source: `src/sim/balance.ts:132` (`ROOM_DEFINITIONS`).

| Room | minTiles | Required modules | door | path | pressurization | staffed |
|---|---|---|---|---|---|---|
| Cafeteria | **12** | 1 ServingStation + 2 Tables | ✓ | ✓ | ✓ | — |
| Kitchen | **8** | 1 Stove | ✓ | ✓ | ✓ | — |
| Hydroponics | **8** | 1 GrowStation | ✓ | ✓ | ✓ | — |
| Workshop | **10** | 1 Workbench | ✓ | ✓ | ✓ | — |
| Market | **10** | 1 MarketStall | ✓ | ✓ | ✓ | — |
| LogisticsStock | **6** | 1 IntakePallet | ✓ | ✓ | ✓ | — |
| Storage | **8** | 2 StorageRack | ✓ | ✓ | ✓ | — |
| Dorm | **6** | 1 Bed | ✓ | ✓ | ✓ | — |
| Hygiene | **8** | 1 Shower + 1 Sink | ✓ | ✓ | ✓ | — |
| LifeSupport | **6** | — | ✓ | ✓ | ✓ | — |
| Lounge | **10** | any of: Couch / GameStation | ✓ | ✓ | ✓ | — |
| RecHall | **10** | 1 RecUnit | ✓ | ✓ | ✓ | — |
| Clinic | **8** | 1 MedBed | ✓ | ✓ | ✓ | — |
| Reactor | 4 | — | ✓ | ✓ | (no) | — |
| Security | **6** | 1 Terminal | ✓ | ✓ | ✓ | **required** |
| Brig | **8** | 1 CellConsole | ✓ | ✓ | ✓ | **required** |
| Berth | 4 (v0) | capability modules by ship type | (no) | (no) | (no) | one edge open to space |

### Common "why is my room inactive" failures

- "**below minimum size**" — paint more floor + room until cluster ≥ minTiles.
- "**missing required modules**" — count exact required modules. Cafeteria especially needs ServingStation + 2× Tables (not 1).
- "**missing door**" — the room cluster's *perimeter* must have a Wall tile that is a Door. Paint Wall around the room (turning open-plan to enclosed), then paint a Door tile in that wall.
- "**not pressurized**" — leaks. Outer Wall is missing somewhere or there's a path to space tiles.
- "**path blocked**" — the room can be reached by walking only through doors and walkable tiles? If isolated, paint a corridor.
- "**too large for service nodes**" — Cafeteria with 12 tiles but only 1 Table = the throughput per tile is too low. Add more tables/serving stations until "ok".
- "**berth needs one edge open to space**" — Berth room paint is a ship bay, not an enclosed room. At least one berth tile must touch Space or the map edge.
- Berth support placement is edge-aware: Gangway belongs on the open-to-space edge, Cargo Arm belongs on a berth edge, and Customs can sit anywhere inside the berth.

### Practical playtesting workflow

When testing programmatically (the harness): **don't just paint the room — also paint walls + a door + verify minTiles + place all required modules.** The `room=N` field in the snapshot will show the room is painted, but `room.active=false` until activation succeeds. Use `getRoomDiagnosticAt(state, tileIndex)` to read the live `inactive reasons` per cluster.

---

## Materials &amp; construction cost

There are two material accounting models running side-by-side:

1. **`legacyMaterialStock`** (a flat number on `state`) — the bootstrap stockpile.
2. **Per-room item stocks** (`rawMaterial` items at LogisticsStock + Storage rooms) — once those rooms exist, materials migrate into their item nodes.

The HUD's "Materials" reading is the union of both: `legacyMaterialStock + sumRoomTradeGoods('rawMaterial', LogisticsStock+Storage)` (`sim.ts:6270`). `consumeConstructionMaterials` (`sim.ts:4077`) drains from both buckets.

**Cost per tile.** `MATERIAL_COST` (`sim.ts:107`–116) is the flat material cost per tile type. Distance from the core no longer changes construction material cost. Construction consumes materials through delivery jobs instead of draining everything instantly.

## Map expansion

Players can buy four directional expansions (one-time each) for credits:

- `EXPANSION_STEP_TILES = 40` (`sim.ts:218`)
- `EXPANSION_COST_TIERS = [2000, 4000, 6000, 8000]` (`sim.ts:219`)

`expandMap` (`sim.ts:7553`) rebuilds every tile array, remaps every actor/job/incident/dock/module index, and bumps `topologyVersion`. UI: top-bar icon → modal → `handleExpandDirection` (`main.ts:3356`) which recenters the viewport.

## Player framing

The strategic loop is *layout + flow*. The player decides where rooms go; haulers (crew) decide routing through the layout. A miss-placed Workshop creates job stalls and lights up the alerts panel. Restricted zones are the lever for keeping visitors out of Reactor/Security areas — paint them aggressively or your trespass incidents pile up.

## Tunables

- `MATERIAL_COST` (`sim.ts:107`)
- `EXPANSION_COST_TIERS` (`sim.ts:219`)
- `MODULE_DEFINITIONS` and `ROOM_DEFINITIONS` (`balance.ts:14`)
- All `requiredModules` / `requiredAnyOf` / `activationChecks` per room

## Trip-wires

- `setRoom` silently fails on non-walkable tiles. If your scenario is missing a room paint, check whether the underlying tile is Floor.
- `setModule` falls through to `legacyForced: true` 1×1 — scenarios depend on this. Tightening the fallback breaks scenario fixtures.
- The HUD's "Materials" number is *not* `legacyMaterialStock` alone. Use `metrics.materials` (`sim.ts:6270`) when computing UI text.
- Wall-mounted modules need a Wall tile plus an adjacent walkable service tile. If a wall fixture cannot be built, inspect/cancel the blueprint and check the service side.
- Adding a new module: also update `MODULE_DEFINITIONS` (with `allowedRooms`), the relevant ROOM_DEFINITIONS' `requiredModules`, and the build palette in `main.ts`. Don't forget the unlock-tier mapping in `unlocks.ts:148` if the module is gated.
