# Logistics — Item Nodes &amp; Transport Jobs

Resources don't flow through a continuous network. They live at `ItemNode`s attached to specific modules; movement happens via `TransportJob`s that crew members pick up and execute.

## Core types

- **`ItemNode`** (`src/sim/types.ts:300`) — owned by a module instance, has a per-`ItemType` partial record (e.g. `{ rawMeal: 4, meal: 0 }`) and a `capacity`.
- **`TransportJob`** (`types.ts:281`) — a hauling task. States: `pending`, `assigned`, `in_progress`, `expired`, `done`. Carries `from`, `to`, `itemType`, `amount`, `crewMemberId`, timestamps, and a `JobStallReason` (`types.ts:229`) when blocked.
- **`ItemType`** (`types.ts:...`) — `rawMaterial`, `tradeGood`, `meal`, `rawMeal`, etc.

## Where item nodes come from

A module gets an item node iff `MODULE_DEFINITIONS[type].itemNodeCapacity` is set (`src/sim/balance.ts:14`). Modules with item nodes:

- **Stove** — rawMeal in (consumed), meal out (produced).
- **GrowStation** — rawMeal out (produced).
- **ServingStation** — meal in (visitors take from here).
- **MarketStall** — tradeGood in (visitors buy from here).
- **IntakePallet** — rawMaterial in (delivered by crew or simulated supply).
- **StorageRack** — rawMaterial buffer.

`rebuildItemNodes` (`sim.ts:3904`) rebuilds the node list when modules change. Cached against `derived.cacheVersions.itemNodeByTileModuleVersion`.

### Per-node helpers

`sim.ts:3933`–3974:

- `itemStockAtNode(node, type)`
- `addItemStockAtNode(node, type, amount)`
- `takeItemStockAtNode(node, type, amount)`

### Per-room helpers

`sim.ts:3976`–4065:

- `sumItemStockForRoom(state, roomKey, type)`
- `addItemAcrossTargets(state, type, amount, targets)`
- `takeItemAcrossTargets(state, type, amount, sources)`

## Job creators (run every tick, capped)

Three job-creators run each tick, each with a hard cap on pending jobs:

| Creator | File:Line | What it makes | Cap |
|---|---|---|---|
| `createFoodTransportJobs` | `sim.ts:4142` | Hydroponics → Kitchen rawMeal (when stove < 8); Kitchen → ServingStation meal (when caf < 10) | `MAX_PENDING_FOOD_JOBS = 10` (`sim.ts:136`) |
| `createRawMaterialTransportJobs` | `sim.ts:4189` | IntakePallet → Storage; Storage → Workshop | 10 |
| `createTradeGoodTransportJobs` | `sim.ts:4222` | Workshop → Market when market stock < `MARKET_TRADE_GOOD_TARGET_STOCK = 26` (`sim.ts:193`) | 10 |

Each picks the *shortest-path* candidate by A*.

## Job assignment

`assignJobsToIdleCrew` (`sim.ts:4258`) picks an idle crew member and scores each pending job by:

- Path length.
- Tile occupancy along the path.
- `protectedMinimumBySystem` — haulers don't strip-mine critical posts during air or food emergencies.

`requeueStalledJobs` / `expireJobs` (`sim.ts:4441` / `4402`):

- `JOB_TTL_SEC = 45` — total time before a job is dropped.
- `JOB_STALE_SEC = 12` — time before a "stalled" job is reclaimed by another crew.

## Resource model (the big picture)

The HUD's bar of numbers maps to four storage models:

| Resource | Model | Where it lives |
|---|---|---|
| Air | Global pool | `metrics.airQuality` |
| Power | Computed each tick | `metrics.powerSupply` / `powerDemand` (no stockpile) |
| Water | Global pool | `metrics.waterStock` |
| Materials | Hybrid | `legacyMaterialStock` + per-room rawMaterial item stocks |
| Credits | Global pool | `metrics.credits` |
| Food (rawMeal/meal) | Per-module item nodes | Stove, GrowStation, ServingStation |
| Trade goods | Per-module item nodes | Workshop output, Market input |

Air/Power/Water are covered in `03-utilities.md`. Materials and credits are in `02-build-and-world.md` and `10-economy-rating.md`. Food and trade goods are this doc.

### Food chain in detail

1. **Hydroponics → rawMeal.** GrowStation produces `rawMeal` at `PROCESS_RATES.hydroRawMealPerSecPerGrowStation = 1.25` (`balance.ts:246`) into its own item node.
2. **Kitchen → meal.** Stove consumes rawMeal at the node and produces `meal` at `kitchenMealPerSecPerStove = 0.95` (`balance.ts:247`).
3. **Cafeteria → visitor.** ServingStation receives meals via transport jobs. A visitor walks up, takes one, walks to a Table tile, eats for `visitorEatBaseSec[archetype] + jitter` (`balance.ts:271`), pays via `mealExitPayout` (`sim.ts:5025`).

`kitchenRawBuffer` is a synthetic metric that sums rawMeal at *stove* nodes only (`sim.ts:6253`). It's how the alerts UI knows kitchens are starving.

### Material chain

1. **IntakePallet** receives rawMaterial (currently from `legacyMaterialStock` migration, `sim.ts:6256`–6269).
2. **Storage** holds the buffer.
3. **Workshop** converts at `0.85` rawMaterial → 1 tradeGood (`balance.ts:248`–249).
4. **Market** sells tradeGoods to visitors at `marketTradeGoodUsePerVisitorPerSec = 0.32 * spendMultiplier` (`balance.ts:250`).

## Player framing

The player decides *layout*. Crew haulers decide *routing*. If the workshop is across the map from storage, jobs stall; the alerts panel surfaces `topBacklogType` and `stalledJobsByReason`. The right strategy is to cluster food chain, material chain, and market against each other to minimize hauler distance.

There are no haulers as a separate role — *every crew member* hauls when not on a post. Crew priority presets (`05-crew.md`) bias which crew break off to haul.

## Tunables

- `PROCESS_RATES` (`balance.ts:245`) — all per-second production rates.
- `TASK_TIMINGS` (`balance.ts:262`) — how long each agent action takes.
- `MAX_PENDING_*_JOBS` (`sim.ts:136`+) — job-creator caps.
- `JOB_TTL_SEC`, `JOB_STALE_SEC` (`sim.ts:137`–138).
- `MARKET_TRADE_GOOD_TARGET_STOCK = 26` (`sim.ts:193`).

## Trip-wires

- "Materials" displayed in HUD is `legacyMaterialStock + sumRoomTradeGoods('rawMaterial', LogisticsStock+Storage)` (`sim.ts:6270`). Adding a new material storage requires updating that union.
- The `kitchenRawBuffer` metric is *stove-only*. Don't compute it elsewhere by walking all rawMeal item nodes — that double-counts the GrowStation buffer.
- Item-node capacity is set by `MODULE_DEFINITIONS`. Changing a module's `itemNodeCapacity` will clamp items at save-load time — old saves emit warnings.
- All three job creators run every tick; their caps are independent. Don't try to share a global cap without rewriting `assignJobsToIdleCrew`.
