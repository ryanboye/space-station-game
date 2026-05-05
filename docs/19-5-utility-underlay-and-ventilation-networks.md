# 19-5 Implementation Checklist: Utility Underlay And Ventilation Networks

Last updated: 2026-05-05

Status: planning draft, implementation not started. This is the working execution plan for a reusable underlaid utility layer, with ventilation/duct networks as the first playable consumer and future piping/electrical conduit systems designed to reuse the same spine.

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

- [ ] 19-5 is implemented as a playable vertical slice: reusable utility underlay, air-duct placement, connected duct networks, vents/HVAC connected through ducts, door leakage, UI overlay, scenario, tests, and docs.
- [ ] `npm run test:sim` passes.
- [ ] `npm run build` passes.
- [ ] Localhost playtest confirms the underlay overlay, duct placement, vent connectivity, disconnected-network feedback, and thermal/stale-air behavior are understandable.
- [ ] This checklist has all completed items checked and any leftover concerns documented.

## 0. Baseline And Scope Control

- [ ] Confirm the working branch and git status before editing.
- [ ] Re-read `docs/19-3-sunlight-shade-thermal-air.md` for the current thermal/stale-air model.
- [ ] Re-read `docs/19-3-implementation-checklist.md` for completed thermal slice constraints and follow-up notes.
- [ ] Re-read `docs/19-4-shared-drift-spine-and-rollout.md` for shared severity, scenario, save/load, and overlay vocabulary.
- [ ] Re-read current Life Support and Vent code around `computeLifeSupportCoverage`.
- [ ] Decide whether this work stays stacked on the current branch or moves to a follow-up branch.
- [ ] Record the starting branch, base commit, and any local constraints in the notes section.

## 1. Existing System Reconnaissance

- [ ] Map current Vent behavior: wall mount rules, service tile selection, powered range, projection radius, stale-air relief, thermal cooling, inspector text, and tests.
- [ ] Map current Life Support room activation and air coverage diagnostics.
- [ ] Map current Thermal overlay and Air Coverage overlay rendering paths.
- [ ] Map current build tools for tiles/modules and identify where a utility-underlay build mode should fit.
- [ ] Map current save/load, old-save migration, and map expansion behavior for tile-aligned arrays.
- [ ] Map current sprite atlas support for tileable underlay sprites and module sprites.
- [ ] Record trip-wires found during reconnaissance.

## 2. Reusable Utility Underlay Spine

- [ ] Add a shared `UtilityUnderlayKind` type with `air-duct` as the first implemented kind and reserved/future kinds such as `hot-pipe`, `cold-pipe`, `power-conduit`, `coolant-pipe`, `water-pipe`, and `data-conduit`.
- [ ] Add a reusable tile-aligned underlay data model that can store multiple utility kinds per tile without fighting normal floor/wall/room/module state.
- [ ] Add helpers for reading, writing, clearing, copying, and expanding underlay utilities.
- [ ] Add neighbor-mask/connectivity helpers shared by all utility kinds for straight, corner, tee, cross, end, and isolated shapes.
- [ ] Add network discovery helpers that return connected components, sources, sinks, disconnected segments, capacity/quality placeholders, and diagnostics.
- [ ] Add save/load migration so old saves initialize empty underlay state.
- [ ] Add map expansion remapping for all utility layers.
- [ ] Keep the public API generic enough that later piping/electrical work can add behavior without duplicating renderer/build/save/connectivity code.

## 3. Ventilation Gameplay Model

- [ ] Replace the current "Vent within range of Life Support" rule with duct-network connectivity while preserving old behavior until the new path is complete.
- [ ] Add an underlay `Air Duct` utility that can be drawn under floors and possibly through walls when explicitly allowed.
- [ ] Add or adapt a Life Support room HVAC/source module that injects fresh air into connected air-duct networks.
- [ ] Keep existing wall Vent modules as above-ground room output/sink nodes connected to the underlay network.
- [ ] Decide whether a Vent connects through its wall tile, adjacent service tile, or either, and document the rule in diagnostics.
- [ ] Add optional HVAC/Air Scrubber concepts if needed, but avoid splitting into too many modules in v1.
- [ ] Add limited door leakage: rooms connected by doors should share reduced fresh-air/stale-air pressure even when only one room has a vent.
- [ ] Tune leakage so small adjacent rooms can get by without one vent each, while large/hot/stale rooms still benefit from direct vent output.
- [ ] Preserve current oxygen survival readability separately from thermal/stale-air readability.
- [ ] Ensure disconnected ducts and unpowered vents produce clear blocked reasons instead of silently doing nothing.

## 4. UI, Underlay Overlay, And Build UX

- [ ] Add a reusable utility-underlay overlay mode that can show any utility kind, not just air ducts.
- [ ] Add an Air Network view that hides or dims normal clutter enough to show underfloor ducts, connected networks, source nodes, output vents, and disconnected segments.
- [ ] Keep underlay sprites invisible in normal station view.
- [ ] Add build-palette controls for drawing and erasing Air Duct underlay tiles.
- [ ] Support click-drag drawing with stable preview behavior and no layout shift.
- [ ] Render connected duct shapes using shared neighbor masks.
- [ ] Color connected air networks distinctly enough to debug parallel systems.
- [ ] Show disconnected ducts, unpowered vents, missing HVAC/source modules, and weak door leakage in hover/inspector text.
- [ ] Keep Air Coverage focused on oxygen/survival and Thermal focused on heat/stale pressure; use the underlay overlay for duct topology.
- [ ] Leave room in the UI model for future hot/cold pipes and power conduits without adding one-off controls for air only.

## 5. Bitmap Sprites And Visual Treatment

- [ ] Use the `imagegen` skill to generate tileable bitmap sprites for air ducts/conduit in the existing pixel-art station style.
- [ ] Generate or curate separate readable sprites for straight, corner, tee, cross, end, and junction states if neighbor-mask rendering cannot rotate/reuse a smaller set cleanly.
- [ ] Generate or curate visible above-ground HVAC/Air Scrubber machinery if the gameplay model needs a distinct source module.
- [ ] Generate or curate any missing vent connection/output art if the current Vent sprite does not read well in the underlay overlay.
- [ ] Move accepted generated bitmaps into `tools/sprites/curated/` or another repo-owned sprite source location.
- [ ] Add sprite keys to the sprite spec, required-key list, usage map, and runtime sprite map.
- [ ] Pack and validate the atlas.
- [ ] Add fallback code-native line rendering if an underlay sprite is missing, but do not ship the primary v1 as placeholder-only art.

## 6. Simulation Integration

- [ ] Implement air-network discovery from Life Support/HVAC sources through air ducts to Vent outputs.
- [ ] Feed connected vent outputs into `computeLifeSupportCoverage`.
- [ ] Feed connected vent outputs and door leakage into stale-air relief.
- [ ] Decide whether HVAC/duct networks affect heat cooling in v1 or only stale-air/fresh-air coverage.
- [ ] Preserve or intentionally retune the current thermal balance so `entropy-thermal` still demonstrates hot rooms.
- [ ] Add metrics for source count, powered vents, disconnected duct segments, weak rooms, and average air-network distance.
- [ ] Add room and tile diagnostics following `Condition -> Drift -> Source -> Effect -> Fix`.
- [ ] Add actionable alerts for disconnected critical ventilation, unpowered vents, and severe stale air.

## 7. Scenario And Player-Facing Explanation

- [ ] Add `?scenario=entropy-ventilation` or extend `?scenario=entropy-thermal` with a ducted HVAC setup, at least one disconnected branch, and at least one door-leakage example.
- [ ] Include a Life Support/HVAC source, ducts, multiple vents, and a hot/stale room that improves when connected.
- [ ] Include a small side room that remains acceptable through door leakage without its own vent.
- [ ] Include a larger or hotter room that needs direct vent output.
- [ ] Add UI copy/diagnostics that explain why one room can rely on door leakage while another cannot.
- [ ] Update 19-4 implementation status when the slice lands.

## 8. Tests And Verification

- [ ] Add sim tests for underlay save/load migration.
- [ ] Add sim tests for map expansion preserving underlay utility positions.
- [ ] Add sim tests for utility neighbor masks and connected-component discovery.
- [ ] Add sim tests for parallel air networks remaining independent.
- [ ] Add sim tests for connected HVAC/source -> duct -> vent powering.
- [ ] Add sim tests for disconnected ducts/vents producing blocked diagnostics.
- [ ] Add sim tests for door leakage helping adjacent small rooms.
- [ ] Add sim tests proving large/hot/stale rooms still benefit from direct vents.
- [ ] Add sim tests preserving existing Life Support/Oxygen and Thermal behavior where intended.
- [ ] Run `npm run test:sim`.
- [ ] Run `npm run build`.
- [ ] Playtest the ventilation scenario on localhost.
- [ ] Record final verification notes below.

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

## Verification Log

- 2026-05-05: Planning document created. No implementation verification yet.
