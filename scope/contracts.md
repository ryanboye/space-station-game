# Scope: Contracts

**Status:** drafting
**Owner:** awfml
**Depends on:** `system-map.md` (factions are contract sources)
**Blocks:** Long-haul / capstone contracts (future scope)

## TL;DR

Add a **contract board** that surfaces randomly-drawn, time-limited commitments to the player. Each contract is **issued by a faction** (which lives on the System Map) with a goal, an accept-by deadline, a complete-by deadline, an upfront/completion reward, and a breach penalty. Goals are **procedurally instantiated from hand-authored shapes** so the content never runs out. The point is to **pull the player in directions they didn't pick** — the station's identity emerges from which contracts they took.

## The frame — what the player experiences

A new "Contracts" panel (or modal) in the UI. At any time it shows:

- **Up to 3 offered contracts** — cards the player can accept or ignore.
- **Up to 2 active contracts** — ones the player has accepted, with progress bars.
- **Recent history** — last few completed/breached, surfaced briefly.

Each card shows:

- The issuer (a faction sigil from the system map — e.g., Trader Guild)
- The goal in plain language ("Service 8 industrial-ship visitors")
- The window ("Within 4 cycles")
- The reward ("+1500 credits, +5 station rating")
- The penalty for breach ("-2500 credits, -8 station rating")
- The accept-by deadline ("Expires in 2 cycles")

When the player accepts:
- Upfront cash (a fraction of the total reward) is deposited.
- The contract moves to "active."
- A progress line appears in the quest bar.
- A snapshot of relevant `usageTotals` fields is taken so progress is measured as a delta from acceptance.

When the player completes:
- Completion cash + rating bonus.
- The card moves to history.
- Faction relationship ticks up (later scope — for now, just record the success).

When a contract expires un-accepted: silently removed, no penalty. Ignoring is free.

When a contract is **breached** (accepted but not completed in time): credits deducted, rating penalty applied, faction relationship damaged (later scope — for now, recorded). Optionally a small "degrade" grace period before full breach (see Open Question §4).

## In scope

- A new `state.endgame.contracts` block on `StationState` — offered, active, completed, breached arrays + roll seed + cycle scheduler.
- A small set of **procedural goal shapes** (≈6 shapes for v1, expandable).
- A roll mechanism that:
  - Fires every N cycles (initial proposal: every 6 cycles).
  - Picks a shape weighted by the player's current state (don't offer "build 3 Workshops" if they have 0).
  - Picks an issuer faction from the system map.
  - Parameterizes the goal from current state (target counts scaled by current population, current credits, etc.).
- Filtering by current tier: contracts can't ask for tier-locked content.
- A new UI surface — initially reuses the alert-panel layout (`main.ts:1825`) for v0; full modal at v1.
- A `addContractBreachPenalty` rating-penalty hook alongside existing `addVisitorFailurePenalty` (`sim.ts:404`).
- Save schema bump (v3) to persist the contract state.

## Out of scope (this doc)

- **Long-haul / multi-condition campaign contracts** — covered as a future scope ("Long-Haul Charters"). v1 contracts are single-condition, ≤6-cycle windows.
- **Faction favor system** — for now we record successes/breaches but don't have a feedback loop where high favor unlocks special contracts. That's a downstream scope.
- **Player-issued contracts / station-as-contract-source** — out of scope. Player is the receiver.
- **Dynamic difficulty scaling** — for v1, contract difficulty is a function of current state at roll time, not a learned curve.
- **Auction / bidding mechanics** — single-fire offers, take or leave.
- **Contract chains / questlines** — sequential prerequisite contracts. Future scope.

## Touches in the existing game

| What | Where | How it changes |
|---|---|---|
| Lifetime counters | `state.usageTotals.*`, `docs/09-progression.md:11`–17, `src/sim/content/unlocks.ts:36`+ | Contract progress reads diffs of these counters, exactly like `updateUnlockProgress` (`sim.ts:360`). New consumer, same data source. |
| Rating accumulator | `usageTotals.ratingDelta`, `addVisitorFailurePenalty` (`sim.ts:404`), `docs/10-economy-rating.md` | New `addContractBreachPenalty` sibling. Per-reason breakdown surfaces in `metrics.stationRatingPenaltyPerMin` for free. |
| Quest bar | `src/render/progression/quest-bar.ts:122` | Secondary line showing top active contract progress. |
| Cycle scheduler | `CYCLE_DURATION = 15` (`sim.ts:81`), `scheduleCycleArrivals` (`sim.ts:3548`) | New sibling roller `rollContractOffers` runs alongside on cycle boundary. |
| Tick pipeline | `tick()` order in `docs/01-simulation.md:13`–28 | New step `updateContractProgress(state)` after `updateUnlockProgress`, before `maybeTriggerFailure`. |
| Save schema | `src/sim/save.ts`, `docs/12-ui.md` save section | v2 → v3 migration adds empty `contracts` block. |
| Hotkeys | `main.ts:3150`–3354 | Suggested: `K` opens contracts modal (currently bound to Market room — rebind that). Or pick a free key. |
| System map (sister scope) | `scope/system-map.md` | Contract issuer = faction record from the system map. Without system-map, issuers are placeholder strings (still valid for v0 of contracts). |

## Integration points

- **Depends on `system-map.md`** for proper faction sourcing. **Can ship without it** — v0 hardcodes "Trader Guild" / "Industrial Combine" / etc. as string constants. When system-map ships, the constant lookup becomes a `state.system.factions[id]` lookup. Zero rework on the contract side.
- **Future faction-favor scope** consumes the breach/complete event stream emitted from this scope.
- **Future long-haul / capstone scope** extends the `ContractOffer` shape to allow `goal: { conditions: [...], mode: 'all' | 'any' }` plus a `degrades` state. v1 keeps it single-condition.

## Open questions / decisions needed

### 1. How many goal shapes for v1?

**Options:**
- (a) 3 shapes (very minimal): "serve N visitors of archetype X", "deliver N tradeGoods to a Trader-Guild ship", "go N cycles without an incident".
- (b) 6 shapes: above + "maintain N residents for M cycles", "complete N contracts of type X" (meta), "have N modules of type X active".
- (c) 12+ shapes: full v2 catalog.

**Recommendation:** (b) for v1 ship. (a) for the very first MVP cut to validate the "external nudge feels good" hypothesis in 2-3 days.

### 2. Procedural instantiation — exact parameter sources?

For each shape, what state field parameterizes the target threshold?

**Example — "serve N visitors of archetype X":**
- N is rolled in `[max(2, current_archetype_rate * 0.5 * window), current_archetype_rate * 1.2 * window]` so it's *plausible* but stretches the player.
- X is weighted by issuer faction (Trader Guild biases toward "trader" archetype).

**Question:** which signals do we read? Some candidates:
- `state.metrics.visitorThroughputPerMin` (last-minute rate)
- `state.usageTotals.archetypesServedPerArchetype[archetype]` (rate over last K cycles, sliding-window)
- `state.residents.length` (population scale)
- `state.metrics.creditsNetPerMin` (economic scale)

**Decision needed:** which signal feeds which shape. This is mostly a tuning question but the *list* of valid signals should be locked at scope.

### 3. Reward / penalty asymmetry

**Option A:** Reward and penalty are symmetric (reward = +1500 credits + 5 rating; penalty = -1500 credits + 5 rating). Simple, fair-feeling.

**Option B:** Penalty is *larger* than reward (penalty = +1500/+5; breach = -2500/-8). Loss-aversion drives commitment — accepting feels weighty.

**Option C:** Penalty is *smaller* than reward (reward = +1500/+5; breach = -800/-3). Low-stakes feel — accepting feels free.

**Recommendation:** **Option B for v1.** Loss-aversion is the actual mechanic that makes contracts *matter*. Without an asymmetric downside, ignoring is dominant — you get "Project Highrise nag boxes" instead of meaningful commitments.

### 4. Should breached contracts have a "degrade" intermediate state?

In v2 it was suggested: at -50% complete and clock running out, the contract `degrades` instead of immediately breaching, with a partial penalty.

**Options:**
- (a) Binary — either you complete by deadline or you breach 100%.
- (b) Degraded state — late by ≤50% incurs partial penalty instead of full.
- (c) Insurance / extension — for a fee, extend deadline by N cycles; can use once per contract.

**Recommendation:** (a) for v1, (c) at v1.5. (b) muddles the legibility of "I succeeded" vs "I lost".

### 5. Roll cadence — how often does a new offer drop?

Initial proposal: every **6 cycles** (90 sim seconds at 1×).

**Options:**
- (a) Fixed cadence (every 6 cycles).
- (b) Variable, weighted toward "when the player has slots open" (e.g., never roll when 3 offers already in board; roll twice as often when board is empty).
- (c) Tied to station scale — bigger stations get more frequent offers.

**Recommendation:** (b) for v1. Simple to implement, prevents the board feeling stale. Adopt (c) later if scaling feels off.

### 6. Where does the UI live?

**Options:**
- (a) Right-sidebar pane (alongside alert panel).
- (b) New top-bar button + dedicated modal.
- (c) Extension of existing progression modal (`refreshProgressionModal` `main.ts:1995`).

**Recommendation:** (b). Contracts deserve their own surface — they're as important as the build palette. Hotkey `K` (rebind Market off it; Market is already rebindable). Alert panel hint badges if there's an active near-deadline contract.

### 7. What happens during pause?

Today, pause skips `updateResources` and agent updates but still calls `computeMetrics` (`docs/01-simulation.md:11`). Cycle counter still advances on tick? **Need to confirm.** If yes, paused players can still see their contract clocks tick down, which is bad UX.

**Recommendation:** Pause **freezes contract clocks too.** Pause is a legitimate "I'm thinking" mode; punishing thinking is bad design. Skip `updateContractProgress` during pause (or at minimum freeze `contract.window` countdowns).

## Player-facing examples

### Example A: First contract offer

> Player has just hit T2. A new card appears in the contracts panel:
>
> > **Trader Guild request**
> > Service 4 trader-archetype visitors within 3 cycles.
> > Reward: +800 credits (200 upfront, 600 on completion), +3 rating.
> > Penalty: -1300 credits, -5 rating.
> > Expires in 2 cycles.
>
> The player has been getting trader visits anyway — accepting feels easy. They click accept, get +200 credits. The next 3 cycles they pay extra attention to the east lane, ensure their cafeteria is staffed for the trader rush. Two cycles later, contract complete, +600 credits, +3 rating. Quest bar congratulates them.

### Example B: A contract that asks for a stretch

> Late game, a new offer:
>
> > **Industrial Combine commission**
> > Maintain ≥3 active Workshops simultaneously for 5 cycles.
> > Reward: +3500 credits, +6 rating, +50 Industrial Combine favor.
> > Penalty: -5000 credits, -10 rating.
> > Expires in 1 cycle.
>
> The player has 2 Workshops. They'd need to build a third in the next cycle and keep it staffed for 5 cycles after — 6 cycle total commitment with -5000 credit downside. They look at their materials stockpile and decide it's worth it. They build the third Workshop, manage the crew priorities, and 5 cycles later they cash out at +3500. Their station is now visibly *more industrial* than it was — emergent identity.

### Example C: A contract they should walk away from

> Mid-game, an offer:
>
> > **Colonial Authority demand**
> > House ≥18 residents for 6 cycles.
> > Reward: +2200 credits, +4 rating.
> > Penalty: -3000 credits, -7 rating.
> > Expires in 1 cycle.
>
> The player has 11 residents. Adding 7 more in 1 cycle is improbable; maintaining 18 for 6 more cycles is doubtful given current dorm capacity. They let it expire un-accepted. **No penalty, no upfront cash, no harm done.** Walking away is a real choice.

## What this scope explicitly retires

- Nothing existing. Contracts are net-new.

## Future-scope hooks

- **Long-haul / capstone contracts** (10–30 cycle, multi-condition) — extends `ContractOffer` shape with `conditions[]` and `degrades` state.
- **Faction favor system** — consumes contract complete/breach events to track per-faction relationship; high favor unlocks special offers, low favor unlocks "make-up" offers or embargoes.
- **Contract chains** — completing offer A unlocks offer B (RimWorld questline pattern).
- **Player-issued contracts** — station can offer contracts to arriving ships (e.g., "deliver 100 ore"); inverse direction.
- **Dynamic difficulty** — track player success rate, adjust target ranges accordingly.

## Risks &amp; gotchas

- **Procedural rolls reading derived metrics that prune.** `incidentsResolved` in metrics is *scan-based* and prunes after `INCIDENT_RESOLVED_RETENTION_SEC` (`docs/99-trip-wires.md:69`). Contract progress *must* read from monotonic `usageTotals`, never from scan-based metrics. Same trip-wire that bites the T4 unlock predicate.
- **Tier-aware filtering at roll time.** A contract offering "build 3 Clinics" on a T2 station must be filtered out at `rollContractOffer`, not surfaced to the player to refuse. Use `isRoomUnlocked` / `isModuleUnlocked` (`sim.ts:348`+) at roll time.
- **Roll determinism.** The contract roll seed must be stored in `state` (`state.endgame.contractRollSeed`) so save-load reproduces the same contract sequence. Otherwise harness scenarios become flaky.
- **UI real estate.** The right sidebar is already busy (`docs/12-ui.md`). Adding contracts as another sidebar pane risks crowding. Modal is safer.
- **Pause behavior** — Open Q §7. Don't punish the player for thinking.

## Definition of "scope locked"

This scope is locked once:

- The 7 open questions are answered.
- The list of v1 goal shapes is locked (suggested 6 shapes, see Open Q §1).
- The reward/penalty asymmetry direction is settled (suggested Option B).
- The UI surface is settled (suggested standalone modal + sidebar badge).
- A v0 (the very first MVP cut) is identified — currently proposed: 3 shapes, 1 active slot, 2 offered slots, completion-only payment, no breach penalty yet. **2-3 days end to end.** This is the smallest thing we can ship to validate the "external nudge feels good" hypothesis.
