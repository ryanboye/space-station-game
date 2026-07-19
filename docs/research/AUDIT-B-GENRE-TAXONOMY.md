# AUDIT B — Genre Taxonomy: Management / Colony / Base-Building Sims

*Research audit for the space-station colony sim redesign. Compiled 2026-07-18. **Expansion pass** (Surviving Mars, Planetbase, Aven Colony, SimCity, Tropico + ONI/Songs of Syx deepening) added same day — see PART 1E.*
*Method: web research across design analyses, developer postmortems, GDC coverage, and reviews, synthesized through a designer's lens. Sources cited inline per game.*

The owner's seven questions, answered per game:
1. **The point** — what is the player ultimately trying to do?
2. **Engagement** — how do users actually engage moment to moment?
3. **Randomness** — what variance keeps it engaging across runs?
4. **Core loop** — the tight repeated loop.
5. **Why build something WHERE** — what forces a spatial decision?
6. **What dictates SIZE / LOCATION** of builds.
7. **Minute-to-minute decisions** — what keeps hands and brain busy when nothing is "wrong"?

---

## PART 1 — GAME-BY-GAME ANALYSIS

### 1. RimWorld (Ludeon, 2018) — the reference story generator

**The point.** Nominally: keep a crash-landed colony alive and eventually escape the planet. Actually: *generate a story worth retelling*. Tynan Sylvester explicitly calls RimWorld "a story generator" — fun comes not from reaching objectives but from watching non-scripted drama emerge from systems + player decisions ([Wikipedia](https://en.wikipedia.org/wiki/RimWorld), [Story Generator analysis](https://zaydqazi.substack.com/p/the-story-generator-a-game-design)). The ship escape exists so the sandbox has an exit, but most players self-author goals (mega-colony, themed runs, mod experiments).

**Engagement.** Pause-heavy planning: read mood/health alerts, set work priorities, draw build/grow/stockpile zones — then unpause and *watch pawns execute*. The player is a director, not an operator. Colonists have "unique traits, skills, and backstories" — the canonical example is the brilliant doctor who is also a pyromaniac ([Story Generator analysis](https://zaydqazi.substack.com/p/the-story-generator-a-game-design)). Attachment to individuals is the engagement engine; events are only meaningful because they threaten *someone you know*.

**Randomness.** Four stacked lotteries: (a) the **AI Storyteller** — "an algorithm that generates events from a categorized database, based on a few statistics about what's happening in the game," with three personalities (Cassandra's difficulty curve, Phoebe's chill, Randy's chaos); (b) the **pawn lottery** (traits/backstories/skills); (c) map/biome generation; (d) raid/event composition. Critically, the storyteller is *tuned like a dungeon master*: "the game tries to hurt but not kill the colony" and "eases off when the colony population drops" — and incidents are designed to overlap (toxic fallout + fire) because "the richness comes when several events interact" ([Wikipedia](https://en.wikipedia.org/wiki/RimWorld)).

**Core loop.** Need arises (food/mood/defense) → build or assign → watch pawns execute → storyteller event interrupts → triage under pressure → recover, slightly stronger and with a new scar/story → repeat at higher colony wealth (which raises threat scale — wealth *is* the difficulty dial).

**Why build WHERE.** Defense geometry (killzones, chokepoints, turret arcs — you can't directly control pawns in combat, so the *architecture* is your combat plan); temperature (freezers need coolers venting heat somewhere; geothermal vents anchor power); soil fertility for grow zones; mountain vs. open base tradeoff (mountains block raids but spawn infestations); beauty/cleanliness radii affecting mood.

**SIZE / LOCATION.** Room-role expectations (bedroom size/quality → mood modifiers; dining/rec rooms have impressiveness scores); workshop-next-to-stockpile adjacency (walk time is the invisible tax on everything); hospital near danger; prison away from armory.

**Minute-to-minute.** When nothing is wrong: rebalance work priorities, upgrade furniture for mood, plan the next room, micro a medical operation, arrange marriages/recruitment, plan caravans. There is always a *mood economy* to nudge — RimWorld made pawn psychology the idle-time content.

**Design doctrine worth stealing.** Sylvester on legibility: players "don't actually want as much simulation as they think they do" — they want *drama they can understand and influence* ([GameDeveloper: How RimWorld fleshes out the DF formula](https://www.gamedeveloper.com/design/how-i-rimworld-i-fleshes-out-the-i-dwarf-fortress-i-formula)). RimWorld is Dwarf Fortress with 10% of the simulation and 300% of the readability, and it won.

---

### 2. Dwarf Fortress (Bay 12, 2006–) — the deep end

**The point.** Build a fortress, dig too deep, generate a legend. There is no win state; the community motto is "Losing is fun" — a fortress's collapse is its narrative climax, and the world persists the ruin. Tarn Adams: dwarves are "more human than human… allowed to embody bigger emotions, allowed to make bigger mistakes" ([PC Gamer](https://www.pcgamer.com/games/sim/dwarf-fortress-dwarves-are-more-human-than-human-creator-says-theyre-allowed-to-embody-bigger-emotions-theyre-allowed-to-make-bigger-mistakes-theyre-allowed-to-do-anything/)).

**Engagement.** Almost fully indirect: designate digs, set workshop orders, draft militia — dwarves decide the rest. Adams deliberately balances "player control with dwarf autonomy": the player is "the official will of the fortress," while dwarves "exercise the autonomy they should be expected to have outside of their official duties. This allows them to be actors in their own stories" — which he identifies as where emergent narrative comes from ([GameDeveloper Q&A](https://www.gamedeveloper.com/design/q-a-dissecting-the-development-of-i-dwarf-fortress-i-with-creator-tarn-adams), [Procedural Storytelling chapter](https://www.taylorfrancis.com/chapters/edit/10.1201/9780429488337-15/emergent-narrative-dwarf-fortress-tarn-adams)).

**Randomness.** The deepest stack in the genre: procedurally generated *world history* (civilizations, wars, named artifacts, gods), geology (aquifers, magma, caverns), sieges and forgotten beasts, and dwarves' "strange moods" producing legendary artifacts. Worldgen means the variance starts before embark.

**Core loop.** Dig → industry → wealth rises → wealth attracts threats (sieges, megabeasts) → defend/expand → dig deeper for better material (adamantine — the literal risk-reward gradient at the map bottom). Depth = greed = doom, encoded spatially.

**Why build WHERE / SIZE.** Geology is destiny: aquifer layers block digging, magma sea powers forges, cavern layers are both resource and invasion vector. Z-levels make verticality a real design axis. Workshops cluster near stockpiles because haul time compounds; burrows partition dwarves in emergencies.

**Minute-to-minute.** Work orders, militia training schedules, reading individual dwarves' thoughts-and-preferences screens, noble mandates, managing moods. The famous anti-numeric stance: "numbers usually make for poor stories" — hence body-part damage models instead of hit points, because wounds create "specific relatable story moments, lasting consequences" ([GameDeveloper Q&A](https://www.gamedeveloper.com/design/q-a-dissecting-the-development-of-i-dwarf-fortress-i-with-creator-tarn-adams)).

**Design doctrine.** Simulation depth is DF's content strategy — but note even Adams admits "all of my memorable stories are bugs." RimWorld's existence proves you can extract DF's fun with a fraction of its sim. DF is the ceiling of depth, not the target.

---

### 3. Prison Architect (Introversion, 2015) — the containment machine

**The point.** Build and run a functioning prison: solvent, secure, and (optionally) humane. Grants and prisoner-intake payments fund expansion; the fantasy is *warden-as-systems-designer*. The playthepast essay ["The Dark Heart of Every Sim"](http://www.playthepast.org/?p=4750) nails why it works: unlike SimCity's willing citizens, prisoners are *unwilling participants* — the sim is a perpetual tension between your system and agents actively trying to break it.

**Engagement.** Plan-build-staff-schedule: draw the cell block, hire guards, set the daily **regime** (eat/work/yard/lockup schedule) — then watch the day-cycle play out and firefight what your design got wrong. Time is chunked by the regime clock: meal times are stress tests, yard time is gang time.

**Randomness.** The **intake lottery**: every prisoner arrives with traits, gang affiliations, and reputations (some hidden until discovered), so each intake bus reshuffles the chemistry of the population. Contraband constantly probes your architecture; escape tunnels probe it literally. Events (fires, riots, legendary prisoners) layer on top.

**Core loop.** Accept intake → capacity/need pressure → build & hire → tune regime and security zoning → an incident exposes a hole in the system (fight, tunnel, smuggling route) → patch the design → take the next grant/intake. The loop is *design → stress-test → patch*, with prisoners as the fuzzer.

**Why build WHERE.** Prison Architect is the genre's best example of *flow architecture*: distance from cell block to canteen determines whether prisoners arrive angry; kitchens near cells become knife pipelines (contraband is sourced from specific rooms and physically carried); guard sightlines and patrol routes; deployment zones; visitation as a drug vector. The layout IS the gameplay — a badly placed room is a security vulnerability, not an aesthetic mistake.

**SIZE / LOCATION.** Minimum cell dimensions (regulatory standards), canteen/kitchen capacity ratios per population, security-level zoning (min/med/max sec separated), parole/visitation near the entrance, morgue out of sight.

**Minute-to-minute.** Watch the schedule execute; follow one prisoner's day; chase the contraband heatmap; read danger levels; approve punishments; expand one wing while the rest runs. Introversion's process lesson: they "locked down" the core loop very early and then built one system per month on top of that stable foundation ([GameDeveloper: layered design](https://www.gamedeveloper.com/design/what-prison-architect-teaches-about-layered-game-design)) — the anti-Spacebase-DF-9 (see below).

---

### 4. Songs of Syx (Jake de Laval, 2020–) — colony sim becomes statecraft

**The point.** Grow a settlement of ~15 into a city-state of tens of thousands that projects imperial power. "Growth is constant, pressure is relentless, and the player is responsible for nearly every structural decision" ([PROC3SS: How It Feels To Rule](https://proc3ss.com/reviews/songs-of-syx-how-it-feels-to-rule)).

**Engagement.** The defining move: **engagement changes as you scale**. Early game plays like a colony sim (individuals visible, names matter); by the thousands, pawns deliberately fade into statistics and you govern through aggregate levers — labor allocation percentages, supply-chain ratios, law and class management. The game *transitions archetypes mid-run*, from RimWorld to Anno.

**Randomness.** Procedural maps, racial composition (races have different needs, tolerances, and interracial frictions), world-map politics, invasions. "Every settlement develops within its own geographical and political context" ([PROC3SS](https://proc3ss.com/reviews/songs-of-syx-how-it-feels-to-rule)).

**Core loop.** Grow population → house/feed/employ them → unlock heavier industry → population becomes military/economic power → expand or conquer → repeat at a new order of magnitude. Interdependence is total: "military expansion depends on population growth, population growth depends on supply chains, and supply chains depend on urban planning and labor distribution."

**Why build WHERE.** Logistics distance is the killer: "entire sections of the city can stall despite production being technically sufficient" if warehouses are badly placed ([PROC3SS](https://proc3ss.com/reviews/songs-of-syx-how-it-feels-to-rule)). Distinctive mechanic: **races prefer building shapes** — square vs. organic/round rooms please different species, so even the *geometry* of a room is a decision with constituencies ([Save or Quit preview](https://saveorquit.com/2020/09/21/preview-songs-of-syx/)). Also: freeform room footprints mean you can literally wall citizens into inescapable pockets — pathing is your responsibility.

**SIZE / LOCATION.** You draw building footprints freehand; bigger rooms = more capacity/workstations. Districts emerge around industry, trade, military, housing. Warehouse placement partitions the city into supply sheds.

**Minute-to-minute.** Watching flows, tuning labor sliders, quelling unrest, managing nobles/religion/slavery tradeoffs. Combat has weight because soldiers are your actual citizens pulled from their jobs ([Reality Remake review](https://www.realityremake.com/articles/songs-of-syx-review-a-brutally-complex-colony-sim-with-endless-replay)).

**Deepening (expansion pass).** The race system is the real replay engine: eight species whose "racial dynamics aren't just cosmetic — they fundamentally alter how your society functions" ([Reality Remake](https://www.realityremake.com/articles/songs-of-syx-review-a-brutally-complex-colony-sim-with-endless-replay)) — Crettonian farm-laborers who reject meat, Dondorian miners who demand alcohol, isolationist Tilapy, cannibal Gimmies, warrior Argonosh who refuse ordinary labor. Your *population mix* is a drafted hand that reshapes every building, diet, and law decision. Above the city sits a world-map layer (trade, tribute, mercenaries, conquest) and a social-power layer: nobles grant political power and production boosts while demanding service; unmet religious needs spark conflict; slavery trades morality for maintenance labor. Moment-to-moment feel bifurcates by scale — small: individual needs, sanitation, basic chains; large: armies, nobility hierarchies, plagues, religious conflict — "unforgiving, complex, and requiring patience." **Two steals for us:** (a) species-mix-as-drafted-hand (crew/visitor species with conflicting needs would make every station run chemically different); (b) the deliberate zoom-out of engagement as scale grows — decide early which scale our game lives at, because Syx shows they demand different UIs and different fun.

---

### 5. Cities: Skylines (Colossal Order, 2015) — the macro organizer

**The point.** Grow a city, keep it solvent and flowing. In practice the developers themselves say the endgame is one thing: "Managing traffic is one of the end-game tasks in the game, possibly the most important one" ([GameDeveloper deep dive on traffic](https://www.gamedeveloper.com/design/game-design-deep-dive-traffic-systems-in-i-cities-skylines-i-)).

**Engagement.** Draw roads and zones; the agent simulation fills them. Every vehicle and cim is a simulated agent choosing transport modes based on congestion — simulated at ~4 ticks/sec with interpolated rendering. You engage by *reading the organism*: overlay heatmaps (traffic, pollution, land value, coverage), then re-engineering the network.

**Randomness.** The genre's lowest. Map choice, mild RNG in demand — that's it. **The real variance generator is you**: your own past layout decisions accrete into the traffic puzzle you must later solve. This is elegant (the game is always personal) and a weakness (once you know the patterns, cities converge; no external pressure means a "solved," stable city goes quiet — the classic "builders get solved" failure Against the Storm was built to fix).

**Core loop.** Zone → demand fills → provide services → congestion/failures emerge from scale → re-engineer network → unlock more tiles/uniques → repeat. Notable failsafe: hopelessly gridlocked vehicles *teleport home* rather than deadlock the sim, because "the reaction time required to catch traffic problems before they escalate would simply be too short" otherwise — a deliberate playability-over-purity call ([deep dive](https://www.gamedeveloper.com/design/game-design-deep-dive-traffic-systems-in-i-cities-skylines-i-)).

**Why build WHERE / SIZE.** Terrain and highway connections; water flow (sewage outflow *downstream* of water intake or you poison the city — a genuinely physical spatial rule); pollution and noise adjacency vs. residential; service buildings have coverage radii; road hierarchy (arterial vs. local) dictates everything else's position. The sim is real enough that urban-planning researchers use it: it "identifies the same problematic parts of road networks as real-world traffic data services" ([Springer](https://link.springer.com/chapter/10.1007/978-3-032-02076-5_12)).

**Minute-to-minute.** Follow an individual cim or truck across town (beloved feature — the macro sim is built from watchable micro agents); fix one intersection; lay a transit line; sculpt a roundabout. When nothing is wrong, players beautify — Skylines' idle content is aesthetic, not systemic.

---

### 6. Oxygen Not Included (Klei, 2019) — the physics puzzle-box

**The point.** Turn a sealed asteroid into a self-sustaining closed system, deep enough to eventually reach space. Klei's Graham Jans: "In most games, you can at least take air or ground for granted, but in Oxygen Not Included, every pixel on the screen represents some kind of limited resource" ([GameDeveloper: layering challenges](https://www.gamedeveloper.com/design/layering-challenges-in-klei-s-survival-sim-i-oxygen-not-included-i-)).

**Engagement.** Dig-build-plumb with heavy pausing; the signature interface move is the **overlay stack** (oxygen, temperature, plumbing, power, germs) — X-ray goggles that make the invisible sim visible and *prove it's real*. Duplicants supply charm and micro-drama (hand-drawn animation, comical reactions — the charm layer that "softens the somber premise," per Klei's own animation/sound streams: [Rhymes with Play](https://kleiforums.com/forums/topic/79409-rhymes-with-play-oxygen-not-included-animation-and-sound-design/)).

**Randomness.** Asteroid seed — above all the **geyser lottery** (which renewable resources you get, and where, anchors your entire infrastructure); plus the **Printing Pod**: every few cycles you're offered a *draft of 3 candidates* (duplicants or supplies) — a built-in roguelite draft mechanic inside a builder. Duplicant traits/interests do the pawn-lottery work.

**Core loop.** The genre's purest "every solution excretes the next problem": need O2 → electrolyze water → makes heat + uses power → power makes more heat → heat kills crops → build cooling → cooling needs more power… Klei explicitly designs by this: "It's the layering that makes intense decisions… the player must balance all the needs of their Duplicants simultaneously — each need is not so difficult, but it's easy to let something slip" ([layering challenges](https://www.gamedeveloper.com/design/layering-challenges-in-klei-s-survival-sim-i-oxygen-not-included-i-)). Heat is the universal entropy tax; mass is conserved, so nothing is ever *solved*, only routed.

**Why build WHERE.** Physics, comprehensively: gases stratify (CO2 sinks, hydrogen rises → base layouts are vertical machines); thermal adjacency (industry away from farms, or insulated); liquid airlocks exploit fluid physics; vacuum as perfect insulator; geysers anchor districts. The map's biomes are hazard-gradients (slime = disease, oil = heat) so *digging direction* is a strategic choice.

**SIZE / LOCATION.** Room-size bonuses (bedrooms, stables, etc. have min/max dimensions for morale bonuses — the game literally rewards good architecture); gas pressure management; insulation costs scale with surface area.

**Minute-to-minute.** Priority tuning, watching dupes work, reading overlays for slow-moving disasters (a heat creep, a pressure drop), micro-errands. Klei's development insight: they built the simulation first and "figured out what interesting challenges emerged," then designed explicit challenges on top ([Behind the design](https://www.gamedeveloper.com/design/behind-the-design-of-hit-sim-game-i-oxygen-not-included-i-)).

**Deepening (expansion pass).** Three structural findings from the [Mechanics of Magic systems analysis](https://mechanicsofmagic.com/2025/11/03/system-game-analysis-oxygen-not-included/): (a) **complexity lives in properties, not rules** — every object carries "mass, temperature, specific heat capacity, thermal conductivity, melting point, and even biological properties like surface germs," so a handful of universal laws generate endless situations (cheaper to build than many bespoke systems, and it never contradicts itself); (b) **teaching by feedback loop, not tutorial** — the dig designation's white-vs-brown highlight teaches marking/execution through trial-and-error observation, a pattern repeated for every mechanic; (c) the **"sandwich structure"**: high-frequency daytime loops (dig/build/haul) alternate with low-frequency arcs where dupes' nightly needs (latrines, food, cots, oxygen) surface the next day's agenda — pacing that hands the player a fresh TODO every dawn. The progression arc runs survival → industrialization → space, with each stage's waste products (heat, polluted water, CO2) becoming the next stage's inputs. **Steal for us:** the property-driven world model + a day/shift "sandwich" cadence that regenerates the player's task list — a station's shift-cycle (day crew / night crew / docking windows) could do exactly this.

---

### 7. Frostpunk (11 bit, 2018) — the authored pressure cooker

**The point.** "The city must survive" — through an escalating, *authored* cold apocalypse — and the ending judges *who you became* to do it. Not a sandbox: a ~10-hour scenario with a scripted difficulty curve and a moral ledger.

**Engagement.** Radial city planning around the generator; the **Book of Laws** (a binary, irreversible moral choice unlockable every 24 in-game hours — child labor or child shelters, soup or sawdust bread); expedition management; emergency shifts. Dual meters — **Hope and Discontent** — "influenced by different things and can both be full or empty simultaneously," born from research showing hope is the decisive survival factor in extreme conditions ([PC Gamer interview](https://www.pcgamer.com/frostpunk-developers-on-hope-misery-and-the-ultimately-terrifying-book-of-laws/)).

**Randomness.** Deliberately low. The escalation is scripted; replay value comes from scenarios and from experimenting with *what kind of leader you'll be*. This is the tradeoff of authored pressure: enormous emotional intensity, weak long-tail replayability.

**Core loop.** Cold deepens → coal/heat demand rises → pass harsher laws / research / push workers → manage hope & discontent fallout → next scripted escalation. The designers engineered a "creeping normality factor — a slippery slope where small compromises against personal morals lead to increasingly larger ones" ([PC Gamer](https://www.pcgamer.com/frostpunk-developers-on-hope-misery-and-the-ultimately-terrifying-book-of-laws/)); they also found pushing dilemmas too far broke player trust — the darkness has a tuned ceiling ([GameDeveloper](https://www.gamedeveloper.com/design/making-i-frostpunk-i-grim-without-descending-to-dark-comedy)).

**Why build WHERE / SIZE.** The single best spatial-forcing device in the genre: **the generator's heat radius**. Heat is literal concentric geometry — homes and medical near the warm center, industry at the cold edge, steam hubs extending warmth bubbles, roads radiating inward. Every placement is a thermal decision. One building (the generator) is simultaneously the survival mechanic, the spatial organizing principle, and the narrative anchor ([GameDeveloper analysis](https://www.gamedeveloper.com/design/frostpunk-an-analysis-of-emotional-narrative-engagement)).

**Minute-to-minute.** Shift assignments, emergency 24h shifts (with a death-risk gamble), reading citizen demands, dispatching scouts, watching the temperature forecast. Tension does the engagement work; there is rarely a moment when nothing is wrong.

---

### 8. Space Haven (Bugbyte, 2020–) — the nearest cousin

**The point.** Keep a scavenger fleet alive crossing hostile space to a new home — *nomadic* RimWorld. Bugbyte states the recipe openly: "the emergent storytelling components of RimWorld with a tile-based gas-simulation system seen in Oxygen Not Included," plus DF and Spacebase DF-9 as inspirations ([bugbyte.fi](https://bugbyte.fi/spacehaven/)).

**Engagement.** Tile-by-tile ship building under a gas/temperature sim; crew with needs, moods, relationships, and mental breaks ("some will vent themselves out of the air lock, others might start a fight"); away teams boarding derelicts (a mini expedition/combat layer); trading and faction encounters.

**Randomness.** Sector/star-system generation, derelict contents, faction encounters (pirates/traders), crew lottery. The jump-travel structure means the game deals you a fresh situation each system — travel as a variance pump.

**Core loop.** Jump to system → scavenge derelicts / trade / fight → patch the ship and the crew → research/build → jump again. Hyperspace transit doubles as protected downtime for construction — a clever pressure/release rhythm.

**Why build WHERE.** The gas sim is explicitly the meaning-maker: "Humans, plants and facilities react to the conditions surrounding them, **giving meaning to how you design your ship** and the living conditions you create" ([bugbyte.fi](https://bugbyte.fi/spacehaven/)). Hull tiles are premium — everything competes for life-support reach, power-node coverage, airlock access. And the ship must double as a *combat object*: hull breaches, boarding paths, crew positioning.

**SIZE / LOCATION.** Fixed hull grids per ship class; fleets of multiple ships split roles. Every system (O2, CO2 scrubbing, temperature, power) has spatial coverage.

**Minute-to-minute.** Watching crew live their shipboard lives, managing away missions, mood triage, logistics between fleet ships. **Takeaway for us:** Space Haven proves the RimWorld+ONI hybrid works on a space vessel — and that travel/jumping is a natural variance engine a static station lacks.

---

### 9. Startopia (Mucky Foot, 2001) — literally the space-station CEO game

**The point.** Take over a derelict toroidal station and turn it into a profitable, popular galactic hub — economic targets, conversion goals, or territorial conquest per mission, plus sandbox ([Wikipedia](https://en.wikipedia.org/wiki/Startopia)). This is the closest existing realization of "space-station CEO."

**Engagement.** Dungeon Keeper DNA (GameSpot: "plays like a refined and expanded Dungeon Keeper… relocated to deep space" — [review](https://www.gamespot.com/reviews/startopia-review/1900-2777124/)): build facilities, hire alien species as staff (each species suited to particular jobs — Groulien workers, medical Zedem monks, security Kasvagorians), and serve visitor needs so they *spend*. Direct manipulation inherited from Bullfrog: a cursor-hand that drags crates and droids around the world.

**Randomness.** The visitor stream arriving by shuttle (who docks, what they need, how much Energy they carry), rival administrators sharing the same torus, spies, vermin infestations, trader ships.

**Core loop.** Spend Energy to open the next bulkhead sector → build rooms → attract/serve visitors → visitors convert needs into Energy income → expand further along the torus toward rivals. Two brilliant structural devices: (a) **Energy is both currency and life-force** — money and survival unified in one resource; (b) **bulkhead-quantized expansion** — growth happens in discrete, dramatic sector-unlock decisions rather than continuous sprawl.

**Why build WHERE.** Three decks with different physics and purposes: **Sub/Engineering deck** (industry, recycling, logistics), **Pleasure deck** (commerce and entertainment), **Bio deck** (a terraformable organic garden — temperature/humidity/terrain sculpting for crops and recreation) ([Wikipedia](https://en.wikipedia.org/wiki/Startopia)). Within a deck: torus adjacency — expanding toward a rival's sectors creates friction/conflict; facilities near berths catch visitors first; Scuzzer droid reach determines maintenance coverage.

**SIZE / LOCATION.** Sector bulkheads quantize territory; deck assignment constrains building type; room footprints are drawn then furnished.

**Minute-to-minute.** Watch peeps mill about; drag a crate to a factory; slap down a droid where trash accumulates; monitor visitor happiness; trade with docked ships; skirmish with a rival. **Takeaways for us:** the torus/deck structure is a ready-made answer to "why WHERE" on a station; Energy-as-life is thematic gold; the visitor stream is the intake-lottery variance device adapted to a station.

---

### 10. Spacebase DF-9 (Double Fine, 2014) — the cautionary tale

**What it was supposed to be.** Dwarf Fortress in space (the name says it). What shipped after Early Access collapsed was a shallow sandbox, abandoned at "1.0" with most planned features cut ([Wikipedia](https://en.wikipedia.org/wiki/Spacebase_DF-9), [PC Gamer](https://www.pcgamer.com/tim-schafer-explains-spacebase-df-9s-v1-0-release/)).

**Why it failed as a game (not just as a production).** The postmortem details are damning and *directly relevant to our redesign*:
- **No foundational systems first**: "reactors used to power your base, which is a basic requirement, didn't make it into the alpha until the last build" ([Game Wisdom](https://game-wisdom.com/critical/lessons-early-access)). They built peripheral content atop a base that had no power loop.
- **Sim too shallow to generate stories**: citizens had needs too thin to produce RimWorld-style drama; without deep agents or physics, nothing emergent happened — nothing to watch, nothing to retell.
- **No escalation or goal arc**: no storyteller, no pressure curve → the sandbox went inert once built out.
- **Production lessons**: open-ended revenue-driven plan, studio split across four other games, months of communication silence ([Kotaku](https://kotaku.com/double-fine-struggles-show-the-problems-with-steam-earl-1637669234)). Contrast Prison Architect's locked core loop + one-system-per-month transparency.

**The lesson in one line:** a station sim without (a) external pressure and (b) agents deep enough to watch is *exactly* the "website feeling" — menus stretched over a dead diorama. Spacebase DF-9 is what our game must not be, and it failed on the very axes the owner is worried about.

---

### 11. RimWorld: Odyssey DLC (Ludeon, 2025) — the base becomes the avatar

**What it adds.** The **gravship**: your colony becomes a flyable vehicle. Build a grav engine + substructure + thrusters + fuel tanks, and your base lifts off and lands anywhere on the planet — eventually beyond it ([RimWorld Wiki: Gravship](https://rimworldwiki.com/wiki/Gravship), [dbltap review](https://www.dbltap.com/reviews/rimworld-odyssey-review)).

**Design significance (three lessons):**
1. **It fixes settle-and-stagnate.** Classic RimWorld's late game goes quiet once the base is fortified. A mobile base means the *world* keeps generating novelty — land at hostile landmarks, extract rare resources, leave before the reprisal ([colonysimgames guide](https://colonysimgames.com/article/rimworld-gravship/)). Travel is a variance pump bolted onto a story generator.
2. **Substructure economics force dense layout.** Every tile of flyable floor costs; fuel burns ~10 chemfuel per world tile. Suddenly RimWorld players — who sprawl by habit — design tight, ship-like bases where "power, storage, living space, and defense remain functional while in transit." Constraint produced better architecture.
3. **The base becomes the avatar.** You invest in ONE persistent home that travels with you — the emotional inversion of Against the Storm (where cities are disposable and the *meta* persists). Both solve builder-staleness; they pick opposite poles of attachment.

---

### 12. Stationeers (RocketWerkz, 2017–) — the far pole of simulation depth

**The point.** Survive on a hostile world by *engineering*, first-person, wrench in hand: atmospherics simulated to individual pipe pressures, gas mixtures, combustion; electrics to circuits and programmable logic chips. Self-described as "designed for hardcore players who want a game that is systems oriented," where mastery "requires great knowledge and practice" ([Steam](https://store.steampowered.com/app/544550/Stationeers/), [Atmosphere wiki](https://stationeers-wiki.com/Atmosphere)).

**Engagement / loop.** Need → design a system → build it by hand → debug it (the game *is* debugging: a mis-set valve suffocates you). Randomness is minimal — planet choice; the physics is the antagonist.

**Why build WHERE / SIZE.** Pure physics: gas volumes and pressure differentials, pipe network topology, solar panel angles, insulation, day/night thermal swings.

**The lesson.** Stationeers is the control group for Sylvester's dictum. It chose *maximal* simulation with minimal legibility scaffolding and got a small, devoted, expert audience. It's the proof that sim depth alone doesn't scale to a broad game — depth must be paid for with readability (ONI's overlays, RimWorld's alerts) or it prices out everyone but engineers.

---

### Briefer instructive cases

**Against the Storm (Eremite, 2023) — the existence proof that builders don't have to get solved.**
Point: complete the Queen's orders to earn reputation and win the run (~2h) before hostility overwhelms; between runs, permanent upgrades to the Smoldering City, and the world map periodically resets ([Eremite devlog](https://eremitegames.com/devlog-4-meta-progression-new-biome-and-more/)). Core design coup: **"the city is your avatar"** — reframing the settlement itself as the roguelite protagonist "opened a floodgate of mechanics… familiar to players but not common in the city builder genre" (designer Michał Ogłoziński, [GameDeveloper](https://www.gamedeveloper.com/business/how-against-the-storm-managed-to-mix-city-building-and-roguelite-play)). Variance is *manufactured by drafting*: random blueprint offers, species mixes with distinct needs, map modifiers, glade events, Queen's orders. Short runs mean tools can be "ridiculous, overpowered, and very situational" without breaking balance. And the key line for the genre's core disease: the game "congratulates the player, gives them their rewards, and sends them away **before the sweet taste of steamrolling through the challenges can turn into bitter boredom**." Even the fiction is load-bearing: the Queen character exists to make a timer feel like a character, "aligning fiction and mechanics… hid the crude nature of the latter."

**Factorio (Wube, 2016) — legible logistics as compulsion.**
Point: launch the rocket / the factory must grow. Loop: need X-per-second → build production → consumption reveals an upstream bottleneck → rebuild bigger. The game guarantees a permanently visible TODO list because **everything is physical**: items ride belts you can see, so a bottleneck is a *visibly starving belt*, not a red number. That total legibility is why a logistics game feels tactile rather than spreadsheety, and why it's addictive: "Factorio players see processes that could be automated" the way Tetris players see falling blocks ([The Diff](https://www.thediff.co/archive/the-factorio-mindset/), [deprocrastination case study](https://www.deprocrastination.co/blog/case-study-why-you-should-play-factorio), [arXiv formalization](https://arxiv.org/abs/2102.04871)). WHERE: ore patch locations, belt geometry, pollution cloud vs. biter nests, water for power. Variance is low-moderate (map seed); the endless ladder of scale does the replay work.

**Two Point Hospital (Two Point, 2018) — light management carried by charm and flow.**
Point: 3-star each level's hospital (campaign chunking — a builder as a *level-based* game, worth noting). Loop: place diagnosis/treatment rooms → patient stream flows through → queues expose flow problems → rearrange, staff up. WHERE: adjacency for patient flow (GP near reception, diagnosis near treatment), corridor capacity, room prestige. Its real lesson is tone-as-engagement: illnesses are sight gags (Light-headedness = a literal lightbulb head), the PA system cracks jokes, patients visibly bumble — comedy doubles as **readable cause-effect** ([Wikipedia](https://en.wikipedia.org/wiki/Two_Point_Hospital), [PCWorld](https://www.pcworld.com/article/402530/two-point-hospital-review.html)).

**Timberborn (Mechanistry, 2021–) / Banished (Shining Rock, 2014) — one strong external cycle creates rhythm.**
Timberborn: beaver colonies engineer dams, aqueducts, and reservoirs against recurring **droughts and toxic badtides** — "streams dry up from the source downward; any crops without stored irrigation die" ([FinalBoss](https://finalboss.io/timberborn-makes-droughts-more-exciting-than-most-city)). Everything ties back to water: agriculture, power (water wheels), layout, verticality ([Invision review](https://invisioncommunity.co.uk/timberborn-review-best-beaver-city-builder-with-water-management/)). The wet/dry cycle gives the sandbox a **heartbeat**: prepare → get tested → recover → improve. Banished is the same shape with winter, plus scarcity-RNG (harvests, disease, nomads) — and its famous fragility: one bad decision cascades into a death spiral of starvation. Lesson: a single, legible, periodic external pressure does more for engagement than ten background systems.

**Anno 1800 (Ubisoft Mainz, 2019) — the needs-ladder and geography-forced trade.**
Point: ascend population tiers (farmers → workers → artisans → engineers → investors); each tier's residences demand new goods, each good needs a chain: "raw resource → processed intermediate → final consumer good" ([Chill Place explainer](https://chillplacegaming.com/anno-1800-supply-chains/)). The spatial hook is the **island fertility lottery**: no island can produce everything, so multi-island logistics and trade routes are *forced by geography* — "stop seeing each island as self-contained and start seeing the whole map as one interconnected production system." The needs-escalation ladder is the cleanest progression spine in the economic-builder family. Minute-to-minute: ratio balancing, route planning, beautification ([Wayward Strategy review](https://waywardstrategy.com/2020/01/16/anno-1800-review/)).

---

## PART 1E — EXPANSION PASS (added 2026-07-18): space-colony sims + the two ur-games

*Added at owner request: the space-colony cousins were under-explored, plus SimCity (the origin of "why build where") and Tropico (the origin of "you are a character"). Same 7-question treatment, plus archetype placement, variance engine, and a steal-line for our station.*

### E1. Surviving Mars (Haemimont/Paradox, 2018) — sponsor-drafted frontier logistics

**The point.** Found humanity's first Mars colony, keep the founders alive, and reach self-sufficiency; sandbox with an optional late-game **Mystery** storyline as an authored arc.

**Engagement.** A deliberate **two-phase structure**: phase one is robots-only — "place the pre-fabricated drone hub… solar panels, connect them up with power lines, find a source of concrete" ([TheSixthAxis review](https://www.thesixthaxis.com/2018/03/15/surviving-mars-review/)) — pure logistics with nothing living at risk. Phase two lands humans in domes, and stakes appear. This is a masterful onboarding ramp: learn the infrastructure game before the mortality game.

**Randomness.** A stacked *chosen* draft plus map lottery: **Sponsor** (nation/corporation determines funding, rockets, science rate, unique perks — "India allows Medium Domes without research, Europe gives funding per tech" — [NoobFeed review](https://www.noobfeed.com/reviews/surviving-mars-pc-review)); commander profile (a second trait pick); landing-site selection (resource richness vs. disaster rates — difficulty is *geographic*); the colonist **applicant pool** with traits/flaws you filter; and **Mysteries** — drafted sci-fi event-chains (alien spheres, AI, plagues) with "no defined solution… you decide the best course of action."

**Core loop.** Scan sectors → extract → extend cables/pipes/drone coverage → import what Mars can't make (rockets = an umbilical to Earth you gradually cut) → land colonists → specialize them → research toward independence.

**Why build WHERE.** Terrain scanning reveals deposits; **domes only employ colonists within a work radius**, so dome siting = choosing which deposits/industries that micro-society can service; **drone hubs have service radii** that define maintainable territory ([NoobFeed](https://www.noobfeed.com/reviews/surviving-mars-pc-review)); cables/pipes fail and leak with distance (maintenance tax on sprawl).

**SIZE / LOCATION.** Dome sizes (basic → mega) gate which buildings fit inside; each dome is a semi-closed micro-colony needing its own services — the recurring "many small domes vs. few big domes" argument is the game's central sizing debate ([Paradox wiki: Domes](https://survivingmars.paradoxwikis.com/Domes)).

**Minute-to-minute.** Drone logistics watching, rocket scheduling, maintenance triage, applicant filtering (criticized as "awkward and time consuming"), research picks. Known weakness: a mid-game lull once stable, and "the colony info panel is too basic" for sprawl ([TheSixthAxis](https://www.thesixthaxis.com/2018/03/15/surviving-mars-review/)) — sponsors/mysteries exist precisely to patch the variance gap.

**Archetype:** #4 macro organizer with #3 coverage-logistics bones and a genuine #6 layer (sponsor/commander/mystery drafting). **Variance engine:** the pre-run draft stack + map/disaster lottery + applicant pool.
**Steal for our station:** the **sponsor draft** — who bankrolls your station (corp, government, church, cartel) as a run-defining pick that changes rules, goals, and bonuses; plus radius-based work assignment as clean WHERE-logic; plus the robots-first onboarding phase.

### E2. Planetbase (Madruga Works, 2015) — the survival chain, and its ceiling

**The point.** Keep a small colony alive on a hostile planet; population/milestone goals. Survival-first, thin simulation.

**Engagement.** Place connected modules — the base is a **corridor graph, not a field**; everything must link through corridors and airlocks. Assign roles, gate arrivals via the landing pad.

**Randomness.** Planet choice (difficulty tiers), the arrival stream (ships bring colonists, traders, visitors — and occasionally armed intruders), disasters (meteors, sandstorms, solar flares).

**Core loop.** The canonical survival chain, stated perfectly by [TechRaptor](https://techraptor.net/gaming/reviews/planetbase-review-colonies-surviving-catastrophies): oxygen needs a generator, the generator needs water, water needs power, power needs storage, and you need an airlock to even enter — "the opening of every game becomes a race against time." Expand a module → strain the chain → reinforce → accept more colonists → repeat.

**Why build WHERE.** Connection topology and **airlock traffic engineering**: colonists "choose which airlock to use based on total trip time, *including time spent waiting for the airlock to cycle*; if the closest airlock has a long queue, they use a farther one" ([Planetbase wiki](https://planetbase.fandom.com/wiki/Tips)) — queueing theory made spatial. Solar/wind siting; landing pad adjacency.

**SIZE / LOCATION.** Module size picked at placement (bigger = more capacity and air volume); interiors furnished on a grid.

**Minute-to-minute.** Watching the oxygen/water/power dials, gating arrivals, prioritizing bots. And that's the problem: agents have needs but no personalities, there is no escalation director, and once the chain is stable the game goes flat — the widely-shared criticism ([XBLAFans](https://xblafans.com/planetbase-review-solid-base-building-frustrating-package-94565.html)).

**Archetype:** #3-lite (survival-chain engineering) with a thin #2 arrival stream. **Variance engine:** arrivals + disasters — one channel too few.
**Steal for our station:** **airlocks/docks as visible queueing chokepoints** (trip-time-aware agents make congestion legible and layout meaningful), and the corridor-graph topology — on a station, *connection topology is the map*. Equally important as a warning: Planetbase is the mini Spacebase DF-9 — survival chain without drama-agents or escalation plateaus fast.

### E3. Aven Colony (Mothership, 2017) — competent, shallow, forgettable: a diagnostic

**The point.** Campaign of missions growing colonies on an alien world ("governor of humanity's first extrasolar settlement" — [PlayStation Blog](https://blog.playstation.com/2017/04/06/surviving-aven-prime-merging-sci-fi-and-city-building-in-aven-colony/)); per-map win conditions.

**Engagement.** SimCity-like tile zoning/building + survival overlays (food, air, morale), buildings linked by tunnels, seasonal cycles (winter kills crops), and alien threats — most distinctively **the creep**, an alien fungus replacing fire as the spreading-hazard mechanic, countered by scrubber drones and plasma turrets ([Muddy Colors design writeup](https://www.muddycolors.com/2018/06/game-mechanics-and-world-building-with-aven-colony/)).

**Randomness.** Modest: per-map biomes and threat mixes; mostly authored campaign variance.

**Core loop.** Build → farm in season → survive winter → expand → repel threat waves → hit milestone → **referendum**: colonists periodically *vote* on your leadership, and promotion/progress gates on approval — elections as a progress beat.

**Why build WHERE / SIZE.** Biome tiles (fertile ground, geothermal vents, lightning zones for lightning-capture towers), creep-spore approach paths → turret placement, tunnel connectivity. Building tiers/upgrades set density.

**Minute-to-minute.** Reading a dozen overlays, policy tweaks, watching seasons turn. Verdict per reviews: "gets all the expected core mechanics right, but the new ideas feel a little undercooked" ([COGconnected](https://cogconnected.com/review/aven-colony-review/), [Third Coast](https://thirdcoastreview.com/2017/07/31/game-review-aven-colony)).

**Archetype:** #4-lite with #5 seasoning (seasonal pressure). **Variance engine:** weak — and that's the diagnostic value: Aven Colony has *all seven of the owner's questions answered adequately* and still lands forgettable, because no channel (agents, physics, drafts, intake) is deep enough to generate stories.
**Steal for our station:** the **referendum/approval-vote progress gate** (the station's population periodically judges the CEO — a legible social-pressure milestone), and hard seasonal/external cycles.

### E4. SimCity (Maxis, 1989→SC4 2003) — the ur-answer to "why build WHERE"

**The point.** Wright's framing: no win state — "an undeveloped field, cash, and basic planning tools," a sandbox for intuition about complex systems: "How do we take these big complex things we're embedded in, and bring them into such a focus that we can apply our natural instincts and intuitions to it?" ([Reason: SimCity created a generation of urban planners](https://reason.com/2020/02/09/simcity-created-a-generation-of-urban-planners/)).

**Engagement.** Zone R/C/I, lay infrastructure, set budgets/ordinances, watch the sim respond; advisers and citizen complaints narrate the state.

**Randomness.** Almost none (disasters are optional — famously player-*triggerable*, a toy not a threat). All variance is self-authored; the map is a canvas.

**Core loop.** The **RCI feedback triangle**: "demand for one zone is generated by the other two" — residents need jobs, businesses need customers and workers — read the three demand meters, zone to satisfy, infrastructure strains, budget rebalances, repeat ([Simtropolis SC4 demand reference](https://community.simtropolis.com/omnibus/simcity-4/reference/demand-desirability-and-abandonment-r31/)).

**Why build WHERE — the original codification.** Desirability as **overlapping spatial fields**: land value gradients (water/parks/views up, pollution/crime down), service coverage radii (fire/police/school), pollution drift, commute distance to jobs. Every later builder's WHERE-logic (Skylines' coverage, Anno's fertility, even RimWorld's beauty radii) descends from this field-overlap model.

**SIZE / LOCATION.** Zone density tiers; budget throttles pace; plopped civic buildings with footprints and radii.

**Minute-to-minute.** Reading demand meters and overlay maps, micro-adjusting zones, answering advisors.

**Archetype:** #4, the founder — and the origin of the archetype's disease (solved-city stasis).
**Steal for our station:** the **visible demand triad** — two or three always-on-screen meters saying what the station's economy wants *right now* (crew? cargo capacity? entertainment?) is the cheapest possible "the world has its own agenda" device; and desirability-as-overlapping-fields is a clean, cheap WHERE model for a 2D grid.

### E5. Tropico (PopTop/Kalypso, 2001–) — the player as a character; politics as the sim

**The point.** *Stay in power* on a banana-republic island until scenario end — and get rich doing it: alongside the treasury there's your personal **Swiss bank account**, a private corruption score. Crucially, you don't play a cursor: you *are* **El Presidente**, a created character whose chosen background, strengths, and flaws "affect the attitudes of factions and superpowers… and alter costs of in-game actions" ([Wikipedia: Tropico](https://en.wikipedia.org/wiki/Tropico_(video_game))).

**Engagement.** City-building fused with opinion management: **every citizen is simulated with needs AND political views**, aligned into factions (communists, capitalists, religious, militarists, environmentalists, intellectuals) with *contradictory* demands — "capitalists demand industry and low crime, communists prioritize housing, healthcare, rations" ([Tropico 4 analysis](https://en.wikipedia.org/wiki/Tropico_4)). Superpowers (US/USSR) loom over foreign policy.

**Randomness.** Island maps, the El Presidente trait draft, faction/opinion dynamics, world events, scenario mandates — and the drumbeat of **elections**: hold them free (respect boost, real risk of losing office), rig them, or cancel them (discontent spike, coup risk). "Ideological purity undermines stability — realpolitik proves essential for retaining power."

**Core loop.** Build economy (plantations → factories → tourism) → income → placate factions with buildings and edicts → election approaches → promise/deliver/rig → survive → govern with bigger contradictions next term. Elections are the genre's best **periodic political pressure cycle** — Timberborn's drought, but made of people's opinions of *you*.

**Why build WHERE / SIZE.** Terrain fertility per crop, port/dock access, tourist beach zoning, housing near workplaces (commutes affect effectiveness and happiness), palace guards vs. coup risk. Wages/budgets set per building; edicts as global modifiers.

**Minute-to-minute.** Reading faction leaders' demands, browsing the citizen almanac (every citizen inspectable, *with their opinion of you*), issuing edicts, bribing rivals, watching treasury vs. Swiss account.

**Archetype:** hybrid #2/#4 with a unique twist — the chaos being contained is **political opinion**, and the intake stream is the ballot box. **Variance engine:** faction dynamics × elections × leader-trait draft × scenario mandates.
**Steal for our station:** the biggest single idea in this pass — **personify the player**. A station CEO as a drafted character (background/traits that change faction attitudes and action costs), stakeholder factions with contradictory demands (crew union, corporate board, traders, colonists), periodic judgment beats (board reviews/elections), and a private score (the CEO's own account) alongside the station's. Tropico proves "management sim where YOU are a character" is a proven, beloved shape — and it's almost absent from the space-colony shelf.

### E-Synthesis — what the expansion pass changes

**1. A variance channel we under-weighted: STAKEHOLDER / MANDATE variance.** Part 2A identified agents, maps, intake, and drafts as variance engines. The expansion games reveal a fifth, running through all of them: **pressure from characters with agendas** — Surviving Mars' sponsors, Tropico's factions and elections, Aven Colony's referendums, and retroactively Against the Storm's Queen and Frostpunk's citizen demands. It is cheap to build (no physics required — it's content + counters), naturally *narrative* (pressure arrives as a face saying words, which is exactly the game-not-website texture Part 2B calls for), and it fits a station CEO perfectly: patrons, boards, unions, and inspectors are who a CEO actually answers to.

**2. The CEO fantasy wants a personified player.** Startopia gave us the station-as-facility; Tropico shows the missing half — the CEO as a *drafted character* with traits, reputations, and a private agenda. Archetype 2's "warden fantasy" sharpens into: *you are somebody specific, and everyone on the station has an opinion about you.*

**3. The Spacebase warning now has three data points.** Spacebase DF-9, Planetbase, and Aven Colony all answer the seven questions "adequately" and all plateau — because survival chains + thin agents + weak escalation generate no stories. Competence across all seven questions is not sufficient; at least one variance channel must run *deep*.

**4. Two ready-made WHERE mechanisms for a 2D station.** SimCity's overlapping desirability fields (cheap, provenly legible) and Planetbase's trip-time-aware airlock/dock queueing (makes congestion visible and layout consequential). Both are canvas-friendly and neither requires an ONI-class physics sim.

### Expansion-pass placement matrix

| Game | Archetype | Variance engine | One steal for our station |
|------|-----------|----------------|---------------------------|
| Surviving Mars | #4 + #3 bones + #6 draft layer | Sponsor/commander/mystery draft × landing-site lottery × applicant pool | Sponsor draft: who bankrolls the station defines the run |
| Planetbase | #3-lite + thin #2 | Arrival stream + disasters (one channel too few) | Trip-time-aware airlock/dock queueing; corridor-graph topology |
| Aven Colony | #4-lite + #5 seasoning | Weak (authored campaign) | Referendum: population periodically votes on the CEO |
| SimCity | #4 (founder) | ~None (self-authored) | Visible demand triad; desirability as overlapping fields |
| Tropico | #2/#4 hybrid (political) | Factions × elections × leader-trait draft | Personified CEO character + stakeholder factions + judgment beats + private score |

---

## PART 2A — THE TAXONOMY

Grouping by **decision structure** — what kind of decision the player is actually making, what makes it fun, and where the variance comes from. Six archetypes:

| # | Archetype | Games | Core decision structure | Source of FUN | Source of VARIANCE |
|---|-----------|-------|------------------------|---------------|--------------------|
| 1 | **Pawn-driven story generators** | RimWorld, Dwarf Fortress, Space Haven, (Odyssey doubles down) | Indirect control of autonomous individuals; triage when the event director strikes | Attachment + drama; the anecdote factory ("remember when the pyromaniac doctor…"); losing is content | Agent lottery (traits) × event director (storyteller) × map gen |
| 2 | **Throughput-of-chaos operations sims** | Prison Architect, Startopia, Two Point Hospital, Tropico (political variant — the chaos is opinion, the intake is the ballot box), (Dungeon Keeper / Theme Hospital lineage; Spacebase DF-9 tried and failed) | Architect a facility that *processes a flow* of semi-autonomous, unpredictable people you don't control | Watching your machine digest chaos; incidents stress-test your design; the warden/CEO fantasy | The intake stream (who arrives, with what hidden traits/needs) + escalating acuity |
| 3 | **Physics/logistics engineering puzzles** | ONI, Factorio, Stationeers, Timberborn, Planetbase (thin — the cautionary floor) | Engineer against a lawful simulated world; solutions are spatial machines; every solution emits a byproduct problem | Mastery and elegance; "I built that and it RUNS"; visible cause-effect | Map/geology seed (geysers, ore, terrain); low agent variance |
| 4 | **Macro economic organizers** | SimCity (the founder), Cities: Skylines, Anno 1800, Songs of Syx (late-game), Surviving Mars, Aven Colony | Aggregate flows, ratios, networks; individuals become statistics | Scale spectacle + optimization; the organism hums | Geography lottery (fertilities/terrain) + self-inflicted accretion; **weakest run-to-run variance in the genre** |
| 5 | **Authored pressure-cookers** | Frostpunk, (Banished-adjacent; This War of Mine cousin) | Scripted escalation forces resource tradeoffs with moral weight; finite scenario; the ending judges you | Tension, sacrifice, narrative consequence | Low by design; replay via scenarios and "what kind of leader will I be" |
| 6 | **Roguelite drafted builders** | Against the Storm (pioneer); ONI's Printing Pod and Odyssey's travel are micro-doses | Adapt to a *dealt hand* — blueprints, species, modifiers, orders — under a run clock | Buildcraft; "make this hand work"; completion payoff every ~2h | **Manufactured** by drafting — the strongest, most controllable replay engine in the genre |

**Prose observations.**

*The archetypes compose; the hits are hybrids.* RimWorld = 1 with a dash of 3 (temperature/defense geometry). ONI = 3 with micro-doses of 1 (dupe charm) and 6 (Printing Pod drafts). Against the Storm = 6 wrapped around a lightweight 4. Songs of Syx *transitions* from 1 to 4 as you scale. The genre's evolutionary direction is clear: pure archetypes (Skylines' pure-4, Stationeers' pure-3) plateau with niche or solvable experiences; hybrids that pair a *fun source* with a *variance engine* from another archetype dominate.

*Fun source and variance source are separable — and that's the design insight.* Archetype 1 gets variance from agents+events, 3 from maps, 6 from drafts, 2 from intake. When the owner asks "what randomness keeps this engaging?" the taxonomy answer is: pick at least TWO independent variance channels (e.g., who arrives + what the map/draft dealt you), because single-channel games (Skylines) get solved. *(Expansion-pass addendum: there is a fifth channel the original pass under-weighted — **stakeholder/mandate variance**: sponsors, factions, elections, referendums, the Queen's orders. Pressure delivered by characters with agendas. See PART 1E synthesis.)*

*Where a space-station CEO fantasy lives.* The closest archetypes are:
- **#2 Throughput-of-chaos** — the primary frame. A station is a facility processing flows: docking ships, visitors, cargo, contracts, trouble. Startopia already proved this shape on a literal torus station; Prison Architect proved layout-as-security-design; Two Point proved charm carries light management. The CEO fantasy *is* archetype 2.
- **#1 Pawn story-generator** — the crew layer. A small named crew with traits/moods/relationships supplies attachment and anecdote (Space Haven's proven space adaptation). Without this layer you get Spacebase DF-9: a facility with nobody worth watching.
- **#6 Roguelite drafting** — the variance engine. Contracts/orders from a central authority (Against the Storm's Queen → a sector corporation), drafted blueprints/crew candidates (ONI's pod), arriving-ship lotteries. This is the cheapest, most controllable way to make runs differ.
- **#3 supplies the WHERE-logic**, not the identity: atmosphere/heat/power gradients (ONI/Space Haven-lite) are what make station *layout* meaningful rather than cosmetic.

*The two structural anti-staleness devices worth stealing outright:* Against the Storm's bounded run ("send them away before steamrolling turns into boredom") and Timberborn/Frostpunk's periodic external pressure cycle (drought / cold spike) that turns a sandbox into prepare→test→recover heartbeats. Startopia's bulkhead-quantized expansion is a third: growth as discrete dramatic decisions, not continuous sprawl.

---

## PART 2B — WHAT MAKES THEM FEEL LIKE A GAME, NOT A SPREADSHEET

**The diagnosis first.** A management game feels like a website when: interactions are *forms* (select from a list, click confirm); state changes are instant and silent (no travel time, no animation, no sound); nothing moves unless you touch it; and the world is presented as UI panels *about* a place rather than a camera pointed *at* a place. The genre's masters all violate every one of those, deliberately. Game feel is "the tactile virtual sensation experienced when interacting with video games" ([Game feel, Wikipedia](https://en.wikipedia.org/wiki/Game_feel); Steve Swink's ["Game Feel: The Secret Ingredient"](https://www.gamedeveloper.com/design/game-feel-the-secret-ingredient)) — and management sims have their own specific toolkit for it:

### The techniques, from the research

**1. Watchable agents executing your orders (the single biggest one).**
In RimWorld, PA, ONI, Startopia, and Two Point, every click becomes an *order that a visible creature walks over and performs*. The latency between order and execution is not a defect — it's the management fantasy itself (you direct, they do). Dupes' hand-drawn animation and "comical reactions soften the mood" ([Klei animation/sound stream](https://kleiforums.com/forums/topic/79409-rhymes-with-play-oxygen-not-included-animation-and-sound-design/)); Skylines lets you follow one cim across the whole macro sim; Adams builds the entire game on dwarves being "actors in their own stories." Spacebase DF-9 is the negative proof: agents too shallow to watch = dead diorama.

**2. Direct manipulation of the world, not menus.**
The Bullfrog lineage: Dungeon Keeper's **Hand of Evil** picks up creatures, drops them, and *slaps them to work faster* — physical, cheeky, and mechanically meaningful (slapped creatures work at double speed but lose health/happiness) ([Dungeon Keeper wiki](https://dungeonkeeper.fandom.com/wiki/Hand_of_Evil), [The Register retrospective](https://www.theregister.com/on-prem/2014/09/12/slap-my-imp-up-bullfrogs-dungeon-keeper/)). Startopia inherited the cursor-hand for crates and droids. The modern equivalent: drag-rectangles to designate (mine/zone/build in DF, RimWorld, PA, ONI), drag paths for belts/roads, ghost previews that follow the cursor, red-tint invalid placement, snap-to-grid ticks. The cursor must act **in the world**, on world objects, not in a sidebar.

**3. Numbers rendered as matter.**
Factorio's items physically ride belts — a bottleneck is a starving belt you can *see*. PA's contraband is physically carried by a specific prisoner from a specific kitchen. ONI's gases visibly drift and pool. When resources are objects with positions instead of counters, cause-effect becomes cinema. (This also makes debugging-your-base gameplay, not spreadsheet auditing.)

**4. X-ray overlays that prove the sim is real.**
ONI's oxygen/temperature/plumbing/germ overlays, Skylines' traffic/pollution heatmaps, PA's danger map. Overlays are the readable window onto invisible systems — they *are* UI, but diegetic-feeling UI painted onto the world, not a table beside it. They flatter the player ("I can read the matrix") and legitimize the simulation.

**5. Cause→effect legibility, with animation time.**
Sylvester's law — players "don't actually want as much simulation as they think they do"; they want *drama they can understand and influence* ([GameDeveloper](https://www.gamedeveloper.com/design/how-i-rimworld-i-fleshes-out-the-i-dwarf-fortress-i-formula)). When a policy changes, the player should be able to watch behavior change. Two Point's sight-gag illnesses are readability devices as much as jokes.

**6. Sound as the facility's voice.**
Placement thunks, construction hammering, ambient room-tone that changes as the base grows, alert stingers, Two Point's PA announcements, Startopia's chattering peeps. "Responsive and intuitive feedback is vital… when a player presses a key, they expect the corresponding action to be executed immediately, or at the very least see a visual sign that it has started" ([GameDev Academy](https://gamedevacademy.org/game-feel-tutorial/), [Design the Game on tactile juice](https://www.designthegame.com/learning/tutorial/how-tactile-interactions-game-juice-drive-player-engagement)).

**7. The camera as a body.**
Smooth eased zoom from god-view down to one character; click-an-alert → camera flies to the incident; pan with inertia. Zoom range is emotional range — Skylines' follow-a-cim and RimWorld's zoom-to-the-wounded both convert dashboard events into scenes.

**8. Juice on every interaction.**
The canonical ["Juice it or Lose it"](https://gamejuice.co.uk/resources/juice-it-or-lose-it) method (Jonasson & Purho, 2012): take a gray prototype and layer tweening, easing, squash-and-stretch, particles, sound, and (sparing) screen shake until every state change is felt. All of it applies to placement/completion/destruction events in a builder. Cheap universal wins list: [7 Game Feel Tricks](https://dawnosaur.substack.com/p/7-game-feel-tricks-to-improve-your), [Making Games Juicy](https://abagames.github.io/joys-of-small-game-development-en/make_game_juicy.html).

**9. Time as a held object.**
Pause/1x/2x/3x controls with an audible/visual state change make simulation time something the player *grips*. Every game above has them; a web app has no concept of time at all — this single control instantly reads as "simulation, not website."

**10. Agents emote about your decisions.**
Thought bubbles, mood faces, complaint queues, celebration animations. Feedback delivered *by characters* instead of toasts. Frostpunk's citizens petition you; dupes stress-vomit; prisoners riot. The system's state arrives as behavior, not notification.

### Cheapness ranking for a 2D-canvas web game

**Tier 1 — days, transformative:**
- Ghost preview + drag-rectangle designation with valid/invalid tinting and a snap tick sound
- Tween *everything* (lerp agent movement, ease panel slides, count-up numbers); never teleport state
- Placement/completion sounds + one ambient hum loop + alert stingers
- Agent walk cycles (even 2-frame) + carried-object sprites (a crate in hands converts logistics into theater)
- Thought-bubble emotes over agents (mood, current task)
- Click-alert → eased camera fly-to; smooth zoom wheel
- Sim speed controls (pause/1x/3x) with visual state

**Tier 2 — a week or two, deepens it:**
- Overlay/heatmap modes (canvas gradients: heat, air, power coverage, foot traffic)
- Persistent decals (scorch marks, scuffed floors along walked paths, debris after incidents)
- Shift/day-night lighting tint cycles; idle animations and micro-behaviors (agents chat, drink coffee)
- Incident theater: fights/failures as visible animations with particles, not log entries

**Tier 3 — expensive, only if the design demands it:**
- Real gas/fluid diffusion rendering (ONI-style)
- Rich skeletal animation; physics debris

**The bottom line for section B:** the single biggest lever is **making the simulation watchable — visible agents physically executing the player's direct-manipulation orders**. Drag a rectangle → a named crew member walks over → builds it with particles and a thunk → and later you can watch her eat lunch in the room she built. That chain converts every UI decision into an observable little story. Everything else — juice, sound, overlays, camera — amplifies that core. A management game stops feeling like a website at the exact moment the player stops *operating a dashboard* and starts *watching a place respond to them*.

---

## APPENDIX — Source index (primary)

- RimWorld: [Story Generator analysis](https://zaydqazi.substack.com/p/the-story-generator-a-game-design) · [GameDeveloper on DF formula](https://www.gamedeveloper.com/design/how-i-rimworld-i-fleshes-out-the-i-dwarf-fortress-i-formula) · [Wikipedia](https://en.wikipedia.org/wiki/RimWorld)
- Dwarf Fortress: [GameDeveloper Q&A with Tarn Adams](https://www.gamedeveloper.com/design/q-a-dissecting-the-development-of-i-dwarf-fortress-i-with-creator-tarn-adams) · [Emergent Narrative chapter](https://www.taylorfrancis.com/chapters/edit/10.1201/9780429488337-15/emergent-narrative-dwarf-fortress-tarn-adams) · [PC Gamer GDC 2025](https://www.pcgamer.com/games/sim/dwarf-fortress-dwarves-are-more-human-than-human-creator-says-theyre-allowed-to-embody-bigger-emotions-theyre-allowed-to-make-bigger-mistakes-theyre-allowed-to-do-anything/)
- Prison Architect: [Layered design](https://www.gamedeveloper.com/design/what-prison-architect-teaches-about-layered-game-design) · [The Dark Heart of Every Sim](http://www.playthepast.org/?p=4750)
- Songs of Syx: [PROC3SS: How It Feels To Rule](https://proc3ss.com/reviews/songs-of-syx-how-it-feels-to-rule) · [Save or Quit](https://saveorquit.com/2020/09/21/preview-songs-of-syx/) · [Reality Remake](https://www.realityremake.com/articles/songs-of-syx-review-a-brutally-complex-colony-sim-with-endless-replay)
- Cities: Skylines: [Traffic deep dive](https://www.gamedeveloper.com/design/game-design-deep-dive-traffic-systems-in-i-cities-skylines-i-) · [Springer urban-planning study](https://link.springer.com/chapter/10.1007/978-3-032-02076-5_12)
- ONI: [Layering challenges](https://www.gamedeveloper.com/design/layering-challenges-in-klei-s-survival-sim-i-oxygen-not-included-i-) · [Behind the design](https://www.gamedeveloper.com/design/behind-the-design-of-hit-sim-game-i-oxygen-not-included-i-) · [Klei animation/sound](https://kleiforums.com/forums/topic/79409-rhymes-with-play-oxygen-not-included-animation-and-sound-design/)
- Frostpunk: [Emotional narrative analysis](https://www.gamedeveloper.com/design/frostpunk-an-analysis-of-emotional-narrative-engagement) · [PC Gamer on hope/laws](https://www.pcgamer.com/frostpunk-developers-on-hope-misery-and-the-ultimately-terrifying-book-of-laws/) · [Grim without dark comedy](https://www.gamedeveloper.com/design/making-i-frostpunk-i-grim-without-descending-to-dark-comedy)
- Space Haven: [Bugbyte official](https://bugbyte.fi/spacehaven/) · [PC Gamer preview](https://www.pcgamer.com/space-haven-is-a-promising-management-sim-about-interstellar-vagrants/)
- Startopia: [Wikipedia](https://en.wikipedia.org/wiki/Startopia) · [GameSpot review](https://www.gamespot.com/reviews/startopia-review/1900-2777124/)
- Spacebase DF-9: [Game Wisdom lessons](https://game-wisdom.com/critical/lessons-early-access) · [Kotaku](https://kotaku.com/double-fine-struggles-show-the-problems-with-steam-earl-1637669234) · [PC Gamer](https://www.pcgamer.com/tim-schafer-explains-spacebase-df-9s-v1-0-release/) · [Wikipedia](https://en.wikipedia.org/wiki/Spacebase_DF-9)
- RimWorld Odyssey: [Gravship wiki](https://rimworldwiki.com/wiki/Gravship) · [dbltap review](https://www.dbltap.com/reviews/rimworld-odyssey-review) · [colonysimgames guide](https://colonysimgames.com/article/rimworld-gravship/)
- Stationeers: [Steam](https://store.steampowered.com/app/544550/Stationeers/) · [Atmosphere wiki](https://stationeers-wiki.com/Atmosphere)
- Against the Storm: [GameDeveloper interview](https://www.gamedeveloper.com/business/how-against-the-storm-managed-to-mix-city-building-and-roguelite-play) · [Eremite devlog on meta](https://eremitegames.com/devlog-4-meta-progression-new-biome-and-more/) · [Escapist on roguelite limits](https://www.escapistmagazine.com/against-the-storm-highlights-and-breaks-the-limitations-of-modern-roguelites/)
- Factorio: [The Factorio Mindset](https://www.thediff.co/archive/the-factorio-mindset/) · [arXiv: The Factory Must Grow](https://arxiv.org/abs/2102.04871) · [deprocrastination case study](https://www.deprocrastination.co/blog/case-study-why-you-should-play-factorio)
- Two Point Hospital: [Wikipedia](https://en.wikipedia.org/wiki/Two_Point_Hospital) · [PCWorld review](https://www.pcworld.com/article/402530/two-point-hospital-review.html)
- Timberborn/Banished: [FinalBoss on droughts](https://finalboss.io/timberborn-makes-droughts-more-exciting-than-most-city) · [Invision review](https://invisioncommunity.co.uk/timberborn-review-best-beaver-city-builder-with-water-management/) · [Ctrl blog](https://www.ctrl.blog/entry/review-timberborn-colonysim.html)
- Anno 1800: [Supply chains explained](https://chillplacegaming.com/anno-1800-supply-chains/) · [Wayward Strategy review](https://waywardstrategy.com/2020/01/16/anno-1800-review/)
- Surviving Mars (expansion pass): [TheSixthAxis review](https://www.thesixthaxis.com/2018/03/15/surviving-mars-review/) · [NoobFeed review](https://www.noobfeed.com/reviews/surviving-mars-pc-review) · [Paradox wiki: Domes](https://survivingmars.paradoxwikis.com/Domes)
- Planetbase (expansion pass): [TechRaptor review](https://techraptor.net/gaming/reviews/planetbase-review-colonies-surviving-catastrophies) · [Planetbase wiki: Tips (airlock queueing)](https://planetbase.fandom.com/wiki/Tips) · [XBLAFans review](https://xblafans.com/planetbase-review-solid-base-building-frustrating-package-94565.html)
- Aven Colony (expansion pass): [Muddy Colors: mechanics & world building](https://www.muddycolors.com/2018/06/game-mechanics-and-world-building-with-aven-colony/) · [PlayStation Blog design post](https://blog.playstation.com/2017/04/06/surviving-aven-prime-merging-sci-fi-and-city-building-in-aven-colony/) · [COGconnected review](https://cogconnected.com/review/aven-colony-review/) · [Third Coast review](https://thirdcoastreview.com/2017/07/31/game-review-aven-colony)
- SimCity (expansion pass): [Reason: SimCity created a generation of urban planners](https://reason.com/2020/02/09/simcity-created-a-generation-of-urban-planners/) · [SimCity That I Used to Know](https://medium.com/re-form/simcity-that-i-used-to-know-d5d8c49e3e1d) · [Simtropolis SC4 demand/desirability reference](https://community.simtropolis.com/omnibus/simcity-4/reference/demand-desirability-and-abandonment-r31/)
- Tropico (expansion pass): [Wikipedia: Tropico](https://en.wikipedia.org/wiki/Tropico_(video_game)) · [Wikipedia: Tropico 4](https://en.wikipedia.org/wiki/Tropico_4) · [Tropico 6 political support guide](https://steamcommunity.com/sharedfiles/filedetails/?id=1702878108)
- ONI deepening (expansion pass): [Mechanics of Magic: System Game Analysis](https://mechanicsofmagic.com/2025/11/03/system-game-analysis-oxygen-not-included/)
- Game feel: [Swink: The Secret Ingredient](https://www.gamedeveloper.com/design/game-feel-the-secret-ingredient) · [Juice it or Lose it](https://gamejuice.co.uk/resources/juice-it-or-lose-it) · [Game feel (Wikipedia)](https://en.wikipedia.org/wiki/Game_feel) · [Design the Game: tactile juice](https://www.designthegame.com/learning/tutorial/how-tactile-interactions-game-juice-drive-player-engagement) · [7 Game Feel Tricks](https://dawnosaur.substack.com/p/7-game-feel-tricks-to-improve-your) · [Hand of Evil](https://dungeonkeeper.fandom.com/wiki/Hand_of_Evil) · [The Register: Dungeon Keeper retrospective](https://www.theregister.com/on-prem/2014/09/12/slap-my-imp-up-bullfrogs-dungeon-keeper/)
