# Current Roadmap

Last updated: 2026-04-28

This is the live product map. Older top-level planning ledgers were useful historically, but agents should treat this file plus `docs/20-station-layout-project-plans.md` and `docs/21-agent-handoff-layout-sim.md` as the current source of truth.

## Product Direction

The game is a station-management sim about designing a living orbital station where layout creates operational pressure. The player should build rooms, berths, service corridors, housing, and utilities; then watch people, ships, air, food, maintenance, and route conflicts stress that design.

The current design priority is not adding more hidden complexity. New systems should be inspectable through overlays, room inspectors, agent inspectors, metrics, and path visualization.

## Done

- Grid building, room painting, modules, zones, map expansion, save/load, and progression gates.
- Berths with visitor/residential purpose split and berth capability modules.
- Visitors, residents, and crew as separate actor classes with pathing and inspectors.
- Food/logistics chain: hydroponics, kitchen, cafeteria, serving stations, item nodes, and transport jobs.
- Resident conversion, resident home ships, private housing, taxes, satisfaction, stress, leave intent.
- Room environment scoring: visitor status, resident comfort, service noise, utility/cargo/public adjacency.
- Route intent and route consequences for visitors, residents, crew, logistics, and security.
- Maintenance debt for reactor and life-support systems.
- Life-support coverage diagnostics.
- Diagnostic overlays and keys: air coverage, visitor status, resident comfort, service noise, maintenance, route pressure.
- Agent side inspector and selected-agent route visualization.
- Route-pressure conflict reasons in hover/readouts and room inspectors.
- First expanded visitor need: longer-stay visitors can route to Hygiene as a comfort/toilet stop, visible in the agent inspector.
- First expanded crew need: idle crew can route to Lounge, RecHall, Market, or Cafeteria for off-duty leisure/social recovery, visible in the agent inspector.

## Partially Done

- **Zoning/access.** Public/restricted exists, but it is still a blunt tool. It needs better design affordances for staff, service, visitor, and residential routing.
- **Maintenance.** Debt affects output and staffing pressure, but there is no dedicated repair job/specialty loop yet.
- **Life support.** Coverage is visible, but air exposure still needs a more local/spatial model.
- **Needs.** Residents are the deepest. Visitors now have a first auxiliary Hygiene stop, and crew have a first off-duty leisure/social loop. Explicit toilet queues and richer visitor social behavior are still shallow.
- **Security/incidents.** Trespass/fights/security aura exist, but crime, theft, patrols, and emergency response are still thin.
- **Station identity.** The game can support trade hub/habitat/industrial/military directions, but those identities are not yet first-class scenarios or contracts.

## Next Work

### P8B - Route Conflict and Access Gameplay

Goal: turn the route-pressure overlay into actionable layout gameplay.

- Expand hover/readout reasons for more route-problem categories.
- Broaden room-inspector route summaries into stronger player advice.
- Make bad public/service/residential crossings affect rating, stress, morale, and work efficiency clearly.
- Add better controls to solve problems: stronger zone behavior, staff/service route tools, or staff-only access rules.

### P9 - Expanded Needs v0

Goal: make people create believable demand for station services.

- Crew: rest and hygiene already existed; first leisure/social recovery is now in place. Explicit toilet pressure still needs a dedicated pass.
- Visitors: meals plus first optional toilet/hygiene stop; leisure/social needs still need expansion.
- Residents: preserve existing routine, fold toilet into hygiene initially.
- Reuse current rooms first: Dorm, Hygiene, Cafeteria, Lounge, Market, RecHall.
- Surface everything in agent inspector, room inspector, metrics, and route-pressure overlay.

### P5 - Local Air Gameplay

Goal: make life-support placement spatially meaningful now that air coverage is visible.

- Add `airQualityAtTile` or local-air storage.
- Keep global air as an average/trend metric.
- Use life-support coverage and disconnected areas to drive local exposure.
- Make actors in bad local air distressed while safe areas remain healthy.

### P4B - Staff Specialization and Repair

Goal: make crew feel like hired workers with roles instead of a single generalist pool.

- Add mechanics/operators/security/logistics/cooks or a minimal subset.
- Connect mechanics to maintenance debt and repair jobs.
- Keep emergency overrides readable and testable.

**Note (2026-04-28)**: hold this packet until other systems are working. The current generalist pool is helpful for balance — splitting crew into specialties prematurely makes shortages harder to reason about. Revisit after maintenance debt has a visible repair loop and at least one need (toilet) is fully wired.

## Later

- Berth approach clearance and larger ship approach geometry.
- Piping/ducts/power/water distribution.
- Fire, leaks, hull breach, compartment risk, evacuation-like behavior.
- Crime/theft/gangs, brig workflow, patrols.
- Resident businesses: cantinas, shops, mechanic stalls.
- Regional/world map, contracts, factions, station identity bonuses.

## Agent Swarm Guidance

Good parallel split:

- Team A: P8B overlay/readout/room inspector route reasons.
- Team B: P9 crew self-care needs and target selection.
- Team C: P9 visitor auxiliary needs.
- Team D: P5 local-air helpers and tests.
- Team E: docs/tests/QA harness.

Do not let multiple teams rewrite the same actor update loop at once. Prefer narrow helper functions and focused tests in `tools/sim-tests.ts`.
