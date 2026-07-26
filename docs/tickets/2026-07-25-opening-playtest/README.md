# Opening Playtest Tickets - 2026-07-25

These tickets come from a clean new-game playthrough at the recommended charter site. The run covered site selection, the first 30 pod visits, meal and retail depletion, payroll, watch rotation, Tier 0 through Tier 3, crew-needs failure, the opening ledger, construction of a medium berth, three ship turnarounds, hiring to 10 crew, expansion of crew quarters, and opening a tenant-run cantina.

## Fixed or improved in the parent worktree

- Pod visitor meals now advance the global `Serve visitors` goal. Before the fix, 30 pods could visit and the goal remained `0/20`. The current metric also counts resident meals and still needs the correction in ticket 13.
- Travel-supply stock, pricing, ordering, and capital projects are reachable from the visible Site Brief. Their previous launch controls lived only in a permanently hidden legacy panel.
- A selected charter site now pins its supply, retail, repair, and solar modifiers beside the confirmation button.
- Pod activity uses a compact, collapsed `Live Pod Ops` header. Berth language and the full turnaround panel are reserved for berth traffic.
- `Last Turnaround` is hidden until the station actually contains a berth.

## Handoff order

1. `00-new-game-unlock-state-leaks.md` - P0 save/progression isolation defect.
2. `01-crew-needs-fixture-collapse.md` - probable simulation defect; diagnose next.
3. `02-alerts-must-open-diagnosis.md` - contained UI behavior.
4. `03-opening-needs-player-authored-decision.md` - vertical-slice design and implementation.
5. `04-unify-goals-and-tiers.md` - progression design cleanup.
6. `05-pod-service-feedback.md` - world feedback and diagnosis.
7. `06-hud-context-and-world-space.md` - UI layout pass after the above behavior settles.
8. `07-turnaround-service-integrity.md` - P0 false service-credit defect.
9. `08-berth-onboarding-and-capital-gate.md` - first-berth construction, compatibility, and dispatch flow.
10. `09-economy-accounting-and-payout-balance.md` - project and turnaround rewards currently erase operational stakes.
11. `10-meal-stock-and-purchase-legibility.md` - contradictory meal counts and silent purchase failures.
12. `11-room-capacity-and-placement-diagnosis.md` - room inspectors and placement ghosts disagree with actual capacity.
13. `12-commercial-transition-onboarding.md` - preserve and expose the strongest observed midgame decision.
14. `13-visitor-goal-needs-a-visitor-specific-metric.md` - prevent resident meals from advancing visitor progression.

## Playtest baseline

- Start: 8 crew, 260 credits, 30 prepared meals, 16/32 travel supplies, 40/160 fuel, rating 0.
- The first pods arrive quickly without player admission.
- After about three simulated days at 4x: roughly 300 lifetime traffic credits, meals near 13, all eight crew reporting toilet/wash pressure.
- By roughly day eight: over 500 lifetime traffic credits, Tier 2 unlocked, meals depleted, crew mood near 70, all eight crew hungry and needing hygiene.
- The player can reach the first credit threshold without building, staffing, pricing, ordering, or accepting a project.
- A 4x3 medium berth, two additional hires, two extra beds, and a tenant-run cantina carried the run to Tier 3 and 2,095 credits.
- A very poor 24-passenger turnaround still paid 343 credits despite serving only 2 meals, returning 22 passengers, and missing most drink, lounge, hygiene, and premium demand.
- Turnaround reports credited drinks and lounge visits before the station contained either a cantina or lounge.

Do not solve these tickets by adding another persistent spreadsheet panel. Prefer world feedback, contextual inspectors, and short decision-focused menus.
