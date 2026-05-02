# Agent Handoff - Layout Simulation Push

Last updated: 2026-05-01

Use this as the short handoff for the next agent team. Use `docs/15-current-roadmap.md` for the product map and `docs/20-station-layout-project-plans.md` for detailed packets.

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

### P1 - Unified Needs and Service Queue Balance

- Crew and visitors now have more needs, but the systems should be unified.
- Add shared provider/reservation/cooldown helpers so actors distribute instead of bunching.
- Expose active need, target, reservation, and failure reason consistently.

### P2 - Access and Route-Control Gameplay

- Public/restricted zoning exists but needs stronger controls.
- Route-pressure already shows conflicts; next step is giving the player clearer tools to fix them.

## Parallel Ownership

- Construction team owns build sites, EVA, airlocks, cancel tools, and construction inspectors.
- Wall-fixture team owns module definitions, placement rules, service tiles, and utility fixture effects.
- Needs team owns provider/reservation balance and anti-bunching logic.
- Access team owns zoning/route controls and overlay/readout behavior.
- UI/docs/test team owns inspector copy, docs, browser QA, and regression tests.

Avoid overlapping rewrites of `updateCrewLogic`, visitor update logic, and construction job dispatch. Prefer small helper functions.
