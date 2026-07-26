# Make Turnaround Reports Reflect Services That Actually Happened

**Priority:** P0 simulation integrity

## Observed failure

The first medium-ship turnaround reported `10/12` cantina drinks and `8/12` lounge visits when the station contained neither a Cantina nor a Lounge. A later turnaround again reported lounge completion without any Lounge room. Opening a tenant-run cantina did improve later drink results, but the report still mixed real and synthetic completion.

After the third turnaround, a real Lounge was built as a separate enclosed extension with two couches. Its world label immediately reported `1/4 in use · 1 waiting`, demonstrating that physical occupancy already provides a trustworthy source of service evidence. The earlier report had credited six lounge visits before this room existed.

This breaks the player's causal model. The report currently says the station provided services the player did not build, so neither success nor failure can teach the player what to change.

## Required behavior

- A service promise completes only after an entity successfully reserves, reaches, and uses an eligible physical fixture or tenant service.
- No eligible room or fixture means zero completed service, with a clear `missing service` reason.
- Queued, timed-out, abandoned, and fallback behaviors must not increment completion.
- Tenant-provided service must use the same completion source of truth as player-operated service.
- Manifest warnings, world feedback, settlement results, rating change, and payout must agree.

## Acceptance criteria

- A berth-only station produces exactly zero drink and lounge completions.
- Adding a cantina changes drink completion but not lounge completion.
- Adding a lounge changes lounge completion, and its capacity/occupancy limits the result.
- Every reported completion can be traced in diagnostics to a service fixture or tenant transaction.
- A regression test covers missing, blocked, full, and successful service cases.

## Likely code area

Trace the promise-completion paths and fallback timers in `src/sim/sim.ts`, then audit the settlement aggregation used by `src/main.ts`. Do not patch this by hiding rows in the report.
