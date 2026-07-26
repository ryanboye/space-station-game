# Implementation Packages And Handoffs

Status: executable ordering guide

## Working Rules

- Branch from updated `main`.
- One package per branch unless the lead explicitly groups them.
- Do not run packages that edit the same core files in parallel.
- Preserve save compatibility and add defaults for every new field.
- Do not run the full test suite during ordinary iteration. Add and run focused checks;
  leave the full suite for an integration gate.
- Do not solve world-legibility problems by adding another permanent wide panel.
- Return changed files, focused checks, screenshots/playtest evidence, uncertainties and
  design conflicts.
- Stop and report when code contradicts a `00-shared-contracts.md` invariant.

## Gate 0: Truth Before Breadth

These packages are mandatory before portfolio expansion.

### TRUTH-01: Fresh Game Isolation

Source ticket: `../tickets/2026-07-25-opening-playtest/00-new-game-unlock-state-leaks.md`

Deliver:

- New Game resets progression, metrics, rating history, goals and scenario state;
- Continue and explicit save load preserve them;
- charter choice creates a genuinely new state;
- focused reload/new-game regression check.

Likely ownership: startup/save/progression state only. Do not rebalance content.

### TRUTH-02: Service Completion Integrity

Sources: tickets 07 and 13.

Deliver:

- one canonical completed-service event with population and facility identity;
- reports and goals consume that event;
- no room, queue, timeout or fallback grants completion;
- visitor goal excludes resident/crew meals;
- focused missing/blocked/full/success checks.

Likely ownership: `src/sim/types.ts`, `src/sim/sim.ts`, focused tests. Coordinate
before any other package editing actor service completion.

### TRUTH-03: Inventory And Meal Reconciliation

Sources: tickets 10 and the meal-drain reports.

Deliver:

- one derivable prepared-meal total from located nodes plus explicit compatibility;
- purchase explains cost, destination, capacity and failure;
- multiple Serving Stations cannot duplicate consumption or drain stock;
- clean-tray, serving and seat blockers remain distinct;
- header, inspector, alert and save/load agree.

### TRUTH-04: Economy And Settlement Reconciliation

Source: ticket 09.

Deliver:

- every major credit mutation emits a categorized economy event;
- ship payout is based on completed physical work and explicit access/contract terms;
- failed promises reduce payment or add penalties visibly;
- no supplier delivery both grants inventory and earns revenue;
- ledger reconciles current credits over its represented window.

### TRUTH-05: Capacity And Diagnosis

Sources: tickets 01, 02 and 11.

Deliver:

- fixture reservations recover from blocked/stale actor states;
- rendered and simulated capacities agree;
- alerts open the relevant diagnosis/overlay;
- placement preview uses current room recipe and utility rules;
- inspector names the first real bottleneck.

Integration gate: replay the documented opening save and a clean start. No phantom
services, contradictory stock, impossible purchases or stuck fixture reservations.

## Gate 1: Player-Authored Pod Opening

Packages in this gate are sequential because they share `main.ts`, starter creation,
catalog presentation and traffic results.

### OPEN-01: Commercially Empty Starter

Contract: `01-player-authored-opening.md` Starter State.

Deliver:

- safe shared infrastructure and two Pod Docks;
- one supplier-capable Freight Locker;
- no completed portfolio business;
- full opening crew needs and adequate survival buffer;
- authored expansion edges;
- reset-safe cold-start scenario and starter-editor compatibility.

Acceptance: pressing Play without building is safe briefly but produces only meager
access income and visible missed demand.

### OPEN-02: Demand And Missed Opportunity

Deliver:

- pod demand sampled across food, supplies and ship service;
- arrival/current/result chip beside physical dock;
- explicit completed and missed services with estimated value;
- bounded recent-demand aggregation for catalog context;
- no manifest approval interaction.

Acceptance: after two waves the player can identify the three opening opportunities
without opening a metrics panel.

### OPEN-03: Recipe-Oriented Build Catalog

Deliver:

- catalog groups: Feed Travelers, Sell Supplies, Service Ships;
- compact recipe preview with cost, footprint, utilities, staff and stock;
- every module remains individually placeable;
- future facilities remain visible with plain prerequisites;
- module move and 50% resale remain compatible.

This is not a one-click prefab builder unless separately approved. It is decision and
placement guidance for physical construction.

### OPEN-04: Opening Balance Pass

Deliver:

- starting cash supports one complete recipe plus contingency;
- access fees cannot finance growth efficiently by themselves;
- three portfolio runs reach modest positive operation in comparable time;
- charter modifiers create different best opportunities without invalidating a path;
- economy constants documented in one balance location.

Acceptance: three clean playthroughs defined by `01-player-authored-opening.md`.

## Gate 2: Complete The Three Opening Businesses

These packages may be developed in separate worktrees only when file ownership is
made disjoint first. All currently converge in `src/sim/sim.ts`, so default to serial.

### HOSP-01: Cafeteria Session Integrity

Contract: `02-hospitality-and-tourism.md` H1.

Deliver exclusive pickup and table slots, real eating dwell, one-meal consumption,
dirty-tray production, clear blockers and capacity inspector.

### TRADE-01: Shop And Supplier Flow

Contract: `03-trade-and-logistics.md` T1.

Deliver physical supplier lot, hauling to stall, sale session, margin accounting,
price policy effects and restock diagnosis.

### ENG-01: Pod Fuel Operation

Contract: `04-engineering-and-ship-services.md` E1.

Deliver tank reservation, fuel pipe connectivity, transfer progress, tank gauge,
cost basis, blocked reasons and dock result.

### ENG-02: Pod Repair Operation

Contract: E2. Add only Diagnostic Console, Parts Cabinet and Tool Crib initially.
Reuse current Workbench, Maintenance Socket, roles, item jobs, wear and EVA.

Integration gate: hospitality, retail, fuel and repair can operate simultaneously;
each consumes its own physical capacity and stock and creates distinct world results.

## Gate 3: First Capital Expansion

### PORT-01: Honest Medium Berth

Sources: `../35-port-infrastructure-evolution.md`, opening ticket 08.

Deliver:

- solid rectangular Berth floor, hull on three sides, one edge open to space;
- strict geometry and station-side access validation;
- Control, two clamps and role-specific equipment;
- tiny ships never use berths; medium/large ships never use Pod Docks;
- no fresh berth receives legacy hardware compatibility;
- world placement diagnosis and capital total;
- contracts/Approach Control appear only when a functional berth exists.

### PORT-02: Capital Choice Presentation

Present at least four competing projects through the ordinary build catalog and world
demand, not one-off `Fund Project` entities:

- medium passenger berth;
- production kitchen/expanded hospitality;
- warehouse/cargo terminal seed;
- fuel/repair yard;
- tenant commercial shell where affordable.

Rating and relationships affect traffic/offers/terms. Credits and physical requirements
remain the primary gates.

### TENANT-01: Commercial Transition

Source: opening ticket 12 and shared operating model C4.

Deliver offer comparison, procedural fit-out preview, explicit supplied staff/stock,
rent/revenue share, real service events and clear opening/closure states. Preserve the
current cantina, restaurant, market and gift-shop templates.

Integration gate: player can invest pod profits in diversification or save for a berth;
the berth creates a larger demand wave and new obligations, not automatic profit.

## Gate 4: Operational Rhythm And Facility Depth

### HOSP-02: Production Kitchen

Implement the complete located chain in H2. Preserve the prepared-meal purchase bypass.
Add Cook production sessions and stage-specific inspector diagnostics.

### HOSP-03: Lounge And Cantina

Implement H3/H4: distinct leisure sessions, rendered capacity, dwell, beverage stock,
Steward service, repeat-drink limit, noise/dirt/disorder effects and population preference.

### TRADE-02: Storage Classes And Policy

Implement T3 for the initial six commodity families. Use batched inventory, not one
entity per item. Add local room inspector/menu, not a permanent global spreadsheet.

### OPS-01: Watches And Service Hours

Deliver physical workplace posts, three watch bands, facility hours, handover, break
staggering and named recall cost. UI should use a compact spatial schedule/deployment
view modeled on proven management-game interfaces.

### COND-01: Local Wear And Recovery

Generalize condition to high-load fixtures, add parts consumption, preventive work,
local throughput degradation and repair/replace/close choices.

Integration gate: two overlapping ships and a crew handover create visible pressure
that can be solved by capacity, schedule, stock, layout or outsourcing.

## Gate 5: Port Specialization

### TRADE-03: Cargo Terminal

Implement T4 with berth staging, Cargo Arm throughput, bonded freight and separated
station/consigned ownership.

### ENG-03: Berth Fuel Terminal

Implement E3 with tank farm, pipe/pump throughput, fire/isolation rules and carrier
fuel terms.

### ENG-04: Heavy Repair Yard

Implement E4 after PORT-01 and COND-01. Add Repair Gantry and multi-stage ship work;
do not add salvage until the yard is fun.

### SEC-01: Controlled Port Of Entry

Implement `06-strategic-and-emergency.md` G1 and physical security sessions.

Integration gate: purpose-built passenger, cargo, fuel and repair berths attract and
process different traffic through policy rather than repeated approval.

## Gate 6: Permanence

### RES-01: Physical Resident Homes

Implement `07-residents-and-civic-life.md` R1/R2 using shared facility sessions.

### TENANT-02: Commuter Staff

Implement R3 with batched commuter arrivals and tenant service hours. No labor market.

### RES-02: Civic Economy

Implement rent, applications, vacancies, local spending, quality and move-out pressure.
Add no new civic room unless it produces a physical resident routine.

Integration gate: residents are optional, physically live in the station, and create
stable value plus 24-hour obligations.

## Gate 7: New Portfolios

### SCI-01: Observation Station

Implement `05-science-and-exploration.md` S1 with Scientist role, timed opportunity,
instrument session and attributable result.

### SCI-02: Sample Laboratory

Implement S2 and two program families only after SCI-01 validates the economy.

### STRAT-01: Emergency Readiness

Implement `06-strategic-and-emergency.md` G2 using existing Clinic, EVA, fuel, repair,
traffic and event systems.

### STRAT-02: Strategic Berth

Implement G4 only after ordinary specialized berths and readiness are stable.

## Integration And Scale Gates

Run focused checks throughout. Run the full suite only at a deliberate integration
gate or before merging a broad program wave.

Required playtest scales:

| Scale | Target | Purpose |
|---|---|---|
| Opening | 4-10 crew, 2-4 Pod Docks | choice, truth and legibility |
| Small port | 10-25 crew, 1-3 berths | physical operations and shift pressure |
| Medium station | 50+ crew/visitors, 5-10 mixed berths | ordinary target performance and policy |
| Large station | 150+ crew, 200+ visitors, strategic/civic districts | endgame architecture and automation |

Every gate return should state:

- exact commit(s) and changed files;
- focused checks run and results;
- save migrations added;
- screenshots or playtest flow performed;
- observed balance values;
- unresolved defects or design conflicts;
- next package now unblocked.
