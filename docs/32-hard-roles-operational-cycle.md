# Hard Roles And The Operational Cycle

Status: implementation contract for the active station-depth goal.

Authority: subordinate to `docs/23-operational-promise-core-loop.md` and informed by
`docs/31-airport-port-cruise-systems-research.md`.

## Decision

Crew labor has one player-facing source of truth: **a named employee's permanent
role**.

The game will no longer ask the player to allocate anonymous crew counts to
Service, Cargo, Maintenance, or Cleaning, or to tune a matrix of system
priority sliders. Those mechanisms may remain temporarily for save migration
and internal dispatch, but they are not part of the intended game.

Four concepts replace them:

1. **Role** determines which work an employee may perform.
2. **Watch** determines when that employee is on duty, reserve, or off duty.
3. **Workplace** is a physical module, room, berth, or district that creates
   staffed positions and visible work.
4. **Dispatch** automatically selects an eligible on-duty employee using
   urgency, distance, health, and existing assignment.

The player hires people, assigns watches and workplaces, opens facilities, and
intervenes in exceptions. The player does not maintain abstract labor totals.

## Interface Pattern Rule

Before inventing a management surface, compare the same problem in established
simulation games and adopt the clearest proven interaction grammar. This is a
design constraint, not a request to skin the whole game like another title.

- **Time planning** follows the compact, spatially grouped grammar of Prison
  Architect's Regime and Deployment Schedule: periods are visible together,
  current state is obvious, and the player edits a plan rather than a matrix of
  anonymous values.
- **Spatial staffing and access** use a world overlay like Deployment: select a
  role or person, then act on a room, post, route, or district in the station.
- **Named personnel** use portrait rosters grouped by role or watch. Repeated
  checkboxes, +/- steppers, and one control cluster per employee are forbidden.
- **Diagnostics** belong in optional overlays and contextual room/facility
  inspectors. They should explain a visible world state, not become the primary
  way the player experiences it.
- **Policies and automation** may use focused management panels once scale earns
  them, but each panel must represent a specific planning decision rather than
  exposing simulation variables directly.

Reference choice is problem-specific. Prison Architect is the first reference
for schedules and deployment; airport, hospital, colony, and city builders are
consulted when their interaction better matches the system being introduced.

## Initial Physical Roles

The starter game uses a deliberately small roster:

| Role | Owns | May not silently cover |
|---|---|---|
| Captain | command and approach policy | routine service, hauling, cleaning |
| Cook | cooking, meal stocking, serving meals | freight, repair, sanitation |
| Steward | drinks, hospitality counters, guest-facing service | freight, engineering |
| Cargo Handler | customs handling, cargo arms, freight, fuel transfer | food, repair, sanitation |
| Engineer | life support, technical posts, repair, fire response | food, freight, sanitation |
| Cleaner | sanitation jobs and waste handling | food, freight, engineering |
| Security Guard | customs screening, patrol, incident response | routine civilian work |
| Assistant | basic hauling and construction; explicit emergency relief at a penalty | specialist-only posts |

Botanists, doctors, mechanics, EVA specialists, and officers remain later
specializations. Existing saves retain their named roles and map them into the
closest physical work family.

## Physical Workplaces

Facilities advertise real positions:

| Workplace | Eligible roles | Initial positions |
|---|---|---|
| Stove | Cook | one per stove |
| Serving Station | Cook or Steward | two guest-facing positions |
| Bar Counter | Steward | one per counter; taps modify throughput |
| Cargo Arm | Cargo Handler | one arm operator plus hauling work |
| Customs Counter | Security Guard or Cargo Handler | one screening position |
| Life Support / Reactor | Engineer | required operating posts |
| Fuel Pump | Cargo Handler; Engineer for fault response | one transfer position |
| Dirty tile / sanitation route | Cleaner | roaming job in an assigned area |
| Security / Brig / gate | Security Guard | stationed or roaming response |

Rendered capacity and simulated positions must agree. Large fixtures should
provide several authored use or work positions rather than forcing module spam.

Clicking a facility reports its state, required role, staffed positions,
current employee, queue or backlog, and limiting reason. Staffing actions start
at that facility or in the named crew roster, never at a global +/- counter.

## Named Watches

Each employee belongs to Alpha, Beta, or Gamma. The current operating period
maps those cohorts to on-duty, reserve, and off-duty states. A roster screen
shows named employees grouped by watch and derives coverage for the upcoming
traffic bank.

The player selects a named employee in a three-column watch board and assigns
them to Alpha, Beta, or Gamma. The three periods remain visible together;
coverage numbers are forecasts, not allocation controls.

Emergency recall temporarily makes off-duty employees eligible. It identifies
the people recalled and produces fatigue, morale, and overtime consequences.

## Demand-Led Operating Cycle

Traffic leads; labor responds.

An operating cycle forecasts concrete demand rather than only naming a generic
passenger or cargo bank:

- expected arrivals and berth classes;
- passenger and freight ranges;
- requested workstreams;
- likely peak service positions;
- projected role coverage;
- the next recovery window.

Routine compatible traffic follows policy. Exceptional traffic asks for a
decision. During service, the world shows each port-call workstream and its
current limiter: access, role, position, inventory, route, buffer, or time.

The cycle connects the three station layers from Doc 31:

1. **Port call:** ships create passenger, cargo, fuel, security, or repair work.
2. **Station hotel:** people occupy counters, tables, toilets, bars, and lounges.
3. **Station plant:** crew, stock, air, cleaning, and maintenance restore flow.

## Player Levers

The small-station player uses a short set of concrete commands:

- hire or dismiss a role;
- assign a named employee to a watch;
- assign or clear a home workplace or service area;
- open, close, or surge a staffed facility;
- hold or release routine traffic at Approach Control;
- recall off-duty employees;
- dispatch security or engineering to a visible exception;
- add or move physical capacity, buffers, routes, and doors.

Priorities remain internal dispatch weights. Later supervisors may expose
department policies, but the starter game has no RimWorld-style priority grid.

## Progression

Progression is additive and follows demonstrated operation:

- visitor service unlocks hospitality options;
- completed turnarounds unlock routine admission policy;
- successful watch handovers unlock saved roster templates;
- resolved incidents unlock deeper security operation;
- reliable cargo or fuel calls unlock specialized port services.

Workshop and Market are optional businesses. Their shared production cycle may
unlock an industrial specialization, but it must never gate core security,
medical response, traffic control, or ordinary station growth.

## Scale Transition

| Scale | Labor control |
|---|---|
| Scrappy Operator | Named roles, individual watches, home workplaces |
| Station Manager | District assignments, coverage templates, supervisors, service hours |
| Station CEO | Department budgets, service standards, manager outcomes |

The simulation may aggregate work internally at scale, but the abstraction is
earned after the player has operated the physical system.

## Removal And Migration

- Remove the bottom Service/Cargo/Maintenance/Cleaning +/- controls.
- Remove the player-facing work-lane quota editor and system priority sliders.
- Preserve old `crewWatchTargets`, `crewShiftTargets`, and priority fields only
  as tolerated save input until a later schema cleanup.
- Existing crew keep stable identities and roles whenever possible.
- Old anonymous assistants remain Assistants; migration must not silently turn
  them into specialists.
- Derive operational coverage from actual, awake, role-eligible crew.

## Validation Gates

### Two-Berth fun gate

- A new player can explain every employee's job by looking at the crew or their
  workplace.
- A passenger and freight overlap creates a role or position conflict that can
  be changed through the world.
- No core staffing action requires a +/- quota control or priority slider.
- The player makes at least one staffing, facility, traffic, or layout decision
  during each operating cycle.
- A quiet competent cycle remains satisfying and legible.

### Fifty-Crew scale gate

- Named roles remain inspectable while district or roster summaries aggregate
  coverage.
- Role eligibility does not produce a synchronized idle collapse.
- Work dispatch, provider selection, and rendering remain within the existing
  performance budgets at 1x and accelerated speed.
- Old saves load without losing crew, progression, or station geometry.

## Implemented Slice (July 21, 2026)

The first hard-role and operational-cycle pass now includes:

- starter Cook, Steward, Cargo Handler, Engineer, Cleaner, and Assistant roles;
- role-eligible work and job dispatch, with later specialist titles grouped
  into the same capability families;
- a compact three-column named watch board with current, reserve, and off-duty
  states visible together;
- per-person watch, emergency recall, home-workplace, and workplace-surge
  actions;
- room-context staffing for mess, kitchen, cargo, berth, technical, security,
  and sanitation workplaces;
- two distinct walkable counter positions per Serving Station, matching the
  visible fixture capacity;
- incoming-call forecasts expressed as concrete role demand and workstreams;
- persistent world callouts for unstaffed work, queues, and public/service
  route conflicts;
- completed turnarounds, rather than Workshop/Market production, as the Tier 3
  core progression gate;
- save persistence for roles, watches, recalls, workplaces, and completed
  turnarounds.

The old Service/Cargo/Maintenance/Cleaning steppers and player-facing priority
matrix are removed. Their save fields remain tolerated internal input only.

## Playtest Findings

The two-berth save produced a useful staffing decision immediately: an inbound
ship forecast a missing Cook because the only Cook belonged to another watch.
Rescheduling, hiring, holding the ship, or using Emergency Recall were all
legible responses. A live passenger call then exposed and fixed two scheduler
faults: duty positions pointed at blocked module tiles, and the needs loop used
an inverted copy of the watch mapping. Staff now use distinct adjacent work
positions and all systems share one watch-status function.

The 50-crew save loaded with its geometry, active calls, progression, and crew
intact. The three-column roster remained readable, and the station continued at
2x with 34 visitors, two docked ships, incidents, sanitation, and 16 active jobs.
Old Janitor and Security Officer titles now count toward Cleaner and Security
Guard coverage respectively; equivalent engineering and cargo specialists use
the same family rule.

The scale playtest also found a meal-session race: urgent food jobs could
interrupt a crew member after they had picked up a meal, removing the meal
from stock without allowing hunger relief. Carried meals and active eating
sessions are now protected until the session completes.

Remaining design work is content depth rather than another labor-allocation
layer: more workplace-specific actions, district-level staffing once scale
earns it, and enough toilets, drinks, quarters, and recovery time to make watch
handover a strategic rhythm instead of permanent emergency recall.
