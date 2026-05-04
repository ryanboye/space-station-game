# Refactor Plan

Goal: reduce `src/sim/sim.ts` by extracting stable modules while preserving gameplay behavior.

## Guardrails

- Make one small extraction at a time.
- Do not redesign gameplay.
- Do not reorder the `tick` pipeline.
- Do not rename public APIs unless a compatibility export remains.
- Preserve deterministic RNG behavior, including placeholder draws.
- Preserve cache invalidation behavior and version bumps.
- Keep `StationState` mutable and in-place.
- After each extraction, run verification before moving to the next one.

## Verification Loop

For each extraction:

1. Make the smallest move that compiles.
2. Run `npm run build` for TypeScript and production build coverage.
3. Run `npm run test:sim` for deterministic simulation coverage.
4. Run `npm run test:harness` when the extraction touches rendering, previews, UI contracts, or visual behavior.
5. Update `PROJECT_MAP.md` and this plan with the new file ownership and next candidate.

## Current Status

- Planning docs created.
- `src/sim/sim.ts` has not been edited for this planning pass.
- Current `sim.ts` size: 15,535 lines.
- Existing unrelated untracked sprite archives are present under `tools/sprites/archive/`; they are outside this refactor.

## Safest First Extraction

Extract module geometry helpers from `src/sim/sim.ts` into `src/sim/module-geometry.ts`.

Functions to move:

- `moduleFootprint`
- `moduleMount`
- `footprintTiles`
- private `adjacentWalkableTiles`
- exported `wallMountedModuleServiceTile`
- exported `resolveWallMountedModuleFacing`

Why this is first:

- It is a compact, stable helper group.
- It does not call `state.rng()`.
- It does not mutate state.
- It does not bump cache versions.
- It does not participate directly in `tick` ordering.
- It depends only on `StationState`, tile helpers from `types.ts`, and `MODULE_DEFINITIONS`.

Compatibility requirement:

- Keep `wallMountedModuleServiceTile` and `resolveWallMountedModuleFacing` available from `src/sim/sim.ts`.
- Keep existing callers unchanged for the first extraction unless TypeScript forces a more direct import.

Expected impact:

- Small reduction in `sim.ts`.
- Low merge risk.
- Good proof that the extraction workflow and verification loop are sound before touching behavior-heavy systems.

## Near-Term Candidate Backlog

These are candidates, not commitments. Re-evaluate after each extraction.

| Candidate | Current area | Risk | Notes |
| --- | --- | --- | --- |
| Module geometry | `sim.ts:691-760` | Low | First extraction. Pure helper group, no RNG, no mutation. |
| Build costs and placement geometry wrappers | `sim.ts:2797-2864`, construction/module placement call sites | Low-medium | Depends on construction cost helpers and build validation. Do only after module geometry settles. |
| Berth config helpers | `sim.ts:15347-15432` | Low-medium | Mostly small state mutation, but ties into room-cluster pruning and ship unlocks. |
| Dock placement validation | `sim.ts:2635-2796`, public `validateDockPlacement` | Medium | Depends on dock cache lookup, lane helpers, and tile topology. Keep public export stable. |
| Derived cache version helpers | `sim.ts:888-1445` | Medium | Broad call graph and cache invalidation risk. Extract only after low-risk helpers are out. |
| Reservations | `sim.ts:7839-8025` | Medium | Stable domain, but many actor/job callers. Needs focused tests around owner summaries, expiry, and side effects. |
| Item nodes/material stock | `sim.ts:6598-6916` | Medium-high | Central to logistics, construction, resources, and save hydration. Extract after helper-only modules prove stable. |
| Traffic/manifest helpers | `sim.ts:381-456`, `2302-2634`, `6071-6488` | High | RNG-sensitive. Move only with snapshot/determinism checks. |
| Actor update loops | Crew `9131-10125`, visitor `10126-11037`, resident `11038-11929` | High | Behavior-heavy. Avoid until supporting modules are separated and tests are green. |
| `computeMetrics` | `sim.ts:12223-12851` | High | Large read aggregation with many hidden contracts to UI/tests. Extract late. |

## Proposed Extraction Workflow For First Move

1. Create `src/sim/module-geometry.ts` with the helper group.
2. Import `moduleFootprint`, `moduleMount`, `footprintTiles`, `wallMountedModuleServiceTile`, and `resolveWallMountedModuleFacing` into `sim.ts`.
3. Re-export the two public wall-mounted helpers from `sim.ts`.
4. Remove only the moved helper definitions from `sim.ts`.
5. Run `npm run build`.
6. Run `npm run test:sim`.
7. Update both docs with the new module and line-count delta.

