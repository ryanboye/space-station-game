# Scope: Dock Migration — Berths as Real Buildings

**Status:** drafting
**Owner:** awfml
**Depends on:** none structurally; sequencing-wise probably ships *after* `system-map.md` so the new game flow exists.
**Blocks:** Harvester dispatch (depends on having a real dock that harvesters depart from).

## TL;DR

Migrate docks from "tile-paint on the outer hull" to **U-shaped multi-tile berths** that the player builds as proper structures. Berths are sized (S/M/L) and only accept ships that *physically fit*. Inside each berth's U, the player installs **ship-type modules** (passenger gangway, trader exchange, hauler crane, military bridge, etc.) that determine which ship types can dock there. Tier-gated module unlocks let berth specialization scale across the progression. **Airlocks** become a separate primitive — the only legal exterior door — making the outer-hull / pressurization concept legible and meaningful.

## The current state — and why it's wallpaper

Today (`docs/07-docks-ships.md`):

- A "dock" is a contiguous run of `Dock` tiles on the outer hull.
- The player paints individual `Dock` tiles. They flood-fill into clusters; each cluster is one `DockEntity`.
- A ship's `size` is a property of the ship; a dock's `size` is just `area` (number of tiles).
- Validation: `validateDockPlacementAt` requires an outward-facing Space tile + a 4-deep approach corridor (`sim.ts:1605`). That's it.
- Ships visually arrive but don't really *fit* — they appear at the dock and visitors spawn from the floor next to it.
- Dock tiles function as both the dock AND the exterior door (the only way visitors enter the station).

Result: docks are checkboxes on the outer hull. Cosmetic, not architectural. Players don't "design" docks; they paint a strip and forget.

## What we want instead

A dock is a **place where a ship lives** while it's at the station. The player **designs** it. The ship physically fits inside. Different ship types have different needs, and the player commits to which needs they can serve.

```
   ┌──────────┐
   │┃        ┃│   ← walls forming the U
   │┃        ┃│
   │┃        ┃│
   │┃ [GW]   ┃│   ← Gangway module (passenger compat)
   │┃ [CGO]  ┃│   ← Cargo crane (hauler compat)
   │┃ [CST]  ┃│   ← Customs counter (trader compat)
   │┃ ●●●●   ┃│   ← Berth interior tiles (ship sits here)
   │┃        ┃│
   └──╤═╤═╤══┘
      ↕      ← Open mouth, faces space
   [AIRLOCK]  ← Where visitors actually enter the station interior
```

## The frame — what the player experiences

### Building a berth

1. Player selects "New Berth" from the build palette. UI prompts size: **Small / Medium / Large**.
2. Player drags a rectangle on the grid; UI validates U-shape constraints in real-time (3 walled sides, mouth wide enough for size class, connected to airlock).
3. On commit: walls placed, berth-floor tiles placed, the open mouth left as Space (or "berth-mouth" subtype that ships can pass through but pressurization treats as unsealed unless an airlock is closed).
4. Player builds **berth modules** inside the U — Gangway, Cargo Crane, Customs, Refuel Pump, Military Bridge. Each adds a *capability* tag to the berth.
5. Player builds an **Airlock** between the berth and station interior — this is the *only* legal way visitors/cargo cross from "berth" to "station living space."

### What ships do

1. Ship arrives in lane → `ArrivingShip` (`docs/07-docks-ships.md`).
2. Game looks for a free berth that is (a) sized ≥ the ship's size class, (b) has the required capability tags for the ship's type.
3. If found: ship enters berth, occupies the interior tiles. Visually rendered at scale, fits inside the U.
4. Visitors disembark, walk through the airlock into the station, do their thing, walk back through the airlock, board.
5. If no compatible berth: ship queues (existing `dockQueue`) or skips (existing rating penalty).

### Capability tags by ship type

| Ship type | Required capability tags | Available at tier |
|---|---|---|
| Tourist | Gangway | T0 |
| Trader | Gangway + Customs | T1 |
| Hauler / Industrial | Cargo Crane | T2 |
| Military | Gangway + Military Bridge + Refuel Pump | T3 |
| Colonist | Gangway + Customs + Cargo Crane | T3 |

(Specific tags subject to tuning — see Open Question §3.)

## In scope

- New room type: **`Berth`** with shape validation (U-shape, size classes).
- New module types: **`Gangway`**, **`CargoArm`**, **`CustomsCounter`**, **`RefuelPump`**, **`MilitaryBridge`**, **`PassengerLounge`** (waiting area inside the berth).
- New tile type: **`Airlock`** (or new flag on existing `Door` tile, see Open Q §1).
- Berth size classes (S/M/L) with min-area + min-mouth-width constraints.
- Per-berth capability tag computation (from installed modules).
- Ship-to-berth matching upgraded: from "dock_area ≥ ship_size" to "size_match AND capability_set ⊇ ship_required_tags".
- Pressurization: airlock is a barrier; berth interior is *not* part of station pressurization (the open mouth means it's vacuum unless the airlock is sealed and the mouth has a force-field/closed door — see Open Q §4).
- Visitor pathing: visitors pass through the airlock as a transit step, not directly between dock and floor.
- Migration of existing saves: convert each contiguous `Dock` tile cluster into a default Small or Medium berth with a basic Gangway, depending on cluster size. Old saves don't lose docks; they get auto-upgraded to v1 berths.
- Render: ships fit inside berths, scaled by size class. Airlock animation when visitors transit.
- Sprite atlas keys: berth wall variants, airlock, all new modules. Per `docs/13-pipelines.md`, the atlas process needs new entries in `sprite-spec.yaml`.

## Out of scope (this doc)

- Multi-segment / multi-deck berths (vertical stacking, multi-level station). v1 is single-level.
- Ship interior simulation. Ships are still opaque containers — we don't simulate their interior in v1.
- Custom ship loadouts visible to the player. Ship "needs" are read from `SHIP_PROFILES`.
- Crew dispatching to ships (pilots, dockworkers as named NPCs). Crew handle haul jobs into/out of berths via existing item-node + transport-job machinery.
- Berth damage / sabotage events. Future scope.
- Player-owned harvesters as a ship type with their own berth needs — covered as a *future* scope sister to system-map. (For now: harvesters depart from a berth, return to the same berth, treated like player-owned trader ships.)
- Combat at the berth. Even if we add military ships, no v1 dogfighting.
- Procedural berth shapes beyond U-shape. v1 is U-shape only; future scope might add T-shape, L-shape, etc.

## Touches in the existing game

| What | Where | How it changes |
|---|---|---|
| `TileType.Dock` | `src/sim/types.ts:12`, `docs/02-build-and-world.md` | Either deprecated (preferred — `Dock` is replaced by `BerthFloor`) or kept as a compatibility tile for old saves and re-meant as "berth interior floor". |
| `DockEntity` | `src/sim/sim.ts:2194` (`rebuildDockEntities`) | Concept stays but cluster identification changes from flood-fill to "find the room of type Berth this tile belongs to". |
| `validateDockPlacementAt` | `sim.ts:1605` | Replaced by U-shape validation against the rectangle the player drew. |
| `dockFacingOutward` | `sim.ts:1547` | Rebuilt around "where is the open mouth of the U" rather than per-tile facing. |
| Outer-hull dock barrier | `isOuterHullTile` (`sim.ts:1555`), inlined in `computePressurization` | Berth interior is *not* pressurized at all in default state. The trip-wire at `docs/99-trip-wires.md` (outer-hull-Dock-as-pressure-barrier inlining) gets *cleaner* — barrier becomes "any tile not connected to an Airlock-sealed station interior is vacuum." |
| Ship-to-dock matching | `pickDockForShip` (referenced `docs/07-docks-ships.md:88`) | Adds capability-tag matching beyond size. Ships specify `requiredCapabilities: CapabilityTag[]`. |
| `SHIP_PROFILES` | `src/sim/content/ships.ts:3` | Each profile gets `requiredCapabilities` and `sizeClass`. |
| Ship rendering | `resolveShipSilhouette` (`docs/11-render.md`), `render.ts:877` | Ships render *inside* the berth, scaled to fit. Coordinates change from "near the dock tile" to "centered in the berth interior region." |
| Visitor entry/exit | `updateVisitorLogic` (`sim.ts:5045`) | Visitors enter via the berth's airlock as a path step, not directly from the dock tile. |
| Pressurization | `computePressurization` (`sim.ts:1793`), `docs/03-utilities.md`, `docs/99-trip-wires.md` | Berth interior treated as outside; airlock is the barrier. The "doors are pressure barriers" trip-wire stays — airlocks are a *new* barrier type, doors stay as interior doors only. |
| Save schema | `src/sim/save.ts`, `docs/12-ui.md` save section | v3 migration converts old `Dock` clusters into berth structures with default modules. |
| Cold-start scenarios | `src/sim/cold-start-scenarios.ts:156` (`applyDemoStationOverlay`) | The demo-station's auto-painted starter dock (`main.ts:659`) becomes a small starter berth with gangway. |
| Build palette + hotkeys | `main.ts:2273`, `main.ts:3150`–3354 | New tools for "Berth (S/M/L)", "Airlock", and the 6 new modules. Hotkeys to allocate. |
| Sprite atlas | `tools/sprites/sprite-spec.yaml`, `public/assets/sprites/atlas.png`, `docs/13-pipelines.md` | New atlas keys: berth-wall, berth-floor, airlock-closed, airlock-open, gangway, cargo-arm, customs-counter, refuel-pump, military-bridge, passenger-lounge. ~10 new sprites. |
| Tier-gated content | `src/sim/content/unlocks.ts`, `docs/09-progression.md` | Berth modules added to `MODULE_UNLOCK_TIER`. Military Bridge at T3, Cargo Arm at T2, etc. |

## Integration points

- **`system-map.md`** — A scope-level connection: ship arrivals are now driven by faction territory (system map) → ship types → required capability tags (this scope) → berth specialization. The two scopes are independent in code but cohere in player experience.
- **`contracts.md`** — A contract that asks for "service 4 industrial-ship visitors" requires *eligible berth infrastructure*. Without the right capabilities, the player physically cannot service those ships. Adds a strategic layer: contracts can demand investment in berth specialization, not just operational throughput.
- **Future harvest scope** — Player-owned harvester ships return to a berth. They count as a small-class ship with no capability needs (or just a Cargo Arm).

## Open questions / decisions needed

### 1. Airlock = new tile type, or new flag on existing Door?

**Options:**
- (a) **New `TileType.Airlock`.** Clean separation. Render and behavior different from Door.
- (b) **Door with an `isExterior` flag.** Reuses existing Door rendering and tile semantics. Less new code, more conditionality.
- (c) **Door + a placement constraint.** A door tile placed on the boundary between Berth-room and station-interior is automatically "an airlock." No new tile type or flag — the *role* is inferred from position.

**Recommendation:** **(a) new tile type.** Airlocks need different sprites (animated open/close cycle), different sound/render hooks, and different pressurization semantics. The `isExterior` flag (b) muddles the trip-wire about "doors are pressure barriers." Inferred-by-position (c) is too magic.

### 2. Berth module footprint sizing — fixed or variable?

**Options:**
- (a) **Fixed.** Each module type has a fixed footprint (Gangway = 1×2, Cargo Arm = 2×2, Military Bridge = 2×2, etc.).
- (b) **Variable.** Modules adapt to berth size — a Gangway in a Small berth is 1×1; in a Large berth it's 2×2.

**Recommendation:** **(a) fixed.** Matches existing module convention (`docs/02-build-and-world.md`). Variable adds complexity without clear gameplay payoff.

### 3. Required capability tags per ship type — final list?

**Strawman proposal (subject to tuning):**

| Ship type | Required capabilities |
|---|---|
| Tourist | `Gangway` |
| Trader | `Gangway` + `Customs` |
| Hauler / Industrial | `CargoArm` |
| Military | `Gangway` + `MilitaryBridge` + `RefuelPump` |
| Colonist | `Gangway` + `Customs` + (`CargoArm` OR `PassengerLounge`) |

Open: should Tourist require `PassengerLounge` for higher-tier "luxury" arrivals (T3 + Pleasure Syndicate charter)? Provides a soft tier-gated requirement that matches "make it more sticky."

**Decision needed:** sign off on the requirement matrix. Tuning happens in implementation, but the *shape* needs to be locked.

### 4. Pressurization model for the berth interior

**Options:**
- (a) **Berth interior = always vacuum.** Airlock cycles to transfer visitors; mouth never seals. Realistic.
- (b) **Berth interior = vacuum unless mouth has a closed force-field tile.** A new "force-field door" module seals the mouth; with it, berth pressurizes. Without it, vacuum.
- (c) **Berth interior = pressurized when ship is docked, vacuum otherwise.** Magic, but simple.

**Recommendation:** **(a) for v1.** Cleanest semantics. Airlock cycles handle visitors. Force-field-door is a future scope for "luxury berths" if desired.

### 5. What happens to existing saves on migration?

A v2 save has `Dock` tiles painted in a strip on the hull. v3 needs to:

**Options:**
- (a) **Auto-convert.** Each dock cluster → a Small or Medium berth (sized by cluster area) with a default Gangway placed automatically. Ugly but functional.
- (b) **Force player rebuild.** v3 marks old dock tiles as "needs upgrade" placeholder; player re-builds berths manually.
- (c) **Save-incompatible.** Old saves can't load into v3.

**Recommendation:** **(a) auto-convert** with a one-time UI banner explaining "your docks were upgraded to v1 berths — you may want to redesign them." Respects existing players' time, gives them an obvious path forward.

### 6. Berth size mouth widths

**Strawman:**

| Size | Min interior | Min mouth width | Accepts ships up to size |
|---|---|---|---|
| Small | 3×3 (9 tiles) | 2 | Small |
| Medium | 4×5 (20 tiles) | 3 | Medium |
| Large | 6×7 (42 tiles) | 4 | Large |

**Decision needed:** sign off on these dimensions or propose alternatives.

### 7. Should the player ever be able to *upgrade* a berth in place?

**Options:**
- (a) **No.** Tear down and rebuild for size class change.
- (b) **Yes.** Demolish a wall to expand the U; the berth re-validates against the new size class.

**Recommendation:** **(b)** but only for like-shape expansions (S → M, M → L). Player retains capability modules across the resize. Complex to code; consider deferring to v1.5.

## Player-facing examples

### Example A: First berth on a fresh save

> Player starts a new game. The auto-painted starter dock from `main.ts:659` is now a Small Berth with a Gangway already installed. Tourists arrive and dock fine. After unlocking T1, a trader ship arrives but won't dock — "Customs Counter required." Player builds a Customs Counter inside the berth's U. The next trader docks successfully. **First moment the player understands berths have requirements.**

### Example B: T3 specialization

> Player reaches T3 and gets their first military ship arrival. The ship queues at lane edge — no berth supports military. Player has 3 berths: a Small with Gangway+Customs (tourist+trader), a Medium with CargoArm (industrial), and a Medium with just Gangway. They decide to upgrade the third berth: add Military Bridge + Refuel Pump. Now military ships can dock — but the Medium berth becomes specialized for military, no longer accepting industrial ships (which need CargoArm). **Player has chosen an identity: their station is now military-friendly.**

### Example C: An airlock failure

> Player accidentally builds an airlock without sealing the rest of the wall properly. When the next visitor arrives, station pressurization drops to 80%. Alert panel lights up. Player sees the leak via the depressurized red wash overlay (`docs/03-utilities.md`). They patch the wall, pressurization recovers. **Airlock-as-only-exterior-door makes pressurization a real architectural concern, not a tutorial step.**

## What this scope explicitly retires

- The **flat dock-tile-paint** model. After this scope, painting individual dock tiles is no longer a thing — you build berths as structures.
- The **dock-as-exterior-door** dual role. Berths are where ships live; airlocks are where visitors enter the station. Two separate concepts.
- The **silent ship-rejection** behavior. Today, ships that don't fit just queue. After this scope, the game can give *specific* feedback ("trader ship needs a berth with Customs Counter").

## Future-scope hooks

- **Berth-themed contracts** — "build a Large military-spec berth within 8 cycles." Direct integration with `contracts.md`.
- **Player-owned harvester ships** dispatching from a berth. The system-map sister scope.
- **Berth damage / sabotage events** — pirate raid hits a berth, modules go offline temporarily.
- **Force-field doors** for sealable mouths (Open Q §4 option (b)).
- **Multi-deck stations** — berths stack vertically. Way out scope; mentioned for closure.

## Risks &amp; gotchas

- **This is the biggest of the three scopes.** It touches dock topology, pressurization, ship rendering, save migration, sprite atlas, and 2-3 trip-wires from `docs/99-trip-wires.md`. Every other scope is additive — this one is *replacement*. Estimate at scope: **L** at minimum, possibly XL depending on Open Q answers.
- **The pressurization trip-wire about outer-hull `Dock` as inlined barrier** (`docs/99-trip-wires.md`, `sim.ts:1555`) becomes either resolved (clean separation) or worse (if the migration tries to keep both models alive in parallel). Pick one and commit.
- **Save migration is non-trivial.** Auto-converting clusters into berths needs a deterministic algorithm that produces sane shapes from arbitrary cluster geometries. Edge cases: L-shaped clusters, T-shaped clusters, clusters with holes.
- **Cold-start scenarios — particularly `demo-station`** — paint stations programmatically. They'll all need to be rewritten to use the new berth API or to call a "build a default starter berth" helper.
- **Sim tests** — many scenarios in `tools/sim-tests.ts` set up dock topologies with tile-paint. All of those need migration too. Estimated 10–20 test scenarios to update.
- **Visual scaling.** Ships rendered inside berths means sprite scaling per ship size class. The render pipeline (`docs/11-render.md`) doesn't currently handle scaled sprite blits at arbitrary scales.
- **Player learning curve.** Going from "paint a strip of dock tiles" to "design a U-shaped berth, install modules, place an airlock" is a significant tutorial step. Without good in-game guidance, players will be confused. Consider a forced first-berth tutorial in the cold-start `starter` scenario.

## Definition of "scope locked"

This scope is locked once:

- The 7 open questions are answered.
- The capability tag matrix (Open Q §3) is signed off.
- The berth size dimensions (Open Q §6) are signed off.
- The migration strategy (Open Q §5) is settled.
- The pressurization model (Open Q §4) is settled.
- A staged shipping plan is agreed: probably (1) build berths + airlock + auto-migrate old saves, (2) capability-tag matching for ship types, (3) module unlocks across tiers. Each stage is a separate plan / PR.

This scope **should not lock until** the system-map scope is at least `aligning` status — they share enough player-experience overlap (ship arrivals, faction representation) that locking dock-migration first risks orphaned design decisions.
