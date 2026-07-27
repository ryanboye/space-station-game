# Gate 0 and Gate 1 Implementation Handoff

Status: returned for lead review
Branch: `claude/station-portfolio-packages-4a1273`, branched from `main` at `a6fa551`
Date: 2026-07-26

Covers TRUTH-01 through TRUTH-05 and OPEN-01 through OPEN-04 from
`08-implementation-packages.md`. All nine packages are implemented and committed
separately. Nothing is half-landed.

This document is the gate return that `08-implementation-packages.md` asks for,
plus the reasoning behind the judgment calls, the things I am unsure about, and
the ideas I noticed but did not act on.

---

## 1. What shipped

| Commit | Package | Changed files |
|---|---|---|
| `3936d67` | TRUTH-01 fresh game isolation | `src/sim/save.ts`, `src/main.ts`, `package.json`, `tools/opening-truth-tests.ts` |
| `ccb4e65` | TRUTH-02 service completion integrity | `src/sim/service-truth.ts` (new), `src/sim/sim.ts`, `src/sim/types.ts`, `src/sim/save.ts`, `src/sim/initial-state.ts`, `src/main.ts` |
| `e245cb2` | TRUTH-03 inventory and meal reconciliation | `src/sim/sim.ts`, `src/main.ts`, `src/sim/index.ts` |
| `aa79296` | TRUTH-04 economy and settlement reconciliation | `src/sim/opening-economy.ts`, `src/sim/sim.ts`, `src/sim/balance.ts`, `src/sim/expansion.ts`, `src/sim/types.ts`, `src/ui/opening-economy-panels.ts`, `src/render/dock-economy-feedback.ts` |
| `67baaf2` | TRUTH-05 capacity and diagnosis | `src/sim/initial-state.ts`, `src/sim/sim.ts`, `src/sim/construction.ts`, `src/render/render.ts`, `src/main.ts`, `src/sim/types.ts` |
| `66eee7c` | OPEN-01 commercially empty starter | `src/sim/initial-state.ts`, `src/sim/balance.ts`, `src/sim/sim.ts` |
| `bf6f9d3` | OPEN-02 demand and missed opportunity | `src/sim/pod-demand.ts` (new), `src/sim/sim.ts`, `src/sim/types.ts`, `src/sim/save.ts`, `src/main.ts` |
| `ec41b84` | OPEN-03 recipe-oriented build catalog | `src/sim/opening-recipes.ts` (new), `src/main.ts`, `src/styles.css`, `.claude/launch.json` |
| `d6a965e` | OPEN-04 opening balance pass | `src/sim/balance.ts`, `src/sim/opening-recipes.ts`, `src/sim/sim.ts`, `src/main.ts` |

Three new pure-domain modules follow the `opening-economy.ts` precedent — plain
data, no `StationState` mutation, so simulation, UI and checks share one contract:

- **`src/sim/service-truth.ts`** — the canonical completed-service event and the
  fixture rules that decide whether a tile can physically deliver a service.
- **`src/sim/pod-demand.ts`** — per-call record of what was wanted, what was
  served, and what the shortfall was worth.
- **`src/sim/opening-recipes.ts`** — the three opening businesses as recipes,
  evaluated against what is physically on the station.

### Package detail

**TRUTH-01.** Saved unlock state is now authoritative; content-derived tier is a
fallback for legacy saves that carry no unlock block. Every non-Continue startup
path rebuilds the station from the starter factory plus any stored starter
template (`buildFreshGameState`), and a new run seeds the single autosave slot
immediately (`startFreshAutosaveEpoch`).

**TRUTH-02.** `recordServiceCompletion` is the only way a service completes. It
refuses any tile whose room and module cannot provide the service, and stamps
population, actor, facility identity and originating ship onto the event. Port
promises advance from that event. Attribution and promise credit are separate
flags, so a walk-in stop belongs to the pod that brought the traveller without
ticking a promise nobody made. Crew and resident meals record under their own
population. `Serve visitors` became `Visitors served`, counting distinct visitors
with at least one completed physical service.

**TRUTH-03.** Stock headlines moved into `refreshLocatedInventoryMetrics`, called
from both the running and paused tick branches. `getPreparedMealInventory` is the
one accessor the header, tooltip, alerts and cafeteria summary read.
`buyPreparedMealsDetailed` names its refusal, accepts partial orders at a
proportional price, and `previewPreparedMealPurchase` gives the HUD the same
verdict without mutating.

**TRUTH-04.** Fourteen raw credit mutations now go through
`applyEconomyTransaction`. The category list grew to cover capital resale,
expansion, hiring, research, project advance, project award, contract
settlement, contract procurement, tenant income, penalties, security recovery
and resident tax. Project money no longer feeds `creditsEarnedLifetime`.
Turnarounds settle through `computeSettlementPayout`, a pure function whose two
constants live in `PORT_SETTLEMENT`.

**TRUTH-05.** Starter connectivity fixed (see §5). `getCrewFacilityReachability`
reports per-facility whether crew can physically reach quarters, hygiene and
serving counters. The housing inspector counts every sleeping fixture and reports
slots. Placement previews come from `previewModulePlacement` — the same validator
the build path runs — and print the specific blocker beside the cursor. Alerts
carry a diagnosis sentence and can no longer leave a stale room selection.

**OPEN-01.** Starter lost its Market, Market Stall, Storage room, Storage Racks,
Fuel Tank, Fuel Coupler and one Table, and dropped from eight crew to five plus
the captain. Cafeteria activation changed from two Tables to one (see §6.1).
Crew self-care prioritization fixed (see §5).

**OPEN-02.** Every departing pod files a `PodVisitOutcome`. `getPodDemandSummary`
gives the catalog and first-cycle summary a bounded aggregation. Dock chips gained
the middle of the three lines the package asks for — request, current operation,
result — and price missed demand.

**OPEN-03.** A Businesses tab groups the catalog under the three openings with
steps, running cost, footprint, utilities, staff, stock and recent demand. Steps
are shortcuts to ordinary paint and place tools. Future facilities stay visible
with plain prerequisite copy.

**OPEN-04.** `OPENING_BALANCE` in `balance.ts` is the single home for starting
credits, the pod access fee, the courier handling fee and the three stock
batches. Opening-business hardware is priced explicitly. Recipes price only the
units still missing.

---

## 2. Focused checks

```bash
npm run test:truth
```

New file `tools/opening-truth-tests.ts`, new script `test:truth`. 54 cases, all
passing, one section per package. Coverage includes the missing, blocked, full,
successful and migrated-save cases the shared acceptance gate asks for.

The lead pass also added `test:opening-procurement` and
`test:pod-demand-accounting` for site-adjusted ordering and durable per-visit
results. Both focused checks pass independently.

The TRUTH-01 cases are verified to actually catch the defect: reverting the
`save.ts` hunk fails two of them with `expected 0, got 2`.

Also run and passing: `npm run test:commercial`, `npm run test:sanitation`,
`npx tsc -b`, `npm run build`.

**Pre-existing failures on `main`, not introduced here:**

- `npm run test:port-ops` fails at `testImportedMarketGoodsNeedNoWorkshop`.
  Confirmed failing at `a6fa551` before any change. It now *also* needs
  rewriting, because it builds on the starter Market Stall that OPEN-01 removes.
- `npm run test:site-charter` fails at `testHighLaneTrafficRaisesVolume`.
  Confirmed failing at `a6fa551`.

The full suite (`npm run test:sim`) was deliberately not run during iteration,
per the working rules. It should run at the integration gate.

---

## 3. Save migrations

| Field | Location | Behaviour on older saves |
|---|---|---|
| `serviceLog` | `StationState` | Hydrates to an empty log via `normalizeServiceLog` |
| `openingEconomy.podDemand` | `OpeningEconomyState` | Hydrates to an empty log via `normalizePodDemandLog` |
| `Visitor.serviceCompletionsRecorded` | optional | Absent means zero; visitors are not persisted anyway |
| `PortSettlement.shortfallPenaltyCredits` | optional | Absent on settlements written before this branch |

`grant-award` is retained in `ECONOMY_EVENT_KINDS` so ledgers written before the
project-money split still load. Nothing emits it any more.

The tier-derivation change is a behaviour change for existing saves: one that
carries explicit unlock state keeps its saved tier and logs a warning if its
content sits above it, instead of being silently elevated. This is the
"preserve it deliberately with a warning" branch that ticket 00 permits.

---

## 4. Playtest evidence and observed balance

Browser verification on a fresh chartered start (Vite dev server): recipe catalog
renders in the Businesses tab, clicking *Paint 10 Market tiles* selects the
Market paint tool, Operations reads `Fuel: No tanks`, crew sleep reads `8/6`,
the goal card reads `Visitors served 0/20`.

Measured in headless runs from a clean start:

| Measurement | Value |
|---|---|
| Opening cash | 220c |
| Recipe cost — Feed Travelers | 130c (59% of cash) |
| Base recipe cost — Sell Supplies | 130c before site wholesale adjustment |
| Base recipe cost — Service Ships | 145c before site wholesale adjustment |
| Recommended charter quote | Sell Supplies 127c; Service Ships 141c |
| 1800s no-input after lead fix | 36 pod calls, 0c access income, about 346c payroll, cash 220 → 0 |
| Same run before this branch | cash 260 → 405 |
| Lead no-input demand sample | 36 calls, 52 travellers; meals 0/23, supplies 0/20, ship service 0/17; est. 377c missed, ship service named top opportunity |
| Ticket 09's worst turnaround | 147c net, against 345c for the same call fully served (was 343c either way) |
| Crew after the connectivity fix | hygiene holds above 40 over 1200s, zero improvised rest (was: all eight on the floor indefinitely, energy frozen) |

The no-input result is intentionally not averaged: it is an acceptance sample
showing that idle traffic no longer creates growth. It also exposes the remaining
balance question, because payroll eventually consumes the entire opening stake.

---

## 5. Root causes that differ from the tickets

Three tickets described the symptom accurately and the cause incorrectly. Worth
recording, because the wrong cause would have produced the wrong fix.

**Ticket 00 was not a leak.** New Game did not inherit anything.
`parseAndMigrateSave` elevated a save's tier to the minimum tier that could have
*built* its content, and the authored starter already contained a Storage room
and Storage Racks — both tier-2 catalog entries. Every reload of a brand-new
station came back Tier 2 while its metrics stayed at the fresh run's values,
which is exactly the "mixed state" the ticket describes. There were two real
isolation holes on the startup path as well, and those are fixed, but they were
not the reported symptom.

**Ticket 01 was a layout bug.** Fixture reservations were fine. The authored
starter shipped as two disconnected walkable halves: the Maintenance room's south
door sat at `coreX`, which is the Logistics Stock room's north-west corner wall,
so the station's only link between the public deck and the freight gallery opened
into solid hull. All eight crew spawned on the gallery side with the hygiene,
intake and storage rooms, and could never reach their bunks, the cafeteria or the
docks. Moving the door one tile west onto the gallery corridor makes the station
one network again.

A second, genuinely separate defect surfaced underneath it. The crew self-care
chain is *ordered*, not prioritized, and bladder cycles faster than thirst or
hunger — so crew took a toilet trip every time and never reached the drink or
meal branch. Thirst and hunger fell to zero beside a stocked, reachable counter.
The bladder branch now yields when thirst or hunger is in worse shape.

**Ticket 07's phantom services came from the leisure fallback.** When the service
a passenger wanted has no facility, routing drops them at whatever leisure tile
they can reach, and the dwell timer completed whatever service was still marked
active. A passenger who wanted a drink and idled at the Market Stall completed
`drinks-served`. That is how a berth-only station reported a cantina and a lounge.

---

## 6. Judgment calls, and why

Everything in this section is a decision I made that the documents did not make
for me. §6.1 needs a ruling; the rest are stated so they can be overturned
cheaply.

### 6.1 Cafeteria activation: two Tables became one — needs a ruling

OPEN-01 asks for a crew food buffer **and** no completed Cafeteria. The engine's
minimum operating Cafeteria was 12 tiles, one Serving Station and two Tables —
byte-for-byte Choice A's minimum recipe. There is no starter that satisfies both
sentences.

Options considered:

1. **Ship the minimum operating Cafeteria.** Violates "no completed Cafeteria"
   and hands the player Choice A pre-built.
2. **Ship no Cafeteria.** Crew cannot eat at all; they starve within minutes,
   which breaks "safe briefly" and invalidates the commerce-only and
   engineering-only playthroughs.
3. **Invent a crew-only food source.** A new mechanic nobody asked for.
4. **Lower the activation requirement.** Chosen.

Reasoning: a counter and somewhere to sit is a working mess. A second table is
throughput, and shared contract C3 explicitly asks capacity to come from fixtures
rather than a room-wide on/off switch — an activation threshold that flips a room
between "serves nobody" and "serves everybody" is the thing C3 argues against.
The starter mess is the minimum: twelve tiles, one counter, four seats, thirty
crew meals. Choice A remains a real build on top of it — a second Serving
Station and a second Table for eight seats. The crew reserve already satisfies
the 12-meal operating-readiness floor while it remains stocked.

**The cost:** this is a balance constant affecting every Cafeteria in the game,
not just the starter, and it makes Choice A read as "expand the mess" rather than
"build a cafeteria". If that reads wrong in play, the alternative is option 3 and
a new crew ration mechanic. Please rule.

### 6.2 The `Visitors served` metric definition

Ticket 13 explicitly delegated this: "decide whether the goal means unique
visitors served, visitor meals completed, or any completed visitor transaction,
then name it accordingly."

Chose **unique visitors who completed at least one physical service**, named
`Visitors served`. Reasoning: it is the only definition that reads the same for
all three openings. Visitor-meals would have made the goal a hospitality goal
wearing a neutral name, which is the failure mode the ticket is about.

### 6.3 Retail counts as a completed service

`ServiceKind` gained `retail` alongside the six hospitality kinds. A stall sale is
a completed physical session — located stock left a real fixture for a real
traveller — and without it a commerce-only opening could not advance the visitor
goal at all. It advances no berth promise.

### 6.4 The settlement shortfall curve

Ticket 09 asked that missed promises reduce payout and that severe failures be
"marginal or negative without causing an instant death spiral", and gave no
numbers. Chose 85% of the settled payout at risk in proportion to unserved
promised work, floored at −25% of gross.

Reasoning: the ticket's own worst observed turnaround is the calibration point.
It paid 343c; it now pays 147c against 345c for the same call fully served. That
is "materially more net profit for a high-service turnaround" without making one
bad call fatal. The floor exists so a station that is failing cannot be pushed
into an unrecoverable spiral by a single call.

### 6.5 Missed-demand unit prices

`01-player-authored-opening.md` gives a band for a whole visit (10–30c gross), not
per-unit values. Chose food 6c, supplies 5c, ship service 9c per unit,
deliberately matching what the served path pays, so "est. 18c missed" is a
forecast of the player's own prices rather than an invented incentive.

### 6.6 The OPEN-04 numbers

The doc gives the target (one recipe at 55–70% of cash, two not affordable at
once); the individual figures are mine: 220c opening cash, Table 40c, Serving
Station 25c, Market Stall 50c, Fuel Tank 60c (was 150c), Fuel Coupler 35c (was
75c), stock batches 70c / 80c / 50c, courier handling 2.5c → 1.5c per unit.

Table, Serving Station and Market Stall previously had no explicit `capitalCost`
and fell through to a footprint estimate, which is why a fuel tank cost six times
a market stall. Pricing them explicitly is what makes the three recipes
comparable.

The courier fee cut is the one that changes an existing loop. Courier handling is
real physical work and belongs in the Trade portfolio, but the Freight Locker is
*starter* equipment, so at 2.5c/unit a station that built nothing earned 240c of
handling fees — which directly contradicts "access fees cannot finance growth".
At 1.5c it stays a real trickle without funding a business.

### 6.7 The Maintenance bay stays in the starter

Choice C's recipe includes "paint at least 6 Maintenance tiles", so arguably the
starter should not have one. I kept it — it is shared infrastructure for a
station with docks, it houses the fuel-coupler service doors, and it is load
bearing for the station's only deck-to-gallery corridor. Only the Fuel Tank and
Fuel Coupler were removed. **Consequence:** Choice C opens with one step
pre-satisfied.

### 6.8 Storage and Storage Racks removed

Not on OPEN-01's exclusion list, but they are tier-2 catalog entries and were the
direct cause of the TRUTH-01 tier inflation. Removing them also opens the
south-east gallery as build apron. If Storage is wanted in the starter, the tier
table is the thing to change, not the starter.

### 6.9 Presentation modules took a string alias for economy categories

`opening-economy-panels.ts` and `dock-economy-feedback.ts` each kept a hand-copied
union of the economy categories. Adding eleven categories would have meant
editing three lists that can silently disagree. They now take a documented
`string` alias. This trades a little type safety in the UI for the guarantee that
the copies cannot drift.

### 6.10 Crew count

Five general crew plus the captain, six total. OPEN-01 says "four to six general
crew", which reads either way. Six total is inside the band on both readings.

---

## 7. Concerns and open questions

**Crew self-care is still fragile.** The prioritization fix stops bladder starving
the later needs, but the chain remains ordered rather than genuinely prioritized —
it picks the first need past its threshold, not the worst one. A proper fix is to
score needs and take the minimum, which is a real change to crew AI and felt out
of scope for a Gate 0 truth package. Related: in a no-input run the crew meal
buffer is consumed by travellers within roughly five minutes, after which crew
decline. That may be exactly the intended opening pressure, but it should be a
deliberate decision.

**I broke something, reverted it, and never explained why.** I converted the
toolbar's per-button click listeners to event delegation so dynamically rendered
recipe steps would work. It compiled; the handler provably received the click with
a correct `closest()` match; and tool selection stopped working entirely,
including for buttons that had worked a moment earlier. I reverted to per-button
binding and gave recipe steps their own delegated listener, which works and is
verified in the browser. **I do not know what the delegation broke**, which means I
cannot promise the same hazard is not present elsewhere in the toolbar wiring.
Worth someone's fresh eyes.

**Crew and resident hygiene are not in the service log.** Crew and resident *meals*
record as completions; their restroom and hygiene sessions do not. That is
consistent — the log's purpose is visitor-facing truth plus the population split
the visitor goal needs — but shared contract C1 says needs should consume the same
completion event, so this is an incomplete corner.

**Two commits carry incidental changes.** `dist/index.html` is gitignored but
tracked, so `npm run build` swept it into `ec41b84` and `d6a965e`. I also added
`.claude/launch.json` to run the dev server. Both are trivially strippable with an
interactive rebase if unwanted.

**`test:port-ops` needs a rewrite, not just a fix.** Its
`testImportedMarketGoodsNeedNoWorkshop` case was already failing on `main`, and it
depends on the starter Market Stall that OPEN-01 deliberately removes. It should be
rebuilt around a player-built stall, which is arguably a better test anyway.

**No three-run acceptance playthrough was performed.** OPEN-04's acceptance asks
for three clean playthroughs — hospitality-only, commerce-only, engineering-only.
I verified the preconditions (each recipe affordable and in band, no path's demand
multiplier closed off by any charter, unbuilt services completing zero) but did not
sit through three full runs. That is the obvious next validation.

---

## 8. Ideas noticed but not acted on

Recorded rather than implemented, because each is outside the nine packages.

**The starter layout deserves a rewrite, not more patches.** The current shell is
an L-shape whose rooms were painted over each other in sequence, so later rooms
carve walls through earlier ones — the cafeteria's boundary cuts the top row off
the Logistics Stock and Storage rooms, and the west deck column is a blind
corridor that exists only because the dorm walls it off. The connectivity bug was
one symptom. A layout with pods hanging off a spine and two or three deliberate
corridors would be more legible, would give OPEN-01 a real apron, and would make
the connectivity check in §2 boring instead of load-bearing.

**`getCrewFacilityReachability` wants to be an overlay.** It already computes
which crew can reach what. Rendering it as a lens would turn "why is nobody
using this room" into a glance, and would generalize to visitors for OPEN-02's
missed-demand story.

**The service log can drive the settlement report directly.** Right now the report
reads promises, which now read the log. Reading the log itself would let the
report name the *facility* that served each promise — "6 drinks at the Cantina,
2 missed" — which is what "every reported completion can be traced in diagnostics
to a service fixture" is really asking for.

**`PodVisitOutcome` is the natural home for the first-cycle summary.** OPEN-02
asks for one and I did not build it; the data is all filed and bounded, so it is
a presentation slice on top of `getPodDemandSummary` rather than new simulation.

**Recipe steps could carry their blocker.** The catalog says a step is unfinished;
`previewModulePlacement` knows *why* a placement would fail. Wiring the two would
let a step read "no room with power" rather than "0/1", which is the same move
TRUTH-05 made for the placement ghost.

**Room activation is still an on/off switch in several places.** The Cafeteria
change in §6.1 is one instance of a general shape: `ROOM_DEFINITIONS` gates a room
between fully working and fully dead on a module count. Contract C3 wants
throughput to degrade with capacity instead. Worth a pass before Gate 2 adds more
rooms to the pattern.

---

## 9. What this unblocks

Gate 0's integration gate is satisfiable: no phantom services, no contradictory
stock, no impossible purchases. Gate 1's opening is playable and its three
choices are comparable.

`08-implementation-packages.md` puts **Gate 2** next — HOSP-01, TRADE-01, ENG-01,
ENG-02 — and warns they all converge in `src/sim/sim.ts`, so they should stay
serial. HOSP-01 is the natural first: it inherits the service log, the located
meal inventory and the capacity work directly, and the crew mess added by OPEN-01
is exactly the room it needs to deepen.

Before Gate 2 starts, the §7 items worth closing are the three-run acceptance
playthrough and a decision on §6.1.
