# Checklist Takeover — Handoff

Date: 2026-07-28
Branch: `codex/structural-frontage-occupant-loop`
Checklist: `docs/39-structural-frontage-execution-checklist.md`

**Progress this session: 405/551 (73.5%) → 490/552 (88.7%).** 111 commits ahead of
`main`. Working tree clean; app typecheck clean.

The row count went from 551 to 552 because one new row was added
("Keep every runner on disk reachable from a package script"), and three rows were
reworded rather than checked. Both are explained below.

---

## 1. Where the work was, and the first thing to know

The real work was **not** in the worktree it was started from. It was uncommitted
in the main repo on `codex/structural-frontage-occupant-loop`. Worse, the branch
tip did not compile: `src/sim/sim.ts` imported `planStructuralPieceConstruction`
and `validateStructuralPiecePlacement` from a `construction.ts` that existed only
as an uncommitted working file. The first commit of this session (`796a2f7`)
landed that work and made the branch buildable again.

If you pick this up: **work in `/Users/ryan.boye/code/space-station-game` directly.**

---

## 2. What was done

### Defects found and fixed

| Defect | Impact |
|---|---|
| Supplier orders preferred back-of-house when a receiving node merely *existed*, not when it had free capacity | **Sell Supplies could not be completed from a fresh charter.** The starter's one Intake Pallet ships full, so every order was refused. Bisected to `6fc92a5` |
| Charter screen and in-station Site Brief recommended **different leading services for the same site** | Only the Charter screen passed the SystemMap to the forecast |
| Site Brief was painted *underneath* the bottom dock | Real text, completely unreadable. Found with `elementFromPoint`, not by looking |
| Starter shipped its Dorm, Hygiene and Reactor zoned **public** | Crew sleep read `8/6` at t=0 and collapsed to `0/6` once visitors arrived, while the station reported "No crew quarters" with four bunks on the map |
| Dead actors never released facility slots | A corpse held its stool, bed or register until a 60-120s TTL expired. Four death sites, not the three first identified |
| `rating.penalties.residentDeparture` parsed through `nonNegative` while accumulated as a **signed** value | Every departure penalty silently clamped to 0 on load. A resumed station could not explain part of its own rating |
| `test:gate-e-save-resume` was RED | Scenario fixture predated the Truss Junction rule and searched deep space for a scaffold |
| Blocked structural expansions were **silent**, and deleting their shells caused a latent phase-regression rebuild loop | Fixing the label removed the loop |
| Missing-frame fallback returned idle on the first unpainted variant | Hid an `active` frame that existed |
| Residents could be at breaking point and still clock in | Work leg was clock-driven, gated only on a critical need |

### Systems added or completed

- **The Berth is now a capital commitment** (medium 600c, large 1500c, small 0c).
  It was free — `setRoom` debited nothing.
- **Structural planning overlay** — supported / planned-support / overloaded /
  unsupported. The data existed and the renderer read none of it.
- **Interface diagnosis reaches the world** — `implicatedTile` had been carried
  forever and thrown away at the render boundary.
- **Per-fixture economics** — power, cleaning and maintenance now scale with the
  fixture instead of the room.
- **Operations moved to the fixture** — anchored market shop, per-interface berth
  cards, projected load inside the admission card.
- **Four Phase 0 metrics** counted from real event sites: queue spill, balks, door
  wait, reception timing, EVA seconds.
- **Rating reconciles** — residual asserted at zero live *and across save/resume*.
- **Render is measured for the first time**, and render/sim separation is proven
  by snapshot hashing.
- **Nine orphan runners wired**; five Phase 0 comparison fixtures added.

---

## 3. What is remaining — 62 rows

### 3a. Needs art — 5 rows, 8 PNGs. **This is a commission, not a task.**

Sprite generation **cannot be done in this repo**. The generators were deleted in
`30fc12c` ("revert(sprites): restore curated baseline atlas, rip out generator
pipelines"), the `sprites:generate:*` scripts every `sprites:build:*` depends on
no longer exist, and there are no credentials.

Fabrication was ruled out on measurement, not principle: curated variants differ
from their base frame by **63-79% of pixels** — they are independent renders that
express state through depicted content (meals appearing on pads, goods removed,
staff posts replaced), not tints. A procedural composite would read worse than
idle.

**The eight frames needed**, all listed in `PENDING_FACILITY_SPRITE_FRAMES` in
`src/render/facility-sprite-state.ts` with sizes and generation prompts already
staged in `tools/sprites/`:

| Fixture | Frames needed |
|---|---|
| CheckoutBank | `.active`, `.unstaffed`, `.dirty` |
| ShelfAisle | `.active`, `.empty`, `.dirty` |
| BunkBank | `.active`, `.dirty` |

The **truth derivation for all three is already done and tested** — the sim knows
when they are occupied, unstaffed, empty and dirty. They render idle only because
no frame exists. Drop the PNGs in and the states light up.

Separately, `damaged` art is missing for StandingRail, GuestCabin, ArrivalDesk,
CheckoutBank, ShelfAisle and BunkBank. All 14 fixtures now *accrue wear*, so the
state is reachable for the eight that have art.

### 3b. Needs a playthrough — 11 rows

Ten of the eleven capabilities are proven deterministically by focused runners.
**The gap is play, not mechanism.** I did the opening (bare start, traffic
arrival, save/reload) and recorded it under "User Playtest Record" in the ledger.

What remains needs one long continuous session: a first medium Berth (600c ≈ 36
minutes of operating income), overlapping Pod and Berth traffic, a harmful route
separated, hull damage recovered, admission automation switched on, and 50-crew
scale.

**Play against a frozen build**, not the dev server — `npm run build` from a clean
`git archive`, then `vite preview`. HMR resets the run otherwise.

### 3c. Needs your judgement — ~8 rows

"Desired baseline station remains smooth and readable", "Record user feedback
against exact checklist items", "Provide the tools to improve that layout in
world". Smoothness is measured; readability is yours.

### 3d. Genuine implementation — ~38 rows

Largest clusters:
- **Spatial capacity (2)** — every tile has flat capacity 1. A one-tile corridor
  and a twenty-tile hall are physically identical. No width or room-type input
  exists.
- **World feedback (3)** — ship purpose and visit phase are berth-only and
  docked-only; cohort size and stay ranges are shown as exact values, never
  ranges; no small-screen hideability.
- **Large functional modules (1)** — Display / Cold Case 1x3 does not exist. Can
  reuse the ShelfAisle browse machinery wholesale.
- **Physical cargo (1)** — **luggage is entirely absent** from `ItemType`. The
  only trace is an unused sprite key. Meals, stock, supplies and freight are all
  already visible carried objects.
- **Shared docking slot (1)** — `state.dockQueue` is a second, unmerged holding
  queue with its own timeout and telemetry, rendered as a separate lane strip.
- **Structural art (2)** — no scaffold/floor/wall/seal/pressurizing construction
  art; assets unverified at gameplay size in the live renderer.

---

## 4. Bugs found but deliberately NOT fixed

These are real and were left alone rather than rushed. **In priority order:**

1. **Both authored 50-crew stations vent most of their interior at t≈156s and
   lose 33-37 crew to vacuum.** Reproduced against pristine HEAD — pre-existing
   and geometry-independent. Exterior wear crosses its breach threshold faster
   than the repair loop closes it. The 240s runner never noticed because it
   asserted nothing about air.

2. **`metrics.leakingTiles` reads 0 while 733 interior tiles are in vacuum.**
   `computePressurization` exempts anything reachable from an Airlock, and the
   compact station owns exactly one. The spine station owns none and reports 753
   for the same event. **The metric lies on exactly the station shape most
   likely to ship.**

3. **A reachable stack overflow.** `ensureDockEntitiesUpToDate` claims its cache
   version *after* `rebuildDockEntities` returns, but that call re-enters it via
   `chooseDockFacingForPlacement` → `getDockByTile` → `ensureDockByTileCache`.
   Two **adjacent** Dock tiles belonging to different docks recurse until the
   stack blows. Reproduced in a fixture.

4. **Progression runs on wall clock.** `shouldRefreshDerivedMetrics` uses
   `perfNowMs()` and gates `computeMetrics`, `updateUnlockProgress` *and*
   `updateOpeningCapitalProjects`. Three functions below it, `roomOpsRefreshDt`
   carries the comment "must be a function of simulation time, never renderer or
   machine throughput" — the contradiction is literal and adjacent. Measured: 50
   ticks in under 250ms of wall clock produced **zero** derived refreshes, so an
   accepted capital project whose conditions were met was never awarded.

5. **Target-scale visitors never eat.** At 2.1x footprint, 17 visitors carried a
   meal plan and all 17 left unfed while the apron was a fully qualifying public
   cluster with free queue chains. They route to the dock ~20s after arrival
   instead of joining an available line. Fix is in the serving-line join path.

6. **The market showcase never stresses its own bottleneck.** Backroom stock sits
   at exactly `90.0` for 300s in *both* layouts, so the authored
   restock-crossing-frontage conflict never runs. Demand is a single burst capped
   by initial shelf stock (6 units vs 12), so the compact market cannot generate
   more than ~6 checkout events and its queue never fills. Abandonment comes out
   **backwards** in all five configurations tried. This is why "one checkout
   visibly becomes overwhelmed" is still open.

7. **Two dead ceilings.** The environment rating cap is `min(0.24, d * 0.018)`
   with `d` clamped to 8 → real max `0.144`. Sanitation is
   `min(0.18, (dirt-32) * 0.0014)` needing dirt 160.6 while every write clamps to
   100 → real max `0.0952`. They read as tuning levers while having no effect on
   any reachable state.

---

## 5. Open questions and decisions for you

**Balance calls made this session that want a playtest opinion.** All are
documented in place with their derivation:

- **Medium Berth at 600c.** Derived: a fresh station holds 320c so it is 280c
  short buying nothing, 2.2-2.6x the cheapest opening business, 1.2x the 500c
  opening goal, ~36 minutes of operating income. This is the number most likely
  to be wrong by feel.
- **Per-tile power class rates** (0.030 / 0.0175 / 0.0075). Already halved once to
  keep the guest wing under the 90.9% load ceiling.
- **Per-position cleaning rates**, and the 41% Community-Table premium over the
  same seating in compact tables.
- **Maintenance at 4c + 0.18c per wear point**, bracketed so worst-case repair
  (20.6c) stays under half the cheapest wearing fixture (45c Bar End).
- **The 2.5x-8x price ladder band.**

**Design questions:**

1. **Should residents move onto the shared occupant-demand engine?** A shared
   engine exists and every visitor tenure uses it, but residents were never
   migrated and still decay on their own rates. Two engines exist. My position:
   keep the rate tables distinct (resident needs are hour-paced, visitor needs
   minute-paced) but unify the decay/selection machinery with rates as
   parameters. **Row deliberately left open** rather than reworded to fit.

2. **Reword or play the 50/50 rows?** "Reach at least 50 crew and 50 simultaneous
   visitors" and "Operate at least 5-10 mixed interfaces" are proven **as seeded
   fixtures**, never as something grown from the bare starter. Reword to "operate
   at" (already true and provable) or commit to a long growth session.

3. **The alert copy is wrong.** `Crew quarters short ... add bunks or beds` names
   the wrong remedy when the cause is zoning. Left alone because it is copy, not
   behavior.

---

## 6. Rows reworded rather than checked, and why

Rewriting a row in an audit ledger is a bigger act than checking one, so each is
recorded with reasoning in the ledger:

- **"No naive universal one-actor-per-tile cap"** — was literally *false*; the
  coordinator does enforce tile exclusivity. But not naively: swaps, door yields,
  3-cycle yields, sidesteps, bounded replan. A hard cap was rejected precisely
  because it deadlocked busy doors. Row now states the guarantee the code makes.
- **"Update congestion fields at fixed cadence"** — implemented, measured,
  reverted. `buildOccupancyMap` is 0.1% of tick time, and decoupling it regressed
  gangway throughput at every cadence **including zero**, isolating the cause to
  the decoupling rather than staleness.
- **"Apply rating/faction effects"** — faction standing does not exist. `Faction`
  is `{id, templateId, displayName, color, shipBias}` and the only reputation in
  the sim is zone-scoped. Faction struck; rating half proven.
- **`system-flow-map.html`** — untracked with no history, so "untouched" had no
  baseline. Pinned by
  `sha256 20cb6f7e8ea5150931aa1417faf221d3f9a2408a658d515280eca22bd02c8cb7`
  (37,025 bytes), verified unchanged at handoff.

---

## 7. Test suite state

**Green and load-bearing:** `test:gate-f-facility` (16/16),
`test:gate-e-save-resume` (6/6), `test:gate-g-metrics-admission` (13/13),
`test:commitment-recovery` (11/11), `test:berth-capital` (5/5),
`test:facility-sprite-state` (5/5), `test:structural-pieces`,
`test:charter-forecast`, `test:movement-coordinator`, `test:queue-spill`,
`test:saturation-caps`, `test:opening-procurement`, `test:opening-businesses`,
`test:normal-scale-operation`, `test:sanitation` (8/8), `baseline:frontage`.

**Known red, all pre-existing and diagnosed:**

- **`test:sim`** — the full suite. Aborts on first failure, so its damage was only
  ever visible one test at a time. It died at the 3rd of **194** test calls; it
  now reaches the 28th. **No genuine regression was found** in any of the eight
  repaired — every failure traced to a commit that deliberately states the change
  (hull carved back, Table repriced 40→80, Truss Junction rule, Tier 3 gate moved,
  Storage starter-overridden). ~166 have still never executed. This is a campaign.
- **`test:port-ops`** — fails on "eligible ship waiting in holding orbit".
- **`test:truth`** — holds at 5 known failures, unchanged all session.
- **`npm run test:harness`** — 17 passed / 18 failed. All 18 are selector drift,
  not behavior: `ui-smoke` clicks `#toggle-zones` and friends directly but those
  now live behind the Overlays palette tab, and `port-ops-v1`'s six stale specs
  expect three offer cards from `?scenario=starter` when manual offers now require
  a Berth the starter lacks.

**Gotchas that cost real time — worth knowing before you start:**

- `requestAnimationFrame` does **not** run in the headless browser tab. The DOM
  and canvas only update after a screenshot forces a frame, which makes clicks
  look like they missed.
- The shared `tsconfig.simtest.json` compiles all of `tools/` together, so one
  broken tool file fails **every** `test:*` script.
- Vite serves modules with a `?t=<hash>` suffix, so importing a module path from
  the console yields a *second* instance whose state never reaches the renderer.
- `npx tsc --noEmit` rewrites `tsconfig.tsbuildinfo`, which Vite watches, forcing
  a full page reload mid-verification.

---

## 8. The standard this ledger is held to

A box may only be checked when the behavior exists in the game **and** the
evidence is recorded. Two habits are worth continuing:

- **DOM presence is not visibility.** Use `elementFromPoint`. One row was ticked
  this session on DOM evidence, then reverted when the Site Brief turned out to be
  painted under the bottom dock, and stayed open until the layout was fixed.
- **A runner's name is not proof.** Read the body.
  `testMilitaryShipPenalizesLowSecurity` compared 0 against 0 for both arms and
  never departed its ship.

Deliberate refusals are legitimate outcomes and several are recorded: the
congestion cadence was measured and declined, sprite frames were not fabricated,
"one checkout visibly becomes overwhelmed" was left open because the fixture
proved the claim backwards, and faction standing was not invented to satisfy a row.
