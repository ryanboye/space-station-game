# Space Station — Core-Loop SPEC v4: THE CROWD IS THE GAME

Fable, pass 4. Folds in awfml's two reframes: **the fix must be visceral-spatial and
agent-enacted** (Prison Architect / Stardew standard — no more numbers, no hidden panel
rules), and **nothing existing is sacred**. All numbers are measured on origin/main
`171816b` via patched throwaway sim copies + the `lab2.cjs` harness. Theater elements
that can't be measured headlessly are labeled PREDICTED and specced concretely. The full
pass-3 measurement dossier (extinction bug, dead bus, dock zones, economy) is archived
below the divider — v4 cites it as "P3".

---

# PART A — THE THESIS, AND WHAT THE PLAYER SEES

## Why every previous placement system "added layers of bullshit"

Every prior attempt (route-pressure, exposure scoring, noise/status traits, district
heat) shares one shape: **a hidden rule computes a number, the number drifts a meter, a
panel explains it.** Measured: their combined effect on outcomes is ±3% (route exposure
±2.4%, environment spend clamp ±15% max), all pouring into a rating meter proven
bit-identical to a no-op (P3). Prison Architect and Stardew never do this. Their rule is
**physically self-enforcing**: prisoners fight *in the space that allows it*; crows eat
*the crop the scarecrow can't see*. The consequence is an actor doing something visible,
in a place, that the layout either enabled or prevented — the player learns by watching.

This game already owns the right physical medium and doesn't use it: **bodies in
corridors.** The sim tracks per-tile occupancy that already slows pathing
(`buildOccupancyMap`, `chooseLeastLoadedPath`), visitors already queue at real queue-spot
tiles (`pickQueueSpotPath`, `isCafeteriaQueueSpot`), already run out of patience and
already storm off to the dock (`sim.ts:12736`) — all of it invisible, unpriced, and
throttled to nothing by drip-feed arrivals (ships carry 1-2 passengers,
`sim.ts:214-215`).

**Thesis: make crowd flow the game.** Ships arrive as PULSES of passengers; service
points grow real, visible, tile-occupying queues; queues that outgrow the room spill out
the door and physically choke corridors; frustrated customers visibly quit and take
their money; dense crowds visibly misbehave (shoving, litter, scuffles) where — and only
where — your layout packs them. Room SIZE = queue capacity. Door/corridor geometry =
where overflow goes. Distance from dock = who gives up mid-walk. Adjacency = which flows
collide. No new meters. The owner's failed "logistics mustn't cross visitor routes" rule
becomes literal bodies in the way — self-enforcing, self-teaching.

**Measured skeleton — all of this already runs in the current engine** (repaired stack,
20-min runs, seed 1337):

| config | vis/min | avg queue | queue-busy % | storm-off pts | served | profit/min |
|---|---|---|---|---|---|---|
| today's drip arrivals (pods of 1-2) | 5.4 | 1.3 | 34% | 0.3 | 91 | 35.5 |
| **pulse arrivals (pods of 4-8)** | 13.0 | **8.8** | **95%** | **97** | 199 | 89.3 |
| + player adds 2nd serving counter | 13.0 | 9.1 | 94% | **26** | 211 | 95.6 |
| + player adds 2nd stove too | 14.8 | 5.4 | 85% | **9.8** | 248 | 113.7 |

One constant flips the game from dribble to crowd; each capacity/placement answer the
player builds visibly and measurably digests the wave. **See the crowd → read the choke
→ reshape the space → watch it drain** — the Prison-Architect/Two-Point loop, and the
engine already runs its physics. What's missing is only that it is never RENDERED
(queues invisible), never PRICED (bails are 0.012 ticks on a dead meter), and never
REACHED (drip arrivals).

## The on-screen beats (what the player literally sees, minutes 1-15)

1. A freighter docks; **seven passengers pour out in one visible knot** and stream down
   the entry corridor (today: one lonely sprite every ~15s).
2. They hit the cafeteria; a **line forms** — actual sprites in a snaking file from the
   serving counter. The room fills. The line reaches the door… and pokes into the
   corridor.
3. A crew hauler with a meal crate **can't get through the line** (occupancy already
   does this — now you can see why); restocking slows; the line grows. The jam is the
   diagnosis: no panel required.
4. A visitor at the tail **throws up their hands, flashes red, and stomps off to their
   ship** — a "−11cr" coin floats away over their head. Two follow. A newcomer looks at
   the line from the doorway and **turns around on the spot**.
5. Where the crowd is thickest, two visitors **shove each other** — scuffle burst,
   litter under the crowd; your one security officer **runs the length of the station**
   to break it up. Response time = distance, watched in real time.
6. The player acts — all spatially: **widen the cafeteria** (more in-room queue tiles),
   **add a second counter** (measured: storm-offs −73%), **move the door** so overflow
   snakes along a wall instead of across the haul route, **build the next dock zone on
   the far wall** to split the arrival stream. The next wave visibly digests.
7. Rating (now honest — P3) ticks up; **more and bigger ships come.** The station
   breathes: surge, strain, fix, grow.

---

# PART B — THE MECHANIC, ELEMENT BY ELEMENT
(each: hypothesis → exact change → measured/PREDICTED result → why it's the fun)

## B1. Pulse arrivals (the wave-maker) — 2-line change, fully measured

- **Hypothesis:** demand arriving in pulses is what makes capacity, queueing, and layout
  legible; pods of 1-2 keep every room trivially smooth forever.
- **Exact change:** `sim.ts:214` `DOCK_POD_PASSENGER_MIN = 1` → **4**; `sim.ts:215`
  `DOCK_POD_PASSENGER_MAX = 2` → **8**. (Spawn window is already a 2s burst:
  `shipDockedPassengerSpawnSec`, `balance.ts` TASK_TIMINGS.) Scale `berthPassengerCount`
  (`sim.ts:3206`) by class: small 4-8 / medium 10-16 / large 20-30. Optionally lengthen
  arrival gaps so ships/min falls as passengers/ship rises (fewer, bigger waves).
- **Measured:** table above — avg queue 1.3→8.8, queue-busy 34%→95%, storm-offs
  0.3→97, revenue ×2.5 (economy constants need one retune pass at pod scale — flagged).
- **Why it's the fun:** a pulse is an EVENT you watch arrive and crash on your layout; a
  drip is a stat. Waves give a 4-room station drama on a 90-second rhythm.

## B2. Queues are real bodies in real tiles (render + spill) — the centerpiece

- **Hypothesis:** the queue is the most legible spatial consequence a service game has;
  this engine already simulates queues and hides them.
- **Exact change (three parts):**
  1. **Render:** visitors in `VisitorState.Queueing` already stand at queue-spot tiles.
     Draw them as an ordered file anchored at the service module: per-queuer index,
     lerped to a tile chain, facing the counter, idle sway + glance-at-watch emote.
  2. **Allocator becomes a LINE:** replace the nearest-free-spot pick
     (`pickQueueSpotPath`) with a BFS chain from the service tile hugging walls —
     in-room tiles first, then THROUGH THE DOOR and along the outside wall. A too-small
     room has a short in-room chain and **spills into the corridor by construction**
     (~60 lines; pin queuers to chain tiles with the existing `seat-use-slot`
     reservation kind).
  3. **Spilled queuers block like anyone else — zero new code:** queue tiles are
     occupied tiles; `buildOccupancyMap` + `chooseLeastLoadedPath` already make crew and
     visitors detour or shove through slowly. The corridor-choke consequence is
     emergent.
- **Measured:** queue depth avg 8.8 / max 22 under B1 — lines of 5-15 at peaks; the
  choke physics already exist. PREDICTED (render-side): the line's shape instantly
  communicates room-size adequacy. Playtest gate G1: a first-time player resizes or
  re-doors a room in reaction to a visible queue, unprompted.
- **Why it's the fun:** room SIZE gets a visible job (in-room queue capacity), DOORS get
  a visible job (where the snake goes), CORRIDOR WIDTH gets a visible job (can traffic
  route around the line). The failed route-crossing rule, made physical: nobody scores
  you — the bodies just *are in the way*, and you fix it with walls and doors.

## B3. Refusal is theater with a price tag (storm-off / balk / lost coin)

- **Hypothesis:** a lost customer must be one visible person taking visible money, not a
  0.012 rating tick (`sim.ts:12444/12454` — measured imperceptible).
- **Exact change:**
  1. At the existing storm-off transition (`visitor.patience > 30`, `sim.ts:12736`):
     angry flag → red flash + stomp gait + "!" emote on the walk out; float a
     `−{mealExitPayout()}cr` coin (the exact revenue lost — `sim.ts:12266`); event-feed
     line `"{name} left — waited {t}s at {room}"` in the ALERTS panel.
  2. **Balk at the door:** at queue-join, if `queueLength × recentServeInterval >
     patienceRemaining/1.4` (all tracked), refuse visibly: stop at threshold, shrug,
     turn around; same coin, cause "line too long".
  3. Delete the invisible micro-ticks; storm-offs/balks become THE service-failure
     signal feeding the honest rating (P3 CH-1/2).
- **Measured:** the priced value is real — at stock capacity under B1, storm-offs cost
  dozens of sales per 20 min; one added counter recovers +6.3 profit/min, a second
  stove +18 more. PREDICTED: the coin/emote is what makes those numbers land — this is
  Stardew's crow moment.
- **Why it's the fun:** the punishment IS the tutorial: each walk-out is a small story
  with a location, a cause, and a price, seen not read.

## B4. Crowd pressure spawns visible misbehavior where the crowd is

- **Hypothesis:** Prison-Architect-ness = agents misbehave in space and response time is
  distance. Incidents, security dispatch, a Brig, cameras, and district-heat plumbing
  all exist in code — expressed today as numbers and overlays, never as a scene.
- **Exact change:**
  1. **Trigger on measured density:** every ~5s, a tile with ≥3 visitors within radius
     1 sustained >5s (`pathOccupancyByTile` — exists) rolls a scuffle chance, scaled up
     for Queueing visitors (frustration) and cantina-goers (drinks).
  2. **Scuffle = a placed, animated incident:** two sprites shove (2-3s FX), litter
     drops (`dirtByTile[tile] += k` — sanitation jobs already spawn from dirt), tile
     briefly blocks; if no security response within 30s → fight: stun, heavier litter,
     nearby visitors bail with B3 theater. Wire into the EXISTING incident +
     security-dispatch pipeline (`securityDispatches`, `securityResponseAvgSec`) so
     guards physically run there and drag offenders to the existing Brig.
  3. **Re-point district-heat/reputation OUTPUT here** (inputs may stay): heat weights
     scuffle odds; the overlay demotes to optional flavor.
- **Measured:** density preconditions occur constantly under B1 (queue-busy 95%);
  security response-as-distance already simulated. PREDICTED tuning target: 1-2
  scuffles/5min at a strained station, ~0 at a well-run one — consequence, not weather.
- **Why it's the fun:** bad layout (one giant hall, crossing flows) is visibly rowdy;
  good layout (split flows, wide halls, security near the cantina) is visibly calm —
  taught by watching guards sprint.

## B5. The build-time reach ghost (the one overlay that earns its place)

- **Hypothesis:** patience already prices distance (measured on the repaired stack:
  +6 tiles = −26% profit; +14 tiles = collapse), but the player can't see the radius
  before building — Stardew shows the scarecrow circle *while placing*.
- **Exact change:** during placement ONLY, tint floor by walk-time from the nearest
  passenger gangway vs the 21s patience fuse (constants exist: patience 30 @ 1.4/s):
  comfortable / marginal / "they'll quit before arriving." Reuse the air-coverage
  overlay tinting; auto-show on build-tool select, auto-hide after. A placement ghost,
  not a panel.
- **Measured:** the gradient it visualizes (35.5 → 26.2 → collapse profit/min at
  +0/+6/+14 tiles). PREDICTED: converts the invisible distance cliff into a
  Stardew-style aiming decision.
- **Why it's the fun:** placing a room becomes aiming inside a visible circle of
  viability — then verified by watching the walkers.

---

# PART C — PLUMBING SUBSTRATE (P3, compressed — the crowd game needs actors alive,
meters honest, demand growing; full tables in the archive below)

- **CH-0 (P0): stop the silent extinction.** No Life Support in the starter and none
  prompted; hiring past ~4 crew or expanding rooms crashes air → **entire crew
  suffocates ~minute 4, silently** (measured: air 55→3, 8/8 dead; a +14-tile layout
  killed 46 incl. visitors; every "nothing responds" symptom traces here — haul stall =
  dead haulers, Priorities preset bit-identically inert, payroll under-collected 12x =
  payer dead). Fix: LS pocket in `initial-state.ts:123-145` pattern + `recentDeaths` as
  a red ALERT + death event (today it's one text row at `main.ts:6970`). Counterfactual:
  served 14→60/15min, bails 63→0.3, stall never occurs.
- **CH-1: honest rating.** Delete the −1.4 queue-timeout bleed (`sim.ts:8130`) — it
  zeroes EVERY station incl. the best (bails 0.3, rating 0) and is not
  player-addressable (one ship per dock ZONE, `sim.ts:5348`; adding tiles measured
  useless). Gate dispatch instead (`sim.ts:8060`, skip when `dockQueue.length ≥
  docks.length`).
- **CH-2 (keystone, validated w/ amendments):** arrivals × rating
  (`sim.ts:7921`: `× clamp(1.7 − rating/60, 0.55, 2.2)`) + bonus inflow raised
  (`sim.ts:12493` 0.08→0.5, `:12716` 0.03→0.25). Measured: good station 70→100 by min
  12 (+11% traffic/+16% profit); broken station rating 4.8, arrivals −44%, profit
  −6.2/min. NEVER without CH-1 (measured death spiral). With B1-B4 the rating's inputs
  are all events the player watched.
- **CH-3: money knife-edge.** `PAYROLL_PER_CREW` 0.32→~1.0 (`sim.ts:279`); payout
  `(3+8t)→(9+10t)` (`:12266`); drips cut (`:12613/:12635`); show existing
  `creditsNetPerMin` (`sim.ts:14872`, formatted at `main.ts:6939`) on the top bar.
  Measured sign flip: −6.9 vs +24.3/min; T2 in ~11-12 min of good play (was ~2h).
  **Retune at B1 pod scale** (revenue ×2.5).
- **CH-4: dock zones = the demand lever, surfaced.** Zones 1→4 measured 1.30→3.50
  vis/min; slider measured inert (1.30/1.27/1.20). Tooltip "one ship per dock zone", T1
  task text, slider row (`main.ts:259`) → read-only forecast.

## THE CUT LIST (reframe 2 — replaced, not preserved)

| cut | why (measured) | replaced by |
|---|---|---|
| Route-pressure/exposure rating penalties + "layout friction" warnings | ±2.4%, invisible — the named anti-pattern | B2 spilled queues + B4 scuffles |
| Room-environment spend scoring (±6-15% clamps) | imperceptible, panel-only | B4 visible reactions (traits table kept for future emotes) |
| Traffic-rate slider | measured inert | CH-4 zones + CH-2 growth |
| Tax slider (early) | measured monotone one-way under BOTH payout formulas | reintroduce at T4+ residents, if ever |
| Global Morale stat | sole consumer is a crew-leisure gate (`sim.ts:11078`) | crew emotes (theater backlog) |
| Ship queue-timeout penalty | structurally zeroes all stations | CH-1 queue gate |
| District-heat overlay as primary crime UI | number-panel anti-pattern | B4 scuffles/guards on screen (heat = internal spawn weight) |
| Bridge terminal zoo (20 module types, `balance.ts:23-43`) | content noise ahead of a working loop | defer wholesale |

# PART D — BUILD ORDER & PLAYTEST GATES

**CH-0 → CH-1 → B1 (+CH-3 retune at pod scale) → B2 → B3 → CH-2+CH-4 → B4 → B5 → cuts.**

Falsifiable gates: **G1** (after B2) a first-time player resizes/re-doors a room in
reaction to a visible queue, unprompted. **G2** (after B3) the player can say what a
storm-off cost without opening a panel. **G3** (after B4) the player moves
security/cantina or widens a hall in reaction to watched scuffles. If G1 fails, fix the
render, not the numbers.

Crowd-skeleton run table (pass 4): W0 drip 5.4 vis/min · avgQ 1.3 · busy 34% · bail 0.3
· profit 35.5 │ W1 pulse 13.0 · 8.8 · 95% · 97 · 89.3 │ W5 +counter 13.0 · 9.1 · 94% ·
26 · 95.6 │ W4 +counter+stove 14.8 · 5.4 · 85% · 9.8 · 113.7 │ W2/W3 dwell×6: 3rd table
no-op — **seats are not the binding stage; the serving counter is (twice-confirmed:
table test + stove-nerf refutation).** Dwell multipliers smooth rather than bind — use
moderate dwell-up only as theater (rooms look inhabited), not difficulty.

---
---

# ARCHIVE — pass-3 measurement dossier (unchanged)

Fable, pass 3. Supersedes `SPACEGAME-COREloop-RX.md` (pass 2) and validates/extends
`SPACEGAME-DEEP-RX.md` (opus deep-dive). Every claim below was **measured on origin/main
`171816b`** by patching a throwaway compiled copy of the sim and running an instrumented
harness before and after. Nothing in the repo was modified.

**Reproduction rig** (all paths under the session scratchpad, `rx-probe/`):
- `lab2.cjs` — builds the owner's opening (cafeteria/kitchen/hydroponics/market/lounge/hygiene
  + modules + starter dock) on a fresh sim, runs N sim-minutes at 4 ticks/sec, reports
  visitors/min, meals served, gross/payroll/profit per min, rating trajectory, bail totals,
  ship timeouts, deaths, per-minute pipeline rows (`servStock`, `mealJobs p/a/d`).
  Flags: `--zones N` (separate 2-tile dock zones), `--crew N` (extra hires), `--lifesupport`,
  `--yoff N` (push service stack N tiles further), `--traffic`, `--tax`, `--stoves/--grow`,
  `--forceRating N`, `--preset <name>`, `--noimport`.
- `sim-tune/` — compiled sim with env-var knobs at the exact constants under test:
  `STOVE_RATE HYDRO_RATE PAYROLL PAYOUT_BASE PAYOUT_TAX TIMEOUT_PEN RATING_TRAFFIC
  QUEUE_GATE MEAL_BONUS EXIT_BONUS VEND_RATE DRINK_RATE TAX_FLOOR(2)`.
  Rebuild: `tsc -p tsconfig.simtest.json` in a worktree, then the sed list in Appendix C.

---

# PART 1 — THE CORRECTED DIAGNOSIS

## Finding 0 (NEW, P0): the crew silently suffocate four minutes into a normal opening.

**Hypothesis tested:** "the food chain stalls / nothing responds because of tuning."
**Refuted — the proximate cause is mass death.**

Measured sequence (starter box + 2-tile dock, hire 4 crew → 8 total, nothing else):

| min | air | crew | deaths |
|---|---|---|---|
| 1 | 55 | 8 | 0 |
| 2 | 36 | 8 | 0 |
| 3 | 16 | 8 | 0 |
| 4 | **3** | **0** | **8** |
| 6 | 95 (recovers — the dead stop breathing) | 0 | 8 |

- The starter has **no Life Support room** (`initial-state.ts` paints hull, reactor pocket,
  bridge, console — no LS), and no tier task ever asks for one (`content/unlocks.ts` T1 =
  "add lounge and market").
- 4 crew sit just under the no-LS air equilibrium; **hiring past ~4 crew is lethal**
  (4 crew: 0 deaths in every run; 8 crew: 8 deaths at min 4, `purgeDeadCrewFromAir`,
  `sim.ts:10837`; kill thresholds `AIR_CRITICAL/DISTRESS = 8/15`, `sim.ts:292-293`).
- Building rooms extends the same trap spatially: the owner's exact opening with 8 crew
  dies at min 4 in every pass-2 lab run (air 49→25→2 — I mis-read this as "self-recovering
  drama-free air" in pass 2; it was the extinction event).
- **Visitors die too:** service stack +14 tiles from the box (a completely reasonable
  layout), with LS built: **46 deaths in 8 minutes** — crew plus a conveyor of suffocating
  customers. Served meals: 1.
- It is invisible: no alarm, no event, no game-over. The only death readout is one text row
  inside a details drawer (`main.ts:6970`). The station keeps vending to visitors off the
  pre-stocked serving buffer, so the HUD shows a working station.

**Downstream effects previously mis-attributed to tuning — all measured, all caused by this:**
- The "food-chain stall at min 3" (haul jobs frozen at `Np/0a`, serving stock →0, kitchen
  prod →0): the haulers are dead. With an LS room, hauls never stall (job dones 3→69 across
  15 min, serving stock stays 20+).
- The payroll mystery (payroll collecting at 1/12 the constant-implied rate): `crew.total`
  was 0 from min 4. With LS: payroll exact (5.12/min at 8×0.32×2 ✓).
- "More crew = worse station" inversion (served 58/29/21 at 4/12/16 crew): more breathers
  die faster and eat the sellable meals first.
- The mystery "incidents" counter (109 in a 30-min do-nothing run): includes
  payroll-deficit heat (`applyCrewPayroll` deficit branch, `sim.ts:14286`) and death fallout
  — none surfaced as events.
- The player-facing counter-tool is inert: rerunning the 16-crew stall with
  `crewPriorityPreset='food-chain'` is **bit-identical** to the default run (every summary
  field equal). The Priorities panel cannot fix the thing it exists to fix. (Bug ticket,
  repro: `node lab2.cjs --sim sim-tune --traffic 3 --zones 4 --crew 12 --preset food-chain`.)

**Why this is THE fun bug:** awfml played a station of corpses. Every quality system he
"couldn't feel" was dutifully reporting a catastrophe into a meter with no consumer (below).
No wonder every knob felt dead — 4 minutes in, most sessions have no live actors to respond.

## Finding 1: the dead bus is real — proven bit-identical.

DEEP-RX's structural claim (all quality signals terminate in `stationRating`; rating's only
functional consumers are resident code `sim.ts:5945/6018/13842`, T4+; arrivals read only the
slider `sim.ts:7917`; income uses fixed per-archetype `spendMultiplier` `sim.ts:3437+` with
`reputationSpendMultiplierAt` `sim.ts:3297` ≈1.0 at zero-state zones): **CONFIRMED**.

Empirical proof: 30-min run with rating force-pinned to 90 every tick vs the natural run
(which decays 70→0): **every output field identical** — visitors 36, served 26, earned
114.8, timeouts 266. Rating has zero effect on anything the early game computes.

## Finding 2: the demand system is inverted — the slider is fake, dock ZONES are real.

- Contiguous Dock tiles form ONE `DockEntity` with a single `occupiedByShipId`
  (`rebuildDockEntities`, `sim.ts:5348`) → **one ship at a time per zone, regardless of
  area**. Cycle ≈ 32s (approach 2 + docked ≤28 + depart 2) ≈ 1.9 ships/min ceiling.
- Traffic slider 1→2→3 (30-min runs): visitors/min **1.30 / 1.27 / 1.20** — flat. Queue
  timeouts: **71 / 171 / 266**. The player's only traffic control manufactures silent
  rating damage, not customers.
- Separate zones 1→2→3→4: visitors/min **1.30 / 2.17 / 2.83 / 3.50**. The real demand
  lever exists today, is never suggested by any UI/task, and its payoff is invisible.
- Each timeout costs **−1.4 rating silently** (`sim.ts:8130`); at any slider setting the
  bleed swamps the entire bonus inflow (total success bonuses earned by a *good* 30-min
  station: ~+9; timeout bleed: −99 to −372). **Every station, including the best one I
  could build (bails 0.3, profit +31.8/min), ends at rating 0.** The game's score meter is
  structurally rigged to zero.

## Finding 3: with living crew, the underlying sim is GOOD — it differentiates play sharply.

Once an LS room exists (crew alive) the measured loop works and spreads:

| config (30 min, payout rebalance, payroll 0.6) | vis/min | served | profit/min |
|---|---|---|---|
| default station (1 zone, traffic 1) | 1.4 | 36 | **+3.25** |
| expanded (4 zones, traffic 3) | 5.0 | 125 | **+31.8** |

A 10x profit spread between lazy and optimized stations, near-zero bails at capacity,
stable pipeline. **The game underneath the corpses is worth saving — this is tuning + one
bug + wiring, not a redesign.**

## Finding 4 (refutes my own pass-2 recommendation): nerfing stove throughput does NOT create decisions.

Pass-2 RX1 / DEEP-RX FIX 4 said: stove 0.95→0.10 so "the second stove is a decision."
Measured (2 zones, traffic 3): stove 0.95 → 29 served; 0.10 → **9** served; 0.03 → 3;
0.02+second stove → **4** (second stove nearly useless). Mechanism: visitors reserve a meal
only if one sits unreserved in the serving station **right now**; the bail fuse is ~21s
(`patience > 30` at 1.4/s, `sim.ts:12736`); slow cook rate starves the buffer at the moment
of demand and customers storm off long before average throughput matters. **Cutting supply
rates creates bail cascades, not choices.** The correct scarcity lever at early scale is
demand growth (dock zones / arrivals), with serving buffers as the felt constraint.
Withdraw the stove-nerf recommendation.

---

# PART 2 — THE CHANGES (hypothesis → exact change → measured result → why it fixes fun)

Ordered by build sequence. CH-0..CH-3 were measured as a combined stack and individually.

## CH-0 (P0, do first) — End the silent extinction: starter Life Support + death alarm.

- **Hypothesis:** the early game's unresponsiveness is downstream of undetected crew death;
  giving the starter an LS envelope (and making death loud) restores every other system.
- **Exact change (minimal, two parts):**
  1. `src/sim/initial-state.ts` — paint a starter LifeSupport pocket exactly like the
     existing reactor pocket block (`initial-state.ts:123-145`): 5x5 walls + interior
     `RoomType.LifeSupport` + door, attached to the box's south-west corner (any hull
     edge clear of the dock works). LS has no required modules (`balance.ts`
     `ROOM_DEFINITIONS[LifeSupport]`), so the pocket is self-activating.
  2. `src/main.ts` — promote deaths to a first-class alarm: the data already exists
     (`metrics.deathsTotal` / `recentDeaths`, currently one text row at `main.ts:6970`).
     Add to the ALERTS panel (bottom-right, currently shows "Meals running low"):
     `if (state.metrics.recentDeaths > 0) alerts.unshift({ tone:'danger', text:
     '⚠ CREW DEATH — check air supply' })` and fire the same banner used by tier-up.
  - Optional third (proposed, NOT yet measured): graded air — fold
    `clamp(air/60, 0.4, 1)` into serve-speed/spend below air 60 instead of the current
    binary fine-or-die at 8/15 (`sim.ts:292-293`, DEEP-RX FIX 2). The cliff also exists
    spatially (+14 tiles = 46 deaths); a gradient turns it into a felt gradient cost.
- **Measured result (LS counterfactual, everything else equal):**

| | no LS (8 crew) | with LS (8 crew) |
|---|---|---|
| deaths @30min | 8-9 | **0** |
| haul jobs done (15 min) | frozen at 11 | **69, never stalls** |
| meals served /15min | ~14 | **60** |
| patience bails (rating pts) | 63-72 | **0.3** |
| payroll collected | 1/12 of nominal (payer dead) | exact |

- **Why it fixes fun:** every downstream loop (service, economy, rating, staffing) only
  exists while actors are alive. This converts "nothing responds" into "everything
  responds," and the alarm converts the game's harshest event from silence into a story
  beat the player acts on. Cost: ~1h. Risk: none measurable.

## CH-1 — Stop the structural rating bleed; gate arrivals on the queue instead of punishing it.

- **Hypothesis:** the −1.4/timeout bleed makes rating monotonically →0 for every station
  (best station measured: bails 0.3, rating 0), so no rating-driven loop can ever spin up;
  ships that would time out should simply not be sent.
- **Exact change:**
  1. `sim.ts:8130` `serviceFailureRatingPenalty(state, 1.4, 'ratingFromShipTimeout')` →
     delete the penalty (keep `shipsTimedOutInQueue++` for telemetry). (Timeouts are not
     player-addressable in the intended way: extending the dock with 4 more tiles left
     timeouts at 247 vs 266 — capacity is per-zone, Finding 2.)
  2. `sim.ts:8060` (inside `updateTrafficArrivalSchedule`'s spawn loop) — wrap:
     `if (state.dockQueue.length < state.docks.length) scheduleSporadicArrival(state);`
     (traffic control: don't dispatch arrivals the docks can't take).
- **Measured result:** with CH-1 active (as `TIMEOUT_PEN=0 QUEUE_GATE=1`), a well-run
  station's rating reaches and holds 100 (C-control run) instead of 0; a badly-run one
  still falls to ~5 through *service* failures the player can fix (D run). Rating becomes
  a true quality meter: floor and ceiling both reachable, both attributable.
- **Why it fixes fun:** optimization needs a scoreboard that responds to the player's play,
  not to an invisible structural fault. Cost: ~30min. Risk: none found in 30-min soaks.

## CH-2 (keystone) — Rating drives traffic; success bonuses raised so the flywheel can spin.

- **Hypothesis (DEEP-RX FIX 0):** wiring rating→arrivals connects every quality system to
  the customer door. **Confirmed, with two mandatory amendments measured:** (a) without
  CH-1 the flywheel only spins DOWN (every station rates 0 → permanent −70% traffic —
  death spiral); (b) without a bonus-inflow raise, rating cannot rise even on a perfect
  station (max measured inflow ≈ +9 per 30 min at 0.08/meal).
- **Exact change:**
  1. `sim.ts:7921` `const averageDelay = state.cycleDuration / intensity;` →
     `const averageDelay = (state.cycleDuration / intensity) * clamp(1.7 - state.metrics.stationRating / 60, 0.55, 2.2);`
     (rating 70 ≈ 1.03x baseline; 100 → 0.55x delay ≈ +80% attempts; 30 → 1.2x slower;
     0 → 1.7x slower. Slider stays as a cap.)
  2. `sim.ts:12493` mealService bonus `0.08` → `0.5`; `sim.ts:12716` successfulExit
     `0.03 : 0.015` → `0.25 : 0.12`.
- **Measured result (30-min runs, CH-0/1/3 active, 4 zones):**

| run | rating path | vis/min | served | profit/min |
|---|---|---|---|---|
| keystone ON, good station | 70.8 → 89.9 (m6) → **100 (m12), holds** | 5.43 | 136 | **+36.7** |
| keystone OFF (control) | same climb (bonuses) but no traffic effect | 4.87 | 127 | +31.6 |
| keystone ON, broken kitchen | **4.8** | **3.03 (−44%)** | 6 | **−6.2** |

- **Why it fixes fun:** the downside is the product — run your station badly and customers
  visibly stop coming while wages bleed you (−6.2/min); run it well and the first 12
  minutes are a felt 70→100 reputation arc with a growing ship stream. Quality finally
  reaches the wallet and the door. Cost: ~1h + tuning. Risk: upside is capacity-capped
  (+11% at 4 zones) — correct behavior (growth pushes you to build the next zone), but
  keep the 0.55 floor/2.2 ceiling clamps to prevent spirals.

## CH-3 — Economy knife-edge: wages that can lose, payouts that reward service.

- **Hypothesis:** with income ~4/min, costs ~0.5/min and T2 at 500 earned, the early game
  is a 2-hour timer; raising stakes so profit sign tracks play quality turns waiting into
  earning.
- **Exact change:**
  - `sim.ts:279` `PAYROLL_PER_CREW = 0.32` → **1.0**
  - `sim.ts:12266` payout `(3 + taxRate * 8)` → **`(9 + taxRate * 10)`**
  - `sim.ts:12613` vending `dt * 0.42` → `dt * 0.15`; `sim.ts:12635` cantina `dt * 0.85`
    → `dt * 0.30` (shift income from passive drips to served meals/exits)
  - HUD: surface `metrics.creditsNetPerMin` (already computed `sim.ts:14872`, already
    formatted at `main.ts:6939`) on the always-visible top bar, not the details drawer.
- **Measured result (20-min runs, CH-0/1 active):**

| station | payroll/min | profit/min |
|---|---|---|
| default 1-zone, traffic 1 | 16.0 | **−6.9 (bankrupting)** |
| expanded 4-zone | 16.0 | **+24.3** |

  Measured sign flip at the knife value 1.0 (at 0.6: +3.25 vs +31.8 — differentiated but
  bad stations still float). T2's 500-credit gate: reached in **~11-12 min of good play**
  (vs ~2 h baseline). If bankruptcy-into-death-spiral proves harsh in playtest, add the
  soft floor (dock subsidy at 0 credits, −rating) — wiring: `applyCrewPayroll` deficit
  branch `sim.ts:14281-14287`, which already exists and already raises `incidentHeat`;
  surface it as an alert ("wages unpaid — crew unrest") instead of silent heat.
- **Why it fixes fun:** profit/min becomes the moment-to-moment scoreboard every tycoon
  runs on; the unlock ladder becomes a skill clock. Cost: ~1h + threshold retune pass on
  `content/unlocks.ts` T2-T5 credit constants.

## CH-4 — Make dock zones the visible, prompted demand lever; retire the traffic slider.

- **Hypothesis:** dock zones already scale demand (measured 1.3→3.5 vis/min) but are
  unprompted and unexplained; the slider is inert (measured) and actively harmful
  (timeout bleed). Surfacing the real lever gives the early game its expansion decision.
- **Exact change (UI/content only, sim already correct):**
  1. `content/unlocks.ts` Tier-1 description → mention capacity: "Add lounge and market —
     and a second dock zone for more traffic."
  2. `main.ts` dock tool tooltip + dock inspector: "each separate dock zone berths ONE
     ship at a time" (the `docks.length` and per-zone occupancy are already in state).
  3. Replace the Traffic-rate slider row (`main.ts:259`) with a read-only forecast
     ("arrivals: ~N/min — limited by dock capacity / rating"), keeping
     `shipsPerCycle` as an internal cap constant.
- **Measured result:** zones 1→4 = visitors/min 1.30→3.50, and with CH-2 the arrival rate
  becomes rating-responsive on top; the slider's measured contribution is nothing (Finding
  2), so removing it costs nothing.
- **Why it fixes fun:** "build the next berth" is the natural first expansion goal and the
  thing success pressure (CH-2) pushes on; today players can max a fake slider and learn
  helplessness. Cost: ~1-2h UI.

## CH-5 — Cut the tax slider from the early UI (subtraction).

- **Hypothesis:** tax is presented as a trade-off dial but is monotone one-way at early
  scale, i.e. not a decision.
- **Measured:** original formula — tax 0.35 strictly dominates 0 (+29%, zero cost: fails
  0 vs 0, rating identical). With CH-3's payout rebalance — tax 0 strictly dominates
  (36.3 / 32.5 / 25.3 profit at 0 / 0.35 / 0.6); widening the penalty clamp floors
  (0.35→0.05) does not create an interior optimum (22.9 at 0.6). The counter-pressure
  channel (tax→patience→bail, `sim.ts:12001`) cannot bind while bails ≈ 0 at feasible
  capacity.
- **Exact change:** hide the tax slider until a later tier (residents/T4, where
  satisfaction consumers exist); default `controls.taxRate = 0.2`. One-line UI gate in
  `main.ts` COMMAND panel.
- **Why it fixes fun:** a dial that always has one right answer teaches the player that
  dials are fake. Fewer, real dials. Cost: minutes.

## CH-6 — Layout: no new wiring needed once CH-0..CH-2 land — but soften the air cliff.

- **Correction of pass-2:** my "−2.4%, layout doesn't matter" A/B compared two
  dead-crew stations (both arms had suffocated by min 4 — degenerate regime).
- **Measured on the repaired stack (alive crew, keystone on):** compact +35.5 profit/min;
  +6 tiles of corridor +26.2/min (**−26%**, via slower visit cycles → lower rating inflow
  → fewer arrivals — the flywheel converts distance into money already); +14 tiles =
  **46 deaths in 8 min** (air-coverage cliff).
- **Exact change:** none required for the gradient (it emerges). For the cliff: either the
  graded-air option in CH-0, or minimum: render the existing Air-Coverage overlay's
  "disconnected" tint automatically when painting a room whose tiles fall in the red band
  (the diagnostic exists; auto-show it during build). DEEP-RX FIX 1 (walk→spend direct
  wiring) is NOT needed in v1 — measured as emergent — keep it in the drawer.
- **Why it fixes fun:** placement now costs/pays visibly (−26% for sloppy layout) without
  a single new mechanic; the only fix needed is making the lethal band visible before it
  kills.

## Bug tickets (repro'd, not design):
1. **Priorities preset inert** — `--preset food-chain` bit-identical to default in the
   16-crew stall repro. Either weights don't reach the failing path or preset application
   is broken. (`CREW_PRIORITY_PRESET_WEIGHTS` `sim.ts:3464`.)
2. **Payroll-deficit heat is invisible** — `sim.ts:14286` raises `incidentHeat` with no
   surfaced cause; pass-2's "109 incidents, zero drama" partly = unpaid-wages heat.
3. **Material auto-importer spends silently** (default-on; ~140 cr in one pass-2 run) —
   needs a ledger line, or default-off until a Logistics unlock.

---

# PART 3 — SEQUENCE & THE PREDICTED FIRST 15 MINUTES

Ship order: **CH-0 → CH-1 → CH-3 → CH-2 → CH-4 → CH-5/6** (CH-2 before CH-4 is fine too;
CH-2 without CH-1 is a measured death spiral — never ship alone).

Measured expectation for a new player after the stack (all numbers from the C/G runs):
min 0-4 build the opening; min 4-8 first profit ticks (+3-5/min), rating climbing ~75-90,
arrivals visibly thickening; min 8-12 rating ~100, dock queue full → build zone 2 (the
game now *asks* for it), payroll bites if they over-hired; min 12 T2 unlocks **because
they played well, not because they waited**. A mismanaged station in the same window:
wages −7/min, customers thinning, rating ~5 — legible, fixable, felt.

---

# APPENDIX A — key run table (all 30 min unless noted, seed 1337)

| run | config | vis/min | served | profit/min | rating end | deaths |
|---|---|---|---|---|---|---|
| base-t1 | stock sim, owner opening, 8 crew | 1.30 | 27 | +3.34 | 0 | 8* |
| base-t3 | + slider 3 | 1.20 | 26 | +3.31 | 0 | 8* |
| forced90 | + rating pinned 90 | 1.20 | 26 | +3.31 | (90) | 8* |
| zones2..4 | separate dock zones | 2.17→3.50 | 29 | +4.0 | 0 | 8* |
| stove 0.10 / 0.03 / 0.02x2 | supply nerfs | 1.8/1.6/1.7 | 9 / 3 / 4 | ~+0.1-1 | 0 | 8* |
| LS-test (15m) | + LifeSupport room | 5.0 | 60 | +12.0 | 0 | 0 |
| B-bad / B-good | CH-0/1/3(0.6) stack | 1.4 / 5.0 | 36 / 125 | +3.25 / +31.8 | 0/0** | 0 |
| C-flywheel / C-control / D-broken | full stack ±keystone | 5.43/4.87/3.03 | 136/127/6 | +36.7/+31.6/−6.2 | 100/100/4.8 | 0 |
| G-bad / G-good | payroll 1.0 | 1.4 / 4.85 | 19 / 83 | **−6.9 / +24.3** | — | 0 |
| E tax 0/.35/.6 | rebalanced payout | 5.4 | 91 | 36.3/32.5/25.3 | — | 0 |
| F compact / +6 / +14 | layout, full stack | 5.4/4.4/6.2 | 91/78/1 | 35.5/26.2/0.7 | — | 0/0/**46** (8m) |

\* crew extinct ~min 4 — the "working" numbers are the corpse-station regime.
\** B ran without CH-1 → timeouts still zeroed rating (Finding 2's exhibit).

# APPENDIX B — every exact source coordinate cited

`initial-state.ts:98-146` starter hull/reactor pocket (LS pocket template; no LS painted);
`sim.ts:279` PAYROLL_PER_CREW; `sim.ts:292-293` AIR thresholds; `sim.ts:3297`
reputationSpendMultiplierAt; `sim.ts:3437+` ARCHETYPE_PROFILES spendMultiplier;
`sim.ts:3464` priority presets; `sim.ts:5348` rebuildDockEntities (one ship per zone);
`sim.ts:5945/6018/13842` rating's only functional consumers; `sim.ts:7917-7924`
nextTrafficArrivalDelay (slider-only; patch line 7921); `sim.ts:8060`
scheduleSporadicArrival call (queue gate); `sim.ts:8130` timeout penalty; `sim.ts:10837`
purgeDeadCrewFromAir; `sim.ts:12001` tax→patience; `sim.ts:12266` mealExitPayout;
`sim.ts:12444/12454/12736` patience bail path (0.012-0.05 rating ticks; bail fuse 30 @
1.4/s); `sim.ts:12493/12716` success bonuses; `sim.ts:12613/12635` vending/cantina drips;
`sim.ts:14272-14287` payroll + silent deficit heat; `sim.ts:14872` creditsNetPerMin;
`main.ts:259` traffic slider row; `main.ts:859-862` starter dock painting;
`main.ts:6939` economy flow line; `main.ts:6970` buried death readout;
`content/unlocks.ts:38-130` tier predicates & texts; `balance.ts:446-453` PROCESS_RATES.

# APPENDIX C — sim-tune patch list (compiled-JS sed targets used for measurement)

1. `balance.js` PROCESS_RATES hydro/stove → env HYDRO_RATE/STOVE_RATE
2. `sim.js` PAYROLL_PER_CREW → env PAYROLL
3. `sim.js` mealExitPayout base/mult → env PAYOUT_BASE/PAYOUT_TAX
4. `sim.js` ship-timeout penalty → env TIMEOUT_PEN
5. `sim.js` arrival delay × rating factor when RATING_TRAFFIC=1 (the CH-2 line)
6. `sim.js` success bonuses → env MEAL_BONUS/EXIT_BONUS
7. `sim.js` vending/cantina drips → env VEND_RATE/DRINK_RATE
8. `sim.js` tax clamp floors → env TAX_FLOOR/TAX_FLOOR2
9. `sim.js` queue gate on scheduleSporadicArrival when QUEUE_GATE=1
