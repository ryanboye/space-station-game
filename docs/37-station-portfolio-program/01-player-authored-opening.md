# Player-Authored Opening

Status: immediate vertical slice after P0 truth fixes

## Design Goal

The opening should ask the player to decide what their roadside station will sell.
It must not begin as a complete miniature station that earns passively after Play is
pressed.

The player starts with a safe but commercially unfinished shell. They can see three
viable businesses and can comfortably complete one. The choice is made by building,
not by selecting a class on a title screen.

## Starter State

The authored starter should contain:

- enclosed and pressurized public shell with expansion edges;
- visible powered reactor or charter-appropriate solar installation;
- visible conduit and enough reserve for one modest business;
- working Life Support and visible local coverage;
- minimal Dorm, Hygiene room, crew food buffer, and safe circulation;
- two passenger-capable Pod Docks;
- one Freight Locker serving supplier deliveries;
- no passenger berth;
- no completed Market, Cafeteria, Lounge, Cantina, Workshop, or Commercial Unit;
- four to six general crew with full opening needs;
- enough credits for one complete starter business plus a small contingency;
- no inherited tier, goal, or traffic progress from previous saves.

Exact starter capital should be calculated after economy truth work. The target is:

- one starter recipe consumes 55-70% of cash;
- two recipes cannot both be completed immediately;
- a placement mistake can be corrected using the 50% resale and module-move tools;
- ordinary wages do not cause bankruptcy during the first decision minute.

## Opening Demand

The first pod wave samples all three service families:

- travelers seeking meals;
- travelers seeking supplies;
- craft seeking fuel or minor repair.

Calls advertise only installed ship-side service, but departure feedback shows general
missed passenger demand. Examples:

```text
2 travelers | wanted food | bought nothing
1 traveler | supplies sold 2 | +12c
fuel request | unavailable | est. 18c missed
```

The player may leave the station running. Access fees cover a portion of wages but do
not create meaningful growth. Building a service changes the visible results quickly.

## Choice A: Feed Travelers

Minimum recipe:

- paint at least 12 Cafeteria tiles;
- place one Serving Station;
- place two Tables, providing eight rendered seats;
- buy an opening batch of prepared meals;
- connect power and provide a reachable door.

Initial operation:

- visitors reserve serving capacity, collect one located meal, reserve a seat, eat,
  produce a dirty tray state, and leave;
- service revenue and meal cost appear separately in the ledger;
- the room reports meals, serving pressure, seating, trays, cleanliness, and recent
  missed demand.

Early expansion options:

- another Table for seating pressure;
- another Serving Station for pickup pressure;
- a Tray Return/Dishwasher for dirty-tray pressure;
- a Kitchen for lower meal cost and higher labor complexity;
- a Lounge or Cantina to increase passenger spend.

## Choice B: Sell Travel Supplies

Minimum recipe:

- paint at least 10 Market tiles;
- place one Market Stall;
- order opening stock through the Freight Locker;
- choose Budget, Standard, or Premium pricing;
- provide power, a reachable door, and a Cargo Handler path from receiving.

Initial operation:

- supplier lot arrives, unloads, becomes station stock, and is hauled to the stall;
- visitors reserve a stall session, buy units, and reduce located inventory;
- inspector shows on-hand/capacity, units in transit, landed cost, sale price, recent
  sales, margin, restock ETA, and missed sales;
- an empty stall completes no sale.

Early expansion options:

- larger stock order for wholesale efficiency but higher tied-up capital;
- second stall for throughput;
- Storage room and Racks for buffer capacity;
- Premium policy for margin or Budget policy for volume;
- tenant Gift Shop or second station-owned shop.

## Choice C: Service Ships

Minimum fuel recipe:

- install a Fuel Coupler beside one Pod Dock;
- paint at least 6 Maintenance tiles;
- place one Fuel Tank;
- draw fuel pipe from tank to coupler;
- order an opening fuel lot;
- provide power and safe access.

Minimum repair follow-up:

- install a Maintenance Socket beside a Pod Dock;
- build a Workshop with one Workbench;
- stock raw material/parts;
- hire or assign a Mechanic when physical staffing is enabled.

Initial operation:

- compatible craft advertises the requested amount;
- coupler reserves fuel and transfers it over time concurrently with passenger activity;
- tank sprite and inspector show actual fill level;
- result reports units, revenue, stock cost, margin, and any blocked reason;
- unavailable fuel or broken piping completes zero refuel service.

Early expansion options:

- second tank for buffer;
- another coupler/dock for throughput;
- repair service for higher margin;
- Fuel Pump and medium berth for larger vessels;
- solar or reactor expansion to support pumps and workshops.

## Opening Interface

Do not add a large tutorial or three selection cards. Use:

- sampled dock thoughts and demand icons;
- departure result chips with estimated missed revenue;
- catalog groups named `Feed Travelers`, `Sell Supplies`, and `Service Ships`;
- a compact recipe preview showing cost, footprint, power, staff, and stock;
- placement previews that identify doors, utility links, and owning docks;
- a first-cycle summary of earned and missed demand;
- contextual alerts that open the relevant room, stock order, or utility overlay.

Future facilities remain visible with plain prerequisite copy. No hidden tier surprise.

## Balance Targets

- Basic pod access: approximately 3c.
- Good completed pod visit: approximately 10-30c gross.
- Starter service cluster: several successful calls, not dozens of passive minutes.
- One path should become modestly profitable before payroll only when supplied and used.
- Direct prepared meals have the simplest operation and lowest margin ceiling.
- Retail ties up capital and is sensitive to charter demand and price.
- Fuel has strong per-call revenue but requires stock, pipe, tank, and dock hardware.

## Acceptance Playthrough

Run three clean starts from the same charter:

1. Hospitality-only station serves food and reports missed retail/fuel demand.
2. Commerce-only station sells supplies and reports missed food/fuel demand.
3. Engineering-only station refuels craft and reports missed passenger spending.

For each run:

- the chosen facility changes world behavior within two pod waves;
- the ledger reconciles cash, stock cost, revenue, and payroll;
- no unbuilt service receives credit;
- the player can name what they chose, what they gave up, and what they are saving for;
- by the end of the opening, at least three plausible investments compete for cash;
- no build requires Approach Control or manual manifest approval.

## Non-Goals

- No research, military, residents, loans, or large contracts in the first decision.
- No raw-food chain requirement before the player has learned prepared meals.
- No full construction-time simulation; placement remains instant in this track.
- No arbitrary `Fund Project` object replacing physical construction.
