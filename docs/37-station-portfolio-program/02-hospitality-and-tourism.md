# Hospitality And Tourism Portfolio

Status: partial; strongest existing player-facing base

## Player Promise

Build a roadside cafe into a destination station. The player manages the tension
between throughput, quality, dwell time, labor, and shared public space.

Hospitality is not one need meter. It contains distinct operations:

- food production and meal service;
- drinks and nightlife;
- rest and comfort;
- recreation and wonder;
- later lodging and premium guest service.

## Current Inventory

Live or partial rooms and modules:

- Cafeteria: Serving Station and four-seat Table;
- Kitchen: Fridge, Cold Store, Prep Counter, Stove, Sink, Dishwasher;
- Tray Return and dirty-tray capacity;
- Lounge: Couch and Game Station;
- Cantina: Bar Counter, Tap and Bench;
- Rec Hall: Rec Unit;
- Observatory: Telescope;
- station-operated and tenant Restaurant/Cantina models;
- Cook and Steward roles;
- meal, drink, leisure, queue, seating, dirt, wear, rating, and economy code.

Known blockers are tracked in opening tickets 01, 07, 09, 10 and 11. Do not add
new hospitality completion paths before those truth defects are resolved.

## H1. Prepared-Meal Cafe

Required build:

- Cafeteria, 12+ tiles;
- one Serving Station;
- two Tables;
- reachable door, pressure and power;
- located prepared meals.

Operation:

- each Serving Station has two pickup slots and finite service time;
- each Table exposes four exclusive visible seats;
- a visitor reserves pickup, receives exactly one meal, reserves a seat, eats for a
  real dwell period, then releases it;
- crew, visitors, and residents may use the room under separate access and priority;
- clean trays are finite; eating creates dirty trays; unavailable clean trays block
  service with `NO CLEAN TRAYS`;
- stock, tray state, queue, seats and cleanliness are visible in-world and inspector.

Player decisions:

- add serving throughput, seating, tray capacity, or cleaning based on the real block;
- buy meals at high landed cost or progress to kitchen production;
- reserve meal windows for crew or leave the room public all day.

## H2. Production Kitchen

Required minimum build:

- Kitchen, 8+ tiles;
- Fridge or Cold Store;
- Prep Counter;
- Stove;
- Sink or Dishwasher;
- adjacent or efficiently connected Cafeteria;
- Cook role and Cargo Handler support;
- raw food delivery through Freight Locker or berth receiving.

Production stages:

```text
raw food delivery
  -> cold storage
  -> prep counter
  -> stove
  -> prepared-meal buffer
  -> serving station
  -> table
  -> dirty tray
  -> tray return
  -> dishwasher
  -> clean tray
```

Every stage has located input/output capacity, a work duration, and a visible blocked
reason. A Fridge never creates food. The player may bypass this chain by purchasing
prepared meals, preserving a simple but expensive alternative.

Expansion:

- Cold Store for bulk input;
- additional Prep Counter for prep waves;
- additional Stove and Cook for production;
- heated/local serving buffer for a distant cafeteria;
- dish room for tray recovery;
- service hours and staggered crew meal waves.

## H3. Lounge And Recreation

Distinct sessions:

| Facility | Primary effect | Dwell | Pressure created |
|---|---|---:|---|
| Couch | quiet comfort/social rest | medium | seats and quiet |
| Game Station | active recreation | long | power, noise, group capacity |
| Rec Unit | exercise/play | long | space, cleaning, wear |
| Telescope | wonder/premium attraction | long | low throughput, high quality |
| Bench | basic waiting/social seat | short | low quality, high density |

Required behavior:

- actors reserve and occupy a rendered fixture slot;
- needs recover over dwell time, not on room entry;
- populations have different preferences and patience;
- fixture variety prevents one Couch from satisfying every leisure demand;
- room quality incorporates crowding, dirt, noise, plants, air and fixture condition;
- idle/off-duty actors visibly mill, sit and socialize instead of standing at posts.

## H4. Cantina And Nightlife

Required build:

- Cantina, 8+ tiles;
- Bar Counter;
- at least one Tap;
- Bench/Couch seating proportional to expected demand;
- beverage stock;
- Steward or tenant staff;
- power, water for cleaning, and waste/tray handling as applicable.

Operation:

- visitor queues for a drink at a bar pickup slot;
- Steward service rate and Tap count determine pickup throughput;
- visitor consumes one beverage unit, then carries drink to a reserved seat;
- drinking is a timed social session and may repeat within a configured limit;
- repeat demand depends on patience, price, visit duration and population profile;
- nightlife increases noise, mess, theft/disorder pressure and revenue.

The current Bar Counter storage is a local handoff buffer, not an infinite beverage
source. Add beverage delivery and local restocking before claiming a full operation.

## H5. Restaurants, Tenants And Premium Service

Station-operated restaurant:

- player builds full kitchen/dining facility, buys stock, hires staff and keeps revenue;
- player sets price/service policy and hours.

Tenant restaurant or cantina:

- player paints a Commercial Unit shell and accepts one of several procedural offers;
- tenant installs fit-out, supplies declared staff/stock and pays rent/revenue share;
- tenant uses the same seats, queues, stock and service-result events;
- utilities, access, opening hours and service standard remain player obligations;
- poor footfall or repeated closure can cause renegotiation or vacancy later.

Offer comparison should show concept, fit-out preview, expected customers, rent,
revenue share, supplied staff, supplied stock and utility expectations.

## H6. Lodging Expansion - New

Add a Guest Quarters room distinct from Crew Dorm and Private Residence.

Minimum guest wing:

- reception/check-in counter;
- guest bed or compact cabin;
- luggage locker;
- nearby public or ensuite hygiene;
- safe path from passenger berth;
- Housekeeper/Steward coverage.

Guest session:

```text
arrive -> check in -> claim room -> station leisure/food -> sleep -> check out
```

Lodging creates multi-period visitors, stronger amenity demand and room revenue. It
also creates cleaning waves, luggage circulation, noise conflicts and greater failure
cost. Do not add lodging until ordinary visitors physically use food, hygiene and
leisure reliably.

## Economic Identity

Possible station identities emerge from investment:

- roadside rest stop: prepared meals, supplies, basic lounge;
- nightlife port: bars, entertainment and permissive access;
- family/passenger terminal: throughput, hygiene, seating and safe circulation;
- resort: observatory, premium food, quiet rooms and lodging;
- convention hub: large arrival waves, restaurants and event space later.

Rating changes customer mix and willingness to pay. It should not unlock Tables or
Stoves. Premium tenants and luxury traffic require proven service quality.

## Failure And Recovery

- stockout: order prepared meals or raw food, reduce traffic, close service;
- serving queue: add pickup capacity, stagger waves, open second venue;
- seat queue: add tables/benches or reduce dwell with a faster service policy;
- tray collapse: add returns/washing or assign Steward/Cleaner support;
- exhausted staff: change hours/roster, add staff or lease a venue;
- dirty/noisy district: add cleaning, separate quiet rooms or accept rough identity;
- power/water failure: close affected facility and reroute actors visibly.

## Acceptance Scenario

Build two same-area hospitality wings with different fixtures. One emphasizes fast
food throughput; the other emphasizes drinks and long leisure. Over two traffic waves:

- people occupy distinct rendered seats;
- the rooms produce different dwell, revenue, noise, dirt and satisfaction;
- an undersized stage forms and drains a visible queue;
- removing stock or staff blocks only the correct operation;
- tenant and station-operated service report through the same events;
- no unbuilt hospitality service receives settlement credit.
