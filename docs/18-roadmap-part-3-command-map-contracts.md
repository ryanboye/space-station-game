# Roadmap Part 3 - Command Center, System Map, Contracts, and Incidents

Last updated: 2026-05-02

Part 3 is intentionally later. It changes the strategic layer of the game: the station is no longer only responding to generic traffic and internal needs; it is making choices in a living system map with factions, contracts, command capability, dispatch, patients, and identity.

Do not start this part until Parts 1 and 2 have stabilized enough that actor behavior, jobs, utilities, and sanitation are readable.

## Goals

- Make the station feel operated, not just built.
- Make the system map useful rather than decorative.
- Let factions, lanes, planets, and belts generate contracts, prices, traffic, hazards, and reputation.
- Add reliable patient/incident/dispatch flows that use the job/provider/utility systems already built.

## Checkpoint 1 - Command Center And Operations Layer

- [ ] Add Command/Cockpit/Ops room or module.
- [ ] Gate advanced ship traffic, dispatch, sensors, station policies, and some incidents behind command capability.
- [ ] Show traffic, incident, alert, contract, and station policy state in Station Ops.
- [ ] Add operator/pilot role hooks from Part 1 roles.
- [ ] Add command work tasks where appropriate: monitor traffic, dispatch responder, scan lane, authorize docking, manage contract.

Player-facing surfaces:

- Command/Ops room inspector.
- Ops panel tab for traffic, dispatch, policies, contracts.
- Alerts that route through command when command exists.
- Agent inspector activity: operating console, dispatching, scanning, traffic control.

Checkpoint tests:

- [ ] `npm run test:sim`
- [ ] `npm run build`
- [ ] Command capability changes at least one traffic/dispatch/system behavior.
- [ ] Command job/task has visible operator, blocked reason, and outcome.

Notes:

- _Add dated implementation notes here._

## Checkpoint 2 - Actionable System Map

- [ ] Make lanes clickable for demand forecast, dominant factions, expected ship mix, hazards, and active contracts.
- [ ] Make factions clickable for relationship, preferred station identity, satisfaction, and rewards.
- [ ] Make planets/belts provide import/export/resource hooks: metal/materials, ice/water/air/hydro, gas/fuel/ducting/future refuel.
- [ ] Add "why this ship arrived" to ship inspector: lane, faction, contract, traffic roll.
- [ ] Let faction satisfaction influence ship mix, contract quality, prices, and incident risk.

Player-facing surfaces:

- System map detail panel for selected lane/faction/body.
- Contract offer panel.
- Ship inspector "origin/reason" section.
- Faction reputation summary in Ops.

Checkpoint tests:

- [ ] `npm run test:sim`
- [ ] `npm run build`
- [ ] System map/faction/lane data changes at least one gameplay input: traffic, price, contract, hazard, or ship mix.
- [ ] Ship inspector explains lane/faction/contract source.

Notes:

- _Add dated implementation notes here._

## Checkpoint 3 - Contracts And Station Identity

- [ ] Add contract families for trade hub, habitat, industrial, research, medical, military/security, leisure, and mixed stations.
- [ ] Let station identity emerge from accepted contracts, visitor mix, resident mix, modules, traffic lanes, and scoring.
- [ ] Add identity stats to ops/progression.
- [ ] Add contract success/failure consequences: credits, materials, faction reputation, traffic mix, rating, incidents, resident demand.
- [ ] Add contract requirements that use built systems: throughput, route quality, resident satisfaction, utility reliability, sanitation, security response, medical treatment.

Player-facing surfaces:

- Contract offer and active contract UI.
- Station identity summary.
- Contract progress meters and failure reasons.
- Faction reward/consequence text.

Checkpoint tests:

- [ ] `npm run test:sim`
- [ ] `npm run build`
- [ ] Contract completion/failure is visible and affects faction or station identity.
- [ ] At least one contract family pulls on Part 1 systems and one pulls on Part 2 systems.

Notes:

- _Add dated implementation notes here._

## Checkpoint 4 - Patients, Incidents, And Dispatch

- [ ] Add event generation tuned by traffic, station rating, hazards, utilities, sanitation, faction contracts, and station identity.
- [ ] Add patient flow: arrival, triage, route to clinic, treatment provider, outcome, rating/faction effect.
- [ ] Add dispatch flow for security, repair, fire, medical, and command alerts.
- [ ] Surface incident source, target, route, timer, responder, blocked reason, and resolution state.
- [ ] Add contract/faction incidents: inspections, VIP visits, labor disputes, cargo accidents, medical evacuations, security events.

Player-facing surfaces:

- Dispatch/incident panel in Ops.
- Incident markers and responder routes.
- Patient inspector and clinic provider state.
- Alerts with source, deadline, required response, and likely consequence.

Checkpoint tests:

- [ ] `npm run test:sim`
- [ ] `npm run build`
- [ ] Patient event spawns, routes, treats, and resolves in deterministic scenario.
- [ ] Dispatch event shows source/target/timer/responder/blocked reason.
- [ ] Failed resolution creates understandable consequences.

Notes:

- _Add dated implementation notes here._
