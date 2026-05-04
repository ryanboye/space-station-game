# Entropy, Station Drift, And Seeded Build Pressure

Last updated: 2026-05-03

Status: design notes and roadmap-slice proposal. This captures the May 3 design discussion, not an implementation already in progress.

## Implementation Plan Split

This high-level thesis has been split into implementation-sized specs:

- `docs/19-1-sanitation-cleaning-loop.md` - dirt, grime, sanitation overlays, cleaning jobs, and crew cleanup behavior.
- `docs/19-2-maintenance-debris-and-eva-repair.md` - broader station wear, exterior hull maintenance, debris-seeded pressure, and EVA repair work.
- `docs/19-3-sunlight-shade-thermal-air.md` - seed-driven sunlight/shadow bands, thermal pressure, seeded space backdrop, insulation, and deeper life-support/air interactions.
- `docs/19-4-shared-drift-spine-and-rollout.md` - cross-cutting data model, job-volume controls, UI vocabulary, save/load concerns, scenarios, and sequencing.

Recommended implementation order:

1. Ship sanitation first. It is the smallest standalone entropy loop, existing grime sprites already exist, and it proves whether visible everyday decay is fun.
2. Expand maintenance second. The current maintenance loop already covers reactor/life-support debt, repair jobs, fire risk, and a maintenance overlay, so this should extend that spine to hull, docks, modules, debris, and EVA.
3. Add sunlight/shade third. It is the largest feature because it touches map conditions, background art, heat, insulation, vents, air, and life support.
4. Keep the shared drift/rollout spec open throughout all three slices so the systems remain legible and do not turn into unrelated warning spam.

## Why This Exists

The current game has a strong station-building foundation, but the finished-station state can become too solved. The tier path teaches the player to build one of each required system, then the main pressure becomes capacity and routing cleanup. That creates progression, but not enough replayable strategic tension.

The next design push should make the station feel like a living machine that drifts over time and responds differently to different map seeds. The goal is not to punish the player with random failure. The goal is to make every stable station carry chosen vulnerabilities that can be read, managed, and redesigned around.

Core thesis:

- A good station is never permanently solved.
- Every layout should trade one weakness for another.
- Entropy should create maintenance, sanitation, traffic, heat, and service problems that emerge from how the station is used.
- Map seeds should create local truths that make different station shapes correct in different runs.
- Pressure must be legible before it is punitive: overlays, inspectors, alerts, and jobs should explain the cause and the fix.
- Failure should usually be recoverable through redesign, maintenance, access control, staffing, expansion, or specialization.

This is different from contracts. Contracts may still be valuable later, but they answer "why am I playing this run?" Entropy and seeded build pressure answer "why am I still making decisions after the station basically works?"

## Design Pillars

### 1. Entropy

Stations should accumulate local operational debt from normal use.

Examples:

- A busy cafeteria gets dirty and creates cleaning work.
- A crowded public concourse creates comfort and route-pressure problems.
- A market near cargo routes works economically but exposes visitors to back-of-house traffic.
- A sunny workshop runs hot or wears faster.
- A berth on a debris-exposed edge needs more maintenance.
- A compact station is efficient, but fire, smoke, dirt, crowding, and route conflicts spread faster.
- A sprawling station separates functions well, but air coverage, logistics, and response time become harder.

The important rule: entropy should come from player choices, not from arbitrary timers. The player should be able to look at a warning and think, "That happened because I built this way."

### 2. Station Drift

Station drift is the visible, cumulative state of entropy.

Rooms, modules, and station sectors should develop readable drift states:

- sanitation drift: dirt, trash, meal mess, hygiene use, body/incidents later;
- maintenance drift: wear from high-load modules, debris exposure, fire aftermath, busy doors/modules;
- thermal or stale-air drift: heat buildup, weak ventilation, shadow/sun conditions;
- crowding drift: too many actors sharing the same public or service space;
- route-stress drift: visitors, residents, crew, and logistics crossing incompatible spaces.

Drift should start as mild efficiency/comfort pressure, then escalate into visible jobs and alerts if ignored. The player should get early warning before anything severe happens.

### 3. Seeded Build Pressure

Map seeds should make the builder less predictable by adding stable spatial conditions. These conditions should act like terrain in a city builder: they make some placements better and others worse.

Initial condition layers worth exploring:

- Sunlight and shadow.
- Debris-risk edges.
- Thermal or quiet pockets.
- Lane-facing affinities tied to ship/faction traffic.
- Later: resource pockets, radiation zones, signal/view corridors, construction difficulty.

Every condition should have both an upside and a downside.

Examples:

- Sunlit sectors can support future solar, tourism, observatories, or hydroponics, but increase heat and wear.
- Shadowed sectors are poor for solar and public appeal, but good for cooling, storage, reactors, or quarantine.
- Debris-exposed edges are valuable for docks/berths but increase hull/module maintenance.
- Quiet pockets are good for dorms, medical, and residents, but may be far from traffic lanes.
- Thermal sinks are good for reactors, workshops, kitchens, and high-load systems, but may be awkward for visitors.

The player should not see "good" and "bad" tiles. They should see different kinds of useful pressure.

## Roadmap Slice Proposal

Add a focused slice before deeper contracts/identity work:

**Entropy, Drift, And Seeded Build Pressure v1**

This slice should reuse existing systems wherever possible: maintenance, repair jobs, room warnings, route pressure, station rating drivers, resident comfort, visitor feelings, overlays, inspectors, and the Station Ops modal.

### Simulation

Add seed-derived map condition layers:

- `sunlight`: stable light/shadow intensity by tile or sector.
- `debrisRisk`: higher near selected exposed edges or lanes.
- `thermalQuiet`: a coarse layer identifying heat-sink or quiet-comfort areas.

Rules:

- Generated deterministically from the station seed.
- Stable across save/load.
- Expands consistently when the map grows.
- Coarse enough to read at station scale; avoid per-tile noise that looks random.

Add room/module drift metrics:

- sanitation drift;
- maintenance wear;
- heat/stale-air drift;
- crowding drift;
- route-stress drift.

Inputs:

- foot traffic;
- meals served/eaten;
- market and vending use;
- hygiene use;
- kitchen, workshop, reactor, life-support, hydroponics activity;
- crowd density;
- route exposure across public/service/resident/security spaces;
- debris risk for hull-adjacent rooms, docks, berths, and exterior-facing modules;
- sunlight/shadow modifiers for thermal or comfort drift.

Effects should be mild in v1:

- sanitation drift can reduce visitor status/spend and resident comfort;
- maintenance wear can reduce room/module reliability or create repair jobs;
- heat/stale drift can affect comfort and eventually room warnings;
- crowding drift can affect visitor patience and resident satisfaction;
- route-stress drift can feed existing route exposure and comfort systems.

Recovery:

- cleaning jobs reduce sanitation drift;
- repair/maintenance jobs reduce wear;
- route/zoning changes reduce route-stress drift;
- expansion/relocation can solve chronic crowding or environmental mismatch;
- later utility systems can reduce heat/stale-air drift.

### UI And Interaction

Add a **Map Conditions** overlay:

- Shows sunlight/shadow, debris risk, and thermal/quiet pockets.
- Uses clear legend labels, not only colors.
- Hover readout names the condition and its likely build implications.
- The overlay should be useful before the player builds, so it supports planning.

Add a **Station Drift** summary to Station Ops:

- Shows top drift categories and trend.
- Shows the top 3 rooms/sectors causing drift.
- Separates "warning" from "active problem."
- Links conceptually to Jobs: cleaning, repair, inspection, or service work.

Add room/selection readouts:

- Local map condition: sunny, shadowed, debris-exposed, quiet, thermal sink, etc.
- Current drift: sanitation, wear, heat/stale, crowding, route stress.
- Cause: "meal traffic," "public/logistics crossing," "debris edge," "high-load module," etc.
- Effect: rating, morale, comfort, work speed, job pressure, or none yet.
- Suggested fix: clean, repair, add service route, move noisy module, add redundancy, expand, or wait if minor.

Add actionable alerts:

- Alert only when the player can do something.
- Examples:
  - "Cafeteria sanitation drift rising."
  - "North berth debris wear rising."
  - "Sunny workshop heat load."
  - "Residential wing crowding."
  - "Market stockouts plus public/logistics route conflict."

Add job panel integration:

- Cleaning jobs appear as their own category or visible job type.
- Maintenance/inspection jobs name their source: debris, high-load, heat, general wear.
- Job diagnostics should show whether drift jobs are starving other work.

### Build Palette And Planning

Do not add many new modules in this slice. The point is to make current building choices matter more.

Potential minimal additions:

- Condition overlay button under Overlays.
- Drift overlay or Station Drift tab under Station Ops.
- Optional "Inspect" style job, if repair/cleaning needs a non-destructive work type.

Future modules should be unlocked only after the first slice proves useful:

- insulation panel;
- hull shielding;
- service scrubber;
- air/duct panel;
- radiator/heat sink;
- solar panel;
- janitor closet or supply locker.

## Acceptance Criteria

This slice is working when:

- Two different seeds suggest visibly different expansion or room-placement strategies.
- A busy station develops readable drift within 10 simulated minutes.
- Drift creates visible work without overwhelming the job queue.
- The player can explain why a room is drifting by reading the UI.
- Cleaning or repair visibly improves the affected room/metric.
- Seed conditions are not purely penalties; each creates at least one useful build reason.
- A stable station still feels alive without requiring random disasters.

## Test Plan

Deterministic sim tests:

- Same seed produces the same map condition layers.
- Different seeds produce different high-level condition layouts.
- Map expansion preserves existing condition data and generates new condition data consistently.
- Busy cafeteria/market use increases sanitation drift and creates visible cleaning work.
- Debris-exposed berth/dock/hull area accumulates maintenance drift faster than sheltered areas.
- Cleaning or repair reduces the relevant drift metric.
- Drift effects stay bounded and do not collapse rating/morale too quickly.

Browser/playtest checks:

- Map Conditions overlay is readable at default and zoomed-out station scale.
- Room inspector explains local condition, drift cause, effect, and suggested fix.
- Station Ops drift summary names the most important current problem.
- Jobs panel shows cleaning/maintenance pressure clearly.
- Run two seeds for at least 10 simulated minutes each and confirm they encourage different choices.

Regression checks:

- Existing route pressure, maintenance, repair, visitor, resident, and progression scenarios still pass.
- Save/load preserves seed condition layers and drift metrics.
- Autosave/harness export does not drop or duplicate drift state.

## Open Design Questions

These should be answered before implementation:

- Should sunlight be static by seed, cycle over time, or start static and become cyclical later?
- Should drift be tracked per room cluster, per module, per tile, or a mix?
- Should cleaning be handled by all idle crew, a crew priority, or a future janitor role?
- How visible should seed pressure be at game start: always-on planning overlay, first-time prompt, or optional overlay only?
- Should early-game drift be disabled until the first stable station milestone, or always active but very mild?

Recommended defaults for v1:

- Use static seed conditions first.
- Track drift per room cluster and module, not every tile unless needed for overlays.
- Let idle crew handle cleaning/maintenance through the job board.
- Make map conditions available from the start through an overlay.
- Keep drift active from the beginning, but tune early-game rates very low.

## Relationship To Existing Roadmaps

This note should inform:

- `docs/15-current-roadmap.md`: add the overarching design goals so future work keeps the "no perfect layout" thesis in view.
- `docs/17-roadmap-part-2-utilities-hazards-sanitation.md`: add the detailed entropy/drift/seeded-pressure slice before or inside the utilities and sanitation work.
- `docs/18-roadmap-part-3-command-map-contracts.md`: leave contracts and identity for later; they can build on the drift and condition systems once those are legible.

Do not create a second parallel roadmap. If this direction is accepted, fold it into the existing roadmap files.
