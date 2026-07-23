# Physical Facilities, Operational Pressure, And Depth Catalogue

Status: design audit and implementation catalogue
Date: 2026-07-22

## Purpose

This document extends the operational-pressure recommendation in Docs 19, 27,
31, and 32. It compares the current station to the repeated design patterns in
Prison Architect, then translates those patterns into a station-specific depth
catalogue.

The goal is not to clone a prison simulation or to add a large prop list. The
goal is to make the station's rooms, people, utilities, schedules, logistics,
and failures participate in one coherent game. A module should be something a
person physically uses, a worker operates, a utility supplies, logistics feeds,
and wear can impair. Building it should create a new capability and a new
obligation.

This catalogue keeps the earlier escalation thesis:

> A competent station can reach a healthy operating plateau, but growth,
> traffic, wear, crew needs, and local disorder keep that plateau from becoming
> a permanent solved state.

It adds the missing foundation beneath that thesis: facilities need enough
physical and operational depth for pressure to have somewhere meaningful to
land.

## Executive Assessment

The comparison supports the user's criticism. The station has more simulated
signals than its simple surface suggests, but Prison Architect repeatedly gets
more play from fewer concepts because its systems intersect.

Prison Architect uses seven recurring patterns:

1. **Rooms are recipes, not labels.** A kitchen needs cookers, fridges, and
   sinks. An office needs a desk, chair, and filing cabinet. A canteen needs a
   serving table, tables, and benches.
2. **Objects have physical users.** A seat, toilet, shower, desk, cooker, CCTV
   monitor, or program desk has finite positions. People travel to it, reserve
   it, remain there for a legible duration, and release it.
3. **Objects belong to dependency chains.** Kitchens consume delivered food,
   electricity, water, cook labor, storage, and time; they produce meals and
   dirty trays. Security cameras need power, wiring, a monitor, and a guard.
4. **Schedules create waves.** Eat, work, shower, yard, sleep, and free-time
   periods move demand through the building. The player sizes rooms for peaks,
   staggers groups, and places facilities to reduce travel time.
5. **Quality is additive but functional.** Optional fixtures improve a room,
   satisfy additional needs, or support programs. Quality is not merely a
   decorative score.
6. **Needs alter behavior.** Severe unmet needs reduce performance and can lead
   to misconduct, damage, or riots. Staff needs reduce speed and morale.
7. **Capital creates obligations.** Expansion costs money, but so do staffing,
   food, utilities, maintenance, programs, and failures. Grants and research
   point the player toward new systems without replacing the operating loop.

The station currently implements fragments of all seven, but many stop at a
binary check:

- A Kitchen is active with one Stove. It does not require food storage, a prep
  surface, washing, direct power, water, ventilation, or meaningful cook posts.
- Hygiene requires a Toilet and Sink, but water is a global stock, wastewater
  has no network, fixtures do not leak, and flooding cannot damage a nearby
  system.
- Bridge and Security rooms require a single terminal, while officer workplaces
  and policy ownership remain mostly abstract.
- Lounge, Rec Hall, and Cantina modules have shallow or inconsistent occupancy;
  the player does not yet size them around visible use duration and peak demand.
- Alpha, Beta, and Gamma watches determine eligibility, but they do not yet
  create a legible station routine. There are no authored service hours, meal
  breaks, maintenance windows, or visible handover waves.
- Maintenance debt, sanitation, thermal stress, oxygen, crime, and rating exist,
  but most consequences are gradual modifiers. They rarely damage capital,
  close a room, or create a local recovery problem.

The next design phase should therefore be **physical facilities plus operating
rhythm**, followed by **wear, failures, and capital growth**. Adding crises
before facilities have physical dependencies would make the game arbitrary.

## Current Implementation Baseline

The roadmap should extend the substantial foundations already in code rather
than replacing them wholesale.

### Existing foundations worth keeping

- ItemNodes physically hold `rawMeal`, `meal`, `rawMaterial`, `tradeGood`,
  `fuel`, and `body` inventories. Sources/destinations use capacity
  reservations, jobs batch quantities, and haulers carry stock.
- Hydroponics produces raw meals, food workers haul them to Stoves, Stoves
  convert them, and workers move prepared meals to Serving Stations. This is a
  real local chain even though its commodity model is shallow.
- Inbound freight has persistent cargo lots, ownership, staging, capacity
  reservation, physical unloading, storage hauling, and settlement.
- Fuel already uses specialized Fuel Tanks, Cargo Handlers, and Fuel Pumps; it
  is the best precedent for future station supplies.
- Logistics paths penalize movement through social, residential, and medical
  rooms, so back-of-house layout already has a mechanical base.
- Air Duct uses a real utility component graph with sources, segments, sinks,
  powered components, and diagnostics.
- Maintenance debt accumulates for plant, hull, docks, berths, and selected
  modules. Repair jobs can consume materials; exterior repair already uses
  airlocks, suits, oxygen, and EVA routing.
- The blueprint construction kernel tracks delivered materials, progress,
  blocked reasons, and EVA requirements. Hauling and build work are separate
  jobs.
- Fire already grows, spreads, blocks movement, consumes local oxygen, adds
  heat/dirt, destroys modules, and generates response work.
- Station Rating has a persistent breakdown. Local reputation derives prestige,
  notoriety, control, value, opacity, and crime pressure.
- Reputation already affects Market spending, housing appeal, ship-family
  weighting, docking fees, and per-berth settlement yield.
- Residents have needs, routines, taxes, satisfaction, departure pressure, and
  helper roles.
- Hard crew roles, watches, home workplaces, and role-eligible job dispatch are
  present.

### Existing scaffolding or inconsistencies to resolve

- Every ItemNode shares one unrestricted capacity pool. There is no storage
  class, refrigeration, spoilage, temperature, quality, volume, contamination,
  or hazard metadata.
- A cargo lot records one location even when work distributes it across several
  racks. Consigned cargo and physical node inventory use parallel accounting,
  which can drift or overbook.
- `rawMaterial` currently stands in for hydroponic supplies and Cantina drinks.
  There are no beverages, ingredients, clean/dirty trays, cleaning supplies,
  medicine, spare parts, or waste items.
- Manual food purchases teleport stock directly into production/service nodes
  rather than arriving through a supplier ship and receiving route.
- Hot, cold, power, coolant, water, data, and air utility layers are typed and
  saved, but only Air Duct is placeable and simulated. Wastewater does not have
  a layer.
- Water is a global stock. Most fixtures do not consume local water, and current
  `leakingTiles` means hull exposure rather than plumbing leakage.
- Power is a global supply/demand formula. Individual fixtures and districts
  cannot lose power locally.
- Maintenance debt reduces Reactor and Life Support output. Several other
  modules have descriptive wear effects that are not applied to throughput.
- Cargo Arm strain/fault/repair is a separate bespoke system rather than an
  instance of shared condition and repair.
- Static debris exposure can raise exterior debt, but asteroid storms and solar
  flares do not exist. An older random failure pulse is dormant.
- Normal construction bypasses the blueprint system through an instant-build
  playtest flag; only experimental truss work normally exercises physical
  construction.
- EVA workers carry finite oxygen but lack a robust low-oxygen abort, return,
  suspend, and resume state.
- Active fires are not fully persisted/remapped, so reload or map expansion can
  erase or misplace an active hazard.
- Maintenance target discovery scans the full map every simulation tick, which
  will not scale when storms create many exterior targets.
- Specialist construction/EVA roles exist in content but are not fully surfaced
  in the normal hiring catalogue.
- Rating effects exist but do not yet provide an explicit market-access,
  financing, supplier, insurance, recruitment, or tenant benefit catalogue.
- The finance summary omits some major port settlement income and there is no
  categorized transaction ledger, station valuation, debt, rent, or lease.
- Three fixed global goals are presentation-only. Tier progression and
  specialties are separate progression authorities, while ship contracts only
  describe individual port calls.
- Resident helper roles are anonymous throughput modifiers with no employer,
  workplace, wage, personal income, business, or shift contract.
- Markets are physically stocked and reputation-sensitive but are always
  implicitly station-owned.

The implementation strategy is therefore **generalize, connect, and expose**:

- generalize ItemNodes into typed inventory/storage contracts;
- generalize Air Duct into the reusable network spine;
- generalize maintenance debt and Cargo Arm strain into condition;
- connect procurement to port logistics;
- connect watches to demand and physical schedules;
- connect rating to offers and contract terms;
- connect residents to named employment and businesses;
- expose each connection through world behavior and compact diagnostics.

## The Reusable Facility Contract

No new module should be added as a one-off numeric bonus. Every functional
module should use the same contract where applicable:

| Field | Question the game must answer |
|---|---|
| Capability | What new action does this object make possible? |
| Use positions | How many people can physically use or operate it at once? |
| Reservation | Who owns each position while walking to and using it? |
| Dwell | How long does a meaningful use session last? |
| Inputs | What inventory, utility, information, or labor does it consume? |
| Outputs | What service, item, waste, information, or need relief does it produce? |
| Operator | Which hard role must staff it, and at which visible work position? |
| Schedule | During which watch or service window should it operate? |
| Condition | How does load create wear, and what changes when worn or faulted? |
| Quality | Which room score or service result does it improve? |
| Hazard | Can it leak, burn, contaminate, injure, attract theft, or create noise? |
| Feedback | What animation, sound, world label, overlay, and inspector row explain it? |

The current `ModuleDefinition` mostly stores footprint, allowed room, item
capacity, and person capacity. It should evolve toward reusable data rather
than adding another room-specific branch to `sim.ts` for every object.

Suggested data shape:

```ts
interface FacilityDefinition {
  useSlots: FacilityUseSlot[];
  operatorSlots: FacilityOperatorSlot[];
  session: { kind: string; durationSec: number; interruptible: boolean };
  inputs: FacilityFlow[];
  outputs: FacilityFlow[];
  utilities: UtilityRequirement[];
  wear: WearProfile | null;
  quality: QualityContribution[];
  hazards: HazardProfile[];
}
```

This is a simulation contract, not an instruction to expose a spreadsheet. The
world should show users at authored positions, moving stock, dirty output,
sparks, leaks, queues, and downtime. The inspector only explains what the
player can already see.

## Comparative System Audit

| System | Prison Architect depth pattern | Current station | Station adaptation | Priority |
|---|---|---|---|---|
| Room validation | Minimum size, enclosure, required objects, access, and sometimes security | Size, module checklist, door/path/pressure | Keep activation recipe, add utilities, service access, operator coverage, and output destination as live readiness states | P0 |
| Object use | Finite object positions and substantial use time | Reservation exists for selected needs, but use is inconsistent and often brief | One shared reservation/session system for every seat, bed, toilet, counter, desk, console, and workbench | P0 |
| Regime/schedule | Hourly periods create meal, shower, work, yard, sleep, and free-time waves | Three watches primarily gate worker eligibility | Watches plus breaks, service hours, traffic banks, recovery, and maintenance windows | P0 |
| Kitchen | Cooker, fridge, sink, delivered ingredients, cooks, power, water, dirty trays | One Stove converts global/raw meal stock | Cold storage, prep, cooking, wash-up, waste, heat, power, water, and cook posts | P0 |
| Canteen | Serving tables, seats, trays, prepared food, rush congestion, cleaning | Serving Stations, four-seat Tables, meal stock, partial queues | Preserve multi-seat tables; complete tray, seat, steward, wash-up, and meal-wave loop | P0 |
| Bathrooms | Toilets/showers/sinks use plumbing; water can flood and interact with power | Physical fixtures and needs, global water stock | Supply and wastewater connections, drains, leaks, grime, fixture condition, repair access | P1 |
| Dorms/cells | Bed and toilet baseline; optional objects, privacy, size, and comfort alter quality | Bed/Bunk and Locker; weak use rhythm | Assigned berths, long sleep sessions, quiet/air/privacy quality, lockers and nearby hygiene | P1 |
| Common room/lounge | Different objects satisfy different needs with finite users and long sessions | Couch/Game Station/Rec Unit mostly collapse into generic leisure | Separate comfort, recreation, social, exercise, and information sessions with visible occupancy | P1 |
| Staff rooms | Staff recover specific needs at dedicated objects; placement affects travel | Crew use shared public facilities with limited differentiation | Crew mess, quarters, washroom, and break lounge policies; visitors cannot consume protected crew capacity | P1 |
| Offices | Administrators require offices with desk, chair, and filing cabinet | Captain/department terminals share Bridge; office work is not physical | Officer offices and command posts unlock concrete policies, reports, automation, and response capacity | P2 |
| Utilities | Electrical capacity/circuits, cables, water pressure/pipes, valves, hot water, data wiring | Global production plus power/air overlays; direct air duct network | District power circuits, water/waste loops, data/control links, local isolation switches, visible capacity | P1-P3 |
| Room quality | Size and optional functional fixtures produce a legible grade | Environment traits and local reputation are mostly derived/hidden | Per-room quality card with concrete contributors, service effects, and demand response | P1 |
| Maintenance | Damage, fire, flood, object destruction, repair, emergency response | Maintenance debt and some faults/fire; limited capital loss | Module condition states, spare parts, local shutdowns, propagation, triage, replacement | P2 |
| Security | Deployment, patrols, searches, checkpoints, CCTV, monitor operators, contraband | Guards, cameras, access gates, incidents, Brig, local control | Patrol/post overlays, customs/security schedules, evidence, detention, theft targets, response travel | P2 |
| Programs/work | Rooms, instructors, desks/tools, qualifications, scheduled sessions | Workshop/Market production is thin and weakly motivated | Training, certification, repair/refit contracts, resident work, and room-specific production later | P3 |
| Economy | Cashflow, wages, food costs, grants, loans, land, valuation, exports | Turnaround revenue and cheap construction produce large surpluses | Operating statements, consumables, maintenance, capital projects, loans/contracts, station value | P2 |
| Escalation | Unmet needs and danger lead from complaints to misconduct, damage, and riots | Complaints, strain, theft/fights, resignations; weak coupling | Operational cascade driven by demand, fatigue, crowding, faults, and local disorder | P2 |
| Progression | Bureaucracy and staff offices unlock tools; grants teach systems | Tier goals and unlocks exist but can feel detached | Demonstrated-operation milestones unlock management tools and larger capital classes | P2 |
| Scale | Deployment and schedules replace some individual reaction | Hard roles and named watches exist; district abstraction not yet earned | Named operation first, then service areas, roster templates, supervisors, and district policies | P3 |

## Room And Facility Catalogue

### 1. Kitchen And Food Plant

The Kitchen should be a production room, not a Stove activation box.

**Baseline recipe**

- one Cold Store or Fridge for raw food;
- one Prep Counter providing two preparation positions;
- one Stove or Cooker providing one cook position;
- one Sink or Dishwasher providing one wash position;
- powered, supplied with potable water, and connected to waste;
- a reachable Cafeteria Serving Station or cold-storage output buffer;
- one on-duty Cook for each active production line.

**Physical flow**

```text
delivery/storage -> fridge -> prep -> stove -> meal rack
    -> serving station -> diner -> dirty tray return -> sink -> clean tray stock
```

The first version can batch the carried inventory internally, but actors and
fixture states must show the flow. A full meal cannot materialize at every
Serving Station from a global counter.

**Capacity and decisions**

- A Stove determines batch production, not the room's total meal storage.
- Fridge capacity controls how many meal waves the kitchen can survive without
  a delivery.
- Prep and wash positions can become different bottlenecks from cooking.
- A second Stove without more cold storage, prep, washing, power, or Cooks may
  make the room worse rather than doubling output.
- Distance to storage and cafeterias matters through visible hauling time.

**Failure and quality**

- Low power slows or stops refrigeration and cooking.
- Low water blocks washing and gradually runs down clean trays.
- Overloaded cooking produces heat, dirt, and fire risk.
- Worn equipment slows a stage before faulting.
- Spoiled stock, dirty trays, or a filthy kitchen reduces meal quality and can
  make people ill later.
- Better refrigeration, dishwasher, ventilation, and ingredient variety raise
  reliability and meal quality rather than acting as decoration.

### 2. Cafeteria And Meal Service

The existing Table artwork already depicts four seats and should continue to
provide four exclusive seats. The player should not place fifty individual
chairs. Large tables and benches are the correct station-scale primitive.

**Baseline recipe**

- one stocked Serving Station;
- enough Table or Bench seats for the expected meal wave;
- a dirty-tray return point;
- a path wide enough for the queue and seated traffic;
- Steward coverage for a busy public room; a small starter mess can run as
  self-service at lower throughput and quality.

**Complete session**

```text
decide to eat -> reserve serving position -> queue -> collect one meal
    -> reserve one seat -> travel -> eat for a meaningful dwell
    -> return/leave dirty tray -> release seat -> next activity
```

The provider, queue position, meal, and seat reservations must be transactional:
an interrupted actor cannot consume another meal until the prior session ends
or rolls back.

**Player decisions**

- number and placement of serving lines;
- seating for average demand versus peak watch change;
- central large mess versus smaller crew/public dining rooms;
- steward staffing and opening hours;
- distance from kitchen and dirty-tray route;
- comfort/quality versus density and cleanup cost.

### 3. Hygiene, Water, And Waste

Hygiene should introduce the first comprehensible local utility network after
air: potable water in, wastewater out.

**Baseline recipe**

- Toilet: one user, water supply, wastewater, privacy position;
- Shower: one user, water supply, wastewater, optional hot water;
- Sink: one user, water supply, wastewater;
- Floor Drain: passive flood removal for a local area;
- Hygiene room: enough fixture mix for its assigned population and a reachable
  drain.

**Use rules**

- Actors reserve exactly one fixture and remain for a readable session.
- The need is relieved progressively during the session, not repeatedly on
  arrival.
- An actor does not alternate fixtures unless interrupted by closure, hazard,
  or failed reservation.
- Shower, toilet, and hand-washing satisfy different needs.

**Leaks and damage**

- Load and wear raise leak risk; poor plumbing or frozen/overheated districts
  can increase it later.
- A leak adds water to adjacent tiles. Drains remove it at finite throughput.
- Standing water slows movement, raises grime, degrades nearby modules, and
  becomes dangerous around exposed power.
- Closing a valve isolates a wing but disables its fixtures.
- Engineers repair pipes and fixtures; Cleaners remove the remaining mess.

This produces a local, understandable chain: crowded washroom -> fixture wear
-> visible leak -> slippery/flooded route -> closure or repair -> queue moves to
another washroom.

### 4. Crew Quarters And Recovery

Crew quarters should make staffing a 24-hour spatial problem.

**Baseline recipe**

- Bed: one comfortable sleep position;
- Bunk: two compact sleep positions with lower privacy/quality;
- Locker: personal storage and changing position; one per one or two crew;
- nearby crew hygiene access;
- adequate air, temperature, quiet, and enclosure.

**Assignment and use**

- Crew receive a home bed or bunk slot, not merely access to any Dorm.
- Off-duty crew with low energy travel to their assigned quarters and sleep for
  a substantial portion of the watch.
- Reserve crew may nap but should remain more interruptible.
- Emergency recall visibly wakes named crew and creates an overtime/recovery
  debt in the next period.
- No bed slot means improvised rest in a lounge or chair, with much poorer
  recovery and morale.

**Quality**

- privacy, crowding, noise, air, temperature, lockers, sanitation distance,
  and room condition affect recovery rate and morale;
- premium cabins can later support officers, residents, and high-value crew;
- quality differences should create real tradeoffs between compact bunks near
  work and quieter quarters farther away.

### 5. Lounge, Recreation, And Social Space

Leisure must become several needs and several visible activities, not one
generic target list.

| Fixture | Slots | Typical session | Primary effect | Secondary pressure |
|---|---:|---:|---|---|
| Couch | 3 | long | comfort/rest | low turnover, quiet |
| Bench | 4-6 | short | waiting/comfort | dense, low quality |
| Game Station | 2-4 | medium | recreation/social | power, noise, wear |
| Rec Unit | 4-6 | medium | exercise/recreation | noise, hygiene, injury |
| Screen/Projector | room audience | long | entertainment/social | seating still required |
| Vending Machine | 1 pickup | short | snack/drink | stock, litter, spend |
| Telescope | authored viewing slots | medium | wonder/status | premium demand |

An actor reserves a seat or use slot, walks to it, visibly performs the
activity, receives progressive relief, and leaves after a real session. A room
with one game unit cannot satisfy thirty people simultaneously because they
are merely standing on generic room tiles.

Different populations should prefer different spaces:

- crew use protected break lounges near work during reserve/off-duty windows;
- visitors choose convenient, attractive public lounges while waiting for a
  ship;
- residents value repeatable neighborhood recreation and social ties;
- premium passengers respond to quality, scenery, crowding, and privacy.

### 6. Cantina

The parallel cantina slice should follow the same contract:

- Bar Counter provides staffed pickup positions, not seating capacity;
- Taps increase service throughput or menu variety;
- Steward is the normal operator;
- drinks are stock or a produced service, not infinite room capacity;
- patrons queue for a drink, reserve a Bench/Couch/Table seat, dwell, and may
  choose a repeat drink based on traits, time, price, and intoxication;
- seating, service throughput, stock, Steward coverage, and room quality are
  separate limits;
- crowding, repeat drinks, weak security, and poor cleaning raise disorder.

### 7. Bridge, Offices, And Administration

The Bridge should be the operational control floor. It should not substitute
for every officer's workplace.

**Office recipe**

- Desk/Console: one work position;
- Chair: one officer position, authored as part of a large desk module if
  individual placement would be tedious;
- Records Cabinet or Data Archive: policy/report capacity;
- power and data connection;
- enclosure and acceptable air.

**Why offices matter**

- Captain's office enables station-wide emergency orders, routine traffic
  policy, and high-tier staff coordination.
- Security chief office enables patrol schedules, incident review, searches,
  and advanced screening.
- Quartermaster/logistics office enables stock targets, manifests, and
  automated routing.
- Chief engineer office enables maintenance windows, district shutdowns, and
  preventive maintenance policies.
- Hospitality manager office enables service hours, quality standards, and
  district staffing templates at medium scale.

The officer must spend some work sessions at the desk to process policy,
reports, or planning. The player should see the officer work, but should not be
forced to wait for arbitrary research timers to use basic controls.

### 8. Security, Customs, And Brig

Security depth should emerge from physical coverage and response, not a global
suppression number.

- Security Terminal/Monitor: one operator supervises a finite number of linked
  cameras, gates, or alarms.
- Camera: needs power/data and reports only within its view.
- Access Gate: needs power and a nearby/staffed security post for full effect.
- Customs Counter: physical inspection capacity; strict screening takes longer
  but finds more risky cargo.
- Patrol Post/Route: a world overlay assigns named guards to areas and periods.
- Evidence Locker: stores confiscated goods and becomes a theft target if
  unsecured.
- Brig Cell: actual occupancy, toilet access, release/ejection timer, and guard
  escort.

Security staffing should change by operating period: guards cover berths during
arrivals, cafeterias during meal waves, rough cantinas during leisure, and
quiet districts overnight. That is how shifts become a gameplay tool rather
than a roster label.

### 9. Clinic

The Clinic should have a care chain:

- triage/exam desk;
- Med Bed capacity;
- medicine cabinet or supply locker;
- doctor/nurse work positions;
- clean water, power, and high air quality;
- waste/cleaning load after treatment.

Minor injuries consume time and supplies. Severe cases occupy beds longer.
Distance from high-risk work areas affects outcomes. A well-equipped clinic
reduces deaths and reputation damage but creates recurring labor and supply
costs.

### 10. Workshop And Maintenance Bay

The Workshop should serve the station before it becomes a trade-good business.

- Workbench: repair fabrication position;
- Tool Locker: engineer/mechanic equipment access;
- Spare Parts Rack: physical maintenance inventory;
- Fabricator: powered production of parts from materials;
- Repair Bay: large ship or module overhaul position;
- ventilation and fire protection for industrial work.

Routine maintenance consumes parts. Deferred work converts Worn equipment to
Degraded, then Faulted, then Damaged. Workshop capacity determines whether the
station can repair internally or must buy expensive replacements/emergency
service.

Trade goods and external repair contracts are optional profitable uses of
spare capacity, not gates for core security or progression.

### 11. Cargo, Storage, Fuel, And Waste

Every port service should have an interface, buffer, internal route, and
destination:

```text
ship interface -> staging buffer -> transporter -> storage/consumer
consumer/waste -> staging buffer -> ship/export interface
```

- Cargo Arm is an interface, not storage.
- Intake Pallet is a short-term berth buffer.
- Storage Rack is bulk station storage.
- Cold Store protects food.
- Fuel Tank holds one fuel class; Fuel Pump transfers it at a staffed berth.
- Waste Compactor and Waste Tank receive station output for later export.
- Sorter/Conveyor later automates a high-volume route after the player has run
  it manually.

Blocked buffers should stop the relevant ship workstream and visually show the
blocked cargo. The player solves it by adding storage, changing routes,
prioritizing a lot, opening an export, or refusing/holding traffic.

### 12. Reactor, Life Support, And District Plant

Plant rooms should be large capital systems with local service envelopes.

- generators/reactors provide finite circuit capacity;
- capacitors/batteries handle peaks and controlled shutdowns;
- switchgear isolates districts;
- life support consumes power/water and produces air capacity;
- vents and ducts distribute air;
- cooling/heat exchangers remove thermal load;
- plant modules need operator checks, preventive maintenance, and spare parts;
- overload first creates heat, noise, wear, and warnings before a serious fault.

This is where large-station capital spending lives: a bigger reactor or district
plant should cost far more than furniture, support a new wing, and create a
larger maintenance obligation.

## Room Quality Without Decorative Checklists

Room quality should be multi-dimensional and operational:

| Dimension | Typical contributors | Consequence |
|---|---|---|
| Capacity | users per fixture/seat/bed | queues, denied sessions, crowding |
| Service | staff, throughput, stock, hours | wait time, reliability, spend |
| Comfort | seating, privacy, temperature, noise | dwell tolerance, morale, recovery |
| Hygiene | dirt, drains, washing, waste | illness, rating, reluctance to use |
| Safety | coverage, exits, fire equipment, condition | injury/fault severity, confidence |
| Amenity | variety of meaningful activities | satisfaction, status, repeat visits |
| Access | travel time, doors, zoning, route width | usable capacity and lateness |

Optional objects should change at least one behavior. A plant can improve
appeal and air perception; a screen can entertain several seated viewers; a
locker can improve recovery and speed a watch change. Avoid objects whose only
effect is `+1 room grade`.

Room inspectors should answer four questions in this order:

1. Is the room open and usable now?
2. What is the current bottleneck?
3. How many people can it serve during the next demand wave?
4. What concrete change would improve it?

## Making Watches Matter

The current Alpha/Beta/Gamma system has a useful skeleton: named crew belong to
watches, the current period determines on-duty/reserve/off-duty status, and
recall changes eligibility at a needs cost. The missing part is a station
schedule that causes observable behavior.

### Operating period model

Keep three repeating watches, but give each watch a visible agenda:

| Phase | On-duty crew | Reserve crew | Off-duty crew | Station demand |
|---|---|---|---|---|
| Handover | report to workplaces | available for overlap | finishing prior recovery | incoming status, short double coverage |
| Traffic bank | operate facilities | surge/response | sleep/recover | arrivals, cargo, visitor services |
| Meal/break wave | staggered breaks | cover posts | eat/leisure | cafeteria and hygiene peak |
| Maintenance window | selected operators remain | engineers/cleaners surge | recover | inspections, cleaning, deferred work |
| Recovery | hand over and leave | becomes on duty next | prepares for reserve | low routine traffic |

The station is in space and does not need a terrestrial day/night fiction.
These are port operating periods tied to traffic and handover.

### Player controls

- assign each named crew member a hard role, home workplace, and watch;
- set facility service hours by dragging simple watch bands, not editing global
  worker counts;
- stagger meal/recovery windows by department or district;
- schedule preventive maintenance or sanitation windows;
- define minimum coverage for a workplace as a warning/forecast, not a magical
  allocation control;
- recall named crew during a crisis and see the recovery cost;
- later save a roster template and delegate it to a supervisor.

### World presentation

- clocks and room signs show opening/closing/handover states;
- crew physically leave posts, walk to mess/hygiene/quarters, and replacements
  arrive;
- inbound forecasts show which facilities will be open and staffed on arrival;
- workplace labels show `2/3 on post`, `handover`, `closing`, or `uncovered`;
- the schedule overlay colors workplaces and routes by upcoming period;
- alerts identify a concrete consequence: `Beta cook off duty: evening mess
  opens with no production coverage`.

### Why this creates play

A small station may have one Cook, one Engineer, and one Steward. Their breaks
and sleep windows cannot all overlap with a passenger bank. A larger station
can afford overlap, specialist night coverage, and district staff rooms. The
player is arranging an institution in time and space, not incrementing a labor
counter.

## Operational Pressure And Cascades

The station's equivalent of a Prison Architect riot should be an operational
cascade, not a random disaster timer.

```text
ambitious traffic/load
  -> queues, overtime, stock draw, dirt, heat, and wear
  -> tired crew and degraded facilities slow service
  -> visitors stay longer and miss promised outcomes
  -> congestion, complaints, theft, fights, leaks, and faults rise
  -> rooms close or routes divert
  -> pressure spills into adjacent systems
```

Randomness should choose when and where a visibly stressed system crosses the
line. It should not invent the underlying cause.

### Condition ladder

| State | Visible behavior | Player options |
|---|---|---|
| Maintained | full throughput, normal animation | preventive maintenance |
| Worn | cosmetic wear, noise, small slowdown | service during quiet window |
| Degraded | warning, lower capacity/quality, higher hazard | close or run at risk |
| Faulted | local service unavailable or intermittent | repair, reroute, emergency buy |
| Damaged | replacement parts/capital repair required | rebuild, salvage, insurance later |

### Disorder ladder

| State | Examples | Response |
|---|---|---|
| Friction | complaints, litter, queue cutting, minor theft attempts | improve service or local presence |
| Misconduct | theft, vandalism, fights, refusal to leave | guards, staff intervention, policy |
| Local disorder | damaged room, panicked crowd, repeated crime | close zone, surge security/medical |
| Cascade | multiple failures, staff walkout, widespread panic | emergency posture and recovery plan |

Needs, waiting, fatigue, environment, local reputation, and security control
should determine escalation pressure. The player can run a rough but profitable
district, but only if it remains controlled.

## Economy And Capital Ladder

The present save can earn a large turnaround profit while ongoing payroll and
service failures remain small. Depth needs both stronger operating costs and
meaningful capital targets.

Before changing prices, every credit mutation must emit a categorized
`EconomicEvent`. The current finance summary does not include all major port
settlements, so balancing against that panel would be misleading. The ledger is
the prerequisite for credit rebalance, loans, rents, revenue share, insurance,
and valuation.

### Operating costs

- wages and overtime;
- raw food, drinks, medicine, fuel, water treatment, and cleaning supplies;
- spare parts and replacement modules;
- power generation/fuel and waste export;
- refunds, contract penalties, injury/death costs, and property damage;
- interest or lease payments for financed expansion.

### Capital classes

| Scale | Example investment | New capability | New obligation |
|---|---|---|---|
| Starter | fridge, drain, extra table, crew bunk | reliable basic service | stock, cleaning, water |
| Department | industrial kitchen, staff lounge, security office | larger waves and policy | specialist staffing |
| Wing | prefabricated concourse or crew block | more traffic/population | district plant and routes |
| Port infrastructure | medium/large berth, cargo sorter, fuel farm | valuable ship classes | buffers, hazards, maintenance |
| Station plant | reactor, cooling loop, life-support district | major expansion capacity | operators, spares, failure risk |
| Civic district | clinic, recreation complex, residential quarter | retention and premium demand | continuous service quality |
| Strategic | military dock, overhaul bay, automated terminal | endgame contracts/identity | security, enormous load, capital exposure |

Goals and grants should teach or subsidize these systems. They should not be the
only reason to build them. A grant can fund the first proper kitchen; the
kitchen remains valuable because it changes station operation.

## Rating As Access, Demand, And Bargaining Power

Station Rating should be more than a report card and a slow income modifier. It
should determine who is willing to visit, work, lend, insure, trade, or open a
business at the station.

The current implementation is already a useful first step: global and local
reputation modify Market spending, housing appeal, ship-family weighting,
docking fees, and berth settlement yield. The missing pass is to make those
effects visible and extend them to named benefits, counterparties, and terms.

The important distinction is:

- **Unlocks** represent technical or institutional capability.
- **Rating** represents trust and market access.
- **Local reputation** represents the character of a particular district.
- **Relationships** represent performance with a specific faction, carrier, or
  business.

A high rating should not magically unlock a Fuel Pump. It should make a
reputable fuel supplier willing to offer better terms after the station has the
physical capability to handle fuel.

### Rating bands

| Rating | Typical demand | Benefits | Exposure |
|---:|---|---|---|
| 0-29: Unreliable | distressed ships, salvage, marginal traders | cheap/risky opportunities | poor credit, high insurance, weak applicants |
| 30-49: Functional | budget passengers, small carriers, basic suppliers | ordinary contracts and tenants | narrow margins, little tolerance for failure |
| 50-69: Established | commercial traffic, residents, regional operators | better fees, loans, concessions, skilled crew | larger waves and stronger service expectations |
| 70-84: Preferred | premium passengers, major carriers, specialist tenants | better deals, advance bookings, premium spend | expensive failures and reputation shocks |
| 85-100: Strategic | diplomatic, military, luxury, major industrial traffic | prestige projects, excellent terms, rare staff/tenants | intense security, resilience, and quality obligations |

Rating should influence an offer pool, not create a single mandatory ladder.
A rough high-notoriety station can still attract valuable gray-market or
industrial business through local reputation and relationships even if premium
tourism avoids it.

### Rating inputs and memory

- service reliability and promise completion;
- waiting, crowding, missed connections, and denied needs;
- crew welfare, staffing continuity, and workplace safety;
- air, cleanliness, room quality, and maintenance;
- crime, emergency outcomes, injuries, and deaths;
- variety and quality of amenities;
- successful operation at the station's current scale;
- recent trend and a decaying history, so one perfect ship does not erase a
  disastrous period.

### Concrete benefits

- higher-value visitor and ship archetypes enter the demand pool;
- carriers offer more frequent or larger traffic agreements;
- suppliers offer lower prices, more credit, or priority deliveries;
- concessionaires offer higher rent or revenue share;
- lenders increase limits and reduce interest;
- insurers reduce premiums for prepared, well-maintained stations;
- more skilled crew apply and tolerate less hardship;
- residents with different wealth, risk, and profession profiles consider
  moving in;
- authorities, factions, and military clients offer strategic contracts.

Clicking Rating should continue to show cause, effect, and fix. It should also
show `what this rating currently attracts` and the next market-access threshold,
without presenting that threshold as a linear quest.

This adapts a strong airport-management pattern: Airport CEO ties contract
quality and negotiating leverage to airport rating rather than treating rating
as a decorative score. Its franchise staff are also supplied by an active
franchise rather than hired by the airport directly:
[Airport CEO businesses and contracts](https://www.airportceo.com/post/dev-blog-151-businesses-and-contracts),
[Airport CEO staff](https://airportceo.wiki.gg/wiki/Staff).

## Who Operates A Room?

Not every room should use the same labor model. The station should support four
operating models, each using the same physical facility and service contracts.

| Model | Player provides | Operator provides | Player earns | Main tradeoff |
|---|---|---|---|---|
| Station-operated | room, equipment, stock, crew, schedule | nothing | all service revenue | maximum control and labor burden |
| Concession/tenant | fitted shell or equipped room, utilities, logistics access | brand, specialist staff, some stock | rent plus negotiated revenue share | stable income, less control |
| Resident enterprise | affordable lease, utilities, access to local market | proprietor labor, identity, some sourcing | rent/tax and neighborhood value | organic station life, variable reliability |
| Service contractor | access, job specification, payment | temporary labor/equipment | avoided capital or emergency recovery | expensive and externally dependent |

### Essential versus commercial operation

Core safety systems should initially remain station-operated:

- bridge/traffic control;
- life support, reactor, water, and emergency plant;
- security command and Brig;
- critical maintenance and EVA response.

Commercial and hospitality rooms are good candidates for multiple models:

- Cantina, Lounge club, Market, restaurant, premium cafeteria;
- lodging, private cabins, gym/Rec Hall, observatory attraction;
- repair shop, freight forwarder, clinic franchise, fuel concession;
- later resident services such as laundry, childcare, education, or local
  manufacturing.

The starter Cafeteria can remain station-operated so the player learns food
production. Later the player may lease a second restaurant or contract staff
for a premium venue.

### Lease and concession contract

Each leased business needs:

- a room use and allowed customer policy;
- a facility recipe and minimum quality;
- opening/service hours;
- utility and logistics terms;
- operator-supplied versus station-supplied stock;
- base rent, revenue share, and contract length;
- service standard, staffing promise, and breach terms;
- local demand forecast based on footfall, rating, district identity, and
  competing businesses.

The player negotiates a few meaningful terms, not every wage and menu item.
The tenant then brings visible workers and operates the same counters, seats,
stock, waste, and closing routine as a station-run business.

### Resident-run businesses

Residents should have skills, savings, risk tolerance, and aspirations. A
resident can apply for a vacant business lease if their profile and the local
market fit.

Examples:

- a former Steward opens a small noodle counter;
- a mechanic rents a Workshop bay for light ship repair;
- a botanist sells high-quality produce or operates a tea room;
- a rough-district resident runs a pawn or salvage stall;
- a wealthy resident funds a premium lounge and hires other residents.

Resident enterprises create jobs for other residents, keep earnings circulating
locally, develop relationships with repeat customers, and give the station
stories. Failure should also be possible: poor footfall, theft, supply failures,
or a bad lease can close a business and leave a vacant room.

This is not a full free-market simulation in the first pass. V1 needs tenant
offers, one proprietor, a small staff count, stock, opening hours, rent, and a
service result. The player remains the station architect and landlord.

### Why this helps scale

At five crew, the player hires and schedules the Cook. At fifty crew, the player
may still run the main mess but lease three public venues. At hundreds of
people, supervisors and tenants operate districts while the player sets leases,
service standards, infrastructure, and access. This is an earned transition
from Prison Architect-like direct operation to a larger institutional game.

## Contracts, Grants, Loans, And Non-Linear Objectives

Objectives should form a portfolio of optional opportunities, not a campaign
quest chain.

Today the HUD's three global goals are fixed presentation checks with no
persistent contract, payout, choice, or expiry. Tier unlocks, specialties, and
individual ship contracts operate separately. The new objective contract should
unify their predicate and reward vocabulary without forcing all three systems
to become the same UI.

Prison Architect's grant model works because the player opts into a funded
project, receives capital, and completes concrete facility goals. Prison
Architect 2 described Main, Repeatable, and Milestone contracts, including
population, recruitment, and cashflow milestones, while loans finance expansion
at an ongoing cost: [PA2 finances](https://www.paradoxinteractive.com/games/prison-architect-2/news/feature-highlight-finances),
[Prison Architect grants and loans](https://prison-architect.fandom.com/wiki/Grant).

The station should use five opportunity types:

### Development grants

Up-front funding for a player-chosen capability:

- establish a hygienic crew block;
- commission a second life-support district;
- build a staffed clinic;
- create a cold-chain cargo terminal;
- establish an EVA maintenance capability.

The grant defines functional outcomes, not exact room coordinates. Failure or
cancellation returns some advance and harms the relevant relationship.

### Milestone awards

Automatic one-time recognition for organic growth:

- house 25, 50, 100, then 250 citizens;
- operate 3, 5, then 10 berths;
- complete traffic banks without a service failure;
- maintain rating bands for several periods;
- reach freight, fuel, repair, hospitality, or resident thresholds.

The player does not need to activate these. They reward accomplishments without
dictating build order.

### Operating contracts

Repeatable performance opportunities:

- serve a passenger volume while keeping waits below a threshold;
- maintain a freight route for several operating periods;
- supply a faction with food, fuel, parts, or lodging;
- keep a district open through a solar season;
- provide repair capacity or emergency refuge.

They create sustained demand and can be declined, renewed, or renegotiated.

### Capital and relationship contracts

Large organizations co-finance infrastructure in exchange for capacity,
priority, or standards:

- a carrier contributes to a concourse but reserves peak berth windows;
- a military client funds a secure dock but imposes security requirements;
- a fuel supplier installs tanks in return for an exclusive concession;
- a residential consortium funds a district with quality guarantees.

These should shape the station rather than merely pay a completion bonus.

### Loans and credit

- credit limit derives from rating, cashflow, station value, and repayment
  history;
- loans finance large capital classes, not routine meal purchases;
- interest and principal are visible operating obligations;
- collateral or covenants may include rating, insurance, or reserve capacity;
- refinancing and early repayment provide later management choices;
- default should constrain future deals before it ends the game outright.

### Contract board presentation

The board should be grouped by the station the player wants to build:

- People and civic life;
- Hospitality and commerce;
- Freight and industry;
- Infrastructure and resilience;
- Security and public service;
- Strategic relationships.

Each card shows capital offered, operating obligation, physical capability,
risk, duration, and why it is available. Never force the player to read every
individual ship manifest to find progression.

## Supply Chains And Specialized Storage

The station's hospitality economy should begin at the berth, not at a global
inventory counter.

### Commodity families

| Commodity | Imported/produced by | Storage | Consumed by | Waste/output |
|---|---|---|---|---|
| Raw food | food supplier, Hydroponics | Cold Store/Fridge | Kitchen | packaging, spoiled food |
| Prepared meals | Kitchen | heated meal rack/Serving Station | Cafeteria users | dirty trays, food waste |
| Drinks | beverage supplier, later brewery | Beverage Store/Bar cellar | Cantina, vending | empties, litter |
| Potable water | supply ship, recycler | water tank/network | hygiene, kitchen, drinking | wastewater |
| Medicine | medical supplier | secure Med Cabinet | Clinic | medical waste |
| Cleaning supplies | station supplier | Cleaning Cupboard | Cleaners | refuse/wastewater |
| Spare parts | supplier, Workshop | Parts Rack | maintenance/EVA | scrap |
| Fuel | tanker | typed Fuel Tank | docked ships/reactor later | fees, hazard |
| Retail goods | traders/suppliers | secure stockroom | Market/tenants | packaging, theft risk |
| Waste/scrap | all station systems | Compactor/Waste Tank | export/recycling | credits/materials |

### Inbound chain

```text
supplier offer/standing contract
  -> compatible ship and berth window
  -> Cargo Arm or manual unloading
  -> Intake Pallet
  -> Cargo Handler haul
  -> specialized storage
  -> local restock job
  -> consuming facility
```

A busy station should reserve some berth and Cargo Handler capacity for its own
supplies. Accepting every profitable passenger/freight call can then starve the
station of food, drinks, fuel, or parts.

### Proximity and layout

- Kitchens should benefit from nearby Cold Stores without requiring every
  Fridge to sit inside the cook line.
- Cantinas need a beverage store or frequent deliveries.
- Clinics need secure, clean medical storage.
- Maintenance bays need nearby Parts Racks and tool access.
- Bulk storage belongs near cargo berths; local service cupboards reduce the
  last-mile walk.
- A back-of-house logistics route protects public appeal and keeps carts out of
  queues.

Distance should cost actual hauling time and congestion. The player should see
the carried item and the empty destination. Avoid another hidden distance
penalty score.

### Stock policy

At small scale, the player places storage and accepts supplier offers. At medium
scale, a Quartermaster office unlocks simple physical policies:

- desired days/operating-periods of stock;
- preferred supplier and maximum price;
- berth/delivery windows;
- reserve stock protected from commercial export;
- emergency purchase threshold;
- tenant-supplied versus station-supplied goods.

This is management of a material system the player has already operated, not an
abstract production spreadsheet.

## EVA, External Construction, And Space Weather

EVA should make the outside of the station part of the playable world. It is a
strong station-specific answer to Prison Architect's fire, escape, and riot
pressure because it combines warning, preparation, physical response, and
capital damage.

### Baseline EVA capability

- EVA airlock with suit rack and recharge capacity;
- trained EVA Engineer or construction crew;
- tether/tool locker and spare parts;
- exterior path/attachment points;
- safe conditions or an explicit emergency-risk order;
- recovery/decontamination after return.

External construction and repair should require suited workers to walk from the
airlock to the target. The player can improve response through airlock placement,
exterior service routes, drones, redundant equipment, and stocked repair kits.

### Event families

| Event | Advance signal | Immediate pressure | Physical aftermath | Counterplay |
|---|---|---|---|---|
| Micrometeoroid/asteroid storm | forecast and trajectory | close exposed berths, shelter EVA | hull breaches, damaged exterior modules | shielding, shutters, reserve air, EVA repair |
| Solar flare | radiation and grid forecast | power spikes, sensor/comms interference | tripped circuits, damaged electronics | batteries, surge protection, shutdown policy |
| Debris strike/docking collision | traffic warning or operator error | local breach/fire, berth closure | hull/module damage, stranded ship | traffic control, tug capability, EVA team |
| Thermal event | sunlight/plant trend | cooling overload | degraded seals, plant wear | radiators, insulation, load shedding |
| Communications blackout | solar/weather forecast | poor traffic coordination and automation | delays, uncertain manifests | local control, redundant antenna, holding policy |
| External contamination | ship/event warning | close access and isolate people | dirty airlock, medical/cleaning load | screening, decon, protected suits |

### Event design rules

- Events have forecast, preparation, impact, response, and recovery phases.
- Prepared stations experience work and cost, not arbitrary annihilation.
- Damage targets derive from exposure, condition, shielding, and current load.
- The player sees the damaged tile/module and watches EVA repair it.
- Traffic and contracts create opportunity costs: closing berths is safe but
  expensive; continuing operation accepts known risk.
- Events remain uncommon enough that ordinary operations are the core game.
- A quiet period is used for construction and preventive work, not merely
  waiting for the next disaster.

### EVA progression

1. Manual patching of one hull breach from a starter airlock.
2. External repair of vents, antennas, berth equipment, and solar/radiator
   modules.
3. Planned exterior construction and module replacement.
4. Multiple EVA teams, drones, and district repair caches.
5. Massive dock and plant maintenance during severe space weather.

## Utility Spine: Power, Water, Waste, Air, Data, And Heat

The current duct and maintenance work should become the shared utility spine,
not another set of isolated overlays.

| Network | Sources | Distribution | Sinks | Failure behavior |
|---|---|---|---|---|
| Power | reactor, solar, batteries | cables, switchgear, circuits | every active module | brownout, trip, heat, fire |
| Potable water | tanks, recycler, supplier | pipes, pumps, valves | kitchen, hygiene, clinic, drinking | low pressure, closure, leak |
| Wastewater | fixtures and kitchens | drains, pipes, pumps | recycler, waste tank/export | backup, flood, contamination |
| Air | life support | ducts and vents | pressurized rooms/population | stale/low air, evacuation |
| Data/control | Bridge/Security servers | cable/repeaters | cameras, gates, automation, terminals | local manual mode, blind spots |
| Heat/coolant | heat-producing modules | coolant loop/radiators | space rejection | slowdown, wear, shutdown |

### Shared network rules

- Sources, segments, switches/valves, buffers, and sinks use one graph API.
- Each network has capacity and local connectivity, but only mechanics with
  player-facing consequences should be simulated.
- The normal view shows a concise warning at the affected object; overlays
  explain the network when the player chooses to diagnose it.
- Isolation is a real lever: closing a valve or breaker contains damage while
  taking a wing offline.
- Maintenance inspects and repairs components; overload and environment drive
  wear.
- Construction can reserve or interrupt utility capacity, making expansion an
  operational decision.

Plumbing should be introduced through Hygiene and Kitchen. Data should be
introduced through Security. Heat/coolant should be introduced through large
plant and industrial modules. The player learns one useful network at a time.

## Construction As An Operating System

Construction should remain physical at small and medium scale:

- delivered construction materials occupy Intake Pallets and Storage Racks;
- builders haul materials to a staged site;
- walls, floors, utilities, and modules have ordered build stages;
- construction zones obstruct traffic and create dirt/noise/hazards;
- cutting into an operating wing can vent air or interrupt utilities;
- exterior work requires EVA;
- commissioning verifies enclosure, utilities, staffing, and emergency access.

### Construction track decision: receiving before blueprints

Universal construction is a parallel implementation track, not a special
workflow owned by berths or other capital rooms. The game must use one of two
coherent modes at a time:

1. walls, floors, utilities, docks, and modules all build instantly and pay
   their normal costs; or
2. all of them become physical blueprints that require deliveries, hauling,
   labor, build time, and any applicable EVA work.

Do not introduce one-off `Fund Project` entities, berth-only construction, or
free instant walls surrounding physically built modules. Room and zone paint
remains a free functional designation in either mode. The structure and
fixtures create the cost and construction work.

The current Intake Pallet and Storage Rack capacities cannot support universal
construction volume. Physical construction must therefore remain disabled
until the receiving model is generalized:

- **Receiving** is a floor zone where inbound crates and equipment can be
  unloaded without requiring a storage module.
- **Construction Staging** is an optional floor zone near a build where
  reserved materials can wait for workers.
- Materials arrive in visible batches or crates representing multiple units,
  rather than consuming one tile or one rendered object per material unit.
- Intake Pallets improve unloading speed and floor-space efficiency, but are
  not mandatory entry points for every delivery.
- Storage Racks provide dense, organized, long-term stock rather than defining
  the station's total receiving capacity.
- Freight docks and Cargo Handler labor determine delivery throughput; receiving
  and staging floor area determine the physical buffer.
- A full receiving area can delay a supplier, but early construction must not
  deadlock because the player lacks enough low-capacity pallet modules.

The baseline physical flow is:

```text
supply pod -> receiving crates -> worker hauling -> construction blueprint
```

An optimized large-station flow becomes:

```text
freight berth -> cargo arm -> palletized receiving -> local staging -> build
```

Construction orders may reserve or generate inbound delivery lots, and
cancellation should return the unspent portion. Grants can provide credits or
materials and detect completed outcomes, but they do not own a separate
construction workflow. Until Receiving, Staging, batch crates, and delivery
throughput are working, the main game remains in universal instant-build mode.

The player can pay more for prefabricated modules, outside contractors, or a
short shutdown. Large expansions should therefore be interesting before they
open, not instant geometry purchased from a cash counter.

At endgame scale, construction can be aggregated into projects and districts,
but the simulation should preserve deliveries, staging, utility tie-ins, and
commissioning so layout and timing still matter.

## Ordered Implementation Catalogue

This is deliberately sequenced. Each pass must produce visible play before the
next dependency is added.

### Foundation A: Physical Use Sessions

- unify provider discovery, reservation, arrival, use, interruption, and
  release for crew, visitors, and residents;
- support multi-slot authored fixtures such as four-seat tables and six-seat
  benches;
- store active session, provider, slot, progress, carried item, and blocked
  reason explicitly;
- prevent double consumption and target thrashing;
- add substantial, tunable dwell times and progressive need relief;
- show occupied/reserved/broken/closed slots in world and inspector;
- batch provider queries and reservation counts for scale performance.

**Fun gate:** with UI hidden, a player can identify what every person in a mess,
bathroom, lounge, and dorm is doing and tell when the room is full.

### Foundation B: Facility Dependencies And Room Readiness

- extend module data with use/operator slots, utilities, inputs/outputs, wear,
  hazards, and quality contributions;
- make room readiness a list of live stages, not one active boolean;
- add reusable reason codes: no operator, no stock, no clean output capacity,
  no power, no water, waste blocked, worn, faulted, closed, off-hours;
- create one compact room inspector using `cause -> effect -> fix`;
- keep normal world feedback primary: animations, stock piles, warning lamps,
  water, dirt, queues, and workers.

**Fun gate:** disabling one dependency visibly changes the room and people react
to the correct bottleneck without reading a metrics panel.

### Slice 1: Kitchen, Cafeteria, And Meal Waves

- add a narrow end-to-end food procurement loop: place an order, receive a
  station-supply ship at a compatible Dock or Berth, unload to an Intake Pallet,
  and haul raw food into compatible cold storage;
- add Fridge/Cold Store, Prep Counter, Sink/Dishwasher, Tray Return;
- implement the complete meal/tray production chain;
- require Cook production posts and optional/required Steward service by scale;
- connect all Table artwork seats to exclusive use slots;
- add service hours and a scheduled meal wave;
- tune one starter kitchen for a small crew and make expansion necessary for a
  larger passenger bank;
- surface prep, cook, wash, stock, serving, queue, and seat bottlenecks.

The starter scenario may begin with a small raw-food buffer so the first shift
does not fail before the player learns the room. Replenishment must use the
physical supply chain. Fridges do not generate food and a procurement button
must not teleport stock into them.

Slice 1 deliberately limits procurement breadth to raw food and one simple
supplier/order model. General supplier competition, standing orders, beverages,
medicine, parts, perishability, cargo classes, district stock policies, and
logistics automation remain in the later logistics/economy packages.

**Playtest:** one small kitchen handles normal traffic but fails legibly under an
overlapping watch meal and passenger arrival. The player has at least three
valid responses: stagger breaks, add a stage, or open another mess.

### Slice 2: Lounge, Recreation, Cantina, And Population Differences

- implement distinct comfort, recreation, social, wonder, drink, and exercise
  sessions;
- give every fixture rendered capacity, dwell, wear, and quality effects;
- separate crew, visitor, and resident access/preferences;
- finish staffed Cantina service, seating, stock, repeat drinks, and disorder;
- add facility variety demand so one Couch is not the universal leisure answer.

**Playtest:** two lounge layouts with the same floor area serve different crowds
and produce visibly different queues, dwell, revenue, noise, and satisfaction.

### Slice 3: Hygiene And Plumbing

- add water supply and wastewater underlay modes, Floor Drain, local valves;
- give Toilet/Shower/Sink real flow and distinct sessions;
- add fixture wear, leaks, standing water, cleaning interaction, and nearby
  electrical risk;
- establish crew/public zoning and peak fixture demand;
- allow temporary closure and rerouting during repair.

**Playtest:** an undersized washroom creates queues; an overloaded fixture leaks;
the player sees the water, isolates or repairs it, and the crowd chooses another
room rather than entering a broken state.

### Slice 4: Quarters, Recovery, And Watch Rhythm

- assign beds/bunks to named crew;
- implement long sleep, naps, improvised rest, and recovery quality;
- add lockers and quiet/privacy/air/temperature quality;
- create visible handover, traffic, break, maintenance, and recovery phases;
- add department break staggering, facility hours, and named recall cost;
- turn the existing watch board into a spatial schedule overlay inspired by
  proven regime/deployment views rather than a wide roster spreadsheet.

**Playtest:** over two operating periods, crew hand over posts, eat, wash, sleep,
and return. A poor roster produces a visible uncovered service; a better roster
fixes it without hiring more people.

### Slice 5: Offices, Command, And Management Tools

- add Office room or office subtypes with Desk/Console, Chair, and Archive;
- give Captain and department officers physical work sessions;
- connect each office to a small set of concrete tools: traffic policy,
  schedules, maintenance windows, patrol plans, logistics targets;
- require adequate officer coverage for advanced automation, while basic
  emergency controls remain available;
- use world overlays and schedule bands, not global +/- staffing controls.

**Playtest:** building and staffing an engineering office unlocks preventive
maintenance planning that reduces emergencies but costs scheduled downtime.

### Slice 6: Condition, Spares, And Local Failure

- apply the condition ladder to all high-load functional modules;
- derive wear from use, environment, overload, and poor cleaning;
- add parts/tool logistics and Workshop repair production;
- preserve local throughput reduction before failure;
- add repair/replace/close/reroute choices;
- propagate water, fire, heat, contamination, and damage only through visible
  local rules.

**Playtest:** a busy wing accumulates understandable wear; preventive maintenance
keeps it stable, while running it hard creates a recoverable local cascade.

### Slice 7: Security, Crime, And Control

- implement staffed security monitors, camera/data links, patrol posts/routes,
  customs inspection slots, and Brig occupancy;
- make valuable stock, premium rooms, and weakly observed routes theft targets;
- make schedule deployment matter at berths, meals, nightlife, and maintenance;
- add evidence/confiscation flow, vandalism, and repair consequences;
- connect local control and incident outcomes to rating, demand, and insurance
  or contract terms.

**Playtest:** the same profitable rough district can remain controlled through
layout, staffing, and schedule, or spill disorder into neighboring public rooms.

### Slice 8: Capital Growth And Specialized Port Services

- rebalance construction and operating costs around starter, department, wing,
  port, plant, civic, and strategic capital classes;
- add fuel farm and staffed fueling, waste handling, cold cargo, repair/refit,
  and larger berth equipment;
- add loans, grants, contracts, and station valuation as growth tools;
- make larger traffic arrive through policy and reputation, not repeated manual
  manifest approval;
- unlock automation only after the player demonstrates the manual operation.

**Playtest:** a stable small station has several meaningfully different expansion
projects, cannot buy all of them immediately, and chooses an economic identity.

### Slice 9: Operational Cascade And Recovery

- derive a station pressure index from local capacity, waiting, overtime,
  fatigue, dirt, heat, wear, stock risk, and disorder;
- use it to raise the chance of stress-appropriate events at stressed targets;
- add clear escalation stages and pre-crisis warnings;
- allow emergency closure, recall, traffic throttling, evacuation, and outside
  assistance;
- add a recovery period with repair, cleanup, reputation, and crew consequences.

**Playtest:** a crisis can be traced backward to player-visible pressure, can be
contained locally by a prepared station, and creates a memorable recovery story
without feeling like a random punishment.

## Program Roadmap And Agent Fan-Out

This corpus is intended to support a multi-agent implementation program, but the
current architecture has a major coordination risk: `src/sim/sim.ts` owns many
unrelated systems and is already a large shared edit surface. Parallel agents
should not all add branches to it.

The program begins with stable interfaces and extracted subsystem ownership.
After that, work packages can proceed in parallel behind those interfaces.

### Program invariants

Every work package must preserve these rules:

1. Deterministic simulation state owns gameplay; rendering only presents and
   interpolates it.
2. Every system has normal-world feedback plus an optional diagnostic overlay.
3. Every failure reports cause, effect, and at least two valid player responses.
4. Every functional object uses shared facility sessions and reservations.
5. Every inventory transfer uses shared item-node/reservation semantics.
6. Every utility uses shared network diagnostics and isolation semantics.
7. Every new state field has save migration and deterministic fixture coverage.
8. Every feature has a ten-minute gameplay acceptance test, not only unit tests.
9. No work package reintroduces global labor +/- controls.
10. Scale tests target the desired game: hundreds of actors and a station two to
    three times the current playtest size.

### Epoch 0: Integration Foundation

One integration owner should complete these packages before broad fan-out.

| ID | Package | Deliverable | Exit condition |
|---|---|---|---|
| CORE-01 | Simulation boundaries | Extract facility, inventory, schedule, utility, economy, condition, and event APIs from the monolithic coordinator | A feature can add a facility without editing the actor update loop in several places |
| CORE-02 | Facility session contract | Shared discover/reserve/travel/use/interrupt/release state machine | Crew, visitor, and resident fixtures pass the same session fixtures |
| CORE-03 | Reason diagnostics | Stable reason codes and `cause/effect/fix` payloads | UI never parses prose to determine state |
| CORE-04 | Content definitions | Data-driven room recipes, facility slots, flows, utilities, quality, wear, hazards | A new module is primarily content plus a bounded behavior adapter |
| CORE-05 | Save/version spine | Migration helpers and defaults by subsystem | Old two-berth and scale saves load after every package |
| INV-01 | Inventory contract | Typed item metadata, compatible storage, lot allocation, reservations, transfer orders | Food and facility lanes can add commodities without duplicating item lists |
| PERF-01 | Runtime budgets | Profiling counters and caches for providers, paths, networks, jobs, and render batches | Budget visible at 1x/2x/4x with scale save |

Suggested ownership boundaries:

```text
src/sim/facilities/       facility definitions, slots, sessions
src/sim/inventory/        item nodes, reservations, orders, transfers
src/sim/schedules/        watches, service hours, demand waves
src/sim/utilities/        graph runtime and network diagnostics
src/sim/condition/        wear, faults, hazards, repair
src/sim/economy/          ledger, rating offers, contracts, loans, leases
src/sim/events/           forecast, impact, response, recovery
src/sim/actors/           role-specific intent adapters
src/render/presentation/  world indicators and effects
```

`sim.ts` should remain the tick coordinator during migration. Only the
integration owner changes shared public types and wires completed packages into
that coordinator.

Shared contracts to freeze before feature fan-out:

```ts
FacilityDefinition
FacilitySession
FacilityReadiness
ItemDefinition
StorageDefinition
InventoryLotAllocation
TransferOrder
UtilityComponentDiagnostic
ConditionState
StationHazardEvent
OperatingSchedule
EconomicEvent
ObjectivePredicate
RewardBundle
RatingBenefitDefinition
DevelopmentProgramState
LoanAccount
StationValuationSnapshot
BusinessSite
BusinessOperator
LeaseAgreement
EmploymentAssignment
```

`ObjectivePredicate` should be shared by grants, milestones, progression, and
achievements. `RewardBundle` should support credits, inventory, unlocks,
relationships, and temporary terms. `BusinessSite` should refer to a stable
room-cluster anchor plus readiness, while `InventoryLotAllocation` should allow
one cargo lot to occupy multiple physical nodes.

### Epoch 1: The Physical Small Station

These packages can fan out after CORE-02 through CORE-04 and INV-01 stabilize.

| ID | Agent lane | Dependencies | Main output | Required world proof |
|---|---|---|---|---|
| SUPPLY-01 | Starter food procurement | INV-01, existing port/cargo contracts | order, supplier ship, receiving buffer, raw-food cold storage | ordered food enters through a Dock/Berth and is physically hauled |
| FOOD-01 | Food plant | CORE-02/04, INV-01, SUPPLY-01 | Fridge, Prep, Stove, wash, tray, Cook posts | visible stock and trays moving through each stage |
| MEAL-01 | Cafeteria service | CORE-02, FOOD-01 interface | queue, serving, four-seat tables, eating, tray return, Steward | a meal wave visibly forms and drains |
| HYG-01 | Fixture use | CORE-02/04 | stable Toilet/Shower/Sink sessions and real dwell | actors stop target thrashing and fixtures show occupancy |
| REST-01 | Quarters | CORE-02, OPS-01 interface | assigned Bed/Bunk slots, sleep, lockers, recovery quality | an off-duty cohort sleeps and returns recovered |
| LEIS-01 | Leisure | CORE-02/04 | distinct Couch/Game/Rec/Bench sessions and preferences | different modules produce different visible activities |
| CANT-01 | Cantina | CORE-02/04, INV-01 | staffed drink pickup, seats, repeats, stock, disorder | bar service and seating are separate bottlenecks |
| UI-01 | Facility presentation | CORE-03 | occupancy, stock, operator, closed/faulted states | no debug overlay needed to identify bottleneck |
| ART-01 | Facility art | content specs from lanes | missing modules, occupancy anchors, wear/fault states | artwork and simulated slots agree |

Integration milestone **M1 - Working Shift**:

- the starter food buffer runs down and a physical supplier delivery replenishes
  the Kitchen through receiving and cold storage;
- one operating period moves crew through posts, meals, hygiene, rest, and
  leisure;
- every occupied module has one exclusive user per authored slot;
- a small station is viable but an overlapping traffic bank creates a visible
  capacity decision;
- no global needs counter is the primary way to diagnose the station.

### Epoch 2: Schedules, Supplies, And Utilities

| ID | Agent lane | Dependencies | Main output | Required world proof |
|---|---|---|---|---|
| OPS-01 | Watch rhythm | CORE-02/03 | handover, traffic, break, maintenance, recovery phases | people and workplace coverage visibly change by phase |
| OPS-02 | Schedule UI | OPS-01 | compact watch bands, facility hours, break staggering | player fixes uncovered service without a staffing stepper |
| LOG-01 | Internal logistics | INV-01, CORE-02 | Intake -> bulk -> local buffer -> consumer hauling | empty facility creates a visible restock job |
| LOG-02 | Specialized storage | INV-01/LOG-01 | cold, beverage, medical, parts, fuel, waste stores | wrong storage blocks or degrades the correct commodity |
| UTIL-01 | Shared network graph | CORE-01/03 | source/segment/switch/buffer/sink API | selected fixture traces to its source and limiter |
| UTIL-02 | Plumbing | UTIL-01, HYG-01, FOOD-01 | potable water, wastewater, drains, valves | a closed valve disables a known room; a drain clears water |
| UTIL-03 | Power districts | UTIL-01 | circuits, breakers, buffers, local brownouts | overload affects a district rather than a global percentage |
| UTIL-04 | Data/control | UTIL-01, SEC-01 interface | linked camera/gate/automation network | a severed link creates visible manual mode |
| UTIL-05 | Heat/coolant | UTIL-01, COND-01 | heat sources, cooling sinks, thermal overload | busy plant warms before it faults |

Integration milestone **M2 - Supplied Station**:

- food, drinks, medicine, cleaning supplies, and parts arrive through berths;
- Cargo Handlers move them to correct specialized storage and local buffers;
- distance and public-route crossings matter through actual hauling;
- a meal or bathroom can fail because of a visible supply/network bottleneck;
- the player can isolate and recover a local utility fault.

### Epoch 3: Condition, EVA, Security, And Resilience

| ID | Agent lane | Dependencies | Main output | Required world proof |
|---|---|---|---|---|
| COND-01 | Condition model | CORE-04, INV-01 | Maintained/Worn/Degraded/Faulted/Damaged | module appearance and throughput change at each state |
| MAINT-01 | Preventive maintenance | COND-01, OPS-01 | inspection, maintenance windows, parts, closure | planned work prevents a measured future fault |
| WORK-01 | Maintenance Workshop | INV-01, COND-01 | tools, parts fabrication, internal repair capacity | parts are produced/carried to a repair target |
| HAZ-01 | Fire/flood propagation | COND-01, UTIL-02/03 | local spread, damage, suppression, cleanup | water/fire visibly affects nearby tiles and modules |
| HAZ-02 | Hazard persistence | CORE-05, HAZ-01 | save/remap active fire, flood, breach, and event targets | reload/expansion preserves the active hazard correctly |
| BUILD-01 | Physical construction | CORE-02, INV-01 | make blueprint/material/build jobs the normal path | ordinary build tools create staffed, supplied sites |
| BUILD-02 | Fast construction options | BUILD-01, ECO-01 interface | prefabrication and outside contractor modes | player trades cost/control for less disruption |
| EVA-01 | EVA capability | CORE-02, COND-01 | airlock, suits, exterior jobs, oxygen abort/return/recovery | low-oxygen worker safely suspends and returns |
| EVA-02 | Exterior construction | EVA-01, BUILD-01 | staged hull/exterior module construction | exterior project consumes materials and EVA time |
| EVT-01 | Event framework | CORE-03/05, COND-01 | saved forecast/preparation/impact/response/recovery | event has actionable warning and attributable damage |
| EVT-02 | Space weather | EVT-01, EVA-01, UTIL-03/05 | storm, flare, thermal and comms events | prepared and unprepared stations diverge visibly |
| EVT-03 | Breach recovery | EVT-02, HAZ-02, EVA-01 | evacuation, temporary patch, EVA repair, cleanup, restoration | one damaged wing can be fully recovered in world |
| SEC-01 | Physical security | CORE-02/03, OPS-01 | posts, patrols, monitors, Customs, Brig occupancy | guards move by schedule and resolve a physical incident |
| CRIME-01 | Opportunity and damage | SEC-01, COND-01, REP-01 | theft, vandalism, contraband, evidence | valuable weakly controlled areas produce legible risk |

Integration milestone **M3 - Resilient Port**:

- running equipment hard produces visible wear before failure;
- scheduled maintenance competes with traffic but reduces faults;
- one local fire/leak or external strike can close a wing without ending the
  station;
- EVA placement and spare-part storage materially affect repair time;
- security deployment changes by demand period and protects real targets.

### Epoch 4: Economy, Rating, Contracts, And Businesses

The economy lane can design data in parallel earlier, but it should not tune
prices until M1 and M2 establish real costs and throughput.

| ID | Agent lane | Dependencies | Main output | Required player decision |
|---|---|---|---|---|
| ECO-01 | Operating ledger | INV-01, OPS-01 | wages, overtime, consumables, utilities, repairs, revenue | identify which service or period makes/loses money |
| ECO-02 | Capital rebalance | ECO-01, construction costs | capital classes and expansion costs | choose one of several affordable next investments |
| REP-01 | Rating access | CORE-03, current rating | rating memory, demand bands, offer quality, terms | improve a concrete factor to attract a target market |
| REL-01 | Relationships | REP-01 | carrier/faction/supplier trust and renewal | protect or trade away a valuable relationship |
| CONTRACT-01 | Contract portfolio | ECO-01, REP-01 | grants, milestones, operating and capital contracts | opt into a self-chosen station direction |
| LOAN-01 | Credit | ECO-01/02, REP-01 | limit, interest, repayment, refinancing, default | finance expansion now versus preserve future cashflow |
| BUS-01 | Operating models | CORE-04, ECO-01 | station/concession/resident/contractor operator | choose control/margin versus labor relief |
| BUS-02 | Lease system | BUS-01, REP-01 | tenant offers, rent/share, SLA, hours, supply terms | select and place a tenant based on local demand |
| RES-01 | Resident enterprise | BUS-02, resident identities | proprietor applications, hiring, closure, local jobs | support a resident business or accept vacancy/turnover |
| UI-02 | Management surfaces | CORE-03, economic packages | rating, ledger, contract and lease views | plan without reading a spreadsheet wall |

Integration milestone **M4 - Self-Directed Economy**:

- two stations at the same population can pursue different identities;
- rating changes available traffic, tenants, supplier terms, and credit;
- the player selects optional funded projects rather than following a quest
  chain;
- at least one public room can be station-operated or leased with different
  economic and staffing consequences;
- one resident can visibly operate a small business that depends on footfall,
  stock, hours, and room quality.

### Epoch 5: Port Scale And Institutional Management

| ID | Agent lane | Dependencies | Main output | Scale payoff |
|---|---|---|---|---|
| PORT-01 | Turnaround services | LOG-01, OPS-01, COND-01 | parallel passenger/cargo/fuel/clean/repair workstreams | berth layout and staffing shape departure time |
| PORT-02 | Specialized berths | PORT-01, ECO-02 | passenger, cargo, fuel, military, overhaul facilities | large ships require purpose-built infrastructure |
| AUTO-01 | Earned logistics automation | LOG-01/02, offices | sorters, conveyors, stock policies | player automates routes already understood |
| MGMT-01 | Offices and policy | OPS-02, BUS/SEC/MAINT lanes | physical managers, policy ownership, reports | management tools have visible operators and limits |
| DIST-01 | District operation | MGMT-01, scale performance | supervisors, templates, budgets, service standards | hundreds of staff remain manageable without losing world detail |
| CAP-01 | Civic capital | ECO-02, REP-01 | large recreation, medical, residential, commercial projects | population creates neighborhoods and institutions |
| CAP-02 | Strategic capital | PORT-02, EVT-02 | military docks, overhaul yards, district plant | endgame scale adds new obligations, not only more income |
| PERF-02 | Large-station runtime | all simulation lanes | spatial caches, cadence tiers, batching, render interpolation | 150+ crew and visitors remain smooth at accelerated speed |

Integration milestone **M5 - Living Station**:

- 50 crew is an ordinary medium station, not a stress test;
- five to ten mixed berths create continuous but policy-managed traffic;
- residents, tenants, crew, and visitors use distinct but intersecting services;
- district managers reduce repetitive control while local failures remain
  inspectable;
- the player alternates between layout, operating policy, capital investment,
  and intervention in visible exceptions.

### Agent package template

Every delegated package should receive the same brief:

```text
Objective:
Player decision created:
Dependencies and interface version:
Owned files/directories:
Files the agent must not edit:
Save fields and migration:
Content/art required:
Normal-world feedback:
Overlay/inspector feedback:
Deterministic scenarios:
Ten-minute browser playtest:
Scale/performance budget:
Known deferred scope:
```

Each package should return:

- code and focused deterministic scenarios;
- save migration;
- generated or existing art integrated into the atlas when needed;
- a short design note explaining actual behavior and tuning constants;
- browser screenshots or a saved showcase station;
- discovered integration risks, without silently expanding its scope.

### Parallelization waves

Do not launch the whole corpus at once. Use these waves:

1. **Wave 0:** one integration agent on CORE-01 through CORE-05; one inventory
   agent on INV-01; one performance agent on PERF-01; one UI/art research agent
   defining presentation contracts. Freeze the facility, inventory, schedule,
   diagnostic, and save interfaces before feature fan-out.
2. **Wave 1:** Starter food procurement plus Food/Meal, Hygiene, Rest,
   Leisure/Cantina, and Watch Rhythm in separate modules against the frozen
   facility and inventory contracts.
3. **Wave 2:** Inventory/Logistics, Plumbing, Power, presentation, and focused
   balance/playtest agents.
4. **Wave 3:** Condition/Maintenance, EVA/Events, and Security/Crime against the
   frozen utility and condition contracts.
5. **Wave 4:** Economy/Rating/Contracts/Loans and Businesses/Residents, informed
   by measured operating costs from earlier waves.
6. **Wave 5:** Port specialization, offices/policies, districts, capital, and
   large-scale performance.

At the end of every wave, integrate into one branch, migrate the canonical
showcase save, play one full operating cycle, and correct the shared contracts
before starting the next wave.

### Integration gates

No wave is complete until:

- old and current showcase saves load;
- focused deterministic scenarios pass;
- a real browser playtest exercises the feature without diagnostic URL flags;
- normal-speed and accelerated movement remain smooth;
- actor/provider reservations have no leaks or duplicate users;
- UI panels fit the smallest supported viewport and can be hidden;
- the station has at least two valid responses to each new pressure;
- tuning does not restore a permanent profitable steady state after one build;
- no required system remains visible only as an obscure numeric menu.

### Scale architecture requirements

The depth pass must not multiply the current hot loops. Before increasing item,
network, wear, or actor counts:

- index ItemNodes by compatible storage class, item type, room/district, and
  available supply/capacity;
- cache open transfer quantities instead of rescanning every job and cargo lot;
- use a small candidate set before path validation, rather than testing every
  source/destination pair;
- cache utility components by topology/network version and reuse them for sim,
  rendering, hover, and inspectors;
- index condition/maintenance records by stable key;
- discover exterior maintenance targets when topology, modules, docks, or map
  conditions change, then accumulate wear on a coarse cadence;
- simulate perishability, spoilage, and cargo as aggregate lots with timestamps,
  never one entity per meal, bottle, crate, or tray;
- preserve batch hauling while rendering representative carried loads;
- update distant/idle actors and noncritical needs on tiered cadences;
- keep rendering interpolated at display cadence while simulation advances in
  deterministic fixed steps;
- pool world indicators, effects, and labels and cull them outside the viewport;
- add load counters for provider queries, paths, jobs, item pairs, network
  rebuilds, condition targets, simulation time, and render time.

Performance gates should use at least three canonical saves:

| Save | Population/traffic | Purpose |
|---|---|---|
| Starter shift | 8-15 crew, 1-3 berths | interaction correctness and clarity |
| Medium station | 50+ crew, 50+ visitors, 5-10 berths | desired ordinary play |
| Large station | 150+ crew, 200+ visitors, mixed strategic docks | endgame architecture budget |

No feature is accepted only because the starter save remains fast.

## Dependency Map

```text
physical use sessions
  -> food / hygiene / rest / leisure depth
  -> real peak capacity
  -> meaningful schedules and shifts
  -> fatigue, queues, stock, dirt, and wear pressure
  -> local faults and misconduct
  -> operational cascades

facility dependency data
  -> utilities and logistics
  -> room readiness and inspectors
  -> condition and repair
  -> capital infrastructure and automation
```

Security and economy can deepen in parallel after the shared facility contract,
but the cascade should wait until rooms can visibly break and recover.

## What Not To Build

- No new global +/- labor allocation panel.
- No individual chair spam for fifty-person rooms; use authored multi-seat
  tables, benches, bleachers, and audience fixtures.
- No module that only adds a hidden percentage.
- No room checklist whose requirements stop mattering once activation succeeds.
- No arbitrary random breakdown detached from use, wear, environment, or risk.
- No utility mechanic without an overlay and world failure presentation.
- No need that is only a speech bubble and a score drain.
- No schedule that changes eligibility without moving people and demand.
- No crisis that can only be solved through a modal dialog.
- No large catalogue implemented simultaneously before the shared contracts are
  proven in one vertical slice.

## Recommended Immediate Goal

The first implementation goal should be **Roadmap Chunk 1 - Living Station
Facilities**, preceded by the Wave 0 integration foundation. It includes Slices
1 through 4 in this order:

1. Kitchen, Cafeteria, and the narrow food-supply chain.
2. Lounge, recreation, Cantina, and differentiated population use.
3. Hygiene, plumbing, wastewater, leaks, and cleaning interaction.
4. Crew quarters, recovery, and visible watch rhythm.

Capital controls, growth finance, rating access, leases, broader contracts, and
large infrastructure remain explicitly deferred for the next design pass.

**Foundation checkpoint**

1. CORE-01 through CORE-05, INV-01, and PERF-01.
2. Frozen facility, inventory, schedule, diagnostic, save, and performance
   interfaces.
3. Existing saves load and existing facility behavior runs through compatibility
   adapters.

**Playable Chunk 1 checkpoints**

1. **Food:** SUPPLY-01 provides an initial food buffer plus physical
   replenishment from supplier ship
   to receiving buffer to cold storage. No teleported refills.
2. **Food service:** FOOD-01 and MEAL-01 provide Kitchen/Cafeteria production,
   tray flow, staffing,
   seats, and meal waves.
3. **Social life:** LEIS-01 and CANT-01 provide distinct comfort, recreation,
   social, wonder, drink, and exercise sessions with real occupancy and dwell.
4. **Hygiene:** HYG-01 and UTIL-02 provide stable physical Toilet/Shower/Sink
   sessions, potable water, wastewater, drains, valves, leaks, and cleanup.
5. **Recovery:** REST-01 provides assigned crew quarters, long recovery, and
   room quality effects.
6. **Rhythm:** OPS-01/02 provide visible watch handover, traffic, break,
   maintenance, and recovery
   rhythm with compact schedule controls.
7. **Presentation:** UI-01 and ART-01 provide world occupancy, stock, staffing,
   opening, utility, quality, and bottleneck
   presentation.

Chunk 1 turns the starter station into a real small institution and proves the
shared contracts. Broader procurement, additional specialized storage,
condition, rating benefits, tenants, contracts, capital controls, growth
finance, and EVA weather follow through later chunks.

The exit test is not a checklist of implemented classes. It is a ten-minute
play session in which the player:

- watches a handover and meal wave;
- orders food and sees it arrive, unload, and enter cold storage;
- diagnoses one kitchen or seating bottleneck in the world;
- watches visitors, residents, and crew choose and occupy different leisure
  activities;
- isolates or repairs one visible plumbing failure;
- sees crew use assigned beds and bathroom fixtures for meaningful sessions;
- changes a schedule, layout, staffing assignment, or facility capacity;
- sees that decision improve the next operating period.

## Research Notes

The comparison draws on the following Prison Architect references:

- The room system repeatedly combines minimum size, enclosure, and required
  objects. Office requires a desk, chair, and filing cabinet, while Canteen
  requires serving and seating objects: [Steam room guide](https://steamcommunity.com/sharedfiles/filedetails/?id=1153015858),
  [Canteen reference](https://prison-architect.fandom.com/wiki/Canteen).
- Kitchen links cookers, fridges, sinks, delivered ingredients, power, water,
  labor, and tray handling: [Kitchen guide](https://www.gamepressure.com/prisonarchitect/kitchen/z351e8),
  [Serving Table](https://prison-architect.fandom.com/wiki/Serving_Table).
- Regime periods create synchronized Eat, Work, Shower, Yard, Sleep, and Free
  Time behavior; deployment schedules move staff coverage by hour:
  [Regime](https://prison-architect.fandom.com/wiki/Regime),
  [Deployment](https://prison-architect.fandom.com/wiki/Deployment).
- Needs have explicit satisfaction actions and durations. Severe prisoner needs
  increase misconduct risk, while unmet staff needs reduce performance and
  morale: [Needs](https://prison-architect.fandom.com/wiki/Needs),
  [Staff Needs](https://prison-architect.fandom.com/wiki/Staff_Needs).
- Common Room and Canteen grading reward useful variety, capacity, size, meal
  policy, and comfort rather than a single room-presence flag:
  [Common Room](https://prison-architect.fandom.com/wiki/Common_Room),
  [Canteen](https://prison-architect.fandom.com/wiki/Canteen).
- Utilities combine generation capacity, local networks, direct connections,
  water pressure, valves, hot water, and control wiring. Water and electrical
  failures can interact: [Utilities](https://prison-architect.fandom.com/wiki/Utilities),
  [Fire](https://prison-architect.fandom.com/wiki/Fire).
- Security tools have physical and labor dependencies: cameras need power and
  monitored connections, deployment assigns staff to rooms/routes, and
  contraband is searched or intercepted: [CCTV](https://prison-architect.fandom.com/wiki/CCTV),
  [Contraband](https://prison-architect.fandom.com/wiki/Contraband).
- Grants provide capital for concrete projects, while finance tracks recurring
  wages, food, taxes, and other cashflow: [Grants](https://prison-architect.fandom.com/wiki/Grant),
  [Finance](https://prison-architect.fandom.com/wiki/Finance).

These references describe mechanics, not a requirement to reproduce their
exact balance. The station adaptation should preserve its port, hospitality,
crew, resident, and science-fiction identity.
