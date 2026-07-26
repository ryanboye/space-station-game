# Give Visitor Progression a Visitor-Specific Service Metric

**Priority:** P1 progression integrity

## Observed defect

The opening `Serve visitors` goal originally stayed at zero during pod traffic. The current parent-worktree fix returns `state.metrics.mealsServedTotal`, which advances for visitor meals but also advances when residents or crew eat. Once habitation exists, non-visitor meals can therefore complete visitor progression.

## Required behavior

- Track completed visitor service independently from crew and resident consumption.
- Decide whether the goal means unique visitors served, visitor meals completed, or any completed visitor transaction, then name it accordingly.
- Pod and berth visitors must use the same visitor-specific source of truth.
- Reloading a save must preserve the metric without reconstructing it from current entities.

## Acceptance criteria

- Serving a pod visitor advances the opening goal exactly once according to the chosen definition.
- Serving a berth passenger advances it through the same metric.
- Crew and resident meals never advance the visitor goal.
- One visitor using multiple services does not accidentally count multiple times if the goal is defined as unique visitors.
- A regression test covers pod, berth, crew, and resident consumption.

## Likely code area

Replace the broad `mealsServedTotal` dependency in `lifetimeVisitorsServed()` in `src/main.ts` with a persisted visitor-specific metric owned by simulation state in `src/types.ts` and incremented from the successful visitor service path in `src/sim/sim.ts`.
