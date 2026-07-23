# Simulation Domain Refactor Recommendation

## Recommendation

Refactor the simulation with a gradual strangler pattern. Keep `StationState`
flat and save-compatible at first, extract shared simulation services before
extracting feature domains, and turn `sim.ts` into a coordinator and public
compatibility facade rather than attempting a single large rewrite.

The goal is not merely to produce smaller files. The goal is to create real
ownership boundaries so food, hygiene, life support, security, berthing, and
mechanics can gain depth in parallel without competing inside one 21,000-line
simulation file.

## Current Problem

`src/sim/sim.ts` currently owns or coordinates:

- food production, stock movement, meal service, and cafeteria queues;
- crew, visitor, and resident state machines;
- plumbing, sanitation, pressurization, oxygen exposure, and thermal state;
- security aura, theft, fights, trespass, dispatch, escort, and brig handling;
- traffic offers, ship arrival, docks, berths, cargo, fuel, and turnaround promises;
- maintenance debt, repair jobs, EVA work, and cargo-arm faults;
- pathfinding, occupancy, jobs, reservations, derived caches, metrics, and tick order.

The file is 21,000+ lines and `src/sim/types.ts` is roughly 2,700 lines. The
existing modules such as `commercial.ts`, `construction.ts`,
`dock-controls.ts`, and `utility-underlay.ts` are useful precedents, but many
of them still import back into `sim.ts`. They are file boundaries, not yet
ownership boundaries.

The most dangerous coupling is between domain rules and actor state machines.
Food code directly influences visitor, resident, and crew behavior. Security
directly changes actor paths. Berthing and mechanics share cargo, jobs, and
maintenance state. Extracting code by copying ranges out of `sim.ts` would
preserve these cycles and make parallel work unsafe.

## Architectural Rule

Domain modules may depend on core simulation services and shared types, but
they must not import `sim.ts`.

`sim.ts` should eventually contain only:

1. public compatibility exports;
2. the simulation coordinator;
3. cross-domain phase ordering;
4. final metric and event reconciliation.

The domains should communicate through narrow service interfaces and explicit
events, not by mutating each other's actor fields.

## Target Structure

```text
src/sim/
  core/
    topology.ts
    spatial-cache.ts
    path-service.ts
    inventory.ts
    jobs.ts
    reservations.ts
    actor-commands.ts
    events.ts

  domains/
    food/
      food-queries.ts
      food-inventory.ts
      food-production.ts
      food-jobs.ts
      food-service.ts
      food-diagnostics.ts

    hygiene/
      plumbing.ts
      fixtures.ts
      sanitation.ts
      hygiene-diagnostics.ts

    life-support/
      pressurization.ts
      air-quality.ts
      exposure.ts
      life-support-diagnostics.ts

    security/
      security-aura.ts
      incidents.ts
      dispatch.ts
      law-enforcement.ts
      security-diagnostics.ts

    port/
      traffic.ts
      docks.ts
      berths.ts
      turnaround.ts
      cargo-handling.ts

    maintenance/
      maintenance-debt.ts
      repair-jobs.ts
      eva-repair.ts

  actors/
    crew.ts
    visitors.ts
    residents.ts

  coordinator.ts
  sim.ts
  types.ts
```

This is a destination, not a requirement to create every file immediately.
The first slices should only create a boundary when it removes a real cycle or
gives a worker a clean ownership area.

## Shared Core Services

These should be extracted before parallel domain implementation:

### Topology service

Owns room clusters, module footprints, walkability, doors, berth geometry,
service anchors, and topology-version invalidation.

### Path service

Owns pathfinding, path caching, occupancy-aware routing, route intent, and
path diagnostics. Domains request paths; they do not implement alternate path
algorithms.

### Inventory service

Owns item nodes, stock transfer, item reservations, capacity, and inventory
diagnostics. The food and port domains should use the same inventory ledger.

### Job board

Owns job creation, assignment metadata, expiration, stall reasons, and job
history. Domain modules create typed jobs; crew scheduling decides who can
perform them.

### Reservation service

Owns exclusive use of serving positions, tables, toilets, showers, sinks,
beds, seats, and other fixtures. This is essential to prevent the current
class of “everyone targets the same tile” bugs.

### Actor command service

Owns route assignment, task acceptance, fixture arrival, timed use, completion,
failure, and retry commands. Actors remain responsible for their needs and
state machines; domains provide service availability and outcomes.

### Simulation events

Introduce explicit events such as:

- `MealServed`
- `FixtureReserved`
- `FixtureBlocked`
- `IncidentCreated`
- `IncidentResolved`
- `ShipDocked`
- `CargoMoved`
- `RepairCompleted`
- `UtilityFailure`

Events should initially be in-memory and diagnostic. They do not need to become
a full event-sourced save system.

## Domain Boundaries

### Food and cafeteria

Food owns the complete supply chain:

```text
raw food
  -> cold storage
  -> prep counter
  -> stove
  -> serving station
  -> table
  -> tray return
  -> dishwasher
```

It owns stock targets, production jobs, food reservations, service timing,
meal throughput, and food diagnostics.

It does not own visitor, resident, or crew state machines. Those actors ask for
food and receive a route, reservation, and service result.

The first food extraction must preserve both modes:

- purchased prepared meals for the early game;
- deeper kitchen and logistics production for later play.

Focused acceptance criteria:

- meals do not disappear without a valid consumer or transfer job;
- one serving station cannot admit overlapping users beyond its capacity;
- multiple serving stations distribute demand correctly;
- a served visitor or crew member reaches a table or valid eating state;
- clean trays return and can be washed into usable trays;
- blocked food routes expose a cause and recover after the obstruction clears;
- the existing starter and prepared-meal flow remain valid.

### Hygiene and life support

These should be separate domains sharing utility topology.

Hygiene owns plumbing readiness, water fixtures, toilet/shower/sink
reservations, sanitation dirt, cleaning jobs, and hygiene queues.

Life support owns pressurization, air ducts, oxygen quality, exposure,
health consequences, and air coverage diagnostics.

They should share a utility-network service but not share actor logic. A crew
member can request a bathroom fixture, while the life-support system determines
whether the room is survivable.

Focused acceptance criteria:

- fixture use requires a valid fixture reservation;
- disconnected or unpowered water fixtures explain why they fail;
- sanitation creates visible dirt and cleaning work;
- oxygen overlays and exposure consequences remain persistent and accurate;
- local low-air areas can be dangerous even when station-wide air is healthy;
- plumbing failures, floods, and repairs remain diagnosable.

### Security and law enforcement

Split security into four responsibilities:

- `security-aura.ts`: cameras, gates, guards, coverage, and suppression;
- `incidents.ts`: theft, fights, trespass, escalation, and incident memory;
- `dispatch.ts`: responder assignment, pathing, and response timing;
- `law-enforcement.ts`: escort, holding, brig, ejection, and resolution.

Security creates assignments and consequences. Actor code handles movement.
The security domain should never directly rewrite a resident or visitor's path
without going through actor commands.

Focused acceptance criteria:

- theft can create an incident without security coverage;
- security coverage changes detection and resolution odds;
- responders can be assigned, blocked, rerouted, and released;
- unresolved incidents create visible local consequences;
- brig and ejection behavior remain separate from incident detection.

### Berthing and mechanics

Berthing owns traffic offers, dock and berth eligibility, ship approach,
queueing, passenger disembarkation, turnaround promises, cargo demand, and
fuel demand.

Mechanics owns maintenance debt, module and hull wear, repair jobs, cargo-arm
faults, EVA repair, and dock service slowdowns.

The port domain may request mechanical service, but it should read maintenance
status through an interface rather than importing maintenance internals.

Focused acceptance criteria:

- tiny ships use small docks and cannot occupy large berths;
- berth capability and size checks remain deterministic and inspectable;
- cargo and passenger service can fail with a specific reason;
- wear increases under load and falls when repair work completes;
- mechanical faults create work rather than silently freezing ships;
- EVA repair remains a real operational path, not only a metric.

## Actor Refactor

Do not move actor state machines into the feature domains. After the service
interfaces stabilize, move them into `actors/crew.ts`, `actors/visitors.ts`,
and `actors/residents.ts`.

Each actor system should follow the same shape:

```text
read needs
  -> choose an intent
  -> request a domain service
  -> reserve a target
  -> route through PathService
  -> use the fixture or work post
  -> receive an outcome
  -> update actor needs and satisfaction
```

This is the cleanest way to stop feature domains from reaching into unrelated
actor fields and the cleanest way to make needs legible in the UI.

## Tick Coordinator

Preserve the current phase ordering while moving each phase behind an explicit
domain call:

```text
setup and caches
  -> traffic and offer updates
  -> domain job creation
  -> room utilities and resource production
  -> crew task execution
  -> residents and security
  -> visitors and hospitality
  -> sanitation and incidents
  -> releases and metrics
```

The coordinator should call functions such as:

```ts
food.updateJobs(context);
food.updateProduction(context);
food.updateService(context);
hygiene.update(context);
lifeSupport.update(context);
security.update(context);
port.update(context);
maintenance.update(context);
```

The exact order must be treated as a contract. A food refactor that moves meal
consumption before production, reservations, or crew execution can recreate
the current queue bugs even if each extracted function is locally correct.

## Parallel Worker Plan

Parallel implementation should begin only after the core service interfaces are
merged.

### Worker A: Food

Owns `src/sim/domains/food/**` and focused food scenarios. Must not touch actor
state machines or `coordinator.ts` except through a small integration patch.

### Worker B: Hygiene and life support

Owns `src/sim/domains/hygiene/**` and `src/sim/domains/life-support/**`.
Plumbing and air-network interfaces must be agreed before implementation.

### Worker C: Security

Owns `src/sim/domains/security/**`. Incident output should be expressed through
events and actor commands, not direct actor mutation.

### Worker D: Port and mechanics

Owns `src/sim/domains/port/**` and `src/sim/domains/maintenance/**`.
Berthing and maintenance may share ports, but neither worker should edit the
other domain's implementation.

### Review worker

Read-only review should inspect save compatibility, integration boundaries,
focused scenario coverage, and performance. It should return file references,
evidence, uncertainties, and recommended changes rather than editing shared
simulation code.

## Migration Sequence

1. Freeze current behavior with focused domain scenarios and a short phase-order
   contract.
2. Extract topology, path, inventory, jobs, and reservations.
3. Add domain interfaces and compatibility adapters inside `sim.ts`.
4. Extract food and cafeteria first because it is the highest-value visible
   failure point and exercises every shared service.
5. Extract hygiene and life support.
6. Extract security and incident response.
7. Extract port and mechanics.
8. Extract actor state machines once service contracts are stable.
9. Move save migration and diagnostics to domain-owned adapters.
10. Reduce `sim.ts` to coordinator, compatibility exports, and final metrics.

## Non-Goals

- Do not redesign the player-facing game loop during the first refactor.
- Do not convert the save format to nested domain state immediately.
- Do not introduce an event-sourced architecture.
- Do not duplicate `StationState` into separate domain copies.
- Do not allow workers to independently edit the central tick coordinator.
- Do not use file size alone as the success metric.

## Review Questions

The reviewer should challenge these points:

1. Are the proposed core services narrow enough, or are we creating a new
   god-object called `SimulationContext`?
2. Which domain owns reservations and fixture capacity: the domain or the core?
3. Are events necessary for every interaction, or only for cross-domain
   outcomes and diagnostics?
4. Can food production and hospitality be tested without constructing the full
   station and all actor systems?
5. Does keeping `StationState` flat for one migration stage create acceptable
   coupling, or should a domain namespace be introduced earlier?
6. Which parts of port turnaround belong to cargo logistics versus passenger
   hospitality?
7. Can the extracted domains preserve current performance budgets and cache
   invalidation behavior?

## Recommendation To Proceed

Approve the refactor as a staged platform project, beginning with the shared
core services and the food domain. Do not fan out four implementation workers
against the current `sim.ts`. Fan them out after the core contracts exist and
give each worker an exclusive directory, focused scenarios, and explicit rules
about what it cannot touch.

The success condition is not simply “the code is split.” It is that a worker can
add a food fixture, a bathroom fixture, a security response, or a berth service
without editing the entire simulation coordinator or accidentally changing an
unrelated actor state machine.
