# Space Station Colony Sim — Design Review (Fable pass)

Reviewer: Fable, as a colony-sim genre lover (RimWorld / ONI / Dwarf Fortress / Space Haven).
Method: look-first. Played the live build and the current source with a dense showcase station, read
the screenshots, ran headless soaks, and cross-read the design docs. Judged the *played experience*, not
the code's ambitions.

**Build note (which is newer):** Three cuts exist and they differ.
- `/spacegame/` (live, deployed) — 100x80 grid, sprites on, tier onboarding, ~597 KB bundle. This is the
  review target. It is a *slightly older cut* than the repo's current `origin/main` (it lacks the
  `?scenario=` cold-start loader).
- `/spacegame-preview/` — smaller/older bundle (~388 KB). Older than main. Skipped for review.
- `origin/main` HEAD (built locally for this review) — the newest source; identical design lineage, plus a
  `?scenario=demo-station` loader that builds a dense 18-room station. I used this to review the *realized
  mid-game*, and the live `/spacegame/` build to review the *real early game*. They are the same game.
- The local clone at `/home/claudebot/space-station-game` is months stale (60x40); its numbers are NOT the
  live game and are only cited as design-intent history.

---

## VERDICT

This is a real colony sim with a beautiful, legible skeleton and one missing organ. The build looks and
reads like a genuine indie sim — a dense, labeled 18-room station with distinct furniture sprites, a
proper diagnostic-overlay suite (air-coverage heatmap, route-pressure, sanitation, maintenance), clickable
crew that tell you exactly what they're doing ("Crew #16: logistics | walking to rawMeal pickup |
healthy"), tier onboarding that fires correctly, and an honest self-aware roadmap that already names its own
weakness. But when you press play and watch, the loop doesn't close: in the flagship demo station visitors
pour in and pile up (0 → 37) with **Exits 0/min across three cycles**, rating sits frozen at exactly 70,
credits are flat, incidents stay at zero, and nothing ever *happens*. It is a gorgeous, well-instrumented
diorama in equilibrium — the genre's hardest 70% (systems, spatial legibility, information design) is done,
and the genre's actual *product* (a generative loop that manufactures anecdotes and rising pressure) is the
20% still missing. Fix the visitor reward loop and add a director that makes something go wrong, and this
crosses from "impressive simulation toy" to "colony sim I'd lose an evening to."

---

## WHAT'S GENUINELY WORKING (observed receipts)

- **The station looks and reads like a real sim.** The demo station renders 18 labeled rooms (Crew
  Quarters, Mess Hall, Kitchen, Hydroponics Bay, Med Bay, Workshop, Storage, Market, Lounge, Cantina,
  Observatory, Rec Hall, Hygiene, Security, Engineering, Life Support, Logistics, Brig) with distinct
  furniture sprites, room tints, a starfield, and exterior berths. Sprites are on by default and look good.
  (`D2-demo-fit.png`)
- **Rooms activate and staff correctly; the base life loop is stable.** Running the demo, the ops line
  showed `Caf 1/1 | Food K1/1 H1/1 | LS 1/1 | R 1/1` — cafeteria, kitchen, hydroponics, life support, and
  reactor all staffed and active. Oxygen held at 100%, morale 98–100%, food ticked *up* (72 → 81). No death
  spiral on the current build. (`D6-run-late.png`)
- **Information design is a real strength — ONI/Prison-Architect grade.** The OVERLAYS tab carries a full
  diagnostic suite: Air Coverage, Visitor Status, Resident Comfort, Service Noise, Maintenance, Sanitation,
  Map Conditions, Route Pressure. The Air-Coverage overlay tints tiles teal/yellow/red with a legend
  ("Reliable coverage near active life support" / "Distant coverage, watch room readiness" / "Disconnected
  or no active air source") and hover-for-detail. (`T-overlays-on.png`)
- **Per-actor legibility is excellent.** Clicking a crew member yields role + current action + reason +
  health ("Crew #16: logistics | walking to rawMeal pickup | healthy"). You can see *what* a pawn is doing
  and *why*. (`I-hydroponics.png`)
- **The layout diagnostics are spatially honest.** Room warnings surface real friction: "single-door
  bottleneck risk", "life-support coverage: distant rooms", "layout friction: logistics crosses public
  areas", "layout friction: visitors see back-of-house routes". The game *knows* about walk distance,
  zoning, and back-of-house exposure. (`D6-run-late.png`)
- **Onboarding works on the live build.** Tier 0 ("first visitor arrives") advanced to Tier 1 "GUEST
  SERVICES: earn 500 credits and serve 3 visitor types — add lounge and market for visiting traffic." Real
  guided ramp. (`L2-live-run50.png`)
- **Deep toolkit under the hood.** A role/hiring system (Captain / Cook / Botanist / Assistant,
  Progress-gated), build/paint/modules/zones, priorities, tax slider, and — per the roadmap's honest
  "Current State" — residents with taxes/satisfaction/leave intent, repair/maintenance/fire jobs,
  construction blueprints + EVA, and a procedural system map with factions/lanes. The breadth is genuinely
  large.

---

## TOP 5 GAPS vs THE GENRE CANON (ranked by impact)

### 1. The core reward loop doesn't close — progression is inert
- **What the greats do:** RimWorld/ONI/Space Haven run a tight, visible satisfaction+resource loop where
  every actor's success or failure *immediately* moves a meter you're watching, and that meter feeds back
  into demand. The loop is the heartbeat.
- **What this game does:** In the demo station, visitors accumulate 0 → 16 → 36 → 37 with **Exits 0/min the
  entire run**; the resident line reads "waiting for eligible visitor exit" → "blocked: no free residential
  berth". Station rating sits at *exactly* 70 across three cycles; credits are flat (5000 → 4994).
  Mechanically this is airtight: rating = `70 + ratingDelta`, and `ratingDelta` only accrues on visitor
  success/failure *exits*, ship skips, and resident churn — with zero exits there is zero signal, so the
  whole progression spine is frozen. Tellingly, the tiny 4-crew *starter* on the live build DID close the
  loop (Exits 1/min, Tier 1 fired) — the loop breaks specifically when the station gets dense and its own
  berths/housing aren't wired for departure. The game collapses under its own weight, not at the tutorial.
- **Concrete buildable fix:** Make visitor departure+payout the beating heart. Guarantee a
  visitor-purposed exit berth and pathable exit route (fix the demo-station berths, and add a "no visitor
  exit route" alert so it can never fail *silently*), then put a live **"visits completed / failed / revenue
  this cycle"** ticker at the top of the HUD next to Rating. Until departures fire, rating, credits, and
  reputation are all dead instruments.

### 2. No story generation — the genre's actual product is absent
- **What the greats do:** RimWorld's whole thesis is the AI Storyteller manufacturing legible, escalating
  anecdotes; Dwarf Fortress calls its cascades "fun." The memories you keep are *events*.
- **What this game does:** Across every run, Incidents stayed at 0 and nothing memorable happened. The
  systems for events exist (incidents, fire, maintenance, security) but resolve as passive presence or
  background numbers — which the roadmap itself names as the "Main weakness: too many systems resolve as
  global numbers, passive room presence, or tiny one-off jobs."
- **Concrete buildable fix:** A lightweight **event director** that telegraphs and injects one legible
  crisis every few cycles (power spike, hull breach in sector X, contraband visitor, medbay emergency), each
  with a *named cause* and a *clear player lever*. This is what finally gives the gorgeous overlays and
  inspectors a story to tell.

### 3. Escalation/pacing flatlines — no rising pressure
- **What the greats do:** ONI's CO2/heat creep, DF's deepening threats, RimWorld's raid-point scaling — the
  game leans on you harder over time so standing still is a decision with a cost.
- **What this game does:** The station sat at rating 70 / morale ~100 / 0 incidents indefinitely. The
  "Day N | Cycle X" clock is *cosmetic fiction* (per the trip-wires doc, "the sim has no day concept");
  traffic is jittered checks, not escalating waves; tiers gate *content unlocks*, not *difficulty*. Nothing
  compounds.
- **Concrete buildable fix:** Tie one pressure variable to time/scale — e.g., maintenance debt or
  sanitation drift that compounds if ignored (the plans already sketch "entropy-drift"). Make idleness
  expensive.

### 4. The aggregate readouts *lie*, even though the detail is great
- **What the greats do:** RimWorld's colonist bar and work tab always reconcile with what pawns are doing;
  you trust the summary.
- **What this game does:** The headline crew line reads **"Working 0 | Idle 0 | Resting 0"** while 18 crew
  are demonstrably hauling (the inspector shows them "walking to rawMeal pickup") — logistics/in-transit
  crew aren't tallied. And resident conversion **stalls invisibly**: the trip-wires doc admits "a Dorm
  without adjacent Hygiene + the right policy will never convert anyone — the T5 unlock predicate stalls
  invisibly with no UI hint," which is exactly the "blocked: no free residential berth" dead-end I hit. The
  game's single best asset is its legibility; these two lies quietly undermine trust in it.
- **Concrete buildable fix:** Fix the crew-status tally to count logistics/in-transit/hauling, and add the
  missing "why blocked" hint for resident conversion (a known backlog item).

### 5. Spatial design is *diagnosed* but not yet *dramatized*
- **What the greats do:** Prison Architect and ONI make a bad layout *visibly choke* — queues pile at the
  single door, gas pools in the dead-end, the deadlock is the teacher.
- **What this game does:** It *prints* the right warnings ("single-door bottleneck", "logistics crosses
  public areas", "distant life support") — genuinely ahead of most hobby sims here — but in the played
  result those warnings had no teeth: throughput didn't visibly throttle, no congestion pileup formed, and
  re-layout was never forced.
- **Concrete buildable fix:** Let route-pressure and single-door risk actually *throttle* throughput and
  render a red congestion pileup at the choke, so the warning is a felt consequence and re-planning the
  floor is a real decision.

---

## PLANS AUDIT

The repo carries a genuinely strong, self-aware planning corpus: `VISION_DRAFT.md`, `PRODUCT_PLAN.md`, and a
mature `docs/` roadmap (`15-current-roadmap.md` + three-part plan `16/17/18`, plus system docs `00–13`, a
`99-trip-wires.md` invariants list, and entropy-drift design in `19-*`). It cites the right canon (Space
Haven, Prison Architect, RimWorld, Songs of Syx) and even academic task-allocation work. This is not a
project short on thinking.

### (1) Promised vs delivered — the planned-not-built inventory
The surprise is that breadth is *not* the gap. Per the roadmap's own "Current State," delivered systems
already include: grid/rooms/modules/zones/expansion/save, docks+berths with visitor/residential purpose,
visitors/residents/crew with pathing + inspectors, the food chain with item nodes and transport jobs,
resident conversion / home-ships / housing / taxes / satisfaction / stress / leave intent, room-environment
scoring + route-pressure overlay, needs v0, repair/maintenance/fire/extinguish jobs, construction
blueprints + build jobs + EVA, and a procedural system map with factions/planets/belts/lanes. That covers
most of the VISION's room-network, logistics, population, utilities, zoning, and economy layers at least in
skeletal form.

What's promised but **not felt in play** (built-but-inert, or invisible):
- The **failure cascade** from VISION §16 (hydro → kitchen → cafeteria queue → morale → fights → medbay →
  economy) — never occurred; incidents stayed 0.
- **Reputation → demand feedback** (PRODUCT_PLAN §5.14) — explicitly *not* wired: the docs state "Rating
  does NOT directly affect ship arrivals."
- **Security/incident pipeline, medbay/patients, morgue/death chain, contracts, station identities** — exist
  as scaffolding but produced no visible played consequence in review.
- **Day/night + shift scheduling** (VISION §10) — the clock is cosmetic; there is no time-of-day sim.

So the honest framing: this project's gap is not unbuilt features — it's **built systems that don't yet
produce played consequence.** The roadmap says this itself, verbatim, as its "Main weakness."

### (2) Which planned ideas are worth building (canon lens)
- **Highest value / right gap — KEEP GOING:** Roadmap **Part 1** (living actors, reservations, provider
  model, job board, activity labels, residents-as-society). This is *precisely* the "make work local,
  visible, reserved, inspectable, object-driven" push the game needs, and checkpoints 1–2 are already
  landed (the crew "walking to rawMeal pickup" label is this work paying off). This is the correct #1 bet.
- **High value — the missing escalation:** `docs/19-*` **entropy-drift / maintenance / sanitation
  compounding pressure.** This is the rising-pressure spine the game lacks (Gap 3). Pull it forward.
- **Right idea, wrong order:** **Part 3** (command center, actionable system map, faction contracts, station
  identity). Strategically exciting, but it layers a *new strategic layer on top of an operational loop that
  doesn't yet close.* Canon says don't build the meta-layer until the base loop generates consequence.
- **Over-invested relative to canon:** the **sprite/art pipeline** (many tools, branches, worksheets). The
  art is already good enough to ship a review that reads well; further sprite iteration is polishing a
  diorama that doesn't play yet. Honestly: pause it.

### (3) Missing from the plans entirely that the genre says matters
- **An explicit AI storyteller / pacing director.** The plans have "advanced incidents" buried in Part 3,
  but nowhere is the *director that manufactures legible, escalating anecdotes* framed as the game's primary
  product. This is the single biggest conceptual absence, and it's the whole ballgame in this genre.
- **A named plan to close the front-of-house reward loop** (visitor exit + payout + reputation→demand). It's
  implied across economy docs but not owned as a near-term deliverable — and it's the thing currently
  freezing all progression.
- **Fail-forward stakes.** Soft-fail-only is a fine philosophy, but there's no plan for *what makes standing
  still cost you.* The entropy-drift idea is the raw material but isn't tied to the core loop as the
  escalation engine.

### (4) What to EDIT/redirect rather than build as written
- **The Day/Cycle clock:** either make time *real* (shifts, demand rhythms — the VISION already wanted shift
  scheduling, and it'd supply the pacing texture the game lacks) or relabel it to a plain "Cycle N." A
  cosmetic calendar that implies time-of-day gameplay which doesn't exist is a legibility liability.
- **Reputation (PRODUCT_PLAN §5.14):** the plan wants reputation→demand but the code deliberately decouples
  them. Promote "close the reputation→demand feedback" from "later flavor metric" to a first-class near-term
  item — it's actually core to the reward loop, not flavor.
- **Part 3:** redirect only the *incidents* slice forward as the story-director MVP; defer the system-map /
  contracts strategic layer until the operational loop closes.

---

## WHAT BMO WOULD BUILD NEXT (smallest first)

1. **Fix the two legibility lies** — make the crew-status tally count logistics/in-transit crew, and add the
   "why blocked" hint to stalled resident conversion. *Smallest, lowest-risk, and it protects the game's best
   asset (its diagnostics) from quietly losing the player's trust; the resident hint is already flagged in
   the trip-wires backlog.*
2. **Close the visitor loop** — guarantee a visitor-purposed exit berth + a front-and-center "visits /
   revenue this cycle" ticker, plus a silent-fail alert. *This is the right gap and the true blocker:
   until departures+payout fire, rating, credits, and reputation are inert instruments. It's adjacent to the
   planned Part-1 provider/reservation work but not explicitly targeted by it — REDIRECT a slice of Part 1
   to own exit+payout.*
3. **Add the event director + one compounding pressure variable** — a telegraphed crisis every few cycles,
   and a maintenance/sanitation drift that punishes idleness. *This is what converts a stable diorama into
   the anecdote-and-escalation engine the genre lives on. PLANNED (docs/19 entropy-drift + Part-3 incidents)
   and also the right canon gap, so it gets priority over the rest of Part 3.*

---

## SCREENSHOTS APPENDIX

All paths under `/tmp/claude-1002/-home-claudebot-claude-discord-bmo/3432d9ae-33e7-49fa-97f9-ea9be039493d/scratchpad/shots/`:

- `01-boot-default.png` — live `/spacegame/` default boot (starter box, 4 crew, Tier 0 task).
- `sg/D2-demo-fit.png` — current build, `?scenario=demo-station` loaded: dense 18-room station (paused).
- `sg/D4-run-mid.png` — demo running, visitors arriving into corridors.
- `sg/D6-run-late.png` — demo at Cycle 3: 36 visitors / Exits 0/min, layout-friction warnings, power deficit.
- `sg/T-overlays-on.png` — Air-Coverage overlay + full DIAGNOSTICS panel (the legibility strength).
- `sg/T-ROOMS.png`, `sg/T-CREW.png` — the ROOMS build palette and the CREW role/hiring system.
- `sg/I-hydroponics.png` — crew inspector ("Crew #16: logistics | walking to rawMeal pickup | healthy").
- `sg/L1-live-run20.png`, `sg/L2-live-run50.png` — live `/spacegame/` early game; Tier 0 → Tier 1 fires.

Supporting data (same scratchpad): `shots/sg/demo-log.json` (demo metric timeline), `shots/sg/inspect-log.json`
(tabs/overlays/inspectors), `shots/live-log.json` (live run), `soak.json`/`soak2.json` (headless soaks —
stale 60x40 build only; cited as history, not live behavior).
