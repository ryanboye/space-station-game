# Gate D Handoff: Charter Operating Consequences

## Starting Point

Create a separate worktree and branch from the latest committed head of
`codex/structural-frontage-occupant-loop` containing this handoff. Return one
focused, cherry-pickable commit. Do not merge it into another branch.

## Player-Facing Goal

Choosing a station location must be an operating decision, not cosmetic
flavor. Before confirming a site, the player should be able to infer what kind
of station will prosper there, which exterior faces will be busy or hazardous,
what expansion pressure the site creates, and how those disadvantages can be
mitigated. The same forecast must remain recognizable after the station opens,
and it must predict real values already used by the simulation.

Two locations in the same seeded system should encourage different useful
service mixes and expansion choices without either becoming a trap.

## Design Contract

Build one shared, pure `CharterOperatingForecast` derived from `SiteCharter`.
The Charter screen and in-game Site Brief must render that same forecast; they
must not independently invent labels or recommendations.

The forecast should communicate:

- likely traffic volume and the busiest approach face;
- the most valuable opening service mix, using actual demand/economy effects;
- resource economics, including local ice/metal/gas implications;
- solar opportunity and thermal/cold operating pressure;
- debris exposure and the most sheltered expansion face;
- one or two concrete mitigations using systems that exist now, such as Truss,
  EVA repair capacity, redundant frontage, solar generation, cooling, or a
  lower-exposure expansion direction.

Recommendations must describe tradeoffs rather than declare one correct build.
For example: a busy lane can support more retail or food revenue but raises
frontage contention; an exposed resource-belt site can improve supply economics
while increasing repair burden.

Do not add another progression system, score, tier, or persistent panel. Keep
the Charter screen spatial and concise. Keep the in-game Site Brief compact and
contextual.

## Owned Files

Primary write scope:

- `src/sim/site-charter.ts`
- `src/sim/opening-economy.ts`
- `src/ui/charter-screen.ts`
- `src/ui/opening-economy-panels.ts`
- new focused test runner(s) under `tools/`
- `package.json` only if a focused test script is needed

`src/main.ts` may be touched only for the smallest view-model plumbing needed
to pass the shared forecast to the existing Site Brief. Do not redesign nearby
HUD code.

## Do Not Touch

- `src/sim/sim.ts`
- `src/sim/construction.ts`
- `tools/structural-expansion-tests.ts`
- `src/render/render.ts`
- `docs/39-structural-frontage-execution-checklist.md`
- unrelated UI, sprites, saves, performance code, or scenario fixtures

If real simulation behavior required by the forecast is missing and cannot be
implemented inside the owned pure helpers, document the gap rather than editing
`sim.ts`. The lead will integrate that behavior after the construction
checkpoint.

## Acceptance Criteria

1. One pure forecast function is deterministic for the same `SiteCharter`.
2. Charter selection and the in-game Site Brief use the same forecast fields
   and wording source.
3. A focused test compares at least two sites from the same seeded system and
   proves materially different traffic, service recommendation, exposure, and
   expansion/mitigation advice.
4. Every numerical or categorical recommendation is traceable to current
   `SiteCharter` or `deriveOpeningEconomyProfile` data; no decorative random
   advice.
5. Neither comparison site is presented as invalid or unwinnable.
6. The Charter screen remains readable at 1375x998 and a narrow viewport; the
   location panel must not sit beneath Back/Recommend controls.
7. Focused tests and `npm run build` pass. Do not run the full test suite.

## Return To Lead

Return a concise summary containing:

- commit hash;
- files changed;
- focused checks run;
- two example site forecasts and why they differ;
- screenshots or exact URLs used for visual verification;
- any forecasted consequence that still lacks a real simulation effect;
- merge risks or decisions the lead must review.
