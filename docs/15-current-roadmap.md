# Current Roadmap

Last updated: 2026-05-01

This is the live product map. Treat this file plus `docs/20-station-layout-project-plans.md` and `docs/21-agent-handoff-layout-sim.md` as the current source of truth.

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
2. Stabilize **needs/service queue balance** so crew and visitors stop bunching or retargeting constantly.
3. Expand **access/route controls** using the route-pressure overlay as the player-facing proof.
4. Add **janitor/sanitation** as the next everyday station-life loop.
5. Add **command center + electrical/mechanical v0** once the wall-fixture foundation is in place.
6. Make **patients/incidents** reliably spawn and resolve.

## Agent Swarm Guidance

Good parallel splits:

- Team A: construction/EVA debugging, cancel tools, airlock behavior, construction inspectors.
- Team B: wall-mounted fixture placement, service tiles, vent/extinguisher repair behavior.
- Team C: unified needs/service provider helpers and anti-bunching balance.
- Team D: access/route-control gameplay and overlay readouts.
- Team E: docs/tests/QA harness and browser playtest notes.

Avoid multiple teams rewriting the same actor update loop. Prefer narrow helper functions, explicit diagnostics, and focused tests in `tools/sim-tests.ts`.
