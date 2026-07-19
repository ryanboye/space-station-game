# Space Station — Why It's Deterministic, and What Actually Creates Choice

Fable, design pass 5. The owner's diagnosis, verbatim, is the brief:

> "i literally draw my cafeteria, kitchen, and grow area in the same spot every time i try this
> game and then i just click the play button and amass credits."
> "any attempts to guide the user to choose where to place just results in another RULE that just
> dictates a DIFFERENT place or thing to do. its so formulaic and deterministic."

He is right, the trap he names is real, and it has a formal shape. This report: (1) why the game
is deterministic — grounded in the actual code; (2) the design law that explains why added rules
never helped; (3) how the great replayable sims manufacture non-determinism; (4) concrete
mechanics for THIS game, each judged by whether it breaks the one-optimal-build; (5) an honest
verdict on the crowd/queue direction.

---

## 1. THE DIAGNOSIS: every axis of variety is a constant

A management sim has six inputs that can vary between runs. In this game, all six are frozen:

| axis | what the greats vary | what this game does |
|---|---|---|
| **Map** | ONI's asteroid + geyser lottery; DF's embark site + hidden geology; AtS biomes | Uniform void. Every tile identical. Starter hull identical. `createInitialState()` boots with a **hardcoded seed (1337)** — even the RNG stream is the same every run (`initial-state.ts:61`, called with no args from `main.ts:852`) |
| **Agents** | RimWorld pawns (traits/skills/health), PA intake mix | Crew are fungible integers — no traits, no skills, no salaries that differ. Visitors: 4 archetypes with fixed constants (`ARCHETYPE_PROFILES`, `sim.ts:3437`) — statistically identical stream every run |
| **Demand** | AtS orders, PA intake waves, RimWorld quests | A stationary arrival process: fixed cadence (slider), fixed pod sizes, fixed archetype mix. By the law of large numbers every run converges to the same average problem — so the same answer wins |
| **Prices/economy** | market swings, scarcity events, trade opportunities | Every rate is a compile-time constant (`PROCESS_RATES`, payouts, payroll, material price). Nothing is ever scarce or expensive *this run in particular* |
| **Events** | RimWorld storyteller, FTL nodes, ONI cascades | Incidents exist (fire/crime/heat) but are background noise, not run-shaping shocks (measured across three review passes: zero forced re-plans in ~30 hours of instrumented sim time) |
| **Tech path** | StS drafts, AtS blueprint drafts, research-under-pressure | One linear tier ladder, fixed predicates, fixed unlock list. The "next thing" is always the same next thing |

With all six inputs constant, the only variable left is the player's layout — and layout is a
deterministic optimization over uniform space whose rules reference only *other placed things*
(distance-to-dock, adjacency, crossing-flows). A deterministic objective over a fixed input has
an argmax. The player finds it once, and the game is over forever. **The most damning receipt:
our own project memory contains the answer key** — there is literally a saved note titled
"Spacegame T2 recipe: 6-room starter-box layout + food-chain preset + 16 crew + Dock at (30,13)."
When your development notes contain the wiki page for the optimal opening, the game is solved by
construction.

## 2. THE DESIGN LAW the owner discovered (and a razor for every future proposal)

**Adding a deterministic rule to a deterministic optimization never creates a decision — it
relocates the argmax.** Logistics-mustn't-cross-visitors, adjacency bonuses, noise penalties:
each changes *where* the single best build is, not *whether* there is one. That's why "many
layers" (maintenance, thermal, sanitation, route pressure, reputation, crime) added up to zero
choices: they are all static terms in one static objective function.

A rule produces a *choice* only when its binding direction is **unknown or different at decision
time**. Three and only three ways to get that:

1. **Vary the inputs** (map/demand/agents/prices differ per run) → the same rule binds
   differently each run → the answer must be re-derived, not recalled.
2. **Hide information / make outcomes stochastic** → the decision becomes a bet, and bets have
   no dominant strategy, only judgment.
3. **Offer drafted options** (pick 1 of 3, offers differ every time) → even with full
   information, the option SET varies, so no fixed recipe exists.

**The razor for every future mechanic proposal: "Could a wiki page tell the player the right
answer?" If yes, it's a rule, not a choice — it will be optimized once and become furniture.**
(Test the current game: every single system passes the wiki test. Tax slider: wiki says max it /
zero it — measured monotone both ways. Layout: wiki says the T2 recipe. Traffic slider: wiki
says it's fake — measured inert. Stove count: wiki says one.)

## 3. PRIOR-ART ANATOMY — how the replayable sims do it

- **RimWorld** varies agents + events: pawns are random constraint-bundles (this run's cook is a
  pyromaniac — plan around it), and the AI Storyteller injects stochastic, escalating events so
  "no two playthroughs are the same [and players] adapt and make tough decisions" — explicitly a
  *story generator* rather than a puzzle with a solution ([design analysis](https://zaydqazi.substack.com/p/the-story-generator-a-game-design),
  [storytellers](https://rimworldwiki.com/wiki/AI_Storytellers)). Note the structure: huge player
  freedom, then the game "takes back some of that freedom by challenging the player with random
  events."
- **Dwarf Fortress** varies the map and hides it: embark = choosing your constraint bundle;
  geology is discovered by digging — exploration as information gambling.
- **ONI** varies the map: the geyser lottery famously reshapes every colony's strategy — the
  physics are deterministic, but the *question* differs, so the wiki can teach you techniques,
  never your colony's answer.
- **Slay the Spire** drafts everything: pick 1-of-3 cards, pathing on a random map, relics that
  warp the build. Every choice is a commitment made under an option set that never repeats.
- **Against the Storm** is the existence proof for this exact genre problem — a city builder that
  went full roguelite: each settlement gets a random biome, random drafted BLUEPRINTS (you don't
  even get the same production chains), random orders and events, and ends the run before mastery
  becomes routine. "Different buildings available, different challenges, different environments…
  no two runs are ever the same" ([Game Developer interview](https://www.gamedeveloper.com/business/how-against-the-storm-managed-to-mix-city-building-and-roguelite-play),
  [review](https://rogueliker.com/against-the-storm-review/)). It works precisely because the
  drafting attacks the "city builders get solved" disease at the input level.
- **Counter-example worth knowing: Frostpunk** is mostly deterministic — and it's a masterpiece
  *once*. Its replay value is famously thin. A deterministic management game can be a great
  10-hour experience; it cannot be a 100-hour game. Our owner's complaint pattern is the Nth-run
  pattern — he has already had the first run.

The four sources, ranked by how directly they attack the memorized opening: **drafted options >
input variation > hidden info > emergent interaction.** The current game has none of the four.

## 4. PROPOSALS — mechanics for THIS game, judged by the razor

Ordered by leverage. Each: the mechanic, which determinism it breaks, why no dominant strategy,
what it reuses, cost, risk. All of them reuse systems that already exist and sit inert — the
pattern of every review so far.

### P1 — THE DOCKING DRAFT (keystone). Ships are offers you accept or refuse.
- **Mechanic:** kill the anonymous traffic stream. Ships HAIL the station as discrete, visible
  offers on a short timer — 1-3 available at a time, StS-style: *"Tourist liner 'Meridian' — 14
  passengers, high spenders, expects lounge + observatory, pays dock fee 40cr"* / *"Ore hauler —
  pays in 120 materials, 3 rough crew, +wear on the dock"* / *"Unregistered freighter — double
  fees, hidden manifest, ☠ risk hint."* Player accepts by assigning a berth (berth size/class
  already matters), declines otherwise. Offer generation is seeded per run; composition drifts
  with reputation and story beats.
- **Breaks:** demand-determinism at the exact point the whole service loop feeds from. The
  minute-to-minute decision the game lacks ("click play and amass credits") becomes: *what do I
  let aboard, given my current kitchen/queue/security state?*
- **No dominant strategy because:** the option set never repeats, offers trade on incommensurable
  axes (credits vs materials vs passengers vs risk vs reputation), and the right answer depends
  on your CURRENT bottleneck — which the crowd loop makes visible on screen. Accept-everything
  drowns your cafeteria (visible queue collapse — measured: over-capacity = storm-off cascades);
  accept-nothing starves you (payroll knife-edge, measured).
- **Reuses:** `generateShipManifest` (exists), ship types/classes (exist), berth
  size/screening/customs policy per berth (exists — `setBerthScreeningLevel`!), reputation
  (exists), the crowd loop (round 1-2).
- **Cost:** medium — offer queue + accept UI + offer gen. **Risk:** pacing (offers must not spam;
  timer pressure tuned gentle). This is Against-the-Storm's orders + StS's draft translated into
  the game's existing fiction. Do this first.

### P2 — THE STARTING LOT (embark). Never the same blank box twice.
- **Mechanic:** run starts on a generated derelict/lot, chosen from 3 (DF embark): pre-existing
  hull with rooms in different shapes/positions, some damaged (repair = the construction system,
  exists), a salvage cache here, a hull breach there, debris fields constraining expansion on a
  random side, maybe a functioning-but-misplaced legacy room ("the old cantina is weirdly far
  from the dock — live with it or rebuild it").
- **Breaks:** the memorized opening *directly* — "I draw my three rooms in the same spot every
  time" is impossible when the hull shape, anchor points, and free faces differ per run. Layout
  skill becomes *adaptation* (reading THIS lot) instead of recall.
- **No dominant strategy because:** the lot choice itself is a tradeoff bundle (bigger hull vs
  better dock face vs free salvage), and the right build is conditional on it.
- **Reuses:** construction/blueprints/EVA repair (exist), the demo-station programmatic room
  painter (exists — it's the lot generator's skeleton), map-conditions system (exists).
- **Cost:** medium. **Risk:** generator quality; start with hand-authored lot templates + seeded
  damage/salvage placement (template × perturbation is 90% of the value at 20% of the cost).

### P3 — DILEMMA DIRECTOR. Events that are choices, not chores.
- **Mechanic:** on a pacing clock (Cassandra-style ramp), inject FORCED dilemmas with two
  legitimate answers and delayed consequences, sourced from the built-but-inert faction/system
  map: *"Plague ship requests emergency docking — take it (quarantine clinic, infection risk,
  faction gratitude) or refuse (rep hit, they limp away)"* / *"Customs sweep: surrender the
  smuggler you've been hosting (lose his fat fees) or hide him (☠)"* / *"Miners' strike on the
  belt: ore prices 3x for two cycles — stockpile or switch the workshop off?"*
- **Breaks:** the wait-state. Standing still stops being free; the run acquires a spine of
  irreversible choices that compound into *this run's story*.
- **No dominant strategy because:** outcomes are probabilistic and consequences are delayed and
  situational (the plague ship is a different question when your clinic is next to the cafeteria).
- **Reuses:** incidents/security/clinic/brig (exist), factions + lanes + system map (exist,
  inert), reputation zones (exist), the alert/event feed (round 1).
- **Cost:** medium, content-driven — 10-15 authored dilemmas with seeded parameters beats a
  grand systemic director for v1. **Risk:** popup fatigue — keep frequency low (one per 2-4
  cycles), always diegetic (a ship, a person, a room — never an abstract card).

### P4 — CREW ARE PEOPLE (the RimWorld organ). Hire from a random applicant pool.
- **Mechanic:** applicants arrive with the traffic (they're ON the ships — P1 synergy): each a
  name, wage demand, 1-2 traits that touch real systems — *fast cook* (stove rate ×1.5), *slob*
  (dirt aura), *charming* (nearby queue patience +), *ex-con* (cheap, security posture worse),
  *narcoleptic* (random naps). Small pool, refreshes with traffic; firing has a cost.
- **Breaks:** staffing as arithmetic. "Who do I hire with the wages I can afford" becomes a
  per-run hand of cards; the station build bends around who you actually got (the great cook
  makes the big cafeteria worth it — THIS run).
- **No dominant strategy because:** the pool is drafted, traits trade on different axes, wages
  price them situationally.
- **Reuses:** staff roles/specialties (exist: `STAFF_ROLE_DEFINITIONS`, specialty progress),
  payroll knife-edge (round 1 — wages now matter), crew inspector (exists).
- **Cost:** medium-high (trait hooks into sim systems + hiring UI). Highest anecdote yield per
  feature in the entire plan — traits are what players screenshot.

### P5 — UNLOCK DRAFTS. Pick your station's identity, 1 of 2-3, each tier.
- **Mechanic:** replace the linear tier list with exclusive-choice packages at each milestone:
  *Entertainment permit* (cantina/lounge line) vs *Industrial license* (workshop/cargo
  contracts) vs *Medical certification* (clinic/plague-ship handling). Chosen package shifts P1's
  offer mix (entertainment stations get liners; industrial get haulers) → the run's traffic,
  layout, and dilemmas all diverge from the choice.
- **Breaks:** the fixed build ORDER — the other half of the owner's memorized loop ("unlock
  lounge → build one; unlock hygiene → build one").
- **Reuses:** the tier system (exists), station-identity/specialization concept (already in the
  roadmap as inert end-game flavor — promote it to a run-defining draft), command departments
  (exist).
- **Cost:** low-medium — mostly content regrouping + one choice UI. Highest ratio of replay
  value to engineering in the list after P1.

### P6 — ECONOMIC WEATHER (cheap compounder). Prices and mixes that move.
- **Mechanic:** seeded per-run price/demand curves + occasional shocks announced a cycle ahead
  ("fuel spike: ship fees +50% for 3 cycles", "festival: tourist pods double this cycle").
  Visible as one ticker line, not a spreadsheet.
- **Breaks:** stockpile/build timing as fixed ritual; gives P1 offers changing context (the same
  ore hauler is a great deal during the spike).
- **Cost:** low. Weak alone; multiplies P1/P3. Do it alongside, not instead.

### Sequencing and the composed run
**P1 → P5 → P3 → P2 → P4 → P6.** (P2 lot-gen can swap earlier if the memorized-opening sting is
the priority; it's the most surgical answer to the owner's exact quote.) The composed experience:
*embark on a lot you've never seen, take the docking offers your reputation earned, staff the
counters with whoever answered the ad, weather the dilemma the director dealt, and pick which
station this run becomes.* The same station never happens twice — not because the rules changed,
but because the QUESTIONS did.

### What NOT to do (the razor applied)
- **No more placement rules** (adjacency bonuses, crossing penalties, coverage radii as *scored
  rules*). Every one relocates the optimum and adds a panel. Physical/visible consequences
  (queues, crowds) are fine — they're legibility, not choice — but they must be fed variable
  inputs to matter repeatedly.
- **No difficulty sliders / global multipliers** — they rescale the solved puzzle without
  unsolving it.
- **No new simulation layers** (weather-as-simulation, plumbing, gas mixtures…) until the
  input-variance layer exists. Depth without variance = more constants to optimize once. This
  was the story of the last six systems added; it will be the story of the next six unless the
  variance comes first.

## 5. HONEST VERDICT ON THE CROWD/QUEUE DIRECTION

The crowd loop (rounds 1-2) is **necessary and not sufficient — the owner's instinct is
correct.** What it actually bought: the sim's consequences became *visible and legible* (queues,
storm-offs, priced walk-offs, death alarms), and the service pipeline now has real dynamics
(pulse/strain/drain — measured). That is the STAGE. But a visible deterministic system is still
deterministic: with fixed pod sizes and fixed counter rates, "two counters + one stove per N
traffic" is a wiki answer like everything else. If we stop here, the owner will learn the counter
ratio in one evening and be exactly as bored, with better animation.

The crowd loop's real value is that it is the **display surface for the variance layer**: P1's
accepted liner disgorging 20 tourists into a cafeteria you sized for haulers is a *watched
consequence of a choice you made under uncertainty* — that's the moment the two halves click.
Feed the stage a different play every run. Don't rip it out; don't polish it further until P1
exists either.

## The one-line answer to the owner

The game is deterministic because all six inputs a sim can vary are constants (down to a
literally hardcoded RNG seed), so every rule we add just moves the single optimum — and the fix
is not another rule but **drafted, seeded, situational INPUTS** (which ships to admit, what lot
you start on, who applies for work, which dilemma hits, which identity you pick), so that the
question — not the rulebook — changes every run, and layout mastery becomes adaptation instead
of recall.

*Sources: [Against the Storm — Game Developer interview](https://www.gamedeveloper.com/business/how-against-the-storm-managed-to-mix-city-building-and-roguelite-play) ·
[Against the Storm — Rogueliker review](https://rogueliker.com/against-the-storm-review/) ·
[RimWorld storyteller design analysis](https://zaydqazi.substack.com/p/the-story-generator-a-game-design) ·
[RimWorld AI Storytellers](https://rimworldwiki.com/wiki/AI_Storytellers) ·
[RimWorld/DF procedural storytelling](https://www.gamedeveloper.com/design/rimworld-dwarf-fortress-and-procedurally-generated-story-telling) ·
prior measured evidence: SPACEGAME-COREloop-SPEC.md (passes 2-4).*
