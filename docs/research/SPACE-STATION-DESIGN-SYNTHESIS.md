# Space Station: Design Synthesis

## Executive judgment

The project is not short on systems. It is short on a **strategic generator**: something that continuously changes which systems matter, what inputs are available, and what kind of station is valuable.

Today the game is fundamentally a service-throughput builder. The player constructs a familiar food/service core, presses play, and the simulation converts predictable visitors into credits. Air, heat, sanitation, maintenance, crime, reputation, staffing, and logistics mostly behave as additive efficiency checks around that same solution. They make the optimal station more elaborate, but rarely make a different station correct.

The strongest direction is not “add more random events” or “randomize the hull.” It is to make the station the physical intersection of a changing orbital economy, a persistent population, and a dangerous environment:

> **Start as the operator of a failing orbital outpost. Decide which ships, industries, and people to serve. Physically rebuild the station around those commitments. Survive the operational consequences. Grow into the indispensable hub—and eventually the CEO—of a living solar-system economy.**

This preserves the existing foundations while giving them purpose. The station should not merely accommodate generic demand. The player chooses which demand to cultivate, inherits the residents and infrastructure created by those choices, and must react when the world changes.

## 1. What is actually in the game

The current foundation is unusually broad:

- Per-tile hull topology, rooms, doors, pressure, air quality, temperature, dirt, and utilities.
- Physical agents with needs, destinations, pathfinding, queues, congestion, reservations, and staffed posts.
- Visitors, residents, crew hiring, jobs, wages, reputation, crime, theft, sanitation, and commerce.
- Food production and service chains, storage and logistics, maintenance debt, fires, vacuum exposure, repairs, and EVA construction.
- Ship traffic, berths and docking filters, procedural factions, planets, lanes, belts, and incident memory.
- Expansion, unlock tiers, room recipes, modules, and an economy.

These are substantive simulation foundations, not fake UI. In particular, the topology, agent movement, atmosphere, fire, logistics, and docking systems are capable of supporting real spatial gameplay.

The current loop, however, is:

> Build hull/rooms/modules → automatic traffic arrives → visitors consume services → collect credits → add capacity and staff → satisfy fixed unlock predicates → repeat.

The day counter is largely cosmetic. There is no strategic cycle with a changing situation, no meaningful admission policy, no persistent population consequence, and no world state that regularly makes yesterday's station plan wrong.

## 2. Why it becomes formulaic

### The same run begins every time

The starter hull, reactor, life support, bridge, credits, and supplies are fixed. The seed changes the solar-system dressing and traffic details, but not the player's fundamental inputs or obligations.

### Rooms are fixed recipes

A cafeteria, kitchen, or hydroponics room has a minimum footprint and required objects. Once the player learns the efficient arrangement, context rarely changes its value. The simulation asks, “did you build the recipe?” more often than “which implementation makes sense here?”

### Progress is a single monotonic ladder

Unlocks reward accumulating the same capacities. There are few exclusive commitments and little path dependence. A decision generally delays or accelerates the inevitable build rather than changing what the station becomes.

### Demand is stable and fungible

Ships differ, but all traffic contributes to broadly compatible demand. Visitors and workers are mostly interchangeable units. Variance converges toward the same average, so the same balanced station wins.

### Problems are additive penalties

Maintenance, sanitation, theft, air, and incidents mostly subtract efficiency or resources. They do not usually alter the production function. Paying a tax is random noise; losing the only safe route between docks and life support is a new spatial problem.

### Space is soft rather than strategic

Distance and congestion matter, but their universal answer is “shorter routes, separate public and service traffic, add staff.” Blank cardinal expansion means there is little competition between sites with distinct properties.

### Interaction is observational

The player spends too much time reading panels, placing a known template, and watching credits accumulate. The web presentation reinforces that passivity: text selection, forms, buttons, and play/pause feel like operating a dashboard rather than handling a station.

## 3. What different simulation families are actually doing

| Family | Point | Core engagement | Why build **where** | What sets size/location | Minute-to-minute decisions | Replay generator |
|---|---|---|---|---|---|---|
| Throughput/tycoon (Anno, Factorio, many transport games) | Grow output and profit | Design flows and remove bottlenecks | Input/output distance, transport capacity, land value | Throughput ratios and network topology | Diagnose queues, reroute, expand capacity | Maps, resources, demand, production alternatives |
| Environmental survival (Oxygen Not Included) | Keep a fragile colony alive while scaling | Turn matter, heat, gases, and byproducts into engineered systems | Local material fields, gravity, temperature, pressure | Physical process requirements and waste | Inspect changing fields, isolate failures, tune machines | Generated geology and persistent physical consequences |
| Agent-story colony (RimWorld, Dwarf Fortress) | Keep a specific community alive and create stories | Manage heterogeneous people under changing threats | Terrain, resources, defense, travel, individual needs | Local conditions plus population capability | Reprioritize work, triage crises, exploit opportunities | Generated people/world plus state-aware incidents |
| Containment/institution (Prison Architect) | Build a system that controls risky human flows | Classification, scheduling, observation, security | Access control, chokepoints, visibility, separation | Population categories and security regime | Respond to needs, incidents, contraband, staffing | Unpredictable individuals acting inside designed constraints |
| Scenario survival city (Frostpunk) | Preserve society through escalating catastrophe | Make irreversible moral and resource tradeoffs | Heat radius, resource nodes, travel time | Crisis schedule, labor, scarce cores, heat | Reallocate labor, enact policy, answer emergencies | Escalation invalidates previous equilibrium |
| Large society/economy (Songs of Syx) | Grow a settlement into a civilization | Balance population groups, production, logistics, and institutions | Resources, transport, workforce distribution | Scale economics, class/species needs, supply chains | Adjust labor, imports, services, expansion | Population composition and regional economy |
| Mobile frontier colony (Space Haven, Stardeus) | Survive and grow while moving through hostile space | Choose destinations, salvage, redesign a finite vessel | Hull topology, hazards, salvage, tactical exposure | Available wrecks, crew, power, life support | Board, salvage, repair, ration, jump | Travel continually changes available inputs and risks |
| Constrained run builder (Against the Storm) | Solve a settlement under a specific generated context | Improvise a production graph from incomplete information | Resource patches, dangerous clearings, access routes | Biome, species, offered production options | Scout, commit labor, respond to newly revealed information | Partial information and mutually exclusive production options |
| City sandbox (Cities: Skylines) | Grow a functioning city and express a layout | Shape networks while managing service coverage and land use | Network access, pollution, desirability, terrain | Zoning demand and infrastructure economics | Repair traffic/service failures and expand | Maps and player-authored goals; weaker run drama |

The lesson is not to copy any single title. Strong colony games ensure that **the value of a building is state-dependent**. A room is good because of this terrain, these people, this hazard, this supply chain, and this moment—not because it is always the next item in a fixed ladder.

## 4. What the project could become

### Direction A: Orbital frontier station ecology — recommended

The station is a commercial and civic hub whose physical form emerges from the local solar-system economy.

Each run generates a combination of:

- Nearby extraction, agricultural, military, pilgrimage, refugee, or trade activity.
- Factions with incompatible laws, prices, security expectations, and relationships.
- Scarce imports and abundant exports.
- A small persistent starting population with skills, loyalties, needs, and limitations.
- A few pieces of inherited infrastructure whose value depends on the local economy.
- Environmental risks: debris lanes, radiation windows, unreliable reactor fuel, disease routes, piracy, or traffic surges.

The player does not pick “a mining card.” Miners and ore haulers physically request berths. Accepting them brings dirty freight, industrial demand, injuries, security problems, and profitable repair/fabrication work. Building for them attracts more of that economy. A refugee route creates immediate housing/food pressure but a future workforce and political identity. A pilgrimage route produces burst traffic and service revenue, but stresses sanitation and requires public-safe circulation.

The essential choice is:

> **Who does this station serve, and what physical/economic obligations does that create?**

This directly expresses the fantasy of becoming the CEO of an Expanse-style station. The player starts with improvised survival, develops a business model, becomes responsible for a community, and eventually arbitrates the economy and politics of the region.

### Direction B: Station disaster survival

Lean into atmosphere, heat, fire, maintenance, and topology. The station is a machine that is always close to failure. Pressure zones, redundant life support, evacuation routes, and repair access dominate play.

This would make the existing physical simulation central and could produce excellent minute-to-minute crises. But commerce, visitors, reputation, factions, and the CEO fantasy would become secondary. It risks becoming “Oxygen Not Included in space” rather than this game's own identity.

### Direction C: Storyteller station colony

Make residents deeply heterogeneous and persistent. Skills, grudges, loyalties, beliefs, health, relationships, and ambitions generate incidents and institutional needs. The station's design expresses social policy: segregation versus integration, security versus trust, luxury versus equality.

This gives strong stories and loss aversion, but it requires major agent, narrative, and UI investment. It is compatible with Direction A as a later layer, but too expensive to make the primary short-term pivot.

### Direction D: Pure station tycoon

Accept the current identity and deepen pricing, supply/demand, contracts, competition, and optimization. This is coherent and cheaper. It would improve the game for players who enjoy solving a stable machine, but it does not answer the owner's replayability complaint unless markets and inputs genuinely change production choices.

### Directions that would discard too much

- A mobile ship-combat game would abandon the station fantasy.
- A card/deck or detached contract menu would make world changes feel bolted on rather than simulated.
- Random blocked tiles or damaged starts alone change the opening route, then reconverge on the same food/service core.
- More flat room bonuses merely relocate the dominant layout.

## 5. Recommended core loop

### Strategic loop

1. **Read the orbit:** inspect incoming traffic, shortages, faction pressure, resident needs, and forecast hazards.
2. **Commit capacity:** admit, refuse, prioritize, or reroute physical ships and populations. Dock time, hull, labor, power, and safe volume are finite.
3. **Build the station around the commitment:** create rooms, circulation, utilities, containment, storage, and staffing appropriate to that economy.
4. **Operate under load:** ships dock, cargo and people move, queues form, residents work, services produce, and hazards propagate through the built station.
5. **Intervene:** redirect workers, quarantine rooms, change berth policy, isolate utilities, open emergency routes, ration services, or temporarily close a business.
6. **Absorb consequences:** accepted groups remain, industries alter traffic, factions remember choices, infrastructure incurs upkeep, and incidents leave scars.
7. **Expand influence:** use the resulting profit, population, and relationships to reach new markets and gain authority over the regional economy.

### Minute-to-minute loop

The game needs a live operations layer between construction decisions:

- A ship requests a berth with visible cargo, passengers, urgency, risk, and payment.
- The player assigns or refuses a berth, knowing what other traffic will be delayed.
- Freight and passengers physically enter; queues and contamination are visible in the world.
- A bottleneck or incident appears spatially, not only as a notification.
- The player acts directly on the station: reroute a door, assign a responder, isolate a room, alter a queue, prioritize a delivery, or suspend a module.
- The action produces immediate audiovisual feedback and a readable simulation response.

This is where the game becomes game-like. Construction remains deliberate, but operations create tempo and force the player to use the layout they designed.

## 6. Why placement, size, and location would matter

Placement should emerge from interacting constraints, not arbitrary adjacency bonuses.

### Docks and circulation

Passenger, bulk freight, hazardous cargo, refugees, and high-security traffic should create different flows. A mining dock near habitation shortens worker travel but spreads dirt/noise/injury traffic. A remote dock protects residents but costs conveyors, staff, pressure volume, and response time.

### Environment

Atmosphere, heat, smoke, radiation, contamination, and fire must propagate through connected spaces. Doors, pressure zones, redundant routes, and utility trunks become meaningful because they change failure behavior.

### Localized infrastructure

Power, cooling, storage, medical response, security, and logistics should have capacity and route constraints. A large centralized system is efficient but fragile; distributed systems cost more but preserve operation during isolation.

### Persistent populations

Residents need homes near their jobs and services, but incompatible populations or industries may create security, noise, pollution, cultural, or reputation costs. Admitting people changes future labor and demand rather than producing a one-time payout.

### Contextual room scale

Room size should follow throughput, staffing, storage, waste, and safety—not a minimum-tile recipe. A compact galley is enough for twelve residents; a passenger hub needs surge storage, multiple serving points, sanitation, and queue space. Oversizing wastes pressurized hull and labor; undersizing causes visible operational failures.

## 7. How randomness should work

Good randomness changes relationships; weak randomness changes numbers.

### Strong sources

- **Generated regional economy:** different goods, shortages, routes, and faction relationships make different businesses viable.
- **Persistent heterogeneous people:** skills, needs, loyalties, and limitations determine what the station can operate.
- **Physical traffic:** arrivals are visible commitments competing for finite berths, labor, storage, and life support.
- **Partial information:** long-range scans forecast probabilities, while docking or opening a sealed compartment reveals specifics.
- **State-aware incidents:** threats select exposed systems and exploit the current station rather than dealing generic damage.
- **Permanent consequences:** population, reputation, infrastructure, and altered trade flows preserve the history of decisions.

### Weak sources to avoid

- Random credit loss.
- Cosmetic procedural hulls.
- Temporary damage repaired back to baseline.
- Flat global modifiers.
- Event choices detached from the simulation.
- A different seed that averages into the same demand mix.

## 8. A large playable slice that tests the real hypothesis

Do not port the inherited-hull demo as the answer. Build one coherent **orbital frontier operations** slice using existing systems.

### Hypothesis

> If each run presents a different physical traffic economy, limited capacity, and persistent populations, and if accepted traffic creates spatially propagating operational consequences, players will construct different station programs and make meaningful live interventions instead of repeating one food-service template and watching credits accrue.

### Slice scope

Three generated regional contexts, not three blocked hulls:

1. **Belt transfer stop:** ore haulers, dust/industrial accidents, high freight value, limited food imports.
2. **Refugee corridor:** passenger surges, medical/housing pressure, low immediate revenue, valuable future labor.
3. **Faction border port:** inspections, smuggling/theft, incompatible ships, lucrative but risky trade.

For each run:

- Two useful inherited modules and one meaningful deficiency.
- Six to eight persistent residents with uneven skills.
- Four dock/traffic classes with finite berth time.
- Hard limits on power, safe hull volume, storage, and labor.
- One environmental propagation mechanic fully connected to rooms and doors.
- Direct berth admission and priority control.
- Direct emergency response: door/zone isolation, responder assignment, rerouting, shutdown.
- A 30–45 minute objective: become self-sustaining and establish one profitable specialization while maintaining resident survival and faction standing.

### Success criteria

Across at least six organic playthroughs:

- Different contexts produce different **room programs**, not merely different arrangements.
- At least one offered ship is refused or delayed for a reason the player can explain.
- At least one accepted group or industry changes later labor/demand.
- At least one incident is solved through station layout or live operations rather than paying a resource tax.
- The optimal first five rooms and expansion order do not repeat in more than half the runs.
- The player performs a meaningful intervention at least every 60–90 seconds while unpaused.
- Failures are visually traceable to world state.

If all contexts still converge on cafeteria → kitchen → grow room, the economy is not differentiated enough or food is acting as a universal gate. If decisions happen mainly in panels, the operational interaction model is still too abstract.

## 9. Presentation and interaction changes

The simulation should be operated through the world whenever possible.

- Clicking a dock should show the approaching ship, requested berth, cargo/passengers, hazard, and schedule in a compact diegetic panel.
- Queues, blocked cargo, bad air, heat, smoke, theft risk, and utility overload should be visible as overlays anchored to rooms and routes.
- Construction should have strong placement previews, snap feedback, construction animation, sound, and immediate before/after flow visualization.
- Emergency controls should live on doors, rooms, utilities, and agents—not in a remote event dialog.
- Text should be non-selectable during normal play; buttons should feel like controls, not form elements.
- Camera, hover, selection, alarm, docking, machinery, and construction feedback need tactile sound and motion.
- Pause should be a planning tool. Unpaused play should demand operations rather than merely accelerating income.

This is not cosmetic polish. It makes cause and effect legible enough for the player to learn and enjoy the simulation.

## 10. Development priorities

### Preserve

Topology, pathfinding, crowds, rooms, staffing, pressure/air/heat/fire, logistics, docking, residents, jobs, food, maintenance, reputation, crime, factions, and the system map.

### Rewire first

1. Replace generic automatic traffic with finite, physical, inspectable berth requests.
2. Make admission create persistent population/economic consequences.
3. Generate sharply different regional economies and scarcity profiles.
4. Connect one propagating hazard end-to-end to topology and direct player response.
5. Replace the fixed unlock ladder with capability/influence milestones arising from actual station operation.
6. Add world-first operational controls and feedback.

### Defer

Deep relationships, diplomacy, combat, dozens of industries, elaborate procedural hulls, and more additive subsystems. They cannot rescue an unproven loop.

## Bottom line

The foundations are strong enough. The game does not require a wholesale restart, but it does require a different organizing principle.

The station should be a **commitment engine**. Every accepted ship, industry, faction, and population should make something possible, consume scarce physical capacity, and create future obligations. The world must keep changing those opportunities, while the station remembers the player's choices in its layout, residents, infrastructure, and reputation.

That gives the player a reason to build something here, a reason to make it this large, a reason to act while the simulation runs, and a reason for the next station to be different.

## Research references

- RimWorld: https://rimworldgame.com/
- Oxygen Not Included: https://www.klei.com/games/oxygen-not-included
- Space Haven: https://bugbyte.fi/spacehaven/
- Space Haven systems wiki: https://bugbyte.fi/spacehaven/wiki/index.php/Menus
- Stardeus: https://stardeusgame.com/
- Against the Storm development notes: https://eremitegames.com/camps-update-1/
- Against the Storm species/production context: https://eremitegames.com/grace-of-the-harpies/
- Against the Storm glades: https://wiki.hoodedhorse.com/Against_the_Storm/Glades
- Frostpunk society systems: https://news.xbox.com/en-us/2019/10/11/frostpunk-society-system-available-today/
- Frostpunk 2: https://www.playstation.com/en-us/games/frostpunk-2/
- Dwarf Fortress embark/world variation: https://dwarffortresswiki.org/index.php/DF2014%3AEmbark_screen
- Dwarf Fortress aquifers: https://www.dwarffortresswiki.org/index.php/Aquifer
