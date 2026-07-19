# Space Station Game — Core-Loop Prescription (Fable pass 2)

Reviewer: Fable, following up on `SPACEGAME-COLONY-REVIEW.md` (the "beautiful legible skeleton,
one missing organ" review). This pass answers awfml's playtest critique directly:

> "No matter how small the station is, it should be fun and enjoyable to optimize and manage the
> things you started with. That's what we need to evaluate."

**Method — everything below is measured, not vibes.** I read the current `origin/main` source
(commit `171816b`, via a detached worktree), compiled the sim headless (`tsconfig.simtest.json`)
and ran instrumented experiments against it, and played the live build at
`bmo.ryanboye.com/spacegame/` through Playwright using the `__harness*` hooks. Probe scripts and
raw logs: scratchpad `rx-probe/` (`playtest-a4.mjs` = live do-nothing run, `lab.cjs` = the
early-game lab). Screenshots verified by eye.

---

## VERDICT IN ONE LINE

The owner is right, and it is quantifiable: **at starter scale, no constraint binds, no meter
responds, and no pressure compounds** — so there is nothing to optimize, and the only remaining
game is walking the unlock checklist. The fix is not more content; it is a numbers-and-surfacing
pass that makes the *existing* service loop scarce, visible, and escalating.

---

## WHAT I MEASURED (the receipts)

### Experiment 1 — live build, 30 sim-minutes, zero player input
Press play on the starter station and touch nothing:

| metric | t=0 | t=30min | meaning |
|---|---|---|---|
| credits earned (lifetime) | 0 | **0** | no income without build — fine |
| credits | 260 | 183 | only payroll drains (-2.6/min) |
| deaths / collapse | 0 | **0** | food hit 0 at min 2, water 0 at min 10 — **nobody starves, nothing fails** |
| morale | 100 | ~64 (floor) | plateaus; and morale's only sim effect is a crew-leisure gate (`sim.ts:11078`) |
| rating | 70 | 46 | bleeds ~-0.8/min from an aggregated invisible "service failure" driver |
| incidents counter | 0 | **109** | 109 "incidents" produced zero on-screen drama, zero demands on the player |

The starter station is **unloseable and unimprovable at the same time**. Nothing threatens; nothing
rewards. Also: every tier-up opens a modal that **pauses the sim** and waits for a click —
progression literally interrupts play rather than emerging from it.

### Experiment 2 — the owner's exact opening, compiled-sim lab, 30 sim-minutes
Built his recipe programmatically (cafeteria + kitchen + hydroponics + market + lounge + hygiene,
modules, 8 crew, starter dock, tier 1): all rooms activate, food chain runs, visitors served.

**a) "Waiting for credits" is structural.** Gross income ≈ **4 credits/min** with the full T1
build. Tier 2 needs 500 earned → **~2 hours of real-time waiting**. Build costs are trivial
(stove 6cr, table 12cr, floor tile 2, hire 14) — money is neither scarce enough to force choices
nor plentiful enough to feel earned. It's just a timer.

**b) "One of each is enough" is off by ~20x.** One stove produces 0.95 meals/sec
(`PROCESS_RATES`); measured demand at starter traffic is **0.04–0.08 meals/sec**. The hydro
grow-station filled the meal stockpile in ~2 minutes and then **production rates sat at 0.00 for
28 minutes**. Power: 36 supply vs 16 demand — a reactor covers ~15 more rooms. Maintenance decays
at ≤0.8/min while one crew repairs at 4.5/min. **No capacity anywhere ever binds**, so a second
stove/table/grow-station is never a decision.

**c) Layout does not matter.** Same rooms, +14 tiles of walk distance on every trip (scattered
variant): earned 115.6 → 112.8 (**-2.4%**), meals served 27 → 26. The room-environment traits
exist in code but their effect on spend is clamped to ±15% (`spendMultiplier` clamp 0.85–1.15,
`sim.ts:~12665`) and invisible in play. The adjacency warnings the game prints ("logistics
crosses public areas") have **no felt consequence** — exactly what the first review predicted.

**d) The tax dial is a free lunch, i.e. not a decision.** Tax 0 vs 0.35 over 20 min: earned 79 vs
102 (**+29%**), visit failures 0 vs 0, rating 13.5 vs 13.5 — identical. The counter-pressure
(patience/stress/satisfaction) never materializes at early scale. Max the slider, forget it.

**e) The score meter is broken by a silent structural leak — and has no consequence anyway.**
Rating fell 70 → **0 by minute 24** in every built variant, driver `queue timeout -99`. Cause
(`sim.ts:8128`): ships queue for the 2-tile starter dock, wait >18s (`dockQueueMaxSec`) while a
docked ship sits up to 28s (`shipMaxDockedSec`), time out, **-1.4 rating each, no event, no
alert**. With arrivals every ~8–28s this is arithmetic, not player error. And at rating 0…
nothing happens: arrivals are fixed by the traffic slider (`nextTrafficArrivalDelay` reads only
`controls.shipsPerCycle`); rating's only consumers are resident conversion (T4+ content). The
game's headline score is simultaneously *rigged to fail* and *consequence-free*.

**f) The economy acts without the player.** Material auto-import silently spent ~140 credits in
one variant (visible only as a credits dip). Air quality crashed to 2 in minute 4 and
self-recovered to 100 by minute 6 with zero input and zero casualties. Threats resolve
themselves; spending happens by itself.

---

## ROOT-CAUSE DIAGNOSIS (three causes, everything above is a symptom)

**RC1 — No binding constraint at small scale.** Demand is a constant (player-set slider, max
3/cycle, no growth); supply comes in steps 10–20x bigger than demand (stove, grow station,
reactor, repair rate). A management game is *made of* binding constraints; here none binds, so
there are no ratios to balance, no queues to shave, no trade-offs to weigh. This is the direct
negation of what makes ONI's early base work — scarcity plus ripple-effect from minute one, the
"stabilize, optimize, expand" loop ([Gideon's Gaming on ONI](https://gideonsgaming.com/the-genius-design-of-oxygen-not-included-a-review/)).

**RC2 — No responsive scoreboard for optimization.** Micro-optimization is only fun when a number
you care about visibly moves when you act. Here: layout moves revenue -2.4%; the tax trade-off
doesn't exist; morale gates nothing; incidents are a counter; and rating moves for reasons the
player cannot see (ship-queue timeouts, aggregated "service failure"). The first review praised
this game's *diagnostic* legibility (overlays, inspectors) — but its *outcome* legibility is
absent: there is no per-room load/queue/profit readout that answers "did my change help?"

**RC3 — Progression is a checklist, not pressure.** Tiers advance on one-shot predicates ("first
visitor arrives", "produce one trade good") and dump 3–6 unlocks at once through a play-pausing
modal. Traffic never escalates on its own; maintenance/sanitation drift is auto-absorbed by crew;
nothing compounds while you stand still. RimWorld buys its loop with external storyteller
pressure; ONI with compounding internal pressure; this game currently has neither — so the only
forward motion is the next checkbox, which is precisely the owner's complaint.

These three are one sentence together: **nothing pushes on the player (RC3), so slack capacity
is never exposed (RC1), and even when the player acts anyway, no meter tells them it mattered
(RC2).**

---

## WHAT THE CANON SAYS A 3-ROOM BASE NEEDS

Not new systems — the right *shape* on existing ones:

- **Demand slightly exceeding comfortable capacity at all times.** Two Point Hospital is a queue
  game: rooms choke, patients storm off visibly, sizing and proximity are the whole puzzle, and
  guides literally teach "rooms as small as possible / keep GP near the entrance" because space
  and flow bind ([TPH layout guide](https://gamefaqs.gamespot.com/pc/230622-two-point-hospital/faqs/76595/the-9-general-rules-of-hospital-layout),
  [TheGamer](https://www.thegamer.com/two-point-hospital-best-most-profitable-layouts/)).
- **Compounding internal pressure.** ONI needs no raids: CO2, heat, and calories compound if
  ignored; every fix ripples into the next problem ([NeoGAF design thread](https://www.neogaf.com/threads/oxygen-not-included-is-a-masterclass-in-colony-sim-design.1685195/)).
- **A P&L knife-edge.** Tycoon games keep recurring costs close enough to income that overbuilding
  hurts — profit becomes the skill meter.
- **Failures with names and faces.** RimWorld/DF anecdotes come from legible, attributable events,
  not aggregate drift.

The station already owns the hard parts: archetypes with patience and spend multipliers, a
reservation system, queue counters, walk-distance tracking, per-room environment scoring, an
incident/repair pipeline. **The service-tycoon loop is fully plumbed and instrumented — it is
just tuned so it never engages.**

---

## THE PRESCRIPTION (priority order = fun-per-effort)

### RX1 — Right-size every early capacity so "one of each" is NOT enough. *(do this first)*
- **What:** A pure `balance.ts`/constants pass. Cut per-module throughput ~10x (stove 0.95 →
  ~0.08–0.12 meals/s; grow station likewise), shrink meal stockpile caps, cut `BASE_POWER_SUPPLY`
  14 → ~6 and reactor output so the grid asks a question every 2–3 rooms, and let tables/serving
  stations bind at ~5–6 concurrent visitors. Target: at default traffic, the second stove is
  needed around cycle 5–8, the second table shortly after, and a *ratio* (grow : stove : table)
  exists to discover and tune.
- **Fun problem addressed:** RC1. This single pass creates the minute-to-minute ratio/throughput
  puzzle that IS the genre at small scale.
- **Predicted behavior/emotion:** player watches the kitchen fall behind, adds a stove, sees the
  queue drain — the "fiddle → observe → fiddle" loop the owner named as missing.
- **Cost:** LOW — constants + a tuning playtest loop (the headless lab in `rx-probe/lab.cjs` can
  regression-check "does one-of-each saturate at cycle N" automatically).
- **Risk:** mis-tuning → frustration. Mitigate with RX3's load readouts, and keep the harness
  asserting "starter recipe survives but strains."

### RX2 — Make money a knife-edge: recurring costs that can beat income.
- **What:** Raise payroll ~5–8x, add small per-active-room upkeep, cut the passive per-second
  spend trickles (vending/cantina drip), and shift income weight onto **per-happy-exit payouts**
  (raise `mealExitPayout` and add a leisure-exit payout). Add one HUD line: `income/min −
  upkeep/min = profit/min`. Net effect: a well-run 4-room station profits ~15–30/min; a badly-run
  one goes negative. Re-tune tier credit thresholds to ~10–15 min of *good* play (500 at 4/min ≈
  2hr today).
- **Fun problem:** RC1+RC2 — "waiting for credits" becomes "earning credits by running well";
  the unlock timer becomes a skill meter.
- **Predicted behavior:** players check profit/min after every change — the universal tycoon
  scoreboard. Overbuilding (three lounges) now visibly costs.
- **Cost:** LOW (constants + one HUD line + threshold retune). **Risk:** early bankruptcy spiral —
  add a soft floor (dock subsidy at 0 credits with a rating cost, à la Two Point loans).

### RX3 — Visible queues + named failures: give optimization its scoreboard.
- **What:** (a) Render visitor queues at serving stations/stalls/gangways (the sim already tracks
  `cafeteriaQueueingCount`, reservations, patience — draw the line of sprites). (b) When patience
  expires, a **named, attributed** storm-off event in an event feed: "Trader Yusa left — waited
  40s for food (-1 rating)". (c) Kill silent leaks: the ship-queue timeout (-1.4 each,
  `sim.ts:8128`) either surfaces as an alert with a fix affordance ("dock congested — add berth
  capacity") or stops costing rating. (d) Per-room **load bar** on hover/inspect: "Kitchen 140% |
  Lounge 20%".
- **Fun problem:** RC2. Converts the game's excellent-but-cold diagnostics into cause→effect the
  player can act on and *feel*.
- **Predicted behavior:** the queue becomes the game's primary "something's wrong here" signal,
  like TPH; players screenshot their event feed (anecdote seed).
- **Cost:** MEDIUM (render + feed UI; data exists). **Risk:** low. Highest UI effort of the low-risk set.

### RX4 — Demand-driven, rising traffic (close reputation→demand; retire the slider).
- **What:** Arrivals grow from happy exits + rating instead of a free player slider: e.g. base
  1/cycle drifting toward 2–3 as average visit success stays high, decaying when service fails.
  Keep a *policy* version of the slider (docking clearance: open/selective/strict — traffic vs
  quality trade-off) rather than a free volume knob. Cap growth per cycle to prevent runaway.
- **Fun problem:** RC3 (escalation spine) + finally gives rating a consequence (RC2). This is the
  loop-closing item the first review called the true blocker, now scoped to the early game.
- **Predicted behavior/emotion:** "my station is getting popular" — success manufactures the next
  strain, which RX1 turned into a real puzzle. This is the engine that makes the game
  self-pacing instead of checklist-paced.
- **Cost:** MEDIUM (arrival-rate function + tuning; the metrics it needs — visits, fails, rating —
  already exist per-cycle). **Risk:** feedback spirals both directions; needs floor/ceiling and
  the harness soak.

### RX5 — One compounding pressure + a tiny director (v0), not a content drop.
- **What:** (a) Pick **one** entropy channel — sanitation is the most spatial/visible — and give it
  teeth: filth actually slows service and cuts spend in that room (today:
  `SANITATION_VISITOR_RATING_PENALTY_PER_SEC = 0.0014` ≈ nothing), with dirt generated by traffic
  so success creates work. (b) Director v0: every 2–3 cycles, one telegraphed micro-incident
  targeting the *busiest* system — "stove failing in 60s", "34 hungry miners docking in 90s",
  "spill in the corridor" — each with a named cause and one clear lever. Reuse the existing
  incident/repair/job plumbing; 3–5 templates is enough for v0.
- **Fun problem:** RC3 — standing still finally costs; anecdotes get manufactured at 3-room scale.
- **Cost:** MEDIUM. **Risk:** feels random/nagging if untelegraphed — always show cause, always
  cooldown. Do AFTER RX1/RX2 so incidents strain a taut system rather than a slack one.

### RX6 — Subtraction pass on progression *(cheap, do alongside)*
- Halve the tier ladder's breadth: T1 unlocks lounge+market+cantina simultaneously — pick ONE per
  tier, gate the rest behind *played pressure* ("kitchen backlogged 3 cycles → vending machine
  available") so unlocks read as answers to problems, not checkboxes.
- Stop pausing the sim for unlock modals — toast + event-feed entry instead. (Today the modal
  freezes play and eats a click; it also froze my first three probes.)
- Relabel/retire the cosmetic Day/Cycle clock (unchanged recommendation from review 1).

### Explicitly NOT recommended right now
More rooms, more tiers, more systems, more sprites, Part-3 strategic layer (system map/factions/
contracts). The first review's audit stands: the gap is built-systems-without-consequence, and
every intervention above is tuning/surfacing/closing on systems that already exist. New content
would widen the very problem the owner named ("hardly scratched the surface … so many unlocks").

---

## SEQUENCE & EXPECTED SHAPE OF THE FIRST HOUR AFTER RX1–RX4

Minute 1–5: 4 rooms, traffic 1/cycle, kitchen keeps up, profit slightly positive. Minute 5–15:
traffic drifts up on success; first queue forms; player adds a stove OR a table (can't afford
both — RX2), sees the queue drain, profit/min tick up. Minute 15–30: second dock berth decision
(ship timeouts now *visible*), power question on the next room, first sanitation strain in the
cafeteria, one telegraphed stove failure to fight. The station is still 6 rooms — and every one
of those was a decision with a visible result. That is the loop the owner is asking for.

---

## APPENDIX — verification trail

- **Live do-nothing run** (30 sim-min, modal auto-dismiss): `rx-probe/playtest-a4.mjs`; log in
  transcript; screenshots `rx-A0-boot.png`, `rx-M1-after-tier1.png`, `rx-A4-t*.png`.
- **Early-game lab** (owner's opening, 4 variants): `rx-probe/lab.cjs` against compiled
  `origin/main` sim (`ssg-main/.tmp/sim-tests/`). Variants: compact / +14-tile scattered /
  tax 0 / tax 0.35.
- **Key code coordinates** (origin/main `171816b`): throughputs `src/sim/balance.ts:446`
  (`PROCESS_RATES`); payroll `sim.ts:278` (0.32/crew/30s); ship-timeout rating leak
  `sim.ts:8128` (-1.4, silent); arrivals ignore rating `sim.ts:7918` (`nextTrafficArrivalDelay`);
  morale's only consumer `sim.ts:11078`; rating's only consumers `sim.ts:5945,6018` (resident
  conversion); spend-vs-environment clamp ±15% `sim.ts:~12665`; tier predicates
  `src/sim/content/unlocks.ts`; tax payout `sim.ts:12266`; power base/reactor `sim.ts:199–200`.
- **Prior-art sources:** [Gideon's Gaming — ONI design review](https://gideonsgaming.com/the-genius-design-of-oxygen-not-included-a-review/) ·
  [NeoGAF — ONI masterclass thread](https://www.neogaf.com/threads/oxygen-not-included-is-a-masterclass-in-colony-sim-design.1685195/) ·
  [GameFAQs — TPH 9 rules of hospital layout](https://gamefaqs.gamespot.com/pc/230622-two-point-hospital/faqs/76595/the-9-general-rules-of-hospital-layout) ·
  [TheGamer — TPH layout efficiency](https://www.thegamer.com/two-point-hospital-best-most-profitable-layouts/)
- **Nothing in the game repo was modified.** Source read via detached worktree in scratchpad;
  live build driven read-only through `__harness*` hooks.
