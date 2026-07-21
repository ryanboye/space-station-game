# Operational Promise Core Loop

Status: product design authority. This document defines the game's primary loop and the scope of the next playable slice. It is not a second implementation roadmap. Existing roadmap work must be reconciled against this design before adding more systems.

Implementation goal: `docs/24-two-berth-shift-implementation-goal.md`

Last updated: 2026-07-20

## Decision

The game is a **spatial service-operations simulator**.

The player builds and runs an orbital port, influences the traffic it attracts, configures how that traffic is admitted, and changes the station when real operations expose a bad plan. The player does not choose every visitor who wants to arrive. Location, reputation, relationships, and the station's available services create demand; Approach Control gives the player limited control over how that demand enters the station.

The persistent loop is:

> Attract -> Configure -> Operate -> Diagnose -> Intervene -> Adapt

Individual ships still make concrete promises and produce outcomes, but reading manifests and approving arrivals is not the core repeated loop. Routine play centers on continuous in-world service, aggregate trends, and physical adaptation. Approach Control is a useful early and occasional decision surface that grows into configurable automation as traffic scales.

Progression adds leverage and new kinds of promises. It must not be responsible for making the underlying loop fun.

## Why The Current Game Is Not Yet Fun

The project contains an unusually broad horizontal slice of management-game systems:

- 20 playable room types and roughly 50 module types.
- 12 diagnostic overlay modes and seven utility-network layers.
- 24 staff roles, 12 departments, eight command specialties, and six work lanes.
- Visitors, residents, crew needs, production, hauling, maintenance, sanitation, thermal simulation, incidents, security, reputation, progression, traffic, cargo, and a system map.
- A very large metrics object, but only a small set of consequential player controls.

This is impressive simulation work, but it has created five design problems.

1. **The game has sensors without enough actuators.** Many systems end in a score, warning, overlay, or inspector row. The player mostly places a standard room set, starts time, and reads the result.
2. **Most traffic asks the same question.** Current offers vary ship type, quantities, cargo, passengers, and payout, but their service tags are mostly global room-presence checks. Once the standard rooms exist, accepting one ship is strategically similar to accepting another.
3. **Chains exist before their purpose does.** The Workshop -> Market chain moves `rawMaterial` into `tradeGood`, but neither endpoint creates a compelling choice on its own. The chain makes logistics busier without giving the player a reason to choose that business.
4. **Spatial rules point toward one solved layout.** Shortest paths, hidden environment traits, and route-exposure penalties reward clustering and separation, but offer few reasons to violate yesterday's optimum.
5. **Random failures add interruption rather than a new question.** A random corridor block or global brownout is not meaningfully connected to a visible vulnerable object or a decision the player made.

The current port-operations work is the right foundation. Traffic forecasts, Approach Control, berth assignment, manifests, physical cargo jobs, deadlines, settlement, local berth standing, and earned automation already approximate the desired loop. The next pass should deepen the continuous station operation around that foundation. Manual admission remains meaningful when the station is small or an arrival is exceptional, but it must not become paperwork repeated for every ship forever.

## Lessons From Comparable Games

No single reference game should be copied wholesale. Each family gets its replayability from a different source.

| Family | Examples | What generates decisions | What to borrow | What not to make primary |
|---|---|---|---|---|
| Spatial institution | Prison Architect, Two Point Hospital, Airport CEO | People must move through scheduled, capacity-limited services in a designed facility | Legible queues, rooms with concrete functions, staffing, regimes, contracts, operational incidents | A static checklist of required rooms |
| Production and logistics | Factorio, Anno, Workers & Resources, OpenTTD | Geography, throughput, recipes, and growing demand force network redesign | Physical goods, buffers, transport capacity, optional specialization | A mandatory universal production tree |
| Environmental engineering | Oxygen Not Included, Timberborn | Material physics, byproducts, and environmental cycles make yesterday's solution unstable | Causal failures and visible propagation | Seven early utility networks competing with the port fantasy |
| Agent story | RimWorld, Dwarf Fortress, Space Haven | Distinct people and a storyteller create memorable exceptions | Named crew, traits, injuries, exceptional incidents | Detailed individual simulation as the main control layer at city scale |
| City and political economy | SimCity, Cities: Skylines, Tropico, Songs of Syx | Land use, population groups, policy, budgets, and external demand change with scale | District identity, residents, class conflict, delegation | Starting at aggregate governance before the station is operationally interesting |
| Crisis cadence | Frostpunk, Against the Storm | Scarcity and periodic tests force reprioritization | Forecasted pressure and bounded shocks | Run resets, random card drafting, or crisis as the game's identity |

The closest structural match is **Prison Architect plus Airport CEO**, with Songs of Syx providing the scale transition. Prison Architect proves that rooms, schedules, staffing, and flows can make one institution spatially legible. Airport CEO makes external traffic and contracts the source of demand. Songs of Syx demonstrates that direct labor assignment can become aggregate workforce management as population grows.

The game should borrow RimWorld's causal storytelling only for exceptions and memory. It should borrow Oxygen Not Included's readable causality, not its survival-physics spine. It should borrow production chains only when the player chooses to become a producer.

## The Three Core Pressures

The starter loop should expose only three continuous pressures.

### 1. Flow

People and goods need to move between berths, services, and storage. Public passengers and freight carts can share space, but doing so creates visible congestion and service interference.

Flow is shown by actual actors, queues, crates, carts, blocked doors, and travel paths. It is not primarily a route-exposure score.

### 2. Capacity

Berths, counters, seats, cargo arms, staging areas, and storage have finite throughput and physical footprints. Capacity includes both processing rate and buffer space.

Furniture capacity must match what the player can see. A Cafeteria Table with four rendered seats provides four eating positions. A couch or bench provides several visible positions according to its art and balance data. Individual chairs may exist as a fine-grained option, but large facilities must be supportable with multi-person tables, benches, and couches; the player must never be required to place 50-100 individual chair modules.

Spare capacity is valuable because it absorbs variation. A room packed for maximum theoretical output should be brittle during a surge.

### 3. Labor

The player has fewer people than desirable tasks. Staff assigned to passenger service are not hauling freight or responding to a breakdown. Walking time makes a temporary reassignment costly and visible.

At small scale, the player assigns people or shifts directly. At larger scale, the same pressure is controlled through staffing targets, priorities, supervisors, and budgets.

Maintenance, sanitation, security, and morale are not separate starter optimization games. They are **consequences and exceptions** produced by these three pressures. For example, an overloaded cafeteria becomes dirty and eventually loses throughput; a crowded mixed corridor creates a theft opportunity; an overused cargo arm develops a fault.

## The Core Loop

### Attract

Traffic demand is generated by the station's location, overall reputation, service reputation, reliability, safety, carrier relationships, prices, and available facilities. The player can cultivate a market but cannot select every ship that wants to visit. A rough station may receive lower-value traffic that tolerates limited service but creates more mess, wear, or security pressure. A respected station attracts more lucrative traffic with higher expectations.

Approach Control presents the nearby traffic currently asking to enter. When inspected, each arrival states:

- Arrival window and hard departure time.
- Berth and capability requirements.
- Passenger profile and concrete service promises.
- Cargo ownership, quantity, destination, and required handling.
- Revenue by component and explicit penalties or forfeited bonuses.
- Known operational risks and the confidence of the forecast.

Early in the game, accepting, refusing, or holding one of a few arrivals is a useful manual choice because berth space and labor are scarce. The player is selecting among the demand that actually appeared, not drawing ideal customers from a menu. Refused or neglected traffic has a relationship and opportunity cost, so Approach Control is meaningful without becoming the whole game.

### Configure

The player changes the operating plan and, as the station grows, defines Approach Control policy:

- Assign or move crew between visible work lanes.
- Refill or reserve local buffers.
- Open, close, or repurpose service counters.
- Change a room, doorway, queue area, stock rule, or berth assignment.
- Delay a lower-priority job or leave spare capacity for uncertainty.
- Prefer or limit traffic classes, passenger loads, cargo loads, and risk levels.
- Set berth capabilities, readiness thresholds, holding-orbit limits, and overflow behavior.

Routine eligible traffic can then be admitted and assigned automatically. Manual review remains available for early play, overload, exceptional ships, emergencies, suspicious traffic, and deliberate overrides. Automation executes player policy; it does not erase the consequences of demand.

The useful question is not "did I build every room?" It is "what am I willing to leave thin for this shift?"

### Operate

Ships dock and the plan becomes physical. Passengers disembark, claim visible seats and fixtures, form queues, use services, and return. Cargo is inspected, staged, hauled, and loaded. Crew walk to posts and perform work. At healthy scale, multiple ships overlap and the station feels continuously occupied rather than waiting for the next approval dialog.

The player can understand the state by watching the station. Panels provide precision after the visual symptom is clear.

### Intervene

Unexpected demand, a bad route, a late crew member, a spill, a fault, or an incident creates a recoverable exception. The player responds with a small set of strong verbs:

- Reassign labor.
- Change priority.
- Open or close a route/service.
- Move stock or reserve a buffer.
- Dispatch a responder.
- Renegotiate, partially fulfill, or deliberately abandon a promise.

Intervention should change an outcome, not merely acknowledge an alert.

### Diagnose

The world communicates current pressure before a dashboard does. Queues, unavailable seats, dirt, wear, tired staff, blocked freight, and dissatisfied visitors are visible where they occur. Nearby room and berth summaries name the limiting capacity and its effect. Aggregate service, reliability, safety, reputation, and net-income trends show whether a local problem is becoming systemic.

### Settle And Adapt

Every ship leaves at its hard deadline. A failed job, blocked cargo node, or missing passenger must never pin a berth indefinitely. Settlement happens quietly during routine traffic and records each promised component separately:

- Berth fee.
- Passenger services and spending.
- Cargo handling and export fulfillment.
- Delay, damage, safety, or abandonment penalties.
- Relationship, reputation, and local berth-standing change.

Partial success is normal. A compact result chip appears beside the ship's Dock or Berth as it departs, showing the grade and the most important result, then fades. Detailed settlement remains available in the recent-turnaround log, but routine ships do not interrupt play with mandatory report screens.

The player responds to rolling outcomes by widening a corridor, moving storage, adding another multi-person table or bench, opening a second counter, hiring one more worker, changing admission policy, specializing a berth, or preserving more buffer. Incoming demand and overlapping operations prevent one room template from becoming a permanent solution.

## Minute-One Experience

The first validation slice is **The Two-Berth Shift**.

The player starts with an editable compact shell, two small berths, eight crew, enough credits for one meaningful expansion, prepared meals, and generous general storage. Only the following construction categories are visible:

- Berth and gangway.
- Public corridor and staff-only route.
- Cafeteria counter, seating, and local meal buffer.
- Cargo arm, intake staging, and general storage.
- Small crew support area.
- Doors, access control, and basic maintenance fixture.

Within the first minute, nearby traffic begins requesting approach clearance:

| Offer | Upside | Pressure | Spatial implication |
|---|---|---|---|
| Passenger shuttle | High service spend and relationship gain | Large short meal queue and strict return time | Short public route, enough queue floor, fast counter staffing |
| Freight relay | Strong handling fee and useful purchased stock | Heavy cart traffic, staging demand, sustained labor | Direct berth-to-storage route and buffer space |
| Mixed trader | Moderate passenger spend plus valuable outbound order | Public and freight flows overlap; theft or delay risk | Separation, customs, or deliberate acceptance of interference |

The player can safely admit one, stretch to admit two, and is likely to fail part of all three. This teaches Approach Control while the station is still small enough for individual ships to be legible. As traffic grows, the player converts those choices into policy and focuses on the station's live service conditions rather than approving every arrival.

Traffic uses two physically distinct interfaces:

- A **Dock** serves tiny, single-tile pods carrying only a handful of visitors. These pods may use Docks only and must never occupy a Berth.
- A **Berth** serves medium and large passenger, freight, and mixed ships. Berth traffic must never be visually substituted with a tiny Dock pod.

This distinction remains visible in traffic generation, eligibility checks, world presentation, capacity, and automation policy.

Prepared meals are purchased at first. A Kitchen later improves margins and resilience. Hydroponics later reduces dependence on suppliers. Neither is required to prove that passenger service is fun.

Likewise, Markets can begin as tenant-operated services with their own inventory. Workshops later let the station accept manufacturing, repair, or custom export promises. A Market must not require a Workshop, and a Workshop must not exist merely to keep a generic `tradeGood` number moving.

## Cargo And Material Semantics

The current generic material stream combines too many meanings. Replace it conceptually with three ownership classes, even if the implementation initially reuses item infrastructure.

1. **Station supplies** are deliberately purchased and owned by the station. They are consumed by maintenance, limited construction work, and optional production.
2. **Consigned freight** belongs to a contract. The player is paid to move it from an arriving ship to storage or another ship. It is not free inventory and does not need an artificial sink.
3. **Specialty inputs** exist only after the player chooses an industry. A workshop consumes named inputs for named orders, repairs, or station improvements.

Starter storage should provide operational slack, not act as a puzzle by itself. A target of roughly 280-400 units across general storage is appropriate for the first slice, enough to absorb several manifests while the player learns flow. Intake modules remain smaller staging buffers. Capacity pressure should come from concurrent promises and poor routing, not from every ship dumping free materials into a 40-unit pallet.

No accepted inbound cargo may exceed the capacity promised to it. Excess consigned freight stays aboard, is refused, or incurs a known overflow-handling choice. It never silently becomes station property and never blocks departure.

## Controlled Variance

The station should not be permanently solved, but randomness must change the question rather than invalidate the answer.

### Forecast variance

Ship type, size, passenger profile, cargo mix, arrival overlap, price, and faction vary. Reputation and relationships weight this demand without making it fully controllable. Policy handles routine known ranges; the player inspects uncertain or exceptional traffic when it matters. This changing traffic mixture is a primary source of replayability.

### Bounded execution variance

An offer may disclose a risk such as uncertain passenger count, fragile freight, a possible customs delay, or an unreliable arrival window. The range is visible. The player decides whether to reserve slack or gamble.

### Endogenous incidents

Incidents emerge from current conditions. Theft becomes possible where valuable freight, public traffic, and weak control overlap. Spills occur where overloaded food or cargo service is operating. Mechanical faults select heavily used, poorly maintained equipment.

Remove arbitrary global failure buckets from the core loop. A corridor should become blocked because a visible cart dropped freight there, not because a random effect selected a floor tile.

### Persistent memory

Factions, berths, districts, and named crew remember outcomes. This changes future offers and local behavior without resetting the station. A freight carrier may offer better work after reliable handling; a berth with repeated failures may attract only low-value traffic until repaired or rebranded.

## Spatial Design Rules

There will always be locally efficient layouts. The goal is not to prevent optimization; it is to make optimization conditional on the station's chosen business and current traffic.

Use these rules:

1. **Every spatial penalty has a visible carrier.** People queue, carts occupy corridor width, crates use floor staging, dirt accumulates, responders travel, and machines animate slower when impaired.
2. **Create competing adjacencies.** Passenger services want to be near berths and each other. Freight wants a direct route to storage. Both want the same scarce berth frontage and staff access.
3. **Make buffers physical.** Queue floor, staging floor, local stock, spare seats, and idle staff absorb surges but cost space and money.
4. **Make redesign costly but possible.** The player can improve a bad plan without restarting, but moving a live service temporarily reduces capacity.
5. **Let specialization change the optimum.** A tourist concourse, freight yard, residential quarter, and secure military berth should favor different geometry.
6. **Use local effects sparingly.** Noise, comfort, prestige, opacity, and route exposure matter only when the player can see the source and when they change a concrete offer or actor behavior.
7. **Count visible furniture honestly.** Rendered seats are real reserved usage positions. Prefer scalable tables, benches, and couches over individual-seat placement requirements.

## Player-Facing Feedback

The world is the first diagnostic surface.

| State | World presentation | Precision on selection |
|---|---|---|
| Passenger queue | People stand in a visible line; patience shifts from neutral to amber to red | `12 waiting / counter serves 4 per minute / ship leaves in 38s` |
| Cargo blockage | Crates or carts remain at the blocked source; destination flashes a capacity icon | `28 freight waiting / storage has 6 free / 2 haulers assigned` |
| Labor shortage | Work icons stack over modules; assigned crew route is visible | `Cargo needs 3 / assigned 1 / nearest relief 16s away` |
| Route conflict | Carts and passengers visibly slow one another; conflict tiles pulse only while active | `Shared traffic is costing about 9s this turnaround` |
| Equipment strain | Machine animation, sound, grime, and condition marker degrade locally | `Cargo arm 72% / fault risk rising under continuous use` |
| Promise risk | A compact ship-anchored strip beneath its Berth or Dock changes as the deadline approaches | `Meals 18/24, freight 32/48, return 10/12` |
| Departure result | A short grade/result chip appears beneath the ship's Berth or Dock and fades after departure | `Good · +84c · restroom capacity limited` |

Use one default **Operations View** for live flow, promises, and blockers. Specialist overlays should appear only when their associated system becomes a real player choice. Do not ask a new player to select among twelve diagnostic modes.

Alerts obey three rules:

- Alert only when the player can act.
- Click focuses the physical cause.
- Phrase the alert as symptom, cause, and remaining time.

Reputation is an active demand-shaping system, not the main explanation bus. Show the operational causes first: contract outcomes, queues, cleanliness, safety, cash flow, local standing, and a small number of persistent relationships. Overall reputation then summarizes recent service, reliability, and safety and influences the value, expectations, and composition of incoming traffic. The player can cultivate demand but cannot completely control it.

## Filter For Every System

Before keeping or adding a mechanic, answer all five questions:

1. Which promise, pressure, or exception does it change?
2. What can the player do about it before the outcome is fixed?
3. How does the player first see it in the world?
4. Why might two competent players make different choices?
5. What happens to this control when the station becomes ten times larger?

If the answers are "station rating," "read an overlay," "optimize the same ratio," or "keep doing it manually forever," the mechanic is not ready for the active loop.

## System Disposition

"Dormant" means hidden from the starter loop and preserved until a later slice proves it has a job. It does not require immediate code deletion.

| System | Disposition | Design job |
|---|---|---|
| Traffic demand, Approach Control, and admission policy | Core now | Generate partly uncontrollable demand; provide early manual choice and later scalable automation |
| Berths, capabilities, and hard deadlines | Core now | Constrain promises and provide the station's rhythm |
| Passenger service | Core now, simplify | Concrete queues and fulfilled service quantities |
| Cargo jobs and physical storage | Core now, redefine ownership | Create freight flow, staging, and labor pressure |
| Crew movement and work lanes | Core now, simplify | Make labor allocation visible and consequential |
| Building rooms/modules/routes | Core now | Let the player adapt the operating plan |
| Credits, payout components, local standing | Core now | Settle choices and fund adaptation |
| Sanitation and maintenance | Supporting now | Local, causal consequences of load; one readable condition language |
| Security incidents | Supporting now | Rare endogenous exception created by valuable mixed traffic |
| Named crew, traits, injuries | Supporting later | Story and exceptional strengths, not routine micromanagement tax |
| Market | Optional specialization | Passenger/tenant service; no Workshop dependency |
| Workshop and production | Optional specialization | Named manufacturing/repair promises with explicit margins |
| Kitchen and hydroponics | Optional specialization | Margin, resilience, and self-sufficiency choices |
| Residents and housing | Manager-stage layer | Persistent district demand, class, rent, politics, and labor |
| Station reputation | Core now, simple | Summarize service/reliability/safety and influence incoming traffic composition and value |
| Property value and district reputation | Manager-stage layer | Emergent district identity tied to traffic and local outcomes |
| Factions and system map | Manager/CEO layer | Shape the offer stream, prices, risks, and long-term relationships |
| Deep utilities and thermal networks | Dormant | Reconsider as an engineering specialization after the core loop works |
| Detailed crew/resident need stacks | Dormant | Reintroduce only needs that produce visible scheduling or spatial choices |
| Nineteen command terminals and eight specialties | Dormant | Replace with a small set of earned management capabilities |
| Global station-rating driver tree | Dormant as player UI | Keep telemetry if useful; stop using it as the main reward/explanation |
| Random global failure effects | Retire from core | Replace with local, telegraphed, condition-driven incidents |
| T0-T6 checklist progression | Replace after slice validation | Unlock leverage through demonstrated mastery and chosen specialization |

## Dependency Changes

These are the important breaks from the current chain.

- A Cafeteria can buy prepared meals. Kitchen and Hydroponics are margin/resilience upgrades.
- A Market can host a tenant or sell imported inventory. Workshop is not required.
- A Workshop accepts named orders, performs repairs, or makes upgrades. It is not a generic material sink.
- Cargo can be consigned freight rather than station inventory.
- Maintenance consumes deliberate station supplies; it does not justify an unlimited stream of free inbound material.
- Ship service promises require quantities and turnaround outcomes. Merely owning an active room does not satisfy them.
- Unlocks follow successful use. Completing early manual turnarounds can unlock Approach Control policies; managing a larger crew can unlock shift automation. The existing auto-admit and auto-staff foundations already point in this direction.
- Residents, property value, and politics arrive only after transient station operations are fun.

## Scale Without Losing The Loop

| Domain | Scrappy Operator | Station Manager | Station CEO |
|---|---|---|---|
| Traffic | Use Approach Control for a few scarce arrivals | Set admission policies, berth filters, and recurring carrier schedules; inspect exceptions | Shape lane portfolios, faction access, and trade relationships |
| Labor | Assign named crew and move them during a rush | Set shift targets, priorities, and supervisors | Set department budgets and judge manager outcomes |
| Space | Place rooms, doors, counters, and buffers | Design districts, service corridors, and berth specializations | Expand sectors and set land-use/access policy |
| Logistics | Watch and redirect individual freight jobs | Set stock rules, staging targets, and service-level policies | Choose import/export strategy and district infrastructure budgets |
| Exceptions | Dispatch a person to a spill, fault, or theft | Handle unusual manifests and district overload | Intervene in strikes, major failures, scandals, or diplomatic crises |
| Economy | Survive each shift and reinvest | Choose service mix and specialization | Shape station identity, resident economy, and external relationships |

Automation is earned after the player has demonstrated the manual skill. It removes repetitive approval and execution while preserving policy, exceptions, and partly uncontrollable demand. New scale replaces mastered micromanagement with leverage; it does not pile another dashboard on top.

## Validation Criteria

Do not build the manager or CEO layers until the Two-Berth Shift is fun in repeated local play.

The slice succeeds when:

- Traffic requests begin within 60 seconds, and early Approach Control offers a consequential choice without blocking station operation.
- At least two accepted offers call for meaningfully different layouts or staffing plans.
- The player can identify a developing queue or cargo blockage from the world without opening a metrics panel.
- Tables, benches, and couches visibly provide their rendered multi-person capacity, with no individual-chair spam required.
- Reassigning one or two crew can visibly rescue part of a turnaround.
- Every ship departs on time, with partial settlement when necessary.
- A local fading result chip explains each departure at a glance; details remain available without interrupting play.
- Tiny single-tile pods use Docks only, while medium and large ships use Berths only.
- After five ships, the player can name a station change they want to make and why.
- Repeating the same room template is not correct for every traffic portfolio.
- The player can leave routine traffic automated and still make meaningful choices through policy, staffing, space, and intervention.
- A quiet, competent shift remains satisfying without a mandatory disaster.

The first balancing work should measure offer choice, berth occupancy, queue duration, cargo staging, crew travel, intervention frequency, partial fulfillment, and the player's stated next improvement. It should not tune the full station-rating model or every production ratio.

## Explicit Non-Goals For The First Slice

- No city-scale residents or class simulation.
- No complete utility-underlay game.
- No full command specialty tree.
- No requirement to use every existing room.
- No mandatory Workshop -> Market or Hydroponics -> Kitchen chain.
- No run reset, roguelike meta loop, or random card-draft structure.
- No attempt to surface every existing metric.
- No long automated test suite during iterative local balancing; use focused checks after the design behavior is established.

## Research References

- [Station design research map](https://bmo.ryanboye.com/station-design/)
- [Prison Architect](https://www.paradoxinteractive.com/games/prison-architect)
- [Prisoner management and regimes](https://www.paradoxinteractive.com/games/prison-architect-2/news/feature-highlight-prisoner-management)
- [Two Point Hospital](https://www.twopointstudios.com/en/games/two-point-hospital)
- [Airport CEO](https://www.airportceo.com/)
- [Airport CEO contracts and negotiation](https://www.airportceo.com/post/dev-blog-151-businesses-and-contracts)
- [Songs of Syx settlement](https://songsofsyx.com/wiki/index.php/Settlement)
- [Songs of Syx workforce](https://songsofsyx.com/wiki/index.php/Workforce)
- [Oxygen Not Included](https://www.klei.com/games/oxygen-not-included)
- [RimWorld](https://rimworldgame.com/)
- [Space Haven resource rules](https://bugbyte.fi/spacehaven/wiki/index.php/Transfer_%26_Resource_Rules)
- [Cities: Skylines II services, districts, and policies](https://www.paradoxinteractive.com/games/cities-skylines-ii/features/city-services-districts-policies)
- [Factorio](https://www.factorio.com/game/content)
- [Timberborn water-mechanics design deep dive](https://www.gamedeveloper.com/design/deep-dive-timberborn-s-water-mechanics)
