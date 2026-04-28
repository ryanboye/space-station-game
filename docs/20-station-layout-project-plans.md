# Station Layout Project Plans

These plans turn the current design direction into implementation-ready work packets. They are written for future agents who may not know the codebase well, so each packet names the product goal, code ownership, dependencies, implementation steps, tests, acceptance criteria, and traps.

The shared north star: make station shape matter. A good station should not be one big square with every room in checklist order. Berth geometry, route separation, utility locality, compartments, and room adjacency should push players into recognizable station identities.

## Code Reality Snapshot

Use these facts before starting any packet:

| System | Current state |
|---|---|
| Berths | `RoomType.Berth` exists, with `Gangway`, `CustomsCounter`, and `CargoArm` capability modules. Matching is in `listBerthCandidates`, `pickBerthForShip`, and `spawnShipAtBerth` in `src/sim/sim.ts`. Ship requirements live in `src/sim/content/ships.ts`. |
| Legacy docks | Dock tiles already require an outward space lane and `DOCK_APPROACH_LENGTH = 4` in `src/sim/sim.ts`. Berths currently only require space exposure and capabilities. |
| Pathing | Raw A* is `src/sim/path.ts`. The sim wrapper in `src/sim/sim.ts` adds caching and metrics. Current route semantics are only `allowRestricted` plus soft occupancy cost. |
| Zones | `ZoneType` is only `Public` or `Restricted`. Visitors avoid restricted tiles unless the goal is restricted; crew can often pass with `allowRestricted=true`. |
| Visitors | Visitor pathing already has long-walk dissatisfaction via `applyVisitorWalkDissatisfaction`, but it measures Manhattan distance to legacy `Dock` tiles only. Berth-only stations are under-modeled there. |
| Residents | Residents have hunger, energy, hygiene, social, safety, stress, satisfaction, leave intent, and daily routine phases. Their target picker is `assignResidentTarget`. |
| Crew | Crew are generalists. `CrewPrioritySystem` chooses room posts and logistics preemption, but there are no hireable specialties yet. |
| Utilities | Air, power, and water are global scalars. Pressurization is local flood-fill, but air exposure still uses global `metrics.airQuality`. |
| Incidents | Trespass and fights exist. Security aura is local and already path-sensitive through responder travel time. |

## Suggested Sequence

1. **P1 - Berth Approach Clearance**: fast, high-value geometry pressure. Independent from pathing.
2. **P2 - Path Intent Kernel**: the core enabling change. Land before path consequences or adjacency.
3. **P3 - Route Identity Consequences**: makes visitor, resident, crew, and logistics paths feel different.
4. **P4 - Crew Specialties and Maintenance Debt**: makes reactor/life-support/workshops feel staffed, not magical.
5. **P5 - Local Utility Sectors v0**: makes life support and reactor placement matter spatially.
6. **P6 - Compartment Risk v0**: later layer for bulkheads, fires/leaks, and sector isolation.
7. **P7 - Adjacency and Status Scoring**: folds social/status/noise effects into the pathing model.

Do not start P3 or P7 before P2 lands. Do not start P5 before deciding whether P4 maintenance debt keys by room anchor, module id, or sector id.

## Shared Handoff Rules

- Agents are not alone in the codebase. Do not revert unrelated edits, and check `git status --short` before modifying files.
- Keep PRs small. If a packet wants more than ~500 changed lines, split it.
- Prefer sim-side tests in `tools/sim-tests.ts`; run `npm run test:sim`.
- If touching UI or render, also run `npm run build`; attach a local screenshot if changing visible layout.
- If adding saved state fields, update `src/sim/save.ts` and add a migration/default path. Do not assume old saves have the new fields.
- If adding new tile-index keyed state, update `expandMap` remapping.
- Preserve deterministic tests where possible. If consuming new RNG draws, isolate them or document why scenario expectations changed.

---

# P1 - Berth Approach Clearance

## Product Goal

Large berths should force players to reserve real exterior space. A cargo or military bay should not be casually embedded in a dense square station. Ships need visible approach corridors, and the berth's facing lane should determine which traffic lane it can serve.

## Ownership

Primary files:

- `src/sim/sim.ts`
- `src/sim/types.ts`
- `src/main.ts` for berth inspector text
- `src/render/render.ts` only if drawing berth approach preview/highlight
- `tools/sim-tests.ts`
- `docs/07-docks-ships.md`

Avoid changing ship art or atlas files.

## Design

Add berth approach validation as a functional requirement for ship matching, not as a room-paint blocker.

Recommended constants in `src/sim/sim.ts`:

```ts
const BERTH_APPROACH_LENGTH_BY_SIZE: Record<ShipSize, number> = {
  small: 5,
  medium: 9,
  large: 14
};

const BERTH_APPROACH_MIN_MOUTH_BY_SIZE: Record<ShipSize, number> = {
  small: 1,
  medium: 2,
  large: 3
};
```

For each berth cluster:

1. Find exposed berth edges. A berth tile has an exposed edge if the neighbor in a cardinal direction is `Space` or out of bounds.
2. For each exposed direction, collect mouth tiles on that edge.
3. For each ship size, compute approach tiles by projecting outward from each mouth tile for that size's required length.
4. The approach is clear if all in-bounds projected tiles are `TileType.Space`, and the mouth width meets `BERTH_APPROACH_MIN_MOUTH_BY_SIZE[size]`.
5. A berth candidate can accept a ship only if:
   - size fits berth area,
   - required capabilities are present,
   - an exposed edge has a clear approach for that ship size,
   - the exposed edge's lane matches the rolled traffic lane.

Update `pickBerthForShip` to take `lane`:

```ts
function pickBerthForShip(
  state: StationState,
  lane: SpaceLane,
  shipType: ShipType,
  shipSize: ShipSize
): BerthCandidate | null
```

Update `BerthCandidate` and `BerthInspector` with a compact approach summary:

```ts
type BerthApproachStatus = {
  lane: SpaceLane;
  clearBySize: Record<ShipSize, boolean>;
  approachTilesBySize: Record<ShipSize, number[]>;
  blockedReasonBySize: Partial<Record<ShipSize, string>>;
};
```

`spawnShipAtBerth` should use the selected approach lane for `ship.lane`, so the render approaches from the same edge the berth actually faces.

## Implementation Steps

1. Add berth approach helper functions near the existing berth helpers:
   - `berthMouthTilesForLane`
   - `berthApproachTilesForLaneAndSize`
   - `computeBerthApproachStatuses`
   - `berthHasClearApproachForSizeAndLane`
2. Extend `BerthCandidate` with approach status.
3. Update `pickBerthForShip` and all call sites in `scheduleCycleArrivals`.
4. Update `describeMissingCapabilities` into a more general `describeBerthReadinessIssue` so the alert can say either:
   - `trader ship waiting - needs gangway + customs`
   - `industrial ship waiting - east berth approach blocked`
   - `large ship waiting - berth mouth too narrow`
5. Update `getBerthInspectorAt` so selection text reports:
   - size class,
   - capabilities,
   - accepted ship types,
   - clear approach lanes by size.
6. Optional render/UI polish: when a berth is selected, highlight its required approach tiles for the largest accepted size.

## Tests

Add deterministic tests in `tools/sim-tests.ts`:

- A small tourist berth with gangway and a clear east approach accepts an east-lane tourist ship.
- The same berth with one built tile in the approach does not accept the ship and emits a blocked approach hint.
- A berth with only north exposure does not accept an east-lane ship.
- Medium/large size checks reject when the approach mouth is too narrow.
- Legacy dock scheduling still works when no berth exists.

Run:

```sh
npm run test:sim
```

## Acceptance Criteria

- Berth-only stations remain viable if the berth has capabilities and clear approach.
- Large ships visibly require much more empty space than small ships.
- Directional lane profiles matter for berths.
- The inspector explains why a berth is not receiving ships.
- No regression to legacy dock queue behavior.

## Traps

- `RoomType.Berth` has loose activation by design. Do not make room painting fail; make ship matching fail.
- Berth ships have `assignedDockId = null`. Do not route occupancy cleanup through legacy docks only.
- `visitorWalkDistanceFromDock` currently ignores berths. P1 can leave this for P2/P3, but do not make it worse.

---

# P2 - Path Intent Kernel

## Product Goal

The biggest station-vibe change: visitors, residents, crew, logistics, and security should not all treat the map as the same shortest-path grid. The pathfinder should support route intent, so public concourses, service corridors, residential spines, and security routes emerge from layout.

## Ownership

Primary files:

- `src/sim/path.ts`
- `src/sim/types.ts`
- `src/sim/sim.ts`
- `tools/sim-tests.ts`
- `docs/03-utilities.md`
- `docs/06-visitors-residents.md`
- `docs/05-crew.md`

Avoid UI zone-palette work in the first PR. This packet is the kernel, not the full zoning redesign.

## Design

Add route intent without breaking existing callers.

Recommended types:

```ts
export type PathIntent =
  | 'visitor'
  | 'resident'
  | 'crew'
  | 'logistics'
  | 'security';

export interface PathOptions {
  allowRestricted: boolean;
  intent: PathIntent;
}
```

Keep a compatibility path if needed:

```ts
findPath(state, start, goal, allowRestricted, occupancyByTile)
```

can delegate internally to:

```ts
findPathWithOptions(state, start, goal, { allowRestricted, intent: 'visitor' }, occupancyByTile)
```

or the sim wrapper can accept an options object while preserving old call sites during migration.

Route cost should be soft by default. Hard blocks stay limited to walls, space, blocked effects, and restricted-zone rules. Use costs to strongly discourage bad routes while preserving fallback behavior.

Suggested v0 cost table:

| Intent | Cheap | Expensive | Hard-ish behavior |
|---|---|---|---|
| visitor | Public floor, cafeteria, market, lounge, rec hall | logistics stock, storage, workshop, reactor, life support, security, brig, berth | Restricted blocked unless goal |
| resident | dorm, hygiene, cafeteria, lounge, rec hall, market | cargo/service/security rooms | Restricted allowed only if goal or if no public route fallback is needed |
| crew | service rooms, staff rooms, reactor, life support, security | crowded visitor rooms | Restricted allowed |
| logistics | logistics stock, storage, workshop, berth/cargo, service corridors | cafeteria, lounge, dorm, hygiene, market | Restricted allowed |
| security | fastest route, low occupancy penalty | none | Restricted allowed |

Implement the cost in `path.ts` as a helper:

```ts
function routeIntentTileCost(state: StationState, tile: number, goal: number, options: PathOptions): number
```

The raw pathfinder already has access to `state.rooms`, `state.zones`, and `state.effects`; use those instead of adding a new derived map in v0.

Update the sim wrapper cache key to include `intent`. Without that, visitor and logistics requests could reuse each other's paths.

## Implementation Steps

1. Add `PathIntent` and `PathOptions` to `src/sim/types.ts`.
2. Update `src/sim/path.ts` to accept `PathOptions`.
3. Preserve or shim the old `allowRestricted` signature until all call sites are migrated.
4. Update the sim wrapper cache key in `src/sim/sim.ts` to include intent.
5. Migrate key path callers:
   - visitor service/dock/leisure paths -> `visitor`
   - resident target paths -> `resident`
   - crew post/rest/hygiene movement -> `crew`
   - hauling job paths -> `logistics`
   - incident responders -> `security`
6. Keep `chooseNearestPath` behavior: strict path first, fallback path second. Add intent to both attempts.
7. Add debug metrics only if cheap:
   - average visitor path cost,
   - logistics paths through public rooms,
   - crew paths through public rooms.

## Tests

Add tests with a tiny synthetic station layout:

- Visitor chooses a longer public corridor instead of a shorter storage/workshop corridor.
- Logistics chooses the service corridor instead of the cafeteria corridor.
- Security chooses the shortest route to an incident even through public space.
- If the only possible route crosses a service room, visitors still route rather than deadlock.
- Path cache does not reuse a visitor path for a logistics request with the same start/goal.

Run:

```sh
npm run test:sim
```

## Acceptance Criteria

- Existing scenarios still pass.
- Different intents can produce different paths for the same start/goal.
- Visitor pathing becomes visibly less willing to cross back-of-house rooms.
- Logistics and crew behavior stays reliable under pressure.
- No broad UI changes are required to feel the difference.

## Traps

- Do not make service-room avoidance a hard block for visitors. Hard blocks cause silent no-path failures.
- The path cache currently keys on `allowRestricted`; add intent or the feature will be nondeterministic.
- Keep performance in mind. `findPath` runs constantly; avoid per-node allocations in the inner loop.

---

# P3 - Route Identity Consequences

## Product Goal

Once path intent exists, bad routes should have game consequences. Visitors should dislike seeing cargo/mechanical guts. Crew should lose efficiency when forced through crowds. Residents should care about whether their daily life crosses noisy or unsafe service spaces.

## Dependency

Depends on P2.

## Ownership

Primary files:

- `src/sim/types.ts`
- `src/sim/sim.ts`
- `src/main.ts` if surfacing metrics
- `tools/sim-tests.ts`
- `docs/06-visitors-residents.md`
- `docs/10-economy-rating.md`

## Design

Add route exposure scoring. This should be cheaper and more legible than trying to simulate every reaction per tile.

Recommended helper:

```ts
type RouteExposure = {
  distance: number;
  publicTiles: number;
  serviceTiles: number;
  cargoTiles: number;
  residentialTiles: number;
  securityTiles: number;
  crowdCost: number;
};

function scoreRouteExposure(state: StationState, path: number[]): RouteExposure
```

Add optional last-route fields to agents:

```ts
lastRouteExposure?: RouteExposure;
```

If save churn is annoying, store compact numbers instead:

```ts
lastRouteDistance: number;
lastRouteDiscomfort: number;
```

Use route exposure at service completion time:

- Visitor finishes eating/market/lounge:
  - Apply station rating penalty for service/cargo/security exposure.
  - Add patience if exposure is severe.
  - Keep the existing long-walk penalty but switch it to actual route distance and include berth origin ships.
- Resident completes a need trip:
  - Reduce satisfaction/safety/social if the route crossed cargo/service/security spaces.
  - Increase stress slightly if crowd exposure is high.
- Crew/logistics:
  - Increase energy/hygiene drain when the route crosses crowded public/social rooms.
  - Add `crewMoraleDrivers` or job warning if logistics repeatedly crosses public spaces.

Suggested v0 tunables:

```ts
const VISITOR_SERVICE_EXPOSURE_RATING_PENALTY = 0.015;
const VISITOR_CARGO_EXPOSURE_RATING_PENALTY = 0.02;
const RESIDENT_BAD_ROUTE_STRESS = 0.08;
const CREW_PUBLIC_CROWD_DRAIN = 0.12;
```

## Implementation Steps

1. Add route exposure helper near path/agent helpers in `src/sim/sim.ts`.
2. When assigning a path, compute and store compact exposure on the actor.
3. Update `applyVisitorWalkDissatisfaction` to accept route distance/exposure instead of recomputing Manhattan distance to legacy docks.
4. Add usage totals and metrics:
   - `visitorServiceExposurePenalty`
   - `crewPublicInterference`
   - `residentBadRouteStress`
5. Surface a short diagnostics line in the ops/rating panel only if the metric is nonzero.
6. Add docs and tests.

## Tests

- A visitor route through `Storage` produces a higher rating penalty than a public route of similar length.
- A berth-origin visitor records route distance correctly; legacy dock-only distance is not used.
- A resident repeatedly routed through `Workshop` loses satisfaction faster than one routed through a public corridor.
- Logistics through a crowded cafeteria increases crew drain or public-interference metric.

## Acceptance Criteria

- Bad routes are visible in metrics and station rating drivers.
- Players can fix the penalty by adding a public corridor or service corridor.
- Existing visitor patience and no-path behavior still works.

## Traps

- Do not double-penalize every tick while an actor is walking. Apply on trip completion or at bounded intervals.
- Do not make residents abandon critical needs because the path is ugly. Critical hunger/air/hygiene should still win.
- Keep exposure fields small and migration-safe.

---

# P4 - Crew Specialties and Maintenance Debt

## Product Goal

Reactor and life support should feel real because trained crew maintain them. Hiring "more crew" should become less interesting than hiring the right crew and placing their work routes well.

## Ownership

Primary files:

- `src/sim/types.ts`
- `src/sim/sim.ts`
- `src/main.ts`
- `src/sim/save.ts`
- `tools/sim-tests.ts`
- `docs/05-crew.md`
- `docs/03-utilities.md`

## Design A: Crew Specialties

Add soft specialties first. Do not hard-lock rooms by specialty until the station can recover from bad hiring.

Recommended type:

```ts
export type CrewSpecialty =
  | 'generalist'
  | 'engineer'
  | 'technician'
  | 'cook'
  | 'hauler'
  | 'security'
  | 'medic'
  | 'janitor';
```

Add to `CrewMember`:

```ts
specialty: CrewSpecialty;
skill: number; // 0.75..1.35, optional v0
```

Suggested multipliers:

| Specialty | Strong systems | Bonus |
|---|---|---|
| engineer | reactor, workshop, maintenance | post score x1.35 |
| technician | life-support, hydroponics, maintenance | post score x1.35 |
| cook | kitchen, cafeteria | post score x1.35 |
| hauler | logistics jobs | path/job score x1.35 |
| security | security, brig, incident response | post/response score x1.45 |
| medic | clinic | post score x1.35 |
| janitor | hygiene, body clearing, future cleaning | post/job score x1.25 |
| generalist | all | x1.0 |

Update `hireCrew` to accept optional specialty:

```ts
export function hireCrew(state: StationState, creditCost = HIRE_COST, specialty?: CrewSpecialty): boolean
```

UI v0 can be simple:

- Keep existing "Hire +1 Crew" button as generalist.
- Add a small crew specialty selector or buttons in the crew/market modal.
- Specialty hires cost more:
  - generalist 14c,
  - common specialists 20c,
  - security/engineer 24c.

## Design B: Maintenance Debt

Add room-cluster maintenance for Reactor and LifeSupport first. Use soft degradation:

```ts
type MaintenanceSystem = 'reactor' | 'life-support';

type MaintenanceDebt = {
  key: string; // stable room anchor key for v0
  system: MaintenanceSystem;
  anchorTile: number;
  debt: number; // 0..100
  lastServicedAt: number;
};
```

Maintenance rises while the room is active:

- Reactor: +0.6 debt/min per active reactor cluster.
- LifeSupport: +0.8 debt/min per active life-support cluster.
- High load/power deficit/low air increases debt.

Debt effects:

- 0..30: no effect.
- 30..60: output multiplier down to 0.85.
- 60..85: output multiplier down to 0.65 and brownout/air incident heat rises.
- 85..100: intermittent stall effect until serviced.

Create maintenance tasks as crew post tasks, not transport jobs, in v0:

- Extend `CrewTaskKind` with `'maintenance'`.
- Maintenance target is room cluster anchor.
- Engineers/technicians score best.
- On arrival, crew spends 2-4 seconds reducing debt.

## Implementation Steps

1. Add `CrewSpecialty` and default all existing crew to `generalist`.
2. Add save migration/defaulting for specialty.
3. Apply specialty scoring in:
   - `assignCrewJobs`,
   - `assignJobsToIdleCrew`,
   - `pickSecurityResponder`.
4. Add maintenance debt state and migration.
5. Add debt update before `updateResources` consumes reactor/life-support output.
6. Apply debt multipliers to `powerSupply` and `lifeSupportActiveAirPerSec`.
7. Add crew maintenance tasks and metrics:
   - `maintenanceDebtAvg`
   - `maintenanceJobsOpen`
   - `maintenanceJobsResolvedPerMin`
8. Add UI readout in crew/ops diagnostics.

## Tests

- Engineer prefers reactor maintenance over an equally distant cafeteria post.
- Technician prefers life support maintenance.
- High maintenance debt reduces reactor power or life-support air output.
- A crew member reaching the maintenance target reduces debt.
- Save/load defaults old crew to `generalist`.

## Acceptance Criteria

- Understaffed utilities degrade gradually, not instantly.
- Hiring specialists is useful but not mandatory in the first ten minutes.
- Maintenance is route-sensitive: distant utility rooms are harder to keep healthy.

## Traps

- Reactor is currently a room with no required module. If maintenance keys by tile anchor, expansion remap must handle it.
- Do not create unlimited maintenance jobs every tick. Use one open task per cluster.
- Do not let maintenance preempt life-saving air staffing forever. Air-critical overrides still win.

---

# P5 - Local Utility Sectors v0

## Product Goal

Life support and reactor placement should matter spatially. A station wing far from life support, or cut off behind bad doors/corridors, should have worse air/reliability than the core. This is the "utilities become real" step without building full pipe simulation yet.

## Dependency

Best after P2. Can land before P4 if maintenance is not included, but P4 makes it more interesting.

## Ownership

Primary files:

- `src/sim/types.ts`
- `src/sim/sim.ts`
- `src/render/render.ts` for local air overlay if added
- `src/main.ts` for diagnostics
- `src/sim/save.ts`
- `tools/sim-tests.ts`
- `docs/03-utilities.md`

## Design

Do not start with explicit pipes. Start with an implicit utility graph:

- Nodes are active room clusters and walkable corridor regions.
- Edges exist through walkable, pressurized tiles.
- LifeSupport supplies air through the graph with distance falloff.
- Reactor supplies power globally in v0, but power losses can be added by distance later.

Add local air:

```ts
localAirQuality: number[]; // length width * height, 0..100
```

or derived cache if save churn is not wanted:

```ts
derived.localAirByTile: Float32Array;
```

For v0, local air is computed each tick:

1. Start from global `metrics.airQuality`.
2. Identify active life-support source tiles.
3. Multi-source BFS through walkable pressurized tiles.
4. Tiles unreachable from life support drift downward faster.
5. Tiles far from life support get a mild penalty.
6. Depressurized tiles use very low local air.

Update `applyAirExposure` callers to pass local air:

```ts
const localAir = airQualityAtTile(state, actor.tileIndex);
applyAirExposure(state, actor, localAir, dt);
```

Keep `metrics.airQuality` as station-wide average or blended HUD value, and add:

- `metrics.minLocalAirQuality`
- `metrics.lowAirTiles`
- `metrics.lowAirRooms`

## Implementation Steps

1. Add local-air storage/derived helper.
2. Add `computeLocalAirQuality(state, dt)` after pressurization and before actor updates.
3. Change air exposure for visitors/residents/crew to read local air.
4. Keep existing global air trend math for now; local air is a distribution around that global value.
5. Add render overlay toggle only if straightforward; otherwise surface metrics first.
6. Add diagnostics to room inspector: local air average for selected room.

## Tests

- A sealed room reachable from active life support has higher local air than an isolated sealed room.
- A depressurized area produces low local air even if global air is healthy.
- Crew/residents in a low-air wing become distressed while central actors remain healthy longer.
- Existing global-air collapse tests still pass or are intentionally updated.

## Acceptance Criteria

- Players can see and fix local air problems by adding life support closer or reconnecting a wing.
- Local air does not require explicit pipes yet.
- Existing pressurization semantics remain intact.

## Traps

- Pressurization only recomputes on topology changes. Local air must recompute over time.
- `metrics.airQuality` is currently mutated in `updateResources`. Avoid creating a feedback loop where local-air average is applied twice.
- Arrays keyed by tile index must remap in `expandMap` if stored on state.

---

# P6 - Compartment Risk v0

## Product Goal

Compartmentalization should be a later reward for good architecture: airlocks, bulkheads, and sector boundaries contain failures. This adds drama without combat.

## Dependency

Best after P5 local utility sectors.

## Ownership

Primary files:

- `src/sim/types.ts`
- `src/sim/sim.ts`
- `src/render/render.ts`
- `src/main.ts`
- `src/sim/save.ts`
- `tools/sim-tests.ts`
- `docs/03-utilities.md`
- `docs/08-incidents-effects.md`

## Design

Start with sector detection, then add one contained failure type.

Sector detection:

- Compute connected pressurized sectors separated by walls and doors.
- Doors currently count as pressure barriers. Keep that in v0.
- Each sector has:
  - tile count,
  - local air average,
  - connected life-support sources,
  - incident count,
  - open hazard count.

Failure v0:

- `hull_leak` effect on a random exterior-adjacent wall/floor under high load.
- The leak depressurizes only its sector until repaired.
- Repair is a maintenance/security-style crew task.

This should not require animated doors yet.

## Implementation Steps

1. Add sector cache after pressurization.
2. Add `Effect` type for `hullLeakByTile` or similar.
3. Integrate leak tiles into local air calculation.
4. Add repair task generation and crew resolution.
5. Add render highlight for leaking tile and affected sector.
6. Add alert text grouped by root cause.

## Tests

- A leak in one compartment lowers local air there but not across a wall/door boundary.
- Removing the separating wall merges sectors and spreads the issue.
- A crew repair task clears the leak.
- Existing door-as-barrier regression stays valid.

## Acceptance Criteria

- Bulkheaded layouts are safer than giant open layouts.
- Failure is legible: affected sector, cause, and repair route are visible.
- No single random leak should hard-lose a run.

## Traps

- Door open/closed state is known debt. Do not silently change `isPressureBarrier(Door)` in this packet.
- Avoid random failure spam. One active leak per station is enough for v0.
- Repair pathing should use `security` or `crew` intent, not visitor intent.

---

# P7 - Adjacency and Status Scoring

## Product Goal

Adjacency should make layout expressive. Visitors should prefer polished public spaces. Residents should want quiet private life. Crew and logistics should prefer back-of-house access. This extends pathing into "how the station feels."

## Dependency

Depends on P2. Benefits from P3.

## Ownership

Primary files:

- `src/sim/balance.ts`
- `src/sim/types.ts`
- `src/sim/sim.ts`
- `src/main.ts`
- `tools/sim-tests.ts`
- `docs/02-build-and-world.md`
- `docs/06-visitors-residents.md`
- `docs/10-economy-rating.md`

## Design

Add room traits:

```ts
type RoomTrait = {
  visitorStatus: number;       // positive for market/lounge, negative for cargo/service
  residentialComfort: number;  // positive for dorm/lounge/hygiene, negative for workshop/reactor/cargo
  serviceNoise: number;        // workshop/reactor/logistics/berth
  publicAppeal: number;        // market/lounge/cafeteria
};
```

Place them near `ROOM_DEFINITIONS` in `src/sim/balance.ts`:

```ts
export const ROOM_TRAITS: Record<RoomType, RoomTrait> = { ... };
```

Compute a cheap environmental score:

```ts
function roomEnvironmentScore(state: StationState, tile: number, radius = 4): {
  visitorStatus: number;
  residentialComfort: number;
  serviceNoise: number;
  publicAppeal: number;
}
```

Use it at bounded points:

- Visitor completes service:
  - status below threshold reduces rating/spend.
  - high public appeal slightly improves leisure success.
- Resident sleeps or idles at home:
  - residential comfort affects satisfaction and conversion chance.
  - service noise near dorm increases stress.
- Crew/logistics:
  - high public appeal/crowding increases work friction.

Suggested v0 trait examples:

| Room | visitorStatus | residentialComfort | serviceNoise | publicAppeal |
|---|---:|---:|---:|---:|
| Market | 3 | 0 | 1 | 3 |
| Lounge | 2 | 2 | 0 | 2 |
| Cafeteria | 1 | 1 | 1 | 2 |
| Dorm | -1 | 3 | 0 | -1 |
| Hygiene | -1 | 1 | 1 | -1 |
| Workshop | -3 | -3 | 3 | -3 |
| LogisticsStock | -3 | -2 | 2 | -3 |
| Storage | -2 | -2 | 1 | -2 |
| Reactor | -4 | -4 | 4 | -4 |
| LifeSupport | -2 | -2 | 2 | -2 |
| Security | -1 | 0 | 1 | -1 |
| Brig | -4 | -4 | 2 | -4 |
| Berth | 0 | -2 | 3 | 0 |

## Implementation Steps

1. Add `ROOM_TRAITS`.
2. Add environmental scoring helper with simple radius scan. Cache later only if perf says it matters.
3. Apply visitor status at service completion and market spend.
4. Apply dorm comfort to resident satisfaction and resident conversion chance.
5. Add metrics:
   - `visitorStatusAvg`
   - `residentComfortAvg`
   - `serviceNoiseNearDorms`
6. Surface in room inspector:
   - "Comfort: high/medium/low"
   - "Status: high/medium/low"
   - "Noise: low/medium/high"

## Tests

- A dorm adjacent to reactor/workshop produces lower resident satisfaction than an isolated dorm.
- Market/lounge near public spaces produce better visitor status than market/lounge behind storage.
- Moving cargo/service rooms away from public route reduces status penalty.
- Scoring does not run on every path node unless intentionally profiled.

## Acceptance Criteria

- Players can intentionally build public fronts, private residential zones, and back-of-house service spines.
- The same room set can produce different outcomes based on placement.
- The mechanic is readable from inspector/metrics, not hidden vibes.

## Traps

- Avoid one-note adjacency math that always says "put everything far apart." Positive adjacency matters too.
- Do not punish compact early stations too hard. Gate strong penalties by station size, tier, or population.
- Keep status/comfort effects smaller than basic survival needs.

---

# Immediate Recommendation

Start with P1 and P2.

P1 gives a fast architectural win: berths and large ships begin shaping the station outline. P2 is the deeper spine: once route intent exists, P3 and P7 become straightforward, and the game can start producing the Prison Architect-style "I designed this badly, now I understand why" moments.

P4 and P5 are the second wave. They make utility rooms real, but they will be much easier to tune once pathing already distinguishes crew, logistics, residents, and visitors.
