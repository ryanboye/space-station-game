# ASSESSMENT SYNTHESIS — The Decision Map (v3)

*Stitches together: AUDIT-A (code inventory), AUDIT-B (genre taxonomy + PART 1E expansion), SPACEGAME-DETERMINISM-RX (the determinism law), the peer's design synthesis AND taxonomy review (TAXONOMY-REVIEW.md), and the owner's brief. This document positions the game, lays the viable paths side by side, and ends with the questions that decide between them — it does not pick the winner.*

**v3 revision notes:** the taxonomy spine is now the peer's seven **player-behavior loops** — categories named by what the player repeatedly manipulates, not by scale or presentation (adopted in full; it is the direct answer to the owner's "what does the user actually DO" question). Our game is repositioned per that review as *lightweight station tycoon × institution/service operations* with several latent neighbors — not one predetermined identity. Every path is now framed as "which neighboring loop do we borrow from," and a sixth live path (G — Political-Economy Station) is added on the peer's recommendation. Carried forward from v2: the roguelite/choice-buff veto, the persistent-station premise, the stakeholder-channel elevation, deep minute-to-minute play-feel, per-path "how our game becomes this," and two-gap scoring.

---

## The two problems (hold this frame for everything below)

Every complaint in the owner's brief resolves into one of two orthogonal gaps:

| Gap | Owner's words | What fixes it | What does NOT fix it |
|---|---|---|---|
| **The actuator gap** | "you just turn on the simulation and let it accumulate credits… there's nothing you really have to do" | Wiring sensors → felt consequences. The audit found the codebase repeatedly builds the *sensor* and the *display* but not the *actuator* — measured numbers reach traffic, money, speed, or destruction only for air, theft, and the food/market chain. Seven cheap missing wires are ranked and named. | More systems, more panels, more overlays. Each new sensor drains into the same dead bus. |
| **The variance gap** | "I draw my cafeteria, kitchen, and grow area in the same spot every time… so formulaic and deterministic" | A variance generator: seeded, situational *inputs* that change the question each session. All six axes a sim can vary (map, agents, demand, prices, events, tech path) are currently frozen constants — down to a hardcoded RNG seed (1337). | More rules. The determinism law: *adding a rule to a deterministic optimization relocates the argmax, it doesn't create a choice.* The razor: if a wiki page could tell you the right answer, it's a rule, not a choice. |

**They are independent, and both are real.** Wiring actuators alone gives you a game with consequences that is still solved once. A variance generator alone deals different situations whose consequences still can't bind. Every path below is scored on how far it moves *each* gap — plus fit to the north star: the owner's Expanse fantasy, *"start scrappy and become the CEO of a thriving solar-system station."*

### The kind of variance matters: WORLD variance in, choice-buff variance out

Not all variance is welcome, and the owner has drawn the line explicitly. The distinction runs through this entire document:

| | **WORLD / SITUATIONAL variance — WANTED** | **Choice-buff variance — REJECTED (owner veto)** |
|---|---|---|
| What it is | The *situation* changes under the player: which ships arrive, what the regional economy wants, which stakeholder is leaning on you, what state the station inherited, what prices are doing | The *player's powers* change via meta-picks: pick-a-card perk drafts, buff/debuff selections, blueprint lotteries, run-modifier menus |
| Where it lives | In the fiction — a ship on approach, a person with a demand, a price on a ticker, a scar on the hull | In an abstract UI layer floating above the fiction |
| Examples | Berth admissions, stakeholder mandates, economic weather, inherited/damaged starts, state-aware events | "Choose 1 of 3: +15% stove speed / cheaper hires / bonus rating" — blueprint drafts, roguelite perk screens |
| Owner verdict | "This" — the Expanse fantasy runs on it | "Those are so annoying" |

The peer review adds a useful test we adopt: *finite physical ship traffic is not a "draft."* Berth scheduling and admission are ordinary operations mechanics when ships exist in the world with positions and timing; they only become card-like when abstracted into offers detached from space and time. Our docking mechanic must stay on the physical side of that line.

Also settled alongside the veto: **this is ONE persistent station grown across sessions, not a run-based game.** Every surviving path below is a persistent-station path, and every variance mechanic below is world variance delivered diegetically.

A third lever is **game feel / watchability** — visible agents physically executing direct-manipulation orders, numbers rendered as matter, incidents as scenes not list rows. Per the peer review we now treat this as **necessary infrastructure for every path**, not an optional bonus; what differs by path is how much of the path's *identity* depends on it, which each dossier states.

---

## 1. Where our game sits today

**Position (per the peer's taxonomy review, adopted):** the game currently sits in **institution/service operations crossed with a lightweight station tycoon**. Its most complete chain is berth → visitor → service rooms → credits; its most valuable spatial foundations are circulation, queues, jobs, logistics, and room service. v1 of this document called it "a throughput-of-chaos sim with the chaos removed" — memorable, but too confident about a single home: the honest picture is *two* home loops (service operations + lightweight tycoon), both under-activated, surrounded by **five latent neighbors** the code already gestures at. That's what the audit's SUBSTANTIVE/LATENT/DECORATIVE census shows when re-read through the loop lens:

| Player-behavior loop | What we already have | Why we don't actually play there yet |
|---|---|---|
| **L4 Institution/service ops** *(home)* | The berth→visitor→service→credits chain; queues; staffed posts; the incident pipeline | Visitors aren't differentiated or adversarial enough to create Prison-Architect-style behavioral pressure; admission is automatic; failures are list rows |
| **L1 Production/logistics** *(home, lite)* | Food & trade chains; haul jobs; materials market | Economy too shallow for production *strategy* — nothing is ever scarce, priced, or contested; one stove ≈ 20× demand |
| **L3 Environmental engineering** | Air, thermal, fire, power, 7 utility layers | Not consequential: thermal ends in a metrics mirror, fire is unreachable, 6 of 7 utility layers are inert, power never binds |
| **L5 Agent-story colony** | ~1,000 lines of crew needs; resident moods; clinic | People aren't distinctive — no traits, no names that matter, nobody worth watching; residents can't even leave |
| **L6 Society/political-economy** | System map + 6 faction templates; residents, civic roles, taxes; district reputation; command layer | All latent — factions re-weight a spawn table a few percent; nobody has interests, power, or an opinion of you |
| **L2 Network/land-use planning** | Corridors, route-pressure overlays, expansion purchases | Station too small for network effects; expansion is a timer, not a siting decision |
| **L7 Crisis governance** | The O5 "failure director"; incidents | No escalation, no forecast, no irreversible policy — the director rolls invisible 3-second debuffs |

**What we are:** a service-station operations sim with a genuinely load-bearing core (berths/docks → ships → visitors → food + market + drips → credits, hauled by a real logistics engine), one real killer (air), one real credit sink (expansion), one closed feedback loop outside the food chain (theft ↔ district memory), the genre's best telemetry UI pointed at meters nothing consumes — and, quietly, ~80% of a berth-admission system (size classes, capability modules, screening/customs, 6–34-passenger stakes) missing only the admission decision itself.

**What we are not (yet):** a story generator (crew are fungible integers with bladder timers); an engineering game (physics without consequences); a polity (factions without interests); a pressure-cooker (a director that directs nothing); or watchable (every click is a form, every consequence a list row — a dashboard *about* a place rather than a camera pointed *at* one). And the optimal build is readable straight off the constants — exactly seven credit inflows exist, and nothing that goes wrong can reach the number going up.

**The consequence of sitting between two under-activated home loops with five latent neighbors:** the foundation supports *several* nearby pivots, not one predetermined identity. The path slate in section 2 is exactly that: each surviving path names **which neighboring loop it borrows** — and the decision the owner faces is, in the peer's words, *what object should the player repeatedly inspect, manipulate, and improve?*

**Load-bearing today:** D4/D5 docks & berths, S1 visitor spine, S2/S3 food & trade chains, P2 job board, V1/V2 air, M2 expansion, O2/O3 incident pipeline + district memory.
**Decorative today (standing cut list — no further investment until actuators exist):** P4 command/bridge-terminal zoo, V9 utility layers ×6, V3 thermal, P6 morale, S7 rating bus, D2 system map/factions, V5 meteors, S5 tax slider, P3 priorities panel, M5 environment micro-ticks.

---

## 1B. The seven loops — what the player actually does, minute to minute

The taxonomy that organizes this page classifies by **the player's recurring verb** — what you repeatedly inspect, manipulate, and improve — not by scale or presentation. (This is the peer's re-slice of the earlier six-archetype cut, adopted because the old cut mixed three analytical levels: manipulation object, campaign pacing, and variance delivery. Pacing and variance are handled separately — see the cross-cutting dimensions below and the channels in 1C.) For each loop: the references, what your hands are literally doing, the one decision that repeats forever, a 60-second slice of real play, and where the fun lives.

### L1 — Production & logistics optimizer (Factorio, Anno, transport games)

**Your hands:** placing producers and consumers and connecting them — belts, routes, ships, rails — then hovering machines to read rates, walking a line upstream to find the starvation, and stamping down a bigger rebuild of a block you built two hours ago.

**The one repeating decision:** *where is throughput being lost — and is the right response more capacity, a shorter route, storage, prioritization, or a different production chain?*

**60 seconds of play:** The circuit assemblers downstream keep blinking empty. Walk the belt upstream: copper's fine, iron plates are trickling. Hover the smelter column — running, but the ore belt feeding it is patchy, and the patch behind it is visibly thinning. The real decision arrives: squeeze another hour out of this patch by rebalancing splitters, or commit to the outpost — rail line, defenses, the works. You stamp the rail blueprint. The factory must grow.

**Where the fun is:** visible causality and elegant automation — a bottleneck is a *starving belt you can see*, not a red number — plus the scaling spectacle. Numbers rendered as matter.

### L2 — Network & land-use planner (SimCity, Cities: Skylines)

**Your hands:** drawing — roads in long spline strokes, zone colors painted onto blocks, service buildings with visible coverage circles, transit lines — then reading: three demand meters, half a dozen heatmap overlays, and the beloved move of clicking one truck or one citizen and following them across the whole map to see your system through their commute. This is not simply "macro": it is specifically **indirect growth through networks and fields** — you draw the framework; the place grows itself into it.

**The one repeating decision:** *which network or land-use change relieves this local problem without exporting it somewhere else?*

**60 seconds of play:** The traffic overlay glows an angry red at one interchange. Zoom down from god-view until individual trucks resolve, stacked bumper to bumper. Follow one — it's hauling ore across town straight through your commuter core, because the highway you built five hours ago made that the shortest path. Zoom out. Draw a one-way industrial loop skirting the city, demolish two ramps, and watch the pathing recompute and spread through the grid like dye dropped in water. The red cools to orange. The residential demand meter is starving; you paint six new blocks on the hill with the view, because land value.

**Where the fun is:** watching a self-organizing place emerge from the framework you drew. The known disease: no external counterparty, so a solved city goes quiet — the weakest run-to-run variance in the genre.

### L3 — Environmental systems engineer (Oxygen Not Included, Stationeers)

**Your hands:** flipping overlay goggles (heat, gas, plumbing, power, germs), tracing a failure to its physical source, then drawing infrastructure tile by tile — pipes, wires, insulation, pumps — and stamping priorities so the workforce builds it in the right order. Half reading X-ray views, half redrawing plumbing the last solution obsoleted. (Factorio does *not* belong here — routing a logistics network and taming physical transformation produce different decisions; that split is load-bearing for our path choice.)

**The one repeating decision:** *how do I transform this physical problem without creating a worse one?* Every solution excretes a byproduct — heat, CO2, waste — and it has to go somewhere.

**60 seconds of play:** Temperature overlay on. The farm tiles are creeping orange — two degrees from crop death. Trace the gradient: it's bleeding through the wall from the new generator room. Pause. Sketch an insulated double-wall, mark the generator for relocation, drop a cooling loop through the water tank. Queue the digs. Unpause — dupes swarm the blueprint, and you watch the orange bloom slow, stall, and begin to fade. Somewhere else, the grid you just loaded browns out.

**Where the fun is:** mastering lawful physical causality — "I built that and it RUNS." The world is law-abiding; failure is always your own readable mistake.

### L4 — Institution & service operator (Prison Architect, Two Point Hospital, Startopia) — *our home loop*

**Your hands:** conducting a flow of people through a facility you design. You run at 1×–3× watching bodies stream through your architecture, then swoop: drag out a new room, drop a serving table, hire two staff, adjust a schedule, click a trouble spot to see who's misbehaving. The cursor lives in the world — dragging, dropping, occasionally slapping. (The peer's correction to v1's "throughput-of-chaos" label: chaos is optional — *population flow under rules* is the defining structure. Startopia lives here; Tropico does not.)

**The one repeating decision:** *how should this facility process these people — safely, quickly, profitably — and what do I change so the next wave digests?*

**60 seconds of play:** The lunch bell rings. Three hundred prisoners funnel toward the canteen and you watch it like weather — two serving tables drown, the queue snakes into the yard, tempers visibly fraying. Pause. Drag a third serving table, punch a second door through the west wall, reroute a guard. Unpause. The flow re-forms around your edit like water. Then a shiv flashes where two gangs crossed in the corridor YOUR layout created — click it, watch guards drag both to solitary, and make a note: separate those wings.

**Where the fun is:** watching architecture and policy digest unpredictable human flow. Every incident is a design critique; every fix is visible in the next wave. This is the warden/operator fantasy — and one of our two home loops.

### L5 — Agent-story colony (RimWorld, Dwarf Fortress, small-scale Space Haven)

**Your hands:** hovering over people. Mostly paused or at 1×, cycling colonist cards — moods, wounds, relationships — dragging priorities in a work grid, drawing zones, queueing one surgery, forbidding one door. You never steer anyone directly; you arrange their world and their to-do lists, then watch them interpret you.

**The one repeating decision:** *who can do this, what must be sacrificed — and whose personal situation makes the obvious plan dangerous?*

**60 seconds of play:** A raid siren. Pause. Click each of the three raiders — pistols, one doomsday rocket, bad news. Draft your four fighters; drag them behind sandbags; check the pyromaniac's mood — 34% and falling, he's a risk. Unpause. Gunfire. Your doctor takes a graze; the pyromaniac snaps mid-fight and wanders off to light your rice field. Pause. Undraft one fighter to arrest him, re-form the line, unpause, hold your breath.

**Where the fun is:** attachment, improvisation, and the anecdote factory. Every event threatens *someone you know*; every scar becomes a story you retell. Losing is content.

### L6 — Society & political-economy manager (Songs of Syx, Tropico, late-scale DF)

**Your hands:** allocating groups, not individuals — labor sliders, class and species panels, imports, rights, edicts, districts. Reading the citizen almanac (in Tropico, every citizen inspectable *with their opinion of you*), placating faction leaders, and placing buildings *as political acts*: the tenement placates one constituency, the casino delights another and enrages a third. At scale, individuals deliberately fade into statistics and you govern through aggregates — Songs of Syx *transitions* into this loop as you grow.

**The one repeating decision:** *which group or sector benefits from this policy, who pays — and does the resulting coalition hold?*

**60 seconds of play:** Election in fourteen months; approval at 48%. The capitalists want a bank; the communists want housing; the religious faction is furious about the casino that's been quietly feeding your Swiss account. Open the almanac — the fishermen's district swings this vote. Build tenements by their docks (communists up, treasury down), promise the bank in a speech you'll have to honor, and quietly raise the militia wage, because the generals' loyalty number is sitting at 41 and coups start at 40. Your private ledger ticks. The ship of state holds — this term.

**Where the fun is:** statecraft — competing constituencies with structurally incompatible demands, realpolitik over purity, and the scale transition where a settlement becomes a civilization and you become an institution. This loop is where the operator→CEO *transition* natively lives.

### L7 — Crisis governance (Frostpunk; Surviving Mars scenarios)

**Your hands:** rationing under a forecast. Dragging workers between workplaces that all need them, hovering over irreversible policy choices you don't want to sign, reading the threat forecast like a defendant, dispatching scouts, triggering emergency shifts and paying for them in the morning. *(The peer's caveat, adopted: this is partly a pacing architecture layered over another sim rather than a fully independent loop — but its recurring decision is distinct enough to keep on the map.)*

**The one repeating decision:** *what must I sacrifice now to survive the next threshold — and what kind of society does that make?*

**60 seconds of play:** The forecast ticks: −60° in two days. Count your coal days on your fingers: not enough. Options: emergency 24-hour shift at the mine (someone may die), or the child-labor law sitting unsigned in the Book of Laws. You hover over the signature. Hesitate. That hesitation — measured in real seconds of not clicking — IS the game. Sign it. Discontent lurches; a delegation forms at your doorstep; hope wobbles. The generator keeps humming, and you did that, and you know what it cost.

**Where the fun is:** tension, irreversible tradeoffs, and being judged by the ending. Enormous intensity, famously thin replay — a masterpiece *once*.

### Removed from the loop list: "roguelite drafted builder" — a format, not a loop *(and owner-vetoed)*

The peer review and the owner's veto land on the same verdict from independent directions. Taxonomically, run-based drafting is a **campaign/variance format** layered onto some other loop, not a kind of play — Against the Storm is a production-logistics game wearing a bounded-run format. And by taste, the owner rejects both halves: disposable stations invert the persistent-CEO arc, and pick-a-perk drafts are "so annoying." What survives is only the underlying mathematics — *non-repeating option sets defeat wiki answers* — delivered as world variance (ships, applicants, mandates, prices) inside a persistent station.

### Cross-cutting dimensions (plot any proposed identity on these independently)

Persistent station ↔ bounded runs *(settled: persistent)* · individual people ↔ aggregate populations · direct intervention ↔ indirect policy/design · stable optimization ↔ state-contingent adaptation · continuous sandbox ↔ scheduled pressure cycles · authored world ↔ generated world · physical-world interaction ↔ panel-mediated interaction *(the "website feeling" lives at the panel pole)* · survival ↔ commerce ↔ social legitimacy as the primary score.

---

## 1C. The variance channels — and the one we under-weighted

Variance sources are catalogued **separately from the loops** — a game can draw on any of them without changing what the player manipulates. The full inventory: geography/maps, physical fields, population composition, market demand, traffic/intake, incidents/events, stakeholder agendas, and player-created path dependence (the weakest — Skylines' only channel). Our frozen-seed audit says we currently have *none* of them live. The genre expansion pass (Surviving Mars, Tropico, Aven Colony) surfaced the one this document's v1 under-weighted, and it changes the map:

### The stakeholder/mandate channel — world variance with a face

**What it is:** pressure delivered by *characters with agendas*. Surviving Mars' sponsors set the rules and the goals; Tropico's factions make contradictory demands and its elections make the player periodically stand for judgment; Aven Colony gates progress on referendums; Frostpunk's citizens petition; even Against the Storm's Queen is this channel wearing a crown — the timer made into a character. The situation changes not because dice rolled but because *somebody wants something from you*, and who wants what differs by session, by standing, by your own past choices.

**Why it matters to us specifically:**

1. **It is the cheapest DEEP channel.** No physics, no generator research — content plus counters. The audit shows most of the counters already exist: faction templates with personalities (D2, currently re-weighting a spawn table), resident satisfaction and civic roles (P5), district reputation as ready-made constituencies (O4), and the M1 unlock-predicate machinery — a fully built condition-checker currently spent on a linear ladder — which is *exactly* a mandate-evaluation engine pointed at the wrong target.
2. **It is inherently narrative.** Pressure arrives as a face saying words — the precise "game, not website" texture the feel research calls for. A demand meter is a dashboard; a union rep standing in your promenade refusing to let colonists debark is a scene.
3. **It is the most CEO-thematic channel available.** Patrons, boards, unions, inspectors, and rival operators are who a CEO actually answers to. The Expanse fantasy is not "credits went up" — it's leverage, obligation, and being *somebody* in a system of somebodies.
4. **It pairs naturally with the intake stream.** Intake variance changes what arrives; stakeholder variance changes what you're *being judged on* when it arrives. The same three inbound ships read completely differently under a "grow resident population" board quarter versus a "cut crime, an inspector is aboard" one. Two channels, multiplicative, both diegetic. On the evidence, this is the strongest candidate for the second channel alongside berth admissions — though that ordering is Q5 below, not a decree.

**The guard rail (peer's warning, adopted verbatim into the spec):** stakeholder mandates are a political system **only if stakeholders have persistent interests and power**. Random missions from talking portraits are still event cards with faces — i.e., the vetoed thing wearing a costume. The bar: a stakeholder must remember, must want things that conflict with other stakeholders' wants, and must be able to *do something to you* (withhold funding, strike, reroute traffic, revoke a permit) — not just offer quests.

### The personified-CEO overlay (the Tropico move)

A cross-cutting option that rides on the stakeholder channel rather than being a path of its own: **the player is a specific character.** A chosen background (ex-corporate, ex-military, ex-smuggler…) that shifts faction attitudes and action costs; every stakeholder and eventually every resident holds an *opinion of you*, inspectable; periodic judgment beats (board reviews, station referendums) where that opinion gates something real; and a private ledger alongside the station treasury — the CEO's own account, a personal score distinct from the station's. Tropico proves "management sim where YOU are a character" is a beloved shape, and it is almost absent from the space-colony shelf. Native to Path G, drops cleanly onto B and F; adds writing/content cost; changes the fantasy from *invisible hand* to *public figure*. Whether the owner wants to BE somebody is Q6.

---

## 2. The path slate

Six surviving directions (the roguelite path is vetoed — note below), each framed as **which neighboring loop we borrow** from the position we actually hold (home = L4 service ops × L1 tycoon-lite). Scores: **A-gap** = actuator-gap movement 0–5, **V-gap** = variance-gap movement 0–5, **CEO** = Expanse-fantasy fit 0–5, **Cost** = S/M/L, **Reuse** = rough share of existing sim that stays load-bearing. All paths assume the settled premises: one persistent station, world variance only, watchability as baseline infrastructure.

---

### Path A — The Wired Home Loops
*"Keep the station we built; turn it on."* — **Borrows from: nobody. Deepens home (L4 + L1).**

| A-gap | V-gap | CEO | Cost | Reuse | Watchability dependence |
|---|---|---|---|---|---|
| **4** | **1** | **3** | **S** | ~95% | Baseline (amplifies; identity doesn't depend on it) |

**Core loop it creates:** build capacity → traffic and quality now *respond* (rating gates arrivals, wear slows machines, unstocked bars stop earning, residents leave, fires can actually start) → diagnose what's bleeding → fix/staff/repair → grow.

**The two flavors (peer's split, adopted):** the wiring pass can sharpen either home readout, and they play differently minute-to-minute. The **service-ops flavor (L4)** diagnoses *people-flow*: queues, staffing, patience, incident response. The **tycoon flavor (L1)** diagnoses *margins*: prices, supply chains, upkeep costs, profit-per-minute. The wires below feed both; the HUD and the first tuning pass must pick which question the player is primarily answering — "why is the line backing up?" or "why is the margin thinning?"

**Minute-to-minute — what your hands do:** you run at 1× watching the port breathe in pulses — a berth flushes a crowd, the crowd washes through your rooms, credits land at the exit door — and you play whack-a-bleed between pulses. The one repeating decision: *what's costing me the most right now — repair it, restock it, or staff it?*

**60 seconds of play:** A medium freighter docks; twenty passengers spill toward the cafeteria. You catch the wear readout on stove #2 — 71 and climbing, meal output visibly slowed, the queue backing up, patience bars dipping. Pull a hauler off market duty to run repair parts. While you're there: the cantina taps have run dry — you forgot to order stock, and the room's drip revenue just halved. Queue a supply haul, approve the keg order, glance at the rating ticker — the storm-offs from the slow kitchen already shaved tomorrow's arrivals by a ship. The exit doors chime; the payout lands; smaller than it should have been, and you know exactly why.

**How our game becomes this:** wire the audit's list minus the admission mechanic — (1) rating→arrival rate (one line at the scheduler + retune), (3) reputation→demand mix (outputs computed at `:14626`, never read), (4) the wear multipliers the inspector already promises (~10 lines at the production sites), (5) the resident-departure branch (fully instrumented, no writer), (6) price the cantina (call the dead `consumeCantinaSupplies`), (7) reachable fire ignition (kitchen heat + wear), plus visible refusal pricing (show the storm-off's lost sale) and a magnitude retune (today a failed theft ≈ 1–2 minutes of one cantina visitor). **First 10 minutes:** identical starter hull, but the slider is honest now — arrivals sag when service slips, the stove degrades on screen, the bar can run dry, and the first fire you cause is your own fault. **What gets cut:** the command zoo, six utility layers, and thermal come OFF the roadmap permanently — this path decides they were never going to pay.

**Variance source added:** essentially none — the sliver is that reputation→demand-mix lets your district character steer who comes: player-created path dependence, the weakest channel in the inventory.

**Pros:** cheapest by an order of magnitude (days-to-weeks, mostly one-line consumers of numbers already computed); de-risks every other path (all of them need consequences that bind — this builds exactly that); immediately falsifies or validates "the sim is fun once it bites"; nothing thrown away.

**Cons / risks:** the determinism law says this ships a better version of a solved game. The owner is already the Nth-run player; he will learn the new optimum (now including "stock the bar, fix the stove") in one evening and be exactly as bored, with better cause and effect.

---

### Path B — Frontier Commerce / The Commitment Engine *(the peer synthesis's original recommendation)*
*"Who does this station serve, and what obligations does that create?"* — **Borrows from: L1 (commerce/logistics depth) with a dash of L6 (patrons & factions).**

| A-gap | V-gap | CEO | Cost | Reuse | Watchability dependence |
|---|---|---|---|---|---|
| **4** | **4** | **5** | **L** | ~70% | High — admissions must be physical, visible events |

**Core loop it creates:** read the orbit (a *generated* regional economy: this period a belt-mining corridor, later a refugee route, later a faction border) → commit finite berths/hull/labor to specific traffic and specific patrons → physically build the station around those commitments → operate under the load they bring → absorb persistent consequences (accepted populations stay, industries reshape traffic, factions remember) → leverage profit and standing into regional influence.

**Minute-to-minute — what your hands do:** you work berth admissions against a floor plan. Ships appear on approach as physical arrivals competing for finite berth time; your cursor moves between the approach scope, the berth you'd assign, and the rooms that would absorb the consequence. Between arrivals you build — not from a fixed ladder but as *answers*: this corridor because ore carts now cross passenger flow, this dormitory because you said yes to the colonists. The one repeating decision: *which obligation do I take on next, and can my floor absorb it?*

**60 seconds of play:** Two ships on approach, one free medium berth. An ore hauler — pays in materials you're starved for, brings dirty freight through the promenade and repair work your two mechanics can't cover. A pilgrim liner — forty passengers, triple fees, and your one serving counter will drown. The board's quarter mandate says grow resident count; neither ship helps. You take the hauler, watch the customs officer flag its manifest — two crates unaccounted — decide not to press (you need the materials), and see the district's notoriety tick up. The liner breaks orbit; the pilgrims' faction logs the snub. Next period their traffic routes to the rival station, and the observation lounge you built for them sits half-empty, a monument to a commitment you didn't keep.

**How our game becomes this:** wire #2 first — berth admission (assign/refuse/prioritize) over the ~80%-built D5 berth data (types, sizes, capability tags, screening/customs, the ×17 passenger stakes) — plus #3 (reputation steers demand mix) and Path A's binding set underneath (#1, #4, #5), because commitments only matter if their consequences bite. The D2 system map/factions — today pure decoration — becomes the *seed* of the regional economy: v1 is three hand-authored contexts per the peer's slice (belt transfer stop / refugee corridor / faction border port), each with scarcities, traffic classes, and stakeholders; a systemic generator is v2. Residents (P5/P7) become the persistent-consequence layer; the M4 materials market gets real regional prices instead of a sine wave. **First 10 minutes:** an orbit briefing instead of a blank void — this station inherits six residents with uneven skills, two working modules, one deficiency, and a patron with expectations; the first arrivals appear before your first room is done, and you refuse one because you can see your own kitchen. **What gets cut:** thermal, the six dead utility layers, the command zoo (or repurposed as negotiable licenses/permits under the stakeholder channel).

**Variance sources added:** three independent world channels — market demand (the regional situation), traffic/intake (which ships arrive, in what order), and stakeholder agendas (which patrons are leaning on you) — exceeding the two-channel minimum, all diegetic, no cards anywhere.

**Pros:** the strongest direct expression of the *commerce half* of the Expanse CEO fantasy — scrappy outpost → business model → community → regional player. Attacks both gaps at once. Independently converged on by two synthesis efforts (the peer's Direction A and DETERMINISM-RX's P1 are the same mechanic), which is real signal. The personified-CEO overlay drops onto it cleanly.

**Cons / risks:** the most expensive single bet. The regional-economy layer is genuinely new invention with real quality risk (hand-authored contexts are the honest v1). Front-loads months before validating that minute-to-minute play is fun; if the contexts converge on the same food-service core anyway (the peer doc's own failure criterion), the expensive layer bought variety of dressing, not of decision.

**Where I agree with the peer / where I push back:** Agree on the diagnosis (near-identical to the determinism law), on the weak-randomness blacklist, on berth admission as the core interaction, and on the excellent testable slice with success criteria — that slice design should survive whatever path is chosen. Push back on three points. (1) Direction A bundles four separable mechanics (admissions, regional generation, persistent populations, propagating hazard) into one recommendation — this map prices them separately, because the admissions piece is ~80% built and the generator piece is the entire L. (2) The doc says "the seed changes the solar-system dressing" — the audit found even that is false: the seed is hardcoded 1337; there is *less* variance today than the peer credits. (3) It dismisses damaged/varied starts as "reconverging on the same core" — true *alone*, but inherited-state variance is the surgical answer to the owner's exact "same spot every time" complaint; the honest position is that inherited-state variance and demand variance need each other.

---

### Path C — The Agent-Story Station
*"A port full of people worth watching."* — **Borrows from: L5 (agent-story colony).**

| A-gap | V-gap | CEO | Cost | Reuse | Watchability dependence |
|---|---|---|---|---|---|
| **3** | **4** | **2** | **L** | ~60% | TOTAL — this path *is* the watchable layer |

**Core loop it creates:** hire from whoever actually walks off the arriving ships (names, wages, 1–2 trait hooks into real systems) → the station bends around who you actually got → a director escalates state-aware events that threaten *someone you know* → triage, lose people, recover with scars → the anecdote factory runs.

**Minute-to-minute — what your hands do:** pause-heavy people-tending. You cycle crew cards reading moods and grudges, shuffle shift assignments to keep enemies apart, zoom into a scene when the alert stinger fires, make one hiring call and one firing call an hour, each of which changes what your station can physically do. The one repeating decision: *who needs me right now — and whose personal situation makes the obvious plan dangerous?*

**60 seconds of play:** The feud icon between your quartermaster and your cook has gone red — they've been assigned the same haul route for a week and it's curdled. Split their shifts; the cook's mood recovers, the night shift now has no hauler, the serving buffer will run thin by morning. Theft alert — zoom to the scene: it's Ondrej, the dockhand you hired cheap *because* of the record in his file, palming goods off the market stall. Choose: brig him (lose your only night dockhand during tomorrow's freighter rush) or log it and look away (the district's heat ticks up, and the market keeper — who watched you watch — remembers). You look away. The camera lingers half a second on her face.

**How our game becomes this:** finally justifies the sim's most disproportionate machinery — the ~1,000-line P1 crew-needs system (bladder timers and all) becomes drama fuel; residents' six-mood P5 simulation becomes load-bearing (wire #5 so leaving is real); the 9-stage O2 incident pipeline gets restaged as watched scenes (its SPEC-noted weakness); the O5 failure director is the vestigial stub a real storyteller replaces; and the P4 command layer — today the game's most expensive decorative surface — becomes the *officer cast*: 24 roles and 8 specialties as character archetypes. Trait hooks must touch real rates (a "fast cook" multiplies the stove at `:14136`; a "slob" feeds V7 dirt) — actuators, but a narrower set than A's. The applicant pool arrives diegetically on ships. **First 10 minutes:** three named crew with portraits and quirks instead of eight interchangeable integers; the first alert is a scene the camera flies to, not a list row. **What gets cut:** the berth economy simplifies to backdrop; tax/expansion depth deferred; the money game thins.

**Variance sources added:** population composition (who's aboard, who applies) × incidents/events (the director) — the agent-story loop's proven pairing. Both world channels; no cards.

**Pros:** highest attachment and anecdote yield per feature in the menu ("traits are what players screenshot"); the strongest known cure for dead-diorama syndrome; deep reuse of already-built agent machinery.

**Cons / risks:** weakest CEO fit among survivors — the fantasy drifts from *magnate* to *caretaker*, and commerce becomes scenery. Highest craft bar in the slate: agents too shallow to watch are exactly Spacebase DF-9's fatal wound (with Planetbase and Aven Colony as second and third data points), so this path is all-in on animation, readable drama, and writing — disciplines the project hasn't exercised yet.

---

### Path D — The Environmental-Engineer Station
*"The station is a machine that is always about to kill you."* — **Borrows from: L3 (environmental systems engineering), with L7 pacing on top.**

| A-gap | V-gap | CEO | Cost | Reuse | Watchability dependence |
|---|---|---|---|---|---|
| **5** | **2** | **1** | **L** | ~65% | High — the overlay stack (ONI's X-ray goggles) is the interface |

**Core loop it creates:** every solution excretes the next problem — power makes heat, heat raises wear, wear feeds fire, fire eats air; hazards propagate through the topology you built; layout is your failure-containment plan.

**Minute-to-minute — what your hands do:** overlay archaeology and infrastructure surgery. You flip between heat, air, power, and wear views reading slow-moving disasters; you draw coolant loops and duct runs through the sub-floor; you place blast doors and decide which compartments are sacrificial. When the klaxon sounds, your hands go from planning to incident command: seal, vent, reroute, dispatch. The one repeating decision: *how do I transform this physical problem without creating a worse one?*

**60 seconds of play:** The thermal overlay shows the reactor room two bands hotter than yesterday — the new workshop next door is feeding it, and wear on the adjacent life-support unit is climbing in sympathy. You drag a coolant loop through the sub-floor grid and queue an insulated wall segment. Mid-draw: debris klaxon. A strike punches the north corridor — pressure overlay blooms blue as three tiles vent to vacuum; the blast doors you zoned last week slam and hold; one hauler is caught on the wrong side, suit oxygen counting down. Dispatch the EVA repair, watch the welder crawl the hull while the trapped hauler's timer runs, and make a note: the north face needs a debris screen more than the cantina needs a second tap.

**How our game becomes this:** the great irony is that it *redeems the most currently-dead code*: thermal V3 (today terminating in a metrics mirror) gets consequences; all four non-reactor maintenance-debt families get the #4 wire (today caption fiction); fire gets live ignition (#7); debris V5 actually breaches into the V1 pressurization system that already knows how to flood-fill vacuum; power V8 rebalances to ~⅓ wattage so the ratio binds; up to all six dead V9 utility layers come alive; air gets its missing middle band (degraded-not-dead). **First 10 minutes:** the starter station is genuinely fragile — the reactor needs a coolant decision by minute five, and the first debris window is announced on a forecast ticker you learn to fear. **What gets cut:** reputation zones, faction nuance, archetype spend detail, tax — most of the commerce layer thins to a support role.

**Variance sources added:** weak by default — deterministic physics on a uniform void is still a puzzle with an answer. ONI's replayability comes from the geology lottery, and a station in empty space has no terrain; we'd have to invent its equivalent (debris lanes, radiation windows, salvage fields, unreliable fuel) — doable, but it's a new generator, not a reuse.

**Pros:** the purest actuator fix available — physics *is* actuators; no dead bus is possible when heat breaks machines and vacuum kills. Strongest answer in the slate to "why build something WHERE."

**Cons / risks:** abandons the north star — this is an engineer fantasy, not a CEO fantasy; the peer's synthesis raised the same objection against its own equivalent direction ("ONI in space rather than this game's own identity"). Audience narrows toward the systems-engineer niche (Stationeers is the cautionary far pole). The owner has never once named survival as the thing he wants.

---

### ~~The Roguelite Drafted Station~~ — CONSIDERED & REJECTED (owner veto + category error)

Evaluated fully in v1; removed on two independent grounds that arrived from different directions and agree. **By taste (owner veto):** disposable stations invert the persistent-CEO arc, and pick-a-perk drafting is explicitly disliked ("those are so annoying"). **By taxonomy (peer review):** "roguelite drafted builder" was never a peer of the other categories at all — it is a campaign/variance *format* layered over some other loop, not a kind of play. What the format got right — *option sets that never repeat defeat wiki answers* — survives in diegetic form inside Paths B, F, and G (berth admissions, applicant pools, stakeholder mandates, economic weather): the same mathematics, delivered by the world instead of a card screen, on a station you keep.

---

### Path G — The Political-Economy Station *(new in v3, on the peer's recommendation)*
*"The station becomes a polity: constituencies with power, legitimacy as a resource, the CEO as a political actor."* — **Borrows from: L6 (society & political-economy).**

| A-gap | V-gap | CEO | Cost | Reuse | Watchability dependence |
|---|---|---|---|---|---|
| **3** | **4** | **5** | **M–L** | ~75% | High — pressure must arrive as scenes and faces, or it's menus about feelings |

**Core loop it creates:** grow population and industries → constituencies form with structurally incompatible demands (corporate board vs crew union vs traders' guild vs colonist association) → allocate space, services, and policy among them → stand for periodic judgment (board reviews, referendums, license renewals) → standing converts into permits, funding, and territory → scale from operator into regional institution.

**Minute-to-minute — what your hands do:** you govern. Reading constituency panels and the opinion almanac, placing buildings *as political acts* (the dormitory placates the colonists; the casino delights the traders and enrages the colonist association), issuing edicts, making promises ahead of a judgment beat you can see coming on the calendar — and watching which promises your past self failed to keep come due. The one repeating decision: *which group benefits, who pays — and does my coalition survive it?*

**60 seconds of play:** Quarterly board review in two cycles; approval sitting at 48%. The union rep wants dock-shift caps — costs you throughput in the middle of a freight surge. The traders' guild wants priority on the new berth — which is exactly what the union is angriest about. The colonist association has a petition out for a school, of all things, and forty signatures. You check who actually holds power this quarter: the board weights revenue, but the union's strike-readiness meter is two ticks from red, and a strike during the surge would crater the same revenue the board is judging. Grant the shift caps. Watch dock output visibly dip — carts queueing on the pad — and promise the guild the berth *next* quarter, on the record. The review lands 55–45; the expansion permit unlocks; the guild's ledger now shows one IOU, and they do not forget.

**How our game becomes this:** the stakeholder catalog group in section 4 *is* the build list, pointed at the audit's most latent layer: D2 faction templates gain persistent interests and power (the guard rail applies — they must remember, conflict, and be able to act on you, or they're talking portraits); P5 civic roles and satisfaction feed constituency opinion; O4 district reputation becomes constituency geography (the seedy quarter votes differently than the promenade); the M1 predicate machinery becomes the mandate/review engine; and S7 stationRating finally gets its consumer — as one input into approval, judged on a rhythm. Needs Path A's wires underneath so there is a real operational floor whose outcomes the constituencies care about. The personified-CEO overlay is *native* here, not optional garnish. **First 10 minutes:** you inherit a patron with expectations, a small population that already has opinions, and a calendar with your first review on it; the first thing you build, somebody thanks you for and somebody else resents. **What gets cut:** thermal and the utility layers stay cut; deep commerce simulation optional (prices can stay simple — the politics are the depth).

**Variance sources added:** stakeholder agendas (the deep channel — who wants what, this session, given your history) × population composition (who your constituents are) × incidents feeding grievances. All world variance; the judgment calendar gives the sandbox a heartbeat without a run clock.

**Pros:** the strongest expression of the *power half* of the CEO fantasy — operator→institution is precisely the "scrappy to CEO of a thriving station" transition, and this is the loop where that transition natively lives. Cheapest deep variance channel (content + counters, most of which exist). Huge reuse of the audit's most expensive dead code (factions, civic layer, predicates, the rating bus). Inherently narrative — the anti-website texture comes built in.

**Cons / risks:** politics without a working operational floor is menus about feelings — G *requires* A's wires plus a functioning service game underneath, or there's nothing real to allocate. The talking-portrait trap is one lazy sprint away at all times (the guard rail must be engineering doctrine, not a vibe). Content-writing load is real. And minute-to-minute hands can drift panel-heavy — the loop needs petitions, delegations, and reviews staged as *scenes in the world* to stay a game.

---

### Path F — Hybrid: "The Living Port"
*"A persistent station; a wired operational core; a world that keeps changing the question; a thin cast of named faces."* — **Borrows from: home (L4+L1) + an organ of L6 (board & union) + a micro-dose of L5 (officer faces).**

| A-gap | V-gap | CEO | Cost | Reuse | Watchability dependence |
|---|---|---|---|---|---|
| **4** | **4** | **4** | **M (staged)** | ~85% | High — admissions as physical arrivals; tier-1 juice list |

**Why this pairing:** the genre finding is that the hits are hybrids pairing a *fun source* from one loop with *variance* from elsewhere — ONI is environmental engineering plus a dose of pawn charm plus intake variance. F is that recipe on our actual foundation: **the home loops' operational fun** (what our code already is) + **world variance through the intake and stakeholder channels** (ships that arrive, people who lean on you, prices that move, state you inherit — no cards, no runs) + **a micro-dose of agent-story attachment** (name the officers and the stakeholders, not everyone — the command layer's roles become a handful of recurring faces, far short of Path C's full pawn sim).

**Core loop it creates:** ships arrive as physical admissions against your current bottleneck state → assign/refuse against finite berths → the crowd consequence plays out visibly on the rooms you built → stakeholders (a board, a union, patron factions) set the terms you're being judged on and periodically judge you → seeded economic weather shifts which arrivals are good news → the station you grow is permanently yours, shaped by the intake you chose and the people you answered to.

**Minute-to-minute — what your hands do:** Startopia with modern juice and a boss. You work the approach queue with one eye on the floor and one on the stakeholder bar — who's pleased, who's owed, what this quarter's mandate is. Admit, assign a berth, then get your hands into the consequence: drag a second serving counter into the crush, reroute a hauler, wave the camera down to watch the crowd re-form. The one repeating decision: *which arrival do I admit, knowing who's watching?*

**60 seconds of play:** The ticker says fuel spike — docking fees +50% for three cycles, and every hauler captain knows it too. Two ships on approach: a liner (big fees, your cafeteria queue is already eight deep) and an ore hauler (cheap freight, but the union rep has been standing in your promenade for two cycles because dock-crew shifts are over quota, and her patience meter is not decorative). The board's quarter mandate: grow resident count — the liner carries twelve would-be colonists. Admit the liner. The crowd crashes into your serving line exactly as you feared; you drag a second counter from the build strip straight into the room, watch a cook jog over to staff it, watch the thought-bubble grumbles above the queue soften. The union rep watches too, arms folded. Two more cycles on that shift quota and she walks — and takes the dock crew's output with her.

**How our game becomes this — the stages:**
- **Stage 1 (S, ~weeks): Path A's wires.** Rating→arrivals, wear bites, residents leave, cantina priced, reachable fire, visible refusal pricing, magnitude retune. Falsifies "fun once it bites" cheaply.
- **Stage 2 (M): the world starts asking questions.** Berth admission (assign/refuse/prioritize) over the 80%-built D5 data; the applicant pool arriving on ships (thin version — names, wages, one trait hook each); economic weather over M4 (seeded curves + announced shocks replacing the sine wave); and the first two stakeholders — a board (mandates via the M1 predicate machinery, judgment beats that finally give the S7 rating bus a consumer) and a union (crew-side counters off P1/P6 data that today feeds nothing) — built to the guard rail: persistent interests, real power. Unfreeze seed 1337.
- **Stage 3 (L, optional, later): the region and the polity.** Grow the seeded traffic mix into hand-authored regional contexts (Path B's layer), grow the two stakeholders toward a full constituency system (Path G's layer), optionally the personified-CEO overlay. Stage 3 IS the B/G endgame, adopted only after stages 1–2 prove the loop.

**First 10 minutes:** same hull, but the first arrival appears before your second room is built, the board's first mandate frames your first hour, and the first ship you refuse visibly goes somewhere else. **What gets cut:** same as A — command zoo (except as officer faces), six utility layers, thermal off the roadmap.

**Variance sources added:** traffic/intake + stakeholder agendas + market weather (+ inherited-state starts as an optional fourth) — all world channels, all diegetic, at medium cost.

**Pros:** best cost-to-coverage ratio on the board; every stage de-risks the next; nothing built is discarded; keeps the persistent-station CEO arc; the stakeholder organ gives it the narrative texture the "website feeling" complaint is really about.

**Cons / risks — read these before liking the scores:** hybrids score well on averages *by construction*; their tax is paid in the risk column. F's specific failure mode is **stopping halfway**: each stage is shippable, so each stage invites "good enough," and a project that stops after stage 1 has shipped Path A's solved game while believing it chose F. It also defers B's regional depth and G's full polity — possibly forever. F only works as a commitment to the destination executed in stages, not as a sequence of options.

---

## 3. Side-by-side comparison matrix

| Path | Borrows from | A-gap (0–5) | V-gap (0–5) | CEO fit (0–5) | Cost | Reuse | Watchability dependence | Biggest risk |
|---|---|---|---|---|---|---|---|---|
| **A. Wired Home Loops** | — (deepens L4+L1) | 4 | 1 | 3 | **S** | ~95% | Baseline | Ships a better version of a solved game |
| **B. Frontier Commerce / Commitment Engine** | L1 + dash of L6 | 4 | 4 | 5 | **L** | ~70% | High | Biggest single bet; generator quality unproven before fun is |
| **C. Agent-Story Station** | L5 | 3 | 4 | 2 | **L** | ~60% | **Total** | Highest craft bar (drama/animation/writing); CEO fantasy drifts to caretaker |
| **D. Environmental-Engineer Station** | L3 (+L7 pacing) | 5 | 2 | 1 | **L** | ~65% | High (overlays) | Wrong fantasy; niche audience; needs an invented map lottery |
| **G. Political-Economy Station** | L6 | 3 | 4 | 5 | **M–L** | ~75% | High (scenes/faces) | Politics before a working floor = menus about feelings; talking-portrait trap |
| **F. Hybrid "Living Port"** | L4+L1 home, organs of L6+L5 | 4 | 4 | 4 | **M** (staged) | ~85% | High | Stopping halfway; regional/polity depth deferred |

*(The roguelite path is removed — owner veto + category error; see the rejection note above.)*

Reading notes: no path scores 5/5/5 — the gaps genuinely pull in different directions, which is why this is a decision and not a discovery. Path A is all actuator and no variance; the world-variance channels supply the column A lacks, which is why every multi-gap path is some composition of A-plus-channels. **B and G are the two halves of the mature CEO fantasy** — money and power — and score identically on CEO fit for different reasons; they compose naturally (B's region gives G's politics something to be about), which is exactly what F's stage 3 sketches. C and D each trade the CEO fantasy away for their particular depth — people-drama and physics respectively — and should be chosen only if that trade is wanted eyes-open.

---

## 4. Types of possible mechanics — the catalog

A menu, not a prescription. **Solves:** A = actuator gap, V = variance gap, F = game-feel. **Pulls toward:** the loop (L1 production/logistics · L2 network/land-use · L3 environmental · L4 institution/service ops · L5 agent-story · L6 political-economy · L7 crisis governance). All variance mechanics are world/situational variance; owner-vetoed mechanics are quarantined at the bottom.

### Actuator wires (make numbers bite)

| Mechanic | What it is | Solves | Pulls | Cost | Reuses |
|---|---|---|---|---|---|
| Rating → arrivals | Station quality modulates traffic cadence (the keystone wire; one line + retune) | A | L4 | **S** | Dead rating bus + every system draining into it |
| Reputation → demand mix | District character steers *who* comes (premium→tourists, risky→haulers+theft) | A | L4/L6 | **S** | Outputs computed-but-unread; one consumer function |
| Wear that bites | Maintenance debt multiplies stove/workbench/grow/berth throughput, as the UI already claims | A | L4/L3 | **S** | Debt fields + repair jobs + the inspector's promises (~10 lines) |
| Residents who leave | leaveIntent ≥ threshold → walk out + rating/tax loss | A | L5/L6 | **S** | Fully instrumented departure system missing only its branch |
| Priced cantina | The best faucet in the game gains a supply line (call the dead code) | A | L4/L1 | **S** | `consumeCantinaSupplies` + unstocked multiplier, both written, never called |
| Reachable fire | Live ignition from kitchen heat + wear; property destruction enters normal play | A, F | L3 | **S** | Entire downstream fire system (spread, destruction, extinguishers, jobs) |
| Debris that breaches | Impacts actually hole the hull → pressurization event + EVA repair | A, F | L3 | **S–M** | Flood-fill vacuum + construction/EVA, both built |
| Power that binds | Rebalance supply steps to ~⅓ so the powerRatio plumbing constrains | A | L3/L1 | **S** | Load-bearing powerRatio already multiplies everything |
| Visible refusal pricing | Storm-offs/bails shown as a body + a lost-revenue number | A, F | L4 | **S** | Patience/bail machinery; currently 0.012 ticks on a dead meter |

### World-variance generators (change the situation, diegetically)

| Mechanic | What it is | Solves | Pulls | Cost | Reuses |
|---|---|---|---|---|---|
| Berth admissions | Ships as physical arrivals competing for finite berth time; assign/refuse/prioritize — ordinary operations mechanics, NOT abstracted offers detached from space and time | V, A | L4 | **M** | Berth capability/size/screening data (~80% built); manifests; the crowd stage |
| Regional economy contexts | Hand-authored-then-generated regional situations: viable businesses, scarcities, faction pressure | V | L1/L6 | **L** | System map/factions (today decorative); materials market |
| Inherited-state starts | Begin from a generated situation: hull shape, damage, salvage, legacy rooms, existing residents | V | any | **M** | Construction/EVA repair; demo-station painter as generator skeleton |
| Crew applicant pool | Hire from whoever's actually aboard the docking ships: wages + trait hooks into real rates | V, F | L5 | **M–L** | Staff roles/specialties; payroll; crew inspector |
| Dilemma director | Paced, forced, two-legitimate-answers events with delayed consequences (plague ship, customs sweep, strike) — always a ship, a person, a room; never an abstract card | V | L5/L7 | **M** | Factions, clinic, brig, reputation — all currently inert |
| Economic weather | Seeded price/demand curves + announced shocks ("fuel spike: fees +50% for 3 cycles") | V | L1 | **S** | Materials-market multiplier (today a sine wave); one ticker line |
| Periodic pressure cycle | A legible heartbeat: traffic surges, radiation windows, inspection sweeps — prepare→test→recover | V, F | L7 | **S–M** | Arrival scheduler; incident pipeline (Timberborn's one-strong-cycle lesson) |
| Unfreeze the seed | Stop hardcoding 1337; per-session galaxy/map-conditions | V (prereq) | all | **S** | Everything already seeded off it — the literal one-line prerequisite to every row above |

### Stakeholder & mandate channel (world variance with a face)

*Guard rail on every row: stakeholders count as a political system only if they have persistent interests and real power — they remember, their wants conflict, and they can act on you (withhold funding, strike, reroute traffic, revoke permits). Random missions from talking portraits are event cards with faces — the vetoed thing in a costume.*

| Mechanic | What it is | Solves | Pulls | Cost | Reuses |
|---|---|---|---|---|---|
| Stakeholder constituencies | 3–5 groups with structurally incompatible demands (board wants margin; union wants shift limits; traders' guild wants berth priority; colonist association wants housing standards) — Tropico's device | V | L6 | **M** | D2 faction templates; P5 resident satisfaction; O4 reputation zones as ready-made district constituencies |
| Mandates with teeth | A patron sets period objectives with real consequences (funding rate, tariffs, inspection intensity) — delivered by a character with a memory | V | L6/L7 | **S–M** | The M1 unlock-predicate machinery — a fully built condition-checker currently spent on a linear ladder |
| Judgment beats | Periodic board review / station referendum where accumulated standing gates something real (expansion permits, funding, your job) — Aven Colony's device | V, F | L6 | **S–M** | Finally gives the S7 rating bus and P5 satisfaction a consumer — the dead bus becomes a verdict |
| Patron/backer relationship | Who bankrolls the station — a *relationship* with mandates and strings, courted and changeable in play (NOT a pick-a-perk sponsor card) | V | L6/L1 | **M** | D2 faction templates; ties funding to the stakeholder math |
| Personified CEO overlay | You are a specific character: background shifts faction attitudes and action costs; everyone holds an inspectable opinion of you; a private ledger beside the station treasury — the Tropico move | F, V | L6 | **M** | Rides on stakeholder math; new content (portraits, backgrounds, opinion surfacing) |
| Visible demand triad | Two-three always-on meters saying what the region wants *right now* (crew? cargo? entertainment?) — SimCity's RCI device as the cheapest "the world has its own agenda" signal | F | L2/L1 | **S** | The computed-but-unread demand-bonus metrics; regional state |

### Game-feel / watchability (baseline infrastructure for every path)

| Mechanic | What it is | Solves | Pulls | Cost | Reuses |
|---|---|---|---|---|---|
| Direct-manipulation layer | Ghost previews, drag-designation, valid/invalid tinting, snap ticks; cursor acts *in the world* | F | L4 (Startopia/DK lineage) | **M** | All placement flows |
| Tween + sound everything | Never teleport state: lerped agents, eased panels, count-up numbers, thunks, ambient hum, alert stingers | F | all | **S–M** | Genre research Tier-1 list: "days, transformative" |
| Incident theater | Fights/thefts/fires as zoom-to scenes with particles, not list rows | F | L5/L4 | **M** | The 9-stage incident pipeline — best-wired chain in the game, worst-presented |
| Thought bubbles + emotes | Agents deliver system state as behavior (grumbles, celebrations, complaints) | F | L5 | **S** | Visitor/resident mood machinery already computed |
| Camera as a body | Click-alert → eased fly-to; smooth zoom from god-view to one person | F | all | **S** | Existing render/camera |
| Sim-speed as a held object | Pause/1×/3× with audible/visual state — the single fastest "not a website" signal | F | all | **S** | Existing tick loop |
| Named officer cast | 3–5 command-layer roles become recurring faces with portraits + trait hooks (thin-slice of Path C) | F, V | L5/L6 | **M** | The command layer — the game's most expensive decorative surface |
| Dock queues made visible | Trip-time-aware queueing at docks/airlocks (agents pick farther doors when near ones jam) — Planetbase's device; congestion becomes legible architecture feedback | F | L4 | **S** | Dock queue + pathing already exist |
| Bulkhead-quantized expansion | Growth as discrete dramatic sector unlocks, not continuous sprawl | F | L4/L2 | **S** | Expansion purchase system (Startopia's device) |

### OWNER-VETOED (kept for the record; do not build)

| Mechanic | Why it's out |
|---|---|
| ~~Drafted licenses / tier drafts~~ | Pick-1-of-N buff packages are exactly the choice-buff drafting the owner rejects. Its diegetic descendant — negotiated permits and mandates from a patron — lives in the stakeholder channel instead. |
| ~~Run clock + meta persistence~~ | Run-based structure with disposable stations inverts the settled persistent-CEO premise — and per the taxonomy review it was a campaign format, not a loop, all along. Its useful residue — "the world judges you on a rhythm" — survives as judgment beats and the periodic pressure cycle. |

---

## 5. The decision — what's settled, and the questions that remain

The peer review's bottom line is the right master framing, so it opens this section:

> **What object should the player repeatedly inspect, manipulate, and improve?**

Every surviving path is an answer: **A** — the service floor and its margins. **B** — the deal book and the region behind it. **C** — the people. **D** — the physical plant. **G** — the coalition. **F** — the floor first, then the deals, then the faces. Choose the object, and the loop, the variance channels, and the build order all follow.

**Settled by the owner (no longer open):**
- **One persistent station**, grown across sessions. No runs, no resets, no disposable stations.
- **World/situational variance only.** The situation changes (ships, stakeholders, prices, inherited state, events); the player's powers are never varied through pick-a-buff screens.
- **The roguelite path is out** — by veto and, per the taxonomy review, by category error.

**Still open — in rough order of how much of the map each answer eliminates:**

**Q1. Where should the stakes live: in systems and money, in named people, or in constituencies and power?**
This is the master borrow question — it chooses between staying home (A/B), borrowing the agent-story loop (C), and borrowing the political-economy loop (G), with F dosing all three. Middle doses exist (the officer cast; two stakeholders instead of a polity) — but the *primary* verb should be named before building, per the peer review: combining layers is fine "only after naming which recurring verb remains primary."

**Q2. When something goes wrong mid-play, what do you want your hands to be doing — re-planning (pause, read, redesign) or intervening (grab, reroute, isolate, direct)?**
This decides how much of the direct-manipulation layer is day-one load-bearing, and whether we lean operational tempo (L4) or planner rhythm (L2's read-and-redraw). Your "feels like a website" complaint suggests intervening — but it's your hands, so it's your call.

**Q3. How much rebuild appetite — a wiring pass (~weeks), wiring plus the world-asks-questions layer (~1–2 months), or a full new organizing principle (~a quarter)?**
A is weeks and falsifies cheaply; F front-loads validation and stages the spend; B/C/D/G commit a quarter before the loop is proven. Note the asymmetry: *every* path needs A's wires anyway — the appetite question is really about what gets promised beyond them, and whether it's promised up front (B/G) or bought in stages (F).

**Q4. Does the physics/survival fantasy matter to you at all?**
If heat, fire, breach, and containment excite you as *the game*, D's redemption of the dead systems is uniquely deep — but it trades away the CEO identity. If not, the honest consequence is to stop paying any tax on thermal/utilities/meteors permanently — cut them from the roadmap rather than leaving them as sensor debt.

**Q5. After berth admissions, which world-variance channel comes second: stakeholder agendas (faces with power judging you), inherited state (what this station starts with), or events/weather (what happens)?**
All are world variance; they attack different staleness. Stakeholders attack *what you're being judged on* — and the research case is strong: cheapest deep channel (content + counters, most of which exist in D2/P5/O4/M1), inherently narrative, most CEO-thematic, and the native on-ramp to Path G's endgame. Inherited state attacks the *layout* recipe (your literal "same spot every time" complaint). Events attack the *wait state*. The two-channel minimum stands regardless: single-channel games get solved.

**Q6. Do you want to BE somebody?**
The personified-CEO overlay (Tropico's move): a chosen background, faction attitudes that react to *you*, judgment beats, a private ledger beside the station's. It deepens the CEO fantasy from invisible hand to public figure and gives the stakeholder channel a protagonist — at the cost of writing/content and a commitment to characterful presentation. Native to G, fits B and F; skippable on A/D.

---

*Every surviving path needs the actuator wires to some degree; no wiring alone survives the wiki-test razor; every variance mechanic on the menu lives inside the fiction; and every path now names the object the player manipulates. The map is drawn; the pick is yours.*
