# Space Station — the deeper "why nothing works", and the literal fix (Opus/BMO, direct pass)

awfml's exact frustration: "a lot of systems were implemented to TRY to make the early station responsive —
air quality, oxygen, food queuing, station rating, walk time — none of them really work. Something is
deeper and wrong." This is that deeper thing, found by reading the deployed code (origin/main `171816b`),
plus the literal change for each and why it fixes the game.

---

## THE DEEPER BUG — everything routes into a dead meter

I traced where each "quality" system's output actually GOES. They all terminate in the same place:
**`state.metrics.stationRating`.** And I enumerated every consumer of `stationRating` in the sim:

- `sim.ts:5945/5952/6018` — **resident conversion** (needs rating > 50; residents are T4+ content).
- `sim.ts:13842` — **resident satisfaction** (also T4+ resident content).
- everything else (`:7500`, `:15067+`) is UI/telemetry — hints and dashboard readouts.

**So station rating has ZERO gameplay consequence in the early game.** Its only functional effect is
gating/curving residents, which the player doesn't touch for hours. Now the two things a player actually
FEELS, and what drives them:

- **Arrivals/traffic:** `nextTrafficArrivalDelay (sim.ts:7918)` reads **only `controls.shipsPerCycle`** — a
  slider. Rating does NOT affect how many customers show up.
- **Income:** meal payout `(3 + tax*8) * visitor.spendMultiplier` (`sim.ts:12266`); market spend
  `0.45 * spendMultiplier * tax * ...` (`:12259`). `spendMultiplier` is a **fixed per-archetype constant**
  (1.12/1.32/0.78/0.86, `:3440`). The only quality-linked term, `reputationSpendMultiplierAt (:3297)`, is
  driven by prestige/notoriety/crimePressure — all **~0 at starter scale** — so it sits at ~1.0.

**The result, stated plainly:** every management system you built (air, sanitation, walk distance, route
exposure, queue patience, reputation) pours its signal into `stationRating` — a bus that is disconnected
from both the customer count and the money until T4. So the simulation is genuinely running (fable measured
109 incidents, air crashing, rating sliding) but **none of it reaches the player's wallet or the customer
door.** That is why it all "doesn't work": the systems aren't broken, they're **wired to a dead bus.**

Concretely, each named system today:
| system | what it computes | where the signal goes | felt by player? |
|---|---|---|---|
| air quality / O2 | fine → self-heals; critical → slow suffocation death (`:4973`) | binary emergency only; no middle gradient | no (self-heals before death) |
| sanitation | dirty/filthy thresholds | `0.0014/sec` → **rating** (`:241`) + cosmetic text | no |
| walk time / route exposure | scored per path (`:4213`) | `0.012` → **rating** (`:205`) | no |
| food queue / patience | patience bail | `0.012–0.05` → **rating** (`:12444`) | no (invisible, no lost sale) |
| station rating | aggregate of all the above | → resident conversion (T4+) | no, until very late |

---

## THE FIX — reroute quality to the two things the player feels: MONEY and MORE CUSTOMERS

One keystone change plus four per-system reroutes. None of these add content; they connect existing signals
to the player's wallet/door. Ordered by leverage.

### FIX 0 (keystone) — make RATING drive TRAFFIC. *This is the single highest-leverage line in the game.*
- **Literal:** in `nextTrafficArrivalDelay (sim.ts:7918)`, multiply the delay by a rating factor. e.g.
  `averageDelay *= clamp(1.7 - state.metrics.stationRating / 60, 0.55, 2.2)` — rating 70 ≈ baseline, rating
  90 ≈ ~40% faster arrivals, rating 40 ≈ ~2x slower. Keep the slider as a *cap/policy*, not the sole driver.
- **Why it fixes the game:** this one line turns the dead rating bus LIVE. The moment rating feeds arrivals,
  every quality system that feeds rating (air, sanitation, walk, queue) now feeds **income indirectly** —
  run the station well → rating up → more customers → more money; run it badly → fewer customers. The
  existing simulation stops being inert because its aggregate finally has a consequence you feel.

### FIX 1 — WALK TIME → SPEND (not rating). Layout should move money.
- **Literal:** fold `routeExposureDiscomfort(visitor.lastRouteExposure) (:4393)` and walk length into
  `visitor.spendMultiplier` at serve/spend time — e.g. a visitor who walked far / through crowds / past
  crime spends 15–40% less. Add a term to `reputationSpendMultiplierAt` or apply directly in
  `mealExitPayout`/`marketSpendPerSec`. **Remove** the tiny `0.012` rating-only penalty.
- **Why:** the game already tracks walk distance and prints "logistics crosses public areas" — but it costs
  nothing felt. Route it to money and **placement becomes a real optimization** (short paths, keep the
  kitchen near the dock, separate visitor flow from logistics) with a number you watch move.

### FIX 2 — AIR QUALITY → a continuous SPEND/SERVE penalty, not a binary death timer.
- **Literal:** below ~60 air, apply a smooth penalty to spend and serve-speed in that tile's rooms (e.g.
  `airFactor = clamp(air/60, 0.4, 1)` folded into spendMultiplier and into `visitorEatBaseSec`). Keep the
  death path only for true 0-air emergencies.
- **Why:** today air is fine-or-death and self-heals (`:4973`), so it never asks a question. As a continuous
  dial, **life-support capacity becomes an ongoing decision** — a bigger/busier station needs more LS or it
  quietly bleeds revenue, which the player can see and fix. That's a management lever, not a fire alarm.

### FIX 3 — FOOD QUEUE / PATIENCE → a LOST SALE + a NAMED visible event.
- **Literal:** on `patienceBail (:12444)`, in addition to (or instead of) the rating tick, subtract the
  meal/market sale the visitor *would* have made and push a named event: `"Trader Yusa left — waited 40s
  for food (−N credits)"`. And **render the queue** (the sim already tracks `cafeteriaQueueingCount`,
  reservations, patience — draw the sprite line).
- **Why:** RC2. A bailed customer is currently an invisible 0.012 rating tick. Make it a **visible person
  leaving with your money**, and the queue becomes the game's primary "fix me" signal (this is literally the
  Two Point Hospital loop). Cause → effect the player can see and act on.

### FIX 4 — right-size throughput so capacity BINDS — *now that quality pays, this has a point.*
- **Literal:** `PROCESS_RATES (balance.ts:446)` stove 0.95 → ~0.10 meals/s, hydro 1.25 → ~0.14; cut
  `BASE_POWER_SUPPLY`/reactor so the grid asks a question every ~2–3 rooms; let tables bind at ~5–6
  concurrent. Target: second stove needed ~cycle 5–8.
- **Why:** RC1. Today one stove out-produces demand ~20x, so a second is never a decision. Once demand can
  exceed comfortable capacity AND falling behind costs money (Fix 3) and customers (Fix 0), the
  add-a-stove / add-a-table / add-a-berth choices become the minute-to-minute puzzle — even at 3 rooms.

### Supporting (cheap): profit/min HUD line (`income/min − upkeep/min`), raise payroll ~5x so overbuilding
hurts, and stop pausing the sim for unlock modals (toast instead).

---

## WHY THIS IS THE RIGHT DIAGNOSIS (and why fable's list felt un-actionable)

fable's pass named the right INTERVENTIONS (tune throughput, close reputation→demand, visible failures) but
described them as separate knobs. The unifying reason they're all needed is this single structural fact:
**the quality simulation and the economy are two disconnected circuits, bridged only by a rating meter that
does nothing early.** Fix 0 connects the circuits; Fixes 1–3 add direct wires so the connection is felt
immediately, not just through the aggregate; Fix 4 gives the now-live economy a capacity puzzle to solve.

After these, the first 10 minutes at 4 rooms: you place the kitchen near the dock (Fix 1 pays you for it),
watch air dip as traffic rises and add a scrubber before it costs you (Fix 2), see a queue form and a trader
walk off with your credits so you add a stove you can barely afford (Fix 3+4), and your rating ticks up so
more ships arrive (Fix 0) — which strains the next thing. That is the micro-optimization loop, built entirely
out of systems that already exist and currently do nothing.

*(Nothing in the repo was modified. Analysis via detached worktree on origin/main 171816b.)*
