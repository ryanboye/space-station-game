# 22 Reputation, Property Value, And Security

Last updated: 2026-05-05

Status: product and implementation proposal. This plan turns the current "many systems as checklist" problem into a shared station-identity loop: local property value, local notoriety, crime pressure, and a security response model that makes high-value and seedy areas play differently without requiring explicit "prestige mode" / "crime mode" toggles.

## Codex Working Instructions

- At the start of every session that works on this slice, re-open this document and continue from the first unchecked item.
- Work through the checklist line by line. If a later item becomes possible early, it is okay to do it, but still return here and mark the earlier dependency status clearly.
- When an item is completed, change `[ ]` to `[x]` in this file in the same change set or the next small doc update.
- When a concern, tradeoff, regression risk, or implementation discovery appears, add a short dated note under **Implementation Notes And Concerns**.
- Keep this checklist, the code, and the tests in sync. Do not claim a section is complete until the relevant tests, UI, docs, or manual playtest notes are recorded below.
- Keep the first vertical slice small. The goal is not a full faction/crime game; the goal is to make existing rooms produce local reputation pressure and give security a real job.
- Prefer derived scores over explicit room alignment toggles. Rooms become prestigious or notorious because of modules, layout, service quality, traffic, privacy, incidents, and policies.
- Do not add a new system unless it creates a player-facing surface: overlay, inspector row, offer, incident, responder behavior, policy, or visible economic consequence.
- Use existing incident, security, resident, visitor, room-environment, route-exposure, berth, and station-rating systems where possible before creating new scaffolding.

## Completion Definition

- [ ] Pass 1 is implemented as a playable security/incident slice: incident markers are selectable, alerts can focus/select incidents, incidents expose subject/responder/target state, and detained subjects can be escorted to an active Brig or ejected/warned if no Brig is available.
- [ ] Pass 1 improves existing trespass/fight handling before adding new reputation-crime content.
- [ ] Pass 2 is implemented as a playable reputation slice: local prestige/notoriety/control/crime-pressure scoring, reputation overlay, theft incident, and demand/economic hooks across at least six current room/system families.
- [ ] Pass 2 includes one "green zone" participation path: higher-prestige public/resident areas attract better spend, better resident conversion, better tenant offers, or better ship/contract interest.
- [ ] Pass 2 includes one "red zone" participation path: higher-notoriety berth/market/cantina/workshop/logistics areas attract risky income, risky traffic, shady tenants, or higher-margin offers.
- [ ] Security response from Pass 1 materially affects Pass 2 reputation outcomes: resolved/contained incidents differ from failed/uncontrolled incidents.
- [ ] `npm run test:sim` passes.
- [ ] `npm run build` passes.
- [ ] Localhost playtest confirms incident selection, security response, Brig handling, reputation overlay, room inspector, theft, and demand effects are understandable.
- [ ] This checklist has all completed items checked and any leftover concerns documented.

## Goal

Let players design different pockets of the station with different identities:

- a polished promenade that attracts VIPs, high-value residents, premium shops, and reputable contracts;
- a rough cargo/cantina/market pocket that attracts risky traffic, shady business, and higher-crime income;
- service and utility zones that support those identities without becoming their own separate minigames.

The player should participate by shaping conditions, not by choosing a global morality path. A zone becomes prestigious because it is clean, comfortable, scenic, well-served, and controlled without feeling oppressive. A zone becomes notorious because it has traffic, privacy, cargo access, weak oversight, incidents, and profitable opacity.

## Product Thesis

The core tension is:

> High-value spaces attract better demand, but value plus opacity creates crime pressure.

The player can curate a green zone, tolerate a red zone, or build a mixed station. The interesting play is in the boundaries:

- Can the player keep red-zone incidents from leaking into the high-prestige promenade?
- Can they use customs, security, and routing to tax or contain shady traffic without cleaning it out completely?
- Can they protect high-value guests without filling the luxury area with ugly force?
- Can they use layout to put visible security where it is accepted and discreet control where it would hurt prestige?

## Current Reality

The repo already has useful pieces:

- room environment traits: visitor status, residential comfort, service noise, public appeal;
- route exposure penalties for public actors crossing service/security/residential/cargo spaces;
- station rating and rating breakdowns;
- visitors, residents, private-resident housing, resident satisfaction, resident tax, and conversion;
- Berth rooms with Gangway, CustomsCounter, and CargoArm modules;
- Security and Brig rooms, security aura, trespass/fight incidents, response pipeline, and Brig containment multiplier;
- Market spend, workshop trade goods, cargo/logistics rooms, Cantina, Lounge, Observatory, RecHall, and sanitation/maintenance/air systems.

The weakness is that many of these are currently binary or global. A Market is mostly "present or not"; Security is mostly aura; Berths admit ship families but do not yet create local trust/risk; incidents do not produce local reputation memory.

This slice should connect existing local conditions into one readable loop.

## Design Rules

- Prestige and notoriety are separate axes, not opposites.
- Control is a tool, not an identity. Both polished and seedy stations need control.
- Visible force can reduce prestige even while it lowers crime.
- Notoriety is not automatic failure. Uncontrolled crime is failure.
- Rooms should expose ordinary operational levers: screening, leases, access, quality, audits, patrols, privacy, throughput.
- A room can be high-prestige/high-notoriety, low-prestige/high-notoriety, high-prestige/low-notoriety, or low/low.
- Incidents should create local memory so the station has neighborhoods, not just a global score.
- MVP scoring should be derived and explainable before it is perfectly realistic.

## Core Scores

### Local Zone Scores

Pass 2 can derive zones from room clusters and local radius samples. A manual district/zoning tool can come later.

Suggested score fields:

```ts
export interface ReputationZoneScore {
  anchorTile: number;
  room: RoomType;
  tiles: number[];
  prestige: number;      // 0..100
  notoriety: number;     // 0..100
  control: number;       // 0..100
  value: number;         // economic target value
  opacity: number;       // privacy/blind spots
  crimePressure: number; // value + opacity + traffic + chaos - control
  recentIncidentHeat: number;
  label: ReputationZoneLabel;
}
```

Suggested labels:

- `polished`
- `premium`
- `ordinary`
- `rough`
- `seedy`
- `exclusive`
- `industrial`
- `high-risk`

### Score Inputs

| Input | Raises | Examples |
|---|---|---|
| Polish | Prestige | plants, benches, lights, clean floors, good air, low noise |
| Value | Prestige income and crime pressure | premium market, VIP dorm, observatory, luxury lounge |
| Opacity | Notoriety and crime pressure | private rooms, isolated corridors, weak security, low visibility |
| Throughput | Income and opportunity | larger berths, busy markets, crowded cantinas |
| Control | Crime suppression | security aura, customs, patrols, cameras, access gates, audits |
| Visible force | Control, but may reduce prestige | brig, checkpoints, heavy patrols near VIP rooms |
| Incidents | Lower prestige, raise notoriety | theft, fight, trespass, failed detention |
| Chaos | Temporary crime openings | brownout, blocked corridor, maintenance failure, fire, air emergency |

### Station Reputation

Station-level reputation should be derived from zones weighted by traffic and economic importance:

- public rooms and berths affect visitor impressions;
- private resident areas affect resident demand and retention;
- cargo/service zones affect notoriety and risky ship demand;
- recent incidents create temporary reputation memory.

This should eventually sit beside or partially replace the current global Station Rating, but the first reputation pass can feed into it without deleting old rating behavior.

## Player Demand

Property value matters only if demand reacts to it.

Green-zone demand:

- wealthier tourists spend more;
- private residents convert more often or pay more;
- premium market/cantina tenants request leases;
- VIP or reputable ship/contract offers appear;
- scandals hit harder when incidents occur nearby.

Red-zone demand:

- shady traders, industrial ships, and risky cargo offer better margins;
- gray-market/pawn tenants request stalls;
- cash residents or rough visitors appear;
- customs and security can extract fees, seizures, or order bonuses;
- incidents are tolerated until they become uncontrolled or leak into green zones.

## Current Room/System MVP Map

This table names one feasible MVP participation feature per current room/system. Some rows are Pass 1 incident/security work; most are Pass 2 reputation hooks or staged follow-ups so the first playable slice does not blow up scope.

| Room/System | Feasible MVP Feature | Prestige Participation | Notoriety Participation | Implementation Notes |
|---|---|---|---|---|
| Berth / Dock | Per-berth screening rule using existing allowed ship config and CustomsCounter presence | Screened, clean, low-wait arrivals raise trust and support VIP/reputable traffic | Open or low-screening berths raise risky traffic and smuggling/theft pressure | Start with `screeningLevel` values `open` / `standard` / `strict`; strict adds control and delay, open adds throughput/risk |
| CustomsCounter | Processing/control module inside Berth | Discreet customs supports safe premium arrivals | In red zones it becomes a toll gate for risky cargo if screening is loose | Same module, different surrounding score; do not add a "bribe" button in the first reputation pass |
| Market / MarketStall | Stall lease class or tenant offer per MarketStall | Boutique vendor raises spend and prestige, hates theft | Pawn/gray vendor raises notoriety income and theft/fencing risk | Pass 2 can auto-derive tenant class from local scores, then later let player accept offers |
| Cantina | House-rules policy for drink pace and disorder | Controlled service supports nightlife prestige and lowers fights | Loose service increases throughput/spend and disorder | Use existing BarCounter/Tap throughput; policy changes fight/crime pressure and dwell/spend |
| Lounge | Access/privacy rule for lounge cluster | Public/premium lounge raises visitor comfort and VIP itinerary value | Private/isolated lounge increases opacity and meeting risk | Can start derived from zoning, doors, security distance, and crowding before adding a UI rule |
| Observatory | Ticketed premium attraction value | Strong prestige anchor, boosts wealthy visitor interest | If isolated and poorly controlled, becomes high-opacity meeting space | Keep simple: high prestige/value, high scandal damage if incident occurs nearby |
| Dorm / private residents | Lease demand for private-resident beds | Executive/private residents pay more in high-prestige quiet zones | Cash/no-questions tenants prefer red zones later | Pass 2 can adjust conversion/rent by local prestige; shady tenant offers can be follow-up |
| Hygiene | Private-suite quality support | Adjacent clean private hygiene boosts private-resident prestige | Poor/isolated hygiene harms prestige and may hide incidents later | Keep as support score in Pass 2, not a separate incident source |
| Workshop / Workbench | Work-order audit level or certified/rush production | Certified production supports reputable industrial contracts, lower tool leakage | Rush/off-book production raises margins and theft/tool risk | Start by making workbenches value/crime targets; add audit policy after theft works |
| Storage / LogisticsStock | Manifest/audit level for cargo areas | Sealed stockrooms protect reputation and reduce shrinkage | Open stockrooms improve throughput but create contraband/shrinkage | Pass 2 can use public route exposure + security aura + cargo proximity |
| Security | Security posture by room or staff assignment | Discreet response protects green zones with smaller prestige penalty | Visible patrols stabilize red zones and deter fights/theft | Pass 1 makes incidents physical; Pass 2 can keep aura math but add visible-force penalty near luxury rooms |
| Brig | Real detention processing | Hidden/efficient Brig protects trust after incidents | Red-zone Brig supports crackdowns and keeps disorder subordinate | MVP must escort detained subject to Brig or eject/warn if no Brig is active |
| Cafeteria | Meal service quality from cleanliness, crowding, and kitchen uptime | Good service supports green-zone visitor/resident value | Crowded/cheap service raises disorder and low-prestige traffic | Avoid separate food-quality economy in Pass 2; derive from current food loop and environment |
| Kitchen | Stock/service reliability score | Reliable clean kitchen supports premium dining | Poor audits create supply theft hooks later | Treat as support for cafeteria/cantina value in Pass 2 |
| Clinic | Trust and scandal recovery support | Nearby active Clinic protects premium/resident confidence | Later: quiet treatment/no-questions medicine | Pass 2 support only: medical capability softens incident/death reputation damage |
| RecHall | Supervised social pressure | Safe social space raises resident comfort | Crowded/low-control RecHall raises fights | Existing resident fight system already fits; feed local score into confrontation risk later |
| Hydroponics | Freshness/green polish source | Raises food prestige and local property value | Later: illegal grow or off-book botanicals if desired | Pass 2 prestige support only; avoid forcing every room to have a red-zone use |
| LifeSupport / Vents | Comfort/reliability input | Good air protects property value and VIP demand | Failures create chaos openings for theft/fights | Keep as score input and chaos multiplier, not a direct crime feature |
| Reactor | Reliability/noise/industrial exposure input | Hidden reliable power supports trust | Public industrial exposure lowers prestige and raises rough-zone identity | Pass 2 should only feed environment/control/chaos scoring |
| Maintenance | Chaos disruptor and property-value support | Fast maintenance preserves green-zone property value | Deferred maintenance makes red zones rougher and creates crime openings | Use current maintenance debt/warnings as modifiers |
| Bridge / Terminals | Future policy owner | Security/records/navigation terminals can unlock better control | Industrial/logistics/comms terminals can unlock risky offers/contracts | Do not block Pass 1 or Pass 2 on terminal governance unless a department is already in place |

## Proposed New Building Blocks

These are future-friendly pieces that layer onto the same score model.

| Feature | Prestige Use | Notoriety Use | Suggested Timing |
|---|---|---|---|
| Reputation overlay | Shows property value and risk pockets | Shows red zones and crime pressure | Pass 2 |
| Room/zone inspector | Explains why area is green/red/high-risk | Explains value, opacity, incidents, control | Pass 2 |
| Theft incident | Tests high-value low-control spaces | Creates local red-zone memory and risky income consequences | Pass 2 |
| Escort-to-Brig | Protects green-zone trust | Keeps red-zone disorder subordinate | Pass 1 |
| Tenant offers | Boutique shops, premium bars, executive residents | Pawn stalls, rough bars, cash tenants | Pass 2 follow-up |
| Customs screening policy | Trusted VIP/reputable arrivals | Managed smuggling and seizure/toll income | Pass 2 |
| Patrol posts/routes | Discreet safety or concierge presence | Visible enforcement in rough zones | V2 |
| Cameras/sensors | Low-friction detection | Surveillance/intimidation, tamper targets | V2 |
| Access gates/checkpoints | VIP exclusivity, safe routing | Gangway chokepoints, shake-down risk if control fails | V2 |
| Premium goods | More legitimate spend | More theft/fencing value | V2 |
| Private booths | VIP privacy | Hidden meetings and deal-making | V2 |
| Contracts/offers | Premium events and reputable trade | Risky cargo, gray-market work, enforcement jobs | V2 |
| Heat/investigation | Restore trust after scandal | Suppress or redirect authority pressure | Later |

## Two-Pass MVP Slice

Split the MVP into two passes so the reputation layer has something tangible to react to.

### Pass 1 - Security And Incident Handling

Pass 1 is not the reputation system yet. It makes incidents feel like physical station events the player can inspect, select, and respond to.

Player-facing goals:

1. Incident alerts can focus/select the incident on the map.
2. Incident markers can be clicked directly.
3. Selected incident inspector shows type, stage, tile, subject, responder, target, timer, blocked reason, and likely consequence.
4. Security responders target suspects/participants, not just an abstract tile.
5. Detained subjects are escorted to an active Brig when possible.
6. If no Brig is active or reachable, responders warn/eject with weaker recovery.
7. Brig occupancy/holding has a visible state, even if it is simple.

Pass 1 should improve current trespass and fight incidents first. Theft can wait for Pass 2.

Recommended Pass 1 hooks:

- Trespass: security intercepts, warns, ejects, or detains depending on severity and Brig availability.
- Fight: security separates participants; severe fights can detain one or both participants.
- Brig: active CellConsole creates holding capacity; held subjects release/eject after a timer.
- UI: incident marker, selected incident panel, alert click-to-focus, subject/responder route lines.

### Pass 2 - Reputation, Property Value, And Room Breadth

Pass 2 adds the actual property-value loop on top of the improved incident substrate.

Core loop:

1. Derive local zone scores.
2. Show a reputation/property-value overlay and selected-zone inspector rows.
3. Add theft as the first value-driven crime.
4. Use Pass 1 security outcomes to decide whether incidents become contained warnings, scandals, or red-zone disorder.
5. Make multiple room families participate in prestige/notoriety demand.

Recommended Pass 2 hooks:

- Market: local prestige increases spend and boutique-leaning value; local notoriety increases gray-market spend and theft pressure.
- Berth/Customs: screening level + CustomsCounter + ship type/size drive traffic value, processing delay, control, and risky-traffic attractiveness.
- Private residents: local prestige increases conversion/rent; privacy/low control raises opacity; nearby incidents reduce appeal.
- Cantina: controlled house rules support prestige nightlife; loose/crowded service raises spend, notoriety, and fight/theft pressure.
- Lounge/Observatory: comfort/scenic rooms become green-zone anchors; excessive isolation/privacy raises opacity and scandal risk.
- Workshop: active workbenches add productive value and tool-theft pressure; audit/control later differentiates certified vs off-book production.
- Storage/LogisticsStock: cargo-adjacent rooms create red-zone opportunity; manifest/audit policy later lets the player trade throughput for control.
- RecHall/Cafeteria: crowding, cleanliness, and nearby control feed social disorder or civic comfort without creating separate minigames.
- Security/Brig: real response and detention determine whether an incident becomes scandal, warning, contained disorder, or failed enforcement.

Defer until after the two-pass MVP:

- full tenant offer UI;
- bribery/corruption/faction systems;
- contraband inventory;
- murder/organized crime;
- authority raids/legal heat;
- manual district painter;
- cameras and access gates.

## Checklist

### 0. Baseline And Scope Control

- [ ] Confirm branch and git status before editing.
- [ ] Re-read `docs/06-visitors-residents.md`, `docs/07-docks-ships.md`, `docs/08-incidents-effects.md`, and `docs/10-economy-rating.md`.
- [ ] Re-read `docs/99-trip-wires.md`, especially incident, visitors/residents, docks, and rating sections.
- [ ] Confirm whether Pass 1 and Pass 2 land in one branch or two stacked branches.
- [ ] Record the starting branch, base commit, and any local constraints in the notes section.

### 1. Existing System Reconnaissance

- [ ] Map current room clusters and room-environment scoring.
- [ ] Map current route-exposure penalties and route-pressure overlay.
- [ ] Map current station-rating update paths and per-reason breakdowns.
- [ ] Map current Market spend, trade-good stock, and MarketStall item-node behavior.
- [ ] Map current Berth capability matching, per-berth allowlists, and CustomsCounter placement rules.
- [ ] Map current Security aura, incident pipeline, responder assignment, Brig multiplier, and fight/trespass outcomes.
- [ ] Map current resident conversion/rent/tax/private housing requirements.
- [ ] Record any trip-wires found during reconnaissance.

### 2. Pass 1 - Incident Selection And UX

- [ ] Add selected-incident state to the UI/sim facade without replacing selected actor/room flows.
- [ ] Make incident world markers clickable.
- [ ] Make incident alerts click-to-focus and click-to-select.
- [ ] Add selected incident inspector rows: type, stage, outcome, severity, subject ids, responder id, target tile, deadline, and blocked reason.
- [ ] Show responder and subject route lines when an incident is selected.
- [ ] Keep resolved/failed incidents selectable during their retention window.
- [ ] Add a small scenario or debug setup with active trespass/fight incidents for manual UX testing.

### 3. Pass 1 - Security And Brig Response

- [ ] Extend incident subject handling so security can target a suspect or participant, not only an incident tile.
- [ ] Add detained/ejected/warned outcomes where appropriate.
- [ ] Make security responders physically intercept the subject or participant.
- [ ] Make detained subjects route with or alongside a security responder to an active Brig.
- [ ] If no active Brig exists, resolve detention-capable incidents as warning/ejection with weaker recovery.
- [ ] Make Brig capacity or active CellConsole matter in a minimal way.
- [ ] Add holding/release/ejection timer state for detainees.
- [ ] Keep existing trespass/fight behavior working and preserve `incidentsResolvedLifetime` semantics.
- [ ] Add visible inspector/debug rows for responder, suspect, Brig target, holding state, and blocked reason.
- [ ] Add tests for escort-to-Brig, no-Brig fallback, blocked route, and fight/trespass regression.

### 4. Pass 1 - Verification

- [ ] Add sim tests for existing trespass selection and resolution.
- [ ] Add sim tests for existing fight selection and resolution.
- [ ] Add sim tests for security escort-to-Brig.
- [ ] Add regression tests for `incidentsResolvedLifetime`.
- [ ] Add UI/manual playtest notes for click-to-select, alert focus, and route-line readability.
- [ ] Run `npm run test:sim`.
- [ ] Run `npm run build`.
- [ ] Playtest a security/incident scenario locally.
- [ ] Record Pass 1 verification notes below.

### 5. Pass 2 - Reputation Data Model

- [ ] Add derived local reputation zone score types without committing to saved manual districts.
- [ ] Add score derivation helpers for room clusters and local radius samples.
- [ ] Include inputs for room environment, cleanliness/sanitation, maintenance/air, security aura, visible force, incidents, traffic, privacy/opacity, and nearby room mix.
- [ ] Add bounded score bands and labels so the overlay can speak in plain language.
- [ ] Keep Pass 2 scores derived from state. Save only persistent incident memory or policy choices if needed.
- [ ] Add deterministic tests for score derivation on small fixture layouts.

### 6. Pass 2 - Reputation Memory And Theft

- [ ] Add local reputation memory for recent incidents by tile/zone anchor with decay.
- [ ] Add `theft` to `IncidentType` with a bounded subject/target model.
- [ ] Spawn theft from high `crimePressure` in value-bearing areas: Market, Workshop, Storage/LogisticsStock, Berth/CargoArm, private Dorm, and high-value Cantina/Lounge/Observatory pockets.
- [ ] Scale theft value from room/module score rather than inventing detailed item rarity in Pass 2.
- [ ] On resolved theft, reduce local incident heat and recover part of the value.
- [ ] On failed theft, apply local prestige hit, notoriety memory, station-rating penalty, and value loss.
- [ ] Use Pass 1 detention/ejection/Brig outcomes to differentiate contained theft from failed theft.
- [ ] Add tests for theft spawn suppression, resolution, failure, local memory decay, and Brig-mediated recovery.

### 7. Pass 2 - Room And Economic Hooks

- [ ] Add per-berth `screeningLevel` or equivalent policy, defaulting to standard for old saves.
- [ ] Make CustomsCounter and screening level affect berth control, processing time, and risky-traffic attractiveness.
- [ ] Make Market spend respond to local prestige/notoriety and recent theft.
- [ ] Add simple MarketStall value classification: ordinary, boutique-leaning, gray-leaning, derived from local scores.
- [ ] Make private-resident conversion/rent respond to local private-housing prestige, opacity, and recent incidents.
- [ ] Make Cantina service posture or derived crowding/noise affect spend, fight pressure, and local notoriety.
- [ ] Make Lounge and Observatory contribute stronger green-zone value, with higher scandal damage from unresolved incidents.
- [ ] Make Workshop value raise production upside and tool-theft pressure.
- [ ] Make Storage/LogisticsStock and cargo-adjacent Berths raise red-zone opportunity when under-controlled.
- [ ] Make Security/Brig visible-force penalties apply near high-prestige public/private rooms.
- [ ] Feed RecHall/Cafeteria crowding, cleanliness, and control into social disorder or civic comfort if safe to do without rebalancing residents broadly.
- [ ] Keep support rooms such as Hydroponics, Kitchen, Clinic, LifeSupport, and Maintenance as score inputs in Pass 2 rather than separate offer systems.

### 8. Pass 2 - Demand And Station Reputation

- [ ] Add station-level prestige/notoriety summaries weighted by visited zones and active economic rooms.
- [ ] Use high prestige to improve wealthy visitor spend, resident conversion, premium tenant offers, or premium ship/contract chance.
- [ ] Use high notoriety to improve risky cargo/industrial/trader offer chance, gray-market tenant offers, or risky income.
- [ ] Penalize green-zone incidents more harshly than red-zone incidents.
- [ ] Penalize red-zone disorder only when it fails security response, escalates, or leaks into green zones.
- [ ] Add clear metric breakdowns so players can tell whether value, opacity, traffic, or weak control is driving crime.

### 9. Pass 2 - UI, Overlay, Inspectors, And Scenario

- [ ] Add `reputation` or `property-value` diagnostic overlay.
- [ ] Show prestige/notoriety/control/crime-pressure color bands without hiding build readability.
- [ ] Add selected room/zone inspector rows: label, prestige, notoriety, value, opacity, control, top drivers, recent incidents.
- [ ] Add Station Ops summary for station reputation mix and top risky zones.
- [ ] Add alert copy for high-value low-control areas and unresolved theft.
- [ ] Add `?scenario=reputation-slice` with a green public zone, red berth/cantina/market/workshop/logistics zone, active security, Brig, and theft pressure.
- [ ] Verify desktop and mobile-ish viewport readability in the browser.

### 10. Pass 2 - Tests And Verification

- [ ] Add sim tests for local score derivation and labels.
- [ ] Add sim tests for Market spend/reputation modifiers.
- [ ] Add sim tests for Berth screening/reputation modifiers.
- [ ] Add sim tests for private-resident conversion/rent modifiers if implemented.
- [ ] Add sim tests for Cantina, Lounge/Observatory, Workshop, and Storage/Logistics reputation modifiers if implemented.
- [ ] Add sim tests for theft incident lifecycle.
- [ ] Add sim tests for security escort-to-Brig interaction with theft.
- [ ] Add regression tests for existing trespass/fight resolution and `incidentsResolvedLifetime`.
- [ ] Run `npm run test:sim`.
- [ ] Run `npm run build`.
- [ ] Playtest `http://localhost:5174/?scenario=reputation-slice`.
- [ ] Record Pass 2 verification notes below.

### 11. Follow-Up Layers

- [ ] Tenant offers for MarketStall, Cantina, and private Dorm clusters.
- [ ] Customs policy depth: strict screening, selective screening, expedited clearance, seizure office.
- [ ] Security posture depth: discreet, standard, visible patrol.
- [ ] Patrol route or post placement.
- [ ] Cameras/sensors and blind-spot overlay.
- [ ] Access gates/checkpoints and privacy/friction effects.
- [ ] Contraband incident for Berth/Storage/Market.
- [ ] Contract families that react to station reputation: VIP event, reputable trade, risky cargo, gray-market fair.
- [ ] Authority heat/investigation layer if notoriety needs an external pressure.
- [ ] Manual district naming/painter only after derived zones prove useful.

## Implementation Notes And Concerns

- 2026-05-05: Design decision: avoid literal `Prestige Mode` / `Notoriety Mode` toggles. Use property-value style scoring from local conditions and ordinary operational levers.
- 2026-05-05: Design decision: split MVP into two passes. Pass 1 makes security incidents physical, selectable, and Brig-aware. Pass 2 adds reputation/property value, theft, and broader room hooks across Market, Berth/Customs, private residents, Cantina, Lounge/Observatory, Workshop, Storage/Logistics, and support rooms.
- 2026-05-05: Design decision: Notoriety is not failure. A red zone should be playable if incidents are contained and demand remains profitable.
- 2026-05-05: Scope concern: tenant offers, contraband inventory, bribery, gangs, and authority heat are all tempting but should wait until the property-value overlay and first crime response loop are visible.
- 2026-05-05: Security concern: preserve `incidentsResolvedLifetime` event semantics when adding theft or escort states.

## Verification Log

- _Add dated verification notes here._
