# Living Simulation Roadmap Index

Last updated: 2026-05-02

This is the index for the next simulation roadmap. The work is split into three parts so we can pause, rebalance, and reassess between major systems instead of marching through one oversized plan.

## How To Use These Roadmaps

- Treat these documents as living `/goal` checklists.
- Check off items as they land. Add short dated notes under the relevant checkpoint when implementation details, tradeoffs, or test results matter.
- Keep notes terse: `2026-05-02 - Decision: ...`, `2026-05-02 - Verified: npm run test:sim`.
- Do not add a second parallel roadmap/handoff/phase plan. Update these files instead.
- Before starting a chunk, read the relevant system docs and `docs/99-trip-wires.md`.
- Before moving past a checkpoint, run the listed checks or add a note explaining why a check could not run.
- Keep refactors incremental. `src/sim/sim.ts` is large; prefer new helper modules, facades, and vertical slices over broad rewrites.
- Do not add new APIs or state fields without a player-facing manifestation: panel, inspector row, overlay, alert, route, job marker, or meaningful object interaction.

## Roadmap Parts

1. **Part 1 - Living Actors, Jobs, Logistics, and Residents**  
   File: `docs/16-roadmap-part-1-living-actors-jobs.md`  
   Scope: reservations, object providers, batched logistics, job-board facade, first production work slice, production migration, role identity, and residents-as-society. This is the foundational refactor and should be balanced/playtested before deeper utilities.

2. **Part 2 - Utilities, Hazards, Access, and Sanitation**  
   File: `docs/17-roadmap-part-2-utilities-hazards-sanitation.md`  
   Scope: access/districts, route control, spatial power/water/ducting, hazards, maintenance, fire/smoke consequences, and sanitation. Start this only after Part 1 feels stable enough that more jobs and object interactions will not amplify old churn.

3. **Part 3 - Command Center, System Map, Contracts, and Incidents**  
   File: `docs/18-roadmap-part-3-command-map-contracts.md`  
   Scope: command/ops, actionable system map, faction/lane contracts, station identity, patients, dispatch, and advanced incidents. This is intentionally later because it changes the game's strategic layer.

## Product Direction

The player should design a living orbital station where layout creates operational pressure. The sim should show why the station works or fails through actors, rooms, modules, routes, jobs, overlays, inspectors, alerts, and map opportunities.

Core population fantasy:

- **Core crew** run the station. They pilot, operate, maintain, build, repair, secure, haul, and respond to emergencies. The player controls headcount and priorities, later roles/specialties.
- **Visitors** are temporary customers. They arrive from ships, follow itineraries, consume public services, spend money, complain, and leave.
- **Residents** are semi-autonomous citizens. They live on the station, follow routines, work, open or staff businesses, pay rent/tax, form satisfaction/conflict, and create local demand.
- **Contractors** may later bridge the gap: temporary faction or contract workers for repairs, construction, medical events, trade, entertainment, or inspections.

## Architecture Bets

- **Objects provide services.** Rooms provide context, activation, environment, and bonuses; modules/service tiles provide concrete interactions.
- **Actors choose desires, then execute task templates.** Use utility scoring for desire selection and HTN-like templates for reusable routines: reserve, walk, use, release, update state.
- **Reservations are the anti-bunching primitive.** Reserve actor-to-job, provider slot, service tile, seat/use slot, source item amount, and target capacity with expiry and release paths.
- **Jobs use a job board plus bounded bidding.** Producers publish typed jobs; eligible workers bid using path cost, priority, role suitability, fatigue/needs, urgency, hazards, and reservation conflicts.
- **Use priorities and suitability, not rigid professions everywhere.** Role identity matters, but most routine tasks should remain flexible. Hard gates should be reserved for command, medical, security, advanced engineering/EVA, and resident-owned businesses.
- **Logistics use stock rules.** Item nodes/rooms declare allowed items, min/desired/max targets, priority, supply links, source reservations, and target capacity reservations.
- **Utilities start as layered coverage.** Keep early low-load hull service forgiving. Make high-load rooms depend on nearby panels/pumps/ducts/vents before strict pipe spaghetti.
- **System map data must affect play.** Lanes, factions, planets, and belts should drive traffic, prices, contracts, hazards, reputation, and station identity.

## Reference Patterns

- Space Haven view modes/resource rules: https://bugbyte.fi/spacehaven/wiki/index.php/Menus and https://bugbyte.fi/spacehaven/wiki/index.php/Transfer_%26_Resource_Rules
- Space Haven facilities/power: https://bugbyte.fi/spacehaven/wiki/index.php/Facilities and https://bugbyte.fi/spacehaven/wiki/index.php/The_Power_Grid
- Prison Architect utilities/logistics: https://prison-architect.fandom.com/wiki/Utilities and https://prison-architect.fandom.com/wiki/Logistics
- RimWorld hauling/stockpiles: https://rimworldwiki.com/wiki/Hauling and https://mail.rimworldwiki.com/wiki/Stockpile_zone
- Songs of Syx citizens/workforce: https://songsofsyx.com/wiki/index.php/Citizens and https://www.songsofsyx.com/wiki/index.php/Workforce
- Task allocation and planning background: https://journals.sagepub.com/doi/pdf/10.1177/0278364904045564, https://www.ri.cmu.edu/publications/market-based-multirobot-coordination-a-survey-and-analysis/, https://cir.nii.ac.jp/crid/1360011145435838592, https://ocs.aaai.org/Library/AIIDE/2005/aiide05-018.php

## Current State

Already in the game:

- Grid building, room painting, modules, zones, map expansion, save/load, progression gates.
- Docks, berths, visitor/residential berth purpose, ship servicing, dock/berth visualization.
- Visitors, residents, crew pathing, inspectors, and selected-agent route lines.
- Food chain with item nodes and transport jobs.
- Resident conversion, home ships, housing, taxes, satisfaction, stress, leave intent.
- Room environment scoring, route exposure, route-pressure overlay.
- Crew/visitor/resident needs v0 with inspector readouts.
- Repair jobs, maintenance debt, local air, vents, fire, extinguish jobs.
- Construction blueprints, material delivery, build jobs, cancel tool, EVA routing.
- Procedural system map with factions, planets, belts, and lane-sector traffic bias.

Main weakness:

- Too many systems resolve as global numbers, passive room presence, or tiny one-off jobs. The next push should make work local, visible, reserved, inspectable, and object-driven.

## Cleanup Checkpoint

- [ ] Confirm this index plus Parts 1-3 are the only product roadmap/phase plans.
- [ ] Update docs indexes when roadmap files move.
- [ ] Add a short "architecture notes" section to relevant system docs when each part lands.
- [ ] Prefer helper modules over increasing `sim.ts` complexity when practical.
- [ ] Add sim tests around each new primitive before migrating more behavior.

Checkpoint tests:

- [ ] `rg -g '!docs/15-current-roadmap.md' "20-station-layout-project-plans|21-agent-handoff-layout-sim|22-simulation-next-phases" docs README.md src tools` shows no stale references.
- [ ] No gameplay code changed in this cleanup checkpoint unless explicitly noted.

Notes:

- 2026-05-02 - Decision: split the roadmap into three parts: living actors/jobs, utilities/sanitation, and command/map/contracts.
