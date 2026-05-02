# Station Layout Project Plans

Last updated: 2026-05-01

This file contains the active implementation packets for the MVP station-layout/simulation push. Historical packets that already landed have been removed or collapsed into the roadmap.

Read this with:

- `docs/15-current-roadmap.md` for product direction.
- `docs/21-agent-handoff-layout-sim.md` for latest handoff notes.
- The relevant system docs before editing code.

## Current Design Rule

Do not add hidden simulation without a player-facing surface. Every new system should show up in at least one of:

- diagnostic overlay,
- room inspector,
- agent inspector,
- construction/site inspector,
- HUD/ops metric,
- route line or route-pressure heatmap,
- event log/alert.

## Current Code Reality

| System | State |
|---|---|
| Berths | Visitor/residential berths and capability modules exist. Approach clearance is still future work. |
| Pathing | Route intents exist for visitor, resident, crew, logistics, security, self-care, and construction. Route pressure overlay exists. |
| Zones | Public/restricted exists but is still blunt. Stronger access rules are future work. |
| Visitors | Meals, leisure/market preference, expanded auxiliary needs, route exposure, room environment penalties, patience/rating effects. Needs need balance tuning. |
| Residents | Hunger, energy, hygiene, social, safety, stress, satisfaction, leave intent, private housing, home ships. |
| Crew | Generalist crew with posts, logistics, rest, hygiene/toilet/leisure/social, repair/fire/construction jobs, and inspectors. Specialties are future work. |
| Utilities | Global resources plus local pressurization, local air, vents, fire, and life-support coverage diagnostics. Spatial power/water/ducting is future work. |
| Maintenance | Reactor/life-support debt exists, affects output, can ignite fires, and can be repaired by jobs. Dedicated mechanics are future work. |
| Construction | Interior and exterior blueprints, material delivery, build jobs, cancel tool, and EVA routing exist. Airlock and construction inspection polish is active. |
| Diagnostics | Air coverage, visitor status, resident comfort, service noise, maintenance, route pressure, keys, hover/readouts, and side inspectors exist. |

## Active Packet Sequence

1. **P0 - Construction/EVA Polish and Wall Fixtures**
2. **P1 - Unified Needs and Service Queue Balance**
3. **P2 - Access and Route-Control Gameplay**
4. **P3 - Janitor/Sanitation Loop**
5. **P4 - Command Center and Operations Layer**
6. **P5 - Electrical/Mechanical Distribution v0**
7. **P6 - Incidents, Patients, and Dispatch**
8. **P7 - Station Identity and Contracts**

P0 is the current implementation packet. It should leave the game easier to build in and easier to debug before deeper systems are added.

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

# P0 - Construction/EVA Polish and Wall Fixtures

## Goal

Make construction feel like a real station operation instead of instant painting, and make utility fixtures physically legible. Crew should haul materials, build at the work site, use airlocks for exterior work, wear suits only while transitioning through/existing outside, and interact with wall-mounted fixtures from adjacent service tiles.

## Scope

Primary files:

- `src/sim/types.ts`
- `src/sim/balance.ts`
- `src/sim/sim.ts`
- `src/main.ts`
- `src/render/render.ts`
- `tools/sim-tests.ts`
- `docs/02-build-and-world.md`
- `docs/03-utilities.md`

## Requirements

- Wall-mounted fixture foundation:
  - support module definitions with `mount: "wall"`,
  - place vents, fire extinguishers, and wall lights on wall tiles,
  - require an adjacent walkable service tile,
  - center effects from the service side when appropriate,
  - let construction/repair jobs path to the service side, not the wall tile itself.
- EVA polish:
  - preserve airlock pressurization; an airlock is not a hole in the hull,
  - suit state should follow airlock/vacuum transitions, not assignment alone,
  - exterior build jobs should expose blocked state and access problems clearly,
  - cancel-build should remain drag-friendly and refund delivered materials.
- Player-facing surfaces:
  - visible airlock sprite/read as a thick technical hatch,
  - construction markers should distinguish material delivery, build work, EVA, and blocked states,
  - selection/inspector should explain blocked construction sites.

## Acceptance Criteria

- A vent placed on a valid wall projects air from its adjacent service tile.
- A fire extinguisher placed on a valid wall suppresses nearby utility fire.
- Wall-mounted modules cannot be placed on floors or isolated walls.
- Construction jobs for wall-mounted fixtures are reachable from adjacent floor/service tiles.
- Airlocks do not vent an otherwise sealed station.
- EVA suits are used for exterior/vacuum work, not simply because a job was assigned.
- `npm run test:sim` and `npm run build` pass.

---

# P1 - Unified Needs and Service Queue Balance

## Goal

Unify crew and visitor need handling enough that needs are tunable, inspectable, and do not cause swarming or constant retargeting.

## Requirements

- Create shared helpers for service providers, reservations, queue pressure, and retarget cooldowns.
- Keep role-specific desire weights, but avoid separate incompatible systems for the same need.
- Add clear inspector strings for active need, target, reservation, and failure reason.
- Add capacity guards that spread actors across toilets, showers, beds, seats, bars, markets, and cafeterias.
- Tune failure effects mildly at first: crew morale/work speed, visitor patience/rating/spend.

## Acceptance Criteria

- A balanced station distributes actors across multiple valid service points.
- Removing or isolating a service creates visible pressure, not task churn.
- Crew and visitors report comparable need/target/reservation fields in the inspector.

---

# P2 - Access and Route-Control Gameplay

## Goal

Turn route pressure from a cool debug view into a practical layout game. The player should understand why a corridor is bad and have tools to solve it.

## Requirements

- Strengthen public/restricted semantics.
- Add clearer staff/service/visitor/resident route costs or permissions.
- Surface route conflicts in overlay keys, hover readouts, room inspectors, and rating/morale/stress drivers.
- Keep soft route costs as the default; deadlock only on true physical disconnection.

---

# P3 - Janitor/Sanitation Loop

## Goal

Add a daily station-life maintenance loop that makes public areas, kitchens, bathrooms, showers, and dorms visibly degrade and recover.

## Requirements

- Track room dirt/trash/sanitation pressure.
- Add janitor or cleaning job assignment.
- Make dirty rooms affect visitor status, resident comfort, hygiene, and food/public rating.
- Surface dirt in room inspectors and a future sanitation overlay.

---

# P4 - Command Center and Operations Layer

## Goal

Make the station feel operated, not just built. A cockpit/command center should anchor ship traffic, alerts, dispatch, sensors, policy, and later contracts.

## Requirements

- Add a Command/Cockpit room or module.
- Gate advanced ship traffic, dispatch, and incidents behind command capability.
- Show traffic/incident/alert state in Station Ops.
- Keep early-game station building possible without too much ceremony.

---

# P5 - Electrical/Mechanical Distribution v0

## Goal

Make power/water/ducting spatial through wall-mounted or wall-adjacent fixtures without turning the game into pipe spaghetti.

## Requirements

- Add wall panels/ducts/pumps/conduits as inspectable fixtures.
- Make mechanics repair wall-mounted systems from adjacent service tiles.
- Show coverage and bottlenecks through overlays.
- Start with forgiving radii and simple networks; add strict routing only after overlays are clear.

---

# P6 - Incidents, Patients, and Dispatch

## Goal

Make advanced operations playable by reliably generating and resolving patients and dispatched incidents.

## Requirements

- Add event generation tuned by traffic, rating, hazards, and station identity.
- Route patients to medical service and incidents to dispatch/security/repair crews.
- Surface incident source, target, timer, and resolution state.

---

# P7 - Station Identity and Contracts

## Goal

Make stations diverge into trade hub, habitat, industrial, research, medical, military/security, or mixed identities.

## Requirements

- Add contract/scenario asks that reward different layouts.
- Bias visitor and ship mix by facilities and reputation.
- Add station identity stats to ops and progression.
