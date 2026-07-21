# Crew Sustainability And Demand-Driven Hospitality

## Purpose

This slice turns the station's existing needs, furniture, traffic, and crew
systems into one visible continuous loop:

1. Traffic shaped by reputation, relationships, and location requests access.
2. Use Approach Control directly while the station is small, then configure
   admission policy for routine traffic while retaining manual overrides.
3. Decide which physical facilities, furniture capacity, and staffing to
   provide.
4. Watch people claim visible fixture and furniture positions and complete real
   interactions throughout a lively station.
5. Diagnose queues, missing providers, fatigue, morale, and missed service in
   the world and HUD.
6. Improve the station in response to rolling service and economic trends.

The player cannot choose all demand. Reputation changes the frequency, value,
expectations, and composition of traffic that wants to visit. Approach Control
remains an interesting early and occasional choice, especially during overload
or exceptional arrivals, but routine manifest approval is not the core repeated
loop.

Progression remains additive. Unlocks add new traffic profiles and better
facility choices; they do not replace this loop.

## Crew sustainability

A fresh station has eight crew, four double bunks, one locker, two toilets, one
shower, and one sink. This is functional but low quality.

- A `Bunk` is 2x1, exposes two physical sleep positions, and recovers energy
  slowly. It is the cheap capacity choice.
- A `Bed` is 2x1, exposes one sleep position, and recovers energy quickly. It is
  the quality choice.
- A `Locker` is optional. Lockers improve quarters quality instead of acting as
  an activation requirement.
- Dorm noise lowers quarters quality. Resting in better quarters improves
  morale; poor bunks can stabilize energy but are not ideal long-term housing.
- Toilets, sinks, showers, beds, and bunk positions are physical one-user
  targets. Painted room area never grants invisible capacity.
- Showers restore hygiene faster than sinks. Toilets handle the separate
  bladder need.

Each crew member owns a persistent-in-session morale value. Energy, hygiene,
bladder, thirst, local air, quarters quality, and missed pay pull morale toward
a target over time. Low morale reduces walking/work throughput. Sustained
critical needs or two missed payroll cycles create a visible 60-second
resignation notice. Restoring pay and morale can cancel the notice; otherwise
the crew member leaves the roster and releases jobs/reservations.

Player-facing surfaces include crew thoughts, per-person need and morale bars,
unpaid/resignation warnings, a HUD crew tooltip with sleep/payroll forecast,
the alert feed, and Dorm/Bathroom room summaries.

## Demand-driven hospitality

Every scheduled passenger offer may carry exact targets for:

- prepared meals
- cantina drinks
- lounge visits
- restroom visits
- wash visits
- premium comfort
- passengers returned before departure

The first authored passenger shuttle asks only for eight meals and five public
restroom visits. This teaches shared-fixture capacity before Lounge and Cantina
unlock. The later mixed trader combines meals, drinks, lounge use, restrooms,
and one premium-comfort visit.

At spawn, each passenger receives a deterministic ordered subset of the
manifest targets. Exactly the promised number of passengers are assigned each
service. A promise advances only when the matching physical interaction
finishes. Missing providers or occupied furniture cause the passenger to wait
and visibly ask for the facility before abandoning that leg; rolling service
quality and the quiet ship settlement retain the relevant capacity failure.

Routine ship outcomes do not interrupt play. While a ship is present, a compact
status strip beneath its world interface shows its identity and the most
important active pressure. At departure, that strip briefly becomes a result
chip with grade, net result, and primary success or failure, then fades. Full
details remain available in recent turnarounds.

## Module roles

| Room | Basic module | Upgrade/differentiation | Contract result |
|---|---|---|---|
| Cafeteria | Serving Station + Table | Each existing Table's four rendered seats are four reserved eating positions; more counters/tables increase throughput | Meal |
| Bathroom | Toilet | Sink is slow wash; Shower is fast wash; zoning controls visitor access | Restroom / Hygiene |
| Lounge | Couch or Bench | Multi-person couches/benches expose capacity matching their visible art; Game Station is premium and powered/noisy | Leisure / Comfort |
| Cantina | Bar Counter + shared seating | Each Tap shortens drink service by 28%; scalable benches/couches provide post-service dwell capacity | Drink |
| Observatory | Telescope | Long premium dwell and high appeal | Comfort |

Furniture capacity is derived from explicit visible usage positions. A Table
with four rendered chairs has capacity four. A scalable `Bench` should expose
six visible positions, and couches should expose the number their artwork can
honestly support. An individual Chair may remain available for detailed layouts,
but no service may require players to place dozens of individual chair modules;
a 50-100-person mess hall must be practical to furnish with tables and benches.

Approach Control previews targets and readiness when the player chooses to
inspect an arrival. At small scale the player may accept, hold, refuse, and
assign traffic manually. At larger scale, configurable policies handle routine
traffic by class, load, risk, berth capability, and readiness while preserving
manual review and overrides. Active ship strips show component progress.
Visitor inspectors show the full itinerary with completed and current steps.
World thoughts reveal current demand after the passenger has entered the
station, with a stronger complaint only after a provider or seat has been
missing for several seconds.

Tiny single-tile visitor pods use the small **Dock** tile exclusively. They
carry only a handful of visitors and are never eligible for a Berth. Medium and
large passenger, freight, and mixed ships use **Berths** and are never replaced
by tiny Dock pods. Traffic generation, assignment, policy, rendering, and
capacity calculations must preserve this distinction.

## Balance anchors

- Payroll: 1 credit per crew every 30 seconds.
- Resignation notice: 60 seconds; recovery requires no unpaid cycle and morale
  at or above 55.
- Critical unmet-needs strain: notice eligibility after 75 seconds below a
  critical need threshold.
- Bed recovery: approximately 23 energy/second at good quality.
- Bunk recovery: approximately 13 energy/second at starter quality.
- No sleep fixture: 0.4 energy/second emergency fallback.
- Bathroom fixtures: one actor per physical usage tile.
- Hospitality furniture: one actor per visible usage position; multi-person
  tables, benches, and couches expose several independently reserved positions.
- Cantina Tap: +28% drink throughput per nearby tap.

## Code map

- Data model: `src/sim/types.ts`
- Room/module balance: `src/sim/balance.ts`
- Starter station: `src/sim/initial-state.ts`
- Crew needs, morale, payroll, retention: `src/sim/sim.ts`
- Manifest creation, promises, passenger itineraries: `src/sim/sim.ts` and
  `src/sim/port-ops/content.ts`
- Inspectors: `src/sim/actor-inspectors.ts`
- Dispatch, alerts, room summaries: `src/main.ts`
- World thoughts and fixture rendering: `src/render/render.ts`
- Generated module art: `tools/sprites/curated/module_bunk.png`,
  `module_locker.png`, and `module_toilet.png`

## Invariants

- Do not count room tiles as service capacity. Capacity comes from visible
  module usage tiles and reservations.
- Count every rendered Table seat as real capacity. Keep furniture art, usage
  positions, and capacity data consistent.
- Do not require individual-chair spam. Large hospitality rooms must scale with
  multi-person tables, benches, and couches.
- Do not advance a hospitality promise when a passenger merely enters a room.
  Advance it only after the dwell/action completes.
- Do not trigger visitor complaints while passengers are still in a berth.
- Do not make routine manifest reading or approval mandatory. Approach Control
  supports early manual choice, later policy automation, and exceptional
  overrides while reputation and relationships continue to shape demand.
- Do not assign tiny single-tile pods to Berths or medium/large ships to Docks.
- Do not remove crew without releasing their jobs and reservations and updating
  role counts.
- Keep the starter hull enclosed. Dorm and Bathroom pods must have walls and a
  reachable door so pressure failure is not confused with a needs failure.
