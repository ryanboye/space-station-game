# Docks &amp; Ships

A *dock* is a contiguous run of `Dock` tiles on the outer hull facing one of four `SpaceLane`s (north/east/south/west). Docks have a purpose (`visitor` or `residential`), allowed ship types/sizes, and a single `occupiedByShipId`.

## Dock topology

`DockEntity` (`src/sim/types.ts:368`).

`rebuildDockEntities` (`src/sim/sim.ts:2194`) flood-fills adjacent Dock tiles into clusters; each cluster is one `DockEntity`. Ids are inherited from the parent on splits, but only the first child keeps the id (so split-on-deletion produces unique ids).

### Placement validation

- `validateDockPlacementAt` (`sim.ts:1605`).
- `chooseDockFacingForPlacement` (`sim.ts:1634`).
- `dockFacingOutward` (`sim.ts:1547`).

A dock must:

- Face an outer Space tile.
- Have a 4-tile-deep `approachTiles` corridor in front of it (`DOCK_APPROACH_LENGTH = 4` `sim.ts:206`).

Failed placement returns false silently.

## Lanes

`SpaceLane` (`types.ts:...`): `north`, `east`, `south`, `west`. Each lane has a `LaneProfile` (`types.ts:...`) initialized in `generateLaneProfiles` (`sim.ts:262`):

| Lane | Default bias |
|---|---|
| north | leisure (tourist + colonist) |
| east | trade (trader) |
| south | generic |
| west | industrial |

Set with `normalizeTrafficWeights` (`sim.ts:248`). The biases come into play when arrivals are rolled — see Visitors flow.

## Ships

`ShipType` (`types.ts:313`): `tourist`, `trader`, `industrial`, `military`, `colonist`. Five types; `military` and `colonist` are T3-locked, `industrial` is T2-locked.

`ShipSize` (`types.ts:333`): `small`, `medium`, `large`. Each requires a minimum dock area:

- `SHIP_MIN_DOCK_AREA` (`sim.ts:118`) — per-size minimum.
- Size also caps the visitor manifest count (`SHIP_BASE_PASSENGERS` `sim.ts:124`).

### Arrival lifecycle

`ArrivingShip` (`types.ts:...`) — stages:

1. `approach` — 2 s outside the hull.
2. `docked` — visitors spawn (`generateShipManifest` `sim.ts:1376`); ship occupies the dock.
3. `depart` — 2 s, then ship is removed from `state.arrivingShips`.

**Resident home-ships** flip `kind = 'resident_home'` and override the depart stage back to `docked` while `residentIds.length > 0` (`sim.ts:3721`). They stay forever until the last resident leaves.

### Queue

If no eligible dock is free at arrival time, the ship goes to `state.dockQueue` with `DOCK_QUEUE_MAX_TIME_SEC = 18 s` timeout. Timed-out queued ships skip — counted as failure (rating penalty per `addShipSkipPenalty`).

## Player framing

- Place Dock tiles with the Dock build tool. Auto-binds to a facing.
- Click an existing dock to open the dock modal (`refreshDockModal` `main.ts:2678`):
  - Change purpose (visitor / residential).
  - Toggle allowed ship types / sizes.
  - Change facing.
- Residential docks accept colonist-friendly arrivals or visitor-converted ships flipped via `moveShipToDock`.
- Lane edge overlay during ship transit (`drawLaneEdgeOverlay` `render.ts:1288`).
- Queued ships show as a count + lane tag (`refreshTrafficStatus` `main.ts:...`).

## Tunables

- `SHIP_MIN_DOCK_AREA`, `SHIP_BASE_PASSENGERS` (`sim.ts:118` / 124).
- `DOCK_APPROACH_LENGTH = 4` (`sim.ts:206`).
- `DOCK_QUEUE_MAX_TIME_SEC = 18`.
- `state.controls.shipsPerCycle` (UI, cap 3).
- `state.controls.dockPlacementFacing` (UI, default `auto`).
- `LaneProfile.trafficVolume` and `weights` per lane (`sim.ts:262`–283).
- `SHIP_PROFILES` per ship type (`src/sim/content/ships.ts:3`) — manifest baselines.

## Trip-wires

- A dock cluster splits into two if you delete a tile in the middle. The first new cluster keeps the original id; the other gets a fresh one. Code that holds a `dockId` reference across topology mutations may dangle.
- Resident home-ships violate the normal depart stage. Don't write a ship-cleanup pass that auto-removes ships in `depart` after a timeout.
- The lane bias (north = leisure, etc.) is initialized in `generateLaneProfiles` but is **not** locked — `normalizeTrafficWeights` is called whenever weights are mutated.
- `validateDockPlacementAt` requires both an outward-facing Space tile *and* a 4-deep approach corridor. Building dock tiles flush against another building's exterior wall fails silently — there's no UI hint.
- `pickDockForShip` (the eligible-dock matcher) consumes both `allowedShipTypes` and `allowedShipSizes`. If you delete a dock's allowed-types entry the ships will queue forever.
