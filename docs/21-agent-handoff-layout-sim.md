# Agent Handoff - Layout Simulation Push

Last updated: 2026-04-28

## Commits Completed

- `02b5a8c feat: add route intent consequences`
- `cece31f feat: add room environment scoring`
- `3f03c30 feat: add utility maintenance debt`
- Current commit: `feat: add life-support coverage diagnostics`

## What Landed

- Path intent kernel: visitors, residents, crew, logistics, and security now path with different soft room costs. Path cache keys include intent.
- Route consequences: completed visitor service trips, resident need trips, and active logistics routes now record layout friction. Bad routes affect rating, stress, satisfaction, and crew drain.
- Room environment v0: room traits score visitor status, residential comfort, service noise, and public appeal. Bad adjacencies affect visitor rating/spend and resident stress/satisfaction. Metrics and room inspector hints expose the values.
- Maintenance debt v0: reactor/life-support clusters now accumulate maintenance debt keyed by `system:anchorTile`. Debt above 30 creates a utility staffing need through existing crew post assignment, reduces output, and appears in room warnings/ops metrics.
- Life-support coverage diagnostics: active life-support clusters now compute reach through walkable, pressurized tiles. Metrics expose coverage %, average distance, and poor tiles; room inspector warns on disconnected/distant rooms.

## Verification Run

- `npm run test:sim` passed after P7.
- `npm run build` passed after P7.
- `npm run test:sim` passed after P4.
- `npm run build` passed after P4.
- `npm run test:sim` passed after P5 coverage diagnostics.
- `npm run build` passed after P5 coverage diagnostics.
- `git diff --check` passed before each commit.
- Generated `dist/index.html` and `tsconfig.tsbuildinfo` were restored after builds.

## Known Follow-Ups

- P4 specialties are not implemented yet. Add `CrewSpecialty`, specialty hire UI, scoring multipliers, and save/load defaulting in a separate pass.
- P4 maintenance debt is runtime state only. Save persistence/migration for `maintenanceDebts` is still open.
- P4 uses existing critical utility posts rather than a new `CrewTaskKind = 'maintenance'`. That kept v0 small; a future pass can split maintenance tasks if the post system feels too blunt.
- P7 conversion chance does not yet read residential comfort. Resident satisfaction/stress does, so conversion can build on that later.
- P5 local utility sectors now have read-only coverage metrics. The remaining step is local-air gameplay.

## Suggested Next Slice

Continue P5 by turning the coverage map into local air:

1. Add local-air storage or a derived `airQualityAtTile(state, tile)` helper.
2. Keep `metrics.airQuality` as the global station average/trend for now.
3. Use coverage distance/unreachable state to lower local air in disconnected or distant rooms.
4. Change `applyAirExposure` callers to pass local air.
5. Add tests where central actors stay healthy while actors in a disconnected wing become distressed.

The coverage-only slice deliberately avoids changing actor survival yet, so local-air gameplay can be tuned independently.
