# 19-1 Sanitation And Cleaning Loop

Last updated: 2026-05-03

Status: implementation spec. This is the first proposed slice from `docs/19-entropy-drift-seeded-build-pressure.md`.

## Goal

Add a visible everyday decay loop: busy station areas get dirty, dirt becomes readable on the map, crew clean it up, and the player responds by changing layout, staffing, access, or service placement.

This should make the station feel lived-in without turning the game into janitor spam. Sanitation is the first entropy slice because it is local, visible, low-risk, and immediately connected to existing visitor, resident, route, and room systems.

## Design Reference: Prison Architect

Prison Architect is a useful reference because cleanliness is both visual and systemic:

- Janitors clean indoor grime, stains, footprints, and other messes that accumulate over time, and larger/more populated facilities need more janitorial capacity.
- Cleaning Cupboards let prisoner labor help with cleaning, but access rules matter: staff-only areas cannot be cleaned by prisoners.
- The Alpha 9 notes are also useful because they frame cleaning as visible environmental decay, with dirty shower cubicles and muddy floors becoming readable surface state.

Reference links:

- https://prison-architect.fandom.com/wiki/Janitor
- https://prison-architect.fandom.com/wiki/Cleaning_Cupboard
- https://prison-architect.fandom.com/wiki/Alpha_9

The important lesson is not "copy janitors." The lesson is that dirt works when it is:

- visible before it is numerically important;
- produced by use, not by arbitrary timers;
- cleaned by actors the player can watch;
- affected by access/layout;
- mild enough that it creates a maintenance rhythm instead of a crisis clock.

## Product Thesis

Sanitation should answer: "What does this station's daily life cost?"

A cafeteria beside the main dock should be profitable and convenient, but it should also get dirty fast. A quiet residential wing should stay clean longer. A compact layout should be efficient, but traffic and shared services should concentrate grime. A sprawling layout should spread grime out, but make cleaning travel more expensive.

The system should create a small but persistent reason to revisit layout after the station technically works.

## Player Loop

1. Actors use the station: walking, queueing, eating, showering, toileting, shopping, working, or hauling.
2. Those actions add dirt to local tiles and room clusters.
3. Dirt appears through grime sprites and a sanitation overlay.
4. Dirt starts as cosmetic, then becomes comfort/status/efficiency pressure.
5. Cleaning jobs appear when dirt crosses thresholds.
6. Crew clean the mess if they can reach it and have spare labor.
7. The player can improve the problem by adding crew, reducing path conflicts, moving rooms, widening halls, adding service routes, or later adding cleaning-specific modules.

## V1 Scope

Implement:

- Per-tile dirt score, `0..100`.
- Room-level sanitation summary derived from tile dirt.
- Dirt sources from foot traffic, meals, vending, hygiene rooms, kitchens, hydroponics, market activity, fires, and bodies/incidents where already implemented.
- Cleaning jobs that target dirty tiles or dirty room clusters.
- Crew execution for cleaning jobs.
- Sanitation diagnostic overlay.
- Visible grime decals tied to dirt level.
- Room inspector and hover text explaining source, severity, and likely effect.
- Station Ops and Jobs summary rows for cleaning pressure.
- Mild rating, satisfaction, morale, hygiene, and food-safety effects.

Do not implement in v1:

- Disease spread.
- Trash hauling chains.
- Consumable cleaning supplies.
- Dedicated janitor role.
- Prisoner/resident labor programs.
- Laundry or clothing cleanliness.
- Severe outbreaks or random filth events.

## Existing Hooks

Useful current systems:

- `src/sim/types.ts`
  - `DiagnosticOverlay` already supports multiple heatmaps.
  - `TransportJob` / `JobType` already provides job state, assignment, progress, stall reasons, and job board metrics.
  - Crew already has `cleaning` and `cleanSessionActive`, but today that means self-care/hygiene behavior, not station sanitation work.
- `src/sim/sim.ts`
  - Job creation, dispatch, assignment, and in-progress handling already exist.
  - Route pressure diagnostics can identify heavy foot traffic and mixed-use conflicts.
  - Room diagnostics and room inspector hints/warnings already explain local blockers.
  - Fire/body systems can feed dirt later without inventing new incident structure.
- `src/render/render.ts`
  - Diagnostic overlays already have cached layer support, hover lines, and legends.
  - `ensureDecorativeLayer` already draws floor overlay sprites.
- `src/render/sprite-keys-extended.ts`
  - `FLOOR_GRIME_SPRITE_KEYS` already exists.
  - `FLOOR_WEAR_SPRITE_KEYS` already exists, though wear should remain distinct from dirt if possible.
- `tools/sprites/sprite-spec.yaml`
  - `overlay.floor.grime.1..6` already exist.

Important naming note:

- Current crew `cleaning` means "crew self hygiene/toilet/clean-up routine." The sanitation job should avoid ambiguous UI like "clean" if it can mean either crew hygiene or room cleaning. Preferred labels:
  - job type: `sanitize` or `clean_tile`;
  - actor state: `sanitizing room`;
  - overlay: `Sanitation`;
  - metric: `sanitation`.

## Simulation Design

### State

Add persistent state:

- `state.dirtByTile`: `Float32Array`, same length as `state.tiles`, values `0..100`.
- `state.dirtSourceByTile`: optional debug/derived source enum or bitmask for inspectors; if stored, keep it compact.

Add derived diagnostics:

- `SanitationTileDiagnostic`
  - `tileIndex`
  - `dirt`
  - `severity`: `clean | lived-in | dirty | filthy`
  - `dominantSource`: `traffic | meals | hygiene | kitchen | hydroponics | market | fire | body | mixed | none`
  - `room`
  - `roomAnchor`
  - `roomAverage`
  - `cleaningJobOpen`
  - `reachableByCrew`
- `SanitationRoomDiagnostic`
  - `room`
  - `anchorTile`
  - `averageDirt`
  - `maxDirt`
  - `dirtyTiles`
  - `dominantSource`
  - `effectSummary`
  - `suggestedFix`

Add metrics:

- `sanitationAvg`
- `sanitationMax`
- `dirtyTiles`
- `filthyTiles`
- `sanitationJobsOpen`
- `sanitationJobsCompletedPerMin`
- `sanitationPenaltyPerMin`
- `sanitationPenaltyTotal`

Save/load:

- Include `dirtByTile` in the save snapshot.
- Normalize missing arrays to zero for old saves.
- Expand/crop arrays during map expansion the same way `airQualityByTile` is handled.

### Dirt Accumulation

Dirt rises from use:

- Foot traffic:
  - visitors: medium;
  - residents: medium-low;
  - crew: low;
  - logistics: medium-high;
  - EVA suit re-entry: future modifier.
- Cafeteria:
  - eating at tables;
  - queueing near serving stations;
  - meal stock dropped or consumed.
- Hygiene:
  - toilet/shower/sink use;
  - high actor throughput.
- Kitchen:
  - stove work;
  - raw meal handling;
  - failed stock/overflow later.
- Hydroponics:
  - grow station work;
  - water/soil residue flavor.
- Market/vending:
  - shopper dwell;
  - vending usage.
- Incidents:
  - bodies, fights, fires, smoke aftermath.

Suggested first tuning:

- Keep baseline passive dirt near zero.
- Use events and occupancy more than time.
- Clamp normal use so a well-staffed early station stays mostly clean.
- Let busy public/service crossings produce visible grime within 5-10 simulated minutes.
- Let severe filth require sustained neglect, not one meal rush.

### Dirt Spread

V1 should use restrained spread:

- Dirt can bleed one tile from the source at a very low rate.
- Do not flood-fill dirt across whole rooms.
- Do not contaminate through walls/doors.
- Room average is derived from tiles, not spread by room identity alone.

This keeps the player able to read "this serving line is dirty" instead of "the whole cafeteria number is dirty."

### Cleaning Job Generation

Add a job type, preferably:

- `JobType = ... | 'sanitize'`

Job behavior:

- Spawn when a tile or compact tile cluster exceeds a threshold, e.g. `dirt >= 45`.
- Prefer one job per room cluster or dirty patch instead of one job per tile.
- Job target is the dirtiest reachable tile in a patch.
- Job amount represents dirt reduction required, not item quantity.
- Jobs complete when the target patch drops under a target threshold, e.g. `dirt <= 18`, or when work amount is satisfied.
- Job should expire/reschedule like other work, but avoid creating duplicates while one is open.

Job priority:

- Below `45`: no job.
- `45..70`: low/normal priority.
- `70..90`: medium priority and room warning.
- `90+`: high priority, but never above fire/air emergencies.

Crew assignment:

- Generalist idle crew may take sanitation jobs.
- Existing critical staffing must preempt sanitation.
- Crew self-care should preempt sanitation when needs are low.
- Later: add a cleaning priority slider or janitor role.

### Cleaning Work

When assigned:

1. Crew walks to target tile using normal crew pathing.
2. If unreachable, mark `stalled_unreachable_source`.
3. At target, job enters `in_progress`.
4. Crew reduces dirt on target tile and nearby patch tiles.
5. Show actor inspector `sanitizing room`.
6. Complete when enough dirt is removed.

V1 should not require carried items. V1.1 can add cleaning supplies.

### Effects

Keep effects mild and readable:

- `0..25`: cosmetic only.
- `25..45`: slight visitor/resident comfort pressure if room is public/residential.
- `45..70`: visible warning, small station rating/environment penalty, cleaning jobs open.
- `70..90`: stronger visitor status/spend and resident comfort hit; crew morale/work-speed small penalty in work rooms.
- `90+`: food-safety/hygiene risk flag in cafeterias/kitchens/hygiene rooms, but no disease until a later feature.

Suggested affected systems:

- Visitor status/environment penalty.
- Resident comfort/satisfaction.
- Crew morale drivers.
- Food-service failure risk if cafeteria/kitchen filth is severe.
- Hygiene need decay if Hygiene rooms are filthy.

Avoid:

- Sudden station-wide rating collapse.
- Random disease in v1.
- Penalties without hover/inspector explanation.

## UI And Interaction

### Overlay

Add diagnostic overlay:

- `DiagnosticOverlay = ... | 'sanitation'`
- Button label: `Sanitation`.
- Legend:
  - green/clear: clean;
  - yellow: lived-in;
  - orange: dirty;
  - red/purple: filthy.
- Hover line should include:
  - tile dirt;
  - dominant source;
  - open cleaning job if any;
  - effect threshold.

Example hover:

`hover 42,28: dirt 63 | meals + foot traffic | cleaning job open | visitor status penalty`

### Visual Decals

Tie `overlay.floor.grime.*` to actual dirt:

- `25..45`: low-alpha grime variant.
- `45..70`: stronger grime variant.
- `70+`: multiple/stronger grime decals, but do not obscure tile identity.

Important:

- Existing decorative grime appears to be deterministic ambience. Sanitation grime must be distinguishable as live state.
- Either repurpose the decorative grime layer so it keys on `dirtByTile`, or add a separate cached sanitation decal layer.
- Cache key must include a coarse dirt signature so cleaning visibly updates without repainting every frame.

### Room Inspector

Add sanitation rows:

- `Sanitation: 72% dirty`
- `Cause: meals + queue traffic`
- `Effect: visitor status - small, food-safety risk at 90`
- `Fix: assign cleaning, widen route, add tables, reduce public/logistics crossing`

Only show warnings when actionable.

### Jobs And Ops

Jobs panel:

- Count `sanitize` jobs separately.
- Show blocked sanitation jobs and top blocked reason.

Station Ops:

- Add `Sanitation` row:
  - average dirt;
  - dirtiest room;
  - open jobs;
  - completed/min;
  - top source.

Alerts:

- `Cafeteria sanitation rising: meals + queue traffic`
- `Hygiene room filthy: comfort and hygiene recovery reduced`
- `Cleaning backlog: 12 open sanitation jobs`

## Sprite And Art Requirements

Already available:

- `overlay.floor.grime.1..6`

Add or curate:

- `fx.cleaning.broom` or `overlay.job.cleaning`
- optional `module.janitor_locker`
- optional `agent.crew.cleaning_tool` or a tiny broom/mop overlay drawn above crew while sanitizing

V1 can use vector fallback for the broom/job icon if sprite generation would slow the slice. The grime decals are the important visual anchor.

## Optional Module: Janitor Locker

Do not require this for v1 unless the base loop feels too abstract.

If added:

- Module: `JanitorLocker`
- Allowed rooms: any service/logistics/storage room or a new Cleaning Closet room later.
- Effect:
  - sanitation jobs within range clean faster;
  - optional local max concurrent cleaners;
  - optional cleaning supplies node in v2.

This is the space-station equivalent of Prison Architect's Cleaning Cupboard, but it should not be required before the player understands the basic dirt loop.

## Implementation Steps

1. Add types and state:
   - `dirtByTile`;
   - sanitation diagnostics;
   - sanitation metrics;
   - save/load normalization and map expansion.
2. Add accumulation:
   - traffic dirt;
   - meal/hygiene/kitchen/hydroponics/market sources;
   - simple dominant source tracking for inspectors.
3. Add cleaning jobs:
   - `sanitize` job type;
   - duplicate suppression;
   - target patch selection;
   - job metrics.
4. Add crew execution:
   - path to target;
   - work progress;
   - reduce dirt;
   - actor inspector state.
5. Add effects:
   - mild environment/status/comfort/morale penalties;
   - room warnings.
6. Add rendering:
   - sanitation overlay;
   - grime decals from live dirt;
   - hover legend.
7. Add UI:
   - overlay button;
   - room inspector rows;
   - Jobs/Ops summary;
   - alerts.
8. Add tests and tuning scenarios.

## Acceptance Criteria

- A busy cafeteria visibly gets dirty within 5-10 simulated minutes.
- A low-traffic dorm/residential wing stays much cleaner under the same sim time.
- Dirt appears as tile-level grime and in the Sanitation overlay.
- A cleaning job appears, crew walks to it, and dirt visibly decreases.
- The room inspector explains why the room is dirty and what effect it has.
- Cleaning backlog is visible in Jobs/Ops.
- Dirt penalties are noticeable but not run-ending.
- Air/fire/critical staffing jobs preempt cleaning.

## Test Plan

Sim tests:

- New state initializes `dirtByTile` to zero and old saves hydrate cleanly.
- Foot traffic increases dirt on walked tiles.
- Meal and hygiene use increase dirt faster than idle rooms.
- Cleaning job spawns above threshold and does not duplicate.
- Crew completing a sanitation job reduces dirt below target.
- Sanitation metrics update and remain bounded.
- Dirt applies mild visitor/resident penalties only above threshold.

Harness/browser checks:

- Overlay button toggles Sanitation.
- Grime decals appear/disappear with dirt changes.
- Hover text names dirt level and source.
- Room inspector shows sanitation cause/effect/fix.
- A medium station can run 10 simulated minutes without cleaning jobs overwhelming the queue.

Regression:

- `npm run test:sim`
- `npm run build`
- Existing route-pressure, visitor, resident, repair, fire, and life-support scenarios still pass.

## Risks

- Job spam: solve with patch/room-level job coalescing and caps.
- Visual noise: keep decals alpha-limited and tied to thresholds.
- Ambiguous "cleaning": distinguish station sanitation jobs from crew self-hygiene.
- Penalty stacking: sanitation should use the same environment/rating driver language so players can diagnose it.
- Cache churn: do not repaint full decorative layers every tick unless dirt signature changes meaningfully.

## Later Extensions

- Cleaning priority slider.
- Janitor Locker module.
- Cleaning supplies item chain.
- Resident labor or contracted janitorial staff.
- Trash bins/garbage hauling.
- Disease/food safety incidents.
- Dirty EVA suit footprints from exterior work.
