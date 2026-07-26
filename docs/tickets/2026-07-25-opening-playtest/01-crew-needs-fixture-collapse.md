# Crew Needs Collapse Despite Starter Hygiene Fixtures

**Priority:** P1 bug investigation

## Player impact

The starter station appears to contain usable hygiene fixtures, but all eight crew converge on toilet and washing needs within a few simulated days. At the same time, the Operations panel reports several crew `waiting for fixtures`. This makes the opening look incorrectly configured and can create a failure spiral before the player understands rooms, plumbing, or watches.

## Reproduction

1. Start a new game at the recommended site.
2. Do not build or change the roster.
3. Run at 4x for roughly 45-60 real seconds.
4. Observe Operations and the crew-needs alert.

Observed during the playtest:

- `8 need toilets`
- `8 need washing`
- `6 waiting for fixtures`
- The visible starter hygiene room contains multiple fixtures.
- Crew are often otherwise idle.

## Investigation questions

- Are the starter fixtures connected to the required water network in the saved starter layout?
- Are fixture reservations being released after use, retarget, watch change, or path failure?
- Can off-duty/on-duty transitions strand a reservation owner?
- Does fixture reachability fail because of room policy, doors, or the generated starter utility underlay?
- Is need decay calibrated against the watch duration and fixture service duration?

## Acceptance criteria

- In a no-input 4x run, a correctly connected starter hygiene room visibly serves crew.
- Fixture reservations remain exclusive but are released on completion, cancellation, path failure, and actor state changes.
- Crew do not all enter fixture-wait state while usable, reachable fixtures are idle.
- If the starter room is intentionally insufficient, the first shortage is gradual and the UI identifies the exact bottleneck: capacity, plumbing, reachability, or policy.
- Add a focused regression scenario for eight crew and the stock starter hygiene room. Do not run the full test suite for this ticket.

## Likely ownership

- `src/sim/sim.ts` actor needs, fixture reservation, and movement logic
- starter layout/utility initialization in `src/sim/initial-state.ts`
- fixture diagnostics in `src/sim/actor-inspectors.ts`
