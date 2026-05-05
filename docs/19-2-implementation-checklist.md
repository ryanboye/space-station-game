# 19-2 Implementation Checklist: Maintenance, Debris, And EVA Repair

Last updated: 2026-05-04

Status: implementation complete, pending any follow-up balance/playtest tweaks. This is the working execution plan for `docs/19-2-maintenance-debris-and-eva-repair.md`, building on the shared spine in `docs/19-4-shared-drift-spine-and-rollout.md` and the department/tech-tree work in `docs/20-1-specialty-progression-reconciliation.md`.

## Codex Working Instructions

- At the start of every session, after every context compaction, and before making any code changes, re-open this document and continue from the first unchecked item.
- Work through the checklist line by line. If a later item becomes possible early, it is okay to do it, but still return here and mark the earlier dependency status clearly.
- When an item is completed, change `[ ]` to `[x]` in this file in the same change set or the next small doc update.
- When a concern, tradeoff, regression risk, or implementation discovery appears, add a short dated note under **Implementation Notes And Concerns**.
- Keep this checklist, the code, and the tests in sync. Do not claim a section is complete until the relevant tests, UI, docs, or manual playtest notes are recorded below.
- For sprite work, use the `imagegen` skill to create bitmap assets. Do not substitute SVG/code placeholders for the requested asteroid, debris, hull-wear, or impact sprite bitmaps.
- For project-bound imagegen outputs, move or copy the final bitmap into the repo sprite pipeline before referencing it. Do not leave project assets only under Codex generated-image storage.
- Animation can be implemented with whichever local method fits best: atlas frames, canvas particles, deterministic render effects, CSS, or another code-native approach. Use generated bitmaps for the sprite art itself.
- Preserve existing reactor/life-support maintenance behavior unless a checklist item explicitly changes it.
- Keep job pressure legible. Prefer coalesced maintenance targets and clear blocked reasons over many tiny invisible jobs.

## Completion Definition

- [x] 19-2 is implemented as a playable vertical slice: debris-risk maintenance, generalized wear, EVA repair, visible debris backdrop, UI explanation, tech-tree gating, scenario, tests, and docs.
- [x] `npm run test:sim` passes.
- [x] `npm run build` passes.
- [x] Localhost playtest confirms the scenario, overlay, EVA repair, and debris visuals are understandable.
- [x] This checklist has all completed items checked and any leftover concerns documented.

## 0. Baseline And Scope Control

- [x] Confirm the working branch and git status before editing.
- [x] Confirm the prior 19-1/19-4/20-1 work is present, including commit `e6e929a feat(command): activate sanitation department runtime` if this work remains stacked on the current PR branch.
- [x] Re-read `docs/19-2-maintenance-debris-and-eva-repair.md`.
- [x] Re-read the 19-4 shared spine sections for severity bands, job-volume controls, UI vocabulary, save/load, scenarios, and art pipeline.
- [x] Re-read 20-1/command data for Mechanical Department, `mechanic-officer`, `MechanicalTerminal`, and `mechanical-maintenance`.
- [x] Decide whether this work remains on the current PR branch or is split into a follow-up branch.
- [x] Record the starting branch, base commit, and any local constraints in the notes section.

## 1. Existing System Reconnaissance

- [x] Map the current maintenance data model: `MaintenanceSystem`, `MaintenanceDebt`, `state.maintenanceDebts`, metrics, save/load, and expansion behavior.
- [x] Map current repair job flow: enqueue, duplicate suppression, crew assignment, supplies, completion, labels, inspectors, and metrics.
- [x] Map current EVA construction helpers: airlock detection, suit-up, oxygen, interior path, space path, stalled route reasons.
- [x] Map current debris-risk condition API: `mapConditionAt`, `mapConditionSamplesAt`, overlay colors, hover strings, versioning, and tests.
- [x] Map current sprite pipeline: curated assets, sprite spec keys, required profile, atlas packing, validation limits, and missing generator scripts.
- [x] Record any trip-wires found during reconnaissance.

## 2. Maintenance Data Model And Migration

- [x] Add maintenance domain/source types while preserving utility systems.
- [x] Extend `MaintenanceDebt` with domain, source, exterior flag, target tile, optional room/module/system fields, and service timestamps.
- [x] Add helpers for stable maintenance target keys.
- [x] Migrate/hydrate old reactor/life-support debts as utility-domain debts.
- [x] Preserve existing reactor/life-support output multipliers and fire ignition rules.
- [x] Update map expansion logic for the extended debt shape.
- [x] Add targeted save/load and old-save compatibility tests.

## 3. Debris-Risk Maintenance Targets

- [x] Verify existing `debris-risk` sampling is deterministic, seed-dependent, bounded, and expansion-stable.
- [x] Add exterior target discovery for hull walls, dock tiles, berth perimeter, and relevant berth modules.
- [x] Coalesce exterior targets by useful anchor/sector so repair jobs do not flood the queue.
- [x] Add target diagnostics that can explain domain, source, debris risk, severity, effect, and fix.
- [x] Add tests for valid exterior discovery and coalescing.

## 4. Wear Accumulation

- [x] Add exterior hull/dock/berth wear using debris risk, traffic, berth/dock use, and idle baseline.
- [x] Add selected interior high-load wear for Stove, Workbench, GrowStation, Vent, FireExtinguisher, CargoArm, and heavy doors if feasible.
- [x] Keep early/basic utility maintenance available without advanced department gating.
- [x] Use the existing Mechanical branch as the maintenance owner: specialty `mechanical-maintenance`, officer `mechanic-officer`, terminal `MechanicalTerminal`.
- [x] Decide surfaced officer copy: keep "Mechanic Officer" or relabel player-facing copy to "Maintenance Officer" while preserving internal ids.
- [x] Enforce/verify the active Mechanical Department rule: completed specialty, hired officer, operational Bridge, matching terminal, and reachable officer/terminal path.
- [x] Apply Mechanical Department benefits/gates to advanced debris maintenance, hull/dock/berth diagnostics, EVA exterior maintenance prioritization, and broader preventive maintenance.
- [x] Keep Airlock/EVA construction generally available, but make reliable exterior repair work better or more legible once Mechanical is active.
- [x] Keep deferred roles such as `welder` and `eva-engineer` hidden unless they gain distinct gameplay in this slice.
- [x] Add job thresholds and hysteresis so worn targets open jobs at high debt and close below a lower debt.
- [x] Add caps or duplicate suppression by maintenance domain/target.
- [x] Tune rise rates so the system is visible in a scenario without overwhelming normal play.

## 5. Repair Jobs And EVA

- [x] Supplement or replace `job.repairSystem` with a broader repair target shape while maintaining compatibility.
- [x] Add interior repair jobs for generalized module/fixture targets.
- [x] Add exterior EVA repair jobs for exterior targets.
- [x] Reuse existing airlock, EVA suit, oxygen, and space-path behavior from construction.
- [x] Add clear blocked/stalled reasons, especially for no reachable airlock or no exterior route.
- [x] Ensure repair supplies still speed repair without making missing supplies a hard blocker.
- [x] Add tests for interior repair, exterior repair, blocked EVA repair, and debt completion hysteresis.

## 6. UI, Inspectors, Alerts, And Scenario

- [x] Upgrade the maintenance overlay to show generalized wear and exterior wear.
- [x] Show debris-risk context while maintenance overlay is active without hiding build readability.
- [x] Add hover text following `Condition -> Drift -> Source -> Effect -> Fix`.
- [x] Add room/module/hull/dock/berth inspector rows for current wear and repair route.
- [x] Update Station Ops maintenance/drift rows with interior vs EVA repair pressure.
- [x] Add actionable alerts for active/severe wear and blocked EVA repair.
- [x] Add `?scenario=entropy-maintenance` with a high-risk dock/berth edge, airlock, crew, repair supplies, and Mechanical Department path coverage.
- [x] Update 19-4 implementation status for the maintenance scenario when done.

## 7. Bitmap Sprites, Backdrop, And Impact Animation

- [x] Use the `imagegen` skill to generate bitmap sprite assets for planetary background bodies, distant asteroid clusters, small meteorite/debris flecks, hull-wear overlays, and hull impact spark/puff effects.
- [x] Inspect generated outputs and keep only assets that fit the existing pixel-art/top-down station style.
- [x] Move accepted bitmaps into `tools/sprites/curated/` or another repo-owned asset location before use.
- [x] Add or reuse sprite keys for `space.asteroid.*`, `space.debris.*`, `space.planet.*`, `overlay.wall.hull_wear.*`, and `fx.repair.spark`/impact equivalents.
- [x] Pack/validate the atlas or document any validation limitation encountered.
- [x] Render deterministic background asteroid/debris sprites with density biased by debris risk and seed.
- [x] Make high-risk map edges visually busier with more asteroid, meteorite, and debris sprites; keep low-risk areas visually quieter.
- [x] Add subtle exterior hull/dock/berth impact animation when debris risk contributes wear so players can infer why those areas are accumulating maintenance debt.
- [x] Keep impacts cosmetic in v1; they should communicate accumulating wear without introducing random catastrophic hull breaches.
- [x] Keep the first pass lightweight: generated/curated bitmaps plus a fallback canvas/code effect if an art asset is missing or fails validation.
- [x] Ensure debris/backdrop visuals do not occlude selection, construction previews, room sprites, or text.
- [x] Verify desktop and mobile-ish viewport readability in the browser.

## 8. Tests And Verification

- [x] Add sim tests for debris risk determinism and seed difference if current coverage is insufficient.
- [x] Add sim tests for exterior target discovery.
- [x] Add sim tests for high-risk exterior wear rising faster than low-risk exterior wear.
- [x] Add sim tests for ship traffic increasing dock/berth wear.
- [x] Add sim tests for EVA repair reducing exterior debt.
- [x] Add sim tests for no-airlock or unreachable-airlock blocked repair.
- [x] Add sim tests for selected interior module wear and repair.
- [x] Run `npm run test:sim`.
- [x] Run `npm run build`.
- [x] Playtest `http://localhost:5174/?scenario=entropy-maintenance`.
- [x] Record final verification notes below.

## Implementation Notes And Concerns

- 2026-05-04: 19-2 should build on the existing shared map-condition API, department runtime spine, and sanitation drift vocabulary rather than creating separate concepts.
- 2026-05-04: Existing maintenance is currently utility-focused; the refactor should preserve old reactor/life-support behavior while widening target shape.
- 2026-05-04: Existing EVA construction behavior is the model for exterior repair. Prefer reuse over a second EVA path system.
- 2026-05-04: Sprite generation scripts in the repo are incomplete, but curated assets plus atlas packing are documented as the reliable path. Use `imagegen` for bitmap creation, then integrate accepted PNGs through the repo-owned asset pipeline.
- 2026-05-04: The earlier suggestion to skip background debris art is superseded. Debris backdrop sprites and hull impact animations are now part of the 19-2 slice because they make debris-driven wear legible.
- 2026-05-04: Keep catastrophic hull breaches out of v1. Severe wear should create warnings, service slowdown, urgency, and visual hits, not surprise disaster management.
- 2026-05-04: This implementation stayed stacked on `feat/department-state-derivation`, after `e6e929a feat(command): activate sanitation department runtime`.
- 2026-05-04: Heavy-use door wear was deferred in v1 because the current door flow does not expose a durable per-door traffic counter; module, utility, hull, dock, and berth wear are implemented.
- 2026-05-04: Mechanical Department remains internally `mechanic-officer` / `mechanical-maintenance` / `MechanicalTerminal`; player-facing summary copy uses the existing Mechanic Officer label for consistency.
- 2026-05-04: Imagegen output was copied into `tools/sprites/generated-source/`, chroma-keyed, cropped into curated repo-owned PNGs, and packed into the v1 atlas.
- 2026-05-04: `npm run sprites:pack` still reports pre-existing golden-image drift across older sprites before packing. Direct atlas pack and validation for the v1 profile pass, so the new sprite keys are usable.
- 2026-05-04: Module wear keys use stable origin tiles instead of runtime module ids because module ids are rebuilt during save hydration.

## Verification Log

- 2026-05-04: `node tools/sprites/pack-atlas.mjs --profile v1` passed and packed 170 keys.
- 2026-05-04: `node tools/sprites/validate-atlas.mjs --profile v1` passed with 170 keys.
- 2026-05-04: `npm run test:sim` passed.
- 2026-05-04: `npm run build` passed.
- 2026-05-04: Localhost smoke playtest passed at `http://127.0.0.1:5174/?scenario=entropy-maintenance`; sprite status reported active and the maintenance diagnostic/canvas rendered.
- 2026-05-04: Browser smoke screenshot captured at `/tmp/entropy-maintenance-smoke.png`.
