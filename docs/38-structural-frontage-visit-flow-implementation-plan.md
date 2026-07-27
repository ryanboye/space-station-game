# Structural Frontage, Physical Expansion, and Visit Flow

Status: implementation plan. This document connects station construction,
frontage, ship visits, crowd flow, logistics, EVA work, exposure, and charter
conditions into one physical gameplay system. It supersedes the instant-build
assumption for expansion in `35-port-infrastructure-evolution.md`, but preserves
that document's Pod Dock and modular berth contracts.

## Player Experience

The station begins as a finite pressure hull with useful interior volume and a
small amount of exterior frontage. The player can use that frontage immediately,
but cannot add unlimited docks by painting more floor. New frontage must be built
in space by extending structure, enclosing pressure hull, and installing visible
docking hardware.

Every interface creates two linked design problems:

1. **Outside:** can a ship safely approach, park, receive service, and depart?
2. **Inside:** can its occupants and cargo move through the station without
   overwhelming doors, corridors, queues, storage, staff, or boarding capacity?

The game does not reject every poor design. It distinguishes three outcomes:

- **Illegal:** unsupported hull, obstructed parked vessel, missing physical
  access, or an impossible approach. Placement is rejected with an in-world
  explanation.
- **Legal but compromised:** overlapping approach lanes, narrow circulation,
  queues across doors, public/cargo conflicts, or weak boarding throughput.
  The facility opens, then performs visibly badly.
- **Good:** ships overlap productively, people and goods move cleanly, service
  completes, and the player earns the value of their layout.

This makes layout an authored operating machine, not a room-recipe checklist.

## Core Design Contract

### Frontage Is Physical, Not A Currency

Do not add frontage points, dock licenses, arbitrary dock caps, or a one-off
"fund project" action. Usable frontage emerges from:

- the finite perimeter of the pressure hull;
- the material, credit, labor, and time cost of expansion;
- a connected structural support graph;
- docking hardware footprints on the hull;
- clear parked-vessel and approach geometry;
- interior circulation and support capacity;
- ongoing exposure, traffic wear, and repair burden.

A docking finger creates abundant frontage with long utility and circulation
routes. A compact block minimizes hull exposure but has less useful perimeter.
A berth basin handles large ships but consumes a wide exterior face and creates
a concentrated arrival throat. These are tradeoffs, not prescribed layouts.

### Concurrency Replaces Rapid Churn

Ships must remain long enough for their visit to become a station problem.
Liveliness comes from overlapping visits, not a ship completing every 10 to 30
seconds.

Initial real-time targets at 1x speed:

| Visit | Typical stay | Purpose |
|---|---:|---|
| Pod | 2-4 minutes | One to four visitors and a small service request |
| Medium passenger/freight | 6-12 minutes | A meaningful cohort and several services |
| Large vessel | 12-20 minutes | A local operating period with visible station impact |
| Repair/dry-dock call | 20-40 minutes | Long occupation exchanged for high-value work |

These are tuning starting points, not immutable constants. Traffic generation
must target useful concurrent occupancy for the available interfaces.

### Failure Must Be Seen In The World

The following are intended gameplay, not presentation-only warnings:

- visitors physically wait behind one another;
- a queue can spill across a doorway and reduce its throughput;
- cargo carriers can cross a public stream and delay both flows;
- one narrow entrance can make disembarkation visibly slow;
- insufficient gangway capacity can make boarding take too long;
- an approach conflict can leave an otherwise empty dock waiting to receive a
  ship;
- a remote service can lose customers to travel and waiting time;
- exterior expansion can accumulate more traffic wear, debris damage, and EVA
  repair work.

Diagnostics explain these outcomes after the simulation produces them. They do
not replace the physical behavior with hidden modifiers.

## Structural Expansion

### Structural Vocabulary

Use a small set of pieces with distinct jobs. Do not add decorative structural
modules that merely satisfy a checklist.

| Piece | Function |
|---|---|
| **Truss** | Existing exterior scaffold and utility support. Extends a structural line from an anchored hull or frame. |
| **Truss Junction** | Supports a branch or renews the allowable unsupported span. Required only where the topology or load demands it. |
| **Reinforced Bulkhead** | Transfers heavy interface load into the pressure hull. Used at large berth throats and other high-load faces, not every Pod Dock. |
| **Pod Dock / Small Collar** | Existing Pod Dock is the small vessel collar. Do not require a redundant collar module beside it. |
| **Gangway / Passenger Collar** | Existing Gangway is the passenger connection and contributes boarding throughput. |
| **Docking Clamp** | Existing clamp supports vessel mass and stabilizes medium and large ships. |
| **Airlock** | Existing pressure/EVA boundary and construction access. |

Only add a separate Heavy Docking Collar if testing proves that a berth needs a
distinct pressure connection beyond Gangways, and give it real access throughput
and structural load behavior.

### Structural Graph

Add a derived, cached graph whose roots are the original station frame/core and
grandfathered legacy hull. Nodes and edges come from built Truss tiles, Truss
Junctions, Reinforced Bulkheads, and supported hull boundaries.

Rules:

- A Truss can extend only a bounded straight span from a supported node.
- A branch, long run, or heavy load requires a Truss Junction or reinforced
  connection.
- New pressure hull must sit within the support reach of a connected graph.
- Pod Docks impose a small local load. Berth clamps, large vessel envelopes, and
  long cantilevers impose greater load.
- Support is validated while planning and again before commissioning.
- The structure overlay shows supported, planned, overloaded, and unsupported
  areas directly on the world.
- Recompute only when relevant tiles/modules change. Never scan the graph every
  simulation tick.

Initial balancing should favor understandable span and load classes over an
engineering stress simulator. The player needs meaningful branching and support
choices, not beam equations.

### Construction Sequence

Promote the existing blueprint, material-delivery, EVA-routing, and repair
systems into the normal expansion workflow.

1. The player paints a Truss blueprint in space.
2. Cargo staff deliver construction kits to a reachable staging point.
3. An EVA-capable construction worker exits through an Airlock and welds the
   Truss.
4. The player paints Pressure Hull over completed or planned support.
5. The game derives floor plates, perimeter walls/bulkheads, and the tie-in to
   the existing station as editable blueprints.
6. Cargo staff deliver materials; interior and EVA workers build the shell.
7. A completed shell performs a seal check.
8. Only a sealed, supported shell is commissioned, pressurized, and usable.
9. Exterior modules mounted outside or on an unpressurized shell require EVA
   construction.

Replace the current instant `buildStationExpansionOnTruss` mutation with this
phased blueprint contract. Preserve cancel, salvage/refund, move, and resale
behavior. A blocked blueprint must state one actionable cause in the world:
unsupported span, missing material, no staging route, no Airlock route, low EVA
oxygen, incomplete seal, or obstructed work position.

Existing station hulls load as grandfathered supported structure. Do not force
players to rebuild old saves.

## Docking Geometry And Approach Control

### Three Envelopes Per Interface

Each Pod Dock or Berth derives world-space geometry for:

- **Ingress envelope:** the swept area required to approach;
- **Mooring envelope:** the ship body and safety clearance while docked;
- **Egress envelope:** the swept area required to leave.

The data is based on interface class, facing, and accepted ship size. World-space
coordinates must extend beyond the simulation grid so a map-edge dock cannot
bypass clearance validation.

Introduce one shared docking-slot descriptor for legacy Docks, Pod Docks, and
Berths. It owns stable interface identity, hull connection, accepted ship class,
access tiles, envelopes, current reservation, and current occupant. A small-craft
reservation must bind to a specific slot rather than merely proving that some
compatible dock exists.

### Hard And Soft Conflicts

Reject placement when:

- the mooring envelope intersects station structure;
- two mooring envelopes overlap incompatibly;
- the interface has no physical hull connection;
- the ingress/egress path is impossible due to a fixed obstruction.

Allow placement with a strong preview warning when ingress or egress envelopes
overlap another operational interface. Derive an **Approach Conflict Group** from
those overlaps. Only one ship in a group may approach or depart at once; docked
ships may coexist when their mooring envelopes are clear.

Docking-slot and approach-group reservations are authoritative simulation state.
Holding traffic uses one structured queue contract across small docks and Berths,
even when offer selection and settlement remain traffic-type specific.

This is the desired difference between impossible and operationally poor. A row
of tightly packed docks may be legal but serialize traffic, create holding-orbit
delays, and make departures block arrivals.

### Placement And Operations Feedback

During placement, render:

- facing and approach arrows;
- vessel width and depth;
- hard obstructions in red;
- shared approach regions in amber;
- the resulting conflict group;
- directional traffic volume for that charter lane;
- expected boarding and interior access bottlenecks when enough station data
  exists.

During operation, render approach reservations and short reasons such as
`WAITING: EAST APPROACH OCCUPIED`. Approach Control begins as a quick physical
traffic-composition decision, then becomes player-authored automation as the port
scales. It must never become a manifest-reading approval chore.

## Ship Visit Lifecycle

Replace the coarse approach/docked/depart rhythm with a durable visit lifecycle:

1. **Announced**: traffic selects a compatible station interface.
2. **Holding**: waiting for an approach group, dock, or safety condition.
3. **Approach**: approach group reserved; ship moves to its mooring envelope.
4. **Secure**: clamps/collar/gangway connect and access opens.
5. **Disembark**: occupants physically enter through interface capacity.
6. **Visit / Service**: people follow purpose-driven phases while ship work runs
   concurrently.
7. **Recall**: optional activities stop and occupants route back.
8. **Boarding**: occupants pass through gangway/collar capacity.
9. **Depart**: egress group reserved and ship clears the station.
10. **Settled**: revenue, satisfaction, failures, wear, and rating are recorded.

Every visit stores earliest departure, planned departure, boarding start, hard
departure, and an allowed extension window.

Behavior varies by traffic type:

- Flexible traders and tourists may leave early after sustained service failure,
  or stay longer while satisfaction, available budget, and useful services remain.
- Scheduled liners have firm windows and punish poor boarding throughput.
- Freight vessels wait for promised work until their deadline, then leave partial
  cargo or abort.
- Repair vessels occupy frontage for a long time and depart when work completes
  or patience expires.

A cohort has a visible purpose, budget, patience, and desired service mix. The
world-space ship chip communicates those broad facts without forcing the player
to inspect every manifest.

## Occupant Loop Integration

`SPEC-OCCUPANT-LOOP.md` supplies the behavioral engine inside the longer ship
visits described above. Its strongest proposal is that people stop being
single-pass service tokens: needs recur, wants emerge, and every activity claims
physical space for long enough to interfere with somebody else.

### Shared Behavior, Distinct Tenure

Unify visitor and resident **need behavior**, but do not erase the gameplay
meaning of why somebody is on the station. Use one shared occupant-demand
component attached to the existing actor types:

| Tenure | Typical behavior | Departure contract |
|---|---|---|
| **Errand** | One primary want; courier, pickup, or refuel stop | Leaves with its pod soon after the errand |
| **Shore leave** | Several wants plus hunger; tourist or liner passenger | Returns for a scheduled departure |
| **Contract crew** | Repeating food, rest, hygiene, and leisure while freight or repair work continues | Leaves when ship work and recall complete |
| **Extended guest** | Repeating needs over a long repair, layover, or disrupted journey | Has a bounded but uncertain departure |
| **Resident** | Permanent needs, home, routine, work, and civic/economic relationship | No origin-ship departure |

This distinction matters to capacity planning, failure, housing, settlement, and
frontage. A stranded repair crew is not simply a resident with a shorter timer,
and a permanent resident must not keep an origin ship occupying a dock forever.

Internally, share need decay/regeneration, target selection, physical slot
claims, patience, and visible expression. Do not require a risky conversion to
one actor array before this behavior proves fun.

### Needs, Wants, And Physical Slots

- **Needs** recur: food, sleep, hygiene, and appropriate leisure or social
  recovery. Their rate and urgency depend on tenure and visit conditions.
- **Wants** are one-shot or occasional preferences: a drink, souvenir, particular
  meal, view, entertainment, or shopping category.
- Short visits are dominated by wants. Contract and extended stays create
  repeating needs. Residents create permanent baseline demand.
- Every fulfilled need or want must reserve a real fixture, seat, provider slot,
  queue position, bed, or activity position for a duration.
- A multi-seat table exposes its depicted seats. A lounge module may expose
  several distinct use positions. Capacity comes from readable artwork and
  module function, not an invisible room total.

The first slot-depth pass should include:

- Market checkout with limited cashier throughput;
- browsable stocked shelves or aisles with bounded simultaneous use;
- real market queue positions and stock collection;
- bed claims and sleep duration;
- the existing cafeteria providers and seats as the reference implementation;
- hygiene, bar, lounge, and reception slots through the same reservation
  contract.

This is how a larger shop or better layout earns value. The player chooses shelf
mix, checkout count, queue space, stock route, and public entrance rather than
placing one magic Market Stall.

### Facility Scale And Chunky Modules

The current one- and two-tile fixtures are too small to carry the new occupant
load or make a large station read at the intended scale. Add larger functional
fixtures whose capacity is visible in their artwork and whose footprint creates a
real layout commitment.

Larger is a meaningful upgrade, but also a spatial and operational burden:

- more simultaneous users and higher absolute throughput;
- better staffing efficiency where the fiction supports it;
- more stock, power, water, cleaning, and maintenance demand;
- a wider customer-facing edge and larger queue footprint;
- a required staff work face, public use face, and delivery/service route;
- less flexibility in cramped or irregular rooms.

Do not make every large fixture a sealed magic box. A facility is assembled from
a small number of chunky pieces with different spatial functions.

Initial module families and starting footprints:

| Facility | Module | Footprint | Physical function |
|---|---|---:|---|
| Market | **Checkout Bank** | 2x5 | Two staffed registers, two active checkout slots, customer frontage, and a staff-side stock route |
| Market | **Shelf Aisle** | 1x4 | Three browsing positions and visible stocked inventory; tileable into rows |
| Market | **Display / Cold Case** | 1x3 | Two browsing positions for a distinct goods category and local storage |
| Market | **Backroom Stock Bank** | 2x3 | Batched inventory, restock source, and cargo destination |
| Cantina | **Service Bar** | 2x5 | Bartender work lane, four guest service positions, drink stock, and glass return |
| Cantina | **Bar Corner / End** | 2x2 | Allows L- and U-shaped bars without pretending every segment is a separate full provider |
| Cantina | **Booth Bank** | 2x4 | Two booths and four to six explicit seats held for meaningful drink/leisure duration |
| Cantina | **Standing Rail** | 1x4 | Four short-duration drink/social positions with high density but lower comfort |
| Cafeteria | **Serving Line** | 2x5 | Multiple pickup positions, tray storage, and a staff work lane; higher throughput than isolated counters |
| Cafeteria | **Community Table** | 3x4 | Eight depicted seats with shared occupancy and cleaning burden |
| Lodging | **Bunk Bank** | 2x4 | Four temporary sleeping slots with low privacy and efficient capacity |
| Lodging | **Guest Cabin** | 3x4 | Two higher-quality beds, storage, and optional private hygiene adjacency |
| Reception | **Arrival Desk** | 2x4 | Two processing positions, customer frontage, and a staff-side work lane |
| Hygiene | **Wash Bank** | 2x5 | Several depicted sinks or showers with shared plumbing and cleaning load |

These are initial playtest dimensions, not immutable content. Validate each at
the game's real tile and sprite scale before locking it. The important contract
is that depicted counters, seats, bunks, shelves, and staff positions correspond
to actual reservations and throughput.

Keep compact alternatives where they support a different layout rather than
acting as mandatory starter versions. A small kiosk fits a docking finger but has
low capacity and poor staffing efficiency. A Checkout Bank is genuinely better
for volume, but consumes valuable interior depth and creates a much larger queue
and delivery problem.

Bars should support authored shapes. Use a native 2x5 Service Bar for the main
provider plus connecting corner/end pieces whose sprite edges join into an L or
U. The simulation treats the connected run as one provider group with capacity
derived from active service positions, not as five independent mini-bars.

### Hidden But Inferable Demand

Do not precompute and display a complete itinerary when an occupant spawns. The
ship and visit purpose reveal a useful range: likely cohort size, probable stay
class, and broad demand. Individual preferences emerge through behavior.

Reception or Customs is an optional information accelerator:

- Without it, occupants still enter and choose a plausible destination from
  signage, ship purpose, and their strongest current demand.
- With it, a limited provider slot reveals part of the occupant's demand and
  directs them more accurately.
- Saturated reception does not stop entry. Some occupants bypass it, and their
  first choice may be suboptimal.
- A wrong choice is bounded and visible: walk to a plausible room, recognize the
  mismatch, express the need, and redirect. Do not make actors wander randomly.
- Reception reveals only enough to improve planning. It never turns the game
  back into a complete manifest spreadsheet.

Aggregate future load is the one forecast that cannot be read directly from the
world. For accepted long commitments, show a compact forward silhouette of
promised berth time, beds, meals, hygiene demand, and staff work. This belongs
with Approach Control, not as another permanent HUD panel.

### Admission And Automation

Preserve the offer list as an early portfolio decision. With two or three
interfaces, the player should be able to make the exact judgment:

> Quick courier, accept. Another short stop, accept. Multi-day repair with eight
> crew and one remaining Berth, maybe not.

The interaction must be one-glance and spatially connected to Approach Control,
not a manifest-reading exercise. Each incoming silhouette communicates:

- ship and visit class;
- likely party-size range;
- likely stay range;
- broad demand or ship-service cue;
- compatible interface and approach side;
- expected revenue range;
- the capacity it would commit if accepted.

Hovering or focusing the offer projects its consequences onto the station: the
candidate docking slot and approach envelope, estimated frontage interval,
committed beds and service load, and any obvious collision with accepted work.
The actions are `Accept`, `Hold`, and `Pass`; accepting creates a binding slot or
Berth reservation. Approach Control never pauses the simulation automatically.

Scale changes the interaction rather than deleting it:

- **Small port:** offers are manual by default because each one materially changes
  the station's next several minutes.
- **Growing port:** the player enables rules for routine traffic, such as accept
  couriers when a Pod Dock is free and meal load is below a chosen reserve.
- **Large port:** supervisors and approach policies handle ordinary flows. The
  player sees aggregated lane pressure and intervenes in exceptions, uncertain
  visits, negotiated contracts, military calls, or large commitments.

Automation is authored by the player and can be overridden. It should initially
automate ship classes and capacity conditions, not require a RimWorld-style
priority spreadsheet.

Refusal costs the foregone opportunity and may influence relationships for
negotiated commitments. Passing on an ordinary pod should not create a repetitive
reputation penalty.

### Failure, Rating, And Growth

Immediate consequences must remain physical:

- hungry people queue, balk, seek an alternative, or leave;
- exhausted contract crews loiter or sleep badly when no bed is available;
- unmet long-stay needs accumulate into anger, incidents, work delay, and more
  congestion;
- an early departure releases frontage but forfeits spend and service revenue;
- late boarding extends occupancy, misses a departure window, or abandons
  occupants under explicit rules.

Station rating still matters as the cumulative record that attracts better
traffic. It is the downstream summary, not the primary punishment. A player
should be able to point at the people and failed operation that changed it.

Successful visits may create applicants for permanent residency, but conversion
requires available housing and a player immigration/housing policy. It must not
silently convert success into unavoidable permanent load. Once accepted, the new
resident raises recurring demand and contributes work, rent, taxes, spending, or
business activity. Their origin ship departs normally.

### Failed Stay Resolution

Adopt the occupant spec's central rule for long stays: failure remains in the
station and compounds before it becomes a settlement number. Do not interpret
that as every unhappy visitor remaining forever until every need reaches zero.
Failure trajectories depend on tenure and must always have a physical resolution.

| Occupant | Failed-stay behavior |
|---|---|
| **Errand visitor** | Balks, abandons the purchase, returns to the pod, and leaves early. The failure is brief but loses revenue. |
| **Shore-leave passenger** | Seeks an alternative, complains, then obeys recall. Severe congestion can make them miss boarding and become stranded. |
| **Contract ship crew** | Remains while its ship work is incomplete. Unmet recurring needs reduce cooperation and work progress, create loitering and mess, and may escalate into incidents. |
| **Extended or stranded guest** | Requires temporary food, hygiene, and lodging until the station arranges service, repairs the ship, or provides onward transport. |
| **Resident** | Accumulates persistent stress and may withdraw from work, protest, commit crime, become ill, or eventually choose to leave. |

Use a readable escalation ladder:

1. **Unmet:** expresses the need, queues, and searches for a valid alternative.
2. **Balking:** gives up on the current provider, redirects, or begins loitering.
3. **Distressed:** loses patience, rests poorly, makes mess, spends less, or slows
   associated ship work.
4. **Disruptive:** sustained failure can cause arguments, theft, vandalism,
   medical need, refusal to work, or a formal complaint.
5. **Resolution:** the occupant is served, compensated, recalled, repatriated,
   removed under station policy, or accepted as a resident through an explicit
   decision.

Escalation must be gradual, spatially attributable, and recoverable. One missed
meal does not start a fight. A multi-day repair crew with no beds, food, or clear
completion date can become a serious operating problem.

Failure should feed back into the original commitment:

- distressed repair crews work less effectively, extending Berth occupation;
- an extended Berth occupation blocks other accepted ships;
- the larger stranded population consumes more meals, beds, hygiene, security,
  and medical capacity;
- those shortages then affect crew, residents, and other visitors;
- resolving the original repair or lodging shortage releases the accumulated
  pressure.

This is a controlled death spiral with player levers, not an unrecoverable trap.
Provide costly emergency responses:

- buy emergency meals or temporary bunk capacity;
- prioritize or expedite the blocking repair;
- compensate a cohort to reduce escalation;
- charter an evacuation or onward-transfer pod;
- cancel a failed contract and pay its penalty;
- close admission policies while the station recovers;
- use security only for genuinely disruptive occupants, with reputational and
  humanitarian consequences.

Missed boarding creates a real `stranded` tenure rather than deleting the actor.
The origin ship follows its own hard-departure contract. The stranded occupant
must be assigned temporary accommodation and a future departure opportunity.
After a generous maximum disruption window, the simulation offers an automatic
but expensive relief transfer so an old save cannot become permanently clogged.

Rating and faction reputation update when the episode resolves or reaches a
meaningful milestone. They summarize what happened; they do not replace the
visible queue, exhausted people, delayed repair, incident, compensation, or
repatriation that caused the outcome.

### Uncap Carefully

The occupant spec correctly identifies ceilings that suppress visible failure,
including queue spill, congestion cost, route discomfort, and walk penalties.
Audit and instrument all of them in Phase 0, but do not blindly remove safety caps
before the physical movement coordinator exists.

- Queue theater may be allowed to render farther in a controlled experiment.
- Patience, give-up, and rating effects may be widened once their causes are
  visible.
- Occupancy cost must grow meaningfully only alongside fairness, replanning, and
  deadlock recovery.
- A queue becomes genuinely uncapped only when its positions reserve real tiles
  and interact with doors and other traffic.

The experiment is always comparative: deliberately overwhelm one market or
terminal, observe the failure, then add capacity or redesign the route and prove
that the station improves.

## Physical Movement, Queues, And Cargo

### Movement Intent Coordinator

Do not restore the previous naive hard occupancy cap; it caused permanent
deadlocks. Add a two-phase movement coordinator:

1. Actors submit their next-tile movement intent.
2. The coordinator resolves intents using tile capacity, an occupant's intent to
   leave, role/urgency, and accumulated wait age.
3. Winners move; losers visibly remain in place.
4. Controlled head-on swaps may resolve when safe; otherwise one actor yields.
5. After a short wait, an actor replans using the congestion field.
6. After a longer wait, a bounded deadlock breaker yields, backs up, or releases
   stale reservations.

Use deterministic tie-breaking and fairness so simulation replays remain stable.
Add path hysteresis so actors do not oscillate between equally bad routes.

### Spatial Capacity

Tile capacity is contextual:

- Airlocks and ordinary doors expose one crossing slot and a crossing time.
- Narrow corridors have low directional flow capacity.
- Open concourses and room floors allow greater local occupancy.
- Cargo carts and bulky carried loads consume more movement capacity and move
  more slowly than a person.
- Service fixtures, seats, work positions, and queue positions retain exclusive
  reservations.

### Real Queues

Queue positions must reserve actual floor tiles. A queue grows backward from its
provider, follows reachable floor, and can spill into circulation. If it covers a
door, actors using that door contend with the queue and throughput falls. A queue
must never be a visual chain disconnected from movement occupancy.

The player sees the fix in the world: add another provider, create a larger
waiting area, move the door, add a second entrance, or separate the service from
the main arrival throat.

### Physical Cargo

Material, food, retail stock, luggage, and freight should use visible carried
items or carts backed by real transport jobs. The carrier occupies route capacity
and places the item at its source, staging point, or destination.

Cargo and public traffic may share a route, but both slow down and display the
conflict. A separate service corridor, nearby storage, another receiving point,
or a better schedule is the player's remedy. Do not implement the conflict as an
invisible percentage penalty.

## Interior Support Depth

Do not add a single arbitrary support score that gates a dock. Derive an
operational profile for each interface from actual routes and capacities:

- ingress and disembark throughput;
- door and Airlock choke points;
- queue spill across the arrival/boarding route;
- average and worst boarding distance;
- seating and service capacity reachable within visitor patience;
- public/cargo route intersections and contention;
- freight staging and storage distance;
- staff access to ship-service hardware;
- utility availability and maintenance access;
- gangway/collar boarding capacity;
- approach-group wait and dock overstay.

Basic physical access keeps a facility eligible. Weak support manifests as slow
disembarkation, blocked doors, abandoned services, late boarding, dock overstay,
lost revenue, and lower satisfaction.

The inspector and world view show only the most useful diagnosis at a time:

- `Single-door arrival throat: 5 people/min`
- `Meal queue blocks Dock 2 exit`
- `Cargo route crosses the public concourse`
- `Boarding capacity 6/min for 28 passengers`
- `East approach shared by 4 interfaces`

Selecting a diagnosis highlights the actors, route, queue, door, or approach
region that produced it.

## Exposure, Damage, Heat, And Charter Conditions

Reuse the current seeded debris map, directional lane traffic, thermal drift,
maintenance debt, EVA routing, repair jobs, and impact rendering.

Current debris impacts primarily create maintenance pressure and visuals. Add an
explicit, additive exterior integrity model rather than pretending the current
effect already models physical breaches:

1. **Worn**: reduced reliability and visible abrasion.
2. **Damaged**: increased repair work and local performance loss.
3. **Breached**: only after a clear threshold or major incident; affects pressure
   and access until repaired.
4. **Repaired**: restored through an actual EVA job and supplies.

Topology changes for a breach must use the authoritative tile mutators and cache
invalidation paths. Meteor/debris damage must not quietly reuse fire deletion
semantics.

Charter choices should materially change good station geometry:

- High traffic on a direction makes that frontage valuable and raises approach
  pressure.
- Dense debris raises exposure and repair load on the affected face.
- Strong sunlight increases generation potential and thermal load.
- Poor thermal sink makes high-load wings and machinery harder to cool.
- Trade composition changes which interface and interior support mix is valuable.

Escalation should be staged:

- Opening: construction cost, route length, and approach contention.
- Early-midgame: visible traffic wear and routine EVA maintenance.
- Mid-late game: damaged modules/hull, meteor events, thermal failures, and
  mitigations such as shielding, redundancy, cooling, or safer expansion faces.

Do not roll a catastrophic failure merely because the player owns exterior hull.
Risk must be forecastable, spatially attributable, and mitigable.

## Starter And Progression Contract

Revise the starter into a finite, unfinished shell containing:

- basic life safety and crew support;
- Receiving and a usable construction staging route;
- one Airlock with EVA access;
- two Pod Docks on useful but limited frontage;
- space to author one opening business;
- a short prebuilt truss/hardpoint that teaches one safe expansion;
- one legible side suitable for saving toward a first Berth.

The opening decisions are:

- improve the chosen food, retail, or pod-service operation;
- install another small ship service or Pod Dock;
- build a docking finger or interior wing;
- save frontage and capital for the first Berth.

The global goal remains the north star. Capital Projects may subsidize a chosen
expansion or service outcome, but do not exclusively unlock construction pieces.
Credits, materials, staff time, structure, and physical conditions determine what
the player can build.

## Implementation Architecture

Keep the main simulation orchestrator thin. Add or extend focused modules:

| Area | Ownership |
|---|---|
| Structural graph, support and load validation | new `src/sim/structure.ts` |
| Phased hull and EVA construction | extend `src/sim/construction.ts` |
| Approach/mooring geometry and conflict groups | new `src/sim/approach-envelopes.ts` |
| Ship visit phases and timing | extend port operations with `src/sim/ship-visits.ts` if needed |
| Shared recurring needs, wants, tenure and reveal | new `src/sim/occupant-demand.ts` using existing visitor/resident state |
| Movement intents, tile capacity, congestion and deadlock recovery | new `src/sim/traffic-flow.ts` |
| Per-interface operational profile | new `src/sim/interface-operations.ts` |
| Types, balance and save migration | `src/sim/types.ts`, `balance.ts`, `save.ts` |
| Starter and charter effects | `src/sim/initial-state.ts`, charter/site modules |
| World overlays, construction, actors and approach animation | `src/render/render.ts` and sprite assets |
| Contextual diagnoses and inspectors | `src/main.ts`, without adding permanent HUD panels |

Topology must continue to mutate through the authoritative tile, room, and module
paths so pressure, pathing, rooms, utilities, and render caches remain valid.

Derived state should generally not be serialized. Persist durable construction
sites, structure pieces, visit phase/times, integrity, and damage. Rebuild support
graphs, approach conflict groups, movement intents, congestion fields, and
operational diagnoses after load.

## Ordered Delivery Plan

### Phase 0: Baselines And Instrumentation

Build deterministic scenarios before changing rules:

- compact starter with two Pod Docks;
- docking finger with four Pod Docks;
- medium Berth with two Gangways;
- bad single-door terminal;
- public/cargo crossing;
- debris-facing exterior wing;
- large scale station with at least 50 crew, 50 simultaneous visitors, and 5-10
  active interfaces.
- overwhelmed one-checkout market versus a redesigned two-checkout market;
- short errands mixed with shore leave and a long repair crew;
- reception bypass versus reception-assisted routing.

Record visit duration, concurrent ships, approach wait, disembark time, queue
length, door wait, cargo/public conflicts, boarding time, missed departures,
need recurrence, fixture utilization, balks, reception reveal time, committed
future load, maintenance work, EVA time, simulation step time, and render frame
time. Record the existing queue, occupancy, discomfort, walk, and rating caps
before changing them.

**Gate:** the scenarios can be run deterministically and produce a concise
before/after report without requiring the full test suite.

### Phase 1A: Longer Visits And Shared Occupant Demand

- Add the durable lifecycle and visit timing fields.
- Add shared tenure, recurring-needs, wants, and departure contracts while
  preserving visitor, contract crew, resident, and crew identities.
- Derive tenure and broad demand from ship purpose with bounded, seeded variety.
- Tune traffic for concurrent occupancy rather than rapid replacement.
- Add early departure, recall, boarding, hard departure, and bounded extension.
- Keep existing settlement exactly-once guarantees.
- Expose the current phase and broad purpose beside the ship.

**Gate:** a pod visit is long enough to observe; multiple visits overlap; fixed
and flexible schedules behave differently; a repair crew eats, sleeps, uses
hygiene, and recreates repeatedly; save/load resumes the correct phase; no ship
or berth remains permanently occupied.

### Phase 1B: Physical Slots And Demand Discovery

- Port the cafeteria's provider, queue, and reservation contract to Market
  checkout, shelves/aisles, beds, reception, and the remaining need fixtures.
- Add the first large fixture set: Checkout Bank, Shelf Aisle, Service Bar,
  Booth Bank, Bunk Bank, and Arrival Desk, with capacity tied to depicted slots.
- Add connected bar-run rendering and provider grouping for straight, corner,
  and end pieces.
- Stop exposing a complete pre-rolled itinerary.
- Add inferable ship/cohort cues, partial behavioral reveal, and optional
  reception-assisted reveal.
- Add bounded wrong-choice and redirection behavior for unprocessed occupants.
- Add the contextual forward-load silhouette for commitment traffic.
- Add one-glance manual Approach Control for the small-port opening, binding
  accepted traffic to a compatible slot and projected capacity.
- Add simple player-authored auto-admission rules for routine traffic as the port
  grows; keep large, uncertain, or negotiated commitments visible.

**Gate:** one checkout can be visibly overwhelmed; a second checkout or better
queue layout improves throughput; beds cannot be double-claimed; long-stay
occupants create recurring demand; reception improves routing without becoming a
mandatory gate; two runs differ without becoming unreadable randomness. Gate the
deeper hidden-demand work on whether the slots-and-stays experiment is fun. A
large market and cantina must visibly accommodate more simultaneous occupants,
while their footprint, staff face, queue frontage, stock route, and utility load
create new layout constraints.

### Phase 2: Structural Graph And Planning Overlay

- Add Truss Junction and Reinforced Bulkhead only with the functions above.
- Derive rooted support and bounded spans/loads.
- Validate planned hull and interface load.
- Render structure support and actionable blocked reasons.
- Grandfather legacy hull as supported.

**Gate:** unsupported hull is rejected; a Junction enables a branch; heavy berth
hardware demands a reinforced connection where appropriate; graph recomputation
occurs only after structural mutation.

### Phase 3: Physical Expansion And EVA Construction

- Remove instant shell conversion from the normal expansion flow.
- Convert Truss, hull, walls, floor, tie-in, seal, and commissioning to staged
  blueprints.
- Route material delivery through Receiving/staging.
- Require EVA construction for exterior work.
- Preserve cancel, refund/salvage, module move, and resale behavior.

**Gate:** a player can plan and complete a pressurized wing; no Airlock or no
materials visibly blocks work; the wing does not pressurize before sealing;
save/load preserves in-flight construction; exterior module work uses EVA.

### Phase 4: Approach Envelopes And Frontage Operations

- Replace the current short line check with world-space ingress, mooring, and
  egress geometry.
- Introduce shared docking-slot descriptors and binding slot reservations for
  legacy Docks, Pod Docks, and Berths.
- Add hard obstruction validation and soft overlap conflict groups.
- Unify small-craft and Berth holding behind a structured queue/reservation
  contract while preserving their different offer and settlement models.
- Reserve groups during approach/departure.
- Integrate facing-specific charter traffic.
- Render placement and live operations feedback.

**Gate:** map boundaries cannot bypass clearance; overlapping approaches
serialize; independent approaches operate concurrently; parked ships never
overlap structure or one another; two ships cannot own the same slot or approach
group; the reason for holding is visible.

### Phase 5: Movement Intent, Doors, And Real Queues

- Add batched two-phase movement resolution.
- Add contextual tile and door throughput.
- Back queue positions with real tile reservations.
- Add fairness, congestion replanning, hysteresis, and deadlock recovery.
- Keep visual interpolation independent of simulation speed.

**Gate:** a narrow terminal visibly congests without permanently freezing;
queues can cover doors; a wider hall or second entrance measurably improves
throughput; actors recover from head-on and cyclic conflicts.

### Phase 6: Physical Cargo, Boarding, And Support Diagnosis

- Give carried goods visible world objects backed by transport jobs.
- Make bulky cargo contend with public movement.
- Make Gangways/collars own boarding and disembark throughput.
- Derive the per-interface operational profile and top diagnoses.
- Highlight the physical source when a diagnosis is selected.

**Gate:** a public/cargo crossing delays both streams; a service corridor fixes
it; additional Gangways improve boarding; queue spill causes late boarding;
diagnoses match measured actor behavior rather than hidden modifiers.

### Phase 7: Exposure, Integrity, And Charter Differentiation

- Dial directional debris, traffic wear, sunlight, and thermal conditions into
  exterior decisions.
- Add worn/damaged/breached/repaired integrity states.
- Connect damage to maintenance, EVA repair, utilities, and pressure only through
  explicit thresholds.
- Add visible forecasting and mitigation feedback.

**Gate:** a debris-facing wing wears faster; an EVA worker can repair it; a true
breach affects pressure and restores correctly; a different charter makes a
different expansion face or mitigation plan attractive.

### Phase 8: Starter, Economy, Art, And Onboarding

- Ship the unfinished starter contract.
- Rebalance structure, hull, hardware, material, labor, and maintenance costs.
- Integrate grants with player-selected projects without hiding capabilities.
- Add readable low-resolution art for new structural pieces and construction
  states.
- Add welding, scaffolding, clamp, gangway, cargo, queue, and repair animation.

**Gate:** the opening asks the player to author a business and a first expansion;
the first Berth feels like a major physical achievement; no permanent panel or
checklist substitutes for watching the station work.

### Phase 9: Scale, Migration, And Full Playthrough

- Migrate legacy hull, docks, berths, construction sites, and maintenance debt.
- Rebuild transient derived state safely after load.
- Profile and batch the new systems.
- Play from the starter through the first Berth and a 5-10 interface station.
- Then validate at two to three times the current station footprint.

**Gate:** old saves remain playable; no stale reservations survive load; the
target station maintains smooth rendering and bounded simulation cost; the full
playthrough produces meaningful layout failures and multiple viable remedies.

## Performance Contract

- Structural support and approach groups are topology-versioned caches.
- Interface diagnoses recalculate after topology, service, or sustained traffic
  changes, not every frame.
- Movement intents resolve in one batched simulation pass.
- Congestion fields update at a fixed cadence; actors do not run full A* every
  render frame.
- Exposure maintenance iterates a maintained target list rather than the entire
  map.
- Render animation and interpolation remain independent of simulation speed.
- Scale profiling is part of every phase gate, not a cleanup task at the end.

Initial performance target: at the desired baseline of 50 crew, 50 or more
visitors, and 5-10 active interfaces, simulation work should fit comfortably
inside the fixed-step budget while the renderer remains visually smooth. Final
numeric budgets should be set from Phase 0 measurements on target hardware.

## Save And Compatibility Contract

- Grandfather old station hull as supported from the core/frame.
- Derive new approach envelopes for legacy Docks and existing berth geometry.
- Keep a compatibility adapter for existing rectangular berths until the player
  edits or replaces them.
- Add optional defaults and a save version for visit phases and integrity.
- Persist occupant tenure, recurring needs, revealed demand, wants, departure
  contract, and accepted long-stay commitments. Give legacy actors safe defaults.
- Persist construction and damage; rebuild structural graphs, conflict groups,
  congestion, movement intents, and diagnoses. Persist durable ship visit and
  slot/queue ownership needed to resume an active approach; do not persist
  actor-level path intents.
- Preserve exactly-once settlement and maintenance target identity through map
  expansion and module movement.

## Focused Verification Catalogue

Do not rely only on the full test suite. Add focused runners for:

- structural rooting, spans, branches, loads, and legacy migration;
- phased construction, material delivery, cancellation, sealing, EVA oxygen,
  exterior modules, and save/load;
- world-space approach geometry, boundary placement, conflict groups, and
  reservations;
- visit phase timing, early exits, extensions, recalls, boarding, departures,
  and settlement;
- tenure derivation, recurring needs, physical slot exclusivity, bounded demand
  reveal, reception bypass, commitment admission, failed-stay escalation,
  stranded recovery, emergency resolution, and resident acceptance;
- door contention, queue spill, head-on traffic, fairness, stale reservation
  cleanup, and deadlock recovery;
- public/cargo crossing and separated logistics routes;
- gangway throughput and support diagnosis accuracy;
- debris damage, integrity thresholds, pressure loss, EVA repair, and thermal
  exposure;
- target-scale simulation and rendering performance.

The critical comparative test is not merely whether a layout works. Build a bad
layout and an improved layout, then prove that the physical change causes the
expected operational improvement.

## Art Requirements

Generate new assets only after module footprints and states are final. Assets
must be authored for their actual low-resolution footprint, with transparent
backgrounds and strong silhouettes.

Required new or revised visual states:

- Truss Junction: planned, delivered, welding, complete, overloaded;
- Reinforced Bulkhead: planned, welding, complete, damaged;
- hull scaffold, floor plate, wall/bulkhead, seal check, pressurizing;
- approach envelope arrows and reservation pulse;
- carried crate, food case, retail carton, luggage, and cargo cart;
- Gangway and clamp extending, connected, boarding, retracting;
- hull wear, impact, damage, breach, repair patch, and welding;
- door contention, queue spill, and late-boarding world indicators.
- occupant need/want bubbles, partial-reveal state, bed occupancy, checkout use,
  shelf browsing, reception processing, balking, redirection, and loitering.
- native-footprint low-resolution sprites for Checkout Bank, Shelf Aisle, Display
  Case, Stock Bank, Service Bar, bar corners/ends, Booth Bank, Standing Rail,
  Serving Line, Community Table, Bunk Bank, Guest Cabin, Arrival Desk, and Wash
  Bank;
- occupied, idle, unstaffed, low-stock, dirty, damaged, and in-service states for
  every applicable large fixture.

## Explicit Non-Goals

- No frontage resource counter.
- No arbitrary dock count cap.
- No berth-only funding minigame.
- No permanent requirement to approve every routine ship manually at scale.
- No manifest-reading core loop.
- No decorative structural checklist.
- No naive one-actor-per-tile rule.
- No invisible congestion percentage standing in for actor movement.
- No catastrophic random damage without warning and mitigation.
- No second utility, construction, maintenance, or EVA model beside the existing
  systems.

## Recommended Workstream Boundaries

The phases are intentionally dependent and should not all be implemented in
parallel. Parallelize only disjoint work inside an active phase:

- Lead owns player experience, rule decisions, tuning, architecture, integration,
  and playtest judgment.
- A construction worker can own structure plus blueprint implementation.
- A port-operations worker can own visit lifecycle and approach geometry after
  their contracts are fixed.
- A movement worker can own intent resolution and queue occupancy after the
  capacity rules are fixed.
- A render/art worker can follow stable state contracts without editing the
  simulation files.
- A QA worker can maintain deterministic bad-layout versus improved-layout
  scenarios and focused runners.

Every handoff must preserve existing save behavior, exactly-once settlement,
utility topology invalidation, physical fixture reservations, and render/sim
separation. The lead reviews each phase in the live game before the next dependent
phase begins.
