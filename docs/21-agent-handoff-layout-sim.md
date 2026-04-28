# Agent Handoff - Layout Simulation Push

Last updated: 2026-04-28

Use this as the short handoff for the next agent team. Use `docs/15-current-roadmap.md` for the product map and `docs/20-station-layout-project-plans.md` for detailed packets.

## Landed

- Route intent kernel and route consequences.
- Room environment scoring for visitor status, resident comfort, service noise, and adjacency penalties.
- Utility maintenance debt for reactor/life-support output.
- Life-support coverage diagnostics.
- Diagnostic overlays and overlay keys/readouts.
- Route-pressure overlay.
- Route-pressure hover reasons and room-inspector route summaries.
- Agent side inspector and selected-agent route visualization.
- Crew rest pathing fix for crowded/stale dorm routes.
- Visitor Hygiene comfort/toilet stop v0, surfaced in visitor inspector.

## Current Verification

Recent checks passed:

- `npm run test:sim`
- `npm run build`

Generated build artifacts were restored after verification.

## Open Work

### Best Next People/Layout Slice: P8B + P9

- Broaden route-pressure reasons and convert room summaries into clearer player advice.
- Continue expanded needs: explicit crew toilet pressure and visitor leisure/social follow-ups beyond the Hygiene v0. Crew leisure/social v0 now routes to Lounge, RecHall, Market, or Cafeteria.
- Reuse current rooms first: Hygiene, Dorm, Cafeteria, Lounge, Market, RecHall.
- Ensure every new need creates visible route/queue/inspector feedback.

### Best Parallel Utility Slice: P5B

- Add local-air helper/storage.
- Keep global air as station average/trend.
- Use life-support coverage and disconnection to drive local air exposure.
- Update air overlay and actor inspectors to agree with local air failures.

### Later Workforce Slice: P4B

- Add minimal crew specialties.
- Connect mechanics/operators/logistics/security to assignment scoring.
- Make maintenance debt a visible repair/staffing loop.

## Parallel Ownership

- P8B owns route diagnostics/readouts/room route summaries.
- P9 crew team owns remaining crew self-care target selection, especially explicit toilet queues and capacity rules.
- P9 visitor team owns visitor auxiliary needs.
- P5B owns local air and `applyAirExposure` behavior.
- UI/docs/test team owns inspector copy, docs, and regression coverage.

Avoid overlapping rewrites of `updateCrewLogic`, visitor update logic, and `applyAirExposure`. Prefer small helper functions.
