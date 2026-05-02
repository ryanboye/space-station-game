# Current Roadmap

Last updated: 2026-05-02

This is the live product map. Treat this file plus `docs/20-station-layout-project-plans.md`, `docs/21-agent-handoff-layout-sim.md`, and `docs/22-simulation-next-phases.md` as the current source of truth.

## Product Direction

The game is a station-management sim about designing a living orbital station where layout creates operational pressure. The player should build rooms, berths, service corridors, housing, utilities, and exterior structures; then watch people, ships, air, food, maintenance, fire, construction, and route conflicts stress that design.

The rule for MVP is: no important hidden simulation without a player-facing surface. New systems should be visible through overlays, inspectors, build previews, job metrics, alerts, or agent routes.

## Done

- Core grid building, room painting, modules, zones, map expansion, save/load, and progression gates.
- Berths, visitor/residential berth purpose, ship servicing, and dock/berth visualization.
- Visitors, residents, and crew with pathing, inspectors, and selected-agent route lines.
- Food/logistics chain: hydroponics, kitchen, cafeteria, serving stations, storage, item nodes, and transport jobs.
- Resident conversion, home ships, housing, taxes, satisfaction, stress, and leave intent.
- Room environment scoring: visitor status, resident comfort, service noise, utility/cargo/public adjacency.
- Diagnostic overlays and keys: air coverage, visitor status, resident comfort, service noise, maintenance, route pressure.
- Expanded crew/visitor needs v0: hygiene/toilet/leisure/social/rest surfaces, with agent inspector readouts.
- Repair jobs v0: generalist crew clear reactor/life-support maintenance debt.
- Fire v0: utility debt can ignite, fires spread and damage modules, crew can extinguish, extinguishers suppress.
- Local air v0: per-tile air quality from pressurization, life-support reach, vents, and fire exposure.
- Construction v0: build blueprints consume materials, create haul/build jobs, can be canceled with refunds.
- EVA construction v0: exterior builds route through airlocks and put crew into suits for vacuum work.
- Sprite/UI polish for several new rooms/modules, plus route and construction debugging surfaces.

## Active MVP Gaps

1. **Construction/EVA polish.** Airlocks need to behave and read like sealed technical structures, exterior construction needs clearer debug feedback, and failed/blocked builds must be easy to cancel or inspect.
2. **Wall-mounted utility fixtures.** Vents, extinguishers, lights, future panels, pipes, ducts, and wiring should live on walls when that makes physical sense. Mechanics should repair wall fixtures and utilities through adjacent service tiles.
3. **Access and route control.** Public/restricted exists, but the player still needs stronger tools to separate visitors, crew, residents, cargo, and hazardous routes.
4. **Unified needs/service model.** Crew and visitors have expanded needs, but the provider/queue/balance model should be unified so bunching and task churn are easier to tune.
5. **Janitor/sanitation loop.** Dirt, trash, bathrooms, showers, food areas, and public status need a lightweight cleaning job loop and visible room penalties.
6. **Command/operations layer.** A cockpit or command center should make station operations feel owned: ship traffic, alerts, dispatch, sensors, contracts, and station policy should converge there.
7. **Electrical/mechanical distribution.** Power, water, ducts, vents, panels, pumps, and maintenance should become spatial without becoming invisible busywork.
8. **Incidents and patients.** Medical and dispatched incidents exist as goals, but event generation and resolution need enough pressure to make the advanced tier playable.
9. **Station identity.** Trade hub, habitat, industrial, research, military/security, and medical directions should emerge from contracts, visitor mix, modules, and scoring.

## Current Priority Order

1. Finish **construction/EVA polish** and **wall-mounted fixture foundation** together. They are coupled: wall fixtures need reachable service tiles and exterior construction needs reliable airlock semantics.
2. Build the **provider/reservation kernel** from `22-simulation-next-phases.md`. This should become the shared anti-bunching layer for visitors, residents, crew self-care, seats, service modules, and future jobs.
3. Fix **batched logistics and stock rules** before adding more production pressure. Food/material movement should use buffer targets, source/target reservations, and batch sizing rather than one-unit trickle jobs.
4. Convert passive production staffing into **visible work tasks**. Keep true staffed posts for Security/Brig/future Command, but make hydroponics, kitchen, workshop, utilities, cleaning, repair, and construction publish inspectable jobs.
5. Expand **access/route controls** using the route-pressure overlay as the player-facing proof.
6. Add **electrical/mechanical/water distribution v0** using layered coverage: forgiving hull service first, high-load panels/pumps/ducts for advanced rooms, clear overlays before strict networks.
7. Add **janitor/sanitation** once provider reservations and job dispatch can support object/room cleaning cleanly.
8. Add **command center + station map contracts** so operations, traffic, faction offers, sensors, and station identity converge.
9. Make **patients/incidents** reliably spawn and resolve.

## Research-Backed Architecture Bets

- Use a central job board with bounded local bidding. Task allocation is a solved optimization family; for this dynamic sim, market/auction-style assignment with reservations is a better default than ad hoc target scans or full global optimization every tick.
- Use utility scoring for desire selection and HTN-like task templates for reusable routines. Avoid one giant actor state machine and avoid full GOAP search for every ordinary visitor.
- Use stockpile/resource-rule semantics for logistics: allowed items, min/desired/max targets, priority, reservations, and nearby buffers.
- Use layered utility coverage before strict pipes: automatic low-load hull service, explicit high-load panels/pumps/ducts, then switches/valves/dampers once overlays are readable.
- See `docs/22-simulation-next-phases.md` for sources and implementation guardrails.

## Agent Swarm Guidance

Good parallel splits:

- Team A: construction/EVA debugging, cancel tools, airlock behavior, construction inspectors.
- Team B: wall-mounted fixture placement, service tiles, vent/extinguisher repair behavior.
- Team C: unified needs/service provider helpers and anti-bunching balance.
- Team D: access/route-control gameplay and overlay readouts.
- Team E: docs/tests/QA harness and browser playtest notes.

Avoid multiple teams rewriting the same actor update loop. Prefer narrow helper functions, explicit diagnostics, and focused tests in `tools/sim-tests.ts`.
