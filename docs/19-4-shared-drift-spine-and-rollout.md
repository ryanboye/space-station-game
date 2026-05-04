# 19-4 Shared Drift Spine And Rollout

Last updated: 2026-05-04

Status: shared spine active. The sanitation portion is implemented; keep this open while implementing `19-2` and `19-3` so maintenance/debris and sunlight/thermal use the same vocabulary, UI, save/load, and scenario patterns.

## Implementation Status

- [x] Shared map-condition API and versioning.
- [x] Shared severity vocabulary adopted by sanitation.
- [x] Sanitation drift state, metrics, overlay, inspector language, and live grime.
- [x] Job-volume controls for sanitation through thresholds, duplicate suppression, and room/tile targeting.
- [x] Station Ops drift rows for sanitation/maintenance job pressure.
- [x] Save/load migration rules for sanitation live arrays.
- [x] `?scenario=entropy-sanitation` cold-start fixture.
- [ ] `?scenario=entropy-maintenance`.
- [ ] `?scenario=entropy-thermal`.
- [ ] `?scenario=entropy-combined`.

## Goal

Prevent sanitation, maintenance, debris, sunlight, thermal pressure, and future entropy systems from becoming separate piles of warnings. This spec defines the shared data, UI vocabulary, job-volume controls, save/load rules, scenario coverage, and rollout order that let each slice land one by one.

## What Was Missing From The First Split

The three feature slices are correct, but several cross-cutting pieces need their own plan:

- Shared map-condition generation and versioning.
- Shared drift terminology and severity bands.
- Job-volume controls so cleaning/repair/inspection work does not flood crew.
- Station Ops summary that explains top drift categories across systems.
- Inspector language that always says condition, cause, effect, and fix.
- Save/load/migration rules for new typed arrays and derived seed layers.
- Scenario fixtures and browser playtests for comparing seeds.
- Balance gates so entropy ramps after the player can respond.
- Art pipeline scope for new sprites and overlays.

This document is the connective tissue.

## Design Principles

- Every pressure must be legible before it is punitive.
- Every pressure should have a player response.
- Every map condition needs upside and downside.
- Every new state field needs a player-facing surface.
- Drift should be local first, station-wide second.
- Severe states should usually emerge from ignored warnings.
- Job pressure should create decisions, not hide the sim under a backlog.

## Shared Vocabulary

Use consistent labels:

- `Condition`: stable seed-derived map fact.
  - examples: sunlight, shadow, debris risk, thermal sink.
- `Drift`: accumulated operational debt from use.
  - examples: sanitation dirt, maintenance wear, heat/stale air.
- `Source`: why the drift is happening.
  - examples: meals, traffic, debris lane, high-load module, poor ventilation.
- `Effect`: what the drift currently changes.
  - examples: comfort, status, output, docking speed, job pressure.
- `Fix`: what the player can do.
  - examples: clean, repair, add vent, insulate, add airlock, move room, widen corridor.

Every hover/inspector row should try to follow:

`Condition -> Drift -> Source -> Effect -> Fix`

Example:

`Bright sun -> heat 61 -> kitchen load + sunlight -> comfort - small -> add insulation or vent`

## Shared Severity Bands

Use similar bands unless a system has a strong reason not to:

- `0..25`: clean/healthy/comfortable; mostly no warning.
- `25..45`: lived-in/warm/worn; visual or hover-only.
- `45..70`: warning; job may open; mild effect.
- `70..90`: active problem; clear effect; prioritized job/alert.
- `90..100`: severe; strong warning; possible incident only after grace.

Labels can vary by system:

- Sanitation: clean, lived-in, dirty, filthy.
- Maintenance: healthy, worn, maintenance needed, degraded, critical.
- Thermal: comfortable, warm, hot, overheated, severe.
- Debris condition: sheltered, normal, exposed, heavy debris.

## Shared Map Conditions

Add a deterministic map-condition layer API before or during 19-2/19-3.

Proposed shape:

```ts
export type MapConditionKind = 'sunlight' | 'debris-risk' | 'thermal-sink';

export interface MapConditionSample {
  kind: MapConditionKind;
  value: number;
  label: string;
  upside: string;
  downside: string;
}
```

Functions:

- `mapConditionAt(state, kind, tileIndex): number`
- `mapConditionSamplesAt(state, tileIndex): MapConditionSample[]`
- `mapConditionVersion: number`

Rules:

- Use `state.seedAtCreation`.
- Avoid consuming `state.rng`.
- Work from world coordinates so map expansion is continuous.
- Use coarse low-frequency fields.
- Prefer derived layers over saved arrays at first.

Potential source file:

- `src/sim/map-conditions.ts`

Tests:

- same seed same sample;
- different seeds differ;
- expansion continuity;
- values stay `0..1`;
- no `state.rng` consumption.

## Shared Drift Data

Not every drift system needs the same storage. Use the lightest shape that makes the UI and tests possible.

Per-tile:

- sanitation dirt;
- local heat/stale air if 19-3 needs it;
- possibly condition samples derived from seed.

Per-room anchor:

- room sanitation summary;
- room thermal/stale summary;
- room route stress if later consolidated.

Per-module/target:

- maintenance wear;
- repair targets;
- hull/dock/berth targets.

Guideline:

- Store live accumulated drift.
- Derive stable map conditions.
- Derive room summaries from tiles/targets unless performance requires caching.

## Shared Metrics

Each slice should add:

- average;
- max;
- affected tile/room/target count;
- open job count;
- completed jobs per minute;
- penalty per minute;
- total penalty;
- top source string.

Example names:

- `sanitationAvg`, `sanitationMax`, `sanitationJobsOpen`
- `maintenanceDebtAvg`, `maintenanceDebtMax`, `maintenanceJobsOpen`
- `thermalAvg`, `thermalMax`, `hotTiles`, `coolingLoad`

Keep Station Ops labels player-facing; metric names can be technical.

## Job Volume Controls

Entropy systems can easily flood the queue. Add shared controls/patterns:

- Coalesce jobs by patch, room anchor, module, or hull sector.
- Cap open jobs by domain.
- Use thresholds and hysteresis:
  - spawn at high threshold;
  - complete below lower threshold.
- Avoid duplicate jobs for the same target.
- Priority should respect emergencies:
  - air/fire/security > construction critical > repair severe > food/logistics > sanitation/maintenance routine.
- Show top backlog reason in Jobs/Ops.
- Prefer "inspection/maintenance backlog" summaries over 40 tiny alerts.

Possible shared helpers:

- `hasOpenJobForTarget(state, type, targetKey)`
- `targetKeyForDrift(domain, tile/anchor/module)`
- `enqueueDriftJob(...)`

## Shared UI Pattern

### Overlays

New overlays should follow existing diagnostic overlay style:

- legend title;
- global stats line;
- color scale line;
- hover readout;
- cached layer key with coarse signatures.

Needed overlays:

- `Sanitation`
- upgraded `Maintenance`
- `Map Conditions`
- optional `Thermal`

Avoid too many one-off buttons if a mode selector becomes cleaner later.

### Room Inspector

Each drift block should show:

- current severity;
- dominant source;
- current effect;
- recommended fix;
- open job status.

Example:

`Sanitation 63 dirty | meals + foot traffic | visitor status penalty | cleaning job open`

### Station Ops

Add a `Station Drift` section:

- top category;
- trend;
- dirtiest room;
- worst maintenance target;
- hottest/stalest room;
- open drift jobs;
- blocked drift jobs.

Keep it short. The details live in overlays/inspectors.

### Alerts

Only alert when actionable:

- job is blocked;
- drift crossed active-effect threshold;
- severe drift persisted;
- player lacks the needed response tool.

Do not alert for every tile over threshold.

## Save/Load And Migration

For new live arrays:

- Add snapshot fields.
- Validate length.
- Clamp values.
- Default missing old-save values to zero/comfortable.
- Expand/copy during map expansion.

For derived map conditions:

- Save only seed and `mapConditionVersion`.
- If algorithm changes would alter existing saves too much, introduce versioned sampling.

For jobs:

- New job types must survive save/load if jobs are saved in the future; if jobs are not currently saved, ensure derived jobs respawn safely.

For metrics:

- Metrics are derived and should not need save fields.

## Scenario And Harness Plan

Add cold-start/browser fixtures:

- `?scenario=entropy-sanitation`
  - busy cafeteria/hygiene/market with enough crew to clean.
- `?scenario=entropy-maintenance`
  - dock/berth near high debris edge, one airlock, exterior repair expected.
- `?scenario=entropy-thermal`
  - identical rooms in sunny and shaded bands, life support/vents available.
- `?scenario=entropy-combined`
  - medium late-station with all systems active for 10-minute playtest.

Sim scenario builders:

- sanitation dirt accumulation/cleanup;
- debris/hull maintenance;
- EVA repair blocked/unblocked;
- thermal sunny-vs-shade room.

Browser checks:

- overlay readability at default and zoomed out;
- inspector cause/effect/fix;
- Jobs/Ops summaries;
- two-seed comparison.

## Art Pipeline Plan

Existing:

- floor grime and wear overlays exist in sprite spec.
- EVA suit sprite exists.
- wall/door/dock render paths are sensitive; follow render docs/trip-wires.

Likely new keys:

- `fx.cleaning.broom`
- `overlay.job.cleaning`
- `module.janitor_locker`
- `space.asteroid.small.1`
- `space.debris.metal.1`
- `space.planet.rocky.1`
- `space.shadow.occluder.1`
- `module.insulation_panel`
- optional `module.radiator`
- `fx.repair.spark`

Rules:

- Add gameplay-required keys to `src/render/sprite-keys.ts`.
- Keep forward-looking variants in `sprite-keys-extended.ts`.
- Update `tools/sprites/required-keys-v1.json` if runtime requires them.
- Use vector fallback for new icons if art would block the sim slice.
- Run sprite validation when atlas changes.

## Rollout Order

### Slice 1: Sanitation

Reason:

- Smallest standalone entropy loop.
- Existing grime art exists.
- Does not require seed map conditions.
- Proves whether visible routine decay is fun.

Must include:

- dirt state;
- overlay;
- grime tied to actual dirt;
- cleaning jobs;
- crew cleaning;
- inspector/Ops integration.

### Slice 2: Maintenance And Debris

Reason:

- Existing maintenance and EVA systems can be extended.
- Adds first true seed-based build pressure.
- Makes hull/exterior choices meaningful.

Must include:

- debris risk;
- exterior hull/dock/berth wear;
- EVA repair;
- upgraded maintenance overlay;
- seeded debris backdrop.

### Slice 3: Sunlight/Shade/Thermal/Air

Reason:

- Largest and most interconnected.
- Needs the map-condition language from slice 2.
- Touches life support, vents, comfort, modules, rendering, and background art.

Must include:

- light/shadow bands;
- condition overlay;
- room heat/stale diagnostics;
- insulation or vent response;
- seeded body/backdrop visuals.

### Cross-Slice Finish

After each slice:

- Add one medium-station 10-minute playtest.
- Check job volume.
- Check alert noise.
- Check inspector clarity.
- Tune before starting the next slice.

## Acceptance Criteria

The shared spine is working when:

- All drift systems use consistent severity and cause/effect/fix language.
- Jobs do not flood the queue in a medium station.
- Station Ops can summarize the worst current drift without hiding details.
- Overlays are readable and distinct.
- Save/load and map expansion preserve live drift and stable conditions.
- Two seeds create meaningfully different maintenance/thermal build pressure.
- The player can diagnose any drift penalty from UI alone.

## Required Checks Per Slice

- `npm run test:sim`
- `npm run build`
- Browser playtest with a medium station for at least 10 simulated minutes.
- Two-seed comparison for seed-dependent slices.
- Save/load smoke test.
- Overlay hover/legend check at default and zoomed-out scale.

## Open Questions

- Should `Map Conditions` be one overlay with modes, or separate overlay buttons?
- Should cleaning and maintenance get crew priority sliders immediately or after job pressure is observed?
- Should exterior hull be grouped by sector or individual target tile?
- Should heat/stale air be per tile or room-anchor first?
- Should severe hull maintenance ever create leaks in v1, or only docking/output penalties?
- Should sunlight have gameplay upside in the same PR as thermal penalties?

Recommended defaults:

- Use one `Map Conditions` overlay if possible.
- Delay new priority sliders until job pressure is real.
- Group hull maintenance by sector/berth/dock anchor.
- Track thermal per room first unless overlay needs tile detail.
- No random hull breaches in v1.
- Give sunlight at least one visible upside no later than the first thermal balance pass.
