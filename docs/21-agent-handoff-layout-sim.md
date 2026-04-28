# Agent Handoff - Layout Simulation Push

Last updated: 2026-04-28

## Commits Completed

- `02b5a8c feat: add route intent consequences`
- `cece31f feat: add room environment scoring`
- `3f03c30 feat: add utility maintenance debt`

## What Landed

- Path intent kernel: visitors, residents, crew, logistics, and security now path with different soft room costs. Path cache keys include intent.
- Route consequences: completed visitor service trips, resident need trips, and active logistics routes now record layout friction. Bad routes affect rating, stress, satisfaction, and crew drain.
- Room environment v0: room traits score visitor status, residential comfort, service noise, and public appeal. Bad adjacencies affect visitor rating/spend and resident stress/satisfaction. Metrics and room inspector hints expose the values.
- Maintenance debt v0: reactor/life-support clusters now accumulate maintenance debt keyed by `system:anchorTile`. Debt above 30 creates a utility staffing need through existing crew post assignment, reduces output, and appears in room warnings/ops metrics.

## Verification Run

- `npm run test:sim` passed after P7.
- `npm run build` passed after P7.
- `npm run test:sim` passed after P4.
- `npm run build` passed after P4.
- `git diff --check` passed before each commit.
- Generated `dist/index.html` and `tsconfig.tsbuildinfo` were restored after builds.

## Known Follow-Ups

- P4 specialties are not implemented yet. Add `CrewSpecialty`, specialty hire UI, scoring multipliers, and save/load defaulting in a separate pass.
- P4 maintenance debt is runtime state only. Save persistence/migration for `maintenanceDebts` is still open.
- P4 uses existing critical utility posts rather than a new `CrewTaskKind = 'maintenance'`. That kept v0 small; a future pass can split maintenance tasks if the post system feels too blunt.
- P7 conversion chance does not yet read residential comfort. Resident satisfaction/stress does, so conversion can build on that later.
- P5 local utility sectors should come next if the goal is to make life-support/reactor placement spatial rather than global.

## Suggested Next Slice

Start P5 with a read-only coverage map before adding failures:

1. Compute life-support source tiles from active life-support clusters.
2. Flood-fill through walkable pressurized floor and assign each tile distance to nearest source.
3. Add metrics: `lifeSupportCoveragePct`, `avgLifeSupportDistance`, `poorLifeSupportTiles`.
4. Surface a warning when occupied/residential/public tiles are far from active life support.
5. Only after metrics are stable, use coverage to gently affect local air exposure or room activity.

This keeps P5 independently buildable and avoids mixing a new spatial utility model with the maintenance-debt behavior that just landed.
