# New Game Autosave Restores Unlocks From an Older Run

**Priority:** P0 progression/save defect

## Player impact

A fresh station can inherit an advanced tier from a previous playthrough. This breaks capability gating, invalidates opening balance tests, and makes Continue unreliable as a representation of the station that was just played.

## Observed sequence

1. An older playtest reached Tier 2 and more than 500 lifetime traffic credits.
2. Return to the title screen and choose New Game.
3. Charter the recommended site and play a short fresh run.
4. Before reload, the new run showed Tier 1, `59/500` traffic credits, and `4/20` visitors served.
5. Allow the fresh run to autosave, reload the app, and choose Continue.
6. The loaded station showed fresh-run values (`62/500`, `4/20`, 307 current credits) but `Tier 2: Production Logistics`.

The state therefore appears to combine the new station's metrics with stale unlock history.

## Investigation questions

- Does New Game replace every field of the singleton state, or mutate only selected fields?
- Is `unlocks.unlockedIds` or `unlockedAtSec` omitted from fresh-state replacement?
- Can an autosave callback from the previous run fire after New Game and merge stale progression into the new save?
- Does save hydration trust persisted unlock IDs even when their trigger metrics are lower than the unlock requirement?
- Does HMR/title-screen re-entry expose a race that normal reload can also hit?

## Acceptance criteria

- New Game creates an isolated state with only Tier 0/default unlocks, regardless of the previous autosave.
- Its first autosave fully replaces the previous run's save envelope atomically.
- Continue restores internally consistent metrics, tiers, projects, rating, and station state from one run.
- A focused regression covers: advanced save -> New Game -> autosave -> reload -> Continue.
- If a loaded legacy save contains impossible unlock/metric combinations, migration either preserves it deliberately with a warning/version rule or reconciles it deterministically. Do not silently mix states.

## Likely ownership

- title/new-game orchestration near the charter flow in `src/main.ts`
- save serialization and hydration in `src/sim/save.ts`
- initial unlock state in `src/sim/initial-state.ts`
- autosave scheduling in `src/main.ts`
