# Playtest Guide — prioritized

Run: `npm run dev` → `http://localhost:5174/`. Scenarios load via `?scenario=<name>` (add `&seed=1337` to pin). Most load **paused** — press Space.

Two things to know before you start:

- **`?scenario=starter` does not exist.** The plain-start flag is `?starter=stock`. An unknown scenario name logs the valid list to the console and leaves you on a normal start.
- Verified scenario names: `demo-station, facility-scale, long-stay-guest-wing, cantina-undersized, cantina-expanded, display-cold-case, market-compact-conflict, market-improved-flow, mess-line-choked, mess-line-extra-counter, mess-line-rerouted, reception-absent, reception-staffed, mixed-berth-visit, mixed-tenure-day, berth-two-gangways, pod-dock-finger, approach-conflicts, meal-queue-boarding-conflict, cargo-boarding-conflict, physical-cargo-showcase, failed-stay-showcase, visit-schedule-showcase, commitment-failure, commitment-recovered, admission-policy-pressure, normal-scale-50, normal-scale-50-spine, exterior-integrity-showcase, structural-truss-active, structural-expansion-active, structural-expansion-blocked, structural-expansion-material-blocked, debris-wing-exposed, debris-wing-sheltered, fuel-day, commercial-units, reputation-slice`

**You already covered** (skip): kitchen prep/haul chain and tray carrying; Market with Shelf Aisle + Checkout Bank + freight restock; commercial tenant rentals; Fuel Coupler → Fuel Pipe → Fuel Tank. All confirmed working paths; nothing new to look at there except the two market fixtures in §1.6 and the Fridge answer in §4.1.

---

## 1. Highest payoff — visible, watchable systems you haven't seen yet

### 1.1 **Long-stay guests with four recurring needs**
Guests on contract/extended stays get hungry, tired, dirty and bored repeatedly and keep walking back to real fixtures. This is the single biggest system you haven't watched.

1. `?scenario=long-stay-guest-wing` — pre-built Dorm (2× Guest Cabin + a Bunk Bank), Cafeteria (Serving Line, Community Table, Tray Return), Cantina (Service Bar, Booth Bank), Bathroom (Wash Bank, Toilet, Sink), Lounge (Couches, Game Station), 8 extended-stay guests.
2. Unpause at 4×.
3. Click a guest to open the Agent Inspector; re-click every ~60s.

Watch: needs fall at **hunger 0.30 / energy 0.22 / hygiene 0.16 / leisure 0.20 per second**; a guest starts seeking at **55**, goes critical at **18**, and a completed session restores **68**. Watch the chips: `CABIN 1/2`, `WASH 3/4`, `BOOTHS 4/6`, `SERVING 2/3`. Sessions are timed and exclusive — temporary-sleep 18s, hygiene 6.2s, seat 9.5s, meal-pickup 2.8s, bar-service 3.6s.

To build it in your own save, see §4.3 — the room *Housing Policy* is the load-bearing step.

### 1.2 **Choked doorway, and two different fixes you make yourself**
The clearest "layout is the mechanic" demo in the build.

1. `?scenario=mess-line-choked` — 24 hungry guests sealed north of a 14×8 Cafeteria whose only door is at x=48 (wall row y=48). Unpause at 4× and count how many get fed.
2. Reload it, pick the **Door** tool (hotkey 4), and cut two more doorways at x=45 and x=51 in that same wall row, above each serving counter. Unpause and compare.
3. Compare the two authored fixes: `?scenario=mess-line-rerouted` (three doors) vs `?scenario=mess-line-extra-counter` (extra serving bank, one door).

Watch: the two remedies feel *different* — one buys circulation, the other buys service rate. A self-service Cafeteria needs no staff post, so neither fix involves staffing.

### 1.3 **Circulation physics: single-lane corridors, turnstile doors, queue spill**
Bodies genuinely contend for floor tiles now.

1. In your own station, build two rooms ~8 tiles apart joined by a **1-tile-wide Floor passage with no Door**. Put a Bathroom on one side and a stocked Public Cafeteria on the other. Watch the middle at 1×.
2. Paint a second parallel Floor lane the whole length. Watch the same crowd.
3. Now give a busy Public Cafeteria exactly **one Door** and zoom onto the door tile.
4. Hover any Cafeteria or Cantina tile while a line exists.

Watch: nobody ghosts through anyone; one direction owns the choke and drains, then flips. Two lanes → both directions move at once and the wait vanishes. On the door tile: one body at a time with a beat between, someone stepping *off* wins priority. A pulsing ring with a headcount badge appears once 3+ actors converge, going hot orange when one is actually stalled. Hovering draws a dashed amber guide along the queue's exact tiles with a pip under each occupied place — and the line spills out through the doorway and down the corridor when it outgrows the room.

### 1.4 **Approach envelopes, lane serialisation, and holding chips**
Frontage becomes a spatial decision with a preview before you spend.

1. Press Escape (no tool held), click a Pod Dock tile, then a Berth room tile.
2. Pick the **Pod Dock** tool and hover: open hull; hull with structure 2–3 tiles out; hull directly beside an existing Pod Dock.
3. Press **E** (Berth), drag a 4×3 and then a 7×6 against a hull face and hold the drag.
4. `?scenario=approach-conflicts` (three east docks at x=76, y=20 / y=22 / y=31 — the first two share a lane) and `?scenario=pod-dock-finger` (4 docks on one finger). Unpause at normal play zoom.

Watch: dashed cyan ingress corridor + solid mooring box + direction arrow + `APPROACH CLEAR · NORTH STEADY · SHELTERED`. Red `APPROACH BLOCKED: ingress envelope is obstructed`, amber `APPROACH SERIALIZES: 1 GROUP`, orange `ACCEPTED WORK CONFLICT: Pod Dock 3`. Berth size classes are tile-count based — **4+ small, 12+ medium, 42+ large** — and the large drag projects a visibly deeper corridor. Waiting ships post a marching-dash chip reading `<CALLSIGN> HOLDING 14S - LANE BUSY`, seconds counting up. The independent dock at y=31 approaches concurrently.

Note: the older doc string `WAITING: APPROACH OCCUPIED` is stale — the shipped chip names the ship.

### 1.5 **Two Gangways vs one, on the same manifest**
1. `?scenario=berth-two-gangways` — north berth TWIN has 2 Gangways, south berth SINGLE has 1, both already admitted an identical 10-passenger manifest.
2. Unpause at 2× and watch both collars side by side through disembark, then through recall/boarding.

Watch: exactly one passenger on a Gangway tile at a time; the rest hold assembly tiles outside the hull in a visible fan. TWIN runs two crossings in parallel and finishes first. Collars animate closed → deploying → connected → active, flip amber `GANGWAY BLOCKED | N PAX` when jammed and red `LATE BOARDING | N PAX` late in the boarding lead. **Gangway status labels only draw at World Labels = ALL** (F6 cycles ALERTS → ALL → OFF).

A second Gangway is 140c, Berth room only.

### 1.6 **Two market fixtures you haven't placed: Backroom Stock Bank and Display Cold Case**
You've done Shelf Aisle + Checkout Bank. These two are the parts you haven't.

1. `?scenario=display-cold-case`. Click the **Display Cold Case** (3×1, 110c, Market only). The Selection line under the HUD shows `Display Cold Case mix: <name> · N% appeal · N% margin · suits ...` with three buttons; the anchored shop panel has the same three.
2. Switch mixes and watch who walks over and what sales pay. Verified: **Essentials 100% appeal / 100% margin** (suits market + cafeteria), **Gifts 82% / 134%** (market + lounge), **Technical 60% / 162%** (market only).
3. Place a **Backroom Stock Bank** (2×3, 90c, allowed in Market, Storage *or* Logistics). It has **no customer face at all** — two `stock` positions only.
4. `?scenario=market-compact-conflict` (backroom behind the customer frontage) vs `?scenario=market-improved-flow` (backroom on the shelves' rear stock face). Turn on the **Foot Traffic** overlay and hover the corridor tiles between them.

Watch: chip reads `BACKROOM n` over `SHELVES n`, or `OUT OF STOCK`. In the compact layout every restock bundle walks through the checkout queue; Foot Traffic paints purple logistics routes, green visitor routes and red mixed public/back-of-house conflict tiles with a `N paths | N tiles | N conflicts` legend. The improved layout has none.

You can repair the bad one with ordinary tools: **Move** (↔ in the palette) relocates a module for **free**, and **Sell** (X) refunds exactly **50%** of purchase price.

### 1.7 **Failed stays: the escalation ladder and the recovery levers**
1. `?scenario=failed-stay-showcase` (paused). Four staged occupants along row 17: #99101 balking on hunger at (17,17), #99102 distressed on leisure at (23,17), #99103 disruptive on hygiene at (29,17), #99104 distressed + stranded at (35,17). Zoom in on each and wait for bubbles to cycle.
2. Read the Alerts card and click the relief action.
3. For the organic version: `?scenario=commitment-failure` (4-guest repair cohort, ship GATE-G-COHORT, no reachable food/bed/wash). Unpause at 4× and leave it alone for ~3 minutes. Then compare `?scenario=commitment-recovered` — same seed and cohort with the facilities actually built.
4. Click the Approach Control card and read the **Stay recovery** section above the offers.

Watch (all verified in source): escalation rungs land at **28s / 75s / 150s** of continuous unmet need, so one missed meal never reaches the top. Pips go cool-blue `?` (unmet) → amber `?` (balking) → orange `!` (distressed) → red `!` (disruptive), plus a cyan `>` transport marker on the stranded guest. The incident ladder is bounded to exactly three, **45s apart**, only at distressed or above: **mess → complaint → refusal-to-work**. No theft, vandalism or medical incidents exist on this path — treat those as scoped out, not broken.

Lever costs, verified: Emergency meal **9c/meal**, Temporary bunk **14c/guest**, Prioritize repair **60c**, Compensate **18c/guest**, Onward transfer **95c**, Cancel contract **45% of remaining promised value**, Security response **30c** (disruptive only), Close admissions free. Each greys out with a tick after one use. Stranded relief is **35c base + 15 balking / +30 distressed / +50 disruptive, capped 120** — so the distressed guest quotes 65c. (The checklist's "50 base" figure is wrong.)

Also verified: distressed cohort members slow their own ship's turnaround by `1 − 0.08×distressed − 0.18×disruptive`, floored at **0.45**. Only the offending ship slows.

Two of these levers misbehave — see §3.4 and §3.5.

### 1.8 **Exterior hull condition and EVA repair**
1. `?scenario=exterior-integrity-showcase` (paused). Four adjacent exterior faces seeded at wear 20, 58, 88 and one fresh patch. Stay in Normal View and zoom to the hull edge.
2. Note Station Stock in the HUD, unpause at 4×, watch ~128 simulated seconds.
3. Switch the overlay picker to **Maintenance** and hover hull / dock / berth tiles.

Watch: thresholds verified at **wear ≥12 worn (tan), ≥45 damaged (orange), ≥78 breached (red)**, patched teal; under 12 draws nothing. Suited engineers cross a real Airlock, weld sparks play, damaged *and* breached flip to patched. Station Stock falls by 2 raw material per repair. Maintenance hover reads `<label> <n>% | debris | EVA repair pressure | EVA repair`.

Verified: a breached tile **stops being a pressure barrier** while keeping its wall sprite, so the compartment behind it vents. The showcase deliberately keeps an inner wall behind the breach, so it proves repair but **not** recovery from a vent on an occupied deck. Test that separately.

Cheap mitigation, verified: any exterior face whose outboard neighbour is a **Truss** tile has its debris exposure multiplied by **0.45**. Lay Truss outboard of one stretch of an exposed wall, leave the neighbouring stretch bare, run at 4× and compare wear.

### 1.9 **Freight carts that really block a corridor**
1. `?scenario=physical-cargo-showcase` — a cargo handler on a stocked store node with an 8-unit job to a second node. Press play and follow them the whole way.
2. `?scenario=cargo-boarding-conflict` — loads paused mid-collision. Play a couple of seconds so bubbles cycle.

Watch: a cart plate under the carried item icon at 4+ units, visibly slower walking, nobody tailgating, no side-swapping past an oncoming actor. Amber dashed pulsing ring on the source tile pre-pickup, green flash on the destination on completion. In the conflict fixture the passenger shows `CARGO BLOCKING BOARDING` and the handler shows `PASSENGERS BLOCKING FREIGHT`, both genuinely stalled. Widen the route to two lanes and both vanish.

### 1.10 **Click a dock or berth for a single prioritised operating diagnosis**
1. With Select active, click a **Pod Dock module tile** or a **Berth room tile**. Read the `Operating Diagnosis` block.
2. Then close the inspector, hide the HUD panels, and look at the station itself.
3. Try it on `?scenario=mixed-berth-visit` and `?scenario=approach-conflicts`.

Watch: exactly one severity-coloured answer with a real coordinate and a physical remedy — `Boarding is late at Berth — 3 passengers blocked at (44,31) with 12s before departure`, `Cargo crosses public space at (39,22)`. In world: dashed outline on the interface footprint, diamond pips along the offending route, pulsing double frame on the blamed tile, and a caption chip (`Queue on door`, `Cargo in public`, `Interface OK`). Fixing the top problem reveals the next. Only appears for module-backed Pod Docks and Berths, not legacy painted dock zones.

---

## 2. Systems that need deliberate setup to see at all

### 2.1 **Truss → EVA-welded pressure hull**
The only construction path that is genuinely staged (see §3.8 for why everything else isn't).

1. Pick **Truss** (hotkey `.`) and click an empty space tile touching your hull. 1 material leaves stock at plan time.
2. Unpause at 4× and follow a crew member to the Airlock.
3. Once welded, pick **Floor** (hotkey 1) and drag across only the truss tiles, then release.
4. Watch the stages, then check the Work Queue count fall.
5. Pre-staged versions: `?scenario=structural-truss-active`, `?scenario=structural-expansion-active`.

Watch: dashed cyan blueprint with an open-lattice sprite and an `EVA` label; the worker gains a white suit tint at the Airlock and crosses vacuum. The Floor-over-Truss drag plans a whole wing at once — floor plates inside, walls all round, plus one Door blueprint or a zero-material tie-in. **Perimeter welds first, then interior floors, then a zero-material `SEAL` tile at the doorway**, then the whole wing commissions on one tick with a ~3s pressurizing animation, coming up Public with no room assigned. Unfinished shell is not walkable and holds no pressure.

Refusals: unanchored truss → `must connect to hull or planned construction`; non-space tile → `truss must be built in space`.

### 2.2 **Support pieces and the span/branch rules**
1. Turn on **Structural Support** from the Overlays row (read §3.7 first — the overlay is half-dead).
2. Extend a truss run straight out to 8+ tiles and let each tile actually weld. Verified limit: **MAX_TRUSS_SPAN = 6** from hull or Junction.
3. Place a **Junction** (`data-tool-structural-piece`, palette "Junction") mid-run: **12c + 3 materials + 6 EVA work**. Let it weld.
4. Weld a T shape and look at the branch tile; then put a Junction on the branch point.
5. **Bulkhead** is 2×1, rotatable with `[` / `]`: **28c + 8 materials + 14 EVA work**, and must bridge a space/truss tile *and* an exterior hull-face tile.

Watch: outer tiles past 6 turn red with an X and go green once the Junction completes. Bare branch tiles read unsupported. Illegal hovers draw a red footprint with the exact reason (`junction needs a space or truss support tile`, `structural piece overlaps a module`, `bulkhead must bridge truss/space and the exterior hull face`); nothing is charged. Cancelling an unfinished piece refunds its credits.

Caveat: the branch rule counts *every* adjacent structural node including original hull, so a truss tile in a concave hull corner can be flagged as a branch you never drew.

### 2.3 **Blocked-build reasons**
Load these three side by side at normal play zoom with panels hidden:

1. `?scenario=structural-expansion-blocked` — no Airlock route.
2. `?scenario=structural-expansion-active` — same project, Airlock present.
3. `?scenario=structural-expansion-material-blocked` — Airlock present, all material sources emptied.

Watch: red idle blueprints labelled `BLOCKED · NO AIRLOCK EVA ROUTE` / `BLOCKED · NO CONSTRUCTION MATERIALS`, legible without zooming. The active one shows EVA markers, a suited worker, falling Station Stock, and live entries in the Work Queue.

The other blocked reasons (`NO CONSTRUCTION STAGING ROUTE`, `EVA OXYGEN LOW`, `WORK POSITION OBSTRUCTED`, `INCOMPLETE SEAL AT x,y`) exist in code but the checklist records **no live browser capture** for any of them — worth provoking. `EVA_LOW_OXYGEN_SEC = 18` and suit oxygen is 240s, so plan a wing far from your only Airlock to see the strand-and-return.

### 2.4 **Finite admission policy**
1. `?scenario=admission-policy-pressure` — 4000c, Finite admission already on for Pods and Berths, 1 interface of each class kept free, 6 prepared meals reserved, five queued calls (routine tourist pod, routine trader pod, plus military / colonist / large-trader exceptions).
2. Let one tick pass without touching anything.
3. Then edit: Keep free, Max stay, Min margin per class, Guest beds and Prepared meals reserves.
4. Press **Manual all**.

Watch: routine pods auto-admit with an explanation event; military / colonist / large / pay-up-front / high-risk always stay manual with their reason shown. Hold notes read `Would leave 0 free pods, under the 1 reserve`, `Needs 4 meal(s); reserve of 6 would be broken`. Reserves are cumulative across a pass. The pressure line reads like `3 pod / 2 berth waiting · 2 routine clear · 1 held · 2 manual · Held for a decision: military call.` Accept / Hold / Pass stay on every offer.

Known limit: the per-rule ship-type list is **not editable** — fixed at tourist+trader for pods, trader for berths.

### 2.5 **Save and reload mid-visit**
1. Get a live turnaround with guests mid-service and a mid-delivery build.
2. Save from the save modal, reload the page, load that slot.
3. Immediately re-check Approach Control, the turnaround promise rows, Stay recovery, and any fixture that was in use.

Watch: berth ownership, queue position, contracts, promise progress, per-tile delivered material and build stage should all survive; no fixture reserved by a visitor who no longer exists; no duplicate payout.

Recorded caveat, worth confirming: **jobs, reservations, active crew loads and carried cargo quantities are not fully persisted**, so an interrupted haul may not resume cleanly. Also `?load` / `?loadId` override `?scenario` rather than combining.

### 2.6 **Berth load classes and structurally-refused berths**
Expensive to reach, and the heavy case needs a hand-built 42-tile bay.

1. `?scenario=structural-expansion-active`, let the wing commission so its floor is new expansion hull rather than original hull.
2. Paint a **Berth** (E) over that new floor with a mouth open to space; place 2 **Docking Clamps** inside (100c each).
3. Turn on Structural Support. Then place a Junction on the open space tile beside the clamp and let it weld.
4. Admit a medium ship while the interface is gold/overloaded, then again after the Junction completes.

Watch: the clamp tile goes gold with a horizontal bar and the nearest piece switches to its overloaded sprite; while overloaded the berth **never gets an arrival** even though it is free and correctly sized. Berths built on the *original* pre-existing hull never demand a transfer piece — pre-existing tiles are all treated as structural roots.

Sharp edge: the fix named by the copy (a Junction) is only placeable on space or truss, so a clamp buried deep inside a pressurised expansion has no legal tile. Keep clamps beside the berth mouth or beside original hull.

---

## 3. Known-broken or suspect — expect these to misbehave

These are all confirmed by reading `src/` in the current main checkout, not guesses.

### 3.1 **A player-built Arrival Desk will never process anybody. Expect this to fail.**
`freeReceptionSlots()` only offers a desk whose `reception-staff` slot has a worker physically standing on it. **No crew duty system routes anyone onto a reception-staff slot** — the only thing that ever does is `stageFacilityStaff()` inside the scenario file. So a desk you build reads `DESK 0/2 UNSTAFFED` forever and reveals nothing.

- Reception only works in `?scenario=reception-staffed`, and even there the staging uses a 240-second task lock, so it decays after ~4 minutes.
- `?scenario=reception-absent` vs `?scenario=reception-staffed` is still worth loading for the **one-time redirect**, which does work: an amber floater `Need: comfort ↪`, an event-feed line `<name> realized they need comfort; redirecting from leisure.`, once per guest.

### 3.2 **A working Serving Line will display `STAFF 0/2` / unstaffed. Expect this.**
The chip and unstaffed sprite frame read staffing from workers holding the two `meal-staff` lane squares, but the `cafeteria` duty system routes cooks and stewards to `serviceWorkPosts(RoomType.Cafeteria)` — open floor near the counter, never the lane. `meal-staff` is not consumed anywhere in `sim.ts`. Meals are served correctly; the chip is lying.

(By contrast the **Checkout Bank works properly** — the `market` duty system does target `checkout-staff` slots. That one you can trust.)

### 3.3 **The bar-run chip lies twice.**
Both render call sites invoke `barGroupStatus(state, group, 0)` — steward count hardcoded to zero. So:
- The chip reports `UNSTAFFED` whenever nobody physically stands on a `bar-staff` square, even while assigned Stewards are pouring drinks. And no ordinary duty path puts anyone on those squares (`lounge` duty targets `serviceWorkPosts(RoomType.Cantina)`).
- `dwellSlotsInRoom()` counts only Booth Bank / Standing Rail / Community Table seats. Plain **Bench** is excluded, so a bar surrounded by Benches shows `NO FREE SEAT` — even though the *actual* routing (`collectCantinaSeatTargets`) does include Benches and sends drinkers to them.

The real service rate uses `max(stewards in cluster, lane staff)`, so an assigned Steward genuinely works. `CANTINA_UNSTAFFED_SERVICE_RATE = 0.24` — an unstaffed bar runs at 24% speed.

### 3.4 **Emergency temporary bunk is paid for but not used, if the Dorm already has a Bunk Bank or Guest Cabin.**
`temporarySleepSlots()` returns Bunk Bank / Guest Cabin slots when any exist and **only falls back to plain Bed/Bunk when there are none**. The 14c emergency Bunk is a plain 1×1 Bunk, so in a Dorm that already contains a Bunk Bank or Guest Cabin (e.g. `?scenario=commitment-recovered`) it is built, charged, and never routed to. Test the lever in a Dorm with no Bunk Bank or Guest Cabin. A paid bunk with nobody walking to it is this bug.

### 3.5 **Close admissions is a no-op unless Finite admission is switched on.**
`applyAdmissionPolicy()` returns early when `!policy.enabled`, so `closedUntil` is never consulted. The legacy auto-router only steps aside when `admissionPolicy.enabled`. But the HUD reads `closedUntil` unconditionally — so with Finite admission **off** and legacy Auto-routing **on**, you get a `· recovery closure 120s` countdown while traffic keeps being admitted.

### 3.6 **Bunk Bank cannot be placed.** There is no `data-tool-module="bunk-bank"` button and no build tool id anywhere in `main.ts`. It exists (2×4, 150c, Dorm-only, four `temporary-sleep` positions) and works, but is only reachable via `?scenario=facility-scale`, `?scenario=long-stay-guest-wing`, `?scenario=mixed-berth-visit`. Use **Guest Cabin** (3×4, 220c, two beds) for guest lodging you build yourself.

### 3.7 **The Structural Support lens has no working hover text and no in-world legend.**
- `drawDiagnosticOverlayLegend()` has **zero callers**, and `diagnosticOverlayHoverLine()` is called only from it. So the nine worded failure sentences in `STRUCTURAL_PROBLEM_COPY` are unreachable.
- `diagnosticReadoutText()` in `main.ts` has **no `structural` case** — it falls through to the room-environment sample. With this lens on, hovering an interior room tile prints a **Service Noise** line and hovering truss or space prints `no room environment sample`.
- The side key panel says "see the in-world legend for live counts". That legend never draws.

The colours work. You will have to infer "too long" from the red X and the 6-tile pattern.

### 3.8 **Exterior module install never goes through EVA.** `src/main.ts` line 241 sets `INSTANT_BUILD_PLAYTEST = true`, so palette module placement completes immediately and never creates the EVA site. Only Truss and the Floor-over-Truss gesture are forced through staged construction. Placing a Pod Dock back on the hull will *not* show a suited worker.

### 3.9 **Your station can never gain a resident. Expect this to fail.**
`setResidentAcceptance()` and `residentAcceptanceOpen` exist in `sim.ts` / `save.ts` and default to closed, but **`setResidentAcceptance` is not imported into `main.ts`** and is wired to no button, toggle or menu. There is no console harness either. The resident stress / withdrawal / departure feature is therefore untestable from a fresh start — use a scenario that already ships residents.

### 3.10 **Suspect, recorded but not re-verifiable from source.** Two live defects the checklist logged that I could not confirm without running:
- `?scenario=normal-scale-50` and `-spine` reportedly vent most of the interior at t≈156s and lose 33–37 crew to vacuum, because exterior wear crosses the breach threshold faster than the repair loop closes it. Reproduced against pristine HEAD, so treat as pre-existing and geometry-independent.
- A mixed berth call in the recorded 50/50 run returned **0 of 6 passengers** to board. Expect the mixed turnaround in that scenario to fail its passengers-returned promise.

Also open per the checklist: Fit Station legibility at scale, a misleading "poorly supplied tiles" style banner in Air Coverage, and no test runner asserting any of the comparison fixtures — they self-check on apply, but nothing in `tools/` would catch a silent degradation.

---

## 4. Answers to your open questions

### 4.1 **Fridge / Cold Store: what they're for**
Verified: both are **raw-ingredient buffers**, `storageClass: 'cold'`, allowed in **Kitchen or Storage**. Fridge is 1×1 with capacity **42**; Cold Store is 2×2 with capacity **132**. Neither is staffed and neither has a customer face.

There is **no spoilage anywhere in the codebase** — nothing rots, so cold storage is not preservation. What it actually does, two things:

1. **It inserts a buffer stage into the food chain.** With cold storage present, `rawMeal` flows Logistics/Storage/Hydroponics → **Cold (target 90 units)** → Prep Counter → Stove. With no cold storage it goes straight from receiving/growing to the Prep Counter/Stove, whose targets are only ~22 and 40 units. So cold storage lets you bank ~90–132 units of ingredients near the kitchen instead of running the whole chain off long hauls from receiving.
2. **It is the delivery destination for imported raw food.** In `createPortCargoTransportJobs`, a ship's `rawMeal` cargo lot routes to cold-food targets when any exist, and to generic Storage/Intake when none do. Colonist ships carry ~1.4× the raw-food cargo of others.

Practical read: put a **Cold Store in the Kitchen** if your Hydroponics or receiving is a long walk from the stoves, or if you're importing raw food by ship. Skip it if the kitchen is already adjacent to Storage — it buys nothing but buffer depth.

### 4.2 **Cantina wraparound modules — why the tenants ignore them**
Your observation is correct and it's the tenant template, not a bug. Verified in `src/sim/commercial.ts`: the `cantina` business template fits out with **`BarCounter` ×1 + `Tap` ×1 + `Bench` ×2** and nothing else. Tenant fit-outs never place a Service Bar, Bar Corner or Bar End. The wraparound run is **player-built only.**

How the run actually works (verified in `facility-machines.ts` and `facility-descriptors.ts`):

- **Service Bar** 2×5, 140c, Cantina only — 4 guest stools on the west face, 2 staff-lane positions on the east.
- **Bar Corner** 2×2, 55c — 1 stool + 1 staff position. Turns the run 90°.
- **Bar End** 2×2, 45c — 2 stools, no staff position.
- Union-find over **edge adjacency** merges any touching set into one provider: one chip, one queue, one pooled drink stock, anchored on the lowest module id. A full run is **7 stools / 3 staff positions** → chip reads `BAR n/7 · DRINKS x`.

To see it:
1. `?scenario=cantina-undersized` (full Service Bar, no seating at all) then `?scenario=cantina-expanded` (same bar extended into a run + 2 Booth Banks + a Standing Rail). Same eight guests in both.
2. In your own save: paint a **Cantina**, place a Service Bar, then a Bar Corner and a Bar End so they *touch* it. Compare against two separated Service Bars — you'll get two chips.
3. Rotate with `[` / `]` so the west guest face opens onto walkable floor, not a wall.

Watch: undersized serves drinks but the four stools stay occupied because drinkers have nowhere to go, chip reports `NO FREE SEAT`. Expanded, the stools clear as guests move into booths and onto the rail.

**Two traps:**
- Extra run length only pours faster if the added staff-lane position is occupied — and nothing routes crew there (§3.3). Extra length still buys stools, i.e. dwell.
- **`collectCantinaBarTargets()` drops legacy Bar Counter tiles entirely as soon as *any* Service Bar / Corner / End run exists in a Cantina** — and the filter is station-wide, not per-room. So building a Service Bar in one Cantina will stop the Bar Counter in a *different* Cantina (including a tenant's) from being a drink target. If you add a modular bar, expect your rented cantina's Bar Counter to go dead.
- Drink stock is pooled `rawMaterial` across the run's origin tiles; Cantina stock target is **6 units**, max 12. `no-stock` fires below 0.16 units. Taps still help: **+18% max unstaffed, +80% max staffed.**

### 4.3 **Visitor sleeping quarters — when you actually need them**
Verified in `occupant-demand.ts`: only **long-stay** visitors have recurring needs, and `isLongStayClass()` is true for exactly two classes — **`contract`** and **`extended`**. Stay class is decided by ship type and size:

| Admitted ship | Stay class | Needs lodging? |
|---|---|---|
| Any **small** craft (pod) | `errand` | **No** — never |
| **tourist** / **trader** medium | `shore` | No |
| **industrial** medium/large | `contract` 65% / `extended` 35% | **Yes** |
| **colonist** | always `extended` | **Yes** |
| **military** | `contract` 70% / `shore` 30% | Usually |
| any **freight**-kind offer | `contract` 24% / `shore` 76% | Sometimes |

Energy starts at 80–89 and falls 0.22/sec, hitting the seek threshold of 55 after roughly **114 seconds**. Errand stays are 70–110s and shore stays ≥105s, so those barely touch it. Contract stays run ≥190s and extended ≥300s, so they will cycle sleep repeatedly.

**So: build guest lodging when you start accepting industrial, colonist or military berth calls. Not before.** With Pod Docks and tourist/trader traffic only, it is dead capital.

To build it, verified path:
1. Paint a **Dorm**.
2. Click the room → the room modal's **Housing Policy** select → **`Visitor/Shared`**. This is mandatory: `temporarySleepSlots()` filters on `roomHousingPolicies[tile] === 'visitor'`. A crew-policy Dorm refuses guests entirely; a visitor-policy Dorm adds **zero** crew sleep capacity and the crew warning flips to `Crew quarters unavailable: N/M crew sleep slots - set a Dorm to Crew housing`.
3. Place a **Guest Cabin** (3×4, 220c, Dorm only) — two exclusive `temporary-sleep` beds. Chip climbs `CABIN 0/2 → 1/2 → 2/2` and never reads 3/2.
4. Also set the **Bathroom** (that's `RoomType.Hygiene`, labelled "Bathroom" in the palette) to Housing Policy `Visitor/Shared` and keep it **Public, not Restricted** — visitor wash and toilet targets both filter on visitor policy AND non-restricted zone AND (in pipe mode) a powered fixture. Then place a **Wash Bank** (2×5, 130c, Bathroom only) — four exclusive stalls, 6.2s each, chip `WASH n/4`.
5. Same visitor-policy + Public requirement applies to a Cafeteria you want travellers to use.

Residents keep their own assigned beds and are never displaced by a visitor. Guests claiming a bunk stay temporary visitors — bed capacity never confers resident identity.

### 4.4 **There is no Reception room. That's why you couldn't find it.**
Verified against the full room-paint list — the 22 room types are Bridge, Dorm, Bathroom, Hydroponics, Kitchen, Cafeteria, Life Support, Reactor, Lounge, Market, Workshop, Storage, Maintenance, Logistics, Security, Clinic, Brig, Rec Hall, Berth, Cantina, Commercial, Observatory. No Reception.

The **Arrival Desk** is a fixture, not a room: 2×4, 130c, `allowedRooms: [Lounge, Market, Cafeteria]`. Two `reception` processing positions (3.2s each) on the west face, two `reception-staff` positions on the east. Place it in a **Lounge** on your arrivals route.

But see §3.1 — **in a normal game it will never process anyone**, because nothing staffs the reception-staff squares. Judge this feature only from `?scenario=reception-staffed`, and don't spend 130c on one in your save yet.

---

**Files worth having open if you want to check a number mid-session:**
- `/Users/ryan.boye/code/space-station-game/src/sim/balance.ts` — every footprint, allowed room, capital cost, power draw and soil rate
- `/Users/ryan.boye/code/space-station-game/src/sim/facility-descriptors.ts` — exactly which depicted positions are public vs staff, and which face is the customer side
- `/Users/ryan.boye/code/space-station-game/src/sim/facility-slots.ts` — session durations and the blocked-reason label strings
- `/Users/ryan.boye/code/space-station-game/src/sim/occupant-demand.ts` — need rates, thresholds, and the stay-class table
- `/Users/ryan.boye/code/space-station-game/src/sim/cold-start-scenarios.ts` — the authoritative scenario name list

Note: the worktree at `.claude/worktrees/checklist-completion-takeover-29c18b` is **209 commits behind main** and does not contain any of the Phase 1B fixtures. Everything above was verified against the main checkout at `/Users/ryan.boye/code/space-station-game/src/`.