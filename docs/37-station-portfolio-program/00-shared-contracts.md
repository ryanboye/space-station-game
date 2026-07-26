# Shared Portfolio Contracts

Status: required foundation

## Player Experience

The common loop for every station business is:

```text
observe demand
  -> commit scarce capital and space
  -> construct a physical operation
  -> supply and staff it
  -> watch people or ships use it
  -> receive an attributable result
  -> diagnose pressure
  -> expand, specialize, outsource, or refuse demand
```

No portfolio may bypass this loop by advancing a timer against a global scalar.

## C1. Honest Physical Service

A service succeeds only when an eligible actor or ship completes the required
physical session. The canonical lifecycle is:

```text
discover -> reserve -> travel -> queue -> use -> consume/produce -> release
```

Required rules:

- One exclusive usage slot cannot serve two actors simultaneously.
- Queueing does not count as service.
- Walking into the room does not count as service.
- Missing, blocked, unpowered, unstaffed, closed, broken, or empty facilities
  complete zero service.
- Tenant facilities use the same service events as station-operated facilities.
- Settlement reports, needs, rating, ledger, goals, and world chips consume the same
  completion event.
- Timeouts release every fixture, tile, queue, and inventory reservation.

Primary existing area: `src/sim/sim.ts`, actor state in `src/sim/types.ts`.

## C2. Located Inventory And Ownership

Every consumable has an owner, location, amount, capacity, and allowed flow.

Initial commodity set:

- prepared meals;
- travel supplies;
- beverages;
- fuel;
- raw food;
- maintenance parts/raw material;
- consigned courier freight.

Ownership rules:

- Supplier deliveries become station stock after physical unloading.
- The station pays for supplier stock; receiving it is not revenue.
- Courier freight remains customer-owned; handling earns a fee but never grants stock.
- Tenant-supplied inventory is not silently available to station rooms.
- Reserved inventory cannot be consumed twice.
- HUD totals must be derivable from the located nodes shown in inspectors.
- Compatibility global stocks may remain only behind an explicit migration adapter.

## C3. Physical Capacity

Rendered capacity and simulated capacity must agree:

- Table artwork has four seats and therefore four exclusive sessions.
- Bench, Couch, Bar Counter, Telescope, bed, fixture, dock, clamp, tank, rack, and
  service-module capacity comes from their definitions, not a room-wide guess.
- Throughput separates service positions, work duration, staff availability, input
  supply, output buffer, and circulation.
- Inspectors identify the limiting stage rather than showing one opaque capacity.

## C4. Operating Models

Every commercial room has one operator:

| Model | Player supplies | Operator supplies | Player receives |
|---|---|---|---|
| Station-operated | shell, fixtures, stock, staff, utilities | nothing | all revenue and all risk |
| Tenant-operated | shell, utility/logistics access, negotiated terms | fit-out, tenant staff, specified stock | rent and revenue share |
| Contractor | access and payment | temporary labor or equipment | restored service or avoided capital |

Core safety plant remains station-operated. Do not add a labor market, mixed-use
zoning, or household staffing simulation to the first portfolio implementation.

Tenant staff should eventually arrive on scheduled commuter pods. Until that slice,
tenant-supplied staff may spawn abstractly but the UI must say so.

## C5. Demand And Traffic

Demand is generated before the actor chooses a destination. The station attracts only
traffic it can plausibly advertise, but missing general amenities can still create
fair missed opportunities.

- Pod calls are automatic and require no manifest approval.
- Approach Control becomes policy and exception handling for berth traffic.
- Each call has a primary purpose and optional secondary demand.
- Demand is affected by charter location, prices, rating, capacity, recent reliability,
  and portfolio relationships.
- New traffic classes enter an offer pool; they are not hard-reward unlocks.
- Rating improves traffic quality and terms but does not magically create physical
  capability.

World feedback beside the dock or berth must show request, current operation, and
result. Details remain available in a bounded ledger.

## C6. Economy

Every credit change emits a categorized, bounded, save-safe economy event. At minimum:

- capital purchase and resale;
- wages and operating supplies;
- dock access;
- item sale with cost basis;
- service sale;
- tenant rent and revenue share;
- supplier order;
- courier handling;
- repair/refund/penalty;
- contract payment or advance.

No portfolio should be balanced until the ledger includes its major mutations.
Operating profit must exclude consigned inventory and borrowed/advanced capital.

## C7. Shared Infrastructure

Portfolio expansion creates new obligations in these systems:

- power source, connected conduit, capacity and reserve;
- pressurization, local oxygen delivery and vents;
- water supply and later wastewater;
- crew beds, hygiene, food, recovery and wages;
- receiving, storage and hauling;
- cleaning, wear, parts and repair;
- fire protection, security and emergency access.

The first room may fit inside starter spare capacity. A department-class expansion
should usually require at least one supporting upgrade. The UI must forecast the
specific constraint before placement.

## C8. Failure And Recovery

Failure must degrade locally before it destroys the station:

```text
healthy -> pressured -> strained -> failing -> offline/damaged
```

The player must see the cause and have more than one response, such as throttling
traffic, changing hours, rerouting, restocking, adding capacity, recalling staff,
closing the room, repairing, or outsourcing.

Randomness selects timing and target among already plausible stressed systems. It
must not produce arbitrary punishment disconnected from player operation.

## C9. Progression And Availability

- Keep future facilities visible in the catalog as aspirations.
- Use credits, physical prerequisites, rating, relationships, and demand as soft gates.
- Technical unlocks are reserved for genuinely new institutional capability.
- Optional contracts may subsidize a direction but never provide exclusive access.
- The player must be able to self-fund every ordinary portfolio facility.
- A new phase should introduce a decision family, not one mandatory checklist item.

## Shared Acceptance Gate

Before a portfolio merges:

1. A call with no facility completes zero relevant service.
2. A correctly supplied facility visibly serves at least one actor or ship.
3. Saturating one stage creates a visible queue or backlog at that stage.
4. Adding the correct capacity improves measured throughput.
5. Removing stock, power, water, staff, or access blocks the correct operation.
6. World feedback, inspector, ledger, rating, and save/load agree.
7. The player has at least two reasonable responses to the demonstrated pressure.
8. Focused checks cover missing, blocked, full, successful, interrupted, and migrated
   save cases.
