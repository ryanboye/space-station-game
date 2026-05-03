# Roadmap Part 2 - Utilities, Hazards, Access, and Sanitation

Last updated: 2026-05-02

Part 2 starts after Roadmap Part 1 has stabilized. It deepens the station's physical simulation: route control, districts, spatial utilities, hazards, maintenance, fire/smoke consequences, and sanitation.

Do not start this part until the Part 1 stop-and-assess checklist is complete. These systems add many jobs, providers, blocked reasons, and overlays; they need the reservation/job/provider spine first.

## Goals

- Turn route pressure into a solvable layout game.
- Make power, water, ducting, fire, and repair spatial and legible.
- Add everyday decay so busy stations visibly get dirty and need cleaning.
- Keep early-game service forgiving; make advanced/high-load rooms create local infrastructure pressure.

## Checkpoint 1 - Access, Districts, And Route Control

- [ ] Replace or extend Public/Restricted with route policies: public, resident, staff, logistics, hazardous, security, construction/EVA.
- [ ] Add door modes or permissions: public, staff-only, residents-only, service-only, emergency-open/closed.
- [ ] Add service corridor semantics that logistics prefer and visitors dislike.
- [ ] Add supply/work districts: room/service links, crew work zones, visitor/resident allowed areas.
- [ ] Surface route conflicts in overlay keys, hover readouts, room inspectors, and rating/morale/stress drivers.
- [ ] Keep soft route costs as default; hard deadlock only on true disconnection or explicit locks.

Player-facing surfaces:

- Route policy paint tool or zone submodes.
- Door-mode UI on selected door.
- Route-pressure overlay readouts that name the conflict and suggested fix.
- Room inspector route warnings: visitor route crosses service, logistics crosses public, resident commute through hazard, etc.

Checkpoint tests:

- [ ] `npm run test:sim`
- [ ] `npm run build`
- [ ] Route-pressure conflict can be fixed with access/district changes in a deterministic scenario.
- [ ] Visitors avoid service/reactor/logistics space unless layout forces it.
- [ ] Logistics can still use safe fallback routes during emergencies.

Notes:

- _Add dated implementation notes here._

## Checkpoint 2 - Utilities, Hazards, And Maintenance v1

Layered model:

- Baseline hull service covers early low-load station needs.
- High-load rooms need local panels/pumps/ducts/vents.
- Switches, valves, dampers, and fire doors isolate branches once overlays explain them.

Implementation:

- [ ] Add local high-load power coverage for reactors, life support, kitchen, workshop, clinic, command, and large berths.
- [ ] Add local water/plumbing coverage for sinks, showers, toilets, hydroponics, kitchen, life support, clinic, and sprinklers.
- [ ] Add duct/vent coverage that distinguishes sealed-but-stale from leaking/depressurized.
- [ ] Add overlays for local power load, water pressure, duct/air quality, maintenance, and fire/smoke risk.
- [ ] Track module/fixture health for panels, vents, pumps, conduits, and critical modules.
- [ ] Add preventive maintenance and repair tasks at service tiles.
- [ ] Make fire risk come from maintenance debt, kitchen load, electrical overload, and water/electric contact.
- [ ] Fire should create smoke/air consequences, blocked tiles, module damage, extinguish jobs, and repair aftermath.

Player-facing surfaces:

- Utility overlay tabs: power load, water pressure, duct/air, maintenance, fire/smoke.
- Room inspector utility block: local power, local water, duct reach, top infrastructure blocker.
- Module inspector for panels, pumps, ducts, vents, valves, dampers, extinguishers/sprinklers.
- Alerts that name local causes: "Kitchen water pressure low", "Panel overloaded", "Duct stale air", "Fire smoke spreading".

Checkpoint tests:

- [ ] `npm run test:sim`
- [ ] `npm run build`
- [ ] Remote high-load room shows local power/water shortage independently of global HUD.
- [ ] Valve/switch/damper changes branch state or inspector output.
- [ ] Fire creates visible smoke/air consequences and a clear extinguish/repair sequence.

Notes:

- _Add dated implementation notes here._

## Checkpoint 3 - Sanitation And Everyday Decay

- [ ] Add dirt/trash/sanitation pressure from foot traffic, meals, vending, bathrooms, showers, hydroponics, fires, and incidents.
- [ ] Add cleaning jobs targeting dirty tiles/modules/rooms.
- [ ] Dirty rooms affect visitor status/spend, resident comfort/satisfaction, crew morale/work speed, hygiene, and food-safety risk.
- [ ] Add sanitation overlay and room inspector warnings.
- [ ] Optionally add cleaning supplies as item nodes after the basic loop is stable.

Player-facing surfaces:

- Sanitation overlay showing dirty tiles/rooms and cleaning job status.
- Room inspector sanitation score and sources: foot traffic, meals, bathroom use, hydroponics, fire, bodies/incidents.
- Jobs panel cleaning category.
- Agent inspector activity: cleaning tile, hauling trash, sanitizing table/sink/toilet.

Checkpoint tests:

- [ ] `npm run test:sim`
- [ ] `npm run build`
- [ ] Busy cafeteria/hygiene room gets dirty in a deterministic scenario.
- [ ] Janitor/generalist cleans via visible jobs.
- [ ] Dirt affects rating/morale mildly and appears in inspector/overlay.

Notes:

- _Add dated implementation notes here._

## Stop And Assess Before Part 3

- [ ] Are route/district tools understandable?
- [ ] Do utility overlays explain causes before penalties hit?
- [ ] Are fires/hazards tense without feeling random?
- [ ] Does sanitation create useful station-life pressure or just janitor spam?
- [ ] Has job volume remained readable in the Jobs/Ops panels?

Required checks:

- [ ] `npm run test:sim`
- [ ] `npm run build`
- [ ] Browser/playtest with a medium station for at least 10 simulated minutes.

Notes:

- _Add dated assessment notes here._
