# Trip-Wires — Cross-Cutting Invariants

The list of things that will burn you if you didn't know about them. Every entry is a real footgun a previous agent or PR uncovered. **Read this before you commit.**

Each item links to where the rule originates. Don't change the underlying behavior without checking what depends on it.

## Pressurization &amp; air

- **`computePressurization` is at `src/sim/sim.ts:1793`** — earlier docs cited 1773 (was correct mid-PR-#104; now stale). The function rebuilds `state.pressurized` from scratch each call; no incremental BFS.
- **Doors are pressure barriers.** `isPressureBarrier(tile)` (`src/sim/types.ts:1113`) returns true for `Wall` and `Door`. **Removing Door breaks the demo-station seal** — every door becomes a leak point and the depressurize overlay misfires across the whole interior.
- **Outer-hull Docks are barriers via inlined `isOuterHullTile`** (`sim.ts:1555`), NOT via `isPressureBarrier`. Adding hull-Dock-aware checks anywhere else requires duplicating that logic.
- **Depressurized red wash alpha is 0.08** (`render.ts:1447`), dropped from 0.22 on 2026-04-23. Bumping it back compounds with the inactive-room dim and tints the demo-station rust-brown ("pokemon red"). Fix the underlying state, don't dim the overlay — see the cosmetic-vs-root-cause memory.

## Render

- **Static-layer cache key MUST include `wallRenderMode`** (`render.ts:1027`). Forking wall paths without bumping the key means switching modes mid-session won't repaint.
- **`straight.vertical` is a runtime-stable wall variant — don't try to consolidate via rotation.** The 3D shading breaks (`tile-variants.ts:5`–7).
- **`renderWallDetailLayer` paints into the static cache, not the live ctx.** Live wall-light flicker requires moving emitters to glow-pass.
- **Glow alpha cap is ~0.25.** Above that, additive accumulation produces an orange haze across the station (`glow-pass.ts:58` comment).
- **The renderer never mutates state.** If you need to bump a counter from rendering, push it into `state.controls` or a derived cache; don't write to `state.metrics` from `render.ts`.
- **`drawTintedAgentSprite` allocates an offscreen canvas per call.** Adding new agent variants needs the existing tint cache (search `tintCache`) keyed on `(spriteKey, color)`.

## Simulation

- **`state` is mutated in place.** `applyHydratedState` (`main.ts:4154`) does `Object.assign(state, nextState)`. Never replace the outer reference.
- **Pause still calls `computeMetrics` / `updateUnlockProgress` / `refreshJobMetrics`** so HUD numbers update. But it skips `updateResources` and the agent-update calls. Don't put cleanup work inside `updateResources` if you want it to run while paused.
- **`updateUnlockProgress` advances multiple tiers in one tick** (`sim.ts:368`–377). Don't write UI assuming one flash per tick.
- **The "Day N | Cycle X" HUD string is render-time fiction** (`main.ts:1259`). The sim has no day concept. `state.cycleDuration = 15s` now only supports the cosmetic HUD slice and traffic-rate math; arrivals are jittered checks, not fixed waves. Don't add gameplay that depends on day boundaries.
- **`controls.spritePipeline` is a single-element union** (`'nano-banana'`). Adding a new pipeline requires the type, the manifest router (`sprite-atlas.ts:138`), and any save migration.

## Build / world / mutators

- **`setRoom` silently fails on non-walkable tiles.** If your scenario is missing a room paint, check whether the underlying tile is Floor.
- **`setModule` falls through to a `legacyForced: true` 1×1 module** when `tryPlaceModule` would fail (`sim.ts:8152`–8161). Scenarios depend on this. Tightening the fallback breaks fixtures.
- **HUD "Materials" is `legacyMaterialStock + sumRoomTradeGoods('rawMaterial', LogisticsStock+Storage)`** (`sim.ts:6270`). Use `metrics.materials` for UI text — don't read `legacyMaterialStock` directly.
- **WallLight needs the wall above the floor to face open space** — `resolveWallLightFacing` (`sim.ts:8115`) is finicky.
- **Adding a new module:** also update `MODULE_DEFINITIONS` (with `allowedRooms`), the relevant ROOM_DEFINITIONS' `requiredModules`, the build palette in `main.ts`, and the unlock-tier mapping (`unlocks.ts:148`) if gated.

## Logistics

- **`kitchenRawBuffer` is stove-only** (`sim.ts:6253`). Don't compute it elsewhere by walking all rawMeal item nodes — that double-counts the GrowStation buffer.
- **All three job creators run every tick with independent caps.** Don't try to share a global cap without rewriting `assignJobsToIdleCrew`.
- **Item-node capacity is set by `MODULE_DEFINITIONS`.** Changing a module's `itemNodeCapacity` clamps items at save-load time — old saves emit warnings.

## Crew

- **A staffed post needs the crew standing in that room AND the room to be active.** Crew "in transit" still count as `assigned` but not `active` (`staffInTransitBySystem`).
- **The 10–12s sticky lock is intentional anti-thrash.** Don't shorten without testing the thrash regression scenarios in `tools/sim-tests.ts`.
- **Air emergency wakes 15% of crew (`CREW_EMERGENCY_WAKE_RATIO`).** Air-critical (< 8) bypasses everything (`sim.ts:2505`). New emergency types need to decide whether they follow the same override.
- **`CREW_PER_*` constants are slot counts, not job counts.** A 2-slot room needs 2 crew on tiles inside it to be "fully staffed".

## Visitors / residents

- **Resident conversion requires `private_resident` housing** (`sim.ts:2371`). A Dorm without adjacent Hygiene + the right policy will never convert anyone — **the T5 unlock predicate stalls invisibly** with no UI hint.
- **Resident home-ships persistently occupy a dock.** Don't write code that auto-departs ships with `residentIds.length > 0` (`sim.ts:3721`).
- **Resident `state` and `routinePhase` are independent.** Critical-need overrides take priority over routine bias. Don't reorder the cascade in `assignResidentTarget` (`sim.ts:5473`) without re-running the resident scenarios.
- **Visitor `patience` starts at 0 and increments — high patience is bad.** Don't invert the sign.
- **`applyAirExposure` is shared between visitors and residents** (`sim.ts:1993`). Threshold changes affect both populations.

## Docks &amp; ships

- **A dock cluster can split when you delete a tile in the middle.** The first new cluster keeps the original id; the other gets a fresh one. Code holding a `dockId` across topology mutations may dangle.
- **Resident home-ships violate the normal depart stage.** Don't auto-clean ships that have been in `depart` "too long".
- **`validateDockPlacementAt` requires both an outward Space tile AND a 4-deep approach corridor** (`sim.ts:1605`). Building dock tiles flush against another wall fails silently.
- **`pickDockForShip` consumes both `allowedShipTypes` and `allowedShipSizes`.** Empty-ing either makes ships queue forever.

## Incidents / effects

- **`incidentsResolvedLifetime` is incremented inside `resolveIncident`, NOT in any metrics scan** (comment at `sim.ts:6626`). The scan-based `incidentsResolved` drops as resolved incidents prune past `INCIDENT_RESOLVED_RETENTION_SEC`. **Re-routing the metric to the scan breaks the T4 unlock predicate.**
- **Resting Security crew don't emit aura** (`sim.ts:1931`). Aura map only reads on-duty Security.
- **Brig multiplier (`brigContainmentMultiplier = 0.76`) only applies if a Brig exists AND has a Security responder.** Without a Brig, the multiplier is 1.0.
- **`effects.blockedUntilByTile` is keyed on tile index.** `expandMap` remaps these (`sim.ts:7553`+); new tile-index-keyed effects must be added to the remap.

## Progression

- **T6 predicate is hard-wired `false`** (`unlocks.ts:116`). Don't enable it accidentally; T6 is reachable only via `?scenario=t6-trophy` cold-start or save elevation.
- **`actorsTreatedLifetime` is a placeholder** — proxied from "recovered to healthy" transitions in `applyAirExposure` (`sim.ts:2021`). Adding explicit medical events should NOT replace this without re-routing the T5 predicate.
- **Save schema v1→v2 migration silently drops legacy unlock ids** (`tier1_stability`, `tier2_logistics`, `tier3_civic`). Don't reuse those id strings.

## Save / load

- **Pre-v2 saves have no `progression` block** — `archetypesEverSeen` defaults empty. Loading those can stick T2 if anyone expected in-progress visits to count from before the save.
- **Save migration auto-elevates unlock tier** if saved content (industrial/military ships, T2+ rooms/modules) requires more than declared (`save.ts:185`). Adding new gated content needs the corresponding tier-elevation entry.

## Economy / rating

- **`metrics.morale` is derived per tick, not stored.** Setting it from save/load doesn't stick — recompute drivers from state.
- **`usageTotals.ratingDelta` is the long-running accumulator.** HUD's rating reading is `STATION_RATING_START + ratingDelta` clamped 0–100. Don't overwrite ratingDelta on load — `hydrateStateFromSave` deliberately preserves it.
- **Visitor failure penalties are per-reason.** Adding a new failure mode means adding to `addVisitorFailurePenalty` AND the breakdown read in `refreshAlertPanel`.

## UI / DOM

- **`buildDevTierOverlayString` is the only export from `main.ts`** (`main.ts:1890`). Used by harness assertions; do not delete.
- **The DOM template is one giant string in `main.ts:85`.** Adding a section means editing that string. There's no component model. Keep the pattern.
- **Mutating sim state from `main.ts` goes through the explicit barrel `src/sim/index.ts`.** Adding a new mutator without updating the barrel breaks the import.

## Pipelines

- **`sprites:generate:*` and `sprites:retry:*` npm scripts are broken** — the underlying `.mjs` files were ripped out in PR #36. The README still references them. If you need regen, you'll need to re-add (or replace) the generators.
- **`pack-atlas.mjs --activate` cannot be used with `--variant pixellab`** — would overwrite primary atlas.
- **`verify-floor-periodicity.mjs` exempts every `room.*`** via `accepted-diffs.json .periodicity[]` while the seamless-tile pass is in flight. Removing those entries before seamless tiles land re-breaks the gate.
- **Harness `workers: 1`** — scenarios share localStorage state. Don't parallelize without test isolation rewrite.
- **Sim tests are explicit-listed in `run()`.** Adding a test function but forgetting to add the call is a silent skip.
- **Don't delete `tools/write-simtest-package.cjs`** — the sim-test compile output needs the CommonJS marker because the repo is `"type": "module"`.
- **GH Pages deploys on every push to main.** No PR preview deploy. The BMO mirror at `bmo.ryanboye.com/spacegame/` is ~5 min behind main via systemd timer.
- **`gpt-image-2 is not pixel-grid-aligned.** For tilesets that need precise cell snapping (autotile, dual-tilemap, atlas with magenta gutters), use PixelLab or a pixel-diffusion model — not gpt-image-2. (See `feedback_pixel_art_model_choice` memory.)

## Pixel art / sprites

- **`sprite-spec.yaml` hex codes inside prompts** must use a YAML block scalar `|-` (escapes `#` since YAML treats `# foo` as a comment). Bare hex on the same line breaks the spec parse.
- **`sprite-keys.ts` vs `sprite-keys-extended.ts`** — the first is the gameplay-stable contract. The second is forward-looking. Don't blur the line; new gameplay-required keys go in `sprite-keys.ts`, new authoring-only keys go in extended.

## Process

- **Owner = awfml.** Only awfml can request actions that modify shared state (deploy, push, merge). Other Discord users get chat-only access (CLAUDE.md).
- **Don't iterate sprite generation blind.** Always have a per-sprite comparison harness running BEFORE starting an iteration loop. (See `feedback_visual_testing_before_iteration` memory.)
- **Verify deployed URLs with Playwright BEFORE claiming "live/deployed/ready"** (see `feedback_e2e_testing_before_ready_claims` memory).
- **Prefer prior-art search over vibes-iteration on solved problems.** Walls/autotiling/pathing are solved — find the canonical algorithm first (see `feedback_prior_art_before_design` memory).
