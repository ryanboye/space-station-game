# Residents And Civic Life

Status: partial; permanence track, not a station portfolio

## Player Promise

Allow a successful port to become a place where people live. Residents provide stable
rent, local spending, labor potential and station stories in exchange for continuous
service obligations. This system combines with any portfolio rather than replacing it.

## Population Contract

- **Crew:** player-hired employees operating station-owned systems. They use Crew
  Quarters and receive wages/schedules.
- **Tenant staff:** supplied by leased businesses. In the first physical pass they
  arrive on scheduled commuter pods and depart after service hours.
- **Residents:** permanent civilians with private homes and daily routines. Some may
  later fill tenant jobs automatically.
- **Visitors:** transient arrivals who consume services and leave.

Do not add households, family simulation, a manual labor market or mixed-use zoning
to V1.

## Existing Foundations

- resident entities, needs and routine code;
- housing policies and bed assignment concepts;
- wealth, local reputation, property value and district concepts;
- Dorm, Bed, Bunk, Hygiene, food, Lounge, Market and Clinic facilities;
- tenant commercial units and supplied staff count;
- docks/berths and scheduling needed for commuters.

Resident fixture usage is still weaker than crew/visitor physical use. Complete shared
service sessions before expanding population economics.

## R1. Private Quarters

Add room: Private Quarters or Residential Unit, distinct from Crew Dorm.

Minimum unit:

- one residential bed per assigned resident;
- personal storage/locker;
- privacy boundary and reachable door;
- nearby or ensuite Toilet, Sink and Shower access;
- reliable power, air and water;
- minimum comfort, cleanliness and safety.

Unit quality uses physical conditions:

- area per resident;
- bed quality and privacy;
- noise and crowding;
- air, temperature and light;
- cleanliness and maintenance;
- nearby services and local safety.

Residents pay rent for occupied valid units. A painted room with no usable bed creates
no housing capacity or rent.

## R2. Daily Routine

Initial routine:

```text
home/sleep -> hygiene -> work or personal time -> food -> shopping/leisure -> home
```

Every activity uses the same physical facility sessions as other populations. Routine
offsets create natural waves without forcing a universal day/night fiction. Residents
can choose among available facilities based on access, distance, price, quality and
preference.

Resident needs do not instantly reset on room entry. Failure produces specific
thoughts, behavior, satisfaction and eventual move-out pressure.

## R3. Tenant Commuters

Initial implementation:

- each open tenant declares supplied staff and opening hours;
- a commuter pod delivers a batched visible group before opening;
- delayed/blocked dock access delays tenant opening;
- staff occupy tenant posts and use station food/hygiene/leisure during breaks;
- return pod removes them after shift;
- player does not hire or schedule individuals.

This gives leased businesses a physical labor source without building a labor market.

Later, residents with a matching simple profile may fill a tenant slot automatically.
The UI reports `1 resident worker, 1 commuter`; the player does not assign them.

## R4. Civic Services

Settlement growth adds 24-hour demand for:

- food and shopping;
- hygiene and water;
- recreation and social space;
- Clinic access;
- safety/security;
- reliable utilities and maintenance;
- later laundry, education or local administration only when population warrants it.

Civic facilities are capital choices because they improve retention, property value
and local spending but create continuous operating cost. Avoid adding empty room types
that do not create a new physical routine.

## R5. Economy And Growth

Resident value:

- recurring rent;
- local purchases;
- steadier off-peak demand;
- potential tenant labor;
- rating and district development.

Resident obligations:

- continuous utilities and services;
- housing maintenance;
- safety and emergency protection;
- more complicated traffic and crowd rhythms;
- political simulation explicitly deferred.

Housing demand depends on rating, rent, available jobs/amenities, unit quality and
station identity. Residents apply to visible vacancies; they do not appear because a
tier counter crossed a threshold.

## Strategic Choices

- dedicate scarce space to stable housing or high-turnover visitor revenue;
- affordable dense units versus premium spacious units;
- central convenient housing versus quiet remote districts;
- depend on commuter tenant labor or grow a local resident workforce;
- serve residents with station facilities or commercial tenants;
- accept 24-hour obligations or remain a transient port.

## Failure And Recovery

- no bed/privacy: applicant refuses or resident moves out;
- service closed during off-hours: resident reroutes, waits or loses satisfaction;
- commuter dock delay: tenant opens late and loses sales;
- rising crime/noise: property value and resident mix change locally;
- utility outage: temporary discomfort escalates to evacuation/move-out;
- vacancy: lower rent, improve district, attract jobs or repurpose the room.

## Acceptance Scenario

Operate one four-resident block beside a tenant business for two routine periods:

- residents claim distinct homes and fixtures;
- tenant staff arrive and depart on a commuter pod;
- at least one service wave is visibly caused by routines;
- delayed commuter arrival changes tenant opening, not resident employment globally;
- rent, purchases and service costs reconcile;
- poor housing creates specific diagnosis and move-out pressure;
- residents remain optional for a functioning transient station.
