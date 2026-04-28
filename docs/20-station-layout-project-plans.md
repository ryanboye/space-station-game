# Station Layout Project Plans

Last updated: 2026-04-28

This file contains the active implementation packets for the current station-layout/simulation push. Historical packets for route intent, room environment scoring, utility maintenance debt, and diagnostic overlay foundation have landed and were removed from this file to avoid duplicate work.

Read this with:

- `docs/15-current-roadmap.md` for product direction.
- `docs/21-agent-handoff-layout-sim.md` for latest handoff notes.
- The relevant system docs before editing code.

## Current Design Rule

Do not add hidden simulation without a player-facing surface. Every new system should show up in at least one of:

- diagnostic overlay,
- room inspector,
- agent inspector,
- HUD/ops metric,
- route line or route-pressure heatmap,
- event log/alert.

## Current Code Reality

| System | State |
|---|---|
| Berths | Visitor/residential berths and capability modules exist. Approach clearance is still future work. |
| Pathing | Route intents exist for visitor, resident, crew, logistics, and security. Route pressure overlay exists. |
| Zones | Public/restricted exists but is still blunt. Stronger access rules are future work. |
| Visitors | Meals, leisure/market preference, route exposure, room environment penalties, patience/rating effects. Needs can be expanded. |
| Residents | Hunger, energy, hygiene, social, safety, stress, satisfaction, leave intent, routine phases, private housing, home ships. |
| Crew | Generalist crew with posts, logistics, rest, hygiene, morale/fatigue hooks, and inspectors. Specialties are future work. |
| Utilities | Global power/water/air plus local pressurization and life-support coverage diagnostics. Local air gameplay is future work. |
| Maintenance | Reactor/life-support debt exists and affects output. Dedicated repair jobs/specialties are future work. |
| Diagnostics | Air coverage, visitor status, resident comfort, service noise, maintenance, and route pressure overlays exist with keys/readouts. |

## Active Packet Sequence

1. **P8B - Route Conflict and Access Gameplay**
2. **P9 - Expanded Needs v0**
3. **P5B - Local Air Gameplay**
4. **P4B - Staff Specialization and Repair**
5. **Later - Berth Approach, Compartment Risk, Crime, Resident Businesses, World Map**

P8B and P9 are the best near-term MVP work because they make the current people/path systems more playable. P5B can run in parallel if a separate team owns utility code.

## Shared Handoff Rules

- Agents are not alone in the codebase. Do not revert unrelated edits.
- Check `git status --short` before modifying files.
- Keep PRs small. If a packet wants more than roughly 500 changed lines, split it.
- Prefer sim-side tests in `tools/sim-tests.ts`; run `npm run test:sim`.
- If touching UI or render, also run `npm run build`.
- If adding saved state fields, update `src/sim/save.ts` and add migration/defaults.
- If adding tile-index keyed state, update `expandMap` remapping.
- Preserve deterministic tests where possible.

---

# P8B - Route Conflict and Access Gameplay

## Goal

Turn route pressure from a cool debug view into a practical layout game. The player should understand why a corridor is bad and what kind of design change would fix it.

## Scope

Primary files:

- `src/sim/sim.ts`
- `src/sim/types.ts`
- `src/main.ts`
- `src/render/render.ts`
- `tools/sim-tests.ts`
- `docs/05-crew.md`
- `docs/06-visitors-residents.md`
- `docs/12-ui.md`

## Requirements

- Add route-problem reason helpers for route-pressure tiles:
  - visitor through cargo/service,
  - logistics through cafeteria/lounge/residential,
  - crew work route through public crowds,
  - resident route through utility/security/cargo,
  - high mixed-use pressure on a narrow tile.
- Show the reason in the route-pressure hover/readout.
- Add route conflict summary to room inspector when selected room has high route pressure or bad crossing.
- Make the gameplay effects more explicit in metrics:
  - visitor rating/spend/patience,
  - resident stress/satisfaction,
  - crew energy/hygiene/morale/work efficiency.
- Keep route costs soft. Bad layouts should hurt, not deadlock, unless walls/space/blocked effects truly prevent access.

## Acceptance Criteria

- Turning on route pressure immediately explains at least one bad tile in a flawed station.
- Selecting a problematic room shows matching route/access reasons.
- Existing route-pressure overlay still renders and updates.
- Tests cover at least one public/service route conflict and one residential/service route conflict.

---

# P9 - Expanded Needs v0

## Goal

Make crew and visitors create more believable station demand: shower/hygiene, toilet, sleep/rest, leisure, and social activity. This should create visible routes and queues, not hidden stat churn.

## Scope

Primary files:

- `src/sim/types.ts`
- `src/sim/sim.ts`
- `src/main.ts`
- `tools/sim-tests.ts`
- `docs/05-crew.md`
- `docs/06-visitors-residents.md`
- `docs/12-ui.md`

Use existing rooms first:

- `Hygiene` satisfies shower/toilet.
- `Dorm` satisfies sleep/rest.
- `Cafeteria`, `Lounge`, `Market`, and `RecHall` satisfy leisure/social.

Avoid adding new art or room types in this packet unless a later pass needs a truly separate queue surface. The current implementation deliberately reuses Hygiene and social/public rooms first.

## Need Model

| Need | Crew | Visitors | Residents |
|---|---|---|---|
| Hunger | lightweight meal pressure or existing food hooks | existing cafeteria meal service | existing |
| Rest/sleep | existing rest, improve capacity/target behavior | only for unusually long visits | existing |
| Hygiene/shower | existing meter, clearer target use | optional comfort desire on long waits | existing |
| Toilet | new short-cycle need through Hygiene | new short-cycle need for longer visits | fold into hygiene initially |
| Leisure | off-duty recovery now routes to social rooms | existing lounge/market preference becomes need-like | existing |
| Social | first pass uses Lounge, RecHall, Market, and Cafeteria | status/enjoyment in public rooms | existing social |

## Requirements

- Add inspector-facing active need/action reasons for crew and visitors.
- Add crew self-care target selection for hygiene/toilet/leisure/social/rest. Leisure/social v0 is implemented; explicit toilet pressure remains.
- Add visitor auxiliary service selection for toilet/leisure/social without overwhelming short visits. Hygiene/toilet v0 is implemented; visitor leisure/social remains.
- Add capacity/queue guards so actors distribute across service tiles.
- Route new trips with the correct intent:
  - crew self-care: `crew`,
  - visitor auxiliary trips: `visitor`,
  - logistics remains `logistics`.
- Surface the new behavior:
  - agent inspector shows active need and target,
  - room inspector shows usage/queue pressure,
  - route-pressure overlay shows the new trips naturally.

## Failure Effects

Keep v0 mild but legible:

- crew: morale/energy/hygiene/work-speed pressure,
- visitors: patience/rating/spend pressure,
- residents: stress/satisfaction/leave-intent pressure.

## Acceptance Criteria

- A station with enough Hygiene/Dorm/leisure capacity keeps crew and visitors stable.
- Isolating or removing Hygiene creates visible toilet/hygiene pressure.
- Long visitor stays create occasional extra trips, but early play is not swamped.
- Crew self-care competes with work, while critical emergency overrides still work.
- Tests cover one crew self-care target, one visitor auxiliary target, and overloaded target distribution.

## Parallelization

- Team A: shared types, inspector strings, metrics.
- Team B: crew self-care target expansion.
- Team C: visitor auxiliary needs.
- Team D: UI/readout/docs/tests.

Teams B and C should avoid rewriting the same actor loop. Add narrow helpers.

---

# P5B - Local Air Gameplay

## Goal

Use the life-support coverage diagnostics as a gameplay surface for local air quality. A disconnected or distant wing should become risky even if the station-wide average looks acceptable.

## Scope

Primary files:

- `src/sim/types.ts`
- `src/sim/sim.ts`
- `src/main.ts`
- `tools/sim-tests.ts`
- `docs/03-utilities.md`
- `docs/12-ui.md`

## Requirements

- Add `airQualityAtTile(state, tile)` or equivalent local-air storage.
- Keep `metrics.airQuality` as global average/trend for HUD continuity.
- Use life-support reachability, distance, pressurization, and active sources to compute local air risk.
- Apply local air to visitors, residents, and crew exposure checks.
- Update air coverage overlay/readout to make local failures obvious.

## Acceptance Criteria

- Actors in a well-covered core stay healthy.
- Actors in a disconnected pressurized wing become distressed/critical.
- The air overlay and agent inspector agree about the problem.
- Tests cover disconnected wing and healthy core behavior.

---

# P4B - Staff Specialization and Repair

## Goal

Make crew feel like hired workers with operational identities, and make maintenance debt a real staffing problem.

## Scope

Primary files:

- `src/sim/types.ts`
- `src/sim/sim.ts`
- `src/sim/save.ts`
- `src/main.ts`
- `tools/sim-tests.ts`
- `docs/05-crew.md`

## Requirements

- Add a minimal `CrewSpecialty` model, starting with a small set:
  - generalist,
  - mechanic,
  - operator,
  - logistics,
  - security.
- Add save/load defaults for old crew.
- Bias assignment scoring by specialty.
- Connect mechanic behavior to maintenance debt reduction.
- Surface specialty in crew inspector and hiring/crew UI.

## Acceptance Criteria

- Mechanics are better at clearing reactor/life-support maintenance debt.
- Operators are better at staffed utility/production posts.
- Logistics workers are better haulers.
- Security remains preferred for incidents.
- Old saves load with existing crew as generalists.

---

# Later Packets

These are intentionally deferred until the MVP route/needs/air loop is playable:

- berth approach clearance and large-ship exterior geometry,
- staff-only/service-only doors and richer access controls,
- pipes/ducts/power/water distribution,
- fire, leaks, hull breach, compartment isolation,
- crime/theft/gangs/contraband,
- resident-owned shops/cantinas/mechanic stalls,
- contracts, factions, station identity, regional/world map.
