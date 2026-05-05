# 19-5 Implementation Checklist: Utility Underlay And Ventilation Networks

Last updated: 2026-05-05

Status: implemented and locally verified. This is the working execution record for a reusable underlaid utility layer, with ventilation/duct networks as the first playable consumer and future piping/electrical conduit systems designed to reuse the same spine.

## Codex Working Instructions: Read First Every Session

- At the start of every session, after every context compaction, after any interruption, and before making any code changes, re-open this document and continue from the first unchecked item.
- Work through the checklist line by line. If a later item becomes possible early, it is okay to do it, but still return here and mark the earlier dependency status clearly.
- Before each meaningful code edit, identify which unchecked checklist item the edit advances. After the edit, come back here before moving far ahead.
- When an item is completed, change `[ ]` to `[x]` in this file in the same change set or the next small doc update. Do not batch all checkbox updates until the end.
- When a concern, tradeoff, regression risk, performance issue, testing result, or implementation discovery appears, add a short dated note under **Implementation Notes And Concerns**.
- Keep this checklist, the code, and the tests in sync. Do not claim a section is complete until the relevant tests, UI, docs, or manual playtest notes are recorded below.
- The **Completion Definition** stays unchecked until the verification log records passing `npm run test:sim`, passing `npm run build`, and localhost playtest notes.
- Build the underlay as reusable infrastructure. Ventilation is the first use case, but the grid, renderer, placement tools, save/load, diagnostics, connectivity helpers, and overlay vocabulary must support later hot pipes, cold pipes, electrical conduits, coolant lines, data lines, or water pipes without a rewrite.
- Use the `imagegen` skill for project-bound bitmap utility sprites such as tileable ducts, pipes, conduit, junctions, vents, HVAC machinery, or air scrubber modules. Move accepted outputs into the repo sprite pipeline before referencing them.
- Keep the v1 sim understandable. Do not drift into full computational fluid dynamics, gas composition, pressure waves, detailed pipe diameter math, or room-by-room HVAC engineering.
- Preserve existing life-support, thermal, stale-air, save/load, and scenario behavior until the new network path has equivalent or better tests.
- Vents should remain the visible room output. The underlay should be hidden unless its overlay/build mode is active.
- Allow limited air leakage through doors so every room does not require its own vent. Tune leakage low enough that ducts and vents still matter for large/hot/stale rooms.

## Completion Definition

- [x] 19-5 is implemented as a playable vertical slice: reusable utility underlay, air-duct placement, connected duct networks, vents/HVAC connected through ducts, door leakage, UI overlay, scenario, tests, and docs.
- [x] `npm run test:sim` passes.
- [x] `npm run build` passes.
- [x] Localhost playtest confirms the underlay overlay, duct placement, vent connectivity, disconnected-network feedback, and thermal/stale-air behavior are understandable.
- [x] This checklist has all completed items checked and any leftover concerns documented.

## 0. Baseline And Scope Control

- [x] Confirm the working branch and git status before editing.
- [x] Re-read `docs/19-3-sunlight-shade-thermal-air.md` for the current thermal/stale-air model.
- [x] Re-read `docs/19-3-implementation-checklist.md` for completed thermal slice constraints and follow-up notes.
- [x] Re-read `docs/19-4-shared-drift-spine-and-rollout.md` for shared severity, scenario, save/load, and overlay vocabulary.
- [x] Re-read current Life Support and Vent code around `computeLifeSupportCoverage`.
- [x] Decide whether this work stays stacked on the current branch or moves to a follow-up branch.
- [x] Record the starting branch, base commit, and any local constraints in the notes section.

## 1. Existing System Reconnaissance

- [x] Map current Vent behavior: wall mount rules, service tile selection, powered range, projection radius, stale-air relief, thermal cooling, inspector text, and tests.
- [x] Map current Life Support room activation and air coverage diagnostics.
- [x] Map current Thermal overlay and Air Coverage overlay rendering paths.
- [x] Map current build tools for tiles/modules and identify where a utility-underlay build mode should fit.
- [x] Map current save/load, old-save migration, and map expansion behavior for tile-aligned arrays.
- [x] Map current sprite atlas support for tileable underlay sprites and module sprites.
- [x] Record trip-wires found during reconnaissance.

## 2. Reusable Utility Underlay Spine

- [x] Add a shared `UtilityUnderlayKind` type with `air-duct` as the first implemented kind and reserved/future kinds such as `hot-pipe`, `cold-pipe`, `power-conduit`, `coolant-pipe`, `water-pipe`, and `data-conduit`.
- [x] Add a reusable tile-aligned underlay data model that can store multiple utility kinds per tile without fighting normal floor/wall/room/module state.
- [x] Add helpers for reading, writing, clearing, copying, and expanding underlay utilities.
- [x] Add neighbor-mask/connectivity helpers shared by all utility kinds for straight, corner, tee, cross, end, and isolated shapes.
- [x] Add network discovery helpers that return connected components, sources, sinks, disconnected segments, capacity/quality placeholders, and diagnostics.
- [x] Add save/load migration so old saves initialize empty underlay state.
- [x] Add map expansion remapping for all utility layers.
- [x] Keep the public API generic enough that later piping/electrical work can add behavior without duplicating renderer/build/save/connectivity code.

## 3. Ventilation Gameplay Model

- [x] Replace the current "Vent within range of Life Support" rule with duct-network connectivity while preserving old behavior until the new path is complete.
- [x] Add an underlay `Air Duct` utility that can be drawn under floors and possibly through walls when explicitly allowed.
- [x] Add or adapt a Life Support room HVAC/source module that injects fresh air into connected air-duct networks.
- [x] Keep existing wall Vent modules as above-ground room output/sink nodes connected to the underlay network.
- [x] Decide whether a Vent connects through its wall tile, adjacent service tile, or either, and document the rule in diagnostics.
- [x] Add optional HVAC/Air Scrubber concepts if needed, but avoid splitting into too many modules in v1.
- [x] Add limited door leakage: rooms connected by doors should share reduced fresh-air/stale-air pressure even when only one room has a vent.
- [x] Tune leakage so small adjacent rooms can get by without one vent each, while large/hot/stale rooms still benefit from direct vent output.
- [x] Preserve current oxygen survival readability separately from thermal/stale-air readability.
- [x] Ensure disconnected ducts and unpowered vents produce clear blocked reasons instead of silently doing nothing.

## 4. UI, Underlay Overlay, And Build UX

- [x] Add a reusable utility-underlay overlay mode that can show any utility kind, not just air ducts.
- [x] Add an Air Network view that hides or dims normal clutter enough to show underfloor ducts, connected networks, source nodes, output vents, and disconnected segments.
- [x] Keep underlay sprites invisible in normal station view.
- [x] Add build-palette controls for drawing and erasing Air Duct underlay tiles.
- [x] Support click-drag drawing with stable preview behavior and no layout shift.
- [x] Render connected duct shapes using shared neighbor masks.
- [x] Color connected air networks distinctly enough to debug parallel systems.
- [x] Show disconnected ducts, unpowered vents, missing HVAC/source modules, and weak door leakage in hover/inspector text.
- [x] Keep Air Coverage focused on oxygen/survival and Thermal focused on heat/stale pressure; use the underlay overlay for duct topology.
- [x] Leave room in the UI model for future hot/cold pipes and power conduits without adding one-off controls for air only.

## 5. Bitmap Sprites And Visual Treatment

- [x] Use the `imagegen` skill to generate tileable bitmap sprites for air ducts/conduit in the existing pixel-art station style.
- [x] Generate or curate separate readable sprites for straight, corner, tee, cross, end, and junction states if neighbor-mask rendering cannot rotate/reuse a smaller set cleanly.
- [x] Generate or curate visible above-ground HVAC/Air Scrubber machinery if the gameplay model needs a distinct source module.
- [x] Generate or curate any missing vent connection/output art if the current Vent sprite does not read well in the underlay overlay.
- [x] Move accepted generated bitmaps into `tools/sprites/curated/` or another repo-owned sprite source location.
- [x] Add sprite keys to the sprite spec, required-key list, usage map, and runtime sprite map.
- [x] Pack and validate the atlas.
- [x] Add fallback code-native line rendering if an underlay sprite is missing, but do not ship the primary v1 as placeholder-only art.

## 6. Simulation Integration

- [x] Implement air-network discovery from Life Support/HVAC sources through air ducts to Vent outputs.
- [x] Feed connected vent outputs into `computeLifeSupportCoverage`.
- [x] Feed connected vent outputs and door leakage into stale-air relief.
- [x] Decide whether HVAC/duct networks affect heat cooling in v1 or only stale-air/fresh-air coverage.
- [x] Preserve or intentionally retune the current thermal balance so `entropy-thermal` still demonstrates hot rooms.
- [x] Add metrics for source count, powered vents, disconnected duct segments, weak rooms, and average air-network distance.
- [x] Add room and tile diagnostics following `Condition -> Drift -> Source -> Effect -> Fix`.
- [x] Add actionable alerts for disconnected critical ventilation, unpowered vents, and severe stale air.

## 7. Scenario And Player-Facing Explanation

- [x] Add `?scenario=entropy-ventilation` or extend `?scenario=entropy-thermal` with a ducted HVAC setup, at least one disconnected branch, and at least one door-leakage example.
- [x] Include a Life Support/HVAC source, ducts, multiple vents, and a hot/stale room that improves when connected.
- [x] Include a small side room that remains acceptable through door leakage without its own vent.
- [x] Include a larger or hotter room that needs direct vent output.
- [x] Add UI copy/diagnostics that explain why one room can rely on door leakage while another cannot.
- [x] Update 19-4 implementation status when the slice lands.

## 8. Tests And Verification

- [x] Add sim tests for underlay save/load migration.
- [x] Add sim tests for map expansion preserving underlay utility positions.
- [x] Add sim tests for utility neighbor masks and connected-component discovery.
- [x] Add sim tests for parallel air networks remaining independent.
- [x] Add sim tests for connected HVAC/source -> duct -> vent powering.
- [x] Add sim tests for disconnected ducts/vents producing blocked diagnostics.
- [x] Add sim tests for door leakage helping adjacent small rooms.
- [x] Add sim tests proving large/hot/stale rooms still benefit from direct vents.
- [x] Add sim tests preserving existing Life Support/Oxygen and Thermal behavior where intended.
- [x] Run `npm run test:sim`.
- [x] Run `npm run build`.
- [x] Playtest the ventilation scenario on localhost.
- [x] Record final verification notes below.

## Deferred Ideas

- [ ] Hot/cold pipe gameplay for radiators, chillers, heat sinks, kitchen heat exhaust, or coolant loops.
- [ ] Electrical conduit underlay for power distribution and outages.
- [ ] Water/waste pipes for hygiene, kitchen, hydroponics, and sanitation.
- [ ] Data/control conduit for bridge/department terminals.
- [ ] Duct damage, repair jobs, and debris/fire/sabotage interactions.
- [ ] Capacity/diameter upgrades, fans, valves, filters, pressure regulators, or flow direction.

## Implementation Notes And Concerns

- 2026-05-05: User direction is to make the underlay reusable for future piping/electrical conduit features, not an air-only renderer.
- 2026-05-05: Current vents are abstract range extenders: they power if reachable from active Life Support within 16 tiles, then project a 6-tile fresh-air bubble. The new duct network should replace that reach rule while preserving clear coverage diagnostics.
- 2026-05-05: Door leakage is intentionally part of v1 so small connected rooms do not require one vent per room.
- 2026-05-05: Vents remain above-ground output modules; ducts/conduits live in a separate underlaid view and are invisible when the underlay view is off.
- 2026-05-05: Use imagegen for tileable duct/conduit bitmaps when implementation begins.
- 2026-05-05: Starting branch is `codex/utility-underlay-ventilation` at `2618385`; git status was clean before implementation edits.
- 2026-05-05: Current branch is intentionally a follow-up branch from locally merged `main`, so the reusable utility-underlay work is not stacked directly into the older department refactor branch.
- 2026-05-05: Existing Life Support coverage seeds active `RoomType.LifeSupport` tiles, powers wall-mounted `Vent` modules when their service tile is within `VENT_REACH_FROM_LS = 16`, then projects a `VENT_PROJECTION_RADIUS = 6` bubble that continues through walkable pressurized tiles.
- 2026-05-05: Existing thermal/stale-air model reads direct nearby Vent relief even if the Vent is not connected to Life Support, so the ducted model must make connected vent relief explicit instead of trusting proximity alone.
- 2026-05-05: Save/load and expansion already remap tile-aligned thermal and sanitation arrays; underlay layers should follow the same shape and old saves should initialize empty layers without warnings.
- 2026-05-05: Build palette has Structure/Rooms/Modules/Crew/Overlays tabs; the underlay build mode should live with build tools but force the utility-underlay/Air Network overlay for feedback.
- 2026-05-05: Sprite atlas support is profile/key based from `tools/sprites/sprite-spec.yaml`, `required-keys-v1.json`, `usage-map.json`, and `tools/sprites/curated`; new underlay art needs keys plus packed atlas entries.
- 2026-05-05: Added `src/sim/utility-underlay.ts` as the reusable spine: all reserved utility kinds share tile-aligned `Uint8Array` layers, generic placement/clear/copy helpers, neighbor masks, connected-component discovery, source/sink diagnostics, save/load migration, and expansion remapping.
- 2026-05-05: `air-duct` is the only implemented placeable utility in v1; future layers are stored and remapped by the same state shape but intentionally blocked from build placement until they have gameplay.
- 2026-05-05: Duct mode is backward-compatible: old stations with no air ducts keep legacy vent reach behavior, while any placed air duct switches vents to explicit source-network connectivity.
- 2026-05-05: Life Support room tiles with `air-duct` act as source nodes; wall Vent modules connect through their service tile if that service tile has `air-duct`. Interior-wall duct placement is allowed where the wall is not space-facing, so ducts can cross room boundaries without becoming visible normal-world modules.
- 2026-05-05: Distinct HVAC/Air Scrubber modules were not added for v1 because active Life Support already provides the source role. Future HVAC modules can become additional `air-duct` source nodes through the same network helper.
- 2026-05-05: Separate straight/corner/tee/cross bitmap sprites were not necessary for v1. The generated tileable duct bitmap gives the texture, while code-native neighbor-mask strokes render the exact topology, connection color, and blocked state.
- 2026-05-05: Current Vent art reads well enough as the above-ground output. The Air Network overlay adds cyan output markers and red missing/unpowered markers, so no new vent sprite was needed for this slice.
- 2026-05-05: `npm run sprites:build:v1` is currently wired to a missing `sprites:generate:v1` package script. For this slice the accepted generated bitmap was moved into `tools/sprites/curated/`, packed with `npm run sprites:pack:no-verify`, then validated with `npm run sprites:validate:v1`.
- 2026-05-05: Door leakage is represented by coverage propagation through doors and by lower-strength indirect thermal/stale-air relief. Direct powered vents still matter for the hot workshop/kitchen branch in the ventilation scenario.
- 2026-05-05: Alert panel now surfaces unpowered air vents/disconnected duct segments and severe thermal pressure, while the room warning line keeps the more detailed source text.
- 2026-05-05: Air Network overlay performance fix: the renderer now reuses the single computed air-network diagnostics object while drawing, instead of rebuilding the full graph once per duct tile. The cache key also uses the underlay version instead of hashing the whole layer each frame.
- 2026-05-05: Air Network now merges Air Coverage context into the same view: air-reach planning tints render underneath ducts and vent connectivity, so players can plan duct placement without toggling between two linked overlays. This intentionally uses source reach/poor coverage rather than live oxygen percentage so filled rooms can still reveal bad duct planning.

## Verification Log

- 2026-05-05: Planning document created.
- 2026-05-05: `npm run test:sim` passed with new underlay, air-network, save/load, expansion, and door-leakage regression coverage.
- 2026-05-05: `npm run sprites:validate:v1` passed after packing `overlay.utility.air_duct_tile` into the active atlas.
- 2026-05-05: `npm run build` passed. Vite still reports the pre-existing large `main` chunk warning.
- 2026-05-05: Localhost smoke on `http://127.0.0.1:5174/?scenario=entropy-ventilation` confirmed the Air Network overlay, duct sprite/stroke rendering, build palette buttons, connected and disconnected network colors, legend/readout text, and alert-panel warnings. Harness metrics after 20 simulated seconds: 2 networks, 2 powered vents, 1 unpowered vent, 7 disconnected duct tiles, thermal max 86%, stale-air tiles 107.
- 2026-05-05: Localhost performance smoke after the Air Network render fix confirmed duct dragging still updates networks and alerts correctly. Headless run after drawing reported 3 networks, 2 powered vents, 1 unpowered vent, and 7 disconnected duct tiles.
