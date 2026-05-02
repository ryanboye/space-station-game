# Station Layout Project Plans

Last updated: 2026-05-02

This file contains the active implementation packets for the MVP station-layout/simulation push. Historical packets that already landed have been removed or collapsed into the roadmap.

Read this with:

- `docs/15-current-roadmap.md` for product direction.
- `docs/21-agent-handoff-layout-sim.md` for latest handoff notes.
- `docs/22-simulation-next-phases.md` for the research-backed next simulation architecture.
- The relevant system docs before editing code.

## Current Design Rule

Do not add hidden simulation without a player-facing surface. Every new system should show up in at least one of:

- diagnostic overlay,
- room inspector,
- agent inspector,
- construction/site inspector,
- HUD/ops metric,
- route line or route-pressure heatmap,
- event log/alert.

## Current Code Reality

| System | State |
|---|---|
| Berths | Visitor/residential berths and capability modules exist. Approach clearance is still future work. |
| Pathing | Route intents exist for visitor, resident, crew, logistics, security, self-care, and construction. Route pressure overlay exists. |
| Zones | Public/restricted exists but is still blunt. Stronger access rules are future work. |
| Visitors | Meals, leisure/market preference, expanded auxiliary needs, route exposure, room environment penalties, patience/rating effects. Needs need balance tuning. |
| Residents | Hunger, energy, hygiene, social, safety, stress, satisfaction, leave intent, private housing, home ships. |
| Crew | Generalist crew with posts, logistics, rest, hygiene/toilet/leisure/social, repair/fire/construction jobs, and inspectors. Specialties are future work. |
| Utilities | Global resources plus local pressurization, local air, vents, fire, and life-support coverage diagnostics. Spatial power/water/ducting is future work. |
| Maintenance | Reactor/life-support debt exists, affects output, can ignite fires, and can be repaired by jobs. Dedicated mechanics are future work. |
| Construction | Interior and exterior blueprints, material delivery, build jobs, cancel tool, and EVA routing exist. Airlock and construction inspection polish is active. |
| Diagnostics | Air coverage, visitor status, resident comfort, service noise, maintenance, route pressure, keys, hover/readouts, and side inspectors exist. |

## Active Packet Sequence

1. **P0 - Construction/EVA Polish and Wall Fixtures**
2. **P1 - Provider/Reservation Kernel and Living Agent Actions**
3. **P2 - Batched Logistics and Stock Rules**
4. **P3 - Work Tasks and Job Board v1**
5. **P4 - Access, Districts, and Route-Control Gameplay**
6. **P5 - Electrical/Mechanical/Water Distribution v0**
7. **P6 - Janitor/Sanitation Loop**
8. **P7 - Command Center, System Map Contracts, and Station Identity**
9. **P8 - Incidents, Patients, and Dispatch**

P0 is the current implementation packet. It should leave the game easier to build in and easier to debug before deeper systems are added.

## Shared Handoff Rules

- Agents are not alone in the codebase. Do not revert unrelated edits.
- Check `git status --short` before modifying files.
- Keep PRs small. If a packet wants more than roughly 500 changed lines, split it.
- Prefer sim-side tests in `tools/sim-tests.ts`; run `npm run test:sim`.
- If touching UI or render, also run `npm run build`.
- If adding saved state fields, update `src/sim/save.ts` and add migration/defaults.
- If adding tile-index keyed state, update `expandMap` remapping.
- Preserve deterministic tests where possible.

---

# P0 - Construction/EVA Polish and Wall Fixtures

## Goal

Make construction feel like a real station operation instead of instant painting, and make utility fixtures physically legible. Crew should haul materials, build at the work site, use airlocks for exterior work, wear suits only while transitioning through/existing outside, and interact with wall-mounted fixtures from adjacent service tiles.

## Scope

Primary files:

- `src/sim/types.ts`
- `src/sim/balance.ts`
- `src/sim/sim.ts`
- `src/main.ts`
- `src/render/render.ts`
- `tools/sim-tests.ts`
- `docs/02-build-and-world.md`
- `docs/03-utilities.md`

## Requirements

- Wall-mounted fixture foundation:
  - support module definitions with `mount: "wall"`,
  - place vents, fire extinguishers, and wall lights on wall tiles,
  - require an adjacent walkable service tile,
  - center effects from the service side when appropriate,
  - let construction/repair jobs path to the service side, not the wall tile itself.
- EVA polish:
  - preserve airlock pressurization; an airlock is not a hole in the hull,
  - suit state should follow airlock/vacuum transitions, not assignment alone,
  - exterior build jobs should expose blocked state and access problems clearly,
  - cancel-build should remain drag-friendly and refund delivered materials.
- Player-facing surfaces:
  - visible airlock sprite/read as a thick technical hatch,
  - construction markers should distinguish material delivery, build work, EVA, and blocked states,
  - selection/inspector should explain blocked construction sites.

## Acceptance Criteria

- A vent placed on a valid wall projects air from its adjacent service tile.
- A fire extinguisher placed on a valid wall suppresses nearby utility fire.
- Wall-mounted modules cannot be placed on floors or isolated walls.
- Construction jobs for wall-mounted fixtures are reachable from adjacent floor/service tiles.
- Airlocks do not vent an otherwise sealed station.
- EVA suits are used for exterior/vacuum work, not simply because a job was assigned.
- `npm run test:sim` and `npm run build` pass.

---

# P1 - Provider/Reservation Kernel and Living Agent Actions

## Goal

Unify service use enough that crew, visitors, and residents can reserve concrete objects, queue sanely, and visibly interact with the station.

## Requirements

- Create shared helpers for service providers, reservations, queue pressure, and retarget cooldowns. See `22-simulation-next-phases.md` for the canonical shape.
- Providers should expose provider id, module id, service tile, capacity, queue size, reservation slots, current users, cooldown, and failure reason.
- Keep role-specific desire weights, but avoid separate incompatible systems for the same need.
- Add clear inspector strings for active desire, target, reservation, queue state, and failure reason.
- Add capacity guards that spread actors across toilets, showers, beds, seats, bars, markets, cafeterias, vending machines, benches/couches, and leisure modules.
- Make at least one visitor itinerary visibly object-based: walk in, use a vending machine or service counter, sit/eat/rest, then exit.
- Tune failure effects mildly at first: crew morale/work speed, visitor patience/rating/spend.

## Acceptance Criteria

- A balanced station distributes actors across multiple valid service points.
- Removing or isolating a service creates visible pressure, not task churn.
- Crew and visitors report comparable need/target/reservation fields in the inspector.
- A visitor can visibly reserve and use a concrete module such as a table, bench/couch, vending machine, or bar counter.

---

# P2 - Batched Logistics and Stock Rules

## Goal

Make food, material, and trade-good movement efficient and readable by using stock targets, reservations, and batch hauling rather than one-off source/target hacks.

## Requirements

- Add stock-rule semantics for item nodes/rooms: allowed item, min/desired/max target, priority, and blocked reason.
- Batch transport jobs by carrier capacity, source availability, and target free capacity.
- Add source item reservations and target capacity reservations.
- Add minimum useful transfer sizes except under emergency demand.
- Merge nearby same-item jobs when one worker is already headed through that route.
- Add automatic and future manual supply links: Hydroponics -> Kitchen, Kitchen -> Cafeteria, LogisticsStock -> Storage, Storage -> Workshop/Construction, Workshop -> Market.
- Surface logistics health: average batch size, job-miles/min, waiting-for-input, waiting-for-output, top blocked chain.

## Acceptance Criteria

- Food chain normally moves batches instead of single meals when capacity exists.
- A nearby kitchen preferentially serves its nearby cafeteria.
- The job board/inspector can explain food-chain blockage as no source, no capacity, no path, no worker, no power/water, or reservation conflict.

---

# P3 - Work Tasks and Job Board v1

## Goal

Replace passive production staffing with visible work tasks while preserving real posts for console/security fiction.

## Requirements

- Keep staffed-post semantics for Security, Brig, future Command/Ops, and other true operator consoles.
- Convert production/service rooms to module work tasks:
  - Hydroponics: tend/harvest grow station.
  - Kitchen: cook batch at stove.
  - Cafeteria: restock serving station.
  - Workshop: fabricate at workbench.
  - Reactor/LifeSupport: inspect/repair/tune at service tile.
- Add or formalize a job-board model with task type, target module/site, input/output reservations, duration, priority, worker bias, expiry, and blocked reason.
- Use bounded local bidding for assignment rather than every worker scanning every job every tick.
- Show open/blocked/assigned jobs in an ops view or inspector.

## Acceptance Criteria

- Crew do not walk to a production room merely to stand there unless a true post exists.
- Production output depends on concrete module work tasks.
- The player can inspect who is doing a task and why blocked tasks are blocked.

---

# P4 - Access, Districts, and Route-Control Gameplay

## Goal

Turn route pressure from a cool debug view into a practical layout game. The player should understand why a corridor is bad and have tools to solve it.

## Requirements

- Strengthen public/restricted semantics.
- Add clearer staff/service/visitor/resident route costs or permissions.
- Surface route conflicts in overlay keys, hover readouts, room inspectors, and rating/morale/stress drivers.
- Keep soft route costs as the default; deadlock only on true physical disconnection.

---

# P5 - Electrical/Mechanical/Water Distribution v0

## Goal

Make power, water, ducting, and utility maintenance spatial through layered coverage without turning the game into pipe spaghetti.

## Requirements

- Keep early low-load hull service forgiving.
- Add high-load coverage fixtures for advanced rooms: panels/conduits, pumps/pipes/valves, ducts/vents/dampers.
- Make mechanics repair wall-mounted systems from adjacent service tiles.
- Show coverage, load, pressure, bottlenecks, and failure causes through overlays and inspectors.
- Start with forgiving radii and simple networks; add strict routing only after overlays are clear.
- Include fire/smoke/water/electric interactions only when alerts and overlays can explain them.

## Acceptance Criteria

- A remote high-load room can show local power or water shortage independently of the global HUD.
- A switch/valve/damper-style fixture can isolate a branch or at least be represented in inspector/overlay state.
- Utility failures generate visible repair jobs at service tiles.

---

# P6 - Janitor/Sanitation Loop

## Goal

Add a daily station-life maintenance loop that makes public areas, kitchens, bathrooms, showers, and dorms visibly degrade and recover.

## Requirements

- Track room dirt/trash/sanitation pressure.
- Add janitor or cleaning job assignment.
- Make dirty rooms affect visitor status, resident comfort, hygiene, and food/public rating.
- Surface dirt in room inspectors and a future sanitation overlay.

---

# P7 - Command Center, System Map Contracts, and Station Identity

## Goal

Make the station feel operated, not just built. A cockpit/command center should anchor ship traffic, alerts, dispatch, sensors, policy, contracts, and station identity.

## Requirements

- Add a Command/Cockpit room or module.
- Gate advanced ship traffic, dispatch, and incidents behind command capability.
- Show traffic/incident/alert state in Station Ops.
- Make the system map actionable: lane demand forecasts, faction offers, resource hooks, contract choices, and "why this ship arrived" context.
- Let station identity emerge from faction/lane contracts: trade hub, habitat, industrial, research, military/security, medical, leisure, or mixed.
- Keep early-game station building possible without too much ceremony.

---

# P8 - Incidents, Patients, and Dispatch

## Goal

Make advanced operations playable by reliably generating and resolving patients and dispatched incidents.

## Requirements

- Add event generation tuned by traffic, rating, hazards, and station identity.
- Route patients to medical service and incidents to dispatch/security/repair crews.
- Surface incident source, target, timer, and resolution state.
