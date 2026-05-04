# 19-3 Sunlight, Shade, Thermal, And Air

Last updated: 2026-05-03

Status: implementation spec. This is the third proposed slice from `docs/19-entropy-drift-seeded-build-pressure.md`.

## Goal

Make each map seed impose large, readable sunlight/shadow and thermal conditions so station shape is less predictable. Bright and dark bands should cross the buildable map. Sunlit areas should offer future upside and present heat/wear pressure; shadowed areas should cool better but carry different placement tradeoffs.

This is the largest entropy slice. It touches map condition generation, rendering, background art, room comfort, module wear, insulation, vents, life support, and local air.

## Product Thesis

Sunlight and shade should answer: "Why is this room correct here in this run, but wrong there in another?"

Good design tension:

- Sunlit areas are good for solar, hydroponics, observatories, tourism, public appeal, and future exterior industry.
- Sunlit areas are bad for heat-sensitive rooms, dorms, clinics, crowded lounges, and high-load machinery unless insulated or cooled.
- Shadowed areas are good for reactors, storage, maintenance, quarantine, cooling, and quiet residential pockets.
- Shadowed areas are less appealing for tourism/observatories/solar and may feel less comfortable without design support.
- Long station arms can chase good conditions, but utility coverage and response time get harder.

The player should see terrain-like opportunity, not "green good / red bad."

## V1 Scope

Implement:

- Deterministic sunlight/shadow map condition layer.
- Large visible light/dark bands over space and station tiles.
- Seeded background planets/asteroids/bodies that support the map's light/shadow identity.
- Thermal pressure derived from sunlight, room load, and life-support coverage.
- Room-level thermal/stale-air drift.
- Basic insulation/cooling interactions.
- Inspector/overlay readouts that explain sunlight, shade, heat, stale air, and likely fixes.

Do not implement in the first pass:

- Full fluid/thermodynamic simulation.
- Orbital day/night cycles.
- Per-gas composition.
- Complex pipe networks.
- Random solar storms.
- Solar power economy unless the light layer proves useful.

## Current Hooks

Useful current systems:

- `state.seedAtCreation` and `state.system.seedAtCreation`
  - stable seed for deterministic map conditions.
- `state.airQualityByTile`
  - local per-tile air quality already exists.
- Life-support coverage diagnostics
  - active source BFS, poor coverage count, average distance, hover/overlay.
- Vent module
  - wall-mounted, projects life-support air through a reachable service tile.
- Diagnostic overlay architecture
  - cached layers, hover lines, legends.
- Room environment diagnostics
  - visitor status, resident comfort, service noise.
- Maintenance
  - heat can later increase module wear.
- Render pipeline
  - dynamic overlays and background rendering can support light/shadow and seeded bodies.

Important trip-wire:

- Depressurized red wash is intentionally subtle. Do not stack sunlight/heat overlays so strongly that the station becomes unreadable or tinted brown.

## Map Condition Layers

Add condition layers:

- `sunlight`: `0..1`
- `shadow`: derived as `1 - sunlight` or separate if occluders exist.
- `thermalSink`: optional `0..1` layer for naturally cooler regions.

Generation rules:

- Deterministic from `state.seedAtCreation`.
- Coarse, broad, and readable.
- Use bands, wedges, and penumbra gradients, not noisy speckles.
- Same seed/load must match.
- Map expansion must preserve the visible directionality.
- Expose layer through hover/overlay before building.

Suggested first algorithm:

- Derive a star direction vector from seed.
- Generate 1-3 broad shadow bands from asteroid/planet occluders.
- Add low-frequency variation to band edges.
- Add a few thermal pockets from seed, but keep them secondary.
- Use world coordinates so expansion continues the same pattern.

State choice:

- Prefer derived functions over stored arrays for `sunlight` and `shadow`.
- Save `mapConditionVersion`.
- Add a debug helper to sample conditions for tests.

## Seeded Space Backdrop

The backdrop should communicate the condition seed.

Add deterministic background elements:

- star direction or bright rim glow;
- distant planet or moon casting a broad shadow;
- asteroid field if debris/thermal conditions demand it;
- dark occluder silhouettes aligned with shade bands;
- small parallax bodies.

Rules:

- Background art must reinforce conditions, not become decorative noise.
- Bodies are placed by seed.
- Movement is slow or static.
- High sunlight side feels bright; shadowed side feels cool/dim.
- Station readability stays primary.

Potential sprite keys:

- `space.planet.rocky.1`
- `space.planet.ice.1`
- `space.planet.gas.1`
- `space.asteroid.large.1`
- `space.shadow.occluder.1`
- `space.star.glow`

## Thermal And Stale-Air Model

Do not build full thermodynamics in v1. Use room/sector drift.

### State

Add:

- `thermalByTile` or `heatByTile`: derived/live `0..100`.
- `staleAirByTile`: optional `0..100`, or fold stale pressure into local air diagnostic.
- `roomThermalDiagnostics` by room anchor.

Metrics:

- `thermalAvg`
- `thermalMax`
- `hotTiles`
- `staleAirTiles`
- `coolingLoad`
- `thermalPenaltyPerMin`
- `thermalPenaltyTotal`

### Heat Sources

Inputs:

- sunlight;
- reactor activity;
- kitchen stove activity;
- workshop workbench activity;
- life-support machinery;
- hydroponics grow lights later;
- crowd density;
- fire aftermath;
- high module maintenance debt.

### Cooling Sources

Inputs:

- shadow;
- thermal sink layer;
- life-support coverage;
- vents;
- adjacent exterior hull exposure;
- future radiators;
- future insulation.

Suggested model:

- Per tile target heat is computed from environmental condition plus room/module sources.
- Per tick heat approaches target with smoothing.
- Rooms derive average/max from tiles.
- Life support and vents reduce target or improve decay toward comfortable range.
- Poor life-support coverage increases stale-air drift even if global oxygen is okay.

Use existing `airQualityByTile` carefully:

- Air quality should remain oxygen/survival readability.
- Heat/stale-air should appear as comfort/efficiency pressure first.
- If stale air is folded into air, label clearly so players do not confuse "hot/stale" with "depressurized/no oxygen."

## Insulation And Cooling

The user called out insulation and heat management as core to this slice. Treat these as the first build tools that let the player answer sunlight/shade pressure.

V1 options:

### Insulation Panel

- Wall-mounted module.
- Reduces sunlight heat transfer for nearby room tiles.
- Reduces exterior thermal swings.
- Slight material/credit cost.
- Good for dorms, clinic, public venues in sunny areas.

### Radiator Or Heat Sink

- Exterior-facing or wall-mounted module.
- Vents heat from high-load rooms.
- Works better in shadow/thermal sink conditions.
- Requires service access.

### Vent Upgrade

- Existing Vent can count for both air distribution and stale-air relief.
- Avoid adding new duct networks until the thermal loop proves useful.

### Life Support Cooling Load

- Life support should gain a visible `cooling load` metric.
- High heat should reduce life-support efficiency or increase power draw later.
- V1 can surface it as a warning/effect without adding full power network complexity.

Recommended v1:

- Add Insulation Panel.
- Extend Vent diagnostics for stale-air relief.
- Delay Radiator until heat penalties are visible enough to need a stronger answer.

## Effects

Keep early effects mild:

- Visitor status in hot/stale public rooms drops.
- Resident comfort in hot/stale dorms drops.
- Crew work speed in hot workshops/kitchens/reactors drops slightly.
- Maintenance wear rises faster for hot high-load modules.
- Life-support rooms under high heat may carry extra maintenance or cooling load.
- Hydroponics/Observatory may receive small sunlight upside later.

Severity:

- Comfortable: no penalty.
- Warm/stale: hover/inspector warning only.
- Hot: small comfort/status/work-speed penalty.
- Severe heat: maintenance wear and room warning.

Avoid:

- Immediate death/health crisis from heat in v1.
- Sudden fire ignition from sunlight alone.
- Penalizing sunny tiles without at least one visible upside.

## UI And Interaction

### Map Conditions Overlay

Add or extend overlay:

- `Map Conditions`
- Modes or legend entries:
  - sunlight;
  - shadow;
  - thermal sink;
  - debris risk if 19-2 has landed.

Hover example:

`hover 58,21: bright sun | heat + medium | good future solar/observatory | consider insulation for dorms`

### Thermal/Air Overlay

Either extend `Air Coverage` or add `Thermal`:

- Air Coverage remains oxygen/local life support.
- Thermal overlay shows hot/stale/cool pressure.

Preferred:

- Keep `Air Coverage` focused on oxygen.
- Add `Thermal` diagnostic if the heat model is substantial.

### Station Tint

Visible light/dark bands:

- Apply subtle sunlight/shadow tint to station tiles and surrounding space.
- Keep alpha low.
- Make the band geometry obvious at zoomed-out station scale.
- Do not hide room sprites, grime, maintenance markers, or construction preview.

### Room Inspector

Rows:

- `Condition: bright sun`
- `Thermal: warm, rising`
- `Cause: sunlight + kitchen load`
- `Effect: comfort - small, maintenance wear + small`
- `Fix: insulation, vent, relocate, expand into shade, add cooling module`

### Station Ops

Add Life Support/Thermal section:

- cooling load;
- hottest room;
- stale-air rooms;
- rooms lacking vent/life-support coverage;
- open thermal-related maintenance jobs if 19-2 has landed.

Alerts:

- `Sunny dorm overheating`
- `Workshop heat load rising`
- `Remote wing stale air: poor vent/life-support coverage`
- `Life support cooling load high`

## Implementation Steps

1. Add map condition helpers:
   - `sunlightAt(state, tileIndex)` or coordinate helper;
   - `thermalSinkAt`;
   - deterministic tests.
2. Add Map Conditions overlay:
   - button;
   - legend;
   - hover readout;
   - low-alpha band rendering.
3. Add seeded backdrop:
   - deterministic planet/asteroid/occluder placement;
   - subtle parallax/animation;
   - cache/performance plan.
4. Add thermal/stale room diagnostics:
   - heat sources;
   - cooling sources;
   - room average/max;
   - metrics.
5. Add effects:
   - comfort/status/work-speed;
   - maintenance-rate modifier if 19-2 exists.
6. Add build responses:
   - Insulation Panel;
   - Vent stale-air relief;
   - optional Radiator later.
7. Add inspector/Ops/alerts.
8. Add tests and two-seed playtest.

## Acceptance Criteria

- Two seeds produce visibly different sunlight/shadow band layouts.
- The player can identify bright/shadowed areas before building.
- A room in bright sun develops higher heat pressure than the same room in shade.
- A vent or insulation response visibly improves the relevant diagnostic.
- Hot/stale rooms affect comfort/status mildly and explain themselves in UI.
- Background bodies reinforce the seed's light/shadow layout.
- Existing Air Coverage remains understandable and not confused with heat.

## Test Plan

Sim tests:

- Same seed returns same sunlight/shadow samples.
- Different seeds produce different band directions/occluders.
- Map expansion preserves condition continuity.
- Sunlit high-load room gets warmer than shaded equivalent.
- Vent/life support reduces stale-air pressure.
- Insulation reduces sunlight heat transfer.
- Heat penalties are bounded.
- Save/load preserves or re-derives conditions consistently.

Harness/browser checks:

- Map Conditions overlay is readable at default zoom and zoomed-out.
- Light/dark station tint does not obscure sprites or text.
- Room inspector explains condition, thermal cause, effect, and fix.
- A two-seed playtest suggests different room placement choices.
- Existing Air Coverage overlay still reads as oxygen/life support.

Regression:

- `npm run test:sim`
- `npm run build`
- Existing life-support, pressurization, route-pressure, maintenance, fire, and visitor/resident scenarios still pass.

## Risks

- Scope explosion. Keep v1 room/sector-level, not full heat physics.
- UI confusion between oxygen and heat. Separate labels and overlays.
- One-note visual tint. Light/shadow should be subtle and readable, not a dark-blue wash.
- No upside for sun. Add at least planning-language upside immediately and gameplay upside soon after.
- Performance. Condition helpers should be deterministic and cheap; avoid per-frame noise generation.

## Later Extensions

- Solar panels.
- Observatory/tourism sunlight bonus.
- Hydroponics light bonus.
- Radiators/heat sinks.
- Dynamic orbital light cycles.
- Solar storms.
- Refrigerated storage / cold chain.
- Deeper ducting and air composition.
