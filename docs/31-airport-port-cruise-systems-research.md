# Airport, Port, And Cruise Operations Research

Status: design research and recommendation
Date: 2026-07-21

This document compares three real-world operating models that are relevant to
the station game:

1. Airports, where aircraft are processed through a terminal and an apron.
2. Seaports, where vessels call at specialized terminals and use a shared port
   service network.
3. Cruise ships, which are simultaneously hotels, residential communities,
   industrial plants, and visiting vessels at other ports.

The purpose is not to reproduce real regulations. It is to identify the
physical flows and useful decisions that can make the station feel coherent.

## Executive Recommendation

The station should be designed as a **cruise ship with a port-of-call and
terminal interface**, not as an airport with rooms attached.

That means three overlapping layers:

| Layer | What it represents | Primary population | Main question |
|---|---|---|---|
| Port call | Ships approach, dock, exchange people and goods, receive services, and leave | Transient visitors, freight, ship crews | Can this call be processed safely and profitably? |
| Station hotel | Residents and visitors eat, rest, socialize, shop, and seek care | Residents, crew, transient guests | Is the station pleasant and sustainable to live in? |
| Station plant | Air, power, water, waste, food, maintenance, storage, and security | Crew and service workers | Can the institution support both populations? |

The current game already has pieces of all three. The design problem is that
they are not yet presented as three connected but distinct operating layers.

The key game loop should therefore be:

> Traffic arrives -> the station processes the call -> people and goods enter
> shared spaces -> needs and service capacity create visible pressure -> crew
> restore flow -> the station earns reputation and attracts a different mix of
> traffic.

Approach Control should remain an important policy and exception surface, but
not a repeated paperwork task for every ship.

## 1. How An Airport Works

### The aircraft movement side

An aircraft lands on a runway, exits through a taxiway, and travels to an
apron or gate position. The apron is the aircraft service area: passengers and
cargo are loaded or unloaded there, and the aircraft may be refueled, parked,
cleaned, catered, or given light maintenance. The gate is one position within
that larger aircraft movement and service system; it is not normally the only
place all aircraft work happens.

The basic movement chain is:

```text
arrival airspace
    -> runway
    -> taxiway
    -> apron / gate
    -> turnaround services
    -> taxiway
    -> departure runway
```

The FAA defines an apron as an area intended for loading and unloading
passengers or cargo, refueling, parking, or maintenance. This is the useful
design insight for the game: a berth should be treated as a service position
with a surrounding operating area, not as a single tile that magically
completes a ship visit.

Sources:

- [FAA Pilot/Controller Glossary: Apron](https://www.faa.gov/air_traffic/publications/atpubs/pcg_html/glossary-a.html)
- [FAA Airport Planning and Design](https://www.airporttech.tc.faa.gov/Airport-Safety/Airport-Planning-Design)
- [FAA AC 150/5360-13A: Airport Terminal Planning](https://www.faa.gov/airports/resources/advisory_circulars/index.cfm/go/document.current/documentNumber/150_5360-13)

### Passenger flow

Airports separate passenger processing into public or landside space and
controlled or airside space. A typical departing passenger moves through:

```text
curb / arrival
    -> check-in or bag drop
    -> security screening
    -> sterile concourse
    -> gate holding area
    -> aircraft
```

A typical arriving passenger moves through:

```text
aircraft
    -> gate / arrival corridor
    -> immigration or customs when required
    -> baggage claim
    -> public exit / ground transport
```

Transfers may remain inside a controlled zone. The important game abstraction
is not the legal distinction itself. It is that passenger flow has checkpoints,
branching destinations, and different access policies. A public lounge, a
secured departure concourse, and a baggage handling corridor should not all be
the same kind of path.

ICAO airport guidance explicitly covers terminal buildings, check-in,
screening, airside areas, gates, passenger transfer, disembarkation, baggage
claim, and arrivals. It also emphasizes efficient flow arrangements and keeping
retail and other facilities from impeding passenger movement.

Sources:

- [ICAO Airport, Aircraft, Crew and Cargo Module](https://www.icao.int/cart/Airports-Module)
- [ICAO airport flow and passenger processing guidance](https://www.icao.int/Meetings/FALP/Documents/FALP9-2016/FALP9-WP15_Airport-Traffic-Flow-Arrangements_IATA.pdf)
- [FAA AC 150/5360-9: terminal circulation and screening queues](https://www.faa.gov/documentLibrary/media/Advisory_Circular/AC_150_5360-9.pdf)

### Baggage and cargo

Passenger baggage is usually not carried through the public concourse as a
normal passenger task. Checked bags enter a back-of-house handling system:

```text
check-in / bag drop
    -> screening and sortation
    -> make-up area
    -> ramp transfer
    -> aircraft hold
```

On arrival, the direction reverses:

```text
aircraft hold
    -> ramp transfer
    -> baggage reclaim system
    -> public baggage claim
```

Air cargo is usually handled through cargo terminals and cargo aprons rather
than through the passenger terminal. Cargo moves between aircraft, temporary
storage, screening or customs, and truck or rail connections. That makes cargo
more like the station's logistics system than like a visitor need.

### Fuel and repairs

Fuel is generally supplied at the apron from a fuel farm through hydrant
systems or mobile fuel trucks. Refueling may happen during the same turnaround
as cleaning, catering, baggage handling, and passenger boarding, subject to
safety rules and coordination.

Heavy maintenance is usually separated from passenger gates in maintenance
aprons or hangars. A passenger aircraft may use a gate for routine turnaround
work and later move to a hangar for inspections or substantial repairs.

This suggests two different service classes for the game:

- **Turnaround services:** fast, parallel, berth-side work such as passenger
  access, food, baggage, fueling, cleaning, and basic inspection.
- **Shop services:** longer, capacity-heavy work such as repair, overhaul,
  refit, or major cargo handling, often requiring a dedicated bay or workshop.

### What airport layout teaches us

Good airport layouts are built around controlled flows and expandable branches:

- Put the main passenger processing area where many gates can share it.
- Keep gate holding and passenger amenities close enough that people do not
  cross the aircraft service apron.
- Keep cargo, baggage, and service vehicles on back-of-house routes.
- Provide enough queue and circulation space that a queue does not become the
  only route between important rooms.
- Put food, retail, toilets, seating, and information where passengers already
  pause, but do not let those services obstruct the main path.
- Preserve room for gates, baggage capacity, and circulation to expand.
- Use secure doors and access boundaries to separate passengers, staff, cargo,
  and dangerous equipment.

For the game, the player should be rewarded for building a readable public
concourse with short branches to services, plus a separate crew/logistics spine
that does not force carts through the middle of the lounge.

## 2. How A Port Works

An airport is usually organized around aircraft gates and a terminal. A port is
more heterogeneous. It is a network of waterways, anchorages, berths, quays,
terminals, yards, roads, rails, warehouses, tanks, service providers, and
authorities. Different vessel and cargo classes use different parts of it.

### Arrival, anchorage, and berth

A ship may approach through a traffic lane, receive navigation or pilotage
support, wait at anchorage or a holding area, and then proceed to an assigned
berth. The berth is a ship-to-shore interface. It is not necessarily a public
passenger terminal and it is not necessarily equipped for every cargo or ship
service.

The basic port-call chain is:

```text
approach / traffic management
    -> pilot, tug, and navigation support as needed
    -> anchorage or holding area if berth is unavailable
    -> berth / quay / terminal
    -> cargo, passenger, fuel, stores, waste, repair, and clearance services
    -> unberth and depart
```

The IMO's Just-In-Time port guidance describes ships waiting because the berth,
cargo, tank capacity, or nautical service is not ready. That is a useful source
of gameplay: the bottleneck can be the berth, the cargo buffer, the fuel tank,
the crew, or the service provider, rather than a generic "ship processing"
meter.

Source: [IMO Just-In-Time Portal](https://greenvoyage2050.imo.org/pdf/just-in-time-portal/)

### Cargo terminals

Ports specialize by cargo type:

- Container terminals use quay cranes, yard transport, container stacks, and
  truck or rail gates.
- Bulk terminals use hoppers, conveyors, silos, tanks, and pipelines.
- Liquid terminals use dedicated tanks, pipes, pumps, and safety zones.
- Ro-ro terminals use ramps and vehicle staging areas.
- Breakbulk terminals use cranes, covered storage, open yards, and specialized
  lifting equipment.
- Cruise terminals use passenger processing, baggage areas, security,
  customs/immigration, and a passenger access bridge or gangway.

The common pattern is **ship interface -> staging buffer -> inland or internal
destination**. The buffer is essential. A ship should not be considered served
merely because a crane touched it; the cargo needs somewhere to go, and the
terminal needs enough equipment and labor to keep the interface moving.

This maps cleanly to the current game. An intake pallet is a small staging
buffer, storage racks are the yard, cargo arms are ship-interface equipment,
and crew are the transport and service labor. The current material model should
continue to distinguish station-owned supplies from consigned freight.

Sources:

- [U.S. Maritime Administration: marine highway terminal operations](https://www.maritime.dot.gov/sites/marad.dot.gov/files/docs/intermodal-systems/marine-highways/3101/west-coast-marine-highway-market-analyis-final.pdf)
- [U.S. DOT Port Infrastructure Grant Program](https://www.maritime.dot.gov/sites/marad.dot.gov/files/docs/ports/office-port-infrastructure-development/port-and-terminal-infrastructure-development/11481/port-infrastructure-grant-program-nofo-06182019.pdf)
- [IMO Compendium: cargo, bunkers, and ship-service data](https://imocompendium.imo.org/public/IMO-Compendium/Current/cd1.htm)

### Fuel, provisions, repairs, and waste

Ports are service ecosystems. Depending on the port and vessel, a call may
include:

- Bunkering, delivered by pipeline, truck, or barge.
- Potable water and technical water.
- Food, stores, spare parts, and other provisions.
- Garbage, sewage, oily waste, and other waste reception.
- Crew changes and passenger processing.
- Pilotage, tug assistance, mooring, and line handling.
- Customs, immigration, port health, and security.
- Survey, inspection, cleaning, hull work, and repairs.

These services are not all performed in one place or one sequence. The useful
operational idea is **simultaneous operations**. Cargo handling, bunkering,
provisioning, and some maintenance may happen in parallel if the berth, crew,
equipment, and safety rules allow it. The IMO notes that the inability to
perform compatible operations in parallel can extend a port stay and force a
ship to a lay-by berth or anchorage.

Sources:

- [IMO Ship-Port Interface Measures](https://greenvoyage2050.imo.org/ship-port-interface-measures-portal/)
- [IMO port reception facilities](https://www.imo.org/en/ourwork/environment/pages/port-reception-facilities.aspx)
- [Gibraltar Port Authority: bunkering and port services](https://www.gibraltarport.com/bunkering)
- [Gibraltar Port Authority: cruise facilities and services](https://www.gibraltarport.com/cruise/facilities)

This creates a better game model than a single berth checklist. A large ship
should have a port-call plan with several parallel workstreams:

```text
passenger access    cargo transfer    fueling
        \                 |              /
         \                |             /
             berth turnaround window
         /                |             \
  provisioning       waste handling     repairs
```

The player does not need to approve each work item. They need to build enough
compatible infrastructure and labor that the workstreams can actually run.

### Port layout lessons

Ports separate incompatible flows more strongly than airports do:

- Public passenger routes should not cross heavy cargo routes.
- Fuel and dangerous cargo need controlled access and safety clearance.
- Storage yards and tanks must be near the relevant berth or connected by a
  capable internal transport route.
- Service craft and trucks need their own circulation and staging space.
- A berth may need a nearby lay-by or holding area when a service is delayed.
- A port can contain many specialized terminals instead of one universal room.

For the game, layout should matter through a small number of visible causes:
distance, cross-traffic, buffer capacity, access control, and shared labor. The
player should not be asked to solve a hidden graph optimization problem.

## 3. How A Cruise Ship Works

A cruise ship is not just a large visitor. It is a self-contained hotel and
industrial plant that periodically connects to a port. It has passenger rooms,
crew quarters, galleys, restaurants, bars, entertainment, retail, pools,
medical facilities, housekeeping, waste treatment, water systems, HVAC, power
generation, and engineering spaces.

Modern passenger ships can carry thousands of passengers and crew. IMO's
passenger-ship material describes cruise ships carrying more than 5,000 people,
which makes the scale transition directly relevant to the game's long-term
vision.

Source: [IMO Passenger Ship Safety](https://www.imo.org/en/mediacentre/hottopics/pages/passengership-default.aspx)

### Two kinds of cruise port call

The game should distinguish two cruise patterns:

#### Port of call

The ship remains the home of most passengers. Some guests disembark for shore
excursions, while others stay onboard and use the ship's restaurants, lounges,
shops, pools, and entertainment. The ship may take on fuel, water, food, and
stores, discharge waste, and perform maintenance while passengers are moving
through the port.

This is the best analog for the player's station once it has residents. The
station is a place where people already live, while visiting traffic temporarily
uses its public services.

#### Homeport or turnaround call

This is a much larger operational event. Guests disembark, collect or transfer
luggage, and pass through border or customs processes. The terminal is then
cleaned and reset while new guests check in, pass security, and board. At the
same time, the ship receives provisions, fuel, water, stores, waste service,
laundry support, crew changes, and technical work.

Cruise terminal procedures emphasize orderly and staggered disembarkation so the
gangway and clearance areas do not become congested. Port authorities also
describe dedicated embarkation, customs, immigration, baggage, security,
provisioning, and repair services.

Sources:

- [Curaçao Ports Authority: cruise embarkation and port services](https://curports.com/cruise/embarking/)
- [Canada Border Services Agency: cruise clearance and passenger management](https://www.cbsa.gc.ca/travel-voyage/cscp-pdnc-eng.html)
- [Rome Cruise Terminal operating procedure](https://www.romacruiseterminal.com/joomla/images/ROMA%20CRUISE%20TERMINAL%20OPERATIONS%20PROCEDURE%20VERSION%209%20ENG%2019122022.pdf)

The station's large visiting vessels can use a simplified version of the
turnaround model, but it should not be the only rhythm. Most traffic should feel
like port-of-call activity: ships arrive, a subset of people go through the
station, the ship receives a few services, and it leaves without freezing the
whole game into a report screen.

### The cruise ship's internal life-support loop

Cruise operations depend on continuous hotel and plant work, not only on
passenger-facing rooms:

- Galleys receive, store, prepare, and serve food.
- Housekeeping cleans rooms and public areas and handles laundry.
- Engineering maintains power, HVAC, water, waste, and propulsion systems.
- Medical staff handle illness and injury, with escalation or evacuation when
  onboard care is insufficient.
- Crew need housing, food, rest, hygiene, training, and secure work routes.
- Public spaces need toilets, seating, entertainment, retail, and food service.
- Sanitation is a system linking food, water, housekeeping, medical response,
  waste, and public health.

CDC cruise-ship inspections cover medical centers, drinking water, galleys and
dining rooms, pools, housekeeping, pest management, child activity centers,
and HVAC. This is a useful reminder that "hospitality" is not a decorative
layer. It is a maintenance and staffing dependency chain with visible outcomes.

Sources:

- [CDC Vessel Sanitation Program inspection areas](https://www.cdc.gov/vessel-sanitation/communication-resources/operational-inspections.html)
- [CDC 2025 Vessel Sanitation standards](https://www.cdc.gov/vessel-sanitation/media/pdfs/2025/06/2025_VSP_Environmental_Public_Health_Standards-508.pdf)
- [CDC cruise ship medical capabilities](https://www.cdc.gov/yellow-book/hcp/travel-air-sea/cruise-ship-travel.html)

### Crew and passenger circulation

Cruise ships normally have a strong distinction between guest-facing space and
back-of-house space. Guests use public corridors, atriums, restaurants,
lounges, shops, and cabin corridors. Crew use service corridors, crew stairs,
service elevators, galleys, laundry, storage, engineering, and waste routes.

This is an especially good fit for the station game because it creates a spatial
choice without requiring every room to have a complicated formula:

- Public corridors are pleasant and legible but expensive to keep clean and
  free of congestion.
- Service corridors are efficient for crew and cargo but should be inaccessible
  or unattractive to visitors.
- Shared corridors are possible, but they create visible interference, slower
  movement, dirt, and occasional security exposure.
- A back-of-house route can be shorter for logistics even when the public route
  is more comfortable for visitors.

## What This Means For The Game

### Keep the existing Dock and Berth distinction

This research strongly supports the current distinction:

- **Docks** are small walk-in interfaces for tiny pods and a handful of people.
  They are like a ferry landing, taxi stand, or small craft pier. Tiny ships
  should never occupy large berths.
- **Berths** are medium and large ship interfaces with a service footprint,
  passenger access, cargo handling, and potentially specialized services.
- **Holding orbit or anchorage** is a real state, not dead UI. A ship can wait
  because the berth, buffer, crew, or service package is unavailable.

The player should see the physical difference in the world, in traffic offers,
and in the scale of the passenger and cargo flows.

### Replace universal service checklists with port-call workstreams

Each ship should have a small number of service demands, such as:

| Workstream | Physical station examples | Typical constraint |
|---|---|---|
| Passenger access | Gangway, customs, airlock, arrival hall | Access and processing capacity |
| Hospitality | Serving counter, tables, toilets, lounge seats, cantina | Visitor needs, seats, staff, stock |
| Cargo | Cargo arm, intake, racks, freight route | Handling labor and buffer capacity |
| Fuel | Fuel tank, pump, transfer line, safety zone | Fuel stock and engineering labor |
| Repair | Workshop, repair bay, parts storage | Skilled crew, parts, time |
| Provisioning | Food store, water, stores transfer | Buffer capacity and logistics |
| Waste | Waste intake, processing, export or disposal | Reception capacity and sanitation |
| Security | Customs, patrol coverage, controlled doors | Risk, staffing, and access policy |

A routine ship can be admitted automatically when the station's policy says it
is acceptable. The simulation then runs these workstreams in parallel. The
player intervenes when a visible condition becomes limiting.

### Make layout matter through catchments and interference

The useful spatial rules are:

1. A passenger access point should connect quickly to the public concourse.
2. Public services should be clustered enough to be convenient, but not so
   tightly that one queue blocks every other destination.
3. Cargo and service routes should connect berths to storage and workshops
   without crossing the main passenger spine.
4. Fuel and repair should be close enough to serve berths, but separated by
   access and safety rules.
5. Large rooms need visible multi-person capacity: tables, benches, couches,
   serving slots, toilets, and counters. Do not require hundreds of individual
   chair modules.
6. Every important room needs a clear access path and enough doors. A room that
   can be built but cannot be reached should produce an obvious world warning.
7. Spare capacity and buffer space should be valuable. A station that is full
   in perfect conditions should struggle during an arrival wave.

These are all understandable from the world. They do not require the player to
read a hidden route score.

### Use real operational timing without making the game paperwork

The real systems suggest a richer rhythm than "approve ship, wait, receive
grade":

- Traffic arrives in waves, but the player sets policy for routine traffic.
- Ships wait when a berth or service package is unavailable.
- Several services run in parallel during a turnaround.
- A call has a soft plan and a hard departure deadline.
- Partial completion is normal and should be visible as it happens.
- A ship's outcome changes reputation, relationships, and future traffic mix.
- Exceptional or risky ships can still ask for manual intervention.

The player should mostly manage the station's operating capacity, not manually
process every manifest.

## Recommended Implementation Sequence

### Pass 1: Clarify the existing model

- Rename or explain berth-side stages as approach, access, service, and
  departure.
- Keep Dock and Berth eligibility visibly separate.
- Show a ship's active workstreams beside the physical berth.
- Show the limiting reason in the world: no seat, no service slot, no buffer,
  no labor, no route, or no access.
- Keep detailed overlays and inspectors as optional diagnostic tools.

### Pass 2: Make the public and service spines real

- Add a clear public concourse from gangway to hospitality rooms.
- Add a clearly marked crew/logistics route from berths to storage, kitchens,
  workshops, and waste handling.
- Make crossing a public route a visible but soft penalty: slower movement,
  dirt, crowding, or security exposure.
- Ensure queues spill into designed queue space rather than blocking a door or
  the only path to a room.

### Pass 3: Complete the hospitality loop

- Make tables and benches provide visible multi-person seating.
- Make toilets, lounge fixtures, cantina fixtures, and serving counters real
  providers with reservations, wait positions, dwell, and relief.
- Give visitors and crew different need priorities while allowing them to share
  facilities where appropriate.
- Use nearby speech, icons, and room-level indicators to show the need, cause,
  and corrective lever.

### Pass 4: Add specialized ship services

Add one service class at a time, with a complete loop:

1. Fuel depot and transfer pump.
2. Repair bay and parts storage.
3. Provisioning and waste reception.
4. Specialized cargo and military berths.

Each should have a physical input, a worker or machine process, a capacity
constraint, a visible failure mode, and a reason for the player to build it.
Fuel should not be a new number that only appears in a panel. A player should
see a tank, a transfer route, a worker, a ship-side connection, and the ship's
fuel state change.

### Pass 5: Add cruise-scale residents

- Treat residents as people who live onboard, not as long-duration visitors.
- Give them housing, dining, recreation, medical, social, and work patterns.
- Keep crew as the operating workforce with their own quarters and needs.
- Let port calls temporarily stress the resident institution through crowding,
  noise, supply use, security exposure, and sanitation.
- At larger scale, shift from assigning individuals to setting departments,
  watches, budgets, and policies. Preserve named individuals for exceptions and
  stories.

## Final Assessment

The airport comparison is most useful for passenger processing, gates,
concourse design, baggage separation, and turnaround services.

The port comparison is most useful for specialized terminals, holding and
berthing, buffers, cargo ownership, simultaneous services, fuel and waste
handling, and the idea that a ship call is a coordinated set of workstreams.

The cruise comparison is most useful for the station's long-term identity. It
explains why the game needs both a lively visitor economy and a persistent
residential institution with its own food, sanitation, recreation, medical,
engineering, and crew-support systems.

The best version of the game is therefore not "Airport in Space" and not
"Prison Architect on a ship" in isolation. It is a spatial service-operations
simulator where the player runs a living cruise-station institution that also
handles external port calls. The strongest next step is to make those layers
visible and physically connected before adding a large new economy tree.
