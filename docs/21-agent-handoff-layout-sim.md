# Agent Handoff - Layout Simulation Push

Last updated: 2026-05-02

Use this as the short handoff for the next agent team. Use `docs/15-current-roadmap.md` for the product map, `docs/20-station-layout-project-plans.md` for detailed packets, and `docs/22-simulation-next-phases.md` for the research-backed simulation architecture.

## Landed

- Route intent kernel and route consequences.
- Room environment scoring for visitor status, resident comfort, service noise, and adjacency penalties.
- Utility maintenance debt for reactor/life-support output.
- Life-support coverage diagnostics.
- Diagnostic overlays, overlay keys, hover/readouts, and route-pressure overlay.
- Agent side inspector and selected-agent route visualization.
- Expanded crew/visitor needs v0 with inspector readouts.
- Local air, vent reach, fire, extinguish jobs, and repair jobs.
- Construction blueprints, material delivery, build jobs, cancel-build drag tool, and EVA construction through airlocks.
- Commit checkpoint: `f24109c Add EVA construction polish and cancel build tool`.

## Current Verification

Before the current packet, recent checks passed:

- `npm run test:sim`
- `npm run build`

Run both again after any P0 wall-fixture or construction/EVA edits.

## Active Work

### P0 - Construction/EVA Polish and Wall Fixtures

- Make vents, fire extinguishers, and wall lights true wall-mounted fixtures.
- Require adjacent walkable service tiles for wall fixtures.
- Path construction and repair work to the service tile, not the wall tile.
- Keep airlocks sealed; do not let them behave like holes in the hull.
- Make blocked construction sites inspectable and cancelable.

### P1 - Provider/Reservation Kernel and Living Agent Actions

- Crew, visitors, and residents now have more needs, but the systems should converge on shared providers and reservations.
- Add shared provider/reservation/cooldown helpers so actors distribute instead of bunching.
- Expose active desire, target, reservation, queue state, and failure reason consistently.
- Prefer object interactions over room interactions: seats, vending machines, counters, beds, showers/sinks, benches/couches, and leisure modules.

### P2 - Batched Logistics and Stock Rules

- Food and material movement should use stock targets, source/target reservations, and batch sizing.
- Stop one-unit trickle jobs where capacity exists.
- Model item-node policy with allowed item, min/desired/max, priority, and blocked reason.
- Use supply links/districts for Hydroponics -> Kitchen, Kitchen -> Cafeteria, Storage -> Workshop/Construction, and Workshop -> Market.

### P3 - Work Tasks and Job Board v1

- Keep true staffed posts for Security/Brig/future Command.
- Move production rooms toward visible module work tasks instead of crew standing in rooms.
- Assignment should follow the job-board + bounded bidding model in `docs/22-simulation-next-phases.md`, with reservations and player-facing blocked reasons.

### P4 - Access and Route-Control Gameplay

- Public/restricted zoning exists but needs stronger controls.
- Route-pressure already shows conflicts; next step is giving the player clearer tools to fix them.

## Parallel Ownership

- Construction team owns build sites, EVA, airlocks, cancel tools, and construction inspectors.
- Wall-fixture team owns module definitions, placement rules, service tiles, and utility fixture effects.
- Needs team owns provider/reservation balance and living-agent object interactions.
- Logistics team owns batched stock rules, source/target reservations, and supply links.
- Job-board team owns bounded worker bidding, blocked reasons, and production work-task migration.
- Access team owns zoning/route controls and overlay/readout behavior.
- UI/docs/test team owns inspector copy, docs, browser QA, and regression tests.

Avoid overlapping rewrites of `updateCrewLogic`, visitor update logic, and construction job dispatch. Prefer small helper functions. Do not add another one-off target picker if the provider/job-board architecture should own the problem.
