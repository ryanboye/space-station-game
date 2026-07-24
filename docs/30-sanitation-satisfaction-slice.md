# Sanitation Satisfaction Slice

Status: implementation plan, ready to execute. Written 2026-07-23 from live code diagnosis against the current dev line.

Authority: subordinate to `docs/23-operational-promise-core-loop.md`. This is the first concrete slice of `docs/28` **Stage 1 (See The Station)** — chosen because sanitation is the clearest case of a deep system the player cannot see.

## The Diagnosis (verified in code, not assumed)

The player-reported symptom is "grime isn't rendered at all, and hiring cleaners isn't satisfying." **The renderer is not at fault.** Verified:

- 6 grime frames **are packed** in the atlas (`overlay.floor.grime.1-6`), plus 4 floor-wear and 2 hull-wear.
- `pickFloorOverlayKey` (`src/render/render.ts:1830`) already draws grime from `dirtByTile` at a **lowered threshold of 12** (a previous tuning pass).
- `floorOverlayAlpha` (`render.ts:1854`) **already ramps** opacity `0.22 → 0.84` across dirt 12→82. Severity is expressible.
- The decorative-layer cache key already includes `sanitationRenderSignature` (`render.ts:1860`), bucketing dirt by 5 so changes repaint.

The failure is in the **simulation's dirt dynamics**. Four compounding causes, in order of severity:

### Cause 1 — Cleaning cannot make a tile look clean (the satisfaction bug)

`SANITATION_JOB_TARGET = 18` (`sim.ts:542`) but the grime decal threshold is **12**. A cleaned tile stops at 18, which is still above 12, so **it still renders grime after cleaning**. The alpha only drops from ~0.43 to ~0.27. The player watches a cleaner walk across the station, and the floor looks essentially the same afterward.

This alone explains "hiring cleaners isn't satisfying."

### Cause 2 — Cleaning is instantaneous

`SANITATION_JOB_RATE_PER_SEC = 32` against a spawn threshold of 36 and a target of 18 means the actual work is **0.56 seconds**. There is no watchable labor: the cleaner travels for many seconds, then the tile snaps. No progress, no duration, no theater.

### Cause 3 — Passive decay beats foot traffic, so corridors never dirty

`updateSanitation` (`sim.ts:13672-13677`) applies passive decay of **0.006/sec** to every tile below dirt 18. Meanwhile a walking visitor adds **0.052/sec only while standing on that exact tile**. A tile traversal takes roughly 0.5-1s, so one pass deposits ~0.026-0.052.

Net effect: a corridor tile needs a visitor crossing it **every 5-9 seconds, forever, just to break even against decay**. In a two-berth station with bursty turnarounds, corridor tiles hover near zero permanently. They never reach 12 and never render.

Only continuously-occupied tiles can climb: queue slots (0.105/s), eating seats (0.352/s with a normal-trait diner), kitchen tiles (0.24/s). That is a handful of tiles — never a dirty *room*.

### Cause 4 — Dirt has no spatial spread

`addDirt` targets a single tile index. Prison Architect grime reads as *areas* becoming filthy; here it is isolated pixels under chairs. Even where dirt does climb, it cannot form a patch a player notices at a glance.

**Summary: the art, the ramp, and the cleaning loop all exist. Dirt accumulates on ~5 tiles, never spreads, and cleaning leaves it visibly dirty.**

## The Slice

Three PRs. PR 1 is the fix; PRs 2-3 are the payoff.

### PR 1 — Dirt dynamics (sim only, no render changes)

All edits in `src/sim/sim.ts` around `updateSanitation` (`:13634`) and the constants block (`:539-547`).

1. **Cleaning clears.** `SANITATION_JOB_TARGET: 18 → 2`. Below the decal threshold, so a cleaned tile visibly becomes clean. This is the single highest-impact line in the slice.
2. **Cleaning takes time.** `SANITATION_JOB_RATE_PER_SEC: 32 → 7`. A filthy tile (68) now takes ~9s of standing work instead of 0.5s. Tune so a full patch is a satisfying multi-second job, not a snap.
3. **Kill the corridor-decay stalemate.** Reduce passive decay from `0.006` to `~0.0015` below 18 (or remove it below 12 entirely and keep a token decay only for near-zero specks). Intent: dirt should be removed by *cleaners*, not by physics. Keep a small decay so abandoned areas eventually settle.
4. **Traffic dirties a footprint, not a pixel.** In `addActorTraffic`, deposit the full rate on the actor's tile and a fraction (~0.35) on orthogonal neighbours, so walking lanes develop visible tracks. Cheap: 4 extra `addDirt` calls per actor per tick, and `addDirt` is already trivial. Watch the 50-crew fixture for cost; gate behind the existing cadence if needed.
5. **Retune accrual against the new decay.** Target behavior: one busy passenger turnaround leaves a *visibly* grimy cafeteria and approach corridor within 2-4 minutes of play, recoverable by one or two cleaners in a comparable span.

Focused tests (new `tools/sanitation-tests.ts` or appended to an existing runner):
- A cleaned tile ends below the render threshold (12), not at 18.
- A simulated corridor with periodic traffic accumulates past 12 within N seconds (guards against decay regression).
- A filthy tile requires > 5 seconds of cleaning work.
- Passive decay still drains an untouched speck to zero eventually.

### PR 2 — Cleaning theater (render + light sim)

Make the labor watchable now that it has duration.

1. **Progressive clearing within a patch.** `SANITATION_JOB_PATCH_RADIUS = 2` already groups tiles; have the cleaner clear them one at a time so the clean area visibly grows around them.
2. **Completion feedback.** A brief wipe/sparkle on each cleared tile (the sanitation job badge with broom+sparkle already exists in the dynamic pass — extend it rather than inventing a new effect).
3. **Room-level readout.** Surface sanitation severity in the room summary ("Cafeteria — filthy, 1 cleaner assigned"), reusing the existing `SanitationTileDiagnostic` severity tiers.
4. **Free win — `driftSeverity`.** `DriftSeverity` is a 5-value taxonomy with a dedicated classifier (`driftSeverityFromDirt`, `sim.ts:2620`) feeding a struct field nothing reads. One tooltip line surfaces the whole authored severity language.

### PR 3 — Module condition decals

The other half of "the station looks worn." `moduleConditionRenderSignature` exists (`render.ts:1899`) and is already in the decorative cache key (`:3644`) — **verify first whether the decal draw actually landed**; if the signature is wired but nothing draws, this is a small hook in `drawModuleVisual` plus `overlay.module.wear.*` art following the floor-grime precedent. If it did land, verify it's visible in play and tune like the floor case.

## Validation (per doc 28's two-fixture rule)

- **Two-Berth Shift (design gate):** run one full passenger turnaround without opening any panel. The cafeteria and its approach must visibly dirty during the rush, and a cleaner must visibly restore them. Record in the `docs/24` playtest-log format.
- **Fifty-Crew Station (scale gate):** confirm the neighbour-spread `addDirt` and per-tile decay loop hold frame time, and that grime at scale reads as texture rather than noise.

Do not mark either gate complete from test output alone.

## Explicit Non-Goals

- No new sanitation mechanics (no bins, no laundry, no disease).
- No new needs.
- No changes to the cleaning job assignment or scoring logic beyond rate/target constants.
- No new overlay modes — the world must read without one.

## Notes For The Implementer

- Numbers above are starting hypotheses, not targets. Tune from what the world looks like in the browser, per `docs/24`'s balancing rule.
- `npm run test:port-ops` currently has **5 pre-existing failures** on this line (first: "Starter Service target assigned 2 crew instead of 1"). Confirm you add none; do not fix them in this slice.
- Dirt lives in `state.dirtByTile: Float32Array` with `dirtSourceByTile: Uint8Array` attribution — source codes are already authored (traffic/meals/market/kitchen/hydroponics/fire/body/hygiene) and could later drive source-specific decals. Out of scope here.
