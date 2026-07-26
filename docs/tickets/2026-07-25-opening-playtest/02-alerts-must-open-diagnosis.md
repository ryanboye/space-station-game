# Need Alerts Must Lead to a Diagnosis and Action

**Priority:** P1 contained UI behavior

## Current behavior

Clicking `Crew needs building: 8 strained` did not explain the shortage or open a relevant build/diagnostic view. During the live run, Selection changed to `Selected room is no longer available`, which is both unrelated and confusing.

The meal alert is clearer in copy, but it similarly relies on the player noticing the small `+` in the top bar or already knowing how to staff production.

## Desired behavior

Alerts should be actionable diagnosis shortcuts, not passive log entries.

- Crew hygiene alert: open a compact needs diagnosis showing affected count, available/occupied/broken fixtures, plumbing state, and the two relevant actions: inspect hygiene rooms or open Hygiene in the Rooms palette.
- Crew sleep alert: show beds available, assigned, reachable, and occupied; offer Quarters.
- Meal alert: focus Prepared Meals and show `buy now` versus `produce locally` with the current cook/watch status.
- Never mutate Selection to a stale room reference.

## Acceptance criteria

- Every clickable alert has one deterministic destination and an accurate title/aria label.
- The destination answers `what is wrong`, `why`, and `what can I change` without requiring an overlay to remain enabled.
- Clicking a needs alert cannot produce `Selected room is no longer available` unless the player explicitly selected a deleted room.
- Add focused UI coverage for hygiene, sleep, and meal alerts.

## Likely ownership

- alert rendering and handlers in `src/main.ts`
- actor/room diagnosis helpers in `src/sim/actor-inspectors.ts`
- existing room/build palette navigation in `src/main.ts`
