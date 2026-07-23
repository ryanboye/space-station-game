# Port Infrastructure Evolution

Status: implementation contract for the dock-first opening and modular berth
slice. Construction remains a parallel track documented in
`33-prison-architect-depth-catalogue.md`; this slice uses the game's current
universal instant-build behavior.

## Player Experience

The opening station is a small roadside stop in space. Tiny craft use physical
Pod Dock modules mounted to the hull. Their occupants enter one or two at a
time to eat, shop, drink, or rest while the craft receives any dock-side
service it requested. The player watches those individual visits, improves
capacity, and chooses where to invest the proceeds.

The first passenger berth is a conspicuous capital expansion rather than free
room paint. The player draws a U-shaped service bay and installs expensive,
visible equipment. The zone identifies the facility; its modules determine
which ships it can actually handle.

Routine traffic remains automatic. The player manages capacity, stock,
facility mix, and dock specialization rather than approving every manifest.

## Architectural Decisions

1. **Pod Dock is a module, not a room or zone.** It mounts to an exterior hull
   wall, owns one tiny-craft position, and provides a pressurized interior
   access tile.
2. **Berth remains a room designation.** Zoning is free. Berth deck tiles,
   hull geometry, and installed modules create all capital cost and capability.
3. **There is no small berth.** Tiny ships use Pod Docks. Berths accept medium
   and large ships only.
4. **No berth-only construction workflow.** All placement remains instant in
   this slice. Universal physical construction will replace instant build in a
   separate track once Receiving and Construction Staging exist.
5. **No decorative fixtures.** Every new module has a simulated service,
   eligibility, throughput, economic, or maintenance effect.
6. **Animation is render-only.** Simulation owns discrete state; the renderer
   smoothly tweens generated modular artwork between those states. Simulation
   speed and render frame rate remain independent.

## Pod Dock Family

### Pod Dock

- Exterior wall-mounted module with a two-tile-wide hull presence.
- Accepts exactly one small craft.
- Derives outward facing from pressurized interior on one side and space on the
  other.
- Provides the visitor entry/exit tile on the station side.
- Costs enough that another dock competes with a service-room upgrade.
- Base capability is passenger access only.

### Fuel Coupler

- One-tile exterior wall attachment adjacent to a Pod Dock on the same hull
  face.
- Makes that dock eligible for small-craft refueling.
- Services a docked craft over time, consumes station fuel, and earns a visible
  fuel margin.
- A craft never requests fuel from a dock that was not advertised as
  fuel-capable when it selected the station.
- Starter procurement may buy fuel directly. Tank-to-dock logistics belongs to
  the later supply-depth track.

### Freight Locker

- Two-tile exterior wall attachment adjacent to a Pod Dock.
- Makes that dock eligible for small courier freight exchanges.
- Holds one batched cargo lot, transfers it over time, and creates a visible
  payout or received stock result.
- It is a small-craft handoff, not a replacement for a Cargo Arm or Receiving
  zone at berth scale.

### Maintenance Socket

- One- or two-tile exterior attachment with an articulated tool arm.
- Makes that dock eligible for minor pod repair.
- Repair takes dock time, consumes a small amount of raw material, and earns a
  service fee. If stock is unavailable, the dock clearly reports the blocked
  service instead of silently succeeding.
- Heavy repair remains a later berth/workshop capability.

### Adjacency Contract

An attachment belongs to the nearest Pod Dock only when it:

- lies on the same exterior hull face;
- is directly adjacent or separated by at most one wall segment;
- has the same outward facing;
- is not already claimed by another dock.

Placement preview highlights the owning dock and rejects ambiguous or interior
placement. A dock inspector lists installed services, active work, stock,
throughput, and the current craft's requests.

## Small-Craft Visit Contract

Each pod visit has one primary purpose and sometimes one secondary purpose:

- passenger meal or drink;
- shopping;
- rest or leisure;
- refuel;
- courier freight exchange;
- minor repair.

Passenger services occur through the existing visitor state machines. Ship
services occur concurrently while the visitor is inside. The ship departs when
its occupants have returned and all accepted ship-side work is complete or its
patience expires.

The dock shows compact in-world feedback:

```text
POD 03 · REFUELING 42%
1 GUEST · SHOPPING
```

Departure shows the result briefly beside the physical dock:

```text
+34c · MEAL OK · FUEL OK
```

Rating rewards completed advertised services and penalizes avoidable waits or
failures. Locked or unadvertised services do not create unfair demand.

## U-Shaped Berths

A valid berth is a connected U-shaped cluster of Berth-designated service-deck
tiles:

- the closed base connects to the pressurized station;
- two service rails extend toward space;
- the open side and center remain clear for the vessel and approach;
- at least one safe station-side access route exists;
- modules mount to the service rails or station-side throat.

The renderer uses the U's bounding vessel envelope for ship placement. Crew and
visitors walk on service rails, access vestibules, and gangways rather than
through the vessel footprint.

Malformed zones remain visible but read `INCOMPLETE BERTH` and list the first
physical correction. They never accept ships.

## Berth Hardware

### Berth Control

- Two-by-two control pylon inside the berth.
- Required for every operational berth.
- Provides traffic control, status, and the berth's base capital cost.

### Docking Clamp

- One-by-two rail-mounted module whose jaw projects into the vessel envelope.
- Each clamp contributes supported ship mass.
- Medium ships require two working clamps; large ships require at least five.
- Worn or damaged clamps can reduce eligibility or slow turnaround through the
  existing maintenance system.

### Gangway

- Enlarged two-by-two station-side base with a telescoping bridge.
- Required for passenger ships.
- Multiple gangways improve boarding throughput on large berths.

### Existing Specialist Equipment

- Customs Counter provides controlled passenger processing.
- Cargo Arm provides berth-scale freight handling.
- Fuel Pump provides berth-scale fuel transfer.
- Later Maintenance Gantry provides heavy repair.

Ship eligibility is the intersection of:

```text
valid U geometry
+ vessel-envelope size
+ working clamp capacity
+ berth control
+ required specialist capabilities
+ player traffic policy
```

## Cost Model

Room paint is always free. Credits are spent on physical deck and modules.
`ModuleDefinition` gains an explicit capital cost so important equipment is not
priced only by footprint.

Initial balance targets:

| Facility | Target capital |
|---|---:|
| Pod Dock | 90-120c |
| Fuel Coupler | 60-90c |
| Freight Locker | 70-100c |
| Maintenance Socket | 90-130c |
| Berth Control | 180-240c |
| Docking Clamp | 80-120c each |
| Passenger Gangway | 120-180c |
| Cargo Arm | 220-320c |
| First complete medium passenger berth | 600-900c |
| Functional large berth before specialist services | 1,600-2,400c |

These are ratios to playtest, not immutable prices. The first berth should cost
roughly six to ten successful pod visits after ordinary operating expenses.

## Animation Contract

Generated artwork is split into static bases and moving overlays:

- Pod Dock base plus extending umbilical/collar;
- Fuel Coupler cabinet plus hose/nozzle overlay;
- Maintenance Socket base plus articulated arm overlay;
- Docking Clamp housing plus sliding jaw overlay;
- Gangway base plus repeated telescoping bridge segments.

The atlas may contain separate keys for base and moving pieces. The renderer
computes a normalized visual deployment value per module from ship stage and
service progress. It applies transforms to sprite pieces each animation frame.
No gameplay state advances in the renderer, and animation never delays service
completion.

Animations:

- approach: beacon and alignment lights activate;
- docking: pod umbilical or berth clamps deploy over 0.5-0.9 seconds;
- passenger access: gangway extends after clamps secure;
- active service: restrained status-light pulse and small tool motion;
- departure: gangway, tools, and clamps retract before the ship's visual exit.

Motion uses deterministic per-module offsets so many docks do not pulse in
perfect unison. Offscreen modules require no animation work.

## Starter Layout

The fresh starter contains:

- two passenger Pod Docks;
- one dock with a Fuel Coupler;
- one supply-capable Pod Dock with a Freight Locker;
- a compact cafeteria with prepared meals and seats;
- a small station-operated market with starter goods;
- basic visitor hygiene and crew support;
- no passenger berth;
- two visually plausible edges for later U-shaped berth expansion.

The first-minute loop is already complete: individual visitors arrive, state a
purpose, eat or shop, optionally refuel, spend credits, and leave. The player
can invest in another dock, a dock attachment, hospitality capacity, a tenant
shell, or save for a berth.

## Compatibility

- Existing saves containing unzoned `TileType.Dock` clusters continue to load
  as legacy pod docks. They retain filters and occupancy behavior.
- Existing rectangular berth rooms remain operational through a compatibility
  geometry adapter until the player edits them. New berth placement uses the
  U-shaped validator.
- Existing Gangway, Customs Counter, Cargo Arm, Fuel Tank, and Fuel Pump modules
  migrate without deletion.
- Snapshot readers default all new dock/module/service fields safely.

## Implementation Sequence

1. Add module types, explicit capital costs, dock attachment metadata, and save
   defaults.
2. Extend dock derivation and matching to module-owned Pod Docks while retaining
   legacy tile docks.
3. Add small-craft service requests and concurrent fuel/freight/repair work.
4. Add U-geometry derivation, Berth Control, clamp capacity, and berth
   eligibility.
5. Replace the starter berths with the dock-first authored layout.
6. Add build-palette entries, placement previews, inspectors, and world chips.
7. Add generated modular artwork and render-only animation.
8. Tune costs, service durations, traffic, and starter stock through local play.

## Acceptance Gates

1. A fresh game has no passenger berth and receives small pod visitors without
   manual manifest approval.
2. Pod Dock placement requires an exterior hull wall and costs credits.
3. Each adjacent attachment changes actual dock behavior and reports blocked
   stock or work visibly.
4. Tiny ships never use berths; medium and large ships never use Pod Docks.
5. A newly painted berth without control and clamps is ineligible even though
   zoning is free.
6. Two clamps plus control and gangway admit an otherwise compatible medium
   passenger ship; insufficient clamps reject it with a world-facing reason.
7. The starter's food, shopping, and refueling loop produces observable visitor
   behavior, revenue, and rating change.
8. Dock, clamp, and gangway animation remains smooth at every simulation speed
   and does not alter simulation timing.
9. Existing saves load without deleting docks, berths, ships, or modules.
10. At gameplay zoom, each port module is visually distinguishable without
    opening an inspector.

## Non-Goals For This Slice

- Universal physical construction and Receiving/Staging zones.
- Full fuel-tank logistics for Pod Docks.
- Heavy ship repair and workshop parts chains.
- Strategic military, residential, or automated terminal progression.
- Final economy-wide rebalance, loans, or capital contracts.
