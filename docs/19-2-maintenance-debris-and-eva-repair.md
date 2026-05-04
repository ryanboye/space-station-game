# 19-2 Maintenance, Debris, And EVA Repair

Last updated: 2026-05-03

Status: implementation spec. This is the second proposed slice from `docs/19-entropy-drift-seeded-build-pressure.md`.

## Goal

Expand maintenance from a narrow reactor/life-support debt loop into a broader station wear system: hull, docks, exterior-facing modules, high-load rooms, doors, vents, and utility fixtures gradually wear down; debris-exposed map areas wear faster; crew repair interior targets normally and exterior hull targets through EVA.

This should make station shape and exterior exposure matter. A beautiful high-throughput berth on a debris lane should be valuable, but it should carry a visible maintenance bill.

## Current Reality

The game already has a maintenance spine:

- `MaintenanceSystem = 'reactor' | 'life-support'`
- `state.maintenanceDebts`
- `updateMaintenanceDebt`
- repair jobs
- repair supplies
- maintenance overlay
- room inspector maintenance hints
- severe debt degrading reactor/life-support output
- severe utility debt feeding fire ignition

The broader feature is not "maintenance from nothing." It is "make the existing maintenance model station-wide and spatial."

The game also already has:

- EVA construction routes through Airlocks;
- `findSpacePath`;
- crew EVA suit state and oxygen;
- construction sites with `requiresEva`;
- render support for EVA suit sprites/fallbacks.

Use those pieces.

## Product Thesis

Maintenance should answer: "What does this shape cost to keep alive?"

Good design tension:

- Hull facing quiet space has low upkeep but may be worse for docks or future solar.
- Hull near debris lanes has better traffic/future resources but more exterior repair.
- Large berths earn more but expose more surface area.
- Compact utility clusters are efficient but concentrated failures hurt more.
- Long corridors reduce crowding but add more doors, panels, vents, and hull to maintain.
- Exterior expansion is powerful but creates EVA response distance.

Maintenance is the bridge between map seed and long-term station identity.

## V1 Scope

Implement:

- Deterministic debris-risk map condition layer.
- Exterior hull/dock/berth maintenance debt.
- Indoor module/fixture maintenance debt for selected high-load modules.
- EVA repair jobs for exterior targets.
- Indoor repair jobs for module/room targets.
- Maintenance overlay that shows both current wear and seed debris risk.
- Background floating asteroid/debris sprites biased by seed risk.
- Room/hull/selection inspector rows explaining wear source and fix.
- Alerts that separate "maintenance warning" from "active degradation."

Do not implement in v1:

- Random catastrophic hull breaches.
- Full structural integrity simulation.
- Detailed per-part inventories.
- Dedicated engineer role.
- Micromanaged tool pickup.
- Every decorative module wearing down.

## Seeded Debris Risk

Add a map condition:

- `debrisRisk`: `0..1`, generated deterministically from `state.seedAtCreation`.

Design rules:

- Coarse bands/zones, not per-tile noise.
- Bias by system map asteroid belts and lane sectors when possible.
- Stronger near one or two map edges per seed.
- Stable across save/load.
- Expands consistently when the map grows.
- Exposed enough that players can plan around it before building.

Interpretation:

- Low risk: quiet space, low upkeep, less visual debris.
- Medium risk: normal upkeep.
- High risk: more floating debris visuals, faster exterior wear, future opportunity for mining/salvage.

Suggested derivation:

- Generate 2-4 broad debris lobes from the seed.
- Let one edge have a dominant debris approach.
- Use distance-to-edge plus low-frequency noise.
- If system map has metal/ice belts, bias debris color/density flavor.

State choice:

- Prefer deriving `debrisRisk` from seed and map dimensions instead of saving a huge array.
- Save a `mapConditionVersion` so future algorithm changes can be migrated or preserved.
- If exact old behavior matters later, persist compressed condition arrays.

## Maintenance Domains

Broaden maintenance debt while preserving existing utility behavior.

Proposed types:

```ts
export type MaintenanceDomain =
  | 'utility'
  | 'module'
  | 'hull'
  | 'dock'
  | 'berth'
  | 'door'
  | 'vent';

export type MaintenanceSource =
  | 'idle'
  | 'high-load'
  | 'debris'
  | 'traffic'
  | 'heat'
  | 'fire-aftermath'
  | 'construction';
```

Extend `MaintenanceDebt` carefully:

- Keep `system?: 'reactor' | 'life-support'` or equivalent for existing output multipliers.
- Add `domain`.
- Add `targetTile` or `anchorTile`.
- Add `room?: RoomType`.
- Add `moduleId?: number`.
- Add `exterior: boolean`.
- Add `dominantSource`.
- Add `lastServicedAt`.

Compatibility:

- Existing reactor/life-support debts should migrate to `domain: 'utility'`.
- Existing `getMaintenanceTileDiagnostic` should still work for reactor/life-support.
- Existing metrics can stay but add grouped metrics rather than replacing them all at once.

## Wear Accumulation

### Exterior Wear

Applies to:

- Outer hull walls.
- Dock tiles.
- Berth hull-facing perimeter.
- Cargo arms/gangways/customs modules if placed in berths.
- Exterior construction sites in progress.

Inputs:

- `debrisRisk` at/near the exterior tile.
- Ship traffic near docks/berths.
- Large ship size and industrial/military traffic.
- Time since last service.
- Existing fire/smoke aftermath if hull was affected.

Suggested formula shape:

- `risePerMin = base + debrisRisk * riskMultiplier + trafficLoad * trafficMultiplier`
- Debris risk should dominate location choice.
- Traffic should make busy docks wear faster than unused exposed hull.

### Indoor Wear

Applies first to:

- Reactor.
- Life Support.
- Kitchen Stove.
- Workshop Workbench.
- Hydroponics GrowStation.
- Vents.
- FireExtinguishers.
- CargoArm.
- Doors with heavy traffic.

Inputs:

- active module/room use;
- high foot traffic;
- route pressure;
- power deficit/brownout;
- low air/poor life support;
- future heat from sunlight slice;
- fire aftermath.

Avoid tracking every decorative module in v1. Target the things players can reason about.

## Effects

### Exterior Hull/Dock Debt

Severity bands:

- `0..30`: healthy, cosmetic wear maybe.
- `30..60`: maintenance warning; repair job can open.
- `60..85`: active degradation; dock/berth service slows, queue patience may drop, hull inspector warning.
- `85+`: severe; leak risk or forced repair warning, but avoid surprise catastrophic breach in v1.

V1 severe behavior options:

- Safer default: no hull breach, just high-priority EVA repair and docking penalty.
- Later: after a long warning grace period, create a small leak incident near the target.

### Indoor Module Debt

Effects:

- output multiplier for critical utility modules;
- work speed for kitchen/workshop/hydroponics;
- service throughput for vents/docks/berths;
- fire risk only for specific dangerous domains, not every worn floor.

Use explicit driver strings:

- `maintenance: debris-exposed berth`
- `maintenance: high-load workshop`
- `maintenance: stale life-support vent`

## Repair Jobs

### Interior Repair

Use current repair job pattern:

- Crew path to target/service tile.
- Job enters `in_progress`.
- Work reduces debt.
- Optional repair supplies speed multiplier already exists.

Needed changes:

- Repair target can be module/hull/door/vent, not only reactor/life-support anchor.
- `job.repairSystem` should become a broader `repairTarget` shape or be supplemented without breaking existing code.
- Job label should show source: `repair dock debris wear`, `repair vent`, `service kitchen stove`.

### EVA Repair

Exterior debt creates EVA repair jobs.

Rules:

- Job requires a reachable Airlock.
- Crew path uses existing inside-to-airlock plus `findSpacePath` outside.
- Crew wears EVA suit and consumes EVA oxygen using existing EVA state.
- Job target is an exterior service tile adjacent to hull/dock/berth target, or the target tile if space traversal supports it.
- If no EVA route exists, job stalls with `no airlock EVA route`.
- If oxygen gets low, crew returns/repaths according to existing EVA safety behavior.

Keep it simple:

- No special tool pickup in v1.
- Optional operational supplies used at target.
- Exterior repair should feel slower/riskier than interior repair, but not impossible.

## UI And Interaction

### Maintenance Overlay

Upgrade the current overlay:

- Show interior maintenance debt on rooms/modules.
- Show exterior hull/dock/berth debt.
- Include debris-risk tint on empty space or exterior edges when maintenance overlay is active.
- Hover line should identify:
  - domain;
  - debt;
  - source;
  - whether repair is interior or EVA;
  - current effect.

Example hover:

`hover 12,4: hull wear 68 | debris lane | EVA repair open | berth service -8%`

### Map Conditions Overlay

If the shared map-condition overlay lands first, debris risk belongs there too:

- `Debris risk: low/medium/high`
- `Build implication: higher exterior repair rate, future salvage/mining potential`

### Inspectors

Room inspector:

- `Maintenance: 42% wear`
- `Source: high-load stove + traffic`
- `Effect: meal prep -3%`
- `Fix: repair job, add redundancy, reduce traffic, add service access`

Hull/dock/berth inspector:

- `Hull wear: 76%`
- `Source: debris-exposed north edge`
- `Repair: EVA required`
- `Effect: docking service slowed`

Station Ops:

- Top maintenance domains:
  - utility;
  - hull;
  - dock/berth;
  - module;
  - doors/vents.
- Open jobs split by interior/EVA.
- Worst exposed edge/room.

Alerts:

- `North berth debris wear rising`
- `EVA repair blocked: no airlock route`
- `Workshop maintenance reducing output`
- `Hull maintenance backlog: 6 exterior jobs`

## Space Backdrop And Debris Sprites

Debris risk should be visible in the world, not only in a heatmap.

Add seeded background sprites:

- small asteroids;
- metal/ice chunks;
- drifting dust streaks;
- occasional larger distant body.

Rules:

- Density follows `debrisRisk`.
- High-risk edges have more nearby drifting sprites.
- Movement is slow and parallax-like.
- Sprites should never occlude build/selection readability.
- Use deterministic spawn positions from seed so the backdrop is stable.

Potential sprite keys:

- `space.asteroid.small.1`
- `space.asteroid.small.2`
- `space.debris.metal.1`
- `space.debris.ice.1`
- `overlay.wall.hull_wear.1`
- `overlay.wall.hull_wear.2`
- `fx.repair.spark`

Note:

- `EXTERIOR_WALL_OVERLAY_SPRITE_KEYS` were intentionally removed. Re-add hull wear only with a real render integration and rotation plan.

## Implementation Steps

1. Add map-condition generation:
   - deterministic `debrisRisk`;
   - diagnostics accessor;
   - overlay/hover support if the shared overlay exists.
2. Generalize maintenance debt:
   - preserve reactor/life-support behavior;
   - add domains/sources;
   - migrate old saves.
3. Add exterior target discovery:
   - identify outer hull/dock/berth perimeter targets;
   - compute debris exposure per target.
4. Add exterior wear accumulation:
   - debris risk;
   - ship traffic;
   - dock/berth size.
5. Add indoor module/fixture wear:
   - selected modules first;
   - use active work/traffic to drive rise.
6. Extend repair jobs:
   - broader target shape;
   - interior service tiles;
   - exterior EVA targets.
7. Add UI:
   - overlay upgrade;
   - inspectors;
   - Jobs/Ops grouping;
   - alerts.
8. Add seeded debris backdrop:
   - deterministic sprite placement;
   - risk-biased density;
   - simple animation.
9. Add tests/tuning scenarios.

## Acceptance Criteria

- Same seed produces same debris-risk layout; different seeds differ visibly.
- High-risk edge hull accumulates wear faster than sheltered hull.
- A dock/berth in high debris risk creates an EVA repair job after sustained use.
- EVA repair uses airlocks and existing EVA suit behavior.
- If no airlock route exists, the repair job is visibly blocked.
- Interior high-load modules wear and can be repaired.
- Maintenance overlay explains domain/source/effect.
- Background debris density matches risk without overwhelming station readability.
- Existing reactor/life-support maintenance still works.

## Test Plan

Sim tests:

- Debris risk is deterministic by seed.
- Debris risk changes across seeds.
- Exterior hull target discovery identifies only valid exterior targets.
- High-risk hull debt rises faster than low-risk hull.
- Ship traffic increases dock/berth wear.
- EVA repair job reduces exterior debt.
- No-airlock exterior repair stalls with the correct reason.
- Indoor module wear rises with use and repair reduces it.
- Old reactor/life-support maintenance tests still pass.

Harness/browser checks:

- Maintenance overlay shows exterior and interior targets.
- Hover over hull/dock explains debris source.
- Crew visibly exits via airlock for exterior repair.
- Background debris is denser on high-risk side.
- Run medium station 10 simulated minutes and confirm maintenance backlog remains readable.

Regression:

- `npm run test:sim`
- `npm run build`
- Existing fire, repair, life-support, construction, EVA, and route-pressure scenarios still pass.

## Risks

- Breaking existing maintenance output multipliers. Preserve current reactor/life-support paths first.
- EVA path complexity. Use existing construction EVA patterns as the model.
- Too many repair jobs. Coalesce exterior wear by sector/room anchor, not every wall tile.
- Catastrophic randomness. Severe hull debt should warn for a long time before causing leaks.
- Visual clutter in space. Debris sprites must remain background.

## Later Extensions

- Dedicated engineer role or maintenance priority slider.
- Engineering Locker module.
- Hull Shielding module.
- Salvage/mining upside in high-debris sectors.
- Scheduled preventive maintenance.
- Part inventories and supply chains.
- Actual hull breach incidents after severe ignored exterior debt.
