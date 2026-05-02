# Simulation Next Phases

Last updated: 2026-05-02

This is the next design push after the current construction/EVA and wall-fixture work. The goal is to make the station feel like a real simulation in the Prison Architect / RimWorld / Space Haven family: people should have reasons to move, jobs should have concrete work sites, utility failures should be spatial and legible, and the system map should feed the station instead of living as a flavor modal.

Read this with `15-current-roadmap.md`, `20-station-layout-project-plans.md`, and the system docs before implementation.

## Current Read

The codebase has many good primitives already:

- Spatial path intents, route exposure, route-pressure diagnostics, and room environment scoring.
- Item nodes for food, trade goods, and materials.
- Expanded crew/visitor/resident needs with inspector readouts.
- Local air, life-support coverage, vents, maintenance debt, fire, extinguish jobs, repair jobs, construction sites, and EVA routing.
- A procedural system map with factions, planets, asteroid belts, and lane-sector traffic bias.

The weak point is that several systems still resolve as "a number changed" or "an actor stood in the correct room." The next phases should bias toward concrete interactions:

- A visitor chooses a venue, reserves a seat/object, walks there, uses it, pays/reacts, then leaves or chains to another venue.
- A kitchen issues batch demand, haulers move sensible batch sizes, cooks work at equipment, cafeteria stock refills from a buffer.
- A reactor, water pump, duct, vent, or panel has local coverage, load, health, and inspectable failure causes.
- A worker's job is visible as a task at a module or service tile, not just staffing by presence.
- The station map affects traffic, contracts, imports, hazards, and identity.

## Reference Lessons

These are not clone targets; they are design pressure tests.

| Reference | Useful lesson | Translation for this game |
|---|---|---|
| Space Haven official wiki: view modes show power, oxygen, CO2, smoke, vents, jobs, comfort, and room groups; crew priorities/schedules govern work and leisure. | Survival systems are understandable because each gas/power/job problem has a map view, and crew behavior is tied to schedules and task priorities. | Add utility overlays before strict networks. Show local power/water/air/smoke/fire load, available jobs, and provider queues. |
| Space Haven facilities/power docs: low-capacity power can be automatic through hull, high-capacity power needs nodes; life support consumes water/power and produces gases/comfort side effects. | The network is layered: forgiving basics plus spatial advanced distribution. | Keep baseline station power forgiving, then make high-load rooms require nearby panels/pumps/ducts with visible brownout/leak risk. |
| Prison Architect utilities/logistics wiki: utility overlays expose power/water pipes, switches, valves, direct connections, laundry/food distribution, and room quality. | The fun comes from explicit service territories and utility cutoffs, not only global stock. | Let players draw service districts: kitchen -> cafeteria, hydro -> kitchen, intake -> storage, laundry/sanitation later, plus valve/switch-style isolation. |
| RimWorld hauling/work wiki: hauling is automatic but obeys work priorities, stockpile filters, capacity, and proximity; builders can bring materials to their own work. | Logistics feels sane when stockpiles own intent and workers batch nearby work. | Replace one-unit trickle jobs with batched haul reservations, source/target priorities, and job merging near the worker route. |
| Songs of Syx citizens/workforce wiki: citizens have wants, needs, personalities, and jobs; employed people still pause to eat, drink, sleep, wash, use bathrooms, and relax; odd-jobbers cover unassigned work. | People feel alive because work is interrupted by life, and idle labor has a role. | Retire pure "staff a room by standing there" for most production. Use job roles, workplace tasks, and a generalist/odd-job pool for haul, clean, repair, build, and emergency response. |
| Operations research / multi-robot task allocation: task assignment is a formal optimization family; market/auction systems are widely used when tasks and agents change continuously. | We do not need to invent "who should do this job?" from scratch. | Use a scored job board with reservation, bidding, and bounded replans; reserve exact solvers for small static batches or diagnostics. |
| GOAP / HTN game-AI planning: planners are useful when behavior decomposes into reusable actions, but real-time games need caching, budget limits, and simple execution states. | Agent behavior should be modular, not a giant state-machine rewrite. | Use utility scoring for choosing desires, HTN-like task templates for common routines, and a small executor for primitive actions. |

Reference URLs:

- Space Haven menus and view modes: https://bugbyte.fi/spacehaven/wiki/index.php/Menus
- Space Haven facilities: https://bugbyte.fi/spacehaven/wiki/index.php/Facilities
- Space Haven power grid: https://bugbyte.fi/spacehaven/wiki/index.php/The_Power_Grid
- Prison Architect utilities: https://prison-architect.fandom.com/wiki/Utilities
- Prison Architect logistics: https://prison-architect.fandom.com/wiki/Logistics
- RimWorld hauling: https://rimworldwiki.com/wiki/Hauling
- RimWorld stockpiles: https://mail.rimworldwiki.com/wiki/Stockpile_zone
- Songs of Syx citizens: https://songsofsyx.com/wiki/index.php/Citizens
- Songs of Syx workforce: https://www.songsofsyx.com/wiki/index.php/Workforce
- Space Haven transfer/resource rules: https://bugbyte.fi/spacehaven/wiki/index.php/Transfer_%26_Resource_Rules
- Gerkey and Mataric, task-allocation taxonomy: https://journals.sagepub.com/doi/pdf/10.1177/0278364904045564
- Dias et al., market-based multirobot coordination: https://www.ri.cmu.edu/publications/market-based-multirobot-coordination-a-survey-and-analysis/
- Kuhn, Hungarian assignment method: https://cir.nii.ac.jp/crid/1360011145435838592
- Orkin, real-time planning in games: https://ocs.aaai.org/Library/AIIDE/2005/aiide05-018.php

## Solved-Problem Architecture Choices

The next implementation should deliberately borrow known patterns instead of inventing a bespoke colony-sim scheduler.

### Job assignment

Use a **central job board + local bidding** model.

Canonical shape:

1. Producers publish jobs with typed requirements:
   - work type, priority, deadline, location, service tile, batch size, required inputs, output target, hazard flags, allowed worker classes, and blocked reason.
2. Eligible workers compute a bid:
   - path cost + current assignment switch cost + worker priority/skill bias + urgency + route exposure + fatigue/need penalty + reservation conflicts.
3. The scheduler assigns a bounded number of jobs per tick:
   - greedy best-bid is enough for most dynamic work;
   - auction-style bidding handles decentralized feel and avoids global recomputation;
   - Hungarian/min-cost matching can be reserved for small static groups, debug comparisons, or "assign N idle workers to N urgent jobs" batches.
4. Assignment creates reservations:
   - worker reservation, source item reservation, target capacity reservation, service tile reservation, and optional seat/module reservation.
5. Jobs reprice or expire when facts change:
   - no path, source depleted, target full, worker need emergency, hazard, access rule change, or stale assignment.

Why this shape:

- MRTA literature treats worker-task matching as a solved optimization family, but full optimal assignment every frame is the wrong default for a changing station.
- Market/auction approaches are a good fit because jobs appear/disappear continuously and agents have local costs.
- The current sim already has path costs, job states, idle reasons, and reservations-adjacent concepts, so this can evolve incrementally.

Implementation guardrails:

- Do not let every actor scan every job every tick. Bucket jobs by type/room/priority and evaluate a capped candidate set.
- Cache path estimates briefly, but invalidate on topology/room/access versions.
- Make `blockedReason` first-class and player-facing.
- Keep emergency overrides explicit: fire, air, medical, security, construction breach.
- Add metrics for scheduler health: candidate jobs scanned, assignments made, average bid, stale jobs, blocked jobs by reason, average batch size.

### Agent behavior

Use **utility scoring + HTN-like task templates + a tiny executor**.

Do not build one mega state machine for every new need. The better pattern is:

- Utility/desire layer decides *what matters now*:
  - eat, toilet, wash, sleep, drink, socialize, shop, work, haul, repair, clean, flee, fight fire, seek air, exit station.
- Task template layer decomposes desire into steps:
  - `eat_meal`: reserve serving station -> walk -> acquire meal -> reserve seat -> walk -> sit/eat -> release/pay.
  - `cook_batch`: reserve stove -> reserve raw input -> haul or wait for input -> work -> reserve output -> produce.
  - `repair_panel`: reserve service tile -> walk -> work -> consume parts if needed -> clear warning.
- Primitive executor handles movement, waiting, work timer, item pickup/drop, module use, and failure recovery.

This gets most of the maintainability benefits of GOAP/HTN planning without making every visitor run a search planner. Use full planning only for rare, high-value flows later.

### Reservations

Reservations should be the core anti-bunching primitive.

Reserve these separately:

- actor-to-job;
- actor-to-provider;
- seat/use slot;
- service tile;
- item source amount;
- item target capacity;
- path/door only if hard conflicts become necessary later.

Every reservation needs an owner id, expiry, and release-on-failure path. Inspectors should show reservation and queue state.

### Stock, logistics, and production

Use **stockpile/resource-rule semantics**, not one-off route code.

Borrow the mature pattern from RimWorld/Space Haven:

- containers declare allowed item types;
- containers have min/desired/max targets;
- containers have priority;
- rules can be automatic or player-authored;
- producers and consumers interact with nearby buffers;
- haulers refill buffers while specialists keep working.

For this game:

- Stove wants rawMeal nearby and outputs meal locally.
- ServingStation wants a target meal count.
- GrowStation has a pickup threshold.
- Workshop/Market mirror the same pattern.
- Construction sites have staged material targets.

The food pipeline should become "keep these buffers healthy" instead of "spawn one transport job because this specific node is under 8."

### Utility networks

Use **layered service coverage** before strict pipes.

The proven sim-builder pattern is:

- basic service is forgiving and broad;
- advanced service is local/spatial;
- overlays explain coverage, pressure, load, and failure;
- valves/switches/dampers let the player isolate branches;
- direct connections are reserved for high-load or high-risk objects.

For the station:

- low-capacity hull service covers early lights/basic rooms;
- high-capacity panels/pumps/ducts cover production, life support, medical, command, large berths;
- local failure creates degraded output and jobs before catastrophic failure;
- fire/smoke/water/electric interactions create incidents only after the overlay and inspector can explain them.

### What not to do

- Do not add a new hand-written target picker for each need.
- Do not use permanent room staffing for production when a module-work task would explain the fiction better.
- Do not solve logistics as pairwise source-to-target hacks.
- Do not make strict utility pipes before the player has overlays and forgiving failure states.
- Do not optimize globally every frame. Use bounded local decisions, reservations, and periodic rebalance.

## Product Principles For The Next Push

1. **No invisible depth.** Every new simulated pressure needs an overlay, inspector row, alert, route, or job marker.
2. **Prefer local shortages over global punishment.** "This cafeteria serving station has 0 meals" beats "food is low."
3. **Actors should use objects, not rooms.** Rooms define context; modules and service tiles define interactions.
4. **Batch work where the player expects batching.** One meal per job is busywork for the sim and noisy for the player.
5. **Keep early systems forgiving.** Automatic hull power/air/water can carry T0/T1; advanced rooms create spatial utility demands.
6. **Give the player district tools before strict networks.** Soft service territories are easier to read than pipe spaghetti.
7. **Station identity should emerge from map traffic plus layout.** A trade lane should make the market, storage, docks, and contracts matter.

## Phase A - Living Agents and Object Use

Goal: make individuals visibly interact with the station.

Scope:

- Add a shared service-provider model for visitor, resident, and crew needs:
  - provider id, module id, service tile, capacity, queue size, reservation slots, current users, cooldown, and failure reason;
  - supported needs: meal, toilet, wash, sleep, drink, leisure, social, shop, wonder, safety, medical.
- Make common modules usable targets:
  - Table: reserve seat, sit/eat, release seat.
  - Bench/Couch: sit/rest/socialize.
  - VendingMachine: walk to machine, spend, snack/drink, generate trash chance.
  - BarCounter/Tap: order drink, wait, sit nearby if seating exists.
  - Sink/Shower/future Toilet: distinct hygiene/toilet actions.
  - GameStation/RecUnit/Telescope: visible dwell/action with rating or mood output.
- Add short activity states that render in the agent inspector and optionally as small thought/status badges:
  - "getting meal", "waiting for seat", "eating at table", "using vending", "chatting", "washing", "looking through telescope".
- Add anti-bunching through reservations and retarget cooldowns rather than repeated target picking.
- Let visitors chain 1-3 itinerary legs based on archetype and station offerings:
  - diner: meal -> maybe vending/cantina -> exit.
  - shopper: market -> meal or vending -> exit.
  - lounger: meal -> lounge/cantina/observatory -> exit.
  - rusher: one short stop -> exit.

Acceptance criteria:

- In a station with two cafeterias, visitors distribute across serving stations and tables.
- A visitor can enter, buy from a vending machine, sit on a bench/table, and leave with those actions visible in the inspector.
- Removing seats creates a clear "no seat/reservation" pressure instead of actors vibrating between targets.
- Crew self-care and visitor/resident services use comparable provider/reservation fields.

## Phase B - Work Model and Job Board v1

Goal: replace "staff rooms by standing there" with visible work tasks, while keeping critical console/security posts where standing makes sense.

Direction:

- Keep staffed-post mode for rooms where a person operating a console is the fiction:
  - Security, Brig, future Command, future Operations, future Weapons/Sensors.
- Convert production and service rooms to workplace tasks:
  - Hydroponics: tend grow station, harvest batch.
  - Kitchen: cook batch at stove.
  - Cafeteria: restock serving station, optionally wipe tables later.
  - Workshop: fabricate batch at workbench.
  - Reactor/LifeSupport: inspect/repair/tune equipment at service tile.
- Add `WorkTask` as a first-class job concept or fold it into `TransportJob` only if naming stays clear:
  - task type, target module/site, input reservation, output reservation, work duration, worker skill/role bias, priority, expiry, visible status.
- Add a job board view:
  - open jobs by type, blocked reason, assigned actor, source/target, age, priority.
- Add worker pools:
  - specialists later, but v1 can use priority weights: logistics, build, repair, clean, cook, grow, operate.
  - idle/low-priority crew are odd-jobbers for haul/build/clean/repair.

Acceptance criteria:

- Hydroponics and kitchen output requires periodic object work, not permanent room presence.
- Crew no longer walk to a kitchen simply to stand in it unless an actual stove/restock/cook task exists.
- The player can inspect why a production chain is blocked: no input, no output capacity, no worker, no path, no power/water/air, or reservation conflict.

## Phase C - Logistics and Supply Chain v1

Goal: make supply chains efficient, legible, and layout-sensitive.

Problems to solve:

- Food jobs currently tend toward tiny transfers: hydroponics -> kitchen rawMeal, then kitchen -> cafeteria meal, often one unit at a time.
- Job creators run every tick with independent caps, which can create noise without strategic clarity.
- Storage has capacity but not enough policy. The player needs to define "what belongs here" and "who serves whom."

Direction:

- Batch transport:
  - reserve up to carrier capacity or target free capacity;
  - minimum useful transfer size unless emergency;
  - merge nearby same-item jobs when one worker is already headed that way.
- Add stock targets per node/room:
  - serving station target meals;
  - stove raw buffer target;
  - grow station output pickup threshold;
  - market trade-good target;
  - construction material staging target.
- Add supply links/districts:
  - Hydroponics -> Kitchen.
  - Kitchen -> Cafeteria.
  - LogisticsStock -> Storage.
  - Storage -> Workshop/Construction.
  - Workshop -> Market.
  - Auto mode exists, but manual links let the player fix bad routing.
- Add stockpile priority/filter semantics:
  - item type allowed;
  - desired stock min/max;
  - priority normal/high/critical;
  - public vs service access cost.
- Add logistics metrics:
  - job-miles per minute;
  - average batch size;
  - time waiting for input/output;
  - top blocked chain.

Acceptance criteria:

- Food chain commonly moves batches, not single meals, when capacity exists.
- A cafeteria attached to a nearby kitchen is preferentially served by that kitchen.
- The route-pressure overlay and job board explain why a remote chain performs worse.

## Phase D - Utilities, Hazards, and Maintenance v1

Goal: make power, water, air, plumbing, and fire risk real spatial systems without burying the player in pipe drawing.

Layered model:

- **Baseline hull service:** low-load rooms receive forgiving default power/water/air if the station is sealed and connected.
- **High-load service:** reactors, life support, hydroponics, kitchen, workshop, clinic, command, and large berths need coverage from nearby panels/pumps/ducts/vents.
- **Isolation tools:** switches, valves, dampers, and fire doors can cut off a branch to contain incidents.

Power v1:

- Add electrical panel / conduit fixture coverage.
- Track local power load and brownout risk by room cluster.
- High-load modules request local high-capacity power.
- Brownout should degrade work speed/output and increase maintenance debt, not randomly hard-disable everything.

Water/plumbing v1:

- Add pump/tank/pipe/valve concept with forgiving radius.
- Sinks/showers/toilets, hydroponics, kitchen, life support, clinic, and sprinklers consume local water.
- Low pressure creates per-room warnings and failed hygiene/food/grow actions.
- Leaks create puddles, water loss, slip/electrical/fire risk, and repair jobs.

Air/ducting v1:

- Keep pressurization and local air.
- Add CO2/smoke/toxic/smell as optional scalars only if they get overlays and simple sources/sinks:
  - actors produce CO2/smell;
  - fire produces smoke;
  - scrubber/vent/duct clear or distribute.
- Vents/ducts should explain "this room is sealed but stale" versus "this room is leaking."

Fire/hazard v1:

- Fire risk from maintenance debt, kitchen load, electrical overload, and water/electric contact.
- Fire creates smoke and blocked tiles, damages modules, and can spread through rooms/vents if uncontrolled.
- Extinguishers/sprinklers reduce intensity; crew extinguisher jobs use service tiles and avoid unsafe routes.

Maintenance v1:

- Track module/fixture health, not only room-cluster debt for reactors/life support.
- Repair jobs should target panels, vents, pumps, conduits, and modules.
- Add preventive maintenance tasks during low load; skipped maintenance increases failure chance.

Acceptance criteria:

- A remote kitchen can show: local power low, water low, serving target empty, and top blocked reason.
- A valve/switch can isolate a damaged branch and change overlay/inspector output.
- A fire creates visible smoke/air consequences and a clear extinguish/repair sequence.

## Phase E - Access, Districts, and Route Control

Goal: turn the route-pressure overlay into a practical station-design tool.

Direction:

- Replace binary Public/Restricted with route policies:
  - public, resident, staff, logistics, hazardous, security, construction/EVA.
- Add door permissions or door modes:
  - public, staff-only, residents-only, service-only, emergency-open/closed.
- Add service corridors as a meaningful layout type:
  - logistics routes prefer them;
  - visitor status dislikes crossing them;
  - dirt/noise/fire risk can travel differently through them.
- Add district assignment:
  - room/service links for supply;
  - crew work zones;
  - visitor/resident allowed areas.

Acceptance criteria:

- The player can fix a bad route-pressure conflict with a policy/door/service-corridor change.
- Visitors do not casually cut through reactor/logistics space unless the station is physically designed that way.
- Logistics can still use soft fallbacks in emergencies instead of deadlocking the sim.

## Phase F - Sanitation and Everyday Decay

Goal: add mundane station upkeep that makes the place feel inhabited.

Scope:

- Dirt/trash accumulates from foot traffic, meals, vending, bathrooms, showers, hydroponics, and incidents.
- Janitor/cleaning jobs target dirty tiles/modules/rooms.
- Dirty rooms affect:
  - visitor status and spend;
  - resident comfort/satisfaction;
  - crew morale/work speed;
  - hygiene and food-safety risk.
- Add cleaning supplies as either abstract stock or item nodes later.

Acceptance criteria:

- Busy cafeterias and bathrooms visibly get dirty.
- A janitor/generalist cleans them through real jobs.
- Dirty public rooms show in overlay/inspector and feed rating/morale mildly.

## Phase G - Station Map, Contracts, and Identity

Goal: make the system map useful.

Current map reality:

- `state.system` has factions, planets, asteroid belts, and lane sectors.
- Lane sectors already bias ship-type traffic.
- The map modal is mostly descriptive: factions, planets, lanes, belts, and seed.

Next uses:

- Lane contracts:
  - trader guild wants market throughput/import/export;
  - industrial combine wants cargo/repair/refuel/material processing;
  - colonial authority wants housing, medical, safety, family/resident stability;
  - military bloc wants security, brig, command, incident response;
  - free port wants mixed services and fast dock turnaround;
  - pleasure syndicate wants cantina/lounge/observatory/high-status visitor routes.
- Resource imports:
  - metal belt lowers material price or spawns industrial haulers;
  - ice belt affects water/air/hydro contracts;
  - gas belt affects fuel/ducting/future refuel work.
- Traffic planning:
  - route volume per lane;
  - scheduled waves/contracts;
  - warnings about incoming large ships/patients/inspections.
- Reputation:
  - faction satisfaction changes ship mix, contract quality, incident risk, and prices.

Map UI upgrades:

- Click a lane to see demand forecast, dominant factions, expected ship mix, and active contracts.
- Click a faction to see relationship, preferred station identity, current satisfaction, and rewards.
- Click a belt/planet to show import/export/resource hooks.
- Add "why this ship arrived" to ship inspector: lane, faction, contract, traffic roll.

Acceptance criteria:

- The player can choose a station direction from map opportunities, not just build every room.
- Faction/lane data changes immediate station planning: dock orientation, berth capabilities, service mix, storage, security, and utility load.

## Suggested Implementation Order

1. **Provider/reservation kernel.** Build the shared object-use model, then migrate visitor seating, vending, crew toilet/drink/rest, and resident services.
2. **Batched logistics.** Fix food and material movement before adding more production load.
3. **Work tasks.** Move production rooms off passive staffing and onto visible object work.
4. **Utility coverage v1.** Add high-load power/water/duct fixtures with overlays and inspector readouts.
5. **Access/district tools.** Give players a way to solve the route and supply problems the deeper sim creates.
6. **Sanitation.** Add everyday decay once object-use and job dispatch can support it cleanly.
7. **Map contracts.** Make identity and traffic choices pull all those systems together.

## Open Design Questions

- Should crew have persistent specialties now, or stay generalist with priority weights until the work-task model stabilizes?
- Should toilets be a distinct module from Sink/Shower before the provider migration, or should Hygiene v1 continue to abstract toilet/wash into the existing room?
- Should utility networks be node-radius first, line/pipe later, or should pipes/conduits exist immediately as cheap visual path tools?
- How strict should visitor access be? Soft penalties preserve flow; hard permissions create clearer prison-builder logic but increase deadlock risk.
- Should the system map generate contracts passively from lanes, or should the player actively choose contracts from faction offers?
