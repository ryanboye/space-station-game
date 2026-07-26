# Trade And Logistics Portfolio

Status: partial; opening retail is live, deeper cargo economy is incomplete

## Player Promise

Turn location and traffic into a physical exchange economy. The player chooses what
to stock, how much capital to tie up, which freight to handle, and how to route goods
without choking passenger space or station supplies.

## Current Inventory

- Market room and Market Stall;
- Travel Supplies stock, capacity, price policy and sales;
- opening economy profile derived from charter location;
- supplier orders and supplier-vs-courier ownership distinction;
- Pod Dock Freight Locker;
- Logistics Stock/Intake Pallet and Storage/Storage Rack;
- Cargo Arm, Customs Counter and berth cargo capability;
- Cargo Handler role and hauling jobs;
- tenant Market Stall and Gift Shop offers;
- economy ledger and dock result chips.

Current limitations: travel supplies dominate retail, storage classes are shallow,
stock policies are not a mature player tool, and berth-scale cargo lacks a complete
terminal operation.

## T1. Travel Supplies Shop

Required build:

- Market, 10+ tiles;
- one Market Stall;
- Freight Locker or berth receiving path;
- opening stock order;
- power, access and Cargo Handler availability.

Operation:

- order creates expense and named supplier delivery;
- unloaded stock becomes station-owned at an Intake Pallet or Freight Locker;
- hauling moves it to the stall's 32-unit local capacity;
- each customer reserves a stall slot and buys a bounded quantity;
- sale event records price, units, landed cost and margin;
- Budget/Standard/Premium policy changes demand, margin and satisfaction;
- empty or inaccessible stall records a missed sale, never synthetic revenue.

## T2. Pod Courier Desk

Required build:

- Pod Dock with adjacent Freight Locker;
- free locker lot capacity;
- Cargo Handler or explicit automated small-lot transfer;
- destination/return capacity.

Operation:

- courier cargo remains consigned;
- locker receives one batched lot and transfers it over time;
- complete units earn handling fees;
- partial completion pays only completed work and remains attributable;
- consigned goods never appear in station-owned stock;
- supplier and courier chips use distinct language and ledger categories.

## T3. Warehouse And Stock Policy

Add commodity families incrementally:

1. travel supplies;
2. raw food and prepared meals;
3. beverages;
4. fuel and parts;
5. medicine and premium goods;
6. contract/consigned freight.

Storage classes:

- intake/staging;
- ambient rack;
- cold storage;
- beverage store;
- secure/high-value storage;
- hazardous fuel/industrial store;
- bonded consigned freight;
- waste/returns.

Each storage zone or module exposes accepted families, capacity, reserved amount,
incoming jobs, outgoing jobs and blocked reason. Wrong storage blocks or degrades the
commodity; it does not silently become generic stock.

Stock-policy menu, opened from the physical storage room:

- target minimum and maximum by family;
- reserve amount protected from sale/export;
- allowed supplier source;
- priority destination;
- emergency purchase toggle;
- no per-tile item spreadsheet.

## T4. Cargo Berth

Minimum medium cargo terminal:

- rectangular three-sided Berth floor with one open space edge;
- Berth Control;
- at least two Docking Clamps for medium vessel mass;
- Cargo Arm;
- station-side access and separated freight route;
- Intake Pallets or bonded staging capacity;
- Cargo Handlers and operating storage destination.

Optional capabilities:

- Customs Counter for controlled/high-value cargo;
- second Cargo Arm for interface throughput;
- larger staging area to prevent ship-side blockage;
- secure gate/camera coverage;
- cold or hazardous terminal equipment;
- dedicated supplier berth windows.

Turnaround stages are parallel but independently constrained:

```text
secure vessel -> open manifest -> unload -> stage -> inspect if required
  -> route station stock / hold consigned cargo -> load outbound -> release
```

The ship cannot depart while accepted cargo remains stranded, unless the player
aborts and accepts the contractual consequence.

## T5. Commercial District

Commercial shells support Market Stall, Gift Shop, Restaurant and Cantina tenants.
Trade expansion adds later tenant kinds:

- freight forwarder;
- pharmacy/medical supplier;
- parts dealer;
- luxury retailer;
- salvage broker.

The player chooses station operation or tenancy. Tenant stock terms must explicitly
say who supplies goods and who absorbs stockout risk. Footfall depends on path, nearby
docks/berths, district quality, price and competing businesses.

## Strategic Choices

- retail margin versus courier volume;
- passenger concourse versus back-of-house freight space;
- bulk discount versus tied-up cash and spoilage/theft risk;
- reserve receiving windows for station supplies versus sell them to customers;
- high-value secure goods versus low-risk ordinary goods;
- direct shop operation versus tenant rent;
- centralized warehouse versus smaller local service cupboards.

## Failure And Recovery

- stock at intake but empty shelf: add hauling labor or shorten route;
- full locker/arm: add staging or refuse a lot;
- supply ship delayed by commercial traffic: reserve berth/dock windows;
- theft: improve local control, storage security, patrol timing or accept loss;
- cold/power failure: reroute, repair, discount or dispose of affected stock;
- freight congestion crossing passenger flow: create separate logistics spine;
- excessive inventory: lower order targets or accept carrying cost.

## Acceptance Scenario

A shop order, courier call and station supply delivery overlap:

- ownership remains correct for all three lots;
- only the shop order increases station inventory;
- only courier completion earns handling fees;
- physical intake, hauling and shelf capacity determine sales;
- a full staging buffer blocks the correct interface and identifies the fix;
- moving storage closer changes delivery latency without changing item ownership;
- all cash and units reconcile after save/load.
